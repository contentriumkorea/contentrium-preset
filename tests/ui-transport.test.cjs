const test=require('node:test'),assert=require('node:assert/strict'),core=require('../ui-core.js');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
test('diagnostics expose method and age without request payload and cannot mutate the queue',async()=>{
 let done;const q=core.serialTransport((method,payload,callback)=>done=callback,{timeoutMs:1000});
 const pending=q('getState',{privatePath:'not-for-diagnostics'});const d=q.getDiagnostics();
 assert.equal(d.pending.method,'getState');assert.equal(d.pending.timedOut,false);assert.ok(d.pending.ageMs>=0);assert.equal(d.queueLength,0);
 assert.equal(JSON.stringify(d).includes('privatePath'),false);d.pending.method='tampered';assert.equal(q.getDiagnostics().pending.method,'getState');done(null,{});await pending;
 assert.equal(q.getDiagnostics().pending,null);assert.equal(q.getDiagnostics().lastCompletion.method,'getState');
});
test('lost callback remains blocked with visible timed-out diagnostic; no implicit forget or retry',async()=>{
 const started=[];const q=core.serialTransport((method)=>started.push(method),{timeoutMs:8});
 await assert.rejects(q('getState',{}),e=>e.code==='CEP_RESPONSE_TIMEOUT'&&e.requestId===1);
 await pause(10);assert.equal(q.getDiagnostics().waitingLate,true);assert.equal(q.getDiagnostics().pending.timedOut,true);assert.ok(q.getDiagnostics().pending.ageMs>=8);
 await assert.rejects(q('setControl',{value:3}),/이전 AE/);assert.deepEqual(started,['getState']);
});
test('late completion reports its own identity once and never resolves the expired mutation as success',async()=>{
 const callbacks=[],notifications=[];const q=core.serialTransport((m,p,done)=>callbacks.push(done),{timeoutMs:8,onPending:(waiting,detail)=>notifications.push({waiting,detail})});
 let success=false;await q('setControl',{value:1}).then(()=>success=true,()=>{});const timed=q.getDiagnostics().pending.requestId;
 callbacks[0](null,{applied:true});callbacks[0](null,{applied:true});assert.equal(success,false);assert.equal(q.getDiagnostics().busy,false);
 assert.equal(notifications.length,2);assert.equal(notifications[1].detail.requestId,timed);assert.equal(notifications[1].detail.timedOut,true);assert.equal(q.getDiagnostics().lastCompletion.ok,true);
});
test('ordinary failure and subsequent requests keep independent diagnostic identities',async()=>{
 const callbacks=[];const q=core.serialTransport((m,p,done)=>callbacks.push(done));const a=q('setControl',{});callbacks.shift()(Object.assign(Error('Failed'),{code:'WRITE_FAILED'}));await assert.rejects(a,/Failed/);
 assert.equal(q.getDiagnostics().lastCompletion.errorCode,'WRITE_FAILED');const b=q('getState',{});assert.equal(q.getDiagnostics().pending.requestId,2);callbacks.shift()(null,{});await b;assert.equal(q.getDiagnostics().lastCompletion.timedOut,false);
});
test('diagnostic observers cannot block or corrupt the underlying serial requests',async()=>{
 const q=core.serialTransport((method,payload,done)=>done(null,method),{onChange(){throw Error('detached diagnostic element');},onPending(){throw Error('detached notice');}});
 assert.equal(await q('getState',{}),'getState');assert.equal(await q('getSettings',{}),'getSettings');assert.equal(q.getDiagnostics().busy,false);assert.ok(q.getDiagnostics().observerError);
});

test('explicit deferred cleanup waits for a timed-out native callback before it starts',async()=>{const started=[],callbacks=[];const q=core.serialTransport((m,p,done)=>{started.push(m);callbacks.push(done)},{timeoutMs:8});await assert.rejects(q('render',{}),e=>e.code==='CEP_RESPONSE_TIMEOUT');const cleanup=q('cleanup',{}, {waitForLate:true});await pause(2);assert.deepEqual(started,['render']);await assert.rejects(q('setControl',{}),/이전 AE/);callbacks[0](null,{});assert.deepEqual(started,['render','cleanup']);callbacks[1](null,{clean:true});assert.deepEqual(await cleanup,{clean:true});});
