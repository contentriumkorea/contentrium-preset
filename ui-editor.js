(function (scope) {
  'use strict';
  var core = scope.ContentriumCore;
  var documentNonce = (function () {
    if (scope.crypto && typeof scope.crypto.getRandomValues === 'function') {
      var values = new Uint32Array(4);
      scope.crypto.getRandomValues(values);
      return Array.from(values, function (value) { return value.toString(36); }).join('-');
    }
    return Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
  })(), gestureCounter = 0;
  function newGestureId() {
    return 'ui-' + documentNonce + '-' + Date.now().toString(36) + '-' + ++gestureCounter;
  }
  function createGestureController(config) {
    var current = null, runs = new Set();
    function start() {
      if (!current || current.ending) {
        current = {id:config.newId(),pending:null,sending:false,last:Promise.resolve(),timer:null,ending:false,done:null};
        runs.add(current);
        config.onActive(true);
      }
      return current;
    }
    function flush(run) {
      clearTimeout(run.timer);
      if (run.sending || !run.pending) return run.last;
      var payload = run.pending;
      run.pending = null;
      run.sending = true;
      run.last = Promise.resolve().then(function () {
        return config.call('setControl', payload);
      }).catch(config.error).then(function () {
        run.sending = false;
        if (run.pending) return flush(run);
      });
      return run.last;
    }
    function change(number, relative) {
      var run = start();
      config.setField(number);
      try { run.pending = config.payload(number, run.id, !!relative); }
      catch (error) { config.error(error); return; }
      clearTimeout(run.timer);
      run.timer = setTimeout(function () { flush(run); }, 45);
    }
    function end() {
      var run = current;
      if (!run) return Promise.resolve();
      if (run.ending) return run.done;
      run.ending = true;
      clearTimeout(run.timer);
      run.done = flush(run).then(function () {
        return config.call('endUndoGroup', {undoGroupId:run.id});
      }).catch(config.error).then(function () {
        runs.delete(run);
        if (current === run) current = null;
        if (!runs.size) { config.onActive(false); config.refresh(); }
      });
      return run.done;
    }
    return {start:start,change:change,end:end};
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  var labels = {
    copy: '복사',
    paste: '붙여넣기',
    remove: '제거',
    reset: '초기화',
    reveal: '찾아보기',
    add: '마커 추가',
    alignToPlayhead: '재생 헤드에 맞춤',
    shiftMarkers: '마커 이동',
    alignMarkers: '마커 정렬',
    replace: '교체',
    adjust: '조정',
    save: '저장',
    delete: '삭제',
    previous: '이전',
    next: '다음',
    upgradeTimeline: '타임라인 업데이트',
  };
  function typeOf(control) {
    var t = String(control.type || '').toLowerCase();
    if (control.font === true) return 'font';
    if (t === 'oned') {
      if (control.kind === 'timing') return 'time';
      if (
        String(control.name).toLowerCase() === 'enabled' &&
        (control.value === 0 || control.value === 1)
      )
        return 'checkbox';
      return 'number';
    }
    if (/^(twod|threed)/.test(t)) return 'point';
    return t;
  }
  function optionsOf(control) {
    return (control.options || []).map(function (o, i) {
      return typeof o === 'object'
        ? {
            value: o.value != null ? o.value : o.id != null ? o.id : i,
            label: o.label || o.name || String(o.value),
          }
        : { value: typeof control.value === 'number' ? i : o, label: String(o) };
    });
  }
  function colorInputValue(value) {
    return Array.isArray(value)
      ? '#' + value.slice(0, 3).map(function (v) {
        return Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
      }).join('')
      : value;
  }
  function create(config) {
    var state = null,
      fonts = null,
      fontsAvailable = null,
      fontLoading = false,
      pickerPending = false,
      expressionWarningRegion = null,
      collapsed = {},
      activeGestureControllers = new Set(), activePointerStops = new Set(), pendingWrites = new Set(), errorSerial = 0;
    var mediaUI = scope.ContentriumMedia && scope.ContentriumMedia.create(config);
    function error(e) {
      errorSerial++;
      config.status(e.message || String(e), 'error');
    }
    function syncPickerButtons() {
      config.root.querySelectorAll('button[data-native-picker]').forEach(function (picker) {
        picker.disabled = pickerPending || picker.dataset.nativePicker === 'readonly' || !config.supports('pickColor');
      });
    }
    function trackWrite(work) {
      pendingWrites.add(work);
      work.then(function(){pendingWrites.delete(work);},function(){pendingWrites.delete(work);errorSerial++;});
      return work;
    }
    function invoke(method, payload, message) {
      config.status(message || '선택 항목을 변경하는 중…', 'busy');
      var work = config
        .call(method, Object.assign({ context: core.contextPayload(state), expectedRevision: state && state.projectRevision }, payload))
        .then(function (result) {
          config.status((result && result.message) || '변경했습니다.');
          config.refresh();
          return result;
        })
        .catch(function (e) {
          error(e);
          throw e;
        });
      return trackWrite(work);
    }
    function prepareHistory() {
      var serial=errorSerial,focused=document.activeElement;
      if(focused&&config.root.contains(focused)&&typeof focused.blur==='function')focused.blur();
      var ending=Array.from(activePointerStops).map(function(stop){return stop();});
      ending=ending.concat(Array.from(activeGestureControllers).map(function(controller){return controller.end();}));
      return Promise.all(Array.from(pendingWrites).concat(ending)).then(function(){
        if(errorSerial!==serial)throw new Error('속성 변경에 실패해 실행 취소를 중단했습니다. 현재 선택을 확인하세요.');
      });
    }
    function button(action, onClick, enabled, reason) {
      var b = el('button', 'small-button', labels[action] || action);
      b.type = 'button';
      b.disabled = enabled === false;
      b.title = reason || '';
      b.onclick = function () {
        Promise.resolve()
          .then(onClick)
          .catch(function () {});
      };
      return b;
    }
    function propertyAction(control, action, params) {
      return invoke(
        'propertyAction',
        { id: control.id, action: action, params: params || {} },
        '선택 속성에 작업을 적용하는 중…',
      );
    }
    function actionButtons(control, parent) {
      (control.actions || []).forEach(function (raw) {
        var a = typeof raw === 'string' ? { id: raw } : raw,
          id = a.id || a.action;
        if (!id) return;
        parent.appendChild(
          button(
            id,
            function () {
              var params = {};
              if (a.params && a.params.length) {
                a.params.forEach(function (p) {
                  var v = scope.prompt(
                    p.label || p.name,
                    p.default == null ? '' : String(p.default),
                  );
                  if (v == null) throw new Error('작업을 취소했습니다.');
                  params[p.id || p.name] = p.type === 'number' ? Number(v) : v;
                });
              }
              return propertyAction(control, id, params);
            },
            a.enabled !== false,
            a.reason,
          ),
        );
      });
    }
    function paletteField(control, parent) {
      var groups=(control.def&&control.def.availablePalettes)||{},all=[],enabled=control.enabled!==false;
      var custom=button('Custom',function(){},enabled&&control.value==='');
      custom.setAttribute('aria-pressed',String(control.value===''));
      parent.appendChild(custom);
      [['predefined','기본 색상조합'],['user','저장 색상조합'],['similar','유사 색상조합']].forEach(function(category){
        var entries=groups[category[0]]||[];if(!entries.length)return;
        var group=el('div','palette-category');group.setAttribute('role','group');group.setAttribute('aria-label',category[1]);
        entries.forEach(function(entry){
          all.push(entry);
          var item=button(entry.name,function(){return invoke('setControl',{id:control.id,value:entry.id});},enabled);
          item.dataset.paletteId=entry.id;item.setAttribute('aria-label',entry.name);item.setAttribute('aria-pressed',String(control.value===entry.id));
          (entry.colors||[]).forEach(function(value){var swatch=el('span','palette-swatch');swatch.setAttribute('aria-hidden','true');swatch.style.display='inline-block';swatch.style.width='14px';swatch.style.height='14px';swatch.style.backgroundColor=colorInputValue(value);item.appendChild(swatch);});group.appendChild(item);
        });parent.appendChild(group);
      });
      function action(name,extra){return invoke('paletteAction',Object.assign({action:name,id:control.id},extra||{}));}
      var previous=button('이전 색상조합',function(){return action('previous');},enabled&&all.length>0),next=button('다음 색상조합',function(){return action('next');},enabled&&all.length>0);
      parent.appendChild(previous);parent.appendChild(next);
      parent.appendChild(button('색상조합 저장',function(){var name=scope.prompt('색상조합 이름','');if(name===null)return;return action('saveAs',{name:name});},enabled&&control.value===''));
      var saved=(groups.user||[]).some(function(entry){return entry.id===control.value;});
      parent.appendChild(button('저장 색상조합 삭제',function(){return action('remove',{paletteId:control.value});},enabled&&saved));
      if(control.resetSupported)parent.appendChild(button(control.resetLabel||'슬롯 지정 시 색상으로 초기화',function(){return action('reset');},enabled));
      parent.appendChild(button('슬롯 지정 해제',function(){return action('undefine');},true));
      if(control.readOnlyReason)parent.appendChild(el('span','control-comment',control.readOnlyReason));
    }
    function paletteSlotManager(parent) {
      if(!(state.paletteCandidates||[]).length)return;
      parent.appendChild(button('팔레트 슬롯 지정',function(){
        var captured={context:core.contextPayload(state),expectedRevision:state.projectRevision},candidates=state.paletteCandidates.slice(),dialog=el('dialog','palette-slot-dialog'),title=el('h3','','팔레트 슬롯 지정'),name=el('input'),selected=[];
        name.value='선택 색상조합';name.setAttribute('aria-label','색상조합 이름');dialog.appendChild(title);dialog.appendChild(name);dialog.appendChild(el('p','','체크한 속성을 표시 순서대로 슬롯 1, 2…에 연결합니다. 초기화는 지금의 색상을 사용합니다.'));
        candidates.forEach(function(candidate){var label=el('label'),check=el('input');check.type='checkbox';check.disabled=!candidate.enabled;check.setAttribute('aria-label',candidate.name);label.appendChild(check);label.appendChild(document.createTextNode(candidate.name));dialog.appendChild(label);selected.push({input:check,id:candidate.id});});
        function close(){dialog.close();dialog.remove();}
        dialog.appendChild(button('취소',close,true));
        dialog.appendChild(button('슬롯 연결',function(){var slots=[];selected.forEach(function(item){if(item.input.checked)slots.push({slotKey:'slot'+(slots.length+1),controlId:item.id});});return invoke('paletteAction',Object.assign({action:'define',name:name.value,slots:slots},captured)).then(close);},true));
        dialog.addEventListener('cancel',function(event){event.preventDefault();close();});document.body.appendChild(dialog);dialog.showModal();
      },true));
    }
    function scalarField(control, parent, type, index) {
      var value = index == null ? control.value : control.value[index],
        input = el('input', 'value-input');
      input.type = 'text';
      if (type === 'time') input.classList.add('value-time');
      input.inputMode = 'decimal';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.setAttribute(
        'aria-label',
        control.name + (index == null ? '' : ' ' + ['X', 'Y', 'Z'][index]),
      );
      input.dataset.controlId = control.id;
      var def = Object.assign(
        {},
        state,
        { frameDuration: state.frameDuration },
        control.def || {},
        control,
      );
      var precision, displayError = null, dirty = false, workingValue = value, workingEpoch = 0,
        latestVector = index == null ? null : control.value.slice();
      if (type !== 'time') try { precision = core.displayPrecision(control); }
      catch (definitionError) { displayError = definitionError; }
      function display() {
        return control.mixed ? '' : workingValue == null ? '' : core.formatNumericDisplay(workingValue, precision);
      }
      if (type === 'time' && Number.isFinite(Number(value)) && def.frameDuration) {
        try {
          input.value = core.formatTime(Number(value), def);
        } catch (e) {
          input.value = value;
        }
      } else try { input.value = display(); } catch (numberError) { displayError = numberError; input.value = value; }
      if (control.mixed) input.placeholder = '서로 다른 값';
      input.disabled = control.disabled === true || control.enabled === false || !!displayError;
      input.title =
        type === 'time'
          ? '초 / 12f / 00:00:00:00 · +=12f 상대 입력'
          : '숫자 · +=10 / -=10 상대 입력';
      function parsed(text) {
        return type === 'time'
          ? core.parseTime(text, def)
          : type === 'angle'
            ? core.parseAngle(text, precision === undefined ? value : workingValue, control.mixed)
            : core.parseNumeric(text, precision === undefined ? value : workingValue, control.mixed);
      }
      function payload(result, group) {
        if (
          !result.relative &&
          ((control.min != null && result.value < control.min) ||
            (control.max != null && result.value > control.max))
        )
          throw new Error(
            '허용 범위: ' +
              (control.min == null ? '제한 없음' : control.min) +
              ' ~ ' +
              (control.max == null ? '제한 없음' : control.max),
          );
        var next = result.value;
        if (index != null) {
          next = latestVector.slice();
          if (result.relative)
            next = next.map(function () {
              return 0;
            });
          next[index] = result.value;
        }
        var resultPayload = {
          id: control.id,
          value: next,
          relative: result.relative,
          undoGroupId: group,
          context: core.contextPayload(state),
        };
        if(control.requiresRevision)resultPayload.expectedRevision=state&&state.projectRevision;
        return resultPayload;
      }
      function commit(text, group) {
        if (displayError || input.disabled) return Promise.resolve();
        var p, parsedValue, previous = workingValue, epoch;
        try {
          parsedValue = parsed(text);
          p = payload(parsedValue, group);
        } catch (e) {
          error(e);
          return Promise.resolve();
        }
        if (precision !== undefined && !control.mixed) {
          epoch = ++workingEpoch;
          workingValue = parsedValue.relative ? Number(workingValue) + parsedValue.value : parsedValue.value;
        }
        return invoke('setControl', p).catch(function () {
          if (epoch !== undefined && epoch === workingEpoch) {
            workingValue = previous;
            if (!dirty) input.value = display();
          }
        });
      }
      input.onchange = function () {
        if (!dirty || input.disabled) return;
        dirty = false;
        commit(input.value);
      };
      input.oninput = function () { dirty = true; };
      if (precision !== undefined) {
        input.onfocus = function () { if (!dirty) { input.value = control.mixed ? '' : String(workingValue); input.select(); } };
        input.onblur = function () { if (!dirty && !displayError) input.value = display(); };
      }
      input.onkeydown = function (event) {
        if (event.key === 'Enter') {
          input.blur();
        } else if (event.key === 'Escape') {
          dirty = false;
          input.value = precision === undefined ? (control.mixed ? '' : value) : display();
          input.blur();
        } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          var step = type === 'time' ? def.frameDuration : Number(control.step) || 1,
            delta = step * (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 10 : 1);
          commit('+=' + delta);
        }
      };
      parent.appendChild(input);
      input._refreshScalar = function (next) {
        if (displayError || next.type !== control.type) return;
        if (index != null) {
          latestVector = next.value.slice();
          input.disabled = next.disabled === true || next.enabled === false;
        }
        if (dirty) return;
        control = next;
        value = index == null ? next.value : next.value[index];
        workingValue = value;
        workingEpoch++;
        def = Object.assign({}, state, {frameDuration:state.frameDuration}, next.def || {}, next);
        var shown = control.mixed ? '' : type === 'time' && def.frameDuration ? core.formatTime(Number(value), def) :
          precision !== undefined && document.activeElement === input ? String(value) : display();
        if (input.value !== shown) input.value = shown;
        input.placeholder = control.mixed ? '서로 다른 값' : '';
        input.disabled = control.disabled === true || control.enabled === false;
        var range = parent.querySelector('input[type="range"]');
        if (range) {
          range.min = next.sliderMin != null ? next.sliderMin : next.min;
          range.max = next.sliderMax != null ? next.sliderMax : next.max;
          range.step = next.step || 'any';
          range.value = value;
          range.disabled = input.disabled;
        }
      };
      if (displayError) parent.appendChild(el('span','editor-warning',displayError.message));
      return { input: input, commit: commit, payload: payload, def: def, value: value, invalid:!!displayError,
        currentControl:function () { return control; },
        currentDefinition:function () { return def; },
        interactionValue:function () { return precision === undefined ? (Number.isFinite(Number(input.value)) ? Number(input.value) : Number(value)) : Number(workingValue); },
        setField:function (number) { workingEpoch++; workingValue = number; dirty = false; input.value = precision === undefined ? number : display(); }
      };
    }
    function liveGesture(control, field, slider) {
      var controller = createGestureController({
        newId:newGestureId,
        call:config.call,
        error:error,
        payload:function (number, id, relative) { return field.payload({value:number,relative:relative},id); },
        setField:field.setField,
        onActive:function (active) {
          if (active) activeGestureControllers.add(controller); else activeGestureControllers.delete(controller);
          if (activeGestureControllers.size) config.root.dataset.gestureActive = 'true';
          else delete config.root.dataset.gestureActive;
        },
        refresh:function () { if (!activeGestureControllers.size) config.refresh(); },
      });
      if (slider) {
        var cancelledPointer=false;
        function cancelPointer(){cancelledPointer=true;activePointerStops.delete(cancelPointer);return controller.end();}
        function endPointer(){activePointerStops.delete(cancelPointer);return controller.end();}
        slider.onpointerdown = function(){cancelledPointer=false;activePointerStops.add(cancelPointer);controller.start();};
        slider.oninput = function () {
          if(!cancelledPointer)controller.change(Number(slider.value), false);
        };
        slider.onchange = endPointer;
        slider.onpointerup = endPointer;
        slider.onpointercancel = cancelPointer;
        slider.onkeydown = function (e) {
          if (e.key === 'Escape') cancelPointer();
          else if(/^(Arrow|Home|End|Page)/.test(e.key))cancelledPointer=false;
        };
      }
      return controller;
    }
    function fontField(control, fields) {
      function reloadFonts(){fonts=null;fontsAvailable=null;render(state);}
      if (!fonts) {
        var loading = el(
          'span',
          'unknown-control',
          fontLoading ? '폰트 목록을 읽는 중…' : '폰트 목록이 없습니다.',
        );
        fields.appendChild(loading);
        if (!fontLoading) {
          fontLoading = true;
          config
            .call('enumerateFonts', {})
            .then(function (result) {
              fonts = Array.isArray(result) ? result : result.fonts || [];
              fontsAvailable = Array.isArray(result) || result.available !== false;
              fontLoading = false;
              render(state);
            })
            .catch(function (e) {
              fontLoading = false;
              error(e);
            });
        }
        return;
      }
      var family = el('select'),
        style = el('select'),
        groups = {};
      fonts.forEach(function (f) {
        var name = f.family || f.familyName || f.name;
        (groups[name] || (groups[name] = [])).push(f);
      });
      var current = fonts.find(function (f) {
          return (f.postScriptName || f.postscriptName || f.id) === control.value;
        }),
        chosen = current && (current.family || current.familyName || current.name);
      if(!current){var absent=el('option','',control.mixed?'서로 다른 값':(String(control.value||'')+' · '+(fontsAvailable?'목록에 없음':'목록 확인 불가')));absent.value='';absent.selected=true;family.appendChild(absent);}
      Object.keys(groups)
        .sort()
        .forEach(function (name) {
          var o = el('option', '', name);
          o.value = name;
          o.selected = name === chosen;
          family.appendChild(o);
        });
      function populate() {
        style.textContent = '';
        (groups[family.value] || []).forEach(function (f) {
          var id = f.postScriptName || f.postscriptName || f.id,
            o = el('option', '', f.style || f.styleName || 'Regular');
          o.value = id;
          o.selected = id === control.value;
          style.appendChild(o);
        });
        style.disabled=control.enabled===false||!style.options.length;
      }
      function submitFont(value){if(!value||control.enabled===false)return;invoke('setControl',{id:control.id,value:value}).catch(function(){});}
      family.setAttribute('aria-label', control.name + ' 폰트');
      style.setAttribute('aria-label', control.name + ' 스타일');
      family.onchange = function () {
        populate();
        var preferred=(groups[family.value]||[]).find(function(f){return /^(regular|normal|plain)$/i.test(f.style||f.styleName||'');});
        if(preferred)style.value=preferred.postScriptName||preferred.postscriptName||preferred.id;
        submitFont(style.value);
      };
      style.onchange = function () {
        submitFont(style.value);
      };
      populate();
      family.disabled=control.enabled===false||!fontsAvailable||!fonts.length;
      style.disabled=control.enabled===false||!fontsAvailable||!style.options.length;
      fields.appendChild(family);
      fields.appendChild(style);
      if(!fontsAvailable)fields.appendChild(el('span','control-comment','글꼴 목록을 확인할 수 없습니다. 현재 글꼴: '+String(control.value||'')));
      else if(!current&&!control.mixed)fields.appendChild(el('span','editor-warning','설치된 글꼴 목록에 없습니다: '+String(control.value||'')));
      var refresh=el('button','small-button','글꼴 목록 새로고침');refresh.type='button';refresh.onclick=reloadFonts;fields.appendChild(refresh);
    }
    function renderControl(control, parent) {
      if (control.nodeType === 'warning' || control.type === 'warning') {
        parent.appendChild(
          el('div', 'editor-warning', control.message || control.value || control.name),
        );
        return;
      }
      var row = el('div', 'control-row'),
        label = el('label', 'control-label', control.name || ''),
        fields = el('div', 'control-fields'),
        type = typeOf(control);
      row.dataset.controlId = control.id;
      row.appendChild(label);
      row.appendChild(fields);
      parent.appendChild(row);
      if(control.description)fields.appendChild(el('span','control-comment',control.description));
      if(control.readOnlyReason&&type!=='color'&&type!=='palette')fields.appendChild(el('span','control-comment',control.readOnlyReason));
      if (['group', 'section', 'effect_preset_marker_group'].indexOf(control.nodeType) !== -1) {
        row.classList.add('action-node');
        actionButtons(control, fields);
        return;
      }
      if (['number', 'slider', 'angle', 'time', 'pitch shift'].indexOf(type) !== -1) {
        var scalar = scalarField(control, fields, type),
          slider = null;
        if (
          (type === 'slider' || control.sliderMin != null) &&
          control.min != null &&
          control.max != null
        ) {
          slider = el('input');
          slider.type = 'range';
          slider.min = control.sliderMin != null ? control.sliderMin : control.min;
          slider.max = control.sliderMax != null ? control.sliderMax : control.max;
          slider.step = control.step || 'any';
          slider.value = control.value;
          slider.disabled = control.enabled === false || control.disabled === true || scalar.invalid;
          slider.setAttribute('aria-label', control.name + ' 슬라이더');
          fields.appendChild(slider);
        }
        var scrub = liveGesture(control, scalar, slider);
        if (type === 'angle') {
          var dial = el('button', 'angle-dial');
          dial.type = 'button';
          dial.setAttribute('aria-label', control.name + ' 각도 다이얼');
          dial.title = '드래그로 각도 변경 · 회전 수는 2x+30 형식으로 입력';
          dial.disabled = control.enabled === false || control.disabled === true;
          var needle = el('span');
          needle.style.transform = 'rotate(' + Number(control.value) + 'deg)';
          dial.appendChild(needle);
          dial.onpointerdown = function (event) {
            if (scalar.invalid || scalar.input.disabled) return;
            event.preventDefault();
            var box = dial.getBoundingClientRect(),
              previous = scalar.interactionValue(),
              startAngle =
                (Math.atan2(
                  event.clientY - box.top - box.height / 2,
                  event.clientX - box.left - box.width / 2,
                ) *
                  180) /
                Math.PI;
            scrub.start();
            function move(e) {
              var angle =
                  (Math.atan2(
                    e.clientY - box.top - box.height / 2,
                    e.clientX - box.left - box.width / 2,
                  ) *
                    180) /
                  Math.PI,
                delta = angle - startAngle;
              if (delta > 180) delta -= 360;
              if (delta < -180) delta += 360;
              previous += delta;
              startAngle = angle;
              var next = e.shiftKey
                ? Math.round(previous / 15) * 15
                : Math.round(previous * 100) / 100;
              needle.style.transform = 'rotate(' + next + 'deg)';
              scrub.change(next, false);
            }
            function stop() {
              document.removeEventListener('pointermove', move);
              document.removeEventListener('pointerup', stop);
              document.removeEventListener('pointercancel', stop);
              activePointerStops.delete(stop);
              return scrub.end();
            }
            activePointerStops.add(stop);
            document.addEventListener('pointermove', move);
            document.addEventListener('pointerup', stop);
            document.addEventListener('pointercancel', stop);
          };
          fields.appendChild(dial);
        }
        label.classList.add('scrub-label');
        label.title = '좌우 드래그로 변경 · Shift: 정밀 · Ctrl: 빠르게';
        label.onpointerdown = function (e) {
          var current = scalar.currentControl();
          if (e.button !== 0 || scalar.input.disabled || scalar.invalid) return;
          e.preventDefault();
          var start = e.clientX,
            base = current.mixed ? 0 : scalar.interactionValue(),
            step = type === 'time' ? scalar.currentDefinition().frameDuration || 0.01 : Number(current.step) || 1;
          scrub.start();
          function move(m) {
            var delta = (m.clientX - start) * step * (m.shiftKey ? 0.1 : m.ctrlKey ? 10 : 1);
            scrub.change(base + delta, !!current.mixed);
          }
          function stop() {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', stop);
            document.removeEventListener('pointercancel', stop);
            activePointerStops.delete(stop);
            return scrub.end();
          }
          activePointerStops.add(stop);
          document.addEventListener('pointermove', move);
          document.addEventListener('pointerup', stop);
          document.addEventListener('pointercancel', stop);
        };
      } else if (type === 'point' || type === 'vector') {
        if (!Array.isArray(control.value)) {
          fields.appendChild(el('span', 'unknown-control', '벡터 값을 읽지 못했습니다.'));
        } else
          control.value.forEach(function (v, i) {
            scalarField(control, fields, 'number', i);
          });
      } else if (type === 'checkbox' || type === 'boolean') {
        var check = el('input');
        check.type = 'checkbox';
        check.checked = control.value === true || control.value === 1;
        check.indeterminate = !!control.mixed;
        check.disabled = control.enabled === false;
        check.setAttribute('aria-label', control.name);
        check.onchange = function () {
          invoke('setControl', {
            id: control.id,
            value: typeof control.value === 'number' ? (check.checked ? 1 : 0) : check.checked,
          }).catch(function () {});
        };
        fields.appendChild(check);
      } else if (type === 'palette') {
        paletteField(control,fields);
      } else if (type === 'dropdown' || type === 'select') {
        var select = el('select'),
          options = optionsOf(control);
        if (control.mixed) {
          var mixed = el('option', '', '서로 다른 값');
          mixed.value = '';
          mixed.selected = true;
          select.appendChild(mixed);
        }
        options.forEach(function (o, i) {
          var option = el('option', '', o.label);
          option.value = i;
          option.selected = !control.mixed && o.value === control.value;
          select.appendChild(option);
        });
        select.disabled = !options.length || control.enabled === false;
        select.setAttribute('aria-label', control.name);
        select.onchange = function () {
          if (select.value !== '')
            invoke('setControl', {
              id: control.id,
              value: options[Number(select.value)].value,
            }).catch(function () {});
        };
        fields.appendChild(select);
      } else if (type === 'font') {
        fontField(control, fields);
      } else if (type === 'text' || type === 'string') {
        var text = el('textarea');
        text.value = control.mixed ? '' : String(control.value == null ? '' : control.value);
        text.placeholder = control.mixed ? '서로 다른 값' : '';
        text.disabled = control.enabled === false;
        text.setAttribute('aria-label', control.name);
        var composing=false;
        text.addEventListener('compositionstart',function(){composing=true;});
        text.addEventListener('compositionend',function(){composing=false;});
        text.onchange = function () {
          if(composing||control.enabled===false)return;
          invoke('setControl', { id: control.id, value: text.value }).catch(function () {});
        };
        fields.appendChild(text);
        if(/[\r\n]+\s*$/.test(text.value))fields.appendChild(el('span','control-comment','텍스트 끝에 빈 줄이 있습니다. 의도한 줄바꿈인지 확인하세요.'));
      } else if (type === 'color') {
        var arr = Array.isArray(control.value),
          color = el('input');
        color.type = 'color';
        color.value = colorInputValue(control.value);
        color.setAttribute('aria-label', control.name);
        color.disabled = control.disabled === true || control.enabled === false;
        if (control.readOnlyReason) {
          color.title = control.readOnlyReason;
          fields.appendChild(el('span', 'control-comment', control.readOnlyReason));
        }
        color.onchange = function () {
          if (color.disabled) return;
          var next = arr
            ? [1, 3, 5].map(function (i) {
                return parseInt(color.value.slice(i, i + 2), 16) / 255;
              })
            : color.value;
          if (arr && control.value.length > 3) next.push(control.value[3]);
          invoke('setControl', { id: control.id, value: next }).catch(function () {});
        };
        fields.appendChild(color);
        if(state.colorPicker&&state.colorPicker.available){
          var nativePicker=button('AE 색상 선택기',function(){
            if(pickerPending||!config.supports('pickColor'))return;
            pickerPending=true;syncPickerButtons();
            var captured={id:control.id,context:core.contextPayload(state),expectedRevision:state.projectRevision};
            config.status('AE 색상 선택기…','busy');
            return config.call('pickColor',captured,{awaitCompletion:true}).then(function(result){
              if(!result||result.cancelled){config.status('색상 선택을 취소했습니다.');return;}
              return invoke('setControl',Object.assign({},captured,{value:result.value}));
            }).catch(error).finally(function(){pickerPending=false;syncPickerButtons();});
          },!pickerPending&&!color.disabled&&config.supports('pickColor'));
          nativePicker.dataset.nativePicker=color.disabled?'readonly':'editable';
          nativePicker.title='RGB 색상을 선택합니다. 기존 알파는 유지하며 HDR·알파 편집은 지원하지 않습니다.';
          fields.appendChild(nativePicker);
        }
      } else if (type === 'comment') {
        fields.appendChild(el('span', 'control-comment', control.value || control.message || ''));
      } else if (type === 'media replacement' || type === 'media') {
        fields.appendChild(
          el(
            'span',
            'control-comment',
            (control.value && control.value.name) || control.value || '연결된 미디어 없음',
          ),
        );
      } else
        fields.appendChild(el('span', 'unknown-control', '이 속성은 현재 편집할 수 없습니다.'));
      if (control.actions && control.actions.length) {
        var actions = el('div', 'control-actions');
        actionButtons(control, actions);
        fields.appendChild(actions);
      }
    }
    function renderApplied() {
      var target = config.applied;
      target.textContent = '';
      var supported = config.supports('presetAction'),
        toolbar = el('div', 'preset-actions');
      var scopeSelect = el('select');
      [
        ['all', '전체'],
        ['transitions', 'Transitions - All'],
        ['in', 'In'],
        ['out', 'Out'],
        ['effects', 'Effects'],
      ].forEach(function (pair) {
        var o = el('option', '', pair[1]);
        o.value = pair[0];
        scopeSelect.appendChild(o);
      });
      scopeSelect.setAttribute('aria-label', '프리셋 작업 범위');
      toolbar.appendChild(scopeSelect);
      var scopedButtons = [];
      function canUseScope(action) {
        var can =
          supported &&
          (action === 'paste'
            ? state.clipboard && state.clipboard.numPresets > 0
            : (state.applied || []).some(function (preset) { return core.presetScopeMatches(preset, scopeSelect.value) && core.actionState(preset.actions, action).enabled; }));
        if (action === 'copy' && state.clipboard && state.clipboard.canCopy === false) can = false;
        return !!can;
      }
      ['copy', 'paste', 'remove', 'reset'].forEach(function (action) {
        var can = canUseScope(action), actionButton = button(
            action,
            function () {
              return invoke('presetAction', { action: action, scope: scopeSelect.value });
            },
            can,
            can ? '' : '현재 선택 또는 클립보드에서 사용할 수 없습니다.',
          );
        scopedButtons.push({action:action,button:actionButton});
        toolbar.appendChild(actionButton);
      });
      scopeSelect.onchange = function () { scopedButtons.forEach(function (item) { var can = canUseScope(item.action); item.button.disabled = !can; item.button.title = can ? '' : '현재 선택 또는 클립보드에서 사용할 수 없습니다.'; }); };
      target.appendChild(toolbar);
      (state.applied || []).forEach(function (p) {
        var row = el('div', 'applied-row');
        row.appendChild(el('span', '', p.name || p.variantId || p.id));
        row.appendChild(el('small', '', p.direction || ''));
        ['reveal', 'copy', 'reset', 'remove'].forEach(function (action) {
          var a = core.actionState(p.actions, action);
          row.appendChild(
            button(
              action,
              function () {
                if (action === 'reveal' && config.reveal && config.reveal(p.variantId) === false) return;
                return invoke('presetAction', {
                  action: action,
                  scope: p.direction === 'in' || p.direction === 'out' ? p.direction : 'all',
                  instanceId: p.instanceId || p.id,
                });
              },
              supported && a.enabled,
              a.reason,
            ),
          );
        });
        target.appendChild(row);
      });
      if (state.legacyTimeline) {
        var warning = el(
          'div',
          'editor-warning',
          '이 레이어에는 이전 형식의 타임라인이 있습니다. 업데이트는 선택한 항목에만 적용됩니다.',
        );
        warning.appendChild(
          button(
            'upgradeTimeline',
            function () {
              return invoke('presetAction', { action: 'upgradeTimeline', scope: 'all' });
            },
            supported,
          ),
        );
        target.appendChild(warning);
      }
    }
    function updateExpressionWarnings(next) {
      var warnings = next && next.expressionWarnings,
        visible = Array.isArray(warnings) && warnings.some(function (warning) {
          return warning && warning.code === 'LEGACY_EXPRESSION_ERRORS' && warning.engine === 'extendscript' &&
            Array.isArray(warning.rootLayerIds) && warning.rootLayerIds.length > 0 && warning.rootLayerIds.length <= 2000 &&
            warning.rootLayerIds.every(function (id) { return Number.isSafeInteger(id) && id > 0; });
        });
      if (!visible) {
        if (expressionWarningRegion) expressionWarningRegion.remove();
        expressionWarningRegion = null;
        return;
      }
      if (expressionWarningRegion && expressionWarningRegion.parentNode === config.root) return;
      expressionWarningRegion = el('div', 'editor-warning');
      expressionWarningRegion.dataset.expressionWarning = 'LEGACY_EXPRESSION_ERRORS';
      expressionWarningRegion.textContent = '현재 프로젝트는 Legacy ExtendScript를 사용하고 있으며 선택한 프리셋 레이어에서 표현식 오류가 확인되었습니다. 프로젝트 설정에서 표현식 엔진을 확인하고, 해당 표현식의 오류 내용도 확인하세요.';
      config.root.insertBefore(expressionWarningRegion, config.root.firstChild);
    }
    function updateFocusedMetadata(next) {
      if (!state || !next || state.instanceId !== next.instanceId) return;
      state = next;
      updateExpressionWarnings(next);
      var controls = new Map((next.controls || []).map(function (control) { return [control.id, control]; }));
      Array.from(config.root.querySelectorAll('[data-control-id]')).forEach(function (row) {
        var control = controls.get(row.dataset.controlId);
        if (control && row._refreshScalar && !activeGestureControllers.size && !pendingWrites.size) row._refreshScalar(control);
        if (!control || typeOf(control) !== 'color') return;
        var color = row.querySelector('input[type="color"]'), label = row.querySelector('.control-label');
        if (!color || !label) return;
        label.textContent = control.name || '';
        color.setAttribute('aria-label', control.name || '');
        if (color !== document.activeElement) color.value = colorInputValue(control.value);
      });
    }
    function render(next) {
      state = next;
      if (!state) {
        config.root.textContent = 'After Effects에서 레이어를 선택하세요.';
        return;
      }
      config.selection.textContent =
        state.numSelectedLayers === 1
          ? state.selectedLayerName || '선택한 레이어'
          : state.numSelectedLayers + '개 레이어 선택';
      renderApplied();
      config.root.textContent = '';
      updateExpressionWarnings(state);
      if (mediaUI) mediaUI.mount(config.root, state);
      paletteSlotManager(config.root);
      if (state.hasError)
        config.root.appendChild(
          el(
            'div',
            'editor-warning',
            (state.errors || [])
              .map(function (e) {
                return e.message || (e.error && e.error.message) || String(e);
              })
              .join('\n') ||
              (state.error && state.error.message) ||
              state.message ||
              '선택 상태를 읽는 중 문제가 생겼습니다.',
          ),
        );
      if (!state.numSelectedLayers) {
        config.root.appendChild(el('div', 'editor-empty', '컴포지션에서 레이어를 선택하세요.'));
        return;
      }
      var groups = {},
        groupIds = {};
      function groupContainer(parts, metadata, parentRoot) {
        var parent = parentRoot || config.root,
          key = parentRoot && metadata ? metadata.parentId + '/' : '';
        parts.forEach(function (name, i) {
          key += (key ? '/' : '') + name;
          if (!groups[key]) {
            var groupKey = key,
              detail = el('details', 'control-group'),
              meta = i === parts.length - 1 && metadata;
            detail.open = Object.prototype.hasOwnProperty.call(collapsed, key)
              ? !collapsed[key]
              : meta
                ? meta.defaultExpanded !== false
                : true;
            var summary = el('summary', '', name);
            detail.appendChild(summary);
            if (meta && scope.ContentriumPropertySets)
              scope.ContentriumPropertySets.mount(summary, meta, {
                call: function(method,payload){var work=config.call(method,payload);return payload.action==='apply'?trackWrite(work):work;},
                status: config.status,
                refresh: config.refresh,
                supports: config.supports,
                context: function () {
                  return core.contextPayload(state);
                },
                capture: function () {return {context:core.contextPayload(state),expectedRevision:state&&state.projectRevision};},
              });
            detail.ontoggle = function () {
              collapsed[groupKey] = !detail.open;
            };
            parent.appendChild(detail);
            groups[key] = detail;
          }
          parent = groups[key];
        });
        return parent;
      }
      (state.controlGroups || []).forEach(function (group) {
        var parts = Array.isArray(group.groupPath)
            ? group.groupPath
            : (group.groupPath || group.name || group.id).split(' / '),
          parent = groupContainer(
            group.parentId && groupIds[group.parentId] ? [group.name || group.id] : parts,
            group,
            group.parentId && groupIds[group.parentId],
          );
        groupIds[group.id] = parent;
        if (group.nodeType === 'warning')
          parent.appendChild(el('div', 'editor-warning', group.message || group.name));
        if (group.actions && group.actions.length) {
          var actions = el('div', 'control-actions');
          actionButtons(group, actions);
          parent.appendChild(actions);
        }
      });
      (state.controls || []).forEach(function (control) {
        var parts = Array.isArray(control.groupPath)
            ? control.groupPath
            : (control.groupPath || control.group || '속성').split(' / '),
          parent = (control.parentId && groupIds[control.parentId]) || groupContainer(parts);
        renderControl(control, parent);
      });
      if (!(state.controls || []).length)
        config.root.appendChild(
          el('div', 'editor-empty', '이 선택에는 편집할 프리셋 속성이 없습니다.'),
        );
    }
    return {
      render: render,
      prepareHistory: prepareHistory,
      updateFocusedMetadata: updateFocusedMetadata,
      isMediaDialogOpen: function () { return !!mediaUI && mediaUI.isOpen(); },
      clearFonts: function () {
        fonts = null;
        fontsAvailable = null;
      },
      typeOf: typeOf,
    };
  }
  var api = { create: create, typeOf: typeOf, optionsOf: optionsOf, newGestureId:newGestureId, createGestureController:createGestureController };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  scope.ContentriumEditor = api;
})(typeof window === 'undefined' ? globalThis : window);
