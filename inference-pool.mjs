import { messageError } from './messages.mjs';

// Isolated pages use one internally threaded session. Extension pages process
// independent frames in separate single-threaded sessions instead.
export function inferenceConcurrency({ isolated, cores = 2, memoryGB } = {}) {
  if (isolated) return 1;
  const cpuLimit = Math.max(1, Math.floor((Number.isFinite(cores) ? cores : 2) / 2));
  const memoryLimit = Number.isFinite(memoryGB) && memoryGB <= 2 ? 1 : Number.isFinite(memoryGB) && memoryGB <= 4 ? 2 : 4;
  return Math.min(4, cpuLimit, memoryLimit);
}

export function createInferencePool({ createWorker, concurrency = 1, onState = () => {}, onProgress = () => {} }) {
  let workers = [], active = false, generation = 0;
  const limit = Math.max(1, Math.min(4, Math.floor(Number.isFinite(concurrency) ? concurrency : 1)));
  const jobs = new Set();
  function stop(error = new DOMException('analysis.cancelled', 'AbortError')) {
    generation++;
    for (const job of jobs) job.reject(error);
    jobs.clear();
    for (const worker of workers) worker?.terminate();
    workers = []; active = false;
  }
  async function infer(frames) {
    if (active) throw messageError('error.analysisStart');
    if (!frames.length) throw messageError('error.invalidModelInputImage');
    active = true;
    const batchGeneration = generation;
    const count = Math.min(limit, frames.length), progress = Array(count).fill(0);
    let reported = 0;
    const report = () => {
      reported = Math.max(reported, Math.min(frames.length, progress.reduce((sum, value) => sum + value, 0) + 1));
      onProgress(reported, frames.length);
    };
    try {
      const results = await Promise.all(Array.from({ length: count }, (_, index) => {
        const assigned = frames.map((frame, frameIndex) => ({ frame, frameIndex })).filter(row => row.frameIndex % count === index);
        const worker = workers[index] ||= createWorker();
        return new Promise((resolve, reject) => {
          const job = { reject }; jobs.add(job);
          const fail = error => { jobs.delete(job); reject(error); };
          worker.onerror = () => fail(messageError('error.analysisStart'));
          worker.onmessage = ({ data }) => {
            if (generation !== batchGeneration || !jobs.has(job)) return;
            if (data.type === 'state' && index === 0 && data.state !== 'analysis.ready') onState(data.state);
            if (data.type === 'progress') {
              progress[index] = Math.min(assigned.length, Math.max(progress[index], data.current - 1)); report();
            }
            if (data.type === 'error') fail(messageError(data.error));
            if (data.type === 'done') {
              if (!Array.isArray(data.scores) || data.scores.length !== assigned.length
                || data.scores.some(row => !(row instanceof Float32Array) || row.length !== 5813)
                || ['modelLoadSeconds', 'preprocessSeconds', 'inferenceSeconds'].some(key => !Number.isFinite(data.timings?.[key]) || data.timings[key] < 0)) return fail(messageError('error.modelOutput'));
              jobs.delete(job); progress[index] = assigned.length; report();
              resolve({ ...data, indices: assigned.map(row => row.frameIndex) });
            }
          };
          try { worker.postMessage({ id: index, type: 'analyze', frames: assigned.map(row => row.frame) }, assigned.map(row => row.frame.buffer)); }
          catch (error) { fail(error); }
        });
      }));
      // Restore chronological order before temporal tag aggregation.
      const scores = Array(frames.length);
      for (const result of results) result.indices.forEach((index, offset) => { scores[index] = result.scores[offset]; });
      const timings = Object.fromEntries(['modelLoadSeconds', 'preprocessSeconds', 'inferenceSeconds'].map(key => [key, Math.max(...results.map(result => result.timings[key]))]));
      return { scores, timings, runtime: { ...results[0].runtime, inferenceWorkers: count } };
    } catch (error) { if (generation === batchGeneration) stop(error); throw error; }
    finally { if (generation === batchGeneration) active = false; }
  }
  return { infer, stop };
}
