/* ============================================================
   SOP 2 — statistics (pure, dependency-free, deterministic)

   Implements exactly what the SOP 2 report needs and nothing more:
   • wilson()        — Wilson score interval for a binomial proportion
   • mcnemarExact()  — exact (binomial) two-sided McNemar test for
                       paired pass/fail outcomes
   • wilcoxon()      — Wilcoxon signed-rank test for paired times
                       (exact for small n, normal approximation beyond)
   • median / quantile / iqr — order statistics for the timing report

   Usable from Node (`module.exports`) and the browser (`window.Sop2Stats`)
   exactly like src/research/line-metrics.js. No randomness, no I/O, no
   third-party code, so the numbers are reproducible across machines.
   ============================================================ */
(function (root) {
  'use strict';

  var Z_95 = 1.959963984540054;
  var SQRT2 = Math.sqrt(2);

  /* ---------- binomial helpers ---------- */

  function logChoose(n, k) {
    if (k < 0 || k > n) return -Infinity;
    if (k > n - k) k = n - k;
    var r = 0;
    for (var i = 1; i <= k; i++) r += Math.log(n - k + i) - Math.log(i);
    return r;
  }

  function binomPmf(k, n, p) {
    if (k < 0 || k > n) return 0;
    if (p === 0) return k === 0 ? 1 : 0;
    if (p === 1) return k === n ? 1 : 0;
    return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
  }

  /* ---------- normal CDF (Zelen & Severo approximation, ~1e-7) ---------- */

  function erf(z) {
    var sign = z < 0 ? -1 : 1;
    var x = Math.abs(z);
    var p = 0.3275911;
    var a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
      a4 = -1.453152027, a5 = 1.061405429;
    var t = 1 / (1 + p * x);
    var y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
  }

  function normalCdf(z) {
    return 0.5 * (1 + erf(z / SQRT2));
  }

  /* ---------- Wilson score interval ---------- */

  /**
   * Wilson score interval for `successes` out of `n`.
   * @returns {{p:number, low:number, high:number, n:number, successes:number, z:number}}
   */
  function wilson(successes, n, z) {
    z = z || Z_95;
    n = n || 0;
    successes = successes || 0;
    if (n <= 0) return { p: 0, low: 0, high: 0, n: 0, successes: 0, z: z };
    var p = successes / n;
    var z2 = z * z;
    var denom = 1 + z2 / n;
    var centre = (p + z2 / (2 * n)) / denom;
    var margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denom;
    return {
      p: p,
      low: Math.max(0, centre - margin),
      high: Math.min(1, centre + margin),
      n: n,
      successes: successes,
      z: z
    };
  }

  /* ---------- McNemar exact test ---------- */

  /**
   * Exact two-sided McNemar test on the discordant pair counts.
   * `b` = cases where side A passed and side B failed;
   * `c` = cases where side A failed and side B passed.
   * p = 2 * P(X <= min(b,c)) with X ~ Binomial(b+c, 0.5), capped at 1.
   */
  function mcnemarExact(b, c) {
    b = b || 0;
    c = c || 0;
    var n = b + c;
    if (n === 0) return { b: b, c: c, n: 0, p: 1 };
    var k = Math.min(b, c);
    var tail = 0;
    for (var i = 0; i <= k; i++) tail += binomPmf(i, n, 0.5);
    return { b: b, c: c, n: n, p: Math.min(1, 2 * tail) };
  }

  /* ---------- order statistics ---------- */

  /** Sorted copy. */
  function sorted(values) {
    return values.slice().sort(function (a, b) { return a - b; });
  }

  /**
   * Linear-interpolation percentile (R type 7), 0 <= q <= 1.
   */
  function quantile(values, q) {
    var v = sorted(values);
    if (!v.length) return 0;
    if (v.length === 1) return v[0];
    var pos = (v.length - 1) * q;
    var lo = Math.floor(pos);
    var hi = Math.ceil(pos);
    if (lo === hi) return v[lo];
    return v[lo] + (v[hi] - v[lo]) * (pos - lo);
  }

  function median(values) { return quantile(values, 0.5); }

  /** Interquartile range = Q3 - Q1. */
  function iqr(values) { return quantile(values, 0.75) - quantile(values, 0.25); }

  function mean(values) {
    if (!values.length) return 0;
    var t = 0;
    for (var i = 0; i < values.length; i++) t += values[i];
    return t / values.length;
  }

  /** Descriptive timing summary used by timing.js. */
  function describe(values) {
    return {
      n: values.length,
      median: median(values),
      q1: quantile(values, 0.25),
      q3: quantile(values, 0.75),
      iqr: iqr(values),
      mean: mean(values),
      min: values.length ? sorted(values)[0] : 0,
      max: values.length ? sorted(values)[values.length - 1] : 0
    };
  }

  /* ---------- Wilcoxon signed-rank ---------- */

  /** Midranks (average ranks for ties) for an array of values. */
  function midranks(values) {
    var n = values.length;
    var order = values.map(function (v, i) { return { v: v, i: i }; });
    order.sort(function (a, b) { return a.v - b.v; });
    var ranks = new Array(n);
    var i = 0;
    while (i < n) {
      var j = i;
      while (j + 1 < n && order[j + 1].v === order[i].v) j++;
      var avg = (i + j + 2) / 2; // ranks are 1..n
      for (var k = i; k <= j; k++) ranks[order[k].i] = avg;
      i = j + 1;
    }
    return ranks;
  }

  /** Exact null distribution of W+ via subset-sum DP over the given ranks. */
  function exactWPlusDistribution(ranks) {
    var total = ranks.reduce(function (a, b) { return a + b; }, 0);
    var counts = new Array(total + 1);
    for (var i = 0; i <= total; i++) counts[i] = 0;
    counts[0] = 1;
    for (var r = 0; r < ranks.length; r++) {
      var w = ranks[r];
      for (var s = total - w; s >= 0; s--) {
        if (counts[s] !== 0) counts[s + w] += counts[s];
      }
    }
    return { counts: counts, total: total };
  }

  /**
   * Wilcoxon signed-rank test on paired differences.
   *
   * @param {number[]} diffs paired differences (A - B); zeros are dropped
   * @returns {{n:number, wPlus:number, wMinus:number, statistic:number,
   *            p:number, method:string, hasTies:boolean}}
   */
  function wilcoxon(diffs) {
    var d = diffs.filter(function (x) { return x !== 0 && isFinite(x); });
    var n = d.length;
    if (n === 0) {
      return { n: 0, wPlus: 0, wMinus: 0, statistic: 0, p: 1, method: 'none', hasTies: false };
    }
    var abs = d.map(Math.abs);
    var ranks = midranks(abs);
    var hasTies = ranks.some(function (r) { return r !== Math.round(r); });
    var wPlus = 0, wMinus = 0;
    for (var i = 0; i < n; i++) {
      if (d[i] > 0) wPlus += ranks[i]; else wMinus += ranks[i];
    }
    var statistic = Math.min(wPlus, wMinus);

    // Exact when there are no ties and n is small enough for the DP to be cheap.
    if (!hasTies && n <= 25) {
      var dist = exactWPlusDistribution(ranks);
      var denom = Math.pow(2, n);
      var tail = 0;
      for (var s = 0; s <= statistic; s++) tail += dist.counts[s];
      var p = Math.min(1, 2 * (tail / denom));
      return { n: n, wPlus: wPlus, wMinus: wMinus, statistic: statistic, p: p, method: 'exact', hasTies: false };
    }

    // Normal approximation with tie correction.
    var total = ranks.reduce(function (a, b) { return a + b; }, 0);
    var mean = total / 2;
    var tieSum = 0;
    rankTieGroups(abs).forEach(function (g) {
      if (g > 1) tieSum += g * g * g - g;
    });
    var variance = (n * (n + 1) * (2 * n + 1)) / 24 - tieSum / 48;
    if (variance <= 0) return { n: n, wPlus: wPlus, wMinus: wMinus, statistic: statistic, p: 1, method: 'normal', hasTies: hasTies };
    var z = (wPlus - mean) / Math.sqrt(variance);
    var zc = Math.abs(z) - 0.5 / Math.sqrt(variance); // continuity correction
    var p2 = 2 * (1 - normalCdf(Math.max(0, zc)));
    return { n: n, wPlus: wPlus, wMinus: wMinus, statistic: statistic, p: Math.min(1, p2), method: 'normal', hasTies: hasTies };
  }

  function rankTieGroups(values) {
    var s = sorted(values);
    var groups = [];
    var i = 0;
    while (i < s.length) {
      var j = i;
      while (j + 1 < s.length && s[j + 1] === s[i]) j++;
      groups.push(j - i + 1);
      i = j + 1;
    }
    return groups;
  }

  var Sop2Stats = {
    Z_95: Z_95,
    wilson: wilson,
    mcnemarExact: mcnemarExact,
    wilcoxon: wilcoxon,
    median: median,
    quantile: quantile,
    iqr: iqr,
    mean: mean,
    describe: describe,
    normalCdf: normalCdf,
    binomPmf: binomPmf
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Sop2Stats;
  if (root) root.Sop2Stats = Sop2Stats;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
