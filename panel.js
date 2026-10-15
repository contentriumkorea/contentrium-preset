(function(scope){
  'use strict';
  var STORAGE='contentrium-preset.ui.v1';
  function normalizeCatalog(value){
    var entries=Array.isArray(value)?value:(value&&value.entries);
    if(!Array.isArray(entries))throw new Error('프리셋 목록의 entries 배열이 필요합니다.');
    var ids=new Set();
    return entries.map(function(entry){
      if(!entry||!entry.id||ids.has(String(entry.id)))throw new Error('프리셋 ID가 없거나 중복되었습니다.');
      ids.add(String(entry.id));
      var category=Array.isArray(entry.category)?entry.category.slice():String(entry.category||'').split(' / ').filter(Boolean);
      var variants=Array.isArray(entry.variants)?entry.variants:[];
      if(!variants.length)throw new Error('변형 목록이 없습니다: '+entry.name);
      return Object.assign({},entry,{id:String(entry.id),category:category,variants:variants.map(function(v){return Object.assign({},v,{id:String(v.id)});})});
    });
  }
  function categoryKey(parts){return parts.join(' / ');}
  function buildCategoryTree(entries){
    var root={key:'',name:'All items',parts:[],children:[],count:entries.length};
    entries.forEach(function(entry){var node=root;entry.category.forEach(function(name,index){var parts=entry.category.slice(0,index+1),key=categoryKey(parts),child=node.children.find(function(n){return n.key===key;});if(!child){child={key:key,name:name,parts:parts,children:[],count:0};node.children.push(child);}child.count++;node=child;});});
    return root;
  }
  function filterEntries(entries,category,query,favoritesOnly,favorites){
    var words=String(query||'').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return entries.filter(function(e){var key=categoryKey(e.category),text=[e.name,key].concat(e.variants.map(function(v){return v.name||'';})).join(' ').toLocaleLowerCase();return(!category||key===category||key.indexOf(category+' / ')===0)&&(!favoritesOnly||favorites.has(e.id))&&words.every(function(w){return text.indexOf(w)!==-1;});});
  }
  function resolvePreview(relative){
    if(typeof relative!=='string'||!relative)return null;
    var clean=relative.replace(/\\/g,'/');
    if(/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(clean)||clean.split('/').indexOf('..')!==-1)throw new Error('프리뷰는 라이브러리의 상대 경로여야 합니다.');
    return clean.split('/').map(function(p){return encodeURIComponent(p);}).join('/');
  }
  function hostScript(method,payload,extensionRoot){
    if(!/^[a-zA-Z][a-zA-Z0-9]*$/.test(method))throw new Error('잘못된 엔진 명령입니다.');
    var call='$.contentriumPreset.call('+JSON.stringify(method)+','+JSON.stringify(JSON.stringify(payload||{}))+')';
    if(!extensionRoot)return call;
    return '(function(){var root=new Folder('+JSON.stringify(extensionRoot)+').fsName;if(typeof $.contentriumPreset!=="object"||$.contentriumPreset.root!==root)$.evalFile(new File(root+"/jsx/engine.jsx"));return '+call+';})()';
  }
  function parseHostResult(raw){
    if(!raw||raw==='EvalScript error.')throw new Error('Contentrium Preset을 읽지 못했습니다. AE에서 패널을 다시 열어주세요.');
    var response;try{response=JSON.parse(raw);}catch(e){throw new Error('Contentrium Preset 응답이 올바르지 않습니다.');}
    if(!response||response.ok!==true)throw new Error(response&&response.error?(response.error.message||String(response.error)):'Contentrium Preset 요청이 실패했습니다.');
    return response.result;
  }
  function callHost(method,payload){
    return new Promise(function(resolve,reject){
      if(!scope.__adobe_cep__||typeof scope.__adobe_cep__.evalScript!=='function')return reject(new Error('AE 연결이 없습니다. After Effects에서 Contentrium Preset를 열어주세요.'));
      var script=hostScript(method,payload,scope.__adobe_cep__.getSystemPath('extension'));
      var timer=setTimeout(function(){reject(new Error('AE 응답 시간이 초과되었습니다. 작업 상태를 확인하세요.'));},60000);
      scope.__adobe_cep__.evalScript(script,function(raw){clearTimeout(timer);try{resolve(parseHostResult(raw));}catch(error){reject(error);}});
    });
  }
  function variantType(variant){return Number(variant.type!=null?variant.type:(variant.item&&variant.item.type));}
  function defaultVariant(entry,selected){return entry.variants.find(function(v){return v.id===selected;})||entry.variants.find(function(v){return v.id===String(entry.defaultId);})||entry.variants[0];}
  function selectVariant(state,entry,variantId){
    var selected=Object.assign({},state.selectedVariants),variant=variantId==null?defaultVariant(entry,selected[entry.id]):entry.variants.find(function(v){return v.id===String(variantId);});
    if(!variant)throw new Error('이 프리셋에 없는 변형입니다.');
    selected[entry.id]=variant.id;
    return Object.assign({},state,{selectedId:entry.id,selectedVariants:selected,variantsOpen:entry.variants.length>1?entry.id:null,allVariantsId:state.allVariantsId===entry.id?entry.id:null});
  }
  function variantViewItems(entries,state){
    var group=entries.find(function(e){return e.id===state.allVariantsId;});
    if(group)return group.variants.map(function(v){return{entry:group,variant:v,isVariant:true,selected:state.selectedId===group.id&&defaultVariant(group,state.selectedVariants[group.id]).id===v.id};});
    return entries.map(function(e){return{entry:e,variant:defaultVariant(e,state.selectedVariants[e.id]),isVariant:false,selected:state.selectedId===e.id};});
  }
  function selectionPayload(entries,state,direction){
    if(['in','out','both'].indexOf(direction)===-1)throw new Error('지원하지 않는 적용 방향입니다.');
    var entry=entries.find(function(e){return e.id===state.selectedId;});if(!entry)throw new Error('프리셋을 선택하세요.');
    var variant=defaultVariant(entry,state.selectedVariants[entry.id]);if(variant.available!==true)throw new Error('이 변형은 애니메이션 준비 중입니다.');
    return{variantId:variant.id,direction:direction};
  }
  function normalizeControlType(control){
    var type=String(control.type||'').toLowerCase();
    if(type==='oned'){
      if(String(control.name||'').toLowerCase()==='enabled'&&(control.value===0||control.value===1))return 'checkbox';
      if(control.kind==='timing')return 'time';
      return Number.isFinite(control.min)&&Number.isFinite(control.max)?'slider':'number';
    }
    if(['twod','twod_spatial','threed','threed_spatial'].indexOf(type)!==-1)return 'point';
    return type;
  }
  function checkboxValue(control,checked){return typeof control.value==='number'?(checked?1:0):!!checked;}
  function audioDetails(value){var data=value||{},audio=data.audio||{};return{root:audio.root||data.audioRoot||'',missing:Array.from(new Set((audio.missing||data.missingAudio||[]).filter(function(key){return typeof key==='string'&&key.length;})))};}
  function audioLibraryExample(keys){var assets={};(keys.length?keys:['transition-basic-05']).forEach(function(key){if(!/^[a-z0-9-]+$/.test(key))throw new Error('올바르지 않은 오디오 키입니다.');assets[key]=key+'.wav';});return JSON.stringify({schemaVersion:1,assets:assets},null,2);}
  function applyFeedback(result){var details=audioDetails(result),warnings=(result&&result.warnings||[]).map(String).filter(function(message){return message.indexOf('Local sound assets unavailable:')!==0||!details.missing.length;});return{text:(details.missing.length?'영상 효과를 적용했습니다. 효과음 '+details.missing.length+'개가 등록되지 않았습니다. 개인 오디오 안내를 확인하세요.':'Contentrium Preset에서 적용을 완료했습니다.')+(warnings.length?' '+warnings.join(' '):''),tone:details.missing.length||warnings.length?'warning':'',missingAudio:details.missing};}
  var api={normalizeCatalog:normalizeCatalog,buildCategoryTree:buildCategoryTree,filterEntries:filterEntries,resolvePreview:resolvePreview,hostScript:hostScript,parseHostResult:parseHostResult,callHost:callHost,variantType:variantType,defaultVariant:defaultVariant,selectVariant:selectVariant,variantViewItems:variantViewItems,selectionPayload:selectionPayload,normalizeControlType:normalizeControlType,checkboxValue:checkboxValue,audioDetails:audioDetails,audioLibraryExample:audioLibraryExample,applyFeedback:applyFeedback};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  scope.ContentriumUI=api;
  if(typeof document==='undefined')return;
  document.addEventListener('DOMContentLoaded',boot);
  function boot(){
    var entries=[],category='',query='',favoritesOnly=false,favorites=new Set(),expanded=new Set(),selectedVariants={},selectedId=null,variantsOpen=null,allVariantsId=null,lastCardClick=null,lastMissingAudio=[],busy=false,connected=false,hostInfo=null,layerState=null,currentTab='browse',persisted={};
    var $=function(id){return document.getElementById(id);};
    function element(tag,classes,text){var node=document.createElement(tag);if(classes)node.className=classes;if(text!==undefined)node.textContent=text;return node;}
    function status(message,type){$('status').textContent=message;$('status').className='status-bar'+(type?' '+type:'');}
    function saveUI(){try{persisted={favorites:Array.from(favorites),expanded:Array.from(expanded),selectedVariants:selectedVariants,category:category,gridSize:$('thumbnail-size').value,treeWidth:document.documentElement.style.getPropertyValue('--tree-width')};localStorage.setItem(STORAGE,JSON.stringify(persisted));}catch(error){status('패널 설정을 저장하지 못했습니다. '+error.message,'error');}}
    try{persisted=JSON.parse(localStorage.getItem(STORAGE)||'{}')||{};}catch(error){persisted={};}
    category=persisted.category||'';selectedVariants=persisted.selectedVariants||{};
    if(persisted.gridSize){$('thumbnail-size').value=persisted.gridSize;document.documentElement.style.setProperty('--card-width',Number(persisted.gridSize)+'px');}
    if(persisted.treeWidth&&/^\d+px$/.test(persisted.treeWidth))document.documentElement.style.setProperty('--tree-width',persisted.treeWidth);
    function activeEntry(){return entries.find(function(e){return e.id===selectedId;})||null;}
    function activeVariant(){var entry=activeEntry();return entry?defaultVariant(entry,selectedVariants[entry.id]):null;}
    function selectionState(){return{selectedId:selectedId,selectedVariants:selectedVariants,variantsOpen:variantsOpen,allVariantsId:allVariantsId};}
    function choose(entry,variant){var state=selectVariant(selectionState(),entry,variant&&variant.id),focused=document.activeElement,refocus=focused&&focused.classList.contains('preset-card');selectedId=state.selectedId;selectedVariants=state.selectedVariants;variantsOpen=state.variantsOpen;allVariantsId=state.allVariantsId;saveUI();renderGrid();renderFooter();if(refocus){var card=Array.from($('preset-grid').querySelectorAll('.preset-card')).find(function(c){return c.dataset.entryId===entry.id&&c.dataset.variantId===selectedVariants[entry.id];});if(card)card.focus();}}
    function selectTab(tab){currentTab=tab;$('browse-view').classList.toggle('hidden',tab!=='browse');$('edit-view').classList.toggle('hidden',tab!=='edit');['browse','edit'].forEach(function(t){$(t+'-tab').classList.toggle('active',t===tab);$(t+'-tab').setAttribute('aria-selected',String(t===tab));});if(tab==='edit')refreshState();}
    function toggleFavorite(entry){favorites.has(entry.id)?favorites.delete(entry.id):favorites.add(entry.id);saveUI();renderTree();renderGrid();renderFooter();}
    function renderTree(){
      var tree=buildCategoryTree(entries),target=$('category-tree');target.textContent='';
      function row(node,depth){
        var r=element('div','category-row'+(category===node.key?' selected':''));r.style.paddingLeft=(6+depth*12)+'px';r.setAttribute('role','treeitem');r.setAttribute('aria-level',String(depth+1));r.setAttribute('aria-selected',String(category===node.key));r.tabIndex=0;
        var expand=element('button','expand',node.children.length?(expanded.has(node.key)?'▼':'▶'):'');expand.type='button';expand.setAttribute('aria-label',node.name+' 펼침');expand.onclick=function(event){event.stopPropagation();expanded.has(node.key)?expanded.delete(node.key):expanded.add(node.key);saveUI();renderTree();};
        if(node.children.length)r.setAttribute('aria-expanded',String(expanded.has(node.key)));else expand.disabled=true;
        r.appendChild(expand);r.appendChild(element('span','folder-icon',node.key?'▱':'▤'));r.appendChild(element('span','category-name',node.name));r.appendChild(element('span','category-count',String(node.count)));
        r.onclick=function(){category=node.key;allVariantsId=null;saveUI();renderTree();renderGrid();};r.onkeydown=function(event){if(event.key==='Enter'){r.click();event.preventDefault();}else if(event.key==='ArrowRight'&&node.children.length){expanded.add(node.key);saveUI();renderTree();}else if(event.key==='ArrowLeft'){expanded.delete(node.key);saveUI();renderTree();}};
        target.appendChild(r);if(expanded.has(node.key)||!node.key)node.children.forEach(function(c){row(c,depth+1);});
      }
      row(tree,0);$('library-count').textContent=entries.length+' presets · '+entries.reduce(function(n,e){return n+e.variants.length;},0)+' variants';
    }
    function renderGrid(){
      var list=$('preset-grid');if(scope.ContentriumPreview)scope.ContentriumPreview.clear();list.textContent='';var visible=filterEntries(entries,category,query,favoritesOnly,favorites);
      $('breadcrumbs').textContent=(favoritesOnly?'★ Favorites / ':'')+(category||'All items')+(query?' / “'+query+'”':'')+' · '+visible.length;
      var group=visible.find(function(e){return e.id===allVariantsId;});$('variants-back').classList.toggle('hidden',!group);if(group)$('breadcrumbs').textContent=group.name+' · '+group.variants.length+' variants';
      if(!visible.length){list.appendChild(element('div','empty',entries.length?'No results found.':'등록된 프리셋이 없습니다.'));return;}
      variantViewItems(visible,selectionState()).forEach(function(view,index){
        var entry=view.entry,variant=view.variant,card=element('article','preset-card'+(view.selected?' selected':''));card.setAttribute('role','listitem');card.tabIndex=0;card.dataset.entryId=entry.id;card.dataset.variantId=variant.id;card.setAttribute('aria-label',entry.name+' · '+(variant.name||variant.id));
        var wrap=element('div','preview-wrap'),source=null;
        try{source=resolvePreview(variant.preview);}catch(error){wrap.appendChild(element('span','preview-message',error.message));}
        if(scope.ContentriumPreview){scope.ContentriumPreview.mount(wrap,entry,variant);}else wrap.appendChild(element('span','preview-message','Preview unavailable'));
        if(variant.available!==true)wrap.appendChild(element('span','preview-badge','준비 중'));
        card.appendChild(wrap);var label=element('div','card-label'),type=variantType(variant);label.appendChild(element('span','preset-type',type===1?'↦':type===3?'◆':'▧'));var name=element('span','preset-name',view.isVariant?(variant.name||variant.id):entry.name);name.title=entry.name+' · '+(variant.name||variant.id);label.appendChild(name);
        if(entry.variants.length>1&&!view.isVariant){var menuButton=element('button','variant-button','≡');menuButton.title='변형 '+entry.variants.length+'개';menuButton.setAttribute('aria-label',entry.name+' 변형 선택');menuButton.setAttribute('aria-expanded',String(variantsOpen===entry.id));menuButton.onclick=function(event){event.stopPropagation();if(selectedId===entry.id&&variantsOpen===entry.id){variantsOpen=null;renderGrid();}else choose(entry);};label.appendChild(menuButton);}
        var star=element('button','card-star'+(favorites.has(entry.id)?' active':''),'★');star.title=favorites.has(entry.id)?'즐겨찾기 해제':'즐겨찾기 저장';star.setAttribute('aria-pressed',String(favorites.has(entry.id)));star.setAttribute('aria-label',entry.name+' '+star.title);star.onclick=function(event){event.stopPropagation();toggleFavorite(entry);};label.appendChild(star);card.appendChild(label);
        card.onclick=function(event){var key=entry.id+'/'+variant.id,now=Date.now(),twice=lastCardClick&&lastCardClick.key===key&&now-lastCardClick.time<400;lastCardClick=twice?null:{key:key,time:now};choose(entry,variant);if(twice&&event.detail!==0)apply('both');};card.onkeydown=function(event){if(event.target!==card)return;if(event.key==='Enter'){choose(entry,variant);event.preventDefault();}else if(event.key==='ArrowRight'||event.key==='ArrowLeft'){var buttons=Array.from(list.querySelectorAll('.preset-card')),next=buttons[index+(event.key==='ArrowRight'?1:-1)];if(next){next.focus();next.click();event.preventDefault();}}};
        if(variantsOpen===entry.id&&!view.isVariant){var menu=element('div','inline-variants');menu.setAttribute('role','group');menu.setAttribute('aria-label',entry.name+' variants');entry.variants.forEach(function(v){var item=element('button','variant-row'+(v.id===variant.id?' active':''),v.name||v.id);item.dataset.variantId=v.id;item.setAttribute('aria-label',v.name||v.id);item.setAttribute('aria-pressed',String(v.id===variant.id));if(v.available!==true)item.appendChild(element('span','variant-state','준비 중'));item.onclick=function(event){event.stopPropagation();lastCardClick=null;choose(entry,v);};menu.appendChild(item);});var all=element('button','view-all-variants','View all at once');all.onclick=function(event){event.stopPropagation();lastCardClick=null;allVariantsId=entry.id;renderGrid();};menu.appendChild(all);card.appendChild(menu);}
        list.appendChild(card);
      });
    }
    function renderFooter(){
      var entry=activeEntry(),variant=activeVariant(),actions=$('apply-actions');actions.textContent='';$('selection-label').textContent=entry?entry.name:'프리셋을 선택하세요.';
      $('variant-summary').textContent=variant?(variant.name||'')+(variant.available===true?'':' · 애니메이션 준비 중'):'';
      if(!variant)return;
      var transition=variantType(variant)===1;
      if(transition)actions.appendChild(element('span','', 'Animate:'));
      (transition?[['In','in'],['Out','out'],['Both','both']]:[['Apply','both']]).forEach(function(pair){var button=element('button','apply-button',pair[0]);button.disabled=busy||variant.available!==true;button.title=variant.available===true?'선택 레이어에 프리셋 적용':'이 변형은 애니메이션 준비 중입니다.';button.onclick=function(){apply(pair[1]);};actions.appendChild(button);});
    }
    function operation(message,action,onDone){
      if(busy)return Promise.reject(new Error('진행 중인 AE 작업이 있습니다.'));busy=true;renderFooter();status(message,'busy');
      return Promise.resolve().then(action).then(function(result){if(onDone)onDone(result);return result;}).catch(function(error){status(error.message||String(error),'error');throw error;}).finally(function(){busy=false;renderFooter();});
    }
    function apply(direction){
      var payload;try{payload=selectionPayload(entries,selectionState(),direction);}catch(error){status(error.message,'error');return;}
      operation('프리셋을 적용하는 중…',function(){return callHost('applyPreset',payload);},function(result){var feedback=applyFeedback(result);lastMissingAudio=feedback.missingAudio;status(feedback.text,feedback.tone);renderAudioNotice();refreshState();}).catch(function(){});
    }
    function currentAudio(){return layerState&&layerState.audio?audioDetails(layerState):{missing:lastMissingAudio,root:hostInfo&&hostInfo.audioRoot||''};}
    function renderAudioNotice(){var details=currentAudio(),banner=$('audio-notice');banner.classList.toggle('hidden',!details.missing.length);$('audio-notice-text').textContent=details.missing.length?'이 인스턴스에 효과음 '+details.missing.length+'개가 연결되지 않았습니다.':'';$('audio-open').classList.toggle('audio-missing',!!details.missing.length);}
    function showAudioGuide(){var details=currentAudio(),root=details.root||hostInfo&&hostInfo.audioRoot||'%APPDATA%\\Contentrium\\Preset\\UserAudio';$('audio-folder').value=root;$('audio-missing-keys').textContent=details.missing.length?'등록되지 않은 키: '+details.missing.join(', '):'효과음 파일은 설치 패키지에 포함되지 않습니다.';$('audio-example').value=audioLibraryExample(details.missing);$('audio-dialog').showModal();}
    function optionList(control){return(control.options||[]).map(function(option,index){return typeof option==='object'?{value:option.value!=null?option.value:(option.id!=null?option.id:index),label:option.label||option.name||String(option.value)}:{value:typeof control.value==='number'?index:String(option),label:String(option)};});}
    function renderEditor(){
      renderAudioNotice();
      var state=layerState;$('selected-layer').textContent=state?(state.numSelectedLayers===1?state.selectedLayerName:state.numSelectedLayers+' layers selected'):'레이어 선택 상태를 확인하려면 AE에서 패널을 열어주세요.';
      $('capture').disabled=!connected||busy||!(hostInfo&&hostInfo.capabilities&&hostInfo.capabilities.captureUserPreset)||!state||!state.numSelectedLayers;
      var applied=$('applied-presets');applied.textContent='';(state&&state.applied||[]).forEach(function(p){var row=element('div','applied-row');row.appendChild(element('span','',typeof p==='string'?p:(p.name||p.variantId||p.id)));var button=element('button','', 'Remove');button.disabled=busy;button.onclick=function(){operation('프리셋을 제거하는 중…',function(){return callHost('removePreset',{id:p.id,variantId:p.variantId});},function(){status('Contentrium Preset에서 프리셋을 제거했습니다.');refreshState();}).catch(function(){});};row.appendChild(button);applied.appendChild(row);});
      var controls=$('editor-controls');controls.textContent='';
      if(!state||!state.numSelectedLayers){controls.appendChild(element('div','editor-empty',connected?'컴포지션에서 레이어를 선택하세요.':'Browse의 검색·즐겨찾기·프리뷰는 브라우저에서도 사용할 수 있습니다.\n레이어 편집은 After Effects에서 가능합니다.'));return;}
      if(!(state.controls||[]).length){controls.appendChild(element('div','editor-empty','이 선택에는 편집할 프리셋 control이 없습니다.'));return;}
      var previousGroup=null;
      state.controls.forEach(function(control){
        if(control.group&&control.group!==previousGroup){controls.appendChild(element('div','control-section',control.group));previousGroup=control.group;}
        var row=element('div','control-row'),label=element('label','',control.name),fields=element('div','control-fields');row.appendChild(label);row.appendChild(fields);controls.appendChild(row);var type=normalizeControlType(control),fieldId='control-'+String(control.id).replace(/[^a-z0-9_-]/gi,'_');label.htmlFor=fieldId;
        function commit(value){operation('선택 레이어 속성을 변경하는 중…',function(){return callHost('setControl',{id:control.id,value:value});},function(){status(control.name+' 값을 변경했습니다.');refreshState();}).catch(function(){});}
        function input(kind,value){var field=element('input');field.type=kind;field.id=fields.children.length?fieldId+'-'+fields.children.length:fieldId;field.setAttribute('aria-label',control.name);field.value=value;field.disabled=busy||control.disabled===true;fields.appendChild(field);return field;}
        if(['slider','number','angle','time','pitch shift'].indexOf(type)!==-1){var value=Number(control.value);if(!Number.isFinite(value)){fields.appendChild(element('span','unknown-control','값을 읽지 못했습니다.'));return;}var numeric=input('number',value);if(control.min!=null)numeric.min=control.min;if(control.max!=null)numeric.max=control.max;numeric.step=control.step||'any';numeric.onchange=function(){var n=Number(this.value);if(Number.isFinite(n))commit(n);};if(type==='slider'&&control.min!=null&&control.max!=null){var slider=input('range',value);slider.min=control.sliderMin!=null?control.sliderMin:control.min;slider.max=control.sliderMax!=null?control.sliderMax:control.max;slider.step=control.step||'any';slider.value=value;slider.oninput=function(){numeric.value=this.value;};slider.onchange=function(){commit(Number(this.value));};}}
        else if(type==='checkbox'||type==='boolean'){var checkbox=input('checkbox','');checkbox.checked=control.value===true||control.value===1;checkbox.onchange=function(){commit(checkboxValue(control,this.checked));};}
        else if(type==='dropdown'||type==='select'){var select=element('select');select.id=fieldId;select.disabled=busy||control.disabled===true;var opts=optionList(control);opts.forEach(function(o,index){var option=element('option','',o.label);option.value=String(index);option.selected=o.value===control.value;select.appendChild(option);});select.onchange=function(){commit(opts[Number(this.value)].value);};fields.appendChild(select);}
        else if(type==='text'||type==='string'){var text=element('textarea');text.id=fieldId;text.value=control.value==null?'':String(control.value);text.disabled=busy||control.disabled===true;text.onchange=function(){commit(this.value);};fields.appendChild(text);}
        else if(type==='color'){var array=Array.isArray(control.value),hex=array?'#'+control.value.slice(0,3).map(function(v){return Math.round(Math.max(0,Math.min(1,v))*255).toString(16).padStart(2,'0');}).join(''):String(control.value);if(!/^#[0-9a-f]{6}$/i.test(hex)){fields.appendChild(element('span','unknown-control','색상 값을 읽지 못했습니다.'));return;}var color=input('color',hex);color.onchange=function(){var result=this.value;if(array){result=[1,3,5].map(function(index){return parseInt(color.value.slice(index,index+2),16)/255;});if(control.value.length>3)result.push(control.value[3]);}commit(result);};}
        else if(type==='point'||type==='vector'){if(!Array.isArray(control.value)){fields.appendChild(element('span','unknown-control','벡터 값을 읽지 못했습니다.'));return;}control.value.forEach(function(v,index){var number=input('number',v);number.id=fieldId+'-'+index;number.step=control.step||'any';if(control.min!=null)number.min=control.min;if(control.max!=null)number.max=control.max;number.onchange=function(){var values=control.value.slice();values[index]=Number(this.value);if(Number.isFinite(values[index]))commit(values);};});}
        else fields.appendChild(element('span','unknown-control','지원되지 않는 control: '+control.type));
      });
    }
    function refreshState(){
      if(!connected){renderEditor();return Promise.resolve();}
      return callHost('getState',{}).then(function(state){layerState=state;renderEditor();}).catch(function(error){status(error.message,'error');});
    }
    function connectHost(){
      if(!scope.__adobe_cep__)return Promise.resolve();
      return callHost('hostStatus',{}).then(function(result){hostInfo=result;connected=!!result&&result.available!==false;$('connection').textContent=connected?'AE · Connected':'Engine unavailable';$('connection').classList.toggle('online',connected);if(!connected)status(result&&result.message||'Contentrium Preset을 사용할 수 없습니다.','error');return refreshState();}).catch(function(error){connected=false;$('connection').textContent='Engine unavailable';$('connection').classList.remove('online');status(error.message,'error');renderEditor();});
    }
    function loadCatalog(){
      return fetch('./library/catalog.json',{cache:'no-store'}).then(function(response){if(!response.ok)throw new Error('라이브러리 목록을 읽지 못했습니다: '+response.status);return response.json();}).catch(function(error){
        var nodeRequire=typeof require==='function'?require:(scope.cep_node&&scope.cep_node.require);
        if(!scope.__adobe_cep__||!nodeRequire)throw error;
        var root=decodeURI(scope.__adobe_cep__.getSystemPath('extension'));
        if(/^file:/i.test(root))root=nodeRequire('url').fileURLToPath(root);
        return JSON.parse(nodeRequire('fs').readFileSync(nodeRequire('path').join(root,'library','catalog.json'),'utf8').replace(/^\uFEFF/,''));
      }).then(function(catalog){
        entries=normalizeCatalog(catalog);var valid=new Set(entries.map(function(e){return e.id;}));favorites=new Set(Array.isArray(persisted.favorites)?persisted.favorites.filter(function(id){return valid.has(id);}):entries.filter(function(e){return e.favorite!==false;}).map(function(e){return e.id;}));
        expanded=new Set(Array.isArray(persisted.expanded)?persisted.expanded:[''].concat(entries.map(function(e){return e.category[0];})));if(category&&!entries.some(function(e){var key=categoryKey(e.category);return key===category||key.indexOf(category+' / ')===0;}))category='';
        if(selectedId&&!valid.has(selectedId))selectedId=null;renderTree();renderGrid();renderFooter();status(entries.length+'개 프리셋 · 프리셋을 선택하고 In / Out / Both로 적용하세요.');
      }).catch(function(error){entries=[];renderTree();renderGrid();renderFooter();status(error.message,'error');});
    }
    $('variants-back').onclick=function(){allVariantsId=null;renderGrid();};
    $('audio-open').onclick=showAudioGuide;$('audio-notice-guide').onclick=showAudioGuide;$('audio-close').onclick=function(){$('audio-dialog').close();};$('audio-folder').onfocus=function(){this.select();};$('audio-example').onfocus=function(){this.select();};
    $('browse-tab').onclick=function(){selectTab('browse');};$('edit-tab').onclick=function(){selectTab('edit');};$('search').oninput=function(){query=this.value;allVariantsId=null;renderGrid();};$('clear-search').onclick=function(){$('search').value='';query='';allVariantsId=null;renderGrid();};$('favorites-toggle').onclick=function(){favoritesOnly=!favoritesOnly;allVariantsId=null;this.classList.toggle('active',favoritesOnly);this.setAttribute('aria-pressed',String(favoritesOnly));renderGrid();};
    $('thumbnail-size').oninput=function(){document.documentElement.style.setProperty('--card-width',this.value+'px');saveUI();};$('refresh').onclick=function(){persisted={favorites:Array.from(favorites),expanded:Array.from(expanded),selectedVariants:selectedVariants,category:category};loadCatalog();connectHost();};
    $('capture').onclick=function(){$('capture-name').value=activeEntry()?activeEntry().name:'';$('capture-dialog').showModal();};$('capture-cancel').onclick=function(){$('capture-dialog').close();};$('capture-form').onsubmit=function(event){event.preventDefault();var name=$('capture-name').value.trim();if(!name)return;$('capture-dialog').close();operation('선택 레이어 프리셋을 저장하는 중…',function(){return callHost('captureUserPreset',{name:name});},function(){status('Contentrium Preset에서 사용자 프리셋을 저장했습니다.');loadCatalog();}).catch(function(){});};
    $('resizer').onmousedown=function(event){event.preventDefault();var start=event.clientX,width=$('tree-panel').getBoundingClientRect().width;function move(e){var value=Math.max(135,Math.min(window.innerWidth-150,width+e.clientX-start));document.documentElement.style.setProperty('--tree-width',Math.round(value)+'px');}function stop(){document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',stop);saveUI();}document.addEventListener('mousemove',move);document.addEventListener('mouseup',stop);};
    api.view={getCatalog:function(){return JSON.parse(JSON.stringify(entries));},getState:function(){return{entries:entries.length,variants:entries.reduce(function(n,e){return n+e.variants.length;},0),category:category,query:query,favorites:Array.from(favorites),selectedId:selectedId,selectedVariant:activeVariant()&&activeVariant().id,variantsOpen:variantsOpen,allVariantsId:allVariantsId,connected:connected,tab:currentTab,hostState:layerState};},refresh:refreshState,selectTab:selectTab};
    loadCatalog();renderEditor();
    connectHost();
    setInterval(function(){if(connected&&!busy&&currentTab==='edit'&&(!document.hasFocus()||!document.querySelector('#editor-controls :focus')))refreshState();},2000);
  }
}(typeof window==='undefined'?globalThis:window));
