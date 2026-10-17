async page=>{
 if(!/^http:\/\/127\.0\.0\.1:/.test(page.url()))throw Error('Isolated browser required');
 const checks=[],errors=[];
 for(const scenario of ['failed-group','scrub','angle','range','refresh']){
  const context=await page.context().browser().newContext({viewport:{width:1100,height:800}}),p=await context.newPage();
  try{
   await p.addInitScript(scenario=>{
    localStorage.setItem('contentrium-preset.ui.v1',JSON.stringify({tabMode:'auto'}));window.__calls=[];window.__historyDone=false;
    window.__state={instanceId:'own',revision:'1',projectRevision:1,context:{projectKey:'own.aep',projectToken:'own',compositionId:1,layerIds:[10]},numSelectedLayers:1,hasRootNode:true,applied:[],controls:[{id:'value',name:'Value',type:scenario==='angle'?'angle':'slider',value:20,min:scenario==='angle'?-360:0,max:scenario==='angle'?360:100,groupPath:['Owned']}],controlGroups:[{key:'own-group',name:'Owned',controlIds:['value'],canSave:true}]};
    window.__adobe_cep__={getSystemPath:()=>'/isolated-history-review',evalScript:(script,cb)=>{
     const m=/\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(script);if(!m)throw Error('SCRIPT');const method=JSON.parse(m[1]),payload=JSON.parse(JSON.parse(m[2]));__calls.push({method,payload});const ok=result=>cb(JSON.stringify({ok:true,result})),fail=message=>cb(JSON.stringify({ok:false,error:{code:'TEST_REJECTED',message}}));
     if(method==='hostStatus')return ok({methods:['getState','setControl','endUndoGroup','undo','redo','propertySetAction']});
     if(method==='getState')return scenario==='refresh'&&__historyDone?fail('State refresh failed'):ok(__state);
     if(method==='propertySetAction'){if(payload.action==='getAvailablePresets')return ok({presets:[{id:'saved',name:'Saved group'}]});window.__rejectGroup=()=>fail('Group apply rejected');return;}
     if(method==='setControl'){window.__before=__state.controls[0].value;__state.controls[0].value=payload.value;__state.revision=String(++__state.projectRevision);return ok({});}
     if(method==='undo'){const before=__state.projectRevision;__state.controls[0].value=window.__before===undefined?20:__before;__state.revision=String(++__state.projectRevision);__historyDone=true;return ok({commandIssued:true,beforeRevision:before});}
     ok({});
    }};
   },scenario);
   p.on('pageerror',e=>errors.push(e.message));await p.goto(new URL('/',page.url()).href);await p.locator('#edit-tab').click();await p.locator('input[aria-label="Value"]').waitFor();
   if(scenario==='failed-group'){
    await p.getByRole('button',{name:'Owned Presets',exact:true}).click();await p.getByRole('menuitem',{name:'Saved group',exact:true}).click();await p.waitForFunction(()=>typeof __rejectGroup==='function');await p.keyboard.press('Control+z');await p.evaluate(()=>__rejectGroup());await p.waitForTimeout(160);
    if(await p.evaluate(()=>__calls.some(c=>c.method==='undo')))throw Error('Failed group apply consumed host history');
    if(!(await p.locator('#status').textContent()).includes('Group apply rejected'))throw Error('Group failure hidden');checks.push('failed group apply aborts pending history');
   }else if(['scrub','angle','range'].includes(scenario)){
    await p.evaluate(scenario=>{
     const field=document.querySelector('input[aria-label="Value"]'),row=field.closest('.control-row');
     const target=scenario==='angle'?row.querySelector('.angle-dial'):scenario==='range'?row.querySelector('input[type="range"]'):row.querySelector('.scrub-label');window.__held=target;
     const box=target.getBoundingClientRect();window.__origin={x:box.x+box.width/2,y:box.y+box.height/2};
     target.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:__origin.x+10,clientY:__origin.y}));
     if(scenario==='range'){target.value='30';target.dispatchEvent(new Event('input',{bubbles:true}));}else document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:scenario==='angle'?__origin.x:__origin.x+20,clientY:scenario==='angle'?__origin.y+10:__origin.y}));
    },scenario);
    await p.locator('#edit-tab').focus();await p.keyboard.press('Control+z');await p.waitForFunction(()=>__historyDone);await p.waitForTimeout(80);
    const count=await p.evaluate(()=>__calls.filter(c=>c.method==='setControl').length);
    await p.evaluate(scenario=>{if(scenario==='range'){__held.value='45';__held.dispatchEvent(new Event('input',{bubbles:true}));}else document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:__origin.x+25,clientY:__origin.y-10}));},scenario);await p.waitForTimeout(100);
    if(await p.evaluate(()=>__calls.filter(c=>c.method==='setControl').length)!==count)throw Error(scenario+' restarted a gesture after Undo');checks.push(scenario+' pointer interaction ends before Undo');
   }else{
    await p.locator('#edit-tab').focus();await p.keyboard.press('Control+z');await p.waitForFunction(()=>__historyDone);await p.waitForTimeout(100);
    if(!(await p.locator('#status').textContent()).includes('State refresh failed'))throw Error('Failed refresh replaced with claimed history result');checks.push('post-history refresh failure remains visible');
   }
  }finally{await context.close();}
 }
 if(errors.length)throw Error(errors.join('; '));return{ok:true,checks,scope:'real browser widgets and shortcut with isolated AE transport'};
}
