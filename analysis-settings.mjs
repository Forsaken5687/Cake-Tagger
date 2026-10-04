export const DEFAULT_THRESHOLD = 0.4;
export const DEFAULT_COVERAGE = 'majority';
export const PREPROCESS_VERSION = 'preprocess-v2';

// Keep legacy exports readable while validating the exclusion snapshot in v5 keys.
export function validateAnalysisPolicy(value) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > 32768) throw Error('Invalid analysis policy.');
  const match = /^coverage-v[2345]:(majority|brief)(?::(.+))?$/.exec(value);
  if (!match) throw Error('Invalid analysis policy.');
  if (match[2]) {
    let exclusions;
    try { exclusions = JSON.parse(match[2]); } catch { throw Error('Invalid analysis policy.'); }
    if (!Array.isArray(exclusions) || exclusions.length > 258 || exclusions.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 80)) throw Error('Invalid analysis policy.');
  }
  return value;
}

export function validateTimings(value) {
  if (value == null) return null;
  const keys = ['samplingSeconds', 'modelLoadSeconds', 'preprocessSeconds', 'inferenceSeconds', 'totalSeconds'];
  if (typeof value !== 'object' || Array.isArray(value) || keys.some(key => !Number.isFinite(value[key]) || value[key] < 0 || value[key] > 86400)) throw Error('Invalid analysis timings.');
  return Object.fromEntries(keys.map(key => [key, value[key]]));
}
