import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { aggregate } from '../../tagging.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const benchmarkDirectory=path.join(root,'work/native-benchmark');
const mapping=JSON.parse(fs.readFileSync(path.join(root,'mapping.json')));
const nativeBytes=fs.readFileSync(path.join(benchmarkDirectory,'native-scores.bin'));
const native=new Float32Array(nativeBytes.buffer.slice(nativeBytes.byteOffset,nativeBytes.byteOffset+nativeBytes.byteLength));
const asFrames=values=>Array.from({length:8},(_,i)=>values.slice(i*5813,(i+1)*5813));
const tagSet=values=>aggregate(asFrames(values),mapping,0.4,'majority',{excludedTags:['hairy','watermark']}).tags.map(row=>row.tag).sort();
const html=`<!doctype html><html><title>Native CPU comparison</title><h1>Native CPU / Browser WASM</h1><p>Eight identical synthetic frames. Four and eight browser workers, three batches each.</p><button id="run">Run browser comparison</button><pre id="report">Ready</pre><script type="module">
import {createInferencePool} from '/inference-pool.mjs';
const output=document.querySelector('#report');
document.querySelector('#run').onclick=async()=>{
 document.querySelector('#run').disabled=true;const reports=[];
 try{const source=new Uint8ClampedArray(await(await fetch('/inputs.rgba')).arrayBuffer());
 for(const count of [4,8]){const pool=createInferencePool({createWorker:()=>new Worker('/engine-worker.js'),concurrency:count,onProgress:(current,total)=>output.textContent='Workers '+count+': image '+current+'/'+total});
 try{const batches=[];let result;for(let repeat=0;repeat<3;repeat++){const frames=Array.from({length:8},(_,i)=>source.slice(i*448*448*4,(i+1)*448*448*4));const started=performance.now();result=await pool.infer(frames);batches.push({totalSeconds:(performance.now()-started)/1000,timings:result.timings});}
 const flat=new Float32Array(8*5813);result.scores.forEach((row,i)=>flat.set(row,i*5813));const response=await fetch('/compare',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:flat.buffer});if(!response.ok)throw Error('Score comparison failed');const comparison=await response.json();reports.push({workers:count,runtime:result.runtime,batches,comparison});
 }finally{pool.stop();}}
 const saved=await fetch('/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(reports)});if(!saved.ok)throw Error('Saving benchmark report failed');output.textContent=JSON.stringify({complete:true,reports},null,2);
 }catch(error){output.textContent='Failed: '+error.message;}
};</script></html>`;
http.createServer(async(req,res)=>{
 try {
 // This diagnostic endpoint accepts only its own loopback origin and fixed fixture assets.
 const own='127.0.0.1:8793';if(req.headers.host!==own||(req.headers.origin&&req.headers.origin!=='http://'+own)){res.writeHead(403);return res.end();}
 const name=new URL(req.url,'http://'+own).pathname;
 if(req.method==='POST'&&(name==='/compare'||name==='/report')){
 const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>2000000){res.writeHead(413);return res.end();}chunks.push(chunk);}const bytes=Buffer.concat(chunks);
 if(name==='/report'){const report=JSON.parse(bytes.toString('utf8'));if(!Array.isArray(report)||report.length!==2){res.writeHead(400);return res.end();}fs.writeFileSync(path.join(benchmarkDirectory,'browser-report.json'),JSON.stringify(report,null,2));res.setHeader('Content-Type','application/json');res.end('{}');return;}
 if(bytes.length!==nativeBytes.length){res.writeHead(400);return res.end();}
 const values=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));if(values.some(value=>!Number.isFinite(value)||value<0||value>1)){res.writeHead(400);return res.end();}fs.writeFileSync(path.join(benchmarkDirectory,'wasm-scores.bin'),bytes);let max=0,sum=0,c04=0,c065=0;
 for(let i=0;i<values.length;i++){const d=Math.abs(values[i]-native[i]);max=Math.max(max,d);sum+=d;c04+=(values[i]>=0.4)!==(native[i]>=0.4);c065+=(values[i]>=0.65)!==(native[i]>=0.65);}
 res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({labelsCompared:values.length,maxAbsDifference:max,meanAbsDifference:sum/values.length,thresholdCrossings04:c04,thresholdCrossings065:c065,aggregatedTagSetsEqual:JSON.stringify(tagSet(values))===JSON.stringify(tagSet(native))}));
 }
 if(req.method!=='GET'){res.writeHead(405);return res.end();}
 if(name==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
 const local=name==='/inputs.rgba'?path.join(benchmarkDirectory,'inputs.rgba'):path.join(root,name.slice(1));
 if(name!=='/inputs.rgba'&&!['/compute-policy.js','/inference-pool.mjs','/messages.mjs','/engine-worker.js'].includes(name)&&!/^\/(vendor|model)\/[A-Za-z0-9._-]+$/.test(name)){res.writeHead(404);return res.end();}
 if(!fs.existsSync(local)){res.writeHead(404);return res.end();}const types={'.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm'};res.setHeader('Content-Type',types[path.extname(local)]||'application/octet-stream');const stream=fs.createReadStream(local);stream.on('error',()=>res.destroy());stream.pipe(res);
 } catch(error) {if(!res.headersSent)res.writeHead(error instanceof SyntaxError?400:500);res.end('Benchmark request failed');console.error(error.message);}
}).listen(8793,'127.0.0.1',()=>console.log('Browser/native comparison ready on 8793'));
