const test = require('node:test'), assert = require('node:assert/strict');
let font;
try { font = require('../ui-animated-font.js'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
// A small DOM boundary double; browser-flow exercises actual DOM/keyboard behavior.
class Node {
  constructor(tag, doc) { this.tagName=tag;this.ownerDocument=doc;this.children=[];this.listeners={};this.value='';this.textContent=''; }
  appendChild(n) { this.children.push(n);n.parentNode=this;return n; }
  setAttribute(k,v) { this[k]=v; }
  addEventListener(k,fn) { (this.listeners[k] ||= []).push(fn); }
  removeEventListener(k,fn) { this.listeners[k]=(this.listeners[k]||[]).filter(f=>f!==fn); }
  remove() { this.parentNode.children=this.parentNode.children.filter(n=>n!==this); }
  event(type, values={}) { const e={type,preventDefault(){this.defaultPrevented=true;},...values};for(const fn of this.listeners[type]||[])fn(e);return e; }
}
const doc={createElement:tag=>new Node(tag,doc)};
const def=(id='one',points=[32,65,66])=>({id,digest:'sha256:'+id,name:'Style '+id,available:true,coverage:{codePoints:points,maxScalars:4}});
function setup(options={}) {
  assert.equal(typeof font?.create,'function','animated-font UI create API is implemented');
  const container=new Node('div',doc),calls=[],applied=[],errors=[],context={context:{projectKey:'p',compositionId:7,layerIds:[3]},expectedRevision:12};
  const ui=font.create({container,call:(method,payload)=>{calls.push({method,payload});return options.call ? options.call(method,payload) : Promise.resolve({rootLayerId:8});},getContext:()=>context,isBusy:()=>false,onApplied:r=>applied.push(r),onError:e=>errors.push(e)});
  const form=container.children[0],input=form.children.find(n=>n.tagName==='input'),button=form.children.find(n=>n.tagName==='button'),message=form.children.find(n=>n.role==='status');
  ui.select(def());ui.updateState({busy:false,connected:true});
  function type(text) { input.value=text;input.event('input'); }
  function enter(values) { input.event('keydown',{key:'Enter',...values}); }
  return {ui,container,form,input,button,message,calls,applied,errors,context,type,enter};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('connected status before the first real state keeps Add disabled and sends no request',()=>{
 const s=setup();s.context.context=null;s.context.expectedRevision=undefined;s.type('AB');s.ui.updateState({busy:false,connected:true});
 assert.equal(s.button.disabled,true);s.enter();s.form.event('submit');assert.equal(s.calls.length,0);assert.equal(s.errors.length,0);
 s.context.context={projectKey:'first-real-state',compositionId:7,layerIds:[]};s.context.expectedRevision=0;s.ui.updateState({busy:false,connected:true});assert.equal(s.button.disabled,false);
});
test('one draft and input survive style/visibility/busy polls; coverage revalidates',()=>{
  const s=setup();s.type('AB');assert.equal(s.button.disabled,false);s.ui.select(def('two',[65]));assert.equal(s.input.value,'AB');assert.equal(s.button.disabled,true);
  s.ui.select(null);s.ui.select(def());s.ui.updateState({busy:true,connected:true});assert.equal(s.input.value,'AB');assert.equal(s.container.children[0],s.form);assert.equal(s.button.disabled,true);
  s.ui.updateState({busy:false,connected:true});assert.equal(s.button.disabled,false);
});
test('Add and Enter use one guarded path and immutable style/text/context snapshots',async()=>{
  let release;const s=setup({call:()=>new Promise(r=>release=r)});s.type('A B');s.enter();s.form.event('submit');assert.equal(s.calls.length,1);
  s.context.context.layerIds.push(99);s.context.expectedRevision=13;s.ui.select(def('two'));s.type('BA');
  assert.deepEqual(s.calls[0],{method:'addAnimatedFont',payload:{fontId:'one',fontHash:'sha256:one',text:'A B',context:{projectKey:'p',compositionId:7,layerIds:[3]},expectedRevision:12}});
  release({rootLayerId:8});await flush();assert.equal(s.applied.length,0);assert.equal(s.input.value,'BA');
  s.form.event('submit');await flush();assert.equal(s.calls.length,2);assert.equal(s.calls[1].payload.text,'BA');
});
test('IME Enter and busy, disconnected, invalid, malformed and unavailable input never dispatch',()=>{
  const s=setup();s.type('AB');s.input.event('compositionstart');s.enter();s.form.event('submit');s.input.event('compositionend');s.enter();s.enter({isComposing:true});s.enter({keyCode:229});assert.equal(s.calls.length,0);
  s.input.event('keydown',{key:'a'});
  for(const text of ['', '   ', 'C', 'AAAAA', 'A\nB', '\ud800', 'A\u0000']) {s.type(text);s.form.event('submit');}
  s.type('AB');s.ui.updateState({busy:true,connected:true});s.form.event('submit');s.ui.updateState({busy:false,connected:false});s.form.event('submit');s.ui.updateState({busy:false,connected:true});
  for(const d of [{...def(),available:false},{...def(),digest:''},{...def(),coverage:null},{...def(),coverage:{codePoints:[65,0xd800],maxScalars:4}},{...def(),coverage:{codePoints:[65],maxScalars:0}}]) {s.ui.select(d);s.form.event('submit');}
  assert.equal(s.calls.length,0);
});
test('host errors retain draft and message through polls; successful retry retains draft',async()=>{
  let fail=true;const s=setup({call:()=>fail?Promise.reject(new Error('<img src=x> host error')):Promise.resolve({rootLayerId:9})});s.type('AB');s.form.event('submit');await flush();
  assert.equal(s.input.value,'AB');assert.match(s.message.textContent,/host error/);assert.equal(s.errors.length,1);s.ui.select(def());s.ui.updateState({busy:false,connected:true});assert.match(s.message.textContent,/host error/);
  fail=false;s.form.event('submit');await flush();assert.equal(s.applied[0].rootLayerId,9);assert.equal(s.input.value,'AB');
});
test('late errors cannot replace a newer draft and destroy removes dispatch listeners',async()=>{
  let reject;const s=setup({call:()=>new Promise((_,r)=>reject=r)});s.type('AB');s.enter();s.type('BA');reject(new Error('old'));await flush();assert.equal(s.errors.length,0);assert.doesNotMatch(s.message.textContent,/old/);
  s.ui.destroy();s.form.event('submit');s.enter();assert.equal(s.calls.length,1);assert.equal(s.container.children.length,0);
});
test('supplementary Unicode scalars count once and exact spaces/case are preserved',async()=>{
  const s=setup();s.ui.select(def('scalar',[32,65,0x1f600]));s.type(' A😀 ');s.enter();await flush();assert.equal(s.calls[0].payload.text,' A😀 ');
});
test('missing or nonfinite revision/context cannot dispatch against an uncaptured project',()=>{
  const s=setup();s.type('AB');s.context.expectedRevision=NaN;s.enter();s.context.expectedRevision=12;s.context.context=null;s.enter();
  assert.equal(s.calls.length,0);assert.equal(s.errors.length,0);assert.equal(s.input.value,'AB');
});
