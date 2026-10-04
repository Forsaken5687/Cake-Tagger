import { message, messageError, errorMessage } from './messages.mjs';
import { aggregate, ANALYSIS_VERSION } from './tagging.mjs';
import { makeRecord, applyRecord, tagSource, exportItem } from './corrections.mjs';
import { samplingPlan } from './sampling.mjs';
import { DEFAULT_THRESHOLD, DEFAULT_COVERAGE, PREPROCESS_VERSION } from './analysis-settings.mjs';
import { createSettingsStore, suggestionPolicy } from './preferences.mjs';
import { installSettings } from './settings-ui.mjs';
import { createUploadAutoAnalysis } from './extension/auto-analysis.mjs';
import { createInferencePool, inferenceConcurrency } from './inference-pool.mjs';
import { memorySnapshot } from './runtime-metrics.mjs';
import { setLanguage, setSiteLanguage, t, translatePage, localizedText, localizedAttribute } from './i18n.mjs';
const { isExtension, installIntegration, integrationButton } = ['moz-extension:', 'chrome-extension:'].includes(location.protocol)
  ? await import('./extension/integration.mjs')
  : { isExtension: false, installIntegration() {}, integrationButton() {} };
const $ = s => document.querySelector(s);
const settingsStore = createSettingsStore(isExtension ? { runtime: browser.runtime } : { storage: localStorage, events: window });
let settings;
try { settings = await settingsStore.load(); } catch { settings = settingsStore.get(); }
setLanguage(settings); translatePage();
let token = location.hash.slice(1), allTags = [], entries = [], running = false, controller, stopping = false;
let mapping, modelSignature, inferencePool, poolPreference;
// Remove the legacy persistent analysis cache; current results live only in memory.
indexedDB.deleteDatabase('cake-tagger-browser-v1');
const sessionRecords = new Map(), sessionCache = new Map();
let preparing = false;
const uploadAuto = createUploadAutoAnalysis({
  busy: () => running || preparing,
  enabled: () => document.body.classList.contains('embedded') && settings.autoAnalyzeEmbed,
  prepare: setFiles,
  analyze: targets => analyze(targets, true)
});
function receiveFiles(files) { return uploadAuto.receive(files).catch(error => showMessage(errorMessage(error))); }
function drainEmbeddedFiles() { void uploadAuto.drain(); }
async function cached(key, value) {
  if (value) sessionCache.set(key, value);
  return sessionCache.get(key);
}
function terminateWorker() {
  inferencePool?.stop();
}
function infer(frames, parallelism) {
  // Reconfigure between batches; changing settings never interrupts a running video.
  if (!inferencePool || poolPreference !== parallelism) {
    inferencePool?.stop(); poolPreference = parallelism;
    inferencePool = createInferencePool({
      createWorker: () => new Worker('/engine-worker.js?parallelism=' + encodeURIComponent(parallelism)),
      concurrency: inferenceConcurrency({ isolated: globalThis.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined', cores: navigator.hardwareConcurrency, memoryGB: navigator.deviceMemory, parallelism }),
      onState: state => localizedText($('#status'), state),
      onProgress: (current, total) => localizedText($('#status'), message('analysis.progress', { current, total }))
    });
  }
  return inferencePool.infer(frames).then(async result => {
    let serverMetrics = { hostMemory: null, serverMemory: null };
    // Diagnostics are optional: an unavailable or older server must not discard tags.
    if (!isExtension) { try { serverMetrics = await api('/api/runtime', { signal: AbortSignal.timeout(1500) }); } catch {} }
    return { ...result, runtime: { ...result.runtime, parallelismLimit: parallelism, memory: memorySnapshot(), ...serverMetrics } };
  });
}
if (!isExtension && token) { sessionStorage.setItem('cake-token', token); history.replaceState(null, '', '/'); }
else token = sessionStorage.getItem('cake-token') || '';
const api = async (url, options = {}) => {
  const r = await fetch(url, { ...options, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...options.headers } });
  const data = await r.json();
  if (!r.ok) throw messageError(data.error || 'error.requestFailed');
  return data;
};
function showMessage(text) { localizedText($('#message'), text); }
function remember(entry) {
  sessionRecords.set(entry.result.sha256, makeRecord(entry));
}
function changed(entry, resetReview = true) {
  if (resetReview) entry.reviewed = false;
  entry.updatedAt = new Date().toISOString(); remember(entry);
}
function analysisKey(sha256, count, threshold, policy = '', preprocess = PREPROCESS_VERSION) { return sha256 + '|' + count + '|' + threshold + '|' + modelSignature + '|' + preprocess + (policy ? '|' + policy : ''); }
async function restore(entry, record) {
  applyRecord(entry, record);
  entry.state = 'analysis.restored';
}
async function hashFile(file) {
  // Match session results by content, independently of a file's display name.
  if (file.size > 250 * 1024 * 1024) throw messageError('error.videoSize');
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function status() {
  if (stopping) return;
  try {
    const [tagText, map, provenance] = await Promise.all([
      fetch('/tags.txt').then(r => r.text()), fetch('/mapping.json').then(r => r.json()), fetch('/model/provenance.json').then(r => r.json()),
    ]);
    allTags = tagText.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean); mapping = map;
    modelSignature = provenance.sha256 + JSON.stringify(map);
    localizedText($('#status'), 'analysis.ready');
  } catch (e) { localizedText($('#status'), errorMessage(e)); }
}
function summary() {
  const complete = entries.filter(e => e.result).length;
  localizedText($('#summary'), message(entries.length === 1 ? 'results.summarySingle' : 'results.summary', { count: entries.length, done: complete }));
  $('#analyze').disabled = running || preparing || !entries.some(e => e.hasFile) || !mapping;
  $('#export').disabled = !complete;
}
function textElement(name, text, cls, localize = true) {
  const e = document.createElement(name);
  if (localize && text) localizedText(e, text); else e.textContent = text;
  if (cls) e.className = cls; return e;
}
const previewDialog = $('#preview-dialog');
let enlargedPreview;
function showPreview() {
  const { frames, index, filename } = enlargedPreview;
  $('#preview-title').textContent = filename;
  $('#preview-image').src = frames[index];
  localizedAttribute($('#preview-image'), 'alt', 'preview.position', { current: index + 1, total: frames.length });
  $('#preview-position').textContent = `${index + 1} / ${frames.length}`;
  $('#preview-prev').disabled = index === 0;
  $('#preview-next').disabled = index === frames.length - 1;
}
function openPreview(frames, index, filename) {
  enlargedPreview = { frames, index, filename }; showPreview();
  document.body.classList.add('preview-open'); previewDialog.showModal();
}
function movePreview(offset) {
  if (!enlargedPreview) return;
  enlargedPreview.index = Math.max(0, Math.min(enlargedPreview.frames.length - 1, enlargedPreview.index + offset));
  showPreview();
}
$('#preview-close').onclick = () => previewDialog.close();
$('#preview-prev').onclick = () => movePreview(-1);
$('#preview-next').onclick = () => movePreview(1);
previewDialog.addEventListener('click', e => { if (e.target === previewDialog) previewDialog.close(); });
previewDialog.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); movePreview(e.key === 'ArrowLeft' ? -1 : 1); }
});
previewDialog.addEventListener('close', () => {
  document.body.classList.remove('preview-open'); $('#preview-image').removeAttribute('src'); enlargedPreview = undefined;
});
function render() {
  $('#results').replaceChildren();
  if (!entries.length) {
    const empty = textElement('div', '', 'empty-state');
    const hint = document.body.classList.contains('embedded') ? 'results.emptyEmbed' : 'results.emptyStandalone';
    empty.append(textElement('span', '▤', 'empty-icon'), textElement('h3', 'results.emptyTitle'), textElement('p', hint));
    $('#results').append(empty);
  }
  for (const entry of entries) {
    const card = textElement('article', '', 'card');
    const heading = textElement('div', '', 'card-heading'), identity = textElement('div', '', 'card-identity');
    const filename = textElement('h2', entry.file.name, '', false); filename.title = entry.file.name;
    identity.append(textElement('span', String(entry.index + 1).padStart(2, '0'), 'video-number'), filename);
    heading.append(identity);
    card.append(heading, textElement('p', entry.state, 'card-state'));
    if (entry.frames) {
      const previews = textElement('div', '', 'previews');
      entry.frames.forEach((src, i) => {
        const button = textElement('button', '', 'preview-thumb'), img = document.createElement('img');
        button.type = 'button'; button.setAttribute('aria-label', t('preview.enlarge', { number: i + 1 }));
        img.src = src; img.alt = t('preview.image', { number: i + 1 });
        button.append(img); button.onclick = () => openPreview(entry.frames, i, entry.file.name); previews.append(button);
      });
      card.append(previews);
    }
    if (entry.result) {
      const tagHeading = textElement('div', '', 'tag-heading');
      tagHeading.append(textElement('h3', 'tags.selection'), textElement('span', message('tags.selectedCount', { count: [...entry.selected.values()].filter(Boolean).length })));
      card.append(tagHeading);
      const chips = textElement('div', '', 'tags');
      for (const tag of entry.selected.keys()) {
        if (!settings.showUncertain && entry.result.uncertain.includes(tag) && !entry.selected.get(tag) && tagSource(entry, tag) === 'suggestion') continue;
        const label = textElement('label', '', 'chip'), box = document.createElement('input');
        box.type = 'checkbox'; box.checked = entry.selected.get(tag);
        const original = entry.result.tags.find(row => row.tag === tag) || entry.result.uncertainScores?.find(row => row.tag === tag);
        const source = tagSource(entry, tag), isUncertain = source === 'suggestion' && entry.result.uncertain.includes(tag);
        const origin = source === 'unknown' ? 'tags.unknown' : source === 'suggestion' ? isUncertain ? 'tags.uncertain' : 'tags.suggested' : 'tags.added';
        label.classList.toggle('uncertain', isUncertain);
        label.classList.toggle('manual', source === 'manual');
        label.title = t(origin === 'tags.added' ? 'tags.manualOrigin' : origin === 'tags.unknown' ? 'tags.unknownOrigin' : 'tags.modelOrigin');
        if (original?.supportingFrames) label.title += t('tags.frameSupport', { count: original.supportingFrames, total: entry.result.sampledFrames });
        box.addEventListener('change', () => { entry.selected.set(tag, box.checked); changed(entry); render(); });
        label.append(box, textElement('span', tag, '', false), textElement('span', origin, 'tag-origin')); chips.append(label);
        if (settings.showScores && source === 'suggestion' && entry.originalSuggestionsKnown !== false && Number.isFinite(original?.confidence)) {
          const score = textElement('span', message('tags.score', { score: Math.round(original.confidence * 100) }), 'tag-score');
          score.title = 'tags.scoreHint';
          score.title = t(score.title);
          label.append(score);
        }
      }
      card.append(chips);
      if (!entry.result.tags.length && entry.originalSuggestionsKnown !== false) card.append(textElement('p', 'results.noClearTags'));
      if (entry.originalSuggestionsKnown === false) card.append(textElement('p', 'results.legacyHint'));
      const add = textElement('div', '', 'tag-add'), input = document.createElement('input'), list = document.createElement('datalist');
      list.id = 'tags-' + entry.index; allTags.forEach(t => { const o = document.createElement('option'); o.value = t; list.append(o); });
      input.type = 'text'; input.placeholder = t('tags.search'); input.setAttribute('list', list.id); input.setAttribute('aria-label', t('tags.addForFile', { filename: entry.file.name }));
      const button = textElement('button', 'tags.add', 'quiet');
      const addTag = () => {
        const found = allTags.find(t => t.toLowerCase() === input.value.trim().toLowerCase());
        if (!found) return showMessage('error.chooseTag');
        if (!entry.selected.has(found)) { entry.tagSources ||= {}; entry.tagSources[found] = 'manual'; }
        entry.selected.set(found, true); changed(entry); showMessage(''); render();
      };
      button.onclick = addTag; input.onkeydown = e => { if (e.key === 'Enter') addTag(); };
      add.append(input, list, button); card.append(add);
      const transfer = integrationButton(entry, textElement, showMessage);
      if (transfer) card.append(transfer);
    }
    if (entry.error) card.append(textElement('p', entry.error, 'error'));
    $('#results').append(card);
  }
  summary();
}
async function setFiles(files) {
  if (running || preparing) return;
  preparing = true; summary(); showMessage('analysis.preparing');
  try {
    const next = [...files].filter(f => /\.(mp4|m4v|webm|mov)$/i.test(f.name)).map((file, index) => ({ file, index, hasFile: true, state: 'analysis.waiting', selected: new Map() }));
    for (let i = 0; i < next.length; i++) {
      const entry = next[i];
      try {
        entry.sha256 = await hashFile(entry.file);
        const existing = entries.find(old => old.sha256 === entry.sha256);
        if (existing) { next[i] = { ...existing, file: entry.file, index: entry.index }; continue; }
        const record = sessionRecords.get(entry.sha256); if (record) await restore(entry, record);
      }
      catch (e) { entry.error = errorMessage(e); }
    }
    entries = next;
    showMessage('');
  } finally { preparing = false; render(); }
  return entries;
}
$('#files').onchange = e => receiveFiles(e.target.files);
$('#drop').ondragover = e => { e.preventDefault(); $('#drop').classList.add('over'); };
$('#drop').ondragleave = () => $('#drop').classList.remove('over');
$('#drop').ondrop = e => { e.preventDefault(); $('#drop').classList.remove('over'); receiveFiles(e.dataTransfer.files); };
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
async function sample(file, setting, signal, knownHash) {
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
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height); frames.push(canvas.toDataURL('image/jpeg', 0.82));
      modelCtx.fillStyle = '#fff'; modelCtx.fillRect(0, 0, 448, 448);
      modelCtx.drawImage(canvas, Math.floor((edge - canvas.width) / 2) * modelScale, Math.floor((edge - canvas.height) / 2) * modelScale, canvas.width * modelScale, canvas.height * modelScale);
      inputs.push(modelCtx.getImageData(0, 0, 448, 448).data);
    }
    const sha256 = knownHash || await hashFile(file); signal.throwIfAborted();
    return { frames, inputs, sha256, sampledFrames: plan.count, samplingMode: plan.mode, durationSeconds: plan.durationSeconds };
  } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
}
async function analyze(targets = entries, automatic = false) {
  if (running || preparing || !mapping) return;
  running = true; summary();
  try { settings = await settingsStore.load(); } catch (error) { running = false; summary(); showMessage(errorMessage(error)); drainEmbeddedFiles(); return; }
  if (automatic && !settings.autoAnalyzeEmbed) { running = false; summary(); return; }
  controller = new AbortController(); $('#files').disabled = true; $('#cancel').hidden = false; showMessage(''); summary();
  const setting = settings.frames;
  const threshold = DEFAULT_THRESHOLD;
  const analysisSettings = { ...settings, excludedTags: [...settings.excludedTags] };
  // Freeze preferences for this batch; later changes apply to subsequent analyses.
  const coverage = DEFAULT_COVERAGE, analysisPolicy = ANALYSIS_VERSION + ':' + coverage + ':' + suggestionPolicy(analysisSettings);
  try {
    for (const entry of targets) {
      if (!entry.hasFile) continue;
      const expectedCount = setting === 'auto' ? (entry.result?.durationSeconds ? samplingPlan(entry.result.durationSeconds).count : null) : Number(setting);
      if (entry.result && entry.frames && entry.result.sampledFrames === expectedCount && entry.result.threshold === threshold && entry.result.analysisPolicy === analysisPolicy) continue;
      controller.signal.throwIfAborted(); entry.state = 'analysis.sampling'; entry.error = ''; render();
      try {
        const started = performance.now();
        const sampleData = await sample(entry.file, setting, controller.signal, entry.sha256);
        const samplingSeconds = (performance.now() - started) / 1000;
        const count = sampleData.sampledFrames;
        entry.frames = sampleData.frames; entry.state = message('analysis.frameProgress', { count }); render();
        const key = analysisKey(sampleData.sha256, count, threshold, analysisPolicy);
        let result = await cached(key);
        if (result) result = { ...result, filename: entry.file.name, cached: true };
        else {
          const inference = await infer(sampleData.inputs, analysisSettings.parallelism);
          controller.signal.throwIfAborted();
          result = { filename: entry.file.name, sha256: sampleData.sha256, ...aggregate(inference.scores, mapping, threshold, coverage, analysisSettings), sampledFrames: count, threshold, analysisPolicy, model: 'JoyTag-INT8', runtime: inference.runtime, seconds: Math.round((performance.now() - started) / 100) / 10, timings: { samplingSeconds, ...inference.timings, totalSeconds: (performance.now() - started) / 1000 }, createdAt: new Date().toISOString() };
          await cached(key, result);
        }
        result = { ...result, sampledFrames: count, samplingMode: sampleData.samplingMode, durationSeconds: sampleData.durationSeconds };
        const previous = sessionRecords.get(result.sha256);
        if (previous) applyRecord(entry, { ...previous, originalSuggestionsKnown: true }, result);
        else { entry.result = result; entry.selected = new Map([...result.tags.map(t => [t.tag, true]), ...result.uncertain.map(tag => [tag, false])]); entry.tagSources = Object.fromEntries([...entry.selected.keys()].map(tag => [tag, 'suggestion'])); entry.reviewed = false; entry.originalSuggestionsKnown = true; }
        entry.updatedAt = entry.updatedAt || new Date().toISOString(); await remember(entry);
        entry.state = result.cached ? message('analysis.cached', { count }) : message('analysis.complete', { count, seconds: result.seconds });
      } catch (e) {
        if (e.name === 'AbortError') { entry.state = 'analysis.cancelled'; throw e; }
        entry.error = errorMessage(e); entry.state = 'analysis.failed';
      }
      render();
    }
  } catch (e) { showMessage(e.name === 'AbortError' ? 'analysis.cancelledHint' : errorMessage(e)); }
  finally { running = false; $('#files').disabled = false; $('#cancel').hidden = true; render(); localizedText($('#status'), 'analysis.ready'); drainEmbeddedFiles(); }
}
$('#analyze').onclick = () => analyze();
$('#cancel').onclick = () => { controller?.abort(); terminateWorker(); };
$('#export').onclick = async () => {
  $('#export').disabled = true;
  try {
    if (isExtension) {
      const snapshot = { version: 2, source: 'cake-tagger-local', createdAt: new Date().toISOString(), items: entries.filter(e => e.result).map(exportItem) };
      const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'cake-tags.json'; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000); showMessage(''); return;
    }
    const output = await api('/api/export', { method: 'POST', body: JSON.stringify({ items: entries.filter(e => e.result).map(makeRecord) }) });
    showMessage('');
    const link = document.createElement('a'); link.href = output.download; link.download = 'cake-tags.json'; document.body.append(link); link.click(); link.remove();
  } catch (e) { showMessage(message('error.exportFailed', { error: errorMessage(e) })); }
  finally { render(); }
};
$('#quit').onclick = async () => {
  controller?.abort(); terminateWorker(); stopping = true;
  try { await api('/api/stop', { method: 'POST' }); localizedText($('#status'), 'analysis.stopped'); showMessage('page.stoppedHint'); $('#analyze').disabled = true; } catch (e) { stopping = false; showMessage(errorMessage(e)); }
};
await status();
installIntegration(receiveFiles, theme => {
  setSiteLanguage(theme.language); translatePage();
  if (!running && mapping) localizedText($('#status'), 'analysis.ready');
  render();
});
installSettings(settingsStore, allTags, document.body.classList.contains('embedded'));
settingsStore.subscribe(next => {
  settings = next; setLanguage(settings); translatePage();
  if (!running && mapping) localizedText($('#status'), 'analysis.ready');
  render();
});
window.addEventListener('focus', () => { void settingsStore.load().catch(() => {}); });
render();

