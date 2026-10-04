import { setLanguage, translatePage, localizedText } from './i18n.mjs';
import { errorMessage } from './messages.mjs';

setLanguage({ language: 'auto' }); translatePage();
const status = document.querySelector('#status'), report = document.querySelector('#report');
const run = document.querySelector('#run'), download = document.querySelector('#download');
let details, busy = false;
const worker = new Worker('/engine-worker.js');
localizedText(status, 'analysis.loadingModel');
function fail(error) {
  busy = false; run.disabled = true;
  localizedText(status, errorMessage(error)); worker.terminate();
}
worker.onerror = () => fail(new Error('error.analysisStart'));
worker.onmessage = ({ data }) => {
  if (data.type === 'error') return fail(new Error(data.error));
  if (data.type !== 'done') return;
  busy = false;
  details = { ...details, runtime: data.runtime,
    ...(data.id === 'load' ? { modelLoadSeconds: data.seconds } : { sampledFrames: 1, timings: data.timings, totalSeconds: data.seconds, outputLabels: data.scores[0].length }) };
  report.textContent = JSON.stringify(details, null, 2);
  run.disabled = download.disabled = false; localizedText(status, 'analysis.ready');
};
// The benchmark uses one constant, synthetic image. It never reads user files.
run.onclick = () => {
  if (busy) return;
  busy = true; run.disabled = download.disabled = true;
  localizedText(status, 'diagnostics.running');
  const frame = new Uint8ClampedArray(448 * 448 * 4).fill(127);
  worker.postMessage({ id: 'benchmark', type: 'analyze', frames: [frame] }, [frame.buffer]);
};
download.onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(details, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'cake-tagger-diagnostics.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};
window.addEventListener('pagehide', () => worker.terminate(), { once: true });
worker.postMessage({ id: 'load', type: 'load' });
