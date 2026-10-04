import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';

test('shutdown completes after the initiating browser disconnects during cleanup',async()=>{
 const work=fileURLToPath(new URL('../work/',import.meta.url));fs.mkdirSync(work,{recursive:true});
 const parent=fs.realpathSync(work),root=fs.mkdtempSync(path.join(parent,'shutdown-'));
 for(const file of ['static.mjs','native-engine.mjs','native-policy.mjs','messages.mjs','session-url.mjs','corrections.mjs','sampling.mjs','analysis-settings.mjs','preferences.mjs','tagging.mjs','tag-policy.mjs','mapping.json','tags.txt'])fs.copyFileSync(new URL('../'+file,import.meta.url),path.join(root,file));
 // Delay only this synthetic fixture to make a disconnected acknowledgement reproducible.
 const engineFile=path.join(root,'native-engine.mjs');
 fs.writeFileSync(engineFile,fs.readFileSync(engineFile,'utf8').replace(/\r\n/g,'\n').replace('async function stop() {','async function stop() { await new Promise(resolve=>setTimeout(resolve,300));'));
 const child=spawn(process.execPath,['static.mjs','--no-browser'],{cwd:root,env:{...process.env,CAKE_TAGGER_PORT:'0'},stdio:'ignore'});
 try{
  const sessionFile=path.join(root,'data/session.json');
  for(let i=0;i<100&&!fs.existsSync(sessionFile);i++)await delay(20);
  assert(fs.existsSync(sessionFile));const url=new URL(JSON.parse(fs.readFileSync(sessionFile)).url);
  const headers={Authorization:'Bearer '+url.hash.slice(1)},exiting=once(child,'exit');
  const request=http.request(url.origin+'/api/stop',{method:'POST',headers});request.on('error',()=>{});request.end();
  let admitted=false;
  for(let i=0;i<20;i++){const response=await fetch(url.origin+'/api/status',{headers});if(response.status===503){admitted=true;break;}await delay(5);}
  assert(admitted,'shutdown request admitted');request.destroy();
  assert.equal((await Promise.race([exiting,delay(5000,undefined,{ref:false}).then(()=>{throw Error('Shutdown stranded');})]))[0],0);
 }finally{
  if(child.exitCode===null){const exiting=once(child,'exit');child.kill();await exiting;}
  assert(fs.realpathSync(root).startsWith(parent+path.sep));fs.rmSync(root,{recursive:true,force:true});
 }
});
