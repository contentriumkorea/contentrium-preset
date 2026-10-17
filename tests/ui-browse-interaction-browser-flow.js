async page => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw Error('Standalone product UI only');
  const context=await page.context().browser().newContext({viewport:{width:1150,height:800}}),target=await context.newPage(),checks=[],failures=[],errors=[];
  const check=(ok,name)=>{checks.push({ok,name});if(!ok)failures.push(name);};
  target.on('pageerror',e=>errors.push(e.message));
  try {
    await target.addInitScript(()=>{
      localStorage.setItem('contentrium-preset.ui.v1',JSON.stringify({tabMode:'browse'}));
      window.__calls=[];
      window.__adobe_cep__={getSystemPath:()=>'/isolated-browse-fixture',evalScript:(script,callback)=>{
        const m=/\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(script);
        if(!m)throw Error('Unexpected host script');const method=JSON.parse(m[1]),payload=JSON.parse(JSON.parse(m[2]));__calls.push({method,payload});
        let result={};if(method==='hostStatus')result={available:true,methods:['getState','getSettings','getLibrary','applyPreset']};
        if(method==='getState')result={instanceId:'none',revision:1,numSelectedLayers:1,hasRootNode:false,controls:[],applied:[]};
        if(method==='getSettings')result={settings:{pausePreviewWhenInactive:false}};
        if(method==='getLibrary')result={items:[],folders:[]};
        if(method==='applyPreset'){window.__finishApply=()=>callback(JSON.stringify({ok:true,result:{}}));return;}
        callback(JSON.stringify({ok:true,result}));
      }};
    });
    await target.goto(new URL('/',page.url()).href);await target.waitForFunction(()=>ContentriumUI.view&&document.querySelectorAll('.preset-card').length===43&&document.querySelector('#connection').classList.contains('online'));
    const card=target.locator('.preset-card').filter({has:target.locator('.variant-button')}).first();
    await card.locator('.preset-name').click();await target.waitForTimeout(550);await card.locator('.preset-name').click();
    check(await target.locator('.preset-card.selected').count()===0,'a separate second click deselects the card');
    if(failures.length)return{ok:false,checks,failures,scope:'actual browser DOM with simulated host; no native apply'};
    const grid=target.locator('#preset-grid');
    await target.waitForTimeout(550);await card.locator('.preset-name').click();
    const g=await grid.boundingBox();await target.mouse.click(g.x+1,g.y+1);
    check(await target.locator('.preset-card.selected').count()===0,'blank grid click deselects and closes options');
    await target.waitForTimeout(550);
    const r=await card.locator('.preview-wrap').boundingBox();
    await target.mouse.click(r.x+15,r.y+15);await target.mouse.click(r.x+r.width-15,r.y+15);
    check(await target.evaluate(()=>__calls.filter(c=>c.method==='applyPreset').length===0),'fast clicks far apart never apply a preset');
    await target.waitForTimeout(550);
    await target.mouse.click(r.x+20,r.y+20);await card.focus();await card.press('Enter');await target.mouse.click(r.x+20,r.y+20);
    check(await target.evaluate(()=>__calls.filter(c=>c.method==='applyPreset').length===0),'intervening keyboard action cancels a pending double click');
    if(failures.length)return{ok:false,checks,failures,scope:'actual browser DOM with simulated host; no native apply'};
    await target.waitForTimeout(550);
    await target.mouse.click(r.x+20,r.y+20);await card.locator('.card-star').click();await target.mouse.click(r.x+20,r.y+20);
    check(await target.evaluate(()=>__calls.filter(c=>c.method==='applyPreset').length===0),'intervening favorite action cancels a pending double click');
    await card.locator('.card-star').click();
    await target.waitForTimeout(550);
    await target.mouse.click(r.x+20,r.y+20);await target.mouse.click(r.x+20,r.y+20);
    await target.waitForFunction(()=>typeof __finishApply==='function');
    check(await target.evaluate(()=>__calls.filter(c=>c.method==='applyPreset').length===1),'nearby double click applies exactly once');
    check(await card.locator('.inline-variants').count()===0,'double click closes the direction list');
    check(await target.evaluate(()=>Array.from(document.querySelectorAll('#preset-grid video')).every(v=>v.paused)),'videos pause while the host applies a preset');
    await target.evaluate(()=>__finishApply());await target.waitForFunction(()=>Array.from(document.querySelectorAll('#preset-grid video')).some(v=>!v.paused));
    check(true,'visible previews resume after apply settles');
    await target.waitForTimeout(550);await card.locator('.variant-button').click();
    await card.getByRole('button',{name:'View all at once',exact:true}).click();
    check(await target.locator('.preset-card .card-star:visible').count()===0,'child variants do not expose misleading separate favorite controls');
    check(errors.length===0,'no browser script errors');return{ok:failures.length===0,checks,failures,scope:'actual browser DOM with simulated host; no native apply'};
  } finally { await context.close(); }
}
