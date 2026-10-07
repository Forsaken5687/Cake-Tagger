import {createLocalSession} from './local-session.mjs';
import {createNativeClient} from './native-client.mjs';
import {sampleVideo,hashFile} from './sampling.mjs';
import {normalizeSettings,suggestionPolicy} from '../shared/preferences.mjs';
import {ANALYSIS_VERSION,aggregate} from '../shared/tagging.mjs';
import {makeRecord} from '../shared/corrections.mjs';
import {DEFAULT_THRESHOLD,DEFAULT_COVERAGE} from '../shared/analysis-settings.mjs';
import {candidateTags,comparisonMetrics,createReviewSnapshot,validateVariants,DEFAULT_VARIANTS,reviewPartition,problemTags,compareVariants,frameEvidence} from '../shared/evaluation.mjs';
// Load the optional development module after translating the shell. An older
// running backend may not yet allow this file, even though HTML is current.
let createDraft,restoreDraft,importReview,store;
import {errorMessage,messageError} from '../shared/messages.mjs';
import {setLanguage,t,translatePage,localizedText} from './i18n.mjs';

const $=selector=>document.querySelector(selector),session=createLocalSession();
const client=createNativeClient({fetcher:session.request,onProgress:(current,total)=>localizedText($('#status'),'analysis.progress',{current,total})});
let entries=[],active,controller,running=false,settings=normalizeSettings(),mapping,allTags=[],playerURL,downloadURL;
let variants=validateVariants(DEFAULT_VARIANTS),evidenceTag,pendingDraft,saveTimer,dirty=false,saveChain=Promise.resolve(),changeVersion=0,attaching=false;
const percent=value=>value==null?'—':Math.round(value*100)+'%';
const label=(node,key,params)=>localizedText(node,key,params);
const node=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
const allowedTags=()=>[...new Set([...allTags,...entries.flatMap(entry=>[...entry.selected.keys(),...entry.ignoredTags])])];
const rules=name=>({...variants[name],excludedTags:settings.excludedTags});
const candidate=(entry,name='A')=>entry.scores?candidateTags(entry.scores,mapping,rules(name)):[];
const revealed=()=>$('#reveal').checked;
const hiddenHoldout=entry=>entry?.result&&reviewPartition(entry)==='holdout'&&!revealed();
const validRules=()=>['threshold','coverage','threshold-b','coverage-b'].every(id=>$('#'+id).checkValidity());
function controlsFromVariants(){
 for(const [name,suffix]of [['A',''],['B','-b']]){ $('#threshold'+suffix).value=variants[name].threshold;$('#coverage'+suffix).value=variants[name].coverage*100; }
}
function clearDownload(){
 if(downloadURL)URL.revokeObjectURL(downloadURL);downloadURL=undefined;
 for(const id of ['download-link','server-link']){$('#'+id).hidden=true;$('#'+id).removeAttribute('href');}
 $('#server-export').hidden=true;
}

// Serialize saves, so a slower old write can never replace newer annotations.
function saveNow(){
 clearTimeout(saveTimer);
 if(pendingDraft||!mapping)return Promise.resolve();
 const revision=changeVersion,draft=createDraft(entries,variants,$('#frames').value,$('#language').value);
 label($('#save-status'),'review.saving');
 saveChain=saveChain.catch(()=>{}).then(()=>store.save(draft)).then(()=>{
  if(revision===changeVersion){dirty=false;label($('#save-status'),'review.saved',{time:new Date(draft.savedAt).toLocaleTimeString()});}
 }).catch(()=>label($('#save-status'),'review.storageFailed'));
 return saveChain;
}
function changed(){
 dirty=true;changeVersion++;clearDownload();label($('#save-status'),'review.unsaved');
 clearTimeout(saveTimer);saveTimer=setTimeout(saveNow,800);
}
function groupEntries(){
 if($('#scope').value==='holdout'&&!revealed())return [];
 return entries.filter(entry=>entry.result&&reviewPartition(entry)===$('#scope').value);
}
// Keep advanced tools separate from the annotation workspace.
function view(name){
 for(const key of ["review","compare","problems"]){
  $("#view-"+key).hidden=key!==name;const tab=$("#tab-"+key);
  tab.setAttribute("aria-selected",String(key===name));tab.tabIndex=key===name?0:-1;
 }
 evidenceTag=undefined;$("#evidence").hidden=true;
}
function selectEntry(entry){
 active=entry;evidenceTag=undefined;$("#search").value="";view("review");showPlayer();renderQueue();renderTags();
}
function jump(entry,tag){
 view("review");
 active=entry;$('#search').value=tag;showPlayer();renderQueue();renderTags();openEvidence(tag);
 $('#editor').scrollIntoView({block:'start'});
}
function labSummary(){
 const development=entries.filter(e=>e.reviewed&&e.result&&reviewPartition(e)==='development').length;
 const holdout=entries.filter(e=>e.reviewed&&e.result&&reviewPartition(e)==='holdout').length;
 label($('#split-counts'),'review.splitCounts',{development,holdout});
 $('#variant-changes').replaceChildren();$('#problems').replaceChildren();
 if(!validRules()){label($('#metrics'),'review.invalidRules');$('#delta').textContent='';return;}
 if($('#scope').value==='holdout'&&!revealed()){
  label($('#metrics'),'review.holdoutHidden');$('#delta').textContent='';$('#problem-empty').textContent='';return;
 }
 const scoped=groupEntries(),current=comparisonMetrics(scoped,e=>e.result.tags),a=comparisonMetrics(scoped,e=>candidate(e,'A')),b=comparisonMetrics(scoped,e=>candidate(e,'B'));
 const metric=m=>percent(m.precision)+' / '+percent(m.recall);
 label($('#metrics'),'review.labMetrics',{count:current.reviewed,current:metric(current),a:metric(a),b:metric(b)});
 const delta=compareVariants(scoped,e=>candidate(e,'A'),e=>candidate(e,'B'));
 label($('#delta'),'review.delta',{improved:delta.improved,regressed:delta.regressed,changes:delta.changes.length});
 for(const change of delta.changes.slice(0,20)){
  const entry=scoped[change.index],button=node('button',change.tag+' · '+(change.inB?'A − / B +':'A + / B −')+' · '+entry.file.name);
  button.onclick=()=>jump(entry,change.tag);$('#variant-changes').append(button);
 }
 const source=$('#problem-source').value,predict=entry=>source==='current'?entry.result.tags:candidate(entry,source);
 const problems=problemTags(scoped,predict).filter(row=>row.falsePositive+row.falseNegative);
 $('#problem-empty').textContent=problems.length?'':t('review.noProblems');
 for(const problem of problems){
  const tr=node('tr');tr.append(node('td',problem.tag),node('td',problem.falsePositive),node('td',problem.falseNegative));
  const examples=node('td');examples.className='examples';
  for(const example of problem.examples.slice(0,5)){
   const button=node('button',(example.kind==='falsePositive'?t('review.wrong'):t('review.missed'))+' · '+example.filename);
   button.onclick=()=>jump(scoped[example.index],problem.tag);examples.append(button);
  }
  tr.append(examples);$('#problems').append(tr);
 }
}
function summary(){
 const blocked=running||attaching||!!pendingDraft;
 $('#analyze').disabled=blocked||!mapping||!entries.some(e=>e.file instanceof File);$('#files').disabled=blocked;
 $('#import').disabled=blocked;$('#frames').disabled=blocked;
 $('#cancel').hidden=!running;$('#export').disabled=blocked||!entries.some(e=>e.result)||!validRules();
 $('#save').disabled=!!pendingDraft||!mapping;$('#clear').disabled=running||attaching||!!pendingDraft;
 label($("#progress"),"review.progress",{done:entries.filter(e=>e.reviewed&&e.result).length,total:entries.length});
 const index=entries.indexOf(active);
 $("#previous").disabled=index<=0;$("#next").disabled=index<0||index>=entries.length-1;
 $("#complete-next").disabled=!active?.result||hiddenHoldout(active);
 labSummary();
}
function renderQueue(){
 $('#queue').replaceChildren();
 for(const entry of entries){
  const button=node('button',entry.file.name);button.type='button';button.setAttribute('aria-current',String(entry===active));
  const status=entry.error?t(entry.error):hiddenHoldout(entry)?t('review.holdoutQueue'):entry.result?t(entry.reviewed?'review.done':'review.pending'):t('analysis.waiting');
  button.append(node('small',status));
  button.onclick=()=>selectEntry(entry);$('#queue').append(button);
 }
 summary();
}
function showPlayer(){
 $('#empty').hidden=entries.length>0;$('#queue').hidden=!entries.length;$('#editor').hidden=!active;if(!active)return;
 $('#player').pause();$('#player').removeAttribute('src');if(playerURL)URL.revokeObjectURL(playerURL);playerURL=undefined;
 const attached=active.file instanceof File;
 $('#player').hidden=!attached;$('#reconnect').hidden=attached;
 if(attached){playerURL=URL.createObjectURL(active.file);$('#player').src=playerURL;}
 $('#filename').textContent=active.file.name;$('#partition').value=active.partition;
}
function renderTags(){
 $('#clear-search').hidden=!$('#search').value;
 $('#tags').replaceChildren();$('#evidence').hidden=true;if(!active)return;
 const concealed=hiddenHoldout(active);
 label($('#review-state'),concealed?'review.holdoutHidden':!active.result?'analysis.waiting':active.reviewed?'review.done':'review.pending');
 $('#review-state').classList.toggle('done',!!active.reviewed&&!concealed);
 $('#reopen').hidden=!active.result||!active.reviewed||concealed;
 $('#resolved-partition').textContent=active.result?t(reviewPartition(active)==='holdout'?'review.holdout':'review.development'):t('review.noPartition');
 if(concealed){label($('#counts'),'review.holdoutHidden');return;}
 if(!active.result){label($('#counts'),'review.waiting');return;}if(!validRules())return;
 const baseline=new Map(active.result.tags.map(row=>[row.tag,row])),a=new Set(candidate(active,'A').map(row=>row.tag)),b=new Set(candidate(active,'B').map(row=>row.tag));
 const possible=new Set([...active.selected.keys(),...active.ignoredTags,...baseline.keys(),...a,...b]),query=$('#search').value.trim().toLowerCase();
 const tags=($('#all').checked||query?allowedTags():allowedTags().filter(tag=>possible.has(tag))).filter(tag=>tag.toLowerCase().includes(query));
 // Stable order prevents rows moving while the user evaluates them.
 tags.sort((x,y)=>x.localeCompare(y));
 for(const tag of tags){
  const tr=node('tr'),td=node('td'),tagButton=node('button',tag);
  const ignored=active.ignoredTags.has(tag);if(ignored)tr.className='ignored';
  tagButton.className='tag-name';tagButton.onclick=()=>openEvidence(tag);td.append(tagButton);tr.append(td);
  const verdictCell=node('td'),choices=node('div');choices.className='verdict';
  choices.setAttribute('role','radiogroup');choices.setAttribute('aria-label',t('review.verdict')+': '+tag);
  const current=ignored?'unknown':active.selected.get(tag)===true?'yes':'no';
  for(const [value,key]of [['yes','review.correct'],['no','review.incorrect'],['unknown','review.unclear']]){
   const button=node('label'),radio=node('input'),caption=node('span',t(key));
   radio.type='radio';radio.name='verdict-'+tags.indexOf(tag);radio.value=value;radio.checked=current===value;radio.dataset.verdict=value;button.append(radio,caption);
   if(value==='unknown')button.title=t('review.unjudgeable');
   radio.onchange=()=>{
    if(!radio.checked||current===value)return;
    // Ambiguity excludes a judgment without discarding its previous selection.
    if(value==='unknown')active.ignoredTags.add(tag);
    else{active.ignoredTags.delete(tag);active.selected.set(tag,value==='yes');active.tagSources[tag]=baseline.has(tag)?'suggestion':'manual';}
    active.reviewed=false;active.updatedAt=new Date().toISOString();changed();renderQueue();renderTags();
    [...$('#tags').rows].find(row=>row.cells[0].textContent===tag)?.querySelector('[data-verdict="'+value+'"]')?.focus();
   };
   choices.append(button);
  }
  verdictCell.append(choices);tr.append(verdictCell);
  const frames=frameEvidence(active,tag,mapping,rules('A')),scores=frames.map(frame=>frame.score).sort((x,y)=>y-x);
  tr.append(node('td',percent(scores.length?scores.slice(0,2).reduce((x,y)=>x+y,0)/Math.min(2,scores.length):null)));
  tr.append(node('td',frames.length?frames.filter(f=>f.matched).length+'/'+frames.length:'—'));
  for(const present of [baseline.has(tag),a.has(tag),b.has(tag)]){const cell=node('td',present?'✓':'—');cell.className='comparison-column'+(present?' yes':'');tr.append(cell);}
  $('#tags').append(tr);
 }
 label($('#counts'),'tags.selectedCount',{count:[...active.selected].filter(([tag,yes])=>yes&&!active.ignoredTags.has(tag)).length});
 if(evidenceTag)openEvidence(evidenceTag,false);
}
function openEvidence(tag,scroll=true){
 if(!active?.result||hiddenHoldout(active))return;
 evidenceTag=tag;$('#evidence').hidden=false;label($('#evidence-title'),'review.evidence',{tag});
 const name=$('#rule-variant').value,global=variants[name],custom=Object.hasOwn(global.tagRules,tag),rule=custom?global.tagRules[tag]:global;
 $('#tag-threshold').value=rule.threshold;$('#tag-coverage').value=rule.coverage*100;
 label($('#rule-state'),custom?'review.ruleCustom':'review.ruleGlobal');
 const frames=frameEvidence(active,tag,mapping,rules(name));$('#evidence-frames').replaceChildren();
 $('#rule-save').disabled=!frames.length;$('#rule-reset').disabled=!custom;
 if(!frames.length)$('#evidence-frames').append(node('p',t('review.noEvidence')));
 for(const frame of frames){
  const button=node('button');button.className=frame.matched?'match':'';
  if(frame.preview){const img=node('img');img.src=frame.preview;img.alt=t('review.frameNoPreview',{number:frame.index+1});button.append(img);}
  else button.append(node('span',t('review.frameNoPreview',{number:frame.index+1})));
  button.append(node('span',t('review.frameScore',{time:frame.time.toFixed(2),score:percent(frame.score)})));
  button.onclick=()=>{if(!(active.file instanceof File)){label($('#status'),'review.needVideo');return;}$('#player').currentTime=frame.time;if(matchMedia('(max-width:900px)').matches){evidenceTag=undefined;$('#evidence').hidden=true;}$('#player').scrollIntoView({block:'nearest'});};
  $('#evidence-frames').append(button);
 }
 if(scroll)$('#evidence-close').focus();
}
function adopt(restored){
 entries=restored.entries;variants=restored.variants;active=entries[0];evidenceTag=undefined;
 $('#frames').value=restored.frames;
 if(restored.language){$('#language').value=setLanguage({language:restored.language});translatePage();}
 controlsFromVariants();showPlayer();renderQueue();renderTags();label($('#status'),'review.imported');
}
$('#files').onchange=async event=>{
 const files=[...event.target.files].slice(0,1000);event.target.value='';attaching=true;summary();
 try{
  for(const file of files){
   if(!/\.(mp4|m4v|webm|mov)$/i.test(file.name))continue;
   // Restored videos are associated by content, never guessed by filename.
   const hash=await hashFile(file);
   const saved=entries.find(e=>(e.result?.sha256===hash||e.knownHash===hash)&&!(e.file instanceof File));
   if(saved){saved.file=file;saved.knownHash=hash;continue;}
   if(entries.some(e=>e.file instanceof File&&e.knownHash===hash))continue;
   if(entries.length>=1000)throw messageError('error.invalidAnalysisData');
   entries.push({file,knownHash:hash,selected:new Map(),tagSources:{},reviewed:false,ignoredTags:new Set(),partition:'auto'});
  }
  active ||= entries[0];changed();showPlayer();renderQueue();renderTags();label($('#status'),'analysis.ready');
 }catch(error){label($('#status'),errorMessage(error));}finally{attaching=false;summary();}
};
$('#import').onchange=async event=>{
 const file=event.target.files[0];event.target.value='';if(!file)return;
 if(entries.length&&!confirm(t('review.confirmReplace')))return;
 attaching=true;summary();
 try{
  if(file.size>256*1024*1024)throw Error('review.invalidSession');
  const restored=importReview(JSON.parse(await file.text()),allTags,mapping);
  adopt(restored);changed();await saveNow();
 }catch{label($('#status'),'review.invalidSession');}finally{attaching=false;summary();}
};
$('#analyze').onclick=async()=>{
 if(running||!mapping)return;controller=new AbortController();running=true;renderQueue();
 try{
  const response=await session.request('/api/settings');if(!response.ok)throw messageError('error.nativeServer');settings=normalizeSettings((await response.json()).settings);
  const frameSetting=$('#frames').value;
  for(const entry of entries){
   controller.signal.throwIfAborted();if(!(entry.file instanceof File))continue;entry.error=undefined;
   if(entry.result&&entry.frameSetting===frameSetting&&entry.previews?.length)continue;
   label($('#status'),'review.analyzing',{filename:entry.file.name});
   try{
    const start=performance.now(),sample=await sampleVideo(entry.file,frameSetting,controller.signal,entry.knownHash,{previews:true});
    const samplingSeconds=(performance.now()-start)/1000;
    if(entry.result&&entry.frameSetting===frameSetting){entry.previews=sample.frames;changed();continue;}
    const requestStart=performance.now(),output=await client.infer(sample.inputs,settings.parallelism,{excludedTags:settings.excludedTags,raw:true});controller.signal.throwIfAborted();
    const requestSeconds=(performance.now()-requestStart)/1000,baseline=aggregate(output.scores,mapping,DEFAULT_THRESHOLD,DEFAULT_COVERAGE,{excludedTags:settings.excludedTags});
    const wasAnalyzed=!!entry.result;entry.scores=output.scores;entry.timestamps=sample.timestamps;entry.previews=sample.frames;entry.frameSetting=frameSetting;
    entry.result={...baseline,sha256:sample.sha256,filename:entry.file.name,model:'JoyTag-FP32',sampledFrames:sample.sampledFrames,samplingMode:sample.samplingMode,durationSeconds:sample.durationSeconds,
     threshold:DEFAULT_THRESHOLD,analysisPolicy:ANALYSIS_VERSION+':'+DEFAULT_COVERAGE+':'+suggestionPolicy(settings),runtime:output.runtime,
     timings:{...output.timings,samplingSeconds,requestSeconds,totalSeconds:(performance.now()-start)/1000},createdAt:new Date().toISOString()};
    // Resampling keeps annotations and their review status; it changes evidence only.
    for(const tag of [...baseline.tags.map(row=>row.tag),...baseline.uncertain])if(!entry.selected.has(tag)){entry.selected.set(tag,!wasAnalyzed&&baseline.tags.some(row=>row.tag===tag));entry.tagSources[tag]='suggestion';}
    entry.originalSuggestionsKnown=true;entry.updatedAt=new Date().toISOString();changed();await saveNow();
   }catch(error){if(error.name==='AbortError')throw error;entry.error=errorMessage(error);}
   renderQueue();renderTags();
  }
  label($('#status'),'review.finished');
 }catch(error){label($('#status'),error.name==='AbortError'?'analysis.cancelled':errorMessage(error));}
 finally{running=false;controller=undefined;renderQueue();renderTags();await saveNow();}
};
$('#cancel').onclick=()=>{controller?.abort();client.stop();};
$('#reopen').onclick=()=>{
 if(!active?.result||hiddenHoldout(active))return;
 active.reviewed=false;active.updatedAt=new Date().toISOString();changed();renderQueue();renderTags();
 $('#complete-next').focus();
};
$('#partition').onchange=()=>{
 if(!active)return;const value=$('#partition').value;
 for(const entry of entries)if(entry===active||active.result&&entry.result?.sha256===active.result.sha256)entry.partition=value;
 changed();renderQueue();renderTags();
};
for(const id of ['threshold','coverage','threshold-b','coverage-b'])$('#'+id).oninput=()=>{
 if(validRules()){
  for(const [name,suffix]of [['A',''],['B','-b']]){variants[name].threshold=Number($('#threshold'+suffix).value);variants[name].coverage=Number($('#coverage'+suffix).value)/100;}
  changed();
 }
 summary();renderTags();
};
$('#rule-save').onclick=()=>{
 if(!evidenceTag||!$('#tag-threshold').checkValidity()||!$('#tag-coverage').checkValidity()){label($('#status'),'review.invalidRules');return;}
 variants[$('#rule-variant').value].tagRules[evidenceTag]={threshold:Number($('#tag-threshold').value),coverage:Number($('#tag-coverage').value)/100};
 changed();summary();renderTags();
};
$('#rule-reset').onclick=()=>{delete variants[$('#rule-variant').value].tagRules[evidenceTag];changed();summary();renderTags();};
$('#rule-variant').onchange=()=>openEvidence(evidenceTag,false);
function closeEvidence(restoreFocus=true){
 const tag=evidenceTag;evidenceTag=undefined;$('#evidence').hidden=true;
 if(restoreFocus)[...document.querySelectorAll('#tags .tag-name')].find(button=>button.textContent===tag)?.focus();
}
$('#evidence-close').onclick=()=>closeEvidence();
// Pointer-down precedes the click that opens a drawer, avoiding immediate dismissal.
// Outside clicks keep focus on their own target and still perform their action.
document.addEventListener('pointerdown',event=>{
 if(!$('#evidence').hidden&&!event.composedPath().includes($('#evidence')))closeEvidence(false);
});
for(const name of ['review','compare','problems']){
 const tab=$('#tab-'+name);tab.onclick=()=>view(name);
 tab.onkeydown=event=>{
  const names=['review','compare','problems'],index=names.indexOf(name);
  const next=event.key==='ArrowRight'?names[(index+1)%3]:event.key==='ArrowLeft'?names[(index+2)%3]:event.key==='Home'?names[0]:event.key==='End'?names[2]:undefined;
  if(next){event.preventDefault();view(next);$('#tab-'+next).focus();}
 };
}
$('#comparison-columns').onchange=()=>$('#editor').classList.toggle('show-comparison',$('#comparison-columns').checked);
$('#previous').onclick=()=>selectEntry(entries[entries.indexOf(active)-1]);
$('#next').onclick=()=>selectEntry(entries[entries.indexOf(active)+1]);
$('#complete-next').onclick=()=>{
 if(!active?.result||hiddenHoldout(active))return;
 active.reviewed=true;active.updatedAt=new Date().toISOString();changed();
 const index=entries.indexOf(active),ordered=[...entries.slice(index+1),...entries.slice(0,index)];
 const next=ordered.find(entry=>entry.result&&!entry.reviewed&&!hiddenHoldout(entry));
 if(next)selectEntry(next);else{renderQueue();renderTags();}
};
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('#evidence').hidden){$('#evidence-close').click();}});
$('#scope').onchange=summary;$('#problem-source').onchange=summary;
$('#reveal').onchange=()=>{renderQueue();renderTags();};
$('#search').oninput=renderTags;
$('#clear-search').onclick=()=>{$('#search').value='';renderTags();$('#search').focus({preventScroll:true});};$('#all').onchange=renderTags;
$('#frames').onchange=changed;
$('#language').onchange=()=>{setLanguage({language:$('#language').value});translatePage();renderQueue();renderTags();changed();};
$('#save').onclick=saveNow;
$('#clear').onclick=async()=>{
 if(!confirm(t('review.confirmClear')))return;
 clearTimeout(saveTimer);await saveChain;
 try{await store.clear();entries=[];active=undefined;evidenceTag=undefined;dirty=false;clearDownload();showPlayer();renderQueue();renderTags();$('#save-status').textContent='';label($('#status'),'review.intro');}
 catch{label($('#save-status'),'review.storageFailed');}
};
$('#restore').onclick=()=>{
 try{adopt(restoreDraft(pendingDraft,allTags,mapping));pendingDraft=undefined;$('#resume').hidden=true;changed();summary();saveNow();}
 catch{label($('#status'),'review.invalidSession');}
};
$('#discard').onclick=async()=>{
 if(!confirm(t('review.confirmClear')))return;
 try{await store.clear();pendingDraft=undefined;$('#resume').hidden=true;summary();}catch{label($('#save-status'),'review.storageFailed');}
};
$('#export').onclick=()=>{
 if(running)return;if(!validRules()){label($('#status'),'review.invalidRules');return;}
 $('#export').disabled=true;
 try{
  const snapshot=createReviewSnapshot(entries,mapping,rules('A'),allowedTags(),variants);clearDownload();
  downloadURL=URL.createObjectURL(new Blob([JSON.stringify(snapshot)],{type:'application/json'}));
  const link=$('#download-link');link.href=downloadURL;link.download='cake-tag-review.json';link.hidden=false;
  $('#server-export').hidden=false;link.click();label($('#status'),'review.downloadReady');
 }catch(error){label($('#status'),errorMessage(error));}finally{summary();}
};
// Keep the existing real attachment fallback; it includes the same lab metadata.
$('#server-export').onclick=async()=>{
 const button=$('#server-export');button.disabled=true;
 try{
  const completed=entries.filter(entry=>entry.result);
  const payload={items:completed.map(makeRecord),evaluation:{comparisonRules:rules('A'),variants,
   videos:completed.map(entry=>({sha256:entry.result.sha256,timestamps:entry.timestamps,modelScores:entry.scores.map(row=>Array.from(row)),ignoredTags:[...entry.ignoredTags],partition:entry.partition}))}};
  const response=await session.request('/api/export?evaluation=1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const output=await response.json();if(!response.ok)throw messageError(output.error||'error.requestFailed');
  if(typeof output.download!=='string'||!/^\/api\/download\/[a-f0-9]{48}$/.test(output.download))throw messageError('error.requestFailed');
  const link=$('#server-link');link.href=output.download;link.download='cake-tag-review.json';link.hidden=false;
  $('#download-link').hidden=true;button.hidden=true;label($('#status'),'review.downloadReady');
 }catch(error){label($('#status'),errorMessage(error));}finally{button.disabled=false;}
};
window.addEventListener('beforeunload',event=>{if(running||dirty){event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',()=>{if(dirty)saveNow();});
try{
 setLanguage({language:'auto'});translatePage();
 try{
  const module=await import('./review-session.mjs');
  ({createDraft,restoreDraft,importReview}=module);store=module.openReviewStore();
 }catch{throw messageError('review.restartRequired');}
 const [tags,map,config]=await Promise.all([fetch('/model/tags.txt').then(r=>r.text()),fetch('/model/mapping.json').then(r=>r.json()),session.request('/api/settings').then(async r=>{if(!r.ok)throw messageError('error.nativeServer');return r.json();})]);
 allTags=tags.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);mapping=map;settings=normalizeSettings(config.settings);
 $('#frames').value=settings.frames;$('#language').value=setLanguage(settings);translatePage();controlsFromVariants();
 try{pendingDraft=await store.load();if(pendingDraft?.entries?.length){$('#resume').hidden=false;label($('#resume-text'),'review.savedSession',{count:pendingDraft.entries.length,time:pendingDraft.savedAt??'—'});}else pendingDraft=undefined;}
 catch{label($('#save-status'),'review.storageFailed');}
 renderQueue();
}catch(error){
 setLanguage({language:'auto'});translatePage();label($('#status'),errorMessage(error));$('#status').setAttribute('role','alert');
 // A failed startup must not expose handlers that depend on uninitialized data.
 for(const control of document.querySelectorAll('button,input,select'))control.disabled=true;
}
