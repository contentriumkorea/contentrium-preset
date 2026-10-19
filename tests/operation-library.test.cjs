const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),id='cpr_0123456789abcdef01234567',sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function host(){
 const files=new Map(),recipe=JSON.stringify({id,graphSha256:'a'.repeat(64)}),payload=JSON.stringify({kind:'contentrium-operation-preset',schemaVersion:1,documentId:'source-fixture',name:'Exact',requirements:{layerKind:'av'},policies:{enableMotionBlur:true}}),runtime={};
 for(const file of ['operation-engine.jsx','operation-model.jsx','json-engine.jsx','timeline-engine.jsx']){files.set('/app/jsx/'+file,'code '+file);runtime[file]=sha('code '+file);}
 const entry={variantId:id,documentId:'source-fixture',directions:['both'],file:id+'.operations.json',sha256:sha(payload),recipeSha256:sha(recipe),graphSha256:'a'.repeat(64),acceptance:{scope:'native-property-values',renderCompared:false,audioCompared:false}};
 const index={schemaVersion:1,product:'Contentrium Preset',kind:'contentrium-operation-library',runtime,entries:[entry]},catalog={entries:[{id:'group',variants:[{id,type:1,recipe:'recipes/'+id+'.cpr.json',available:false}]}]};
 function putIndex(){files.set('/app/library/operations/index.json',JSON.stringify(index));}
 putIndex();files.set('/app/library/operations/'+entry.file,payload);files.set('/private/recipes/'+id+'.cpr.json',recipe);
 function File(name){if(!(this instanceof File))return new File(name);this.fsName=name;this.exists=files.has(name);this.length=Buffer.byteLength(files.get(name)||'');this.open=()=>this.exists;this.read=()=>this.encoding==='BINARY'?Buffer.from(files.get(name),'utf8').toString('latin1'):files.get(name).replace(/\r\n?/g,'\n').replace(/^\uFEFF/,'');this.close=()=>{};}
 const $={cpJson:{parse:JSON.parse},cpFontPacks:{sha256:sha},cpOperations:{validate:d=>{assert.notEqual(d.requirements?.layerKind,'text','Text documents must use their own validator');return true;}},cpTextOperations:{validate:d=>{assert.equal(d.requirements.layerKind,'text');return true;}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'jsx/operation-library.jsx'),'utf8'),{$,File});
 return{api:$.cpOperationLibrary,files,index,entry,catalog,putIndex,configure(){return $.cpOperationLibrary.configure({root:'/app',libraryRoot:'/private',catalog});}};
}
test('frozen operation pack enables only its exact recipe and both direction',()=>{
 const h=host();h.configure();const v=h.catalog.entries[0].variants[0];assert.equal(v.available,true);assert.equal(v.applyRuntime,'operations-v1');assert.deepEqual(Array.from(v.applyDirections),['both']);assert.equal(h.api.resolve(id,'both').documentId,'source-fixture');assert.equal(h.api.variantId('source-fixture'),id);
 assert.throws(()=>h.api.resolve(id,'in'),e=>e.code==='OPERATION_DIRECTION_UNVERIFIED');assert.throws(()=>h.api.resolve('cpr_unknown','both'),e=>e.code==='OPERATION_NOT_ACCEPTED');
});
test('missing operation pack leaves recipes blocked without an alternate generator',()=>{
 const h=host();h.files.delete('/app/library/operations/index.json');h.configure();assert.equal(h.catalog.entries[0].variants[0].available,false);assert.throws(()=>h.api.resolve(id,'both'),e=>e.code==='OPERATION_NOT_ACCEPTED');
});

test('AE text-read newline normalization cannot invalidate exact CRLF and Unicode bytes',()=>{
 const h=host(),runtimeFile='/app/jsx/json-engine.jsx',recipeFile='/private/recipes/'+id+'.cpr.json';
 const code='/* 검증 */\r\ncode\r\n',recipe='\uFEFF'+JSON.stringify({id,name:'콘텐츠리움 😀'})+'\r\n';
 h.files.set(runtimeFile,code);h.index.runtime['json-engine.jsx']=sha(code);h.files.set(recipeFile,recipe);h.entry.recipeSha256=sha(recipe);h.putIndex();
 h.configure();assert.equal(h.api.resolve(id,'both').documentId,'source-fixture');
 h.files.set(recipeFile,recipe.replace(/\r\n/g,'\n'));assert.throws(()=>h.api.resolve(id,'both'),e=>e.code==='OPERATION_RECIPE_CHANGED','Byte changes still fail exact acceptance');
});
test('edited payload, recipe or frozen runtime fails before a host write',()=>{
 for(const file of ['/app/library/operations/'+id+'.operations.json','/private/recipes/'+id+'.cpr.json','/app/jsx/operation-engine.jsx']){const h=host();h.files.set(file,h.files.get(file)+' ');assert.throws(()=>{h.configure();h.api.resolve(id,'both');},e=>['OPERATION_PAYLOAD_CHANGED','OPERATION_RECIPE_CHANGED','OPERATION_RUNTIME_CHANGED'].includes(e.code));}
 const h=host();h.configure();h.files.set('/private/recipes/'+id+'.cpr.json','{}');assert.throws(()=>h.api.resolve(id,'both'),e=>e.code==='OPERATION_RECIPE_CHANGED','revalidate on every apply');
});
test('paths, duplicate identities and unproven acceptance cannot activate recipes',()=>{
 for(const mutate of [h=>h.entry.file='../other.json',h=>h.index.entries.push({...h.entry}),h=>h.entry.directions=['in'],h=>h.entry.acceptance.scope='guessed',h=>h.index.runtime={},h=>h.catalog.entries[0].variants[0].recipe='../bad.json']){const h=host();mutate(h);h.putIndex();assert.throws(()=>h.configure(),e=>e.code==='OPERATION_INDEX_INVALID');assert.equal(h.catalog.entries[0].variants[0].available,false);}
});
function addTextPack(h){
 const textId='cpr_abcdef0123456789abcdef01',code='frozen text adapter',payload=JSON.stringify({kind:'contentrium-operation-preset',schemaVersion:1,documentId:'source-text',name:'Text',requirements:{layerKind:'text'}}),recipe=JSON.stringify({id:textId,graphSha256:'b'.repeat(64)});
 h.files.set('/app/jsx/text-operation-engine.jsx',code);h.files.set('/private/recipes/'+textId+'.cpr.json',recipe);h.files.set('/app/library/operations/'+textId+'.operations.json',payload);
 const entry={variantId:textId,documentId:'source-text',layerKind:'text',directions:['both'],file:textId+'.operations.json',sha256:sha(payload),recipeSha256:sha(recipe),graphSha256:'b'.repeat(64),acceptance:{scope:'native-character-context',renderCompared:true,audioCompared:false,pngPairs:12,samples:100}};
 const index={schemaVersion:1,product:'Contentrium Preset',kind:'contentrium-operation-library',runtime:{...h.index.runtime,'text-operation-engine.jsx':sha(code)},entries:[entry]};
 h.files.set('/app/library/operations/text-index.json',JSON.stringify(index));h.catalog.entries.push({id:'text',variants:[{id:textId,type:1,recipe:'recipes/'+textId+'.cpr.json',available:false}]});return{entry,index,id:textId,save(){h.files.set('/app/library/operations/text-index.json',JSON.stringify(index));}};
}

test('external ZIP pack owns its operation payloads independently of the plugin',()=>{
 const h=host();for(const [file,value]of Array.from(h.files))if(file.startsWith('/app/library/operations/')){h.files.set(file.replace('/app/library/operations/','/private/operations/'),value);h.files.delete(file);}
 h.files.set('/private/contentrium-pack.json','{}');h.configure();assert.equal(h.api.resolve(id,'both').documentId,'source-fixture');
 h.files.set('/private/operations/'+h.entry.file,'{}');assert.throws(()=>h.api.resolve(id,'both'),e=>e.code==='OPERATION_PAYLOAD_CHANGED');
});
test('a pack without accepted operations never inherits another bundled preset pack',()=>{
 const h=host();h.files.set('/private/contentrium-pack.json','{}');h.configure();assert.equal(h.catalog.entries[0].variants[0].available,false);assert.throws(()=>h.api.resolve(id,'both'),e=>e.code==='OPERATION_NOT_ACCEPTED');
});
test('text pack keeps exact character-context acceptance and validates through the text adapter',()=>{
 const h=host(),t=addTextPack(h);h.configure();assert.equal(h.catalog.entries[1].variants[0].available,true);assert.equal(h.catalog.entries[1].variants[0].applyTarget,'text');assert.equal(h.api.resolve(t.id,'both').requirements.layerKind,'text');assert.equal(h.api.variantId('source-text'),t.id);assert.equal(h.catalog.entries[0].variants[0].available,true);
});
test('incomplete text acceptance, missing adapter, and mixed pack collisions fail closed',()=>{
 for(const mutate of [(h,t)=>t.entry.acceptance.pngPairs=0,(h,t)=>t.entry.acceptance.renderCompared=false,(h,t)=>delete t.index.runtime['text-operation-engine.jsx'],(h,t)=>t.entry.documentId=h.entry.documentId]){const h=host(),t=addTextPack(h);mutate(h,t);t.save();assert.throws(()=>h.configure(),e=>e.code==='OPERATION_INDEX_INVALID');assert.ok(h.catalog.entries.every(g=>g.variants.every(v=>!v.available)));}
});
