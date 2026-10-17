const test=require('node:test'),assert=require('node:assert/strict');
const sync=require('../ui-sync.js');
const panelUI=require('../panel.js');
function storage(){const values=new Map();return{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
function network(objectDelivery=false){const endpoints=[],sent=[];let time=100000;return{sent,now:()=>time,advance:n=>time+=n,endpoint(id){const listeners=new Map(),cep={getExtensionId:()=>id,getHostEnvironment:()=>JSON.stringify({appId:'AEFT'}),addEventListener:(t,f)=>listeners.set(t,f),removeEventListener:(t,f)=>{if(listeners.get(t)===f)listeners.delete(t);},dispatchEvent:e=>{sent.push(structuredClone(e));for(const peer of endpoints)peer.emit({...structuredClone(e),data:objectDelivery?JSON.parse(e.data):e.data});}};const endpoint={cep,emit:e=>listeners.get(e.type)?.(e)};endpoints.push(endpoint);return endpoint;}};}
function panel(bus,slot,extra={}){const endpoint=bus.endpoint(sync.extensionId(slot)),events=[],store=storage();const instance=sync.create({cep:endpoint.cep,slot,origin:'document-token-'+slot,storage:store,now:bus.now,onShared:v=>events.push(['shared',v]),onSettings:v=>events.push(['settings',v]),onLease:()=>events.push(['lease']),onDock:()=>events.push(['dock']),...extra});return{instance,events,store,endpoint};}
test('helper panel leases never impersonate detached Edit and release only their own slot',()=>{const bus=network(),main=panel(bus,'main');main.instance.start();main.instance.lease();for(const slot of ['easing','keyframes','anchor','shifter']){const helper=panel(bus,slot);helper.instance.start();helper.instance.lease();assert.ok(main.store.getItem('contentrium-preset.panel-lease.'+slot));assert.equal(main.store.getItem('contentrium-preset.edit-panel-open'),null);main.instance.dock();assert.equal(helper.events.filter(e=>e[0]==='dock').length,0);helper.instance.release();helper.instance.dispose();assert.equal(main.store.getItem('contentrium-preset.panel-lease.'+slot),null);}assert.ok(main.store.getItem('contentrium-preset.panel-lease.main'));main.instance.release();main.instance.dispose();});
test('independent storage CEP peers exchange own leases and target snapshots on hello',()=>{
 const bus=network(),main=panel(bus,'main');main.instance.start();main.instance.lease();
 const edit=panel(bus,'edit');edit.instance.start();edit.instance.lease();
 assert.equal(JSON.parse(main.store.getItem('contentrium-preset.panel-lease.edit')).token,'document-token-edit');
 assert.equal(JSON.parse(edit.store.getItem('contentrium-preset.panel-lease.main')).token,'document-token-main');
 assert.ok(bus.sent.some(e=>JSON.parse(e.data).kind==='snapshot'&&JSON.parse(e.data).target==='document-token-edit'));
 assert.ok(bus.sent.every(e=>e.scope==='APPLICATION'&&e.appId==='AEFT'&&e.type===sync.EVENT));
});
test('shared favorites/labels converge, reconnect snapshots persist and do not rebroadcast',()=>{
 const bus=network(),a=panel(bus,'main'),b=panel(bus,'edit');a.instance.start();b.instance.start();
 a.instance.shared({favorites:['preset'],labels:{'item:preset':'red'}});
 assert.deepEqual(b.events.filter(e=>e[0]==='shared').at(-1)[1],{favorites:['preset'],labels:{'item:preset':'red'}});
 const before=bus.sent.length;b.instance.shared({favorites:['preset'],labels:{'item:preset':'red'}});assert.equal(bus.sent.length,before);
 const c=panel(bus,'alt2');c.instance.start();assert.deepEqual(c.events.filter(e=>e[0]==='shared').at(-1)[1].favorites,['preset']);
 a.instance.shared({favorites:[],labels:{}});assert.deepEqual(c.events.filter(e=>e[0]==='shared').at(-1)[1].favorites,[]);
});
test('settings notify once and host readback with identical values does not echo',()=>{
 const bus=network(),a=panel(bus,'main'),b=panel(bus,'edit');a.instance.start();b.instance.start();a.instance.settings({pausePreviewWhenInactive:false});
 assert.equal(b.events.filter(e=>e[0]==='settings').length,1);const before=bus.sent.length;b.instance.settings({pausePreviewWhenInactive:false});assert.equal(bus.sent.length,before);
});
test('release preserves newer owner; dock targets edit only and deduplicates replay',()=>{
 const bus=network(),a=panel(bus,'main'),b=panel(bus,'edit');a.instance.start();b.instance.start();b.instance.lease();
 a.store.setItem('contentrium-preset.panel-lease.edit',JSON.stringify({token:'newer-document-token',at:bus.now()}));b.instance.release();assert.equal(JSON.parse(a.store.getItem('contentrium-preset.panel-lease.edit')).token,'newer-document-token');
 a.instance.dock();assert.equal(b.events.filter(e=>e[0]==='dock').length,1);b.endpoint.emit(bus.sent.at(-1));assert.equal(b.events.filter(e=>e[0]==='dock').length,1);assert.equal(a.events.filter(e=>e[0]==='dock').length,0);
});
test('strict schema rejects foreign sender, stale/future, target mismatch, unknown keys and oversized payload',()=>{
 const bus=network(),a=panel(bus,'main'),b=panel(bus,'edit');a.instance.start();b.instance.start();a.instance.settings({pausePreviewWhenInactive:false});const good=bus.sent.at(-1),value=JSON.parse(good.data),before=b.events.length;
 for(const patch of [{sender:'com.foreign.plugin'},{sentAt:bus.now()-6000},{sentAt:bus.now()+6000},{target:'other-document-token'},{extra:true},{payload:{settings:{unknownSetting:true},stamp:value.payload.stamp}},{payload:{settings:{pausePreviewWhenInactive:'false'},stamp:value.payload.stamp}}]){const m={...value,...patch,seq:value.seq+1};b.endpoint.emit({...good,data:JSON.stringify(m)});}
 b.endpoint.emit({...good,extensionId:'com.foreign.plugin'});b.endpoint.emit({...good,data:'x'.repeat(sync.MAX_BYTES+1)});assert.equal(b.events.length,before);
});
test('old live messages expire and own extension identity must match the configured slot',()=>{
 const bus=network(),a=panel(bus,'main'),b=panel(bus,'edit');a.instance.start();b.instance.start();a.instance.lease();const old=bus.sent.at(-1),before=b.events.length;bus.advance(6000);b.endpoint.emit(old);assert.equal(b.events.length,before);
 const wrong=sync.create({cep:a.endpoint.cep,slot:'edit',origin:'another-token-value',storage:storage(),now:bus.now});assert.equal(wrong.available,false);
});
test('reservations travel to peers and failed-open release removes only that reservation',()=>{
 const bus=network(),a=panel(bus,'main'),b=panel(bus,'edit');a.instance.start();b.instance.start();a.instance.reserve('alt2');assert.equal(JSON.parse(b.store.getItem('contentrium-preset.panel-lease.alt2')).token,'opening-document-token-main');a.instance.releaseReservation('alt2');assert.equal(b.store.getItem('contentrium-preset.panel-lease.alt2'),null);
});
test('missing CEP falls back without events and persisted preferences still validate',()=>{
 const store=storage(),a=sync.create({slot:'main',origin:'standalone-document',storage:store});assert.equal(a.available,false);a.start();a.shared({favorites:['a'],labels:{}});assert.ok(store.getItem(sync.STATE_KEY));a.dispose();
});
test('late opening reservations cannot replace a live panel lease at the same clock',()=>{
 const bus=network(),a=panel(bus,'main'),b=panel(bus,'alt2');a.instance.start();b.instance.start();b.instance.lease();a.instance.reserve('alt2');
 assert.equal(JSON.parse(a.store.getItem('contentrium-preset.panel-lease.alt2')).token,'document-token-alt2');
 a.instance.releaseReservation('alt2');assert.equal(JSON.parse(b.store.getItem('contentrium-preset.panel-lease.alt2')).token,'document-token-alt2');
});
test('late-joining panel learns pending reservations but expired ones are not replayed',()=>{
 const bus=network(),a=panel(bus,'main');a.instance.start();a.instance.reserve('alt3');const b=panel(bus,'edit');b.instance.start();
 assert.equal(JSON.parse(b.store.getItem('contentrium-preset.panel-lease.alt3')).token,'opening-document-token-main');
 bus.advance(3500);const c=panel(bus,'alt2');c.instance.start();assert.equal(c.store.getItem('contentrium-preset.panel-lease.alt3'),null);
});
test('malformed nested snapshot, wrong host scope and extra fields are rejected without throwing',()=>{
 const bus=network(),a=panel(bus,'main'),b=panel(bus,'edit');a.instance.start();a.instance.lease();b.instance.start();
 const event=bus.sent.find(e=>JSON.parse(e.data).kind==='snapshot'),value=JSON.parse(event.data),before=b.events.length;
 for(const payload of [{...value.payload,reservations:[null]},{...value.payload,reservations:[{}]},{...value.payload,extra:true}])assert.doesNotThrow(()=>b.endpoint.emit({...event,data:JSON.stringify({...value,seq:value.seq+100,payload})}));
 b.endpoint.emit({...event,scope:'GLOBAL'});b.endpoint.emit({...event,appId:'PPRO'});b.endpoint.emit({...event,data:{}});assert.equal(b.events.length,before);
});
test('missing favorite initialization is null, while an explicitly saved empty selection is valid',()=>{
 assert.equal(panelUI.initialSharedPreference({}),null);
 assert.equal(panelUI.initialSharedPreference({labels:{'item:a':'red'}}),null);
 assert.deepEqual(panelUI.initialSharedPreference({favorites:[],labels:{}}),{favorites:[],labels:{}});
 assert.deepEqual(panelUI.initialSharedPreference({favorites:['a'],labels:{'item:a':'purple'}}),{favorites:['a'],labels:{'item:a':'purple'}});
});
test('legacy seeded favorites win over unset peers independent of origin ordering',()=>{
 for(const origins of [['zzzz-legacy-origin','aaaa-newpeer-origin'],['aaaa-legacy-origin','zzzz-newpeer-origin']]){
  const bus=network(),legacy={favorites:['distinctive'],labels:{'item:distinctive':'purple'}};
  const main=panel(bus,'main',{origin:origins[0],initialShared:panelUI.initialSharedPreference({favorites:legacy.favorites,labels:legacy.labels})});
  main.instance.start();const edit=panel(bus,'edit',{origin:origins[1],initialShared:panelUI.initialSharedPreference({})});edit.instance.start();main.instance.announce();
  assert.deepEqual(main.instance.currentShared(),legacy);assert.deepEqual(edit.instance.currentShared(),legacy);
 }
});
test('explicit deletion empty survives persistence/reload and is not confused with unset',()=>{
 const bus=network(),main=panel(bus,'main',{initialShared:{favorites:['a'],labels:{'item:a':'red'}}});main.instance.start();main.instance.shared({favorites:[],labels:{}});main.instance.dispose();
 const reload=panel(bus,'main',{origin:'fresh-reload-origin',storage:main.store,initialShared:null});reload.instance.start();assert.deepEqual(reload.instance.currentShared(),{favorites:[],labels:{}});
});
test('late legacy-bearing panel backfills an already-open unset panel without a focus event',()=>{
 const bus=network(),edit=panel(bus,'edit',{initialShared:null});edit.instance.start();
 const legacy={favorites:['distinctive'],labels:{'item:distinctive':'purple'}},main=panel(bus,'main',{initialShared:legacy});main.instance.start();
 assert.deepEqual(edit.instance.currentShared(),legacy);assert.deepEqual(main.instance.currentShared(),legacy);
 assert.ok(bus.sent.length<10,'handshake converges without a snapshot loop');
});

test('native CEP parsed-object delivery shares leases, legacy snapshot and updates without loops',()=>{
 const bus=network(true),legacy={favorites:['native-object'],labels:{'item:native-object':'purple'}},main=panel(bus,'main',{initialShared:legacy});main.instance.start();main.instance.lease();
 const edit=panel(bus,'edit');edit.instance.start();edit.instance.lease();
 assert.deepEqual(edit.instance.currentShared(),legacy);
 assert.equal(JSON.parse(main.store.getItem('contentrium-preset.panel-lease.edit')).token,'document-token-edit');
 main.instance.settings({pausePreviewWhenInactive:false});assert.deepEqual(edit.events.filter(e=>e[0]==='settings').at(-1)[1],{pausePreviewWhenInactive:false});
 main.instance.shared({favorites:[],labels:{}});assert.deepEqual(edit.instance.currentShared(),{favorites:[],labels:{}});
 assert.ok(bus.sent.length<15,'parsed-object handshake/update must not loop');
});

test('object delivery rejects non-JSON values, cycles, oversized bytes and wrong envelopes without throwing',()=>{
 const bus=network(),a=panel(bus,'main'),b=panel(bus,'edit');a.instance.start();b.instance.start();a.instance.dock();
 const event=bus.sent.at(-1),good=JSON.parse(event.data),before=b.events.length;
 const malformed=[undefined,()=>{},Symbol('bad'),BigInt(1),NaN,Infinity,new Date(),Object.create({inherited:true})];
 for(const extra of malformed){const value={...good,seq:good.seq+1,extra};assert.doesNotThrow(()=>b.endpoint.emit({...event,data:value}));}
 const cycle={...good,seq:good.seq+1};cycle.extra=cycle;assert.doesNotThrow(()=>b.endpoint.emit({...event,data:cycle}));
 const getter={...good,seq:good.seq+1};Object.defineProperty(getter,'extra',{enumerable:true,get(){throw Error('must not execute getter');}});assert.doesNotThrow(()=>b.endpoint.emit({...event,data:getter}));
 b.endpoint.emit({...event,data:{...good,seq:good.seq+1,extra:'가'.repeat(sync.MAX_BYTES/2)}});
 b.endpoint.emit({...event,data:{...good,seq:good.seq+1,sender:'com.foreign.plugin'}});
 b.endpoint.emit({...event,data:{...good,seq:good.seq+1,sentAt:bus.now()-6000}});
 assert.equal(b.events.length,before);
 b.endpoint.emit({...event,data:{...good,seq:good.seq+1}});assert.equal(b.events.length,before+1,'invalid objects must not consume a sequence or execute a dock action');
});

test('same sequence replay is deduplicated across string and native object deliveries',()=>{
 const bus=network(),a=panel(bus,'main'),b=panel(bus,'edit');a.instance.start();b.instance.start();a.instance.dock();
 const event=bus.sent.at(-1),before=b.events.filter(e=>e[0]==='dock').length;b.endpoint.emit({...event,data:JSON.parse(event.data)});b.endpoint.emit(event);
 assert.equal(before,1);assert.equal(b.events.filter(e=>e[0]==='dock').length,before);
});
