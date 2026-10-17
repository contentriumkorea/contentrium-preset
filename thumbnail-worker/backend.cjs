'use strict';
function failure(code){const e=Error(code);e.code=code;return e;}
function abort(signal){if(signal&&signal.aborted)throw failure('ABORT_ERR');}
function create(config,scope,req){
 const fs=req('fs'),path=req('path'),crypto=req('crypto'),process=req('process');
 const extension=path.resolve(config.extensionPath),runtime=path.join(extension,'thumbnail-worker'),contract=req(path.join(runtime,'worker-contract.cjs')),preparer=req(path.join(runtime,'prepare.cjs')),cancelModule=req(path.join(runtime,'cancel.cjs'));
 const policy=config.policy===undefined?'solid-v1':config.policy;if(!['solid-v1','solid-rect-v1'].includes(policy))throw failure('UNSUPPORTED_WORKER_POLICY');
 const workerRoot=path.resolve(config.workerRoot||path.join(process.env.APPDATA,'Contentrium','Preset','ThumbnailWorker')),owner=crypto.randomBytes(16).toString('hex'),windowId='aep:'+String(config.windowId),windowKey=contract.hash(windowId);
 const leaseApi=config.leaseApi||scope.ContentriumFileLease||req(path.join(extension,'ui-file-lease.js')),leases=leaseApi.create({root:workerRoot,windowId,ownerId:owner,nodeRequire:req});
 const pendingPath=path.join(workerRoot,'dispatch-pending.json'),discovery=new Map(),plans=new Map(),sourceStats=new WeakMap(),active=new Set();let busy=false,disposed=false;
 const codeFiles=['backend.cjs','worker-contract.cjs','prepare.cjs','cancel.cjs','jsx/thumbnail-worker.template.jsx'],runnerFiles=['launch.ps1','validate-result.ps1','worker-gate.ps1','host-binding.ps1'];
 function fingerprint(files){return contract.hash(files.map(name=>({name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(runtime,name))).digest('hex')})));}
 const codeHash=fingerprint(codeFiles),runnerHash=fingerprint(runnerFiles);
 function assertRuntime(){if(fingerprint(codeFiles)!==codeHash||fingerprint(runnerFiles)!==runnerHash)throw failure('WORKER_RUNTIME_CHANGED');}
 function json(file){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4194304)throw failure('WORKER_JOURNAL_INVALID');return JSON.parse(fs.readFileSync(file,'utf8'));}
 function noLinks(file){for(let current=path.resolve(file);;){if(fs.lstatSync(current).isSymbolicLink())throw failure('SOURCE_LINK_REFUSED');const parent=path.dirname(current);if(parent===current)break;current=parent;}}
 async function source(item,signal){
  abort(signal);if(disposed)throw failure('ABORT_ERR');
  const row=await config.resolveSource({id:item.id,sourceStamp:item.sourceStamp});abort(signal);
  if(!row||row.schemaVersion!==1||row.id!==item.id||row.kind!=='project'||row.missing!==false||row.ambiguous!==false||contract.ordered(row.sourceStamp)!==contract.ordered(item.sourceStamp))throw failure('CURRENT_REGISTERED_PROJECT_REQUIRED');
  contract.bindSource({registered:true,missing:false,ambiguous:false,nonLink:true,libraryId:row.id,path:row.path,kind:row.kind,sourceStamp:row.sourceStamp,bytes:row.sourceStamp.size,sha256:'0'.repeat(64)});
  noLinks(row.path);const before=fs.statSync(row.path,{bigint:true});if(!before.isFile()||before.size!==BigInt(row.sourceStamp.size))throw failure('SOURCE_STAMP_CHANGED');
  const bytes=await fs.promises.readFile(row.path);abort(signal);const after=fs.statSync(row.path,{bigint:true});noLinks(row.path);
  if(before.size!==after.size||before.mtimeNs!==after.mtimeNs||BigInt(bytes.length)!==before.size)throw failure('SOURCE_CHANGED');
  const bound=contract.bindSource({registered:true,missing:false,ambiguous:false,nonLink:true,libraryId:row.id,path:row.path,kind:row.kind,sourceStamp:row.sourceStamp,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});sourceStats.set(bound,{size:Number(after.size),mtimeNs:after.mtimeNs.toString()});return bound;
 }
 function powershell(){if(process.platform!=='win32'||!process.env.SystemRoot)throw failure('WINDOWS_HOST_REQUIRED');return path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');}
 // A timeout only stops awaiting. It never terminates the controller or worker.
 function spawnPS(script,args,output,timeout){return new Promise((resolve,reject)=>{
  const child=req('child_process').spawn(powershell(),['-NoLogo','-NoProfile','-NonInteractive','-File',script].concat(args),{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']}),out=[],err=[];let ended=false;
  const stdout=output?fs.createWriteStream(path.join(output,'controller-stdout.bin'),{flags:'wx'}):null,stderr=output?fs.createWriteStream(path.join(output,'controller-stderr.bin'),{flags:'wx'}):null;
  function finish(e,v){if(ended)return;ended=true;clearTimeout(timer);if(e)reject(e);else resolve(v);}
  const timer=setTimeout(()=>finish(failure('WORKER_UNKNOWN')),timeout);
  child.stdout.on('data',b=>{if(stdout)stdout.write(b);else{out.push(b);if(out.reduce((n,x)=>n+x.length,0)>1048576)finish(failure('HOST_OUTPUT_LIMIT'));}});
  child.stderr.on('data',b=>{if(stderr)stderr.write(b);else err.push(b);});
  if(stdout)stdout.on('error',()=>finish(failure('WORKER_UNKNOWN')));if(stderr)stderr.on('error',()=>finish(failure('WORKER_UNKNOWN')));
  child.on('error',e=>{if(stdout)stdout.end();if(stderr)stderr.end();finish(e);});
  child.on('close',(code,signal)=>{if(stdout)stdout.end();if(stderr)stderr.end();try{if(output)fs.writeFileSync(path.join(output,'controller-close.json'),JSON.stringify({schema:1,closed:true,exitCode:code,signal:signal||null}),{flag:'wx'});}catch(e){finish(failure('WORKER_UNKNOWN'));return;}finish(null,{exitCode:code,stdout:Buffer.concat(out).toString('utf8'),stderr:Buffer.concat(err).toString('utf8')});});
 });}
 async function host(){let raw;if(config.collectHost)raw=await config.collectHost();else{const version=await config.getHostVersion(),r=await spawnPS(path.join(runtime,'host-binding.ps1'),['-RendererPid',String(process.pid),'-RendererParentPid',String(process.ppid),'-RendererPath',process.execPath,'-AppVersion',version],null,30000);if(r.exitCode!==0)throw failure('HOST_BINDING_FAILED');raw=JSON.parse(r.stdout.replace(/^\uFEFF/,''));}return contract.bindHost(raw);}
 function terminal(r){return r&&r.naturalExitAndOutputQualified===true&&r.nativeCleanupPending===false&&r.sourcePrePostHashesMatch===true&&r.nonceMatches===true&&r.direct&&r.direct.hasExited===true&&r.direct.exitCode===0&&r.stdout&&r.stdout.copyCompleted===true&&r.stderr&&r.stderr.copyCompleted===true&&Array.isArray(r.nonMainProcesses)&&r.nonMainProcesses.length===0;}
 function accepted(p,r){let close;try{close=json(path.join(p.manifest.runDirectory,'controller-close.json'));}catch(e){throw failure('WORKER_UNKNOWN');}if(!close||close.schema!==1||close.closed!==true||![0,1].includes(close.exitCode)||close.signal!==null||!terminal(r))throw failure('WORKER_UNKNOWN');return contract.validateResult(r.handshake,p.request,p.manifest.nonce);}
 function recover(){
  if(!fs.existsSync(pendingPath))return;
  const p=json(pendingPath);if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(p.runId))throw failure('WORKER_PENDING');const dir=path.join(workerRoot,'runs',p.runId);noLinks(dir);if(p.manifestPath!==path.join(dir,'manifest.json')||!/^[a-f0-9]{64}$/.test(p.manifestSha256))throw failure('WORKER_PENDING');
  const bytes=fs.readFileSync(p.manifestPath);if(crypto.createHash('sha256').update(bytes).digest('hex')!==p.manifestSha256)throw failure('WORKER_PENDING');const m=JSON.parse(bytes),request=json(path.join(dir,'request.json'));
  if(m.runId!==p.runId||contract.hash(JSON.stringify(request))!==m.requestSha256)throw failure('WORKER_PENDING');
  try{accepted({manifest:m,request},json(path.join(dir,'readback.json')));}catch(e){throw failure('WORKER_PENDING');}fs.unlinkSync(pendingPath);
 }
 async function execute(operation,s,h,choice,signal){
  abort(signal);if(disposed)throw failure('ABORT_ERR');if(busy)throw failure('WORKER_BUSY');busy=true;let lock=null,prepared=null,listener=null,primary=null;
  try{
   fs.mkdirSync(workerRoot,{recursive:true});noLinks(workerRoot);lock=await leases.acquire(path.join(workerRoot,'dispatcher.lease'));await lock.assert();recover();abort(signal);assertRuntime();
   prepared=preparer.prepare({workerRoot,caller:{ownerId:owner,windowKey},host:h,source:s,sourceWitness:sourceStats.get(s),operation,selection:choice,policy});
   fs.writeFileSync(pendingPath,JSON.stringify({runId:prepared.manifest.runId,manifestPath:prepared.manifestPath,manifestSha256:prepared.manifestSha256}),{flag:'wx'});
   listener=()=>{try{cancelModule.requestCancel(prepared.manifestPath,prepared.manifestSha256,workerRoot);}catch(e){prepared.cancelError=e;}};active.add(listener);if(signal)signal.addEventListener('abort',listener,{once:true});if(signal&&signal.aborted)listener();
   await lock.assert();assertRuntime();let record;
   try{if(config.runController)record=await config.runController(prepared);else{await spawnPS(path.join(runtime,'launch.ps1'),['-ManifestPath',prepared.manifestPath,'-ExpectedManifestSHA256',prepared.manifestSha256,'-TimeoutSeconds','120'],prepared.manifest.runDirectory,150000);record=json(path.join(prepared.manifest.runDirectory,'readback.json'));}}
   catch(e){throw failure('WORKER_UNKNOWN');}
   const result=accepted(prepared,record);fs.unlinkSync(pendingPath);
   if(result.canceled){const e=failure('ABORT_ERR');e.nativeState='terminal';throw e;}
   abort(signal);if(disposed)throw failure('ABORT_ERR');if(!result.ok){const e=failure(result.error.code);e.nativeState='terminal';throw e;}return result;
  }catch(e){primary=e;throw e;}finally{if(listener){active.delete(listener);if(signal)signal.removeEventListener('abort',listener);}try{if(lock)await lock.release();}catch(e){if(primary)primary.releaseError=e.message;else throw e;}finally{busy=false;}}
 }
 async function prepare(item,options){
  options=options||{};assertRuntime();const s=await source(item,options.signal),h=await host();abort(options.signal);assertRuntime();const nodeSourceWitness=sourceStats.get(s),identity=contract.hash({source:s,nodeSourceWitness,host:h,code:codeHash,runner:runnerHash});let manifest=discovery.get(identity);
  if(!manifest){const result=await execute('discover',s,h,null,options.signal),after=await source(item,options.signal);if(contract.ordered(after)!==contract.ordered(s)||contract.ordered(sourceStats.get(after))!==contract.ordered(nodeSourceWitness))throw failure('SOURCE_CHANGED');manifest=result.manifest;discovery.set(identity,manifest);}
  const choices=contract.choices(manifest),digest=contract.hash(manifest);if(!choices.length)return{state:'unavailable',reason:manifest.reason||'UNSUPPORTED_AEP'};
  const selected=options.selection;if(selected&&(selected.sourceSha256!==s.sha256||selected.manifestSha256!==digest))throw failure('CHOICE_CHANGED');
  if(!selected&&choices.length>1)return{state:'needs-selection',sourceSha256:s.sha256,manifestSha256:digest,choices};
  const choice=contract.select(manifest,selected?selected.token:choices[0].token),key=contract.cacheKey({source:s,host:h,choice,workerSha256:codeHash,runnerSha256:runnerHash});
  const plan={state:'renderable',source:s,nodeSourceWitness,host:h,choice,selectionContext:{sourceSha256:s.sha256,manifestSha256:digest,choices},item:JSON.parse(JSON.stringify(item)),requestKey:contract.hash({identity,choice:choice.token}),cacheKey:key};plans.set(plan.requestKey,contract.ordered(plan));return plan;
 }
 async function render(plan,options){
  options=options||{};assertRuntime();const signal=options.signal;if(!plan||plans.get(plan.requestKey)!==contract.ordered(plan))throw failure('STALE_WORKER_PLAN');abort(signal);
  const s=await source(plan.item,signal),h=await host();if(contract.ordered(s)!==contract.ordered(plan.source)||contract.ordered(sourceStats.get(s))!==contract.ordered(plan.nodeSourceWitness)||contract.ordered(h)!==contract.ordered(plan.host))throw failure('SOURCE_OR_HOST_CHANGED');
  const result=await execute('render',s,h,plan.choice,signal),after=await source(plan.item,signal);if(contract.ordered(after)!==contract.ordered(s)||contract.ordered(sourceStats.get(after))!==contract.ordered(plan.nodeSourceWitness))throw failure('SOURCE_CHANGED');abort(signal);
  const renderFrames=config.renderFrames||(scope.ContentriumThumbnails&&scope.ContentriumThumbnails.renderNativeFrames);if(typeof renderFrames!=='function')throw failure('THUMBNAIL_RENDERER_REQUIRED');
  const bytes=await renderFrames({paths:result.frames.map(f=>f.path),width:plan.choice.record.width,height:plan.choice.record.height,signal,progress:options.progress||function(){}},{nodeRequire:req});abort(signal);if(disposed)throw failure('ABORT_ERR');return bytes;
 }
 return{enabled:true,prepare,render,dispose(){disposed=true;active.forEach(cancel=>cancel());leases.dispose();}};
}
module.exports={create};
