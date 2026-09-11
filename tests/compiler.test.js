const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const context = vm.createContext({ performance, console: { log() {} } });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../mapper.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '../compiler.js'), 'utf8') + '\nglobalThis.engine = new PseudocodeCompiler();', context);
const compile = source => context.engine.compile(source);
function python(code, input = '') {
    const result = spawnSync(process.env.PYTHON || 'python3', ['-I', '-c', code], { input, encoding: 'utf8', timeout: 3000 });
    assert.equal(result.status, 0, result.stderr || String(result.error));
    return result.stdout.trim();
}
function run(body, input = '') {
    const result = compile('BEGIN\n' + body + '\nEND');
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    return python(result.python, input);
}
const expressions = [
    '2 + 3 * 4', '(2 + 3) * 4', '2 ** 3 ** 2', '-2 ** 2', '2 ** -2',
    '(-2) ** 2', '-7 // 3', '7 // -3', '-7 % 3', '7 % -3', '7 / 2',
    '5 ^ 3', '1 << 2 + 1', '16 >> 2', '~3', '6 & 3 | 8',
    'NOT 1 == 2 AND 2 < 3', 'TRUE OR FALSE AND FALSE',
    'FALSE AND (1 / 0)', 'TRUE OR (1 / 0)', '0 OR 7', '5 AND 9',
    '1 < 2 < 3', '1 < 3 < 2', '2 IN [1, 2, 3]', '4 NOT IN [1, 2]',
    'NULL IS NONE', '[1] IS NOT [1]', '1e3 + .5', '"ab" * 3',
    '[1, 2, 3][1]', '[[1, 2], [3, 4]][1][0]', '[1, 2, 3][::-1]',
    'len([1, 2]) + max(3, 4)', '"ABC".lower()', '()'
];
for (const expression of expressions) test('Python operator semantics: ' + expression, () => {
    const reference = expression.replace(/\b(AND|OR|NOT|IN|IS)\b/g, s => s.toLowerCase()).replace(/\bTRUE\b/g, 'True').replace(/\bFALSE\b/g, 'False').replace(/\b(NULL|NONE)\b/g, 'None');
    assert.equal(run('DISPLAY ' + expression), python('print(' + reference + ')'));
});
test('pseudocode operator aliases and Unicode', () => assert.equal(run('DISPLAY 7 DIV 2, 7 MOD 2, 3 ≥ 2, 1 ≤ 2, 2 ≠ 3, 2 = 2, 2 <> 3, 2 × 3, 6 ÷ 2'), '3 1 True True True True True 6 3.0'));
test('strings, escapes, mapper phrases, inline comments remain intact', () => {
    assert.equal(run(String.raw`DISPLAY 'He said "PLUS ≥"', "a\"b", "DIVIDED BY", "# //" # PLUS`), 'He said "PLUS ≥" a"b DIVIDED BY # //');
    assert.equal(run('SET x TO 3 PLUS 2\nDISPLAY x'), '5');
});
test('full-line comments versus floor division', () => assert.equal(run('// comment\nDISPLAY 9 // 2 # inline\n# comment'), '4'));
test('typed INPUT preserves integer loop bounds', () => assert.match(run('DECLARE n AS INTEGER\nINPUT n\nFOR i FROM 1 TO n DO\nDISPLAY i\nEND FOR', '3\n'), /1\n2\n3$/));
test('untyped INPUT remains text', () => assert.match(run('INPUT x\nDISPLAY x', 'hello\n'), /hello$/));
test('CALL passes distinct arguments', () => assert.equal(run('FUNCTION add(a, b)\nDISPLAY a + b\nEND FUNCTION\nCALL add(2, 3)'), '5'));
test('inclusive descending FOR STEP', () => assert.equal(run('FOR i FROM 3 TO 1 STEP -1 DO\nDISPLAY i\nEND FOR'), '3\n2\n1'));
test('nested array index assignment', () => assert.equal(run('SET a TO [0, 1]\nSET indices TO [1]\nSET a[indices[0]] TO 9\nDISPLAY a'), '[0, 9]'));
test('expression AST exposes precedence and comparison chains', () => {
    const result = compile('BEGIN\nSET x TO 2 + 3 * 4\nIF 1 < 2 < 3 THEN\nDISPLAY x\nEND IF\nEND');
    assert.equal(result.ast.body[0].expr.ast.type, 'BinaryExpression');
    assert.equal(result.ast.body[0].expr.ast.right.operator, '*');
    assert.equal(result.ast.body[1].condition.ast.comparators.length, 2);
});
const invalid = [
    'SET x TO 2 +', 'SET x TO 2 *** 3', 'SET x TO (2 + 3', 'SET x TO 2 $ 3',
    'SET x TO 1.2.3', 'SET x TO "unclosed', 'SET x 3', 'SET x TO 2 ≈ 3',
    'IF TRUE\nDISPLAY 1\nEND IF', 'WHILE FALSE\nDISPLAY 1\nEND WHILE',
    'FOR i FROM 1 3 DO\nDISPLAY i\nEND FOR', 'FOR EACH x [1] DO\nDISPLAY x\nEND FOR',
    'RETURN 1', 'BOGUS statement', 'DECLARE x AS UNKNOWN',
    'FOR i FROM 1 TO 3 STEP 0 DO\nDISPLAY i\nEND FOR', 'FUNCTION f(a, a)\nRETURN a\nEND FUNCTION',
    'IF TRUE THEN\nDISPLAY 1', 'SET class TO 1'
];
for (const body of invalid) test('reject malformed input: ' + body.split('\n')[0], () => {
    const result = compile('BEGIN\n' + body + '\nEND');
    assert.equal(result.valid, false, result.python);
    assert.equal(result.python, '');
    assert.ok(result.errors.every(e => e.line >= 1));
});
test('reject trailing program statements', () => assert.equal(compile('BEGIN\nDISPLAY 1\nEND\nDISPLAY 2').valid, false));
test('unclosed blocks are never silently repaired', () => assert.equal(compile('BEGIN\nIF TRUE THEN\nDISPLAY 1\nEND').autoFixes.length, 0));
test('complexity counts sequential END FOR closures correctly', () => assert.equal(context.engine.analyzeComplexity('BEGIN\nFOR i FROM 1 TO n DO\nEND FOR\nFOR j FROM 1 TO n DO\nEND FOR\nEND'), 'O(N)'));

const algorithms = {
    factorial: ['SET product TO 1\nFOR i FROM 1 TO 5 DO\nSET product TO product * i\nEND FOR\nDISPLAY product', '120'],
    fibonacci: ['SET a TO 0\nSET b TO 1\nFOR i FROM 1 TO 10 DO\nSET next TO a + b\nSET a TO b\nSET b TO next\nEND FOR\nDISPLAY a', '55'],
    gcd: ['SET a TO 48\nSET b TO 18\nWHILE b != 0 DO\nSET remainder TO a MOD b\nSET a TO b\nSET b TO remainder\nEND WHILE\nDISPLAY a', '6'],
    linearSearch: ['SET values TO [7, 2, 9]\nSET found TO -1\nFOR i FROM 0 TO len(values) - 1 DO\nIF values[i] = 9 THEN\nSET found TO i\nEND IF\nEND FOR\nDISPLAY found', '2'],
    binarySearch: ['SET values TO [1, 3, 5, 7, 9]\nSET low TO 0\nSET high TO len(values) - 1\nSET found TO -1\nWHILE low <= high AND found = -1 DO\nSET mid TO (low + high) // 2\nIF values[mid] = 7 THEN\nSET found TO mid\nELSE IF values[mid] < 7 THEN\nSET low TO mid + 1\nELSE\nSET high TO mid - 1\nEND IF\nEND WHILE\nDISPLAY found', '3'],
    bubbleSort: ['SET a TO [5, 1, 4, 2, 2]\nFOR i FROM 0 TO len(a) - 2 DO\nFOR j FROM 0 TO len(a) - i - 2 DO\nIF a[j] > a[j + 1] THEN\nSET temp TO a[j]\nSET a[j] TO a[j + 1]\nSET a[j + 1] TO temp\nEND IF\nEND FOR\nEND FOR\nDISPLAY a', '[1, 2, 2, 4, 5]'],
    insertionSort: ['SET a TO [5, 1, 4, 2, 2]\nFOR i FROM 1 TO len(a) - 1 DO\nSET key TO a[i]\nSET j TO i - 1\nWHILE j >= 0 AND a[j] > key DO\nSET a[j + 1] TO a[j]\nSET j TO j - 1\nEND WHILE\nSET a[j + 1] TO key\nEND FOR\nDISPLAY a', '[1, 2, 2, 4, 5]'],
    selectionSort: ['SET a TO [5, 1, 4, 2, 2]\nFOR i FROM 0 TO len(a) - 2 DO\nSET smallest TO i\nFOR j FROM i + 1 TO len(a) - 1 DO\nIF a[j] < a[smallest] THEN\nSET smallest TO j\nEND IF\nEND FOR\nSET temp TO a[i]\nSET a[i] TO a[smallest]\nSET a[smallest] TO temp\nEND FOR\nDISPLAY a', '[1, 2, 2, 4, 5]'],
    recursion: ['FUNCTION factorial(n)\nIF n <= 1 THEN\nRETURN 1\nEND IF\nRETURN n * factorial(n - 1)\nEND FUNCTION\nDISPLAY factorial(5)', '120']
};
for (const [name, [source, expected]] of Object.entries(algorithms)) test('algorithm execution: ' + name, () => assert.equal(run(source), expected));
// Execute every built-in exercise against the repository's reference Python.
const databaseSource = fs.readFileSync(path.join(__dirname, '../database.js'), 'utf8');
const seedStart = databaseSource.indexOf('const SEED_EXERCISES_LIST = ') + 'const SEED_EXERCISES_LIST = '.length;
const seeds = JSON.parse(databaseSource.slice(seedStart, databaseSource.indexOf('\n];', seedStart) + 2));
for (const exercise of seeds) test('built-in exercise parity: ' + exercise.id, () => {
    const result = compile(exercise.pseudocode);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.equal(python(result.python), python(exercise.python_code));
});
test('function locals do not leak into outer scope', () => {
    const result = compile('BEGIN\nFUNCTION f(n)\nRETURN n\nEND FUNCTION\nDISPLAY n\nEND');
    assert.ok(result.warnings.some(w => w.line === 5 && w.message.includes("'n'")));
});
test('reject NOT as an unparenthesized arithmetic operand', () => assert.equal(compile('BEGIN\nDISPLAY 2 + NOT 1\nEND').valid, false));
test('empty tuple assignment stays an expression', () => assert.equal(run('SET x TO ()\nDISPLAY x'), '()'));
