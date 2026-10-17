const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),acorn=require('acorn');
const sourcePath=path.join(__dirname,'../jsx/engine.jsx'),source=fs.readFileSync(sourcePath,'utf8'),existing=fs.readFileSync(path.join(__dirname,'engine.test.cjs'),'utf8'),hostNode=acorn.parse(existing,{ecmaVersion:'latest'}).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='host');
const host=new Function('fs','path','vm','assert','source','sourcePath','__dirname',existing.slice(hostNode.start,hostNode.end)+';return host;')(fs,path,vm,assert,source,sourcePath,__dirname);
function group(children=[],depth=1){return{propertyDepth:depth,numProperties:children.length,property:i=>children[i-1]};}
function fixture({kind='overlay',selected=[1],engine='extendscript'}={}){
 const h=host({selected}),owners={101:[{instanceId:'owned',variantId:'pc-fixture',name:'Owned',type:3,direction:'both',sourceId:501,legacyTimeline:true}]};let mode=engine,error='own native error',reads=0;
 Object.defineProperty(h.app.project,'expressionEngine',{get:()=>mode,set(){throw Error('diagnostic must not change engine');},configurable:true});
 h.setEngine=v=>mode=v;h.setError=v=>error=v;h.errorReads=()=>reads;
 const leaf={propertyDepth:2,expressionEnabled:false};Object.defineProperty(leaf,'expressionError',{get(){reads++;return error;},configurable:true});h.leaf=leaf;
 for(const l of h.layers){l.comment='';l.propertyDepth=0;l.numProperties=l.id===101?1:0;l.property=i=>typeof i==='number'&&i===1?group([leaf]):null;}
 const api={instances:l=>owners[l.id]||[],controls:()=>[]};
 if(kind==='overlay')h.modules.cpOverlay=api;
 if(kind==='precomp')Object.assign(h.modules.cpPrecomp,api);
 if(kind==='texture')Object.assign(h.modules.cpTexture,api);
 if(kind==='animated-font')h.modules.cpGlyph={...api};
 h.owners=owners;h.kind=kind;h.compSource=(id,children,comment='ContentriumPresetGenerated|owned')=>Object.assign(new h.comp.constructor(),{id,comment,numLayers:children.length,layer:i=>children[i-1]});
 h.state=()=>{const r=h.call('getState');assert.equal(r.ok,true,r.error?.message);assert.deepEqual(h.events,[],'diagnostics never write or open Undo');return r.result;};return h;
}
const warnings=s=>s.expressionWarnings||[];
test('legacy plus real error yields a persistent selected-owned warning without writes, including disabled expressions',()=>{const h=fixture(),a=h.state(),b=h.state();assert.equal(warnings(a).length,1);assert.deepEqual(warnings(b),warnings(a));assert.equal(warnings(a)[0].code,'LEGACY_EXPRESSION_ERRORS');assert.deepEqual(warnings(a)[0].rootLayerIds,[101]);assert.equal(h.leaf.expressionEnabled,false);assert.equal(h.errorReads(),2);});
test('legacy clear, modern typo, unknown engine and unowned/unselected errors never become legacy advisories',()=>{
 const modern=fixture({engine:'javascript-1.0'});assert.deepEqual(warnings(modern.state()),[]);assert.equal(modern.errorReads(),0,'modern path must not scan expression properties');
 for(const mode of ['other',undefined,null]){const h=fixture({engine:mode});h.setEngine(mode);assert.deepEqual(warnings(h.state()),[]);assert.equal(h.errorReads(),0);}
 const clear=fixture();clear.setError('');assert.deepEqual(warnings(clear.state()),[]);
 for(const selected of [[2],[]]){const h=fixture({selected});assert.deepEqual(warnings(h.state()),[]);assert.equal(h.errorReads(),0);}
 const ordinary=fixture();ordinary.owners[101]=[];assert.deepEqual(warnings(ordinary.state()),[]);assert.equal(ordinary.errorReads(),0);
});
test('actual source errors remain diagnosable when owned control validation fails',()=>{const h=fixture({kind:'animated-font'});h.modules.cpGlyph.controls=()=>{throw Object.assign(Error('owned consumer error'),{code:'GLYPH_BINDING_CHANGED'});};const s=h.state();assert.equal(s.hasError,true);assert.equal(s.errors[0].code,'GLYPH_BINDING_CHANGED');assert.equal(warnings(s).length,1);});
test('only matching generated dependencies are scanned, not arbitrary media comps',()=>{
 for(const owned of [true,false]){const h=fixture({kind:'precomp'});h.layers[0].numProperties=0;let reads=0;const p={propertyDepth:1,get expressionError(){reads++;return 'nested error';}},child={id:601,propertyDepth:0,numProperties:1,property:()=>p};h.layers[0].source=h.compSource(501,[child],owned?'ContentriumPresetGenerated|owned':'User media');const s=h.state();assert.equal(warnings(s).length,owned?1:0);assert.equal(reads,owned?1:0);}
});
test('nested generated sources are included but texture media dependencies remain outside scope',()=>{
 const h=fixture({kind:'precomp'});h.layers[0].numProperties=0;const p={propertyDepth:1,expressionError:'nested'},inner=h.compSource(502,[{id:701,propertyDepth:0,numProperties:1,property:()=>p}]),outer=h.compSource(501,[{id:601,propertyDepth:0,numProperties:0,source:inner}]);h.layers[0].source=outer;assert.equal(warnings(h.state()).length,1);
 const t=fixture({kind:'texture'});t.layers[0].numProperties=0;t.layers[0].source=t.compSource(501,[{id:601,propertyDepth:0,numProperties:0,source:inner}],'ContentriumTextureSource|owned');assert.deepEqual(warnings(t.state()),[]);
});
test('glyph source identity and exact ownership tag are both required',()=>{for(const [id,tag,expected]of [[501,'cpAnimatedFontSource|owned',1],[502,'cpAnimatedFontSource|owned',0],[501,'cpAnimatedFontSource|foreign',0]]){const h=fixture({kind:'animated-font'});h.layers[0].numProperties=0;h.layers[0].source=h.compSource(id,[{id:601,propertyDepth:0,numProperties:1,property:()=>h.leaf}],tag);assert.equal(warnings(h.state()).length,expected);}});
test('shared owned sources scan once per call, re-read next call and attribute each selected root',()=>{const h=fixture({kind:'precomp',selected:[1,2]});h.owners[102]=[...h.owners[101]];h.layers[0].numProperties=0;h.layers[1].numProperties=0;const source=h.compSource(501,[{id:601,propertyDepth:0,numProperties:1,property:()=>h.leaf}]);h.layers[0].source=h.layers[1].source=source;const a=h.state();assert.deepEqual(warnings(a)[0]?.rootLayerIds,[101,102]);assert.equal(h.errorReads(),1);h.setError('');const b=h.state();assert.deepEqual(warnings(b),[]);assert.equal(h.errorReads(),2);assert.notEqual(a.revision,b.revision);});
test('engine or selection changes remove a current advisory without retaining session cache',()=>{const h=fixture();assert.equal(warnings(h.state()).length,1);h.setEngine('javascript-1.0');assert.deepEqual(warnings(h.state()),[]);h.setEngine('extendscript');h.layers[0].selected=false;assert.deepEqual(warnings(h.state()),[]);});
test('budget exhaustion and owned source cycles cannot become clear or synthetic expression errors',()=>{
 const h=fixture();h.layers[0].numProperties=20001;h.layers[0].property=()=>({propertyDepth:1,expressionError:''});const s=h.state();assert.deepEqual(warnings(s),[]);assert.equal(s.expressionDiagnostics?.status,'incomplete');assert.equal(s.expressionDiagnostics?.reason,'budget');
 const cyclic=fixture({kind:'precomp'});cyclic.layers[0].numProperties=0;const child={id:601,propertyDepth:0,numProperties:0},comp=cyclic.compSource(501,[child]);child.source=comp;cyclic.layers[0].source=comp;assert.equal(cyclic.state().expressionDiagnostics?.status,'incomplete');
});
test('unavailable native getters produce incomplete coverage without false warning or failing getState',()=>{for(const field of ['expressionError','numProperties']){const h=fixture();h.setError('');Object.defineProperty(h.leaf,field,{get(){throw Error('native unavailable');},configurable:true});const s=h.state();assert.deepEqual(warnings(s),[]);assert.equal(s.expressionDiagnostics?.status,'incomplete');}});
test('a positive root remains observed even when a different selected branch is unavailable',()=>{const h=fixture({selected:[1,2]});h.owners[102]=[...h.owners[101]];h.layers[1].numProperties=1;h.layers[1].property=()=>{throw Error('unavailable');};const s=h.state();assert.equal(warnings(s).length,1);assert.deepEqual(warnings(s)[0].rootLayerIds,[101]);assert.equal(s.expressionDiagnostics?.status,'incomplete');});
test('changed revision, playhead, engine or selection during native reads discards the diagnostic snapshot',()=>{for(const change of [h=>h.app.project.revision++,h=>h.comp.time++,h=>h.setEngine('javascript-1.0'),h=>h.layers[0].selected=false]){const h=fixture();Object.defineProperty(h.leaf,'expressionError',{get(){change(h);return 'native error';},configurable:true});const s=h.state();assert.deepEqual(warnings(s),[]);assert.equal(s.expressionDiagnostics?.status,'incomplete');assert.equal(s.expressionDiagnostics?.reason,'changed');}});
test('unknown revision cannot yield an apparently complete legacy inspection',()=>{const h=fixture();h.app.project.revision=null;const s=h.state();assert.deepEqual(warnings(s),[]);assert.equal(s.expressionDiagnostics?.status,'incomplete');});

test('unavailable native playhead getter retains usable read-only state with incomplete diagnostics',()=>{
 const h=fixture();let reads=0;
 Object.defineProperty(h.comp,'time',{get(){reads++;throw Error('native time unavailable');},configurable:true});
 const beforeSettings=h.call('getSettings');assert.equal(beforeSettings.ok,true);
 const r=h.call('getState');assert.equal(r.ok,true,r.error?.message);
 assert.deepEqual(r.result.expressionWarnings,[]);assert.equal(r.result.expressionDiagnostics.status,'incomplete');assert.equal(r.result.expressionDiagnostics.reason,'unavailable');
 assert.equal(r.result.numSelectedLayers,1);assert.equal(r.result.applied[0].layerId,101);assert.equal(r.result.applied[0].instanceId,'owned');assert.equal(r.result.context.compositionId,h.comp.id);assert.equal(r.result.projectRevision,h.app.project.revision);
 assert.equal(h.errorReads(),0,'unavailable clock must not start native expression traversal');assert(reads>=1);assert.deepEqual(h.events,[],'advisory failure must never write or open Undo');
 assert.deepEqual(h.call('getSettings'),beforeSettings,'diagnostic failure cannot change application settings');
});
