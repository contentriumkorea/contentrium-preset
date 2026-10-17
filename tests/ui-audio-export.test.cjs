const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const adapter=require('../ui-audio-export.js'),audio=require('../ui-audio.js');
test('audio export writes only a single owned WAV atomically and preserves existing assets',()=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'cp-audio-ui-')),root=path.join(parent,'Contentrium','Preset','ProcessedAudio');fs.mkdirSync(root,{recursive:true});
 try{
  const wav=audio.encodeWav([new Float32Array([.5,0,-.5])],8000),target=path.join(root,'sound-p12-r1.wav');
  assert.deepEqual(adapter.atomicWriteAudio(fs,path,target,root,wav),{path:target,alreadyExists:false});assert.equal(fs.readFileSync(target).subarray(0,4).toString(),'RIFF');
  assert.equal(adapter.atomicWriteAudio(fs,path,target,root,wav).alreadyExists,true);
  assert.throws(()=>adapter.atomicWriteAudio(fs,path,path.join(parent,'escape.wav'),root,wav),/폴더/);
  assert.throws(()=>adapter.atomicWriteAudio(fs,path,path.join(root,'file.exe'),root,wav),/WAV/);
  assert.throws(()=>adapter.atomicWriteAudio(fs,path,path.join(root,'bad.wav'),root,new ArrayBuffer(44)),/WAV/);
  assert.deepEqual(fs.readdirSync(root),['sound-p12-r1.wav']);
 }finally{const actual=path.resolve(parent),temp=path.resolve(os.tmpdir());if(!actual.startsWith(temp+path.sep)||!path.basename(actual).startsWith('cp-audio-ui-'))throw Error('Unsafe cleanup');fs.rmSync(actual,{recursive:true,force:true});}
});
test('transform export failure never falls back to unmodified import',async()=>{
 await assert.rejects(adapter.prepare({itemId:'a',options:{pitchShift:12,reverse:false},player:{renderWav:async()=>{throw Error('render failed')}},call:async()=>({path:'not-used'}),cep:null,nodeRequire:null}),/After Effects|Node/);
});
test('prepare pipeline keeps click context, writes transformed bytes and reuses a completed cache',async()=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'cp-audio-ui-')),root=path.join(parent,'Contentrium','Preset','ProcessedAudio');fs.mkdirSync(root,{recursive:true});
 try{const target=path.join(root,'asset-p12-r1.wav'),context={projectKey:'p',compositionId:9,layerIds:[2]},calls=[],wav=audio.encodeWav([new Float32Array([.5,0,-.5])],8000);let renders=0;
 const cfg={itemId:'asset',options:{pitchShift:12,reverse:true},context,cep:{getSystemPath:key=>{assert.equal(key,'userData');return parent;}},nodeRequire:require,player:{renderWav:async()=>{renders++;return{bytes:wav,pitchShift:12,reverse:true};}},call:async(method,payload)=>{calls.push({method,payload});return{path:target,alreadyExists:fs.existsSync(target),sourceId:'asset',pitchShift:12,reverse:true};}};
 const result=await adapter.prepare(cfg);assert.equal(result.renderedAudioPath,target);assert.equal(renders,1);assert.deepEqual(calls[0],{method:'prepareAudioImport',payload:{id:'asset',options:{pitchShift:12,reverse:true},context}});
 await adapter.prepare(cfg);assert.equal(renders,1);assert.deepEqual(fs.readdirSync(root),['asset-p12-r1.wav']);
 }finally{const actual=path.resolve(parent),temp=path.resolve(os.tmpdir());if(!actual.startsWith(temp+path.sep)||!path.basename(actual).startsWith('cp-audio-ui-'))throw Error('Unsafe cleanup');fs.rmSync(actual,{recursive:true,force:true});}
});
