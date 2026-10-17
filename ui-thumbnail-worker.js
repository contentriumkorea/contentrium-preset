(function(scope){
 'use strict';
 function create(config){
  config=config||{};
  if(config.enabled!==true)return{enabled:false,prepare:async function(){return{state:'unavailable'};},dispose:function(){}};
  var req=config.nodeRequire||(scope.cep_node&&scope.cep_node.require)||(typeof require==='function'&&require);
  return req(req('path').join(config.extensionPath,'thumbnail-worker','backend.cjs')).create(config,scope,req);
 }
 var api={create:create};scope.ContentriumThumbnailWorker=api;if(typeof module==='object'&&module.exports)module.exports=api;
}(typeof window!=='undefined'?window:globalThis));
