const test=require('node:test'),assert=require('node:assert/strict'),core=require('../ui-core.js');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('explicit long read keeps its original promise pending after the response warning and resolves once',async()=>{
 const calls=[],callbacks=[],notifications=[];const queue=core.serialTransport((method,payload,done)=>{calls.push(method);callbacks.push(done);},{timeoutMs:8,onPending:(waiting,detail)=>notifications.push({waiting,detail})});
 let settled=false;const first=queue('getLibrary',{}, {awaitCompletion:true}).then(value=>{settled=true;return{value};},error=>{settled=true;return{error:error.code};});
 await delay(25);assert.equal(settled,false);assert.equal(queue.isWaitingLate(),true);assert.equal(notifications[0].detail.requestId,1);
 const second=queue('getState',{}, {waitForLate:true});assert.deepEqual(calls,['getLibrary']);callbacks[0](null,{items:[1,2]});callbacks[0](null,{items:[]});
 assert.deepEqual(await first,{value:{items:[1,2]}});assert.deepEqual(calls,['getLibrary','getState']);callbacks[1](null,{revision:5});assert.deepEqual(await second,{revision:5});assert.equal(queue.isBusy(),false);
});
test('explicit long mutation preserves the correlated native error after the response warning',async()=>{
 let complete;const queue=core.serialTransport((m,p,done)=>complete=done,{timeoutMs:8}),result=queue('importLibraryItem',{}, {awaitCompletion:true}).then(value=>({value}),error=>({error:error.code}));
 await delay(25);complete(Object.assign(Error('Source was removed'),{code:'SOURCE_MISSING'}));assert.deepEqual(await result,{error:'SOURCE_MISSING'});assert.equal(queue.getDiagnostics().lastCompletion.timedOut,true);assert.equal(queue.getDiagnostics().lastCompletion.ok,false);
});
