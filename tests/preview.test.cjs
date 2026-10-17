const test=require('node:test'),assert=require('node:assert/strict');
const preview=require('../preview.js');
test('preview subjects follow catalog category paths rather than names or shared numeric types',()=>{
 const catalog=require('../library/catalog.json'),counts={};
 for(const entry of catalog.entries){const kind=preview.subjectFor(entry).kind;counts[kind]=(counts[kind]||0)+entry.variants.length;}
 assert.deepEqual(counts,{object:50,text:25,title:6,scene:26,shape:3});
 assert.equal(preview.subjectFor({name:'Camera Text',category:['Animation Presets','Motion Presets']}).kind,'object');
 assert.equal(preview.subjectFor({name:'Motion',category:['Transitions','Camera']}).kind,'scene');
 assert.equal(preview.subjectFor({name:'Title Camera',category:[]}).kind,'unknown');
});
test('text fallback paints glyphs without drawing any image while object fallback draws only its transparent logo',()=>{
 function context(){const draws=[],drawArgs=[],texts=[];return{draws,drawArgs,texts,save(){},restore(){},clearRect(){},fillRect(){},translate(){},rotate(){},scale(){},fillText(text){texts.push(text);},drawImage(image,...args){draws.push(image);drawArgs.push(args);}};}
 const logo={width:480,height:240},before={width:1280,height:720},after={width:1280,height:720},resources={logo,before,after};
 const text=context();preview.renderFallback(text,{category:['Animation Presets','Text Presets']},null,0,resources);
 assert.equal(text.draws.length,0);assert.equal(text.texts.join(''),'CONTENTRIUM');
 const object=context();preview.renderFallback(object,{category:['Animation Presets','Motion Presets']},null,0,resources);
 assert.deepEqual(object.draws,[logo]);assert.equal(object.texts.length,0);
 assert.deepEqual(object.drawArgs[0],[143.75,84.375,112.5,56.25]);
 const previousDocument=global.document,shadowCalls=[],squareLogo={width:1254,height:1254};
 global.document={createElement(){return{getContext(){return{drawImage(...args){shadowCalls.push(args);},createLinearGradient(){return{addColorStop(){}};},fillRect(){}};}};}};
 try{
  preview.renderFallback(context(),{category:['Animation Presets','Motion Presets']},{kind:'shadow',controls:[{name:'Angle',value:0},{name:'Length',value:600}]},0,{logo:squareLogo});
  assert.equal(Math.max(...shadowCalls.map(args=>args[1]))-143.75,54);
 }finally{if(previousDocument===undefined)delete global.document;else global.document=previousDocument;}
 const scene=context();preview.renderFallback(scene,{category:['Transitions','Camera']},null,0,resources);
 assert.deepEqual(scene.draws,[before]);assert.equal(scene.texts.length,0);
 const afterCut=context();preview.renderFallback(afterCut,{category:['Transitions','Camera']},{kind:'camera',duration:1,cutOffset:.3},.901,resources);
 assert.deepEqual(afterCut.draws,[after]);
});
test('transition cut selects two different authored scene identities without crossfade',()=>{
 const profile={kind:'camera',duration:1,cutOffset:.3,fidelity:'nested-motion-pending'};
 assert.equal(preview.sampleProfile(profile,.899).sceneId,'A');
 assert.equal(preview.sampleProfile(profile,.901).sceneId,'B');
 assert.notDeepEqual(preview.sceneDescription('A'),preview.sceneDescription('B'));
 assert.equal(preview.sampleProfile(profile,.299).mix,undefined);
});
test('sampled profiles preserve explicit variant direction and independent in/out curves',()=>{
 const row=(x)=>[x,0,0,1,1,1,0,1,0];
 const left={kind:'layer',inDuration:1,outDuration:2,samples:{in:[row(-100),row(0)],out:[row(-200),row(0)]}};
 const right={...left,samples:{in:[row(100),row(0)],out:[row(200),row(0)]}};
 const a=preview.sampleProfile(left,3.1),b=preview.sampleProfile(right,3.1);
 assert.ok(a.position[0]<0);assert.ok(b.position[0]>0);
 assert.equal(preview.interpolateRows(left.samples.in,.5)[0],-50);
 assert.ok(Math.abs(preview.sampleProfile(left,1.6).position[0]+100)<1e-10);
});
test('missing/unmeasured profiles never fabricate an animated transform',()=>{
 assert.equal(preview.sampleProfile(null,.5).ready,false);
 assert.equal(preview.sampleProfile({kind:'camera',duration:1,cutOffset:.2},.5).ready,false);
 assert.throws(()=>preview.interpolateRows([[0],[NaN]],.5),/finite/);
});
test('AE-rendered own previews accept only explicit local video assets',()=>{
 assert.equal(preview.renderedSource({}),null);
 assert.equal(preview.renderedSource({renderedPreview:'library/previews/camera left.webm'}),'library/previews/camera%20left.webm');
 for(const source of ['https://example.com/a.mp4','../secret.webm','C:\\a.webm','/a.mp4','library/image.png'])assert.throws(()=>preview.renderedSource({renderedPreview:source}));
});
test('rendered videos pause outside the grid and release their source on unmount',()=>{
 const fs=require('fs'),vm=require('vm'),path=require('path'),videos=[];let callback,disconnected=0;
 const context={window:{},document:{createElement(tag){assert.equal(tag,'video');const video={tagName:'VIDEO',isConnected:true,plays:0,pauses:0,loads:0,setAttribute(){},removeAttribute(name){delete this[name];},play(){this.plays++;return Promise.resolve();},pause(){this.pauses++;},load(){this.loads++;}};videos.push(video);return video;}},IntersectionObserver:class{constructor(cb){callback=cb;}observe(){}unobserve(){}disconnect(){disconnected++;}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../preview.js'),'utf8'),context);
 const api=context.window.ContentriumPreview,wrap={appendChild(){},addEventListener(){}};
 for(let i=0;i<43;i++)api.mount(wrap,{name:'Camera'},{id:'camera'+i,name:'Left',renderedPreview:'library/previews/camera'+i+'.webm'});
 assert.equal(videos.length,43);assert.equal(videos[0].src,'library/previews/camera0.webm');assert.ok(videos.every(v=>v.muted));
 callback(videos.map((video,i)=>({target:video,isIntersecting:i<20})));
 assert.ok(videos.slice(0,20).every(v=>v.plays===1&&v.pauses===0));assert.ok(videos.slice(20).every(v=>v.plays===0&&v.pauses===1));
 callback(videos.map(video=>({target:video,isIntersecting:false})));
 assert.ok(videos.every(v=>v.pauses>=1));
 api.clear();assert.ok(videos.every(v=>v.pauses>=2&&v.src===undefined&&v.loads===1&&v.onerror===null));assert.equal(disconnected,1);
});
test('removing one preview releases only its media and ignores a late visibility notification',()=>{
 const fs=require('fs'),vm=require('vm'),path=require('path'),videos=[],unobserved=[];let callback;
 const context={window:{},document:{createElement(){const video={tagName:'VIDEO',isConnected:true,plays:0,pauses:0,loads:0,setAttribute(){},removeAttribute(name){delete this[name];},play(){this.plays++;return Promise.resolve();},pause(){this.pauses++;},load(){this.loads++;}};videos.push(video);return video;}},IntersectionObserver:class{constructor(cb){callback=cb;}observe(){}unobserve(video){unobserved.push(video);}disconnect(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../preview.js'),'utf8'),context);
 const api=context.window.ContentriumPreview;
 function wrap(){return{children:[],appendChild(child){this.children.push(child);},contains(child){return this.children.includes(child);}};}
 const one=wrap(),two=wrap();api.mount(one,{name:'One'},{id:'1',renderedPreview:'one.webm'});api.mount(two,{name:'Two'},{id:'2',renderedPreview:'two.webm'});
 callback(videos.map(v=>({target:v,isIntersecting:true})));api.unmount(one);
 assert.equal(videos[0].loads,1);assert.equal(videos[0].src,undefined);assert.equal(unobserved[0],videos[0]);
 assert.equal(videos[1].loads,0);assert.equal(videos[1].pauses,0);assert.equal(videos[1].src,'two.webm');
 const plays=videos[0].plays;callback([{target:videos[0],isIntersecting:true}]);assert.equal(videos[0].plays,plays);
 api.setPlaybackActive(false);assert.equal(videos[1].pauses,1);api.clear();assert.equal(videos[0].loads,1);assert.equal(videos[1].loads,1);
});
test('generated profiles cover the catalog and agree with the source API between baked points',()=>{
 const fs=require('fs'),vm=require('vm'),path=require('path'),data=require('../library/preview-profiles.json'),context={$:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../jsx/presets.jsx'),'utf8'),context);
 const source=context.$.cpPresetBuilder,kinds=['position','scale','rotation','opacity','blur'];
 for(const id of Object.keys(data.profiles)){
  const p=data.profiles[id];if(!p.samples||!p.samples.in)continue;
  assert.ok(p.midpointToleranceRatio<=1);
  for(const side of ['in','out'])for(let i=0;i<1024;i++){
   const t=(i+.37)/1024,row=preview.interpolateRows(p.samples[side],t,p.sampleTimes[side]);
   const exact=p.kind==='text'?require('../tools/build-preview-profiles.cjs').textRow(source,id,t,side):kinds.flatMap(k=>source.sample(id,t,k,side));
   exact.forEach((v,j)=>{const tolerance=p.kind==='text'?(j%10===9?.02:data.midpointTolerances[j%10]):data.midpointTolerances[j];assert.ok(Math.abs(v-row[j])<=tolerance*1.05,`${id}/${side}/${j}: ${Math.abs(v-row[j])}`);});
  }
 }
});
test('edge profiles retain their exact pivot and text spring profiles animate per glyph',()=>{
 const p=require('../library/preview-profiles.json').profiles;
 assert.deepEqual(p.ddd.origin,[.5,1]);assert.deepEqual(p.ddf.origin,[0,.5]);assert.deepEqual(p.de1.origin,[1,.5]);assert.deepEqual(p.de3.origin,[.5,0]);
 const a=preview.sampleProfile(p['18c'],p['18c'].outDuration+.6+p['18c'].inDuration*.35);
 assert.equal(a.glyphs.length,11);assert.ok(a.glyphs.some(g=>Math.abs(g[1])>.01));
 assert.notDeepEqual(a.glyphs[0],a.glyphs[10]);assert.equal(preview.sampleProfile(p['17e1'],0).ready,true);
});

function audioFixture(){
 const fs=require('fs'),vm=require('vm'),path=require('path'),media=[],revoked=[];let intersection;
 function events(target){const listeners={};target.addEventListener=(name,fn)=>(listeners[name]||(listeners[name]=new Set())).add(fn);target.removeEventListener=(name,fn)=>listeners[name]&&listeners[name].delete(fn);target.emit=(name)=>Array.from(listeners[name]||[]).forEach(fn=>fn({target}));return target;}
 const win=events({}),doc=events({hidden:false,createElement(tag){assert.ok(['video','audio'].includes(tag));const m=events({tagName:tag.toUpperCase(),isConnected:true,paused:true,ended:false,currentTime:0,duration:4,playbackRate:1,readyState:0,plays:0,pauses:0,loads:0,setAttribute(){},removeAttribute(name){delete this[name];},play(){this.plays++;if(this.rejectPlay)return Promise.reject(new Error('gesture required'));this.paused=false;return Promise.resolve();},pause(){this.pauses++;this.paused=true;},load(){this.loads++;}});media.push(m);return m;}});
 const context={window:win,document:doc,AbortController,URL:{revokeObjectURL(url){revoked.push(url);}},IntersectionObserver:class{constructor(cb){intersection=cb;}observe(){}unobserve(){}disconnect(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../preview.js'),'utf8'),context);
 function mount(id){const wrap={children:[],appendChild(v){this.children.push(v);},contains(v){return this.children.includes(v);}};win.ContentriumPreview.mount(wrap,{id:'entry-'+id,name:'Own '+id},{id,name:id,renderedPreview:'library/previews/'+id+'.webm'});return{wrap,video:media[media.length-1]};}
 return{api:win.ContentriumPreview,media,win,doc,revoked,mount,visibility(video,visible){intersection([{target:video,isIntersecting:visible}]);}};
}
const settleAudio=()=>new Promise(resolve=>setImmediate(resolve));

test('preview sound stays explicitly unavailable or missing without inventing an asset',async()=>{
 const f=audioFixture();f.mount('a');f.api.setAudioSelection({variantId:'a',insertSound:true});
 assert.equal(f.api.getAudioState().status,'unavailable');assert.equal(f.media.filter(m=>m.tagName==='AUDIO').length,0);
 f.api.setAudioResolver(()=>({status:'missing',missing:['own-whoosh','own-whoosh']}));await settleAudio();
 assert.equal(f.api.getAudioState().status,'missing');assert.deepEqual(Array.from(f.api.getAudioState().missing),['own-whoosh']);assert.equal(f.media.length,1);
});

test('only the selected video gets one timeline audio transport and repeated policy reads preserve it',async()=>{
 const f=audioFixture(),a=f.mount('a'),b=f.mount('b');let resolutions=0;
 f.api.setAudioResolver(({variant,signal})=>{resolutions++;assert.equal(variant.id,'a');assert.equal(signal.aborted,false);return{status:'ready',url:'assets/own sound.wav'};});
 a.video.currentTime=1.25;a.video.paused=false;f.api.setAudioSelection({entryId:'entry-a',variantId:'a',insertSound:true});await settleAudio();
 const sound=f.media.find(m=>m.tagName==='AUDIO');assert.ok(sound);assert.equal(sound.src,'assets/own%20sound.wav');assert.equal(f.api.getAudioState().status,'loading');
 sound.readyState=2;sound.emit('loadedmetadata');assert.equal(sound.currentTime,1.25);assert.equal(sound.plays,1);assert.equal(b.video.plays,0);
 f.api.setAudioSelection({entryId:'entry-a',variantId:'a',insertSound:true});assert.equal(resolutions,1);assert.equal(sound.loads,0);assert.equal(f.api.getAudioState().status,'ready');
 const copy=f.api.getAudioState();copy.missing.push('invented');assert.equal(f.api.getAudioState().missing.length,0);
});

test('sound pauses for insertSound off, busy, mute, blur, document hidden, viewport and global playback',async()=>{
 const f=audioFixture(),a=f.mount('a');a.video.paused=false;
 f.api.setAudioResolver(()=>({status:'ready',url:'own.wav'}));f.api.setAudioSelection({variantId:'a',insertSound:true});await settleAudio();
 const sound=f.media.find(m=>m.tagName==='AUDIO');sound.readyState=2;sound.emit('canplay');assert.equal(sound.paused,false);
 for(const flags of [{busy:true},{muted:true}]){f.api.setAudioSelection(Object.assign({variantId:'a',insertSound:true},flags));assert.equal(sound.paused,true);f.api.setAudioSelection({variantId:'a',insertSound:true});assert.equal(sound.paused,false);}
 f.win.emit('blur');assert.equal(sound.paused,true);f.win.emit('focus');assert.equal(sound.paused,false);
 f.doc.hidden=true;f.doc.emit('visibilitychange');assert.equal(sound.paused,true);f.doc.hidden=false;f.doc.emit('visibilitychange');assert.equal(sound.paused,false);
 f.visibility(a.video,false);assert.equal(sound.paused,true);f.visibility(a.video,true);assert.equal(sound.paused,false);
 f.api.setPlaybackActive(false);assert.equal(sound.paused,true);f.api.setPlaybackActive(true);assert.equal(sound.paused,false);
});

test('video seek, loop, playback rate and an explicit timeline offset control audio without seeking video',async()=>{
 const f=audioFixture(),a=f.mount('a');a.video.currentTime=1;a.video.paused=false;
 f.api.setAudioResolver(()=>({status:'ready',url:'own.wav',offset:.25}));f.api.setAudioSelection({variantId:'a',insertSound:true});await settleAudio();
 const sound=f.media.find(m=>m.tagName==='AUDIO');sound.duration=2;sound.readyState=2;sound.emit('canplay');assert.equal(sound.currentTime,.75);
 a.video.currentTime=1.5;a.video.playbackRate=2;a.video.emit('seeked');assert.equal(sound.currentTime,1.25);assert.equal(sound.playbackRate,2);assert.equal(a.video.currentTime,1.5);
 a.video.currentTime=.05;a.video.emit('timeupdate');assert.equal(sound.paused,true);assert.equal(sound.currentTime,0);
 a.video.currentTime=2.8;a.video.emit('timeupdate');assert.equal(sound.paused,true);
 a.video.currentTime=.75;a.video.emit('timeupdate');assert.equal(sound.currentTime,.5);assert.equal(sound.paused,false);
 a.video.paused=true;a.video.emit('pause');assert.equal(sound.paused,true);
});

test('changing selection aborts stale loads and releases only owned blob sources',async()=>{
 const f=audioFixture(),a=f.mount('a'),b=f.mount('b');let oldResolve,oldSignal;
 f.api.setAudioResolver(({variant,signal})=>variant.id==='a'?new Promise(resolve=>{oldResolve=resolve;oldSignal=signal;}):({status:'ready',url:'file:///C:/UserAudio/own.wav'}));
 f.api.setAudioSelection({variantId:'a',insertSound:true});await settleAudio();f.api.setAudioSelection({variantId:'b',insertSound:true});await settleAudio();
 assert.equal(oldSignal.aborted,true);oldResolve({status:'ready',url:'blob:old-owned',revokeOnRelease:true});await settleAudio();
 assert.deepEqual(f.revoked,['blob:old-owned']);assert.equal(f.media.filter(m=>m.tagName==='AUDIO').length,1);assert.equal(f.api.getAudioState().variantId,'b');
 const sound=f.media.find(m=>m.tagName==='AUDIO');f.api.unmount(b.wrap);assert.equal(sound.src,undefined);assert.equal(sound.loads,1);assert.equal(f.api.getAudioState().status,'unavailable');assert.equal(a.video.src,'library/previews/a.webm');
});

test('load failure and autoplay rejection stay visible and cleanup never releases the video',async()=>{
 const f=audioFixture(),a=f.mount('a');a.video.paused=false;f.api.setAudioResolver(()=>({status:'ready',url:'own.wav'}));f.api.setAudioSelection({variantId:'a',insertSound:true});await settleAudio();
 const sound=f.media.find(m=>m.tagName==='AUDIO');sound.rejectPlay=true;sound.readyState=2;sound.emit('canplay');await settleAudio();assert.equal(f.api.getAudioState().status,'blocked');
 sound.emit('error');assert.equal(f.api.getAudioState().status,'failed');assert.equal(sound.src,undefined);assert.equal(sound.loads,1);assert.equal(a.video.src,'library/previews/a.webm');
 f.api.clear();assert.equal(sound.loads,1);assert.equal(f.api.getAudioState().status,'disabled');
});

test('resolver failures and remote sources cannot silently become a successful sound preview',async()=>{
 const f=audioFixture();f.mount('a');f.api.setAudioResolver(()=>({status:'ready',url:'https://example.com/unknown.wav'}));f.api.setAudioSelection({variantId:'a',insertSound:true});await settleAudio();
 assert.equal(f.api.getAudioState().status,'failed');assert.equal(f.media.filter(m=>m.tagName==='AUDIO').length,0);
 f.api.setAudioResolver(()=>Promise.reject(new Error('UserAudio missing')));await settleAudio();assert.equal(f.api.getAudioState().status,'failed');assert.match(f.api.getAudioState().message,/UserAudio missing/);
});

test('unchanged policy never seeks a playing sound or retries blocked autoplay implicitly',async()=>{
 const f=audioFixture(),a=f.mount('a');a.video.paused=false;a.video.currentTime=1;
 f.api.setAudioResolver(()=>({status:'ready',url:'own.wav'}));f.api.setAudioSelection({variantId:'a',insertSound:true});await settleAudio();
 const sound=f.media.find(m=>m.tagName==='AUDIO');let clock=0,writes=0;Object.defineProperty(sound,'currentTime',{get(){return clock;},set(v){clock=v;writes++;}});
 sound.readyState=2;sound.emit('canplay');const initialWrites=writes;f.api.setAudioSelection({variantId:'a',insertSound:true});assert.equal(writes,initialWrites);
 sound.rejectPlay=true;sound.paused=true;a.video.emit('play');await settleAudio();const rejectedPlays=sound.plays;
 assert.equal(f.api.getAudioState().status,'blocked');f.api.setAudioSelection({variantId:'a',insertSound:true});assert.equal(sound.plays,rejectedPlays);
});

test('initial unfocused document cannot start sound until its real focus event',async()=>{
 const f=audioFixture(),a=f.mount('a');a.video.paused=false;f.doc.hasFocus=()=>false;
 f.api.setAudioResolver(()=>({status:'ready',url:'own.wav'}));f.api.setAudioSelection({variantId:'a',insertSound:true});await settleAudio();
 const sound=f.media.find(m=>m.tagName==='AUDIO');sound.readyState=2;sound.emit('canplay');assert.equal(sound.plays,0);
 f.win.emit('focus');assert.equal(sound.plays,1);
});

test('invalid prepared timing revokes an owned blob and never opens an audio element',async()=>{
 const f=audioFixture();f.mount('a');f.api.setAudioResolver(()=>({status:'ready',url:'blob:invalid-clock',offset:NaN,revokeOnRelease:true}));f.api.setAudioSelection({variantId:'a',insertSound:true});await settleAudio();
 assert.equal(f.api.getAudioState().status,'failed');assert.deepEqual(f.revoked,['blob:invalid-clock']);assert.equal(f.media.filter(m=>m.tagName==='AUDIO').length,0);
});

test('prepared file URLs retain encoded filenames without double escaping percent signs',async()=>{
 const f=audioFixture();f.mount('a');f.api.setAudioResolver(()=>({status:'ready',url:'file:///C:/UserAudio/own%23%20sound.wav'}));f.api.setAudioSelection({variantId:'a',insertSound:true});await settleAudio();
 assert.equal(f.media.find(m=>m.tagName==='AUDIO').src,'file:///C:/UserAudio/own%23%20sound.wav');
});

test('sound state listeners receive changes only and cannot mutate transport state',async()=>{
 const f=audioFixture(),states=[],a=f.mount('a');a.video.paused=false;
 const remove=f.api.setAudioStateListener(state=>{states.push({status:state.status,playing:state.playing});state.missing.push('foreign');});
 f.api.setAudioResolver(()=>({status:'ready',url:'own.wav'}));f.api.setAudioSelection({variantId:'a',insertSound:true});await settleAudio();
 const sound=f.media.find(m=>m.tagName==='AUDIO');sound.readyState=2;sound.emit('canplay');
 assert.ok(states.some(s=>s.status==='loading'));assert.ok(states.some(s=>s.status==='ready'&&s.playing));assert.equal(f.api.getAudioState().missing.length,0);
 const count=states.length;f.api.setAudioSelection({variantId:'a',insertSound:true});assert.equal(states.length,count);
 remove();f.api.setAudioSelection(null);assert.equal(states.length,count);
});

test('a throwing state observer cannot prevent sound loading or cleanup',async()=>{
 const f=audioFixture();f.mount('a');assert.doesNotThrow(()=>f.api.setAudioStateListener(()=>{throw new Error('observer failed');}));
 f.api.setAudioResolver(()=>({status:'ready',url:'own.wav'}));f.api.setAudioSelection({variantId:'a',insertSound:true});await settleAudio();
 assert.equal(f.media.filter(m=>m.tagName==='AUDIO').length,1);assert.doesNotThrow(()=>f.api.clear());assert.equal(f.api.getAudioState().status,'disabled');
});


test('turning sound off aborts a pending resolver and ignores its late result',async()=>{
 const f=audioFixture();f.mount('a');let finish,signal;
 f.api.setAudioResolver(request=>{signal=request.signal;return new Promise(resolve=>{finish=resolve;});});
 f.api.setAudioSelection({variantId:'a',insertSound:true});await settleAudio();
 assert.equal(f.api.getAudioState().status,'loading');
 f.api.setAudioSelection({variantId:'a',insertSound:false});
 assert.equal(f.api.getAudioState().status,'disabled');assert.equal(signal.aborted,true);
 finish({status:'missing',missing:['late.wav']});await settleAudio();
 assert.equal(f.api.getAudioState().status,'disabled');assert.equal(f.api.getAudioState().missing.length,0);assert.equal(f.media.filter(m=>m.tagName==='AUDIO').length,0);
});


test('turning sound off releases a loaded transport and enabling it resolves a fresh source',async()=>{
 const f=audioFixture(),a=f.mount('a');a.video.paused=false;let resolutions=0;
 f.api.setAudioResolver(()=>{resolutions++;return{status:'ready',url:'own.wav'};});
 f.api.setAudioSelection({variantId:'a',insertSound:true});await settleAudio();
 const old=f.media.find(m=>m.tagName==='AUDIO');old.emit('canplay');assert.equal(old.paused,false);
 f.api.setAudioSelection({variantId:'a',insertSound:false});
 assert.equal(old.paused,true);assert.equal(old.src,undefined);assert.equal(old.loads,1);assert.equal(f.api.getAudioState().status,'disabled');
 old.emit('canplay');assert.equal(f.api.getAudioState().status,'disabled');
 f.api.setAudioSelection({variantId:'a',insertSound:true});await settleAudio();
 const sounds=f.media.filter(m=>m.tagName==='AUDIO');assert.equal(resolutions,2);assert.equal(sounds.length,2);sounds[1].emit('canplay');assert.equal(sounds[1].paused,false);assert.equal(old.paused,true);
});
