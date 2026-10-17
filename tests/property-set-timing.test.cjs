const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
function load(file){const src=fs.readFileSync(path.join(__dirname,file),'utf8');return new Function('require','__dirname','module',src+'\nreturn host;')(n=>n==='node:test'?()=>{}:require(n),__dirname,{exports:{}});}
const nativeHost=load('precomp-timeline.test.cjs'),facadeHost=load('engine.test.cjs');
function fixture(id='31ce',count=1){const f=nativeHost(),roots=[];for(let i=0;i<count;i++){const r=f.api.apply(f.target,{id},{time:4},'').layers[0];r.selected=i===0;roots.push(r);}const h=facadeHost();h.layers.splice(0,h.layers.length,...roots);h.modules.cpPrecomp=f.api;h.modules.cpTimeline=f.timeline();const s=h.call('getState').result,group=s.controlGroups.find(g=>g.section);assert.ok(group);const saved=h.call('propertySetAction',{action:'saveAs',groupKey:group.key,name:'Fixture'});assert.equal(saved.ok,true,saved.error?.message);return{f,h,roots,group,saved:saved.result};}
function values(f,r){const cs=f.api.controls([r]);return{duration:cs.find(c=>c.id.endsWith(':duration')).value,body:cs.find(c=>c.id.endsWith(':bodyDuration')).value};}
test('whole settings pair conflicting with moved IN marker fails before Undo and leaves exact timeline',()=>{
 const {f,h,roots:[r],group,saved}=fixture(),id=f.api.instances(r)[0].instanceId,rows=f.timeline().read(r,id),original=values(f,r);rows.find(x=>x.role==='in').time+=.2;f.timeline().ensure(r,id,rows,{scope:'layer',variantId:'31ce'});const before=JSON.stringify({comment:r.comment,timing:values(f,r),markers:f.timeline().read(r,id),items:f.items.length}),writes=f.writes.length;
 const result=h.call('propertySetAction',{action:'apply',groupKey:group.key,presetId:saved.id});assert.equal(result.ok,false,'must not report success with wrong total duration');assert.equal(result.error.code,'PROPERTY_SET_TIMING_CONFLICT');assert.equal(f.writes.length,writes);assert.deepEqual(h.events,[]);assert.equal(JSON.stringify({comment:r.comment,timing:values(f,r),markers:f.timeline().read(r,id),items:f.items.length}),before);assert.ok(original.duration>original.body);
});
test('coherent whole timing pair writes only total duration and independently verifies both values',()=>{
 const {f,h,roots:[r],group,saved}=fixture(),before=values(f,r);f.api.setControl(r,'pc:'+r.id+':duration',before.duration+1);const actual=f.api.setControl,written=[];f.api.setControl=(root,id,value)=>{written.push(id.split(':')[2]);return actual(root,id,value);};
 const result=h.call('propertySetAction',{action:'apply',groupKey:group.key,presetId:saved.id});assert.equal(result.ok,true,result.error?.message);assert.equal(written.filter(k=>k==='duration').length,1);assert.equal(written.filter(k=>k==='bodyDuration').length,0);const after=values(f,r);assert.ok(Math.abs(after.duration-before.duration)<1e-9);assert.ok(Math.abs(after.body-before.body)<1e-9);
});
test('actual native animated second target rejects before batch writes and direct scalar overwrite',()=>{
 for(const mode of ['keys','expression','disabled-expression']){const {f,h,roots,group,saved}=fixture('24bc',2),r=roots[1],m=f.api.nativeModel('24bc'),c=m.controls[0],p=r.source._layers.find(l=>l.name==='CP Node '+c.n).property('ADBE Effect Parade').property('CP Fx '+c.e).property(c.p);r.selected=true;
 if(mode==='keys')p.setValueAtTime(0,p.value);else{p.expression='value+1';p.expressionEnabled=mode==='expression';}const descriptor=f.api.controls([r]).find(d=>d.id==='pc:'+r.id+':'+c.key);assert.equal(descriptor.enabled,false);assert.equal(descriptor.readOnlyCode,'PRECOMP_CONTROL_ANIMATED');const before=f.writes.length;
 assert.throws(()=>f.api.preflightControl(r,descriptor.id,50),e=>e.code==='PRECOMP_CONTROL_ANIMATED');assert.throws(()=>f.api.setControl(r,descriptor.id,50),e=>e.code==='PRECOMP_CONTROL_ANIMATED');
 const result=h.call('propertySetAction',{action:'apply',groupKey:group.key,presetId:saved.id});assert.equal(result.ok,false);assert.equal(result.error.code,'PRECOMP_CONTROL_ANIMATED');assert.equal(f.writes.length,before);assert.deepEqual(h.events,[]);
 }
});
module.exports={fixture,values};

test('coherent pair cannot report success if the actual duration write fails to take effect',()=>{const {f,h,roots:[r],group,saved}=fixture(),initial=values(f,r);f.api.setControl(r,'pc:'+r.id+':duration',initial.duration+1);const actual=f.api.setControl;f.api.setControl=(root,id,value)=>id.endsWith(':duration')?{}:actual(root,id,value);const result=h.call('propertySetAction',{action:'apply',groupKey:group.key,presetId:saved.id});assert.equal(result.ok,false);assert.equal(result.error.code,'PROPERTY_SET_TIMING_READBACK');});


test('measured AE timing roundoff does not block a coherent saved pair',()=>{
 const {f,roots:[r]}=fixture(),list=f.api.controls([r]),duration=list.find(c=>c.id.endsWith(':duration')),body=list.find(c=>c.id.endsWith(':bodyDuration'));
 const drift=0.00000645176427,changes=[{id:duration.id,value:duration.value-drift},{id:body.id,value:body.value}];
 const plan=f.api.preflightControlSet(r,changes);assert.ok(plan);f.api.verifyControlSet(r,plan);
 assert.throws(()=>f.api.preflightControlSet(r,[{id:duration.id,value:duration.value-.2},{id:body.id,value:body.value}]),e=>e.code==='PROPERTY_SET_TIMING_CONFLICT');
});


test('time matching keeps measured host roundoff and selects the first matching saved set',()=>{
 const {f,h,roots:[r],group,saved}=fixture();r.outPoint+=0.00000645176427;
 const listing=()=>h.call('propertySetAction',{action:'getAvailablePresets',groupKey:group.key}).result;
 assert.equal(listing().matchingPreset,saved.id);const second=h.call('propertySetAction',{action:'saveAs',groupKey:group.key,name:'Near host tick'});assert.equal(second.ok,true);assert.equal(listing().matchingPreset,saved.id);
 r.outPoint+=.2;assert.equal(listing().matchingPreset,null);
});
