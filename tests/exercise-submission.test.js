const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const aggregation = require('../src/analytics/aggregation');

// ── Markup and stylesheet guarantees ──────────────────────────────────

test('Submit is rendered unconditionally, outside the editor panels', () => {
    const index = read('index.html');
    const bar = index.slice(index.indexOf('id="exercise-action-bar"'));
    assert.notEqual(bar.indexOf('id="btn-submit-exercise"'), -1, 'Submit lives in the action bar');
    // The bar must follow the closing editor layout, so no overflow:hidden panel
    // can ever clip it.
    assert.ok(index.indexOf('id="btn-submit-exercise"') > index.indexOf('class="editor-panel"'));
    assert.doesNotMatch(bar.slice(0, 600), /class="[^"]*\bhidden\b/, 'Submit is never pre-hidden');
    assert.match(index, /type="button"[^>]{0,200}id="btn-submit-exercise"/);
    assert.match(index, /data-action="submit"/, 'a delegated fallback entry exists for small screens');
    assert.match(index, /id="btn-submit-exercise-reason"|id="exercise-submit-reason"/);
});

test('the action bar is sticky or fixed with safe-area padding and 44px targets', () => {
    const style = read('style.css');
    const block = style.slice(style.indexOf('.exercise-action-bar {'));
    assert.match(block, /position:\s*sticky/);
    assert.match(block, /padding-bottom:\s*calc\(12px \+ env\(safe-area-inset-bottom/);
    assert.match(block, /min-height:\s*44px/);
    assert.match(block, /touch-action:\s*manipulation/);
    assert.match(block, /z-index:\s*30/);
    assert.match(block, /focus-visible/, 'keyboard focus stays visible');
    assert.doesNotMatch(block, /pointer-events:\s*none/);
});

test('mobile editors are bounded and the fixed bar has matching scroll padding', () => {
    const style = read('style.css');
    const mobile = style.slice(style.indexOf('@media (max-width: 1023px) {'));
    assert.match(mobile, /#page-write-pseudocode \{[\s\S]*padding-bottom: calc\(/);
    assert.match(mobile, /max-height: 50dvh/);
    assert.match(mobile, /min-height: 200px/);
    assert.match(mobile, /position: fixed/);
    // Keyboard inset keeps the bar above the on-screen keyboard.
    assert.match(style, /bottom: var\(--exercise-keyboard-inset/);
});

test('visualViewport tracking drives the keyboard inset variable', () => {
    const source = read('src/app/exercise-submission.js');
    assert.match(source, /window\.visualViewport/);
    assert.match(source, /--exercise-keyboard-inset/);
    assert.match(source, /'resize', updateViewport/, 'a resize fallback exists');
});

test('service worker cache version and precache are consistent', () => {
    const sw = read('sw.js');
    assert.match(sw, /pseudopy-shell-20261001-v\d+/);
    assert.match(sw, /pseudopy-vendor-20261001-v\d+/);
    const shell = sw.match(/const CACHE_NAME = '([^']+)'/)[1];
    const vendor = sw.match(/const VENDOR_CACHE_NAME = '([^']+)'/)[1];
    assert.equal(shell.split('-').pop(), vendor.split('-').pop(), 'both caches share one generation');
    assert.match(sw, /firebase-auth-compat\.js/, 'the auth SDK is precached like the other Firebase SDKs');
});

// ── Behaviour ─────────────────────────────────────────────────────────

function harness(options = {}) {
    const writes = [], toasts = [], confirmations = [];
    const editor = { value: '', readOnly: false };
    const elements = {
        'pseudocode-editor': editor,
        'console-output': { textContent: '' },
        'btn-submit-exercise': makeButton('btn-submit-exercise', 'Submit Exercise'),
        'exercise-submit-fallback': makeButton('exercise-submit-fallback', 'Submit answer'),
        'btn-submit-exercise-label': makeText(),
        'exercise-submit-state': makeText(),
        'exercise-submit-reason': makeText(),
        'active-ex-status': makeText(),
        'btn-translate-pseudocode': makeButton(),
        'btn-run-code': makeButton(),
        'python-output': { value: '', readOnly: false }
    };
    const context = vm.createContext({
        console: { log() {}, warn() {}, error() {} },
        performance: { now: () => 1 },
        crypto: { randomUUID: () => 'fixed-uuid-' + writes.length },
        localStorage: memoryStorage(),
        currentUser: { _docId: 'stu1', id: 'stu1', role: 'student', fullName: 'Ana', studentId: '2300001', studentNumber: '2300001', instructorId: 'teach1', section: 'BSCS-3A' },
        exerciseState: { isTranslated: false, isExecuted: false, outputMatched: false, expectedOutput: '', expectedOutputResolved: true, activeExercise: null, resubmissionOf: null },
        activityRef: 'pseudopy_activity',
        showToast: (...args) => toasts.push(args),
        confirm: message => { confirmations.push(message); return options.confirm !== false; },
        dbSet: async (ref, id, record) => {
            writes.push({ ref, id, record });
            if (options.save) await options.save({ ref, id, record });
        },
        dbGetAll: async () => options.activity || [],
        $id: id => elements[id] || null,
        getValue: id => (elements[id] ? elements[id].value : ''),
        getPythonCode: () => elements['python-output'].value,
        setText: (id, value) => { if (elements[id]) elements[id].textContent = value; },
        compilerEngine: { compile: source => context.__compile(source) },
        classifyActivityError: aggregation.classifyActivityError,
        loadStudentProgress: async () => {},
        Event: class { constructor(type) { this.type = type; } },
        window: { addEventListener() {}, dispatchEvent() {} },
        document: {
            readyState: 'loading',
            addEventListener() {},
            querySelectorAll: () => [],
            documentElement: { style: { setProperty() {} } }
        },
        updateExerciseStatus() { context.renderExerciseSubmissionState(); },
        showExerciseProgressWarning() {}
    });
    vm.runInContext(read('mapper.js') + '\n' + read('compiler.js') + '\nglobalThis.realEngine = new PseudocodeCompiler();', context);
    context.__compile = source => context.realEngine.compile(source);
    vm.runInContext(read('src/app/exercise-submission.js'), context);
    return { context, writes, toasts, confirmations, editor, elements };
}

function makeButton(id, label) {
    const button = {
        id: id || '', classList: makeClassList(), disabled: false, textContent: label || '',
        attributes: {}, addEventListener() {}, contains: () => true, getBoundingClientRect: () => ({ height: 48 })
    };
    button.setAttribute = (key, value) => { button.attributes[key] = value; };
    return button;
}
function makeText() { return { textContent: '' }; }
function makeClassList() {
    const set = new Set();
    return { add: (...n) => n.forEach(x => set.add(x)), remove: (...n) => n.forEach(x => set.delete(x)), contains: n => set.has(n), toggle: n => set.has(n) ? (set.delete(n), false) : (set.add(n), true) };
}
function memoryStorage() {
    const map = new Map();
    return {
        getItem: key => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => map.set(key, String(value)),
        removeItem: key => map.delete(key)
    };
}

const exercise = { _docId: 'ex1', id: 'ex1', title: 'Average', instructorId: 'teach1', difficulty: 'easy' };
const valid = 'BEGIN\nDECLARE total AS INTEGER\nSET total TO 3\nDISPLAY total\nEND';
const broken = 'BEGIN\nSET average =\nEND';

function open(h, ex = exercise) {
    h.context.exerciseState.activeExercise = ex;
    h.editor.value = valid;
    h.context.renderExerciseSubmissionState();
}

test('Submit is enabled before translating, running or matching output', () => {
    const h = harness();
    open(h);
    const button = h.elements['btn-submit-exercise'];
    assert.equal(button.disabled, false, 'Submit is available with no prior translate or run');
    assert.equal(button.classList.contains('hidden'), false);
    assert.match(h.elements['exercise-submit-reason'].textContent, /at any time|even if it has errors/);
});

test('Submit stays enabled after an edit and after a compile error', () => {
    const h = harness();
    open(h);
    h.context.exerciseState.isTranslated = false;
    h.context.exerciseState.isExecuted = false;
    h.context.renderExerciseSubmissionState();
    assert.equal(h.elements['btn-submit-exercise'].disabled, false);
    h.editor.value = broken;
    h.context.renderExerciseSubmissionState();
    assert.equal(h.elements['btn-submit-exercise'].disabled, false);
});

test('an empty answer reports a reason without blocking the button', async () => {
    const h = harness();
    open(h);
    h.editor.value = '   ';
    await h.context.saveExerciseSubmission();
    assert.equal(h.writes.length, 0);
    assert.match(h.toasts[0][0], /Write your answer first/);
    assert.equal(h.elements['btn-submit-exercise'].disabled, false);
});

test('a broken program can still be submitted and is not graded as complete', async () => {
    const h = harness();
    open(h);
    h.editor.value = broken;
    await h.context.saveExerciseSubmission();
    assert.equal(h.writes.length, 1, 'compile errors never block submission');
    const { record } = h.writes[0];
    assert.equal(record.status, 'compile_error');
    assert.equal(record.score, null);
    assert.equal(record.compileSuccess, false);
    assert.ok(record.errors.length > 0);
    assert.equal(record.errors[0].line, 2);
    assert.match(h.confirmations[0], /1 error \(line 2\)\. Submit anyway\?/);
});

test('a clean answer grades as completed only when the run matched', async () => {
    const h = harness();
    open(h);
    h.elements['python-output'].value = 'total = 3\nprint(total)';
    await h.context.saveExerciseSubmission();
    let record = h.writes[0].record;
    assert.equal(record.status, 'In Progress', 'translated but never run');
    assert.equal(record.score, null);
    assert.equal(record.compileSuccess, true);

    const h2 = harness();
    open(h2);
    h2.elements['python-output'].value = h2.context.realEngine.compile(valid).python;
    h2.context.exerciseState.isTranslated = true;
    h2.context.exerciseState.isExecuted = true;
    h2.context.exerciseState.outputMatched = true;
    h2.elements['console-output'].textContent = '3\n';
    await h2.context.saveExerciseSubmission();
    record = h2.writes[0].record;
    assert.equal(record.status, 'Completed');
    assert.equal(record.score, '100%');
    assert.equal(record.output, '3\n');
});

test('a stale translation cannot be graded from an edited editor', async () => {
    const h = harness();
    open(h);
    h.elements['python-output'].value = 'total = 3\nprint(total)';
    h.context.exerciseState.isTranslated = true;
    h.context.exerciseState.isExecuted = true;
    h.context.exerciseState.outputMatched = true;
    h.editor.value = valid.replace('DISPLAY total', 'SET total TO 9\nDISPLAY total');
    await h.context.saveExerciseSubmission();
    assert.equal(h.writes[0].record.status, 'In Progress', 'the shown Python no longer matches the answer');
    assert.equal(h.writes[0].record.score, null);
});

test('double tap creates exactly one submission record', async () => {
    const h = harness();
    open(h);
    await Promise.all([h.context.saveExerciseSubmission(), h.context.saveExerciseSubmission(), h.context.saveExerciseSubmission()]);
    assert.equal(h.writes.length, 1, 'in-flight submissions are ignored');
    assert.equal(h.confirmations.length, 1);
    const button = h.elements['btn-submit-exercise'];
    assert.equal(button.disabled, false, 'the button is released after saving');
    assert.equal(button.attributes['aria-busy'], 'false');
});

test('a retry after a locally queued save reuses the same document id', async () => {
    const h = harness({ save: () => { throw Object.assign(new Error('offline'), { localOnly: true, code: 'unavailable' }); } });
    open(h);
    await h.context.saveExerciseSubmission();
    assert.match(h.toasts[0][0], /saved on this device/i);
    assert.match(h.elements['exercise-submit-reason'].textContent, /sync/i);
    await h.context.saveExerciseSubmission();
    assert.equal(h.writes.length, 2);
    assert.equal(h.writes[0].id, h.writes[1].id, 'a retry updates the original attempt');
    assert.equal(h.writes[1].record.attemptNumber, 1, 're-syncing a queued attempt is not a new attempt');
});

test('a resubmission of the same answer is refused until the code changes', async () => {
    const h = harness();
    open(h);
    await h.context.saveExerciseSubmission();
    await h.context.saveExerciseSubmission();
    assert.equal(h.writes.length, 1);
    assert.match(h.toasts[1][0], /already submitted/i);
    h.editor.value = valid + '\nSET total TO 4';
    await h.context.saveExerciseSubmission();
    assert.equal(h.writes.length, 2);
    assert.equal(h.writes[1].record.revisionOf, h.writes[0].id);
});

test('permission-denied is reported specifically and keeps the draft', async () => {
    const h = harness({ save: () => { throw Object.assign(new Error('denied'), { localOnly: true, code: 'permission-denied' }); } });
    open(h);
    await h.context.saveExerciseSubmission();
    assert.match(h.toasts[0][0], /Firebase denied cloud submission/i);
    assert.equal(h.editor.value, valid, 'the answer is preserved');
    assert.equal(h.elements['btn-submit-exercise'].disabled, false);
});

test('locked and past-due exercises disable Submit with a visible reason', async () => {
    const h = harness();
    open(h, { ...exercise, locked: true });
    assert.equal(h.elements['btn-submit-exercise'].disabled, true);
    assert.match(h.elements['exercise-submit-reason'].textContent, /locked/i);

    const h2 = harness();
    open(h2, { ...exercise, dueDate: '2020-01-01T00:00:00.000Z' });
    assert.equal(h2.elements['btn-submit-exercise'].disabled, true);
    assert.match(h2.elements['exercise-submit-reason'].textContent, /Deadline passed/);
});

test('an unauthenticated or unloaded view explains itself instead of hiding', () => {
    const h = harness();
    h.context.currentUser = null;
    open(h);
    assert.match(h.elements['exercise-submit-reason'].textContent, /Sign in/i);
    assert.equal(h.elements['btn-submit-exercise'].disabled, true);
    const h2 = harness();
    open(h2);
    h2.context.exerciseState.activeExercise = null;
    h2.context.exerciseState.submissionLoading = true;
    vm.runInContext('exerciseSubmissionLoading = true', h2.context);
    h2.context.renderExerciseSubmissionState();
    assert.match(h2.elements['exercise-submit-reason'].textContent, /Loading exercise/i);
    assert.equal(h2.elements['btn-submit-exercise'].disabled, true);
});

test('a submission completing after the exercise changed cannot write into the new one', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const h = harness({ save: () => gate });
    open(h);
    const pending = h.context.saveExerciseSubmission();
    h.context.exerciseState.activeExercise = { ...exercise, _docId: 'ex2' };
    release();
    await pending;
    assert.equal(h.elements['exercise-submit-reason'].textContent.includes('Open an exercise'), false);
    const receipt = vm.runInContext('exerciseSubmissionReceipt', h.context);
    assert.equal(receipt.record.exerciseId, 'ex1', 'the record keeps its original exercise');
});

test('the completion badge no longer removes the reopen path', () => {
    const source = read('src/app/exercises.js');
    assert.doesNotMatch(source, /ex-completed-badge/);
    assert.match(source, /View submission/);
});

test('the in-flow fallback is a backstop, not a duplicate control', () => {
    const style = read('style.css');
    const source = read('src/app/exercise-submission.js');
    assert.match(style, /\.exercise-submit-fallback \{ display: none; \}/);
    assert.match(style, /\.exercise-submit-fallback\.exercise-fallback-active \{ display: flex/);
    assert.doesNotMatch(style, /@media \(max-width: 639px\) \{[^}]*exercise-submit-fallback \{ display: flex/, 'phones must not show two Submit buttons');
    assert.match(source, /exercise-fallback-active/, 'the fallback is revealed by measured bar visibility');
});

test('Run is targeted by id, not by a shared success-button class', () => {
    const source = read('src/app/translation.js');
    assert.match(source, /'#btn-run-code'/);
    assert.doesNotMatch(source, /\.btn-success/, 'a shared class must never select the submit control');
});