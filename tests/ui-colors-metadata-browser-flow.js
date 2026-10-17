async page=>{
 if(!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url()))throw Error('Own standalone UI only');
 const context=await page.context().browser().newContext(),target=await context.newPage(),checks=[],errors=[];
 const check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};target.on('pageerror',error=>errors.push(error.message));
 try{
  await target.addInitScript(()=>{
   window.__fixtureCalls=[];
   window.__state={instanceId:'same-color-selection',revision:1,projectRevision:41,numSelectedLayers:2,hasRootNode:true,wantsRevealEditTab:true,context:{projectKey:'fixture',projectToken:'fixture-token',compositionId:7,layerIds:[3,4]},controls:[{id:'stable-color',name:'#3366CC',type:'color',semantic:'selected-layer-color',value:[.2,.4,.8],enabled:true,groupPath:['Layer Selection','Colors'],actions:['copy','paste']},{id:'draft',name:'Draft text',type:'text',value:'host text'}],applied:[]};
   window.__adobe_cep__={getSystemPath:()=>'/isolated-color-fixture',evalScript:(script,callback)=>{
    const match=/\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(script);
    if(!match){callback(JSON.stringify({ok:false,error:{message:'fixture parse'}}));return;}
    const method=JSON.parse(match[1]),payload=JSON.parse(JSON.parse(match[2]));__fixtureCalls.push({method,payload});let result={};
    if(method==='hostStatus')result={available:true,methods:['getState','getSettings','getLibrary','setControl','propertyAction']};
    else if(method==='getState')result=__state;
    else if(method==='getSettings')result={settings:{pausePreviewWhenInactive:true}};
    else if(method==='getLibrary')result={items:[],folders:[]};
    else if(method==='setControl'){
     if(payload.expectedRevision!==__state.projectRevision){callback(JSON.stringify({ok:false,error:{code:'STALE',message:'stale revision'}}));return;}
     __state.projectRevision++;__state.revision++;__state.controls[0].value=payload.value;
     __state.controls[0].name='#'+payload.value.slice(0,3).map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('').toUpperCase();
    }
    callback(JSON.stringify({ok:true,result}));
   }};
  });
  await target.goto(new URL('/',page.url()).href);await target.waitForFunction(()=>ContentriumUI.view&&ContentriumUI.view.getState().hostState);
  const row=target.locator('[data-control-id="stable-color"]'),color=row.locator('input[type="color"]');
  await color.focus();await target.evaluate(()=>{window.__savedColor=document.activeElement;});await color.fill('#66cc33');
  await target.waitForFunction(()=>ContentriumUI.view.getState().hostState.controls[0].name==='#66CC33');
  check(await row.locator('.control-label').textContent()==='#66CC33','focused committed color updates visible name from accepted host state');
  check(await color.getAttribute('aria-label')==='#66CC33','focused committed color updates accessible name');
  check(await target.evaluate(()=>document.activeElement===__savedColor&&__savedColor.isConnected),'metadata reconciliation preserves focused input DOM');
  await color.fill('#cc3366');await target.waitForFunction(()=>ContentriumUI.view.getState().hostState.controls[0].name==='#CC3366');
  const calls=await target.evaluate(()=>__fixtureCalls.filter(call=>call.method==='setControl'));
  check(calls.length===2&&calls[1].payload.expectedRevision===42,'second focused color commit uses latest accepted project revision');
  const text=target.getByRole('textbox',{name:'Draft text',exact:true});await text.focus();await text.fill('uncommitted local draft');
  await target.evaluate(async()=>{__state.revision++;__state.projectRevision++;__state.controls[0].name='#112233';__state.controls[0].value=[1/15,2/15,.2];await ContentriumUI.view.refresh();});
  check(await text.inputValue()==='uncommitted local draft'&&await text.evaluate(node=>node===document.activeElement),'metadata reconciliation preserves another field draft and focus');
  check(await row.locator('.control-label').textContent()==='#112233'&&await color.getAttribute('aria-label')==='#112233'&&await color.inputValue()==='#112233','external accepted color state updates metadata and unfocused swatch while another field is focused');
  if(errors.length)throw Error(errors.join('; '));return{ok:true,scope:'real standalone panel; simulated host state/commit; no native AE',checkCount:checks.length,checks,pageErrors:errors};
 }finally{await context.close();}
}
