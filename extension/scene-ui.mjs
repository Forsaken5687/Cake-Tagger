import { activeScene, sameScene, sceneMount, sceneTags, sampleScene, encodeFrame, addSceneTag } from './scene-adapter.mjs';
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
    const entry=active;
    if(!root.firstElementChild) {
      const heading=element('div',null,'cake-tagger-scene-heading');
      heading.append(element('span','Cake Tagger','cake-tagger-scene-label'));
      const body=element('div',null,'cake-tagger-scene-body');
      const actions=element('div',null,'cake-tagger-result-actions');
      const analyze=element('button',null,'cake-tagger-scene-analyze');analyze.type='button';
      const cancelButton=element('button',null,'cake-tagger-scene-cancel');cancelButton.type='button';
      analyze.addEventListener('click',event=>{if(isTrustedEvent(event))void analyzeScene(entry);});
      cancelButton.addEventListener('click',event=>{if(isTrustedEvent(event))cancel(entry);});
      actions.append(analyze,cancelButton);heading.append(actions);root.append(heading);
      const status=element('p',null,'cake-tagger-scene-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
      body.append(status,element('div',null,'cake-tagger-scene-list'));
      root.append(body);
    }
    root.setAttribute('aria-label','Cake Tagger: '+t('scene.title'));
    const analyze=root.querySelector('.cake-tagger-scene-analyze');analyze.textContent=t('scene.analyze');analyze.disabled=entry.busy;
    const cancelButton=root.querySelector('.cake-tagger-scene-cancel');cancelButton.textContent=t('scene.cancel');cancelButton.hidden=!entry.busy;
    const status=root.querySelector('.cake-tagger-scene-status');
    status.textContent=entry.message || '';status.hidden=!entry.message || entry.message===t('scene.ready');
    analyze.title=t('scene.hint');
    const list=root.querySelector('.cake-tagger-scene-list'), present=sceneTags(doc), kept=new Set();
    list.querySelector('.cake-tagger-scene-empty')?.remove();
    let position=0;
    for(const row of missingSuggestions(entry.analysis,present,allowed,settings)) {
      const outcome=entry.outcomes.get(row.tag);
      if(outcome==='added' || outcome==='pending')continue;
      kept.add(row.tag);
      let button=[...list.children].find(node=>node.dataset.tag===row.tag);
      if(!button){
        button=element('button',null,'cake-tagger-scene-tag stok-tv-coocchip');button.type='button';button.dataset.tag=row.tag;
        button.append(element('span','#'+row.tag,'cake-tagger-tag-name'),element('small',null,'cake-tagger-score'),element('span','+','cake-tagger-tag-action'));
        button.children[2].setAttribute('aria-hidden','true');
        button.addEventListener('click',event=>{if(isTrustedEvent(event))void addTag(entry,row.tag);});
        list.append(button);
      }
      if(list.children[position]!==button)list.insertBefore(button,list.children[position] || null);
      position++;
      button.disabled=entry.busy || outcome==='unknown';
      button.children[1].textContent=Math.round(row.confidence*100)+'%';
      button.children[1].hidden=!settings.showScores;
      button.children[1].title=t('tags.score',{score:Math.round(row.confidence*100)});
      button.children[2].textContent=outcome==='unknown'?t('scene.check'):'+';
      button.children[2].setAttribute('aria-hidden',String(outcome!=='unknown'));
    }
    for(const button of [...list.children])if(!kept.has(button.dataset.tag))button.remove();
    if(entry.analysis && !list.children.length)list.append(element('p',t('scene.empty'),'cake-tagger-scene-empty'));
  }

  async function analyzeScene(entry) {
    if(entry!==active || entry.busy || !sameScene(doc,entry.scene))return;
    entry.busy=true;entry.controller=new AbortController();entry.message=t('scene.sampling');render();
    try {
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
      root=element('section',null,'cake-tagger-scene');root.dataset.sceneId=scene.id;
      render();
    }
    if(root) {
      const mount=sceneMount(doc);
      if(root.parentElement!==mount.parent)mount.parent.insertBefore(root,mount.before);
      root.classList.toggle('is-floating',mount.floating);
    }
  }
  void runtime.sendMessage({type:'cake-tagger:settings-get'}).then(response=>{if(response?.settings){settings=response.settings;render();}}).catch(()=>{});
  runtime.onMessage.addListener((message,sender)=>{
    if(sender.id===runtime.id && message?.type==='cake-tagger:settings-updated'){settings=message.settings;render();}
  });
  timer=doc.defaultView.setInterval(refresh,500);refresh();
  doc.defaultView.addEventListener('pagehide',()=>{stopped=true;doc.defaultView.clearInterval(timer);cancel(active);root?.remove();},{once:true});
}
