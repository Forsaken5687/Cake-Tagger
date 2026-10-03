importScripts('/vendor/ort.wasm.min.js');
let session;
const mean = [0.48145466, 0.4578275, 0.40821073], std = [0.26862954, 0.26130258, 0.27577711];
async function load() {
  if (session) return session;
  postMessage({ type: 'state', state: 'Kleines Tagging-Modell wird geladen …' });
  ort.env.wasm.wasmPaths = '/vendor/';
  ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 1);
  session = await ort.InferenceSession.create('/model/joytag-int8.onnx', { executionProviders: ['wasm'], graphOptimizationLevel: 'all', intraOpNumThreads: 4 });
  postMessage({ type: 'state', state: 'Bereit' });
  return session;
}
async function tensorFor(url) {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob());
  const size = 448, edge = Math.max(bitmap.width, bitmap.height), scale = size / edge;
  const canvas = new OffscreenCanvas(size, size), ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, Math.floor((edge - bitmap.width) / 2) * scale, Math.floor((edge - bitmap.height) / 2) * scale, bitmap.width * scale, bitmap.height * scale);
  bitmap.close();
  const rgba = ctx.getImageData(0, 0, size, size).data, n = size * size, data = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) data[c * n + i] = (rgba[i * 4 + c] / 255 - mean[c]) / std[c];
  return new ort.Tensor('float32', data, [1, 3, size, size]);
}
self.onmessage = async ({ data }) => {
  try {
    const started = performance.now();
    const s = await load();
    if (data.type === 'load') return postMessage({ id: data.id, type: 'done', seconds: (performance.now() - started) / 1000 });
    const all = [];
    for (let i = 0; i < data.frames.length; i++) {
      postMessage({ type: 'progress', current: i + 1, total: data.frames.length });
      const input = await tensorFor(data.frames[i]);
      const output = await s.run({ [s.inputNames[0]]: input });
      const raw = output[s.outputNames[0]].data;
      if (raw.length !== 5813) throw new Error('Modellausgabe passt nicht zur Tagliste.');
      // Verified from the ONNX graph: its output is logits, so sigmoid is necessary.
      const scores = Float32Array.from(raw, x => 1 / (1 + Math.exp(-x)));
      all.push(scores);
      input.dispose(); Object.values(output).forEach(t => t.dispose());
    }
    postMessage({ id: data.id, type: 'done', scores: all, seconds: (performance.now() - started) / 1000 }, all.map(a => a.buffer));
  } catch (e) { postMessage({ id: data.id, type: 'error', error: e.message }); }
};
