import { aggregate, ANALYSIS_VERSION } from './tagging.mjs';
import { makeRecord, applyRecord, tagSource } from './corrections.mjs';
import { samplingPlan } from './sampling.mjs';
import { DEFAULT_THRESHOLD, DEFAULT_COVERAGE, PREPROCESS_VERSION } from './analysis-settings.mjs';
const $ = s => document.querySelector(s);
let token = location.hash.slice(1), allTags = [], entries = [], running = false, controller, stopping = false;
let mapping, modelSignature, worker, workerSeq = 0, workerJobs = new Map();
let savedRecords = new Map(), saveQueue = Promise.resolve(), pendingSaves = 0, failedSaves = new Set(), preparing = false;
const database = new Promise(resolve => {
  const req = indexedDB.open('cake-tagger-browser-v1', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('results');
  req.onsuccess = () => resolve(req.result); req.onerror = () => resolve(null);
});
async function cached(key, value) {
  const db = await database;
  if (!db) return undefined;
  return new Promise(resolve => {
    const tx = db.transaction('results', value ? 'readwrite' : 'readonly');
    const store = tx.objectStore('results');
    const req = value ? store.put(value, key) : store.get(key);
    req.onsuccess = () => resolve(req.result); req.onerror = () => resolve(undefined);
  });
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
      if (data.type === 'state') $('#status').textContent = data.state;
      if (data.type === 'progress') $('#status').textContent = `Analysiere Bild ${data.current} / ${data.total} …`;
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
if (token) { sessionStorage.setItem('cake-token', token); history.replaceState(null, '', '/'); }
else token = sessionStorage.getItem('cake-token') || '';
const api = async (url, options = {}) => {
  const r = await fetch(url, { ...options, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...options.headers } });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Anfrage fehlgeschlagen.');
  return data;
};
function message(text) { $('#message').textContent = text; }
function saveStatus() {
  $('#save-status').textContent = pendingSaves ? 'Korrekturen werden gespeichert …' : failedSaves.size ? 'Speichern fehlgeschlagen. Bitte Ergebnisse zur Sicherheit exportieren.' : 'Korrekturen sind lokal gespeichert.';
}
function persist(entry) {
  const record = makeRecord(entry);
  savedRecords.set(record.sha256, record); pendingSaves++; saveStatus();
  saveQueue = saveQueue.then(() => api('/api/corrections', { method: 'PUT', body: JSON.stringify(record) }))
    .then(() => { failedSaves.delete(record.sha256); })
    .catch(e => { failedSaves.add(record.sha256); message('Korrektur konnte nicht gespeichert werden: ' + e.message); })
    .finally(() => { pendingSaves--; saveStatus(); });
  return saveQueue;
}
function changed(entry, resetReview = true) {
  if (resetReview) entry.reviewed = false;
  entry.updatedAt = new Date().toISOString(); persist(entry);
}
function analysisKey(sha256, count, threshold, policy = '', preprocess = PREPROCESS_VERSION) { return sha256 + '|' + count + '|' + threshold + '|' + modelSignature + '|' + preprocess + (policy ? '|' + policy : ''); }
async function restore(entry, record) {
  let baseline = record.result;
  if (!record.originalSuggestionsKnown && baseline.threshold != null) {
    const original = await cached(analysisKey(record.sha256, baseline.sampledFrames, baseline.threshold, '', 'preprocess-v1'));
    if (original?.sha256 === record.sha256) { baseline = original; record = { ...record, result: original, originalSuggestionsKnown: true }; }
  }
  applyRecord(entry, record, baseline);
  entry.state = 'Gespeicherte Korrekturen wiederhergestellt' + (entry.hasFile ? '' : ' · für Vorschaubilder Video erneut auswählen');
  if (record.originalSuggestionsKnown && savedRecords.get(record.sha256)?.originalSuggestionsKnown === false) await persist(entry);
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
    $('#status').textContent = 'Bereit';
  } catch (e) { $('#status').textContent = e.message; }
}
function summary() {
  const complete = entries.filter(e => e.result).length;
  $('#summary').textContent = `${entries.length} Videos · ${complete} analysiert · ${entries.filter(e => e.reviewed).length} geprüft`;
  $('#analyze').disabled = running || preparing || !entries.some(e => e.hasFile) || !mapping;
  $('#export').disabled = !complete;
}
function textElement(name, text, cls) {
  const e = document.createElement(name); e.textContent = text; if (cls) e.className = cls; return e;
}
function render() {
  $('#results').replaceChildren();
  for (const entry of entries) {
    const card = textElement('article', '', 'card');
    card.append(textElement('h2', entry.file.name), textElement('p', entry.state));
    if (entry.frames) {
      const previews = textElement('div', '', 'previews');
      entry.frames.forEach((src, i) => { const img = document.createElement('img'); img.src = src; img.alt = `Vorschaubild ${i + 1}`; previews.append(img); });
      card.append(previews);
    }
    if (entry.result) {
      const chips = textElement('div', '', 'tags');
      for (const tag of entry.selected.keys()) {
        const label = textElement('label', '', 'chip'), box = document.createElement('input');
        box.type = 'checkbox'; box.checked = entry.selected.get(tag);
        const original = entry.result.tags.find(row => row.tag === tag);
        const source = tagSource(entry, tag), origin = source === 'unknown' ? 'Unbekannt' : source === 'suggestion' ? 'Vorschlag' : 'Ergänzt';
        label.classList.toggle('manual', origin === 'Ergänzt');
        label.title = origin === 'Ergänzt' ? 'Manuell ergänzt' : origin === 'Unbekannt' ? 'Herkunft im alten Ergebnis nicht dokumentiert' : 'Ursprünglicher Modellvorschlag';
        if (original?.supportingFrames) label.title += ` · erkannt in ${original.supportingFrames} von ${entry.result.sampledFrames} Vorschaubildern`;
        box.addEventListener('change', () => { entry.selected.set(tag, box.checked); changed(entry); render(); });
        label.append(box, textElement('span', tag), textElement('span', origin, 'tag-origin')); chips.append(label);
      }
      card.append(chips);
      if (!entry.result.tags.length && entry.originalSuggestionsKnown !== false) card.append(textElement('p', 'Keine ausreichend klaren Tags gefunden. Bitte manuell prüfen.'));
      if (entry.originalSuggestionsKnown === false) card.append(textElement('p', 'Aus altem Export übernommen. Ursprüngliche Vorschläge und Scores sind hier nicht vollständig bekannt.'));
      const remainingUncertain = entry.result.uncertain.filter(tag => !entry.selected.get(tag));
      if (remainingUncertain.length) card.append(textElement('p', 'Kurz oder unsicher, nicht ausgewählt: ' + remainingUncertain.join(', ')));
      const add = textElement('div', '', 'tag-add'), input = document.createElement('input'), list = document.createElement('datalist');
      list.id = 'tags-' + entry.index; allTags.forEach(t => { const o = document.createElement('option'); o.value = t; list.append(o); });
      input.type = 'text'; input.placeholder = 'Tag aus deiner Liste ergänzen'; input.setAttribute('list', list.id); input.setAttribute('aria-label', 'Tag ergänzen für ' + entry.file.name);
      const button = textElement('button', 'Ergänzen', 'quiet');
      const addTag = () => {
        const found = allTags.find(t => t.toLowerCase() === input.value.trim().toLowerCase());
        if (!found) return message('Bitte einen Tag aus deiner vorhandenen Liste wählen.');
        if (!entry.selected.has(found)) { entry.tagSources ||= {}; entry.tagSources[found] = 'manual'; }
        entry.selected.set(found, true); changed(entry); message(''); render();
      };
      button.onclick = addTag; input.onkeydown = e => { if (e.key === 'Enter') addTag(); };
      add.append(input, list, button); card.append(add);
      const review = textElement('label', '', 'review'), checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.checked = !!entry.reviewed;
      checkbox.onchange = () => { entry.reviewed = checkbox.checked; changed(entry, false); summary(); };
      review.append(checkbox, textElement('span', 'Vorschläge geprüft und bei Bedarf korrigiert')); card.append(review);
    }
    if (entry.error) card.append(textElement('p', entry.error, 'error'));
    $('#results').append(card);
  }
  summary();
}
async function setFiles(files) {
  if (running || preparing) return;
  preparing = true; summary(); message('Dateien werden deinen gespeicherten Korrekturen zugeordnet …');
  try {
    await saveQueue;
    const next = [...files].filter(f => /\.(mp4|m4v|webm|mov)$/i.test(f.name)).map((file, index) => ({ file, index, hasFile: true, state: 'Wartet auf Analyse', selected: new Map() }));
    for (const entry of next) {
      try { entry.sha256 = await hashFile(entry.file); const record = savedRecords.get(entry.sha256); if (record) await restore(entry, record); }
      catch (e) { entry.error = e.message; }
    }
    entries = next;
    message('');
  } finally { preparing = false; render(); }
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
  running = true; controller = new AbortController(); $('#files').disabled = true; $('#frames').disabled = true; $('#cancel').hidden = false; message(''); summary();
  const setting = $('#frames').value;
  const threshold = DEFAULT_THRESHOLD;
  const coverage = DEFAULT_COVERAGE, analysisPolicy = ANALYSIS_VERSION + ':' + coverage;
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
          result = { filename: entry.file.name, sha256: sampleData.sha256, ...aggregate(inference.scores, mapping, threshold, coverage), sampledFrames: count, threshold, analysisPolicy, model: 'JoyTag-INT8', seconds: Math.round((performance.now() - started) / 100) / 10, timings: { samplingSeconds, ...inference.timings, totalSeconds: (performance.now() - started) / 1000 }, createdAt: new Date().toISOString() };
          await cached(key, result);
        }
        result = { ...result, sampledFrames: count, samplingMode: sampleData.samplingMode, durationSeconds: sampleData.durationSeconds };
        const previous = savedRecords.get(result.sha256);
        if (previous) applyRecord(entry, { ...previous, originalSuggestionsKnown: true }, result);
        else { entry.result = result; entry.selected = new Map(result.tags.map(t => [t.tag, true])); entry.reviewed = false; entry.originalSuggestionsKnown = true; }
        entry.updatedAt = entry.updatedAt || new Date().toISOString(); await persist(entry);
        entry.state = result.cached ? `Gespeichertes Ergebnis geladen · ${count} Bilder · bitte prüfen` : `Analyse abgeschlossen · ${count} Bilder · ${result.seconds} s · bitte prüfen`;
      } catch (e) {
        if (e.name === 'AbortError') { entry.state = 'Abgebrochen'; throw e; }
        entry.error = e.message; entry.state = 'Analyse fehlgeschlagen';
      }
      render();
    }
  } catch (e) { message(e.name === 'AbortError' ? 'Analyse abgebrochen. Fertige Ergebnisse bleiben erhalten.' : e.message); }
  finally { running = false; $('#files').disabled = false; $('#frames').disabled = false; $('#cancel').hidden = true; render(); $('#status').textContent = 'Bereit'; }
};
$('#cancel').onclick = () => { controller?.abort(); terminateWorker(); };
$('#export').onclick = async () => {
  $('#export').disabled = true;
  await saveQueue;
  try {
    const output = await api('/api/export', { method: 'POST', body: JSON.stringify({ items: entries.filter(e => e.result).map(makeRecord) }) });
    message('JSON gespeichert: ' + output.path);
    const link = $('#download'); link.href = output.download; link.hidden = false;
  } catch (e) { message('Export fehlgeschlagen: ' + e.message); }
  finally { render(); }
};
$('#quit').onclick = async () => {
  controller?.abort(); terminateWorker(); stopping = true;
  await saveQueue;
  if (failedSaves.size) { stopping = false; message('Bitte erst Ergebnisse exportieren: Nicht alle Korrekturen konnten gespeichert werden.'); return; }
  try { await api('/api/stop', { method: 'POST' }); $('#status').textContent = 'Programm beendet'; message('Du kannst dieses Fenster schließen.'); $('#analyze').disabled = true; } catch (e) { stopping = false; message(e.message); }
};
await status();
try {
  const stored = await api('/api/corrections'); savedRecords = new Map(stored.items.map(record => [record.sha256, record]));
  for (const record of stored.items) { const entry = { file: { name: record.filename }, index: entries.length, hasFile: false }; await restore(entry, record); entries.push(entry); }
  saveStatus();
} catch (e) { message('Gespeicherte Korrekturen konnten nicht geladen werden: ' + e.message); }
render();

