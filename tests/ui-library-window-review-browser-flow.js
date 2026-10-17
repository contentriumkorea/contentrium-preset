async page=>{
 const browser=page.context().browser(),results=[];
 async function scenario(name,size,run){
  const context=await browser.newContext({viewport:{width:1150,height:800}}),p=await context.newPage(),checks=[];
  function check(ok,label,detail){if(!ok)throw Error(label+' '+JSON.stringify(detail||''));checks.push(label);}
  try{
   await p.addInitScript(count=>{
    if(!localStorage.getItem('contentrium-preset.ui.v1'))localStorage.setItem('contentrium-preset.ui.v1',JSON.stringify({tabMode:'browse',favorites:[]}));
    window.__calls=[];window.__items=Array.from({length:count},(_,i)=>({id:'item-'+i,name:'Library item '+i,folderId:'owned',kind:'image',path:'C:/fixture/item-'+i+'.png',preview:'assets/preview-logo.png'}));
    if(count===1)__items[0]={id:'item-0',name:'Sequence',kind:'image-sequence',path:'C:/fixture/frame.png',frameCount:12};
    window.__adobe_cep__={getSystemPath:()=>'/isolated-review',evalScript:(s,cb)=>{const m=/\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(s),method=JSON.parse(m[1]),payload=JSON.parse(JSON.parse(m[2]));__calls.push({method,payload});let result={};
     if(method==='hostStatus')result={methods:['getState','getLibrary','importLibraryItem','replaceLibraryItem']};
     if(method==='getState')result={context:{projectKey:'fixture.aep',projectToken:'private',compositionId:1,layerIds:[]},numSelectedLayers:0,applied:[],controls:[],revision:1};
     if(method==='getLibrary')result={items:__items,folders:[{id:'owned',name:'Owned folder',path:'C:/fixture'}],capabilities:{imageSequence:true}};
     cb(JSON.stringify({ok:true,result}));}};
   },size);
   await p.goto(new URL('/',page.url()).href);await p.waitForFunction(n=>window.ContentriumUI?.view.getState().entries===43+n,size);
   await run(p,check);results.push({name,ok:true,checks});
  }catch(e){results.push({name,ok:false,checks,error:e.message});}finally{await context.close();}
 }
 await scenario('bulk favorites',2,async(p,check)=>{
  await p.locator('.preset-card[data-entry-id="library:item-0"] .card-star').click();await p.locator('.preset-card[data-entry-id="library:item-1"] .card-star').click();await p.locator('#favorites-toggle').click();
  await p.locator('[data-category-key=""]').click({button:'right'});await p.getByRole('menuitem',{name:'폴더 즐겨찾기 해제',exact:true}).click();
  check(Number(await p.locator('#preset-grid').getAttribute('data-logical-count'))===0,'bulk removal invalidates Favorites membership');
  check(await p.evaluate(()=>JSON.parse(localStorage.getItem('contentrium-preset.shared.v1')).favorites.length===0),'bulk removal publishes shared favorites');
  await p.reload();await p.waitForFunction(()=>ContentriumUI?.view.getState().entries===45);check((await p.evaluate(()=>ContentriumUI.view.getState().favorites)).length===0,'bulk removal persists after reload');
  await p.locator('[data-category-key=""]').click({button:'right'});await p.getByRole('menuitem',{name:'폴더 즐겨찾기 추가',exact:true}).click();
  check(Number(await p.locator('#preset-grid').getAttribute('data-logical-count'))===45,'bulk addition invalidates Favorites membership');
  check(await p.evaluate(()=>JSON.parse(localStorage.getItem('contentrium-preset.shared.v1')).favorites.length===45),'bulk addition publishes all shared favorites');
 });
 await scenario('keyboard reentry',5000,async(p,check)=>{
  await p.locator('.preset-card').first().locator('.preset-name').click();await p.locator('#search').focus();await p.evaluate(()=>{const g=document.querySelector('#preset-grid');g.scrollTop=g.scrollHeight*.5;});
  await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  check(await p.locator('#preset-grid .preset-card[tabindex="0"]').count()===1,'evicted selection retains one mounted article tab stop');
  // Start at the last focusable control before the grid, then use a real Tab.
  await p.locator('#thumbnail-size').focus();await p.keyboard.press('Tab');
  check(await p.evaluate(()=>document.activeElement?.classList.contains('preset-card')),'Tab enters a virtual article instead of its action button');
  await p.keyboard.press('End');check(await p.evaluate(()=>document.activeElement?.dataset.entryId==='library:item-4999'),'End after Tab reaches the final logical record');
 });
 await scenario('FPS round trip',1,async(p,check)=>{
  await p.locator('.preset-card[data-entry-id="library:item-0"] .preset-name').click();const browse=p.getByLabel('이미지 시퀀스 프레임레이트');await browse.fill('12');
  await p.getByRole('button',{name:'상세 설정',exact:true}).click();await p.getByLabel('Sequence 프레임레이트').fill('24');await p.getByRole('button',{name:'Browse',exact:true}).click();
  check(await browse.inputValue()==='24','Browse immediately reflects the latest Library FPS');
  await p.locator('#apply-actions').getByRole('button',{name:'가져오기',exact:true}).click();await p.waitForFunction(()=>__calls.some(c=>c.method==='importLibraryItem'));
  const call=await p.evaluate(()=>__calls.find(c=>c.method==='importLibraryItem'));check(call.payload.options.conformFrameRate===24,'actual import uses the latest 24 FPS',call.payload);
 });
 return{ok:results.every(r=>r.ok),results,checks:results.reduce((n,r)=>n+r.checks.length,0),scope:'isolated real browser UI, simulated native host'};
}
