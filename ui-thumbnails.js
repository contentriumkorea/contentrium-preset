(function(scope){
  'use strict';
  var WIDTH=320,HEIGHT=180,FRAMES=12,VERSION='sprite-v1';
  function error(code,message){var e=new Error(message);e.code=code;return e;}
  function abort(signal){if(signal&&signal.aborted)throw error('ABORT_ERR','미리보기 생성을 취소했습니다.');}
  function times(start,duration,count){var result=[];for(var i=0;i<count;i++)result.push(start+Math.max(0,duration-.04)*i/Math.max(1,count-1));return result;}
  async function readNativeFrame(file,config,signal){
    var req=config.nodeRequire||(scope.cep_node&&scope.cep_node.require)||(typeof require==='function'&&require),fs=req('fs'),began=Date.now(),timeout=config.frameTimeout||60000;
    while(Date.now()-began<timeout){abort(signal);try{var bytes=await new Promise(function(resolve,reject){fs.readFile(file,function(e,b){if(e)reject(e);else resolve(b);});});abort(signal);if(bytes.length>134217728)throw error('THUMBNAIL_FORMAT','컴포지션 프레임 파일이 너무 큽니다.');if(bytes.length>=36&&bytes.slice(0,8).toString('hex')==='89504e470d0a1a0a'&&bytes.slice(-12).toString('hex')==='0000000049454e44ae426082')return bytes;}catch(e){if(['ENOENT','EACCES','EPERM','EBUSY'].indexOf(e.code)<0)throw e;}
      await new Promise(function(resolve){setTimeout(resolve,100);});
    }throw error('THUMBNAIL_RENDER','컴포지션 PNG 저장이 끝나지 않았습니다. 다시 시도하세요.');
  }
  function validate(bytes){if(bytes.length<24||bytes.length>32*1024*1024||bytes.slice(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.toString('ascii',12,16)!=='IHDR'||bytes.readUInt32BE(16)!==WIDTH||bytes.readUInt32BE(20)!==HEIGHT*FRAMES)throw error('THUMBNAIL_FORMAT','렌더된 미리보기 이미지가 올바르지 않습니다.');}
  async function spriteBytes(artifact){
    var req=(scope.cep_node&&scope.cep_node.require)||(typeof require==='function'&&require);
    if(!req)throw error('THUMBNAIL_UNAVAILABLE','로컬 미리보기를 읽을 수 없습니다.');
    var fs=req('fs'),path=req('path'),crypto=req('crypto');
    if(!artifact||typeof artifact.file!=='string'||!path.isAbsolute(artifact.file)||typeof artifact.sha256!=='string'||!/^[a-f0-9]{64}$/.test(artifact.sha256)||artifact.width!==WIDTH||artifact.height!==HEIGHT||artifact.frames!==FRAMES)throw error('THUMBNAIL_FORMAT','검증된 미리보기 파일을 확인하세요.');
    var file=artifact.file,expectedHash=artifact.sha256,stat=await new Promise(function(resolve,reject){fs.lstat(file,function(e,v){if(e)reject(e);else resolve(v);});});
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size<24||stat.size>32*1024*1024)throw error('THUMBNAIL_PATH','미리보기 파일을 확인하세요.');
    var bytes=await new Promise(function(resolve,reject){fs.readFile(file,function(e,v){if(e)reject(e);else resolve(v);});});validate(bytes);
    if(crypto.createHash('sha256').update(bytes).digest('hex')!==expectedHash)throw error('THUMBNAIL_CACHE','미리보기 파일이 변경되었습니다.');return bytes;
  }
  function create(config){
    config=config||{};var req=config.nodeRequire||(scope.cep_node&&scope.cep_node.require)||(typeof require==='function'&&require);
    if(!req)throw error('THUMBNAIL_UNAVAILABLE','로컬 미리보기 저장 기능을 사용할 수 없습니다.');
    var fs=req('fs'),path=req('path'),crypto=req('crypto'),url=req('url'),BufferType=req('buffer').Buffer,queue=[],jobs=new Map(),listeners=new Set(),workerSelections=new Map(),working=false,disposed=false,generation=0,render=config.render||createRenderer(config);
    if(typeof config.cacheRoot!=='string'||!path.isAbsolute(config.cacheRoot))throw error('THUMBNAIL_PATH','미리보기 저장 폴더가 올바르지 않습니다.');
    var root=path.resolve(config.cacheRoot),directory=path.join(root,'v1'),leaseAPI=scope.ContentriumFileLease||(typeof require==='function'&&require('./ui-file-lease.js')),leases=config.leases||leaseAPI.create({root:root,nodeRequire:req}),destinationLeases=new Map();
    function io(method,args){return new Promise(function(resolve,reject){fs[method].apply(fs,args.concat(function(e,v){if(e)reject(e);else resolve(v);}));});}
    function sha(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
    async function safeDirectory(dir){
      var parent=path.dirname(dir);if(parent!==dir)await safeDirectory(parent);
      try{var stat=await io('lstat',[dir]);if(!stat.isDirectory()||stat.isSymbolicLink())throw error('THUMBNAIL_PATH','미리보기 저장 폴더의 링크를 사용할 수 없습니다.');}
      catch(e){if(e.code!=='ENOENT')throw e;try{await io('mkdir',[dir]);}catch(again){if(again.code!=='EEXIST')throw again;}var verified=await io('lstat',[dir]);if(!verified.isDirectory()||verified.isSymbolicLink())throw error('THUMBNAIL_PATH','미리보기 저장 경로가 바뀌었습니다.');}
    }
    async function regular(file){var s=await io('lstat',[file]);if(!s.isFile()||s.isSymbolicLink())throw error('THUMBNAIL_PATH','미리보기 파일의 링크를 사용할 수 없습니다.');return s;}
    function fileHash(file,signal){return new Promise(function(resolve,reject){
      var hash=crypto.createHash('sha256'),stream=fs.createReadStream(file),onAbort=function(){stream.destroy(error('ABORT_ERR','취소했습니다.'));};
      if(signal){if(signal.aborted)return reject(error('ABORT_ERR','취소했습니다.'));signal.addEventListener('abort',onAbort,{once:true});}
      function finish(){if(signal)signal.removeEventListener('abort',onAbort);}
      stream.on('data',function(chunk){hash.update(chunk);});stream.on('error',function(e){finish();reject(e);});stream.on('end',function(){finish();resolve(hash.digest('hex'));});
    });}
    async function inspect(item,options,signal){
      options=options||{};if(!item||typeof item.id!=='string'||!item.id||item.id.length>256||item.missing||item.ambiguous||typeof item.path!=='string'||!path.isAbsolute(item.path))throw error('THUMBNAIL_SOURCE','원본 파일을 확인하세요.');
      var files=item.kind==='image-sequence'&&item.sequence?item.sequence.files.map(function(f){return f.path;}):[item.path];
      if(!files.length||files.length>20000)throw error('THUMBNAIL_SOURCE','시퀀스 파일 수를 확인하세요.');
      var hashes=[];for(var i=0;i<files.length;i++){abort(signal);if(!path.isAbsolute(files[i]))throw error('THUMBNAIL_SOURCE','절대 파일 경로가 필요합니다.');var stat=await io('stat',[files[i]]);if(!stat.isFile())throw error('THUMBNAIL_SOURCE','원본 파일이 없습니다.');hashes.push([path.resolve(files[i]),stat.size,await fileHash(files[i],signal)]);}
      var fingerprint=sha(JSON.stringify(hashes)),identity=sha(JSON.stringify([VERSION,item.id,item.kind,fingerprint]));
      return{key:identity,fingerprint:fingerprint,files:files,width:WIDTH,height:HEIGHT,frames:FRAMES,item:item,options:options};
    }
    async function readCache(plan){
      try{var manifest=path.join(plan.directory,plan.key+'.json');await regular(manifest);var meta=JSON.parse(await io('readFile',[manifest,'utf8']));
        if(meta.schemaVersion!==1||meta.key!==plan.key||meta.fingerprint!==plan.fingerprint||!/^[a-f0-9]{64}$/.test(meta.sha256)||meta.file!==plan.key+'-'+meta.sha256+'.png'||meta.frames!==FRAMES||meta.width!==WIDTH||meta.height!==HEIGHT||['media','composition','aep-worker'].indexOf(meta.origin)<0||meta.origin==='aep-worker'&&(!plan.nativeCacheKey||meta.nativeCacheKey!==plan.nativeCacheKey))return null;
        var file=path.join(plan.directory,meta.file);await regular(file);var bytes=await io('readFile',[file]);validate(bytes);if(sha(bytes)!==meta.sha256)return null;
        var artifact={file:file,url:url.pathToFileURL(file).href,width:WIDTH,height:HEIGHT,frames:FRAMES,origin:meta.origin,sha256:meta.sha256};if(meta.origin==='aep-worker')artifact.selection=plan.nativeSelection;return artifact;
      }catch(e){if(e.code==='THUMBNAIL_PATH')throw e;return null;}
    }
    function canonical(file){return path.resolve(file).replace(/\\/g,'/').replace(/\/+$/,'').toLowerCase();}
    async function destination(item,signal){
      abort(signal);
      if(!config.resolveDestination)return{root:root,directory:directory,identity:null,policy:'localCache'};
      var value=await config.resolveDestination(item);abort(signal);
      if(!value||value.schemaVersion!==1||value.itemId!==item.id||!item.sourceStamp||JSON.stringify(value.sourceStamp)!==JSON.stringify(item.sourceStamp)||['localCache','userFolder'].indexOf(value.previewsLocation)<0||typeof value.registrationIdentity!=='string'||!value.registrationIdentity||value.allowFallback!==false||value.onUnwritable!=='error'||value.requiresWritableCheck!==true)throw error('THUMBNAIL_DESTINATION','미리보기 저장 위치가 변경되었거나 올바르지 않습니다.');
      var expected=root;
      if(value.folderId!==null){
        if(typeof value.folderId!=='string'||typeof value.registeredRoot!=='string'||!path.isAbsolute(value.registeredRoot)||value.canonicalRoot!==canonical(value.registeredRoot))throw error('THUMBNAIL_DESTINATION','등록 폴더를 확인하세요.');
        var relative=path.relative(value.registeredRoot,item.path);if(!relative||relative==='..'||relative.indexOf('..'+path.sep)===0||path.isAbsolute(relative))throw error('THUMBNAIL_DESTINATION','원본이 등록 폴더를 벗어납니다.');
      }else if(value.registeredRoot!==null||value.canonicalRoot!==null||value.previewsLocation!=='localCache')throw error('THUMBNAIL_DESTINATION','저장한 프리셋의 위치를 확인하세요.');
      if(value.previewsLocation==='userFolder')expected=path.join(value.registeredRoot,'.contentrium-preset-previews');
      if(typeof value.outputRoot!=='string'||!path.isAbsolute(value.outputRoot)||canonical(value.outputRoot)!==canonical(expected)||value.canonicalOutputRoot!==canonical(expected))throw error('THUMBNAIL_DESTINATION','허용된 미리보기 저장 폴더가 아닙니다.');
      return{root:path.resolve(expected),directory:path.join(expected,'v1'),identity:value.registrationIdentity,policy:value.previewsLocation};
    }
    async function verifyDestination(plan,signal){
      var current=await destination(plan.item,signal);
      if(current.identity!==plan.destination.identity||canonical(current.root)!==canonical(plan.destination.root)||current.policy!==plan.destination.policy)throw error('THUMBNAIL_DESTINATION_CHANGED','미리보기 저장 위치가 변경되었습니다.');
      await safeDirectory(plan.directory);abort(signal);
    }
    function planLeases(plan){
      if(!config.resolveDestination)return leases;
      var key=canonical(plan.destination.root),instance=destinationLeases.get(key);
      if(!instance){instance=leaseAPI.create({root:plan.destination.root,nodeRequire:req,windowId:config.windowId,ownerId:config.ownerId});destinationLeases.set(key,instance);}return instance;
    }
    function snapshot(job){var value={id:job.item.id,state:job.state,completedFrames:job.completed||0,totalFrames:FRAMES,artifact:job.artifact||null,error:job.error||null,remaining:jobs.size};if(job.requestKey)value.requestKey=job.requestKey;if(job.selection)value.selection=job.selection;return value;}
    function workerEnabled(item,options){return config.worker&&config.worker.enabled===true&&item.kind==='project'&&!(options&&options.capture);}
    function canSelectPreview(item){return !disposed&&!!item&&item.kind==='project'&&!!item.id&&!!item.sourceStamp&&!!config.worker&&config.worker.enabled===true;}
    function savedSelection(item){var value=workerSelections.get(item.id);return value&&value.stamp===JSON.stringify(item.sourceStamp)?value.selection:null;}
    function requestKey(item,options){if(!workerEnabled(item,options))return null;var current=jobs.get(item.id);if(current&&!current.options.selectPreview&&!(options&&options.selectPreview)&&!(options&&options.workerSelection)&&!(options&&options.resetWorkerChoice)&&JSON.stringify(current.item.sourceStamp)===JSON.stringify(item.sourceStamp))return current.requestKey;return sha(JSON.stringify(['aep-request-v1',item.id,item.sourceStamp,options&&options.selectPreview?'choose':(options&&options.workerSelection||savedSelection(item))]));}
    function emit(job){var view=snapshot(job);if(config.onChange)config.onChange(view);listeners.forEach(function(fn){fn(view);});}
    async function execute(job){
      var signal=job.controller.signal,lock=null,temp=null,nonce=crypto.randomBytes(12).toString('hex');
      try{
        abort(signal);var plan=await inspect(job.item,job.options,signal);job.plan=plan;plan.destination=await destination(job.item,signal);plan.directory=plan.destination.directory;await verifyDestination(plan,signal);
        var cached=await readCache(plan);abort(signal);await verifyDestination(plan,signal);if(cached&&!job.options.force&&!job.options.capture&&!job.options.workerSelection&&!job.options.selectPreview){job.artifact=cached;job.state='ready';return;}
        if(workerEnabled(job.item,job.options)){
          var prepared=await config.worker.prepare(job.item,{selection:job.workerSelection,signal:signal});abort(signal);
          if(job.options.selectPreview&&prepared.state==='renderable'){job.state='needs-selection';job.selection=prepared.selectionContext;return;}
          if(prepared.state==='needs-selection'){job.state='needs-selection';job.selection={sourceSha256:prepared.sourceSha256,manifestSha256:prepared.manifestSha256,choices:prepared.choices};return;}
          if(prepared.state!=='renderable'){job.state='unavailable';return;}
          plan.nativePlan=prepared;plan.nativeCacheKey=prepared.cacheKey;plan.nativeSelection=Object.assign({},prepared.selectionContext,{token:prepared.choice.token});
          workerSelections.set(job.item.id,{stamp:JSON.stringify(job.item.sourceStamp),selection:{sourceSha256:plan.nativeSelection.sourceSha256,manifestSha256:plan.nativeSelection.manifestSha256,token:prepared.choice.token}});
          plan.key=sha(JSON.stringify(['aep-sprite-v1',plan.key,prepared.cacheKey]));cached=await readCache(plan);abort(signal);await verifyDestination(plan,signal);if(cached&&!job.options.force){job.artifact=cached;job.state='ready';return;}
        }else if(!job.options.capture&&['video','image-sequence'].indexOf(job.item.kind)<0){job.state='unavailable';return;}
        try{lock=await planLeases(plan).acquire(path.join(plan.directory,plan.key+'.lock'));}catch(e){if(e.code==='LEASE_BUSY')throw error('THUMBNAIL_BUSY',e.message);throw e;}
        abort(signal);
        job.state='generating';emit(job);plan.signal=signal;plan.jobId=nonce;plan.progress=function(n){abort(signal);job.completed=n;emit(job);};
        var rendered=plan.nativePlan?await config.worker.render(plan.nativePlan,{signal:signal,progress:plan.progress}):await render(plan),bytes=BufferType.from(rendered);abort(signal);validate(bytes);
        if((await inspect(job.item,job.options,signal)).fingerprint!==plan.fingerprint)throw error('THUMBNAIL_SOURCE_CHANGED','생성 중 원본 파일이 바뀌었습니다. 다시 시도하세요.');
        var digest=sha(bytes),filename=plan.key+'-'+digest+'.png',target=path.join(plan.directory,filename);temp=target+'.tmp-'+nonce;
        await verifyDestination(plan,signal);await io('writeFile',[temp,bytes,{flag:'wx'}]);abort(signal);await verifyDestination(plan,signal);abort(signal);await lock.assert();abort(signal);await io('rename',[temp,target]);temp=null;
        var meta={schemaVersion:1,key:plan.key,fingerprint:plan.fingerprint,file:filename,sha256:digest,width:WIDTH,height:HEIGHT,frames:FRAMES,origin:plan.nativePlan?'aep-worker':(job.options.capture?'composition':'media')};if(plan.nativePlan)meta.nativeCacheKey=plan.nativeCacheKey;
        temp=path.join(plan.directory,plan.key+'.json.tmp-'+nonce);await verifyDestination(plan,signal);await io('writeFile',[temp,JSON.stringify(meta),{flag:'wx'}]);abort(signal);await verifyDestination(plan,signal);abort(signal);await lock.assert();abort(signal);await io('rename',[temp,path.join(plan.directory,plan.key+'.json')]);temp=null;
        cached=await readCache(plan);abort(signal);await verifyDestination(plan,signal);if(!cached)throw error('THUMBNAIL_CACHE','미리보기를 저장하지 못했습니다.');job.artifact=cached;job.state='ready';job.completed=FRAMES;
      }catch(e){var unknown=e.code==='WORKER_UNKNOWN'||e.code==='WORKER_PENDING';job.state=unknown?'failed':(signal.aborted||e.code==='ABORT_ERR'?'canceled':'failed');job.error={code:e.code||'THUMBNAIL_FAILED',message:unknown?'미리보기 작업의 종료를 확인하지 못했습니다. 중복 실행을 막기 위해 자동 생성을 중단했습니다.':String(e.message||e)};if(unknown)job.error.nativeState='unknown';}
      finally{if(temp)try{await io('unlink',[temp]);}catch(ignore){}if(lock)try{await lock.release();}catch(ignore){}if(disposed)destinationLeases.forEach(function(instance){instance.dispose();}); }
    }
    function settle(job){if(job.settled)return;if(job.running&&job.controller.signal.aborted&&!(job.error&&job.error.nativeState==='unknown')){job.state='canceled';job.artifact=null;if(!job.error)job.error={code:'ABORT_ERR',message:'미리보기 생성을 취소했습니다.'};}job.settled=true;if(jobs.get(job.item.id)===job)jobs.delete(job.item.id);emit(job);job.resolve(snapshot(job));}
    function cancel(job){job.controller.abort();if(!job.running&&!job.settled){var at=queue.indexOf(job);if(at>=0)queue.splice(at,1);job.state='canceled';settle(job);}}
    async function pump(){if(working||disposed)return;working=true;while(queue.length){var job=queue.shift();job.running=true;await execute(job);settle(job);}working=false;if(config.onIdle)config.onIdle();}
    function attach(job,consumer){if(consumer){job.consumers.add(consumer);consumer.job=job;}else job.explicit=true;}
    function request(item,options,consumer,requestedGeneration){
      if(options&&options.selectPreview&&(!canSelectPreview(item)||options.capture||options.workerSelection||options.force))return Promise.resolve({id:item&&item.id,state:'unavailable'});
      if(requestedGeneration===undefined){requestedGeneration=generation;if(workerEnabled(item,options)){item=JSON.parse(JSON.stringify(item));options=Object.assign({},options);if(options.workerSelection)options.workerSelection=JSON.parse(JSON.stringify(options.workerSelection));}}
      if(disposed||requestedGeneration!==generation||options&&options.expectedGeneration!==undefined&&options.expectedGeneration!==generation||consumer&&!consumer.active)return Promise.resolve({id:item&&item.id,state:'canceled'});
      if(options&&options.resetWorkerChoice)workerSelections.delete(item.id);var identity=requestKey(item,options);
      var current=jobs.get(item.id);
      if(current){
        attach(current,consumer);if(identity!==current.requestKey){cancel(current);return current.promise.then(function(){return request(item,options,consumer,requestedGeneration);});}
        if(current.controller.signal.aborted||options&&(options.revalidate||options.capture&&!current.options.capture||options.force&&!current.options.force))return current.promise.then(function(){return request(item,options,consumer,requestedGeneration);});
        return current.promise;
      }
      var job={item:item,options:options||{},requestKey:identity,workerSelection:options&&options.selectPreview?null:(options&&options.workerSelection||savedSelection(item)),controller:new AbortController(),state:'waiting',completed:0,consumers:new Set(),explicit:false};attach(job,consumer);
      job.promise=new Promise(function(resolve){job.resolve=resolve;});jobs.set(item.id,job);queue.push(job);emit(job);pump();return job.promise;
    }
    function acquire(item,options){if(options&&options.resetWorkerChoice)workerSelections.delete(item.id);var consumer={active:true,job:null},identity=requestKey(item,options),promise=request(item,options,consumer);return{requestKey:identity,promise:promise,release:function(){if(!consumer.active)return;consumer.active=false;var job=consumer.job;if(job){job.consumers.delete(consumer);if(!job.settled&&!job.explicit&&!job.consumers.size)cancel(job);}}};}
    return{request:function(item,options){return request(item,options,null);},canSelectPreview:canSelectPreview,acquire:acquire,inspect:inspect,setRenderer:function(fn){render=fn;},subscribe:function(fn){listeners.add(fn);return function(){listeners.delete(fn);};},cancelAll:function(){generation++;jobs.forEach(cancel);},destroy:function(){disposed=true;jobs.forEach(cancel);listeners.clear();destinationLeases.forEach(function(instance){instance.dispose();});if(!config.leases)leases.dispose();if(config.worker&&typeof config.worker.dispose==='function')config.worker.dispose();},get generation(){return generation;},get remaining(){return jobs.size;}};
  }
  function createRenderer(config){
    config=config||{};
    return async function render(plan){
      var doc=config.document||scope.document,canvas=doc.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT*FRAMES;var ctx=canvas.getContext('2d'),video=null,temporary=[],images=[],objectURLs=[],failure=null;
      function local(file){var lib=scope.ContentriumLibrary;if(lib)return lib.mediaSource({path:file});var req=config.nodeRequire||(scope.cep_node&&scope.cep_node.require)||(typeof require==='function'&&require);return req('url').pathToFileURL(file).href;}
      function wait(media,event,run){return new Promise(function(resolve,reject){var timer=setTimeout(function(){finish(error('THUMBNAIL_TIMEOUT','미디어 응답 시간이 초과되었습니다.'));},15000);function cancel(){finish(error('ABORT_ERR','취소했습니다.'));}function loaded(){finish();}function failed(){finish(error('THUMBNAIL_DECODE','이 파일을 미리보기로 읽을 수 없습니다. AE 가져오기는 별도로 사용할 수 있습니다.'));}function finish(e){clearTimeout(timer);media.removeEventListener(event,loaded);media.removeEventListener('error',failed);plan.signal.removeEventListener('abort',cancel);if(e)reject(e);else resolve();}media.addEventListener(event,loaded);media.addEventListener('error',failed);plan.signal.addEventListener('abort',cancel,{once:true});try{abort(plan.signal);run();}catch(e){finish(e);}});}
      async function image(file,nativeFrame){var img=doc.createElement('img'),source=local(file);images.push(img);
        if(nativeFrame){var bytes=config.readFrame?await config.readFrame(file):await readNativeFrame(file,config,plan.signal);source=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'image/png'}));objectURLs.push(source);}
        await wait(img,'load',function(){img.src=source;});if(plan.options.nativeFrames&&(img.naturalWidth!==plan.options.nativeFrames.width||img.naturalHeight!==plan.options.nativeFrames.height))throw error('THUMBNAIL_GEOMETRY','렌더된 프레임의 크기가 선택한 컴포지션과 다릅니다.');return img;}
      function paint(media,index){var w=media.videoWidth||media.naturalWidth,h=media.videoHeight||media.naturalHeight;if(!w||!h)throw error('THUMBNAIL_DECODE','이미지 크기를 읽을 수 없습니다.');var scale=Math.min(WIDTH/w,HEIGHT/h);ctx.drawImage(media,(WIDTH-w*scale)/2,index*HEIGHT+(HEIGHT-h*scale)/2,w*scale,h*scale);}
      try{
        var sampleTimes=null;if(plan.options.capture){var c=plan.options.capture;sampleTimes=times(c.start||0,c.duration,FRAMES);}
        else if(plan.item.kind==='video'){video=doc.createElement('video');video.muted=true;video.preload='auto';await wait(video,'loadeddata',function(){video.src=local(plan.files[0]);video.load();});if(!Number.isFinite(video.duration)||video.duration<=0)throw error('THUMBNAIL_DURATION','영상 길이를 읽을 수 없습니다.');sampleTimes=times(0,video.duration,FRAMES);}
        for(var i=0;i<FRAMES;i++){
          abort(plan.signal);var frame;
          if(plan.options.nativeFrames)frame=await image(plan.files[i],true);
          else if(plan.options.capture){if(typeof config.captureFrame!=='function')throw error('THUMBNAIL_UNAVAILABLE','컴포지션 미리보기 연결이 없습니다.');var result=await config.captureFrame(Object.assign({},plan.options.capture,{jobId:plan.jobId,frameIndex:i,time:sampleTimes[i]}));temporary.push(result.path);abort(plan.signal);frame=await image(result.path,true);}
          else if(video){if(Math.abs(video.currentTime-sampleTimes[i])>.0001)await wait(video,'seeked',function(){video.currentTime=sampleTimes[i];});frame=video;}
          else frame=await image(plan.files[Math.round((plan.files.length-1)*i/(FRAMES-1))]);
          paint(frame,i);plan.progress(i+1);
        }
        abort(plan.signal);var blob=await new Promise(function(resolve){canvas.toBlob(resolve,'image/png');});if(!blob)throw error('THUMBNAIL_FORMAT','미리보기 이미지를 만들 수 없습니다.');return new Uint8Array(await blob.arrayBuffer());
      }catch(e){failure=e;throw e;}finally{if(video){video.pause();video.removeAttribute('src');video.load();}images.forEach(function(img){img.removeAttribute('src');});objectURLs.forEach(function(url){URL.revokeObjectURL(url);});canvas.width=canvas.height=1;if(config.cleanupFrames&&plan.options.capture)try{await config.cleanupFrames(plan.jobId,temporary);}catch(cleanup){if(!failure)throw cleanup;failure.message+=' · 임시 프레임 정리: '+cleanup.message;failure.cleanupError=cleanup.message;}}
    };
  }
  async function renderNativeFrames(input,config){
    if(!input||!Array.isArray(input.paths)||input.paths.length!==FRAMES||!input.paths.every(function(p){return typeof p==='string'&&p.length>0;})||!Number.isInteger(input.width)||!Number.isInteger(input.height)||input.width<1||input.height<1||input.width>1920||input.height>1920||input.width*input.height>2073600)throw error('THUMBNAIL_GEOMETRY','검증된 12개 프레임과 컴포지션 크기가 필요합니다.');
    var signal=input.signal||new AbortController().signal;abort(signal);return createRenderer(config)({files:input.paths.slice(),item:{kind:'project'},options:{nativeFrames:{width:input.width,height:input.height}},signal:signal,progress:input.progress||function(){}});
  }
  function mountSprite(root,artifact){
    var img=scope.document.createElement('img'),index=Math.floor(FRAMES/2),active=true,destroyed=false,decoded=false,objectURL=null,URLAPI=scope.URL,BlobAPI=scope.Blob;
    img.className='library-sprite';img.alt='마우스를 움직여 미리보기';img.draggable=false;root.textContent='';root.dataset.previewState='loading';root.appendChild(img);root.classList.add('library-sprite-wrap');
    function release(){if(objectURL!==null){var owned=objectURL;objectURL=null;URLAPI.revokeObjectURL(owned);}}
    function show(value){index=Math.max(0,Math.min(FRAMES-1,value));img.style.height=FRAMES*100+'%';img.style.transform='translateY(-'+(index*100/FRAMES)+'%)';root.dataset.spriteFrame=String(index);}
    function move(e){if(!active||destroyed)return;var r=root.getBoundingClientRect();show(Math.floor((e.clientX-r.left)/Math.max(1,r.width)*FRAMES));}
    function failed(){if(destroyed)return;decoded=false;release();img.removeAttribute('src');img.alt='미리보기를 불러오지 못했습니다.';root.dataset.previewState='failed';}
    img.onload=function(){if(!destroyed&&objectURL!==null){decoded=true;root.dataset.previewState='ready';}};img.onerror=failed;root.addEventListener('pointermove',move);show(index);
    spriteBytes(artifact).then(function(bytes){
      if(destroyed)return;if(!URLAPI||typeof URLAPI.createObjectURL!=='function'||typeof URLAPI.revokeObjectURL!=='function'||typeof BlobAPI!=='function')throw error('THUMBNAIL_UNAVAILABLE','이미지 미리보기를 표시할 수 없습니다.');
      var owned=URLAPI.createObjectURL(new BlobAPI([new Uint8Array(bytes)],{type:'image/png'}));if(destroyed){URLAPI.revokeObjectURL(owned);return;}objectURL=owned;img.src=owned;
    }).catch(failed);
    return{get ready(){return !destroyed&&decoded&&objectURL!==null;},setActive:function(v){if(!destroyed)active=!!v;},destroy:function(){if(destroyed)return;destroyed=true;img.onload=img.onerror=null;root.removeEventListener('pointermove',move);root.classList.remove('library-sprite-wrap');img.removeAttribute('src');release();img.remove();}};
  }

  var api={create:create,createRenderer:createRenderer,renderNativeFrames:renderNativeFrames,readNativeFrame:readNativeFrame,mountSprite:mountSprite,times:times};scope.ContentriumThumbnails=api;if(typeof module==='object'&&module.exports)module.exports=api;
}(typeof window!=='undefined'?window:globalThis));
