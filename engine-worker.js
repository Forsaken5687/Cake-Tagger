importScripts('/vendor/ort.wasm.min.js');
let session;
function runtimeInfo() {
  return { provider: 'wasm', configuredWasmThreads: ort.env.wasm.numThreads,
    crossOriginIsolated: !!self.crossOriginIsolated,
    sharedArrayBufferAvailable: typeof SharedArrayBuffer !== 'undefined',
    hardwareConcurrency: navigator.hardwareConcurrency || 1,
    browser: /Firefox\//.test(navigator.userAgent) ? 'firefox' : /Chrome\//.test(navigator.userAgent) ? 'chromium' : 'other' };
}
const mean = [0.48145466, 0.4578275, 0.40821073], std = [0.26862954, 0.26130258, 0.27577711];
async function load() {
  if (session) return session;
  postMessage({ type: 'state', state: 'analysis.loadingModel' });
  ort.env.wasm.wasmPaths = '/vendor/';
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  session = await ort.InferenceSession.create('/model/joytag-int8.onnx', { executionProviders: ['wasm'], graphOptimizationLevel: 'all', intraOpNumThreads: 4 });
  postMessage({ type: 'state', state: 'analysis.ready' });
  return session;
}
function tensorFor(rgba) {
  const size = 448, n = size * size, data = new Float32Array(3 * n);
  if (!(rgba instanceof Uint8ClampedArray) || rgba.length !== 4 * n) throw new Error('error.invalidModelInputImage');
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) data[c * n + i] = (rgba[i * 4 + c] / 255 - mean[c]) / std[c];
  return new ort.Tensor('float32', data, [1, 3, size, size]);
}
self.onmessage = async ({ data }) => {
  try {
    const started = performance.now();
    const loadStarted = performance.now();
    const s = await load();
    const timings = { modelLoadSeconds: (performance.now() - loadStarted) / 1000, preprocessSeconds: 0, inferenceSeconds: 0 };
    if (data.type === 'load') return postMessage({ id: data.id, type: 'done', runtime: runtimeInfo(), seconds: (performance.now() - started) / 1000 });
    const all = [];
    for (let i = 0; i < data.frames.length; i++) {
      postMessage({ type: 'progress', current: i + 1, total: data.frames.length });
      const prepareStarted = performance.now();
      const input = tensorFor(data.frames[i]);
      timings.preprocessSeconds += (performance.now() - prepareStarted) / 1000;
      let output;
      const inferenceStarted = performance.now();
      try { output = await s.run({ [s.inputNames[0]]: input }); }
      finally { input.dispose(); }
      timings.inferenceSeconds += (performance.now() - inferenceStarted) / 1000;
      const raw = output[s.outputNames[0]].data;
      if (raw.length !== 5813) { Object.values(output).forEach(t => t.dispose()); throw new Error('error.modelOutput'); }
      // Verified from the ONNX graph: its output is logits, so sigmoid is necessary.
      const scores = Float32Array.from(raw, x => 1 / (1 + Math.exp(-x)));
      all.push(scores);
      Object.values(output).forEach(t => t.dispose());
    }
    // Capture the setting after initialization: ONNX Runtime may fall back to one thread.
    postMessage({ id: data.id, type: 'done', scores: all, timings, runtime: runtimeInfo(), seconds: (performance.now() - started) / 1000 }, all.map(a => a.buffer));
  } catch (e) { postMessage({ id: data.id, type: 'error', error: e.message }); }
};
