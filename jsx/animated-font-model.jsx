/* Independent animated-glyph geometry, layout and clock model. ES3; no host access. */
(function () {
    function fail(code, message, details) {
        var error = new Error(message);
        error.code = code;
        if (details) error.details = details;
        throw error;
    }
    function finite(value) { return typeof value === 'number' && isFinite(value); }
    function array(value) { return Object.prototype.toString.call(value) === '[object Array]'; }
    function object(value) { return value !== null && typeof value === 'object' && !array(value); }
    function own(value, key) { return Object.prototype.hasOwnProperty.call(value, key); }
    function scalar(value) {
        return finite(value) && value === Math.floor(value) && value >= 0 && value <= 1114111 && !(value >= 55296 && value <= 57343);
    }
    function requireValue(condition, code, message, details) { if (!condition) fail(code, message, details); }
    function positive(value) { return finite(value) && value > 0; }
    function nonnegative(value) { return finite(value) && value >= 0; }
    function pair(value, code, details) {
        requireValue(array(value) && value.length === 2 && finite(value[0]) && finite(value[1]), code, 'Expected a finite coordinate pair.', details);
        return [value[0], value[1]];
    }
    function color(value, code) {
        requireValue(array(value) && value.length === 3, code, 'Color requires three finite normalized channels.');
        var out = [], i;
        for (i = 0; i < 3; i++) {
            requireValue(finite(value[i]) && value[i] >= 0 && value[i] <= 1, code, 'Color channels must be between zero and one.');
            out.push(value[i]);
        }
        return out;
    }
    function textField(value, code) {
        requireValue(typeof value === 'string' && value.length > 0, code, 'Expected a nonempty string.');
        return value;
    }
    function copyPairs(values, code, details) {
        requireValue(array(values) && values.length > 0, code, 'A path requires coordinate arrays.', details);
        var out = [], i;
        for (i = 0; i < values.length; i++) out.push(pair(values[i], code, details));
        return out;
    }
    function interpolatePath(path, time) {
        var keys = path.keys, a = keys[0], b = a, i, j, q = 0, field, out = { closed: path.closed }, fields = ['vertices', 'inTangents', 'outTangents'];
        if (time >= keys[keys.length - 1].time) a = b = keys[keys.length - 1];
        else if (time > a.time) {
            for (i = 1; i < keys.length; i++) {
                b = keys[i];
                if (time <= b.time) { a = keys[i - 1]; q = (time - a.time) / (b.time - a.time); break; }
            }
        }
        if(q===1){a=b;q=0;}
        for (i = 0; i < fields.length; i++) {
            field = fields[i]; out[field] = [];
            for (j = 0; j < a[field].length; j++) out[field].push([
                a[field][j][0] + (b[field][j][0] - a[field][j][0]) * q,
                a[field][j][1] + (b[field][j][1] - a[field][j][1]) * q
            ]);
        }
        return out;
    }
    function sameGeometry(a, b) {
        var fields = ['vertices', 'inTangents', 'outTangents'], i, j;
        for (i = 0; i < fields.length; i++) for (j = 0; j < a[fields[i]].length; j++) {
            if (a[fields[i]][j][0] !== b[fields[i]][j][0] || a[fields[i]][j][1] !== b[fields[i]][j][1]) return false;
        }
        return true;
    }
    function validatePack(pack) {
        var code = 'INVALID_GLYPH_PACK', out, defaults, d, metrics, clock, glyph, path, key, details, count, previous, i, j, k, seen = {};
        requireValue(object(pack) && pack.schemaVersion === 1, code, 'Unknown animated-glyph pack schema.');
        requireValue(object(pack.provenance) && object(pack.metrics) && object(pack.clock) && object(pack.defaults) && object(pack.limits), code, 'Pack sections are missing.');
        metrics = pack.metrics; clock = pack.clock; d = pack.defaults;
        requireValue(positive(metrics.em) && finite(metrics.ascent) && finite(metrics.descent), code, 'Invalid em metrics.');
        requireValue(positive(clock.entryEnd) && finite(clock.bodyEnd) && finite(clock.duration) && clock.entryEnd < clock.bodyEnd && clock.bodyEnd < clock.duration, code, 'Source clock phases must be strictly increasing.');
        requireValue(positive(pack.limits.maxScalars) && Math.floor(pack.limits.maxScalars) === pack.limits.maxScalars, code, 'Invalid scalar limit.');
        requireValue(positive(d.duration) && positive(d.inSpeed) && positive(d.outSpeed) && positive(d.size) && finite(d.tracking) && nonnegative(d.inDelay) && nonnegative(d.outDelay), code, 'Invalid pack defaults.');
        requireValue(typeof d.inReverse === 'boolean' && typeof d.outReverse === 'boolean', code, 'Reverse defaults must be boolean.');
        defaults = { duration: d.duration, inSpeed: d.inSpeed, outSpeed: d.outSpeed, inDelay: d.inDelay, outDelay: d.outDelay,
            inReverse: d.inReverse, outReverse: d.outReverse, size: d.size, tracking: d.tracking, color: color(d.color, code) };
        out = { schemaVersion: 1, id: textField(pack.id, code), digest: textField(pack.digest, code), name: textField(pack.name, code),
            provenance: { author: textField(pack.provenance.author, code), license: textField(pack.provenance.license, code) },
            metrics: { em: metrics.em, ascent: metrics.ascent, descent: metrics.descent },
            clock: { entryEnd: clock.entryEnd, bodyEnd: clock.bodyEnd, duration: clock.duration }, defaults: defaults,
            limits: { maxScalars: pack.limits.maxScalars }, glyphs: [] };
        requireValue(array(pack.glyphs) && pack.glyphs.length > 0, code, 'Pack requires declared scalar coverage.');
        for (i = 0; i < pack.glyphs.length; i++) {
            glyph = pack.glyphs[i]; details = { index: i, scalar: glyph && glyph.codePoint };
            requireValue(object(glyph) && scalar(glyph.codePoint) && !own(seen, String(glyph.codePoint)), code, 'Glyph scalar must be unique and valid.', details);
            seen[String(glyph.codePoint)] = true;
            requireValue(nonnegative(glyph.advance) && (glyph.codePoint !== 32 || glyph.advance > 0), code, 'Invalid glyph advance.', details);
            requireValue(array(glyph.paths) && (glyph.codePoint === 32 || glyph.paths.length > 0), code, 'Visible glyph requires authored paths.', details);
            var normalizedGlyph = { codePoint: glyph.codePoint, advance: glyph.advance, paths: [] };
            for (j = 0; j < glyph.paths.length; j++) {
                path = glyph.paths[j];
                requireValue(object(path) && typeof path.closed === 'boolean' && array(path.keys) && path.keys.length >= 2, code, 'Invalid authored path.', details);
                var normalizedPath = { closed: path.closed, keys: [] };
                count = -1; previous = -1;
                for (k = 0; k < path.keys.length; k++) {
                    key = path.keys[k];
                    requireValue(object(key) && finite(key.time) && key.time >= 0 && key.time <= clock.duration && key.time > previous, code, 'Path key times must increase within the source clock.', details);
                    var normalizedKey = { time: key.time, vertices: copyPairs(key.vertices, code, details),
                        inTangents: copyPairs(key.inTangents, code, details), outTangents: copyPairs(key.outTangents, code, details) };
                    if (count < 0) count = normalizedKey.vertices.length;
                    requireValue(normalizedKey.vertices.length === count && normalizedKey.inTangents.length === count && normalizedKey.outTangents.length === count, code, 'Path topology must remain constant.', details);
                    normalizedPath.keys.push(normalizedKey); previous = key.time;
                }
                requireValue(normalizedPath.keys[0].time === 0 && previous === clock.duration, code, 'Source path keys must cover zero through source duration.', details);
                requireValue(sameGeometry(interpolatePath(normalizedPath, clock.entryEnd), interpolatePath(normalizedPath, clock.bodyEnd)), code, 'Source loop boundary geometry must match.', details);
                normalizedGlyph.paths.push(normalizedPath);
            }
            out.glyphs.push(normalizedGlyph);
        }
        return out;
    }
    function glyphFor(pack, codePoint) {
        for (var i = 0; i < pack.glyphs.length; i++) if (pack.glyphs[i].codePoint === codePoint) return pack.glyphs[i];
        return null;
    }
    function parseText(pack, text) {
        var code = 'INVALID_GLYPH_TEXT', out = [], i = 0, high, low, cp, glyph, index, visible = 0;
        requireValue(typeof text === 'string' && text.length > 0, code, 'Enter a nonempty single line.', { index: 0, scalar: null });
        while (i < text.length) {
            high = text.charCodeAt(i++); cp = high; index = out.length;
            if (high >= 55296 && high <= 56319) {
                low = text.charCodeAt(i);
                requireValue(low >= 56320 && low <= 57343, code, 'Unpaired Unicode surrogate.', { index: index, scalar: high });
                cp = 65536 + (high - 55296) * 1024 + low - 56320; i++;
            } else requireValue(!(high >= 56320 && high <= 57343), code, 'Unpaired Unicode surrogate.', { index: index, scalar: high });
            requireValue(!(cp < 32 || (cp >= 127 && cp <= 159) || cp === 8232 || cp === 8233), code, 'Control and multiline characters are unsupported.', { index: index, scalar: cp });
            requireValue(index < pack.limits.maxScalars, 'GLYPH_LIMIT_EXCEEDED', 'Text exceeds the pack scalar limit.', { index: index, scalar: cp });
            glyph = glyphFor(pack, cp);
            requireValue(glyph !== null, 'UNSUPPORTED_GLYPH', 'The pack does not declare this scalar.', { index: index, scalar: cp });
            out.push(glyph); if (cp !== 32) visible++;
        }
        requireValue(visible > 0, code, 'Space-only text has no visible glyphs.', { index: 0, scalar: 32 });
        return out;
    }
    function normalizeControls(pack, scalars, supplied) {
        var code = 'INVALID_GLYPH_TEXT', controls = {}, keys = ['duration', 'inSpeed', 'outSpeed', 'inDelay', 'outDelay', 'inReverse', 'outReverse', 'size', 'tracking'], i, key, offsets, visible = {};
        if (supplied === undefined) supplied = {};
        requireValue(object(supplied), code, 'Controls must be a plain object.');
        for (i = 0; i < keys.length; i++) { key = keys[i]; controls[key] = own(supplied, key) ? supplied[key] : pack.defaults[key]; }
        keys = ['verticalStagger', 'characterRotation', 'skew'];
        for (i = 0; i < keys.length; i++) { key = keys[i]; controls[key] = own(supplied, key) ? supplied[key] : 0; }
        keys = ['inEnabled', 'outEnabled'];
        for (i = 0; i < keys.length; i++) { key = keys[i]; controls[key] = own(supplied, key) ? supplied[key] : true; }
        requireValue(positive(controls.duration) && positive(controls.size) && positive(controls.inSpeed) && positive(controls.outSpeed) && nonnegative(controls.inDelay) && nonnegative(controls.outDelay), code, 'Invalid duration, size, speed or delay control.');
        requireValue(finite(controls.tracking) && finite(controls.verticalStagger) && finite(controls.characterRotation) && finite(controls.skew), code, 'Transform controls must be finite.');
        requireValue(typeof controls.inReverse === 'boolean' && typeof controls.outReverse === 'boolean' && typeof controls.inEnabled === 'boolean' && typeof controls.outEnabled === 'boolean', code, 'Animation switches must be boolean.');
        controls.color = color(own(supplied, 'color') ? supplied.color : pack.defaults.color, code);
        offsets = own(supplied, 'offsets') ? supplied.offsets : {};
        requireValue(object(offsets), code, 'Offsets must be keyed by visible scalar textIndex.');
        controls.offsets = {};
        for (i = 0; i < scalars.length; i++) if (scalars[i].codePoint !== 32) {
            key = String(i); visible[key] = true;
            controls.offsets[key] = own(offsets, key) ? pair(offsets[key], code, { index: i, scalar: scalars[i].codePoint }) : [0, 0];
        }
        for (key in offsets) if (own(offsets, key)) requireValue(own(visible, key), code, 'Offsets require a visible scalar textIndex.', { index: Number(key), scalar: null });
        return controls;
    }
    function layout(pack, text, supplied) {
        pack = validatePack(pack);
        var scalars = parseText(pack, text), controls = normalizeControls(pack, scalars, supplied), width = 0, pen = 0, glyphs = [], i, glyph, offset;
        for (i = 0; i < scalars.length; i++) width += scalars[i].advance;
        width += (scalars.length - 1) * controls.tracking;
        requireValue(finite(width), 'INVALID_GLYPH_TEXT', 'Text advance exceeds finite coordinates.');
        for (i = 0; i < scalars.length; i++) {
            glyph = scalars[i];
            if (glyph.codePoint !== 32) {
                offset = controls.offsets[String(i)];
                glyphs.push({ textIndex: i, glyphIndex: glyphs.length, codePoint: glyph.codePoint,
                    x: pen - width / 2, y: 0, advance: glyph.advance, offset: [offset[0], offset[1]] });
            }
            pen += glyph.advance + controls.tracking;
        }
        return { text: text, controls: controls, width: width, glyphs: glyphs };
    }
    function resolveTiming(pack, glyphLayout, request) {
        pack = validatePack(pack);
        var code = 'INVALID_GLYPH_TIMING', t = {}, keys = ['frameDuration', 'inEnabled', 'outEnabled', 'inDelay', 'outDelay', 'inReverse', 'outReverse'], i, key, count, entry, exit, gapStart, gapEnd, usable;
        requireValue(object(glyphLayout) && array(glyphLayout.glyphs) && glyphLayout.glyphs.length > 0 && object(request), code, 'Timing requires a nonempty glyph layout and request.');
        count = glyphLayout.glyphs.length;
        for (i = 0; i < keys.length; i++) { key = keys[i]; t[key] = request[key]; }
        requireValue(positive(t.frameDuration) && nonnegative(t.inDelay) && nonnegative(t.outDelay), code, 'Frame duration and delays are invalid.');
        requireValue(typeof t.inEnabled === 'boolean' && typeof t.outEnabled === 'boolean' && typeof t.inReverse === 'boolean' && typeof t.outReverse === 'boolean', code, 'Timing switches must be supplied as booleans.');
        t.entryLength = pack.clock.entryEnd; t.bodyLength = pack.clock.bodyEnd - pack.clock.entryEnd; t.exitLength = pack.clock.duration - pack.clock.bodyEnd;
        entry = t.inReverse ? t.exitLength : t.entryLength;
        exit = t.outReverse ? t.entryLength : t.exitLength;
        if (request.mode === 'create') {
            requireValue(finite(request.atTime) && positive(request.totalDuration) && positive(request.inSpeed) && positive(request.outSpeed), code, 'Create timing requires finite CTI, duration and positive speeds.');
            t.inSpeed = request.inSpeed; t.outSpeed = request.outSpeed;
            t.inPhaseDuration = entry * 100 / t.inSpeed; t.outPhaseDuration = exit * 100 / t.outSpeed;
            t.inSpan = t.inPhaseDuration + (count - 1) * t.inDelay; t.outSpan = t.outPhaseDuration + (count - 1) * t.outDelay;
            t.inMarker = request.atTime; t.inPoint = request.atTime - t.inSpan;
            t.outPoint = t.inPoint + request.totalDuration; t.outMarker = t.outPoint - t.outSpan;
        } else {
            requireValue(request.mode === 'read', code, 'Timing mode must be create or read.');
            keys = ['inPoint', 'inMarker', 'outMarker', 'outPoint'];
            for (i = 0; i < keys.length; i++) { key = keys[i]; t[key] = request[key]; }
            t.inSpan = t.inMarker - t.inPoint; t.outSpan = t.outPoint - t.outMarker;
            t.inPhaseDuration = t.inSpan - (count - 1) * t.inDelay; t.outPhaseDuration = t.outSpan - (count - 1) * t.outDelay;
            t.inSpeed = entry * 100 / t.inPhaseDuration; t.outSpeed = exit * 100 / t.outPhaseDuration;
        }
        requireValue(finite(t.inPoint) && finite(t.inMarker) && finite(t.outMarker) && finite(t.outPoint) && t.outPoint > t.inPoint, code, 'Root and marker times must be finite and ordered.');
        requireValue(t.inMarker >= t.inPoint && t.inMarker <= t.outPoint && t.outMarker >= t.inPoint && t.outMarker <= t.outPoint, code, 'Markers must be inside the root boundaries.');
        requireValue(positive(t.inPhaseDuration) && positive(t.outPhaseDuration) && positive(t.inSpeed) && positive(t.outSpeed) && finite(t.inSpan) && finite(t.outSpan), code, 'Marker span must exceed its total glyph delay.');
        gapStart = t.inEnabled ? t.inMarker : t.inPoint;
        gapEnd = t.outEnabled ? t.outMarker : t.outPoint;
        usable = gapEnd - gapStart;
        requireValue(usable >= t.frameDuration || Math.abs(usable - t.frameDuration) < 0.000000000001, code, 'Enabled phases require at least one frame of body gap.');
        return t;
    }
    function clockAt(pack, glyphLayout, timing, glyphIndex, time) {
        var count = glyphLayout.glyphs.length, inRank = glyphIndex, outRank = glyphIndex,
            entryStart, entryEnd, exitStart, exitEnd, bodyStart, bodyEnd, window, cycles, q, sourceTime;
        if (timing.inReverse) inRank = count - 1 - glyphIndex;
        if (timing.outReverse) outRank = count - 1 - glyphIndex;
        entryStart = timing.inPoint + inRank * timing.inDelay; entryEnd = entryStart + timing.inPhaseDuration;
        exitStart = timing.outMarker + outRank * timing.outDelay; exitEnd = exitStart + timing.outPhaseDuration;
        if (timing.inEnabled && time < entryStart) return { sourceTime: timing.inReverse ? pack.clock.duration : 0, phase: 'before' };
        if (timing.inEnabled && time < entryEnd) {
            q = (time - entryStart) / timing.inPhaseDuration;
            sourceTime = timing.inReverse ? pack.clock.duration - q * timing.exitLength : q * timing.entryLength;
            return { sourceTime: sourceTime, phase: 'entry' };
        }
        if (timing.outEnabled && time >= exitStart) {
            if (time >= exitEnd) return { sourceTime: timing.outReverse ? 0 : pack.clock.duration, phase: 'after' };
            q = (time - exitStart) / timing.outPhaseDuration;
            sourceTime = timing.outReverse ? timing.entryLength * (1 - q) : pack.clock.bodyEnd + q * timing.exitLength;
            return { sourceTime: sourceTime, phase: 'exit' };
        }
        bodyStart = timing.inEnabled ? entryEnd : timing.inMarker;
        bodyEnd = timing.outEnabled ? exitStart : timing.outMarker;
        window = bodyEnd - bodyStart;
        sourceTime = pack.clock.entryEnd;
        if (window > 0 && time >= bodyStart && time < bodyEnd) {
            cycles = Math.max(1, Math.floor(window / timing.bodyLength + 0.000000001));
            q = (time - bodyStart) / window * cycles;
            // Floating arithmetic can put an exact cycle seam just below its integer.
            // Canonicalize that source seam only; root/marker seconds are untouched.
            if (Math.abs(q - Math.round(q)) < 0.000000000001) q = Math.round(q);
            sourceTime += (q - Math.floor(q)) * timing.bodyLength;
        }
        return { sourceTime: sourceTime, phase: 'body' };
    }
    function sample(pack, glyphLayout, timing, time) {
        requireValue(finite(time), 'INVALID_GLYPH_TIMING', 'Sample time must be finite.');
        pack = validatePack(pack);
        var out = [], controls = glyphLayout.controls, glyph, geometry, clock, row, i, j;
        for (i = 0; i < glyphLayout.glyphs.length; i++) {
            row = glyphLayout.glyphs[i]; glyph = glyphFor(pack, row.codePoint);
            requireValue(glyph !== null, 'UNSUPPORTED_GLYPH', 'Layout scalar is unavailable.', { index: row.textIndex, scalar: row.codePoint });
            clock = clockAt(pack, glyphLayout, timing, row.glyphIndex, time); geometry = [];
            for (j = 0; j < glyph.paths.length; j++) geometry.push(interpolatePath(glyph.paths[j], clock.sourceTime));
            out.push({ textIndex: row.textIndex, glyphIndex: row.glyphIndex, sourceTime: clock.sourceTime, phase: clock.phase,
                position: [row.x + row.offset[0], row.y + row.offset[1] + row.glyphIndex * controls.verticalStagger],
                scale: controls.size / pack.metrics.em, rotation: controls.characterRotation, skew: controls.skew,
                color: [controls.color[0], controls.color[1], controls.color[2]], paths: geometry });
        }
        return out;
    }
    $.cpGlyphModel = { validatePack: validatePack, layout: layout, resolveTiming: resolveTiming, sample: sample };
})();
