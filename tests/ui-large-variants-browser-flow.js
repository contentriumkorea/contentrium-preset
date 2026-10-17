async page=>{
 const ctx=await page.context().browser().newContext({viewport:{width:680,height:430}}),p=await ctx.newPage(),checks=[];function check(v,n){if(!v)throw Error(n);checks.push(n);}
 try{
  await p.addInitScript(()=>localStorage.setItem('contentrium-preset.ui.v1',JSON.stringify({tabMode:'browse'})));
  await p.route('**/library/catalog.json',async route=>{const response=await route.fetch(),catalog=await response.json(),entry=catalog.entries.find(e=>e.variants.length>1),source=entry.variants[0];entry.variants=Array.from({length:600},(_,i)=>({...source,id:'direction-'+i,name:'Direction '+i}));catalog.entries=[entry];await route.fulfill({json:catalog});});
  await p.goto(new URL('/',page.url()).href);await p.waitForSelector('.preset-card');await p.locator('.preset-card').click({button:'right'});await p.getByRole('menuitem',{name:'변형 모두 보기',exact:true}).click();
  check(Number(await p.locator('#preset-grid').getAttribute('data-logical-count'))===600&&await p.locator('.preset-card').count()<30,'all variants view retains 600 logical variants with bounded cards');
  await p.locator('.preset-card').first().focus();await p.locator('.preset-card').first().press('End');
  check(await p.evaluate(()=>document.activeElement.dataset.variantId==='direction-599'),'End reaches the final direction');
  await p.locator('#variants-back').click();check(await p.locator('.preset-card').count()===1&&await p.locator('.preset-card').getAttribute('data-variant-id')==='direction-599','Back retains chosen direction in grouped view');
  return{ok:true,checks,scope:'synthetic direction metadata and real built-in previews, no native apply'};
 }finally{await ctx.close();}
}
