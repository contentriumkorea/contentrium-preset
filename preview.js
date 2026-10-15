(function(scope){
 'use strict';
 var cards=[],videos=[],frame=0,last=0,observer=null,profiles={},loading=null,W=400,H=225,HOLD=.6;
 function clamp(v){return Math.max(0,Math.min(1,v));}
 function sceneDescription(id){return id==='A'?{id:'A',label:'BEFORE',subject:'mountains and lake',sky:'#113d64',accent:'#ffb854'}:{id:'B',label:'AFTER',subject:'city and moon',sky:'#392b66',accent:'#49dfcd'};}
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
 function scene(ctx,id){
  var d=sceneDescription(id);ctx.fillStyle=d.sky;ctx.fillRect(0,0,W,H);
  ctx.fillStyle=d.accent;ctx.beginPath();ctx.arc(id==='A'?307:83,58,id==='A'?24:20,0,Math.PI*2);ctx.fill();
  if(id==='A'){
   ctx.fillStyle='#426d86';ctx.beginPath();ctx.moveTo(-25,170);ctx.lineTo(87,49);ctx.lineTo(212,170);ctx.lineTo(280,82);ctx.lineTo(424,176);ctx.closePath();ctx.fill();
   ctx.fillStyle='#f5d8ac';ctx.beginPath();ctx.moveTo(59,80);ctx.lineTo(87,49);ctx.lineTo(119,83);ctx.lineTo(91,73);ctx.closePath();ctx.fill();
   ctx.fillStyle='#126a89';ctx.fillRect(0,164,W,61);ctx.strokeStyle='#56a5ac';ctx.lineWidth=2;
   for(var i=0;i<5;i++){ctx.beginPath();ctx.moveTo(35+i*19,177+i*9);ctx.lineTo(340-i*23,177+i*9);ctx.stroke();}
   ctx.fillStyle='#ff9b46';ctx.beginPath();ctx.moveTo(225,184);ctx.lineTo(279,184);ctx.lineTo(268,194);ctx.lineTo(236,194);ctx.closePath();ctx.fill();
  }else{
   ctx.fillStyle='#171d40';ctx.fillRect(0,171,W,54);
   var buildings=[[23,111,45],[85,77,43],[144,123,43],[202,58,49],[266,92,44],[326,120,53]];
   buildings.forEach(function(b,i){ctx.fillStyle=i%2?'#1c5464':'#22506f';ctx.fillRect(b[0],b[1],b[2],190-b[1]);ctx.fillStyle=d.accent;for(var y=b[1]+11;y<173;y+=15)for(var x=b[0]+8;x<b[0]+b[2]-5;x+=13)ctx.fillRect(x,y,4,5);});
   ctx.strokeStyle='#b275b7';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,211);ctx.lineTo(W,211);ctx.stroke();
  }
  ctx.font='bold 11px Arial';ctx.textAlign='left';ctx.fillStyle='#fff';ctx.fillText(d.id+' / '+d.label,13,20);
 }
 function draw(card,time){
  var ctx=card.ctx,profile=profiles[card.variant.id],s=sampleProfile(profile,time),text=profile&&profile.kind==='text';
  ctx.save();ctx.clearRect(0,0,W,H);ctx.fillStyle='#101318';ctx.fillRect(0,0,W,H);
  var origin=s.origin||[.5,.5];ctx.translate(W*origin[0]+s.position[0]*W/1280,H*origin[1]+s.position[1]*H/720);ctx.rotate(s.rotation*Math.PI/180);ctx.scale(s.scale[0],s.scale[1]);ctx.translate(-W*origin[0],-H*origin[1]);ctx.globalAlpha=clamp(s.opacity);if(s.blur>0)ctx.filter='blur('+(s.blur*W/1280)+'px)';
  scene(ctx,s.sceneId);ctx.restore();
  if(text){ctx.save();ctx.fillStyle='rgba(0,0,0,.45)';ctx.fillRect(0,84,W,50);ctx.font='bold 25px Arial';ctx.textAlign='center';ctx.fillStyle='#fff';var word=s.text||'CONTENTRIUM',spacing=22,start=W/2-(word.length-1)*spacing/2;for(var j=0;j<word.length;j++){var pose=s.glyphs&&s.glyphs[j]||[0,0,0,1,1,1,0,1,0,0];ctx.save();ctx.globalAlpha=clamp(pose[7]);ctx.translate(start+j*spacing+pose[0]*W/1280+(j-(word.length-1)/2)*pose[9]*25/1000,117+pose[1]*H/720);ctx.rotate(pose[6]*Math.PI/180);ctx.scale(pose[3],pose[4]);ctx.fillText(word[j],0,0);ctx.restore();}ctx.restore();}
  if(profile&&profile.kind==='shadow')drawShadow(ctx,profile);
  if(!s.ready){ctx.save();ctx.fillStyle='rgba(12,14,18,.8)';ctx.fillRect(0,H-23,W,23);ctx.font='10px Arial';ctx.textAlign='center';ctx.fillStyle='#c6ccd4';ctx.fillText('모션 미리보기 확인 중',W/2,H-8);ctx.restore();}
  card.canvas.dataset.sceneId=s.sceneId;card.canvas.dataset.profileReady=String(s.ready);
 }
 function drawShadow(ctx,profile){
  function setting(name,fallback){var c=profile.controls.find(function(c){return c.name===name;});return c?c.value:fallback;}
  function color(v){return'rgba('+v.slice(0,3).map(function(n){return Math.round(n*255);}).join(',')+','+(v[3]==null?1:v[3])+')';}
  var angle=setting('Angle',135)*Math.PI/180,length=setting('Length',600)*W/1280,start=setting('Gradient Start',[0,0]),end=setting('Gradient End',[1280,720]),gradient=ctx.createLinearGradient(start[0]*W/1280,start[1]*H/720,end[0]*W/1280,end[1]*H/720);
  gradient.addColorStop(0,color(setting('Gradient Start Color',[.35,.35,.35,1])));gradient.addColorStop(1,color(setting('Gradient End Color',[0,0,0,1])));
  ctx.save();ctx.font='bold 34px Arial';ctx.textAlign='center';ctx.fillStyle=gradient;ctx.globalAlpha=clamp(setting('Opacity',100)/100);for(var step=Math.ceil(length);step>=0;step--)ctx.fillText('CREATE',W/2+Math.cos(angle)*step,H/2+11+Math.sin(angle)*step);ctx.fillStyle='#fff';ctx.globalAlpha=1;ctx.fillText('CREATE',W/2,H/2+11);ctx.restore();
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
  if(source){var video=document.createElement('video');video.src=source;video.muted=true;video.loop=true;video.autoplay=true;video.playsInline=true;video.preload='metadata';video.setAttribute('aria-label',entry.name+' '+variant.name+' · AE A/B rendered preview');video.onerror=function(){if(!video.isConnected)return;video.remove();mountCanvas(wrap,entry,variant);};wrap.appendChild(video);videos.push(video);watch(video);wrap.addEventListener('mouseenter',function(){if(!video.isConnected)return;video.currentTime=0;var play=video.play();if(play&&play.catch)play.catch(function(){});});return;}
  mountCanvas(wrap,entry,variant);
 }
 function mountCanvas(wrap,entry,variant){
  var canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;canvas.setAttribute('aria-label',entry.name+' '+variant.name+' · A Before / B After 미리보기');wrap.appendChild(canvas);
  var card={canvas:canvas,ctx:canvas.getContext('2d'),entry:entry,variant:variant,visible:true,start:performance.now()};cards.push(card);draw(card,0);loadProfiles();
  wrap.addEventListener('mouseenter',function(){card.start=performance.now();draw(card,0);});watch(canvas);if(!frame)frame=requestAnimationFrame(tick);
 }
 function clear(){if(observer)observer.disconnect();cards=[];videos.forEach(function(video){video.onerror=null;video.pause();video.removeAttribute('src');video.load();});videos=[];}
 var api={mount:mount,clear:clear,loadProfiles:loadProfiles,drawScene:scene,sceneDescription:sceneDescription,sampleProfile:sampleProfile,interpolateRows:interpolateRows,renderedSource:renderedSource};scope.ContentriumPreview=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
