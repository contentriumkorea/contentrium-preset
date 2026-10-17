async page=>{
 if(!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url()))throw Error('Standalone product UI only');
 const context=await page.context().browser().newContext({viewport:{width:1150,height:800}}),target=await context.newPage(),checks=[],errors=[];
 const check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};target.on('pageerror',e=>errors.push(e.message));
 try{
  await target.addInitScript(()=>{if(!localStorage.getItem('fixture.initialized')){localStorage.setItem('fixture.initialized','1');localStorage.setItem('contentrium-preset.ui.v1',JSON.stringify({labels:{'item:9ce':'red','item:9e5':'blue','category:Animation Presets / Text Presets':'green'},tabMode:'browse'}));}});
  await target.goto(new URL('/',page.url()).href);await target.waitForFunction(()=>document.querySelectorAll('.preset-card').length===43);
  const filter=target.getByLabel('라벨 필터',{exact:true});
  await filter.selectOption('red');check(await target.locator('.preset-card').count()===1,'single red filter matches one item');
  await filter.selectOption('blue');check(await target.locator('.preset-card').count()===2,'red and blue filters combine as a union');
  check(await target.getByRole('button',{name:'빨강 필터 해제',exact:true}).count()===1&&await target.getByRole('button',{name:'파랑 필터 해제',exact:true}).count()===1,'each selected label has a removable chip');
  await target.getByRole('button',{name:'빨강 필터 해제',exact:true}).click();check(await target.locator('.preset-card').count()===1&&await target.locator('.preset-card').getAttribute('data-entry-id')==='9e5','removing one label preserves the other');
  await target.reload();await target.waitForFunction(()=>document.querySelectorAll('.preset-card').length===1);
  check(await target.getByRole('button',{name:'파랑 필터 해제',exact:true}).count()===1,'multiple-filter preference survives reload');
  await filter.selectOption('green');check(await target.locator('.preset-card').count()===14,'inherited category labels participate in multi-filter results');
  await target.getByRole('button',{name:'즐겨찾기만 보기',exact:true}).click();
  const search=target.getByRole('searchbox',{name:'항목 검색'});await search.fill('Fade');await target.waitForFunction(()=>ContentriumUI.view.getState().query==='Fade');
  check(await target.locator('.preset-card').count()>1,'search, favorites, and several label filters combine');
  await target.getByRole('button',{name:'필터 모두 해제',exact:true}).click();
  check(await target.locator('.preset-card').count()===43&&await search.inputValue()==='','clear filters resets query, favorites-only, and label filters');
  check(await target.evaluate(()=>Object.keys(ContentriumUI.view.getState().labels).length===3&&ContentriumUI.view.getState().favorites.length===43),'clear filters preserves saved labels and favorites');
  await search.fill('missing-search');await target.getByRole('button',{name:'검색 지우기',exact:true}).click();await target.waitForTimeout(350);
  check(await target.locator('.preset-card').count()===43&&await target.evaluate(()=>ContentriumUI.view.getState().query===''),'clear search cancels an outstanding debounce');
  await search.fill('Motion Left');await target.waitForFunction(()=>ContentriumUI.view.getState().query==='Motion Left');
  check(await target.locator('.preset-card').count()>0&&await target.locator('.preset-card').evaluateAll(nodes=>nodes.every(n=>/Left/i.test(n.getAttribute('aria-label')))),'ancestor and direction search selects matching preview variants');
  await target.getByRole('button',{name:'검색 지우기',exact:true}).click();
  await target.getByRole('button',{name:'패널 메뉴',exact:true}).click();await target.getByRole('menuitem',{name:'모든 저장 라벨 지우기',exact:true}).click();
  check(await target.evaluate(()=>Object.keys(ContentriumUI.view.getState().labels).length===0),'clear saved labels removes assignments separately from clearing filters');
  check(errors.length===0,'no browser script errors');return{ok:true,checkCount:checks.length,checks,scope:'standalone real UI, own catalog; no native mutations'};
 }finally{await context.close();}
}
