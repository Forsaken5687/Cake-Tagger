import { Worker } from 'node:worker_threads';

// One shared session serves all browser views. Bound the queue so disconnected
// clients or multiple tabs cannot accumulate unbounded frame buffers.
export function createNativeEngine({ createWorker = () => new Worker(new URL('./native-worker.mjs', import.meta.url)) } = {}) {
  let worker, active, nextId = 0;
  const queue = [];
  function finish(error, result) {
    const job = active;
    active = undefined;
    if (job) {
      job.signal?.removeEventListener('abort', job.abort);
      if (!job.cancelled) error ? job.reject(error) : job.resolve(result);
    }
    pump();
  }
  function failed() {
    const previous = worker;
    worker = undefined;
    previous?.terminate();
    finish(new Error('error.nativeInference'));
  }
  function pump() {
    if (active || !queue.length) return;
    active = queue.shift();
    if (!worker) {
      try { worker = createWorker(); } catch { return finish(new Error('error.nativeInference')); }
      const current = worker;
      worker.on('message', data => {
        if (data.id !== active?.id) return;
        finish(data.error ? new Error(data.error) : null, data.result);
      });
      worker.on('error', () => { if (worker === current) failed(); });
      worker.on('exit', () => { if (worker === current) failed(); });
    }
    try { worker.postMessage({ id: active.id, rgba: active.rgba, parallelism: active.parallelism }, [active.rgba.buffer]); }
    catch { failed(); }
  }
  function infer(rgba, parallelism, signal) {
    if (signal?.aborted) return Promise.reject(new DOMException('analysis.cancelled', 'AbortError'));
    if (queue.length >= 8) return Promise.reject(new Error('error.nativeBusy'));
    return new Promise((resolve, reject) => {
      const job = { id: ++nextId, rgba, parallelism, signal, resolve, reject };
      job.abort = () => {
        job.cancelled = true;
        const index = queue.indexOf(job);
        if (index >= 0) queue.splice(index, 1);
        signal.removeEventListener('abort', job.abort);
        reject(new DOMException('analysis.cancelled', 'AbortError'));
        // An active native call finishes before its buffer/session can be reused.
        // Its result is discarded; other clients retain the warmed session.
      };
      signal?.addEventListener('abort', job.abort, { once: true });
      queue.push(job);
      pump();
    });
  }
  function stop() {
    const error = new Error('analysis.cancelled');
    for (const job of [active, ...queue].filter(Boolean)) {
      job.signal?.removeEventListener('abort', job.abort);
      job.reject(error);
    }
    active = undefined;
    queue.length = 0;
    const previous = worker;
    worker = undefined;
    previous?.terminate();
  }
  return { infer, stop };
}
