const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=path.join(__dirname,'../jsx/timeline-engine.jsx');
function host(){
 class MarkerValue{constructor(comment){Object.assign(this,{comment,duration:0,label:0,protectedRegion:false,eventCuePoint:true,chapter:'',url:'',frameTarget:'',cuePointName:'',parameters:{}});}getParameters(){return {...this.parameters};}setParameters(p){this.parameters={...p};}}
 const keys=[],p={get numKeys(){return keys.length;},keyTime:i=>keys[i-1].time,keyValue:i=>keys[i-1].value,removeKey:i=>keys.splice(i-1,1),setValueAtKey(i,value){keys[i-1].value=value;},setValueAtTime(t,value){const i=keys.findIndex(x=>Math.abs(x.time-t)<1e-9);const row={time:t,value};if(i<0)keys.push(row);else keys[i]=row;keys.sort((a,b)=>a.time-b.time);}};
 const c={$:{},MarkerValue};vm.createContext(c);vm.runInContext(fs.readFileSync(source,'utf8'),c);
 return{api:c.$.cpTimeline,keys,p,MarkerValue,layer:{inPoint:1,outPoint:8,property:n=>n==='ADBE Marker'?p:null},c};
}
test('owned real markers keep user names/metadata and use only independent namespace',()=>{const h=host(),user=new h.MarkerValue('TR In');user.setParameters({user:'keep'});h.p.setValueAtTime(.3,user);h.api.ensure(h.layer,'one',[{role:'in',time:2,comment:'TR In',label:0},{role:'out',time:6,comment:'TR Out',label:0}],{variantId:'125'});assert.equal(h.keys.length,3);const read=JSON.parse(JSON.stringify(h.api.read(h.layer,'one')));assert.equal(read.length,2);assert.equal(read[0].role,'in');assert.equal(h.keys[0].value.parameters.user,'keep');assert.doesNotMatch(JSON.stringify(read),/zzzzzz|misterhorse|MHAC/);h.api.remove(h.layer,'one','in');assert.equal(h.api.read(h.layer,'one').length,1);assert.equal(h.keys[0].value,user);});
test('marker movement collision fails before removing any owned/user key',()=>{const h=host();h.api.ensure(h.layer,'one',[{role:'in',time:2,comment:'TR In'}]);h.p.setValueAtTime(3,new h.MarkerValue('User'));const before=h.keys.slice();assert.throws(()=>h.api.set(h.layer,'one','in',{time:3}),e=>e.code==='MARKER_TIME_CONFLICT');assert.deepEqual(h.keys,before);});
test('host write failure rolls owned markers back while retaining foreign data',()=>{const h=host();h.api.ensure(h.layer,'one',[{role:'in',time:2,comment:'TR In'}]);const user=new h.MarkerValue('User');h.p.setValueAtTime(3,user);const write=h.p.setValueAtTime;h.p.setValueAtTime=(t,v)=>{if(t===2.5)throw Error('Injected native write');return write(t,v);};assert.throws(()=>h.api.set(h.layer,'one','in',{time:2.5}),/Injected native write/);assert.equal(h.api.read(h.layer,'one')[0].time,2);assert.equal(h.keys.find(x=>x.time===3).value,user);});
test('read-only polling never creates markers and disabled markers remain inspectable',()=>{const h=host();assert.equal(h.api.read(h.layer).length,0);assert.equal(h.keys.length,0);h.api.ensure(h.layer,'one',[{role:'in',time:2,comment:'TR In'}]);h.api.set(h.layer,'one','in',{enabled:false});assert.equal(h.api.read(h.layer,'one')[0].enabled,false);});
test('moving an owned marker preserves user-added cue/chapter fields and extra parameters',()=>{const h=host();h.api.ensure(h.layer,'one',[{role:'in',time:2,comment:'TR In'}]);h.keys[0].value.chapter='User chapter';h.keys[0].value.url='local-reference';h.keys[0].value.eventCuePoint=false;h.keys[0].value.parameters.userExtra='keep';h.api.set(h.layer,'one','in',{time:2.5});assert.equal(h.keys[0].value.chapter,'User chapter');assert.equal(h.keys[0].value.url,'local-reference');assert.equal(h.keys[0].value.eventCuePoint,false);assert.equal(h.keys[0].value.parameters.userExtra,'keep');});
test('phase expression follows marker drag and trim with exact out last-frame boundary',()=>{const h=host();h.api.ensure(h.layer,'one',[{role:'in',time:2,comment:'TR In'},{role:'out',time:6,comment:'TR Out'}]);const marker={get numKeys(){return h.keys.length;},key:i=>({...h.keys[i-1].value,time:h.keys[i-1].time})};function phase(t,side){return vm.runInNewContext(h.api.phaseCode('one')+'cpPhase('+JSON.stringify(side)+')',{time:t,thisLayer:{...h.layer,marker},thisComp:{frameDuration:.1}});}assert.equal(phase(1.5,'in').q,.5);h.layer.inPoint=1.25;assert.ok(Math.abs(phase(1.5,'in').q-2/3)<1e-12);h.api.set(h.layer,'one','in',{time:2.25});assert.equal(phase(1.75,'in').q,.5);assert.equal(phase(7.9,'out').q,1);h.api.set(h.layer,'one','in',{enabled:false});assert.equal(phase(1.75,'in').on,false);h.api.remove(h.layer,'one','out');assert.equal(phase(7,'out').on,false);});
test('same labels with unrelated parameters never become owned, serialized clocks roundtrip duration/labels',()=>{const h=host(),user=new h.MarkerValue('IN');h.p.setValueAtTime(1,user);h.api.ensure(h.layer,'pc',[{role:'in',time:2,comment:'IN',duration:.25,label:8},{role:'out',time:4,comment:'OUT',label:8}],{scope:'source'});const s=JSON.parse(JSON.stringify(h.api.serialize(h.layer,'pc')));assert.equal(s.markers[0].duration,.25);assert.equal(s.markers[0].label,8);h.api.remove(h.layer,'pc');h.api.restore(h.layer,'pc',s);assert.equal(h.api.read(h.layer,'pc')[0].duration,.25);assert.equal(h.keys[0].value,user);});
test('precomp clock uses live root/source markers including source IN duration and CUT fallback',()=>{const h=host();const rootMarker={numKeys:2,key:i=>i===1?{time:2,duration:0,parameters:{cpTimeline:'1',cpInstanceId:'pc',cpRole:'in',cpEnabled:'1'}}:{time:6,duration:0,parameters:{cpTimeline:'1',cpInstanceId:'pc',cpRole:'out',cpEnabled:'1'}}};const src={duration:10,marker:{numKeys:2,key:i=>i===1?{time:1,duration:.5,parameters:{cpTimeline:'1',cpInstanceId:'pc',cpRole:'in',cpEnabled:'1'}}:{time:8,duration:0,parameters:{cpTimeline:'1',cpInstanceId:'pc',cpRole:'out',cpEnabled:'1'}}}};const code=h.api.clockCode('pc','title');assert.equal(vm.runInNewContext(code,{time:4,inPoint:0,outPoint:10,thisLayer:{marker:rootMarker},source:src}),4.75);src.marker.key=i=>i===1?{time:1,duration:1,parameters:{cpTimeline:'1',cpInstanceId:'pc',cpRole:'in',cpEnabled:'1'}}:{time:8,duration:0,parameters:{cpTimeline:'1',cpInstanceId:'pc',cpRole:'out',cpEnabled:'1'}};assert.equal(vm.runInNewContext(code,{time:4,inPoint:0,outPoint:10,thisLayer:{marker:rootMarker},source:src}),5);assert.equal(vm.runInNewContext(h.api.clockCode('pc','camera'),{time:4,inPoint:1,outPoint:10,thisLayer:{marker:{numKeys:0}},source:src}),4);});
module.exports={host};
test('timeline detects transient native role overwrite before a later planned write can hide it',()=>{
 const h=host();h.api.ensure(h.layer,'one',[{role:'in',time:2},{role:'out',time:6}]);
 const before=JSON.stringify(h.keys),write=h.p.setValueAtTime.bind(h.p);let collided=false,later=false;
 h.p.setValueAtTime=(t,v)=>{if(t===5.99999){collided=true;t=6;}if(collided&&t===8)later=true;return write(t,v);};
 assert.throws(()=>h.api.ensure(h.layer,'one',[{role:'in',time:5.99999},{role:'out',time:8}]),e=>e.code==='MARKER_WRITE_FAILED');
 assert.equal(later,false,'A later move must not conceal the intermediate lost role');assert.equal(JSON.stringify(h.keys),before);
});
test('timeline unexpected native collision with another owned role rejects and restores both roles',()=>{
 const h=host();h.api.ensure(h.layer,'one',[{role:'in',time:2},{role:'out',time:6}]);const before=JSON.stringify(h.keys),write=h.p.setValueAtTime.bind(h.p);let once=true;
 h.p.setValueAtTime=(t,v)=>{if(once&&t===2.5){once=false;t=6;}return write(t,v);};
 assert.throws(()=>h.api.set(h.layer,'one','in',{time:2.5}),e=>e.code==='MARKER_WRITE_FAILED');assert.equal(JSON.stringify(h.keys),before);
});
test('timeline partial specs retain CUT fields and apply explicit meta consistently',()=>{
 const h=host();h.api.ensure(h.layer,'one',[{role:'in',time:2,comment:'IN'},{role:'cut',time:4,comment:'CUT',chapter:'custom',parameters:{extra:'keep'}},{role:'out',time:6,comment:'OUT'}],{variantId:'old',scope:'source'});
 h.api.ensure(h.layer,'one',[{role:'in',time:2.1,comment:'New IN'}],{variantId:'new',scope:'layer'});
 const rows=h.api.read(h.layer,'one');assert.equal(rows.length,3);const cut=rows.find(r=>r.role==='cut');assert.equal(cut.chapter,'custom');assert.equal(cut.parameters.extra,'keep');assert.ok(rows.every(r=>r.variantId==='new'&&r.scope==='layer'));assert.equal(rows.find(r=>r.role==='out').time,6);
});
test('timeline destination dependency chain keeps all IN CUT OUT roles present',()=>{
 const h=host();h.api.ensure(h.layer,'one',[{role:'in',time:2},{role:'cut',time:4},{role:'out',time:6}]);const p=h.p,set=p.setValueAtTime.bind(p),remove=p.removeKey.bind(p),events=[];
 const record=()=>{const roles=h.api.read(h.layer,'one').map(r=>r.role).sort();events.push(roles);for(const role of ['in','cut','out'])assert.ok(roles.includes(role));};
 p.setValueAtTime=(t,v)=>{set(t,v);record();};p.removeKey=i=>{remove(i);record();};
 h.api.ensure(h.layer,'one',[{role:'in',time:4},{role:'cut',time:6},{role:'out',time:8}]);assert.ok(events.length);
 assert.deepEqual(JSON.parse(JSON.stringify(h.api.read(h.layer,'one').map(r=>[r.role,r.time]))),[['in',4],['cut',6],['out',8]]);
});
test('timeline cyclic destinations reject before writes',()=>{
 const h=host();h.api.ensure(h.layer,'one',[{role:'in',time:2},{role:'out',time:6}]);const before=JSON.stringify(h.keys);let writes=0;
 for(const method of ['setValueAtTime','setValueAtKey','removeKey']){const old=h.p[method].bind(h.p);h.p[method]=(...args)=>{writes++;return old(...args);};}
 assert.throws(()=>h.api.ensure(h.layer,'one',[{role:'in',time:6},{role:'out',time:2}]),e=>e.code==='MARKER_TIME_CONFLICT');assert.equal(writes,0);assert.equal(JSON.stringify(h.keys),before);
});
test('timeline midway dependency failure restores exact owned and foreign markers',()=>{
 const h=host();h.api.ensure(h.layer,'one',[{role:'in',time:2},{role:'out',time:6}]);const foreign=new h.MarkerValue('foreign');Object.assign(foreign,{chapter:'c',url:'u',label:4,duration:.25,protectedRegion:true,eventCuePoint:false,frameTarget:'f',cuePointName:'q'});foreign.setParameters({x:'keep'});h.p.setValueAtTime(3,foreign);const before=JSON.stringify(h.keys),write=h.p.setValueAtTime.bind(h.p);let once=true;
 h.p.setValueAtTime=(t,v)=>{if(once&&t===6&&v.getParameters().cpRole==='in'){once=false;throw Error('midway');}return write(t,v);};
 assert.throws(()=>h.api.ensure(h.layer,'one',[{role:'in',time:6},{role:'out',time:8}]),/midway/);assert.equal(JSON.stringify(h.keys),before);
});
test('timeline unexpected native collision with foreign marker rejects and restores it',()=>{
 const h=host();h.api.ensure(h.layer,'one',[{role:'in',time:2},{role:'out',time:6}]);const foreign=new h.MarkerValue('foreign');foreign.setParameters({keep:'yes'});h.p.setValueAtTime(3,foreign);const before=JSON.stringify(h.keys),write=h.p.setValueAtTime.bind(h.p);let once=true;
 h.p.setValueAtTime=(t,v)=>{if(once&&t===2.5){once=false;t=3;}return write(t,v);};
 assert.throws(()=>h.api.set(h.layer,'one','in',{time:2.5}),e=>e.code==='MARKER_FOREIGN_CHANGED');assert.equal(JSON.stringify(h.keys),before);
});
test('timeline rollback errors remain visible and operations inherit caller Undo',()=>{
 const h=host();h.api.ensure(h.layer,'one',[{role:'in',time:2}]);h.p.setValueAtTime=()=>{throw Error('native blocked');};
 assert.throws(()=>h.api.set(h.layer,'one','in',{time:2.5}),e=>{assert.match(e.rollbackError,/native blocked/);return true;});
 assert.doesNotMatch(fs.readFileSync(source,'utf8'),/beginUndoGroup|endUndoGroup|executeCommand/);
});
function continuity(h,id='one'){
 const p=h.p,set=p.setValueAtTime.bind(p),remove=p.removeKey.bind(p),events=[];
 function record(){const roles=h.api.read(h.layer,id).map(x=>x.role);events.push(roles);assert.ok(roles.includes('in')&&roles.includes('out'),'Existing marker role disappeared during native write');}
 p.setValueAtTime=(t,v)=>{set(t,v);record();};p.removeKey=i=>{remove(i);record();};
 return events;
}
test('timeline.set retains both existing roles throughout a marker move',()=>{
 const h=host();h.api.ensure(h.layer,'one',[{role:'in',time:2,comment:'IN'},{role:'out',time:6,comment:'OUT'}]);
 const events=continuity(h);h.api.set(h.layer,'one','in',{time:2.05});assert.ok(events.length);assert.equal(h.api.read(h.layer,'one')[0].time,2.05);
});
test('timeline partial enabled edit changes existing key without a time write or opposite key rewrite',()=>{
 const h=host();h.api.ensure(h.layer,'one',[{role:'in',time:2,comment:'IN'},{role:'out',time:6,comment:'OUT'}]);
 const opposite=h.keys[1].value;h.p.setValueAtTime=()=>{throw Error('Unexpected time rewrite');};
 h.api.set(h.layer,'one','in',{enabled:false});assert.equal(h.api.read(h.layer,'one')[0].enabled,false);assert.equal(h.keys[1].value,opposite);
});


test('camera missing CUT pair preserves assigned native preset absolute-time fallback',()=>{
 const h=host(),code=h.api.clockCode('pc','camera');
 function marker(at,present){return {numKeys:present?1:0,key:()=>({time:at,duration:0,parameters:{cpTimeline:'1',cpInstanceId:'pc',cpRole:'cut',cpEnabled:'1'}})};}
 function sample(time,inside,outside,duration,rootCut,sourceCut){return vm.runInNewContext(code,{time,inPoint:inside,outPoint:outside,thisLayer:{marker:marker(inside+(outside-inside)/2,rootCut)},source:{duration,marker:marker(duration/2,sourceCut)}});}
 for(const pair of [[false,true],[true,false],[false,false]]){
  assert.equal(sample(3,2,6,4,...pair),3);
  assert.equal(sample(13,12,16,4,...pair),13);
  assert.equal(sample(3,2,6,8,...pair),3);
  assert.equal(sample(1,2,6,8,...pair),1);
  assert.equal(sample(7,2,6,8,...pair),7);
  assert.equal(sample(3,2,2,8,...pair),3);
 }
 assert.equal(sample(3,2,6,4,true,true),1);
 assert.equal(sample(7,2,6,8,true,true),8,'existing present-CUT post-out clamp remains unchanged');
});
