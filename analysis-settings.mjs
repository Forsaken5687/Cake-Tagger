import { messageError } from './messages.mjs';
export const DEFAULT_THRESHOLD = 0.4;
export const DEFAULT_COVERAGE = 'majority';
export const PREPROCESS_VERSION = 'preprocess-v2';

// Keep legacy exports readable while validating the exclusion snapshot in v5 keys.
export function validateAnalysisPolicy(value) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > 32768) throw messageError('error.invalidAnalysisPolicy');
  const match = /^coverage-v[2345]:(majority|brief)(?::(.+))?$/.exec(value);
  if (!match) throw messageError('error.invalidAnalysisPolicy');
  if (match[2]) {
    let exclusions;
    try { exclusions = JSON.parse(match[2]); } catch { throw messageError('error.invalidAnalysisPolicy'); }
    if (!Array.isArray(exclusions) || exclusions.length > 258 || exclusions.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 80)) throw messageError('error.invalidAnalysisPolicy');
  }
  return value;
}

export function validateTimings(value) {
  if (value == null) return null;
  const keys = ['samplingSeconds', 'modelLoadSeconds', 'preprocessSeconds', 'inferenceSeconds', 'totalSeconds'];
  if (typeof value !== 'object' || Array.isArray(value) || keys.some(key => !Number.isFinite(value[key]) || value[key] < 0 || value[key] > 86400)) throw messageError('error.invalidAnalysisTimings');
  const optional = ['queueSeconds', 'cpuSeconds', 'workerWallSeconds'];
  if (optional.some(key => value[key] != null && (!Number.isFinite(value[key]) || value[key] < 0 || value[key] > 86400))) throw messageError('error.invalidAnalysisTimings');
  return Object.fromEntries([...keys, ...optional.filter(key => value[key] != null)].map(key => [key, value[key]]));
}

// Optional diagnostics contain capabilities, not full user agents or machine identifiers.
export function validateRuntime(value) {
  if (value == null) return null;
  const native = value?.provider === 'native-cpu';
  if (typeof value !== 'object' || Array.isArray(value) || !['wasm', 'native-cpu'].includes(value.provider)
    || (native ? !Number.isInteger(value.configuredNativeThreads) || value.configuredNativeThreads < 1 || value.configuredNativeThreads > value.hardwareConcurrency
      || !/^\d+\.\d+\.\d+$/.test(value.runtimeVersion) || !/^[a-f0-9]{64}$/.test(value.modelSha256)
      : !Number.isInteger(value.configuredWasmThreads) || value.configuredWasmThreads < 1 || value.configuredWasmThreads > 8)
    || !Number.isInteger(value.hardwareConcurrency) || value.hardwareConcurrency < 1 || !Number.isSafeInteger(value.hardwareConcurrency)
    || (!native && (typeof value.crossOriginIsolated !== 'boolean' || typeof value.sharedArrayBufferAvailable !== 'boolean'
      || !['firefox', 'chromium', 'other'].includes(value.browser)))
    || (value.inferenceWorkers != null && (!Number.isInteger(value.inferenceWorkers) || value.inferenceWorkers < 1 || value.inferenceWorkers > 8))) throw messageError('error.invalidAnalysisRuntime');
  if (value.parallelismLimit != null && value.parallelismLimit !== 'auto' && (!/^[1-9]\d*$/.test(value.parallelismLimit) || !Number.isSafeInteger(Number(value.parallelismLimit)))) throw messageError('error.invalidAnalysisRuntime');
  if (native && value.threadsPerSession != null && (!Array.isArray(value.threadsPerSession)
    || value.threadsPerSession.length !== value.inferenceWorkers || value.threadsPerSession.some(count => !Number.isSafeInteger(count) || count < 1)
    || value.threadsPerSession.reduce((sum,count)=>sum+count,0) !== value.configuredNativeThreads
    || !['auto','single'].includes(value.imageParallelism) || !Number.isInteger(value.residentSessions) || value.residentSessions < value.inferenceWorkers || value.residentSessions > 2)) throw messageError('error.invalidAnalysisRuntime');
  if (native && ((value.threadSpinning != null && typeof value.threadSpinning !== 'boolean')
    || (value.processPriority != null && !['below-normal', 'normal', 'other', 'unknown'].includes(value.processPriority)))) throw messageError('error.invalidAnalysisRuntime');
  let memory;
  if (value.memory != null) {
    const keys = ['reportedDeviceMemoryGB', 'pageJsHeapUsedBytes', 'pageJsHeapTotalBytes', 'pageJsHeapLimitBytes'];
    if (typeof value.memory !== 'object' || Array.isArray(value.memory)
      || !['page-js-heap', 'unavailable'].includes(value.memory.scope)
      || keys.some(key => value.memory[key] !== null && (!Number.isFinite(value.memory[key]) || value.memory[key] < 0 || value.memory[key] > Number.MAX_SAFE_INTEGER))) throw messageError('error.invalidAnalysisRuntime');
    memory = { ...Object.fromEntries(keys.map(key => [key, value.memory[key]])), scope: value.memory.scope };
  }
  const memoryFields = (input, keys) => {
    if (input == null) return null;
    if (typeof input !== 'object' || Array.isArray(input) || keys.some(key => !Number.isSafeInteger(input[key]) || input[key] < 0)) throw messageError('error.invalidAnalysisRuntime');
    return Object.fromEntries(keys.map(key => [key, input[key]]));
  };
  const hostMemory = memoryFields(value.hostMemory, ['totalBytes', 'freeBytes']);
  const serverMemory = memoryFields(value.serverMemory, ['rssBytes', 'heapUsedBytes', 'heapTotalBytes', 'externalBytes', 'arrayBuffersBytes']);
  if (hostMemory && (hostMemory.totalBytes === 0 || hostMemory.freeBytes > hostMemory.totalBytes)) throw messageError('error.invalidAnalysisRuntime');
  return { ...Object.fromEntries((native ? ['provider', 'configuredNativeThreads', 'hardwareConcurrency', 'runtimeVersion', 'modelSha256']
    : ['provider', 'configuredWasmThreads', 'crossOriginIsolated', 'sharedArrayBufferAvailable', 'hardwareConcurrency', 'browser']).map(key => [key, value[key]])),
    ...(value.inferenceWorkers != null ? { inferenceWorkers: value.inferenceWorkers } : {}),
    ...(value.parallelismLimit != null ? { parallelismLimit: value.parallelismLimit } : {}),
    ...(native ? Object.fromEntries(['logicalProcessors', 'recommendedThreads', 'testMaximum', 'queueCapacity'].filter(key => Number.isSafeInteger(value[key]) && value[key] > 0).map(key => [key, value[key]])) : {}),
    ...(native && value.threadsPerSession != null ? { threadsPerSession: [...value.threadsPerSession], imageParallelism:value.imageParallelism, residentSessions:value.residentSessions } : {}),
    ...(native && value.threadSpinning != null ? { threadSpinning: value.threadSpinning } : {}),
    ...(native && value.processPriority != null ? { processPriority: value.processPriority } : {}),
    ...(memory ? { memory } : {}),
    ...(Object.hasOwn(value, 'hostMemory') ? { hostMemory } : {}),
    ...(Object.hasOwn(value, 'serverMemory') ? { serverMemory } : {}) };
}
