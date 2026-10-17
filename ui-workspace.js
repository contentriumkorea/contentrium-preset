(function (scope) {
  'use strict';
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  var settingsDefinition = [
    ['pausePreviewWhenInactive', '패널이 비활성화되면 미리보기 일시 정지', 'checkbox'],
    ['presetMotionBlurEnabled', '프리셋 적용 시 모션 블러 켜기', 'checkbox'],
    ['presetPseudoEnabled', '프리셋을 하나의 효과 컨트롤러로 묶기', 'checkbox'],
    [
      'insertPrecompAfterInTransition',
      '프리컴포지션 삽입 위치',
      'select',
      [
        [false, '레이어 시작'],
        [true, 'In 전환 종료'],
      ],
    ],
    [
      'copyUserLibFootageNextToProject',
      '사용자 미디어 가져오기',
      'select',
      [
        [true, '프로젝트 옆에 복사'],
        [false, '원본 파일에 연결'],
      ],
    ],
  ];
  function toolRequest(tool, action, values, frameDuration) {
    var p = Object.assign({}, values);
    if (tool === 'shifter' && p.frames != null) {
      if (!(frameDuration > 0)) throw new Error('컴포지션의 프레임 정보를 읽지 못했습니다.');
      p.seconds = Number(p.frames) * frameDuration;
      delete p.frames;
    }
    return { tool: tool, action: action, params: p };
  }
  function defaultEasingPresets(mode) {
    var low = mode === 'pairs' ? 0.1 : 0;
    return [
      [90, 90],
      [90, low],
      [low, 90],
      [45, 90],
      [90, 45],
      [0, 0],
    ].map(function (values, i) {
      return { id: mode + '-' + i, name: values.join(' / '), mode: mode, values: values };
    });
  }
  function validEasingPreset(preset) {
    if (
      !preset ||
      ['single', 'pairs', 'both'].indexOf(preset.mode) === -1 ||
      !Array.isArray(preset.values) ||
      preset.values.length !== 2 ||
      !preset.values.every(function (v) {
        return Number.isFinite(v) && v >= 0 && v <= 100;
      })
    )
      throw new Error('이징 영향도는 0~100이어야 합니다.');
    return preset;
  }
  function easingPoint(incoming, outgoing) {
    return { first: [outgoing / 100, 1], second: [(100 - incoming) / 100, 0] };
  }
  function resolveEasingMode(state, previous) {
    var value = state && state.toolState && state.toolState.easing && state.toolState.easing.selectionMode;
    return {
      mode: value === 'single' || value === 'pairs' ? value : previous === 'pairs' ? 'pairs' : 'single',
      available: value === 'single' || value === 'pairs' || value === 'none',
      empty: value === 'none',
    };
  }
  function tutorialVisible(preferences, tool) {
    return !preferences || preferences[tool] !== false;
  }
  function selectedIds(state) {
    var ids = state && state.context && state.context.layerIds;
    if (!Array.isArray(ids) || ids.some(function (id) { return !Number.isSafeInteger(id) || id <= 0; }) || new Set(ids).size !== ids.length) return null;
    return ids.slice();
  }
  function createSelectionOrderTracker() {
    var context = null, selected = [], order = [], known = false, lastAt = null, reason = 'no-composition';
    function snapshot() { return {known:known,ids:order.slice(),reason:reason}; }
    return {
      update:function (state, at) {
        var ids = selectedIds(state), ctx = state && state.context;
        if (!ids || !ctx.compositionId) { context=null;selected=[];order=[];known=false;lastAt=null;reason='no-composition';return snapshot(); }
        var key = JSON.stringify([ctx.projectKey,ctx.compositionId]),
          interrupted = lastAt !== null && (at < lastAt || at - lastAt > 3000),
          changed = key !== context;
        if (changed || interrupted) { known=false;order=[];selected=[];reason=interrupted?'interrupted':'initial-multi'; }
        if (ids.length <= 1) { order=ids.slice();known=true;reason=ids.length?'recording':'empty'; }
        else if (known) {
          var added = ids.filter(function (id) { return selected.indexOf(id) === -1; });
          if (added.length > 1) { order=[];known=false;reason='multi-add'; }
          else { order=order.filter(function (id) { return ids.indexOf(id)!==-1; }).concat(added);reason='recording'; }
        }
        context=key;selected=ids;lastAt=at;
        return snapshot();
      },
      reset:function () { context=null;selected=[];order=[];known=false;lastAt=null;reason='initial-multi'; },
      snapshot:snapshot,
    };
  }
  function selectionOrderParams(record, state) {
    if (!record || !record.known) throw new Error('선택 순서를 확인할 수 없습니다. 선택을 비운 뒤 한 레이어씩 추가하세요.');
    var ids=selectedIds(state), order=record.ids;
    if (!ids || !ids.length || ids.length!==order.length || new Set(order).size!==order.length || order.some(function (id) { return ids.indexOf(id)===-1; })) throw new Error('선택이 변경되었습니다. 선택 순서를 다시 기록하세요.');
    return {selectionOrder:order.slice()};
  }
  function shifterFrameInfo(state) {
    var duration=Number(state && state.frameDuration);
    if (!(duration>0) || !Number.isFinite(duration)) throw new Error('컴포지션의 프레임 정보를 읽지 못했습니다.');
    var nominal=Math.round(1/duration), drop=!!(state.dropFrame || state.dropframe) && (nominal===30 || nominal===60) && Math.abs(duration-1001/(nominal*1000))<0.000001;
    return {frameDuration:duration,nominal:nominal,dropframe:drop};
  }
  function parseShifterTime(text, state) {
    var info=shifterFrameInfo(state), input=String(text).trim(), sign=1, frames, match;
    if (/^[+-]/.test(input)) { if(input[0]==='-')sign=-1;input=input.slice(1); }
    if (/^\d+f?$/i.test(input)) frames=Number(input.replace(/f$/i,''));
    else if ((match=/^(\d{2}):(\d{2}):(\d{2})[:;.](\d+)$/.exec(input))) {
      var h=+match[1],m=+match[2],s=+match[3],f=+match[4],nominal=info.nominal;
      s+=Math.floor(f/nominal);f%=nominal;m+=Math.floor(s/60);s%=60;h+=Math.floor(m/60);m%=60;
      if (h>=24) throw new Error('타임코드는 24시간 미만으로 입력하세요.');
      var dropped=info.dropframe?(nominal===60?4:2):0;
      if(dropped && m%10!==0 && s===0 && f<dropped)f=dropped;
      frames=((h*60+m)*60+s)*nominal+f;
      if(dropped){var minutes=h*60+m;frames-=dropped*(minutes-Math.floor(minutes/10));}
    } else throw new Error('프레임 수 또는 00:00:00:00 형식의 상대 이동 시간을 입력하세요.');
    if(!Number.isSafeInteger(frames))throw new Error('유효한 프레임 수를 입력하세요.');
    var seconds=frames*info.frameDuration*sign;
    if(!Number.isFinite(seconds))throw new Error('이동 시간이 너무 큽니다.');
    return seconds;
  }
  function formatShifterTime(seconds, state) {
    var info=shifterFrameInfo(state), formatter=scope.ContentriumCore;
    if(!formatter && typeof require==='function')formatter=require('./ui-core.js');
    return (seconds>0?'+':'')+formatter.formatTime(seconds,info);
  }
  function sequenceOptions(value) {
    if (String(value).trim() === '') return {};
    var fps = Number(value);
    if (!Number.isFinite(fps) || fps <= 0 || fps > 99)
      throw new Error('프레임레이트는 0 초과 99 이하로 입력하세요.');
    return { conformFrameRate: fps };
  }
  function askName(title, initial) {
    return new Promise(function (resolve) {
      var dialog = el('dialog'),
        form = el('form'),
        heading = el('h2', '', title),
        label = el('label', '', '이름'),
        input = el('input'),
        actions = el('div', 'dialog-actions'),
        cancel = el('button', '', '취소'),
        save = el('button', '', '저장'),
        answered = false;
      input.value = initial || '';
      input.maxLength = 120;
      input.required = true;
      label.appendChild(input);
      cancel.type = 'button';
      save.type = 'submit';
      cancel.onclick = function () {
        dialog.close();
      };
      form.onsubmit = function (event) {
        event.preventDefault();
        answered = true;
        resolve(input.value.trim());
        dialog.close();
      };
      actions.appendChild(cancel);
      actions.appendChild(save);
      form.appendChild(heading);
      form.appendChild(label);
      form.appendChild(actions);
      dialog.appendChild(form);
      dialog.addEventListener('close', function () {
        if (!answered) resolve(null);
        dialog.remove();
      });
      document.body.appendChild(dialog);
      dialog.showModal();
      input.select();
    });
  }
  function askLibraryFolderPath() {
    return new Promise(function (resolve) {
      var dialog = el('dialog', 'library-folder-path-dialog'), form = el('form'),
        label = el('label', '', '폴더 경로'), input = el('input'),
        actions = el('div', 'dialog-actions'), cancel = el('button', '', '취소'),
        next = el('button', '', '다음'), answered = false;
      dialog.setAttribute('aria-label', '사용자 라이브러리 폴더 추가');
      form.appendChild(el('h2', '', '사용자 라이브러리 폴더 추가'));
      form.appendChild(el('p', 'workspace-help', '파일 탐색기의 주소 표시줄에서 폴더 경로를 복사해 붙여넣으세요.'));
      input.type = 'text'; input.required = true; input.maxLength = 32767;
      input.setAttribute('aria-label', '폴더 경로');
      label.appendChild(input); form.appendChild(label);
      cancel.type = 'button'; next.type = 'submit';
      cancel.onclick = function () { dialog.close(); };
      form.onsubmit = function (event) {
        event.preventDefault();
        if (answered) return;
        var path = input.value.trim();
        if (path.length >= 2 && path[0] === '"' && path[path.length - 1] === '"') path = path.slice(1, -1);
        if (!path.trim()) return;
        answered = true; dialog.close(); resolve(path);
      };
      actions.appendChild(cancel); actions.appendChild(next); form.appendChild(actions);
      dialog.appendChild(form);
      dialog.addEventListener('close', function () { if (!answered) { answered = true; resolve(null); } dialog.remove(); });
      document.body.appendChild(dialog); dialog.showModal(); input.select();
    });
  }
  function addLibraryFolderDialog(path, submit) {
    return new Promise(function (resolve, reject) {
      var dialog = el('dialog', 'library-folder-dialog'), actions = el('div', 'dialog-actions'),
        cancel = el('button', '', '취소'), add = el('button', '', '추가'),
        selected = 'localCache', pending = false, finished = false, closed = false, radios = [];
      dialog.setAttribute('aria-label', '라이브러리 폴더 추가');
      dialog.appendChild(el('h2', '', '미리보기 저장 위치'));
      dialog.appendChild(el('p', 'workspace-help', path));
      [['userFolder', '선택한 폴더 안에 저장'], ['localCache', '프로그램 내부 캐시']].forEach(function (pair) {
        var label = el('label', 'library-preview-location-option'), input = el('input');
        input.type = 'radio'; input.name = 'previewsLocation'; input.value = pair[0]; input.checked = selected === pair[0];
        input.onchange = function () { if (!closed) { selected = pair[0]; radios.forEach(function (r) { r.checked = r.value === selected; }); } };
        radios.push(input); label.appendChild(input); label.appendChild(el('span', '', pair[1])); dialog.appendChild(label);
      });
      cancel.type = add.type = 'button';
      cancel.onclick = function () { dialog.close(); };
      dialog.addEventListener('cancel', function () {});
      add.onclick = function () {
        if (pending || finished || closed) return;
        pending = true; add.disabled = true; var payload = { path: path, previewsLocation: selected };
        Promise.resolve().then(function () { return submit(payload); }).then(function (value) {
          finished = true; pending = false; if (!closed) dialog.close(); resolve(value);
        }, function (error) { finished = true; pending = false; if (!closed) dialog.close(); reject(error); });
      };
      actions.appendChild(cancel); actions.appendChild(add); dialog.appendChild(actions);
      dialog.addEventListener('close', function () { closed = true; dialog.remove(); if (!pending && !finished) resolve({ cancelled: true }); });
      document.body.appendChild(dialog); dialog.showModal();
    });
  }
  function create(config) {
    var audioPlayers = {},
      libraryVisible = config.libraryVisible !== false,
      libraryPage = 0,
      itemOptions = new Map(),
      toolNav = null,
      toolView = config.toolView || null,
      closeToolMenu = null,
      lastEasingMode = 'single',
      syncEasingMode = null,
      selectionTracker = createSelectionOrderTracker(),
      syncShifterState = null,
      settings = {},
      library = null,
      libraryLoad = null,
      settingsLoaded = false;
    function report(e) {
      config.status(e.message || String(e), 'error');
    }
    function invoke(method, payload) {
      config.status('작업 중…', 'busy');
      return config
        .call(method, payload || {}, {awaitCompletion:method==='importLibraryItem'||method==='replaceLibraryItem'})
        .then(function (result) {
          config.status((result && result.message) || '변경했습니다.');
          config.refresh();
          return result;
        })
        .catch(function (e) {
          report(e);
          throw e;
        });
    }
    function supported(method) {
      return config.supports(method);
    }
    function option(select, label, value) {
      var o = el('option', '', label);
      o.value = String(value);
      select.appendChild(o);
    }
    function row(root, label, input) {
      var n = el('label', 'workspace-row');
      n.appendChild(el('span', '', label));
      n.appendChild(input);
      root.appendChild(n);
      return n;
    }
    function check(root, label, value, enabled, onchange) {
      var n = el('input');
      n.type = 'checkbox';
      n.checked = !!value;
      n.disabled = !enabled;
      n.onchange = function () {
        onchange(n.checked);
      };
      row(root, label, n);
      return n;
    }
    function button(root, label, method, handler) {
      var b = el('button', '', label);
      b.type = 'button';
      b.setAttribute('aria-label',label);
      b.disabled = !supported(method);
      b.title = b.disabled ? '현재 연결에서는 이 기능을 사용할 수 없습니다.' : '';
      b.onclick = function () {
        if(b.disabled)return;
        b.disabled=true;b.dataset.pending='true';
        Promise.resolve().then(handler).then(function(){
          if(root.closest&&root.closest('[data-tool="keyframes"]')){b.dataset.success='true';b.setAttribute('aria-description','적용했습니다.');setTimeout(function(){delete b.dataset.success;b.removeAttribute('aria-description');},1200);}
        }).catch(report).finally(function(){delete b.dataset.pending;b.disabled=!supported(method);if(b.dataset.libraryReplace)syncTextureButtons(config.getState());});
      };
      root.appendChild(b);
      return b;
    }
    function renderSettings() {
      var root = config.settingsRoot;
      root.textContent = '';
      root.appendChild(el('h2', '', '설정'));
      settingsDefinition.forEach(function (def) {
        var key = def[0],
          enabled = supported('setSettings') && settingsLoaded,
          exists = Object.prototype.hasOwnProperty.call(settings, key);
        if (def[2] === 'checkbox') {
          var input = check(root, def[1], settings[key], enabled && exists, function (v) {
            saveSetting(key, v);
          });
          if (!exists) input.title = '호스트가 이 설정을 제공하지 않습니다.';
        } else {
          var select = el('select');
          def[3].forEach(function (pair) {
            option(select, pair[1], pair[0]);
          });
          select.value = String(settings[key]);
          select.disabled = !enabled || !exists;
          select.onchange = function () {
            saveSetting(key, select.value === 'true');
          };
          row(root, def[1], select);
        }
      });
      var info = el(
        'p',
        'workspace-help',
        settingsLoaded
          ? '설정은 이후 적용하는 프리셋과 가져오는 미디어에 반영됩니다.'
          : 'After Effects에 연결하면 사용 가능한 설정을 표시합니다.',
      );
      root.appendChild(info);
      var links = el('div', 'workspace-actions');
      root.appendChild(links);
      var update = el('a', '', '업데이트 확인');
      update.href = 'https://github.com/contentriumkorea/contentrium-preset/releases/latest';
      update.target = '_blank';
      update.rel = 'noopener';
      links.appendChild(update);
      var guide = el('a', '', '사용 안내');
      guide.href =
        'https://github.com/contentriumkorea/contentrium-preset/blob/main/docs/user-guide.md';
      guide.target = '_blank';
      guide.rel = 'noopener';
      links.appendChild(guide);
      root.appendChild(
        el(
          'p',
          'workspace-help',
          'Contentrium Preset · 로컬 프리셋과 사용자 라이브러리로 작업합니다.',
        ),
      );
    }
    function saveSetting(key, value) {
      var previous = settings[key];
      settings[key] = value;
      return invoke('setSettings', { key: key, value: value })
        .then(function (result) {
          if (result && result.settings) settings = result.settings;
          config.onSettings(settings);
          renderSettings();
        })
        .catch(function () {
          settings[key] = previous;
          renderSettings();
        });
    }
    function loadSettings() {
      if (!supported('getSettings')) {
        renderSettings();
        return Promise.resolve();
      }
      return config
        .call('getSettings', {})
        .then(function (value) {
          settings = (value && value.settings) || value || {};
          settingsLoaded = true;
          config.onSettings(settings);
          renderSettings();
        })
        .catch(report);
    }
    function prepareItemOptions(item, options, context) {
      var player = audioPlayers[item.id],
        enabled = library && library.capabilities && library.capabilities.audioTransforms === true,
        saved = itemOptions.get(item.id) || {},
        settings = player ? player.getOptions() : saved.audio;
      options=Object.assign({},options||{});
      if(item.kind==='image-sequence'&&!Object.prototype.hasOwnProperty.call(options,'conformFrameRate'))options=Object.assign({},sequenceOptions(saved.sequenceFPS||''),options);
      if (!enabled || !settings || (!settings.pitchShift && !settings.reverse))
        return Promise.resolve(options || {});
      if (!scope.ContentriumAudioExport) throw new Error('오디오 내보내기 모듈을 읽지 못했습니다.');
      var temporary=!player;
      if(temporary)player=scope.ContentriumAudio.mount(el('div'),item,{initialOptions:settings,applyTransforms:true});
      return scope.ContentriumAudioExport.prepare({
        itemId: item.id,
        player: {renderWav:function(){return player.prepareRender().then(function(){return player.renderWav();});}},
        options: Object.assign({}, options || {}, settings),
        context: context,
        call: function (method, payload) { return config.call(method, Object.assign({}, payload, { sourceStamp: item.sourceStamp })); },
      }).finally(function(){if(temporary)player.destroy();});
    }
    function availableItem(item, replace, texture) {
      if (!item || item.missing || item.ambiguous || item.importable === false)
        throw new Error((item && item.reason) || '원본 파일을 찾을 수 없거나 가져올 수 없습니다.');
      var can = scope.ContentriumLibrary;
      if (can && !(texture ? can.canTexture(item, library) : replace ? can.canReplace(item, library) : can.canImport(item, library)))
        throw new Error('현재 연결에서 이 항목의 ' + (replace ? '교체' : '가져오기') + '를 지원하지 않습니다.');
      return item;
    }
    function libraryItemById(id, replace, texture) {
      var matches = ((library && library.items) || []).filter(function (item) { return item.id === id; });
      if (!matches.length) throw new Error('라이브러리 항목을 찾을 수 없습니다. 새로고침하세요.');
      var first = matches[0], identity = function (item) { return String(item.path || item.preview || '').replace(/\\/g, '/').toLowerCase() + '|' + (item.kind || item.type); };
      if (matches.some(function (item) { return identity(item) !== identity(first); }))
        throw new Error('항목 ID가 중복되어 원본을 구분할 수 없습니다.');
      return availableItem(first, replace, texture);
    }
    function importUserItem(item, options) {
      var state=config.getState(),context=scope.ContentriumCore.contextPayload(state),revision=state&&state.projectRevision;
      context=context?JSON.parse(JSON.stringify(context)):context;
      options=Object.assign({},options||{});
      if(item.kind!=='preset'||!supported('describeLibraryPreset'))return importItem(item,options,context,false);
      if(!context||!Number.isFinite(revision))return Promise.reject(new Error('프로젝트 선택 상태를 새로고침한 뒤 다시 적용하세요.'));
      return config.call('describeLibraryPreset',{id:item.id,sourceStamp:item.sourceStamp}).then(function(description){
        if(!description||description.kind!=='user-property-preset')return importItem(item,options,context,false,revision);
        return new Promise(function(resolve,reject){
          var dialog=el('dialog','preset-apply-dialog'),submitted=false;
          dialog.setAttribute('aria-label','사용자 프리셋 적용');
          dialog.appendChild(el('h2','','사용자 프리셋 적용'));
          dialog.appendChild(el('p','','선택한 레이어에 저장된 속성을 적용합니다. 글자와 기존 애니메이션은 기본으로 유지합니다.'));
          var replaceText=check(dialog,'저장한 글자로 바꾸기',false,description.containsSourceText===true,function(){});
          var overwrite=check(dialog,'기존 키프레임과 표현식 덮어쓰기',false,true,function(){});
          var actions=el('div','dialog-actions'),cancel=el('button','','취소'),apply=el('button','','적용');
          cancel.type=apply.type='button';cancel.onclick=function(){dialog.close();};
          apply.onclick=function(){
            if(submitted)return;submitted=true;
            var chosen=Object.assign({},options,{replaceText:!replaceText.disabled&&replaceText.checked,overwrite:overwrite.checked});
            dialog.close();importItem(item,chosen,context,false,revision).then(resolve,reject);
          };
          actions.append(cancel,apply);dialog.appendChild(actions);
          dialog.addEventListener('close',function(){dialog.remove();if(!submitted)resolve({cancelled:true});});
          document.body.appendChild(dialog);dialog.showModal();
        });
      });
    }
    function importItem(item, options, initialContext, replace, expectedRevision) {
      var context = initialContext || scope.ContentriumCore.contextPayload(config.getState());
      return Promise.resolve()
        .then(function () {
          availableItem(item, replace, options&&options.insertAsTexture===true);
          if(replace&&!scope.ContentriumLibrary.canReplaceSelection(item,config.getState()))throw new Error('잠기지 않은 오디오 전용 파일 레이어만 선택한 뒤 교체하세요.');
          if(options&&options.insertAsTexture){var state=config.getState(),caps=state&&state.precompApplyOptions||{};if(!scope.ContentriumLibrary.canTexture(item,library)||caps[replace?'canReplaceTexture':'canApplyTexture']!==true)throw new Error(replace?'교체할 Contentrium 텍스처 레이어 하나를 선택하세요.':'텍스처를 적용할 일반 레이어 하나를 선택하세요.');}
          return prepareItemOptions(item, options, context);
        })
        .then(function (prepared) {
          if(replace&&!scope.ContentriumLibrary.canReplaceSelection(item,config.getState()))throw new Error('오디오 교체 대상이 변경되었습니다. 선택을 다시 확인하세요.');
          var payload={id:item.id,sourceStamp:item.sourceStamp,options:prepared,context:context};
          if(expectedRevision!==undefined)payload.expectedRevision=expectedRevision;
          return invoke(replace ? 'replaceLibraryItem' : 'importLibraryItem', payload);
        })
        .then(function (result) {
          if (!result || !result.requiresComposition) return result;
          return new Promise(function (resolve, reject) {
          var dialog = el('dialog', 'composition-dialog'),
            title = el('h2', '', replace ? '교체할 컴포지션' : '가져올 컴포지션'),
            select = el('select'), submitted = false;
          (result.compositions || []).forEach(function (comp) {
            var o = el(
              'option',
              '',
              comp.name +
                (comp.duration != null ? ' · ' + Number(comp.duration).toFixed(2) + '초' : ''),
            );
            o.value = String(comp.id);
            select.appendChild(o);
          });
          select.setAttribute('aria-label', '컴포지션 선택');
          dialog.appendChild(title);
          dialog.appendChild(el('p', 'editor-warning', (replace ? '선택한 레이어의 소스를 컴포지션으로 교체합니다.' : '컴포지션을 선택해 타임라인에 추가합니다.') + ' 취소해도 불러온 항목은 프로젝트에 남습니다.'));
          dialog.appendChild(select);
          var actions = el('div', 'dialog-actions'),
            cancel = el('button', '', '취소'),
            add = el('button', '', replace ? '교체' : '가져오기');
          cancel.type = add.type = 'button';
          cancel.onclick = function () {
            dialog.close();
          };
          add.disabled = !(result.compositions || []).length;
          add.onclick = function () {
            var comp = (result.compositions || []).find(function (c) {
              return String(c.id) === select.value;
            });
            if (!comp) return;
            submitted = true;
            dialog.close();
            importItem(
              item,
              Object.assign({}, options || {}, { compositionId: comp.id, importId: result.importId }),
              context,
              replace,
            ).then(resolve, reject);
          };
          actions.appendChild(cancel);
          actions.appendChild(add);
          dialog.appendChild(actions);
          dialog.addEventListener('close', function () {
            dialog.remove();
            if (!submitted) resolve({ cancelled: true, requiresComposition: true });
          });
          document.body.appendChild(dialog);
          dialog.showModal();
          });
        });
    }
    function clearLibraryRows() {
      var root = config.libraryRoot;
      Object.keys(audioPlayers).forEach(function (id) {
        var saved=itemOptions.get(id)||{};saved.audio=audioPlayers[id].getOptions();itemOptions.set(id,saved);
        audioPlayers[id].destroy();
      });
      audioPlayers = {};
      root.querySelectorAll('video,audio').forEach(function (media) {
        media.pause();media.removeAttribute('src');media.load();
      });
      root.textContent = '';
    }
    function renderLibrary() {
      var root=config.libraryRoot;clearLibraryRows();
      if(!libraryVisible)return;
      root.appendChild(el('h2', '', '사용자 라이브러리'));
      var actions = el('div', 'workspace-actions');
      root.appendChild(actions);
      button(actions, '폴더 추가', 'addLibraryFolder', function () {
        return askLibraryFolderPath().then(function (path) {
          if (path) return addLibraryFolderDialog(path, function (options) { return invoke('addLibraryFolder', options); }).then(function (result) { if (!result || !result.cancelled) return loadLibrary(); });
        });
      });
      button(actions, '새로고침', 'getLibrary', loadLibrary);
      root.appendChild(
        el(
          'p',
          'workspace-help',
          library
            ? '등록한 폴더의 미디어를 선택해 가져오거나 교체하세요.'
            : 'After Effects에 연결하면 사용자 미디어를 불러올 수 있습니다.',
        ),
      );
      ((library && library.folders) || []).forEach(function (folder) {
        var f = typeof folder === 'string' ? { id: folder, path: folder } : folder,
          row = el('div', 'library-folder');
        row.appendChild(el('span', '', f.path || f.name || f.id));
        button(row, '등록 해제', 'removeLibraryFolder', function () {
          return invoke('removeLibraryFolder', { id: f.id, path: f.path }).then(loadLibrary);
        });
        root.appendChild(row);
      });
      var items = (library && (library.items || library.entries)) || [];
      var pages=Math.max(1,Math.ceil(items.length/50));libraryPage=Math.min(libraryPage,pages-1);
      var navigation=el('nav','workspace-actions library-pagination');navigation.setAttribute('aria-label','라이브러리 페이지');
      function pageButton(label,index,disabled){var b=el('button','',label);b.type='button';b.disabled=disabled;b.onclick=function(){libraryPage=index;renderLibrary();config.libraryRoot.scrollTop=0;var pageInfo=config.libraryRoot.querySelector('.library-page-info');if(pageInfo)pageInfo.focus();};navigation.appendChild(b);}
      pageButton('라이브러리 첫 페이지',0,libraryPage===0);pageButton('라이브러리 이전 페이지',libraryPage-1,libraryPage===0);
      var info=el('span','library-page-info',(libraryPage+1)+' / '+pages+' · '+items.length+'개');info.tabIndex=-1;info.setAttribute('aria-live','polite');navigation.appendChild(info);
      pageButton('라이브러리 다음 페이지',libraryPage+1,libraryPage===pages-1);pageButton('라이브러리 마지막 페이지',pages-1,libraryPage===pages-1);root.appendChild(navigation);
      if (library && !items.length)
        root.appendChild(el('div', 'editor-empty', '등록된 미디어가 없습니다.'));
      items.slice(libraryPage*50,(libraryPage+1)*50).forEach(function (item) {
        var saved=itemOptions.get(item.id)||{};
        var row = el('article', 'library-item');
        row.dataset.itemId = item.id;
        var kind = String(item.kind || item.type || '').toLowerCase();
        if (item.preview) {
          var src = item.preview;
          if (/^[a-z]:[\\/]/i.test(src))
            src =
              'file:///' +
              src
                .replace(/\\/g, '/')
                .split('/')
                .map(function (part, i) {
                  return i ? encodeURIComponent(part) : part;
                })
                .join('/');
          if (/^(file:|https?:|blob:)/i.test(src) || !/^\w+:/.test(src)) {
            var media;
            if (
              (/audio|sound/.test(kind) || /\.(wav|mp3|aiff?)(?:$|\?)/i.test(src)) &&
              scope.ContentriumAudio
            ) {
              audioPlayers[item.id] = scope.ContentriumAudio.mount(
                row,
                Object.assign({}, item, { preview: src }),
                {
                  applyTransforms: !!(library.capabilities && library.capabilities.audioTransforms),
                  onError: report,
                  initialOptions:saved.audio,
                  onChange:function(value){var state=itemOptions.get(item.id)||{};state.audio=value;itemOptions.set(item.id,state);},
                },
              );
            } else if (/audio|sound/.test(kind) || /\.(wav|mp3|aiff?)(?:$|\?)/i.test(src)) {
              media = el('audio');
              media.controls = true;
              media.preload = 'none';
            } else if (/video|footage/.test(kind) && /\.(webm|mp4|mov)(?:$|\?)/i.test(src)) {
              media = el('video');
              media.controls = true;
              media.preload = 'metadata';
            } else {
              media = el('img');
              media.loading = 'lazy';
              media.alt = item.name || '미디어';
            }
            if (media) {
              media.src = src;
              row.appendChild(media);
            }
          }
        }
        row.appendChild(el('span', 'library-name', item.name || item.id));
        row.appendChild(el('small', '', item.kind || item.type || ''));
        var sequenceRate = null,
          isSequence = kind === 'image-sequence';
        if (isSequence) {
          row.appendChild(
            el(
              'small',
              'sequence-summary',
              (item.frameCount || 0) +
                '프레임' +
                (item.missingFrameCount ? ' · 누락 ' + item.missingFrameCount + '프레임' : ''),
            ),
          );
          sequenceRate = el('input');
          sequenceRate.type = 'number';
          sequenceRate.min = 0.001;
          sequenceRate.max = 99;
          sequenceRate.step = 'any';
          sequenceRate.placeholder = '원본 해석';
          sequenceRate.setAttribute('aria-label', (item.name || '시퀀스') + ' 프레임레이트');
          sequenceRate.value=saved.sequenceFPS||'';
          sequenceRate.oninput=function(){var state=itemOptions.get(item.id)||{};state.sequenceFPS=sequenceRate.value;itemOptions.set(item.id,state);};
          var label = el('label', 'sequence-rate', 'FPS ');
          label.appendChild(sequenceRate);
          row.appendChild(label);
          if (item.importable === false)
            row.appendChild(
              el('p', 'editor-warning', item.reason || '누락된 프레임이 있어 가져올 수 없습니다.'),
            );
        }
        var itemActions = el('div', 'workspace-actions');
        row.appendChild(itemActions);
        var importButton = button(itemActions, '가져오기', 'importLibraryItem', function () {
          return importUserItem(item, isSequence ? sequenceOptions(sequenceRate.value) : {});
        });
        if (
          item.missing || item.ambiguous ||
          item.importable === false ||
          (isSequence && !(library.capabilities && library.capabilities.imageSequence))
        ) {
          importButton.disabled = true;
          importButton.title = item.reason || '현재 연결에서는 이미지 시퀀스를 가져올 수 없습니다.';
        }
        var replaceButton = button(
          itemActions,
          '선택 항목 교체',
          'replaceLibraryItem',
          function () {
            return importItem(
              item,
              {
                keepTexts: true,
                keepTextProperties: false,
                keepTransform: true,
                keepOtherProperties: false,
              },
              null,
              true,
            );
          },
        );
        replaceButton.dataset.libraryReplace='true';
        if (item.missing || item.ambiguous || item.importable === false || /^(preset|animation-preset)$/.test(kind) || (isSequence && !(library.capabilities && library.capabilities.imageSequenceReplace))) {
          replaceButton.disabled = true;
          replaceButton.title = '현재 연결에서는 시퀀스 교체를 지원하지 않습니다.';
        }
        if(/^(image|video|image-sequence)$/.test(kind)){
          ['apply','replace'].forEach(function(action){
            var b=el('button','',action==='apply'?'Texture':'텍스처 교체');b.type='button';b.dataset.textureAction=action;b.setAttribute('aria-label',b.textContent);itemActions.appendChild(b);
            b.onclick=function(){if(b.disabled)return;b.dataset.pending='true';b.disabled=true;Promise.resolve().then(function(){return importItem(item,{insertAsTexture:true,keepOtherProperties:action==='replace'},null,action==='replace');}).catch(report).finally(function(){delete b.dataset.pending;syncTextureButtons(config.getState());});};
          });
        }
        if (item.managed === true || item.removable === true)
          button(itemActions, '라이브러리에서 제거', 'removeLibraryItem', function () {
            return invoke('removeLibraryItem', { id: item.id }).then(loadLibrary);
          });
        root.appendChild(row);
      });
      syncTextureButtons(config.getState());
    }
    function syncTextureButtons(state){
      var caps=state&&state.precompApplyOptions||{},items=library&&library.items||[];
      Array.from(config.libraryRoot.querySelectorAll('[data-texture-action]')).forEach(function(b){var row=b.closest('.library-item'),item=items.find(function(value){return value.id===row.dataset.itemId;}),replace=b.dataset.textureAction==='replace';b.disabled=b.dataset.pending==='true'||!supported(replace?'replaceLibraryItem':'importLibraryItem')||!scope.ContentriumLibrary.canTexture(item,library)||caps[replace?'canReplaceTexture':'canApplyTexture']!==true;b.title=b.disabled?(replace?'교체할 Contentrium 텍스처 레이어 하나를 선택하세요.':'텍스처를 적용할 일반 레이어 하나를 선택하세요.') : '';});
      Array.from(config.libraryRoot.querySelectorAll('[data-library-replace]')).forEach(function(b){var row=b.closest('.library-item'),item=items.find(function(value){return value.id===row.dataset.itemId;});b.disabled=b.dataset.pending==='true'||!supported('replaceLibraryItem')||!scope.ContentriumLibrary.canReplace(item,library)||!scope.ContentriumLibrary.canReplaceSelection(item,state)||caps.textureSelected===true;b.title=caps.textureSelected?'텍스처 교체 버튼을 사용하세요.':b.disabled?'현재 연결에서는 이 항목을 교체할 수 없습니다.':'';});
    }
    function loadLibrary() {
      if (libraryLoad) return libraryLoad;
      if (!supported('getLibrary')) {
        renderLibrary();
        return Promise.resolve();
      }
      libraryLoad = config
        .call('getLibrary', {}, {awaitCompletion:true})
        .then(function (value) {
          library = value || { items: [], folders: [] };
          renderLibrary();
          if (config.onLibrary) config.onLibrary(library);
          return library;
        })
        .catch(report)
        .finally(function(){libraryLoad=null;});
      return libraryLoad;
    }
    function selectField(root, name, pairs) {
      var s = el('select');
      s.setAttribute('aria-label',name);
      pairs.forEach(function (p) {
        option(s, p[1], p[0]);
      });
      row(root, name, s);
      return s;
    }
    function numberField(root, name, value, min, max, step) {
      var n = el('input');
      n.type = 'number';
      n.value = value;
      if (min != null) n.min = min;
      if (max != null) n.max = max;
      n.step = step || 'any';
      row(root, name, n);
      return n;
    }
    function shiftTimeField(root, name, initialFrames, onCommit) {
      var input=el('input','value-time'), label=el('label','workspace-row scrub-label'), caption=el('span','',name);
      input.type='text';input.value=String(initialFrames);input.autocomplete='off';input.spellcheck=false;
      input.setAttribute('aria-label',name);
      input.title='정수는 프레임 · +/-00:00:00:00 · ↑↓ 한 프레임 · Shift+↑↓ 한 초 · '+(onCommit?'Enter 적용':'Enter 입력 확정');
      label.append(caption,input);root.appendChild(label);
      function read() { return parseShifterTime(input.value,config.getState()||{}); }
      function format() { input.value=formatShifterTime(read(),config.getState()||{}); }
      function commit(expectedContext) {
        try { var seconds=read();if(onCommit)onCommit(seconds,expectedContext);else format(); }
        catch(error){report(error);}
      }
      input.onkeydown=function(event){
        if(event.key==='Enter'){event.preventDefault();commit();}
        else if(event.key==='Escape'){event.preventDefault();input.value=formatShifterTime(0,config.getState()||{});}
        else if(event.key==='ArrowUp'||event.key==='ArrowDown'){
          event.preventDefault();
          try{var info=shifterFrameInfo(config.getState()||{}),delta=(event.shiftKey?1:info.frameDuration)*(event.key==='ArrowUp'?1:-1);input.value=formatShifterTime(read()+delta,config.getState());}
          catch(error){report(error);}
        }
      };
      input.onblur=function(){try{format();}catch(error){report(error);}};
      caption.onpointerdown=function(event){
        if(event.button!==0||input.disabled)return;
        event.preventDefault();
        var original=input.value,base,info,started=false,x=event.clientX,y=event.clientY,
          expectedContext=scope.ContentriumCore.contextPayload(config.getState());
        try{base=read();info=shifterFrameInfo(config.getState());}catch(error){report(error);return;}
        function move(e){var distance=e.clientX-x+y-e.clientY;if(!started&&Math.abs(distance)<3)return;started=true;var steps=Math.trunc(distance);input.value=formatShifterTime(base+steps*(e.shiftKey?1:info.frameDuration),config.getState());}
        function cleanup(){document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',finish);document.removeEventListener('pointercancel',cancel);scope.removeEventListener('blur',cancel);}
        function finish(){cleanup();if(started)commit(expectedContext);else{input.focus();input.select();}}
        function cancel(){cleanup();input.value=original;}
        document.addEventListener('pointermove',move);document.addEventListener('pointerup',finish);document.addEventListener('pointercancel',cancel);scope.addEventListener('blur',cancel);
      };
      return {input:input,read:read,format:format,reset:function(){input.value=formatShifterTime(0,config.getState());}};
    }
    function toolSection(title, description, tool) {
      var section = el('section', 'tool-section');
      section.dataset.tool=tool;
      section.appendChild(el('h2', '', title));
      section.appendChild(el('p', 'workspace-help', description));
      var preferences = {};
      try {
        preferences = JSON.parse(localStorage.getItem('contentrium-preset.tools.tutorials.v1') || '{}') || {};
      } catch (ignore) {}
      var help = el('a', 'workspace-help', title + ' 사용 안내');
      help.href = 'https://github.com/contentriumkorea/contentrium-preset/blob/main/docs/user-guide.md#tools';
      help.target = '_blank';
      help.rel = 'noopener';
      help.hidden = !tutorialVisible(preferences, tool);
      check(section, title + ' 도움말 표시', !help.hidden, true, function (visible) {
        help.hidden = !visible;
        try {
          var current = {};
          try { current = JSON.parse(localStorage.getItem('contentrium-preset.tools.tutorials.v1') || '{}'); } catch (ignoreCorruptPreference) {}
          if (!current || typeof current !== 'object' || Array.isArray(current)) current = {};
          current[tool] = visible;
          localStorage.setItem('contentrium-preset.tools.tutorials.v1', JSON.stringify(current));
        } catch (error) { report(error); }
      });
      section.appendChild(help);
      if(config.openTool){var separate=el('button','tool-open-window',title+' 별도 창으로 열기');separate.type='button';separate.onclick=function(){config.openTool(tool);};section.appendChild(separate);}
      config.toolsRoot.appendChild(section);
      if (toolNav) {
        var jump = el('button', '', title);
        jump.type = 'button';
        jump.onclick = function () {
          section.scrollIntoView({ block: 'start', behavior: 'smooth' });
        };
        toolNav.appendChild(jump);
      }
      return section;
    }
    function setToolView(view){
      if(view!==null&&['easing','keyframes','anchor','shifter'].indexOf(view)===-1)throw Error('Unknown helper panel');
      if(closeToolMenu)closeToolMenu(false);
      toolView=view;
      Array.from(config.toolsRoot.querySelectorAll('.tool-section')).forEach(function(section){section.hidden=!!view&&section.dataset.tool!==view;});
      if(toolNav)toolNav.hidden=!!view;
      Array.from(config.toolsRoot.querySelectorAll('.tool-open-window')).forEach(function(button){button.hidden=!!view;});
    }
    function runTool(tool, action, values, expectedContext) {
      var state = config.getState() || {},
        payload = toolRequest(tool, action, values, state.frameDuration);
      payload.context = expectedContext || scope.ContentriumCore.contextPayload(state);
      return invoke('toolAction', payload);
    }
    function renderTools() {
      var root = config.toolsRoot;
      if(closeToolMenu)closeToolMenu(false);
      root.textContent = '';
      toolNav = el('nav', 'tool-nav');
      toolNav.setAttribute('aria-label', '도구 선택');
      root.appendChild(toolNav);
      var ease = toolSection('이징', '선택한 키프레임의 들어오기·나가기 속도 영향을 변경합니다.', 'easing'),
        mode = selectField(ease, '대상 모드', [
          ['auto', '자동'],
          ['single', '각 키프레임'],
          ['pairs', '키프레임 쌍'],
        ]),
        direction = selectField(ease, '방향', [
          ['both', 'In / Out'],
          ['in', 'In'],
          ['out', 'Out'],
        ]),
        incoming = numberField(ease, 'In 영향도', 50, 0, 100, 0.01),
        outgoing = numberField(ease, 'Out 영향도', 50, 0, 100, 0.01),
        locked = true,
        hostMode = resolveEasingMode(config.getState(), lastEasingMode),
        modeNotice = el('p', 'workspace-help');
      ease.appendChild(modeNotice);
      function resolvedMode() {
        return mode.value === 'auto' ? hostMode.mode : mode.value;
      }
      function canApplyEase() {
        return supported('toolAction') && (mode.value !== 'auto' || hostMode.available);
      }
      function applyEase() {
        if (!canApplyEase()) throw new Error('자동 선택 모드를 확인할 수 없습니다. 대상 모드를 직접 선택하세요.');
        var values = validEasingPreset({
          mode: resolvedMode(),
          values: [Number(incoming.value), Number(outgoing.value)],
        }).values;
        return runTool('easing', 'apply', {
          mode: resolvedMode(),
          direction: direction.value,
          influenceIn: values[0],
          influenceOut: values[1],
        });
      }
      var lock = check(ease, 'In / Out 값 연결', true, true, function (v) {
        locked = v;
        if (v) outgoing.value = incoming.value;
        drawGraph();
      });
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 220 120');
      svg.setAttribute('class', 'easing-graph');
      svg.setAttribute('aria-label', '이징 영향도 그래프');
      ease.appendChild(svg);
      var draggingGraph=false;
      svg.addEventListener('click',function(event){if(draggingGraph||event.target.closest('circle'))return;if(canApplyEase())applyEase().catch(report);});
      function svgNode(tag, attributes) {
        var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
        Object.keys(attributes).forEach(function (key) {
          n.setAttribute(key, attributes[key]);
        });
        svg.appendChild(n);
        return n;
      }
      svgNode('path', { d: 'M 10 10 V 110 H 210', class: 'graph-axis' });
      var curve = svgNode('path', { class: 'graph-curve' }),
        lineA = svgNode('path', { class: 'graph-handle-line' }),
        lineB = svgNode('path', { class: 'graph-handle-line' }),
        handleOut = svgNode('circle', {
          r: 5,
          tabindex: 0,
          role: 'slider',
          'aria-label': 'Out 영향도',
        }),
        handleIn = svgNode('circle', {
          r: 5,
          tabindex: 0,
          role: 'slider',
          'aria-label': 'In 영향도',
        });
      function drawGraph() {
        svg.dataset.mode = resolvedMode();
        if (resolvedMode() === 'pairs') {
          var left = 10 + 90 * (1 - Number(incoming.value) / 100),
            right = 120 + 90 * Number(outgoing.value) / 100;
          curve.setAttribute('d', 'M10 110 C10 110 ' + left + ' 10 100 10 M210 10 C210 10 ' + right + ' 110 120 110');
          lineA.setAttribute('d', 'M120 110 H' + right);
          lineB.setAttribute('d', 'M10 10 H' + left);
          handleOut.setAttribute('cx', right);
          handleOut.setAttribute('cy', 110);
          handleIn.setAttribute('cx', left);
          handleIn.setAttribute('cy', 10);
          handleOut.setAttribute('aria-valuenow', outgoing.value);
          handleIn.setAttribute('aria-valuenow', incoming.value);
          return;
        }
        var p = easingPoint(Number(incoming.value), Number(outgoing.value)),
          a = 10 + p.first[0] * 200,
          b = 10 + p.second[0] * 200;
        curve.setAttribute('d', 'M10 110 C' + a + ' 110 ' + b + ' 10 210 10');
        lineA.setAttribute('d', 'M10 110 H' + a);
        lineB.setAttribute('d', 'M210 10 H' + b);
        handleOut.setAttribute('cx', a);
        handleOut.setAttribute('cy', 110);
        handleIn.setAttribute('cx', b);
        handleIn.setAttribute('cy', 10);
        handleOut.setAttribute('aria-valuenow', outgoing.value);
        handleIn.setAttribute('aria-valuenow', incoming.value);
      }
      [handleIn, handleOut].forEach(function (handle) {
        var field = handle === handleIn ? incoming : outgoing;
        handle.onpointerdown = function (event) {
          if(event.button!==0)return;
          event.preventDefault();
          draggingGraph=true;
          function move(e) {
            var point = svg.createSVGPoint();
            point.x = e.clientX;
            point.y = e.clientY;
            var x = point.matrixTransform(svg.getScreenCTM().inverse()).x - 10,
              amount = resolvedMode() === 'pairs'
                ? handle === handleIn ? 100 * (1 - x / 90) : 100 * (x - 110) / 90
                : (handle === handleIn ? 200 - x : x) / 2,
              value = Math.round(Math.max(0, Math.min(100, amount)));
            field.value = value;
            if (locked) (field === incoming ? outgoing : incoming).value = value;
            drawGraph();
          }
          function stop() {
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', stop);
            if (canApplyEase()) applyEase().catch(function () {});
            setTimeout(function(){draggingGraph=false;},0);
          }
          document.addEventListener('pointermove', move);
          document.addEventListener('pointerup', stop);
        };
        handle.onkeydown = function (event) {
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(event.key) !== -1) {
            event.preventDefault();
            var delta =
              (event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 1) *
              (event.shiftKey ? 10 : 1);
            field.value = Math.max(0, Math.min(100, Number(field.value) + delta));
            if (locked) (field === incoming ? outgoing : incoming).value = field.value;
            drawGraph();
          }
        };
      });
      incoming.oninput = function () {
        if (locked) outgoing.value = incoming.value;
        drawGraph();
      };
      outgoing.oninput = function () {
        if (locked) incoming.value = outgoing.value;
        drawGraph();
      };
      drawGraph();
      var applyEasingButton = button(ease, '이징 적용', 'toolAction', applyEase);
      var easingPresets = {};
      try {
        easingPresets = JSON.parse(
          localStorage.getItem('contentrium-preset.easing-presets.v1') || '{}',
        );
      } catch (ignore) {}
      var presetList = el('div', 'easing-presets');
      ease.appendChild(presetList);
      function saveEasing() {
        try {
          localStorage.setItem(
            'contentrium-preset.easing-presets.v1',
            JSON.stringify(easingPresets),
          );
        } catch (e) {
          report(e);
        }
      }
      function presetMode() {
        return resolvedMode();
      }
      function renderEasing() {
        var key = presetMode(),
          presets = easingPresets[key] || defaultEasingPresets(key);
        presetList.textContent = '';
        presets.forEach(function (p, index) {
          var row = el('div', 'easing-preset'),
            choose = el('button', '', p.name || p.values.join(' / '));
          choose.disabled = !canApplyEase();
          choose.onclick = function () {
            incoming.value = p.values[0];
            outgoing.value = p.values[1];
            locked = p.values[0] === p.values[1];
            lock.checked = locked;
            drawGraph();
            if (canApplyEase()) applyEase().catch(function () {});
          };
          row.appendChild(choose);
          [
            ['↑', -1],
            ['↓', 1],
            ['×', 0],
          ].forEach(function (pair) {
            var b = el('button', '', pair[0]);
            b.title = pair[1] === 0 ? '이징 프리셋 삭제' : '순서 이동';
            b.disabled =
              pair[1] !== 0 && (index + pair[1] < 0 || index + pair[1] >= presets.length);
            b.onclick = function () {
              var next = presets.slice();
              if (pair[1] === 0) next.splice(index, 1);
              else {
                var item = next.splice(index, 1)[0];
                next.splice(index + pair[1], 0, item);
              }
              easingPresets[key] = next;
              saveEasing();
              renderEasing();
            };
            row.appendChild(b);
          });
          presetList.appendChild(row);
        });
      }
      var presetActions = el('div', 'workspace-actions');
      ease.appendChild(presetActions);
      var save = el('button', '', '이징 프리셋 저장'),
        reset = el('button', '', '기본 목록 복원');
      save.onclick = function () {
        try {
          var key = presetMode(),
            preset = validEasingPreset({
              id: 'ease-' + Date.now(),
              mode: key,
              name: '',
              values: [Number(incoming.value), Number(outgoing.value)],
            }),
            list = easingPresets[key] || defaultEasingPresets(key);
          if (
            list.some(function (p) {
              return p.values.every(function (v, i) {
                return Math.round(v * 100) === Math.round(preset.values[i] * 100);
              });
            })
          )
            throw new Error('같은 영향도의 프리셋이 있습니다.');
          askName('이징 프리셋 이름', preset.values.join(' / '))
            .then(function (name) {
              if (!name) return;
              preset.name = name;
              easingPresets[key] = list.concat([preset]);
              saveEasing();
              renderEasing();
            })
            .catch(report);
        } catch (e) {
          report(e);
        }
      };
      reset.onclick = function () {
        delete easingPresets[presetMode()];
        saveEasing();
        renderEasing();
      };
      presetActions.appendChild(save);
      presetActions.appendChild(reset);
      function refreshMode() {
        modeNotice.textContent = mode.value !== 'auto' ? '' : !hostMode.available
          ? '선택 모드를 확인할 수 없습니다. 대상 모드를 직접 선택하세요.'
          : '자동: ' + (hostMode.mode === 'pairs' ? '키프레임 쌍' : '각 키프레임') + (hostMode.empty ? ' · 키프레임을 선택하세요.' : '');
        applyEasingButton.disabled = !canApplyEase();
        renderEasing();
        drawGraph();
      }
      mode.onchange = refreshMode;
      syncEasingMode = function (state) {
        var next = resolveEasingMode(state, lastEasingMode),
          changed = next.mode !== hostMode.mode || next.available !== hostMode.available || next.empty !== hostMode.empty;
        hostMode = next;
        if (next.available) lastEasingMode = next.mode;
        if (changed) refreshMode();
      };
      if (hostMode.available) lastEasingMode = hostMode.mode;
      refreshMode();
      var keys = toolSection('키프레임', '선택한 키프레임을 복사·변형·정렬합니다.', 'keyframes'),
        keyActions = el('div', 'workspace-actions');
      keys.appendChild(keyActions);
      [
        ['copy', '복사'],
        ['pasteValue', '값 붙여넣기'],
        ['pasteEase', '이징 붙여넣기'],
        ['mirror', '미러'],
        ['clone', '복제'],
        ['reverse', '반전'],
        ['alignFirst', '첫 키에 정렬'],
        ['alignLast', '마지막 키에 정렬'],
      ].forEach(function (pair) {
        button(keyActions, pair[1], 'toolAction', function () {
          return runTool('keyframes', pair[0], {});
        });
      });
      var frames = numberField(keys, '이동 프레임', 1, null, null, 1),
        order = selectField(keys, '순서', [
          ['ascending', '오름차순'],
          ['descending', '내림차순'],
          ['random', '무작위'],
        ]);
      button(keys, '순서대로 이동', 'toolAction', function () {
        return runTool('keyframes', 'shift', { frames: Number(frames.value), order: order.value });
      });
      var orderButton = el('button', '', '같은 순서 키 선택'), orderMenu = null, orderContext = null;
      orderButton.type = 'button';
      orderButton.disabled = !supported('toolAction');
      orderButton.setAttribute('aria-haspopup', 'menu');
      orderButton.setAttribute('aria-controls', 'keyframe-order-menu');
      orderButton.setAttribute('aria-expanded', 'false');
      keys.appendChild(orderButton);
      function closeOrderMenu(restoreFocus) {
        if (!orderMenu) return;
        orderMenu.remove(); orderMenu = null;
        orderButton.setAttribute('aria-expanded', 'false');
        document.removeEventListener('pointerdown', outsideOrderMenu, true);
        document.removeEventListener('scroll', dismissOrderMenu, true);
        window.removeEventListener('blur', dismissOrderMenu);
        window.removeEventListener('resize', positionOrderMenu);
        if (closeToolMenu === closeOrderMenu) closeToolMenu = null;
        if (restoreFocus && orderButton.isConnected) orderButton.focus();
      }
      function dismissOrderMenu() { closeOrderMenu(false); }
      function outsideOrderMenu(event) {
        if (!orderMenu.contains(event.target) && !orderButton.contains(event.target)) closeOrderMenu(false);
      }
      function positionOrderMenu() {
        var box = orderButton.getBoundingClientRect(), narrow = window.innerWidth < 340;
        orderMenu.dataset.placement = narrow ? 'bottom left' : 'right top';
        orderMenu.style.left = Math.max(2, Math.min(narrow ? box.left : box.right + 2, window.innerWidth - orderMenu.offsetWidth - 2)) + 'px';
        orderMenu.style.top = Math.max(2, Math.min(narrow ? box.bottom + 2 : box.top, window.innerHeight - orderMenu.offsetHeight - 2)) + 'px';
      }
      function orderTargetReady(context) {
        if (!supported('toolAction')) { report(new Error('After Effects 연결을 확인한 뒤 다시 시도하세요.')); return false; }
        if (!context || !context.compositionId || !Array.isArray(context.layerIds)) {
          report(new Error('컴포지션과 선택 상태를 읽은 뒤 다시 시도하세요.')); return false;
        }
        return true;
      }
      function openOrderMenu(last) {
        if (orderButton.disabled) return;
        if (orderMenu) { closeOrderMenu(true); return; }
        orderContext = scope.ContentriumCore.contextPayload(config.getState());
        if (!orderTargetReady(orderContext)) return;
        orderMenu = el('div', 'context-menu keyframe-order-menu');
        orderMenu.id = 'keyframe-order-menu';
        orderMenu.setAttribute('role', 'menu');
        orderMenu.setAttribute('aria-label', '같은 순서 키 선택');
        [['first', '첫 키 기준'], ['last', '마지막 키 기준']].forEach(function (choice) {
          var item = el('button', '', choice[1]); item.type = 'button'; item.setAttribute('role', 'menuitem'); item.tabIndex = -1;
          item.onclick = function () {
            var captured = orderContext;
            closeOrderMenu(true);
            if (!orderTargetReady(captured)) return;
            if (JSON.stringify(captured) !== JSON.stringify(scope.ContentriumCore.contextPayload(config.getState()))) {
              report(new Error('프로젝트 또는 선택 항목이 바뀌어 키 선택을 중단했습니다.')); return;
            }
            orderButton.disabled = true; orderButton.dataset.pending = 'true';
            Promise.resolve().then(function () { return runTool('keyframes', 'selectByOrder', {from:choice[0]}, captured); })
              .then(function () { orderButton.dataset.success = 'true'; setTimeout(function () { delete orderButton.dataset.success; }, 1200); })
              .catch(report).finally(function () {
                delete orderButton.dataset.pending; orderButton.disabled = !supported('toolAction');
                if (orderButton.isConnected && document.activeElement === document.body) orderButton.focus();
              });
          };
          orderMenu.appendChild(item);
        });
        orderMenu.onkeydown = function (event) {
          var items = Array.from(orderMenu.children), at = items.indexOf(document.activeElement);
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeOrderMenu(true); }
          else if (event.key === 'Tab') closeOrderMenu(true);
          else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].indexOf(event.key) !== -1) {
            event.preventDefault();
            items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
          }
        };
        orderMenu.onfocusout = function (event) {
          if (event.relatedTarget !== orderButton && !event.currentTarget.contains(event.relatedTarget)) closeOrderMenu(false);
        };
        document.body.appendChild(orderMenu); positionOrderMenu();
        orderButton.setAttribute('aria-expanded', 'true');
        orderMenu.children[last ? 1 : 0].focus();
        closeToolMenu = closeOrderMenu;
        document.addEventListener('pointerdown', outsideOrderMenu, true);
        document.addEventListener('scroll', dismissOrderMenu, true);
        window.addEventListener('blur', dismissOrderMenu);
        window.addEventListener('resize', positionOrderMenu);
      }
      orderButton.onclick = function () { openOrderMenu(false); };
      orderButton.onkeydown = function (event) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); openOrderMenu(event.key === 'ArrowUp'); }
      };
      var anchor = toolSection('앵커 포인트', '선택한 기준으로 앵커 포인트를 옮깁니다.', 'anchor'),
        anchorMode = selectField(anchor, '키프레임 처리', [
          ['modifyKeyframes', '기존 키프레임 변경'],
          ['insertKeyframes', '새 키프레임 삽입'],
        ]),
        grid = el('div', 'anchor-grid');
      anchor.appendChild(grid);
      [-1, 0, 1].forEach(function (y) {
        [-1, 0, 1].forEach(function (x) {
          button(
            grid,
            [
              ['↖', '↑', '↗'],
              ['←', '•', '→'],
              ['↙', '↓', '↘'],
            ][y + 1][x + 1],
            'toolAction',
            function () {
              return runTool('anchor', 'move', { x: x, y: y, mode: anchorMode.value });
            },
          );
        });
      });
      var shifter = toolSection('전환 이동', '전환·마커·레이어의 타이밍을 이동하고 정렬합니다.', 'shifter'),
        target = selectField(shifter, '이동 대상', [
          ['inTransitions', 'In 전환'],
          ['outTransitions', 'Out 전환'],
          ['inTransitionMarkers', 'In 마커'],
          ['outTransitionMarkers', 'Out 마커'],
        ]);
      function shift(seconds,expectedContext){
        return runTool('shifter','shift',{target:target.value,seconds:seconds},expectedContext).then(function(){amount.reset();});
      }
      var amount=shiftTimeField(shifter,'이동 시간',0,function(seconds,expectedContext){shift(seconds,expectedContext).catch(function(){});}),
        nudge = el('div', 'workspace-actions');
      shifter.appendChild(nudge);
      [-1, 1].forEach(function (sign) {
        var b=button(nudge,sign<0?'← 한 프레임':'한 프레임 →','toolAction',function(){});
        b.title='한 프레임 이동 · Shift: 열 프레임';
        b.onclick=function(event){try{shift(sign*(event.shiftKey?10:1)*shifterFrameInfo(config.getState()).frameDuration).catch(function(){});}catch(error){report(error);}};
      });
      button(nudge,'입력 시간만큼 이동','toolAction',function(){return shift(amount.read());});
      var staggerTarget = selectField(shifter, '엇갈리기 대상', [
          ['layers', '레이어'],
          ['inTransitions', 'In 전환'],
          ['outTransitions', 'Out 전환'],
        ]),
        staggerOrder = selectField(shifter, '순서', [
          ['ascending', '오름차순'],
          ['descending', '내림차순'],
          ['random', '무작위'],
          ['selection', '관찰한 선택 순서'],
        ]),
        staggerAmount=shiftTimeField(shifter,'엇갈리기 간격',1),
        orderNotice=el('p','workspace-help');
      shifter.appendChild(orderNotice);
      var resetOrder=el('button','','순서 기록 다시 시작');resetOrder.type='button';
      resetOrder.onclick=function(){selectionTracker.reset();selectionTracker.update(config.getState()||{},Date.now());syncShifterState(config.getState()||{});};
      shifter.appendChild(resetOrder);
      shifter.appendChild(el('p','workspace-help','이 패널을 여는 동안 확인한 선택 변화만 기록합니다. 선택을 비운 뒤 한 레이어씩 추가하세요. 한꺼번에 선택하거나 연결이 끊기면 기록을 다시 시작해야 합니다.'));
      shifter.appendChild(el('p','workspace-help','정수는 프레임 수이며 타임코드는 상대 이동 시간입니다. Enter/버튼으로 적용하고, 시간 드래그는 놓을 때 한 번 적용합니다.'));
      var staggerButton=button(shifter, '엇갈리기', 'toolAction', function () {
        var params={
          target: staggerTarget.value,
          seconds: staggerAmount.read(),
          order: staggerOrder.value,
        };
        if(params.order==='selection')Object.assign(params,selectionOrderParams(selectionTracker.snapshot(),config.getState()));
        return runTool('shifter', 'stagger', params);
      });
      var timeContext=null;
      syncShifterState=function(state){
        var tracked=selectionTracker.snapshot(),validTime=true;
        try{shifterFrameInfo(state);}catch(ignore){validTime=false;}
        amount.input.disabled=staggerAmount.input.disabled=!supported('toolAction')||!validTime;
        staggerButton.disabled=!supported('toolAction')||!validTime||(staggerOrder.value==='selection'&&(!tracked.known||!tracked.ids.length));
        var clock=validTime?JSON.stringify([state.frameDuration,!!(state.dropFrame||state.dropframe)]):null;
        if(clock&&clock!==timeContext){
          [amount,staggerAmount].forEach(function(field){if(document.activeElement!==field.input)try{field.format();}catch(ignoreFormat){}});
        }
        timeContext=clock;
        orderNotice.textContent=tracked.known&&tracked.ids.length?'관찰한 선택 순서: '+tracked.ids.length+'개 레이어':tracked.known?'선택을 비운 상태입니다. 한 레이어씩 추가하세요.':'순서를 확인할 수 없습니다. 선택을 비운 뒤 한 레이어씩 추가하세요.';
      };
      staggerOrder.onchange=function(){syncShifterState(config.getState()||{});};
      syncShifterState(config.getState()||{});
      var align = selectField(shifter, '재생 헤드에 정렬', [
        ['inTransitionStarts', 'In 시작'],
        ['inTransitionEnds', 'In 종료'],
        ['inTransitionMarkers', 'In 마커'],
        ['outTransitionStarts', 'Out 시작'],
        ['outTransitionEnds', 'Out 종료'],
        ['outTransitionMarkers', 'Out 마커'],
      ]);
      button(shifter, '정렬', 'toolAction', function () {
        return runTool('shifter', 'align', { target: align.value });
      });
      if (!supported('toolAction'))
        root.prepend(
          el(
            'p',
            'editor-warning',
            '현재 연결에서는 도구를 사용할 수 없습니다. After Effects 패널에서 연결 상태를 확인하세요.',
          ),
        );
    }
    function init() {
      renderSettings();
      renderLibrary();
      renderTools();
      setToolView(toolView);
      return Promise.all([loadSettings(), loadLibrary()]);
    }
    return {
      init: init,
      loadSettings: loadSettings,
      loadLibrary: loadLibrary,
      getLibrary: function () { return library; },
      setLibraryVisible:function(value){value=!!value;if(libraryVisible===value)return;libraryVisible=value;renderLibrary();},
      getItemOptions:function(id){return Object.assign({},itemOptions.get(id)||{});},
      setSequenceRate:function(id,value){var state=itemOptions.get(id)||{};state.sequenceFPS=String(value);itemOptions.set(id,state);},
      importLibraryItem: function (id, options, interaction) {
        return Promise.resolve().then(function () { var item=libraryItemById(id,false,options&&options.insertAsTexture===true);return interaction&&interaction.userInitiated===true?importUserItem(item,options||{}):importItem(item,options||{}); });
      },
      replaceLibraryItem: function (id, options) {
        return Promise.resolve().then(function () { return importItem(libraryItemById(id, true, options&&options.insertAsTexture===true), options || {}, null, true); });
      },
      revealLibraryItem: function (id) {
        var at=((library&&(library.items||library.entries))||[]).findIndex(function(value){return value.id===id;});
        if(at<0)return false;
        var page=Math.floor(at/50);if(!libraryVisible||libraryPage!==page){libraryVisible=true;libraryPage=page;renderLibrary();}
        var item = Array.from(config.libraryRoot.querySelectorAll('.library-item')).find(function (row) { return row.dataset.itemId === id; });
        if (!item) return false;
        item.tabIndex = 0; item.focus(); item.scrollIntoView({block:'nearest'}); return true;
      },
      renderTools: renderTools,
      setToolView:setToolView,
      updateToolState: function (state) {
        selectionTracker.update(state,Date.now());
        syncTextureButtons(state);
        if (syncEasingMode) syncEasingMode(state);
        if (syncShifterState) syncShifterState(state);
      },
      getSettings: function () {
        return settings;
      },
      setActive: function (active) {
        Object.keys(audioPlayers).forEach(function (id) {
          audioPlayers[id].setActive(active);
        });
      },
      getSelectedAudioPlayer: function (itemId) {
        return audioPlayers[itemId] || null;
      },
    };
  }
  var api = {
    create: create,
    askLibraryFolderPath: askLibraryFolderPath,
    addLibraryFolderDialog: addLibraryFolderDialog,
    toolRequest: toolRequest,
    settingsDefinition: settingsDefinition,
    defaultEasingPresets: defaultEasingPresets,
    validEasingPreset: validEasingPreset,
    easingPoint: easingPoint,
    resolveEasingMode: resolveEasingMode,
    tutorialVisible: tutorialVisible,
    createSelectionOrderTracker:createSelectionOrderTracker,
    selectionOrderParams:selectionOrderParams,
    parseShifterTime:parseShifterTime,
    formatShifterTime:formatShifterTime,
    sequenceOptions: sequenceOptions,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  scope.ContentriumWorkspace = api;
})(typeof window === 'undefined' ? globalThis : window);
