async page => {
  if(!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url()))throw Error('Own standalone HTTP UI only');
  const origin=new URL(page.url()).origin,browser=page.context().browser(),contexts=[],peers=new Map(),sent=[],errors=[],checks=[],deliveryDrops=[],drop=new Set();
  const hostSettings={pausePreviewWhenInactive:true,presetMotionBlurEnabled:false,insertPrecompAfterInTransition:false,copyUserLibFootageNextToProject:true};
  function check(ok,label){if(!ok)throw Error(label);checks.push(label);}
  async function setup(name,slot){
    const context=await browser.newContext();contexts.push(context);const target=await context.newPage();peers.set(name,target);
    target.on('pageerror',e=>errors.push(name+': '+e.message));await target.route('**/*',r=>r.continue());
    await target.exposeFunction('__syncDispatch',async event=>{
      if(drop.has(name))return;sent.push({from:name,event});if(sent.length>500)throw Error('Sync rebroadcast loop');
      await Promise.all(Array.from(peers).map(async([peer,p])=>{
        if(drop.has(peer)||p.isClosed())return;
        try{await p.evaluate(e=>window.__cepDeliver&&window.__cepDeliver(e),event);}
        catch(error){if(/Execution context was destroyed|Target page, context or browser has been closed/.test(error.message))deliveryDrops.push({peer,reason:error.message.split('\n')[0]});else throw error;}
      }));
    });
    await target.exposeFunction('__hostFixture',async(method,payload)=>{
      if(method==='hostStatus')return{available:true,methods:['getState','getSettings','setSettings','getLibrary']};
      if(method==='getState')return{instanceId:'unchanged',revision:1,numSelectedLayers:1,hasRootNode:true,wantsRevealEditTab:true,controls:[],applied:[]};
      if(method==='getSettings')return{settings:{...hostSettings}};
      if(method==='setSettings'){hostSettings[payload.key]=payload.value;return{settings:{...hostSettings}};}
      if(method==='getLibrary')return{items:[],folders:[]};return{};
    });
    await target.addInitScript(({slot})=>{
      window.__fixtureCalls=[];window.__opened=[];window.__closed=false;window.__syncErrors=[];const listeners=new Map();
      window.__cepDeliver=event=>{const callback=listeners.get(event.type);if(callback)callback({...event,data:typeof event.data==='string'?JSON.parse(event.data):event.data});};
      window.__adobe_cep__={getExtensionId:()=>slot==='main'?'com.contentrium.preset':'com.contentrium.preset.'+slot,
        getHostEnvironment:()=>JSON.stringify({appId:'AEFT'}),getSystemPath:()=>'/isolated-sync-fixture',
        addEventListener:(type,callback)=>listeners.set(type,callback),removeEventListener:(type,callback)=>{if(listeners.get(type)===callback)listeners.delete(type);},
        dispatchEvent:event=>{__syncDispatch(event).catch(e=>__syncErrors.push(e.message));},
        requestOpenExtension:id=>__opened.push(id),closeExtension:()=>{__closed=true;dispatchEvent(new Event('unload'));},
        evalScript:(script,callback)=>{
          const m=/\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(script);
          if(!m){callback(JSON.stringify({ok:false,error:{message:'fixture parse'}}));return;}
          const method=JSON.parse(m[1]),payload=JSON.parse(JSON.parse(m[2]));__fixtureCalls.push({method,payload});
          __hostFixture(method,payload).then(result=>callback(JSON.stringify({ok:true,result})),e=>callback(JSON.stringify({ok:false,error:{message:e.message}})));
        }};
    },{slot});
    await target.goto(origin+'/'+(slot==='main'?'':'?view='+slot));await target.waitForFunction(()=>window.ContentriumUI&&ContentriumUI.view&&ContentriumUI.view.getState().connected);
    return target;
  }
  async function menu(target,label){await target.getByRole('button',{name:'패널 메뉴',exact:true}).click();await target.getByRole('menuitem',{name:label,exact:true}).click();}
  try{
    const migrationFailures=[];
    const main=await setup('main','main');await main.waitForFunction(()=>ContentriumUI.view.getState().tab==='edit'&&ContentriumUI.view.getCatalog().length===43);
    const first=await main.evaluate(()=>({favorites:ContentriumUI.view.getState().favorites,defaults:ContentriumUI.view.getCatalog().filter(e=>e.favorite!==false).map(e=>e.id)}));
    if(JSON.stringify(first.favorites.slice().sort())!==JSON.stringify(first.defaults.slice().sort()))migrationFailures.push('Fresh storage replaced catalog defaults with an empty shared record');
    else checks.push('fresh storage preserves catalog default favorites without an empty bootstrap record');
    const freshRecord=await main.evaluate(()=>JSON.parse(localStorage.getItem(ContentriumSync.STATE_KEY)||'null'));
    if(freshRecord&&freshRecord.shared!==null||sent.some(r=>JSON.parse(r.event.data).kind==='shared'))migrationFailures.push('Fresh bootstrap published or seeded a shared preference record');
    else checks.push('unset bootstrap remains null and sends no shared preference update');
    const earlyEdit=await setup('earlyEdit','edit');await main.waitForFunction(()=>ContentriumUI.view.getState().tab==='browse');
    const legacy=await main.evaluate(()=>({favorites:[ContentriumUI.view.getCatalog()[2].id],labels:{['item:'+ContentriumUI.view.getCatalog()[2].id]:'purple'}}));
    await main.evaluate(value=>{localStorage.clear();localStorage.setItem('contentrium-preset.ui.v1',JSON.stringify({favorites:value.favorites,labels:value.labels,selectedVariants:{}}));},legacy);
    await main.reload();await main.waitForFunction(()=>ContentriumUI.view&&ContentriumUI.view.getState().connected&&ContentriumUI.view.getCatalog().length===43);
    await earlyEdit.waitForFunction(value=>JSON.stringify({favorites:ContentriumUI.view.getState().favorites,labels:ContentriumUI.view.getState().labels})===JSON.stringify(value),legacy);
    checks.push('late legacy main backfills an already-open unset Edit without requiring focus');
    await earlyEdit.context().close();peers.delete('earlyEdit');
    const edit=await setup('edit','edit');await main.waitForFunction(()=>ContentriumUI.view.getState().tab==='browse');
    await main.evaluate(()=>dispatchEvent(new Event('focus')));await main.waitForTimeout(300);
    const migrated=await Promise.all([main,edit].map(p=>p.evaluate(()=>({favorites:ContentriumUI.view.getState().favorites,labels:ContentriumUI.view.getState().labels}))));
    if(migrated.some(v=>JSON.stringify(v)!==JSON.stringify(legacy)))migrationFailures.push('Legacy main favorites/label overwritten or missing in fresh independent Edit: '+JSON.stringify(migrated));
    else checks.push('legacy main distinctive favorites/label win against fresh Edit unset storage');
    if(migrationFailures.length)throw Error('Migration regression: '+migrationFailures.join('; '));
    check(main.context()!==edit.context(),'localStorage is genuinely separated by browser contexts');
    check(await main.evaluate(()=>JSON.parse(localStorage.getItem('contentrium-preset.panel-lease.edit')).token!==JSON.parse(localStorage.getItem('contentrium-preset.panel-lease.main')).token),'CEP event lease reaches independent storage; main Auto returns to Browse');
    check(await edit.evaluate(()=>!!localStorage.getItem('contentrium-preset.panel-lease.main')),'hello targeted snapshot learns an already running main lease');
    const star=main.locator('.card-star').first();await star.click();
    const changedFavorites=await main.evaluate(()=>ContentriumUI.view.getState().favorites.slice().sort()),favorite=changedFavorites[0];await edit.waitForFunction(ids=>JSON.stringify(ContentriumUI.view.getState().favorites.slice().sort())===JSON.stringify(ids),changedFavorites);check(true,'actual changed favorite set crosses independent CEP stores');
    await main.locator('.preset-card').first().click({button:'right'});await main.getByRole('menuitem',{name:'라벨 · 빨강',exact:true}).click();
    const labels=await main.evaluate(()=>ContentriumUI.view.getState().labels);await edit.waitForFunction(v=>JSON.stringify(ContentriumUI.view.getState().labels)===JSON.stringify(v),labels);check(true,'labels cross independent CEP stores');
    await menu(main,'설정');await main.waitForTimeout(100);const before=await edit.evaluate(()=>__fixtureCalls.filter(c=>c.method==='getSettings').length);
    await main.getByLabel('패널이 비활성화되면 미리보기 일시 정지',{exact:true}).uncheck();await edit.waitForFunction(n=>__fixtureCalls.filter(c=>c.method==='getSettings').length===n+1,before);
    await edit.waitForTimeout(1300);check(await edit.evaluate(n=>__fixtureCalls.filter(c=>c.method==='getSettings').length===n+1,before),'settings cause one peer host read without heartbeat/echo loop');
    await edit.reload();await edit.waitForFunction(id=>ContentriumUI.view&&ContentriumUI.view.getState().favorites.includes(id),favorite);check(true,'reload/new origin rejoins with shared favorites and settings');
    await edit.waitForFunction(()=>ContentriumUI.view.getState().connected);const identity=await main.evaluate(()=>ContentriumUI.view.getState().hostState.instanceId);
    await main.evaluate(()=>ContentriumUI.view.selectTab('browse',true));drop.add('edit');await edit.evaluate(()=>dispatchEvent(new Event('unload')));
    await main.waitForFunction(()=>ContentriumUI.view.getState().tab==='edit',null,{timeout:6500});check(await main.evaluate(id=>ContentriumUI.view.getState().hostState.instanceId===id,identity),'lost Edit release/heartbeat expires and Auto returns to Edit with unchanged instance');
    await edit.context().close();peers.delete('edit');drop.delete('edit');
    const edit2=await setup('edit2','edit');await main.waitForFunction(()=>ContentriumUI.view.getState().tab==='browse');
    await main.getByRole('button',{name:'Browse',exact:true}).click();await menu(main,'Edit 패널 다시 결합');await edit2.waitForFunction(()=>__closed);
    await main.waitForTimeout(100);check(await main.evaluate(()=>ContentriumUI.view.getState().tab==='browse'&&ContentriumUI.view.getState().tabMode==='browse'),'IPC rejoin closes Edit and preserves manual Browse pin');
    await main.getByLabel('탭 전환 모드').selectOption('auto');await main.waitForFunction(()=>ContentriumUI.view.getState().tab==='edit');check(true,'Auto can re-enter Edit after rejoin');
    const alt=await setup('alt2','alt2');await main.waitForFunction(()=>!!localStorage.getItem('contentrium-preset.panel-lease.alt2'));
    await main.evaluate(()=>localStorage.setItem('contentrium-preset.next-panel','2'));await menu(main,'새 Browse 패널');check(await main.evaluate(()=>__opened.at(-1)==='com.contentrium.preset.alt3'),'remote live alt2 leads to unused alt3 reservation');
    await alt.waitForFunction(()=>!!localStorage.getItem('contentrium-preset.panel-lease.alt3'));check(true,'opening reservation propagates to other independent stores');
    await main.evaluate(()=>ContentriumUI.view.selectTab('browse',true));
    while(await main.locator('.card-star.active').count())await main.locator('.card-star.active').first().click();
    await alt.waitForFunction(()=>ContentriumUI.view.getState().favorites.length===0);check(true,'explicit empty favorite selection propagates as a valid deletion');
    await main.reload();await main.waitForFunction(()=>ContentriumUI.view&&ContentriumUI.view.getCatalog().length===43);
    check(await main.evaluate(()=>ContentriumUI.view.getState().favorites.length===0),'explicit empty selection survives reload without catalog defaults returning');
    const bad={type:'com.contentrium.preset.sync.v1',scope:'APPLICATION',appId:'AEFT',extensionId:'com.unrelated.extension',data:JSON.stringify({v:1,sender:'com.unrelated.extension',origin:'forged-origin-token',seq:1,sentAt:Date.now(),target:null,kind:'shared',payload:{value:{favorites:['forged'],labels:{}},stamp:{at:Date.now(),seq:1,origin:'forged-origin-token'}}})};
    await main.evaluate(e=>__cepDeliver(e),bad);await main.waitForTimeout(50);check(!await main.evaluate(()=>ContentriumUI.view.getState().favorites.includes('forged')),'unrelated extension messages rejected');
    for(const [name,target]of peers)if(!target.isClosed())errors.push(...await target.evaluate(()=>__syncErrors));
    if(errors.length)throw Error('Page/CEP errors: '+errors.join('; '));check(true,'no page or async CEP-bus errors');
    return{ok:true,scope:'actual browser UI; separate browser-context localStorage; simulated installed CEP application-event API; no native AE',checkCount:checks.length,checks,pageErrors:errors,deliveryDrops,eventCount:sent.length,eventKinds:sent.reduce((a,r)=>{const k=JSON.parse(r.event.data).kind;a[k]=(a[k]||0)+1;return a;},{})};
  }finally{for(const c of contexts)await c.close().catch(()=>{});}
}
