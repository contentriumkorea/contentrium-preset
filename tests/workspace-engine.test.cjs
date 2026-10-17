const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
function host(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'contentrium-workspace-')),listings=[];
 function Folder(p){if(!(this instanceof Folder))return new Folder(p);this.fsName=path.resolve(p);this.name=path.basename(this.fsName);}
 Object.defineProperties(Folder.prototype,{exists:{get(){return fs.existsSync(this.fsName)&&fs.statSync(this.fsName).isDirectory()}},parent:{get(){return new Folder(path.dirname(this.fsName))}}});
 Folder.prototype.create=function(){fs.mkdirSync(this.fsName,{recursive:true});return true};
 Folder.prototype.remove=function(){fs.rmdirSync(this.fsName);return true};
 Folder.prototype.getFiles=function(){listings.push(this.fsName);return fs.readdirSync(this.fsName).map(n=>{const p=path.join(this.fsName,n);return fs.statSync(p).isDirectory()?new Folder(p):new File(p)})};
 Folder.userData=new Folder(dir);
 function File(p){if(!(this instanceof File))return new File(p);this.fsName=path.resolve(p);this.name=path.basename(this.fsName);}
 Object.defineProperties(File.prototype,{exists:{get(){return fs.existsSync(this.fsName)}},parent:{get(){return new Folder(path.dirname(this.fsName))}},length:{get(){return fs.statSync(this.fsName).size}},modified:{get(){return fs.statSync(this.fsName).mtime}}});
 File.prototype.open=function(mode){this.mode=mode;this.buffer='';return mode==='w'||this.exists};
 File.prototype.read=function(){return fs.readFileSync(this.fsName,'utf8')};
 File.prototype.write=function(v){this.buffer+=v;return true};
 File.prototype.close=function(){if(this.mode==='w')fs.writeFileSync(this.fsName,this.buffer);return true};
 File.prototype.remove=function(){if(this.exists)fs.unlinkSync(this.fsName);return true};
 File.prototype.rename=function(n){const p=path.join(path.dirname(this.fsName),n);fs.renameSync(this.fsName,p);this.fsName=p;this.name=n;return true};
 File.prototype.copy=function(p){fs.copyFileSync(this.fsName,p);return true};
 const imports=[];const $={},context={$,File,Folder,JSON,encodeURI,Math,Date,ImportOptions:function(file){this.file=file;},app:{project:{numItems:0,importFile:options=>{imports.push(options.file.fsName);const item={id:1,file:options.file};if(options.sequence){let rate=30;item.frameRate=rate;item.duration=3/rate;item.mainSource={isStill:false};Object.defineProperty(item.mainSource,'conformFrameRate',{get:()=>rate,set:v=>{rate=v;item.frameRate=v;item.duration=3/v;}});}return item;}}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../jsx/sequence-engine.jsx'),'utf8'),context);
 const file=path.join(__dirname,'../jsx/workspace-engine.jsx');if(fs.existsSync(file))vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
 const api=$.cpWorkspace;if(api)api.configure({json:JSON.stringify,parse:JSON.parse});
 return{api,dir,File,Folder,imports,context,listings,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
test('settings reads do not write data; changes persist after validation',t=>{
 const h=host();t.after(h.cleanup);assert.ok(h.api);
 assert.equal(h.api.getSettings().settings.presetMotionBlurEnabled,true);assert.deepEqual(fs.readdirSync(h.dir),[]);
 assert.throws(()=>h.api.setSettings({key:'presetMotionBlurEnabled',value:'false'}),/boolean/i);
 h.api.setSettings({key:'presetMotionBlurEnabled',value:false});assert.equal(h.api.getSettings().settings.presetMotionBlurEnabled,false);
});
test('AEP source stamps bind canonical path, size, modification time and copy policy without writing',t=>{
 const h=host();t.after(h.cleanup);const file=path.join(h.dir,'Owned.aep');fs.writeFileSync(file,'AEP fixture');
 const stamp=h.api.sourceStamp({path:file,kind:'project'});assert.equal(stamp.path,file.replace(/\\/g,'/').toLowerCase());assert.equal(stamp.size,11);assert.equal(stamp.modifiedMs,fs.statSync(file).mtime.getTime());assert.equal(stamp.copyNextToProject,false);assert.deepEqual(fs.readdirSync(h.dir),['Owned.aep']);
 fs.appendFileSync(file,'changed');assert.notDeepEqual(h.api.sourceStamp({path:file,kind:'project'}),stamp);
 fs.unlinkSync(file);assert.throws(()=>h.api.sourceStamp({path:file,kind:'project'}),e=>e.code==='MEDIA_MISSING');
});
test('folder inventory includes supported media and ignores executable scripts',t=>{
 const h=host();t.after(h.cleanup);assert.ok(h.api);const folder=path.join(h.dir,'source');fs.mkdirSync(folder);
 for(const name of ['image.png','video.mp4','audio.wav','preset.ffx','run.jsx'])fs.writeFileSync(path.join(folder,name),'fixture');
 h.api.addFolder({path:folder});h.api.addFolder({path:folder});const lib=h.api.getLibrary();
 assert.equal(lib.folders.length,1);assert.equal(lib.items.length,4);assert.ok(lib.items.every(x=>x.id&&x.path&&!x.path.endsWith('.jsx')));
 assert.ok(lib.items.every(x=>x.sourceFileSize===7));
 h.api.removeFolder({id:lib.folders[0].id});assert.equal(h.api.getLibrary().items.length,0);assert.equal(fs.readdirSync(folder).length,5);
});
test('invalid workspace data is reported without overwriting original bytes',t=>{
 const h=host();t.after(h.cleanup);assert.ok(h.api);h.api.setSettings({key:'presetMotionBlurEnabled',value:false});
 const file=path.join(h.dir,'Contentrium/Preset/workspace.json');fs.writeFileSync(file,'{broken');
 assert.throws(()=>h.api.getSettings(),/data|JSON|읽|workspace/i);assert.equal(fs.readFileSync(file,'utf8'),'{broken');
});
test('saved independent preset round-trips and only managed removal deletes its file',t=>{
 const h=host();t.after(h.cleanup);assert.ok(h.api);const payload={schemaVersion:2,kind:'overlay',plans:[{variantId:'test',values:{amount:12}}]};
 const saved=h.api.savePreset({name:'My / safe preset',category:'Motion'},payload),item=h.api.getLibrary().items.find(x=>x.id===saved.id);
 assert.ok(item);assert.deepEqual(h.api.readPreset(item.id),payload);assert.ok(fs.existsSync(item.path));
 h.api.removeItem({id:item.id});assert.equal(fs.existsSync(item.path),false);assert.equal(h.api.getLibrary().items.length,0);
});
test('literal percent and hash filenames remain usable library names and preview URLs',t=>{
 const h=host();t.after(h.cleanup);const folder=path.join(h.dir,'media');fs.mkdirSync(folder);
 fs.writeFileSync(path.join(folder,'100% ready #1.png'),'fixture');h.api.addFolder({path:folder});
 const item=h.api.getLibrary().items[0];assert.equal(item.name,'100% ready #1');assert.match(item.preview,/100%25%20ready%20%231\.png$/);
});

test('audio processing imports only the expected persistent WAV for the selected source and transform',t=>{
 const h=host();t.after(h.cleanup);const folder=path.join(h.dir,'audio');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'source.wav'),'source-audio');h.api.addFolder({path:folder});
 const item=h.api.getLibrary().items[0],options={pitchShift:12,reverse:true},plan=h.api.prepareAudioImport({id:item.id,options});
 assert.match(plan.path.replace(/\\/g,'/'),/Contentrium\/Preset\/ProcessedAudio\/audio-[a-z0-9]+\.wav$/);assert.equal(plan.alreadyExists,false);
 assert.throws(()=>h.api.importMedia(item,{...options,renderedAudioPath:item.path}),e=>e.code==='AUDIO_RENDER_REQUIRED');assert.equal(h.imports.length,0);
 const bytes=Buffer.alloc(48);bytes.write('RIFF',0);bytes.write('WAVE',8);fs.writeFileSync(plan.path,bytes);
 const result=h.api.importMedia(item,{...options,renderedAudioPath:plan.path});assert.equal(result.item.file.fsName,path.resolve(plan.path));assert.equal(h.imports.length,1);
 assert.equal(h.api.prepareAudioImport({id:item.id,options}).alreadyExists,true);
 assert.throws(()=>h.api.importMedia(item,{pitchShift:6,reverse:true,renderedAudioPath:plan.path}),e=>e.code==='AUDIO_RENDER_REQUIRED');
 assert.equal(fs.readFileSync(item.path,'utf8'),'source-audio');
});

test('audio transform bounds and corrupt WAV fail without importing or modifying source media',t=>{
 const h=host();t.after(h.cleanup);const folder=path.join(h.dir,'audio');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'source.wav'),'source-audio');h.api.addFolder({path:folder});
 const item=h.api.getLibrary().items[0];for(const pitchShift of [NaN,25,'12'])assert.throws(()=>h.api.prepareAudioImport({id:item.id,options:{pitchShift}}),e=>e.code==='INVALID_AUDIO_TRANSFORM');
 const plan=h.api.prepareAudioImport({id:item.id,options:{pitchShift:12}});fs.writeFileSync(plan.path,'x'.repeat(64));
 assert.throws(()=>h.api.importMedia(item,{pitchShift:12,renderedAudioPath:plan.path}),e=>e.code==='AUDIO_RENDER_INVALID');assert.equal(h.imports.length,0);
});

test('library sequence entries retain individual stills and import actual sequence with native options',t=>{
 const h=host();t.after(h.cleanup);const folder=path.join(h.dir,'sequence');fs.mkdirSync(folder);for(let i=1;i<=3;i++)fs.writeFileSync(path.join(folder,`frame00${i}.png`),'fixture');h.api.addFolder({path:folder});
 const lib=h.api.getLibrary(),seq=lib.items.find(i=>i.kind==='image-sequence');assert.equal(lib.items.length,4);assert.equal(seq.frameCount,3);assert.equal(seq.importable,true);assert.equal(lib.sequenceSchema.range.supported,false);
 const result=h.api.importMedia(seq,{conformFrameRate:24,forceAlphabetical:true});assert.equal(result.receipt.frameCount,3);assert.equal(result.item.frameRate,24);assert.equal(result.receipt.forceAlphabetical,true);assert.equal(h.imports.length,1);
});

test('library discovery supports every sequence schema extension without dropping individual frames',t=>{
 const h=host();t.after(h.cleanup);const folder=path.join(h.dir,'all-sequence-formats');fs.mkdirSync(folder);
 const extensions=Array.from(h.context.$.cpSequence.schema().extensions);
 for(const ext of extensions)for(let i=1;i<=3;i++)fs.writeFileSync(path.join(folder,`frame00${i}.${ext}`),'fixture');
 h.api.addFolder({path:folder});const lib=h.api.getLibrary(),sequences=lib.items.filter(item=>item.kind==='image-sequence');
 assert.equal(sequences.length,extensions.length);assert.equal(lib.items.filter(item=>item.kind==='image').length,extensions.length*3);
 for(const ext of extensions){const sequence=sequences.find(item=>item.path.endsWith('.'+ext));assert.ok(sequence,ext);assert.equal(sequence.frameCount,3);assert.equal(sequence.importable,true);assert.equal(sequence.managed,false);}
});

test('sequence copy uses a new project-local folder and stale source rejects before any file copy',t=>{
 const h=host();t.after(h.cleanup);const folder=path.join(h.dir,'sequence'),project=path.join(h.dir,'project');fs.mkdirSync(folder);fs.mkdirSync(project);for(let i=1;i<=3;i++)fs.writeFileSync(path.join(folder,`frame00${i}.png`),'fixture');h.api.addFolder({path:folder});
 const seq=h.api.getLibrary().items.find(i=>i.kind==='image-sequence');h.api.setSettings({key:'copyUserLibFootageNextToProject',value:true});h.context.app.project.file=new h.File(path.join(project,'test.aep'));
 fs.writeFileSync(path.join(folder,'frame004.png'),'fixture');assert.throws(()=>h.api.importMedia(seq,{}),e=>e.code==='SEQUENCE_STALE');assert.equal(fs.existsSync(path.join(project,'Contentrium Media')),false);fs.unlinkSync(path.join(folder,'frame004.png'));
 const a=h.api.importMedia(seq,{}),b=h.api.importMedia(seq,{});assert.notEqual(a.receipt.copiedFolder,b.receipt.copiedFolder);assert.equal(fs.readdirSync(a.receipt.copiedFolder).length,3);assert.equal(fs.readdirSync(folder).length,3);
});

function catalog(t,names=['alpha.png','middle.wav','zulu.ffx']){
 const h=host();t.after(h.cleanup);h.folder=path.join(h.dir,'catalog');fs.mkdirSync(h.folder);
 for(const name of names)fs.writeFileSync(path.join(h.folder,name),'fixture');
 h.api.addFolder({path:h.folder});h.store=path.join(h.dir,'Contentrium/Preset/workspace.json');return h;
}
test('warm first/middle/last and repeated preset lookup never enumerate the library again',t=>{
 const h=catalog(t),saved=h.api.savePreset({name:'Own'}, {schemaVersion:2,kind:'overlay'});
 const lib=h.api.getLibrary();h.listings.length=0;
 for(const item of lib.items){const found=h.api.find(item.id,item.sourceStamp);assert.equal(found.path,item.path);assert.equal(found.name,item.name);assert.equal(found.category,item.category);}
 assert.equal(h.api.readPreset(saved.id).kind,'overlay');assert.equal(h.api.readPreset(saved.id).kind,'overlay');
 assert.deepEqual(h.listings,[],'warm lookup must perform zero folder listings');
});
test('returned rows and nested sequence metadata cannot mutate the private snapshot',t=>{
 const h=catalog(t,['frame001.png','frame002.png']),lib=h.api.getLibrary(),seq=lib.items.find(i=>i.kind==='image-sequence'),original=seq.path,id=seq.id;
 assert.ok(seq.sourceStamp,'library selection needs a source stamp');assert.equal(seq.sourceStamp.kind,'image-sequence');assert.equal(seq.sourceStamp.path,original.replace(/\\/g,'/').toLowerCase());
 seq.path='C:/forged.png';seq.sourceStamp.path='C:/forged.png';seq.sequence.files[0].path='C:/forged.png';lib.items.length=0;
 const first=h.api.find(id);assert.equal(first.path,original);assert.equal(first.sequence.files[0].path.replace(/\//g,path.sep),original);first.sequence.files.length=0;
 assert.equal(h.api.find(id).sequence.files.length,2);
});
test('explicit refresh discovers additions, renames and deletions while an absent warm ID never rescans',t=>{
 const h=catalog(t,['alpha.png']),a=h.api.getLibrary().items[0];h.listings.length=0;
 fs.renameSync(a.path,path.join(h.folder,'beta.png'));
 assert.throws(()=>h.api.find('absent'),e=>e.code==='LIBRARY_ITEM_MISSING');assert.deepEqual(h.listings,[]);
 fs.writeFileSync(path.join(h.folder,'gamma.png'),'new');const fresh=h.api.getLibrary();assert.deepEqual(Array.from(fresh.items,i=>i.name),['beta','gamma']);assert.equal(h.listings.length,1);
});
test('selected source size, mtime and deletion changes fail closed without automatic scanning',t=>{
 for(const change of ['size','mtime','delete']){
  const h=catalog(t,['alpha.png']),item=h.api.getLibrary().items[0];h.listings.length=0;
  if(change==='size')fs.appendFileSync(item.path,'changed');if(change==='mtime')fs.utimesSync(item.path,100,200);if(change==='delete')fs.unlinkSync(item.path);
  assert.throws(()=>h.api.find(item.id,item.sourceStamp),e=>e.code==='LIBRARY_SOURCE_CHANGED',change);
  assert.throws(()=>h.api.find(item.id),e=>e.code==='LIBRARY_REFRESH_REQUIRED');assert.deepEqual(h.listings,[]);
 }
});
test('old panel stamp is rejected after another refresh but unchanged stamps survive a refresh',t=>{
 const h=catalog(t,['alpha.png']),old=h.api.getLibrary().items[0];h.api.getLibrary();assert.equal(h.api.find(old.id,old.sourceStamp).path,old.path);
 fs.utimesSync(old.path,100,200);const fresh=h.api.getLibrary().items[0];h.listings.length=0;
 assert.throws(()=>h.api.find(old.id,old.sourceStamp),e=>e.code==='LIBRARY_SOURCE_CHANGED');
 assert.equal(h.api.find(fresh.id,fresh.sourceStamp).path,fresh.path);assert.deepEqual(h.listings,[]);
});
test('membership compares registration content rather than workspace size/mtime and ignores settings/property sets',t=>{
 const h=catalog(t,['alpha.png']),item=h.api.getLibrary().items[0];h.listings.length=0;
 h.api.setSettings({key:'pausePreviewWhenInactive',value:false});h.api.savePropertySets('{"owned":[]}');assert.equal(h.api.find(item.id).path,item.path);assert.deepEqual(h.listings,[]);
 const before=fs.statSync(h.store),raw=fs.readFileSync(h.store,'utf8');fs.writeFileSync(h.store,raw.replace('"folder-','"Folder-'));fs.utimesSync(h.store,before.atime,before.mtime);assert.equal(fs.statSync(h.store).size,before.size);
 assert.throws(()=>h.api.find(item.id),e=>e.code==='LIBRARY_REFRESH_REQUIRED');assert.deepEqual(h.listings,[]);
});
test('workspace parse/schema/disappearance errors and failed refresh never fall back to old rows',t=>{
 for(const change of ['parse','schema','delete','listing']){
  const h=catalog(t,['alpha.png']),item=h.api.getLibrary().items[0];h.listings.length=0;
  if(change==='parse')fs.writeFileSync(h.store,'{broken');if(change==='schema')fs.writeFileSync(h.store,'{"schemaVersion":1,"settings":{},"folders":{},"items":[]}');if(change==='delete')fs.unlinkSync(h.store);
  if(change==='listing'){h.Folder.prototype.getFiles=()=>{throw Error('unavailable')};const result=h.api.getLibrary();assert.ok(result.warnings.length);}
  assert.throws(()=>h.api.find(item.id),e=>['INVALID_WORKSPACE_DATA','LIBRARY_REFRESH_REQUIRED'].includes(e.code),change);
 }
});
test('registration changes during a full scan prevent publication until explicit refresh',t=>{
 const h=catalog(t,['alpha.png']),old=h.api.getLibrary().items[0],list=h.Folder.prototype.getFiles;
 h.Folder.prototype.getFiles=function(){const result=list.call(this);const data=JSON.parse(fs.readFileSync(h.store));data.folders[0].id='changed';fs.writeFileSync(h.store,JSON.stringify(data));return result;};
 assert.throws(()=>h.api.getLibrary(),e=>e.code==='LIBRARY_REFRESH_REQUIRED');
 assert.throws(()=>h.api.find(old.id),e=>e.code==='LIBRARY_REFRESH_REQUIRED');
});
test('ambiguous and prototype-like catalog IDs never select a different registered source',t=>{
 const h=catalog(t,['alpha.png','beta.png']);let data=JSON.parse(fs.readFileSync(h.store));
 data.items=[{id:'__proto__',name:'One',kind:'image',path:path.join(h.folder,'alpha.png')},{id:'__proto__',name:'Two',kind:'image',path:path.join(h.folder,'beta.png')}];fs.writeFileSync(h.store,JSON.stringify(data));const lib=h.api.getLibrary();
 assert.ok(lib.items.filter(i=>i.id==='__proto__').every(i=>i.ambiguous));assert.throws(()=>h.api.find('__proto__'),e=>e.code==='LIBRARY_ITEM_AMBIGUOUS');
 data.items.pop();fs.writeFileSync(h.store,JSON.stringify(data));h.api.getLibrary();assert.equal(h.api.find('__proto__').name,'One');
});
test('unavailable file modification metadata is never accepted as a fresh source',t=>{
 const h=catalog(t,['alpha.png']),Original=h.context.File;
 h.context.File=function(p){const file=new Original(p);Object.defineProperty(file,'modified',{value:null});return file;};
 const item=h.api.getLibrary().items[0];assert.ok(item.sourceStamp,'unknown metadata must be explicit');assert.equal(item.sourceStamp.modifiedMs,null);assert.throws(()=>h.api.find(item.id),e=>e.code==='SOURCE_IDENTITY_UNAVAILABLE');
});
test('audio prepare and import reject stale selections without importing the old transformed WAV',t=>{
 const h=catalog(t,['source.wav']),item=h.api.getLibrary().items[0],options={pitchShift:12,reverse:true},plan=h.api.prepareAudioImport({id:item.id,sourceStamp:item.sourceStamp,options});
 const bytes=Buffer.alloc(48);bytes.write('RIFF');bytes.write('WAVE',8);fs.writeFileSync(plan.path,bytes);fs.appendFileSync(item.path,'changed');h.api.getLibrary();h.listings.length=0;
 assert.throws(()=>h.api.prepareAudioImport({id:item.id,sourceStamp:item.sourceStamp,options}),e=>e.code==='LIBRARY_SOURCE_CHANGED');
 assert.throws(()=>h.api.importMedia(item,{...options,renderedAudioPath:plan.path}),e=>e.code==='LIBRARY_SOURCE_CHANGED');assert.deepEqual(h.imports,[]);assert.deepEqual(h.listings,[]);
});
test('source changes during a copy remove only the new target and prevent importing',t=>{
 const h=catalog(t,['alpha.png']),item=h.api.getLibrary().items[0],project=path.join(h.dir,'project');fs.mkdirSync(project);h.context.app.project.file=new h.File(path.join(project,'owned.aep'));h.api.setSettings({key:'copyUserLibFootageNextToProject',value:true});
 const media=path.join(project,'Contentrium Media');fs.mkdirSync(media);fs.writeFileSync(path.join(media,'unrelated.txt'),'keep');const copy=h.File.prototype.copy;
 h.File.prototype.copy=function(target){const result=copy.call(this,target);fs.appendFileSync(this.fsName,'changed');return result;};
 assert.throws(()=>h.api.importMedia(item,{}),e=>e.code==='LIBRARY_SOURCE_CHANGED');assert.deepEqual(h.imports,[]);assert.deepEqual(fs.readdirSync(media),['unrelated.txt']);
});
test('direct Texture references remain usable without current library membership and sequence checks stay local',t=>{
 const h=catalog(t,['frame001.png','frame002.png','frame003.png']),lib=h.api.getLibrary(),seq=lib.items.find(i=>i.kind==='image-sequence');h.api.removeFolder({id:lib.folders[0].id});h.listings.length=0;
 const direct=h.api.importMedia({path:seq.path,kind:'image'},{});assert.ok(direct.item);assert.deepEqual(h.listings,[]);
 const imported=h.api.importMedia(seq,{conformFrameRate:24});assert.equal(imported.receipt.frameCount,3);assert.ok(h.listings.every(p=>p===h.folder),'only selected sequence directory is inspected');
});


test('membership mutations invalidate warmed lookups while a duplicate folder add keeps them warm',t=>{
 for(const mutation of ['add','removeFolder','save','removeItem']){
  const h=catalog(t,['alpha.png']),saved=h.api.savePreset({name:'Saved'}, {kind:'overlay'}),lib=h.api.getLibrary(),item=lib.items.find(i=>i.kind==='image');h.listings.length=0;
  assert.equal(h.api.addFolder({path:h.folder}).existing,true);assert.equal(h.api.find(item.id).path,item.path);
  if(mutation==='add'){const other=path.join(h.dir,'other');fs.mkdirSync(other);h.api.addFolder({path:other});}
  if(mutation==='removeFolder')h.api.removeFolder({id:lib.folders[0].id});
  if(mutation==='save')h.api.savePreset({name:'New'},{kind:'overlay'});
  if(mutation==='removeItem')h.api.removeItem({id:saved.id});
  assert.throws(()=>h.api.find(item.id),e=>e.code==='LIBRARY_REFRESH_REQUIRED');assert.deepEqual(h.listings,[]);
 }
});
test('failed registration commit and managed delete rollback cannot authorize an older snapshot',t=>{
 for(const failure of ['commit','delete','rollback']){
  const h=catalog(t,['alpha.png']),saved=h.api.savePreset({name:'Saved'},{kind:'overlay'}),lib=h.api.getLibrary(),item=lib.items.find(i=>i.kind==='image');h.listings.length=0;
  const rename=h.File.prototype.rename,remove=h.File.prototype.remove;
  h.File.prototype.remove=function(){if(this.fsName===saved.path)return false;return remove.call(this);};
  if(failure==='commit')h.File.prototype.rename=function(name){if(this.name.includes('.tmp-')&&name==='workspace.json')return false;return rename.call(this,name);};
  if(failure==='rollback'){let commits=0;h.File.prototype.rename=function(name){if(this.name.includes('.tmp-')&&name==='workspace.json'&&++commits===2)return false;return rename.call(this,name);};}
  assert.throws(()=>h.api.removeItem({id:saved.id}),e=>['WRITE_FAILED','DELETE_FAILED'].includes(e.code));
  assert.equal(fs.existsSync(saved.path),true);assert.throws(()=>h.api.find(item.id),e=>e.code==='LIBRARY_REFRESH_REQUIRED');assert.deepEqual(h.listings,[]);
  h.File.prototype.rename=rename;h.File.prototype.remove=remove;
  const fresh=h.api.getLibrary();assert.equal(fresh.items.some(i=>i.id===saved.id),failure!=='rollback');assert.equal(h.api.find(item.id).path,item.path);
 }
});
test('normalized registration key order and repeated same-source IDs do not force a new scan',t=>{
 const h=catalog(t,['alpha.png']),data=JSON.parse(fs.readFileSync(h.store)),row={id:'same',name:'Same',kind:'image',path:path.join(h.folder,'alpha.png')};data.items=[row,{...row}];fs.writeFileSync(h.store,JSON.stringify(data));h.api.getLibrary();h.listings.length=0;
 data.folders=data.folders.map(f=>({previewsLocation:f.previewsLocation,path:f.path,id:f.id}));data.items=data.items.map(i=>({path:i.path,kind:i.kind,name:i.name,id:i.id}));fs.writeFileSync(h.store,JSON.stringify(data));
 assert.equal(h.api.find('same').path,row.path);assert.deepEqual(h.listings,[]);
});
test('nested catalog first/middle/last imports reuse the snapshot with zero whole-library listings',t=>{
 const h=catalog(t,[]),expected=[];
 for(let n=0;n<3;n++){const folder=path.join(h.folder,'branch'+n);fs.mkdirSync(folder);for(let i=0;i<50;i++){const file=path.join(folder,'still-'+n+'-'+String(i).padStart(3,'0')+'.psd');fs.writeFileSync(file,'image');expected.push(file);}}
 const library=h.api.getLibrary();assert.equal(library.items.filter(i=>i.kind==='image').length,150);assert.equal(h.listings.length,4);h.listings.length=0;
 const stats=[],Original=h.context.File;h.context.File=function(p){const file=new Original(p);for(const [key,read]of [['length',()=>fs.statSync(file.fsName).size],['modified',()=>fs.statSync(file.fsName).mtime]])Object.defineProperty(file,key,{get(){stats.push(file.fsName);return read();}});return file;};
 const stills=library.items.filter(i=>i.kind==='image');for(const index of [0,74,149]){const selected=stills[index];h.api.importMedia(h.api.find(selected.id,selected.sourceStamp),{});assert.equal(h.imports.at(-1),selected.path);}
 assert.deepEqual(h.listings,[],'three native import preparations must not list any folder');assert.equal(h.imports.length,3);assert.ok(stats.length>0);assert.deepEqual([...new Set(stats)].sort(),h.imports.slice().sort(),'only the three selected sources may receive size/mtime probes');
});


test('a source changed during project-footage lookup is checked again before import or reuse',t=>{
 for(const reuse of [false,true]){
  const h=catalog(t,['alpha.png']),item=h.api.getLibrary().items[0];let changed=false;
  Object.defineProperty(h.context.app.project,'numItems',{get(){if(!changed){fs.appendFileSync(item.path,'changed');changed=true;}return reuse?1:0;}});
  h.context.app.project.item=()=>({id:42,file:new h.File(item.path)});
  assert.throws(()=>h.api.importMedia(item,{}),e=>e.code==='LIBRARY_SOURCE_CHANGED');assert.deepEqual(h.imports,[]);
 }
});

