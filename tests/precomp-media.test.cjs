const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
// Execute the actual engine with the existing minimal native-property fixture.
const fixture=fs.readFileSync(path.join(__dirname,'precomp-timeline.test.cjs'),'utf8');
const makeHost=new Function('require','__dirname',fixture.slice(0,fixture.indexOf("test('new title"))+'\nreturn host;')(require,__dirname);
function host(){const f=makeHost(true,true);class FootageItem{constructor(name,video=true,audio=false){this.id=90000+f.items.length;this.name=name;this.hasVideo=video;this.hasAudio=audio;this.width=1920;this.height=1080;this.duration=8;this.file={fsName:'C:/owned/'+name};this.mainSource={isStill:true};this.selected=false;f.items.push(this);}}f.context.FootageItem=FootageItem;f.footage=(name,video,audio)=>new FootageItem(name,video,audio);f.root=f.api.apply(f.target,{id:'31ce'},{time:4},'').layers[0];f.root.property('ADBE Transform Group').property('ADBE Anchor Point').setValue([640,360]);const source=f.footage('before.png');f.mediaLayer=f.root.source.layers.add(source);f.mediaLayer.name='OWN MEDIA';f.mediaLayer.startTime=.25;f.mediaLayer.inPoint=.5;f.mediaLayer.outPoint=2;f.mediaLayer.stretch=80;f.select=function(...items){for(const item of f.items)item.selected=items.includes(item);};f.undo=[];f.context.app.beginUndoGroup=n=>f.undo.push('begin');f.context.app.endUndoGroup=()=>f.undo.push('end');return f;}
function image(f){return{source:f.root.source,comment:f.root.comment,start:f.root.startTime,in:f.root.inPoint,out:f.root.outPoint,keys:JSON.stringify(f.root.property('ADBE Time Remapping').keys),expression:f.root.property('ADBE Time Remapping').expression,transform:JSON.stringify(f.root.property('ADBE Transform Group'))};}

test('ordinary layer source replacement restores recentered anchors and writable layer timing',()=>{
 for(const keyed of [false,true]){
  const f=host(),layer=f.mediaLayer,next=new f.target.constructor('Short replacement'),anchor=layer.property('ADBE Transform Group').property('ADBE Anchor Point');
  assert.equal(typeof f.api.replaceLayerSource,'function');anchor.setValue([836,470.5]);anchor.canSetExpression=true;anchor.expression='value+[1,2]';anchor.expressionEnabled=true;
  if(keyed){anchor.setValueAtTime(.5,[836,470.5]);anchor.setValueAtTime(2,[800,400]);}
  layer.outPoint=8;const before={value:Array.from(anchor.value),keys:JSON.stringify(anchor.keys),expression:anchor.expression,start:layer.startTime,inside:layer.inPoint,outside:layer.outPoint,stretch:layer.stretch};
  const rebind=layer.replaceSource;layer.replaceSource=function(item){rebind.call(this,item);anchor.value=[320,180];for(const key of anchor.keys)key.value=[320,180];this.outPoint=3.25;};
  f.api.replaceLayerSource(layer,next);assert.equal(layer.source,next);assert.deepEqual([layer.startTime,layer.inPoint,layer.outPoint,layer.stretch],[before.start,before.inside,before.outside,before.stretch]);assert.equal(anchor.expression,before.expression);assert.equal(anchor.expressionEnabled,true);
  if(keyed)assert.equal(JSON.stringify(anchor.keys),before.keys);else assert.deepEqual(Array.from(anchor.value),before.value);assert.deepEqual(f.undo,[],'caller owns the only Undo group');
 }
});
test('shorter non-remapped sources retain native out-point limits without extending the source or enabling remap',()=>{
 const f=host(),layer=f.mediaLayer,next=new f.target.constructor('Three-second composition');next.duration=3;
 const anchor=layer.property('ADBE Transform Group').property('ADBE Anchor Point');anchor.setValue([627,627]);layer.stretch=100;layer.outPoint=8;layer.timeRemapEnabled=false;
 let end=layer.outPoint,replaced=false;
 Object.defineProperty(layer,'outPoint',{configurable:true,get:()=>end,set:value=>{end=replaced&&!layer.timeRemapEnabled?Math.min(value,layer.startTime+next.duration):value;}});
 const rebind=layer.replaceSource;layer.replaceSource=function(item){rebind.call(this,item);replaced=true;anchor.setValue([320,180]);this.outPoint=end;};
 f.api.replaceLayerSource(layer,next);
 assert.equal(layer.source,next);assert.equal(next.duration,3);assert.equal(layer.timeRemapEnabled,false);assert.equal(layer.outPoint,3.25);assert.equal(layer.inPoint,.5);assert.equal(layer.startTime,.25);assert.deepEqual(Array.from(anchor.value),[627,627]);
});
test('unchanged native root Time Remap is not rewritten by a media source swap',()=>{
 const f=host(),next=f.footage('next.png'),clock=f.root.property('ADBE Time Remapping');
 clock.onKeyWrite=()=>{throw Error('Unchanged native remap was rewritten');};f.select(next);
 assert.doesNotThrow(()=>f.api.replaceSelectedMedia(f.root,f.mediaLayer.id,{undoGroup:false}));
});
test('native replaceSource dimension adjustment does not change a static media Anchor Point',()=>{
 const f=host(),next=new f.target.constructor('OWN smaller scene'),anchor=f.mediaLayer.property('ADBE Transform Group').property('ADBE Anchor Point');anchor.setValue([836,470.5]);
 const proto=f.mediaLayer.constructor.prototype,rebind=proto.replaceSource;
 proto.replaceSource=function(item){rebind.call(this,item);if(this.name==='OWN MEDIA')this.property('ADBE Transform Group').property('ADBE Anchor Point').setValue([640,360]);};
 f.select(next);const receipt=f.api.replaceSelectedMedia(f.root,f.mediaLayer.id,{undoGroup:false});
 assert.deepEqual(Array.from(f.root.source.layer(receipt.layerIndex).property('ADBE Transform Group').property('ADBE Anchor Point').value),[836,470.5]);
});
test('changed native Time Remap restoration applies interpolation after ease setters',()=>{
 const f=host(),next=f.footage('next.png'),clock=f.root.property('ADBE Time Remapping');
 clock.keys=[{t:1,value:0,inType:6612,outType:6612},{t:2,value:2.4024024024024,inType:6612,outType:6612}];
 const P=clock.constructor;P.prototype.keyInInterpolationType=function(i){return this.keys[i-1].inType;};P.prototype.keyOutInterpolationType=function(i){return this.keys[i-1].outType;};
 P.prototype.keyInTemporalEase=function(){return[{speed:0,influence:33.333}];};P.prototype.keyOutTemporalEase=P.prototype.keyInTemporalEase;
 P.prototype.setInterpolationTypeAtKey=function(i,a,b){Object.assign(this.keys[i-1],{inType:a,outType:b});};
 P.prototype.setTemporalEaseAtKey=function(i){Object.assign(this.keys[i-1],{inType:6613,outType:6613});};
 const before=JSON.stringify(clock.keys),rebind=f.root.replaceSource;let first=true;
 f.root.replaceSource=function(item){rebind.call(this,item);if(first){first=false;clock.keys[1].value=1;}};
 f.select(next);f.api.replaceSelectedMedia(f.root,f.mediaLayer.id,{undoGroup:false});assert.equal(JSON.stringify(clock.keys),before);
});
test('project replacement context is typed, serializable and read-only for zero/one/multiple selections',()=>{const f=host(),before=image(f);assert.equal(typeof f.api.mediaContext,'function');let c=f.api.mediaContext(f.root,{layerId:f.mediaLayer.id});assert.equal(c.canReplace,false);assert.equal(c.errorCode,'PROJECT_SELECTION_COUNT');const next=f.footage('after.png');f.select(next);c=f.api.mediaContext(f.root,{layerId:f.mediaLayer.id});assert.equal(c.canReplace,true);assert.equal(c.projectSelection.items[0].type,'footage');assert.equal(c.projectSelection.items[0].mediaKind,'visual');assert.equal(c.context.expectedItemId,next.id);assert.equal(c.context.expectedSourceItemId,f.root.source.id);assert.ok(JSON.stringify(c).length<10000);f.select(next,f.mediaLayer.source);assert.equal(f.api.mediaContext(f.root,{layerId:f.mediaLayer.id}).canReplace,false);assert.deepEqual(image(f),before);assert.deepEqual(f.undo,[]);});
test('selected media replacement isolates shared source and preserves root/target keys expressions transforms and timing',()=>{const f=host(),source=f.root.source,peer=f.target.layers.add(source),before=image(f),old=f.mediaLayer,position=old.property('ADBE Transform Group').property('ADBE Position');position.keys=[{t:.1,value:[3,7]},{t:1,value:[20,90]}];position.expression='value+[1,2]';position.expressionEnabled=true;const targetKeys=JSON.stringify(position),next=f.footage('after.png');f.select(next);const context=f.api.mediaContext(f.root,{layerId:old.id}).context,r=f.api.replaceSelectedMedia(f.root,old.id,context);assert.equal(r.replaced,true);assert.equal(peer.source,source);assert.equal(source.layer(1).source,old.source);assert.notEqual(f.root.source,source);const target=f.root.source.layer(r.layerIndex);assert.equal(target.source,next);assert.deepEqual([target.startTime,target.inPoint,target.outPoint,target.stretch],[.25,.5,2,80]);assert.equal(JSON.stringify(target.property('ADBE Transform Group').property('ADBE Position')),targetKeys);const changed=JSON.parse(f.root.comment.split("|").slice(1).join("|"));assert.equal(changed.mediaBindings.length,1);delete changed.mediaBindings;assert.deepEqual(changed,JSON.parse(before.comment.split("|").slice(1).join("|")));assert.deepEqual({...image(f),source:before.source,comment:before.comment},before);assert.deepEqual(f.undo,['begin','end']);});
test('stale selection/source and locked targets reject before duplicating or beginning Undo',()=>{const f=host(),next=f.footage('next.png'),other=f.footage('other.png');f.select(next);const context=f.api.mediaContext(f.root,{layerId:f.mediaLayer.id}).context,before=image(f),count=f.items.length;f.select(other);assert.throws(()=>f.api.replaceSelectedMedia(f.root,f.mediaLayer.id,context),e=>e.code==='PROJECT_SELECTION_CHANGED');f.select(next);f.root.locked=true;assert.throws(()=>f.api.replaceSelectedMedia(f.root,f.mediaLayer.id,context),e=>e.code==='LAYER_LOCKED');f.root.locked=false;assert.throws(()=>f.api.replaceSelectedMedia(f.root,f.mediaLayer.id,{...context,expectedSourceItemId:-1}),e=>e.code==='MEDIA_CONTEXT_CHANGED');assert.equal(f.items.length,count);assert.deepEqual(image(f),before);assert.deepEqual(f.undo,[]);});
test('folders, audio-only visual replacements and recursive compositions are rejected before writes',()=>{const f=host(),audio=f.footage('sound.wav',false,true),before=image(f),count=f.items.length;f.select(audio);assert.throws(()=>f.api.replaceSelectedMedia(f.root,f.mediaLayer.id),e=>e.code==='MEDIA_KIND_MISMATCH');const folder={id:999999,name:'Folder',selected:true};f.items.push(folder);f.select(folder);assert.equal(f.api.projectSelection().items[0].type,'unsupported');assert.throws(()=>f.api.replaceSelectedMedia(f.root,f.mediaLayer.id),e=>e.code==='MEDIA_ITEM_UNSUPPORTED');f.select(f.target);assert.throws(()=>f.api.replaceSelectedMedia(f.root,f.mediaLayer.id),e=>e.code==='MEDIA_CYCLE');assert.equal(f.items.length,count+1);assert.deepEqual(image(f),before);assert.deepEqual(f.undo,[]);});
test('native target replacement throw after mutation leaves original graph unchanged and removes staging source',()=>{const f=host(),next=f.footage('after.png'),before=image(f),count=f.items.length,original=f.user.constructor.prototype.replaceSource;f.user.constructor.prototype.replaceSource=function(item){original.call(this,item);if(this.name==='OWN MEDIA'&&item===next)throw Error('Injected native replacement failure');};f.select(next);assert.throws(()=>f.api.replaceSelectedMedia(f.root,f.mediaLayer.id),/Injected native/);assert.equal(f.items.length,count);assert.deepEqual(image(f),before);assert.deepEqual(f.undo,['begin','end']);});
test('root commit throw after rebind rolls back source and full custom Time Remap without fake success',()=>{const f=host(),next=f.footage('after.png'),before=image(f),count=f.items.length,original=f.root.replaceSource;let injected=false;f.root.replaceSource=function(item){original.call(this,item);if(item!==before.source&&!injected){injected=true;this.startTime=40;this.inPoint=41;this.outPoint=42;this.property('ADBE Time Remapping').expression='wrong';throw Error('Injected root commit failure');}};f.select(next);assert.throws(()=>f.api.replaceSelectedMedia(f.root,f.mediaLayer.id),/Injected root commit/);assert.deepEqual(image(f),before);assert.equal(f.items.length,count);});
test('same-source selection is a read-only no-op and facade can own the only Undo group',()=>{const f=host(),before=image(f);f.select(f.mediaLayer.source);assert.equal(f.api.replaceSelectedMedia(f.root,f.mediaLayer.id).replaced,false);assert.deepEqual(image(f),before);assert.deepEqual(f.undo,[]);const next=f.footage('after.png');f.select(next);f.api.replaceSelectedMedia(f.root,f.mediaLayer.id,{undoGroup:false});assert.deepEqual(f.undo,[]);});
test('typed composition replacement is allowed when acyclic and selected media is revalidated at commit',()=>{const f=host(),item=new f.target.constructor('OWN replacement scene');f.select(item);assert.equal(f.api.projectSelection().items[0].type,'composition');const context=f.api.mediaContext(f.root,{layerId:f.mediaLayer.id}).context;assert.equal(f.api.preflightMediaReplacement(f.root,f.mediaLayer.id,item,context).itemId,item.id);const r=f.api.replaceSelectedMedia(f.root,f.mediaLayer.id,context);assert.equal(f.root.source.layer(r.layerIndex).source,item);});

test('audio-only slots accept audio-only footage and reject visuals before mutation',()=>{const f=host(),old=f.footage('old.wav',false,true),next=f.footage('next.wav',false,true);f.mediaLayer.source=old;f.select(next);const r=f.api.replaceSelectedMedia(f.root,f.mediaLayer.id,{undoGroup:false});assert.equal(f.root.source.layer(r.layerIndex).source,next);const before=image(f),visual=f.footage('image.png');f.select(visual);assert.throws(()=>f.api.replaceSelectedMedia(f.root,r.layerId),e=>e.code==='MEDIA_KIND_MISMATCH');assert.deepEqual(image(f),before);});
test('media context rejects replaced source ownership and direct replacement rejects foreign project handles',()=>{const f=host(),next=f.footage('after.png'),before=image(f),foreign={id:next.id,name:next.name,hasVideo:true};assert.throws(()=>f.api.replaceMedia(f.root,f.mediaLayer.id,foreign),e=>e.code==='MEDIA_NOT_FOUND');const originalComment=f.root.source.comment;f.root.source.comment='User owned composition';assert.throws(()=>f.api.mediaContext(f.root,{layerId:f.mediaLayer.id}),e=>e.code==='SOURCE_NOT_OWNED');f.root.source.comment=originalComment;assert.deepEqual(image(f),before);assert.deepEqual(f.undo,[]);});

test('a replaced composition remains an explicit editable slot across repeated replacements',()=>{
 const f=host(),scene=new f.target.constructor('Own replacement scene');f.select(scene);
 const first=f.api.replaceSelectedMedia(f.root,f.mediaLayer.id,{undoGroup:false}),row=f.api.media(f.root).find(x=>x.layerId===first.layerId);
 assert.ok(row);assert.equal(row.type,'composition');assert.ok(row.slotId);
 const next=f.footage('after-again.png');f.select(next);assert.equal(f.api.mediaContext(f.root,{layerId:first.layerId}).canReplace,true);
 const second=f.api.replaceSelectedMedia(f.root,first.layerId,{undoGroup:false});
 assert.equal(f.api.media(f.root).find(x=>x.layerId===second.layerId).slotId,row.slotId);
 assert.equal(f.root.source.layer(second.layerIndex).source,next);
});
test('unchanged fractional reverse timing is not written again during source replacement',()=>{
 const f=host(),old=f.footage('old.wav',false,true),next=f.footage('next.wav',false,true);f.mediaLayer.source=old;f.mediaLayer.stretch=-188.77;f.mediaLayer.startTime=3.06961127794461;
 const proto=f.mediaLayer.constructor.prototype,replace=proto.replaceSource,writes=[];
 proto.replaceSource=function(item){replace.call(this,item);if(this.name==='OWN MEDIA')for(const key of ['stretch','startTime','inPoint','outPoint']){let value=this[key];Object.defineProperty(this,key,{configurable:true,get:()=>value,set:v=>{writes.push(key);value=v}})}};
 f.select(next);f.api.replaceSelectedMedia(f.root,f.mediaLayer.id,{undoGroup:false});assert.deepEqual(writes,[]);
});
function soundHost(savedPath){const f=host();if(savedPath)f.context.app.project.file={fsName:savedPath};f.context.$.cpAudio={importFile:key=>f.footage(key+'.wav',false,true)};f.root=f.api.apply(f.target,{id:'1d6d'},{time:4},'').layers[0];return f;}
test('same-project saved and unsaved serialize/paste retain explicit native sound bindings',()=>{
 for(const savedPath of [null,'C:/owned/current.aep']){
  const f=soundHost(savedPath),next=f.footage('personal-replacement.wav',false,true),slot=f.api.media(f.root)[0];f.select(next);f.api.replaceSelectedMedia(f.root,slot.layerId,{undoGroup:false});
  const data=JSON.parse(JSON.stringify(f.api.serialize(f.root)));assert.equal(data.mediaBindings.schemaVersion,1);assert.equal(data.mediaBindings.project.savedProjectPath,savedPath);
  const pasted=f.api.paste(f.target,data,{time:6},'').layers[0];assert.ok(f.api.media(pasted).some(row=>row.itemId===next.id));
 }
});
test('foreign project or changed binding item kind rejects before generating any preset source',()=>{
 for(const mode of ['saved','unsaved','kind']){
  const f=soundHost(mode==='saved'?'C:/owned/current.aep':null),next=f.footage('personal.wav',false,true),slot=f.api.media(f.root)[0];f.select(next);f.api.replaceSelectedMedia(f.root,slot.layerId,{undoGroup:false});
  const data=JSON.parse(JSON.stringify(f.api.serialize(f.root))),count=f.items.length,writes=f.writes.length;
  if(mode==='saved')f.context.app.project.file={fsName:'C:/owned/other.aep'};
  else if(mode==='unsaved')f.context.app.project={...f.context.app.project};
  else next.hasVideo=true;
  assert.throws(()=>f.api.paste(f.target,data,{time:6},''),e=>/^MEDIA_BINDING_/.test(e.code));assert.equal(f.items.length,count);assert.equal(f.writes.length,writes);
 }
});
test('unsaved project binding tokens survive module reload and missing items fail before apply',()=>{
 const f=soundHost(),next=f.footage('personal.wav',false,true),slot=f.api.media(f.root)[0];f.select(next);f.api.replaceSelectedMedia(f.root,slot.layerId,{undoGroup:false});
 const data=JSON.parse(JSON.stringify(f.api.serialize(f.root)));f.api=f.reload();
 assert.ok(f.api.media(f.api.paste(f.target,data,{time:6},'').layers[0]).some(row=>row.itemId===next.id));
 f.items.splice(f.items.indexOf(next),1);const count=f.items.length,writes=f.writes.length;
 assert.throws(()=>f.api.paste(f.target,data,{time:6},''),e=>e.code==='MEDIA_BINDING_MISSING');assert.equal(f.items.length,count);assert.equal(f.writes.length,writes);
});
test('restored sound bindings do not require the default local recording to be available',()=>{
 const f=soundHost(),next=f.footage('personal.wav',false,true),slot=f.api.media(f.root)[0];f.select(next);f.api.replaceSelectedMedia(f.root,slot.layerId,{undoGroup:false});
 const data=JSON.parse(JSON.stringify(f.api.serialize(f.root)));f.context.$.cpAudio.importFile=()=>null;
 const result=f.api.paste(f.target,data,{time:6},''),root=result.layers[0],rows=f.api.media(root);
 assert.ok(rows.some(row=>row.itemId===next.id));assert.equal(rows.length,1);
 assert.equal(result.missingAudio.length,1);assert.equal(f.api.instances(root)[0].missingAudio.length,1);
 assert.equal(result.warnings.length,1);
});
test('bindings remain locatable after a private source duration transaction',()=>{
 const f=host(),scene=new f.target.constructor('Own scene');f.select(scene);f.api.replaceSelectedMedia(f.root,f.mediaLayer.id,{undoGroup:false});
 const slot=f.api.media(f.root)[0],duration=f.api.controls([f.root]).find(c=>c.name==='Duration');f.api.setControl(f.root,duration.id,4);
 const after=f.api.media(f.root).find(x=>x.slotId===slot.slotId);assert.ok(after);assert.equal(after.itemId,scene.id);
});
test('user-added visual graphs cannot silently disappear from a saved preset paste',()=>{
 const f=host(),scene=new f.target.constructor('Own scene');f.select(scene);f.api.replaceSelectedMedia(f.root,f.mediaLayer.id,{undoGroup:false});
 const data=JSON.parse(JSON.stringify(f.api.serialize(f.root))),count=f.items.length,writes=f.writes.length;
 assert.throws(()=>f.api.paste(f.target,data,{time:6},''),e=>e.code==='MEDIA_BINDING_SLOT_UNAVAILABLE');assert.equal(f.items.length,count);assert.equal(f.writes.length,writes);
});
test('binding metadata commit failure restores original root source and removes only staging',()=>{
 const f=host(),next=f.footage('after.png'),before=image(f),count=f.items.length;let comment=f.root.comment;
 Object.defineProperty(f.root,'comment',{get:()=>comment,set:value=>{if(value.includes('"mediaBindings"'))throw Error('binding commit failure');comment=value}});
 f.select(next);assert.throws(()=>f.api.replaceSelectedMedia(f.root,f.mediaLayer.id,{undoGroup:false}),/binding commit failure/);
 assert.deepEqual(image(f),before);assert.equal(f.items.length,count);
});
