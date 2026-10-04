import { messageError } from './messages.mjs';

// Extension documents contact loopback directly, never through the website or
// its content script. The session credential stays in this module's memory.
export function createNativeClient({ extension = false, token = '', onState = () => {}, onProgress = () => {}, fetcher = fetch } = {}) {
  const base = extension ? 'http://127.0.0.1:8765' : '';
  let credential = token, active;
  async function connect(signal) {
    if (credential) return;
    const response = await fetcher(base + '/api/connect', { method: 'POST', headers: { 'X-Cake-Tagger-Client': 'extension' }, signal });
    if (!response.ok) throw messageError('error.nativeServer');
    const data = await response.json();
    if (!/^[a-f0-9]{48}$/.test(data.token)) throw messageError('error.nativeServer');
    credential = data.token;
  }
  async function infer(frames, parallelism = 'auto') {
    if (active) throw messageError('error.analysisStart');
    if (!frames.length || frames.length > 48 || frames.some(frame => !(frame instanceof Uint8ClampedArray) || frame.length !== 448 * 448 * 4)) throw messageError('error.invalidModelInputImage');
    const controller = new AbortController(); active = controller;
    const timings = { modelLoadSeconds: 0, preprocessSeconds: 0, inferenceSeconds: 0 };
    const scores = [];
    let runtime;
    try {
      onState('analysis.loadingModel');
      await connect(controller.signal);
      for (let i = 0; i < frames.length; i++) {
        onProgress(i + 1, frames.length);
        const options = { method: 'POST', headers: { Authorization: 'Bearer ' + credential, 'Content-Type': 'application/octet-stream' }, body: frames[i], signal: controller.signal };
        let response = await fetcher(base + '/api/infer?parallelism=' + encodeURIComponent(parallelism), options);
        // Server restarts rotate credentials. Reconnect once without losing selections.
        if (response.status === 401 && extension) {
          credential = ''; await connect(controller.signal);
          options.headers.Authorization = 'Bearer ' + credential;
          response = await fetcher(base + '/api/infer?parallelism=' + encodeURIComponent(parallelism), options);
        }
        const data = await response.json();
        if (!response.ok) throw messageError(data.error || 'error.nativeInference');
        if (!Array.isArray(data.scores) || data.scores.length !== 5813 || data.scores.some(value => !Number.isFinite(value) || value < 0 || value > 1)
          || Object.keys(timings).some(key => !Number.isFinite(data.timings?.[key]) || data.timings[key] < 0)) throw messageError('error.modelOutput');
        scores.push(Float32Array.from(data.scores));
        for (const key of Object.keys(timings)) timings[key] += data.timings[key];
        runtime = data.runtime;
      }
      return { scores, timings, runtime };
    } catch (error) {
      if (controller.signal.aborted) throw new DOMException('analysis.cancelled', 'AbortError');
      if (error instanceof TypeError) throw messageError('error.nativeServer');
      throw error;
    } finally { if (active === controller) active = undefined; }
  }
  return { infer, stop() { active?.abort(); } };
}
