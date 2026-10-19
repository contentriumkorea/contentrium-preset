/* Private facade adapter model. Polling reads live owner/control/marker state;
   it never applies a preset, changes selection or repairs missing markers. */
(function(){
 function fail(code,message){var e=new Error(message);e.code=code;throw e;}
 function array(v){return Object.prototype.toString.call(v)==='[object Array]';}
 function clone(v){var a,i,k;if(array(v)){a=[];for(i=0;i<v.length;i++)a.push(clone(v[i]));return a;}if(v&&typeof v==='object'){a={};for(k in v)if(Object.prototype.hasOwnProperty.call(v,k))a[k]=clone(v[k]);return a;}return v;}
 function identity(parts){var out=[];for(var i=0;i<parts.length;i++){var value=String(parts[i]);out.push(value.length+':'+value);}return out.join('|');}
 function owner(layer,target){if(String(layer.id)!==String(target.layerId))fail('OPERATION_TARGET_CHANGED','Target layer changed');var rows=$.cpOperations.instances(layer);for(var i=0;i<rows.length;i++)if(rows[i].instanceId===target.instanceId&&rows[i].documentId===target.documentId)return rows[i];fail('OPERATION_NOT_FOUND','Selected operation owner changed');}
 function direction(instance){var roles=instance.document.timing.roles;if(roles.length===2)return 'both';return roles.length?roles[0].role:'effect';}
 function descriptor(layer,instance,kind,id,name){
  var side=id.split(':')[0],target={kind:kind,layerId:layer.id,instanceId:instance.instanceId,documentId:instance.documentId,localId:id};
  var result={id:'operations:'+layer.id+':'+instance.instanceId+':'+kind+':'+id,name:name,instanceId:instance.instanceId,side:side,enabled:!layer.locked,actions:layer.locked?[]:['copy','paste','reset'],target:target};
  var phaseLabel=side;if(side==='in')phaseLabel='IN';else if(side==='out')phaseLabel='OUT';
  target.publicId=result.id;result.mergeKey=identity(['operations',instance.documentId,side,kind,id]);result.setGroupKey=identity(['operations',instance.documentId,side]);result.setControlKey=result.mergeKey;result.groupPath=[instance.name||instance.document.name,phaseLabel+' Controls'];return result;
 }
 function describe(layer){
  var instances=$.cpOperations.instances(layer),result={applied:[],controls:[]},i,j,k;
  for(i=0;i<instances.length;i++){
   var instance=instances[i],roles=instance.document.timing.roles,controls=$.cpOperations.controls(layer,instance.instanceId),live=$.cpOperations.timing(layer,instance.instanceId),groups=instance.groups||[];
   result.applied.push({id:'operations:'+layer.id+':'+instance.instanceId,kind:'operations',instanceId:instance.instanceId,variantId:instance.documentId,name:instance.name||instance.document.name,direction:direction(instance),layerId:layer.id,type:roles.length?1:3,actions:['remove'],legacyTimeline:false});
   for(j=0;j<controls.length;j++){
    var control=controls[j],d=descriptor(layer,instance,'operation-control',control.id,control.name),def=clone(control.def||{}),type=control.valueType;
    d.value=clone(control.value);d.defaultValue=clone(control.defaultValue);d.def=def;d.semantic=type;
    if(type==='Point')d.type=(def.dimensions||control.value.length)===3?'ThreeD':'TwoD';
    else if(type==='Checkbox'){d.type='checkbox';d.value=d.value!==0;d.defaultValue=d.defaultValue!==0;d.target.checkbox=true;}
    else if(type==='Color')d.type='color';
    else if(type==='Slider'||type==='Angle')d.type='OneD';
    else fail('OPERATION_DESCRIPTOR_UNSUPPORTED','Unsupported semantic control type');
    if(typeof def.validMin==='number')d.min=def.validMin;if(typeof def.validMax==='number')d.max=def.validMax;
    if(typeof def.sliderMin==='number')d.sliderMin=def.sliderMin;if(typeof def.sliderMax==='number')d.sliderMax=def.sliderMax;
    if(typeof def.precision==='number')d.precision=def.precision;
    result.controls.push(d);
   }
   for(j=0;j<groups.length;j++){
    d=descriptor(layer,instance,'operation-group',groups[j].id,'Enabled');d.type='checkbox';d.semantic='Checkbox';d.value=$.cpOperations.groupEnabled(layer,instance.instanceId,groups[j].id);d.defaultValue=groups[j].defaultEnabled;result.controls.push(d);
   }
   for(j=0;j<roles.length;j++){
    var mark=null;for(k=0;k<live.length;k++)if(live[k].role===roles[j].role){if(mark)fail('OPERATION_MARKER_AMBIGUOUS','Timeline role has multiple owned markers');mark=live[k];}
    d=descriptor(layer,instance,mark?'operation-marker':'operation-missing-marker',roles[j].role,mark?(mark.comment||roles[j].role.toUpperCase()):roles[j].role.toUpperCase()+' 마커 없음');
    d.groupPath=[instance.name||instance.document.name,'Timeline'];d.actions=[];
    if(mark){d.type='time';d.semantic='Time';d.value=mark.time;d.defaultValue=layer[roles[j].edge]+roles[j].offsetSeconds;d.frameDuration=layer.containingComp.frameDuration;}
    else{d.type='comment';d.value=roles[j].role.toUpperCase()+' 마커가 없습니다.';d.enabled=false;d.recoveryAvailable=false;}
    result.controls.push(d);
   }
  }
  return result;
 }
 function state(layers){
  var result={numSelectedLayers:layers.length,selectedLayerName:layers.length===1?layers[0].name:layers.length+' layers',applied:[],controls:[],errors:[],hasError:false,hasRootNode:false,wantsRevealEditTab:false},selection=[],owners=[],i,j;
  for(i=0;i<layers.length;i++){selection.push(String(layers[i].id));try{var row=describe(layers[i]);for(j=0;j<row.applied.length;j++){result.applied.push(row.applied[j]);owners.push(row.applied[j].id);}for(j=0;j<row.controls.length;j++)result.controls.push(row.controls[j]);}catch(e){result.errors.push({layerId:layers[i].id,code:e.code||'OPERATION_STATE_ERROR',message:String(e.message||e)});}}
  selection.sort();owners.sort();result.selectionSignature=identity(selection);result.instanceId=identity(['operations-model',result.selectionSignature].concat(owners));result.hasError=result.errors.length>0;result.hasRootNode=result.applied.length>0;result.wantsRevealEditTab=result.hasRootNode;return result;
 }
 function read(layer,target){owner(layer,target);if(target.kind==='operation-control'){var value=$.cpOperations.readControl(layer,target.instanceId,target.localId);return target.checkbox?value!==0:value;}if(target.kind==='operation-group')return $.cpOperations.groupEnabled(layer,target.instanceId,target.localId);if(target.kind==='operation-marker'){var list=$.cpOperations.timing(layer,target.instanceId);for(var i=0;i<list.length;i++)if(list[i].role===target.localId)return list[i].time;fail('OPERATION_MARKER_MISSING','Owned timeline marker missing');}fail('OPERATION_TARGET_UNSUPPORTED','Unsupported operation target');}
 function write(layer,target,value){owner(layer,target);if(layer.locked)fail('LAYER_LOCKED','Selected layer is locked');if(target.kind==='operation-control'){if(target.checkbox){if(typeof value!=='boolean')fail('INVALID_CONTROL_VALUE','Checkbox requires a Boolean');value=value?1:0;}return $.cpOperations.writeControl(layer,target.instanceId,target.localId,value);}if(target.kind==='operation-group')return $.cpOperations.setGroupEnabled(layer,target.instanceId,target.localId,value);if(target.kind==='operation-marker')return $.cpOperations.setTiming(layer,target.instanceId,target.localId,value);fail('OPERATION_TARGET_UNSUPPORTED','Unsupported operation target');}
 $.cpOperationModel={describe:describe,state:state,read:read,write:write};
})();
