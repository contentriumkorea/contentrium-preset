const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../ui-core.js');
test('grid arrow navigation preserves its column at incomplete row boundaries',()=>{
  assert.equal(core.gridTarget(2,'ArrowUp',3,7),2);
  assert.equal(core.gridTarget(5,'ArrowDown',3,7),5);
  assert.equal(core.gridTarget(6,'s',3,7),6);
  assert.equal(core.gridTarget(0,'ArrowLeft',3,7),0);
});
test('grid horizontal movement crosses rows and Home End reach endpoints',()=>{
  assert.equal(core.gridTarget(2,'ArrowRight',3,7),3);
  assert.equal(core.gridTarget(3,'a',3,7),2);
  assert.equal(core.gridTarget(5,'Home',3,7),0);
  assert.equal(core.gridTarget(1,'End',3,7),6);
});
