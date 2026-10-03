export const DEFAULT_THRESHOLD = 0.4;
export const DEFAULT_COVERAGE = 'majority';
export const PREPROCESS_VERSION = 'preprocess-v2';

export function validateTimings(value) {
  if (value == null) return null;
  const keys = ['samplingSeconds', 'modelLoadSeconds', 'preprocessSeconds', 'inferenceSeconds', 'totalSeconds'];
  if (typeof value !== 'object' || Array.isArray(value) || keys.some(key => !Number.isFinite(value[key]) || value[key] < 0 || value[key] > 86400)) throw Error('Ungültige Analysezeiten.');
  return Object.fromEntries(keys.map(key => [key, value[key]]));
}
