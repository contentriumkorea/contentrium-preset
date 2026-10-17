async page => {
 if(!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url()))throw Error('Standalone product UI only');
 const context=await page.context().browser().newContext({viewport:{width:1150,height:800}}),target=await context.newPage(),checks=[],errors=[];
 const check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};target.on('pageerror',e=>errors.push(e.message));
 try {
  await target.addInitScript(()=>{
   localStorage.setItem('contentrium-preset.ui.v1',JSON.stringify({tabMode:'browse'}));
   window.__soundElements=[];const create=document.createElement.bind(document);document.createElement=function(name,...args){const result=create(name,...args);if(name==='audio')__soundElements.push(result);return result;};
   window.__adobe_cep__={getSystemPath:()=>'/fixture-extension',evalScript:(script,callback)=>{
    const m=/\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(script),method=m&&JSON.parse(m[1]);let result={};
    if(method==='hostStatus')result={available:true,audioRoot:'/fixture-user-audio',methods:['getState','getSettings','getLibrary'],applyOptions:{byVariant:{'236d':{containsAudio:true}}}};
    if(method==='getState')result={instanceId:'none',revision:1,numSelectedLayers:1,hasRootNode:false,controls:[],applied:[]};
    if(method==='getSettings')result={settings:{pausePreviewWhenInactive:false}};
    if(method==='getLibrary')result={items:[],folders:[]};
    callback(JSON.stringify({ok:true,result}));
   }};
  });
  await target.goto(new URL('/',page.url()).href);await target.waitForFunction(()=>ContentriumUI.view&&document.querySelectorAll('.preset-card').length===43&&ContentriumUI.view.getState().connected);
  await target.evaluate(()=>{
   const channel=Float32Array.from({length:96000},(_,i)=>Math.sin(i*440*2*Math.PI/48000)*.08);
   const url=URL.createObjectURL(new Blob([ContentriumAudio.encodeWav([channel,channel],48000)],{type:'audio/wav'}));window.__toneUrl=url;
   ContentriumPreview.setAudioResolver(async()=>({status:'ready',url}));
  });
  const card=target.locator('.preset-card[data-entry-id="236d"]');await card.locator('.preset-name').click();
  await target.waitForFunction(()=>ContentriumPreview.getAudioState().status==='ready');
  check(await target.locator('#preview-audio-controls').isVisible(),'sound controls appear for a sound-capable preset');
  check(await target.evaluate(()=>__soundElements.length===1),'one selected preview owns one audio element');
  await target.waitForFunction(()=>ContentriumPreview.getAudioState().playing);
  check(await target.evaluate(()=>Math.abs(__soundElements[0].currentTime-document.querySelector('.preset-card.selected video').currentTime)<.25),'audio follows the selected video clock');
  const muted=target.getByRole('checkbox',{name:'미리듣기 음소거',exact:true});await muted.check();
  check(await target.evaluate(()=>__soundElements[0].paused),'preview mute pauses its audio');
  await muted.uncheck();await target.waitForFunction(()=>ContentriumPreview.getAudioState().playing);
  await target.getByRole('slider',{name:'미리듣기 볼륨'}).fill('25');
  check(await target.evaluate(()=>Math.abs(__soundElements[0].volume-.25)<.001),'preview volume changes the selected audio only');
  await target.getByRole('checkbox',{name:'효과음 추가',exact:true}).uncheck();
  check(await target.evaluate(()=>__soundElements[0].paused&&ContentriumPreview.getAudioState().status==='disabled'),'insert sound off stops preview sound');
  await target.getByRole('checkbox',{name:'효과음 추가',exact:true}).check();
  await target.waitForFunction(()=>ContentriumPreview.getAudioState().playing);
  await target.getByRole('button',{name:'Tools',exact:true}).click();
  check(await target.evaluate(()=>__soundElements.every(a=>a.paused)),'leaving Browse stops its audio');
  await target.getByRole('button',{name:'Browse',exact:true}).click();
  await target.evaluate(()=>ContentriumPreview.setAudioResolver(async()=>({status:'missing',missing:['Previews/236d.wav']})));
  await target.waitForFunction(()=>document.querySelector('#preview-audio-state').dataset.state==='missing');
  check(await target.getByText('이 변형의 미리듣기 파일이 없습니다.',{exact:true}).isVisible(),'missing personal audio is shown without pretending it is ready');
  check(await target.evaluate(()=>ContentriumUI.view.getState().connected),'optional sound failure does not disconnect the host');
  check(errors.length===0,'no browser script errors');
  return{ok:true,checkCount:checks.length,checks,scope:'real browser media with own generated tone and simulated host; no native audio generation'};
 }finally{await context.close();}
}
