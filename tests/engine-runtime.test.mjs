import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('worker reports post-initialization thread fallback and preserves scores', async () => {
  const replies = [];
  let requestedThreads;
  const ort = { env: { wasm: {} },
    InferenceSession: { create: async () => {
      requestedThreads = ort.env.wasm.numThreads;
      // Simulate a browser that cannot keep the requested threaded runtime.
      ort.env.wasm.numThreads = 1;
      return { inputNames: ['input'], outputNames: ['output'],
        run: async () => ({ output: { data: new Float32Array(5813), dispose() {} } }) };
    } },
    Tensor: class { dispose() {} } };
  const context = vm.createContext({ ort, importScripts() {}, postMessage: data => replies.push(data),
    self: { crossOriginIsolated: true, location: { href: 'http://127.0.0.1/engine-worker.js' } }, navigator: { hardwareConcurrency: 24, userAgent: 'Firefox/144' },
    URL, SharedArrayBuffer, Uint8ClampedArray, Float32Array, performance });
  vm.runInContext(fs.readFileSync(new URL('../compute-policy.js', import.meta.url), 'utf8'), context);
  vm.runInContext(fs.readFileSync(new URL('../engine-worker.js', import.meta.url), 'utf8'), context);
  await context.self.onmessage({ data: { id: 1, type: 'load' } });
  const loaded = replies.find(row => row.id === 1);
  assert.equal(requestedThreads, 8, 'classic worker uses the shared hardware policy');
  assert.equal(loaded.runtime.configuredWasmThreads, 1);
  assert.equal(loaded.runtime.browser, 'firefox');
  assert.equal(loaded.runtime.sharedArrayBufferAvailable, true);
  await context.self.onmessage({ data: { id: 2, type: 'analyze', frames: [new Uint8ClampedArray(448 * 448 * 4)] } });
  const analyzed = replies.find(row => row.id === 2);
  assert.equal(analyzed.runtime.configuredWasmThreads, 1);
  assert.equal(analyzed.scores[0].length, 5813);
  assert(analyzed.scores[0].every(score => score === 0.5), 'zero logits still use sigmoid');
});
