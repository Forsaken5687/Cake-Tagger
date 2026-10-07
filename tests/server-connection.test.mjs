import test from 'node:test';
import assert from 'node:assert/strict';

test('extension connection refreshes after restart and migrates settings without changing legacy storage',async()=>{
 const original=globalThis.fetch;let current='a'.repeat(48), handshakes=0, written;
 const legacy={language:'de',parallelism:'16',excludedTags:['freckles']};
 globalThis.fetch=async(url,options)=>{
  if(url.endsWith('/api/connect')){handshakes++;return new Response(JSON.stringify({token:current}));}
  if(options.headers.Authorization!=='Bearer '+current)return new Response('{}',{status:401});
  if(options.method==='POST')written=JSON.parse(options.body).settings;
  return new Response(JSON.stringify({settings:written,initialized:!!written}));
 };
 const browser={storage:{local:{get:async()=>({'cake-tagger-settings-v1':legacy}),set:()=>{throw Error('Original must stay intact');}}}};
 try{
  const service=await import('../extension/server-connection.mjs?restart-fixture');
  assert.equal((await service.connect()).token,current);assert.equal(handshakes,1);
  const saved=await service.getSettings(browser);assert.equal(saved.settings.parallelism,'16');assert.deepEqual(saved.settings.excludedTags,['freckles']);
  current='b'.repeat(48);assert.equal((await service.connect(true)).token,current);assert.equal(handshakes,2);
  current='c'.repeat(48);await service.getSettings(browser);assert.equal(handshakes,3);
  assert.equal(legacy.language,'de');
 }finally{globalThis.fetch=original;}
});

test('successful settings persistence survives failed tab notifications without rereading stale settings',async()=>{
 const original=globalThis.fetch;let reads=0,writes=0;
 globalThis.fetch=async(url,options)=>{
  if(url.endsWith('/api/connect'))return new Response(JSON.stringify({token:'a'.repeat(48)}));
  if(options.method!=='POST'){reads++;throw Error('Unexpected reread');}
  writes++;return new Response(JSON.stringify({initialized:true,settings:JSON.parse(options.body).settings}));
 };
 const browser={runtime:{sendMessage:async()=>{throw Error('No receiver');}},tabs:{query:async()=>{throw Error('Tab unavailable');}}};
 try{const service=await import('../extension/server-connection.mjs?notification-failure');
  const result=await service.saveSettings(browser,{hideSiteAI:true,language:'de'});
  assert.equal(result.settings.hideSiteAI,true);assert.equal(writes,1);assert.equal(reads,0);
 }finally{globalThis.fetch=original;}
});
