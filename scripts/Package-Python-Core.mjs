import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { details, ANALYSIS_VERSION } from '../src/shared/tagging.mjs';
import { excluded } from '../src/shared/tag-policy.mjs';
const root=path.resolve(import.meta.dirname,'..');
const python=process.env.CAKE_TAGGER_PYTHON||path.join(root,'runtime/python/Scripts/python.exe');
const policy={version:ANALYSIS_VERSION,mapping:JSON.parse(fs.readFileSync(path.join(root,'model/mapping.json'))),details:[...details],manualOnly:[...excluded]};
// The policy and source package contain no model binary, videos or personal state.
const files=['src/server/python_core.py','docs/PYTHON.md','THIRD_PARTY.md','scripts/python-requirements.txt','scripts/assets.json','model/provenance.json','model/LICENSE.txt'];
fs.mkdirSync(path.join(root,'outputs'),{recursive:true});
const output=path.join(root,'outputs/Cake-Tagger-Python-Core.zip');
const script='import json,sys,zipfile,pathlib; r=pathlib.Path(sys.argv[1]); data=json.load(sys.stdin); z=zipfile.ZipFile(sys.argv[2],"w",zipfile.ZIP_DEFLATED); [z.write(r/f,f) for f in data["files"]]; z.writestr("policy.json",json.dumps(data["policy"],indent=2)); z.close()';
const result=spawnSync(python,['-c',script,root,output],{input:JSON.stringify({policy,files}),encoding:'utf8',windowsHide:true});
if(result.status!==0)throw Error(result.stderr||result.error?.message||'Python source packaging failed');
console.log(output);
