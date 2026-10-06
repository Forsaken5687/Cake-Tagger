import { excluded } from './tag-policy.mjs';
import { ANALYSIS_VERSION, mappedFrameScore } from './tagging.mjs';
import { PREPROCESS_VERSION } from './analysis-settings.mjs';
import { messageError } from './messages.mjs';
import { exportItem } from './corrections.mjs';

// Candidate rules are a local experiment, never the production tagging policy.
export function candidateTags(frames,mapping,{threshold=.5,coverage=.5,excludedTags=[],tagRules={}}={}) {
 if(!Number.isFinite(threshold)||threshold<0||threshold>1||!Number.isFinite(coverage)||coverage<=0||coverage>1)throw Error('Invalid comparison rules');
 validateVariants({A:{threshold,coverage,tagRules},B:{threshold,coverage,tagRules}});
 const blocked=new Set(excludedTags),rows=[];
 for(const [tag,indices] of Object.entries(mapping)) {
  if(blocked.has(tag)||(excluded.has(tag)&&!['hairy','watermark'].includes(tag)))continue;
  const scores=frames.map(frame=>mappedFrameScore(frame,indices));
  if(!scores.length||scores.some(value=>!Number.isFinite(value)))continue;
  const perTag=Object.hasOwn(tagRules,tag)?tagRules[tag]:{threshold,coverage};
  const required=Math.max(2,Math.ceil(frames.length*perTag.coverage));
  const support=scores.filter(value=>value>=perTag.threshold).length;
  if(support>=required)rows.push({tag,confidence:scores.reduce((a,b)=>a+b,0)/scores.length,supportingFrames:support});
 }
 return rows.sort((a,b)=>b.confidence-a.confidence);
}

// Report precision/recall only against explicitly reviewed selections.
// Empty denominators remain unknown instead of claiming perfect accuracy.
export function comparisonMetrics(entries,predict) {
 let truePositive=0,falsePositive=0,falseNegative=0,reviewed=0;
 for(const entry of entries) {
  if(!entry.reviewed||!entry.result)continue;
  reviewed++;
  const ignored=new Set(entry.ignoredTags??[]);
  const expected=new Set([...entry.selected].filter(([tag,yes])=>yes&&!ignored.has(tag)).map(([tag])=>tag)),actual=new Set(predict(entry).map(row=>row.tag).filter(tag=>!ignored.has(tag)));
  for(const tag of actual)expected.has(tag)?truePositive++:falsePositive++;
  for(const tag of expected)if(!actual.has(tag))falseNegative++;
 }
 return {reviewed,truePositive,falsePositive,falseNegative,
  precision:truePositive+falsePositive?truePositive/(truePositive+falsePositive):null,
  recall:truePositive+falseNegative?truePositive/(truePositive+falseNegative):null};
}

// Reuse the guarded export endpoint while preserving only validated review data.
export function reviewExport(evaluation,items,mapping,allowedTags=Object.keys(mapping)) {
 if(!evaluation||!Array.isArray(evaluation.videos)||evaluation.videos.length!==items.length)throw messageError('error.invalidAnalysisData');
 const config=evaluation.comparisonRules;
 if(!config||!Number.isFinite(config.threshold)||!Number.isFinite(config.coverage)||!Array.isArray(config.excludedTags)||config.excludedTags.length>allowedTags.length||config.excludedTags.some(tag=>!allowedTags.includes(tag)))throw messageError('error.invalidTagsInTheCorrection');
 const rules={threshold:config.threshold,coverage:config.coverage,excludedTags:[...new Set(config.excludedTags)],tagRules:validateVariants({A:config,B:config},allowedTags).A.tagRules};
 const variants=validateVariants(evaluation.variants,allowedTags);
 try{candidateTags([],mapping,rules);}catch{throw messageError('error.invalidAnalysisData');}
 return {evaluation:{version:1,preprocessVersion:PREPROCESS_VERSION,mapping,comparisonRules:rules,baselineVersion:ANALYSIS_VERSION,variants},
  items:items.map((item,index)=>{
   const video=evaluation.videos[index],scores=video?.modelScores,times=video?.timestamps;
   if(video?.sha256!==item.sha256||!Number.isFinite(item.durationSeconds)||!Array.isArray(scores)||scores.length!==item.sampledFrames||scores.some(row=>!Array.isArray(row)||row.length!==5813||row.some(score=>!Number.isFinite(score)||score<0||score>1))
    ||!Array.isArray(times)||times.length!==scores.length||times.some((time,index)=>!Number.isFinite(time)||time<0||time>=item.durationSeconds||(index>0&&time<=times[index-1])))throw messageError('error.invalidModelScores');
   const ignoredTags=video.ignoredTags??[],partition=video.partition??'auto';
   if(!Array.isArray(ignoredTags)||ignoredTags.length>allowedTags.length||ignoredTags.some(tag=>!allowedTags.includes(tag))||!['auto','development','holdout'].includes(partition))throw messageError('error.invalidAnalysisData');
   return {...item,evaluation:{timestamps:times,modelScores:scores,candidateSuggestions:candidateTags(scores,mapping,rules),ignoredTags:[...new Set(ignoredTags)],partition}};
  })};
}


// Export already computed scores locally. Saving annotations must not require
// a running backend, an expiring session or another HTTP upload of all scores.
export function createReviewSnapshot(entries,mapping,comparisonRules,allowedTags,variants) {
 const completed=entries.filter(entry=>entry.result);
 if(!completed.length)throw messageError('error.noValidResults');
 const items=completed.map(exportItem);
 const evaluation={comparisonRules,variants,videos:completed.map(entry=>({
  sha256:entry.result.sha256,timestamps:entry.timestamps,ignoredTags:[...(entry.ignoredTags??[])],partition:entry.partition??'auto',
  modelScores:entry.scores.map(row=>Array.from(row))
 }))};
 return {version:2,source:'cake-tagger-review',createdAt:new Date().toISOString(),
  ...reviewExport(evaluation,items,mapping,allowedTags)};
}

export const DEFAULT_VARIANTS = Object.freeze({
  A: Object.freeze({threshold:.5, coverage:.5, tagRules:Object.freeze({})}),
  B: Object.freeze({threshold:.65, coverage:.5, tagRules:Object.freeze({})})
});
export function validateVariants(value = DEFAULT_VARIANTS, allowedTags) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('review.invalidRules');
  const result = {};
  for (const name of ['A','B']) {
    const rule = value[name];
    if (!rule || !Number.isFinite(rule.threshold) || rule.threshold < .01 || rule.threshold > 1 || !Number.isFinite(rule.coverage) || rule.coverage < .01 || rule.coverage > 1) throw Error('review.invalidRules');
    const source = rule.tagRules ?? {};
    if (!source || typeof source !== 'object' || Array.isArray(source) || Object.keys(source).length > (allowedTags?.length ?? 1024)) throw Error('review.invalidRules');
    const tagRules = {};
    for (const [tag, override] of Object.entries(source)) {
      if (['__proto__','constructor','prototype'].includes(tag) || typeof tag !== 'string' || !tag || tag.length > 80 || (allowedTags && !allowedTags.includes(tag)) || !override ||
        !Number.isFinite(override.threshold) || override.threshold < .01 || override.threshold > 1 || !Number.isFinite(override.coverage) || override.coverage < .01 || override.coverage > 1) throw Error('review.invalidRules');
      tagRules[tag] = {threshold:override.threshold, coverage:override.coverage};
    }
    result[name] = { threshold:rule.threshold, coverage:rule.coverage, tagRules };
  }
  return result;
}

// Stable per-content assignment: adding files never moves existing holdout clips.
export function reviewPartition(entry) {
  if (entry.partition === 'development' || entry.partition === 'holdout') return entry.partition;
  return /^[a-f0-9]{64}$/.test(entry.result?.sha256 ?? '') && parseInt(entry.result.sha256.slice(0, 8),16) % 4 === 3 ? 'holdout' : 'development';
}
export function problemTags(entries, predict) {
  const report = new Map();
  for (const [index, entry] of entries.entries()) {
    if (!entry.reviewed || !entry.result) continue;
    const ignored = new Set(entry.ignoredTags ?? []);
    const expected = new Set([...entry.selected].filter(([tag,yes])=>yes && !ignored.has(tag)).map(([tag])=>tag));
    const actual = new Set(predict(entry).map(row=>row.tag).filter(tag=>!ignored.has(tag)));
    for (const tag of new Set([...expected,...actual])) {
      if (!report.has(tag)) report.set(tag,{tag,truePositive:0,falsePositive:0,falseNegative:0,examples:[]});
      const row = report.get(tag);
      if (expected.has(tag) && actual.has(tag)) row.truePositive++;
      else {
        const kind = actual.has(tag) ? 'falsePositive' : 'falseNegative';
        row[kind]++; row.examples.push({index,filename:entry.file.name,kind});
      }
    }
  }
  return [...report.values()].sort((a,b)=>(b.falsePositive+b.falseNegative)-(a.falsePositive+a.falseNegative)||a.tag.localeCompare(b.tag));
}
export function compareVariants(entries, predictA, predictB) {
  let improved=0,regressed=0;
  const changes=[];
  for (const [index,entry] of entries.entries()) {
    if(!entry.result)continue;
    const ignored=new Set(entry.ignoredTags??[]);
    const a=new Set(predictA(entry).map(row=>row.tag)),b=new Set(predictB(entry).map(row=>row.tag));
    for(const tag of new Set([...a,...b])) if(a.has(tag)!==b.has(tag)&&!ignored.has(tag)) {
      const correct=entry.reviewed ? entry.selected.get(tag)===true : null;
      const improvement=correct===null?null:b.has(tag)===correct;
      if(improvement===true)improved++;else if(improvement===false)regressed++;
      changes.push({index,tag,inA:a.has(tag),inB:b.has(tag),improvement});
    }
  }
  return {improved,regressed,changes};
}
export function frameEvidence(entry, tag, mapping, rules) {
  const rule=Object.hasOwn(mapping,tag)?mapping[tag]:undefined;
  if(!rule)return [];
  const threshold=Object.hasOwn(rules.tagRules??{},tag)?rules.tagRules[tag].threshold:rules.threshold;
  return entry.scores.map((frame,index)=>{
    const score=mappedFrameScore(frame,rule);
    return {index,time:entry.timestamps[index],score,matched:score>=threshold,preview:entry.previews?.[index]};
  });
}
