const test = require('node:test'), assert = require('node:assert/strict');
const core = require('../ui-core.js');
test('each user-facing CEP panel displays its content when explicitly opened',()=>{
 const xml=require('node:fs').readFileSync(require('node:path').join(__dirname,'../CSXS/manifest.xml'),'utf8');
 const panels=[...xml.matchAll(/<Extension Id="([^"]+)">\s*<DispatchInfo>([\s\S]*?)<\/DispatchInfo>\s*<\/Extension>/g)];
 assert.equal(panels.length,9);
 for(const [,id,body]of panels){assert.match(body,/<Type>Panel<\/Type>/,id);assert.match(body,/<AutoVisible>true<\/AutoVisible>/,id+' must show its CEP content on load');assert.doesNotMatch(body,/<StartOn>/,id+' should not launch independently at application startup');}
});
test('detached Edit expiry re-evaluates Auto without changing the selected instance', () => {
  const state = {instanceId:'same',numSelectedLayers:1,hasRootNode:true,wantsRevealEditTab:true};
  assert.equal(core.autoTab('browse','auto','same',state,false,true),'edit');
  assert.equal(core.autoTab('edit','auto','same',state,true,false),'browse');
  assert.equal(core.autoTab('browse','browse','same',state,false,true),'browse');
  assert.equal(core.autoTab('browse','auto','same',state,false,false),'browse');
});
test('panel leases expire and unused additional slots are selected before reusing live ones', () => {
  assert.equal(core.panelIsLive({at:1000,token:'a'},4499),true);
  assert.equal(core.panelIsLive({at:1000,token:'a'},4500),false);
  assert.equal(core.panelIsLive({at:6000,token:'a'},5000),false);
  assert.equal(core.panelIsLive(null,5000),false);
  assert.equal(core.nextPanelSlot({2:true,3:false,4:false},2),3);
  assert.equal(core.nextPanelSlot({2:true,3:true,4:false},2),4);
  assert.equal(core.nextPanelSlot({2:false,3:true,4:true},3),2);
  assert.equal(core.nextPanelSlot({2:true,3:true,4:true},3),3);
});
test('settings signatures ignore key order and reject invalid storage payloads', () => {
  assert.equal(core.settingsSignature({b:false,a:true}),core.settingsSignature({a:true,b:false}));
  assert.notEqual(core.settingsSignature({a:true}),core.settingsSignature({a:false}));
  for(const value of [null,[],{a:'true'}])assert.equal(core.settingsSignature(value),null);
});
