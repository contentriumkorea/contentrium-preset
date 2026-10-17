async page=>{
 const ctx=await page.context().browser().newContext({viewport:{width:1100,height:800}}),p=await ctx.newPage(),checks=[],errors=[];
 function check(ok,name){if(!ok)throw Error(name);checks.push(name);}
 try{
  await p.addInitScript(()=>{
   localStorage.setItem('contentrium-preset.ui.v1',JSON.stringify({tabMode:'browse'}));localStorage.setItem('contentrium-preset.audio-volume','0');
   const data=new ArrayBuffer(44+16000),v=new DataView(data),tag=(at,s)=>[...s].forEach((c,i)=>v.setUint8(at+i,c.charCodeAt(0)));
   tag(0,'RIFF');v.setUint32(4,16036,true);tag(8,'WAVE');tag(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);tag(36,'data');v.setUint32(40,16000,true);
   window.__audioURL=URL.createObjectURL(new Blob([data],{type:'audio/wav'}));window.__calls=[];
   window.__items=Array.from({length:105},(_,i)=>({id:'item-'+i,name:'Item '+i,folderId:'owned',kind:'image',path:'C:/fixture/item-'+i+'.png',preview:'assets/preview-logo.png'}));
   __items[0]={id:'item-0',name:'Audio zero',kind:'audio',path:'C:/fixture/audio.wav',preview:__audioURL};
   __items[99]={id:'item-99',name:'Sequence 99',kind:'image-sequence',path:'C:/fixture/frame.png',frameCount:12};
   window.__adobe_cep__={getSystemPath:()=>'/isolated-paging',evalScript:(s,cb)=>{const m=/\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(s),method=JSON.parse(m[1]),payload=JSON.parse(JSON.parse(m[2]));__calls.push({method,payload});let result={};
    if(method==='hostStatus')result={methods:['getState','getLibrary','importLibraryItem','replaceLibraryItem']};
    if(method==='getState')result={context:{projectKey:'fixture.aep',projectToken:'private',compositionId:1,layerIds:[]},numSelectedLayers:0,applied:[],controls:[],revision:1};
    if(method==='getLibrary')result={items:__items,folders:[{id:'owned',path:'C:/fixture'}],capabilities:{audioTransforms:true,imageSequence:true}};
    cb(JSON.stringify({ok:true,result}));}};
  });
  p.on('pageerror',e=>errors.push(e.message));await p.goto(new URL('/',page.url()).href);await p.waitForFunction(()=>window.ContentriumUI?.view.getState().entries===148);
  check(await p.locator('#library-view .library-item').count()===0,'hidden Library mounts no item or media rows');
  await p.locator('#library-open').click();await p.waitForSelector('#library-view .library-item');
  check(await p.locator('#library-view .library-item').count()===50,'Library page is limited to 50 rows');
  const audio=p.locator('.library-item[data-item-id="item-0"]');await audio.getByRole('button',{name:'파형·피치 미리듣기'}).click();await p.waitForFunction(()=>ContentriumUI.view.getSelectedAudioPlayer('item-0')?.getState().ready);
  await audio.getByRole('spinbutton',{name:'미리듣기 피치'}).fill('7');await audio.getByRole('spinbutton',{name:'미리듣기 피치'}).press('Tab');await audio.getByRole('checkbox').check();
  await p.getByRole('button',{name:'라이브러리 다음 페이지',exact:true}).click();
  check(await p.locator('#library-view audio').count()===0&&!await p.evaluate(()=>ContentriumUI.view.getSelectedAudioPlayer('item-0')),'paging releases the old audio player');
  const fps=p.getByLabel('Sequence 99 프레임레이트');await fps.fill('24');await fps.press('Tab');
  await p.getByRole('button',{name:'라이브러리 마지막 페이지',exact:true}).click();
  check(await p.locator('#library-view .library-item').count()===5&&await p.locator('.library-item[data-item-id="item-104"]').count()===1,'last page exposes the final logical record');
  await p.getByRole('button',{name:'라이브러리 이전 페이지',exact:true}).click();check(await fps.inputValue()==='24','sequence FPS survives paging');
  await p.getByRole('button',{name:'Browse',exact:true}).click();check(await p.locator('#library-view .library-item').count()===0,'hiding management releases all rows');
  await p.locator('.preset-card[data-entry-id="library:item-99"] .preset-name').click();await p.getByRole('button',{name:'상세 설정',exact:true}).click();
  check(await p.evaluate(()=>document.activeElement?.dataset.itemId==='item-99'),'reveal locates an item on its logical page');check(await fps.inputValue()==='24','sequence FPS survives tab switches and reveal');
  await p.getByRole('button',{name:'라이브러리 첫 페이지',exact:true}).click();check(await audio.getByRole('spinbutton',{name:'미리듣기 피치'}).inputValue()==='7'&&await audio.getByRole('checkbox').isChecked(),'audio pitch and reverse survive remount');
  check(await p.evaluate(()=>!ContentriumUI.view.getSelectedAudioPlayer('item-0').getState().playing),'remount does not resume sound automatically');
  const rendered=await p.evaluate(async()=>{const player=ContentriumUI.view.getSelectedAudioPlayer('item-0');await player.prepareRender();const audio=await player.renderWav();return{pitch:audio.pitchShift,reverse:audio.reverse,frames:audio.frames,sampleRate:audio.sampleRate,playing:player.getState().playing};});
  check(rendered.pitch===7&&rendered.reverse&&rendered.frames===Math.ceil(rendered.sampleRate/Math.pow(2,7/12))&&!rendered.playing,'remounted audio silently renders the retained transforms for import');
  check(errors.length===0,'no browser exceptions: '+errors.join('; '));return{ok:true,checks,count:checks.length,scope:'real DOM and generated silent WAV, simulated host'};
 }finally{await ctx.close();}
}
