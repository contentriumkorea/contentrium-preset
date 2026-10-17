async (page) => {
  // Isolated browser contract only. No native AE or installed CEP is operated.
  if(await page.evaluate(()=>!!window.__adobe_cep__&&!Array.isArray(window.__fixtureCalls)))throw Error('Requires standalone browser');
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.continue());
  await page.addInitScript(()=>{
    localStorage.removeItem('contentrium-preset.ui.v1');localStorage.removeItem('contentrium-preset.shared.v1');localStorage.removeItem('contentrium-preset.edit-panel-open');
    window.__fixtureCalls=[];
    window.__fixtureState={instanceId:'one',revision:1,numSelectedLayers:1,selectedLayerName:'Fixture layer',hasRootNode:true,wantsRevealEditTab:true,frameDuration:1/24,context:{projectKey:'fixture',compositionId:7,layerIds:[3]},clipboard:{numPresets:1,canCopy:true},applied:[{id:'p1',instanceId:'p1',variantId:'125',name:'Fixture preset',direction:'in',actions:['reveal','copy','reset','remove']}],controls:[{id:'distance',name:'Distance',type:'number',value:220,min:0,max:500,step:1,group:'In',actions:['reset']},{id:'timing',name:'In duration',type:'time',value:.5,group:'In',actions:['alignToPlayhead']},{id:'marker',name:'Transition marker',nodeType:'effect_preset_marker_group',actions:['add'],group:'In'},{id:'point',name:'Position',type:'point',value:[10,20],mixed:true,group:'Transform'},{id:'font',name:'Font',type:'font',value:'Fixture-Regular',group:'Text'}]};
    window.__fixtureState.toolState={easing:{selectionMode:'single'}};
    const methods=['getState','applyPreset','setControl','propertyAction','presetAction','getSettings','setSettings','getLibrary','addLibraryFolder','removeLibraryFolder','importLibraryItem','replaceLibraryItem','saveLibraryPreset','removeLibraryItem','toolAction','undo','redo','endUndoGroup','enumerateFonts'];
    window.__adobe_cep__={getSystemPath:()=>'/isolated-browser-fixture',requestOpenExtension:()=>{},evalScript:(script,callback)=>{
      const match=/\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(script);
      if(!match){callback(JSON.stringify({ok:false,error:{message:'fixture parse failed'}}));return;}
      const method=JSON.parse(match[1]),payload=JSON.parse(JSON.parse(match[2]));__fixtureCalls.push({method,payload});
      let result={};if(method==='hostStatus')result={available:true,methods};
      else if(method==='getState')result=__fixtureState;
      else if(method==='getSettings')result={settings:{pausePreviewWhenInactive:true,presetMotionBlurEnabled:false,presetPseudoEnabled:false,insertPrecompAfterInTransition:false,copyUserLibFootageNextToProject:true}};
      else if(method==='getLibrary')result={folders:[],items:[{id:'fixture-media',name:'Fixture media',kind:'image',preview:'assets/preview-logo.png'}],supportedTypes:['image']};
      else if(method==='enumerateFonts')result={fonts:[{family:'Fixture',style:'Regular',postScriptName:'Fixture-Regular'},{family:'Fixture',style:'Bold',postScriptName:'Fixture-Bold'}]};
      callback(JSON.stringify({ok:true,result}));
    }};
  });
  await page.reload();await page.waitForFunction(()=>ContentriumUI.view.getState().tab==='edit');
  await page.getByRole('textbox',{name:'Distance',exact:true}).waitFor();
  await page.getByRole('button',{name:'Browse',exact:true}).click();
  await page.evaluate(()=>{__fixtureState={...__fixtureState,instanceId:'two',revision:2};});
  await page.waitForTimeout(900);if(await page.locator('#browse-view').isHidden())throw Error('Manual Browse pin lost');
  await page.getByLabel('탭 전환 모드').selectOption('auto');await page.waitForFunction(()=>ContentriumUI.view.getState().tab==='edit');
  const input=page.getByRole('textbox',{name:'Distance',exact:true});await input.fill('+=12');
  await page.evaluate(()=>{window.__focusedNode=document.activeElement;__fixtureState.revision++;});await page.waitForTimeout(900);
  if(!await page.evaluate(()=>document.activeElement===__focusedNode&&document.activeElement.value==='+=12'))throw Error('Polling replaced focused input');
  await input.press('Tab');await page.waitForFunction(()=>__fixtureCalls.some(c=>c.method==='setControl'&&c.payload.id==='distance'));
  const numeric=await page.evaluate(()=>__fixtureCalls.find(c=>c.method==='setControl'&&c.payload.id==='distance'));
  if(numeric.payload.value!==12||numeric.payload.relative!==true||numeric.payload.context.compositionId!==7)throw Error('Relative/context payload incorrect');
  const time=page.getByRole('textbox',{name:'In duration',exact:true});await time.fill('18f');await time.press('Tab');
  await page.waitForFunction(()=>__fixtureCalls.some(c=>c.method==='setControl'&&c.payload.id==='timing'));
  if(await page.evaluate(()=>__fixtureCalls.find(c=>c.method==='setControl'&&c.payload.id==='timing').payload.value)!==.75)throw Error('Frame conversion incorrect');
  await page.getByRole('button',{name:'마커 추가',exact:true}).click();await page.waitForFunction(()=>__fixtureCalls.some(c=>c.method==='propertyAction'&&c.payload.action==='add'));
  await page.locator('.preset-actions').getByRole('button',{name:'복사',exact:true}).click();await page.waitForFunction(()=>__fixtureCalls.some(c=>c.method==='presetAction'&&c.payload.action==='copy'));
  await page.getByRole('button',{name:'Tools',exact:true}).click();await page.getByRole('button',{name:'같은 순서 키 선택',exact:true}).click();
  await page.getByRole('menuitem',{name:'첫 키 기준',exact:true}).click();
  await page.waitForFunction(()=>__fixtureCalls.some(c=>c.method==='toolAction'&&c.payload.action==='selectByOrder'));
  const tool=await page.evaluate(()=>__fixtureCalls.find(c=>c.method==='toolAction'&&c.payload.action==='selectByOrder'));
  if(tool.payload.tool!=='keyframes'||tool.payload.params.from!=='first'||'every' in tool.payload.params)throw Error('Tool contract incorrect');
  await page.getByRole('button',{name:'패널 메뉴'}).click();await page.getByRole('menuitem',{name:'설정',exact:true}).click();
  await page.getByLabel('프리셋 적용 시 모션 블러 켜기').check();await page.waitForFunction(()=>__fixtureCalls.some(c=>c.method==='setSettings'&&c.payload.key==='presetMotionBlurEnabled'&&c.payload.value===true));
  await page.getByRole('button',{name:'패널 메뉴'}).click();await page.getByRole('menuitem',{name:'사용자 라이브러리',exact:true}).click();
  await page.locator('#library-content').getByText('Fixture media',{exact:true}).waitFor();await page.locator('#library-content').getByRole('button',{name:'가져오기',exact:true}).click();await page.waitForFunction(()=>__fixtureCalls.some(c=>c.method==='importLibraryItem'&&c.payload.id==='fixture-media'));
  await page.getByRole('button',{name:'Browse',exact:true}).click();await page.getByRole('searchbox',{name:'항목 검색'}).fill('Ease Fade Together 3');
  await page.getByRole('listitem',{name:/Ease Fade Together 3/}).click({button:'right'});await page.getByRole('menuitem',{name:'라벨 · 빨강',exact:true}).click();
  await page.getByLabel('라벨 필터').selectOption('red');if(await page.locator('.preset-card').count()!==1)throw Error('Label filter failed');
  await page.getByLabel('라벨 필터').selectOption('');await page.getByLabel('라벨 필터').selectOption('blue');if(await page.locator('.preset-card').count()!==0)throw Error('Label exclusion failed');
  if(errors.length)throw Error('Browser errors: '+errors.join('; '));
  return{scope:'isolated-browser-host-contract-not-native-AE',checkCount:13,checks:['auto-initial-edit','manual-browse-pin','auto-reenabled','focused-dom-preserved','relative-context-commit','frame-input','marker-action','preset-scope-copy','keyframe-tool-request','settings-write','library-import','label-inclusion','label-exclusion'],pageErrors:errors,calls:await page.evaluate(()=>__fixtureCalls.map(c=>({method:c.method,payload:c.payload})))};
}
