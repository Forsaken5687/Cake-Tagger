import os from 'node:os';

export const QUEUE_CAPACITY = 8;

// Logical processors are the test ceiling: above this, CPU workers would
// oversubscribe the same hardware. RAM does not limit native thread overrides.
// Reserve CPU headroom for interactive applications; manual testing stays uncapped
// up to the hardware ceiling. This recommendation is not a calibrated optimum.
export function computeCapabilities(cores = os.availableParallelism()) {
  cores = Math.max(1, Math.floor(cores));
  return { logicalProcessors: cores, recommendedThreads: Math.max(1, Math.floor(cores / 3)),
    testMaximum: cores, reason: 'logical-processors', queueCapacity: QUEUE_CAPACITY };
}
export function resolveThreads(value = 'auto', capabilities = computeCapabilities()) {
  if (value === 'auto') return capabilities.recommendedThreads;
  if (!/^[1-9]\d*$/.test(String(value))) throw Error('error.invalidAnalysisRuntime');
  const requested = Number(value);
  if (!Number.isSafeInteger(requested) || requested > capabilities.testMaximum) throw Error('error.threadLimit');
  return requested;
}
