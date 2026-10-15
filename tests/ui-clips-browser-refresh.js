async(page)=>{
  const ids=['31ce','31da','31d6','31d4','31e1','31a1','1d61','1d6d','1d53'];
  await page.waitForFunction(()=>window.ContentriumUI&&ContentriumUI.view&&ContentriumUI.view.getState().entries===43);
  const entries=await page.evaluate(()=>ContentriumUI.view.getCatalog()),results=[],networkErrors=[];
  const failed=request=>{if(/\.(webm|mp4)(?:[?#]|$)/i.test(request.url()))networkErrors.push({url:request.url(),error:request.failure()&&request.failure().errorText});};
  const badResponse=response=>{if(/\.(webm|mp4)(?:[?#]|$)/i.test(response.url())&&response.status()>=400)networkErrors.push({url:response.url(),status:response.status()});};
  page.on('requestfailed',failed);page.on('response',badResponse);
  await page.getByRole('button',{name:'Browse',exact:true}).click();
  await page.locator('.category-row[aria-level="1"]').click();
  if(await page.locator('#favorites-toggle').getAttribute('aria-pressed')==='true')await page.locator('#favorites-toggle').click();
  for(const id of ids){
    const entry=entries.find(e=>e.variants.some(v=>v.id===id));if(!entry)throw Error('Missing refreshed variant '+id);
    const variant=entry.variants.find(v=>v.id===id);
    await page.getByRole('searchbox',{name:'항목 검색'}).fill(entry.name);
    await page.locator('.preset-card[data-entry-id="'+entry.id+'"]').click();
    if(entry.variants.length>1)await page.locator('.inline-variants .variant-row[data-variant-id="'+id+'"]').click();
    const video=page.locator('.preset-card[data-variant-id="'+id+'"] video');
    await video.waitFor({state:'attached'});
    const info=await video.evaluate(async v=>{
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>end(new Error('Decode timeout')),10000);function end(error){clearTimeout(timer);v.removeEventListener('loadeddata',loaded);v.removeEventListener('error',failed);error?reject(error):resolve();}function loaded(){end();}function failed(){end(new Error('Media error '+v.error.code));}if(v.error)failed();else if(v.readyState>=2)end();else{v.addEventListener('loadeddata',loaded);v.addEventListener('error',failed);v.preload='auto';v.load();}});
      v.pause();if(!v.videoWidth||!v.videoHeight||!Number.isFinite(v.duration)||v.duration<=0)throw Error('Invalid media metadata');
      const frames=[];
      for(const t of [.1,v.duration*.5,Math.max(.1,v.duration-.1)]){
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>end(new Error('Seek timeout')),10000);function end(error){clearTimeout(timer);v.removeEventListener('seeked',seeked);error?reject(error):resolve();}function seeked(){end();}if(Math.abs(v.currentTime-t)<.00001&&v.readyState>=2)end();else{v.addEventListener('seeked',seeked);v.currentTime=t;}});
        const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;const ctx=canvas.getContext('2d');ctx.drawImage(v,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let checksum=2166136261;for(const value of pixels)checksum=Math.imul(checksum^value,16777619)>>>0;frames.push({time:v.currentTime,pixelBytes:pixels.length,checksum:checksum.toString(16)});
      }
      return{width:v.videoWidth,height:v.videoHeight,duration:v.duration,frames};
    });
    const selected=await page.evaluate(()=>ContentriumUI.view.getState().selectedVariant),actions=await page.locator('#apply-actions .apply-button').allTextContents(),footer=await page.locator('#variant-summary').textContent();
    if(selected!==id||JSON.stringify(actions)!=='["Apply"]'||!footer.startsWith(variant.name||''))throw Error('Selection/footer mismatch '+id);
    results.push({id,source:variant.renderedPreview,...info,selected:true,actions,footerMatches:true});
  }
  await page.getByRole('button',{name:'검색 지우기',exact:true}).click();
  await page.locator('.preset-grid').evaluate(el=>{el.scrollTop=0;});
  await page.waitForTimeout(1300);
  await page.screenshot({path:'output/playwright/final-browse-refreshed.png'});
  page.off('requestfailed',failed);page.off('response',badResponse);
  const cancelledRequests=networkErrors.filter(row=>/ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(row.error||'')),errors=networkErrors.filter(row=>cancelledRequests.indexOf(row)===-1);
  const report={checked:results.length,results,networkErrors:errors,cancelledRequests,hostPresent:await page.evaluate(()=>!!window.__adobe_cep__),visualFidelityClaim:false};
  const downloadPromise=page.waitForEvent('download');
  await page.evaluate(value=>{const link=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));link.href=url;link.download='final-browser-9-refresh.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);},report);
  await(await downloadPromise).saveAs('output/playwright/final-browser-9-refresh.json');
  if(results.length!==9||errors.length)throw Error('Refreshed media check failed');
  return{checked:results.length,decodedFrames:results.reduce((n,r)=>n+r.frames.length,0),networkErrors:errors.length,cancelledRequests:cancelledRequests.length,report:'output/playwright/final-browser-9-refresh.json'};
}
