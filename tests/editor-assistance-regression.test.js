'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadContext() {
  const ctx = { module: { exports: {} }, exports: {}, console, setTimeout, clearTimeout, performance: { now: () => Date.now() } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'mapper.js')), ctx);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'compiler.js')), ctx);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'editor-assistance.js')), ctx);
  return ctx;
}

test('compiler never auto-repairs (regression)', () => {
  const ctx = loadContext();
  const res = ctx.pseudopyReviewSource('BEGIN\nIF TRUE THEN\nDISPLAY 1\nEND');
  assert.equal(res.autoFixes.length, 0);
});

test('parser diagnostics have structured fields (regression)', () => {
  const ctx = loadContext();
  const diags = ctx.pseudopyDedupeDiagnostics([
    { line: 2, message: 'IF missing THEN', code: 'PARSE_IF_MISSING_THEN', fixKind: 'insert-sentinel', detail: { sentinel: 'THEN' } },
    { line: 5, message: 'Unclosed IF block', code: 'PARSE_UNCLOSED_BLOCK', fixKind: 'close-block', detail: { blockType: 'IF', openLine: 2 } },
    { line: 3, message: 'Block mismatch', code: 'PARSE_BLOCK_MISMATCH', fixKind: 'rewrite-closing-keyword', detail: { expected: 'IF', found: 'WHILE', openLine: 1, closeLine: 3 } }
  ]);
  assert.ok(diags.every(d => d.code && d.fixKind));
});

test('unclosed blocks dedupe and bundle (regression)', () => {
  const ctx = loadContext();
  const diags = ctx.pseudopyDedupeDiagnostics([
    { line: 2, code: 'PARSE_UNCLOSED_BLOCK', fixKind: 'close-block', detail: { blockType: 'IF', openLine: 1 } },
    { line: 2, code: 'PARSE_UNCLOSED_BLOCK', fixKind: 'close-block', detail: { blockType: 'IF', openLine: 1 } }
  ]);
  assert.equal(diags.length, 1);
  const cands = ctx.pseudopyQuickFixCandidates('IF TRUE THEN\n  IF FALSE THEN\nEND\n', { errors: diags });
  const comp = cands.find(c => c.kind === 'close-block');
  assert.ok(comp);
  assert.ok(comp.insertedLines && comp.insertedLines.length > 0);
});

test('structural fixes require matching source (regression)', () => {
  const ctx = loadContext();
  const diags = [{ line: 1, code: 'PARSE_IF_MISSING_THEN', fixKind: 'insert-sentinel', detail: { sentinel: 'THEN' } }];
  const cands = ctx.pseudopyQuickFixCandidates('IF TRUE', { errors: diags });
  assert.ok(cands.length >= 1);
  ctx.pseudopyApplyBatch('IF TRUE', cands);
  assert.throws(() => {
    ctx.pseudopyApplyBatch('IF FALSE', cands);
  }, /changed|revision/i);
});

test('header repairs are verified against the compiler before they qualify (regression)', () => {
  const ctx = loadContext();
  const source = 'BEGIN\nFOR i 1 TO 10 DO\nDISPLAY i\nEND FOR\nEND';
  const result = ctx.pseudopyReviewSource(source);
  const diag = result.errors.find(e => e.code === 'PARSE_FOR_MISSING_FROM');
  assert.ok(diag);
  assert.equal(diag.fixKind, 'insert-keyword');
  assert.equal(diag.detail.expected, 'FROM');
  assert.equal(diag.detail.hasTo, true);

  const fix = ctx.pseudopyQuickFixCandidates(source, result).find(f => f.kind === 'header');
  assert.ok(fix);
  assert.equal(fix.qualified, true);
  assert.equal(ctx.pseudopyApplyQuickFix(source, fix).split('\n')[1], 'FOR i FROM 1 TO 10 DO');
});

test('an unverifiable header repair degrades to guidance (regression)', () => {
  const ctx = loadContext();
  const source = 'BEGIN\nDECLARE x AS INTEGER\nSET x total 5\nEND';
  const cands = ctx.pseudopyQuickFixCandidates(source, ctx.pseudopyReviewSource(source));
  assert.equal(cands.some(c => c.qualified && c.kind === 'header'), false);
  const guidance = cands.find(c => c.kind === 'header-guidance');
  assert.ok(guidance);
  assert.equal(guidance.qualified, false);
  assert.equal(typeof guidance.hint, 'string');
});
