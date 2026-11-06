/* ============================================================
   PSEUDOPY — PSEUDOCODE FORMATTER (single source of truth)

   The formatter is a pure, dependency-free transform used by:
     - the "Format" toolbar button (student editor)
     - the Developer Options -> Normalize/Format panel (preview/diff/apply)
     - the student Settings toggle for output-text symbols
   It is bundled into app.js (see src/bundles.json) and also exported for
   Node property tests.

   Guarantees (property-tested in tests/formatter.test.js):
     - idempotent: format(format(x)) === format(x)
     - semantics-preserving: the compiled Python and stdout are unchanged for
       every input the compiler accepts (string/comment text aside, see below)
     - tabs, CRLF, BOM, NBSP and trailing spaces are normalized
     - keyword casing, indentation, operator spacing, one statement per line
       and END-block alignment are enforced
     - text INSIDE string literals and comments is never rewritten for code
       purposes, except the explicit output-symbol conversion below

   Output-symbol conversion (setting: "Use Python operators in output text",
   default ON): symbols a student typed INSIDE a string literal are converted
   to their Python-operator ASCII (e.g. "≥" -> ">=") so every console output
   shows Python operators. When the setting is OFF, string contents are left
   byte-identical.
   ============================================================ */

(function (global) {
    'use strict';

    // The single shared symbol table lives in language-spec.js (bundled ahead
    // of this file as part of compiler.js, and exposed on window.SYMBOL_MAP).
    // Fall back to a small inline map only when that global is absent (bare
    // Node require in tests) so the formatter never carries a second copy.
    function sharedSymbolMap() {
        if (global && global.SYMBOL_MAP) return global.SYMBOL_MAP;
        if (global && global.LANGUAGE_SPEC && global.LANGUAGE_SPEC.unicodeNormalizations) return global.LANGUAGE_SPEC.unicodeNormalizations;
        if (typeof require === 'function') {
            try { return require('./language-spec.js').SYMBOL_MAP; } catch (e) { /* not available */ }
        }
        return null;
    }

    // Symbols that only make sense as operators, never as readable output
    // text. Output conversion therefore leaves readable math glyphs that have
    // a Python equivalent out of strings unchanged EXCEPT the operator set
    // below, which is the set the owner asked to surface as Python operators.
    var OUTPUT_CONVERTIBLE = ['\u2265', '\u2A7E', '\u2264', '\u2A7D', '\u2260', '\u2261', '\u2261', '\u00D7', '\u2715', '\u22C5', '\u00F7', '\u2215', '\u2212', '\u2227', '\u2228', '\u00AC'];

    var KEYWORDS_UPPER = ['BEGIN', 'END', 'IF', 'THEN', 'ELSE', 'ELSEIF', 'ELSE IF', 'WHILE', 'DO',
        'FOR', 'EACH', 'FROM', 'TO', 'STEP', 'IN', 'REPEAT', 'UNTIL', 'CASE', 'OF', 'OTHERWISE',
        'FUNCTION', 'PROCEDURE', 'CALL', 'RETURN', 'DECLARE', 'AS', 'SET', 'DISPLAY', 'PRINT',
        'OUTPUT', 'INPUT', 'READ', 'WITH', 'PROMPT', 'AND', 'OR', 'NOT', 'MOD', 'DIV', 'IS'];

    var DEDENT_KEYWORDS = /^(END\b|ELSE\b|ELSEIF\b|ELSE\s+IF\b|NEXT\b|UNTIL\b|OTHERWISE\b|CASE\s+ELSE\b|END\b)/i;
    var INDENT_KEYWORDS = /^(BEGIN\b|IF\b|WHILE\b|FOR\b|REPEAT\b|ELSE\b|ELSEIF\b|ELSE\s+IF\b|FUNCTION\b|PROCEDURE\b|CASE\b)/i;

    // One binary/word operator spacing pass, applied only outside strings and
    // comments. Word operators use single spaces; the rest use tight spacing.
    var BINARY_SYMBOLS = ['>=', '<=', '==', '!=', '<>', ':=', '<-', '->', '**', '//', '<<', '>>',
        '+', '-', '*', '/', '%', '=', '>', '<', '^', '&', '|', '~'];
    var WORD_OPERATORS = ['MOD', 'DIV', 'AND', 'OR', 'NOT', 'IS', 'IN'];

    // ── helpers ────────────────────────────────────────────────
    function normalizeWhitespace(text) {
        return text
            .replace(/^\uFEFF/, '')          // strip BOM
            .replace(/\r\n?/g, '\n')          // CRLF and bare CR -> LF
            .replace(/\u00A0/g, ' ')          // NBSP -> space
            .replace(/\t/g, '    ')           // tabs -> 4 spaces
            .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '') // zero-width chars
            .replace(/[ ]+$/gm, '');          // trailing spaces per line
    }

    // Tokenize a single line into an ordered list of typed segments so the
    // formatter can rewrite code without ever touching the inside of a string
    // literal or comment. Kinds: 'code' | 'string' | 'comment'.
    function splitLine(line) {
        var segments = [];
        var i = 0;
        while (i < line.length) {
            var ch = line[i];
            if (ch === '"' || ch === "'") {
                var quote = ch;
                var lit = ch;
                i++;
                while (i < line.length) {
                    var c = line[i];
                    lit += c;
                    i++;
                    if (c === '\\' && i < line.length) { lit += line[i]; i++; continue; }
                    if (c === quote) break;
                }
                segments.push({ kind: 'string', text: lit });
                continue;
            }
            if (ch === '#') { segments.push({ kind: 'comment', text: line.slice(i) }); i = line.length; break; }
            if (ch === '/' && line[i + 1] === '/' && (segments.length === 0 || segments[segments.length - 1].text.trim() === '')) {
                segments.push({ kind: 'comment', text: line.slice(i) }); i = line.length; break;
            }
            var start = i;
            while (i < line.length && line[i] !== '"' && line[i] !== "'" && line[i] !== '#') {
                if (line[i] === '/' && line[i + 1] === '/') break;
                i++;
            }
            segments.push({ kind: 'code', text: line.slice(start, i) });
        }
        if (!segments.length) segments.push({ kind: 'code', text: '' });
        return segments;
    }

    function collapseSpaces(code) {
        return code.replace(/[ ]{2,}/g, ' ');
    }

    // Spacing is applied to a CODE segment only. Runs of whitespace between
    // tokens are normalized; operators get single spaces, but never split a
    // multi-character operator and never detach punctuation from its operand.
    function spaceOperators(code) {
        // Protect multi-char operators and parentheses/commas with sentinels so
        // the space pass cannot split them.
        var prot = [];
        function stash(re, text) {
            return text.replace(re, function (m) { prot.push(m); return '\u0000' + (prot.length - 1) + '\u0000'; });
        }
        var out = code;
        // Multi-char operators first (longest match wins via ordering).
        out = stash(/>=|<=|==|!=|<>|:=|<-|->|\*\*|\/\/|<<|>>/g, out);
        // Then single-char operators, but keep a leading unary sign attached.
        out = out.replace(/\s*([+\-*\/%^=<>&|~])\s*/g, ' $1 ');
        // Parentheses and commas hug their operands.
        out = out.replace(/\s*\(\s*/g, '(').replace(/\s*\)\s*/g, ')');
        out = out.replace(/\s*,\s*/g, ', ');
        // Restore the protected multi-char operators with single spaces.
        out = out.replace(/\u0000(\d+)\u0000/g, function (m, n) { return prot[Number(n)]; });
        out = out.replace(/[ ]{2,}/g, ' ').trim();
        return out;
    }

    // Merge code segments back with their strings, but re-derive spacing on the
    // joined text so a keyword is not glued to the following literal.
    function formatSegments(segments, pythonInOutput, symbolMap, changes, lineNumber) {
        // Build the code-only view and the placeholder map.
        var placeholders = [];
        var skeleton = '';
        for (var s = 0; s < segments.length; s++) {
            var part = segments[s];
            if (part.kind === 'code') {
                skeleton += part.text;
            } else {
                skeleton += '\u0001' + placeholders.length + '\u0001';
                placeholders.push(part);
            }
        }
        skeleton = collapseSpaces(skeleton);
        skeleton = uppercaseKeywords(skeleton);
        skeleton = spaceOperators(skeleton);

        var out = '';
        var re = /\u0001(\d+)\u0001/g;
        var last = 0;
        var m;
        while ((m = re.exec(skeleton)) !== null) {
            out += skeleton.slice(last, m.index);
            var part = placeholders[Number(m[1])];
            var text = part.text;
            if (part.kind === 'string' && pythonInOutput) {
                var converted = convertOutputSymbols(text, symbolMap);
                if (converted !== text) changes.push({ line: lineNumber, type: 'output-symbol', message: 'Output text: symbols shown as Python operators' });
                text = converted;
            }
            // A code segment ending in an identifier/keyword needs one space
            // before a following string literal.
            out += text;
            last = re.lastIndex;
        }
        out += skeleton.slice(last);
        return out.trim();
    }

    function uppercaseKeywords(code) {
        // Uppercase the statement keywords, leaving identifiers and literals
        // alone. Word-boundary + keyword list only.
        var re = new RegExp('\\b(' + KEYWORDS_UPPER.map(function (k) { return k.replace(/ /g, '\\s+'); }).join('|') + ')\\b', 'gi');
        return code.replace(re, function (m) { return m.toUpperCase().replace(/\s+/g, ' '); });
    }

    function convertOutputSymbols(literal, map) {
        if (!map || literal.length < 2) return literal;
        var quote = literal[0];
        var inner = literal.slice(1, literal.length - 1);
        var out = '';
        for (var i = 0; i < inner.length; i++) {
            var ch = inner[i];
            if (ch === '\\' && i + 1 < inner.length) { out += ch + inner[i + 1]; i++; continue; }
            if (OUTPUT_CONVERTIBLE.indexOf(ch) !== -1 && map[ch]) out += map[ch];
            else out += ch;
        }
        return quote + out + quote;
    }

    /* ── main entry ────────────────────────────────────────────
       formatPseudocode(source, options) -> { text, changes[] }
       options.pythonOperatorsInOutput: boolean (default true)
    */
    function formatPseudocode(source, options) {
        options = options || {};
        var pythonInOutput = options.pythonOperatorsInOutput !== false;
        if (source == null) return { text: '', changes: [] };
        var symbolMap = sharedSymbolMap();
        var raw = normalizeWhitespace(String(source));
        var lines = raw.split('\n');
        var out = [];
        var changes = [];
        var indentLevel = 0;
        var indentSize = (typeof options.indentSize === 'number') ? options.indentSize : 2;

        for (var i = 0; i < lines.length; i++) {
            var originalLine = lines[i];
            var trimmed = originalLine.trim();
            if (!trimmed) { out.push(''); continue; }

            var segments = splitLine(trimmed);
            var rebuilt = formatSegments(segments, pythonInOutput, symbolMap, changes, i + 1);
            if (!rebuilt) { out.push(''); continue; }

            if (DEDENT_KEYWORDS.test(rebuilt)) indentLevel = Math.max(0, indentLevel - 1);
            var result = ' '.repeat(indentLevel * indentSize) + rebuilt;

            if (INDENT_KEYWORDS.test(rebuilt)) {
                var inline = /THEN\b.*\bEND\s+IF\b/i.test(rebuilt) || /DO\b.*\b(END\s+WHILE|END\s+FOR|DONE|END\s+LOOP)\b/i.test(rebuilt);
                if (!inline) indentLevel++;
            }

            if (result !== originalLine) {
                changes.push({ line: i + 1, type: 'whitespace', message: 'Re-indented / normalized spacing' });
            }
            out.push(result);
        }

        var text = out.join('\n');
        if (text !== String(source)) {
            // One aggregate change record so the UI always has something to show.
            if (!changes.length) changes.push({ line: null, type: 'normalize', message: 'Normalized line endings and whitespace' });
        }
        return { text: text, changes: changes };
    }

    var api = {
        formatPseudocode: formatPseudocode,
        FORMATTER_OUTPUT_SYMBOLS: OUTPUT_CONVERTIBLE.slice(),
        _internal: { normalizeWhitespace: normalizeWhitespace, splitLine: splitLine }
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (global) global.PseudocodeFormatter = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
