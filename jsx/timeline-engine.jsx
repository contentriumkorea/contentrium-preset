/* Contentrium Preset timeline contract. Own metadata; standard AE markers only.
   Low-level writes inherit the caller's Undo group. read/serialize never write. */
(function(){
 function fail(code,message){var e=new Error(message);e.code=code;throw e;}
 function finite(v){return typeof v==='number'&&isFinite(v);}
 function quote(s){return '"'+String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n')+'"';}
 function property(owner){if(owner&&owner.markerProperty)return owner.markerProperty;var p=null;if(owner&&owner.property)p=owner.property('ADBE Marker');if(!p)fail('MARKER_UNAVAILABLE','This AE object has no marker property.');return p;}
 function params(value){try{return value.getParameters();}catch(ignore){return{};}}
 function owned(p,id,role){if(p.cpTimeline!=='1')return false;if(id&&p.cpInstanceId!==id)return false;if(role&&p.cpRole!==role)return false;return true;}
 function read(owner,id){var p=property(owner),out=[],i,v,q;for(i=1;i<=p.numKeys;i++){v=p.keyValue(i);q=params(v);if(!owned(q,id))continue;out.push({index:i,time:p.keyTime(i),comment:v.comment,duration:v.duration||0,label:v.label||0,protectedRegion:!!v.protectedRegion,chapter:v.chapter,url:v.url,frameTarget:v.frameTarget,cuePointName:v.cuePointName,eventCuePoint:v.eventCuePoint,role:q.cpRole,instanceId:q.cpInstanceId,variantId:q.cpVariantId||'',scope:q.cpScope||'layer',enabled:q.cpEnabled!=='0',parameters:q});}return out;}
 function marker(spec,id,meta,previous){var m=new MarkerValue(spec.comment||''),fields=['chapter','url','frameTarget','cuePointName','eventCuePoint','protectedRegion'],i,q={},k;for(i=0;i<fields.length;i++)try{if(spec.hasOwnProperty(fields[i]))m[fields[i]]=spec[fields[i]];else if(previous)m[fields[i]]=previous[fields[i]];}catch(ignoreField){}m.duration=spec.duration||0;m.label=spec.label||0;if(spec.hasOwnProperty('protectedRegion'))m.protectedRegion=!!spec.protectedRegion;if(spec.parameters)for(k in spec.parameters)if(spec.parameters.hasOwnProperty(k))q[k]=spec.parameters[k];q.cpTimeline='1';q.cpInstanceId=String(id);q.cpRole=spec.role;q.cpVariantId=String(meta.variantId||q.cpVariantId||'');q.cpScope=String(meta.scope||q.cpScope||'layer');q.cpEnabled='1';if(spec.enabled===false)q.cpEnabled='0';m.setParameters(q);return m;}
 function validate(owner,id,specs,options){options=options||{};var p=property(owner),i,j,s,v,q,allowed,k;for(i=0;i<specs.length;i++){s=specs[i];if(!finite(s.time)||(s.role!=='in'&&s.role!=='out'&&s.role!=='cut'))fail('INVALID_MARKER','A marker requires a finite time and in/out/cut role.');if(s.duration!==undefined&&(!finite(s.duration)||s.duration<0))fail('INVALID_MARKER','Marker duration must be finite and nonnegative.');for(j=0;j<i;j++)if(Math.abs(specs[j].time-s.time)<.0000001)fail('MARKER_TIME_CONFLICT','Two transition markers cannot occupy the same AE key time.');for(j=1;j<=p.numKeys;j++)if(Math.abs(p.keyTime(j)-s.time)<.0000001){v=p.keyValue(j);q=params(v);allowed=owned(q,id);for(k=0;options.replaceInstanceIds&&k<options.replaceInstanceIds.length;k++)if(owned(q,options.replaceInstanceIds[k]))allowed=true;if(!allowed)fail('MARKER_TIME_CONFLICT','A user or another preset marker already occupies this time.');}}return true;}
 function remove(owner,id,role){var p=property(owner),n=0;for(var i=p.numKeys;i>=1;i--)if(owned(params(p.keyValue(i)),id,role)){p.removeKey(i);n++;}return{removed:n};}
 function sameMarker(a,b){
  var fields=['comment','duration','label','protectedRegion','chapter','url','frameTarget','cuePointName','eventCuePoint'],i,k,ap=params(a),bp=params(b);
  for(i=0;i<fields.length;i++)if(a[fields[i]]!==b[fields[i]])return false;
  for(k in ap)if(ap.hasOwnProperty(k)&&(!bp.hasOwnProperty(k)||ap[k]!==bp[k]))return false;
  for(k in bp)if(bp.hasOwnProperty(k)&&!ap.hasOwnProperty(k))return false;
  return true;
 }
 function snapshot(p){var rows=[],i;for(i=1;i<=p.numKeys;i++)rows.push({time:p.keyTime(i),value:p.keyValue(i)});return rows;}
 function unchangedForeign(p,id,before){
  var after=snapshot(p),a=[],b=[],i;
  for(i=0;i<before.length;i++)if(!owned(params(before[i].value),id))a.push(before[i]);
  for(i=0;i<after.length;i++)if(!owned(params(after[i].value),id))b.push(after[i]);
  if(a.length!==b.length)return false;
  for(i=0;i<a.length;i++)if(a[i].time!==b[i].time||!sameMarker(a[i].value,b[i].value))return false;
  return true;
 }
 function unchangedOtherRoles(p,id,role,before){
  var after=snapshot(p),i,j,q,found;
  for(i=0;i<before.length;i++){
   q=params(before[i].value);if(!owned(q,id)||q.cpRole===role)continue;
   found=false;
   for(j=0;j<after.length;j++)if(before[i].time===after[j].time&&sameMarker(before[i].value,after[j].value))found=true;
   if(!found)return false;
  }
  return true;
 }
 function markerPlan(p,previous,all,id,meta){
  var pending=[],current=[],ordered=[],roles={},i,j,row,old,blocked,progress,value;
  for(i=0;i<previous.length;i++)current.push({role:previous[i].role,time:previous[i].time});
  for(i=0;i<all.length;i++){
   row=all[i];if(roles[row.role])fail('INVALID_MARKER','Each owned marker role requires one destination.');roles[row.role]=true;
   old=null;for(j=0;j<previous.length;j++)if(previous[j].role===row.role)old=previous[j];
   value=marker(row,id,meta);
   if(!old||old.time!==row.time||!sameMarker(p.keyValue(old.index),value))pending.push({spec:row,value:value});
  }
  while(pending.length){
   progress=false;
   for(i=0;i<pending.length;i++){
    blocked=false;
    for(j=0;j<current.length;j++)if(current[j].role!==pending[i].spec.role&&Math.abs(current[j].time-pending[i].spec.time)<.0000001)blocked=true;
    if(blocked)continue;
    ordered.push(pending[i]);
    for(j=current.length-1;j>=0;j--)if(current[j].role===pending[i].spec.role)current.splice(j,1);
    current.push({role:pending[i].spec.role,time:pending[i].spec.time});pending.splice(i,1);progress=true;break;
   }
   if(!progress)fail('MARKER_TIME_CONFLICT','Cyclic owned marker moves require a vacant destination.');
  }
  return ordered;
 }
 function ensure(owner,id,specs,meta){
  meta=meta||{};validate(owner,id,specs);
  var p=property(owner),previous=read(owner,id),all=[],replaced={},i,j,row,plan,before,rows,old,kept,oldTimes,writeBefore;
  for(i=0;i<specs.length;i++)replaced[specs[i].role]=true;
  for(i=0;i<previous.length;i++)if(!replaced[previous[i].role])all.push(previous[i]);
  for(i=0;i<specs.length;i++)all.push(specs[i]);validate(owner,id,all);
  plan=markerPlan(p,previous,all,id,meta);before=snapshot(p);
  try{
   for(i=0;i<plan.length;i++){
    row=plan[i];rows=read(owner,id);old=null;oldTimes=[];writeBefore=snapshot(p);
    for(j=0;j<rows.length;j++)if(rows[j].role===row.spec.role){old=rows[j];oldTimes.push(rows[j].time);}
    if(old&&old.time===row.spec.time)p.setValueAtKey(old.index,row.value);
    else{
     /* Keep the original role alive until its replacement exists. */
     p.setValueAtTime(row.spec.time,row.value);rows=read(owner,id);kept=null;
     for(j=0;j<rows.length;j++)if(rows[j].role===row.spec.role){
      var wasOld=false,k;for(k=0;k<oldTimes.length;k++)if(oldTimes[k]===rows[j].time)wasOld=true;
      if(!wasOld)kept=rows[j];
     }
     if(!kept)for(j=0;j<rows.length;j++)if(rows[j].role===row.spec.role&&sameMarker(p.keyValue(rows[j].index),row.value))kept=rows[j];
     if(!kept)fail('MARKER_WRITE_FAILED','The native marker replacement was not found.');
     if(!unchangedForeign(p,id,before))fail('MARKER_FOREIGN_CHANGED','A native write changed an unrelated marker.');
     if(!unchangedOtherRoles(p,id,row.spec.role,writeBefore))fail('MARKER_WRITE_FAILED','A native write changed another owned role.');
     for(j=rows.length-1;j>=0;j--)if(rows[j].role===row.spec.role&&rows[j].index!==kept.index)p.removeKey(rows[j].index);
    }
    if(!unchangedForeign(p,id,before))fail('MARKER_FOREIGN_CHANGED','A native write changed an unrelated marker.');
    if(!unchangedOtherRoles(p,id,row.spec.role,writeBefore))fail('MARKER_WRITE_FAILED','A native write changed another owned role.');
   }
   if(!unchangedForeign(p,id,before))fail('MARKER_FOREIGN_CHANGED','A native write changed an unrelated marker.');
   rows=read(owner,id);if(rows.length!==all.length)fail('MARKER_WRITE_FAILED','Native marker roles changed unexpectedly.');
   for(i=0;i<all.length;i++){old=null;for(j=0;j<rows.length;j++)if(rows[j].role===all[i].role)old=rows[j];if(!old)fail('MARKER_WRITE_FAILED','A native write removed an owned role.');}
  }catch(error){
   try{for(j=p.numKeys;j>=1;j--)p.removeKey(j);for(j=0;j<before.length;j++)p.setValueAtTime(before[j].time,before[j].value);}catch(rollback){error.rollbackError=String(rollback.message||rollback);}
   throw error;
  }
  return read(owner,id);
 }
 function set(owner,id,role,changes){var a=read(owner,id),row=null,i,k;for(i=0;i<a.length;i++)if(a[i].role===role)row=a[i];if(!row)fail('MARKER_NOT_FOUND','The owned transition marker is missing. Use explicit upgrade or reset.');for(k in changes)if(changes.hasOwnProperty(k))row[k]=changes[k];return ensure(owner,id,[row],{variantId:row.variantId,scope:row.scope});}
 function serialize(owner,id){return{schemaVersion:1,origin:finite(owner.inPoint)?owner.inPoint:0,markers:read(owner,id)};}
 function restore(owner,id,data,options){options=options||{};if(!data||data.schemaVersion!==1||!data.markers)fail('INVALID_MARKER_DATA','Serialized timeline data is invalid.');var rows=[],i,k,r,offset=options.offset||0;for(i=0;i<data.markers.length;i++){r={};for(k in data.markers[i])if(data.markers[i].hasOwnProperty(k))r[k]=data.markers[i][k];r.time+=offset;rows.push(r);}return ensure(owner,id,rows,options);}
 function scanCode(id){return 'function cpFindMarker(owner,role){var found=null;for(var cpMI=1;cpMI<=owner.marker.numKeys;cpMI++){var cpM=owner.marker.key(cpMI),cpP=cpM.parameters;if(cpP&&cpP.cpTimeline===\'1\'&&cpP.cpInstanceId==='+quote(id)+'&&cpP.cpRole===role&&cpP.cpEnabled!==\'0\')found=cpM;}return found;}\n';}
 function phaseCode(id){return scanCode(id)+"function cpPhase(side){if(side==='effect')return{on:true,q:1};var m=cpFindMarker(thisLayer,side),start,end,d,q;if(!m)return{on:false,q:0};if(side==='in'){start=thisLayer.inPoint;end=m.time;d=Math.max(0,end-start);q=1;if(d>0)q=1-(time-start)/d;return{on:time<end,q:Math.max(0,Math.min(1,q)),start:start,end:end,duration:d};}start=m.time;end=thisLayer.outPoint-thisComp.frameDuration;d=Math.max(0,end-start);q=1;if(d>0)q=(time-start)/d;return{on:time>=start,q:Math.max(0,Math.min(1,q)),start:start,end:end,duration:d};}\n";}
 function clockCode(id,kind){var code=scanCode(id)+"var cpLocal=time-inPoint,cpEnd=source.duration,cpClock=0,cpCut,cpSourceCut,cpIn,cpOut,cpSourceIn,cpSourceOut;";if(kind==='camera')return code+"cpCut=cpFindMarker(thisLayer,'cut');cpSourceCut=cpFindMarker(source,'cut');if(!cpCut||!cpSourceCut)cpClock=time;else{var cpAt=cpCut.time-inPoint,cpSourceAt=cpSourceCut.time;if(time>outPoint)cpClock=cpEnd;else if(cpLocal<=cpAt){cpClock=cpSourceAt;if(cpAt!==0)cpClock=cpLocal*cpSourceAt/cpAt;}else cpClock=cpSourceAt+(cpLocal-cpAt)*(cpEnd-cpSourceAt)/(outPoint-inPoint-cpAt);}cpClock";
  return code+"cpIn=cpFindMarker(thisLayer,'in');cpOut=cpFindMarker(thisLayer,'out');cpSourceIn=cpFindMarker(source,'in');cpSourceOut=cpFindMarker(source,'out');var cpAtIn=0,cpAtOut=outPoint-inPoint,cpSrcIn=0,cpSrcOut=cpEnd;if(cpIn)cpAtIn=cpIn.time-inPoint;if(cpOut)cpAtOut=cpOut.time-inPoint;if(cpSourceIn)cpSrcIn=cpSourceIn.time+cpSourceIn.duration;if(cpSourceOut)cpSrcOut=cpSourceOut.time;if(time>outPoint)cpClock=cpEnd;else if(cpLocal<=cpAtIn){cpClock=cpSrcIn;if(cpAtIn!==0)cpClock=cpLocal*cpSrcIn/cpAtIn;}else if(cpLocal<=cpAtOut)cpClock=cpSrcIn+(cpLocal-cpAtIn)*(cpSrcOut-cpSrcIn)/(cpAtOut-cpAtIn);else cpClock=cpSrcOut+(cpLocal-cpAtOut)*(cpEnd-cpSrcOut)/(outPoint-inPoint-cpAtOut);cpClock";
 }
 $.cpTimeline={version:1,read:read,validate:validate,ensure:ensure,set:set,remove:remove,serialize:serialize,restore:restore,scanCode:scanCode,phaseCode:phaseCode,clockCode:clockCode};
})();
