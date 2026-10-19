(function (scope) {
  'use strict';
  function available(group) {
    if (!Object.prototype.hasOwnProperty.call(group, 'actions')) return true;
    return Array.isArray(group.actions) && group.actions.some(function (action) {
      return typeof action === 'string' ? action === 'getAvailablePresets' :
        action && (action.id || action.action) === 'getAvailablePresets' && action.enabled !== false;
    });
  }
  function request(action, group, args, context) {
    if (!group || typeof group.key !== 'string' || !group.key)
      throw new Error('속성 그룹이 변경되었습니다.');
    if (!available(group)) throw new Error('이 그룹은 속성 프리셋을 지원하지 않습니다.');
    if (['getAvailablePresets', 'saveAs', 'apply', 'remove'].indexOf(action) === -1)
      throw new Error('지원하지 않는 속성 프리셋 작업입니다.');
    var payload = { action: action, groupKey: group.key },
      name = args && args.name;
    if (action === 'saveAs') {
      if (group.canSave === false)
        throw new Error(group.reason || '서로 다른 값이 있는 그룹은 저장할 수 없습니다.');
      name = String(name || '').trim();
      if (!name || name.length > 120) throw new Error('프리셋 이름을 1~120자로 입력하세요.');
      payload.name = name;
    }
    if (action === 'apply' || action === 'remove') {
      if (!args || typeof args.presetId !== 'string' || !args.presetId)
        throw new Error('프리셋을 선택하세요.');
      payload.presetId = args.presetId;
    }
    payload.context = context || null;
    return payload;
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  var globalEventsInstalled = false;
  function mount(parent, group, config) {
    if (!group || !group.key || !available(group) || !config.supports('propertySetAction')) return null;
    var root = el('span', 'property-set-widget'),
      toggle = el('button', 'property-set-toggle', 'Presets ▾'),
      menu = el('span', 'property-set-menu hidden'),
      matching = null,
      loading = false;
    toggle.type = 'button';
    toggle.setAttribute('aria-label', group.name + ' Presets');
    toggle.setAttribute('aria-expanded', 'false');
    menu.setAttribute('role', 'menu');
    root.appendChild(toggle);
    root.appendChild(menu);
    parent.appendChild(root);
    function close() {
      menu.classList.add('hidden');
      toggle.setAttribute('aria-expanded', 'false');
    }
    function invoke(action, args, captured) {
      var payload;
      try {
        payload = request(action, group, args, captured ? captured.context : config.context());
        if(captured && captured.expectedRevision !== undefined)payload.expectedRevision=captured.expectedRevision;
      } catch (error) {
        config.status(error.message, 'error');
        return Promise.reject(error);
      }
      return config.call('propertySetAction', payload).catch(function (error) {
        config.status(error.message, 'error');
        throw error;
      });
    }
    function mutate(action, args, captured) {
      try {
        if (captured === undefined && typeof config.capture === 'function') {
          captured = JSON.parse(JSON.stringify(config.capture()));
          if (!captured || typeof captured !== 'object' || Array.isArray(captured))
            throw new Error('현재 프로젝트 상태를 확인한 후 다시 시도하세요.');
        }
      } catch (error) {
        config.status(error.message, 'error');
        return Promise.reject(error);
      }
      return invoke(action, args, captured).then(function (result) {
        close();
        config.status(
          action === 'saveAs'
            ? '속성 프리셋을 저장했습니다.'
            : action === 'remove'
              ? '속성 프리셋을 삭제했습니다.'
              : '속성 프리셋을 적용했습니다.',
        );
        config.refresh();
        return result;
      });
    }
    function saveAs() {
      var captured=config.capture?config.capture():{context:config.context()};
      captured=JSON.parse(JSON.stringify(captured));
      var dialog = el('dialog'),
        form = el('form'),
        heading = el('h2', '', '속성 프리셋 저장'),
        label = el('label', '', '이름'),
        input = el('input'),
        actions = el('div', 'dialog-actions'),
        cancel = el('button', '', '취소'),
        save = el('button', '', '저장');
      input.required = true;
      input.maxLength = 120;
      label.appendChild(input);
      cancel.type = 'button';
      save.type = 'submit';
      cancel.onclick = function () {
        dialog.close();
      };
      form.onsubmit = function (event) {
        event.preventDefault();
        save.disabled = true;
        mutate('saveAs', { name: input.value }, captured)
          .then(function () {
            dialog.close();
          })
          .catch(function () {
            save.disabled = false;
          });
      };
      actions.appendChild(cancel);
      actions.appendChild(save);
      form.appendChild(heading);
      form.appendChild(label);
      form.appendChild(actions);
      dialog.appendChild(form);
      dialog.addEventListener('close', function () {
        dialog.remove();
      });
      document.body.appendChild(dialog);
      dialog.showModal();
      input.focus();
    }
    function button(label, handler, enabled, reason) {
      var b = el('button', '', label);
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.disabled = enabled === false;
      b.title = reason || '';
      b.onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        Promise.resolve()
          .then(handler)
          .catch(function () {});
      };
      menu.appendChild(b);
      return b;
    }
    function open() {
      if (loading) return;
      document.querySelectorAll('.property-set-menu').forEach(function (node) {
        if (node !== menu) node.classList.add('hidden');
      });
      menu.classList.remove('hidden');
      toggle.setAttribute('aria-expanded', 'true');
      menu.textContent = '불러오는 중…';
      loading = true;
      invoke('getAvailablePresets', {})
        .then(function (result) {
          if (!root.isConnected) return;
          menu.textContent = '';
          matching = result.matchingPreset || null;
          (result.presets || []).forEach(function (preset) {
            var b = button((matching === preset.id ? '✓ ' : '') + preset.name, function () {
              return mutate('apply', { presetId: preset.id });
            });
            b.dataset.presetId = preset.id;
          });
          if (!(result.presets || []).length)
            menu.appendChild(el('span', 'property-set-empty', '저장된 프리셋 없음'));
          menu.appendChild(el('hr'));
          if (matching)
            button('현재 프리셋 삭제', function () {
              return mutate('remove', { presetId: matching });
            });
          else button('Save As…', saveAs, group.canSave !== false, group.reason);
        })
        .catch(function () {
          menu.textContent = '속성 프리셋을 읽지 못했습니다.';
        })
        .finally(function () {
          loading = false;
        });
    }
    toggle.onclick = function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (menu.classList.contains('hidden')) open();
      else close();
    };
    menu.onclick = function (event) {
      event.stopPropagation();
    };
    menu.onkeydown = function (event) {
      var buttons = Array.from(menu.querySelectorAll('button:not(:disabled)')),
        index = buttons.indexOf(document.activeElement),
        target;
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        toggle.focus();
      } else if (
        ['ArrowDown', 'ArrowUp', 'Home', 'End'].indexOf(event.key) !== -1 &&
        buttons.length
      ) {
        event.preventDefault();
        target =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[target].focus();
      }
    };
    if (!globalEventsInstalled) {
      globalEventsInstalled = true;
      document.addEventListener('pointerdown', function (event) {
        if (!event.target.closest('.property-set-widget'))
          document.querySelectorAll('.property-set-menu').forEach(function (node) {
            node.classList.add('hidden');
            var toggle = node.parentNode.querySelector('.property-set-toggle');
            if (toggle) toggle.setAttribute('aria-expanded', 'false');
          });
      });
    }
    return { close: close };
  }
  var api = { request: request, mount: mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  scope.ContentriumPropertySets = api;
})(typeof window === 'undefined' ? globalThis : window);
