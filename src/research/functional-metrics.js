/* ============================================================
   SOP 2 — functional correctness + text similarity (pure)

   Two clearly separated notions, because conflating them is the
   methodological flaw this module exists to remove:

   1) FUNCTIONAL CORRECTNESS (the real SOP 2a measure)
      A translation is correct only when the generated program runs
      in the shared runtime AND prints exactly what the reference
      program prints for the same input. stdout equality is the
      criterion; nothing here inspects the generated source.

   2) TEXT SIMILARITY (secondary, explicitly NOT correctness)
      Frequency-based line precision/recall/F1. Reported twice:
        • raw        — the original line-metrics output, unchanged
        • normalized — comments, blank lines, indentation-only
                       differences, and compiler-generated declaration
                       initializers removed, so a translator is no
                       longer penalised for harmless structural lines.

   Usable from Node (`module.exports`) and the browser (`window.Sop2Functional`).
   ============================================================ */
(function (root) {
  'use strict';

  function metricsCore() {
    if (root && root.MetricsCore) return root.MetricsCore;
    if (typeof require === 'function') {
      try { return require('./line-metrics'); } catch (e) { /* browser */ }
    }
    return null;
  }

  /* ---------- stdout normalisation ---------- */

  /** Canonical stdout: CRLF -> LF, strip trailing spaces, trim ends. */
  function normalizeOutput(text) {
    if (text == null) return '';
    return String(text)
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(function (line) { return line.replace(/[ \t]+$/, ''); })
      .join('\n')
      .replace(/^\n+/, '')
      .replace(/\n+$/, '');
  }

  /**
   * Do two programs print the same thing?
   * @returns {boolean}
   */
  function outputsMatch(a, b) {
    return normalizeOutput(a) === normalizeOutput(b);
  }

  /* ---------- text similarity normalisation ---------- */

  var DECL_INIT = /^(?:0|0\.0|""|''|\[\]|False|None)$/;

  /**
   * Remove non-semantic lines and canonicalise the rest:
   *   • strip `# …` comments (outside the line-metrics normaliser)
   *   • drop `# DECLARE name …` preludes together with the single
   *     `name = <default>` initializer the code generator emits for them
   *   • drop blank lines
   *   • collapse whitespace runs and strip spaces around punctuation
   */
  function normalizeSemantic(code) {
    var lines = String(code == null ? '' : code).replace(/\r\n?/g, '\n').split('\n');
    var drop = new Array(lines.length).fill(false);

    // Pass 1: pair `# DECLARE name` with the following default initializer.
    for (var i = 0; i < lines.length; i++) {
      var m = /^\s*#\s*DECLARE\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(lines[i]);
      if (!m) continue;
      var name = m[1];
      for (var j = i + 1; j < lines.length; j++) {
        var t = lines[j].trim();
        if (t === '') continue;
        var init = new RegExp('^' + name + '\\s*=\\s*(.+)$');
        var im = init.exec(t);
        if (im && DECL_INIT.test(im[1].trim())) { drop[j] = true; }
        break;
      }
      drop[i] = true;
    }

    var out = [];
    for (var k = 0; k < lines.length; k++) {
      if (drop[k]) continue;
      var line = lines[k];
      // Remove inline/whole-line comments () unless the # is inside a string.
      line = stripComment(line);
      if (line.trim() === '') continue;
      out.push(canonicalizeLine(line));
    }
    return out.join('\n');
  }

  function stripComment(line) {
    var inSingle = false, inDouble = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '\\') { i++; continue; }
      if (ch === "'" && !inDouble) inSingle = !inSingle;
      else if (ch === '"' && !inSingle) inDouble = !inDouble;
      else if (ch === '#' && !inSingle && !inDouble) return line.slice(0, i);
    }
    return line;
  }

  /** Normalise a line's whitespace/indentation without changing its tokens. */
  function canonicalizeLine(line) {
    var leading = (line.match(/^\s*/) || [''])[0].length;
    var body = line.trim();
    body = body
      .replace(/\s+/g, ' ')
      .replace(/\s*([=+\-*/%<>!&|^]+)\s*/g, ' $1 ')
      .replace(/\s*([(),:\[\]])\s*/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    var indentLevels = Math.round(leading / 4);
    return '    '.repeat(Math.max(0, indentLevels)) + body;
  }

  /**
   * Text similarity for one generated/expected pair.
   * @returns {{raw:object, normalized:object}} line-metric objects
   */
  function textSimilarity(gen, exp) {
    var core = metricsCore();
    if (!core || typeof core.lineMetrics !== 'function') {
      throw new Error('MetricsCore unavailable for textSimilarity');
    }
    return {
      raw: core.lineMetrics(gen || '', exp || ''),
      normalized: core.lineMetrics(normalizeSemantic(gen), normalizeSemantic(exp))
    };
  }

  /* ---------- functional verdict ---------- */

  /**
   * Functional outcome for one side of one case.
   * @param {{rejected?:boolean, emitted?:boolean, syntaxOk:boolean|null,
   *          runtimeOk:boolean|null, stdout?:string}} side
   * @param {string} referenceStdout
   */
  function functionalOutcome(side, referenceStdout) {
    var ran = side.runtimeOk === true;
    var matches = ran && outputsMatch(side.stdout, referenceStdout);
    return {
      ran: ran,
      outputMatches: matches,
      correct: matches
    };
  }

  var Sop2Functional = {
    normalizeOutput: normalizeOutput,
    outputsMatch: outputsMatch,
    normalizeSemantic: normalizeSemantic,
    canonicalizeLine: canonicalizeLine,
    stripComment: stripComment,
    textSimilarity: textSimilarity,
    functionalOutcome: functionalOutcome
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Sop2Functional;
  if (root) root.Sop2Functional = Sop2Functional;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
