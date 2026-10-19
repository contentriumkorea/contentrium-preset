(function(scope){
 'use strict';
 var cards=[],videos=[],frame=0,last=0,observer=null,profiles={},loading=null,images={},convertedLibraryRoot=null,W=400,H=225,HOLD=.6,playbackActive=true,pausedAt=null;
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
   if(path[0]==='Animated Fonts')return{kind:'text',label:'애니메이션 글자 미리보기'};
  if(path[0]==='Titles & Typography')return{kind:'title',label:'타이틀 미리보기'};
  if(path[0]==='Transitions')return{kind:'scene',label:'장면 A/B 전환 미리보기'};
  if(path[0]==='Graphic Components')return{kind:'object',label:'그래픽 요소 미리보기'};
  return{kind:'object',label:'개체 로고 미리보기'};
 }
 function previewSubject(entry,variant){var generator=variant&&variant.generator;if(generator&&generator.independent===true&&Number(variant.type)===10&&(generator.family==='graphic'||generator.family==='shape'))return{kind:'graphic',label:'생성 그래픽 미리보기'};return subjectFor(entry);}
 function genericProfile(entry,variant){
  var generator=variant&&variant.generator;if(!generator||generator.independent!==true)return null;
  var subject=previewSubject(entry,variant),duration=Number(generator.duration)||1.6;
   return{id:String(variant.id),kind:'generic',subjectKind:subject.kind,name:String(entry&&entry.name||variant.name||''),duration:duration,inDuration:duration*.5,outDuration:duration*.5,cutOffset:duration*.5,lineCount:Math.min(5,Math.max(1,Number(generator.lineCount)||1)),generator:generator};
 }
 function imageAsset(path){
  if(!images[path]&&typeof Image!=='undefined'){var image=new Image();images[path]={image:image,ready:false};image.onload=function(){images[path].ready=true;cards.forEach(function(card){draw(card,0);});};image.onerror=function(){images[path].failed=true;};image.src=path;}
  return images[path]&&images[path].ready?images[path].image:null;
 }
 function imageBox(image){var ratio=(360*W/1280)/Math.max(image.width,image.height);return{x:(W-image.width*ratio)/2,y:(H-image.height*ratio)/2,width:image.width*ratio,height:image.height*ratio};}
 function setConvertedLibraryRoot(root){if(root===null||root===''){convertedLibraryRoot=null;return null;}if(typeof root!=='string')throw new Error('Converted preview root must be a local directory');convertedLibraryRoot=root;return convertedLibraryRoot;}
 function convertedLibrarySource(reference){var match=/^contentrium-library:\/\/(cpr_[a-f0-9]{24})$/.exec(reference),req=typeof require==='function'?require:(scope.cep_node&&scope.cep_node.require);if(!match)throw new Error('Converted preview reference is invalid');if(!convertedLibraryRoot)throw new Error('Converted preview library is not configured');if(!req)throw new Error('Converted previews require local CEP file access');var pathApi=req('path'),urlApi=req('url');return urlApi.pathToFileURL(pathApi.join(convertedLibraryRoot,'previews',match[1]+'.webm')).href;}
 function renderedSource(variant){var path=variant.renderedPreview;if(path==null)return null;if(typeof path!=='string')throw new Error('Rendered preview path is invalid');if(path.indexOf('contentrium-library://')===0)return convertedLibrarySource(path);if(!/\.(webm|mp4)$/i.test(path)||/^(?:[a-z][a-z0-9+.-]*:|[\\/])/i.test(path)||path.replace(/\\/g,'/').split('/').indexOf('..')!==-1)throw new Error('Rendered preview requires a local relative video path');return path.replace(/\\/g,'/').split('/').map(encodeURIComponent).join('/');}
 function interpolateRows(rows,progress,times){
  if(!Array.isArray(rows)||!rows.length)throw new Error('Preview samples required');
  var at=clamp(progress)*(rows.length-1),lo=Math.floor(at),hi=Math.min(lo+1,rows.length-1),fraction=at-lo;
  if(times){var p=clamp(progress),left=0,right=times.length-1;while(right-left>1){var middle=Math.floor((left+right)/2);if(times[middle]<=p)left=middle;else right=middle;}lo=left;hi=right;fraction=times[hi]===times[lo]?0:(p-times[lo])/(times[hi]-times[lo]);}
  return rows[lo].map(function(v,i){var b=rows[hi][i];if(!Number.isFinite(v)||!Number.isFinite(b))throw new Error('Preview samples must be finite');return v+(b-v)*fraction;});
 }
 function sampleProfile(profile,time){
  var neutral={ready:false,sceneId:'A',position:[0,0,0],scale:[1,1,1],rotation:0,opacity:1,blur:0};
  if(!profile)return neutral;
  if(profile.generator)return sampleGenericProfile(profile,time,neutral);
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
 function sampleGenericProfile(profile,time,neutral){
  var g=profile.generator||{},f=g.features||{},duration=(profile.inDuration||.8)+(profile.outDuration||.8)+2*HOLD,
   t=((time%duration)+duration)%duration,cut=HOLD+(profile.outDuration||.8),local=t-HOLD,
   side=t<cut?'out':'in',progress=side==='out'?1-clamp(local/(profile.outDuration||.8)):clamp((t-cut)/(profile.inDuration||.8)),
   eased=progress,amount,dx=/left/.test(g.direction||'')?-1:/right/.test(g.direction||'')?1:0,
   dy=/up|top/.test(g.direction||'')?-1:/down|bottom/.test(g.direction||'')?1:0,sign=side==='out'?1:-1,
   reveal=f.typewrite===true||g.archetype==='typewriter'||g.titleDesign==='typewriter',visible;
  if(g.curve==='ease')eased=progress*progress*(3-2*progress);
  else if(g.curve==='overshoot')eased=progress-(Math.sin(progress*Math.PI*2)*.08*(1-progress));
  else if(g.curve==='bounce')eased=progress-(Math.abs(Math.sin(progress*Math.PI*3))*.12*(1-progress));
  amount=1-eased;
  neutral.sceneId=t<cut?'A':'B';neutral.phase=t;neutral.cut=cut;neutral.side=side;neutral.progress=progress;neutral.ready=true;
  neutral.origin=[.5,.5];neutral.text='CONTENTRIUM';
  if(profile.subjectKind==='scene'){
   neutral.position=[dx*260*amount,dy*150*amount,0];
   neutral.scale=f.zoom?[1+amount*.45,1+amount*.45,1]:[1,1,1];
   neutral.blur=f.blur?amount*20:0;
   neutral.opacity=f.fade?1-amount:1;
   neutral.rotation=f.rotate||f.rotation?sign*amount*16:0;
   return neutral;
  }
  if(profile.subjectKind==='text'||profile.subjectKind==='title'){
   var word='CONTENTRIUM',glyphs=[],i,stagger,per,distX=dx*150,distY=dy*90,perAmount,base;
   for(i=0;i<word.length;i++){
    stagger=(i/(word.length-1||1))*.4;
    per=clamp((progress-stagger)/(1-stagger));
    perAmount=1-per;
    visible=reveal?(side==='out'?(progress<1-i/(word.length-1||1)):(progress>=i/(word.length-1||1))?1:0):(f.fade?per:1);
    base=[f.position?distX*perAmount:0,f.position?distY*perAmount:0,0,
     f.scale?1-.25*perAmount:1,f.scale?1-.25*perAmount:1,1,
     f.rotation?sign*perAmount*18:0,visible,f.blur?perAmount*12:0,f.tracking?perAmount*18:0];
    glyphs.push(base);
   }
   neutral.glyphs=glyphs;return neutral;
  }
  neutral.position=[dx*260*amount,dy*150*amount,0];
  neutral.scale=f.scale||f.zoom?[1-.25*amount,1-.25*amount,1]:[1,1,1];
  neutral.rotation=f.rotation||f.rotate?sign*amount*18:0;
  neutral.opacity=f.fade?1-amount:1;
  neutral.blur=f.blur?amount*20:0;
  return neutral;
 }
 function scene(ctx,id){var image=imageAsset(sceneDescription(id).asset);if(image)ctx.drawImage(image,0,0,W,H);return!!image;}
  function drawSemanticGraphic(ctx,symbol,style,accent,secondary){
   var fill=style==='edgy'?'#25272b':style==='colorful'?'#2787c7':accent,ink=style==='outlined'?'#58b8ff':style==='handdrawn'?'#ffc65a':'#f4f7fc',outline=style==='outlined'||style==='handdrawn';
   function rect(x,y,w,h,color){if(!outline){ctx.fillStyle=color||fill;ctx.fillRect(x,y,w,h);}ctx.strokeStyle=ink;ctx.lineWidth=4;ctx.strokeRect(x,y,w,h);}
   function circle(x,y,r,color){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);if(!outline){ctx.fillStyle=color||ink;ctx.fill();}ctx.strokeStyle=ink;ctx.lineWidth=3;ctx.stroke();}
   function polygon(points,color){ctx.beginPath();for(var i=0;i<points.length;i++){if(i===0)ctx.moveTo(points[i][0],points[i][1]);else ctx.lineTo(points[i][0],points[i][1]);}ctx.closePath();if(!outline){ctx.fillStyle=color||fill;ctx.fill();}ctx.strokeStyle=ink;ctx.lineWidth=4;ctx.stroke();}
   switch(symbol){
    case 'furniture':
     rect(-29,-53,19,56);rect(-42,-8,84,18);rect(-34,8,12,45);rect(22,8,12,45);rect(-42,-62,17,56);return true;
    case 'currency':
     circle(0,0,47,fill);circle(0,0,35,fill);rect(-4,-24,8,48);rect(-18,-17,36,7);rect(-18,10,36,7);return true;
    case 'card':
     rect(-55,-34,110,68,fill);rect(-55,-18,110,13,ink);rect(-39,8,29,13,'#f2c75c');rect(9,22,35,6,ink);return true;
    case 'balloon':
     circle(0,-9,37,fill);polygon([[-10,27],[10,27],[0,40]],fill);ctx.beginPath();ctx.moveTo(0,40);ctx.lineTo(3,70);ctx.strokeStyle=ink;ctx.lineWidth=3;ctx.stroke();return true;
    case 'impact': case 'burst':
     polygon([[0,-55],[12,-18],[48,-39],[25,-8],[58,0],[23,13],[42,47],[10,24],[0,59],[-12,22],[-46,43],[-24,10],[-58,0],[-22,-12],[-43,-45],[-9,-23]],fill);return true;
    case 'scribble': case 'handdrawn':
     ctx.strokeStyle=ink;ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(-54,-31);ctx.lineTo(-11,-39);ctx.lineTo(24,-25);ctx.lineTo(-43,-7);ctx.lineTo(39,2);ctx.lineTo(-27,23);ctx.lineTo(55,34);ctx.stroke();return true;
    case 'face': case 'emoji':
     circle(0,0,47,fill);circle(-17,-14,4,ink);circle(17,-14,4,ink);ctx.beginPath();ctx.arc(0,4,21,.2,Math.PI-.2);ctx.strokeStyle=ink;ctx.lineWidth=5;ctx.stroke();return true;
    case 'hand':
     rect(-23,-8,48,54,fill);rect(-42,-23,12,42,fill);rect(-25,-49,12,55,fill);rect(-7,-55,12,61,fill);rect(11,-47,12,54,fill);rect(28,-31,12,40,fill);return true;
    case 'resource':
     rect(-37,-44,74,88,fill);rect(-42,-48,84,11,fill);rect(-42,37,84,11,fill);return true;
    case 'social':
     rect(-53,-36,106,70,fill);polygon([[-35,34],[-20,34],[-35,51]],fill);circle(-28,-1,5,ink);circle(0,-1,5,ink);circle(28,-1,5,ink);return true;
    case 'symbol':
     rect(-42,-28,84,11,fill);rect(-42,-5,84,11,fill);rect(-42,18,84,11,fill);return true;
    case 'smoke':
     circle(-28,18,30,fill);circle(0,-12,37,fill);circle(33,17,29,fill);return true;
    case 'weapon':
     rect(-50,-16,100,18,fill);rect(-35,0,30,40,fill);rect(35,-22,24,8,fill);return true;
    case 'hourglass':
     rect(-42,-52,84,9,fill);polygon([[-36,-42],[36,-42],[0,-3]],fill);rect(-5,-7,10,14,fill);polygon([[-36,42],[36,42],[0,3]],fill);rect(-42,43,84,9,fill);return true;
    case 'globe':
     circle(0,0,48,fill);ctx.beginPath();ctx.ellipse(0,0,24,48,0,0,Math.PI*2);ctx.strokeStyle=ink;ctx.lineWidth=4;ctx.stroke();ctx.beginPath();ctx.moveTo(-43,-17);ctx.lineTo(43,-17);ctx.moveTo(-47,0);ctx.lineTo(47,0);ctx.moveTo(-43,17);ctx.lineTo(43,17);ctx.stroke();return true;
    case 'medical':
     rect(-40,-40,80,80,fill);rect(-9,-30,18,60,ink);rect(-30,-9,60,18,ink);circle(0,52,19,fill);return true;
    case 'gift':
     rect(-48,-25,96,72,fill);rect(-54,-39,108,17,fill);rect(-8,-39,16,86,ink);circle(-18,-48,15,fill);circle(18,-48,15,fill);return true;
    case 'fitness':
     rect(-49,-6,98,12,fill);rect(-62,-27,15,54,fill);rect(47,-27,15,54,fill);rect(-78,-18,14,36,fill);rect(64,-18,14,36,fill);return true;
    case 'target':
     circle(0,0,49,fill);circle(0,0,32,fill);circle(0,0,15,fill);return true;
    case 'bulb':
     circle(0,-11,35,fill);rect(-16,23,32,10,fill);rect(-13,37,26,9,fill);return true;
    case 'bell':
     circle(0,-8,39,fill);rect(-45,24,90,11,fill);circle(0,45,8,ink);return true;
    case 'drop':
     polygon([[0,-54],[39,4],[35,30],[13,47],[-13,47],[-35,30],[-39,4]],fill);return true;
    case 'plug':
     rect(-28,-10,56,47,fill);rect(-21,-43,9,32,fill);rect(12,-43,9,32,fill);rect(-8,37,16,31,fill);return true;
    case 'map':
     rect(-49,-40,98,80,fill);rect(-20,-38,8,76,ink);rect(13,-38,8,76,ink);circle(-16,-14,8,ink);circle(17,19,8,ink);return true;
    case 'magnet':
     rect(-34,-42,14,74,fill);rect(20,-42,14,74,fill);rect(-34,20,68,14,fill);rect(-47,-49,40,13,ink);rect(7,-49,40,13,ink);return true;
    case 'skull':
     circle(0,-10,40,fill);rect(-25,17,50,30,fill);circle(-16,-9,9,'#182633');circle(16,-9,9,'#182633');rect(-5,23,10,15,ink);return true;
    case 'shield':
     polygon([[-45,-42],[45,-42],[45,8],[0,53],[-45,8]],fill);return true;
    case 'sound':
     rect(-47,-13,12,26,fill);rect(-25,-24,12,48,fill);rect(-3,-42,12,84,fill);rect(19,-24,12,48,fill);rect(41,-13,12,26,fill);return true;
    case 'checklist':
     circle(-38,-27,6,ink);rect(0,-30,68,8,fill);circle(-38,0,6,ink);rect(0,-4,68,8,fill);circle(-38,27,6,ink);rect(0,23,68,8,fill);return true;
    case 'wind':
     rect(-46,-28,94,9,fill);rect(-56,-4,112,9,fill);rect(-38,20,82,9,fill);return true;
    case 'feather':
     circle(0,0,38,fill);rect(-3,-49,6,98,ink);rect(-27,-22,25,6,ink);rect(2,8,26,6,ink);return true;
    case 'brick':
     rect(-52,-34,104,68,fill);rect(-48,-10,96,7,ink);rect(-15,-31,7,21,ink);rect(17,-31,7,21,ink);rect(0,-7,7,28,ink);return true;
    case 'grave':
     rect(-38,-12,76,60,fill);polygon([[-38,-12],[0,-50],[38,-12]],fill);rect(-4,-5,8,40,ink);rect(-18,8,36,8,ink);return true;
    case 'code':
     rect(-52,-52,33,33,fill);rect(-45,-45,19,19,ink);rect(19,-52,33,33,fill);rect(26,-45,19,19,ink);rect(-52,19,33,33,fill);rect(-45,26,19,19,ink);rect(20,20,13,13,fill);rect(40,39,13,13,fill);return true;
    case 'fire-extinguisher':
     rect(-24,-34,48,76,fill);rect(-16,-49,32,11,fill);rect(-7,-62,14,13,fill);rect(24,-38,13,35,fill);rect(-14,-10,28,12,'#e54f55');return true;
    case 'magic':
     ctx.save();ctx.rotate(-Math.PI/4);rect(-5,-53,10,106,fill);ctx.restore();polygon([[0,-56],[8,-34],[31,-31],[13,-16],[18,8],[0,-4],[-18,8],[-13,-16],[-31,-31],[-8,-34]],fill);return true;
    case 'puzzle':
     rect(-48,-48,50,50,fill);rect(0,0,50,50,fill);circle(0,-23,13,fill);circle(23,0,13,fill);return true;
    case 'sync':
     rect(-46,-32,80,12,fill);polygon([[25,-49],[54,-26],[25,-5]],fill);rect(-34,23,80,12,fill);polygon([[-25,5],[-54,28],[-25,48]],fill);return true;
    case 'generic':
     rect(-45,-28,90,11,fill);rect(-45,-5,90,11,fill);rect(-45,18,90,11,fill);return true;
    case 'calculator':
     rect(-39,-53,78,106,fill);rect(-25,-38,50,18,'#b8e5ff');circle(-22,-4,5,ink);circle(0,-4,5,ink);circle(22,-4,5,ink);circle(-22,20,5,ink);circle(0,20,5,ink);circle(22,20,5,ink);return true;
    case 'ambulance':
     rect(-59,-16,83,43,'#edf4f8');rect(24,-9,38,36,'#dfeaf1');rect(30,-4,24,17,'#18344a');
     circle(-37,34,10,'#182633');circle(42,34,10,'#182633');rect(-10,-4,9,30,'#e54f55');rect(-21,6,31,9,'#e54f55');
     rect(-46,-29,23,9,'#ed574f');return true;
    case 'car': case 'taxi': case 'vehicle':
     rect(-54,-8,108,35,fill);polygon([[-33,-10],[-18,-31],[21,-31],[39,-10]],fill);
     circle(-32,31,10,'#182633');circle(33,31,10,'#182633');return true;
    case 'truck': case 'fire-truck': case 'police-car': case 'bus':
     rect(-58,-17,75,46,fill);rect(18,-5,42,34,fill);rect(24,-1,27,16,'#18344a');
     circle(-35,34,10,'#182633');circle(38,34,10,'#182633');if(symbol!=='bus'){rect(-5,-7,14,19,'#edf4f8');rect(-2,-4,8,13,'#e54f55');}return true;
    case 'train':
     rect(-58,-31,116,61,fill);rect(-48,-44,96,14,fill);rect(-43,-19,22,21,'#18344a');rect(-11,-19,22,21,'#18344a');rect(21,-19,22,21,'#18344a');
     circle(-41,38,9,'#182633');circle(0,38,9,'#182633');circle(41,38,9,'#182633');circle(47,4,5,'#ffd46b');return true;
    case 'boat':
     polygon([[-56,6],[56,6],[38,37],[-39,37]],fill);rect(-19,-30,39,36,fill);rect(-11,-44,22,14,fill);rect(-4,-59,8,18,fill);return true;
    case 'helicopter':
     circle(-4,7,24,fill);rect(12,1,45,10,fill);rect(-11,-35,14,8,fill);rect(-49,-39,94,7,fill);rect(-59,-48,9,24,fill);rect(-19,31,53,7,fill);return true;
    case 'bicycle': case 'motorcycle':
     circle(-42,25,24,fill);circle(42,25,24,fill);rect(-33,3,65,7,fill);rect(-21,-14,8,45,fill);rect(17,-14,8,45,fill);rect(-10,-24,34,7,fill);return true;
    case 'airplane':
     polygon([[-9,-53],[9,-53],[15,-9],[52,5],[52,17],[15,10],[12,48],[27,57],[27,65],[0,58],[-27,65],[-27,57],[-12,48],[-15,10],[-52,17],[-52,5],[-15,-9]],fill);return true;
    case 'house':
     polygon([[-57,-9],[0,-52],[57,-9]],fill);rect(-45,-8,90,61,fill);rect(-11,15,22,38,'#18344a');rect(-36,5,16,17,'#b8e5ff');rect(20,5,16,17,'#b8e5ff');return true;
    case 'bank': case 'church': case 'school': case 'hospital': case 'airport': case 'factory': case 'building':
     polygon([[-56,-22],[0,-51],[56,-22]],fill);rect(-48,-19,96,66,fill);rect(-33,-5,12,33,'#b8e5ff');rect(-6,-5,12,33,'#b8e5ff');rect(21,-5,12,33,'#b8e5ff');
     if(symbol==='hospital'){rect(-6,-43,12,27,'#e54f55');rect(-15,-34,30,9,'#e54f55');}else if(symbol==='church'){rect(-5,-56,10,20,fill);rect(-15,-50,30,8,fill);}else if(symbol==='school'){rect(-8,19,16,28,'#18344a');}
     rect(-55,47,110,8,fill);return true;
    case 'phone': case 'tablet':
     rect(-27,-52,54,104,fill);rect(-20,-39,40,72,'#172a39');circle(0,42,4,ink);return true;
    case 'laptop':
     rect(-43,-43,86,61,fill);rect(-54,21,108,12,fill);rect(-7,24,14,4,'#dbe9f1');return true;
    case 'camera': case 'video-camera':
     rect(-48,-27,96,58,fill);rect(-20,-39,35,13,fill);circle(9,1,23,'#182633');circle(9,1,13,'#71c6f1');return true;
    case 'clock': case 'calendar':
     if(symbol==='clock'){circle(0,0,48,fill);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-29);ctx.moveTo(0,0);ctx.lineTo(24,13);ctx.strokeStyle=ink;ctx.lineWidth=6;ctx.stroke();return true;}
     rect(-48,-37,96,81,fill);rect(-48,-37,96,20,'#e54f55');circle(-25,2,4,ink);circle(0,2,4,ink);circle(25,2,4,ink);circle(-25,25,4,ink);circle(0,25,4,ink);return true;
    case 'battery':
     rect(-47,-27,91,55,fill);rect(44,-11,10,22,ink);rect(-34,-14,20,29,'#61cf91');rect(-7,-14,20,29,'#61cf91');rect(20,-14,13,29,'#61cf91');return true;
    case 'bag':
     rect(-43,-21,86,76,fill);rect(-21,-40,42,11,fill);rect(-13,-48,26,24,fill);rect(-29,0,58,7,ink);return true;
    case 'clothing':
     rect(-25,-37,50,74,fill);rect(-54,-21,30,19,fill);rect(24,-21,30,19,fill);rect(-28,-47,19,14,fill);rect(9,-47,19,14,fill);return true;
    case 'moon':
     circle(-8,0,45,fill);circle(16,-13,38,'#111820');circle(43,-42,6,ink);circle(-47,38,4,ink);return true;
    case 'umbrella':
     ctx.beginPath();ctx.ellipse(0,-8,54,35,0,Math.PI,Math.PI*2);ctx.lineTo(54,-8);ctx.strokeStyle=ink;ctx.lineWidth=4;ctx.stroke();ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(0,44);ctx.arc(10,44,10,Math.PI,0);ctx.stroke();return true;
    case 'tool':
     circle(-36,-31,21,fill);ctx.beginPath();ctx.moveTo(-20,-15);ctx.lineTo(36,42);ctx.strokeStyle=ink;ctx.lineWidth=16;ctx.lineCap='round';ctx.stroke();circle(38,42,9,fill);return true;
    case 'mail':
     rect(-54,-36,108,72,fill);polygon([[-51,-31],[0,8],[51,-31]],'#b8e5ff');return true;
    case 'chart':
     rect(-48,15,23,37,fill);rect(-11,-8,23,60,fill);rect(26,-37,23,89,fill);ctx.beginPath();ctx.moveTo(-56,54);ctx.lineTo(56,54);ctx.strokeStyle=ink;ctx.lineWidth=4;ctx.stroke();return true;
    case 'furniture':
     rect(-29,-53,19,56,fill);rect(-42,-8,84,18,fill);rect(-34,8,12,45,fill);rect(22,8,12,45,fill);rect(-42,-62,17,56,fill);return true;
    case 'cart':
     rect(-31,-30,70,45,fill);rect(-45,-40,10,77,fill);rect(35,-30,8,54,fill);rect(-28,-17,63,6,'#d9eef8');circle(-23,35,8,'#182633');circle(26,35,8,'#182633');return true;
    case 'document': case 'box':
     rect(-40,-52,80,104,fill);rect(-23,-25,46,6,ink);rect(-23,-4,46,6,ink);rect(-23,17,46,6,ink);rect(-23,38,32,6,ink);return true;
    case 'lock':
     rect(-40,-2,80,59,fill);ctx.beginPath();ctx.arc(0,-3,27,Math.PI,0);ctx.strokeStyle=ink;ctx.lineWidth=8;ctx.stroke();circle(0,20,5,ink);return true;
    case 'tree':
     polygon([[-51,11],[0,-52],[51,11]],fill);polygon([[-41,38],[0,-16],[41,38]],fill);rect(-9,34,18,25,fill);return true;
    case 'cup': case 'food':
     rect(-35,-27,58,66,fill);ctx.beginPath();ctx.ellipse(29,0,18,21,0,-Math.PI/2,Math.PI/2);ctx.strokeStyle=ink;ctx.lineWidth=5;ctx.stroke();ctx.beginPath();ctx.ellipse(-6,-27,31,8,0,0,Math.PI*2);ctx.stroke();return true;
    case 'heart':
     polygon([[0,51],[-47,7],[-51,-15],[-39,-34],[-19,-37],[0,-19],[19,-37],[39,-34],[51,-15],[47,7]],fill);return true;
    case 'warning':
     polygon([[0,-54],[55,45],[-55,45]],fill);rect(-4,-20,8,36,ink);circle(0,30,5,ink);return true;
    case 'check':
     ctx.beginPath();ctx.moveTo(-43,0);ctx.lineTo(-13,29);ctx.lineTo(47,-35);ctx.strokeStyle=ink;ctx.lineWidth=12;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();return true;
    case 'play':
     polygon([[-31,-49],[47,0],[-31,49]],fill);return true;
    case 'arrow':
     rect(-52,-10,69,20,fill);polygon([[5,-41],[52,0],[5,41]],fill);return true;
    case 'signal': case 'interface':
     rect(-43,23,15,35,fill);rect(-15,5,15,53,fill);rect(13,-16,15,74,fill);rect(41,-39,15,97,fill);return true;
    case 'device':
     rect(-48,-34,96,64,fill);rect(-57,34,114,10,fill);rect(-14,-24,28,6,ink);return true;
    case 'settings':
     circle(0,0,37,fill);circle(0,0,15,'#182633');for(var spoke=0;spoke<8;spoke++){var sa=spoke*Math.PI/4;rect(Math.cos(sa)*45-5,Math.sin(sa)*45-5,10,10,fill);}return true;
    case 'person': case 'user':
     circle(0,-29,20,fill);rect(-35,-4,70,50,fill);rect(-44,44,88,9,fill);return true;
    default:return false;
   }
  }
 function drawGraphicMotif(ctx,motif,seed){
  var state=2166136261,text=String(seed||motif),i,j,x,y,a,r,base='#15263a',accent='#61b7ff',secondary='#eef5ff',full=false;
  var palette={paper:['#d8c8a5','#b4a17d','#f1e7d2'], 'graph-paper':['#edf1ee','#7ea7bf','#b6cbd4'],woodgrain:['#6f4228','#3d2417','#bd8a52'],metal:['#727e86','#3d454b','#d6e0e4'],stone:['#60666a','#30363a','#a3a7a5'],fabric:['#34516a','#172d42','#80a2ba'],wall:['#8a5038','#4b3025','#c58b69'],'brush-stroke':['#d7cbb7','#786c5c','#f4ead8'],grunge:['#292a2c','#151618','#9a8e7e'],'film-frame':['#161719','#090a0c','#d8d2c8'],'light-leak':['#ff852e','#d92248','#ffd887'],'film-burn':['#ed4d18','#921c30','#ffc45f'],vhs:['#17262d','#13171b','#54e6ff'],'film-scratch':['#25272b','#101214','#d3d9dd'],particles:['#132339','#0e1722','#ffd77f'],grain:['#27292d','#121417','#d5d3ce'],'color-treatment':['#202239','#271a45','#ff6c8c'],vignette:['#28364a','#080a10','#8bb9d7'],'light-source':['#24334c','#111722','#ffe18b'],pattern:['#172c45','#0c1b2a','#6ab9df'],geometric:['#162843','#0a182a','#f2ab66'],liquid:['#0a334a','#061c2c','#5ce3ee'],flow:['#102e48','#0b2035','#78b7f2'],gradient:['#273b80','#121a37','#fb7299'],typography:['#14263b','#09131e','#dbe9f2'],'abstract-background':['#182e45','#0b1828','#a3d7ff'],'material-texture':['#4b555d','#252b30','#ccd0d2'],electric:['#071a38','#030b18','#72dcff'],sparks:['#1c1d20','#0a0b0e','#ffd16b'],smoke:['#20272c','#101418','#b7c3cc'],fire:['#351b15','#160d0c','#ffb238'],energy:['#092440','#04101f','#78e2ff'],slash:['#111820','#090d12','#d9f0ff'],splatter:['#27151a','#110d11','#ff5a65'],explosion:['#3b1b12','#170e0b','#ffb24a'],'speed-lines':['#101a23','#080d12','#d9edff'],impact:['#291913','#110c0a','#ff8e47'],'film-overlay':['#28231f','#121211','#d6ad73']};
  var colors=palette[motif];if(!colors)return false;base=colors[0];accent=colors[1];secondary=colors[2];
  for(i=0;i<text.length;i++)state=(state*33+text.charCodeAt(i))%2147483647;
  function rnd(){state=(state*48271)%2147483647;return state/2147483647;}
  function fillBase(color){ctx.fillStyle=color||base;ctx.fillRect(-W/2,-H/2,W,H);}
  function line(x1,y1,x2,y2,width,color){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.lineWidth=width;ctx.strokeStyle=color||secondary;ctx.stroke();}
  function dot(x,y,r,color,alpha){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=color||secondary;ctx.globalAlpha=alpha==null?1:alpha;ctx.fill();}
  function polygon(points,color){ctx.beginPath();for(var q=0;q<points.length;q++){if(q===0)ctx.moveTo(points[q][0],points[q][1]);else ctx.lineTo(points[q][0],points[q][1]);}ctx.closePath();ctx.fillStyle=color||secondary;ctx.fill();}
  function glow(x,y,rx,ry,c1,c2){var gradient=ctx.createRadialGradient(x,y,2,x,y,Math.max(rx,ry));gradient.addColorStop(0,c1||secondary);gradient.addColorStop(1,c2||'rgba(0,0,0,0)');ctx.fillStyle=gradient;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();}
  if(motif==='paper'){fillBase(base);for(i=0;i<24;i++){x=(rnd()-.5)*W;y=(rnd()-.5)*H;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(x+30,y+(rnd()-.5)*18,x+65+rnd()*100,y+(rnd()-.5)*28);ctx.strokeStyle=i%4===0?secondary:accent;ctx.globalAlpha=.15+rnd()*.24;ctx.lineWidth=1+rnd()*3;ctx.stroke();}polygon([[W/2-44,-H/2],[W/2,-H/2],[W/2,-H/2+44]],secondary);return true;}
  if(motif==='woodgrain'){fillBase(base);for(i=0;i<24;i++){y=-H/2+i*H/23;ctx.beginPath();ctx.moveTo(-W/2,y);ctx.bezierCurveTo(-W*.2,y-12,0,y+16,W/2,y-4);ctx.strokeStyle=i%3?accent:secondary;ctx.globalAlpha=.26+rnd()*.35;ctx.lineWidth=1+rnd()*4;ctx.stroke();}for(i=0;i<3;i++){x=(rnd()-.5)*W;y=(rnd()-.5)*H;ctx.beginPath();ctx.ellipse(x,y,9+rnd()*16,3+rnd()*8,0,0,Math.PI*2);ctx.strokeStyle=secondary;ctx.lineWidth=2;ctx.stroke();}return true;}
  if(motif==='metal'){var grad=ctx.createLinearGradient(0,-H/2,0,H/2);grad.addColorStop(0,secondary);grad.addColorStop(.16,base);grad.addColorStop(.5,accent);grad.addColorStop(.82,base);grad.addColorStop(1,secondary);fillBase(grad);for(i=0;i<18;i++)line(-W/2,-H/2+i*H/17,W/2,-H/2+i*H/17,1,'rgba(255,255,255,.22)');for(x=-W/2+18;x<W/2;x+=54){dot(x,-H/2+15,3,secondary,.8);dot(x,H/2-15,3,accent,.8);}return true;}
  if(motif==='stone'||motif==='material-texture'||motif==='grunge'){fillBase(base);for(i=0;i<46;i++){x=(rnd()-.5)*W;y=(rnd()-.5)*H;r=2+rnd()*20;if(i%4===0){line(x,y,x+(rnd()-.5)*75,y+(rnd()-.5)*50,1+rnd()*2,accent);}else dot(x,y,r,i%3?accent:secondary,.08+rnd()*.23);}return true;}
  if(motif==='fabric'){fillBase(base);for(i=0;i<24;i++){x=-W/2+i*W/23;line(x,-H/2,x,H/2,1.5,i%2?accent:secondary);}for(i=0;i<16;i++){y=-H/2+i*H/15;line(-W/2,y,W/2,y,1.5,i%2?secondary:accent);}return true;}
  if(motif==='wall'){fillBase(base);for(i=0;i<5;i++)for(j=0;j<8;j++){x=-W/2+j*W/8+(i%2)*W/16;y=-H/2+i*H/5;ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.strokeRect(x,y,W/8,H/5);}return true;}
  if(motif==='brush-stroke'){fillBase(base);for(i=0;i<19;i++){x=(rnd()-.5)*W;y=(rnd()-.5)*H;ctx.beginPath();ctx.moveTo(x-40-rnd()*80,y-10);ctx.quadraticCurveTo(x,y+(rnd()-.5)*24,x+45+rnd()*90,y+7);ctx.lineWidth=4+rnd()*23;ctx.lineCap='round';ctx.strokeStyle=i%3?accent:secondary;ctx.globalAlpha=.14+rnd()*.37;ctx.stroke();}return true;}
  if(motif==='graph-paper'){fillBase(base);for(i=0;i<14;i++)line(-W/2+i*W/13,-H/2,-W/2+i*W/13,H/2,1,accent);for(i=0;i<9;i++)line(-W/2,-H/2+i*H/8,W/2,-H/2+i*H/8,1,accent);return true;}
  if(motif==='film-frame'){fillBase('#0a0b0d');ctx.fillStyle=base;ctx.fillRect(-W/2+18,-H/2+25,W-36,H-50);for(i=0;i<9;i++){ctx.fillStyle=secondary;ctx.fillRect(-W/2+15+i*W/9,-H/2+7,18,10);ctx.fillRect(-W/2+15+i*W/9,H/2-17,18,10);}return true;}
  if(motif==='pattern'||motif==='geometric'||motif==='abstract-background'||motif==='gradient'||motif==='typography'){var bg=ctx.createLinearGradient(-W/2,-H/2,W/2,H/2);bg.addColorStop(0,base);bg.addColorStop(1,accent);fillBase(bg);for(i=0;i<24;i++){x=-W/2+(i%6)*W/5;y=-H/2+Math.floor(i/6)*H/3;r=12+rnd()*32;if(i%3===0)dot(x,y,r,secondary,.45);else if(i%3===1)polygon([[x,y-r],[x+r,y+r],[x-r,y+r]],secondary);else ctx.strokeRect(x-r,y-r,r*2,r*2);}return true;}
  if(motif==='light-leak'||motif==='light-source'){glow(-W*.43,-H*.22,W*.72,H*.85,secondary,'rgba(0,0,0,0)');glow(-W*.48,H*.15,W*.54,H*.72,base,'rgba(0,0,0,0)');for(i=0;i<5;i++)line(-W/2+i*20,-H/2,-W/2+i*26,H/2,2,secondary);return true;}
  if(motif==='film-burn'){var burn=ctx.createLinearGradient(-W/2,0,W/2,0);burn.addColorStop(0,secondary);burn.addColorStop(.27,base);burn.addColorStop(1,'rgba(20,10,10,0)');fillBase(burn);for(i=0;i<14;i++){x=-W/2+rnd()*W*.5;y=(rnd()-.5)*H;glow(x,y,18+rnd()*55,15+rnd()*48,secondary,accent);}return true;}
  if(motif==='vhs'||motif==='film-scratch'||motif==='grain'||motif==='particles'||motif==='film-overlay'){fillBase(motif==='particles'?'#101a28':base);var n=motif==='grain'?170:motif==='particles'?55:motif==='vhs'?24:38;for(i=0;i<n;i++){x=(rnd()-.5)*W;y=(rnd()-.5)*H;if(motif==='vhs')ctx.fillRect(-W/2,y,W*(.2+rnd()*.8),1+rnd()*5);else if(motif==='film-scratch')line(x,-H/2,x+(rnd()-.5)*8,H/2,1+rnd()*2,secondary);else if(motif==='particles')dot(x,y,1+rnd()*4,secondary,.25+rnd()*.7);else dot(x,y,.6+rnd()*1.8,secondary,.1+rnd()*.55);}return true;}
  if(motif==='color-treatment'){fillBase(base);for(i=0;i<6;i++){ctx.fillStyle=i%2?accent:secondary;ctx.globalAlpha=.12+i*.07;ctx.fillRect(-W/2,-H/2+i*H/6,W,H/6);}return true;}
  if(motif==='vignette'){fillBase(base);var vg=ctx.createRadialGradient(0,0,20,0,0,W*.72);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.9)');ctx.fillStyle=vg;ctx.fillRect(-W/2,-H/2,W,H);return true;}
  if(motif==='fire'){fillBase('#1d1110');var fg=ctx.createLinearGradient(0,H/2,0,-H/2);fg.addColorStop(0,secondary);fg.addColorStop(.48,base);fg.addColorStop(1,'rgba(90,15,10,0)');fillBase(fg);for(i=0;i<11;i++){x=-W/2+i*W/10;y=H*.36;polygon([[x-22,y],[x+(rnd()-.5)*45,-H*.15-rnd()*H*.4],[x+28,y]],i%3?base:secondary);}return true;}
  if(motif==='smoke'){for(i=0;i<22;i++){x=(rnd()-.5)*W*.72;y=H*.48-i*H*.043;glow(x,y,20+rnd()*46,14+rnd()*37,i%3?secondary:base,'rgba(0,0,0,0)');}return true;}
  if(motif==='electric'||motif==='sparks'||motif==='energy'||motif==='explosion'||motif==='impact'){ctx.strokeStyle=secondary;ctx.lineWidth=2.5;for(i=0;i<18;i++){a=i*Math.PI/9;r=40+rnd()*55;var pts=[[Math.cos(a)*r,Math.sin(a)*r]];for(j=1;j<5;j++)pts.push([Math.cos(a)*(r+j*(9+rnd()*17)),Math.sin(a)*(r+j*(9+rnd()*17))+(rnd()-.5)*14]);if(motif==='electric'||motif==='energy'){ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(j=1;j<pts.length;j++)ctx.lineTo(pts[j][0],pts[j][1]);ctx.stroke();}else{line(pts[0][0],pts[0][1],pts[4][0],pts[4][1],1+rnd()*3,secondary);dot(pts[0][0],pts[0][1],2+rnd()*3,base);}}if(motif==='energy'){ctx.beginPath();ctx.arc(0,0,35,0,Math.PI*2);ctx.arc(0,0,57,0,Math.PI*2);ctx.stroke();}return true;}
  if(motif==='slash'||motif==='speed-lines'){for(i=0;i<28;i++){x=(rnd()-.5)*W;y=(rnd()-.5)*H;line(x,y,x+(motif==='slash'?35+rnd()*40:65+rnd()*130),y+(motif==='slash'?30+rnd()*34:0),2+rnd()*5,i%3?secondary:base);}return true;}
  if(motif==='splatter'){for(i=0;i<50;i++){x=(rnd()-.5)*W;y=(rnd()-.5)*H;dot(x,y,2+rnd()*13,i%4?secondary:base,.35+rnd()*.6);}return true;}
  if(motif==='liquid'||motif==='flow'){var lg=ctx.createLinearGradient(0,-H/2,0,H/2);lg.addColorStop(0,base);lg.addColorStop(1,accent);fillBase(lg);for(i=0;i<9;i++){ctx.beginPath();ctx.moveTo(-W/2,-H/2+i*H/8);for(j=0;j<=16;j++){x=-W/2+j*W/16;y=-H/2+i*H/8+Math.sin(j*.65+i*.8)*16;ctx.lineTo(x,y);}ctx.strokeStyle=i%2?secondary:base;ctx.globalAlpha=.2+rnd()*.35;ctx.lineWidth=4+rnd()*14;ctx.stroke();}return true;}
  return false;
 }
 function drawGenericGraphic(ctx,entry,profile,pose){
  var g=profile.generator||{},visual=g.visualKind||'graphic',archetype=g.archetype||'',name=String(profile.name||entry&&entry.name||''),phase=Number(pose.phase)||0,
   x=W/2+(pose.position[0]||0)*W/1280,y=H/2+(pose.position[1]||0)*H/720,
   scaleX=pose.scale&&Number.isFinite(pose.scale[0])?pose.scale[0]:1,scaleY=pose.scale&&Number.isFinite(pose.scale[1])?pose.scale[1]:1,
   accent=/energy|spark|fire/.test(archetype)?'#ffac55':/texture|grunge|brush/.test(archetype)?'#d7cbb7':'#61b7ff',secondary='#f4f7fc',i,r=58,pulse=.92+.08*Math.sin(phase*5);
   ctx.save();ctx.translate(x,y);ctx.rotate((pose.rotation||0)*Math.PI/180);ctx.scale(scaleX*pulse,scaleY*pulse);ctx.globalAlpha=clamp(pose.opacity==null?1:pose.opacity);
   if((visual==='icon'||visual==='illustration')&&drawSemanticGraphic(ctx,g.graphicSymbol,g.graphicStyle,accent,secondary)){ctx.restore();return;}
   if(g.graphicMotif&&drawGraphicMotif(ctx,g.graphicMotif,profile.id||name)){ctx.restore();return;}
  if(visual==='background'||visual==='texture'||visual==='overlay'){
   var gradient=ctx.createLinearGradient(0,0,W,H);gradient.addColorStop(0,visual==='texture'?'#25282c':'#15263a');gradient.addColorStop(1,visual==='texture'?'#101114':'#202a36');
   ctx.fillStyle=gradient;ctx.fillRect(-W/2,-H/2,W,H);ctx.strokeStyle=accent;ctx.lineWidth=2;
   if(/pattern|geometric/.test(archetype)){for(i=-W;i<W;i+=36){ctx.beginPath();ctx.moveTo(i,-H/2);ctx.lineTo(i+H,H/2);ctx.stroke();}}
   else{for(i=0;i<24;i++){var px=((i*73)%W)-W/2,py=((i*47)%H)-H/2;ctx.beginPath();ctx.arc(px,py,1.5+(i%3),0,Math.PI*2);ctx.fillStyle=accent;ctx.fill();}}
  }else if(visual==='effect-element'){
   ctx.strokeStyle=accent;ctx.lineWidth=4;ctx.beginPath();
   for(i=0;i<18;i++){var angle=i*Math.PI/9,inner=22+(i%2)*5,outer=52+(i%3)*9;ctx.moveTo(Math.cos(angle)*inner,Math.sin(angle)*inner);ctx.lineTo(Math.cos(angle)*outer,Math.sin(angle)*outer);}
   ctx.stroke();ctx.fillStyle=secondary;ctx.beginPath();ctx.arc(0,0,12,0,Math.PI*2);ctx.fill();
  }else if(visual==='illustration'){
   ctx.fillStyle=accent;ctx.beginPath();ctx.arc(0,-27,20,0,Math.PI*2);ctx.fill();ctx.fillStyle=secondary;ctx.fillRect(-23,0,46,57);
   ctx.fillStyle=accent;ctx.fillRect(-41,51,82,10);ctx.fillStyle='rgba(255,255,255,.55)';ctx.fillRect(-12,7,24,4);
  }else if(visual==='icon'||archetype.indexOf('-icon')!==-1){
   ctx.fillStyle='rgba(27,45,63,.96)';ctx.strokeStyle=accent;ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.stroke();
   ctx.strokeStyle=secondary;ctx.fillStyle=secondary;ctx.lineWidth=5;
   if(/device|interface/.test(archetype)){ctx.strokeRect(-31,-23,62,46);ctx.beginPath();ctx.arc(0,0,12,0,Math.PI*2);ctx.stroke();ctx.fillRect(-10,31,20,4);}
   else if(/vehicle/.test(archetype)){ctx.fillRect(-35,-5,70,25);ctx.beginPath();ctx.arc(-21,22,9,0,Math.PI*2);ctx.arc(21,22,9,0,Math.PI*2);ctx.fill();}
   else if(/people/.test(archetype)){ctx.beginPath();ctx.arc(0,-22,13,0,Math.PI*2);ctx.fill();ctx.fillRect(-20,-3,40,36);}
   else if(/bank|finance|financial/i.test(name)){ctx.beginPath();ctx.moveTo(-38,-14);ctx.lineTo(0,-38);ctx.lineTo(38,-14);ctx.closePath();ctx.fill();ctx.fillRect(-39,-11,78,6);for(i=-2;i<=2;i++){if(i%2===0)ctx.fillRect(i*12-4,-3,8,34);}ctx.fillRect(-39,33,78,6);ctx.fillRect(-43,40,86,7);}
   else{ctx.font='bold 40px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText((name.replace(/[^A-Za-z0-9]/g,'').charAt(0)||'C').toUpperCase(),0,1);}
  }else{
   ctx.fillStyle=accent;ctx.strokeStyle=secondary;ctx.lineWidth=5;ctx.beginPath();
   if(archetype==='circle'||archetype==='smoke-effect')ctx.arc(0,0,r,0,Math.PI*2);
   else if(archetype==='triangle'){ctx.moveTo(0,-r);ctx.lineTo(r*.88,r*.72);ctx.lineTo(-r*.88,r*.72);ctx.closePath();}
   else if(archetype==='star'){for(i=0;i<10;i++){var starAngle=-Math.PI/2+i*Math.PI/5,starRadius=i%2===0?r:r*.43,starX=Math.cos(starAngle)*starRadius,starY=Math.sin(starAngle)*starRadius;if(i===0)ctx.moveTo(starX,starY);else ctx.lineTo(starX,starY);}ctx.closePath();}
   else if(archetype==='arrow'){ctx.moveTo(-r*.9,-r*.24);ctx.lineTo(r*.1,-r*.24);ctx.lineTo(r*.1,-r*.65);ctx.lineTo(r*.9,0);ctx.lineTo(r*.1,r*.65);ctx.lineTo(r*.1,r*.24);ctx.lineTo(-r*.9,r*.24);ctx.closePath();}
   else if(archetype==='diamond'){ctx.moveTo(0,-r);ctx.lineTo(r,0);ctx.lineTo(0,r);ctx.lineTo(-r,0);ctx.closePath();}
   else if(archetype==='line'){ctx.moveTo(-75,0);ctx.lineTo(75,0);}
   else{ctx.rect(-r*.78,-r*.55,r*1.56,r*1.1);}
   if(archetype!=='line')ctx.fill();ctx.stroke();
  }
  ctx.restore();
 }
 function renderFallback(ctx,entry,profile,time,resources){
  var subject=profile&&profile.subjectKind==='graphic'?{kind:'graphic',label:'생성 그래픽 미리보기'}:subjectFor(entry),s=sampleProfile(profile,time),assetReady=true;resources=resources||{};
  ctx.save();ctx.clearRect(0,0,W,H);ctx.fillStyle='#101010';ctx.fillRect(0,0,W,H);
  if(subject.kind==='graphic')drawGenericGraphic(ctx,entry,profile,s);
  else if(subject.kind==='object'||subject.kind==='scene'){
   var image=subject.kind==='object'?resources.logo:(s.sceneId==='A'?resources.before:resources.after),box=image?(subject.kind==='object'?imageBox(image):{x:0,y:0,width:W,height:H}):null,origin=s.origin||[.5,.5];
   assetReady=!!image;
   if(image){var x=box.x+box.width*origin[0],y=box.y+box.height*origin[1];ctx.translate(x+s.position[0]*W/1280,y+s.position[1]*H/720);ctx.rotate(s.rotation*Math.PI/180);ctx.scale(s.scale[0],s.scale[1]);ctx.translate(-x,-y);ctx.globalAlpha=clamp(s.opacity);if(s.blur>0)ctx.filter='blur('+(s.blur*W/1280)+'px)';if(profile&&profile.kind==='shadow')drawShadow(ctx,profile,image,box);ctx.drawImage(image,box.x,box.y,box.width,box.height);}
  }else if(subject.kind==='text'||subject.kind==='title'){
    var titleDesign=profile&&profile.generator&&profile.generator.titleDesign||'';ctx.font=/timer|counter/.test(titleDesign)?'bold 27px monospace':titleDesign==='quote'?'italic 27px Georgia':'bold 25px Arial';ctx.textAlign='center';ctx.fillStyle=titleDesign==='neon'?'#a5f6ff':'#fff';ctx.strokeStyle=titleDesign==='neon'?'#197ceb':'#101820';ctx.lineWidth=titleDesign==='neon'?2:1;if(titleDesign==='neon'){ctx.shadowColor='#38caff';ctx.shadowBlur=12;}var word=s.text||'CONTENTRIUM',lineCount=Math.min(5,Math.max(1,Number(profile&&profile.lineCount)||1)),lineSize=Math.ceil(word.length/lineCount),cursor=0,line;
    for(line=0;line<lineCount;line++){var segment=word.slice(cursor,cursor+lineSize),spacing=Math.min(22,W/(segment.length+1)),start=W/2-(segment.length-1)*spacing/2,lineY=H/2+(line-(lineCount-1)/2)*38;for(var j=0;j<segment.length;j++){var glyphIndex=cursor+j,pose=s.glyphs&&s.glyphs[glyphIndex]||[0,0,0,1,1,1,0,1,0,0];ctx.save();ctx.globalAlpha=clamp(pose[7]);ctx.translate(start+j*spacing+pose[0]*W/1280+(j-(segment.length-1)/2)*pose[9]*25/1000,lineY+pose[1]*H/720);ctx.rotate(pose[6]*Math.PI/180);ctx.scale(pose[3],pose[4]);if(/outline/.test(titleDesign)&&typeof ctx.strokeText==='function')ctx.strokeText(segment[j],0,0);ctx.fillText(segment[j],0,0);ctx.restore();}cursor+=segment.length;}
  }
  ctx.restore();return{subject:subject,pose:s,assetReady:assetReady};
 }
 function draw(card,time){
  var profile=profiles[card.variant.id]||genericProfile(card.entry,card.variant),subject=previewSubject(card.entry,card.variant),resources={};
  if(subject.kind==='object')resources.logo=imageAsset('assets/preview-logo.png');
  if(subject.kind==='scene'){resources.before=imageAsset('assets/preview-before.png');resources.after=imageAsset('assets/preview-after.png');}
  var rendered=renderFallback(card.ctx,card.entry,profile,time,resources),s=rendered.pose;
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
  if(source){var video=document.createElement('video'),subject=previewSubject(entry,variant);video._cpEntry=entry;video._cpVariant=variant;video.src=source;video.muted=true;video.loop=true;video.autoplay=playbackActive;video.playsInline=true;video.preload='metadata';video.setAttribute('data-preview-kind',subject.kind);video.setAttribute('aria-label',entry.name+' '+variant.name+' · '+subject.label+' · AE 렌더');video.onerror=function(){if(!video.isConnected)return;unmount(wrap);video.remove();if(variant.type===11){var message=document.createElement('span');message.className='preview-message';message.textContent='글자 팩 미리보기를 불러올 수 없습니다.';wrap.appendChild(message);}else mountCanvas(wrap,entry,variant,true);};wrap.appendChild(video);videos.push(video);watch(video);if(audioSelection)reconcileAudio();return;}
  mountCanvas(wrap,entry,variant);
 }
 function mountCanvas(wrap,entry,variant,mediaFailed){
  var canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;canvas.setAttribute('aria-label',entry.name+' '+variant.name+' · '+previewSubject(entry,variant).label);wrap.appendChild(canvas);
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
 var api={mount:mount,unmount:unmount,clear:clear,setPlaybackActive:setPlaybackActive,setAudioResolver:setAudioResolver,setAudioSelection:setAudioSelection,setAudioStateListener:setAudioStateListener,getAudioState:getAudioState,loadProfiles:loadProfiles,drawScene:scene,drawGraphicMotif:drawGraphicMotif,sceneDescription:sceneDescription,subjectFor:subjectFor,previewSubject:previewSubject,genericProfile:genericProfile,renderFallback:renderFallback,sampleProfile:sampleProfile,interpolateRows:interpolateRows,renderedSource:renderedSource,setConvertedLibraryRoot:setConvertedLibraryRoot};scope.ContentriumPreview=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
