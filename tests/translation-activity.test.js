const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const aggregation = require('../src/analytics/aggregation');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function harness(save) {
    const writes = [], toasts = [];
    const context = vm.createContext({
        console: { log() {}, warn() {}, error() {} }, performance,
        currentUser: { id: 'student', role: 'student', fullName: 'Student', studentNumber: '2300001', instructorId: 'teacher' },
        exerciseState: { activeExercise: null }, cloudUid: () => 'auth-student',
        activityRef: 'pseudopy_activity', showToast: (...args) => toasts.push(args),
        dbSet: async (ref, id, record) => { writes.push({ ref, id, record }); if (save) await save(); },
        ...aggregation
    });
    vm.runInContext(read('mapper.js') + '\n' + read('compiler.js') + '\nglobalThis.engine = new PseudocodeCompiler();', context);
    vm.runInContext(read('src/app/translation-activity.js'), context);
    return { context, writes, toasts };
}

const broken = 'BEGIN\nSET grade1 = 0\nSET grade2 = 0\nSET average =\nPRINT average\nEND';

test('line-4 failure in free practice reaches error distribution without submission', async () => {
    const h = harness();
    const result = h.context.engine.compile(broken);
    await h.context.recordStudentTranslation(broken, result, 'pseudocode-editor');
    assert.equal(h.writes.length, 1);
    const { record, ref, id } = h.writes[0];
    assert.equal(ref, 'pseudopy_activity');
    assert.equal(record.id, id);
    assert.equal(record.uid, 'auth-student');
    assert.equal(record.instructorId, 'teacher');
    assert.equal(record.studentNumber, '2300001');
    assert.equal(record.exerciseId, null);
    assert.equal(record.exercise, 'Free practice');
    assert.equal(record.type, 'translate_attempt');
    assert.equal(record.status, 'compile_error');
    assert.equal(record.errors[0].line, 4);
    assert.equal(record.errors[0].errorType, 'Syntax Error');
    assert.match(record.output, /Line 4: Expected an expression/);
    assert.equal(aggregation.buildErrorDistribution([record]).total, 1);
});

test('successful translation remains ungraded and does not count as a submission or error', async () => {
    const h = harness();
    h.context.exerciseState.activeExercise = { id: 'average', title: 'Average', instructorId: 'owner' };
    const source = broken.replace('SET average =', 'SET average = 0');
    await h.context.recordStudentTranslation(source, h.context.engine.compile(source), 'pseudocode-editor');
    const record = h.writes[0].record;
    assert.equal(record.exerciseId, 'average');
    assert.equal(record.instructorId, 'owner');
    assert.equal(record.status, 'ungraded');
    assert.equal(record.score, null);
    assert.equal(aggregation.isSubmissionActivity(record), false);
    assert.equal(aggregation.buildErrorDistribution([record]).total, 0);
});

test('double clicks share one durable activity ID; changed source creates another attempt', async () => {
    const h = harness();
    const result = h.context.engine.compile(broken);
    await Promise.all([h.context.recordStudentTranslation(broken, result, 'pseudocode-editor'),
        h.context.recordStudentTranslation(broken, result, 'pseudocode-editor')]);
    assert.equal(h.writes.length, 1);
    await h.context.recordStudentTranslation(broken + '\n', result, 'pseudocode-editor');
    assert.equal(h.writes.length, 2);
    assert.notEqual(h.writes[0].id, h.writes[1].id);
    vm.runInContext('lastTranslationActivity.time -= 801', h.context);
    await h.context.recordStudentTranslation(broken + '\n', result, 'pseudocode-editor');
    assert.equal(h.writes.length, 3, 'a deliberate later retry counts as a new attempt');
});

test('queued cloud failure preserves record and informs student without rejecting translation', async () => {
    const h = harness(() => { throw Object.assign(new Error('offline'), { localOnly: true }); });
    const record = await h.context.recordStudentTranslation(broken, h.context.engine.compile(broken), 'pseudocode-editor');
    assert.equal(record.id, h.writes[0].id);
    assert.match(h.toasts[0][0], /saved on this device/);
});

test('instructor tools and unsigned sessions do not log student attempts', async () => {
    const h = harness();
    const result = h.context.engine.compile(broken);
    await h.context.recordStudentTranslation(broken, result, 'instructor-pseudo-input');
    h.context.currentUser.role = 'instructor';
    await h.context.recordStudentTranslation(broken, result, 'pseudocode-editor');
    h.context.currentUser = null;
    await h.context.recordStudentTranslation(broken, result, 'pseudocode-editor');
    assert.equal(h.writes.length, 0);
});

test('error aggregation dedupes attempts, excludes seeds, counts every diagnostic and supports legacy errors', () => {
    const record = { id: 'real', errors: [
        { line: 4, message: 'Expected an expression.' },
        { code: 'SEM_UNDECLARED_VARIABLE', message: 'Unknown variable' },
        { type: 'Type Error', message: 'Cannot add these values' },
        { severity: 'warning', message: 'Unused variable' }
    ], errorType: 'Syntax Error' };
    const dist = aggregation.buildErrorDistribution([record, record,
        { id: 'act_sp_3', errorType: 'Syntax Error' },
        { id: 'demo', isDemo: true, errorType: 'Type Error' },
        { id: 'legacy', errorType: 'Missing END' }]);
    assert.equal(dist.total, 4);
    assert.deepEqual(dist.categories.map(c => c.name).sort(), ['Syntax Error', 'Type Error', 'Undefined Variable', 'Missing Terminator'].sort());
});

test('missing END is classified from actual compiler diagnostics', async () => {
    const h = harness();
    const source = 'BEGIN\nPRINT 1';
    await h.context.recordStudentTranslation(source, h.context.engine.compile(source), 'translate-input');
    assert.equal(h.writes[0].record.errors[0].errorType, 'Missing Terminator');
    assert.equal(aggregation.classifyActivityError({ message: 'Unexpected code after END.' }), 'Syntax Error');
});

test('Translate UI calls the recorder on failure before returning', () => {
    const h = harness();
    const calls = [];
    const elements = {
        'pseudocode-editor': { value: broken }, 'console-output': {}, 'python-output': {}
    };
    Object.assign(h.context, {
        document: { readyState: 'loading', addEventListener() {} },
        $id: id => elements[id], $qs: () => ({}),
        PseudoPyLearning: null, setPythonOutput() {}, renderHtmlErrors: () => 'errors',
        updateGutter() {}, pseudocodeToPython: source => h.context.engine.compile(source),
        recordStudentTranslation: (...args) => { calls.push(args); return Promise.resolve(); }
    });
    vm.runInContext(read('src/app/translation.js'), h.context);
    h.context.translatePseudocode();
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], broken);
    assert.equal(calls[0][1].errors[0].line, 4);
    assert.equal(calls[0][2], 'pseudocode-editor');
});
