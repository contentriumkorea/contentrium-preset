const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
function host(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'contentrium-workspace-')),listings=[];
 function Folder(p){if(!(this instanceof Folder))return new Folder(p);this.fsName=path.resolve(p);this.name=path.basename(this.fsName);}
 Object.defineProperties(Folder.prototype,{exists:{get(){return fs.existsSync(this.fsName)&&fs.statSync(this.fsName).isDirectory()}},parent:{get(){return new Folder(path.dirname(this.fsName))}}});
 Folder.prototype.create=function(){fs.mkdirSync(this.fsName,{recursive:true});return true};
 Folder.prototype.remove=function(){fs.rmdirSync(this.fsName);return true};
 Folder.prototype.getFiles=function(){listings.push(this.fsName);return fs.readdirSync(this.fsName).map(n=>{const p=path.join(this.fsName,n);return fs.statSync(p).isDirectory()?new Folder(p):new File(p)})};
 Folder.userData=new Folder(dir);
 function File(p){if(!(this instanceof File))return new File(p);this.fsName=path.resolve(p);this.name=path.basename(this.fsName);}
 Object.defineProperties(File.prototype,{exists:{get(){return fs.existsSync(this.fsName)}},parent:{get(){return new Folder(path.dirname(this.fsName))}},length:{get(){return fs.statSync(this.fsName).size}},modified:{get(){return fs.statSync(this.fsName).mtime}}});
 File.prototype.open=function(mode){this.mode=mode;this.buffer='';return mode==='w'||this.exists};
 File.prototype.read=function(){return fs.readFileSync(this.fsName,'utf8')};
 File.prototype.write=function(v){this.buffer+=v;return true};
 File.prototype.close=function(){if(this.mode==='w')fs.writeFileSync(this.fsName,this.buffer);return true};
 File.prototype.remove=function(){if(this.exists)fs.unlinkSync(this.fsName);return true};
 File.prototype.rename=function(n){const p=path.join(path.dirname(this.fsName),n);fs.renameSync(this.fsName,p);this.fsName=p;this.name=n;return true};
 File.prototype.copy=function(p){fs.copyFileSync(this.fsName,p);return true};
 const imports=[];const $={},context={$,File,Folder,JSON,encodeURI,Math,Date,ImportOptions:function(file){this.file=file;},app:{project:{numItems:0,importFile:options=>{imports.push(options.file.fsName);const item={id:1,file:options.file};if(options.sequence){let rate=30;item.frameRate=rate;item.duration=3/rate;item.mainSource={isStill:false};Object.defineProperty(item.mainSource,'conformFrameRate',{get:()=>rate,set:v=>{rate=v;item.frameRate=v;item.duration=3/v;}});}return item;}}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../jsx/sequence-engine.jsx'),'utf8'),context);
 const file=path.join(__dirname,'../jsx/workspace-engine.jsx');if(fs.existsSync(file))vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
 const api=$.cpWorkspace;if(api)api.configure({json:JSON.stringify,parse:JSON.parse});
 return{api,dir,File,Folder,imports,context,listings,cleanup:()=>fs.rmSync(dir,{recursive:true,force:true})};
}

module.exports={host};
