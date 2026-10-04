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
  return Object.fromEntries(keys.map(key => [key, value[key]]));
}

// Optional diagnostics contain capabilities, not full user agents or machine identifiers.
export function validateRuntime(value) {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value) || value.provider !== 'wasm'
    || !Number.isInteger(value.configuredWasmThreads) || value.configuredWasmThreads < 1 || value.configuredWasmThreads > 4
    || !Number.isInteger(value.hardwareConcurrency) || value.hardwareConcurrency < 1 || value.hardwareConcurrency > 4096
    || typeof value.crossOriginIsolated !== 'boolean' || typeof value.sharedArrayBufferAvailable !== 'boolean'
    || !['firefox', 'chromium', 'other'].includes(value.browser)
    || (value.inferenceWorkers != null && (!Number.isInteger(value.inferenceWorkers) || value.inferenceWorkers < 1 || value.inferenceWorkers > 4))) throw messageError('error.invalidAnalysisRuntime');
  return { ...Object.fromEntries(['provider', 'configuredWasmThreads', 'crossOriginIsolated', 'sharedArrayBufferAvailable', 'hardwareConcurrency', 'browser'].map(key => [key, value[key]])),
    ...(value.inferenceWorkers != null ? { inferenceWorkers: value.inferenceWorkers } : {}) };
}
