import { isTrustedEvent } from '../src/shared/trusted-event.mjs';
import { translate } from '../src/shared/messages.mjs';
import { settingsForm } from '../src/shared/settings-ui.mjs';
import { createSettingsStore } from '../src/shared/preferences.mjs';
import { inspectUploads } from './upload-adapter.mjs';

// These controls render only public tag metadata. The isolated local document
// owns files, corrections, inference and export; commands never contain tokens.
export function createUploadUI(doc, mount, toolbar, send, settingsAPI) {
 let view, sections=new Map(), signature='';
 const roots=new WeakMap();let nextRoot=0;
 const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const trusted=event=>isTrustedEvent(event);
 const t=(key,params)=>translate(key,view?.language || 'en',params);
 const button=(key,action,cls='')=>{const n=el('button',t(key),cls);n.type='button';n.onclick=event=>{if(trusted(event))action(event);};return n;};
 const command=(action,entry,extra={})=>send({action,filename:entry?.filename,sha256:entry?.sha256,...extra});
 const bar=el('div','','cake-tagger-heading'),brand=el('strong','Cake Tagger'),status=el('span');
 const analyze=button('analysis.start',()=>command('analyze'));
 const cancel=button('analysis.cancel',()=>command('cancel'));
 const exportButton=button('export.download',()=>command('export'));
 const settings=button('settings.title',openSettings);
 const quit=button('action.quit',()=>command('quit'));
 cancel.hidden=true;analyze.disabled=exportButton.disabled=true;
 const note=el('div','','cake-tagger-message');note.setAttribute('role','status');
 bar.append(brand,status,analyze,cancel,exportButton,settings,quit);toolbar.append(bar,note);
 let settingsDialog;
 async function openSettings(){
  if(!view || !settingsAPI)return;
  // A bridge snapshot can lag behind a successful save or another browser.
  // Read the backend on every opening rather than reusing the displayed snapshot.
  const store=createSettingsStore({request:async(method,next)=>{
   const response=await(method==='get'?settingsAPI.load():settingsAPI.save(next));
   if(response?.error || !response?.settings)throw Error(response?.error || 'error.settingsSave');
   return response;
  }});
  try { await store.load(); } catch(error) { note.textContent=translate(error.message,view.language);note.hidden=false;return; }
  store.subscribe(next=>{view={...view,settings:next};paint(true);});
  view={...view,settings:store.get()};
  settingsDialog?.remove();settingsDialog=el('dialog','','cake-tagger-settings-dialog');
  const heading=el('div','','cake-tagger-result-heading');heading.append(el('strong',t('settings.title')),button('action.close',()=>settingsDialog.close()));settingsDialog.append(heading);
  const dialog=settingsDialog;
  settingsDialog.append(settingsForm(store,view.allTags,()=>{if(dialog.isConnected)dialog.close();},{document:doc,language:view.language,requireTrusted:true,capabilities:settingsAPI.capabilities}));
  settingsDialog.addEventListener('click',event=>{if(trusted(event)&&event.target===settingsDialog)settingsDialog.close();});
  settingsDialog.addEventListener('close',()=>{dialog.remove();if(settingsDialog===dialog)settingsDialog=undefined;});doc.body.append(settingsDialog);settingsDialog.showModal();
 }
 function detachLayout(){for(const n of sections.values())n.remove();sections.clear();}
 function content(section,entry){
  const previousArea=section.querySelector('.cake-tagger-tag-area');
  const position={top:previousArea?.scrollTop??0,left:previousArea?.scrollLeft??0};
  const active=doc.activeElement;
  const focusedTag=section.contains(active)?active?.dataset?.tag:undefined;
  const focusedApply=section.contains(active)&&active?.classList.contains('cake-tagger-primary');
  section.replaceChildren();
  const head=el('div','','cake-tagger-result-heading');head.append(el('strong',t('embed.suggestions')),el('small',entry.state));section.append(head);
  if(entry.error)section.append(el('p',entry.error,'cake-tagger-message'));
  if(!entry.complete)return;
  const area=el('div','','cake-tagger-tag-area');section.append(area);
  const chips=el('div','','cake-tagger-tags');
  for(const row of entry.tags){
   if(row.uncertain && !row.selected && !view.settings.showUncertain)continue;
   const label=el('label','','cake-tagger-chip'),box=el('input');box.type='checkbox';box.checked=row.selected;box.dataset.tag=row.tag;
   label.classList.toggle('is-selected',row.selected);label.classList.toggle('is-uncertain',row.uncertain);
   label.title=t(row.source==='manual'?'tags.manualOrigin':'tags.modelOrigin');
   box.onchange=event=>{if(trusted(event))command('tag',entry,{tag:row.tag,selected:box.checked});};label.append(box,el('span',row.tag));
   if(view.settings.showScores && row.source==='suggestion' && Number.isFinite(row.confidence))label.append(el('small',Math.round(row.confidence*100)+'%'));
   chips.append(label);
  }
  area.append(chips);
  const actions=el('div','','cake-tagger-result-actions');actions.append(el('small',t('tags.selectedCount',{count:entry.tags.filter(row=>row.selected).length})),button('transfer.apply',()=>command('apply',entry),'cake-tagger-primary'));
  section.append(actions);
  // Replacing chips must not jump back to the first row or drop keyboard focus.
  area.scrollTop=position.top;area.scrollLeft=position.left;
  if(focusedTag!==undefined)[...chips.querySelectorAll('input')].find(box=>box.dataset.tag===focusedTag)?.focus({preventScroll:true});
  else if(focusedApply)actions.querySelector('button')?.focus({preventScroll:true});
 }
 function paint(force=false){
  if(!view)return;
  const targets=inspectUploads(doc).filter(row=>mount.contains(row.root));
  const targetKeys=targets.map(row=>{if(!roots.has(row.root))roots.set(row.root,++nextRoot);return roots.get(row.root);});
  const next=JSON.stringify({entries:view.entries,settings:view.settings,language:view.language,targetKeys,attached:[...sections.values()].map(n=>n.isConnected)});if(!force&&next===signature)return;signature=next;
  const used=new Set();
  for(const entry of view.entries){const matches=targets.filter(row=>row.filename===entry.filename);if(matches.length!==1)continue;
   const target=matches[0];used.add(target.root);let section=sections.get(target.root);
   if(!section){section=el('section','','cake-tagger-suggestions');sections.set(target.root,section);}
   if(!section.isConnected){if(target.root.matches('.stok-bulk-card'))target.root.append(section);else {const step=target.root.querySelector('.stok-up-step');if(step)step.after(section);else target.root.append(section);}}
   content(section,entry);
  }
  for(const [root,section] of sections)if(!used.has(root)){section.remove();sections.delete(root);}
 }
 function update(value){
  if(!validUploadView(value))return;view=value;
  status.textContent=view.status;note.textContent=view.message || '';note.hidden=!note.textContent;
  for(const [node,key] of [[analyze,'analysis.start'],[cancel,'analysis.cancel'],[exportButton,'export.download'],[settings,'settings.title'],[quit,'action.quit']])node.textContent=t(key);
  analyze.hidden=view.running;cancel.hidden=!view.running;analyze.disabled=view.stopped||!view.entries.length;
  exportButton.disabled=view.stopped||view.exporting||!view.entries.some(entry=>entry.complete);settings.disabled=quit.disabled=view.stopped;
  paint();
 }
 return {update,error(message){note.textContent=message;note.hidden=false;},refresh:()=>paint(),dispose(){settingsDialog?.remove();detachLayout();}};
}
export function validUploadView(value){
 return !!value && ['en','de'].includes(value.language) && value.settings && typeof value.settings.showUncertain==='boolean'
  && typeof value.status==='string' && typeof value.message==='string' && Array.isArray(value.allTags) && value.allTags.length<=303 && value.allTags.every(tag=>typeof tag==='string' && tag.length<=80)
  && Array.isArray(value.entries) && value.entries.length<=1000 && value.entries.every(entry=>typeof entry.filename==='string' && entry.filename.length<=1024 && typeof entry.state==='string' && Array.isArray(entry.tags) && entry.tags.length<=303 && entry.tags.every(row=>typeof row.tag==='string' && row.tag.length<=80 && typeof row.selected==='boolean'));
}
