const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const clone=x=>JSON.parse(JSON.stringify(x));
function host(){
 const P={PROPERTY:1,INDEXED_GROUP:2,NAMED_GROUP:3},V={OneD:1,TwoD:2,NO_VALUE:3},I={LINEAR:1,BEZIER:2},events=[];
 function node(match,indexed=false,value){return{matchName:match,name:match,type:value===undefined?(indexed?P.INDEXED_GROUP:P.NAMED_GROUP):P.PROPERTY,valueType:Array.isArray(value)?V.TwoD:V.OneD,value:value===undefined?null:clone(value),children:[],parent:null,generation:0,selected:false,keys:[],expression:'',enabled:false};}
 function attach(parent,child){child.parent=parent;parent.children.push(child);return child;}
 function property(match,value){return node(match,false,value);}
 function rootOf(n){while(n.parent)n=n.parent;return n;}
 function evaluate(n,seen=[]){if(!n.enabled||!n.expression)return n.value;if(seen.includes(n))throw Error('Native expression cycle');const match=/^effect\("([^"]+)"\)\("Slider"\)$/.exec(n.expression);if(!match)return n.value;const fx=rootOf(n).children.find(x=>x.matchName==='ADBE Effect Parade'),target=fx.children.find(x=>x.name===match[1]);if(!target)throw Error('Missing effect '+match[1]);return evaluate(target.children[0],seen.concat(n));}
 function wrap(n,guards=[]){
  const valid=()=>guards.forEach(([g,v])=>{if(g.generation!==v)throw Error('Invalidated indexed property handle');});
  const api={get matchName(){valid();return n.matchName;},get name(){valid();return n.name;},set name(x){valid();n.name=x;},get propertyIndex(){valid();return n.parent?n.parent.children.indexOf(n)+1:0;},get propertyType(){valid();return n.type;},get propertyValueType(){valid();return n.valueType;},get numProperties(){valid();return n.children.length;},get selected(){valid();return n.selected;},set selected(x){valid();n.selected=x;},canSetExpression:true,isSpatial:false,
   property(k){valid();const child=typeof k==='number'?n.children[k-1]:n.children.find(x=>x.name===k||x.matchName===k);return child?wrap(child,guards.concat(n.type===P.INDEXED_GROUP?[[n,n.generation]]:[])):null;},canAddProperty(){valid();return true;},
   addProperty(match){valid();n.generation++;const child=attach(n,node(match));if(match==='ADBE Slider Control')attach(child,property('ADBE Slider Control-0001',0));return wrap(child,guards.concat(n.type===P.INDEXED_GROUP?[[n,n.generation]]:[]));},
   remove(){valid();assert(n.parent);n.parent.children.splice(n.parent.children.indexOf(n),1);n.parent.generation++;},
   get value(){valid();return clone(n.value);},setValue(v){valid();n.value=clone(v);events.push(['value',n.name]);},valueAtTime(){valid();return clone(n.value);},get numKeys(){valid();return n.keys.length;},keyTime(i){valid();return n.keys[i-1].time;},keyValue(i){valid();return clone(n.keys[i-1].value);},removeKey(i){valid();n.keys.splice(i-1,1);},setValueAtTime(time,value){valid();const k=n.keys.find(k=>k.time===time);if(k)k.value=clone(value);else n.keys.push({time,value:clone(value)});n.keys.sort((a,b)=>a.time-b.time);},keyInTemporalEase:()=>[{speed:0,influence:33}],keyOutTemporalEase:()=>[{speed:0,influence:33}],keyInInterpolationType:()=>I.LINEAR,keyOutInterpolationType:()=>I.LINEAR,setTemporalEaseAtKey(){valid();},setInterpolationTypeAtKey(){valid();},
   get expression(){valid();return n.expression;},set expression(x){valid();n.expression=x;n.enabled=!!x;events.push(['source',n.name,x]);},get expressionEnabled(){valid();return n.enabled;},set expressionEnabled(x){valid();n.enabled=x;events.push(['enabled',n.name,x]);},get expressionError(){valid();events.push(['validate',n.name]);try{evaluate(n);return '';}catch(e){return e.message;}}};
  return api;
 }
 function layer(){const root=node('Layer'),tr=attach(root,node('ADBE Transform Group'));attach(tr,property('ADBE Opacity',100));attach(tr,property('ADBE Position',[640,360]));attach(root,node('ADBE Effect Parade',true));const l=wrap(root);Object.assign(l,{name:'Own target',containingComp:{time:2},locked:false,threeDLayer:false,threeDPerChar:false});return l;}
 const context={$:{},PropertyType:P,PropertyValueType:V,KeyframeInterpolationType:I,KeyframeEase:function(speed,influence){this.speed=speed;this.influence=influence;},app:{beginUndoGroup(){events.push(['begin']);},endUndoGroup(){events.push(['end']);}}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../jsx/user-preset-engine.jsx'),'utf8'),context);
 function slider(layer,name,value,expression,enabled=true){const fx=layer.property('ADBE Effect Parade').addProperty('ADBE Slider Control');fx.name=name;const p=fx.property(1);p.setValue(value);if(expression!==undefined){p.expression=expression;p.expressionEnabled=enabled;}return fx;}
 function values(l){const fx=l.property('ADBE Effect Parade'),out=[];for(let i=1;i<=fx.numProperties;i++)out.push([fx.property(i).name,fx.property(i).property(1).value]);return out;}
 function snapshot(l){return clone(context.$.cpUserPreset.capture(l,{selectedOnly:false}));}
 return{api:context.$.cpUserPreset,layer,slider,values,events,snapshot,evaluate(l,name){const fx=l.property('ADBE Effect Parade').property(name),p=fx.property(1);assert.equal(p.expressionError,'');return p.expression;}};
}

test('duplicate indexed names retain distinct values after appending beside target effects',()=>{
 const h=host(),source=h.layer(),target=h.layer();h.slider(source,'Same',17);h.slider(source,'Same',63);h.slider(target,'Existing',99);const data=h.api.capture(source);h.api.apply(target,data);assert.deepEqual(h.values(target),[['Existing',99],['Same',17],['Same',63]]);
});
test('forward and reverse local expression chains activate only after all captured groups and values exist',()=>{
 for(const names of [['First','Middle','Driver'],['Driver','Middle','First']]){const h=host(),source=h.layer(),target=h.layer();for(const name of names)h.slider(source,name,name==='Driver'?42:0,name==='First'?'effect("Middle")("Slider")':name==='Middle'?'effect("Driver")("Slider")':undefined);const data=h.api.capture(source);h.events.length=0;assert.doesNotThrow(()=>h.api.apply(target,data));assert.equal(h.evaluate(target,'First'),'effect("Middle")("Slider")');const firstValidation=h.events.findIndex(x=>x[0]==='validate'),lastValue=h.events.findLastIndex(x=>x[0]==='value');assert(firstValidation>lastValue,'defer validation until every group/value has been restored');}
});
test('disabled expression source remains disabled without requiring its missing dependency',()=>{
 const h=host(),source=h.layer(),target=h.layer();h.slider(source,'Dormant',12,'effect("Missing")("Slider")',false);h.api.apply(target,h.api.capture(source));const p=target.property('ADBE Effect Parade').property('Dormant').property(1);assert.equal(p.expression,'effect("Missing")("Slider")');assert.equal(p.expressionEnabled,false);assert.equal(p.value,12);
});
test('cycle errors validate the complete graph and roll added groups and existing values/expressions back',()=>{
 const h=host(),source=h.layer(),target=h.layer(),s=source.property('ADBE Transform Group').property('ADBE Opacity'),t=target.property('ADBE Transform Group').property('ADBE Opacity');s.selected=true;s.setValue(17);t.selected=true;t.setValue(73);t.expression='value * 0.5';t.expressionEnabled=false;h.slider(source,'A',1,'effect("B")("Slider")');h.slider(source,'B',2,'effect("A")("Slider")');const before=h.snapshot(target);assert.throws(()=>h.api.apply(target,h.api.capture(source),{overwrite:true}),e=>e.code==='EXPRESSION_ERROR'&&/cycle/.test(e.message));assert.deepEqual(h.snapshot(target),before);assert.equal(target.property('ADBE Effect Parade').numProperties,0);
});
test('existing target name conflicts still reject before any writes',()=>{
 const h=host(),source=h.layer(),target=h.layer();h.slider(source,'Keep',1);h.slider(target,'Keep',99);const data=h.api.capture(source);h.events.length=0;assert.throws(()=>h.api.apply(target,data),e=>e.code==='GROUP_NAME_CONFLICT');assert.deepEqual(h.values(target),[['Keep',99]]);assert.deepEqual(h.events,[]);
});
