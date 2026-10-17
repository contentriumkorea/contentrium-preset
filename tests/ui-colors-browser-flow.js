async page => {
  if(!await page.evaluate(()=>Array.isArray(window.__fixtureCalls)))throw Error('Requires isolated browser fixture');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.reload();await page.waitForFunction(()=>window.ContentriumEditor&&Array.isArray(window.__fixtureCalls));
  await page.evaluate(()=>{
    const root=document.createElement('div'),applied=document.createElement('div'),selection=document.createElement('div');
    root.id='colors-test-root';document.body.append(root,applied,selection);
    const f=window.__colorHarness={root,applied,selection,calls:[],status:[]};
    f.ui=ContentriumEditor.create({root,applied,selection,supports:()=>true,status:(m,k)=>f.status.push({m,k}),refresh(){},call:async(method,payload)=>{f.calls.push({method,payload});return{};}});
    f.ui.render({instanceId:'selection',projectRevision:41,context:{projectKey:'fixture',compositionId:7,layerIds:[3,4]},numSelectedLayers:2,controls:[
      {id:'generic-colors',name:'Selected color',type:'color',semantic:'selected-layer-color',enabled:true,value:[.1,.2,.3,1],mixed:true,groupPath:['Layer Selection','Colors'],actions:['copy','paste']},
      {id:'readonly-color',name:'Read only color',type:'color',semantic:'selected-layer-color',enabled:false,value:[1,0,0],readOnlyReason:'이 색상은 읽기 전용입니다.',groupPath:['Layer Selection','Colors'],actions:[{id:'copy',enabled:true},{id:'paste',enabled:false}]}
    ]});
  });
  const root=page.locator('#colors-test-root'),readonly=root.getByLabel('Read only color',{exact:true});
  if(!await readonly.isDisabled())throw Error('Read-only color is enabled');
  if(!await root.getByText('이 색상은 읽기 전용입니다.',{exact:true}).isVisible())throw Error('Read-only reason is hidden');
  const color=root.getByLabel('Selected color',{exact:true});await color.fill('#336699');
  await page.waitForFunction(()=>__colorHarness.calls.length===1);
  const changed=await page.evaluate(()=>__colorHarness.calls[0]);
  if(changed.method!=='setControl'||changed.payload.expectedRevision!==41||changed.payload.context.compositionId!==7||JSON.stringify(changed.payload.value)!=='[0.2,0.4,0.6,1]')throw Error('Color mutation lost revision, context or alpha');
  const row=root.locator('[data-control-id="generic-colors"]');await row.getByRole('button',{name:'복사',exact:true}).click();await row.getByRole('button',{name:'붙여넣기',exact:true}).click();
  await page.waitForFunction(()=>__colorHarness.calls.length===3);
  const actions=await page.evaluate(()=>__colorHarness.calls.slice(1));
  if(actions.some(c=>c.method!=='propertyAction'||c.payload.expectedRevision!==41)||actions.map(c=>c.payload.action).join(',')!=='copy,paste')throw Error('Color actions lost expected revision');
  if(await row.getByRole('button',{name:'초기화',exact:true}).count())throw Error('Unexpected Reset for selection colors');
  if(!await root.locator('[data-control-id="readonly-color"]').getByRole('button',{name:'붙여넣기',exact:true}).isDisabled())throw Error('Read-only paste enabled');
  await readonly.dispatchEvent('change');await page.waitForTimeout(20);
  if(await page.evaluate(()=>__colorHarness.calls.length)!==3)throw Error('Disabled color dispatched mutation');
  await page.evaluate(()=>{__colorHarness.root.remove();__colorHarness.applied.remove();__colorHarness.selection.remove();});
  if(errors.length)throw Error(errors.join('; '));
  return{ok:true,scope:'isolated rendered editor contract, no native AE',checkCount:7,checks:['read-only-color-disabled','read-only-reason-visible','color-value-alpha-context-revision','copy-paste-context-revision','no-unadvertised-reset','read-only-paste-disabled','disabled-change-guard'],pageErrors:errors};
}
