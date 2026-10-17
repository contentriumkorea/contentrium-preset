// Transaction requirements only. Separated-axis conditional insertion is NOT
// established by these fixtures: the retained original mixed case contradicts
// per-follower insertion and awaits its own native contract correction.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const plain=v=>JSON.parse(JSON.stringify(v));
function fixture({keyed=false,separated=false,failField='ADBE Position',failMethod,rectFailure=false}={}){
 let writes=0,failed=false;const subjects=[];
 function wrote(layerId,field,method){writes++;if(!rectFailure&&!failed&&layerId===2&&field===failField&&method===failMethod){failed=true;throw Error('Injected late native setter failure');}}
 function key(time,value,i){return{time,value:plain(value),selected:i===0,inEase:[{speed:12+i,influence:35+i}],outEase:[{speed:23+i,influence:65-i}],inType:2,outType:2,temporalContinuous:i===1,temporalAutoBezier:false,label:i+3,inTangent:Array.isArray(value)?value.map(()=>-2):null,outTangent:Array.isArray(value)?value.map(()=>3):null,spatialContinuous:true,spatialAutoBezier:false,roving:false};}
 function property(layerId,name,initial,hasKeys,isSpatial){let current=plain(initial),expression='',enabled=false;const keys=hasKeys?[key(0,initial,0),key(4,initial,1)]:[];
  const p={name,matchName:name,propertyType:1,propertyValueType:Array.isArray(initial)?2:1,canSetExpression:true,isSpatial,selected:true,keys,
   get value(){return plain(current);},get numKeys(){return keys.length;},get selectedKeys(){return keys.flatMap((k,i)=>k.selected?[i+1]:[]);},get expression(){return expression;},set expression(v){expression=v;},get expressionEnabled(){return enabled;},set expressionEnabled(v){enabled=v;},
   valueAtTime(){return plain(current);},keyTime:i=>keys[i-1].time,keyValue:i=>plain(keys[i-1].value),keySelected:i=>keys[i-1].selected,
   setValue(v){assert.equal(keys.length,0,'native static setter requires no keys');current=plain(v);wrote(layerId,name,'setValue');},
   setValueAtKey(i,v){keys[i-1].value=plain(v);keys[i-1].outEase[0].speed+=.25;wrote(layerId,name,'setValueAtKey');},
   setValueAtTime(time,v){let i=keys.findIndex(k=>k.time===time);if(i<0){keys.push(key(time,v,2));keys.sort((a,b)=>a.time-b.time);for(const k of keys)k.outEase[0].speed+=.5;}else keys[i].value=plain(v);wrote(layerId,name,'setValueAtTime');},
   addKey(time){let i=keys.findIndex(k=>k.time===time);if(i<0){keys.push(key(time,current,2));keys.sort((a,b)=>a.time-b.time);i=keys.findIndex(k=>k.time===time);}writes++;return i+1;},removeKey(i){keys.splice(i-1,1);writes++;},
   keyInTemporalEase:i=>plain(keys[i-1].inEase),keyOutTemporalEase:i=>plain(keys[i-1].outEase),setTemporalEaseAtKey(i,a,b){keys[i-1].inEase=plain(a);keys[i-1].outEase=plain(b);writes++;},keyInInterpolationType:i=>keys[i-1].inType,keyOutInterpolationType:i=>keys[i-1].outType,setInterpolationTypeAtKey(i,a,b){keys[i-1].inType=a;keys[i-1].outType=b;writes++;},
   keyTemporalContinuous:i=>keys[i-1].temporalContinuous,keyTemporalAutoBezier:i=>keys[i-1].temporalAutoBezier,setTemporalContinuousAtKey(i,v){keys[i-1].temporalContinuous=v;writes++;},setTemporalAutoBezierAtKey(i,v){keys[i-1].temporalAutoBezier=v;writes++;},
   keyLabel:i=>keys[i-1].label,setLabelAtKey(i,v){keys[i-1].label=v;writes++;},keyRoving:i=>keys[i-1].roving,setRovingAtKey(i,v){keys[i-1].roving=v;writes++;},keyInSpatialTangent:i=>plain(keys[i-1].inTangent),keyOutSpatialTangent:i=>plain(keys[i-1].outTangent),setSpatialTangentsAtKey(i,a,b){keys[i-1].inTangent=plain(a);keys[i-1].outTangent=plain(b);writes++;},keySpatialContinuous:i=>keys[i-1].spatialContinuous,keySpatialAutoBezier:i=>keys[i-1].spatialAutoBezier,setSpatialContinuousAtKey(i,v){keys[i-1].spatialContinuous=v;writes++;},setSpatialAutoBezierAtKey(i,v){keys[i-1].spatialAutoBezier=v;writes++;},setSelectedAtKey(i,v){keys[i-1].selected=v;writes++;}};
  return p;
 }
 for(const id of [1,2]){
  const anchor=property(id,'ADBE Anchor Point',[10,20],keyed,true),position=property(id,'ADBE Position',[100,200],keyed&&!separated,true),followers=separated?[property(id,'ADBE Position_0',100,keyed,false),property(id,'ADBE Position_1',200,keyed,false)]:[];
  if(separated){position.dimensionsSeparated=true;position.getSeparationFollower=i=>followers[i];}
  const properties={'ADBE Anchor Point':anchor,'ADBE Position':position,'ADBE Scale':property(id,'ADBE Scale',[100,100],false,false)},transform={property:name=>properties[name]||null},subject={id,index:id,name:'Own Anchor '+id,selected:true,locked:false,property:name=>name==='ADBE Transform Group'?transform:null,sourceRectAtTime(){if(rectFailure&&id===2)throw Error('Injected second sourceRect failure');return{left:0,top:0,width:80,height:60};},properties,followers};subjects.push(subject);
 }
 const comp={time:2,numLayers:subjects.length,layer:i=>subjects[i-1]};subjects.forEach(l=>l.containingComp=comp);const context={$:{},PropertyType:{PROPERTY:1,INDEXED_GROUP:2,NAMED_GROUP:3},PropertyValueType:{OneD:1,TwoD_SPATIAL:2},KeyframeInterpolationType:{LINEAR:1,BEZIER:2},KeyframeEase:function(speed,influence){this.speed=speed;this.influence=influence;}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../jsx/tools-engine.jsx'),'utf8'),context);
 const snapshot=()=>subjects.map(l=>({id:l.id,properties:Object.fromEntries(Object.entries(l.properties).map(([name,p])=>[name,{value:p.value,keys:plain(p.keys),expression:p.expression,expressionEnabled:p.expressionEnabled}])),followers:l.followers.map(p=>({value:p.value,keys:plain(p.keys),expression:p.expression,expressionEnabled:p.expressionEnabled}))}));
 return{snapshot,get writes(){return writes;},run:mode=>context.$.cpTools.action(comp,'anchor','move',{x:1,y:1,mode:mode||'modifyExistingKeyframes'})};
}
for(const spec of [
 {name:'static Anchor',failField:'ADBE Anchor Point',failMethod:'setValue'},
 {name:'static Position',failField:'ADBE Position',failMethod:'setValue'},
 {name:'keyed Anchor',keyed:true,failField:'ADBE Anchor Point',failMethod:'setValueAtKey'},
 {name:'keyed Position',keyed:true,failField:'ADBE Position',failMethod:'setValueAtKey'},
 {name:'separated keyed follower',keyed:true,separated:true,failField:'ADBE Position_1',failMethod:'setValueAtKey'},
 {name:'inserted current key',keyed:true,failField:'ADBE Position',failMethod:'setValueAtTime',mode:'insertKeyframes'}
])test('Anchor atomic rollback restores both selected layers after late '+spec.name+' failure',()=>{
 const h=fixture(spec),before=h.snapshot();assert.throws(()=>h.run(spec.mode),/Injected late native setter failure/);assert.deepEqual(h.snapshot(),before,'restore values, all prior keys, easing/spatial metadata and selected keys');
});
test('Anchor preflights every selected sourceRect before making the first native property write',()=>{
 const h=fixture({rectFailure:true}),before=h.snapshot();assert.throws(()=>h.run(),/Injected second sourceRect failure/);assert.equal(h.writes,0,'later bounds failure must not leave an earlier layer modified');assert.deepEqual(h.snapshot(),before);
});
