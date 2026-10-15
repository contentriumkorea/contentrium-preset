const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.resolve(__dirname, '../jsx/engine.jsx');
const source = fs.readFileSync(sourcePath, 'utf8');

// Execute the real public facade; only AE objects and separately tested modules are stubs.
function host({ active = true, selected = [1], precompResult, instances = {} } = {}) {
  const events = [];
  const loaded = [];
  const audioRoot = 'C:/Fixture User/Contentrium/Preset/UserAudio';
  const catalog = { entries: [{
    id: 'title', name: 'Title fixture', text: false,
    variants: [{ id: 'pc-fixture', name: 'Two lines', type: 10, available: true }],
  }] };
  function CompItem() {}
  function TextLayer() {}
  const comp = new CompItem();
  const layers = [1, 2, 3].map(index => ({
    id: 100 + index, index, name: `Fixture ${index}`,
    selected: selected.includes(index), containingComp: comp,
  }));
  function updateIndices() { layers.forEach((layer, i) => { layer.index = i + 1; }); }
  Object.assign(comp, { time: 1.25, layer: index => layers[index - 1] });
  Object.defineProperties(comp, {
    numLayers: { get: () => layers.length },
    selectedLayers: { get: () => layers.filter(layer => layer.selected) },
  });
  function File(name) {
    if (!(this instanceof File)) return new File(name);
    this.fsName = path.resolve(name);
    this.name = path.basename(this.fsName);
    this.exists = true;
    this.open = () => this.name === 'catalog.json';
    this.read = () => JSON.stringify(catalog);
    this.close = () => true;
  }
  Object.defineProperty(File.prototype, 'parent', {
    get() { return new File(path.dirname(this.fsName)); },
  });
  const $ = {
    fileName: sourcePath,
    evalFile(file) {
      loaded.push(file.name);
      if (file.name === 'presets.jsx') {
        $.cpPresetBuilder = { build() { throw new Error('Precomp must bypass overlay recipes'); } };
      } else if (file.name === 'overlay-engine.jsx') {
        $.cpOverlay = { controls: () => [], instances: () => [] };
      } else if (file.name === 'audio-engine.jsx') {
        $.cpAudio = { root: audioRoot };
      } else if (file.name === 'precomp-engine.jsx') {
        $.cpPrecomp = {
          apply(target, variant, options, root) {
            events.push({ kind: 'precompApply', target, variant: { ...variant }, options, root });
            const created = [{ id: 501, name: 'New title root', containingComp: comp, selected: false }];
            layers.unshift(...created);
            updateIndices();
            return { layers: created, instanceId: 'native-fixture-501', ...precompResult };
          },
          instances(layer) {
            return (instances[layer.id] || []).map(item => ({
              ...item, missingAudio: item.missingAudio && [...item.missingAudio],
            }));
          },
          controls: () => [],
        };
      } else throw new Error(`Unexpected module: ${file.name}`);
    },
  };
  const context = { $, File, CompItem, TextLayer, app: {
    version: '26.5-fixture', project: { activeItem: active ? comp : null },
    beginUndoGroup(name) { events.push({ kind: 'begin', name }); },
    endUndoGroup() { events.push({ kind: 'end' }); },
  } };
  vm.runInNewContext(source, context, { filename: sourcePath });
  function call(method, payload = {}) {
    return JSON.parse($.contentriumPreset.call(method, JSON.stringify(payload)));
  }
  return { call, comp, layers, events, loaded, audioRoot };
}

test('facade apply exposes precomp warnings and missing audio without losing its successful receipt', () => {
  const warnings = ['Personal sound swish is unavailable; visual preset applied.'];
  const missingAudio = ['swish', 'impact'];
  const h = host({ precompResult: { warnings, missingAudio } });
  const reply = h.call('applyPreset', { variantId: 'pc-fixture', direction: 'out', duration: 2.5 });
  assert.equal(reply.ok, true);
  assert.deepEqual(reply.result.warnings, warnings);
  assert.deepEqual(reply.result.missingAudio, missingAudio);
  assert.equal(reply.result.instanceId, 'native-fixture-501');
  assert.equal(reply.result.appliedLayers, 1);
  assert.equal(reply.result.variantId, 'pc-fixture');
  assert.deepEqual(h.comp.selectedLayers.map(layer => layer.name), ['New title root']);
  const apply = h.events.find(event => event.kind === 'precompApply');
  assert.equal(apply.target, h.comp);
  assert.equal(apply.options.direction, 'out');
  assert.equal(apply.options.duration, 2.5);
  assert.equal(apply.options.time, 1.25);
  assert.deepEqual(h.events.map(event => event.kind), ['begin', 'precompApply', 'end']);
});

test('facade keeps empty audio arrays when a successful precomp has no audio diagnostics', () => {
  const h = host();
  const reply = h.call('applyPreset', { variantId: 'pc-fixture' });
  assert.equal(reply.ok, true);
  assert.deepEqual(reply.result.warnings, []);
  assert.deepEqual(reply.result.missingAudio, []);
});

test('getState deduplicates missing sounds across selected instances and ignores unselected layers', () => {
  const h = host({ selected: [1, 2], instances: {
    101: [{ instanceId: 'shared-title', variantId: 'pc-fixture', missingAudio: ['swish', 'impact', 'swish'] }],
    102: [
      { instanceId: 'shared-title', variantId: 'pc-fixture', missingAudio: ['impact', 'click'] },
      { instanceId: 'silent-title', variantId: 'pc-fixture' },
    ],
    103: [{ instanceId: 'unselected-title', variantId: 'pc-fixture', missingAudio: ['not-selected'] }],
  } });
  const first = h.call('getState');
  const second = h.call('getState');
  assert.equal(first.ok, true);
  assert.deepEqual(first.result.audio, { missing: ['swish', 'impact', 'click'], root: h.audioRoot });
  assert.equal(first.result.numSelectedLayers, 2);
  assert.deepEqual(second, first, 'repeated read must not corrupt or accumulate audio state');
  assert.deepEqual(h.events, [], 'reading state must not open Undo groups or apply a preset');
});

test('hostStatus exposes the audio library root with and without an active composition', () => {
  for (const active of [true, false]) {
    const h = host({ active, selected: [1, 2] });
    const reply = h.call('hostStatus');
    assert.equal(reply.ok, true);
    assert.equal(reply.result.audioRoot, h.audioRoot);
    assert.equal(reply.result.version, '26.5-fixture');
    assert.equal(reply.result.hasComposition, active);
    assert.equal(reply.result.selectedLayers, active ? 2 : 0);
    assert.equal(reply.result.capabilities.captureUserPreset, false);
    assert.deepEqual(h.loaded, ['presets.jsx', 'overlay-engine.jsx', 'audio-engine.jsx', 'precomp-engine.jsx']);
    assert.deepEqual(h.events, []);
  }
});

test('getState without a composition still returns a usable audio library location', () => {
  const h = host({ active: false });
  const reply = h.call('getState');
  assert.equal(reply.ok, true);
  assert.equal(reply.result.numSelectedLayers, 0);
  assert.deepEqual(reply.result.audio, { missing: [], root: h.audioRoot });
  assert.deepEqual(reply.result.controls, []);
  assert.deepEqual(reply.result.applied, []);
});
