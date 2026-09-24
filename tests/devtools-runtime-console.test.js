const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const source = read('src/devtools/runtime-console.js');

function consoleSandbox(overrides = {}) {
    const sandbox = vm.createContext({
        console: { log() {}, warn() {}, info() {}, error() {} },
        document: {
            getElementById: () => null,
            createElement: () => ({ className: '', textContent: '', appendChild() {}, remove() {} }),
        },
        navigator: { clipboard: { writeText: async () => {} } },
        showToast() {},
        ...overrides
    });
    vm.runInContext(source, sandbox);
    return sandbox;
}

function freshModel() {
    return consoleSandbox().createRuntimeConsoleModel();
}

function singleton() {
    const sandbox = consoleSandbox();
    return { sandbox, rc: vm.runInContext('runtimeConsole', sandbox) };
}

test('beginRun starts a running session and clears the transcript', () => {
    const m = freshModel();
    assert.equal(m.state, 'idle');
    assert.equal(m.isActive(), false);
    m.append('stale', 'stdout');
    const session = m.beginRun();
    assert.equal(m.state, 'running');
    assert.equal(m.isActive(), true);
    assert.equal(m.transcript.length, 0);
    assert.equal(m.sessionId, session);
});

test('input values are returned as strings, preserving "0" and ""', async () => {
    const m = freshModel();
    m.beginRun();
    const p0 = m.requestInput('a');
    assert.equal(m.state, 'waiting-input');
    assert.equal(m.hasPendingInput, true);
    assert.equal(m.submitInput('0'), true);
    assert.equal(await p0, '0');
    assert.equal(m.state, 'running');

    const pe = m.requestInput('b');
    assert.equal(m.submitInput(''), true);
    assert.equal(await pe, '');
});

test('each pending input resolves exactly once; double submit is ignored', async () => {
    const m = freshModel();
    m.beginRun();
    const p = m.requestInput('Enter grade:');
    let resolved = 0;
    p.then(() => resolved++);
    assert.equal(m.submitInput('85'), true);
    assert.equal(m.submitInput('90'), false, 'second submit must be ignored');
    await p;
    assert.equal(resolved, 1);
});

test('a new run rejects a stale pending input', async () => {
    const m = freshModel();
    m.beginRun();
    const p = m.requestInput('old');
    let rejected = null;
    p.catch(e => { rejected = e; });
    m.beginRun();
    await p.catch(() => {});
    assert.equal(rejected, m.ABORTED);
});

test('clearOutput clears the transcript but keeps a pending input', async () => {
    const m = freshModel();
    m.beginRun();
    m.append('hello', 'stdout');
    const p = m.requestInput('x');
    m.clearOutput();
    assert.equal(m.transcript.length, 0);
    assert.equal(m.hasPendingInput, true);
    assert.equal(m.submitInput('5'), true);
    assert.equal(await p, '5');
});

test('stop rejects a pending input and marks the run stopped', async () => {
    const m = freshModel();
    m.beginRun();
    const p = m.requestInput('x');
    let rejected = null;
    p.catch(e => { rejected = e; });
    assert.equal(m.stop(), true);
    assert.equal(m.state, 'stopped');
    assert.equal(m.isActive(), false);
    await p.catch(() => {});
    assert.equal(rejected, m.ABORTED);
});

test('stop during a running program blocks further input', async () => {
    const m = freshModel();
    m.beginRun();
    assert.equal(m.stop(), true);
    assert.equal(m.state, 'stopped');
    assert.equal(m.stopRequested, true);
    const p = m.requestInput('x');
    let rejected = null;
    p.catch(e => { rejected = e; });
    await p.catch(() => {});
    assert.equal(rejected, m.ABORTED);
});

test('finish reports completed unless the run was stopped', () => {
    const m = freshModel();
    m.beginRun();
    m.finish();
    assert.equal(m.state, 'completed');

    m.beginRun();
    m.stop();
    m.finish();
    assert.equal(m.state, 'stopped');
});

test('fail records an error entry; aborted failures stop quietly', () => {
    const m = freshModel();
    m.beginRun();
    m.fail(new Error('boom'));
    assert.equal(m.state, 'error');
    assert.equal(m.transcript[m.transcript.length - 1].kind, 'error');
    assert.ok(m.transcript[m.transcript.length - 1].text.includes('boom'));

    m.beginRun();
    m.fail(m.ABORTED);
    assert.equal(m.state, 'stopped');
});

test('reset rejects pending input and returns to idle', async () => {
    const m = freshModel();
    m.beginRun();
    const p = m.requestInput('x');
    let rejected = null;
    p.catch(e => { rejected = e; });
    m.reset();
    assert.equal(m.state, 'idle');
    assert.equal(m.transcript.length, 0);
    await p.catch(() => {});
    assert.equal(rejected, m.ABORTED);
});

test('append streams stdout only while a run is active', () => {
    const m = freshModel();
    m.append('before', 'stdout');
    assert.equal(m.transcript.length, 0, 'output before a run is dropped');
    m.beginRun();
    m.append('hi', 'stdout');
    m.append('there', 'stdout');
    assert.equal(m.transcript.length, 2);
    m.finish();
    m.append('after', 'stdout');
    assert.equal(m.transcript.length, 2, 'output after completion is dropped');
});

test('beginRun invalidates the previous session pending input', async () => {
    const m = freshModel();
    const s1 = m.beginRun();
    const p1 = m.requestInput('old');
    let rejected = null;
    p1.catch(e => { rejected = e; });
    const s2 = m.beginRun();
    assert.notEqual(s2, s1);
    await p1.catch(() => {});
    assert.equal(rejected, m.ABORTED);
    const p2 = m.requestInput('new');
    assert.equal(m.submitInput('ok'), true);
    assert.equal(await p2, 'ok');
});

test('singleton exposes state, transcript text and abort', () => {
    const { rc } = singleton();
    assert.equal(rc.state, 'idle');
    assert.equal(rc.isActive(), false);
    rc.beginRun();
    assert.equal(rc.isActive(), true);
    rc.append('a', 'stdout');
    rc.append('b', 'stdout');
    assert.equal(rc.transcriptText(), 'ab');
    rc.abort();
    assert.equal(rc.state, 'stopped');
    assert.equal(rc.isActive(), false);
});

test('echo lines are included in the copied transcript', async () => {
    const { rc } = singleton();
    rc.beginRun();
    const p = rc.requestInput('Enter grade:');
    rc.submitInput('85');
    await p;
    assert.ok(rc.transcriptText().includes('Enter grade: 85'));
});

test('devToolsAbortRun stops an active run', () => {
    const sandbox = consoleSandbox();
    const rc = vm.runInContext('runtimeConsole', sandbox);
    rc.beginRun();
    sandbox.devToolsAbortRun();
    assert.equal(rc.state, 'stopped');
});