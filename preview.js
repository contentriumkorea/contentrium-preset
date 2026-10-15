(function(scope){
 'use strict';
 var cards=[],videos=[],frame=0,last=0,observer=null,profiles={},loading=null,images={},W=400,H=225,HOLD=.6;
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
 function tick(now){frame=requestAnimationFrame(tick);if(now-last<32||document.hidden)return;last=now;cards.forEach(function(card){if(card.visible&&card.canvas.isConnected)draw(card,(now-card.start)/1000);});}
 function watch(target){if(typeof IntersectionObserver==='undefined')return;if(!observer)observer=new IntersectionObserver(function(changes){changes.forEach(function(change){var item=cards.find(function(c){return c.canvas===change.target;});if(item)item.visible=change.isIntersecting;else if(change.target.tagName==='VIDEO'){if(change.isIntersecting){var play=change.target.play();if(play&&play.catch)play.catch(function(){});}else change.target.pause();}});});observer.observe(target);}
 function mount(wrap,entry,variant){
  var source;try{source=renderedSource(variant);}catch(error){var message=document.createElement('span');message.className='preview-message';message.textContent=error.message;wrap.appendChild(message);return;}
  if(source){var video=document.createElement('video'),subject=subjectFor(entry);video.src=source;video.muted=true;video.loop=true;video.autoplay=true;video.playsInline=true;video.preload='metadata';video.setAttribute('data-preview-kind',subject.kind);video.setAttribute('aria-label',entry.name+' '+variant.name+' · '+subject.label+' · AE 렌더');video.onerror=function(){if(!video.isConnected)return;video.remove();mountCanvas(wrap,entry,variant,true);};wrap.appendChild(video);videos.push(video);watch(video);wrap.addEventListener('mouseenter',function(){if(!video.isConnected)return;video.currentTime=0;var play=video.play();if(play&&play.catch)play.catch(function(){});});return;}
  mountCanvas(wrap,entry,variant);
 }
 function mountCanvas(wrap,entry,variant,mediaFailed){
  var canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;canvas.setAttribute('aria-label',entry.name+' '+variant.name+' · '+subjectFor(entry).label);wrap.appendChild(canvas);
  var card={canvas:canvas,ctx:canvas.getContext('2d'),entry:entry,variant:variant,mediaFailed:!!mediaFailed,visible:true,start:performance.now()};cards.push(card);draw(card,0);loadProfiles();
  wrap.addEventListener('mouseenter',function(){card.start=performance.now();draw(card,0);});watch(canvas);if(!frame)frame=requestAnimationFrame(tick);
 }
 function clear(){if(observer)observer.disconnect();cards=[];videos.forEach(function(video){video.onerror=null;video.pause();video.removeAttribute('src');video.load();});videos=[];}
 var api={mount:mount,clear:clear,loadProfiles:loadProfiles,drawScene:scene,sceneDescription:sceneDescription,subjectFor:subjectFor,renderFallback:renderFallback,sampleProfile:sampleProfile,interpolateRows:interpolateRows,renderedSource:renderedSource};scope.ContentriumPreview=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
