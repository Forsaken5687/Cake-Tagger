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
  for (const name of ['src/client/analysis.html', 'model/provenance.json', 'model/policy.json', 'src/shared/preferences.mjs', 'src/shared/tagging.mjs', 'src/shared/tag-policy.mjs', 'model/mapping.json', 'src/client/native-client.mjs', 'src/client/local-session.mjs', 'src/client/diagnostics.html', 'src/client/diagnostics.mjs', 'src/client/runtime-metrics.mjs', 'src/shared/messages.mjs', 'src/shared/session-url.mjs', 'src/shared/corrections.mjs', 'src/client/sampling.mjs', 'src/shared/analysis-settings.mjs', 'model/tags.txt']) { fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true}); fs.copyFileSync(new URL('../' + name, import.meta.url), path.join(root,name)); }
  fs.mkdirSync(path.join(root, 'src/client'),{recursive:true});
  fs.copyFileSync(new URL('../src/client/auto-analysis.mjs', import.meta.url), path.join(root, 'src/client/auto-analysis.mjs'));
  fs.mkdirSync(path.join(root, 'data'));
  const old = path.join(root, 'data/corrections.json');
  fs.writeFileSync(old, 'legacy data deliberately not parsed');
  let child = spawn(fileURLToPath(new URL('../runtime/cpython/python.exe',import.meta.url)), ['-m','cake_tagger','--root',root,'--port','0'], { cwd: root, env: { ...process.env, CAKE_TAGGER_PORT: '0' }, stdio: 'ignore' });
  try {
    const sessionPath = path.join(root, 'data/session.json');
    for (let i = 0; i < 100 && !fs.existsSync(sessionPath); i++) await delay(30);
    assert(fs.existsSync(sessionPath), 'server started');
    const url = new URL(JSON.parse(fs.readFileSync(sessionPath, 'utf8')).url);
    const headers = { Authorization: 'Bearer ' + url.hash.slice(1), 'Content-Type': 'application/json' };
    for (const route of ['/', '/index.html', '/?integration=1&channel=' + 'a'.repeat(32)]) {
      const response = await fetch(url.origin + route, { redirect: 'manual' });
      assert.equal(response.status, 302); assert.equal(response.headers.get('location'), 'https://cake.ski/');
    }
    const hidden = await fetch(url.origin + '/src/client/analysis.html');
    assert.equal(hidden.status, 200); assert((await hidden.text()).includes('<body hidden>'));
    assert.equal((await fetch(url.origin + '/api/runtime')).status, 401);
    assert.equal((await fetch(url.origin + '/api/connect', { method: 'POST' })).status, 403);
    assert.equal((await fetch(url.origin + '/api/connect', { method: 'POST', headers: { Origin: 'https://cake.ski', 'X-Cake-Tagger-Client': 'extension' } })).status, 403);
    const extensionOrigin = 'moz-extension://12345678-1234-1234-1234-123456789abc';
    const connected = await fetch(url.origin + '/api/connect', { method: 'POST', headers: { Origin: extensionOrigin, 'X-Cake-Tagger-Client': 'extension' } });
    assert.equal(connected.headers.get('access-control-allow-origin'), extensionOrigin);
    assert.equal((await connected.json()).token, url.hash.slice(1));
    assert.equal((await fetch(url.origin+'/api/connect',{method:'POST',headers:{'X-Cake-Tagger-Client':'local'}})).status,403);
    assert.equal((await fetch(url.origin+'/api/connect',{method:'POST',headers:{Origin:'https://cake.ski','X-Cake-Tagger-Client':'local'}})).status,403);
    const local=await fetch(url.origin+'/api/connect',{method:'POST',headers:{Origin:url.origin,'X-Cake-Tagger-Client':'local'}});
    assert.equal(local.status,200);assert.equal((await local.json()).token,url.hash.slice(1));
    assert.equal((await fetch(url.origin + '/api/infer', { method: 'POST' })).status, 401);
    assert.equal((await fetch(url.origin + '/api/infer?parallelism=100', { method: 'POST', headers })).status, 400);
    assert.equal((await fetch(url.origin + '/api/infer', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream' }, body: new Uint8Array(4) })).status, 400);
    const runtimeResponse = await fetch(url.origin + '/api/runtime', { headers });
    assert.equal(runtimeResponse.status, 200);
    const runtime = await runtimeResponse.json();
    assert(runtime.hostMemory.totalBytes > 0); assert(runtime.hostMemory.freeBytes <= runtime.hostMemory.totalBytes);
    assert(runtime.serverMemory.rssBytes > 0);
    assert.equal((await fetch(url.origin + '/api/runtime', { headers: { ...headers, Origin: 'https://cake.ski' } })).status, 403);
    assert.equal((await fetch(url.origin + '/src/client/auto-analysis.mjs')).status, 200);
    assert.equal((await fetch(url.origin + '/extension/background.js')).status, 404);
    assert.equal((await fetch(url.origin + '/review.html')).status, 404);
    assert.equal((await fetch(url.origin + '/src/shared/evaluation.mjs')).status, 404);
    assert.equal((await fetch(url.origin + '/api/export?evaluation=1', {method:'POST', headers, body:'{}'})).status, 404);
    const caps = await (await fetch(url.origin + '/api/capabilities', { headers })).json();
    assert.equal(caps.testMaximum, caps.logicalProcessors);
    assert.equal((await fetch(url.origin + '/api/settings')).status, 401);
    const settings = { language:'en', parallelism:String(Math.min(16,caps.testMaximum)), excludedTags:['tattoos'], hideSiteAI:true };
    const saved = await fetch(url.origin + '/api/settings', { method:'POST', headers, body:JSON.stringify({settings}) });
    assert.equal(saved.status, 200);
    assert.equal((await (await fetch(url.origin + '/api/settings', { headers })).json()).settings.parallelism, settings.parallelism);
    const invalidSettings = await fetch(url.origin + '/api/settings', {method:'POST',headers,body:JSON.stringify({settings:{parallelism:String(caps.testMaximum+1)}})});
    assert.equal(invalidSettings.status,400);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root,'data/preferences.json'))).parallelism, settings.parallelism);
    const diagnostics = await fetch(url.origin + '/src/client/diagnostics.html');
    assert.equal(diagnostics.status, 200);
    assert.equal(diagnostics.headers.get('cross-origin-opener-policy'), null);
    assert.equal(diagnostics.headers.get('cross-origin-embedder-policy'), null);
    assert.equal((await fetch(url.origin + '/src/client/diagnostics.mjs')).status, 200);
    assert.equal((await fetch(url.origin + '/inference-pool.mjs')).status, 404);
    assert.equal((await fetch(url.origin + '/compute-policy.js')).status, 404);
    assert.equal((await fetch(url.origin + '/src/client/runtime-metrics.mjs')).status, 200);
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
    assert.equal((await invalid.json()).error, 'error.invalidAnalysisPolicy');
    const forbiddenOrigin = await fetch(url.origin + '/api/export', { method: 'POST', headers: { ...headers, Origin: 'https://example.com' }, body: JSON.stringify({ items: [record] }) });
    assert.equal(forbiddenOrigin.status, 403);
    // fetch controls its own Host header; use HTTP directly to exercise rebinding checks.
    const reboundStatus = await new Promise((resolve, reject) => {
      http.get(url.origin + '/api/status', { headers: { ...headers, Host: 'example.com' } }, response => {
        response.resume(); resolve(response.statusCode);
      }).on('error', reject);
    });
    assert.equal(reboundStatus, 403);
    const page = await fetch(url.origin + '/model/tags.txt');
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    for (const name of ['/data/session.json', '/data/corrections.json', '/.git/config', '/README.md']) {
      assert.equal((await fetch(url.origin + name)).status, 404);
    }
    assert.equal(fs.existsSync(path.join(root, 'outputs')), false);
    assert.equal(fs.readFileSync(old, 'utf8'), 'legacy data deliberately not parsed');
    assert.equal((await fetch(url.origin + '/api/corrections', { headers })).status, 404);
    const exiting = once(child,'exit');
    const stopped = await fetch(url.origin+'/api/stop',{method:'POST',headers});
    assert.deepEqual(await stopped.json(),{stopped:true});
    assert.equal((await exiting)[0],0);
    assert.equal(fs.readFileSync(old,'utf8'),'legacy data deliberately not parsed');
    assert.equal(JSON.parse(fs.readFileSync(path.join(root,'data/preferences.json'))).parallelism,settings.parallelism);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root,'data/preferences.json'))).hideSiteAI,true);
    assert.equal(fs.existsSync(sessionPath),false);
    child=spawn(fileURLToPath(new URL('../runtime/cpython/python.exe',import.meta.url)),['-m','cake_tagger','--root',root,'--port','0'],{cwd:root,env:{...process.env,CAKE_TAGGER_PORT:'0'},stdio:'ignore'});
    for(let i=0;i<100&&!fs.existsSync(sessionPath);i++)await delay(30);
    assert(fs.existsSync(sessionPath),'server restarted');
    const restarted=new URL(JSON.parse(fs.readFileSync(sessionPath,'utf8')).url);
    const restored=await fetch(restarted.origin+'/api/settings',{headers:{Authorization:'Bearer '+restarted.hash.slice(1)}}).then(r=>r.json());
    assert.equal(restored.settings.hideSiteAI,true);assert.equal(restored.settings.parallelism,settings.parallelism);
  } finally {
    if (child.exitCode === null) { const ended = once(child, 'exit'); child.kill(); await ended; }
    assert(fs.realpathSync(root).startsWith(parent + path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
