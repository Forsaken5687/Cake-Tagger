import { setLanguage, translatePage, localizedText } from './i18n.mjs';
import { errorMessage } from './messages.mjs';
import { memorySnapshot } from './runtime-metrics.mjs';
import { createNativeClient } from './native-client.mjs';

setLanguage({ language: 'auto' }); translatePage();
const status = document.querySelector('#status'), report = document.querySelector('#report');
const run = document.querySelector('#run'), download = document.querySelector('#download');
let details, busy = false;
let token = location.hash.slice(1) || sessionStorage.getItem('cake-token') || '';
if (location.hash) { sessionStorage.setItem('cake-token', token); history.replaceState(null, '', '/diagnostics.html'); }
const client = createNativeClient({ token });
localizedText(status, 'analysis.ready'); run.disabled = false;
// The benchmark uses one constant, synthetic image. It never reads user files.
run.onclick = async () => {
  if (busy) return;
  busy = true; run.disabled = download.disabled = true;
  localizedText(status, 'diagnostics.running');
  try {
    const started = performance.now();
    const frame = new Uint8ClampedArray(448 * 448 * 4).fill(127);
    const result = await client.infer([frame]);
    details = { runtime: { ...result.runtime, memory: memorySnapshot() }, sampledFrames: 1,
      timings: result.timings, totalSeconds: (performance.now() - started) / 1000, outputLabels: result.scores[0].length };
    report.textContent = JSON.stringify(details, null, 2);
    download.disabled = false; localizedText(status, 'analysis.ready');
  } catch (error) { localizedText(status, errorMessage(error)); }
  finally { busy = false; run.disabled = false; }
};
download.onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(details, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'cake-tagger-diagnostics.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};
window.addEventListener('pagehide', () => client.stop(), { once: true });
