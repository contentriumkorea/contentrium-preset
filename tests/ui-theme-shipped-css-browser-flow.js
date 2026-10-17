async page => {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url())) throw Error('Isolated local UI required');
  const context = await page.context().browser().newContext({viewport:{width:1000,height:700}});
  const target = await context.newPage(), checks = [], failures = [], errors = [];
  function check(ok, name, detail) { checks.push({ok:!!ok,name,detail}); if (!ok) failures.push(name); }
  target.on('pageerror', e => errors.push(e.message));
  try {
    await target.route('**/__theme-shipped-css-fixture', route => route.fulfill({contentType:'text/html; charset=utf-8',body:
      '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
      '<main class="workspace-view"><section class="tool-section"><h2>도구</h2><div class="workspace-actions"><a id="workspace-action" href="#help">사용 도움말</a></div></section>' +
      '<div class="audio-notice"><span>개인 오디오 파일을 등록하세요.</span><button id="audio-action">등록 안내</button></div>' +
      '<section class="audio-preview"><p id="audio-status" class="audio-preview-message">미리듣기 파일을 준비하고 있습니다.</p></section>' +
      '<label>편집 중<input id="draft" value="유지할 초안"></label></main></body></html>'}));
    await target.goto(new URL('/__theme-shipped-css-fixture', page.url()).href);
    await target.addStyleTag({url:new URL('/panel.css', page.url()).href});
    await target.addScriptTag({url:new URL('/ui-theme.js', page.url()).href});
    const cssHash = await target.evaluate(async () => {
      const bytes = await (await fetch('/panel.css')).arrayBuffer(), digest = new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
      return [...digest].map(v => v.toString(16).padStart(2,'0')).join('');
    });
    await target.evaluate(() => {
      window.__themeReads = 0; window.__themeListeners = new Set(); window.__themeRed = 230;
      window.__adobe_cep__ = {
        getHostEnvironment() { __themeReads++; const v=__themeRed; return JSON.stringify({appSkinInfo:{panelBackgroundColor:{type:1,color:{red:v,green:v,blue:v}}}}); },
        addEventListener(name, fn) { if(name==='com.adobe.csxs.events.ThemeColorChanged')__themeListeners.add(fn); },
        removeEventListener(name, fn) { __themeListeners.delete(fn); },
      };
      window.__theme = ContentriumTheme.init(window);
      window.__heldThemeNodes = [...document.querySelectorAll('#workspace-action,#audio-action,#audio-status,#draft')];
    });
    const contrast = async (id, outline = false) => target.locator('#'+id).evaluate((element, outline) => {
      const parse = value => {
        const n = value.match(/[\d.]+/g).map(Number); return [n[0],n[1],n[2],n.length>3?n[3]:1];
      };
      const blend = (front,back) => [0,1,2].map(i=>front[i]*front[3]+back[i]*(1-front[3])).concat(1);
      const background = node => {
        if(!node)return [255,255,255,1]; const c=parse(getComputedStyle(node).backgroundColor);
        return c[3]===1?c:blend(c,background(node.parentElement));
      };
      const cs=getComputedStyle(element), bg=background(element), fg=blend(parse(outline?cs.outlineColor:cs.color),bg);
      const luminance = rgb => rgb.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
        .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      const a=luminance(fg),b=luminance(bg);
      return {ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),foreground:outline?cs.outlineColor:cs.color,
        background:bg.slice(0,3),focused:document.activeElement===element,outline:cs.outlineStyle,width:cs.outlineWidth};
    },outline);
    for(const [variant,red] of [['light',230],['dark',60],['darkest',20]]) {
      await target.locator('#draft').focus(); await target.locator('#draft').fill('테마 변경 중 초안');
      await target.evaluate(red => { __themeRed=red;__themeListeners.forEach(fn=>fn({data:{ignored:true}})); },red);
      check(await target.evaluate(variant=>__theme.current().variant===variant,variant),variant+' reads the actual host theme mapping');
      for(const id of ['workspace-action','audio-action','audio-status']) {
        const values=await contrast(id);check(values.ratio>=4.5,variant+' shipped '+id+' text contrast >= 4.5',values);
      }
      check(await target.evaluate(()=>document.activeElement.id==='draft'&&document.querySelector('#draft').value==='테마 변경 중 초안'&&__heldThemeNodes.every(n=>n.isConnected)),variant+' preserves actual focused nodes and draft');
      await target.locator('#workspace-action').focus(); await target.keyboard.press('Tab');
      const focus=await contrast('audio-action',true);
      check(focus.focused&&focus.outline==='solid'&&parseFloat(focus.width)>=2&&focus.ratio>=3,variant+' shipped notice button has keyboard-visible focus contrast >= 3',focus);
      if(variant==='light')await target.screenshot({path:'output/playwright/theme-shipped-css-light.png'});
    }
    await target.evaluate(()=>__theme.dispose());
    check(await target.evaluate(()=>__themeListeners.size===0),'cleanup removes the fake host theme subscription');
    check(errors.length===0,'no browser script errors',errors);
    const result={ok:failures.length===0,checkCount:checks.length,checks,failures,cssSha256:cssHash,
      scope:'separate real headless browser; actual shipped panel.css and theme module, representative shipped markup with fake CEP colors; no native CEP/AE'};
    if(failures.length)throw Error(JSON.stringify(result));
    return result;
  } finally { await context.close(); }
}
