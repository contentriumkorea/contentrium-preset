const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=path.join(__dirname,'../jsx/animated-font-engine.jsx');




const plain=v=>JSON.parse(JSON.stringify(v));



function near(a,b){assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);}
function coded(fn,code){assert.throws(fn,e=>{assert.equal(e.code,code);return true;});}
function pack(){const key=(time,w)=>({time,vertices:[[0,0],[w,0],[w,-700]],inTangents:[[0,0],[0,0],[0,0]],outTangents:[[0,0],[0,0],[0,0]]});const glyph=(codePoint,advance,w)=>({codePoint,advance,paths:[{closed:true,keys:[key(0,0),key(.4,w),key(.6,w),key(1,0)]}]});return {schemaVersion:1,id:'private-independent-ab',digest:'private-ab-v1',name:'Private AB',provenance:{author:'Contentrium independently authored',license:'Private acceptance fixture'},metrics:{em:1000,ascent:800,descent:200},clock:{entryEnd:.4,bodyEnd:.6,duration:1},defaults:{duration:2,inSpeed:100,outSpeed:100,inDelay:.1,outDelay:.1,inReverse:false,outReverse:false,size:100,tracking:20,color:[1,.5,.25]},limits:{maxScalars:8},glyphs:[glyph(65,600,400),glyph(66,500,300),{codePoint:32,advance:250,paths:[]}]};}
function harness(fixture=pack(),native={}){let next=0,writes=0,failAt=0,failAlways=false,lastResult=null;const projects=[],nativeRequests=[],nativeFaults={};function fault(key){const value=nativeFaults[key]||0;delete nativeFaults[key];return value;}function storedTime(value,key){nativeRequests.push({kind:key,requested:value});if(!native.quantizeTimes)return value;const observed=(native.observedTimes||[]).find(pair=>Math.abs(pair[0]-value)<1e-12);return (observed?observed[1]:Math.round(value*61440)/61440)+fault(key);}function storedCapacity(value,rate,name){nativeRequests.push({kind:'capacity',requested:value,rate,name});return (native.frameCapacity?Math.round(value*rate)/rate:value)+(name==='Contentrium Glyphs'?fault('capacity'):0);}function write(){writes++;if((failAt&&writes===failAt)||failAlways)throw Error('Injected write failure');}
 class Prop{constructor(name,parent){this.name=name;this.matchName=name;this.parentProperty=parent;this.propertyIndex=0;this._value=0;if(['ADBE Anchor Point','ADBE Position'].includes(name))this._value=[0,0,0];else if(name==='ADBE Scale')this._value=[100,100,100];else if(['ADBE Vector Anchor','ADBE Vector Position'].includes(name))this._value=[0,0];else if(name==='ADBE Vector Scale')this._value=[100,100];else if(['ADBE Opacity','ADBE Vector Group Opacity','ADBE Vector Fill Opacity'].includes(name))this._value=100;else if(name==='ADBE Vector Fill Rule')this._value=1;this._expression='';this.expressionEnabled=false;this.numKeys=0;this.keys=[];this.minValue=-1e6;this.maxValue=1e6;}get canSetExpression(){return this.name!=='ADBE Vector Fill Rule';}get hasMin(){return ['ADBE Slider Control','ADBE Checkbox Control','ADBE Color Control'].includes(this.parentProperty?.matchName);}get hasMax(){return this.hasMin;}get propertyDepth(){let n=0,p=this;while(p.parentProperty){n++;p=p.parentProperty;}return n;}propertyGroup(n){let p=this;while(n--)p=p.parentProperty;return p;}get value(){return this._value;}setValue(v){write();this._value=plain(v);}get expression(){return this._expression;}set expression(v){write();this._expression=v;this.expressionEnabled=!!v;}get expressionError(){return '';}setValueAtTime(t,v){write();if(this.name==='ADBE Marker')t=storedTime(t,'marker');if(this.name==='ADBE Vector Shape'){const pair=(native.pathTimes||[]).find(pair=>Math.abs(pair[0]-t)<1e-12);if(pair)t=pair[1];}let i=this.keys.findIndex(k=>Math.abs(k.time-t)<1e-10);let row={time:t,value:v instanceof MarkerValue?v:plain(v)};if(i<0)this.keys.push(row);else this.keys[i]=row;this.keys.sort((a,b)=>a.time-b.time);this.numKeys=this.keys.length;}setValueAtKey(i,v){write();this.keys[i-1].value=v;}keyValue(i){return this.keys[i-1].value;}keyTime(i){return this.keys[i-1].time;}removeKey(i){write();this.keys.splice(i-1,1);this.numKeys=this.keys.length;}setInterpolationTypeAtKey(i,inType,outType){write();this.keys[i-1].inType=inType;this.keys[i-1].outType=outType;}keyInInterpolationType(i){return this.keys[i-1].inType;}keyOutInterpolationType(i){return this.keys[i-1].outType;}canAddToMotionGraphicsTemplate(){return true;}addToMotionGraphicsTemplateAs(c,n){write();c.exposed.push({source:this,name:n});return true;}valueAtTime(t){if(!this.numKeys)return this.value;let a=this.keys[0],b=a;for(const k of this.keys){if(t>=k.time)a=k;else {b=k;break;}}if(t<=a.time||b.time<=a.time)return plain(a.value);const q=(t-a.time)/(b.time-a.time),o=plain(a.value);for(const field of ['vertices','inTangents','outTangents'])o[field]=a.value[field].map((p,i)=>p.map((n,j)=>n+(b.value[field][i][j]-n)*q));return o;}}
 const props=new Set(['ADBE Mask Parade','ADBE Effect Parade','ADBE Transform Group','ADBE Anchor Point','ADBE Position','ADBE Scale','ADBE Rotate Z','ADBE Opacity','ADBE Root Vectors Group','ADBE Vectors Group','ADBE Vector Transform Group','ADBE Vector Position','ADBE Vector Scale','ADBE Vector Rotation','ADBE Vector Skew','ADBE Vector Anchor','ADBE Vector Skew Axis','ADBE Vector Group Opacity','ADBE Vector Shape','ADBE Vector Fill Color','ADBE Vector Fill Opacity','ADBE Vector Fill Rule']);
 const adds=new Set(['ADBE Slider Control','ADBE Checkbox Control','ADBE Color Control','ADBE Point Control','ADBE Vector Group','ADBE Vector Shape - Group','ADBE Vector Graphic - Fill']);
 class Group{constructor(name,parent){this.name=name;this.matchName=name;this.propertyIndex=0;this.parentProperty=parent;this.children=[];this.map={};}get numProperties(){return this.children.length;}property(n){if(typeof n==='number')return this.children[n-1];if(this.map[n])return this.map[n];const found=this.children.find(p=>p.name===n);if(found)return found;assert.ok(props.has(n),`Unknown property ${n}`);let group=/Parade|Group$/.test(n)&&n!=='ADBE Vector Shape - Group';let p=group?new Group(n,this):new Prop(n,this);this.map[n]=p;return p;}addProperty(n){assert.ok(adds.has(n),`Unknown constructor ${n}`);write();let p=new Group(n,this);p.matchName=n;p.propertyIndex=this.children.length+1;this.children.push(p);if(/Control$/.test(n)){let v=new Prop(n+' value',p);v.propertyIndex=1;p.children.push(v);}return p;}}
 class MarkerValue{constructor(c){this.comment=c;this.duration=0;this.label=0;this.p={};}getParameters(){return plain(this.p);}setParameters(p){this.p=plain(p);}}
 class Shape{constructor(){this.closed=false;this.vertices=[];this.inTangents=[];this.outTangents=[];}}
 class Layer extends Group{constructor(comp,src){super('Layer',null);this.id=++next;this.containingComp=comp;this.source=src;this.comment='';this.locked=false;this.enabled=true;this._startTime=0;this._inPoint=0;this._outPoint=native.coupledCapacity&&src?src.duration:comp.duration;this.stretch=100;this.timeRemapEnabled=false;this.markerProperty=new Prop('ADBE Marker',this);this.essentialProperty=new Group('EP',this);if(src)for(const row of [...src.exposed].reverse()){const p=new Prop(row.name,this.essentialProperty);p.essentialPropertySource=row.source;this.essentialProperty.children.push(p);}}get index(){return this.containingComp.list.indexOf(this)+1;}get startTime(){return this._startTime;}set startTime(v){write();const value=storedTime(v,'startTime'),delta=value-this._startTime;this._startTime=value;if(native.quantizeTimes){this._inPoint=Math.round((this._inPoint+delta)*61440)/61440;this._outPoint=Math.round((this._outPoint+delta)*61440)/61440;}}get inPoint(){return this._inPoint;}set inPoint(v){write();this._inPoint=storedTime(v,'inPoint');}get outPoint(){return this._outPoint;}set outPoint(v){write();let value=storedTime(v,this.source?'rootOutPoint':'innerOutPoint');if(native.coupledCapacity&&this.source)value=Math.min(value,Math.round((this._startTime+this.source.duration)*61440)/61440);this._outPoint=value;if(this.source){this._inPoint+=fault('inPointSideEffect');this._startTime+=fault('startTimeSideEffect');}}property(n){if(n==='ADBE Marker')return this.markerProperty;return super.property(n);}remove(){write();this.containingComp.list.splice(this.index-1,1);}}
 class CompItem{constructor(name,w=320,h=180,pa=1,d=10,fps=30){this.id=++next;this.name=name;this.width=w;this.height=h;this.pixelAspect=pa;if(native.sourceFrameRate&&name==='Contentrium Glyphs')fps=native.sourceFrameRate;this.frameRate=fps;this.frameDuration=1/fps;this._duration=storedCapacity(d,fps,name);this.time=1;this.comment='';this.list=[];this.exposed=[];this.layers={addShape:()=>this.add(null),addNull:()=>this.add(null),add:s=>this.add(s)};}get duration(){return this._duration;}set duration(v){write();this._duration=storedCapacity(v,this.frameRate,this.name);}add(src){write();const l=new Layer(this,src);this.list.unshift(l);return l;}get numLayers(){return this.list.length;}layer(i){return this.list[i-1];}remove(){write();projects.splice(projects.indexOf(this),1);}}
 const app={project:{items:{addComp:(...a)=>{write();const c=new CompItem(...a);projects.push(c);return c;}},get numItems(){return projects.length;},item:i=>projects[i-1]}};
 const context={$:{cpJson:{parse:JSON.parse}},app,CompItem,Shape,MarkerValue,KeyframeInterpolationType:{LINEAR:'LINEAR'}};
 if(native.aeStringPrecision)context.String=value=>typeof value==='number'?String(Number(value.toPrecision(14))):String(value);
 assert.ok(fs.existsSync(source),'AE animated-font adapter module is missing');for(const f of ['animated-font-model.jsx','timeline-engine.jsx','animated-font-engine.jsx'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../jsx',f),'utf8').replace(native.markerTestAccess?'$.cpGlyph={':'__NO_PRIVATE_TEST_ACCESS__','$.cpGlyphMarkerTest=updateGlyphMarkers;$.cpGlyph={'),context,{filename:f});
 const api=context.$.cpGlyph,model=context.$.cpGlyphModel;let available=true;api.configure({resolvePack:ref=>{if(!available||ref.id!==fixture.id||ref.digest!==fixture.digest){const e=Error('Unavailable');e.code='GLYPH_PACK_UNAVAILABLE';throw e;}return fixture;}});const comp=app.project.items.addComp('Parent',320,180,1,10,30);
 const add=(text='AB',controls={},atTime=1)=>{const result=lastResult=api.apply(comp,api.preflight(comp,{fontId:fixture.id,fontHash:fixture.digest,text,controls,atTime}));return comp.list.find(l=>l.id===result.rootLayerId);};
 return {api,model,comp,context,projects,add,nativeRequests,get lastResult(){return lastResult;},nativeFault(values){Object.assign(nativeFaults,values);},get writes(){return writes;},zero(){writes=0;},inject(n){failAt=writes+n;},persistent(v){failAlways=v;},unavailable(){available=false;}};}
function meta(root){return JSON.parse(root.comment.split('\n').find(l=>l.startsWith('cpAnimatedFont|')).slice(15));}
function prop(layer,name){return layer.property('ADBE Effect Parade').property(name).property(1);}

test('GlyphSavedSections: joint animation tuple applies once without invalid intermediate state or opposite-marker changes',()=>{
 const h=harness(),r=h.add(),before=h.api.serialize(r),out=before.timeline.outMarker,defaults=meta(r).defaults;
 const saved=plain(h.api.captureControlSet(r,'Animation In'));saved.controls.inDelay.value=1.2;saved.controls.inSpeed.value=400;
 coded(()=>h.api.setControl(r,'inDelay',1.2),'INVALID_GLYPH_TIMING');h.zero();h.api.preflightControlSet(r,saved);assert.equal(h.writes,0);
 h.api.applyControlSet(r,saved);near(h.api.getControl(r,'inDelay'),1.2);near(h.api.getControl(r,'inSpeed'),400);near(h.api.serialize(r).timeline.outMarker,out);assert.deepEqual(meta(r).defaults,defaults);
});
test('GlyphSavedSections: offsets require exact scalar text identity and pack before any write',()=>{
 const h=harness(),a=h.add('A B'),b=h.add('AB'),saved=plain(h.api.captureControlSet(a,'Character Offsets'));assert.deepEqual(Object.keys(saved.controls),['offset:0','offset:2']);h.zero();
 coded(()=>h.api.applyControlSet(b,saved),'GLYPH_PROPERTY_SET_IDENTITY');assert.equal(h.writes,0);saved.pack.digest='wrong';coded(()=>h.api.preflightControlSet(a,saved),'GLYPH_PROPERTY_SET_IDENTITY');assert.equal(h.writes,0);
});
test('GlyphSavedSections: batch failure restores whole graph and visual changes preserve live dragged markers',()=>{
 const h=harness(),r=h.add(),saved=plain(h.api.captureControlSet(r,'Font'));saved.controls.size.value=140;saved.controls.tracking.value=50;
 const before=nativeSnapshot(h,r);h.inject(2);assert.throws(()=>h.api.applyControlSet(r,saved),/Injected/);assert.deepEqual(nativeSnapshot(h,r),before);
 const marks=plain(h.api.serialize(r).timeline);h.api.applyControlSet(r,saved);assert.equal(h.api.getControl(r,'size'),140);assert.deepEqual(plain(h.api.serialize(r).timeline),marks);
});
test('GlyphSavedSections: stored pack identity ignores JSON field order and matching tolerates only implied native time',()=>{
 const h=harness(pack(),{quantizeTimes:true}),r=h.add('AB',{},3.069736),saved=plain(h.api.captureControlSet(r,'Animation In'));
 saved.pack={digest:saved.pack.digest,id:saved.pack.id};saved.controls.inSpeed.value=123.456;saved.controls.inDelay.value=.013579;h.api.applyControlSet(r,saved);
 assert.equal(h.api.controlSetsEqual(r,saved,plain(h.api.captureControlSet(r,'Animation In'))),true);
 const wrong=plain(saved);wrong.controls.inSpeed.value=120;assert.equal(h.api.controlSetsEqual(r,wrong,plain(h.api.captureControlSet(r,'Animation In'))),false);
});
test('GlyphSavedSections: all sections expose exact members, read marker-derived speeds and reject invalid/read-only writes',()=>{
 const h=harness(),r=h.add('A B'),font=h.api.captureControlSet(r,'Font');assert.equal(Object.keys(font.controls).length,7);assert.equal(Object.keys(h.api.captureControlSet(r,'Animation In').controls).length,4);assert.equal(Object.keys(h.api.captureControlSet(r,'Animation Out').controls).length,4);
 const m=meta(r),rows=h.context.$.cpTimeline.read(r,m.instanceId),inside=rows.find(x=>x.role==='in');h.context.$.cpTimeline.set(r,m.instanceId,'in',{time:inside.time+.1});const speed=h.api.getControl(r,'inSpeed');assert.notEqual(speed,m.controls.inSpeed);assert.equal(h.api.captureControlSet(r,'Animation In').controls.inSpeed.value,speed);
 for(const mode of ['lock','shared','expression','missing']){const k=harness(),root=k.add(),set=plain(k.api.captureControlSet(root,'Font'));set.controls.size.value=120;if(mode==='lock')root.locked=true;if(mode==='shared')k.comp.layers.add(root.source);if(mode==='expression')prop(root,'cpAF size').expression='value';if(mode==='missing')root.markerProperty.removeKey(1);k.zero();assert.throws(()=>k.api.applyControlSet(root,set));assert.equal(k.writes,0,mode);}
});
test('GlyphSavedSections: final timing and foreign marker conflicts preflight without any mutation',()=>{
 for(const mode of ['overlap','foreign']){const h=harness(),r=h.add(),saved=plain(h.api.captureControlSet(r,'Animation In'));saved.controls.inSpeed.value=200;saved.controls.inDelay.value=mode==='overlap'?2:.1;if(mode==='foreign'){const mark=new h.context.MarkerValue('USER');mark.setParameters({custom:'preserve'});r.markerProperty.setValueAtTime(.8,mark);}const before=nativeSnapshot(h,r);h.zero();assert.throws(()=>h.api.preflightControlSet(r,saved),e=>e.code===(mode==='overlap'?'INVALID_GLYPH_TIMING':'MARKER_TIME_CONFLICT'));assert.equal(h.writes,0);assert.deepEqual(nativeSnapshot(h,r),before);}
});
test('GlyphSavedSections: late marker drift and metadata failure roll back values markers and source defaults',()=>{
 for(const mode of ['marker','metadata']){const h=harness(pack(),{quantizeTimes:true}),r=h.add(),saved=plain(h.api.captureControlSet(r,'Animation In'));saved.controls.inSpeed.value=200;saved.controls.inDelay.value=.02;const before=nativeSnapshot(h,r);if(mode==='marker')h.nativeFault({marker:.3});else{let comment=r.comment,first=true;Object.defineProperty(r,'comment',{get(){return comment;},set(value){if(first){first=false;throw Error('Metadata failure');}comment=value;},configurable:true});}assert.throws(()=>h.api.applyControlSet(r,saved));assert.deepEqual(nativeSnapshot(h,r),before,mode);}
});
test('GlyphSavedSectionsReadback: native drift in every section rejects success and restores the full snapshot',()=>{
 for(const [section,id,wanted,drift] of [['Font','size',150,149],['Character Offsets','offset:2',[10,20],[11,20]],['Animation In','inDelay',.04,.05],['Animation Out','outDelay',.04,.05]]){
  const h=harness(),r=h.add('A B'),saved=plain(h.api.captureControlSet(r,section)),input=prop(r,'cpAF '+id),write=input.setValue.bind(input);saved.controls[id].value=wanted;const before=nativeSnapshot(h,r);let once=true;input.setValue=v=>{if(once){once=false;return write(drift);}return write(v);};
  coded(()=>h.api.applyControlSet(r,saved),'GLYPH_CONTROL_READBACK');assert.deepEqual(nativeSnapshot(h,r),before,section);
 }
});
test('GlyphSavedSectionsReadback: boolean inputs and owned enabled flags require exact representation',()=>{
 for(const mode of ['reverse','enabled']){const h=harness(),r=h.add(),saved=plain(h.api.captureControlSet(r,'Animation In')),before=nativeSnapshot(h,r);if(mode==='reverse'){saved.controls.inReverse.value=true;const input=prop(r,'cpAF inReverse'),write=input.setValue.bind(input);let once=true;input.setValue=v=>write(once?(once=false,.75):v);}else{saved.controls.inEnabled.value=false;const marker=r.markerProperty,write=marker.setValueAtKey.bind(marker);let once=true;marker.setValueAtKey=(i,v)=>{if(once){once=false;v.setParameters({...v.getParameters(),cpEnabled:'1'});}return write(i,v);};}
  coded(()=>h.api.applyControlSet(r,saved),'GLYPH_CONTROL_READBACK');assert.deepEqual(nativeSnapshot(h,r),before,mode);
 }
});
test('GlyphSavedSectionsReadback: evidenced float32 rounding is accepted for native scalar point color and delay values',()=>{
 for(const section of ['Font','Character Offsets','Animation In','Animation Out']){const h=harness(),r=h.add('A B'),saved=plain(h.api.captureControlSet(r,section));if(section==='Font'){saved.controls.size.value=150.123456789;saved.controls.color.value=[.04,.2,.3];}else if(section==='Character Offsets')saved.controls['offset:2'].value=[.04,150.123456789];else saved.controls[section==='Animation In'?'inDelay':'outDelay'].value=.04;
  for(const input of Object.values(meta(r).rootInputs)){const p=r.property('ADBE Effect Parade').property(input.index).property(1),write=p.setValue.bind(p);p.setValue=v=>write(Array.isArray(v)?v.map(Math.fround):Math.fround(v));}
  assert.equal(h.api.applyControlSet(r,saved).changed,true,section);for(const [id,row] of Object.entries(saved.controls)){if(id==='inSpeed'||id==='outSpeed'||id==='duration')continue;const actual=plain(h.api.getControl(r,id)),expected=typeof row.value==='boolean'?row.value:(Array.isArray(row.value)?row.value.map(Math.fround):Math.fround(row.value));assert.deepEqual(actual,expected,id);}
 }
});
function geometryReadCounter(root){const m=meta(root),row=m.paths[0],layer=root.source.list.find(l=>l.id===row.layerId),p=row.path.reduce((v,key)=>v.property(key),layer),read=p.keyValue.bind(p);let count=0;p.keyValue=i=>{count++;return read(i);};return()=>count;}
test('GlyphReadSnapshot: one synchronous known-revision scope validates geometry once and retains independent public snapshots',()=>{
 const h=harness(),r=h.add();h.context.app.project.revision=1;const count=geometryReadCounter(r);
 const result=h.api.withReadSnapshot(()=>{const first=h.api.controls(r),reads=count();assert.ok(reads>0);const instance=h.api.instances(r)[0];instance.defaults.size=999;assert.equal(h.api.instances(r)[0].defaults.size,100);assert.deepEqual(plain(h.api.controls(r)),plain(first));assert.equal(count(),reads);return 'result';});assert.equal(result,'result');
 const before=count();h.api.withReadSnapshot(()=>h.api.controls(r));assert.ok(count()>before,'a later request validates again');
});
test('GlyphReadSnapshot: unknown or changed revision disables reuse and live markers refresh during the callback',()=>{
 for(const mode of ['unknown','changed']){const h=harness(),r=h.add(),count=geometryReadCounter(r);if(mode==='changed')h.context.app.project.revision=1;
  h.api.withReadSnapshot(()=>{h.api.controls(r);const reads=count();if(mode==='changed')h.context.app.project.revision++;h.api.controls(r);assert.ok(count()>reads,mode);});
 }
 const h=harness(),r=h.add();h.context.app.project.revision=1;h.api.withReadSnapshot(()=>{const speed=h.api.getControl(r,'inSpeed'),m=meta(r),inside=h.context.$.cpTimeline.read(r,m.instanceId).find(x=>x.role==='in');h.context.$.cpTimeline.set(r,m.instanceId,'in',{time:inside.time+.1});h.context.app.project.revision++;assert.notEqual(h.api.getControl(r,'inSpeed'),speed);});
});
test('GlyphReadSnapshot: fresh writes and exception cleanup never consume cached native bindings',()=>{
 const h=harness(),r=h.add();h.context.app.project.revision=1;h.api.withReadSnapshot(()=>{h.api.controls(r);prop(r,'cpAF size').expression='value';h.zero();coded(()=>h.api.setControl(r,'size',150),'GLYPH_BINDING_CHANGED');assert.equal(h.writes,0);});
 prop(r,'cpAF size').expression='';assert.throws(()=>h.api.withReadSnapshot(()=>{h.api.controls(r);throw Error('Callback failed');}),/Callback failed/);
 r.essentialProperty.children[0].name='Changed binding';h.zero();coded(()=>h.api.withReadSnapshot(()=>h.api.controls(r)),'GLYPH_BINDING_CHANGED');assert.equal(h.writes,0);
});
test('GlyphReadSnapshot: changed geometry between requests and changed comments or projects inside a request cannot reuse validation',()=>{
 const h=harness(),r=h.add();h.context.app.project.revision=1;h.api.withReadSnapshot(()=>h.api.controls(r));const row=meta(r).paths[0],sourceLayer=r.source.list.find(l=>l.id===row.layerId),p=row.path.reduce((v,key)=>v.property(key),sourceLayer);p.keys[0].value.vertices[0][0]+=1;h.zero();coded(()=>h.api.withReadSnapshot(()=>h.api.controls(r)),'GLYPH_GRAPH_CHANGED');assert.equal(h.writes,0);
 const k=harness(),root=k.add();k.context.app.project.revision=1;k.api.withReadSnapshot(()=>{k.api.controls(root);root.comment+='\ncpAnimatedFont|{}';coded(()=>k.api.controls(root),'GLYPH_GRAPH_CHANGED');});
 const n=harness(),layer=n.add();n.context.app.project.revision=1;const count=geometryReadCounter(layer);n.api.withReadSnapshot(()=>{n.api.controls(layer);const reads=count();n.context.app.project={...n.context.app.project};n.api.controls(layer);assert.ok(count()>reads);});
});
test('GlyphReadSnapshot: a nested callback exception caught by its outer callback invalidates cached reads',()=>{
 const h=harness(),r=h.add();h.context.app.project.revision=1;const count=geometryReadCounter(r);
 h.api.withReadSnapshot(()=>{h.api.controls(r);const reads=count();assert.throws(()=>h.api.withReadSnapshot(()=>{throw Error('Nested failed');}),/Nested failed/);h.api.controls(r);assert.ok(count()>reads,'a caught nested failure must force fresh validation');});
});

function watchGlyphRoles(root){
 const p=root.markerProperty,events=[],oldSet=p.setValueAtTime.bind(p),oldKey=p.setValueAtKey.bind(p),oldRemove=p.removeKey.bind(p);let cached='';
 function observe(action){const roles=p.keys.map(k=>k.value.getParameters().cpRole);events.push({action,roles});if(!roles.includes('in')||!roles.includes('out'))cached='GLYPH_MARKER_MISSING';}
 p.setValueAtTime=(t,v)=>{oldSet(t,v);observe('set');};p.removeKey=i=>{oldRemove(i);observe('remove');};
 p.setValueAtKey=(i,v)=>{oldKey(i,v);observe('set-key');};
 for(const ep of root.essentialProperty.children)Object.defineProperty(ep,'expressionError',{get:()=>cached});
 return events;
}
test('GlyphMarkerContinuity: all timing set/restore writes retain both roles and unchanged opposite marker',()=>{
 const h=harness(),r=h.add(),events=watchGlyphRoles(r),values={duration:3.1,inEnabled:false,inSpeed:120,inDelay:.04,inReverse:true,outEnabled:false,outSpeed:80,outDelay:.04,outReverse:true};
 for(const [id,value] of Object.entries(values)){const old=h.api.getControl(r,id);h.api.setControl(r,id,value);h.api.setControl(r,id,old);}
 assert.ok(events.length>0);assert.ok(events.every(e=>e.roles.includes('in')&&e.roles.includes('out')));
});
test('GlyphMarkerContinuity: unchanged marker role is not rewritten when only the opposite timing moves',()=>{
 const h=harness(),r=h.add(),p=r.markerProperty,oldSet=p.setValueAtTime.bind(p),seen=[];
 p.setValueAtTime=(t,v)=>{seen.push(v.getParameters().cpRole);oldSet(t,v);};
 h.api.setControl(r,'outSpeed',80);assert.ok(seen.includes('out'));assert.ok(!seen.includes('in'));
});
test('GlyphMarkerContinuity: a real persistent EP error still rejects mutation before writes',()=>{
 const h=harness(),r=h.add();Object.defineProperty(r.essentialProperty.children[0],'expressionError',{get:()=> 'REAL_BROKEN_EXPRESSION'});h.zero();
 coded(()=>h.api.setControl(r,'outSpeed',80),'GLYPH_BINDING_CHANGED');assert.equal(h.writes,0);
});
test('GlyphMarkerContinuity: relocating onto another role old time vacates that role first in either direction',()=>{
 for(const wanted of [[{role:'in',time:2,comment:'IN',enabled:true},{role:'out',time:3,comment:'OUT',enabled:true}],[{role:'in',time:.75,comment:'IN',enabled:true},{role:'out',time:1,comment:'OUT',enabled:true}]]){
  const h=harness(pack(),{markerTestAccess:true}),r=h.add(),events=watchGlyphRoles(r),m=meta(r);
  h.context.$.cpGlyphMarkerTest(r,m.instanceId,wanted,m.pack.id);
  const after=h.context.$.cpTimeline.read(r,m.instanceId);assert.equal(after.length,2);
  for(const spec of wanted)assert.equal(after.find(row=>row.role===spec.role).time,spec.time);
  assert.ok(events.every(e=>e.roles.includes('in')&&e.roles.includes('out')));
 }
});
test('GlyphMarkerContinuity: unresolved native-close owned collision rejects before marker writes',()=>{
 const h=harness(pack(),{markerTestAccess:true}),r=h.add(),m=meta(r);h.zero();
 coded(()=>h.context.$.cpGlyphMarkerTest(r,m.instanceId,[{role:'in',time:2-1e-6,enabled:true},{role:'out',time:2,enabled:true}],m.pack.id),'MARKER_TIME_CONFLICT');assert.equal(h.writes,0);
});
test('GlyphMarkerContinuity: enabled-only changes update existing key and preserve complete owned MarkerValue',()=>{
 const h=harness(),r=h.add(),p=r.markerProperty,m=meta(r),inRow=h.context.$.cpTimeline.read(r,m.instanceId).find(x=>x.role==='in'),v=p.keyValue(inRow.index);
 Object.assign(v,{duration:.05,label:4,protectedRegion:true,chapter:'own chapter',url:'own url',frameTarget:'own target',cuePointName:'own cue',eventCuePoint:false});v.setParameters({...v.getParameters(),custom:'owned custom'});
 const oldSet=p.setValueAtTime.bind(p);let timeWrites=0;p.setValueAtTime=(t,v)=>{timeWrites++;oldSet(t,v);};
 h.api.setControl(r,'inEnabled',false);assert.equal(timeWrites,0);const after=p.keyValue(inRow.index);
 for(const key of ['duration','label','protectedRegion','chapter','url','frameTarget','cuePointName','eventCuePoint'])assert.equal(after[key],v[key]);
 assert.equal(after.getParameters().custom,'owned custom');assert.equal(after.getParameters().cpEnabled,'0');
});

test('GlyphEPRefresh: explicit missing marker Reset evaluates exact enabled cached EP error after the marker exists',()=>{
 const h=harness(),r=h.add(),ep=r.essentialProperty.children.find(p=>p.name==='cpAF InSpan');let cached='',evaluations=0;
 Object.defineProperty(ep,'expressionError',{get:()=>cached});ep.valueAtTime=(time,pre)=>{evaluations++;assert.equal(time,r.containingComp.time);assert.equal(pre,false);assert.equal(r.markerProperty.numKeys,2);cached='';return .5;};
 r.markerProperty.removeKey(1);cached='GLYPH_MARKER_MISSING';h.zero();h.api.preflightReset(r,{controlId:'inEnabled'});assert.equal(evaluations,0);assert.equal(h.writes,0);
 h.api.reset(r,{controlId:'inEnabled'});assert.equal(evaluations,1);assert.equal(h.api.controls(r).length,17);
});
test('GlyphEPRefresh: changed or disabled expression is never evaluated to conceal invalid binding',()=>{
 for(const mode of ['changed','disabled']){const h=harness(),r=h.add(),ep=r.essentialProperty.children[0];let evaluations=0;Object.defineProperty(ep,'expressionError',{get:()=> 'cached'});ep.valueAtTime=()=>{evaluations++;return 0;};if(mode==='changed')ep.expression='123';else ep.expressionEnabled=false;h.zero();coded(()=>h.api.controls(r),'GLYPH_BINDING_CHANGED');assert.equal(evaluations,0);assert.equal(h.writes,0);}
});
test('GlyphEPRefresh: evaluation throw and post-evaluation disabled expression remain hard errors',()=>{
 for(const mode of ['throw','disable']){const h=harness(),r=h.add(),ep=r.essentialProperty.children[0];let cached='cached',evaluations=0;Object.defineProperty(ep,'expressionError',{get:()=>cached});ep.valueAtTime=()=>{evaluations++;cached='';if(mode==='throw')throw Error('real evaluation failure');ep.expressionEnabled=false;return 0;};h.zero();coded(()=>h.api.controls(r),'GLYPH_BINDING_CHANGED');assert.equal(evaluations,1);assert.equal(h.writes,0);}
});
test('GlyphEPRefresh: clean polling never evaluates and cached readback refresh is bounded to one read without writes',()=>{
 const h=harness(),r=h.add(),ep=r.essentialProperty.children[0];let evaluations=0,cached='';
 Object.defineProperty(ep,'expressionError',{get:()=>cached});ep.valueAtTime=()=>{evaluations++;cached='';return 0;};
 h.zero();h.api.controls(r);assert.equal(evaluations,0);assert.equal(h.writes,0);
 cached='cached';assert.equal(h.api.getControl(r,'size'),100);assert.equal(evaluations,1);assert.equal(h.writes,0);
 h.api.controls(r);assert.equal(evaluations,1);assert.equal(h.writes,0);
});
test('GlyphFriendlyDescriptors: speed display precision and readable labels leave identifiers and raw values intact',()=>{
 const h=harness(),r=h.add(),before=plain(h.api.serialize(r)),controls=h.api.controls(r),by=id=>controls.find(c=>c.id===id);
 assert.equal(by('inSpeed').name,'In Speed');assert.equal(by('outSpeed').name,'Out Speed');assert.equal(by('inSpeed').precision,2);assert.equal(by('outSpeed').precision,2);
 assert.equal(by('size').name,'Size');assert.equal(by('tracking').name,'Tracking');assert.equal(by('offset:0').name,'Character 1 Offset');assert.equal(by('offset:1').name,'Character 2 Offset');
 for(const c of controls){assert.deepEqual(plain(c.value),plain(h.api.getControl(r,c.id)));if(!['inSpeed','outSpeed'].includes(c.id))assert.equal(c.precision,undefined);assert.equal(c.step,undefined);}
 assert.deepEqual(plain(h.api.serialize(r)),before);
});
test('GlyphResetPreflight: shared reset plan is read-only and validates missing-marker recovery before writes',()=>{
 const h=harness(),r=h.add();r.markerProperty.removeKey(1);h.zero();assert.deepEqual(plain(h.api.preflightReset(r,{controlId:'inEnabled'})),{changed:true,sideEffects:false});assert.equal(h.writes,0);h.api.reset(r,{controlId:'inEnabled'});assert.equal(h.api.controls(r).length,17);
 for(const mode of ['pack','root-lock','inner-lock','shared','collision','unknown']){const g=harness(),root=g.add();root.markerProperty.removeKey(1);if(mode==='pack')g.unavailable();if(mode==='root-lock')root.locked=true;if(mode==='inner-lock')root.source.layer(1).locked=true;if(mode==='shared')g.comp.layers.add(root.source);if(mode==='collision')root.markerProperty.setValueAtTime(1,new g.context.MarkerValue('USER'));g.zero();assert.throws(()=>g.api.preflightReset(root,{controlId:mode==='unknown'?'offsets':'inEnabled'}),mode);assert.equal(g.writes,0,mode);}
});

test('GlyphNativeGraph: independent keyed shapes, source ownership, descriptor handlers and indexed expression clock agree with pure samples',()=>{const h=harness(),r=h.add('A B'),m=meta(r);assert.equal(r.source.numLayers,5);assert.equal(m.kind,'animated-font');assert.equal(r.source.comment,'cpAnimatedFontSource|'+m.instanceId);near(r.inPoint,.5);near(r.outPoint,2.5);assert.equal(h.api.getControl(r,'tracking'),20);assert.deepEqual(plain(h.api.getControl(r,'offset:2')),[0,0]);assert.ok(h.api.controls(r).every(d=>d.actions.every(a=>a==='reset')));const sourceController=r.source.list.find(l=>l.comment.includes('|controller|'));assert.ok(sourceController);for(const p of sourceController.property('ADBE Effect Parade').children)assert.equal(p.property(1).expression,'');
 const consumers=r.source.list.filter(l=>l.comment.includes('|consumer|'));assert.equal(consumers.length,2);for(const layer of consumers){const body=layer.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group');const expression=body.property(1).property('ADBE Vector Shape').expression;assert.ok(expression.includes('parent.effect('));assert.ok(!expression.includes('comp('));}
 const eps=r.essentialProperty.children;for(const channel of ['RootElapsed','InSpan','OutSpan','TotalDuration','ParentFrameDuration','InDelay','OutDelay','InEnabled','OutEnabled','InReverse','OutReverse'])assert.ok(eps.find(p=>p.name==='cpAF '+channel));
 const layout=h.model.layout(pack(),'A B',{}),timing=h.model.resolveTiming(pack(),layout,{mode:'create',atTime:1,totalDuration:2,frameDuration:1/30,inSpeed:100,outSpeed:100,inDelay:.1,outDelay:.1,inReverse:false,outReverse:false,inEnabled:true,outEnabled:true});
 for(const t of [.49,.5,.7,.9,1,1.2,1.999,2,2.1,2.5]){const sampled=h.model.sample(pack(),layout,timing,t);for(let i=0;i<consumers.length;i++){const layer=consumers.find(l=>l.comment.endsWith('|'+i)),data=r.source.list.find(l=>l.comment.endsWith('|data|'+i)),expr=layer.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').property(1).property('ADBE Vector Shape').expression;
  const values={RootElapsed:t-r.inPoint,InSpan:.5,OutSpan:.5,TotalDuration:2,ParentFrameDuration:1/30,InDelay:.1,OutDelay:.1,InEnabled:1,OutEnabled:1,InReverse:0,OutReverse:0};const effect=index=>{const fx=sourceController.property('ADBE Effect Parade').property(index);return ()=>values[fx.name.slice(5)]??fx.property(1).value;};const content=index=>({content:()=>({path:{valueAtTime:s=>({sourceTime:s})}})});const out=vm.runInNewContext(expr,{parent:{effect},thisComp:{layer:index=>({content})},Math});near(out.sourceTime,sampled[i].sourceTime);assert.ok(data);}}
});
test('GlyphEPBindings: reverse enumeration is source verified; duplicate/wrong/missing/replaced bindings reject without repair',()=>{for(const change of [r=>{r.essentialProperty.children[0].name=r.essentialProperty.children[1].name;},r=>{r.essentialProperty.children[0].essentialPropertySource={};},r=>{r.essentialProperty.children.pop();},r=>{r.essentialProperty.children[0].expression='999';}]){const h=harness(),r=h.add();change(r);h.zero();coded(()=>h.api.controls(r),'GLYPH_BINDING_CHANGED');assert.equal(h.writes,0);}const h=harness(),r=h.add();r.name='Renamed';h.comp.name='Renamed parent';r.source.name='Renamed source';assert.equal(h.api.getControl(r,'size'),100);});
test('GlyphControlTransactions: every typed setter reads actual values, no-op writes zero, timing preserves fractional bounds/opposite marker and source coverage',()=>{const h=harness(),r=h.add(),values={color:[.2,.3,.4],size:150,tracking:33,verticalStagger:12,characterRotation:17,skew:-8,'offset:0':[12,-4],inSpeed:150,outSpeed:125,inDelay:.03,outDelay:.04,inReverse:true,outReverse:true,inEnabled:false,outEnabled:false,duration:4.013579};for(const id of Object.keys(values)){const start=r.startTime;h.api.setControl(r,id,values[id]);if(typeof values[id]==='number')near(h.api.getControl(r,id),values[id]);else assert.deepEqual(plain(h.api.getControl(r,id)),values[id]);assert.equal(r.startTime,start);h.zero();assert.equal(h.api.setControl(r,id,values[id]).changed,false);assert.equal(h.writes,0);}assert.ok(r.source.duration>=r.outPoint-r.startTime);assert.ok(r.source.list.every(l=>l.outPoint>=r.source.duration));const before=h.api.serialize(r);h.api.setControl(r,'duration',2.013579);const after=h.api.serialize(r);near(before.timeline.outPoint-before.timeline.outMarker,after.timeline.outPoint-after.timeline.outMarker);near(after.timeline.outPoint,2.013579);});
test('GlyphPreflight: invalid requests, user-marker collisions, unknown controls and host limits write zero',()=>{const h=harness();for(const request of [{text:'X'},{text:'AB',controls:{duration:.2}},{text:'AB',atTime:20000}]){h.zero();assert.throws(()=>h.api.preflight(h.comp,{fontId:pack().id,fontHash:pack().digest,...request}));assert.equal(h.writes,0);}const r=h.add();r.markerProperty.setValueAtTime(.8,new h.context.MarkerValue('USER'));h.zero();coded(()=>h.api.setControl(r,'inSpeed',200),'MARKER_TIME_CONFLICT');assert.equal(h.writes,0);assert.equal(r.markerProperty.keys.find(k=>k.time===.8).value.comment,'USER');coded(()=>h.api.setControl(r,'imaginary',1),'CONTROL_NOT_FOUND');});
test('GlyphOwnership: locked/manual/missing/shared sources reject edits and preserve sibling; remove checks references',()=>{for(const mutate of [r=>{r.locked=true;},r=>{r.source.comment='foreign';},r=>{r.source.list.pop();},r=>{r.timeRemapEnabled=true;},r=>{r.stretch=-100;}]){const h=harness(),r=h.add(),s=h.add('BA');mutate(r);h.zero();assert.throws(()=>h.api.setControl(r,'size',120));assert.equal(h.writes,0);assert.equal(h.api.getControl(s,'size'),100);}const h=harness(),r=h.add(),dup=h.comp.layers.add(r.source);h.zero();coded(()=>h.api.setControl(r,'size',130),'GLYPH_SOURCE_SHARED');coded(()=>h.api.remove(r,meta(r).instanceId),'GLYPH_SOURCE_SHARED');assert.equal(h.writes,0);dup.remove();const s=h.add();h.api.remove(r,meta(r).instanceId);assert.equal(h.api.getControl(s,'size'),100);});
test('GlyphRollback: midway Add cleans only created objects, source extension restores fields and reports rollback failure',()=>{const h=harness(),s=h.add();const ids=h.projects.map(c=>c.id);h.inject(15);assert.throws(()=>h.add());assert.deepEqual(h.projects.map(c=>c.id),ids);assert.equal(h.api.getControl(s,'size'),100);const r=h.add(),before=h.api.serialize(r),duration=r.source.duration;h.inject(3);assert.throws(()=>h.api.setControl(r,'duration',5));assert.deepEqual(plain(h.api.serialize(r)),plain(before));assert.equal(r.source.duration,duration);const original=r.source.duration;Object.defineProperty(r.source,'duration',{get(){return original;},set(){throw Error('Cannot extend or restore');}});assert.throws(()=>h.api.setControl(r,'duration',6),e=>{assert.ok(e.rollbackError);return true;});});
test('GlyphPersistence: exact relative schema, fresh restore and unavailable pack leaves native graph/readback intact',()=>{const h=harness(),r=h.add('AB',{},3.069736);h.api.setControl(r,'duration',2.013579);const data=plain(h.api.serialize(r));assert.deepEqual(Object.keys(data).sort(),['controls','kind','pack','schemaVersion','text','timeline']);assert.equal(data.timeline.inPoint,0);near(data.timeline.inMarker,.5);assert.equal(data.timeline.outPoint,2.013579);const result=h.api.restore(h.comp,data,{atTime:5.123456}),restored=h.comp.list.find(l=>l.id===result.rootLayerId);assert.notEqual(restored.source.id,r.source.id);near(restored.inPoint,5.123456);assert.equal(h.api.serialize(restored).text,'AB');h.unavailable();h.zero();const descriptors=h.api.controls(r);assert.ok(descriptors.every(d=>d.enabled===false&&d.readOnlyCode==='GLYPH_PACK_UNAVAILABLE'));assert.equal(h.api.getControl(r,'size'),100);assert.equal(h.writes,0);coded(()=>h.api.restore(h.comp,data,{atTime:1}),'GLYPH_PACK_UNAVAILABLE');});
test('GlyphMissingMarkers: reads never repair; explicit reset preserves user comment and foreign markers',()=>{const h=harness(),r=h.add();r.comment+='\nUser notes';r.markerProperty.setValueAtTime(1.4,new h.context.MarkerValue('USER'));const owned=r.markerProperty.keys.findIndex(k=>k.value.getParameters().cpRole==='in');r.markerProperty.removeKey(owned+1);h.zero();coded(()=>h.api.getControl(r,'inSpeed'),'GLYPH_MARKER_MISSING');assert.equal(h.writes,0);h.api.reset(r,{controlId:'inSpeed'});assert.equal(h.api.getControl(r,'inSpeed'),100);assert.ok(r.comment.includes('User notes'));assert.equal(r.markerProperty.keys.find(k=>k.time===1.4).value.comment,'USER');});
test('GlyphES3: runtime is ES3 and owns no Undo, commands, filesystem or parent-name transport',()=>{harness();const src=fs.readFileSync(source,'utf8');require('acorn').parse(src,{ecmaVersion:3});assert.ok(!/beginUndoGroup|endUndoGroup|executeCommand|new File|new Folder|comp\("/.test(src));});
test('GlyphGraphIntegrity: reordering owned source layers or adding native path content rejects indexed binding drift',()=>{for(const change of [r=>r.source.list.reverse(),r=>{const c=r.source.list.find(l=>l.comment.includes('|consumer|'));c.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').addProperty('ADBE Vector Shape - Group');}]){const h=harness(),r=h.add();change(r);h.zero();assert.throws(()=>h.api.controls(r));assert.equal(h.writes,0);}});
test('GlyphNativeWrappers: distinct live native wrappers use full property ancestry and source/controller identity',()=>{const h=harness(),r=h.add();function wrapper(p){return new Proxy(p,{get(target,key){if(key==='parentProperty')return target.parentProperty?wrapper(target.parentProperty):null;return Reflect.get(target,key);}});}for(const ep of r.essentialProperty.children){const p=ep.essentialPropertySource;Object.defineProperty(ep,'essentialPropertySource',{configurable:true,get(){return wrapper(p);}});}assert.equal(h.api.getControl(r,'size'),100);const sibling=h.add(),controller=sibling.source.list.find(l=>l.comment.includes('|controller|')),ep=r.essentialProperty.children[0],nativeIndex=ep.essentialPropertySource.parentProperty.propertyIndex;Object.defineProperty(ep,'essentialPropertySource',{configurable:true,get(){return wrapper(controller.property('ADBE Effect Parade').property(nativeIndex).property(1));}});h.zero();coded(()=>h.api.controls(r),'GLYPH_BINDING_CHANGED');assert.equal(h.writes,0);});
test('GlyphClockExpressions: root EP evaluation and authored native path samples match pure model for reverse, disabled, fractional and unequal phases',()=>{for(const unequal of [false,true])for(const controls of [{},{inReverse:true,outReverse:true},{inEnabled:false},{outEnabled:false},{inEnabled:false,outEnabled:false},{inDelay:.013579,outDelay:.027369}]){const fixture=pack();if(unequal){fixture.clock.entryEnd=.2;for(const glyph of fixture.glyphs)for(const path of glyph.paths)path.keys[1].time=.2;}const h=harness(fixture),r=h.add('A B',controls,3.069736),m=meta(r),controller=r.source.list.find(l=>l.comment.includes('|controller|')),serial=h.api.serialize(r),l=h.model.layout(fixture,'A B',serial.controls),marks=h.context.$.cpTimeline.read(r,m.instanceId),at={};for(const marker of marks)at[marker.role]=marker.time;const timing=h.model.resolveTiming(fixture,l,{mode:'read',inPoint:r.inPoint,inMarker:at.in,outMarker:at.out,outPoint:r.outPoint,frameDuration:1/30,...serial.controls});for(const delta of [-.01,0,.1,.2,.4,.5,.75,1,1.2,1.5,1.99,2]){const time=r.inPoint+delta,expected=h.model.sample(fixture,l,timing,time),values={};for(const ep of r.essentialProperty.children){const marker={numKeys:r.markerProperty.numKeys,key:i=>({time:r.markerProperty.keyTime(i),parameters:r.markerProperty.keyValue(i).getParameters()})};const value=vm.runInNewContext(ep.expression,{thisLayer:{inPoint:r.inPoint,outPoint:r.outPoint,marker,effect:i=>()=>r.property('ADBE Effect Parade').property(i).property(1).value},thisComp:{frameDuration:1/30},time,Error});values[ep.name.slice(5)]=value;}for(let i=0;i<2;i++){const consumer=r.source.list.find(x=>x.comment.endsWith('|consumer|'+i)),expression=consumer.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').property(1).property('ADBE Vector Shape').expression;const got=vm.runInNewContext(expression,{parent:{effect:index=>()=>values[controller.property('ADBE Effect Parade').property(index).name.slice(5)]},thisComp:{layer:index=>({content:()=>({content:pathIndex=>({path:{valueAtTime:s=>({sourceTime:s,shape:r.source.layer(index).property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').property(pathIndex).property('ADBE Vector Shape').valueAtTime(s)})}})})})},Math});const normalized=h.model.resolveTiming(fixture,l,{mode:'read',inPoint:0,inMarker:values.InSpan,outMarker:values.TotalDuration-values.OutSpan,outPoint:values.TotalDuration,frameDuration:values.ParentFrameDuration,...serial.controls});const normalizedSample=h.model.sample(fixture,l,normalized,values.RootElapsed);near(got.sourceTime,normalizedSample[i].sourceTime);for(let k=0;k<3;k++)for(let axis=0;axis<2;axis++)near(got.shape.vertices[k][axis],expected[i].paths[0].vertices[k][axis]);}}}});
test('GlyphUnequalReverse: reversed source exit length moves only IN and preserved live speed drives both directions',()=>{const p=pack();p.clock.entryEnd=.2;p.clock.bodyEnd=.6;for(const glyph of p.glyphs)for(const shape of glyph.paths){shape.keys[1].time=.2;}const h=harness(p),r=h.add(),before=h.api.serialize(r);near(r.inPoint,.7);h.api.setControl(r,'inReverse',true);const reverse=h.api.serialize(r);near(reverse.timeline.inMarker,.5);near(reverse.timeline.outMarker,before.timeline.outMarker);near(reverse.controls.inSpeed,100);h.api.setControl(r,'outReverse',true);const both=h.api.serialize(r);near(both.timeline.outPoint-both.timeline.outMarker,.3);near(both.controls.outSpeed,100);});
test('GlyphVisualExpressions: em scale is applied once and source-local position/rotation/skew/color use live typed inputs',()=>{const h=harness(),r=h.add('A B',{size:150,tracking:33,verticalStagger:12,characterRotation:17,skew:-8,color:[.2,.3,.4],offsets:{'0':[12,-4],'2':[5,9]}}),m=meta(r),c=r.source.list.find(l=>l.comment.includes('|controller|')),layout=h.model.layout(pack(),'A B',h.api.serialize(r).controls),sample=h.model.sample(pack(),layout,h.model.resolveTiming(pack(),layout,{mode:'create',atTime:1,totalDuration:2,frameDuration:1/30,...layout.controls}),1.2),values={};for(const key of Object.keys(m.channels)){const rootKey=key.startsWith('Offset_')?'offset:'+key.slice(7):key;values[key]=m.rootInputs[rootKey]?r.property('ADBE Effect Parade').property(m.rootInputs[rootKey].index).property(1).value:0;}const parent={effect:index=>()=>values[c.property('ADBE Effect Parade').property(index).name.slice(5)]};for(let i=0;i<2;i++){const consumer=r.source.list.find(l=>l.comment.endsWith('|consumer|'+i));const pos=vm.runInNewContext(consumer.property('ADBE Transform Group').property('ADBE Position').expression,{parent});assert.deepEqual(plain(pos),plain(sample[i].position));const vector=consumer.property('ADBE Root Vectors Group').property(1);for(const [native,field]of [['ADBE Vector Rotation','rotation'],['ADBE Vector Skew','skew']])near(vm.runInNewContext(vector.property('ADBE Vector Transform Group').property(native).expression,{parent}),sample[i][field]);assert.deepEqual(plain(vm.runInNewContext(vector.property('ADBE Vectors Group').property(2).property('ADBE Vector Fill Color').expression,{parent})).slice(0,3),plain(sample[i].color));}const scale=vm.runInNewContext(c.property('ADBE Transform Group').property('ADBE Scale').expression,{effect:index=>()=>values[c.property('ADBE Effect Parade').property(index).name.slice(5)]});near(scale[0]/100,sample[0].scale);});
test('GlyphSourceDefaults: standalone source clock inputs are expression-free and form a valid normalized timeline',()=>{const h=harness(),r=h.add(),m=meta(r),c=r.source.list.find(l=>l.comment.includes('|controller|'));const v={};for(const name of ['RootElapsed','InSpan','OutSpan','TotalDuration','ParentFrameDuration','InDelay','OutDelay','InEnabled','OutEnabled','InReverse','OutReverse'])v[name]=c.property('ADBE Effect Parade').property(m.channels[name].index).property(1).value;assert.equal(v.InSpan,.5);assert.equal(v.OutSpan,.5);assert.equal(v.TotalDuration,2);assert.equal(v.ParentFrameDuration,1/30);assert.equal(v.InEnabled,1);assert.equal(v.InDelay,.1);});
test('GlyphNativeBounds: initial Slider and vector-skew host limits preflight with zero writes; point controls retain native unbounded range',()=>{const h=harness();for(const controls of [{size:1000001},{skew:86},{tracking:-1000001}]){h.zero();assert.throws(()=>h.api.preflight(h.comp,{fontId:pack().id,fontHash:pack().digest,text:'AB',controls}));assert.equal(h.writes,0);}const r=h.add();h.zero();assert.throws(()=>h.api.preflightControl(r,'skew',-86));assert.equal(h.writes,0);h.api.setControl(r,'offset:0',[10000001,-10000001]);assert.deepEqual(plain(h.api.getControl(r,'offset:0')),[10000001,-10000001]);assert.equal(h.api.controls(r).find(d=>d.id==='skew').max,85);});
test('GlyphNativeMissingMarkerError: marker-derived EP expression errors preserve missing-marker recovery semantics',()=>{const h=harness(),r=h.add();r.markerProperty.removeKey(1);for(const p of r.essentialProperty.children)Object.defineProperty(p,'expressionError',{get(){return r.markerProperty.numKeys<2?'GLYPH_MARKER_MISSING':'';}});h.zero();coded(()=>h.api.getControl(r,'size'),'GLYPH_MARKER_MISSING');assert.equal(h.writes,0);h.api.reset(r,{controlId:'inSpeed'});near(h.api.getControl(r,'inSpeed'),100);});
test('GlyphSourceCoverage: shortening inner coverage or negative normal source time rejects reads without writes',()=>{for(const change of [r=>{r.source.list[0]._outPoint=.1;},r=>{r.startTime=r.inPoint+.1;}]){const h=harness(),r=h.add();change(r);h.zero();coded(()=>h.api.controls(r),'GLYPH_SOURCE_COVERAGE');assert.equal(h.writes,0);}});
test('GlyphMultiplePaths: each glyph preserves separate authored keyed paths and one consumer fill',()=>{const p=pack();p.glyphs[0].paths.push(plain(p.glyphs[0].paths[0]));p.glyphs[1].paths.push(plain(p.glyphs[1].paths[0]),plain(p.glyphs[1].paths[0]));const h=harness(p),r=h.add(),m=meta(r);assert.equal(m.paths.length,5);for(const [rank,count]of [[0,2],[1,3]]){const data=r.source.list.find(l=>l.comment.endsWith('|data|'+rank)),consumer=r.source.list.find(l=>l.comment.endsWith('|consumer|'+rank));assert.equal(data.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').numProperties,count);assert.equal(consumer.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').numProperties,count+1);}assert.equal(h.api.serialize(r).text,'AB');});
test('GlyphReadOnlyDescriptors: shared sources and locked owned layers are explicit read-only edit states',()=>{for(const mutate of [(h,r)=>h.comp.layers.add(r.source),(h,r)=>{r.source.list[0].locked=true;},(h,r)=>{r.locked=true;}]){const h=harness(),r=h.add();mutate(h,r);h.zero();const list=h.api.controls(r);assert.ok(list.every(d=>d.enabled===false&&d.readOnlyCode&&d.actions.length===0));assert.equal(h.writes,0);}});
test('GlyphSubsetCoverage: single-A, single-B, repeated A and BA preserve only used durable geometry with exact external identity',()=>{for(const text of ['A','B','AA','A A','BA']){const h=harness(),r=h.add(text),m=meta(r),data=h.api.serialize(r);assert.equal(data.text,text);assert.deepEqual(plain(data.pack),{id:pack().id,digest:pack().digest});assert.deepEqual(m.header.glyphs.map(g=>g.codePoint).sort(),[...new Set([...text].map(c=>c.codePointAt(0)))].sort());h.unavailable();assert.equal(h.api.getControl(r,'size'),100);}});
test('GlyphFix1Interpolation: changed authored in/out interpolation rejects all graph reads and controls with zero writes',()=>{
 for(const direction of ['in','out']){
  const h=harness(),r=h.add(),data=r.source.list.find(l=>l.comment.endsWith('|data|0'));
  const p=data.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').property(1).property('ADBE Vector Shape');
  p.setInterpolationTypeAtKey(2,direction==='in'?'BEZIER':'LINEAR',direction==='out'?'HOLD':'LINEAR');
  const operations=[()=>h.api.controls(r),()=>h.api.getControl(r,'size'),()=>h.api.preflightControl(r,'size',120),()=>h.api.setControl(r,'size',120),()=>h.api.reset(r,{controlId:'size'}),()=>h.api.serialize(r)];
  for(const operation of operations){h.zero();coded(operation,'GLYPH_GRAPH_CHANGED');assert.equal(h.writes,0);}
 }
});
test('GlyphFix1StaticRendering: modified consumer/controller transforms, group transforms and fill opacity reject reads/edits without repair',()=>{
 const changes=[
  (c,k)=>c.property('ADBE Transform Group').property('ADBE Scale').setValue([200,200]),
  (c,k)=>c.property('ADBE Transform Group').property('ADBE Rotate Z').setValue(25),
  (c,k)=>c.property('ADBE Transform Group').property('ADBE Opacity').setValue(50),
  (c,k)=>c.property('ADBE Transform Group').property('ADBE Scale').setValueAtTime(0,[100,100]),
  (c,k)=>{c.property('ADBE Transform Group').property('ADBE Scale').expression='[100,100]';},
  (c,k)=>k.property('ADBE Transform Group').property('ADBE Rotate Z').setValue(10),
  (c,k)=>c.property('ADBE Root Vectors Group').property(1).property('ADBE Vector Transform Group').property('ADBE Vector Scale').setValue([150,150]),
  (c,k)=>c.property('ADBE Root Vectors Group').property(1).property('ADBE Vector Transform Group').property('ADBE Vector Position').setValue([10,0]),
  (c,k)=>c.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').property(2).property('ADBE Vector Fill Opacity').setValue(20),
  (c,k)=>c.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').property(2).property('ADBE Vector Fill Rule').setValue(2),
  (c,k)=>{c.solo=true;},(c,k)=>{c.threeDLayer=true;},
  (c,k)=>{c.adjustmentLayer=true;},(c,k)=>{c.blendingMode=5213;},
  (c,k)=>{c.guideLayer=true;},(c,k)=>{c.motionBlur=true;},(c,k)=>{c.preserveTransparency=true;},
  (c,k)=>c.property('ADBE Effect Parade').addProperty('ADBE Slider Control'),
  (c,k)=>c.property('ADBE Mask Parade').children.push({})
 ];
 for(const change of changes){const h=harness(),r=h.add(),c=r.source.list.find(l=>l.comment.endsWith('|consumer|0')),k=r.source.list.find(l=>l.comment.includes('|controller|'));change(c,k);h.zero();coded(()=>h.api.controls(r),'GLYPH_GRAPH_CHANGED');coded(()=>h.api.setControl(r,'size',120),'GLYPH_GRAPH_CHANGED');assert.equal(h.writes,0);}
 const h=harness(),r=h.add(),m=meta(r),scale=m.staticProperties.find(p=>p.path.join('/')==='ADBE Transform Group/ADBE Scale');
 assert.deepEqual(scale.value,[100,100,100],'Native 2D layer Scale retains its observed three-component value');
 r.property('ADBE Transform Group').property('ADBE Scale').setValue([200,200,100]);
 assert.equal(h.api.getControl(r,'size'),100,'User root placement/scale remains outside the source integrity boundary');
 r.source.width=640;h.zero();coded(()=>h.api.controls(r),'GLYPH_GRAPH_CHANGED');assert.equal(h.writes,0);
});
test('GlyphFix1ControlSurface: internal compound offsets and every non-descriptor ID reject get/preflight/set/reset with zero writes',()=>{
 const h=harness(),r=h.add('A B');
 for(const id of ['offsets','pack','layout','toString','offset:1','offset:01','offset:-1',null,{}]){
  for(const operation of [()=>h.api.getControl(r,id),()=>h.api.preflightControl(r,id,{'0':[8,9]}),()=>h.api.setControl(r,id,{'0':[8,9]}),()=>h.api.reset(r,{controlId:id})]){
   h.zero();coded(operation,'CONTROL_NOT_FOUND');assert.equal(h.writes,0);
  }
 }
 for(const d of h.api.controls(r)){assert.deepEqual(plain(h.api.getControl(r,d.id)),plain(d.value));h.api.preflightControl(r,d.id,d.value);}
});
test('GlyphFix1ES3Portability: no unparenthesized nested conditional in host JSX, with fully typed controls/groups',()=>{
 const tree=require('acorn').parse(fs.readFileSync(source,'utf8'),{ecmaVersion:3,preserveParens:true,locations:true}),bad=[];
 function walk(node){if(!node||typeof node!=='object')return;if(node.type==='ConditionalExpression')for(const key of ['test','consequent','alternate'])if(node[key]?.type==='ConditionalExpression')bad.push(node.loc.start.line);for(const [key,child]of Object.entries(node)){if(key==='loc')continue;if(Array.isArray(child))child.forEach(walk);else if(child&&typeof child.type==='string')walk(child);}}
 walk(tree);assert.deepEqual(bad,[],'Native ExtendScript mis-evaluates unparenthesized nested conditionals');
 const h=harness(),r=h.add(),m=meta(r),descriptors=h.api.controls(r);
 const expected={duration:['time','Font'],inEnabled:['checkbox','Animation In'],inSpeed:['slider','Animation In'],inDelay:['time','Animation In'],inReverse:['checkbox','Animation In'],outEnabled:['checkbox','Animation Out'],outSpeed:['slider','Animation Out'],outDelay:['time','Animation Out'],outReverse:['checkbox','Animation Out'],size:['slider','Font'],tracking:['slider','Font'],verticalStagger:['slider','Font'],characterRotation:['slider','Font'],skew:['slider','Font'],color:['color','Font'],'offset:0':['point','Character Offsets'],'offset:1':['point','Character Offsets']};
 assert.equal(descriptors.length,Object.keys(expected).length);
 for(const d of descriptors){assert.deepEqual([d.type,d.group],expected[d.id]);const native=m.rootInputs[d.id];if(native){let type='ADBE Slider Control';if(d.type==='point')type='ADBE Point Control';else if(d.type==='color')type='ADBE Color Control';else if(d.type==='checkbox')type='ADBE Checkbox Control';assert.equal(r.property('ADBE Effect Parade').property(native.index).matchName,type);}}
});
const nativeStorage={quantizeTimes:true,frameCapacity:true,coupledCapacity:true};
function nativeReceipt(result,requested){
 const receipt=result.timingReadback;
 assert.ok(receipt,'Successful native write must expose its requested/actual timing receipt');
 assert.equal(receipt.tolerance,1/32768+1e-9);
 for(const [key,value]of Object.entries(requested))assert.equal(receipt.requested[key],value,'Requested seconds must remain verbatim');
 const errors=Object.keys(receipt.requested).map(key=>Math.abs(receipt.actual[key]-receipt.requested[key]));
 near(receipt.maxError,Math.max(...errors));assert.ok(receipt.maxError<=receipt.tolerance);
 return receipt;
}
function nativeSnapshot(h,r){return plain({serialized:h.api.serialize(r),sourceDuration:r.source.duration,inner:r.source.list.map(l=>({id:l.id,outPoint:l.outPoint})),comment:r.comment,startTime:r.startTime,inPoint:r.inPoint,outPoint:r.outPoint});}
test('GlyphNativeTimeCapacity: coupled marker ticks/frame capacity support fractional Add, delay edit and Duration extension with actual readback',()=>{
 const h=harness(pack(),nativeStorage),r=h.add('AB',{duration:2.013579},3.069736),receipt=nativeReceipt(h.lastResult,{inMarker:3.069736,outPoint:4.583315});
 assert.ok(r.source.duration>=2.013579);near(r.source.duration,61/30);
 assert.ok(r.source.list.every(l=>l.outPoint>=r.source.duration-1e-9));
 assert.notEqual(receipt.actual.inMarker,receipt.requested.inMarker);
 assert.ok(h.nativeRequests.some(row=>row.kind==='marker'&&row.requested===3.069736));
 const before=h.api.serialize(r),inPoint=r.inPoint,outPoint=r.outPoint,startTime=r.startTime;
 const delay=h.api.setControl(r,'inDelay',.013579),delayReceipt=nativeReceipt(delay,{});
 assert.equal(r.inPoint,inPoint);assert.equal(r.outPoint,outPoint);assert.equal(r.startTime,startTime);
 assert.equal(delayReceipt.actual.outMarker,delayReceipt.requested.outMarker);
 assert.ok(Math.abs(delayReceipt.actual.inMarker-delayReceipt.requested.inMarker)>1e-6);
 const duration=3.013579,requestedOut=inPoint+duration,result=h.api.setControl(r,'duration',duration),after=nativeReceipt(result,{outPoint:requestedOut});
 assert.equal(r.inPoint,inPoint);assert.equal(r.startTime,startTime);
 assert.ok(r.source.duration>=r.outPoint-r.startTime);assert.ok(r.source.duration>=duration);
 assert.ok(r.source.list.every(l=>l.outPoint>=r.source.duration-1e-9));
 const serialized=h.api.serialize(r);near(serialized.timeline.outPoint,r.outPoint-r.inPoint);
 near(serialized.timeline.inMarker,after.actual.inMarker-r.inPoint);
 assert.notEqual(serialized.controls.duration,duration,'Readback exposes stored native duration');
 const capacity=r.source.duration;h.api.setControl(r,'duration',2);assert.equal(r.source.duration,capacity,'Shrinking root does not shrink source capacity');
});
test('GlyphNativeTimeRollback: excessive timeline/capacity/inner coverage drift rejects and restores exact actual fields',()=>{
 for(const fault of [{marker:.001},{rootOutPoint:.001},{capacity:-1/30},{capacity:1/30},{capacity:1e-5}]){
  const h=harness(pack(),nativeStorage),r=h.add(),before=nativeSnapshot(h,r);h.nativeFault(fault);
  assert.throws(()=>h.api.setControl(r,fault.marker?'inDelay':'duration',fault.marker?.013579:2.013579));
  assert.deepEqual(nativeSnapshot(h,r),before);
 }
 const h=harness(pack(),nativeStorage),r=h.add(),before=nativeSnapshot(h,r);h.nativeFault({innerOutPoint:-.01});
 assert.throws(()=>h.api.setControl(r,'duration',2.013579));assert.deepEqual(nativeSnapshot(h,r),before);
});
test('GlyphNativeInitialGuards: Add verifies stored marker drift and capacity and cleans only its new objects',()=>{
 for(const fault of [{marker:.001},{inPoint:.001},{startTime:.001},{capacity:-1/30},{capacity:1/30}]){
  const h=harness(pack(),nativeStorage),sibling=h.add(),ids=h.projects.map(c=>c.id);h.nativeFault(fault);
  assert.throws(()=>h.add('AB',{duration:2.013579},3.069736));assert.deepEqual(h.projects.map(c=>c.id),ids);assert.equal(h.api.getControl(sibling,'size'),100);
 }
});
test('GlyphNativeCapacityBounds: outward allocation uses actual source frames, negative starts and host limits without root frame snapping',()=>{
 for(const atTime of [-.2,.069736,3.069736]){
  const h=harness(pack(),{...nativeStorage,sourceFrameRate:24}),r=h.add('AB',{duration:2.013579},atTime);
  near(r.source.duration,49/24);nativeReceipt(h.lastResult,{inMarker:atTime});
  assert.ok(r.source.duration>=r.outPoint-r.startTime);assert.ok(r.source.list.every(l=>l.outPoint>=r.source.duration-1e-9));
 }
 const fps=24000/1001,h=harness(pack(),{...nativeStorage,sourceFrameRate:fps});h.comp.frameRate=fps;h.comp.frameDuration=1/fps;h.zero();
 coded(()=>h.api.preflight(h.comp,{fontId:pack().id,fontHash:pack().digest,text:'AB',controls:{duration:10799.999},atTime:.5}),'GLYPH_SOURCE_COVERAGE');assert.equal(h.writes,0);
 const root=h.add('AB',{},0);h.zero();coded(()=>h.api.preflightControl(root,'duration',10799.999),'GLYPH_SOURCE_COVERAGE');assert.equal(h.writes,0);
});
test('GlyphNativeSourceBoundary: actual quantized source end is covered at fractional fps, and actual invalid body gaps still reject',()=>{
 const fps=30000/1001,duration=61/fps,h=harness(pack(),{...nativeStorage,sourceFrameRate:fps});h.comp.frameRate=fps;h.comp.frameDuration=1/fps;
 const r=h.add('AB',{duration},1),receipt=nativeReceipt(h.lastResult,{outPoint:.5+duration});
 assert.ok(r.source.duration>=r.outPoint-r.startTime-1e-9);assert.ok(r.source.list.every(l=>l.outPoint>=r.source.duration-1e-9));
 assert.ok(h.nativeRequests.some(row=>row.kind==='rootOutPoint'&&row.requested===.5+duration));
 assert.ok(receipt.actual.outPoint!==receipt.requested.outPoint);
 const gap=harness(pack(),nativeStorage),ids=gap.projects.map(c=>c.id);gap.nativeFault({marker:5e-6});
 coded(()=>gap.add('AB',{duration:1+1/30},1),'INVALID_GLYPH_TIMING');assert.deepEqual(gap.projects.map(c=>c.id),ids);
});
test('GlyphNativeFPSWitness: observed 29.97 stored marker/out pair fits evidenced bound without inventing a time-grid formula',()=>{
 const h=harness(pack(),{...nativeStorage,sourceFrameRate:29.9700012207031,observedTimes:[[.013579,.0135969302636],[.779011,.77902902902903]]});
 h.comp.frameRate=29.9700012207031;h.comp.frameDuration=1/h.comp.frameRate;
 const r=h.add('AB',{duration:1.265432},.013579),receipt=h.lastResult.timingReadback;
 assert.equal(receipt.tolerance,1/32768+1e-9);assert.equal(receipt.requested.inMarker,.013579);
 near(receipt.requested.outPoint,.779011);assert.equal(receipt.actual.inMarker,.0135969302636);assert.equal(receipt.actual.outPoint,.77902902902903);
 assert.ok(receipt.maxError>1/61440&&receipt.maxError<1/32768);
 assert.ok(r.source.duration>=r.outPoint-r.startTime);assert.ok(r.source.list.every(l=>l.outPoint>=r.source.duration-1e-9));
 const guard=harness(pack(),nativeStorage),root=guard.add(),before=nativeSnapshot(guard,root);guard.nativeFault({marker:1/32768+1e-8});
 coded(()=>guard.api.setControl(root,'inDelay',.1+1/61440),'GLYPH_NATIVE_READBACK');assert.deepEqual(nativeSnapshot(guard,root),before);
});
test('GlyphNativeBoundSideEffects: unexpected native root start/in drift fails and restores the complete owned actual bounds',()=>{
 for(const fault of [{inPointSideEffect:.001},{startTimeSideEffect:.001}]){
  const h=harness(pack(),nativeStorage),r=h.add(),before=nativeSnapshot(h,r);h.nativeFault(fault);
  assert.throws(()=>h.api.setControl(r,'duration',2.013579));assert.deepEqual(nativeSnapshot(h,r),before);
 }
});
test('GlyphNativeForeignMarker: a quantized marker collision is rejected before writes and preserves user data',()=>{
 const h=harness(pack(),nativeStorage),r=h.add();r.markerProperty.setValueAtTime(.91357421875,new h.context.MarkerValue('USER'));
 const before=nativeSnapshot(h,r);h.zero();coded(()=>h.api.preflightControl(r,'inDelay',.013579),'MARKER_TIME_CONFLICT');
 coded(()=>h.api.setControl(r,'inDelay',.013579),'MARKER_TIME_CONFLICT');assert.equal(h.writes,0);
 assert.deepEqual(nativeSnapshot(h,r),before);assert.equal(r.markerProperty.keys.find(k=>k.time===.91357421875).value.comment,'USER');
});
test('GlyphNativeForeignRollback: excessive drift onto a user marker restores every native marker value and parameter',()=>{
 const h=harness(pack(),nativeStorage),r=h.add(),foreign=new h.context.MarkerValue('USER');
 foreign.duration=.25;foreign.chapter='User chapter';foreign.url='user-reference';foreign.label=4;foreign.setParameters({foreign:'keep'});
 r.markerProperty.setValueAtTime(1.4,foreign);const before=r.markerProperty.keys.map(k=>({time:k.time,value:plain(k.value),params:k.value.getParameters()}));
 const snapshot=nativeSnapshot(h,r);h.nativeFault({marker:.3});
 coded(()=>h.api.setControl(r,'inDelay',.2),'GLYPH_NATIVE_READBACK');
 assert.deepEqual(r.markerProperty.keys.map(k=>({time:k.time,value:plain(k.value),params:k.value.getParameters()})),before);
 assert.deepEqual(nativeSnapshot(h,r),snapshot);
});
function foreignFixture(at){
 const delta=1/32768,h=harness(pack(),{...nativeStorage,sourceFrameRate:32,observedTimes:[[at+delta,at+delta]]});h.comp.frameRate=32;h.comp.frameDuration=1/32;
 const r=h.add(),marker=new h.context.MarkerValue('USER');marker.duration=.125;marker.label=3;marker.protectedRegion=true;
 marker.chapter='chapter';marker.url='private-reference';marker.frameTarget='target';marker.cuePointName='cue';marker.eventCuePoint=true;
 marker.setParameters({arbitrary:'retain exact value',cpPrivateWitness:'marker-preservation'});r.markerProperty.setValueAtTime(at+delta,marker);
 const values=()=>r.markerProperty.keys.map(k=>({time:k.time,value:plain(k.value),params:k.value.getParameters()}));
 return {h,r,delta,values,before:values(),state:nativeSnapshot(h,r)};
}
test('GlyphNativeForeignWithinSize: unchanged owned IN is not rewritten and nearby foreign data survives permitted drift',()=>{
 const {h,r,delta,values,before}=foreignFixture(1);h.nativeFault({marker:delta});let result,error;
 try{result=h.api.setControl(r,'size',120);}catch(e){error=e;}
 assert.deepEqual(values(),before,'A Size edit must never succeed after deleting a foreign marker');
 assert.equal(error,undefined);assert.equal(result.changed,true);assert.equal(h.api.getControl(r,'size'),120);
 assert.equal(result.timingReadback.actual.inMarker,1);
});
test('GlyphNativeForeignWithinOut: edited IN never rewrites unchanged OUT beside foreign data',()=>{
 const {h,r,delta,values,before,state}=foreignFixture(2),marker=r.markerProperty,write=marker.setValueAtTime.bind(marker);let once=true;
 marker.setValueAtTime=(time,value)=>{if(once&&time===2){once=false;return write(time+delta,value);}return write(time,value);};
 h.api.setControl(r,'inDelay',.013579);assert.equal(once,true);
 assert.deepEqual(values().filter(v=>v.value.comment==='USER'),before.filter(v=>v.value.comment==='USER'));
 assert.equal(h.api.getControl(r,'outEnabled'),true);
});
test('GlyphNativeForeignFields: foreign key retained with changed MarkerValue fields/parameters still fails and rolls back',()=>{
 for(const field of ['comment','duration','label','protectedRegion','chapter','url','frameTarget','cuePointName','eventCuePoint','parameters']){
  const {h,r,values,before,state}=foreignFixture(2),owner=r,original=r.markerProperty.setValueAtTime.bind(r.markerProperty);let once=true;
  r.markerProperty.setValueAtTime=(time,value)=>{
   const result=original(time,value);
   if(once){once=false;const prior=owner.markerProperty.keys.find(k=>k.value.comment==='USER'),replacement=new h.context.MarkerValue('USER');
    for(const key of ['duration','label','protectedRegion','chapter','url','frameTarget','cuePointName','eventCuePoint'])replacement[key]=prior.value[key];replacement.setParameters(prior.value.getParameters());
    if(field==='parameters')replacement.setParameters({arbitrary:'changed',cpPrivateWitness:'marker-preservation'});
    else if(typeof replacement[field]==='boolean')replacement[field]=!replacement[field];else if(typeof replacement[field]==='number')replacement[field]+=1;else replacement[field]='changed';
    owner.markerProperty.setValueAtTime(prior.time,replacement);
   }
   return result;
  };
  coded(()=>h.api.setControl(r,'inDelay',.013579),'GLYPH_FOREIGN_MARKER_CHANGED');assert.deepEqual(values(),before);assert.deepEqual(nativeSnapshot(h,r),state);
 }
});
const authoredPathTimes=[0,.2,.4,.5,.6,.8,1];
// Root's actual seven-key Shape witness at BOTH 23.976 and 29.97; no inferred grid.
const observedPathTimes=[0,.19999165832499,.39998331664998,.5,.60001668335002,.80000834167501,1];
function pathClockPack(unequal=false){
 const p=pack();if(unequal)p.clock.bodyEnd=.8;
 for(const glyph of p.glyphs)for(const path of glyph.paths){
  const width=glyph.codePoint===65?400:300,scales=unequal?[0,.5,1,1.05,1.025,1,0]:[0,.5,1,1.05,1,.5,0];
  path.keys=authoredPathTimes.map((time,i)=>({time,vertices:[[0,0],[width*scales[i],0],[width*scales[i],-700*scales[i]]],inTangents:[[i===1||i===5?10:0,0],[0,0],[0,0]],outTangents:[[0,i===1||i===5?10:0],[0,0],[0,0]]}));
  // Neutral seam tangents match for the unequal .4/.8 loop as well.
  if(unequal){path.keys[5].inTangents[0]=[0,0];path.keys[5].outTangents[0]=[0,0];}
 }
 return p;
}
function pathHarness(p=pathClockPack(),fps=29.97,times=observedPathTimes){
 const h=harness(p,{pathTimes:authoredPathTimes.map((time,i)=>[time,times[i]])});h.comp.frameRate=fps;h.comp.frameDuration=1/fps;return h;
}
function pathSample(h,r,time,rank=0){
 const m=meta(r),c=r.source.list.find(l=>l.id===m.controllerId),consumer=r.source.list.find(l=>l.comment.endsWith('|consumer|'+rank)),controls=h.api.serialize(r).controls,markers=h.context.$.cpTimeline.read(r,m.instanceId),inMarker=markers.find(m=>m.role==='in'),outMarker=markers.find(m=>m.role==='out');
 const values={RootElapsed:time-r.inPoint,InSpan:inMarker.time-r.inPoint,OutSpan:r.outPoint-outMarker.time,TotalDuration:r.outPoint-r.inPoint,ParentFrameDuration:h.comp.frameDuration,InDelay:controls.inDelay,OutDelay:controls.outDelay,InEnabled:+controls.inEnabled,OutEnabled:+controls.outEnabled,InReverse:+controls.inReverse,OutReverse:+controls.outReverse};
 const expr=consumer.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').property(1).property('ADBE Vector Shape').expression;
 return vm.runInNewContext(expr,{parent:{effect:index=>()=>values[c.property('ADBE Effect Parade').property(index).name.slice(5)]},thisComp:{layer:index=>({content:()=>({content:pathIndex=>({path:{valueAtTime:nativeTime=>({nativeTime,shape:r.source.layer(index).property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').property(pathIndex).property('ADBE Vector Shape').valueAtTime(nativeTime)})}})})})},Math});
}
function overwriteMeta(r,m){r.comment='cpAnimatedFont|'+JSON.stringify(m);}
test('GlyphPathClockObserved: both fractional FPS read authored times and sample exact authored interpolation through native key mapping',()=>{
 for(const fps of [23.976,29.97]){
  const p=pathClockPack(),h=pathHarness(p,fps),r=h.add(),m=meta(r);assert.equal(m.pathTimeVersion,1);
  for(const row of m.paths){assert.deepEqual(row.authoredTimes,authoredPathTimes);assert.deepEqual(row.nativeTimes,observedPathTimes);}
  // Independently calculated A path positions/tangents, including a whole body-cycle seam.
  for(const [time,width,height,tangent]of [[.5,0,0,0],[.6,100,175,5],[.7,200,350,10],[.8,300,525,5],[.9,400,700,0],[1.12,400,700,0]]){
   const sampled=pathSample(h,r,time);near(sampled.shape.vertices[1][0],width);near(sampled.shape.vertices[2][1],-height);near(sampled.shape.inTangents[0][0],tangent);
  }
  near(pathSample(h,r,.9).nativeTime,observedPathTimes[2]);
  near(pathSample(h,r,1.12).nativeTime,observedPathTimes[2]);
  assert.notEqual(pathSample(h,r,.7).nativeTime,.2);
  assert.equal(h.api.getControl(r,'size'),100);
 }
});
test('GlyphPathClockUnequalReverse: per-path authored/native mapping preserves reverse source phases and endpoint clamps',()=>{
 const p=pathClockPack(true),h=pathHarness(p),r=h.add('AB',{inReverse:true,outReverse:true});
 near(pathSample(h,r,.85,0).shape.vertices[1][0],100);near(pathSample(h,r,.75,1).shape.vertices[1][0],75);
 near(pathSample(h,r,2.4,0).shape.vertices[1][0],300);near(pathSample(h,r,2.3,1).shape.vertices[1][0],225);
 near(pathSample(h,r,r.inPoint-.1,0).nativeTime,1);near(pathSample(h,r,r.outPoint+.1,0).nativeTime,0);
});
test('GlyphPathClockPersistence: unavailable pack reads/renders; serialize/restore creates independent fresh mapped records',()=>{
 const h=pathHarness(),r=h.add(),data=h.api.serialize(r),result=h.api.restore(h.comp,data,{atTime:4}),restored=h.comp.list.find(l=>l.id===result.rootLayerId);
 assert.notEqual(restored.source.id,r.source.id);assert.equal(meta(restored).pathTimeVersion,1);assert.deepEqual(meta(restored).paths[0].authoredTimes,authoredPathTimes);
 h.unavailable();h.zero();assert.equal(h.api.getControl(r,'size'),100);near(pathSample(h,r,.8).shape.vertices[1][0],300);assert.equal(h.writes,0);
 coded(()=>h.api.restore(h.comp,data,{atTime:1}),'GLYPH_PACK_UNAVAILABLE');
});
test('GlyphPathClockIntegrity: versioned missing/malformed/tampered mappings reject reads/edits without writes',()=>{
 const changes=[m=>{delete m.pathTimeVersion;},m=>{m.pathTimeVersion=2;},m=>{delete m.paths[0].authoredTimes;},m=>{delete m.paths[0].nativeTimes;},m=>{delete m.paths[0].timeMapHash;},m=>{m.paths[0]=null;},m=>{delete m.paths;},m=>{m.paths[0].authoredTimes.pop();},m=>{m.paths[0].nativeTimes[2]=m.paths[0].nativeTimes[1];},m=>{m.paths[0].authoredTimes[1]+=.000001;},m=>{m.paths[0].nativeTimes[1]+=.000001;},m=>{m.paths.pop();},m=>{m.paths.push(plain(m.paths[0]));}];
 for(const change of changes){const h=pathHarness(),r=h.add(),m=meta(r);change(m);overwriteMeta(r,m);h.zero();coded(()=>h.api.controls(r),'GLYPH_PATH_TIME_CHANGED');coded(()=>h.api.setControl(r,'size',120),'GLYPH_PATH_TIME_CHANGED');assert.equal(h.writes,0);}
});
test('GlyphPathClockCreationFailure: collapsed/reordered/excessively shifted native path keys clean only created objects',()=>{
 for(const change of [times=>{times[2]=times[1];},times=>{times[2]=.1;},times=>{times[1]+=.001;}]){
  const times=[...observedPathTimes];change(times);const h=pathHarness(pathClockPack(),29.97,times),ids=h.projects.map(c=>c.id);
  coded(()=>h.add(),'GLYPH_PATH_TIME_CHANGED');assert.deepEqual(h.projects.map(c=>c.id),ids);assert.equal(h.comp.numLayers,0);
 }
});
test('GlyphPathClockLegacy: valid unversioned native clocks remain readable/serializable and all mutation paths require rebuild',()=>{
 const h=harness(),r=h.add(),m=meta(r);delete m.pathTimeVersion;
 for(const row of m.paths){
  delete row.authoredTimes;delete row.nativeTimes;delete row.timeMapHash;
  // A real unversioned graph uses the pre-mapping consumer expression.
  const consumer=r.source.list.find(l=>l.id===row.consumerLayerId),nativePath=consumer.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').property(row.pathIndex+1).property('ADBE Vector Shape'),old=nativePath.expression;
  const legacy=old.slice(0,old.indexOf('var cpA='))+old.slice(old.indexOf('thisComp.layer(')).replace('valueAtTime(cpT)','valueAtTime(s)');
  nativePath.expression=legacy;m.expressions.find(record=>record.layerId===consumer.id&&record.expression===old).expression=legacy;
 }
 overwriteMeta(r,m);h.zero();near(pathSample(h,r,.7).shape.vertices[1][0],200);
 assert.equal(h.api.getControl(r,'size'),100);assert.equal(h.api.serialize(r).text,'AB');assert.ok(h.api.controls(r).every(d=>!d.enabled&&d.readOnlyCode==='GLYPH_REBUILD_REQUIRED'&&d.actions.length===0));assert.equal(h.writes,0);
 for(const fn of [()=>h.api.preflightControl(r,'size',120),()=>h.api.setControl(r,'size',120),()=>h.api.preflightReset(r,{controlId:'size'}),()=>h.api.reset(r,{controlId:'size'}),()=>h.api.remove(r,m.instanceId)]){coded(fn,'GLYPH_REBUILD_REQUIRED');assert.equal(h.writes,0);}
 const data=h.api.serialize(r),result=h.api.restore(h.comp,data,{atTime:4}),restored=h.comp.list.find(l=>l.id===result.rootLayerId);assert.equal(meta(restored).pathTimeVersion,1);
});

test('GlyphPathClockFix1Association: adjacent authored keys swapped within allowance reject rather than silently exchange geometry',()=>{
 const p=pathClockPack();
 for(const glyph of p.glyphs)for(const path of glyph.paths){
  const close=plain(path.keys[1]);close.time=.20002;close.vertices=[[0,0],[300,0],[300,-700]];path.keys.splice(2,0,close);
 }
 const h=harness(p,{pathTimes:[[.2,.20002],[.20002,.2]]}),ids=h.projects.map(c=>c.id);
 // Both native destinations differ by only20us: final sorted times alone hide the reversed association.
 coded(()=>h.add('A'),'GLYPH_PATH_TIME_CHANGED');assert.deepEqual(h.projects.map(c=>c.id),ids);assert.equal(h.comp.numLayers,0);
});
test('GlyphPathClockFix1Roundtrip: AE canonical String precision permits binary-only metadata roundtrip differences and rejects representable later key changes',()=>{
 // Root native witness: stored minus actual differences -1.665e-15/-3.330e-15/+3.330e-15/+1.665e-15.
 const actual=[0,observedPathTimes[1]+1.66533453693773e-15,observedPathTimes[2]+3.33066907387547e-15,.5,observedPathTimes[4]-3.33066907387547e-15,observedPathTimes[5]-1.66533453693773e-15,1];
 const h=harness(pathClockPack(),{aeStringPrecision:true,pathTimes:authoredPathTimes.map((time,i)=>[time,actual[i]])}),r=h.add(),m=meta(r),row=m.paths[0],dat=r.source.list.find(l=>l.id===row.layerId),p=dat.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').property(1).property('ADBE Vector Shape');
 assert.notEqual(row.nativeTimes[1],p.keyTime(2));assert.equal(h.context.String(row.nativeTimes[1]),h.context.String(p.keyTime(2)));
 h.zero();assert.equal(h.api.getControl(r,'size'),100);near(pathSample(h,r,.7).shape.vertices[1][0],200);assert.equal(h.writes,0);
 // Much smaller than30us, but distinct in persisted representation: never use creation allowance for graph integrity.
 p.keys[1].time+=1e-10;h.zero();coded(()=>h.api.getControl(r,'size'),'GLYPH_PATH_TIME_CHANGED');coded(()=>h.api.setControl(r,'size',120),'GLYPH_PATH_TIME_CHANGED');assert.equal(h.writes,0);
});
