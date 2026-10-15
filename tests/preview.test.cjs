const test=require('node:test'),assert=require('node:assert/strict');
const preview=require('../preview.js');
test('transition cut selects two different authored scene identities without crossfade',()=>{
 const profile={kind:'camera',duration:1,cutOffset:.3,fidelity:'nested-motion-pending'};
 assert.equal(preview.sampleProfile(profile,.899).sceneId,'A');
 assert.equal(preview.sampleProfile(profile,.901).sceneId,'B');
 assert.notDeepEqual(preview.sceneDescription('A'),preview.sceneDescription('B'));
 assert.equal(preview.sampleProfile(profile,.299).mix,undefined);
});
test('sampled profiles preserve explicit variant direction and independent in/out curves',()=>{
 const row=(x)=>[x,0,0,1,1,1,0,1,0];
 const left={kind:'layer',inDuration:1,outDuration:2,samples:{in:[row(-100),row(0)],out:[row(-200),row(0)]}};
 const right={...left,samples:{in:[row(100),row(0)],out:[row(200),row(0)]}};
 const a=preview.sampleProfile(left,3.1),b=preview.sampleProfile(right,3.1);
 assert.ok(a.position[0]<0);assert.ok(b.position[0]>0);
 assert.equal(preview.interpolateRows(left.samples.in,.5)[0],-50);
 assert.ok(Math.abs(preview.sampleProfile(left,1.6).position[0]+100)<1e-10);
});
test('missing/unmeasured profiles never fabricate an animated transform',()=>{
 assert.equal(preview.sampleProfile(null,.5).ready,false);
 assert.equal(preview.sampleProfile({kind:'camera',duration:1,cutOffset:.2},.5).ready,false);
 assert.throws(()=>preview.interpolateRows([[0],[NaN]],.5),/finite/);
});
test('AE-rendered own previews accept only explicit local video assets',()=>{
 assert.equal(preview.renderedSource({}),null);
 assert.equal(preview.renderedSource({renderedPreview:'library/previews/camera left.webm'}),'library/previews/camera%20left.webm');
 for(const source of ['https://example.com/a.mp4','../secret.webm','C:\\a.webm','/a.mp4','library/image.png'])assert.throws(()=>preview.renderedSource({renderedPreview:source}));
});
test('rendered videos pause outside the grid and release their source on unmount',()=>{
 const fs=require('fs'),vm=require('vm'),path=require('path'),videos=[];let callback,disconnected=0;
 const context={window:{},document:{createElement(tag){assert.equal(tag,'video');const video={tagName:'VIDEO',isConnected:true,plays:0,pauses:0,loads:0,setAttribute(){},removeAttribute(name){delete this[name];},play(){this.plays++;return Promise.resolve();},pause(){this.pauses++;},load(){this.loads++;}};videos.push(video);return video;}},IntersectionObserver:class{constructor(cb){callback=cb;}observe(){}disconnect(){disconnected++;}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../preview.js'),'utf8'),context);
 const api=context.window.ContentriumPreview,wrap={appendChild(){},addEventListener(){}};
 for(let i=0;i<43;i++)api.mount(wrap,{name:'Camera'},{id:'camera'+i,name:'Left',renderedPreview:'library/previews/camera'+i+'.webm'});
 assert.equal(videos.length,43);assert.equal(videos[0].src,'library/previews/camera0.webm');assert.ok(videos.every(v=>v.muted));
 callback(videos.map((video,i)=>({target:video,isIntersecting:i<20})));
 assert.ok(videos.slice(0,20).every(v=>v.plays===1&&v.pauses===0));assert.ok(videos.slice(20).every(v=>v.plays===0&&v.pauses===1));
 callback(videos.map(video=>({target:video,isIntersecting:false})));
 assert.ok(videos.every(v=>v.pauses>=1));
 api.clear();assert.ok(videos.every(v=>v.pauses>=2&&v.src===undefined&&v.loads===1&&v.onerror===null));assert.equal(disconnected,1);
});
test('generated profiles cover the catalog and agree with the source API between baked points',()=>{
 const fs=require('fs'),vm=require('vm'),path=require('path'),data=require('../library/preview-profiles.json'),context={$:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../jsx/presets.jsx'),'utf8'),context);
 const source=context.$.cpPresetBuilder,kinds=['position','scale','rotation','opacity','blur'];
 for(const id of Object.keys(data.profiles)){
  const p=data.profiles[id];if(!p.samples||!p.samples.in)continue;
  assert.ok(p.midpointToleranceRatio<=1);
  for(const side of ['in','out'])for(let i=0;i<1024;i++){
   const t=(i+.37)/1024,row=preview.interpolateRows(p.samples[side],t,p.sampleTimes[side]);
   const exact=p.kind==='text'?require('../tools/build-preview-profiles.cjs').textRow(source,id,t,side):kinds.flatMap(k=>source.sample(id,t,k,side));
   exact.forEach((v,j)=>{const tolerance=p.kind==='text'?(j%10===9?.02:data.midpointTolerances[j%10]):data.midpointTolerances[j];assert.ok(Math.abs(v-row[j])<=tolerance*1.05,`${id}/${side}/${j}: ${Math.abs(v-row[j])}`);});
  }
 }
});
test('edge profiles retain their exact pivot and text spring profiles animate per glyph',()=>{
 const p=require('../library/preview-profiles.json').profiles;
 assert.deepEqual(p.ddd.origin,[.5,1]);assert.deepEqual(p.ddf.origin,[0,.5]);assert.deepEqual(p.de1.origin,[1,.5]);assert.deepEqual(p.de3.origin,[.5,0]);
 const a=preview.sampleProfile(p['18c'],p['18c'].outDuration+.6+p['18c'].inDuration*.35);
 assert.equal(a.glyphs.length,11);assert.ok(a.glyphs.some(g=>Math.abs(g[1])>.01));
 assert.notDeepEqual(a.glyphs[0],a.glyphs[10]);assert.equal(preview.sampleProfile(p['17e1'],0).ready,true);
});
