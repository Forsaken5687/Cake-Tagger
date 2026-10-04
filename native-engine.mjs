import { Worker } from 'node:worker_threads';
import { QUEUE_CAPACITY, computeCapabilities, resolveThreads } from './native-policy.mjs';

// All clients share one FIFO video queue and one warmed model session.
// CPU threads cooperate on each image; images themselves run sequentially.
export function createNativeEngine({ capabilities = computeCapabilities(), createWorker = () => new Worker(new URL('./native-worker.mjs', import.meta.url)) } = {}) {
  let active, worker, nextId = 0, stopped = false, recovering = false;
  const queue = [], retiring = new Set();
  function retire(target) {
    const ended = new Promise((resolve, reject) => {
      const ready = message => {
        if (message.type !== 'shutdown-ready') return;
        target.off('message', ready);
        Promise.resolve(target.terminate()).then(resolve, reject);
      };
      target.on('message', ready);
      target.once('exit', () => { target.off('message', ready); resolve(0); });
      if (target.threadId === -1) resolve(0);
      else target.postMessage({type:'shutdown'});
    });
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
  async function failed(target) {
    if (recovering || stopped || worker !== target) return;
    recovering = true; worker = undefined;
    await Promise.allSettled([retire(target)]);
    recovering = false; finish(new Error('error.nativeInference'));
  }
  function completed(target, data) {
    const job = active;
    if (target !== worker || !job || data.id !== job.id) return;
    if (data.type === 'progress') {
      if (!job.cancelled) job.onProgress({current:data.current, total:job.frames.length});
      return;
    }
    if (data.error) return finish(new Error(data.error));
    const cpu = process.cpuUsage(job.cpuStarted), result = data.result;
    finish(null, { ...result, timings:{...result.timings, queueSeconds:job.queueSeconds,
      cpuSeconds:(cpu.user + cpu.system) / 1e6, workerWallSeconds:(performance.now() - job.started) / 1000},
      runtime:{...result.runtime, inferenceWorkers:1, threadsPerSession:[result.runtime.configuredNativeThreads],
        imageParallelism:'single', residentSessions:1} });
  }
  function pump() {
    if (stopped || recovering || active || !queue.length) return;
    const job = active = queue.shift();
    job.started = performance.now(); job.cpuStarted = process.cpuUsage();
    job.queueSeconds = (job.started - job.queuedAt) / 1000;
    try {
      const threads = resolveThreads(job.parallelism, capabilities);
      if (!worker) {
        const target = worker = createWorker();
        target.on('message', data => completed(target,data));
        target.on('error', () => { void failed(target); });
        target.on('exit', () => { void failed(target); });
      }
      worker.postMessage({id:job.id, frames:job.frames, parallelism:String(threads)}, job.frames.map(frame=>frame.buffer));
    } catch { if (worker) void failed(worker); else finish(new Error('error.nativeInference')); }
  }
  function infer(input, parallelism='auto', signal, onProgress=()=>{}) {
    if (stopped) return Promise.reject(new Error('analysis.stopped'));
    if (signal?.aborted) return Promise.reject(new DOMException('analysis.cancelled','AbortError'));
    if (queue.length >= QUEUE_CAPACITY) return Promise.reject(new Error('error.nativeBusy'));
    return new Promise((resolve,reject) => {
      const job={id:++nextId,frames:Array.isArray(input)?input:[input],parallelism,signal,resolve,reject,onProgress,queuedAt:performance.now()};
      job.abort=()=>{
        job.cancelled=true;
        const index=queue.indexOf(job);
        if (index>=0) queue.splice(index,1);
        else if (active===job) worker.postMessage({type:'cancel',id:job.id});
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
    const target=worker; worker=undefined;
    // Native calls finish and release their session before worker termination.
    await Promise.all([...(target ? [retire(target)]:[]),...retiring]);
  }
  return {infer,stop};
}
