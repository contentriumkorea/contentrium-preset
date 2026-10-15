async (page) => {
  if(await page.evaluate(()=>!!window.__adobe_cep__))throw Error('Host fixture must run in a fresh standalone browser, never in native CEP');
  // Run using playwright-cli run-code. This is an isolated browser contract test;
  // the host stub always fails and never opens or controls After Effects.
  await page.reload();
  await page.getByRole('searchbox',{name:'항목 검색'}).fill('Ease Fade Together 3');
  await page.getByRole('listitem',{name:/Ease Fade Together 3/}).click();
  if(await page.locator('.inline-variants .variant-row').count()!==2)throw Error('Inline variants missing');
  await page.getByRole('button',{name:'From End',exact:true}).click();
  if(await page.locator('#variant-summary').textContent()!=='From End')throw Error('Footer variant mismatch');
  await page.getByRole('button',{name:'View all at once'}).click();
  if(await page.locator('.preset-card').count()!==2)throw Error('All-variant cards missing');
  await page.getByRole('listitem',{name:'Ease Fade Together 3 · From Start',exact:true}).click();
  const state=await page.evaluate(()=>ContentriumUI.view.getState());
  if(state.selectedVariant!=='123'||state.allVariantsId!=='124')throw Error('Selection mismatch');
  if(await page.locator('.preset-card.selected').count()!==1)throw Error('Multiple selections');
  await page.evaluate(()=>{
    window.__testCalls=[];
    window.__adobe_cep__={getSystemPath:()=>'/test-fixture',evalScript:(script,callback)=>{
      __testCalls.push(script);callback(JSON.stringify({ok:false,error:{message:'TEST_ONLY_AE_UNAVAILABLE'}}));
    }};
  });
  await page.getByRole('button',{name:'Out',exact:true}).click();
  const calls=await page.evaluate(()=>__testCalls);
  if(calls.length!==1||!calls[0].includes(JSON.stringify(JSON.stringify({variantId:'123',direction:'out'}))))throw Error('Apply payload mismatch');
  if(!(await page.locator('#status').textContent()).includes('TEST_ONLY_AE_UNAVAILABLE'))throw Error('Host error hidden');
  await page.getByRole('button',{name:'‹ Back',exact:true}).click();
  await page.waitForTimeout(450);
  await page.evaluate(()=>{__testCalls=[];});
  await page.getByRole('listitem',{name:/Ease Fade Together 3/}).dblclick();
  const twice=await page.evaluate(()=>__testCalls);
  if(twice.length!==1||!twice[0].includes(JSON.stringify(JSON.stringify({variantId:'123',direction:'both'}))))throw Error('Double-click apply mismatch');
}
