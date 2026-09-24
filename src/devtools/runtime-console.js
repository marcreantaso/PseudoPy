/* ============================================================
   RUNTIME CONSOLE
   In-app input/output surface for the DevTools Skulpt runner.
   Replaces the native prompt() dialog with a Promise-based
   input row and streams real program stdout as it is produced.
   ============================================================ */

const DevConsoleAborted = Object.freeze({ aborted: true });

const DEV_CONSOLE_STATE_LABELS = {
    idle: 'Idle',
    running: 'Running',
    'waiting-input': 'Waiting for Input',
    completed: 'Completed',
    stopped: 'Stopped',
    error: 'Error'
};

const DEV_CONSOLE_RUNTIME_LABELS = {
    idle: 'Not executed',
    running: 'Running...',
    'waiting-input': 'Waiting for input...',
    completed: '{{ui:CircleCheck}} Success',
    stopped: 'Stopped',
    error: '{{ui:CircleX}} Error'
};

// Pure state machine, no DOM. The DOM binding (createRuntimeConsole)
// renders transcript entries through the onAppend hook.
function createRuntimeConsoleModel() {
    let state = 'idle';
    let sessionId = 0;
    let stopRequested = false;
    let pending = null;
    let submitted = false;
    const transcript = [];

    function settlePending() {
        const p = pending;
        pending = null;
        submitted = false;
        return p;
    }

    function rejectPending(reason) {
        const p = settlePending();
        if (p) p.reject(reason);
    }

    return {
        ABORTED: DevConsoleAborted,
        onAppend: null,

        get state() { return state; },
        get sessionId() { return sessionId; },
        get stopRequested() { return stopRequested; },
        get transcript() { return transcript; },
        get hasPendingInput() { return pending !== null; },

        isActive() { return state === 'running' || state === 'waiting-input'; },

        beginRun() {
            sessionId++;
            stopRequested = false;
            submitted = false;
            rejectPending(DevConsoleAborted);
            transcript.length = 0;
            state = 'running';
            return sessionId;
        },

        append(text, kind) {
            if (state !== 'running' && state !== 'waiting-input') return;
            const entry = { kind: kind || 'stdout', text: String(text) };
            transcript.push(entry);
            if (this.onAppend) this.onAppend(entry);
        },

        requestInput(promptText) {
            if (state !== 'running' || stopRequested) {
                return Promise.reject(DevConsoleAborted);
            }
            state = 'waiting-input';
            submitted = false;
            return new Promise(function (resolve, reject) {
                pending = { resolve: resolve, reject: reject, promptText: String(promptText || '') };
            });
        },

        submitInput(value) {
            if (!pending || submitted) return false;
            submitted = true;
            const p = settlePending();
            const text = String(value === null || value === undefined ? '' : value);
            const entry = { kind: 'echo', text: (p.promptText ? p.promptText + ' ' : '') + text };
            transcript.push(entry);
            state = 'running';
            p.resolve(text);
            if (this.onAppend) this.onAppend(entry);
            return true;
        },

        cancelInput() {
            if (!pending) return false;
            rejectPending(DevConsoleAborted);
            return true;
        },

        stop() {
            if (state === 'idle') return false;
            stopRequested = true;
            rejectPending(DevConsoleAborted);
            if (state === 'running' || state === 'waiting-input') state = 'stopped';
            return true;
        },

        abort() {
            stopRequested = true;
            rejectPending(DevConsoleAborted);
            if (state === 'running' || state === 'waiting-input') state = 'stopped';
        },

        finish() {
            if (state === 'idle') return;
            state = stopRequested ? 'stopped' : 'completed';
        },

        fail(err) {
            if (state === 'idle') return;
            if (err === DevConsoleAborted) {
                state = 'stopped';
                return;
            }
            state = 'error';
            const entry = { kind: 'error', text: String(err && err.toString ? err.toString() : err) };
            transcript.push(entry);
            if (this.onAppend) this.onAppend(entry);
        },

        clearOutput() {
            transcript.length = 0;
        },

        reset() {
            stopRequested = true;
            rejectPending(DevConsoleAborted);
            transcript.length = 0;
            state = 'idle';
            sessionId++;
        }
    };
}

function createRuntimeConsole() {
    const model = createRuntimeConsoleModel();
    let wired = false;

    function el(id) { return document.getElementById(id); }

    function setStateUI() {
        const stateEl = el('devtools-console-state');
        if (stateEl) {
            stateEl.textContent = DEV_CONSOLE_STATE_LABELS[model.state];
            stateEl.setAttribute('data-state', model.state);
        }
        const statusEl = el('devtools-runtime-status');
        if (statusEl) statusEl.textContent = DEV_CONSOLE_RUNTIME_LABELS[model.state];
        const stopBtn = el('devtools-console-stop');
        if (stopBtn) stopBtn.disabled = !model.isActive();
        const runBtn = el('devtools-run-btn');
        if (runBtn) runBtn.disabled = model.isActive();
        const copyBtn = el('devtools-console-copy');
        if (copyBtn) copyBtn.disabled = model.transcript.length === 0;
        const inputRow = el('devtools-console-input-row');
        if (inputRow) inputRow.classList.toggle('hidden', model.state !== 'waiting-input');
        if (model.state === 'waiting-input') {
            const inputField = el('devtools-console-input');
            if (inputField) inputField.focus();
        }
    }

    function wipeOutput() {
        const container = el('devtools-console-output');
        if (!container) return;
        container.replaceChildren();
        const ph = document.createElement('span');
        ph.className = 'devtools-console-empty';
        ph.textContent = 'Awaiting run…';
        container.appendChild(ph);
    }

    function autoScroll(container) {
        if (container.scrollHeight - container.scrollTop - container.clientHeight < 24) {
            container.scrollTop = container.scrollHeight;
        }
    }

    function renderAppend(entry) {
        const container = el('devtools-console-output');
        if (!container) return;
        const ph = container.querySelector('.devtools-console-empty');
        if (ph) ph.remove();
        const span = document.createElement('span');
        span.className = 'devtools-console-' + entry.kind;
        span.textContent = entry.text;
        container.appendChild(span);
        autoScroll(container);
    }

    function wire() {
        if (wired) return;
        wired = true;
        const submitBtn = el('devtools-console-submit');
        if (submitBtn) submitBtn.addEventListener('click', runtimeConsoleSubmit);
        const inputField = el('devtools-console-input');
        if (inputField) {
            inputField.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); runtimeConsoleSubmit(); }
            });
        }
    }

    const runtimeConsole = {
        ABORTED: DevConsoleAborted,
        get state() { return model.state; },
        get sessionId() { return model.sessionId; },
        get stopRequested() { return model.stopRequested; },
        get transcript() { return model.transcript; },
        isActive() { return model.isActive(); },

        beginRun() { model.beginRun(); wipeOutput(); setStateUI(); },
        append(text, kind) { model.append(text, kind); },
        requestInput(promptText) { const p = model.requestInput(promptText); setStateUI(); return p; },
        submitInput(value) { const ok = model.submitInput(value); if (ok) setStateUI(); return ok; },
        stop() { const ok = model.stop(); if (ok) setStateUI(); return ok; },
        abort() { model.abort(); setStateUI(); },
        finish() { model.finish(); setStateUI(); },
        fail(err) { model.fail(err); setStateUI(); },
        clearOutput() { model.clearOutput(); wipeOutput(); setStateUI(); },
        reset() { model.reset(); wipeOutput(); setStateUI(); },
        transcriptText() {
            return model.transcript.map(function (e) { return e.text; }).join('');
        },
        wire: wire
    };

    model.onAppend = renderAppend;
    wire();
    setStateUI();
    return runtimeConsole;
}

const runtimeConsole = createRuntimeConsole();

function runtimeConsoleSubmit() {
    const inputField = document.getElementById('devtools-console-input');
    const value = inputField ? inputField.value : '';
    if (runtimeConsole.submitInput(value) && inputField) {
        inputField.value = '';
    }
}

function runtimeConsoleStop() {
    if (runtimeConsole.stop() && typeof showToast === 'function') {
        showToast('Execution stopped.', 'info');
    }
}

function runtimeConsoleCopy() {
    const text = runtimeConsole.transcriptText();
    if (!text.trim()) {
        if (typeof showToast === 'function') showToast('Nothing to copy yet. Run the pipeline first.', 'error');
        return;
    }
    navigator.clipboard.writeText(text).then(function () {
        if (typeof showToast === 'function') showToast('Console output copied!', 'success');
    });
}

function runtimeConsoleClear() {
    runtimeConsole.clearOutput();
    if (typeof showToast === 'function') showToast('Console output cleared.', 'info');
}

function devToolsAbortRun() {
    if (typeof runtimeConsole !== 'undefined') runtimeConsole.abort();
}