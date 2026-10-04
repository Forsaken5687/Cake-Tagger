import { Worker } from 'node:worker_threads';
import { QUEUE_CAPACITY, computeCapabilities, resolveThreads, executionPlan } from './native-policy.mjs';

// All clients share a FIFO video queue. Inside one video, the thread budget can
// be split across two warmed sessions without multiplying the configured budget.
export function createNativeEngine({ capabilities = computeCapabilities(), createWorker = () => new Worker(new URL('./native-worker.mjs', import.meta.url)) } = {}) {
  let active, nextId = 0, stopped = false, recovering = false;
  const workers = [], queue = [], retiring = new Set();
  function retire(worker, graceful = false) {
    const ended = graceful && worker.threadId !== -1 ? new Promise((resolve, reject) => {
      const ready = message => {
        if (message.type !== 'shutdown-ready') return;
        worker.off('message', ready);
        Promise.resolve(worker.terminate()).then(resolve, reject);
      };
      worker.on('message', ready);
      worker.once('exit', () => { worker.off('message', ready); resolve(0); });
      worker.postMessage({type:'shutdown'});
    }) : Promise.resolve(worker.terminate());
    retiring.add(ended); ended.finally(() => retiring.delete(ended)).catch(() => {});
    return ended;
  }
  function finish(error, result) {
    const job = active; active = undefined;
    if (job) {
      job.signal?.removeEventListener('abort', job.abort);
      if (!job.cancelled) error ? job.reject(error) : job.resolve(result);
    }
    pump();
  }
  async function failed() {
    if (recovering || stopped) return;
    recovering = true;
    const old = workers.splice(0);
    await Promise.allSettled(old.map(slot => retire(slot.worker, true)));
    recovering = false;
    finish(new Error('error.nativeInference'));
  }
  function completed(slot, data) {
    const job = active;
    if (!job || data.id !== job.id || slot.completed) return;
    if (data.type === 'progress') {
      slot.progress = data.current;
      if (!job.cancelled) job.onProgress({ current: workers.slice(0, job.plan.workers).reduce((sum, value) => sum + value.progress, 0), total: job.frames.length });
      return;
    }
    slot.completed = true;
    if (data.error) {
      job.error ||= new Error(data.error);
      // Let another session's current call finish, then discard its remaining frames.
      for (const other of workers) if (!other.completed) other.worker.postMessage({ type:'cancel', id:job.id });
    } else {
      slot.indices.forEach((index, offset) => { job.scores[index] = data.result.scores[offset]; });
      job.results[slot.index] = data.result;
    }
    if (--job.pending) return;
    if (job.error) return finish(job.error);
    const cpu = process.cpuUsage(job.cpuStarted);
    const timings = { modelLoadSeconds: Math.max(...job.results.map(result => result.timings.modelLoadSeconds)),
      preprocessSeconds: job.results.reduce((sum,result) => sum + result.timings.preprocessSeconds,0),
      inferenceSeconds: job.results.reduce((sum,result) => sum + result.timings.inferenceSeconds,0),
      queueSeconds: job.queueSeconds, cpuSeconds: (cpu.user + cpu.system) / 1e6,
      workerWallSeconds: (performance.now() - job.started) / 1000 };
    finish(null, { scores:job.scores, timings, runtime:{...job.results[0].runtime,
      configuredNativeThreads:job.results.reduce((sum,result)=>sum+result.runtime.configuredNativeThreads,0), inferenceWorkers:job.plan.workers,
      threadsPerSession:job.results.map(result=>result.runtime.configuredNativeThreads), imageParallelism:job.parallelImages ? 'auto':'single', residentSessions:workers.length } });
  }
  function spawnSlot() {
    const slot = { index:workers.length, worker:createWorker(), completed:true, progress:0 };
    workers.push(slot);
    slot.worker.on('message', data => completed(slot,data));
    slot.worker.on('error', () => { if (workers.includes(slot)) void failed(); });
    slot.worker.on('exit', () => { if (workers.includes(slot)) void failed(); });
    return slot;
  }
  function pump() {
    if (stopped || recovering || active || !queue.length) return;
    const job = active = queue.shift();
    job.started = performance.now(); job.cpuStarted = process.cpuUsage();
    job.queueSeconds = (job.started - job.queuedAt) / 1000;
    try {
      job.plan = executionPlan(resolveThreads(job.parallelism, capabilities), job.frames.length, job.parallelImages);
      if (!job.parallelImages) for (const slot of workers.splice(1)) void retire(slot.worker, true).catch(() => {});
      job.pending = job.plan.workers; job.results = []; job.scores = Array(job.frames.length);
      while (workers.length < job.plan.workers) spawnSlot();
      for (let i=0; i<job.plan.workers; i++) {
        const slot=workers[i]; slot.completed=false; slot.progress=0;
        slot.indices=Array.from({length:job.frames.length},(_,index)=>index).filter(index=>index % job.plan.workers === i);
        const frames=slot.indices.map(index=>job.frames[index]);
        slot.worker.postMessage({id:job.id, frames, parallelism:String(job.plan.threads[i])}, frames.map(frame=>frame.buffer));
      }
    } catch { void failed(); }
  }
  function infer(input, parallelism='auto', signal, onProgress=()=>{}, {parallelImages=true}={}) {
    if (stopped) return Promise.reject(new Error('analysis.stopped'));
    if (signal?.aborted) return Promise.reject(new DOMException('analysis.cancelled','AbortError'));
    if (queue.length >= QUEUE_CAPACITY) return Promise.reject(new Error('error.nativeBusy'));
    return new Promise((resolve,reject) => {
      const job={id:++nextId,frames:Array.isArray(input)?input:[input],parallelism,parallelImages,signal,resolve,reject,onProgress,queuedAt:performance.now()};
      job.abort=()=>{
        job.cancelled=true;
        const index=queue.indexOf(job);
        if (index>=0) queue.splice(index,1);
        else if (active===job) for (const slot of workers) if (!slot.completed) slot.worker.postMessage({type:'cancel',id:job.id});
        signal?.removeEventListener('abort',job.abort);
        reject(new DOMException('analysis.cancelled','AbortError'));
      };
      signal?.addEventListener('abort',job.abort,{once:true}); queue.push(job); pump();
    });
  }
  async function stop() {
    stopped=true;
    for (const job of [active,...queue].filter(Boolean)) { job.signal?.removeEventListener('abort',job.abort); job.reject(new Error('analysis.cancelled')); }
    active=undefined; queue.length=0;
    const old=workers.splice(0);
    await Promise.all([...old.map(slot=>retire(slot.worker, true)),...retiring]);
  }
  return {infer,stop};
}
