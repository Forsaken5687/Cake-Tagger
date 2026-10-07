import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { computeCapabilities, resolveThreads } from './native-policy.mjs';
import { details } from '../shared/tagging.mjs';
import { excluded } from '../shared/tag-policy.mjs';

// Only transport lives here. Python owns its FIFO queue, warm session and scores.
export function createPythonEngine({ capabilities=computeCapabilities(), executable=process.env.CAKE_TAGGER_PYTHON || fileURLToPath(new URL('../../runtime/python/Scripts/python.exe',import.meta.url)) }={}) {
  let child, stopped=false, nextId=0;
  const jobs=new Map();
  let exitPromise;
  function start() {
    if(child)return;
    child=spawn(executable,['-u',fileURLToPath(new URL('./python_worker.py',import.meta.url))],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    exitPromise=new Promise(resolve=>child.once('close',resolve));
    const fail=()=>{for(const job of jobs.values()){job.cleanup();job.reject(Error('error.nativeInference'));}jobs.clear();};
    const target=child; target.on('error',fail);target.on('close',()=>{fail();if(child===target)child=undefined;});target.stdin.on('error',fail);
    // Do not leak native dependency paths or input data into UI error text.
    child.stderr.on('data',()=>{});
    createInterface({input:child.stdout}).on('line',line=>{
      let message;try{message=JSON.parse(line);}catch{fail();return;}
      const job=jobs.get(message.id);if(!job)return;
      if(message.type==='progress'){if(!job.cancelled)job.onProgress(message);return;}
      jobs.delete(message.id);job.cleanup();
      if(job.cancelled)return;
      message.error?job.reject(Error(message.error)):job.resolve(message.result);
    });
    const mapping=JSON.parse(fs.readFileSync(new URL('../../model/mapping.json',import.meta.url)));
    const provenance=JSON.parse(fs.readFileSync(new URL('../../model/provenance.json',import.meta.url)));
    write({type:'init',model:fileURLToPath(new URL('../../model/joytag.onnx',import.meta.url)),sha256:provenance.sha256,
      policy:{mapping,details:[...details],manualOnly:[...excluded]},capabilities});
  }
  function write(message,frames=[]) {
    // One write preserves header/payload ordering even when clients enqueue together.
    child.stdin.write(Buffer.concat([Buffer.from(JSON.stringify(message)+'\n'),...frames.map(frame=>Buffer.from(frame.buffer,frame.byteOffset,frame.byteLength))]));
  }
  function infer(input,parallelism='auto',signal,onProgress=()=>{},options={}) {
    if(stopped)return Promise.reject(Error('analysis.stopped'));
    if(signal?.aborted)return Promise.reject(new DOMException('analysis.cancelled','AbortError'));
    if(jobs.size>=capabilities.queueCapacity+1)return Promise.reject(Error('error.nativeBusy'));
    const frames=Array.isArray(input)?input:[input];
    if(!frames.length||frames.length>48||frames.some(frame=>!(frame instanceof Uint8ClampedArray)||frame.length!==802816))return Promise.reject(Error('error.invalidModelInputImage'));
    try{resolveThreads(parallelism,capabilities);start();}catch(error){return Promise.reject(error);}
    return new Promise((resolve,reject)=>{
      const id=++nextId;
      const abort=()=>{job.cancelled=true;signal?.removeEventListener('abort',abort);write({type:'cancel',id});reject(new DOMException('analysis.cancelled','AbortError'));};
      const job={resolve,reject,onProgress,cancelled:false,cleanup:()=>signal?.removeEventListener('abort',abort)};
      jobs.set(id,job);signal?.addEventListener('abort',abort,{once:true});
      write({type:'infer',id,length:frames.length*802816,parallelism,excludedTags:options.excludedTags??['hairy','watermark']},frames);
    });
  }
  async function stop(){stopped=true;if(!child)return;write({type:'shutdown'});child.stdin.end();await exitPromise;}
  return {infer,stop};
}
