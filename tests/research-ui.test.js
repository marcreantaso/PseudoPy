const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const SOURCE = 'BEGIN\nSET x TO 1\nSET y TO 2\nDISPLAY x\nEND';
const REFERENCE = 'x = 1\ny = 2\nprint(x)\nprint(99)';

function makeElement(id, values) {
  return {
    id: id,
    value: values[id] || '',
    disabled: false,
    textContent: '',
    innerHTML: '',
    className: '',
    style: {},
    hidden: false,
    label: '',
    classList: {
      _set: {},
      add: function (c) { this._set[c] = true; },
      remove: function (c) { delete this._set[c]; },
      contains: function (c) { return !!this._set[c]; },
      toggle: function (c, force) { if (force === undefined) force = !this._set[c]; if (force) this._set[c] = true; else delete this._set[c]; return force; }
    },
    setAttribute: function () {},
    addEventListener: function () {},
    appendChild: function () {},
    removeChild: function () {},
    querySelector: function () { return null; },
    focus: function () {},
    click: function () {}
  };
}

function loadUi() {
  const ctx = vm.createContext({ console: console, performance: performance, Date: Date, Math: Math, JSON: JSON, setTimeout: setTimeout, clearTimeout: clearTimeout, Promise: Promise });
  const values = { 'sop2-src': SOURCE, 'sop2-ref': REFERENCE };
  const elements = {};
  ctx.document = {
    readyState: 'complete',
    addEventListener: function () {},
    body: { appendChild: function () {}, removeChild: function () {} },
    getElementById: function (id) {
      if (!elements[id]) elements[id] = makeElement(id, values);
      return elements[id];
    },
    createElement: function (tag) { return makeElement(tag, {}); }
  };
  ctx.window = ctx;
  ctx.URL = { createObjectURL: function () { return 'blob:x'; }, revokeObjectURL: function () {} };
  ctx.Blob = function (parts, opts) { return { parts: parts, opts: opts }; };
  ctx.navigator = {};
  // Serve the real vendored Skulpt runtime, so the panel's syntax and runtime
  // checks are exercised for real rather than against a stub. The shared
  // research modules are loaded in the same order as the devtools bundle.
  for (const f of [
    'mapper.js', 'compiler.js',
    'vendor/skulpt/skulpt.min.js', 'vendor/skulpt/skulpt-stdlib.js',
    'src/research/line-metrics.js', 'src/research/stats.js',
    'src/research/functional-metrics.js', 'src/research/error-taxonomy.js',
    'src/research/error-injection.js', 'src/research/holdout-cases.js',
    'src/research/dataset.js', 'src/research/timing.js', 'src/research/report.js',
    'src/research/baseline-translator.js',
    'src/devtools/research-ui.js'
  ]) {
    vm.runInContext(read(f), ctx, { filename: f });
  }
  return ctx;
}

test('research-ui wires every SOP2 button and avoids a duplicate metrics implementation', () => {
  const src = read('src/devtools/research-ui.js');
  for (const id of ['sop2-compare', 'sop2-run', 'sop2-bench', 'sop2-cancel',
    'sop2-export-json', 'sop2-export-csv', 'sop2-export-report']) {
    assert.ok(src.includes("bind('" + id + "'"), id + ' has no click handler');
  }
  assert.doesNotMatch(src, /require\(/, 'browser UI must not call require');
  assert.match(src, /Sop2Functional/, 'must use the shared functional/taxonomy modules');
  assert.doesNotMatch(src, /function lineMetrics\(/, 'must not carry a duplicate metrics implementation');
  assert.doesNotMatch(src, /function classify\(/, 'must not carry a duplicate taxonomy implementation');
});

test('vendored Skulpt parses with the (filename, code) argument order the UI uses', () => {
  const ctx = vm.createContext({ console: console, performance: performance, Date: Date, Math: Math, JSON: JSON, setTimeout: setTimeout, clearTimeout: clearTimeout });
  vm.runInContext(read('vendor/skulpt/skulpt.min.js'), ctx);
  assert.equal(typeof ctx.Sk.parse, 'function');
  ctx.Sk.configure({ __future__: ctx.Sk.python3 });
  assert.doesNotThrow(() => ctx.Sk.parse('<test>', 'x = 1\n'));
  assert.throws(() => ctx.Sk.parse('<test>', 'x = \n'));
});

test('baselineTranslate validates via Skulpt by default when it is present', () => {
  const ctx = loadUi();
  const ok = ctx.baselineTranslate(SOURCE);
  assert.equal(ok.syntaxSuccess, true);
  // MOD is not rewritten by the naive mapper, so this output is invalid Python.
  const bad = ctx.baselineTranslate('BEGIN\n  IF x MOD 2 == 0 THEN\n    PRINT 1\n  ENDIF\nEND');
  assert.equal(bad.syntaxSuccess, false);
  assert.ok(bad.syntaxError);
});

test('browser Compare reports metrics with correct P/R denominators', async () => {  const ctx = loadUi();
  const doc = await ctx.window.__sop2ui.compare();
  assert.equal(doc.results.length, 1);
  const r = doc.results[0];
  assert.equal(r.pseudopy.generatedPython, 'x = 1\ny = 2\nprint(x)');
  // 3 generated lines, 4 expected lines, 3 matched.
  assert.equal(r.metrics.pseudopy.precision, 1);
  assert.ok(Math.abs(r.metrics.pseudopy.recall - 0.75) < 1e-9, 'recall must be 0.75, got ' + r.metrics.pseudopy.recall);
  assert.equal(r.metrics.pseudopy.genLines, 3);
  assert.equal(r.metrics.pseudopy.expLines, 4);
});

test('browser Run both executes both translators in the same Skulpt runtime', async () => {
  const ctx = loadUi();
  const doc = await ctx.window.__sop2ui.runBoth();
  const r = doc.results[0];
  assert.equal(r.pseudopy.syntaxSuccess, true);
  assert.equal(r.pseudopy.runtimeSuccess, true);
  assert.equal(r.pseudopy.stdout.trim(), '1');
  assert.equal(r.baseline.syntaxSuccess, true);
  assert.equal(r.baseline.runtimeSuccess, true);
  assert.equal(r.baseline.stdout.trim(), '1');
});
