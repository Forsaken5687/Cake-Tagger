import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {candidateTags,comparisonMetrics,problemTags,compareVariants,frameEvidence,reviewPartition,validateVariants,createReviewSnapshot} from '../src/shared/evaluation.mjs';
import {createDraft,restoreDraft,importReview} from '../src/client/review-session.mjs';

const mapping={glasses:[0],tattoos:[1]},tags=['glasses','tattoos','watermark','lying on back'];
const variants={A:{threshold:.5,coverage:.5,tagRules:{}},B:{threshold:.8,coverage:.75,tagRules:{}}};
function entry(){
 const scores=Array.from({length:4},()=>Float32Array.from({length:5813},(_,i)=>i===0?.7:i===1?.9:.1));
 return {file:{name:'synthetic.mp4',size:10,lastModified:1},result:{sha256:'a'.repeat(64),tags:[{tag:'glasses',confidence:.7,supportingFrames:4}],uncertain:['tattoos'],sampledFrames:4,durationSeconds:5,model:'JoyTag-FP32',threshold:.4,analysisPolicy:'coverage-v6:majority:[]'},
 scores,timestamps:[.5,1.5,2.5,3.5],previews:['data:image/jpeg;base64,AAAA'],selected:new Map([['glasses',false],['tattoos',true]]),tagSources:{glasses:'suggestion',tattoos:'manual'},
 reviewed:true,ignoredTags:new Set(['glasses']),partition:'development',frameSetting:'4',originalSuggestionsKnown:true};
}
test('per-tag thresholds and temporal coverage reuse scores without mutating global rules',()=>{
 const frames=[[.6,.9],[.6,.1],[.6,.1],[.1,.1]];
 const global={threshold:.5,coverage:.5,tagRules:{}};
 assert.deepEqual(candidateTags(frames,mapping,global).map(r=>r.tag),['glasses']);
 const rules={...global,tagRules:{glasses:{threshold:.7,coverage:.5},tattoos:{threshold:.8,coverage:.25}}};
 assert.deepEqual(candidateTags(frames,mapping,rules),[]); // At least two frames, including for a 25% override.
 assert.equal(global.threshold,.5);
 assert.throws(()=>validateVariants({...variants,A:{...variants.A,tagRules:{unknown:{threshold:.5,coverage:.5}}}},tags));
 assert.throws(()=>validateVariants({...variants,B:{threshold:NaN,coverage:.5}}));
});
test('not-assessable labels are omitted from every metric and problem report',()=>{
 const e=entry(),predict=()=>[{tag:'glasses'}];
 assert.deepEqual(comparisonMetrics([e],predict),{reviewed:1,truePositive:0,falsePositive:0,falseNegative:1,precision:null,recall:0});
 assert.deepEqual(problemTags([e],predict).map(r=>[r.tag,r.falsePositive,r.falseNegative]),[['tattoos',0,1]]);
 e.reviewed=false;assert.deepEqual(problemTags([e],predict),[]);
});
test('A/B changes distinguish improvements, regressions, unknown judgments and ignored labels',()=>{
 const e=entry(),a=()=>[{tag:'tattoos'},{tag:'watermark'},{tag:'glasses'}],b=()=>[];
 const change=compareVariants([e],a,b);
 assert.equal(change.improved,1);assert.equal(change.regressed,1);assert.equal(change.changes.length,2);
 e.reviewed=false;assert.equal(compareVariants([e],a,b).improved,0);
});
test('holdout assignment is stable across ordering and honors explicit groups',()=>{
 const a={result:{sha256:'a'.repeat(64)}},b={result:{sha256:'b'.repeat(64)}};
 assert.equal(reviewPartition(a),'development');assert.equal(reviewPartition(b),'holdout');
 assert.equal(reviewPartition({...b,partition:'development'}),'development');
 assert.equal([b,a].map(reviewPartition)[1],reviewPartition(a));
});
test('frame evidence keeps chronological timestamps and same-frame compound scores',()=>{
 const e=entry(),frames=frameEvidence(e,'glasses',mapping,{threshold:.8,tagRules:{glasses:{threshold:.6,coverage:.5}}});
 assert.equal(frames[0].time,.5);assert.equal(frames[0].preview,e.previews[0]);assert.equal(frames[0].matched,true);
 assert.deepEqual(frameEvidence(e,'watermark',mapping,variants.A),[]);
});
test('draft roundtrip retains annotations, typed raw scores, preview evidence and both variants without videos',()=>{
 const e=entry(),draft=createDraft([e],variants,'4','en'),restored=restoreDraft(structuredClone(draft),tags,mapping);
 assert.equal(restored.entries[0].reviewed,true);assert.equal(restored.entries[0].selected.get('tattoos'),true);
 assert.equal(restored.entries[0].ignoredTags.has('glasses'),true);assert.equal(restored.entries[0].partition,'development');
 assert(restored.entries[0].scores[0] instanceof Float32Array);
 assert.equal(restored.entries[0].previews[0],e.previews[0]);assert.equal(restored.entries[0].file.name,e.file.name);
 assert.deepEqual(restored.variants,variants);assert.deepEqual(Object.keys(draft.entries[0].file).sort(),['lastModified','name','size']);
});
test('JSON exports restore reviews and lab metadata, retaining legacy version-2 support',()=>{
 const e=entry(),snapshot=createReviewSnapshot([e],mapping,{...variants.A,excludedTags:[]},tags,variants);
 const restored=importReview(JSON.parse(JSON.stringify(snapshot)),tags,mapping);
 assert.equal(restored.entries[0].reviewed,true);assert(restored.entries[0].ignoredTags.has('glasses'));
 assert.equal(restored.entries[0].partition,'development');assert.deepEqual(restored.variants,variants);
 assert.deepEqual(restored.entries[0].previews,[]);
 delete snapshot.evaluation.variants;delete snapshot.items[0].evaluation.ignoredTags;delete snapshot.items[0].evaluation.partition;
 assert.equal(importReview(snapshot,tags,mapping).entries[0].partition,'auto');
});
test('restoration rejects malformed scores, unsafe previews and conflicting content splits atomically',()=>{
 for(const mutate of [draft=>draft.entries[0].scores[0][0]=NaN,draft=>draft.entries[0].timestamps[0]=-1,
  draft=>draft.entries[0].previews=['javascript:alert(1)'],draft=>draft.entries[0].record.tags=['__proto__']]){
  const draft=createDraft([entry()],variants,'4','en');mutate(draft);assert.throws(()=>restoreDraft(draft,tags,mapping));
 }
 const first=entry(),second=entry();second.partition='holdout';
 assert.throws(()=>restoreDraft(createDraft([first,second],variants,'4','en'),tags,mapping),/conflictingSplit/);
});
test('historical canonical renames preserve reviewed selections and source annotations',()=>{
 const e=entry();e.selected.set('supine',true);e.tagSources.supine='manual';
 const restored=restoreDraft(createDraft([e],variants,'4','en'),tags,mapping).entries[0];
 assert.equal(restored.selected.get('lying on back'),true);assert.equal(restored.tagSources['lying on back'],'manual');
 assert.equal(e.selected.get('supine'),true);
});
test('developer session code cannot enter the production allowlist',()=>{
 const release=JSON.parse(fs.readFileSync(new URL('../scripts/release-files.json',import.meta.url),'utf8'));
 for(const file of ['src/client/review.html','src/client/review.mjs','src/client/review-session.mjs','src/shared/evaluation.mjs','Review.cmd'])assert(!release.files.includes(file));
});

test('restoration preserves positives outside candidate metadata and rejects conflicting file hashes',()=>{
 const e=entry(),draft=createDraft([e],variants,'4','en');draft.entries[0].record.candidateTags=['glasses'];
 assert.equal(restoreDraft(draft,tags,mapping).entries[0].selected.get('tattoos'),true);
 draft.entries[0].knownHash='b'.repeat(64);assert.throws(()=>restoreDraft(draft,tags,mapping));
});
