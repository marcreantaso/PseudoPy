/* ============================================================
   SOP 2 — error taxonomy (pure)

   Every (case, translator) pair lands in exactly one class so the
   SOP 2b answers can be stated per failure mode instead of as a
   single blended "error rate":

     rejected      — the translator declined the input and said so
                     (PseudoPy's validation mechanism). A handled,
                     WARNED outcome — not a silent failure.
     syntax_error  — the translator emitted Python that does not
                     compile.
     runtime_error — emitted Python compiles but raises when run.
     wrong_output  — emitted Python runs but prints something other
                     than the reference output.
     correct       — runs and prints exactly the reference output.
     unverified    — the shared interpreter was unavailable, so no
                     verdict could be reached (never counted as a
                     failure).

   "Silent failure" = syntax_error | runtime_error | wrong_output on a
   side that issued NO warning. This is where a validation mechanism is
   supposed to matter, so it is reported separately from raw errors.

   Usable from Node (`module.exports`) and the browser (`window.Sop2Taxonomy`).
   ============================================================ */
(function (root) {
  'use strict';

  var CLASSES = ['correct', 'wrong_output', 'runtime_error', 'syntax_error', 'rejected', 'unverified'];
  var FAILURE_CLASSES = { syntax_error: true, runtime_error: true, wrong_output: true };

  /**
   * @param {{rejected?:boolean, hasWarning?:boolean, syntaxOk:boolean|null,
   *          runtimeOk:boolean|null, outputMatches?:boolean}} side
   * @returns {string} one of CLASSES
   */
  function classify(side) {
    side = side || {};
    if (side.rejected === true) return 'rejected';
    if (side.syntaxOk === null || side.syntaxOk === undefined) return 'unverified';
    if (side.syntaxOk === false) return 'syntax_error';
    if (side.runtimeOk === null || side.runtimeOk === undefined) return 'unverified';
    if (side.runtimeOk === false) return 'runtime_error';
    if (side.outputMatches === true) return 'correct';
    return 'wrong_output';
  }

  function isFailure(cls) { return FAILURE_CLASSES[cls] === true; }

  /** A failure the translator did not warn about. */
  function isSilentFailure(cls, hasWarning) {
    return isFailure(cls) && hasWarning !== true;
  }

  /** Percentage reduction from `from` to `to` (null when `from` is 0). */
  function reductionPct(from, to) {
    if (!from) return null;
    return ((from - to) / from) * 100;
  }

  function emptyCounts() {
    var c = {};
    CLASSES.forEach(function (k) { c[k] = 0; });
    return c;
  }

  /**
   * Aggregate a list of side verdicts.
   * @param {Array<{class:string, hasWarning:boolean}>} sides
   * @returns {object} counts + derived rates
   */
  function summarize(sides) {
    var counts = emptyCounts();
    var silent = 0;
    var cases = sides.length;
    sides.forEach(function (s) {
      var cls = s.class;
      if (counts[cls] === undefined) counts[cls] = 0;
      counts[cls]++;
      if (isSilentFailure(cls, s.hasWarning)) silent++;
    });
    var evaluated = cases - counts.unverified;
    return {
      cases: cases,
      counts: counts,
      evaluated: evaluated,
      correct: counts.correct,
      wrongOutput: counts.wrong_output,
      runtimeErrors: counts.runtime_error,
      syntaxErrors: counts.syntax_error,
      rejected: counts.rejected,
      unverified: counts.unverified,
      failures: counts.wrong_output + counts.runtime_error + counts.syntax_error,
      silentFailures: silent,
      // denominators are the evaluable cases, never the raw case count
      correctnessRate: evaluated ? counts.correct / evaluated : 0,
      syntaxErrorRate: evaluated ? counts.syntax_error / evaluated : 0,
      runtimeErrorRate: evaluated ? counts.runtime_error / evaluated : 0,
      wrongOutputRate: evaluated ? counts.wrong_output / evaluated : 0,
      rejectedRate: evaluated ? counts.rejected / evaluated : 0,
      silentFailureRate: evaluated ? silent / evaluated : 0
    };
  }

  var Sop2Taxonomy = {
    CLASSES: CLASSES,
    classify: classify,
    isFailure: isFailure,
    isSilentFailure: isSilentFailure,
    reductionPct: reductionPct,
    summarize: summarize,
    emptyCounts: emptyCounts
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Sop2Taxonomy;
  if (root) root.Sop2Taxonomy = Sop2Taxonomy;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
