(function (scope) {
  'use strict';
  function copy(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function selectedBinding(result, layerId) {
    var row = result && result.selectedBinding;
    if (row && row.layerId !== layerId) return null;
    return row || ((result && result.media) || []).find(function (item) { return item.layerId === layerId; });
  }
  function canReplace(result, layerId) {
    if (!result || result.canReplace !== true || result.errorCode) return false;
    var items = result.projectSelection, binding = result.bindingContext,
      row = selectedBinding(result, layerId);
    if (!Array.isArray(items) || items.length !== 1 || !binding || !row || row.canReplace === false) return false;
    return binding.expectedRootLayerId === result.rootLayerId &&
      Number.isFinite(binding.expectedSourceItemId) &&
      binding.expectedMediaItemId === row.itemId && binding.expectedItemId === items[0].id &&
      items[0].id !== row.itemId && !(result.replacement && result.replacement.noop);
  }
  function identity(result, layerId) {
    var binding = result && result.bindingContext;
    if (!binding || !selectedBinding(result, layerId)) return null;
    return JSON.stringify([result.instanceId, binding.expectedRootLayerId,
      binding.expectedSourceItemId, layerId, binding.expectedMediaItemId]);
  }
  function message(error) {
    return (error.code ? '[' + error.code + '] ' : '') + (error.message || String(error));
  }
  // The outer selection stays fixed for the lifetime of this dialog. Only the
  // Project panel's proposed replacement is refreshed by context requests.
  function createSession(config) {
    var context = copy(config.context), rootId = config.root.rootLayerId,
      layerId = config.layerId, open = true, generation = 0, baseline = null,
      loading = false, busy = false, again = false, rebindNext = false,
      response = null, stale = false, error = '';
    function state() {
      return {open:open,loading:loading,busy:busy,layerId:layerId,response:copy(response),
        stale:stale,error:error,canReplace:open && !loading && !busy && !stale && canReplace(response,layerId)};
    }
    function emit() { if (config.change) config.change(state()); }
    function payload(action) {
      var value = {action:action,rootLayerId:rootId,context:copy(context)};
      if (action !== 'revealSource') value.layerId = layerId;
      if (action === 'replaceSelected') value.bindingContext = copy(response.bindingContext);
      return value;
    }
    function refresh(rebind) {
      if (!open || busy) return Promise.resolve();
      if (loading) {
        if (rebind) { again = true; rebindNext = true; }
        return Promise.resolve();
      }
      var token = generation, accepted = rebind === true, request = payload('context');
      loading = true;
      if (accepted) error = '';
      emit();
      return Promise.resolve().then(function () { return config.call('mediaAction',request); })
        .then(function (result) {
          if (!open || token !== generation) return;
          if (!result || result.rootLayerId !== rootId) throw new Error('미디어 대상 응답이 일치하지 않습니다.');
          response = copy(result);
          var key = identity(result, layerId);
          if (accepted || baseline == null) { baseline = key; stale = false; }
          else if (key !== baseline) stale = true;
        }).catch(function (failure) {
          if (open && token === generation) { error = message(failure); response = null; }
        }).then(function () {
          loading = false;
          if (open) emit();
          if (open && again) { var accept = rebindNext; again = rebindNext = false; return refresh(accept); }
        });
    }
    function replace() {
      if (!open) return Promise.reject(new Error('미디어 창이 닫혔습니다.'));
      if (stale) return Promise.reject(new Error('미디어 소스가 변경되었습니다. 새로고침 후 다시 확인하세요.'));
      if (!state().canReplace) return Promise.reject(new Error('Project 패널에서 호환되는 미디어 한 개를 선택하세요.'));
      var request = payload('replaceSelected');
      busy = true; error = ''; emit();
      return Promise.resolve().then(function () { return config.call('mediaAction',request); })
        .then(function (result) {
          if (!result || typeof result.replaced !== 'boolean') throw new Error('미디어 교체 결과를 확인할 수 없습니다.');
          return result;
        }).catch(function (failure) {
          if (!open) throw failure;
          busy = false; error = message(failure); emit();
          return refresh().then(function () { throw failure; });
        }).finally(function () { busy = false; if (open) emit(); });
    }
    function reveal() {
      if (!open) return Promise.reject(new Error('미디어 창이 닫혔습니다.'));
      return config.call('mediaAction',payload('revealSource'));
    }
    return {refresh:refresh,replace:replace,reveal:reveal,state:state,
      select:function (id) {
        if (!open || busy || layerId === id) return;
        layerId = id; generation++; baseline = null; response = null; stale = false; error = '';
        if (loading) { again = true; rebindNext = true; emit(); }
        else return refresh(true);
      },
      close:function () { open = false; generation++; response = null; emit(); }};
  }
  function el(tag, text, className) {
    var node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function create(config) {
    var modal = null;
    function report(error) { config.status(message(error),'error'); }
    function openDialog(root, outer) {
      if (modal) return;
      var dialog = el('dialog',null,'composition-dialog'), heading = el('h2','미디어 교체'),
        rootName = el('p',root.rootLayerName || '선택한 프리컴포지션'),
        label = el('label','교체할 미디어'), select = el('select'),
        current = el('p'), candidate = el('p'), note = el('p'),
        instructions = el('p','After Effects의 Project 패널에서 새 미디어 한 개를 선택하세요.'),
        actions = el('div',null,'dialog-actions'), refresh = el('button','새로고침'),
        replace = el('button','교체'), close = el('button','닫기'), timer,
        optionSignature = null, closed = false, session;
      dialog.setAttribute('aria-label','미디어 교체');
      label.appendChild(select); select.setAttribute('aria-label','교체할 미디어');
      current.setAttribute('data-media-current',''); candidate.setAttribute('data-media-candidate','');
      note.setAttribute('role','status'); note.setAttribute('aria-live','polite');
      [heading,rootName,instructions,label,current,candidate,note,actions].forEach(function (node) { dialog.appendChild(node); });
      [refresh,replace,close].forEach(function (button) { button.type='button'; actions.appendChild(button); });
      var initialRows = root.media || [];
      function rows(items, selected) {
        var signature = JSON.stringify(items.map(function (item) { return [item.layerId,item.name,item.itemId]; }));
        if (signature !== optionSignature) {
          select.textContent='';
          items.forEach(function (item) {
            var option = el('option',item.name || '미디어 ' + item.layerIndex);
            option.value=String(item.layerId); select.appendChild(option);
          });
          optionSignature=signature;
        }
        select.value=String(selected);
      }
      function draw(state) {
        if (closed) return;
        var result=state.response, items=result ? result.media || [] : initialRows,
          binding=result && selectedBinding(result,state.layerId), project=result && result.projectSelection || [];
        rows(items,state.layerId);
        select.disabled=state.busy;
        var filename=binding && (binding.itemName || binding.sourceName || (binding.path && binding.path.split(/[\\/]/).pop()) || binding.name);
        current.textContent='현재: ' + (filename || (state.loading ? '확인 중…' : '확인할 수 없음'));
        candidate.textContent='새 미디어: ' + (project.length ? project.map(function (item) { return item.name; }).join(', ') : '선택 없음');
        replace.disabled=!state.canReplace;
        refresh.disabled=state.busy || state.loading;
        close.disabled=state.busy;
        note.textContent=state.error || (state.stale ? '미디어 소스가 변경되었습니다. 새로고침 후 다시 확인하세요.' :
          state.busy ? '미디어를 교체하는 중…' : state.loading ? '선택 상태 확인 중…' :
          result && result.errorCode ? '['+result.errorCode+'] '+(result.reason || 'Project 패널의 선택과 미디어 호환성을 확인하세요.') :
          result && !state.canReplace ? '교체할 수 있는 다른 미디어 한 개를 선택하세요.' : '선택한 미디어로 교체할 수 있습니다.');
      }
      session=createSession({root:root,context:outer,layerId:initialRows[0] && initialRows[0].layerId,call:config.call,change:draw});
      modal={dialog:dialog,session:session};
      select.onchange=function () { session.select(Number(select.value)); };
      refresh.onclick=function () { session.refresh(true); };
      replace.onclick=function () {
        session.replace().then(function (result) {
          config.status(result.replaced ? '미디어를 교체했습니다.' : '같은 미디어입니다. 변경하지 않았습니다.');
          dialog.close();
        }).catch(report);
      };
      close.onclick=function () { dialog.close(); };
      dialog.addEventListener('cancel',function (event) { if (session.state().busy) event.preventDefault(); });
      dialog.addEventListener('close',function () {
        if (closed) return;
        closed=true; clearInterval(timer); session.close(); modal=null; dialog.remove(); config.refresh();
      });
      document.body.appendChild(dialog); draw(session.state()); dialog.showModal();
      session.refresh(); timer=setInterval(function () { session.refresh(); },1000);
    }
    function mount(parent, state) {
      (state.mediaRoots || []).forEach(function (root) {
        var box=el('div',null,'control-group'), title=el('strong',root.rootLayerName || '프리컴포지션'),
          actions=el('div',null,'control-actions'), source=el('button','소스 열기','small-button'),
          replace=el('button','미디어 교체','small-button'), enabled=config.supports('mediaAction'),
          outer=copy(scope.ContentriumCore.contextPayload(state));
        source.type=replace.type='button'; source.disabled=!enabled;
        replace.disabled=!enabled || !(root.media || []).length;
        if (!enabled) source.title=replace.title='현재 연결에서 사용할 수 없습니다.';
        else if (replace.disabled) replace.title='교체할 파일 미디어가 없습니다.';
        source.onclick=function () {
          config.call('mediaAction',{action:'revealSource',rootLayerId:root.rootLayerId,context:copy(outer)})
            .then(function () { config.status('프리컴포지션 소스를 열었습니다.'); }).catch(report);
        };
        replace.onclick=function () { openDialog(root,outer); };
        actions.appendChild(source); actions.appendChild(replace); box.appendChild(title); box.appendChild(actions); parent.appendChild(box);
      });
    }
    return {mount:mount,isOpen:function () { return !!modal; }};
  }
  var api={create:create,createSession:createSession,canReplace:canReplace};
  if (typeof module!=='undefined' && module.exports) module.exports=api;
  scope.ContentriumMedia=api;
})(typeof window==='undefined'?globalThis:window);
