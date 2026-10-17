const test=require('node:test'),assert=require('node:assert/strict'),core=require('../ui-core.js');
test('declared display precision formats without changing numeric value and preserves missing precision',()=>{
 assert.equal(core.formatNumericDisplay(100.00000037253,2),'100');assert.equal(core.formatNumericDisplay(1.2356,2),'1.24');
 assert.equal(core.formatNumericDisplay(-2.345,0),'-2');assert.equal(core.formatNumericDisplay(-.0001,2),'0');
 assert.equal(core.formatNumericDisplay(1e25,2),'1e+25');assert.equal(core.formatNumericDisplay(1e-8,12),'1e-8');
 assert.equal(core.formatNumericDisplay(100.00000037253,undefined),'100.00000037253');
 assert.equal(core.displayPrecision({precision:0,def:{precision:2}}),0);assert.equal(core.displayPrecision({def:{precision:3}}),3);assert.equal(core.displayPrecision({}),undefined);
});
test('invalid declared precision definitions reject without coercion',()=>{
 for(const precision of [-1,1.5,13,NaN,Infinity,'2',null,true]){assert.throws(()=>core.displayPrecision({precision}));assert.throws(()=>core.formatNumericDisplay(1,precision));}
 assert.throws(()=>core.formatNumericDisplay(NaN,2));assert.throws(()=>core.formatNumericDisplay(Infinity,2));
});

