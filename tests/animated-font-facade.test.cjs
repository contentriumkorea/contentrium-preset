const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sourcePath = path.resolve(__dirname, '../jsx/engine.jsx');
const source = fs.readFileSync(sourcePath, 'utf8');
// Share the established AE facade harness without registering its tests twice.
const fixture = fs.readFileSync(path.join(__dirname, 'engine.test.cjs'), 'utf8');
const harness = fixture.slice(fixture.indexOf('function host('), fixture.indexOf("test('read-only state exposes"));
const host = new Function('source','sourcePath','fs','path','vm','assert','__dirname',harness+';return host;')(source,sourcePath,fs,path,vm,assert,__dirname);
function glyphHost(options={}) {
 const controls={101:[{id:'size',name:'Size',type:'slider',value:100,group:'Font',actions:['reset']}]};
 const h=host({controls,...options}), instances={101:[{instanceId:'glyph-1',kind:'animated-font',name:'Owned font',pack:{id:'owned',digest:'digest'},controls:{size:100},rootInputs:{color:{index:2}}}]};
 const error=(code)=>Object.assign(Error(code),{code});
 const writes=[];
 h.modules.cpGlyph={instances:l=>instances[l.id]||[],controls:l=>(controls[l.id]||[]).map(x=>({...x})),getControl:(l,id)=>controls[l.id].find(x=>x.id===id).value,
 preflight(c,o){if(o.fontId!=='owned'||o.fontHash!=='digest')throw error('GLYPH_PACK_UNAVAILABLE');if(!o.text)throw error('INVALID_GLYPH_TEXT');return{options:o};},
 apply(c,p){writes.push(['apply',p]);h.app.project.revision++;const l={id:501,selected:false,name:'Glyph',containingComp:c};h.layers.unshift(l);instances[501]=[{...instances[101][0],instanceId:'glyph-501'}];return{instanceId:'glyph-501',rootLayerId:501,sourceId:502,kind:'animated-font'};},
 preflightControl(l,id,v){if(v<1)throw error('CONTROL_VALUE');return{changed:v!==this.getControl(l,id)};},
 preflightReset(){return{changed:true,sideEffects:false};},
 setControl(l,id,v){writes.push(['set',l.id,id,v]);controls[l.id].find(x=>x.id===id).value=v;h.app.project.revision++;},
 reset(l,{controlId}){return this.setControl(l,controlId,100);},
 serialize(l){return{schemaVersion:1,kind:'animated-font',pack:{id:'owned',digest:'digest'},text:'AB',controls:{size:this.getControl(l,'size')},timeline:{inPoint:0,inMarker:1,outMarker:3,outPoint:4}};},
 restore(c,d,o){writes.push(['restore',d,o]);return this.apply(c,{options:{fontId:d.pack.id,fontHash:d.pack.digest,text:d.text}});}};
 return Object.assign(h,{writes,instances,controls});
}
function args(h,more={}){const s=h.call('getState').result;return{context:s.context,expectedRevision:s.projectRevision,...more};}
test('production registry is empty, no public pack injection, unavailable Add writes nothing',()=>{
 const h=host(),s=h.call('hostStatus');assert.equal(s.ok,true,s.error?.message);assert.deepEqual(s.result.animatedFonts.available,[]);assert.deepEqual(s.result.animatedFonts.capabilities,{add:false});assert.ok(s.result.methods.includes('addAnimatedFont'));assert.ok(!s.result.methods.some(x=>/pack|register|install/i.test(x)));
 const r=h.call('addAnimatedFont',args(h,{fontId:'private-ab',fontHash:'private',text:'AB'}));assert.equal(r.error.code,'GLYPH_PACK_UNAVAILABLE');assert.deepEqual(h.events,[]);
});
test('Add validates context, revision and exact font before Undo, then selects root in one group',()=>{
 const h=glyphHost(),a=args(h,{fontId:'owned',fontHash:'digest',text:'AB'});
 for(const delta of [{context:null},{context:{...a.context,projectToken:'stale'}},{expectedRevision:0},{fontHash:'other'},{fontId:'other'}]){assert.equal(h.call('addAnimatedFont',{...a,...delta}).ok,false);assert.deepEqual(h.events,[]);assert.deepEqual(h.writes,[]);}
 const r=h.call('addAnimatedFont',a);assert.equal(r.ok,true,r.error?.message);assert.equal(r.result.kind,'animated-font');assert.equal(r.result.wantsRevealEditTab,true);assert.deepEqual(h.comp.selectedLayers.map(l=>l.id),[501]);assert.deepEqual(h.events.map(x=>x.kind),['begin','end']);assert.equal(h.writes[0][1].options.atTime,1.25);
});
test('glyph state routes local controls and disables unconnected property sets and instance mutations',()=>{
 const h=glyphHost(),s=h.call('getState').result;assert.equal(s.applied[0].kind,'animated-font');assert.deepEqual(s.applied[0].actions,['copy']);assert.equal(s.precompApplyOptions.canReplace,false);assert.equal(s.controls[0].id,'animated-font:101:size');assert.ok(s.controlGroups[0].key.includes('digest'));assert.equal(s.controlGroups[0].canSave,false);assert.deepEqual(s.controlGroups[0].actions,[]);
 for(const action of ['remove','reset','upgradeTimeline'])assert.equal(h.call('presetAction',args(h,{action})).ok,false);
 assert.equal(h.call('propertySetAction',args(h,{groupKey:s.controlGroups[0].key,action:'saveAs',name:'bad'})).ok,false);assert.deepEqual(h.events,[]);
});
test('control no-op, stale writes, preflight rejection and gesture lifecycle use existing guards',()=>{
 const h=glyphHost(),s=h.call('getState').result,a={id:s.controls[0].id,...args(h)};
 assert.equal(h.call('setControl',{...a,value:100}).result.changedControls,0);assert.deepEqual(h.events,[]);
 assert.equal(h.call('setControl',{...a,expectedRevision:0,value:120}).ok,false);assert.equal(h.call('setControl',{...a,value:0}).ok,false);assert.deepEqual(h.writes,[]);
 assert.equal(h.call('setControl',{...a,value:120,undoGroupId:'glyph-drag'}).ok,true);
 assert.equal(h.call('setControl',{...a,expectedRevision:h.app.project.revision,value:140,undoGroupId:'glyph-drag'}).ok,true);assert.equal(h.undoStack.length,1);assert.equal(h.controls[101][0].value,140);assert.equal(h.call('endUndoGroup',{undoGroupId:'glyph-drag'}).ok,true);
});
test('glyph apply/control failures preserve adapter rollbackError without native Undo or failed write retry',()=>{
 for(const operation of ['add','control']){const h=glyphHost(),e=Object.assign(Error('failed'),{code:'GLYPH_FAILURE',rollbackError:'owned rollback failed'});let n=0;
 if(operation==='add')h.modules.cpGlyph.apply=()=>{n++;h.app.project.revision++;throw e;};else h.modules.cpGlyph.setControl=()=>{n++;h.app.project.revision++;throw e;};
 const options=args(h,operation==='add'?{fontId:'owned',fontHash:'digest',text:'AB'}:{id:h.call('getState').result.controls[0].id,value:130});const r=h.call(operation==='add'?'addAnimatedFont':'setControl',options);assert.equal(r.error.code,'GLYPH_FAILURE');assert.equal(r.error.rollbackError,'owned rollback failed');assert.equal(n,1);assert.ok(!h.events.some(x=>x.kind==='undo'));}
});
test('copy, paste and library save retain animated-font serialization; generic Replace rejects glyph',()=>{
 const h=glyphHost();h.modules.cpWorkspace.savePreset=(o,data)=>({data});
 assert.equal(h.call('presetAction',args(h,{action:'copy'})).result.copied,1);assert.equal(h.modules.cpFacadeSession.clipboard[0].kind,'animated-font');
 const saved=h.call('saveLibraryPreset',args(h,{name:'Owned'}));assert.equal(saved.result.data.kind,'animated-font');
 const pasted=h.call('presetAction',args(h,{action:'paste'}));assert.equal(pasted.ok,true,pasted.error?.message);assert.equal(h.writes[0][0],'restore');assert.equal(h.writes[0][2].atTime,h.comp.time);
 const k=glyphHost();assert.equal(k.call('applyPreset',args(k,{variantId:'pc-fixture',replaceSelected:true})).ok,false);assert.deepEqual(k.events,[]);
});
test('post-preflight selection and revision changes reject Add even with optional revision omitted',()=>{
 for(const changed of ['selection','revision']){const h=glyphHost(),a=args(h,{fontId:'owned',fontHash:'digest',text:'AB'});delete a.expectedRevision;const original=h.modules.cpGlyph.preflight;h.modules.cpGlyph.preflight=(...v)=>{const p=original(...v);if(changed==='selection'){h.layers[0].selected=false;h.layers[1].selected=true;}else h.app.project.revision++;return p;};const r=h.call('addAnimatedFont',a);assert.equal(r.error.code,changed==='selection'?'SELECTION_CHANGED':'STALE_PROJECT');assert.deepEqual(h.writes,[]);assert.deepEqual(h.events,[]);}
});
test('unavailable/shared/locked glyph descriptors remain readable and block setters/reset without Undo',()=>{
 for(const code of ['GLYPH_PACK_UNAVAILABLE','GLYPH_SOURCE_SHARED','LAYER_LOCKED']){const h=glyphHost();h.controls[101][0]={...h.controls[101][0],enabled:false,readOnlyCode:code,readOnlyReason:'Unavailable graph',actions:[]};const s=h.call('getState').result;assert.equal(s.applied[0].kind,'animated-font');assert.equal(s.controls[0].enabled,false);assert.deepEqual(s.controls[0].actions,[]);assert.equal(h.call('setControl',args(h,{id:s.controls[0].id,value:150})).error.code,code);assert.equal(h.call('propertyAction',args(h,{id:s.controls[0].id,action:'reset'})).ok,false);assert.equal(h.call('presetAction',args(h,{action:'copy'})).ok,true);assert.deepEqual(h.writes,[]);assert.deepEqual(h.events,[]);}
});
test('binding errors remain visible and polls do not repair or capture glyph as user preset',()=>{
 const h=glyphHost();h.modules.cpGlyph.controls=()=>{throw Object.assign(Error('Changed binding'),{code:'GLYPH_BINDING_CHANGED'});};h.modules.cpGlyph.serialize=()=>{throw Object.assign(Error('Changed binding'),{code:'GLYPH_BINDING_CHANGED'});};h.modules.cpUserPreset.capture=()=>{throw Error('Must not capture glyph');};
 for(let i=0;i<2;i++){const s=h.call('getState').result;assert.equal(s.applied[0].kind,'animated-font');assert.equal(s.errors[0].code,'GLYPH_BINDING_CHANGED');assert.equal(s.controls.length,0);}assert.equal(h.call('saveLibraryPreset',args(h)).error.code,'GLYPH_BINDING_CHANGED');assert.deepEqual(h.events,[]);
});
test('per-control Reset reaches the glyph handler and hidden compound reset cannot dispatch',()=>{
 const h=glyphHost();h.controls[101][0].value=150;const s=h.call('getState').result;assert.equal(h.call('propertyAction',args(h,{id:s.controls[0].id,action:'reset'})).ok,true);assert.deepEqual(h.writes,[['set',101,'size',100]]);
});
test('real catalog keeps private glyph fixtures absent and existing public counts unchanged',()=>{
 const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../library/catalog.json'),'utf8'));assert.equal(catalog.entries.length,43);assert.equal(catalog.entries.reduce((n,e)=>n+e.variants.length,0),110);assert.ok(!JSON.stringify(catalog).includes('private-independent-ab'));assert.ok(!catalog.entries.some(e=>e.variants.some(v=>v.kind==='animated-font')));
});
test('library import restores glyph kind without generic capture and Replace fails before restore',()=>{
 const h=glyphHost(),data=h.modules.cpGlyph.serialize(h.layers[0]);h.modules.cpWorkspace.find=()=>({id:'saved',kind:'preset'});h.modules.cpWorkspace.readPreset=()=>data;
 assert.equal(h.call('replaceLibraryItem',args(h,{id:'saved'})).ok,false);assert.deepEqual(h.writes,[]);assert.deepEqual(h.events,[]);
 const r=h.call('importLibraryItem',args(h,{id:'saved'}));assert.equal(r.ok,true,r.error?.message);assert.equal(h.writes[0][0],'restore');assert.deepEqual(h.events.map(x=>x.kind),['begin','end']);
});
test('multiple glyph targets are read-only before native writes until exact multi-root transactions exist',()=>{
 for(const mixed of [false,true]){const h=glyphHost();h.layers[1].selected=true;h.instances[102]=[{...h.instances[101][0],instanceId:'glyph-2'}];h.controls[102]=[{...h.controls[101][0],value:mixed?120:100}];const s=h.call('getState').result,d=s.controls[0];assert.equal(s.controls.length,1);assert.equal(d.enabled,false);assert.equal(d.mixed,mixed);assert.equal(d.readOnlyCode,'GLYPH_MULTI_EDIT_UNAVAILABLE');assert.deepEqual(d.actions,[]);assert.match(d.readOnlyReason,/one animated-font root/);assert.equal(h.call('setControl',args(h,{id:d.id,value:180})).error.code,'GLYPH_MULTI_EDIT_UNAVAILABLE');assert.equal(h.call('propertyAction',args(h,{id:d.id,action:'reset'})).ok,false);assert.deepEqual(h.writes,[]);assert.deepEqual(h.events,[]);}
});
function ownedColor(id,layerId=101,owned=true){return{id,type:'color',semantic:'selected-layer-color',value:[1,.5,.25],layerId,compId:88,canSet:true,field:'property',path:[{index:3,matchName:'ADBE Effect Parade',name:'Effects'},{index:owned?2:3,matchName:'ADBE Color Control',name:owned?'cpAF color':'User Color'},{index:1,matchName:'ADBE Color Control-0001',name:'Color'}]};}
test('owned glyph effects and direct glyph colors never enter generic color or palette write routes',()=>{
 for(const blocked of [false,true]){const rows=[ownedColor('native-owned'),ownedColor('user-color',101,false)],h=glyphHost({colorRows:rows});h.controls[101].push({id:'color',name:'Color',type:'color',value:[1,.5,.25],group:'Font',actions:['reset'],enabled:!blocked,readOnlyCode:blocked?'GLYPH_PACK_UNAVAILABLE':null});
 const s=h.call('getState').result;assert.ok(!s.controls.some(d=>d.id==='native-owned'));assert.ok(!s.paletteCandidates.some(d=>d.id==='native-owned'||d.id==='animated-font:101:color'));assert.ok(s.paletteCandidates.some(d=>d.id==='user-color'));
 assert.equal(h.call('setControl',args(h,{id:'native-owned',value:[0,0,0]})).ok,false);
 for(const id of ['native-owned','animated-font:101:color'])assert.equal(h.call('paletteAction',args(h,{action:'define',slots:[{slotKey:'owned',controlId:id}]})).ok,false);
 assert.deepEqual(h.events,[]);assert.deepEqual(h.writes,[]);
 const user=h.call('setControl',args(h,{id:s.controls.find(d=>d.semantic==='selected-layer-color').id,value:[.2,.3,.4]}));assert.equal(user.ok,true,user.error?.message);assert.deepEqual(rows[1].value,[.2,.3,.4]);assert.deepEqual(rows[0].value,[1,.5,.25]);}
});
test('missing owned marker survives polling as explicit narrow Reset recovery and never repairs on read',()=>{
 const h=glyphHost();h.modules.cpGlyph.controls=()=>{throw Object.assign(Error('Missing owned marker'),{code:'GLYPH_MARKER_MISSING'});};let resets=0;h.modules.cpGlyph.reset=(l,o)=>{assert.equal(l.id,101);assert.deepEqual(JSON.parse(JSON.stringify(o)),{controlId:'inEnabled'});resets++;h.app.project.revision++;};
 let descriptor;for(let i=0;i<2;i++){const s=h.call('getState').result;assert.equal(s.errors[0].code,'GLYPH_MARKER_MISSING');descriptor=s.controls.find(d=>d.semantic==='animated-font-marker-recovery');assert.ok(descriptor,'missing marker must retain an explicit recovery descriptor');assert.deepEqual(descriptor.actions,['reset']);}assert.deepEqual(h.events,[]);assert.equal(resets,0);
 const r=h.call('propertyAction',args(h,{id:descriptor.id,action:'reset'}));assert.equal(r.ok,true,r.error?.message);assert.equal(resets,1);assert.deepEqual(h.events.map(x=>x.kind),['begin','end']);
});
test('marker recovery exposes no action when preflight rejects and stale/failed recovery never retries native history',()=>{
 for(const code of ['GLYPH_PACK_UNAVAILABLE','GLYPH_SOURCE_SHARED','LAYER_LOCKED','GLYPH_BINDING_CHANGED','TIMELINE_COLLISION']){const h=glyphHost();h.modules.cpGlyph.controls=()=>{throw Object.assign(Error('Missing'),{code:'GLYPH_MARKER_MISSING'});};h.modules.cpGlyph.preflightReset=()=>{throw Object.assign(Error(code),{code});};const s=h.call('getState').result,d=s.controls.find(x=>x.semantic==='animated-font-marker-recovery');assert.equal(d.enabled,false);assert.equal(d.readOnlyCode,code);assert.deepEqual(d.actions,[]);assert.equal(h.call('propertyAction',args(h,{id:d.id,action:'reset'})).error.code,code);assert.deepEqual(h.events,[]);assert.deepEqual(h.writes,[]);}
 const h=glyphHost();h.modules.cpGlyph.controls=()=>{throw Object.assign(Error('Missing'),{code:'GLYPH_MARKER_MISSING'});};const d=h.call('getState').result.controls.find(x=>x.semantic==='animated-font-marker-recovery'),a=args(h,{id:d.id,action:'reset'});assert.equal(h.call('propertyAction',{...a,expectedRevision:0}).error.code,'STALE_PROJECT');assert.deepEqual(h.events,[]);let resets=0;h.modules.cpGlyph.reset=()=>{resets++;h.app.project.revision++;throw Object.assign(Error('Reset failed'),{code:'GLYPH_FAILURE',rollbackError:'Owned rollback failure'});};const r=h.call('propertyAction',a);assert.equal(r.error.code,'GLYPH_FAILURE');assert.equal(r.error.rollbackError,'Owned rollback failure');assert.equal(resets,1);assert.deepEqual(h.events.map(x=>x.kind),['begin','end']);
});
test('owned Essential Properties and persisted owned-color palette mappings cannot bypass glyph guards',()=>{
 const row=ownedColor('native-ep');row.path[0]={index:6,matchName:'Native EP group',name:'Essential Properties'};const h=glyphHost({colorRows:[row]});h.layers[0].essentialProperty={matchName:'Native EP group'};const s=h.call('getState').result;assert.ok(!s.controls.some(x=>x.id==='native-ep'));h.modules.cpFacadeSession.paletteScopes.push({id:'palette:legacy',context:JSON.stringify(s.context),revision:s.projectRevision,slots:[{slotKey:'owned',controlId:'native-ep'}],defaults:[[1,.5,.25]],key:'explicit-slots:owned'});assert.equal(h.call('paletteAction',args(h,{id:'palette:legacy',action:'reset'})).error.code,'PALETTE_SLOT_CHANGED');assert.deepEqual(h.events,[]);
 const k=glyphHost();k.layers[1].selected=true;k.instances[102]=[{...k.instances[101][0],instanceId:'glyph-2'}];for(const id of [101,102])k.controls[id]=[{id:'color',name:'Color',type:'color',group:'Font',value:[1,.5,.25],actions:['reset']}];const multi=k.call('getState').result;assert.equal(multi.controls[0].readOnlyCode,'GLYPH_MULTI_EDIT_UNAVAILABLE');assert.deepEqual(multi.paletteCandidates,[]);
});
test('malformed ownership fails closed for generic owned-root colors',()=>{
 const h=glyphHost({colorRows:[ownedColor('native-owned')]});delete h.instances[101][0].rootInputs;const s=h.call('getState').result;assert.ok(!s.controls.some(d=>d.id==='native-owned'));assert.ok(!s.paletteCandidates.some(d=>d.id==='native-owned'));assert.equal(h.call('setControl',args(h,{id:'native-owned',value:[0,0,0]})).ok,false);assert.deepEqual(h.events,[]);
});
test('live glyph binding failure after effect reorder/insertion blocks moved colors and stale-index occupants',()=>{
 for(const mode of ['reorder','insertion']){const moved=ownedColor('moved-owned'),occupant=ownedColor('old-index-user',101,false),other=ownedColor('other-layer-user',102,false);moved.path[1].index=3;occupant.path[1].index=2;const rows=[moved,occupant,other],effects=mode==='reorder'?['Other','User Color','cpAF color']:['Other','Inserted User Color','cpAF color','User Color'];if(mode==='insertion'){occupant.path[1].name='Inserted User Color';const priorUser=ownedColor('shifted-existing-user',101,false);priorUser.path[1].index=4;rows.push(priorUser);}const h=glyphHost({colorRows:rows,selected:[1,2]}),original=h.modules.cpGlyph.controls;let graphReads=0;h.modules.cpGlyph.controls=function(layer){graphReads++;if(layer.id===101&&effects[h.instances[101][0].rootInputs.color.index-1]!=='cpAF color')throw Object.assign(Error(mode+' changed native binding'),{code:'GLYPH_BINDING_CHANGED'});return original(layer);};
 const s=h.call('getState').result;assert.equal(s.errors[0].code,'GLYPH_BINDING_CHANGED');assert.ok(graphReads>0);assert.ok(!s.controls.some(d=>d.semantic==='selected-layer-color'&&d.id==='moved-owned'),mode);assert.ok(!s.paletteCandidates.some(d=>d.id==='moved-owned'||d.id==='old-index-user'),mode+' must fail closed for the unverified glyph root');assert.ok(s.paletteCandidates.some(d=>d.id==='other-layer-user'),'unrelated layer remains editable');
 for(const id of ['moved-owned','old-index-user']){assert.equal(h.call('setControl',args(h,{id,value:[0,0,0]})).ok,false);assert.equal(h.call('paletteAction',args(h,{action:'define',slots:[{slotKey:'owned',controlId:id}]})).ok,false);}assert.deepEqual(h.events,[]);assert.deepEqual(h.writes,[]);assert.deepEqual(moved.value,[1,.5,.25]);}
});
test('persisted palettes cannot write moved owned glyph inputs or stale old-index properties',()=>{
 for(const target of ['moved-owned','old-index-user']){const moved=ownedColor('moved-owned'),occupant=ownedColor('old-index-user',101,false);moved.path[1].index=3;occupant.path[1].index=2;const h=glyphHost({colorRows:[moved,occupant]}),s=h.call('getState').result;h.modules.cpGlyph.controls=()=>{throw Object.assign(Error('Moved root input'),{code:'GLYPH_BINDING_CHANGED'});};h.modules.cpFacadeSession.paletteScopes.push({id:'palette:legacy-moved',context:JSON.stringify(s.context),revision:s.projectRevision,slots:[{slotKey:'owned',controlId:target}],defaults:[[0,0,0]],key:'explicit-slots:owned'});const r=h.call('paletteAction',args(h,{id:'palette:legacy-moved',action:'reset'}));assert.equal(r.ok,false,target);assert.equal(r.error.code,'PALETTE_SLOT_CHANGED',target);assert.deepEqual(h.events,[]);assert.deepEqual(h.writes,[]);assert.deepEqual(moved.value,[1,.5,.25]);assert.deepEqual(occupant.value,[1,.5,.25]);}
});
test('generic color write revalidates the live glyph graph after preflight before native write',()=>{
 const rows=[ownedColor('native-owned'),ownedColor('user-color',101,false)],h=glyphHost({colorRows:rows}),s=h.call('getState').result,id=s.controls.find(d=>d.semantic==='selected-layer-color').id;h.modules.cpColors.preflight=()=>{h.modules.cpGlyph.controls=()=>{throw Object.assign(Error('Effect inserted during preflight'),{code:'GLYPH_BINDING_CHANGED'});};};const r=h.call('setControl',args(h,{id,value:[0,0,0]}));assert.equal(r.ok,false);assert.equal(r.error.code,'GLYPH_COLOR_ROUTE_UNAVAILABLE');assert.ok(!h.events.some(e=>e.kind==='colorSet'||e.kind==='undo'));assert.deepEqual(rows.map(row=>row.value),[[1,.5,.25],[1,.5,.25]]);assert.deepEqual(h.writes,[]);
});
test('existing editor renders comment recovery Reset and forwards captured context/revision',async()=>{
 class Element{constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.classList={add(){}};}appendChild(child){this.children.push(child);return child;}setAttribute(){}querySelectorAll(){return [];}set textContent(v){this.text=v;this.children=[];}get textContent(){return this.text||'';}}
 const context={document:{createElement:tag=>new Element(tag)},setTimeout,clearTimeout,Promise,Set,Uint32Array};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../ui-core.js'),'utf8'),context);vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../ui-editor.js'),'utf8'),context);
 const h=glyphHost();h.modules.cpGlyph.controls=()=>{throw Object.assign(Error('Missing'),{code:'GLYPH_MARKER_MISSING'});};const state=h.call('getState').result,root=new Element('div'),calls=[],editor=context.ContentriumEditor.create({root,selection:new Element('div'),applied:new Element('div'),supports:()=>false,status(){},refresh(){},call(method,payload){calls.push({method,payload});return Promise.resolve({});}});editor.render(state);
 const all=n=>[n,...n.children.flatMap(all)],recovery=all(root).find(n=>n.dataset.controlId?.startsWith('animated-font-marker-recovery:')),button=all(recovery).find(n=>n.tagName==='button');assert.ok(button);assert.equal(button.disabled,false);button.onclick();await Promise.resolve();await Promise.resolve();assert.equal(calls[0].method,'propertyAction');assert.equal(calls[0].payload.action,'reset');assert.equal(calls[0].payload.expectedRevision,state.projectRevision);assert.deepEqual(JSON.parse(JSON.stringify(calls[0].payload.context)),state.context);
});
