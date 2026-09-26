const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const context = vm.createContext({ console, performance });
vm.runInContext(fs.readFileSync(path.join(root, 'mapper.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'compiler.js'), 'utf8') + '\nthis.compiler = new PseudocodeCompiler();', context);

const compile = code => context.compiler.compile(code);

const semanticErrors = result => result.errors.filter(e => e.stage === 'Semantic Analysis');
const semanticWarnings = result => result.warnings.filter(w => w.stage === 'Semantic Analysis');

test('DECLAREd variables are strict: assigning text to INTEGER is a fatal type error', () => {
    const r = compile('BEGIN\n  DECLARE n AS INTEGER\n  n = "hello"\n  DISPLAY n\nEND');
    assert.equal(r.valid, false);
    const err = semanticErrors(r)[0];
    assert.equal(err.code, 'SEM_TYPE_MISMATCH');
    assert.equal(err.severity, 'error');
    assert.equal(err.stage, 'Semantic Analysis');
    assert.equal(err.line, 3);
    assert.match(err.message, /'n'/);
    assert.ok(err.suggestion && !err.suggestion.includes('undefined'));
    assert.ok(err.expected && err.received);
});

test('strictness applies ONLY to DECLAREd variables: undeclared assignments stay warnings', () => {
    const r = compile('BEGIN\n  n = 5\n  DISPLAY n\nEND');
    assert.equal(r.valid, true, 'existing programs without DECLARE must keep compiling');
    assert.ok(semanticWarnings(r).some(w => w.code === 'SEM_UNDECLARED_VARIABLE'));
});

test('BOOLEAN/BOOL declarations normalize and validate assignments', () => {
    const ok = compile('BEGIN\n  DECLARE found AS BOOLEAN\n  found = TRUE\n  IF found THEN\n    DISPLAY "yes"\n  END IF\nEND');
    assert.equal(ok.valid, true, JSON.stringify(ok.errors));
    const bad = compile('BEGIN\n  DECLARE found AS BOOLEAN\n  found = 1\n  DISPLAY found\nEND');
    assert.equal(bad.valid, false);
    assert.equal(semanticErrors(bad)[0].code, 'SEM_TYPE_MISMATCH');
});

test('plain non-boolean conditions are rejected, comparisons and booleans pass', () => {
    const literal = compile('BEGIN\n  IF 1 THEN\n    DISPLAY "x"\n  END IF\nEND');
    assert.equal(literal.valid, false);
    assert.equal(semanticErrors(literal)[0].code, 'SEM_CONDITION_NOT_BOOLEAN');

    const boolVar = compile('BEGIN\n  DECLARE flag AS BOOLEAN\n  flag = TRUE\n  IF flag THEN\n    DISPLAY "x"\n  END IF\nEND');
    assert.equal(boolVar.valid, true, JSON.stringify(boolVar.errors));

    const comparison = compile('BEGIN\n  WHILE 2 > 1 DO\n    DISPLAY "x"\n  END WHILE\nEND');
    assert.equal(comparison.valid, true, JSON.stringify(comparison.errors));
});

test('invalid operators on known operand types raise SEM_INVALID_OPERANDS', () => {
    const minus = compile('BEGIN\n  DISPLAY "a" - 1\nEND');
    assert.equal(minus.valid, false);
    assert.equal(semanticErrors(minus)[0].code, 'SEM_INVALID_OPERANDS');

    const stringTimes = compile('BEGIN\n  DISPLAY "a" * 3\nEND');
    assert.equal(stringTimes.valid, true, JSON.stringify(stringTimes.errors));

    const boolArith = compile('BEGIN\n  DECLARE flag AS BOOLEAN\n  flag = TRUE\n  DISPLAY flag + 1\nEND');
    assert.equal(boolArith.valid, false);
    assert.equal(semanticErrors(boolArith)[0].code, 'SEM_INVALID_OPERANDS');
});

test('mixing text and numbers with + in DISPLAY is rejected with the comma suggestion', () => {
    const r = compile('BEGIN\n  DECLARE age AS INTEGER\n  age = 21\n  DISPLAY "Age:" + age\nEND');
    assert.equal(r.valid, false);
    const err = semanticErrors(r)[0];
    assert.equal(err.code, 'SEM_INVALID_OPERANDS');
    assert.ok(err.suggestion.includes('DISPLAY "Age:", age'), 'suggests the idomatic comma form');
});

test('real/integer literal widening produces warnings, not errors', () => {
    const realToInt = compile('BEGIN\n  DECLARE x AS INTEGER\n  x = 2.5\nEND');
    assert.equal(realToInt.valid, true);
    assert.ok(semanticWarnings(realToInt).some(w => w.code === 'SEM_TYPE_MISMATCH' && /REAL/.test(w.message)));

    const intToReal = compile('BEGIN\n  DECLARE r AS REAL\n  r = 5\nEND');
    assert.equal(intToReal.valid, true);
    assert.ok(semanticWarnings(intToReal).some(w => /INTEGER value 5 assigned to REAL/.test(w.message)));
});

test('typed expressions keep valid: total = total + i with an implicit loop variable', () => {
    const r = compile('BEGIN\n  DECLARE total AS INTEGER\n  total = 0\n  FOR i FROM 1 TO 5 DO\n    total = total + i\n  END FOR\n  DISPLAY total\nEND');
    assert.equal(r.valid, true, JSON.stringify(r.errors));
});

test('array literals assign to ARRAY declarations and mixed elements warn', () => {
    const ok = compile('BEGIN\n  DECLARE a AS ARRAY\n  a = [1, 2, 3]\n  DISPLAY a[0]\nEND');
    assert.equal(ok.valid, true, JSON.stringify(ok.errors));

    const mixed = compile('BEGIN\n  DECLARE b AS ARRAY\n  b = [1, "two"]\nEND');
    assert.equal(mixed.valid, true);
    assert.ok(semanticWarnings(mixed).some(w => /mixed types/.test(w.message)));

    const notArray = compile('BEGIN\n  DECLARE c AS ARRAY\n  c = 5\nEND');
    assert.equal(notArray.valid, false);
    assert.equal(semanticErrors(notArray)[0].code, 'SEM_TYPE_MISMATCH');
});

test('strict INPUT generates the reprompting integer/float helpers', () => {
    const intResult = compile('BEGIN\n  DECLARE n AS INTEGER\n  INPUT n\n  DISPLAY n\nEND');
    assert.equal(intResult.valid, true, JSON.stringify(intResult.errors));
    assert.match(intResult.python, /n = _pseudopy_input_int\(/);
    assert.match(intResult.python, /def _pseudopy_input_int/);

    const realResult = compile('BEGIN\n  DECLARE r AS REAL\n  INPUT r\nEND');
    assert.match(realResult.python, /r = _pseudopy_input_float\(/);
    assert.match(realResult.python, /def _pseudopy_input_float/);
});

test('semantic errors never leak undefined/null/[object Object] into user-visible fields', () => {
    const r = compile('BEGIN\n  DECLARE ok AS BOOLEAN\n  ok = "maybe"\n  DISPLAY "flag: " + ok\nEND');
    for (const err of r.errors) {
        for (const field of ['message', 'problem', 'expected', 'received', 'suggestion']) {
            const value = String(err[field] == null ? '' : err[field]);
            assert.ok(value.length > 0, `error.${field} must be populated: ${JSON.stringify(err)}`);
            assert.ok(!value.includes('undefined') && !value.includes('[object Object]'), `error.${field} must not leak internals: ${value}`);
        }
    }
});

test('function parameters and unknown operands are tolerated (not strict)', () => {
    const r = compile('BEGIN\n  FUNCTION add(a, b)\n    DISPLAY a + b\n  END FUNCTION\n  CALL add(2, 3)\nEND');
    assert.equal(r.valid, true, JSON.stringify(r.errors));
});