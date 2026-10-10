import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
function buildExtension(target){
 const result=spawnSync(fileURLToPath(new URL('../runtime/cpython/python.exe',import.meta.url)),[fileURLToPath(new URL('../scripts/build_extension.py',import.meta.url)),target],{encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
}

test('browser packages contain only runtime resources with relocated references',()=>{
 for(const target of ['firefox','chrome']){
  const built=buildExtension(target);
  const root=new URL(target === 'chrome' ? '../outputs/chrome/' : '../work/extension-build/firefox/',import.meta.url);
  const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',root)));
  assert.equal(manifest.version,JSON.parse(fs.readFileSync(new URL('../extension/'+(target === 'chrome' ? 'manifest.chrome.json' : 'manifest.json'),import.meta.url))).version);
  assert.deepEqual(fs.readdirSync(root).sort(),['_locales','app','assets','licenses','manifest.json','README.md','THIRD_PARTY.md'].sort());
  assert.deepEqual(fs.readFileSync(new URL('licenses/JoyTag.txt',root)),fs.readFileSync(new URL('../model/LICENSE.txt',import.meta.url)));
  assert.deepEqual(fs.readFileSync(new URL('assets/tags.txt',root)),fs.readFileSync(new URL('../model/tags.txt',import.meta.url)));
  for(const file of built.files)assert(!/^(src|model|scripts|vendor|extension|runtime)\//.test(file),file);
  const exists=file=>assert(fs.existsSync(new URL(file,root)),file);
  const icons=value=>Object.values(typeof value==='string'?{icon:value}:value||{}).forEach(exists);
  icons(manifest.icons);icons(manifest.action.default_icon);exists(manifest.action.default_popup);
  (manifest.background.scripts||[manifest.background.service_worker]).forEach(exists);
  for(const script of manifest.content_scripts)[...(script.js||[]),...(script.css||[])].forEach(exists);
  for(const resource of manifest.web_accessible_resources)resource.resources.forEach(exists);
  for(const file of built.files.filter(name=>/\.(mjs|js|html|css)$/.test(name))){
   const source=fs.readFileSync(new URL(file,root),'utf8');
   assert(!/(?:extension|src\/shared|model)\//.test(source),file+' contains a source-layout reference');
   for(const match of source.matchAll(/(?:from\s+|import\s*(?:\(\s*)?)['"](\.[^'"]+)['"]|getURL\(['"]([^'"]+)['"]\)/g)){
    const relative=match[1]?path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1])):match[2];
    if(relative === '_generated_background_page.html' || (target === 'firefox' && relative === 'app/chrome-worker.mjs'))continue;
    exists(relative);
   }
   if(file.endsWith('.html'))for(const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/g))exists(path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1])));
  }
 }
});

test('packaged background loads its relocated service and preserves sender checks',async()=>{
 const saved={browser:globalThis.browser,fetch:globalThis.fetch,cakeServer:globalThis.cakeServer,cakeCommands:globalThis.cakeCommands};
 try{
  for(const target of ['firefox','chrome']){
   const root=new URL(target === 'chrome' ? '../outputs/chrome/' : '../work/extension-build/firefox/',import.meta.url);
   let handler;
   globalThis.browser={runtime:{id:'packaging-test',getURL:file=>new URL(file,root).href,onConnect:{addListener(){}},onMessage:{addListener(fn){handler=fn;}}},action:{onClicked:{addListener(){}}}};
   globalThis.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/api/connect')?{token:'a'.repeat(48)}:{initialized:true,language:'en'}),{headers:{'Content-Type':'application/json'}});
   await import(new URL(target==='chrome'?'app/chrome-worker.mjs':'app/background.js',root).href);
   assert.equal(typeof handler,'function');
   const sender={id:'packaging-test',url:new URL('app/bridge.html?embedded=1',root).href};
   const settings=await handler({type:'cake-tagger:settings-get'},sender);
   assert.equal(settings.language,'en');
   assert.equal(handler({type:'cake-tagger:settings-get'},{...sender,url:new URL('extension/bridge.html',root).href}),undefined);
   assert.equal(handler({type:'cake-tagger:settings-get'},{...sender,id:'other-extension'}),undefined);
   const grant=await handler({type:'cake-tagger:register-upload',channel:'b'.repeat(32)},{id:'packaging-test',url:'https://cake.ski/',tab:{id:42}});
   assert(grant);
  }
 }finally{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});

test('release allowlist includes local module dependencies and excludes developer-only sources',()=>{
 const release=JSON.parse(fs.readFileSync(new URL('../scripts/release-files.json',import.meta.url)));
 const files=new Set(release.files);
 for(const name of files){
  assert(!/^(tests|work|data|outputs)\//.test(name));
  assert(!/^extension\/(?:background|content|bridge|chrome-worker|manifest)/.test(name));
  assert(fs.existsSync(new URL('../'+name,import.meta.url)),name);
  if(!/\.(mjs|js)$/.test(name))continue;
  const source=fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
  for(const match of source.matchAll(/(?:from\s+|import\s*(?:\(\s*)?)['"](\.[^'"]+)['"]/g)){
   const dependency=path.posix.normalize(path.posix.join(path.posix.dirname(name),match[1]));
   assert(files.has(dependency),name+' -> '+dependency);
  }
 }
 for(const file of ['Review.cmd','scripts/analyze_reviews.py','docs/REVIEW.md','src/client/review.html','src/client/review.css','src/client/review.mjs','src/shared/evaluation.mjs'])assert(!files.has(file),file);
 assert(!files.has('scripts/test.py'));assert(!files.has('scripts/package.py'));assert(!files.has('AGENTS.md'));
});


test('fresh extension builds exclude old files while preserving unknown contents outside releases',()=>{
 const stale=new URL('../outputs/chrome/obsolete-fixture.mjs',import.meta.url);
 fs.mkdirSync(new URL('../outputs/chrome/',import.meta.url),{recursive:true});
 fs.writeFileSync(stale,'synthetic stale build file');
 const result=buildExtension('chrome');
 assert.equal(fs.existsSync(stale),false);
 assert.equal(fs.readFileSync(path.join(result.previous,'obsolete-fixture.mjs'),'utf8'),'synthetic stale build file');
 const root=new URL('../outputs/chrome/',import.meta.url);
 const actual=fs.readdirSync(root,{recursive:true,withFileTypes:true}).filter(entry=>entry.isFile());
 assert.equal(actual.length,result.files.length);
 for(const name of result.files)assert(fs.existsSync(new URL(name,root)),name);
 for(const file of result.files.filter(name=>/\.(js|mjs)$/.test(name))){
  const source=fs.readFileSync(new URL(file,root),'utf8');
  for(const match of source.matchAll(/(?:from\s+|import\s*(?:\(\s*)?)['"](\.[^'"]+)['"]/g)){
   const dependency=path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1]));
   assert(result.files.includes(dependency),file+' -> '+dependency);
  }
 }
});
