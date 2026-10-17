const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const file=require('node:path').join(__dirname,'../ui-library.js');
const library=fs.existsSync(file)?require(file):{};
function entries(snapshot,previous,retained){assert.equal(typeof library.toEntries,'function','Browse library adapter is required');return library.toEntries(snapshot,previous,retained);}
const image={id:'file-a',name:'사진',kind:'image',path:'C:\\media\\photo.png',preview:'file:///C:/media/photo.png',folderId:'folder-a',category:'한국/하위'};
const snapshot={folders:[{id:'folder-a',name:'자료',path:'C:\\media'}],items:[image],capabilities:{imageSequence:true}};

test('Texture accepts only importable image/video/sequence sources, never projects, audio or saved presets',()=>{assert.equal(typeof library.canTexture,'function');for(const kind of ['image','video','image-sequence'])assert.equal(library.canTexture({...image,kind},snapshot),true);for(const kind of ['project','audio','preset','animation-preset'])assert.equal(library.canTexture({...image,kind},snapshot),false);assert.equal(library.canTexture({...image,missing:true},snapshot),false);assert.equal(library.canTexture({...image,ambiguous:true},snapshot),false);assert.equal(library.canTexture({...image,kind:'image-sequence'},{}),false);});

test('personal entries preserve host identity and use distinct Browse keys',()=>{
 const [entry]=entries(snapshot);
 assert.equal(entry.id,'library:file-a');assert.equal(entry.source,'library');assert.equal(entry.libraryItem.id,'file-a');
 assert.equal(entry.name,'사진');assert.equal(entry.variants.length,1);assert.equal(entry.variants[0].available,true);
 assert.deepEqual(entry.category,['User Library','자료','한국','하위']);assert.notEqual(entry.categoryKeys[1],entry.category[1]);
 assert.deepEqual(image,snapshot.items[0]);
});
test('equal folder names and punctuation retain distinct stable category identities',()=>{
 const data={folders:[{id:'a',name:'같은 이름'},{id:'b',name:'같은 이름'}],items:[{...image,id:'one',folderId:'a',category:'A / B/한글'},{...image,id:'two',folderId:'b',category:'A / B/한글'}]};
 const [one,two]=entries(data),again=entries({...data,items:data.items.slice().reverse()});
 assert.notDeepEqual(one.categoryKeys,two.categoryKeys);assert.deepEqual(one.categoryKeys,again.find(e=>e.id===one.id).categoryKeys);
 assert.ok(one.categoryKeys.join(' / ').length<512);assert.deepEqual(library.categoryParts({category:['Animation Presets','Motion']}),['Animation Presets','Motion']);
});
test('managed presets and registered folders use different branches',()=>{
 const [entry]=entries({items:[{id:'preset-own',name:'내 효과',kind:'preset',managed:true,path:'C:/owned/a.cpreset.json',category:'Text/Intro'}]});
 assert.deepEqual(entry.category,['User Library','Saved Presets','Text','Intro']);assert.equal(entry.libraryItem.managed,true);
 assert.equal(library.canReplace(entry.libraryItem,{}),false);assert.equal(library.canImport(entry.libraryItem,{}),true);
});
test('missing items remain visible but never importable',()=>{
 const [entry]=entries({...snapshot,items:[{...image,missing:true}]});
 assert.equal(entry.variants[0].available,false);assert.equal(library.canImport(entry.libraryItem,snapshot),false);assert.equal(library.canReplace(entry.libraryItem,snapshot),false);
 assert.match(entry.availabilityReason,/찾을 수 없/);
});
test('selected or favorited missing files retain their last metadata and recover by ID',()=>{
 const before=entries(snapshot),gone=entries({...snapshot,items:[]},before,['library:file-a']);
 assert.equal(gone.length,1);assert.equal(gone[0].name,'사진');assert.equal(gone[0].libraryItem.missing,true);assert.equal(gone[0].variants[0].available,false);
 assert.equal(entries({...snapshot,items:[]},before,[]).length,0);
 const restored=entries(snapshot,gone,['library:file-a']);assert.equal(restored.length,1);assert.equal(restored[0].variants[0].available,true);
});
test('ambiguous duplicate host IDs block actions instead of importing the first path',()=>{
 const [entry]=entries({...snapshot,items:[image,{...image,path:'C:/different/photo.png'}]});
 assert.equal(entry.variants[0].available,false);assert.equal(entry.libraryItem.ambiguous,true);assert.equal(library.canImport(entry.libraryItem,snapshot),false);
 assert.match(entry.availabilityReason,/중복/);
});
test('sequence actions reflect real capabilities and missing frames',()=>{
 const item={...image,kind:'image-sequence',importable:true};
 entries(snapshot);assert.equal(library.canImport(item,{capabilities:{imageSequence:true}}),true);
 assert.equal(library.canImport(item,{capabilities:{}}),false);assert.equal(library.canImport({...item,importable:false},{capabilities:{imageSequence:true}}),false);
 assert.equal(library.canReplace(item,{capabilities:{imageSequence:true}}),false);
 assert.equal(library.canReplace(item,{capabilities:{imageSequence:true,imageSequenceReplace:true}}),true);
});
test('local media URLs preserve percent, hash and Unicode filenames',()=>{
 entries(snapshot);const src=library.mediaSource({...image,preview:null,path:'C:\\media\\100% #한글.png'});
 assert.equal(src,'file:///C:/media/100%25%20%23%ED%95%9C%EA%B8%80.png');
 assert.equal(library.mediaSource({...image,preview:src}),src);
});
test('preview URLs cannot execute scripts or fetch remote web content',()=>{
 entries(snapshot);for(const value of ['javascript:alert(1)','data:image/svg+xml,anything','https://example.com/image.png','../outside.png'])assert.equal(library.mediaSource({...image,preview:value}),null);
 assert.equal(library.mediaSource({...image,preview:'assets/preview-logo.png'}),'assets/preview-logo.png');
});
test('unsupported browser formats do not disable a valid AE import',()=>{
 const [entry]=entries({items:[{...image,kind:'image',path:'C:/media/source.psd',preview:'file:///C:/media/source.psd'}]});
 assert.equal(entry.variants[0].available,true);assert.equal(library.canImport(entry.libraryItem,{}),true);
 assert.equal(library.previewKind(entry.libraryItem),'image');assert.equal(library.previewKind({kind:'project'}),null);
});
test('long relative paths keep category label storage within its existing limit',()=>{
 const [entry]=entries({...snapshot,items:[{...image,category:Array(16).fill('긴폴더'.repeat(70)).join('/')}]});
 assert.ok(('category:'+library.categoryParts(entry).join(' / ')).length<=512);
});
