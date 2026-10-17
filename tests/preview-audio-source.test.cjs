const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const source = require('../preview-audio-source.js');

function fixture(t) {
  const tempRoot = path.resolve(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(tempRoot, 'cp-preview-audio-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(dir)), tempRoot);
    assert.ok(path.basename(dir).startsWith('cp-preview-audio-test-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const audioRoot = path.join(dir, 'UserAudio'), extensionPath = path.join(dir, 'extension');
  const previews = path.join(audioRoot, 'Previews'), video = path.join(extensionPath, 'library', 'previews', 'a.webm');
  fs.mkdirSync(previews, { recursive: true }); fs.mkdirSync(path.dirname(video), { recursive: true });
  fs.writeFileSync(video, Buffer.from('OWN TEST VIDEO BYTES'));
  const videoSha256 = crypto.createHash('sha256').update(fs.readFileSync(video)).digest('hex');
  const variant = { id: 'a', renderedPreview: 'library/previews/a.webm' };
  const manifest = path.join(previews, 'library.json'), clip = path.join(previews, 'a.wav');
  function writeManifest(data = { schemaVersion: 1, previews: { a: { file: 'a.wav', videoSha256 } } }) { fs.writeFileSync(manifest, JSON.stringify(data)); }
  function writeWav() {
    const bytes = Buffer.alloc(46); bytes.write('RIFF'); bytes.writeUInt32LE(38, 4); bytes.write('WAVEfmt ', 8);
    bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(48000, 24);
    bytes.writeUInt32LE(96000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(2, 40);
    fs.writeFileSync(clip, bytes);
  }
  function resolver(extra) { return source.createResolver(Object.assign({ audioRoot, extensionPath }, extra)); }
  return { dir, audioRoot, extensionPath, previews, video, videoSha256, variant, manifest, clip, writeManifest, writeWav, resolver };
}

test('prepared clip requires the actual rendered video SHA and returns an encoded local URL', async t => {
  const f = fixture(t); f.writeManifest(); f.writeWav();
  const result = await f.resolver()({ variant: f.variant });
  assert.equal(result.status, 'ready'); assert.equal(result.url, pathToFileURL(fs.realpathSync(f.clip)).href);
  assert.equal(result.offset, 0); assert.equal(result.videoSha256, f.videoSha256); assert.deepEqual(result.missing, []);
});

test('only the Previews manifest is consulted; registered source assets never become invented clips', async t => {
  const f = fixture(t), reads = [];
  fs.writeFileSync(path.join(f.audioRoot, 'library.json'), JSON.stringify({ schemaVersion: 1, assets: { existing: 'licensed.wav' } }));
  const native = require;
  const resolver = f.resolver({ nodeRequire(name) {
    if (name !== 'fs') return native(name);
    return Object.assign({}, fs, { readFile(file, ...args) { reads.push(file); return fs.readFile(file, ...args); } });
  } });
  const result = await resolver({ variant: f.variant });
  assert.equal(result.status, 'missing'); assert.equal(result.reason, 'manifest-missing');
  assert.deepEqual(result.missing, ['Previews/library.json']); assert.ok(!reads.includes(path.join(f.audioRoot, 'library.json')));
});

test('missing registration and missing clip identify the exact private filename', async t => {
  const f = fixture(t); f.writeManifest({ schemaVersion: 1, previews: {} });
  let result = await f.resolver()({ variant: f.variant });
  assert.equal(result.reason, 'clip-not-registered'); assert.deepEqual(result.missing, ['Previews/a.wav']);
  f.writeManifest(); result = await f.resolver()({ variant: f.variant });
  assert.equal(result.reason, 'clip-missing'); assert.deepEqual(result.missing, ['Previews/a.wav']);
});

test('a changed video cannot reuse a previously prepared audio clip', async t => {
  const f = fixture(t); f.writeManifest(); f.writeWav(); fs.appendFileSync(f.video, 'CHANGED');
  const result = await f.resolver()({ variant: f.variant });
  assert.equal(result.status, 'missing'); assert.equal(result.reason, 'video-changed');
  assert.notEqual(result.videoSha256, f.videoSha256); assert.equal(result.url, undefined);
});

test('manifest filenames are exact safe variant basenames, never arbitrary assets', async t => {
  const f = fixture(t);
  for (const file of ['../licensed.wav', 'other.wav', 'C:/secret.wav', 'a.mp3', '%61.wav']) {
    f.writeManifest({ schemaVersion: 1, previews: { a: { file, videoSha256: f.videoSha256 } } });
    await assert.rejects(f.resolver()({ variant: f.variant }), e => e.code === 'PREVIEW_AUDIO_SCHEMA');
  }
});

test('invalid schemas, hashes and unexpected fields fail explicitly without a fallback', async t => {
  const f = fixture(t);
  for (const data of [{ schemaVersion: 2, previews: {} }, { schemaVersion: 1, previews: [] },
    { schemaVersion: 1, previews: { a: { file: 'a.wav', videoSha256: 'wrong' } } },
    { schemaVersion: 1, previews: {}, assets: { a: 'licensed.wav' } }]) {
    f.writeManifest(data); await assert.rejects(f.resolver()({ variant: f.variant }), e => e.code === 'PREVIEW_AUDIO_SCHEMA');
  }
  fs.writeFileSync(f.manifest, '{broken'); await assert.rejects(f.resolver()({ variant: f.variant }), e => e.code === 'PREVIEW_AUDIO_SCHEMA');
});

test('video lookup rejects remote URLs and traversal before using caller paths', async t => {
  const f = fixture(t); f.writeManifest(); f.writeWav();
  for (const renderedPreview of ['../outside.webm', '/outside.webm', 'https://example.com/a.webm', 'C:/a.webm', 'library/../a.webm']) {
    await assert.rejects(f.resolver()({ variant: { id: 'a', renderedPreview } }), e => e.code === 'PREVIEW_AUDIO_PATH');
  }
});

test('realpath boundaries reject a Previews directory junction escaping UserAudio', async t => {
  const f = fixture(t), outside = path.join(f.dir, 'outside'); fs.mkdirSync(outside);
  fs.rmdirSync(f.previews); fs.symlinkSync(outside, f.previews, 'junction');
  await assert.rejects(f.resolver()({ variant: f.variant }), e => e.code === 'PREVIEW_AUDIO_PATH');
});

test('a non-WAV file is never announced ready merely because it has a wav suffix', async t => {
  const f = fixture(t); f.writeManifest(); fs.writeFileSync(f.clip, 'not audio');
  await assert.rejects(f.resolver()({ variant: f.variant }), e => e.code === 'PREVIEW_AUDIO_INVALID_WAV');
});

test('abort stops resolution and no filesystem content is written by successful repeated reads', async t => {
  const f = fixture(t); f.writeManifest(); f.writeWav(); const controller = new AbortController(); controller.abort();
  await assert.rejects(f.resolver()({ variant: f.variant, signal: controller.signal }), e => e.name === 'AbortError');
  const before = [f.manifest, f.clip, f.video].map(p => fs.readFileSync(p).toString('hex'));
  const resolver = f.resolver(); await resolver({ variant: f.variant }); await resolver({ variant: f.variant });
  assert.deepEqual([f.manifest, f.clip, f.video].map(p => fs.readFileSync(p).toString('hex')), before);
});

test('manifest example contains no audio source mapping or automatic mixing instructions', () => {
  const hash = 'a'.repeat(64);
  assert.deepEqual(source.manifestExample('9e4', hash), { schemaVersion: 1, previews: { '9e4': { file: '9e4.wav', videoSha256: hash } } });
  assert.throws(() => source.manifestExample('../x', hash));
});

test('without CEP Node access the browser reports unavailable instead of fetching a remote fallback', async () => {
  const vm = require('node:vm'), context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../preview-audio-source.js'), 'utf8'), context);
  const result = await context.window.ContentriumPreviewAudioSource.createResolver({ audioRoot: '/user', extensionPath: '/extension' })({ variant: { id: 'a' } });
  assert.equal(result.status, 'unavailable'); assert.equal(result.reason, 'node-unavailable');
});

test('CEP Node injection uses the same verified local resolution without a CommonJS global', async t => {
  const f = fixture(t); f.writeManifest(); f.writeWav();
  const vm = require('node:vm'), context = { window: { cep_node: { require } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../preview-audio-source.js'), 'utf8'), context);
  const result = await context.window.ContentriumPreviewAudioSource.createResolver({ audioRoot: f.audioRoot, extensionPath: f.extensionPath })({ variant: f.variant });
  assert.equal(result.status, 'ready'); assert.equal(result.videoSha256, f.videoSha256);
});

test('a rendered-video directory junction cannot escape the extension root', async t => {
  const f = fixture(t); f.writeManifest(); f.writeWav();
  const outside = path.join(f.dir, 'outside-video'); fs.mkdirSync(outside); fs.copyFileSync(f.video, path.join(outside, 'a.webm'));
  fs.unlinkSync(f.video); fs.rmdirSync(path.dirname(f.video)); fs.symlinkSync(outside, path.dirname(f.video), 'junction');
  await assert.rejects(f.resolver()({ variant: f.variant }), e => e.code === 'PREVIEW_AUDIO_PATH');
});

test('relative configuration roots and oversized manifests fail before accepting any sound', async t => {
  const f = fixture(t);
  assert.throws(() => source.createResolver({ audioRoot: '.', extensionPath: f.extensionPath }), e => e.code === 'PREVIEW_AUDIO_PATH');
  fs.writeFileSync(f.manifest, ' '.repeat(262145));
  await assert.rejects(f.resolver()({ variant: f.variant }), e => e.code === 'PREVIEW_AUDIO_SCHEMA');
});

test('CEP extension roots accept file URIs and one percent-encoded filesystem path', async t => {
  const f = fixture(t); f.writeManifest(); f.writeWav();
  const renamed = path.join(f.dir, 'extension with space #'); fs.renameSync(f.extensionPath, renamed);
  for (const extensionPath of [pathToFileURL(renamed).href, encodeURI(renamed), encodeURIComponent(renamed)]) {
    const result = await source.createResolver({ audioRoot: f.audioRoot, extensionPath })({ variant: f.variant });
    assert.equal(result.status, 'ready'); assert.equal(result.videoSha256, f.videoSha256);
  }
});


test('CEP Node promises that never settle cannot stall callback-based missing or ready resolution', async t => {
  const f = fixture(t), calls = [];
  const nodeFs = Object.assign({}, fs, { promises: new Proxy({}, { get() { return () => new Promise(() => {}); } }) });
  for (const method of ['realpath','stat','readFile','open','fstat','read','close']) {
    nodeFs[method] = (...args) => { calls.push(method); return fs[method](...args); };
  }
  for (const method of ['realpathSync','statSync','readFileSync','openSync','fstatSync','readSync','closeSync']) {
    nodeFs[method] = () => { throw new Error('Preview reads must not block the CEP browser'); };
  }
  const resolver = f.resolver({ nodeRequire(name) { return name === 'fs' ? nodeFs : require(name); } });
  async function bounded(request) {
    let timer;
    try { return await Promise.race([resolver(request),new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Node Promise boundary stalled')),250);})]); }
    finally { clearTimeout(timer); }
  }
  const missing = await bounded({ variant:f.variant });
  assert.equal(missing.status,'missing');assert.equal(missing.reason,'manifest-missing');
  f.writeManifest();f.writeWav();
  const ready = await bounded({ variant:f.variant });
  assert.equal(ready.status,'ready');assert.equal(ready.videoSha256,f.videoSha256);
  for(const method of ['realpath','stat','readFile','open','fstat','read','close']) assert.ok(calls.includes(method),method);
});


test('callback file-descriptor failures propagate and close the opened WAV exactly once', async t => {
  const f=fixture(t);f.writeManifest();f.writeWav();let opened,closed=0;
  const nodeFs=Object.assign({},fs,{
    open(file,flags,callback){fs.open(file,flags,(error,fd)=>{opened=fd;callback(error,fd);});},
    fstat(fd,callback){assert.equal(fd,opened);const error=new Error('owned fstat failure');error.code='EIO';callback(error);},
    close(fd,callback){assert.equal(fd,opened);closed++;fs.close(fd,callback);}
  });
  const resolver=f.resolver({nodeRequire(name){return name==='fs'?nodeFs:require(name);}});
  await assert.rejects(resolver({variant:f.variant}),error=>error.code==='EIO');assert.equal(closed,1);
});

test('explicit preparer takes precedence and never falls back from missing or failed mapped sources', async t => {
  const f=fixture(t);f.writeManifest();f.writeWav();
  const missing={status:'missing',reason:'source-missing',missing:['owned.wav']};
  assert.deepEqual(await f.resolver({preparer:{resolve:async()=>missing}})({variant:f.variant}),missing);
  await assert.rejects(f.resolver({preparer:{resolve:async()=>{throw Error('decode failed');}}})({variant:f.variant}),/decode failed/);
  const ready={status:'ready',url:'file:///prepared-cache.wav',offset:0};
  assert.deepEqual(await f.resolver({preparer:{resolve:async()=>ready}})({variant:f.variant}),ready);
});

test('unmapped preparer preserves compatibility with a manually prepared clip', async t => {
  const f=fixture(t);f.writeManifest();f.writeWav();
  const result=await f.resolver({preparer:{resolve:async()=>({status:'missing',reason:'recipe-missing'})}})({variant:f.variant});
  assert.equal(result.status,'ready');assert.equal(result.url,pathToFileURL(fs.realpathSync(f.clip)).href);
});
