(function (scope) {
  'use strict';
  var EVENT = 'com.adobe.csxs.events.ThemeColorChanged';
  var instances = new WeakMap();
  var palettes = {
    dark: {
      '--bg': '#303030', '--raised': '#373737', '--line': '#252525', '--border': '#737373',
      '--text': '#dedede', '--muted': '#b9b9b9', '--selected': '#484848', '--accent': '#9bd4ff',
      '--focus-ring': '#b8e1ff', '--control-bg': '#292929', '--control-hover': '#484848',
      '--error-text': '#ffb4ab', '--warning-text': '#ffdba0', '--preview-bg': '#000000',
    },
    darkest: {
      '--bg': '#202020', '--raised': '#292929', '--line': '#161616', '--border': '#686868',
      '--text': '#eeeeee', '--muted': '#b9b9b9', '--selected': '#414141', '--accent': '#9bd4ff',
      '--focus-ring': '#b8e1ff', '--control-bg': '#191919', '--control-hover': '#414141',
      '--error-text': '#ffb4ab', '--warning-text': '#ffdba0', '--preview-bg': '#000000',
    },
    light: {
      '--bg': '#eeeeee', '--raised': '#fafafa', '--line': '#c5c5c5', '--border': '#777777',
      '--text': '#202020', '--muted': '#505050', '--selected': '#d6eaff', '--accent': '#005792',
      '--focus-ring': '#004876', '--control-bg': '#ffffff', '--control-hover': '#d6eaff',
      '--error-text': '#9c1c1c', '--warning-text': '#684500', '--preview-bg': '#000000',
    },
  };

  function hostVariant(raw) {
    try {
      var text = typeof raw === 'string' ? raw : JSON.stringify(raw);
      if (typeof text !== 'string' || text.length > 65536) return null;
      var value = JSON.parse(text), skin = value && value.appSkinInfo,
        background = skin && skin.panelBackgroundColor, color = background && background.color;
      if (!background || background.type !== 1 || !color) return null;
      if (!['red', 'green', 'blue'].every(function (key) {
        return typeof color[key] === 'number' && Number.isFinite(color[key]) && color[key] >= 0 && color[key] <= 255;
      })) return null;
      // Classify the CEP panel background by its red-channel thresholds.
      return color.red > 200 ? 'light' : color.red > 40 ? 'dark' : 'darkest';
    } catch (ignoreMalformedHost) { return null; }
  }

  function init(target) {
    target = target || scope;
    var document = target.document, root = document && document.documentElement;
    if (!root || !root.style) throw new Error('A theme document is required.');
    if (instances.has(document)) return instances.get(document);
    var cep = target.__adobe_cep__, disposed = false, subscribed = false,
      variant = 'dark', source = 'standalone', diagnostic = null, deviceScale = 1,
      oldStyles = new Map(), applied = new Map(), oldAttributes = new Map(), attributes = new Map(),
      query = null, queryScale = null, removeQuery = null, revision = 0, handle;

    function current() {
      return {variant: variant, source: source, diagnostic: diagnostic, deviceScale: deviceScale,
        revision: revision, tokens: Object.assign({}, palettes[variant])};
    }
    function style(key, value) {
      if (!oldStyles.has(key)) oldStyles.set(key, {value: root.style.getPropertyValue(key), priority: root.style.getPropertyPriority(key)});
      if (applied.get(key) === value) return;
      root.style.setProperty(key, value); applied.set(key, value);
    }
    function attribute(key, value) {
      if (!oldAttributes.has(key)) oldAttributes.set(key, root.getAttribute(key));
      if (attributes.get(key) === value) return;
      root.setAttribute(key, value); attributes.set(key, value);
    }
    function watchScale() {
      if (queryScale === deviceScale) return;
      if (removeQuery) removeQuery();
      query = null; removeQuery = null; queryScale = deviceScale;
      if (typeof target.matchMedia !== 'function') return;
      try {
        query = target.matchMedia('(resolution: ' + deviceScale + 'dppx)');
        if (typeof query.addEventListener === 'function') {
          query.addEventListener('change', refresh);
          removeQuery = function () { query.removeEventListener('change', refresh); };
        } else if (typeof query.addListener === 'function') {
          query.addListener(refresh);
          removeQuery = function () { query.removeListener(refresh); };
        }
      } catch (ignoreDpiObserver) { query = null; removeQuery = null; }
    }
    function refresh() {
      if (disposed) return current();
      var previous = variant + ':' + deviceScale, next = null;
      diagnostic = null;
      if (cep && typeof cep.getHostEnvironment === 'function') {
        try { next = hostVariant(cep.getHostEnvironment()); } catch (ignoreHostRead) {}
        if (next) { variant = next; source = 'cep'; }
        else { diagnostic = 'HOST_ENVIRONMENT_UNAVAILABLE'; if (source !== 'cep') source = 'fallback'; }
      }
      var ratio = target.devicePixelRatio;
      deviceScale = typeof ratio === 'number' && Number.isFinite(ratio) && ratio >= .5 && ratio <= 8
        ? Math.round(ratio * 1000) / 1000 : 1;
      Object.keys(palettes[variant]).forEach(function (key) { style(key, palettes[variant][key]); });
      style('color-scheme', variant === 'light' ? 'light' : 'dark');
      style('--cp-device-scale', String(deviceScale));
      attribute('data-theme', variant); attribute('data-cp-device-scale', String(deviceScale));
      if (previous !== variant + ':' + deviceScale || revision === 0) revision++;
      watchScale();
      return current();
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      if (subscribed) try { cep.removeEventListener(EVENT, refresh); } catch (ignoreRemovedHost) {}
      if (typeof target.removeEventListener === 'function') {
        target.removeEventListener('resize', refresh); target.removeEventListener('unload', dispose);
      }
      if (removeQuery) try { removeQuery(); } catch (ignoreRemovedDpi) {}
      oldStyles.forEach(function (old, key) {
        if (root.style.getPropertyValue(key) !== applied.get(key)) return;
        if (old.value) root.style.setProperty(key, old.value, old.priority);
        else root.style.removeProperty(key);
      });
      oldAttributes.forEach(function (old, key) {
        if (root.getAttribute(key) !== attributes.get(key)) return;
        if (old === null) root.removeAttribute(key); else root.setAttribute(key, old);
      });
      if (instances.get(document) === handle) instances.delete(document);
    }
    handle = {refresh: refresh, current: current, dispose: dispose};
    instances.set(document, handle);
    refresh();
    if (cep && typeof cep.addEventListener === 'function' && typeof cep.removeEventListener === 'function') {
      try { cep.addEventListener(EVENT, refresh); subscribed = true; }
      catch (ignoreHostEventSubscription) { diagnostic = 'HOST_THEME_EVENTS_UNAVAILABLE'; }
    }
    if (typeof target.addEventListener === 'function') {
      target.addEventListener('resize', refresh); target.addEventListener('unload', dispose);
    }
    return handle;
  }
  var api = {init: init};
  scope.ContentriumTheme = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
