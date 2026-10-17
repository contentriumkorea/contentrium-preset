const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'engine.test.cjs'),'utf8');
const host=new Function('require','__dirname',source+'\nreturn host;')(n=>n==='node:test'?()=>{}:require(n),__dirname);
function fixture(){const controls={101:[{id:'pc:101:a',name:'A',type:'slider',group:'First',propertySetSection:'Precomp Settings',value:12},{id:'pc:101:b',name:'B',type:'angle',group:'Second',propertySetSection:'Precomp Settings',value:45},{id:'pc:101:audio',name:'Sound',type:'checkbox',group:'Audio',value:true}],102:[{id:'pc:102:a',name:'A',type:'slider',group:'First',propertySetSection:'Precomp Settings',value:30},{id:'pc:102:b',name:'B',type:'angle',group:'Second',propertySetSection:'Precomp Settings',value:90},{id:'pc:102:audio',name:'Sound',type:'checkbox',group:'Audio',value:false}]};return{controls,h:host({controls,instances:{101:[{instanceId:'one',variantId:'pc-fixture'}],102:[{instanceId:'two',variantId:'pc-fixture'}]}})};}
test('whole property section captures both display subgroups and retains legacy group access',()=>{
 const {h,controls}=fixture(),state=h.call('getState').result,whole=state.controlGroups.find(g=>g.section===true);assert.ok(whole,'whole section exists');assert.equal(whole.controlIds.length,2);assert.deepEqual(whole.groupPath,state.controls[0].groupPath.slice(0,2));
 const legacy=state.controlGroups.find(g=>g.key==='precomp:pc-fixture:both:First');assert.ok(legacy);assert.equal(legacy.controlIds.length,1);
 const saved=h.call('propertySetAction',{action:'saveAs',groupKey:whole.key,name:'Whole'});assert.equal(saved.ok,true);controls[101][0].value=31;controls[101][1].value=91;
 const applied=h.call('propertySetAction',{action:'apply',groupKey:whole.key,presetId:saved.result.id});assert.equal(applied.ok,true);assert.equal(applied.result.appliedControls,2);assert.equal(controls[101][0].value,12);assert.equal(controls[101][1].value,45);assert.equal(controls[101][2].value,true);
 assert.equal(h.call('propertySetAction',{action:'getAvailablePresets',groupKey:whole.key}).result.matchingPreset,saved.result.id);
});
test('saved sets preflight all adapters before any Undo or write',()=>{
 const {h,controls}=fixture(),s=h.call('getState').result,key=s.controlGroups.find(g=>g.key.endsWith(':First')).key,saved=h.call('propertySetAction',{action:'saveAs',groupKey:key,name:'Saved'}).result;
 controls[101][0].value=40;h.layers[1].selected=true;const checked=[];h.modules.cpPrecomp.preflightControl=(l,id)=>{checked.push(l.id);if(l.id===102){const e=new Error('blocked');e.code='PREFLIGHT_REFUSED';throw e;}};
 const r=h.call('propertySetAction',{action:'apply',groupKey:key,presetId:saved.id});assert.equal(r.ok,false);assert.equal(r.error.code,'PREFLIGHT_REFUSED');assert.deepEqual(checked,[101,102]);assert.deepEqual(h.events,[]);assert.equal(controls[101][0].value,40);
});
test('saved set failure restores rich control snapshots without calling recovery setters again',()=>{
 const {h,controls}=fixture(),s=h.call('getState').result,key=s.controlGroups.find(g=>g.key.endsWith(':First')).key,saved=h.call('propertySetAction',{action:'saveAs',groupKey:key,name:'Saved'}).result;
 h.layers[1].selected=true;controls[101][0].value=40;let writes=0;const snapshots=[],restored=[];
 h.modules.cpPrecomp.snapshotControl=(l,id)=>{snapshots.push(l.id);return{before:controls[l.id][0].value,rich:'kept'};};h.modules.cpPrecomp.restoreControl=(l,id,v)=>{restored.push([l.id,v.rich]);controls[l.id][0].value=v.before;};
 h.modules.cpPrecomp.setControl=(l,id,v)=>{writes++;controls[l.id][0].value=v;if(l.id===102)throw new Error('late failure');};
 const r=h.call('propertySetAction',{action:'apply',groupKey:key,presetId:saved.id});assert.equal(r.ok,false);assert.equal(writes,2,'rollback uses restore adapter');assert.deepEqual(snapshots,[101,102]);assert.deepEqual(restored,[[102,'kept'],[101,'kept']]);assert.equal(controls[101][0].value,40);assert.equal(controls[102][0].value,30);
});

test('explicit selected-property capture wins over owned recipe and pins supplied project revision',()=>{
 const {h}=fixture(),s=h.call('getState').result,calls=[];h.modules.cpPrecomp.serialize=()=>{calls.push('recipe');return{kind:'precomp'};};h.modules.cpUserPreset.capture=(l,o)=>{calls.push(o);return{kind:'user'};};h.modules.cpWorkspace.savePreset=(o,data)=>data;
 const result=h.call('saveLibraryPreset',{name:'Selected',selectedOnly:true,includeSourceText:true,context:s.context,expectedRevision:s.projectRevision});assert.equal(result.ok,true);assert.equal(result.result.kind,'user');assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{selectedOnly:true,includeSourceText:true}]);
 calls.length=0;h.app.project.revision++;const stale=h.call('saveLibraryPreset',{name:'Stale',selectedOnly:true,context:s.context,expectedRevision:s.projectRevision});assert.equal(stale.ok,false);assert.equal(stale.error.code,'STALE_PROJECT');assert.deepEqual(calls,[]);
 const old=h.call('saveLibraryPreset',{name:'Recipe',context:s.context});assert.equal(old.ok,true);assert.equal(old.result.kind,'precomp');assert.deepEqual(calls,['recipe']);
});
test('generic library application forwards strict replaceText and overwrite to preflight and apply',()=>{
 for(const [input,expected]of [[{replaceText:true,overwrite:true},{replaceText:true,overwrite:true}],[{replaceText:'true',overwrite:1},{replaceText:false,overwrite:false}],[{},{replaceText:false,overwrite:false}]]){
  const {h}=fixture(),calls=[];h.modules.cpWorkspace.find=()=>({id:'owned-user',kind:'preset'});h.modules.cpWorkspace.readPreset=()=>({kind:'user'});h.modules.cpUserPreset.preflight=(l,d,o)=>calls.push(['preflight',o]);h.modules.cpUserPreset.apply=(l,d,o)=>{calls.push(['apply',o]);return{};};
  const r=h.call('importLibraryItem',{id:'owned-user',options:input});assert.equal(r.ok,true,r.error?.message);assert.equal(calls.length,2);for(const [phase,o]of calls){assert.equal(o.replaceText,expected.replaceText);assert.equal(o.overwrite,expected.overwrite);assert.equal(o.time,h.comp.time);if(phase==='apply')assert.equal(o.undoGroup,false);}
 }
});

test('clicked preset description is read-only, validates generic schema and detects nested Source Text',()=>{
 const {h}=fixture(),reads=[],stamp={size:42};let data={schemaVersion:1,kind:'user-property-preset',captureTime:0,properties:[{kind:'group',matchName:'ADBE Text Properties',children:[{kind:'property',matchName:'ADBE Text Document',valueType:'TEXT_DOCUMENT'}]}]};
 h.modules.cpWorkspace.readPreset=(id,sourceStamp)=>{reads.push({id,sourceStamp});return data;};
 assert.ok(h.call('hostStatus').result.methods.includes('describeLibraryPreset'));
 assert.deepEqual(h.call('describeLibraryPreset',{id:'one',sourceStamp:stamp}).result,{kind:'user-property-preset',containsSourceText:true});assert.deepEqual(JSON.parse(JSON.stringify(reads)),[{id:'one',sourceStamp:stamp}]);assert.deepEqual(h.events,[]);
 data={schemaVersion:1,kind:'precomp'};assert.deepEqual(h.call('describeLibraryPreset',{id:'one'}).result,{kind:'precomp',containsSourceText:false});
 for(const invalid of [{schemaVersion:9,kind:'user-property-preset',properties:[]},{schemaVersion:1,kind:'user-property-preset',properties:'bad'},null]){data=invalid;assert.equal(h.call('describeLibraryPreset',{id:'one'}).ok,false);}
});
test('library application refuses stale captured revision before reading or importing',()=>{
 const {h}=fixture(),s=h.call('getState').result;let reads=0;h.modules.cpWorkspace.find=()=>{reads++;return{};};h.app.project.revision++;
 const r=h.call('importLibraryItem',{id:'one',context:s.context,expectedRevision:s.projectRevision});assert.equal(r.ok,false);assert.equal(r.error.code,'STALE_PROJECT');assert.equal(reads,0);assert.deepEqual(h.events,[]);
});


test('saved settings mutation refuses an old dialog revision before writing storage or native controls',()=>{
 const {h}=fixture(),state=h.call('getState').result,key=state.controlGroups.find(g=>g.section).key;h.app.project.revision++;
 const r=h.call('propertySetAction',{action:'saveAs',groupKey:key,name:'Must refuse',context:state.context,expectedRevision:state.projectRevision});assert.equal(r.ok,false);assert.equal(r.error.code,'STALE_PROJECT');assert.deepEqual(h.events,[]);assert.deepEqual(h.call('propertySetAction',{action:'getAvailablePresets',groupKey:key}).result.presets,[]);
});
