async page=>{
 if(!await page.evaluate(()=>Array.isArray(window.__fixtureCalls)))throw Error('Requires standalone fixture');
 const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 function check(ok,name){if(!ok)throw Error(name);checks.push(name);}
 async function select(ids,comp=90){await page.evaluate(async({ids,comp})=>{__fixtureState={...__fixtureState,revision:__fixtureState.revision+1,numSelectedLayers:ids.length,context:{projectKey:'fixture',compositionId:comp,layerIds:ids}};await ContentriumUI.view.refresh();},{ids,comp});}
 await page.getByRole('button',{name:'Browse',exact:true}).click();
 await page.getByLabel('라벨 필터').selectOption('');await page.getByRole('searchbox',{name:'항목 검색'}).fill('Ease Fade Together 3');
 await page.getByRole('listitem',{name:/Ease Fade Together 3/}).click();
 await page.evaluate(()=>{window.__savedFooter=document.querySelector('#apply-actions button');__fixtureState.revision++;});
 await page.evaluate(()=>ContentriumUI.view.refresh());await page.waitForTimeout(1700);
 check(await page.evaluate(()=>__savedFooter===document.querySelector('#apply-actions button')&&__savedFooter.isConnected),'unchanged host polling preserves actual footer button DOM');
 await page.evaluate(()=>{
  const original=__adobe_cep__.evalScript;
  __adobe_cep__.evalScript=(script,callback)=>{
   const m=/\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(script);
   if(JSON.parse(m[1])==='hostStatus'){callback(JSON.stringify({ok:true,result:{available:true,methods:['getState','getSettings','setSettings','getLibrary','toolAction','applyPreset'],applyOptions:{byVariant:{'31ce':{hasInOutAnims:true,containsAudio:true,canReplace:true}}}}}));return;}
   original(script,callback);
  };
  __fixtureState={...__fixtureState,numSelectedLayers:1,precompApplyOptions:{canReplace:true}};
 });
 await page.locator('#refresh').click();await page.getByRole('button',{name:'Browse',exact:true}).click();
 await page.getByRole('searchbox',{name:'항목 검색'}).fill('1-Line Basic Title 1');await page.getByRole('listitem',{name:/1-Line Basic Title 1/}).click();
 await page.getByRole('button',{name:'Down',exact:true}).click();
 check(await page.getByRole('button',{name:'Replace',exact:true}).isEnabled(),'replace starts enabled for a compatible native selection');
 await page.evaluate(async()=>{__fixtureState={...__fixtureState,revision:999,numSelectedLayers:1,precompApplyOptions:{canReplace:false},applied:[{type:10}]};await ContentriumUI.view.refresh();});
 check(await page.getByRole('button',{name:'Replace',exact:true}).isDisabled(),'actual host action availability changes still update footer');
 await page.getByRole('button',{name:'Tools',exact:true}).click();
 const shifter=page.locator('.tool-section').filter({has:page.getByRole('heading',{name:'전환 이동',exact:true})}),order=shifter.getByLabel('순서',{exact:true}),stagger=shifter.getByRole('button',{name:'엇갈리기',exact:true});
 await select([2,9]);await order.selectOption('selection');
 check(await stagger.isDisabled(),'initial multi-selection cannot masquerade as click order');
 await select([]);await select([9]);await select([2,9]);await select([2,7,9]);
 check(await stagger.isEnabled(),'observed one-by-one additions enable selection order');
 await shifter.getByLabel('엇갈리기 간격',{exact:true}).fill('12');await stagger.click();
 const call=await page.evaluate(()=>__fixtureCalls.filter(c=>c.method==='toolAction'&&c.payload.action==='stagger').at(-1));
 check(JSON.stringify(call.payload.params.selectionOrder)==='[9,2,7]'&&call.payload.params.seconds===.5&&call.payload.params.order==='selection','selection order preserves observed additions independently of sorted context');
 await select([2,7,9,11,12]);check(await stagger.isDisabled(),'simultaneous additions invalidate the recorded order');
 const input=shifter.getByLabel('이동 시간',{exact:true});
 await input.fill('-00:00:01:12');await input.press('Enter');
 await page.waitForFunction(()=>__fixtureCalls.some(c=>c.method==='toolAction'&&c.payload.action==='shift'&&c.payload.params.seconds===-1.5));
 check(true,'signed timecode submits relative seconds using actual frame duration');
 await shifter.getByRole('button',{name:'한 프레임 →',exact:true}).click({modifiers:['Shift']});
 const nudge=await page.evaluate(()=>__fixtureCalls.filter(c=>c.method==='toolAction'&&c.payload.action==='shift').at(-1));
 check(Math.abs(nudge.payload.params.seconds-10/24)<1e-12,'Shift nudge sends exactly ten native frames');
 await input.fill('0');await input.press('ArrowUp');check(await input.inputValue()==='+00:00:00:01','input arrow nudges one native frame');
 await input.press('Shift+ArrowUp');check(await input.inputValue()==='+00:00:01:01','Shift input arrow changes one second with frame display');
 await input.fill('0');await input.blur();
 const before=await page.evaluate(()=>__fixtureCalls.filter(c=>c.method==='toolAction'&&c.payload.action==='shift').length);
 await page.evaluate(()=>{const section=Array.from(document.querySelectorAll('.tool-section')).find(n=>n.querySelector('h2').textContent==='전환 이동');const caption=Array.from(section.querySelectorAll('label.workspace-row')).find(n=>n.textContent==='이동 시간').querySelector('span');caption.dispatchEvent(new PointerEvent('pointerdown',{button:0,clientX:0,clientY:0,bubbles:true}));document.dispatchEvent(new PointerEvent('pointermove',{clientX:4,clientY:0,bubbles:true}));});
 check(await page.evaluate(n=>__fixtureCalls.filter(c=>c.method==='toolAction'&&c.payload.action==='shift').length===n,before),'time scrub updates its draft without issuing intermediate native edits');
 await page.evaluate(()=>document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true})));
 await page.waitForFunction(n=>__fixtureCalls.filter(c=>c.method==='toolAction'&&c.payload.action==='shift').length===n+1,before);
 check(true,'time scrub release commits once');
 await input.fill('0');await input.blur();
 const contextBefore=await page.evaluate(()=>JSON.stringify(__fixtureState.context));
 await page.evaluate(()=>{const section=Array.from(document.querySelectorAll('.tool-section')).find(n=>n.querySelector('h2').textContent==='전환 이동');const caption=Array.from(section.querySelectorAll('label.workspace-row')).find(n=>n.textContent==='이동 시간').querySelector('span');caption.dispatchEvent(new PointerEvent('pointerdown',{button:0,clientX:0,clientY:0,bubbles:true}));document.dispatchEvent(new PointerEvent('pointermove',{clientX:4,clientY:0,bubbles:true}));});
 await select([99],91);
 await page.evaluate(()=>document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true})));
 await page.waitForTimeout(50);
 check(await page.evaluate(expected=>JSON.stringify(__fixtureCalls.filter(c=>c.method==='toolAction'&&c.payload.action==='shift').at(-1).payload.context)===expected,contextBefore),'time scrub retains its starting context for host stale-selection rejection');
 if(errors.length)throw Error(errors.join('; '));
 return{ok:true,scope:'isolated UI/host contract, not native AE',checks,pageErrors:errors};
}
