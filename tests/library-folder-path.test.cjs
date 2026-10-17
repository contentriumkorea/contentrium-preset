const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function ui(){
 class Node{constructor(tag){this.tag=tag;this.children=[];this.listeners={};}appendChild(n){this.children.push(n);return n;}setAttribute(k,v){this[k]=v;}addEventListener(k,f){this.listeners[k]=f;}showModal(){this.open=true;}close(){this.open=false;this.listeners.close?.();}remove(){this.removed=true;}select(){this.selected=true;}}
 const body=new Node('body'),sandbox={document:{body,createElement:t=>new Node(t)},Promise};
 Object.defineProperty(sandbox,'cep',{get(){throw Error('Native CEP picker must never be accessed');}});
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../ui-workspace.js'),'utf8'),sandbox);
 return {api:sandbox.ContentriumWorkspace,body};
}
const walk=n=>[n,...n.children.flatMap(walk)];
test('folder path dialog cancels without a path or native picker',async()=>{const h=ui(),p=h.api.askLibraryFolderPath(),d=h.body.children.at(-1);assert.equal(d['aria-label'],'사용자 라이브러리 폴더 추가');walk(d).find(x=>x.textContent==='취소').onclick();assert.equal(await p,null);assert(d.removed);});
test('Escape close resolves once and removes the folder path dialog',async()=>{const h=ui(),p=h.api.askLibraryFolderPath(),d=h.body.children.at(-1);d.close();assert.equal(await p,null);assert(d.removed);});
test('folder path preserves Unicode, spaces and long paths and strips Explorer quotes',async()=>{const h=ui(),p=h.api.askLibraryFolderPath(),d=h.body.children.at(-1),nodes=walk(d),input=nodes.find(x=>x.tag==='input'),form=nodes.find(x=>x.tag==='form');const value='D:\\사용자 자료\\'+('long folder '.repeat(30));input.value='  "'+value+'"  ';assert(input.maxLength>260);form.onsubmit({preventDefault(){}});assert.equal(await p,value);assert(d.removed);});
test('empty submission stays open; valid submission is single use',async()=>{const h=ui(),p=h.api.askLibraryFolderPath(),d=h.body.children.at(-1),nodes=walk(d),input=nodes.find(x=>x.tag==='input'),form=nodes.find(x=>x.tag==='form');input.value='   ';form.onsubmit({preventDefault(){}});assert(d.open);input.value='D:\\Owned';form.onsubmit({preventDefault(){}});input.value='D:\\Other';form.onsubmit({preventDefault(){}});assert.equal(await p,'D:\\Owned');});
test('workspace has no OS picker route and waits for a path before registration options',()=>{const source=fs.readFileSync(path.join(__dirname,'../ui-workspace.js'),'utf8');assert.doesNotMatch(source,/showOpenDialog|Folder\.selectDialog/);assert.match(source,/askLibraryFolderPath\(\)\.then\(function\s*\(path\)/);});
