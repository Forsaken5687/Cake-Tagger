import { aggregate } from './tagging.mjs';
import { makeRecord, applyRecord } from './corrections.mjs';
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
    const id = ++workerSeq; workerJobs.set(id, { resolve, reject }); worker.postMessage({ id, type: 'analyze', frames });
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
function analysisKey(sha256, count, threshold) { return sha256 + '|' + count + '|' + threshold + '|' + modelSignature + '|preprocess-v1'; }
async function restore(entry, record) {
  let baseline = record.result;
  if (!record.originalSuggestionsKnown && baseline.threshold != null) {
    const original = await cached(analysisKey(record.sha256, baseline.sampledFrames, baseline.threshold));
    if (original?.sha256 === record.sha256) { baseline = original; record = { ...record, originalSuggestionsKnown: true }; }
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
        box.addEventListener('change', () => { entry.selected.set(tag, box.checked); changed(entry); render(); });
        label.append(box, textElement('span', tag)); chips.append(label);
      }
      card.append(chips);
      if (!entry.result.tags.length && entry.originalSuggestionsKnown !== false) card.append(textElement('p', 'Keine ausreichend klaren Tags gefunden. Bitte manuell prüfen.'));
      if (entry.originalSuggestionsKnown === false) card.append(textElement('p', 'Aus altem Export übernommen. Ursprüngliche Vorschläge und Scores sind hier nicht vollständig bekannt.'));
      const remainingUncertain = entry.result.uncertain.filter(tag => !entry.selected.get(tag));
      if (remainingUncertain.length) card.append(textElement('p', 'Unsicher, nicht ausgewählt: ' + remainingUncertain.join(', ')));
      const add = textElement('div', '', 'tag-add'), input = document.createElement('input'), list = document.createElement('datalist');
      list.id = 'tags-' + entry.index; allTags.forEach(t => { const o = document.createElement('option'); o.value = t; list.append(o); });
      input.type = 'text'; input.placeholder = 'Tag aus deiner Liste ergänzen'; input.setAttribute('list', list.id); input.setAttribute('aria-label', 'Tag ergänzen für ' + entry.file.name);
      const button = textElement('button', 'Ergänzen', 'quiet');
      const addTag = () => {
        const found = allTags.find(t => t.toLowerCase() === input.value.trim().toLowerCase());
        if (!found) return message('Bitte einen Tag aus deiner vorhandenen Liste wählen.');
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
    message(entries.length > 5 ? 'Für den Qualitätstest reichen 2–5 Videos. Größere Listen werden nacheinander verarbeitet.' : '');
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
async function sample(file, count, signal, knownHash) {
  if (file.size > 250 * 1024 * 1024) throw new Error('Pro Video sind maximal 250 MB möglich.');
  const video = document.createElement('video'); video.muted = true; video.preload = 'auto'; video.playsInline = true;
  const url = URL.createObjectURL(file);
  try {
    await waitEvent(video, 'loadeddata', () => { video.src = url; video.load(); }, signal);
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth) throw new Error('Ungültige Videolänge oder Auflösung.');
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext('2d'), frames = [];
    for (let i = 0; i < count; i++) {
      signal.throwIfAborted();
      const time = video.duration * (i + 0.5) / count;
      await waitEvent(video, 'seeked', () => { video.currentTime = time; }, signal);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height); frames.push(canvas.toDataURL('image/jpeg', 0.82));
    }
    const sha256 = knownHash || await hashFile(file); signal.throwIfAborted();
    return { frames, sha256 };
  } finally { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
}
$('#analyze').onclick = async () => {
  running = true; controller = new AbortController(); $('#files').disabled = true; $('#frames').disabled = true; $('#threshold').disabled = true; $('#cancel').hidden = false; message(''); summary();
  const count = Number($('#frames').value);
  const threshold = Number($('#threshold').value);
  try {
    for (const entry of entries) {
      if (!entry.hasFile) continue;
      if (entry.result && entry.frames && entry.result.sampledFrames === count && entry.result.threshold === threshold) continue;
      controller.signal.throwIfAborted(); entry.state = 'Vorschaubilder werden gelesen …'; entry.error = ''; render();
      try {
        const sampleData = await sample(entry.file, count, controller.signal, entry.sha256);
        entry.frames = sampleData.frames; entry.state = 'Tagging-Modell analysiert … Beim ersten Video wird das Modell geladen.'; render();
        const key = analysisKey(sampleData.sha256, count, threshold);
        let result = await cached(key);
        if (result) result = { ...result, filename: entry.file.name, cached: true };
        else {
          const inference = await infer(sampleData.frames);
          controller.signal.throwIfAborted();
          result = { filename: entry.file.name, sha256: sampleData.sha256, ...aggregate(inference.scores, mapping, threshold), sampledFrames: count, threshold, model: 'JoyTag-INT8', seconds: Math.round(inference.seconds * 10) / 10, createdAt: new Date().toISOString() };
          await cached(key, result);
        }
        const previous = savedRecords.get(result.sha256);
        if (previous) applyRecord(entry, { ...previous, originalSuggestionsKnown: true }, result);
        else { entry.result = result; entry.selected = new Map(result.tags.map(t => [t.tag, true])); entry.reviewed = false; entry.originalSuggestionsKnown = true; }
        entry.updatedAt = entry.updatedAt || new Date().toISOString(); await persist(entry);
        entry.state = result.cached ? 'Gespeichertes Ergebnis geladen · bitte prüfen' : `Analyse abgeschlossen · ${result.seconds} s inklusive Modellstart · bitte prüfen`;
      } catch (e) {
        if (e.name === 'AbortError') { entry.state = 'Abgebrochen'; throw e; }
        entry.error = e.message; entry.state = 'Analyse fehlgeschlagen';
      }
      render();
    }
  } catch (e) { message(e.name === 'AbortError' ? 'Analyse abgebrochen. Fertige Ergebnisse bleiben erhalten.' : e.message); }
  finally { running = false; $('#files').disabled = false; $('#frames').disabled = false; $('#threshold').disabled = false; $('#cancel').hidden = true; render(); $('#status').textContent = 'Bereit'; }
};
$('#cancel').onclick = () => { controller?.abort(); terminateWorker(); };
$('#export').onclick = async () => {
  $('#export').disabled = true;
  await saveQueue;
  try {
    const output = await api('/api/export', { method: 'POST', body: JSON.stringify({ items: entries.filter(e => e.result).map(makeRecord) }) });
    message('JSON gespeichert: ' + output.path);
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
  if (entries.length) { $('#frames').value = String(entries[0].result.sampledFrames); if (entries[0].result.threshold != null) $('#threshold').value = String(entries[0].result.threshold); }
  saveStatus();
} catch (e) { message('Gespeicherte Korrekturen konnten nicht geladen werden: ' + e.message); }
render();

