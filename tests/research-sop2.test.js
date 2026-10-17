const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sop2 = require('../src/research/sop2-comparison');
const pythonRuntime = require('../src/research/python-runtime');

const PYTHON_OK = pythonRuntime.pythonSyntaxCheck('x = 1').ok === true;

test('toCSV writes real newlines, not escaped ones', () => {
  const doc = {
    results: [{
      caseId: 'a,1',
      title: 'x"y',
      pseudopy: { compileSuccess: true, syntaxSuccess: true, runtimeSuccess: false, generationTimeMs: 1.5 },
      baseline: { compileSuccess: true, syntaxSuccess: null, runtimeSuccess: null, generationTimeMs: 2 },
      metrics: {
        pseudopy: { precision: 0.5, recall: 0.25, f1: 1 / 3 },
        baseline: { precision: 1, recall: 1, f1: 1 }
      }
    }]
  };
  const csv = sop2.toCSV(doc);
  assert.equal((csv.match(/\n/g) || []).length, 2, 'header + one row + trailing newline');
  assert.equal((csv.match(/\\n/g) || []).length, 0, 'no escaped newlines');
  assert.ok(csv.split('\n')[0].startsWith('caseId,title,'));
  assert.ok(csv.includes('"a,1"'));
  assert.ok(csv.includes('"x""y"'));
  // A null (unverified) syntax verdict serializes as an empty cell, never a
  // boolean: ...bl_compile,bl_syntax,bl_runtime,bl_p -> ,1,,,1,
  assert.ok(csv.includes(',1,,,1,'), csv);
});

test('toJSON round-trips the results document', () => {
  const doc = { metadata: { cases: 0 }, summary: {}, results: [] };
  assert.deepEqual(JSON.parse(sop2.toJSON(doc)), doc);
});

// Item 5: loading the compiler bundle must never be charged to a case's
// generation time. If it were, this first call would take tens of ms.
test('generation timing excludes compiler bundle load', () => {
  const r = sop2.compare('BEGIN\n  PRINT 1\nEND', 'print(1)', { executeRuntime: false });
  assert.equal(r.pseudopy.compileSuccess, true);
  assert.ok(r.pseudopy.generationTimeMs >= 0);
  assert.ok(r.pseudopy.generationTimeMs < 200, 'first timed case paid for bundle load: ' + r.pseudopy.generationTimeMs + 'ms');
  assert.equal(r.baseline.generatedPython.trim(), 'print(1)');
  assert.equal(typeof r.metrics.pseudopy.precision, 'number');
  assert.equal(typeof r.metrics.baseline.recall, 'number');
});

// Item 3/4: baseline compile success is derived from the shared interpreter,
// not hardcoded.
test('baseline compileSuccess reflects the shared Python syntax check', () => {
  const r = sop2.compare('BEGIN\n  SET x TO 2 +\nEND', 'x = 2', { executeRuntime: false });
  assert.equal(r.pseudopy.compileSuccess, false);
  if (PYTHON_OK) {
    assert.equal(r.baseline.syntaxSuccess, false);
    assert.equal(r.baseline.compileSuccess, false);
    assert.ok(r.baseline.syntaxError);
  }
});

test('both translators are executed in the same Python runtime', { skip: !PYTHON_OK }, () => {
  const r = sop2.compare('BEGIN\n  PRINT 1\nEND', 'print(1)', { executeRuntime: true });
  assert.equal(r.pseudopy.syntaxSuccess, true);
  assert.equal(r.pseudopy.runtimeSuccess, true);
  assert.equal(r.pseudopy.stdout.trim(), '1');
  assert.equal(r.baseline.syntaxSuccess, true);
  assert.equal(r.baseline.runtimeSuccess, true);
  assert.equal(r.baseline.stdout.trim(), '1');
});

test('runtime errors are captured for both sides', { skip: !PYTHON_OK }, () => {
  const r = sop2.compare('BEGIN\n  SET x TO 1 / 0\nEND', 'print(1)', { executeRuntime: true });
  assert.equal(r.pseudopy.compileSuccess, true);
  assert.equal(r.pseudopy.runtimeSuccess, false);
  assert.match(r.pseudopy.runtimeError, /ZeroDivisionError/);
});

// Item 2: the seed runner produces real artifacts on disk.
test('runSeedComparison writes real JSON and CSV files', { skip: !PYTHON_OK }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sop2-'));
  const doc = sop2.runSeedComparison({ limit: 2, executeRuntime: true, write: true, outDir: dir });
  assert.equal(doc.results.length, 2);

  const json = JSON.parse(fs.readFileSync(path.join(dir, 'sop2-comparison-results.json'), 'utf8'));
  assert.equal(json.results.length, 2);
  assert.equal(json.metadata.metricsVersion, '2.0.0');

  const csvRaw = fs.readFileSync(path.join(dir, 'sop2-comparison-results.csv'), 'utf8');
  assert.equal((csvRaw.match(/\\n/g) || []).length, 0);
  assert.equal(csvRaw.trim().split('\n').length, 3, 'header + two rows');
});
