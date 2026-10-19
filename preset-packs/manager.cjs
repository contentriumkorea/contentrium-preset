'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),child=require('child_process');
const product='Contentrium Preset',kind='contentrium-preset-pack',manifestName='contentrium-pack.json';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function need(ok,message){if(!ok)throw Error(message);}
function parse(file){return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
function safeName(name){
 need(typeof name==='string'&&!/[\\:\x00-\x1f<>"|?*]/.test(name)&&!name.startsWith('/'),'Invalid pack path');
 need(name.split('/').every(p=>p&&p!=='.'&&p!=='..'&&!/[. ]$/.test(p)&&!/^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\.|$)/i.test(p)),'Unsafe pack path');
 need(/^(contentrium-pack\.json|catalog\.json|recipes\/cpr_[a-f0-9]{24}\.cpr\.json|previews\/cpr_[a-f0-9]{24}\.webm|operations\/(index\.json|text-index\.json|cpr_[a-f0-9]{24}\.operations\.json)|sounds\/.+\.wav)$/.test(name),'Unsupported pack file');return name;
}
function noLinks(file){let current=path.resolve(file);while(true){if(fs.existsSync(current))need(!fs.lstatSync(current).isSymbolicLink(),'Pack storage cannot contain links');const parent=path.dirname(current);if(parent===current)return;current=parent;}}
function inside(root,file){const relative=path.relative(path.resolve(root),path.resolve(file));return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);}
function atomic(file,bytes){noLinks(file);fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,bytes,{flag:'wx'});fs.renameSync(temp,file);}
function fileHash(file){return new Promise((resolve,reject)=>{const h=crypto.createHash('sha256'),stream=fs.createReadStream(file);stream.on('data',b=>h.update(b));stream.on('end',()=>resolve(h.digest('hex')));stream.on('error',reject);});}
function validate(manifest){
 need(manifest&&manifest.schemaVersion===1&&manifest.product===product&&manifest.kind===kind,'Not a Contentrium preset pack');
 need(/^[a-z0-9][a-z0-9-]{0,63}$/.test(manifest.id)&&/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,63}$/.test(manifest.version),'Invalid pack identity');
 need(Array.isArray(manifest.files)&&manifest.files.length>0&&manifest.files.length<=50000,'Pack file count limit');
 const seen=new Set();let total=0;
 for(const row of manifest.files){safeName(row.path);need(row.path!==manifestName&&!seen.has(row.path.toLowerCase()),'Duplicate pack file');seen.add(row.path.toLowerCase());need(Number.isSafeInteger(row.size)&&row.size>=0&&row.size<=2147483648&&/^[a-f0-9]{64}$/.test(row.sha256),'Invalid pack file identity');total+=row.size;}
 need(total===manifest.totalBytes&&total<=68719476736,'Pack expanded size limit');need(seen.has('catalog.json'),'Pack catalog required');return manifest;
}
function checkContents(root,manifest){
 const files=new Map(manifest.files.map(f=>[f.path,f])),catalog=parse(path.join(root,'catalog.json'));need(catalog.product===product&&catalog.schemaVersion===1&&Array.isArray(catalog.entries),'Invalid pack catalog');
 const variants=new Set();let accepted=0,sounds=0;
 for(const group of catalog.entries)for(const v of group.variants||[]){need(typeof v.id==='string'&&!variants.has(v.id),'Duplicate catalog variant');variants.add(v.id);if(v.recipe){need(v.recipe==='recipes/'+v.id+'.cpr.json'&&files.has(v.recipe),'Missing exact recipe');}}
 for(const name of ['index.json','text-index.json'])if(files.has('operations/'+name)){
  const index=parse(path.join(root,'operations',name));need(index.product===product&&index.kind==='contentrium-operation-library'&&Array.isArray(index.entries),'Invalid operation pack');
  for(const e of index.entries){need(variants.has(e.variantId)&&e.file===e.variantId+'.operations.json'&&files.get('operations/'+e.file)?.sha256===e.sha256&&files.get('recipes/'+e.variantId+'.cpr.json')?.sha256===e.recipeSha256,'Operation payload differs from acceptance');accepted++;}
 }
 for(const file of manifest.files)if(file.path.startsWith('sounds/'))sounds++;
 need(manifest.counts&&manifest.counts.variants===variants.size&&manifest.counts.accepted===accepted&&manifest.counts.sounds===sounds,'Pack counts differ from actual contents');
 return {variants:variants.size,accepted,sounds};
}
async function worker(job,onProgress){
 noLinks(job.work);fs.mkdirSync(job.work,{recursive:true});const request=path.join(job.work,'request.json'),progress=path.join(job.work,'progress.json');
 fs.writeFileSync(request,JSON.stringify({...job,progress}),{flag:'wx'});
 return new Promise((resolve,reject)=>{
  const proc=child.spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-File',path.join(__dirname,'zip-worker.ps1'),'-Request',request],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  let error='';proc.stderr.on('data',b=>{error=(error+b.toString()).slice(-4000);});
  const timer=setInterval(()=>{if(onProgress)try{if(fs.existsSync(progress))onProgress(parse(progress));}catch{}},500);
  proc.once('error',e=>{clearInterval(timer);reject(e);});proc.once('exit',code=>{clearInterval(timer);if(code===0){if(onProgress&&fs.existsSync(progress))onProgress(parse(progress));resolve();}else reject(Error('Preset ZIP operation failed: '+error));});
 });
}
async function build({libraryRoot,operationsRoot,archive,id='contentrium-personal-library',version='2026.10.19',onProgress}){
 libraryRoot=path.resolve(libraryRoot);operationsRoot=path.resolve(operationsRoot);archive=path.resolve(archive);need(!fs.existsSync(archive),'Output ZIP already exists');
 const work=archive+'.work-'+crypto.randomUUID();fs.mkdirSync(work,{recursive:true});const sources=[];
 async function add(source,relative){safeName(relative);noLinks(source);const info=fs.statSync(source);need(info.isFile(),'Pack source must be a file');sources.push({source:path.resolve(source),path:relative,size:info.size,sha256:await fileHash(source)});}
 await add(path.join(libraryRoot,'catalog.json'),'catalog.json');
 for(const [folder,target]of [['recipes','recipes'],['previews','previews'],['Contentrium Sounds','sounds']]){
  async function walk(dir,parts){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);need(!entry.isSymbolicLink(),'Pack source links forbidden');if(entry.isDirectory())await walk(file,parts.concat(entry.name));else await add(file,parts.concat(entry.name).join('/'));}}
  const source=path.join(libraryRoot,folder);if(fs.existsSync(source))await walk(source,[target]);
 }
 for(const name of ['index.json','text-index.json'])if(fs.existsSync(path.join(operationsRoot,name))){const index=parse(path.join(operationsRoot,name));await add(path.join(operationsRoot,name),'operations/'+name);for(const entry of index.entries)await add(path.join(operationsRoot,entry.file),'operations/'+entry.file);}
 const catalog=parse(path.join(libraryRoot,'catalog.json')),manifest={schemaVersion:1,product,kind,id,version,counts:{variants:catalog.entries.reduce((n,e)=>n+e.variants.length,0),accepted:sources.filter(f=>f.path.endsWith('.operations.json')).length,sounds:sources.filter(f=>f.path.startsWith('sounds/')).length},totalBytes:sources.reduce((n,f)=>n+f.size,0),files:sources.map(({source,...record})=>record)};
 validate(manifest);const manifestFile=path.join(work,manifestName);fs.writeFileSync(manifestFile,JSON.stringify(manifest));
 await worker({mode:'build',work,archive,manifest:manifestFile,sources},onProgress);
 return {archive,bytes:fs.statSync(archive).size,sha256:await fileHash(archive),manifestSha256:sha(fs.readFileSync(manifestFile)),counts:manifest.counts,totalBytes:manifest.totalBytes};
}
async function importZip({archive,appData=process.env.APPDATA,onProgress}){
 need(appData&&typeof archive==='string'&&path.isAbsolute(archive)&&/\.zip$/i.test(archive),'Select an absolute ZIP file path');noLinks(archive);need(fs.statSync(archive).isFile(),'ZIP file missing');
 const base=path.join(path.resolve(appData),'Contentrium/Preset'),packs=path.join(base,'Packs');noLinks(base);fs.mkdirSync(packs,{recursive:true});
 const token=crypto.randomUUID(),work=path.join(packs,'.job-'+token),stage=path.join(packs,'.incoming-'+token);need(inside(packs,stage),'Owned staging path required');
 try {
 await worker({mode:'extract',archive,stage,work},onProgress);
 const manifestBytes=fs.readFileSync(path.join(stage,manifestName)),manifest=validate(JSON.parse(manifestBytes.toString('utf8'))),counts=checkContents(stage,manifest),digest=sha(manifestBytes),destination=path.join(packs,manifest.id+'-'+manifest.version+'-'+digest.slice(0,16));
 need(!fs.existsSync(destination),'This preset pack is already installed');
 const locationFile=path.join(base,'ConvertedLibrary.location.json'),workspaceFile=path.join(base,'workspace.json');
 noLinks(locationFile);noLinks(workspaceFile);
 const oldLocation=fs.existsSync(locationFile)?fs.readFileSync(locationFile):null,oldWorkspace=fs.existsSync(workspaceFile)?fs.readFileSync(workspaceFile):null;
 const workspace=oldWorkspace?JSON.parse(oldWorkspace.toString('utf8').replace(/^\uFEFF/,'')):{schemaVersion:1,settings:{},folders:[],items:[]};
 need(workspace.schemaVersion===1&&Array.isArray(workspace.folders)&&Array.isArray(workspace.items)&&workspace.settings,'Invalid existing workspace; nothing activated');
 if(counts.sounds){const previous=oldLocation&&JSON.parse(oldLocation.toString('utf8').replace(/^\uFEFF/,'')),oldRoot=previous&&previous.libraryRoot;
  if(oldRoot){const roots=[path.resolve(oldRoot,'sounds').toLowerCase(),path.resolve(oldRoot,'Contentrium Sounds').toLowerCase()];workspace.folders=workspace.folders.filter(f=>!roots.includes(path.resolve(f.path).toLowerCase()));}
  const soundRoot=path.join(destination,'sounds');workspace.folders.push({id:'pack-sounds-'+digest.slice(0,16),path:soundRoot,previewsLocation:'localCache'});}
 fs.writeFileSync(path.join(work,'activation-before.json'),JSON.stringify({location:oldLocation&&oldLocation.toString('base64'),workspace:oldWorkspace&&oldWorkspace.toString('base64')}),{flag:'wx'});
 const same=(file,bytes)=>bytes?fs.existsSync(file)&&fs.readFileSync(file).equals(bytes):!fs.existsSync(file);
 need(same(locationFile,oldLocation)&&same(workspaceFile,oldWorkspace),'Library settings changed during import; nothing activated');
 fs.renameSync(stage,destination);
 let workspaceWritten=false;
 try{atomic(workspaceFile,JSON.stringify(workspace));workspaceWritten=true;atomic(locationFile,JSON.stringify({schemaVersion:1,product,libraryRoot:destination,packId:manifest.id,packVersion:manifest.version,manifestSha256:digest}));}
 catch(error){if(workspaceWritten){if(oldWorkspace)atomic(workspaceFile,oldWorkspace);else{need(inside(base,workspaceFile),'Owned workspace path required');fs.unlinkSync(workspaceFile);}}throw error;}
 const result={id:manifest.id,version:manifest.version,root:destination,counts,zipBytes:fs.statSync(archive).size,totalBytes:manifest.totalBytes,requiresRestart:true};fs.writeFileSync(path.join(work,'installed.json'),JSON.stringify(result,null,2),{flag:'wx'});return result;
 } finally { if(fs.existsSync(stage)){need(inside(packs,stage)&&path.basename(stage)==='.incoming-'+token,'Owned staging cleanup required');noLinks(stage);fs.rmSync(stage,{recursive:true,force:true});} }
}
module.exports={safeName,validate,checkContents,build,importZip,fileHash};
