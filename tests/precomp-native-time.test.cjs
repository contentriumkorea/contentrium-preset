const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

// Reuse only host declarations, without registering the baseline suites again.
const baseline=fs.readFileSync(path.join(__dirname,'precomp-engine.test.cjs'),'utf8');
const makeHost=new Function('require','__dirname',baseline.slice(0,baseline.indexOf("test("))+baseline.slice(baseline.indexOf('function host('),baseline.indexOf('function clockAt(')).replace('return{api:context.$.cpPrecomp,target','return{context,api:context.$.cpPrecomp,target')+'\nreturn host;')(require,__dirname);
const timelineFixture=fs.readFileSync(path.join(__dirname,'precomp-timeline.test.cjs'),'utf8');
const timelineHost=new Function('makeHost','vm','fs','path','__dirname',timelineFixture.slice(timelineFixture.indexOf('function host('),timelineFixture.indexOf("test('new title/shape"))+'\nreturn host;')(makeHost,vm,fs,path,__dirname);
const ENDPOINT=1.1669010481836,QUANTIZED=1.16689453125;
function close(actual,expected,message){assert.ok(Math.abs(actual-expected)<=1e-9,`${message||'time'}: ${actual} != ${expected}`);}

function coupledHost(options={}){
 const f=timelineHost(true,true),events=[],state=new WeakMap(),sourceState=new WeakMap();
 function source(source){
  if(sourceState.has(source))return source;
  let duration=source.duration+(options.durationDelta||0);
  Object.defineProperty(source,'duration',{configurable:true,get(){events.push({op:'get',target:source,field:'duration',value:duration});return duration;},set(value){events.push({op:'set',target:source,field:'duration',value,previous:duration});duration=value;}});
  sourceState.set(source,{set(value){duration=value;}});
  const duplicate=source.duplicate;
  function copy(){const next=duplicate.call(source);source.duplicate=copy;return decorateCopy(next);}
  source.duplicate=copy;
  return source;
 }
 function decorateCopy(copy){
  // The timeline fixture's duplicator copies the existing native property graph.
  // Do not inject the creation-only durationDelta again into transaction copies.
  const delta=options.durationDelta;options.durationDelta=0;
  try{return source(copy);}finally{options.durationDelta=delta;}
 }
 const addComp=f.context.app.project.items.addComp;
 f.context.app.project.items.addComp=function(...args){return source(addComp(...args));};
 const add=f.target.layers.add;
 f.target.layers.add=function(source){
  const layer=add.call(this,source),bounds={startTime:0,inPoint:0,outPoint:source.duration+(options.initialOutDelta||0)};
  state.set(layer,bounds);
  for(const field of ['startTime','inPoint','outPoint'])Object.defineProperty(layer,field,{configurable:true,get(){events.push({op:'get',target:layer,field,value:bounds[field]});return bounds[field];},set(value){
   const previous=bounds[field];events.push({op:'set',target:layer,field,value,previous});
   if(field==='startTime'){const readback=value+(options.startReadbackDelta||0),delta=readback-previous;bounds.inPoint+=delta;bounds.outPoint+=delta;bounds.startTime=readback;}
   else if(field==='inPoint'){
    bounds.inPoint=value;
    // Inject only the recorded post-remap equal-inPoint side effect. This is a
    // receipt reproducer, not a claim about every AE version or setter sequence.
    if(options.receipt&&layer.timeRemapEnabled&&value===previous)bounds.outPoint=QUANTIZED;
   }else bounds.outPoint=options.receipt&&Math.abs(value-ENDPOINT)<1e-8?QUANTIZED:value;
  }});
  const replace=layer.replaceSource;
  layer.replaceSource=function(next){
   events.push({op:'rebind',target:layer,source:next});replace.call(this,next);
   if(options.perturbRebind){bounds.startTime+=.1;bounds.inPoint+=.2;bounds.outPoint+=.3;}
   if(options.afterRebind)options.afterRebind(layer,next,events);
  };
  return layer;
 };
 f.events=events;f.options=options;f.bounds=layer=>state.get(layer);f.sourceDuration=(s,v)=>sourceState.get(s).set(v);
 f.clear=()=>{events.length=0;f.audioWrites.length=0;f.writes.length=0;};
 f.sets=(target,field)=>events.filter(e=>e.op==='set'&&e.target===target&&(!field||e.field===field));
 f.rebinds=layer=>events.filter(e=>e.op==='rebind'&&e.target===layer);
 return f;
}
function apply(f,id='236d',options={}){return f.api.apply(f.target,{id},{time:1,...options},'').layers[0];}
function control(f,root,name){const c=f.api.controls([root]).find(c=>c.name===name);assert.ok(c,`${name} control exists`);return c;}
function markers(f,owner){return JSON.stringify(f.timeline().read(owner));}
function snapshot(f,root){const remap=root.property('ADBE Time Remapping');return{source:root.source,start:root.startTime,inside:root.inPoint,outside:root.outPoint,comment:root.comment,rootMarkers:markers(f,root),sourceMarkers:markers(f,root.source),expression:remap.expression,expressionEnabled:remap.expressionEnabled,keys:JSON.stringify(remap.keys),enabled:root.timeRemapEnabled};}
function assertSnapshot(f,root,before){assert.equal(root.source,before.source);close(root.startTime,before.start);close(root.inPoint,before.inside);close(root.outPoint,before.outside);assert.equal(root.comment,before.comment);assert.equal(markers(f,root),before.rootMarkers);assert.equal(markers(f,root.source),before.sourceMarkers);const p=root.property('ADBE Time Remapping');assert.equal(p.expression,before.expression);assert.equal(p.expressionEnabled,before.expressionEnabled);assert.equal(JSON.stringify(p.keys),before.keys);assert.equal(root.timeRemapEnabled,before.enabled);}

test('fresh Flash keeps the native positioned endpoint without equal bounds/duration writes or rebind',()=>{
 const f=coupledHost({receipt:true});f.enableAudio();const root=apply(f),m=JSON.parse(root.comment.split('|')[1]);
 close(root.outPoint,ENDPOINT,'recorded native endpoint');close(root.source.duration,.26693360026693);
 assert.equal(f.sets(root,'inPoint').length,0);assert.equal(f.sets(root,'outPoint').length,0);assert.equal(f.sets(root.source,'duration').length,0);assert.equal(f.rebinds(root).length,0);
 close(f.timeline().read(root)[0].time,1);close(f.timeline().read(root.source)[0].time,f.api.profile('236d').sourceCut);
 assert.ok(root.source.numLayers>0);assert.ok(root.source._layers.some(l=>l.name.startsWith('CP Sound ')));assert.equal(m.timelineInitialized,true);assert.equal(m.clockVersion,3);assert.equal(root.timeRemapEnabled,true);
});

test('live getters after startTime skip a now-correct out, but still write a genuinely different out',()=>{
 for(const delta of [0,.01]){const f=coupledHost({initialOutDelta:delta}),root=apply(f);close(root.outPoint,ENDPOINT);assert.equal(f.sets(root,'outPoint').length,delta?1:0);const start=f.events.findIndex(e=>e.op==='set'&&e.target===root&&e.field==='startTime');assert.ok(start>=0);assert.ok(f.events.slice(start+1).some(e=>e.op==='get'&&e.target===root&&e.field==='outPoint'));}
});

test('apply uses the native post-start readback for its untrimmed inPoint',()=>{
 const f=coupledHost({startReadbackDelta:2e-9}),root=apply(f);
 assert.equal(f.sets(root,'inPoint').length,0);close(root.outPoint-root.inPoint,f.api.profile('236d').duration);
});

test('source duration write and changed/rebind branch share the 1e-9 predicate',()=>{
 for(const delta of [5e-10,1e-9-Number.EPSILON,1e-9,2e-9]){const f=coupledHost({durationDelta:delta}),root=apply(f),different=Math.abs((f.api.profile('236d').duration+delta)-f.api.profile('236d').duration)>1e-9;
  assert.equal(f.sets(root.source,'duration').length,different?1:0,`duration delta ${delta}`);assert.equal(f.rebinds(root).length,different?1:0,`rebind delta ${delta}`);assert.equal(JSON.parse(root.comment.split('|')[1]).timelineInitialized,true);assert.equal(root.property('ADBE Time Remapping').expressionEnabled,true);
 }
});

test('initial nondefault duration keeps native content, audio, CUT and clock initialization',()=>{
 const f=coupledHost();f.enableAudio();const root=apply(f,'236d',{duration:.6}),m=JSON.parse(root.comment.split('|')[1]);close(root.source.duration,.6);close(root.outPoint-root.inPoint,.6);close(f.timeline().read(root)[0].time,1);close(m.cutOffset,.6*f.api.profile('236d').cutOffset/f.api.profile('236d').duration);
 assert.ok(root.source._layers.some(l=>l.name==='CP Node 1'));assert.ok(f.audioWrites.length>0);assert.equal(m.timelineInitialized,true);assert.equal(m.clockVersion,3);assert.ok(f.writes.length>0);
});

test('unshared Flash Amount and Volume edits keep exact corrected bounds and CUTs while changing values',()=>{
 const f=coupledHost({receipt:true});f.enableAudio();const root=apply(f),before=snapshot(f,root),amount=control(f,root,'Flash Amount'),volume=control(f,root,'Volume');f.clear();
 for(const value of [99,100]){f.api.setControl(root,amount.id,value);assert.equal(f.api.controls([root]).find(c=>c.id===amount.id).value,value);}
 for(const value of [-1,0]){f.api.setControl(root,volume.id,value);assert.equal(f.api.controls([root]).find(c=>c.id===volume.id).value,value);for(const sound of root.source._layers.filter(l=>l.name.startsWith('CP Sound ')))assert.equal(sound.property('ADBE Audio Group').property('ADBE Audio Levels').expression,`value + [${value},${value}]`);}
 close(root.startTime,before.start);close(root.inPoint,before.inside);close(root.outPoint,before.outside);assert.equal(markers(f,root),before.rootMarkers);assert.equal(markers(f,root.source),before.sourceMarkers);assert.equal(root.source,before.source);assert.equal(f.sets(root).length,0);assert.equal(f.rebinds(root).length,0);
});

test('real Flash Duration captures the moved CUT fraction before wrapper setters and retains native/audio work',()=>{
 const f=coupledHost({receipt:true});f.enableAudio();const root=apply(f),m=JSON.parse(root.comment.split('|')[1]);f.timeline().set(root,m.instanceId,'cut',{time:1.04});const before=snapshot(f,root),fraction=(1.04-before.inside)/(before.outside-before.inside),duration=control(f,root,'Duration');f.clear();f.api.setControl(root,duration.id,.6);
 close(root.source.duration,.6);close(root.inPoint,1.04-fraction*.6);close(root.outPoint-root.inPoint,.6);close(f.timeline().read(root)[0].time,1.04);close(JSON.parse(root.comment.split('|')[1]).cutFraction,fraction);assert.equal(f.sets(root.source,'duration').length,1);assert.equal(f.rebinds(root).length,2);assert.ok(f.sets(root,'outPoint').length>0);assert.ok(f.audioWrites.length>0);assert.equal(root.property('ADBE Time Remapping').expressionEnabled,true);assert.equal(f.items.includes(before.source),false);
});

test('bodyDuration retains live title/shape transition spans and regenerates the requested body',()=>{
 for(const id of ['31ce','1d61']){const f=coupledHost(),root=apply(f,id),body=control(f,root,'Duration without transitions'),beforeSpan=root.outPoint-root.inPoint,requested=body.value+.6;f.clear();f.api.setControl(root,body.id,requested);close(root.outPoint-root.inPoint,beforeSpan+.6);close(root.source.duration,beforeSpan+.6);close(control(f,root,'Duration without transitions').value,requested);assert.equal(f.sets(root.source,'duration').length,1);assert.ok(f.sets(root,'outPoint').length);assert.equal(f.timeline().read(root).length,2);assert.equal(root.property('ADBE Time Remapping').expressionEnabled,true);}
});

test('shared control edit isolates source, preserves peers and skips only equal restoration fields',()=>{
 for(const perturb of [false,true]){const f=coupledHost({receipt:!perturb}),root=apply(f),original=root.source,peer=f.target.layers.add(original);peer.comment=root.comment;const before=snapshot(f,root),amount=control(f,root,'Flash Amount'),peerValues=JSON.stringify(f.api.controls([peer]).map(c=>c.value));f.options.perturbRebind=perturb;f.clear();f.api.setControl(root,amount.id,17);
  assert.notEqual(root.source,original);assert.equal(peer.source,original);assert.equal(JSON.stringify(f.api.controls([peer]).map(c=>c.value)),peerValues);assert.equal(control(f,root,'Flash Amount').value,17);close(root.startTime,before.start);close(root.inPoint,before.inside);close(root.outPoint,before.outside);assert.equal(markers(f,root),before.rootMarkers);assert.equal(markers(f,root.source),before.sourceMarkers);
  for(const field of ['startTime','inPoint','outPoint'])assert.equal(f.sets(root,field).length,perturb?1:0,field);assert.ok(f.sets(root).every(e=>Math.abs(e.previous-e.value)>1e-9));
 }
});

test('same Duration transaction still copies/cleans source but does not perturb bounds or CUT fraction',()=>{
 const f=coupledHost({receipt:true}),root=apply(f),id=JSON.parse(root.comment.split('|')[1]).instanceId;f.timeline().set(root,id,'cut',{time:1.04});const before=snapshot(f,root),duration=control(f,root,'Duration'),fraction=(1.04-before.inside)/(before.outside-before.inside);f.clear();f.api.setControl(root,duration.id,duration.value);
 assert.notEqual(root.source,before.source);assert.equal(f.items.includes(before.source),false);assert.equal(f.rebinds(root).length,1);assert.equal(f.sets(root).length,0);assert.equal(f.sets(root.source,'duration').length,0);close(root.startTime,before.start);close(root.inPoint,before.inside);close(root.outPoint,before.outside);close(JSON.parse(root.comment.split('|')[1]).cutFraction,fraction);assert.equal(markers(f,root),before.rootMarkers);assert.equal(root.property('ADBE Time Remapping').expressionEnabled,true);
});

test('transaction failure after native regeneration restores source, bounds, remap, metadata and markers',()=>{
 for(const perturb of [false,true]){const f=coupledHost(),root=apply(f),remap=root.property('ADBE Time Remapping');remap.expression='value + 42';remap.expressionEnabled=true;remap.keys[0].value=.0123;const before=snapshot(f,root),duration=control(f,root,'Duration');f.options.perturbRebind=perturb;let comment=root.comment,failed=false;
  Object.defineProperty(root,'comment',{get(){return comment;},set(value){if(!failed&&JSON.parse(value.split('|')[1]).duration===.6){failed=true;throw Error('Injected post-native/clock save failure');}comment=value;}});
  f.clear();assert.throws(()=>f.api.setControl(root,duration.id,.6),e=>/Injected/.test(e.message)&&e.rollbackError===undefined);assertSnapshot(f,root,before);assert.equal(f.items.filter(i=>i.comment===before.source.comment).length,1);assert.ok(f.sets(root).every(e=>Math.abs(e.previous-e.value)>1e-9));}
});

test('shared-source rebind failure rolls back original source and genuine bounds, cleaning only its copy',()=>{
 for(const perturb of [false,true]){const f=coupledHost(),root=apply(f),original=root.source,peer=f.target.layers.add(original);peer.comment=root.comment;const before=snapshot(f,root),amount=control(f,root,'Flash Amount');f.options.perturbRebind=perturb;let failed=false;f.options.afterRebind=(layer,next)=>{if(next!==original&&!failed){failed=true;throw Error('Injected isolate rebind failure');}};f.clear();assert.throws(()=>f.api.setControl(root,amount.id,17),/Injected isolate/);assertSnapshot(f,root,before);assert.equal(peer.source,original);assert.equal(f.items.filter(i=>i.comment===original.comment).length,1);assert.ok(f.sets(root).every(e=>Math.abs(e.previous-e.value)>1e-9));}
});

test('transaction restore/cleanup failure remains attached as rollbackError',()=>{
 for(const failure of ['restore','cleanup']){const f=coupledHost(),root=apply(f),original=root.source,duration=control(f,root,'Duration'),ensure=f.timeline().ensure;let failed=false;f.timeline().ensure=function(...args){if(!failed){failed=true;throw Error('Injected action failure');}return ensure.apply(this,args);};f.options.afterRebind=(layer,next)=>{if(next===original&&failure==='restore')throw Error('Injected rollback restore failure');if(next!==original&&failure==='cleanup')next.remove=function(){throw Error('Injected rollback cleanup failure');};};assert.throws(()=>f.api.setControl(root,duration.id,.6),e=>/Injected action/.test(e.message)&&new RegExp(`rollback ${failure}`).test(e.rollbackError));}
});
