const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const model = require('../src/student/learning-model');
const guide = require('../src/student/quick-guide');
const root = path.join(__dirname, '..');
const context = vm.createContext({ console, performance });
vm.runInContext(fs.readFileSync(path.join(root, 'mapper.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'compiler.js'), 'utf8') + '\nthis.compiler = new PseudocodeCompiler();', context);

test('all guide programs and operator examples compile with the production compiler', () => {
    for (const [category, item] of Object.entries(guide.entries)) {
        const result = context.compiler.compile(item[1]);
        assert.equal(result.valid, true, category + ': ' + JSON.stringify(result.errors));
    }
    for (const [op, , expression] of guide.operators) {
        const result = context.compiler.compile('BEGIN\nDISPLAY ' + expression + '\nEND');
        assert.equal(result.valid, true, op + ': ' + JSON.stringify(result.errors));
    }
});
test('cursor insertion preserves both sides of existing work', () => {
    assert.equal(guide.insert('alpha\nomega', 6, 'DISPLAY 1'), 'alpha\nDISPLAY 1\nomega');
    assert.equal(guide.insert('', 0, 'BEGIN\nEND'), 'BEGIN\nEND\n');
});
test('contextual tips are local to the current line and recognize complete sentinels', () => {
    assert.match(guide.tip('IF grade > 75', 13), /THEN/);
    assert.equal(guide.tip('IF grade > 75 THEN', 18), '');
    assert.match(guide.tip('WHILE x > 0', 11), /DO/);
    assert.equal(guide.tip('# IF grade', 10), '');
    assert.equal(guide.tip('DISPLAY "hello"\nSET x TO 2', 26), '');
});
test('flow adapts actual tokens, AST and Python without recompiling', () => {
    const source = guide.entries.Conditions[1], result = context.compiler.compile(source);
    const flow = model.flow(source, result);
    assert.equal(flow.result, result);
    assert.ok(flow.tokens.some(t => t.value === 'IF'));
    assert.ok(flow.steps.some(s => s.type === 'IfStatement' && s.line === 4));
    assert.ok(flow.steps.some(s => s.type === 'PrintStatement' && s.depth === 1));
    assert.equal(flow.stages.find(s => s.id === 'python').status, 'Completed');
    assert.equal(flow.stages.find(s => s.id === 'execution').status, 'Ready');
    const mapping = flow.steps.find(s => s.type === 'PrintStatement');
    assert.equal(result.python.split('\n')[mapping.pythonLine - 1].trim(), mapping.python);
});
test('failed compiler result never reports generation or execution complete', () => {
    const source = 'BEGIN\nIF x > 2\nDISPLAY x\nEND';
    const flow = model.flow(source, context.compiler.compile(source));
    assert.equal(flow.stages.find(s => s.id === 'python').status, 'Not reached');
    assert.equal(flow.stages.find(s => s.id === 'execution').status, 'Not reached');
    assert.ok(flow.feedback.some(f => /THEN/.test(f.explanation)));
});
test('session metrics use measured zero timing, failed runs and actual counts', () => {
    const a = { valid: true, errors: 0, timing: 0 }, b = { valid: false, errors: 2, timing: 10 };
    assert.deepEqual(model.kpis([], []), { translations: 0, success: 0, runtime: 0, average: 0, errors: 0, executions: 0 });
    assert.deepEqual(model.kpis([a, b], [{ success: true }, { success: false }]), { translations: 2, success: 50, runtime: 50, average: 5, errors: 2, executions: 2 });
});
test('trajectory refresh is pure, cumulative rates are measured, mastery stays unknown', () => {
    const records = [{ compilation: 0 }, { compilation: 100 }, { compilation: 100 }];
    assert.deepEqual(model.trajectory(records).map(p => p.cumulative), [0, 50, 200 / 3]);
    assert.equal(model.trajectory(records).length, 3);
    assert.equal(model.trajectory(records).length, 3);
    assert.equal(records[0].cumulative, undefined);
    assert.equal(model.scores({}, true, ['selection']).mastery, null);
    assert.equal(model.scores({ error: 20 }, false, []).validation, 0);
});
test('history excludes other students, seeded evidence and invalid timestamps', () => {
    const sample = { studentId: 's1', valid: true, timestamp: '2026-01-01T00:00:00Z', tallies: {} };
    const data = model.history([{ ...sample, _docId: 'real' }, { ...sample, studentId: 's2' }, { ...sample, seededFrom: 'activity:x' }, { ...sample, _docId: 'ev_seed_x' }, { ...sample, timestamp: 'invalid' }], 's1');
    assert.equal(data.length, 1);
    assert.equal(data[0].id, 'real');
});

function workspaceHarness() {
    const sandbox = vm.createContext({ console, StudentLearningModel: model, StudentGuide: guide,
        currentUser: { role: 'student', id: 's1' }, document: { querySelectorAll: () => [], getElementById: () => null } });
    vm.runInContext(fs.readFileSync(path.join(root, 'src/student/workspace.js'), 'utf8') + '\nthis.workspace = StudentWorkspace;', sandbox);
    return sandbox;
}
test('workspace records each translation once and rejects duplicate run completion', () => {
    const s = workspaceHarness(); s.workspace.activate('write-pseudocode');
    const source = guide.entries.Basics[1], result = context.compiler.compile(source);
    s.workspace.translated('pseudocode-editor', source, result, null);
    s.workspace.activate('translate');
    assert.equal(s.workspace.sessionMetrics().translations, 1);
    const run = s.workspace.beginRun('console-output', result.python);
    s.workspace.endRun(run, false, 'Runtime error');
    s.workspace.endRun(run, false, 'Duplicate callback');
    assert.equal(s.workspace.sessionMetrics().executions, 1);
    assert.equal(s.workspace.sessionMetrics().runtime, 100);
    assert.equal(s.workspace.sessionMetrics().translations, 1);
});
test('logout and account changes isolate session data and pending runtime callbacks', () => {
    const s = workspaceHarness(); s.workspace.activate('write-pseudocode');
    const old = s.workspace.beginRun('console-output', 'print(1)');
    s.workspace.reset(); s.workspace.activate('write-pseudocode');
    s.workspace.endRun(old, true, '1');
    assert.equal(s.workspace.sessionMetrics().executions, 0);
    const run = s.workspace.beginRun('console-output', 'print(1)');
    s.currentUser = { role: 'student', id: 's2' }; s.workspace.activate('write-pseudocode');
    s.workspace.endRun(run, true, '1');
    assert.equal(s.workspace.sessionMetrics().executions, 0);
    s.currentUser = { role: 'admin', id: 'admin' }; s.workspace.activate('developer-options');
    assert.equal(s.workspace.beginRun('admin-console', 'print(1)'), null);
});
