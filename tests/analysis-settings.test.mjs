import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_THRESHOLD, DEFAULT_COVERAGE, PREPROCESS_VERSION, validateTimings, validateRuntime } from '../analysis-settings.mjs';
import { makeRecord, validateRecord, applyRecord, exportItem } from '../corrections.mjs';

test('fixed defaults and timing metadata survive persistence and export', () => {
  assert.equal(DEFAULT_THRESHOLD, 0.4); assert.equal(DEFAULT_COVERAGE, 'majority');
  assert.equal(PREPROCESS_VERSION, 'preprocess-v2');
  const timings = { samplingSeconds: 1, modelLoadSeconds: 2, preprocessSeconds: 0.1, inferenceSeconds: 4, totalSeconds: 7.2 };
  const entry = { file: { name: 'synthetic.mp4' }, selected: new Map([['solo', true]]), reviewed: true,
    result: { sha256: 'e'.repeat(64), tags: [{ tag: 'solo', confidence: 0.8 }], uncertain: [], sampledFrames: 8, threshold: DEFAULT_THRESHOLD, analysisPolicy: 'coverage-v4:majority', model: 'JoyTag-INT8', timings } };
  const record = validateRecord(makeRecord(entry), ['solo']);
  assert.deepEqual(exportItem(applyRecord({ file: entry.file }, record)).timings, timings);
  assert.equal(validateTimings(undefined), null);
  for (const broken of [{}, { ...timings, inferenceSeconds: -1 }, { ...timings, totalSeconds: Infinity }, { ...timings, samplingSeconds: '1' }]) assert.throws(() => validateTimings(broken));
});

test('runtime diagnostics survive correction export without retaining arbitrary machine details', () => {
  const runtime = { provider: 'wasm', configuredWasmThreads: 4, hardwareConcurrency: 24, crossOriginIsolated: true, sharedArrayBufferAvailable: true, browser: 'firefox' };
  const entry = { file: { name: 'synthetic.mp4' }, selected: new Map([['solo', true]]), reviewed: false,
    result: { sha256: 'e'.repeat(64), tags: [{ tag: 'solo', confidence: 0.8 }], uncertain: [], sampledFrames: 8, model: 'JoyTag-INT8', runtime: { ...runtime, userAgent: 'private details' } } };
  const record = validateRecord(makeRecord(entry), ['solo']);
  assert.deepEqual(exportItem(applyRecord({ file: entry.file }, record)).runtime, runtime);
  assert.equal(validateRuntime(undefined), null);
  for (const broken of [{}, { ...runtime, configuredWasmThreads: 0 }, { ...runtime, configuredWasmThreads: 1.5 }, { ...runtime, hardwareConcurrency: '24' }, { ...runtime, crossOriginIsolated: 'true' }, { ...runtime, browser: 'unknown' }]) assert.throws(() => validateRuntime(broken));
});
