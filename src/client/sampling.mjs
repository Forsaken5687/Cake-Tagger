import { messageError } from '../shared/messages.mjs';
export const MAX_DURATION = 600;
export const MAX_FRAMES = 48;
export const FRAME_COUNTS = [4, 6, 8, 12, 16, 24, 32, 48];

export function samplingPlan(duration, setting = 'auto') {
  // Sample bin midpoints to avoid seeking exactly to the start or end of the clip.
  if (!Number.isFinite(duration) || duration <= 0) throw messageError('error.invalidVideoDuration');
  if (duration > MAX_DURATION) throw messageError('error.videoDurationLimit');
  const mode = String(setting) === 'auto' ? 'auto' : 'fixed';
  const count = mode === 'auto' ? duration <= 15 ? 8 : duration <= 30 ? 12 : duration <= 60 ? 16 : duration <= 120 ? 24 : duration <= 300 ? 32 : 48 : Number(setting);
  if (!FRAME_COUNTS.includes(count)) throw messageError('error.invalidFrameCount');
  return { count, mode, durationSeconds: duration, timestamps: Array.from({ length: count }, (_, i) => duration * (i + 0.5) / count) };
}

export async function hashFile(file) {
  // Match session results by content, independently of a file's display name.
  if (file.size > 250 * 1024 * 1024) throw messageError('error.videoSize');
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');
}
function waitEvent(target, name, action, signal, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); target.removeEventListener(name, ok); target.removeEventListener('error', fail); signal?.removeEventListener('abort', abort); };
    const ok = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(messageError('error.videoDecode')); };
    const abort = () => { cleanup(); reject(new DOMException('analysis.cancelled', 'AbortError')); };
    const timer = setTimeout(() => { cleanup(); reject(messageError('error.videoTimeout')); }, timeout);
    target.addEventListener(name, ok, { once: true }); target.addEventListener('error', fail, { once: true }); signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) return abort();
    try { action(); } catch(e) { cleanup(); reject(e); }
  });
}
export async function sampleVideo(file, setting, signal, knownHash, { previews = false } = {}) {
  if (file.size > 250 * 1024 * 1024) throw messageError('error.videoSize');
  const video = document.createElement('video'); video.muted = true; video.preload = 'auto'; video.playsInline = true;
  const url = URL.createObjectURL(file);
  try {
    await waitEvent(video, 'loadeddata', () => { video.src = url; video.load(); }, signal);
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth) throw messageError('error.invalidVideoDurationOrResolution');
    const plan = samplingPlan(video.duration, setting);
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext('2d'), frames = [], inputs = [];
    const modelCanvas = document.createElement('canvas'); modelCanvas.width = modelCanvas.height = 448;
    const modelCtx = modelCanvas.getContext('2d', { willReadFrequently: true });
    modelCtx.imageSmoothingEnabled = true; modelCtx.imageSmoothingQuality = 'high';
    const edge = Math.max(canvas.width, canvas.height), modelScale = 448 / edge;
    for (const time of plan.timestamps) {
      signal.throwIfAborted();
      await waitEvent(video, 'seeked', () => { video.currentTime = time; }, signal);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height); if (previews) frames.push(canvas.toDataURL('image/jpeg', 0.82));
      modelCtx.fillStyle = '#fff'; modelCtx.fillRect(0, 0, 448, 448);
      modelCtx.drawImage(canvas, Math.floor((edge - canvas.width) / 2) * modelScale, Math.floor((edge - canvas.height) / 2) * modelScale, canvas.width * modelScale, canvas.height * modelScale);
      inputs.push(modelCtx.getImageData(0, 0, 448, 448).data);
    }
    const sha256 = knownHash || await hashFile(file); signal.throwIfAborted();
    return { frames, inputs, sha256, sampledFrames: plan.count, samplingMode: plan.mode, durationSeconds: plan.durationSeconds, timestamps: plan.timestamps };
  } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
}
