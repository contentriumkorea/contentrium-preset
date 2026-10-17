async page=>{
 if(!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url()))throw Error('Standalone UI only');
 const context=await page.context().browser().newContext(),target=await context.newPage(),errors=[],checks=[];
 target.on('pageerror',e=>errors.push(e.message));const check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
 try{
  await target.route('**/*',route=>route.continue());await target.clock.install();
  await target.addInitScript(()=>{
   localStorage.setItem('contentrium-preset.ui.v1',JSON.stringify({tabMode:'auto'}));
   window.__fixtureCalls=[];window.__holdRead=false;window.__held=[];
   window.__state={instanceId:'same',revision:1,numSelectedLayers:1,selectedLayerName:'Fixture',hasRootNode:true,wantsRevealEditTab:true,context:{projectKey:'fixture',compositionId:7,layerIds:[3]},controls:[{id:'distance',name:'Distance',type:'number',value:10,min:0,max:100}],applied:[]};
   window.__adobe_cep__={getSystemPath:()=>'/isolated-transport-fixture',evalScript:(script,callback)=>{
    const m=/\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(script);if(!m){callback(JSON.stringify({ok:false,error:{message:'fixture parse'}}));return;}
    const method=JSON.parse(m[1]),payload=JSON.parse(JSON.parse(m[2]));__fixtureCalls.push({method,payload});let result={};
    if(method==='hostStatus')result={available:true,methods:['getState','getSettings','getLibrary','setControl']};
    else if(method==='getState'){if(__holdRead){__held.push(()=>callback(JSON.stringify({ok:true,result:__state})));return;}result=__state;}
    else if(method==='getSettings')result={settings:{pausePreviewWhenInactive:true}};
    else if(method==='getLibrary')result={items:[],folders:[]};callback(JSON.stringify({ok:true,result}));
   }};
  });
  await target.goto(new URL('/',page.url()).href);await target.waitForFunction(()=>ContentriumUI.view&&ContentriumUI.view.getState().hostState);
  async function hold(){await target.evaluate(()=>{__holdRead=true;ContentriumUI.view.refresh();});await target.waitForFunction(()=>__held.length>0);}
  async function expire(){await target.clock.fastForward(61000);await target.waitForFunction(()=>ContentriumUI.view.getTransportState().waitingLate);}
  async function release(){await target.evaluate(()=>{__holdRead=false;__state.revision++;__held.shift()();});await target.evaluate(()=>ContentriumUI.view.refresh());}
  await hold();let info=await target.evaluate(()=>ContentriumUI.view.getTransportState());
  check(info.pending.method==='getState'&&!info.pending.timedOut&&info.currentState.receivedAt>0,'read-only diagnostics expose pending method and current-state freshness');
  await expire();info=await target.evaluate(()=>ContentriumUI.view.getTransportState());
  check(info.pending.timedOut&&info.pending.ageMs>=60000&&info.busy,'timeout retains blocked request diagnostics');
  check((await target.locator('#status').textContent()).includes('패널을 닫고 Window > Extensions'),'lost-callback recovery route is visible');
  const before=await target.evaluate(()=>__fixtureCalls.length);await target.locator('#refresh').click();await target.clock.fastForward(2000);
  check(await target.evaluate(()=>__fixtureCalls.length)===before,'Refresh does not forget the queue or submit more host calls while waiting');
  await release();await target.waitForFunction(()=>document.querySelector('#status').textContent==='AE 연결이 복구되었습니다.');
  check(true,'confirmed late completion plus fresh getState clears the stale timeout status');
  info=await target.evaluate(()=>ContentriumUI.view.getTransportState());check(!info.busy&&!info.waitingLate&&info.currentState.revision===2,'fresh UI state and idle transport are independently visible');
  check(await target.evaluate(()=>{const s=ContentriumUI.view.getTransportState();s.currentState.revision=999;return ContentriumUI.view.getTransportState().currentState.revision===2;}),'diagnostic snapshot cannot mutate current state');
  check(await target.evaluate(()=>!__fixtureCalls.some(c=>c.method==='setControl'||c.method==='applyPreset')),'recovery never retries or fabricates a mutation');
  await hold();await expire();const field=target.getByRole('textbox',{name:'Distance',exact:true});await field.fill('not-a-number');await field.press('Tab');
  const newError=await target.locator('#status').textContent();check(!newError.includes('패널을 닫고')&&newError.length>0,'new user validation error supersedes the timeout notice');
  await release();check(await target.locator('#status').textContent()===newError,'late completion and fresh read preserve a newer unrelated error');
  await hold();await expire();await target.reload();await target.waitForFunction(()=>ContentriumUI.view&&ContentriumUI.view.getState().hostState);
  check(await target.evaluate(()=>!ContentriumUI.view.getTransportState().waitingLate&&!__fixtureCalls.some(c=>c.method==='setControl'||c.method==='applyPreset')),'explicit document reload restores reads without mutation replay');
  if(errors.length)throw Error(errors.join('; '));
  return{ok:true,scope:'standalone rendered panel; simulated CEP callbacks and virtual clock; no native AE',checkCount:checks.length,checks,pageErrors:errors,diagnostics:await target.evaluate(()=>ContentriumUI.view.getTransportState())};
 }finally{await context.close();}
}
