const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.resolve(__dirname, '../jsx/engine.jsx');
const source = fs.readFileSync(sourcePath, 'utf8');

test('history commands are advertised only on the verified AE major and issue one ungrouped native command',()=>{
 const h=host(),commands=[];h.app.executeCommand=id=>{commands.push(id);h.app.project.revision++;};
 assert.ok(h.call('hostStatus').result.methods.includes('undo'));assert.ok(h.call('hostStatus').result.methods.includes('redo'));
 for(const [method,id] of [['undo',16],['redo',2035]]){const s=h.call('getState').result,r=h.call(method,{context:s.context,expectedRevision:s.projectRevision,requestId:'history-'+method});assert.equal(r.ok,true,r.error?.message);assert.equal(r.result.commandIssued,true);assert.equal(r.result.beforeRevision,s.projectRevision);assert.equal(commands.at(-1),id);}
 assert.deepEqual(h.events,[],'history must not open another Undo group');
 h.app.version='25.0';assert.ok(!h.call('hostStatus').result.methods.includes('redo'));assert.equal(h.call('undo',{}).error.code,'HISTORY_UNAVAILABLE');
});

test('history rejects missing or changed context, revision and request identity before executing',()=>{
 const h=host(),s=h.call('getState').result;let commands=0;h.app.executeCommand=()=>commands++;
 const args={context:s.context,expectedRevision:s.projectRevision,requestId:'history-guard'};
 for(const [change,code]of [[{context:null},'CONTEXT_REQUIRED'],[{context:{...s.context,projectToken:'different'}},'SELECTION_CHANGED'],[{expectedRevision:0},'STALE_PROJECT'],[{expectedRevision:null},'STALE_PROJECT'],[{requestId:null},'INVALID_HISTORY_REQUEST'],[{requestId:'__proto__'},'INVALID_HISTORY_REQUEST']])assert.equal(h.call('undo',{...args,...change}).error.code,code);
 assert.equal(commands,0);
});

test('a history request is consumed before native execution even when native execution throws or changes no revision',()=>{
 for(const throws of [true,false]){const h=host(),s=h.call('getState').result;let count=0;h.app.executeCommand=()=>{count++;if(throws)throw Error('native failure');};const args={context:s.context,expectedRevision:s.projectRevision,requestId:'history-once'};const first=h.call('undo',args);assert.equal(first.ok,!throws);assert.equal(h.call('undo',args).error.code,'HISTORY_ALREADY_ISSUED');assert.equal(count,1);}
});

test('history supports project-only context and invalidates unfinished coalesced gestures',()=>{
 const h=host({active:false}),s=h.call('getState').result;h.modules.cpFacadeSession.gestures.owned={lastValues:[20],revision:1};h.app.executeCommand=()=>h.app.project.revision++;
 const result=h.call('undo',{context:s.context,expectedRevision:s.projectRevision,requestId:'history-project'});assert.equal(result.ok,true,result.error?.message);assert.deepEqual(Object.keys(h.modules.cpFacadeSession.gestures),[]);
});

test('media dialog retains its captured comp when Project selection becomes active',()=>{
 const mediaRows=[{layerId:301,layerIndex:2,name:'Sound',itemId:401,type:'FootageItem',mediaKind:'audio',canReplace:true}],h=host({mediaRows,instances:{101:[{instanceId:'owned',variantId:'pc-fixture'}]}}),state=h.call('getState').result;
 assert.equal(state.mediaRoots[0].rootLayerId,101);assert.deepEqual(state.mediaRoots[0].media,mediaRows);
 h.app.project.activeItem={id:402};h.app.project.selection=[{id:402,name:'Replacement',type:'FootageItem',mediaKind:'audio'}];
 const args={action:'context',rootLayerId:101,layerId:301,context:state.context},reply=h.call('mediaAction',args);
 assert.equal(reply.ok,true);assert.equal(reply.result.canReplace,true);assert.deepEqual(reply.result.projectSelection,h.app.project.selection);assert.equal(reply.result.selectedBinding.itemId,401);assert.deepEqual(h.events,[]);
 const replaced=h.call('mediaAction',{...args,action:'replaceSelected',bindingContext:reply.result.bindingContext});assert.equal(replaced.ok,true);assert.equal(replaced.result.replaced,true);assert.deepEqual(h.events.map(x=>x.kind),['begin','replaceMedia','end']);assert.equal(h.events[1].options.undoGroup,false);
});
test('media writes reject missing capture, changed project, changed layer, and changed Project candidate',()=>{
 const h=host({mediaRows:[{layerId:301,itemId:401}],instances:{101:[{instanceId:'owned',variantId:'pc-fixture'}]}}),context=h.call('getState').result.context,args={action:'context',rootLayerId:101,layerId:301,context};
 assert.equal(h.call('mediaAction',{...args,context:null}).error.code,'CONTEXT_REQUIRED');
 h.app.project.selection=[{id:402}];const binding=h.call('mediaAction',args).result.bindingContext;
 h.app.project.selection=[{id:403}];assert.equal(h.call('mediaAction',{...args,action:'replaceSelected',bindingContext:binding}).error.code,'MEDIA_CONTEXT_CHANGED');
 h.app.project.file={fsName:'Another.aep'};assert.equal(h.call('mediaAction',args).error.code,'SELECTION_CHANGED');h.app.project.file=null;
 h.layers[0].selected=false;assert.equal(h.call('mediaAction',args).error.code,'SELECTION_CHANGED');assert.deepEqual(h.events,[]);
});
test('media no-op and empty Project selection create no native Undo entries',()=>{
 const h=host({mediaRows:[{layerId:301,itemId:401}],instances:{101:[{instanceId:'owned',variantId:'pc-fixture'}]}}),context=h.call('getState').result.context,args={action:'context',rootLayerId:101,layerId:301,context};
 assert.equal(h.call('mediaAction',args).result.errorCode,'PROJECT_SELECTION_COUNT');h.app.project.selection=[{id:401}];const current=h.call('mediaAction',args).result;
 assert.equal(h.call('mediaAction',{...args,action:'replaceSelected',bindingContext:current.bindingContext}).result.replaced,false);assert.deepEqual(h.events,[]);
 assert.equal(h.call('mediaAction',{...args,action:'revealSource'}).ok,true);assert.deepEqual(h.events.map(x=>x.kind),['revealSource']);
});
test('a different unsaved project invalidates a media dialog even if its numeric IDs are reused',()=>{
 const h=host({mediaRows:[{layerId:301,itemId:401}],instances:{101:[{instanceId:'owned',variantId:'pc-fixture'}]}}),context=h.call('getState').result.context,args={action:'context',rootLayerId:101,layerId:301,context};
 h.app.project.selection=[{id:402}];const bindingContext=h.call('mediaAction',args).result.bindingContext;
 h.app.project={...h.app.project};const reply=h.call('mediaAction',{...args,action:'replaceSelected',bindingContext});assert.equal(reply.ok,false);assert.equal(reply.error.code,'SELECTION_CHANGED');assert.deepEqual(h.events,[]);
 assert.notEqual(h.call('getState').result.context.projectToken,context.projectToken);
});
test('invalidated native cached project is checked before identity comparison and renews context securely',()=>{
 const h=host({nativeProjectIdentity:true,mediaRows:[{layerId:301,itemId:401}],instances:{101:[{instanceId:'owned',variantId:'pc-fixture'}]}}),old=h.app.project,context=h.call('getState').result.context;
 h.app.project={...old};old.nativeInvalid=true;
 const fresh=h.call('getState');assert.equal(fresh.ok,true,fresh.error?.message);assert.notEqual(fresh.result.context.projectToken,context.projectToken);
 assert.equal(h.identityEvents.filter(x=>x.invalid).length,0,'an invalid AE wrapper must never reach the native identity operator');
 assert.equal(h.call('getState').result.context.projectToken,fresh.result.context.projectToken);
 const stale=h.call('mediaAction',{action:'context',rootLayerId:101,layerId:301,context});assert.equal(stale.error.code,'SELECTION_CHANGED');assert.deepEqual(h.events,[]);
});
test('cached validity exceptions cannot retain an old token; current validity uncertainty fails closed',()=>{
 const h=host({nativeProjectIdentity:true}),old=h.app.project,context=h.call('getState').result.context;
 h.app.project={...old};old.validityThrows=true;
 const fresh=h.call('getState');assert.equal(fresh.ok,true,fresh.error?.message);assert.notEqual(fresh.result.context.projectToken,context.projectToken);
 h.app.project.validityThrows=true;const unavailable=h.call('getState');assert.equal(unavailable.ok,false);assert.equal(unavailable.error.code,'PROJECT_CONTEXT_UNAVAILABLE');
 assert.deepEqual(h.events,[]);
 const unknown=host({nativeValidityAvailable:false}).call('getState');assert.equal(unknown.ok,false);assert.equal(unknown.error.code,'PROJECT_CONTEXT_UNAVAILABLE');
});
test('a native identity exception after positive validity cannot authorize an old context',()=>{
 const h=host({nativeProjectIdentity:true}),context=h.call('getState').result.context;h.app.project.nativeIdentityThrows=true;
 const fresh=h.call('getState');assert.equal(fresh.ok,true,fresh.error?.message);assert.notEqual(fresh.result.context.projectToken,context.projectToken);
 const stale=h.call('toolAction',{tool:'keyframes',action:'reverse',context});assert.equal(stale.ok,false);assert.equal(stale.error.code,'SELECTION_CHANGED');assert.deepEqual(h.events,[]);
});
function colorRow(id,layerId,more={}){return{id,layerId,semantic:'selected-layer-color',type:'color',name:'#FFFFFF',value:[1,1,1],canSet:true,resetSupported:false,...more};}
function aepHost(){
 const h=host(),stamp={path:'c:/fixture/two.aep',size:100,modifiedMs:123,copyNextToProject:false},item={id:'project-owned',kind:'project',path:'C:/Fixture/two.aep'},batches=[],importGroupDepths=[];
 h.modules.cpWorkspace.find=()=>item;h.modules.cpWorkspace.sourceStamp=()=>({...stamp});
 h.modules.cpWorkspace.importMedia=(item,options={})=>{importGroupDepths.push(h.events.reduce((n,e)=>n+(e.kind==='begin'?1:e.kind==='end'?-1:0),0));const serial=batches.length,folder={id:700+serial},compositions=[0,1].map(i=>{const c=new h.comp.constructor();Object.assign(c,{id:800+serial*10+i,name:i?'Beta':'Alpha',duration:i?5:3});return c;});const batch={item:compositions.find(c=>c.name===options.compositionName)||null,importedFolder:folder,compositions};batches.push(batch);return batch;};
 h.comp.layers={add(source){const layer={id:900+h.layers.length,name:source.name,source,selected:false};h.layers.unshift(layer);h.app.project.revision++;return layer;}};
 h.layers.forEach(l=>l.replaceSource=function(source){this.source=source;h.app.project.revision++;});
 const request=options=>h.call('importLibraryItem',{id:item.id,context:h.call('getState').result.context,options:options||{}});
 return{...h,stamp,item,batches,importGroupDepths,request};
}
test('AEP project import stays outside custom Undo groups while placement has one group',()=>{
 for(const options of [{},{compositionName:'Beta'}]){
  const h=aepHost(),first=h.request(options);assert.equal(first.ok,true,first.error?.message);assert.deepEqual(h.importGroupDepths,[0],'AE AEP import resets native history and must precede the layer Undo group');
  if(!options.compositionName){assert.deepEqual(h.events,[],'listing choices must not create an Undo group');const choice=h.request({compositionId:801,importId:first.result.importId});assert.equal(choice.ok,true,choice.error?.message);}
  assert.deepEqual(h.events.map(e=>e.kind),['begin','end']);assert.equal(h.layers[0].source.name,'Beta');
 }
});
test('AEP chooser retry reuses the imported project without another native import or Undo group',()=>{
 const h=aepHost(),first=h.request();assert.equal(first.ok,true,first.error?.message);assert.equal(first.result.requiresComposition,true);const events=h.events.length;
 const retry=h.request();assert.equal(retry.ok,true,retry.error?.message);assert.equal(h.batches.length,1,'cancel and reopen must not import another AEP');assert.equal(h.events.length,events,'reopening choices is read-only');assert.deepEqual(retry.result.compositions,first.result.compositions);
 assert.notEqual(first.result.importId,h.item.id,'chooser identity must describe this import, not just the catalog row');
});
test('AEP chooser requires its import token and applies only a listed composition',()=>{
 const h=aepHost(),first=h.request().result,events=h.events.length;
 for(const options of [{compositionId:801},{compositionId:801,importId:'wrong'},{compositionId:99999,importId:first.importId}]){
  const result=h.request(options);assert.equal(result.ok,false);assert.equal(result.error.code,'COMPOSITION_SELECTION_CHANGED');
 }
 assert.equal(h.events.length,events,'invalid chooser decisions must fail before Undo or writes');
 const selected=h.request({compositionId:801,importId:first.importId});assert.equal(selected.ok,true,selected.error?.message);assert.equal(h.batches.length,1);assert.equal(h.layers[0].source.id,801);assert.equal(h.layers[0].startTime,1.25);
 assert.deepEqual(h.events.slice(events).map(e=>e.kind),['begin','end']);
});
test('AEP cached imports preserve explicit composition-name selection and unmatched-name fallback',()=>{
 const h=aepHost();assert.equal(h.request({compositionName:'Alpha'}).ok,true);assert.equal(h.layers[0].source.name,'Alpha');
 const second=h.request({compositionName:'Beta'});assert.equal(second.ok,true,second.error?.message);assert.equal(second.result.requiresComposition,undefined);assert.equal(h.layers[0].source.name,'Beta');assert.equal(h.batches.length,1);
 const events=h.events.length,unmatched=h.request({compositionName:'Absent'});assert.equal(unmatched.result.requiresComposition,true);assert.equal(unmatched.result.compositions.length,2);assert.equal(h.events.length,events);assert.equal(h.batches.length,1);
});
test('library replacement uses the native timing and anchor preservation path in its single Undo group',()=>{
 const h=aepHost(),first=h.request().result;h.modules.cpPrecomp.replaceLayerSource=(layer,source)=>{h.events.push({kind:'preserveSource',layerId:layer.id,sourceId:source.id});layer.replaceSource(source);};
 const result=h.call('replaceLibraryItem',{id:h.item.id,context:h.call('getState').result.context,options:{compositionId:800,importId:first.importId,keepTransform:true}});
 assert.equal(result.ok,true,result.error?.message);assert.equal(result.result.replacedLayers,1);assert.deepEqual(h.events.map(e=>e.kind),['begin','preserveSource','end']);assert.equal(h.layers[0].source.id,800);
});
test('AEP cached native handles are checked before reading them and cannot cross project/source changes',()=>{
 for(const kind of ['native','project','source']){
  const h=aepHost(),first=h.request().result,events=h.events.length;let invalidReads=0;
  if(kind==='native'){const c=h.batches[0].compositions[0];c.nativeInvalid=true;Object.defineProperty(c,'id',{get(){invalidReads++;throw Error('Invalid native object');}});}
  if(kind==='project')h.app.project={...h.app.project};
  if(kind==='source')h.stamp.modifiedMs++;
  const result=h.request({compositionId:801,importId:first.importId});assert.equal(result.ok,false,kind);assert.equal(result.error.code,'COMPOSITION_SELECTION_CHANGED',kind);assert.equal(invalidReads,0);assert.equal(h.events.length,events);assert.equal(h.batches.length,1,'a stale decision must not silently reimport');
  const retry=h.request();assert.equal(retry.ok,true,retry.error?.message);assert.equal(h.batches.length,2,'a new explicit request can import the current source');assert.notEqual(retry.result.importId,first.importId);
 }
});
test('generic layer colors appear without a preset and group equal values with one Undo',()=>{
 const rows=[colorRow('c1',101),colorRow('c2',102)],h=host({selected:[1,2],colorRows:rows}),s=h.call('getState').result;
 assert.equal(s.controls.length,1);assert.equal(s.hasRootNode,true);assert.equal(s.wantsRevealEditTab,false);assert.equal(s.projectRevision,1);assert.deepEqual(s.controls[0].actions,['copy','paste']);
 const changed=h.call('setControl',{id:s.controls[0].id,value:[.2,.3,.4],context:s.context,expectedRevision:s.projectRevision});assert.equal(changed.ok,true);assert.equal(changed.result.changedControls,2);assert.deepEqual(rows.map(x=>x.value),[[.2,.3,.4],[.2,.3,.4]]);assert.deepEqual(h.events.map(x=>x.kind),['colorPreflight','begin','colorSet','colorSet','end']);assert.ok(h.events.filter(x=>x.kind==='colorSet').every(x=>x.options.undoGroup===false));
 const next=h.call('getState').result;assert.equal(next.controls[0].id,s.controls[0].id,'a value change must retain exact property-group identity');assert.equal(h.call('setControl',{id:next.controls[0].id,value:[.5,.6,.7],context:next.context,expectedRevision:next.projectRevision}).ok,true);
});
test('generic color writes reject stale or missing revision before a property mutation',()=>{
 const h=host({colorRows:[colorRow('c1',101)]}),s=h.call('getState').result,args={id:s.controls[0].id,value:[0,0,0],context:s.context};
 assert.equal(h.call('setControl',args).error.code,'COLOR_CONTEXT_CHANGED');h.app.project.revision++;
 assert.equal(h.call('setControl',{...args,expectedRevision:s.projectRevision}).error.code,'COLOR_CONTEXT_CHANGED');assert.deepEqual(h.events,[]);
});
test('native color preflight keeps full precision despite ExtendScript decimal serialization',()=>{
 const value=[0.20000000298023224,0.44999998807907104,.75],rows=[colorRow('c1',101,{value})],h=host({colorRows:rows,extendScriptNumberText:true}),s=h.call('getState').result;
 h.modules.cpColors.preflight=function(targets,changes){for(const change of changes)assert.deepEqual(Array.from(change.expectedValue),rows[0].value,'native current color must not pass through decimal JSON serialization');};
 const result=h.call('setControl',{id:s.controls[0].id,value:[.75,.1,.3],context:s.context,expectedRevision:s.projectRevision});
 assert.equal(result.ok,true,result.error?.message);assert.deepEqual(rows[0].value,[.75,.1,.3]);
});
test('a read-only member disables a grouped color and arbitrary reset cannot reach precomp reset',()=>{
 const h=host({selected:[1,2],colorRows:[colorRow('c1',101),colorRow('c2',102,{canSet:false,readOnlyReason:'COLOR_ANIMATED_UNSUPPORTED'})]}),s=h.call('getState').result;
 assert.equal(s.controls[0].enabled,false);assert.equal(s.controls[0].readOnlyReason,'COLOR_ANIMATED_UNSUPPORTED');assert.equal(h.call('setControl',{id:s.controls[0].id,value:[0,0,0],context:s.context,expectedRevision:s.projectRevision}).error.code,'COLOR_ANIMATED_UNSUPPORTED');
 assert.equal(h.call('propertyAction',{id:s.controls[0].id,action:'reset',context:s.context}).error.code,'UNKNOWN_ACTION');assert.deepEqual(h.events,[]);
});

// Execute the real public facade; only AE objects and separately tested modules are stubs.
function host({ active = true, selected = [1], precompResult, instances = {}, controls = {},failLoad,mediaRows=[],colorRows=[],extendScriptNumberText=false,nativeProjectIdentity=false,nativeValidityAvailable=true,publicFontPacks=false } = {}) {
  const events = [];
  const loaded = [];
  let propertySetStore = null;
  const undoStack=[];let undoBefore=null;
  const audioRoot = 'C:/Fixture User/Contentrium/Preset/UserAudio';
  const catalog = { entries: [{
    id: 'title', name: 'Title fixture', text: false,
    variants: [{ id: 'pc-fixture', name: 'Two lines', type: 10, available: true }],
  }] };
  function CompItem() {}
  function TextLayer() {}
  const comp = new CompItem();
  const layers = [1, 2, 3].map(index => ({
    id: 100 + index, index, name: `Fixture ${index}`,
    selected: selected.includes(index), containingComp: comp,
  }));
  function updateIndices() { layers.forEach((layer, i) => { layer.index = i + 1; }); }
  Object.assign(comp, { id:88,time: 1.25, layer: index => layers[index - 1] });
  Object.defineProperties(comp, {
    numLayers: { get: () => layers.length },
    selectedLayers: { get: () => layers.filter(layer => layer.selected) },
  });
  function File(name) {
    if (!(this instanceof File)) return new File(name);
    this.fsName = path.resolve(name);
    this.name = path.basename(this.fsName);
    const fontFile=/[\\/]library[\\/]fonts[\\/]/.test(this.fsName);
    this.exists = fontFile ? publicFontPacks && fs.existsSync(this.fsName) : true;
    if(fontFile&&this.exists){Object.defineProperties(this,{length:{get:()=>fs.statSync(this.fsName).size},modified:{get:()=>fs.statSync(this.fsName).mtime}});}
    this.open = () => this.name === 'catalog.json' || (fontFile&&this.exists);
    this.read = () => fontFile ? fs.readFileSync(this.fsName,'utf8') : JSON.stringify(catalog);
    this.close = () => true;
  }
  Object.defineProperty(File.prototype, 'parent', {
    get() { return new File(path.dirname(this.fsName)); },
  });
  const $ = {
    fileName: sourcePath,
    evalFile(file) {
      loaded.push(file.name);
      if(file.name===failLoad)throw Object.assign(new Error('Missing or invalid startup module'),{fileName:file.fsName,line:3});
      if (file.name === 'json-engine.jsx') {
        vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../jsx/json-engine.jsx'),'utf8'),{$});
      } else if (file.name === 'animated-font-model.jsx' || file.name === 'animated-font-engine.jsx' || file.name === 'font-pack-engine.jsx' || file.name === 'controller-engine.jsx') {
        vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../jsx',file.name),'utf8'),context);
      } else if (file.name === 'presets.jsx') {
        $.cpPresetBuilder = { build() { throw new Error('Precomp must bypass overlay recipes'); } };
      } else if (file.name === 'overlay-engine.jsx') {
        $.cpOverlay = { controls: () => [], instances: () => [] };
      } else if (file.name === 'audio-engine.jsx') {
        $.cpAudio = { root: audioRoot };
      } else if (file.name === 'precomp-engine.jsx') {
        $.cpPrecomp = {
          apply(target, variant, options, root) {
            events.push({ kind: 'precompApply', target, variant: { ...variant }, options, root });
            const created = [{ id: 501, name: 'New title root', containingComp: comp, selected: false }];
            layers.unshift(...created);
            updateIndices();
            return { layers: created, instanceId: 'native-fixture-501', ...precompResult };
          },
          instances(layer) {
            return (instances[layer.id] || []).map(item => ({
              ...item, missingAudio: item.missingAudio && [...item.missingAudio],
            }));
          },
          controls: targets => targets.flatMap(layer => (controls[layer.id] || []).map(d => ({...d}))),
          setControl(layer,id,value) { const d=(controls[layer.id]||[]).find(d=>d.id===id);if(!d)throw Error('Missing fixture control');d.value=value;context.app.project.revision++;events.push({kind:'set',layerId:layer.id,id,value}); },
          media:()=>mediaRows.map(row=>({...row})),
          mediaContext(layer,{layerId}){const row=mediaRows.find(row=>row.layerId===layerId),items=context.app.project.selection||[],binding=row?{expectedRootLayerId:layer.id,expectedSourceItemId:501,expectedMediaItemId:row.itemId}:null;if(binding&&items.length===1)binding.expectedItemId=items[0].id;return{instanceId:'owned',rootLayerId:layer.id,sourceItemId:501,media:mediaRows,projectSelection:{items,count:items.length},context:binding,canReplace:!!row&&items.length===1,errorCode:!row?'MEDIA_NOT_FOUND':items.length!==1?'PROJECT_SELECTION_COUNT':null,replacement:row&&items.length===1?{noop:items[0].id===row.itemId,itemId:items[0].id}:null};},
          replaceSelectedMedia(layer,id,options){events.push({kind:'replaceMedia',layerId:layer.id,id,options});return{replaced:true,itemId:context.app.project.selection[0].id};},
          revealSource(layer){events.push({kind:'revealSource',layerId:layer.id});return{sourceItemId:501};},
        };
      } else if (file.name === 'texture-engine.jsx') {
        $.cpTexture={instances:()=>[],controls:()=>[],canApply:ls=>ls.length===1,preflightTarget(){}};
      } else if (file.name === 'timeline-engine.jsx') {
        $.cpTimeline = { read: () => [] };
      } else if (file.name === 'tools-engine.jsx') {
        $.cpTools = { action: () => ({ changedKeys: 1 }),easingSelectionMode:()=> 'pairs' };
      } else if (file.name === 'sequence-engine.jsx') {
        $.cpSequence = {};
      } else if (file.name === 'workspace-engine.jsx') {
        $.cpWorkspace = { configure() {}, getSettings: () => ({ settings: { presetMotionBlurEnabled: true } }), getLibrary: () => ({ items: [], folders: [] }),loadPropertySets:()=>propertySetStore,savePropertySets:s=>{propertySetStore=s;} };
      } else if (file.name === 'user-preset-engine.jsx') {
        $.cpUserPreset = { capture: () => ({ kind: 'user' }), validate: () => true };
      } else if (file.name === 'property-set-engine.jsx') {
        vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../jsx/property-set-engine.jsx'),'utf8'),{$});
      } else if(file.name==='thumbnail-engine.jsx') {$.cpThumbnails={describe:()=>({}),frame:()=>({}),cleanup(options){events.push({kind:'thumbnailCleanup',options});return{cleaned:true};}};
      } else if(file.name==='palette-engine.jsx') {
        vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../jsx/palette-engine.jsx'),'utf8'),{$});
      } else if(file.name==='color-engine.jsx') {
        $.cpColors={enumerate:targets=>({controls:colorRows.filter(row=>targets.some(layer=>layer.id===row.layerId)).map(row=>({...row,value:[...row.value]})),warnings:[]}),get:(targets,id)=>$.cpColors.enumerate(targets).controls.find(row=>row.id===id),preflight(targets,changes){events.push({kind:'colorPreflight',changes});for(const change of changes){const row=$.cpColors.get(targets,change.id);if(!row.canSet)throw Object.assign(new Error('Read only'),{code:row.readOnlyReason});}},set(targets,changes,options){for(const change of changes){colorRows.find(row=>row.id===change.id).value=[...change.value];context.app.project.revision++;}events.push({kind:'colorSet',changes,options});return{changed:changes.length};}};
      } else throw new Error(`Unexpected module: ${file.name}`);
    },
  };
  const context = { $, File, CompItem, TextLayer, app: {
    version: '26.5-fixture', project: { activeItem: active ? comp : null,revision:1,numItems:1,item:()=>comp,selection:[] },
    beginUndoGroup(name) { undoBefore={controls:JSON.parse(JSON.stringify(controls)),revision:this.project.revision};events.push({ kind: 'begin', name }); },
    endUndoGroup() { if(undoBefore&&undoBefore.revision!==this.project.revision)undoStack.push(undoBefore);undoBefore=null;events.push({ kind: 'end' }); },
    executeCommand(command) { assert.equal(command,16);const previous=undoStack.pop();assert.ok(previous,'only the latest owned undo entry may be consumed');for(const [id,list]of Object.entries(previous.controls))for(const d of list){const target=controls[id].find(v=>v.id===d.id);target.value=d.value;}this.project.revision++;events.push({kind:'undo'}); },
  } };
  const identityEvents=[];
  if(nativeValidityAvailable)context.isValid=value=>{if(value?.validityThrows)throw Error('Object is invalid');return !!value&&!value.nativeInvalid;};
  let evaluatedSource=source;
  if(nativeProjectIdentity){
    // JS cannot trap === on a Proxy. Instrument only that native host operator;
    // the actual facade context/validity/token/guard implementation still runs.
    context.cpNativeProjectEquals=(a,b)=>{identityEvents.push({invalid:!!a?.nativeInvalid});if(a?.nativeInvalid||a?.validityThrows||a?.nativeIdentityThrows)throw Error('Object is invalid');return a===b;};
    let operators=0;evaluatedSource=source.replace(/session\.projectObject(!==|===)project/g,(_,op)=>{operators++;return(op==='!=='?'!':'')+'cpNativeProjectEquals(session.projectObject,project)';});
    assert.equal(operators,1,'the native identity comparison must remain covered by the simulation');
  }
  if(extendScriptNumberText)context.String=value=>typeof value==='number'?String(Number(value.toPrecision(15))):String(value);
  vm.runInNewContext(evaluatedSource, context, { filename: sourcePath });
  function call(method, payload = {}) {
    return JSON.parse($.contentriumPreset.call(method, JSON.stringify(payload)));
  }
  let paletteBytes=null;if($.cpPalette)$.cpPalette.configure({json:$.contentriumPreset.json,parse:$.contentriumPreset.parse,load:()=>paletteBytes,save:v=>{paletteBytes=v;}});
  return { call, comp, layers, events, loaded, audioRoot,app:context.app,modules:$,undoStack,identityEvents };
}

test('read-only state exposes the host easing selection mode and no-comp none',()=>{
  const h=host(),state=h.call('getState');assert.equal(state.ok,true);assert.equal(state.result.toolState.easing.selectionMode,'pairs');assert.deepEqual(h.events,[]);
  const empty=host({active:false}),inactive=empty.call('getState');assert.equal(inactive.ok,true);assert.equal(inactive.result.toolState.easing.selectionMode,'none');assert.deepEqual(empty.events,[]);
});
test('a startup module failure is returned to the panel without an uncaught native initializer error',()=>{
 for(const failLoad of ['json-engine.jsx','workspace-engine.jsx']){const h=host({failLoad}),r=h.call('hostStatus');assert.equal(r.ok,false);assert.equal(r.error.code,'INITIALIZATION_FAILED');assert.match(r.error.message,/Missing or invalid startup module/);assert.match(r.error.file,new RegExp(failLoad.replace('.','\\.')));assert.equal(r.error.line,3);assert.deepEqual(h.events,[]);}
});

test('facade apply exposes precomp warnings and missing audio without losing its successful receipt', () => {
  const warnings = ['Personal sound swish is unavailable; visual preset applied.'];
  const missingAudio = ['swish', 'impact'];
  const h = host({ precompResult: { warnings, missingAudio } });
  const reply = h.call('applyPreset', { variantId: 'pc-fixture', direction: 'out', duration: 2.5 });
  assert.equal(reply.ok, true);
  assert.deepEqual(reply.result.warnings, warnings);
  assert.deepEqual(reply.result.missingAudio, missingAudio);
  assert.equal(reply.result.instanceId, 'native-fixture-501');
  assert.equal(reply.result.appliedLayers, 1);
  assert.equal(reply.result.variantId, 'pc-fixture');
  assert.deepEqual(h.comp.selectedLayers.map(layer => layer.name), ['New title root']);
  const apply = h.events.find(event => event.kind === 'precompApply');
  assert.equal(apply.target, h.comp);
  assert.equal(apply.options.direction, 'out');
  assert.equal(apply.options.duration, 2.5);
  assert.equal(apply.options.time, 1.25);
  assert.deepEqual(h.events.map(event => event.kind), ['begin', 'precompApply', 'end']);
});

test('facade keeps empty audio arrays when a successful precomp has no audio diagnostics', () => {
  const h = host();
  const reply = h.call('applyPreset', { variantId: 'pc-fixture' });
  assert.equal(reply.ok, true);
  assert.deepEqual(reply.result.warnings, []);
  assert.deepEqual(reply.result.missingAudio, []);
});

test('getState deduplicates missing sounds across selected instances and ignores unselected layers', () => {
  const h = host({ selected: [1, 2], instances: {
    101: [{ instanceId: 'shared-title', variantId: 'pc-fixture', missingAudio: ['swish', 'impact', 'swish'] }],
    102: [
      { instanceId: 'shared-title', variantId: 'pc-fixture', missingAudio: ['impact', 'click'] },
      { instanceId: 'silent-title', variantId: 'pc-fixture' },
    ],
    103: [{ instanceId: 'unselected-title', variantId: 'pc-fixture', missingAudio: ['not-selected'] }],
  } });
  const first = h.call('getState');
  const second = h.call('getState');
  assert.equal(first.ok, true);
  assert.deepEqual(first.result.audio, { missing: ['swish', 'impact', 'click'], root: h.audioRoot });
  assert.equal(first.result.numSelectedLayers, 2);
  assert.deepEqual(second, first, 'repeated read must not corrupt or accumulate audio state');
  assert.deepEqual(h.events, [], 'reading state must not open Undo groups or apply a preset');
});

test('hostStatus exposes the audio library root with and without an active composition', () => {
  for (const active of [true, false]) {
    const h = host({ active, selected: [1, 2] });
    const reply = h.call('hostStatus');
    assert.equal(reply.ok, true);
    assert.equal(reply.result.audioRoot, h.audioRoot);
    assert.equal(reply.result.version, '26.5-fixture');
    assert.equal(reply.result.hasComposition, active);
    assert.equal(reply.result.selectedLayers, active ? 2 : 0);
    assert.equal(reply.result.capabilities.captureUserPreset, true);
    assert.deepEqual(h.loaded, ['json-engine.jsx', 'presets.jsx', 'timeline-engine.jsx', 'animated-font-model.jsx', 'animated-font-engine.jsx', 'font-pack-engine.jsx', 'controller-engine.jsx', 'overlay-engine.jsx', 'audio-engine.jsx', 'precomp-engine.jsx', 'texture-engine.jsx', 'tools-engine.jsx', 'sequence-engine.jsx', 'workspace-engine.jsx', 'user-preset-engine.jsx', 'property-set-engine.jsx','color-engine.jsx','palette-engine.jsx','thumbnail-engine.jsx']);
    assert.deepEqual(h.events, []);
  }
});

test('getState without a composition still returns a usable audio library location', () => {
  const h = host({ active: false });
  const reply = h.call('getState');
  assert.equal(reply.ok, true);
  assert.equal(reply.result.numSelectedLayers, 0);
  assert.deepEqual(reply.result.audio, { missing: [], root: h.audioRoot });
  assert.deepEqual(reply.result.controls, []);
  assert.deepEqual(reply.result.applied, []);
});

test('selection identity changes without mutating selected layers and preserves stable layer IDs', () => {
  const h=host({selected:[1]});
  const first=h.call('getState').result;
  assert.deepEqual(first.context.layerIds,[101]);
  assert.equal(first.hasRootNode,false);
  h.layers[0].selected=false;h.layers[1].selected=true;
  const second=h.call('getState').result;
  assert.notEqual(first.instanceId,second.instanceId);
  assert.deepEqual(second.context.layerIds,[102]);
  assert.deepEqual(h.events,[]);
});

test('stale context is rejected before a tool mutates a different selection', () => {
  const h=host({selected:[1]});const context=h.call('getState').result.context;
  h.layers[0].selected=false;h.layers[1].selected=true;
  const reply=h.call('toolAction',{tool:'keyframes',action:'reverse',context});
  assert.equal(reply.ok,false);assert.equal(reply.error.code,'SELECTION_CHANGED');
  assert.deepEqual(h.events,[]);
});

test('applied selection explicitly advertises automatic edit state and action capabilities', () => {
  const h=host({selected:[1],instances:{101:[{instanceId:'owned',variantId:'pc-fixture'}]}});
  const state=h.call('getState').result;
  assert.equal(state.hasRootNode,true);assert.equal(state.wantsRevealEditTab,true);
  assert.equal(state.applied[0].layerId,101);assert.equal(state.applied[0].instanceId,'owned');
  assert.ok(state.applied[0].actions.includes('copy'));
  const status=h.call('hostStatus').result;assert.ok(status.methods.includes('presetAction'));
});

test('saved property groups apply across instance IDs and roll up mixed selected values',()=>{
 const controls={101:[{id:'pc:101:amount',name:'Amount',type:'slider',group:'Animation',value:12,min:0,max:100}],102:[{id:'pc:102:amount',name:'Amount',type:'slider',group:'Animation',value:25,min:0,max:100}]};
 const h=host({controls,instances:{101:[{instanceId:'first',variantId:'pc-fixture'}],102:[{instanceId:'second',variantId:'pc-fixture'}]}});
 let s=h.call('getState').result,key=s.controlGroups[0].key;
 const saved=h.call('propertySetAction',{action:'saveAs',groupKey:key,name:'Amount 12',context:s.context});assert.equal(saved.ok,true);
 assert.equal(h.call('propertySetAction',{action:'getAvailablePresets',groupKey:key}).result.matchingPreset,saved.result.id);
 h.layers[0].selected=false;h.layers[1].selected=true;s=h.call('getState').result;
 const applied=h.call('propertySetAction',{action:'apply',groupKey:key,presetId:saved.result.id,context:s.context});assert.equal(applied.ok,true);assert.equal(controls[102][0].value,12);
 assert.deepEqual(h.events.map(x=>x.kind),['begin','set','end']);
 h.layers[0].selected=true;controls[101][0].value=30;s=h.call('getState').result;
 assert.equal(s.controlGroups[0].canSave,false);assert.equal(s.controls[0].mixed,true);
 assert.equal(h.call('propertySetAction',{action:'saveAs',groupKey:key,name:'mixed'}).error.code,'PROPERTY_GROUP_NOT_UNIFORM');
 assert.equal(h.call('propertySetAction',{action:'getAvailablePresets',groupKey:key}).result.matchingPreset,null);
 const both=h.call('propertySetAction',{action:'apply',groupKey:key,presetId:saved.result.id});assert.equal(both.result.appliedControls,2);assert.equal(controls[101][0].value,12);
});

test('saved property groups preflight every locked target before changing any control',()=>{
 const controls={101:[{id:'pc:101:amount',name:'Amount',type:'slider',group:'Animation',value:12}],102:[{id:'pc:102:amount',name:'Amount',type:'slider',group:'Animation',value:25}]};
 const h=host({controls,instances:{101:[{instanceId:'first',variantId:'pc-fixture'}],102:[{instanceId:'second',variantId:'pc-fixture'}]}}),s=h.call('getState').result,key=s.controlGroups[0].key;
 const saved=h.call('propertySetAction',{action:'saveAs',groupKey:key,name:'Saved'}).result;
 controls[101][0].value=30;h.layers[1].selected=true;h.layers[1].locked=true;
 const r=h.call('propertySetAction',{action:'apply',groupKey:key,presetId:saved.id});assert.equal(r.ok,false);assert.equal(r.error.code,'LAYER_LOCKED');assert.equal(controls[101][0].value,30);assert.equal(controls[102][0].value,25);assert.deepEqual(h.events,[]);
});

function gestureHost(){const controls={101:[{id:'pc:101:amount',name:'Amount',type:'slider',group:'Animation',value:12,min:0,max:100}]},h=host({controls,instances:{101:[{instanceId:'first',variantId:'pc-fixture'}]}});const state=h.call('getState').result;return{h,controls,options:{id:state.controls[0].id,context:state.context,undoGroupId:'drag-fixture'}};}
test('one live gesture leaves one native undo entry and returns to the initial value',()=>{
 const{h,controls,options}=gestureHost();assert.equal(h.call('setControl',{...options,value:20}).ok,true);assert.equal(h.call('setControl',{...options,value:50}).ok,true);
 assert.equal(controls[101][0].value,50);assert.equal(h.undoStack.length,1);assert.equal(h.call('endUndoGroup',{undoGroupId:options.undoGroupId}).ok,true);h.app.executeCommand(16);assert.equal(controls[101][0].value,12);
});
test('relative live gesture uses its initial value instead of accumulating intermediate deltas',()=>{
 const{h,controls,options}=gestureHost();assert.equal(h.call('setControl',{...options,value:8,relative:true}).ok,true);assert.equal(h.call('setControl',{...options,value:10,relative:true}).ok,true);assert.equal(controls[101][0].value,22);assert.equal(h.undoStack.length,1);
});
test('an unchanged first gesture value never creates or consumes an undo entry',()=>{
 const{h,options}=gestureHost();assert.equal(h.call('setControl',{...options,value:12}).result.changedControls,0);assert.equal(h.call('setControl',{...options,value:20}).ok,true);assert.equal(h.undoStack.length,1);assert.equal(h.events.filter(v=>v.kind==='undo').length,0);
});
test('intervening native edits stop coalescing without consuming unrelated undo history',()=>{
 const{h,controls,options}=gestureHost();h.call('setControl',{...options,value:20});h.app.project.revision++;const r=h.call('setControl',{...options,value:50});assert.equal(r.ok,false);assert.equal(r.error.code,'GESTURE_INTERRUPTED');assert.equal(controls[101][0].value,20);assert.equal(h.events.filter(v=>v.kind==='undo').length,0);
});
test('gesture control identity changes are rejected before undo or writing',()=>{
 const{h,controls,options}=gestureHost();h.call('setControl',{...options,value:20});controls[101].push({id:'pc:101:second',name:'Other',type:'slider',group:'Animation',value:42});const next=h.call('getState').result.controls.find(x=>x.name==='Other');const r=h.call('setControl',{...options,id:next.id,value:50});assert.equal(r.ok,false);assert.equal(r.error.code,'GESTURE_INTERRUPTED');assert.equal(controls[101][1].value,42);assert.equal(h.events.filter(v=>v.kind==='undo').length,0);
});
test('an own failed multi-target mutation rolls back the completed undo group',()=>{
 const controls={101:[{id:'pc:101:amount',name:'Amount',type:'slider',group:'Animation',value:12}],102:[{id:'pc:102:amount',name:'Amount',type:'slider',group:'Animation',value:25}]},h=host({controls,selected:[1,2],instances:{101:[{instanceId:'first',variantId:'pc-fixture'}],102:[{instanceId:'second',variantId:'pc-fixture'}]}});const state=h.call('getState').result,real=h.modules.cpPrecomp.setControl;
 h.modules.cpPrecomp.setControl=function(layer,id,value){real(layer,id,value);if(layer.id===102)throw Error('Injected second setter failure after its write');};
 const r=h.call('setControl',{id:state.controls[0].id,value:55,context:state.context});assert.equal(r.ok,false);assert.equal(controls[101][0].value,12);assert.equal(controls[102][0].value,25);assert.equal(h.events.filter(v=>v.kind==='undo').length,1);assert.equal(h.undoStack.length,0);
});

function definePalette(h,ids){const state=h.call('getState').result;return h.call('paletteAction',{action:'define',name:'Brand',slots:ids.map((controlId,i)=>({slotKey:'slot'+(i+1),controlId})),context:state.context,expectedRevision:state.projectRevision});}
test('explicit palette slots keep equal colors independent through save, split, apply, reset and delete',()=>{
 const rows=[colorRow('a',101),colorRow('b',102)],h=host({selected:[1,2],colorRows:rows}),state=h.call('getState').result;
 assert.equal(state.paletteCandidates.length,2);assert.notEqual(state.paletteCandidates[0].name,state.paletteCandidates[1].name,'equal colors retain distinct layer labels');assert.equal(state.controls.filter(c=>c.type==='palette').length,0);
 const defined=definePalette(h,['a','b']);assert.equal(defined.ok,true,defined.error?.message);const id=defined.result.id;
 let s=h.call('getState').result,p=s.controls.find(c=>c.id===id);assert.equal(p.slots.length,2);assert.equal(p.resetSupported,true);assert.notEqual(p.slots[0].controlId,p.slots[1].controlId);
 rows[0].value=[1,0,0];rows[1].value=[0,1,0];s=h.call('getState').result;assert.equal(s.controls.find(c=>c.id===id).value,'');
 const save=h.call('paletteAction',{action:'saveAs',id,name:'Warm',context:s.context,expectedRevision:s.projectRevision});assert.equal(save.ok,true,save.error?.message);
 rows[0].value=[0,0,1];rows[1].value=[1,1,0];s=h.call('getState').result;h.events.length=0;
 const apply=h.call('setControl',{id,value:save.result.id,context:s.context,expectedRevision:s.projectRevision});assert.equal(apply.ok,true,apply.error?.message);assert.deepEqual(rows.map(r=>r.value),[[1,0,0],[0,1,0]]);assert.equal(h.events.filter(e=>e.kind==='begin').length,1);
 s=h.call('getState').result;assert.equal(h.call('paletteAction',{action:'reset',id,context:s.context,expectedRevision:s.projectRevision}).ok,true);assert.deepEqual(rows.map(r=>r.value),[[1,1,1],[1,1,1]]);
 s=h.call('getState').result;assert.equal(h.call('paletteAction',{action:'remove',id,paletteId:save.result.id,context:s.context,expectedRevision:s.projectRevision}).ok,true);assert.equal(h.call('getState').result.controls.find(c=>c.id===id).def.availablePalettes.user.length,0);
});
test('palette missing, readonly, stale revision and changed project fail before any write',()=>{
 const rows=[colorRow('a',101),colorRow('b',102)],h=host({selected:[1,2],colorRows:rows}),d=definePalette(h,['a','b']);assert.equal(d.ok,true,d.error?.message);let s=h.call('getState').result;h.events.length=0;
 assert.equal(h.call('setControl',{id:d.result.id,value:'baseline',context:s.context}).error.code,'PALETTE_CONTEXT_CHANGED');
 rows[1].canSet=false;rows[1].readOnlyReason='COLOR_ANIMATED_UNSUPPORTED';const r=h.call('setControl',{id:d.result.id,value:'baseline',context:s.context,expectedRevision:s.projectRevision});assert.equal(r.ok,false);assert.deepEqual(h.events,[]);
 rows[1].canSet=true;h.app.project={...h.app.project};assert.equal(h.call('paletteAction',{action:'reset',id:d.result.id,context:s.context,expectedRevision:s.projectRevision}).error.code,'SELECTION_CHANGED');assert.deepEqual(h.events,[]);
});
test('native picker returns RGB value only; cancel writes nothing and acceptance remains separately guarded',()=>{
 const rows=[colorRow('a',101,{value:[.2,.3,.4,.7]})],h=host({colorRows:rows}),s=h.call('getState').result;let packed;
 h.modules.cpColors.pickerCapabilities=()=>({available:true,kind:'extendscript-rgb24',supportsAlpha:false,supportsHDR:false});h.modules.cpColors.pickColor=v=>{packed=v;return null;};
 const cancel=h.call('pickColor',{id:s.controls[0].id,context:s.context,expectedRevision:s.projectRevision});assert.equal(cancel.ok,true,cancel.error?.message);assert.equal(cancel.result.cancelled,true);assert.deepEqual(h.events,[]);assert.deepEqual(packed,rows[0].value);
 h.modules.cpColors.pickColor=()=>[1,0,0,.7];const picked=h.call('pickColor',{id:s.controls[0].id,context:s.context,expectedRevision:s.projectRevision});assert.deepEqual(picked.result.value,[1,0,0,.7]);assert.deepEqual(h.events,[]);
 h.app.project.revision++;assert.equal(h.call('setControl',{id:s.controls[0].id,value:picked.result.value,context:s.context,expectedRevision:s.projectRevision}).error.code,'COLOR_CONTEXT_CHANGED');assert.deepEqual(h.events,[]);
});

test('explicit palette rollback restores every native color when the second setter mutates then throws',()=>{
 const rows=[colorRow('a',101),colorRow('b',102)],h=host({selected:[1,2],colorRows:rows}),defined=definePalette(h,['a','b']);let s=h.call('getState').result;
 rows[0].value=[1,0,0];rows[1].value=[0,1,0];const saved=h.call('paletteAction',{action:'saveAs',id:defined.result.id,name:'Two',context:s.context,expectedRevision:s.projectRevision});rows[0].value=[1,1,1];rows[1].value=[1,1,1];s=h.call('getState').result;
 const set=h.modules.cpColors.set;let injected=false;h.modules.cpColors.set=function(targets,changes,options){const result=set(targets,changes,options);if(changes[0].id==='b'&&!injected){injected=true;throw Error('Native failure after second write');}return result;};
 const result=h.call('setControl',{id:defined.result.id,value:saved.result.id,context:s.context,expectedRevision:s.projectRevision});assert.equal(result.ok,false);assert.match(result.error.message,/Native failure/);assert.deepEqual(rows.map(r=>r.value),[[1,1,1],[1,1,1]]);assert.equal(h.events.filter(e=>e.kind==='begin').length,1);assert.equal(h.events.filter(e=>e.kind==='end').length,1);
});
test('all color controls require captured revision and picker rejects omitted context',()=>{
 const h=host({instances:{101:[{instanceId:'own',variantId:'pc-fixture'}]},controls:{101:[{id:'native-fill',type:'color',name:'Fill',value:[1,0,0],group:'Text'}]}}),s=h.call('getState').result,c=s.controls[0];h.app.project.revision++;
 const result=h.call('setControl',{id:c.id,value:[0,1,0],context:s.context,expectedRevision:s.projectRevision});assert.equal(result.ok,false);assert.equal(result.error.code,'COLOR_CONTEXT_CHANGED');assert.deepEqual(h.events,[]);
 assert.equal(h.call('pickColor',{id:c.id,expectedRevision:h.app.project.revision}).error.code,'CONTEXT_REQUIRED');
});
test('palette matching survives native full-precision values serialized by ExtendScript',()=>{
 const rows=[colorRow('a',101)],h=host({colorRows:rows,extendScriptNumberText:true}),d=definePalette(h,['a']);rows[0].value=[.20000000298023224,.44999998807907104,.75];const s=h.call('getState').result,saved=h.call('paletteAction',{action:'saveAs',id:d.result.id,name:'Float',context:s.context,expectedRevision:s.projectRevision});delete h.modules.cpFacadeSession.paletteScopes[0].accepted;
 assert.equal(h.call('getState').result.controls.find(c=>c.id===d.result.id).value,saved.result.id);
});

test('RGB24 picker acceptance preserves each mixed native palette color target alpha',()=>{
 const controls={101:[{id:'native-fill',type:'color',name:'Fill',value:[1,0,0,.2],group:'Text'}],102:[{id:'native-fill',type:'color',name:'Fill',value:[0,1,0,.8],group:'Text'}]},h=host({selected:[1,2],instances:{101:[{instanceId:'a',variantId:'pc-fixture'}],102:[{instanceId:'b',variantId:'pc-fixture'}]},controls}),s=h.call('getState').result,c=s.controls[0];assert.equal(c.mixed,true);h.modules.cpColors.pickColor=current=>{assert.equal(current,null);return[.2,.4,.6];};
 const picked=h.call('pickColor',{id:c.id,context:s.context,expectedRevision:s.projectRevision});assert.equal(picked.ok,true);const written=h.call('setControl',{id:c.id,value:picked.result.value,context:s.context,expectedRevision:s.projectRevision});assert.equal(written.ok,true,written.error?.message);assert.deepEqual(Array.from(controls[101][0].value),[.2,.4,.6,.2]);assert.deepEqual(Array.from(controls[102][0].value),[.2,.4,.6,.8]);
});

for(const structuralEdit of ['delete-recreate','swap-identical-paths'])test('palette scope permanently invalidates after '+structuralEdit+' even after fresh state and own color writes',()=>{
 const rows=[colorRow('a',101),colorRow('b',102)],h=host({selected:[1,2],colorRows:rows}),d=definePalette(h,['a','b']);assert.equal(d.ok,true);const scopeId=d.result.id;
 if(structuralEdit==='delete-recreate')rows.splice(0,1,colorRow('a',101,{value:[.4,.5,.6]}));else rows.splice(0,2,colorRow('a',101,{value:[.2,.3,.4]}),colorRow('b',102,{value:[.6,.7,.8]}));
 h.app.project.revision++;const fresh=h.call('getState').result,p=fresh.controls.find(c=>c.id===scopeId);assert.equal(p.enabled,false);assert.match(p.readOnlyReason,/다시 지정/);
 h.events.length=0;for(const action of ['apply','reset']){const r=h.call('paletteAction',{action,id:scopeId,value:'baseline',context:fresh.context,expectedRevision:fresh.projectRevision});assert.equal(r.ok,false);assert.equal(r.error.code,'PALETTE_SCOPE_STALE');}assert.deepEqual(h.events,[]);
 const color=fresh.controls.find(c=>c.semantic==='selected-layer-color');assert.equal(h.call('setControl',{id:color.id,value:[.1,.2,.3],context:fresh.context,expectedRevision:fresh.projectRevision}).ok,true);
 const after=h.call('getState').result;assert.equal(after.controls.find(c=>c.id===scopeId).enabled,false,'an own successful write cannot revive an already stale scope');h.events.length=0;assert.equal(h.call('paletteAction',{action:'reset',id:scopeId,context:after.context,expectedRevision:after.projectRevision}).error.code,'PALETTE_SCOPE_STALE');assert.deepEqual(h.events,[]);
 assert.equal(definePalette(h,['a','b']).ok,true,'only a new explicit binding can use current properties');
});
test('known successful color and palette writes advance valid scopes while native Undo invalidates them',()=>{
 const rows=[colorRow('a',101),colorRow('b',102)],h=host({selected:[1,2],colorRows:rows}),d=definePalette(h,['a','b']);let s=h.call('getState').result;
 assert.equal(h.call('setControl',{id:s.controls.find(c=>c.semantic==='selected-layer-color').id,value:[.2,.4,.6],context:s.context,expectedRevision:s.projectRevision}).ok,true);
 s=h.call('getState').result;assert.equal(s.controls.find(c=>c.id===d.result.id).enabled,true);assert.equal(h.modules.cpFacadeSession.paletteScopes[0].revision,h.app.project.revision);
 const saved=h.call('paletteAction',{action:'saveAs',id:d.result.id,name:'Known',context:s.context,expectedRevision:s.projectRevision});assert.equal(saved.ok,true);
 assert.equal(h.call('paletteAction',{action:'reset',id:d.result.id,context:s.context,expectedRevision:s.projectRevision}).ok,true);s=h.call('getState').result;assert.equal(s.controls.find(c=>c.id===d.result.id).enabled,true);
 assert.equal(h.call('setControl',{id:d.result.id,value:saved.result.id,context:s.context,expectedRevision:s.projectRevision}).ok,true);s=h.call('getState').result;assert.equal(s.controls.find(c=>c.id===d.result.id).enabled,true);
 h.app.executeCommand(16);const undoState=h.call('getState').result;assert.equal(undoState.controls.find(c=>c.id===d.result.id).enabled,false);h.events.length=0;assert.equal(h.call('paletteAction',{action:'reset',id:d.result.id,context:undoState.context,expectedRevision:undoState.projectRevision}).error.code,'PALETTE_SCOPE_STALE');assert.deepEqual(h.events,[]);
});

test('stale palette scope cannot revive when a revision number repeats or a legacy scope lacks binding revision',()=>{
 const rows=[colorRow('a',101)],h=host({colorRows:rows}),d=definePalette(h,['a']),scope=h.modules.cpFacadeSession.paletteScopes[0],original=scope.revision;h.app.project.revision++;
 assert.equal(h.call('getState').result.controls.find(c=>c.id===d.result.id).requiresRedefinition,true);h.app.project.revision=original;assert.equal(h.call('getState').result.controls.find(c=>c.id===d.result.id).enabled,false);
 const next=definePalette(h,['a']);delete h.modules.cpFacadeSession.paletteScopes[1].revision;const s=h.call('getState').result;assert.equal(s.controls.find(c=>c.id===next.result.id).enabled,false);h.events.length=0;assert.equal(h.call('paletteAction',{action:'reset',id:next.result.id,context:s.context,expectedRevision:s.projectRevision}).error.code,'PALETTE_SCOPE_STALE');assert.deepEqual(h.events,[]);
});

test('owned thumbnail cleanup survives stale project context while describe and frame remain guarded',()=>{
 const h=host(),s=h.call('getState').result;h.app.project.revision++;const payload={action:'cleanup',jobId:'owned-random-job',context:s.context,expectedRevision:s.projectRevision},cleanup=h.call('thumbnailAction',payload);assert.equal(cleanup.ok,true,cleanup.error?.message);assert.equal(cleanup.result.cleaned,true);assert.deepEqual(h.events.map(e=>e.kind),['thumbnailCleanup']);assert.deepEqual(JSON.parse(JSON.stringify(h.events[0].options)),payload);
 assert.equal(h.call('thumbnailAction',{action:'cleanup',jobId:'owned-random-job'}).ok,true);
 for(const action of ['describe','frame']){const r=h.call('thumbnailAction',{action,context:s.context,expectedRevision:s.projectRevision});assert.equal(r.ok,false);assert.equal(r.error.code,'STALE_PROJECT');assert.equal(h.call('thumbnailAction',{action}).error.code,'CONTEXT_REQUIRED');}
});

test('facade preserves typed read-only text descriptors and refuses before any mutation',()=>{const h=host({controls:{101:[{id:'pc:101:fauxBold1',name:'Bold',type:'checkbox',semantic:'fauxBold',line:1,group:'Text 1',value:false,enabled:false,readOnlyCode:'TEXT_MIXED_STYLE',readOnlyReason:'Mixed styles'}]},instances:{101:[{instanceId:'one',variantId:'pc-fixture'}]}}),s=h.call('getState').result,d=s.controls[0];assert.equal(d.enabled,false);assert.equal(h.call('setControl',{id:d.id,value:true,context:s.context}).error.code,'TEXT_MIXED_STYLE');assert.deepEqual(h.events,[]);});

test('precomp text side effects are preflighted across every target and equal leading still writes',()=>{const controls={101:[{id:'pc:101:leading1',name:'Leading',type:'number',semantic:'leading',line:1,group:'Text 1',value:72}],102:[{id:'pc:102:leading1',name:'Leading',type:'number',semantic:'leading',line:1,group:'Text 1',value:72}]},h=host({selected:[1,2],controls,instances:{101:[{instanceId:'a',variantId:'pc-fixture'}],102:[{instanceId:'b',variantId:'pc-fixture'}]}}),s=h.call('getState').result;let deny=true;h.modules.cpPrecomp.preflightControl=(layer)=>{h.events.push({kind:'textPreflight',id:layer.id});if(layer.id===102&&deny)throw Object.assign(Error('Animated text'),{code:'TEXT_ANIMATED'});return{sideEffects:true};};const payload={id:s.controls[0].id,value:72,context:s.context};assert.equal(h.call('setControl',payload).error.code,'TEXT_ANIMATED');assert.deepEqual(h.events.map(e=>e.kind),['textPreflight','textPreflight']);deny=false;h.events.length=0;assert.equal(h.call('setControl',payload).result.changedControls,2);assert.deepEqual(h.events.map(e=>e.kind),['textPreflight','textPreflight','begin','set','set','end']);});

test('precomp document snapshot restores coupled text fields on a later failure',()=>{const controls={101:[{id:'pc:101:leading1',name:'Leading',type:'number',semantic:'leading',line:1,group:'Text 1',value:72}],102:[{id:'pc:102:leading1',name:'Leading',type:'number',semantic:'leading',line:1,group:'Text 1',value:72}]},h=host({selected:[1,2],controls,instances:{101:[{instanceId:'a',variantId:'pc-fixture'}],102:[{instanceId:'b',variantId:'pc-fixture'}]}}),s=h.call('getState').result,docs={101:{leading:72,autoLeading:true},102:{leading:72,autoLeading:true}};h.modules.cpPrecomp.snapshotControl=layer=>({...docs[layer.id]});h.modules.cpPrecomp.restoreControl=(layer,id,snapshot)=>{docs[layer.id]={...snapshot};h.events.push({kind:'restoreDocument'});};h.modules.cpPrecomp.setControl=(layer,id,value)=>{docs[layer.id]={leading:value,autoLeading:false};if(layer.id===102)throw Error('injected later native write failure');};assert.equal(h.call('setControl',{id:s.controls[0].id,value:90,context:s.context}).ok,false);assert.deepEqual(docs,{101:{leading:72,autoLeading:true},102:{leading:72,autoLeading:true}});assert.equal(h.events.filter(e=>e.kind==='restoreDocument').length,2);});


test('texture instances receive auto Edit, typed controls and their own source role',()=>{const h=host();h.modules.cpTexture={instances:l=>l.id===101?[{kind:'texture',instanceId:'tex',variantId:'texture',name:'Own image'}]:[],controls:()=>[{id:'choke',name:'Choke',type:'slider',semantic:'choke',value:50,group:'Texture'}],canApply:()=>false};const reply=h.call('getState');assert.equal(reply.ok,true,reply.error?.message);const s=reply.result;assert.equal(s.applied.length,1);assert.equal(s.applied[0].kind,'texture');assert.equal(s.applied[0].name,'Own image');assert.equal(s.controls[0].id,'texture:101:choke');assert.equal(s.wantsRevealEditTab,true);assert.equal(s.precompApplyOptions.textureSelected,true);assert.equal(s.precompApplyOptions.canApplyTexture,false);assert.equal(s.precompApplyOptions.canReplaceTexture,true);assert.deepEqual(h.events,[]);});
test('library Texture dispatch preserves captured target and never takes ordinary media replacement path',()=>{const h=host();h.modules.cpTexture={instances:()=>[],canApply:()=>true,preflightTarget:l=>h.events.push({kind:'texturePreflight',id:l.id}),apply:(l,s,o)=>{h.events.push({kind:'textureApply',id:l.id,source:s.id,options:o});return{layers:[{id:700}],instanceId:'t700'};}};h.modules.cpWorkspace.find=()=>({id:'media',name:'Own image',kind:'image',path:'D:/own/tex.png'});h.modules.cpWorkspace.importMedia=()=>({item:{id:500}});const context=h.call('getState').result.context,r=h.call('importLibraryItem',{id:'media',context,options:{insertAsTexture:true}});assert.equal(r.ok,true,r.error?.message);assert.equal(r.result.addedLayerId,700);assert.deepEqual(h.events.map(e=>e.kind),['texturePreflight','begin','textureApply','end']);assert.equal(h.events[2].options.sourceRef.path,'D:/own/tex.png');});
test('stale texture context and unsupported source reject before import and Undo',()=>{const h=host();let imports=0;h.modules.cpTexture={instances:()=>[],canApply:()=>true,preflightTarget(){}};h.modules.cpWorkspace.find=()=>({id:'audio',kind:'audio',path:'D:/own/audio.wav'});h.modules.cpWorkspace.importMedia=()=>{imports++;return{item:{id:5}};};const context=h.call('getState').result.context;const unsupported=h.call('importLibraryItem',{id:'audio',context,options:{insertAsTexture:true}});assert.equal(unsupported.error.code,'TEXTURE_SOURCE_REQUIRED');h.layers[0].selected=false;const stale=h.call('importLibraryItem',{id:'audio',context,options:{insertAsTexture:true}});assert.equal(stale.error.code,'SELECTION_CHANGED');assert.equal(imports,0);assert.deepEqual(h.events,[]);});

test('Texture replacement preflights animation preservation before importing media or opening Undo',()=>{const h=host();let imports=0;h.modules.cpTexture={instances:l=>l.id===101?[{kind:'texture',instanceId:'t',variantId:'texture'}]:[],controls:()=>[],canApply:()=>false,preflightReplace(){throw Object.assign(new Error('Animated controls must be kept'),{code:'TEXTURE_CONTROL_ANIMATED'});}};h.modules.cpWorkspace.find=()=>({id:'image',kind:'image',path:'D:/own/image.png'});h.modules.cpWorkspace.importMedia=()=>{imports++;return{item:{id:5}};};const context=h.call('getState').result.context,result=h.call('replaceLibraryItem',{id:'image',context,options:{insertAsTexture:true,keepOtherProperties:true}});assert.equal(result.error.code,'TEXTURE_CONTROL_ANIMATED');assert.equal(imports,0);assert.deepEqual(h.events,[]);});

test('library selection stamp is checked before native mutation and retained on preset read',()=>{
 for(const method of ['importLibraryItem','replaceLibraryItem']){
  const h=host(),stamp={path:'c:/media/a.png',kind:'image',size:7,modifiedMs:123},context=h.call('getState').result.context;
  h.modules.cpWorkspace.find=(id,expected)=>{if(JSON.stringify(expected)!==JSON.stringify(stamp))throw Object.assign(Error('Changed source'),{code:'LIBRARY_SOURCE_CHANGED'});throw Object.assign(Error('Verified selection, deliberately stopped'),{code:'EXPECTED_STAMP_RECEIVED'});};
  const result=h.call(method,{id:'a',sourceStamp:stamp,context});assert.equal(result.error.code,'EXPECTED_STAMP_RECEIVED');assert.deepEqual(h.events,[]);
 }
 const h=host(),stamp={path:'c:/preset.json',kind:'preset',size:5,modifiedMs:123},context=h.call('getState').result.context;
 h.modules.cpWorkspace.find=()=>({id:'own',kind:'preset',sourceStamp:stamp});
 h.modules.cpWorkspace.readPreset=(id,expected)=>{if(JSON.stringify(expected)!==JSON.stringify(stamp))throw Object.assign(Error('Missing stamp'),{code:'MISSING_STAMP'});throw Object.assign(Error('Stopped before Undo'),{code:'EXPECTED_STAMP_RECEIVED'});};
 assert.equal(h.call('importLibraryItem',{id:'own',sourceStamp:stamp,context}).error.code,'EXPECTED_STAMP_RECEIVED');assert.deepEqual(h.events,[]);
});
test('FFX revalidation rejects a source changed after lookup before an Undo group or applyPreset',()=>{
 const h=host(),stamp={path:'c:/own.ffx',kind:'animation-preset',size:4,modifiedMs:123},context=h.call('getState').result.context;let reads=0,applies=0;
 h.modules.cpWorkspace.find=()=>{if(++reads>1)throw Object.assign(Error('Changed'),{code:'LIBRARY_SOURCE_CHANGED'});return{id:'own',kind:'animation-preset',path:'c:/own.ffx',sourceStamp:stamp};};h.layers.forEach(l=>l.applyPreset=()=>applies++);
 const result=h.call('importLibraryItem',{id:'own',sourceStamp:stamp,context});assert.equal(result.ok,false);assert.equal(result.error.code,'LIBRARY_SOURCE_CHANGED');assert.equal(applies,0);assert.deepEqual(h.events,[]);
});
test('audio preparation forwards source selection and options through the existing context guard',()=>{
 const h=host(),context=h.call('getState').result.context,sourceStamp={path:'c:/sound.wav',kind:'audio',size:8,modifiedMs:123},options={pitchShift:12,reverse:true};
 h.modules.cpWorkspace.prepareAudioImport=args=>({sourceStamp:args.sourceStamp,options:args.options});
 assert.deepEqual(h.call('prepareAudioImport',{id:'sound',context,sourceStamp,options}).result,{sourceStamp,options});assert.deepEqual(h.events,[]);
});


function presetRevisionHost(){
 const h=host(),owned=[{instanceId:'own-transition',variantId:'pc-fixture',title:'Owned',direction:'both',type:1}],model={value:3.25};
 h.modules.cpOverlay.instances=()=>owned.map(x=>({...x}));h.modules.cpOverlay.controls=()=>[];
 for(const action of ['reset','remove','upgradeTimeline'])h.modules.cpOverlay[action]=()=>{model.value=action==='reset'?2:0;h.app.project.revision++;h.events.push({kind:action});return{changed:true};};
 h.modules.cpOverlay.serialize=()=>({schemaVersion:2,kind:'overlay',plans:[{type:1,direction:'both',markers:[]}]});
 h.modules.cpOverlay.paste=()=>{model.value=9;h.app.project.revision++;h.events.push({kind:'paste'});return{pasted:1};};return {h,model};
}
for(const action of ['reset','remove','upgradeTimeline','paste'])test('preset '+action+' rejects a provided stale revision before Undo/native/clipboard writes',()=>{
 const {h,model}=presetRevisionHost(),s=h.call('getState').result;h.modules.cpFacadeSession.clipboard=[{schemaVersion:2,kind:'overlay',plans:[{type:1,direction:'both',markers:[]}]}];const clipboard=JSON.stringify(h.modules.cpFacadeSession.clipboard);h.app.project.revision++;const revision=h.app.project.revision;
 const r=h.call('presetAction',{action,context:s.context,expectedRevision:s.projectRevision,instanceId:action==='paste'?undefined:'own-transition'});assert.equal(r.ok,false);assert.equal(r.error.code,'STALE_PROJECT');assert.equal(model.value,3.25);assert.equal(h.app.project.revision,revision);assert.equal(JSON.stringify(h.modules.cpFacadeSession.clipboard),clipboard);assert.deepEqual(h.events,[]);
});
test('stale copy leaves the previous session clipboard intact',()=>{const {h}=presetRevisionHost(),s=h.call('getState').result;h.modules.cpFacadeSession.clipboard=[{kind:'prior-owned-clipboard'}];h.app.project.revision++;const r=h.call('presetAction',{action:'copy',context:s.context,expectedRevision:s.projectRevision});assert.equal(r.ok,false);assert.equal(r.error.code,'STALE_PROJECT');assert.equal(h.modules.cpFacadeSession.clipboard[0].kind,'prior-owned-clipboard');assert.deepEqual(h.events,[]);});
test('removePreset alias preserves expectedRevision and refuses stale destructive action',()=>{const {h,model}=presetRevisionHost(),s=h.call('getState').result;h.app.project.revision++;const r=h.call('removePreset',{id:s.applied[0].id,context:s.context,expectedRevision:s.projectRevision});assert.equal(r.ok,false);assert.equal(r.error.code,'STALE_PROJECT');assert.equal(model.value,3.25);assert.deepEqual(h.events,[]);});
test('current and omitted optional revisions preserve preset reset compatibility',()=>{for(const include of [true,false]){const {h,model}=presetRevisionHost(),s=h.call('getState').result,args={action:'reset',context:s.context,instanceId:'own-transition'};if(include)args.expectedRevision=s.projectRevision;const r=h.call('presetAction',args);assert.equal(r.ok,true,r.error?.message);assert.equal(model.value,2);assert.deepEqual(h.events.map(x=>x.kind),['begin','reset','end']);}});
test('provided malformed revision fails before preset action',()=>{for(const v of [null,'1',-1]){const {h}=presetRevisionHost(),s=h.call('getState').result;const r=h.call('presetAction',{action:'reset',context:s.context,expectedRevision:v});assert.equal(r.ok,false);assert.equal(r.error.code,'STALE_PROJECT');assert.deepEqual(h.events,[]);}});


test('library preview destination is advertised and passed through without active composition or Undo',()=>{const h=host({active:false}),args={id:'own',sourceStamp:{path:'d:/own.mov',kind:'video',size:3,modifiedMs:1}},expected={schemaVersion:1,itemId:'own'};let calls=0;h.modules.cpWorkspace.libraryPreviewDestination=options=>{calls++;assert.deepEqual(JSON.parse(JSON.stringify(options)),args);return expected;};assert(h.call('hostStatus').result.methods.includes('libraryPreviewDestination'));assert.deepEqual(h.call('libraryPreviewDestination',args).result,expected);assert.equal(calls,1);assert.deepEqual(h.events,[]);});
test('library preview resolver refusal propagates without Undo or native write',()=>{const h=host({active:false});h.modules.cpWorkspace.libraryPreviewDestination=()=>{throw Object.assign(Error('stale'),{code:'LIBRARY_SOURCE_CHANGED'});};const r=h.call('libraryPreviewDestination',{id:'own',sourceStamp:{}});assert.equal(r.ok,false);assert.equal(r.error.code,'LIBRARY_SOURCE_CHANGED');assert.deepEqual(h.events,[]);});

test('readonly thumbnail source is advertised and resolves by registered id plus exact stamp without active comp or Undo',()=>{const h=host({active:false}),stamp={path:'c:/own.aep',kind:'project',size:40,modifiedMs:1};let seen;h.modules.cpWorkspace.find=(id,s)=>{seen={id,stamp:s};return{id:'own',kind:'project',path:'C:/own.aep',sourceStamp:stamp};};assert(h.call('hostStatus').result.methods.includes('resolveThumbnailSource'));const r=h.call('resolveThumbnailSource',{id:'own',sourceStamp:stamp,path:'C:/untrusted.aep'});assert.equal(r.ok,true,r.error?.message);assert.deepEqual(JSON.parse(JSON.stringify(seen)),{id:'own',stamp});assert.deepEqual(r.result,{schemaVersion:1,id:'own',kind:'project',path:'C:/own.aep',sourceStamp:stamp,missing:false,ambiguous:false});assert.deepEqual(h.events,[]);});
 test('thumbnail source resolver refuses missing stamp, nonproject, missing/ambiguous and propagates membership failure before any native mutation',()=>{for(const row of [{id:'own',kind:'image',path:'C:/a.png'},{id:'own',kind:'project',path:'C:/a.aep',missing:true},{id:'own',kind:'project',path:'C:/a.aep',ambiguous:true}]){const h=host({active:false});h.modules.cpWorkspace.find=()=>row;assert.equal(h.call('resolveThumbnailSource',{id:'own',sourceStamp:{}}).ok,false);assert.deepEqual(h.events,[]);}const h=host({active:false});let count=0;h.modules.cpWorkspace.find=()=>{count++;throw Object.assign(Error('stale'),{code:'LIBRARY_SOURCE_CHANGED'});};assert.equal(h.call('resolveThumbnailSource',{id:'own'}).ok,false);assert.equal(count,0);assert.equal(h.call('resolveThumbnailSource',{id:'own',sourceStamp:{}}).error.code,'LIBRARY_SOURCE_CHANGED');assert.deepEqual(h.events,[]);});
