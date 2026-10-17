const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../ui-core.js');
const catalog = require('../library/catalog.json');

function entry(overrides) {
  return Object.assign({
    id: 'group-01', name: 'Ease Position', category: ['Animation Presets', 'Motion', '2D Transitions'],
    defaultId: 'v-right', variants: [
      { id: 'v-left', name: 'Left', type: 1 },
      { id: 'v-right', name: 'Right', type: 1 },
    ],
  }, overrides);
}

test('ancestor, group and one leaf complete a query while sibling leaves never combine', () => {
  const e = entry();
  const hit = core.matchEntry(e, '2D ease left');
  assert.equal(hit.matches, true);
  assert.equal(hit.matchKind, 'variant');
  assert.equal(hit.matchingVariantId, 'v-left');
  assert.deepEqual(hit.matchingVariantIds, ['v-left']);
  assert.equal(core.matchEntry(e, 'left right').matches, false);
  assert.equal(core.matchEntry(e, 'unknown left').matches, false);
});

test('ancestor-only and group-only search retain a valid default hint and all variants', () => {
  for (const query of ['motion', 'ease', '', '   ', '& --']) {
    const result = core.matchEntry(entry(), query);
    assert.equal(result.matches, true);
    assert.equal(result.matchKind, 'entry');
    assert.equal(result.matchingVariantId, 'v-right');
    assert.deepEqual(result.matchingVariantIds, ['v-left', 'v-right']);
  }
});

test('first complete matching variant wins by catalog order, even when default matches later', () => {
  const e = entry({ variants: [{ id: 'a', name: 'Left Near', type: 1 }, { id: 'b', name: 'Left Far', type: 1 }], defaultId: 'b' });
  const hit = core.matchEntry(e, 'left');
  assert.equal(hit.matchingVariantId, 'a');
  assert.deepEqual(hit.matchingVariantIds, ['a', 'b']);
  assert.equal(core.matchEntry(e, 'left far').matchingVariantId, 'b');
});

test('invalid default falls back only to a real first variant and empty variants are safe', () => {
  assert.equal(core.matchEntry(entry({ defaultId: 'foreign' }), 'motion').matchingVariantId, 'v-left');
  const noLeaves = core.matchEntry(entry({ variants: [] }), 'motion');
  assert.equal(noLeaves.matches, true);
  assert.equal(noLeaves.matchingVariantId, null);
  assert.deepEqual(noLeaves.matchingVariantIds, []);
  assert.equal(core.matchEntry(null, 'motion').matches, false);
});

test('case, repeated words and punctuation separators preserve name substring matching', () => {
  const e = entry();
  assert.equal(core.matchEntry(e, 'MOTION / POSIT, left left').matchingVariantId, 'v-left');
  assert.equal(core.matchEntry(e, 'position-left').matches, true);
  assert.equal(core.matchEntry(e, 'easezzz').matches, false);
});

test('Unicode Korean, accented names and decomposed characters remain searchable', () => {
  const e = entry({ name: '한글 색상', category: ['교육 영상'], variants: [{ id: 'ko', name: '왼쪽 Café', type: 1 }] });
  assert.equal(core.matchEntry(e, '교육 / 색상 왼쪽').matchingVariantId, 'ko');
  assert.equal(core.matchEntry(e, '없는글자').matches, false);
  assert.equal(core.matchEntry(e, 'cafe\u0301').matches, true);
});

test('only real transition/effect presetCodes arrays provide exact code token matches', () => {
  const e = entry({ variants: [{ id: 'coded', name: 'Bottom', type: 3, presetCodes: ['PX123', 'FX9'] }] });
  const hit = core.matchEntry(e, 'motion px123');
  assert.equal(hit.matches, true);
  assert.equal(hit.matchingVariantId, 'coded');
  assert.equal(hit.matchedBy, 'preset-code');
  assert.equal(core.matchEntry(e, 'px12').matches, false);
  assert.equal(core.matchEntry(e, 'fx9').matches, true);
  assert.equal(core.matchEntry(entry({ variants: [{ id: 'x', name: 'Bottom', type: 10, presetCodes: ['PX123'] }] }), 'px123').matches, false);
});

test('unrelated code/generator fields and IDs are not fabricated preset codes', () => {
  const e = entry({ variants: [{ id: 'leaf99', name: 'Bottom', type: 1, code: 'FAKECODE', generator: { code: 'FAKE2' } }] });
  assert.equal(core.matchEntry(e, 'fakecode').matches, false);
  assert.equal(core.matchEntry(e, 'fake2').matches, false);
  assert.equal(core.matchEntry(e, 'leaf9').matches, false);
  assert.equal(core.matchEntry(e, 'motion leaf99').matches, false);
});

test('diagnostic exact ID queries are explicit and route to the exact leaf', () => {
  const e = entry();
  const byLeaf = core.matchEntry(e, ' V-LEFT ');
  assert.equal(byLeaf.matches, true);
  assert.equal(byLeaf.matchedBy, 'exact-id');
  assert.equal(byLeaf.matchKind, 'variant');
  assert.equal(byLeaf.matchingVariantId, 'v-left');
  assert.deepEqual(byLeaf.matchingVariantIds, ['v-left']);
  const byEntry = core.matchEntry(e, 'GROUP-01');
  assert.equal(byEntry.matchKind, 'entry');
  assert.equal(byEntry.matchingVariantId, 'v-right');
  assert.equal(core.matchEntry(e, 'group-0').matches, false);
});

test('searchEntries preserves entry identity/order and only returns matching records', () => {
  const entries = [entry({ id: 'first' }), entry({ id: 'other', name: 'Shadow', category: [] ,variants: [] }), entry({ id: 'third' })];
  const result = core.searchEntries(entries, 'motion left');
  assert.deepEqual(result.map(r => r.entry.id), ['first', 'third']);
  assert.equal(result[0].entry, entries[0]);
  assert.equal(result[1].entry, entries[2]);
  assert.ok(result.every(r => r.matches && r.matchingVariantId === 'v-left'));
  assert.deepEqual(core.searchEntries(null, 'x'), []);
});

test('search never mutates frozen inputs or shares mutable result arrays', () => {
  const e = entry();
  e.category = Object.freeze(e.category);
  e.variants.forEach(Object.freeze);
  Object.freeze(e.variants); Object.freeze(e);
  const first = core.matchEntry(e, 'motion');
  first.matchingVariantIds.pop();
  assert.deepEqual(core.matchEntry(e, 'motion').matchingVariantIds, ['v-left', 'v-right']);
});

test('all 43 current entries and 110 real variant IDs route without invented metadata', () => {
  const entries = catalog.entries;
  assert.equal(entries.length, 43);
  assert.equal(entries.flatMap(e => e.variants).length, 110);
  assert.equal(core.searchEntries(entries, '').length, 43);
  for (const e of entries) for (const v of e.variants) {
    const hit = core.matchEntry(e, v.id);
    assert.equal(hit.matches, true, v.id);
    assert.equal(hit.matchingVariantId, v.id);
    assert.equal(hit.matchedBy, 'exact-id');
    assert.equal(Object.hasOwn(v, 'presetCodes'), false);
  }
  const ease = entries.find(e => e.id === '9e5');
  assert.equal(core.matchEntry(ease, 'motion ease left').matchingVariantId, '9e6');
  assert.equal(core.matchEntry(ease, 'left right').matches, false);
  assert.deepEqual(core.searchEntries(entries, 'no-such-family-98765'), []);
});
