import test from 'node:test';
import assert from 'node:assert/strict';
import { samplingPlan } from '../src/client/sampling.mjs';
import { makeRecord, validateRecord, applyRecord, exportItem } from '../src/shared/corrections.mjs';

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


test('incremental file hashes match native SHA-256 across padding and chunk boundaries', async()=>{
  const {hashFile}=await import('../src/client/sampling.mjs');
  const {createHash}=await import('node:crypto');
  for(const size of [0,1,55,56,63,64,65,127,128,1024*1024-1,1024*1024,1024*1024+1,2*1024*1024+57]) {
    const bytes=Uint8Array.from({length:size},(_,i)=>(i*37+13)%256);
    assert.equal(await hashFile(new Blob([bytes])),createHash('sha256').update(bytes).digest('hex'),String(size));
  }
});
test('files above the former limit use bounded reads and can be cancelled',async()=>{
  const {hashFile}=await import('../src/client/sampling.mjs');
  const {createHash}=await import('node:crypto');
  const size=251*1024*1024,expected=createHash('sha256'),chunk=new Uint8Array(1024*1024);
  let reads=0;
  const file={size,slice(start,end){const length=Math.min(end,size)-start;assert(length<=chunk.length);reads++;return {arrayBuffer:async()=>chunk.buffer.slice(0,length)};},arrayBuffer(){throw Error('Whole file must not be read');}};
  for(let i=0;i<251;i++)expected.update(chunk);
  assert.equal(await hashFile(file),expected.digest('hex'));assert.equal(reads,251);
  const controller=new AbortController();let cancelledReads=0;
  const cancelled={size,slice(){cancelledReads++;return {arrayBuffer:async()=>{controller.abort();return chunk.buffer;}};}};
  await assert.rejects(hashFile(cancelled,controller.signal),{name:'AbortError'});assert.equal(cancelledReads,1);
});
