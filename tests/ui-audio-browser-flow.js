async (page) => {
  if(await page.evaluate(()=>!!window.__adobe_cep__))throw Error('Host fixture must run in a fresh standalone browser, never in native CEP');
  // Isolated browser host fixture. No ExtendScript or Adobe operation executes.
  await page.addInitScript(()=>{
    window.__fixtureMissing=[];
    window.__adobe_cep__={getSystemPath:()=>'/fixture',evalScript:(script,callback)=>{
      let result={};
      if(script.includes('call("hostStatus"'))result={available:true,audioRoot:'/fixture/UserAudio',capabilities:{captureUserPreset:false}};
      else if(script.includes('call("applyPreset"')){
        window.__fixtureMissing=['bass-bend-01','transition-basic-05'];
        result={appliedLayers:1,missingAudio:__fixtureMissing,warnings:['Local sound assets unavailable: '+__fixtureMissing.join(', ')]};
      }else if(script.includes('call("getState"'))result={numSelectedLayers:1,selectedLayerName:'Fixture layer',controls:[{id:'fixture-point',name:'Point',type:'point',value:[12.5,5],min:-30,max:40,step:.01}],applied:[],audio:{missing:__fixtureMissing,root:'/fixture/UserAudio'}};
      callback(JSON.stringify({ok:true,result}));
    }};
  });
  await page.reload();
  await page.getByRole('searchbox',{name:'항목 검색'}).fill('Pan Medium & Shake');
  await page.getByRole('listitem',{name:/Pan Medium & Shake/}).click();
  await page.getByRole('button',{name:'Apply',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('status').classList.contains('warning'));
  if(!(await page.locator('#status').textContent()).includes('효과음 2개'))throw Error('Missing-audio warning hidden');
  await page.getByRole('button',{name:'Edit',exact:true}).click();
  await page.locator('#audio-notice').waitFor({state:'visible'});
  const components=await page.locator('#editor-controls input[type="number"]').evaluateAll(inputs=>inputs.map(input=>({min:input.min,max:input.max,step:input.step})));
  if(components.length!==2||components.some(input=>input.min!=='-30'||input.max!=='40'||input.step!=='0.01'))throw Error('Vector bounds or precision lost');
  if(!(await page.locator('#audio-notice-text').textContent()).includes('효과음 2개가 연결되지'))throw Error('Missing instance audio not identified');
  await page.getByRole('button',{name:'등록 안내',exact:true}).click();
  if(await page.locator('#audio-folder').inputValue()!=='/fixture/UserAudio')throw Error('Wrong persistent audio directory');
  const example=JSON.parse(await page.locator('#audio-example').inputValue());
  if(example.assets['bass-bend-01']!=='bass-bend-01.wav'||example.assets['transition-basic-05']!=='transition-basic-05.wav')throw Error('Missing key registration example');
  if(!(await page.locator('#audio-dialog').textContent()).includes('프리셋을 다시 적용'))throw Error('Reapply guidance missing');
  await page.getByRole('button',{name:'닫기',exact:true}).click();
}
