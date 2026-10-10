const fs = require('fs');
const path = require('path');
const MetricsCore = require('./line-metrics');

function lineMetrics(gen, exp) {
  return MetricsCore.lineMetrics(gen, exp);
}

function compare(source, refPython, opts) {
  const t0 = Date.now();
  let pseudopyRes;
  try {
    const vm = require('vm');
    const ctx = { module: { exports: {} }, exports: {}, console, setTimeout, clearTimeout, performance: { now: () => Date.now() } };
    const base = path.join(__dirname, '../../');
    vm.runInNewContext(fs.readFileSync(path.join(base, 'mapper.js')), ctx);
    vm.runInNewContext(fs.readFileSync(path.join(base, 'compiler.js')), ctx);
    pseudopyRes = new ctx.module.exports.PseudocodeCompiler().compile(source);
  } catch (e) {
    pseudopyRes = { valid: false, python: '', errors: [e.message || String(e)] };
  }
  const t1 = Date.now();
  let baselineRes;
  try {
    const { baselineTranslate } = require('./baseline-translator');
    baselineRes = baselineTranslate(source);
  } catch (e) {
    baselineRes = { generatedPython: '', success: false, syntaxSuccess: false, runtimeSuccess: false };
  }
  const t2 = Date.now();
  return {
    caseId: (opts && opts.caseId) || null,
    input: source,
    expectedPython: refPython || '',
    pseudopy: { generatedPython: pseudopyRes.python || '', compileSuccess: !!pseudopyRes.valid, generationTimeMs: t1 - t0, errors: pseudopyRes.errors || [] },
    baseline: { generatedPython: baselineRes.generatedPython || '', compileSuccess: !!baselineRes.success, generationTimeMs: t2 - t1 },
    metrics: { pseudopy: lineMetrics(pseudopyRes.python || '', refPython || ''), baseline: lineMetrics(baselineRes.generatedPython || '', refPython || '') }
  };
}

function runSeedComparison() {
  const db = fs.readFileSync(path.join(__dirname, '../../database.js'), 'utf8');
  const start = db.indexOf('const SEED_EXERCISES_LIST = ');
  if (start < 0) return [];
  const s = db.indexOf('[', start);
  const end = db.indexOf('];', s);
  let seeds;
  try { seeds = JSON.parse(db.slice(s, end + 1)); } catch (e) { return []; }
  const results = [];
  for (let i = 0; i < seeds.length && i < 30; i++) {
    const ex = seeds[i];
    const src = ex.pseudocode || ex.code || '';
    const ref = ex.python_code || ex.solution || ex.pythonCode || '';
    if (!src) continue;
    results.push(compare(src, ref, { caseId: ex.id }));
  }
  return results;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { compare, lineMetrics, runSeedComparison };
}