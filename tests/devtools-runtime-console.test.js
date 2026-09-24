const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src/devtools/runtime-console.js'), 'utf8');

function loadConsole(documentStub) {
    const sandbox = vm.createContext({
        console: { log() {}, warn() {}, info() {}, error() {} },
        document: documentStub || { getElementById: () => null, createElement: () => ({ className: '', textContent: '' }) },
        navigator: {}
    });
    vm.runInContext(src + '\nthis.modelFactory = createRuntimeConsoleModel;\nthis.consoleFactory = createRuntimeConsole;\nthis.aborted = DevConsoleAborted;\nthis.rowClass = _consoleRowClass;\nthis.gradeSummary = _derivedGradeSummary;', sandbox);
    return sandbox;
}

test('a single INPUT question is visible in the transcript before any value is typed', async () => {
    const sandbox = loadConsole();
    const model = sandbox.modelFactory();
    model.beginRun();
    const p = model.requestInput('Please enter age: ');
    assert.equal(model.state, 'waiting-input');
    assert.equal(model.hasPendingInput, true);
    assert.equal(model.pendingPrompt, 'Please enter age: ');
    const questions = model.transcript.filter(e => e.kind === 'question');
    assert.equal(questions.length, 1, 'question must appear before submit');
    assert.equal(questions[0].text, 'Please enter age: ');
    model.submitInput('42');
    assert.equal(model.state, 'running');
    assert.equal(model.hasPendingInput, false);
    assert.equal(await p, '42', 'the pending runtime promise resolves with the submitted value');
    const echos = model.transcript.filter(e => e.kind === 'echo');
    assert.equal(echos.length, 1);
    assert.equal(echos[0].text, '42', 'echo shows only the typed value, not a duplicated question');
});

test('a blank prompt falls back to the generic input request label', async () => {
    const sandbox = loadConsole();
    const model = sandbox.modelFactory();
    model.beginRun();
    const p = model.requestInput('');
    const questions = model.transcript.filter(e => e.kind === 'question');
    assert.equal(questions[0].text, 'Input required:');
    model.reset();
    await assert.rejects(p, err => err === sandbox.aborted);
    const model2 = sandbox.modelFactory();
    model2.beginRun();
    const p2 = model2.requestInput('   ');
    assert.equal(model2.pendingPrompt, 'Input required:');
    model2.reset();
    await assert.rejects(p2, err => err === sandbox.aborted);
});

test('multiple consecutive INPUT statements each show their question in order', async () => {
    const sandbox = loadConsole();
    const model = sandbox.modelFactory();
    model.beginRun();
    const a = model.requestInput('First value: ');
    model.submitInput('1');
    const b = model.requestInput('Second value: ');
    model.submitInput('2');
    assert.equal(await a, '1');
    assert.equal(await b, '2');
    const questions = [...model.transcript.filter(e => e.kind === 'question').map(e => e.text)];
    assert.deepEqual(questions, ['First value: ', 'Second value: '], 'questions arrive in statement order');
});

test('an empty submission is a valid empty value and resolves the promise', async () => {
    const sandbox = loadConsole();
    const model = sandbox.modelFactory();
    model.beginRun();
    const p = model.requestInput('Anything: ');
    assert.equal(model.submitInput(''), true);
    assert.equal(await p, '');
    assert.equal(model.state, 'running');
});

test('requestInput outside a running session rejects with the aborted marker immediately', async () => {
    const sandbox = loadConsole();
    const model = sandbox.modelFactory();
    const p = model.requestInput('Now?');
    await assert.rejects(p, err => err === sandbox.aborted);
});

test('Stop removes the pending input request and stops the run', async () => {
    const sandbox = loadConsole();
    const model = sandbox.modelFactory();
    model.beginRun();
    const p = model.requestInput('Q: ');
    assert.equal(model.stop(), true);
    assert.equal(model.state, 'stopped');
    assert.equal(model.hasPendingInput, false);
    await assert.rejects(p, err => err === sandbox.aborted);
});

test('Reset removes the pending input request, clears the transcript and returns to idle', async () => {
    const sandbox = loadConsole();
    const model = sandbox.modelFactory();
    model.beginRun();
    const p = model.requestInput('Q: ');
    model.reset();
    assert.equal(model.state, 'idle');
    assert.equal(model.hasPendingInput, false);
    assert.equal(model.transcript.length, 0);
    await assert.rejects(p, err => err === sandbox.aborted);
});

test('starting a new run rejects any input request left pending by a previous run', async () => {
    const sandbox = loadConsole();
    const model = sandbox.modelFactory();
    model.beginRun();
    const p = model.requestInput('Q: ');
    model.beginRun();
    assert.equal(model.state, 'running');
    assert.equal(model.hasPendingInput, false);
    assert.equal(model.transcript.length, 0);
    await assert.rejects(p, err => err === sandbox.aborted);
});

test('finish reports Completed after a successful run, Stopped after a stop', () => {
    const sandbox = loadConsole();
    const model = sandbox.modelFactory();
    model.beginRun();
    model.finish();
    assert.equal(model.state, 'completed');
    const model2 = sandbox.modelFactory();
    model2.beginRun();
    model2.stop();
    model2.finish();
    assert.equal(model2.state, 'stopped');
});

test('runtime errors remain visible in the console transcript', () => {
    const sandbox = loadConsole();
    const model = sandbox.modelFactory();
    model.beginRun();
    model.fail(new Error('boom: index out of range'));
    assert.equal(model.state, 'error');
    const errors = model.transcript.filter(e => e.kind === 'error');
    assert.equal(errors.length, 1);
    assert.match(errors[0].text, /boom: index out of range/);
    const model2 = sandbox.modelFactory();
    model2.beginRun();
    model2.fail(sandbox.aborted);
    assert.equal(model2.state, 'stopped');
    assert.equal(model2.transcript.filter(e => e.kind === 'error').length, 0, 'a user abort adds no error entry');
});

function makeEl() {
    return {
        textContent: '', value: '', disabled: false, className: '', hidden: false,
        classList: { toggles: [], toggle(cls, force) { this.toggles.push({ cls, force }); } },
        setAttribute() {}, focus() { this.focusCount = (this.focusCount || 0) + 1; },
        addEventListener() {}, appendChild(node) { (this.appended = this.appended || []).push(node); },
        replaceChildren() { this.appended = []; }, querySelector() { return null; },
        scrollHeight: 0, scrollTop: 0, clientHeight: 0
    };
}

test('the DOM binding renders the question, shows and focuses the input row, and hides it on submit', async () => {
    const els = {};
    for (const id of ['devtools-console-state', 'devtools-runtime-status', 'devtools-console-stop',
        'devtools-run-btn', 'devtools-console-copy', 'devtools-console-input-row',
        'devtools-console-prompt', 'devtools-console-input', 'devtools-console-submit', 'devtools-console-output']) {
        els[id] = makeEl();
    }
    const doc = {
        getElementById: id => els[id] || null,
        createElement: () => makeEl()
    };
    const sandbox = loadConsole(doc);
    const rc = sandbox.consoleFactory();

    rc.beginRun();
    const p = rc.requestInput('Name: ');

    assert.equal(els['devtools-console-prompt'].textContent, 'Name: ', 'the label shows the question while waiting');
    assert.equal(els['devtools-console-state'].textContent, 'Waiting for Input');
    const shownToggle = els['devtools-console-input-row'].classList.toggles.filter(t => t.cls === 'hidden').pop();
    assert.equal(shownToggle.force, false, 'input row is revealed while waiting');
    assert.ok(els['devtools-console-input'].focusCount > 0, 'input field is focused while waiting');
    const questionRows = (els['devtools-console-output'].appended || []).filter(n => n.className === 'devtools-console-row devtools-console-question');
    assert.equal(questionRows.length, 1, 'the question renders as its own block row');
    assert.equal(questionRows[0].appended[0].textContent, 'Name: ', 'the row text carries the question label');

    rc.submitInput('Ada');
    assert.equal(await p, 'Ada');
    const hideToggle = els['devtools-console-input-row'].classList.toggles.filter(t => t.cls === 'hidden').pop();
    assert.equal(hideToggle.force, true, 'input row is hidden after submit');
    assert.equal(els['devtools-console-prompt'].textContent, '', 'label is cleared after submit');
    assert.equal(els['devtools-console-state'].textContent, 'Running');

    rc.finish();
    assert.equal(els['devtools-console-state'].textContent, 'Completed');
    const echoRows = (els['devtools-console-output'].appended || []).filter(n => n.className === 'devtools-console-row devtools-console-echo');
    assert.equal(echoRows.pop().appended[0].textContent, 'Ada', 'the submitted value renders as its own echo row');
});

// ── Part A: output & grade alignment (own rows per prompt/value, display-only
//    two-decimal grade summary that never mutates the real transcript) ──

test('append rows map each transcript kind onto its own row class', () => {
    const sandbox = loadConsole();
    assert.equal(sandbox.rowClass('stdout'), 'devtools-console-stdout');
    assert.equal(sandbox.rowClass('question'), 'devtools-console-question');
    assert.equal(sandbox.rowClass('echo'), 'devtools-console-echo');
    assert.equal(sandbox.rowClass('error'), 'devtools-console-error');
    assert.equal(sandbox.rowClass('stderr'), 'devtools-console-error');
    assert.equal(sandbox.rowClass('unknown'), 'devtools-console-stdout');
});

test('grade summary reads a numeric grade from the final real stdout line', () => {
    const sandbox = loadConsole();
    const summary = sandbox.gradeSummary;
    assert.deepEqual(
        { ...summary([{ kind: 'stdout', text: 'Welcome\nGrade: 68.4\n' }]) },
        { value: 68.4, source: 'Grade: 68.4' },
        'a labeled grade line is detected'
    );
    assert.deepEqual(
        { ...summary([{ kind: 'stdout', text: 'Previous line\n85\n' }]) },
        { value: 85, source: '85' },
        'a bare numeric final output line is detected'
    );
    assert.equal(summary([{ kind: 'stdout', text: 'Your grade is 70\n' }]), null, 'a non-final non-numeric line is not a grade');
    assert.deepEqual(
        { ...summary([{ kind: 'stdout', text: '70\n75\n' }]) },
        { value: 75, source: '75' },
        'the last numeric output line wins (old values above it are ignored)'
    );
    assert.equal(summary([{ kind: 'echo', text: '68.4' }, { kind: 'question', text: 'Grade?' }]), null, 'non-stdout entries are never graded');
    assert.equal(summary([]), null, 'no output yields no grade summary');
});

test('grade formatting is two-decimal and display-only (transcript stays raw)', () => {
    const sandbox = loadConsole();
    const model = sandbox.modelFactory();
    model.beginRun();
    model.append('68.4\n', 'stdout');
    model.finish();
    assert.equal(model.transcript.length, 1);
    assert.equal(model.transcript[0].kind, 'stdout');
    assert.equal(model.transcript[0].text, '68.4\n', 'the stored value is never rewritten');
    const grade = { ...sandbox.gradeSummary(model.transcript) };
    assert.equal(grade.value, 68.4);
    assert.equal(grade.value.toFixed(2), '68.40', 'the displayed summary formats to two decimals only');
});