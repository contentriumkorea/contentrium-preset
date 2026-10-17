(function(scope){
 'use strict';
 var cards=[],videos=[],frame=0,last=0,observer=null,profiles={},loading=null,images={},W=400,H=225,HOLD=.6,playbackActive=true,pausedAt=null;
 var audioResolver=null,audioSelection=null,audioSlot=null,audioGeneration=0,audioFocused=true,audioHooks=[],audioListener=null,audioNotification=null,audioState={status:'disabled',variantId:null,missing:[],message:''};
 function getAudioState(){return Object.assign({},audioState,{missing:audioState.missing.slice(),playing:!!(audioSlot&&audioSlot.audio&&!audioSlot.audio.paused&&audioAllowed(audioSlot))});}
 function notifyAudio(){if(!audioListener)return;var value=getAudioState(),signature=JSON.stringify(value);if(signature===audioNotification)return;audioNotification=signature;try{audioListener(value);}catch(ignore){}}
 function setAudioStateListener(listener){if(listener!==null&&typeof listener!=='function')throw new Error('Preview sound listener must be a function or null');audioListener=listener;audioNotification=null;notifyAudio();return function(){if(audioListener===listener){audioListener=null;audioNotification=null;}};}
 function soundStatus(status,details){audioState=Object.assign({status:status,variantId:audioSelection&&audioSelection.variantId||null,missing:[],message:''},details||{});notifyAudio();}
 function listenAudio(target,name,callback,removers){if(!target||!target.addEventListener)return;target.addEventListener(name,callback);removers.push(function(){target.removeEventListener(name,callback);});}
 function audioGlobalHooks(){
  if(audioHooks.length)return;
  if(typeof document!=='undefined'&&typeof document.hasFocus==='function')audioFocused=document.hasFocus();
  listenAudio(scope,'blur',function(){audioFocused=false;syncAudio();},audioHooks);
  listenAudio(scope,'focus',function(){audioFocused=true;syncAudio();},audioHooks);
  if(typeof document!=='undefined')listenAudio(document,'visibilitychange',function(){syncAudio();},audioHooks);
 }
 function audioUrl(url){
  if(typeof url!=='string'||!url)throw new Error('Preview sound requires an explicit local audio URL');
  if(/^blob:.+/i.test(url))return url;
  if(/^file:\/\/\/[^/]/i.test(url)&&!/[?#]/.test(url))return encodeURI(url).replace(/%25([0-9a-f]{2})/gi,'%$1');
  var path=url.replace(/\\/g,'/');
  if(/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(path)||/[?#]/.test(path))throw new Error('Preview sound must use a local file or owned asset');
  return path.split('/').map(function(part){var decoded=decodeURIComponent(part);if(!decoded||decoded==='.'||decoded==='..'||/[\\/]/.test(decoded))throw new Error('Invalid preview sound asset path');return encodeURIComponent(decoded);}).join('/');
 }
 function revokeAudio(descriptor){if(descriptor&&descriptor.revokeOnRelease===true&&/^blob:/i.test(descriptor.url||'')&&typeof URL!=='undefined'&&URL.revokeObjectURL)URL.revokeObjectURL(descriptor.url);}
 function releaseAudio(){
  var old=audioSlot;audioSlot=null;++audioGeneration;if(!old)return;
  if(old.controller)old.controller.abort();old.removers.forEach(function(remove){remove();});
  if(old.audio){try{old.audio.pause();}catch(ignore){}try{old.audio.removeAttribute('src');old.audio.load();}catch(ignore){}}
  revokeAudio(old.descriptor);
 }
 function audioAllowed(slot){
  var video=slot.video,s=audioSelection;
  return !!(s&&s.insertSound&&!s.muted&&!s.busy&&playbackActive&&audioFocused&&
   (typeof document==='undefined'||!document.hidden)&&video._cpVisible!==false&&video.isConnected!==false&&!video.paused&&!video.ended&&!slot.waiting);
 }
 function syncAudio(force){
  var slot=audioSlot;if(!slot||!slot.audio||!slot.loaded)return;
  var audio=slot.audio,video=slot.video,time=Number(video.currentTime),rate=Number(video.playbackRate||1),desired=time-slot.offset,
   looped=Number.isFinite(slot.lastTime)&&time+.05<slot.lastTime;
  slot.lastTime=time;
  if(!Number.isFinite(time)||!(rate>0)||!Number.isFinite(rate)){audio.pause();soundStatus('failed',{missing:slot.missing,message:'Preview sound requires a finite forward video clock'});return;}
  try{
   audio.playbackRate=rate;audio.volume=audioSelection.volume;
   if(desired<0){audio.pause();if(audio.currentTime!==0)audio.currentTime=0;return;}
   if(Number.isFinite(audio.duration)&&desired>=audio.duration){audio.pause();return;}
   if(force||looped||(audio.paused&&audioAllowed(slot))||Math.abs(Number(audio.currentTime)-desired)>.08)audio.currentTime=desired;
   if(!audioAllowed(slot)){audio.pause();if(audioState.status!=='failed')soundStatus(audioSelection.insertSound?'ready':'disabled',{missing:slot.missing});return;}
   if(audio.paused&&!slot.blocked){
    soundStatus('ready',{missing:slot.missing});
    var play=audio.play();
    if(play&&play.then)play.then(function(){if(audioSlot===slot&&!audioAllowed(slot))audio.pause();},function(error){if(audioSlot!==slot)return;slot.blocked=true;audio.pause();soundStatus('blocked',{missing:slot.missing,message:error.message||String(error)});});
   }
  }catch(error){failAudio(slot,error);}finally{notifyAudio();}
 }
 function failAudio(slot,error){if(audioSlot!==slot)return;var missing=slot.missing||[];releaseAudio();soundStatus('failed',{missing:missing,message:error&&error.message||'Preview sound could not be loaded'});}
 function reconcileAudio(){
  audioGlobalHooks();
  if(!audioSelection||!audioSelection.insertSound){releaseAudio();soundStatus('disabled');return;}
  var matches=videos.filter(function(v){return v._cpVariant&&v._cpVariant.id===audioSelection.variantId&&(!audioSelection.entryId||v._cpEntry.id===audioSelection.entryId);}),video=matches.length===1?matches[0]:null;
  if(audioSlot&&audioSlot.video===video){syncAudio();return;}
  releaseAudio();
  if(!video||!audioResolver){soundStatus('unavailable',{message:video?'Preview sound source is not configured':'Selected rendered preview is not mounted'});return;}
  var slot={video:video,audio:null,loaded:false,removers:[],missing:[],offset:0,waiting:false,token:audioGeneration,controller:typeof AbortController==='undefined'?null:new AbortController()};audioSlot=slot;soundStatus('loading');
  var resolver=audioResolver;
  Promise.resolve().then(function(){return resolver({entry:video._cpEntry,variant:video._cpVariant,signal:slot.controller?slot.controller.signal:null});}).then(function(data){
   if(audioSlot!==slot){revokeAudio(data);return;}
   data=data||{};slot.missing=Array.isArray(data.missing)?data.missing.filter(function(v,i,a){return typeof v==='string'&&a.indexOf(v)===i;}):[];
   if(data.status==='missing'||data.status==='unavailable'){soundStatus(data.status,{missing:slot.missing,message:data.message||''});return;}
   if(data.status!=='ready')throw new Error('Preview sound resolver did not provide a ready source');
   slot.descriptor=data;var url=audioUrl(data.url),offset=data.offset==null?0:data.offset;if(typeof offset!=='number'||!Number.isFinite(offset))throw new Error('Invalid preview sound timeline offset');
   slot.offset=offset;var audio=document.createElement('audio');slot.audio=audio;audio.preload='auto';audio.loop=false;audio.muted=false;audio.volume=audioSelection.volume;
   function loaded(){if(audioSlot!==slot)return;slot.loaded=true;soundStatus('ready',{missing:slot.missing});syncAudio(true);}
   listenAudio(audio,'loadedmetadata',loaded,slot.removers);listenAudio(audio,'canplay',loaded,slot.removers);
   listenAudio(audio,'error',function(){failAudio(slot,new Error('Preview sound could not be loaded'));},slot.removers);
   ['timeupdate','play','pause','ratechange','ended','seeked','loadedmetadata'].forEach(function(name){listenAudio(video,name,function(){syncAudio(name!=='timeupdate');},slot.removers);});
   listenAudio(video,'waiting',function(){slot.waiting=true;syncAudio();},slot.removers);
   listenAudio(video,'seeking',function(){slot.waiting=true;syncAudio();},slot.removers);
   listenAudio(video,'playing',function(){slot.waiting=false;syncAudio(true);},slot.removers);
   listenAudio(video,'seeked',function(){slot.waiting=false;syncAudio(true);},slot.removers);
   audio.src=url;
  }).catch(function(error){failAudio(slot,error);});
 }
 function setAudioResolver(resolver){if(resolver!==null&&typeof resolver!=='function')throw new Error('Preview sound resolver must be a function or null');releaseAudio();audioResolver=resolver;reconcileAudio();return getAudioState();}
 function setAudioSelection(selection){
  if(selection==null){audioSelection=null;reconcileAudio();return getAudioState();}
  if(typeof selection.variantId!=='string'||!selection.variantId)throw new Error('Preview sound selection requires a variant ID');
  var volume=selection.volume==null?1:selection.volume;if(typeof volume!=='number'||!Number.isFinite(volume)||volume<0||volume>1)throw new Error('Preview sound volume must be between zero and one');
  var next={variantId:selection.variantId,entryId:typeof selection.entryId==='string'?selection.entryId:null,insertSound:selection.insertSound===true,muted:selection.muted===true,busy:selection.busy===true,volume:volume},same=audioSelection&&Object.keys(next).every(function(key){return next[key]===audioSelection[key];});
  audioSelection=next;if(same){syncAudio();return getAudioState();}if(audioSlot)audioSlot.blocked=false;reconcileAudio();return getAudioState();
 }
 function clamp(v){return Math.max(0,Math.min(1,v));}
 function sceneDescription(id){return id==='A'?{id:'A',label:'BEFORE',asset:'assets/preview-before.png'}:{id:'B',label:'AFTER',asset:'assets/preview-after.png'};}
 function subjectFor(entry){
  var path=entry&&entry.category||[];if(!Array.isArray(path))path=String(path).split(' / ');
  if(path[0]==='Animation Presets'&&path[1]==='Motion Presets')return{kind:'object',label:'개체 로고 미리보기'};
  if(path[0]==='Animation Presets'&&path[1]==='Text Presets')return{kind:'text',label:'글자 미리보기'};
  if(path[0]==='Titles & Typography')return{kind:'title',label:'타이틀 미리보기'};
  if(path[0]==='Transitions'&&path[1]==='Camera')return{kind:'scene',label:'장면 A/B 전환 미리보기'};
  if(path[0]==='Graphic Components'&&path[1]==='Shape Elements')return{kind:'shape',label:'도형 미리보기'};
  return{kind:'unknown',label:'미리보기'};
 }
 function imageAsset(path){
  if(!images[path]&&typeof Image!=='undefined'){var image=new Image();images[path]={image:image,ready:false};image.onload=function(){images[path].ready=true;cards.forEach(function(card){draw(card,0);});};image.onerror=function(){images[path].failed=true;};image.src=path;}
  return images[path]&&images[path].ready?images[path].image:null;
 }
 function imageBox(image){var ratio=(360*W/1280)/Math.max(image.width,image.height);return{x:(W-image.width*ratio)/2,y:(H-image.height*ratio)/2,width:image.width*ratio,height:image.height*ratio};}
 function renderedSource(variant){var path=variant.renderedPreview;if(path==null)return null;if(typeof path!=='string'||!/\.(webm|mp4)$/i.test(path)||/^(?:[a-z][a-z0-9+.-]*:|[\\/])/i.test(path)||path.replace(/\\/g,'/').split('/').indexOf('..')!==-1)throw new Error('Rendered preview requires a local relative video path');return path.replace(/\\/g,'/').split('/').map(encodeURIComponent).join('/');}
 function interpolateRows(rows,progress,times){
  if(!Array.isArray(rows)||!rows.length)throw new Error('Preview samples required');
  var at=clamp(progress)*(rows.length-1),lo=Math.floor(at),hi=Math.min(lo+1,rows.length-1),fraction=at-lo;
  if(times){var p=clamp(progress),left=0,right=times.length-1;while(right-left>1){var middle=Math.floor((left+right)/2);if(times[middle]<=p)left=middle;else right=middle;}lo=left;hi=right;fraction=times[hi]===times[lo]?0:(p-times[lo])/(times[hi]-times[lo]);}
  return rows[lo].map(function(v,i){var b=rows[hi][i];if(!Number.isFinite(v)||!Number.isFinite(b))throw new Error('Preview samples must be finite');return v+(b-v)*fraction;});
 }
 function sampleProfile(profile,time){
  var neutral={ready:false,sceneId:'A',position:[0,0,0],scale:[1,1,1],rotation:0,opacity:1,blur:0};
  if(!profile)return neutral;
  neutral.origin=profile.origin||[.5,.5];
  if(profile.kind==='shadow')return Object.assign(neutral,{ready:true,illustration:true});
  var camera=profile.kind==='camera',duration=camera?profile.duration+2*HOLD:(profile.inDuration||0)+(profile.outDuration||0)+2*HOLD,t=((time%duration)+duration)%duration,cut=camera?HOLD+profile.cutOffset:HOLD+(profile.outDuration||0),local=t-HOLD,side=t<cut?'out':'in',progress=side==='out'?1-clamp(local/(profile.outDuration||1)):clamp((t-cut)/(profile.inDuration||1));
  neutral.sceneId=t<cut?'A':'B';neutral.phase=t;neutral.cut=cut;neutral.side=side;neutral.progress=progress;
  if(camera){
   if(!profile.samples||!profile.samples.timeline)return neutral;
   var timeline=interpolateRows(profile.samples.timeline,clamp(local/profile.duration));
   return Object.assign(neutral,{ready:true,position:timeline.slice(0,3),scale:timeline.slice(3,6),rotation:timeline[6],opacity:timeline[7],blur:timeline[8]});
  }
  if(!profile.samples||!profile.samples[side])return neutral;
  var row=interpolateRows(profile.samples[side],progress,profile.sampleTimes&&profile.sampleTimes[side]);
  if(profile.kind==='text'){var glyphs=[];for(var i=0;i<row.length;i+=10)glyphs.push(row.slice(i,i+10));return Object.assign(neutral,{ready:true,glyphs:glyphs,text:profile.text});}
  return Object.assign(neutral,{ready:true,position:row.slice(0,3),scale:row.slice(3,6),rotation:row[6],opacity:row[7],blur:row[8]});
 }
 function scene(ctx,id){var image=imageAsset(sceneDescription(id).asset);if(image)ctx.drawImage(image,0,0,W,H);return!!image;}
 function renderFallback(ctx,entry,profile,time,resources){
  var subject=subjectFor(entry),s=sampleProfile(profile,time),assetReady=true;resources=resources||{};
  ctx.save();ctx.clearRect(0,0,W,H);ctx.fillStyle='#101010';ctx.fillRect(0,0,W,H);
  if(subject.kind==='object'||subject.kind==='scene'){
   var image=subject.kind==='object'?resources.logo:(s.sceneId==='A'?resources.before:resources.after),box=image?(subject.kind==='object'?imageBox(image):{x:0,y:0,width:W,height:H}):null,origin=s.origin||[.5,.5];
   assetReady=!!image;
   if(image){var x=box.x+box.width*origin[0],y=box.y+box.height*origin[1];ctx.translate(x+s.position[0]*W/1280,y+s.position[1]*H/720);ctx.rotate(s.rotation*Math.PI/180);ctx.scale(s.scale[0],s.scale[1]);ctx.translate(-x,-y);ctx.globalAlpha=clamp(s.opacity);if(s.blur>0)ctx.filter='blur('+(s.blur*W/1280)+'px)';if(profile&&profile.kind==='shadow')drawShadow(ctx,profile,image,box);ctx.drawImage(image,box.x,box.y,box.width,box.height);}
  }else if(subject.kind==='text'||subject.kind==='title'){
   ctx.font='bold 25px Arial';ctx.textAlign='center';ctx.fillStyle='#fff';var word=s.text||'CONTENTRIUM',spacing=22,start=W/2-(word.length-1)*spacing/2;
   for(var j=0;j<word.length;j++){var pose=s.glyphs&&s.glyphs[j]||[0,0,0,1,1,1,0,1,0,0];ctx.save();ctx.globalAlpha=clamp(pose[7]);ctx.translate(start+j*spacing+pose[0]*W/1280+(j-(word.length-1)/2)*pose[9]*25/1000,117+pose[1]*H/720);ctx.rotate(pose[6]*Math.PI/180);ctx.scale(pose[3],pose[4]);ctx.fillText(word[j],0,0);ctx.restore();}
  }
  ctx.restore();return{subject:subject,pose:s,assetReady:assetReady};
 }
 function draw(card,time){
  var subject=subjectFor(card.entry),resources={};
  if(subject.kind==='object')resources.logo=imageAsset('assets/preview-logo.png');
  if(subject.kind==='scene'){resources.before=imageAsset('assets/preview-before.png');resources.after=imageAsset('assets/preview-after.png');}
  var rendered=renderFallback(card.ctx,card.entry,profiles[card.variant.id],time,resources),s=rendered.pose;
  if(card.mediaFailed||!s.ready||!rendered.assetReady){var ctx=card.ctx;ctx.save();ctx.fillStyle='rgba(12,14,18,.8)';ctx.fillRect(0,H-23,W,23);ctx.font='10px Arial';ctx.textAlign='center';ctx.fillStyle='#c6ccd4';ctx.fillText(card.mediaFailed?'영상 미리보기를 불러오지 못했습니다':(!rendered.assetReady?'미리보기 이미지가 없습니다':'정지 예시 · 영상 미리보기 필요'),W/2,H-8);ctx.restore();}
  card.canvas.dataset.previewKind=subject.kind;card.canvas.dataset.sceneId=subject.kind==='scene'?s.sceneId:'';card.canvas.dataset.profileReady=String(s.ready);
 }
 function drawShadow(ctx,profile,image,box){
  function setting(name,fallback){var c=profile.controls.find(function(c){return c.name===name;});return c?c.value:fallback;}
  function color(v){return'rgba('+v.slice(0,3).map(function(n){return Math.round(n*255);}).join(',')+','+(v[3]==null?1:v[3])+')';}
  if(typeof document==='undefined')return;
  var mask=document.createElement('canvas');mask.width=W;mask.height=H;var shadow=mask.getContext('2d'),angle=setting('Angle',135)*Math.PI/180,length=setting('Length',600)*box.width/image.width,start=setting('Gradient Start',[0,0]),end=setting('Gradient End',[1280,720]),gradient=shadow.createLinearGradient(start[0]*W/1280,start[1]*H/720,end[0]*W/1280,end[1]*H/720);
  gradient.addColorStop(0,color(setting('Gradient Start Color',[.35,.35,.35,1])));gradient.addColorStop(1,color(setting('Gradient End Color',[0,0,0,1])));
  for(var step=Math.ceil(length);step>=0;step--)shadow.drawImage(image,box.x+Math.cos(angle)*step,box.y+Math.sin(angle)*step,box.width,box.height);
  shadow.globalCompositeOperation='source-in';shadow.fillStyle=gradient;shadow.fillRect(0,0,W,H);ctx.save();ctx.globalAlpha=clamp(setting('Opacity',100)/100);ctx.drawImage(mask,0,0);ctx.restore();
 }
 function loadProfiles(){
  if(loading)return loading;
  loading=fetch('./library/preview-profiles.json',{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('Preview profiles unavailable');return r.json();}).catch(function(error){
   var req=typeof require==='function'?require:(scope.cep_node&&scope.cep_node.require);if(!scope.__adobe_cep__||!req)throw error;
   var root=decodeURI(scope.__adobe_cep__.getSystemPath('extension'));if(/^file:/i.test(root))root=req('url').fileURLToPath(root);
   return JSON.parse(req('fs').readFileSync(req('path').join(root,'library','preview-profiles.json'),'utf8'));
  }).then(function(data){if(data.schemaVersion!==1||!data.profiles)throw new Error('Invalid preview profiles');profiles=data.profiles;cards.forEach(function(c){draw(c,0);});return data;}).catch(function(){return null;});return loading;
 }
 function tick(now){frame=requestAnimationFrame(tick);if(now-last<32||document.hidden||!playbackActive)return;last=now;cards.forEach(function(card){if(card.visible&&card.canvas.isConnected)draw(card,(now-card.start)/1000);});}
 function watch(target){if(typeof IntersectionObserver==='undefined')return;if(!observer)observer=new IntersectionObserver(function(changes){changes.forEach(function(change){var item=cards.find(function(c){return c.canvas===change.target;});if(item)item.visible=change.isIntersecting;else if(change.target.tagName==='VIDEO'&&videos.indexOf(change.target)!==-1){change.target._cpVisible=change.isIntersecting;if(change.isIntersecting&&playbackActive){var play=change.target.play();if(play&&play.catch)play.catch(function(){});}else change.target.pause();if(audioSlot&&audioSlot.video===change.target)syncAudio();}});});observer.observe(target);}
 function mount(wrap,entry,variant){
  var source;try{source=renderedSource(variant);}catch(error){var message=document.createElement('span');message.className='preview-message';message.textContent=error.message;wrap.appendChild(message);return;}
  if(source){var video=document.createElement('video'),subject=subjectFor(entry);video._cpEntry=entry;video._cpVariant=variant;video.src=source;video.muted=true;video.loop=true;video.autoplay=playbackActive;video.playsInline=true;video.preload='metadata';video.setAttribute('data-preview-kind',subject.kind);video.setAttribute('aria-label',entry.name+' '+variant.name+' · '+subject.label+' · AE 렌더');video.onerror=function(){if(!video.isConnected)return;unmount(wrap);video.remove();if(variant.type===11){var message=document.createElement('span');message.className='preview-message';message.textContent='글자 팩 미리보기를 불러올 수 없습니다.';wrap.appendChild(message);}else mountCanvas(wrap,entry,variant,true);};wrap.appendChild(video);videos.push(video);watch(video);if(audioSelection)reconcileAudio();return;}
  if(Number(variant.type)===11){var pending=document.createElement('span');pending.className='preview-message';pending.textContent='글자 팩 미리보기가 등록되지 않았습니다.';wrap.appendChild(pending);return;}
  mountCanvas(wrap,entry,variant);
 }
 function mountCanvas(wrap,entry,variant,mediaFailed){
  var canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;canvas.setAttribute('aria-label',entry.name+' '+variant.name+' · '+subjectFor(entry).label);wrap.appendChild(canvas);
  var card={canvas:canvas,ctx:canvas.getContext('2d'),entry:entry,variant:variant,mediaFailed:!!mediaFailed,visible:true,start:performance.now()};cards.push(card);draw(card,0);loadProfiles();
  watch(canvas);if(!frame)frame=requestAnimationFrame(tick);
 }
 function setPlaybackActive(active){
  active=!!active;var now=typeof performance==='undefined'?Date.now():performance.now();
  if(active!==playbackActive){if(!active)pausedAt=now;else if(pausedAt!=null){var delta=now-pausedAt;cards.forEach(function(card){card.start+=delta;});pausedAt=null;}}
  playbackActive=active;videos.forEach(function(video){if(active&&video._cpVisible!==false){var play=video.play();if(play&&play.catch)play.catch(function(){});}else video.pause();});syncAudio();return playbackActive;
 }
 function releaseVideo(video){if(audioSlot&&audioSlot.video===video){releaseAudio();soundStatus(audioSelection?'unavailable':'disabled');}if(observer)observer.unobserve(video);video.onerror=null;video.pause();video.removeAttribute('src');video.load();}
 function unmount(wrap){if(!wrap)return;cards=cards.filter(function(card){if(!wrap.contains(card.canvas))return true;if(observer)observer.unobserve(card.canvas);return false;});videos=videos.filter(function(video){if(!wrap.contains(video))return true;releaseVideo(video);return false;});if(!cards.length&&frame){cancelAnimationFrame(frame);frame=0;}}
 function clear(){audioSelection=null;releaseAudio();soundStatus('disabled');audioHooks.forEach(function(remove){remove();});audioHooks=[];audioFocused=true;if(observer)observer.disconnect();cards=[];videos.forEach(releaseVideo);videos=[];if(frame){cancelAnimationFrame(frame);frame=0;}}
 var api={mount:mount,unmount:unmount,clear:clear,setPlaybackActive:setPlaybackActive,setAudioResolver:setAudioResolver,setAudioSelection:setAudioSelection,setAudioStateListener:setAudioStateListener,getAudioState:getAudioState,loadProfiles:loadProfiles,drawScene:scene,sceneDescription:sceneDescription,subjectFor:subjectFor,renderFallback:renderFallback,sampleProfile:sampleProfile,interpolateRows:interpolateRows,renderedSource:renderedSource};scope.ContentriumPreview=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
