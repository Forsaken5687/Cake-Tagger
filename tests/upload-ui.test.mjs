import test from 'node:test';
import assert from 'node:assert/strict';
import {validUploadView} from '../extension/upload-ui.mjs';
test('upload UI snapshots accept tag metadata and reject malformed input',()=>{
 const view={language:'de',settings:{showUncertain:true},status:'Ready',message:'',allTags:['tattoos'],entries:[{filename:'video.m4v',sha256:'a'.repeat(64),state:'Ready',complete:true,tags:[{tag:'tattoos',selected:true,source:'suggestion',confidence:.8}]}]};
 assert(validUploadView(view));assert(!validUploadView({...view,language:'unsafe'}));assert(!validUploadView({...view,entries:[{...view.entries[0],tags:[{tag:'tattoos',selected:'yes'}]}]}));assert(!validUploadView({...view,allTags:Array(259).fill('tattoos')}));
});
