import { excluded } from './tag-policy.mjs';
import { ANALYSIS_VERSION, mappedFrameScore } from './tagging.mjs';
import { PREPROCESS_VERSION } from './analysis-settings.mjs';
import { messageError } from './messages.mjs';
import { exportItem } from './corrections.mjs';

// Candidate rules are a local experiment, never the production tagging policy.
export function candidateTags(frames,mapping,{threshold=.5,coverage=.5,excludedTags=[]}={}) {
 if(!Number.isFinite(threshold)||threshold<0||threshold>1||!Number.isFinite(coverage)||coverage<=0||coverage>1)throw Error('Invalid comparison rules');
 const blocked=new Set(excludedTags),required=Math.max(2,Math.ceil(frames.length*coverage)),rows=[];
 for(const [tag,indices] of Object.entries(mapping)) {
  if(blocked.has(tag)||(excluded.has(tag)&&!['hairy','watermark'].includes(tag)))continue;
  const scores=frames.map(frame=>mappedFrameScore(frame,indices));
  if(!scores.length||scores.some(value=>!Number.isFinite(value)))continue;
  const support=scores.filter(value=>value>=threshold).length;
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
  const expected=new Set([...entry.selected].filter(([,yes])=>yes).map(([tag])=>tag)),actual=new Set(predict(entry).map(row=>row.tag));
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
 const rules={threshold:config.threshold,coverage:config.coverage,excludedTags:[...new Set(config.excludedTags)]};
 try{candidateTags([],mapping,rules);}catch{throw messageError('error.invalidAnalysisData');}
 return {evaluation:{version:1,preprocessVersion:PREPROCESS_VERSION,mapping,comparisonRules:rules,baselineVersion:ANALYSIS_VERSION},
  items:items.map((item,index)=>{
   const video=evaluation.videos[index],scores=video?.modelScores,times=video?.timestamps;
   if(video?.sha256!==item.sha256||!Number.isFinite(item.durationSeconds)||!Array.isArray(scores)||scores.length!==item.sampledFrames||scores.some(row=>!Array.isArray(row)||row.length!==5813||row.some(score=>!Number.isFinite(score)||score<0||score>1))
    ||!Array.isArray(times)||times.length!==scores.length||times.some((time,index)=>!Number.isFinite(time)||time<0||time>=item.durationSeconds||(index>0&&time<=times[index-1])))throw messageError('error.invalidModelScores');
   return {...item,evaluation:{timestamps:times,modelScores:scores,candidateSuggestions:candidateTags(scores,mapping,rules)}};
  })};
}


// Export already computed scores locally. Saving annotations must not require
// a running backend, an expiring session or another HTTP upload of all scores.
export function createReviewSnapshot(entries,mapping,comparisonRules,allowedTags) {
 const completed=entries.filter(entry=>entry.result);
 if(!completed.length)throw messageError('error.noValidResults');
 const items=completed.map(exportItem);
 const evaluation={comparisonRules,videos:completed.map(entry=>({
  sha256:entry.result.sha256,timestamps:entry.timestamps,
  modelScores:entry.scores.map(row=>Array.from(row))
 }))};
 return {version:2,source:'cake-tagger-review',createdAt:new Date().toISOString(),
  ...reviewExport(evaluation,items,mapping,allowedTags)};
}
