const test = require('node:test');
const assert = require('node:assert/strict');
const { baselineTranslate, baselineTranslateRaw } = require('../src/research/baseline-translator');

const SOURCE = 'BEGIN\n  DECLARE total AS INTEGER\n  total = 1\n  PRINT total\nEND';

test('raw translation emits Python and carries no success verdict', () => {
  const raw = baselineTranslateRaw(SOURCE);
  assert.ok(raw.generatedPython.includes('total = 1'));
  assert.ok(raw.generatedPython.includes('print(total)'));
  assert.equal('success' in raw, false);
});

test('baselineTranslate honours a caller-supplied syntax checker (item 3)', () => {
  const ok = baselineTranslate(SOURCE, { syntaxCheck: function () { return { ok: true }; } });
  assert.equal(ok.success, true);
  assert.equal(ok.syntaxSuccess, true);
  assert.equal(ok.syntaxError, null);

  const bad = baselineTranslate(SOURCE, { syntaxCheck: function () { throw new Error('unexpected indent'); } });
  assert.equal(bad.success, false);
  assert.equal(bad.syntaxSuccess, false);
  assert.match(bad.syntaxError, /unexpected indent/);
});

test('a boolean-returning checker is accepted', () => {
  assert.equal(baselineTranslate(SOURCE, { syntaxCheck: function () { return false; } }).syntaxSuccess, false);
  assert.equal(baselineTranslate(SOURCE, { syntaxCheck: function () { return true; } }).syntaxSuccess, true);
});

test('without a checker the translator reports unverified, never success', () => {
  const r = baselineTranslate(SOURCE, { syntaxCheck: null });
  assert.equal(r.syntaxSuccess, null);
  assert.equal(r.success, false);
});
