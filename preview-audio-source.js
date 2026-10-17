(function (scope) {
  'use strict';
  function failure(code, message) { var error = new Error(message); error.code = code; return error; }
  function validId(id) { return typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/i.test(id) && ['__proto__', 'prototype', 'constructor'].indexOf(id) === -1; }
  function validHash(hash) { return typeof hash === 'string' && /^[a-f0-9]{64}$/i.test(hash); }
  function record(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
  function exactKeys(value, keys) { return record(value) && Object.keys(value).every(function (key) { return keys.indexOf(key) !== -1; }); }
  function manifestExample(variantId, videoSha256) {
    if (!validId(variantId) || !validHash(videoSha256)) throw failure('PREVIEW_AUDIO_SCHEMA', 'A variant ID and rendered-video SHA256 are required');
    var previews = {}; previews[variantId] = { file: variantId + '.wav', videoSha256: videoSha256.toLowerCase() };
    return { schemaVersion: 1, previews: previews };
  }
  // A supplied preparer owns explicit source recipes; legacy prepared WAVs remain read-only.
  function createResolver(options) {
    options = options || {};
    if (typeof options.audioRoot !== 'string' || !options.audioRoot || typeof options.extensionPath !== 'string' || !options.extensionPath)
      throw failure('PREVIEW_AUDIO_PATH', 'UserAudio and extension directories are required');
    var req = options.nodeRequire || (typeof require === 'function' ? require : scope.cep_node && scope.cep_node.require);
    if (typeof req !== 'function') return async function () {
      return { status: 'unavailable', reason: 'node-unavailable', missing: [], message: 'Local preview sound requires CEP Node access' };
    };
    var fs = req('fs'), path = req('path'), crypto = req('crypto'), url = req('url'), BufferType = req('buffer').Buffer;
    // CEP's Node realm can leave fs.promises pending while ordinary callbacks run.
    // Construct the Promise here in the browser realm; keep every disk read asynchronous.
    function fileCall(method, args) {
      return new Promise(function (resolve, reject) {
        var callback = function (error, value) { if (error) reject(error); else resolve(value); };
        fs[method].apply(fs, args.concat(callback));
      });
    }
    var extensionPath;
    try {
      if (/^file:/i.test(options.extensionPath)) {
        var extensionUrl = new url.URL(options.extensionPath);
        if (extensionUrl.hostname && extensionUrl.hostname !== 'localhost') throw new Error('Remote extension roots are not supported');
        extensionPath = url.fileURLToPath(extensionUrl);
      } else extensionPath = decodeURIComponent(options.extensionPath);
    } catch (error) { throw failure('PREVIEW_AUDIO_PATH', 'Invalid CEP extension filesystem path'); }
    if (!path.isAbsolute(options.audioRoot) || !path.isAbsolute(extensionPath))
      throw failure('PREVIEW_AUDIO_PATH', 'Preview sound directories must be absolute filesystem paths');
    var audioRoot = path.resolve(options.audioRoot), extensionRoot = path.resolve(extensionPath), previews = path.join(audioRoot, 'Previews');
    function checkAbort(signal) { if (signal && signal.aborted) { var error = failure('ABORT_ERR', 'Preview sound resolution was cancelled'); error.name = 'AbortError'; throw error; } }
    function inside(base, target) { var relative = path.relative(base, target); if (relative === '..' || relative.indexOf('..' + path.sep) === 0 || path.isAbsolute(relative)) throw failure('PREVIEW_AUDIO_PATH', 'Preview sound path escapes its configured directory'); }
    function missing(reason, file, message, extra) { return Object.assign({ status: 'missing', reason: reason, missing: [file], message: message }, extra || {}); }
    function schema(value) {
      if (!exactKeys(value, ['schemaVersion', 'previews']) || value.schemaVersion !== 1 || !record(value.previews)) throw failure('PREVIEW_AUDIO_SCHEMA', 'Invalid Previews/library.json schema');
      Object.keys(value.previews).forEach(function (id) {
        var item = value.previews[id];
        if (!validId(id) || !exactKeys(item, ['file', 'videoSha256']) || item.file !== id + '.wav' || !validHash(item.videoSha256))
          throw failure('PREVIEW_AUDIO_SCHEMA', 'Each preview requires its exact variant.wav basename and a rendered-video SHA256');
      });
      return value;
    }
    return async function resolvePreviewSound(request) {
      request = request || {}; var variant = request.variant || {}, signal = request.signal;
      checkAbort(signal);
      if (options.preparer) {
        var prepared = await options.preparer.resolve(request); checkAbort(signal);
        if (!prepared || prepared.reason !== 'recipe-missing') return prepared;
      }
      if (!validId(variant.id)) throw failure('PREVIEW_AUDIO_SCHEMA', 'Invalid preview variant ID');
      var relativeVideo = variant.renderedPreview;
      if (typeof relativeVideo !== 'string' || !/\.(webm|mp4)$/i.test(relativeVideo) || /^(?:[a-z][a-z0-9+.-]*:|[\\/])/i.test(relativeVideo))
        throw failure('PREVIEW_AUDIO_PATH', 'A local rendered preview video is required');
      var parts = relativeVideo.replace(/\\/g, '/').split('/');
      if (parts.some(function (part) { return !part || part === '.' || part === '..'; })) throw failure('PREVIEW_AUDIO_PATH', 'Invalid rendered preview path');
      var realAudioRoot, realPreviews, realManifest;
      try {
        realAudioRoot = await fileCall('realpath', [audioRoot]); checkAbort(signal);
        realPreviews = await fileCall('realpath', [previews]); inside(realAudioRoot, realPreviews); checkAbort(signal);
        realManifest = await fileCall('realpath', [path.join(previews, 'library.json')]); inside(realPreviews, realManifest); checkAbort(signal);
      } catch (error) {
        if (error.code === 'ENOENT') return missing('manifest-missing', 'Previews/library.json', 'No personal prepared preview sound manifest is registered');
        throw error;
      }
      var stat = await fileCall('stat', [realManifest]); checkAbort(signal);
      if (!stat.isFile() || stat.size > 262144) throw failure('PREVIEW_AUDIO_SCHEMA', 'Preview sound manifest is not a bounded JSON file');
      var serialized = await fileCall('readFile', [realManifest, 'utf8']); checkAbort(signal);
      var manifest;
      try { manifest = schema(JSON.parse(serialized.replace(/^\uFEFF/, ''))); }
      catch (error) { if (error.code === 'PREVIEW_AUDIO_SCHEMA') throw error; throw failure('PREVIEW_AUDIO_SCHEMA', 'Preview sound manifest could not be parsed'); }
      var clipName = variant.id + '.wav', registration = own(manifest.previews, variant.id) ? manifest.previews[variant.id] : null;
      if (!registration) return missing('clip-not-registered', 'Previews/' + clipName, 'No prepared sound clip is registered for this variant');
      var realExtension = await fileCall('realpath', [extensionRoot]); checkAbort(signal);
      var video = path.resolve.apply(path, [extensionRoot].concat(parts)); inside(extensionRoot, video);
      try { video = await fileCall('realpath', [video]); inside(realExtension, video); checkAbort(signal); }
      catch (error) { if (error.code === 'ENOENT') return missing('video-missing', relativeVideo, 'The rendered preview video is missing'); throw error; }
      stat = await fileCall('stat', [video]); checkAbort(signal);
      if (!stat.isFile() || stat.size > 134217728) throw failure('PREVIEW_AUDIO_PATH', 'Rendered preview video exceeds the supported local file limit');
      var bytes = await fileCall('readFile', [video]); checkAbort(signal);
      var digest = crypto.createHash('sha256').update(bytes).digest('hex');
      if (digest !== registration.videoSha256.toLowerCase()) return missing('video-changed', 'Previews/' + clipName, 'The preview video changed; its personal sound clip must be prepared again', { videoSha256: digest });
      var clip;
      try { clip = await fileCall('realpath', [path.join(realPreviews, clipName)]); inside(realPreviews, clip); checkAbort(signal); }
      catch (error) { if (error.code === 'ENOENT') return missing('clip-missing', 'Previews/' + clipName, 'The registered personal preview sound clip is missing'); throw error; }
      var descriptor = await fileCall('open', [clip, 'r']);
      try {
        checkAbort(signal); stat = await fileCall('fstat', [descriptor]); checkAbort(signal);
        if (!stat.isFile() || stat.size < 44 || stat.size > 67108864) throw failure('PREVIEW_AUDIO_INVALID_WAV', 'Prepared preview sound must be a bounded WAV file');
        var header = BufferType.alloc(12), bytesRead = await fileCall('read', [descriptor, header, 0, 12, 0]); checkAbort(signal);
        if (bytesRead !== 12 || header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE')
          throw failure('PREVIEW_AUDIO_INVALID_WAV', 'Prepared preview sound does not contain a WAV header');
      } finally { await fileCall('close', [descriptor]); }
      checkAbort(signal);
      return { status: 'ready', url: url.pathToFileURL(clip).href, offset: 0, missing: [], videoSha256: digest };
    };
  }
  var api = { createResolver: createResolver, manifestExample: manifestExample };
  scope.ContentriumPreviewAudioSource = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
