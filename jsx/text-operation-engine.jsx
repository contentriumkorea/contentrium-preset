/* Independent 2D text adapter over the verified ordinary operation engine.
   Private validation build; no original loader or native source schema. */
(function(){
 function fail(code,message){var e=new Error(message);e.code=code;throw e;}
 function array(v){return Object.prototype.toString.call(v)==='[object Array]';}
 function own(o,k){return Object.prototype.hasOwnProperty.call(o,k);}
 function clone(v){var a,i,k;if(array(v)){a=[];for(i=0;i<v.length;i++)a.push(clone(v[i]));return a;}if(v&&typeof v==='object'){a={};for(k in v)if(own(v,k))a[k]=clone(v[k]);return a;}return v;}
 function at(p,mn){var result=p.property(mn);if(!result)fail('TEXT_PROPERTY_MISSING','Missing '+mn);return result;}
 function rowAt(p,row){if(row.path){for(var i=0;i<row.path.length;i++)p=at(p,row.path[i]);return p;}return at(p,row.matchName);}
 var rangeDirect={'ADBE Text Percent Start':1,'ADBE Text Percent End':1,'ADBE Text Percent Offset':1,'ADBE Text Index Start':1,'ADBE Text Index End':1,'ADBE Text Index Offset':1},rangeAdvanced={'ADBE Text Range Type2':1,'ADBE Text Selector Mode':1,'ADBE Text Selector Max Amount':1,'ADBE Text Range Shape':1,'ADBE Text Selector Smoothness':1,'ADBE Text Levels Max Ease':1,'ADBE Text Levels Min Ease':1,'ADBE Text Randomize Order':1,'ADBE Text Random Seed':1};
 function selectorRow(row,range){
  if(!range){if(own(row,'path'))fail('INVALID_TEXT_OPERATION','Expression selector paths unsupported');propertyRow(row);return;}
  if(!row||own(row,'matchName')||!array(row.path)||!((row.path.length===1&&own(rangeDirect,row.path[0]))||(row.path.length===2&&row.path[0]==='ADBE Text Range Advanced'&&own(rangeAdvanced,row.path[1]))))fail('INVALID_TEXT_OPERATION','Exact range selector path required');
  var leaf=clone(row);leaf.matchName=row.path[row.path.length-1];propertyRow(leaf);if(own(row,'initialValue')&&typeof row.initialValue!=='number')fail('INVALID_TEXT_OPERATION','Range selector scalar required');
 }
 function validateSelector(s){
  var range=s&&s.matchName==='ADBE Text Selector',i,key,seen={},family=null,randomize=false;
  if(!s||(!range&&s.matchName!=='ADBE Text Expressible Selector')||typeof s.name!=='string'||!array(s.properties))fail('INVALID_TEXT_OPERATION','Supported selector required');
  if(range){if(s.expectedInitialUnits!==1||!array(s.setupFirst)||s.setupFirst.length>1)fail('INVALID_TEXT_OPERATION','Measured range initialization required');if(s.setupFirst.length){var u=s.setupFirst[0];if(!array(u.path)||u.path.length!==2||u.path[0]!=='ADBE Text Range Advanced'||u.path[1]!=='ADBE Text Range Units'||(u.initialValue!==1&&u.initialValue!==2)||own(u,'expression')||own(u,'expressionTemplate'))fail('INVALID_TEXT_OPERATION','Static authored Units required');}}
  else if(own(s,'setupFirst')||own(s,'expectedInitialUnits'))fail('INVALID_TEXT_OPERATION','Unexpected range setup');
  for(i=0;i<s.properties.length;i++){var row=s.properties[i];selectorRow(row,range);key=range?row.path.join('/'):row.matchName;if(own(seen,key))fail('INVALID_TEXT_OPERATION','Duplicate selector path');seen[key]=true;if(range){var n=row.path[row.path.length-1];if(n.indexOf('ADBE Text Percent ')===0||n.indexOf('ADBE Text Index ')===0){var f=n.indexOf('ADBE Text Index ')===0?'index':'percent';if(family&&family!==f)fail('INVALID_TEXT_OPERATION','Mixed selector bound families');family=f;}if(n==='ADBE Text Randomize Order')randomize=row.initialValue===1;if(n==='ADBE Text Random Seed'&&!randomize)fail('INVALID_TEXT_OPERATION','Hidden Random Seed requires authored Randomize1');}}
  if(range){var units=s.setupFirst.length?s.setupFirst[0].initialValue:1;if(family==='index'&&units!==2||family==='percent'&&units!==1)fail('INVALID_TEXT_OPERATION','Selector Units/bounds mismatch');}
 }
 function animators(layer){return at(at(layer,'ADBE Text Properties'),'ADBE Text Animators');}
 function grouping(layer){return at(at(at(layer,'ADBE Text Properties'),'ADBE Text More Options'),'ADBE Text Anchor Point Option');}
 function findAnimator(layer,name){var a=animators(layer),found=null;for(var i=1;i<=a.numProperties;i++){var p=a.property(i);if(p.name===name){if(found||p.matchName!=='ADBE Text Animator')fail('TEXT_OWNERSHIP_CHANGED','Animator identity is ambiguous');found=p;}}return found;}
 // Observed AE26.5 intrinsic leaf identities, request d779478b-ae75-4d83-b696-3ef6a90f920d.
 // DOM visibility-only AddProperty(default) edits are not distinguishable from these defaults.
 var intrinsicNames=["ADBE Text Anchor Point 3D","ADBE Text Position 3D","ADBE Text Scale 3D","ADBE Text Skew","ADBE Text Skew Axis","ADBE Text Rotation X","ADBE Text Rotation Y","ADBE Text Rotation","ADBE Text Opacity","ADBE Text Fill Opacity","ADBE Text Stroke Opacity","ADBE Text Fill Color","ADBE Text Stroke Color","ADBE Text Fill Hue","ADBE Text Stroke Hue","ADBE Text Fill Saturation","ADBE Text Stroke Saturation","ADBE Text Fill Brightness","ADBE Text Stroke Brightness","ADBE 3DText Front RGB","ADBE 3DText Front Hue","ADBE 3DText Front Sat","ADBE 3DText Front Bright","ADBE 3DText Front Opacity","ADBE 3DText Front Ambient","ADBE 3DText Front Diffuse","ADBE 3DText Front Specular","ADBE 3DText Front Shininess","ADBE 3DText Front Metal","ADBE 3DText Front Reflection","ADBE 3DText Front Gloss","ADBE 3DText Front Fresnel","ADBE 3DText Front Xparency","ADBE 3DText Front XparRoll","ADBE 3DText Front IOR","ADBE 3DText Bevel RGB","ADBE 3DText Bevel Hue","ADBE 3DText Bevel Sat","ADBE 3DText Bevel Bright","ADBE 3DText Bevel Opacity","ADBE 3DText Bevel Ambient","ADBE 3DText Bevel Diffuse","ADBE 3DText Bevel Specular","ADBE 3DText Bevel Shininess","ADBE 3DText Bevel Metal","ADBE 3DText Bevel Reflection","ADBE 3DText Bevel Gloss","ADBE 3DText Bevel Fresnel","ADBE 3DText Bevel Xparency","ADBE 3DText Bevel XparRoll","ADBE 3DText Bevel IOR","ADBE 3DText Side RGB","ADBE 3DText Side Hue","ADBE 3DText Side Sat","ADBE 3DText Side Bright","ADBE 3DText Side Opacity","ADBE 3DText Side Ambient","ADBE 3DText Side Diffuse","ADBE 3DText Side Specular","ADBE 3DText Side Shininess","ADBE 3DText Side Metal","ADBE 3DText Side Reflection","ADBE 3DText Side Gloss","ADBE 3DText Side Fresnel","ADBE 3DText Side Xparency","ADBE 3DText Side XparRoll","ADBE 3DText Side IOR","ADBE 3DText Back RGB","ADBE 3DText Back Hue","ADBE 3DText Back Sat","ADBE 3DText Back Bright","ADBE 3DText Back Opacity","ADBE 3DText Back Ambient","ADBE 3DText Back Diffuse","ADBE 3DText Back Specular","ADBE 3DText Back Shininess","ADBE 3DText Back Metal","ADBE 3DText Back Reflection","ADBE 3DText Back Gloss","ADBE 3DText Back Fresnel","ADBE 3DText Back Xparency","ADBE 3DText Back XparRoll","ADBE 3DText Back IOR","ADBE 3DText Bevel Depth","ADBE 3DText Extrude Depth","ADBE Text Stroke Width","ADBE Text Line Anchor","ADBE Text Track Type","ADBE Text Tracking Amount","ADBE Text Character Change Type","ADBE Text Character Range","ADBE Text Character Replace","ADBE Text Character Offset","ADBE Text Line Spacing","ADBE Text Blur","ADBE Text VF Axis 1","ADBE Text VF Axis 2","ADBE Text VF Axis 3","ADBE Text VF Axis 4","ADBE Text VF Axis 5","ADBE Text VF Axis 6","ADBE Text VF Axis 7","ADBE Text VF Axis 8"],intrinsics={};
 for(var intrinsicIndex=0;intrinsicIndex<intrinsicNames.length;intrinsicIndex++)intrinsics[intrinsicNames[intrinsicIndex]]=true;
 function verifyAnimatorProperties(a,spec,r){
  var properties=at(a,'ADBE Text Animator Properties'),expected={},seen={},i,p,pr;
  for(i=0;i<spec.properties.length;i++){pr=spec.properties[i];if(own(expected,pr.matchName))fail('TEXT_OWNERSHIP_CHANGED','Duplicate authored animator property');expected[pr.matchName]=pr;}
  for(i=1;i<=properties.numProperties;i++){
   p=properties.property(i);
   if(!p||typeof p.matchName!=='string'||!own(intrinsics,p.matchName)||typeof PropertyType==='undefined'||p.propertyType!==PropertyType.PROPERTY||typeof p.isModified!=='boolean'||typeof p.canSetExpression!=='boolean'||typeof p.numKeys!=='number'||p.numKeys<0||typeof p.expression!=='string'||typeof p.expressionEnabled!=='boolean'||own(seen,p.matchName))fail('TEXT_OWNERSHIP_CHANGED','Unknown animator property shape');
   seen[p.matchName]=true;
   if(own(expected,p.matchName)){
    pr=expected[p.matchName];if(p.numKeys)fail('TEXT_OWNERSHIP_CHANGED','Animator keyframes changed');
    if(pr.expressionTemplate){if(!p.canSetExpression||p.expression!==expand(pr.expressionTemplate,r)||p.expressionEnabled!==true)fail('TEXT_OWNERSHIP_CHANGED','Animator expression changed');}
    else if(p.expression||p.expressionEnabled)fail('TEXT_OWNERSHIP_CHANGED','Unexpected animator expression');
   }else if(p.isModified||p.numKeys||p.expression||p.expressionEnabled)fail('TEXT_OWNERSHIP_CHANGED','Unexpected modified animator property');
  }
  for(i=0;i<spec.properties.length;i++)if(!own(seen,spec.properties[i].matchName))fail('TEXT_OWNERSHIP_CHANGED','Authored animator property missing');
 }
 function propertyRow(row){if(!row||typeof row.matchName!=='string'||!row.matchName||row.matchName.length>256)fail('INVALID_TEXT_OPERATION','Explicit matchName required');if(own(row,'initialValue')){var v=row.initialValue;if(typeof v==='number'){if(!isFinite(v))fail('INVALID_TEXT_OPERATION','Nonfinite initialization');}else{if(!array(v)||!v.length||v.length>4)fail('INVALID_TEXT_OPERATION','Scalar/vector initialization required');for(var i=0;i<v.length;i++)if(typeof v[i]!=='number'||!isFinite(v[i]))fail('INVALID_TEXT_OPERATION','Invalid initialization');}}if(own(row,'expression')||own(row,'expressionTemplate')&&(typeof row.expressionTemplate!=='string'||!row.expressionTemplate.length))fail('INVALID_TEXT_OPERATION','Materialized expression required');}
 function validate(data){
  if(!$.cpOperations)fail('OPERATION_ENGINE_REQUIRED','Independent operation engine required');
  if(!data||data.kind!=='contentrium-operation-preset'||data.schemaVersion!==1||!data.requirements||data.requirements.layerKind!=='text'||data.requirements.layer3D!=='preserve'||data.requirements.perCharacter3D!=='require-disabled'||!array(data.addedTextAnimators)||!data.addedTextAnimators.length||data.addedTextAnimators.length>100)fail('INVALID_TEXT_OPERATION','Unsupported text contract');
  var ids={},i,j,k,a,s;
  if(data.policies.anchorGrouping!==null&&(typeof data.policies.anchorGrouping!=='number'||(data.policies.anchorGrouping!==1&&data.policies.anchorGrouping!==2&&data.policies.anchorGrouping!==3&&data.policies.anchorGrouping!==4)))fail('INVALID_TEXT_OPERATION','Invalid anchor grouping');
  for(i=0;i<data.addedTextAnimators.length;i++){a=data.addedTextAnimators[i];if(!a||typeof a.id!=='string'||!/^(in|out):a[1-9][0-9]*$/.test(a.id)||ids[a.id]||typeof a.name!=='string'||!array(a.selectors)||!array(a.properties))fail('INVALID_TEXT_OPERATION','Unique animator operations required');ids[a.id]=true;for(j=0;j<a.properties.length;j++)propertyRow(a.properties[j]);for(j=0;j<a.selectors.length;j++)validateSelector(a.selectors[j]);}
  var b=clone(data);b.requirements={layerKind:'av'};$.cpOperations.validate(b);return true;
 }
 function quote(v){return '"'+String(v).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';}
 function expand(template,r){var result=template.split(quote('__CP_OWNER__')).join(quote(r.instanceId)),i;for(i=0;i<r.controls.length;i++)result=result.split(quote('__CP_CONTROL_'+r.controls[i].id+'__')).join(quote(r.controls[i].effectName));for(i=0;i<r.groups.length;i++)result=result.split(quote('__CP_GROUP_'+r.groups[i].id+'__')).join(quote(r.groups[i].effectName));if(/__CP_(OWNER|CONTROL_|GROUP_)/.test(result))fail('UNRESOLVED_TEXT_TOKEN','Unbound text expression');return result;}
 function preflight(layer,data,options){
  validate(data);options=options||{};if(typeof TextLayer==='undefined'||!(layer instanceof TextLayer))fail('TEXT_LAYER_REQUIRED','Text layer required');if(layer.threeDPerChar!==false)fail('TEXT_PER_CHARACTER_3D_UNVERIFIED','This adapter requires per-character 3D disabled');
  var id=options.instanceId||('t'+new Date().getTime().toString(36)),b=clone(data),count=animators(layer).numProperties,g=grouping(layer),before=g.valueAtTime(layer.containingComp.time||0,true),wanted=data.policies.anchorGrouping;
  if(g.expression||g.numKeys)fail('TEXT_GROUPING_ANIMATED','Animated grouping requires its own contract');
  if(wanted!==null&&count>0&&before!==wanted&&options.allowOverwriteAPGrouping!==true)fail('TEXT_GROUPING_CONFLICT','Existing text animators use different Anchor Point Grouping');
  b.requirements={layerKind:'av'};b.textApplication={schemaVersion:1,requirements:clone(data.requirements),anchorGroupingBefore:before,anchorGroupingApplied:wanted,originalAnimatorCount:count,animators:[]};
  for(var i=0;i<data.addedTextAnimators.length;i++){var name='CP '+id+' a'+(i+1);if(findAnimator(layer,name))fail('TEXT_ANIMATOR_CONFLICT','Animator identity already exists');b.textApplication.animators.push({id:data.addedTextAnimators[i].id,name:name});}
  var r=$.cpOperations.preflight(layer,b,{instanceId:id});return {baseDocument:b,basePlan:r,instanceId:id};
 }
 function write(p,row,r,layer){if(own(row,'initialValue'))p.setValue(clone(row.initialValue));if(row.expressionTemplate){if(!p.canSetExpression)fail('TEXT_EXPRESSION_UNAVAILABLE','Expression unavailable');p.expression=expand(row.expressionTemplate,r);p.expressionEnabled=true;p.valueAtTime(layer.containingComp.time||0,false);if(p.expressionError||p.expressionEnabled!==true)fail('TEXT_EXPRESSION_FAILED',String(p.expressionError||'Expression disabled'));}}
 function apply(layer,data,options){
  options=options||{};var plan=preflight(layer,data,options),r=plan.basePlan,created=[],baseApplied=false,started=false,i,j,k,error,receipt;
  try{
   if(options.undoGroup!==false){app.beginUndoGroup('Contentrium Preset - Text Operations');started=true;}
   receipt=$.cpOperations.apply(layer,plan.baseDocument,{instanceId:plan.instanceId,undoGroup:false});baseApplied=true;
   if(data.policies.anchorGrouping!==null)grouping(layer).setValue(data.policies.anchorGrouping);
   for(i=0;i<data.addedTextAnimators.length;i++){
    var a=data.addedTextAnimators[i],name=plan.baseDocument.textApplication.animators[i].name,p=animators(layer).addProperty('ADBE Text Animator');
    try{p.name=name;}catch(nameError){try{p.remove();}catch(removeError){nameError.rollbackError=String(removeError.message||removeError);}throw nameError;}created.push(name);
    var selectors=at(findAnimator(layer,name),'ADBE Text Selectors');if(selectors.numProperties!==0)fail('TEXT_DEFAULT_SELECTOR_CHANGED','Unexpected host default selector');
    for(j=0;j<a.selectors.length;j++){
     var s=a.selectors[j];selectors=at(findAnimator(layer,name),'ADBE Text Selectors');p=selectors.addProperty(s.matchName);p.name=s.name;
     if(s.matchName==='ADBE Text Selector'){if(at(at(p,'ADBE Text Range Advanced'),'ADBE Text Range Units').valueAtTime(layer.containingComp.time||0,true)!==s.expectedInitialUnits)fail('TEXT_RANGE_DEFAULT_CHANGED','New range selector Units changed');for(k=0;k<s.setupFirst.length;k++)write(rowAt(p,s.setupFirst[k]),s.setupFirst[k],r,layer);}
     for(k=0;k<s.properties.length;k++){selectors=at(findAnimator(layer,name),'ADBE Text Selectors');p=selectors.property(j+1);if(!p||p.matchName!==s.matchName||p.name!==s.name)fail('TEXT_OWNERSHIP_CHANGED','Selector identity changed');write(rowAt(p,s.properties[k]),s.properties[k],r,layer);}
    }
    for(j=0;j<a.properties.length;j++){var properties=at(findAnimator(layer,name),'ADBE Text Animator Properties');p=properties.addProperty(a.properties[j].matchName);write(p,a.properties[j],r,layer);}
   }
  }catch(e){error=e;for(i=created.length-1;i>=0;i--)try{var owned=findAnimator(layer,created[i]);if(owned)owned.remove();}catch(cleanup){error.rollbackError=String(cleanup.message||cleanup);}if(baseApplied)try{$.cpOperations.remove(layer,plan.instanceId,{undoGroup:false});}catch(cleanupBase){error.rollbackError=String(cleanupBase.message||cleanupBase);}try{grouping(layer).setValue(plan.baseDocument.textApplication.anchorGroupingBefore);layer.motionBlur=r.motionBlurBefore;if(r.videoEnabledBefore!==null)layer.enabled=r.videoEnabledBefore;}catch(restore){error.rollbackError=String(restore.message||restore);}throw error;
  }finally{if(started)app.endUndoGroup();}
  receipt.kind='text-operations';receipt.addedTextAnimators=created.length;return receipt;
 }
 function instance(layer,id){var rows=$.cpOperations.instances(layer);for(var i=0;i<rows.length;i++)if(rows[i].instanceId===id&&rows[i].document.textApplication&&rows[i].document.textApplication.schemaVersion===1)return rows[i];fail('TEXT_OPERATION_NOT_FOUND','Text operation owner missing');}
 function remove(layer,id,options){
  var r=instance(layer,id),m=r.document.textApplication,owned=[],i,j,k,a,p,s;
  if(layer.locked)fail('LAYER_LOCKED','Target is locked');
  if(m.anchorGroupingApplied!==null&&(grouping(layer).expression||grouping(layer).numKeys))fail('TEXT_GROUPING_ANIMATED','Animated grouping requires its own contract');
  for(i=0;i<m.animators.length;i++){
   a=findAnimator(layer,m.animators[i].name);if(!a)fail('TEXT_OWNERSHIP_CHANGED','Owned animator missing');owned.push(m.animators[i].name);var spec=r.document.addedTextAnimators[i],sels=at(a,'ADBE Text Selectors');if(sels.numProperties!==spec.selectors.length)fail('TEXT_OWNERSHIP_CHANGED','Selector structure changed');
   for(j=0;j<spec.selectors.length;j++){s=sels.property(j+1);if(s.matchName!==spec.selectors[j].matchName||s.name!==spec.selectors[j].name)fail('TEXT_OWNERSHIP_CHANGED','Selector identity changed');for(k=0;k<spec.selectors[j].properties.length;k++){var sr=spec.selectors[j].properties[k];p=rowAt(s,sr);if(p.numKeys||sr.expressionTemplate&&(p.expression!==expand(sr.expressionTemplate,r)||p.expressionEnabled!==true)||!sr.expressionTemplate&&(p.expression||p.expressionEnabled))fail('TEXT_OWNERSHIP_CHANGED','Selector expression or keys changed');}}
   verifyAnimatorProperties(a,spec,r);
  }
  var started=false;try{if(!options||options.undoGroup!==false){app.beginUndoGroup('Contentrium Preset - Remove Text Operations');started=true;}var result=$.cpOperations.remove(layer,id,{undoGroup:false});for(i=owned.length-1;i>=0;i--)findAnimator(layer,owned[i]).remove();if(animators(layer).numProperties===m.originalAnimatorCount&&grouping(layer).valueAtTime(layer.containingComp.time||0,true)===m.anchorGroupingApplied)grouping(layer).setValue(m.anchorGroupingBefore);return result;}finally{if(started)app.endUndoGroup();}
 }
 $.cpTextOperations={validate:validate,preflight:preflight,apply:apply,remove:remove,instances:function(layer){var rows=$.cpOperations.instances(layer),out=[];for(var i=0;i<rows.length;i++)if(rows[i].document.textApplication)out.push(rows[i]);return out;}};
})();
