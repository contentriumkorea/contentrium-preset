async page=>{
 const context=await page.context().browser().newContext(),p=await context.newPage(),checks=[],errors=[];
 function check(v,name){if(!v)throw Error(name);checks.push(name);}p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.addInitScript(()=>{
   localStorage.setItem('contentrium-preset.ui.v1',JSON.stringify({favorites:[],labels:{},selectedVariants:{},tabMode:'browse'}));window.__folderCalls=[];window.__cepDialogCalls=0;window.cep={fs:{showOpenDialog(){__cepDialogCalls++;throw Error('No OS picker allowed');}}};
   window.__adobe_cep__={getSystemPath:()=>'/standalone',evalScript(script,done){const m=/\$\.contentriumPreset\.call\(("(?:[^"\\]|\\.)*"),("(?:[^"\\]|\\.)*")\)/.exec(script);if(!m)throw Error('Unexpected envelope');const method=JSON.parse(m[1]),payload=JSON.parse(JSON.parse(m[2]));__folderCalls.push({method,payload});let result={};if(method==='hostStatus')result={available:true,version:'26.5-fixture',methods:['getState','getSettings','getLibrary','addLibraryFolder']};if(method==='getState')result={instanceId:'empty',revision:1,projectRevision:1,numSelectedLayers:0,hasRootNode:false,controls:[],applied:[]};if(method==='getSettings')result={settings:{pausePreviewWhenInactive:true,presetMotionBlurEnabled:true}};if(method==='getLibrary')result={items:[],folders:[]};if(method==='addLibraryFolder')result={folder:{id:'own'}};done(JSON.stringify({ok:true,result}));}};
  });
  await p.goto(page.url());await p.locator('#browse-tab').click();await p.locator('#library-open').click();
  const add=p.getByRole('button',{name:'폴더 추가',exact:true}),pathDialog=p.getByRole('dialog',{name:'사용자 라이브러리 폴더 추가',exact:true});
  await add.click();check(await add.isDisabled(),'no duplicate opening');await pathDialog.getByRole('button',{name:'취소',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('[aria-label="폴더 추가"]').disabled);check(await p.evaluate(()=>!__folderCalls.some(c=>c.method==='addLibraryFolder')),'path Cancel writes nothing');
  await add.click();await pathDialog.getByRole('textbox',{name:'폴더 경로'}).fill('"C:\\Own Folder"');await pathDialog.getByRole('button',{name:'다음',exact:true}).click();
  check(await p.locator('.library-folder-dialog input[value="localCache"]').isChecked(),'cache default retained');await p.locator('.library-folder-dialog').getByRole('button',{name:'취소',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('[aria-label="폴더 추가"]').disabled);check(await p.evaluate(()=>!__folderCalls.some(c=>c.method==='addLibraryFolder')),'location Cancel writes nothing');
  await add.click();await pathDialog.getByRole('textbox',{name:'폴더 경로'}).fill('C:\\Own Folder');await pathDialog.getByRole('button',{name:'다음',exact:true}).click();await p.locator('.library-folder-dialog').getByRole('button',{name:'추가',exact:true}).click();await p.waitForFunction(()=>__folderCalls.some(c=>c.method==='addLibraryFolder'));
  check(await p.evaluate(()=>{const rows=__folderCalls.filter(c=>c.method==='addLibraryFolder');return rows.length===1&&JSON.stringify(rows[0].payload)===JSON.stringify({path:'C:\\Own Folder',previewsLocation:'localCache'}); }),'one explicit registration with exact path and policy');
  check(await p.evaluate(()=>__cepDialogCalls===0),'no OS dialog');check(errors.length===0,'no browser errors');return{ok:true,checks,scope:'isolated actual DOM with controlled host callbacks; not native AE'};
 }finally{await context.close();}
}
