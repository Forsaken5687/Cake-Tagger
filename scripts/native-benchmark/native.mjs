import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const benchmarkDirectory=path.resolve('work/native-benchmark');
const require=createRequire(path.join(benchmarkDirectory,'probe.mjs')),ort=require('onnxruntime-node');
// Verify the exact artifact before comparing providers; a different model invalidates the comparison.
const modelPath=path.resolve('model/joytag-int8.onnx');
const modelSha256=crypto.createHash('sha256').update(fs.readFileSync(modelPath)).digest('hex');
if(modelSha256!=='888419d6832b2e39404c6051842e04cacf71cf33f4ce0cb9096874e4f32eec01')throw Error('Benchmark model checksum mismatch');
// Deterministic RGBA fixtures contain no user media and are shared verbatim with the browser.
const n=448*448,frames=8,frameBytes=n*4,bytes=Buffer.alloc(frames*frameBytes);
for(let f=0;f<frames;f++)for(let i=0;i<n;i++){const j=f*frameBytes+i*4;bytes[j]=(i+f*29)%256;bytes[j+1]=(Math.floor(i/448)+f*17)%256;bytes[j+2]=(i%448+f*41)%256;bytes[j+3]=255;}
fs.writeFileSync(path.join(benchmarkDirectory,'inputs.rgba'),bytes);
const means=[0.48145466,0.4578275,0.40821073],std=[0.26862954,0.26130258,0.27577711];
const inputs=Array.from({length:frames},(_,f)=>{const data=new Float32Array(3*n);for(let i=0;i<n;i++)for(let c=0;c<3;c++)data[c*n+i]=(bytes[f*frameBytes+i*4+c]/255-means[c])/std[c];return data;});
const results=[];let reference;
for(const threads of [8]){
 const baselineRss=process.memoryUsage().rss;let peak=baselineRss;
 const sample=setInterval(()=>{peak=Math.max(peak,process.memoryUsage().rss);},25);
 const started=performance.now();const session=await ort.InferenceSession.create(modelPath,{executionProviders:['cpu'],graphOptimizationLevel:'all',intraOpNumThreads:threads,interOpNumThreads:1});
 const modelLoadSeconds=(performance.now()-started)/1000;const afterModelRss=process.memoryUsage().rss;
 const durations=[];let scores;
 for(let repeat=0;repeat<3;repeat++){
  scores=[];const runStarted=performance.now();
  for(const inputData of inputs){const input=new ort.Tensor('float32',inputData,[1,3,448,448]);const output=await session.run({[session.inputNames[0]]:input});input.dispose();const raw=output[session.outputNames[0]].data;if(raw.length!==5813)throw Error('Model output shape mismatch');scores.push(Float32Array.from(raw,x=>1/(1+Math.exp(-x))));Object.values(output).forEach(t=>t.dispose());}
  durations.push((performance.now()-runStarted)/1000);
 }
 let delta=0;if(reference){for(let f=0;f<frames;f++)for(let i=0;i<5813;i++)delta=Math.max(delta,Math.abs(reference[f][i]-scores[f][i]));}else reference=scores;
 const afterInferenceRss=process.memoryUsage().rss;peak=Math.max(peak,afterModelRss,afterInferenceRss);clearInterval(sample);
 results.push({threads,modelLoadSeconds,batchSeconds:durations,frames,baselineRssBytes:baselineRss,afterModelRssBytes:afterModelRss,afterInferenceRssBytes:afterInferenceRss,sampledPeakRssBytes:peak,rssSamplingIntervalMs:25});
 await session.release();console.log(JSON.stringify(results.at(-1)));
}
fs.writeFileSync(path.join(benchmarkDirectory,'native-scores.bin'),Buffer.concat(reference.map(row=>Buffer.from(row.buffer))));
fs.writeFileSync(path.join(benchmarkDirectory,'native-report.json'),JSON.stringify({runtime:ort.env.versions,provider:'cpu',fixture:'eight synthetic RGBA frames',memoryScope:'entire benchmark process including runtime, model and fixture buffers',modelSha256,hardwareConcurrency:os.cpus().length,systemMemoryBytes:os.totalmem(),results},null,2));
