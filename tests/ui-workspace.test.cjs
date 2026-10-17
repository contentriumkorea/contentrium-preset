const test=require('node:test'),assert=require('node:assert/strict');
const core=require('../ui-core.js');
test('Auto changes on instance replacement and manual Browse remains pinned',()=>{
 const selected={instanceId:'comp:layer:preset',numSelectedLayers:1,hasRootNode:true,wantsRevealEditTab:true};
 assert.equal(core.autoTab('browse','auto',null,selected,false),'edit');
 assert.equal(core.autoTab('browse','browse',null,selected,false),'browse');
 assert.equal(core.autoTab('edit','auto',selected.instanceId,{instanceId:'empty',numSelectedLayers:0},false),'browse');
 assert.equal(core.autoTab('browse','auto',null,selected,true),'browse');
 assert.equal(core.autoTab('browse','auto',null,{instanceId:'error',hasError:true},false),'edit');
 assert.equal(core.autoTab('browse','auto',selected.instanceId,selected,false),'browse');
});
test('relative input preserves intent and refuses nonfinite input and zero division',()=>{
 assert.deepEqual(core.parseNumeric('+=12',7),{value:12,relative:true});
 assert.deepEqual(core.parseNumeric('-=3.5',7),{value:-3.5,relative:true});
 assert.deepEqual(core.parseNumeric('-3',7),{value:-3,relative:false});
 assert.deepEqual(core.parseNumeric('*=2',7),{value:14,relative:false});
 assert.throws(()=>core.parseNumeric('/=0',7),/0/);
 assert.throws(()=>core.parseNumeric('*=2',null,true),/서로/);
 assert.throws(()=>core.parseNumeric('Infinity',7));
});
test('angle input preserves whole turns and signed relative changes',()=>{
 assert.deepEqual(core.parseAngle('2x+30',0),{value:750,relative:false});
 assert.deepEqual(core.parseAngle('-1x+45',0),{value:-315,relative:false});
 assert.deepEqual(core.parseAngle('+=1x+90',0),{value:450,relative:true});
});
test('time input uses actual frame duration and validates drop frame labels',()=>{
 const def={frameDuration:1/24};assert.deepEqual(core.parseTime('12f',def),{value:.5,relative:false});
 assert.equal(core.parseTime('00:01:02:12',def).value,62.5);
 assert.deepEqual(core.parseTime('+=3f',def),{value:.125,relative:true});
 const df={frameDuration:1001/30000,dropframe:true};
 assert.throws(()=>core.parseTime('00:01:00;00',df),/프레임/);
 assert.ok(Math.abs(core.parseTime('00:01:00;02',df).value-1800*1001/30000)<1e-8);
 assert.equal(core.formatTime(62.5,def),'00:01:02:12');
 assert.equal(core.parseTime('-00:00:00:12',def).value,-.5);
});
test('helper requests preserve native tool semantics and convert shifter frames only once',()=>{
 const workspace=require('../ui-workspace.js');
 assert.deepEqual(workspace.toolRequest('keyframes','selectByOrder',{from:'last'},1/30),{tool:'keyframes',action:'selectByOrder',params:{from:'last'}});
 assert.deepEqual(workspace.toolRequest('shifter','stagger',{target:'layers',frames:3,order:'selection'},1/24),{tool:'shifter',action:'stagger',params:{target:'layers',seconds:.125,order:'selection'}});
 assert.throws(()=>workspace.toolRequest('shifter','shift',{frames:1},0),/프레임/);
});
test('image sequence interpretation keeps an empty FPS native and validates an explicit rate',()=>{
 const workspace=require('../ui-workspace.js');assert.deepEqual(workspace.sequenceOptions(''),{});assert.deepEqual(workspace.sequenceOptions('23.976'),{conformFrameRate:23.976});
 for(const value of ['0','-1','100','Infinity','no'])assert.throws(()=>workspace.sequenceOptions(value),/프레임/);
});
test('easing preset storage rejects nonnumeric influence and keeps mode/order semantics',()=>{
 const workspace=require('../ui-workspace.js');
 assert.equal(workspace.defaultEasingPresets('single').length,6);
 assert.deepEqual(workspace.defaultEasingPresets('pairs')[1].values,[90,.1]);
 assert.deepEqual(workspace.easingPoint(90,45),{first:[.45,1],second:[.1,0]});
 assert.throws(()=>workspace.validEasingPreset({values:[Infinity,20],mode:'pairs'}),/영향도/);
});
test('automatic easing mode trusts the host and preserves the last valid mode on empty selection',()=>{
 const workspace=require('../ui-workspace.js');
 const state=mode=>({toolState:{easing:{selectionMode:mode}}});
 assert.deepEqual(workspace.resolveEasingMode(state('pairs'),'single'),{mode:'pairs',available:true,empty:false});
 assert.deepEqual(workspace.resolveEasingMode(state('single'),'pairs'),{mode:'single',available:true,empty:false});
 assert.deepEqual(workspace.resolveEasingMode(state('none'),'pairs'),{mode:'pairs',available:true,empty:true});
 assert.deepEqual(workspace.resolveEasingMode(state('none')), {mode:'single',available:true,empty:true});
 for(const invalid of [{},state('both'),state('')])assert.deepEqual(workspace.resolveEasingMode(invalid,'pairs'),{mode:'pairs',available:false,empty:false});
});
test('helper tutorial visibility is independent per tool and defaults to visible',()=>{
 const workspace=require('../ui-workspace.js');
 assert.equal(workspace.tutorialVisible({},'easing'),true);
 assert.equal(workspace.tutorialVisible({easing:false},'easing'),false);
 assert.equal(workspace.tutorialVisible({easing:false},'keyframes'),true);
 assert.equal(workspace.tutorialVisible(null,'anchor'),true);
 assert.equal(workspace.tutorialVisible({shifter:'false'},'shifter'),true);
});
test('manifest owns nine unique panel IDs and all entries load frontend modules in dependency order',()=>{
 const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..'),xml=fs.readFileSync(path.join(root,'CSXS/manifest.xml'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const list=xml.match(/<ExtensionList>([\s\S]*?)<\/ExtensionList>/)[1],ids=Array.from(list.matchAll(/Id="([^"]+)"/g),m=>m[1]);
 assert.equal(ids.length,9);assert.equal(new Set(ids).size,9);assert.ok(ids.every(id=>/^com\.contentrium\.preset(?:\.(?:edit|alt[234]|easing|keyframes|anchor|shifter))?$/.test(id)));
 for(const file of ['ui-core.js','ui-editor.js','ui-workspace.js'])assert.ok(html.indexOf(file)<html.indexOf('src="panel.js"'));
});
test('context token and actions remain explicit and unsupported actions disabled',()=>{
 assert.deepEqual(core.contextPayload({context:{projectKey:'p',compositionId:1,layerIds:[2]}}),{projectKey:'p',compositionId:1,layerIds:[2]});
 assert.equal(core.actionState([{id:'reset',enabled:false,reason:'선택 필요'}],'reset').enabled,false);
 assert.equal(core.actionState([], 'remove').enabled,false);
 assert.equal(core.actionState(['copy'],'copy').enabled,true);
});
test('preview activity can be suspended explicitly without deleting loaded media',()=>{
 const preview=require('../preview.js');
 assert.equal(preview.setPlaybackActive(false),false);
 assert.equal(preview.setPlaybackActive(true),true);
});
test('serialized CEP requests never overlap even after a timeout and recover on late callback',async()=>{
 const callbacks=[],started=[];const q=core.serialTransport((method,payload,done)=>{started.push(method);if(method==='second')setTimeout(()=>done(null,2),0);else callbacks.push(done);},{timeoutMs:12});
 const first=q('first',{}); const second=q('second',{});
 await assert.rejects(first,/시간/);assert.deepEqual(started,['first']);
 assert.equal(await Promise.race([q('third',{}).then(()=>false,()=>true),new Promise(r=>setTimeout(()=>r(false),5))]),true,'new operations must fail explicitly while a timed-out host call is still outstanding');
 callbacks.shift()(null,1);assert.equal(await second,2); // second callback supplied below by dispatch hook
});
