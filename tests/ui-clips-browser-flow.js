async (page) => {
  // No host fixture and no Apply/Edit mutation. Works against standalone UI or
  // an explicitly attached native CEP page once its CDP endpoint is available.
  await page.waitForFunction(()=>window.ContentriumUI&&ContentriumUI.view&&ContentriumUI.view.getState().entries===43);
  const entries=await page.evaluate(()=>ContentriumUI.view.getCatalog());
  const variants=entries.flatMap(e=>e.variants),missing=variants.filter(v=>!v.renderedPreview);
  if(variants.length!==110||missing.length)throw Error('Rendered preview catalog incomplete: '+missing.map(v=>v.id).join(', '));
  const networkErrors=[],mediaRequest=request=>/\.(webm|mp4)(?:[?#]|$)/i.test(request.url());
  const requestFailed=request=>{if(mediaRequest(request))networkErrors.push({url:request.url(),error:request.failure()&&request.failure().errorText});};
  const responseFailed=response=>{if(mediaRequest(response.request())&&response.status()>=400)networkErrors.push({url:response.url(),status:response.status()});};
  page.on('requestfailed',requestFailed);page.on('response',responseFailed);
  await page.getByRole('button',{name:'Browse',exact:true}).click();
  await page.locator('.category-row[aria-level="1"]').click();
  if(await page.locator('#favorites-toggle').getAttribute('aria-pressed')==='true')await page.locator('#favorites-toggle').click();
  const results=[];
  for(const entry of entries){
    await page.getByRole('searchbox',{name:'항목 검색'}).fill(entry.name);
    const card=page.locator('.preset-card[data-entry-id="'+entry.id+'"]');
    await card.click();
    for(const variant of entry.variants){
      if(entry.variants.length>1)await page.locator('.inline-variants .variant-row[data-variant-id="'+variant.id+'"]').click();
      const video=page.locator('.preset-card[data-entry-id="'+entry.id+'"][data-variant-id="'+variant.id+'"] video');
      let info;
      try{
      await video.waitFor({state:'attached',timeout:10000});
      info=await video.evaluate(v=>new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>finish(new Error('Video decode timeout')),10000);
        function finish(error){clearTimeout(timer);v.removeEventListener('loadeddata',loaded);v.removeEventListener('error',failed);if(error)reject(error);else{v.pause();try{const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;const ctx=canvas.getContext('2d');ctx.drawImage(v,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let checksum=2166136261,opaquePixels=0;for(let i=0;i<pixels.length;i++){checksum=Math.imul(checksum^pixels[i],16777619)>>>0;if(i%4===3&&pixels[i]===255)opaquePixels++;}const quality=v.getVideoPlaybackQuality?v.getVideoPlaybackQuality():null;resolve({width:v.videoWidth,height:v.videoHeight,duration:v.duration,readyState:v.readyState,currentTime:v.currentTime,decodedFrame:{pixelBytes:pixels.length,checksum:checksum.toString(16),opaquePixels,totalVideoFrames:quality?quality.totalVideoFrames:null},mediaError:null});}catch(e){reject(e);}}}
        function loaded(){finish();}function failed(){finish(new Error('Video decode error'));}
        if(v.error)finish(new Error('Video failed '+v.error.code+': '+v.error.message));else if(v.readyState>=2)finish();else{v.addEventListener('loadeddata',loaded);v.addEventListener('error',failed);v.preload='auto';v.load();}
      }));
      if(!info.width||!info.height||!Number.isFinite(info.duration)||info.duration<=0||!info.decodedFrame.pixelBytes)throw Error('Invalid decoded preview '+variant.id);
      }catch(error){info={mediaError:String(error.message||error)};}
      const selection=await page.evaluate(()=>ContentriumUI.view.getState());
      const actions=await page.locator('#apply-actions .apply-button').allTextContents(),expectedActions=Number(variant.type)===1?['In','Out','Both']:['Apply'];
      const footerName=await page.locator('#selection-label').textContent(),footerVariant=await page.locator('#variant-summary').textContent();
      results.push({id:variant.id,source:variant.renderedPreview,...info,selected:selection.selectedVariant===variant.id,actions,footerMatches:footerName===entry.name&&footerVariant.startsWith(variant.name||''),directionButtonsMatch:JSON.stringify(actions)===JSON.stringify(expectedActions)});
    }
  }
  await page.getByRole('searchbox',{name:'항목 검색'}).fill('Ease Fade Together 3');
  await page.locator('.preset-card[data-entry-id="124"]').click();
  await page.getByRole('button',{name:'From End',exact:true}).click();
  await page.screenshot({path:'output/playwright/final-inline-variants.png'});
  await page.getByRole('button',{name:'View all at once'}).click();
  const allVariants=await page.evaluate(()=>({cards:document.querySelectorAll('.preset-grid .preset-card').length,state:ContentriumUI.view.getState()}));
  if(allVariants.cards!==2||allVariants.state.allVariantsId!=='124'||allVariants.state.selectedVariant!=='125')throw Error('Expanded variant selection mismatch');
  await page.screenshot({path:'output/playwright/final-all-variants.png'});
  await page.getByRole('button',{name:'‹ Back',exact:true}).click();
  const backSelection=await page.evaluate(()=>ContentriumUI.view.getState());
  if(backSelection.allVariantsId!==null||backSelection.selectedVariant!=='125')throw Error('Back lost selected variant');
  await page.getByRole('button',{name:'검색 지우기',exact:true}).click();
  const grid=page.locator('.preset-grid');
  await grid.evaluate(el=>{el.scrollTop=0;});
  await page.waitForTimeout(700);
  const first=await page.locator('.preset-grid video').evaluateAll(videos=>videos.map(v=>{const r=v.getBoundingClientRect(),g=v.closest('.preset-grid').getBoundingClientRect();return{source:v.getAttribute('src'),paused:v.paused,time:v.currentTime,offscreen:r.bottom<=g.top||r.top>=g.bottom||r.right<=g.left||r.left>=g.right};}));
  await page.waitForTimeout(350);
  const second=await page.locator('.preset-grid video').evaluateAll(videos=>videos.map(v=>({source:v.getAttribute('src'),paused:v.paused,time:v.currentTime})));
  const offscreen=first.filter(row=>row.offscreen).map(row=>{const next=second.find(item=>item.source===row.source);return{source:row.source,paused:row.paused&&next&&next.paused,timeDelta:next?Math.abs(next.time-row.time):null};});
  const offscreenPass=offscreen.length>0&&offscreen.every(row=>row.paused&&row.timeDelta<.001);
  await grid.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  await page.waitForTimeout(700);
  const bottom=await page.locator('.preset-grid video').evaluateAll(videos=>videos.map(v=>{const r=v.getBoundingClientRect(),g=v.closest('.preset-grid').getBoundingClientRect();return{source:v.getAttribute('src'),paused:v.paused,visible:r.bottom>g.top&&r.top<g.bottom&&r.right>g.left&&r.left<g.right};}));
  const visibleResumed=bottom.filter(row=>row.visible).length>0&&bottom.filter(row=>row.visible).every(row=>!row.paused);
  await grid.evaluate(el=>{el.scrollTop=0;});
  page.off('requestfailed',requestFailed);page.off('response',responseFailed);
  const cancelledRequests=networkErrors.filter(row=>/ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(row.error||'')),failedRequests=networkErrors.filter(row=>cancelledRequests.indexOf(row)===-1);
  const report={checked:results.length,results,variantUI:{inlineSelected:'125',allVariantsCards:allVariants.cards,backRetained:backSelection.selectedVariant==='125'},networkErrors:failedRequests,cancelledRequests,playback:{mounted:first.length,offscreen,offscreenPass,visibleResumed},hostPresent:await page.evaluate(()=>!!window.__adobe_cep__),visualFidelityClaim:false};
  await page.evaluate(value=>{window.__clipQA=value;},report);
  await page.screenshot({path:'output/playwright/final-browse.png'});
  const downloadPromise=page.waitForEvent('download');
  await page.evaluate(value=>{const link=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));link.href=url;link.download='final-browser-110.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);},report);
  await (await downloadPromise).saveAs('output/playwright/final-browser-110.json');
  const failed=results.filter(row=>row.mediaError||!row.selected||!row.footerMatches||!row.directionButtonsMatch);
  if(failed.length||failedRequests.length||first.length!==43||!offscreenPass||!visibleResumed)throw Error('Preview QA failed; inspect window.__clipQA: '+JSON.stringify({failed:failed.map(row=>row.id),networkErrors:failedRequests.length,mounted:first.length,offscreenPass,visibleResumed}));
  return {checked:results.length,decoded:results.filter(row=>row.decodedFrame).length,networkErrors:failedRequests.length,cancelledRequests:cancelledRequests.length,mounted:first.length,offscreenPass,visibleResumed,report:'output/playwright/final-browser-110.json',visualFidelityClaim:false};
}
