const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const source = read('src/devtools/file-io.js');

function fileIOSandbox(overrides = {}) {
    const toasts = [];
    const download = { filename: null };
    const sandbox = vm.createContext({
        console: { log() {}, warn() {}, info() {}, error() {} },
        Blob: typeof Blob !== 'undefined' ? Blob : undefined,
        URL: { createObjectURL: () => 'blob:mock', revokeObjectURL() {} },
        showToast(message, type) { toasts.push({ message, type }); },
        devToolsState: { currentResult: null, importedSourceName: null },
        document: {
            getElementById: id => ({
                'devtools-python-output': { textContent: 'Waiting for compilation...' },
                'devtools-download-btn': { disabled: null },
                'devtools-pseudocode': { value: '', focus() {} },
                'devtools-file-input': {},
                'devtools-drop-hint': {},
                'devtools-source-wrap': {}
            })[id] || null,
            createElement: () => ({ href: '', download: '', click() {}, remove() {}, appendChild() {}, removeChild() {} }),
            body: { appendChild() {}, removeChild() {} },
            querySelector: () => null,
        },
        window: { confirm: () => true },
        ...overrides
    });
    vm.runInContext(source, sandbox);
    return { sandbox, toasts, download };
}

test('import validation checks extension, size and empty content', () => {
    const { sandbox } = fileIOSandbox();
    assert.deepEqual(sandbox.devToolsValidateImport({ name: 'solve.pseudo', size: 10, type: 'text/plain' }), { ok: true });
    assert.deepEqual(sandbox.devToolsValidateImport({ name: 'notes.txt', size: 10, type: '' }), { ok: true });
    assert.deepEqual(sandbox.devToolsValidateImport({ name: 'prog.psc', size: 10, type: 'application/octet-stream' }), { ok: true });
    assert.equal(sandbox.devToolsValidateImport({ name: 'image.png', size: 10, type: 'image/png' }).error, 'type');
    assert.equal(sandbox.devToolsValidateImport({ name: 'big.pseudo', size: 1024 * 1024 + 1, type: 'text/plain' }).error, 'too-large');
    assert.equal(sandbox.devToolsValidateImport({ name: 'empty.txt', size: 0, type: 'text/plain' }).error, 'empty');
});

test('export filename is derived from the uploaded source name', () => {
    const { sandbox } = fileIOSandbox();
    assert.equal(sandbox.devToolsDerivePythonFilename('grade_calculator.pseudo'), 'grade_calculator.py');
    assert.equal(sandbox.devToolsDerivePythonFilename('notes.txt'), 'notes.py');
    assert.equal(sandbox.devToolsDerivePythonFilename('script.py'), 'script.py');
    assert.equal(sandbox.devToolsDerivePythonFilename(''), 'pseudopy_generated.py');
    assert.equal(sandbox.devToolsDerivePythonFilename('prog'), 'prog.py');
});

test('gutter line numbers are stripped from the display before download', () => {
    const { sandbox } = fileIOSandbox();
    assert.equal(sandbox.devToolsStripGutter('  1 │ print("hi")\n  2 │ x = 1'), 'print("hi")\nx = 1');
    assert.equal(sandbox.devToolsStripGutter('print("hi")'), 'print("hi")');
});

test('clean Python prefers the current result and never exports placeholder text', () => {
    const { sandbox } = fileIOSandbox();
    sandbox.devToolsState.currentResult = { valid: true, python: 'print(1)' };
    assert.equal(sandbox.devToolsCurrentPython(), 'print(1)');
    sandbox.devToolsState.currentResult = { valid: false, errors: [{ line: 3, message: 'x' }], python: '' };
    assert.equal(sandbox.devToolsCurrentPython(), '');
    sandbox.devToolsState.currentResult = null;
    sandbox.document.getElementById = id => ({ 'devtools-python-output': { textContent: 'Waiting for compilation...' } })[id] || null;
    assert.equal(sandbox.devToolsCurrentPython(), '');
    sandbox.document.getElementById = id => ({ 'devtools-python-output': { textContent: '  1 │ print(1)' } })[id] || null;
    assert.equal(sandbox.devToolsCurrentPython(), 'print(1)');
});

test('download button is enabled only when generated Python exists', () => {
    const { sandbox } = fileIOSandbox();
    const btn = { disabled: null };
    sandbox.document.getElementById = id => ({ 'devtools-download-btn': btn, 'devtools-python-output': { textContent: 'Waiting for compilation...' } })[id] || null;
    sandbox.devToolsSyncPythonExportButton();
    assert.equal(btn.disabled, true);
    sandbox.document.getElementById = id => ({ 'devtools-download-btn': btn, 'devtools-python-output': { textContent: '  1 │ print(1)' } })[id] || null;
    sandbox.devToolsSyncPythonExportButton();
    assert.equal(btn.disabled, false);
});

test('a selected file loads into the source editor, confirms overwrites, and never auto-runs', async () => {
    let downloads = 0;
    const file = { name: 'grade_calculator.pseudo', size: 60, type: 'text/plain', text: async () => 'BEGIN\n    DISPLAY "Hi"\nEND' };
    const editor = { value: '', focus() {} };
    const { sandbox } = fileIOSandbox({
        devToolsState: { currentResult: null, importedSourceName: null },
        document: { getElementById: id => ({ 'devtools-pseudocode': editor })[id] || null }
    });
    const ok = await sandbox.devToolsOnSourceFileSelected(file);
    assert.equal(ok, true);
    assert.equal(editor.value, 'BEGIN\n    DISPLAY "Hi"\nEND');
    assert.equal(sandbox.devToolsState.importedSourceName, 'grade_calculator.pseudo');
    assert.equal(sandbox.devToolsState.currentResult, null, 'upload must not auto-run the pipeline');
    assert.equal(downloads, 0);

    editor.value = 'BEGIN\nEND';
    sandbox.window.confirm = () => false;
    assert.equal(await sandbox.devToolsOnSourceFileSelected(file), false, 'declined overwrite');
    assert.equal(editor.value, 'BEGIN\nEND', 'declined overwrite still replaced the editor');
    sandbox.window.confirm = () => true;
    assert.equal(await sandbox.devToolsOnSourceFileSelected(file), true);
    assert.equal(editor.value, 'BEGIN\n    DISPLAY "Hi"\nEND');
});

test('oversized and unsupported files toast a clear error and never load', async () => {
    const big = { name: 'big.pseudo', size: 1024 * 1024 + 1, type: 'text/plain', text: async () => 'x' };
    const bad = { name: 'image.png', size: 10, type: 'image/png', text: async () => 'x' };
    const editor = { value: '' };
    const { sandbox, toasts } = fileIOSandbox({
        document: { getElementById: id => ({ 'devtools-pseudocode': editor })[id] || null }
    });
    assert.equal(await sandbox.devToolsOnSourceFileSelected(big), false);
    assert.equal(editor.value, '');
    assert.equal(toasts.some(t => /1 MB/.test(t.message)), true);
    assert.equal(await sandbox.devToolsOnSourceFileSelected(bad), false);
    assert.equal(editor.value, '');
    assert.equal(toasts.some(t => /Unsupported file type/.test(t.message)), true);
});

test('blob builds as UTF-8 Python text and download revokes the object URL', async () => {
    const revoked = { value: 0 };
    const { sandbox } = fileIOSandbox({
        URL: { createObjectURL: () => 'blob:mock', revokeObjectURL() { revoked.value++; } },
        document: { getElementById: () => null, createElement: () => ({ href: '', download: '', click() {}, remove() {} }), body: { appendChild() {}, removeChild() {} } }
    });
    const blob = sandbox.devToolsBuildPythonBlob('print(1)');
    assert.equal(blob.type, 'text/x-python;charset=utf-8');
    assert.ok(blob.size > 0);
    sandbox.devToolsTriggerDownload(blob, 'solve.py');
    assert.equal(revoked.value, 1, 'object URL was not revoked after download');

    sandbox.devToolsState.currentResult = { valid: true, python: 'print(1)' };
    sandbox.devToolsState.importedSourceName = 'solve.pseudo';
    sandbox.document = { getElementById: id => ({ 'devtools-download-btn': {}, 'devtools-python-output': { textContent: '  1 │ print(1)' } })[id] || null };
    const named = sandbox.devToolsPythonFilename();
    assert.equal(named, 'solve.py', 'export did not derive the .py name from the source');
});