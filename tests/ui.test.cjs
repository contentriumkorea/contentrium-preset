const test=require('node:test'),assert=require('node:assert/strict'),ui=require('../panel.js'),preview=require('../preview.js'),catalog=require('../library/catalog.json');
test('all 43 categories and 110 variants remain independently selectable',()=>{const entries=ui.normalizeCatalog(catalog);assert.equal(entries.length,43);assert.equal(new Set(entries.flatMap(e=>e.variants.map(v=>v.id))).size,110);});
test('search, category filtering and favorites compose',()=>{const entries=ui.normalizeCatalog(catalog);const shadow=entries.find(e=>e.name.includes('Long Shadow'));assert.equal(ui.filterEntries(entries,'','shadow',true,new Set([shadow.id])).length,1);assert.equal(ui.filterEntries(entries,'','shadow',true,new Set()).length,0);assert.equal(ui.filterEntries(entries,'Titles & Typography','',false,new Set()).length,3);});
test('all preview phases remain finite and directional variants differ',()=>{for(const e of catalog.entries)for(const v of e.variants)for(let t=0;t<3.7;t+=.03){const state=preview.sample(e,v,t);assert.ok(Number.isFinite(state.progress));assert.ok(state.raw>=0&&state.raw<=1);}const e=catalog.entries.find(e=>e.name==='Ease Fade & Position 2');assert.notDeepEqual(preview.describe(e,e.variants[1]).axis,preview.describe(e,e.variants[2]).axis);});
test('AE calls quote arbitrary user text without code interpolation',()=>{const dangerous='text\\n\" ); throw new Error(1); //';const code=ui.hostScript('setControl',{value:dangerous});assert.ok(code.startsWith('$.contentriumPreset.call('));assert.throws(()=>ui.hostScript('bad);',{}));assert.deepEqual(ui.parseHostResult('{"ok":true,"result":{"saved":true}}'),{saved:true});assert.throws(()=>ui.parseHostResult('{"ok":false,"error":{"message":"failed"}}'),/failed/);});
test('first CEP call loads the installed engine when the host has not loaded ScriptPath',()=>{
 const vm=require('node:vm'),root="C:/Panel user's extension",value='Caption "quoted"\\path',loads=[];
 const context={Folder:function(path){this.fsName=path;},File:function(path){this.fsName=path;},$:{}};
 context.$.evalFile=function(file){loads.push(file.fsName);context.$.contentriumPreset={root,call(method,json){return JSON.stringify({ok:true,result:{method,payload:JSON.parse(json)}});}};};
 const code=ui.hostScript('setControl',{value},root);
 assert.deepEqual(ui.parseHostResult(vm.runInNewContext(code,context)),{method:'setControl',payload:{value}});
 assert.deepEqual(ui.parseHostResult(vm.runInNewContext(code,context)),{method:'setControl',payload:{value}});
 assert.deepEqual(loads,[root+'/jsx/engine.jsx']);
});
