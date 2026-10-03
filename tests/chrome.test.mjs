import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('Chrome manifest uses a module service worker, PNG icons and limited permissions', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../extension/manifest.chrome.json', import.meta.url)));
  assert.deepEqual(manifest.background, { service_worker: 'extension/chrome-worker.mjs', type: 'module' });
  assert.equal(manifest.browser_specific_settings, undefined);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.deepEqual(manifest.host_permissions, ['https://cake.ski/*']);
  assert.equal(manifest.content_scripts[0].js[0], 'webext-api.js');
  assert.equal(manifest.action.default_popup, undefined);
  for (const [size, icon] of Object.entries(manifest.icons)) {
    const png = fs.readFileSync(new URL('../' + icon, import.meta.url));
    assert.equal(png.readUInt32BE(16), Number(size)); assert.equal(png.readUInt32BE(20), Number(size));
  }
});

test('Chrome message bridge retains async responses and ignores messages with no handler', async () => {
  const callbacks = [];
  const chrome = { runtime: { id: 'own', getURL: path => 'chrome-extension://own/' + path, sendMessage: async message => message, onMessage: { addListener: fn => callbacks.push(fn) } } };
  const scope = { chrome }; vm.runInNewContext(fs.readFileSync(new URL('../webext-api.js', import.meta.url), 'utf8'), scope);
  scope.browser.runtime.onMessage.addListener(message => message.type === 'handled' ? Promise.resolve({ ok: true }) : undefined);
  let response;
  assert.equal(callbacks[0]({ type: 'ignored' }, {}, () => { throw Error('Must not steal response'); }), false);
  assert.equal(callbacks[0]({ type: 'handled' }, {}, value => { response = value; }), true);
  await Promise.resolve(); assert.equal(response.ok, true);
  scope.browser.runtime.onMessage.addListener(() => Promise.reject(Error('failure')));
  assert.equal(callbacks[1]({}, {}, value => { response = value; }), true);
  await Promise.resolve(); assert.equal(response.error, 'failure');
  const existing = { runtime: { id: 'firefox' } }, firefox = { browser: existing, chrome };
  vm.runInNewContext(fs.readFileSync(new URL('../webext-api.js', import.meta.url), 'utf8'), firefox);
  assert.equal(firefox.browser, existing);
});

test('Chrome service worker initializes the shared settings and tag transfer handlers', async () => {
  const listeners = [], values = {}, transfers = [];
  globalThis.chrome = {
    action: { onClicked: { addListener() {} } },
    runtime: { id: 'own', getURL: path => 'chrome-extension://own/' + path, sendMessage: async () => undefined, onMessage: { addListener: fn => listeners.push(fn) } },
    storage: { local: { get: async () => values, set: async data => Object.assign(values, data) } },
    tabs: { query: async () => [], get: async id => ({ id, url: 'https://cake.ski/' }), sendMessage: async (id, request) => { transfers.push(request); return { added: request.tags, skipped: [] }; } }
  };
  try {
    await import('../extension/chrome-worker.mjs');
    assert.equal(listeners.length, 1);
    const sender = { id: 'own', url: 'chrome-extension://own/index.html?embedded=1', tab: { id: 42 } };
    const call = message => new Promise(resolve => {
      assert.equal(listeners[0](message, sender, resolve), true);
    });
    await call({ type: 'cake-tagger:settings-set', settings: { language: 'en', frames: '16' } });
    assert.equal((await call({ type: 'cake-tagger:settings-get' })).settings.frames, '16');
    const response = await call({ type: 'cake-tagger:transfer', tabId: 42, filename: 'test.m4v', tags: ['tattoos'] });
    assert.deepEqual(response.added, ['tattoos']); assert.equal(transfers[0].type, 'cake-tagger:append');
    assert.equal(listeners[0]({ type: 'cake-tagger:transfer' }, { ...sender, id: 'other' }, () => {}), false);
  } finally { delete globalThis.chrome; delete globalThis.browser; delete globalThis.cakeSettingsHandler; }
});
