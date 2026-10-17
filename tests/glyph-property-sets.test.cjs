const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const fixture=fs.readFileSync(path.join(__dirname,'animated-font-facade.test.cjs'),'utf8');
const glyphHost=new Function('require','__dirname',fixture.slice(0,fixture.indexOf("test('production registry"))+';return glyphHost;')(require,__dirname);
function setup(){const h=glyphHost();let calls=0,preflights=0;h.modules.cpGlyph.captureControlSet=(l,section)=>({schemaVersion:1,kind:'animated-font-control-set',pack:{id:'owned',digest:'digest'},section,controls:{size:{type:'slider',value:h.controls[l.id][0].value}}});h.modules.cpGlyph.preflightControlSet=(l,d)=>{preflights++;return{changed:d.controls.size.value!==h.controls[l.id][0].value};};h.modules.cpGlyph.applyControlSet=(l,d)=>{calls++;h.controls[l.id][0].value=d.controls.size.value;h.app.project.revision++;return{changed:true};};h.modules.cpGlyph.controlSetsEqual=(l,a,b)=>JSON.stringify(a)===JSON.stringify(b);return Object.assign(h,{counts:()=>({calls,preflights})});}
function request(h,action,more={}){const state=h.call('getState').result;return h.call('propertySetAction',{action,groupKey:state.controlGroups[0].key,context:state.context,expectedRevision:state.projectRevision,...more});}
test('glyph section SaveAs Apply Matching Delete uses one batch and one native Undo group',()=>{
 const h=setup(),s=h.call('getState').result;assert.equal(s.controlGroups[0].canSave,true);const saved=request(h,'saveAs',{name:'Saved'});assert.equal(saved.ok,true,saved.error?.message);assert.equal(request(h,'getAvailablePresets').result.matchingPreset,saved.result.id);
 h.controls[101][0].value=160;assert.equal(request(h,'getAvailablePresets').result.matchingPreset,null);const result=request(h,'apply',{presetId:saved.result.id});assert.equal(result.ok,true,result.error?.message);assert.equal(h.controls[101][0].value,100);assert.equal(h.counts().calls,1);assert.deepEqual(h.events.map(e=>e.kind),['begin','end']);assert.equal(request(h,'getAvailablePresets').result.matchingPreset,saved.result.id);
 assert.equal(request(h,'remove',{presetId:saved.result.id}).ok,true);assert.deepEqual(request(h,'getAvailablePresets').result.presets,[]);assert.equal(h.counts().calls,1);
});
test('glyph settings fail closed for multi-root or mixed selection and locked descriptors',()=>{
 for(const mode of ['two','mixed','locked']){const h=setup();if(mode==='locked')h.controls[101][0].enabled=false;else{h.layers[1].selected=true;if(mode==='two'){h.instances[102]=[{...h.instances[101][0],instanceId:'other'}];h.controls[102]=[{...h.controls[101][0]}];}}const s=h.call('getState').result;assert.equal(s.controls[0].enabled,false);assert.equal(request(h,'saveAs',{name:'No'}).ok,false);assert.equal(h.counts().calls,0);assert.deepEqual(h.events,[]);}
});
test('glyph property set rejects project or selection changes during batch preflight before Undo',()=>{
 for(const mode of ['revision','selection']){const h=setup(),saved=request(h,'saveAs',{name:'Saved'}).result;h.controls[101][0].value=150;h.modules.cpGlyph.preflightControlSet=()=>{if(mode==='revision')h.app.project.revision++;else{h.layers[0].selected=false;h.layers[1].selected=true;}return{changed:true};};const result=request(h,'apply',{presetId:saved.id});assert.equal(result.error.code,mode==='revision'?'STALE_PROJECT':'SELECTION_CHANGED');assert.equal(h.counts().calls,0);assert.deepEqual(h.events,[]);}
});

test('real facade store and glyph adapter integrate all four sections without flattening live timing',()=>{
 const nativeFixture=fs.readFileSync(path.join(__dirname,'animated-font-engine.test.cjs'),'utf8'),nativeHost=new Function('require','__dirname',nativeFixture.slice(0,nativeFixture.indexOf("test('GlyphSavedSections"))+';return harness;')(require,__dirname),n=nativeHost(),root=n.add('A B'),h=setup();
 h.layers.splice(0,h.layers.length,root);root.containingComp=h.comp;root.selected=true;h.comp.frameDuration=1/30;h.comp.frameRate=30;h.modules.cpGlyph=n.api;
 const state=h.call('getState');assert.equal(state.ok,true,state.error?.message);assert.equal(state.result.controlGroups.length,4);assert.ok(state.result.controlGroups.every(g=>g.canSave));
 const saved=[];for(const group of state.result.controlGroups){const r=h.call('propertySetAction',{action:'saveAs',name:group.glyphSection,groupKey:group.key,context:state.result.context});assert.equal(r.ok,true,r.error?.message);saved.push({key:group.key,id:r.result.id,section:group.glyphSection});}
 n.api.setControl(root,'size',150);n.api.setControl(root,'inDelay',.02);n.api.setControl(root,'outSpeed',120);n.api.setControl(root,'offset:2',[10,20]);
 for(const row of saved){const current=h.call('getState').result,args={groupKey:row.key,context:current.context,presetId:row.id},applied=h.call('propertySetAction',{...args,action:'apply'});assert.equal(applied.ok,true,row.section+': '+applied.error?.message);const listing=h.call('propertySetAction',{...args,action:'getAvailablePresets'});assert.equal(listing.result.matchingPreset,row.id,row.section);}
 assert.equal(n.api.getControl(root,'size'),100);assert.deepEqual(JSON.parse(JSON.stringify(n.api.getControl(root,'offset:2'))),[0,0]);assert.equal(h.events.filter(e=>e.kind==='begin').length,4);
});
test('getState uses one optional synchronous glyph snapshot and restores its scope on failure',()=>{
 const h=setup();let entered=0,active=false;const controls=h.modules.cpGlyph.controls;h.modules.cpGlyph.withReadSnapshot=callback=>{entered++;active=true;try{return callback();}finally{active=false;}};h.modules.cpGlyph.controls=layer=>{assert.equal(active,true,'native glyph reads belong to the request scope');return controls(layer);};
 const state=h.call('getState');assert.equal(state.ok,true,state.error?.message);assert.equal(entered,1);assert.equal(active,false);assert.equal(state.result.errors.length,0);
 h.modules.cpGlyph.instances=()=>{throw Error('Native read failed');};h.call('getState');assert.equal(entered,2);assert.equal(active,false);
});
