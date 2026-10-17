async page => {
  const assert=(value,message)=>{if(!value)throw Error(message);};
  await page.addInitScript(()=>{
    localStorage.clear();window.__authorCalls=[];
    window.__authorState={instanceId:'author-1',projectRevision:11,numSelectedLayers:1,hasRootNode:true,wantsRevealEditTab:true,context:{projectKey:'author.aep',compositionId:7,layerIds:[8]},controls:[],applied:[]};
    window.__adobe_cep__={getSystemPath:()=>'/standalone',evalScript:(script,callback)=>{
      const m=/\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(script);
      if(!m){callback(JSON.stringify({ok:false,error:{message:'parse'}}));return;}
      const method=JSON.parse(m[1]),payload=JSON.parse(JSON.parse(m[2]));__authorCalls.push({method,payload});let result={};
      if(method==='hostStatus')result={methods:['getState','getSettings','getLibrary','saveLibraryPreset']};
      if(method==='getState')result=__authorState;if(method==='getLibrary')result={folders:[],items:[]};
      callback(JSON.stringify({ok:true,result}));
    }};
  });
  await page.reload();await page.waitForFunction(()=>!document.getElementById('capture').disabled);
  if(await page.locator('dialog[data-welcome]').count())await page.getByRole('button',{name:'시작하기',exact:true}).click();
  await page.locator('#capture').click();await page.locator('#capture-name').fill('선택 속성');
  assert(await page.locator('#capture-selected-only').count()===1,'capture scope option missing');
  assert(!await page.locator('#capture-selected-only').isChecked()&&!await page.locator('#capture-source-text').isChecked(),'capture defaults must be false');
  await page.locator('#capture-selected-only').check();await page.locator('#capture-source-text').check();
  await page.evaluate(()=>{__authorState={...__authorState,instanceId:'author-2',projectRevision:12,context:{projectKey:'author.aep',compositionId:7,layerIds:[9]}};});
  await page.waitForTimeout(1100);
  await page.locator('#capture-form button[type=submit]').click();await page.waitForFunction(()=>__authorCalls.some(c=>c.method==='saveLibraryPreset'));
  const saved=await page.evaluate(()=>__authorCalls.find(c=>c.method==='saveLibraryPreset').payload);
  assert(saved.context.layerIds[0]===8&&saved.expectedRevision===11,'capture silently switched target/revision');assert(saved.selectedOnly&&saved.includeSourceText,'capture choices omitted');
  await page.locator('#capture').click();await page.locator('#capture-cancel').click();assert(await page.evaluate(()=>__authorCalls.filter(c=>c.method==='saveLibraryPreset').length)===1,'capture cancel wrote');
  await page.locator('#capture').click();await page.keyboard.press('Escape');assert(await page.evaluate(()=>__authorCalls.filter(c=>c.method==='saveLibraryPreset').length)===1,'capture Escape wrote');
  await page.evaluate(async()=>{
    window.__presetCalls=[];window.__presetState={projectRevision:21,context:{projectKey:'presets.aep',compositionId:4,layerIds:[5]},numSelectedLayers:1};window.__describeSupported=true;
    const roots={};for(const key of ['libraryRoot','toolsRoot','settingsRoot']){roots[key]=document.createElement('div');document.body.append(roots[key]);}roots.libraryRoot.id='author-library';
    const items=[{id:'generic',name:'내 속성',kind:'preset',sourceStamp:'stamp-g'},{id:'recipe',name:'내 모션',kind:'preset',sourceStamp:'stamp-r'},{id:'no-text',name:'위치만',kind:'preset',sourceStamp:'stamp-n'}];
    window.__presetController=ContentriumWorkspace.create({...roots,getState:()=>__presetState,supports:m=>['getLibrary','importLibraryItem'].includes(m)||(m==='describeLibraryPreset'&&__describeSupported),status:()=>{},refresh:()=>{},onSettings:()=>{},onLibrary:()=>{},call:async(method,payload)=>{__presetCalls.push({method,payload});if(method==='getLibrary')return{folders:[],items,supportedTypes:['preset']};if(method==='describeLibraryPreset')return{kind:payload.id==='recipe'?'precomp':'user-property-preset',containsSourceText:payload.id==='generic'};return{ok:true};}});await __presetController.init();
  });
  const row=id=>page.locator('#author-library .library-item[data-item-id="'+id+'"]');
  await row('generic').getByRole('button',{name:'가져오기',exact:true}).click();await page.locator('.preset-apply-dialog').waitFor();
  assert(!await page.getByLabel('저장한 글자로 바꾸기').isChecked()&&!await page.getByLabel('기존 키프레임과 표현식 덮어쓰기').isChecked(),'apply defaults must preserve text/animation');
  assert(await page.evaluate(()=>__presetCalls.filter(c=>c.method==='describeLibraryPreset').length)===1,'must describe only clicked preset');
  await page.getByLabel('저장한 글자로 바꾸기').check();await page.getByLabel('기존 키프레임과 표현식 덮어쓰기').check();
  await page.evaluate(()=>{__presetState={...__presetState,projectRevision:22,context:{projectKey:'presets.aep',compositionId:4,layerIds:[6]}};});
  await page.locator('.preset-apply-dialog').getByRole('button',{name:'적용',exact:true}).click();await page.waitForFunction(()=>__presetCalls.some(c=>c.method==='importLibraryItem'));
  const applied=await page.evaluate(()=>__presetCalls.find(c=>c.method==='importLibraryItem').payload);
  assert(applied.context.layerIds[0]===5&&applied.expectedRevision===21,'apply target/revision switched');assert(applied.options.replaceText&&applied.options.overwrite,'apply choices missing');
  await row('no-text').getByRole('button',{name:'가져오기',exact:true}).click();await page.locator('.preset-apply-dialog').waitFor();assert(await page.getByLabel('저장한 글자로 바꾸기').isDisabled(),'no text replacement must be disabled');
  await page.locator('.preset-apply-dialog').getByRole('button',{name:'취소',exact:true}).click();assert(await page.evaluate(()=>__presetCalls.filter(c=>c.method==='importLibraryItem').length)===1,'cancel imported');
  await row('generic').getByRole('button',{name:'가져오기',exact:true}).click();await page.locator('.preset-apply-dialog').waitFor();await page.keyboard.press('Escape');assert(await page.evaluate(()=>__presetCalls.filter(c=>c.method==='importLibraryItem').length)===1,'Escape imported');
  await row('recipe').getByRole('button',{name:'가져오기',exact:true}).click();await page.waitForFunction(()=>__presetCalls.filter(c=>c.method==='importLibraryItem').length===2);assert(await page.locator('.preset-apply-dialog').count()===0,'recipe prompted');
  const direct=await page.evaluate(async()=>{const before=__presetCalls.filter(c=>c.method==='describeLibraryPreset').length;await __presetController.importLibraryItem('generic',{replaceText:false,overwrite:true});return{before,after:__presetCalls.filter(c=>c.method==='describeLibraryPreset').length,last:__presetCalls.at(-1)};});assert(direct.before===direct.after&&direct.last.payload.options.overwrite===true,'programmatic explicit options must stay direct');
  await page.evaluate(()=>{__describeSupported=false;});await row('generic').getByRole('button',{name:'가져오기',exact:true}).click();await page.waitForFunction(()=>__presetCalls.filter(c=>c.method==='importLibraryItem').length===4);
  return{scope:'isolated browser host contract only',checks:15,capture:saved,apply:applied};
}
