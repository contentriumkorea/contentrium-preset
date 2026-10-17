'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),base=__dirname,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function requestCancel(manifestPath,expectedSha256,workerRoot){
 if(!path.isAbsolute(manifestPath)||!/^[a-f0-9]{64}$/.test(expectedSha256)||sha(fs.readFileSync(manifestPath))!==expectedSha256)throw Error('PINNED_MANIFEST_REQUIRED');
 const m=JSON.parse(fs.readFileSync(manifestPath,'utf8')),dir=m.runDirectory,expectedDir=path.join(workerRoot||path.join(process.env.APPDATA,'Contentrium','Preset','ThumbnailWorker'),'runs',m.runId);
 if(!/^[a-f0-9-]{36}$/.test(m.runId)||!/^[a-f0-9]{64}$/.test(m.nonce)||dir!==expectedDir||manifestPath!==path.join(dir,'manifest.json')||m.requestPath!==path.join(dir,'request.json')||sha(fs.readFileSync(m.requestPath))!==m.requestSha256)throw Error('OWN_RUN_REQUIRED');
 const req=JSON.parse(fs.readFileSync(m.requestPath,'utf8')),file=path.join(dir,'cancel.token'),intent=path.join(dir,'cancel-intent.json'),content=m.nonce+'\n'+m.runId;
 if(req.requestId!==m.runId||req.cancelPath!==file)throw Error('OWN_CANCEL_PATH_REQUIRED');
 for(let current=dir;current;){if(fs.lstatSync(current).isSymbolicLink())throw Error('REPARSE_PATH_REFUSED');const parent=path.dirname(current);if(parent===current)break;current=parent;}
 if(fs.existsSync(file)){if(fs.lstatSync(file).isSymbolicLink()||fs.readFileSync(file,'utf8')!==content)throw Error('FOREIGN_CANCEL_TOKEN');return{requested:true,alreadyRequested:true,nativeInvoked:false};}
 if(fs.existsSync(intent))throw Error('CANCEL_UNKNOWN_NO_REPLAY');
 fs.writeFileSync(intent,JSON.stringify({manifestSha256:expectedSha256,runId:m.runId,nonce:m.nonce,tokenPath:file}),{flag:'wx'});
 const temp=path.join(dir,'cancel-'+crypto.randomBytes(16).toString('hex')+'.tmp');fs.writeFileSync(temp,content,{flag:'wx'});
 try{fs.linkSync(temp,file);}finally{fs.unlinkSync(temp);}
 return{requested:true,alreadyRequested:false,nativeInvoked:false};
}
module.exports={requestCancel};
if(require.main===module){if(process.argv.length!==4)throw Error('MANIFEST_AND_EXPECTED_SHA_REQUIRED');console.log(JSON.stringify(requestCancel(process.argv[2],process.argv[3])));}
