/* ============================================================
   SOP 2 — Traditional Baseline vs PseudoPy (Node harness)
   ------------------------------------------------------------
   Produces `sop2-comparison-results.json`, `.csv` and a short
   `.md` report, and can be run directly:

       npm run sop2                  (full run)
       npm run sop2 -- --quick       (tiny iteration count for dev)

   What this harness guarantees (the methodology, in code):

   1) FUNCTIONAL CORRECTNESS (SOP 2a) is stdout equality against the
      reference program, executed in the same interpreter — never a
      text-similarity score.
   2) ERROR TAXONOMY (SOP 2b) classifies every (case, translator) pair
      as rejected / syntax_error / runtime_error / wrong_output /
      correct / unverified, and reports a separate silent-failure rate.
   3) TRANSLATION-ONLY TIMING (SOP 2c): the report times raw text ->
      Python, with warm-ups and a batched loop. Bundle load, VM
      creation, validation and execution are measured separately as a
      one-time setup cost, never inside a case's timer.
   4) Two documented baselines: B1 (naive keyword substitution) and B2
      (reasonable rule-based). Both are built only from the public
      language spec in docs/; neither has validation of any kind.
   5) Results are reported per dataset group — seed / holdout /
      injected — and never blended into one number.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { performance } = require('perf_hooks');

const MetricsCore = require('./line-metrics');
const Functional = require('./functional-metrics');
const Taxonomy = require('./error-taxonomy');
const Stats = require('./stats');
const Timing = require('./timing');
const Dataset = require('./dataset');
const Injection = require('./error-injection');
const { baselineTranslateRaw, baselineTranslateRawB2 } = require('./baseline-translator');
const pythonRuntime = require('./python-runtime');
const HOLDOUT_CASES = require('./holdout-cases');

const RESULTS_BASENAME = 'sop2-comparison-results';
const METRICS_VERSION = '2.0.0';
const SCHEMA_VERSION = 2;

const SIDE_KEYS = ['pseudopy', 'baseline', 'baselineB2'];
const SIDE_LABELS = {
  pseudopy: 'PseudoPy',
  baseline: 'Baseline B1 (naive)',
  baselineB2: 'Baseline B2 (rule-based)'
};

let cachedEngine = null;
let engineSetup = null;

/**
 * Load mapper.js + compiler.js into one VM context and keep the resulting
 * compiler instance. Returns the one-time setup cost the first time it runs
 * so the report can state it separately from per-case translation time.
 */
function getCompilerEngine() {
  if (cachedEngine) return cachedEngine;
  const measured = Timing.measureSetup(function () {
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
    return new ctx.module.exports.PseudocodeCompiler();
  });
  cachedEngine = measured.value;
  engineSetup = { setupMs: measured.setupMs };
  return cachedEngine;
}

function round3(n) { return Math.round(n * 1000) / 1000; }
function round6(n) { return Math.round(n * 1e6) / 1e6; }

function average(values) {
  if (!values.length) return 0;
  return values.reduce(function (a, b) { return a + b; }, 0) / values.length;
}

function lineMetrics(gen, exp) {
  return MetricsCore.lineMetrics(gen, exp);
}

/* ---------- reference execution (cached per reference program) ---------- */

const referenceCache = new Map();

function runReference(referencePython, opts) {
  const key = String(referencePython == null ? '' : referencePython);
  if (referenceCache.has(key)) return referenceCache.get(key);
  const run = pythonRuntime.pythonRun(key, { timeoutMs: opts && opts.timeoutMs, stdin: opts && opts.stdin });
  const outcome = { ok: run.ok, stdout: run.stdout, error: run.error, unavailable: !!run.unavailable };
  referenceCache.set(key, outcome);
  return outcome;
}

/* ---------- one translator side ---------- */

/**
 * Translate (timed), validate and execute one side of one case.
 * @param {string} key 'pseudopy' | 'baseline' | 'baselineB2'
 * @param {object} ctx {source, reference, executeRuntime, timeoutMs, stdin, timing, engine}
 */
function measureSide(key, ctx) {
  const source = ctx.source;
  let generatedPython = '';
  let rejected = false;
  let emitted = false;
  let hasWarning = false;
  let compileErrors = [];

  const timingOpts = ctx.timing || {};
  const iters = ctx.timingIters == null ? 200 : ctx.timingIters;
  const warmup = ctx.timingWarmup == null ? 5 : ctx.timingWarmup;

  const translated = Timing.measure(function () {
    let res;
    if (key === 'pseudopy') {
      if (!ctx.engine) { res = { valid: false, python: '', errors: ['compiler unavailable'] }; }
      else {
        try {
          res = ctx.engine.compile(source);
        } catch (e) {
          res = { valid: false, python: '', errors: [e.message || String(e)] };
        }
      }
      generatedPython = res.python || '';
      rejected = res.valid === false || !generatedPython;
      compileErrors = (res.errors || []).map(function (e) {
        return typeof e === 'string' ? e : (e.message || String(e));
      });
    } else if (key === 'baseline') {
      generatedPython = baselineTranslateRaw(source).generatedPython || '';
    } else {
      generatedPython = baselineTranslateRawB2(source).generatedPython || '';
    }
    return generatedPython;
  }, { warmup: warmup, iters: iters });

  emitted = !!generatedPython && generatedPython.trim() !== '';
  // PseudoPy warns when it declines an input. The baselines never warn.
  hasWarning = key === 'pseudopy' && rejected;

  const syntax = emitted
    ? pythonRuntime.pythonSyntaxCheck(generatedPython, { timeoutMs: ctx.timeoutMs })
    : { ok: null, error: null, omitted: true };

  let run = { ok: null, error: null, stdout: '', stderr: '', timedOut: false };
  if (ctx.executeRuntime !== false && emitted && syntax.ok === true) {
    run = pythonRuntime.pythonRun(generatedPython, { timeoutMs: ctx.timeoutMs, stdin: ctx.stdin });
  }

  const outputMatches = syntax.ok === true && run.ok === true && Functional.outputsMatch(run.stdout, ctx.reference.stdout);
  const cls = Taxonomy.classify({
    rejected: rejected,
    hasWarning: hasWarning,
    syntaxOk: emitted ? syntax.ok : (rejected ? null : false),
    runtimeOk: ctx.executeRuntime === false || !emitted ? null : run.ok,
    outputMatches: outputMatches
  });

  return {
    side: key,
    generatedPython: generatedPython,
    rejected: rejected,
    emitted: emitted,
    hasWarning: hasWarning,
    compileSuccess: syntax.ok === true,
    syntaxSuccess: syntax.ok,
    syntaxError: syntax.error,
    runtimeSuccess: run.ok,
    runtimeError: run.error,
    stdout: run.stdout,
    outputMatches: outputMatches,
    correct: cls === 'correct',
    class: cls,
    generationTimeMs: round3(translated.perIterationMs),
    timing: {
      iterations: translated.iterations,
      warmup: translated.warmup,
      totalMs: round3(translated.totalMs)
    },
    errors: compileErrors
  };
}

/* ---------- one case ---------- */

/**
 * Compare one source/reference pair through every translator tier.
 * @param {string} source pseudocode
 * @param {string} refPython reference Python
 * @param {object} [opts]
 */
function compare(source, refPython, opts) {
  opts = opts || {};
  const referencePython = refPython == null ? '' : String(refPython);

  let engine = null;
  let engineError = null;
  try {
    engine = getCompilerEngine();
  } catch (e) {
    engineError = e.message || String(e);
  }

  const reference = runReference(referencePython, opts);

  const ctx = {
    source: source,
    reference: reference,
    engine: engine,
    executeRuntime: opts.executeRuntime,
    timeoutMs: opts.timeoutMs,
    stdin: opts.stdin,
    timing: opts.timing,
    timingIters: opts.timingIters,
    timingWarmup: opts.timingWarmup
  };
  if (!engine && engineError) { /* handled per-side as compiler unavailable */ }

  const sides = {};
  sides.pseudopy = measureSide('pseudopy', ctx);
  sides.baseline = measureSide('baseline', ctx);
  sides.baselineB2 = measureSide('baselineB2', ctx);

  const metrics = {};
  const similarity = {};
  SIDE_KEYS.forEach(function (key) {
    const sim = Functional.textSimilarity(sides[key].generatedPython, referencePython);
    similarity[key] = sim;
    metrics[key] = Object.assign({}, sim.raw, { raw: sim.raw, normalized: sim.normalized });
  });

  return {
    caseId: opts.caseId || null,
    title: opts.title || null,
    group: opts.group || 'seed',
    injectionType: opts.injectionType || null,
    baseId: opts.baseId || null,
    injectionDetail: opts.injectionDetail || null,
    input: source,
    expectedPython: referencePython,
    reference: {
      ok: reference.ok,
      stdout: reference.stdout,
      error: reference.error,
      unavailable: reference.unavailable || false
    },
    pseudopy: sides.pseudopy,
    baseline: sides.baseline,
    baselineB2: sides.baselineB2,
    metrics: metrics,
    similarity: similarity,
    setupError: engineError || null
  };
}

/* ---------- aggregation & statistics ---------- */

// Summaries and inferential statistics are shared with the browser UI via
// src/research/report.js; the destructuring below binds them into this module.

/* ---------- dataset reading ---------- */

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
 * Build the tagged dataset used by the full comparison.
 */
function buildComparisonDataset(opts) {
  opts = opts || {};
  const seeds = readSeeds(opts.limit);
  return Dataset.buildDataset(seeds, HOLDOUT_CASES, {
    includeSeed: opts.includeSeed,
    includeHoldout: opts.includeHoldout,
    includeInjected: opts.includeInjected,
    injectionTypes: opts.injectionTypes
  });
}

/* ---------- full run ---------- */

function runComparison(opts) {
  opts = opts || {};
  const dataset = buildComparisonDataset(opts);
  const timing = opts.timing || {};
  const defaultIters = opts.iters == null ? 200 : opts.iters;
  const defaultWarmup = opts.warmup == null ? 5 : opts.warmup;

  const results = [];
  for (let i = 0; i < dataset.rows.length; i++) {
    const row = dataset.rows[i];
    const injected = row.group === 'injected';
    results.push(compare(row.source, row.referencePython, {
      caseId: row.id,
      title: row.title,
      group: row.group,
      injectionType: row.injectionType,
      baseId: row.baseId,
      injectionDetail: row.injectionDetail,
      executeRuntime: opts.executeRuntime,
      timeoutMs: opts.timeoutMs,
      // Headline timing runs on seed+holdout only; injected rows get a
      // single-shot figure that is never used for the 2c claim.
      timingIters: injected ? 1 : (timing.iters == null ? defaultIters : timing.iters),
      timingWarmup: injected ? 0 : (timing.warmup == null ? defaultWarmup : timing.warmup)
    }));
  }

  const groups = summarizeGroups(results);
  const doc = {
    metadata: {
      timestamp: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
      cases: results.length,
      compiler: 'PseudoPy',
      baselines: { B1: 'naive keyword substitution', B2: 'reasonable rule-based (no validation)' },
      runtime: pythonRuntime.pythonCommand(),
      metricsVersion: METRICS_VERSION,
      correctnessDefinition: 'generated program runs and stdout equals the reference program stdout',
      timingMethod: 'translation only; ' + (timing.warmup == null ? defaultWarmup : timing.warmup) +
        ' warm-ups then ' + (timing.iters == null ? defaultIters : timing.iters) + ' iterations, median/IQR across cases',
      setup: engineSetup
    },
    dataset: {
      composition: {
        seed: dataset.rows.filter(function (r) { return r.group === 'seed'; }).length,
        holdout: dataset.rows.filter(function (r) { return r.group === 'holdout'; }).length,
        injected: dataset.rows.filter(function (r) { return r.group === 'injected'; }).length
      },
      skippedInjections: dataset.injections.skipped
    },
    summary: summarize(results),
    groups: groups,
    stats: computeStats(results),
    results: results
  };

  if (opts.write) writeResults(doc, opts.outDir);
  return doc;
}

/** Backwards-compatible seed-only run used by the existing tests. */
function runSeedComparison(opts) {
  opts = opts || {};
  const seeds = readSeeds(opts.limit || 30);
  const rows = Dataset.buildDataset(seeds, [], { includeHoldout: false, includeInjected: false }).rows;
  const results = rows.map(function (row) {
    return compare(row.source, row.referencePython, {
      caseId: row.id,
      title: row.title,
      group: 'seed',
      executeRuntime: opts.executeRuntime,
      timeoutMs: opts.timeoutMs,
      timingIters: opts.timingIters == null ? 200 : opts.timingIters,
      timingWarmup: opts.timingWarmup == null ? 5 : opts.timingWarmup
    });
  });
  const doc = {
    metadata: {
      timestamp: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
      cases: results.length,
      compiler: 'PseudoPy',
      baselines: { B1: 'naive keyword substitution', B2: 'reasonable rule-based (no validation)' },
      runtime: pythonRuntime.pythonCommand(),
      metricsVersion: METRICS_VERSION,
      setup: engineSetup
    },
    summary: summarize(results),
    groups: { seed: summarize(results), holdout: null, injected: null },
    stats: computeStats(results),
    dataset: { composition: { seed: results.length, holdout: 0, injected: 0 }, skippedInjections: [] },
    results: results
  };
  if (opts.write) writeResults(doc, opts.outDir);
  return doc;
}

/* ---------- report rendering ---------- */

// CSV/Markdown/JSON rendering lives in src/research/report.js so the browser
// UI and this harness produce byte-identical exports from one implementation.
const Report = require('./report');
const { toCSV, toJSON, toMarkdown, verdictText, summarize, summarizeGroups, computeStats } = Report;
const CSV_COLUMNS = Report.CSV_COLUMNS;

// pct/f3/toMarkdown/verdictText removed: rendering is shared via report.js.

function writeResults(doc, outDir) {
  const dir = outDir || path.join(__dirname, '../../');
  const jsonPath = path.join(dir, RESULTS_BASENAME + '.json');
  const csvPath = path.join(dir, RESULTS_BASENAME + '.csv');
  const mdPath = path.join(dir, RESULTS_BASENAME + '.md');
  fs.writeFileSync(jsonPath, toJSON(doc), 'utf8');
  fs.writeFileSync(csvPath, toCSV(doc), 'utf8');
  fs.writeFileSync(mdPath, toMarkdown(doc), 'utf8');
  return { json: jsonPath, csv: csvPath, md: mdPath };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    compare,
    lineMetrics,
    runSeedComparison,
    runComparison,
    buildComparisonDataset,
    summarize,
    summarizeGroups,
    computeStats,
    toCSV,
    toJSON,
    toMarkdown,
    writeResults,
    readSeeds,
    SIDE_KEYS
  };
}

if (require.main === module) {
  const quick = process.argv.indexOf('--quick') >= 0;
  const doc = runComparison({
    write: true,
    iters: quick ? 5 : 200,
    warmup: quick ? 1 : 5
  });
  const written = path.join(__dirname, '../../', RESULTS_BASENAME);
  console.log('SOP 2 comparison: ' + doc.results.length + ' cases -> ' + written + '.json / .csv / .md');
  console.log('groups: seed=' + doc.dataset.composition.seed +
    ' holdout=' + doc.dataset.composition.holdout +
    ' injected=' + doc.dataset.composition.injected);
  console.log(JSON.stringify(doc.groups.seed.pseudopy && {
    pp_correct: doc.groups.seed.pseudopy.correct,
    b1_correct: doc.groups.seed.baseline.correct,
    b2_correct: doc.groups.seed.baselineB2.correct
  }));
  console.log(JSON.stringify(doc.groups.holdout && {
    pp_correct: doc.groups.holdout.pseudopy.correct,
    b1_correct: doc.groups.holdout.baseline.correct,
    b2_correct: doc.groups.holdout.baselineB2.correct
  }));
}
