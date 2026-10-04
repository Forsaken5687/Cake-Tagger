import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const specs=[['onnxruntime-node','twhs1C2C/BFkz1yc5OY0KIU2GUq6DURO7hD4bx5Q2Qy3nAMJwRXW8xU3NVczE29VA9lolLOYepoD8fjTGOfIqw=='],['onnxruntime-common','7fdVWjAID1dVhH/G8qK3APARunV4VkBFoCQAP7qp4Wkab0mrorvmc+sqiT+mKXOzDqdjN5j+/Z9nb4gzNPWcyA==']];
for(const [name,integrity] of specs){
 const base='work/native-benchmark/node_modules/'+name;fs.mkdirSync(base,{recursive:true});
 // Reuse only checksum-verified archives. Package lifecycle scripts are never executed.
 const archive='work/native-benchmark/'+name+'.tgz';
 let bytes=fs.existsSync(archive)?fs.readFileSync(archive):null;
 if(!bytes||crypto.createHash('sha512').update(bytes).digest('base64')!==integrity){
  const r=await fetch('https://registry.npmjs.org/'+name+'/-/'+name+'-1.30.0.tgz',{signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('Download failed: '+name);
  bytes=Buffer.from(await r.arrayBuffer());
 }
 if(crypto.createHash('sha512').update(bytes).digest('base64')!==integrity)throw Error('Integrity mismatch');
 fs.writeFileSync(archive,bytes);
 const extracted=spawnSync('C:/Windows/system32/tar.exe',['-xzf',archive,'-C',base,'--strip-components=1'],{stdio:'inherit',windowsHide:true});if(extracted.status!==0)throw Error('Extraction failed');
 console.log(name+'@1.30.0 integrity verified and extracted');
}
