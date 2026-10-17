async (page,options)=>{
 const context=await page.context().browser().newContext({viewport:{width:1100,height:850}}),target=await context.newPage(),checks=[];
 const check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
 try{
  await target.route('https://preview-audio.test/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await target.route('https://preview-audio.test/owned.wav',route=>route.fulfill({contentType:'audio/wav',path:options.wavPath}));
  await target.goto('https://preview-audio.test/');await target.addScriptTag({path:options.modulePath});
  const decoded=await target.evaluate(async()=>{const bytes=await (await fetch('/owned.wav')).arrayBuffer(),context=new AudioContext();try{const b=await context.decodeAudioData(bytes);let peak=0,energy=0;const a=b.getChannelData(0);for(let i=0;i<a.length;i++){peak=Math.max(peak,Math.abs(a[i]));energy+=a[i]*a[i];}return{duration:b.duration,channels:b.numberOfChannels,peak,rms:Math.sqrt(energy/a.length)};}finally{await context.close();}});
  check(decoded.channels===2&&decoded.duration>0&&decoded.peak>0&&decoded.rms>0,'actual prepared private WAV decodes with nonzero stereo waveform');
  await target.evaluate(duration=>{
   window.__prepared=0;window.__saved=null;window.__closed=0;
   window.__auditionListeners=new Map();
   for(const owner of [window,document]){
    const add=owner.addEventListener.bind(owner),remove=owner.removeEventListener.bind(owner);
    owner.addEventListener=(name,handler,...rest)=>{if(name==='blur'||name==='visibilitychange')__auditionListeners.set(handler,{owner,name});return add(name,handler,...rest);};
    owner.removeEventListener=(name,handler,...rest)=>{if(name==='blur'||name==='visibilitychange')__auditionListeners.delete(handler);return remove(name,handler,...rest);};
   }
   const preparer={videoInfo:async()=>({duration}),readRecipe:async()=>null,listSources:async()=>['explicit.wav'],saveRecipe:async(v,r)=>{window.__saved=ContentriumPreviewAudioPreparer.normalizeRecipe(r,duration,'a'.repeat(64));},resolve:async()=>{window.__prepared++;return{status:'ready',url:'/owned.wav',duration};}};
   window.__dialog=ContentriumPreviewAudioPreparer.openRecipeDialog({id:'owned'},{preparer,onClose:()=>window.__closed++});
  },decoded.duration);
  await target.getByRole('button',{name:'저장하고 준비',exact:true}).waitFor();await target.waitForFunction(()=>!document.querySelector('.preview-audio-settings-dialog button:nth-last-child(2)').disabled);
  check(await target.getByLabel('소스 WAV',{exact:true}).inputValue()==='','dialog requires an explicit source choice');
  await target.getByLabel('소스 WAV',{exact:true}).selectOption('explicit.wav');await target.getByLabel('영상 시작(초)',{exact:true}).fill('-1');await target.getByRole('button',{name:'저장하고 준비',exact:true}).click();await target.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('범위'));
  check(await target.evaluate(()=>__prepared===0),'invalid mapping does not dispatch preparation');
  await target.getByLabel('영상 시작(초)',{exact:true}).fill('0');await target.getByRole('button',{name:'저장하고 준비',exact:true}).click();await target.waitForFunction(()=>document.querySelector('audio')?.readyState>=1);
  check(await target.evaluate(()=>__saved.tracks[0].file==='explicit.wav'&&__prepared===1),'explicit mapping reaches preparation exactly once');
  check(await target.locator('[role=status]').innerText().then(t=>t.includes('준비 완료')),'dialog reports actual preparation completion');
  check(Math.abs(await target.locator('audio').evaluate(a=>a.duration)-decoded.duration)<.002,'settings player reads the actual generated WAV duration');
  await target.evaluate(async()=>{const player=document.querySelector('audio');player.currentTime=.1;await player.play();});
  check(await target.locator('audio').evaluate(a=>!a.paused),'explicit audition actually plays before lifecycle checks');
  await target.evaluate(()=>window.dispatchEvent(new Event('blur')));
  check(await target.locator('audio').evaluate(a=>a.paused),'window blur pauses explicit recipe audition');
  await target.evaluate(()=>window.dispatchEvent(new Event('focus')));
  check(await target.locator('audio').evaluate(a=>a.paused),'focus does not automatically resume recipe audition');
  await target.evaluate(async()=>{const player=document.querySelector('audio');await player.play();Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  check(await target.locator('audio').evaluate(a=>a.paused),'hidden document pauses explicit recipe audition');
  await target.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  check(await target.locator('audio').evaluate(a=>a.paused),'visible document does not automatically resume recipe audition');
  await target.evaluate(()=>window.__heldAudio=document.querySelector('audio'));await target.getByRole('button',{name:'닫기',exact:true}).click();
  await target.locator('.preview-audio-settings-dialog').waitFor({state:'detached'});
  check(await target.evaluate(()=>__closed===1&&__heldAudio.paused&&!__heldAudio.hasAttribute('src')&&!document.querySelector('dialog')),'closing settings releases its media and dialog');
  check(await target.evaluate(()=>__auditionListeners.size===0),'closing settings disposes both audition lifecycle listeners');
  return{ok:true,checkCount:checks.length,checks,decoded,scope:'isolated real browser with actual prepared private WAV; UI filesystem bridge simulated; no CEP or AE operation'};
 }finally{await context.close();}
}
