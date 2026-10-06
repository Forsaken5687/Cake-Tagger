import {createLocalSession} from './local-session.mjs';
import {createNativeClient} from './native-client.mjs';
import {sampleVideo} from './sampling.mjs';
import {normalizeSettings,suggestionPolicy} from '../shared/preferences.mjs';
import {ANALYSIS_VERSION,aggregate} from '../shared/tagging.mjs';
import {makeRecord} from '../shared/corrections.mjs';
import {DEFAULT_THRESHOLD,DEFAULT_COVERAGE} from '../shared/analysis-settings.mjs';
import {candidateTags,comparisonMetrics,createReviewSnapshot} from '../shared/evaluation.mjs';
import {errorMessage,messageError} from '../shared/messages.mjs';
import {setLanguage,t,translatePage,localizedText} from './i18n.mjs';

const $=selector=>document.querySelector(selector),session=createLocalSession();
const client=createNativeClient({fetcher:session.request,onProgress:(current,total)=>localizedText($('#status'),'analysis.progress',{current,total})});
let entries=[],active,controller,running=false,settings=normalizeSettings(),mapping,allTags=[],playerURL,downloadURL;
const rules=()=>({threshold:Number($('#threshold').value),coverage:Number($('#coverage').value)/100,excludedTags:settings.excludedTags});
const percent=value=>value==null?'—':Math.round(value*100)+'%';
const label=(node,key,params)=>localizedText(node,key,params);
function node(tag,text){const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;}
function candidate(entry){return entry.scores?candidateTags(entry.scores,mapping,rules()):[];}
function validRules(){return $('#threshold').checkValidity()&&$('#coverage').checkValidity();}
function summary(){
 const completed=entries.filter(entry=>entry.result).length;
 $('#analyze').disabled=running||!mapping||!entries.length;$('#files').disabled=running;$('#frames').disabled=running;
 $('#cancel').hidden=!running;$('#export').disabled=running||!completed||!validRules();
 if(!validRules()){label($('#metrics'),'review.invalidRules');return;}
 const current=comparisonMetrics(entries,entry=>entry.result.tags),experiment=comparisonMetrics(entries,candidate);
 label($('#metrics'),'review.metrics',{count:current.reviewed,baselinePrecision:percent(current.precision),baselineRecall:percent(current.recall),candidatePrecision:percent(experiment.precision),candidateRecall:percent(experiment.recall)});
}
function clearDownload(){
 if(downloadURL)URL.revokeObjectURL(downloadURL);downloadURL=undefined;
 $('#download-link').hidden=true;$('#download-link').removeAttribute('href');
 $('#server-export').hidden=true;$('#server-link').hidden=true;$('#server-link').removeAttribute('href');
}
function renderQueue(){
 clearDownload();
 $('#queue').replaceChildren();
 entries.forEach(entry=>{
  const button=node('button',entry.file.name);button.type='button';button.setAttribute('aria-current',String(entry===active));
  button.append(node('small',entry.error?t(entry.error):entry.result?t(entry.reviewed?'review.done':'review.pending'):t('analysis.waiting')));
  button.onclick=()=>{active=entry;showPlayer();renderQueue();renderTags();};$('#queue').append(button);
 });summary();
}
function showPlayer(){
 $('#editor').hidden=!active;if(!active)return;
 $('#player').pause();$('#player').removeAttribute('src');if(playerURL)URL.revokeObjectURL(playerURL);
 playerURL=URL.createObjectURL(active.file);$('#player').src=playerURL;$('#filename').textContent=active.file.name;
}
function renderTags(){
 clearDownload();
 $('#tags').replaceChildren();if(!active)return;
 $('#reviewed').checked=!!active.reviewed;$('#reviewed').disabled=!active.result;
 if(!active.result){label($('#counts'),'review.waiting');return;}
 if(!validRules())return;
 const baseline=new Map(active.result.tags.map(row=>[row.tag,row])),alternative=new Map(candidate(active).map(row=>[row.tag,row]));
 const possible=new Set([...active.selected.keys(),...baseline.keys(),...alternative.keys()]);
 const query=$('#search').value.trim().toLowerCase();
 const tags=($('#all').checked||query?allTags:allTags.filter(tag=>possible.has(tag))).filter(tag=>tag.includes(query));
 tags.sort((a,b)=>Number(active.selected.get(b)===true)-Number(active.selected.get(a)===true)||a.localeCompare(b));
 for(const tag of tags){
  const tr=node('tr'),td=node('td'),box=node('input');box.type='checkbox';box.checked=active.selected.get(tag)===true;
  const text=node('label');text.append(box,node('span',tag));td.append(text);tr.append(td);
  box.onchange=()=>{
   active.selected.set(tag,box.checked);active.reviewed=false;active.updatedAt=new Date().toISOString();
   active.tagSources[tag]=baseline.has(tag)?'suggestion':'manual';renderQueue();$('#reviewed').checked=false;
   label($('#counts'),'tags.selectedCount',{count:[...active.selected.values()].filter(Boolean).length});
  };
  for(const present of [baseline.has(tag),alternative.has(tag)]){const cell=node('td',present?'✓':'—');if(present)cell.className='yes';tr.append(cell);}
  const indices=mapping[tag];
  const scores=indices?active.scores.map(frame=>Math.max(...indices.map(index=>frame[index]))):[];
  tr.append(node('td',percent(scores.length?[...scores].sort((a,b)=>b-a).slice(0,2).reduce((a,b)=>a+b,0)/Math.min(2,scores.length):null)));
  tr.append(node('td',scores.length?scores.filter(score=>score>=rules().threshold).length+'/'+scores.length:'—'));$('#tags').append(tr);
 }
 label($('#counts'),'tags.selectedCount',{count:[...active.selected.values()].filter(Boolean).length});
}
$('#files').onchange=event=>{
 for(const file of [...event.target.files].slice(0,1000)) {
  if(!/\.(mp4|m4v|webm|mov)$/i.test(file.name))continue;
  if(!entries.some(entry=>entry.file.name===file.name&&entry.file.size===file.size&&entry.file.lastModified===file.lastModified))entries.push({file,selected:new Map(),tagSources:{},reviewed:false});
 }
 active ||= entries[0];showPlayer();renderQueue();renderTags();event.target.value='';
};
$('#analyze').onclick=async()=>{
 if(running||!mapping)return;
 controller=new AbortController();running=true;renderQueue();
 try{
  // Freeze server preferences for the batch; experimental controls stay local.
  const response=await session.request('/api/settings');if(!response.ok)throw messageError('error.nativeServer');
  settings=normalizeSettings((await response.json()).settings);
  const frameSetting=$('#frames').value;
  for(const entry of entries){
   controller.signal.throwIfAborted();entry.error=undefined;
   if(entry.result&&entry.frameSetting===frameSetting)continue;
   label($('#status'),'review.analyzing',{filename:entry.file.name});
   try{
    const start=performance.now(),sample=await sampleVideo(entry.file,frameSetting,controller.signal);
    const samplingSeconds=(performance.now()-start)/1000,requestStart=performance.now();
    const output=await client.infer(sample.inputs,settings.parallelism,{excludedTags:settings.excludedTags,raw:true});controller.signal.throwIfAborted();
    const requestSeconds=(performance.now()-requestStart)/1000;
    // Preserve reviewed labels when a different sampling count is tested.
    const baseline=aggregate(output.scores,mapping,DEFAULT_THRESHOLD,DEFAULT_COVERAGE,{excludedTags:settings.excludedTags});
    const wasAnalyzed=!!entry.result;entry.scores=output.scores;entry.timestamps=sample.timestamps;entry.frameSetting=frameSetting;
    entry.result={...baseline,sha256:sample.sha256,filename:entry.file.name,model:'JoyTag-INT8',sampledFrames:sample.sampledFrames,samplingMode:sample.samplingMode,durationSeconds:sample.durationSeconds,
     threshold:DEFAULT_THRESHOLD,analysisPolicy:ANALYSIS_VERSION+':'+DEFAULT_COVERAGE+':'+suggestionPolicy(settings),runtime:output.runtime,
     timings:{...output.timings,samplingSeconds,requestSeconds,totalSeconds:(performance.now()-start)/1000},createdAt:new Date().toISOString()};
    for(const tag of [...baseline.tags.map(row=>row.tag),...baseline.uncertain])if(!entry.selected.has(tag)){entry.selected.set(tag,!wasAnalyzed&&baseline.tags.some(row=>row.tag===tag));entry.tagSources[tag]='suggestion';}
    entry.originalSuggestionsKnown=true;entry.updatedAt=new Date().toISOString();
   }catch(error){if(error.name==='AbortError')throw error;entry.error=errorMessage(error);}
   renderQueue();renderTags();
  }
  label($('#status'),'review.finished');
 }catch(error){label($('#status'),error.name==='AbortError'?'analysis.cancelled':errorMessage(error));}
 finally{running=false;controller=undefined;renderQueue();renderTags();}
};
$('#cancel').onclick=()=>{controller?.abort();client.stop();};
$('#reviewed').onchange=()=>{if(!active?.result)return;active.reviewed=$('#reviewed').checked;active.updatedAt=new Date().toISOString();renderQueue();};
for(const id of ['threshold','coverage'])$('#'+id).oninput=()=>{summary();renderTags();};
$('#search').oninput=renderTags;$('#all').onchange=renderTags;
$('#language').onchange=()=>{setLanguage({language:$('#language').value});translatePage();renderQueue();renderTags();};
$('#export').onclick=()=>{
 if(running)return;
 if(!validRules()){label($('#status'),'review.invalidRules');$('#status').scrollIntoView({block:'center'});return;}
 $('#export').disabled=true;
 try{
  const snapshot=createReviewSnapshot(entries,mapping,rules(),allTags);
  clearDownload();
  downloadURL=URL.createObjectURL(new Blob([JSON.stringify(snapshot)],{type:'application/json'}));
  const link=$('#download-link');link.href=downloadURL;link.download='cake-tag-review.json';link.hidden=false;
  // Keep a real, visible link if the browser declines an automatic download.
  // No await separates the user's click from the initial download attempt.
  $('#server-export').hidden=false;link.click();label($('#status'),'review.downloadReady');link.scrollIntoView({block:'nearest'});
 }catch(error){label($('#status'),errorMessage(error));$('#status').scrollIntoView({block:'center'});}
 finally{summary();}
};
// A server attachment is an explicit alternative for browsers that reject Blob
// downloads. Keep the local snapshot available even if this request fails.
$('#server-export').onclick=async()=>{
 const button=$('#server-export');button.disabled=true;
 try{
  const completed=entries.filter(entry=>entry.result);
  const payload={items:completed.map(makeRecord),evaluation:{comparisonRules:rules(),videos:completed.map(entry=>({sha256:entry.result.sha256,timestamps:entry.timestamps,modelScores:entry.scores.map(row=>Array.from(row))}))}};
  const response=await session.request('/api/export?evaluation=1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const output=await response.json();if(!response.ok)throw messageError(output.error||'error.requestFailed');
  if(typeof output.download!=='string'||!/^\/api\/download\/[a-f0-9]{48}$/.test(output.download))throw messageError('error.requestFailed');
  const link=$('#server-link');link.href=output.download;link.download='cake-tag-review.json';link.hidden=false;
  $('#download-link').hidden=true;button.hidden=true;label($('#status'),'review.downloadReady');link.scrollIntoView({block:'center'});
 }catch(error){label($('#status'),errorMessage(error));$('#status').scrollIntoView({block:'center'});}
 finally{button.disabled=false;}
};
window.addEventListener('beforeunload',event=>{if(entries.some(entry=>entry.result)){event.preventDefault();event.returnValue='';}});
try{
 const [tags,map,config]=await Promise.all([fetch('/model/tags.txt').then(r=>r.text()),fetch('/model/mapping.json').then(r=>r.json()),session.request('/api/settings').then(async r=>{if(!r.ok)throw messageError('error.nativeServer');return r.json();})]);
 allTags=tags.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);mapping=map;settings=normalizeSettings(config.settings);
 $('#frames').value=settings.frames;$('#language').value=setLanguage(settings);translatePage();renderQueue();
}catch(error){setLanguage({language:'auto'});translatePage();label($('#status'),errorMessage(error));}
