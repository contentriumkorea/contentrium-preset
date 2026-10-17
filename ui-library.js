(function(scope){
  'use strict';
  var kinds=['preset','animation-preset','project','image','image-sequence','video','audio'];
  var names={preset:'사용자 프리셋','animation-preset':'FFX 프리셋',project:'AE 프로젝트',image:'이미지','image-sequence':'이미지 시퀀스',video:'영상',audio:'오디오'};
  function kind(item){return String(item&&item.kind||item&&item.type||'').toLowerCase();}
  function categoryParts(entry){return (entry.categoryKeys||entry.category||[]).slice();}
  function folderPaths(library){
    return [{category:['User Library'],categoryKeys:['@library']}].concat(((library&&library.folders)||[]).map(function(folder){return {category:['User Library',folder.name||'등록 폴더'],categoryKeys:['@library','folder:'+token(folder.id)]};}));
  }
  function token(value){
    var a=2166136261,b=2246822507,text=String(value);
    for(var i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b^text.charCodeAt(i),3266489909);}
    return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
  }
  function canImport(item,library){
    if(!item||item.missing||item.ambiguous||item.importable===false||kinds.indexOf(kind(item))===-1)return false;
    return kind(item)!=='image-sequence'||!!(library&&library.capabilities&&library.capabilities.imageSequence);
  }
  function canReplace(item,library){
    if(!canImport(item,library)||['preset','animation-preset'].indexOf(kind(item))!==-1)return false;
    return kind(item)!=='image-sequence'||!!(library&&library.capabilities&&library.capabilities.imageSequenceReplace);
  }
  function canReplaceSelection(item,state){return kind(item)!=='audio'||!!(state&&state.soundApplyOptions&&state.soundApplyOptions.replaceable===true);}
  function canTexture(item,library){return canImport(item,library)&&['image','video','image-sequence'].indexOf(kind(item))!==-1;}
  function unavailableReason(item,library){
    if(item.ambiguous)return '항목 ID가 중복되어 원본을 구분할 수 없습니다.';
    if(item.missing)return item.reason||'원본 파일을 찾을 수 없습니다.';
    if(item.importable===false)return item.reason||'이 항목을 가져올 수 없습니다.';
    if(kind(item)==='image-sequence'&&!canImport(item,library))return '현재 연결에서 이미지 시퀀스를 지원하지 않습니다.';
    return kinds.indexOf(kind(item))===-1?'지원하지 않는 파일 형식입니다.':'';
  }
  function toEntries(library,previous,retained){
    library=library||{};var folders=new Map(),items=new Map(),entries=[],routes=new Map();
    (library.folders||[]).forEach(function(folder){if(folder&&typeof folder.id==='string')folders.set(folder.id,folder);});
    (library.items||library.entries||[]).forEach(function(item){
      if(!item||typeof item.id!=='string'||!item.id.length||item.id.length>248||/[\x00-\x1f]/.test(item.id))throw new Error('사용자 라이브러리 ID가 올바르지 않습니다.');
      var copy=Object.assign({},item),prior=items.get(item.id);
      if(prior){
        var identity=function(value){return String(value.path||value.preview||'').replace(/\\/g,'/').toLowerCase()+'|'+kind(value);};
        if(identity(prior)!==identity(copy))prior.ambiguous=true;
      }else items.set(item.id,copy);
    });
    items.forEach(function(item){
      var folder=folders.get(item.folderId),relative=Array.isArray(item.relativeParts)?item.relativeParts.slice():String(item.category||'').split(/[\\/]/).filter(Boolean),
        category=['User Library'],keys=['@library'];
      if(item.folderId){category.push(folder&&folder.name||'등록 폴더');keys.push('folder:'+token(item.folderId));if(folder&&folder.missing)item.missing=true;}
      else {category.push(item.managed?'Saved Presets':'Local Items');keys.push(item.managed?'managed':'local');}
      relative.forEach(function(part,index){category.push(String(part));keys.push('dir:'+token(relative.slice(0,index+1).join('/')));});
      var route=keys.join(' / '),identity=String(item.folderId||'')+'|'+relative.join('/'),known=routes.get(route);
      if(route.length>500||(known!==undefined&&known!==identity))throw new Error('사용자 라이브러리 폴더 경로를 구분할 수 없습니다.');
      routes.set(route,identity);
      var id='library:'+item.id,available=canImport(item,library),reason=unavailableReason(item,library);
      entries.push({id:id,source:'library',name:item.name||item.id,category:category,categoryKeys:keys,libraryItem:item,availabilityReason:reason,favorite:false,
        defaultId:id,variants:[{id:id,name:names[kind(item)]||kind(item),type:'library',available:available}]});
    });
    var keep=new Set(retained||[]),present=new Set(entries.map(function(entry){return entry.id;}));
    (previous||[]).forEach(function(entry){
      if(entry.source!=='library'||!keep.has(entry.id)||present.has(entry.id))return;
      var missing=Object.assign({},entry,{libraryItem:Object.assign({},entry.libraryItem,{missing:true,reason:'원본 파일을 찾을 수 없습니다. 폴더 등록과 경로를 확인하세요.'}),availabilityReason:'원본 파일을 찾을 수 없습니다. 폴더 등록과 경로를 확인하세요.'});
      missing.variants=entry.variants.map(function(variant){return Object.assign({},variant,{available:false});});entries.push(missing);
    });
    return entries;
  }
  function mediaSource(item){
    if(!item||item.missing||item.ambiguous)return null;
    var source=typeof item.preview==='string'&&item.preview?item.preview:item.path;
    if(typeof source!=='string'||!source||/[\x00-\x1f]/.test(source))return null;
    source=source.replace(/\\/g,'/');
    if(/^[a-z]:\//i.test(source))return 'file:///'+source.split('/').map(function(part,index){return index?encodeURIComponent(part):part;}).join('/');
    if(/^\/\/[^/]+\//.test(source)){var parts=source.slice(2).split('/'),host=parts.shift();return 'file://'+host+'/'+parts.map(encodeURIComponent).join('/');}
    if(/^file:/i.test(source)){try{var uri=new URL(source);return uri.protocol==='file:'?uri.href:null;}catch(ignore){return null;}}
    if(/^[a-z][a-z0-9+.-]*:|^\//i.test(source))return null;
    try{if(source.split('/').some(function(part){var decoded=decodeURIComponent(part);return !part||decoded==='.'||decoded==='..'||/[\\/]/.test(decoded);} ))return null;}catch(ignore){return null;}
    return source;
  }
  function previewKind(item){var type=kind(item);return type==='image-sequence'?'image':['image','video','audio'].indexOf(type)!==-1?type:null;}
  function node(tag,cls,text){var result=document.createElement(tag);if(cls)result.className=cls;if(text!=null)result.textContent=text;return result;}
  function mountPreview(root,item,options){
    if(options&&options.thumbnails&&!options.controls&&['video','image-sequence','preset','animation-preset','project'].indexOf(kind(item))!==-1)return mountGenerated(root,item,options.thumbnails);
    options=options||{};var type=previewKind(item),source=mediaSource(item),media=null,observer=null,active=true,visible=true,destroyed=false,suspended=false,resumeTime=0,restoreTime=false;
    root.dataset.previewState='none';
    function release(){if(!media)return;var old=media;media=null;old.onerror=old.onload=old.onloadeddata=old.oncanplay=old.onprogress=old.onseeked=null;if(old.pause){old.pause();old.removeAttribute('src');old.load();}else old.removeAttribute('src');old.remove();}
    function message(text,state){release();root.textContent='';root.dataset.previewState=state;root.appendChild(node('span','preview-message',text));}
    function suspend(){
      if(!media||!media.pause||suspended)return;
      if(media.readyState>0&&Number.isFinite(media.currentTime))resumeTime=media.currentTime;
      suspended=true;media.pause();media.removeAttribute('src');media.load();root.dataset.previewState='suspended';
    }
    function playback(){
      if(!media||!media.pause||destroyed)return;
      if(!active||!visible){suspend();return;}
      if(suspended){suspended=false;restoreTime=true;root.dataset.previewState='loading';media.preload='auto';media.src=source;media.load();}
      if(type==='video'&&!options.controls&&!restoreTime&&!media.seeking&&media.readyState>=2){var play=media.play();if(play&&play.catch)play.catch(function(){});}
    }
    if(!source||!type||item.missing||item.ambiguous)message(item.missing?'원본 파일을 찾을 수 없습니다.':'이 항목은 영상 미리보기가 없습니다.','unavailable');
    else if(type==='audio'&&!options.controls){var icon=node('span','library-audio-symbol','♪');icon.title='크게 미리보기에서 오디오 파일을 재생할 수 있습니다.';root.appendChild(icon);root.dataset.previewState='unverified';}
    else {
      media=node(type==='image'?'img':type);media.setAttribute('aria-label',item.name||'미디어 미리보기');
      if(type==='image'){media.alt=item.name||'미디어';media.loading='lazy';media.onload=function(){if(!destroyed)root.dataset.previewState='ready';};}
      else {
        media.preload='metadata';media.controls=!!options.controls;media.muted=type==='video';media.loop=!options.controls;media.playsInline=true;
        function ready(){
          if(destroyed||suspended||media.readyState<2)return;
          if(restoreTime){
            var end=Number.isFinite(media.duration)?Math.max(0,media.duration-.001):resumeTime,target=Math.min(resumeTime,end),seekable=target===0;
            for(var i=0;i<media.seekable.length;i++)if(media.seekable.start(i)<=target&&media.seekable.end(i)>=target)seekable=true;
            if(!seekable&&media.readyState<4)return;
            restoreTime=false;
            if(seekable){media.currentTime=target;root.dataset.resumeState='restored';}
            else {root.dataset.resumeState='restarted';media.title='이 영상은 위치 탐색을 지원하지 않아 처음부터 재생합니다.';}
          }
          root.dataset.previewState='ready';playback();
        }
        media.onloadeddata=media.oncanplay=media.onprogress=media.onseeked=ready;
      }
      media.onerror=function(){if(!destroyed&&!suspended)message('미리보기를 불러오지 못했습니다.','failed');};
      media.src=source;root.dataset.previewState='loading';root.appendChild(media);
      if(type==='video'&&!options.controls&&typeof IntersectionObserver!=='undefined'){
        observer=new IntersectionObserver(function(changes){if(destroyed)return;changes.forEach(function(change){visible=change.isIntersecting;playback();});});observer.observe(root);
      }
    }
    return {setActive:function(value){active=!!value;playback();},destroy:function(){if(destroyed)return;destroyed=true;if(observer)observer.disconnect();release();root.textContent='';}};
  }
  function choosePreviewComposition(value){
    var context=JSON.parse(JSON.stringify(value||{})),seen=new Set();
    if(!/^[a-f0-9]{64}$/.test(context.sourceSha256)||!/^[a-f0-9]{64}$/.test(context.manifestSha256)||!Array.isArray(context.choices)||!context.choices.length||context.choices.length>32)throw new Error('미리보기 선택 정보가 변경되었습니다. 라이브러리를 새로고침하세요.');
    context.choices.forEach(function(row){if(!row||typeof row.token!=='string'||!/^[a-f0-9]{64}$/.test(row.token)||seen.has(row.token)||typeof row.name!=='string'||!row.name||row.name.length>4096||!Number.isInteger(row.ordinal)||row.ordinal<1||!Number.isInteger(row.width)||!Number.isInteger(row.height)||row.width<1||row.height<1||row.width>1920||row.height>1920||row.width*row.height>2073600||typeof row.duration!=='number'||!Number.isFinite(row.duration)||row.duration<=0)throw new Error('미리보기 컴포지션 정보를 확인하세요.');seen.add(row.token);});
    if(context.token!==undefined&&!seen.has(context.token))throw new Error('선택한 컴포지션이 변경되었습니다.');
    var dialog=node('dialog','library-composition-dialog'),title=node('h2','','미리보기 컴포지션'),help=node('p','','이 선택은 미리보기에만 사용됩니다.'),select=node('select','composition-preview-choice'),confirm=node('button','','미리보기 생성'),cancel=node('button','','취소'),previous=document.activeElement,closed=false,resolve;
    select.setAttribute('aria-label','미리보기 컴포지션');var blank=node('option','','컴포지션을 선택하세요');blank.value='';select.appendChild(blank);
    context.choices.forEach(function(row){var option=node('option','',row.name+' · #'+row.ordinal+' · '+row.width+' × '+row.height+' · '+row.duration.toFixed(2)+'초');option.value=row.token;select.appendChild(option);});
    select.value=context.token||'';confirm.disabled=!seen.has(select.value);select.onchange=function(){confirm.disabled=!seen.has(select.value);};
    var promise=new Promise(function(done){resolve=done;});
    function finish(selection){if(closed)return;closed=true;dialog.removeEventListener('cancel',escape);dialog.removeEventListener('close',close);document.removeEventListener('visibilitychange',visibility);try{if(dialog.open)dialog.close();}finally{dialog.remove();if(previous&&previous.isConnected&&typeof previous.focus==='function')previous.focus();resolve(selection);}}
    function escape(event){event.preventDefault();finish(null);}function close(){finish(null);}function visibility(){if(document.hidden)finish(null);}
    confirm.onclick=function(){if(closed||!seen.has(select.value))return;finish({sourceSha256:context.sourceSha256,manifestSha256:context.manifestSha256,token:select.value});};cancel.onclick=function(){finish(null);};
    dialog.append(title,help,select,confirm,cancel);document.body.appendChild(dialog);dialog.addEventListener('cancel',escape);dialog.addEventListener('close',close);document.addEventListener('visibilitychange',visibility);try{dialog.showModal();select.focus();}catch(e){finish(null);throw e;}return{promise:promise,close:function(){finish(null);}};
  }
  function mountGenerated(root,item,manager){
    var destroyed=false,active=true,sprite=null,artifactKey=null,demand=null,expectedKey=null,serial=0,picker=null,choiceNode=null,choiceSerial=-1,choiceSignature=null;
    function request(options){
      if(destroyed)return Promise.resolve({state:'canceled'});
      var current=++serial;if(picker){picker.close();picker=null;}var next=manager.acquire?manager.acquire(item,options):null,old=demand;demand=next;expectedKey=next&&next.requestKey||null;
      if(old)old.release();
      return(next?next.promise:manager.request(item,options)).then(function(value){if(current===serial){if(value.requestKey)expectedKey=value.requestKey;update(value);}return value;});
    }
    function choiceButton(context){
      var signature=JSON.stringify(context);if(choiceNode&&choiceSerial===serial&&choiceSignature===signature)return;if(choiceNode)choiceNode.remove();choiceSerial=serial;choiceSignature=signature;var buttonSerial=serial,buttonSource=JSON.stringify([item.id,item.sourceStamp]),button=node('button','thumbnail-choose','컴포지션 선택');button.onclick=function(event){event.stopPropagation();if(destroyed||picker||button!==choiceNode||buttonSerial!==serial||buttonSource!==JSON.stringify([item.id,item.sourceStamp]))return;var captured=serial,source=JSON.stringify([item.id,item.sourceStamp]),generation=manager.generation;try{picker=choosePreviewComposition(context);var ownedPicker=picker;picker.promise.then(function(selection){if(picker===ownedPicker)picker=null;if(!selection||destroyed||captured!==serial||source!==JSON.stringify([item.id,item.sourceStamp]))return;request({workerSelection:selection,expectedGeneration:generation});});}catch(e){picker=null;update({id:item.id,state:'failed',requestKey:expectedKey,error:{message:e.message}});}};choiceNode=button;root.appendChild(button);
    }
    function update(value){
      if(destroyed||value.id&&value.id!==item.id||expectedKey&&value.requestKey&&value.requestKey!==expectedKey)return;
      if(value.state==='ready'&&value.artifact){var key=(value.artifact.sha256||value.artifact.url)+'|'+(value.artifact.selection&&value.artifact.selection.token||'');if(sprite&&key===artifactKey&&root.dataset.previewState!=='failed'){if(value.artifact.selection)choiceButton(value.artifact.selection);else if(choiceNode){choiceNode.remove();choiceNode=null;choiceSerial=-1;choiceSignature=null;}if(sprite.ready===true)root.dataset.previewState='ready';return;}if(sprite)sprite.destroy();choiceNode=null;artifactKey=key;sprite=scope.ContentriumThumbnails.mountSprite(root,value.artifact);sprite.setActive(active);if(value.artifact.selection)choiceButton(value.artifact.selection);return;}
      if(sprite&&value.state==='needs-selection'&&value.selection){choiceButton(value.selection);if(sprite.ready===true)root.dataset.previewState='ready';return;}
      if(sprite&&(value.state==='waiting'||value.state==='generating')){root.dataset.previewState='validating';return;}
      if(sprite){sprite.destroy();sprite=null;artifactKey=null;}
      choiceNode=null;root.textContent='';root.dataset.previewState=value.state;
      var labels={waiting:'미리보기 생성 대기',generating:'미리보기 생성 중','needs-selection':'미리보기 컴포지션을 선택하세요.',canceled:'미리보기 생성 취소됨',failed:'미리보기 생성 실패',unavailable:'현재 컴포지션으로 미리보기를 만들 수 있습니다.'};
      root.appendChild(node('span','preview-message',value.error?value.error.message:labels[value.state]||'미리보기 준비 중'));
      if(value.state==='needs-selection'&&value.selection)choiceButton(value.selection);
      if((value.state==='failed'||value.state==='canceled')&&!(value.error&&value.error.nativeState==='unknown')){var retry=node('button','thumbnail-retry','다시 시도');retry.onclick=function(event){event.stopPropagation();request({resetWorkerChoice:true});};root.appendChild(retry);}
    }
    var unsubscribe=manager.subscribe(update);request();
    return{selectPreviewComposition:function(){if(destroyed||!manager.canSelectPreview||!manager.canSelectPreview(item))return Promise.resolve({state:'unavailable'});var generation=manager.generation,pending=request({selectPreview:true,expectedGeneration:generation}),ownedSerial=serial;return pending.then(function(value){if(!destroyed&&ownedSerial===serial&&generation===manager.generation&&value.state==='needs-selection'&&choiceNode)choiceNode.onclick({stopPropagation:function(){}});return value;});},revalidate:function(value){item=value;return request({revalidate:true});},setActive:function(value){active=!!value;if(sprite)sprite.setActive(active);},destroy:function(){destroyed=true;serial++;if(picker){picker.close();picker=null;}unsubscribe();if(demand)demand.release();if(sprite)sprite.destroy();root.textContent='';}};
  }
  function openPreview(item,options){
    options=options||{};
    var dialog=node('dialog','library-preview-dialog'),title=node('h2','',item.name||'미리보기'),body=node('div','library-large-media'),close=node('button','','미리보기 닫기');
    var playable=['video','audio'].indexOf(previewKind(item))!==-1;
    dialog.append(title,body,close);document.body.appendChild(dialog);var preview=options.artifact&&!playable&&!item.missing&&!item.ambiguous?scope.ContentriumThumbnails.mountSprite(body,options.artifact):mountPreview(body,item,{controls:true}),closed=false;
    function finish(){if(closed)return;closed=true;preview.destroy();dialog.remove();document.removeEventListener('visibilitychange',activity);scope.removeEventListener('blur',pause);scope.removeEventListener('focus',resume);if(options.onClose)options.onClose();}
    function pause(){preview.setActive(false);}
    function resume(){if(!document.hidden)preview.setActive(true);}
    function activity(){if(document.hidden)dialog.close();}
    close.onclick=function(){dialog.close();};dialog.addEventListener('close',finish);document.addEventListener('visibilitychange',activity);scope.addEventListener('blur',pause);scope.addEventListener('focus',resume);dialog.showModal();
    return {itemId:item.id,close:function(){if(!closed)dialog.close();}};
  }
  var api={toEntries:toEntries,categoryParts:categoryParts,folderPaths:folderPaths,canImport:canImport,canReplace:canReplace,canReplaceSelection:canReplaceSelection,canTexture:canTexture,mediaSource:mediaSource,previewKind:previewKind,mountPreview:mountPreview,choosePreviewComposition:choosePreviewComposition,openPreview:openPreview};
  scope.ContentriumLibrary=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
