/* ============================================================
   SOP 2 — timing harness (pure)

   Generation time is measured around TRANSLATION ONLY: raw text ->
   Python. Bundle loading, VM creation, validation and execution are
   never inside the timer. Browser clocks are coarse, so a single
   measurement is meaningless; each case is warmed up and then run in
   a batch, and the batch divided by the iteration count. Across cases
   the report uses the median and IQR, never the mean of single shots.
   ============================================================ */
(function (root) {
  'use strict';

  function defaultNow() {
    if (root && root.performance && typeof root.performance.now === 'function') return root.performance.now();
    return Date.now();
  }

  /**
   * @param {Function} fn the translation callable (already bound to its input)
   * @param {{warmup?:number, iters?:number, now?:Function}} [opts]
   * @returns {{warmup:number, iterations:number, totalMs:number, perIterationMs:number}}
   */
  function measure(fn, opts) {
    opts = opts || {};
    var warmup = opts.warmup == null ? 5 : opts.warmup;
    var iters = opts.iters == null ? 200 : opts.iters;
    var clock = opts.now || defaultNow;
    var i;
    for (i = 0; i < warmup; i++) fn();
    var t0 = clock();
    for (i = 0; i < iters; i++) fn();
    var t1 = clock();
    var totalMs = t1 - t0;
    return {
      warmup: warmup,
      iterations: iters,
      totalMs: totalMs,
      perIterationMs: iters ? totalMs / iters : 0
    };
  }

  /**
   * Time a one-off setup cost (bundle load + VM + engine construction).
   * @returns {{setupMs:number, value:*}}
   */
  function measureSetup(fn, opts) {
    var clock = (opts && opts.now) || defaultNow;
    var t0 = clock();
    var value = fn();
    var t1 = clock();
    return { setupMs: t1 - t0, value: value };
  }

  var Sop2Timing = { measure: measure, measureSetup: measureSetup, now: defaultNow };

  if (typeof module !== 'undefined' && module.exports) module.exports = Sop2Timing;
  if (root) root.Sop2Timing = Sop2Timing;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
