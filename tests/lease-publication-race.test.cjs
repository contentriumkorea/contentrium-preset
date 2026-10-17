const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {host}=require('./cpu-host.cjs'),thumb=require('../ui-thumbnails.js');
function png(tag){const b=Buffer.alloc(25);Buffer.from('89504e470d0a1a0a','hex').copy(b);b.write('IHDR',12);b.writeUInt32BE(320,16);b.writeUInt32BE(2160,20);b[24]=tag;return b;}
for(const [name,call]of [['PNG',5],['manifest',7]])for(const action of ['replace-owner','cancel'])test(name+' precommit destination await rejects '+action,async()=>{
 const h=host(),root=path.join(h.dir,'source');let older,newer,release,timer;
 try{
 fs.mkdirSync(root);fs.writeFileSync(path.join(root,'own.mov'),'own video');h.api.addFolder({path:root,previewsLocation:'userFolder'});const item=JSON.parse(JSON.stringify(h.api.getLibrary().items[0])),cacheRoot=path.join(h.dir,'Contentrium/Preset/ThumbnailCache');
 const resolve=()=>JSON.parse(JSON.stringify(h.api.libraryPreviewDestination({id:item.id,sourceStamp:item.sourceStamp})));let calls=0,arrived;const reached=new Promise(r=>arrived=r),gate=new Promise(r=>release=r);
 older=thumb.create({cacheRoot,nodeRequire:require,windowId:'same-panel-slot',ownerId:'11111111111111111111111111111111',resolveDestination:async()=>{if(++calls===call){arrived();await gate;}return resolve();},render:async()=>png(1)});
 const pending=older.request(item,{force:true});await Promise.race([reached,new Promise((_,r)=>timer=setTimeout(()=>r(Error('GATE_NOT_REACHED')),3000))]);clearTimeout(timer);
 const dir=path.join(root,'.contentrium-preset-previews/v1');let before;
 if(action==='replace-owner'){
 newer=thumb.create({cacheRoot,nodeRequire:require,windowId:'same-panel-slot',ownerId:'22222222222222222222222222222222',resolveDestination:resolve,render:async()=>png(2)});
 const next=await newer.request(item,{force:true});assert.equal(next.state,'ready',JSON.stringify(next.error));
 before=Object.fromEntries(fs.readdirSync(dir).filter(n=>/\.(png|json)$/.test(n)).map(n=>[n,fs.readFileSync(path.join(dir,n)).toString('hex')]));
 }else{older.cancelAll();before=Object.fromEntries(fs.readdirSync(dir).filter(n=>/\.(png|json)$/.test(n)).map(n=>[n,fs.readFileSync(path.join(dir,n)).toString('hex')]));}
 release();const old=await pending;assert.equal(old.state,action==='cancel'?'canceled':'failed');assert.equal(old.artifact,null);
 const after=Object.fromEntries(fs.readdirSync(dir).filter(n=>/\.(png|json)$/.test(n)).map(n=>[n,fs.readFileSync(path.join(dir,n)).toString('hex')]));assert.deepEqual(after,before,'old owner/canceled job must not publish after async resolver returns');
 }finally{clearTimeout(timer);if(release)release();older?.destroy();newer?.destroy();h.cleanup();}
});
