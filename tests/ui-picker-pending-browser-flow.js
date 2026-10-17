async page=>{
 const context=await page.context().browser().newContext(),origin=new URL(page.url()).origin,checks=[],errors=[];
 function check(v,n){if(!v)throw Error(n);checks.push(n);}
 try{
  await context.addInitScript(()=>localStorage.setItem('contentrium-preset.ui.v1',JSON.stringify({tabMode:'auto'})));
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin+'/index.html');
  await p.waitForFunction(()=>window.ContentriumEditor&&window.ContentriumCore);
  await p.evaluate(()=>{
   document.querySelectorAll('dialog[open]').forEach(d=>d.close());
   const root=document.createElement('div');root.id='picker-contract';root.style.cssText='position:fixed;inset:0;z-index:2000;background:#333';document.body.appendChild(root);
   const controls=document.createElement('div'),selection=document.createElement('div'),applied=document.createElement('div');root.append(selection,applied,controls);
   window.__pickerCalls=[];window.__statuses=[];
   window.__pickerQueue=ContentriumCore.serialTransport((method,payload,done)=>{__pickerCalls.push({method,payload});if(method==='pickColor')window.__resolvePicker=done;else done(null,{});},{timeoutMs:12});
   window.__pickerState={instanceId:'picker',projectRevision:8,numSelectedLayers:1,context:{projectKey:'owned',compositionId:11,layerIds:[22]},colorPicker:{available:true},applied:[],controls:[{id:'rgba',name:'RGBA color',type:'color',value:[.2,.4,.6,.35],enabled:true}]};
   window.__pickerEditor=ContentriumEditor.create({root:controls,selection,applied,supports:()=>true,status:(message,kind)=>__statuses.push({message,kind}),refresh(){},call:__pickerQueue});
   __pickerEditor.render(__pickerState);
  });
  const picker=p.getByRole('button',{name:'AE 색상 선택기',exact:true});
  await picker.click();await p.waitForFunction(()=>__pickerQueue.isWaitingLate());
  check(await p.evaluate(()=>__pickerCalls.length===1&&__pickerCalls[0].method==='pickColor'),'long chooser does not send an early color write');
  await p.evaluate(()=>__resolvePicker(null,{cancelled:false,value:[.8,.4,.2,.35]}));
  await p.waitForTimeout(30);
  let calls=await p.evaluate(()=>__pickerCalls);
  check(calls.length===2&&calls[1].method==='setControl','late accepted picker result commits exactly once');
  check(calls[1].payload.expectedRevision===8&&calls[1].payload.context.compositionId===11&&calls[1].payload.value[3]===.35,'late commit retains original revision, target and alpha');
  await picker.click();await p.waitForFunction(()=>__pickerQueue.isWaitingLate());
  await p.evaluate(()=>__resolvePicker(null,{cancelled:true,value:null}));await p.waitForTimeout(30);
  check(await p.evaluate(()=>__pickerCalls.filter(c=>c.method==='setControl').length)===1,'late cancel makes no project write');
  await picker.click();await p.waitForFunction(()=>__pickerQueue.isWaitingLate());
  await p.evaluate(()=>__pickerEditor.render(__pickerState));
  check(await picker.isDisabled(),'a picker already pending blocks a second launch');
  await p.evaluate(()=>{document.querySelector('#picker-contract button').click();__resolvePicker(Object.assign(Error('Picker failed'),{code:'PICKER_FAILED'}));});await p.waitForTimeout(30);
  check(await p.evaluate(()=>__pickerCalls.filter(c=>c.method==='pickColor').length)===3,'duplicate click does not enqueue another native modal');
  check(await picker.isEnabled(),'native error re-enables the picker');
  await picker.click();await p.waitForFunction(()=>__pickerQueue.isWaitingLate());
  await p.evaluate(()=>{__pickerEditor.updateFocusedMetadata({...__pickerState,projectRevision:99,context:{...__pickerState.context,compositionId:19}});__resolvePicker(null,{cancelled:false,value:[0,0,0,.35]});});await p.waitForTimeout(30);
  calls=await p.evaluate(()=>__pickerCalls.filter(c=>c.method==='setControl'));
  check(calls.length===2&&calls[1].payload.expectedRevision===8&&calls[1].payload.context.compositionId===11,'selection changes never replace the captured late-commit guard');
  check(!errors.length,'no uncaught picker errors: '+errors.join('; '));return{ok:true,scope:'isolated editor with real serialized transport and accelerated timeout',checks,errors};
 }finally{await context.close();}
}
