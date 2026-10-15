(function(scope){
 'use strict';
 var cards=[],frame=0,last=0,observer=null;
 function clamp(v){return Math.max(0,Math.min(1,v));}
 function ease(t,curve,strength){t=clamp(t);if(t===0||t===1)return t;if(curve==='linear')return t;if(curve==='ease')return t*t*(3-2*t);var q=(1-t)*Math.cos(4*Math.PI*t)*Math.exp(-2*t)*(1+Math.sin(Math.PI*t));return 1-(curve==='bounce'?Math.abs(q):q);}
 function describe(entry,variant){
  var name=entry.name.toLowerCase(),v=variant.name.toLowerCase(),category=entry.category.join('/').toLowerCase(),number=Number((name.match(/\d+/)||['1'])[0]);
  return {name:name,variant:v,text:category.indexOf('text presets')>=0,title:category.indexOf('typography')>=0,camera:category.indexOf('/camera')>=0,shape:category.indexOf('shape elements')>=0,curve:name.indexOf('overshoot')>=0?'overshoot':name.indexOf('bounce')>=0?'bounce':name.indexOf('linear')>=0?'linear':'ease',strength:number,axis:[v.indexOf('left')>=0?-1:v.indexOf('right')>=0?1:0,v.indexOf('bottom')>=0||v==='down'?1:v.indexOf('top')>=0||v==='up'?-1:0],reverse:v.indexOf('end')>=0,lines:name.indexOf('3-line')>=0?3:name.indexOf('2-line')>=0?2:1};
 }
 function sample(entry,variant,t){var d=describe(entry,variant),phase=t%3.6,raw=phase<.85?phase/.85:phase<2.4?1:1-(phase-2.4)/.85,p=ease(raw,d.curve,d.strength);return {descriptor:d,progress:p,remaining:1-p,raw:clamp(raw),phase:phase};}
 function logo(ctx,x,y,size){ctx.save();ctx.translate(x,y);ctx.fillStyle='#2d9af4';ctx.beginPath();ctx.arc(0,0,size,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#f9fcff';ctx.lineWidth=size*.18;ctx.lineCap='round';ctx.beginPath();ctx.arc(0,0,size*.51,.23*Math.PI,1.77*Math.PI);ctx.stroke();ctx.restore();}
 function grid(ctx,w,h){var colors=['#073654','#087e8b','#e08f37','#b5455e','#5354a4','#167f6b'];for(var i=0;i<6;i++){ctx.fillStyle=colors[i];ctx.fillRect(i*w/6,0,w/6+1,h);}ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=1;for(var j=1;j<5;j++){ctx.beginPath();ctx.moveTo(0,j*h/5);ctx.lineTo(w,j*h/5);ctx.stroke();}ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='bold 27px Arial';ctx.fillText('CONTENTRIUM',w/2,h*.53);ctx.font='10px Arial';ctx.fillText('MOTION / CAMERA / DESIGN',w/2,h*.64);}
 function draw(card,time){
  var ctx=card.ctx,w=400,h=225,s=sample(card.entry,card.variant,time),d=s.descriptor,p=s.progress,q=s.remaining,n=d.name,axis=d.axis;
  ctx.save();ctx.clearRect(0,0,w,h);ctx.fillStyle='#050607';ctx.fillRect(0,0,w,h);
  if(d.camera){
   var u=Math.max(0,1-Math.abs(s.phase-1.65)/.6),signed=s.phase<1.65?-1:1,pan=n.indexOf('pan')>=0,zoom=n.indexOf('zoom')>=0,rotate=n.indexOf('rotate')>=0||n.indexOf('twirl')>=0,scale=1+(zoom?(n.indexOf('out')>=0?-0.38:1.8):.3)*u;
   ctx.translate(w/2+(pan?axis[0]*w*u*signed:0),h/2+(pan?axis[1]*h*u*signed:0));ctx.rotate(rotate?u*(n.indexOf('360')>=0?Math.PI*2:Math.PI*.35)*(axis[0]<0?-1:1):0);ctx.scale(Math.max(.15,scale),Math.max(.15,scale));ctx.translate(-w/2,-h/2);if(n.indexOf('blur')>=0||u>.4)ctx.filter='blur('+(u*9)+'px)';grid(ctx,w,h);ctx.filter='none';if(n.indexOf('flash')>=0){ctx.globalAlpha=u;ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);}ctx.restore();return;
  }
  if(d.shape){var slide=card.variant.id==='1d6d',bar=card.variant.id==='1d53',rw=w*(bar?.65:.48),rh=h*(bar?.12:.32),radius=slide?0:bar?rh/2:7.5;ctx.translate(w/2-rw/2+(slide?48*q:0),h/2);ctx.globalAlpha=clamp(p);if(!slide)ctx.scale(Math.max(0,p),1);ctx.fillStyle=slide?'#db3385':'#1a9eeb';ctx.beginPath();ctx.moveTo(radius,-rh/2);ctx.arcTo(rw,-rh/2,rw,rh/2,radius);ctx.arcTo(rw,rh/2,0,rh/2,radius);ctx.arcTo(0,rh/2,0,-rh/2,radius);ctx.arcTo(0,-rh/2,rw,-rh/2,radius);ctx.closePath();ctx.fill();if(!bar){ctx.strokeStyle='#fff';ctx.lineWidth=slide?2.5:1.25;ctx.stroke();}ctx.restore();return;}
  if(d.title){ctx.textAlign='center';ctx.fillStyle='#fff';var words=['CONTENTRIUM','CREATE YOUR STORY','MAKE IT MOVE'].slice(0,d.lines);words.forEach(function(text,i){var pr=ease(s.phase/.75,'ease',1);if(s.phase>2.4)pr=ease((3.25-s.phase)/.75,'ease',1);pr=clamp(pr);ctx.globalAlpha=pr;ctx.font='bold '+(d.lines===1?'26':'20')+'px Arial';ctx.fillText(text,w/2+axis[0]*(1-pr)*24,h/2+(i-(d.lines-1)/2)*26+axis[1]*(1-pr)*14+7);});ctx.restore();return;}
  if(d.text){
   var text='CONTENTRIUM',count=text.length,spacing=21,start=w/2-(count-1)*spacing/2,stagger=.025;
   for(var i=0;i<count;i++){var index=d.reverse?count-1-i:i,raw=s.phase<2.4?(s.phase-index*stagger)/.72:(3.25-s.phase-index*stagger)/.72,pr=ease(raw,d.curve,d.strength),rem=1-pr,x=start+i*spacing,y=h/2+8;
    ctx.save();if(n.indexOf('fade')>=0||n.indexOf('typewrite')>=0)ctx.globalAlpha=n.indexOf('typewrite')>=0?(raw>0.35?1:0):clamp(pr);
    if(n.indexOf('position')>=0){x+=((axis[0]||(!axis[1]?1:0))*52)*rem;y+=axis[1]*40*rem;}
    ctx.translate(x,y);if(n.indexOf('random')>=0&&n.indexOf('3d')>=0)ctx.rotate(Math.sin(i*8.7)*rem*2);
    if(n.indexOf('scale')>=0)ctx.scale(Math.max(.01,pr),Math.max(.01,pr));
    ctx.font='bold 27px Arial';ctx.textAlign='center';ctx.fillStyle=n.indexOf('typewrite')>=0?'#f27326':n.indexOf('color')>=0?'hsl('+((i*39+time*28)%360)+',78%,65%)':'#fff';
    if(n.indexOf('stroke')>=0){ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=1;ctx.strokeText(text[i],0,0);}else ctx.fillText(text[i],0,0);ctx.restore();
   }
   ctx.restore();return;
  }
  var x=w/2,y=h/2,scale=1,angle=0;
  if(n.indexOf('position')>=0){x+=axis[0]*145*q;y+=axis[1]*115*q;}
  if(n.indexOf('scale')>=0)scale=Math.max(.002,p);
  if(n.indexOf('rotate')>=0)angle=q*Math.PI*.55;
  if(n.indexOf('fade')>=0)ctx.globalAlpha=clamp(p);
  if(n.indexOf('blur')>=0)ctx.filter='blur('+Math.max(0,q*14)+'px)';
  ctx.translate(x,y);ctx.rotate(angle);if(n.indexOf('edge')>=0)ctx.scale(axis[0]!==0?scale:1,axis[0]===0?scale:1);else ctx.scale(scale,scale);
  if(n.indexOf('shadow')>=0){for(var z=90;z>=1;z-=2){ctx.globalAlpha=(1-z/100)*.075;logo(ctx,z,z,29);}ctx.globalAlpha=1;}
  logo(ctx,0,0,29);ctx.restore();
 }
 function tick(now){frame=requestAnimationFrame(tick);if(now-last<32||document.hidden)return;last=now;cards.forEach(function(card){if(card.visible&&card.canvas.isConnected)draw(card,(now-card.start)/1000);});}
 function mount(wrap,entry,variant){var canvas=document.createElement('canvas');canvas.width=400;canvas.height=225;canvas.setAttribute('aria-label',entry.name+' '+variant.name+' 미리보기');wrap.appendChild(canvas);var offset=(parseInt(variant.id,16)%37)*40,card={canvas:canvas,ctx:canvas.getContext('2d'),entry:entry,variant:variant,visible:true,start:performance.now()-offset};cards.push(card);draw(card,offset/1000);wrap.addEventListener('mouseenter',function(){card.start=performance.now();});if(typeof IntersectionObserver!=='undefined'){if(!observer)observer=new IntersectionObserver(function(changes){changes.forEach(function(change){var card=cards.find(function(c){return c.canvas===change.target;});if(card)card.visible=change.isIntersecting;});});observer.observe(canvas);}if(!frame)frame=requestAnimationFrame(tick);}
 function clear(){if(observer)observer.disconnect();cards=[];}
 var api={mount:mount,clear:clear,describe:describe,sample:sample,ease:ease};scope.ContentriumPreview=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
