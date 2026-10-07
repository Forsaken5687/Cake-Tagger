import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeClient } from '../src/client/native-client.mjs';
import { validateRuntime } from '../src/shared/analysis-settings.mjs';

const image = value => new Uint8ClampedArray(448 * 448 * 4).fill(value);
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

test('native exports retain overrides above eight and reject impossible thread counts', () => {
  const runtime={provider:'native-cpu',configuredNativeThreads:16,inferenceWorkers:1,hardwareConcurrency:24,runtimeVersion:'1.30.0',modelSha256:'a'.repeat(64),parallelismLimit:'16'};
  assert.deepEqual(validateRuntime(runtime),runtime);
  assert.throws(()=>validateRuntime({...runtime,configuredNativeThreads:25}));
  assert.throws(()=>validateRuntime({...runtime,modelSha256:'unknown'}));
});
