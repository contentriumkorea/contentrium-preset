async page => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw Error('Standalone product UI only');
  const context = await page.context().browser().newContext({viewport:{width:1150,height:800}});
  const target = await context.newPage(), checks = [], failures = [], errors = [];
  const check = (ok, name, detail) => { checks.push({name,ok,detail}); if (!ok) failures.push(name); };
  target.on('pageerror', error => errors.push(error.message));
  try {
    await target.goto(new URL('/',page.url()).href);
    await target.waitForFunction(() => document.querySelectorAll('.preset-card').length === 43);
    await target.waitForFunction(() => Array.from(document.querySelectorAll('.preset-card video')).filter(v => v.readyState >= 2 && v.duration > 1).length >= 2);
    await target.evaluate(() => {
      window.__beforeCards = Array.from(document.querySelectorAll('.preset-card'));
      window.__beforeMedia = __beforeCards.map(c => c.querySelector('video,canvas'));
      window.__beforeRects = __beforeCards.map(c => {const r=c.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
      window.__mediaEvents = [];
      __beforeMedia.forEach((v,i) => ['emptied','loadstart','seeking'].forEach(name => v.addEventListener(name,() => __mediaEvents.push({i,name}))));
    });
    const cards = target.locator('.preset-card'), chosen = cards.filter({has:target.locator('.variant-button')}).first();
    const entry = await chosen.getAttribute('data-entry-id');
    await chosen.locator('.preset-name').click();
    const first = await target.evaluate(() => ({
      sameCards:__beforeCards.every(c => c.isConnected),sameMedia:__beforeMedia.every(v => v.isConnected),
      displaced:Array.from(document.querySelectorAll('.preset-card')).map((c,i)=>({i,delta:c.getBoundingClientRect().y-__beforeRects[i].y})).filter(x=>Math.abs(x.delta)>.5),
      resets:__mediaEvents.filter(e=>e.name==='emptied')
    }));
    check(first.sameMedia,'select keeps every existing preview element',first.sameMedia);
    check(first.sameCards,'select keeps card elements',first.sameCards);
    check(first.displaced.length===0,'opening directions keeps all card positions',first.displaced.slice(0,5));
    check(first.resets.length===0,'select never empties other media',first.resets.length);
    if (failures.length) return {ok:false,checks,failures,scope:'actual standalone DOM/video; no AE host mutations'};

    const selected = target.locator('.preset-card[data-entry-id="'+entry+'"]');
    await target.evaluate(() => {window.__selectedMedia=document.querySelector('.preset-card.selected video');window.__otherMedia=Array.from(document.querySelectorAll('.preset-card video')).find(v=>v!==__selectedMedia&&v.readyState>=2&&v.duration>1);});
    await target.waitForFunction(()=>__otherMedia.currentTime>.6&&!__otherMedia.paused);
    await target.evaluate(()=>{ContentriumPreview.setPlaybackActive(false);window.__heldTime=__otherMedia.currentTime;});
    await selected.locator('.preset-name').click();
    const repeated=await target.evaluate(()=>({selected:__selectedMedia.isConnected,other:__otherMedia.isConnected,time:__otherMedia.currentTime}));
    check(repeated.selected&&repeated.other&&await target.evaluate(()=>Math.abs(__otherMedia.currentTime-__heldTime)<.05),'repeat click keeps selected and other playback positions',repeated);
    // Reopen using the explicit button so this test does not trigger a double-click apply.
    if(!await selected.locator('.inline-variants').count())await selected.locator('.variant-button').click();
    const secondVariant = selected.locator('.variant-row[aria-pressed="false"]').first(), variantId = await secondVariant.getAttribute('data-variant-id');
    await secondVariant.click();
    check(await selected.getAttribute('data-variant-id')===variantId,'direction switches the selected preview and apply target');
    check(await target.evaluate(()=>!__selectedMedia.isConnected&&__otherMedia.isConnected&&Math.abs(__otherMedia.currentTime-__heldTime)<.05),'direction change replaces only its own preview');
    const activeVariant=selected.locator('.variant-row[aria-pressed="true"]');
    await activeVariant.focus();await activeVariant.press('Enter');
    check(await activeVariant.evaluate(n=>n===document.activeElement),'same direction retains keyboard focus');
    await selected.locator('.variant-button').click();
    check(await selected.locator('.inline-variants').count()===0,'direction toggle collapses without a grid reload');
    await selected.locator('.card-star').click();
    check(await target.evaluate(()=>__otherMedia.isConnected),'favorite mutation preserves unrelated previews');
    await selected.locator('.card-star').click();
    await selected.focus();await selected.press('ArrowRight');
    check(await target.locator('.preset-card.selected').getAttribute('data-entry-id')!==entry,'arrow navigation selects and focuses the adjacent card');
    check(await target.locator('.preset-card.selected').evaluate(n=>n===document.activeElement),'arrow navigation preserves focus on selected card');
    await target.getByRole('searchbox',{name:'항목 검색'}).fill('Ease Fade Together 3');
    await target.waitForFunction(()=>ContentriumUI.view.getState().query==='Ease Fade Together 3');
    await target.getByRole('listitem',{name:/Ease Fade Together 3/}).locator('.preset-name').click();
    await target.getByRole('button',{name:'View all at once',exact:true}).click();
    check(await cards.count()===2,'all-variants mode displays both directions');
    await target.locator('#variants-back').click();
    check(await cards.count()===1,'back restores grouped result');
    await target.getByRole('searchbox',{name:'항목 검색'}).fill('');
    await target.waitForFunction(()=>document.querySelectorAll('.preset-card').length===43);
    await target.setViewportSize({width:680,height:430});
    const last = cards.filter({has:target.locator('.variant-button')}).last();
    await last.locator('.preset-name').click();
    await last.locator('.view-all-variants').scrollIntoViewIfNeeded();
    check(await last.locator('.view-all-variants').evaluate(n=>{const r=n.getBoundingClientRect(),g=document.querySelector('#preset-grid').getBoundingClientRect();return r.bottom<=g.bottom+.5&&r.top>=g.top-.5;}),'last-card directions remain reachable in a narrow short panel');
    await target.screenshot({path:'output/playwright/browse-stability-20261016.png'});
    check(errors.length===0,'no browser script errors',errors);
    return {ok:failures.length===0,checks,failures,scope:'actual standalone DOM/video; no AE host mutations'};
  } finally { await context.close(); }
}
