import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
function analyzeReviews(input,mapping,allowed){
 const script="import json,sys; from analyze_reviews import analyze_reviews; from cake_tagger.config import load_catalog; from pathlib import Path; value=json.load(sys.stdin); policy=load_catalog(Path.cwd()/'model')[1]; print(json.dumps(analyze_reviews(value['input'],value['mapping'],value['allowed'],policy)))";
 const result=spawnSync(fileURLToPath(new URL('../runtime/cpython/python.exe',import.meta.url)),['-c',script],{input:JSON.stringify({input,mapping,allowed}),encoding:'utf8',windowsHide:true});
 if(result.status!==0)throw Error(result.stderr);return JSON.parse(result.stdout);
}
const make=(id,reviewed=true,tags=['glasses'])=>({sha256:id.repeat(64),tags,reviewed,result:{threshold:.4,analysisPolicy:'coverage-v5:majority:["hairy","watermark"]',sampledFrames:2,tags:[{tag:'glasses'}]}});
const video=item=>({sha256:item.sha256,modelScores:[Array(5813).fill(.9),Array(5813).fill(.9)]});
const input=items=>({items,evaluation:{videos:items.map(video)}});
test('review analysis separates content and excludes unreviewed and duplicate labels',()=>{
 const report=analyzeReviews(input([make('a'),make('b'),make('c'),make('d'),make('a'),make('e',false)]),{glasses:[0]},['glasses']);
 assert.equal(report.reviewed,4);assert.equal(report.unreviewed,1);assert.equal(report.duplicates,1);
 assert.equal(report.development.count,3);assert.equal(report.holdout.count,1);assert.equal(report.all.precision,1);assert.equal(report.baselineMismatches,0);
 assert.throws(()=>analyzeReviews(input([make('a'),make('a',true,[])]),{glasses:[0]},['glasses']));
});
test('eligible recall separates manual-only labels and validates score association',()=>{
 const data=input([make('a',true,['glasses','watermark'])]);
 const report=analyzeReviews(data,{glasses:[0]},['glasses','watermark']);
 assert.equal(report.all.recall,.5);assert.equal(report.automaticallyEligible.recall,1);
 data.evaluation.videos[0].sha256='b'.repeat(64);
 assert.throws(()=>analyzeReviews(data,{glasses:[0]},['glasses','watermark']));
});

test('offline reports accept v6, ignore ambiguous judgments and respect explicit holdout',()=>{
 const item=make('a',true,['glasses']);item.result.analysisPolicy='coverage-v6:majority:[]';
 const data=input([item]);data.evaluation.videos[0].ignoredTags=['glasses'];data.evaluation.videos[0].partition='holdout';
 const report=analyzeReviews(data,{glasses:[0]},['glasses']);
 assert.equal(report.all.precision,null);assert.equal(report.all.recall,null);assert.equal(report.holdout.count,1);assert.equal(report.development.count,0);assert.equal(report.baselineMismatches,0);
});


test('offline analysis preserves historical labels without accepting malformed names',()=>{
 const item=make('a',true,['glasses','couch']);item.result.tags.push({tag:'supine'});
 const data=input([item]);data.evaluation.videos[0].ignoredTags=['retired tag'];
 const report=analyzeReviews(data,{glasses:[0]},['glasses']);
 assert.deepEqual(report.historicalTags,['lying on back','on couch','retired tag']);
 assert.equal(report.all.truePositive,1);assert.equal(report.all.falsePositive,1);assert.equal(report.all.falseNegative,1);
 assert.equal(report.perTag.find(row=>row.tag==='on couch').positives,1);
 for(const invalid of [null,{},'', ' padded ', 'bad|table', 'bad\nline', '<script>', 'x'.repeat(81)]){
  const invalidData=input([make('b',true,[invalid])]);
  assert.throws(()=>analyzeReviews(invalidData,{glasses:[0]},['glasses']),/Invalid reviewed labels/);
 }
});


test('offline reports match renamed annotations, originals and recorded mappings',()=>{
 const item=make('a',true,['couch','supine']);item.result.tags=[{tag:'on couch'},{tag:'supine'}];
 const report=analyzeReviews(input([item]),{couch:[0],supine:[1]},['on couch','lying on back']);
 assert.deepEqual(report.historicalTags,[]);assert.equal(report.all.precision,1);assert.equal(report.all.recall,1);
 assert.equal(report.automaticallyEligible.recall,1);assert.equal(report.baselineMismatches,0);
 assert.deepEqual(report.perTag.map(row=>row.tag),['lying on back','on couch']);
});


test('canonicalization retains combined rules and rejects conflicting rename mappings',()=>{
 const data=input([make('a')]);
 assert.equal(analyzeReviews(data,{glasses:{all:[[0],[1]]}},['glasses']).baselineMismatches,0);
 assert.throws(()=>analyzeReviews(data,{couch:[0],'on couch':[1]},['glasses']),/Conflicting mappings/);
});
