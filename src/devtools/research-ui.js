/* ============================================================
   SOP 2 — Traditional baseline vs PseudoPy (DevTools panel)

   An honest experiment surface, not a demo:

   • 2a Functional correctness is stdout equality against the reference
     program, executed in Skulpt — the same criterion the Node harness
     uses. Text similarity is shown but labelled as secondary.
   • 2b Error taxonomy classifies every case and reports silent
     failures separately from detected ones.
   • 2c Translation time measures raw text -> Python only (warm-ups +
     batched loop); bundle load and execution are excluded.
   • Two baselines (B1 naive, B2 reasonable rule-based) and three
     dataset groups (seed / holdout / injected), never blended.

   All statistics, summaries, CSV and Markdown come from the shared
   modules in src/research/ (Sop2Functional, Sop2Taxonomy, Sop2Stats,
   Sop2Report, Sop2Dataset, Sop2Timing) so the panel and the Node
   harness cannot drift apart. Browser code only — no module loader here.
   ============================================================ */
(function () {
  'use strict';

  var METRICS_VERSION = '2.0.0';
  // Benchmark timing is a smaller batch than the Node harness because the
  // browser clock is coarser and Skulpt execution dominates wall time.
  var BENCH_TIMING_ITERS = 5;
  var BENCH_TIMING_WARMUP = 1;
  var PAGE_SIZE = 20;

  var engineRef = null;
  var lastDoc = null;
  var isStale = false;
  var benchCancelled = false;
  var pageState = { filter: 'all', page: 0 };

  function $(id) { return document.getElementById(id); }
  function setStatus(msg) { var el = $('sop2-status'); if (el) el.textContent = msg || ''; }
  function round3(n) { return Math.round(n * 1000) / 1000; }
  function round4(n) { return Math.round(n * 10000) / 10000; }

  function esc(s) {
    return (s == null ? '' : String(s))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function download(name, content, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  // ── shared research modules (browser globals) ───────────────
  function Functional() { return window.Sop2Functional; }
  function Taxonomy() { return window.Sop2Taxonomy; }
  function Stats() { return window.Sop2Stats; }
  function Report() { return window.Sop2Report; }
  function Dataset() { return window.Sop2Dataset; }

  function similarity(gen, exp) {
    var F = Functional();
    if (!F) throw new Error('Sop2Functional not loaded (rebuild devtools bundle)');
    return F.textSimilarity(gen, exp);
  }
  function outputsMatch(a, b) { var F = Functional(); return F ? F.outputsMatch(a, b) : (a === b); }
  function classifySide(side) {
    var T = Taxonomy();
    return T ? T.classify(side) : (side.outputMatches ? 'correct' : 'wrong_output');
  }
  function isSilent(side) {
    var T = Taxonomy();
    return T ? T.isSilentFailure(side.class, side.hasWarning) : false;
  }
  function norm(src) {
    var s = src == null ? '' : String(src);
    if (typeof normalizeUnicodeOperators === 'function') s = normalizeUnicodeOperators(s);
    if (typeof normalizeLineNumbers === 'function') s = normalizeLineNumbers(s);
    return s;
  }

  function getEngine() {
    if (engineRef) return engineRef;
    if (typeof PseudocodeCompiler === 'undefined') throw new Error('Compiler not loaded');
    engineRef = new PseudocodeCompiler();
    return engineRef;
  }

  function readSource() {
    var a = $('sop2-src');
    if (a && a.value) return a.value;
    var b = $('devtools-pseudocode');
    return (b && b.value) || '';
  }
  function readRef() { var r = $('sop2-ref'); return (r && r.value) || ''; }
  function selectedTier() { var t = $('sop2-tier'); return (t && t.value) || 'baselineB2'; }
  function tierLabel(key) {
    var R = Report();
    if (R && R.SIDE_LABELS && R.SIDE_LABELS[key]) return R.SIDE_LABELS[key];
    return key === 'pseudopy' ? 'PseudoPy' : (key === 'baselineB2' ? 'Baseline B2' : 'Baseline B1');
  }

  // ── Skulpt: one runtime for every translator and the reference ──
  function ensureSk() {
    return new Promise(function (resolve) {
      if (typeof Sk !== 'undefined') { resolve(true); return; }
      if (typeof ensureSkulptLoaded !== 'function') { resolve(false); return; }
      ensureSkulptLoaded(function () { resolve(true); }, function () { resolve(false); });
    });
  }

  function skSyntax(py) {
    if (typeof Sk === 'undefined' || typeof Sk.parse !== 'function') {
      return { ok: null, error: 'Skulpt runtime unavailable' };
    }
    try {
      if (typeof Sk.configure === 'function' && !Sk.__future__) Sk.configure({ __future__: Sk.python3 });
      Sk.parse('<sop2-syntax>', py);
      return { ok: true, error: null };
    } catch (e) {
      return { ok: false, error: (e && e.toString) ? e.toString() : String(e) };
    }
  }

  function skRun(py) {
    if (typeof Sk === 'undefined') {
      return Promise.resolve({ ok: null, error: 'Skulpt runtime unavailable', stdout: '' });
    }
    var out = [];
    var limitOpts = (typeof skulptExecLimitOptions === 'function')
      ? skulptExecLimitOptions()
      : { execLimit: 15000 };
    Sk.configure(Object.assign({
      output: function (text) { out.push(text); },
      read: function (x) {
        if (Sk.builtinFiles === undefined || Sk.builtinFiles['files'][x] === undefined) {
          throw "File not found: '" + x + "'";
        }
        return Sk.builtinFiles['files'][x];
      },
      inputfun: function () { return ''; },
      inputfunTakesPrompt: true,
      __future__: Sk.python3
    }, limitOpts));
    return Sk.misceval.asyncToPromise(function () {
      return Sk.importMainWithBody('<stdin>', false, py, true);
    }).then(function () {
      return { ok: true, error: null, stdout: out.join('') };
    }, function (e) {
      return { ok: false, error: (e && e.toString) ? e.toString() : String(e), stdout: out.join('') };
    });
  }

  // ── measure one translator (translation only, timed) ────────
  function measureSide(key, ctx) {
    var T = window.Sop2Timing;
    var out = {
      side: key, generatedPython: '', rejected: false, emitted: false, hasWarning: false,
      compileSuccess: false, syntaxSuccess: null, syntaxError: null,
      runtimeSuccess: null, runtimeError: null, stdout: '',
      outputMatches: false, correct: false, class: 'unverified',
      generationTimeMs: 0, errors: []
    };
    var iters = ctx.timingIters == null ? BENCH_TIMING_ITERS : ctx.timingIters;
    var warmup = ctx.timingWarmup == null ? BENCH_TIMING_WARMUP : ctx.timingWarmup;
    var measured = (T ? T.measure : fallbackMeasure)(function () {
      if (key === 'pseudopy') {
        var res = { valid: false, python: '', errors: [] };
        try { res = ctx.engine.compile(ctx.source); } catch (e) { res = { valid: false, python: '', errors: [e.message || String(e)] }; }
        out.generatedPython = res.python || '';
        out.rejected = res.valid === false || !out.generatedPython;
        out.errors = (res.errors || []).map(function (x) { return typeof x === 'string' ? x : (x.message || String(x)); });
      } else if (key === 'baseline') {
        out.generatedPython = (window.baselineTranslateRaw ? window.baselineTranslateRaw(ctx.source) : {}).generatedPython || '';
      } else {
        out.generatedPython = (window.baselineTranslateRawB2 ? window.baselineTranslateRawB2(ctx.source) : {}).generatedPython || '';
      }
      return out.generatedPython;
    }, { warmup: warmup, iters: iters });
    out.generationTimeMs = round4(measured.perIterationMs);
    out.timing = { iterations: measured.iterations, warmup: measured.warmup, totalMs: round4(measured.totalMs) };
    out.emitted = !!out.generatedPython && out.generatedPython.trim() !== '';
    out.hasWarning = key === 'pseudopy' && out.rejected;
    return out;
  }

  function fallbackMeasure(fn, opts) {
    opts = opts || {};
    var warmup = opts.warmup == null ? 5 : opts.warmup;
    var iters = opts.iters == null ? 200 : opts.iters;
    var now = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };
    for (var w = 0; w < warmup; w++) fn();
    var t0 = now();
    for (var i = 0; i < iters; i++) fn();
    var t1 = now();
    var totalMs = t1 - t0;
    return { warmup: warmup, iterations: iters, totalMs: totalMs, perIterationMs: iters ? totalMs / iters : 0 };
  }

  // ── one comparable row (mirrors the Node harness shape) ─────
  function buildRow(src, ref, opts) {
    opts = opts || {};
    var ctx = {
      source: src,
      engine: opts.engine || getEngine(),
      timingIters: opts.timingIters,
      timingWarmup: opts.timingWarmup
    };
    var sides = {
      pseudopy: measureSide('pseudopy', ctx),
      baseline: measureSide('baseline', ctx),
      baselineB2: measureSide('baselineB2', ctx)
    };

    var keys = ['pseudopy', 'baseline', 'baselineB2'];
    var syntax = {};
    keys.forEach(function (k) {
      var s = sides[k];
      syntax[k] = s.emitted ? skSyntax(s.generatedPython) : { ok: null, error: null };
    });

    var refRunP = opts.withRuntime ? skRun(ref) : Promise.resolve({ ok: null, error: null, stdout: '' });
    var runPs = {};
    if (opts.withRuntime) {
      keys.forEach(function (k) {
        var s = sides[k];
        runPs[k] = (s.emitted && syntax[k].ok === true)
          ? skRun(s.generatedPython)
          : Promise.resolve({ ok: null, error: null, stdout: '' });
      });
    }

    return refRunP.then(function (reference) {
      return Promise.all(keys.map(function (k) { return runPs[k] || Promise.resolve(null); }))
        .then(function (runs) {
          keys.forEach(function (k, i) {
            var s = sides[k];
            var run = runs[i] || { ok: null, error: null, stdout: '' };
            s.syntaxSuccess = syntax[k].ok;
            s.syntaxError = syntax[k].error;
            s.compileSuccess = syntax[k].ok === true;
            s.runtimeSuccess = opts.withRuntime ? run.ok : null;
            s.runtimeError = run.error;
            s.stdout = run.stdout || '';
            s.outputMatches = syntax[k].ok === true && run.ok === true && outputsMatch(s.stdout, reference.stdout);
            s.class = classifySide({
              rejected: s.rejected,
              hasWarning: s.hasWarning,
              syntaxOk: s.emitted ? syntax[k].ok : (s.rejected ? null : false),
              runtimeOk: opts.withRuntime && s.emitted ? run.ok : null,
              outputMatches: s.outputMatches
            });
            s.correct = s.class === 'correct';
          });

          var metrics = {};
          keys.forEach(function (k) {
            var sim = similarity(sides[k].generatedPython, ref);
            metrics[k] = Object.assign({}, sim.raw, { raw: sim.raw, normalized: sim.normalized });
          });

          return {
            caseId: opts.caseId || 'ui',
            title: opts.title || null,
            group: opts.group || 'single',
            injectionType: opts.injectionType || null,
            baseId: opts.baseId || null,
            injectionDetail: opts.injectionDetail || null,
            input: src,
            expectedPython: ref,
            reference: { ok: reference.ok, stdout: reference.stdout, error: reference.error },
            pseudopy: sides.pseudopy,
            baseline: sides.baseline,
            baselineB2: sides.baselineB2,
            metrics: metrics
          };
        });
    });
  }

  // ── documents / aggregation (shared with the Node harness) ──
  function buildDoc(results, kind, opts) {
    opts = opts || {};
    var R = Report();
    var groups = (R && R.summarizeGroups) ? R.summarizeGroups(results) : null;
    return {
      metadata: {
        timestamp: new Date().toISOString(),
        schemaVersion: 2,
        cases: results.length,
        kind: kind,
        compiler: 'PseudoPy',
        baselines: { B1: 'naive keyword substitution', B2: 'reasonable rule-based (no validation)' },
        runtime: (typeof Sk !== 'undefined') ? 'skulpt' : 'unavailable',
        metricsVersion: METRICS_VERSION,
        correctnessDefinition: 'generated program runs and stdout equals the reference program stdout',
        timingMethod: 'translation only; warm-ups then batched iterations; median/IQR across cases',
        setup: opts.setup || null,
        scope: opts.scope || null
      },
      dataset: opts.dataset || null,
      summary: (R && R.summarize) ? R.summarize(results) : null,
      groups: groups,
      stats: (R && R.computeStats) ? R.computeStats(results) : null,
      results: results
    };
  }

  // ── rendering helpers ───────────────────────────────────────
  function badge(cls) {
    var labels = {
      correct: ['Correct', 'ok'], rejected: ['Rejected', 'warn'], syntax_error: ['Syntax error', 'bad'],
      runtime_error: ['Runtime error', 'bad'], wrong_output: ['Wrong output', 'bad'], unverified: ['Unverified', 'na']
    };
    var l = labels[cls] || [cls, 'na'];
    return '<span class="sop2-badge sop2-badge-' + l[1] + '">' + esc(l[1] === 'na' ? l[0] : l[0]) + '</span>';
  }

  function friendlyError(side) {
    if (side.class === 'correct') return 'Runs and prints exactly the reference output.';
    if (side.class === 'rejected') return 'Declined the input before generating Python (validation mechanism).';
    if (side.class === 'syntax_error') return 'Generated Python does not compile.';
    if (side.class === 'runtime_error') return 'Generated Python raised an error when run.';
    if (side.class === 'wrong_output') return 'Ran, but printed different output than the reference.';
    return 'Could not be verified in this runtime.';
  }

  function diffLines(generated, reference) {
    var F = Functional();
    var refSet = {};
    String(reference || '').replace(/\r\n?/g, '\n').split('\n').forEach(function (line) {
      var key = line.trim();
      if (key) refSet[key] = true;
    });
    var normalFn = (F && F.normalizeSemantic) ? F.normalizeSemantic : function (x) { return x; };
    var refNorm = {};
    normalFn(reference).split('\n').forEach(function (line) { if (line.trim()) refNorm[line.trim()] = true; });
    return String(generated || '').replace(/\r\n?/g, '\n').split('\n').map(function (line) {
      var t = line.trim();
      var match = !t || refSet[t] || refNorm[normalFn(line).trim()];
      return { text: line, match: !!match };
    });
  }

  function codeBlock(id, generated, reference, label) {
    var lines = diffLines(generated, reference);
    var rows = lines.map(function (l, i) {
      var cls = l.match ? 'sop2-line sop2-line-match' : 'sop2-line sop2-line-extra';
      if (!l.text.trim()) cls = 'sop2-line sop2-line-empty';
      return '<span class="' + cls + '"><span class="sop2-ln" aria-hidden="true">' + (i + 1) + '</span>' +
        '<span class="sop2-lc">' + (l.text ? esc(l.text) : '&nbsp;') + '</span></span>';
    }).join('');
    return '<div class="sop2-code" role="group" aria-label="' + esc(label) + '">' +
      (rows || '<span class="sop2-line sop2-line-empty"><span class="sop2-lc">(no output)</span></span>') + '</div>';
  }

  function metricRow(label, value) {
    return '<div class="sop2-kv-row"><dt>' + esc(label) + '</dt><dd>' + value + '</dd></div>';
  }

  function renderSideCard(key, row, tierKey) {
    var side = row[key];
    var isPP = key === 'pseudopy';
    var metrics = row.metrics[key];
    var cls = side.class;
    var errText = side.syntaxError || side.runtimeError || '';
    var rejected = isPP && side.rejected;
    var why = friendlyError(side);
    if (rejected && side.errors && side.errors.length) why += ' ' + side.errors.join(' ');
    return '<article class="sop2-card' + (isPP ? ' sop2-card-pseudopy' : '') + '">' +
      '<header class="sop2-card-head"><h4>' + esc(tierLabel(key)) + '</h4>' + badge(cls) + '</header>' +
      '<dl class="sop2-kv">' +
        metricRow('Outcome', esc(why)) +
        metricRow('Translation time', round3(side.generationTimeMs) + ' ms' +
          (side.timing ? ' <span class="sop2-sub">(' + side.timing.iterations + ' iterations)</span>' : '')) +
        metricRow('Functional correctness', side.correct
          ? '<span class="sop2-ok">matches reference output</span>'
          : (side.outputMatches ? 'n/a' : '<span class="sop2-bad">does not match</span>')) +
        metricRow('Line similarity (secondary)', 'P ' + round3(metrics.precision) + ' &middot; R ' + round3(metrics.recall) +
          ' &middot; F1 ' + round3(metrics.f1) + ' <span class="sop2-sub">(normalized F1 ' +
          round3(metrics.normalized ? metrics.normalized.f1 : metrics.f1) + ')</span>') +
      '</dl>' +
      '<div class="sop2-code-head">Generated Python' +
        '<span class="sop2-legend"><span class="sop2-swatch sop2-line-match"></span> also in reference' +
        '<span class="sop2-swatch sop2-line-extra"></span> different</span></div>' +
      codeBlock('sop2-code-' + key, side.generatedPython, row.expectedPython, tierLabel(key) + ' generated Python') +
      (errText ? '<details class="sop2-details"><summary>Error details</summary><pre class="sop2-errors">' +
        esc(errText) + '</pre></details>' : '') +
      '</article>';
  }

  function renderCase(row) {
    var tier = selectedTier();
    return '<div class="sop2-cards">' + renderSideCard(tier, row, tier) +
      renderSideCard('pseudopy', row, tier) + '</div>' +
      '<p class="sop2-footnote">Correctness = the generated program runs and its printed output equals the ' +
      'reference program. Similarity is frequency-based and shown only as context.</p>';
  }

  // ── charts (shared .an-chart-card styling, 250px plot) ──────
  var CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

  function svgBars(chart) {
    var W = 640, H = 250, padL = 46, padR = 12, padT = 14, padB = 52;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var max = chart.max || 100;
    var cats = chart.categories || [];
    var series = chart.series || [];
    var groupW = cats.length ? plotW / cats.length : plotW;
    var barW = Math.min(38, (groupW * 0.7) / Math.max(1, series.length));
    var svg = ['<svg class="an-svg sop2-chart-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(chart.title) + '">'];
    for (var t = 0; t <= 4; t++) {
      var y = padT + plotH - (plotH * t / 4);
      var val = (max * t / 4);
      svg.push('<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" class="an-grid-line"/>');
      svg.push('<text x="' + (padL - 6) + '" y="' + (y + 3) + '" text-anchor="end" class="an-axis-label">' +
        Math.round(val) + (chart.suffix || '') + '</text>');
    }
    cats.forEach(function (cat, ci) {
      var gx = padL + groupW * ci + groupW / 2;
      var totalW = barW * series.length + 4 * (series.length - 1);
      var startX = gx - totalW / 2;
      series.forEach(function (s, si) {
        var v = Math.max(0, Math.min(max, cat.values[si] || 0));
        var h = plotH * (v / max);
        var x = startX + si * (barW + 4);
        var y = padT + plotH - h;
        svg.push('<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + Math.max(0.5, h) +
          '" rx="3" fill="' + (s.color || CHART_COLORS[si % CHART_COLORS.length]) + '"><title>' +
          esc(cat.label + ' — ' + s.name + ': ' + v + (chart.suffix || '')) + '</title></rect>');
      });
      svg.push('<text x="' + gx + '" y="' + (padT + plotH + 18) + '" text-anchor="middle" class="an-axis-label">' +
        esc(cat.label) + '</text>');
    });
    svg.push('</svg>');
    var legend = series.map(function (s, si) {
      return '<span class="an-legend-chip"><span class="an-legend-dot" style="background:' +
        (s.color || CHART_COLORS[si % CHART_COLORS.length]) + '"></span>' + esc(s.name) + '</span>';
    }).join('');
    return '<figure class="an-chart-card an-grow">' +
      '<figcaption class="an-chart-header"><div><span class="an-chart-title">' + esc(chart.title) + '</span>' +
      (chart.note ? '<p class="sop2-chart-note">' + esc(chart.note) + '</p>' : '') + '</div></figcaption>' +
      '<div class="sop2-chart-legend">' + legend + '</div>' + svg.join('') + '</figure>';
  }

  function correctnessChart(doc) {
    var groups = ['seed', 'holdout', 'injected'].filter(function (g) { return doc.groups && doc.groups[g]; });
    var cats = groups.map(function (g) {
      return {
        label: g,
        values: [
          Math.round(doc.groups[g].pseudopy.correctnessRate * 100),
          Math.round(doc.groups[g].baseline.correctnessRate * 100),
          Math.round(doc.groups[g].baselineB2.correctnessRate * 100)
        ]
      };
    });
    return svgBars({
      title: 'SOP 2a — Functional correctness by group', suffix: '%', max: 100, categories: cats,
      series: [
        { name: 'PseudoPy', color: 'var(--chart-1)' },
        { name: 'Baseline B1', color: 'var(--chart-2)' },
        { name: 'Baseline B2', color: 'var(--chart-3)' }
      ],
      note: 'stdout equality vs reference; groups never blended'
    });
  }

  function outcomeChart(doc) {
    var keys = ['pseudopy', 'baseline', 'baselineB2'];
    var total = doc.results.filter(function (r) { return r.group !== 'injected'; }).length || 1;
    var categories = [
      { label: 'PseudoPy', values: [] }, { label: 'B1', values: [] }, { label: 'B2', values: [] }
    ];
    categories.forEach(function (cat, i) {
      var key = ['pseudopy', 'baseline', 'baselineB2'][i];
      var s = doc.summary[key];
      cat.values = [s.correct, s.rejected, s.silentFailures];
    });
    return svgBars({
      title: 'Outcome mix by translator (well-formed cases)',
      note: 'rejected = validation caught it; silent = ran or failed with no warning',
      max: total,
      suffix: '',
      categories: categories,
      series: [
        { name: 'Correct', color: CHART_COLORS[0] },
        { name: 'Rejected (warned)', color: 'var(--chart-4)' },
        { name: 'Silent failures', color: 'var(--chart-5)' }
      ]
    });
  }

  // ── benchmark report ────────────────────────────────────────
  function pctOf(x) { return Math.round(x * 1000) / 10 + '%'; }

  function statCards(doc) {
    var tier = selectedTier();
    var seed = doc.groups.seed, hold = doc.groups.holdout, inj = doc.groups.injected;
    var cards = [];

    function aaRow(label, s) {
      if (!s) return '';
      var pp = s.pseudopy.correctnessRate, bl = s[tier].correctnessRate;
      var rel = bl > 0 ? ((pp - bl) / bl) * 100 : null;
      return '<tr><th scope="row">' + esc(label) + '</th><td>' + pctOf(pp) + '</td><td>' + pctOf(bl) +
        '</td><td>' + (rel == null ? (pp > 0 ? 'n/a' : '0%') : (rel >= 0 ? '+' : '') + Math.round(rel * 10) / 10 + '%') + '</td></tr>';
    }
    cards.push('<section class="sop2-statcard"><h4>2a &middot; Functional correctness</h4>' +
      '<p class="sop2-statq">Do the generated programs print the reference output?</p>' +
      '<table class="sop2-mini"><thead><tr><th scope="col">Group</th><th scope="col">PseudoPy</th><th scope="col">' +
      esc(tierLabel(tier)) + '</th><th scope="col">Relative</th></tr></thead><tbody>' +
      aaRow('Seed', seed) + aaRow('Holdout', hold) + aaRow('Injected', inj) + '</tbody></table></section>');

    var rows = doc.results.filter(function (r) { return r.group !== 'injected'; });
    var detected = inj ? inj.pseudopy.rejected + '/' + inj.cases : 'n/a';
    cards.push('<section class="sop2-statcard"><h4>2b &middot; Error detection</h4>' +
      '<p class="sop2-statq">Are malformed inputs caught before they fail silently?</p>' +
      '<table class="sop2-mini"><thead><tr><th scope="col">Translator</th><th scope="col">Rejected (warned)</th>' +
      '<th scope="col">Silent failures</th></tr></thead><tbody>' +
      ['pseudopy', 'baseline', 'baselineB2'].map(function (k) {
        var injS = inj ? inj[k] : null; var wfS = doc.summary[k];
        return '<tr><th scope="row">' + esc(tierLabel(k)) + '</th><td>' +
          (injS ? injS.rejected + '/' + injS.cases : '0') + '</td><td>' +
          (injS ? injS.silentFailures : 0) + ' (injected) &middot; ' + wfS.silentFailures + ' (well-formed)</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="sop2-sub">Injected set: ' + (inj ? inj.cases + ' deliberately broken cases' : 'not run') + '.</p></section>');

    var R = Report();
    var mPP = R.medianOf(doc.results, 'pseudopy'), mB1 = R.medianOf(doc.results, 'baseline'), mB2 = R.medianOf(doc.results, 'baselineB2');
    cards.push('<section class="sop2-statcard"><h4>2c &middot; Translation time</h4>' +
      '<p class="sop2-statq">How long does raw text &rarr; Python take (translation only)?</p>' +
      '<table class="sop2-mini"><thead><tr><th scope="col">Translator</th><th scope="col">Median</th>' +
      '<th scope="col">IQR</th></tr></thead><tbody>' +
      [['pseudopy', mPP], ['baseline', mB1], ['baselineB2', mB2]].map(function (pair) {
        return '<tr><th scope="row">' + esc(tierLabel(pair[0])) + '</th><td>' + round3(pair[1]) + ' ms</td><td>' +
          round3(R.iqrOf(doc.results, pair[0])) + ' ms</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="sop2-sub">Validation adds about ' + round3(mPP - mB1) + ' ms per translation vs B1.</p></section>');

    return '<div class="sop2-statcards">' + cards.join('') + '</div>';
  }

  function filterRow(r, filter) {
    if (filter === 'all') return true;
    if (filter === 'injected') return r.group === 'injected';
    if (r.group === 'injected') return false;
    if (filter === 'differ') return r.pseudopy.class !== r.baselineB2.class || !r.pseudopy.correct;
    if (filter === 'pp-fail') return !r.pseudopy.correct;
    if (filter === 'bl-fail') return !r[selectedTier()].correct;
    return true;
  }

  function renderTable(doc) {
    var rows = doc.results.filter(function (r) { return filterRow(r, pageState.filter); });
    var pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (pageState.page >= pages) pageState.page = pages - 1;
    var slice = rows.slice(pageState.page * PAGE_SIZE, pageState.page * PAGE_SIZE + PAGE_SIZE);
    var tier = selectedTier();
    var filters = [['all', 'All'], ['differ', 'Differences'], ['pp-fail', 'PseudoPy failures'],
      ['bl-fail', tierLabel(tier) + ' failures'], ['injected', 'Injected']];
    var head = '<div class="sop2-table-tools">' +
      '<label class="sop2-field" for="sop2-filter"><span>Filter</span><select id="sop2-filter">' +
      filters.map(function (f) {
        return '<option value="' + f[0] + '"' + (pageState.filter === f[0] ? ' selected' : '') + '>' + esc(f[1]) + '</option>';
      }).join('') + '</select></label>' +
      '<span class="sop2-count">' + rows.length + ' of ' + doc.results.length + ' cases</span></div>';

    var body = slice.map(function (r) {
      var bl = r[tier];
      return '<tr class="' + (r.pseudopy.correct ? 'sop2-tr-ok' : 'sop2-tr-diff') + '">' +
        '<td class="sop2-col-case"><span class="sop2-caseid">' + esc(r.caseId) + '</span>' +
          (r.group ? '<span class="sop2-groupchip">' + esc(r.group) + '</span>' : '') +
          (r.injectionType ? '<span class="sop2-injchip">' + esc(r.injectionType) + '</span>' : '') + '</td>' +
        '<td>' + badge(r.pseudopy.class) + '<span class="sop2-time">' + round3(r.pseudopy.generationTimeMs) + 'ms</span></td>' +
        '<td>' + badge(bl.class) + '<span class="sop2-time">' + round3(bl.generationTimeMs) + 'ms</span></td>' +
        '<td class="sop2-col-sim">F1 ' + round3(r.metrics.pseudopy.normalized ? r.metrics.pseudopy.normalized.f1 : r.metrics.pseudopy.f1) + '</td>' +
        '<td class="sop2-col-note">' + esc(r.injectionDetail || (r.pseudopy.correct ? '' : friendlyError(r.pseudopy))) + '</td>' +
      '</tr>';
    }).join('');

    var pager = '<div class="sop2-pager">' +
      '<button class="btn btn-ghost" id="sop2-page-prev"' + (pageState.page === 0 ? ' disabled' : '') + '>&larr; Prev</button>' +
      '<span>Page ' + (pageState.page + 1) + ' of ' + pages + '</span>' +
      '<button class="btn btn-ghost" id="sop2-page-next"' + (pageState.page >= pages - 1 ? ' disabled' : '') + '>Next &rarr;</button>' +
      '</div>';

    return head +
      '<div class="sop2-tablewrap"><table class="sop2-table sop2-results"><thead><tr>' +
      '<th scope="col">Case</th><th scope="col">PseudoPy</th><th scope="col">' + esc(tierLabel(tier)) +
      '</th><th scope="col">Similarity</th><th scope="col">Note</th></tr></thead><tbody>' +
      (body || '<tr><td colspan="5" class="sop2-empty">No cases match this filter.</td></tr>') +
      '</tbody></table></div>' + pager;
  }

  function renderBenchmark(doc) {
    var R = Report();
    return statCards(doc) +
      '<p class="sop2-verdict">' + esc(R.verdictText(doc)) + '</p>' +
      '<div class="sop2-charts">' + correctnessChart(doc) + outcomeChart(doc) + '</div>' +
      renderTable(doc);
  }

  function renderEmpty() {
    return '<div class="devtools-idle-message"><p>Load an example or paste pseudocode, then press ' +
      '<strong>Compare</strong>. Benchmark runs the whole labelled dataset (seed + holdout) and reports ' +
      'correctness, error detection and translation time per group.</p></div>';
  }

  function renderDoc(doc) {
    lastDoc = doc;
    isStale = false;
    var host = $('sop2-result');
    if (host) {
      if (host.setAttribute) host.setAttribute('aria-busy', 'false');
      host.innerHTML = doc.results.length === 1 ? renderCase(doc.results[0]) : renderBenchmark(doc);
      wireResultControls(doc);
    }
    updateExportState();
  }

  function wireResultControls(doc) {
    var host = $('sop2-result');
    if (!host || !host.querySelector) return;
    var filter = host.querySelector('#sop2-filter');
    if (filter) filter.addEventListener('change', function () { pageState.filter = filter.value; pageState.page = 0; renderDoc(doc); });
    var prev = host.querySelector('#sop2-page-prev');
    if (prev) prev.addEventListener('click', function () { if (pageState.page > 0) { pageState.page--; renderDoc(doc); } });
    var next = host.querySelector('#sop2-page-next');
    if (next) next.addEventListener('click', function () { pageState.page++; renderDoc(doc); });
  }

  function updateExportState() {
    var enabled = !!lastDoc && !isStale;
    ['sop2-export-json', 'sop2-export-csv', 'sop2-export-md'].forEach(function (id) {
      var el = $(id);
      if (el) el.disabled = !enabled;
    });
  }

  function setBusy(busy) {
    ['sop2-compare', 'sop2-run', 'sop2-bench', 'sop2-export-json', 'sop2-export-csv', 'sop2-export-md'].forEach(function (id) {
      var el = $(id);
      if (el) el.disabled = busy;
    });
    if (!busy) updateExportState();
  }

  function markStale() {
    isStale = true;
    updateExportState();
  }

  // ── progress ────────────────────────────────────────────────
  function showProgress(done, total, label) {
    var wrap = $('sop2-progress'), fill = $('sop2-progress-fill'), text = $('sop2-progress-text');
    if (!wrap) return;
    wrap.classList.remove('hidden');
    var pct = total ? Math.round((done / total) * 100) : 0;
    wrap.setAttribute('aria-valuenow', String(pct));
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = label || (done + ' / ' + total);
  }
  function hideProgress() {
    var wrap = $('sop2-progress');
    if (wrap) wrap.classList.add('hidden');
  }

  // ── handlers ────────────────────────────────────────────────
  function runCompare(withRuntime) {
    var src = norm(readSource());
    var ref = readRef();
    if (!src.trim()) { setStatus('Enter pseudocode'); return Promise.resolve(null); }
    if (!ref.trim()) { setStatus('Enter reference Python'); return Promise.resolve(null); }
    setBusy(true);
    setStatus(withRuntime ? 'Translating and running in Skulpt…' : 'Translating…');
    return ensureSk().then(function () {
      return buildRow(src, ref, { withRuntime: withRuntime, caseId: 'ui', title: null, group: 'single', timingIters: 8, timingWarmup: 2 });
    }).then(function (row) {
      var doc = buildDoc([row], withRuntime ? 'run' : 'compare', { scope: 'single case' });
      pageState = { filter: 'all', page: 0 };
      renderDoc(doc);
      setStatus(withRuntime ? 'Ran both translators in the shared Skulpt runtime' : 'Compared');
      return doc;
    }).catch(function (e) {
      setStatus('Error: ' + ((e && e.message) || e));
      return null;
    }).then(function (doc) { setBusy(false); return doc; });
  }

  function benchmark() {
    var includeInjectedEl = $('sop2-scope-injected');
    var includeInjected = !!(includeInjectedEl && includeInjectedEl.checked);
    if (typeof SEED_EXERCISES_LIST === 'undefined' || !SEED_EXERCISES_LIST.length) {
      setStatus('Seed exercises unavailable');
      return Promise.resolve(null);
    }
    var D = Dataset();
    if (!D) { setStatus('Dataset module unavailable'); return Promise.resolve(null); }
    var holdout = (typeof SOP2_HOLDOUT_CASES !== 'undefined') ? SOP2_HOLDOUT_CASES : [];
    var built = D.buildDataset(SEED_EXERCISES_LIST, holdout, { includeInjected: includeInjected, includeHoldout: true });
    var rows = built.rows;
    benchCancelled = false;
    setBusy(true);
    var cancel = $('sop2-bench-cancel');
    if (cancel) { cancel.hidden = false; cancel.disabled = false; }
    setStatus('Benchmarking ' + rows.length + ' cases…');
    showProgress(0, rows.length, '0 / ' + rows.length);

    var results = [];
    var setupMs = 0;
    return ensureSk().then(function () {
      var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
      getEngine();
      setupMs = ((window.performance && performance.now) ? performance.now() : Date.now()) - t0;

      function step(i) {
        if (benchCancelled || i >= rows.length) return Promise.resolve(results);
        var row = rows[i];
        showProgress(i, rows.length, (i + 1) + ' / ' + rows.length + ' · ' + (row.title || row.id));
        return new Promise(function (resolve) { setTimeout(resolve, 0); }).then(function () {
          return buildRow(row.source, row.referencePython, {
            withRuntime: true, caseId: row.id, title: row.title, group: row.group,
            injectionType: row.injectionType, baseId: row.baseId, injectionDetail: row.injectionDetail,
            timingIters: row.group === 'injected' ? 1 : BENCH_TIMING_ITERS,
            timingWarmup: row.group === 'injected' ? 0 : BENCH_TIMING_WARMUP
          });
        }).then(function (r) { results.push(r); return step(i + 1); });
      }
      return step(0);
    }).then(function (results) {
      if (benchCancelled) {
        setStatus('Benchmark cancelled after ' + results.length + ' cases');
        return null;
      }
      var doc = buildDoc(results, 'benchmark', {
        setup: { setupMs: round3(setupMs) },
        scope: includeInjected ? 'seed + holdout + injected' : 'seed + holdout',
        dataset: { composition: built.rows.reduce(function (acc, r) { acc[r.group] = (acc[r.group] || 0) + 1; return acc; }, {}), skippedInjections: built.injections.skipped }
      });
      pageState = { filter: 'all', page: 0 };
      renderDoc(doc);
      setStatus('Benchmark complete: ' + results.length + ' cases');
      return doc;
    }).catch(function (e) {
      setStatus('Error: ' + ((e && e.message) || e));
      return null;
    }).then(function (doc) {
      setBusy(false);
      if (cancel) cancel.hidden = true;
      hideProgress();
      return doc;
    });
  }

  function exportJSON() {
    if (!lastDoc || isStale) return;
    download('sop2-comparison-results.json', Report().toJSON(lastDoc), 'application/json');
    setStatus('Exported JSON');
  }
  function exportCSV() {
    if (!lastDoc || isStale) return;
    download('sop2-comparison-results.csv', Report().toCSV(lastDoc), 'text/csv');
    setStatus('Exported CSV');
  }
  function exportMD() {
    if (!lastDoc || isStale) return;
    download('sop2-comparison-results.md', Report().toMarkdown(lastDoc), 'text/markdown');
    setStatus('Exported Markdown report');
  }

  function bind(id, handler) {
    var el = $(id);
    if (el) el.addEventListener('click', function () { handler(); });
  }

  function populateExamples() {
    var sel = $('sop2-load-example');
    if (!sel) return;
    var seeds = (typeof SEED_EXERCISES_LIST !== 'undefined') ? SEED_EXERCISES_LIST : [];
    var holdout = (typeof SOP2_HOLDOUT_CASES !== 'undefined') ? SOP2_HOLDOUT_CASES : [];
    function add(label, rows, group) {
      if (!rows.length) return;
      var og = document.createElement('optgroup');
      og.label = label;
      rows.forEach(function (r, i) {
        var opt = document.createElement('option');
        opt.value = group + ':' + i;
        opt.textContent = (r.title || r.id || (group + ' ' + (i + 1)));
        og.appendChild(opt);
      });
      sel.appendChild(og);
    }
    add('Seed (built-in)', seeds, 'seed');
    add('Holdout (independent)', holdout, 'holdout');
  }

  function onExampleChange() {
    var sel = $('sop2-load-example');
    if (!sel || !sel.value) return;
    var parts = sel.value.split(':');
    var group = parts[0], idx = parseInt(parts[1], 10);
    var rows = group === 'seed'
      ? ((typeof SEED_EXERCISES_LIST !== 'undefined') ? SEED_EXERCISES_LIST : [])
      : ((typeof SOP2_HOLDOUT_CASES !== 'undefined') ? SOP2_HOLDOUT_CASES : []);
    var row = rows[idx];
    if (!row) return;
    var src = $('sop2-src'), ref = $('sop2-ref');
    if (src) src.value = norm(row.pseudocode || row.code || '');
    if (ref) ref.value = row.python_code || row.solution || '';
    markStale();
    setStatus('Loaded ' + (row.title || row.id || '') + ' (' + group + ')');
  }

  function wireInfo() {
    var btn = $('sop2-info-btn'), pop = $('sop2-info'), close = $('sop2-info-close');
    if (!btn || !pop) return;
    function setOpen(open) {
      pop.classList.toggle('hidden', !open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && pop.focus) pop.focus();
    }
    btn.addEventListener('click', function () { setOpen(pop.classList.contains('hidden')); });
    if (close) close.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e && e.key === 'Escape') setOpen(false);
    });
  }

  function wire() {
    bind('sop2-compare', function () { runCompare(false); });
    bind('sop2-run', function () { runCompare(true); });
    bind('sop2-bench', benchmark);
    bind('sop2-bench-cancel', function () { benchCancelled = true; setStatus('Cancelling…'); });
    bind('sop2-export-json', exportJSON);
    bind('sop2-export-csv', exportCSV);
    bind('sop2-export-md', exportMD);
    var s = $('sop2-src'), r = $('sop2-ref');
    if (s) s.addEventListener('input', markStale);
    if (r) r.addEventListener('input', markStale);
    var tier = $('sop2-tier');
    if (tier) tier.addEventListener('change', function () { if (lastDoc && !isStale) renderDoc(lastDoc); });
    var sel = $('sop2-load-example');
    if (sel) sel.addEventListener('change', onExampleChange);
    populateExamples();
    wireInfo();
    var host = $('sop2-result');
    if (host) host.innerHTML = renderEmpty();
    setBusy(false);
    updateExportState();
  }

  // The SOP2 charts and diff cards embed var(--chart-N) colours; re-render
  // the current results on 'themechange' so nothing keeps stale paints.
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('themechange', function () {
      if (lastDoc) renderDoc(lastDoc);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  // Debug/testing surface.
  window.__sop2ui = {
    compare: function () { return runCompare(false); },
    runBoth: function () { return runCompare(true); },
    benchmark: benchmark,
    lastDoc: function () { return lastDoc; },
    buildRow: buildRow,
    buildDoc: buildDoc
  };
})();
