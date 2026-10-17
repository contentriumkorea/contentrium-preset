const test=require('node:test'),assert=require('node:assert/strict'),workspace=require('../ui-workspace.js'),panel=require('../panel.js');
const state=(ids,comp=1)=>({context:{projectKey:'fixture',compositionId:comp,layerIds:ids},frameDuration:1/24});
test('selection tracking never infers click order from an initial sorted multi-selection',()=>{
 const tracker=workspace.createSelectionOrderTracker();
 assert.equal(tracker.update(state([2,9]),1000).known,false);
 assert.equal(tracker.update(state([2,9,12]),1500).known,false);
 assert.deepEqual(tracker.update(state([]),2000).ids,[]);
 assert.deepEqual(tracker.update(state([9]),2500).ids,[9]);
 assert.deepEqual(tracker.update(state([2,9]),3000).ids,[9,2]);
 assert.deepEqual(tracker.update(state([2,7,9]),3500).ids,[9,2,7]);
 assert.deepEqual(tracker.update(state([2,7]),4000).ids,[2,7]);
});
test('ambiguous additions, disconnected observation and changed composition reset tracked order honestly',()=>{
 const tracker=workspace.createSelectionOrderTracker();tracker.update(state([9]),1000);
 assert.equal(tracker.update(state([2,7,9]),1500).known,false);
 tracker.update(state([9]),2000);tracker.update(state([2,9]),2500);
 assert.equal(tracker.update(state([2,9]),6000).known,false);
 assert.equal(tracker.update(state([2,9],2),6500).known,false);
 assert.deepEqual(tracker.update(state([7],2),7000).ids,[7]);
 assert.equal(tracker.update({},7500).known,false);
});
test('selection-order requests carry only a complete current observed order',()=>{
 assert.deepEqual(workspace.selectionOrderParams({known:true,ids:[9,2]},state([2,9])),{selectionOrder:[9,2]});
 assert.throws(()=>workspace.selectionOrderParams({known:false,ids:[]},state([2,9])),/순서/);
 assert.throws(()=>workspace.selectionOrderParams({known:true,ids:[9]},state([2,9])),/선택/);
});
test('shifter numeric input means frames, signed timecodes normalize overflow and use native frameDuration',()=>{
 const s={frameDuration:1/24};
 assert.equal(workspace.parseShifterTime('12',s),.5);assert.equal(workspace.parseShifterTime('-12f',s),-.5);
 assert.equal(workspace.parseShifterTime('+00:00:01:12',s),1.5);
 assert.equal(workspace.parseShifterTime('00:00:00.48',s),2);
 assert.equal(workspace.parseShifterTime('00:00:60:00',s),60);
 assert.equal(workspace.formatShifterTime(.5,s),'+00:00:00:12');
 for(const value of ['=12','+=12','1.5','24:00:00:00','not time'])assert.throws(()=>workspace.parseShifterTime(value,s));
 assert.throws(()=>workspace.parseShifterTime('1',{frameDuration:0}));
});
test('shifter drop-frame labels normalize to the first non-dropped label and preserve seconds',()=>{
 const s={frameDuration:1001/30000,dropFrame:true};
 const value=workspace.parseShifterTime('00:01:00;00',s);
 assert.ok(Math.abs(value-1800*1001/30000)<1e-9);
 assert.equal(workspace.formatShifterTime(value,s),'+00:01:00;02');
 assert.equal(workspace.parseShifterTime('-00:01:00;00',s),-value);
});
test('footer signature is stable across read-only host revisions and changes with actual action availability',()=>{
 const entry={id:'entry',name:'Preset'},variant={id:'v',name:'Variant',type:10,available:true},host={applyOptions:{byVariant:{v:{canReplace:true}}}},s={numSelectedLayers:1,precompApplyOptions:{canReplace:true}};
 const key=panel.footerSignature(entry,variant,host,s,false,true);
 assert.equal(key,panel.footerSignature(entry,variant,host,{...s,revision:99,instanceId:'new-selection'},false,true));
 assert.notEqual(key,panel.footerSignature(entry,variant,host,{numSelectedLayers:0},false,true));
 assert.notEqual(key,panel.footerSignature(entry,variant,host,{numSelectedLayers:1,precompApplyOptions:{canReplace:false},applied:[{type:10}]},false,true));
 assert.notEqual(key,panel.footerSignature(entry,variant,host,s,true,true));
});
