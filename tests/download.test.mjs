import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

test('download snapshots stay in memory and legacy corrections are not loaded or modified', async () => {
  const scratch = fileURLToPath(new URL('../work/', import.meta.url));
  fs.mkdirSync(scratch, { recursive: true });
  const parent = fs.realpathSync(scratch);
  const root = fs.mkdtempSync(path.join(parent, 'cake-tagger-download-'));
  for (const name of ['static.mjs', 'corrections.mjs', 'sampling.mjs', 'analysis-settings.mjs', 'tags.txt']) fs.copyFileSync(new URL('../' + name, import.meta.url), path.join(root, name));
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
    const sha = 'a'.repeat(64);
    const record = { filename: 'synthetic.mp4', sha256: sha, tags: ['tattoos'], candidateTags: ['tattoos'], reviewed: true, originalSuggestionsKnown: true,
      result: { sha256: sha, tags: [{ tag: 'tattoos', confidence: 0.8, supportingFrames: 4 }], uncertain: [], sampledFrames: 4, threshold: 0.4, analysisPolicy: 'coverage-v5:majority', model: 'JoyTag-INT8' } };
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
    assert.equal(fs.existsSync(path.join(root, 'outputs')), false);
    assert.equal(fs.readFileSync(old, 'utf8'), 'legacy data deliberately not parsed');
    assert.equal((await fetch(url.origin + '/api/corrections', { headers })).status, 404);
  } finally {
    const ended = once(child, 'exit'); child.kill(); await ended;
    assert(fs.realpathSync(root).startsWith(parent + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
