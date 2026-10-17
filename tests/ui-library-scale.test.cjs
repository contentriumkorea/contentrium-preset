const test=require('node:test'),assert=require('node:assert/strict'),ui=require('../panel.js');
test('wide category trees preserve sibling order and counts without quadratic scans',()=>{
 const entries=Array.from({length:5000},(_,i)=>({id:String(i),category:['Root','Folder '+i]})),find=Array.prototype.find;let calls=0,tree;
 try{Array.prototype.find=function(fn,...args){return find.call(this,(...v)=>{calls++;return fn(...v)},...args)};tree=ui.buildCategoryTree(entries);}finally{Array.prototype.find=find;}
 assert.equal(tree.count,5000);assert.equal(tree.children[0].children.length,5000);assert.equal(tree.children[0].children[4999].name,'Folder 4999');assert.ok(calls<50000,'linear lookup budget; actual '+calls);
});
test('row geometry covers the complete logical count with a bounded visible range',()=>{
 assert.equal(typeof ui.gridWindow,'function');
 const args={total:5000,width:800,height:430,minWidth:180,gap:7,left:6,right:6,top:3,labelHeight:34,scrollTop:0};
 const top=ui.gridWindow(args);assert.equal(top.columns,4);assert.equal(top.start,0);assert.ok(top.end<40);assert.equal(top.height,Math.ceil(5000/4)*top.stride-7);
 const last=ui.gridWindow({...args,scrollTop:top.height});assert.equal(last.end,5000);assert.ok(last.start<5000);assert.ok(last.end-last.start<40);
 const narrow=ui.gridWindow({...args,width:140});assert.equal(narrow.columns,1);assert.equal(narrow.cardWidth,128);
});
