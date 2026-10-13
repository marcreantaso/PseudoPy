/* ============================================================
   SOP 2 — PseudoPy vs. baseline comparison (Node harness)
   ------------------------------------------------------------
   Produces `sop2-comparison-results.json` and `.csv` and can be
   run directly:

       npm run sop2          (or: node src/research/sop2-comparison.js)

   Fairness rules enforced here:
   • Generation time is measured around translation ONLY. The
     compiler bundle is loaded and instantiated once, up front,
     so file reads and VM creation never land in a case's timing.
   • Both translators are judged by the SAME CPython interpreter:
     syntax via `ast.parse`, then real execution of the generated
     program (see python-runtime.js).
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const MetricsCore = require('./line-metrics');
const { baselineTranslateRaw } = require('./baseline-translator');
const pythonRuntime = require('./python-runtime');

const RESULTS_BASENAME = 'sop2-comparison-results';
const METRICS_VERSION = '1.1.0';

let cachedEngine = null;

/**
 * Load mapper.js + compiler.js into one VM context and keep the resulting
 * compiler instance. Doing this lazily-but-once keeps bundle I/O and context
 * creation out of every per-case generation-time measurement.
 */
function getCompilerEngine() {
  if (cachedEngine) return cachedEngine;
  const vm = require('vm');
  const ctx = {
    module: { exports: {} },
    exports: {},
    console,
    setTimeout,
    clearTimeout,
    performance: { now: () => performance.now() }
  };
  const base = path.join(__dirname, '../../');
  vm.runInNewContext(fs.readFileSync(path.join(base, 'mapper.js'), 'utf8'), ctx);
  vm.runInNewContext(fs.readFileSync(path.join(base, 'compiler.js'), 'utf8'), ctx);
  cachedEngine = new ctx.module.exports.PseudocodeCompiler();
  return cachedEngine;
}

function lineMetrics(gen, exp) {
  return MetricsCore.lineMetrics(gen, exp);
}

/**
 * Compare one source/expected pair. Never throws for an expected failure.
 * @param {string} source pseudocode
 * @param {string} refPython reference Python
 * @param {{caseId?: string, title?: string, executeRuntime?: boolean, timeoutMs?: number}} [opts]
 */
function compare(source, refPython, opts) {
  opts = opts || {};
  const expected = refPython || '';
  const executeRuntime = opts.executeRuntime !== false;

  // ── PseudoPy: timed translation only ────────────────────────
  // Resolve the engine BEFORE starting the clock: loading the bundles and
  // creating the VM context happens once and must never be attributed to a
  // case's generation time.
  let engine = null;
  let engineError = null;
  try {
    engine = getCompilerEngine();
  } catch (e) {
    engineError = e.message || String(e);
  }
  let pseudopyRes;
  let pseudopyErrors = [];
  const p0 = performance.now();
  if (engine) {
    try {
      pseudopyRes = engine.compile(source);
    } catch (e) {
      pseudopyRes = { valid: false, python: '' };
      pseudopyErrors = [e.message || String(e)];
    }
  } else {
    pseudopyRes = { valid: false, python: '' };
    pseudopyErrors = [engineError || 'compiler unavailable'];
  }
  const p1 = performance.now();

  // ── Baseline: timed raw translation only ────────────────────
  let baselineGen = '';
  let baselineError = null;
  const b0 = performance.now();
  try {
    baselineGen = baselineTranslateRaw(source).generatedPython || '';
  } catch (e) {
    baselineError = e.message || String(e);
  }
  const b1 = performance.now();

  const ppPython = pseudopyRes.python || '';

  // ── Same-runtime validation (outside the timed region) ──────
  const ppSyntax = pythonRuntime.pythonSyntaxCheck(ppPython, { timeoutMs: opts.timeoutMs });
  const blSyntax = baselineError
    ? { ok: null, error: baselineError }
    : pythonRuntime.pythonSyntaxCheck(baselineGen, { timeoutMs: opts.timeoutMs });

  let ppRun = { ok: null, error: null, stdout: '', stderr: '', timedOut: false };
  let blRun = { ok: null, error: null, stdout: '', stderr: '', timedOut: false };
  if (executeRuntime) {
    if (ppSyntax.ok === true) ppRun = pythonRuntime.pythonRun(ppPython, { timeoutMs: opts.timeoutMs });
    if (blSyntax.ok === true) blRun = pythonRuntime.pythonRun(baselineGen, { timeoutMs: opts.timeoutMs });
  }

  return {
    caseId: opts.caseId || null,
    title: opts.title || null,
    input: source,
    expectedPython: expected,
    pseudopy: {
      generatedPython: ppPython,
      compileSuccess: !!pseudopyRes.valid,
      syntaxSuccess: ppSyntax.ok,
      syntaxError: ppSyntax.error,
      runtimeSuccess: ppRun.ok,
      runtimeError: ppRun.error,
      stdout: ppRun.stdout,
      generationTimeMs: round3(p1 - p0),
      errors: pseudopyErrors.length ? pseudopyErrors : (pseudopyRes.errors || [])
    },
    baseline: {
      generatedPython: baselineGen,
      compileSuccess: blSyntax.ok === true,
      syntaxSuccess: blSyntax.ok,
      syntaxError: blSyntax.error,
      runtimeSuccess: blRun.ok,
      runtimeError: blRun.error,
      stdout: blRun.stdout,
      generationTimeMs: round3(b1 - b0)
    },
    metrics: {
      pseudopy: lineMetrics(ppPython, expected),
      baseline: lineMetrics(baselineGen, expected)
    }
  };
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce(function (a, b) { return a + b; }, 0) / values.length;
}

function summarize(results) {
  function side(key) {
    const rows = results.map(function (r) { return r[key]; });
    const metrics = results.map(function (r) { return r.metrics[key]; });
    return {
      cases: rows.length,
      compileSuccess: rows.filter(function (r) { return r.compileSuccess; }).length,
      syntaxSuccess: rows.filter(function (r) { return r.syntaxSuccess === true; }).length,
      runtimeSuccess: rows.filter(function (r) { return r.runtimeSuccess === true; }).length,
      avgPrecision: round6(average(metrics.map(function (m) { return m.precision; }))),
      avgRecall: round6(average(metrics.map(function (m) { return m.recall; }))),
      avgF1: round6(average(metrics.map(function (m) { return m.f1; }))),
      avgGenerationTimeMs: round3(average(rows.map(function (r) { return r.generationTimeMs; })))
    };
  }
  return { cases: results.length, pseudopy: side('pseudopy'), baseline: side('baseline') };
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

function readSeeds(limit) {
  const db = fs.readFileSync(path.join(__dirname, '../../database.js'), 'utf8');
  const marker = 'const SEED_EXERCISES_LIST = ';
  const start = db.indexOf(marker);
  if (start < 0) return [];
  const s = db.indexOf('[', start);
  const end = db.indexOf('\n];', s);
  if (end < 0) return [];
  let seeds;
  try {
    seeds = JSON.parse(db.slice(s, end + 2));
  } catch (e) {
    return [];
  }
  return seeds.slice(0, limit || seeds.length);
}

/**
 * Run the built-in seed exercises through both translators.
 * @param {{limit?: number, executeRuntime?: boolean, timeoutMs?: number, write?: boolean, outDir?: string}} [opts]
 * @returns {object} the full results document (also written when `write`).
 */
function runSeedComparison(opts) {
  opts = opts || {};
  const seeds = readSeeds(opts.limit || 30);
  const results = [];
  for (let i = 0; i < seeds.length; i++) {
    const ex = seeds[i];
    const src = ex.pseudocode || ex.code || '';
    const ref = ex.python_code || ex.solution || ex.pythonCode || '';
    if (!src) continue;
    results.push(compare(src, ref, {
      caseId: ex.id,
      title: ex.title,
      executeRuntime: opts.executeRuntime,
      timeoutMs: opts.timeoutMs
    }));
  }
  const doc = {
    metadata: {
      timestamp: new Date().toISOString(),
      cases: results.length,
      compiler: 'PseudoPy',
      baseline: 'direct-line-based',
      runtime: pythonRuntime.pythonCommand(),
      metricsVersion: METRICS_VERSION
    },
    summary: summarize(results),
    results: results
  };
  if (opts.write) writeResults(doc, opts.outDir);
  return doc;
}

function flag(v) {
  return v === true ? '1' : v === false ? '0' : '';
}

function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

const CSV_COLUMNS = [
  'caseId', 'title',
  'pp_compile', 'pp_syntax', 'pp_runtime', 'pp_p', 'pp_r', 'pp_f1', 'pp_time_ms',
  'bl_compile', 'bl_syntax', 'bl_runtime', 'bl_p', 'bl_r', 'bl_f1', 'bl_time_ms'
];

function toCSV(doc) {
  const results = Array.isArray(doc) ? doc : doc.results;
  const lines = [CSV_COLUMNS.join(',')];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
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

function toJSON(doc) {
  return JSON.stringify(doc, null, 2) + '\n';
}

function writeResults(doc, outDir) {
  const dir = outDir || path.join(__dirname, '../../');
  fs.writeFileSync(path.join(dir, RESULTS_BASENAME + '.json'), toJSON(doc), 'utf8');
  fs.writeFileSync(path.join(dir, RESULTS_BASENAME + '.csv'), toCSV(doc), 'utf8');
  return {
    json: path.join(dir, RESULTS_BASENAME + '.json'),
    csv: path.join(dir, RESULTS_BASENAME + '.csv')
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    compare,
    lineMetrics,
    runSeedComparison,
    summarize,
    toCSV,
    toJSON,
    writeResults
  };
}

if (require.main === module) {
  const doc = runSeedComparison({ write: true });
  const written = path.join(__dirname, '../../', RESULTS_BASENAME);
  console.log('SOP 2 comparison: ' + doc.results.length + ' cases -> ' + written + '.json / .csv');
  console.log(JSON.stringify(doc.summary, null, 2));
}
