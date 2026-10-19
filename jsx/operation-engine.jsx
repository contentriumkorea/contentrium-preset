/* Independent semantic operations; private validation build, not installed.
   Existing root values/keys are never assigned by this engine. */
(function(){
 var tag='\n[Contentrium Operations 1] ';
 function fail(code,message){var e=new Error(message);e.code=code;throw e;}
 function array(v){return Object.prototype.toString.call(v)==='[object Array]';}
 function own(o,k){return Object.prototype.hasOwnProperty.call(o,k);}
 function finite(v){return typeof v==='number'&&isFinite(v);}
 function clone(v){var out,i,k;if(array(v)){out=[];for(i=0;i<v.length;i++)out.push(clone(v[i]));return out;}if(v&&typeof v==='object'){out={};for(k in v)if(own(v,k))out[k]=clone(v[k]);return out;}return v;}
 function quote(v){return '"'+String(v).replace(/[\\"\x00-\x1f\u2028\u2029]/g,function(c){var m={'"':'\\"','\\':'\\\\','\n':'\\n','\r':'\\r','\t':'\\t'};return m[c]||'\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4);})+'"';}
 function exactNumber(v){
  if(!finite(v))fail('OPERATION_NUMBER_UNREPRESENTABLE','Finite metadata values required');if(v===0)return 1/v<0?'-0':'0';
  var fast=v.toPrecision(17);if(Number(fast)===v)return fast;
  // Legacy ExtendScript truncates even toPrecision(17). Reconstruct the exact
  // finite binary64 as an ordinary decimal using only small-integer arithmetic.
  var negative=v<0,m=Math.abs(v),exponent=0,i,digits='',q,carry,part,power,result;
  while(m>=2){m/=2;exponent++;}while(m<1){m*=2;exponent--;}
  m*=4503599627370496;while(m>0){q=Math.floor(m/10);digits=String(m-q*10)+digits;m=q;}
  power=exponent-52;
  for(i=0;i<Math.abs(power);i++){
   carry=0;result='';for(var j=digits.length-1;j>=0;j--){part=Number(digits.charAt(j))*(power<0?5:2)+carry;result=String(part%10)+result;carry=Math.floor(part/10);}if(carry)result=String(carry)+result;digits=result;
  }
  if(power<0){var places=-power;while(digits.length<=places)digits='0'+digits;digits=digits.slice(0,digits.length-places)+'.'+digits.slice(digits.length-places);while(digits.charAt(digits.length-1)==='0')digits=digits.slice(0,-1);if(digits.charAt(digits.length-1)==='.')digits=digits.slice(0,-1);}
  result=(negative?'-':'')+digits;if(Number(result)===v)return result;
  // Some host decimal parsers round long decimals incorrectly. Only internal
  // owner metadata uses small integer limbs; editable preset files stay JSON.
  m=Math.abs(v);exponent=0;while(m>=2){m/=2;exponent++;}while(m<1){m*=2;exponent--;}
  var fraction=(m-1)*67108864,hi=Math.floor(fraction),lo=(fraction-hi)*67108864;
  if(lo!==Math.floor(lo)||((1+hi/67108864+lo/4503599627370496)*Math.pow(2,exponent))!==Math.abs(v))fail('OPERATION_NUMBER_UNREPRESENTABLE','Exact metadata limbs failed');
  return '{"__cpFloat64":['+(negative?'-1':'1')+','+String(exponent)+','+String(hi)+','+String(lo)+']}';
 }
 function metadataValues(v){var out,i,k,count=0;if(array(v)){out=[];for(i=0;i<v.length;i++)out.push(metadataValues(v[i]));return out;}if(v&&typeof v==='object'){if(own(v,'__cpFloat64')){for(k in v)if(own(v,k))count++;var a=v.__cpFloat64;if(count!==1||!array(a)||a.length!==4||(a[0]!==1&&a[0]!==-1)||!finite(a[1])||a[1]!==Math.floor(a[1])||a[1]<-1074||a[1]>1023||!finite(a[2])||a[2]!==Math.floor(a[2])||a[2]<0||a[2]>=67108864||!finite(a[3])||a[3]!==Math.floor(a[3])||a[3]<0||a[3]>=67108864)fail('INVALID_OPERATION_METADATA','Invalid exact number limbs');return a[0]*(1+a[2]/67108864+a[3]/4503599627370496)*Math.pow(2,a[1]);}out={};for(k in v)if(own(v,k))out[k]=metadataValues(v[k]);return out;}return v;}
 function json(v,depth){depth=depth||0;if(depth>128)fail('OPERATION_METADATA_LIMIT','Metadata is too deeply nested');var type=typeof v,out=[],i,k;if(v===null)return 'null';if(type==='string')return quote(v);if(type==='boolean')return v?'true':'false';if(type==='number')return exactNumber(v);if(array(v)){for(i=0;i<v.length;i++)out.push(json(v[i],depth+1));return '['+out.join(',')+']';}if(type==='object'){for(k in v)if(own(v,k)){if(k==='__proto__'||k==='constructor'||k==='prototype')fail('INVALID_OPERATION_METADATA','Unsafe metadata key');out.push(quote(k)+':'+json(v[k],depth+1));}return '{'+out.join(',')+'}';}fail('INVALID_OPERATION_METADATA','Only plain JSON values may be stored');}
 function at(parent,path){for(var i=0;i<path.length;i++){parent=parent.property(path[i]);if(!parent)fail('OPERATION_PROPERTY_MISSING','Missing native property '+path[i]);}return parent;}
 function effect(parent,name,matchName){var found=null;for(var i=1;i<=parent.numProperties;i++){var p=parent.property(i);if(p.name===name){if(p.matchName!==matchName||found)fail('OPERATION_OWNERSHIP_CHANGED','Effect identity is changed or ambiguous');found=p;}}return found;}
 function record(layer){var comment=String(layer.comment||''),i=comment.indexOf(tag);if(i<0)return null;if(comment.indexOf(tag,i+tag.length)>=0)fail('INVALID_OPERATION_METADATA','Multiple owner records');var result;try{result=metadataValues($.cpJson.parse(comment.slice(i+tag.length)));}catch(e){fail('INVALID_OPERATION_METADATA','Unreadable owner record');}if(!result||result.schemaVersion!==1||result.kind!=='contentrium-operation-instance'||typeof result.instanceId!=='string'||result.originalComment!==comment.slice(0,i))fail('INVALID_OPERATION_METADATA','Owner identity changed');return result;}
 function validatePath(path){if(!array(path)||!path.length||path.length>32)fail('INVALID_OPERATION_DOCUMENT','Invalid property path');for(var i=0;i<path.length;i++)if(typeof path[i]!=='string'||!path[i]||path[i].length>256)fail('INVALID_OPERATION_DOCUMENT','Explicit matchNames required');}
 function validValue(v){if(finite(v))return true;if(!array(v)||!v.length||v.length>4)return false;for(var i=0;i<v.length;i++)if(!finite(v[i]))return false;return true;}
 function ordinaryAv(layer){if(typeof AVLayer!=='undefined'&&!(layer instanceof AVLayer))return false;if(typeof TextLayer!=='undefined'&&layer instanceof TextLayer)return false;if(typeof ShapeLayer!=='undefined'&&layer instanceof ShapeLayer)return false;return true;}
 var controlSpecs={Slider:['ADBE Slider Control','ADBE Slider Control-0001',1],Angle:['ADBE Angle Control','ADBE Angle Control-0001',1],Checkbox:['ADBE Checkbox Control','ADBE Checkbox Control-0001',1],Color:['ADBE Color Control','ADBE Color Control-0001',3],Point:['ADBE Point Control','ADBE Point Control-0001',2]};
 function validate(data){
  if(!data||data.schemaVersion!==1||data.kind!=='contentrium-operation-preset'||typeof data.documentId!=='string'||!data.documentId||data.documentId.length>256||typeof data.name!=='string')fail('INVALID_OPERATION_DOCUMENT','Invalid independent document identity');
  if(!data.requirements||data.requirements.layerKind!=='av'||!data.policies||data.policies.rootValues!=='preserve'||data.policies.rootKeys!=='preserve'||data.policies.newEffectValues!=='initialize')fail('INVALID_OPERATION_DOCUMENT','Unsupported application contract');
  for(var policyIndex=0;policyIndex<2;policyIndex++){var policyName=policyIndex===0?'enableMotionBlur':'enableVideoForNonNullAv';if(own(data.policies,policyName)&&typeof data.policies[policyName]!=='boolean')fail('INVALID_OPERATION_DOCUMENT','Explicit Boolean policy required');}
  if(!array(data.controls)||!array(data.addedEffects)||!array(data.rootProperties)||data.controls.length+data.addedEffects.length>500||data.rootProperties.length>1000)fail('INVALID_OPERATION_DOCUMENT','Invalid operation count');
  var ids={},i,j,row,spec;
  function id(value){if(typeof value!=='string'||!/^(in|out|effect):[ce][1-9][0-9]*$/.test(value)||ids[value])fail('INVALID_OPERATION_DOCUMENT','Unique semantic operation IDs required');ids[value]=true;}
  function property(p,root){validatePath(p.path);if(root&&(p.writeMode!=='expression-only'||own(p,'initialValue')))fail('INVALID_OPERATION_DOCUMENT','Root assignment forbidden');if(own(p,'expression'))fail('OPERATION_NOT_MATERIALIZED','Build-time expression plan cannot run in the host');if(own(p,'initialValue')&&!validValue(p.initialValue))fail('INVALID_OPERATION_DOCUMENT','Only finite initialization values accepted');if(root||own(p,'expressionTemplate')){if(typeof p.expressionTemplate!=='string'||!p.expressionTemplate.length||p.expressionTemplate.length>500000)fail('INVALID_OPERATION_DOCUMENT','Explicit expression template required');}}
  for(i=0;i<data.controls.length;i++){row=data.controls[i];id(row.id);spec=controlSpecs[row.type];if(row.type==='Point'&&row.dimensions===3)spec=['ADBE Point3D Control','ADBE Point3D Control-0001',3];if(!spec||row.effectMatchName!==spec[0]||row.propertyMatchName!==spec[1]||!validValue(row.defaultValue)||(spec[2]===1?typeof row.defaultValue!=='number':!array(row.defaultValue)||row.defaultValue.length!==spec[2])||!row.definition||typeof row.name!=='string')fail('INVALID_OPERATION_DOCUMENT','Control schema does not match its standard backend');if(row.type==='Checkbox'&&row.defaultValue!==0&&row.defaultValue!==1)fail('INVALID_OPERATION_DOCUMENT','Checkbox default must be zero or one');}
  var groups=data.controlGroups||[],groupIds={};if(!array(groups)||groups.length>2)fail('INVALID_OPERATION_DOCUMENT','Explicit control groups required');for(i=0;i<groups.length;i++){row=groups[i];if((row.id!=='in'&&row.id!=='out')||groupIds[row.id]||typeof row.defaultEnabled!=='boolean'||!array(row.controlIds))fail('INVALID_OPERATION_DOCUMENT','Invalid control group');groupIds[row.id]=true;for(j=0;j<row.controlIds.length;j++)if(!ids[row.controlIds[j]]||row.controlIds[j].indexOf(row.id+':')!==0)fail('INVALID_OPERATION_DOCUMENT','Unknown group control reference');}
  for(i=0;i<data.addedEffects.length;i++){row=data.addedEffects[i];id(row.id);if(typeof row.matchName!=='string'||!array(row.properties)||row.properties.length>1000)fail('INVALID_OPERATION_DOCUMENT','Invalid effect');for(j=0;j<row.properties.length;j++)property(row.properties[j],false);}
  for(i=0;i<data.rootProperties.length;i++)property(data.rootProperties[i],true);
  if(!data.timing||!array(data.timing.roles)||data.timing.roles.length>2)fail('INVALID_OPERATION_DOCUMENT','Explicit timeline roles required');ids={};
  for(i=0;i<data.timing.roles.length;i++){row=data.timing.roles[i];if((row.role!=='in'&&row.role!=='out')||ids[row.role]||row.edge!==(row.role==='in'?'inPoint':'outPoint')||!finite(row.offsetSeconds))fail('INVALID_OPERATION_DOCUMENT','Invalid edge-relative marker');ids[row.role]=true;}
  return true;
 }
 function expand(template,id,controls,groups){var result=template.split(quote('__CP_OWNER__')).join(quote(id)),i;for(i=0;i<controls.length;i++)result=result.split(quote('__CP_CONTROL_'+controls[i].id+'__')).join(quote(controls[i].effectName));for(i=0;i<groups.length;i++)result=result.split(quote('__CP_GROUP_'+groups[i].id+'__')).join(quote(groups[i].effectName));if(/__CP_(OWNER|CONTROL_|GROUP_)/.test(result))fail('UNRESOLVED_OPERATION_TOKEN','Unbound operation expression');return result;}
 function prepare(layer,data,options){
  validate(data);options=options||{};if(layer.locked)fail('LAYER_LOCKED','Target is locked');if(record(layer))fail('OPERATION_STACK_UNVERIFIED','Stacking independent operation instances is not yet verified');if(!$.cpTimeline)fail('TIMELINE_ENGINE_REQUIRED','Timeline engine required');
  var id=options.instanceId||('p'+new Date().getTime().toString(36)),fx=layer.property('ADBE Effect Parade'),i,j,row,p;
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,24}$/.test(id))fail('INVALID_OPERATION_INSTANCE','Compact ASCII owner ID required');if(!fx)fail('OPERATION_PROPERTY_MISSING','Effects unavailable');if($.cpTimeline.read(layer,id).length)fail('OPERATION_INSTANCE_CONFLICT','Timeline already contains this owner ID');
  var r={schemaVersion:1,kind:'contentrium-operation-instance',instanceId:id,documentId:data.documentId,name:data.name,originalComment:String(layer.comment||''),document:clone(data),controls:[],groups:[],effects:[],rootBackups:[],markerSpecs:[],motionBlurBefore:layer.motionBlur,videoEnabledBefore:typeof layer.enabled==='boolean'?layer.enabled:null};
  function addEffect(spec,serial,isControl){var name='CP '+id+' '+(isControl?'c':'e')+serial;if(effect(fx,name,spec.effectMatchName||spec.matchName))fail('OPERATION_EFFECT_CONFLICT','Effect identity already in use');var mn=spec.effectMatchName||spec.matchName;if(fx.canAddProperty&&!fx.canAddProperty(mn))fail('DEPENDENCY_MISSING','Effect unavailable: '+mn);return name;}
  for(i=0;i<data.controls.length;i++){row=clone(data.controls[i]);row.effectName=addEffect(row,i+1,true);r.controls.push(row);}
  for(i=0;i<(data.controlGroups||[]).length;i++){row=clone(data.controlGroups[i]);row.effectName='CP '+id+' g'+(i+1);if(effect(fx,row.effectName,'ADBE Checkbox Control'))fail('OPERATION_EFFECT_CONFLICT','Group identity already exists');if(fx.canAddProperty&&!fx.canAddProperty('ADBE Checkbox Control'))fail('DEPENDENCY_MISSING','Group backend unavailable');r.groups.push(row);}
  for(i=0;i<data.addedEffects.length;i++){row=clone(data.addedEffects[i]);row.effectName=addEffect(row,i+1,false);for(j=0;j<row.properties.length;j++)if(row.properties[j].expressionTemplate)row.properties[j].resolvedExpression=expand(row.properties[j].expressionTemplate,id,r.controls,r.groups);r.effects.push(row);}
  for(i=0;i<data.rootProperties.length;i++){row=data.rootProperties[i];p=at(layer,row.path);if(!p.canSetExpression)fail('OPERATION_EXPRESSION_UNAVAILABLE','Target cannot accept an expression');if(p.expression)fail('OPERATION_EXPRESSION_CONFLICT','Existing expression requires an explicit composition contract');if(p.dimensionsSeparated)fail('OPERATION_SEPARATED_UNVERIFIED','Separated dimensions need a verified mapping');r.rootBackups.push({path:clone(row.path),expression:p.expression||'',enabled:!!p.expressionEnabled,appliedExpression:expand(row.expressionTemplate,id,r.controls,r.groups)});}
  for(i=0;i<data.timing.roles.length;i++){row=data.timing.roles[i];r.markerSpecs.push({role:row.role,time:layer[row.edge]+row.offsetSeconds,comment:row.role==='in'?'TR In':'TR Out',duration:0});}
  $.cpTimeline.validate(layer,id,r.markerSpecs);json(r);return r;
 }
 function expressionCheck(property,layer){property.valueAtTime(layer.containingComp.time||0,false);if(property.expressionError||property.expressionEnabled!==true)fail('OPERATION_EXPRESSION_FAILED',String(property.expressionError||'Expression disabled by the host'));}
 function apply(layer,data,options){
  options=options||{};var r=prepare(layer,data,options),fx=layer.property('ADBE Effect Parade'),added=[],changed=[],started=false,i,j,spec,p;
  try{
   if(options.undoGroup!==false){app.beginUndoGroup('Contentrium Preset - Operations');started=true;}
   for(i=0;i<r.groups.length;i++){spec=r.groups[i];p=fx.addProperty('ADBE Checkbox Control');p.name=spec.effectName;added.push({name:p.name,matchName:'ADBE Checkbox Control'});p=effect(fx,spec.effectName,'ADBE Checkbox Control');p.enabled=spec.defaultEnabled;p.property('ADBE Checkbox Control-0001').setValue(1);}
   for(i=0;i<r.controls.length;i++){spec=r.controls[i];p=fx.addProperty(spec.effectMatchName);p.name=spec.effectName;added.push({name:p.name,matchName:spec.effectMatchName});p=effect(fx,spec.effectName,spec.effectMatchName).property(spec.propertyMatchName);var v=clone(spec.defaultValue);if(spec.type==='Color')v.push(1);p.setValue(v);}
   for(i=0;i<r.effects.length;i++){spec=r.effects[i];p=fx.addProperty(spec.matchName);p.name=spec.effectName;added.push({name:p.name,matchName:spec.matchName});for(j=0;j<spec.properties.length;j++){var row=spec.properties[j];p=at(effect(fx,spec.effectName,spec.matchName),row.path);if(own(row,'initialValue'))p.setValue(clone(row.initialValue));if(row.resolvedExpression){if(!p.canSetExpression)fail('OPERATION_EXPRESSION_UNAVAILABLE','Effect property cannot accept expression');p.expression=row.resolvedExpression;p.expressionEnabled=true;}}}
   $.cpTimeline.ensure(layer,r.instanceId,r.markerSpecs,{variantId:r.documentId,scope:'layer'});
   for(i=0;i<r.rootBackups.length;i++){spec=r.rootBackups[i];p=at(layer,spec.path);changed.push(spec);p.expression=spec.appliedExpression;p.expressionEnabled=true;}
   for(i=0;i<r.effects.length;i++)for(j=0;j<r.effects[i].properties.length;j++)if(r.effects[i].properties[j].resolvedExpression)expressionCheck(at(effect(fx,r.effects[i].effectName,r.effects[i].matchName),r.effects[i].properties[j].path),layer);
   for(i=0;i<r.rootBackups.length;i++)expressionCheck(at(layer,r.rootBackups[i].path),layer);
   // Native preference semantics: true enables only the target layer; false
   // performs no write. The composition's motion-blur switch stays untouched.
   if(data.policies.enableMotionBlur===true)layer.motionBlur=true;
   if(data.policies.enableVideoForNonNullAv===true&&layer.nullLayer!==true&&ordinaryAv(layer))layer.enabled=true;
   layer.comment=r.originalComment+tag+json(r);
  }catch(error){
   for(i=changed.length-1;i>=0;i--)try{p=at(layer,changed[i].path);p.expression=changed[i].expression;p.expressionEnabled=changed[i].enabled;}catch(e){error.rollbackError=String(e);}
   try{$.cpTimeline.remove(layer,r.instanceId);}catch(e2){error.rollbackError=String(e2);}
   for(i=added.length-1;i>=0;i--)try{p=effect(fx,added[i].name,added[i].matchName);if(p)p.remove();}catch(e3){error.rollbackError=String(e3);}
   try{layer.comment=r.originalComment;if(layer.motionBlur!==r.motionBlurBefore)layer.motionBlur=r.motionBlurBefore;if(r.videoEnabledBefore!==null&&layer.enabled!==r.videoEnabledBefore)layer.enabled=r.videoEnabledBefore;}catch(e4){error.rollbackError=String(e4);}
   throw error;
  }finally{if(started)app.endUndoGroup();}
  return{applied:true,kind:'operations',instanceId:r.instanceId,documentId:r.documentId,addedEffects:added.length};
 }
 function instance(layer,id){var r=record(layer);if(!r||r.instanceId!==id)fail('OPERATION_NOT_FOUND','Owned operation instance missing');return r;}
 function control(layer,id,controlId){var r=instance(layer,id);for(var i=0;i<r.controls.length;i++)if(r.controls[i].id===controlId){var row=r.controls[i],fx=effect(layer.property('ADBE Effect Parade'),row.effectName,row.effectMatchName);if(!fx)fail('OPERATION_OWNERSHIP_CHANGED','Owned control missing');return{row:row,property:at(fx,[row.propertyMatchName])};}fail('OPERATION_CONTROL_NOT_FOUND','Explicit control identity missing');}
 function readControl(layer,id,controlId){var c=control(layer,id,controlId);return clone(c.property.valueAtTime(layer.containingComp.time||0,true));}
 function writeControl(layer,id,controlId,value){var c=control(layer,id,controlId),r=c.row,d=r.definition;if(!validValue(value)||(typeof r.defaultValue==='number'?typeof value!=='number':!array(value)||value.length!==(r.type==='Color'?4:r.defaultValue.length))||(r.type==='Checkbox'&&value!==0&&value!==1))fail('INVALID_CONTROL_VALUE','Control shape changed');if(typeof value==='number'&&((finite(d.validMin)&&value<d.validMin)||(finite(d.validMax)&&value>d.validMax)))fail('INVALID_CONTROL_VALUE','Outside authored valid range');if(c.property.numKeys||c.property.expression)fail('OPERATION_CONTROL_ANIMATED','Animated controls need a keyframe-aware edit');c.property.setValue(clone(value));return readControl(layer,id,controlId);}
 function controls(layer,id){var r=instance(layer,id),out=[],i,k;for(i=0;i<r.controls.length;i++){var c=r.controls[i],def=clone(c.defaultValue);if(c.type==='Color')def.push(1);var row={id:c.id,name:c.name,valueType:c.type,value:readControl(layer,id,c.id),defaultValue:def,authoredDefaultValue:clone(c.defaultValue),def:clone(c.definition),side:c.side};for(k in c.definition)if(own(c.definition,k))row[k]=clone(c.definition[k]);out.push(row);}return out;}
 function groupEffect(layer,id,groupId){var r=instance(layer,id);for(var i=0;i<(r.groups||[]).length;i++)if(r.groups[i].id===groupId){var p=effect(layer.property('ADBE Effect Parade'),r.groups[i].effectName,'ADBE Checkbox Control');if(!p)fail('OPERATION_OWNERSHIP_CHANGED','Group backend missing');return p;}fail('OPERATION_GROUP_NOT_FOUND','Explicit control group missing');}
 function groupEnabled(layer,id,groupId){var p=groupEffect(layer,id,groupId);return p.enabled!==false&&p.property('ADBE Checkbox Control-0001').valueAtTime(layer.containingComp.time||0,true)!==0;}
 function setGroupEnabled(layer,id,groupId,value){if(typeof value!=='boolean')fail('INVALID_CONTROL_VALUE','Group enable requires a Boolean');var p=groupEffect(layer,id,groupId),q=p.property('ADBE Checkbox Control-0001');if(q.numKeys||q.expression)fail('OPERATION_CONTROL_ANIMATED','Group backend was animated');if(value)q.setValue(1);p.enabled=value;return groupEnabled(layer,id,groupId);}
 function remove(layer,id,options){
  options=options||{};var r=instance(layer,id),fx=layer.property('ADBE Effect Parade'),i,p,owned=[];
  for(i=0;i<r.rootBackups.length;i++){p=at(layer,r.rootBackups[i].path);if(p.expression!==r.rootBackups[i].appliedExpression||!p.expressionEnabled)fail('OPERATION_OWNERSHIP_CHANGED','Expression changed outside this instance');}
  for(i=0;i<r.effects.length;i++){p=effect(fx,r.effects[i].effectName,r.effects[i].matchName);if(!p)fail('OPERATION_OWNERSHIP_CHANGED','Owned effect missing');owned.push({name:p.name,matchName:p.matchName});}
  for(i=0;i<r.controls.length;i++){p=effect(fx,r.controls[i].effectName,r.controls[i].effectMatchName);if(!p)fail('OPERATION_OWNERSHIP_CHANGED','Owned control missing');owned.push({name:p.name,matchName:p.matchName});}
  for(i=0;i<(r.groups||[]).length;i++){p=effect(fx,r.groups[i].effectName,'ADBE Checkbox Control');if(!p)fail('OPERATION_OWNERSHIP_CHANGED','Owned group missing');owned.push({name:p.name,matchName:p.matchName});}
  var started=false;try{if(options.undoGroup!==false){app.beginUndoGroup('Contentrium Preset - Remove Operations');started=true;}for(i=0;i<r.rootBackups.length;i++){p=at(layer,r.rootBackups[i].path);p.expression=r.rootBackups[i].expression;p.expressionEnabled=r.rootBackups[i].enabled;}for(i=owned.length-1;i>=0;i--)effect(fx,owned[i].name,owned[i].matchName).remove();$.cpTimeline.remove(layer,id);layer.comment=r.originalComment;}finally{if(started)app.endUndoGroup();}return{removed:true,instanceId:id};
 }
 $.cpOperations={validate:validate,preflight:prepare,apply:apply,instances:function(layer){var r=record(layer);return r?[r]:[];},controls:controls,readControl:readControl,writeControl:writeControl,groupEnabled:groupEnabled,setGroupEnabled:setGroupEnabled,timing:function(layer,id){instance(layer,id);return $.cpTimeline.read(layer,id);},setTiming:function(layer,id,role,time){var r=instance(layer,id),found=false;for(var i=0;i<r.markerSpecs.length;i++)if(r.markerSpecs[i].role===role)found=true;if(!found||!finite(time))fail('INVALID_OPERATION_TIMING','Declared role and finite time required');return $.cpTimeline.set(layer,id,role,{time:time});},remove:remove};
})();
