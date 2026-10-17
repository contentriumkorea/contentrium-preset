async page => {
  if(!await page.evaluate(()=>Array.isArray(window.__fixtureCalls)))throw Error('Requires isolated standalone fixture');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.evaluate(()=>{
    const root=document.createElement('div'),applied=document.createElement('div'),selection=document.createElement('div');
    root.id='gesture-test-root';document.body.append(root,applied,selection);
    const fixture=window.__gestureHarness={root,calls:[],ends:[],refreshes:0};
    fixture.ui=ContentriumEditor.create({root,applied,selection,supports:()=>false,status(){},refresh:()=>fixture.refreshes++,call(method,payload){fixture.calls.push({method,payload});if(method==='endUndoGroup')return new Promise(resolve=>fixture.ends.push(resolve));return Promise.resolve({});}});
    fixture.ui.render({instanceId:'isolated',numSelectedLayers:1,controls:[{id:'gesture-value',name:'Gesture fixture',type:'slider',value:10,min:0,max:100,step:1,group:'Gesture'}],applied:[]});
    fixture.down=()=>root.querySelector('.control-label').dispatchEvent(new PointerEvent('pointerdown',{button:0,clientX:0,bubbles:true}));
    fixture.move=x=>document.dispatchEvent(new PointerEvent('pointermove',{clientX:x,bubbles:true}));
    fixture.up=()=>document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));
    fixture.down();fixture.move(10);fixture.up();
  });
  await page.waitForFunction(()=>__gestureHarness.ends.length===1);
  await page.evaluate(()=>{__gestureHarness.down();__gestureHarness.move(5);});
  await page.waitForFunction(()=>__gestureHarness.calls.filter(c=>c.method==='setControl').length===2);
  const writes=await page.evaluate(()=>__gestureHarness.calls.filter(c=>c.method==='setControl'));
  if(writes[0].payload.undoGroupId===writes[1].payload.undoGroupId)throw Error('Ending gesture identity reused');
  if(writes[1].payload.value!==25)throw Error('New drag did not start from the displayed value');
  await page.evaluate(()=>__gestureHarness.ends.shift()({}));
  await page.waitForTimeout(20);
  if(!await page.evaluate(()=>__gestureHarness.root.dataset.gestureActive==='true'&&__gestureHarness.refreshes===0))throw Error('Older callback cleared active gesture guard');
  await page.evaluate(()=>__gestureHarness.up());
  await page.waitForFunction(()=>__gestureHarness.ends.length===1);
  await page.evaluate(()=>__gestureHarness.ends.shift()({}));
  await page.waitForFunction(()=>!__gestureHarness.root.dataset.gestureActive&&__gestureHarness.refreshes===1);
  await page.evaluate(()=>{__gestureHarness.root.remove();});
  if(errors.length)throw Error(errors.join('; '));
  return{ok:true,scope:'isolated rendered editor; deferred host fixture; no AE',checks:['new drag ID while old end is pending','new drag starts at displayed value','old callback preserves new drag DOM guard','last gesture releases guard and refreshes once'],pageErrors:errors};
}
