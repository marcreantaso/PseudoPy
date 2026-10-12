/* ============================================================
   SOP 2 — comparison panel (DevTools)
   ------------------------------------------------------------
   Wires the Compare / Run both / Benchmark / Export JSON /
   Export CSV buttons to working handlers.

   • Metrics come from the shared MetricsCore (src/research/
     line-metrics.js), the single source of truth also used by the
     Node harness. The panel no longer carries its own copy, so
     precision/recall denominators cannot drift apart again.
   • Both translators are judged in the SAME Skulpt runtime: syntax
     via Sk.parse, then real execution via Sk.importMainWithBody.
   • Generation time is measured around translation only; the
     compiler instance is created once, outside the timer.
   ============================================================ */
(function () {
  'use strict';

  var METRICS_VERSION = '1.1.0';
  var MAX_BENCH_CASES = 30;
  var engineRef = null;
  var lastDoc = null;
  var isStale = false;

  function $(id) { return document.getElementById(id); }
  function setStatus(msg) { var el = $('sop2-status'); if (el) el.textContent = msg || ''; }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = (s == null ? '' : String(s));
    return d.innerHTML;
  }

  function round3(n) { return Math.round(n * 1000) / 1000; }

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

  function csvCell(v) {
    var s = (v == null ? '' : String(v));
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return s;
  }

  function flag(v) { return v === true ? '1' : v === false ? '0' : ''; }

  function metricsOf(gen, exp) {
    if (typeof MetricsCore === 'undefined' || !MetricsCore || typeof MetricsCore.lineMetrics !== 'function') {
      throw new Error('MetricsCore not loaded (build the devtools bundle)');
    }
    return MetricsCore.lineMetrics(gen || '', exp || '');
  }

  function norm(src) {
    var s = src || '';
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

  // ── Skulpt: one runtime for both translators ────────────────
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
      // Skulpt needs the python3 future flag before Sk.parse; without it the
      // tokenizer dereferences an unset Sk.__future__. Argument order is
      // Sk.parse(filename, code).
      if (typeof Sk.configure === 'function' && !Sk.__future__) {
        Sk.configure({ __future__: Sk.python3 });
      }
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
      return Sk.importMainWithBody('<sop2>', false, py, true);
    }).then(function () {
      return { ok: true, error: null, stdout: out.join('') };
    }).catch(function (e) {
      return { ok: false, error: (e && e.toString) ? e.toString() : String(e), stdout: out.join('') };
    });
  }

  // ── Case construction ───────────────────────────────────────
  function buildCase(src, ref, withRuntime) {
    var engine = getEngine();

    var p0 = performance.now();
    var pRes;
    try {
      pRes = engine.compile(src);
    } catch (e) {
      pRes = { valid: false, python: '', errors: [e.message || String(e)] };
    }
    var p1 = performance.now();

    var rawFn = (typeof baselineTranslateRaw === 'function') ? baselineTranslateRaw : baselineTranslate;
    var bGen = '';
    var b0 = performance.now();
    try {
      bGen = (rawFn(src) || {}).generatedPython || '';
    } catch (e) { bGen = ''; }
    var b1 = performance.now();

    var ppPython = pRes.python || '';
    var ppSyntax = skSyntax(ppPython);
    var blSyntax = skSyntax(bGen);

    var result = {
      caseId: 'ui',
      title: null,
      input: src,
      expectedPython: ref,
      pseudopy: {
        generatedPython: ppPython,
        compileSuccess: !!pRes.valid,
        syntaxSuccess: ppSyntax.ok,
        syntaxError: ppSyntax.error,
        runtimeSuccess: null,
        runtimeError: null,
        stdout: '',
        generationTimeMs: round3(p1 - p0),
        errors: pRes.errors || []
      },
      baseline: {
        generatedPython: bGen,
        compileSuccess: blSyntax.ok === true,
        syntaxSuccess: blSyntax.ok,
        syntaxError: blSyntax.error,
        runtimeSuccess: null,
        runtimeError: null,
        stdout: '',
        generationTimeMs: round3(b1 - b0)
      },
      metrics: {
        pseudopy: metricsOf(ppPython, ref),
        baseline: metricsOf(bGen, ref)
      }
    };

    if (!withRuntime) return Promise.resolve(result);

    var jobs = [];
    if (result.pseudopy.syntaxSuccess === true) {
      jobs.push(skRun(ppPython).then(function (r) {
        result.pseudopy.runtimeSuccess = r.ok;
        result.pseudopy.runtimeError = r.error;
        result.pseudopy.stdout = r.stdout;
      }));
    }
    if (result.baseline.syntaxSuccess === true) {
      jobs.push(skRun(bGen).then(function (r) {
        result.baseline.runtimeSuccess = r.ok;
        result.baseline.runtimeError = r.error;
        result.baseline.stdout = r.stdout;
      }));
    }
    return Promise.all(jobs).then(function () { return result; });
  }

  // ── Summary / documents ─────────────────────────────────────
  function average(values) {
    if (!values.length) return 0;
    var total = 0;
    for (var i = 0; i < values.length; i++) total += values[i];
    return total / values.length;
  }

  function summarize(results) {
    function side(key) {
      var rows = results.map(function (r) { return r[key]; });
      var mets = results.map(function (r) { return r.metrics[key]; });
      return {
        cases: rows.length,
        compileSuccess: rows.filter(function (r) { return r.compileSuccess; }).length,
        syntaxSuccess: rows.filter(function (r) { return r.syntaxSuccess === true; }).length,
        runtimeSuccess: rows.filter(function (r) { return r.runtimeSuccess === true; }).length,
        avgPrecision: average(mets.map(function (m) { return m.precision; })),
        avgRecall: average(mets.map(function (m) { return m.recall; })),
        avgF1: average(mets.map(function (m) { return m.f1; })),
        avgGenerationTimeMs: round3(average(rows.map(function (r) { return r.generationTimeMs; })))
      };
    }
    return { cases: results.length, pseudopy: side('pseudopy'), baseline: side('baseline') };
  }

  function buildDoc(results, kind) {
    return {
      metadata: {
        timestamp: new Date().toISOString(),
        cases: results.length,
        kind: kind || 'compare',
        compiler: 'PseudoPy',
        baseline: 'direct-line-based',
        runtime: 'Skulpt',
        metricsVersion: METRICS_VERSION
      },
      summary: summarize(results),
      results: results
    };
  }

  var CSV_COLUMNS = [
    'caseId', 'title',
    'pp_compile', 'pp_syntax', 'pp_runtime', 'pp_p', 'pp_r', 'pp_f1', 'pp_time_ms',
    'bl_compile', 'bl_syntax', 'bl_runtime', 'bl_p', 'bl_r', 'bl_f1', 'bl_time_ms'
  ];

  function toCSV(doc) {
    var results = doc.results || [];
    var lines = [CSV_COLUMNS.join(',')];
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
      lines.push([
        r.caseId, r.title,
        flag(r.pseudopy.compileSuccess), flag(r.pseudopy.syntaxSuccess), flag(r.pseudopy.runtimeSuccess),
        r.metrics.pseudopy.precision, r.metrics.pseudopy.recall, r.metrics.pseudopy.f1, r.pseudopy.generationTimeMs,
        flag(r.baseline.compileSuccess), flag(r.baseline.syntaxSuccess), flag(r.baseline.runtimeSuccess),
        r.metrics.baseline.precision, r.metrics.baseline.recall, r.metrics.baseline.f1, r.baseline.generationTimeMs
      ].map(csvCell).join(','));
    }
    return lines.join('\n') + '\n';
  }

  // ── Rendering ───────────────────────────────────────────────
  function boolCell(v) {
    if (v === true) return '<span class="sop2-ok">yes</span>';
    if (v === false) return '<span class="sop2-bad">no</span>';
    return '<span class="sop2-na">n/a</span>';
  }

  function numCell(v, digits) {
    return (typeof v === 'number' ? v.toFixed(digits) : 'n/a');
  }

  function renderCase(r) {
    var pm = r.metrics.pseudopy, bm = r.metrics.baseline;
    var pp = r.pseudopy, bl = r.baseline;
    var html = '<table class="sop2-table"><tr><th>Metric</th><th>Baseline</th><th>PseudoPy</th><th>Diff (PseudoPy &minus; Baseline)</th></tr>';
    html += '<tr><td>Precision</td><td>' + numCell(bm.precision, 3) + '</td><td>' + numCell(pm.precision, 3) + '</td><td>' + (pm.precision - bm.precision).toFixed(3) + '</td></tr>';
    html += '<tr><td>Recall</td><td>' + numCell(bm.recall, 3) + '</td><td>' + numCell(pm.recall, 3) + '</td><td>' + (pm.recall - bm.recall).toFixed(3) + '</td></tr>';
    html += '<tr><td>F1</td><td>' + numCell(bm.f1, 3) + '</td><td>' + numCell(pm.f1, 3) + '</td><td>' + (pm.f1 - bm.f1).toFixed(3) + '</td></tr>';
    html += '<tr><td>Compile success</td><td>' + boolCell(bl.compileSuccess) + '</td><td>' + boolCell(pp.compileSuccess) + '</td><td></td></tr>';
    html += '<tr><td>Syntax valid</td><td>' + boolCell(bl.syntaxSuccess) + '</td><td>' + boolCell(pp.syntaxSuccess) + '</td><td></td></tr>';
    html += '<tr><td>Runtime success</td><td>' + boolCell(bl.runtimeSuccess) + '</td><td>' + boolCell(pp.runtimeSuccess) + '</td><td></td></tr>';
    html += '<tr><td>Generation time (ms)</td><td>' + numCell(bl.generationTimeMs, 3) + '</td><td>' + numCell(pp.generationTimeMs, 3) + '</td><td></td></tr>';
    html += '</table>';
    var errors = [];
    if (pp.syntaxError) errors.push('PseudoPy syntax: ' + pp.syntaxError);
    if (pp.runtimeError) errors.push('PseudoPy runtime: ' + pp.runtimeError);
    if (bl.syntaxError) errors.push('Baseline syntax: ' + bl.syntaxError);
    if (bl.runtimeError) errors.push('Baseline runtime: ' + bl.runtimeError);
    if (errors.length) {
      html += '<pre class="sop2-errors">' + errors.map(esc).join('\n') + '</pre>';
    }
    return html;
  }

  function renderSummary(doc) {
    var pp = doc.summary.pseudopy, bl = doc.summary.baseline;
    var html = '<p class="sop2-caption">' + doc.results.length + ' cases &middot; ' + esc(doc.metadata.kind) + '</p>';
    html += '<table class="sop2-table"><tr><th>Metric</th><th>Baseline</th><th>PseudoPy</th></tr>';
    html += '<tr><td>Avg precision</td><td>' + numCell(bl.avgPrecision, 3) + '</td><td>' + numCell(pp.avgPrecision, 3) + '</td></tr>';
    html += '<tr><td>Avg recall</td><td>' + numCell(bl.avgRecall, 3) + '</td><td>' + numCell(pp.avgRecall, 3) + '</td></tr>';
    html += '<tr><td>Avg F1</td><td>' + numCell(bl.avgF1, 3) + '</td><td>' + numCell(pp.avgF1, 3) + '</td></tr>';
    html += '<tr><td>Compile success</td><td>' + bl.compileSuccess + '/' + bl.cases + '</td><td>' + pp.compileSuccess + '/' + pp.cases + '</td></tr>';
    html += '<tr><td>Syntax valid</td><td>' + bl.syntaxSuccess + '/' + bl.cases + '</td><td>' + pp.syntaxSuccess + '/' + pp.cases + '</td></tr>';
    html += '<tr><td>Runtime success</td><td>' + bl.runtimeSuccess + '/' + bl.cases + '</td><td>' + pp.runtimeSuccess + '/' + pp.cases + '</td></tr>';
    html += '<tr><td>Avg generation time (ms)</td><td>' + numCell(bl.avgGenerationTimeMs, 3) + '</td><td>' + numCell(pp.avgGenerationTimeMs, 3) + '</td></tr>';
    html += '</table>';
    return html;
  }

  function renderDoc(doc) {
    lastDoc = doc;
    isStale = false;
    var host = $('sop2-result');
    if (host) host.innerHTML = doc.results.length === 1 ? renderCase(doc.results[0]) : renderSummary(doc);
    updateExportState();
  }

  function updateExportState() {
    var enabled = !!lastDoc && !isStale;
    ['sop2-export-json', 'sop2-export-csv'].forEach(function (id) {
      var el = $(id);
      if (el) el.disabled = !enabled;
    });
  }

  function setBusy(busy) {
    ['sop2-compare', 'sop2-run', 'sop2-bench', 'sop2-export-json', 'sop2-export-csv'].forEach(function (id) {
      var el = $(id);
      if (el) el.disabled = busy;
    });
    if (!busy) updateExportState();
  }

  function markStale() {
    isStale = true;
    var host = $('sop2-result');
    if (host && lastDoc) {
      host.innerHTML = '<div class="devtools-idle-message"><p>Results are stale. Re-run to refresh.</p></div>';
    }
    updateExportState();
  }

  // ── Handlers ────────────────────────────────────────────────
  function runCompare(withRuntime) {
    var src = norm(readSource());
    var ref = readRef();
    if (!src) { setStatus('Enter pseudocode'); return; }
    if (!ref) { setStatus('Enter reference Python'); return; }
    setBusy(true);
    setStatus(withRuntime ? 'Translating and running...' : 'Translating...');
    return ensureSk().then(function () {
      return buildCase(src, ref, withRuntime);
    }).then(function (result) {
      var doc = buildDoc([result], withRuntime ? 'run' : 'compare');
      renderDoc(doc);
      setStatus(withRuntime ? 'Ran both in Skulpt' : 'Compared');
      return doc;
    }).catch(function (e) {
      setStatus('Error: ' + ((e && e.message) || e));
      return null;
    }).then(function (doc) { setBusy(false); return doc; });
  }

  function runBenchmark() {
    if (typeof SEED_EXERCISES_LIST === 'undefined' || !SEED_EXERCISES_LIST.length) {
      setStatus('Seed exercises unavailable');
      return;
    }
    var seeds = SEED_EXERCISES_LIST.slice(0, MAX_BENCH_CASES);
    setBusy(true);
    setStatus('Benchmarking ' + seeds.length + ' cases...');
    return ensureSk().then(function () {
      var results = [];
      function step(i) {
        if (i >= seeds.length) return Promise.resolve(results);
        var ex = seeds[i];
        var src = ex.pseudocode || ex.code || '';
        var ref = ex.python_code || ex.solution || ex.pythonCode || '';
        if (!src) return step(i + 1);
        setStatus('Benchmarking ' + (i + 1) + '/' + seeds.length + '...');
        return buildCase(src, ref, false).then(function (r) {
          r.caseId = ex.id || ('case_' + (i + 1));
          r.title = ex.title || null;
          results.push(r);
          return step(i + 1);
        });
      }
      return step(0);
    }).then(function (results) {
      var doc = buildDoc(results, 'benchmark');
      renderDoc(doc);
      setStatus('Benchmark done (' + results.length + ' cases)');
      return doc;
    }).catch(function (e) {
      setStatus('Error: ' + ((e && e.message) || e));
      return null;
    }).then(function (doc) { setBusy(false); return doc; });
  }

  function exportJSON() {
    if (!lastDoc || isStale) return;
    download('sop2-comparison-results.json', JSON.stringify(lastDoc, null, 2) + '\n', 'application/json');
    setStatus('Exported JSON');
  }

  function exportCSV() {
    if (!lastDoc || isStale) return;
    download('sop2-comparison-results.csv', toCSV(lastDoc), 'text/csv');
    setStatus('Exported CSV');
  }

  function bind(id, handler) {
    var el = $(id);
    if (el) el.addEventListener('click', function () { handler(); });
  }

  function setupNorm() {
    var normIn = $('norm-input'), normOut = $('norm-output'), normPrev = $('norm-preview'),
      normApply = $('norm-apply'), normCopy = $('norm-copy'), normDiff = $('norm-diff');
    if (normPrev) {
      normPrev.addEventListener('click', function () {
        if (!normIn) return;
        var s = norm(normIn.value || '');
        if (normOut) normOut.value = s;
        if (normDiff) normDiff.textContent = (normIn.value === s) ? 'No changes.' : 'Normalized.';
      });
    }
    if (normApply) {
      normApply.addEventListener('click', function () {
        var src = $('devtools-pseudocode');
        if (src && normOut && normOut.value) {
          src.value = normOut.value;
          if (typeof showToast === 'function') showToast('Applied normalized source to editor.', 'success');
          markStale();
        }
      });
    }
    if (normCopy) {
      normCopy.addEventListener('click', function () {
        if (normOut && normOut.value && navigator.clipboard) {
          navigator.clipboard.writeText(normOut.value).then(function () {
            if (typeof showToast === 'function') showToast('Copied.', 'success');
          }).catch(function () {});
        }
      });
    }
    if (normIn) {
      normIn.addEventListener('input', function () { if (normDiff) normDiff.textContent = ''; });
    }
  }

  function wire() {
    bind('sop2-compare', function () { runCompare(false); });
    bind('sop2-run', function () { runCompare(true); });
    bind('sop2-bench', runBenchmark);
    bind('sop2-export-json', exportJSON);
    bind('sop2-export-csv', exportCSV);
    var s = $('sop2-src'), r = $('sop2-ref');
    if (s) s.addEventListener('input', markStale);
    if (r) r.addEventListener('input', markStale);
    setBusy(false);
    updateExportState();
    setupNorm();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  // Small debug surface for the console / tooling.
  window.__sop2ui = {
    compare: function () { return runCompare(false); },
    runBoth: function () { return runCompare(true); },
    benchmark: runBenchmark,
    lastDoc: function () { return lastDoc; }
  };
})();
