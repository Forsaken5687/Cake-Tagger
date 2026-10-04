import { translate } from '../messages.mjs';
import { inspectUploads } from './upload-adapter.mjs';

// These controls render only public tag metadata. The isolated local document
// owns files, corrections, inference and export; commands never contain tokens.
export function createUploadUI(doc, mount, toolbar, send) {
 let view, focus='', sections=new Map(), sidebar, workspace, signature='';
 const roots=new WeakMap(), expanded=new Set();let nextRoot=0;
 const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const trusted=event=>event instanceof doc.defaultView.Event && event.isTrusted;
 const t=(key,params)=>translate(key,view?.language || 'en',params);
 const button=(key,action,cls='')=>{const n=el('button',t(key),cls);n.type='button';n.onclick=event=>{if(trusted(event))action(event);};return n;};
 const command=(action,entry,extra={})=>send({action,filename:entry?.filename,sha256:entry?.sha256,...extra});
 const bar=el('div','','cake-tagger-heading'),brand=el('strong','Cake Tagger'),status=el('span');
 const analyze=button('analysis.start',()=>command('analyze'));
 const cancel=button('analysis.cancel',()=>command('cancel'));
 const exportButton=button('export.download',()=>command('export'));
 const settings=button('settings.title',()=>command('settings'));
 const quit=button('action.quit',()=>command('quit'));
 cancel.hidden=true;analyze.disabled=exportButton.disabled=true;
 const note=el('div','','cake-tagger-message');note.setAttribute('role','status');
 bar.append(brand,status,analyze,cancel,exportButton,settings,quit);toolbar.append(bar,note);
 function detachLayout(){sidebar?.remove();sidebar=undefined;if(workspace){workspace.before(mount);workspace.remove();workspace=undefined;}for(const n of sections.values())n.remove();sections.clear();}
 function content(section,entry){
  // Preserve an in-progress manual tag search while another video finishes.
  if(section.contains(doc.activeElement) && doc.activeElement.tagName==='INPUT' && doc.activeElement.type==='text')return;
  section.replaceChildren();
  const head=el('div','','cake-tagger-result-heading');head.append(el('strong',t('embed.suggestions')),el('small',entry.state));section.append(head);
  if(entry.error)section.append(el('p',entry.error,'cake-tagger-message'));
  if(!entry.complete)return;
  const chips=el('div','','cake-tagger-tags'), other=el('div','','cake-tagger-tags');
  for(const row of entry.tags){
   if(row.uncertain && !row.selected && !view.settings.showUncertain)continue;
   const label=el('label','','cake-tagger-chip'),box=el('input');box.type='checkbox';box.checked=row.selected;
   label.classList.toggle('is-selected',row.selected);label.classList.toggle('is-uncertain',row.uncertain);
   label.title=t(row.source==='manual'?'tags.manualOrigin':'tags.modelOrigin');
   box.onchange=event=>{if(trusted(event))command('tag',entry,{tag:row.tag,selected:box.checked});};label.append(box,el('span',row.tag));
   if(view.settings.showScores && row.source==='suggestion' && Number.isFinite(row.confidence))label.append(el('small',Math.round(row.confidence*100)+'%'));
   (row.uncertain && !row.selected ? other : chips).append(label);
  }
  section.append(chips);
  if(other.childElementCount){const details=el('details','','cake-tagger-other');details.open=expanded.has(entry.filename);details.append(el('summary',t('embed.otherSuggestions',{count:other.childElementCount})),other);details.ontoggle=()=>{if(details.open)expanded.add(entry.filename);else expanded.delete(entry.filename);};section.append(details);}
  const add=el('form','','cake-tagger-add'),input=el('input'),list=el('datalist');
  input.placeholder=t('tags.search');input.setAttribute('aria-label',t('tags.addForFile',{filename:entry.filename}));
  list.id='cake-tagger-search-'+Math.random().toString(36).slice(2);input.setAttribute('list',list.id);
  for(const tag of view.allTags){const option=el('option');option.value=tag;list.append(option);}
  const addButton=button('tags.add',()=>{});add.onsubmit=event=>{event.preventDefault();if(trusted(event))command('add',entry,{tag:input.value.trim().toLowerCase()});};addButton.type='submit';
  add.append(input,list,addButton);section.append(add);
  const actions=el('div','','cake-tagger-result-actions');actions.append(el('small',t('tags.selectedCount',{count:entry.tags.filter(row=>row.selected).length})),button('transfer.apply',()=>command('apply',entry),'cake-tagger-primary'));
  if(sidebar && view.entries.length>1)actions.append(button('embed.next',()=>{const index=view.entries.findIndex(row=>row.filename===focus);focus=view.entries[(index+1)%view.entries.length].filename;paint(true);const target=inspectUploads(doc).find(row=>row.filename===focus);target?.root.scrollIntoView({block:'nearest',behavior:'smooth'});}));
  section.append(actions);
 }
 function paint(force=false){
  if(!view)return;
  const targets=inspectUploads(doc).filter(row=>mount.contains(row.root));
  const targetKeys=targets.map(row=>{if(!roots.has(row.root))roots.set(row.root,++nextRoot);return roots.get(row.root);});
  const next=JSON.stringify({entries:view.entries,settings:view.settings,language:view.language,targetKeys});if(!force&&next===signature)return;signature=next;
  const layout=view.settings.uploadLayout || 'cards';
  if((layout==='sidebar')!==!!sidebar){detachLayout();if(layout==='sidebar'){
   workspace=el('div','','cake-tagger-workspace');mount.before(workspace);workspace.append(mount);sidebar=el('aside','','cake-tagger-sidebar');workspace.append(sidebar);
  }}
  if(sidebar){
   const selected=view.entries.find(row=>row.filename===focus)||view.entries[0];focus=selected?.filename || '';
   if(sidebar.contains(doc.activeElement)&&doc.activeElement.type==='text')return;
   sidebar.replaceChildren();const heading=el('div','','cake-tagger-result-heading');heading.append(el('strong',t('embed.suggestions')));sidebar.append(heading);
   const select=el('select');select.setAttribute('aria-label',t('results.title'));
   for(const entry of view.entries){const option=el('option',entry.filename);option.value=entry.filename;select.append(option);}select.value=focus;
   select.onchange=event=>{if(!trusted(event))return;focus=select.value;paint(true);targets.find(row=>row.filename===focus)?.root.scrollIntoView({block:'nearest',behavior:'smooth'});};sidebar.append(select);
   if(selected){const section=el('section');sidebar.append(section);content(section,selected);}
   for(const target of targets)target.root.classList.toggle('cake-tagger-focused',target.filename===focus);
  }else{
   const used=new Set();
   for(const entry of view.entries){const matches=targets.filter(row=>row.filename===entry.filename);if(matches.length!==1)continue;
    const target=matches[0];used.add(target.root);let section=sections.get(target.root);
    if(!section){section=el('section','','cake-tagger-suggestions');sections.set(target.root,section);}
    if(!section.isConnected){if(target.root.matches('.stok-bulk-card'))target.root.append(section);else (target.input.closest('.stok-pillfield') || target.input.parentElement).after(section);}
    content(section,entry);
   }
   for(const [root,section] of sections)if(!used.has(root)){section.remove();sections.delete(root);}
   for(const target of targets)target.root.classList.remove('cake-tagger-focused');
  }
 }
 function update(value){
  if(!validUploadView(value))return;view=value;
  status.textContent=view.status;note.textContent=view.message || '';note.hidden=!note.textContent;
  for(const [node,key] of [[analyze,'analysis.start'],[cancel,'analysis.cancel'],[exportButton,'export.download'],[settings,'settings.title'],[quit,'action.quit']])node.textContent=t(key);
  analyze.hidden=view.running;cancel.hidden=!view.running;analyze.disabled=view.stopped||!view.entries.length;
  exportButton.disabled=view.stopped||!view.entries.some(entry=>entry.complete);settings.disabled=quit.disabled=view.stopped;
  paint();
 }
 const onBlur=event=>{if(view && event.target.type==='text' && event.target.closest('.cake-tagger-suggestions,.cake-tagger-sidebar'))setTimeout(()=>paint(true),0);};doc.addEventListener('focusout',onBlur);
 return {update,error(message){note.textContent=message;note.hidden=false;},refresh:()=>paint(),dispose(){doc.removeEventListener('focusout',onBlur);detachLayout();}};
}
export function validUploadView(value){
 return !!value && ['en','de'].includes(value.language) && value.settings && ['cards','sidebar'].includes(value.settings.uploadLayout)
  && typeof value.status==='string' && typeof value.message==='string' && Array.isArray(value.allTags) && value.allTags.length<=258 && value.allTags.every(tag=>typeof tag==='string' && tag.length<=80)
  && Array.isArray(value.entries) && value.entries.length<=1000 && value.entries.every(entry=>typeof entry.filename==='string' && entry.filename.length<=1024 && typeof entry.state==='string' && Array.isArray(entry.tags) && entry.tags.length<=258 && entry.tags.every(row=>typeof row.tag==='string' && row.tag.length<=80 && typeof row.selected==='boolean'));
}
