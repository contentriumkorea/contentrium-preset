const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '../ui-theme.js');
const theme = fs.existsSync(file) ? require(file) : {};
const EVENT = 'com.adobe.csxs.events.ThemeColorChanged';

function fixture(environment, cep = true) {
  const css = new Map(), attributes = new Map(), events = new Map(), windowEvents = new Map(), queries = [];
  let value = environment, calls = 0;
  const root = {
    style: {
      setProperty(k, v, priority = '') { css.set(k, {value: String(v), priority}); },
      getPropertyValue(k) { return css.get(k)?.value || ''; },
      getPropertyPriority(k) { return css.get(k)?.priority || ''; },
      removeProperty(k) { const old = css.get(k)?.value || ''; css.delete(k); return old; },
    },
    setAttribute(k, v) { attributes.set(k, String(v)); },
    getAttribute(k) { return attributes.has(k) ? attributes.get(k) : null; },
    removeAttribute(k) { attributes.delete(k); },
  };
  const scope = {
    document: {documentElement: root, activeElement: {id: 'draft'}}, devicePixelRatio: 1,
    addEventListener(name, fn) { if (!windowEvents.has(name)) windowEvents.set(name, new Set()); windowEvents.get(name).add(fn); },
    removeEventListener(name, fn) { windowEvents.get(name)?.delete(fn); },
    matchMedia(query) {
      const listeners = new Set(); const q = {media: query, listeners,
        addEventListener(name, fn) { if (name === 'change') listeners.add(fn); },
        removeEventListener(name, fn) { if (name === 'change') listeners.delete(fn); }};
      queries.push(q); return q;
    },
  };
  if (cep) scope.__adobe_cep__ = {
    getHostEnvironment() { calls++; if (value instanceof Error) throw value; return value; },
    addEventListener(name, fn) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); },
    removeEventListener(name, fn) { events.get(name)?.delete(fn); },
  };
  return {scope, root, css, attributes, events, windowEvents, queries,
    set(v) { value = v; }, get calls() { return calls; },
    emit(data) { for (const fn of [...(events.get(EVENT) || [])]) fn(data); },
    resize() { for (const fn of [...(windowEvents.get('resize') || [])]) fn(); }};
}
function environment(red, extra = {}) {
  return {appSkinInfo: {panelBackgroundColor: {type: 1, color: {red, green: red, blue: red}}}, ...extra};
}
function init(f) { assert.equal(typeof theme.init, 'function', 'independent host theme init is required'); return theme.init(f.scope); }
function ratio(a, b) {
  const lum = hex => {
    const rgb = hex.match(/[a-f\d]{2}/gi).map(v => parseInt(v, 16) / 255)
      .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

test('valid CEP colors select the exact red-channel threshold boundaries', () => {
  for (const [red, variant] of [[0,'darkest'],[40,'darkest'],[41,'dark'],[200,'dark'],[201,'light'],[255,'light']]) {
    const f = fixture(JSON.stringify(environment(red))), handle = init(f);
    assert.equal(handle.current().variant, variant); assert.equal(f.root.getAttribute('data-theme'), variant);
    assert.equal(f.root.style.getPropertyValue('color-scheme'), variant === 'light' ? 'light' : 'dark'); handle.dispose();
  }
});
test('object host-environment delivery works and event payload is not trusted as a theme', () => {
  const f = fixture(environment(60)), handle = init(f); f.set(environment(230));
  f.emit({data: {appSkinInfo: 'untrusted'}, arbitrary: true});
  assert.equal(handle.current().variant, 'light'); assert.equal(f.calls, 2); handle.dispose();
});
test('malformed host reads preserve the last valid theme with bounded diagnostics', () => {
  const f = fixture(environment(230)), handle = init(f), before = f.root.style.getPropertyValue('--bg');
  for (const invalid of ['{', null, [], environment(-1), environment(256), environment(NaN), {appSkinInfo:{panelBackgroundColor:{type:0,color:{red:1,green:1,blue:1}}}}, 'x'.repeat(65537), new Error('raw private details')]) {
    f.set(invalid); f.emit(null); assert.equal(handle.current().variant, 'light');
    assert.equal(f.root.style.getPropertyValue('--bg'), before);
    assert.equal(handle.current().diagnostic, 'HOST_ENVIRONMENT_UNAVAILABLE');
    assert.ok(!JSON.stringify(handle.current()).includes('raw private details'));
  }
  handle.dispose();
});
test('standalone starts dark and never invents a native host observation', () => {
  const f = fixture(null, false), handle = init(f);
  assert.equal(handle.current().variant, 'dark'); assert.equal(handle.current().source, 'standalone');
  assert.equal(f.root.style.getPropertyValue('--bg'), '#303030'); assert.equal(f.events.size, 0); handle.dispose();
});
test('refresh applies host changes without stealing keyboard focus or editing drafts', () => {
  const f = fixture(environment(30)), focused = f.scope.document.activeElement, handle = init(f);
  f.set(environment(230)); handle.refresh();
  assert.strictEqual(f.scope.document.activeElement, focused);
  assert.equal(f.windowEvents.has('keydown'), false); assert.equal(handle.current().variant, 'light'); handle.dispose();
});
test('one document gets one subscription and returned snapshots cannot mutate internal state', () => {
  const f = fixture(environment(60)), one = init(f), two = init(f);
  assert.strictEqual(one, two); assert.equal(f.events.get(EVENT).size, 1);
  const state = one.current(); state.variant = 'invented'; state.tokens['--bg'] = 'red';
  assert.equal(one.current().variant, 'dark'); assert.equal(one.current().tokens['--bg'], '#303030'); one.dispose();
});
test('DPI tracking updates CSS metadata without page zoom or root font-size changes', () => {
  const f = fixture(environment(60)), handle = init(f);
  f.scope.devicePixelRatio = 1.5; f.resize();
  assert.equal(handle.current().deviceScale, 1.5); assert.equal(f.root.style.getPropertyValue('--cp-device-scale'), '1.5');
  assert.equal(f.root.getAttribute('data-cp-device-scale'), '1.5');
  assert.equal(f.root.style.getPropertyValue('zoom'), ''); assert.equal(f.root.style.getPropertyValue('font-size'), '');
  f.scope.devicePixelRatio = 2; for (const fn of [...f.queries.at(-1).listeners]) fn();
  assert.equal(handle.current().deviceScale, 2); assert.ok(f.queries.at(-1).media.includes('2dppx')); handle.dispose();
});
test('malformed DPR uses safe unit scale and matchMedia legacy callbacks are cleaned', () => {
  const f = fixture(environment(60)); const oldListeners = new Set();
  f.scope.devicePixelRatio = Infinity;
  f.scope.matchMedia = () => ({addListener: fn => oldListeners.add(fn), removeListener: fn => oldListeners.delete(fn)});
  const handle = init(f); assert.equal(handle.current().deviceScale, 1); assert.equal(oldListeners.size, 1);
  handle.dispose(); assert.equal(oldListeners.size, 0);
});
test('dispose restores prior owned styles/attributes and preserves unrelated/newer writes', () => {
  const f = fixture(environment(60)); f.root.style.setProperty('--bg', 'pink', 'important');
  f.root.style.setProperty('--unrelated', 'kept'); f.root.setAttribute('data-theme', 'previous');
  const handle = init(f); f.root.style.setProperty('--accent', 'purple');
  handle.dispose(); handle.dispose();
  assert.equal(f.root.style.getPropertyValue('--bg'), 'pink'); assert.equal(f.root.style.getPropertyPriority('--bg'), 'important');
  assert.equal(f.root.style.getPropertyValue('--accent'), 'purple'); assert.equal(f.root.style.getPropertyValue('--unrelated'), 'kept');
  assert.equal(f.root.getAttribute('data-theme'), 'previous'); assert.equal(f.events.get(EVENT).size, 0);
  assert.equal(f.windowEvents.get('resize').size, 0); assert.ok(f.queries.every(q => q.listeners.size === 0));
  const calls = f.calls; f.emit({}); handle.refresh(); assert.equal(f.calls, calls);
  const again = init(f); assert.notStrictEqual(again, handle); again.dispose();
});
test('all themes retain readable text, muted labels, links and a visible keyboard focus ring', () => {
  for (const red of [20, 60, 230]) {
    const f = fixture(environment(red)), handle = init(f), tokens = handle.current().tokens;
    for (const surface of ['--bg','--raised','--selected']) {
      for (const foreground of ['--text','--muted','--accent']) assert.ok(ratio(tokens[foreground],tokens[surface]) >= 4.5, `${red}: ${foreground}/${surface}`);
      assert.ok(ratio(tokens['--focus-ring'], tokens[surface]) >= 3, `${red}: keyboard focus/${surface}`);
    }
    handle.dispose();
  }
});
