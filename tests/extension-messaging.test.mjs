import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function background() {
  let listener, click;
  const calls = [];
  const browser = {
    action: { onClicked: { addListener(fn) { click=fn; } } },
    runtime: { id: 'fixture', getURL: path => 'moz-extension://fixture/' + path, onMessage: { addListener(fn) { listener = fn; } } },
    tabs: {
      create: async options => { calls.push(options); },
      query: async () => [{ id: 42, title: 'Cake', url: 'https://cake.ski/' }],
      get: async id => ({ id, url: id === 42 ? 'https://cake.ski/' : 'https://example.com/' }),
      sendMessage: async (id, message) => { calls.push({ id, message }); return { added: message.tags, skipped: [] }; }
    }
  };
  vm.runInNewContext(await readFile(new URL('../extension/background.js', import.meta.url), 'utf8'), { browser, URL, crypto:globalThis.crypto, Uint8Array, cakeServer:{connect:async refresh=>{assert.equal(refresh,true);return {token:'a'.repeat(48)};}} });
  return { listener, calls, click };
}

test('background relays tags only to the matching Cake upload tab', async () => {
  const { listener, calls } = await background();
  const sender = { id: 'fixture', url: 'moz-extension://fixture/extension/bridge.html?embedded=1', tab: { id: 42 } };
  const message = { type: 'cake-tagger:transfer', tabId: 42, filename: 'clip.m4v', tags: ['tattoos'] };
  assert.equal((await listener(message, sender)).added[0], 'tattoos');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].message.type, 'cake-tagger:append');
  assert.ok((await listener({ ...message, tabId: 43 }, sender)).error);
  assert.ok((await listener({ ...message, tabId: 43 }, { ...sender, url: 'moz-extension://fixture/extension/bridge.html' })).error);
  assert.equal(listener(message, { ...sender, id: 'other' }), undefined);
  assert.equal(listener(message, { ...sender, url: 'https://cake.ski/' }), undefined);
  assert.equal(listener(message, { ...sender, url: 'moz-extension://fixture/extension/bridge.html.evil' }), undefined);
  assert.ok((await listener({ ...message, tags: [null] }, sender)).error);
  assert.equal(calls.length, 1);
  const tabs = await listener({ type: 'cake-tagger:list-tabs' }, sender);
  assert.equal(tabs[0].id, 42);
  assert.equal(tabs[0].url, undefined);
});

test('embedded transfer works with runtime messaging and no browser.tabs API', async () => {
  const previous = { location: globalThis.location, browser: globalThis.browser };
  const { listener, calls } = await background();
  const sender = { id: 'fixture', url: 'moz-extension://fixture/extension/bridge.html?embedded=1&target=42', tab: { id: 42 } };
  try {
    globalThis.location = { protocol: 'http:', href: 'http://127.0.0.1:8765/?integration=1&embedded=1&target=42' };
    globalThis.browser = { runtime: { sendMessage: message => listener(message, sender) } };
    const { integrationButton } = await import('../extension/integration.mjs?runtime-only');
    const messages = [];
    const button = integrationButton({ file: { name: 'clip.m4v' }, selected: new Map([['tattoos', true], ['glasses', false]]) }, () => ({}), message => messages.push(message));
    await button.onclick();
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].message.tags, ['tattoos']);
    assert.equal(messages[0].key, 'transfer.completeSingle'); assert.deepEqual(messages[0].params, { count: 1, skipped: 0 });
    assert.equal(button.disabled, false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

test('theme requests stay on Cake and cannot switch an embedded view to another tab', async () => {
  const { listener, calls } = await background();
  const sender = { id: 'fixture', url: 'moz-extension://fixture/extension/bridge.html?embedded=1', tab: { id: 42 } };
  await listener({ type: 'cake-tagger:get-theme', tabId: 42 }, sender);
  assert.equal(calls[0].message.type, 'cake-tagger:theme-request');
  assert.equal(await listener({ type: 'cake-tagger:get-theme', tabId: 43 }, sender), null);
  assert.equal(await listener({ type: 'cake-tagger:get-theme', tabId: 43 }, { ...sender, url: 'moz-extension://fixture/extension/bridge.html' }), null);
  assert.equal(listener({ type: 'cake-tagger:get-theme', tabId: 42 }, { ...sender, id: 'other' }), undefined);
  assert.equal(calls.length, 1);
});

test('toolbar opens the authenticated Localhost application instead of an extension analysis page',async()=>{
 const {click,calls}=await background();await click({id:42,url:'https://cake.ski/#/upload'});
 const url=new URL(calls[0].url);assert.equal(url.origin,'http://127.0.0.1:8765');assert.equal(url.pathname,'/');
 assert.equal(url.searchParams.get('integration'),'1');assert.equal(url.searchParams.get('target'),'42');
 assert.match(url.searchParams.get('channel'),/^[a-f0-9]{32}$/);assert.equal(url.hash,'#'+'a'.repeat(48));
});
