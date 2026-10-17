const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const modules=['jsx/animated-font-model.jsx','jsx/animated-font-engine.jsx','jsx/font-pack-engine.jsx','library/fonts/index.json','library/fonts/contentrium-grid.cfont.json','library/fonts/LICENSE.txt','library/fonts/contentrium-grid.webm','ui-animated-font.js'];
const plain=value=>JSON.parse(JSON.stringify(value));
function contractFiles(){
 const verifier=read('tools/verify-package.cjs').match(/const required=(\[[^;]+\]);/);
 const installer=read('installer/Setup.cs').match(/const string RequiredPayloadPaths = "([^"]+)";/);
 assert.ok(verifier,'Verifier required-file contract');assert.ok(installer,'Installer required-file contract');
 return {verifier:vm.runInNewContext(verifier[1]),installer:installer[1].split('|')};
}
function stagedFiles(){
 const build=read('packaging/build-release.ps1');
 const loops=[...build.matchAll(/foreach \(\$name in @\(([^)]+)\)\) \{\s*\$source = Join-Path \$payload \$name/g)];
 assert.equal(loops.length,2,'Explicit runtime files and recursive runtime folders must stay distinct');
 const values=s=>[...s.matchAll(/'([^']+)'/g)].map(m=>m[1]);
 const files=values(loops[0][1]),folders=values(loops[1][1]);
 assert.deepEqual(folders,['CSXS','jsx','library','assets','thumbnail-worker']);
 function walk(relative){for(const name of fs.readdirSync(path.join(root,relative))){const file=relative+'/'+name,stat=fs.lstatSync(path.join(root,file));assert.equal(stat.isSymbolicLink(),false,file);if(stat.isDirectory())walk(file);else files.push(file);}}
 folders.forEach(walk);return files;
}
// Reuse only the established mock-host constructors, without registering their tests.
function facadeHost(){
 const sourcePath=path.join(root,'jsx/engine.jsx'),source=read('jsx/engine.jsx'),fixture=read('tests/engine.test.cjs');
 const body=fixture.slice(fixture.indexOf('function host('),fixture.indexOf("test('read-only state exposes"));
 return new Function('source','sourcePath','fs','path','vm','assert','__dirname',body+';return host;')(source,sourcePath,fs,path,vm,assert,__dirname)();
}
function geometryHost(){
 const fixture=read('tests/animated-font-engine.test.cjs');
 const body=fixture.slice(fixture.indexOf('function pack('),fixture.indexOf('\ntest('));
 return new Function('source','fs','vm','path','assert','__dirname','plain',body+';return harness;')(path.join(root,'jsx/animated-font-engine.jsx'),fs,vm,path,assert,__dirname,plain)();
}

test('GlyphPackage: verifier and installer require every runtime module consistently',()=>{
 const lists=contractFiles();assert.deepEqual(Array.from(lists.verifier),lists.installer);
 for(const file of modules){assert.ok(lists.verifier.includes(file),'Verifier must require '+file);assert.ok(lists.installer.includes(file),'Installer must require '+file);assert.ok(fs.statSync(path.join(root,file)).isFile());}
});
test('GlyphPackage: explicit release copy includes the input module and recursive JSX modules',()=>{
 const files=stagedFiles();for(const file of modules)assert.ok(files.includes(file),'Release payload must contain '+file);
 const html=read('index.html');assert.ok(html.includes('src="ui-animated-font.js"'));
 const engine=read('jsx/engine.jsx');for(const file of ['animated-font-model','animated-font-engine'])assert.ok(engine.includes("load('"+file+"')"));
});
test('GlyphExposure: missing registry stays unavailable and static catalog contains no font or seed',()=>{
 const h=facadeHost(),status=h.call('hostStatus');assert.equal(status.ok,true,status.error?.message);
 assert.deepEqual(status.result.animatedFonts.available,[]);assert.deepEqual(status.result.animatedFonts.capabilities,{add:false});
 assert.ok(!status.result.methods.some(name=>/pack|register|install/i.test(name)));
 const state=h.call('getState').result,result=h.call('addAnimatedFont',{fontId:'private-independent-ab',fontHash:'private-ab-v1',text:'AB',context:state.context,expectedRevision:state.projectRevision});
 assert.equal(result.error.code,'GLYPH_PACK_UNAVAILABLE');assert.deepEqual(h.events,[]);
 const catalog=JSON.parse(read('library/catalog.json'));assert.equal(catalog.entries.length,43);assert.equal(catalog.entries.flatMap(e=>e.variants).length,110);
 assert.ok(catalog.entries.flatMap(e=>[e,...e.variants]).every(item=>item.type!==11));
});
test('GlyphExposure: planned payload excludes private fixtures, references, projects and vendor font assets',()=>{
 const forbidden=/(?:\.superpowers|(?:^|\/)tests?(?:\/|$)|animated-font-fixtures|feature-parity-20261016|mister-horse-analysis|private-independent-ab|private-ab-v1|[A-Z]:[\\/]Users[\\/]|\.(?:aepx?|aex|otf|ttf|woff2?)(?:$|["']))/i;
 for(const file of stagedFiles()){
  assert.doesNotMatch(file,forbidden,'Private/vendor file in runtime copy set: '+file);
  if(/\.(?:js|cjs|ps1|jsx|json|xml|html|css|svg)$/i.test(file))assert.doesNotMatch(read(file),forbidden,'Private dependency/fixture in runtime: '+file);
 }
});
test('GlyphPersistence: portable serialization and mock reopen retain vector sampling without a pack or system font',()=>{
 const h=geometryHost(),layer=h.add('A B'),before=plain(h.api.serialize(layer));
 assert.deepEqual(Object.keys(before).sort(),['controls','kind','pack','schemaVersion','text','timeline']);
 assert.deepEqual(Object.keys(before.pack).sort(),['digest','id']);
 assert.deepEqual(Object.keys(before.timeline).sort(),['frameDuration','inMarker','inPoint','outMarker','outPoint']);assert.equal(before.timeline.inPoint,0);
 assert.doesNotMatch(JSON.stringify(before),/(?:propertyIndex|layerId|sourceId|controllerId|rootInputs|channels|[A-Z]:[\\/]|file:\/\/|\/Users\/|\.aep)/i);
 const dataLayer=layer.source.list.find(l=>l.comment.endsWith('|data|0'));
 const shape=dataLayer.property('ADBE Root Vectors Group').property(1).property('ADBE Vectors Group').property(1).property('ADBE Vector Shape');
 const sample=plain(shape.valueAtTime(.5));assert.ok(sample.vertices.length>0);
 // Fresh module state simulates reopening an existing native graph with no resolver.
 h.zero();vm.runInNewContext(read('jsx/animated-font-engine.jsx'),h.context,{filename:'animated-font-engine.jsx'});
 const reopened=h.context.$.cpGlyph;
 assert.equal(reopened.getControl(layer,'size'),100);assert.deepEqual(plain(reopened.serialize(layer)),before);
 assert.ok(reopened.controls(layer).every(d=>d.enabled===false&&d.readOnlyCode==='GLYPH_PACK_UNAVAILABLE'));
 assert.deepEqual(plain(shape.valueAtTime(.5)),sample);assert.equal(h.writes,0);
 assert.throws(()=>reopened.restore(h.comp,before,{atTime:4}),e=>e.code==='GLYPH_PACK_UNAVAILABLE');assert.equal(h.writes,0);
 assert.equal('fonts' in h.context.app,false);assert.doesNotMatch(read('jsx/animated-font-engine.jsx'),/addText\(|TextDocument|app\.fonts|ADBE Text Document/);
});
