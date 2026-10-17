async page=>{
 const assert=require('node:assert/strict'),fs=require('node:fs');const pack=JSON.parse(fs.readFileSync('contentrium-preset/library/fonts/contentrium-grid.cfont.json','utf8'));await page.addInitScript(pack=>{localStorage.clear();localStorage.setItem('contentrium-preset.settings.v1',JSON.stringify({welcomeSeen:true}));window.__fontCalls=[];window.__fontHost={available:true,methods:['getState','getSettings','getLibrary','addAnimatedFont'],animatedFonts:{available:[{id:pack.id,digest:pack.digest,name:pack.name,available:true,coverage:{codePoints:pack.glyphs.map(g=>g.codePoint),maxScalars:pack.limits.maxScalars}}],capabilities:{add:true},directory:'C:/Own/AnimatedFonts',issues:[]}};window.__adobe_cep__={getSystemPath:()=>'/isolated-public-font',evalScript:(script,cb)=>{const m=/\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(script);if(!m){cb('{"ok":false}');return;}const method=JSON.parse(m[1]),payload=JSON.parse(JSON.parse(m[2]));__fontCalls.push({method,payload});let result={};if(method==='hostStatus')result=__fontHost;if(method==='getState')result={projectRevision:11,context:{projectKey:'fixture',projectToken:'p',compositionId:1,layerIds:[]},controls:[],applied:[],numSelectedLayers:0};if(method==='getSettings')result={settings:{welcomeSeen:true}};if(method==='getLibrary')result={items:[],folders:[]};cb(JSON.stringify({ok:true,result}));}};},pack);
 await page.reload();const card=page.locator('.preset-card[data-entry-id="font:contentrium-grid"]');await card.waitFor({timeout:4000});if(await page.locator('dialog[data-welcome]').count())await page.getByRole('button',{name:'시작하기',exact:true}).click();await card.locator('.preset-name').click();const input=page.getByRole('textbox',{name:'애니메이션 글자'}),add=page.getByRole('button',{name:'Add',exact:true});await input.fill('Contentrium 2026');assert.equal(await add.isEnabled(),true);await add.click();await page.waitForFunction(()=>__fontCalls.some(c=>c.method==='addAnimatedFont'));const call=await page.evaluate(()=>__fontCalls.find(c=>c.method==='addAnimatedFont'));assert.equal(call.payload.text,'Contentrium 2026');assert.equal(call.payload.fontHash,pack.digest);assert.equal(call.payload.expectedRevision,11);await input.fill('한글');assert.equal(await add.isDisabled(),true);assert.equal(await page.locator('#apply-actions button').count(),0);assert.equal(await card.locator('.preview-message').count(),1,'missing font preview must not pretend a logo is the glyph animation');await page.locator('#panel-menu').click();await page.getByRole('menuitem',{name:'애니메이티드 폰트 팩',exact:true}).click();assert.equal(await page.getByRole('dialog',{name:'애니메이티드 폰트 팩'}).count(),1);await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();await page.evaluate(()=>{const wrap=document.createElement('div');wrap.id='public-font-media-probe';document.body.appendChild(wrap);ContentriumPreview.mount(wrap,{name:'Own Font',category:['Animated Fonts']},{id:'font-preview-probe',name:'Own Font',type:11,renderedPreview:'library/fonts/contentrium-grid.webm'});});await page.waitForFunction(()=>document.querySelector('#public-font-media-probe video').readyState>=2);assert.equal(await page.locator('#public-font-media-probe canvas').count(),0);await page.evaluate(()=>document.querySelector('#public-font-media-probe video').onerror());assert.equal(await page.locator('#public-font-media-probe canvas').count(),0);assert.equal(await page.locator('#public-font-media-probe .preview-message').count(),1);
 // Refresh the real dynamic catalog, not the standalone preview probe. Wait for
 // both the host receipt and catalog response to finish before checking identity.
 const refreshFonts=async mutate=>{
   await page.waitForFunction(()=>!ContentriumUI.view.getTransportState().busy);
   const before=await page.evaluate(()=>__fontCalls.filter(c=>c.method==='hostStatus').length);
   if(mutate)await page.evaluate(mutate);
   const catalog=page.waitForResponse(r=>r.url().includes('/library/catalog.json')&&r.request().method()==='GET');
   await page.locator('#refresh').click();
   await (await catalog).finished();
   await page.waitForFunction(n=>__fontCalls.filter(c=>c.method==='hostStatus').length>n&&ContentriumUI.view.getState().connected&&!ContentriumUI.view.getTransportState().busy,before);
   // Drain catalog JSON/render promise and its next paint without a timing sleep.
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 };
 await refreshFonts(()=>{__fontHost.animatedFonts.available[0].renderedPreview='library/fonts/contentrium-grid.webm';});
 await page.waitForFunction(()=>{const v=document.querySelector('.preset-card[data-entry-id="font:contentrium-grid"] video');return v&&v.readyState>=2;});
 await page.evaluate(()=>{
   window.__fontIdentity={card:document.querySelector('.preset-card[data-entry-id="font:contentrium-grid"]')};
   __fontIdentity.video=__fontIdentity.card.querySelector('video');
   __fontIdentity.other=document.querySelector('.preset-card:not([data-entry-id="font:contentrium-grid"])');
 });
 const assertIdentity=async label=>assert.equal(await page.evaluate(()=>{
   const card=document.querySelector('.preset-card[data-entry-id="font:contentrium-grid"]');
   return card===__fontIdentity.card&&card.querySelector('video')===__fontIdentity.video&&__fontIdentity.video.isConnected;
 }),true,label);
 // DOM click has detail=0, deliberately avoiding the panel's double-click Add.
 await page.evaluate(()=>__fontIdentity.other.querySelector('.preset-name').click());
 await assertIdentity('selecting another card replaced the dynamic font card/video');
 await page.evaluate(()=>__fontIdentity.card.querySelector('.preset-name').click());
 await assertIdentity('selecting the font replaced its card/video');
 await refreshFonts();
 await assertIdentity('unchanged host refresh replaced the dynamic font card/video');
 const star=card.locator('.card-star');
 if(await star.getAttribute('aria-pressed')!=='true')await star.click();
 await refreshFonts();
 await assertIdentity('favoriting/refresh replaced the dynamic font card/video');
 assert.equal(await star.getAttribute('aria-pressed'),'true');
 await refreshFonts(()=>{window.__savedFontDefinition=__fontHost.animatedFonts.available[0];__fontHost.animatedFonts.available=[];__fontHost.animatedFonts.capabilities.add=false;});
 await page.waitForFunction(()=>!document.querySelector('.preset-card[data-entry-id="font:contentrium-grid"]'));
 assert.equal(await page.evaluate(()=>ContentriumUI.view.getState().favorites.includes('font:contentrium-grid')),true,'missing pack lost its favorite');
 await refreshFonts();
 assert.equal(await page.evaluate(()=>ContentriumUI.view.getState().favorites.includes('font:contentrium-grid')),true,'second catalog refresh pruned missing font favorite');
 await refreshFonts(()=>{__fontHost.animatedFonts.available=[__savedFontDefinition];__fontHost.animatedFonts.capabilities.add=true;});
 await card.waitFor({timeout:4000});
 assert.equal(await star.getAttribute('aria-pressed'),'true','returning pack did not restore its favorite');
 await page.waitForFunction(()=>{const v=document.querySelector('.preset-card[data-entry-id="font:contentrium-grid"] video');return v&&v.readyState>=2;});
 assert.equal(await page.evaluate(()=>__fontCalls.filter(c=>c.method==='addAnimatedFont').length),1,'selection/refresh unexpectedly applied another font');
 return{ok:true,publicCard:true,exactDigest:true,unsupportedGlyphBlocked:true,managerVisible:true,renderedFontPlayback:true,failedPreviewNoFakeCanvas:true,dynamicCardVideoIdentity:true,missingPackFavoriteRetained:true,returningPackFavoriteRestored:true};
}
