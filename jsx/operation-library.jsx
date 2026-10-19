/* Private local operation pack. No decoder, native loader, generator or AE polling. */
(function(){
 var config=null,entries={},documents={};
 function own(o,k){return Object.prototype.hasOwnProperty.call(o,k);}
 function array(v){return Object.prototype.toString.call(v)==='[object Array]';}
 function fail(code,message){var e=new Error(message);e.code=code;throw e;}
 function invalid(message){fail('OPERATION_INDEX_INVALID',message);}
 function digest(v){return typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);}
 // AE normalizes CRLF in UTF-8 text mode; hashes must retain the exact accepted bytes.
 function read(file,max,code){var f=new File(file);if(!f.exists||typeof f.length!=='number'||f.length>max)fail(code,'Missing or oversized operation file');f.encoding='BINARY';if(!f.open('r'))fail(code,'Cannot read operation file');try{return decodeURIComponent(escape(f.read()));}catch(error){fail(code,'Invalid UTF-8 operation file');}finally{f.close();}}
 function checked(file,max,expected,code){var text=read(file,max,code);if($.cpFontPacks.sha256(text)!==expected)fail(code,'Operation file changed; rebuild its exact acceptance mapping');return text;}
 function configure(options){
  config=null;entries={};documents={};
  if(!options||typeof options.root!=='string'||typeof options.libraryRoot!=='string'||!options.catalog||!array(options.catalog.entries))invalid('Explicit application/library roots and catalog required');
  var external=options.libraryRoot+'/operations/',base=((new File(options.libraryRoot+'/contentrium-pack.json')).exists||(new File(external+'index.json')).exists||(new File(external+'text-index.json')).exists)?external:options.root+'/library/operations/';
  if(!$.cpFontPacks||typeof $.cpFontPacks.sha256!=='function'||!$.cpOperations)invalid('Hash and operation engines required');
  var index,by={},docs={},variants={},pending=[],i,j,k,e,v,kind,files=['index.json','text-index.json'],names=['operation-engine.jsx','operation-model.jsx','json-engine.jsx','timeline-engine.jsx'];
  for(i=0;i<options.catalog.entries.length;i++)for(j=0;j<(options.catalog.entries[i].variants||[]).length;j++){v=options.catalog.entries[i].variants[j];if(own(variants,'$'+v.id))invalid('Duplicate catalog variant');variants['$'+v.id]=v;if(v.recipe){v.available=false;delete v.applyRuntime;delete v.applyTarget;delete v.applyDirections;}}
  for(var pack=0;pack<files.length;pack++){
   if(!(new File(base+files[pack])).exists)continue;
   index=$.cpJson.parse(read(base+files[pack],1048576,'OPERATION_INDEX_INVALID'));
   if(!index||index.schemaVersion!==1||index.product!=='Contentrium Preset'||index.kind!=='contentrium-operation-library'||!array(index.entries)||index.entries.length>2000||!index.runtime)invalid('Unsupported operation index');
   for(i=0;i<names.length;i++)if(!digest(index.runtime[names[i]]))invalid('Complete frozen runtime hashes required');
   for(i=0;i<names.length;i++)checked(options.root+'/jsx/'+names[i],1048576,index.runtime[names[i]],'OPERATION_RUNTIME_CHANGED');
   if(own(index.runtime,'text-operation-engine.jsx')){if(!digest(index.runtime['text-operation-engine.jsx'])||!$.cpTextOperations)invalid('Exact text runtime required');checked(options.root+'/jsx/text-operation-engine.jsx',1048576,index.runtime['text-operation-engine.jsx'],'OPERATION_RUNTIME_CHANGED');}
   for(i=0;i<index.entries.length;i++){
    e=index.entries[i];if(!e||!/^cpr_[a-f0-9]{24}$/.test(e.variantId)||typeof e.documentId!=='string'||!e.documentId||own(by,'$'+e.variantId)||own(docs,'$'+e.documentId)||e.file!==e.variantId+'.operations.json'||!digest(e.sha256)||!digest(e.recipeSha256)||!digest(e.graphSha256)||!array(e.directions)||e.directions.length!==1||e.directions[0]!=='both'||!e.acceptance||e.acceptance.audioCompared!==false)invalid('Exact identity, paths and native acceptance required');
    kind=e.layerKind||'av';if(kind==='text'){if(!own(index.runtime,'text-operation-engine.jsx')||e.acceptance.scope!=='native-character-context'||e.acceptance.renderCompared!==true||e.acceptance.pngPairs!==12||typeof e.acceptance.samples!=='number'||e.acceptance.samples<=0)invalid('Exact text character-context acceptance required');}
    else if(kind!=='av'||e.acceptance.scope!=='native-property-values'||e.acceptance.renderCompared!==false)invalid('Exact AV property acceptance required');
    v=variants['$'+e.variantId];if(!v||v.type!==1||v.recipe!=='recipes/'+e.variantId+'.cpr.json')invalid('Operation recipe is absent or has changed kind/path');
    by['$'+e.variantId]=e;docs['$'+e.documentId]=e.variantId;pending.push({variant:v,kind:kind});
   }
  }
  config={root:options.root,libraryRoot:options.libraryRoot,operationsRoot:base};entries=by;documents=docs;
  for(i=0;i<pending.length;i++){v=pending[i].variant;v.available=true;v.applyRuntime='operations-v1';v.applyTarget=pending[i].kind;v.applyDirections=['both'];v.availabilityReason=pending[i].kind==='text'?'native-character-context-accepted':'native-property-accepted';}
 }
 function resolve(id,direction){
  var e=entries['$'+id];if(!config||!e)fail('OPERATION_NOT_ACCEPTED','This recipe has no exact accepted operation payload');
  if(direction!=='both')fail('OPERATION_DIRECTION_UNVERIFIED','Only the exact BOTH payload has native property acceptance');
  checked(config.libraryRoot+'/recipes/'+id+'.cpr.json',16777216,e.recipeSha256,'OPERATION_RECIPE_CHANGED');
  var text=checked(config.operationsRoot+e.file,16777216,e.sha256,'OPERATION_PAYLOAD_CHANGED'),data=$.cpJson.parse(text);
  if(!data||data.documentId!==e.documentId||!data.requirements||data.requirements.layerKind!==(e.layerKind||'av'))fail('OPERATION_PAYLOAD_CHANGED','Operation owner or target identity changed');if(e.layerKind==='text')$.cpTextOperations.validate(data);else $.cpOperations.validate(data);return data;
 }
 $.cpOperationLibrary={configure:configure,resolve:resolve,variantId:function(documentId){return documents['$'+documentId]||null;}};
})();
