const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const file=path.join(__dirname,'../jsx/tools-engine.jsx');
function leaf(name,times,values,selected){
 const p={name,matchName:name,propertyType:1,propertyValueType:1,selected:true};
 let keys=times.map((time,i)=>({time,value:values[i],selected:!selected||selected.includes(i+1),inEase:[{speed:100,influence:40}],outEase:[{speed:100,influence:60}],inType:2,outType:2}));
 Object.defineProperties(p,{numKeys:{get:()=>keys.length},selectedKeys:{get:()=>keys.flatMap((k,i)=>k.selected?[i+1]:[])},value:{get:()=>keys.length?keys[0].value:0}});
 p.keyTime=i=>keys[i-1].time;p.keyValue=i=>keys[i-1].value;p.keyInTemporalEase=i=>keys[i-1].inEase.map(x=>({...x}));p.keyOutTemporalEase=i=>keys[i-1].outEase.map(x=>({...x}));
 p.keyInInterpolationType=i=>keys[i-1].inType;p.keyOutInterpolationType=i=>keys[i-1].outType;
 p.setValueAtKey=(i,v)=>keys[i-1].value=v;p.setTemporalEaseAtKey=(i,a,b)=>{keys[i-1].inEase=a;keys[i-1].outEase=b;};p.setInterpolationTypeAtKey=(i,a,b)=>{keys[i-1].inType=a;keys[i-1].outType=b;};
 p.setTemporalContinuousAtKey=()=>{};p.setTemporalAutoBezierAtKey=()=>{};p.keyRoving=()=>false;p.isInterpolationTypeValid=()=>true;
 p.removeKey=i=>keys.splice(i-1,1);p.addKey=t=>{let at=keys.findIndex(k=>Math.abs(k.time-t)<1e-9);if(at<0){keys.push({time:t,value:0,selected:false,inEase:[{speed:0,influence:33}],outEase:[{speed:0,influence:33}],inType:1,outType:1});keys.sort((a,b)=>a.time-b.time);at=keys.findIndex(k=>k.time===t);}return at+1;};
 p.setSelectedAtKey=(i,v)=>keys[i-1].selected=v;p.keys=()=>keys;return p;
}
function setup(props){
 const group={propertyType:2,numProperties:props.length,property:n=>typeof n==='number'?props[n-1]:props.find(p=>p.name===n)};
 const layer={id:10,index:1,name:'Target',selected:true,locked:false,inPoint:0,outPoint:8,startTime:0,stretch:100,numProperties:1,property:n=>n===1||n==='Transform'?group:null};
 group.name='Transform';group.matchName='Transform';
 const comp={id:20,time:5,frameDuration:1/30,numLayers:1,selectedLayers:[layer],layer:()=>layer};layer.containingComp=comp;
 const $={};const context={$ ,PropertyType:{PROPERTY:1,NAMED_GROUP:2,INDEXED_GROUP:3},KeyframeInterpolationType:{LINEAR:1,BEZIER:2},PropertyValueType:{OneD:1},KeyframeEase:function(speed,influence){this.speed=speed;this.influence=influence;},Math,app:{project:{activeItem:comp}}};
 if(fs.existsSync(file))vm.runInNewContext(fs.readFileSync(file,'utf8'),context,{filename:file});
 const run=(tool,action,params={})=>$.cpTools?$.cpTools.action(comp,tool,action,params):{unavailable:true};
 return {run,$,comp,layer,context};
}
test('Reverse changes selected values/ease but preserves irregular key times',()=>{
 const p=leaf('Position',[0,1,3],[0,10,30]),h=setup([p]);h.run('keyframes','reverse');
 assert.deepEqual(p.keys().map(k=>k.value),[30,10,0]);assert.deepEqual(p.keys().map(k=>k.time),[0,1,3]);assert.equal(p.keys()[0].inEase[0].speed,-100);
});
test('Clone preserves global offsets across selected properties at playhead',()=>{
 const a=leaf('A',[0,1],[10,20]),b=leaf('B',[2,3],[30,40]),h=setup([a,b]);h.run('keyframes','clone');
 assert.deepEqual(a.keys().map(k=>k.time),[0,1,5,6]);assert.deepEqual(b.keys().map(k=>k.time),[2,3,7,8]);
});
test('Paste Value repeats clipboard keys and leaves target timing/easing intact',()=>{
 const p=leaf('A',[0,1],[10,20]),h=setup([p]);h.run('keyframes','copy');
 const q=leaf('Target',[2,4,7,8],[1,2,3,4]);h.layer.property(1).property=n=>q;h.run('keyframes','pasteValue');
 assert.deepEqual(q.keys().map(k=>k.value),[10,20,10,20]);assert.deepEqual(q.keys().map(k=>k.time),[2,4,7,8]);assert.equal(q.keys()[0].outEase[0].speed,100);
});
test('Paste Easing scales normalized speed to new distance and duration',()=>{
 const p=leaf('A',[0,1],[0,100]),h=setup([p]);h.run('keyframes','copy');
 const q=leaf('B',[0,2],[0,400]);h.layer.property(1).property=n=>q;h.run('keyframes','pasteEase');
 assert.equal(q.keys()[0].outEase[0].speed,200);assert.equal(q.keys()[1].inEase[0].speed,200);
});
test('Pair easing changes only adjacent selected pairs and requested direction',()=>{
 const p=leaf('A',[0,1,2,3],[0,10,20,30],[1,2,4]),h=setup([p]);h.run('easing','apply',{mode:'pairs',direction:'both',influenceIn:75,influenceOut:25});
 assert.equal(p.keys()[0].outEase[0].influence,75);assert.equal(p.keys()[1].inEase[0].influence,25);assert.equal(p.keys()[3].inEase[0].influence,40);
});
test('Increasing shift ranks property records, not layers',()=>{
 const a=leaf('A',[0,1],[10,20]),b=leaf('B',[0,1],[30,40]),h=setup([a,b]);h.run('keyframes','shift',{frames:3,order:'ascending'});
 assert.deepEqual(a.keys().map(k=>k.time),[0,1]);assert.deepEqual(b.keys().map(k=>k.time),[.1,1.1]);
});
function markerHost(h,rows){
 const markers=rows;
 h.$.cpTimeline={read:()=>markers.map(x=>({...x})),remove:(layer,id)=>{for(let i=markers.length-1;i>=0;i--)if(markers[i].instanceId===id)markers.splice(i,1)},ensure:(layer,id,next)=>markers.push(...next.map(x=>({...x,instanceId:id})))};
 return markers;
}
test('Marker-only shift preserves layer endpoints and unrelated markers',()=>{
 const h=setup([]),markers=markerHost(h,[{instanceId:'owned',role:'in',time:1},{instanceId:'owned',role:'out',time:7}]);
 h.run('shifter','shift',{target:'inTransitionMarkers',seconds:.5});
 assert.equal(markers[0].time,1.5);assert.equal(markers[1].time,7);assert.equal(h.layer.inPoint,0);assert.equal(h.layer.outPoint,8);
});
test('two owned transitions on one layer shift each marker but the shared boundary only once',()=>{
 const h=setup([]),markers=markerHost(h,[{instanceId:'first',role:'in',time:1},{instanceId:'second',role:'in',time:2}]);
 h.run('shifter','shift',{target:'inTransitions',seconds:.5});
 assert.deepEqual(markers.map(x=>x.time),[1.5,2.5]);assert.equal(h.layer.inPoint,.5);assert.equal(h.layer.outPoint,8);
});
test('align rejects an unselected destination key before removing or replacing any key',()=>{
 const p=leaf('A',[0,5],[10,99],[1]),h=setup([p]);const before=JSON.stringify(p.keys());
 assert.throws(()=>h.run('keyframes','alignFirst'),/collision|occupied|충돌/i);
 assert.equal(JSON.stringify(p.keys()),before);
});
test('shift preflights collisions in later properties before moving earlier records',()=>{
 const a=leaf('A',[0],[10]),b=leaf('B',[0],[20]),c=leaf('C',[0,.2],[30,99],[1]),h=setup([a,b,c]);const before=JSON.stringify([a.keys(),b.keys(),c.keys()]);
 assert.throws(()=>h.run('keyframes','shift',{frames:3,order:'ascending'}),/collision|occupied|충돌/i);
 assert.equal(JSON.stringify([a.keys(),b.keys(),c.keys()]),before);
});
test('clone restores spatial metadata and roving after every destination key exists',()=>{
 const p=leaf('Position',[0,1,2],[[0,0],[10,10],[20,20]]);p.isSpatial=true;
 p.keys().forEach((k,i)=>{k.roving=i===1;k.label=i+2;k.inTangent=[-4,1];k.outTangent=[3,7];k.tc=false;k.ta=false;k.sc=true;k.sa=false;});
 p.keyRoving=i=>!!p.keys()[i-1].roving;p.setRovingAtKey=(i,v)=>{if(i>1&&i<p.numKeys)p.keys()[i-1].roving=v};
 p.keyLabel=i=>p.keys()[i-1].label;p.setLabelAtKey=(i,v)=>p.keys()[i-1].label=v;
 p.keyInSpatialTangent=i=>p.keys()[i-1].inTangent;p.keyOutSpatialTangent=i=>p.keys()[i-1].outTangent;p.setSpatialTangentsAtKey=(i,a,b)=>{p.keys()[i-1].inTangent=a;p.keys()[i-1].outTangent=b};
 for(const [name,key] of [['TemporalContinuous','tc'],['TemporalAutoBezier','ta'],['SpatialContinuous','sc'],['SpatialAutoBezier','sa']]){p['key'+name]=i=>p.keys()[i-1][key];p['set'+name+'AtKey']=(i,v)=>p.keys()[i-1][key]=v;}
 const h=setup([p]);h.run('keyframes','clone');const cloned=p.keys().find(k=>k.time===6);
 assert.equal(cloned.roving,true);assert.equal(cloned.label,3);assert.deepEqual(Array.from(cloned.inTangent),[-4,1]);assert.equal(cloned.sc,true);
});

function quantized(p,grid=30720){const add=p.addKey;p.addKey=time=>add(Math.round(time*grid)/grid);return p;}
test('align and clone use native returned times rather than requested times after quantization',()=>{
 for(const action of ['alignFirst','clone','mirror']){
  const p=quantized(leaf('A',[0,1],[10,20])),h=setup([p]);h.comp.time=5.00001;
  assert.doesNotThrow(()=>h.run('keyframes',action));
  const added=p.keys().filter(k=>k.time>=5);assert.deepEqual(added.map(k=>k.time),[5,6]);assert.deepEqual(added.map(k=>k.value),action==='mirror'?[20,10]:[10,20]);
 }
});
test('native quantized collision restores all moved properties including unselected keys',()=>{
 const a=leaf('A',[0],[10]),b=quantized(leaf('B',[0,5],[20,99],[1])),h=setup([a,b]);h.comp.time=5.00001;
 const before=JSON.stringify([a.keys(),b.keys()]);assert.throws(()=>h.run('keyframes','alignFirst'),e=>e.code==='KEY_TIME_CONFLICT');
 assert.equal(JSON.stringify([a.keys(),b.keys()]),before);
});
test('clone rejects destinations which collapse to one native key and restores the original selection',()=>{
 const p=quantized(leaf('A',[0,.01],[10,20]),1),h=setup([p]),before=JSON.stringify(p.keys());
 assert.throws(()=>h.run('keyframes','clone'),e=>e.code==='KEY_TIME_CONFLICT');assert.equal(JSON.stringify(p.keys()),before);
});
test('late native metadata failure restores every affected property and key selection',()=>{
 for(const action of ['alignFirst','clone','reverse','pasteValue']){
  const a=leaf('A',[0,1,4],[10,20,99],[1,2]),b=leaf('B',[0,1,4],[30,40,88],[1,2]),h=setup([a,b]);
  if(action==='pasteValue')h.run('keyframes','copy');
  const before=JSON.stringify([a.keys(),b.keys()]),setter=action==='pasteValue'?'setValueAtKey':'setTemporalEaseAtKey',write=b[setter];let once=true;
  b[setter]=function(...args){if(once){once=false;throw Error('injected native write failure')}return write.apply(this,args)};
  assert.throws(()=>h.run('keyframes',action),/injected native write failure/);assert.equal(JSON.stringify([a.keys(),b.keys()]),before,action);
 }
});
test('time remap rollback never removes its final key',()=>{
 const p=leaf('ADBE Time Remapping',[0,1],[0,1]),h=setup([p]),before=JSON.stringify(p.keys()),remove=p.removeKey,write=p.setTemporalEaseAtKey;let once=true;
 p.removeKey=i=>{assert.ok(p.numKeys>1,'time remap must retain a key');remove(i)};
 p.setTemporalEaseAtKey=(...args)=>{if(once){once=false;throw Error('time remap write failure')}write(...args)};
 assert.throws(()=>h.run('keyframes','alignFirst'),/time remap write failure/);assert.equal(JSON.stringify(p.keys()),before);
});
test('time remap movement retains an actual destination key without an out-of-range sentinel',()=>{
 for(const target of [1,-1]){
  const p=leaf('ADBE Time Remapping',[0,1],[10,20]),h=setup([p]),add=p.addKey,remove=p.removeKey;h.comp.time=target;
  p.addKey=time=>{assert.ok(time>=-10800&&time<=10800,'only bounded actual destinations may be created');return add(time)};
  p.removeKey=index=>{assert.ok(p.numKeys>1);remove(index)};
  h.run('keyframes','alignFirst');assert.deepEqual(p.keys().map(k=>k.time),[target,target+1]);assert.deepEqual(p.keys().map(k=>k.value),[10,20]);
 }
});
test('rollback failure preserves the primary error and reports the restoration failure',()=>{
 const p=leaf('A',[0,1],[10,20]),h=setup([p]);p.setTemporalEaseAtKey=()=>{throw Error('persistent native failure')};
 assert.throws(()=>h.run('keyframes','reverse'),e=>e.message==='persistent native failure'&&e.rollbackError==='persistent native failure');
});
test('anchor preflights separated Position follower expressions on every selected layer',()=>{
 const h=setup([]),writes=[];
 function anchorLayer(id,expression){
  const a={value:[0,0],expressionEnabled:false,numKeys:0,setValue:v=>writes.push(['anchor',id,v])},followers=[0,1].map(axis=>({value:100,numKeys:0,expressionEnabled:expression&&axis===1,setValue:v=>writes.push(['position',id,v])}));
  const props={'ADBE Anchor Point':a,'ADBE Position':{expressionEnabled:false,dimensionsSeparated:true,getSeparationFollower:axis=>followers[axis]},'ADBE Scale':{value:[100,100]}};
  return{id,name:'Target '+id,selected:true,locked:false,property:()=>({property:name=>props[name]||null}),sourceRectAtTime:()=>({left:0,top:0,width:100,height:100})};
 }
 const ls=[anchorLayer(1,false),anchorLayer(2,true)];h.comp.numLayers=ls.length;h.comp.layer=i=>ls[i-1];
 assert.throws(()=>h.run('anchor','move',{x:0,y:0}),e=>e.code==='ANCHOR_EXPRESSION');assert.deepEqual(writes,[]);
});

test('automatic easing selection mode follows original contiguous-run rules including trailing singleton',()=>{
 const cases=[[[1],'single'],[[1,2],'pairs'],[[1,2,3],'pairs'],[[1,2,3,4,5],'pairs'],[[1,2,4],'pairs'],[[1,3,4],'single'],[[1,2,4,5],'pairs'],[[1,2,4,6,7],'single']];
 for(const [selected,expected] of cases){const p=leaf('A',[0,1,2,3,4,5,6],[0,10,20,30,40,50,60],selected),h=setup([p]),before=JSON.stringify(p.keys());assert.equal(h.$.cpTools.easingSelectionMode(h.comp),expected,selected.join(','));assert.equal(JSON.stringify(p.keys()),before);}
 const empty=setup([]);assert.equal(empty.$.cpTools.easingSelectionMode(empty.comp),'none');
});
test('automatic easing mode is global and any failing selected property forces single',()=>{
 for(const selected of [[1],[1,3,4]]){
  const a=leaf('A',[0,1],[0,10]),b=leaf('B',[0,1,2,3],[0,10,20,30],selected),h=setup([a,b]);
  assert.equal(h.$.cpTools.easingSelectionMode(h.comp),'single');h.run('easing','apply',{mode:'auto',influenceIn:75,influenceOut:25});
  assert.equal(a.keys()[0].inEase[0].influence,75);assert.equal(a.keys()[1].outEase[0].influence,25);
 }
});
test('automatic pairs permit a final singleton and leave that key untouched',()=>{
 const a=leaf('A',[0,1,2,3],[0,10,20,30],[1,2,4]),b=leaf('B',[0,1,2],[0,10,20]),h=setup([a,b]);
 assert.equal(h.$.cpTools.easingSelectionMode(h.comp),'pairs');h.run('easing','apply',{mode:'auto',influenceIn:75,influenceOut:25});
 assert.equal(a.keys()[0].outEase[0].influence,75);assert.equal(a.keys()[1].inEase[0].influence,25);
 assert.equal(a.keys()[3].inEase[0].influence,40);assert.equal(a.keys()[3].outEase[0].influence,60);
});

test('scalar easing never calls native spatial-only keyRoving',()=>{
 const p=leaf('Slider',[1,2,4],[0,100,40],[1,2]),h=setup([p]);p.isSpatial=false;p.keyRoving=()=>{throw Error('not a spatial PropertyValueType')};
 h.run('easing','apply',{mode:'pairs',direction:'both',influenceIn:70,influenceOut:30});
 assert.equal(p.keys()[0].outEase[0].influence,70);assert.equal(p.keys()[1].inEase[0].influence,30);
});
test('easing native failure after an earlier side/property write restores the whole selection',()=>{
 const a=leaf('A',[0,1],[0,10]),b=leaf('B',[0,1],[20,30]),h=setup([a,b]),before=JSON.stringify([a.keys(),b.keys()]),setter=b.setInterpolationTypeAtKey;let once=true;
 b.setInterpolationTypeAtKey=(...args)=>{if(once){once=false;throw Error('injected interpolation failure')}setter(...args)};
 assert.throws(()=>h.run('easing','apply',{mode:'pairs',direction:'both',influenceIn:70,influenceOut:30}),/injected interpolation failure/);
 assert.equal(JSON.stringify([a.keys(),b.keys()]),before);
});
test('3D anchor offset preserves the independently recorded native toWorld oracle',()=>{
 const h=setup([]);function prop(value){return{value,numKeys:0,expressionEnabled:false,setValue(v){this.value=v}}}
 h.layer.threeDLayer=true;
 const a=prop([20,-15,0]),p=prop([420,300,35]),properties={'ADBE Anchor Point':a,'ADBE Position':p,'ADBE Scale':prop([145,80,115]),'ADBE Rotate X':prop(19),'ADBE Rotate Y':prop(-11),'ADBE Rotate Z':prop(27),'ADBE Orientation':prop([12,25,8])};
 h.layer.property=()=>({property:name=>properties[name]||null});h.layer.sourceRectAtTime=()=>({left:-110,top:-70,width:220,height:140});
 h.run('anchor','move',{x:1,y:-1,mode:'modifyExistingKeyframes'});
 // These basis columns are reconstructed from two independent before/after native toWorld vectors in tools_native_01, not from the product rotation helper.
 const x=[.8682138223227216,.4946317806037823,.03929580568565633],y=[-.4218055567088382,.6940330553298085,.5834365350570944];
 const world=p.value.map((v,i)=>v-x[i]*a.value[0]*1.45-y[i]*a.value[1]*.8),nativeBefore=[389.760132472135,293.984075026448,40.8616600558011];
 for(let i=0;i<3;i++)assert.ok(Math.abs(world[i]-nativeBefore[i])<1e-9,JSON.stringify(world));
});
test('In transition shift restores untouched Out after native inPoint setter side effects',()=>{
 const h=setup([]),markers=markerHost(h,[{instanceId:'owned',role:'in',time:3},{instanceId:'owned',role:'out',time:8}]);let inside=0,outside=10;
 Object.defineProperties(h.layer,{inPoint:{get:()=>inside,set:value=>{outside+=value-inside;inside=value}},outPoint:{get:()=>outside,set:value=>{outside=value}}});
 h.run('shifter','shift',{target:'inTransitions',seconds:.25});
 assert.equal(h.layer.inPoint,.25);assert.equal(h.layer.outPoint,10);assert.equal(markers[0].time,3.25);assert.equal(markers[1].time,8);
});

function multiLayerTools(props){
 const hosts=props.map((p,i)=>{const h=setup(p?[p]:[]);h.layer.id=[30,10,20][i];h.layer.index=i+1;return h}),h=hosts[0],ls=hosts.map(x=>x.layer);
 h.comp.numLayers=ls.length;h.comp.layer=i=>ls[i-1];h.comp.selectedLayers=ls;for(const l of ls)l.containingComp=h.comp;
 h.$.cpTimeline={read:()=>[],remove(){},ensure(){}};return{...h,ls};
}
test('selection stagger uses only explicit validated IDs rather than stack or selectedLayers order',()=>{
 for(const order of ['selection','inSelectionOrder']){
  const h=multiLayerTools([null,null,null]);h.run('shifter','stagger',{target:'layers',seconds:.2,order,selectionOrder:[20,30,10]});
  assert.deepEqual(h.ls.map(l=>l.startTime),[.2,.4,0]);
 }
});
test('invalid or unknown click order rejects the complete batch before any layer write',()=>{
 for(const selectionOrder of [undefined,[],[30,10],[30,10,10],[30,10,999],[30,10,'20'],[30,10,Infinity]]){
  const h=multiLayerTools([null,null,null]),before=JSON.stringify(h.ls.map(l=>[l.startTime,l.inPoint,l.outPoint]));
  assert.throws(()=>h.run('shifter','stagger',{target:'layers',seconds:.2,order:'selection',selectionOrder}),e=>/^SELECTION_ORDER_/.test(e.code));
  assert.equal(JSON.stringify(h.ls.map(l=>[l.startTime,l.inPoint,l.outPoint])),before);
 }
});
test('selection order ranks keyframe records by explicit layer order while preserving property order',()=>{
 const ps=[leaf('A',[0],[10]),leaf('B',[0],[20]),leaf('C',[0],[30])],h=multiLayerTools(ps);
 h.run('keyframes','shift',{frames:3,order:'selection',selectionOrder:[20,30,10]});
 assert.deepEqual(ps.map(p=>p.keyTime(1)),[.1,.2,0]);
});
test('shifter accepts finite UI-normalized seconds without rounding a guessed frame grid',()=>{
 const h=multiLayerTools([null,null,null]);h.comp.frameDuration=1001/30000;
 const seconds=10*h.comp.frameDuration;h.run('shifter','stagger',{target:'layers',seconds,order:'ascending'});
 assert.deepEqual(h.ls.map(l=>l.startTime),[0,seconds,2*seconds]);
});
test('shifter rejects missing, coerced or nonfinite time before every target mutation',()=>{
 for(const seconds of [undefined,null,'1',NaN,Infinity,-Infinity]){
  const h=multiLayerTools([null,null,null]);
  assert.throws(()=>h.run('shifter','stagger',{target:'layers',seconds,order:'ascending'}),e=>e.code==='INVALID_SHIFT_TIME');
  assert.deepEqual(h.ls.map(l=>l.startTime),[0,0,0]);
 }
 const h=multiLayerTools([null,null,null]);
 assert.throws(()=>h.run('shifter','stagger',{target:'layers',seconds:1e308}),e=>e.code==='INVALID_SHIFT_TIME');
 assert.deepEqual(h.ls.map(l=>l.startTime),[0,0,0]);
});
test('align uses each explicit transition start/end reference and needs no seconds input',()=>{
 for(const [target,role,reference] of [['inTransitionStarts','in',0],['inTransitionEnds','in',2],['inTransitionMarkers','in',2],['outTransitionStarts','out',6],['outTransitionEnds','out',8-1/30],['outTransitionMarkers','out',6]]){
  const h=setup([]),markers=markerHost(h,[{instanceId:'owned',role:'in',time:2},{instanceId:'owned',role:'out',time:6}]);h.comp.time=4;
  h.run('shifter','align',{target});const delta=4-reference,expected=role==='in'?2+delta:6+delta;
  assert.ok(Math.abs(markers.find(x=>x.role===role).time-expected)<1e-12,target);
  if(!target.endsWith('Markers'))assert.ok(Math.abs((role==='in'?h.layer.inPoint:h.layer.outPoint)-(role==='in'?delta:8+delta))<1e-12,target);
 }
});
test('ordered stagger rolls back earlier layers when a later native setter fails',()=>{
 const h=multiLayerTools([null,null,null]);let start=0,once=true;
 Object.defineProperty(h.ls[1],'startTime',{get:()=>start,set:value=>{if(once&&value!==0){once=false;throw Error('native shift failure')}start=value}});
 assert.throws(()=>h.run('shifter','stagger',{target:'layers',seconds:.25,order:'selection',selectionOrder:[20,30,10]}),/native shift failure/);
 assert.deepEqual(h.ls.map(l=>[l.startTime,l.inPoint,l.outPoint]),[[0,0,8],[0,0,8],[0,0,8]]);
});
test('invalid frame information or target rejects shifter input before writes',()=>{
 for(const frameDuration of [0,NaN,Infinity,'0.04']){
  const h=multiLayerTools([null,null,null]);h.comp.frameDuration=frameDuration;
  assert.throws(()=>h.run('shifter','stagger',{target:'layers',seconds:.25}),e=>e.code==='INVALID_FRAME_DURATION');
  assert.deepEqual(h.ls.map(l=>l.startTime),[0,0,0]);
 }
 const h=setup([]),markers=markerHost(h,[{instanceId:'owned',role:'in',time:2}]);
 assert.throws(()=>h.run('shifter','shift',{target:'unknown',seconds:.25}),e=>e.code==='INVALID_SHIFT_TARGET');assert.equal(markers[0].time,2);
});
