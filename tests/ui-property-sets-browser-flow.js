async (page) => {
  if(!await page.evaluate(()=>Array.isArray(window.__fixtureCalls)))throw Error('Isolated UI fixture required');
  const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
  await page.evaluate(()=>{
    window.__setFixture={presets:[],matchingPreset:null,supported:true};const previous=__adobe_cep__.evalScript;
    __adobe_cep__.evalScript=(script,callback)=>{const m=/\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(script),method=JSON.parse(m[1]),payload=JSON.parse(JSON.parse(m[2]));
      if(method==='hostStatus'){callback(JSON.stringify({ok:true,result:{available:true,methods:['getState','getSettings','getLibrary','setControl','presetAction'].concat(__setFixture.supported?['propertySetAction']:[])}}));return;}
      if(method==='propertySetAction'){__fixtureCalls.push({method,payload});let result={};if(payload.action==='getAvailablePresets')result=__setFixture;else if(payload.action==='saveAs'){__setFixture.presets=[{id:'saved-one',name:payload.name}];__setFixture.matchingPreset='saved-one';}else if(payload.action==='remove'){__setFixture.presets=[];__setFixture.matchingPreset=null;}else if(payload.action==='apply'){__setFixture.matchingPreset=payload.presetId;__fixtureState.controls[0].value=220;}if(payload.action!=='getAvailablePresets')__fixtureState.revision++;callback(JSON.stringify({ok:true,result}));return;}
      previous(script,callback);
    };
    __fixtureState={...__fixtureState,instanceId:'property-sets',revision:100,controls:[{id:'distance',name:'Distance',type:'number',value:220,groupPath:['Fixture In']}],controlGroups:[{key:'variant:125/in/main',name:'Fixture In',controlIds:['distance'],canSave:true}]};
  });
  await page.locator('#refresh').click();await page.getByRole('button',{name:'Edit',exact:true}).click();
  const presets=page.getByRole('button',{name:'Fixture In Presets',exact:true});await presets.click();await page.getByRole('menuitem',{name:'Save As…',exact:true}).click();
  await page.getByRole('dialog').getByLabel('이름',{exact:true}).fill('Contract values');await page.getByRole('dialog').getByRole('button',{name:'저장',exact:true}).click();
  await page.waitForFunction(()=>__fixtureCalls.some(c=>c.method==='propertySetAction'&&c.payload.action==='saveAs'));
  const saved=await page.evaluate(()=>__fixtureCalls.find(c=>c.method==='propertySetAction'&&c.payload.action==='saveAs'));
  if(saved.payload.groupKey!=='variant:125/in/main'||saved.payload.name!=='Contract values'||saved.payload.context.compositionId!==7)throw Error('Save scope/context');checks.push('property-set-save-explicit-group-context');
  await presets.click();await page.getByRole('menuitem',{name:'현재 프리셋 삭제',exact:true}).waitFor();if(await page.getByRole('menuitem',{name:'Save As…',exact:true}).count())throw Error('Matching preset must offer Delete');checks.push('matching-preset-delete-state');
  await page.getByRole('menuitem',{name:'현재 프리셋 삭제',exact:true}).click();await page.waitForFunction(()=>__fixtureCalls.some(c=>c.method==='propertySetAction'&&c.payload.action==='remove'));checks.push('property-set-remove');
  await page.evaluate(()=>{__setFixture.presets=[{id:'saved-one',name:'Contract values'}];__setFixture.matchingPreset=null;__fixtureState.controls[0].value=0;__fixtureState.revision++;if(document.activeElement)document.activeElement.blur();});await page.evaluate(()=>ContentriumUI.view.refresh());
  await presets.click();await page.getByRole('menuitem',{name:'Contract values',exact:true}).click();await page.waitForFunction(()=>__fixtureCalls.some(c=>c.method==='propertySetAction'&&c.payload.action==='apply'&&c.payload.presetId==='saved-one'));checks.push('property-set-apply-with-preset-id');
  await page.evaluate(()=>{__setFixture.matchingPreset=null;__fixtureState.controlGroups[0].canSave=false;__fixtureState.controlGroups[0].reason='혼합값';__fixtureState.controls[0].mixed=true;__fixtureState.revision++;if(document.activeElement)document.activeElement.blur();});await page.evaluate(()=>ContentriumUI.view.refresh());
  await presets.click();if(!await page.getByRole('menuitem',{name:'Save As…',exact:true}).isDisabled())throw Error('Mixed group Save must be disabled');checks.push('mixed-group-save-disabled');
  await page.screenshot();
  await page.evaluate(()=>{__setFixture.supported=false;if(document.activeElement)document.activeElement.blur();});await page.locator('#refresh').click();await page.waitForTimeout(800);
  if(await page.locator('.property-set-widget').count())throw Error('Unsupported property-set host must hide menu');checks.push('unsupported-host-hides-property-menu');
  if(errors.length)throw Error(errors.join('; '));return{scope:'isolated-browser-property-set-contract-not-native',checkCount:checks.length,checks,pageErrors:errors};
}
