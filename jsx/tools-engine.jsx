(function () {
    function fail(code, message) { var e = new Error(message); e.code = code; throw e; }
    function array(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
    function copy(v) { if (!array(v)) return v; var a = []; for (var i = 0; i < v.length; i++) a.push(copy(v[i])); return a; }
    function number(v, fallback) { var n = Number(v); return isFinite(n) ? n : fallback; }
    function layers(comp) { var out = []; for (var i = 1; i <= comp.numLayers; i++) { var l = comp.layer(i); if (l.selected) out.push(l); } return out; }
    function walk(group, path, layer, out) {
        for (var i = 1; i <= group.numProperties; i++) {
            var p = group.property(i), next = path.concat([group.propertyType === PropertyType.INDEXED_GROUP ? p.name : (p.matchName || p.name)]);
            if (p.propertyType === PropertyType.PROPERTY) {
                var selected = p.selectedKeys || [];
                if (p.selected && selected.length) out.push({ layer: layer, property: p, path: next, indices: copy(selected) });
            } else if (p.numProperties) walk(p, next, layer, out);
        }
    }
    function records(comp) { var ls = layers(comp), out = []; for (var i = 0; i < ls.length; i++) walk(ls[i], [], ls[i], out); return out; }
    function editable(list) { for (var i = 0; i < list.length; i++) if (list[i].layer.locked) fail('LAYER_LOCKED', '잠긴 레이어를 편집할 수 없습니다: ' + list[i].layer.name); }
    function easeCopy(a, reverse) { var out = []; for (var i = 0; i < a.length; i++) out.push(new KeyframeEase(a[i].speed * (reverse ? -1 : 1), Math.max(.1, Math.min(100, a[i].influence)))); return out; }
    function capture(p, i) {
        var key = { time: p.keyTime(i), value: copy(p.keyValue(i)), easeIn: easeCopy(p.keyInTemporalEase(i)), easeOut: easeCopy(p.keyOutTemporalEase(i)), typeIn: p.keyInInterpolationType(i), typeOut: p.keyOutInterpolationType(i) };
        var names = ['TemporalAutoBezier', 'TemporalContinuous', 'Label'], n;
        if (p.isSpatial) names = names.concat(['InSpatialTangent', 'OutSpatialTangent', 'SpatialAutoBezier', 'SpatialContinuous', 'Roving']);
        for (n = 0; n < names.length; n++) if (typeof p['key' + names[n]] === 'function') key[names[n]] = copy(p['key' + names[n]](i));
        var selected = p.selectedKeys || []; key.selected = false; for (n = 0; n < selected.length; n++) if (selected[n] === i) key.selected = true;
        return key;
    }
    function snapshots(rec) { var out = []; for (var i = 0; i < rec.indices.length; i++) out.push(capture(rec.property, rec.indices[i])); return out; }
    function write(p, i, k, reverse) {
        p.setValueAtKey(i, copy(k.value));
        p.setTemporalEaseAtKey(i, easeCopy(reverse ? k.easeOut : k.easeIn, reverse), easeCopy(reverse ? k.easeIn : k.easeOut, reverse));
        p.setInterpolationTypeAtKey(i, reverse ? k.typeOut : k.typeIn, reverse ? k.typeIn : k.typeOut);
        if (k.InSpatialTangent && k.OutSpatialTangent && p.setSpatialTangentsAtKey) p.setSpatialTangentsAtKey(i, copy(reverse ? k.OutSpatialTangent : k.InSpatialTangent), copy(reverse ? k.InSpatialTangent : k.OutSpatialTangent));
        var names = ['TemporalAutoBezier', 'TemporalContinuous', 'SpatialAutoBezier', 'SpatialContinuous', 'Roving', 'Label'];
        for (var n = 0; n < names.length; n++) if (k.hasOwnProperty(names[n]) && typeof p['set' + names[n] + 'AtKey'] === 'function') p['set' + names[n] + 'AtKey'](i, k[names[n]]);
        if (p.setSelectedAtKey) p.setSelectedAtKey(i, k.selected);
    }
    function selectedAt(p, indices) { for (var i = 1; i <= p.numKeys; i++) p.setSelectedAtKey(i, false); for (i = 0; i < indices.length; i++) p.setSelectedAtKey(indices[i], true); }
    function findKey(p, time) { for (var i = 1; i <= p.numKeys; i++) if (Math.abs(p.keyTime(i) - time) < 1e-7) return i; return 0; }
    function exactKey(p, time) { for (var i = 1; i <= p.numKeys; i++) if (p.keyTime(i) === time) return i; return 0; }
    function recordedKey(p, time) { var index = exactKey(p, time); if (index) return index; fail('KEY_TIME_CHANGED', '생성한 키프레임의 시각이 변경되었습니다.'); }
    function addNewKey(p, time) {
        if (typeof time !== 'number' || !isFinite(time)) fail('INVALID_KEY_TIME', '키프레임 시각은 유한한 숫자여야 합니다.');
        var before = p.numKeys, index = p.addKey(time);
        if (p.numKeys !== before + 1) fail('KEY_TIME_CONFLICT', 'Keyframe collision: 호스트가 변환한 시각에 다른 키프레임이 있습니다.');
        return p.keyTime(index);
    }
    function restoreKeys(p, data) {
        var times = [], i, j, keep;
        // Restore the original keys before removing additions: Time Remap must never lose its final key.
        for (i = 0; i < data.length; i++) { var index = exactKey(p, data[i].time) || p.addKey(data[i].time); if (p.keyTime(index) !== data[i].time) fail('KEY_RESTORE_PRECISION', '호스트가 원래 키프레임 시각을 복원하지 못했습니다.'); times.push(p.keyTime(index)); }
        for (i = p.numKeys; i >= 1; i--) { keep = false; for (j = 0; j < times.length; j++) if (p.keyTime(i) === times[j]) keep = true; if (!keep) p.removeKey(i); }
        for (i = 0; i < data.length; i++) write(p, recordedKey(p, times[i]), data[i], false);
    }
    function keyTransaction(recs, fn) {
        var saved = [], touched = [], i, j;
        for (i = 0; i < recs.length; i++) { var data = []; for (j = 1; j <= recs[i].property.numKeys; j++) data.push(capture(recs[i].property, j)); saved.push(data); }
        function touch(rec) { for (var n = 0; n < recs.length; n++) if (recs[n] === rec) touched[n] = true; }
        try { return fn(touch); }
        catch (error) {
            for (i = recs.length - 1; i >= 0; i--) if (touched[i]) try { restoreKeys(recs[i].property, saved[i]); } catch (rollback) { error.rollbackError = String(rollback.message || rollback); }
            throw error;
        }
    }
    function checkDestination(rec, times, removesSource) {
        for (var i = 0; i < times.length; i++) {
            var existing = findKey(rec.property, times[i]), allowed = !existing;
            if (existing && removesSource) for (var j = 0; j < rec.indices.length; j++) if (rec.indices[j] === existing) allowed = true;
            if (!allowed) fail('KEY_TIME_CONFLICT', 'Keyframe collision: 대상 시각에 다른 키프레임이 있습니다.');
        }
    }
    function move(rec, delta) {
        if (!delta) return 0;
        var p = rec.property, data = snapshots(rec), i, guardIndex = -1, guardTime = null, times = [];
        // Time-remap must retain one key while the selected keys are moved.
        // Create the outermost actual destination first; no arbitrary sentinel time is needed.
        if (p.matchName === 'ADBE Time Remapping' && rec.indices.length === p.numKeys) { guardIndex = delta > 0 ? data.length - 1 : 0; guardTime = addNewKey(p, data[guardIndex].time + delta); }
        for (i = rec.indices.length - 1; i >= 0; i--) p.removeKey(rec.indices[i] + (guardIndex >= 0 && delta < 0 ? 1 : 0));
        for (i = 0; i < data.length; i++) { var actual = i === guardIndex ? guardTime : addNewKey(p, data[i].time + delta); times.push(actual); p.setValueAtKey(recordedKey(p, actual), copy(data[i].value)); }
        var indices = []; for (i = 0; i < data.length; i++) { var index = recordedKey(p, times[i]); write(p, index, data[i], false); indices.push(index); }
        selectedAt(p, indices); return data.length;
    }
    function deltaValue(a, b, channels) {
        if (typeof a === 'number' && typeof b === 'number') return [b - a];
        if (!array(a) || !array(b) || a.length !== b.length) return null;
        var out = [], sum = 0;
        for (var i = 0; i < a.length; i++) { if (typeof a[i] !== 'number' || typeof b[i] !== 'number') return null; out.push(b[i] - a[i]); sum += out[i] * out[i]; }
        return channels === 1 ? [Math.sqrt(sum)] : out;
    }
    function normalizedSide(p, index, before, eases) {
        var other = index + (before ? -1 : 1); if (other < 1 || other > p.numKeys) return null;
        var dt = Math.abs(p.keyTime(index) - p.keyTime(other));
        var dv = before ? deltaValue(p.keyValue(other), p.keyValue(index), eases.length) : deltaValue(p.keyValue(index), p.keyValue(other), eases.length), out = [];
        for (var i = 0; i < eases.length; i++) { var scaled = eases[i].speed * dt, d = dv ? dv[Math.min(i, dv.length - 1)] : null; out.push({ influence: eases[i].influence, scaled: scaled, normalized: dv ? (d ? scaled / d : 0) : null }); }
        return out;
    }
    function clipboardCapture(rec) {
        var data = [], p = rec.property;
        for (var i = 0; i < rec.indices.length; i++) {
            var index = rec.indices[i], k = capture(p, index);
            k.normalIn = normalizedSide(p, index, true, k.easeIn); k.normalOut = normalizedSide(p, index, false, k.easeOut); data.push(k);
        }
        return { type: p.propertyValueType, keys: data };
    }
    function restoredEase(p, index, before, source, existing) {
        var other = index + (before ? -1 : 1);
        if (!source || other < 1 || other > p.numKeys) return easeCopy(existing);
        var dt = Math.abs(p.keyTime(index) - p.keyTime(other)), dv = before ? deltaValue(p.keyValue(other), p.keyValue(index), existing.length) : deltaValue(p.keyValue(index), p.keyValue(other), existing.length), out = [];
        for (var i = 0; i < existing.length; i++) {
            var item = source[Math.min(i, source.length - 1)], speed = item.scaled / dt;
            if (item.normalized !== null && dv) speed = item.normalized * dv[Math.min(i, dv.length - 1)] / dt;
            out.push(new KeyframeEase(isFinite(speed) ? speed : 0, Math.max(.1, Math.min(100, item.influence))));
        }
        return out;
    }
    function selectionLayers(comp, options) {
        var selected = layers(comp), ids = options.selectionOrder, out = [], i, j, found;
        if (!array(ids)) fail('SELECTION_ORDER_REQUIRED', '관찰한 레이어 선택 순서가 없습니다. 선택을 비운 뒤 레이어를 하나씩 선택하세요.');
        if (ids.length !== selected.length) fail('SELECTION_ORDER_CHANGED', '레이어 선택이 변경되었습니다. 선택 순서를 다시 확인하세요.');
        for (i = 0; i < ids.length; i++) {
            if (typeof ids[i] !== 'number' || !isFinite(ids[i]) || ids[i] <= 0 || Math.floor(ids[i]) !== ids[i]) fail('SELECTION_ORDER_INVALID', '선택 순서에는 유효한 레이어 ID가 필요합니다.');
            for (j = 0; j < i; j++) if (ids[j] === ids[i]) fail('SELECTION_ORDER_INVALID', '선택 순서에 중복 레이어가 있습니다.');
            found = null; for (j = 0; j < selected.length; j++) if (selected[j].id === ids[i]) found = selected[j];
            if (!found) fail('SELECTION_ORDER_CHANGED', '선택 순서와 현재 선택된 레이어가 다릅니다.');
            out.push(found);
        }
        return out;
    }
    function ordered(list, order, comp, options, propertyRecords) {
        var out = list.slice(), i;
        if (!order) order = 'ascending';
        if (order === 'selection' || order === 'inSelectionOrder') {
            var selected = selectionLayers(comp, options), result = [];
            for (i = 0; i < selected.length; i++) for (var n = 0; n < list.length; n++) { var owner = list[n]; if (propertyRecords) owner = list[n].layer; if (owner === selected[i]) result.push(list[n]); }
            return result;
        }
        if (order !== 'ascending' && order !== 'descending' && order !== 'random') fail('INVALID_ORDER', '지원하지 않는 정렬 순서입니다.');
        if (order === 'descending') out.reverse();
        if (order === 'random') for (i = out.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = out[i]; out[i] = out[j]; out[j] = t; }
        return out;
    }
    function atTime(rec, comp) { return typeof rec.layer.time === 'number' ? rec.layer.time : comp.time; }
    function keyframes(comp, action, options) {
        var recs = records(comp), i, j, p, k, source, count = 0;
        if (!recs.length) fail('NO_SELECTED_KEYS', '키프레임을 선택하세요.');
        if (action === 'copy') { var clips = []; for (i = 0; i < recs.length; i++) clips.push(clipboardCapture(recs[i])); $.cpToolClipboard = clips; return { copiedProperties: clips.length }; }
        if (action === 'selectByOrder') {
            var sourceLayer = recs[0].layer, ls = layers(comp), missing = 0;
            for (i = 1; i < recs.length; i++) if (recs[i].layer !== sourceLayer) fail('MULTIPLE_KEY_SOURCES', '기준 키프레임은 한 레이어에서만 선택하세요.');
            for (i = 0; i < ls.length; i++) if (ls[i] !== sourceLayer) for (j = 0; j < recs.length; j++) {
                p = ls[i]; for (var n = 0; p && n < recs[j].path.length; n++) p = p.property(recs[j].path[n]);
                if (!p) { missing++; continue; }
                for (n = 0; n < recs[j].indices.length; n++) {
                    var index = options.from === 'last' ? p.numKeys + recs[j].indices[n] - recs[j].property.numKeys : recs[j].indices[n];
                    if (index >= 1 && index <= p.numKeys) { p.setSelectedAtKey(index, true); count++; } else missing++;
                }
            }
            return { changedKeys: count, unmatchedKeys: missing };
        }
        editable(recs);
        return keyTransaction(recs, function (touch) {
        if (action === 'pasteValue' || action === 'pasteEase') {
            var cb = $.cpToolClipboard;
            if (!cb || !cb.length) fail('EMPTY_CLIPBOARD', '먼저 키프레임을 복사하세요.');
            for (i = 0; i < recs.length; i++) {
                source = cb[i % cb.length];
                if (recs[i].indices.length < source.keys.length) fail('TOO_FEW_KEYS', '대상에 복사한 키프레임 수 이상을 선택하세요.');
                if (action === 'pasteValue' && recs[i].property.propertyValueType !== source.type) fail('VALUE_TYPE_MISMATCH', '같은 종류의 속성에 값을 붙여넣으세요.');
            }
            for (i = 0; i < recs.length; i++) {
                touch(recs[i]);
                p = recs[i].property; source = cb[i % cb.length];
                for (j = 0; j < recs[i].indices.length; j++) {
                    var ix = recs[i].indices[j]; k = source.keys[j % source.keys.length];
                    if (action === 'pasteValue') p.setValueAtKey(ix, copy(k.value));
                    else { p.setTemporalEaseAtKey(ix, restoredEase(p, ix, true, k.normalIn, p.keyInTemporalEase(ix)), restoredEase(p, ix, false, k.normalOut, p.keyOutTemporalEase(ix))); p.setInterpolationTypeAtKey(ix, k.typeIn, k.typeOut); }
                    count++;
                }
            }
        } else if (action === 'reverse') {
            for (i = 0; i < recs.length; i++) { var data = snapshots(recs[i]); if (data.length > 1) touch(recs[i]); for (j = 0; data.length > 1 && j < data.length; j++) { write(recs[i].property, recs[i].indices[j], data[data.length - j - 1], true); count++; } }
        } else if (action === 'clone' || action === 'mirror') {
            var first = Infinity, last = -Infinity, all = [];
            for (i = 0; i < recs.length; i++) { data = snapshots(recs[i]); all.push(data); first = Math.min(first, data[0].time); last = Math.max(last, data[data.length - 1].time); }
            for (i = 0; i < recs.length; i++) { var times = []; for (j = 0; j < all[i].length; j++) times.push(atTime(recs[i], comp) + (action === 'mirror' ? last - all[i][j].time : all[i][j].time - first)); checkDestination(recs[i], times, false); }
            for (i = 0; i < recs.length; i++) {
                touch(recs[i]); var newTimes = []; p = recs[i].property;
                for (j = 0; j < all[i].length; j++) { k = all[i][j]; var time = atTime(recs[i], comp) + (action === 'mirror' ? last - k.time : k.time - first), actual = addNewKey(p, time); p.setValueAtKey(recordedKey(p, actual), copy(k.value)); newTimes.push(actual); }
                for (j = 0; j < all[i].length; j++) { write(p, recordedKey(p, newTimes[j]), all[i][j], action === 'mirror'); count++; }
            }
        } else if (action === 'alignFirst' || action === 'alignLast' || action === 'shift') {
            recs = ordered(recs, options.order, comp, options, true); var deltas = [];
            for (i = 0; i < recs.length; i++) {
                p = recs[i].property;
                var delta = action === 'shift' ? (parseInt(options.frames, 10) || 0) * comp.frameDuration * i : atTime(recs[i], comp) - p.keyTime(action === 'alignLast' ? recs[i].indices[recs[i].indices.length - 1] : recs[i].indices[0]);
                var destinations = []; for (j = 0; j < recs[i].indices.length; j++) destinations.push(p.keyTime(recs[i].indices[j]) + delta);
                checkDestination(recs[i], destinations, true); deltas.push(delta);
            }
            for (i = 0; i < recs.length; i++) { if (deltas[i]) touch(recs[i]); count += move(recs[i], deltas[i]); }
        } else fail('UNKNOWN_ACTION', '지원하지 않는 키프레임 작업입니다.');
        return { changedKeys: count, changedProperties: recs.length };
        });
    }
    function easingRecordsMode(recs) {
        if (!recs.length) return 'none';
        for (var i = 0; i < recs.length; i++) {
            var keys = recs[i].indices, run = 1;
            if (keys.length < 2) return 'single';
            for (var j = 1; j < keys.length; j++) {
                if (keys[j] - keys[j - 1] === 1) run++;
                else { if (run < 2) return 'single'; run = 1; }
            }
            // The original selection rule accepts a final singleton after a completed run.
        }
        return 'pairs';
    }
    function easingSelectionMode(comp) { return easingRecordsMode(records(comp)); }
    function easing(comp, options) {
        var recs = records(comp), changed = 0, direction = options.direction || 'both', mode = options.mode || 'auto';
        if (!recs.length) fail('NO_SELECTED_KEYS', '키프레임을 선택하세요.'); editable(recs);
        if (mode === 'auto') mode = easingRecordsMode(recs);
        return keyTransaction(recs, function (touch) {
        function apply(p, index, before, influence) {
            touch(recs[i]);
            var ins = easeCopy(p.keyInTemporalEase(index)), outs = easeCopy(p.keyOutTemporalEase(index)), target = before ? ins : outs;
            for (var k = 0; k < target.length; k++) target[k] = new KeyframeEase(0, Math.max(.1, Math.min(100, influence)));
            var ti = p.keyInInterpolationType(index), to = p.keyOutInterpolationType(index), type = influence === 0 ? KeyframeInterpolationType.LINEAR : KeyframeInterpolationType.BEZIER;
            if (before) ti = type; else to = type;
            p.setTemporalEaseAtKey(index, ins, outs); p.setInterpolationTypeAtKey(index, ti, to);
            if ((!p.isSpatial || !p.keyRoving || !p.keyRoving(index)) && (mode !== 'pairs' || direction === 'both')) { if (p.setTemporalContinuousAtKey) p.setTemporalContinuousAtKey(index, false); if (p.setTemporalAutoBezierAtKey) p.setTemporalAutoBezierAtKey(index, false); }
            changed++;
        }
        for (var i = 0; i < recs.length; i++) {
            var p = recs[i].property, keys = recs[i].indices, pairs = mode === 'pairs', j;
            for (j = 0; j < keys.length; j++) {
                if (pairs) {
                    if (j + 1 < keys.length && keys[j + 1] === keys[j] + 1) { if (direction !== 'out') apply(p, keys[j], false, number(options.influenceIn, 50)); if (direction !== 'in') apply(p, keys[j + 1], true, number(options.influenceOut, 50)); }
                } else { if (direction !== 'out') apply(p, keys[j], true, number(options.influenceIn, 50)); if (direction !== 'in') apply(p, keys[j], false, number(options.influenceOut, 50)); }
            }
        }
        return { changedSides: changed };
        });
    }
    function sampled(p, time) { return p.valueAtTime ? p.valueAtTime(time, false) : p.value; }
    function rotate(v, axis, angle) {
        var r = angle * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), a = axis === 0 ? 1 : 0, b = axis === 2 ? 1 : 2, out = v.slice();
        if (axis === 1) { out[0] = v[0] * c + v[2] * s; out[2] = -v[0] * s + v[2] * c; } else { out[a] = v[a] * c - v[b] * s; out[b] = v[a] * s + v[b] * c; } return out;
    }
    function anchorWorldVector(layer, delta, at) {
        var v = [delta[0], delta[1], delta.length > 2 ? delta[2] : 0], current = layer;
        while (current) {
            var tr = current.property('ADBE Transform Group'), scale = sampled(tr.property('ADBE Scale'), at), prop;
            v = [v[0] * scale[0] / 100, v[1] * scale[1] / 100, v[2] * (scale.length > 2 ? scale[2] : 100) / 100];
            prop = tr.property('ADBE Rotate Z'); if (prop) v = rotate(v, 2, sampled(prop, at));
            if (current.threeDLayer) {
                prop = tr.property('ADBE Rotate Y'); if (prop) v = rotate(v, 1, sampled(prop, at));
                prop = tr.property('ADBE Rotate X'); if (prop) v = rotate(v, 0, sampled(prop, at));
                prop = tr.property('ADBE Orientation'); var orient = prop ? sampled(prop, at) : [0, 0, 0];
                for (var axis = 2; axis >= 0; axis--) v = rotate(v, axis, orient[axis]);
            }
            current = current.parent;
        }
        return v;
    }
    function anchorBounds(layer, at) {
        var rect = layer.sourceRectAtTime ? layer.sourceRectAtTime(at, false) : { left: 0, top: 0, width: layer.width, height: layer.height };
        var masks = layer.property('ADBE Mask Parade'), first = null, shapes = [], i, j, mask, shape, mode;
        if (!masks || !masks.numProperties) return rect;
        var none = typeof MaskMode !== 'undefined' ? MaskMode.NONE : 6812, subtract = typeof MaskMode !== 'undefined' ? MaskMode.SUBTRACT : 6814;
        for (i = 1; i <= masks.numProperties; i++) {
            mask = masks.property(i); shape = sampled(mask.property('ADBE Mask Shape'), at);
            if (!shape || !shape.closed) continue;
            shapes.push(shape); mode = mask.maskMode;
            if (mode !== none) {
                if (first === null) first = mode;
                if (mask.inverted) return rect;
            }
        }
        if (first === null || first === subtract) return rect;
        // Retained native fixtures use closed control-point hulls, including
        // NONE/SUBTRACT shapes once the active-mask gate above admits bounds.
        var left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
        function include(x, y) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
        for (i = 0; i < shapes.length; i++) {
            shape = shapes[i];
            for (j = 0; j < shape.vertices.length; j++) {
                var v = shape.vertices[j], incoming = shape.inTangents[j], outgoing = shape.outTangents[j];
                include(v[0], v[1]); include(v[0] + incoming[0], v[1] + incoming[1]); include(v[0] + outgoing[0], v[1] + outgoing[1]);
            }
        }
        left = Math.max(rect.left, left); top = Math.max(rect.top, top);
        right = Math.min(rect.left + rect.width, right); bottom = Math.min(rect.top + rect.height, bottom);
        if (right < left || bottom < top) return { left: 0, top: 0, width: 0, height: 0 };
        return { left: left, top: top, width: right - left, height: bottom - top };
    }
    function anchor(comp, options) {
        var ls = layers(comp), changed = 0, plans = [], journal = [];
        if (!ls.length) fail('NO_SELECTED_LAYERS', '레이어를 선택하세요.');
        function remember(property) { var row={property:property,value:copy(property.value),keys:[],touched:false};for(var k=1;k<=property.numKeys;k++)row.keys.push(capture(property,k));journal.push(row);return row; }
        for (var i = 0; i < ls.length; i++) {
            var l = ls[i], tr = l.property('ADBE Transform Group'), a = tr && tr.property('ADBE Anchor Point'), p = tr && tr.property('ADBE Position');
            if (!a || !p || l.locked) fail('ANCHOR_UNAVAILABLE', '앵커 포인트를 변경할 수 없는 레이어입니다: ' + l.name);
            if (a.expressionEnabled || p.expressionEnabled) fail('ANCHOR_EXPRESSION', '앵커 또는 위치에 사용자 표현식이 있습니다. 표현식을 보존하기 위해 이동을 중단했습니다.');
            if (p.dimensionsSeparated) for (var axis = 0; axis < (l.threeDLayer ? 3 : 2); axis++) if (p.getSeparationFollower(axis).expressionEnabled) fail('ANCHOR_EXPRESSION', '분리된 위치에 사용자 표현식이 있습니다. 표현식을 보존하기 위해 이동을 중단했습니다.');
        }
        for (i = 0; i < ls.length; i++) {
            l = ls[i]; tr = l.property('ADBE Transform Group'); a = tr.property('ADBE Anchor Point'); p = tr.property('ADBE Position');
            var t = comp.time, rect = anchorBounds(l, t), old = sampled(a, t), target = [rect.left + rect.width * (number(options.x, 0) + 1) / 2, rect.top + rect.height * (number(options.y, 0) + 1) / 2];
            if (old.length === 3) target.push(old[2]);
            var deltaA = []; for (var d = 0; d < old.length; d++) deltaA.push(target[d] - old[d]);
            var plan={layer:l,transform:tr,anchor:a,position:p,time:t,old:old,target:target,delta:deltaA,anchorRecord:remember(a),positionRecords:[]};
            if(p.dimensionsSeparated){plan.separatedTimes=[];for(d=0;d<(l.threeDLayer?3:2);d++){var followerRecord=remember(p.getSeparationFollower(d));plan.positionRecords.push(followerRecord);for(var fk=0;fk<followerRecord.keys.length;fk++){var ft=followerRecord.keys[fk].time,exists=false;for(var fi=0;fi<plan.separatedTimes.length;fi++)if(plan.separatedTimes[fi]===ft)exists=true;if(!exists)plan.separatedTimes.push(ft);}}plan.separatedTimes.sort(function(a,b){return a-b;});}else plan.positionRecords.push(remember(p));
            plans.push(plan);
        }
        try { for (i = 0; i < plans.length; i++) {
            plan=plans[i];l=plan.layer;tr=plan.transform;a=plan.anchor;p=plan.position;t=plan.time;old=plan.old;target=plan.target;deltaA=plan.delta;
            function add(v, delta) { var r = []; for (var x = 0; x < v.length; x++) r.push(v[x] + delta[x]); return r; }
            plan.anchorRecord.touched=true;
            if (options.mode === 'insertKeyframes' && a.numKeys) { a.setValueAtTime(t, target); }
            else if (a.numKeys) { for (var ki = 1; ki <= a.numKeys; ki++) a.setValueAtKey(ki, add(a.keyValue(ki), deltaA)); }
            else a.setValue(target);
            // Host interpolation can change after translating keys. Reuse the actual playhead displacement for every Position key.
            var movedAnchor = sampled(a, t), actualDelta = [];
            for (d = 0; d < old.length; d++) actualDelta.push(movedAnchor[d] - old[d]);
            var compensation = anchorWorldVector(l, actualDelta, t);
            if (p.dimensionsSeparated) {
                // Compatibility with observed native stream behavior: keyed
                // insertion samples all active axes without compensation. In
                // modify mode, missing original keys use preceding raw-axis
                // carry and static axes accumulate once per original key time.
                for(d=0;d<plan.positionRecords.length;d++)plan.positionRecords[d].touched=true;
                if(options.mode==='insertKeyframes'&&plan.separatedTimes.length){for(d=0;d<plan.positionRecords.length;d++){var fp=plan.positionRecords[d].property;fp.setValueAtTime(t,sampled(fp,t));}}
                else if(!plan.separatedTimes.length){for(d=0;d<plan.positionRecords.length;d++){fp=plan.positionRecords[d].property;fp.setValue(fp.value+compensation[d]);}}
                else for(var st=0;st<plan.separatedTimes.length;st++){var rawCarry=0,time=plan.separatedTimes[st];for(d=0;d<plan.positionRecords.length;d++){var original=plan.positionRecords[d];fp=original.property;if(original.keys.length){for(var ok=0;ok<original.keys.length;ok++)if(original.keys[ok].time===time){rawCarry=original.keys[ok].value;break;}var currentKey=exactKey(fp,time);if(currentKey)fp.setValueAtKey(currentKey,rawCarry+compensation[d]);else fp.setValueAtTime(time,rawCarry+compensation[d]);}else{rawCarry=fp.value;fp.setValue(rawCarry+compensation[d]);}}}
            } else {plan.positionRecords[0].touched=true;if (options.mode === 'insertKeyframes' && p.numKeys) p.setValueAtTime(t, add(sampled(p, t), compensation));
            else if (p.numKeys) { for (ki = 1; ki <= p.numKeys; ki++) p.setValueAtKey(ki, add(p.keyValue(ki), compensation)); }
            else p.setValue(add(p.value, compensation));}
            changed++;
        }} catch(error) {for(var ri=journal.length-1;ri>=0;ri--)if(journal[ri].touched)try{var saved=journal[ri];if(saved.keys.length)restoreKeys(saved.property,saved.keys);else{for(var rk=saved.property.numKeys;rk>=1;rk--)saved.property.removeKey(rk);saved.property.setValue(copy(saved.value));}}catch(rollback){if(!error.rollbackError)error.rollbackError=String(rollback.message||rollback);}throw error;}
        return { changedLayers: changed };
    }
    function shifter(comp, action, options) {
        var ls = layers(comp), target = options.target || '', changed = 0, operations = [], i, j;
        if (!ls.length) fail('NO_SELECTED_LAYERS', '레이어를 선택하세요.');
        ls = ordered(ls, options.order, comp, options);
        if (!$.cpTimeline) fail('TIMELINE_UNAVAILABLE', '타임라인 엔진을 사용할 수 없습니다.');
        if (action !== 'shift' && action !== 'stagger' && action !== 'align') fail('UNKNOWN_ACTION', '지원하지 않는 이동 작업입니다.');
        var allowed = action === 'shift' ? ['inTransitions', 'outTransitions', 'inTransitionMarkers', 'outTransitionMarkers'] : ['layers', 'inTransitions', 'outTransitions'];
        if (action === 'align') allowed = ['inTransitionStarts', 'inTransitionEnds', 'inTransitionMarkers', 'outTransitionStarts', 'outTransitionEnds', 'outTransitionMarkers'];
        var validTarget = false; for (i = 0; i < allowed.length; i++) if (allowed[i] === target) validTarget = true;
        if (!validTarget) fail('INVALID_SHIFT_TARGET', '지원하지 않는 이동 대상입니다.');
        function finiteTime(value) { if (typeof value !== 'number' || !isFinite(value)) fail('INVALID_SHIFT_TIME', '이동 시간은 유한한 초 단위 숫자여야 합니다.'); return value; }
        if (typeof comp.frameDuration !== 'number' || !isFinite(comp.frameDuration) || comp.frameDuration <= 0) fail('INVALID_FRAME_DURATION', '컴포지션의 실제 프레임 정보를 읽지 못했습니다.');
        if (action !== 'align') finiteTime(options.seconds);
        else finiteTime(comp.time);
        for (i = 0; i < ls.length; i++) {
            var l = ls[i]; if (l.locked) fail('LAYER_LOCKED', '잠긴 레이어를 편집할 수 없습니다.');
            var delta = 0; if (action !== 'align') delta = finiteTime(options.seconds * (action === 'stagger' ? i : 1));
            if (target === 'layers') { operations.push({ layer: l, delta: delta, layerShift: true }); continue; }
            var markers = $.cpTimeline.read(l) || [], role = target.indexOf('out') === 0 ? 'out' : 'in';
            for (j = 0; j < markers.length; j++) if (markers[j].role === role && markers[j].enabled !== false) {
                var marker = markers[j], markerOnly = target.indexOf('Markers') >= 0, boundary = role === 'in' ? l.inPoint : l.outPoint - comp.frameDuration;
                if (action === 'align') {
                    var ref = marker.time;
                    if (target.indexOf('Starts') >= 0 && role === 'in') ref = boundary;
                    if (target.indexOf('Ends') >= 0 && role === 'out') ref = boundary;
                    delta = finiteTime(comp.time - ref);
                }
                operations.push({ layer: l, marker: marker, delta: delta, markerOnly: markerOnly, role: role });
            }
        }
        var groups = [];
        function duplicateRows(rows) { var out = []; for (var r = 0; r < rows.length; r++) { var row = {}; for (var key in rows[r]) if (rows[r].hasOwnProperty(key)) row[key] = rows[r][key]; out.push(row); } return out; }
        function restoreRows(group, rows) {
            for (var r = 0; r < group.ids.length; r++) $.cpTimeline.remove(group.layer, group.ids[r]);
            for (r = 0; r < group.ids.length; r++) { var subset = []; for (var s = 0; s < rows.length; s++) if (rows[s].instanceId === group.ids[r]) subset.push(rows[s]); if (subset.length) $.cpTimeline.ensure(group.layer, group.ids[r], subset, { variantId: subset[0].variantId, scope: 'layer' }); }
        }
        for (i = 0; i < operations.length; i++) {
            var op = operations[i], g = null; if (!op.delta) continue;
            for (j = 0; j < groups.length; j++) if (groups[j].layer === op.layer) g = groups[j];
            if (!g) { var before = $.cpTimeline.read(op.layer); g = { layer: op.layer, before: duplicateRows(before), next: duplicateRows(before), ids: [], start: op.layer.startTime, inside: op.layer.inPoint, outside: op.layer.outPoint, boundaries: {} }; for (j = 0; j < before.length; j++) { var found = false; for (var n = 0; n < g.ids.length; n++) if (g.ids[n] === before[j].instanceId) found = true; if (!found) g.ids.push(before[j].instanceId); } groups.push(g); }
            if (op.layerShift) g.layerDelta = op.delta;
            else {
                for (j = 0; j < g.next.length; j++) if (g.next[j].instanceId === op.marker.instanceId && g.next[j].role === op.role) g.next[j].time = finiteTime(op.marker.time + op.delta);
                if (!op.markerOnly) { if (g.boundaries.hasOwnProperty(op.role) && Math.abs(g.boundaries[op.role] - op.delta) > 1e-7) fail('AMBIGUOUS_TRANSITIONS', '여러 전환의 기준 시각이 다릅니다. 마커별 정렬을 사용하세요.'); g.boundaries[op.role] = op.delta; }
            }
            changed++;
        }
        for (i = 0; i < groups.length; i++) {
            g = groups[i]; if (g.layerDelta) { finiteTime(g.start + g.layerDelta); finiteTime(g.inside + g.layerDelta); finiteTime(g.outside + g.layerDelta); continue; }
            finiteTime(g.inside + (g.boundaries['in'] || 0)); finiteTime(g.outside + (g.boundaries.out || 0));
            if ($.cpTimeline.validate) $.cpTimeline.validate(g.layer, 'shifter', g.next, { replaceInstanceIds: g.ids });
            if (g.inside + (g.boundaries['in'] || 0) >= g.outside + (g.boundaries.out || 0)) fail('INVALID_LAYER_SPAN', '전환을 이동하면 레이어 길이가 0이 됩니다.');
        }
        try {
            for (i = 0; i < groups.length; i++) {
                g = groups[i];
                if (g.layerDelta) g.layer.startTime = g.start + g.layerDelta;
                else {
                    restoreRows(g, g.next);
                    if (g.boundaries.hasOwnProperty('in') || g.boundaries.hasOwnProperty('out')) {
                        g.layer.inPoint = g.inside + (g.boundaries['in'] || 0);
                        g.layer.outPoint = g.outside + (g.boundaries.out || 0);
                    }
                }
            }
        } catch (error) {
            for (j = Math.min(i, groups.length - 1); j >= 0; j--) try { g = groups[j]; g.layer.startTime = g.start; g.layer.inPoint = g.inside; g.layer.outPoint = g.outside; restoreRows(g, g.before); } catch (rollback) { error.rollbackError = String(rollback.message || rollback); }
            throw error;
        }
        return { changedTransitions: changed };
    }
    $.cpTools = { records: records, easingSelectionMode: easingSelectionMode, action: function (comp, tool, action, options) {
        options = options || {};
        if (tool === 'keyframes') return keyframes(comp, action, options);
        if (tool === 'easing' && action === 'apply') return easing(comp, options);
        if (tool === 'anchor' && action === 'move') return anchor(comp, options);
        if (tool === 'shifter') return shifter(comp, action, options);
        fail('UNKNOWN_TOOL', '지원하지 않는 도구입니다.');
    } };
}());
