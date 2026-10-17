async page=>{
 if(!/^http:\/\/127\.0\.0\.1:/.test(page.url()))throw Error('Isolated local browser required');
 const context=await page.context().browser().newContext({viewport:{width:1000,height:700}}),target=await context.newPage(),checks=[],failures=[],errors=[];
 const check=(ok,name)=>{checks.push({ok,name});if(!ok)failures.push(name);};
 try{
  await target.route('**/*.webm',async route=>{const response=await route.fetch(),body=await response.body(),range=/bytes=(\d+)-(\d*)/.exec(route.request().headers().range||'');if(!range)return route.fulfill({response});const start=+range[1],end=range[2]?Math.min(+range[2],body.length-1):body.length-1;await route.fulfill({status:206,contentType:'video/webm',headers:{'accept-ranges':'bytes','content-range':'bytes '+start+'-'+end+'/'+body.length,'content-length':String(end-start+1)},body:body.subarray(start,end+1)});});
  await target.route('**/__library-suspend-fixture',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><body style="margin:0"><div id="audio"></div><div id="video" style="height:180px;width:320px"></div><div style="height:2000px"></div></body></html>'}));
  await target.goto(new URL('/__library-suspend-fixture',page.url()).href);await target.addScriptTag({url:new URL('/ui-library.js',page.url()).href});target.on('pageerror',e=>errors.push(e.message));
  await target.evaluate(()=>{
   window.__audio=ContentriumLibrary.mountPreview(document.getElementById('audio'),{kind:'audio',name:'Missing audio',preview:'assets/does-not-exist.wav'});
   window.__video=ContentriumLibrary.mountPreview(document.getElementById('video'),{kind:'video',name:'Owned video',preview:'library/previews/9e4.webm'});
  });
  check(await target.locator('#audio').getAttribute('data-preview-state')==='unverified','audio icon remains unverified until an actual media source is decoded');
  await target.waitForFunction(()=>document.querySelector('#video video').currentTime>.3);
  await target.evaluate(()=>{window.__heldNode=document.querySelector('#video video');window.__time=__heldNode.currentTime;window.scrollTo(0,1800);});
  await target.waitForTimeout(150);
  check(await target.evaluate(()=>__heldNode.paused&&!__heldNode.hasAttribute('src')&&__heldNode.readyState===0),'offscreen personal video releases its decoder and source');
  await target.evaluate(()=>window.scrollTo(0,0));await target.waitForFunction(()=>!__heldNode.paused&&__heldNode.readyState>=2);
  const resumed=await target.evaluate(()=>({same:document.querySelector('#video video')===__heldNode,before:__time,after:__heldNode.currentTime,duration:__heldNode.duration,seeking:__heldNode.seeking}));
  check(resumed.same&&resumed.after>=resumed.before,'returning onscreen reuses the node and restores its playback position '+JSON.stringify(resumed));
  await target.evaluate(()=>{window.__inactiveTime=__heldNode.currentTime;__video.setActive(false);});
  check(await target.evaluate(()=>__heldNode.paused&&!__heldNode.hasAttribute('src')),'inactive personal preview releases owned media resources');
  await target.evaluate(()=>__video.setActive(true));await target.waitForFunction(()=>!__heldNode.paused&&__heldNode.readyState>=2);
  check(await target.evaluate(()=>__heldNode.currentTime>=__inactiveTime),'activation restores the suspended clock');
  await target.evaluate(()=>ContentriumLibrary.openPreview({kind:'video',name:'Large owned video',preview:'library/previews/9e4.webm'}));
  await target.waitForFunction(()=>document.querySelector('.library-preview-dialog video').readyState>=2);
  await target.evaluate(()=>{window.__large=document.querySelector('.library-preview-dialog video');Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await target.waitForTimeout(50);
  check(await target.evaluate(()=>!document.querySelector('.library-preview-dialog')&&__large.paused&&!__large.hasAttribute('src')),'hiding the panel closes and releases the large preview');
  await target.evaluate(()=>{delete document.hidden;__audio.destroy();__video.destroy();var root=document.createElement('div');root.id='nonseekable';root.style='position:fixed;top:0;width:320px;height:180px';document.body.appendChild(root);window.__nonseekable=ContentriumLibrary.mountPreview(root,{kind:'video',preview:'library/previews/9e4.webm?no-range=1'});});
  await target.waitForFunction(()=>document.querySelector('#nonseekable video').currentTime>.15);
  await target.evaluate(()=>{__nonseekable.setActive(false);__nonseekable.setActive(true);});
  await target.waitForFunction(()=>document.querySelector('#nonseekable video').readyState>=2&&!document.querySelector('#nonseekable video').paused);
  check(await target.locator('#nonseekable').getAttribute('data-resume-state')==='restarted','a source without range support restarts explicitly instead of remaining stuck');
  await target.evaluate(()=>__nonseekable.destroy());
  check(errors.length===0,'suspend lifecycle produces no script errors');
  if(failures.length)throw Error(JSON.stringify({checks,failures,errors}));
  return{ok:true,checkCount:checks.length,checks,scope:'real browser actual media and scrolling; no native mutation'};
 }finally{await context.close();}
}
