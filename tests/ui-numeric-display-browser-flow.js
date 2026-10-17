/* Isolated headless DOM tests; no AE, CEP relay, or shared browser. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require(process.env.CONTENTRIUM_PLAYWRIGHT_MODULE||'playwright');
async function main(){
 const root=path.resolve(__dirname,'..'),browser=await chromium.launch({headless:true,...(process.env.CONTENTRIUM_BROWSER_EXECUTABLE?{executablePath:process.env.CONTENTRIUM_BROWSER_EXECUTABLE}:{})}),checks=[],errors=[];
 try{
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<div id="root"></div><div id="applied"></div><div id="selection"></div><button id="outside">outside</button><div id="font"></div>');
  for(const file of ['ui-core.js','ui-editor.js','ui-animated-font.js'])await page.addScriptTag({path:path.join(root,file)});
  await page.evaluate(()=>{
   window.__calls=[];window.__messages=[];window.__refreshes=0;window.__ends=[];window.__deferEnd=false;
   window.__editor=ContentriumEditor.create({root:document.querySelector('#root'),applied:document.querySelector('#applied'),selection:document.querySelector('#selection'),supports:()=>false,status:m=>__messages.push(m),refresh:()=>__refreshes++,call:(method,payload)=>{__calls.push({method,payload});if(method==='setControl'&&window.__rejectNext){window.__rejectNext=false;return Promise.reject(Error('fixture rejected value'));}if(method==='endUndoGroup'&&__deferEnd)return new Promise(resolve=>__ends.push(resolve));return Promise.resolve({});}});
   window.__render=(control={})=>{__calls=[];__messages=[];window.__control={id:'speed',name:'Speed',type:'slider',value:100.00000037253,precision:2,min:0,max:1000,step:1,...control};window.__state={instanceId:'fixture',numSelectedLayers:1,projectRevision:12,context:{projectKey:'fixture',compositionId:1,layerIds:[2]},controls:[__control],applied:[]};__editor.render(__state);};
   window.__writes=()=>__calls.filter(c=>c.method==='setControl');
   window.__scrub=(x)=>{document.querySelector('.control-label').dispatchEvent(new PointerEvent('pointerdown',{button:0,clientX:0,bubbles:true}));if(x!==null)document.dispatchEvent(new PointerEvent('pointermove',{clientX:x,bubbles:true}));document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));};
   __render();
  });
  const field=page.locator('#root .value-input');
  async function check(ok,label){assert.ok(ok,label);checks.push(label);}
  await check(await field.inputValue()==='100','declared precision hides jitter');
  await field.focus();await page.locator('#outside').click();await field.focus();await field.press('Enter');await field.evaluate(e=>e.dispatchEvent(new Event('change',{bubbles:true})));
  await check(await page.evaluate(()=>__writes().length===0&&__control.value===100.00000037253),'render focus blur Enter and synthetic clean change send zero writes');
  await field.fill('123.456789');await field.press('Escape');await field.evaluate(e=>e.dispatchEvent(new Event('change',{bubbles:true})));
  await check(await page.evaluate(()=>__writes().length===0),'Escape cancels edit and later change');
  await field.fill('123.456789');await field.press('Enter');await page.waitForFunction(()=>__writes().length===1);
  await check(await page.evaluate(()=>__writes()[0].payload.value===123.456789),'typed fractional value dispatched exactly once');
  await check(await field.inputValue()==='123.46','committed draft keeps precise working value with rounded presentation');
  await field.fill('*=2');await field.press('Enter');await page.waitForFunction(()=>__writes().length===2);
  await check(await page.evaluate(()=>__writes()[1].payload.value===123.456789*2),'successive edited draft uses exact working value before refresh');
  await page.evaluate(()=>__render());await field.fill('100');await field.press('Enter');await page.waitForFunction(()=>__writes().length===1);
  await check(await page.evaluate(()=>__writes()[0].payload.value===100),'explicit integer edit is allowed');
  await page.evaluate(()=>__render());await field.fill('*=2');await field.press('Enter');await page.waitForFunction(()=>__writes().length===1);
  await check(await page.evaluate(()=>__writes()[0].payload.value===100.00000037253*2),'multiply uses raw host number');
  await page.evaluate(()=>{__render();__rejectNext=true;});await field.fill('200');await field.press('Enter');await page.waitForFunction(()=>__messages.includes('fixture rejected value'));
  await check(await field.inputValue()==='100','rejected edit reverts its local working presentation');
  await field.fill('*=2');await field.press('Enter');await page.waitForFunction(()=>__writes().length===2);
  await check(await page.evaluate(()=>__writes()[1].payload.value===100.00000037253*2),'next relative edit does not use rejected value');
  await page.evaluate(()=>__render());await field.focus();await field.press('ArrowUp');await page.waitForFunction(()=>__writes().length===1);
  await check(await page.evaluate(()=>__writes()[0].payload.relative&&__writes()[0].payload.value===1),'arrow retains relative host increment');
  await page.evaluate(()=>{__render();__scrub(null);});await page.waitForTimeout(70);
  await check(await page.evaluate(()=>__writes().length===0),'no-motion scrub sends no rounded baseline');
  await page.evaluate(()=>{__render();__deferEnd=true;__scrub(1);});await page.waitForFunction(()=>__ends.length===1);
  await page.evaluate(()=>__scrub(1));await page.waitForFunction(()=>__writes().length===2);
  await check(await page.evaluate(()=>__writes()[0].payload.value===101.00000037253&&__writes()[1].payload.value===102.00000037253&&__writes()[0].payload.undoGroupId!==__writes()[1].payload.undoGroupId),'successive pending gestures retain exact working value and independent groups');
  await page.evaluate(()=>{__ends.splice(0).forEach(r=>r({}));__deferEnd=false;});await page.waitForTimeout(70);
  await page.evaluate(()=>__render({mixed:true}));await field.fill('+=.25');await field.press('Enter');await page.waitForFunction(()=>__writes().length===1);
  await check(await page.evaluate(()=>__writes()[0].payload.relative&&__writes()[0].payload.value===.25),'mixed relative input unchanged');
  await page.evaluate(()=>__render({type:'point',value:[1.234567,2.345678]}));const point=page.locator('#root .value-input').first();await point.fill('9.876543');await point.press('Enter');await page.waitForFunction(()=>__writes().length===1);
  await check(await page.evaluate(()=>__writes()[0].payload.value[0]===9.876543&&__writes()[0].payload.value[1]===2.345678),'point edit preserves untouched exact component');
  await page.evaluate(()=>__render({precision:undefined}));await check(await field.inputValue()==='100.00000037253','missing precision retains raw display');
  await page.evaluate(()=>__render({precision:-1}));await check(await field.isDisabled()&&await page.locator('#root input[type=range]').isDisabled(),'invalid precision disables affected fields');
  await page.evaluate(()=>__render({precision:0,value:-1.6}));await check(await field.inputValue()==='-2','precision zero and negative values');
  await page.evaluate(()=>{__render({type:'angle',value:10.123,precision:0});const dial=document.querySelector('.angle-dial');dial.style.width='40px';dial.style.height='40px';const b=dial.getBoundingClientRect(),x=b.left+b.width/2,y=b.top+b.height/2;dial.dispatchEvent(new PointerEvent('pointerdown',{button:0,clientX:x+10,clientY:y,bubbles:true}));document.dispatchEvent(new PointerEvent('pointermove',{clientX:x,clientY:y+10,bubbles:true}));document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));});await page.waitForFunction(()=>__writes().length===1);
  await check(await page.evaluate(()=>__writes()[0].payload.value===100.12),'angle dial starts from raw value while retaining existing hundredth snapping');
  await page.evaluate(()=>__render({type:'time',value:1.234567,precision:-1,frameDuration:1/30}));await check(await field.inputValue()===await page.evaluate(()=>ContentriumCore.formatTime(1.234567,{frameDuration:1/30})),'time formatting remains separate from numeric precision');
  await page.evaluate(()=>__render());await field.fill('55.12345');await page.evaluate(()=>__editor.updateFocusedMetadata({...__state,projectRevision:13}));await check(await field.inputValue()==='55.12345','focused draft survives metadata polling');await field.press('Escape');
  await page.evaluate(()=>{
   window.__fontContext=null;window.__font=ContentriumAnimatedFont.create({container:document.querySelector('#font'),getContext:()=>__fontContext,isBusy:()=>false,call:(method,payload)=>{__calls.push({method,payload});return Promise.resolve({});}});
   __font.select({id:'private',digest:'exact',available:true,coverage:{codePoints:[65,66],maxScalars:2}});__font.updateState({connected:true,busy:false});
  });
  const fontInput=page.locator('#font input'),add=page.locator('#font button');await fontInput.fill('AB');await check(await add.isDisabled(),'connected before first getState keeps Add disabled');await fontInput.press('Enter');
  await check(await page.evaluate(()=>!__calls.some(c=>c.method==='addAnimatedFont')),'early Enter never dispatches');
  await page.evaluate(()=>{__fontContext={context:{projectKey:'actual-state',compositionId:1,layerIds:[]},expectedRevision:0};__font.updateState({connected:true,busy:false});});await check(await add.isEnabled(),'real context with revision zero enables Add');
  await fontInput.press('Enter');await page.waitForFunction(()=>__calls.some(c=>c.method==='addAnimatedFont'));
  await check(await page.evaluate(()=>__calls.filter(c=>c.method==='addAnimatedFont').length===1),'ready Enter dispatches once');
  assert.deepEqual(errors,[]);const result={ok:true,checks,pageErrors:errors,scope:'isolated DOM; no native host'};
  if(process.env.CONTENTRIUM_NUMERIC_EVIDENCE)fs.writeFileSync(process.env.CONTENTRIUM_NUMERIC_EVIDENCE,JSON.stringify(result,null,2),{flag:'wx'});
  console.log(JSON.stringify(result));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

