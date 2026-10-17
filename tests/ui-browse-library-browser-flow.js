async page=>{
 if(!/^http:\/\/127\.0\.0\.1:/.test(page.url()))throw Error('Isolated local browser required');
 const context=await page.context().browser().newContext({viewport:{width:1150,height:850}}),target=await context.newPage(),checks=[],errors=[];
 function check(ok,name){if(!ok)throw Error(name);checks.push(name);}
 try{
  await target.addInitScript(()=>{
   if(!localStorage.getItem('contentrium-preset.ui.v1'))localStorage.setItem('contentrium-preset.ui.v1',JSON.stringify({tabMode:'browse',favorites:['9e5','library:local-b'],category:''}));
   window.__libraryCalls=[];window.__libraryState={context:{projectKey:'owned.aep',projectToken:'fixture',compositionId:7,layerIds:[8]},numSelectedLayers:1,hasRootNode:false,applied:[],controls:[],revision:1};
   window.__libraryData={folders:[{id:'folder-a',name:'자료',path:'C:/a'},{id:'folder-b',name:'자료',path:'C:/b'}],capabilities:{imageSequence:true},items:[{id:'local-a',folderId:'folder-a',name:'First logo',kind:'image',path:'C:/a/logo.png',preview:'assets/preview-logo.png'},{id:'local-b',folderId:'folder-b',name:'Second clip',kind:'video',path:'C:/b/movie.webm',preview:'library/previews/9e4.webm'},{id:'gone',folderId:'folder-a',name:'Missing image',kind:'image',missing:true,path:'C:/gone.png'},{id:'own',name:'My custom preset',kind:'preset',managed:true,path:'C:/own.cpreset.json'}]};
   let first=true;window.__adobe_cep__={getSystemPath:()=>'/isolated-library-fixture',evalScript:(script,callback)=>{
    const match=/\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(script),method=JSON.parse(match[1]),payload=JSON.parse(JSON.parse(match[2]));__libraryCalls.push({method,payload});
    const answer=result=>callback(JSON.stringify({ok:true,result}));
    if(method==='hostStatus')return answer({available:true,methods:['getState','getLibrary','importLibraryItem','replaceLibraryItem']});
    if(method==='getState')return answer(__libraryState);
    if(method==='getLibrary'){const value=localStorage.getItem('fixture-offline')?{...__libraryData,items:[]}:__libraryData;if(first){first=false;return setTimeout(()=>answer(value),350);}return answer(value);}
    return answer({imported:true});
   }};
  });
  target.on('pageerror',e=>errors.push(e.message));await target.goto(new URL('/',page.url()).href);
  await target.waitForFunction(()=>document.querySelectorAll('.preset-card').length>=43);
  await target.evaluate(()=>{window.__keptVideo=document.querySelector('.preset-card[data-entry-id="9e5"] video');window.__keptEmptied=0;__keptVideo.addEventListener('emptied',()=>__keptEmptied++);});
  await target.waitForTimeout(500);
  check(await target.locator('.preset-card[data-entry-id^="library:"]').count()===4,'registered files and saved presets appear in Browse');
  check(await target.evaluate(()=>__keptVideo.isConnected&&__keptEmptied===0),'late library loading preserves the built-in video');
  check(await target.evaluate(()=>ContentriumUI.view.getState().favorites.includes('library:local-b')),'catalog loading preserves private favorite keys');
  await target.getByRole('button',{name:'User Library 펼침',exact:true}).click();
  check(await target.locator('.category-name').filter({hasText:/^자료$/}).count()===2,'same-named folders remain separate tree nodes');
  const search=target.getByRole('searchbox',{name:'항목 검색'});await search.fill('자료 Second');await target.waitForFunction(()=>ContentriumUI.view.getState().query==='자료 Second');
  check(await target.locator('.preset-card').count()===1&&await target.locator('.preset-card').getAttribute('data-entry-id')==='library:local-b','search combines local folder and filename tokens');
  await target.getByRole('button',{name:'검색 지우기',exact:true}).click();
  const logo=target.locator('.preset-card[data-entry-id="library:local-a"]');await logo.click({button:'right'});await target.getByRole('menuitem',{name:'라벨 · 빨강',exact:true}).click();
  await target.getByLabel('라벨 필터',{exact:true}).selectOption('red');check(await target.locator('.preset-card').count()===1&&await logo.isVisible(),'personal item labels share the Browse filter');
  await target.getByRole('button',{name:'필터 모두 해제',exact:true}).click();await logo.locator('.preset-name').click();
  await target.getByRole('button',{name:'가져오기',exact:true}).click();await target.waitForFunction(()=>__libraryCalls.some(c=>c.method==='importLibraryItem'&&c.payload.id==='local-a'));
  check(await target.evaluate(()=>__libraryCalls.filter(c=>c.method==='applyPreset').length===0&&__libraryCalls.find(c=>c.method==='importLibraryItem').payload.context.compositionId===7),'personal apply sends raw host ID and captured context to the library importer');
  await target.getByRole('button',{name:'크게 미리보기',exact:true}).click();await target.waitForFunction(()=>document.querySelector('.library-preview-dialog img')?.naturalWidth>0);
  check(await target.locator('.library-preview-dialog img').getAttribute('src')==='assets/preview-logo.png','large preview uses the selected source');
  check(await target.locator('.library-preview-dialog img').evaluate(n=>n.getBoundingClientRect().width<=n.closest('dialog').clientWidth-30&&n.getBoundingClientRect().height<innerHeight*.75),'large preview fits inside the visible dialog');
  await target.getByRole('button',{name:'미리보기 닫기',exact:true}).click();await target.locator('.library-preview-dialog').waitFor({state:'detached'});
  const missing=target.locator('.preset-card[data-entry-id="library:gone"]');await missing.locator('.preset-name').click();
  check(await target.getByRole('button',{name:'가져오기',exact:true}).isDisabled()&&/찾을 수 없/.test(await target.locator('#variant-summary').innerText()),'missing personal source is visible and cannot be imported');
  await logo.locator('.preset-name').click();await target.getByRole('button',{name:'상세 설정',exact:true}).click();
  await target.waitForFunction(()=>document.activeElement?.classList.contains('library-item'));
  check(await target.evaluate(()=>document.activeElement.dataset.itemId==='local-a'),'advanced settings opens and focuses the matching Library item');
  await target.getByRole('button',{name:'Browse',exact:true}).click();
  await target.evaluate(()=>{__libraryData.items=__libraryData.items.filter(i=>i.id!=='local-b');});await target.locator('#refresh').click();
  await target.waitForFunction(()=>document.querySelector('.preset-card[data-entry-id="library:local-b"]')?.dataset.libraryState==='missing');
  check(await target.evaluate(()=>ContentriumUI.view.getState().favorites.includes('library:local-b')),'missing favorite retains its card and favorite key after refresh');
  await target.evaluate(()=>localStorage.setItem('fixture-offline','true'));await target.reload();
  await target.waitForFunction(()=>document.querySelector('.preset-card[data-entry-id="library:local-b"]')?.dataset.libraryState==='missing');
  check(await target.locator('.preset-card[data-entry-id="library:local-b"]').count()===1,'retained missing item survives panel reload with its metadata');
  check(errors.length===0,'unified Browse produces no script errors: '+errors.join('; '));
  return{ok:true,checkCount:checks.length,checks,scope:'actual Browse UI and local media, simulated host; no native import'};
 }finally{await context.close();}
}
