import test from 'node:test';
import assert from 'node:assert/strict';
import { samplingPlan } from '../sampling.mjs';
import { makeRecord, validateRecord, applyRecord, exportItem } from '../corrections.mjs';

test('auto chooses bounded counts at duration boundaries', () => {
  for (const [duration, count] of [[0.01,8],[10,8],[15,8],[15.01,12],[30,12],[30.01,16],[60,16],[60.01,24],[120,24],[120.01,32],[300,32],[300.01,48],[600,48]]) {
    const plan = samplingPlan(duration);
    assert.equal(plan.count, count);
    assert.equal(plan.mode, 'auto');
    assert.equal(plan.timestamps.length, count);
    assert(plan.timestamps.every((t,i,a) => t > 0 && t < duration && (!i || t > a[i-1])));
  }
});
test('fixed selection remains available; invalid duration and counts are rejected', () => {
  assert.equal(samplingPlan(30,'4').count,4);
  assert.equal(samplingPlan(600,'16').mode,'fixed');
  for (const duration of [0,-1,NaN,Infinity,600.01]) assert.throws(()=>samplingPlan(duration));
  for (const count of [0,10,49,'bad']) assert.throws(()=>samplingPlan(20,count));
});
test('long-video metadata survives persistence and export', () => {
  const entry={file:{name:'synthetic.mp4'},selected:new Map([['solo',true]]),reviewed:true,
    result:{sha256:'a'.repeat(64),tags:[{tag:'solo',confidence:0.9,supportingFrames:30}],uncertain:[],sampledFrames:48,threshold:0.5,model:'JoyTag-INT8',analysisPolicy:'coverage-v3:majority',samplingMode:'auto',durationSeconds:600}};
  const record=validateRecord(makeRecord(entry),['solo']);
  const out=exportItem(applyRecord({file:entry.file},record));
  assert.equal(out.sampledFrames,48);assert.equal(out.durationSeconds,600);assert.equal(out.samplingMode,'auto');
  assert.throws(()=>validateRecord({...record,result:{...record.result,sampledFrames:49}},['solo']));
  assert.throws(()=>validateRecord({...record,result:{...record.result,durationSeconds:601}},['solo']));
  assert.throws(()=>validateRecord({...record,result:{...record.result,tags:[{tag:'solo',confidence:0.9,supportingFrames:49}]}},['solo']));
});
