/* Regression tests for the SOP 2 research modules:
   stats, functional metrics, error taxonomy, error injection,
   dataset assembly, timing and the shared report renderer.

   These pin the measurement definitions themselves, independent of any
   particular run, so a future refactor cannot quietly change what the
   report means. */

const test = require('node:test');
const assert = require('node:assert/strict');

const Stats = require('../src/research/stats');
const Functional = require('../src/research/functional-metrics');
const Taxonomy = require('../src/research/error-taxonomy');
const Injection = require('../src/research/error-injection');
const Dataset = require('../src/research/dataset');
const Timing = require('../src/research/timing');
const Report = require('../src/research/report');
const Holdout = require('../src/research/holdout-cases');

/* ---------------------------------------------------------- stats */

test('wilson interval is sane at the extremes', () => {
  const zero = Stats.wilson(0, 0);
  assert.equal(zero.n, 0);
  assert.equal(zero.low, 0);
  assert.equal(zero.high, 0);

  const perfect = Stats.wilson(10, 10);
  assert.equal(perfect.p, 1);
  assert.ok(perfect.high > 0.99, 'upper bound approaches 1');
  assert.ok(perfect.low < 1 && perfect.low > 0, 'low bound below p for small n');

  const half = Stats.wilson(5, 10);
  assert.equal(half.p, 0.5);
  assert.ok(half.low < 0.5 && half.high > 0.5);
  assert.ok(half.low > 0.23 && half.low < 0.24);
  assert.ok(half.high > 0.76 && half.high < 0.77);
});

test('wilson narrows as the sample grows', () => {
  const small = Stats.wilson(5, 10);
  const large = Stats.wilson(50, 100);
  assert.ok((large.high - large.low) < (small.high - small.low));
});

test('exact McNemar is symmetric and detects the obvious asymmetry', () => {
  assert.equal(Stats.mcnemarExact(0, 0).p, 1);
  assert.equal(Stats.mcnemarExact(3, 1).p, Stats.mcnemarExact(1, 3).p);
  assert.ok(Stats.mcnemarExact(10, 0).p < 0.05);
  assert.ok(Stats.mcnemarExact(1, 1).p > 0.05);
});

test('wilcoxon drops zero diffs, is symmetric and reports its method', () => {
  const none = Stats.wilcoxon([0, 0, 0]);
  assert.equal(none.n, 0);
  assert.equal(none.p, 1);
  assert.equal(none.method, 'none');

  const pos = Stats.wilcoxon([1, 2, 3, 4, 5, 6, 7, 8]);
  const neg = Stats.wilcoxon([-1, -2, -3, -4, -5, -6, -7, -8]);
  assert.equal(pos.p, neg.p, 'sign of every difference must not change p');
  assert.ok(pos.p < 0.05);
  assert.equal(Stats.wilcoxon([0, 0, 1, 0]).n, 1, 'zero differences are dropped');
  assert.equal(Stats.wilcoxon([0, 0, 0]).method, 'none');
});

test('median and IQR use order statistics', () => {
  assert.equal(Stats.median([1, 2, 3, 4]), 2.5);
  assert.equal(Stats.median([3]), 3);
  assert.equal(Stats.iqr([1, 2, 3, 4, 5]), 2);
  assert.equal(Stats.median([]), 0);
});

/* ------------------------------------------------- functional metrics */

test('stdout equality normalises CRLF, trailing spaces and blank edges', () => {
  assert.equal(Functional.outputsMatch('a\r\nb  \n', '\na\nb'), true);
  assert.equal(Functional.outputsMatch('a\nb', 'a\nc'), false);
  assert.equal(Functional.outputsMatch('', ''), true);
});

test('normalizeSemantic drops compiler declaration initializers and comments', () => {
  const generated = [
    '# DECLARE total AS INTEGER',
    'total = 0',
    'total = total + 1  # bump',
    '',
    'print(total)'
  ].join('\n');
  const normalized = Functional.normalizeSemantic(generated);
  assert.equal(normalized.includes('DECLARE'), false);
  assert.equal(normalized.includes('#'), false);
  assert.equal(normalized.trim(), 'total = total + 1\nprint(total)');
});

test('textSimilarity returns a raw and a normalised line-metric object', () => {
  const sim = Functional.textSimilarity('x = 1\nprint(x)', 'x = 1\nprint(x)\nprint(99)');
  assert.equal(sim.raw.genLines, 2);
  assert.equal(sim.raw.expLines, 3);
  assert.equal(sim.raw.precision, 1);
  assert.equal(Math.round(sim.raw.recall * 100) / 100, 0.67);
  assert.ok(sim.normalized && typeof sim.normalized.f1 === 'number');
});

/* ---------------------------------------------------- error taxonomy */

test('classify walks rejected -> syntax -> runtime -> output', () => {
  assert.equal(Taxonomy.classify({ rejected: true }), 'rejected');
  assert.equal(Taxonomy.classify({ syntaxOk: null }), 'unverified');
  assert.equal(Taxonomy.classify({ syntaxOk: false }), 'syntax_error');
  assert.equal(Taxonomy.classify({ syntaxOk: true, runtimeOk: false }), 'runtime_error');
  assert.equal(Taxonomy.classify({ syntaxOk: true, runtimeOk: true, outputMatches: false }), 'wrong_output');
  assert.equal(Taxonomy.classify({ syntaxOk: true, runtimeOk: true, outputMatches: true }), 'correct');
});

test('silent failures exclude warned and unverified outcomes', () => {
  assert.equal(Taxonomy.isSilentFailure('wrong_output', false), true);
  assert.equal(Taxonomy.isSilentFailure('runtime_error', undefined), true);
  assert.equal(Taxonomy.isSilentFailure('wrong_output', true), false);
  assert.equal(Taxonomy.isSilentFailure('rejected', false), false);
  assert.equal(Taxonomy.isSilentFailure('correct', false), false);
  assert.equal(Taxonomy.isSilentFailure('unverified', false), false);
});

test('summarize computes rates over evaluated cases only', () => {
  const summary = Taxonomy.summarize([
    { class: 'correct', hasWarning: false },
    { class: 'wrong_output', hasWarning: false },
    { class: 'rejected', hasWarning: true },
    { class: 'unverified', hasWarning: false }
  ]);
  assert.equal(summary.cases, 4);
  assert.equal(summary.evaluated, 3, 'unverified excluded from the denominator');
  assert.equal(summary.correct, 1);
  assert.equal(summary.silentFailures, 1);
  assert.equal(Math.round(summary.correctnessRate * 100), 33);
});

/* -------------------------------------------------- error injection */

test('keyword typo changes exactly the first statement keyword', () => {
  const result = Injection.inject('BEGIN\n  DISPLAY x\nEND', 'keyword_typo');
  assert.ok(result, 'injection applies when a known keyword is present');
  assert.match(result.source, /DISPLAI x/);
});

test('missing END IF is skipped when there is no IF', () => {
  assert.equal(Injection.inject('BEGIN\n  DISPLAY x\nEND', 'missing_end_if'), null);
});

test('injectAll reports skipped types instead of hiding them', () => {
  const result = Injection.injectAll('BEGIN\n  DISPLAY x\nEND');
  const types = result.applicable.map(function (a) { return a.type; });
  assert.ok(types.includes('keyword_typo'));
  assert.ok(types.includes('return_outside_function'));
  assert.ok(result.skipped.includes('missing_end_if'));
  assert.ok(result.skipped.includes('wrong_argument_count'));
  result.applicable.forEach(function (a) {
    assert.notEqual(a.source, 'BEGIN\n  DISPLAY x\nEND', 'an applied injection must change the source');
  });
});

test('unknown injection type throws rather than silently doing nothing', () => {
  assert.throws(function () { Injection.inject('BEGIN\nEND', 'not_a_type'); });
});

/* -------------------------------------------------- dataset assembly */

const SEED = [
  { id: 'seed_1', title: 'Display one', pseudocode: 'BEGIN\n  DISPLAY 1\nEND', python_code: 'print(1)' }
];
const HOLDOUT = [
  { id: 'holdout_1', title: 'Add', pseudocode: 'BEGIN\n  PRINT 1 + 1\nEND', python_code: 'print(1 + 1)' }
];

test('buildDataset tags the three groups and links injections to their base', () => {
  const built = Dataset.buildDataset(SEED, HOLDOUT, { includeInjected: true });
  const seed = built.rows.filter(function (r) { return r.group === 'seed'; });
  const holdout = built.rows.filter(function (r) { return r.group === 'holdout'; });
  const injected = built.rows.filter(function (r) { return r.group === 'injected'; });
  assert.equal(seed.length, 1);
  assert.equal(holdout.length, 1);
  assert.ok(injected.length >= 2, 'at least two injections apply here');
  injected.forEach(function (r) {
    assert.ok(r.baseId, 'injected rows reference a base case');
    assert.ok(r.injectionType, 'injected rows carry their type');
  });
  assert.equal(built.injections.applicable, injected.length);
});

test('buildDataset can omit the injected group entirely', () => {
  const built = Dataset.buildDataset(SEED, HOLDOUT, { includeInjected: false });
  assert.equal(built.rows.length, 2);
  assert.equal(built.rows.every(function (r) { return r.group !== 'injected'; }), true);
});

test('buildDataset drops rows that lack a source or a reference', () => {
  const built = Dataset.buildDataset(
    [{ id: 'broken', pseudocode: '', python_code: 'print(1)' }],
    [{ id: 'ok', pseudocode: 'BEGIN\nEND', python_code: 'pass' }],
    { includeInjected: false }
  );
  assert.equal(built.rows.length, 1);
  assert.equal(built.rows[0].id, 'ok');
});

/* ---------------------------------------------------- holdout integrity */

test('holdout set is 30 unique, self-contained, in-spec cases', () => {
  assert.equal(Holdout.length, 30);
  const ids = {};
  Holdout.forEach(function (c) {
    assert.ok(c.id && !ids[c.id], 'duplicate id: ' + c.id);
    ids[c.id] = true;
    assert.ok(c.pseudocode && c.pseudocode.trim(), c.id + ' has pseudocode');
    assert.ok(c.python_code && c.python_code.trim(), c.id + ' has a reference solution');
    assert.equal(/^\s*\d*\s*BEGIN\b/i.test(c.pseudocode), true, c.id + ' must start with BEGIN');
    assert.equal(/\bEND\s*\.?\s*$/i.test(c.pseudocode.trim()), true, c.id + ' must end with END');
    assert.equal(/\bPROGRAM\b/i.test(c.pseudocode), false, c.id + ' uses an out-of-spec PROGRAM sentinel');
  });
});

/* ------------------------------------------------------------- timing */

test('measure excludes warm-ups and divides the batch by the iteration count', () => {
  let calls = 0;
  const clock = (function () {
    let t = 0;
    return function () { const v = t; t += 10; return v; };
  })();
  const result = Timing.measure(function () { calls++; }, { warmup: 1, iters: 3, now: clock });
  assert.equal(calls, 4, 'warm-up plus measured iterations');
  assert.equal(result.warmup, 1);
  assert.equal(result.iterations, 3);
  assert.equal(result.totalMs, 10);
  assert.equal(result.perIterationMs, 10 / 3);
});

/* -------------------------------------------- shared report renderer */

function fakeRow(group, ppCorrect, blCorrect, ppClass) {
  function side(correct, cls) {
    return {
      compileSuccess: true, syntaxSuccess: true, runtimeSuccess: true,
      correct: correct, class: cls || (correct ? 'correct' : 'wrong_output'),
      hasWarning: false, generationTimeMs: correct ? 2 : 1
    };
  }
  function metrics(value) {
    return { precision: value, recall: value, f1: value, normalized: { f1: value } };
  }
  return {
    caseId: group + '_1', group: group, injectionType: null,
    pseudopy: side(ppCorrect, ppClass),
    baseline: side(blCorrect),
    baselineB2: side(blCorrect),
    metrics: { pseudopy: metrics(1), baseline: metrics(0.5), baselineB2: metrics(0.5) }
  };
}

test('summaries and statistics come from the shared renderer', () => {
  const rows = [fakeRow('seed', true, false), fakeRow('seed', true, true), fakeRow('holdout', false, true)];
  const summary = Report.summarize(rows);
  assert.equal(summary.pseudopy.correct, 2);
  assert.equal(summary.baseline.correct, 2);

  const groups = Report.summarizeGroups(rows);
  assert.equal(groups.seed.pseudopy.correct, 2);
  assert.equal(groups.holdout.pseudopy.correct, 0);

  const stats = Report.computeStats(rows);
  assert.ok(stats.seed.pseudopy.wilson.p === 1);
  assert.equal(stats.seed.mcnemar.vsB1.b + stats.seed.mcnemar.vsB1.c, 1);
});

test('toMarkdown renders every SOP-2 section and the verdict', () => {
  const rows = [fakeRow('seed', true, false), fakeRow('holdout', false, true)];
  const doc = {
    metadata: { timestamp: 't', cases: rows.length, runtime: 'cpython' },
    dataset: { skippedInjections: [] },
    summary: Report.summarize(rows),
    groups: Report.summarizeGroups(rows),
    stats: Report.computeStats(rows),
    results: rows
  };
  const md = Report.toMarkdown(doc);
  for (const heading of ['## SOP 2a', '## SOP 2b', '## SOP 2c', '## Statistics', '## Verdict']) {
    assert.ok(doc && md.includes(heading), 'missing section: ' + heading);
  }
  assert.match(Report.verdictText(doc), /produced the reference output/);
});
