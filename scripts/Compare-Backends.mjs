import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createNativeEngine } from '../src/server/native-engine.mjs';
import { createPythonEngine } from '../src/server/python-engine.mjs';
import { computeCapabilities } from '../src/server/native-policy.mjs';
import { aggregate } from '../src/shared/tagging.mjs';
const folder=process.argv[2],output=process.argv[3];
if(!folder||!output)throw Error('Usage: runtime/node.exe scripts/Compare-Backends.mjs work/frames work/comparison.json');
const files=fs.readdirSync(folder).filter(file=>file.endsWith('.rgba')).sort();
if(!files.length)throw Error('No prepared RGBA files found.');
const root=path.resolve(import.meta.dirname,'..');
if(process.platform==='win32')spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/Process-Policy.ps1'),'-ProcessId',String(process.pid)],{windowsHide:true});
const capabilities=computeCapabilities(),mapping=JSON.parse(fs.readFileSync(path.join(root,'model/mapping.json')));
const engines={node:createNativeEngine({capabilities}),python:createPythonEngine({capabilities})};
function input(file){const bytes=fs.readFileSync(path.join(folder,file));if(!bytes.length||bytes.length%802816)throw Error('Invalid prepared input');return Array.from({length:bytes.length/802816},(_,i)=>Uint8ClampedArray.from(bytes.subarray(i*802816,(i+1)*802816)));}
const runs=[],cold={};
try{
 for(const [name,engine] of Object.entries(engines)){const start=performance.now();const result=await engine.infer(input(files[0]),'auto');cold[name]={seconds:(performance.now()-start)/1000,timings:result.timings,runtime:result.runtime};console.log(name+' warmup complete');}
 for(let round=0;round<3;round++)for(const file of files){
  const pair={round,file,inputSha256:createHash('sha256').update(fs.readFileSync(path.join(folder,file))).digest('hex')};
  for(const name of round%2?['python','node']:['node','python']){
   const start=performance.now(),result=await engines[name].infer(input(file),'auto');
   pair[name]={seconds:(performance.now()-start)/1000,timings:result.timings,runtime:result.runtime,analysis:result.analysis??aggregate(result.scores,mapping,.4,'majority')};
   pair[name].scores=result.scores;
  }
  let maxDifference=0,differentScores=0;
  for(let i=0;i<pair.node.scores.length;i++)for(let j=0;j<5813;j++){const delta=Math.abs(pair.node.scores[i][j]-pair.python.scores[i][j]);if(delta)differentScores++;maxDifference=Math.max(maxDifference,delta);}
  const decisions=result=>JSON.stringify({tags:result.analysis.tags.map(x=>[x.tag,x.supportingFrames]),uncertain:result.analysis.uncertainScores.map(x=>[x.tag,x.supportingFrames])});
  pair.maxScoreDifference=maxDifference;pair.differentScores=differentScores;pair.sameTagDecisions=decisions(pair.node)===decisions(pair.python);
  delete pair.node.scores;delete pair.python.scores;runs.push(pair);console.log('round '+(round+1)+' / '+file+': Node '+pair.node.seconds.toFixed(3)+'s; Python '+pair.python.seconds.toFixed(3)+'s; max delta '+maxDifference);
 }
 const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
 const summary=Object.fromEntries(['node','python'].map(name=>[name,{medianVideoSeconds:median(runs.map(row=>row[name].seconds)),medianInferenceSeconds:median(runs.map(row=>row[name].timings.inferenceSeconds)),totalVideoSeconds:runs.reduce((sum,row)=>sum+row[name].seconds,0)}]));
 const report={createdAt:new Date().toISOString(),framesPerVideo:input(files[0]).length,capabilities,cold,summary,maxScoreDifference:Math.max(...runs.map(row=>row.maxScoreDifference)),allTagDecisionsMatch:runs.every(row=>row.sameTagDecisions),runs};
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({...summary,allTagDecisionsMatch:report.allTagDecisionsMatch,maxScoreDifference:report.maxScoreDifference}));
 if(!report.allTagDecisionsMatch||report.maxScoreDifference>1e-6)process.exitCode=1;
}finally{await Promise.all(Object.values(engines).map(engine=>engine.stop()));}
