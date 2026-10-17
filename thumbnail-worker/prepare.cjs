'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),api=require('./worker-contract.cjs'),base=__dirname;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function prepare(input){
 if(!input||Object.keys(input).filter(k=>k!=='policy').sort().join('|')!=='caller|host|operation|selection|source|sourceWitness|workerRoot')throw Error('EXACT_WORKER_INPUT_REQUIRED');
 const witness=input.sourceWitness;if(!witness||Object.keys(witness).sort().join('|')!=='mtimeNs|size'||witness.size!==input.source.bytes||typeof witness.mtimeNs!=='string'||!/^[0-9]{1,20}$/.test(witness.mtimeNs))throw Error('PRECISE_NODE_SOURCE_WITNESS_REQUIRED');
 const h=input.host,host=api.bindHost({platform:'win32',rendererPid:h.renderer.processId,appVersion:h.appVersion,processes:[h.renderer,h.bridge,h.main],images:h.images});
 if(!path.isAbsolute(input.workerRoot)||!input.caller||!/^[a-f0-9]{32}$/.test(input.caller.ownerId)||!/^[a-f0-9]{64}$/.test(input.caller.windowKey))throw Error('WORKER_ROOT_AND_CALLER_REQUIRED');
 const runId=crypto.randomUUID(),nonce=crypto.randomBytes(32).toString('hex'),dir=path.join(input.workerRoot,'runs',runId),output=path.join(dir,'handshake.json');
 const request=api.makeRequest({operation:input.operation,policy:input.policy,source:input.source,choice:input.selection,runDirectory:dir,requestId:runId}),requestBytes=JSON.stringify(request),script=api.compile(nonce,output,request);
 fs.mkdirSync(path.dirname(dir),{recursive:true});for(let current=path.dirname(dir);;){if(fs.lstatSync(current).isSymbolicLink())throw Error('WORKER_SCRATCH_LINK_REFUSED');const parent=path.dirname(current);if(parent===current)break;current=parent;}fs.mkdirSync(dir,{recursive:false});const write=(n,b)=>{const f=path.join(dir,n);fs.writeFileSync(f,b,{flag:'wx'});return f;};
 const scriptPath=write('bootstrap.jsx',script),requestPath=write('request.json',requestBytes),hf=n=>sha(fs.readFileSync(path.join(base,n)));
 const main=host.main,mainHost={processId:main.processId,sessionId:main.sessionId,createdUtc:main.createdUtc,executablePath:main.executablePath,imageSha256:host.images.exe.sha256};
 const manifest={schema:1,runId,nonce,workerRoot:path.resolve(input.workerRoot),runDirectory:dir,host,caller:input.caller,handshakePath:output,scriptPath,scriptSha256:sha(script),launcherSha256:hf('launch.ps1'),prepareSha256:hf('prepare.cjs'),validatorSha256:hf('validate-result.ps1'),gateSha256:hf('worker-gate.ps1'),workerContractSha256:hf('worker-contract.cjs'),templateSha256:hf('jsx/thumbnail-worker.template.jsx'),requestPath,requestSha256:sha(requestBytes),source:input.source,nodeSourceWitness:witness,pins:{launchPath:host.launchPath,imagePins:[host.images.com,host.images.exe]},experiment:{mode:'open-main',mainHost},arguments:['-m','-re','-noui','-r',scriptPath],operation:request.operation,outputPolicy:'localCache',observationBudgetSeconds:120,requireRenderEngineTrue:true,openMainAfterWitnessRequired:false,projectMutationAllowed:true,mainProjectMutationAllowed:false,ownedWorkerProjectOpenAllowed:true,sourceSavingAllowed:false,quitAllowed:false,exactWriterPidProven:false,sourceOpenMayEvaluateExpressions:true};
 const bytes=JSON.stringify(manifest,null,2),manifestPath=write('manifest.json',bytes);return{manifestPath,manifestSha256:sha(bytes),manifest,request};
}
module.exports={prepare};
