import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { aggregate, details } from '../src/shared/tagging.mjs';
import { excluded } from '../src/shared/tag-policy.mjs';
import { validateRecord, applyRecord, exportItem } from '../src/shared/corrections.mjs';
import { validateRuntime } from '../src/shared/analysis-settings.mjs';
const executable=process.env.CAKE_TAGGER_PYTHON||fileURLToPath(new URL('../runtime/cpython/python.exe',import.meta.url));
test('Python core agrees with JS aggregation and handles queue cancellation, shutdown and overrides',{skip:!fs.existsSync(executable)},()=>{
 const mapping=JSON.parse(fs.readFileSync(new URL('../model/mapping.json',import.meta.url)));
 const policy={mapping,details:[...details],manualOnly:[...excluded]},cases=[];
 let seed=7;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
 for(const count of [1,2,8,12])for(const coverage of ['majority','brief'])for(const threshold of [.4,.65]){
  const scores=Array.from({length:count},()=>Array.from({length:5813},()=>Math.fround(random())));
  const excludedTags=count%2?[]:['hairy','watermark','tattoos'];
  for(const limitResults of [true,false])cases.push({scores,coverage,threshold,excludedTags,limitResults,expected:aggregate(scores,mapping,threshold,coverage,{excludedTags,limitResults})});
 }
 const result=spawnSync(executable,[fileURLToPath(new URL('./python_core_test.py',import.meta.url))],{input:JSON.stringify({policy,cases}),encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024,timeout:30000});
 assert.equal(result.status,0,result.stderr||result.error?.message);
});
test('backend and Python process metrics survive validated exports',()=>{
 const input={provider:'native-cpu',configuredNativeThreads:16,hardwareConcurrency:24,runtimeVersion:'1.30.0',modelSha256:'a'.repeat(64),backendImplementation:'python',inferenceRssBytes:300000000,inferenceProcessPowerPolicy:'high-qos'};
 assert.equal(validateRuntime(input).backendImplementation,'python');assert.equal(validateRuntime(input).inferenceRssBytes,input.inferenceRssBytes);
 for(const extra of [{backendImplementation:'unknown'},{inferenceRssBytes:-1},{inferenceProcessPowerPolicy:'boost'}])assert.throws(()=>validateRuntime({...input,...extra}));
});

test('Python catalog policy and correction exports agree with browser validators',()=>{
 const policy=JSON.parse(fs.readFileSync(new URL('../model/policy.json',import.meta.url)));
 assert.deepEqual(policy.details,[...details]);assert.deepEqual(policy.manualOnly,[...excluded]);
 const tags=fs.readFileSync(new URL('../model/tags.txt',import.meta.url),'utf8').trim().split(/\r?\n/);
 const cases=[];
 for(const known of [true,false])for(const sources of [undefined,{tattoos:'manual',glasses:'suggestion'}]){
  const input={filename:'synthetic.mp4',sha256:'a'.repeat(64),tags:['tattoos'],candidateTags:['tattoos','glasses'],tagSources:sources,reviewed:true,originalSuggestionsKnown:known,updatedAt:'2026-01-01T00:00:00Z',result:{sha256:'a'.repeat(64),tags:[{tag:'glasses',confidence:.8,supportingFrames:2}],uncertain:['tattoos'],uncertainScores:[{tag:'tattoos',confidence:.6,supportingFrames:0}],sampledFrames:2,threshold:.4,model:'JoyTag-FP32',analysisPolicy:'coverage-v6:majority:[]',durationSeconds:10}};
  const record=validateRecord(input,tags);cases.push({input,expected:exportItem(applyRecord({file:{name:input.filename}},record))});
 }
 const script="import json,sys; from server.validation import validate_record,export_item; v=json.load(sys.stdin); actual=[export_item(validate_record(x['input'],v['tags'])) for x in v['cases']]; print(json.dumps(actual))";
 const result=spawnSync(executable,['-c',script],{input:JSON.stringify({tags,cases}),encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),cases.map(x=>x.expected));
});
