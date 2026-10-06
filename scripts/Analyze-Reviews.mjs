import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {aggregate} from '../src/shared/tagging.mjs';
import {excluded,readTags} from '../src/shared/tag-policy.mjs';
import {validateAnalysisPolicy} from '../src/shared/analysis-settings.mjs';

const root=new URL('../',import.meta.url);
const ratio=(a,b)=>b?a/b:null;
function metrics(rows,eligibleOnly=false){
 let tp=0,fp=0,fn=0;
 for(const row of rows){
  const expected=new Set([...row.expected].filter(tag=>!eligibleOnly||row.eligible.has(tag)));
  for(const tag of row.baseline)expected.has(tag)?tp++:fp++;
  for(const tag of expected)if(!row.baseline.has(tag))fn++;
 }
 return {truePositive:tp,falsePositive:fp,falseNegative:fn,precision:ratio(tp,tp+fp),recall:ratio(tp,tp+fn),f1:ratio(2*tp,2*tp+fp+fn)};
}

// Accept both ordinary version-2 review downloads and recovered request bodies.
// Only explicit reviewed labels count; duplicate content cannot cross the split.
export function analyzeReviews(input,mapping,allowedTags){
 if(!Array.isArray(input?.items))throw Error('Missing review items');
 const allowed=new Set(allowedTags),unique=new Map();let unreviewed=0,duplicates=0;
 for(const [index,item]of input.items.entries()){
  if(item.reviewed!==true){unreviewed++;continue;}
  const result=item.result??item,video=item.evaluation??input.evaluation?.videos?.[index];
  if(!/^[a-f0-9]{64}$/.test(item.sha256)||!Array.isArray(item.tags)||item.tags.some(tag=>!allowed.has(tag)))throw Error('Invalid reviewed labels');
  if(!video||video.sha256!=null&&video.sha256!==item.sha256||!Array.isArray(video.modelScores)||video.modelScores.length!==result.sampledFrames||video.modelScores.some(row=>!Array.isArray(row)||row.length!==5813||row.some(score=>!Number.isFinite(score)||score<0||score>1)))throw Error('Invalid review score association');
  const originals=item.result?.tags??item.originalSuggestions;
  if(!Array.isArray(originals)||originals.some(row=>!allowed.has(row.tag)))throw Error('Original suggestions are required');
  validateAnalysisPolicy(result.analysisPolicy);
  const policy=result.analysisPolicy?.match(/^coverage-v[2345]:(majority|brief)(?::(.+))?$/);
  if(!policy||!Number.isFinite(result.threshold))throw Error('Original policy is required');
  const blocked=new Set(policy[2]?JSON.parse(policy[2]):['hairy','watermark']);
  const eligible=new Set(Object.keys(mapping).filter(tag=>!blocked.has(tag)&&(!excluded.has(tag)||['hairy','watermark'].includes(tag))));
  const row={sha256:item.sha256,expected:new Set(item.tags),baseline:new Set(originals.map(x=>x.tag)),eligible};
  row.reproduced=new Set(aggregate(video.modelScores,mapping,result.threshold,policy[1],{excludedTags:[...blocked]}).tags.map(x=>x.tag));
  const previous=unique.get(item.sha256);
  if(previous){
   if(previous.expected.size!==row.expected.size||[...row.expected].some(tag=>!previous.expected.has(tag)))throw Error('Conflicting reviews for identical content');
   duplicates++;continue;
  }
  unique.set(item.sha256,row);
 }
 const rows=[...unique.values()].sort((a,b)=>a.sha256.localeCompare(b.sha256));
 const holdout=rows.filter((_,i)=>i%4===3),development=rows.filter((_,i)=>i%4!==3);
 const allTags=new Set(rows.flatMap(row=>[...row.expected,...row.baseline]));
 const perTag=[...allTags].map(tag=>{
  const positive=rows.filter(row=>row.expected.has(tag)),tp=positive.filter(row=>row.baseline.has(tag)).length;
  return {tag,positives:positive.length,truePositive:tp,falsePositive:rows.filter(row=>!row.expected.has(tag)&&row.baseline.has(tag)).length,falseNegative:positive.length-tp,mapped:!!mapping[tag],manualOnly:excluded.has(tag),eligiblePositives:positive.filter(row=>row.eligible.has(tag)).length};
 }).sort((a,b)=>b.falseNegative-a.falseNegative||a.tag.localeCompare(b.tag));
 return {version:1,reviewed:rows.length,unreviewed,duplicates,baselineMismatches:rows.filter(row=>row.baseline.size!==row.reproduced.size||[...row.baseline].some(tag=>!row.reproduced.has(tag))).length,
  all:metrics(rows),automaticallyEligible:metrics(rows,true),development:{count:development.length,metrics:metrics(development)},holdout:{count:holdout.length,metrics:metrics(holdout)},perTag};
}

function markdown(report){
 const pct=value=>value==null?'—':(value*100).toFixed(1)+'%';
 const lines=['# Review analysis','',`Reviewed unique videos: ${report.reviewed}. Unreviewed omitted: ${report.unreviewed}. Duplicate reviews omitted: ${report.duplicates}.`,'',
  '| Scope | Precision | Recall | F1 |','| --- | ---: | ---: | ---: |'];
 for(const [name,m]of [['All annotations',report.all],['Automatically eligible annotations',report.automaticallyEligible],['Development partition',report.development.metrics],['Holdout partition',report.holdout.metrics]])lines.push(`| ${name} | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.f1)} |`);
 lines.push('',`Development/holdout sizes: ${report.development.count}/${report.holdout.count}. Current-rule replay mismatches: ${report.baselineMismatches}.`,'',
 'Metrics describe agreement with annotations, not independently established accuracy. Automatic eligibility respects the recorded exclusions and manual-only policy. Partitions are deterministic by content hash; related footage or the same performer may still occur in both. Do not tune repeatedly against the holdout.','',
 '| Tag | Reviewed positives | Correct suggestions | Wrong suggestions | Missed | Model mapping |','| --- | ---: | ---: | ---: | ---: | --- |');
 for(const row of report.perTag)lines.push(`| ${row.tag} | ${row.positives} | ${row.truePositive} | ${row.falsePositive} | ${row.falseNegative} | ${row.mapped?'yes':'no'} |`);
 return lines.join('\n')+'\n';
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [inputPath,outputPath]=process.argv.slice(2);
 if(!inputPath||!outputPath)throw Error('Usage: node scripts/Analyze-Reviews.mjs <review.json> <report.md>');
 // Personal results must never be written into tracked source or release folders.
 const output=path.resolve(outputPath),work=path.resolve(fileURLToPath(new URL('work/',root)));
 if(!output.startsWith(work+path.sep)||path.extname(output)!=='.md')throw Error('Reports must use an .md path inside ignored work/');
 const input=JSON.parse(fs.readFileSync(inputPath,'utf8'));
 const mapping=input.evaluation?.mapping??JSON.parse(fs.readFileSync(new URL('model/mapping.json',root),'utf8'));
 const tags=readTags(fs.readFileSync(new URL('model/tags.txt',root),'utf8'));
 const report=analyzeReviews(input,mapping,tags);
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,markdown(report));fs.writeFileSync(output.replace(/\.md$/,'.json'),JSON.stringify(report,null,2));
 console.log(`${report.reviewed} reviewed, ${report.unreviewed} unreviewed omitted. Report: ${output}`);
}
