
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function controller(items,audio=false,response){
 const nodes=[];function node(tag){const listeners={};const n={tagName:tag,children:[],dataset:{},style:{},classList:{add(){},remove(){},toggle(){}},value:'',appendChild(c){this.children.push(c);return c;},setAttribute(){},addEventListener(name,fn){listeners[name]=fn;},querySelectorAll(){return[];},querySelector(){return null;},pause(){},load(){},removeAttribute(){},remove(){},showModal(){},close(){if(listeners.close)listeners.close();}};nodes.push(n);return n;}
 const calls=[],state={context:{projectKey:'p',projectToken:'t',compositionId:7,layerIds:[8]}},scope={ContentriumCore:require('../ui-core.js'),ContentriumLibrary:require('../ui-library.js')};
 const audioSettings={pitchShift:12,reverse:true};
 if(audio){scope.ContentriumAudio={mount:()=>({getOptions:()=>audioSettings,destroy(){},prepareRender:async()=>{},renderWav:async()=>({})})};scope.ContentriumAudioExport={prepare:async cfg=>{await cfg.call('prepareAudioImport',{id:cfg.itemId,options:{pitchShift:cfg.options.pitchShift,reverse:cfg.options.reverse},context:cfg.context});return{...cfg.options,renderedAudioPath:'C:/rendered.wav'};}};}
 const sandbox={window:scope,document:{createElement:node,body:node('body')},console};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../ui-workspace.js'),'utf8'),sandbox);
 const api=scope.ContentriumWorkspace.create({libraryRoot:node('root'),libraryVisible:audio,getState:()=>state,supports:()=>true,status(){},refresh(){},call:async(method,payload)=>{calls.push({method,payload:JSON.parse(JSON.stringify(payload))});if(method==='getLibrary')return{items,folders:[],capabilities:{audioTransforms:true,imageSequence:true,imageSequenceReplace:true}};return response?response(method,payload):{};}});
 return{api,calls,nodes,state};
}
test('audio Replace fails closed before transform and rechecks after pending preparation; Add remains supported',async()=>{
 const item={id:'audio',name:'Sound',kind:'audio',path:'C:/sound.wav',preview:'file:///C:/sound.wav'},h=controller([item],true);await h.api.loadLibrary();await assert.rejects(h.api.replaceLibraryItem('audio',{}));assert.deepEqual(h.calls.map(c=>c.method),['getLibrary']);
 h.state.soundApplyOptions={replaceable:true};await h.api.replaceLibraryItem('audio',{});assert.deepEqual(h.calls.slice(1).map(c=>c.method),['prepareAudioImport','replaceLibraryItem']);
 const changed=controller([item],true,method=>{if(method==='prepareAudioImport')changed.state.soundApplyOptions={replaceable:false};return{};});await changed.api.loadLibrary();changed.state.soundApplyOptions={replaceable:true};await assert.rejects(changed.api.replaceLibraryItem('audio',{}));assert.deepEqual(changed.calls.map(c=>c.method),['getLibrary','prepareAudioImport']);
 await h.api.importLibraryItem('audio',{});assert.equal(h.calls.at(-1).method,'importLibraryItem');
});
test('shared import and replace echo the selected source stamp and retain sequence options',async()=>{
 const stamp={path:'c:/frame001.png',kind:'image-sequence',size:7,modifiedMs:123},h=controller([{id:'seq',kind:'image-sequence',path:'C:/frame001.png',sourceStamp:stamp}]);await h.api.loadLibrary();h.api.setSequenceRate('seq','24');
 await h.api.importLibraryItem('seq',{forceAlphabetical:true});await h.api.replaceLibraryItem('seq',{conformFrameRate:30,forceAlphabetical:false});
 const calls=h.calls.filter(c=>c.method!=='getLibrary');assert.equal(calls.length,2);for(const c of calls){assert.deepEqual(c.payload.sourceStamp,stamp);assert.equal(c.payload.context.compositionId,7);}
 assert.deepEqual(calls[0].payload.options,{conformFrameRate:24,forceAlphabetical:true});assert.deepEqual(calls[1].payload.options,{conformFrameRate:30,forceAlphabetical:false});
});
test('audio prepare and subsequent import echo the same source stamp without losing transforms',async()=>{
 const stamp={path:'c:/sound.wav',kind:'audio',size:7,modifiedMs:123},h=controller([{id:'audio',name:'Sound',kind:'audio',path:'C:/sound.wav',preview:'file:///C:/sound.wav',sourceStamp:stamp}],true);await h.api.loadLibrary();await h.api.importLibraryItem('audio',{customOption:'retain'});
 const calls=h.calls.filter(c=>c.method!=='getLibrary');assert.deepEqual(calls.map(c=>c.method),['prepareAudioImport','importLibraryItem']);for(const c of calls){assert.deepEqual(c.payload.sourceStamp,stamp);assert.equal(c.payload.options.pitchShift,12);assert.equal(c.payload.options.reverse,true);}
 assert.equal(calls[1].payload.options.renderedAudioPath,'C:/rendered.wav');assert.equal(calls[1].payload.options.customOption,'retain');
});


test('AEP chooser retains the original source stamp across a later library refresh',async()=>{
 const stamp={path:'c:/source.aep',kind:'project',size:7,modifiedMs:123},items=[{id:'project',kind:'project',path:'C:/source.aep',sourceStamp:stamp}];
 const h=controller(items,false,(method,payload)=>payload.options.compositionId?{placed:true}:{requiresComposition:true,importId:'owned-import',compositions:[{id:91,name:'Scene'}]});await h.api.loadLibrary();
 const pending=h.api.replaceLibraryItem('project',{keepTransform:true});await new Promise(setImmediate);
 const dialog=h.nodes.find(n=>n.tagName==='dialog');assert.ok(dialog);const select=dialog.children.find(n=>n.tagName==='select');select.value='91';
 items[0]={...items[0],sourceStamp:{...stamp,modifiedMs:456}};await h.api.loadLibrary();dialog.children.at(-1).children[1].onclick();await pending;
 const calls=h.calls.filter(c=>c.method==='replaceLibraryItem');assert.equal(calls.length,2);assert.deepEqual(calls[1].payload.sourceStamp,stamp);assert.equal(calls[1].payload.options.importId,'owned-import');assert.equal(calls[1].payload.options.compositionId,91);assert.equal(calls[1].payload.options.keepTransform,true);
});

