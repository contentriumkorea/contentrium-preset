async page=>{
 if(!/^http:\/\/127\.0\.0\.1:/.test(page.url()))throw Error('Isolated browser required');
 const context=await page.context().browser().newContext({viewport:{width:1100,height:800}}),p=await context.newPage(),checks=[],errors=[];
 function check(v,label){if(!v)throw Error(label);checks.push(label);}
 try{
  await p.addInitScript(()=>{
   localStorage.setItem('contentrium-preset.ui.v1',JSON.stringify({tabMode:'auto'}));
   window.__historyCalls=[];window.__rejectWrite=false;window.__changeContext=false;window.__holdHistory=false;
   window.__historyState={instanceId:'own',revision:'1',projectRevision:1,context:{projectKey:'own.aep',projectToken:'own-project',compositionId:1,layerIds:[10]},numSelectedLayers:1,hasRootNode:true,applied:[],controls:[{id:'opacity',name:'Opacity',type:'slider',value:20,min:0,max:100,group:'Owned'},{id:'text',name:'Text',type:'text',value:'alpha',group:'Owned'}]};
   window.__adobe_cep__={getSystemPath:()=>'/isolated-history',evalScript:(script,cb)=>{
    const match=/\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(script);if(!match)throw Error('Script mismatch');const method=JSON.parse(match[1]),payload=JSON.parse(JSON.parse(match[2]));__historyCalls.push({method,payload});const answer=result=>cb(JSON.stringify({ok:true,result}));
    if(method==='hostStatus')return answer({methods:['getState','setControl','endUndoGroup','undo','redo']});
    if(method==='getState')return answer(__historyState);
    if(method==='setControl')return setTimeout(()=>{if(__rejectWrite)return cb(JSON.stringify({ok:false,error:{message:'Write rejected',code:'READONLY'}}));const c=__historyState.controls.find(x=>x.id===payload.id);window.__lastWrite={id:c.id,before:c.value,after:payload.value};c.value=payload.value;__historyState.projectRevision++;__historyState.revision=String(__historyState.projectRevision);if(__changeContext)__historyState.context={...__historyState.context,projectToken:'other-project'};answer({changedControls:1});},80);
    if(method==='undo'||method==='redo'){if(!payload.context||payload.context.projectToken!==__historyState.context.projectToken||payload.expectedRevision!==__historyState.projectRevision||!/^history-/.test(payload.requestId||''))return cb(JSON.stringify({ok:false,error:{message:'History capture missing',code:'BAD_CAPTURE'}}));const complete=()=>{if(window.__lastWrite)__historyState.controls.find(x=>x.id===__lastWrite.id).value=method==='undo'?__lastWrite.before:__lastWrite.after;const before=__historyState.projectRevision++;__historyState.revision=String(__historyState.projectRevision);answer({commandIssued:true,beforeRevision:before});};if(__holdHistory)window.__finishHistory=complete;else complete();return;}
    answer({ended:true});
   }};
  });
  p.on('pageerror',e=>errors.push(e.message));await p.goto(new URL('/',page.url()).href);await p.locator('#edit-tab').click();
  const opacity=p.locator('input[aria-label="Opacity"]');await opacity.fill('30');await opacity.press('Control+z');
  await p.waitForFunction(()=>__historyCalls.some(x=>x.method==='undo'),null,{timeout:1500});
  await p.waitForFunction(()=>document.querySelector('input[aria-label="Opacity"]').value==='20');
  check(await p.evaluate(()=>{const calls=__historyCalls.filter(x=>x.method==='setControl'||x.method==='undo');return calls.length===2&&calls[0].method==='setControl'&&calls[0].payload.value===30&&calls[1].payload.expectedRevision===2;}),'property input commits before guarded native Undo');
  await p.locator('#edit-tab').focus();await p.keyboard.press('Control+Shift+z');await p.waitForFunction(()=>document.querySelector('input[aria-label="Opacity"]').value==='30');check(true,'Shift+Z routes Redo and refreshes the editor');
  const text=p.locator('textarea[aria-label="Text"]');await text.fill('beta');await text.press('Control+z');await p.waitForFunction(()=>__historyCalls.filter(x=>x.method==='undo').length===2&&document.querySelector('textarea[aria-label="Text"]').value==='alpha');check(true,'text property blur commits before host Undo');
  await p.locator('input[aria-label="Opacity 슬라이더"]').focus();
  await p.evaluate(()=>{const s=document.querySelector('input[aria-label="Opacity 슬라이더"]');s.value='35';s.dispatchEvent(new Event('input',{bubbles:true}));});
  await p.keyboard.press('Control+z');await p.waitForFunction(()=>__historyCalls.filter(x=>x.method==='undo').length===3&&document.querySelector('input[aria-label="Opacity"]').value==='30');
  check(await p.evaluate(()=>{const calls=__historyCalls.filter(x=>x.method==='setControl'||x.method==='endUndoGroup'||x.method==='undo');return calls.at(-2).method==='endUndoGroup'&&calls.at(-1).method==='undo';}),'buffered slider write and gesture end complete before Undo');
  const n=await p.evaluate(()=>__historyCalls.filter(x=>x.method==='undo'||x.method==='redo').length);
  await p.locator('#browse-tab').click();await p.locator('#search').fill('draft');await p.locator('#search').press('Control+z');
  await p.waitForTimeout(100);const searchCount=await p.evaluate(()=>__historyCalls.filter(x=>x.method==='undo'||x.method==='redo').length);check(searchCount===n,'search input retains local text Undo');
  await p.locator('#edit-tab').click();await p.evaluate(()=>__rejectWrite=true);await opacity.fill('40');await opacity.press('Control+z');await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('Write rejected'));
  check(await p.evaluate(()=>__historyCalls.filter(x=>x.method==='undo'||x.method==='redo').length)===n,'failed property commit never consumes unrelated history');
  await p.evaluate(()=>{__rejectWrite=false;__changeContext=true;});await opacity.fill('45');await opacity.press('Control+z');await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('선택'));
  check(await p.evaluate(()=>__historyCalls.filter(x=>x.method==='undo'||x.method==='redo').length)===n,'a changed project aborts the delayed history request');
  await p.evaluate(()=>{__changeContext=false;__holdHistory=true;});await p.locator('#edit-tab').focus();await p.keyboard.press('Control+z');await p.waitForFunction(()=>typeof __finishHistory==='function');await p.keyboard.press('Control+z');await p.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,repeat:true,bubbles:true})));await p.evaluate(()=>{__holdHistory=false;__finishHistory();});
  await p.waitForFunction(()=>!ContentriumUI.getTransportState().busy);check(await p.evaluate(()=>__historyCalls.filter(x=>x.method==='undo'||x.method==='redo').length)===n+1,'pending history and repeated keys do not duplicate a native operation');
  check(errors.length===0,'no browser script errors');return{ok:true,checks,scope:'real isolated browser, AE transport fixture; native acceptance separate'};
 }finally{await context.close();}
}
