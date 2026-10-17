/* Strict ES3 JSON parser. Ambient JSON implementations are never consulted. */
(function () {
    function parseStrictJSON(text) {
        if (typeof text !== 'string') { var typeError = new TypeError('JSON input must be a string.'); typeError.code = 'JSON_INPUT_TYPE'; throw typeError; }
        var at = 0, length = text.length, own = Object.prototype.hasOwnProperty, maxDepth = 256, maxTextLength = 16777216;
        function invalid(message, code) { var error = new SyntaxError(message + ' at position ' + at + '.'); error.code = code || 'JSON_SYNTAX'; error.position = at; throw error; }
        if (length > maxTextLength) invalid('JSON input exceeds the text limit', 'JSON_SIZE');
        if (text.charCodeAt(0) === 65279) at++;
        function whitespace() { while (at < length) { var c = text.charCodeAt(at); if (c !== 32 && c !== 9 && c !== 10 && c !== 13) return; at++; } }
        function digit(c) { return c >= '0' && c <= '9'; }
        function stringValue() {
            var parts = [], start = ++at, c, escaped, code, hex, i;
            while (at < length) {
                c = text.charAt(at);
                if (c === '"') { parts.push(text.substring(start, at)); at++; return parts.join(''); }
                if (c === '\\') {
                    parts.push(text.substring(start, at)); at++;
                    if (at >= length) invalid('Unterminated JSON string escape');
                    escaped = text.charAt(at++);
                    if (escaped === '"' || escaped === '\\' || escaped === '/') parts.push(escaped);
                    else if (escaped === 'b') parts.push('\b');
                    else if (escaped === 'f') parts.push('\f');
                    else if (escaped === 'n') parts.push('\n');
                    else if (escaped === 'r') parts.push('\r');
                    else if (escaped === 't') parts.push('\t');
                    else if (escaped === 'u') {
                        code = 0;
                        for (i = 0; i < 4; i++) { if (at >= length) invalid('Incomplete Unicode escape'); hex = text.charCodeAt(at++); if (hex >= 48 && hex <= 57) hex -= 48; else if (hex >= 65 && hex <= 70) hex -= 55; else if (hex >= 97 && hex <= 102) hex -= 87; else invalid('Invalid Unicode escape'); code = code * 16 + hex; }
                        parts.push(String.fromCharCode(code));
                    } else invalid('Invalid JSON string escape');
                    start = at;
                } else { if (text.charCodeAt(at) < 32) invalid('Unescaped control character'); at++; }
            }
            invalid('Unterminated JSON string');
        }
        function numberValue() {
            var start = at, c = text.charAt(at), value;
            if (c === '-') { at++; c = text.charAt(at); }
            if (c === '0') at++;
            else { if (c < '1' || c > '9' || !c) invalid('Invalid JSON number'); while (digit(text.charAt(at))) at++; }
            if (text.charAt(at) === '.') { at++; if (!digit(text.charAt(at))) invalid('A fraction requires digits'); while (digit(text.charAt(at))) at++; }
            c = text.charAt(at);
            if (c === 'e' || c === 'E') { at++; c = text.charAt(at); if (c === '+' || c === '-') at++; if (!digit(text.charAt(at))) invalid('An exponent requires digits'); while (digit(text.charAt(at))) at++; }
            value = Number(text.substring(start, at)); if (!isFinite(value)) invalid('JSON number is not finite', 'JSON_NUMBER_RANGE'); return value;
        }
        function readValue(depth) {
            if (depth > maxDepth) invalid('JSON nesting exceeds the limit', 'JSON_DEPTH');
            whitespace(); var c = text.charAt(at), result, key;
            if (c === '"') return stringValue();
            if (c === '[') {
                result = []; at++; whitespace(); if (text.charAt(at) === ']') { at++; return result; }
                while (true) { result.push(readValue(depth + 1)); whitespace(); c = text.charAt(at++); if (c === ']') return result; if (c !== ',') invalid('Expected an array comma or closing bracket'); }
            }
            if (c === '{') {
                result = {}; at++; whitespace(); if (text.charAt(at) === '}') { at++; return result; }
                while (true) {
                    whitespace(); if (text.charAt(at) !== '"') invalid('Object keys must be quoted'); key = stringValue();
                    if (key === '__proto__' || key === 'prototype' || key === 'constructor') invalid('Unsafe object key', 'JSON_UNSAFE_KEY');
                    if (own.call(result, key)) invalid('Duplicate object key', 'JSON_DUPLICATE_KEY');
                    whitespace(); if (text.charAt(at++) !== ':') invalid('Expected an object colon'); result[key] = readValue(depth + 1); whitespace(); c = text.charAt(at++); if (c === '}') return result; if (c !== ',') invalid('Expected an object comma or closing brace');
                }
            }
            if (c === '-' || digit(c)) return numberValue();
            if (text.substr(at, 4) === 'true') { at += 4; return true; }
            if (text.substr(at, 5) === 'false') { at += 5; return false; }
            if (text.substr(at, 4) === 'null') { at += 4; return null; }
            invalid('Expected a JSON value');
        }
        var result = readValue(0); whitespace(); if (at !== length) invalid('Unexpected trailing input'); return result;
    }
    $.cpJson = { version: 1, parse: parseStrictJSON, policy: { unsafeObjectKeys: 'reject', duplicateObjectKeys: 'reject', maxDepth: 256, maxTextLength: 16777216, leadingBOM: 'one at position0', unicodeEscapes: 'UTF16 code units, including unpaired surrogates' } };
}());
