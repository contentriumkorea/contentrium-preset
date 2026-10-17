async page=>{
 const context=await page.context().browser().newContext(),p=await context.newPage(),checks=[];
 const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 try{
  await p.route('**/ui-core.js',async route=>{const response=await route.fetch(),source=await response.text();if(!source.includes('options.timeoutMs || 60000'))throw Error('Missing timeout injection seam');await route.fulfill({response,body:source.replace('options.timeoutMs || 60000','options.timeoutMs || 30')});});
  await p.addInitScript(()=>{
   localStorage.setItem('contentrium-preset.ui.v1',JSON.stringify({tabMode:'browse'}));window.__calls=[];window.__finished=[];
   window.__adobe_cep__={getSystemPath:()=>'/long-fixture',evalScript:(s,cb)=>{const m=/\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(s),method=JSON.parse(m[1]);__calls.push(method);let result={};
    if(method==='hostStatus')result={methods:['getState','getLibrary','importLibraryItem']};
    if(method==='getState')result={context:{projectKey:'fixture.aep',projectToken:'owned',compositionId:1,layerIds:[]},numSelectedLayers:0,applied:[],controls:[],revision:1};
    if(method==='getLibrary')result={items:[{id:'slow-image',name:'Slow image',kind:'image',path:'C:/fixture/logo.png',preview:'assets/preview-logo.png'}],folders:[]};
    const finish=()=>{__finished.push(method);cb(JSON.stringify({ok:true,result}));};if(method==='getLibrary'||method==='importLibraryItem')setTimeout(finish,250);else finish();}};
  });
  await p.goto(new URL('/',page.url()).href);await p.waitForFunction(()=>window.ContentriumUI?.view.getTransportState().waitingLate);
  await p.evaluate(()=>{ContentriumUI.view.selectTab('library',true);ContentriumUI.view.selectTab('library',true);});
  await p.waitForFunction(()=>ContentriumUI.view.getState().entries===44);
  check(await p.evaluate(()=>__calls.filter(c=>c==='getLibrary').length===1),'repeated Library opens share one native scan while its response is late');
  await p.getByRole('button',{name:'Browse',exact:true}).click();await p.locator('.preset-card[data-entry-id="library:slow-image"] .preset-name').click();
  await p.locator('#apply-actions').getByRole('button',{name:'가져오기',exact:true}).click();await p.waitForFunction(()=>ContentriumUI.view.getTransportState().waitingLate);
  check(await p.locator('#apply-actions').getByRole('button',{name:'가져오기',exact:true}).isDisabled(),'late native import remains disabled against duplicate mutations');
  await p.waitForFunction(()=>__finished.includes('importLibraryItem')&&!ContentriumUI.view.getTransportState().busy);
  check(await p.evaluate(()=>__calls.filter(c=>c==='importLibraryItem').length===1),'late import runs exactly once');
  check(!(await p.locator('#apply-actions').getByRole('button',{name:'가져오기',exact:true}).isDisabled()),'completed import restores the action');
  check(await p.evaluate(()=>ContentriumUI.view.getState().entries===44),'the late native library result remains available');
  return{ok:true,checks,scope:'real browser UI; 30 ms warning, 250 ms simulated native completion'};
 }finally{await context.close();}
}
