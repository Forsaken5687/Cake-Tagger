import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { validateRecord, applyRecord, exportItem } from './corrections.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const token = randomBytes(24).toString('hex');
const showBrowser = !process.argv.includes('--no-browser') && process.env.CAKE_TAGGER_NO_BROWSER !== '1';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream' };
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
const tagList = fs.readFileSync(path.join(root, 'tags.txt'), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
const correctionsPath = path.join(root, 'data/corrections.json');
const corrections = new Map();
const downloads = new Map();
if (fs.existsSync(correctionsPath)) {
  const stored = JSON.parse(fs.readFileSync(correctionsPath, 'utf8'));
  for (const item of stored.items) { const record = validateRecord(item, tagList); corrections.set(record.sha256, record); }
}
function saveCorrections() {
  const nextPath = correctionsPath + '.tmp';
  if (fs.existsSync(correctionsPath)) fs.copyFileSync(correctionsPath, correctionsPath + '.bak');
  fs.writeFileSync(nextPath, JSON.stringify({ version: 2, items: [...corrections.values()] }, null, 2), 'utf8');
  fs.renameSync(nextPath, correctionsPath);
}
function json(res, code, data) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
const server = http.createServer(async (req, res) => {
  const ownHost = '127.0.0.1:' + server.address().port;
  if (req.headers.host !== ownHost || (req.headers.origin && req.headers.origin !== 'http://' + ownHost)) { res.writeHead(403); return res.end('Forbidden'); }
  let requested;
  try { requested = decodeURIComponent(new URL(req.url, 'http://' + ownHost).pathname); } catch { res.writeHead(400); return res.end(); }
  if (req.method === 'GET' && requested.startsWith('/api/download/')) {
    const id = requested.slice('/api/download/'.length), item = downloads.get(id);
    if (!item || item.expires < Date.now()) { downloads.delete(id); return json(res, 404, { error: 'Download abgelaufen. Bitte JSON erneut speichern.' }); }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="cake-tags.json"', 'Content-Length': item.data.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    return res.end(item.data);
  }
  if (requested === '/api/export' && req.method === 'POST') {
    if (req.headers.authorization !== 'Bearer ' + token) return json(res, 401, { error: 'Bitte die Oberfläche über Start.cmd öffnen.' });
    try {
      if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'JSON erwartet.' });
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 16000000) throw Error('Export zu groß.'); chunks.push(chunk); }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!Array.isArray(input.items) || !input.items.length || input.items.length > 10000) throw Error('Keine gültigen Ergebnisse.');
      const items = input.items.map(item => { const record = validateRecord(item, tagList); return exportItem(applyRecord({ file: { name: record.filename } }, record)); });
      const output = path.join(root, 'outputs/cake-tags.json');
      fs.mkdirSync(path.dirname(output), { recursive: true });
      if (fs.existsSync(output)) fs.copyFileSync(output, output + '.bak');
      fs.writeFileSync(output + '.tmp', JSON.stringify({ version: 2, source: 'cake-tagger-local', createdAt: new Date().toISOString(), items }, null, 2), 'utf8');
      fs.renameSync(output + '.tmp', output);
      for (const [id, item] of downloads) if (item.expires < Date.now()) downloads.delete(id);
      while (downloads.size >= 3) downloads.delete(downloads.keys().next().value);
      const id = randomBytes(24).toString('hex');
      downloads.set(id, { data: fs.readFileSync(output), expires: Date.now() + 5 * 60 * 1000 });
      return json(res, 200, { saved: true, path: output, download: '/api/download/' + id });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (requested === '/api/corrections') {
    if (req.headers.authorization !== 'Bearer ' + token) return json(res, 401, { error: 'Bitte die Oberfläche über Start.cmd öffnen.' });
    if (req.method === 'GET') return json(res, 200, { version: 2, items: [...corrections.values()] });
    if (req.method === 'PUT') {
      try {
        if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'JSON erwartet.' });
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 512000) throw Error('Korrektur zu groß.'); chunks.push(chunk); }
        const record = validateRecord(JSON.parse(Buffer.concat(chunks).toString('utf8')), tagList);
        const previous = corrections.get(record.sha256);
        corrections.set(record.sha256, record);
        try { saveCorrections(); } catch (e) { if (previous) corrections.set(record.sha256, previous); else corrections.delete(record.sha256); throw e; }
        return json(res, 200, { saved: true });
      } catch (e) { return json(res, 400, { error: e.message }); }
    }
    return json(res, 405, { error: 'Nicht unterstützt.' });
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
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  if (requested === '/') requested = '/index.html';
  if (!(/^\/(index\.html|app\.js|style\.css|engine-worker\.js|tagging\.mjs|tag-policy\.mjs|sampling\.mjs|corrections\.mjs|mapping\.json|tags\.txt)$/.test(requested) || /^\/(vendor|model)\/[A-Za-z0-9._-]+$/.test(requested))) { res.writeHead(404); return res.end(); }
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
      const address = new URL(previous.url);
      if (address.origin !== 'http://127.0.0.1:8765') throw Error();
      const response = await fetch(address.origin + '/api/status', { headers: { Authorization: 'Bearer ' + address.hash.slice(1) }, signal: AbortSignal.timeout(1500) });
      if ((await response.json()).app !== 'cake-tagger-browser-v1') throw Error();
      if (showBrowser) spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process '${previous.url}'`], { windowsHide: true, stdio: 'ignore' });
      return;
    } catch {}
  }
  console.error(e.message); fs.writeFileSync(path.join(root, 'data/start-error.txt'), e.message); process.exitCode = 1;
});
server.listen(8765, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/#${token}`;
  fs.writeFileSync(path.join(root, 'data/session.json'), JSON.stringify({ url, pid: process.pid }));
  console.log('Cake Tagger bereit.');
  if (showBrowser) spawn('powershell.exe', ['-NoProfile', '-Command', `Start-Process '${url}'`], { windowsHide: true, stdio: 'ignore' });
});

