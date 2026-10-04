import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function background(downloadFailure = false, commandReply = {accepted:true}) {
  let listener, click;
  const calls = [];
  const browser = {
    action: { onClicked: { addListener(fn) { click=fn; } } },
    runtime: { id: 'fixture', getURL: path => 'moz-extension://fixture/' + path, onMessage: { addListener(fn) { listener = fn; } }, sendMessage: async message => { calls.push({ runtime: message }); return commandReply; } },
    downloads: {download:async options=>{if(downloadFailure)throw Error('Download denied');calls.push({download:options});return 7;}},
    tabs: {
      create: async options => { calls.push(options); },
      query: async () => [{ id: 42, title: 'Cake', url: 'https://cake.ski/' }],
      update: async (id, options) => { calls.push({ id, options }); },
      get: async id => ({ id, url: id === 42 ? 'https://cake.ski/' : 'https://example.com/' }),
      sendMessage: async (id, message) => { calls.push({ id, message }); return { added: message.tags, skipped: [] }; }
    }
  };
  vm.runInNewContext(await readFile(new URL('../extension/background.js', import.meta.url), 'utf8'), { browser, URL, crypto:globalThis.crypto, Uint8Array, cakeServer:{saveSettings:async (_browser,settings)=>{calls.push({saved:settings});return {settings};},getCapabilities:async()=>({testMaximum:24}),connect:async refresh=>{assert.equal(refresh,true);return {token:'a'.repeat(48)};}, stop: async () => { calls.push({stop:true}); return {stopped:true}; }} });
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

test('toolbar focuses the Cake upload instead of opening a separate analysis window',async()=>{
 const {click,calls}=await background();await click({id:42,url:'https://cake.ski/#/upload'});
 assert.equal(calls.length,1);assert.equal(calls[0].id,42);assert.equal(calls[0].message.type,'cake-tagger:open');
});

test('upload UI commands require the extension sender and bind the forwarded tab',async()=>{
 const {listener,calls}=await background();
 const source={id:'fixture',url:'https://cake.ski/',tab:{id:42}};
 const command={type:'cake-tagger:ui-command',channel:'a'.repeat(32),command:{action:'quit'}};
 assert.equal(listener(command,{...source,id:'website'}),undefined);
 assert.equal(listener({...command,command:{action:'arbitrary'}},source),undefined);
 assert.equal(listener({type:'cake-tagger:quit'},source),undefined);
 await listener(command,source);assert.equal(calls[0].runtime.type,'cake-tagger:ui-command-forwarded');assert.equal(calls[0].runtime.tabId,42);assert.equal(calls[0].runtime.channel,command.channel);
});

test('popup Quit calls the local shutdown service and never closes a tab instead', async () => {
 const {listener,calls}=await background();
 const sender={id:'fixture',url:'moz-extension://fixture/extension/popup.html'};
 assert.equal((await listener({type:'cake-tagger:quit'},sender)).stopped,true);
 assert.equal(calls.length,1);assert.equal(calls[0].stop,true);
 assert.equal(listener({type:'cake-tagger:quit'},{...sender,id:'other'}),undefined);
});

test('native upload settings use the background API and reject unrelated senders',async()=>{
 const {listener,calls}=await background();
 const sender={id:'fixture',url:'https://cake.ski/',tab:{id:42}};
 const settings={showScores:false};
 const reply=await listener({type:'cake-tagger:settings-save',settings},sender);
 assert.equal(reply.settings.showScores,false);assert.equal(calls[0].saved,settings);
 assert.equal((await listener({type:'cake-tagger:capabilities'},sender)).testMaximum,24);
 assert.equal(listener({type:'cake-tagger:settings-save',settings},{...sender,id:'other'}),undefined);
});


test('exports use the download API only for guarded local snapshot paths',async()=>{
 const {listener,calls}=await background();
 const sender={id:'fixture',url:'moz-extension://fixture/extension/bridge.html?embedded=1',tab:{id:42}};
 const path='/api/download/'+'a'.repeat(48),message={type:'cake-tagger:download',path};
 assert.equal((await listener(message,sender)).started,true);
 assert.equal(calls.length,1);assert.deepEqual(JSON.parse(JSON.stringify(calls[0].download)),{url:'http://127.0.0.1:8765'+path,filename:'cake-tags.json',conflictAction:'uniquify'});
 for(const invalid of ['https://example.com/', '/api/stop',path+'?token=x',path+'\n', '/api/download/../private',null,{}])assert.ok((await listener({...message,path:invalid},sender)).error);
 assert.equal(listener(message,{...sender,id:'other'}),undefined);
 assert.equal(listener(message,{...sender,url:'https://cake.ski/'}),undefined);
 assert.ok((await listener(message,{...sender,url:'moz-extension://fixture/extension/popup.html'})).error);
 assert.equal(calls.length,1);
});


test('download manager rejection returns a visible export error',async()=>{
 const {listener}=await background(true);
 const sender={id:'fixture',url:'moz-extension://fixture/extension/bridge.html?embedded=1',tab:{id:42}};
 const result=await listener({type:'cake-tagger:download',path:'/api/download/'+'a'.repeat(48)},sender);
 assert.equal(result.error.key,'error.downloadRejected');assert.equal(result.error.params.reason,'Download denied');assert.equal(result.started,undefined);
});


test('upload command relay reports missing receivers instead of silently swallowing failure',async()=>{
 const {listener}=await background(false,undefined);
 const source={id:'fixture',url:'https://cake.ski/',tab:{id:42}};
 // A background broadcast must be acknowledged by the matching bridge.
 const missing=await background(false,null);
 const result=await missing.listener({type:'cake-tagger:ui-command',channel:'a'.repeat(32),command:{action:'export'}},source);
 assert.equal(result.error,'error.uploadConnection');
 const accepted=await listener({type:'cake-tagger:ui-command',channel:'a'.repeat(32),command:{action:'export'}},source);
 assert.equal(accepted.accepted,true);
});


test('processing bridge relays export RPCs and acknowledges only its own tab commands',async()=>{
 const {listener,calls}=await background();
 const channel='a'.repeat(32),origin='moz-extension://fixture';
 const sender={id:'fixture',url:origin+'/extension/bridge.html?embedded=1&channel='+channel+'&target=42',tab:{id:42}};
 let messageListener,commandListener;
 const posted=[],frame={contentWindow:{postMessage:(message,target)=>posted.push({message,target})}},parent={postMessage(){}};
 const browser={runtime:{id:'fixture',getURL:path=>origin+'/'+path,sendMessage:message=>listener(message,sender),onMessage:{addListener:fn=>{commandListener=fn;}}}};
 const context={browser,parent,window:{addEventListener:(type,fn)=>{messageListener=fn;}},location:{href:sender.url,origin},document:{querySelector:()=>frame},URL,Set,Number,File:class{},isFileMessage:()=>false,translate:key=>key};
 const source=(await readFile(new URL('../extension/bridge.mjs',import.meta.url),'utf8')).replace(/^import .*\r?\n/gm,'');
 await vm.runInNewContext('(async()=>{'+source+'})()',context);
 const trustedSender={id:'fixture',url:origin+'/_generated_background_page.html'};
 const forwarded={type:'cake-tagger:ui-command-forwarded',channel,tabId:42,command:{action:'export'}};
 assert.equal((await commandListener(forwarded,trustedSender)).accepted,true);
 assert.equal(posted[0].message.action,'export');
 assert.equal(commandListener({...forwarded,tabId:43},trustedSender),undefined);
 assert.equal(commandListener(forwarded,{id:'fixture',url:'https://cake.ski/'}),undefined);
 const rpc={source:frame.contentWindow,origin:'http://127.0.0.1:8765',data:{type:'cake-tagger:rpc',channel,id:1,message:{type:'cake-tagger:download',path:'/api/download/'+'b'.repeat(48)}}};
 await messageListener(rpc);
 assert.equal(calls.at(-1).download.url,'http://127.0.0.1:8765'+rpc.data.message.path);
 assert.equal(posted.at(-1).message.type,'cake-tagger:rpc-response');assert.equal(posted.at(-1).message.response.started,true);
 const before=calls.length;await messageListener({...rpc,source:parent,origin:'https://cake.ski/'});assert.equal(calls.length,before);
});
