async page=>{
 const ctx=await page.context().browser().newContext({viewport:{width:1150,height:800}}),p=await ctx.newPage(),checks=[],errors=[],samples=[];
 function check(ok,name,detail){if(!ok)throw Error(name+' '+JSON.stringify(detail||''));checks.push(name);}
 const settle=()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 try{
  await p.addInitScript(()=>{
   localStorage.setItem('contentrium-preset.ui.v1',JSON.stringify({tabMode:'browse'}));
   window.__data={folders:Array.from({length:50},(_,i)=>({id:'folder-'+i,name:'Folder '+i,path:'C:/owned/'+i})),items:Array.from({length:5000},(_,i)=>({id:'item-'+i,name:'Library item '+i,folderId:'folder-'+(i%50),kind:'image',path:'C:/owned/'+i+'.png',preview:'assets/preview-logo.png'}))};
   let first=true;window.__adobe_cep__={getSystemPath:()=>'/scale-fixture',evalScript:(s,cb)=>{const m=/\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(s),method=JSON.parse(m[1]);let result={};if(method==='hostStatus')result={methods:['getState','getLibrary']};if(method==='getState')result={context:{projectKey:'scale.aep',projectToken:'owned',compositionId:1,layerIds:[]},numSelectedLayers:0,controls:[],applied:[],revision:1};if(method==='getLibrary'){result=__data;if(first){first=false;return setTimeout(()=>cb(JSON.stringify({ok:true,result})),600);}}cb(JSON.stringify({ok:true,result}));}};
  });
  p.on('pageerror',e=>errors.push(e.message));await p.goto(new URL('/',page.url()).href);await p.waitForFunction(()=>document.querySelectorAll('.preset-card').length===43);
  await p.evaluate(()=>{window.__firstCard=document.querySelector('.preset-card');window.__firstMedia=__firstCard.querySelector('video,canvas');});
  await p.waitForFunction(()=>ContentriumUI.view.getState().entries===5043);await settle();
  const stats=()=>p.evaluate(()=>{const grid=document.querySelector('#preset-grid'),cards=[...grid.querySelectorAll('.preset-card')],s=getComputedStyle(grid),c=cards[0],columns=c?Math.max(1,Math.round((grid.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)+parseFloat(s.columnGap))/(c.getBoundingClientRect().width+parseFloat(s.columnGap)))):1,rows=c?Math.ceil(grid.clientHeight/(c.getBoundingClientRect().height+parseFloat(s.rowGap))):1;return{logical:Number(grid.dataset.logicalCount),mounted:cards.length,bound:columns*(rows+5)+2,libraryRows:document.querySelectorAll('#library-view .library-item').length,media:document.querySelectorAll('video,audio,img,canvas').length,scrollHeight:grid.scrollHeight,clientHeight:grid.clientHeight};});
  let current=await stats();samples.push(current);check(current.mounted<=current.bound,'5,043 logical items have bounded mounted cards',current);check(current.logical===5043,'logical count remains complete',current);check(current.libraryRows===0,'hidden management has zero item DOM',current);
  check(await p.evaluate(()=>__firstCard.isConnected&&__firstCard.querySelector('video,canvas')===__firstMedia),'late large library response retains visible built-in preview identity');
  await p.evaluate(()=>{window.__oldCards=[...document.querySelectorAll('.preset-card')];window.__mutations=[];window.__mediaEvents=[];window.__writes=[];window.__matches=0;const m=ContentriumCore.matchEntry;ContentriumCore.matchEntry=function(...a){__matches++;return m(...a)};const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){__writes.push(k);return set.call(this,k,v)};window.__observer=new MutationObserver(rows=>rows.forEach(r=>__mutations.push(...[...r.addedNodes,...r.removedNodes].filter(n=>n.nodeType===1&&n.classList.contains('preset-card')))));__observer.observe(document.querySelector('#preset-grid'),{childList:true});document.querySelectorAll('.preset-card video').forEach(v=>['emptied','loadstart'].forEach(n=>v.addEventListener(n,()=>__mediaEvents.push(n))));});
  await p.locator('.preset-card').nth(1).locator('.preset-name').click();await settle();
  check(await p.evaluate(()=>__mutations.length===0&&__mediaEvents.length===0&&__matches===0),'selection reuses cards and media without rescanning logical entries');
  check(await p.evaluate(()=>!__writes.some(k=>k==='contentrium-preset.shared.v1'||k==='contentrium-preset.library-cache.v1')),'unchanged selection does not publish shared data or serialize library cache');
  await p.locator('.preset-card').first().focus();await p.locator('.preset-card').first().press('End');await settle();
  check(await p.evaluate(()=>document.activeElement?.dataset.entryId==='library:item-4999'),'End reaches the last unmounted logical item');
  await p.locator('.preset-card:focus').press('ArrowLeft');check(await p.evaluate(()=>document.activeElement?.dataset.entryId==='library:item-4998'),'arrow keys navigate logical neighbors at the end');
  await p.locator('.preset-card:focus').press('Home');check(await p.evaluate(()=>document.activeElement?.getAttribute('aria-posinset')==='1'),'Home returns to the first logical item');
  await p.evaluate(()=>document.querySelector('#search').focus());
  for(let i=0;i<50;i++){await p.evaluate(i=>{const g=document.querySelector('#preset-grid');g.scrollTop=(g.scrollHeight-g.clientHeight)*((i*37)%101)/100;},i);await settle();current=await stats();check(current.mounted<=current.bound,'bounded jump '+i,current);samples.push(current);}
  await p.evaluate(()=>{const g=document.querySelector('#preset-grid');g.scrollTop=g.scrollHeight*.5;});await settle();
  const anchor=await p.evaluate(()=>{const g=document.querySelector('#preset-grid'),top=g.getBoundingClientRect().top,c=[...g.querySelectorAll('.preset-card')].find(c=>c.getBoundingClientRect().bottom>top);return{key:c.dataset.entryId,y:c.getBoundingClientRect().top-top};});
  await p.setViewportSize({width:680,height:430});await settle();
  const after=await p.evaluate(key=>{const g=document.querySelector('#preset-grid'),c=g.querySelector('[data-entry-id="'+key+'"]');return c?c.getBoundingClientRect().top-g.getBoundingClientRect().top:null;},anchor.key);
  check(after!==null&&Math.abs(after-anchor.y)<=1,'responsive resize preserves visible row anchor within one pixel',{anchor,after});
  await p.locator('#thumbnail-size').fill('260');await p.locator('#thumbnail-size').dispatchEvent('input');await settle();current=await stats();check(current.mounted<=current.bound,'large thumbnails remain bounded',current);
  await p.locator('#search').fill('Library item 4999');await p.waitForFunction(()=>ContentriumUI.view.getState().query==='Library item 4999');check(await p.locator('.preset-card').count()===1&&await p.locator('.preset-card').getAttribute('data-entry-id')==='library:item-4999','search reaches offscreen entries without truncation');
  await p.locator('#clear-search').click();await settle();check(Number(await p.locator('#preset-grid').getAttribute('data-logical-count'))===5043,'clearing search restores all logical results');
  check(errors.length===0,'no browser script errors',errors);return{ok:true,checks,checkCount:checks.length,samples,scope:'actual product UI, 5000 synthetic image records, simulated AE host'};
 }finally{await ctx.close();}
}
