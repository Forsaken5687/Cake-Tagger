"""Reusable CPU inference and aggregation; no browser or HTTP dependency."""
import concurrent.futures
import ctypes
import hashlib
import json
import math
import queue
import re
import threading
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort

FRAME_BYTES = 448 * 448 * 4


def apply_process_policy():
    """Match Node's per-process Windows QoS without changing priority."""
    if not hasattr(ctypes, 'windll'):
        return 'unavailable'
    class State(ctypes.Structure):
        _fields_ = [('version', ctypes.c_ulong), ('control', ctypes.c_ulong), ('state', ctypes.c_ulong)]
    kernel = ctypes.windll.kernel32
    kernel.GetCurrentProcess.restype = ctypes.c_void_p
    kernel.GetProcessInformation.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_void_p, ctypes.c_ulong]
    kernel.SetProcessInformation.argtypes = kernel.GetProcessInformation.argtypes
    handle = kernel.GetCurrentProcess()
    state = State(1, 0, 0)
    if not kernel.GetProcessInformation(handle, 4, ctypes.byref(state), 12):
        return 'unavailable'
    state.control |= 1
    state.state &= ~1
    if not kernel.SetProcessInformation(handle, 4, ctypes.byref(state), 12):
        return 'unavailable'
    actual = State(1, 0, 0)
    return 'high-qos' if kernel.GetProcessInformation(handle, 4, ctypes.byref(actual), 12) and actual.control & 1 and not actual.state & 1 else 'unavailable'


def resident_bytes():
    if not hasattr(ctypes, 'windll'):
        return None
    class Counters(ctypes.Structure):
        _fields_ = [('cb', ctypes.c_ulong), ('faults', ctypes.c_ulong)] + [(name, ctypes.c_size_t) for name in ['peak', 'working', 'peak_paged', 'paged', 'peak_nonpaged', 'nonpaged', 'pagefile', 'peak_pagefile']]
    counters = Counters()
    counters.cb = ctypes.sizeof(counters)
    kernel = ctypes.windll.kernel32
    kernel.GetCurrentProcess.restype = ctypes.c_void_p
    api = ctypes.windll.psapi.GetProcessMemoryInfo
    api.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong]
    return int(counters.working) if api(kernel.GetCurrentProcess(), ctypes.byref(counters), counters.cb) else None


def resolve_threads(value, capabilities):
    if value == 'auto':
        return capabilities['recommendedThreads']
    if not re.fullmatch(r'[1-9][0-9]*', str(value)):
        raise ValueError('error.invalidAnalysisRuntime')
    count = int(value)
    if count > capabilities['testMaximum']:
        raise ValueError('error.threadLimit')
    return count


def aggregate(frame_scores, policy, threshold=0.4, coverage='majority', excluded_tags=None, limit_results=True):
    """Use the same policy snapshot and float32 label scores as the JS baseline."""
    if coverage not in ('majority', 'brief'):
        raise ValueError('error.invalidTemporalCoverage')
    required = max(2, len(frame_scores) // 2 + 1) if coverage == 'majority' else 2
    excluded = set(['hairy', 'watermark'] if excluded_tags is None else excluded_tags)
    manual = set(policy['manualOnly']) - {'hairy', 'watermark'}
    details = set(policy['details'])
    predicted, uncertain = [], []
    for tag, rule in policy['mapping'].items():
        if tag in manual or tag in excluded:
            continue
        detail = coverage == 'majority' and tag in details
        cutoff = max(0.65, threshold) if detail or tag == 'dance' else threshold
        support_required = max(2, math.ceil(len(frame_scores) / 4)) if detail else required
        groups = [rule] if isinstance(rule, list) else rule['all']
        scores = sorted((min(max(float(frame[index]) for index in group) for group in groups) for frame in frame_scores), reverse=True)
        scores = [score for score in scores if math.isfinite(score)]
        if not scores:
            continue
        support = sum(score >= cutoff for score in scores)
        confidence = (scores[0] + scores[1]) / 2 if len(scores) >= 2 else scores[0]
        row = dict(tag=tag, confidence=confidence, supportingFrames=support)
        if support >= support_required:
            predicted.append(row)
        elif scores[0] >= threshold:
            uncertain.append(row)
    predicted.sort(key=lambda row: -row['confidence'])
    uncertain.sort(key=lambda row: -row['confidence'])
    if limit_results:
        predicted, uncertain = predicted[:20], uncertain[:15]
    return dict(tags=predicted, uncertain=[row['tag'] for row in uncertain], uncertainScores=uncertain, reviewRequired=True)


class Engine:
    """One FIFO queue, one warm ORT session, cancellation between native calls."""
    def __init__(self, model, expected_hash, policy, capabilities):
        with open(model, 'rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != expected_hash:
                raise ValueError('error.nativeModelChecksum')
        self.model, self.expected_hash, self.policy, self.capabilities = str(model), expected_hash, policy, capabilities
        self.power_policy = apply_process_policy()
        self.jobs = queue.Queue(maxsize=capabilities['queueCapacity'])
        self.stopping = threading.Event()
        self.lock = threading.Lock()
        self.pending = {}
        self.session = None
        self.configured_threads = None
        self.worker = threading.Thread(target=self._run, name='cake-python-inference')
        self.worker.start()

    def submit(self, job_id, payload, parallelism, progress=lambda *_: None):
        if not payload or len(payload) % FRAME_BYTES or len(payload) > 48 * FRAME_BYTES:
            raise ValueError('error.invalidModelInputImage')
        threads = resolve_threads(parallelism, self.capabilities)
        future, cancel = concurrent.futures.Future(), threading.Event()
        with self.lock:
            if self.stopping.is_set():
                raise ValueError('analysis.stopped')
            job = (job_id, payload, threads, progress, future, cancel, time.perf_counter())
            if job_id in self.pending:
                raise ValueError('error.nativeInference')
            try:
                self.jobs.put_nowait(job)
            except queue.Full:
                raise ValueError('error.nativeBusy') from None
            self.pending[job_id] = job
        return future

    def cancel(self, job_id):
        with self.lock:
            job = self.pending.get(job_id)
            if job:
                job[5].set()
                # Remove queued work immediately so cancelled requests do not fill the queue.
                with self.jobs.mutex:
                    try:
                        self.jobs.queue.remove(job)
                    except ValueError:
                        return
                    self.jobs.not_full.notify()
                self.pending.pop(job_id, None)
                job[4].set_exception(ValueError('analysis.cancelled'))

    def stop(self):
        with self.lock:
            self.stopping.set()
            for job in self.pending.values():
                job[5].set()
        self.worker.join()

    def _run(self):
        mean = np.array([0.48145466, 0.4578275, 0.40821073], dtype=np.float64)
        std = np.array([0.26862954, 0.26130258, 0.27577711], dtype=np.float64)
        while not self.stopping.is_set() or not self.jobs.empty():
            try:
                job_id, payload, threads, progress, future, cancelled, queued = self.jobs.get(timeout=0.05)
            except queue.Empty:
                continue
            try:
                started, cpu_started = time.perf_counter(), time.process_time()
                queue_seconds = started - queued
                if cancelled.is_set() or self.stopping.is_set():
                    raise ValueError('analysis.cancelled')
                load_start = time.perf_counter()
                if self.session is None or self.configured_threads != threads:
                    self.session = None
                    options = ort.SessionOptions()
                    options.intra_op_num_threads, options.inter_op_num_threads = threads, 1
                    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
                    for key in ['session.intra_op.allow_spinning', 'session.inter_op.allow_spinning']:
                        options.add_session_config_entry(key, '0')
                    self.session = ort.InferenceSession(self.model, options, providers=['CPUExecutionProvider'])
                    self.configured_threads = threads
                timings = dict(modelLoadSeconds=time.perf_counter()-load_start, preprocessSeconds=0.0, inferenceSeconds=0.0, queueSeconds=queue_seconds)
                all_scores = []
                count = len(payload) // FRAME_BYTES
                for index in range(count):
                    if cancelled.is_set() or self.stopping.is_set():
                        raise ValueError('analysis.cancelled')
                    progress(index+1, count)
                    prepare = time.perf_counter()
                    rgba = np.frombuffer(payload, dtype=np.uint8, count=FRAME_BYTES, offset=index*FRAME_BYTES).reshape(448,448,4)
                    # JS computes in double precision then stores float32. Preserve that order.
                    rgb = (rgba[:,:,:3].astype(np.float64)/255.0 - mean)/std
                    data = np.ascontiguousarray(rgb.transpose(2,0,1)[None], dtype=np.float32)
                    timings['preprocessSeconds'] += time.perf_counter()-prepare
                    inference = time.perf_counter()
                    raw = self.session.run(None, {self.session.get_inputs()[0].name:data})[0].reshape(-1)
                    timings['inferenceSeconds'] += time.perf_counter()-inference
                    if raw.size != 5813 or not np.isfinite(raw).all():
                        raise ValueError('error.modelOutput')
                    scores = (1.0/(1.0+np.exp(-raw.astype(np.float64)))).astype(np.float32)
                    all_scores.append(scores.tolist())
                if cancelled.is_set() or self.stopping.is_set():
                    raise ValueError('analysis.cancelled')
                timings.update(cpuSeconds=time.process_time()-cpu_started, workerWallSeconds=time.perf_counter()-started)
                runtime = dict(provider='native-cpu', configuredNativeThreads=threads, inferenceWorkers=1, hardwareConcurrency=self.capabilities['logicalProcessors'], **self.capabilities,
                               threadSpinning=False, runtimeVersion=ort.__version__, modelSha256=self.expected_hash,
                               threadsPerSession=[threads], imageParallelism='single', residentSessions=1,
                               backendImplementation='python', inferenceRssBytes=resident_bytes(), inferenceProcessPowerPolicy=self.power_policy)
                future.set_result(dict(scores=all_scores, timings=timings, runtime=runtime))
            except Exception as error:
                future.set_exception(error)
            finally:
                with self.lock:
                    self.pending.pop(job_id, None)
        self.session = None
