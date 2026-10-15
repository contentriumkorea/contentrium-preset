(function(){
 var root=File($.fileName).parent.parent.fsName;
 function array(v){return Object.prototype.toString.call(v)==='[object Array]';}
 function quote(s){return '"'+String(s).replace(/[\\"\x00-\x1f]/g,function(c){var m={'"':'\\"','\\':'\\\\','\n':'\\n','\r':'\\r','\t':'\\t'};return m[c]||'\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4);})+'"';}
 function json(v){if(v===null||typeof v==='undefined')return 'null';if(typeof v==='string')return quote(v);if(typeof v==='number')return isFinite(v)?String(v):'null';if(typeof v==='boolean')return String(v);var a=[],i,k;if(array(v)){for(i=0;i<v.length;i++)a.push(json(v[i]));return '['+a.join(',')+']';}for(k in v)if(v.hasOwnProperty(k)&&typeof v[k]!=='function')a.push(quote(k)+':'+json(v[k]));return '{'+a.join(',')+'}';}
 function parse(s){if(typeof JSON!=='undefined'&&JSON.parse)return JSON.parse(s);if(/^[\],:{}\s]*$/.test(String(s).replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g,'@').replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,']').replace(/(?:^|:|,)(?:\s*\[)+/g,'')))return eval('('+s+')');throw new Error('Invalid JSON');}
 function readCatalog(){var f=new File(root+'/library/catalog.json');f.encoding='UTF-8';if(!f.open('r'))throw new Error('프리셋 목록을 읽을 수 없습니다.');var s=f.read();f.close();return parse(s);}
 function load(name){var f=new File(root+'/jsx/'+name+'.jsx');if(!f.exists)throw new Error('설치 파일이 없습니다: '+name);$.evalFile(f);}
 load('presets');load('overlay-engine');load('precomp-engine');
 var catalog=readCatalog();
 function comp(){var c=app.project&&app.project.activeItem;if(!(c instanceof CompItem))throw new Error('컴포지션을 열어주세요.');return c;}
 function find(id){for(var i=0;i<catalog.entries.length;i++)for(var j=0;j<catalog.entries[i].variants.length;j++)if(catalog.entries[i].variants[j].id===id)return{entry:catalog.entries[i],variant:catalog.entries[i].variants[j]};throw new Error('프리셋을 찾을 수 없습니다.');}
 function label(id){var f=find(id);return f.entry.name+(f.variant.name!==f.entry.name?' / '+f.variant.name:'');}
 function selected(c){var result=[];for(var i=0;i<c.selectedLayers.length;i++)result.push(c.selectedLayers[i]);return result;}
 function status(){var c=app.project&&app.project.activeItem;return{version:app.version,hasComposition:c instanceof CompItem,selectedLayers:c instanceof CompItem?c.selectedLayers.length:0,capabilities:{captureUserPreset:false}};}
 function getState(){
  var c=app.project&&app.project.activeItem,ls=c instanceof CompItem?selected(c):[],controls=[],applied=[],i,j,list,ins;
  for(i=0;i<ls.length;i++){
   list=$.cpOverlay.controls(ls[i])||[];
   for(j=0;j<list.length;j++){var o=list[j];o.id='overlay:'+ls[i].index+':'+o.id;controls.push(o);}
   ins=$.cpOverlay.instances(ls[i])||[];for(j=0;j<ins.length;j++)applied.push({id:'overlay:'+ls[i].index+':'+(ins[j].instanceId||ins[j].id),name:label(ins[j].variantId)});
   ins=$.cpPrecomp.instances(ls[i])||[];for(j=0;j<ins.length;j++)applied.push({id:'precomp:'+ls[i].index+':'+ins[j].instanceId,name:label(ins[j].variantId)});
  }
  if(ls.length){list=$.cpPrecomp.controls(ls)||[];for(j=0;j<list.length;j++){list[j].id='precomp:'+list[j].id;controls.push(list[j]);}}
  return{numSelectedLayers:ls.length,selectedLayerName:ls.length===1?ls[0].name:ls.length+' layers',controls:controls,applied:applied};
 }
 function apply(options){
  var c=comp(),f=find(options.variantId),variant=f.variant,entry=f.entry,targets=selected(c),i,receipts=[],result;
  if(variant.available!==true)throw new Error('이 프리셋은 사용할 수 없습니다.');
  if(variant.type!==10&&!targets.length)throw new Error('프리셋을 적용할 레이어를 선택하세요.');
  var recipe=variant.type===10?null:$.cpPresetBuilder.build(variant,entry);
  if(recipe&&recipe.text)for(i=0;i<targets.length;i++)if(!(targets[i] instanceof TextLayer))throw new Error('텍스트 프리셋은 텍스트 레이어에 적용해주세요.');
  if(recipe&&$.cpOverlay.preflight)for(i=0;i<targets.length;i++)$.cpOverlay.preflight(targets[i],recipe,options);
  app.beginUndoGroup('Contentrium Preset - '+entry.name);
  try{
   if(variant.type===10){variant.title=entry.name;result=$.cpPrecomp.apply(c,variant,{direction:options.direction||'both',time:c.time,duration:options.duration},root);targets=result.layers;}
   else for(i=0;i<targets.length;i++)receipts.push($.cpOverlay.apply(targets[i],recipe,{direction:options.direction||'both',inDuration:options.inDuration,outDuration:options.outDuration,undoGroup:false}));
   for(i=1;i<=c.numLayers;i++)c.layer(i).selected=false;for(i=0;i<targets.length;i++)targets[i].selected=true;
   return{appliedLayers:targets.length,receipts:receipts,variantId:variant.id,instanceId:result?result.instanceId:null};
  }finally{app.endUndoGroup();}
 }
 function setControl(options){var c=comp(),parts=String(options.id).split(':'),kind=parts.shift(),layer,index;if(kind==='overlay'){index=Number(parts.shift());layer=c.layer(index);return $.cpOverlay.setControl(layer,parts.join(':'),options.value);}if(kind==='precomp'){for(var i=1;i<=c.numLayers;i++)if(String(c.layer(i).id)===parts[1])layer=c.layer(i);if(!layer)throw new Error('선택한 레이어가 변경되었습니다.');app.beginUndoGroup('Contentrium Preset - Control');try{return $.cpPrecomp.setControl(layer,parts.join(':'),options.value);}finally{app.endUndoGroup();}}throw new Error('컨트롤을 찾을 수 없습니다.');}
 function remove(options){var c=comp(),parts=String(options.id).split(':'),layer=c.layer(Number(parts[1])),id=parts.slice(2).join(':');if(parts[0]==='overlay')return $.cpOverlay.remove(layer,id);if(parts[0]==='precomp'){app.beginUndoGroup('Contentrium Preset - Remove');try{return $.cpPrecomp.remove(layer,id);}finally{app.endUndoGroup();}}throw new Error('적용된 프리셋을 찾을 수 없습니다.');}
 $.contentriumPreset={root:root,json:json,parse:parse,call:function(method,payload){try{var options=parse(payload||'{}'),result;if(method==='hostStatus')result=status();else if(method==='getState')result=getState();else if(method==='applyPreset')result=apply(options);else if(method==='setControl')result=setControl(options);else if(method==='removePreset')result=remove(options);else throw new Error('지원하지 않는 명령: '+method);return json({ok:true,result:result});}catch(error){return json({ok:false,error:{code:error.code||'HOST_ERROR',message:String(error.message||error),line:error.line||0}});}}};
})();
