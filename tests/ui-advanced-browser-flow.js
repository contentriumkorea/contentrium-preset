async (page) => {
  // Run after ui-workspace-browser-flow.js, only in its isolated browser fixture.
  if(!await page.evaluate(()=>Array.isArray(window.__fixtureCalls)))throw Error('No isolated UI fixture');
  const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1100,height:760});
  await page.getByLabel('라벨 필터').selectOption('');
  await page.getByRole('searchbox',{name:'항목 검색'}).fill('');
  await page.evaluate(()=>{
    const original=__adobe_cep__.evalScript;
    __adobe_cep__.evalScript=(script,callback)=>{
      const m=/\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(script),method=JSON.parse(m[1]),payload=JSON.parse(JSON.parse(m[2]));
      if(method==='hostStatus'){callback(JSON.stringify({ok:true,result:{available:true,methods:['getState','applyPreset','setControl','propertyAction','presetAction','getSettings','setSettings','getLibrary','importLibraryItem','toolAction','endUndoGroup','enumerateFonts','saveLibraryPreset'],applyOptions:{byVariant:{'31ce':{hasInOutAnims:true,containsAudio:true,canReplace:true,canApplyTexture:false}}}}}));return;}
      if(method==='importLibraryItem'&&!payload.options.compositionId){__fixtureCalls.push({method,payload});callback(JSON.stringify({ok:true,result:{requiresComposition:true,importId:'aep-one',compositions:[{id:10,name:'Comp A',duration:2},{id:11,name:'Comp B',duration:3}]}}));return;}
      original(script,callback);
    };
    __fixtureState={...__fixtureState,instanceId:'advanced',revision:20,precompApplyOptions:{canReplace:true},applied:[{...__fixtureState.applied[0],type:10}],controls:[...__fixtureState.controls,{id:'angle',name:'Rotation',type:'angle',value:0,group:'Transform'},{id:'palette',name:'Palette',type:'palette',value:'cool',group:'Color',options:[{value:'cool',label:'Cool'},{value:'warm',label:'Warm'}],actions:['save','delete']} ]};
  });
  await page.locator('#refresh').click();
  await page.getByRole('searchbox',{name:'항목 검색'}).fill('1-Line Basic Title 1');
  await page.getByRole('listitem',{name:/1-Line Basic Title 1/}).click();
  await page.getByRole('button',{name:'Down',exact:true}).click();
  if(!await page.getByLabel('Animate In',{exact:true}).isEnabled()||!await page.getByLabel('효과음 추가',{exact:true}).isEnabled())throw Error('Precomp capability options disabled');
  await page.getByLabel('Animate Out',{exact:true}).uncheck();await page.getByRole('button',{name:'Replace',exact:true}).click();
  await page.waitForFunction(()=>__fixtureCalls.some(c=>c.method==='applyPreset'&&c.payload.variantId==='31ce'));
  const apply=await page.evaluate(()=>__fixtureCalls.find(c=>c.method==='applyPreset'&&c.payload.variantId==='31ce'));
  if(!apply.payload.options.replaceSelected||apply.payload.options.animateOut!==false||apply.payload.options.keepTexts!==true||apply.payload.options.keepOtherProperties!==false)throw Error('Precomp option payload');
  if(!await page.getByRole('button',{name:'Texture',exact:true}).isDisabled())throw Error('Unsupported texture enabled');checks.push('precomp-selected-variant-capabilities-preservation-options');
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByRole('combobox',{name:'Palette',exact:true}).selectOption('1');
  await page.waitForFunction(()=>__fixtureCalls.some(c=>c.method==='setControl'&&c.payload.id==='palette'&&c.payload.value==='warm'));checks.push('palette-explicit-option-values');
  const angle=page.getByRole('textbox',{name:'Rotation',exact:true});await angle.fill('2x+30');await angle.press('Tab');
  await page.waitForFunction(()=>__fixtureCalls.some(c=>c.method==='setControl'&&c.payload.id==='angle'&&c.payload.value===750));checks.push('angle-whole-turn-input');
  const vector=page.getByRole('textbox',{name:'Position X',exact:true});await vector.fill('+=5');await vector.press('Tab');
  await page.waitForFunction(()=>__fixtureCalls.some(c=>c.method==='setControl'&&c.payload.id==='point'));
  const point=await page.evaluate(()=>__fixtureCalls.find(c=>c.method==='setControl'&&c.payload.id==='point'));
  if(JSON.stringify(point.payload.value)!=='[5,0]'||point.payload.relative!==true)throw Error('Mixed vector delta');checks.push('mixed-vector-relative-input');
  await page.getByRole('combobox',{name:'Font 스타일',exact:true}).selectOption('Fixture-Bold');await page.waitForFunction(()=>__fixtureCalls.some(c=>c.method==='setControl'&&c.payload.id==='font'&&c.payload.value==='Fixture-Bold'));checks.push('font-postscript-style-selection');
  await page.screenshot();
  await page.getByRole('button',{name:'Tools',exact:true}).click();
  if(await page.locator('.tool-section').count()!==4||await page.locator('.easing-graph circle').count()!==2)throw Error('Four tools/graph missing');
  const incoming=page.getByRole('spinbutton',{name:'In 영향도',exact:true});await incoming.fill('70');
  if(await page.getByRole('spinbutton',{name:'Out 영향도',exact:true}).inputValue()!=='70')throw Error('Linked influence mismatch');
  await page.getByRole('button',{name:'이징 적용',exact:true}).click();await page.waitForFunction(()=>__fixtureCalls.some(c=>c.method==='toolAction'&&c.payload.tool==='easing'&&c.payload.params.influenceIn===70&&c.payload.params.influenceOut===70));checks.push('four-tools-easing-lock-graph-and-request');
  const outHandle=page.getByRole('slider',{name:'Out 영향도',exact:true});await outHandle.scrollIntoViewIfNeeded();
  const graphTarget=await page.evaluate(()=>{const svg=document.querySelector('.easing-graph'),p=svg.createSVGPoint();p.x=170;p.y=110;const target=p.matrixTransform(svg.getScreenCTM());return{x:target.x,y:target.y};});
  const handleBox=await outHandle.boundingBox();await page.mouse.move(handleBox.x+handleBox.width/2,handleBox.y+handleBox.height/2);await page.mouse.down();await page.mouse.move(graphTarget.x,graphTarget.y,{steps:4});await page.mouse.up();
  if(await page.getByRole('spinbutton',{name:'Out 영향도',exact:true}).inputValue()!=='80')throw Error('SVG scaled graph coordinates do not match influence');checks.push('easing-graph-drag-coordinate-and-lock');
  const beforePreset=await page.locator('.easing-preset').count();
  await page.getByRole('button',{name:'이징 프리셋 저장',exact:true}).click();await page.getByRole('dialog').getByLabel('이름',{exact:true}).fill('Browser easing preset');await page.getByRole('dialog').getByRole('button',{name:'저장',exact:true}).click();if(await page.locator('.easing-preset').count()!==beforePreset+1)throw Error('Easing preset create');
  const saved=page.locator('.easing-preset').filter({has:page.getByRole('button',{name:'Browser easing preset',exact:true})});
  await saved.getByRole('button',{name:'↑',exact:true}).click();await saved.getByRole('button',{name:'×',exact:true}).click();if(await page.locator('.easing-preset').count()!==beforePreset)throw Error('Easing preset reorder/delete');checks.push('easing-preset-create-reorder-delete');
  await page.screenshot();
  await page.getByRole('button',{name:'패널 메뉴'}).click();await page.getByRole('menuitem',{name:'사용자 라이브러리',exact:true}).click();
  await page.getByRole('button',{name:'가져오기',exact:true}).click();
  await page.getByRole('combobox',{name:'컴포지션 선택'}).selectOption('11');
  await page.getByRole('dialog').getByRole('button',{name:'가져오기',exact:true}).click();
  await page.waitForFunction(()=>__fixtureCalls.some(c=>c.method==='importLibraryItem'&&c.payload.options.compositionId===11&&c.payload.options.importId==='aep-one'));checks.push('aep-composition-selection-reuses-import');
  await page.getByRole('button',{name:'Browse',exact:true}).click();await page.getByRole('searchbox',{name:'항목 검색'}).fill('Ease Fade Together 3');
  await page.getByRole('listitem',{name:/Ease Fade Together 3/}).click();await page.waitForTimeout(180);
  await page.evaluate(()=>ContentriumPreview.setPlaybackActive(false));await page.waitForTimeout(100);
  if(!await page.evaluate(()=>Array.from(document.querySelectorAll('#preset-grid video')).every(v=>v.paused)))throw Error('Playback suspension failed');
  await page.evaluate(()=>{ContentriumPreview.setPlaybackActive(true);});await page.waitForTimeout(200);
  if(!await page.evaluate(()=>Array.from(document.querySelectorAll('#preset-grid video')).some(v=>!v.paused)))throw Error('Visible playback resume failed');checks.push('explicit-playback-pause-resume');
  await page.screenshot();
  if(errors.length)throw Error(errors.join('; '));
  return{scope:'isolated-browser-contract-only-no-native-AE',checkCount:checks.length,checks,pageErrors:errors};
}
