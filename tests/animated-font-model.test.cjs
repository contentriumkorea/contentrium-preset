const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = path.join(__dirname, '../jsx/animated-font-model.jsx');
function model() {
  assert.ok(fs.existsSync(source), 'pure animated-font model module is missing');
  const context = { $: {} };
  vm.runInNewContext(fs.readFileSync(source, 'utf8'), context, { filename: source });
  assert.equal(typeof context.$.cpGlyphModel?.validatePack, 'function', 'pure model API is missing');
  return context.$.cpGlyphModel;
}
const plain = value => JSON.parse(JSON.stringify(value));
const copy = plain;
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`); }
function coded(fn, code, details) {
  assert.throws(fn, error => {
    assert.equal(error.code, code);
    if (details) for (const key of Object.keys(details)) assert.equal(error.details[key], details[key]);
    return true;
  });
}
function fixture() {
  // Independently authored test polygons; not a runtime font or a font outline.
  function key(time, width, height, tangent = 0) {
    return { time, vertices: [[0, 0], [width, 0], [width, -height], [0, -height]],
      inTangents: [[tangent, 0], [0, 0], [0, 0], [0, 0]],
      outTangents: [[0, tangent], [0, 0], [0, 0], [0, 0]] };
  }
  function glyph(codePoint, advance, width) {
    return { codePoint, advance, paths: [{ closed: true, keys: [
      key(0, 0, 0), key(.2, width / 2, 350, 10), key(.4, width, 700),
      key(.5, width + 20, 720, 20), key(.6, width, 700),
      key(.8, width / 2, 350, 10), key(1, 0, 0)
    ] }] };
  }
  return { schemaVersion: 1, id: 'independent-polygon-test', digest: 'test-only-geometry', name: 'Test polygons',
    provenance: { author: 'Contentrium independent tests', license: 'Test fixture only' },
    metrics: { em: 1000, ascent: 800, descent: 200 }, clock: { entryEnd: .4, bodyEnd: .6, duration: 1 },
    defaults: { duration: 2, inSpeed: 100, outSpeed: 100, inDelay: .1, outDelay: .1,
      inReverse: false, outReverse: false, size: 100, tracking: 20, color: [1, .5, .25] },
    limits: { maxScalars: 8 }, glyphs: [glyph(65, 600, 400), glyph(66, 500, 300), { codePoint: 32, advance: 250, paths: [] }] };
}
function create(overrides = {}) {
  return { mode: 'create', atTime: 1, totalDuration: 2, frameDuration: 1 / 30,
    inSpeed: 100, outSpeed: 100, inDelay: .1, outDelay: .1,
    inReverse: false, outReverse: false, inEnabled: true, outEnabled: true, ...overrides };
}
function read(timing, overrides = {}) {
  const { inPoint, inMarker, outMarker, outPoint, frameDuration, inDelay, outDelay,
    inReverse, outReverse, inEnabled, outEnabled } = timing;
  return { mode: 'read', inPoint, inMarker, outMarker, outPoint, frameDuration, inDelay, outDelay,
    inReverse, outReverse, inEnabled, outEnabled, ...overrides };
}
function state(api, text = 'AB', controls = {}, request = create(), pack = fixture()) {
  const layout = api.layout(pack, text, controls);
  return { pack, layout, timing: api.resolveTiming(pack, layout, request) };
}
function sample(api, s, time) { return api.sample(s.pack, s.layout, s.timing, time); }
function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}

test('GlyphPackValidation: rejects malformed clocks, scalar IDs, topology, keys and nonfinite geometry', () => {
  const api = model(), good = fixture();
  assert.deepEqual(plain(api.validatePack(good)), plain(good));
  const badCases = [
    p => { p.schemaVersion = 2; }, p => { p.glyphs.push(copy(p.glyphs[0])); },
    p => { p.glyphs[0].codePoint = 0xd800; }, p => { p.glyphs[0].codePoint = 0x110000; },
    p => { p.glyphs[0].advance = -1; }, p => { p.glyphs[2].advance = 0; },
    p => { p.metrics.em = 0; }, p => { p.metrics.ascent = Infinity; },
    p => { p.clock.bodyEnd = .4; }, p => { p.clock.duration = NaN; },
    p => { p.limits.maxScalars = 0; }, p => { p.defaults.inSpeed = 0; },
    p => { p.defaults.size = 0; }, p => { p.defaults.color = [1, 0, Infinity]; },
    p => { p.defaults.inReverse = 'false'; }, p => { p.provenance.license = ''; },
    p => { p.glyphs[0].paths = []; }, p => { p.glyphs[0].paths[0].closed = 1; },
    p => { p.glyphs[0].paths[0].keys[1].vertices.pop(); },
    p => { p.glyphs[0].paths[0].keys[1].inTangents.pop(); },
    p => { p.glyphs[0].paths[0].keys[1].time = 0; },
    p => { p.glyphs[0].paths[0].keys[0].time = .01; },
    p => { p.glyphs[0].paths[0].keys[6].time = .99; },
    p => { p.glyphs[0].paths[0].keys[2].vertices[1][0] = 401; },
    p => { p.glyphs[0].paths[0].keys[2].outTangents[0][0] = 1; },
    p => { p.glyphs[0].paths[0].keys[1].vertices[1][0] = Infinity; }
  ];
  for (const mutate of badCases) { const pack = fixture(); mutate(pack); coded(() => api.validatePack(pack), 'INVALID_GLYPH_PACK'); }
});

test('GlyphUnicode: exact scalar coverage, errors, spaces and astral scalar slot counts', () => {
  const api = model(), pack = fixture();
  for (const text of ['', '   ', '\nA', 'A\rB', 'A\tB', 'A\u0000', 'A\u007f', 'A\u0085', '\ud800', 'A\udc00', 'A\u2028B', 'A\u2029B']) {
    coded(() => api.layout(pack, text, {}), 'INVALID_GLYPH_TEXT');
  }
  coded(() => api.layout(pack, 'AC', {}), 'UNSUPPORTED_GLYPH', { index: 1, scalar: 67 });
  coded(() => api.layout(pack, 'a', {}), 'UNSUPPORTED_GLYPH', { index: 0, scalar: 97 });
  coded(() => api.layout(pack, 'AAAAAAAAA', {}), 'GLYPH_LIMIT_EXCEEDED', { index: 8, scalar: 65 });
  assert.equal(api.layout(pack, 'AAAAAAAA', {}).glyphs.length, 8);
  pack.glyphs.push({ ...copy(pack.glyphs[0]), codePoint: 0x1f600 });
  const layout = api.layout(pack, 'A 😀B', {});
  assert.equal(layout.text, 'A 😀B');
  assert.deepEqual(plain(layout.glyphs).map(g => [g.textIndex, g.glyphIndex, g.codePoint]), [[0, 0, 65], [2, 1, 0x1f600], [3, 2, 66]]);
  assert.equal(api.layout(pack, '😀😀😀😀😀😀😀😀', {}).glyphs.length, 8);
  coded(() => api.layout(pack, '😀😀😀😀😀😀😀😀😀', {}), 'GLYPH_LIMIT_EXCEEDED', { index: 8, scalar: 0x1f600 });
});

test('GlyphLayout: scalar tracking, centered advance, independent offsets and em-space transforms', () => {
  const api = model(), pack = fixture();
  const ab = api.layout(pack, 'AB', {}), spaced = api.layout(pack, 'A B', { offsets: { 0: [10, -20], 2: [-30, 40] }, verticalStagger: 25, characterRotation: 15, skew: -8 });
  assert.equal(ab.width, 1120);
  assert.deepEqual(plain(ab.glyphs).map(g => [g.x, g.y, g.advance, g.offset]), [[-560, 0, 600, [0, 0]], [60, 0, 500, [0, 0]]]);
  assert.equal(spaced.width, 1390);
  assert.deepEqual(plain(spaced.glyphs).map(g => [g.textIndex, g.glyphIndex, g.x, g.offset]), [[0, 0, -695, [10, -20]], [2, 1, 195, [-30, 40]]]);
  const timing = api.resolveTiming(pack, spaced, create());
  const result = plain(api.sample(pack, spaced, timing, 1));
  assert.deepEqual(result.map(g => g.position), [[-685, -20], [165, 65]]);
  assert.deepEqual(result.map(g => [g.scale, g.rotation, g.skew, g.color]), [[.1, 15, -8, [1, .5, .25]], [.1, 15, -8, [1, .5, .25]]]);
  assert.equal(spaced.controls.duration, 2);
  assert.deepEqual(plain(ab.controls.offsets), { 0: [0, 0], 1: [0, 0] });
  for (const controls of [{ size: 0 }, { tracking: NaN }, { verticalStagger: Infinity }, { characterRotation: NaN }, { skew: Infinity }, { color: [1, 0, NaN] }, { offsets: { 1: [0, 0] } }, { offsets: { 0: [NaN, 0] } }, { inDelay: -1 }]) {
    coded(() => api.layout(pack, 'A B', controls), 'INVALID_GLYPH_TEXT');
  }
});

test('GlyphClock: create/read authority retains fractional seconds and derives live speeds', () => {
  const api = model(), s = state(api), t = s.timing;
  assert.deepEqual([t.inPoint, t.inMarker, t.outMarker, t.outPoint], [.5, 1, 2, 2.5]);
  assert.deepEqual([t.entryLength, t.bodyLength, t.exitLength], [.4, .6 - .4, 1 - .6]);
  near(t.inPhaseDuration, .4); near(t.outPhaseDuration, .4); near(t.inSpan, .5); near(t.outSpan, .5);
  const points = sample(api, s, .7); near(points[0].sourceTime, .2); near(points[1].sourceTime, .1);
  const fractional = state(api, 'AB', {}, create({ atTime: 3.069736, totalDuration: 2.013579 })).timing;
  assert.equal(fractional.inMarker, 3.069736); assert.equal(fractional.inPoint, 2.569736);
  near(fractional.outPoint, 4.583315); near(fractional.outMarker, 4.083315);
  assert.notEqual(fractional.inPoint, Math.round(fractional.inPoint * 30) / 30);
  const reread = api.resolveTiming(s.pack, s.layout, read(t, { inMarker: 1.4, outMarker: 1.9 }));
  near(reread.inSpeed, 50); near(reread.outSpeed, 80);
  assert.equal(reread.inMarker, 1.4); assert.equal(reread.outMarker, 1.9);
  const zero = state(api, 'AB', {}, create({ inDelay: 0, outDelay: 0 }));
  near(zero.timing.inPoint, .6); near(zero.timing.outMarker, 2.2);
  near(sample(api, zero, .8)[0].sourceTime, .2); near(sample(api, zero, .8)[1].sourceTime, .2);
});

test('GlyphClock: exact before/start/end/whole-cycle body/exit endpoints and disabled sides', () => {
  const api = model(), s = state(api);
  const cases = [[.4, 'before', 0], [.5, 'entry', 0], [.7, 'entry', .2], [.9, 'body', .4],
    [1.01, 'body', .5], [2, 'exit', .6], [2.2, 'exit', .8], [2.4, 'after', 1], [3, 'after', 1]];
  for (const [time, phase, sourceTime] of cases) { const row = sample(api, s, time)[0]; assert.equal(row.phase, phase, `at ${time}`); near(row.sourceTime, sourceTime); }
  const lastEnd = sample(api, s, 2.5)[1]; assert.equal(lastEnd.phase, 'after'); near(lastEnd.sourceTime, 1);
  const cycle = state(api, 'A', {}, create({ inDelay: 0, outDelay: 0 }));
  near(sample(api, cycle, 1.05)[0].sourceTime, .45);
  near(sample(api, cycle, 1.2)[0].sourceTime, .4);
  near(sample(api, cycle, 2.2)[0].sourceTime, .6);
  const noIn = state(api, 'AB', {}, create({ inEnabled: false }));
  assert.equal(noIn.timing.inMarker, 1); assert.equal(sample(api, noIn, -10)[0].phase, 'body');
  near(sample(api, noIn, -10)[0].sourceTime, .4); near(sample(api, noIn, .7)[0].sourceTime, .4);
  const noOut = state(api, 'AB', {}, create({ outEnabled: false }));
  assert.equal(noOut.timing.outMarker, 2); assert.equal(sample(api, noOut, 10)[0].phase, 'body'); near(sample(api, noOut, 10)[0].sourceTime, .4);
  const neither = state(api, 'AB', {}, create({ inEnabled: false, outEnabled: false, totalDuration: .8 }));
  for (const time of [-10, .5, 10]) for (const row of sample(api, neither, time)) { assert.equal(row.phase, 'body'); near(row.sourceTime, .4); }
  const zeroBody = api.resolveTiming(s.pack, s.layout, read(s.timing, { inEnabled: false, outEnabled: false, inMarker: 1.5, outMarker: 1.5 }));
  for (const row of api.sample(s.pack, s.layout, zeroBody, 1.5)) { assert.equal(row.phase, 'body'); near(row.sourceTime, .4); }
});

test('GlyphClock: invalid missing/crossed spans, body gap, delays, booleans and frame data fail', () => {
  const api = model(), s = state(api);
  for (const overrides of [{ totalDuration: 1 }, { totalDuration: 0 }, { frameDuration: 0 }, { inDelay: -1 }, { inSpeed: 0 }, { outSpeed: Infinity }, { atTime: NaN }, { inEnabled: 1 }, { outReverse: undefined }]) {
    coded(() => api.resolveTiming(s.pack, s.layout, create(overrides)), 'INVALID_GLYPH_TIMING');
  }
  for (const overrides of [{ inMarker: undefined }, { outMarker: null }, { outPoint: .4 }, { inMarker: .4 }, { outMarker: 2.6 }, { inMarker: 2.1 }, { inDelay: .5 }, { outDelay: .5 }, { outMarker: 1.01 }]) {
    coded(() => api.resolveTiming(s.pack, s.layout, read(s.timing, overrides)), 'INVALID_GLYPH_TIMING');
  }
  // A disabled stored span can cross the other marker but must stay inside the root.
  const disabled = api.resolveTiming(s.pack, s.layout, read(s.timing, { inEnabled: false, inMarker: 2.2 }));
  assert.equal(disabled.inMarker, 2.2);
  coded(() => api.resolveTiming(s.pack, s.layout, read(disabled, { inEnabled: true })), 'INVALID_GLYPH_TIMING');
  const exactGap = state(api, 'AB', {}, create({ totalDuration: 1 + 1 / 30 }));
  near(exactGap.timing.outMarker - exactGap.timing.inMarker, 1 / 30);
  coded(() => sample(api, s, NaN), 'INVALID_GLYPH_TIMING');
});

test('GlyphClock: unequal source entry/exit lengths reverse both phase and visible rank', () => {
  const api = model(), pack = fixture();
  // Keep neutral states at .4/.6, extend the authored exit endpoint to 1.2.
  pack.clock.duration = 1.2;
  for (const glyph of pack.glyphs) for (const path of glyph.paths) path.keys.at(-1).time = 1.2;
  const s = state(api, 'A B', {}, create({ inReverse: true, outReverse: true, totalDuration: 3 }), pack);
  near(s.timing.inSpan, .7); near(s.timing.outSpan, .5); near(s.timing.inPoint, .3);
  const rows = sample(api, s, .5);
  near(rows[0].sourceTime, 1.1); near(rows[1].sourceTime, 1);
  const exit = sample(api, s, 2.95);
  near(exit[0].sourceTime, .35); near(exit[1].sourceTime, .25);
  for (const row of sample(api, s, 10)) near(row.sourceTime, 0);
});

test('GlyphPathSample: authored vertices and tangents interpolate linearly with fresh exact topology', () => {
  const api = model(), s = state(api, 'A');
  const row = sample(api, s, .7)[0]; // Single glyph starts .6; source .1 is halfway to key .2.
  near(row.sourceTime, .1);
  const geometry = row.paths[0]; assert.equal(geometry.closed, true);
  near(geometry.vertices[1][0], 100); near(geometry.vertices[2][1], -175);
  near(geometry.inTangents[0][0], 5); near(geometry.outTangents[0][1], 5);
  assert.equal(geometry.vertices.length, 4);
  assert.deepEqual(plain(sample(api, s, .6)[0].paths[0].vertices), [[0, 0], [0, 0], [0, 0], [0, 0]]);
  const neutral = sample(api, s, 1)[0].paths[0];
  assert.deepEqual(plain(neutral.vertices), [[0, 0], [400, 0], [400, -700], [0, -700]]);
});

test('GlyphInputImmutability: frozen plain inputs stay unchanged and every nested result is fresh', () => {
  const api = model(), pack = freeze(fixture()), controls = freeze({ offsets: { 0: [7, 9] }, color: [.2, .4, .6] });
  const packBefore = JSON.stringify(pack), controlsBefore = JSON.stringify(controls);
  const validated = api.validatePack(pack); validated.glyphs[0].paths[0].keys[0].vertices[0][0] = 999;
  const layout = freeze(api.layout(pack, 'AB', controls)), layoutBefore = JSON.stringify(layout), request = freeze(create());
  const timing = freeze(api.resolveTiming(pack, layout, request)), timingBefore = JSON.stringify(timing);
  const first = sample(api, { pack, layout, timing }, .7), second = sample(api, { pack, layout, timing }, .7);
  first[0].paths[0].vertices[0][0] = 999; first[0].color[0] = 99; first[0].position[0] = 999;
  assert.notEqual(second[0].paths[0].vertices[0][0], 999); assert.notEqual(second[0].color[0], 99);
  assert.notEqual(second[0].position[0], 999);
  assert.equal(JSON.stringify(pack), packBefore); assert.equal(JSON.stringify(controls), controlsBefore);
  assert.equal(JSON.stringify(layout), layoutBefore); assert.equal(JSON.stringify(timing), timingBefore);
  const next = api.layout(pack, 'AB', controls); next.controls.offsets[0][0] = 123;
  assert.equal(layout.controls.offsets[0][0], 7);
  const another = api.resolveTiming(pack, layout, request); another.inMarker = 123;
  assert.equal(timing.inMarker, 1);
});

module.exports = { fixture, create, read, model, plain };


test('an exact authored key boundary retains its geometry despite decimal interpolation roundoff',()=>{
 const api=model(),p=fixture();p.clock={entryEnd:.5,bodyEnd:1.5,duration:2};const key=(time,y)=>({time,vertices:[[0,y],[10,y],[10,y+20]],inTangents:[[0,0],[0,0],[0,0]],outTangents:[[0,0],[0,0],[0,0]]});p.glyphs=[{codePoint:65,advance:20,paths:[{closed:true,keys:[key(0,0),key(.3,-.52),key(.5,4),key(1.5,4),key(2,0)]}]}];assert.doesNotThrow(()=>api.validatePack(p));
});
