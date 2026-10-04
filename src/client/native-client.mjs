import { messageError } from '../shared/messages.mjs';

// A whole video is submitted once; Node owns its frame queue and thread policy.
export function createNativeClient({ token = '', onState = () => {}, onProgress = () => {}, fetcher = fetch } = {}) {
  let active;
  async function request(url, options = {}) {
    return fetcher(url, { ...options, headers: { Authorization: 'Bearer ' + token, ...options.headers } });
  }
  async function infer(frames, parallelism = 'auto', { excludedTags, raw = true } = {}) {
    if (active) throw messageError('error.analysisStart');
    if (!Array.isArray(frames) || !frames.length || frames.length > 48 || frames.some(frame => !(frame instanceof Uint8ClampedArray) || frame.length !== 802816)) throw messageError('error.invalidModelInputImage');
    const controller = new AbortController(); active = controller;
    try {
      const payload = new Uint8Array(frames.length * 802816);
      frames.forEach((frame, index) => payload.set(frame, index * 802816));
      const response = await request('/api/infer?parallelism=' + encodeURIComponent(parallelism) + (raw ? '&raw=1' : ''), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...(excludedTags ? { 'X-Cake-Tagger-Exclusions': JSON.stringify(excludedTags) } : {}) }, body: payload, signal: controller.signal });
      if (!response.ok) { const data = await response.json(); throw messageError(data.error || 'error.nativeInference'); }
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let pending = '', result;
      function accept(line) {
        if (!line.trim()) return;
        const data = JSON.parse(line);
        if (data.type === 'error') throw messageError(data.error);
        if (data.type === 'state') onState(data.state);
        if (data.type === 'progress') onProgress(data.current, data.total);
        if (data.type === 'done') result = data;
      }
      try {
        for (;;) {
          const { value, done } = await reader.read();
          pending += decoder.decode(value, { stream: !done });
          let end;
          while ((end = pending.indexOf('\n')) >= 0) { accept(pending.slice(0, end)); pending = pending.slice(end + 1); }
          if (pending.length > 16000000) throw messageError('error.modelOutput');
          if (done) break;
        }
        accept(pending);
      } finally { reader.releaseLock(); }
      if (!result || (raw && (!Array.isArray(result.scores) || result.scores.length !== frames.length
        || result.scores.some(row => !Array.isArray(row) || row.length !== 5813 || row.some(value => !Number.isFinite(value) || value < 0 || value > 1))))
        || ['modelLoadSeconds', 'preprocessSeconds', 'inferenceSeconds', 'queueSeconds'].some(key => !Number.isFinite(result.timings?.[key]) || result.timings[key] < 0)) throw messageError('error.modelOutput');
      if (!raw && (!Array.isArray(result.analysis?.tags) || !Array.isArray(result.analysis?.uncertain) || !Array.isArray(result.analysis?.uncertainScores)
        || [...result.analysis.tags, ...result.analysis.uncertainScores].some(row => typeof row?.tag !== 'string' || !Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 1 || !Number.isInteger(row.supportingFrames) || row.supportingFrames < 0 || row.supportingFrames > frames.length))) throw messageError('error.modelOutput');
      return { ...(raw ? { scores: result.scores.map(row => Float32Array.from(row)) } : {}), analysis: result.analysis, timings: result.timings, runtime: result.runtime };
    } catch (error) {
      if (controller.signal.aborted) throw new DOMException('analysis.cancelled', 'AbortError');
      controller.abort();
      if (error instanceof TypeError) throw messageError('error.nativeServer');
      throw error;
    } finally { if (active === controller) active = undefined; }
  }
  return { infer, request, stop() { active?.abort(); } };
}
