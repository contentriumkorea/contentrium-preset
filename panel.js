(function (scope) {
  'use strict';
  var AUTOMATIC_AEP_PREVIEW_ENABLED=false;
  function createPreviewWorker(nodeRequire,callHost){
    if(!AUTOMATIC_AEP_PREVIEW_ENABLED||!scope.ContentriumThumbnailWorker)return null;
    var extension=scope.__adobe_cep__.getSystemPath('extension');if(/^file:/i.test(extension))extension=nodeRequire('url').fileURLToPath(extension);
    return scope.ContentriumThumbnailWorker.create({enabled:true,extensionPath:nodeRequire('path').resolve(extension),windowId:panelSlot,nodeRequire:nodeRequire,resolveSource:function(value){return callHost('resolveThumbnailSource',value);},getHostVersion:async function(){return(await callHost('hostStatus',{})).version;}});
  }
  var panelSlot =
    typeof location !== 'undefined'
      ? new URLSearchParams(location.search).get('view') || 'main'
      : 'main';
  var helperTool=['easing','keyframes','anchor','shifter'].indexOf(panelSlot)!==-1?panelSlot:null;
  var STORAGE = 'contentrium-preset.ui.v1' + (panelSlot === 'main' ? '' : '.' + panelSlot),
    SHARED_STORAGE = 'contentrium-preset.shared.v1',
    SETTINGS_STORAGE = 'contentrium-preset.settings.v1',
    PANEL_LEASE_PREFIX = 'contentrium-preset.panel-lease.';
  var core =
    scope.ContentriumCore || (typeof require === 'function' ? require('./ui-core.js') : null);
  var hostQueue = null, transportObserver = null, transportChanged = null, lastHostStateReceipt = null;
  function getTransportState() {
    var state = hostQueue ? hostQueue.getDiagnostics() : {busy:false,waitingLate:false,queueLength:0,pending:null,lastCompletion:null};
    state.currentState = lastHostStateReceipt ? Object.assign({}, lastHostStateReceipt, {ageMs:Math.max(0,Date.now()-lastHostStateReceipt.receivedAt)}) : null;
    return state;
  }
  function initialSharedPreference(value) {
    if (!value || !Array.isArray(value.favorites)) return null;
    return {favorites:value.favorites.slice(),labels:Object.assign({},value.labels||{})};
  }
  function retainCatalogFavorites(saved,entries){
    // A temporarily absent pack must not erase its saved favorites.
    return Array.isArray(saved)?saved.filter(function(id){return typeof id==='string'&&id.length>0&&id.length<=256;}):entries.filter(function(e){return e.favorite!==false;}).map(function(e){return e.id;});
  }
  function normalizeCatalog(value) {
    var entries = Array.isArray(value) ? value : value && value.entries;
    if (!Array.isArray(entries)) throw new Error('프리셋 목록의 entries 배열이 필요합니다.');
    var ids = new Set();
    return entries.map(function (entry) {
      if (!entry || !entry.id || ids.has(String(entry.id)))
        throw new Error('프리셋 ID가 없거나 중복되었습니다.');
      ids.add(String(entry.id));
      var category = Array.isArray(entry.category)
        ? entry.category.slice()
        : String(entry.category || '')
            .split(' / ')
            .filter(Boolean);
      var variants = Array.isArray(entry.variants) ? entry.variants : [];
      if (!variants.length) throw new Error('변형 목록이 없습니다: ' + entry.name);
      return Object.assign({}, entry, {
        id: String(entry.id),
        category: category,
        variants: variants.map(function (v) {
          return Object.assign({}, v, { id: String(v.id) });
        }),
      });
    });
  }
  function readConvertedCatalog(appData,fsApi,pathApi){
    if(typeof appData!=='string'||!appData||!fsApi||!pathApi)return null;
    var presetRoot=pathApi.join(appData,'Contentrium','Preset'),root=pathApi.join(presetRoot,'ConvertedLibrary'),file=pathApi.join(root,'catalog.json');
    if(fsApi.existsSync(pathApi.join(presetRoot,'ConvertedLibrary.location.json'))||!fsApi.existsSync(file)){
      var locationFile=pathApi.join(presetRoot,'ConvertedLibrary.location.json');
      if(!fsApi.existsSync(locationFile))return null;
      var location=JSON.parse(fsApi.readFileSync(locationFile,'utf8').replace(/^\uFEFF/,''));
      if(!location||location.schemaVersion!==1||location.product!=='Contentrium Preset'||typeof location.libraryRoot!=='string'||!location.libraryRoot)throw new Error('사용자 변환 라이브러리 위치 파일이 올바르지 않습니다.');
      root=pathApi.resolve(location.libraryRoot);file=pathApi.join(root,'catalog.json');
      if(!fsApi.existsSync(file))throw new Error('위치 파일에 등록된 변환 라이브러리를 찾을 수 없습니다.');
    }
    var catalog=JSON.parse(fsApi.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
    if(!catalog||catalog.product!=='Contentrium Preset'||catalog.schemaVersion!==1||!Array.isArray(catalog.entries))throw new Error('사용자 변환 라이브러리 카탈로그 형식이 올바르지 않습니다.');
    catalog.entries.forEach(function(entry){(entry.variants||[]).forEach(function(variant){if(variant&&typeof variant.recipe==='string'&&variant.exactApplyVerified!==true){variant.available=false;variant.availabilityReason='exact-graph-runtime-not-integrated';if(/^cpr_[a-f0-9]{24}$/.test(String(variant.id))&&fsApi.existsSync(pathApi.join(root,'previews',variant.id+'.webm')))variant.renderedPreview='contentrium-library://'+variant.id;}});});
    return{catalog:catalog,root:root,file:file};
  }
  function availabilityText(variant){return variant&&variant.recipe&&variant.availabilityReason==='exact-graph-runtime-not-integrated'?'레시피 연결됨 · 적용 엔진 연결 중':'애니메이션 준비 중';}
  function attachOperationCapabilities(entries,host){
    var by=host&&host.applyOptions&&host.applyOptions.byVariant||{},changed=0;
    entries.forEach(function(entry){(entry.variants||[]).forEach(function(v){
      if(!v.recipe)return;var caps=by[v.id],before=JSON.stringify([v.available,v.applyRuntime,v.applyDirections,v.applyTarget]);
      v.available=false;delete v.applyRuntime;delete v.applyTarget;delete v.applyDirections;v.availabilityReason='exact-graph-runtime-not-integrated';
      if(/^cpr_[a-f0-9]{24}$/.test(v.id)&&v.type===1&&v.recipe==='recipes/'+v.id+'.cpr.json'&&caps&&caps.runtime==='operations-v1'&&caps.available===true&&(!caps.layerKind||caps.layerKind==='av'||caps.layerKind==='text')&&Array.isArray(caps.directions)&&caps.directions.length===1&&caps.directions[0]==='both'){
        v.available=true;v.applyRuntime=caps.runtime;v.applyTarget=caps.layerKind||'av';v.applyDirections=['both'];v.availabilityReason=v.applyTarget==='text'?'native-character-context-accepted':'native-property-accepted';
      }
      if(before!==JSON.stringify([v.available,v.applyRuntime,v.applyDirections,v.applyTarget]))changed++;
    });});return changed;
  }
  function mapCatalogIds(previousEntries,nextEntries){
    var ids={groups:{},variants:{}},seenGroups={},seenVariants={};
    if(!Array.isArray(previousEntries)||!Array.isArray(nextEntries)||previousEntries.length!==nextEntries.length)return ids;
    for(var i=0;i<previousEntries.length;i++){
      var a=previousEntries[i],b=nextEntries[i];
      if(!a||!b||a.name!==b.name||!Array.isArray(a.category)||!Array.isArray(b.category)||a.category.length!==b.category.length||a.category.some(function(value,index){return value!==b.category[index];})||!Array.isArray(a.variants)||!Array.isArray(b.variants)||a.variants.length!==b.variants.length)return{groups:{},variants:{}};
      if(typeof a.id!=='string'||typeof b.id!=='string'||Object.prototype.hasOwnProperty.call(seenGroups,'$'+a.id))return{groups:{},variants:{}};
      seenGroups['$'+a.id]=true;
      ids.groups[a.id]=b.id;
      for(var j=0;j<a.variants.length;j++){
        var av=a.variants[j],bv=b.variants[j];
        if(!av||!bv||av.name!==bv.name||Number(av.type)!==Number(bv.type)||typeof av.id!=='string'||typeof bv.id!=='string'||Object.prototype.hasOwnProperty.call(seenVariants,'$'+av.id))return{groups:{},variants:{}};
        seenVariants['$'+av.id]=true;
        ids.variants[av.id]=bv.id;
      }
    }
    return ids;
  }
  function migrateCatalogState(state,migration){
    state=state||{};migration=migration||{groups:{},variants:{}};
    var groups=migration.groups||{},variants=migration.variants||{},favorites=Array.isArray(state.favorites)?state.favorites.map(function(id){return Object.prototype.hasOwnProperty.call(groups,id)?groups[id]:id;}):[],labels={},selectedVariants={};
    Object.keys(state.labels||{}).forEach(function(id){labels[Object.prototype.hasOwnProperty.call(groups,id)?groups[id]:id]=state.labels[id];});
    Object.keys(state.selectedVariants||{}).forEach(function(id){var value=state.selectedVariants[id];selectedVariants[Object.prototype.hasOwnProperty.call(groups,id)?groups[id]:id]=Object.prototype.hasOwnProperty.call(variants,value)?variants[value]:value;});
    return{favorites:favorites,labels:labels,selectedId:Object.prototype.hasOwnProperty.call(groups,state.selectedId)?groups[state.selectedId]:state.selectedId,selectedVariants:selectedVariants};
  }
  function categoryKey(parts) {
    return parts.join(' / ');
  }
  function entryParts(entry) { return entry.categoryKeys || entry.category; }
  function entryCategory(entry) { return categoryKey(entryParts(entry)); }
  function buildCategoryTree(entries, extraPaths) {
    var root = { key: '', name: 'All items', parts: [], children: [], count: entries.length }, nodes=new Map([['',root]]);
    function add(entry, count) {
      var node = root;
      entry.category.forEach(function (name, index) {
        var parts = entryParts(entry).slice(0, index + 1),
          key = categoryKey(parts),
          child = nodes.get(key);
        if (!child) {
          child = { key: key, name: name, parts: parts, displayParts: entry.category.slice(0,index+1), children: [], count: 0 };
          node.children.push(child);
          nodes.set(key,child);
        }
        child.count += count;
        node = child;
      });
    }
    entries.forEach(function(entry){add(entry,1);});
    (extraPaths||[]).forEach(function(entry){add(entry,0);});
    return root;
  }
  function gridWindow(options) {
    var width=Math.max(1,options.width-options.left-options.right),gap=options.gap||0,
      columns=Math.max(1,Math.floor((width+gap)/(Math.min(options.minWidth,width)+gap))),
      cardWidth=(width-gap*(columns-1))/columns,cardHeight=(cardWidth-2)*9/16+options.labelHeight+2,
      stride=cardHeight+gap,rows=Math.ceil(options.total/columns),
      first=Math.min(Math.max(0,rows-1),Math.max(0,Math.floor((options.scrollTop-options.top)/stride))),
      last=Math.max(first+1,Math.ceil((options.scrollTop+options.height-options.top)/stride));
    return{columns:columns,cardWidth:cardWidth,cardHeight:cardHeight,stride:stride,start:Math.max(0,first-2)*columns,end:Math.min(options.total,(last+2)*columns),height:Math.max(0,rows*stride-gap),left:options.left,top:options.top,gap:gap};
  }
  function filterEntries(entries, category, query, favoritesOnly, favorites) {
    return entries.filter(function (e) {
      var key = entryCategory(e);
      return (
        (!category || key === category || key.indexOf(category + ' / ') === 0) &&
        (!favoritesOnly || favorites.has(e.id)) &&
        core.matchEntry(e, query).matches
      );
    });
  }
  function resolvePreview(relative) {
    if (typeof relative !== 'string' || !relative) return null;
    var clean = relative.replace(/\\/g, '/');
    if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(clean) || clean.split('/').indexOf('..') !== -1)
      throw new Error('프리뷰는 라이브러리의 상대 경로여야 합니다.');
    return clean
      .split('/')
      .map(function (p) {
        return encodeURIComponent(p);
      })
      .join('/');
  }
  function hostScript(method, payload, extensionRoot) {
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(method)) throw new Error('잘못된 엔진 명령입니다.');
    var call =
      '$.contentriumPreset.call(' +
      JSON.stringify(method) +
      ',' +
      JSON.stringify(JSON.stringify(payload || {})) +
      ')';
    if (!extensionRoot) return call;
    return (
      '(function(){var root=new Folder(' +
      JSON.stringify(extensionRoot) +
      ').fsName;if(typeof $.contentriumPreset!=="object"||$.contentriumPreset.root!==root)$.evalFile(new File(root+"/jsx/engine.jsx"));return ' +
      call +
      ';})()'
    );
  }
  function exactConversionKeys(value,keys){return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===keys.slice().sort().join('|');}
  function isConversionConfirmation(value){
    if(!value||value.code!=='CONFIRM_3D_CONVERSION'||value.type!=='RetryableError'||value.mutationStarted!==false||value.rollbackError||!exactConversionKeys(value.retryOptions,['canConvertLayerTo3d'])||value.retryOptions.canConvertLayerTo3d!==true)return false;
    var r=value.retryContext,c=r&&r.context,q=r&&r.request,ids=c&&c.layerIds,conversion=r&&r.conversionLayerIds,positive=function(n){return Number.isSafeInteger(n)&&n>0;};
    return exactConversionKeys(r,['id','context','expectedRevision','time','request','conversionLayerIds','recipeKey','motionBlurEnabled'])&&typeof r.id==='string'&&/^convert-3d-[0-9]+-[0-9]+$/.test(r.id)&&Number.isFinite(r.expectedRevision)&&r.expectedRevision>=0&&Number.isFinite(r.time)&&typeof r.recipeKey==='string'&&r.recipeKey.length>0&&r.recipeKey.length<=131072&&typeof r.motionBlurEnabled==='boolean'&&exactConversionKeys(c,['projectKey','projectToken','compositionId','layerIds'])&&typeof c.projectKey==='string'&&typeof c.projectToken==='string'&&c.projectToken.length>0&&positive(c.compositionId)&&Array.isArray(ids)&&ids.length>0&&ids.length<=2000&&ids.every(positive)&&new Set(ids).size===ids.length&&Array.isArray(conversion)&&conversion.length>0&&new Set(conversion).size===conversion.length&&conversion.every(function(id){return positive(id)&&ids.includes(id);})&&exactConversionKeys(q,['variantId','direction','inDuration','outDuration'])&&q.variantId==='1b8'&&['in','out','both'].includes(q.direction)&&[q.inDuration,q.outDuration].every(function(n){return n===null||Number.isFinite(n)&&n>0;});
  }
  function conversionRetryPayload(payload,error){
    if(!isConversionConfirmation(error))throw new Error('확인된 3D 변환 요청이 아닙니다.');var r=error.retryContext,request={variantId:payload.variantId,direction:payload.direction||'both',inDuration:payload.inDuration===undefined?null:payload.inDuration,outDuration:payload.outDuration===undefined?null:payload.outDuration};
    if(Object.keys(payload).some(function(k){return !['variantId','direction','inDuration','outDuration','context','expectedRevision'].includes(k);})||JSON.stringify(request)!==JSON.stringify(r.request)||JSON.stringify(payload.context)!==JSON.stringify(r.context)||payload.expectedRevision!==r.expectedRevision)throw new Error('원래 적용 요청이 변경되었습니다. 다시 적용하세요.');
    return Object.assign({},JSON.parse(JSON.stringify(payload)),{canConvertLayerTo3d:true,retryContext:JSON.parse(JSON.stringify(r))});
  }
  function parseHostResult(raw) {
    function unproven(message) {
      var error = new Error(message);
      error.code = 'CEP_HOST_RESPONSE_UNPROVEN';
      error.stopHostDispatch = true;
      error.outcomeUnknown = true;
      return error;
    }
    if (!raw || raw === 'EvalScript error.')
      throw unproven('AE 요청의 응답을 확인하지 못했습니다. AE 대화상자를 닫은 뒤 패널을 새로고침하세요.');
    var response;
    try {
      response = JSON.parse(raw);
    } catch (e) {
      throw unproven('AE 요청의 응답이 올바르지 않습니다. 대화상자를 닫은 뒤 패널을 새로고침하세요.');
    }
    if (!response || typeof response !== 'object' || Array.isArray(response) || typeof response.ok !== 'boolean')
      throw unproven('AE 요청의 실행 결과를 확인할 수 없습니다. 대화상자를 닫은 뒤 패널을 새로고침하세요.');
    if (!response || response.ok !== true) {
      var failure = new Error(
        response && response.error
          ? response.error.message || String(response.error)
          : 'Contentrium Preset 요청이 실패했습니다.',
      );
      failure.code = response && response.error && response.error.code;
      failure.rollbackError = response && response.error && response.error.rollbackError;
      if (failure.rollbackError) failure.message += '\n복구 확인 필요: ' + String(failure.rollbackError);
      if(isConversionConfirmation(response&&response.error)){failure.type='RetryableError';failure.retryOptions={canConvertLayerTo3d:true};failure.retryContext=JSON.parse(JSON.stringify(response.error.retryContext));failure.mutationStarted=false;}
      throw failure;
    }
    return response.result;
  }
  function callHost(method, payload, requestOptions) {
    if (!hostQueue)
      hostQueue = core.serialTransport(function (command, params, done) {
        if (!scope.__adobe_cep__ || typeof scope.__adobe_cep__.evalScript !== 'function') {
          done(new Error('AE 연결이 없습니다. After Effects에서 Contentrium Preset를 열어주세요.'));
          return;
        }
        var script = hostScript(command, params, scope.__adobe_cep__.getSystemPath('extension'));
        scope.__adobe_cep__.evalScript(script, function (raw) {
          try {
            done(null, parseHostResult(raw));
          } catch (error) {
            done(error);
          }
        });
      }, {
        onPending:function(waiting,detail){if(transportObserver)transportObserver(waiting,detail);},
        onChange:function(){if(transportChanged)transportChanged();}
      });
    return hostQueue(method, payload, requestOptions);
  }
  function variantType(variant) {
    return Number(variant.type != null ? variant.type : variant.item && variant.item.type);
  }
  function defaultVariant(entry, selected) {
    return (
      entry.variants.find(function (v) {
        return v.id === selected;
      }) ||
      entry.variants.find(function (v) {
        return v.id === String(entry.defaultId);
      }) ||
      entry.variants[0]
    );
  }
  function selectVariant(state, entry, variantId) {
    var selected = Object.assign({}, state.selectedVariants),
      variant =
        variantId == null
          ? defaultVariant(entry, selected[entry.id])
          : entry.variants.find(function (v) {
              return v.id === String(variantId);
            });
    if (!variant) throw new Error('이 프리셋에 없는 변형입니다.');
    selected[entry.id] = variant.id;
    return Object.assign({}, state, {
      selectedId: entry.id,
      selectedVariants: selected,
      variantsOpen: entry.variants.length > 1 ? entry.id : null,
      allVariantsId: state.allVariantsId === entry.id ? entry.id : null,
    });
  }
  function variantViewItems(entries, state) {
    var group = entries.find(function (e) {
      return e.id === state.allVariantsId;
    });
    if (group)
      return group.variants.map(function (v) {
        return {
          entry: group,
          variant: v,
          isVariant: true,
          selected:
            state.selectedId === group.id &&
            defaultVariant(group, state.selectedVariants[group.id]).id === v.id,
        };
      });
    return entries.map(function (e) {
      return {
        entry: e,
        variant: defaultVariant(e, state.selectedVariants[e.id]),
        isVariant: false,
        selected: state.selectedId === e.id,
      };
    });
  }
  function selectionPayload(entries, state, direction, hostState) {
    if (['in', 'out', 'both'].indexOf(direction) === -1)
      throw new Error('지원하지 않는 적용 방향입니다.');
    var entry = entries.find(function (e) {
      return e.id === state.selectedId;
    });
    if (!entry) throw new Error('프리셋을 선택하세요.');
    var variant = defaultVariant(entry, state.selectedVariants[entry.id]);
    if (variant.available !== true) throw new Error('이 변형은 애니메이션 준비 중입니다.');
    if(variant.applyDirections&&variant.applyDirections.indexOf(direction)===-1)throw new Error('이 방향의 적용은 아직 정밀 검증되지 않았습니다.');
    if(variant.applyRuntime==='operations-v1'){
      if(!hostState||!core.contextPayload(hostState)||!Number.isFinite(hostState.projectRevision))throw new Error('현재 프로젝트 선택 상태를 새로고침한 뒤 적용하세요.');
      return{variantId:variant.id,direction:direction,context:core.contextPayload(hostState),expectedRevision:hostState.projectRevision};
    }
    return { variantId: variant.id, direction: direction };
  }
  function normalizeControlType(control) {
    var type = String(control.type || '').toLowerCase();
    if (type === 'oned') {
      if (
        String(control.name || '').toLowerCase() === 'enabled' &&
        (control.value === 0 || control.value === 1)
      )
        return 'checkbox';
      if (control.kind === 'timing') return 'time';
      return Number.isFinite(control.min) && Number.isFinite(control.max) ? 'slider' : 'number';
    }
    if (['twod', 'twod_spatial', 'threed', 'threed_spatial'].indexOf(type) !== -1) return 'point';
    return type;
  }
  function checkboxValue(control, checked) {
    return typeof control.value === 'number' ? (checked ? 1 : 0) : !!checked;
  }
  function audioDetails(value) {
    var data = value || {},
      audio = data.audio || {};
    return {
      root: audio.root || data.audioRoot || '',
      missing: Array.from(
        new Set(
          (audio.missing || data.missingAudio || []).filter(function (key) {
            return typeof key === 'string' && key.length;
          }),
        ),
      ),
    };
  }
  function audioLibraryExample(keys) {
    var assets = {};
    (keys.length ? keys : ['transition-basic-05']).forEach(function (key) {
      if (!/^[a-z0-9-]+$/.test(key)) throw new Error('올바르지 않은 오디오 키입니다.');
      assets[key] = key + '.wav';
    });
    return JSON.stringify({ schemaVersion: 1, assets: assets }, null, 2);
  }
  function applyFeedback(result) {
    var details = audioDetails(result),
      warnings = ((result && result.warnings) || []).map(String).filter(function (message) {
        return message.indexOf('Local sound assets unavailable:') !== 0 || !details.missing.length;
      });
    return {
      text:
        (details.missing.length
          ? '영상 효과를 적용했습니다. 효과음 ' +
            details.missing.length +
            '개가 등록되지 않았습니다. 개인 오디오 안내를 확인하세요.'
          : 'Contentrium Preset에서 적용을 완료했습니다.') +
        (warnings.length ? ' ' + warnings.join(' ') : ''),
      tone: details.missing.length || warnings.length ? 'warning' : '',
      missingAudio: details.missing,
    };
  }
  function footerCanReplace(caps,state) {
    var stateCaps=(state&&state.precompApplyOptions)||{};
    if(caps.canReplace!==true)return false;
    if(typeof stateCaps.canReplace==='boolean')return stateCaps.canReplace;
    return stateCaps.precompSelected===true||!!(state&&state.numSelectedLayers===1&&(state.applied||[]).some(function(p){return Number(p.type)===10||p.kind==='precomp';}));
  }
  function footerSignature(entry, variant, hostInfo, state, busy, connected) {
    if(entry&&entry.source==='library')return JSON.stringify([entry.id,entry.name,entry.libraryItem,entry.availabilityReason,!!busy,!!connected,state&&state.numSelectedLayers,state&&state.precompApplyOptions,state&&state.soundApplyOptions]);
    var caps=(hostInfo&&hostInfo.applyOptions&&hostInfo.applyOptions.byVariant&&variant&&hostInfo.applyOptions.byVariant[variant.id])||{},
      canReplace=footerCanReplace(caps,state);
    return JSON.stringify([entry&&entry.id,entry&&entry.name,variant&&variant.id,variant&&variant.name,variant&&variantType(variant),variant&&variant.available===true,variant&&variant.applyDirections,!!busy,!!connected,caps.hasInOutAnims===true,caps.containsAudio===true,canReplace,caps.canApplyTexture===true]);
  }
  var api = {
    normalizeCatalog: normalizeCatalog,
    readConvertedCatalog:readConvertedCatalog,
    attachOperationCapabilities:attachOperationCapabilities,
    availabilityText:availabilityText,
    mapCatalogIds:mapCatalogIds,
    migrateCatalogState:migrateCatalogState,
    footerSignature:footerSignature,
    buildCategoryTree: buildCategoryTree,
    gridWindow:gridWindow,
    filterEntries: filterEntries,
    retainCatalogFavorites: retainCatalogFavorites,
    resolvePreview: resolvePreview,
    hostScript: hostScript,
    parseHostResult: parseHostResult,
    isConversionConfirmation:isConversionConfirmation,
    conversionRetryPayload:conversionRetryPayload,
    callHost: callHost,
    getTransportState: getTransportState,
    initialSharedPreference: initialSharedPreference,
    variantType: variantType,
    defaultVariant: defaultVariant,
    selectVariant: selectVariant,
    variantViewItems: variantViewItems,
    selectionPayload: selectionPayload,
    normalizeControlType: normalizeControlType,
    checkboxValue: checkboxValue,
    audioDetails: audioDetails,
    audioLibraryExample: audioLibraryExample,
    applyFeedback: applyFeedback,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  scope.ContentriumUI = api;
  if (typeof document === 'undefined') return;
  document.addEventListener('DOMContentLoaded', boot);
  function boot() {
    if(scope.ContentriumTheme)scope.ContentriumTheme.init(scope);
    var entries = [],
      productVersionPromise = null,
      hadUIPreferences = false,
      welcomeScheduled = false,
      builtInEntries = [],
      convertedLibraryRoot = null,
      catalogIdMigration = {},
      fontEntries = [],
      personalEntries = [],
      libraryPaths = [],
      libraryLoaded = false,
      largePreview = null,
      thumbnails = null,
      fileLeases = null,
      thumbnailArtifacts = new Map(),
      previewAudioPreparer = null,
      previewAudioResolver = null,
      category = '',
      query = '',
      favoritesOnly = false,
      favorites = new Set(),
      expanded = new Set(),
      selectedVariants = {},
      selectedId = null,
      variantsOpen = null,
      variantsExpanded = false,
      allVariantsId = null,
      focusFolder = '',
      defaultBrowseState = null,
      usingFilteredSelection = false,
      keyboardVariantsTimer = null,
      menuOwner = null,
      lastCardClick = null,
      lastMissingAudio = [],
      previewMuted = false,
      previewVolume = 1,
      busy = false,
      connected = false,
      hostInfo = null,
      layerState = null,
      currentTab = 'browse',
      persisted = {},
      tabMode = 'auto',
      lastInstance = null,
      lastSeparateEdit = undefined,
      lastRevision = null,
      lastFooterSignature = null,
      labels = {},
      labelFilter = '',
      labelFilters = [],
      filterNames = {red:'빨강',orange:'주황',yellow:'노랑',green:'초록',blue:'파랑',purple:'보라',none:'라벨 없음'},
      lastFilterSignature = null,
      searchTimer = null,
      workspaceUI = null,
      editorUI = null,
      animatedFontUI = null,
      settings = {},
      precompOptions = {
        animateIn: true,
        animateOut: true,
        sound: true,
        keepTexts: true,
        keepTextProperties: false,
        keepTransform: true,
        keepOtherProperties: false,
      },
      lastRenderState = null,
      separateEdit = /[?&]view=edit(?:&|$)/.test(scope.location.search);
    var indexSource=null,entriesById=new Map(),treeCache=null,treeNodes=new Map(),viewCache=null,
      sharedRevision=0,lastSharedRevision=-1,cacheSignature=null,gridGeometry=null,gridViews=[],gridIndices=new Map(),gridFrame=null,
      lastBrowseMode=null,pendingGridAnchor=null,groupGridAnchor=null,virtualSpacer=null;
    function ensureEntryIndex(){if(indexSource===entries)return;indexSource=entries;entriesById=new Map();entries.forEach(function(entry){entriesById.set(entry.id,entry);});treeCache=null;viewCache=null;}
    function categoryTree(){ensureEntryIndex();if(!treeCache){treeCache=buildCategoryTree(entries,libraryPaths);treeNodes=new Map();(function walk(n){treeNodes.set(n.key,n);n.children.forEach(walk);})(treeCache);}return treeCache;}
    var panelToken = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2),
      panelLeaseKey = PANEL_LEASE_PREFIX + panelSlot,
      panelHeartbeat = null,
      panelSync = null,
      settingsRefreshPending = false,
      settingsRefreshAgain = false;
    var transportNotice = null, historyBusy = false;
    var $ = function (id) {
      return document.getElementById(id);
    };
    function element(tag, classes, text) {
      var node = document.createElement(tag);
      if (classes) node.className = classes;
      if (text !== undefined) node.textContent = text;
      return node;
    }
    function status(message, type) {
      var diagnostics = getTransportState();
      if (diagnostics.waitingLate && /^(AE 응답 시간이 초과되었습니다\.|이전 AE 작업의 응답을 기다리고 있습니다\.)/.test(message)) {
        transportNotice = {requestId:diagnostics.pending.requestId,waitingFresh:false};
        message = 'AE 응답을 기다리고 있습니다. 계속 멈춰 있으면 이 패널을 닫고 Window > Extensions > Contentrium Preset에서 다시 여세요. 이전 작업 결과를 확인한 후 다시 실행하세요.';
      } else transportNotice = null;
      $('status').textContent = message;
      $('status').className = 'status-bar' + (type ? ' ' + type : '');
      if (transportNotice) $('status').dataset.transportRequestId=String(transportNotice.requestId);
      else delete $('status').dataset.transportRequestId;
    }
    transportChanged = function () {
      var transportState=getTransportState();
      $('connection').dataset.transport=JSON.stringify(transportState);
      if(transportState.suspended){connected=false;$('connection').textContent='AE · Paused';$('connection').classList.remove('online');renderFooter();}
      if(animatedFontUI)animatedFontUI.updateState({busy:busy||!!(hostQueue&&hostQueue.isBusy()),connected:connected});
    };
    transportObserver = function (waiting, detail) {
      if(waiting&&detail.method==='pickColor'){status('AE 색상 선택창에서 색을 고르거나 취소하세요.','busy');return;}
      if (waiting) { status('AE 응답 시간이 초과되었습니다.', 'error'); return; }
      if (!detail.timedOut || !transportNotice || transportNotice.requestId!==detail.requestId) return;
      if (!detail.ok) { status(detail.errorMessage || '이전 AE 요청의 응답을 읽지 못했습니다.', 'error'); return; }
      status('이전 AE 응답을 받았습니다. 현재 선택 상태를 확인하는 중…', 'busy');
      transportNotice={requestId:detail.requestId,waitingFresh:true};
      $('status').dataset.transportRequestId=String(detail.requestId);
    };
    function readLease(slot) {
      try { return JSON.parse(localStorage.getItem(PANEL_LEASE_PREFIX + slot) || 'null'); }
      catch (ignore) { return null; }
    }
    function publishPanelLease() {
      if (panelSync) { panelSync.lease(); return; }
      try {
        localStorage.setItem(panelLeaseKey, JSON.stringify({token:panelToken,at:Date.now()}));
        if (separateEdit) localStorage.setItem('contentrium-preset.edit-panel-open', String(Date.now()));
      } catch (error) { status('패널 연결 상태를 저장하지 못했습니다. ' + error.message, 'error'); }
    }
    function releasePanelLease() {
      clearInterval(panelHeartbeat);
      panelHeartbeat = null;
      if (panelSync) panelSync.release();
      var lease = readLease(panelSlot);
      if (lease && lease.token === panelToken) {
        localStorage.removeItem(panelLeaseKey);
        if (separateEdit) localStorage.removeItem('contentrium-preset.edit-panel-open');
      }
    }
    function editIsDetached() {
      if (separateEdit) return true;
      var at = Number(localStorage.getItem('contentrium-preset.edit-panel-open'));
      return core.panelIsLive({at:at}, Date.now());
    }
    function publishSettings(value) {
      var signature = core.settingsSignature(value);
      if (!signature) return;
      try {
        if (localStorage.getItem(SETTINGS_STORAGE) !== signature)
          localStorage.setItem(SETTINGS_STORAGE, signature);
        if (panelSync) panelSync.settings(value);
      } catch (error) { status('다른 패널에 설정을 알리지 못했습니다. ' + error.message, 'error'); }
    }
    function refreshSharedSettings() {
      if (!workspaceUI || !supports('getSettings')) return;
      if (settingsRefreshPending) { settingsRefreshAgain = true; return; }
      settingsRefreshPending = true;
      workspaceUI.loadSettings().finally(function () {
        settingsRefreshPending = false;
        if (settingsRefreshAgain) { settingsRefreshAgain = false; refreshSharedSettings(); }
      });
    }
    function saveUI() {
      try {
        persisted = {
          favorites: Array.from(favorites),
          expanded: Array.from(usingFilteredSelection ? defaultBrowseState.expanded : expanded),
          selectedVariants: usingFilteredSelection ? defaultBrowseState.selectedVariants : selectedVariants,
          category: usingFilteredSelection ? defaultBrowseState.category : category,
          focusFolder: focusFolder,
          gridSize: $('thumbnail-size').value,
          treeWidth: document.documentElement.style.getPropertyValue('--tree-width'),
          tabMode: tabMode,
          labels: labels,
          labelFilter: labelFilter,
          labelFilters: labelFilters.slice(),
          favoritesOnly: favoritesOnly,
          previewMuted: previewMuted,
          previewVolume: previewVolume,
        };
        localStorage.setItem(STORAGE, JSON.stringify(persisted));
        if(lastSharedRevision!==sharedRevision){
          localStorage.setItem(SHARED_STORAGE,JSON.stringify({ favorites: Array.from(favorites), labels: labels }));
          if (panelSync) panelSync.shared({ favorites: Array.from(favorites), labels: labels });
          lastSharedRevision=sharedRevision;
        }
        saveLibraryCache();
      } catch (error) {
        status('패널 설정을 저장하지 못했습니다. ' + error.message, 'error');
      }
    }
    try {
      hadUIPreferences = localStorage.getItem(STORAGE) !== null;
      persisted = JSON.parse(localStorage.getItem(STORAGE) || '{}') || {};
    } catch (error) {
      persisted = {};
    }
    try {
      var cached = JSON.parse(localStorage.getItem('contentrium-preset.library-cache.v1') || '[]');
      if (Array.isArray(cached) && cached.length<=2048) personalEntries=cached.filter(function(entry){return entry&&entry.source==='library'&&typeof entry.id==='string'&&entry.id.indexOf('library:')===0&&entry.libraryItem&&Array.isArray(entry.category)&&Array.isArray(entry.categoryKeys)&&Array.isArray(entry.variants);});
    } catch(ignoreLibraryCache) {}
    try {
      var shared = JSON.parse(localStorage.getItem(SHARED_STORAGE) || 'null');
      if (shared) {
        persisted.favorites = shared.favorites;
        persisted.labels = shared.labels;
      }
    } catch (ignore) {}
    category = persisted.category || '';
    focusFolder = typeof persisted.focusFolder === 'string' ? persisted.focusFolder : '';
    selectedVariants = persisted.selectedVariants || {};
    labels = persisted.labels || {};
    labelFilters = (Array.isArray(persisted.labelFilters) ? persisted.labelFilters : [persisted.labelFilter]).filter(function (label, index, values) {
      return Object.prototype.hasOwnProperty.call(filterNames, label) && values.indexOf(label) === index;
    });
    labelFilter = labelFilters[0] || '';
    favoritesOnly = persisted.favoritesOnly === true;
    previewMuted = persisted.previewMuted === true;
    if (typeof persisted.previewVolume === 'number' && Number.isFinite(persisted.previewVolume)) previewVolume=Math.max(0,Math.min(1,persisted.previewVolume));
    $('preview-audio-muted').checked=previewMuted;
    $('preview-audio-volume').value=String(previewVolume*100);
    tabMode = separateEdit ? 'edit' : persisted.tabMode || 'auto';
    $('tab-mode').value = tabMode;
    $('tab-mode').disabled = separateEdit;
    $('label-filter').value = 'add';
    $('favorites-toggle').classList.toggle('active', favoritesOnly);
    $('favorites-toggle').setAttribute('aria-pressed', String(favoritesOnly));
    if (persisted.gridSize) {
      $('thumbnail-size').value = persisted.gridSize;
      document.documentElement.style.setProperty('--card-width', Number(persisted.gridSize) + 'px');
    }
    if (persisted.treeWidth && /^\d+px$/.test(persisted.treeWidth))
      document.documentElement.style.setProperty('--tree-width', persisted.treeWidth);
    function activeEntry() {
      ensureEntryIndex();return entriesById.get(selectedId)||null;
    }
    function retainedLibraryIDs() {
      var keep = new Set(Array.from(favorites).concat(Array.isArray(persisted.favorites)?persisted.favorites:[]));
      personalEntries.forEach(function(entry){if(entryLabel(entry)||entry.id===selectedId||(defaultBrowseState&&entry.id===defaultBrowseState.selectedId))keep.add(entry.id);});
      return Array.from(keep).filter(function(id){return id.indexOf('library:')===0;});
    }
    function saveLibraryCache() {
      var identity=[personalEntries,sharedRevision,String(selectedId||'').indexOf('library:')===0?selectedId:null,defaultBrowseState&&String(defaultBrowseState.selectedId||'').indexOf('library:')===0?defaultBrowseState.selectedId:null];
      if(cacheSignature&&identity.every(function(value,i){return value===cacheSignature[i];}))return;
      var keep=new Set(retainedLibraryIDs());
      localStorage.setItem('contentrium-preset.library-cache.v1',JSON.stringify(personalEntries.filter(function(entry){return keep.has(entry.id);})));
      cacheSignature=identity;
    }
    function categoryNode(key) {
      categoryTree();return treeNodes.get(key)||null;
    }
    function categoryLabel(key) {
      var node=categoryNode(key);return node?(node.displayParts||[]).join(' / '):key;
    }
    function validateCategories() {
      if(category&&!categoryNode(category)&&(libraryLoaded||category.indexOf('@library')!==0))category='';
      if(focusFolder&&!categoryNode(focusFolder)&&(libraryLoaded||focusFolder.indexOf('@library')!==0))focusFolder='';
      if(focusFolder&&category!==focusFolder&&category.indexOf(focusFolder+' / ')!==0)category=focusFolder;
    }
    function receiveFonts(fonts) {
      var definitions=fonts&&Array.isArray(fonts.available)?fonts.available:[];
      fontEntries=definitions.filter(function(def){return def&&typeof def.id==='string'&&typeof def.digest==='string'&&def.coverage;}).map(function(def){
        var id='font:'+def.id,variant={id:id+':'+def.digest,name:def.name||def.id,type:11,fontId:def.id,fontHash:def.digest,available:true};
        if(def.renderedPreview)variant.renderedPreview=def.renderedPreview;
        return{id:id,name:def.name||def.id,category:['Animated Fonts'],favorite:false,defaultId:variant.id,variants:[variant]};
      });
      entries=builtInEntries.concat(fontEntries,personalEntries);validateCategories();renderTree();renderGrid();renderFooter();previewActivity();
    }
    function fontPackDialog() {
      var fonts=hostInfo&&hostInfo.animatedFonts||{},dialog=document.createElement('dialog');dialog.setAttribute('aria-label','애니메이티드 폰트 팩');
      var heading=document.createElement('h2');heading.textContent='애니메이티드 폰트 팩';dialog.appendChild(heading);
      var note=document.createElement('p');note.textContent='추가 글자 팩의 .cfont.json 파일을 아래 폴더에 넣고 패널을 새로고침하세요. 폴더가 없다면 먼저 만드세요.';dialog.appendChild(note);
      var path=document.createElement('input');path.readOnly=true;path.value=fonts.directory||'';path.setAttribute('aria-label','글자 팩 폴더');dialog.appendChild(path);
      var copy=document.createElement('button');copy.type='button';copy.textContent='폴더 경로 복사';copy.onclick=function(){path.focus();path.select();document.execCommand('copy');};dialog.appendChild(copy);
      var list=document.createElement('ul');(fonts.available||[]).forEach(function(def){var li=document.createElement('li');li.textContent=def.name+' · '+def.coverage.codePoints.length+'종 문자';list.appendChild(li);});dialog.appendChild(list);
      (fonts.issues||[]).forEach(function(issue){var item=document.createElement('p');item.textContent=issue.message||issue.code;dialog.appendChild(item);});
      var close=document.createElement('button');close.type='button';close.textContent='닫기';close.onclick=function(){dialog.close();};dialog.appendChild(close);dialog.addEventListener('close',function(){dialog.remove();});document.body.appendChild(dialog);dialog.showModal();
    }
    function receiveLibrary(value) {
      personalEntries=scope.ContentriumLibrary.toEntries(value,personalEntries,retainedLibraryIDs());
      libraryPaths=scope.ContentriumLibrary.folderPaths(value);libraryLoaded=true;
      entries=builtInEntries.concat(fontEntries,personalEntries);validateCategories();saveLibraryCache();
      if(largePreview&&largePreview.itemId)largePreview.close();
      renderTree();renderGrid();renderFooter();previewActivity();
      document.querySelectorAll('#preset-grid .preset-card[data-library-state]').forEach(function(card){var entry=entriesById.get(card.dataset.entryId);if(entry&&card._libraryPreview&&card._libraryPreview.revalidate)card._libraryPreview.revalidate(entry.libraryItem);});
    }
    function activeVariant() {
      var entry = activeEntry();
      return entry ? defaultVariant(entry, selectedVariants[entry.id]) : null;
    }
    function selectionState() {
      return {
        selectedId: selectedId,
        selectedVariants: selectedVariants,
        variantsOpen: variantsOpen,
        allVariantsId: allVariantsId,
      };
    }
    function cancelKeyboardVariants() {
      clearTimeout(keyboardVariantsTimer);
      keyboardVariantsTimer = null;
    }
    function resetFilterSelection() {
      cancelKeyboardVariants();
      var filtered = !!(query.trim() || favoritesOnly || labelFilters.length);
      if (filtered && !usingFilteredSelection) {
        defaultBrowseState = {selectedId:selectedId, selectedVariants:selectedVariants, category:category, expanded:expanded, allVariantsId:allVariantsId,gridAnchor:captureGridAnchor()};
      }
      if (filtered) {
        selectedId = null; selectedVariants = {}; category = focusFolder;
        expanded = new Set(expanded); allVariantsId = null; variantsOpen = null;
      } else if (usingFilteredSelection && defaultBrowseState) {
        selectedId = defaultBrowseState.selectedId; selectedVariants = defaultBrowseState.selectedVariants;
        category = defaultBrowseState.category; expanded = defaultBrowseState.expanded;
        allVariantsId = defaultBrowseState.allVariantsId; variantsOpen = variantsExpanded ? selectedId : null;
        pendingGridAnchor=defaultBrowseState.gridAnchor;
      }
      usingFilteredSelection = filtered;
      if (filtered && query.trim()) entries.forEach(function (entry) {
        var match = core.matchEntry(entry, query);
        if (match.matches && match.matchKind === 'variant') selectedVariants[entry.id] = match.matchingVariantId;
      });
    }
    function setFocusedFolder(key) {
      cancelKeyboardVariants();
      function retainsCategory(value) {
        return (!value || !!categoryNode(value)) && (!key || value === key || value.indexOf(key + ' / ') === 0);
      }
      focusFolder = key;
      if (!retainsCategory(category)) {
        category = key;
        allVariantsId = null;
        variantsOpen = null;
      }
      if (defaultBrowseState && !retainsCategory(defaultBrowseState.category)) { defaultBrowseState.category=key; defaultBrowseState.allVariantsId=null; }
      if (key) expanded.add(key);
      saveUI(); renderTree(); renderGrid(); renderFooter();
    }
    function clearSelection() {
      cancelKeyboardVariants();
      selectedId = null;
      variantsOpen = null;
      renderGrid();
      renderFooter();
    }
    function choose(entry, variant, openVariants) {
      cancelKeyboardVariants();
      var state = selectVariant(selectionState(), entry, variant && variant.id),
        focused = document.activeElement,
        refocus = focused && focused.classList.contains('preset-card');
      selectedId = state.selectedId;
      selectedVariants = state.selectedVariants;
      variantsExpanded = openVariants !== false;
      variantsOpen = openVariants === false ? null : state.variantsOpen;
      allVariantsId = state.allVariantsId;
      saveUI();
      renderGrid();
      renderFooter();
      if (refocus) {
        var card = Array.from($('preset-grid').querySelectorAll('.preset-card')).find(function (c) {
          return (
            c.dataset.entryId === entry.id && c.dataset.variantId === selectedVariants[entry.id]
          );
        });
        if (card) card.focus();
      }
    }
    function selectTab(tab, automatic) {
      if(helperTool)tab='tools';
      if(tab!=='browse'&&largePreview)largePreview.close();
      if (tab !== 'browse') cancelKeyboardVariants();
      if (!automatic && tabMode !== 'auto' && (tab === 'browse' || tab === 'edit')) {
        tabMode = tab;
        $('tab-mode').value = tabMode;
        saveUI();
      }
      currentTab = tab;
      if(workspaceUI)workspaceUI.setLibraryVisible(tab==='library');
      ['browse', 'edit', 'tools', 'settings', 'library'].forEach(function (t) {
        $(t + '-view').classList.toggle('hidden', tab !== t);
        var button = $(t + '-tab');
        if (button) {
          button.classList.toggle('active', tab === t);
          button.setAttribute('aria-selected', String(tab === t));
        }
      });
      previewActivity();
      if (tab === 'browse') renderFooter();
      if (tab === 'edit') refreshState();
      if (tab === 'settings' && workspaceUI) workspaceUI.loadSettings();
      if (tab === 'library' && workspaceUI) return workspaceUI.loadLibrary();
    }
    function supports(method) {
      var caps = (hostInfo && hostInfo.capabilities) || {},
        methods = (hostInfo && hostInfo.methods) || caps.methods || [];
      return (
        connected &&
        (methods.indexOf(method) !== -1 ||
          caps[method] === true ||
          method === 'getState' ||
          method === 'applyPreset' ||
          method === 'setControl')
      );
    }
    function previewActivity() {
      syncPreviewSound();
      if (workspaceUI)
        workspaceUI.setActive(
          currentTab === 'library' &&
            !document.hidden &&
            (!settings.pausePreviewWhenInactive || document.hasFocus()),
        );
      if (currentTab !== 'library')
        document
          .querySelectorAll('#library-view audio,#library-view video')
          .forEach(function (media) {
            media.pause();
          });
      var active =
        currentTab === 'browse' &&
        !largePreview &&
        !busy &&
        !document.hidden &&
        (!settings.pausePreviewWhenInactive || document.hasFocus());
      if (scope.ContentriumPreview && scope.ContentriumPreview.setPlaybackActive)
        scope.ContentriumPreview.setPlaybackActive(active);
      document.querySelectorAll('#preset-grid .preset-card').forEach(function(card){if(card._libraryPreview)card._libraryPreview.setActive(active);});
      document.querySelectorAll('#preset-grid .preset-card:not([data-library-state]) video').forEach(function (video) {
        var box = video.getBoundingClientRect(),
          grid = $('preset-grid').getBoundingClientRect(),
          visible = box.bottom > grid.top && box.top < grid.bottom && box.width > 0;
        if (active && visible) {
          var p = video.play();
          if (p && p.catch) p.catch(function () {});
        } else video.pause();
      });
    }
    function revealVariant(id) {
      var entry = entries.find(function (e) {
        return e.variants.some(function (v) {
          return v.id === String(id);
        });
      });
      if (!entry) {
        status('현재 라이브러리에서 이 프리셋을 찾을 수 없습니다. 원본 라이브러리 폴더의 연결 상태를 확인하세요.', 'error');
        return false;
      }
      if (entry) {
        clearTimeout(searchTimer);
        category = '';
        query = '';
        $('search').value = '';
        favoritesOnly = false;
        labelFilters = [];
        labelFilter = '';
        resetFilterSelection();
        focusFolder = '';
        category = '';
        allVariantsId = null;
        $('favorites-toggle').classList.remove('active');
        $('favorites-toggle').setAttribute('aria-pressed', 'false');
        selectTab('browse');
        choose(
          entry,
          entry.variants.find(function (v) {
            return v.id === String(id);
          }),
        );
      }
    }
    function setLabel(key, label) {
      if (label) labels[key] = label;
      else delete labels[key];
      sharedRevision++;
      saveUI();
      renderTree();
      renderGrid();
    }
    function entryLabel(entry) {
      if (labels['item:' + entry.id]) return labels['item:' + entry.id];
      for (var i = entryParts(entry).length; i >= 0; i--) {
        var inherited = labels['category:' + categoryKey(entryParts(entry).slice(0, i))];
        if (inherited) return inherited;
      }
      return '';
    }
    function showMenu(event, items) {
      event.preventDefault();
      menuOwner = event.currentTarget || document.activeElement;
      var menu = $('context-menu');
      menu.textContent = '';
      items.forEach(function (item) {
        if (item.separator) {
          menu.appendChild(element('hr'));
          return;
        }
        var b = element('button', '', item.label);
        b.type = 'button';
        b.setAttribute('role', 'menuitem');
        b.disabled = item.disabled === true;
        b.title = item.reason || '';
        b.onclick = function () {
          menu.classList.add('hidden');
          if (item.run) item.run();
        };
        menu.appendChild(b);
      });
      menu.classList.remove('hidden');
      menu.style.left = Math.min(event.clientX, Math.max(0, innerWidth - 230)) + 'px';
      menu.style.top =
        Math.min(event.clientY, Math.max(0, innerHeight - menu.offsetHeight - 8)) + 'px';
      var first = menu.querySelector('button:not(:disabled)');
      if (first) first.focus();
    }
    function labelMenu(key) {
      return [
        ['', '라벨 지우기'],
        ['red', '빨강'],
        ['orange', '주황'],
        ['yellow', '노랑'],
        ['green', '초록'],
        ['blue', '파랑'],
        ['purple', '보라'],
      ].map(function (pair) {
        return {
          label: '라벨 · ' + pair[1],
          run: function () {
            setLabel(key, pair[0]);
          },
        };
      });
    }
    function toggleFavorite(entry) {
      favorites.has(entry.id) ? favorites.delete(entry.id) : favorites.add(entry.id);
      sharedRevision++;
      saveUI();
      renderTree();
      renderGrid();
      renderFooter();
    }
    function focusCategory(key) {
      var row = Array.from($('category-tree').querySelectorAll('[role=treeitem]')).find(
        function (r) {
          return r.dataset.categoryKey === key;
        },
      );
      if (row) row.focus();
    }
    function selectCategory(key) {
      cancelKeyboardVariants();
      category=key; selectedId=null; variantsOpen=null; allVariantsId=null;
      saveUI(); renderTree(); renderGrid(); renderFooter();
    }
    function renderTree() {
      var tree = categoryTree(),
        target = $('category-tree');
      if (focusFolder) {
        var focusedNode = null;
        (function find(node) { if (node.key === focusFolder) focusedNode=node; else node.children.forEach(find); })(tree);
        if (focusedNode) tree=focusedNode;
      }
      $('folder-focus').classList.toggle('hidden', !focusFolder);
      $('focused-folder-name').textContent = categoryLabel(focusFolder).split(' / ').pop() || '';
      target.textContent = '';
      function row(node, depth) {
        var r = element('div', 'category-row' + (category === node.key ? ' selected' : ''));
        r.style.paddingLeft = 6 + depth * 12 + 'px';
        r.setAttribute('role', 'treeitem');
        r.setAttribute('aria-level', String(depth + 1));
        r.setAttribute('aria-selected', String(category === node.key));
        r.tabIndex = 0;
        r.dataset.categoryKey = node.key;
        if (labels['category:' + node.key]) r.dataset.label = labels['category:' + node.key];
        var expand = element(
          'button',
          'expand',
          node.children.length ? (expanded.has(node.key) ? '▼' : '▶') : '',
        );
        expand.type = 'button';
        expand.setAttribute('aria-label', node.name + ' 펼침');
        expand.onclick = function (event) {
          event.stopPropagation();
          expanded.has(node.key) ? expanded.delete(node.key) : expanded.add(node.key);
          saveUI();
          renderTree();
        };
        if (node.children.length) r.setAttribute('aria-expanded', String(expanded.has(node.key)));
        else expand.disabled = true;
        if (!node.key) { expand.disabled=true; r.setAttribute('aria-expanded','true'); }
        r.appendChild(expand);
        r.appendChild(element('span', 'folder-icon', node.key ? '▱' : '▤'));
        r.appendChild(element('span', 'category-name', node.name));
        r.appendChild(element('span', 'category-count', String(node.count)));
        r.onclick = function () {
          selectCategory(node.key);
        };
        r.oncontextmenu = function (event) {
          var members = entries.filter(function (e) {
            var k = entryCategory(e);
            return !node.key || k === node.key || k.indexOf(node.key + ' / ') === 0;
          });
          showMenu(
            event,
            [
              {
                label: '폴더 보기',
                run: function () {
                  selectCategory(node.key);
                },
              },
              { label: '이 폴더에 집중', disabled: !node.key || node.key === focusFolder, run: function () { setFocusedFolder(node.key); } },
              {
                label: '폴더 즐겨찾기 추가',
                run: function () {
                  members.forEach(function (e) {
                    favorites.add(e.id);
                  });
                  sharedRevision++;
                  saveUI();
                  renderGrid();
                },
              },
              {
                label: '폴더 즐겨찾기 해제',
                run: function () {
                  members.forEach(function (e) {
                    favorites.delete(e.id);
                  });
                  sharedRevision++;
                  saveUI();
                  renderGrid();
                },
              },
              { separator: true },
            ].concat(labelMenu('category:' + node.key)),
          );
        };
        r.onkeydown = function (event) {
          var rows = Array.from(target.querySelectorAll('[role=treeitem]')),
            at = rows.indexOf(r),
            index = core.gridTarget(at, event.key, 1, rows.length);
          if (event.key==='ArrowUp'||event.key==='w') index=(at-1+rows.length)%rows.length;
          if (event.key==='ArrowDown'||event.key==='s') index=(at+1)%rows.length;
          function moveTo(row) {
            var key=row.dataset.categoryKey;
            selectCategory(key); focusCategory(key);
            var current=document.activeElement;
            if(current) current.scrollIntoView({block:'nearest'});
          }
          if (['ArrowUp', 'ArrowDown', 'w', 's', 'Home', 'End'].indexOf(event.key) !== -1) {
            event.preventDefault();
            if (rows[index]) moveTo(rows[index]);
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (node.children.length && node.key) { expand.click(); focusCategory(node.key); }
          } else if (event.key === 'ArrowRight' || event.key === 'd') {
            event.preventDefault();
            if (node.children.length && !expanded.has(node.key)) {
              expanded.add(node.key);
              saveUI();
              renderTree();
              focusCategory(node.key);
            } else if (rows[at + 1]) moveTo(rows[at + 1]);
          } else if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'Backspace') {
            event.preventDefault();
            if (event.key !== 'Backspace' && expanded.has(node.key) && node.children.length && node.key) {
              expanded.delete(node.key);
              saveUI();
              renderTree();
              focusCategory(node.key);
            } else {
              var parent = categoryKey(node.parts.slice(0, -1));
              if (node.key === focusFolder) setFocusedFolder(parent);
              selectCategory(parent);
              focusCategory(parent);
            }
          }
        };
        target.appendChild(r);
        if (expanded.has(node.key) || !node.key)
          node.children.forEach(function (c) {
            row(c, depth + 1);
          });
      }
      row(tree, 0);
      $('library-count').textContent =
        entries.length +
        ' presets · ' +
        entries.reduce(function (n, e) {
          return n + e.variants.length;
        }, 0) +
        ' variants';
    }
    function updateVariantOverflow() {
      var list = $('preset-grid'), menu = list.querySelector('.inline-variants'), bottom = 0;
      if (menu) {
        if(list.classList.contains('virtual-grid')&&gridGeometry)bottom=list.getBoundingClientRect().top+gridGeometry.top+gridGeometry.height-list.scrollTop;
        else list.querySelectorAll('.preset-card').forEach(function (card) {bottom = Math.max(bottom, card.getBoundingClientRect().bottom);});
      }
      // Only reserve scroll space beyond the last row; options never size a grid row.
      list.style.setProperty('--variants-overflow', menu ? Math.max(0, Math.ceil(menu.getBoundingClientRect().bottom - bottom)) + 'px' : '0px');
    }
    function updateLabelFilters(values) {
      labelFilters = values;
      labelFilter = values[0] || '';
      resetFilterSelection();
      saveUI();
      renderTree();
      renderGrid();
      renderFooter();
    }
    function clearBrowseFilters() {
      clearTimeout(searchTimer);
      searchTimer = null;
      query = '';
      $('search').value = '';
      allVariantsId = null;
      favoritesOnly = false;
      $('favorites-toggle').classList.remove('active');
      $('favorites-toggle').setAttribute('aria-pressed', 'false');
      updateLabelFilters([]);
    }
    function renderFilterChips() {
      var signature = JSON.stringify([query, favoritesOnly, labelFilters]);
      if (signature === lastFilterSignature) return;
      lastFilterSignature = signature;
      var container = $('filter-chips');
      container.textContent = '';
      function chip(text, accessible, remove, label) {
        var button = element('button', 'filter-chip', text + ' ×');
        button.type = 'button';
        button.setAttribute('aria-label', accessible);
        if (label) button.dataset.label = label;
        button.onclick = remove;
        container.appendChild(button);
      }
      labelFilters.forEach(function (label) {
        chip(filterNames[label], filterNames[label] + ' 필터 해제', function () {
          updateLabelFilters(labelFilters.filter(function (value) { return value !== label; }));
        }, label);
      });
      if (favoritesOnly) chip('★', '즐겨찾기 필터 해제', function () { $('favorites-toggle').click(); });
      if (query) chip(query, '검색 필터 해제', function () { $('clear-search').click(); });
      if (container.children.length) {
        var clear = element('button', 'clear-filters', '필터 모두 해제');
        clear.onclick = clearBrowseFilters;
        container.appendChild(clear);
      }
      container.classList.toggle('hidden', !container.children.length);
    }
    function captureGridAnchor(){
      if(!gridGeometry||!gridViews.length)return null;
      var list=$('preset-grid'),row=Math.max(0,Math.floor((list.scrollTop-gridGeometry.top)/gridGeometry.stride)),index=Math.min(gridViews.length-1,row*gridGeometry.columns);
      return{key:gridViews[index].key,index:index,offset:list.scrollTop-(gridGeometry.top+row*gridGeometry.stride)};
    }
    function measureGrid(total){
      var list=$('preset-grid'),style=getComputedStyle(list),label=list.querySelector('.card-label'),ls=label&&getComputedStyle(label),
        labelHeight=ls?Math.max(parseFloat(ls.minHeight)||0,(parseFloat(ls.lineHeight)||14)+(parseFloat(ls.paddingTop)||0)+(parseFloat(ls.paddingBottom)||0)):34;
      return gridWindow({total:total,width:list.clientWidth||800,height:list.clientHeight||400,minWidth:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-width'))||180,gap:parseFloat(style.columnGap)||0,left:parseFloat(style.paddingLeft)||0,right:parseFloat(style.paddingRight)||0,top:parseFloat(style.paddingTop)||0,labelHeight:labelHeight,scrollTop:list.scrollTop});
    }
    function restoreGridAnchor(anchor){
      if(!anchor||!gridViews.length)return;
      var index=gridIndices.has(anchor.key)?gridIndices.get(anchor.key):Math.min(anchor.index||0,gridViews.length-1);
      $('preset-grid').scrollTop=Math.max(0,gridGeometry.top+Math.floor(index/gridGeometry.columns)*gridGeometry.stride+anchor.offset);
    }
    function ensureGridIndex(index){
      var list=$('preset-grid');if(!gridGeometry)return;
      var top=gridGeometry.top+Math.floor(index/gridGeometry.columns)*gridGeometry.stride,bottom=top+gridGeometry.cardHeight;
      if(top<list.scrollTop)list.scrollTop=top;else if(bottom>list.scrollTop+list.clientHeight)list.scrollTop=bottom-list.clientHeight;
      renderGrid();
    }
    function scheduleGrid(){if(gridFrame!==null)return;gridFrame=requestAnimationFrame(function(){gridFrame=null;renderGrid();});}
    function renderGrid() {
      var list = $('preset-grid'), existing = new Map();
      var anchor=captureGridAnchor();ensureEntryIndex();
      Array.from(list.children).forEach(function (card) {
        if (card._renderKey) existing.set(card._renderKey, card);
        else if(card!==virtualSpacer)card.remove();
      });
      var mode=JSON.stringify([category,query,favoritesOnly,labelFilters,allVariantsId]),signature=mode+'|'+((favoritesOnly||labelFilters.length)?sharedRevision:0),newViews=!viewCache||viewCache.signature!==signature;
      if(newViews){
        var filtered=filterEntries(entries,category,query,favoritesOnly,favorites).filter(function(entry){return !labelFilters.length||labelFilters.indexOf(entryLabel(entry)||'none')!==-1;});
        viewCache={signature:signature,visible:filtered,ids:new Set(filtered.map(function(e){return e.id;})),views:variantViewItems(filtered,selectionState())};
        gridIndices=new Map();viewCache.views.forEach(function(view,index){view.key=view.entry.id+(view.isVariant?'/variant/'+view.variant.id:'/group');gridIndices.set(view.key,index);});
      }
      var visible=viewCache.visible;gridViews=viewCache.views;
      renderFilterChips();
      if (selectedId && !viewCache.ids.has(selectedId)) {
        selectedId = null;
        variantsOpen = null;
        renderFooter();
      }
      $('breadcrumbs').textContent =
        (favoritesOnly ? '★ Favorites / ' : '') +
        (categoryLabel(category) || 'All items') +
        (query ? ' / “' + query + '”' : '') +
        ' · ' +
        visible.length;
      var group = viewCache.ids.has(allVariantsId)&&entriesById.get(allVariantsId);
      $('variants-back').classList.toggle('hidden', !group);
      if (group)
        $('breadcrumbs').textContent = group.name + ' · ' + group.variants.length + ' variants';
      var virtual=gridViews.length>200;list.classList.toggle('virtual-grid',virtual);list.dataset.logicalCount=String(gridViews.length);
      if(virtual&&!virtualSpacer){virtualSpacer=element('div','grid-spacer');virtualSpacer.setAttribute('aria-hidden','true');list.insertBefore(virtualSpacer,list.firstChild);}
      if(!virtual&&virtualSpacer){virtualSpacer.remove();virtualSpacer=null;}
      var previousGeometry=gridGeometry;gridGeometry=measureGrid(gridViews.length);
      if(virtualSpacer)virtualSpacer.style.height=gridGeometry.height+'px';
      if(lastBrowseMode!==mode){
        if(group&&anchor&&!groupGridAnchor)groupGridAnchor=anchor;
        if(!group&&groupGridAnchor){pendingGridAnchor=pendingGridAnchor||groupGridAnchor;groupGridAnchor=null;}
        list.scrollTop=0;restoreGridAnchor(pendingGridAnchor);pendingGridAnchor=null;cancelKeyboardVariants();
      }else if(newViews||previousGeometry&&(previousGeometry.stride!==gridGeometry.stride||previousGeometry.columns!==gridGeometry.columns))restoreGridAnchor(anchor);
      lastBrowseMode=mode;gridGeometry=measureGrid(gridViews.length);
      var indices=[],keys=new Set(),from=virtual?gridGeometry.start:0,to=virtual?gridGeometry.end:gridViews.length;
      for(var at=from;at<to;at++)indices.push(at);
      if(virtual){
        var focused=document.activeElement&&document.activeElement.closest('.preset-card'),owner=menuOwner&&menuOwner.closest&&menuOwner.closest('.preset-card');
        [focused,owner].forEach(function(card){var index=card?gridIndices.get(card._renderKey):undefined;if(index!==undefined&&indices.indexOf(index)<0)indices.push(index);});indices.sort(function(a,b){return a-b;});
      }
      indices.forEach(function(index){keys.add(gridViews[index].key);});
      existing.forEach(function (card, key) {
        if (!keys.has(key)) {
          if(variantsOpen===card.dataset.entryId){variantsOpen=null;variantsExpanded=false;cancelKeyboardVariants();}
          if(card._libraryPreview)card._libraryPreview.destroy();
          if (scope.ContentriumPreview) scope.ContentriumPreview.unmount(card.querySelector('.preview-wrap'));
          card.remove();
          existing.delete(key);
        }
      });
      if (!visible.length) {
        list.appendChild(
          element(
            'div',
            'empty',
            entries.length ? 'No results found.' : '등록된 프리셋이 없습니다.',
          ),
        );
        updateVariantOverflow();
        return;
      }
      var tabStopIndex=from;
      if(virtual)indices.some(function(index){var view=gridViews[index];if(selectedId===view.entry.id&&(!view.isVariant||view.variant.id===selectedVariants[view.entry.id])){tabStopIndex=index;return true;}return false;});
      indices.forEach(function (index, mountedIndex) {
        var view=gridViews[index];
        if(!view.isVariant)view.variant=defaultVariant(view.entry,selectedVariants[view.entry.id]);
        view.selected=selectedId===view.entry.id&&(!view.isVariant||view.variant.id===selectedVariants[view.entry.id]);
        var entry = view.entry,
          variant = view.variant,
          card = existing.get(view.key) || element('article', 'preset-card');
        card._renderKey = view.key;
        card._logicalIndex=index;
        var layoutKey=[virtual,index,gridViews.length,gridGeometry.columns,gridGeometry.cardWidth,gridGeometry.stride,gridGeometry.left,gridGeometry.top].join('|');
        if(card._layoutKey!==layoutKey){
          if(virtual){card.style.left=(gridGeometry.left+(index%gridGeometry.columns)*(gridGeometry.cardWidth+gridGeometry.gap))+'px';card.style.top=(gridGeometry.top+Math.floor(index/gridGeometry.columns)*gridGeometry.stride)+'px';card.style.width=gridGeometry.cardWidth+'px';}
          else {card.style.removeProperty('left');card.style.removeProperty('top');card.style.removeProperty('width');}
          card.setAttribute('aria-setsize',String(gridViews.length));card.setAttribute('aria-posinset',String(index+1));card._layoutKey=layoutKey;
        }
        var tabStop=virtual?(index===tabStopIndex?0:-1):0;if(card.tabIndex!==tabStop)card.tabIndex=tabStop;
        var childIndex=mountedIndex+(virtual?1:0);if(list.children[childIndex]!==card)list.insertBefore(card,list.children[childIndex]||null);
        var renderSignature=JSON.stringify([variant.id,view.selected,variantsOpen===entry.id,view.isVariant,favorites.has(entry.id),entryLabel(entry)]);
        if(card._entry===entry&&card._renderSignature===renderSignature&&existing.has(view.key))return;
        card._entry=entry;card._renderSignature=renderSignature;
        card.classList.toggle('selected', view.selected);
        card.classList.toggle('variants-open', variantsOpen === entry.id && !view.isVariant);
        card.setAttribute('role', 'listitem');
        card.dataset.entryId = entry.id;
        card.dataset.variantId = variant.id;
        if(entry.source==='library')card.dataset.libraryState=entry.libraryItem.missing?'missing':variant.available?'ready':'unavailable';
        else delete card.dataset.libraryState;
        if (entryLabel(entry)) card.dataset.label = entryLabel(entry);
        else delete card.dataset.label;
        card.setAttribute('aria-label', entry.name + ' · ' + (variant.name || variant.id));
        var previewKey = JSON.stringify([variant.id, variant.preview, variant.renderedPreview, variant.available,entry.libraryItem&&[entry.libraryItem.path,entry.libraryItem.preview,entry.libraryItem.sourceFileSize,entry.libraryItem.missing,entry.libraryItem.ambiguous]]),
          wrap = card.querySelector('.preview-wrap');
        if (!wrap || card._previewKey !== previewKey) {
          if (wrap) {
            if(card._libraryPreview){card._libraryPreview.destroy();card._libraryPreview=null;}
            if (scope.ContentriumPreview) scope.ContentriumPreview.unmount(wrap);
            wrap.remove();
          }
          wrap = element('div', 'preview-wrap');
          if(entry.source==='library')card._libraryPreview=scope.ContentriumLibrary.mountPreview(wrap,entry.libraryItem,{thumbnails:thumbnails});
          else {
            try { resolvePreview(variant.preview); }
            catch (error) { wrap.appendChild(element('span', 'preview-message', error.message)); }
            if (scope.ContentriumPreview) scope.ContentriumPreview.mount(wrap, entry, variant);
            else wrap.appendChild(element('span', 'preview-message', 'Preview unavailable'));
          }
          if (variant.available !== true) wrap.appendChild(element('span', 'preview-badge', entry.source==='library'?'사용 불가':availabilityText(variant)));
          card.insertBefore(wrap, card.firstChild);
          card._previewKey = previewKey;
        }
        var label = card.querySelector('.card-label') || element('div', 'card-label'),
          type = variantType(variant);
        var typeIcon = label.querySelector('.preset-type') || element('span', 'preset-type');
        typeIcon.textContent = type === 1 ? '↦' : type === 3 ? '◆' : '▧';
        if (!typeIcon.parentNode) label.appendChild(typeIcon);
        var name = label.querySelector('.preset-name') || element('span', 'preset-name');
        name.textContent = view.isVariant ? variant.name || variant.id : entry.name;
        name.title = entry.name + ' · ' + (variant.name || variant.id);
        if (!name.parentNode) label.appendChild(name);
        if (entry.variants.length > 1 && !view.isVariant) {
          var menuButton = label.querySelector('.variant-button') || element('button', 'variant-button', '≡');
          menuButton.title = '변형 ' + entry.variants.length + '개';
          menuButton.setAttribute('aria-label', entry.name + ' 변형 선택');
          menuButton.setAttribute('aria-expanded', String(variantsOpen === entry.id));
          menuButton.onclick = function (event) {
            event.stopPropagation();
            if (selectedId === entry.id && variantsOpen === entry.id) {
              variantsExpanded = false;
              variantsOpen = null;
              renderGrid();
            } else choose(entry);
          };
          if (!menuButton.parentNode) label.appendChild(menuButton);
        }
        var star = label.querySelector('.card-star') || element('button', 'card-star', '★');
        star.classList.toggle('active', favorites.has(entry.id));
        star.classList.toggle('hidden', view.isVariant);
        star.title = favorites.has(entry.id) ? '즐겨찾기 해제' : '즐겨찾기 저장';
        star.setAttribute('aria-pressed', String(favorites.has(entry.id)));
        star.setAttribute('aria-label', entry.name + ' ' + star.title);
        star.onclick = function (event) {
          event.stopPropagation();
          toggleFavorite(entry);
        };
        if (!star.parentNode) label.appendChild(star);
        if (!label.parentNode) card.appendChild(label);
        card.onclick = function (event) {
          var key = entry.id + '/' + variant.id,
            now = Date.now(),
            twice = event.detail !== 0 && lastCardClick && lastCardClick.card === card &&
              lastCardClick.key === key && now - lastCardClick.time < 500 &&
              Math.abs(event.clientX - lastCardClick.x) < 10 && Math.abs(event.clientY - lastCardClick.y) < 10;
          lastCardClick = twice || event.detail === 0 ? null : { card: card, key: key, time: now, x: event.clientX, y: event.clientY };
          if (twice) {
            choose(entry, variant, false);
            if (variant.available === true) apply('both');
          } else if (selectedId === entry.id && activeVariant().id === variant.id) clearSelection();
          else choose(entry, variant);
        };
        card.oncontextmenu = function (event) {
          showMenu(
            event,
            [
              {
                label: '즐겨찾기 ' + (favorites.has(entry.id) ? '해제' : '추가'),
                run: function () {
                  toggleFavorite(entry);
                },
              },
              {
                label: '이 분류 보기',
                run: function () {
                  cancelKeyboardVariants();
                  category = entryCategory(entry);
                  allVariantsId = null;
                  saveUI();
                  renderTree();
                  renderGrid();
                },
              },
              { label: '이 폴더에 집중', disabled: entryCategory(entry) === focusFolder, run: function () { setFocusedFolder(entryCategory(entry)); } },
              {
                label: '변형 모두 보기',
                disabled: entry.variants.length < 2,
                run: function () {
                  choose(entry, variant);
                  allVariantsId = entry.id;
                  renderGrid();
                },
              },
              { separator: true },
            ].concat(labelMenu('item:' + entry.id)),
          );
        };
        card.onkeydown = function (event) {
          if (event.target !== card) return;
          var key = event.key;
          if (
            (event.altKey && (key === 'ArrowUp' || key === 'ArrowDown')) ||
            key === 'W' ||
            key === 'S'
          ) {
            event.preventDefault();
            var at = entry.variants.indexOf(variant),
              delta = key === 'ArrowUp' || key === 'W' ? -1 : 1;
            choose(
              entry,
              entry.variants[(at + delta + entry.variants.length) % entry.variants.length],
            );
            return;
          }
          if (key === 'Enter') {
            choose(entry, variant);
            event.preventDefault();
          } else if (
            [
              'ArrowRight',
              'ArrowLeft',
              'ArrowUp',
              'ArrowDown',
              'a',
              'd',
              'w',
              's',
              'Home',
              'End',
            ].indexOf(key) !== -1
          ) {
            event.preventDefault();
            var nextIndex=core.gridTarget(card._logicalIndex,key,gridGeometry.columns,gridViews.length),nextView=gridViews[nextIndex];
            if (nextView) {
              if (nextIndex === card._logicalIndex) return;
              var e=nextView.entry,id=e.id,vid=nextView.isVariant?nextView.variant.id:defaultVariant(e,selectedVariants[e.id]).id;
              ensureGridIndex(nextIndex);
              choose(
                e,
                e.variants.find(function (v) {
                  return v.id === vid;
                }),
                false,
              );
              if (e.variants.length > 1 && !allVariantsId) keyboardVariantsTimer = setTimeout(function () {
                keyboardVariantsTimer = null;
                if (selectedId === id && currentTab === 'browse' && !allVariantsId) {
                  variantsExpanded = true;
                  variantsOpen = id;
                  renderGrid();
                }
              }, 1000);
              var focused = Array.from(list.querySelectorAll('.preset-card')).find(function (n) {
                return n.dataset.entryId === id && n.dataset.variantId === vid;
              });
              if (focused) {
                focused.focus({preventScroll:true});
                focused.scrollIntoView({ block: 'nearest' });
              }
            }
          }
        };

        var menu = card.querySelector('.inline-variants'), menuKey = JSON.stringify(entry.variants.map(function (v) { return [v.id, v.name, v.available]; }));
        if (menu && (!(variantsOpen === entry.id && !view.isVariant) || card._menuKey !== menuKey)) {
          menu.remove();
          menu = null;
        }
        if (variantsOpen === entry.id && !view.isVariant && !menu) {
          menu = element('div', 'inline-variants');
          card._menuKey = menuKey;
          menu.setAttribute('role', 'group');
          menu.setAttribute('aria-label', entry.name + ' variants');
          var variantList = element('div', 'variant-list');
          entry.variants.forEach(function (v) {
            var item = element(
              'button',
              'variant-row' + (v.id === variant.id ? ' active' : ''),
              v.name || v.id,
            );
            item.dataset.variantId = v.id;
            item.setAttribute('aria-label', v.name || v.id);
            item.setAttribute('aria-pressed', String(v.id === variant.id));
            if (v.available !== true) item.appendChild(element('span', 'variant-state', availabilityText(v)));
            item.onclick = function (event) {
              event.stopPropagation();
              lastCardClick = null;
              choose(entry, v);
            };
            variantList.appendChild(item);
          });
          menu.appendChild(variantList);
          var all = element('button', 'view-all-variants', 'View all at once');
          all.onclick = function (event) {
            event.stopPropagation();
            lastCardClick = null;
            allVariantsId = entry.id;
            renderGrid();
          };
          menu.appendChild(all);
          card.appendChild(menu);
        }
        if (menu) Array.from(menu.querySelectorAll('.variant-row')).forEach(function (item) {
          var active = item.dataset.variantId === variant.id;
          item.classList.toggle('active', active);
          item.setAttribute('aria-pressed', String(active));
        });
        // Leaving retained nodes in place also preserves their media playback and focus.
      });
      updateVariantOverflow();
    }
    function animatedFontDefinition(variant) {
      if(!variant||variantType(variant)!==11)return null;
      var fonts=hostInfo&&hostInfo.animatedFonts,match=fonts&&Array.isArray(fonts.available)&&fonts.available.find(function(def){return def.id===variant.fontId&&def.digest===variant.fontHash;});
      return match?{id:match.id,digest:match.digest,name:match.name,coverage:match.coverage,available:variant.available===true&&!!(fonts.capabilities&&fonts.capabilities.add===true)}:{id:variant.fontId,digest:variant.fontHash,available:false};
    }
    function guardAnimatedFontDispatch(payload) {
      var current=animatedFontDefinition(activeVariant());
      if(!connected||!current||current.available!==true||current.id!==payload.fontId||current.digest!==payload.fontHash)
        throw new Error('연결 또는 애니메이션 글자 스타일이 바뀌었습니다. 현재 상태를 다시 확인하세요.');
    }
    function renderFooter() {
      syncPreviewSound();
      var entry = activeEntry(),
        variant = activeVariant(),
        actions = $('apply-actions');
      var fontDefinition=animatedFontDefinition(variant);
      if(fontDefinition){
        if(!animatedFontUI&&scope.ContentriumAnimatedFont)animatedFontUI=scope.ContentriumAnimatedFont.create({
          container:$('animated-font-entry'),
          call:function(method,payload){guardAnimatedFontDispatch(payload);return operation('애니메이션 글자를 추가하는 중…',function(){guardAnimatedFontDispatch(payload);return callHost(method,payload);},null,true);},
          getContext:function(){return{context:core.contextPayload(layerState),expectedRevision:layerState&&layerState.projectRevision};},
          isBusy:function(){return busy||!!(hostQueue&&hostQueue.isBusy());},
          onApplied:function(){status('애니메이션 글자를 추가했습니다.');refreshState();},
          onError:function(error){status(error.message||String(error),'error');}
        });
      }
      if(animatedFontUI){animatedFontUI.select(fontDefinition);animatedFontUI.updateState({busy:busy||!!(hostQueue&&hostQueue.isBusy()),connected:connected});}
      var signature=footerSignature(entry,variant,hostInfo,layerState,busy,connected);
      if(fontDefinition)signature=JSON.stringify([entry.id,variant.id,fontDefinition]);
      if(signature===lastFooterSignature){
        var retainedRate=actions.querySelector('input[aria-label="이미지 시퀀스 프레임레이트"]');
        if(retainedRate&&workspaceUI&&entry&&entry.libraryItem&&document.activeElement!==retainedRate){var currentRate=workspaceUI.getItemOptions(entry.libraryItem.id).sequenceFPS||'';if(retainedRate.value!==currentRate)retainedRate.value=currentRate;}
        return;
      }
      lastFooterSignature=signature;
      actions.textContent = '';
      Array.from(actions.parentNode.querySelectorAll('.precomp-options')).forEach(function (n) {
        n.remove();
      });
      $('selection-label').textContent = entry ? entry.name : '프리셋을 선택하세요.';
      $('variant-summary').textContent = variant
        ? (variant.name || '') + (variant.available === true ? '' : ' · ' + availabilityText(variant))
        : '';
      if (!variant) return;
      if(fontDefinition){$('variant-summary').textContent=fontDefinition.name||'사용할 수 없는 애니메이션 글자 스타일';return;}
      if(entry.source==='library'){
        var item=entry.libraryItem,library=workspaceUI&&workspaceUI.getLibrary(),type=item.kind||item.type,isSequence=type==='image-sequence',rate=null;
        $('variant-summary').textContent=entry.availabilityReason||variant.name;
        if(isSequence){rate=element('input');rate.type='number';rate.min='0.001';rate.max='99';rate.step='any';rate.placeholder='원본 해석';rate.setAttribute('aria-label','이미지 시퀀스 프레임레이트');if(workspaceUI){rate.value=workspaceUI.getItemOptions(item.id).sequenceFPS||'';rate.oninput=function(){workspaceUI.setSequenceRate(item.id,rate.value);};}actions.appendChild(rate);}
        function button(text,enabled,run){var b=element('button','apply-button',text);b.disabled=!enabled;b.onclick=run;actions.appendChild(b);return b;}
        button(/^(preset|animation-preset)$/.test(type)?'적용':'가져오기',!busy&&connected&&scope.ContentriumLibrary.canImport(item,library),function(){applyLibrary(false,rate);});
        var textureCaps=layerState&&layerState.precompApplyOptions||{};
        if(scope.ContentriumLibrary.canReplace(item,library)&&scope.ContentriumLibrary.canReplaceSelection(item,layerState))button('선택 항목 교체',!busy&&connected&&layerState&&layerState.numSelectedLayers>0&&!textureCaps.textureSelected,function(){applyLibrary(true,rate);});
        if(/^(image|video|image-sequence)$/.test(type)){
          var textureSource=scope.ContentriumLibrary.canTexture(item,library),canTexture=!busy&&connected&&textureSource;
          button('Texture',canTexture&&textureCaps.canApplyTexture===true,function(){applyLibrary(false,rate,true);}).dataset.textureAction='apply';
          button('텍스처 교체',canTexture&&textureCaps.canReplaceTexture===true,function(){applyLibrary(true,rate,true);}).dataset.textureAction='replace';
        }
        button('크게 미리보기',thumbnailArtifacts.has(item.id)||(!!scope.ContentriumLibrary.previewKind(item)&&!!scope.ContentriumLibrary.mediaSource(item)),function(){
          if(largePreview)largePreview.close();
          largePreview=scope.ContentriumLibrary.openPreview(item,{artifact:thumbnailArtifacts.get(item.id),onClose:function(){largePreview=null;previewActivity();}});previewActivity();
        });
        if(thumbnails&&thumbnails.canSelectPreview&&thumbnails.canSelectPreview(item))button('미리보기 컴포지션 선택',!busy,function(){
          var card=Array.from(document.querySelectorAll('#preset-grid .preset-card')).find(function(value){return value.dataset.entryId===entry.id;});
          if(!card||!card._libraryPreview||!card._libraryPreview.selectPreviewComposition)return;
          card._libraryPreview.selectPreviewComposition().catch(function(error){status(error.message,'error');});
        });
        if(thumbnails&&/^(preset|animation-preset|project)$/.test(type))button('현재 컴포지션으로 미리보기 만들기',!busy&&connected&&supports('thumbnailAction')&&!!layerState&&!!layerState.context,function(){
          var captured={context:JSON.parse(JSON.stringify(layerState.context)),expectedRevision:layerState.projectRevision};
          callHost('thumbnailAction',Object.assign({action:'describe'},captured)).then(function(info){return thumbnails.request(item,{force:true,capture:Object.assign({},info,captured)});}).then(function(result){if(result.state!=='ready')throw new Error(result.error&&result.error.message||'미리보기를 만들지 못했습니다.');status('현재 컴포지션의 작업 영역을 미리보기로 저장했습니다.');}).catch(function(error){status(error.message,'error');});
        });
        else if(thumbnails&&/^(video|image-sequence)$/.test(type))button('미리보기 다시 만들기',true,function(){thumbnails.request(item,{force:true});});
        button('상세 설정',!!workspaceUI&&!busy,function(){Promise.resolve(selectTab('library',true)).then(function(){workspaceUI.revealLibraryItem(item.id);});});
        return;
      }
      if (variantType(variant) === 10) {
        var optionsBox = element('div', 'precomp-options'),
          caps = (hostInfo && hostInfo.applyOptions) || {},
          variantCaps = (caps.byVariant && caps.byVariant[variant.id]) || {};
        function optionCheck(key, label, enabled) {
          var wrapper = element('label', ''),
            check = element('input');
          check.type = 'checkbox';
          check.checked = enabled && precompOptions[key] === true;
          check.disabled = !enabled;
          check.title = enabled ? '' : '현재 항목 또는 연결에서 사용할 수 없습니다.';
          check.onchange = function () {
            precompOptions[key] = check.checked;
            if (key === 'sound') syncPreviewSound();
          };
          wrapper.appendChild(check);
          wrapper.appendChild(element('span', '', label));
          optionsBox.appendChild(wrapper);
        }
        var timed = variantCaps.hasInOutAnims === true;
        optionCheck('animateIn', 'Animate In', !!timed);
        optionCheck('animateOut', 'Animate Out', !!timed);
        optionCheck('sound', '효과음 추가', variantCaps.containsAudio === true);
        var preserve = element('details'),
          summary = element('summary', '', '교체 시 보존');
        preserve.appendChild(summary);
        [
          ['keepTexts', '텍스트'],
          ['keepTextProperties', '텍스트 속성'],
          ['keepTransform', '변형 속성'],
          ['keepOtherProperties', '기타 속성'],
        ].forEach(function (pair) {
          var label = element('label'),
            input = element('input');
          input.type = 'checkbox';
          input.checked = precompOptions[pair[0]];
          input.onchange = function () {
            precompOptions[pair[0]] = input.checked;
          };
          label.appendChild(input);
          label.appendChild(element('span', '', pair[1]));
          preserve.appendChild(label);
        });
        optionsBox.appendChild(preserve);
        actions.parentNode.insertBefore(optionsBox, actions);
        if(previewAudioPreparer&&variantCaps.containsAudio){var soundSetup=element('button','apply-button','미리보기 효과음 설정');soundSetup.onclick=function(){scope.ContentriumPreviewAudioPreparer.openRecipeDialog(variant,{preparer:previewAudioPreparer,onPrepared:function(){scope.ContentriumPreview.setAudioResolver(previewAudioResolver);}});};actions.appendChild(soundSetup);}
        var replace = element('button', 'apply-button', 'Replace');
        replace.disabled =
          busy ||
          !connected ||
          !footerCanReplace(variantCaps,layerState);
        replace.title = replace.disabled ? '교체할 프리컴포지션을 선택하세요.' : '';
        replace.onclick = function () {
          apply('both', { replaceSelected: true });
        };
        actions.appendChild(replace);
        var texture = element('button', 'apply-button', 'Texture');
        texture.disabled = busy || !connected || variantCaps.canApplyTexture !== true;
        texture.title = texture.disabled ? '이 항목은 텍스처 삽입을 지원하지 않습니다.' : '';
        texture.onclick = function () {
          apply('both', { insertAsTexture: true });
        };
        actions.appendChild(texture);
      }
      var transition = variantType(variant) === 1;
      if (transition) actions.appendChild(element('span', '', 'Animate:'));
      (transition
        ? [
            ['In', 'in'],
            ['Out', 'out'],
            ['Both', 'both'],
          ]
        : [['Apply', 'both']]
      ).forEach(function (pair) {
        var button = element('button', 'apply-button', pair[0]);
        var directionAccepted=!variant.applyDirections||variant.applyDirections.indexOf(pair[1])!==-1;
        button.disabled = busy || variant.available !== true || !directionAccepted;
        button.title =
          variant.available === true
            ? (directionAccepted?'선택 레이어에 프리셋 적용':'이 방향은 아직 정밀 검증되지 않았습니다.')
            : '이 변형은 애니메이션 준비 중입니다.';
        button.onclick = function () {
          apply(pair[1]);
        };
        actions.appendChild(button);
      });
    }
    function operation(message, action, onDone, deferError) {
      if (busy) return Promise.reject(new Error('진행 중인 AE 작업이 있습니다.'));
      busy = true;
      previewActivity();
      renderFooter();
      status(message, 'busy');
      return Promise.resolve()
        .then(action)
        .then(function (result) {
          if (onDone) onDone(result);
          return result;
        })
        .catch(function (error) {
          if(!deferError)status(error.message || String(error), 'error');
          throw error;
        })
        .finally(function () {
          busy = false;
          previewActivity();
          renderFooter();
        });
    }
    function apply(direction, extra) {
      if(activeVariant()&&variantType(activeVariant())===11)return;
      if(activeEntry()&&activeEntry().source==='library'){applyLibrary(false);return;}
      var payload;
      try {
        payload = selectionPayload(entries, selectionState(), direction, layerState);
        if(payload.variantId==='1b8'){if(!layerState||!core.contextPayload(layerState)||!Number.isFinite(layerState.projectRevision))throw new Error('현재 프로젝트 선택 상태를 새로고침한 뒤 적용하세요.');payload.context=core.contextPayload(layerState);payload.expectedRevision=layerState.projectRevision;}
        if (variantType(activeVariant()) === 10) {
          payload.options = Object.assign({}, precompOptions, extra || {});
          var optionCaps =
            (hostInfo &&
              hostInfo.applyOptions &&
              hostInfo.applyOptions.byVariant &&
              hostInfo.applyOptions.byVariant[payload.variantId]) ||
            {};
          if (optionCaps.hasInOutAnims !== true) {
            delete payload.options.animateIn;
            delete payload.options.animateOut;
          }
          if (optionCaps.containsAudio !== true) payload.options.sound = false;
        }
      } catch (error) {
        status(error.message, 'error');
        return;
      }
      function applied(result){var feedback=applyFeedback(result);lastMissingAudio=feedback.missingAudio;status(feedback.text,feedback.tone);renderAudioNotice();refreshState();}
      operation(
        '프리셋을 적용하는 중…',
        function () {
          return callHost('applyPreset', payload);
        },
        applied,
        payload.variantId==='1b8',
      ).catch(function(error){if(payload.variantId!=='1b8')return;if(!isConversionConfirmation(error)){status(error.message||String(error),'error');return;}showConversionConfirmation(payload,error,applied);});
    }
    function showConversionConfirmation(payload,error,onDone){
      if(document.querySelector('.conversion-confirmation-dialog'))return;var frozenPayload=JSON.parse(JSON.stringify(payload)),frozenError={code:error.code,type:error.type,message:error.message,retryOptions:JSON.parse(JSON.stringify(error.retryOptions)),retryContext:JSON.parse(JSON.stringify(error.retryContext)),mutationStarted:false},dialog=element('dialog','conversion-confirmation-dialog'),message=element('p','',error.message),actions=element('div','dialog-actions'),cancel=element('button','','취소'),proceed=element('button','','계속'),submitted=false;
      dialog.setAttribute('aria-label','3D 레이어 변환');cancel.type=proceed.type='button';cancel.onclick=function(){dialog.close();};proceed.onclick=function(){if(submitted)return;submitted=true;proceed.disabled=true;var retry;try{retry=conversionRetryPayload(frozenPayload,frozenError);}catch(invalid){status(invalid.message,'error');dialog.close();return;}dialog.close();operation('3D 레이어로 변환한 뒤 프리셋을 적용하는 중…',function(){return callHost('applyPreset',retry);},onDone).catch(function(){});};dialog.addEventListener('close',function(){dialog.remove();});actions.append(cancel,proceed);dialog.append(message,actions);document.body.appendChild(dialog);dialog.showModal();
    }
    function applyLibrary(replace,rate,texture) {
      var entry=activeEntry();if(!entry||entry.source!=='library'||!workspaceUI)return;
      var options={};
      try{if(rate)options=scope.ContentriumWorkspace.sequenceOptions(rate.value);}catch(error){status(error.message,'error');return;}
      if(replace)Object.assign(options,{keepTexts:true,keepTextProperties:false,keepTransform:true,keepOtherProperties:false});
      if(texture)Object.assign(options,{insertAsTexture:true,keepOtherProperties:!!replace});
      operation(texture?(replace?'텍스처를 교체하는 중…':'텍스처를 적용하는 중…'):(replace?'선택 항목을 교체하는 중…':'사용자 항목을 가져오는 중…'),function(){
        return workspaceUI[replace?'replaceLibraryItem':'importLibraryItem'](entry.libraryItem.id,options,{userInitiated:true});
      },function(result){status(result&&result.cancelled?'가져오기를 취소했습니다.':'사용자 항목을 적용했습니다.');refreshState();}).catch(function(){});
    }
    function currentAudio() {
      return layerState && layerState.audio
        ? audioDetails(layerState)
        : { missing: lastMissingAudio, root: (hostInfo && hostInfo.audioRoot) || '' };
    }
    function syncPreviewSound() {
      var preview=scope.ContentriumPreview, entry=activeEntry(), variant=activeVariant(),
        caps=hostInfo&&hostInfo.applyOptions&&hostInfo.applyOptions.byVariant,
        hasSound=!!(variant&&caps&&caps[variant.id]&&caps[variant.id].containsAudio);
      $('preview-audio-controls').classList.toggle('hidden',!hasSound);
      if (preview&&preview.setAudioSelection) preview.setAudioSelection(hasSound ? {
        entryId:entry.id,variantId:variant.id,insertSound:precompOptions.sound,
        muted:previewMuted,busy:busy||!!largePreview||currentTab!=='browse',volume:previewVolume
      } : null);
    }
    if (scope.ContentriumPreview&&scope.ContentriumPreview.setAudioStateListener) scope.ContentriumPreview.setAudioStateListener(function (value) {
      var labels={disabled:'미리듣기 꺼짐',loading:'미리듣기 준비 중…',missing:'이 변형의 미리듣기 파일이 없습니다.',unavailable:'미리듣기를 사용할 수 없습니다.',failed:'미리듣기 파일을 읽지 못했습니다.',blocked:'음소거를 껐다 켜서 재생을 허용하세요.',ready:previewMuted?'음소거':value.playing?'미리듣기 재생 중':'미리듣기 준비됨'};
      $('preview-audio-state').textContent=labels[value.status]||'';
      $('preview-audio-state').dataset.state=value.status;
      $('preview-audio-state').title=value.message||'';
    });
    $('preview-audio-muted').onchange=function(){previewMuted=this.checked;syncPreviewSound();saveUI();};
    $('preview-audio-volume').oninput=function(){previewVolume=Number(this.value)/100;syncPreviewSound();saveUI();};
    function renderAudioNotice() {
      var details = currentAudio(),
        banner = $('audio-notice');
      banner.classList.toggle('hidden', !details.missing.length);
      $('audio-notice-text').textContent = details.missing.length
        ? '이 인스턴스에 효과음 ' + details.missing.length + '개가 연결되지 않았습니다.'
        : '';
      $('audio-open').classList.toggle('audio-missing', !!details.missing.length);
    }
    function showAudioGuide() {
      var details = currentAudio(),
        root =
          details.root ||
          (hostInfo && hostInfo.audioRoot) ||
          '%APPDATA%\\Contentrium\\Preset\\UserAudio';
      $('audio-folder').value = root;
      $('audio-missing-keys').textContent = details.missing.length
        ? '등록되지 않은 키: ' + details.missing.join(', ')
        : '효과음 파일은 설치 패키지에 포함되지 않습니다.';
      $('audio-example').value = audioLibraryExample(details.missing);
      $('audio-dialog').showModal();
    }
    function renderEditor() {
      renderAudioNotice();
      $('capture').disabled =
        !supports('saveLibraryPreset') || !layerState || !layerState.numSelectedLayers;
      if (editorUI) editorUI.render(layerState);
    }
    function refreshState(options) {
      var requireFresh=options&&options.requireFresh===true;
      if (editorUI && editorUI.isMediaDialogOpen()) return requireFresh?Promise.reject(new Error('미디어 편집 창을 닫은 뒤 현재 상태를 확인하세요.')):Promise.resolve();
      if (!connected) {
        renderEditor();
        return requireFresh?Promise.reject(new Error('AE 연결을 확인한 뒤 현재 상태를 새로고침하세요.')):Promise.resolve();
      }
      if (hostQueue && hostQueue.isBusy()&&!requireFresh) return Promise.resolve();
      return callHost('getState', {})
        .then(function (state) {
          if (editorUI && editorUI.isMediaDialogOpen()) {if(requireFresh)throw new Error('미디어 편집 창을 닫은 뒤 현재 상태를 확인하세요.');return;}
          var previous = lastInstance;
          layerState = state;
          lastHostStateReceipt={receivedAt:Date.now(),revision:state.revision==null?null:state.revision};
          if(transportNotice&&transportNotice.waitingFresh&&!getTransportState().waitingLate)status('AE 연결이 복구되었습니다.');
          if(transportChanged)transportChanged();
          if (workspaceUI) workspaceUI.updateToolState(state);
          var detached = editIsDetached();
          var target = core.autoTab(
            currentTab,
            tabMode,
            previous,
            state,
            detached,
            lastSeparateEdit,
          );
          lastSeparateEdit = detached;
          lastInstance = state.instanceId;
          if ((currentTab === 'browse' || currentTab === 'edit') && target !== currentTab)
            selectTab(target, true);
          var focused =
              document.querySelector('#editor-controls :focus') ||
              $('editor-controls').dataset.gestureActive === 'true',
            sameInstance = lastRenderState && lastRenderState.instanceId === state.instanceId;
          if (focused && sameInstance && editorUI) editorUI.updateFocusedMetadata(state);
          if (
            !(focused && sameInstance) &&
            (lastRevision !== state.revision || !lastRenderState || state.revision == null)
          ) {
            renderEditor();
            lastRenderState = state;
            lastRevision = state.revision;
          }
          renderAudioNotice();
          renderFooter();
          return state;
        })
        .catch(function (error) {
          status(error.message, 'error');
          if(requireFresh)throw error;
        });
    }
    function connectHost() {
      connected=false;
      renderFooter();
      if (!scope.__adobe_cep__) return Promise.resolve();
      return callHost('hostStatus', {})
        .then(function (result) {
          hostInfo = result;
          if(attachOperationCapabilities(builtInEntries,result))renderGrid();
          lastRevision = null;
          connected = !!result && result.available !== false;
          receiveFonts(result&&result.animatedFonts);
          renderFooter();
          if(connected&&result.audioRoot&&scope.ContentriumThumbnails&&!thumbnails){
            try{
              var nodeRequire=typeof require==='function'?require:scope.cep_node&&scope.cep_node.require,path=nodeRequire('path'),base=path.dirname(result.audioRoot);
              if(!fileLeases)fileLeases=scope.ContentriumFileLease.create({root:base,windowId:panelSlot,ownerId:panelToken,nodeRequire:nodeRequire});
              var aepWorker=createPreviewWorker(nodeRequire,callHost);
              thumbnails=scope.ContentriumThumbnails.create({nodeRequire:nodeRequire,worker:aepWorker,leases:fileLeases,windowId:panelSlot,ownerId:panelToken,cacheRoot:path.join(base,'ThumbnailCache'),resolveDestination:function(item){return callHost('libraryPreviewDestination',{id:item.id,sourceStamp:item.sourceStamp});},captureFrame:function(params){return callHost('thumbnailAction',Object.assign({action:'frame'},params));},cleanupFrames:async function(jobId){var began=Date.now();while(true){var result=await callHost('thumbnailAction',{action:'cleanup',jobId:jobId},{waitForLate:true});if(!result.pending)return result;if(Date.now()-began>60000)throw new Error('AE가 임시 프레임을 사용 중입니다. 렌더링 완료 후 패널을 새로고침하세요.');await new Promise(function(resolve){setTimeout(resolve,250);});}
              },onChange:function(job){
                var previous=thumbnailArtifacts.get(job.id);
                if(job.state==='ready'&&job.artifact)thumbnailArtifacts.set(job.id,job.artifact);else thumbnailArtifacts.delete(job.id);
                if(previous!==thumbnailArtifacts.get(job.id)){lastFooterSignature=null;renderFooter();}
                var pending=job.state==='waiting'||job.state==='generating';$('thumbnail-progress').classList.toggle('hidden',!pending&&job.remaining<=1);$('thumbnail-progress-label').textContent='미리보기 '+(job.completedFrames||0)+' / '+job.totalFrames+' · '+job.remaining+'개';
              },onIdle:function(){$('thumbnail-progress').classList.add('hidden');}});
              $('thumbnail-stop').onclick=function(){thumbnails.cancelAll();if(panelSync)panelSync.thumbnailCancel();};
              document.querySelectorAll('.preset-card[data-library-state]').forEach(function(card){card._previewKey=null;});
            }catch(thumbnailSetupError){if(aepWorker)aepWorker.dispose();status(thumbnailSetupError.message,'error');}
          }
          if (connected && result.audioRoot && scope.ContentriumPreviewAudioSource && scope.ContentriumPreview) {
            try {
              var audioOptions={audioRoot:result.audioRoot,extensionPath:scope.__adobe_cep__.getSystemPath('extension'),leases:fileLeases};
              if(scope.ContentriumPreviewAudioPreparer)previewAudioPreparer=scope.ContentriumPreviewAudioPreparer.createPreparer(audioOptions);
              previewAudioResolver=scope.ContentriumPreviewAudioSource.createResolver(Object.assign({},audioOptions,{preparer:previewAudioPreparer}));
              scope.ContentriumPreview.setAudioResolver(previewAudioResolver);
            } catch (audioSetupError) {
              scope.ContentriumPreview.setAudioResolver(function () { return Promise.reject(audioSetupError); });
            }
          }
          $('connection').textContent = connected ? 'AE · Connected' : 'Engine unavailable';
          $('connection').classList.toggle('online', connected);
          if (!connected)
            status(
              (result && result.message) || 'Contentrium Preset을 사용할 수 없습니다.',
              'error',
            );
          if (workspaceUI) workspaceUI.init();
          if(connected&&!helperTool&&!separateEdit&&!welcomeScheduled){welcomeScheduled=true;showWelcome(false).catch(function(error){status(error.message,'error');});}
          return refreshState();
        })
        .catch(function (error) {
          connected = false;
          renderFooter();
          $('connection').textContent = 'Engine unavailable';
          $('connection').classList.remove('online');
          status(error.message, 'error');
          renderEditor();
        });
    }
    function loadCatalog() {
      var nodeRequire=typeof require==='function'?require:scope.cep_node&&scope.cep_node.require,catalogPromise=null;
      catalogIdMigration={};
      if(scope.__adobe_cep__&&nodeRequire){
        try{
          var processApi=nodeRequire('process'),pathApi=nodeRequire('path'),fsApi=nodeRequire('fs'),appData=processApi.env&&processApi.env.APPDATA;
          if(!appData)appData=pathApi.join(nodeRequire('os').homedir(),'AppData','Roaming');
          var converted=readConvertedCatalog(appData,fsApi,pathApi);
          if(converted){
            convertedLibraryRoot=converted.root;
            if(scope.ContentriumPreview&&scope.ContentriumPreview.setConvertedLibraryRoot)scope.ContentriumPreview.setConvertedLibraryRoot(convertedLibraryRoot);
            try{var extensionRoot=decodeURI(scope.__adobe_cep__.getSystemPath('extension'));if(/^file:/i.test(extensionRoot))extensionRoot=nodeRequire('url').fileURLToPath(extensionRoot);var previousFile=pathApi.join(extensionRoot,'library','catalog.json');if(fsApi.existsSync(previousFile)){var previousCatalog=JSON.parse(fsApi.readFileSync(previousFile,'utf8').replace(/^\uFEFF/,''));catalogIdMigration=mapCatalogIds(previousCatalog.entries,converted.catalog.entries);}}catch(ignoreCatalogMigration){}
            catalogPromise=Promise.resolve(converted.catalog);
          }
        }catch(convertedLoadError){catalogPromise=Promise.reject(convertedLoadError);}
      }
      if(!catalogPromise)catalogPromise=fetch('./library/catalog.json', { cache: 'no-store' })
        .then(function (response) {
          if (!response.ok) throw new Error('라이브러리 목록을 읽지 못했습니다: ' + response.status);
          return response.json();
        })
        .catch(function (error) {
          if (!scope.__adobe_cep__ || !nodeRequire) throw error;
          var root = decodeURI(scope.__adobe_cep__.getSystemPath('extension'));
          if (/^file:/i.test(root)) root = nodeRequire('url').fileURLToPath(root);
          return JSON.parse(nodeRequire('fs').readFileSync(nodeRequire('path').join(root, 'library', 'catalog.json'), 'utf8').replace(/^\uFEFF/, ''));
        });
      return catalogPromise.then(function (catalog) {
          builtInEntries = normalizeCatalog(catalog);
          attachOperationCapabilities(builtInEntries,hostInfo);
          entries = builtInEntries.concat(fontEntries,personalEntries);
          if(Object.keys(catalogIdMigration.groups||{}).length||Object.keys(catalogIdMigration.variants||{}).length){
            var migratedState=migrateCatalogState({favorites:persisted.favorites,labels:persisted.labels,selectedId:selectedId,selectedVariants:persisted.selectedVariants},catalogIdMigration);
            if(Array.isArray(persisted.favorites))persisted.favorites=migratedState.favorites;
            persisted.labels=migratedState.labels;labels=migratedState.labels;
            persisted.selectedVariants=migratedState.selectedVariants;selectedVariants=migratedState.selectedVariants;
            selectedId=migratedState.selectedId;
            if(defaultBrowseState){var browseState=migrateCatalogState(defaultBrowseState,catalogIdMigration);defaultBrowseState.selectedId=browseState.selectedId;defaultBrowseState.selectedVariants=browseState.selectedVariants;}
          }
          var valid = new Set(
            entries.map(function (e) {
              return e.id;
            }),
          );
          favorites = new Set(retainCatalogFavorites(persisted.favorites,builtInEntries));
          sharedRevision++;
          expanded = new Set(
            Array.isArray(persisted.expanded)
              ? persisted.expanded
              : [''].concat(
                  entries.map(function (e) {
                    return e.category[0];
                  }),
                ),
          );
          validateCategories();
          if (selectedId && !valid.has(selectedId)) selectedId = null;
          resetFilterSelection();
          saveUI();
          renderTree();
          renderGrid();
          renderFooter();
          status(entries.length + '개 항목 · 프리셋이나 사용자 미디어를 선택하세요.');
        })
        .catch(function (error) {
          builtInEntries = []; entries = fontEntries.concat(personalEntries);
          renderTree();
          renderGrid();
          renderFooter();
          status(error.message, 'error');
        });
    }
    $('variants-back').onclick = function () {
      cancelKeyboardVariants();
      allVariantsId = null;
      renderGrid();
    };
    $('show-all-items').onclick = function () { setFocusedFolder(''); };
    $('focus-parent').onclick = function () { setFocusedFolder(focusFolder.split(' / ').slice(0,-1).join(' / ')); };
    $('audio-open').onclick = showAudioGuide;
    $('audio-notice-guide').onclick = showAudioGuide;
    $('audio-close').onclick = function () {
      $('audio-dialog').close();
    };
    $('audio-folder').onfocus = function () {
      this.select();
    };
    $('audio-example').onfocus = function () {
      this.select();
    };
    $('browse-tab').onclick = function () {
      selectTab('browse');
    };
    $('edit-tab').onclick = function () {
      selectTab('edit');
    };
    $('tools-tab').onclick = function () {
      selectTab('tools', true);
    };
    $('library-open').onclick = function () {
      selectTab('library', true);
    };
    $('tab-mode').onchange = function () {
      tabMode = this.value;
      saveUI();
      if (tabMode === 'auto') {
        lastInstance = null;
        refreshState();
      } else selectTab(tabMode, true);
    };
    $('label-filter').onchange = function () {
      var value = this.value;
      this.value = 'add';
      if (!value) updateLabelFilters([]);
      else if (Object.prototype.hasOwnProperty.call(filterNames, value) && labelFilters.indexOf(value) === -1) updateLabelFilters(labelFilters.concat(value));
    };
    $('search').oninput = function () {
      cancelKeyboardVariants();
      var value = this.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { commitSearch(value); }, 300);
    };
    function commitSearch(value) {
      searchTimer = null;
      query = value;
      resetFilterSelection();
      renderTree();
      renderGrid();
      renderFooter();
    }
    $('clear-search').onclick = function () {
      clearTimeout(searchTimer);
      $('search').value = '';
      commitSearch('');
    };
    $('favorites-toggle').onclick = function () {
      favoritesOnly = !favoritesOnly;
      resetFilterSelection();
      this.classList.toggle('active', favoritesOnly);
      this.setAttribute('aria-pressed', String(favoritesOnly));
      saveUI();
      renderTree();
      renderGrid();
    };
    $('thumbnail-size').oninput = function () {
      document.documentElement.style.setProperty('--card-width', this.value + 'px');
      renderGrid();
      saveUI();
    };
    $('preset-grid').onclick = function (event) {
      if (event.target === this || event.target===virtualSpacer) {
        lastCardClick = null;
        clearSelection();
      }
    };
    function cancelOtherCardClicks(event) {
      if (event.button > 0 || !event.target.closest('.preset-card') || event.target.closest('button,input,select,textarea,a')) lastCardClick = null;
    }
    document.addEventListener('pointerdown', cancelOtherCardClicks, true);
    document.addEventListener('click', cancelOtherCardClicks, true);
    document.addEventListener('keydown', function () { lastCardClick = null; }, true);
    document.addEventListener('contextmenu', function () { lastCardClick = null; }, true);
    $('refresh').onclick = function () {
      if(hostQueue&&hostQueue.isWaitingLate()){status('이전 AE 작업의 응답을 기다리고 있습니다.','error');return;}
      if(hostQueue&&hostQueue.isSuspended())hostQueue.resumeAfterHostDialog();
      persisted = {
        favorites: Array.from(favorites),
        expanded: Array.from(expanded),
        selectedVariants: selectedVariants,
        category: category,
      };
      loadCatalog();
      connectHost();
    };
    var captureTarget = null;
    $('capture').classList.remove('hidden');
    $('capture').onclick = function () {
      var context=core.contextPayload(layerState);
      if(!context||!layerState||layerState.numSelectedLayers!==1){status('저장할 레이어 하나를 선택하세요.','error');return;}
      if(!Number.isFinite(layerState.projectRevision)){status('프로젝트 선택 상태를 새로고침한 뒤 다시 저장하세요.','error');return;}
      captureTarget={context:JSON.parse(JSON.stringify(context)),expectedRevision:layerState.projectRevision};
      $('capture-name').value = activeEntry() ? activeEntry().name : '';
      $('capture-selected-only').checked=false;
      $('capture-source-text').checked=false;
      $('capture-dialog').showModal();
    };
    $('capture-dialog').addEventListener('close',function(){captureTarget=null;});
    $('capture-cancel').onclick = function () {
      $('capture-dialog').close();
    };
    $('capture-form').onsubmit = function (event) {
      event.preventDefault();
      var name = $('capture-name').value.trim();
      if (!name||!captureTarget) return;
      var payload=Object.assign({},captureTarget,{name:name,selectedOnly:$('capture-selected-only').checked,includeSourceText:$('capture-source-text').checked});
      captureTarget=null;
      $('capture-dialog').close();
      operation(
        '선택 레이어 프리셋을 저장하는 중…',
        function () {
          return callHost('saveLibraryPreset', payload);
        },
        function () {
          status('사용자 라이브러리에 프리셋을 저장했습니다.');
          workspaceUI.loadLibrary();
        },
      ).catch(function () {});
    };
    $('resizer').onmousedown = function (event) {
      event.preventDefault();
      var start = event.clientX,
        width = $('tree-panel').getBoundingClientRect().width;
      function move(e) {
        var value = Math.max(135, Math.min(window.innerWidth - 150, width + e.clientX - start));
        document.documentElement.style.setProperty('--tree-width', Math.round(value) + 'px');
        updateVariantOverflow();
      }
      function stop() {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', stop);
        saveUI();
      }
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', stop);
    };
    api.view = {
      getCatalog: function () {
        return JSON.parse(JSON.stringify(entries));
      },
      getState: function () {
        return {
          entries: entries.length,
          variants: entries.reduce(function (n, e) {
            return n + e.variants.length;
          }, 0),
          category: category,
          focusFolder: focusFolder,
          query: query,
          favorites: Array.from(favorites),
          selectedId: selectedId,
          selectedVariant: activeVariant() && activeVariant().id,
          variantsOpen: variantsOpen,
          allVariantsId: allVariantsId,
          connected: connected,
          tab: currentTab,
          tabMode: tabMode,
          labels: labels,
          labelFilter: labelFilter,
          labelFilters: labelFilters.slice(),
          favoritesOnly: favoritesOnly,
          hostState: layerState,
          transport: getTransportState(),
        };
      },
      refresh: refreshState,
      getTransportState: getTransportState,
      selectTab: selectTab,
      getSelectedAudioPlayer: function (itemId) {
        return workspaceUI ? workspaceUI.getSelectedAudioPlayer(itemId) : null;
      },
    };
    editorUI = scope.ContentriumEditor.create({
      root: $('editor-controls'),
      applied: $('applied-presets'),
      selection: $('selected-layer'),
      call: callHost,
      status: status,
      refresh: refreshState,
      supports: supports,
      reveal: revealVariant,
    });
    workspaceUI = scope.ContentriumWorkspace.create({
      libraryVisible:currentTab==='library',
      toolView:helperTool,
      openTool:scope.__adobe_cep__?function(tool){openPanel('com.contentrium.preset.'+tool);}:null,
      toolsRoot: $('tools-content'),
      settingsRoot: $('settings-content'),
      libraryRoot: $('library-content'),
      call: callHost,
      status: status,
      refresh: refreshState,
      supports: supports,
      getState: function () {
        return layerState;
      },
      onSettings: function (value) {
        settings = value;
        previewActivity();
        publishSettings(value);
      },
      onLibrary: receiveLibrary,
    });
    workspaceUI.init();
    if(scope.ContentriumPresetPacks)scope.ContentriumPresetPacks.mount($('preset-pack-open'));
    if(helperTool){document.body.classList.add('helper-window');document.body.dataset.tool=helperTool;selectTab('tools',true);}
    document.addEventListener('focusout', function (event) {
      if (event.target.closest && event.target.closest('#editor-controls'))
        setTimeout(function () {
          if (!document.querySelector('#editor-controls :focus')) {
            renderEditor();
            lastRenderState = layerState;
          }
        }, 0);
    });
    document.addEventListener('pointerdown', function (event) {
      if (!event.target.closest('#context-menu') && !event.target.closest('#panel-menu'))
        $('context-menu').classList.add('hidden');
    });
    document.addEventListener('keydown', function (event) {
      var menu = $('context-menu');
      if (event.key === 'Escape' && !menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
        if (menuOwner && menuOwner.isConnected) menuOwner.focus();
      }
      if (
        !menu.classList.contains('hidden') &&
        ['ArrowDown', 'ArrowUp'].indexOf(event.key) !== -1
      ) {
        event.preventDefault();
        var buttons = Array.from(menu.querySelectorAll('button:not(:disabled)')),
          at = buttons.indexOf(document.activeElement);
        buttons[
          (at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        ].focus();
      }
      if (
        (event.ctrlKey || event.metaKey) && !event.altKey && !event.isComposing &&
        event.key && event.key.toLowerCase() === 'z' && !event.defaultPrevented
      ) {
        var method = event.shiftKey ? 'redo' : 'undo',
          editable=event.target.closest&&event.target.closest('input,textarea,select,[contenteditable]');
        if(editable&&!$('editor-controls').contains(editable))return;
        if (supports(method)) {
          event.preventDefault();
          if(event.repeat)return;
          if(historyBusy){status('이전 실행 취소·다시 실행이 끝난 뒤 다시 누르세요.','busy');return;}
          if(getTransportState().waitingLate){status('이전 AE 응답을 확인한 뒤 실행 취소하세요.','error');return;}
          var captured=core.contextPayload(layerState);
          if(!captured){status('프로젝트 선택 상태를 새로고침한 뒤 다시 실행하세요.','error');return;}
          historyBusy=true;
          editorUI.prepareHistory()
            .then(function(){return callHost('getState',{});})
            .then(function(fresh){
              if(JSON.stringify(core.contextPayload(fresh))!==JSON.stringify(captured))throw new Error('프로젝트 또는 선택 항목이 바뀌어 실행 취소를 중단했습니다.');
              return callHost(method,{context:captured,expectedRevision:fresh.projectRevision,requestId:'history-'+scope.ContentriumEditor.newGestureId()});
            })
            .then(function(result){return refreshState({requireFresh:true}).then(function(fresh){
              if(!fresh||typeof fresh.projectRevision!=='number')throw new Error('실행 기록 처리 후 현재 상태를 확인할 수 없습니다. 새로고침하세요.');
              if(fresh.projectRevision!==result.beforeRevision)status(method==='undo'?'실행 취소했습니다.':'다시 실행했습니다.');
              else status('변경할 실행 기록이 없습니다.');
            });})
            .catch(function (error) {
              status(error.message, 'error');
            }).finally(function(){historyBusy=false;});
        }
      }
    });
    scope.addEventListener('storage', function (event) {
      if (event.key === SHARED_STORAGE) {
        try {
          var shared = JSON.parse(event.newValue || '{}');
          if (scope.ContentriumSync.validShared(shared)) {
            if (panelSync) panelSync.shared(shared);
            applySharedPanelState(shared);
          }
        } catch (ignore) {}
      } else if (event.key === SETTINGS_STORAGE) {
        try {
          var nextSettings = JSON.parse(event.newValue);
          if (core.settingsSignature(nextSettings) &&
              core.settingsSignature(nextSettings) !== core.settingsSignature(settings)) refreshSharedSettings();
        } catch (ignoreSettings) {}
      } else if (event.key === 'contentrium-preset.edit-panel-open') {
        if (editIsDetached() !== lastSeparateEdit) refreshState();
      } else if (event.key === 'contentrium-preset.edit-panel-command' && separateEdit) {
        try {
          var command = JSON.parse(event.newValue || '{}');
          if (Object.keys(command).sort().join('|') === 'action|at' && command.action === 'dock' && Number.isSafeInteger(command.at) && Date.now() - command.at >= 0 && Date.now() - command.at < 5000) {
            releasePanelLease();
            if (scope.__adobe_cep__ && scope.__adobe_cep__.closeExtension)
              scope.__adobe_cep__.closeExtension();
          }
        } catch (ignore) {}
      }
    });
    scope.addEventListener('blur', previewActivity);
    document.addEventListener('visibilitychange', previewActivity);
    scope.addEventListener('focus', function () {
      if (panelSync) panelSync.announce();
      publishPanelLease();
      previewActivity();
      refreshState();
    });
    function applySharedPanelState(value) {
      favorites = new Set(value.favorites); labels = value.labels;
      sharedRevision++;lastSharedRevision=sharedRevision;
      persisted.favorites = value.favorites; persisted.labels = value.labels;
      try {
        localStorage.setItem(SHARED_STORAGE,JSON.stringify(value));
        var local = JSON.parse(localStorage.getItem(STORAGE)||'{}');
        local.favorites=value.favorites; local.labels=value.labels;
        localStorage.setItem(STORAGE,JSON.stringify(local));
      } catch (error) { status('공유 설정을 저장하지 못했습니다. '+error.message,'error'); }
      renderTree(); renderGrid();
    }
    if (scope.ContentriumSync) {
      var initialSettings=null;
      try { initialSettings=JSON.parse(localStorage.getItem(SETTINGS_STORAGE)||'null'); }catch(ignoreInitialSettings){}
      panelSync=scope.ContentriumSync.create({
        cep:scope.__adobe_cep__,slot:panelSlot,origin:panelToken,storage:localStorage,
        initialShared:initialSharedPreference(persisted),initialSettings:initialSettings,
        onShared:applySharedPanelState,
        onThumbnailCancel:function(){if(thumbnails)thumbnails.cancelAll();},
        onSettings:function(value){
          try { localStorage.setItem(SETTINGS_STORAGE,core.settingsSignature(value)); }catch(ignoreSyncSettings){}
          if(core.settingsSignature(value)!==core.settingsSignature(settings))refreshSharedSettings();
        },
        onLease:function(){if(editIsDetached()!==lastSeparateEdit)refreshState();},
        onDock:function(){if(separateEdit){releasePanelLease();if(scope.__adobe_cep__&&scope.__adobe_cep__.closeExtension)scope.__adobe_cep__.closeExtension();}},
        onError:function(error){status('패널 동기화: '+error.message,'error');}
      });
      panelSync.start();
      var currentShared=panelSync.currentShared();
      if(currentShared)applySharedPanelState(currentShared);
    }
    publishPanelLease();
    panelHeartbeat = setInterval(publishPanelLease, 1000);
    scope.addEventListener('unload', releasePanelLease);
    scope.addEventListener('unload',function(){if(thumbnails)thumbnails.destroy();if(fileLeases)fileLeases.dispose();});
    scope.addEventListener('unload', cancelKeyboardVariants);
    scope.addEventListener('unload', function(){if(panelSync)panelSync.dispose();});
    scope.addEventListener('unload',function(){if(largePreview)largePreview.close();document.querySelectorAll('#preset-grid .preset-card').forEach(function(card){if(card._libraryPreview)card._libraryPreview.destroy();});});
    if (separateEdit) {
      $('browse-tab').classList.add('hidden');
      $('tools-tab').classList.add('hidden');
      selectTab('edit', true);
    }
    $('panel-menu').onclick = function (event) {
      showMenu({ preventDefault: function () {}, clientX: event.clientX, clientY: event.clientY }, [
        {
          label: '설정',
          run: function () {
            selectTab('settings', true);
          },
        },
        {label:'애니메이티드 폰트 팩',run:fontPackDialog},
        {
          label: '사용자 라이브러리',
          run: function () {
            selectTab('library', true);
          },
        },
        {
          label: '새 Browse 패널',
          disabled: !scope.__adobe_cep__,
          run: function () {
            var preferred = Number(localStorage.getItem('contentrium-preset.next-panel') || 2), live = {};
            [2,3,4].forEach(function (slot) {
              live[slot] = core.panelIsLive(readLease('alt' + slot), Date.now());
            });
            var next = core.nextPanelSlot(live, preferred), key = PANEL_LEASE_PREFIX + 'alt' + next;
            if (!live[next]) {
              if(panelSync)panelSync.reserve('alt'+next);
              else localStorage.setItem(key, JSON.stringify({token:'opening-' + panelToken,at:Date.now()}));
            }
            if (!openPanel('com.contentrium.preset.alt' + next) && !live[next]) {
              var reservation = readLease('alt' + next);
              if (reservation && reservation.token === 'opening-' + panelToken) {
                if(panelSync)panelSync.releaseReservation('alt'+next);else localStorage.removeItem(key);
              }
            }
            localStorage.setItem('contentrium-preset.next-panel', String(next >= 4 ? 2 : next + 1));
          },
        },
        {
          label: '별도 Edit 패널',
          disabled: !scope.__adobe_cep__,
          run: function () {
            openPanel('com.contentrium.preset.edit');
          },
        },
        {
          label: 'Edit 패널 다시 결합',
          disabled: !scope.__adobe_cep__,
          run: function () {
            if(panelSync)panelSync.dock();
            localStorage.setItem(
              'contentrium-preset.edit-panel-command',
              JSON.stringify({ action: 'dock', at: Date.now() }),
            );
            if (separateEdit) {
              releasePanelLease();
              if (scope.__adobe_cep__.closeExtension) scope.__adobe_cep__.closeExtension();
            }
          },
        },
        {
          label: tabMode === 'auto' ? '✓ 자동 탭 전환' : '자동 탭 전환',
          disabled: separateEdit||!!helperTool,
          run: function () {
            tabMode = tabMode === 'auto' ? (currentTab === 'edit' ? 'edit' : 'browse') : 'auto';
            $('tab-mode').value = tabMode;
            saveUI();
            lastInstance = null;
            refreshState();
          },
        },
        {
          label: '도움말',
          run: function () {
            scope.open(
              'https://github.com/contentriumkorea/contentrium-preset/blob/main/docs/user-guide.md',
            );
          },
        },
        {
          label: '업데이트 확인',
          run: function () {
            scope.open('https://github.com/contentriumkorea/contentrium-preset/releases/latest');
          },
        },
        {
          label: '문제 보고',
          run: function () {
            scope.open('https://github.com/contentriumkorea/contentrium-preset/issues/new');
          },
        },
        { label: '제품 정보', run: showAbout },
        { label: '처음 사용 안내', run: function(){showWelcome(true).catch(function(error){status(error.message,'error');});} },
        { label: '메인 패널 열기', helperOnly:true, disabled:!scope.__adobe_cep__, run:function(){openPanel('com.contentrium.preset');} },
        { separator: true },
        {
          label: '모든 저장 라벨 지우기',
          disabled: !Object.keys(labels).length,
          run: function () { labels = {}; sharedRevision++;updateLabelFilters([]); renderTree(); },
        },
      ].filter(function(item){return helperTool?['도움말','업데이트 확인','문제 보고','제품 정보','처음 사용 안내','메인 패널 열기'].indexOf(item.label)!==-1:!item.helperOnly;}));
    };
    function productVersion(){
      if(!productVersionPromise)productVersionPromise=fetch('./CSXS/manifest.xml').then(function(response){if(!response.ok)throw Error('프로그램 버전을 읽지 못했습니다.');return response.text();}).then(function(text){var version=new DOMParser().parseFromString(text,'text/xml').documentElement.getAttribute('ExtensionBundleVersion');if(!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(version||''))throw Error('프로그램 버전을 확인하지 못했습니다.');return version;}).catch(function(error){productVersionPromise=null;throw error;});
      return productVersionPromise;
    }
    function copyProductInfo(text){
      function fallback(){var field=element('textarea');field.value=text;field.style.cssText='position:fixed;left:-10000px;top:0';document.body.appendChild(field);field.select();try{if(!document.execCommand('copy'))throw Error('클립보드에 복사하지 못했습니다.');}finally{field.remove();}}
      return scope.navigator.clipboard&&scope.navigator.clipboard.writeText?scope.navigator.clipboard.writeText(text).catch(fallback):Promise.resolve().then(fallback);
    }
    function showWelcome(force){return productVersion().then(function(version){
      var key='contentrium-preset.welcome.'+version.split('.').slice(0,2).join('.');
      if(!force&&(hadUIPreferences||localStorage.getItem(key)==='acknowledged'))return;
      if(document.querySelector('dialog[data-welcome]'))return;
      var dialog=element('dialog'),heading=element('h2','','Contentrium Preset'),body=element('p','','After Effects의 창 → 확장 → Contentrium Preset에서 패널을 열 수 있습니다. 프리셋을 고르고 레이어에 적용한 뒤 Edit에서 조절하세요.'),guide=element('a','','사용 안내 열기'),start=element('button','','시작하기');
      dialog.dataset.welcome='true';dialog.setAttribute('aria-label','Contentrium Preset 시작 안내');guide.href='https://github.com/contentriumkorea/contentrium-preset/blob/main/docs/user-guide.md';guide.target='_blank';guide.rel='noopener';start.type='button';start.onclick=function(){try{localStorage.setItem(key,'acknowledged');dialog.close();}catch(error){status('시작 안내 확인을 저장하지 못했습니다. '+error.message,'error');}};dialog.addEventListener('cancel',function(event){event.preventDefault();});dialog.addEventListener('close',function(){dialog.remove();});dialog.append(heading,body,guide,start);document.body.appendChild(dialog);dialog.showModal();start.focus();
    });}
    function showAbout() {
      var dialog = element('dialog'),
        heading = element('h2', '', 'Contentrium Preset'),
        version = element('p', '', '버전 정보를 읽는 중…'),
        description = element(
          'p',
          '',
          'After Effects용 애니메이션 프리셋 · 로컬 사용자 라이브러리',
        );
      dialog.appendChild(heading);
      dialog.appendChild(version);
      dialog.appendChild(description);
      var copyVersion=element('button','','버전 정보 복사');copyVersion.type='button';copyVersion.disabled=true;dialog.appendChild(copyVersion);
      if (hostInfo && hostInfo.version)
        dialog.appendChild(element('p', '', 'After Effects ' + hostInfo.version));
      var license = element('a', '', 'MIT License');
      license.href = 'https://github.com/contentriumkorea/contentrium-preset/blob/main/LICENSE';
      license.target = '_blank';
      license.rel = 'noopener';
      dialog.appendChild(license);
      var close = element('button', '', '닫기');
      close.onclick = function () {
        dialog.close();
      };
      dialog.appendChild(close);
      dialog.addEventListener('close', function () {
        dialog.remove();
      });
      document.body.appendChild(dialog);
      dialog.showModal();
      productVersion()
        .then(function (value) {
          version.textContent = 'Version ' + value;
          copyVersion.disabled=false;copyVersion.onclick=function(){copyProductInfo('Contentrium Preset '+value+(hostInfo&&hostInfo.version?'\nAfter Effects '+hostInfo.version:'')).then(function(){status('버전 정보를 복사했습니다.');}).catch(function(error){status(error.message,'error');});};
        })
        .catch(function () {
          version.textContent =
            hostInfo && hostInfo.productVersion
              ? 'Version ' + hostInfo.productVersion
              : 'Contentrium Preset';
        });
    }
    function openPanel(id) {
      try {
        scope.__adobe_cep__.requestOpenExtension(id, '');
        return true;
      } catch (error) {
        status('패널을 열지 못했습니다. ' + error.message, 'error');
        return false;
      }
    }
    $('preset-grid').addEventListener('scroll',scheduleGrid,{passive:true});
    if (scope.ResizeObserver) new scope.ResizeObserver(scheduleGrid).observe($('preset-grid'));
    else window.addEventListener('resize', scheduleGrid);
    loadCatalog();
    renderEditor();
    connectHost();
    setInterval(function () {
      if (connected && !busy && !(hostQueue && (hostQueue.isBusy() || hostQueue.isSuspended()))) refreshState();
    }, 750);
  }
})(typeof window === 'undefined' ? globalThis : window);
