/* ============================================================
   SOP 2 — error injection (pure)

   Builds deliberately broken variants of a pseudocode case so the
   comparison can measure ERROR DETECTION — the one thing a validation
   mechanism is supposed to add. Each injector is deterministic and
   self-guarding: it returns null when the target construct is absent,
   and the skipped count is reported rather than hidden.

   Injection types:
     keyword_typo          misspell a statement keyword
     missing_end_if        remove one END IF / ENDIF sentinel
     undefined_variable    use an identifier that is never declared
     wrong_argument_count  give a call one more argument than it takes
     return_outside_function  put RETURN at the top level
   ============================================================ */
(function (root) {
  'use strict';

  var INJECTION_TYPES = [
    'keyword_typo',
    'missing_end_if',
    'undefined_variable',
    'wrong_argument_count',
    'return_outside_function'
  ];

  var KEYWORD_TYPOS = {
    DISPLAY: 'DISPLAI',
    PRINT: 'PRNT',
    OUTPUT: 'OUTPU',
    WHILE: 'WHLE',
    DECLARE: 'DECALRE',
    SET: 'SETT',
    CALL: 'CALLL'
  };

  function splitLines(source) { return String(source == null ? '' : source).replace(/\r\n?/g, '\n').split('\n'); }
  function joinLines(lines) { return lines.join('\n'); }

  function isComment(line) { var t = line.trim(); return t.startsWith('#') || t.startsWith('//'); }

  function findEndIndex(lines) {
    for (var i = lines.length - 1; i >= 0; i--) {
      if (/^\s*END\s*\.?\s*$/i.test(lines[i])) return i;
    }
    return lines.length;
  }

  /* ---------- keyword typo ---------- */

  function injectKeywordTypo(source) {
    var lines = splitLines(source);
    for (var i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      var m = /^(\s*)([A-Za-z]+)\b/.exec(lines[i]);
      if (!m) continue;
      var word = m[2].toUpperCase();
      if (KEYWORD_TYPOS[word]) {
        lines[i] = m[1] + KEYWORD_TYPOS[word] + lines[i].slice(m[1].length + m[2].length);
        return { source: joinLines(lines), detail: word + ' -> ' + KEYWORD_TYPOS[word] };
      }
    }
    return null;
  }

  /* ---------- missing END IF ---------- */

  function injectMissingEndIf(source) {
    var lines = splitLines(source);
    var hasIf = false, lastEndIf = -1;
    for (var i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      if (/^\s*IF\b.*\bTHEN\b/i.test(lines[i])) hasIf = true;
      if (/^\s*END\s*IF\s*$/i.test(lines[i]) || /^\s*ENDIF\s*$/i.test(lines[i])) lastEndIf = i;
    }
    if (!hasIf || lastEndIf < 0) return null;
    var detail = lines[lastEndIf].trim();
    lines.splice(lastEndIf, 1);
    return { source: joinLines(lines), detail: 'removed ' + detail + ' on line ' + (lastEndIf + 1) };
  }

  /* ---------- undefined variable ---------- */

  function declaredNames(lines) {
    var names = {};
    lines.forEach(function (line) {
      var m = /^\s*DECLARE\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(line);
      if (m) names[m[1]] = true;
    });
    return names;
  }

  function injectUndefinedVariable(source) {
    var lines = splitLines(source);
    var declared = declaredNames(lines);
    // Find the first assignment and reference an undeclared name in it.
    for (var i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      var m = /^(\s*)(?:SET\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|TO|\u2190|<-|:=)\s*(.+?)\s*$/i.exec(lines[i]);
      if (!m) continue;
      var indent = m[1];
      var target = m[2];
      var rhs = m[3];
      if (!declared[target] && !/^\s*$/.test(target)) {
        // still fine: the target itself may be undeclared, but prefer a clean
        // injected name so the intent is unambiguous
      }
      lines[i] = indent + (/\bTO\b/i.test(lines[i]) ? 'SET ' + target + ' TO ' : target + ' = ') +
        'ghost_value_1 + (' + rhs + ')';
      return { source: joinLines(lines), detail: 'referenced undeclared ghost_value_1 in assignment to ' + target };
    }
    return null;
  }

  /* ---------- wrong argument count ---------- */

  function injectWrongArgumentCount(source) {
    var lines = splitLines(source);
    // Perhaps a CALL from the docs.
    for (var i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      var c = /^(\s*)CALL\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*$/i.exec(lines[i]);
      if (c) {
        var args = c[3].trim();
        lines[i] = c[1] + 'CALL ' + c[2] + '(' + (args ? args + ', 0' : '0') + ')';
        return { source: joinLines(lines), detail: 'added an extra argument to CALL ' + c[2] };
      }
    }
    // Fall back to a function definition's call site in an expression.
    var defined = null;
    for (var d = 0; d < lines.length; d++) {
      var f = /^\s*(?:FUNCTION|PROCEDURE)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/i.exec(lines[d]);
      if (f) { defined = f[1]; break; }
    }
    if (defined) {
      for (var k = 0; k < lines.length; k++) {
        if (isComment(lines[k])) continue;
        var call = new RegExp('\\b' + defined + '\\s*\\(([^)]*)\\)');
        var m = call.exec(lines[k]);
        if (m && k !== 0) {
          var inner = m[1].trim();
          lines[k] = lines[k].replace(call, defined + '(' + (inner ? inner + ', 0' : '0') + ')');
          return { source: joinLines(lines), detail: 'added an extra argument to ' + defined + '()' };
        }
      }
    }
    return null;
  }

  /* ---------- RETURN outside function ---------- */

  function injectReturnOutsideFunction(source) {
    var lines = splitLines(source);
    var at = findEndIndex(lines);
    lines.splice(at, 0, '  RETURN 0');
    return { source: joinLines(lines), detail: 'inserted RETURN 0 at the top level' };
  }

  var INJECTORS = {
    keyword_typo: injectKeywordTypo,
    missing_end_if: injectMissingEndIf,
    undefined_variable: injectUndefinedVariable,
    wrong_argument_count: injectWrongArgumentCount,
    return_outside_function: injectReturnOutsideFunction
  };

  /**
   * Inject one error type into a source.
   * @returns {{source:string, detail:string}|null} null when not applicable
   */
  function inject(source, type) {
    var fn = INJECTORS[type];
    if (!fn) throw new Error('unknown injection type: ' + type);
    return fn(source);
  }

  /**
   * All applicable injections for a source.
   * @returns {{applicable:Array<{type:string,source:string,detail:string}>, skipped:string[]}}
   */
  function injectAll(source, types) {
    var list = types || INJECTION_TYPES;
    var applicable = [];
    var skipped = [];
    list.forEach(function (type) {
      var r;
      try { r = inject(source, type); } catch (e) { r = null; }
      if (r && r.source !== source) applicable.push({ type: type, source: r.source, detail: r.detail });
      else skipped.push(type);
    });
    return { applicable: applicable, skipped: skipped };
  }

  var Sop2Injection = {
    INJECTION_TYPES: INJECTION_TYPES,
    INJECTORS: INJECTORS,
    inject: inject,
    injectAll: injectAll
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Sop2Injection;
  if (root) root.Sop2Injection = Sop2Injection;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
