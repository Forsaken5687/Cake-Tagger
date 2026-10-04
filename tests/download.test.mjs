import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

test('download snapshots stay in memory and legacy corrections are not loaded or modified', async () => {
  const scratch = fileURLToPath(new URL('../work/', import.meta.url));
  fs.mkdirSync(scratch, { recursive: true });
  const parent = fs.realpathSync(scratch);
  const root = fs.mkdtempSync(path.join(parent, 'cake-tagger-download-'));
  for (const name of ['static.mjs', 'diagnostics.html', 'diagnostics.mjs', 'inference-pool.mjs', 'messages.mjs', 'session-url.mjs', 'corrections.mjs', 'sampling.mjs', 'analysis-settings.mjs', 'tags.txt']) fs.copyFileSync(new URL('../' + name, import.meta.url), path.join(root, name));
  fs.mkdirSync(path.join(root, 'extension'));
  fs.copyFileSync(new URL('../extension/auto-analysis.mjs', import.meta.url), path.join(root, 'extension/auto-analysis.mjs'));
  fs.mkdirSync(path.join(root, 'data'));
  const old = path.join(root, 'data/corrections.json');
  fs.writeFileSync(old, 'legacy data deliberately not parsed');
  const child = spawn(process.execPath, ['static.mjs', '--no-browser'], { cwd: root, env: { ...process.env, CAKE_TAGGER_PORT: '0' }, stdio: 'ignore' });
  try {
    const sessionPath = path.join(root, 'data/session.json');
    for (let i = 0; i < 100 && !fs.existsSync(sessionPath); i++) await delay(30);
    assert(fs.existsSync(sessionPath), 'server started');
    const url = new URL(JSON.parse(fs.readFileSync(sessionPath, 'utf8')).url);
    const headers = { Authorization: 'Bearer ' + url.hash.slice(1), 'Content-Type': 'application/json' };
    assert.equal((await fetch(url.origin + '/extension/auto-analysis.mjs')).status, 200);
    assert.equal((await fetch(url.origin + '/extension/background.js')).status, 404);
    const diagnostics = await fetch(url.origin + '/diagnostics.html');
    assert.equal(diagnostics.status, 200);
    assert.equal(diagnostics.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(diagnostics.headers.get('cross-origin-embedder-policy'), 'require-corp');
    assert.equal((await fetch(url.origin + '/diagnostics.mjs')).status, 200);
    assert.equal((await fetch(url.origin + '/inference-pool.mjs')).status, 200);
    const sha = 'a'.repeat(64);
    const record = { filename: 'synthetic.mp4', sha256: sha, tags: ['tattoos'], candidateTags: ['tattoos'], reviewed: true, originalSuggestionsKnown: true,
      result: { sha256: sha, tags: [{ tag: 'tattoos', confidence: 0.8, supportingFrames: 4 }], uncertain: [], sampledFrames: 4, threshold: 0.4, analysisPolicy: 'coverage-v5:majority:["hairy","watermark"]', model: 'JoyTag-INT8' } };
    const denied = await fetch(url.origin + '/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [record] }) });
    assert.equal(denied.status, 401);
    const response = await fetch(url.origin + '/api/export', { method: 'POST', headers, body: JSON.stringify({ items: [record] }) });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.path, undefined);
    const download = await fetch(url.origin + result.download);
    assert.match(download.headers.get('content-disposition'), /attachment/);
    const exported = await download.json();
    assert.deepEqual(exported.items[0].tags, ['tattoos']);
    assert.equal(exported.items[0].reviewed, true);
    assert.equal(exported.items[0].analysisPolicy, record.result.analysisPolicy);
    const malformed = { ...record, result: { ...record.result, analysisPolicy: 'unknown-policy' } };
    const invalid = await fetch(url.origin + '/api/export', { method: 'POST', headers, body: JSON.stringify({ items: [malformed] }) });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.key, 'error.invalidAnalysisPolicy');
    const forbiddenOrigin = await fetch(url.origin + '/api/export', { method: 'POST', headers: { ...headers, Origin: 'https://example.com' }, body: JSON.stringify({ items: [record] }) });
    assert.equal(forbiddenOrigin.status, 403);
    // fetch controls its own Host header; use HTTP directly to exercise rebinding checks.
    const reboundStatus = await new Promise((resolve, reject) => {
      http.get(url.origin + '/api/status', { headers: { ...headers, Host: 'example.com' } }, response => {
        response.resume(); resolve(response.statusCode);
      }).on('error', reject);
    });
    assert.equal(reboundStatus, 403);
    const page = await fetch(url.origin + '/tags.txt');
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    for (const name of ['/data/session.json', '/data/corrections.json', '/.git/config', '/README.md']) {
      assert.equal((await fetch(url.origin + name)).status, 404);
    }
    assert.equal(fs.existsSync(path.join(root, 'outputs')), false);
    assert.equal(fs.readFileSync(old, 'utf8'), 'legacy data deliberately not parsed');
    assert.equal((await fetch(url.origin + '/api/corrections', { headers })).status, 404);
  } finally {
    const ended = once(child, 'exit'); child.kill(); await ended;
    assert(fs.realpathSync(root).startsWith(parent + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
