(function(scope){
 'use strict';
 function fail(code,message){var e=new Error(message);e.code=code;return e;}
 function create(options){
  var req=options.nodeRequire||(scope.cep_node&&scope.cep_node.require)||(typeof require==='function'&&require),fs=req('fs'),path=req('path'),crypto=req('crypto'),process=req('process');
  var root=path.resolve(options.root),owners=path.join(root,'.lease-owners'),owner=options.ownerId||crypto.randomBytes(16).toString('hex'),key=crypto.createHash('sha256').update(String(options.windowId||owner)).digest('hex'),sessionFile=path.join(owners,key+'.json'),initial=null;
  function io(name,args){return new Promise(function(resolve,reject){fs[name].apply(fs,args.concat(function(e,v){if(e)reject(e);else resolve(v);}));});}
  function inside(file){var rel=path.relative(root,path.resolve(file));if(rel==='..'||rel.indexOf('..'+path.sep)===0||path.isAbsolute(rel))throw fail('LEASE_PATH','저장 경로가 사용자 폴더를 벗어납니다.');}
  async function read(file){var s=await io('lstat',[file]);if(!s.isFile()||s.isSymbolicLink()||s.size>8192)throw fail('LEASE_BUSY','저장 잠금 파일을 확인할 수 없습니다.');return JSON.parse(await io('readFile',[file,'utf8']));}
  async function initialize(){
   if(!initial)initial=(async function(){await io('mkdir',[owners,{recursive:true}]);var realRoot=await io('realpath',[root]),real=await io('realpath',[owners]);if(path.relative(realRoot,real)!=='.lease-owners')throw fail('LEASE_PATH','저장 잠금 폴더의 경로가 바뀌었습니다.');var tmp=sessionFile+'.tmp-'+owner;try{await io('writeFile',[tmp,JSON.stringify({v:1,pid:process.pid,owner:owner}),{flag:'wx'}]);await io('rename',[tmp,sessionFile]);}finally{try{await io('unlink',[tmp]);}catch(e){if(e.code!=='ENOENT')throw e;}}})();
   return initial;
  }
  async function sessionAlive(record){
   if(!record||record.v!==1||!Number.isSafeInteger(record.pid)||record.pid<1||typeof record.owner!=='string'||!/^[a-f0-9]{64}$/.test(record.windowKey||''))return true;
   try{process.kill(record.pid,0);}catch(e){if(e.code==='ESRCH')return false;return true;}
   try{var current=await read(path.join(owners,record.windowKey+'.json'));return current.closed!==true&&current.pid===record.pid&&current.owner===record.owner;}catch(e){return e.code==='ENOENT'?false:true;}
  }
  async function acquire(file,depth){
   inside(file);await initialize();var ownSession=await read(sessionFile);if(ownSession.owner!==owner||ownSession.closed)throw fail('LEASE_LOST','이전 패널의 저장 요청은 취소되었습니다.');
   var record={v:1,pid:process.pid,owner:owner,windowKey:key,token:crypto.randomBytes(16).toString('hex')},recovery=null;
   try{await io('writeFile',[file,JSON.stringify(record),{flag:'wx'}]);}
   catch(e){
    if(e.code!=='EEXIST')throw e;var prior;try{prior=await read(file);}catch(ignore){throw fail('LEASE_BUSY','다른 작업의 저장 잠금을 확인할 수 없습니다.');}
    if(await sessionAlive(prior))throw fail('LEASE_BUSY','다른 패널에서 저장 중입니다. 잠시 뒤 다시 시도하세요.');
    if((depth||0)>=4)throw fail('LEASE_BUSY','저장 복구 작업이 겹쳤습니다. 다시 시도하세요.');
    recovery=await acquire(file+'.recovery',(depth||0)+1);
    try{var latest;try{latest=await read(file);}catch(missing){if(missing.code!=='ENOENT')throw missing;}
      if(latest&&await sessionAlive(latest))throw fail('LEASE_BUSY','다른 패널에서 저장 중입니다.');
      if(latest)await io('unlink',[file]);await io('writeFile',[file,JSON.stringify(record),{flag:'wx'}]);
    }finally{await recovery.release();}
   }
   return{assert:async function(){var current=await read(file),session=await read(sessionFile);if(current.token!==record.token||session.owner!==owner||session.closed)throw fail('LEASE_LOST','패널이 다시 열려 이전 저장 작업을 중단했습니다.');},release:async function(){try{var current=await read(file);if(current.token===record.token)await io('unlink',[file]);}catch(e){if(e.code!=='ENOENT')throw e;}}};
  }
  return{acquire:acquire,dispose:function(){try{var current=JSON.parse(fs.readFileSync(sessionFile,'utf8'));if(current.owner===owner){current.closed=true;fs.writeFileSync(sessionFile,JSON.stringify(current));}}catch(ignore){}}};
 }
 var api={create:create};scope.ContentriumFileLease=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
}(typeof window!=='undefined'?window:globalThis));
