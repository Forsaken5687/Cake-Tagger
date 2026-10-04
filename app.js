import { message, messageError, errorMessage } from './messages.mjs';
import { ANALYSIS_VERSION } from './tagging.mjs';
import { makeRecord, applyRecord, tagSource } from './corrections.mjs';
import { samplingPlan } from './sampling.mjs';
import { DEFAULT_THRESHOLD, DEFAULT_COVERAGE, PREPROCESS_VERSION } from './analysis-settings.mjs';
import { createSettingsStore, suggestionPolicy } from './preferences.mjs';
import { createUploadAutoAnalysis } from './extension/auto-analysis.mjs';
import { createNativeClient } from './native-client.mjs';
import { createLocalSession } from './local-session.mjs';
import { memorySnapshot } from './runtime-metrics.mjs';
import { installPageBridge } from './page-bridge.mjs';
import { setLanguage, setSiteLanguage, t, translatePage, localizedText, localizedAttribute } from './i18n.mjs';
const connected = installPageBridge();
if (!connected) { location.replace('https://cake.ski/'); throw Error('Upload integration context required.'); }
const { isExtension, installIntegration, integrationButton } = connected
  ? await import('./extension/integration.mjs')
  : { isExtension: false, installIntegration() {}, integrationButton() {} };
const $ = s => document.querySelector(s);
const session = createLocalSession();
const api = async (url, options = {}) => {
  const response = await session.request(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw messageError(data.error || 'error.requestFailed');
  return data;
};
const settingsStore = createSettingsStore({ storage: localStorage, events: window, request: (method, settings) => api('/api/settings', method === 'get' ? {} : { method: 'POST', body: JSON.stringify({ settings }) }) });
let settings;
try { settings = await settingsStore.load(); } catch { settings = settingsStore.get(); }
setLanguage(settings); translatePage();
let allTags = [], entries = [], running = false, controller, stopping = false;
let mapping, modelSignature, nativeClient;
// Legacy browser data is left untouched; current results live only in memory.
const sessionRecords = new Map(), sessionCache = new Map();
let preparing = false;
const uploadAuto = createUploadAutoAnalysis({
  busy: () => stopping || running || preparing,
  enabled: () => !stopping && document.body.classList.contains('embedded') && settings.autoAnalyzeEmbed,
  prepare: setFiles,
  analyze: targets => analyze(targets, true)
});
function receiveFiles(files) { return uploadAuto.receive(files).catch(error => showMessage(errorMessage(error))); }
function drainEmbeddedFiles() { void uploadAuto.drain(); }
async function cached(key, value) {
  if (value) sessionCache.set(key, value);
  return sessionCache.get(key);
}
function cancelAnalysis() {
  uploadAuto.cancel();
  controller?.abort();
  cancelInference();
}
function cancelInference() {
  nativeClient?.stop();
}
function infer(frames, parallelism, excludedTags) {
  // One transport per page. Session configuration belongs to the backend.
  if (!nativeClient) {
    nativeClient = createNativeClient({ fetcher: session.request,
      onState: state => localizedText($('#status'), state),
      onProgress: (current, total) => localizedText($('#status'), message('analysis.progress', { current, total }))
    });
  }
  return nativeClient.infer(frames, parallelism, { excludedTags, raw: false }).then(result => {
    return { ...result, runtime: { ...result.runtime, parallelismLimit: parallelism, memory: memorySnapshot() } };
  });
}
function showMessage(text) { localizedText($('#message'), text); publishUploadView(); }
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
    modelSignature = 'native-cpu-v1|' + provenance.sha256 + JSON.stringify(map);
    localizedText($('#status'), 'analysis.ready');
  } catch (e) { localizedText($('#status'), errorMessage(e)); }
}
function summary() {
  const complete = entries.filter(e => e.result).length;
  localizedText($('#summary'), message(entries.length === 1 ? 'results.summarySingle' : 'results.summary', { count: entries.length, done: complete }));
  $('#analyze').disabled = stopping || running || preparing || !entries.some(e => e.hasFile) || !mapping;
  $('#export').disabled = !complete;
}
function textElement(name, text, cls, localize = true) {
  const e = document.createElement(name);
  if (localize && text) localizedText(e, text); else e.textContent = text;
  if (cls) e.className = cls; return e;
}
function render() { summary(); publishUploadView(); }
async function setFiles(files) {
  if (running || preparing) return;
  preparing = true; const batch = new AbortController(); controller = batch;
  summary(); showMessage('analysis.preparing');
  try {
    const next = [...files].filter(f => /\.(mp4|m4v|webm|mov)$/i.test(f.name)).map((file, index) => {
      const old = entries.find(entry => entry.file.name === file.name && entry.file.size === file.size && entry.file.lastModified === file.lastModified);
      return old ? { ...old, file, index } : { file, index, hasFile: true, state: 'analysis.waiting', selected: new Map() };
    });
    // Keep the selection available for a manual retry if hashing is cancelled.
    const previous = entries; entries = next;
    for (let i = 0; i < next.length; i++) {
      if (batch.signal.aborted) break;
      const entry = next[i];
      try {
        entry.sha256 = await hashFile(entry.file);
        const existing = previous.find(old => old.sha256 === entry.sha256);
        if (existing) { next[i] = { ...existing, file: entry.file, index: entry.index }; continue; }
        const record = sessionRecords.get(entry.sha256); if (record) await restore(entry, record);
      }
      catch (e) { entry.error = errorMessage(e); }
    }
    entries = next;
    showMessage(batch.signal.aborted ? 'analysis.cancelledHint' : '');
  } finally { preparing = false; if(controller === batch)controller = undefined; render(); }
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
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height); if (!document.body.classList.contains('embedded')) frames.push(canvas.toDataURL('image/jpeg', 0.82));
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
  // Allocate the cancellation signal before the first asynchronous step.
  const batch = new AbortController(); controller = batch;
  running = true; $('#files').disabled = true; $('#cancel').hidden = false; showMessage(''); render();
  try {
    settings = await settingsStore.load(); batch.signal.throwIfAborted();
    if (automatic && !settings.autoAnalyzeEmbed) return;
    const setting = settings.frames, threshold = DEFAULT_THRESHOLD;
    const analysisSettings = { ...settings, excludedTags: [...settings.excludedTags] };
    // Freeze preferences for this batch; later changes apply to subsequent analyses.
    const coverage = DEFAULT_COVERAGE, analysisPolicy = ANALYSIS_VERSION + ':' + coverage + ':' + suggestionPolicy(analysisSettings);
    for (const entry of targets) {
      if (!entry.hasFile) continue;
      const expectedCount = setting === 'auto' ? (entry.result?.durationSeconds ? samplingPlan(entry.result.durationSeconds).count : null) : Number(setting);
      if (entry.result && entry.frames && entry.result.sampledFrames === expectedCount && entry.result.threshold === threshold && entry.result.analysisPolicy === analysisPolicy) continue;
      batch.signal.throwIfAborted(); entry.state = 'analysis.sampling'; entry.error = ''; render();
      try {
        const started = performance.now();
        const sampleData = await sample(entry.file, setting, batch.signal, entry.sha256);
        const samplingSeconds = (performance.now() - started) / 1000;
        const count = sampleData.sampledFrames; entry.sha256 = sampleData.sha256;
        entry.frames = sampleData.frames; entry.state = message('analysis.frameProgress', { count }); render();
        const key = analysisKey(sampleData.sha256, count, threshold, analysisPolicy);
        let result = await cached(key);
        if (result) result = { ...result, filename: entry.file.name, cached: true };
        else {
          const requestStarted = performance.now();
          const inference = await infer(sampleData.inputs, analysisSettings.parallelism, analysisSettings.excludedTags);
          const requestSeconds = (performance.now() - requestStarted) / 1000;
          batch.signal.throwIfAborted();
          result = { filename: entry.file.name, sha256: sampleData.sha256, ...inference.analysis, sampledFrames: count, threshold, analysisPolicy, model: 'JoyTag-INT8', runtime: { ...inference.runtime, clientBrowser: { family: /Firefox\//.test(navigator.userAgent) ? 'firefox' : /(?:Chrome|Chromium)\//.test(navigator.userAgent) ? 'chromium' : 'other', visibilityState: document.visibilityState } }, seconds: Math.round((performance.now() - started) / 100) / 10, timings: { samplingSeconds, ...inference.timings, requestSeconds, transportSeconds: Math.max(0, requestSeconds - (inference.timings.queueSeconds + inference.timings.workerWallSeconds)), totalSeconds: (performance.now() - started) / 1000 }, createdAt: new Date().toISOString() };
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
  finally { if(controller === batch)controller = undefined; running = false; $('#files').disabled = false; $('#cancel').hidden = true; render(); if (!stopping) { localizedText($('#status'), 'analysis.ready'); drainEmbeddedFiles(); } }
}
$('#analyze').onclick = () => analyze();
$('#cancel').onclick = cancelAnalysis;
$('#export').onclick = async () => {
  $('#export').disabled = true;
  try {
    const output = await api('/api/export', { method: 'POST', body: JSON.stringify({ items: entries.filter(e => e.result).map(makeRecord) }) });
    showMessage('');
    const link = document.createElement('a'); link.href = output.download; link.download = 'cake-tags.json'; document.body.append(link); link.click(); link.remove();
  } catch (e) { showMessage(message('error.exportFailed', { error: errorMessage(e) })); }
  finally { render(); }
};
$('#quit').onclick = async () => {
  cancelAnalysis(); stopping = true;
    $('#quit').disabled = true;
    try { if (!(await api('/api/stop', { method: 'POST' })).stopped) throw messageError('error.stopFailed'); localizedText($('#status'), 'analysis.stopped'); showMessage('page.stoppedHint'); $('#analyze').disabled = $('#files').disabled = $('#export').disabled = true; document.querySelectorAll('.settings-open').forEach(button => { button.disabled = true; }); }
    catch (e) { stopping = false; $('#quit').disabled = false; showMessage(e instanceof TypeError ? 'error.stopFailed' : errorMessage(e)); }
};
await status();
installIntegration(receiveFiles, theme => {
  setSiteLanguage(theme.language); translatePage();
  if (!running && mapping) localizedText($('#status'), 'analysis.ready');
  render();
});
settingsStore.subscribe(next => {
  if (isExtension) browser.runtime.sendMessage({ type: 'cake-tagger:settings-notify' }).catch(() => {});
  settings = next; setLanguage(settings); translatePage();
  if (!running && mapping) localizedText($('#status'), 'analysis.ready');
  render();
});
window.addEventListener('focus', () => { void settingsStore.load().catch(() => {}); });
render();


function publishUploadView() {
 if (!connected || !document.body.classList.contains('embedded')) return;
 const url=new URL(location.href);
 parent.postMessage({type:'cake-tagger:view',channel:url.searchParams.get('channel'),view:{
  settings, language:document.documentElement.lang === 'de' ? 'de' : 'en', status:$('#status').textContent,
  message:$('#message').textContent, running:running || preparing, stopped:stopping, allTags,
  entries:entries.map(entry=>({filename:entry.file.name,sha256:entry.sha256,state:t(entry.state),error:entry.error ? t(entry.error) : '',
   complete:!!entry.result,tags:[...entry.selected].map(([tag,selected])=>{
    const original=entry.result?.tags.find(row=>row.tag===tag)||entry.result?.uncertainScores?.find(row=>row.tag===tag);
    return {tag,selected,source:tagSource(entry,tag),uncertain:!!entry.result?.uncertain.includes(tag),confidence:original?.confidence};
   })}))}},url.searchParams.get('bridgeOrigin'));
}
window.addEventListener('cake-tagger:upload-message', async event=>{
 const data=event.detail;if(data?.type==='cake-tagger:settings-updated'){await settingsStore.load();return;}if(data?.type!=='cake-tagger:command')return;
 const entry=entries.find(e=>e.file.name===data.filename && e.sha256===data.sha256);
 switch(data.action){
  case 'analyze': if(!stopping) await analyze();break;
  case 'cancel': cancelAnalysis();break;
  case 'export': if(entries.some(e=>e.result)) await $('#export').onclick();break;
  case 'quit': await $('#quit').onclick();break;
  case 'tag': if(entry?.result && entry.selected.has(data.tag) && typeof data.selected==='boolean'){entry.selected.set(data.tag,data.selected);changed(entry);render();}break;
  case 'add': if(entry?.result && !allTags.includes(data.tag))showMessage('error.chooseTag');
   if(entry?.result && allTags.includes(data.tag)){
   if(!entry.selected.has(data.tag)){entry.tagSources ||= {};entry.tagSources[data.tag]='manual';}
   entry.selected.set(data.tag,true);changed(entry);render();
  }break;
  case 'apply': if(entry?.result) await integrationButton(entry,textElement,showMessage)?.onclick();break;
 }
 publishUploadView();
});
new MutationObserver(()=>publishUploadView()).observe($('#status'),{childList:true,subtree:true,characterData:true});
publishUploadView();
