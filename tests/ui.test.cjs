const test=require('node:test'),assert=require('node:assert/strict'),ui=require('../panel.js'),preview=require('../preview.js'),catalog=require('../library/catalog.json');
test('all 43 categories and 110 variants remain independently selectable',()=>{const entries=ui.normalizeCatalog(catalog);assert.equal(entries.length,43);assert.equal(new Set(entries.flatMap(e=>e.variants.map(v=>v.id))).size,110);});
test('missing personal audio produces a warning rather than unconditional application success',()=>{
 const result=ui.applyFeedback({missingAudio:['bass-bend-01','transition-basic-05','bass-bend-01'],warnings:['Local sound assets unavailable: bass-bend-01']});
 assert.equal(result.tone,'warning');assert.deepEqual(result.missingAudio,['bass-bend-01','transition-basic-05']);
 assert.match(result.text,/영상/);assert.match(result.text,/효과음 2개/);
 assert.equal(ui.applyFeedback({missingAudio:[],warnings:[]}).tone,'');
 assert.match(ui.applyFeedback({warnings:['Other warning']}).text,/Other warning/);
});
test('personal audio state and a copyable registration example retain explicit missing keys',()=>{
 const detail=ui.audioDetails({audio:{missing:['swoosh-transition-03','swoosh-transition-03'],root:'C:/fixture/UserAudio'}});
 assert.equal(detail.root,'C:/fixture/UserAudio');assert.deepEqual(detail.missing,['swoosh-transition-03']);
 const example=JSON.parse(ui.audioLibraryExample(detail.missing));assert.deepEqual(example,{schemaVersion:1,assets:{'swoosh-transition-03':'swoosh-transition-03.wav'}});
 assert.equal(ui.audioDetails({audio:{missing:[]}}).missing.length,0);
 assert.throws(()=>ui.audioLibraryExample(['../outside']),/오디오 키/);
});
test('inline variant selection preserves the exact selected variant and rejects foreign IDs',()=>{
 const entry=catalog.entries.find(e=>e.name==='Ease Fade Together 3');
 let state=ui.selectVariant({selectedVariants:{}},entry);
 assert.equal(state.selectedId,entry.id);assert.equal(state.selectedVariants[entry.id],'123');assert.equal(state.variantsOpen,entry.id);
 state=ui.selectVariant(state,entry,'125');assert.equal(state.selectedVariants[entry.id],'125');
 assert.equal(ui.selectionPayload(catalog.entries,state,'out').variantId,'125');
 assert.equal(ui.selectionPayload(catalog.entries,state,'out').direction,'out');
 assert.throws(()=>ui.selectVariant(state,entry,'missing'),/변형/);
 assert.throws(()=>ui.selectionPayload(catalog.entries,state,'unknown'),/방향/);
});
test('view all emits one card per variant while retaining a single apply selection',()=>{
 const entry=catalog.entries.find(e=>e.name==='Ease Fade Together 3');
 const state=ui.selectVariant({selectedVariants:{},allVariantsId:entry.id},entry,'125');
 const cards=ui.variantViewItems(catalog.entries,state);
 assert.deepEqual(cards.map(c=>c.variant.id),['125','123']);
 assert.deepEqual(cards.map(c=>c.selected),[true,false]);assert.ok(cards.every(c=>c.isVariant));
 const changed=ui.selectVariant(state,entry,'123');
 assert.deepEqual(ui.variantViewItems(catalog.entries,changed).map(c=>c.selected),[false,true]);
 assert.deepEqual(ui.selectionPayload(catalog.entries,changed,'both'),{variantId:'123',direction:'both'});
});
test('search, category filtering and favorites compose',()=>{const entries=ui.normalizeCatalog(catalog);const shadow=entries.find(e=>e.name.includes('Long Shadow'));assert.equal(ui.filterEntries(entries,'','shadow',true,new Set([shadow.id])).length,1);assert.equal(ui.filterEntries(entries,'','shadow',true,new Set()).length,0);assert.equal(ui.filterEntries(entries,'Titles & Typography','',false,new Set()).length,3);});
test('explicit variant profiles remain finite and preserve measured directions',()=>{const profiles=require('../library/preview-profiles.json').profiles;for(const e of catalog.entries)for(const v of e.variants){assert.ok(profiles[v.id]);for(let t=0;t<3.7;t+=.03){const state=preview.sampleProfile(profiles[v.id],t);assert.ok(state.position.every(Number.isFinite));assert.ok(state.scale.every(Number.isFinite));}}assert.notDeepEqual(profiles['9e6'].samples.in[0],profiles['9e8'].samples.in[0]);});
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
