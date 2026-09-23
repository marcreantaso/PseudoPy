/* ============================================================
   PSEUDOPY — DEVELOPER OPTIONS: FILE UPLOAD & PYTHON EXPORT
   ------------------------------------------------------------
   Upload pseudocode from a local file (.txt/.pseudo/.psc or
   text/plain) into the Source editor, and export the generated
   Python as a downloadable .py file. The derived filename mirrors
   the uploaded source name (grade_calculator.pseudo ->
   grade_calculator.py).
   ============================================================ */

const DEVTOOLS_MAX_UPLOAD_BYTES = 1 * 1024 * 1024;
const DEVTOOLS_ALLOWED_EXT = ['.txt', '.pseudo', '.psc'];
const DEVTOOLS_PYTHON_NAME = 'pseudopy_generated.py';

// ── Pure helpers (unit-testable) ──────────────────────────────

function devToolsValidateImport(file) {
    const name = String(((file && file.name) || '')).toLowerCase();
    const type = String(((file && file.type) || '')).toLowerCase();
    const size = Number(file && file.size) || 0;
    let ext = '';
    if (name.includes('.')) ext = '.' + name.split('.').pop();
    const allowedExt = DEVTOOLS_ALLOWED_EXT.includes(ext);
    const typeOk = !type || type === 'text/plain' || type.indexOf('text/') === 0;
    if (!allowedExt && !typeOk) return { ok: false, error: 'type' };
    if (size > DEVTOOLS_MAX_UPLOAD_BYTES) return { ok: false, error: 'too-large' };
    if (size === 0) return { ok: false, error: 'empty' };
    return { ok: true };
}

function devToolsDerivePythonFilename(name) {
    const base = String(name || '');
    if (!base) return DEVTOOLS_PYTHON_NAME;
    const lower = base.toLowerCase();
    let ext = '';
    if (lower.includes('.')) ext = '.' + lower.split('.').pop();
    if (DEVTOOLS_ALLOWED_EXT.includes(ext)) return base.slice(0, base.length - ext.length) + '.py';
    if (ext === '.py') return base;
    return base + '.py';
}

function devToolsStripGutter(text) {
    return String(text || '')
        .split('\n')
        .map(line => String(line).replace(/^\s*\d+\s*│\s*/, ''))
        .join('\n');
}

function devToolsBuildPythonBlob(code) {
    return new Blob([String(code == null ? '' : code)], { type: 'text/x-python;charset=utf-8' });
}

// ── Filename derivation ───────────────────────────────────────

function devToolsPythonFilename() {
    if (typeof devToolsState !== 'undefined' && devToolsState.importedSourceName) {
        return devToolsDerivePythonFilename(devToolsState.importedSourceName);
    }
    return DEVTOOLS_PYTHON_NAME;
}

// ── Reading the uploaded file ─────────────────────────────────

async function devToolsReadSourceFile(file) {
    if (typeof file.text === 'function') return file.text();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('File read failed'));
        reader.readAsText(file);
    });
}

/**
 * Import a selected pseudocode file into the Source editor. Validates type and
 * size, confirms before overwriting existing typing, writes the file contents,
 * and never auto-runs the pipeline. Returns true on success so drop handlers
 * can toast accordingly.
 */
async function devToolsOnSourceFileSelected(file) {
    if (!file) return false;
    const check = devToolsValidateImport(file);
    if (!check.ok) {
        if (check.error === 'too-large') {
            if (typeof showToast === 'function') showToast('File is too large. Maximum size is 1 MB.', 'error');
        } else {
            if (typeof showToast === 'function') showToast('Unsupported file type. Use .txt, .pseudo, or .psc.', 'error');
        }
        return false;
    }
    let text = '';
    try {
        text = await devToolsReadSourceFile(file);
    } catch (e) {
        console.warn('[DevTools] File read failed:', e);
        if (typeof showToast === 'function') showToast('Could not read the file. Try another file.', 'error');
        return false;
    }
    const editor = document.getElementById('devtools-pseudocode');
    if (!editor) return false;
    if (editor.value.trim() && typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm('Uploading this file will replace the current pseudocode. Continue?')) {
        return false;
    }
    editor.value = text;
    if (typeof devToolsState !== 'undefined') devToolsState.importedSourceName = file.name;
    if (typeof showToast === 'function') showToast('Uploaded ' + file.name, 'success');
    return true;
}

function devToolsPickFile() {
    const input = document.getElementById('devtools-file-input');
    if (!input) return;
    input.value = '';
    input.click();
}

function devToolsClearSource() {
    const editor = document.getElementById('devtools-pseudocode');
    if (!editor) return;
    editor.value = '';
    if (typeof devToolsState !== 'undefined') devToolsState.importedSourceName = null;
    if (typeof devToolsSyncPythonExportButton === 'function') devToolsSyncPythonExportButton();
    editor.focus();
    if (typeof showToast === 'function') showToast('Cleared pseudocode.', 'info');
}

// ── Clean Python access (no gutter noise) ─────────────────────

function devToolsCurrentPython() {
    if (typeof devToolsState !== 'undefined' && devToolsState.currentResult) {
        const r = devToolsState.currentResult;
        return r.valid && r.python ? r.python : '';
    }
    const el = document.getElementById('devtools-python-output');
    if (!el) return '';
    const text = el.textContent || '';
    if (!text || text === 'Waiting for compilation...' || text === '# No output' || text.indexOf('# Compilation failed') === 0) return '';
    return devToolsStripGutter(text);
}

// ── Export ────────────────────────────────────────────────────

function devToolsTriggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function devToolsDownloadPython() {
    const code = devToolsCurrentPython();
    if (!code.trim()) {
        if (typeof showToast === 'function') showToast('Nothing to download yet. Run the pipeline first.', 'error');
        return;
    }
    try {
        const filename = devToolsPythonFilename();
        devToolsTriggerDownload(devToolsBuildPythonBlob(code), filename);
        if (typeof showToast === 'function') showToast('Downloaded ' + filename, 'success');
    } catch (e) {
        console.warn('[DevTools] Export failed:', e);
        if (typeof showToast === 'function') showToast('Unable to export Python file.', 'error');
    }
}

function devToolsSyncPythonExportButton() {
    const btn = document.getElementById('devtools-download-btn');
    if (!btn) return;
    btn.disabled = !devToolsCurrentPython().trim();
}

// ── Drag & drop + file input wiring ───────────────────────────

function devToolsInitFileDrop() {
    const wrap = document.querySelector('.devtools-source-wrap');
    const input = document.getElementById('devtools-file-input');
    if (!wrap || !input) return;
    let dragDepth = 0;
    const onDragEnter = e => {
        if (!e.dataTransfer || !Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files')) return;
        e.preventDefault();
        dragDepth++;
        wrap.classList.add('dragging');
    };
    const onDragOver = e => {
        if (!e.dataTransfer) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    };
    const onDragLeave = e => {
        e.preventDefault();
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) wrap.classList.remove('dragging');
    };
    const onDrop = e => {
        e.preventDefault();
        dragDepth = 0;
        wrap.classList.remove('dragging');
        const files = e.dataTransfer && e.dataTransfer.files;
        const file = files && files[0];
        if (file && devToolsValidateImport(file).ok) devToolsOnSourceFileSelected(file);
        else if (file && typeof showToast === 'function') showToast('Unsupported file type. Use .txt, .pseudo, or .psc.', 'error');
    };
    wrap.addEventListener('dragenter', onDragEnter);
    wrap.addEventListener('dragover', onDragOver);
    wrap.addEventListener('dragleave', onDragLeave);
    wrap.addEventListener('drop', onDrop);
    input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (file) devToolsOnSourceFileSelected(file);
    });
}