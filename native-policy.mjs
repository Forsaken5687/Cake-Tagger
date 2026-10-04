import os from 'node:os';

export const QUEUE_CAPACITY = 8;

// Logical processors are the test ceiling: above this, CPU workers would
// oversubscribe the same hardware. RAM does not limit native thread overrides.
export function computeCapabilities(cores = os.availableParallelism()) {
  cores = Math.max(1, Math.floor(cores));
  return { logicalProcessors: cores, recommendedThreads: Math.max(1, Math.floor(cores / 2)),
    testMaximum: cores, reason: 'logical-processors', queueCapacity: QUEUE_CAPACITY };
}
export function resolveThreads(value = 'auto', capabilities = computeCapabilities()) {
  if (value === 'auto') return capabilities.recommendedThreads;
  if (!/^[1-9]\d*$/.test(String(value))) throw Error('error.invalidAnalysisRuntime');
  const requested = Number(value);
  if (!Number.isSafeInteger(requested) || requested > capabilities.testMaximum) throw Error('error.threadLimit');
  return requested;
}

// A second image keeps operator pools small. Four threads per session and at
// least four images amortize the extra model session; this is an operating
// heuristic, not an override ceiling. Single mode keeps one session active.
export function executionPlan(totalThreads, frameCount, parallelImages=true) {
  const workers = parallelImages && totalThreads >= 8 && frameCount >= 4 ? 2:1;
  const threads = Array.from({length:workers},(_,index)=>Math.floor(totalThreads/workers)+(index<totalThreads%workers?1:0));
  return {workers,threads,totalThreads};
}
