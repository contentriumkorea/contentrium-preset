(function (scope) {
  'use strict';
  function canonical(path, value) {
    var full = path.resolve(value);
    return path.sep === '\\' ? full.toLowerCase() : full;
  }
  function validateTarget(fs, path, target, root) {
    var expected = path.resolve(root),
      file = path.resolve(target);
    if (canonical(path, path.dirname(file)) !== canonical(path, expected))
      throw new Error('오디오 내보내기 폴더가 올바르지 않습니다.');
    if (!/^[a-z0-9_-]+\.wav$/i.test(path.basename(file)))
      throw new Error('오디오 내보내기에는 단일 WAV 파일만 사용할 수 있습니다.');
    if (!fs.existsSync(expected) || !fs.statSync(expected).isDirectory())
      throw new Error('오디오 내보내기 폴더를 준비하지 못했습니다.');
    if (canonical(path, fs.realpathSync(expected)) !== canonical(path, expected))
      throw new Error('오디오 내보내기 폴더의 실제 위치가 다릅니다.');
    if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink())
      throw new Error('WAV 내보내기 대상으로 링크 파일을 사용할 수 없습니다.');
    return file;
  }
  function atomicWriteAudio(fs, path, target, root, bytes) {
    var file = validateTarget(fs, path, target, root),
      view = new DataView(bytes),
      tag = function (at) {
        return String.fromCharCode(
          view.getUint8(at),
          view.getUint8(at + 1),
          view.getUint8(at + 2),
          view.getUint8(at + 3),
        );
      };
    if (
      bytes.byteLength < 44 ||
      tag(0) !== 'RIFF' ||
      tag(8) !== 'WAVE' ||
      tag(36) !== 'data' ||
      view.getUint32(40, true) + 44 !== bytes.byteLength
    )
      throw new Error('유효한 PCM WAV 데이터를 만들지 못했습니다.');
    if (fs.existsSync(file)) return { path: file, alreadyExists: true };
    var temp = file + '.tmp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2),
      handle = null;
    try {
      handle = fs.openSync(temp, 'wx');
      fs.writeFileSync(handle, new Uint8Array(bytes));
      fs.fsyncSync(handle);
      fs.closeSync(handle);
      handle = null;
      fs.renameSync(temp, file);
      return { path: file, alreadyExists: false };
    } catch (error) {
      if (handle != null)
        try {
          fs.closeSync(handle);
        } catch (ignore) {}
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
      throw error;
    }
  }
  function prepare(config) {
    return Promise.resolve().then(function () {
      var cep = config.cep || scope.__adobe_cep__,
        req =
          config.nodeRequire ||
          (typeof require === 'function' ? require : scope.cep_node && scope.cep_node.require);
      if (!cep || typeof cep.getSystemPath !== 'function' || !req)
        throw new Error(
          '오디오 변형 내보내기는 Node가 연결된 After Effects 패널에서 사용할 수 있습니다.',
        );
      if (!config.player || typeof config.player.renderWav !== 'function')
        throw new Error('먼저 이 오디오의 파형 미리듣기를 불러오세요.');
      var fs = req('fs'),
        path = req('path'),
        userData = cep.getSystemPath('userData');
      if (/^file:/i.test(userData)) userData = req('url').fileURLToPath(userData);
      var root = path.join(userData, 'Contentrium', 'Preset', 'ProcessedAudio'),
        settings = Object.assign({}, config.options || {});
      return config
        .call('prepareAudioImport', {
          id: config.itemId,
          options: { pitchShift: settings.pitchShift || 0, reverse: !!settings.reverse },
          context: config.context || null,
        })
        .then(function (result) {
          if (!result || typeof result.path !== 'string')
            throw new Error('오디오 내보내기 위치를 준비하지 못했습니다.');
          var target = validateTarget(fs, path, result.path, root);
          if (
            (result.sourceId != null && result.sourceId !== config.itemId) ||
            (result.pitchShift != null && result.pitchShift !== (settings.pitchShift || 0)) ||
            (result.reverse != null && result.reverse !== !!settings.reverse)
          )
            throw new Error('준비된 오디오 변형 정보가 선택과 다릅니다.');
          function output() {
            return Object.assign({}, settings, {
              pitchShift: settings.pitchShift || 0,
              reverse: !!settings.reverse,
              renderedAudioPath: target,
            });
          }
          if (result.alreadyExists) {
            if (!fs.existsSync(target)) throw new Error('저장된 변형 오디오를 찾지 못했습니다.');
            return output();
          }
          return config.player.renderWav().then(function (rendered) {
            if (
              rendered.pitchShift !== (settings.pitchShift || 0) ||
              rendered.reverse !== !!settings.reverse
            )
              throw new Error('내보내는 동안 오디오 설정이 변경되었습니다. 다시 시도하세요.');
            atomicWriteAudio(fs, path, target, root, rendered.bytes);
            return output();
          });
        });
    });
  }
  var api = {
    atomicWriteAudio: atomicWriteAudio,
    validateTarget: validateTarget,
    prepare: prepare,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  scope.ContentriumAudioExport = api;
})(typeof window === 'undefined' ? globalThis : window);
