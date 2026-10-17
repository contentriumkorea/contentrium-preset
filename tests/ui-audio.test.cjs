const test=require('node:test'),assert=require('node:assert/strict');
const audio=require('../ui-audio.js');
test('audio semitones use exact power-of-two playback rates and measured bounds',()=>{
 assert.equal(audio.playbackRate(0),1);assert.equal(audio.playbackRate(12),2);assert.equal(audio.playbackRate(-24),.25);
 assert.throws(()=>audio.playbackRate(25),/24/);assert.throws(()=>audio.playbackRate(NaN));
});
test('reversing audio makes independent sample copies and leaves channels unchanged',()=>{
 const source=[new Float32Array([.1,.5,-.25]),new Float32Array([1,0,-1])],copy=audio.reverseChannels(source);
 assert.deepEqual(Array.from(copy[1]),[-1,0,1]);assert.deepEqual(Array.from(source[1]),[1,0,-1]);assert.notEqual(copy[0],source[0]);
});
test('waveform bins preserve positive and negative extrema and do not invent samples',()=>{
 assert.deepEqual(audio.envelope(new Float32Array([0,.5,-1,.2]),2),[[0,.5],[-1,Math.fround(.2)]]);
 assert.deepEqual(audio.envelope(new Float32Array([]),2),[[0,0],[0,0]]);
 assert.equal(audio.basicOnly(104857600),false);assert.equal(audio.basicOnly(104857601),true);
});
test('PCM export writes a standard interleaved 16-bit WAV without preview gain',()=>{
 const wav=audio.encodeWav([new Float32Array([-1,0,1]),new Float32Array([1,0,-1])],8000),view=new DataView(wav);
 assert.equal(Buffer.from(wav).subarray(0,4).toString(),'RIFF');assert.equal(view.getUint32(4,true),48);assert.equal(view.getUint16(22,true),2);assert.equal(view.getUint32(24,true),8000);assert.equal(view.getUint16(34,true),16);assert.equal(view.getUint32(40,true),12);
 assert.deepEqual(Array.from({length:6},(_,i)=>view.getInt16(44+i*2,true)),[-32768,32767,0,0,32767,-32768]);
});
