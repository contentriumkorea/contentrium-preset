async page => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw Error('Isolated local UI required');
  const context = await page.context().browser().newContext({viewport:{width:900,height:650}});
  const target = await context.newPage(), checks = [], errors = [];
  function check(ok, name) { if (!ok) throw Error(name); checks.push(name); }
  target.on('pageerror', e => errors.push(e.message));
  try {
    await target.route('**/__theme-fixture', route => route.fulfill({contentType:'text/html; charset=utf-8', body:
      '<!doctype html><html><head><meta charset="utf-8"><style>' +
      'body{background:var(--bg);color:var(--text);font:16px sans-serif}' +
      'input,button{color:var(--text);background:var(--control-bg);border:1px solid var(--border);padding:8px}' +
      ':focus-visible{outline:2px solid var(--focus-ring);outline-offset:2px}' +
      '</style></head><body><label for="draft">편집 중</label><input id="draft" value="보존할 문구"><button id="next">다음</button></body></html>'}));
    await target.goto(new URL('/__theme-fixture', page.url()).href);
    await target.addScriptTag({url:new URL('/ui-theme.js', page.url()).href});
    check(await target.evaluate(() => typeof ContentriumTheme?.init === 'function'), 'actual independent theme module loads');
    await target.evaluate(() => { window.__theme = ContentriumTheme.init(window); });
    check(await target.evaluate(() => __theme.current().source === 'standalone' && getComputedStyle(document.body).backgroundColor === 'rgb(48, 48, 48)'), 'standalone has the existing dark background');
    await target.evaluate(() => {
      __theme.dispose();
      document.documentElement.style.setProperty('--bg','#123456');
      window.__themeCallbacks = new Set();
      window.__themeHost = {appSkinInfo:{panelBackgroundColor:{type:1,color:{red:230,green:230,blue:230}}}};
      window.__themeHostReads = 0;
      window.__adobe_cep__ = {
        getHostEnvironment() { __themeHostReads++; return typeof __themeHost === 'string' ? __themeHost : JSON.stringify(__themeHost); },
        addEventListener(name, fn) { if(name === 'com.adobe.csxs.events.ThemeColorChanged')__themeCallbacks.add(fn); },
        removeEventListener(name, fn) { __themeCallbacks.delete(fn); },
      };
      window.__theme = ContentriumTheme.init(window);
    });
    check(await target.evaluate(() => __theme.current().variant === 'light' && getComputedStyle(document.body).backgroundColor === 'rgb(238, 238, 238)'), 'host environment changes actual computed colors to light');
    await target.locator('#draft').focus(); await target.locator('#draft').fill('완료 전 초안');
    await target.evaluate(() => {
      __themeHost = {appSkinInfo:{panelBackgroundColor:{type:1,color:{red:20,green:20,blue:20}}}};
      __themeCallbacks.forEach(fn => fn({data:{appSkinInfo:'untrusted event object'}}));
    });
    check(await target.evaluate(() => document.activeElement.id === 'draft' && document.querySelector('#draft').value === '완료 전 초안'), 'host theme event preserves the focused editable draft');
    check(await target.evaluate(() => __theme.current().variant === 'darkest' && getComputedStyle(document.body).backgroundColor === 'rgb(32, 32, 32)'), 'theme event rereads host state instead of trusting event payload');
    await target.evaluate(() => { __themeHost = '{not json'; __themeCallbacks.forEach(fn => fn(null)); });
    check(await target.evaluate(() => __theme.current().variant === 'darkest' && __theme.current().diagnostic === 'HOST_ENVIRONMENT_UNAVAILABLE'), 'malformed event and host response retain the last valid theme');
    await target.keyboard.press('Tab');
    check(await target.evaluate(() => document.activeElement.id === 'next'), 'theme updates do not intercept keyboard navigation');
    check(await target.locator('#next').evaluate(button => button.matches(':focus-visible') && getComputedStyle(button).outlineStyle === 'solid' && getComputedStyle(button).outlineWidth === '2px'), 'keyboard focus remains visibly outlined');
    await target.evaluate(() => {
      Object.defineProperty(window,'devicePixelRatio',{configurable:true,value:2}); window.dispatchEvent(new Event('resize'));
    });
    check(await target.evaluate(() => __theme.current().deviceScale === 2 && document.documentElement.style.getPropertyValue('--cp-device-scale') === '2' && document.documentElement.style.zoom === '' && document.documentElement.style.fontSize === ''), 'DPI changes update metadata without page zoom or root type resizing');
    check(await target.evaluate(() => ContentriumTheme.init(window) === __theme && __themeCallbacks.size === 1), 'reinitialization does not duplicate host subscriptions');
    await target.evaluate(() => { __theme.dispose(); __theme.dispose(); });
    check(await target.evaluate(() => __themeCallbacks.size === 0 && document.documentElement.style.getPropertyValue('--bg') === '#123456' && !document.documentElement.hasAttribute('data-theme')), 'cleanup removes callbacks and restores only owned root styles');
    check(errors.length === 0, 'no browser script errors');
    return {ok:true,checkCount:checks.length,checks,scope:'isolated actual browser DOM/colors/keyboard with fake CEP environment events; no installed CEP or native AE verification'};
  } finally { await context.close(); }
}
