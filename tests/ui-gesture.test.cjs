const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const editor=require('../ui-editor.js'),panel=require('../panel.js');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject};}
async function turn(){await new Promise(resolve=>setImmediate(resolve));}
test('a new drag has a new identity while the prior drag is finishing',async()=>{
 const first=deferred(),calls=[],flags=[],errors=[];let ids=0;
 const gesture=editor.createGestureController({newId:()=>String(++ids),onActive:v=>flags.push(v),refresh(){},error:e=>errors.push(e),payload:(value,id)=>({value,undoGroupId:id}),setField(){},call(method,payload){calls.push({method,payload});return method==='setControl'&&payload.undoGroupId==='1'?first.promise:Promise.resolve({});}});
 gesture.change(20,false);const oldDone=gesture.end();await turn();
 gesture.change(40,false);const newDone=gesture.end();await turn();
 first.resolve({});await Promise.all([oldDone,newDone]);
 assert.deepEqual(calls.filter(c=>c.method==='setControl').map(c=>c.payload.undoGroupId),['1','2']);
 assert.deepEqual(calls.filter(c=>c.method==='endUndoGroup').map(c=>c.payload.undoGroupId).sort(),['1','2']);
 assert.equal(flags.at(-1),false);assert.deepEqual(errors,[]);
});
test('an older end callback cannot clear a newer active drag or force its DOM refresh',async()=>{
 const ending=deferred(),flags=[];let ids=0,refreshes=0;
 const gesture=editor.createGestureController({newId:()=>String(++ids),onActive:v=>flags.push(v),refresh:()=>refreshes++,error:e=>{throw e},payload:(value,id)=>({value,undoGroupId:id}),setField(){},call(method,payload){return method==='endUndoGroup'&&payload.undoGroupId==='1'?ending.promise:Promise.resolve({});}});
 gesture.change(20,false);const oldDone=gesture.end();await turn();
 gesture.start();ending.resolve({});await oldDone;
 assert.equal(flags.at(-1),true);assert.equal(refreshes,0);
 await gesture.end();assert.equal(flags.at(-1),false);assert.equal(refreshes,1);
});
test('failed writes and duplicate end notifications still release the same gesture once',async()=>{
 const calls=[],errors=[],flags=[];
 const gesture=editor.createGestureController({newId:()=> 'one',onActive:v=>flags.push(v),refresh(){},error:e=>errors.push(e.message),payload:(value,id)=>({value,undoGroupId:id}),setField(){},call(method,payload){calls.push(method);return method==='setControl'?Promise.reject(Error('write rejected')):Promise.resolve({});}});
 gesture.change(20,false);const done=gesture.end();assert.equal(gesture.end(),done);await done;
 assert.deepEqual(calls,['setControl','endUndoGroup']);assert.deepEqual(errors,['write rejected']);assert.equal(flags.at(-1),false);
});
test('gesture IDs differ across documents with the same clock and local counter',()=>{
 const source=fs.readFileSync(require.resolve('../ui-editor.js'),'utf8');
 function document(seed){const context={module:{exports:{}},Date:{now:()=>1000},crypto:{getRandomValues(a){a.fill(seed);return a;}}};vm.runInNewContext(source,context);return context.module.exports;}
 const a=document(1),b=document(2);assert.notEqual(a.newGestureId(),b.newGestureId());assert.notEqual(a.newGestureId(),a.newGestureId());
});
test('host restoration errors stay visible with the original failure and code',()=>{
 assert.throws(()=>panel.parseHostResult(JSON.stringify({ok:false,error:{code:'WRITE_FAILED',message:'Write failed',rollbackError:'Undo unavailable'}})),e=>e.code==='WRITE_FAILED'&&e.rollbackError==='Undo unavailable'&&e.message.includes('Write failed')&&e.message.includes('Undo unavailable'));
});
test('overlapping gesture lifetimes still use the existing serial CEP request queue',async()=>{
 const core=require('../ui-core.js'),callbacks=[],started=[];let ids=0;
 const queued=core.serialTransport((method,payload,done)=>{started.push({method,payload});callbacks.push(done);},{timeoutMs:2000});
 const gesture=editor.createGestureController({newId:()=>String(++ids),onActive(){},refresh(){},error:e=>{throw e},payload:(value,id)=>({value,undoGroupId:id}),setField(){},call:queued});
 gesture.change(20,false);const a=gesture.end();await turn();gesture.change(30,false);const b=gesture.end();await turn();
 assert.equal(started.length,1);
 while(callbacks.length){callbacks.shift()(null,{});await turn();}
 await Promise.all([a,b]);assert.deepEqual(started.filter(c=>c.method==='setControl').map(c=>c.payload.undoGroupId),['1','2']);
});
