const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const sync=require('../ui-sync.js'),thumbnails=require('../ui-thumbnails.js');
function store(){const values=new Map();return {values,getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
function network(){const peers=[],sent=[];let time=100000;return {sent,now:()=>time,advance:n=>time+=n,endpoint(id){const listeners=new Map(),endpoint={emit:e=>listeners.get(e.type)?.(e)};endpoint.cep={getExtensionId:()=>id,getHostEnvironment:()=>JSON.stringify({appId:'AEFT'}),addEventListener:(t,f)=>listeners.set(t,f),removeEventListener:(t,f)=>{if(listeners.get(t)===f)listeners.delete(t);},dispatchEvent:e=>{sent.push(structuredClone(e));for(const p of peers)p.emit(structuredClone(e));}};peers.push(endpoint);return endpoint;}};}
function panel(bus,slot,onCancel=()=>{},saved=store()){const endpoint=bus.endpoint(sync.extensionId(slot)),instance=sync.create({cep:endpoint.cep,slot,origin:'thumbnail-origin-'+slot,storage:saved,now:bus.now,onThumbnailCancel:onCancel});instance.start();return {endpoint,instance,store:saved};}
function event(bus,seq=100,patch={},outer={}){return {type:sync.EVENT,scope:'APPLICATION',appId:'AEFT',extensionId:sync.extensionId('main'),data:JSON.stringify({v:1,sender:sync.extensionId('main'),origin:'thumbnail-origin-main',seq,sentAt:bus.now(),target:null,kind:'thumbnailCancel',payload:{},...patch}),...outer};}
function png(){const b=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.write('IHDR',12);b.writeUInt32BE(320,16);b.writeUInt32BE(2160,20);return b;}
const tick=()=>new Promise(r=>setImmediate(r));
async function until(check){const end=Date.now()+3000;while(!check()){assert(Date.now()<end,'CPU fixture did not reach expected state');await tick();}}
function files(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'cp-thumbnail-cancel-test-')),resolved=path.resolve(root),tmp=path.resolve(os.tmpdir());assert(path.dirname(resolved)===tmp);assert(path.basename(resolved).startsWith('cp-thumbnail-cancel-test-'));t.after(()=>{assert(path.resolve(root)===resolved&&path.dirname(resolved)===tmp);fs.rmSync(resolved,{recursive:true,force:true});});return root;}
function item(root,id){const file=path.join(root,id+'.webm');fs.writeFileSync(file,'own-'+id);return {id,kind:'video',path:file};}

test('valid transient cancel reaches one peer once across string/object delivery and never echoes',()=>{
 const bus=network();let a=0,b=0;const main=panel(bus,'main',()=>a++),edit=panel(bus,'edit',()=>b++),before=bus.sent.length,good=event(bus);
 edit.endpoint.emit(good);edit.endpoint.emit({...good,data:JSON.parse(good.data)});edit.endpoint.emit(good);
 assert.equal(b,1,'a valid incoming thumbnailCancel must reach the peer callback exactly once');assert.equal(a,0);assert.equal(bus.sent.length,before,'receiving cancellation must not rebroadcast');main.instance.dispose();edit.instance.dispose();
});

test('publisher sends one exact empty transient command and never persists or snapshots cancellation',()=>{
 const bus=network();let count=0;const a=panel(bus,'main'),b=panel(bus,'edit',()=>count++);const before=bus.sent.length;
 assert.equal(typeof a.instance.thumbnailCancel,'function','sync endpoint needs a transient thumbnailCancel publisher');a.instance.thumbnailCancel();
 const issued=bus.sent.slice(before);assert.equal(issued.length,1);const value=JSON.parse(issued[0].data);assert.equal(value.kind,'thumbnailCancel');assert.deepEqual(value.payload,{});assert.equal(value.target,null);assert.equal(count,1);
 for(const p of [a,b])for(const value of p.store.values.values())assert(!value.includes('thumbnailCancel'),'command must never enter storage');
 let late=0;const c=panel(bus,'alt2',()=>late++);assert.equal(late,0,'hello/snapshot must not replay an old Stop');for(const e of bus.sent.filter(e=>JSON.parse(e.data).kind==='snapshot'))assert(!JSON.stringify(JSON.parse(e.data).payload).includes('thumbnailCancel'));
 a.instance.dispose();b.instance.dispose();c.instance.dispose();
});

test('cancel rejects malformed payload, wrong sender/host/scope, stale/future and targeted commands',()=>{
 const bus=network();let count=0;const b=panel(bus,'edit',()=>count++);const patches=[{payload:{extra:true}},{payload:[]},{payload:null},{sender:'com.foreign.plugin'},{origin:'invalid'},{sentAt:bus.now()-5001},{sentAt:bus.now()+1001},{target:'thumbnail-origin-edit'}];
 for(let i=0;i<patches.length;i++)b.endpoint.emit(event(bus,100+i,patches[i]));for(const outer of [{appId:'PPRO'},{scope:'GLOBAL'},{extensionId:'com.foreign.plugin'},{type:'other.event'}])b.endpoint.emit(event(bus,200,{},outer));
 const data=JSON.parse(event(bus).data);Object.defineProperty(data,'payload',{enumerable:true,get(){throw Error('untrusted getter must not run');}});assert.doesNotThrow(()=>b.endpoint.emit(event(bus,300,{}, {data})));
 assert.equal(count,0);b.endpoint.emit(event(bus,100));assert.equal(count,1,'invalid command envelopes must not consume a valid sequence');b.instance.dispose();
});

test('lease release and panel disposal do not broadcast thumbnail cancellation',()=>{
 const bus=network();let canceled=0;const a=panel(bus,'main'),b=panel(bus,'edit',()=>canceled++);a.instance.lease();const before=bus.sent.length;a.instance.release();a.instance.dispose();assert.equal(canceled,0);assert(!bus.sent.slice(before).some(e=>JSON.parse(e.data).kind==='thumbnailCancel'));b.instance.dispose();
});

test('local Stop plus incoming command cancels both panels running and queued jobs after cleanup settles',async t=>{
 const root=files(t),release=[],started=[],cleaned=[],managers=[];
 function manager(name){let first=true;const m=thumbnails.create({cacheRoot:path.join(root,'cache-'+name),nodeRequire:require,render:plan=>{started.push(name);return new Promise((resolve,reject)=>{let done=false;const finish=()=>{if(done)return;done=true;cleaned.push(name);if(plan.signal.aborted){const e=Error('own canceled');e.code='ABORT_ERR';reject(e);}else resolve(png());};if(first){first=false;release.push(finish);}else finish();});}});managers.push(m);return m;}
 const a=manager('a'),b=manager('b');t.after(()=>{release.forEach(r=>r());managers.forEach(m=>m.destroy());});const runningA=a.request(item(root,'a-run')),queuedA=a.request(item(root,'a-queue')),runningB=b.request(item(root,'b-run')),queuedB=b.request(item(root,'b-queue'));
 await until(()=>started.length===2);const bus=network(),peer=panel(bus,'edit',()=>b.cancelAll());a.cancelAll();peer.endpoint.emit(event(bus));assert.equal(cleaned.length,0,'Stop must not report a renderer cleanup as already completed');release.forEach(r=>r());
 const result=await Promise.all([runningA,queuedA,runningB,queuedB]);assert.deepEqual(result.map(x=>x.state),['canceled','canceled','canceled','canceled'],'remote panel work must be canceled, not finish ready');assert.deepEqual(cleaned.slice().sort(),['a','b']);assert.equal(a.remaining,0);assert.equal(b.remaining,0);peer.instance.dispose();
});

test('Stop invalidates an already pending forced-revalidate continuation and explicit later Retry still works',async t=>{
 const root=files(t),source=item(root,'continuation');let release,renders=0;const manager=thumbnails.create({cacheRoot:path.join(root,'cache'),nodeRequire:require,render:()=>{renders++;if(renders===1)return new Promise(r=>release=()=>r(png()));return Promise.resolve(png());}});t.after(()=>{release?.();manager.destroy();});
 const first=manager.request(source);await until(()=>release);const continuation=manager.request(source,{force:true,revalidate:true});manager.cancelAll();release();
 const [one,two]=await Promise.all([first,continuation]);assert.equal(one.state,'canceled');assert.equal(two.state,'canceled','a request created before Stop must not start a fresh generation when its predecessor settles');assert.equal(renders,1,'pre-Stop continuation must not render');assert.equal(manager.remaining,0);
 const retry=await manager.request(source,{force:true});assert.equal(retry.state,'ready','explicit request after Stop can retry');assert.equal(renders,2);
});

test('local consumer release and destroy leave peer cache/work intact; Stop preserves completed cache',async t=>{
 const root=files(t),source=item(root,'cached');let renders=0;const a=thumbnails.create({cacheRoot:path.join(root,'cache-a'),nodeRequire:require,render:async()=>{renders++;return png();}}),b=thumbnails.create({cacheRoot:path.join(root,'cache-b'),nodeRequire:require,render:async()=>png()});t.after(()=>{a.destroy();b.destroy();});
 const first=await a.request(source);a.cancelAll();const second=await a.request(source);assert.equal(first.artifact.file,second.artifact.file);assert.equal(renders,1);const auto=b.acquire(source);auto.release();await auto.promise;b.destroy();assert.equal(fs.existsSync(first.artifact.file),true);assert.equal((await a.request(source)).state,'ready');assert.equal(renders,1);
});

test('an explicit Retry issued after Stop may wait for old cleanup and generate once',async t=>{
 const root=files(t),source=item(root,'later-retry');let release,renders=0;const manager=thumbnails.create({cacheRoot:path.join(root,'cache'),nodeRequire:require,render:()=>{renders++;if(renders===1)return new Promise(r=>release=()=>r(png()));return Promise.resolve(png());}});t.after(()=>{release?.();manager.destroy();});
 const first=manager.request(source);await until(()=>release);const stale=manager.request(source,{force:true,revalidate:true});manager.cancelAll();const fresh=manager.request(source,{force:true});assert.equal(renders,1,'cleanup has not settled');release();const values=await Promise.all([first,stale,fresh]);assert.deepEqual(values.map(x=>x.state),['canceled','canceled','ready']);assert.equal(renders,2);assert.equal(manager.remaining,0);
});

for(const gate of [1,2])test('Stop during awaited '+(gate===1?'PNG':'manifest')+' lease assertion prevents the pending commit',async t=>{
 const root=files(t),source=item(root,'commit-'+gate);let releaseGate,assertCount=0,releaseCount=0;
 const leases={acquire:async()=>({assert:async()=>{if(++assertCount===gate)await new Promise(resolve=>releaseGate=resolve);},release:async()=>releaseCount++})};
 const manager=thumbnails.create({cacheRoot:path.join(root,'cache'),nodeRequire:require,leases,render:async()=>png()});t.after(()=>{releaseGate?.();manager.destroy();});const pending=manager.request(source);
 await until(()=>releaseGate);assert.equal(manager.remaining,1);manager.cancelAll();releaseGate();const result=await pending,entries=fs.readdirSync(path.join(root,'cache','v1'));
 assert.equal(result.state,'canceled','Stop observed before commit must not finish ready');assert.equal(entries.filter(n=>n.endsWith('.json')).length,0,'no new cache manifest is published');assert.equal(entries.filter(n=>n.includes('.tmp-')).length,0,'temporary output is cleaned');assert.equal(entries.filter(n=>n.endsWith('.png')).length,gate===1?0:1,'only a PNG completed before Stop may remain; completed cache is never deleted');assert.equal(releaseCount,1);assert.equal(manager.remaining,0);
});

for(const mode of ['cached reuse','final committed readback'])test('Stop during '+mode+' returns canceled without revoking completed cache',async t=>{
 const root=files(t),source=item(root,'read-cache'),cacheRoot=path.join(root,'cache');let releaseRead,renders=0,paused=false;
 if(mode==='cached reuse'){const seed=thumbnails.create({cacheRoot,nodeRequire:require,render:async()=>png()});assert.equal((await seed.request(source)).state,'ready');seed.destroy();}
 const controlledFS=Object.create(fs);controlledFS.readFile=function(file,...args){const callback=args.pop();return fs.readFile(file,...args,(error,bytes)=>{if(!error&&!paused&&String(file).endsWith('.png')){paused=true;releaseRead=()=>callback(error,bytes);}else callback(error,bytes);});};
 const nodeRequire=name=>name==='fs'?controlledFS:require(name),manager=thumbnails.create({cacheRoot,nodeRequire,render:async()=>{renders++;return png();}});t.after(()=>{releaseRead?.();manager.destroy();});const pending=manager.request(source);
 await until(()=>releaseRead);assert.equal(manager.remaining,1);const directory=path.join(cacheRoot,'v1'),committed=fs.readdirSync(directory).filter(n=>/\.(json|png)$/.test(n)).map(name=>[name,fs.readFileSync(path.join(directory,name)).toString('hex')]);assert.equal(committed.length,2,'cache has already been committed before Stop');manager.cancelAll();releaseRead();const result=await pending;
 assert.equal(result.state,'canceled','Stop during awaited cache read must not settle ready');assert.equal(result.artifact,null,'canceled read does not expose a ready artifact');assert.equal(manager.remaining,0);for(const [name,bytes]of committed)assert.equal(fs.readFileSync(path.join(directory,name)).toString('hex'),bytes,'completed cache remains byte-exact');
 const retry=await manager.request(source);assert.equal(retry.state,'ready');assert.equal(renders,mode==='cached reuse'?0:1,'explicit later retry reuses committed cache without rendering again');
});

for(const outcome of ['ready','failed'])test('Stop while '+outcome+' job awaits lease release is observed before settlement',async t=>{
 const root=files(t),source=item(root,'release-'+outcome);let releaseGate,releaseCount=0;
 const leases={acquire:async()=>({assert:async()=>{},release:async()=>{releaseCount++;await new Promise(resolve=>releaseGate=resolve);}})};
 const manager=thumbnails.create({cacheRoot:path.join(root,'cache'),nodeRequire:require,leases,render:async()=>{if(outcome==='failed'){const e=Error('own renderer failure');e.code='OWN_RENDER_ERROR';throw e;}return png();}});t.after(()=>{releaseGate?.();manager.destroy();});const pending=manager.request(source);
 await until(()=>releaseGate);assert.equal(manager.remaining,1,'cleanup is not yet settled');manager.cancelAll();releaseGate();const result=await pending;
 assert.equal(result.state,'canceled','Stop during cleanup must win before final settlement');assert.equal(result.artifact,null);assert.equal(releaseCount,1);assert.equal(manager.remaining,0);
 if(outcome==='failed')assert.deepEqual(result.error,{code:'OWN_RENDER_ERROR',message:'own renderer failure'},'preserve the original meaningful failure');
 else{const entries=fs.readdirSync(path.join(root,'cache','v1'));assert.equal(entries.filter(n=>/\.(png|json)$/.test(n)).length,2,'committed cache is not revoked');assert.equal((await manager.request(source)).state,'ready');}
});

test('Stop during lease acquisition does not emit a later generating state or call the renderer',async t=>{
 const root=files(t),source=item(root,'acquire');let releaseAcquire,renders=0,releases=0;const states=[];
 const leases={acquire:()=>new Promise(resolve=>releaseAcquire=()=>resolve({assert:async()=>{},release:async()=>releases++}))};const manager=thumbnails.create({cacheRoot:path.join(root,'cache'),nodeRequire:require,leases,onChange:job=>states.push(job.state),render:async()=>{renders++;return png();}});t.after(()=>{releaseAcquire?.();manager.destroy();});const pending=manager.request(source);
 await until(()=>releaseAcquire);manager.cancelAll();const atStop=states.length;releaseAcquire();const result=await pending;assert.equal(result.state,'canceled');assert.equal(renders,0,'do not begin rendering after Stop has already been observed');assert(!states.slice(atStop).includes('generating'),'no post-Stop generating notification');assert.equal(releases,1);
});
