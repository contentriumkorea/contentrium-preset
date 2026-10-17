(function (scope) {
  'use strict';
  function autoTab(current, mode, previousInstance, state, separateEdit, previousSeparateEdit) {
    if (mode === 'browse' || mode === 'edit') return mode;
    if (!state || (state.instanceId === previousInstance &&
      (previousSeparateEdit === undefined || separateEdit === previousSeparateEdit))) return current;
    if (separateEdit) return 'browse';
    return state.hasError ||
      (state.numSelectedLayers > 0 && state.hasRootNode && state.wantsRevealEditTab)
      ? 'edit'
      : 'browse';
  }
  function panelIsLive(lease, now) {
    return !!lease && typeof lease.at === 'number' && Number.isFinite(lease.at) &&
      now >= lease.at && now - lease.at < 3500;
  }
  function nextPanelSlot(live, preferred) {
    var first = [2,3,4].indexOf(Number(preferred));
    if (first < 0) first = 0;
    for (var i = 0; i < 3; i++) {
      var slot = 2 + (first + i) % 3;
      if (!live[slot]) return slot;
    }
    return first + 2;
  }
  function settingsSignature(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    var keys = Object.keys(value).sort(), normalized = {};
    for (var i = 0; i < keys.length; i++) {
      if (typeof value[keys[i]] !== 'boolean') return null;
      normalized[keys[i]] = value[keys[i]];
    }
    return JSON.stringify(normalized);
  }
  function parseNumeric(text, current, mixed) {
    var value = String(text).trim(),
      match = /^([+*/-])=\s*(.*)$/.exec(value),
      number = Number(match ? match[2] : value);
    if (!value || !Number.isFinite(number)) throw new Error('유효한 숫자를 입력하세요.');
    if (!match) return { value: number, relative: false };
    if (match[1] === '+') return { value: number, relative: true };
    if (match[1] === '-') return { value: -number, relative: true };
    if (mixed || !Number.isFinite(Number(current)))
      throw new Error('서로 다른 값에는 += 또는 -=로 입력하세요.');
    if (match[1] === '/' && number === 0) throw new Error('0으로 나눌 수 없습니다.');
    return {
      value: match[1] === '*' ? Number(current) * number : Number(current) / number,
      relative: false,
    };
  }
  function displayPrecision(control) {
    var own = Object.prototype.hasOwnProperty, precision;
    if (own.call(control, 'precision')) precision = control.precision;
    else if (control.def && own.call(control.def, 'precision')) precision = control.def.precision;
    if (precision !== undefined && (!Number.isInteger(precision) || precision < 0 || precision > 12))
      throw new Error('표시 소수 자릿수는 0부터 12까지의 정수여야 합니다.');
    return precision;
  }
  function formatNumericDisplay(value, precision) {
    displayPrecision({precision:precision});
    if (precision === undefined) return String(value);
    if (!Number.isFinite(value)) throw new Error('유효한 숫자를 표시할 수 없습니다.');
    return String(Number(value.toFixed(precision)));
  }
  function timing(def) {
    var duration = Number(def && def.frameDuration);
    if (!(duration > 0)) throw new Error('컴포지션 프레임 정보를 읽지 못했습니다.');
    return {
      frameDuration: duration,
      fps: 1 / duration,
      nominal: Math.round(1 / duration),
      drop: !!(def && def.dropframe),
    };
  }
  function parseAngle(text, current, mixed) {
    var input = String(text).trim(),
      relative = /^([+-])=\s*/.exec(input);
    if (relative) input = input.slice(relative[0].length);
    var match = /^([+-]?\d+)x(?:\s*([+-])\s*(\d+(?:\.\d+)?))?$/i.exec(input);
    if (!match) return parseNumeric(text, current, mixed);
    var degrees = Number(match[1]) * 360 + (match[2] === '-' ? -1 : 1) * Number(match[3] || 0);
    return { value: degrees * (relative && relative[1] === '-' ? -1 : 1), relative: !!relative };
  }
  function parseTime(text, def) {
    var t = timing(def),
      input = String(text).trim(),
      relative = false,
      sign = 1,
      match = /^([+-])=\s*(.*)$/.exec(input);
    if (match) {
      relative = true;
      sign = match[1] === '-' ? -1 : 1;
      input = match[2];
    }
    if (/^[-+]\d+:/.test(input)) {
      if (input.charAt(0) === '-') sign *= -1;
      input = input.slice(1);
    }
    var number, parts;
    if (/^[-+]?\d+(?:\.\d+)?f$/i.test(input)) number = parseFloat(input) * t.frameDuration;
    else if ((parts = /^(\d+):(\d{2}):(\d{2})[:;](\d{2})$/.exec(input))) {
      var h = +parts[1],
        m = +parts[2],
        s = +parts[3],
        f = +parts[4];
      if (m > 59 || s > 59 || f >= t.nominal)
        throw new Error('올바른 타임코드 프레임을 입력하세요.');
      var frames = ((h * 60 + m) * 60 + s) * t.nominal + f;
      if (input.indexOf(';') !== -1 || t.drop) {
        var dropped = t.nominal === 60 ? 4 : 2;
        if (t.nominal !== 30 && t.nominal !== 60)
          throw new Error('이 프레임레이트는 드롭 프레임을 지원하지 않습니다.');
        if (m % 10 !== 0 && s === 0 && f < dropped)
          throw new Error('드롭 프레임에서 생략되는 프레임 번호입니다.');
        var minutes = h * 60 + m;
        frames -= dropped * (minutes - Math.floor(minutes / 10));
      }
      number = frames * t.frameDuration;
    } else {
      if (!/^[-+]?\d+(?:\.\d+)?s?$/i.test(input))
        throw new Error('초, 12f 또는 00:00:00:00 형식으로 입력하세요.');
      number = parseFloat(input);
    }
    if (!Number.isFinite(number)) throw new Error('시간 값을 읽지 못했습니다.');
    return { value: number * sign, relative: relative };
  }
  function formatTime(seconds, def) {
    var t = timing(def),
      negative = seconds < 0,
      frames = Math.round(Math.abs(seconds) / t.frameDuration),
      separator = ':';
    if (t.drop && (t.nominal === 30 || t.nominal === 60)) {
      var dropped = t.nominal === 60 ? 4 : 2,
        ten = t.nominal * 600 - dropped * 9,
        minute = t.nominal * 60 - dropped,
        d = Math.floor(frames / ten),
        r = frames % ten;
      frames += dropped * 9 * d + (r > dropped ? dropped * Math.floor((r - dropped) / minute) : 0);
      separator = ';';
    }
    var f = frames % t.nominal,
      total = Math.floor(frames / t.nominal),
      s = total % 60,
      m = Math.floor(total / 60) % 60,
      h = Math.floor(total / 3600);
    function pad(v) {
      return String(v).padStart(2, '0');
    }
    return (negative ? '-' : '') + pad(h) + ':' + pad(m) + ':' + pad(s) + separator + pad(f);
  }
  function contextPayload(state) {
    return state && state.context ? JSON.parse(JSON.stringify(state.context)) : null;
  }
  function actionState(actions, id) {
    var action = (actions || []).find(function (a) {
      return (typeof a === 'string' ? a : a.id || a.action) === id;
    });
    if (!action) return { id: id, enabled: false, reason: '현재 선택에서 사용할 수 없습니다.' };
    return typeof action === 'string'
      ? { id: action, enabled: true }
      : Object.assign({ enabled: true }, action);
  }
  function serialTransport(execute, options) {
    options = options || {};
    var queue = [],
      active = false,
      late = false,
      activeTask = null,
      nextId = 0,
      lastCompletion = null,
      observerError = null;
    function diagnostics() {
      return {
        busy: active || queue.length > 0,
        waitingLate: late,
        queueLength: queue.length,
        pending: activeTask ? {
          requestId: activeTask.id, method: activeTask.method,
          startedAt: activeTask.startedAt, ageMs: Math.max(0, Date.now() - activeTask.startedAt),
          timedOut: late
        } : null,
        lastCompletion: lastCompletion ? Object.assign({}, lastCompletion) : null,
        observerError: observerError ? Object.assign({},observerError) : null
      };
    }
    function notify(name,args) {
      if(!options[name])return;
      try { options[name].apply(null,args); }
      catch(error) { observerError={callback:name,message:error.message||String(error)}; }
    }
    function changed() { notify('onChange',[diagnostics()]); }
    function dispatch() {
      if (active || !queue.length) return;
      active = true;
      var task = queue.shift(),
        settled = false,
        returned = false;
      task.startedAt = Date.now();
      activeTask = task;
      changed();
      var timer = setTimeout(function () {
        if (returned) return;
        settled = true;
        late = true;
        var error = new Error('AE 응답 시간이 초과되었습니다. 응답이 돌아올 때까지 다른 작업을 기다립니다.');
        error.code = 'CEP_RESPONSE_TIMEOUT';
        error.requestId = task.id;
        if (!task.awaitCompletion) task.reject(error);
        changed();
        notify('onPending',[true,diagnostics().pending]);
      }, options.timeoutMs || 60000);
      function done(error, value) {
        if (returned) return;
        returned = true;
        clearTimeout(timer);
        active = false;
        late = false;
        activeTask = null;
        lastCompletion = { requestId:task.id,method:task.method,startedAt:task.startedAt,
          completedAt:Date.now(),timedOut:settled,ok:!error,
          errorCode:error && error.code || null,errorMessage:error && error.message || null };
        changed();
        notify('onPending',[false,Object.assign({},lastCompletion)]);
        if (!settled || task.awaitCompletion) {
          if (error) task.reject(error);
          else task.resolve(value);
        }
        dispatch();
      }
      try {
        execute(task.method, task.payload, done);
      } catch (error) {
        done(error);
      }
    }
    function request(method, payload, requestOptions) {
      return new Promise(function (resolve, reject) {
        if (late && !(requestOptions && requestOptions.waitForLate === true)) {
          reject(new Error('이전 AE 작업의 응답을 기다리고 있습니다. 응답 후 다시 시도하세요.'));
          return;
        }
        queue.push({ id: ++nextId, method: method, payload: payload, resolve: resolve, reject: reject, awaitCompletion: !!(requestOptions && requestOptions.awaitCompletion) });
        changed();
        dispatch();
      });
    }
    request.isBusy = function () {
      return active || queue.length > 0;
    };
    request.isWaitingLate = function () {
      return late;
    };
    request.getDiagnostics = diagnostics;
    return request;
  }
  function gridTarget(index, key, columns, length) {
    var delta = {
      ArrowLeft: -1,
      a: -1,
      ArrowRight: 1,
      d: 1,
      ArrowUp: -columns,
      w: -columns,
      ArrowDown: columns,
      s: columns,
    };
    if (key === 'Home') return 0;
    if (key === 'End') return length - 1;
    if (delta[key] == null) return index;
    var next = index + delta[key];
    return next < 0 || next >= length ? index : next;
  }
  function searchText(value) {
    return typeof value === 'string' ? value.normalize('NFC').toLowerCase() : '';
  }
  function matchEntry(entry, query) {
    var miss = { matches: false, matchingVariantId: null, matchingVariantIds: [],
      matchKind: null, matchedBy: null };
    if (!entry || typeof entry !== 'object') return miss;
    var raw = searchText(query == null ? '' : String(query)).trim(),
      variants = Array.isArray(entry.variants) ? entry.variants.filter(function (v) {
        return v && typeof v === 'object';
      }) : [],
      ids = variants.filter(function (v) { return typeof v.id === 'string'; })
        .map(function (v) { return v.id; }),
      preferred = variants.find(function (v) { return v.id === entry.defaultId; }),
      defaultId = preferred && typeof preferred.id === 'string' ? preferred.id : (ids[0] || null);
    function result(kind, matches, hint, by) {
      return { matches: true, matchingVariantId: hint, matchingVariantIds: matches,
        matchKind: kind, matchedBy: by };
    }
    // Exact identifiers are a separate diagnostic shortcut, never inferred codes.
    if (raw && raw === searchText(entry.id)) return result('entry', ids, defaultId, 'exact-id');
    if (raw) {
      var exact = variants.find(function (v) { return raw === searchText(v.id); });
      if (exact) return result('variant', [exact.id], exact.id, 'exact-id');
    }
    var words = raw.match(/[\p{L}\p{M}\p{N}_]+/gu) || [],
      ancestors = (Array.isArray(entry.category) ? entry.category : []).concat([entry.name])
        .map(searchText),
      inherited = words.map(function (word) {
        return ancestors.some(function (name) { return name.indexOf(word) !== -1; });
      });
    if (inherited.every(Boolean)) return result('entry', ids, defaultId, 'text');
    var matching = [], firstBy = null;
    variants.forEach(function (variant) {
      var name = searchText(variant.name),
        codes = (variant.type === 1 || variant.type === 3) && Array.isArray(variant.presetCodes)
          ? variant.presetCodes.map(searchText).filter(Boolean) : [],
        usedCode = false,
        complete = words.every(function (word, index) {
          if (inherited[index] || name.indexOf(word) !== -1) return true;
          if (codes.indexOf(word) !== -1) { usedCode = true; return true; }
          return false;
        });
      // Each leaf completes its own path; tokens cannot leak between siblings.
      if (complete && typeof variant.id === 'string') {
        matching.push(variant.id);
        if (firstBy === null) firstBy = usedCode ? 'preset-code' : 'text';
      }
    });
    return matching.length ? result('variant', matching, matching[0], firstBy) : miss;
  }
  function searchEntries(entries, query) {
    if (!Array.isArray(entries)) return [];
    var found = [];
    entries.forEach(function (entry) {
      var match = matchEntry(entry, query);
      if (match.matches) found.push(Object.assign({ entry: entry }, match));
    });
    return found;
  }
  function presetScopeMatches(preset, scope) {
    if (scope === 'effects') return preset.type === 3;
    if (scope === 'transitions') return preset.type === 1;
    if (scope === 'in' || scope === 'out') return preset.type === 1 && (preset.direction === scope || preset.direction === 'both');
    return true;
  }
  var api = {
    presetScopeMatches: presetScopeMatches,
    autoTab: autoTab,
    panelIsLive: panelIsLive,
    nextPanelSlot: nextPanelSlot,
    settingsSignature: settingsSignature,
    parseNumeric: parseNumeric,
    displayPrecision: displayPrecision,
    formatNumericDisplay: formatNumericDisplay,
    parseAngle: parseAngle,
    parseTime: parseTime,
    formatTime: formatTime,
    contextPayload: contextPayload,
    actionState: actionState,
    serialTransport: serialTransport,
    gridTarget: gridTarget,
    matchEntry: matchEntry,
    searchEntries: searchEntries,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  scope.ContentriumCore = api;
})(typeof window === 'undefined' ? globalThis : window);
