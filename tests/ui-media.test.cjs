const test = require('node:test');
const assert = require('node:assert/strict');
const media = require('../ui-media.js');
const outer = {projectKey:'p',compositionId:7,layerIds:[3]};
function response(overrides={}) {
  return {rootLayerId:3,instanceId:'one',media:[{layerId:11,itemId:20,name:'Slot',canReplace:true,mediaKind:'visual'}],selectedBinding:{layerId:11,itemId:20},projectSelection:[{id:30,name:'New image',mediaKind:'visual'}],canReplace:true,bindingContext:{expectedRootLayerId:3,expectedSourceItemId:10,expectedMediaItemId:20,expectedItemId:30},...overrides};
}
function fixture(responses) {
  const calls=[]; let last;
  const session=media.createSession({root:{rootLayerId:3},context:outer,layerId:11,call:async(method,payload)=>{calls.push({method,payload});const value=responses.shift();if(value instanceof Error)throw value;return typeof value==='function'?value():value;},change:s=>last=s});
  return {session,calls,state:()=>last};
}
test('replacement needs one compatible Project item and exact binding IDs',()=>{
  assert.equal(media.canReplace(response(),11),true);
  for(const bad of [{projectSelection:[]},{projectSelection:[{id:30},{id:31}]},{canReplace:false},{errorCode:'LOCKED'},{bindingContext:null},{bindingContext:{...response().bindingContext,expectedItemId:31}},{selectedBinding:{layerId:12,itemId:20}},{replacement:{noop:true}}])assert.equal(media.canReplace(response(bad),11),false,JSON.stringify(bad));
});
test('captures outer context and binding without exposing mutable caller objects',async()=>{
  const f=fixture([response(),{replaced:true}]);await f.session.refresh();
  outer.layerIds.push(99);
  try {await f.session.replace();assert.deepEqual(f.calls[1].payload.context.layerIds,[3]);assert.deepEqual(f.calls[1].payload.bindingContext,response().bindingContext);assert.equal(f.calls[1].payload.action,'replaceSelected');}
  finally {outer.layerIds.pop();}
});
test('Project candidate may change but changed source requires explicit rebind',async()=>{
  const newer=response({projectSelection:[{id:31,name:'Next'}],bindingContext:{...response().bindingContext,expectedItemId:31}});
  const changed=response({bindingContext:{...newer.bindingContext,expectedSourceItemId:99},projectSelection:newer.projectSelection});
  const f=fixture([response(),newer,changed,changed]);await f.session.refresh();await f.session.refresh();assert.equal(f.state().canReplace,true);
  await f.session.refresh();assert.equal(f.state().stale,true);assert.equal(f.state().canReplace,false);
  await assert.rejects(f.session.replace(),/새로고침/);await f.session.refresh(true);assert.equal(f.state().canReplace,true);
});
test('overlapping polls do not enqueue extra calls',async()=>{
  let done;const f=fixture([()=>new Promise(resolve=>done=resolve)]);
  const pending=f.session.refresh();await f.session.refresh();assert.equal(f.calls.length,1);done(response());await pending;assert.equal(f.state().canReplace,true);
});
test('closing during a request ignores late response and prevents mutations',async()=>{
  let done;const f=fixture([()=>new Promise(resolve=>done=resolve)]);
  const pending=f.session.refresh();await Promise.resolve();f.session.close();done(response());await pending;
  assert.equal(f.state().response,null);await assert.rejects(f.session.replace(),/닫혔/);assert.equal(f.calls.length,1);
});
test('slot change invalidates pending response and requests the new slot afterward',async()=>{
  let done;const second=response({media:[{layerId:12,itemId:21,canReplace:true}],selectedBinding:{layerId:12,itemId:21},bindingContext:{...response().bindingContext,expectedMediaItemId:21}});
  const f=fixture([()=>new Promise(resolve=>done=resolve),second]);const pending=f.session.refresh();await Promise.resolve();f.session.select(12);done(response());await pending;
  assert.equal(f.calls.length,2);assert.equal(f.calls[1].payload.layerId,12);assert.equal(f.state().response.selectedBinding.layerId,12);assert.equal(f.state().canReplace,true);
});
test('native failure preserves visible code while refreshing compatible selection',async()=>{
  const error=Object.assign(new Error('Selection changed'),{code:'PROJECT_SELECTION_CHANGED'});
  const f=fixture([response(),error,response({canReplace:false,errorCode:'PROJECT_SELECTION_COUNT',projectSelection:[]})]);await f.session.refresh();await assert.rejects(f.session.replace(),/Selection changed/);
  assert.match(f.state().error,/PROJECT_SELECTION_CHANGED/);assert.equal(f.calls[2].payload.action,'context');assert.equal(f.state().canReplace,false);
});
test('ambiguous mutation result is never reported as successful replacement',async()=>{
  const f=fixture([response(),{} ,response()]);await f.session.refresh();await assert.rejects(f.session.replace(),/결과/);
});
test('no-op identity cannot create an enabled replacement',()=>{
  assert.equal(media.canReplace(response({projectSelection:[{id:20}],bindingContext:{...response().bindingContext,expectedItemId:20}}),11),false);
});
test('reveal uses captured root context and does not need Project selection',async()=>{
  const f=fixture([{itemId:10,name:'Source'}]);await f.session.reveal();assert.deepEqual(f.calls[0],{method:'mediaAction',payload:{action:'revealSource',rootLayerId:3,context:outer}});
});
