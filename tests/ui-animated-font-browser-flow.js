/* Standalone isolated fixture: simulated CEP only; never attaches to AE/shared browsers. */
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.CONTENTRIUM_PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(__dirname,'..'),evidence=path.join(root,'.superpowers/sdd/2026-10-16-animated-font');
async function main(){
 const server=http.createServer((req,res)=>{let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(file===root)file=path.join(root,'index.html');if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end();return;}const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webm':'video/webm'}[path.extname(file)];res.setHeader('Content-Type',type||'application/octet-stream');res.end(data);});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;const checks=[],errors=[];
 const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
 try{
  browser=await chromium.launch({headless:true,...(process.env.CONTENTRIUM_BROWSER_EXECUTABLE ? {executablePath:process.env.CONTENTRIUM_BROWSER_EXECUTABLE} : {})});const context=await browser.newContext({viewport:{width:1100,height:820}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const catalog={entries:[{id:'fixture-font',name:'Private simulated font',category:['Private fixture'],favorite:true,defaultId:'style-one',variants:[{id:'style-one',name:'Catalog untrusted name',type:11,fontId:'own-one',fontHash:'sha256:one',available:true},{id:'style-two',name:'Style two',type:11,fontId:'own-two',fontHash:'sha256:two',available:true},{id:'style-mismatch',name:'Wrong digest',type:11,fontId:'own-one',fontHash:'sha256:wrong',available:true}]},{id:'fixture-video',name:'Existing preview',category:['Private fixture'],favorite:true,defaultId:'video',variants:[{id:'video',name:'Preview',type:1,available:true,renderedPreview:'library/previews/9ce.webm'}]}]};
  let catalogReads=0;
  await page.route('**/library/catalog.json',r=>{catalogReads++;return r.fulfill({json:catalog});});
  await page.route('**/favicon.ico',r=>r.fulfill({status:204}));
  await page.addInitScript(()=>{
   localStorage.setItem('contentrium-preset.ui.v1',JSON.stringify({tabMode:'browse'}));localStorage.setItem('contentrium-preset.settings.v1',JSON.stringify({welcomeSeen:true}));
   window.__calls=[];window.__fail=false;window.__hold=false;window.__release=null;window.__holdStatus=false;window.__statusRelease=null;
   window.__host={available:true,methods:['getState','getLibrary','getSettings','addAnimatedFont'],animatedFonts:{capabilities:{add:true},available:[{id:'own-one',digest:'sha256:one',name:'Host One',coverage:{codePoints:[32,65,66],maxScalars:6}},{id:'own-two',digest:'sha256:two',name:'Host Two',coverage:{codePoints:[65],maxScalars:6}}]}};
   window.__state={revision:1,projectRevision:10,context:{projectKey:'private-simulated',projectToken:'fixture',compositionId:7,layerIds:[]},numSelectedLayers:0,applied:[],controls:[],instanceId:null};
   window.__adobe_cep__={getSystemPath:()=>'/isolated-animated-font-simulated',evalScript:(script,cb)=>{
    const m=/\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(script);if(!m)throw Error('Fixture host parse');
    const method=JSON.parse(m[1]),payload=JSON.parse(JSON.parse(m[2]));__calls.push({method,payload});let result={};
    if(method==='hostStatus'&&__holdStatus){__statusRelease=mode=>cb(JSON.stringify(mode==='error'?{ok:false,error:{message:'Simulated connection loss'}}:{ok:true,result:{...__host,available:mode!=='unavailable'}}));return;}
    if(method==='hostStatus')result=__host;else if(method==='getState')result=__state;else if(method==='getLibrary')result={items:[],folders:[]};else if(method==='getSettings')result={settings:{pausePreviewWhenInactive:true}};
    if(method==='addAnimatedFont'){
     const finish=()=>{if(__fail){cb(JSON.stringify({ok:false,error:{code:'FIXTURE_ERROR',message:'Simulated <b>host error</b>'}}));return;}
      __state={...__state,revision:__state.revision+1,projectRevision:11,instanceId:'new-root',wantsRevealEditTab:true,numSelectedLayers:1,selectedLayerName:'Simulated root',hasRootNode:true,context:{...__state.context,layerIds:[80]}};cb(JSON.stringify({ok:true,result:{rootLayerId:80,addedLayerId:80,wantsRevealEditTab:true}}));};
     if(__hold){__release=finish;return;}finish();return;
    }
    cb(JSON.stringify({ok:true,result}));
   }};
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.ContentriumUI?.view.getState().hostState);
  const card=page.locator('.preset-card[data-entry-id="fixture-font"]');await card.locator('.preset-name').click();
  const input=page.getByRole('textbox',{name:'애니메이션 글자'}),add=page.getByRole('button',{name:'Add',exact:true});
  await input.waitFor({timeout:5000});check((await page.locator('#variant-summary').textContent()).includes('Host One'),'style name comes from exact host definition');
  check(await page.locator('#apply-actions button').count()===0,'font footer has no Apply/In/Out actions');
  await input.fill('AB');await input.focus();await page.evaluate(()=>{window.__input=document.querySelector('#animated-font-text');window.__video=document.querySelector('.preset-card[data-entry-id="fixture-video"] video');});
  check(await page.evaluate(()=>!!__video),'unrelated preview video exists');await page.evaluate(()=>ContentriumUI.view.refresh());await page.waitForTimeout(1100);
  check(await page.evaluate(()=>document.querySelector('#animated-font-text')===__input&&document.activeElement===__input&&__input.value==='AB'),'focused draft and input survive getState polls');
  await input.press('Enter');await page.waitForFunction(()=>__calls.filter(c=>c.method==='addAnimatedFont').length===1);await page.waitForFunction(()=>!ContentriumUI.view.getTransportState().busy);
  check(await input.inputValue()==='AB','successful Enter retains draft');check(await page.evaluate(()=>ContentriumUI.view.getState().tab==='browse'&&__state.context.layerIds[0]===80),'manual Browse mode retained; simulated host selects root');
  await page.evaluate(()=>{const e=document.querySelector('#animated-font-text');e.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}));e.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));});
  check(await page.evaluate(()=>__calls.filter(c=>c.method==='addAnimatedFont').length===1),'IME Enter sends zero requests');
  await input.fill('C');check(await add.isDisabled(),'unsupported scalar blocked');await input.press('Enter');
  async function variant(id){await card.locator('.variant-row[data-variant-id="'+id+'"]').click();}
  // The public card variant controls are exercised, not a production injection hook.
  await input.fill('AB');
  // Select styles using the rendered variant controls.
  const variantSelect=card.locator('select');
  if(await variantSelect.count())await variantSelect.selectOption('style-two');else await variant('style-two');
  check(await input.inputValue()==='AB'&&await add.isDisabled(),'style coverage revalidates retained draft');
  if(await variantSelect.count())await variantSelect.selectOption('style-mismatch');else await variant('style-mismatch');
  await input.fill('A');check(await add.isDisabled(),'digest mismatch never enables Add');
  if(await variantSelect.count())await variantSelect.selectOption('style-one');else await variant('style-one');
  await page.locator('.preset-card[data-entry-id="fixture-video"] .preset-name').click();
  await card.locator('.preset-name').click();check(await input.inputValue()==='A','one draft survives visiting another item type');
  await card.locator('.preset-name').dblclick();check(await page.evaluate(()=>!__calls.some(c=>c.method==='applyPreset')),'font double click never calls generic Apply');
  if(!await input.isVisible())await card.locator('.variant-button').click();
  await input.fill('AB');await page.evaluate(()=>__fail=true);await add.click();await page.waitForFunction(()=>document.querySelector('.animated-font-message').textContent.includes('host error'));
  await input.focus();await page.evaluate(()=>ContentriumUI.view.refresh());check((await input.inputValue())==='AB','host error retains draft');check((await page.locator('.animated-font-message').textContent()).includes('<b>host error</b>'),'host error rendered as literal text');
  check(await page.evaluate(()=>document.querySelector('.preset-card[data-entry-id="fixture-video"] video')===__video),'existing video identity survives style, busy, error and polling');
  await page.screenshot({path:path.join(evidence,'task-4-simulated-browser.png'),fullPage:true});
  await page.evaluate(()=>{__fail=false;__hold=true;});await add.click();await page.waitForFunction(()=>!!__release);await input.focus();check(await page.evaluate(()=>document.querySelector('#animated-font-text')===__input&&document.activeElement===__input),'input identity and focus survive a busy request');await input.fill('BA');await page.evaluate(()=>{__release();__hold=false;});await page.waitForFunction(()=>!ContentriumUI.view.getTransportState().busy);check(await input.inputValue()==='BA','late completion retains newer draft');
  await page.evaluate(()=>{__state.instanceId=null;__state.wantsRevealEditTab=false;return ContentriumUI.view.refresh();});await page.locator('#tab-mode').selectOption('auto');await page.waitForFunction(()=>ContentriumUI.view.getState().tab==='browse');await input.fill('AB');await add.click();await page.waitForFunction(()=>ContentriumUI.view.getState().tab==='edit');check(true,'success follows established Auto/Edit policy');
  await page.getByRole('button',{name:'Browse',exact:true}).click();await page.evaluate(()=>__host.animatedFonts.capabilities.add=false);await page.locator('#refresh').click();await page.waitForFunction(()=>!ContentriumUI.view.getTransportState().busy);check(await add.isDisabled(),'missing host add capability disables Add');
  await page.evaluate(()=>__host.animatedFonts.capabilities.add=true);await page.locator('#refresh').click();await page.waitForFunction(()=>!ContentriumUI.view.getTransportState().busy);await input.fill('AB');
  const beforeStyleChange=await page.evaluate(()=>__calls.filter(c=>c.method==='addAnimatedFont').length);
  await page.evaluate(()=>{document.querySelector('.animated-font-form').requestSubmit();document.querySelector('.variant-row[data-variant-id="style-two"]').click();});
  await page.waitForFunction(()=>!ContentriumUI.view.getTransportState().busy);check(await page.evaluate(()=>__calls.filter(c=>c.method==='addAnimatedFont').length)===beforeStyleChange,'dispatch guard rejects a style changed after submit but before host dispatch');
  await variant('style-one');
  for(const mode of ['unavailable','error']){
   const reads=catalogReads,mutations=await page.evaluate(()=>__calls.filter(c=>c.method==='addAnimatedFont').length);
   await page.evaluate(()=>{__holdStatus=true;__statusRelease=null;});
   // Dispatch Refresh without moving input focus; catalog must finish before the host callback.
   const catalogResponse=page.waitForResponse(response=>response.url().endsWith('/library/catalog.json'));
   await input.focus();await page.evaluate(()=>document.querySelector('#refresh').click());
   await (await catalogResponse).finished();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.waitForFunction(()=>!!__statusRelease);check(catalogReads>reads,'Refresh catalog completes before deferred '+mode+' hostStatus');
   await page.evaluate(mode=>{__statusRelease(mode);__holdStatus=false;},mode);await page.waitForFunction(()=>!ContentriumUI.view.getState().connected&&!ContentriumUI.view.getTransportState().busy);
   check(await add.isDisabled(),'deferred '+mode+' immediately disables Add');await input.press('Enter');
   check(await page.evaluate(()=>__calls.filter(c=>c.method==='addAnimatedFont').length)===mutations,'deferred '+mode+' Enter sends zero mutations');
   check(await page.evaluate(()=>document.querySelector('#animated-font-text')===__input&&document.activeElement===__input&&__input.value==='AB'&&document.querySelector('.preset-card[data-entry-id="fixture-video"] video')===__video),'deferred '+mode+' preserves focused draft and video identity');
   await page.evaluate(()=>document.querySelector('#refresh').click());await page.waitForFunction(()=>ContentriumUI.view.getState().connected&&!ContentriumUI.view.getTransportState().busy);check(!await add.isDisabled(),'successful reconnect after '+mode+' restores Add');
  }
  check(errors.length===0,'zero console/page/unhandled errors');
  const receipt={ok:true,scope:'new isolated headless browser/context; local server; private catalog; simulated CEP host; no native AE',checks,pageErrors:errors,mutations:await page.evaluate(()=>__calls.filter(c=>c.method==='addAnimatedFont'))};
  fs.writeFileSync(path.join(evidence,'task-4-browser-receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));await context.close();
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
