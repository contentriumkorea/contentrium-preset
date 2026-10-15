const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),meta=require('../package.json'),catalog=require('../library/catalog.json');
const required=['index.html','panel.css','panel.js','preview.js','CSXS/manifest.xml','jsx/engine.jsx','jsx/presets.jsx','jsx/overlay-engine.jsx','jsx/precomp-engine.jsx','library/catalog.json','assets/icon.svg'];
for(const file of required)assert.ok(fs.statSync(path.join(root,file)).isFile(),file);
assert.equal(meta.name,'contentrium-preset');assert.equal(catalog.product,'Contentrium Preset');assert.equal(catalog.version,meta.version);
assert.equal(catalog.entries.length,43);const variants=catalog.entries.flatMap(e=>e.variants);assert.equal(variants.length,110);assert.equal(new Set(variants.map(v=>v.id)).size,110);assert.ok(variants.every(v=>v.available));
const manifest=fs.readFileSync(path.join(root,'CSXS/manifest.xml'),'utf8');assert.ok(manifest.includes('ExtensionBundleId="com.contentrium.preset"'));assert.ok(manifest.includes('ExtensionBundleVersion="'+meta.version+'"'));
const forbidden=/\.aex\b|[A-Z]:[\\/].*?(Users|workspace)|localhost:\d+|127\.0\.0\.1:\d+/i;
for(const file of required){const text=fs.readFileSync(path.join(root,file),'utf8');assert.ok(!forbidden.test(text),'Unexpected private dependency or product text: '+file);if(/\.(js|jsx)$/.test(file))new vm.Script(text,{filename:file});}
const result={product:catalog.product,version:meta.version,presets:43,variants:110,motionAndText:variants.filter(v=>v.type!==10).length,generatedCompositions:variants.filter(v=>v.type===10).length,requiredFiles:required.length,runtimeBytes:required.reduce((n,f)=>n+fs.statSync(path.join(root,f)).size,0)};console.log(JSON.stringify(result,null,2));
