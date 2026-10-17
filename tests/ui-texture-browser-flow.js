async page=>{
 if(!/^http:\/\/127\.0\.0\.1:/.test(page.url()))throw Error('Isolated local browser required');
 const context=await page.context().browser().newContext({viewport:{width:1200,height:900}}),target=await context.newPage(),checks=[],errors=[];
 const check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
 try{
  await target.addInitScript(()=>{
   localStorage.setItem('contentrium-preset.ui.v1',JSON.stringify({tabMode:'auto'}));
   window.__textureCalls=[];
   window.__textureState={instanceId:'target',revision:'1',projectRevision:1,context:{projectKey:'owned.aep',projectToken:'fixture',compositionId:7,layerIds:[8]},numSelectedLayers:1,hasRootNode:false,applied:[],controls:[],precompApplyOptions:{canApplyTexture:true,canReplaceTexture:false}};
   window.__textureLibrary={folders:[],capabilities:{audioTransforms:true,imageSequence:true},items:[{id:'img',name:'Owned texture',kind:'image',path:'C:/own/logo.png',preview:'assets/preview-logo.png'},{id:'seq',name:'Owned sequence',kind:'image-sequence',path:'C:/own/001.png',preview:'assets/preview-logo.png',frameCount:3},{id:'project',name:'Owned project',kind:'project',path:'C:/own/test.aep'}]};
   window.__adobe_cep__={getSystemPath:()=>'/isolated-texture-fixture',evalScript:(script,cb)=>{
    const match=/\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(script);if(!match)throw Error('Fixture script mismatch');
    const method=JSON.parse(match[1]),payload=JSON.parse(JSON.parse(match[2]));__textureCalls.push({method,payload});const answer=result=>cb(JSON.stringify({ok:true,result}));
    if(method==='hostStatus')return answer({methods:['getState','getLibrary','importLibraryItem','replaceLibraryItem','presetAction','setControl'],capabilities:{textureMedia:true}});
    if(method==='getState')return answer(__textureState);
    if(method==='getLibrary')return answer(__textureLibrary);
    if(method==='importLibraryItem'&&payload.options.insertAsTexture){__textureState={...__textureState,instanceId:'texture-root',revision:'2',projectRevision:2,context:{...__textureState.context,layerIds:[300]},hasRootNode:true,wantsRevealEditTab:true,precompApplyOptions:{canApplyTexture:false,canReplaceTexture:true,textureSelected:true},applied:[{id:'texture:300:own',instanceId:'own',variantId:'library:'+payload.id,layerId:300,kind:'texture',name:'Owned texture',type:10,actions:['copy','remove','reset','reveal']}],controls:[{id:'texture:300:duration',semantic:'duration',type:'time',name:'Duration',value:2,groupPath:['Owned texture','Texture']},{id:'texture:300:color',semantic:'color',type:'color',name:'Color',value:[.2,.3,.8],groupPath:['Owned texture','Texture']},{id:'texture:300:choke',semantic:'choke',type:'slider',name:'Choke',value:25,min:-1000000,max:1000000,sliderMin:0,sliderMax:100,groupPath:['Owned texture','Texture']}]};return setTimeout(()=>answer({kind:'texture',addedLayerId:300}),100);}
    return answer({ok:true});
   }};
  });
  target.on('pageerror',e=>errors.push(e.message));await target.goto(new URL('/',page.url()).href);
  await target.locator('.preset-card[data-entry-id="library:img"]').click();
  const footer=target.locator('#apply-actions');await footer.getByRole('button',{name:'Texture',exact:true}).waitFor();
  check(await footer.getByRole('button',{name:'Texture',exact:true}).isEnabled(),'image Texture available for one visual target');
  await target.evaluate(()=>window.__keptTextureImage=document.querySelector('.preset-card[data-entry-id="library:img"] img'));
  await target.evaluate(()=>{__textureState={...__textureState,revision:'camera',context:{...__textureState.context,layerIds:[9]},precompApplyOptions:{canApplyTexture:false,canReplaceTexture:false}};});
  await target.waitForFunction(()=>document.querySelector('#apply-actions [data-texture-action="apply"]').disabled);
  check(await target.evaluate(()=>__keptTextureImage===document.querySelector('.preset-card[data-entry-id="library:img"] img')),'target changes do not recreate the image preview');
  await target.evaluate(()=>{__textureState={...__textureState,revision:'visual',context:{...__textureState.context,layerIds:[8]},precompApplyOptions:{canApplyTexture:true,canReplaceTexture:false}};});
  await target.waitForFunction(()=>!document.querySelector('#apply-actions [data-texture-action="apply"]').disabled);
  await footer.getByRole('button',{name:'Texture',exact:true}).click();
  await target.waitForFunction(()=>ContentriumUI.view.getState().tab==='edit');
  check(await target.getByRole('textbox',{name:'Duration',exact:true}).isVisible(),'applied Texture opens typed Edit controls automatically');
  const writes=await target.evaluate(()=>__textureCalls.filter(c=>c.method==='importLibraryItem'));
  check(writes.length===1&&writes[0].payload.options.insertAsTexture&&writes[0].payload.context.layerIds[0]===8,'Texture dispatches once with the captured target context');
  await target.getByRole('button',{name:'Browse',exact:true}).click();
  await target.locator('.preset-card[data-entry-id="library:seq"]').click();
  await footer.getByLabel('이미지 시퀀스 프레임레이트').fill('12');
  check(await footer.getByRole('button',{name:'텍스처 교체',exact:true}).isEnabled(),'owned texture enables same-role replacement');
  await footer.getByRole('button',{name:'텍스처 교체',exact:true}).click();
  await target.waitForFunction(()=>__textureCalls.some(c=>c.method==='replaceLibraryItem'));
  check(await target.evaluate(()=>{const c=__textureCalls.find(c=>c.method==='replaceLibraryItem');return c.payload.options.insertAsTexture&&c.payload.options.conformFrameRate===12&&c.payload.options.keepOtherProperties===true&&c.payload.context.layerIds[0]===300;}),'Texture replacement retains FPS and controls and targets the existing root');
  await target.getByRole('button',{name:'패널 메뉴',exact:true}).click();await target.getByRole('menuitem',{name:'사용자 라이브러리',exact:true}).click();
  const row=target.locator('.library-item[data-item-id="seq"]');await row.getByRole('button',{name:'텍스처 교체',exact:true}).waitFor();
  check(await row.getByRole('button',{name:'텍스처 교체',exact:true}).isEnabled(),'management Library exposes the same Texture replacement action');
  check(await target.locator('.library-item[data-item-id="img"]').getByRole('button',{name:'선택 항목 교체',exact:true}).isDisabled(),'ordinary management replacement is disabled for a Texture root');
  await row.getByRole('button',{name:'텍스처 교체',exact:true}).click();
  await target.waitForFunction(()=>__textureCalls.filter(c=>c.method==='replaceLibraryItem').length===2);
  check(await target.evaluate(()=>{const c=__textureCalls.filter(c=>c.method==='replaceLibraryItem')[1];return c.payload.options.insertAsTexture&&c.payload.options.conformFrameRate===12;}),'management sequence Texture replacement dispatches without ordinary sequence replacement capability');
  await target.evaluate(()=>{__textureState={...__textureState,revision:'none',numSelectedLayers:0,context:{...__textureState.context,layerIds:[]},precompApplyOptions:{canApplyTexture:false,canReplaceTexture:false}};});
  await target.waitForFunction(()=>document.querySelector('.library-item[data-item-id="seq"] [data-texture-action="replace"]').disabled);
  check(await row.getByLabel('Owned sequence 프레임레이트').inputValue()==='12','selection polling preserves sequence input in management Library');
  check(await target.locator('.library-item[data-item-id="project"] [data-texture-action]').count()===0,'AE projects never show Texture actions');
  check(errors.length===0,'Texture browser flow has no script errors: '+errors.join('; '));
  return {ok:true,checkCount:checks.length,checks,scope:'real browser UI with simulated AE; native acceptance is separate'};
 }finally{await context.close();}
}
