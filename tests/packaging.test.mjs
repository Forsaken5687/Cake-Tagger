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

test('both extension packages contain integration only and retain notices and provenance',()=>{
 for(const target of ['firefox','chrome']){
  buildExtension(target);
  const root=new URL((target === 'chrome' ? '../outputs/chrome/' : '../work/extension-build/firefox/'),import.meta.url);
  const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',root)));
  assert.equal(manifest.version,JSON.parse(fs.readFileSync(new URL('../extension/'+(target === 'chrome' ? 'manifest.chrome.json' : 'manifest.json'),import.meta.url))).version);
  assert(!manifest.content_scripts.some(script=>script.js.includes('extension/local-bridge.js')));
  assert(!fs.existsSync(new URL('extension/local-bridge.js',root)));
  assert(fs.existsSync(new URL('src/shared/settings-ui.mjs',root)));
  assert(fs.existsSync(new URL('src/shared/trusted-event.mjs',root)));
  assert(manifest.web_accessible_resources[0].resources.includes('extension/bridge.html'));
  for(const file of ['index.html','src/client/app.js','src/client/native-client.mjs','src/client/sampling.mjs','src/shared/tagging.mjs','src/client/integration.mjs','src/client/auto-analysis.mjs','extension/settings-background.mjs'])assert.equal(fs.existsSync(new URL(file,root)),false,file);
  for(const file of ['model/LICENSE.txt','model/provenance.json','vendor/LICENSE-ONNX.txt','vendor/ThirdPartyNotices.txt'])assert.deepEqual(fs.readFileSync(new URL(file,root)),fs.readFileSync(new URL('../'+file,import.meta.url)));
  const assets=JSON.parse(fs.readFileSync(new URL('../scripts/assets.json',import.meta.url)));delete assets.development;
  assert.deepEqual(JSON.parse(fs.readFileSync(new URL('scripts/assets.json',root))),assets);
  assert(!fs.readFileSync(new URL('THIRD_PARTY.md',root),'utf8').includes('Node.js'));
  // Resolve static module imports and literal runtime.getURL references before shipping.
  for(const entry of fs.readdirSync(new URL('extension/',root))){
   if(!/\.(mjs|js)$/.test(entry))continue;
   const file='extension/'+entry, source=fs.readFileSync(new URL(file,root),'utf8');
   for(const match of source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]|getURL\(['"]([^'"]+)['"]\)/g)){
    const relative=match[1]?path.posix.normalize(path.posix.join('extension',match[1])):match[2];
    // Sender comparisons name Firefox's generated page and Chrome's worker even in the other target.
    if(relative === '_generated_background_page.html' || (target === 'firefox' && relative === 'extension/chrome-worker.mjs'))continue;
    assert(fs.existsSync(new URL(relative,root)),file+' -> '+relative);
   }
  }
 }
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
 for(const file of ['Review.cmd','scripts/analyze_reviews.py','scripts/Review.ps1','docs/REVIEW.md','src/client/review.html','src/client/review.css','src/client/review.mjs','src/shared/evaluation.mjs'])assert(!files.has(file),file);
 assert(!files.has('scripts/Test.ps1'));assert(!files.has('scripts/Package.ps1'));assert(!files.has('AGENTS.md'));
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
