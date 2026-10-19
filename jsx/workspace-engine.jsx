(function () {
    var codec, serial = 0, supported = ['cpreset.json', 'ffx', 'aep', 'aepx', 'png', 'jpg', 'jpeg', 'tif', 'tiff', 'psd', 'exr', 'gif', 'webp', 'mp4', 'mov', 'avi', 'mxf', 'webm', 'wav', 'mp3', 'aif', 'aiff', 'm4a', 'flac'];
    var defaults = { pausePreviewWhenInactive: true, presetMotionBlurEnabled: true, insertPrecompAfterInTransition: false, copyUserLibFootageNextToProject: false };
    // Filesystem metadata only: never retain AE project/item handles here.
    var librarySnapshot = null, workspaceSeen = false;
    function fail(code, message) { var e = new Error(message); e.code = code; throw e; }
    function base() { return new Folder(Folder.userData.fsName + '/Contentrium/Preset'); }
    function storeFile() { return new File(base().fsName + '/workspace.json'); }
    function ensure(folder) { if (folder.exists) return; if (folder.parent && folder.parent.fsName !== folder.fsName) ensure(folder.parent); if (!folder.create()) fail('FOLDER_CREATE_FAILED', '폴더를 만들 수 없습니다: ' + folder.fsName); }
    function object() { return { schemaVersion: 1, settings: {}, folders: [], items: [] }; }
    function readJSON(file) {
        file.encoding = 'UTF-8'; if (!file.open('r')) fail('READ_FAILED', '파일을 읽을 수 없습니다: ' + file.fsName);
        var text; try { text = file.read(); } finally { file.close(); }
        try { return codec.parse(text); } catch (e) { fail('INVALID_WORKSPACE_DATA', 'Invalid workspace JSON data: ' + file.fsName); }
    }
    function read() {
        var f = storeFile(); if (!f.exists) { if (workspaceSeen) fail('INVALID_WORKSPACE_DATA', 'Workspace file disappeared. Refresh after restoring it.'); return object(); } workspaceSeen = true; var data = readJSON(f);
        if (!data || data.schemaVersion !== 1 || !data.settings || Object.prototype.toString.call(data.folders) !== '[object Array]' || Object.prototype.toString.call(data.items) !== '[object Array]') fail('INVALID_WORKSPACE_DATA', 'Invalid workspace data: ' + f.fsName);
        return data;
    }
    function writeJSON(file, data) {
        ensure(file.parent); var temp = new File(file.fsName + '.tmp-' + new Date().getTime() + '-' + (++serial)), backup = new File(file.fsName + '.bak'), originalName = file.name, hadOriginal = file.exists;
        temp.encoding = 'UTF-8'; if (!temp.open('w')) fail('WRITE_FAILED', '파일을 저장할 수 없습니다: ' + file.fsName);
        var written; try { written = temp.write(codec.json(data)); } finally { temp.close(); }
        if (written === false) { temp.remove(); fail('WRITE_FAILED', '파일 저장에 실패했습니다: ' + file.fsName); }
        readJSON(temp);
        if (hadOriginal) {
            if (backup.exists && !backup.remove()) fail('BACKUP_FAILED', '이전 백업을 갱신할 수 없습니다.');
            if (!file.rename(originalName + '.bak')) fail('BACKUP_FAILED', '설정 백업을 만들 수 없습니다.');
        }
        if (!temp.rename(originalName)) { if (hadOriginal) backup.rename(originalName); fail('WRITE_FAILED', '저장 파일을 교체할 수 없습니다.'); }
    }
    function write(data) {
        if (librarySnapshot && librarySnapshot.membership !== membership(data)) librarySnapshot.valid = false;
        try { writeJSON(storeFile(), data); workspaceSeen = true; } catch (error) { if (librarySnapshot) librarySnapshot.valid = false; throw error; }
    }
    function loadPropertySets() { var data = read(); return data.propertySets ? codec.json(data.propertySets) : null; }
    function savePropertySets(serialized) { var value = codec.parse(serialized), data = read(); data.propertySets = value; write(data); }
    function hash(value) { var h = 2166136261; for (var i = 0; i < value.length; i++) h = ((h ^ value.charCodeAt(i)) * 16777619) >>> 0; return h.toString(36); }
    function canonical(path) { return String(path).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase(); }
    // Own reserved output namespace. Registration and planning never create it.
    var previewCacheName = '.contentrium-preset-previews';
    function previewPolicy(record) {
        var value = record.previewsLocation;
        if (typeof value === 'undefined') return 'localCache';
        if (value !== 'localCache' && value !== 'userFolder') fail('INVALID_PREVIEW_LOCATION', '미리보기 저장 위치가 올바르지 않습니다.');
        return value;
    }
    function isPreviewCache(path) {
        var key = canonical(path), internal = canonical(base().fsName + '/ThumbnailCache');
        return key === internal || key.indexOf(internal + '/') === 0 || ('/' + key + '/').indexOf('/' + previewCacheName + '/') !== -1;
    }
    function previewPlan(record) {
        var policy = previewPolicy(record), root = new Folder(record.path), output = new Folder(policy === 'userFolder' ? root.fsName + '/' + previewCacheName : base().fsName + '/ThumbnailCache');
        return { folderId: record.id, registeredRoot: root.fsName, canonicalRoot: canonical(root.fsName), previewsLocation: policy, outputRoot: output.fsName, canonicalOutputRoot: canonical(output.fsName), requiresWritableCheck: true, onUnwritable: 'error', allowFallback: false };
    }
    function previewDestination(options) {
        var data = read();
        for (var i = 0; i < data.folders.length; i++) if (data.folders[i].id === options.folderId) return previewPlan(data.folders[i]);
        fail('FOLDER_NOT_REGISTERED', '등록된 폴더를 찾을 수 없습니다.');
    }
    function libraryPreviewDestination(options) {
        if (!options || typeof options.id !== 'string' || !options.sourceStamp) fail('SOURCE_IDENTITY_REQUIRED', '선택한 원본의 식별 정보가 필요합니다.');
        var item = find(options.id, options.sourceStamp), data = read(), bucket = [], chosen = null, plan, i, j, row, record, sourcePath = canonical(item.path);
        for (i = 0; i < data.folders.length; i++) if (sourcePath.indexOf(canonical(data.folders[i].path) + '/') === 0) bucket.push({ folderId: data.folders[i].id });
        if (item.managed) bucket.push({ managed: true });
        for (i = 0; i < bucket.length; i++) {
            row = bucket[i]; record = null;
            if (row.folderId) {
                for (j = 0; j < data.folders.length; j++) if (data.folders[j].id === row.folderId) record = data.folders[j];
                if (!record) fail('FOLDER_NOT_REGISTERED', '등록된 폴더를 찾을 수 없습니다.');
                plan = previewPlan(record);
            } else {
                if (!row.managed) fail('PREVIEW_DESTINATION_UNAVAILABLE', '미리보기 저장 위치를 확인할 수 없습니다.');
                var local = new Folder(base().fsName + '/ThumbnailCache');
                plan = { folderId: null, registeredRoot: null, canonicalRoot: null, previewsLocation: 'localCache', outputRoot: local.fsName, canonicalOutputRoot: canonical(local.fsName), requiresWritableCheck: true, onUnwritable: 'error', allowFallback: false };
            }
            if (chosen && (chosen.canonicalOutputRoot !== plan.canonicalOutputRoot || chosen.previewsLocation !== plan.previewsLocation)) fail('PREVIEW_DESTINATION_AMBIGUOUS', '여러 등록 폴더의 미리보기 저장 위치가 다릅니다.');
            if (!chosen) chosen = plan;
        }
        if (!chosen) fail('PREVIEW_DESTINATION_UNAVAILABLE', '미리보기 저장 위치를 확인할 수 없습니다.');
        chosen.schemaVersion = 1; chosen.itemId = item.id; chosen.sourceStamp = clone(item.sourceStamp);
        chosen.registrationIdentity = ordered({ folderId: chosen.folderId, root: chosen.canonicalRoot, policy: chosen.previewsLocation, output: chosen.canonicalOutputRoot });
        return chosen;
    }
    function clone(value) { return codec.parse(codec.json(value)); }
    function ordered(value) {
        if (!value || typeof value !== 'object') return codec.json(value);
        var parts = [], keys = [], key, i;
        if (Object.prototype.toString.call(value) === '[object Array]') { for (i = 0; i < value.length; i++) parts.push(ordered(value[i])); return '[' + parts.join(',') + ']'; }
        for (key in value) if (Object.prototype.hasOwnProperty.call(value, key)) keys.push(key);
        keys.sort(); for (i = 0; i < keys.length; i++) parts.push(codec.json(keys[i]) + ':' + ordered(value[keys[i]])); return '{' + parts.join(',') + '}';
    }
    function membership(data) { return ordered({ folders: data.folders, items: data.items }); }
    function librarySourceStamp(item) {
        var file = new File(item.path), size = null, time = null;
        if (file.exists) try { size = file.length; var modified = file.modified; time = modified && modified.getTime(); } catch (ignoreMetadata) {}
        return { path: canonical(file.fsName), kind: item.kind, size: typeof size === 'number' && isFinite(size) ? size : null, modifiedMs: typeof time === 'number' && isFinite(time) ? time : null };
    }
    function sameSource(a, b) { return a && b && a.path === b.path && a.kind === b.kind && a.size === b.size && a.modifiedMs === b.modifiedMs; }
    function validateSource(item) {
        var file = new File(item.path), current = librarySourceStamp(item);
        if (!file.exists || (item.sourceStamp && !sameSource(item.sourceStamp, current))) {
            if (librarySnapshot) librarySnapshot.valid = false;
            fail(item.sourceStamp ? 'LIBRARY_SOURCE_CHANGED' : 'MEDIA_MISSING', '원본 파일이 변경되었거나 없습니다. 라이브러리를 새로고침하세요.');
        }
        if (current.size === null || current.modifiedMs === null) { if (librarySnapshot) librarySnapshot.valid = false; fail('SOURCE_IDENTITY_UNAVAILABLE', '원본 파일의 변경 상태를 확인할 수 없습니다.'); }
        return current;
    }
    function displayName(name) { try { return decodeURI(name); } catch (ignoreRawName) { return String(name); } }
    function kind(name) {
        var n = String(name).toLowerCase();
        if (/\.cpreset\.json$/.test(n)) return 'preset';
        if (/\.ffx$/.test(n)) return 'animation-preset';
        if (/\.aepx?$/.test(n)) return 'project';
        if (/\.(wav|mp3|aiff?|m4a|flac)$/.test(n)) return 'audio';
        if (/\.(mp4|mov|avi|mxf|webm)$/.test(n)) return 'video';
        if (/\.(png|jpe?g|tiff?|psd|exr|dpx|cin|bmp|tga|hdr|iff|rla|rpf|sgi|rgba?|gif|webp)$/.test(n)) return 'image';
        return null;
    }
    function fileItem(file, folderId, category) {
        var type = kind(file.name); if (!type) return null;
        return { id: 'file-' + hash(canonical(file.fsName)), name: displayName(file.name).replace(/\.cpreset\.json$/i, '').replace(/\.[^.]+$/, ''), kind: type, type: type, path: file.fsName, sourceFileSize: file.length, folderId: folderId, category: category || '', preview: /^(image|video|audio)$/.test(type) ? 'file:///' + encodeURI(file.fsName.replace(/\\/g, '/')).replace(/#/g,'%23').replace(/\?/g,'%3F').replace(/^\/+/, '') : null, managed: false };
    }
    function getSettings() {
        var data = read(), settings = {}, key;
        for (key in defaults) if (defaults.hasOwnProperty(key)) settings[key] = typeof data.settings[key] === 'boolean' ? data.settings[key] : defaults[key];
        return { settings: settings, schema: { version: 1, unsupported: ['presetPseudoEnabled'] } };
    }
    function setSettings(options) {
        if (!defaults.hasOwnProperty(options.key)) fail('UNKNOWN_SETTING', '지원하지 않는 설정입니다.');
        if (typeof options.value !== 'boolean') fail('INVALID_SETTING', 'Setting must be a boolean.');
        var data = read(); data.settings[options.key] = options.value; write(data); return getSettings();
    }
    function getLibrary() {
        librarySnapshot = { valid: false };
        var data = read(), signature = membership(data), items = [], folders = [], seen = {}, warnings = [], complete = true, index = {}, i;
        function scan(folder, id, category, depth) {
            if (depth > 16) { complete = false; warnings.push('폴더 깊이 제한: ' + folder.fsName); return; }
            var key = canonical(folder.fsName); if (seen[key] || folder.alias || isPreviewCache(folder.fsName)) return; seen[key] = true;
            var files; try { files = folder.getFiles(); } catch (e) { complete = false; warnings.push('폴더를 읽을 수 없습니다: ' + folder.fsName); return; }
            for (var j = 0; j < files.length; j++) {
                if (files[j] instanceof Folder) scan(files[j], id, category ? category + '/' + files[j].name : files[j].name, depth + 1);
                else { var item = fileItem(files[j], id, category); if (item) items.push(item); }
            }
            if ($.cpSequence) {
                var sequences = $.cpSequence.scan(files).sequences;
                for (j = 0; j < sequences.length; j++) {
                    var sequence = sequences[j], first = fileItem(new File(sequence.files[0].path), id, category);
                    first.id = 'sequence-' + hash(sequence.id); first.kind = first.type = 'image-sequence'; first.name = sequence.prefix + '[' + sequence.startFrame + '-' + sequence.endFrame + ']' + sequence.suffix;
                    first.sequence = sequence; first.frameCount = sequence.count; first.missingFrameCount = sequence.missingFrameCount; first.importable = sequence.importable;
                    items.push(first);
                }
            }
        }
        for (i = 0; i < data.folders.length; i++) {
            var record = data.folders[i], folder = new Folder(record.path), desc = { id: record.id, path: record.path, name: folder.name, missing: !folder.exists, previewsLocation: previewPolicy(record) }; folders.push(desc);
            if (folder.exists) scan(folder, record.id, '', 0); else warnings.push('폴더를 찾을 수 없습니다: ' + record.path);
        }
        for (i = 0; i < data.items.length; i++) { var saved = data.items[i]; saved.missing = !(new File(saved.path)).exists; items.push(saved); }
        items.sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0); });
        for (i = 0; i < items.length; i++) {
            var row = items[i], bucketKey = '$' + row.id; row.sourceStamp = librarySourceStamp(row);
            if (!index[bucketKey]) index[bucketKey] = [];
            index[bucketKey].push(row);
        }
        for (var key in index) if (Object.prototype.hasOwnProperty.call(index, key)) {
            var bucket = index[key], ambiguous = false, j;
            for (j = 1; j < bucket.length; j++) if (bucket[j].sourceStamp.path !== bucket[0].sourceStamp.path || bucket[j].kind !== bucket[0].kind) ambiguous = true;
            if (ambiguous) for (j = 0; j < bucket.length; j++) bucket[j].ambiguous = true;
        }
        if (membership(read()) !== signature) fail('LIBRARY_REFRESH_REQUIRED', '라이브러리 등록 내용이 변경되었습니다. 새로고침하세요.');
        librarySnapshot = { valid: complete, membership: signature, itemsById: clone(index) };
        return { items: items, folders: folders, supportedTypes: supported, warnings: warnings, capabilities: { audioTransforms: true, imageSequence: !!$.cpSequence }, sequenceSchema: $.cpSequence ? $.cpSequence.schema() : null };
    }
    function addFolder(options) {
        if (typeof options.path !== 'string' || !options.path.length) fail('PATH_REQUIRED', '폴더 경로가 필요합니다.');
        var policy = previewPolicy(options), folder = new Folder(options.path); if (!folder.exists) fail('FOLDER_MISSING', '폴더를 찾을 수 없습니다.');
        if (isPreviewCache(folder.fsName)) fail('PREVIEW_CACHE_NOT_LIBRARY', '미리보기 캐시 폴더는 라이브러리로 등록할 수 없습니다.');
        var data = read(), key = canonical(folder.fsName);
        for (var i = 0; i < data.folders.length; i++) if (canonical(data.folders[i].path) === key) { var existing = clone(data.folders[i]); existing.previewsLocation = previewPolicy(existing); return { folder: existing, existing: true }; }
        var item = { id: 'folder-' + hash(key), path: folder.fsName, previewsLocation: policy }; data.folders.push(item); write(data); return { folder: item };
    }
    function removeFolder(options) {
        var data = read(), out = [], found = false;
        for (var i = 0; i < data.folders.length; i++) if (data.folders[i].id === options.id) found = true; else out.push(data.folders[i]);
        if (!found) fail('FOLDER_NOT_REGISTERED', '등록된 폴더를 찾을 수 없습니다.');
        data.folders = out; write(data); return { removed: options.id };
    }
    function find(id, expectedSource) {
        if (!librarySnapshot) getLibrary();
        var data; try { data = read(); } catch (error) { librarySnapshot.valid = false; throw error; }
        if (!librarySnapshot.valid || membership(data) !== librarySnapshot.membership) { librarySnapshot.valid = false; fail('LIBRARY_REFRESH_REQUIRED', '라이브러리 등록 내용이 변경되었거나 확인되지 않았습니다. 새로고침하세요.'); }
        var bucket = librarySnapshot.itemsById['$' + id];
        if (!bucket || !bucket.length) fail('LIBRARY_ITEM_MISSING', '라이브러리 항목을 찾을 수 없습니다. 새로고침하세요.');
        var item = bucket[0]; if (item.ambiguous) fail('LIBRARY_ITEM_AMBIGUOUS', '항목 ID가 중복되어 원본을 구분할 수 없습니다.');
        // An old panel must not invalidate a newer, otherwise valid snapshot.
        if (expectedSource !== undefined && !sameSource(expectedSource, item.sourceStamp)) fail('LIBRARY_SOURCE_CHANGED', '선택한 원본이 변경되었습니다. 라이브러리를 새로고침하세요.');
        validateSource(item); return clone(item);
    }
    function savePreset(options, payload) {
        var name = String(options.name || '').replace(/^\s+|\s+$/g, ''); if (!name) fail('NAME_REQUIRED', '프리셋 이름을 입력하세요.');
        var id = 'preset-' + new Date().getTime().toString(36) + '-' + (++serial), folder = new Folder(base().fsName + '/Presets'), safe = name.replace(/[<>:"\/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0,80) || 'Preset';
        var file = new File(folder.fsName + '/' + safe + '-' + id + '.cpreset.json'), data = read();
        writeJSON(file, { product: 'Contentrium Preset', schemaVersion: 1, name: name, category: options.category || '', payload: payload });
        var item = { id: id, name: name, category: options.category || '', kind: 'preset', type: 'preset', path: file.fsName, managed: true };
        data.items.push(item); try { write(data); } catch (e) { file.remove(); throw e; } return item;
    }
    function readPreset(id, expectedSource) {
        var item = find(id, expectedSource); if (item.kind !== 'preset') fail('NOT_A_PRESET', '프리셋 파일을 선택하세요.');
        var doc = readJSON(new File(item.path));
        if (!doc || doc.product !== 'Contentrium Preset' || doc.schemaVersion !== 1 || !doc.payload) fail('INVALID_PRESET', 'Contentrium Preset 파일 형식이 올바르지 않습니다.');
        return doc.payload;
    }
    function removeItem(options) {
        var data = read(), found = null, out = [];
        for (var i = 0; i < data.items.length; i++) if (data.items[i].id === options.id) found = data.items[i]; else out.push(data.items[i]);
        if (!found || !found.managed) fail('UNMANAGED_ITEM', '직접 저장한 프리셋만 여기서 삭제할 수 있습니다. 외부 폴더의 원본 파일은 유지합니다.');
        var path = canonical(found.path), prefix = canonical(base().fsName + '/Presets') + '/';
        if (path.indexOf(prefix) !== 0) fail('INVALID_MANAGED_PATH', '저장된 프리셋의 경로가 올바르지 않습니다.');
        data.items = out; write(data); var f = new File(found.path); if (f.exists && !f.remove()) { data.items.push(found); write(data); fail('DELETE_FAILED', '프리셋 파일을 삭제할 수 없습니다.'); }
        return { removed: found.id };
    }
    function mediaFile(item, copyNextToProject) {
        var stamp = validateSource(item), source = new File(item.path);
        if (!copyNextToProject) return source;
        var project = app.project.file; if (!project) fail('PROJECT_SAVE_REQUIRED', '미디어를 프로젝트 옆에 복사하려면 프로젝트를 먼저 저장하세요.');
        var folder = new Folder(project.parent.fsName + '/Contentrium Media'), hadFolder = folder.exists; ensure(folder);
        var name = hash(canonical(source.fsName) + ':' + source.length + ':' + String(source.modified)) + '-' + source.name, target = new File(folder.fsName + '/' + name);
        var created = !target.exists;
        try {
            validateSource({ path: item.path, kind: item.kind, sourceStamp: stamp });
            if (created && !source.copy(target.fsName)) fail('MEDIA_COPY_FAILED', '미디어 복사에 실패했습니다.');
            validateSource({ path: item.path, kind: item.kind, sourceStamp: stamp });
            if (!target.exists || target.length !== stamp.size) fail('MEDIA_COPY_FAILED', '복사한 미디어의 크기를 확인할 수 없습니다.');
        } catch (error) {
            if (created) try { if (target.exists) target.remove(); } catch (ignoreTargetCleanup) {}
            if (!hadFolder) try { folder.remove(); } catch (ignoreMediaFolderCleanup) {}
            throw error;
        }
        return target;
    }
    function sourceStamp(item) {
        var file = new File(item.path); if (!file.exists) fail('MEDIA_MISSING', '원본 미디어를 찾을 수 없습니다.');
        var modified = file.modified, time = modified && modified.getTime(), size = file.length;
        if (typeof time !== 'number' || !isFinite(time) || typeof size !== 'number' || !isFinite(size)) fail('SOURCE_IDENTITY_UNAVAILABLE', '원본 파일의 변경 상태를 확인할 수 없습니다.');
        return { path: canonical(file.fsName), size: size, modifiedMs: time, copyNextToProject: getSettings().settings.copyUserLibFootageNextToProject };
    }
    function audioPlan(item, options) {
        options = options || {}; if (item.kind !== 'audio') fail('AUDIO_REQUIRED', '오디오 항목을 선택하세요.');
        var pitch = options.pitchShift === undefined ? 0 : options.pitchShift, reverse = options.reverse === undefined ? false : options.reverse;
        if (typeof pitch !== 'number' || !isFinite(pitch) || pitch < -24 || pitch > 24 || typeof reverse !== 'boolean') fail('INVALID_AUDIO_TRANSFORM', '피치는 -24~24, 역재생은 켜짐 또는 꺼짐이어야 합니다.');
        validateSource(item); var source = new File(item.path);
        var folder = new Folder(base().fsName + '/ProcessedAudio'), token = hash(canonical(source.fsName) + ':' + source.length + ':' + String(source.modified) + ':pcm16-v1:' + pitch + ':' + reverse);
        return { path: folder.fsName + '/audio-' + token + '.wav', sourceId: item.id, pitchShift: pitch, reverse: reverse, folder: folder };
    }
    function validateWave(file) {
        if (!file.exists || file.length < 44) fail('AUDIO_RENDER_REQUIRED', '변형된 오디오 파일이 준비되지 않았습니다.');
        file.encoding = 'BINARY'; if (!file.open('r')) fail('AUDIO_RENDER_UNREADABLE', '변형된 오디오 파일을 읽을 수 없습니다.');
        var header; try { header = file.read(12); } finally { file.close(); }
        if (header.slice(0,4) !== 'RIFF' || header.slice(8,12) !== 'WAVE') fail('AUDIO_RENDER_INVALID', '변형된 오디오 파일은 올바른 WAV 파일이어야 합니다.');
    }
    function prepareAudioImport(options) {
        var item = find(options.id, options.sourceStamp), plan = audioPlan(item, options.options || {}), file = new File(plan.path); ensure(plan.folder);
        if (file.exists) validateWave(file); delete plan.folder; plan.alreadyExists = file.exists; return plan;
    }
    function importSequence(item, options, copyNextToProject) {
        if (!$.cpSequence) fail('SEQUENCE_UNAVAILABLE', '이미지 시퀀스를 가져올 수 없습니다.');
        var opts = {}; if (options.conformFrameRate !== undefined) opts.conformFrameRate = options.conformFrameRate; if (options.forceAlphabetical !== undefined) opts.forceAlphabetical = options.forceAlphabetical;
        var group = item.sequence, prepared = $.cpSequence.plan(group, opts), current = $.cpSequence.scan(new File(prepared.file)), fresh = null, i;
        for (i = 0; i < current.groups.length; i++) if (current.groups[i].id === group.id) fresh = current.groups[i];
        if (!fresh || !fresh.importable || fresh.files.length !== group.files.length) fail('SEQUENCE_STALE', '시퀀스 파일 목록이 바뀌었습니다. 다시 불러오세요.');
        for (i = 0; i < group.files.length; i++) if (canonical(group.files[i].path) !== canonical(fresh.files[i].path)) fail('SEQUENCE_STALE', '시퀀스 파일 목록이 바뀌었습니다. 다시 불러오세요.');
        if (!copyNextToProject) return $.cpSequence.importSequence(fresh, opts);
        if (!app.project.file) fail('PROJECT_SAVE_REQUIRED', '시퀀스를 프로젝트 옆에 복사하려면 프로젝트를 먼저 저장하세요.');
        var mediaRoot = new Folder(app.project.file.parent.fsName + '/Contentrium Media'); ensure(mediaRoot);
        var folder; do { folder = new Folder(mediaRoot.fsName + '/sequence-' + new Date().getTime().toString(36) + '-' + (++serial)); } while (folder.exists);
        ensure(folder); var created = [];
        try {
            for (i = 0; i < fresh.files.length; i++) {
                var source = new File(fresh.files[i].path), target = new File(folder.fsName + '/' + source.name), prefix = canonical(folder.fsName) + '/';
                if (canonical(target.fsName).indexOf(prefix) !== 0 || canonical(target.parent.fsName) !== canonical(folder.fsName)) fail('SEQUENCE_COPY_PATH', '시퀀스 복사 경로가 올바르지 않습니다.');
                created.push(target); if (!source.copy(target.fsName)) fail('SEQUENCE_COPY_FAILED', '시퀀스 프레임을 복사할 수 없습니다.');
            }
            var copied = $.cpSequence.scan(folder); if (copied.sequences.length !== 1) fail('SEQUENCE_COPY_FAILED', '복사한 시퀀스를 확인할 수 없습니다.');
            var imported = $.cpSequence.importSequence(copied.sequences[0], opts); imported.receipt.copiedFolder = folder.fsName; return imported;
        } catch (error) {
            for (i = created.length - 1; i >= 0; i--) try { if (canonical(created[i].parent.fsName) === canonical(folder.fsName) && created[i].exists) created[i].remove(); } catch (ignoreCleanup) {}
            try { folder.remove(); } catch (ignoreFolderCleanup) {} throw error;
        }
    }
    function importMedia(item, options) {
        options = options || {}; var sourceItem = item; validateSource(item);
        if (item.kind === 'image-sequence') return importSequence(item, options, getSettings().settings.copyUserLibFootageNextToProject);
        if (item.kind === 'audio' && (options.pitchShift || options.reverse || options.renderedAudioPath)) {
            var audio = audioPlan(item, options);
            if (typeof options.renderedAudioPath !== 'string' || canonical(options.renderedAudioPath) !== canonical(audio.path)) fail('AUDIO_RENDER_REQUIRED', '현재 피치와 역재생 설정으로 오디오를 먼저 변환하세요.');
            validateWave(new File(audio.path)); sourceItem = { path: audio.path, kind: 'audio' };
        }
        var f = mediaFile(sourceItem, getSettings().settings.copyUserLibFootageNextToProject), i, existing;
        if (item.kind !== 'project') for (i = 1; i <= app.project.numItems; i++) { existing = app.project.item(i); if (existing.file && canonical(existing.file.fsName) === canonical(f.fsName)) { validateSource(item); return { item: existing, reused: true }; } }
        var before = {}; for (i = 1; i <= app.project.numItems; i++) before[String(app.project.item(i).id)] = true;
        validateSource(item);
        var imported = app.project.importFile(new ImportOptions(f)), comps = [];
        if (item.kind === 'project') {
            for (i = 1; i <= app.project.numItems; i++) { var candidate = app.project.item(i); if (!before[String(candidate.id)] && candidate instanceof CompItem) comps.push(candidate); }
            if (options && options.compositionName) for (i = 0; i < comps.length; i++) if (comps[i].name === options.compositionName) return { item: comps[i], importedFolder: imported, compositions: comps };
            if (comps.length === 1) return { item: comps[0], importedFolder: imported, compositions: comps };
            return { item: null, importedFolder: imported, compositions: comps };
        }
        return { item: imported };
    }
    $.cpWorkspace = { configure: function (value) { codec = value; }, getSettings: getSettings, setSettings: setSettings, getLibrary: getLibrary, previewDestination: previewDestination, libraryPreviewDestination: libraryPreviewDestination, addFolder: addFolder, removeFolder: removeFolder, savePreset: savePreset, readPreset: readPreset, removeItem: removeItem, find: find, importMedia: importMedia, sourceStamp: sourceStamp, prepareAudioImport: prepareAudioImport, loadPropertySets: loadPropertySets, savePropertySets: savePropertySets };
}());
