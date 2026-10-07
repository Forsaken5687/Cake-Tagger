import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
const executable=process.env.CAKE_TAGGER_PYTHON||path.join(root,'runtime/python/Scripts/python.exe');
const available=fs.existsSync(executable)&&fs.existsSync(path.join(root,'model/joytag.onnx'));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('Python HTTP variant preserves shared endpoints, downloads and stops both processes',{skip:!available,timeout:60000},async()=>{
 fs.mkdirSync(path.join(root,'work'),{recursive:true});const fixture=fs.mkdtempSync(path.join(root,'work/python-http-'));
 const files=['src/server/server.mjs','src/server/native-engine.mjs','src/server/native-policy.mjs','src/server/python-engine.mjs','src/server/python_worker.py','src/server/python_core.py','src/shared/messages.mjs','src/shared/session-url.mjs','src/shared/corrections.mjs','src/client/sampling.mjs','src/shared/analysis-settings.mjs','src/shared/preferences.mjs','src/shared/tagging.mjs','src/shared/tag-policy.mjs','model/mapping.json','model/tags.txt','model/provenance.json'];
 for(const file of files){fs.mkdirSync(path.dirname(path.join(fixture,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(fixture,file));}
 fs.linkSync(path.join(root,'model/joytag.onnx'),path.join(fixture,'model/joytag.onnx'));
 fs.mkdirSync(path.join(fixture,'data'),{recursive:true});fs.writeFileSync(path.join(fixture,'data/preferences.json'),'original Node settings');fs.writeFileSync(path.join(fixture,'data/session.json'),'original Node token');
 const child=spawn(path.join(root,'runtime/node.exe'),[path.join(fixture,'src/server/server.mjs'),'--python','--no-browser'],{env:{...process.env,CAKE_TAGGER_PORT:'0',CAKE_TAGGER_PYTHON:executable},windowsHide:true,stdio:['ignore','pipe','pipe']});
 let error='';child.stderr.on('data',data=>error+=data);child.stdout.resume();const closed=new Promise(resolve=>child.once('close',resolve));
 let address;
 try{
  for(let i=0;i<100;i++){try{address=JSON.parse(fs.readFileSync(path.join(fixture,'data/python/session.json'))).url;break;}catch{}await sleep(50);}
  assert(address,error);const url=new URL(address),headers={Authorization:'Bearer '+url.hash.slice(1)};
  const response=await fetch(url.origin+'/api/status',{headers});assert.equal((await response.json()).backendImplementation,'python');
  assert.equal((await fetch(url.origin+'/api/status',{headers:{...headers,Origin:'https://example.com'}})).status,403);
  const settings=await fetch(url.origin+'/api/settings',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({settings:{language:'de',hideSiteAI:true}})});assert.equal((await settings.json()).settings.hideSiteAI,true);
  const frames=new Uint8Array(802816*2).fill(127),threads=Math.min(16,os.availableParallelism());
  const infer=async(body,signal)=>fetch(url.origin+'/api/infer?raw=1&parallelism='+threads,{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream'},body,signal});
  const first=await infer(frames);const lines=(await first.text()).trim().split('\n').map(JSON.parse);const done=lines.find(x=>x.type==='done');assert(done,JSON.stringify(lines));assert.equal(done.runtime.backendImplementation,'python');assert.equal(done.runtime.configuredNativeThreads,threads);assert.equal(done.scores.length,2);
  const result={sha256:'a'.repeat(64),tags:done.analysis.tags,uncertain:done.analysis.uncertain,uncertainScores:done.analysis.uncertainScores,sampledFrames:2,threshold:.4,model:'JoyTag-FP32',runtime:done.runtime};
  const exported=await fetch(url.origin+'/api/export',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({items:[{filename:'synthetic.mp4',sha256:result.sha256,tags:result.tags.map(x=>x.tag),candidateTags:[...result.tags.map(x=>x.tag),...result.uncertain],reviewed:false,originalSuggestionsKnown:true,result}]})});
  const download=await exported.json();assert(download.download,JSON.stringify(download));assert.equal((await (await fetch(url.origin+download.download)).json()).items[0].runtime.backendImplementation,'python');
  const controller=new AbortController();const cancelled=await infer(new Uint8Array(802816*8).fill(127),controller.signal);const reader=cancelled.body.getReader();await reader.read();controller.abort();await reader.cancel().catch(()=>{});
  const following=await infer(frames);assert((await following.text()).includes('"type":"done"'));
  // Stop during a running request: wait until progress confirms a native job began.
  const active=await infer(new Uint8Array(802816*8).fill(127));const activeReader=active.body.getReader();let stream='';while(!stream.includes('"type":"progress"')){const chunk=await activeReader.read();assert(!chunk.done);stream+=new TextDecoder().decode(chunk.value);}
  const stop=await fetch(url.origin+'/api/stop',{method:'POST',headers});assert.equal((await stop.json()).stopped,true);await activeReader.cancel().catch(()=>{});
  assert.equal(await closed,0,error);
  assert.equal(fs.readFileSync(path.join(fixture,'data/preferences.json'),'utf8'),'original Node settings');assert.equal(fs.readFileSync(path.join(fixture,'data/session.json'),'utf8'),'original Node token');
 }finally{if(child.exitCode===null){child.kill();await closed;}if(!fixture.startsWith(path.join(root,'work')+path.sep))throw Error('Unsafe fixture path');fs.rmSync(fixture,{recursive:true,force:true});}
});
