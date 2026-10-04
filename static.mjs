import { messageError, errorMessage } from './messages.mjs';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { validateRecord, applyRecord, exportItem } from './corrections.mjs';
import { validatedSessionURL } from './session-url.mjs';
import { createNativeEngine } from './native-engine.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const token = randomBytes(24).toString('hex');
const showBrowser = !process.argv.includes('--no-browser') && process.env.CAKE_TAGGER_NO_BROWSER !== '1';
const port = Number(process.env.CAKE_TAGGER_PORT ?? 8765);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw messageError('error.invalidPort');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream' };
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
const tagList = fs.readFileSync(path.join(root, 'tags.txt'), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
const downloads = new Map();
const engine = createNativeEngine();
function openBrowser(url) {
  // Pass the URL as data, never interpolate a session file into PowerShell code.
  spawn('powershell.exe', ['-NoProfile', '-Command', 'Start-Process -FilePath $env:CAKE_TAGGER_OPEN_URL'], {
    env: { ...process.env, CAKE_TAGGER_OPEN_URL: url }, windowsHide: true, stdio: 'ignore'
  }).on('error', error => console.error(error.message));
}
function json(res, code, data) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
const server = http.createServer(async (req, res) => {
  // Reject cross-origin requests and alternative Host values, including DNS rebinding.
  const ownHost = '127.0.0.1:' + server.address().port;
  const extensionOrigin = /^(moz-extension:\/\/[a-f0-9-]{36}|chrome-extension:\/\/[a-p]{32})$/.test(req.headers.origin || '');
  if (req.headers.host !== ownHost || (req.headers.origin && req.headers.origin !== 'http://' + ownHost && !extensionOrigin)) { res.writeHead(403); return res.end('Forbidden'); }
  if (extensionOrigin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Vary', 'Origin');
  }
  let requested;
  try { requested = decodeURIComponent(new URL(req.url, 'http://' + ownHost).pathname); } catch { res.writeHead(400); return res.end(); }
  if (req.method === 'OPTIONS' && extensionOrigin && ['/api/connect', '/api/infer'].includes(requested)) {
    res.writeHead(204, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Cake-Tagger-Client' });
    return res.end();
  }
  // A website cannot send this custom header without an approved CORS preflight.
  // Privileged extension fetches may omit Origin; local processes are trusted.
  if (req.method === 'POST' && requested === '/api/connect') {
    if (req.headers['x-cake-tagger-client'] !== 'extension' || (req.headers.origin && !extensionOrigin)) return json(res, 403, { error: 'error.nativeServer' });
    return json(res, 200, { token });
  }
  if (req.method === 'POST' && requested === '/api/infer') {
    if (req.headers.authorization !== 'Bearer ' + token) return json(res, 401, { error: 'error.openUsingStart' });
    const parallelism = new URL(req.url, 'http://' + ownHost).searchParams.get('parallelism') || 'auto';
    if (!['auto', '1', '2', '4', '6', '8'].includes(parallelism)) return json(res, 400, { error: 'error.invalidAnalysisRuntime' });
    if (req.headers['content-type'] !== 'application/octet-stream') return json(res, 415, { error: 'error.invalidModelInputImage' });
    const controller = new AbortController();
    const disconnected = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', disconnected);
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 448 * 448 * 4) return json(res, 413, { error: 'error.invalidModelInputImage' }); chunks.push(chunk); }
      if (size !== 448 * 448 * 4) return json(res, 400, { error: 'error.invalidModelInputImage' });
      const rgba = Uint8ClampedArray.from(Buffer.concat(chunks));
      const result = await engine.infer(rgba, parallelism, controller.signal);
      const memory = process.memoryUsage();
      return json(res, 200, { ...result, scores: Array.from(result.scores), runtime: { ...result.runtime,
        hostMemory: { totalBytes: os.totalmem(), freeBytes: os.freemem() },
        serverMemory: { rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, heapTotalBytes: memory.heapTotal, externalBytes: memory.external, arrayBuffersBytes: memory.arrayBuffers } } });
    } catch (error) {
      if (!res.destroyed) return json(res, error.message === 'error.nativeBusy' ? 429 : 500, { error: error.message?.startsWith('error.') ? error.message : 'error.nativeInference' });
    } finally { res.removeListener('close', disconnected); }
    return;
  }
  if (req.method === 'GET' && requested.startsWith('/api/download/')) {
    const id = requested.slice('/api/download/'.length), item = downloads.get(id);
    if (!item || item.expires < Date.now()) { downloads.delete(id); return json(res, 404, { error: 'error.downloadExpired' }); }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="cake-tags.json"', 'Content-Length': item.data.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    return res.end(item.data);
  }
  if (requested === '/api/export' && req.method === 'POST') {
    if (req.headers.authorization !== 'Bearer ' + token) return json(res, 401, { error: 'error.openUsingStart' });
    try {
      if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'error.expectedJson' });
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 16000000) throw messageError('error.exportIsTooLarge'); chunks.push(chunk); }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!Array.isArray(input.items) || !input.items.length || input.items.length > 10000) throw messageError('error.noValidResults');
      const items = input.items.map(item => { const record = validateRecord(item, tagList); return exportItem(applyRecord({ file: { name: record.filename } }, record)); });
      const snapshot = Buffer.from(JSON.stringify({ version: 2, source: 'cake-tagger-local', createdAt: new Date().toISOString(), items }, null, 2), 'utf8');
      for (const [id, item] of downloads) if (item.expires < Date.now()) downloads.delete(id);
      while (downloads.size >= 3) downloads.delete(downloads.keys().next().value);
      const id = randomBytes(24).toString('hex');
      downloads.set(id, { data: snapshot, expires: Date.now() + 5 * 60 * 1000 });
      return json(res, 200, { download: '/api/download/' + id });
    } catch (e) { return json(res, 400, { error: errorMessage(e) }); }
  }
  if (req.method === 'POST' && requested === '/api/stop') {
    if (req.headers.authorization !== 'Bearer ' + token) { res.writeHead(401); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"stopped":true}');
    setTimeout(() => { server.close(); process.exit(0); }, 250); return;
  }
  if (req.method === 'GET' && requested === '/api/status') {
    if (req.headers.authorization !== 'Bearer ' + token) { res.writeHead(401); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"app":"cake-tagger-browser-v1"}');
  }
  if (req.method === 'GET' && requested === '/api/runtime') {
    if (req.headers.authorization !== 'Bearer ' + token) return json(res, 401, { error: 'error.openUsingStart' });
    // System availability and this Node process are distinct from browser inference memory.
    const memory = process.memoryUsage();
    return json(res, 200, { hostMemory: { totalBytes: os.totalmem(), freeBytes: os.freemem() },
      serverMemory: { rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, heapTotalBytes: memory.heapTotal, externalBytes: memory.external, arrayBuffersBytes: memory.arrayBuffers } });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  if (requested === '/') requested = '/index.html';
  if (!(/^\/(index\.html|diagnostics\.html|diagnostics\.mjs|webext-api\.js|app\.js|style\.css|native-client\.mjs|engine-worker\.js|compute-policy\.js|runtime-metrics\.mjs|inference-pool\.mjs|tagging\.mjs|analysis-settings\.mjs|preferences\.mjs|settings-ui\.mjs|i18n\.mjs|messages\.mjs|tag-policy\.mjs|sampling\.mjs|corrections\.mjs|mapping\.json|tags\.txt)$/.test(requested) || requested === '/extension/auto-analysis.mjs' || /^\/assets\/logo\.svg$/.test(requested) || /^\/(vendor|model)\/[A-Za-z0-9._-]+$/.test(requested))) { res.writeHead(404); return res.end(); }
  const file = path.join(root, requested.slice(1));
  let stat;
  try { stat = fs.statSync(file); if (!stat.isFile()) throw Error(); } catch { res.writeHead(404); return res.end(); }
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' data: blob:; style-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  res.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + (path.extname(file) === '.html' ? '; charset=utf-8' : ''), 'Content-Length': stat.size, 'Cache-Control': requested.endsWith('.onnx') ? 'public, max-age=3600' : 'no-store' });
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(file); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
});
server.once('error', async e => {
  if (e.code === 'EADDRINUSE') {
    try {
      const previous = JSON.parse(fs.readFileSync(path.join(root, 'data/session.json'), 'utf8'));
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
  fs.writeFileSync(path.join(root, 'data/session.json'), JSON.stringify({ url, pid: process.pid }));
  console.log('Cake Tagger is ready.');
  if (showBrowser) openBrowser(url);
});

