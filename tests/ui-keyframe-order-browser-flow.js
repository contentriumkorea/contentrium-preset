async page => {
  // Isolated browser workflow: the native host is a controlled contract fixture.
  const context = await page.context().browser().newContext({viewport:{width:960,height:900}});
  const checks = [], errors = [], origin = new URL(page.url()).origin;
  function check(value, name) { if (!value) throw Error(name); checks.push(name); }
  try {
    await context.addInitScript(() => {
      localStorage.setItem('contentrium-preset.ui.v1', JSON.stringify({tabMode:'auto'}));
      window.__calls = [];
      window.__state = {instanceId:'order-fixture',revision:1,numSelectedLayers:1,frameDuration:1/30,
        context:{projectKey:'order-project',compositionId:17,layerIds:[31]},controls:[],applied:[],toolState:{easing:{selectionMode:'none'}}};
      window.__adobe_cep__ = {getSystemPath:()=>'/isolated-order-fixture',requestOpenExtension(){},evalScript(script, callback) {
        const m = /\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(script);
        if (!m) { callback('{"ok":false,"error":{"message":"Unknown fixture call"}}'); return; }
        const method=JSON.parse(m[1]), payload=JSON.parse(JSON.parse(m[2]));
        __calls.push({method,payload});
        if (method==='hostStatus' && window.__offline) { callback('{"ok":false,"error":{"message":"Disconnected fixture"}}'); return; }
        if (method==='getState' && location.search.includes('delayed-state') && !window.__stateReleased) { window.__releaseState=()=>{__stateReleased=true;callback(JSON.stringify({ok:true,result:__state}));}; return; }
        let result = {};
        if (method==='hostStatus') result={available:true,methods:['getState','getSettings','getLibrary'].concat(location.search.includes('unsupported')?[]:['toolAction'])};
        if (method==='getState') result=__state;
        if (method==='getSettings') result={settings:{pausePreviewWhenInactive:true,presetMotionBlurEnabled:true}};
        if (method==='getLibrary') result={folders:[],items:[]};
        if (method==='toolAction' && window.__hold) { window.__finish=()=>callback(JSON.stringify({ok:true,result:{message:'Selected'}})); return; }
        callback(JSON.stringify({ok:true,result}));
      }};
    });
    const p=await context.newPage(); p.on('pageerror',e=>errors.push(e.message));
    await p.goto(origin+'/index.html?view=keyframes');
    await p.waitForFunction(()=>ContentriumUI.view.getState().connected);
    const trigger=p.getByRole('button',{name:'같은 순서 키 선택',exact:true});
    const menu=p.getByRole('menu',{name:'같은 순서 키 선택',exact:true});
    const calls=()=>p.evaluate(()=>__calls.filter(c=>c.method==='toolAction'));
    await trigger.click();
    check((await calls()).length===0,'opening the order menu does not execute a native operation');
    check(await menu.isVisible() && await menu.getByRole('menuitem').count()===2,'one trigger exposes two order choices');
    check(await p.getByLabel('기준 키',{exact:true}).count()===0,'obsolete separate order selector is removed');
    check(await menu.getByRole('menuitem',{name:'첫 키 기준',exact:true}).evaluate(n=>n===document.activeElement),'opening focuses the first choice');
    await menu.getByRole('menuitem',{name:'첫 키 기준',exact:true}).click();
    await p.waitForFunction(()=>__calls.some(c=>c.method==='toolAction'));
    let actions=await calls();
    check(actions.length===1 && actions[0].payload.action==='selectByOrder' && actions[0].payload.params.from==='first' && actions[0].payload.context.compositionId===17,'first choice sends one guarded first-order request');
    await trigger.click(); await menu.getByRole('menuitem',{name:'마지막 키 기준',exact:true}).click();
    await p.waitForFunction(()=>__calls.filter(c=>c.method==='toolAction').length===2);
    check((await calls())[1].payload.params.from==='last','last choice sends the existing last-order request');
    await trigger.focus(); await trigger.press('ArrowDown'); await p.keyboard.press('End'); await p.keyboard.press('Home');
    check(await menu.getByRole('menuitem',{name:'첫 키 기준',exact:true}).evaluate(n=>n===document.activeElement),'keyboard opening and Home/End navigate choices');
    await p.keyboard.press('ArrowUp'); await p.keyboard.press('Enter');
    await p.waitForFunction(()=>__calls.filter(c=>c.method==='toolAction').length===3);
    check((await calls())[2].payload.params.from==='last','keyboard activation dispatches once');
    await trigger.click(); await p.keyboard.press('Escape');
    check(await menu.count()===0 && await trigger.evaluate(n=>n===document.activeElement) && (await calls()).length===3,'Escape cancels without mutation and restores trigger focus');
    await trigger.click(); await p.getByRole('heading',{name:'키프레임',exact:true}).click();
    check(await menu.count()===0 && (await calls()).length===3,'outside pointer cancels without dispatch');
    await trigger.click(); await p.keyboard.press('Tab');
    await p.waitForFunction(()=>!document.querySelector('.keyframe-order-menu'));
    check((await calls()).length===3,'Tab leaves the menu without executing');
    await trigger.click(); await p.evaluate(()=>window.dispatchEvent(new Event('blur')));
    check(await menu.count()===0 && (await calls()).length===3,'window blur cancels without executing');
    await trigger.click(); await trigger.click();
    check(await menu.count()===0 && (await calls()).length===3,'pressing the trigger again closes the menu without executing');
    for (const width of [339,340,960]) {
      await p.setViewportSize({width,height:900}); await trigger.click();
      const geometry=await menu.evaluate(n=>{const r=n.getBoundingClientRect(),b=document.querySelector('[aria-controls="keyframe-order-menu"]').getBoundingClientRect();return{placement:n.dataset.placement,left:r.left,right:r.right,top:r.top,bottom:r.bottom,triggerBottom:b.bottom,triggerRight:b.right,width:innerWidth,height:innerHeight};});
      check(geometry.left>=0 && geometry.right<=width && geometry.top>=0 && geometry.bottom<=900,'menu fits the viewport at '+width+'px');
      check(geometry.placement===(width<340?'bottom left':'right top') && (width!==339 || geometry.top>=geometry.triggerBottom),'339/340px breakpoint preserves the observed placement choice at '+width+'px');
      await p.keyboard.press('Escape');
    }
    await trigger.click(); await p.evaluate(async()=>{__state.context={projectKey:'other',compositionId:18,layerIds:[32]};__state.revision++;await ContentriumUI.view.refresh();});
    await menu.getByRole('menuitem',{name:'첫 키 기준',exact:true}).click();
    await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('바뀌'));
    check((await calls()).length===3,'selection changed while open is rejected before native dispatch');
    await p.evaluate(()=>{window.__hold=true;}); await trigger.click(); await menu.getByRole('menuitem',{name:'첫 키 기준',exact:true}).click();
    await p.waitForFunction(()=>typeof __finish==='function');
    check(await trigger.isDisabled() && await menu.count()===0,'in-flight operation closes the menu and blocks a second choice');
    await p.evaluate(()=>{document.querySelector('[aria-controls="keyframe-order-menu"]').click();__hold=false;__finish();});
    await p.waitForFunction(()=>!document.querySelector('[aria-controls="keyframe-order-menu"]').disabled);
    check((await calls()).length===4 && await trigger.evaluate(n=>n===document.activeElement),'completion restores focus without duplicate dispatch');
    const reviewFailures=[];
    const delayed=await context.newPage(); await delayed.goto(origin+'/index.html?view=keyframes&delayed-state=1');
    await delayed.waitForFunction(()=>typeof __releaseState==='function');
    await delayed.getByRole('button',{name:'같은 순서 키 선택',exact:true}).click();
    if(await delayed.locator('.keyframe-order-menu').count())reviewFailures.push('missing first state still opens menu');
    await delayed.keyboard.press('Escape'); await delayed.evaluate(()=>__releaseState());
    const lost=await context.newPage(); await lost.goto(origin+'/index.html');
    await lost.waitForFunction(()=>ContentriumUI.view.getState().connected);
    await lost.getByRole('button',{name:'Tools',exact:true}).click();
    await lost.evaluate(()=>{window.__offline=true;}); await lost.locator('#refresh').click();
    await lost.waitForFunction(()=>!ContentriumUI.view.getState().connected);
    await lost.getByRole('button',{name:'같은 순서 키 선택',exact:true}).click();
    if(await lost.locator('.keyframe-order-menu').count())reviewFailures.push('lost host still opens menu');
    await lost.keyboard.press('Escape');
    await lost.evaluate(()=>{window.__offline=false;}); await lost.locator('#refresh').click();
    await lost.waitForFunction(()=>ContentriumUI.view.getState().connected);
    await lost.getByRole('button',{name:'같은 순서 키 선택',exact:true}).click();
    await lost.evaluate(()=>{window.__offline=true;document.querySelector('#refresh').click();});
    await lost.waitForFunction(()=>!ContentriumUI.view.getState().connected);
    if(await lost.locator('.keyframe-order-menu').count())await lost.getByRole('menuitem',{name:'첫 키 기준',exact:true}).click();
    await lost.waitForTimeout(100);
    if(await lost.evaluate(()=>__calls.some(c=>c.method==='toolAction')))reviewFailures.push('lost host while open still dispatches');
    check(reviewFailures.length===0,'initial state and live host guards: '+reviewFailures.join('; '));
    const unsupported=await context.newPage(); await unsupported.goto(origin+'/index.html?view=keyframes&unsupported=1');
    await unsupported.waitForFunction(()=>ContentriumUI.view.getState().connected);
    check(await unsupported.getByRole('button',{name:'같은 순서 키 선택',exact:true}).isDisabled(),'unsupported hosts cannot open the action menu');
    check(errors.length===0,'no uncaught browser errors');
    return {ok:true,scope:'isolated UI contract, not native AE',checks,errors};
  } finally { await context.close(); }
}
