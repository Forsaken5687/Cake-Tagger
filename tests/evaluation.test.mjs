import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateTags,comparisonMetrics,reviewExport} from '../src/shared/evaluation.mjs';
test('comparison rejects isolated frame hits and keeps scores across the whole clip',()=>{
 const rows=candidateTags([[.99,.7],[.1,.8],[.1,.6],[.1,.9]],{tattoos:[0],glasses:[1]},{threshold:.5,coverage:.5});
 assert.deepEqual(rows.map(row=>row.tag),['glasses']);assert.equal(rows[0].supportingFrames,4);assert(Math.abs(rows[0].confidence-.75)<1e-6);
 assert.deepEqual(candidateTags([[.9]],{glasses:[0]}),[]);
 assert.throws(()=>candidateTags([],{},{coverage:0}));
 assert.deepEqual(candidateTags([[.9],[.9]],{glasses:[0]},{excludedTags:['glasses']}),[]);
});
test('comparison metrics exclude unreviewed labels and do not invent empty accuracy',()=>{
 const reviewed={reviewed:true,result:{tags:[{tag:'glasses'},{tag:'hat'}]},selected:new Map([['glasses',true],['tattoos',true],['hat',false]])};
 const metrics=comparisonMetrics([reviewed,{...reviewed,reviewed:false}],entry=>entry.result.tags);
 assert.deepEqual(metrics,{reviewed:1,truePositive:1,falsePositive:1,falseNegative:1,precision:.5,recall:.5});
 assert.equal(comparisonMetrics([],()=>[]).precision,null);
});


test('review exports validate raw scores and preserve separate reviews of identical files',()=>{
 const sha='a'.repeat(64),mapping={glasses:[0]},rules={threshold:.5,coverage:.5,excludedTags:[]};
 const item={sha256:sha,sampledFrames:2,durationSeconds:3,reviewed:true,tags:['glasses'],addedTags:['glasses']};
 const video=value=>({sha256:sha,timestamps:[.5,2],modelScores:[Array(5813).fill(value),Array(5813).fill(value)]});
 const evaluation={comparisonRules:rules,videos:[video(.8),video(.1)]};
 const output=reviewExport(evaluation,[item,{...item,reviewed:false}],mapping);
 assert.equal(output.items[0].evaluation.candidateSuggestions[0].tag,'glasses');
 assert.deepEqual(output.items[1].evaluation.candidateSuggestions,[]);
 assert.deepEqual(output.items[0].addedTags,['glasses']);assert.equal(output.items[1].reviewed,false);
 for(const mutate of [v=>v.sha256='b'.repeat(64),v=>v.modelScores[0].pop(),v=>v.modelScores[0][0]=NaN,v=>v.timestamps[1]=.5]){
  const malformed=video(.8);mutate(malformed);
  assert.throws(()=>reviewExport({...evaluation,videos:[malformed]},[item],mapping));
 }
 assert.throws(()=>reviewExport({...evaluation,comparisonRules:{...rules,excludedTags:['unknown']}},[item,item],mapping));
});
