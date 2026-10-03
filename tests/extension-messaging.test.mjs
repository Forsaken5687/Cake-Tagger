import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function background() {
  let listener;
  const calls = [];
  const browser = {
    action: { onClicked: { addListener() {} } },
    runtime: { id: 'fixture', getURL: path => 'moz-extension://fixture/' + path, onMessage: { addListener(fn) { listener = fn; } } },
    tabs: {
      query: async () => [{ id: 42, title: 'Cake', url: 'https://cake.ski/' }],
      get: async id => ({ id, url: id === 42 ? 'https://cake.ski/' : 'https://example.com/' }),
      sendMessage: async (id, message) => { calls.push({ id, message }); return { added: message.tags, skipped: [] }; }
    }
  };
  vm.runInNewContext(await readFile(new URL('../extension/background.js', import.meta.url), 'utf8'), { browser, URL });
  return { listener, calls };
}

test('background relays tags only to the matching Cake upload tab', async () => {
  const { listener, calls } = await background();
  const sender = { id: 'fixture', url: 'moz-extension://fixture/index.html?embedded=1', tab: { id: 42 } };
  const message = { type: 'cake-tagger:transfer', tabId: 42, filename: 'clip.m4v', tags: ['tattoos'] };
  assert.equal((await listener(message, sender)).added[0], 'tattoos');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].message.type, 'cake-tagger:append');
  assert.ok((await listener({ ...message, tabId: 43 }, sender)).error);
  assert.ok((await listener({ ...message, tabId: 43 }, { ...sender, url: 'moz-extension://fixture/index.html' })).error);
  assert.equal(listener(message, { ...sender, id: 'other' }), undefined);
  assert.equal(listener(message, { ...sender, url: 'https://cake.ski/' }), undefined);
  assert.equal(listener(message, { ...sender, url: 'moz-extension://fixture/index.html.evil' }), undefined);
  assert.ok((await listener({ ...message, tags: [null] }, sender)).error);
  assert.equal(calls.length, 1);
  const tabs = await listener({ type: 'cake-tagger:list-tabs' }, sender);
  assert.equal(tabs[0].id, 42);
  assert.equal(tabs[0].url, undefined);
});

test('embedded transfer works with runtime messaging and no browser.tabs API', async () => {
  const previous = { location: globalThis.location, browser: globalThis.browser };
  const { listener, calls } = await background();
  const sender = { id: 'fixture', url: 'moz-extension://fixture/index.html?embedded=1&target=42', tab: { id: 42 } };
  try {
    globalThis.location = { protocol: 'moz-extension:', href: sender.url };
    globalThis.browser = { runtime: { sendMessage: message => listener(message, sender) } };
    const { integrationButton } = await import('../extension/integration.mjs?runtime-only');
    const messages = [];
    const button = integrationButton({ file: { name: 'clip.m4v' }, selected: new Map([['tattoos', true], ['glasses', false]]) }, () => ({}), message => messages.push(message));
    await button.onclick();
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].message.tags, ['tattoos']);
    assert.match(messages[0], /^1 Tags ergänzt/);
    assert.equal(button.disabled, false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
