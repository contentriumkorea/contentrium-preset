async page=>{
 const ctx=await page.context().browser().newContext({viewport:{width:1100,height:800}}),p=await ctx.newPage(),checks=[],errors=[];function check(v,n){if(!v)throw Error(n);checks.push(n);}
 try{
  await p.route('**/__thumb-fixture',r=>r.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));
  await p.route('**/*.webm',async route=>{const response=await route.fetch(),body=await response.body(),range=/bytes=(\d+)-(\d*)/.exec(route.request().headers().range||'');if(!range)return route.fulfill({response});const start=+range[1],end=range[2]?Math.min(+range[2],body.length-1):body.length-1;await route.fulfill({status:206,contentType:'video/webm',headers:{'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${body.length}`},body:body.subarray(start,end+1)});});
  await p.goto(new URL('/__thumb-fixture',page.url()).href);p.on('pageerror',e=>errors.push(e.message));await p.addScriptTag({url:new URL('/ui-library.js',page.url()).href});await p.addScriptTag({url:new URL('/ui-thumbnails.js',page.url()).href});
  const result=await p.evaluate(async()=>{
   const plan={item:{kind:'video'},files:['library/previews/9e4.webm'],options:{},signal:new AbortController().signal,progress:n=>window.__progress=n};
   const bytes=await ContentriumThumbnails.createRenderer()(plan),url=URL.createObjectURL(new Blob([bytes],{type:'image/png'})),img=new Image();img.src=url;await img.decode();
   return{width:img.width,height:img.height,bytes:bytes.length,url,progress:__progress};
  });check(result.width===320&&result.height===2160,'actual video renders twelve correctly sized sprite frames');check(result.progress===12&&result.bytes>1000,'actual renderer reports frame progress');
  await p.evaluate(url=>{
   document.body.innerHTML='<div id="one" style="width:320px;height:180px;position:relative;overflow:hidden"></div><div id="peer" style="width:320px;height:180px"></div>';
   window.__events=[];const artifact={url,width:320,height:180,frames:12};window.__thumbManager={request:async()=>({state:'ready',artifact}),subscribe:fn=>{__events.push(fn);return()=>{}}};window.__preview=ContentriumLibrary.mountPreview(document.querySelector('#one'),{id:'sequence',kind:'image-sequence',path:'x.png'},{thumbnails:__thumbManager});window.__peer=ContentriumLibrary.mountPreview(document.querySelector('#peer'),{kind:'video',preview:'library/previews/9e4.webm'});window.__peerNode=document.querySelector('#peer video');
  },result.url);
  await p.waitForSelector('#one .library-sprite');await p.locator('#one').hover({position:{x:5,y:80}});check(await p.locator('#one').getAttribute('data-sprite-frame')==='0','left hover shows first frame');await p.locator('#one').hover({position:{x:315,y:80}});check(await p.locator('#one').getAttribute('data-sprite-frame')==='11','right hover shows final frame');
   check(await p.evaluate(()=>document.querySelector('#peer video')===__peerNode),'sprite changes preserve unrelated video identity');
   await p.evaluate(url=>{window.__large=ContentriumLibrary.openPreview({id:'video',kind:'video',preview:'library/previews/9e4.webm'},{artifact:{url,width:320,height:180,frames:12}});},result.url);
   check(await p.locator('.library-large-media video[controls]').count()===1,'cached video still opens a full playable enlarged video');
   await p.waitForFunction(()=>document.querySelector('.library-large-media video').readyState>=2);await p.evaluate(async()=>{const v=document.querySelector('.library-large-media video');await v.play();v.currentTime=.3;});await p.waitForFunction(()=>document.querySelector('.library-large-media video').currentTime>.3);
   check(await p.evaluate(()=>!document.querySelector('.library-large-media video').paused),'enlarged cached video actually plays and seeks');await p.evaluate(()=>__large.close());
   await p.evaluate(url=>{window.__large=ContentriumLibrary.openPreview({id:'ffx',kind:'animation-preset',path:'x.ffx'},{artifact:{url,width:320,height:180,frames:12}});},result.url);check(await p.locator('.library-large-media .library-sprite').count()===1,'non-playable FFX keeps captured sprite enlargement');await p.evaluate(()=>__large.close());
   const refresh=await p.evaluate(async url=>{const root=document.querySelector('#one'),old=root.querySelector('img');let seen;__thumbManager.request=async item=>{seen=item;return{state:'ready',artifact:{url:url+'#changed',sha256:'changed',width:320,height:180,frames:12}};};await __preview.revalidate({id:'sequence',kind:'image-sequence',path:'x.png',sequence:{files:[{path:'x.png'},{path:'changed.png'}]}});return{updated:root.querySelector('img')!==old,files:seen.sequence.files.length,peer:document.querySelector('#peer video')===__peerNode};},result.url);
   check(refresh.updated&&refresh.files===2&&refresh.peer,'mounted refresh checks current sequence membership without replacing unrelated video');
   await p.evaluate(async()=>{__thumbManager.request=async()=>({state:'failed',error:{message:'Source missing'}});await __preview.revalidate({id:'sequence',kind:'image-sequence',path:'x.png',missing:true});});check(await p.locator('#one .library-sprite').count()===0&&await p.locator('#one').getAttribute('data-preview-state')==='failed','failed refresh removes obsolete ready artifact');
   await p.evaluate(()=>{__preview.destroy();__peer.destroy();});check(await p.locator('#one img').count()===0,'destroy releases sprite listeners and image');check(errors.length===0,'browser reports no script errors');return{ok:true,checks,pageErrors:errors};
 }finally{await ctx.close();}
}
