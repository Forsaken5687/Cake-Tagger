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

// SHA-256 consumes bounded chunks, preserving the exact hashes of older sessions.
const HASH_CHUNK_BYTES = 1024 * 1024;
const SHA256_K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
]);
export async function hashFile(file, signal) {
  signal?.throwIfAborted();
  const state=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const words=new Uint32Array(64);
  function compress(bytes) {
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    for(let offset=0;offset<bytes.length;offset+=64) {
      for(let i=0;i<16;i++)words[i]=view.getUint32(offset+i*4);
      for(let i=16;i<64;i++) {
        const x=words[i-15],y=words[i-2];
        words[i]=(((x >>> 7) | (x << 25))^((x >>> 18) | (x << 14))^(x>>>3))+words[i-16]+(((y >>> 17) | (y << 15))^((y >>> 19) | (y << 13))^(y>>>10))+words[i-7];
      }
      let [a,b,c,d,e,f,g,h]=state;
      for(let i=0;i<64;i++) {
        const t1=(h+(((e >>> 6) | (e << 26))^((e >>> 11) | (e << 21))^((e >>> 25) | (e << 7)))+((e&f)^(~e&g))+SHA256_K[i]+words[i])>>>0;
        const t2=((((a >>> 2) | (a << 30))^((a >>> 13) | (a << 19))^((a >>> 22) | (a << 10)))+((a&b)^(a&c)^(b&c)))>>>0;
        h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
      }
      state[0]+=a;state[1]+=b;state[2]+=c;state[3]+=d;state[4]+=e;state[5]+=f;state[6]+=g;state[7]+=h;
    }
  }
  let tail=new Uint8Array();
  for(let offset=0;offset<file.size;offset+=HASH_CHUNK_BYTES) {
    signal?.throwIfAborted();
    const bytes=new Uint8Array(await file.slice(offset,offset+HASH_CHUNK_BYTES).arrayBuffer());
    signal?.throwIfAborted();
    const full=bytes.length-bytes.length%64;
    compress(bytes.subarray(0,full));tail=bytes.slice(full);
    // Yield between chunks so controls and cancellation remain responsive.
    await new Promise(resolve=>{
      const channel=new MessageChannel();
      channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve();};
      channel.port2.postMessage(null);
    });
  }
  signal?.throwIfAborted();
  const padding=new Uint8Array(tail.length<56?64:128);padding.set(tail);padding[tail.length]=0x80;
  const view=new DataView(padding.buffer),bits=BigInt(file.size)*8n;
  view.setUint32(padding.length-8,Number(bits>>32n));view.setUint32(padding.length-4,Number(bits&0xffffffffn));
  compress(padding);
  return [...state].map(word=>word.toString(16).padStart(8,'0')).join('');
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
    const sha256 = knownHash || await hashFile(file, signal); signal.throwIfAborted();
    return { frames, inputs, sha256, sampledFrames: plan.count, samplingMode: plan.mode, durationSeconds: plan.durationSeconds, timestamps: plan.timestamps };
  } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
}
