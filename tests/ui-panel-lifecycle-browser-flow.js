async (page) => {
  // Standalone same-origin tabs only. Host responses are fixtures, never native proof.
  if (await page.evaluate(() => !!window.__adobe_cep__)) throw Error('Requires fresh standalone browser');
  const context = page.context(), peers = [], errors = [], checks = [], origin = new URL(page.url()).origin;
  const clockStart = new Date('2030-01-01T00:00:00Z');
  function check(value, label) { if (!value) throw Error(label); checks.push(label); }
  async function setup(target, query) {
    target.on('pageerror', error => errors.push(error.message));
    await target.route('**/*', route => route.continue());
    await target.clock.setFixedTime(clockStart);
    await target.addInitScript(() => {
      window.__calls = []; window.__opened = []; window.__storageEvents = [];
      addEventListener('storage', e => __storageEvents.push({key:e.key,trusted:e.isTrusted}));
      window.__adobe_cep__ = {
        getSystemPath: () => '/standalone-lifecycle-fixture',
        requestOpenExtension: id => { if(window.__failOpen)throw Error('fixture open failure');__opened.push(id); },
        closeExtension: () => {},
        evalScript: (script, callback) => {
          const match = /\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(script);
          const method = JSON.parse(match[1]), payload = JSON.parse(JSON.parse(match[2]));
          __calls.push({method,payload});
          const defaults = {pausePreviewWhenInactive:true,presetMotionBlurEnabled:true,insertPrecompAfterInTransition:false,copyUserLibFootageNextToProject:false};
          let result = {};
          if(method==='hostStatus')result={available:true,methods:['getState','getSettings','setSettings','getLibrary','toolAction']};
          if(method==='getState')result={instanceId:'unchanged',revision:1,numSelectedLayers:1,hasRootNode:true,wantsRevealEditTab:true,controls:[],applied:[],toolState:{easing:{selectionMode:'none'}}};
          if(method==='getSettings')result={settings:JSON.parse(localStorage.getItem('fixture.host-settings')||JSON.stringify(defaults))};
          if(method==='setSettings') { const settings=JSON.parse(localStorage.getItem('fixture.host-settings')||JSON.stringify(defaults));settings[payload.key]=payload.value;localStorage.setItem('fixture.host-settings',JSON.stringify(settings));result={settings}; }
          if(method==='getLibrary')result={items:[],folders:[]};
          callback(JSON.stringify({ok:true,result}));
        }
      };
    });
    await target.goto(origin + '/' + query);
    await target.evaluate(() => ContentriumUI.view.refresh());
  }
  async function settle(target, condition) {
    await target.waitForFunction(condition, null, {timeout:5000});
  }
  async function advance(target, milliseconds) {
    await target.clock.setFixedTime(new Date(await target.evaluate(()=>Date.now()) + milliseconds));
    await target.evaluate(()=>ContentriumUI.view.refresh());
  }
  await page.evaluate(() => localStorage.clear());
  await setup(page,'');
  await page.getByRole('button',{name:'시작하기',exact:true}).click();
  check(await page.evaluate(() => ContentriumUI.view.getState().tab==='edit'),'main starts in Auto Edit');
  const edit = await context.newPage(); peers.push(edit); await setup(edit,'?view=edit');
  await settle(page,() => ContentriumUI.view.getState().tab==='browse');
  check(await page.evaluate(() => __storageEvents.some(e=>e.key==='contentrium-preset.edit-panel-open'&&e.trusted)),'detached Edit uses an actual cross-tab storage event');
  await advance(page,4000);
  await settle(page,() => ContentriumUI.view.getState().tab==='edit');
  check(await page.evaluate(() => ContentriumUI.view.getState().hostState.instanceId==='unchanged'),'expired Edit returns to Edit with unchanged selected instance');
  await edit.evaluate(at=>localStorage.setItem('contentrium-preset.edit-panel-open',String(at)),await page.evaluate(()=>Date.now()));
  await settle(page,() => ContentriumUI.view.getState().tab==='browse');
  await page.getByRole('button',{name:'Browse',exact:true}).click();
  await advance(page,4000);
  check(await page.evaluate(() => ContentriumUI.view.getState().tab==='browse'&&ContentriumUI.view.getState().tabMode==='browse'),'manual Browse remains pinned after Edit expiry');
  await edit.close(); peers.splice(peers.indexOf(edit),1);
  const alt = await context.newPage(); peers.push(alt); await setup(alt,'?view=alt2');
  const now = await page.evaluate(()=>Date.now());
  await alt.evaluate(at=>localStorage.setItem('contentrium-preset.panel-lease.alt2',JSON.stringify({token:'test-live-alt2',at})),now);
  async function openNext() {
    await page.getByRole('button',{name:'패널 메뉴',exact:true}).click();
    await page.getByRole('menuitem',{name:'새 Browse 패널',exact:true}).click();
  }
  await page.evaluate(()=>localStorage.setItem('contentrium-preset.next-panel','2'));
  await openNext(); await openNext(); await openNext();
  check(await page.evaluate(()=>JSON.stringify(__opened.slice(-3))===JSON.stringify(['com.contentrium.preset.alt3','com.contentrium.preset.alt4','com.contentrium.preset.alt2'])),'unused alt3/alt4 open before cycling to live alt2');
  await alt.evaluate(at=>localStorage.setItem('contentrium-preset.panel-lease.alt3',JSON.stringify({token:'expired',at:at-3500})),now);
  await page.evaluate(()=>localStorage.setItem('contentrium-preset.next-panel','4'));
  await openNext();
  check(await page.evaluate(()=>__opened.at(-1)==='com.contentrium.preset.alt3'),'stale additional slot is reusable before another live window');
  await page.evaluate(()=>{localStorage.removeItem('contentrium-preset.panel-lease.alt4');localStorage.setItem('contentrium-preset.next-panel','4');window.__failOpen=true;});
  await openNext();
  check(await page.evaluate(()=>localStorage.getItem('contentrium-preset.panel-lease.alt4')===null),'failed open releases only its owned pending reservation');
  await page.evaluate(()=>window.__failOpen=false);
  async function settings(target) { await target.getByRole('button',{name:'패널 메뉴',exact:true}).click();await target.getByRole('menuitem',{name:'설정',exact:true}).click(); }
  await settings(page); await settings(alt);
  const counts = await Promise.all([page,alt].map(p=>p.evaluate(()=>__calls.filter(c=>c.method==='getSettings').length)));
  await page.bringToFront();
  await page.getByLabel('패널이 비활성화되면 미리보기 일시 정지',{exact:true}).uncheck({force:true});
  await settle(alt,()=>document.querySelector('#settings-content input[type=checkbox]').checked===false);
  check(await alt.evaluate(()=>__storageEvents.some(e=>e.key==='contentrium-preset.settings.v1'&&e.trusted)),'actual settings change reaches peer through trusted storage event');
  await advance(page,6000); await advance(alt,6000);
  await page.waitForTimeout(150);
  check(await alt.evaluate(before=>__calls.filter(c=>c.method==='getSettings').length===before+1,counts[1]),'peer reloads settings once without a refresh loop');
  check(await page.evaluate(before=>__calls.filter(c=>c.method==='getSettings').length===before,counts[0]),'originating panel does not refetch or echo settings');
  await page.evaluate(()=>localStorage.setItem('contentrium-preset.settings.v1','not-json'));
  await alt.waitForTimeout(100);
  check(await alt.evaluate(before=>__calls.filter(c=>c.method==='getSettings').length===before+1,counts[1]),'malformed setting broadcasts are ignored');
  await alt.evaluate(at=>localStorage.setItem('contentrium-preset.panel-lease.alt2',JSON.stringify({token:'newer-document',at})),await page.evaluate(()=>Date.now()));
  await alt.close(); peers.splice(peers.indexOf(alt),1);
  check(await page.evaluate(()=>JSON.parse(localStorage.getItem('contentrium-preset.panel-lease.alt2')).token==='newer-document'),'old document unload preserves a newer lease owner');
  if(errors.length)throw Error(errors.join('; '));
  return {ok:true,scope:'same-origin standalone fixture; fake clock; no native windows',checks,pageErrors:errors};
}
