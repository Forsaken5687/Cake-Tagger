import { activeScene, sameScene, sceneTags, openSceneTags, sampleScene, encodeFrame, addSceneTag } from './scene-adapter.mjs';
import { translate, messageError, errorMessage } from '../src/shared/messages.mjs';
import { isTrustedEvent } from '../src/shared/trusted-event.mjs';

export function missingSuggestions(analysis, present, allowed, settings) {
  const blocked=new Set([...present,...settings.excludedTags || []]);
  const rows=[...(analysis?.tags || []),...(settings.showUncertain ? analysis?.uncertainScores || [] : [])];
  const found=new Map();
  for(const row of rows) if(allowed.has(row.tag) && !blocked.has(row.tag) && !found.has(row.tag)) found.set(row.tag,row);
  return [...found.values()].sort((a,b)=>b.confidence-a.confidence || a.tag.localeCompare(b.tag));
}
export function mountSceneSuggestions(doc,runtime,allowed) {
  const cache=new Map(); let active, root, timer, stopped=false;
  let settings={language:'auto',showScores:true,showUncertain:true,excludedTags:[]};
  const language=()=>settings.language==='de' || (settings.language!=='en' && doc.documentElement.lang.startsWith('de'))?'de':'en';
  const t=(key,params)=>translate(key,language(),params);
  const element=(tag,text,className)=>{const node=doc.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
  async function call(type,extra={}) {
    const response=await runtime.sendMessage({type,...extra});
    if(!response || response.error) throw messageError(response?.error || 'error.nativeServer');
    return response;
  }
  function cancel(entry) {
    entry?.controller?.abort();
    if(entry?.job) void runtime.sendMessage({type:'cake-tagger:scene-cancel',job:entry.job}).catch(()=>{});
  }
  function render() {
    if(!root || !active)return;
    const entry=active, open=root.open;
    root.replaceChildren();
    const summary=element('summary','Cake Tagger · '+t('scene.title'));root.append(summary);
    const body=element('div',null,'cake-tagger-scene-body');
    const actions=element('div',null,'cake-tagger-result-actions');
    const analyze=element('button',t('scene.analyze'),'cake-tagger-primary');analyze.type='button';analyze.disabled=entry.busy;
    const cancelButton=element('button',t('scene.cancel'));cancelButton.type='button';cancelButton.hidden=!entry.busy;
    analyze.addEventListener('click',event=>{if(isTrustedEvent(event))void analyzeScene(entry);});
    cancelButton.addEventListener('click',event=>{if(isTrustedEvent(event))cancel(entry);});
    actions.append(analyze,cancelButton);body.append(actions);
    body.append(element('p',entry.message || t('scene.hint'),'cake-tagger-scene-status'));
    const list=element('div',null,'cake-tagger-scene-list');
    const present=sceneTags(doc);
    for(const row of missingSuggestions(entry.analysis,present,allowed,settings)) {
      const outcome=entry.outcomes.get(row.tag);
      if(outcome==='added' || outcome==='pending')continue;
      const button=element('button',null,'cake-tagger-scene-tag');button.type='button';
      button.disabled=entry.busy || outcome==='unknown';
      button.append(element('span',row.tag),element('small',settings.showScores?Math.round(row.confidence*100)+'%':''),element('span',outcome==='unknown'?t('scene.check'):'+'));
      button.addEventListener('click',event=>{if(isTrustedEvent(event))void addTag(entry,row.tag);});
      list.append(button);
    }
    if(entry.analysis && !list.children.length)list.append(element('p',t('scene.empty')));
    body.append(list);root.append(body);root.open=open;
  }
  async function analyzeScene(entry) {
    if(entry!==active || entry.busy || !sameScene(doc,entry.scene))return;
    entry.busy=true;entry.controller=new AbortController();entry.message=t('scene.sampling');root.open=true;render();
    try {
      openSceneTags(doc,entry.scene);
      const started=await call('cake-tagger:scene-start',{duration:entry.scene.video.duration});
      entry.job=started.job;settings=started.settings;
      entry.controller.signal.throwIfAborted();
      await sampleScene(doc,entry.scene,settings.frames,entry.controller.signal,async(frame,index,total)=>{
        entry.controller.signal.throwIfAborted();
        await call('cake-tagger:scene-frame',{job:entry.job,index,data:encodeFrame(frame)});
        entry.message=t('scene.sampleProgress',{current:index+1,total});if(active===entry)render();
      });
      entry.message=t('scene.analyzing');if(active===entry)render();
      const result=await call('cake-tagger:scene-finish',{job:entry.job});
      entry.controller.signal.throwIfAborted();
      if(!sameScene(doc,entry.scene))throw messageError('scene.changed');
      entry.analysis=result.analysis;entry.message=t('scene.ready');
    } catch(error) {
      entry.message=entry.controller.signal.aborted?t('analysis.cancelled'):t(errorMessage(error));
    } finally {
      if(entry.job)void runtime.sendMessage({type:'cake-tagger:scene-cancel',job:entry.job}).catch(()=>{});
      entry.job=null;entry.busy=false;if(active===entry)render();
    }
  }
  async function addTag(entry,tag) {
    if(entry!==active || entry.busy)return;
    entry.busy=true;entry.controller=new AbortController();entry.message=t('scene.adding',{tag});render();
    try {
      const outcome=await addSceneTag(doc,entry.scene,tag,entry.controller.signal);
      entry.outcomes.set(tag,outcome.status);entry.message=t(outcome.status==='pending'?'scene.pending':'scene.added',{tag});
    } catch(error) {
      if(error.submitted)entry.outcomes.set(tag,'unknown');
      entry.message=t(errorMessage(error));
    } finally {entry.busy=false;if(active===entry)render();}
  }
  function refresh() {
    if(stopped)return;
    const scene=activeScene(doc);
    if(!scene || !active || !sameScene(doc,active.scene) || !root?.isConnected) {
      if(active?.busy) cache.set(active.scene.id,{...active,busy:false,message:'',job:null,controller:null});
      cancel(active);root?.remove();root=null;active=null;
      if(!scene)return;
      let entry=cache.get(scene.id);
      if(!entry){entry={analysis:null,outcomes:new Map(),busy:false,message:'',job:null};cache.set(scene.id,entry);}
      while(cache.size>4){const key=cache.keys().next().value;cache.delete(key);}
      entry.scene=scene;active=entry;
      root=element('details',null,'cake-tagger-panel cake-tagger-scene');
      const rail=doc.querySelector('.stok-rpanel .stok-rp-body');
      if(rail && rail.getClientRects().length)rail.append(root);
      else {root.classList.add('is-floating');doc.body.append(root);}
      render();
    }
  }
  void runtime.sendMessage({type:'cake-tagger:settings-get'}).then(response=>{if(response?.settings){settings=response.settings;render();}}).catch(()=>{});
  runtime.onMessage.addListener((message,sender)=>{
    if(sender.id===runtime.id && message?.type==='cake-tagger:settings-updated'){settings=message.settings;render();}
  });
  timer=doc.defaultView.setInterval(refresh,500);refresh();
  doc.defaultView.addEventListener('pagehide',()=>{stopped=true;doc.defaultView.clearInterval(timer);cancel(active);root?.remove();},{once:true});
}
