/* ============================================================
   RUNTIME CONSOLE
   In-app input/output surface for the DevTools Skulpt runner.
   Replaces the native prompt() dialog with a Promise-based
   input row and streams real program stdout as it is produced.
   ============================================================ */

const DevConsoleAborted = Object.freeze({ aborted: true });

/**
 * Upper bound on rendered console rows. A runaway program can emit output far
 * faster than the DOM can absorb it; keeping every row is what turned a big
 * print loop into a multi-second freeze. Older rows are dropped from the top
 * and the drop is announced, so nothing silently disappears mid-run.
 */
const DEV_CONSOLE_MAX_ROWS = 2000;

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

// Maps a transcript entry kind onto the console row CSS class. Every entry is
// rendered as its own block row so prompts, the typed values that answer them,
// program output and runtime errors never run together on one visual line.
function _consoleRowClass(kind) {
    if (kind === 'echo') return 'devtools-console-echo';
    if (kind === 'question') return 'devtools-console-question';
    if (kind === 'stderr' || kind === 'error') return 'devtools-console-error';
    return 'devtools-console-stdout';
}

// Reads a numeric grade from the REAL program output only. A line is treated
// as a grade when it is the final output line and is either a bare number or a
// "Grade: <number>" style label. Formatting the value to two decimals happens
// at display time and never mutates the transcript, so program output stays
// byte-for-byte real.
function _derivedGradeSummary(transcript) {
    const lines = [];
    for (const entry of transcript) {
        if (entry.kind !== 'stdout') continue;
        for (const line of String(entry.text).split('\n')) {
            const trimmed = line.trim();
            if (trimmed) lines.push(trimmed);
        }
    }
    if (lines.length === 0) return null;
    const last = lines[lines.length - 1];
    const prefixed = /^GRADE\s*[:=]\s*(-?\d+(?:\.\d+)?)\s*$/i.exec(last);
    if (prefixed) return { value: Number(prefixed[1]), source: last };
    const bare = /^-?\d+(?:\.\d+)?$/.test(last) ? Number(last) : NaN;
    if (Number.isFinite(bare)) return { value: bare, source: last };
    return null;
}

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
        get pendingPrompt() { return pending ? pending.promptText : ''; },

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
            const question = String(promptText == null ? '' : promptText);
            const questionText = question.trim() ? question : 'Input required:';
            const entry = { kind: 'question', text: questionText };
            transcript.push(entry);
            if (this.onAppend) this.onAppend(entry);
            return new Promise(function (resolve, reject) {
                pending = { resolve: resolve, reject: reject, promptText: questionText };
            });
        },

        submitInput(value) {
            if (!pending || submitted) return false;
            submitted = true;
            const p = settlePending();
            const text = String(value === null || value === undefined ? '' : value);
            const entry = { kind: 'echo', text: text };
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

    // ── Batched renderer ──────────────────────────────────────
    // Program output arrives one entry at a time. Rendering each entry
    // synchronously meant a createElement + appendChild + a forced layout read
    // (scrollHeight/scrollTop/clientHeight) PER LINE, so a few thousand lines
    // of output meant a few thousand reflows on the UI thread. Entries are
    // queued here and flushed once per animation frame into a single
    // DocumentFragment, with a single layout read at the end.
    let pendingEntries = [];
    let frameHandle = null;
    let droppedRows = 0;

    function el(id) { return document.getElementById(id); }

    function _requestFrame() {
        if (frameHandle !== null) return;
        if (typeof requestAnimationFrame === 'function') {
            frameHandle = requestAnimationFrame(function () {
                frameHandle = null;
                flushOutput();
            });
        } else if (typeof setTimeout === 'function') {
            // No rAF (tests / reduced environments): fall back to a macrotask
            // so batching still happens, just without frame alignment.
            frameHandle = setTimeout(function () {
                frameHandle = null;
                flushOutput();
            }, 0);
        } else {
            // Neither scheduler is available. Correctness beats batching: render
            // now rather than dropping output or throwing.
            flushOutput();
        }
    }

    function _makeRow(entry) {
        const row = document.createElement('div');
        row.className = 'devtools-console-row ' + _consoleRowClass(entry.kind);
        const text = document.createElement('span');
        text.className = 'devtools-console-row-text';
        text.textContent = entry.text;
        row.appendChild(text);
        return row;
    }

    // Trim the container to DEV_CONSOLE_MAX_ROWS from the top, skipping the
    // grade footer and the truncation notice. Returns how many rows went.
    function _removeOldestRows(container, excess) {
        let removed = 0;
        while (removed < excess && container.firstElementChild) {
            const first = container.firstElementChild;
            if (first.classList.contains('devtools-console-row-grade')) break;
            if (first.classList.contains('devtools-console-row-truncated')) break;
            container.removeChild(first);
            removed++;
        }
        return removed;
    }

    function _updateTruncationNotice(container) {
        let notice = container.querySelector('.devtools-console-row-truncated');
        if (droppedRows <= 0) {
            if (notice) notice.remove();
            return;
        }
        if (!notice) {
            notice = document.createElement('div');
            notice.className = 'devtools-console-row devtools-console-row-truncated';
            // firstElementChild, not firstChild: a stray text node would
            // otherwise push the notice to the end, where it reads as the last
            // line of output instead of a header. A null ref appends, which is
            // correct for an empty container.
            container.insertBefore(notice, container.firstElementChild);
        }
        notice.textContent = '... ' + droppedRows.toLocaleString() +
            ' earlier output ' + (droppedRows === 1 ? 'line was' : 'lines were') +
            ' trimmed to keep the console responsive.';
    }

    function flushOutput() {
        const container = el('devtools-console-output');
        if (!container) {
            pendingEntries = [];
            return;
        }
        if (pendingEntries.length === 0 && droppedRows === 0) return;

        const entries = pendingEntries;
        pendingEntries = [];

        const ph = container.querySelector('.devtools-console-empty');
        if (ph) ph.remove();

        if (entries.length > 0) {
            const fragment = document.createDocumentFragment();
            for (let i = 0; i < entries.length; i++) fragment.appendChild(_makeRow(entries[i]));
            container.appendChild(fragment);
        }

        // A single layout read for the whole batch instead of one per line.
        // The notice occupies a row too, so reserve it headroom on the batch
        // that first trips the cap, otherwise the DOM ends up one row over.
        const noticeExists = !!container.querySelector('.devtools-console-row-truncated');
        let effectiveCap = DEV_CONSOLE_MAX_ROWS;
        if (!noticeExists && container.childElementCount > DEV_CONSOLE_MAX_ROWS) {
            effectiveCap = DEV_CONSOLE_MAX_ROWS - 1;
        }
        const excess = container.childElementCount - effectiveCap;
        if (excess > 0) {
            droppedRows += _removeOldestRows(container, excess);
        }
        if (droppedRows > 0 || noticeExists) _updateTruncationNotice(container);
        autoScroll(container);
    }

    function _removeOldestRows(container, excess) {
        let removed = 0;
        while (removed < excess && container.firstElementChild) {
            const first = container.firstElementChild;
            if (first.classList.contains('devtools-console-row-grade')) break;
            if (first.classList.contains('devtools-console-row-truncated')) break;
            container.removeChild(first);
            removed++;
        }
        return removed;
    }

    function _cancelFrame() {
        if (frameHandle === null) return;
        if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameHandle);
        else if (typeof clearTimeout === 'function') clearTimeout(frameHandle);
        frameHandle = null;
    }

    function _flushNow() {
        _cancelFrame();
        flushOutput();
    }

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
        const promptLabel = el('devtools-console-prompt');
        if (promptLabel) promptLabel.textContent = (model.state === 'waiting-input') ? model.pendingPrompt : '';
        if (model.state === 'waiting-input') {
            const inputField = el('devtools-console-input');
            if (inputField) inputField.focus();
        }
        _renderGradeSummary();
    }

    // Aligned "Grade Summary" footer shown only for a completed run whose real
    // stdout ends in a numeric grade. The stored transcript value is never
    // altered; only the displayed number is formatted to two decimals.
    function _renderGradeSummary() {
        // The footer must land AFTER the real output, so any batched rows still
        // queued have to land first.
        _flushNow();
        const container = el('devtools-console-output');
        if (!container) return;
        let row = container.querySelector('.devtools-console-row-grade');
        const summary = model.state === 'completed' ? _derivedGradeSummary(model.transcript) : null;
        if (!summary) {
            if (row) row.remove();
            return;
        }
        if (!row) {
            row = document.createElement('div');
            row.className = 'devtools-console-row devtools-console-row-grade';
            const label = document.createElement('span');
            label.className = 'devtools-console-grade-label';
            row.appendChild(label);
            container.appendChild(row);
            autoScroll(container);
        }
        const label = row.querySelector('.devtools-console-grade-label');
        if (label) label.textContent = 'Grade Summary: ' + summary.value.toFixed(2);
    }

    function wipeOutput() {
        // Drop any batched rows still queued for the PREVIOUS run; flushing them
        // now would splice stale output into a freshly started run.
        _cancelFrame();
        pendingEntries = [];
        droppedRows = 0;
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
        pendingEntries.push(entry);
        _requestFrame();
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
        get pendingPrompt() { return model.pendingPrompt; },
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
        gradeSummary() { return _derivedGradeSummary(model.transcript); },
        transcriptText() {
            return model.transcript.map(function (e) { return e.text; }).join('');
        },
        // Force the batched rows out now instead of waiting for the next
        // frame. Used by the test suite and before reading the DOM.
        flush() { _flushNow(); },
        get pendingRenderCount() { return pendingEntries.length; },
        get droppedRowCount() { return droppedRows; },
        get maxRows() { return DEV_CONSOLE_MAX_ROWS; },
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