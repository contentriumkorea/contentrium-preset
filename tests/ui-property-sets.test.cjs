const test=require('node:test'),assert=require('node:assert/strict'),sets=require('../ui-property-sets.js');
test('explicit unsupported property-set groups reject requests while legacy absent actions still work',()=>{
 for(const actions of [[],['reset'],[{id:'getAvailablePresets',enabled:false}],null])for(const action of ['getAvailablePresets','apply','remove','saveAs'])assert.throws(()=>sets.request(action,{key:'glyph',actions},{presetId:'p',name:'n'},null));
 for(const group of [{key:'legacy'},{key:'advertised',actions:['getAvailablePresets']},{key:'object',actions:[{id:'getAvailablePresets',enabled:true}]}])for(const action of ['getAvailablePresets','apply','remove','saveAs'])assert.equal(sets.request(action,group,{presetId:'p',name:'n'},null).action,action);
 const mixed={key:'mixed',actions:['getAvailablePresets'],canSave:false};assert.equal(sets.request('getAvailablePresets',mixed,{},null).action,'getAvailablePresets');assert.equal(sets.request('apply',mixed,{presetId:'p'},null).presetId,'p');assert.throws(()=>sets.request('saveAs',mixed,{name:'n'},null));
});
test('property-set actions require explicit group identity and valid selected presets',()=>{
 assert.deepEqual(sets.request('saveAs',{key:'variant:in:text'}, {name:' My values '},{projectKey:'p'}),{action:'saveAs',groupKey:'variant:in:text',name:'My values',context:{projectKey:'p'}});
 assert.deepEqual(sets.request('apply',{key:'variant:out'}, {presetId:'p1'},null),{action:'apply',groupKey:'variant:out',presetId:'p1',context:null});
 assert.throws(()=>sets.request('apply',{key:'v'}, {},null),/프리셋/);assert.throws(()=>sets.request('saveAs',{key:'v',canSave:false,reason:'혼합값'}, {name:'n'},null),/혼합값/);
 assert.throws(()=>sets.request('saveAs',{key:'v'}, {name:' '},null),/이름/);assert.throws(()=>sets.request('unknown',{key:'v'}, {},null));
});
