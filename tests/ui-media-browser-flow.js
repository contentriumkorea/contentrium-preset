async (page) => {
  // Standalone browser contract; this fixture never calls After Effects.
  if(await page.evaluate(()=>!!window.__adobe_cep__&&!Array.isArray(window.__fixtureCalls)))throw Error('Requires isolated browser');
  const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.continue());
  await page.addInitScript(()=>{
    ['contentrium-preset.ui.v1','contentrium-preset.shared.v1','contentrium-preset.edit-panel-open'].forEach(k=>localStorage.removeItem(k));
    window.__fixtureCalls=[];
    window.__fixtureState={instanceId:'media-root',revision:1,numSelectedLayers:1,selectedLayerName:'Owned composition',hasRootNode:true,wantsRevealEditTab:true,context:{projectKey:'fixture',compositionId:7,layerIds:[3]},controls:[],applied:[],mediaRoots:[{rootLayerId:3,rootLayerName:'Owned composition',instanceId:'instance-one',media:[{layerId:11,itemId:20,name:'Image slot',layerIndex:1},{layerId:12,itemId:21,name:'Second slot',layerIndex:2}]},{rootLayerId:4,rootLayerName:'Empty composition',instanceId:'instance-two',media:[]}]};
    window.__fixtureProject=[{id:30,name:'New image.png',type:'footage',mediaKind:'visual'}];window.__fixtureSourceId=10;window.__fixtureFail=false;
    window.__adobe_cep__={getSystemPath:()=>'/isolated-browser-fixture',evalScript:(script,callback)=>{
      const match=/\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(script);
      if(!match){callback(JSON.stringify({ok:false,error:{message:'fixture parse failed'}}));return;}
      const method=JSON.parse(match[1]),payload=JSON.parse(JSON.parse(match[2]));__fixtureCalls.push({method,payload});
      let result={};
      if(method==='hostStatus')result={available:true,methods:['getState','getSettings','getLibrary','mediaAction']};
      else if(method==='getState'){
        if(window.__fixtureHoldState){window.__fixtureReleaseState=()=>callback(JSON.stringify({ok:true,result:__fixtureState}));return;}
        result=__fixtureState;
      }
      else if(method==='getSettings')result={settings:{pausePreviewWhenInactive:true,presetMotionBlurEnabled:false,insertPrecompAfterInTransition:false,copyUserLibFootageNextToProject:true}};
      else if(method==='getLibrary')result={folders:[],items:[],supportedTypes:[]};
      else if(method==='mediaAction'){
        if(payload.action==='context'){
          const rows=__fixtureState.mediaRoots[0].media.map(r=>({...r,path:'C:/fixture/'+r.itemId+'.png',canReplace:true,mediaKind:'visual'}));
          const binding=rows.find(r=>r.layerId===payload.layerId);
          result={rootLayerId:3,instanceId:'instance-one',media:rows,selectedBinding:binding,projectSelection:__fixtureProject,canReplace:__fixtureProject.length===1,errorCode:__fixtureProject.length===1?null:'PROJECT_SELECTION_COUNT',bindingContext:{expectedRootLayerId:3,expectedSourceItemId:__fixtureSourceId,expectedMediaItemId:binding.itemId,expectedItemId:__fixtureProject[0]&&__fixtureProject[0].id}};
        }else if(payload.action==='replaceSelected'){
          if(__fixtureFail){__fixtureFail=false;callback(JSON.stringify({ok:false,error:{code:'PROJECT_SELECTION_CHANGED',message:'Project selection changed'}}));return;}
          result={replaced:true,itemId:payload.bindingContext.expectedItemId};
        }else if(payload.action==='revealSource')result={itemId:10,name:'Owned source',type:'composition'};
      }
      callback(JSON.stringify({ok:true,result}));
    }};
  });
  await page.reload();await page.waitForFunction(()=>ContentriumUI.view.getState().tab==='edit');
  const source=page.getByRole('button',{name:'소스 열기',exact:true}),open=page.getByRole('button',{name:'미디어 교체',exact:true});
  if(await source.count()!==2||await source.nth(1).isDisabled()||!await open.nth(1).isDisabled())throw Error('Per-root actions/no-slot gating');checks.push('per-root-source-and-slot-availability');
  await source.nth(1).click();await page.waitForFunction(()=>__fixtureCalls.some(c=>c.method==='mediaAction'&&c.payload.action==='revealSource'&&c.payload.rootLayerId===4));checks.push('source-reveal-captured-root');
  await page.evaluate(()=>{__fixtureHoldState=true;ContentriumUI.view.refresh();});await page.waitForFunction(()=>typeof window.__fixtureReleaseState==='function');
  await open.first().click();const dialog=page.getByRole('dialog',{name:'미디어 교체',exact:true}),replace=dialog.getByRole('button',{name:'교체',exact:true});
  await page.evaluate(()=>{__fixtureState={...__fixtureState,instanceId:'project-item-active',revision:2,numSelectedLayers:0,context:{projectKey:'fixture',compositionId:99,layerIds:[]}};__fixtureHoldState=false;__fixtureReleaseState();});
  await replace.waitFor();await page.waitForFunction(()=>!document.querySelector('dialog[aria-label="미디어 교체"] button:nth-last-child(2)').disabled);
  if(await dialog.locator('[data-media-current]').textContent()!=='현재: 20.png')throw Error('Current source filename missing');checks.push('current-and-candidate-names');
  if(await page.evaluate(()=>ContentriumUI.view.getState().hostState.instanceId)!=='media-root')throw Error('In-flight getState clobbered captured editor state');checks.push('inflight-global-state-response-ignored');
  const reads=await page.evaluate(()=>__fixtureCalls.filter(c=>c.method==='getState').length);
  await page.evaluate(()=>{__fixtureState={...__fixtureState,instanceId:'project-item-active',revision:2,numSelectedLayers:0,context:{projectKey:'fixture',compositionId:99,layerIds:[]}};__fixtureProject=[{id:30,name:'A'},{id:31,name:'B'}];});
  await page.waitForTimeout(1200);if(!await replace.isDisabled())throw Error('Multiple Project candidates enabled replacement');
  if(await page.evaluate(()=>__fixtureCalls.filter(c=>c.method==='getState').length)!==reads)throw Error('Global getState ran during media dialog');
  if(!await dialog.isVisible())throw Error('Global Auto clobbered dialog');checks.push('modal-only-polling-holds-outer-context','exactly-one-project-candidate');
  await page.evaluate(()=>{__fixtureProject=[{id:31,name:'Updated image.png'}];});await page.waitForFunction(()=>document.querySelector('[data-media-candidate]').textContent.includes('Updated image'));
  if(await replace.isDisabled())throw Error('New compatible Project item not enabled');checks.push('project-selection-refresh');
  await page.evaluate(()=>{__fixtureSourceId=99;});await page.waitForFunction(()=>document.querySelector('dialog [role="status"]').textContent.includes('소스가 변경'));
  if(!await replace.isDisabled())throw Error('Changed source silently rebound');checks.push('source-identity-change-blocks');
  await dialog.getByRole('button',{name:'새로고침',exact:true}).click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='교체').disabled);checks.push('explicit-source-rebind');
  await dialog.getByLabel('교체할 미디어',{exact:true}).selectOption('12');await page.waitForFunction(()=>document.querySelector('[data-media-current]').textContent==='현재: 21.png');checks.push('slot-selection-refresh');
  await page.evaluate(()=>{__fixtureFail=true;});await replace.click();await page.waitForFunction(()=>document.querySelector('dialog [role="status"]').textContent.includes('PROJECT_SELECTION_CHANGED'));
  if(!await dialog.isVisible())throw Error('Failure dismissed media dialog');checks.push('native-error-code-and-refresh');
  await dialog.getByRole('button',{name:'새로고침',exact:true}).click();await page.waitForFunction(()=>!Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==='교체').disabled);
  await replace.click();await dialog.waitFor({state:'detached'});
  const call=await page.evaluate(()=>__fixtureCalls.filter(c=>c.method==='mediaAction'&&c.payload.action==='replaceSelected').pop());
  if(call.payload.context.compositionId!==7||JSON.stringify(call.payload.context.layerIds)!=='[3]'||call.payload.bindingContext.expectedSourceItemId!==99||call.payload.bindingContext.expectedMediaItemId!==21||call.payload.bindingContext.expectedItemId!==31)throw Error('Replacement lost fixed outer or checked binding context');checks.push('replacement-uses-fixed-context-and-latest-checked-binding');
  const polls=await page.evaluate(()=>__fixtureCalls.filter(c=>c.method==='mediaAction'&&c.payload.action==='context').length);
  await page.waitForTimeout(1200);if(await page.evaluate(()=>__fixtureCalls.filter(c=>c.method==='mediaAction'&&c.payload.action==='context').length)!==polls)throw Error('Closed modal kept polling');
  if(await page.evaluate(()=>__fixtureCalls.filter(c=>c.method==='getState').length)<=reads)throw Error('Global getState did not resume');checks.push('close-stops-media-poll-and-resumes-global-state');
  if(errors.length)throw Error(errors.join('; '));
  return{ok:true,scope:'isolated-browser-contract-not-native-AE',checkCount:checks.length,checks,pageErrors:errors,calls:await page.evaluate(()=>__fixtureCalls.filter(c=>c.method==='mediaAction'))};
}
