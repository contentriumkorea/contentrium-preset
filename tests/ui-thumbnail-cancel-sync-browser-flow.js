async page=>{
 if(!/^http:\/\/(127\.0\.0\.1|localhost):/.test(page.url()))throw Error('Own standalone HTTP UI only; never installed CEP/AE');
 const origin=new URL(page.url()).origin,browser=page.context().browser(),contexts=[],peers=new Map(),sent=[],pending=new Set(),errors=[],checks=[];let closing=false;
 function check(v,label){if(!v)throw Error(label);checks.push(label);}
 async function settleBus(){while(pending.size)await Promise.all([...pending]);}
 async function setup(name,slot){
  const context=await browser.newContext();contexts.push(context);const p=await context.newPage();peers.set(name,p);p.on('pageerror',e=>errors.push(name+': '+e.message));
  // Only the thumbnail manager/file-lease dependencies are controlled. Actual
  // panel Stop handlers and validated ui-sync.js execute unchanged from product.
  await p.route('**/ui-file-lease.js',r=>r.fulfill({contentType:'application/javascript',body:'window.ContentriumFileLease={create:function(){return{dispose:function(){}}}};'}));
  await p.route('**/preview-audio-source.js',r=>r.fulfill({contentType:'application/javascript',body:'window.ContentriumPreviewAudioSource=null;'}));
  await p.route('**/ui-thumbnails.js',r=>r.fulfill({contentType:'application/javascript',body:`window.ContentriumThumbnails={create:function(config){var remaining=0;window.__ownThumbnailManager={cancelCalls:0,destroyCalls:0,seed:function(n){remaining=n;config.onChange({id:'owned-'+location.search,state:'generating',completedFrames:1,totalFrames:12,remaining:n});},cancelAll:function(){this.cancelCalls++;remaining=0;if(config.onIdle)config.onIdle();},destroy:function(){this.destroyCalls++;remaining=0;},get remaining(){return remaining;},subscribe:function(){return function(){}},request:async function(){return{state:'unavailable'}},acquire:function(){return{promise:Promise.resolve({state:'unavailable'}),release:function(){}}}};return window.__ownThumbnailManager;}};`}));
  await p.exposeFunction('__cancelSyncDispatch',event=>{if(closing)return;sent.push({from:name,event});if(sent.length>200)throw Error('cancel sync echo loop');const work=Promise.all([...peers].filter(([,q])=>!q.isClosed()).map(([,q])=>q.evaluate(e=>window.__deliverCancelSync&&window.__deliverCancelSync(e),event)));pending.add(work);work.then(()=>pending.delete(work),()=>pending.delete(work));return work;});
  await p.addInitScript(({slot})=>{
   const listeners=new Map();window.__cancelBusErrors=[];window.__deliverCancelSync=e=>listeners.get(e.type)?.({...e,data:typeof e.data==='string'?JSON.parse(e.data):e.data});
   localStorage.setItem('contentrium-preset.ui.v1'+(slot==='main'?'':'.'+slot),JSON.stringify({favorites:[],labels:{},selectedVariants:{},tabMode:'browse'}));
   window.cep_node={require:name=>{if(name==='path')return{dirname:value=>value.slice(0,value.lastIndexOf('/')),join:(...v)=>v.join('/')};throw Error('No filesystem/native dependency in UI fixture: '+name);}};
   window.__adobe_cep__={getExtensionId:()=>slot==='main'?'com.contentrium.preset':'com.contentrium.preset.'+slot,getHostEnvironment:()=>JSON.stringify({appId:'AEFT'}),getSystemPath:()=>'/own-browser-cancel-fixture',addEventListener:(type,callback)=>listeners.set(type,callback),removeEventListener:(type,callback)=>{if(listeners.get(type)===callback)listeners.delete(type);},dispatchEvent:event=>{__cancelSyncDispatch(event).catch(e=>__cancelBusErrors.push(e.message));},evalScript:(script,callback)=>{
    const m=/\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(script);if(!m)return callback(JSON.stringify({ok:false,error:{message:'fixture parse'}}));const method=JSON.parse(m[1]);let result={};
    if(method==='hostStatus')result={available:true,audioRoot:'/own-browser-fixture/Audio',methods:['getState','getSettings','getLibrary']};if(method==='getState')result={instanceId:'own-empty-'+slot,revision:1,projectRevision:1,numSelectedLayers:0,hasRootNode:false,controls:[],applied:[]};if(method==='getLibrary')result={folders:[],items:[]};if(method==='getSettings')result={settings:{pausePreviewWhenInactive:true,presetMotionBlurEnabled:true,copyUserLibFootageNextToProject:false,insertPrecompAfterInTransition:false}};callback(JSON.stringify({ok:true,result}));
   }};
  },{slot});
  await p.goto(origin+'/index.html'+(slot==='main'?'':'?view='+slot));await p.waitForFunction(()=>window.__ownThumbnailManager&&window.ContentriumUI&&ContentriumUI.view.getState().connected);await settleBus();return p;
 }
 try{
  const main=await setup('main','main'),alt=await setup('alt2','alt2');check(main.context()!==alt.context(),'independent stores and actual panel instances');await main.evaluate(()=>__ownThumbnailManager.seed(2));await alt.evaluate(()=>__ownThumbnailManager.seed(2));const before=sent.length;
  await main.locator('#thumbnail-stop').click();await settleBus();
  check(await main.evaluate(()=>__ownThumbnailManager.cancelCalls===1&&__ownThumbnailManager.remaining===0),'originating Stop cancels local work once');
  check(await alt.evaluate(()=>__ownThumbnailManager.cancelCalls===1&&__ownThumbnailManager.remaining===0),'originating Stop cancels listening peer work once');
  const commands=sent.slice(before).filter(r=>JSON.parse(r.event.data).kind==='thumbnailCancel');check(commands.length===1&&commands[0].from==='main','one outbound command with no receiving-panel echo');check(JSON.stringify(JSON.parse(commands[0].event.data).payload)==='{}','exact empty transient payload');
  const late=await setup('alt3','alt3');check(await late.evaluate(()=>__ownThumbnailManager.cancelCalls===0),'hello/snapshot does not replay earlier Stop');
  check(await alt.evaluate(()=>[...Array(localStorage.length)].map((_,i)=>localStorage.getItem(localStorage.key(i))).every(value=>!value.includes('thumbnailCancel'))),'command absent from persisted preferences and snapshots');
  const count=sent.filter(r=>JSON.parse(r.event.data).kind==='thumbnailCancel').length;await main.evaluate(()=>dispatchEvent(new Event('unload')));await settleBus();check(sent.filter(r=>JSON.parse(r.event.data).kind==='thumbnailCancel').length===count,'unload remains local');check(await alt.evaluate(()=>__ownThumbnailManager.cancelCalls===1),'unload does not cancel peer work again');
  for(const [name,p]of peers)errors.push(...await p.evaluate(()=>__cancelBusErrors).then(a=>a.map(e=>name+': '+e)));check(errors.length===0,'no page or CEP transport errors');
  return {ok:true,checks,scope:'standalone browser panel binding; simulated validated CEP event delivery and manager, no native host/worker',nativeExecuted:false,commandCount:count};
 }finally{closing=true;peers.clear();await settleBus();for(const context of contexts)await context.close();}
}
