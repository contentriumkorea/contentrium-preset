const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const plain=v=>JSON.parse(JSON.stringify(v)),copy=v=>Array.isArray(v)?v.map(copy):v,quantize=v=>Array.isArray(v)?v.map(quantize):Math.fround(v);
const source=fs.readFileSync(path.join(__dirname,'../jsx/tools-engine.jsx'),'utf8');
// Native-shaped 3-component properties, including 2D layers. Native retained
// samples show a small interpolation residual before and after translating keys.
// These are host observations, not a replacement implementation of the tool.
const nativeBeforeWeight=.49999222646185,nativeTranslatedWeight=.50000777353815;
function property(name,initial,options={}){
 let current=copy(initial),expression='',expressionEnabled=false,mutated=false;
 const spatial=options.spatial===true,keys=(options.keys||[]).map(([time,value],i)=>({time,value:copy(value),selected:i===0,inEase:[{speed:12+i,influence:45}],outEase:[{speed:21+i,influence:45}],inType:2,outType:2,temporalContinuous:false,temporalAutoBezier:false,label:i+2,inTangent:Array.isArray(value)?value.map(()=>-2):null,outTangent:Array.isArray(value)?value.map(()=>3):null,spatialContinuous:true,spatialAutoBezier:false,roving:false}));
 function sample(t){if(!keys.length)return copy(current);const exact=keys.find(k=>k.time===t);if(exact)return copy(exact.value);if(t<=keys[0].time)return copy(keys[0].value);if(t>=keys.at(-1).time)return copy(keys.at(-1).value);const a=keys[0].value,b=keys.at(-1).value,w=mutated?(options.afterWeight??options.weight??.5):(options.weight??.5);return Array.isArray(a)?a.map((x,i)=>x+(b[i]-x)*w):a+(b-a)*w;}
 const p={name,matchName:name,propertyType:1,propertyValueType:Array.isArray(initial)?(spatial?3:4):1,canSetExpression:true,canVaryOverTime:true,isSpatial:spatial,selected:true,dimensionsSeparated:false,keys,
  get numKeys(){return keys.length;},get selectedKeys(){return keys.flatMap((k,i)=>k.selected?[i+1]:[]);},get value(){return sample(1);},get isTimeVarying(){return !!keys.length;},get expression(){return expression;},set expression(v){expression=v;},get expressionEnabled(){return expressionEnabled;},set expressionEnabled(v){expressionEnabled=v;},
  valueAtTime:t=>sample(t),keyTime:i=>keys[i-1].time,keyValue:i=>copy(keys[i-1].value),keySelected:i=>keys[i-1].selected,
  setValue(v){assert.equal(keys.length,0,'native unkeyed setter only');current=quantize(v);mutated=true;},setValueAtKey(i,v){keys[i-1].value=quantize(v);mutated=true;},
  setValueAtTime(time,v){let k=keys.find(k=>k.time===time);if(k)k.value=quantize(v);else{const added=property(name,v,{spatial,keys:[[time,v]]}).keys[0];added.value=quantize(v);keys.push(added);keys.sort((a,b)=>a.time-b.time);}mutated=true;},
  addKey(time){let at=keys.findIndex(k=>k.time===time);if(at<0){p.setValueAtTime(time,sample(time));at=keys.findIndex(k=>k.time===time);}return at+1;},removeKey:i=>keys.splice(i-1,1),
  keyInTemporalEase:i=>plain(keys[i-1].inEase),keyOutTemporalEase:i=>plain(keys[i-1].outEase),setTemporalEaseAtKey(i,a,b){keys[i-1].inEase=plain(a);keys[i-1].outEase=plain(b);},keyInInterpolationType:i=>keys[i-1].inType,keyOutInterpolationType:i=>keys[i-1].outType,setInterpolationTypeAtKey(i,a,b){keys[i-1].inType=a;keys[i-1].outType=b;},
  keyTemporalContinuous:i=>keys[i-1].temporalContinuous,keyTemporalAutoBezier:i=>keys[i-1].temporalAutoBezier,setTemporalContinuousAtKey:(i,v)=>keys[i-1].temporalContinuous=v,setTemporalAutoBezierAtKey:(i,v)=>keys[i-1].temporalAutoBezier=v,
  keyLabel:i=>keys[i-1].label,setLabelAtKey:(i,v)=>keys[i-1].label=v,keyRoving:i=>{assert(spatial);return keys[i-1].roving;},setRovingAtKey:(i,v)=>keys[i-1].roving=v,keyInSpatialTangent:i=>copy(keys[i-1].inTangent),keyOutSpatialTangent:i=>copy(keys[i-1].outTangent),setSpatialTangentsAtKey(i,a,b){keys[i-1].inTangent=copy(a);keys[i-1].outTangent=copy(b);},keySpatialContinuous:i=>keys[i-1].spatialContinuous,keySpatialAutoBezier:i=>keys[i-1].spatialAutoBezier,setSpatialContinuousAtKey:(i,v)=>keys[i-1].spatialContinuous=v,setSpatialAutoBezierAtKey:(i,v)=>keys[i-1].spatialAutoBezier=v,setSelectedAtKey:(i,v)=>keys[i-1].selected=v};
 return p;
}
function build(spec={}){
 const nodes=[];let id=1;
 function layer(cfg,parent,selected){const keyed=selected,threeD=cfg.threeD===true,anchorKeys=keyed?[[0,[93,57,threeD?13:0]],[2,[113,67,threeD?23:0]]]:[],positionKeys=keyed?(cfg.positionKeys||[[0,[280,170,threeD?35:0]],[2,[330,210,threeD?65:0]]]):[];
  const properties={
   'ADBE Anchor Point':property('ADBE Anchor Point',anchorKeys[0]?.[1]||[0,0,0],{keys:anchorKeys,spatial:true,weight:nativeBeforeWeight,afterWeight:spec.corner===1?nativeTranslatedWeight:nativeBeforeWeight}),
   'ADBE Position':property('ADBE Position',positionKeys[0]?.[1]||[320,180,0],{keys:positionKeys,spatial:true,weight:nativeBeforeWeight,afterWeight:nativeTranslatedWeight}),
   'ADBE Scale':property('ADBE Scale',cfg.scale||[127,73,100],{keys:cfg.scaleKeys}),
   'ADBE Orientation':property('ADBE Orientation',cfg.orientation||[0,0,0]),
   'ADBE Rotate X':property('ADBE Rotate X',cfg.rx||0),'ADBE Rotate Y':property('ADBE Rotate Y',cfg.ry||0),'ADBE Rotate Z':property('ADBE Rotate Z',cfg.rz??27,{keys:cfg.rzKeys})};
  const values=Object.values(properties),group={propertyType:2,numProperties:values.length,property:n=>typeof n==='number'?values[n-1]:properties[n]||null};
  const l={id:id++,name:selected?'Subject':'Parent '+id,index:id,selected,locked:false,enabled:true,threeDLayer:threeD,parent,properties,numProperties:1,width:240,height:160,property:n=>n==='ADBE Transform Group'||n===1?group:null,sourceRectAtTime:()=>({left:0,top:0,width:240,height:160})};nodes.push(l);return l;
 }
 let parent=null;for(const cfg of(spec.parents||[]))parent=layer(cfg,parent,false);const subject=layer(spec.subject||{},parent,true),comp={time:1,numLayers:nodes.length,layer:i=>nodes[i-1],selectedLayers:[subject]};nodes.forEach(l=>l.containingComp=comp);
 const context={$:{},PropertyType:{PROPERTY:1,NAMED_GROUP:2,INDEXED_GROUP:3},PropertyValueType:{OneD:1,TwoD_SPATIAL:2,ThreeD_SPATIAL:3,ThreeD:4},KeyframeInterpolationType:{LINEAR:1,BEZIER:2},KeyframeEase:function(speed,influence){this.speed=speed;this.influence=influence;}};vm.runInNewContext(source,context);
 return{subject,comp,run:()=>context.$.cpTools.action(comp,'anchor','move',{x:spec.corner===1?1:-1,y:spec.corner===1?1:-1,mode:'modifyKeyframes'})};
}
// Independent column-vector matrix oracle: explicit matrices and multiplication,
// rather than the product's sequential component-wise rotate() routine.
const mul=(a,b)=>a.map(row=>b[0].map((_,j)=>row.reduce((s,v,k)=>s+v*b[k][j],0))),mv=(a,v)=>a.map(row=>row.reduce((s,x,i)=>s+x*v[i],0));
function rotation(axis,degrees){const r=degrees*Math.PI/180,c=Math.cos(r),s=Math.sin(r);return axis===0?[[1,0,0],[0,c,-s],[0,s,c]]:axis===1?[[c,0,s],[0,1,0],[-s,0,c]]:[[c,-s,0],[s,c,0],[0,0,1]];}
function oracle(l,t=1){const value=n=>l.properties[n].valueAtTime(t,false),s=value('ADBE Scale'),o=value('ADBE Orientation');let m=[[s[0]/100,0,0],[0,s[1]/100,0],[0,0,s[2]/100]];for(const [axis,name]of[[2,'ADBE Rotate Z'],[1,'ADBE Rotate Y'],[0,'ADBE Rotate X']])if(axis===2||l.threeDLayer)m=mul(rotation(axis,value(name)),m);if(l.threeDLayer)for(const axis of[2,1,0])m=mul(rotation(axis,o[axis]),m);return l.parent?mul(oracle(l.parent,t),m):m;}
const metadata=p=>p.keys.map(({value,...rest})=>plain(rest));
function verify(spec){const h=build(spec),a=h.subject.properties['ADBE Anchor Point'],p=h.subject.properties['ADBE Position'],oldA=a.valueAtTime(1),oldKeys=plain(p.keys),oldMeta=[metadata(a),metadata(p)],matrix=oracle(h.subject,1);assert.equal(oldA.length,3,'AE returns three components even for 2D anchor');h.run();const actualDelta=a.valueAtTime(1).map((x,i)=>x-oldA[i]),offset=mv(matrix,actualDelta),expected=oldKeys.map(k=>quantize(k.value.map((x,i)=>x+offset[i])));assert.deepEqual(plain(p.keys.map(k=>k.value)),expected,'one full-chain compensation from actual post-write anchor sample, evaluated at playhead');assert.deepEqual([metadata(a),metadata(p)],oldMeta,'preserve all native key metadata');return h;}

test('Anchor modify uses actual post-write playhead resampling before Position compensation',()=>verify({corner:1}));
test('Anchor 2D parent contributes its linear transform even with three-component 2D properties',()=>verify({parents:[{scale:[80,130,100],rz:31}],subject:{scale:[138.076599086446,64.5614328271656,100],rz:6.70760319332942,positionKeys:[[0,[-49.2963409714813,9.25373076106235,0]],[2,[30.0285190679033,15.8189525168945,0]]]}}));
test('Anchor 3D compensation includes both ancestors with nonuniform scale and orientation',()=>verify({parents:[{threeD:true,scale:[80,125,90],orientation:[343,23,8],rz:0},{threeD:true,scale:[103.360470365813,113.118534376007,121.690676584602],orientation:[40.2689759807094,354.967637706338,352.816322249091],rz:12}],subject:{threeD:true,scale:[110.89647895023,73.1225886302083,99.9970590165082],orientation:[356.437637431756,326.319891348036,33.7610187241458],rx:19,ry:-34,rz:27}}));
test('Anchor animated transform uses one playhead matrix for all Position keys',()=>verify({subject:{scaleKeys:[[0,[127,73,100]],[2,[63,145,100]]],rzKeys:[[0,27],[2,72]]}}));
