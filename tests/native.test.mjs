import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createNativeEngine } from '../src/server/native-engine.mjs';
import { createNativeClient } from '../src/client/native-client.mjs';
import { computeCapabilities, resolveThreads } from '../src/server/native-policy.mjs';
import { validateRuntime } from '../src/shared/analysis-settings.mjs';

const image = value => new Uint8ClampedArray(448 * 448 * 4).fill(value);
const result = (value,threads) => ({scores:[value], timings:{modelLoadSeconds:0,preprocessSeconds:0,inferenceSeconds:0.1},runtime:{configuredNativeThreads:threads}});
test('native engine shares one batch queue, preserves neighbours on cancellation and waits for worker termination', async () => {
  const workers=[];
  class FakeWorker extends EventEmitter {
    messages=[];
    postMessage(message) {this.messages.push(message);if(message.type==='shutdown')this.emit('message',{type:'shutdown-ready'});}
    terminate() {this.emit('exit');return Promise.resolve(0);}
    complete(value) {const job=this.messages.findLast(message=>message.frames);this.emit('message',{id:job.id,result:result(value,Number(job.parallelism))});}
  }
  const engine=createNativeEngine({capabilities:computeCapabilities(24),createWorker(){const worker=new FakeWorker();workers.push(worker);return worker;}});
  const cancellation=new AbortController();
  const first=engine.infer([image(0),image(1)],'16',cancellation.signal);
  const rejected=assert.rejects(first,{name:'AbortError'});
  const second=engine.infer([image(2)],'24');
  cancellation.abort();await rejected;
  assert.equal(workers.length,1);assert.equal(workers[0].messages[0].frames.length,2);
  assert.equal(workers[0].messages[0].parallelism,'16');
  assert.equal(workers[0].messages[1].type,'cancel');
  workers[0].complete('discarded');workers[0].complete('second');
  assert.equal((await second).scores[0],'second');
  const third=engine.infer([image(0)],'auto');workers[0].emit('error',Error('crash'));
  await assert.rejects(third,/nativeInference/);
  const fourth=engine.infer([image(0)],'auto');assert.equal(workers.length,2);
  workers[0].emit('exit');workers[1].complete('recovered');assert.equal((await fourth).scores[0],'recovered');
  const queued=Array.from({length:9},()=>engine.infer([image(0)],'auto'));
  await assert.rejects(engine.infer([image(0)],'auto'),/nativeBusy/);
  const stopped=queued.map(promise=>assert.rejects(promise,/cancelled/));await engine.stop();await Promise.all(stopped);
  await assert.rejects(engine.infer([image(0)],'auto'),/stopped/);
  let terminated;
  const worker=new FakeWorker();worker.terminate=()=>new Promise(resolve=>{terminated=resolve;});
  const waiting=createNativeEngine({createWorker:()=>worker});const job=waiting.infer([image(0)],'auto');
  const cancelled=assert.rejects(job,/cancelled/);let done=false;
  const shutdown=waiting.stop().then(()=>{done=true;});await cancelled;assert.equal(done,false);
  terminated(0);await shutdown;assert.equal(done,true);
});

test('one HTTP batch preserves fragmented progress, image order and an override above eight', async () => {
  let calls=0;const progress=[];
  const client=createNativeClient({token:'a'.repeat(48),onProgress:current=>progress.push(current),fetcher:async(url,options)=>{
    calls++;assert.equal(url,'/api/infer?parallelism=16&raw=1');assert.equal(options.body.length,2*802816);
    assert.equal(options.body[0],0);assert.equal(options.body[802816],255);
    assert.equal(options.headers.Authorization,'Bearer '+'a'.repeat(48));
    const data=[{type:'progress',current:1,total:2},{type:'progress',current:2,total:2},
      {type:'done',scores:[Array(5813).fill(0),Array(5813).fill(1)],timings:{modelLoadSeconds:0,preprocessSeconds:.01,inferenceSeconds:.2,queueSeconds:.03}}];
    const text=data.map(row=>JSON.stringify(row)).join('\n')+'\n';
    return new Response(new ReadableStream({start(controller){for(let i=0;i<text.length;i+=137)controller.enqueue(new TextEncoder().encode(text.slice(i,i+137)));controller.close();}}));
  }});
  const output=await client.infer([image(0),image(255)],'16');
  assert.equal(calls,1);assert.deepEqual(progress,[1,2]);assert.equal(output.scores[0][0],0);assert.equal(output.scores[1][0],1);
  assert.equal(output.timings.queueSeconds,.03);
});

test('malformed streams and invalid outputs abort the server request', async () => {
  for(const text of ['{}\n','{"type":"error","error":"error.nativeBusy"}\n','{"type":"done","scores":[]}\n']) {
    let signal;
    const client=createNativeClient({fetcher:async(url,options)=>{signal=options.signal;return new Response(text);}});
    await assert.rejects(client.infer([image(0)]));assert.equal(signal.aborted,true);
  }
});

test('hardware sets the test maximum independently of RAM and recommended operating threads', () => {
  const caps=computeCapabilities(24);assert.equal(caps.recommendedThreads,8);assert.equal(caps.testMaximum,24);
  assert.equal(resolveThreads('auto',caps),8);assert.equal(resolveThreads('16',caps),16);assert.equal(resolveThreads('24',caps),24);
  for(const value of ['25','0','-1','1.5','99999999999999999999'])assert.throws(()=>resolveThreads(value,caps),/threadLimit|invalidAnalysisRuntime/);
  assert.equal(computeCapabilities(1).testMaximum,1);
});

test('native exports retain overrides above eight and reject impossible thread counts', () => {
  const runtime={provider:'native-cpu',configuredNativeThreads:16,inferenceWorkers:1,hardwareConcurrency:24,runtimeVersion:'1.30.0',modelSha256:'a'.repeat(64),parallelismLimit:'16'};
  assert.deepEqual(validateRuntime(runtime),runtime);
  assert.throws(()=>validateRuntime({...runtime,configuredNativeThreads:25}));
  assert.throws(()=>validateRuntime({...runtime,modelSha256:'unknown'}));
});

test('one session retains the full thread budget and frame order, ignoring retired options', async () => {
  const workers=[], progress=[];
  class Worker extends EventEmitter {
    messages=[];
    postMessage(message){this.messages.push(message);if(message.type==='shutdown')this.emit('message',{type:'shutdown-ready'});}
    terminate(){this.terminated=true;this.emit('exit');return Promise.resolve(0);}
    complete(){const job=this.messages.findLast(message=>message.frames);this.emit('message',{id:job.id,result:{scores:job.frames.map(frame=>Float32Array.of(frame[0])),timings:{modelLoadSeconds:0,preprocessSeconds:.01,inferenceSeconds:.1},runtime:{configuredNativeThreads:Number(job.parallelism)}}});}
  }
  const engine=createNativeEngine({createWorker(){const worker=new Worker();workers.push(worker);return worker;}});
  const pending=engine.infer([image(0),image(1),image(2),image(3)],'16',undefined,data=>progress.push(data.current),{parallelImages:true});
  assert.equal(workers.length,1);assert.equal(workers[0].messages[0].parallelism,'16');
  workers[0].emit('message',{id:workers[0].messages[0].id,type:'progress',current:1});
  workers[0].complete();
  const output=await pending;
  assert.deepEqual(output.scores.map(frame=>frame[0]),[0,1,2,3]);assert.deepEqual(progress,[1]);
  assert.equal(output.runtime.configuredNativeThreads,16);assert.deepEqual(output.runtime.threadsPerSession,[16]);
  assert.equal(output.runtime.inferenceWorkers,1);await engine.stop();assert(workers.every(worker=>worker.terminated));
});

test('shutdown never terminates a healthy native worker before session cleanup acknowledges', async () => {
  const worker = new EventEmitter();
  const messages = []; let terminated = false;
  worker.postMessage = message => messages.push(message);
  worker.terminate = async () => { terminated = true; worker.emit('exit'); return 0; };
  const engine = createNativeEngine({createWorker: () => worker});
  const job = engine.infer([image(0)], 'auto');
  const cancelled = assert.rejects(job, /cancelled/);
  const stopping = engine.stop(); await cancelled;
  assert.equal(messages.at(-1).type, 'shutdown');
  assert.equal(terminated, false, 'a running native call must finish before termination');
  worker.emit('message', {type: 'shutdown-ready'});
  await stopping; assert.equal(terminated, true);
});