import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneService } from '../extension/scene-service.mjs';
import { activeScene, addSceneTag, encodeFrame, sampleScene } from '../extension/scene-adapter.mjs';
import { missingSuggestions } from '../extension/scene-ui.mjs';
import { normalizeSettings } from '../src/shared/preferences.mjs';

const sender={id:'test',frameId:0,tab:{id:7},documentId:'document-a',url:'https://cake.ski/video/7'};
function serviceFixture(options={}) {
  const calls=[],timers=new Map();let next=0;
  const clock={setTimeout(fn){timers.set(++next,fn);return next;},clearTimeout(id){timers.delete(id);}};
  const service=createSceneService({runtime:{id:'test'}},{clock,settings:async()=>({settings:normalizeSettings({frames:'4',parallelism:'2',suggestionLimit:6,uncertainLimit:2})}),
    makeClient:()=>({stop:()=>calls.push('stop'),infer:async(frames,parallelism,policy)=>{calls.push({frames,parallelism,policy});return {analysis:{tags:[],uncertainScores:[]}};}}),...options});
  const send=(type,extra={},identity=sender)=>service.handle({type:'cake-tagger:scene-'+type,...extra},identity);
  return {service,send,calls,timers};
}
test('scene inference accepts only ordered bounded images owned by the top-level Cake document',async()=>{
  const f=serviceFixture();
  for(const other of [{...sender,id:'other'},{...sender,frameId:2},{...sender,url:'https://cake.ski.evil/'}])assert.equal((await f.send('start',{duration:5},other)).error,'error.sitePermission');
  const start=await f.send('start',{duration:5});assert.equal(start.count,4);
  assert.equal((await f.send('start',{duration:5})).error,'scene.busy');
  assert.equal((await f.send('finish',{job:start.job},{...sender,documentId:'other'})).error,'scene.expired');
  const data=encodeFrame(new Uint8ClampedArray(802816));
  for(let index=0;index<4;index++)assert.equal((await f.send('frame',{job:start.job,index,data})).received,index+1);
  assert((await f.send('finish',{job:start.job})).analysis);
  const call=f.calls.find(value=>value.frames);
  assert.equal(call.parallelism,'2');assert.equal(call.policy.raw,false);assert.equal(call.policy.suggestionLimit,6);
  assert.equal(f.timers.size,0);
});
test('out-of-order, malformed and excess images terminate scene jobs; timeouts and closed tabs release capacity',async()=>{
  for(const extra of [{index:1,data:encodeFrame(new Uint8ClampedArray(802816))},{index:0,data:'x'},{index:0,data:'!'.repeat(1070424)}]){
    const f=serviceFixture(),started=await f.send('start',{duration:5});
    assert.equal((await f.send('frame',{job:started.job,...extra})).error,'error.invalidModelInputImage');
    assert.equal(f.timers.size,0);
  }
  const f=serviceFixture();const a=await f.send('start',{duration:5});
  await f.send('start',{duration:5},{...sender,tab:{id:8}});
  assert.equal((await f.send('start',{duration:5},{...sender,tab:{id:9}})).error,'scene.busy');
  f.service.closeTab(7);assert.equal((await f.send('finish',{job:a.job})).error,'scene.expired');
  for(const timeout of [...f.timers.values()])timeout();assert.equal(f.timers.size,0);
});
test('cancelling active scene inference aborts its owned client without publishing a late result',async()=>{
  let finish,stopped=0;
  const f=serviceFixture({makeClient:()=>({stop(){stopped++;finish?.({analysis:{tags:[]}});},infer:()=>new Promise(resolve=>{finish=resolve;})})});
  const start=await f.send('start',{duration:5}),data=encodeFrame(new Uint8ClampedArray(802816));
  for(let index=0;index<4;index++)await f.send('frame',{job:start.job,index,data});
  const pending=f.send('finish',{job:start.job});await f.send('cancel',{job:start.job});
  assert.equal((await pending).error,'scene.expired');assert(stopped>0);assert.equal(f.timers.size,0);
});
test('missing scene suggestions omit present, pending, excluded and unknown tags and keep score order',()=>{
  const analysis={tags:[{tag:'mirror',confidence:.6},{tag:'solo',confidence:.9},{tag:'watermark',confidence:.95}],uncertainScores:[{tag:'glasses',confidence:.7},{tag:'unknown',confidence:.8}]};
  assert.deepEqual(missingSuggestions(analysis,new Set(['solo']),new Set(['mirror','solo','watermark','glasses']),normalizeSettings()).map(row=>row.tag),['glasses','mirror']);
});
function sceneFixture(mode='added') {
  let inputValue='',existing=['solo'],pending=[],clicked=0,searches=0;
  class Input extends EventTarget {get value(){return inputValue;}set value(value){inputValue=value;}getClientRects(){return[{}];}closest(){return null;}isConnected=true;}
  const input=new Input();
  const label=name=>({textContent:'#'+name});
  const option={querySelector:()=>label('mirror'),click(){clicked++;input.value='';if(mode==='added')existing.push('mirror');if(mode==='pending')pending.push('mirror');}};
  input.addEventListener('input',()=>{searches++;});
  const panel={isConnected:true,getClientRects:()=>[{}],closest:()=>null,querySelector:()=>input,
    querySelectorAll:selector=>selector==='.stok-tv-name'?existing.map(label):selector==='.stok-tv-pendtag'?pending.map(label):selector==='button.stok-tv-sugopt'?[option]:[]};
  const video={isConnected:true,getClientRects:()=>[{}],closest:()=>null};
  const card={isConnected:true,dataset:{sceneId:'7'},getClientRects:()=>[{}],closest:()=>null,querySelector:selector=>selector==='video'?video:{click(){}}};
  const doc={defaultView:{location:{pathname:'/video/7',hash:''},HTMLInputElement:Input,Event},querySelectorAll:selector=>selector.startsWith('#stok-feed')?[card]:selector==='.stok-tv-panel'?[panel]:selector==='.stok-tv-suginput'?[input]:[]};
  return {doc,card,video,input,option,panel,scene:{card,video,id:'7'},counts:()=>({clicked,searches}),changeVideo:()=>{card.dataset.sceneId='8';}};
}
test('native scene search confirms added and pending outcomes without an API call or renderer access',async()=>{
  for(const mode of ['added','pending']){
    const f=sceneFixture(mode);assert.equal(activeScene(f.doc).id,'7');
    assert.equal((await addSceneTag(f.doc,f.scene,'mirror',new AbortController().signal)).status,mode);
    assert.equal(f.counts().clicked,1);assert.equal(f.input.value,'');
  }
});
test('manual search text and video navigation block a native tag submission',async()=>{
  const f=sceneFixture();f.input.value='my unfinished search';
  await assert.rejects(addSceneTag(f.doc,f.scene,'mirror',new AbortController().signal));
  assert.equal(f.input.value,'my unfinished search');assert.equal(f.counts().clicked,0);
  f.input.value='';f.option.querySelector=()=>{f.changeVideo();return {textContent:'#mirror'};};
  await assert.rejects(addSceneTag(f.doc,f.scene,'mirror',new AbortController().signal));
  assert.equal(f.counts().clicked,0);
  f.doc.defaultView.location.pathname='/maintainer/moderation';assert.equal(activeScene(f.doc),null);
});
test('an unconfirmed native submission is marked submitted and is never automatically repeated',async()=>{
  const f=sceneFixture('unknown');
  await assert.rejects(addSceneTag(f.doc,f.scene,'mirror',new AbortController().signal,{timeout:5,poll:1}),error=>error.submitted===true);
  assert.equal(f.counts().clicked,1);
});
test('scene sampling uses the existing player, uploads RGBA and restores playback after success or failure',async()=>{
  for(const fail of [false,true]){
    const f=sceneFixture();let currentTime=1,paused=false,plays=0;
    class Video extends EventTarget {
      isConnected=true;duration=5;videoWidth=1920;videoHeight=1080;readyState=4;seeking=false;
      get currentTime(){return currentTime;}set currentTime(value){currentTime=value;queueMicrotask(()=>this.dispatchEvent(new Event('seeked')));}
      get paused(){return paused;}pause(){paused=true;}async play(){paused=false;plays++;}
      getClientRects(){return[{}];}closest(){return null;}
    }
    const video=new Video();f.scene.video=video;f.card.querySelector=selector=>selector==='video'?video:null;
    const draws=[];
    f.doc.createElement=()=>({width:0,height:0,getContext:()=>({fillRect(){},drawImage(...args){draws.push(args);},getImageData(){if(fail)throw Error('tainted');return {data:new Uint8ClampedArray(802816)};}})});
    let count=0;
    const operation=sampleScene(f.doc,f.scene,'4',new AbortController().signal,async frame=>{assert.equal(frame.length,802816);count++;});
    if(fail)await assert.rejects(operation);else {await operation;assert.equal(count,4);assert.equal(draws[1][1],0);assert.equal(draws[1][2],Math.floor((640-360)/2)*448/640);}
    assert.equal(currentTime,1);assert.equal(paused,false);assert.equal(plays,1);
  }
});


test('moderation overlays suppress scene detection even when the normal feed route remains active',()=>{
  const f=sceneFixture(),query=f.doc.querySelectorAll;
  f.doc.querySelectorAll=selector=>selector==='.adm-shell'?[{isConnected:true,closest:()=>null,getClientRects:()=>[{}]}]:query(selector);
  assert.equal(activeScene(f.doc),null);
});
