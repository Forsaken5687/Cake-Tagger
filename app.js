import { aggregate, ANALYSIS_VERSION } from './tagging.mjs';
import { makeRecord, applyRecord, tagSource, exportItem } from './corrections.mjs';
const { isExtension, installIntegration, integrationButton } = ['moz-extension:', 'chrome-extension:'].includes(location.protocol)
  ? await import('./extension/integration.mjs')
  : { isExtension: false, installIntegration() {}, integrationButton() {} };
import { samplingPlan } from './sampling.mjs';
import { DEFAULT_THRESHOLD, DEFAULT_COVERAGE, PREPROCESS_VERSION } from './analysis-settings.mjs';
import { createSettingsStore, suggestionPolicy } from './preferences.mjs';
import { installSettings } from './settings-ui.mjs';
import { setLanguage, t, translatePage } from './i18n.mjs';
const $ = s => document.querySelector(s);
const settingsStore = createSettingsStore(isExtension ? { runtime: browser.runtime } : { storage: localStorage, events: window });
let settings;
try { settings = await settingsStore.load(); } catch { settings = settingsStore.get(); }
setLanguage(settings); translatePage();
$('#status').removeAttribute('data-i18n');
let token = location.hash.slice(1), allTags = [], entries = [], running = false, controller, stopping = false;
let mapping, modelSignature, worker, workerSeq = 0, workerJobs = new Map();
// Remove the legacy persistent analysis cache; current results live only in memory.
indexedDB.deleteDatabase('cake-tagger-browser-v1');
const sessionRecords = new Map(), sessionCache = new Map();
let preparing = false;
let pendingEmbeddedFiles;
async function receiveEmbeddedFiles(files) {
  if (running || preparing) { pendingEmbeddedFiles = files; return; }
  await setFiles(files);
}
function drainEmbeddedFiles() {
  if (pendingEmbeddedFiles && !running && !preparing) {
    const files = pendingEmbeddedFiles; pendingEmbeddedFiles = undefined; void receiveEmbeddedFiles(files);
  }
}
async function cached(key, value) {
  if (value) sessionCache.set(key, value);
  return sessionCache.get(key);
}
function terminateWorker() {
  worker?.terminate(); worker = undefined;
  for (const pending of workerJobs.values()) pending.reject(new DOMException('Abgebrochen', 'AbortError'));
  workerJobs.clear();
}
function infer(frames) {
  if (!worker) {
    worker = new Worker('/engine-worker.js');
    worker.onmessage = ({ data }) => {
      if (data.type === 'state') $('#status').textContent = t(data.state);
      if (data.type === 'progress') $('#status').textContent = t(`Analysiere Bild ${data.current} / ${data.total} …`);
      const pending = workerJobs.get(data.id);
      if (pending) {
        workerJobs.delete(data.id);
        if (data.type === 'error') pending.reject(new Error(data.error)); else pending.resolve(data);
      }
    };
    worker.onerror = () => {
      for (const pending of workerJobs.values()) pending.reject(new Error('Browser-Erkennung konnte nicht starten.'));
      workerJobs.clear(); worker?.terminate(); worker = undefined;
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++workerSeq; workerJobs.set(id, { resolve, reject }); worker.postMessage({ id, type: 'analyze', frames }, frames.map(frame => frame.buffer));
  });
}
if (!isExtension && token) { sessionStorage.setItem('cake-token', token); history.replaceState(null, '', '/'); }
else token = sessionStorage.getItem('cake-token') || '';
const api = async (url, options = {}) => {
  const r = await fetch(url, { ...options, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...options.headers } });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Anfrage fehlgeschlagen.');
  return data;
};
function message(text) { $('#message').textContent = t(text); }
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
  entry.state = 'Auswahl aus dieser Sitzung übernommen';
}
async function hashFile(file) {
  if (file.size > 250 * 1024 * 1024) throw new Error('Pro Video sind maximal 250 MB möglich.');
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
    $('#status').textContent = t('Bereit');
  } catch (e) { $('#status').textContent = e.message; }
}
function summary() {
  const complete = entries.filter(e => e.result).length;
  $('#summary').textContent = t(`${entries.length} Videos · ${complete} analysiert`);
  $('#analyze').disabled = running || preparing || !entries.some(e => e.hasFile) || !mapping;
  $('#export').disabled = !complete;
}
function textElement(name, text, cls) {
  const e = document.createElement(name); e.textContent = t(text); if (cls) e.className = cls; return e;
}
const previewDialog = $('#preview-dialog');
let enlargedPreview;
function showPreview() {
  const { frames, index, filename } = enlargedPreview;
  $('#preview-title').textContent = filename;
  $('#preview-image').src = frames[index];
  $('#preview-image').alt = t(`Vorschaubild ${index + 1} von ${frames.length}`);
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
    const hint = document.body.classList.contains('embedded') ? 'Wähle Videos im Upload-Bereich aus.' : 'Wähle Videos aus, um deine Tag-Auswahl zusammenzustellen.';
    empty.append(textElement('span', '▤', 'empty-icon'), textElement('h3', 'Noch keine Videos'), textElement('p', hint));
    $('#results').append(empty);
  }
  for (const entry of entries) {
    const card = textElement('article', '', 'card');
    const heading = textElement('div', '', 'card-heading'), identity = textElement('div', '', 'card-identity');
    const filename = textElement('h2', entry.file.name); filename.title = entry.file.name;
    identity.append(textElement('span', String(entry.index + 1).padStart(2, '0'), 'video-number'), filename);
    heading.append(identity);
    card.append(heading, textElement('p', entry.state, 'card-state'));
    if (entry.frames) {
      const previews = textElement('div', '', 'previews');
      entry.frames.forEach((src, i) => {
        const button = textElement('button', '', 'preview-thumb'), img = document.createElement('img');
        button.type = 'button'; button.setAttribute('aria-label', t(`Vorschaubild ${i + 1} vergrößern`));
        img.src = src; img.alt = t(`Vorschaubild ${i + 1}`);
        button.append(img); button.onclick = () => openPreview(entry.frames, i, entry.file.name); previews.append(button);
      });
      card.append(previews);
    }
    if (entry.result) {
      const tagHeading = textElement('div', '', 'tag-heading');
      tagHeading.append(textElement('h3', 'Tag-Auswahl'), textElement('span', `${[...entry.selected.values()].filter(Boolean).length} ausgewählt`));
      card.append(tagHeading);
      const chips = textElement('div', '', 'tags');
      for (const tag of entry.selected.keys()) {
        if (!settings.showUncertain && entry.result.uncertain.includes(tag) && !entry.selected.get(tag) && tagSource(entry, tag) === 'suggestion') continue;
        const label = textElement('label', '', 'chip'), box = document.createElement('input');
        box.type = 'checkbox'; box.checked = entry.selected.get(tag);
        const original = entry.result.tags.find(row => row.tag === tag) || entry.result.uncertainScores?.find(row => row.tag === tag);
        const source = tagSource(entry, tag), isUncertain = source === 'suggestion' && entry.result.uncertain.includes(tag);
        const origin = source === 'unknown' ? 'Unbekannt' : source === 'suggestion' ? isUncertain ? 'Unsicher' : 'Vorschlag' : 'Ergänzt';
        label.classList.toggle('uncertain', isUncertain);
        label.classList.toggle('manual', origin === 'Ergänzt');
        label.title = t(origin === 'Ergänzt' ? 'Manuell ergänzt' : origin === 'Unbekannt' ? 'Herkunft im alten Ergebnis nicht dokumentiert' : 'Ursprünglicher Modellvorschlag');
        if (original?.supportingFrames) label.title += t(` · erkannt in ${original.supportingFrames} von ${entry.result.sampledFrames} Vorschaubildern`);
        box.addEventListener('change', () => { entry.selected.set(tag, box.checked); changed(entry); render(); });
        label.append(box, textElement('span', tag), textElement('span', origin, 'tag-origin')); chips.append(label);
        if (settings.showScores && source === 'suggestion' && entry.originalSuggestionsKnown !== false && Number.isFinite(original?.confidence)) {
          const score = textElement('span', `Score ${Math.round(original.confidence * 100)} %`, 'tag-score');
          score.title = 'Modellscore: Durchschnitt der zwei stärksten Bildtreffer. Keine gemessene Wahrscheinlichkeit für einen richtigen Tag.';
          score.title = t(score.title);
          label.append(score);
        }
      }
      card.append(chips);
      if (!entry.result.tags.length && entry.originalSuggestionsKnown !== false) card.append(textElement('p', 'Keine ausreichend klaren Tags gefunden. Bitte manuell prüfen.'));
      if (entry.originalSuggestionsKnown === false) card.append(textElement('p', 'Aus altem Export übernommen. Ursprüngliche Vorschläge und Scores sind hier nicht vollständig bekannt.'));
      const add = textElement('div', '', 'tag-add'), input = document.createElement('input'), list = document.createElement('datalist');
      list.id = 'tags-' + entry.index; allTags.forEach(t => { const o = document.createElement('option'); o.value = t; list.append(o); });
      input.type = 'text'; input.placeholder = t('Weiteren Tag suchen …'); input.setAttribute('list', list.id); input.setAttribute('aria-label', t('Tag ergänzen für ' + entry.file.name));
      const button = textElement('button', 'Ergänzen', 'quiet');
      const addTag = () => {
        const found = allTags.find(t => t.toLowerCase() === input.value.trim().toLowerCase());
        if (!found) return message('Bitte einen Tag aus deiner vorhandenen Liste wählen.');
        if (!entry.selected.has(found)) { entry.tagSources ||= {}; entry.tagSources[found] = 'manual'; }
        entry.selected.set(found, true); changed(entry); message(''); render();
      };
      button.onclick = addTag; input.onkeydown = e => { if (e.key === 'Enter') addTag(); };
      add.append(input, list, button); card.append(add);
      const transfer = integrationButton(entry, textElement, message);
      if (transfer) card.append(transfer);
    }
    if (entry.error) card.append(textElement('p', entry.error, 'error'));
    $('#results').append(card);
  }
  summary();
}
async function setFiles(files) {
  if (running || preparing) return;
  preparing = true; summary(); message('Videos werden vorbereitet …');
  try {
      const next = [...files].filter(f => /\.(mp4|m4v|webm|mov)$/i.test(f.name)).map((file, index) => ({ file, index, hasFile: true, state: 'Wartet auf Analyse', selected: new Map() }));
    for (let i = 0; i < next.length; i++) {
      const entry = next[i];
      try {
        entry.sha256 = await hashFile(entry.file);
        const existing = entries.find(old => old.sha256 === entry.sha256);
        if (existing) { next[i] = { ...existing, file: entry.file, index: entry.index }; continue; }
        const record = sessionRecords.get(entry.sha256); if (record) await restore(entry, record);
      }
      catch (e) { entry.error = e.message; }
    }
    entries = next;
    message('');
  } finally { preparing = false; render(); drainEmbeddedFiles(); }
}
$('#files').onchange = e => setFiles(e.target.files);
$('#drop').ondragover = e => { e.preventDefault(); $('#drop').classList.add('over'); };
$('#drop').ondragleave = () => $('#drop').classList.remove('over');
$('#drop').ondrop = e => { e.preventDefault(); $('#drop').classList.remove('over'); setFiles(e.dataTransfer.files); };
function waitEvent(target, name, action, signal, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); target.removeEventListener(name, ok); target.removeEventListener('error', fail); signal?.removeEventListener('abort', abort); };
    const ok = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('Das Video lässt sich im Browser nicht lesen.')); };
    const abort = () => { cleanup(); reject(new DOMException('Abgebrochen', 'AbortError')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Das Lesen des Videos dauert zu lange.')); }, timeout);
    target.addEventListener(name, ok, { once: true }); target.addEventListener('error', fail, { once: true }); signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) return abort();
    try { action(); } catch(e) { cleanup(); reject(e); }
  });
}
async function sample(file, setting, signal, knownHash) {
  if (file.size > 250 * 1024 * 1024) throw new Error('Pro Video sind maximal 250 MB möglich.');
  const video = document.createElement('video'); video.muted = true; video.preload = 'auto'; video.playsInline = true;
  const url = URL.createObjectURL(file);
  try {
    await waitEvent(video, 'loadeddata', () => { video.src = url; video.load(); }, signal);
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth) throw new Error('Ungültige Videolänge oder Auflösung.');
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
$('#analyze').onclick = async () => {
  if (running || preparing) return;
  running = true; summary();
  try { settings = await settingsStore.load(); } catch (error) { running = false; summary(); message(error.message); return; }
  running = true; controller = new AbortController(); $('#files').disabled = true; $('#cancel').hidden = false; message(''); summary();
  const setting = settings.frames;
  const threshold = DEFAULT_THRESHOLD;
  const analysisSettings = { ...settings, excludedTags: [...settings.excludedTags] };
  const coverage = DEFAULT_COVERAGE, analysisPolicy = ANALYSIS_VERSION + ':' + coverage + ':' + suggestionPolicy(analysisSettings);
  try {
    for (const entry of entries) {
      if (!entry.hasFile) continue;
      const expectedCount = setting === 'auto' ? (entry.result?.durationSeconds ? samplingPlan(entry.result.durationSeconds).count : null) : Number(setting);
      if (entry.result && entry.frames && entry.result.sampledFrames === expectedCount && entry.result.threshold === threshold && entry.result.analysisPolicy === analysisPolicy) continue;
      controller.signal.throwIfAborted(); entry.state = 'Vorschaubilder werden gelesen …'; entry.error = ''; render();
      try {
        const started = performance.now();
        const sampleData = await sample(entry.file, setting, controller.signal, entry.sha256);
        const samplingSeconds = (performance.now() - started) / 1000;
        const count = sampleData.sampledFrames;
        entry.frames = sampleData.frames; entry.state = `${count} Vorschaubilder werden analysiert …`; render();
        const key = analysisKey(sampleData.sha256, count, threshold, analysisPolicy);
        let result = await cached(key);
        if (result) result = { ...result, filename: entry.file.name, cached: true };
        else {
          const inference = await infer(sampleData.inputs);
          controller.signal.throwIfAborted();
          result = { filename: entry.file.name, sha256: sampleData.sha256, ...aggregate(inference.scores, mapping, threshold, coverage, analysisSettings), sampledFrames: count, threshold, analysisPolicy, model: 'JoyTag-INT8', seconds: Math.round((performance.now() - started) / 100) / 10, timings: { samplingSeconds, ...inference.timings, totalSeconds: (performance.now() - started) / 1000 }, createdAt: new Date().toISOString() };
          await cached(key, result);
        }
        result = { ...result, sampledFrames: count, samplingMode: sampleData.samplingMode, durationSeconds: sampleData.durationSeconds };
        const previous = sessionRecords.get(result.sha256);
        if (previous) applyRecord(entry, { ...previous, originalSuggestionsKnown: true }, result);
        else { entry.result = result; entry.selected = new Map([...result.tags.map(t => [t.tag, true]), ...result.uncertain.map(tag => [tag, false])]); entry.tagSources = Object.fromEntries([...entry.selected.keys()].map(tag => [tag, 'suggestion'])); entry.reviewed = false; entry.originalSuggestionsKnown = true; }
        entry.updatedAt = entry.updatedAt || new Date().toISOString(); await remember(entry);
        entry.state = result.cached ? `Gespeichertes Ergebnis geladen · ${count} Bilder · bitte prüfen` : `Analyse abgeschlossen · ${count} Bilder · ${result.seconds} s · bitte prüfen`;
      } catch (e) {
        if (e.name === 'AbortError') { entry.state = 'Abgebrochen'; throw e; }
        entry.error = e.message; entry.state = 'Analyse fehlgeschlagen';
      }
      render();
    }
  } catch (e) { message(e.name === 'AbortError' ? 'Analyse abgebrochen. Fertige Ergebnisse bleiben erhalten.' : e.message); }
  finally { running = false; $('#files').disabled = false; $('#cancel').hidden = true; render(); $('#status').textContent = t('Bereit'); drainEmbeddedFiles(); }
};
$('#cancel').onclick = () => { controller?.abort(); terminateWorker(); };
$('#export').onclick = async () => {
  $('#export').disabled = true;
  try {
    if (isExtension) {
      const snapshot = { version: 2, source: 'cake-tagger-local', createdAt: new Date().toISOString(), items: entries.filter(e => e.result).map(exportItem) };
      const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'cake-tags.json'; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000); message(''); return;
    }
    const output = await api('/api/export', { method: 'POST', body: JSON.stringify({ items: entries.filter(e => e.result).map(makeRecord) }) });
    message('');
    const link = document.createElement('a'); link.href = output.download; link.download = 'cake-tags.json'; document.body.append(link); link.click(); link.remove();
  } catch (e) { message('Export fehlgeschlagen: ' + e.message); }
  finally { render(); }
};
$('#quit').onclick = async () => {
  controller?.abort(); terminateWorker(); stopping = true;
  try { await api('/api/stop', { method: 'POST' }); $('#status').textContent = t('Programm beendet'); message('Du kannst dieses Fenster schließen.'); $('#analyze').disabled = true; } catch (e) { stopping = false; message(e.message); }
};
await status();
installIntegration(receiveEmbeddedFiles);
installSettings(settingsStore, allTags, document.body.classList.contains('embedded'));
settingsStore.subscribe(next => {
  settings = next; setLanguage(settings); translatePage();
  if (!running && mapping) $('#status').textContent = t('Bereit');
  render();
});
window.addEventListener('focus', () => { void settingsStore.load().catch(() => {}); });
render();

