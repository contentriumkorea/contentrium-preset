(function (scope) {
  'use strict';
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function scalar(value) { return Number.isInteger(value) && value >= 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff); }
  function validDefinition(def) {
    var coverage = def && def.coverage;
    return !!(def && typeof def.id === 'string' && def.id && typeof def.digest === 'string' && def.digest &&
      coverage && Array.isArray(coverage.codePoints) && coverage.codePoints.length && coverage.codePoints.every(scalar) &&
      new Set(coverage.codePoints).size === coverage.codePoints.length && Number.isInteger(coverage.maxScalars) && coverage.maxScalars > 0);
  }
  function validation(def, text) {
    if (!validDefinition(def) || def.available !== true) return '이 스타일은 현재 사용할 수 없습니다.';
    if (!text || !text.trim()) return '추가할 글자를 입력하세요.';
    var points = Array.from(text), supported = new Set(def.coverage.codePoints);
    if (points.length > def.coverage.maxScalars) return '최대 ' + def.coverage.maxScalars + '글자까지 입력하세요.';
    for (var i = 0; i < points.length; i++) {
      var cp = points[i].codePointAt(0);
      if (!scalar(cp) || cp < 32 || (cp >= 127 && cp <= 159) || cp === 0x2028 || cp === 0x2029 || !supported.has(cp))
        return (i + 1) + '번째 글자를 지원하지 않습니다 (U+' + cp.toString(16).toUpperCase() + ').';
    }
    return '';
  }
  function create(options) {
    var container = options.container, doc = container.ownerDocument, definition = null, signature = '', generation = 0,
      draftVersion = 0, destroyed = false, pending = false, composing = false, compositionEnter = false,
      state = {busy:false,connected:false}, errorText = '', listeners = [];
    function node(tag, cls, text) {
      var value = doc.createElement(tag); value.className = cls || '';
      if (text != null) value.textContent = text;
      return value;
    }
    var form = node('form', 'animated-font-form'), label = node('label', '', '텍스트'),
      input = node('input', 'animated-font-input'), add = node('button', 'apply-button', 'Add'),
      message = node('div', 'animated-font-message');
    input.type = 'text'; input.autocomplete = 'off'; input.setAttribute('aria-label', '애니메이션 글자');
    input.setAttribute('aria-describedby', 'animated-font-message'); input.id = 'animated-font-text'; label.setAttribute('for', input.id);
    add.type = 'submit'; message.id = 'animated-font-message'; message.setAttribute('role', 'status');
    form.appendChild(label); form.appendChild(input); form.appendChild(add); form.appendChild(message); container.appendChild(form);
    function busy() { return pending || state.busy || (options.isBusy && options.isBusy()); }
    function contextReady(value) { return !!(value && value.context && typeof value.expectedRevision === 'number' && Number.isFinite(value.expectedRevision)); }
    function currentContext() { try { var value = options.getContext(); return contextReady(value) ? value : null; } catch (ignore) { return null; } }
    function render() {
      container.hidden = !definition;
      var reason = validation(definition, input.value);
      add.disabled = destroyed || busy() || !state.connected || !currentContext() || composing || !!reason;
      message.textContent = errorText || (definition ? reason : '');
      input.setAttribute('aria-invalid', reason && input.value ? 'true' : 'false');
    }
    function listen(target, type, fn) { target.addEventListener(type, fn); listeners.push(function () { target.removeEventListener(type, fn); }); }
    function submit(event) {
      if (event) event.preventDefault();
      if (destroyed || composing || busy() || !state.connected || !currentContext() || validation(definition, input.value)) return;
      var captured, payload, epoch = generation, version = draftVersion;
      try {
        captured = copy(options.getContext());
        if (!captured || !captured.context || typeof captured.expectedRevision !== 'number' || !Number.isFinite(captured.expectedRevision))
          throw new Error('현재 프로젝트와 선택 상태를 다시 확인하세요.');
        payload = {fontId:definition.id,fontHash:definition.digest,text:input.value,context:captured.context,expectedRevision:captured.expectedRevision};
      } catch (error) { errorText = error.message || String(error); render(); if (options.onError) options.onError(error); return; }
      pending = true; errorText = ''; render();
      function current() { return !destroyed && epoch === generation && version === draftVersion; }
      var request;
      try { request = options.call('addAnimatedFont', payload); } catch (error) { request = Promise.reject(error); }
      Promise.resolve(request).then(function (result) {
        if (current() && options.onApplied) options.onApplied(result, copy(payload));
      }).catch(function (error) {
        if (!current()) return;
        errorText = error.message || String(error); if (options.onError) options.onError(error);
      }).finally(function () { pending = false; if (!destroyed) render(); });
    }
    listen(input, 'input', function () { draftVersion++; errorText = ''; render(); });
    listen(input, 'compositionstart', function () { composing = true; render(); });
    listen(input, 'compositionend', function () { composing = false; compositionEnter = true; render(); });
    listen(input, 'keydown', function (event) {
      if (event.key !== 'Enter') { if (!event.isComposing && event.keyCode !== 229) compositionEnter = false; return; }
      event.preventDefault();
      if (composing || event.isComposing || event.keyCode === 229) return;
      if (compositionEnter) { compositionEnter = false; return; }
      submit(event);
    });
    listen(form, 'submit', submit);
    render();
    return {
      select:function (def) {
        if (destroyed) return;
        var next = def ? copy(def) : null, key = JSON.stringify(next);
        if (key !== signature) { generation++; errorText = ''; signature = key; }
        definition = next; render();
      },
      updateState:function (value) { if (!destroyed) { state = {busy:value.busy === true,connected:value.connected === true}; render(); } },
      destroy:function () { if (destroyed) return; destroyed = true; generation++; listeners.forEach(function (remove) { remove(); }); form.remove(); }
    };
  }
  var api = {create:create};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  scope.ContentriumAnimatedFont = api;
})(typeof window === 'undefined' ? globalThis : window);
