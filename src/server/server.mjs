import { messageError, errorMessage } from '../shared/messages.mjs';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { validateRecord, applyRecord, exportItem } from '../shared/corrections.mjs';
import { validatedSessionURL } from '../shared/session-url.mjs';
import { createNativeEngine } from './native-engine.mjs';
import { computeCapabilities, resolveThreads } from './native-policy.mjs';
import { normalizeSettings } from '../shared/preferences.mjs';
import { aggregate } from '../shared/tagging.mjs';
import { DEFAULT_THRESHOLD, DEFAULT_COVERAGE } from '../shared/analysis-settings.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Review tools exist only in development checkouts, never in runtime releases.
const reviewModule = new URL('../shared/evaluation.mjs', import.meta.url);
const reviewEnabled = fs.existsSync(reviewModule) && fs.existsSync(path.join(root, 'src/client/review.html'));
const { reviewExport } = reviewEnabled ? await import(reviewModule) : {};
// Windows may downclassify a hidden service independently of Normal priority.
// Apply explicit process QoS once; no global power plan or thread limit changes.
let processPowerPolicy = 'unavailable';
const policyScript = path.join(root, 'scripts/Process-Policy.ps1');
if (process.platform === 'win32' && fs.existsSync(policyScript)) {
  const policy = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', policyScript, '-ProcessId', String(process.pid)], {windowsHide:true, encoding:'utf8', timeout:15000});
  if (policy.status === 0 && policy.stdout?.trim() === 'high-qos') processPowerPolicy = 'high-qos';
}
const token = randomBytes(24).toString('hex');
const showBrowser = !process.argv.includes('--no-browser') && process.env.CAKE_TAGGER_NO_BROWSER !== '1';
const port = Number(process.env.CAKE_TAGGER_PORT ?? 8765);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw messageError('error.invalidPort');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream' };
// Serve only the reviewed browser module set; backend and private paths stay inaccessible.
const aliases = {'/analysis.html':'src/client/analysis.html','/diagnostics.html':'src/client/diagnostics.html', ...(reviewEnabled ? {'/review.html':'src/client/review.html'} : {})};
const publicFiles = new Set([
  ...(reviewEnabled ? ['src/client/review.html', 'src/client/review.mjs', 'src/client/review.css', 'src/client/review-session.mjs', 'src/shared/evaluation.mjs'] : []),
  'src/client/analysis.html',
  'src/client/diagnostics.html',
  'src/client/app.js',
  'src/client/diagnostics.mjs',
  'src/client/i18n.mjs',
  'src/client/native-client.mjs',
  'src/client/local-session.mjs',
  'src/client/page-bridge.mjs',
  'src/client/runtime-metrics.mjs',
  'src/client/sampling.mjs',
  'src/client/style.css',
  'src/client/auto-analysis.mjs',
  'src/client/integration.mjs',
  'src/shared/analysis-settings.mjs',
  'src/shared/corrections.mjs',
  'src/shared/messages.mjs',
  'src/shared/preferences.mjs',
  'src/shared/session-url.mjs',
  'src/shared/tag-policy.mjs',
  'src/shared/tagging.mjs',
  'src/shared/site-theme.mjs',
  'model/mapping.json',
  'model/tags.txt',
  'model/provenance.json',
  'assets/logo.svg',
]);
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
const tagList = fs.readFileSync(path.join(root, 'model/tags.txt'), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
const downloads = new Map(), sockets = new Set();
// Record the applied scheduling class without overriding OS or user choices.
let processPriority = 'unknown';
try {
  const priority = os.getPriority();
  processPriority = priority === os.constants.priority.PRIORITY_BELOW_NORMAL ? 'below-normal'
    : priority === os.constants.priority.PRIORITY_NORMAL ? 'normal' : 'other';
} catch { /* Some hosts do not expose process scheduling priority. */ }
const pythonVariant=process.argv.includes('--python');
const pythonEngineURL=new URL('./python-engine.mjs',import.meta.url);
const engine = pythonVariant ? (await import(pythonEngineURL.href)).createPythonEngine() : createNativeEngine();
let stopping = false, closing = false;
const stateDirectory = process.argv.includes('--python') ? path.join(root,'data/python') : path.join(root,'data');
fs.mkdirSync(stateDirectory,{recursive:true});
const settingsFile = path.join(stateDirectory, 'preferences.json');
let savedSettings;
try { savedSettings = normalizeSettings(JSON.parse(fs.readFileSync(settingsFile))); } catch {}
const capabilities = computeCapabilities();
const mapping = JSON.parse(fs.readFileSync(path.join(root, 'model/mapping.json')));
function openBrowser(url) {
  // Pass the URL as data, never interpolate a session file into PowerShell code.
  spawn('powershell.exe', ['-NoProfile', '-Command', 'Start-Process -FilePath $env:CAKE_TAGGER_OPEN_URL'], {
    env: { ...process.env, CAKE_TAGGER_OPEN_URL: url }, windowsHide: true, stdio: 'ignore'
  }).on('error', error => console.error(error.message));
}
function json(res, code, data) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
const server = http.createServer(async (req, res) => {
  // Reject cross-origin requests and alternative Host values, including DNS rebinding.
  const ownHost = '127.0.0.1:' + (server.address()?.port ?? port);
  const extensionOrigin = /^(moz-extension:\/\/[a-f0-9-]{36}|chrome-extension:\/\/[a-p]{32})$/.test(req.headers.origin || '');
  if (req.headers.host !== ownHost || (req.headers.origin && req.headers.origin !== 'http://' + ownHost && !extensionOrigin)) { res.writeHead(403); return res.end('Forbidden'); }
  if (extensionOrigin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Vary', 'Origin');
  }
  let requested;
  try { requested = decodeURIComponent(new URL(req.url, 'http://' + ownHost).pathname); } catch { res.writeHead(400); return res.end(); }
  if (stopping) return json(res, 503, { error: 'analysis.stopped' });
  if (req.method === 'OPTIONS' && extensionOrigin && ['/api/connect', '/api/settings', '/api/capabilities', '/api/stop'].includes(requested)) {
    res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Cake-Tagger-Client' });
    return res.end();
  }
  // A website cannot send this custom header without an approved CORS preflight.
  // Privileged extension fetches may omit Origin; local processes are trusted.
  if (req.method === 'POST' && requested === '/api/connect') {
    const client = req.headers['x-cake-tagger-client'];
    const local = client === 'local' && req.headers.origin === 'http://' + ownHost;
    const extension = client === 'extension' && (!req.headers.origin || extensionOrigin);
    if (!local && !extension) return json(res, 403, { error: 'error.nativeServer' });
    return json(res, 200, { token });
  }
  if (req.method === 'POST' && requested === '/api/infer') {
    if (req.headers.authorization !== 'Bearer ' + token) return json(res, 401, { error: 'error.openUsingStart' });
    const params = new URL(req.url, 'http://' + ownHost).searchParams;
    const parallelism = params.get('parallelism') || 'auto';
    let excludedTags = (savedSettings || normalizeSettings()).excludedTags;
    try {
      if (req.headers['x-cake-tagger-exclusions']) excludedTags = JSON.parse(req.headers['x-cake-tagger-exclusions']);
      if (!Array.isArray(excludedTags) || excludedTags.length > tagList.length || excludedTags.some(tag => typeof tag !== 'string' || !tagList.includes(tag))) throw Error();
    } catch { return json(res, 400, { error: 'error.invalidAnalysisPolicy' }); }
    try { resolveThreads(parallelism, capabilities); } catch (error) { return json(res, 400, { error: error.message, capabilities }); }
    if (req.headers['content-type'] !== 'application/octet-stream') return json(res, 415, { error: 'error.invalidModelInputImage' });
    const controller = new AbortController();
    const disconnected = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', disconnected);
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 48 * 448 * 448 * 4) return json(res, 413, { error: 'error.invalidModelInputImage' }); chunks.push(chunk); }
      if (!size || size % (448 * 448 * 4)) return json(res, 400, { error: 'error.invalidModelInputImage' });
      const bytes = Buffer.concat(chunks), frameBytes = 448 * 448 * 4;
      const frames = Array.from({ length: size / frameBytes }, (_, index) => Uint8ClampedArray.from(bytes.subarray(index * frameBytes, (index + 1) * frameBytes)));
      // One connection per video eliminates client-side gaps between frames.
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      const send = data => { if (!res.destroyed) res.write(JSON.stringify(data) + '\n'); };
      send({ type: 'state', state: 'analysis.loadingModel' });
      const result = await engine.infer(frames, parallelism, controller.signal, data => send({ type: 'progress', current: data.current, total: data.total }), {excludedTags});
      const memory = process.memoryUsage();
      send({ type: 'done', ...result, analysis: result.analysis ?? aggregate(result.scores, mapping, DEFAULT_THRESHOLD, DEFAULT_COVERAGE, { excludedTags }),
        scores: new URL(req.url, 'http://' + ownHost).searchParams.get('raw') === '1' ? result.scores.map(row => Array.from(row)) : undefined, runtime: { ...result.runtime, processPriority, processPowerPolicy,
        hostMemory: { totalBytes: os.totalmem(), freeBytes: os.freemem() },
        serverMemory: { rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, heapTotalBytes: memory.heapTotal, externalBytes: memory.external, arrayBuffersBytes: memory.arrayBuffers } } });
      return res.end();
    } catch (error) {
      if (!res.destroyed) {
        const data = { error: error.message?.startsWith('error.') || error.message === 'analysis.cancelled' ? error.message : 'error.nativeInference' };
        if (res.headersSent) return res.end(JSON.stringify({ type: 'error', ...data }) + '\n');
        return json(res, 500, data);
      }
    } finally { res.removeListener('close', disconnected); }
    return;
  }
  if (req.method === 'GET' && requested.startsWith('/api/download/')) {
    const id = requested.slice('/api/download/'.length), item = downloads.get(id);
    if (!item || item.expires < Date.now()) { downloads.delete(id); return json(res, 404, { error: 'error.downloadExpired' }); }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="' + item.filename + '"', 'Content-Length': item.data.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    return res.end(item.data);
  }
  if (requested === '/api/export' && req.method === 'POST') {
    if (req.headers.authorization !== 'Bearer ' + token) return json(res, 401, { error: 'error.openUsingStart' });
    try {
      if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'error.expectedJson' });
      const evaluation = new URL(req.url, 'http://' + ownHost).searchParams.get('evaluation') === '1';
      if (evaluation && !reviewEnabled) return json(res, 404, { error: 'error.noValidResults' });
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > (evaluation ? 64000000 : 16000000)) throw messageError('error.exportIsTooLarge'); chunks.push(chunk); }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!Array.isArray(input.items) || !input.items.length || input.items.length > 10000) throw messageError('error.noValidResults');
      const items = input.items.map(item => { const record = validateRecord(item, tagList); return exportItem(applyRecord({ file: { name: record.filename } }, record)); });
      const extra = evaluation ? reviewExport(input.evaluation, items, mapping, tagList) : {};
      const snapshot = Buffer.from(JSON.stringify({ version: 2, source: evaluation ? 'cake-tagger-review' : 'cake-tagger-local', createdAt: new Date().toISOString(), items, ...extra }, null, evaluation ? 0 : 2), 'utf8');
      for (const [id, item] of downloads) if (item.expires < Date.now()) downloads.delete(id);
      while (downloads.size >= 3) downloads.delete(downloads.keys().next().value);
      const id = randomBytes(24).toString('hex');
      downloads.set(id, { data: snapshot, filename: evaluation ? 'cake-tag-review.json' : 'cake-tags.json', expires: Date.now() + 5 * 60 * 1000 });
      return json(res, 200, { download: '/api/download/' + id });
    } catch (e) { return json(res, 400, { error: errorMessage(e) }); }
  }
  if (req.method === 'POST' && requested === '/api/stop') {
    if (req.headers.authorization !== 'Bearer ' + token) { res.writeHead(401); return res.end(); }
    stopping = true;
    try {
      await engine.stop();
      const acknowledgementSocket = req.socket;
      const closeProgram = () => {
        if (closing) return;
        closing = true;
        // Start closing only after the response is flushed. Node may consider a
        // fully received request idle while its asynchronous handler is running.
        server.close(() => { process.exitCode = 0; });
        for (const socket of sockets) if (socket !== acknowledgementSocket) socket.destroy();
      };
      if (res.destroyed) { closeProgram(); return; }
      res.once('finish', closeProgram);
      res.once('close', closeProgram);
      res.setHeader('Connection', 'close');
      return json(res, 200, { stopped: true });
    } catch { stopping = false; return json(res, 500, { error: 'error.stopFailed' }); }
  }
  if (requested === '/api/settings' || requested === '/api/capabilities') {
    if (req.headers.authorization !== 'Bearer ' + token) return json(res, 401, { error: 'error.openUsingStart' });
    if (requested === '/api/capabilities' && req.method === 'GET') return json(res, 200, capabilities);
    if (requested === '/api/settings' && req.method === 'GET') return json(res, 200, { settings: savedSettings || normalizeSettings(), initialized: !!savedSettings });
    if (requested === '/api/settings' && req.method === 'POST') {
      try {
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 32768) throw Error(); chunks.push(chunk); }
        if (!req.headers['content-type']?.startsWith('application/json')) throw Error();
        const input = JSON.parse(Buffer.concat(chunks));
        if (!input.settings || typeof input.settings !== 'object' || Array.isArray(input.settings)) throw Error();
        const settings = normalizeSettings(input.settings);
        settings.excludedTags = settings.excludedTags.filter(tag => tagList.includes(tag));
        resolveThreads(settings.parallelism, capabilities);
        fs.writeFileSync(settingsFile + '.tmp', JSON.stringify(settings)); fs.renameSync(settingsFile + '.tmp', settingsFile);
        savedSettings = settings;
        return json(res, 200, { settings });
      } catch { return json(res, 400, { error: 'error.settingsSave' }); }
    }
    return json(res, 405, { error: 'error.requestFailed' });
  }
  if (req.method === 'GET' && requested === '/api/status') {
    if (req.headers.authorization !== 'Bearer ' + token) { res.writeHead(401); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({app:'cake-tagger-browser-v1',backendImplementation:pythonVariant?'python':'node'}));
  }
  if (req.method === 'GET' && requested === '/api/runtime') {
    if (req.headers.authorization !== 'Bearer ' + token) return json(res, 401, { error: 'error.openUsingStart' });
    // System availability and this Node process are distinct from browser inference memory.
    const memory = process.memoryUsage();
    return json(res, 200, { hostMemory: { totalBytes: os.totalmem(), freeBytes: os.freemem() },
      serverMemory: { rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, heapTotalBytes: memory.heapTotal, externalBytes: memory.external, arrayBuffersBytes: memory.arrayBuffers } });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  if (requested === '/' || requested === '/index.html') { res.writeHead(302, { Location: 'https://cake.ski/', 'Cache-Control': 'no-store' }); return res.end(); }
  const relative = aliases[requested] || requested.slice(1);
  if (!aliases[requested] && !publicFiles.has(relative)) { res.writeHead(404); return res.end(); }
  const file = path.join(root, relative);
  let stat;
  try { stat = fs.statSync(file); if (!stat.isFile()) throw Error(); } catch { res.writeHead(404); return res.end(); }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const params = new URL(req.url, 'http://' + ownHost).searchParams;
  const bridgeOrigin = params.get('bridgeOrigin');
  const embedded = params.get('integration') === '1' && params.get('embedded') === '1' && /^(moz-extension:\/\/[a-f0-9-]{36}|chrome-extension:\/\/[a-p]{32})$/.test(bridgeOrigin || '');
  // Both ancestors are named: the extension bridge and the Cake upload page.
  const ancestors = embedded ? bridgeOrigin + ' https://cake.ski' : "'none'";
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; style-src 'self'; frame-ancestors " + ancestors + "; base-uri 'none'; object-src 'none'");
  res.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + (path.extname(file) === '.html' ? '; charset=utf-8' : ''), 'Content-Length': stat.size, 'Cache-Control': requested.endsWith('.onnx') ? 'public, max-age=3600' : 'no-store' });
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(file); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
});
server.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
server.once('error', async e => {
  if (e.code === 'EADDRINUSE') {
    try {
      const previous = JSON.parse(fs.readFileSync(path.join(stateDirectory, 'session.json'), 'utf8'));
      const address = validatedSessionURL(previous.url, port);
      const response = await fetch(address.origin + '/api/status', { headers: { Authorization: 'Bearer ' + address.hash.slice(1) }, signal: AbortSignal.timeout(1500) });
      if ((await response.json()).app !== 'cake-tagger-browser-v1') throw Error();
      if (showBrowser) openBrowser(address.href);
      return;
    } catch {}
  }
  console.error(e.message); fs.writeFileSync(path.join(root, 'data/start-error.txt'), e.message); process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/#${token}`;
  fs.writeFileSync(path.join(stateDirectory, 'session.json'), JSON.stringify({ url, pid: process.pid }));
  console.log('Cake Tagger is ready.');
  if (showBrowser) openBrowser(url);
});
