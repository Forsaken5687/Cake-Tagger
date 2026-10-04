import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {buildExtension} from '../scripts/Build-Extension.mjs';

test('both extension packages contain integration only and retain notices and provenance',()=>{
 for(const target of ['firefox','chrome']){
  buildExtension(target);
  const root=new URL((target === 'chrome' ? '../outputs/chrome/' : '../work/extension-build/firefox/'),import.meta.url);
  const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',root)));
  assert.equal(manifest.version,JSON.parse(fs.readFileSync(new URL('../extension/'+(target === 'chrome' ? 'manifest.chrome.json' : 'manifest.json'),import.meta.url))).version);
  assert(manifest.content_scripts.some(script=>script.js.includes('extension/local-bridge.js')));
  assert(manifest.web_accessible_resources[0].resources.includes('extension/bridge.html'));
  for(const file of ['index.html','app.js','native-client.mjs','sampling.mjs','tagging.mjs','extension/integration.mjs','extension/auto-analysis.mjs','extension/settings-background.mjs'])assert.equal(fs.existsSync(new URL(file,root)),false,file);
  for(const file of ['model/LICENSE.txt','model/provenance.json','vendor/LICENSE-ONNX.txt','vendor/ThirdPartyNotices.txt','scripts/assets.json'])assert.deepEqual(fs.readFileSync(new URL(file,root)),fs.readFileSync(new URL('../'+file,import.meta.url)));
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
 assert(!files.has('scripts/Test.ps1'));assert(!files.has('scripts/Package.ps1'));assert(!files.has('AGENTS.md'));
});
