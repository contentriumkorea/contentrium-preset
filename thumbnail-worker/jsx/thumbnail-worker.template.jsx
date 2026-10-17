/* PRIVATE increment: fixed solid-only discovery/render, never the interactive host. */
(function () {
 var nonce, output;
 try {
  if (typeof $ === 'undefined' || typeof $.getenv !== 'function') return;
  nonce = $.getenv('CONTENTRIUM_SCRIPT_WORKER_NONCE'); if (nonce !== __NONCE__) return;
  output = $.getenv('CONTENTRIUM_SCRIPT_WORKER_RECEIPT'); if (output !== __RECEIPT__) return;
 } catch (noEnvironment) { return; }
 var request = __REQUEST__, requestHash = __REQUEST_SHA256__, handle = null, openedWriter = false, cancelFile = null;
 var scan = { totalLayers: 0, totalVisited: 0, activeLayer: null, layers: [] };
 var result = { schema: 1, nonce: nonce, requestId: request.requestId, requestSha256: requestHash, operation: request.operation, appVersion: 'unavailable', isRenderEngine: { available: false, value: null }, ok: false, phase: 'preflight', initialState: null, sourcePath: request.source.path, sourceSha256: request.source.sha256, manifest: null, frames: [], scan: scan, canceled: false, error: null };
 function fail(code, message) { var e = new Error(message || code); e.code = code; throw e; }
 function check(value, code) { if (!value) fail(code); }
 function finite(v) { return typeof v === 'number' && isFinite(v); }
 function integer(v, min, max) { return finite(v) && v === Math.floor(v) && v >= min && v <= max; }
 function quote(v) { return '"' + String(v).replace(/[\\"\x00-\x1f]/g, function (c) { return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4); }) + '"'; }
 function json(v) {
  if (v === null) return 'null'; var kind = typeof v; if (kind === 'string') return quote(v); if (kind === 'boolean') return v ? 'true' : 'false';
  if (kind === 'number') { check(isFinite(v), 'NONFINITE_RESULT'); return String(v); }
  var parts = [], i; if (v instanceof Array) { for (i = 0; i < v.length; i++) parts.push(json(v[i])); return '[' + parts.join(',') + ']'; }
  check(kind === 'object', 'UNSUPPORTED_RESULT'); for (i in v) if (Object.prototype.hasOwnProperty.call(v, i)) parts.push(quote(i) + ':' + json(v[i])); return '{' + parts.join(',') + '}';
 }
 function canceled() {
  if (!cancelFile || !cancelFile.exists) return;
  check(!cancelFile.alias && integer(cancelFile.length, 0, 256), 'CANCEL_TOKEN_INVALID');
  var text = null, reader = false;
  try { cancelFile.encoding = 'UTF-8'; check(cancelFile.open('r'), 'CANCEL_TOKEN_UNREADABLE'); reader = true; text = cancelFile.read(); }
  finally { if (reader) check(cancelFile.close() !== false, 'CANCEL_TOKEN_UNREADABLE'); }
  check(text === nonce + '\n' + request.requestId, 'CANCEL_TOKEN_INVALID'); result.canceled = true; fail('CANCELED');
 }
 function noExpressions(p, depth, path, row, strict) {
  row.attemptedNodes++; row.maxDepth = Math.max(row.maxDepth, depth); row.lastPath = path.slice(0);
  check(depth <= request.limits.maxDepth, 'PROPERTY_SCAN_DEPTH_LIMIT'); check(row.attemptedNodes <= request.limits.perLayerNodes, 'PROPERTY_SCAN_LAYER_LIMIT');
  check(scan.totalVisited < request.limits.totalNodes, 'PROPERTY_SCAN_TOTAL_LIMIT'); row.visitedNodes++; scan.totalVisited++;
  if (scan.totalVisited % 32 === 0) canceled();
  if (p.propertyType === PropertyType.PROPERTY) { if (strict) check(typeof p.canSetExpression === 'boolean', 'RECT_EXPRESSION_CAPABILITY_UNAVAILABLE'); if (p.canSetExpression) check(String(p.expression) === '', 'EXPRESSIONS_UNSUPPORTED'); return; }
  if (strict && depth > 0) check(p.propertyType === PropertyType.NAMED_GROUP || p.propertyType === PropertyType.INDEXED_GROUP, 'RECT_PROPERTY_TYPE_UNAVAILABLE');
  check(integer(p.numProperties, 0, request.limits.maxChildren), 'PROPERTY_SCAN_UNAVAILABLE');
  for (var i = 1; i <= p.numProperties; i++) noExpressions(p.property(i), depth + 1, path.concat([i]), row, strict);
 }
 function solid(item) {
  check(item instanceof FootageItem && item.file === null && item.mainSource instanceof SolidSource, 'SOLID_SOURCE_REQUIRED');
  check(item.useProxy === false && item.proxySource === null, 'PROXY_UNSUPPORTED');
  check(integer(item.width, 1, 30000) && integer(item.height, 1, 30000), 'SOLID_DIMENSIONS_UNAVAILABLE');
  var color = item.mainSource.color, copy = []; check(color && color.length === 3, 'SOLID_COLOR_UNAVAILABLE');
  for (var i = 0; i < 3; i++) { check(finite(color[i]) && color[i] >= 0 && color[i] <= 1, 'SOLID_COLOR_UNAVAILABLE'); copy.push(color[i]); }
  return { width: item.width, height: item.height, color: copy };
 }
 // Exact measured26.5 native single-rectangle/fill tree, including dormant vector materials.
 var rectTree = {"name":"ADBE Root Vectors Group","children":[{"name":"ADBE Vector Group","children":[{"name":"ADBE Vector Blend Mode"},{"name":"ADBE Vectors Group","children":[{"name":"ADBE Vector Shape - Rect","children":[{"name":"ADBE Vector Shape Direction"},{"name":"ADBE Vector Rect Size"},{"name":"ADBE Vector Rect Position"},{"name":"ADBE Vector Rect Roundness"}]},{"name":"ADBE Vector Graphic - Fill","children":[{"name":"ADBE Vector Blend Mode"},{"name":"ADBE Vector Composite Order"},{"name":"ADBE Vector Fill Rule"},{"name":"ADBE Vector Fill Color"},{"name":"ADBE Vector Fill Opacity"}]}]},{"name":"ADBE Vector Transform Group","children":[{"name":"ADBE Vector Anchor"},{"name":"ADBE Vector Position"},{"name":"ADBE Vector Scale"},{"name":"ADBE Vector Skew"},{"name":"ADBE Vector Skew Axis"},{"name":"ADBE Vector Rotation"},{"name":"ADBE Vector Group Opacity"}]},{"name":"ADBE Vector Materials Group","children":[{"name":"ADBE Vec3D Front RGB"},{"name":"ADBE Vec3D Front Ambient"},{"name":"ADBE Vec3D Front Diffuse"},{"name":"ADBE Vec3D Front Specular"},{"name":"ADBE Vec3D Front Shininess"},{"name":"ADBE Vec3D Front Metal"},{"name":"ADBE Vec3D Front Reflection"},{"name":"ADBE Vec3D Front Gloss"},{"name":"ADBE Vec3D Front Fresnel"},{"name":"ADBE Vec3D Front Xparency"},{"name":"ADBE Vec3D Front XparRoll"},{"name":"ADBE Vec3D Front IOR"},{"name":"ADBE Vec3D Bevel RGB"},{"name":"ADBE Vec3D Bevel Ambient"},{"name":"ADBE Vec3D Bevel Diffuse"},{"name":"ADBE Vec3D Bevel Specular"},{"name":"ADBE Vec3D Bevel Shininess"},{"name":"ADBE Vec3D Bevel Metal"},{"name":"ADBE Vec3D Bevel Reflection"},{"name":"ADBE Vec3D Bevel Gloss"},{"name":"ADBE Vec3D Bevel Fresnel"},{"name":"ADBE Vec3D Bevel Xparency"},{"name":"ADBE Vec3D Bevel XparRoll"},{"name":"ADBE Vec3D Bevel IOR"},{"name":"ADBE Vec3D Side RGB"},{"name":"ADBE Vec3D Side Ambient"},{"name":"ADBE Vec3D Side Diffuse"},{"name":"ADBE Vec3D Side Specular"},{"name":"ADBE Vec3D Side Shininess"},{"name":"ADBE Vec3D Side Metal"},{"name":"ADBE Vec3D Side Reflection"},{"name":"ADBE Vec3D Side Gloss"},{"name":"ADBE Vec3D Side Fresnel"},{"name":"ADBE Vec3D Side Xparency"},{"name":"ADBE Vec3D Side XparRoll"},{"name":"ADBE Vec3D Side IOR"},{"name":"ADBE Vec3D Back RGB"},{"name":"ADBE Vec3D Back Ambient"},{"name":"ADBE Vec3D Back Diffuse"},{"name":"ADBE Vec3D Back Specular"},{"name":"ADBE Vec3D Back Shininess"},{"name":"ADBE Vec3D Back Metal"},{"name":"ADBE Vec3D Back Reflection"},{"name":"ADBE Vec3D Back Gloss"},{"name":"ADBE Vec3D Back Fresnel"},{"name":"ADBE Vec3D Back Xparency"},{"name":"ADBE Vec3D Back XparRoll"},{"name":"ADBE Vec3D Back IOR"}]}]}]};
 function staticVector(p, expected) {
  check(p && p.matchName === expected.name, 'RECT_VECTOR_TREE_UNSUPPORTED');
  if (expected.children) { check(p.propertyType !== PropertyType.PROPERTY && p.numProperties === expected.children.length, 'RECT_VECTOR_TREE_UNSUPPORTED'); for (var i = 0; i < expected.children.length; i++) staticVector(p.property(i + 1), expected.children[i]); }
  else { check(p.propertyType === PropertyType.PROPERTY && p.numKeys === 0, 'RECT_STATIC_VECTOR_REQUIRED'); check(typeof p.canSetExpression === 'boolean', 'RECT_EXPRESSION_CAPABILITY_UNAVAILABLE'); if (p.canSetExpression) check(String(p.expression) === '', 'EXPRESSIONS_UNSUPPORTED'); var v = p.value; if (v instanceof Array) { check(integer(v.length, 1, 4), 'RECT_STATIC_VALUE_UNAVAILABLE'); for (var j = 0; j < v.length; j++) check(finite(v[j]), 'RECT_STATIC_VALUE_UNAVAILABLE'); } else check(finite(v), 'RECT_STATIC_VALUE_UNAVAILABLE'); }
 }
 function rectangle(layer) {
  check(layer instanceof ShapeLayer && layer.source === null && layer.threeDLayer === false && layer.parent === null && layer.nullLayer === false && layer.adjustmentLayer === false && layer.guideLayer === false && layer.timeRemapEnabled === false && layer.hasTrackMatte === false && layer.isTrackMatte === false && layer.motionBlur === false && layer.blendingMode === BlendingMode.NORMAL, 'RECT_LAYER_FAMILY_UNSUPPORTED');
  var masks = layer.property('ADBE Mask Parade'), styles = layer.property('ADBE Layer Styles'), transform = layer.property('ADBE Transform Group');
  check(masks && masks.numProperties === 0 && styles && styles.enabled === false && styles.isModified === false, 'RECT_MASK_OR_STYLE_UNSUPPORTED');
  check(transform && integer(transform.numProperties, 1, request.limits.maxChildren), 'RECT_TRANSFORM_UNAVAILABLE');
  for (var i = 1; i <= transform.numProperties; i++) { var p = transform.property(i), name = p.matchName; check(integer(p.numKeys, 0, 120), 'RECT_TRANSFORM_KEY_LIMIT'); if (name !== 'ADBE Position' && name !== 'ADBE Scale' && name !== 'ADBE Rotate Z' && name !== 'ADBE Opacity') check(p.numKeys === 0, 'RECT_TRANSFORM_KEYS_UNSUPPORTED'); }
  staticVector(layer.property('ADBE Root Vectors Group'), rectTree);
  return { kind: 'rect-fill', profile: 'single-rect-fill-static-v1' };
 }
 function timing(comp) {
  check(integer(comp.width, 1, request.limits.maxDimension) && integer(comp.height, 1, request.limits.maxDimension) && comp.width * comp.height <= request.limits.maxPixels, 'GEOMETRY_UNSUPPORTED');
  check(comp.pixelAspect === 1 && comp.displayStartTime === 0, 'PIXEL_ASPECT_OR_START_UNSUPPORTED');
  check(finite(comp.duration) && comp.duration > 0 && finite(comp.frameDuration) && comp.frameDuration > 0 && finite(comp.frameRate) && comp.frameRate > 0, 'TIMING_UNAVAILABLE');
  var count = comp.duration / comp.frameDuration, n = Math.round(count), epsilon = 2.220446049250313e-16;
  check(integer(n, 1, 1000000) && Math.abs(count - n) <= 8 * epsilon * Math.max(1, count) && Math.abs(1 / comp.frameDuration - comp.frameRate) <= 8 * epsilon * Math.max(1, comp.frameRate), 'INTEGRAL_TIMING_REQUIRED');
  return n;
 }
 function metadata(comp, ordinal) {
  var meta = { ordinal: ordinal, name: String(comp.name), width: comp.width, height: comp.height, pixelAspect: comp.pixelAspect, duration: comp.duration, frameRate: comp.frameRate, frameDuration: comp.frameDuration, displayStartTime: comp.displayStartTime, layerCount: comp.numLayers, eligible: false, reason: null, layers: [], totalFrames: null };
  try {
   meta.totalFrames = timing(comp); check(integer(comp.numLayers, 1, request.limits.layersPerComp), 'LAYER_COUNT_UNSUPPORTED'); check(typeof comp.saveFrameToPng === 'function', 'PNG_METHOD_UNAVAILABLE');
   for (var i = 1; i <= comp.numLayers; i++) {
    canceled(); check(scan.totalLayers < request.limits.totalLayers, 'PROJECT_LAYER_LIMIT'); var layer = comp.layer(i);
    var isRect = request.policy === 'solid-rect-v1' && layer instanceof ShapeLayer;
    if (!isRect) check(layer instanceof AVLayer && layer.threeDLayer === false && layer.nullLayer === false && layer.adjustmentLayer === false && layer.parent === null, 'LAYER_FAMILY_UNSUPPORTED');
    var effects = layer.property('ADBE Effect Parade'); check(effects && effects.numProperties === 0, 'EFFECTS_UNSUPPORTED');
    var info = isRect ? rectangle(layer) : solid(layer.source), row = { compOrdinal: ordinal, layerIndex: i, attemptedNodes: 0, visitedNodes: 0, maxDepth: 0, lastPath: [], completed: false };
    scan.totalLayers++; scan.activeLayer = scan.layers.length; scan.layers.push(row); noExpressions(layer, 0, [], row, isRect); row.completed = true; scan.activeLayer = null;
    if (isRect) meta.layers.push({ index: i, name: String(layer.name), kind: info.kind, profile: info.profile });
    else meta.layers.push({ index: i, name: String(layer.name), width: info.width, height: info.height, color: info.color });
   }
   meta.eligible = true;
  } catch (error) { if (result.canceled || String(error.code).indexOf('CANCEL_') === 0) throw error; meta.reason = String(error.code || 'NATIVE_METADATA_UNAVAILABLE'); }
  return meta;
 }
 function discover(project) {
  check(project && app.project === project && project.file && project.file.fsName === request.source.path, 'OPENED_SOURCE_CHANGED');
  check(integer(project.numItems, 1, request.limits.items) && project.renderQueue && project.renderQueue.numItems === 0 && project.renderQueue.rendering === false, 'PROJECT_LIMIT_OR_QUEUE');
  var manifest = { schema: 1, policy: request.policy, sourceSha256: request.source.sha256, projectEligible: true, reason: null, compositions: [] }; result.manifest = manifest;
  for (var i = 1; i <= project.numItems; i++) {
   canceled(); var item = project.item(i);
   if (item instanceof CompItem) {
    check(manifest.compositions.length < request.limits.compositions, 'COMPOSITION_LIMIT'); var meta = metadata(item, i); manifest.compositions.push(meta);
    if (!meta.eligible) { manifest.projectEligible = false; if (manifest.reason === null) manifest.reason = meta.reason; }
   } else if (!(item instanceof FolderItem)) {
    try { solid(item); } catch (error) { manifest.projectEligible = false; if (manifest.reason === null) manifest.reason = String(error.code || 'UNSUPPORTED_PROJECT_ITEM'); }
   }
  }
  if (manifest.compositions.length === 0) { manifest.projectEligible = false; manifest.reason = 'NO_COMPOSITIONS'; }
  return manifest;
 }
 function bytesEqual(text, values) { if (text.length !== values.length) return false; for (var i = 0; i < values.length; i++) if (text.charCodeAt(i) !== values[i]) return false; return true; }
 function uint32(text, offset) { return text.charCodeAt(offset) * 16777216 + text.charCodeAt(offset + 1) * 65536 + text.charCodeAt(offset + 2) * 256 + text.charCodeAt(offset + 3); }
 function readEnvelope(file, spec, state) {
  if (!file.exists) { state.lastBytes = 0; state.lastReadReason = 'missing'; return null; }
  var size = file.length; check(finite(size) && size >= 0 && size <= request.pngWait.maxBytes, 'PNG_SIZE_LIMIT'); state.lastBytes = size;
  if (size < 36) { state.lastReadReason = 'short-file'; return null; }
  var reader = false, header, tail, primary = null;
  try {
   file.encoding = 'BINARY'; if (!file.open('r')) { state.lastReadReason = 'read-denied'; return null; } reader = true;
   check(file.seek(0, 0) !== false, 'PNG_READ_FAILED'); header = file.read(24); check(file.seek(size - 12, 0) !== false, 'PNG_READ_FAILED'); tail = file.read(12);
  } catch (error) { primary = error; fail('PNG_READ_FAILED', String(error.message || error)); }
  finally { if (reader) try { if (file.close() === false && !primary) fail('PNG_READ_FAILED'); } catch (closeError) { if (!primary) throw closeError; } }
  if (file.length !== size) { state.lastReadReason = 'length-changed'; return null; }
  if (header.length !== 24 || !bytesEqual(header.slice(0, 8), [137, 80, 78, 71, 13, 10, 26, 10]) || uint32(header, 8) !== 13 || header.slice(12, 16) !== 'IHDR') { state.lastReadReason = 'incomplete-header'; return null; }
  if (!bytesEqual(tail, [0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130])) { state.lastReadReason = 'incomplete-iend'; return null; }
  check(uint32(header, 16) === spec.width && uint32(header, 20) === spec.height, 'PNG_DIMENSIONS_CHANGED'); state.lastReadReason = 'complete-envelope'; return String(size) + '|' + header + '|' + tail;
 }
 function settle(file, spec, state) {
  var began = new Date().getTime(), last = null; state.state = 'waiting';
  try {
   for (var poll = 1; poll <= request.pngWait.maxPolls; poll++) {
    canceled(); state.elapsedMs = Math.max(0, new Date().getTime() - began); check(finite(state.elapsedMs), 'PNG_WAIT_FAILED');
    if (state.elapsedMs >= request.pngWait.maxElapsedMs) { state.state = 'timed-out'; fail('PNG_WAIT_TIMEOUT'); }
    state.polls = poll; var key = readEnvelope(file, spec, state); canceled(); state.elapsedMs = Math.max(0, new Date().getTime() - began);
    if (key !== null) { state.stableObservations = key === last ? state.stableObservations + 1 : 1; last = key; } else { state.stableObservations = 0; last = null; }
    if (state.stableObservations >= request.pngWait.stableRequired && state.elapsedMs < request.pngWait.maxElapsedMs) { state.envelopeComplete = true; state.state = 'complete'; return; }
    if (poll === request.pngWait.maxPolls || state.elapsedMs >= request.pngWait.maxElapsedMs) { state.state = 'timed-out'; fail('PNG_WAIT_TIMEOUT'); }
    try { $.sleep(request.pngWait.sleepMs); } catch (sleepError) { state.state = 'sleep-error'; fail('PNG_WAIT_FAILED', String(sleepError.message || sleepError)); }
   }
  } catch (error) { if (state.state === 'waiting') state.state = result.canceled ? 'canceled' : 'read-error'; throw error; }
 }
 try {
  check(request.policy === 'solid-v1' || request.policy === 'solid-rect-v1', 'UNSUPPORTED_WORKER_POLICY');
  handle = new File(output); if (handle.exists || handle.alias || !handle.parent.exists || handle.parent.alias) return;
  cancelFile = new File(request.cancelPath); check(cancelFile.parent.fsName === handle.parent.fsName && !cancelFile.alias && !cancelFile.parent.alias, 'OWN_CANCEL_PATH_REQUIRED'); canceled();
  result.appVersion = String(app.version); check(result.appVersion === '26.5x89', 'UNQUALIFIED_HOST_VERSION');
  try { var engine = app.isRenderEngine; if (typeof engine === 'boolean') { result.isRenderEngine.available = true; result.isRenderEngine.value = engine; } } catch (engineUnavailable) {}
  check(result.isRenderEngine.available && result.isRenderEngine.value === true, 'RENDER_ENGINE_REQUIRED'); var initial = app.project;
  if (initial === null) result.initialState = { projectPresent: false, state: 'absent' };
  else { result.initialState = { projectPresent: true, state: 'unverified' }; check(initial && initial.file === null && initial.dirty === false && initial.numItems === 0 && initial.renderQueue && initial.renderQueue.numItems === 0 && initial.renderQueue.rendering === false, 'INITIAL_CLEAN_EMPTY_REQUIRED'); result.initialState.state = 'clean-empty'; }
  var source = new File(request.source.path); check(source.exists && source.alias === false && source.fsName === request.source.path, 'EXACT_SOURCE_REQUIRED');
  var files = [], i; for (i = 0; i < request.frames.length; i++) { var file = new File(request.frames[i].outputPath); check(file.fsName === request.frames[i].outputPath && !file.exists && !file.alias && file.parent.fsName === handle.parent.fsName && !file.parent.alias, 'NEW_OWN_FRAME_REQUIRED'); files.push(file); }
  canceled(); result.phase = 'opening'; var project = app.open(source); canceled(); result.phase = 'discovery'; var manifest = discover(project); canceled();
  if (request.operation === 'render') {
   check(manifest.projectEligible && json(manifest) === json(request.selection.manifest), 'SELECTION_CHANGED'); var selected = project.item(request.selection.record.ordinal);
   check(selected instanceof CompItem && json(metadataForSelected(manifest, request.selection.record.ordinal)) === json(request.selection.record), 'SELECTION_CHANGED');
   var n = timing(selected); check(request.frames.length === 12, 'TWELVE_FRAMES_REQUIRED');
   for (i = 0; i < 12; i++) {
    canceled(); var spec = request.frames[i], index = Math.floor(i * (n - 1) / 11), time = index * selected.frameDuration;
    check(n === request.selection.record.totalFrames && spec.ordinal === i && spec.index === index && finite(time) && time >= 0 && time < selected.duration, 'SAMPLE_PLAN_CHANGED');
    var record = { ordinal: i, index: index, time: time, nativeTimeText: String(time), path: files[i].fsName, status: 'attempted', pending: true, settlement: { state: 'not-started', polls: 0, elapsedMs: 0, lastBytes: 0, lastReadReason: 'not-started', envelopeComplete: false, stableObservations: 0 } };
    result.frames.push(record); result.phase = 'frame-request'; selected.saveFrameToPng(time, files[i]); record.status = 'requested'; canceled(); result.phase = 'settling-frame'; settle(files[i], selected, record.settlement); canceled();
   }
  }
  canceled(); result.ok = true; result.phase = 'complete';
 } catch (error) { result.error = { code: String(error.code || 'WORKER_NATIVE_ERROR'), message: String(error.message || error).slice(0, 4096) }; }
 finally {
  if (handle) try { handle.encoding = 'UTF-8'; if (!handle.exists && handle.open('w')) { openedWriter = true; handle.write(json(result)); } } catch (resultUnavailable) {}
  if (openedWriter) try { handle.close(); } catch (closeUnavailable) {}
 }
 function metadataForSelected(manifest, ordinal) { for (var i = 0; i < manifest.compositions.length; i++) if (manifest.compositions[i].ordinal === ordinal) return manifest.compositions[i]; return null; }
}());
