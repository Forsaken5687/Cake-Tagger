import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('./runtime/native/loader.cjs', import.meta.url));
const ort = require('onnxruntime-node');
const model = new URL('./model/joytag-int8.onnx', import.meta.url);
const expectedHash = JSON.parse(fs.readFileSync(new URL('./model/provenance.json', import.meta.url))).sha256;
if (createHash('sha256').update(fs.readFileSync(model)).digest('hex') !== expectedHash) throw Error('error.nativeModelChecksum');
const cores = os.availableParallelism();
const mean = [0.48145466, 0.4578275, 0.40821073];
const std = [0.26862954, 0.26130258, 0.27577711];
let session, configuredThreads;

parentPort.on('message', async ({ id, rgba, parallelism }) => {
  try {
    if (!(rgba instanceof Uint8ClampedArray) || rgba.length !== 448 * 448 * 4) throw Error('error.invalidModelInputImage');
    const limit = parallelism === 'auto' ? 8 : Number(parallelism);
    const threads = Math.max(1, Math.min(8, Math.floor(cores / 2), limit));
    const loadStarted = performance.now();
    if (!session || threads !== configuredThreads) {
      await session?.release();
      session = undefined;
      session = await ort.InferenceSession.create(fileURLToPath(model), {
        executionProviders: ['cpu'], graphOptimizationLevel: 'all', intraOpNumThreads: threads, interOpNumThreads: 1
      });
      configuredThreads = threads;
    }
    const modelLoadSeconds = (performance.now() - loadStarted) / 1000;
    const prepareStarted = performance.now(), n = 448 * 448;
    const data = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) data[c * n + i] = (rgba[i * 4 + c] / 255 - mean[c]) / std[c];
    const input = new ort.Tensor('float32', data, [1, 3, 448, 448]);
    const preprocessSeconds = (performance.now() - prepareStarted) / 1000;
    const started = performance.now();
    let output;
    try {
      output = await session.run({ [session.inputNames[0]]: input });
      const inferenceSeconds = (performance.now() - started) / 1000;
      const raw = output[session.outputNames[0]].data;
      if (raw.length !== 5813 || raw.some(value => !Number.isFinite(value))) throw Error('error.modelOutput');
      // The graph emits logits; use the same sigmoid and normalization as WASM.
      const scores = Float32Array.from(raw, value => 1 / (1 + Math.exp(-value)));
      parentPort.postMessage({ id, result: { scores, timings: { modelLoadSeconds, preprocessSeconds, inferenceSeconds },
        runtime: { provider: 'native-cpu', configuredNativeThreads: threads, inferenceWorkers: 1,
          hardwareConcurrency: cores, runtimeVersion: ort.env.versions.node, modelSha256: expectedHash } } }, [scores.buffer]);
    } finally { input.dispose(); if (output) Object.values(output).forEach(tensor => tensor.dispose()); }
  } catch (error) {
    parentPort.postMessage({ id, error: error.message?.startsWith('error.') ? error.message : 'error.nativeInference' });
  }
});
