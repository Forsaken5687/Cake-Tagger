import test from 'node:test';
import assert from 'node:assert/strict';
import { memorySnapshot } from '../src/client/runtime-metrics.mjs';
import { validateRuntime } from '../src/shared/analysis-settings.mjs';

test('RAM diagnostics preserve unknown values and label partial measurements', () => {
  const unavailable = memorySnapshot({ performance: {}, navigator: {} });
  assert.equal(unavailable.pageJsHeapUsedBytes, null); assert.equal(unavailable.reportedDeviceMemoryGB, null);
  const memory = memorySnapshot({ performance: { memory: { usedJSHeapSize: 1234, totalJSHeapSize: 2345, jsHeapSizeLimit: 3456 } }, navigator: { deviceMemory: 8 } });
  assert.equal(memory.scope, 'page-js-heap'); assert.equal(memory.pageJsHeapUsedBytes, 1234);
  const runtime = { provider: 'wasm', configuredWasmThreads: 8, inferenceWorkers: 1, hardwareConcurrency: 24, crossOriginIsolated: true, sharedArrayBufferAvailable: true, browser: 'chromium', memory, parallelismLimit: '8' };
  assert.deepEqual(validateRuntime(runtime), runtime);
  assert.throws(() => validateRuntime({ ...runtime, memory: { ...memory, pageJsHeapUsedBytes: -1 } }));
  const server = { hostMemory: { totalBytes: 1000, freeBytes: 200 }, serverMemory: { rssBytes: 100, heapUsedBytes: 20, heapTotalBytes: 30, externalBytes: 10, arrayBuffersBytes: 5 } };
  assert.deepEqual(validateRuntime({ ...runtime, ...server }), { ...runtime, ...server });
  assert.throws(() => validateRuntime({ ...runtime, hostMemory: { totalBytes: 100, freeBytes: 200 } }));
});
