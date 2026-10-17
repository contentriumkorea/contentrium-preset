async page=>{
 if(!/^http:\/\/127\.0\.0\.1:/.test(page.url()))throw Error('Isolated local browser required');
 const context=await page.context().browser().newContext({viewport:{width:1100,height:850}}),target=await context.newPage(),checks=[],errors=[];
 function check(ok,name){if(!ok)throw Error(name);checks.push(name);}
 try{
  await target.goto(new URL('/',page.url()).href);await target.waitForFunction(()=>window.ContentriumWorkspace);
  await target.addScriptTag({url:new URL('/ui-library.js',page.url()).href});target.on('pageerror',e=>errors.push(e.message));
  await target.evaluate(async()=>{
   const root=document.createElement('div');root.id='library-controller-fixture';document.body.append(root);
   const parts=['toolsRoot','settingsRoot','libraryRoot'];window.__controllerRoots={};parts.forEach(key=>{const n=document.createElement('div');root.append(n);__controllerRoots[key]=n;});
   window.__controllerCalls=[];window.__librarySnapshots=[];window.__controllerState={context:{projectKey:'owned.aep',projectToken:'test-token',compositionId:7,layerIds:[8]},numSelectedLayers:1};
   window.__controllerLibrary={capabilities:{imageSequence:true},folders:[],items:[{id:'project',name:'프로젝트',kind:'project',path:'C:/owned/test.aep'},{id:'image',name:'사진',kind:'image',path:'C:/owned/test.png',preview:'assets/preview-logo.png'},{id:'missing',name:'누락',kind:'image',missing:true,path:'C:/missing.png'},{id:'sequence',name:'시퀀스',kind:'image-sequence',path:'C:/own/001.png',importable:true}]};
   window.__libraryController=ContentriumWorkspace.create(Object.assign({},__controllerRoots,{getState:()=>__controllerState,supports:method=>['getLibrary','importLibraryItem','replaceLibraryItem'].includes(method),status:()=>{},refresh:()=>{},onSettings:()=>{},onLibrary:value=>__librarySnapshots.push(value),call:async(method,payload)=>{
    __controllerCalls.push({method,payload});if(method==='getLibrary')return __controllerLibrary;
    if(payload.id==='project'&&!payload.options.compositionId)return{requiresComposition:true,importId:'project',compositions:[{id:91,name:'첫 장면',duration:3},{id:92,name:'둘째 장면',duration:4}]};
    return{ok:true,method,id:payload.id};
   }}));await __libraryController.init();
  });
  check(await target.evaluate(()=>typeof __libraryController.importLibraryItem==='function'&&typeof __libraryController.replaceLibraryItem==='function'),'shared library import and replace controller are exposed');
  check(await target.evaluate(()=>__librarySnapshots.length===1&&__libraryController.getLibrary().items.length===4),'one successful snapshot is published');
  const failures=await target.evaluate(async()=>{const result=[];for(const id of ['absent','missing']){try{await __libraryController.importLibraryItem(id,{});result.push(false);}catch(e){result.push(true);}}return{result,calls:__controllerCalls.filter(c=>c.method!=='getLibrary')};});
  check(failures.result.every(Boolean)&&failures.calls.length===0,'missing ID and source fail before host dispatch');
  await target.evaluate(()=>{window.__controllerPending=__libraryController.importLibraryItem('project',{});});
  await target.getByRole('combobox',{name:'컴포지션 선택',exact:true}).selectOption('92');await target.locator('.composition-dialog').getByRole('button',{name:'가져오기',exact:true}).click();
  await target.evaluate(()=>__controllerPending);
  check(await target.evaluate(()=>__controllerCalls.some(c=>c.method==='importLibraryItem'&&c.payload.id==='project'&&c.payload.options.compositionId===92&&c.payload.context.compositionId===7)),'AEP import keeps the chosen composition and captured context');
  await target.evaluate(()=>{window.__controllerPending=__libraryController.replaceLibraryItem('project',{keepTransform:true});});
  await target.getByRole('combobox',{name:'컴포지션 선택',exact:true}).selectOption('91');
  await target.evaluate(()=>{__controllerState={context:{projectKey:'other.aep',projectToken:'other',compositionId:99,layerIds:[100]},numSelectedLayers:1};});
  await target.locator('.composition-dialog').getByRole('button',{name:'교체',exact:true}).click();await target.evaluate(()=>__controllerPending);
  check(await target.evaluate(()=>__controllerCalls.some(c=>c.method==='replaceLibraryItem'&&c.payload.options.compositionId===91&&c.payload.options.keepTransform===true&&c.payload.context.compositionId===7)),'AEP replacement retains replace intent, options and original context through the dialog');
  const beforeCancel=await target.evaluate(()=>__controllerCalls.length);await target.evaluate(()=>{window.__controllerPending=__libraryController.importLibraryItem('project',{});});
  await target.locator('.composition-dialog').getByRole('button',{name:'취소',exact:true}).click();const cancelled=await target.evaluate(()=>__controllerPending);
  check(cancelled.cancelled===true&&await target.evaluate(()=>__controllerCalls.length)===beforeCancel+1,'cancelled composition selection dispatches no second import');
  await target.evaluate(()=>{__controllerLibrary.capabilities.imageSequence=false;});
  check(await target.evaluate(async()=>{try{await __libraryController.importLibraryItem('sequence',{});return false;}catch(e){return true;}}),'unsupported sequence is rejected by the shared controller');
  await target.evaluate(()=>__libraryController.revealLibraryItem('image'));
  check(await target.locator('#library-controller-fixture .library-item[data-item-id="image"]').evaluate(n=>document.activeElement===n),'details action focuses the current library item');
  check(errors.length===0,'controller produces no browser script errors: '+errors.join('; '));
  return{ok:true,checkCount:checks.length,checks,scope:'isolated actual UI/controller with simulated host; no native imports'};
 }finally{await context.close();}
}
