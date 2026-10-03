export const MAX_DURATION = 600;
export const MAX_FRAMES = 48;
export const FRAME_COUNTS = [4, 6, 8, 12, 16, 24, 32, 48];

export function samplingPlan(duration, setting = 'auto') {
  if (!Number.isFinite(duration) || duration <= 0) throw Error('Ungültige Videolänge.');
  if (duration > MAX_DURATION) throw Error('Videos dürfen höchstens 10 Minuten lang sein.');
  const mode = String(setting) === 'auto' ? 'auto' : 'fixed';
  const count = mode === 'auto' ? duration <= 15 ? 8 : duration <= 30 ? 12 : duration <= 60 ? 16 : duration <= 120 ? 24 : duration <= 300 ? 32 : 48 : Number(setting);
  if (!FRAME_COUNTS.includes(count)) throw Error('Ungültige Bildanzahl.');
  return { count, mode, durationSeconds: duration, timestamps: Array.from({ length: count }, (_, i) => duration * (i + 0.5) / count) };
}
