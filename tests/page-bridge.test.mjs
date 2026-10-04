import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/client/page-bridge.mjs',import.meta.url),'utf8').replace('export function','function');
function setup(embedded,parentIsSelf=false){
 const window={addEventListener(){}};
 const parent=parentIsSelf?window:{postMessage(){}};
 const channel='a'.repeat(32);
 const params=new URLSearchParams({integration:'1',channel,bridgeOrigin:'chrome-extension://'+'a'.repeat(32)});
 if(embedded)params.set('embedded','1');
 const context={window,parent,location:{href:'http://127.0.0.1:8765/analysis.html?'+params},URL,Map,setTimeout,clearTimeout};
 vm.createContext(context);vm.runInContext(source,context);return context;
}
test('processing bridge rejects separate windows and the retired integration mode',()=>{
 assert.equal(vm.runInContext('installPageBridge()',setup(false)),false);
 assert.equal(vm.runInContext('installPageBridge()',setup(true,true)),false);
});
test('processing bridge initializes only inside the expected extension frame',()=>{
 const context=setup(true);assert.equal(vm.runInContext('installPageBridge()',context),true);
 assert.equal(context.browser.runtime.id,'local-bridge');
});
