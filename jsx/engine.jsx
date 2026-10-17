(function () {
 try{(function () {
 var root=File($.fileName).parent.parent.fsName;
 function array(v){return Object.prototype.toString.call(v)==='[object Array]';}
 function quote(s){return '"'+String(s).replace(/[\\"\x00-\x1f]/g,function(c){var m={'"':'\\"','\\':'\\\\','\n':'\\n','\r':'\\r','\t':'\\t'};return m[c]||'\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4);})+'"';}
 function json(v){if(v===null||typeof v==='undefined')return 'null';if(typeof v==='string')return quote(v);if(typeof v==='number')return isFinite(v)?String(v):'null';if(typeof v==='boolean')return String(v);var a=[],i,k;if(array(v)){for(i=0;i<v.length;i++)a.push(json(v[i]));return '['+a.join(',')+']';}for(k in v)if(v.hasOwnProperty(k)&&typeof v[k]!=='function')a.push(quote(k)+':'+json(v[k]));return '{'+a.join(',')+'}';}
 function parse(s){if(!$.cpJson)fail('JSON_ENGINE_REQUIRED','JSON 모듈이 설치되지 않았습니다.');return $.cpJson.parse(s);}
 function clone(v){return parse(json(v));}
 function fail(code,message){var e=new Error(message);e.code=code;throw e;}
 function hash(s){var n=0;for(var i=0;i<s.length;i++)n=((n<<5)-n+s.charCodeAt(i))|0;return String(n);}
 function load(name,optional){var f=new File(root+'/jsx/'+name+'.jsx');if(!f.exists){if(optional)return;fail('INSTALLATION_INCOMPLETE','설치 파일이 없습니다: '+name);}$.evalFile(f);}
 function readCatalog(){var f=new File(root+'/library/catalog.json');f.encoding='UTF-8';if(!f.open('r'))fail('CATALOG_UNAVAILABLE','프리셋 목록을 읽을 수 없습니다.');var s=f.read();f.close();return parse(s);}
 load('json-engine');load('presets');load('timeline-engine');load('animated-font-model');load('animated-font-engine');load('font-pack-engine');delete $.cpController;load('controller-engine',true);load('overlay-engine');load('audio-engine');load('precomp-engine');load('texture-engine');load('tools-engine');load('sequence-engine');load('workspace-engine');load('user-preset-engine');load('property-set-engine');load('color-engine');load('palette-engine');load('thumbnail-engine');
 // Authored packs contain validated vector data and exact content identities.
 $.cpFontPacks.configure({root:root,userRoot:String($.cpAudio.root).replace(/[\\\/]UserAudio[\\\/]?$/,'')+'/AnimatedFonts'});
 $.cpGlyph.configure({resolvePack:$.cpFontPacks.resolve});
 $.cpWorkspace.configure({json:json,parse:parse});
 if($.cpPropertySets)$.cpPropertySets.configure({json:json,parse:parse,load:$.cpWorkspace.loadPropertySets,save:$.cpWorkspace.savePropertySets});
 var catalog=readCatalog(),session=$.cpFacadeSession||{clipboard:[],propertyClipboard:null,gestures:{},imports:{}},targetMap={};
 $.cpFacadeSession=session;
 session.conversionRequests=session.conversionRequests||[];session.conversionSerial=session.conversionSerial||0;
 var methods=['hostStatus','getState','applyPreset','setControl','removePreset','presetAction','propertyAction','getSettings','setSettings','getLibrary','libraryPreviewDestination','addLibraryFolder','removeLibraryFolder','importLibraryItem','replaceLibraryItem','prepareAudioImport','saveLibraryPreset','describeLibraryPreset','removeLibraryItem','toolAction','endUndoGroup','enumerateFonts'];
 if($.cpPropertySets)methods.push('propertySetAction');
 methods.push('mediaAction','paletteAction','pickColor','thumbnailAction','addAnimatedFont','resolveThumbnailSource');
 session.paletteScopes=session.paletteScopes||[];session.paletteSerial=session.paletteSerial||0;var paletteTargets={};
 $.cpPalette.configure($.cpPalette.fileAdapter({json:json,parse:parse,base:function(){return Folder.userData.fsName+'/Contentrium/Preset';}}));
 function comp(){var c=app.project&&app.project.activeItem;if(!(c instanceof CompItem))fail('NO_COMPOSITION','컴포지션을 열어주세요.');return c;}
 function find(id){for(var i=0;i<catalog.entries.length;i++)for(var j=0;j<catalog.entries[i].variants.length;j++)if(catalog.entries[i].variants[j].id===id)return{entry:catalog.entries[i],variant:catalog.entries[i].variants[j]};fail('PRESET_NOT_FOUND','프리셋을 찾을 수 없습니다.');}
 function label(id){try{var f=find(id);return f.entry.name+(f.variant.name!==f.entry.name?' / '+f.variant.name:'');}catch(e){return String(id);}}
 function selected(c){var result=[];for(var i=0;i<c.selectedLayers.length;i++)result.push(c.selectedLayers[i]);return result;}
 function layerById(c,id){for(var i=1;i<=c.numLayers;i++)if(String(c.layer(i).id)===String(id))return c.layer(i);fail('LAYER_CHANGED','선택한 레이어가 변경되었습니다.');}
 function validProjectObject(value){try{return typeof isValid==='function'&&isValid(value)===true;}catch(invalidProject){return false;}}
 function context(c){var ids=[],project=app.project,sameProject=false;if(!validProjectObject(project))fail('PROJECT_CONTEXT_UNAVAILABLE','현재 프로젝트의 유효성을 확인할 수 없습니다. 프로젝트를 다시 연 뒤 실행하세요.');if(validProjectObject(session.projectObject))try{sameProject=session.projectObject===project;}catch(invalidIdentity){sameProject=false;}if(!sameProject||!session.projectToken){session.projectObject=project;session.projectToken='project-'+new Date().getTime()+'-'+Math.random();}var ls=c instanceof CompItem?selected(c):[];for(var i=0;i<ls.length;i++)ids.push(ls[i].id);ids.sort(function(a,b){return a-b;});return{projectKey:project.file?project.file.fsName:'unsaved',projectToken:session.projectToken,compositionId:c instanceof CompItem?(c.id||0):null,layerIds:ids};}
 function guard(expected,c){if(expected&&json(expected)!==json(context(c)))fail('SELECTION_CHANGED','선택 항목이 바뀌었습니다. 현재 선택을 확인한 뒤 다시 실행하세요.');}
 function capturedComp(expected){
  if(!expected||!array(expected.layerIds)||expected.compositionId===null)fail('CONTEXT_REQUIRED','편집 창을 다시 열어 대상 레이어를 확인하세요.');
  var c=null,p=app.project,i;if(p)for(i=1;i<=p.numItems;i++){var item=p.item(i);if(item instanceof CompItem&&String(item.id)===String(expected.compositionId))c=item;}
  if(!c)fail('SELECTION_CHANGED','원래 컴포지션을 찾을 수 없습니다.');guard(expected,c);return c;
 }
 function projectRevision(){try{var value=app.project.revision;return typeof value==='number'&&isFinite(value)?value:null;}catch(ignore){return null;}}
 function historyAvailable(){return parseInt(app.version,10)===26&&typeof app.executeCommand==='function'&&projectRevision()!==null;}
 function historyCommand(method,options){
  if(!historyAvailable())fail('HISTORY_UNAVAILABLE','이 AE 버전에서는 패널 실행 취소를 검증하지 않았습니다. AE 편집 메뉴를 사용하세요.');
  var id=options.requestId,ids=session.historyRequests||[],i;
  if(typeof id!=='string'||!/^history-[a-zA-Z0-9-]{1,160}$/.test(id))fail('INVALID_HISTORY_REQUEST','실행 취소 요청 식별자가 올바르지 않습니다.');
  for(i=0;i<ids.length;i++)if(ids[i]===id)fail('HISTORY_ALREADY_ISSUED','이미 전달된 실행 취소 요청입니다. 현재 상태를 확인하세요.');
  if(!options.context)fail('CONTEXT_REQUIRED','프로젝트 선택 상태를 다시 확인하세요.');
  guard(options.context,app.project.activeItem);
  var before=projectRevision();if(typeof options.expectedRevision!=='number'||options.expectedRevision!==before)fail('STALE_PROJECT','프로젝트가 변경되었습니다. 현재 상태를 확인한 뒤 다시 실행하세요.');
  // Consume before dispatch: a late or failed native response must never replay history.
  ids.push(id);if(ids.length>64)ids.shift();session.historyRequests=ids;session.gestures={};
  // AE 26 installed menu dictionary and separate native value probes identify these IDs.
  app.executeCommand(method==='undo'?16:2035);
  return{commandIssued:true,beforeRevision:before,requestId:id};
 }
 function undo(name,fn,ownsRollback){
  var project=app.project,active=project.activeItem,before=projectRevision(),result,error=null;
  app.beginUndoGroup('Contentrium Preset - '+name);try{result=fn();}catch(e){error=e;}finally{app.endUndoGroup();}
  if(error){var after=projectRevision();
   if(!ownsRollback&&before!==null&&after!==null&&before!==after){
    if(app.project===project&&app.project.activeItem===active)try{app.executeCommand(16);if(projectRevision()===after)error.rollbackError='실행 취소 후 프로젝트 변경을 확인할 수 없습니다.';}catch(rollback){error.rollbackError=String(rollback.message||rollback);}
    else error.rollbackError='프로젝트 또는 활성 컴포지션이 변경되어 자동 실행 취소를 중단했습니다.';
   }throw error;
  }return result;
 }
 function applyOptions(){var by={},i,j,v,m;for(i=0;i<catalog.entries.length;i++)for(j=0;j<catalog.entries[i].variants.length;j++){v=catalog.entries[i].variants[j];if(v.type!==10)continue;m=null;try{if($.cpPrecomp.nativeModel)m=$.cpPrecomp.nativeModel(v.id);}catch(ignore){}by[v.id]={hasInOutAnims:!!(v.generator&&v.generator.kind!=='camera'),containsAudio:!!(m&&m.audio&&m.audio.length),canReplace:true,canApplyTexture:false};}return{byVariant:by};}
 function status(){var c=app.project&&app.project.activeItem;return{version:app.version,hasComposition:c instanceof CompItem,selectedLayers:c instanceof CompItem?c.selectedLayers.length:0,audioRoot:$.cpAudio.root,methods:historyAvailable()?methods.concat(['undo','redo']):methods,animatedFonts:$.cpFontPacks.status(),applyOptions:applyOptions(),colorPicker:pickerCapabilities(),capabilities:{textureMedia:true,palettes:true,nativeColorPicker:pickerCapabilities().available,captureUserPreset:true,settings:true,userLibrary:true,toolAction:true,fonts:!!app.fonts,presetActions:true,propertyActions:true,multiPanel:true}};}
 function glyphGuard(options,c){if(!options.context)fail('CONTEXT_REQUIRED','현재 프로젝트와 선택 상태를 다시 확인하세요.');guard(options.context,c);if(options.expectedRevision!==undefined&&(typeof options.expectedRevision!=='number'||options.expectedRevision!==projectRevision()))fail('STALE_PROJECT','프로젝트가 변경되었습니다. 현재 상태를 확인하세요.');}
 function glyphReceipt(c,result){var layer=layerById(c,result.rootLayerId);for(var i=1;i<=c.numLayers;i++)c.layer(i).selected=false;layer.selected=true;result.addedLayerId=layer.id;result.appliedLayers=1;result.wantsRevealEditTab=true;return result;}
 function addAnimatedFont(options){var c=comp();glyphGuard(options,c);var revision=projectRevision(),plan=$.cpGlyph.preflight(c,{fontId:options.fontId,fontHash:options.fontHash,text:options.text,atTime:c.time});glyphGuard(options,c);if(projectRevision()!==revision)fail('STALE_PROJECT','Project changed during animated-font preflight.');return undo('Animated font',function(){return glyphReceipt(c,$.cpGlyph.apply(c,plan));},true);}
 function ownedGlyphColor(c,row){
  var layer=layerById(c,row.layerId),owners,i,k,parts=row.path,ep;
  try{owners=$.cpGlyph.instances(layer)||[];}catch(invalidOwnership){return true;}
  if(!owners.length)return false;
  // Recorded indices identify owned inputs only after the adapter validates
  // their live native names, properties, EP sources and complete glyph graph.
  // A moved input must not become a generic editable color at its new index.
  try{$.cpGlyph.controls(layer);}catch(unverifiedGraph){return true;}
  if(!array(parts)||!parts.length)return true;
  try{ep=layer.essentialProperty;if(ep&&ep.matchName&&parts[0].matchName===String(ep.matchName))return true;}catch(invalidEP){}
  if(parts[0].matchName!=='ADBE Effect Parade')return false;
  for(i=0;i<owners.length;i++){if(!owners[i].rootInputs||typeof owners[i].rootInputs!=='object')return true;for(k in owners[i].rootInputs)if(owners[i].rootInputs.hasOwnProperty(k)&&parts.length>1&&parts[1].index===owners[i].rootInputs[k].index)return true;}
  return false;
 }
 // Same-signature siblings use owner-local traversal ordinals. Unique keys stay unchanged.
 function ordinaryControlOccurrences(raw,applied){
  var owners={},families={},refs=[],i,j,k,r,t,scope,owner,family,record,counts,signature,first,other;
  function ordinary(kind){return kind==='overlay'||kind==='precomp'||kind==='texture';}
  for(i=0;i<applied.length;i++){r=applied[i];if(!ordinary(r.kind))continue;scope=json([r.kind,r.variantId,r.direction||'both']);owner=json([r.kind,r.layerId,r.instanceId]);if(!owners[scope])owners[scope]=[];var seen=false;for(j=0;j<owners[scope].length;j++)if(owners[scope][j]===owner)seen=true;if(!seen)owners[scope].push(owner);}
  for(i=0;i<raw.length;i++){
   r=raw[i];if(!r.ordinaryScope)continue;scope=r.ordinaryScope;delete r.ordinaryScope;t=r.target;owner=json([t.kind,t.layerId,t.instanceId]);family=json([r.setGroupKey,r.name,r.semantic||'',r.line||'']);
   record=families[family];if(!record){record={scope:scope,owners:{},duplicate:false,cursors:{},mismatch:false};families[family]=record;}
   counts=record.owners[owner];if(!counts){counts={};record.owners[owner]=counts;}signature=r.mergeKey;counts[signature]=(counts[signature]||0)+1;if(counts[signature]>1)record.duplicate=true;refs.push({descriptor:r,owner:owner,family:record,signature:signature});
  }
  for(k in families)if(families.hasOwnProperty(k)){
   record=families[k];if(!record.duplicate)continue;first=null;var expected=owners[record.scope]||[];
   for(i=0;i<expected.length;i++){
    other=record.owners[expected[i]];if(!other){record.mismatch=true;continue;}if(!first){first=other;continue;}
    for(signature in first)if(first.hasOwnProperty(signature)&&first[signature]!==other[signature])record.mismatch=true;
    for(signature in other)if(other.hasOwnProperty(signature)&&other[signature]!==first[signature])record.mismatch=true;
   }
  }
  for(i=0;i<refs.length;i++){
   r=refs[i].descriptor;record=refs[i].family;owner=refs[i].owner;signature=refs[i].signature;
   if(record.owners[owner][signature]>1){if(!record.cursors[owner])record.cursors[owner]={};var ordinal=record.cursors[owner][signature]||0;record.cursors[owner][signature]=ordinal+1;r.mergeKey='ordinary-occurrence:'+json([signature,ordinal]);r.setControlKey=r.mergeKey;}
   if(record.mismatch){r.enabled=false;r.actions=[];r.readOnlyCode='CONTROL_OCCURRENCE_MISMATCH';r.readOnlyReason='Selected preset roots have different sibling control shapes. Select one root to edit.';}
  }
 }
 function groupControls(raw){
  var groups={},order=[],out=[],i,r,key,d,target;
  targetMap={};
  for(i=0;i<raw.length;i++){r=raw[i];key=r.mergeKey;target=r.target;delete r.mergeKey;delete r.target;
   if(!groups[key]){d=clone(r);d.targets=[target];d.mixed=false;groups[key]=d;order.push(key);}
   else{d=groups[key];if(json(d.value)!==json(r.value))d.mixed=true;d.targets.push(target);if(r.enabled===false){d.enabled=false;d.readOnlyReason=r.readOnlyReason||d.readOnlyReason;d.readOnlyCode=r.readOnlyCode||d.readOnlyCode;if(r.propertySetUnavailable)d.actions=[];}if(typeof r.min==='number')d.min=typeof d.min==='number'?Math.max(d.min,r.min):r.min;if(typeof r.max==='number')d.max=typeof d.max==='number'?Math.min(d.max,r.max):r.max;}
  }
  for(i=0;i<order.length;i++){d=groups[order[i]];var identity=order[i]+json(d.targets);if(d.singleRootOnly&&d.targets.length>1){d.enabled=false;d.actions=[];d.readOnlyCode='GLYPH_MULTI_EDIT_UNAVAILABLE';d.readOnlyReason='Edit one animated-font root at a time.';}if(d.semantic==='selected-layer-color'){var members=[];for(var mi=0;mi<d.targets.length;mi++)members.push(d.targets[mi].publicId);members.sort();identity='colors:'+json(members);}d.id=d.targets.length===1?d.targets[0].publicId:'multi:'+hash(identity);targetMap[d.id]=d.targets;delete d.targets;out.push(d);}return out;
 }
 function soundApplyOptions(layers){
  if(!layers.length)return{replaceable:false,errorCode:'NO_SELECTED_LAYERS'};
  for(var i=0;i<layers.length;i++)try{
   var layer=layers[i],source=layer.source;
   if(typeof AVLayer==='undefined'||!(layer instanceof AVLayer)||typeof FootageItem==='undefined'||!(source instanceof FootageItem)||source.hasVideo!==false||source.hasAudio!==true)return{replaceable:false,errorCode:'AUDIO_REPLACE_TARGET_REQUIRED'};
   if(layer.locked||typeof layer.replaceSource!=='function')return{replaceable:false,errorCode:'MEDIA_REPLACE_UNAVAILABLE'};
  }catch(invalidSource){return{replaceable:false,errorCode:'AUDIO_REPLACE_TARGET_REQUIRED'};}
  return{replaceable:true,errorCode:null};
 }
 function selectedExpressionDiagnostics(c,roots,expected){
  var result={warnings:[],coverage:{scope:'selected-owned',status:'not-needed',reason:null}},project=app.project,engine,revision,time,propertyCount=0,layerCount=0,compCount=0,layerCache={},compCache={},affected=[],i;
  function incomplete(reason){result.coverage.status='incomplete';if(!result.coverage.reason||reason==='budget')result.coverage.reason=reason;}
  function valid(value){try{return typeof isValid==='function'&&isValid(value)===true;}catch(ignore){return false;}}
  function positiveId(value){return typeof value==='number'&&isFinite(value)&&value>0&&Math.floor(value)===value;}
  function count(value){return typeof value==='number'&&isFinite(value)&&value>=0&&Math.floor(value)===value;}
  if(!(c instanceof CompItem)||!roots.length)return result;
  try{engine=project.expressionEngine;}catch(engineError){incomplete('unavailable');return result;}
  if(engine!=='extendscript'){if(engine!=='javascript-1.0')incomplete('unavailable');return result;}
  try{revision=projectRevision();time=c.time;}catch(timeError){incomplete('unavailable');return result;}if(revision===null||typeof time!=='number'||!isFinite(time)){incomplete('unavailable');return result;}result.coverage.status='complete';
  function scanLayer(layer,compId){
   var key,frames,frame,node,n,child,diagnostic;
   try{if(!valid(layer)||!positiveId(compId)||!positiveId(layer.id)){incomplete('unavailable');return false;}key='L'+compId+':'+layer.id;}catch(identityError){incomplete('unavailable');return false;}
   if(layerCache.hasOwnProperty(key))return layerCache[key];
   if(++layerCount>512){incomplete('budget');return false;}
   frames=[{node:layer,depth:0,entered:false,index:0}];
   while(frames.length){
    frame=frames[frames.length-1];node=frame.node;
    if(!frame.entered){
     if(++propertyCount>20000||frame.depth>32){incomplete('budget');layerCache[key]=false;return false;}
     try{if(node.propertyDepth>0){diagnostic=node.expressionError;if(typeof diagnostic==='string'&&diagnostic.length){layerCache[key]=true;return true;}if(diagnostic!==undefined&&diagnostic!==null&&diagnostic!=='')incomplete('unavailable');}}catch(expressionError){incomplete('unavailable');}
     try{n=node.numProperties;if(n===undefined||n===null)n=0;if(!count(n)){incomplete('unavailable');frames.pop();continue;}if(n>20000){incomplete('budget');frames.pop();continue;}frame.count=n;frame.entered=true;}catch(groupError){incomplete('unavailable');frames.pop();continue;}
    }
    if(frame.index>=frame.count){frames.pop();continue;}
    frame.index++;try{child=node.property(frame.index);if(!child){incomplete('unavailable');continue;}frames.push({node:child,depth:frame.depth+1,entered:false,index:0});}catch(childError){incomplete('unavailable');}
   }
   layerCache[key]=false;return false;
  }
  function scanComp(comp,tag,recurse,depth){
   var key,record,n,index,layer,source,found=false;
   try{if(!valid(comp)||!(comp instanceof CompItem)||!positiveId(comp.id)||String(comp.comment||'')!==tag){incomplete('unavailable');return false;}key='C'+comp.id+':'+tag;}catch(compError){incomplete('unavailable');return false;}
   if(compCache.hasOwnProperty(key)){record=compCache[key];if(record.pending)incomplete('unavailable');return record.found;}
   if(depth>32||++compCount>64){incomplete('budget');return false;}
   record={pending:true,found:false};compCache[key]=record;
   try{n=comp.numLayers;if(!count(n)){incomplete('unavailable');n=0;}if(n>512){incomplete('budget');n=512;}
    for(index=1;index<=n;index++){
     try{layer=comp.layer(index);if(scanLayer(layer,comp.id)){found=true;break;}if(recurse){source=layer.source;if(source&&valid(source)&&source instanceof CompItem&&String(source.comment||'')===tag&&scanComp(source,tag,true,depth+1)){found=true;break;}}}catch(layerError){incomplete('unavailable');}
    }
   }catch(compReadError){incomplete('unavailable');}
   record.pending=false;record.found=found;return found;
  }
  for(i=0;i<roots.length;i++){
   var candidate=roots[i],found=scanLayer(candidate.layer,c.id),source,tag=null,instance=candidate.instance,seen=false,j;
   if(!found&&candidate.kind!=='overlay')try{
    source=candidate.layer.source;
    if(candidate.kind==='precomp')tag='ContentriumPresetGenerated|'+instance.instanceId;
    else if(candidate.kind==='texture')tag='ContentriumTextureSource|'+instance.instanceId;
    else if(candidate.kind==='animated-font')tag='cpAnimatedFontSource|'+instance.instanceId;
    if(tag){if(candidate.kind==='animated-font'&&(!source||source.id!==instance.sourceId))incomplete('unavailable');else found=scanComp(source,tag,candidate.kind!=='texture',0);}
   }catch(sourceError){incomplete('unavailable');}
   if(found){for(j=0;j<affected.length;j++)if(affected[j]===candidate.layer.id)seen=true;if(!seen)affected.push(candidate.layer.id);}
  }
  try{if(!valid(project)||!valid(app.project)||project!==app.project||!valid(c)||project.activeItem!==c||projectRevision()!==revision||project.expressionEngine!==engine||c.time!==time||json(context(c))!==json(expected)){result.coverage.status='incomplete';result.coverage.reason='changed';return result;}}catch(changedError){result.coverage.status='incomplete';result.coverage.reason='changed';return result;}
  if(affected.length){affected.sort(function(a,b){return a-b;});result.warnings.push({code:'LEGACY_EXPRESSION_ERRORS',engine:'extendscript',rootLayerIds:affected});}return result;
 }
 function getState(){if($.cpGlyph&&typeof $.cpGlyph.withReadSnapshot==='function')return $.cpGlyph.withReadSnapshot(getStateRead);return getStateRead();}
 function getStateRead(){
  var c=app.project&&app.project.activeItem,ls=c instanceof CompItem?selected(c):[],raw=[],applied=[],mediaRoots=[],audioMissing=[],audioSeen={},legacy=false,errors=[],diagnosticRoots=[],i,j,k,ins,list,instance,descriptor,kind;
  function addDescriptor(layer,kind,d,owner){
   d=clone(d);var localId=d.id;d.id=kind+':'+layer.id+':'+localId;d.font=d.semantic==='font';d.actions=d.actions||['copy','paste','reset'];d.groupPath=[owner.name||label(owner.variantId),d.group||'Controls'];d.enabled=d.enabled!==false&&!layer.locked;
   d.mergeKey=kind+':'+owner.variantId+':'+(owner.direction||'both')+':'+(d.group||'')+':'+d.name+':'+d.type+':'+(d.semantic||'')+':'+(d.line||'');
   d.setGroupKey=kind+':'+owner.variantId+':'+(owner.direction||'both')+':'+(d.group||'');d.setControlKey=d.mergeKey;
   if(kind==='overlay'||kind==='precomp'||kind==='texture')d.ordinaryScope=json([kind,owner.variantId,owner.direction||'both']);
   if(d.propertySetSection){d.setSectionKey=kind+':'+owner.variantId+':'+(owner.direction||'both')+':section:'+d.propertySetSection;d.groupPath=[owner.name||label(owner.variantId),d.propertySetSection,d.group||'Controls'];}
   if(kind==='animated-font'){var scope=kind+':'+json(owner.pack)+':'+(owner.direction||'both')+':'+(d.group||'');if(d.group==='Character Offsets')scope+=':text:'+hash(String(owner.text||''));d.mergeKey=scope+':'+localId;d.setGroupKey=scope;d.setControlKey=scope+':'+localId;d.singleRootOnly=true;d.propertySetUnavailable=!($.cpGlyph.captureControlSet&&$.cpGlyph.preflightControlSet&&$.cpGlyph.applyControlSet&&$.cpGlyph.controlSetsEqual);d.glyphSection=d.group;d.glyphLayerId=layer.id;if(ls.length!==1){d.enabled=false;d.actions=[];d.readOnlyCode='GLYPH_MULTI_EDIT_UNAVAILABLE';d.readOnlyReason='Edit one animated-font root at a time.';}}
   d.target={kind:kind,layerId:layer.id,localId:localId,instanceId:owner.instanceId,publicId:d.id};raw.push(d);
  }
  function markerRecovery(layer,owner){var id='animated-font-marker-recovery:'+layer.id+':'+owner.instanceId,d={id:id,name:'Timeline marker recovery',type:'comment',semantic:'animated-font-marker-recovery',value:'Reset recreates missing owned markers and restores Animation In to its authored default.',groupPath:[owner.name||'Animated font','Timeline'],enabled:true,actions:['reset'],mergeKey:id,target:{kind:'animated-font-recovery',layerId:layer.id,instanceId:owner.instanceId,localId:'inEnabled',publicId:id}};try{if(ls.length!==1)fail('GLYPH_MULTI_EDIT_UNAVAILABLE','Select one animated-font root to recover its markers.');$.cpGlyph.preflightReset(layer,{controlId:'inEnabled'});}catch(recoveryError){d.enabled=false;d.actions=[];d.readOnlyCode=recoveryError.code||'GLYPH_RECOVERY_UNAVAILABLE';d.readOnlyReason=String(recoveryError.message||recoveryError);}raw.push(d);}
  for(i=0;i<ls.length;i++)try{
   var layer=ls[i],overlay=$.cpOverlay.instances(layer)||[],precomp=$.cpPrecomp.instances(layer)||[],texture=$.cpTexture.instances(layer)||[],glyph=$.cpGlyph.instances(layer)||[],all=overlay.concat(precomp,texture,glyph);
   for(j=0;j<all.length;j++){
    instance=all[j];if(j<overlay.length)kind='overlay';else if(j<overlay.length+precomp.length)kind='precomp';else if(j<overlay.length+precomp.length+texture.length)kind='texture';else kind='animated-font';legacy=legacy||!!instance.legacyTimeline;diagnosticRoots.push({layer:layer,kind:kind,instance:instance});
    var instanceActions=['copy','remove','reset'];if(kind!=='texture'||String(instance.variantId).indexOf('library:')===0)instanceActions.push('reveal');
    if(kind==='animated-font')instanceActions=['copy'];
    applied.push({id:kind+':'+layer.id+':'+instance.instanceId,instanceId:instance.instanceId,variantId:instance.variantId,name:instance.name||label(instance.variantId),direction:instance.direction||'both',layerId:layer.id,type:kind==='precomp'||kind==='texture'?10:instance.type,kind:kind,legacyTimeline:!!instance.legacyTimeline,actions:instanceActions});
    var missing=instance.missingAudio||[];for(k=0;k<missing.length;k++)if(!audioSeen[missing[k]]){audioSeen[missing[k]]=true;audioMissing.push(missing[k]);}
   }
   list=$.cpOverlay.controls(layer)||[];
   for(j=0;j<list.length;j++){instance=null;for(k=0;k<overlay.length;k++)if(overlay[k].instanceId===list[j].instanceId||String(list[j].id).indexOf(overlay[k].instanceId+':')===0)instance=overlay[k];if(instance)addDescriptor(layer,'overlay',list[j],instance);}
   list=precomp.length?$.cpPrecomp.controls([layer])||[]:[];
   for(j=0;j<list.length;j++)addDescriptor(layer,'precomp',list[j],precomp[0]);
   list=texture.length?$.cpTexture.controls(layer)||[]:[];for(j=0;j<list.length;j++)addDescriptor(layer,'texture',list[j],texture[0]);
   try{list=glyph.length?$.cpGlyph.controls(layer)||[]:[];for(j=0;j<list.length;j++)addDescriptor(layer,'animated-font',list[j],glyph[0]);}catch(glyphError){if(glyphError.code!=='GLYPH_MARKER_MISSING')throw glyphError;errors.push({layerId:layer.id,code:glyphError.code,message:String(glyphError.message||glyphError)});markerRecovery(layer,glyph[0]);}
   if(precomp.length&&$.cpPrecomp.media)mediaRoots.push({rootLayerId:layer.id,rootLayerName:layer.name,instanceId:precomp[0].instanceId,media:$.cpPrecomp.media(layer)});
   if($.cpTimeline&&layer.property)for(j=0;j<overlay.length+precomp.length;j++)if(!all[j].legacyTimeline){
    instance=all[j];var markers=$.cpTimeline.read(layer,instance.instanceId);
    var present={};for(k=0;k<markers.length;k++){
     var mark=markers[k],mid='marker:'+layer.id+':'+instance.instanceId+':'+mark.role;
     present[mark.role]=true;
     raw.push({id:mid,name:mark.comment||mark.role.toUpperCase(),type:'time',value:mark.time,groupPath:[instance.name||label(instance.variantId),'Timeline'],min:-10800,max:10800,actions:['alignToPlayhead','remove'],mergeKey:mid,target:{kind:'marker',layerId:layer.id,localId:mark.role,instanceId:instance.instanceId,publicId:mid}});
    }
    var expectedRoles=[];
    if(instance.type===1){if(instance.direction!=='out')expectedRoles.push('in');if(instance.direction!=='in')expectedRoles.push('out');}
    else if(j>=overlay.length){var variant=find(instance.variantId).variant;if(variant.generator&&variant.generator.kind==='camera')expectedRoles.push('cut');else{if(instance.insertIn!==false)expectedRoles.push('in');if(instance.insertOut!==false)expectedRoles.push('out');}}
    for(k=0;k<expectedRoles.length;k++)if(!present[expectedRoles[k]]){var role=expectedRoles[k],missingId='missing-marker:'+layer.id+':'+instance.instanceId+':'+role;raw.push({id:missingId,name:role.toUpperCase()+' 마커 없음',type:'comment',nodeType:'effect_preset_marker_group',value:'마커가 없는 전환은 비활성화됩니다.',groupPath:[instance.name||label(instance.variantId),'Timeline'],actions:['add'],mergeKey:missingId,target:{kind:'missing-marker',layerId:layer.id,localId:role,instanceId:instance.instanceId,variantId:instance.variantId,presetKind:j<overlay.length?'overlay':'precomp',publicId:missingId}});}
   }
  }catch(error){errors.push({layerId:ls[i].id,code:error.code||'HOST_ERROR',message:String(error.message||error)});}
  ordinaryControlOccurrences(raw,applied);
  var colorWarnings=[];
  if(ls.length&&$.cpColors)try{var colors=$.cpColors.enumerate(ls,{time:c.time});colorWarnings=colors.warnings;for(i=0;i<colors.controls.length;i++){if(ownedGlyphColor(c,colors.controls[i]))continue;var color=clone(colors.controls[i]),colorId=color.id;color.groupPath=['Layer Selection','Colors'];color.enabled=color.canSet;color.actions=color.canSet?['copy','paste']:['copy'];color.mergeKey='color:'+json(color.value);color.target={kind:'color',layerId:color.layerId,localId:colorId,publicId:colorId};raw.push(color);}}catch(colorError){errors.push({code:colorError.code||'COLOR_UNAVAILABLE',message:String(colorError.message||colorError)});}
  var ctx=context(c),diagnostics=selectedExpressionDiagnostics(c,diagnosticRoots,ctx),paletteInfo=paletteState(raw,ctx),controls=groupControls(raw).concat(paletteInfo.controls),signature=json(ctx),id;
  var ids=[];for(i=0;i<applied.length;i++)ids.push(applied[i].id);
  id=signature+'|'+ids.join('|');
  var result={instanceId:id,selectionSignature:signature,context:ctx,numSelectedLayers:ls.length,selectedLayerName:ls.length===1?ls[0].name:ls.length+' layers',frameDuration:c instanceof CompItem?c.frameDuration:null,dropFrame:c instanceof CompItem?!!c.dropFrame:false,dropframe:c instanceof CompItem?!!c.dropFrame:false,hasRootNode:applied.length>0,wantsRevealEditTab:applied.length>0,hasError:errors.length>0,errors:errors,controls:controls,controlGroups:[],applied:applied,clipboard:{numPresets:session.clipboard.length},legacyTimeline:legacy,audio:{missing:audioMissing,root:$.cpAudio.root}};
  result.expressionWarnings=diagnostics.warnings;result.expressionDiagnostics=diagnostics.coverage;result.paletteCandidates=paletteInfo.candidates;result.colorPicker=pickerCapabilities();
  result.hasRootNode=controls.length>0||applied.length>0;result.mediaRoots=mediaRoots;result.projectRevision=projectRevision();result.colorWarnings=colorWarnings;
  var controlGroups={},groupOrder=[];for(i=0;i<controls.length;i++){var cd=controls[i];if(!cd.setGroupKey||cd.type==='comment')continue;if(cd.setSectionKey){var section=controlGroups[cd.setSectionKey];if(!section){section={key:cd.setSectionKey,name:cd.propertySetSection,groupPath:cd.groupPath.slice(0,2),section:true,controlIds:[],canSave:true,reason:null};controlGroups[cd.setSectionKey]=section;groupOrder.push(cd.setSectionKey);}section.controlIds.push(cd.id);if(cd.mixed||cd.enabled===false){section.canSave=false;section.reason=cd.mixed?'서로 다른 값이 선택되어 있습니다.':(cd.readOnlyReason||'편집할 수 없는 속성이 있습니다.');}}var cg=controlGroups[cd.setGroupKey];if(!cg){cg={key:cd.setGroupKey,name:cd.groupPath.join(' / '),controlIds:[],canSave:true,reason:null};controlGroups[cd.setGroupKey]=cg;groupOrder.push(cd.setGroupKey);}cg.controlIds.push(cd.id);if(cd.mixed||cd.enabled===false){cg.canSave=false;cg.reason=cd.mixed?'서로 다른 값이 선택되어 있습니다.':'잠긴 레이어가 선택되어 있습니다.';}}
  for(i=0;i<controls.length;i++){var glyphGroup=controlGroups[controls[i].setGroupKey];if(controls[i].glyphSection&&glyphGroup){glyphGroup.glyphSection=controls[i].glyphSection;glyphGroup.glyphLayerId=controls[i].glyphLayerId;}if(controls[i].propertySetUnavailable&&glyphGroup){glyphGroup.canSave=false;glyphGroup.actions=[];glyphGroup.reason='Animated-font settings presets are unavailable.';}}
  for(i=0;i<groupOrder.length;i++)result.controlGroups.push(controlGroups[groupOrder[i]]);
  result.soundApplyOptions=soundApplyOptions(ls);
  result.precompApplyOptions={canReplace:ls.length===1&&applied.length===1&&applied[0].kind==='precomp',textureSelected:ls.length===1&&texture&&texture.length===1,canApplyTexture:$.cpTexture.canApply(ls),canReplaceTexture:ls.length===1&&applied.length===1&&applied[0].kind==='texture'&&!ls[0].locked};
  result.toolState={easing:{}};
  try{result.toolState.easing.selectionMode=c instanceof CompItem&&$.cpTools.easingSelectionMode?$.cpTools.easingSelectionMode(c):'none';}catch(toolError){result.toolState.easing.unavailableReason=String(toolError.message||toolError);}
  result.revision=hash(json(result));return result;
 }
 function mergeOptions(options){var out={},nested=options.options||{},k;for(k in options)if(options.hasOwnProperty(k)&&k!=='options')out[k]=options[k];for(k in nested)if(nested.hasOwnProperty(k))out[k]=nested[k];if(typeof out.animateIn==='boolean')out.insertIn=out.animateIn;if(typeof out.animateOut==='boolean')out.insertOut=out.animateOut;if(typeof out.sound==='boolean')out.insertSound=out.sound;return out;}
 function conversionRecord(id){for(var i=0;i<session.conversionRequests.length;i++)if(session.conversionRequests[i].snapshot.id===id)return session.conversionRequests[i];return null;}
 function conversionSnapshot(id,c,targets,recipe,options,settings){var ids=[],revision=projectRevision(),i;if(typeof revision!=='number'||!isFinite(revision)||typeof c.time!=='number'||!isFinite(c.time))fail('CONFIRM_CONTEXT_UNAVAILABLE','현재 프로젝트 상태를 확인한 뒤 다시 적용하세요.');for(i=0;i<targets.length;i++)if(!targets[i].threeDLayer)ids.push(targets[i].id);ids.sort(function(a,b){return a-b;});return{id:id,context:context(c),expectedRevision:revision,time:c.time,request:{variantId:String(options.variantId),direction:options.direction||'both',inDuration:options.inDuration===undefined?null:clone(options.inDuration),outDuration:options.outDuration===undefined?null:clone(options.outDuration)},conversionLayerIds:ids,recipeKey:json(recipe),motionBlurEnabled:settings.presetMotionBlurEnabled!==false};}
 function conversionPreflight(raw,options,c,targets,recipe,settings){
  var acknowledging=options.retryContext!==undefined||options.canConvertLayerTo3d!==undefined,eligible=String(options.variantId)==='1b8'&&recipe&&recipe.profile&&recipe.profile.threeD===true,record,snapshot,i,key,allowed={variantId:1,direction:1,inDuration:1,outDuration:1,context:1,expectedRevision:1,canConvertLayerTo3d:1,retryContext:1};
  if(acknowledging){if(!eligible||raw.options!==undefined||raw.canConvertLayerTo3d!==true||!raw.retryContext||typeof raw.retryContext.id!=='string')fail('INVALID_RETRY_REQUEST','변환 확인 요청이 올바르지 않습니다. 다시 적용하세요.');for(key in raw)if(raw.hasOwnProperty(key)&&!allowed[key])fail('INVALID_RETRY_REQUEST','지원하지 않는 변환 확인 옵션입니다.');record=conversionRecord(raw.retryContext.id);if(!record||record.consumed||record.builder!==$.cpPresetBuilder.build||record.overlay!==$.cpOverlay||record.apply!==$.cpOverlay.apply||record.preflight!==$.cpOverlay.preflight||json(raw.retryContext)!==json(record.snapshot))fail('CONFIRMATION_CHANGED','변환 확인이 만료되었거나 변경되었습니다. 다시 적용하세요.');if(!options.context||typeof options.expectedRevision!=='number'||!isFinite(options.expectedRevision))fail('CONFIRMATION_CHANGED','변환 확인의 프로젝트 상태가 없습니다.');snapshot=conversionSnapshot(record.snapshot.id,c,targets,recipe,options,settings);if(!snapshot.conversionLayerIds.length||json(snapshot)!==json(record.snapshot)||json(options.context)!==json(snapshot.context)||options.expectedRevision!==snapshot.expectedRevision)fail('CONFIRMATION_CHANGED','프로젝트, 선택, 시간 또는 프리셋이 변경되었습니다. 다시 적용하세요.');record.consumed=true;return;}
  if(!eligible)return;for(i=0;i<targets.length;i++)if(!targets[i].threeDLayer)break;if(i===targets.length)return;snapshot=conversionSnapshot('',c,targets,recipe,options,settings);
  snapshot.id='convert-3d-'+new Date().getTime()+'-'+(++session.conversionSerial);record={snapshot:clone(snapshot),consumed:false,builder:$.cpPresetBuilder.build,overlay:$.cpOverlay,apply:$.cpOverlay.apply,preflight:$.cpOverlay.preflight};session.conversionRequests.push(record);if(session.conversionRequests.length>16)session.conversionRequests.shift();var error=new Error('선택한 2D 레이어를 3D로 변환한 뒤 이 프리셋을 적용하시겠습니까?');error.code='CONFIRM_3D_CONVERSION';error.type='RetryableError';error.retryOptions={canConvertLayerTo3d:true};error.retryContext=clone(snapshot);error.mutationStarted=false;throw error;
 }
 function errorEnvelope(error){var result={code:error.code||'HOST_ERROR',message:String(error.message||error),line:error.line||0,rollbackError:error.rollbackError||null},record=error.retryContext&&conversionRecord(error.retryContext.id);if(error.code==='CONFIRM_3D_CONVERSION'&&error.type==='RetryableError'&&error.mutationStarted===false&&!error.rollbackError&&record&&!record.consumed&&json(error.retryContext)===json(record.snapshot)&&json(error.retryOptions)==='{"canConvertLayerTo3d":true}'){result.type='RetryableError';result.retryOptions={canConvertLayerTo3d:true};result.retryContext=clone(record.snapshot);result.mutationStarted=false;}return result;}
 function apply(options){
  var raw=options;options=mergeOptions(options);var c=comp();guard(options.context,c);capturedRevision(options);var f=find(options.variantId),variant=clone(f.variant),entry=f.entry,targets=selected(c),i,receipts=[],result,settings=$.cpWorkspace.getSettings().settings;
  if(variant.available!==true)fail('PRESET_UNAVAILABLE','이 프리셋은 사용할 수 없습니다.');
  if(variant.type!==10&&!targets.length)fail('NO_SELECTED_LAYERS','프리셋을 적용할 레이어를 선택하세요.');
  if(options.insertAsTexture)fail('TEXTURE_UNAVAILABLE','이 프리셋은 텍스처 적용을 지원하지 않습니다.');
  var recipe=variant.type===10?null:$.cpPresetBuilder.build(variant,entry);
  if(recipe&&recipe.text)for(i=0;i<targets.length;i++)if(!(targets[i] instanceof TextLayer))fail('TEXT_LAYER_REQUIRED','텍스트 프리셋은 텍스트 레이어에 적용해주세요.');
  if(recipe&&$.cpOverlay.preflight)for(i=0;i<targets.length;i++)$.cpOverlay.preflight(targets[i],recipe,options);
  if(options.replaceSelected)for(i=0;i<targets.length;i++)if($.cpGlyph.instances(targets[i]).length)fail('GLYPH_REPLACE_UNAVAILABLE','Animated-font instances cannot be replaced as generic precomps.');
  if(options.replaceSelected&&(targets.length!==1||!$.cpPrecomp.instances(targets[0]).length))fail('REPLACE_TARGET_REQUIRED','교체할 Contentrium 프리컴포지션 레이어 하나를 선택하세요.');
  conversionPreflight(raw,options,c,targets,recipe,settings);
  return undo(entry.name,function(){
   if(variant.type===10){variant.title=entry.name;options.direction=options.direction||'both';options.time=c.time;options.presetMotionBlurEnabled=settings.presetMotionBlurEnabled;
    if(!settings.insertPrecompAfterInTransition&&variant.generator&&variant.generator.kind!=='camera'&&$.cpPrecomp.profile)options.time-= $.cpPrecomp.profile(variant.id).startOffset;
    result=options.replaceSelected?$.cpPrecomp.replace(targets[0],variant,options,root):$.cpPrecomp.apply(c,variant,options,root);targets=result.layers;
   }else for(i=0;i<targets.length;i++){receipts.push($.cpOverlay.apply(targets[i],recipe,{direction:options.direction||'both',inDuration:options.inDuration,outDuration:options.outDuration,controllerLayout:options.controllerLayout,undoGroup:false}));}
   if(settings.presetMotionBlurEnabled===false)for(i=0;i<targets.length;i++)targets[i].motionBlur=false;
   for(i=1;i<=c.numLayers;i++)c.layer(i).selected=false;for(i=0;i<targets.length;i++)targets[i].selected=true;
   return{appliedLayers:targets.length,receipts:receipts,variantId:variant.id,instanceId:result?result.instanceId:null,warnings:result?(result.warnings||[]):[],missingAudio:result?(result.missingAudio||[]):[]};
  });
 }
 function controlTargets(options){var c=comp();guard(options.context,c);var state=getState(),definition=null;for(var i=0;i<state.controls.length;i++)if(state.controls[i].id===options.id)definition=state.controls[i];if(!definition||!targetMap[options.id])fail('CONTROL_NOT_FOUND','컨트롤 또는 선택 항목이 변경되었습니다.');return{comp:c,definition:definition,targets:targetMap[options.id]};}
 function readTarget(c,t){var layer=layerById(c,t.layerId),list,i;if(t.kind==='marker'){list=$.cpTimeline.read(layer,t.instanceId);for(i=0;i<list.length;i++)if(list[i].role===t.localId)return list[i].time;}
  else if(t.kind==='color')return $.cpColors.get([layer],t.localId,{time:c.time}).value;
  else if(t.kind==='animated-font')return $.cpGlyph.getControl(layer,t.localId);
  else{list=t.kind==='overlay'?$.cpOverlay.controls(layer):(t.kind==='texture'?$.cpTexture.controls(layer):$.cpPrecomp.controls([layer]));for(i=0;i<list.length;i++)if(list[i].id===t.localId)return clone(list[i].value);}fail('CONTROL_NOT_FOUND','컨트롤이 변경되었습니다.');
 }
 function writeTarget(c,t,value){var layer=layerById(c,t.layerId);if(layer.locked)fail('LAYER_LOCKED','잠긴 레이어를 편집할 수 없습니다.');if(t.kind==='animated-font')return $.cpGlyph.setControl(layer,t.localId,value);if(t.kind==='color'){if(ownedGlyphColor(c,$.cpColors.get([layer],t.localId,{time:c.time})))fail('GLYPH_COLOR_ROUTE_UNAVAILABLE','Edit the owned color through its animated-font control.');return $.cpColors.set([layer],[{id:t.localId,value:value}],{time:c.time,undoGroup:false});}if(t.kind==='overlay')return $.cpOverlay.setControl(layer,t.localId,value,{undoGroup:false});if(t.kind==='texture')return $.cpTexture.setControl(layer,t.localId,value);if(t.kind==='precomp')return $.cpPrecomp.setControl(layer,t.localId,value);if(t.kind==='marker')return $.cpTimeline.set(layer,t.instanceId,t.localId,{time:value});}
 function sum(base,delta){if(array(base)&&array(delta)&&base.length===delta.length){var out=[];for(var i=0;i<base.length;i++)out.push(sum(base[i],delta[i]));return out;}if(typeof base==='number'&&typeof delta==='number')return base+delta;fail('RELATIVE_VALUE_UNAVAILABLE','이 속성은 상대값 입력을 지원하지 않습니다.');}
 function setControl(options){
  if(typeof options.id==='string'&&options.id.indexOf('palette:')===0)return paletteAction({action:'apply',id:options.id,value:options.value,context:options.context,expectedRevision:options.expectedRevision});
  var found=controlTargets(options),targets=found.targets,d=found.definition,c=found.comp,before=[],after=[],snapshots=[],forceWrite=false,i,gesture=options.undoGroupId,g=null,signature=json(context(c));
  for(i=0;i<targets.length;i++)if(targets[i].kind==='animated-font-recovery')fail('GLYPH_ACTION_UNAVAILABLE','Use the explicit marker Reset action.');
  var glyphWrite=false,glyphRevision=projectRevision();for(i=0;i<targets.length;i++)if(targets[i].kind==='animated-font')glyphWrite=true;if(glyphWrite)glyphGuard(options,c);
  if(String(d.type).toLowerCase()==='color')requireColorRevision(options);
  if(d.enabled===false)fail(d.readOnlyCode||(/^[A-Z_]+$/.test(d.readOnlyReason||'')?d.readOnlyReason:'CONTROL_READ_ONLY'),d.readOnlyReason||'이 속성은 읽기 전용입니다.');
  var paletteWrite=String(d.type).toLowerCase()==='color'?capturePaletteWrite(signature):null;
  if(gesture){
   if(typeof gesture!=='string'||gesture==='__proto__'||gesture==='constructor'||gesture==='prototype')fail('INVALID_GESTURE','잘못된 드래그 식별자입니다.');
   g=session.gestures[gesture];
   if(g&&(g.context!==signature||g.id!==options.id||g.targets!==json(targets)))fail('GESTURE_INTERRUPTED','드래그 중 선택 항목 또는 컨트롤이 변경되었습니다.');
   if(!g){if(projectRevision()===null)fail('GESTURE_UNAVAILABLE','이 호스트에서 연속 변경의 실행 취소를 확인할 수 없습니다.');g={context:signature,id:options.id,targets:json(targets),values:{},lastValues:null,revision:null};}
  }
  for(i=0;i<targets.length;i++){
   var t=targets[i],old=readTarget(c,t),base=old;before.push(old);
   if(g){var key=t.publicId;if(!g.values.hasOwnProperty(key))g.values[key]=clone(old);base=g.values[key];}
   var value=options.relative?sum(base,options.value):clone(options.value);
   if(String(d.type).toLowerCase()==='color'){
    if(!array(value)||(value.length!==3&&value.length!==4))fail('COLOR_INVALID_VALUE','RGB 또는 RGBA 색상값이 필요합니다.');
    if(array(old)&&old.length===4&&value.length===3)value.push(old[3]);
    if(array(old)&&old.length===3&&value.length===4){if(value[3]!==1)fail('COLOR_ALPHA_UNSUPPORTED','이 속성은 알파 편집을 지원하지 않습니다.');value.pop();}
   }
   if(typeof value==='number'&&(!isFinite(value)||(typeof d.min==='number'&&value<d.min)||(typeof d.max==='number'&&value>d.max)))fail('CONTROL_RANGE','허용 범위를 벗어난 값입니다.');
   if(array(value))for(var j=0;j<value.length;j++)if(typeof value[j]!=='number'||!isFinite(value[j]))fail('INVALID_CONTROL','벡터 값은 유한한 숫자여야 합니다.');
   if(layerById(c,t.layerId).locked)fail('LAYER_LOCKED','잠긴 레이어를 편집할 수 없습니다.');
   if(t.kind==='texture')$.cpTexture.preflightControl(layerById(c,t.layerId),t.localId,value);
   if(t.kind==='animated-font')$.cpGlyph.preflightControl(layerById(c,t.layerId),t.localId,value);
   if(t.kind==='precomp'&&$.cpPrecomp.preflightControl){var preflight=$.cpPrecomp.preflightControl(layerById(c,t.layerId),t.localId,value);forceWrite=forceWrite||!!(preflight&&preflight.sideEffects);}
   snapshots.push(t.kind==='precomp'&&$.cpPrecomp.snapshotControl?$.cpPrecomp.snapshotControl(layerById(c,t.layerId),t.localId):null);after.push(value);
  }
  if(d.semantic==='selected-layer-color'){var colorChanges=[];for(i=0;i<targets.length;i++)colorChanges.push({id:targets[i].localId,value:after[i],expectedValue:before[i]});$.cpColors.preflight(selected(c),colorChanges,{time:c.time});}
  if(g&&g.lastValues&&(g.revision===null||g.revision!==projectRevision()||json(before)!==json(g.lastValues)))fail('GESTURE_INTERRUPTED','드래그 중 다른 변경이 발생했습니다. 마우스를 놓고 다시 조정하세요.');
  if(json(before)===json(after)&&!forceWrite)return{changedControls:0};
  if(glyphWrite){glyphGuard(options,c);if(projectRevision()!==glyphRevision)fail('STALE_PROJECT','Project changed during animated-font control preflight.');}
  if(g&&g.lastValues){
   // Consume only this gesture's verified latest native entry, then replace it.
   g.lastValues=null;g.revision=null;app.executeCommand(16);c=comp();guard(options.context,c);
   if(json(context(c))!==signature)fail('GESTURE_INTERRUPTED','실행 취소 중 선택 항목이 바뀌었습니다.');
   for(i=0;i<targets.length;i++){before[i]=readTarget(c,targets[i]);if(json(before[i])!==json(g.values[targets[i].publicId]))fail('GESTURE_UNDO_FAILED','드래그 시작 값을 복원하지 못했습니다.');}
  }
  if(g)session.gestures[gesture]=g;
  var revisionBefore=projectRevision(),result=undo('Control',function(){var written=0;try{for(;written<targets.length;written++)writeTarget(c,targets[written],after[written]);}catch(error){var rollbackFrom=Math.min(written,targets.length-1);if(glyphWrite)rollbackFrom=written-1;for(var r=rollbackFrom;r>=0;r--)try{if(snapshots[r]&&$.cpPrecomp.restoreControl)$.cpPrecomp.restoreControl(layerById(c,targets[r].layerId),targets[r].localId,snapshots[r]);else writeTarget(c,targets[r],before[r]);}catch(rollback){error.rollbackError=error.rollbackError||String(rollback.message||rollback);}throw error;}return{changedControls:targets.length};},glyphWrite);
  if(g&&revisionBefore!==projectRevision()){g.lastValues=[];for(i=0;i<targets.length;i++)g.lastValues.push(readTarget(c,targets[i]));g.revision=projectRevision();}
  if(paletteWrite)advancePaletteWrite(paletteWrite,c);
  return result;
 }
 function filterApplied(state,options){var out=[];for(var i=0;i<state.applied.length;i++){var p=state.applied[i];if(options.instanceId&&p.instanceId!==options.instanceId&&p.id!==options.instanceId)continue;if(options.scope==='effects'&&p.type!==3)continue;if(options.scope==='transitions'&&p.type!==1)continue;if((options.scope==='in'||options.scope==='out')&&(p.type!==1||p.direction!==options.scope&&p.direction!=='both'))continue;out.push(p);}return out;}
 function serializeApplied(c,applied,scope){var rows=[],seen={};for(var i=0;i<applied.length;i++){var p=applied[i],key=p.layerId+':'+p.instanceId;if(seen[key])continue;seen[key]=true;var l=layerById(c,p.layerId),data;if(p.kind==='animated-font')data=$.cpGlyph.serialize(l);else data=p.kind==='overlay'?$.cpOverlay.serialize(l,p.instanceId,scope==='effects'?'effect':(scope==='in'||scope==='out'?scope:null)):(p.kind==='texture'?$.cpTexture.serialize(l):$.cpPrecomp.serialize(l));rows.push(data);}return rows;}
 function textureReceipt(result){return{kind:'texture',instanceId:result.instanceId,addedLayerId:result.layers[0].id,replaced:result.replaced===true};}
 function textureSource(ref){if(!ref||!(/^(image|video|image-sequence)$/.test(ref.kind))||typeof ref.path!=='string')fail('TEXTURE_SOURCE_REQUIRED','저장한 텍스처의 이미지·영상 경로를 확인하세요.');return $.cpWorkspace.importMedia(ref,ref.options||{}).item;}
 function pasteData(c,data,targets,options){options=options||{};if(data.kind==='animated-font'){glyphGuard(options,c);return glyphReceipt(c,$.cpGlyph.restore(c,data,{atTime:c.time}));}if(data.kind==='texture'){if(targets.length!==1)fail('TEXTURE_TARGET_REQUIRED','텍스처를 붙일 레이어 하나를 선택하세요.');$.cpTexture.preflightTarget(targets[0]);return textureReceipt($.cpTexture.paste(targets[0],data,textureSource(data.sourceRef)));}if(data.kind==='precomp')return $.cpPrecomp.paste(c,data,{time:c.time},root);if(!targets.length)fail('NO_SELECTED_LAYERS','붙여넣을 레이어를 선택하세요.');var results=[],i;for(i=0;i<targets.length;i++){if(targets[i].locked)fail('LAYER_LOCKED','잠긴 레이어를 편집할 수 없습니다.');if(data.kind!=='overlay'&&$.cpUserPreset)$.cpUserPreset.preflight(targets[i],data,{time:c.time,replaceText:options.replaceText===true,overwrite:options.overwrite===true});}for(i=0;i<targets.length;i++){if(data.kind==='overlay')results.push($.cpOverlay.paste(targets[i],data,{undoGroup:false}));else if($.cpUserPreset)results.push($.cpUserPreset.apply(targets[i],data,{time:c.time,undoGroup:false,replaceText:options.replaceText===true,overwrite:options.overwrite===true}));else fail('PRESET_TYPE_UNSUPPORTED','지원하지 않는 사용자 프리셋입니다.');}return{results:results};}
 function presetAction(options){
  var c=comp();guard(options.context,c);capturedRevision(options);var state=getState(),items=filterApplied(state,options),action=options.action,ls=selected(c),i;
  if(action==='copy'){if(!items.length)fail('NO_PRESET','복사할 프리셋을 선택하세요.');session.clipboard=serializeApplied(c,items,options.scope);return{copied:session.clipboard.length};}
  if(action==='reveal'){if(!items.length)fail('NO_PRESET','프리셋을 선택하세요.');return{variantId:items[0].variantId};}
  if(action==='paste'&&!session.clipboard.length)fail('EMPTY_CLIPBOARD','먼저 프리셋을 복사하세요.');
  if(action!=='paste'&&!items.length)fail('NO_PRESET','적용된 프리셋을 선택하세요.');
  if(action!=='paste'&&action!=='remove'&&action!=='reset'&&action!=='upgradeTimeline')fail('UNKNOWN_ACTION','지원하지 않는 프리셋 작업입니다.');
  for(i=0;i<(action==='paste'?ls.length:items.length);i++){var targetLayer=action==='paste'?ls[i]:layerById(c,items[i].layerId);var textureOnly=action==='paste'&&session.clipboard.length>0;for(var ti=0;ti<session.clipboard.length;ti++)if(session.clipboard[ti].kind!=='texture')textureOnly=false;if(targetLayer.locked&&!textureOnly)fail('LAYER_LOCKED','잠긴 레이어는 변경할 수 없습니다.');}
  var glyphTransaction=false;if(action!=='paste')for(i=0;i<items.length;i++)if(items[i].kind==='animated-font')fail('GLYPH_ACTION_UNAVAILABLE','This generated instance action is unavailable.');if(action==='paste')for(i=0;i<session.clipboard.length;i++)if(session.clipboard[i].kind==='animated-font')glyphTransaction=true;if(glyphTransaction)glyphGuard(options,c);
  var pasted=[];if(action==='paste')for(i=0;i<session.clipboard.length;i++){var data=clone(session.clipboard[i]);if(options.scope&&options.scope!=='all'){if(data.kind!=='overlay')continue;var plans=[];for(var n=0;n<data.plans.length;n++){var plan=data.plans[n];if(options.scope==='effects'){if(plan.type===3)plans.push(plan);}else if(options.scope==='transitions'){if(plan.type===1)plans.push(plan);}else if(plan.type!==3&&(plan.direction===options.scope||plan.direction==='both')){plan.direction=options.scope;var marks=[];for(var m=0;m<plan.markers.length;m++)if(plan.markers[m].role===options.scope)marks.push(plan.markers[m]);plan.markers=marks;plans.push(plan);}}data.plans=plans;if(!plans.length)continue;}pasted.push(data);}
  if(action==='paste'&&!pasted.length)fail('CLIPBOARD_SCOPE_EMPTY','선택한 범위에 붙여넣을 프리셋이 없습니다.');
  if(glyphTransaction&&(pasted.length!==1||pasted[0].kind!=='animated-font'))fail('GLYPH_PASTE_BATCH_UNAVAILABLE','Paste one animated-font instance at a time.');
  return undo(action,function(){var receipts=[];
   if(action==='paste'){for(i=0;i<pasted.length;i++)receipts.push(pasteData(c,pasted[i],ls,options));return{pasted:receipts.length,receipts:receipts};}
   for(i=0;i<items.length;i++){var p=items[i],l=layerById(c,p.layerId);if(l.locked)fail('LAYER_LOCKED','잠긴 레이어는 변경할 수 없습니다.');
    if(action==='upgradeTimeline'&&p.kind==='texture')fail('TIMELINE_UNSUPPORTED','텍스처는 별도의 In/Out 마커를 사용하지 않습니다.');
    if(action==='upgradeTimeline')receipts.push(p.kind==='overlay'?$.cpOverlay.upgradeTimeline(l,p.instanceId,{undoGroup:false}):$.cpPrecomp.upgradeTimeline(l));
    else if(action==='remove'){if(p.kind==='texture')receipts.push($.cpTexture.remove(l,p.instanceId));else if(p.kind==='precomp')receipts.push($.cpPrecomp.remove(l,p.instanceId));else if(options.scope==='in'||options.scope==='out')receipts.push($.cpOverlay.removeSide(l,p.instanceId,options.scope,{undoGroup:false}));else receipts.push($.cpOverlay.remove(l,p.instanceId,{undoGroup:false}));}
    else if(action==='reset'){if(p.kind==='texture')receipts.push($.cpTexture.reset(l));else if(p.kind==='precomp')receipts.push($.cpPrecomp.reset(l,{scope:'all'}));else if(options.scope==='in'||options.scope==='out')receipts.push($.cpOverlay.resetSide(l,p.instanceId,options.scope,{undoGroup:false}));else receipts.push($.cpOverlay.reset(l,p.instanceId,{undoGroup:false}));}
    else fail('UNKNOWN_ACTION','지원하지 않는 프리셋 작업입니다.');
   }return{changed:receipts.length,receipts:receipts};
  },glyphTransaction);
 }
 function propertyAction(options){
  if(typeof options.id==='string'&&options.id.indexOf('palette:')===0)return paletteAction(options);
  var found=controlTargets(options),c=found.comp,targets=found.targets,i,action=options.action;
  if(targets.length&&targets[0].kind==='animated-font-recovery'){glyphGuard(options,c);if(action!=='reset')fail('GLYPH_ACTION_UNAVAILABLE','Only explicit marker Reset is supported.');if(found.definition.enabled===false)fail(found.definition.readOnlyCode||'GLYPH_RECOVERY_UNAVAILABLE',found.definition.readOnlyReason);if(targets.length!==1||selected(c).length!==1)fail('GLYPH_MULTI_EDIT_UNAVAILABLE','Select one animated-font root to recover its markers.');var recoveryRoot=layerById(c,targets[0].layerId),recoveryRevision=projectRevision();$.cpGlyph.preflightReset(recoveryRoot,{controlId:'inEnabled'});glyphGuard(options,c);if(projectRevision()!==recoveryRevision)fail('STALE_PROJECT','Project changed during marker recovery preflight.');return undo('Reset glyph markers',function(){return $.cpGlyph.reset(recoveryRoot,{controlId:'inEnabled'});},true);}
  if(found.definition.readOnlyCode==='CONTROL_OCCURRENCE_MISMATCH')fail('CONTROL_OCCURRENCE_MISMATCH',found.definition.readOnlyReason);
  if(action==='copy'){session.propertyClipboard={type:found.definition.type,value:readTarget(c,targets[0])};return{copied:true};}
  if(action==='paste'){if(!session.propertyClipboard)fail('EMPTY_CLIPBOARD','먼저 속성을 복사하세요.');if(session.propertyClipboard.type!==found.definition.type)fail('VALUE_TYPE_MISMATCH','같은 형식의 속성만 붙여넣을 수 있습니다.');options.value=session.propertyClipboard.value;return setControl(options);}
  var glyphProperty=false;for(i=0;i<targets.length;i++)if(targets[i].kind==='animated-font')glyphProperty=true;if(glyphProperty){glyphGuard(options,c);var canReset=false;for(i=0;i<found.definition.actions.length;i++)if(found.definition.actions[i]==='reset')canReset=true;if(action!=='reset'||!canReset)fail('GLYPH_ACTION_UNAVAILABLE','This glyph control action is unavailable.');if(found.definition.enabled===false)fail(found.definition.readOnlyCode||'CONTROL_READ_ONLY',found.definition.readOnlyReason||'Read only.');if(targets.length!==1)fail('GLYPH_RESET_BATCH_UNAVAILABLE','Reset one animated-font control at a time.');}
  if(found.definition.semantic==='selected-layer-color')fail('UNKNOWN_ACTION','이 색상은 복사와 붙여넣기만 지원합니다.');
  for(i=0;i<targets.length;i++)if(layerById(c,targets[i].layerId).locked)fail('LAYER_LOCKED','잠긴 레이어는 변경할 수 없습니다.');
  return undo('Property '+action,function(){for(i=0;i<targets.length;i++){var t=targets[i],l=layerById(c,t.layerId);
   if(t.kind==='missing-marker'&&action==='add'){
    var profile=t.presetKind==='overlay'?$.cpPresetBuilder.profile(t.variantId):$.cpPrecomp.profile(t.variantId),at=c.time,comment=t.localId.toUpperCase(),markerLabel=0;
    if(t.presetKind==='overlay'){comment=t.localId==='in'?'TR In':'TR Out';at=t.localId==='in'?l.inPoint+profile.inDuration:l.outPoint-c.frameDuration-profile.outDuration;}
    else if(t.localId==='cut')at=l.inPoint+(l.outPoint-l.inPoint)*profile.cutOffset/profile.duration;
    else{markerLabel=8;at=t.localId==='in'?l.inPoint+profile.bodyIn:l.outPoint-(profile.duration-profile.bodyOut);}
    $.cpTimeline.ensure(l,t.instanceId,[{role:t.localId,time:at,comment:comment,label:markerLabel}],{variantId:t.variantId,scope:'layer'});
   }else if(t.kind==='marker'){if(action==='alignToPlayhead')$.cpTimeline.set(l,t.instanceId,t.localId,{time:c.time});else if(action==='remove')$.cpTimeline.remove(l,t.instanceId,t.localId);else fail('UNKNOWN_ACTION','지원하지 않는 마커 작업입니다.');}
   else if(action==='reset'){if(t.kind==='animated-font')$.cpGlyph.reset(l,{controlId:t.localId});else if(t.kind==='overlay')$.cpOverlay.resetControl(l,t.localId,{undoGroup:false});else if(t.kind==='texture')$.cpTexture.reset(l,{controlId:t.localId});else $.cpPrecomp.reset(l,{controlId:t.localId});}
   else fail('UNKNOWN_ACTION','지원하지 않는 속성 작업입니다.');
  }return{changed:targets.length};},glyphProperty);
 }
 function glyphPropertySetAction(c,state,group,options){
  var roots=selected(c);if(roots.length!==1||String(roots[0].id)!==String(group.glyphLayerId))fail('GLYPH_MULTI_EDIT_UNAVAILABLE','Select one animated-font root.');
  var layer=roots[0],action=options.action,revision=projectRevision(),current=$.cpGlyph.captureControlSet(layer,group.glyphSection),args={key:group.key,values:current,id:options.presetId,name:options.name};
  if(action==='getAvailablePresets'){args.equalValues=function(saved,now){return $.cpGlyph.controlSetsEqual(layer,saved,now);};var listing=$.cpPropertySets.list(args);if(!group.canSave)listing.matchingPreset=null;return listing;}
  if(!group.canSave)fail('PROPERTY_GROUP_NOT_UNIFORM',group.reason||'This glyph section cannot be edited.');
  glyphGuard(options,c);if(projectRevision()!==revision)fail('STALE_PROJECT','Project changed while reading glyph settings.');
  if(action==='saveAs')return $.cpPropertySets.saveAs(args);
  if(action==='remove')return $.cpPropertySets.remove(args);
  if(action!=='apply')fail('UNKNOWN_ACTION','Unsupported glyph settings action.');
  var saved=$.cpPropertySets.get(args);if(saved.section!==group.glyphSection)fail('GLYPH_PROPERTY_SET_IDENTITY','Saved settings belong to another section.');var plan=$.cpGlyph.preflightControlSet(layer,saved);
  glyphGuard(options,c);if(projectRevision()!==revision)fail('STALE_PROJECT','Project changed during glyph settings preflight.');
  if(!plan.changed)return{appliedControls:0,presetId:options.presetId};
  return undo('Glyph property set',function(){var result=$.cpGlyph.applyControlSet(layer,saved);return{appliedControls:group.controlIds.length,presetId:options.presetId,changed:result.changed,timingReadback:result.timingReadback};},true);
 }
 function propertySetAction(options){
  if(!$.cpPropertySets)fail('PROPERTY_SETS_UNAVAILABLE','속성 묶음 저장 기능을 사용할 수 없습니다.');
  var c=comp();guard(options.context,c);if(options.action!=='getAvailablePresets')capturedRevision(options);var state=getState(),group=null,defs=[],values={},i,j;
  for(i=0;i<state.controlGroups.length;i++)if(state.controlGroups[i].key===options.groupKey)group=state.controlGroups[i];
  if(group&&group.actions&&group.actions.length===0)fail('PROPERTY_SET_UNAVAILABLE',group.reason);
  if(!group)fail('PROPERTY_GROUP_CHANGED','속성 그룹 또는 선택 항목이 변경되었습니다.');
  if(group.glyphSection)return glyphPropertySetAction(c,state,group,options);
  for(i=0;i<group.controlIds.length;i++)for(j=0;j<state.controls.length;j++)if(state.controls[j].id===group.controlIds[i]){var d=state.controls[j];defs.push(d);values[d.setControlKey]={type:d.type,value:clone(d.value)};}
  var args={key:group.key,values:values,id:options.presetId,name:options.name},action=options.action;
  if(action==='getAvailablePresets'){args.compatibleValues=function(saved,current){var count=0,key,has=Object.prototype.hasOwnProperty;if(!saved||typeof saved!=='object'||array(saved))return false;for(key in saved)if(has.call(saved,key)){count++;if(!has.call(current,key)||!saved[key]||!current[key]||saved[key].type!==current[key].type)return false;}for(key in current)if(has.call(current,key))count--;return count===0;};args.equalValues=function(saved,current){var count=0,key,i,j,def,targets;for(key in saved)if(saved.hasOwnProperty(key)){count++;if(!current.hasOwnProperty(key)||saved[key].type!==current[key].type)return false;if(json(saved[key].value)===json(current[key].value))continue;def=null;for(i=0;i<defs.length;i++)if(defs[i].setControlKey===key)def=defs[i];if(!def||def.type!=='time'||!$.cpPrecomp.controlValuesEqual)return false;targets=targetMap[def.id];for(j=0;j<targets.length;j++)if(targets[j].kind!=='precomp'||!$.cpPrecomp.controlValuesEqual(layerById(c,targets[j].layerId),targets[j].localId,saved[key].value,current[key].value))return false;}for(key in current)if(current.hasOwnProperty(key))count--;return count===0;};var listing=$.cpPropertySets.list(args);if(!group.canSave)listing.matchingPreset=null;return listing;}
  if(action==='saveAs'){if(!group.canSave)fail('PROPERTY_GROUP_NOT_UNIFORM',group.reason);return $.cpPropertySets.saveAs(args);}
  if(action==='remove')return $.cpPropertySets.remove(args);
  if(action!=='apply')fail('UNKNOWN_ACTION','지원하지 않는 속성 묶음 작업입니다.');
  var saved=$.cpPropertySets.get(args),changes=[],keys=0;for(var key in saved)if(saved.hasOwnProperty(key))keys++;
  if(keys!==defs.length)fail('PROPERTY_SET_SHAPE_CHANGED','저장된 속성 묶음이 현재 컨트롤과 다릅니다.');
  for(i=0;i<defs.length;i++){
   var def=defs[i],stored=saved[def.setControlKey];if(!stored||stored.type!==def.type)fail('PROPERTY_SET_SHAPE_CHANGED','저장된 속성 형식이 현재 컨트롤과 다릅니다.');
   var value=stored.value;if(typeof value==='number'&&(!isFinite(value)||(typeof def.min==='number'&&value<def.min)||(typeof def.max==='number'&&value>def.max)))fail('CONTROL_RANGE','저장된 값이 현재 허용 범위를 벗어났습니다.');
   if(array(value))for(j=0;j<value.length;j++)if(typeof value[j]!=='number'||!isFinite(value[j]))fail('INVALID_CONTROL','벡터 값은 유한한 숫자여야 합니다.');
   var targets=targetMap[def.id];for(j=0;j<targets.length;j++)if(layerById(c,targets[j].layerId).locked)fail('LAYER_LOCKED','잠긴 레이어는 변경할 수 없습니다.');for(j=0;j<targets.length;j++){var target=targets[j],layer=layerById(c,target.layerId);if(layer.locked)fail('LAYER_LOCKED','잠긴 레이어는 변경할 수 없습니다.');if(def.enabled===false)fail(def.readOnlyCode||'CONTROL_READ_ONLY',def.readOnlyReason||'편집할 수 없는 속성입니다.');if(target.kind==='texture')$.cpTexture.preflightControl(layer,target.localId,value);if(target.kind==='precomp'&&$.cpPrecomp.preflightControl)$.cpPrecomp.preflightControl(layer,target.localId,value);var snapshot=target.kind==='precomp'&&$.cpPrecomp.snapshotControl?$.cpPrecomp.snapshotControl(layer,target.localId):null;changes.push({target:target,before:readTarget(c,target),after:clone(value),snapshot:snapshot});}
  }
  var controlSets={},plans=[],setKey,change,entries,plan;for(i=0;i<changes.length;i++){change=changes[i];if(change.target.kind!=='precomp'||!$.cpPrecomp.preflightControlSet)continue;setKey=String(change.target.layerId);if(!controlSets[setKey])controlSets[setKey]=[];controlSets[setKey].push({id:change.target.localId,value:change.after});}for(setKey in controlSets)if(controlSets.hasOwnProperty(setKey)){plan=$.cpPrecomp.preflightControlSet(layerById(c,Number(setKey)),controlSets[setKey]);if(plan){plans.push({layerId:Number(setKey),plan:plan});for(i=0;i<changes.length;i++)if(changes[i].target.layerId===Number(setKey)&&changes[i].target.localId===plan.bodyDurationId)changes[i].skip=true;}}
  return undo('Property set',function(){var written=0;try{for(;written<changes.length;written++)if(!changes[written].skip)writeTarget(c,changes[written].target,changes[written].after);for(var pi=0;pi<plans.length;pi++)$.cpPrecomp.verifyControlSet(layerById(c,plans[pi].layerId),plans[pi].plan);}catch(error){for(var r=Math.min(written,changes.length-1);r>=0;r--)if(!changes[r].skip)try{if(changes[r].snapshot&&$.cpPrecomp.restoreControl)$.cpPrecomp.restoreControl(layerById(c,changes[r].target.layerId),changes[r].target.localId,changes[r].snapshot);else writeTarget(c,changes[r].target,changes[r].before);}catch(rollback){error.rollbackError=String(rollback.message||rollback);}throw error;}return{appliedControls:changes.length,presetId:options.presetId};});
 }
 function capturedRevision(options){if(options.expectedRevision!==undefined&&(typeof options.expectedRevision!=='number'||!isFinite(options.expectedRevision)||options.expectedRevision!==projectRevision()))fail('STALE_PROJECT','프로젝트가 변경되었습니다. 다시 선택하여 진행하세요.');}
 function saveLibraryPreset(options){var c=comp();guard(options.context,c);capturedRevision(options);var ls=selected(c);if(ls.length!==1)fail('ONE_LAYER_REQUIRED','저장할 레이어 하나를 선택하세요.');var layer=ls[0],data;if(options.selectedOnly===true){if(!$.cpUserPreset)fail('CAPTURE_UNAVAILABLE','선택한 속성을 저장할 수 없습니다.');data=$.cpUserPreset.capture(layer,{selectedOnly:true,includeSourceText:options.includeSourceText===true});}else if($.cpGlyph.instances(layer).length)data=$.cpGlyph.serialize(layer);else if($.cpTexture.instances(layer).length)data=$.cpTexture.serialize(layer);else if($.cpPrecomp.instances(layer).length)data=$.cpPrecomp.serialize(layer);else if($.cpOverlay.instances(layer).length)data=$.cpOverlay.serialize(layer);else if($.cpUserPreset)data=$.cpUserPreset.capture(layer,{selectedOnly:options.selectedOnly===true,includeSourceText:options.includeSourceText===true});else fail('CAPTURE_UNAVAILABLE','이 레이어의 프리셋 저장 기능을 사용할 수 없습니다.');return $.cpWorkspace.savePreset(options,data);}
 function describeLibraryPreset(options){var data=$.cpWorkspace.readPreset(options.id,options.sourceStamp),contains=false,nodes=0;
  if(!data||typeof data.kind!=='string'||!/^(user-property-preset|precomp|overlay|texture|animated-font)$/.test(data.kind)||(data.kind==='user-property-preset'?(data.schemaVersion!==1&&data.schemaVersion!==2):data.schemaVersion!==(data.kind==='overlay'?2:1)))fail('INVALID_PRESET_DATA','지원하지 않는 사용자 프리셋 형식입니다.');
  if(data.kind==='user-property-preset'){if(!$.cpUserPreset||typeof $.cpUserPreset.validate!=='function')fail('CAPTURE_UNAVAILABLE','User preset validation is unavailable.');$.cpUserPreset.validate(data);if(!array(data.properties)||typeof data.captureTime!=='number'||!isFinite(data.captureTime))fail('INVALID_USER_PRESET','저장한 속성 프리셋 형식이 잘못되었습니다.');var visit=function(n,depth){if(!n||typeof n!=='object'||++nodes>10000||depth>32)fail('INVALID_USER_PRESET','속성 프리셋 구조가 잘못되었습니다.');if(n.kind==='property'){if(n.valueType==='TEXT_DOCUMENT'||n.matchName==='ADBE Text Document')contains=true;}else if(n.kind==='group'&&array(n.children)){for(var i=0;i<n.children.length;i++)visit(n.children[i],depth+1);}else fail('INVALID_USER_PRESET','속성 프리셋 구조가 잘못되었습니다.');};for(var i=0;i<data.properties.length;i++)visit(data.properties[i],0);}
  return{kind:data.kind,containsSourceText:contains};
 }
 function validImportedProject(record,stamp,token){
  if(!record||record.projectToken!==token||json(record.sourceStamp)!==json(stamp)||!record.importId||!array(record.compositions)||!record.compositions.length||!validProjectObject(record.importedFolder))return false;
  for(var i=0;i<record.compositions.length;i++)if(!validProjectObject(record.compositions[i]))return false;
  return true;
 }
 function compositionChoices(record){var choices=[];for(var i=0;i<record.compositions.length;i++)choices.push({id:record.compositions[i].id,name:record.compositions[i].name,duration:record.compositions[i].duration});return{requiresComposition:true,compositions:choices,importId:record.importId};}
 function libraryItem(options,replace){
  var c=comp();guard(options.context,c);capturedRevision(options);var item=$.cpWorkspace.find(options.id,options.sourceStamp),ls=selected(c),opts=options.options||{},i;
  if(opts.insertAsTexture){
   if(!(/^(image|video|image-sequence)$/.test(item.kind)))fail('TEXTURE_SOURCE_REQUIRED','이미지·영상·이미지 시퀀스만 텍스처로 사용할 수 있습니다.');
   var replacing=replace||opts.replaceSelected===true;if(ls.length!==1)fail('TEXTURE_TARGET_REQUIRED','텍스처 대상 레이어 하나를 선택하세요.');
   if(replacing){if(!$.cpTexture.instances(ls[0]).length)fail('TEXTURE_REQUIRED','교체할 텍스처 레이어를 선택하세요.');$.cpTexture.preflightReplace(ls[0],opts);}else $.cpTexture.preflightTarget(ls[0]);
   var ref=clone(item);ref.options={};if(opts.conformFrameRate!==undefined)ref.options.conformFrameRate=opts.conformFrameRate;if(opts.forceAlphabetical!==undefined)ref.options.forceAlphabetical=opts.forceAlphabetical;
   return undo(replacing?'Replace texture':'Apply texture',function(){var imported=$.cpWorkspace.importMedia(item,ref.options),args={name:item.name,sourceRef:ref,keepOtherProperties:opts.keepOtherProperties===true};return textureReceipt(replacing?$.cpTexture.replace(ls[0],imported.item,args):$.cpTexture.apply(ls[0],imported.item,args));});
  }
  if(replace)for(i=0;i<ls.length;i++)if($.cpGlyph.instances(ls[i]).length)fail('GLYPH_REPLACE_UNAVAILABLE','Animated-font instances cannot be replaced as generic media.');
  if(replace)for(i=0;i<ls.length;i++)if($.cpTexture.instances(ls[i]).length)fail('TEXTURE_REPLACE_REQUIRED','텍스처 교체 버튼을 사용하세요.');
  if(item.kind==='preset'){var data=$.cpWorkspace.readPreset(item.id,item.sourceStamp),pasteOptions=opts;if(data.kind==='animated-font'){if(replace)fail('GLYPH_REPLACE_UNAVAILABLE','Animated fonts must be added as new instances.');glyphGuard(options,c);pasteOptions=options;}if(data.kind==='user-property-preset'){if(!$.cpUserPreset||typeof $.cpUserPreset.validate!=='function')fail('CAPTURE_UNAVAILABLE','User preset validation is unavailable.');$.cpUserPreset.validate(data);if(!ls.length)fail('NO_SELECTED_LAYERS','Select a target layer.');for(i=0;i<ls.length;i++)$.cpUserPreset.preflight(ls[i],data,{time:c.time,replaceText:opts.replaceText===true,overwrite:opts.overwrite===true});}return undo('User preset',function(){return pasteData(c,data,ls,pasteOptions);},data.kind==='animated-font');}
  if(item.kind==='animation-preset'){
   if(!ls.length)fail('NO_SELECTED_LAYERS','FFX 프리셋을 적용할 레이어를 선택하세요.');
   $.cpWorkspace.find(item.id,item.sourceStamp);
   return undo('User animation preset',function(){try{for(i=1;i<=c.numLayers;i++)c.layer(i).selected=false;for(i=0;i<ls.length;i++){$.cpWorkspace.find(item.id,item.sourceStamp);ls[i].selected=true;ls[i].applyPreset(new File(item.path));ls[i].selected=false;}}finally{for(i=0;i<ls.length;i++)ls[i].selected=true;}return{appliedLayers:ls.length};});
  }
  if(replace&&!ls.length)fail('NO_SELECTED_LAYERS','교체할 미디어 레이어를 선택하세요.');
  if(replace&&item.kind==='audio'){var soundOptions=soundApplyOptions(ls);if(!soundOptions.replaceable)fail(soundOptions.errorCode,'잠기지 않은 오디오 전용 파일 레이어만 선택한 뒤 교체하세요.');}
  if(replace)for(i=0;i<ls.length;i++)if(!ls[i].replaceSource||ls[i].locked)fail('MEDIA_REPLACE_UNAVAILABLE','선택한 레이어의 미디어를 교체할 수 없습니다.');
  var projectImport=null,projectSource=null,stamp=null,token=null,choosing=opts.compositionId!==undefined||opts.importId!==undefined;
  if(item.kind==='project'){
   stamp=$.cpWorkspace.sourceStamp(item);token=context(c).projectToken;projectImport=session.imports[item.id];
   var usable=validImportedProject(projectImport,stamp,token);
   if(choosing){
    if(!usable||typeof opts.importId!=='string'||opts.importId!==projectImport.importId)fail('COMPOSITION_SELECTION_CHANGED','가져온 컴포지션 또는 원본이 변경되었습니다. 항목을 다시 선택하세요.');
    for(i=0;i<projectImport.compositions.length;i++)if(String(projectImport.compositions[i].id)===String(opts.compositionId))projectSource=projectImport.compositions[i];
    if(!projectSource)fail('COMPOSITION_SELECTION_CHANGED','선택 목록에 없는 컴포지션입니다. 항목을 다시 선택하세요.');
   }else if(usable){
    if(opts.compositionName)for(i=0;i<projectImport.compositions.length;i++)if(projectImport.compositions[i].name===opts.compositionName){projectSource=projectImport.compositions[i];break;}
    if(!projectSource){if(projectImport.compositions.length>1)return compositionChoices(projectImport);projectSource=projectImport.compositions[0];}
   }
  }else if(choosing)fail('COMPOSITION_SELECTION_CHANGED','프로젝트 항목을 다시 선택하세요.');
  // AE's AEP import manages native history itself. Keep it outside the layer
  // Undo group: wrapping it corrupts a later placement Undo in AE 26.
  if(item.kind==='project'&&!projectSource){
   var projectResult=$.cpWorkspace.importMedia(item,opts);projectSource=projectResult.item;
   session.importSerial=(session.importSerial||0)+1;
   projectImport={projectToken:token,sourceStamp:stamp,importId:'aep-'+new Date().getTime()+'-'+session.importSerial,importedFolder:projectResult.importedFolder,compositions:projectResult.compositions};
   if(!validImportedProject(projectImport,$.cpWorkspace.sourceStamp(item),context(c).projectToken))fail('COMPOSITION_SELECTION_CHANGED','가져온 컴포지션 또는 원본이 변경되었습니다. 항목을 다시 선택하세요.');
   session.imports[item.id]=projectImport;if(!projectSource)return compositionChoices(projectImport);
  }
  return undo('Import media',function(){
   var source=projectSource||$.cpWorkspace.importMedia(item,opts).item;
   if(replace){for(i=0;i<ls.length;i++)$.cpPrecomp.replaceLayerSource(ls[i],source);return{replacedLayers:ls.length};}
   var added=c.layers.add(source);added.startTime=c.time;for(i=1;i<=c.numLayers;i++)c.layer(i).selected=false;added.selected=true;return{addedLayerId:added.id};
  });
 }
 function fonts(){var result=[],seen={},all=app.fonts&&app.fonts.allFonts;if(!all)return{fonts:[],available:false};for(var i=0;i<all.length;i++)for(var j=0;j<all[i].length;j++){var f=all[i][j],id=f.postScriptName;if(!seen[id]){seen[id]=true;result.push({id:id,postScriptName:id,family:f.familyName,style:f.styleName,name:f.fullName});}}return{fonts:result,available:true};}
 function mediaAction(options){
  var c=capturedComp(options.context),rootLayer=layerById(c,options.rootLayerId),ls=selected(c),selectedRoot=false,i;
  for(i=0;i<ls.length;i++)if(ls[i]===rootLayer)selectedRoot=true;
  if(!selectedRoot||!$.cpPrecomp.instances(rootLayer).length)fail('MEDIA_ROOT_CHANGED','선택한 프리셋 레이어를 다시 확인하세요.');
  if(options.action==='revealSource')return $.cpPrecomp.revealSource(rootLayer);
  var state=$.cpPrecomp.mediaContext(rootLayer,{layerId:options.layerId}),binding=null;
  for(i=0;i<state.media.length;i++)if(String(state.media[i].layerId)===String(options.layerId))binding=state.media[i];
  if(options.action==='context')return{instanceId:state.instanceId,rootLayerId:state.rootLayerId,rootLayerName:rootLayer.name,sourceItemId:state.sourceItemId,media:state.media,projectSelection:state.projectSelection.items,canReplace:state.canReplace,errorCode:state.errorCode,reason:state.message||null,bindingContext:state.context,outerContext:clone(options.context),selectedBinding:binding,replacement:state.replacement||null};
  if(options.action!=='replaceSelected')fail('UNKNOWN_ACTION','지원하지 않는 미디어 작업입니다.');
  var expected=options.bindingContext;
  if(!expected||expected.expectedRootLayerId===undefined||expected.expectedSourceItemId===undefined||expected.expectedMediaItemId===undefined||expected.expectedItemId===undefined)fail('MEDIA_CONTEXT_REQUIRED','교체할 미디어를 다시 확인하세요.');
  if(!state.canReplace)fail(state.errorCode||'MEDIA_REPLACEMENT_UNAVAILABLE',state.message||'Project 패널에서 호환되는 미디어 하나를 선택하세요.');
  if(json(expected)!==json(state.context))fail('MEDIA_CONTEXT_CHANGED','프리셋 소스 또는 Project 선택이 바뀌었습니다. 새로고침 후 다시 확인하세요.');
  var opts=clone(expected);opts.undoGroup=false;
  if(state.replacement&&state.replacement.noop)return{replaced:false,itemId:state.replacement.itemId,rootLayerId:rootLayer.id};
  return undo('Replace media',function(){return $.cpPrecomp.replaceSelectedMedia(rootLayer,options.layerId,opts);});
 }
 function pickerCapabilities(){return $.cpColors&&$.cpColors.pickerCapabilities?$.cpColors.pickerCapabilities():{available:false};}
 function requireColorRevision(options,code){if(typeof options.expectedRevision!=='number'||options.expectedRevision!==projectRevision())fail(code||'COLOR_CONTEXT_CHANGED','색상 속성이 변경되었습니다. 현재 설정을 다시 확인하세요.');}
 // AE can return unequal wrappers for the same Property. A matching path is
 // therefore insufficient proof after an unaccounted project revision.
 // External edits and native Undo require explicit slot redefinition. Only
 // known successful color/palette writes may advance an already-valid scope.
 function checkPaletteRevisions(){var revision=projectRevision();for(var i=0;i<session.paletteScopes.length;i++){var scope=session.paletteScopes[i];if(scope.invalidated||typeof scope.revision!=='number'||revision===null||scope.revision!==revision)scope.invalidated=true;}}
 function capturePaletteWrite(signature){checkPaletteRevisions();var snapshot={revision:projectRevision(),signature:signature,scopes:[]};for(var i=0;i<session.paletteScopes.length;i++){var scope=session.paletteScopes[i];if(!scope.invalidated&&scope.context===signature&&scope.revision===snapshot.revision)snapshot.scopes.push(scope);}return snapshot;}
 function advancePaletteWrite(snapshot,c){var revision=projectRevision(),sameContext=json(context(c))===snapshot.signature;for(var i=0;i<snapshot.scopes.length;i++){var scope=snapshot.scopes[i];if(scope.invalidated||scope.revision!==snapshot.revision)continue;if(!sameContext||revision===null)scope.invalidated=true;else scope.revision=revision;}}
 function paletteRows(scope){if(scope.invalidated)fail('PALETTE_SCOPE_STALE','프로젝트가 외부에서 변경되었습니다. 팔레트 슬롯을 다시 지정하세요.');var rows=[],i,r;for(i=0;i<scope.slots.length;i++){r=Object.prototype.hasOwnProperty.call(paletteTargets,scope.slots[i].controlId)?paletteTargets[scope.slots[i].controlId]:null;if(!r)fail('PALETTE_SLOT_CHANGED','팔레트 슬롯이 변경되었습니다. 슬롯을 다시 지정하세요.');if(r.enabled===false||r.canSet===false)fail(r.readOnlyReason||'CONTROL_READ_ONLY','팔레트에 읽기 전용 슬롯이 있습니다.');rows.push(r);}return rows;}
 function paletteCurrent(rows){var values=[],c=comp();for(var i=0;i<rows.length;i++)values.push(readTarget(c,rows[i].target));return values;}
 function paletteCatalog(scope,values){
  var saved=$.cpPalette.list({key:scope.key}),predefined=[{id:'baseline',name:'슬롯 지정 시 색상',colors:clone(scope.defaults)}],all=predefined.concat(saved.palettes),current=$.cpPalette.match({colors:clone(values),palettes:all});
  // Match exact values in the same JSON numeric representation as persistent
  // storage. Native full precision remains untouched for property preflight.
  return{predefined:predefined,user:saved.palettes,all:all,current:current||''};
 }
 function paletteCandidateName(row){var parts=[layerById(comp(),row.target.layerId).name],i;if(array(row.path)){for(i=0;i<row.path.length;i++)parts.push(String(row.path[i].name||row.path[i].matchName));if(row.field&&row.field!=='property')parts.push(row.field);}else parts=parts.concat(row.groupPath||[],[row.name]);return parts.join(' / ');}
 function paletteState(raw,ctx){
  checkPaletteRevisions();
  var candidates=[],out=[],i,j,row,scope,rows,values,catalog,enabled,reason;paletteTargets={};
  for(i=0;i<raw.length;i++){row=raw[i];if(row.target&&row.target.kind==='animated-font')continue;if(String(row.type).toLowerCase()!=='color'||!array(row.value))continue;try{$.cpPalette.normalizeColor(row.value);}catch(hdr){continue;}paletteTargets[row.id]=clone(row);candidates.push({id:row.id,name:paletteCandidateName(row),layerId:row.target.layerId,value:clone(row.value),enabled:row.enabled!==false&&row.canSet!==false,reason:row.readOnlyReason||null});}
  for(i=0;i<session.paletteScopes.length;i++){
   scope=session.paletteScopes[i];if(scope.context!==json(ctx))continue;enabled=true;reason=null;
   try{rows=paletteRows(scope);values=paletteCurrent(rows);catalog=paletteCatalog(scope,values);}catch(error){enabled=false;reason=String(error.message||error);catalog={predefined:[],user:[],current:''};}
   var slots=[];for(j=0;j<scope.slots.length;j++)slots.push({slotKey:scope.slots[j].slotKey,controlId:scope.slots[j].controlId});
   out.push({id:scope.id,type:'palette',valueType:'Palette',semantic:'explicit-palette',name:scope.name,value:catalog.current,mixed:false,enabled:enabled,readOnlyReason:reason,bindingRevision:scope.revision,requiresRedefinition:!!scope.invalidated,resetSupported:enabled,resetLabel:'슬롯 지정 시 색상으로 초기화',slots:slots,groupPath:['Layer Selection','Palettes'],def:{availablePalettes:{predefined:catalog.predefined,user:catalog.user}},actions:[]});
  }return{candidates:candidates,controls:out};
 }
 function paletteAction(options){
  if(!options.context)fail('CONTEXT_REQUIRED','팔레트 대상 선택을 다시 확인하세요.');var c=comp();guard(options.context,c);requireColorRevision(options,'PALETTE_CONTEXT_CHANGED');getState();
  var action=options.action,i,scope=null,row,rows,values,catalog,id,entry,changes,colorChanges=[],before=[],written=0;
  if(action==='define'){
   if(!array(options.slots)||!options.slots.length||options.slots.length>64)fail('PALETTE_INVALID_MAPPING','1–64개의 색상 슬롯을 지정하세요.');
   var slots=[],seen={},defaults=[];
   for(i=0;i<options.slots.length;i++){
    var slot=options.slots[i];if(!slot||typeof slot.slotKey!=='string'||!/^[a-z][a-z0-9_-]{0,63}$/i.test(slot.slotKey)||seen['key:'+slot.slotKey]||seen['id:'+slot.controlId])fail('PALETTE_INVALID_MAPPING','슬롯 이름과 색상 대상은 중복될 수 없습니다.');
    row=Object.prototype.hasOwnProperty.call(paletteTargets,slot.controlId)?paletteTargets[slot.controlId]:null;if(!row||row.enabled===false||row.canSet===false)fail('PALETTE_SLOT_CHANGED','편집 가능한 색상 슬롯을 다시 선택하세요.');
    seen['key:'+slot.slotKey]=true;seen['id:'+slot.controlId]=true;slots.push({slotKey:slot.slotKey,controlId:slot.controlId});defaults.push(readTarget(c,row.target));
   }
   var name=options.name===undefined?'선택 색상조합':options.name;if(typeof name!=='string'||!name.replace(/^\s+|\s+$/g,'')||name.length>128)fail('PALETTE_INVALID_NAME','색상조합 이름을 입력하세요.');
   scope={id:'palette:'+(++session.paletteSerial),name:name,context:json(context(c)),key:'explicit-slots:',slots:slots,defaults:defaults,revision:projectRevision(),invalidated:false};
   for(i=0;i<slots.length;i++)scope.key+=(i?'|':'')+slots[i].slotKey;
   if(scope.key.length>512)fail('PALETTE_INVALID_MAPPING','슬롯 이름의 합이 너무 깁니다.');
   session.paletteScopes.push(scope);if(session.paletteScopes.length>32)session.paletteScopes.shift();return{id:scope.id,slots:clone(slots)};
  }
  for(i=0;i<session.paletteScopes.length;i++)if(session.paletteScopes[i].id===options.id&&session.paletteScopes[i].context===json(context(c)))scope=session.paletteScopes[i];
  if(!scope)fail('PALETTE_SCOPE_CHANGED','팔레트 슬롯을 다시 지정하세요.');
  if(action==='undefine'){for(i=session.paletteScopes.length-1;i>=0;i--)if(session.paletteScopes[i]===scope)session.paletteScopes.splice(i,1);return{removedScope:true};}
  rows=paletteRows(scope);values=paletteCurrent(rows);catalog=paletteCatalog(scope,values);
  if(action==='saveAs'){var saved=$.cpPalette.saveAs({key:scope.key,name:options.name,colors:clone(values)});return saved;}
  if(action==='remove'){if(options.paletteId==='baseline')fail('PALETTE_READ_ONLY','기본 색상조합은 삭제할 수 없습니다.');return $.cpPalette.remove({key:scope.key,id:options.paletteId});}
  if(action==='previous'||action==='next')id=$.cpPalette.step({currentId:catalog.current,palettes:catalog.all,direction:action==='previous'?-1:1});else if(action==='reset')id='baseline';else if(action==='apply')id=options.value;else fail('UNKNOWN_ACTION','지원하지 않는 팔레트 작업입니다.');
  for(i=0;i<catalog.all.length;i++)if(catalog.all[i].id===id)entry=catalog.all[i];if(!entry)fail('PALETTE_NOT_FOUND','색상조합을 찾을 수 없습니다.');
  var targets=[];for(i=0;i<rows.length;i++)targets.push({id:rows[i].id,colorIndex:i,value:values[i]});changes=$.cpPalette.map({colors:entry.colors,targets:targets,alpha:'palette'});
  for(i=0;i<rows.length;i++){var t=rows[i].target;if(layerById(c,t.layerId).locked)fail('LAYER_LOCKED','잠긴 슬롯은 변경할 수 없습니다.');if(t.kind==='color')colorChanges.push({id:t.localId,value:changes[i].value,expectedValue:values[i]});before.push(values[i]);}
  if(colorChanges.length)$.cpColors.preflight(selected(c),colorChanges,{time:c.time});
  var changed=false;for(i=0;i<changes.length;i++)if(json(changes[i].value)!==json(before[i]))changed=true;if(!changed){return{changedControls:0};}
  var paletteWrite=capturePaletteWrite(json(context(c))),result=undo('Palette',function(){try{for(written=0;written<rows.length;written++)writeTarget(c,rows[written].target,changes[written].value);}catch(error){for(var r=Math.min(written,rows.length-1);r>=0;r--)try{writeTarget(c,rows[r].target,before[r]);}catch(rollback){error.rollbackError=String(rollback.message||rollback);}throw error;}return{changedControls:rows.length};});
  advancePaletteWrite(paletteWrite,c);
  return result;
 }
 function pickColor(options){if(!options.context)fail('CONTEXT_REQUIRED','색상 대상 선택을 다시 확인하세요.');var found=controlTargets(options);requireColorRevision(options);if(String(found.definition.type).toLowerCase()!=='color'||found.definition.enabled===false)fail('COLOR_PICKER_TARGET','편집 가능한 색상 속성을 선택하세요.');var current=found.definition.mixed?null:readTarget(found.comp,found.targets[0]),value=$.cpColors.pickColor(current);return{cancelled:value===null,value:value,kind:'extendscript-rgb24'};}
 function call(method,options){
  if(method==='undo'||method==='redo')return historyCommand(method,options);
  if(method==='paletteAction')return paletteAction(options);if(method==='pickColor')return pickColor(options);
  if(method==='thumbnailAction'){if(options.action==='cleanup')return $.cpThumbnails.cleanup(options);var thumbnailComp=capturedComp(options.context);if(typeof options.expectedRevision!=='number'||options.expectedRevision!==projectRevision())fail('STALE_PROJECT','프로젝트가 변경되었습니다. 다시 시도하세요.');if(options.action==='describe')return $.cpThumbnails.describe(thumbnailComp);if(options.action==='frame')return $.cpThumbnails.frame(thumbnailComp,options);fail('UNKNOWN_ACTION','지원하지 않는 썸네일 작업입니다.');}
  if(method==='resolveThumbnailSource'){if(typeof options.id!=='string'||!options.sourceStamp)fail('SOURCE_IDENTITY_REQUIRED','선택한 원본의 식별 정보가 필요합니다.');var thumbnailSource=$.cpWorkspace.find(options.id,options.sourceStamp);if(thumbnailSource.kind!=='project'||!(/\.aep$/i).test(thumbnailSource.path)||thumbnailSource.missing||thumbnailSource.ambiguous)fail('REGISTERED_AEP_REQUIRED','현재 등록된 After Effects 프로젝트를 선택하세요.');return{schemaVersion:1,id:thumbnailSource.id,kind:thumbnailSource.kind,path:thumbnailSource.path,sourceStamp:thumbnailSource.sourceStamp,missing:false,ambiguous:false};}
  if(method==='mediaAction')return mediaAction(options);
  if(method==='hostStatus')return status();if(method==='getState')return getState();if(method==='applyPreset')return apply(options);if(method==='addAnimatedFont')return addAnimatedFont(options);if(method==='setControl')return setControl(options);
  if(method==='removePreset'){var state=getState();for(var i=0;i<state.applied.length;i++)if(state.applied[i].id===options.id)return presetAction({action:'remove',instanceId:state.applied[i].instanceId,context:options.context,expectedRevision:options.expectedRevision});fail('PRESET_NOT_FOUND','적용된 프리셋을 찾을 수 없습니다.');}
  if(method==='presetAction')return presetAction(options);if(method==='propertyAction')return propertyAction(options);if(method==='propertySetAction')return propertySetAction(options);
  if(method==='getSettings')return $.cpWorkspace.getSettings();if(method==='setSettings')return $.cpWorkspace.setSettings(options);
  if(method==='getLibrary')return $.cpWorkspace.getLibrary();if(method==='libraryPreviewDestination')return $.cpWorkspace.libraryPreviewDestination(options);if(method==='addLibraryFolder')return $.cpWorkspace.addFolder(options);if(method==='removeLibraryFolder')return $.cpWorkspace.removeFolder(options);if(method==='prepareAudioImport'){guard(options.context,comp());return $.cpWorkspace.prepareAudioImport(options);}
  if(method==='describeLibraryPreset')return describeLibraryPreset(options);if(method==='saveLibraryPreset')return saveLibraryPreset(options);if(method==='removeLibraryItem')return $.cpWorkspace.removeItem(options);
  if(method==='importLibraryItem'||method==='replaceLibraryItem')return libraryItem(options,method==='replaceLibraryItem');
  if(method==='enumerateFonts')return fonts();if(method==='endUndoGroup'){if(options.undoGroupId)delete session.gestures[options.undoGroupId];return{ended:true};}
  if(method==='toolAction'){var c=comp();guard(options.context,c);return undo('Tools',function(){return $.cpTools.action(c,options.tool,options.action,options.params||{});});}
  fail('UNKNOWN_METHOD','지원하지 않는 명령: '+method);
 }
 $.contentriumPreset={root:root,json:json,parse:parse,call:function(method,payload){try{return json({ok:true,result:call(method,parse(payload||'{}'))});}catch(error){return json({ok:false,error:errorEnvelope(error)});}}};
 }());}catch(startupError){
  // CEP loads ScriptPath before its UI can display errors. Keep failures readable
  // through the panel API instead of letting AE raise an unhandled script dialog.
  function startupQuote(value){return '"'+String(value).replace(/[\\"\x00-\x1f]/g,function(c){return '\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4);})+'"';}
  var startupReply='{"ok":false,"error":{"code":'+startupQuote(startupError.code||'INITIALIZATION_FAILED')+',"message":'+startupQuote('Contentrium Preset을 시작하지 못했습니다: '+String(startupError.message||startupError))+',"file":'+startupQuote(startupError.fileName||'')+',"line":'+String(Number(startupError.line)||0)+'}}';
  $.contentriumPreset={initializationFailed:true,call:function(){return startupReply;}};
 }
}());

