/**
 * Resolve the syntax checker used to validate generated Python.
 *
 * - A caller-supplied function wins (used by the Node runner, which shells out
 *   to CPython, and by the browser UI, which uses Skulpt).
 * - `null`/`false` explicitly skips validation (timing-sensitive callers).
 * - Otherwise Skulpt is used when it happens to be present in the page.
 *
 * Returns `null` when none is available; the caller then reports
 * `syntaxSuccess: null` instead of claiming success it did not verify.
 */
function baselineResolveSyntaxCheck(option) {
  if (typeof option === 'function') return option;
  if (option === false || option === null) return null;
  if (typeof Sk !== 'undefined' && Sk && typeof Sk.parse === 'function') {
    return function (python) {
      // Sk.parse is (filename, code), and Skulpt needs the python3 future flag
      // configured before it can tokenize.
      if (typeof Sk.configure === 'function' && !Sk.__future__) {
        Sk.configure({ __future__: Sk.python3 });
      }
      Sk.parse('<baseline-translator>', python);
      return true;
    };
  }
  return null;
}

/**
 * Pure rule-based translation. No validation, no I/O: callers that need to
 * time generation in isolation (the SOP 2 comparison) use this directly so
 * a syntax check can never leak into the measurement.
 */
function baselineTranslateRaw(source) {
  if (source == null) source = '';
  let s = String(source);
  const lines = s.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let indent = 0;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    line = line.replace(/^\s*(\d+(?:\.\d*)?(?:[):])?)\s+(?=[A-Za-z_])/, '');
    line = line.replace(/^\s*(\d+)\s*$/, '');
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#') || t.startsWith('//')) {
      out.push('    '.repeat(indent) + t);
      continue;
    }
    const up = t.toUpperCase();
    if (up === 'BEGIN' || up === 'START') { continue; }
    if (up === 'END' || up === 'END.') {
      if (indent > 0) indent--;
      continue;
    }
    if (up.startsWith('END IF') || up === 'ENDIF') { if (indent > 0) indent--; continue; }
    if (up.startsWith('END WHILE') || up === 'ENDWHILE') { if (indent > 0) indent--; continue; }
    if (up.startsWith('END FOR') || up === 'ENDFOR') { if (indent > 0) indent--; continue; }
    if (up.startsWith('END FUNCTION') || up.startsWith('END PROCEDURE') || up === 'ENDFUNCTION' || up === 'ENDPROCEDURE') { if (indent > 0) indent--; continue; }
    if (up.startsWith('ELSE IF')) { out.push('    '.repeat(Math.max(0, indent - 1)) + 'elif ' + t.slice(7).replace(/\bTHEN\b/i, '') + ':'); continue; }
    if (up.startsWith('ELSE')) { out.push('    '.repeat(Math.max(0, indent - 1)) + 'else:'); continue; }
    if (up.startsWith('IF ')) {
      let cond = t.slice(2);
      cond = cond.replace(/\bTHEN\b/i, '');
      out.push('    '.repeat(indent) + 'if ' + cond.trim() + ':');
      indent++;
      continue;
    }
    if (up.startsWith('WHILE ')) {
      let cond = t.slice(6);
      cond = cond.replace(/\bDO\b/i, '');
      out.push('    '.repeat(indent) + 'while ' + cond.trim() + ':');
      indent++;
      continue;
    }
    if (up.startsWith('FOR EACH ')) {
      const m = t.match(/FOR\s+EACH\s+([A-Za-z_][A-Za-z0-9_]*)\s+IN\s+(.+?)\s+DO\b/i);
      if (m) { out.push('    '.repeat(indent) + 'for ' + m[1] + ' in ' + m[2] + ':'); indent++; continue; }
    }
    if (up.startsWith('FOR ')) {
      const m = t.match(/FOR\s+([A-Za-z_][A-Za-z0-9_]*)\s+FROM\s+(.+?)\s+TO\s+(.+?)(?:\s+STEP\s+(.+?))?\s+DO\b/i);
      if (m) {
        const start = (m[2] || '').trim();
        const end = (m[3] || '').trim();
        const step = (m[4] || '').trim();
        let startv = start, stopv = end, stepv = step || '1';
        try {
          const sv = parseFloat(start), ev = parseFloat(end), stv = step ? parseFloat(step) : 1;
          if (!isNaN(sv) && !isNaN(ev)) {
            if (stv <= 0) { stepv = '1'; }
            if (stv > 0) {
              if (sv <= ev) stopv = String(Math.floor(ev - sv) / stv >= 0 ? ev + 1 : ev);
              else stopv = String(ev);
            } else {
              if (sv >= ev) stopv = String(ev - 1);
              else stopv = String(ev);
            }
          }
        } catch (e) {}
        const rangeArgs = (stepv && stepv !== '1' && stepv !== '1.0') ? (startv + ',' + stopv + ',' + stepv) : (startv + ',' + stopv);
        out.push('    '.repeat(indent) + 'for ' + m[1] + ' in range(' + rangeArgs + '):');
        indent++;
        continue;
      }
    }
    if (up.startsWith('FUNCTION ') || up.startsWith('PROCEDURE ')) {
      const m = t.match(/(FUNCTION|PROCEDURE)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/i);
      if (m) { out.push('    '.repeat(indent) + 'def ' + m[2] + '(' + m[3].replace(/\s+/g, '') + '):'); indent++; continue; }
      const m2 = t.match(/(FUNCTION|PROCEDURE)\s+([A-Za-z_][A-Za-z0-9_]+)/i);
      if (m2) { out.push('    '.repeat(indent) + 'def ' + m2[2] + '():'); indent++; continue; }
    }
    if (up.startsWith('RETURN')) { out.push('    '.repeat(indent) + t.replace(/\bRETURN\b/i, 'return')); continue; }
    if (up.startsWith('CALL ')) { out.push('    '.repeat(indent) + t.replace(/\bCALL\b/i, '').trim()); continue; }
    if (up.startsWith('DISPLAY') || up.startsWith('PRINT') || up.startsWith('OUTPUT')) { out.push('    '.repeat(indent) + 'print(' + t.replace(/^(DISPLAY|PRINT|OUTPUT)\s*/i, '') + ')'); continue; }
    if (up.startsWith('INPUT') || up.startsWith('READ')) {
      const m = t.match(/(INPUT|READ)(?:\s+WITH\s+PROMPT\s+(.+?))?\s+([A-Za-z_][A-Za-z0-9_]*)/i);
      if (m) { out.push('    '.repeat(indent) + m[3] + ' = input(' + (m[2] || '') + ')'); continue; }
    }
    if (up.startsWith('DECLARE ')) { out.push('    '.repeat(indent) + '# ' + t); continue; }
    if (up.startsWith('SET ')) { out.push('    '.repeat(indent) + t.replace(/\bSET\b/i, '').replace(/\bTO\b/i, '=').trim()); continue; }
    if (up.startsWith('END ')) { if (indent > 0) indent--; continue; }
    out.push('    '.repeat(indent) + t);
  }
  const generatedPython = out.join('\n');
  return { generatedPython, translatorId: 'baseline-direct', translatorVersion: '0.1.3' };
}

/**
 * Translate and — when a checker is available — verify that the generated
 * Python actually parses. `success` is derived from that check; it is never
 * reported true for output that was not validated.
 */
function baselineTranslate(source, options) {
  const raw = baselineTranslateRaw(source);
  const check = baselineResolveSyntaxCheck(options && options.syntaxCheck);
  let syntaxSuccess = null;
  let syntaxError = null;
  if (check) {
    try {
      const r = check(raw.generatedPython);
      if (r && typeof r === 'object' && typeof r.ok === 'boolean') {
        syntaxSuccess = r.ok;
        syntaxError = r.ok ? null : (r.error || r.msg || null);
      } else {
        syntaxSuccess = r === undefined ? true : !!r;
      }
    } catch (e) {
      syntaxSuccess = false;
      syntaxError = (e && e.message) || String(e);
    }
  }
  return Object.assign({}, raw, {
    success: syntaxSuccess === true,
    syntaxSuccess,
    syntaxError,
    runtimeSuccess: null,
    runtimeError: null
  });
}

/* ============================================================
   B2 — "reasonable rule-based" baseline tier
   ------------------------------------------------------------
   Same contract as B1 (pure text -> Python, no I/O, no validation)
   but written the way a competent engineer would from the PUBLIC
   language spec in docs/compiler-language.md:

     • word operators rewritten (MOD, DIV, AND, OR, NOT, IN, IS,
       TRUE/FALSE/NULL) outside string literals
     • inclusive FOR ranges (FOR i FROM a TO b -> range(a, b + 1)),
       negative steps counted down
     • INCREMENT / DECREMENT / APPEND
     • assignment spellings <- and := normalised
     • tidy indentation driven by block sentinels

   It still has NO CFG, NO AST and NO semantic validation: it emits
   Python for whatever text it is given, so broken input is translated
   into broken Python silently. That is exactly the property SOP 2b
   needs to contrast against PseudoPy's validation mechanism.
   ============================================================ */

function _b2Indent(level) { return '    '.repeat(Math.max(0, level)); }

/** Apply a transform only to the parts of `text` outside string literals. */
function _b2OutsideStrings(text, fn) {
  let out = '';
  let seg = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      out += fn(seg);
      seg = '';
      const quote = ch;
      let str = ch;
      i++;
      while (i < text.length) {
        str += text[i];
        if (text[i] === '\\') { i++; if (i < text.length) { str += text[i]; i++; } continue; }
        if (text[i] === quote) { i++; break; }
        i++;
      }
      out += str;
      continue;
    }
    seg += ch;
    i++;
  }
  out += fn(seg);
  return out;
}

const _B2_OPS = [
  [/\bMOD\b/g, '%'],
  [/\bDIV\b/g, '//'],
  [/\bAND\b/g, 'and'],
  [/\bOR\b/g, 'or'],
  [/\bNOT\b/g, 'not'],
  [/\bIN\b/g, 'in'],
  [/\bIS\b/g, 'is'],
  [/\bTRUE\b/g, 'True'],
  [/\bFALSE\b/g, 'False'],
  [/\bNULL\b/g, 'None'],
  [/\bNONE\b/g, 'None'],
  [/<>/g, '!='],
  [/\u2190/g, '='],
  [/<-/g, '='],
  [/:=/g, '=']
];

function _b2Expr(text) {
  return _b2OutsideStrings(String(text), function (plain) {
    let s = plain;
    for (let k = 0; k < _B2_OPS.length; k++) s = s.replace(_B2_OPS[k][0], _B2_OPS[k][1]);
    return s;
  });
}

/** Turn a single `=` comparison into `==` inside a condition. */
function _b2Condition(text) {
  return _b2Expr(text).replace(/([^=!<>])=([^=])/g, '$1==$2');
}

function baselineTranslateRawB2(source) {
  if (source == null) source = '';
  const lines = String(source).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let indent = 0;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    line = line.replace(/^\s*(\d+(?:\.\d*)?(?:[):])?)\s+(?=[A-Za-z_#])/, '');
    line = line.replace(/^\s*(\d+)\s*$/, '');
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#')) { out.push(_b2Indent(indent) + t); continue; }
    if (t.startsWith('//')) { out.push(_b2Indent(indent) + '# ' + t.slice(2).trim()); continue; }
    const up = t.toUpperCase();

    if (up === 'BEGIN' || up === 'START') continue;
    if (up === 'END' || up === 'END.') { if (indent > 0) indent--; continue; }
    if (/^END\s*IF$/.test(up) || up === 'ENDIF') { if (indent > 0) indent--; continue; }
    if (/^END\s*WHILE$/.test(up) || up === 'ENDWHILE') { if (indent > 0) indent--; continue; }
    if (/^END\s*FOR$/.test(up) || up === 'ENDFOR') { if (indent > 0) indent--; continue; }
    if (/^END\s*FUNCTION$/.test(up) || up === 'ENDFUNCTION') { if (indent > 0) indent--; continue; }
    if (/^END\s*PROCEDURE$/.test(up) || up === 'ENDPROCEDURE') { if (indent > 0) indent--; continue; }

    // DECLARE carries no Python meaning; dropping it keeps the output clean.
    if (up.startsWith('DECLARE ')) continue;

    let m = t.match(/^IF\b(.*)$/i);
    if (m && /\bTHEN\b/i.test(t)) {
      const cond = m[1].replace(/\bTHEN\b/i, '').trim();
      out.push(_b2Indent(indent) + 'if ' + _b2Condition(cond) + ':');
      indent++;
      continue;
    }
    m = t.match(/^ELSE\s*IF\b(.*)$/i);
    if (m) {
      const cond = m[1].replace(/\bTHEN\b/i, '').trim();
      out.push(_b2Indent(indent - 1) + 'elif ' + _b2Condition(cond) + ':');
      continue;
    }
    if (up === 'ELSE') { out.push(_b2Indent(indent - 1) + 'else:'); continue; }

    m = t.match(/^WHILE\b(.*)$/i);
    if (m) {
      const cond = m[1].replace(/\bDO\b/i, '').trim();
      out.push(_b2Indent(indent) + 'while ' + _b2Condition(cond) + ':');
      indent++;
      continue;
    }

    m = t.match(/^FOR\s+EACH\s+([A-Za-z_]\w*)\s+IN\s+(.+?)\s+DO\s*$/i);
    if (m) {
      out.push(_b2Indent(indent) + 'for ' + m[1] + ' in ' + _b2Expr(m[2]) + ':');
      indent++;
      continue;
    }
    m = t.match(/^FOR\s+([A-Za-z_]\w*)\s+FROM\s+(.+?)\s+TO\s+(.+?)(?:\s+STEP\s+(.+?))?\s+DO\s*$/i);
    if (m) {
      const start = _b2Expr(m[2]), stop = _b2Expr(m[3]);
      const step = m[4] ? _b2Expr(m[4]) : '';
      const stopAdj = /^\s*-\s*\d/.test(step) ? '(' + stop + ' - 1)' : '(' + stop + ' + 1)';
      const args = step && step !== '1' ? start + ', ' + stopAdj + ', ' + step : start + ', ' + stopAdj;
      out.push(_b2Indent(indent) + 'for ' + m[1] + ' in range(' + args + '):');
      indent++;
      continue;
    }

    m = t.match(/^(FUNCTION|PROCEDURE)\s+([A-Za-z_]\w*)\s*(?:\(([^)]*)\))?/i);
    if (m) {
      const params = (m[3] || '').replace(/\s+/g, ' ').trim();
      out.push(_b2Indent(indent) + 'def ' + m[2] + '(' + params + '):');
      indent++;
      continue;
    }

    m = t.match(/^(INCREMENT|DECREMENT)\s+([A-Za-z_]\w*)\s*$/i);
    if (m) {
      out.push(_b2Indent(indent) + m[2] + (m[1].toUpperCase() === 'INCREMENT' ? ' += 1' : ' -= 1'));
      continue;
    }

    m = t.match(/^APPEND\s+(.+?)\s+TO\s+(.+?)\s*$/i);
    if (m) {
      out.push(_b2Indent(indent) + _b2Expr(m[2]) + '.append(' + _b2Expr(m[1]) + ')');
      continue;
    }

    m = t.match(/^RETURN\b(.*)$/i);
    if (m) {
      out.push(_b2Indent(indent) + 'return' + (m[1].trim() ? ' ' + _b2Expr(m[1]) : ''));
      continue;
    }

    m = t.match(/^CALL\s+(.+)$/i);
    if (m) { out.push(_b2Indent(indent) + _b2Expr(m[1])); continue; }

    m = t.match(/^(DISPLAY|PRINT|OUTPUT)\s*(.*)$/i);
    if (m) { out.push(_b2Indent(indent) + 'print(' + _b2Expr(m[2]) + ')'); continue; }

    m = t.match(/^(INPUT|READ)\b(?:\s+WITH\s+PROMPT\s+(.+?))?\s+([A-Za-z_]\w*)\s*$/i);
    if (m) { out.push(_b2Indent(indent) + m[3] + ' = input(' + (m[2] ? _b2Expr(m[2]) : '') + ')'); continue; }

    m = t.match(/^SET\s+(.+?)\s+TO\s+(.+)$/i);
    if (m) { out.push(_b2Indent(indent) + _b2Expr(m[1]) + ' = ' + _b2Expr(m[2])); continue; }

    out.push(_b2Indent(indent) + _b2Expr(t));
  }
  const generatedPython = out.join('\n');
  return { generatedPython, translatorId: 'baseline-b2', translatorVersion: '0.1.0' };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { baselineTranslate, baselineTranslateRaw, baselineTranslateRawB2 };
}
if (typeof window !== 'undefined') {
  window.baselineTranslate = baselineTranslate;
  window.baselineTranslateRaw = baselineTranslateRaw;
  window.baselineTranslateRawB2 = baselineTranslateRawB2;
}