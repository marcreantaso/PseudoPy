const test = require('node:test');
const assert = require('node:assert/strict');
const MetricsCore = require('../src/research/line-metrics');

// Locks the denominator order that SOP 2 item 6 flagged: precision divides by
// GENERATED lines, recall divides by EXPECTED lines. A swapped implementation
// passes a symmetric case but fails these, because the two ratios differ.
test('precision uses generated lines and recall uses expected lines', () => {
  const m = MetricsCore.lineMetrics('a\nb', 'a\nb\nc');
  assert.equal(m.genLines, 2);
  assert.equal(m.expLines, 3);
  assert.equal(m.matched, 2);
  assert.equal(m.precision, 1);
  assert.ok(Math.abs(m.recall - 2 / 3) < 1e-12, 'recall must be 2/3, not 1');
});

test('extra generated lines lower precision only', () => {
  const m = MetricsCore.lineMetrics('a\nb\nx', 'a\nb');
  assert.equal(m.matched, 2);
  assert.ok(Math.abs(m.precision - 2 / 3) < 1e-12);
  assert.equal(m.recall, 1);
  assert.ok(Math.abs(m.f1 - 0.8) < 1e-12);
});

test('multiset matching counts repeated lines by minimum frequency', () => {
  const m = MetricsCore.lineMetrics('a\na', 'a');
  assert.equal(m.matched, 1);
  assert.equal(m.precision, 0.5);
  assert.equal(m.recall, 1);
});

test('both empty inputs score a perfect match; one empty scores zero', () => {
  const empty = MetricsCore.lineMetrics('', '');
  assert.equal(empty.precision, 1);
  assert.equal(empty.recall, 1);
  const oneSided = MetricsCore.lineMetrics('a', '');
  assert.equal(oneSided.precision, 0);
  assert.equal(oneSided.recall, 0);
});
