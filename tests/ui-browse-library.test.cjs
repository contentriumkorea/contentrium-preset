const test=require('node:test'),assert=require('node:assert/strict');
const ui=require('../panel.js'),library=require('../ui-library.js');
const entries=library.toEntries({folders:[{id:'a',name:'자료'},{id:'b',name:'자료'}],items:[{id:'a-file',folderId:'a',name:'Alpha',kind:'image',path:'C:/a/x.png'},{id:'b-file',folderId:'b',name:'Beta',kind:'image',path:'C:/b/y.png'}]});
test('Browse tree keeps two identically named registered folders separate',()=>{
 const tree=ui.buildCategoryTree(entries),root=tree.children[0];assert.equal(root.key,'@library');assert.equal(root.children.length,2);assert.deepEqual(root.children.map(c=>c.name),['자료','자료']);assert.notEqual(root.children[0].key,root.children[1].key);
});
test('Browse category filtering uses stable routing keys while search uses display names',()=>{
 const key=library.categoryParts(entries[1]).join(' / ');assert.deepEqual(ui.filterEntries(entries,key,'자료 Beta',false,new Set()).map(e=>e.id),['library:b-file']);
});
test('personal footer refreshes when native layer selection changes',()=>{
 const entry=entries[0],variant=entry.variants[0],one=ui.footerSignature(entry,variant,{}, {numSelectedLayers:1},false,true),none=ui.footerSignature(entry,variant,{}, {numSelectedLayers:0},false,true);assert.notEqual(one,none);
});

test('Texture footer follows target role changes with the same selected-layer count',()=>{const entry=entries[0],v=entry.variants[0],sig=options=>ui.footerSignature(entry,v,{}, {numSelectedLayers:1,precompApplyOptions:options},false,true);assert.notEqual(sig({canApplyTexture:false}),sig({canApplyTexture:true}));assert.notEqual(sig({canApplyTexture:true}),sig({canReplaceTexture:true}));});
test('empty registered folders remain navigable without fake grid entries',()=>{
 assert.equal(typeof library.folderPaths,'function');
 const paths=library.folderPaths({folders:[{id:'empty',name:'빈 폴더',missing:true}]}),tree=ui.buildCategoryTree([],paths);
 assert.equal(tree.count,0);assert.equal(tree.children[0].name,'User Library');assert.equal(tree.children[0].children[0].name,'빈 폴더');assert.equal(tree.children[0].children[0].count,0);
});
