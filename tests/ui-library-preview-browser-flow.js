async page => {
 if(!/^http:\/\/127\.0\.0\.1:/.test(page.url()))throw Error('Isolated local browser required');
 const context=await page.context().browser().newContext({viewport:{width:1100,height:800}}),target=await context.newPage(),checks=[],errors=[];
 function check(ok,name){if(!ok)throw Error(name);checks.push(name);}
 try{
  await target.route('**/*.webm',async route=>{const response=await route.fetch(),body=await response.body(),range=/bytes=(\d+)-(\d*)/.exec(route.request().headers().range||'');if(!range)return route.fulfill({response});const start=+range[1],end=range[2]?Math.min(+range[2],body.length-1):body.length-1;await route.fulfill({status:206,contentType:'video/webm',headers:{'accept-ranges':'bytes','content-range':'bytes '+start+'-'+end+'/'+body.length,'content-length':String(end-start+1)},body:body.subarray(start,end+1)});});
  await target.route('**/__library-preview-fixture',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>'}));
  await target.goto(new URL('/__library-preview-fixture',page.url()).href);
  await target.addScriptTag({url:new URL('/ui-library.js',page.url()).href}).catch(()=>{});
  check(await target.evaluate(()=>typeof window.ContentriumLibrary?.mountPreview==='function'),'actual local library media adapter is available');
  target.on('pageerror',e=>errors.push(e.message));
  await target.evaluate(()=>{
   document.body.innerHTML='<main style="display:flex;gap:10px"><div id="one" style="width:320px;height:180px"></div><div id="two" style="width:320px;height:180px"></div><div id="bad" style="width:320px;height:180px"></div></main>';
   window.__libraryHandles=[];
   __libraryHandles.push(ContentriumLibrary.mountPreview(document.getElementById('one'),{id:'image',kind:'image',name:'실제 로고',preview:'assets/preview-logo.png'}));
   __libraryHandles.push(ContentriumLibrary.mountPreview(document.getElementById('two'),{id:'video',kind:'video',name:'실제 영상',preview:'library/previews/9e4.webm'}));
  });
  await target.waitForFunction(()=>document.querySelector('#one img').naturalWidth>0&&document.querySelector('#two video').readyState>=2);
  check(await target.locator('#one img').getAttribute('alt')==='실제 로고','image preview decodes the actual source');
  await target.waitForFunction(()=>document.querySelector('#two video').currentTime>.2);
  check(await target.evaluate(()=>!document.querySelector('#two video').paused),'visible local video plays');
  await target.evaluate(()=>{window.__held=document.querySelector('#two video').currentTime;__libraryHandles[1].setActive(false);});
  check(await target.evaluate(()=>document.querySelector('#two video').paused),'inactive local preview pauses');
  await target.evaluate(()=>__libraryHandles[1].setActive(true));
  await target.waitForFunction(()=>!document.querySelector('#two video').paused);
  check(await target.evaluate(()=>document.querySelector('#two video').currentTime>=__held),'resuming local video does not rewind');
  await target.evaluate(()=>ContentriumLibrary.openPreview({id:'image',kind:'image',name:'확대 로고',preview:'assets/preview-logo.png'}));
  await target.waitForFunction(()=>document.querySelector('.library-preview-dialog img')?.naturalWidth>0);
  check(await target.locator('.library-preview-dialog').evaluate(n=>n.open),'larger preview is an actual open dialog');
  await target.getByRole('button',{name:'미리보기 닫기',exact:true}).click();await target.locator('.library-preview-dialog').waitFor({state:'detached'});check(await target.locator('.library-preview-dialog').count()===0,'closing larger preview removes its media');
  await target.evaluate(()=>__libraryHandles.push(ContentriumLibrary.mountPreview(document.getElementById('bad'),{id:'missing',kind:'image',name:'없는 이미지',preview:'assets/missing-library-fixture.png'})));
  await target.waitForFunction(()=>document.querySelector('#bad').dataset.previewState==='failed');
  check(await target.locator('#bad').innerText()==='미리보기를 불러오지 못했습니다.','failed media reports its decode failure');
  check(await target.evaluate(()=>ContentriumLibrary.canImport({id:'psd',kind:'image',path:'C:/source.psd'},{})),'preview decode support does not decide native import support');
  await target.evaluate(()=>{window.__released=document.querySelector('#two video');__libraryHandles.forEach(h=>h.destroy());});
  check(await target.evaluate(()=>__released.paused&&!__released.hasAttribute('src')&&!document.querySelector('#two video')),'destroy releases only the owned preview media');
  check(errors.length===0,'media lifecycle produces no script errors: '+errors.join('; '));
  return{ok:true,checkCount:checks.length,checks,scope:'actual browser local media; no native import'};
 }finally{await context.close();}
}
