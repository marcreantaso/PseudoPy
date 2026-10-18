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
/* ============================================================
   PSEUDOPY — DEVELOPER OPTIONS (devtools.js)
   ────────────────────────────────────────────────────────────
   Admin-only Compiler Debugger & Algorithm Flow Visualizer.
   Reads REAL compiler events via CompilerTrace — never
   duplicates compiler logic or fabricates data.
   ============================================================ */

console.log('[DevTools] devtools.js loaded');

// ── State ──────────────────────────────────────────────────
const devToolsState = {
    initialized: false,
    attempts: [],          // full attempt history
    currentResult: null,   // latest compile result
    runtimeResult: null,   // latest runtime result
    stepIndex: -1,         // for step-through mode
    stepEvents: [],        // cached events for stepping
    simulationEvents: [],  // normalized simulation-tracer events (Simulation tab)
    simulationTrace: null, // raw simulation-trace envelope (source map + limits)
    simulationStepIndex: -1, // step cursor for the Simulation tab event ledger
    walkSteps: [],         // ordered CFG → AST → SDT steps for the walkthrough tab
    walkStepIndex: -1,     // step cursor for the CFG → AST → SDT tab
    allErrors: [],         // classified errors across all stages
    importedSourceName: null, // uploaded pseudocode filename (for .py export)
    expectedOutput: null,  // admin-supplied expected stdout for the Simulation verdict
};

// ══════════════════════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════════════════════

function initDevTools() {
    if (devToolsState.initialized) return;
    devToolsState.initialized = true;
    console.log('[DevTools] Initialized');
    // Refresh icons for the new page
    if (typeof refreshIcons === 'function') refreshIcons(document.getElementById('page-developer-options'));
    else if (window.lucide) lucide.createIcons();
    // Wire file upload / drag & drop and the export button state.
    if (typeof devToolsInitFileDrop === 'function') devToolsInitFileDrop();
    if (typeof devToolsSyncPythonExportButton === 'function') devToolsSyncPythonExportButton();
    // Give the tab strip its ARIA tablist semantics and keyboard support.
    if (typeof devToolsInitTabs === 'function') devToolsInitTabs();
}

// ══════════════════════════════════════════════════════════════
// TAB SWITCHING
// ══════════════════════════════════════════════════════════════

function devToolsSwitchTab(tabId, options) {
    const shouldFocus = !!(options && options.focus);
    const tabs = document.querySelectorAll('#devtools-tab-bar .devtools-tab');
    tabs.forEach(t => {
        const active = t.getAttribute('data-tab') === tabId;
        t.classList.toggle('active', active);
        // A CSS class alone is invisible to assistive tech: keep the ARIA
        // selected state and the roving tabindex in step with the panel.
        t.setAttribute('aria-selected', String(active));
        t.tabIndex = active ? 0 : -1;
        if (active && shouldFocus && typeof t.focus === 'function') t.focus();
    });
    document.querySelectorAll('.devtools-tab-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById('devtools-panel-' + tabId);
    if (panel) panel.classList.add('active');
}

/**
 * Turn the static tab buttons into a real ARIA tablist. Ids and
 * aria-controls/aria-labelledby are derived from data-tab so the markup only
 * has to declare the tab once, and arrow/Home/End keys move between tabs
 * (selection follows focus) for keyboard users.
 */
function devToolsInitTabs() {
    const bar = document.getElementById('devtools-tab-bar');
    if (!bar || bar.dataset.dtTabsBound === 'true') return;
    bar.dataset.dtTabsBound = 'true';

    const tabs = Array.from(bar.querySelectorAll('.devtools-tab'));
    tabs.forEach(tab => {
        const id = tab.getAttribute('data-tab');
        if (!id) return;
        tab.id = 'devtools-tab-' + id;
        tab.setAttribute('aria-controls', 'devtools-panel-' + id);
        const panel = document.getElementById('devtools-panel-' + id);
        if (panel) {
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-labelledby', tab.id);
            if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '0');
        }
    });

    bar.addEventListener('keydown', event => {
        const current = tabs.indexOf(document.activeElement);
        if (current === -1) return;
        let next = -1;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % tabs.length;
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + tabs.length) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        if (next === -1) return;
        event.preventDefault();
        devToolsSwitchTab(tabs[next].getAttribute('data-tab'), { focus: true });
    });

    // The tab marked active in the HTML owns the single tab stop.
    const active = bar.querySelector('.devtools-tab.active') || tabs[0];
    if (active) devToolsSwitchTab(active.getAttribute('data-tab'));
}

// ══════════════════════════════════════════════════════════════
// PIPELINE EXECUTION — RUNS THE REAL COMPILER
// ══════════════════════════════════════════════════════════════

function devToolsRunPipeline() {
    if (typeof runtimeConsole !== 'undefined' && runtimeConsole.isActive()) {
        if (typeof showToast === 'function') showToast('A run is already in progress. Stop it or wait for it to finish.', 'error');
        return;
    }
    const pseudocode = document.getElementById('devtools-pseudocode').value;
    if (!pseudocode.trim()) {
        if (typeof showToast === 'function') showToast('Please enter pseudocode first.', 'error');
        return;
    }

    // Enable tracing
    compilerTrace.reset();
    compilerTrace.enable();

    // Reset pipeline visualization
    _resetPipelineVis();

    // ── Run the REAL compiler ──
    // The simulation tracer must be armed before compile(): Compiler.beginSimulationTrace
    // is a no-op unless it is already enabled, and finishSimulationTrace finalizes it.
    // Student-facing compiles never enable it, so tracing stays opt-in.
    let result;
    const tracerArmed = typeof simulationTracer !== 'undefined';
    if (tracerArmed) simulationTracer.enable();
    try {
        result = compilerEngine.compile(pseudocode);
    } finally {
        if (tracerArmed) simulationTracer.disable();
    }

    // Disable tracing (avoid noise from student-facing compilations)
    compilerTrace.disable();

    devToolsState.currentResult = result;
    devToolsState.stepEvents = compilerTrace.getEvents();
    devToolsState.stepIndex = -1;
    devToolsState.simulationTrace = (result && result.simulation) || null;
    devToolsState.simulationEvents = _normalizeSimulationTrace(devToolsState.simulationTrace);
    devToolsState.simulationStepIndex = -1;

    // Compute complexity using the real compiler method
    const complexity = compilerEngine.analyzeComplexity(pseudocode);

    // Store attempt
    const attempt = {
        attemptNumber: devToolsState.attempts.length + 1,
        sourceCode: pseudocode,
        mappedCode: result.mappedCode || pseudocode,
        tokens: result.tokens || [],
        ast: result.ast || null,
        symbolTable: result.symbolTable || {},
        errors: result.errors || [],
        warnings: result.warnings || [],
        generatedPython: result.python || '',
        runtimeOutput: null,
        runtimeError: null,
        metrics: result.metrics || {},
        status: result.valid ? 'COMPILE_SUCCESS' : 'COMPILE_ERROR',
        timestamp: new Date().toISOString(),
        autoFixes: result.autoFixes || [],
        complexity: complexity,
        traceEvents: devToolsState.stepEvents,
        simulationEvents: devToolsState.simulationEvents,
        simulationTrace: devToolsState.simulationTrace,
    };
    devToolsState.attempts.push(attempt);

    // ── Update ALL visualizations from real data ──
    _updatePipelineFromEvents(devToolsState.stepEvents, result);
    _updatePythonOutput(result);
    _updateTokenInspector(result.tokens || []);
    _updateASTInspector(result.ast);
    _updateSymbolTable(result.symbolTable);
    _updateParserState(result);
    _updateSemanticView(result);
    _updateTranslationView(result);
    _updateErrorPanel(result);
    _updateEventLog(devToolsState.stepEvents);
    _updateMetrics(result, complexity);
    _updateAttemptHistory();
    _updateAutoFixPanel(result);
    _updateRawJSON(result);
    _updateActiveStage(result);
    _updateSimulation(result);

    // Enable step-through
    const stepBtn = document.getElementById('devtools-step-btn');
    if (stepBtn) stepBtn.disabled = false;

    // ── Auto-execute if compilation succeeded ──
    if (result.valid && result.python) {
        _devToolsExecutePython(result.python, attempt);
    }
}

// ══════════════════════════════════════════════════════════════
// PYTHON EXECUTION — USES REAL SKULPT RUNTIME
// ══════════════════════════════════════════════════════════════

function _devToolsRenderSkulptUnavailable(statusEl, stderrEl, pipeRuntime) {
    if (typeof runtimeConsole !== 'undefined') {
        runtimeConsole.beginRun();
        runtimeConsole.fail(new Error('Skulpt library not available.'));
    }
    if (statusEl) statusEl.textContent = '{{ui:TriangleAlert}} Skulpt not loaded';
    if (stderrEl) stderrEl.textContent = 'Skulpt library not available.';
    if (pipeRuntime) pipeRuntime.className = 'pipeline-stage status-ERROR';
    compilerTrace.emit({ type: 'EXECUTION_COMPLETE', stage: 'EXECUTION', status: 'ERROR', data: { error: 'Skulpt not loaded' } });
    compilerTrace.disable();
    _updateEventLog(compilerTrace.getEvents());
}

function _devToolsExecutePython(pythonCode, attempt) {
    const statusEl = document.getElementById('devtools-runtime-status');
    const timeEl = document.getElementById('devtools-runtime-time');
    const stdoutEl = document.getElementById('devtools-runtime-stdout');
    const stderrEl = document.getElementById('devtools-runtime-stderr');
    const pipeRuntime = document.getElementById('pipe-runtime');

    if (typeof Sk === 'undefined') {
        if (statusEl) statusEl.textContent = 'Loading Python runtime...';
        ensureSkulptLoaded(function () {
            if (typeof Sk !== 'undefined') {
                _devToolsExecutePython(pythonCode, attempt);
            } else {
                _devToolsRenderSkulptUnavailable(statusEl, stderrEl, pipeRuntime);
            }
        }, function () {
            _devToolsRenderSkulptUnavailable(statusEl, stderrEl, pipeRuntime);
        });
        return;
    }

    const runSession = (typeof runtimeConsole !== 'undefined') ? runtimeConsole.beginRun() : null;

    if (pipeRuntime) {
        pipeRuntime.className = 'pipeline-stage status-RUNNING';
        pipeRuntime.querySelector('.pipe-status-dot').title = 'RUNNING';
    }
    if (statusEl) statusEl.textContent = 'Running...';
    if (stdoutEl) stdoutEl.textContent = '';
    if (stderrEl) stderrEl.textContent = '';

    compilerTrace.enable();
    compilerTrace.emit({ type: 'EXECUTION_START', stage: 'EXECUTION', status: 'RUNNING', data: { pythonLength: pythonCode.length } });

    const stdoutBuffer = [];
    const execStart = performance.now();

    // Skulpt bakes the run budget into the generated code from the
    // Sk.configure() payload, so execLimit has to be supplied HERE, before
    // importMainWithBody compiles the program. This build has no
    // Sk.misceval.timeout, so a guard written against that API is a no-op and
    // a tight loop would freeze the tab.
    const execLimitMs = (typeof SKULPT_EXEC_LIMIT_MS === 'number') ? SKULPT_EXEC_LIMIT_MS : 15000;

    Sk.configure(Object.assign({
        output: function (text) {
            stdoutBuffer.push(text);
            if (typeof runtimeConsole !== 'undefined') runtimeConsole.append(text, 'stdout');
        },
        read: function (x) {
            if (Sk.builtinFiles === undefined || Sk.builtinFiles["files"][x] === undefined)
                throw "File not found: '" + x + "'";
            return Sk.builtinFiles["files"][x];
        },
        inputfun: function (promptText) {
            return runtimeConsole.requestInput(promptText || 'Input required:');
        },
        inputfunTakesPrompt: true,
        __future__: Sk.python3
    }, { execLimit: execLimitMs }));

    const execFn = function () {
        return Sk.importMainWithBody("<stdin>", false, pythonCode, true);
    };

    Sk.misceval.asyncToPromise(execFn).then(function () {
        const execTime = performance.now() - execStart;
        const stdout = stdoutBuffer.join('');

        // A newer run may have started (e.g. after Stop); ignore stale completions.
        if (runSession !== null && typeof runtimeConsole !== 'undefined' && runtimeConsole.sessionId !== runSession) return;

        const consoleStopped = typeof runtimeConsole !== 'undefined' && runtimeConsole.state === 'stopped';

        if (typeof runtimeConsole !== 'undefined') {
            runtimeConsole.finish();
        } else if (statusEl) {
            statusEl.textContent = '{{ui:CircleCheck}} Success';
        }
        if (stdoutEl) stdoutEl.textContent = stdout || '(no output)';
        if (timeEl) timeEl.textContent = execTime.toFixed(3) + ' ms';
        if (pipeRuntime) {
            pipeRuntime.className = 'pipeline-stage ' + (consoleStopped ? 'status-SKIPPED' : 'status-SUCCESS');
            const pt = pipeRuntime.querySelector('.pipe-time');
            if (pt) pt.textContent = execTime.toFixed(2) + ' ms';
        }

        const dm = document.getElementById('dm-exec-time');
        if (dm) dm.textContent = execTime.toFixed(3) + ' ms';

        attempt.runtimeOutput = stdout;
        attempt.status = consoleStopped ? 'RUNTIME_STOPPED' : 'RUNTIME_SUCCESS';

        compilerTrace.emit({ type: 'EXECUTION_COMPLETE', stage: 'EXECUTION', status: consoleStopped ? 'SKIPPED' : 'SUCCESS', data: { stdout, executionTime: execTime, stopped: consoleStopped } });
        compilerTrace.disable();
        devToolsState.stepEvents = compilerTrace.getEvents();
        _updateEventLog(devToolsState.stepEvents);
        _updateRawJSON(devToolsState.currentResult, { stdout, stderr: '', executionTime: execTime, stopped: consoleStopped });

        // Build execution trace from AST
        _buildExecutionTrace(devToolsState.currentResult, stdout);

    }).catch(function (err) {
        const execTime = performance.now() - execStart;

        // A newer run may have started (e.g. after Stop); ignore stale failures.
        if (runSession !== null && typeof runtimeConsole !== 'undefined' && runtimeConsole.sessionId !== runSession) return;

        const aborted = typeof runtimeConsole !== 'undefined' && err === runtimeConsole.ABORTED;

        if (aborted) {
            if (typeof runtimeConsole !== 'undefined') runtimeConsole.fail(err);
            if (pipeRuntime) pipeRuntime.className = 'pipeline-stage status-SKIPPED';
            attempt.runtimeError = 'Stopped by user';
            attempt.status = 'RUNTIME_STOPPED';
            compilerTrace.emit({ type: 'EXECUTION_COMPLETE', stage: 'EXECUTION', status: 'SKIPPED', data: { stopped: true, executionTime: execTime } });
            compilerTrace.disable();
            devToolsState.stepEvents = compilerTrace.getEvents();
            _updateEventLog(devToolsState.stepEvents);
            _updateRawJSON(devToolsState.currentResult, { stdout: stdoutBuffer.join(''), stderr: '', executionTime: execTime, stopped: true });
            return;
        }

        const errStr = err.toString();
        // A tripped run budget is a stop condition, not a program bug. Say so
        // plainly instead of reporting it as an unexplained runtime error.
        const timedOut = /exceeded run time limit|TimeoutError/i.test(errStr);
        if (typeof runtimeConsole !== 'undefined') {
            runtimeConsole.fail(err);
            if (timedOut) {
                runtimeConsole.append(
                    '\nStopped after ' + Math.round((typeof execLimitMs === 'number' ? execLimitMs : 15000) / 1000) +
                    ' seconds. Check for a loop that never ends.', 'stderr');
            }
        }
        if (statusEl) statusEl.textContent = '{{ui:CircleX}} Error';
        if (stderrEl) stderrEl.textContent = errStr;
        if (stdoutEl) stdoutEl.textContent = stdoutBuffer.join('') || '(no output before error)';
        if (timeEl) timeEl.textContent = execTime.toFixed(3) + ' ms';
        if (pipeRuntime) pipeRuntime.className = 'pipeline-stage status-ERROR';

        attempt.runtimeError = errStr;
        attempt.status = 'RUNTIME_ERROR';

        // Add runtime error to classified errors
        devToolsState.allErrors.push({
            category: 'RUNTIME', stage: 'EXECUTION', line: '—',
            message: errStr,
            suggestion: timedOut
                ? 'The program exceeded the ' + Math.round((typeof execLimitMs === 'number' ? execLimitMs : 15000) / 1000) + 's run limit. Check for a loop that never ends.'
                : 'Check the generated Python code for runtime issues.'
        });
        _renderErrorTable();

        compilerTrace.emit({ type: 'EXECUTION_COMPLETE', stage: 'EXECUTION', status: 'ERROR', data: { error: errStr, executionTime: execTime } });
        compilerTrace.disable();
        devToolsState.stepEvents = compilerTrace.getEvents();
        _updateEventLog(devToolsState.stepEvents);
        _updateRawJSON(devToolsState.currentResult, { stdout: stdoutBuffer.join(''), stderr: errStr, executionTime: execTime });
    });
}

// ══════════════════════════════════════════════════════════════
// STEP-THROUGH MODE
// ══════════════════════════════════════════════════════════════

function devToolsStepThrough() {
    const events = devToolsState.stepEvents;
    if (!events.length) return;

    devToolsState.stepIndex++;
    if (devToolsState.stepIndex >= events.length) {
        devToolsState.stepIndex = events.length - 1;
        if (typeof showToast === 'function') showToast('End of trace events.', 'info');
        return;
    }

    const event = events[devToolsState.stepIndex];

    // Update pipeline stage highlighting
    _highlightPipelineStage(event.stage);

    // Update active stage detail
    const detail = document.getElementById('devtools-stage-detail');
    if (detail) {
        detail.innerHTML = `
            <div class="devtools-stage-event">
                <div class="devtools-kv"><span class="devtools-kv-key">Event:</span> <code>${event.type}</code></div>
                <div class="devtools-kv"><span class="devtools-kv-key">Stage:</span> <code>${event.stage}</code></div>
                <div class="devtools-kv"><span class="devtools-kv-key">Status:</span> <span class="devtools-status-${event.status}">${event.status}</span></div>
                <div class="devtools-kv"><span class="devtools-kv-key">Time:</span> ${event.timeISO}</div>
                <div class="devtools-kv"><span class="devtools-kv-key">Step:</span> ${devToolsState.stepIndex + 1} / ${events.length}</div>
                <details open><summary>Data</summary><pre class="devtools-raw-pre">${JSON.stringify(event.data, null, 2)}</pre></details>
            </div>`;
    }

    const badge = document.getElementById('devtools-active-stage-badge');
    if (badge) {
        badge.textContent = event.status;
        badge.className = 'devtools-stage-badge devtools-badge-' + event.status;
    }
}

// ══════════════════════════════════════════════════════════════
// CONTROLS
// ══════════════════════════════════════════════════════════════

function devToolsPause() { /* Step-through is manual; no-op */ }
function devToolsResume() { /* Step-through is manual; no-op */ }

function devToolsReset() {
    devToolsState.currentResult = null;
    devToolsState.runtimeResult = null;
    devToolsState.stepIndex = -1;
    devToolsState.stepEvents = [];
    devToolsState.simulationEvents = [];
    devToolsState.simulationTrace = null;
    devToolsState.simulationStepIndex = -1;
    devToolsState.allErrors = [];
    compilerTrace.reset();
    if (typeof simulationTracer !== 'undefined') simulationTracer.reset();
    if (typeof runtimeConsole !== 'undefined') runtimeConsole.reset();

    _resetPipelineVis();
    document.getElementById('devtools-python-output').textContent = 'Waiting for compilation...';
    document.getElementById('devtools-token-tbody').innerHTML = '';
    document.getElementById('devtools-token-count').textContent = '0 tokens';
    document.getElementById('devtools-ast-tree').innerHTML = '<div class="devtools-idle-message"><p>No AST generated yet.</p></div>';
    document.getElementById('devtools-symbol-tbody').innerHTML = '';
    document.getElementById('devtools-parser-state').innerHTML = '<div class="devtools-idle-message"><p>No parser state available.</p></div>';
    document.getElementById('devtools-semantic-output').innerHTML = '<div class="devtools-idle-message"><p>No semantic analysis data.</p></div>';
    document.getElementById('devtools-translation-view').innerHTML = '<div class="devtools-idle-message"><p>Run the pipeline to see AST → Python translation mapping.</p></div>';
    document.getElementById('devtools-error-tbody').innerHTML = '';
    document.getElementById('devtools-error-count').textContent = '0 issues';
    document.getElementById('devtools-runtime-status').textContent = 'Not executed';
    document.getElementById('devtools-runtime-time').textContent = '—';
    document.getElementById('devtools-runtime-stdout').textContent = '—';
    document.getElementById('devtools-runtime-stderr').textContent = '—';
    document.getElementById('devtools-exec-trace').innerHTML = '<div class="devtools-idle-message"><p>Run the pipeline and execute to see a step-by-step trace.</p></div>';
    document.getElementById('devtools-event-log').innerHTML = '<div class="devtools-idle-message"><p>No events recorded.</p></div>';
    document.getElementById('devtools-stage-detail').innerHTML = '<div class="devtools-idle-message"><div style="font-size:2rem;margin-bottom:0.5rem">{{ui:Microscope}}</div><p>Enter pseudocode and click <strong>Run Pipeline</strong> to begin compiler analysis.</p></div>';
    document.getElementById('devtools-active-stage-badge').textContent = 'IDLE';
    document.getElementById('devtools-active-stage-badge').className = 'devtools-stage-badge';
    ['dm-lex-time','dm-parse-time','dm-semantic-time','dm-codegen-time','dm-total-time','dm-exec-time','dm-token-count','dm-ast-nodes','dm-complexity','dm-attempt-num','dm-autofix-count'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '—';
    });
    document.querySelectorAll('.devtools-raw-pre').forEach(el => el.textContent = '—');

    const stepBtn = document.getElementById('devtools-step-btn');
    if (stepBtn) stepBtn.disabled = true;

    if (typeof devToolsSimReset === 'function') devToolsSimReset();
    if (typeof _updateSimulation === 'function') _updateSimulation(null);

    const afp = document.getElementById('devtools-autofix-panel');
    if (afp) afp.classList.add('hidden');

    if (typeof devToolsSyncPythonExportButton === 'function') devToolsSyncPythonExportButton();
}

function devToolsClearTrace() {
    compilerTrace.reset();
    devToolsState.stepEvents = [];
    devToolsState.stepIndex = -1;
    document.getElementById('devtools-event-log').innerHTML = '<div class="devtools-idle-message"><p>Trace cleared.</p></div>';
    if (typeof showToast === 'function') showToast('Trace cleared.', 'info');
}

function devToolsExportTrace() {
    const data = {
        attempts: devToolsState.attempts,
        traceEvents: devToolsState.stepEvents,
        exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pseudopy-compiler-trace-' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(url);
    if (typeof showToast === 'function') showToast('Trace exported.', 'success');
}

function devToolsViewRawJSON() {
    devToolsSwitchTab('rawjson');
}

function devToolsCopyPython() {
    const code = typeof devToolsCurrentPython === 'function' ? devToolsCurrentPython() : '';
    if (!code.trim()) {
        if (typeof showToast === 'function') showToast('Nothing to copy yet. Run the pipeline first.', 'error');
        return;
    }
    navigator.clipboard.writeText(code).then(() => {
        if (typeof showToast === 'function') showToast('Python code copied!', 'success');
    });
}

// ══════════════════════════════════════════════════════════════
// PIPELINE VISUALIZER — Updates from REAL trace events
// ══════════════════════════════════════════════════════════════

const _statusLabels = {
    'IDLE': 'Idle',
    'RUNNING': 'Active',
    'SUCCESS': 'Completed',
    'WARNING': 'Warning',
    'ERROR': 'Error',
    'SKIPPED': 'Skipped',
    'RETRYING': 'Retrying',
};

function _pipelineStatusLabel(status) {
    return _statusLabels[status] || status;
}

function _forceStage(elId, status, statusLabel) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.className = 'pipeline-stage status-' + status;
    el.dataset.status = status;
    el.dataset.statusLabel = statusLabel || _pipelineStatusLabel(status);
    const dot = el.querySelector('.pipe-status-dot');
    if (dot) dot.title = statusLabel || status;
}

function _resetPipelineVis() {
    document.querySelectorAll('.pipeline-stage').forEach(s => {
        s.className = 'pipeline-stage';
        const dot = s.querySelector('.pipe-status-dot');
        if (dot) dot.title = 'IDLE';
        const time = s.querySelector('.pipe-time');
        if (time) time.textContent = '—';
        s.dataset.status = 'IDLE';
        s.dataset.statusLabel = _pipelineStatusLabel('IDLE');
    });
}

const _stageToElementMap = {
    'PREPROCESSING':     'pipe-preprocess',
    'NLP_MAPPING':       'pipe-nlp',
    'LEXICAL_ANALYSIS':  'pipe-lexer',
    'SYNTAX_ANALYSIS':   'pipe-parser',
    'SEMANTIC_ANALYSIS': 'pipe-semantic',
    'CODE_GENERATION':   'pipe-codegen',
    'EXECUTION':         'pipe-runtime',
    'VALIDATION_REFINEMENT': 'pipe-parser',
};

function _updatePipelineFromEvents(events, result) {
    // Compute per-stage timing from actual trace events
    const stageTimes = {};
    const stageStatus = {};

    for (const ev of events) {
        const stage = ev.stage;
        if (!stageTimes[stage]) stageTimes[stage] = { start: ev.timestamp, end: ev.timestamp };
        else stageTimes[stage].end = ev.timestamp;
        stageStatus[stage] = ev.status;
    }

    for (const [stage, times] of Object.entries(stageTimes)) {
        const elId = _stageToElementMap[stage];
        if (!elId) continue;
        const el = document.getElementById(elId);
        if (!el) continue;

        const status = stageStatus[stage] || 'IDLE';
        el.className = 'pipeline-stage status-' + status;
        el.dataset.status = status;
        el.dataset.statusLabel = _pipelineStatusLabel(status);
        const dot = el.querySelector('.pipe-status-dot');
        if (dot) dot.title = status;
        const timeEl = el.querySelector('.pipe-time');
        if (timeEl) {
            const duration = times.end - times.start;
            timeEl.textContent = duration.toFixed(2) + ' ms';
        }
    }

    // Semantic type/structure failures stop code generation and execution.
    const hasSemanticFailure = Array.isArray(result.errors) &&
        result.errors.some(e => e && e.stage === 'Semantic Analysis' && e.severity === 'error');
    if (hasSemanticFailure) {
        _forceStage('pipe-semantic', 'ERROR');
        _forceStage('pipe-codegen', 'SKIPPED', 'Not executed');
        _forceStage('pipe-runtime', 'SKIPPED', 'Not executed');
    }

    // Also set pipeline times from metrics for accuracy
    if (result.metrics) {
        const m = result.metrics;
        _setTimeText('pipe-lexer-time', m.lexTime);
        _setTimeText('pipe-parser-time', m.parseTime);
        _setTimeText('pipe-semantic-time', m.semanticTime);
        _setTimeText('pipe-codegen-time', m.codeGenTime);
    }
}

function _setTimeText(id, ms) {
    const el = document.getElementById(id);
    if (el && ms !== undefined) el.textContent = ms.toFixed(3) + ' ms';
}

function _highlightPipelineStage(stage) {
    document.querySelectorAll('.pipeline-stage').forEach(s => s.classList.remove('pipeline-active'));
    const elId = _stageToElementMap[stage];
    if (elId) {
        const el = document.getElementById(elId);
        if (el) el.classList.add('pipeline-active');
    }
}

// ══════════════════════════════════════════════════════════════
// PYTHON OUTPUT
// ══════════════════════════════════════════════════════════════

function _updatePythonOutput(result) {
    const el = document.getElementById('devtools-python-output');
    if (!el) return;
    if (result.valid && result.python) {
        // Add line numbers
        const lines = result.python.split('\n');
        el.textContent = lines.map((l, i) => `${String(i + 1).padStart(3)} │ ${l}`).join('\n');
    } else {
        el.textContent = result.errors.length > 0
            ? '# Compilation failed — ' + result.errors.length + ' error(s)\n' + result.errors.map(e => '# Line ' + e.line + ': ' + e.message).join('\n')
            : '# No output';
    }
    if (typeof devToolsSyncPythonExportButton === 'function') devToolsSyncPythonExportButton();
}

// ══════════════════════════════════════════════════════════════
// TOKEN INSPECTOR — Reads REAL Lexer output
// ══════════════════════════════════════════════════════════════

let _allTokens = [];

function _updateTokenInspector(tokens) {
    _allTokens = tokens || [];
    document.getElementById('devtools-token-count').textContent = _allTokens.length + ' tokens';
    devToolsFilterTokens();
}

function devToolsFilterTokens() {
    const search = (document.getElementById('devtools-token-filter').value || '').toLowerCase();
    const typeFilter = document.getElementById('devtools-token-type-filter').value;
    const tbody = document.getElementById('devtools-token-tbody');
    if (!tbody) return;

    let filtered = _allTokens.filter(t => {
        if (typeFilter && t.type !== typeFilter) return false;
        if (search && !t.value.toLowerCase().includes(search) && !t.type.toLowerCase().includes(search)) return false;
        return true;
    });

    // Render (cap at 500 rows for performance)
    const maxRows = 500;
    const rows = filtered.slice(0, maxRows);
    tbody.innerHTML = rows.map(t => {
        const displayVal = t.type === 'NEWLINE' ? '↵' : _esc(t.value);
        return `<tr><td>${t.line}</td><td><code class="token-type-${t.type}">${t.type}</code></td><td><code>${displayVal}</code></td></tr>`;
    }).join('');

    document.getElementById('devtools-token-count').textContent =
        (filtered.length > maxRows ? maxRows + ' of ' : '') + filtered.length + ' tokens';
}

// ══════════════════════════════════════════════════════════════
// AST INSPECTOR — Reads REAL Parser output
// ══════════════════════════════════════════════════════════════

function _updateASTInspector(ast) {
    const container = document.getElementById('devtools-ast-tree');
    if (!container) return;
    if (!ast) { container.innerHTML = '<div class="devtools-idle-message"><p>No AST.</p></div>'; return; }
    container.innerHTML = '<div class="ast-node-root">' + _renderASTNode(ast, 0) + '</div>';
}

function _renderASTNode(node, depth) {
    if (!node || typeof node !== 'object') return '';
    const entries = Object.entries(node).filter(([key]) => !['tokens', 'errors'].includes(key));
    const props = entries.filter(([key, value]) => key !== 'type' && value !== null && typeof value !== 'object')
        .map(([key, value]) => `<span class="ast-prop">${_esc(key)}: <code>${_esc(String(value))}</code></span>`).join(' ');
    let html = `<details class="ast-node" ${depth < 4 ? 'open' : ''}><summary class="ast-node-summary"><span class="ast-type">${_esc(node.type || 'Branch')}</span> ${props}</summary><div class="ast-children">`;
    // Expression nodes retain both source tokens and an actual precedence tree.
    if (node.tokens) html += `<div class="ast-expr"><code>${_esc(node.tokens.map(t => t.value).join(' '))}</code></div>`;
    for (const [key, value] of entries) {
        if (!value || typeof value !== 'object') continue;
        html += `<div class="ast-child-label">${_esc(key)}:</div>`;
        if (Array.isArray(value)) {
            for (const child of value) html += typeof child === 'object' ? _renderASTNode(child, depth + 1) : `<code>${_esc(String(child))}</code> `;
        } else html += _renderASTNode(value, depth + 1);
    }
    return html + '</div></details>';
}

// ══════════════════════════════════════════════════════════════
// SYMBOL TABLE — Reads REAL SemanticAnalyzer symbolTable
// ══════════════════════════════════════════════════════════════

function _updateSymbolTable(symbolTable) {
    const tbody = document.getElementById('devtools-symbol-tbody');
    if (!tbody) return;
    if (!symbolTable || Object.keys(symbolTable).length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="devtools-empty">No symbols.</td></tr>';
        return;
    }
    tbody.innerHTML = Object.entries(symbolTable).map(([name, info]) => {
        return `<tr><td><code>${_esc(name)}</code></td><td>${info.type || 'unknown'}</td><td>declared</td></tr>`;
    }).join('');
}

// ══════════════════════════════════════════════════════════════
// PARSER STATE — Reads REAL Parser errors and block stack
// ══════════════════════════════════════════════════════════════

function _updateParserState(result) {
    const container = document.getElementById('devtools-parser-state');
    if (!container) return;

    const ast = result.ast;
    const parserErrors = (ast && ast.errors) ? ast.errors : [];

    // Find block stack from trace events
    const astEvent = devToolsState.stepEvents.find(e => e.type === 'AST_CREATED');
    const blockStack = astEvent && astEvent.data.blockStack ? astEvent.data.blockStack : [];

    let html = '<div class="devtools-parser-info">';
    html += `<div class="devtools-kv"><span class="devtools-kv-key">Parser Errors:</span> ${parserErrors.length}</div>`;
    html += `<div class="devtools-kv"><span class="devtools-kv-key">Block Stack (at end):</span> ${blockStack.length === 0 ? 'EMPTY {{ui:CircleCheck}}' : blockStack.map(b => b.type + ' (line ' + b.line + ')').join(' → ')}</div>`;

    if (parserErrors.length > 0) {
        html += '<h4 style="margin-top:1rem">Parser Errors:</h4>';
        html += '<div class="devtools-error-list">';
        for (const err of parserErrors) {
            html += `<div class="devtools-error-item"><strong>Line ${err.line}:</strong> ${_esc(err.message)}`;
            if (err.suggestion) html += `<div class="devtools-suggestion">{{ui:Lightbulb}} ${_esc(err.suggestion)}</div>`;
            html += '</div>';
        }
        html += '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════
// SEMANTIC VIEW — Reads REAL SemanticAnalyzer warnings
// ══════════════════════════════════════════════════════════════

function _updateSemanticView(result) {
    const container = document.getElementById('devtools-semantic-output');
    if (!container) return;

    const warnings = result.warnings || [];
    const symbolTable = result.symbolTable || {};

    let html = '<div class="devtools-semantic-info">';
    html += `<div class="devtools-kv"><span class="devtools-kv-key">Symbol Table Entries:</span> ${Object.keys(symbolTable).length}</div>`;
    html += `<div class="devtools-kv"><span class="devtools-kv-key">Warnings:</span> ${warnings.length}</div>`;

    if (warnings.length > 0) {
        html += '<h4 style="margin-top:1rem">Semantic Warnings:</h4>';
        html += '<div class="devtools-warning-list">';
        for (const w of warnings) {
            html += `<div class="devtools-warning-item"><strong>Line ${w.line}:</strong> ${_esc(w.message)}`;
            if (w.suggestion) html += `<div class="devtools-suggestion">{{ui:Lightbulb}} ${_esc(w.suggestion)}</div>`;
            html += '</div>';
        }
        html += '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════
// TRANSLATION VIEW — AST node → Python mapping
// ══════════════════════════════════════════════════════════════

function _updateTranslationView(result) {
    const container = document.getElementById('devtools-translation-view');
    if (!container) return;

    if (!result.ast || !result.ast.body || !result.valid) {
        container.innerHTML = '<div class="devtools-idle-message"><p>No successful compilation to show translation.</p></div>';
        return;
    }

    const pythonLines = (result.python || '').split('\n');
    let html = '<div class="devtools-translation-list">';

    // Map each AST node to its generated Python by re-generating per-node
    const gen = new CodeGenerator(new Map(Object.entries(result.symbolTable || {})));
    for (const node of result.ast.body) {
        gen.lines = [];
        gen.indentLevel = 0;
        gen.visitNode(node);
        const pyChunk = gen.lines.join('\n');

        // Find pseudocode representation
        let pseudoLabel = node.type;
        if (node.type === 'AssignmentStatement') pseudoLabel = `SET ${node.id} TO ...`;
        else if (node.type === 'DeclareStatement') pseudoLabel = `DECLARE ${node.id} AS ${node.varType}`;
        else if (node.type === 'PrintStatement') pseudoLabel = `DISPLAY ...`;
        else if (node.type === 'IfStatement') pseudoLabel = `IF ... THEN`;
        else if (node.type === 'WhileStatement') pseudoLabel = `WHILE ... DO`;
        else if (node.type === 'ForStatement') pseudoLabel = `FOR ${node.iterator || '...'} FROM ... TO ...`;
        else if (node.type === 'InputStatement') pseudoLabel = `INPUT ${node.id}`;
        else if (node.type === 'FunctionDef') pseudoLabel = `FUNCTION ${node.name}`;

        html += `<div class="devtools-translation-item">
            <div class="devtools-trans-pseudo"><code>${_esc(pseudoLabel)}</code><span class="devtools-trans-arrow">→</span><span class="ast-type">${node.type}</span><span class="devtools-trans-arrow">→</span></div>
            <pre class="devtools-trans-python">${_esc(pyChunk)}</pre>
        </div>`;
    }

    html += '</div>';
    container.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════
// ERROR PANEL — Classified from REAL compiler data
// ══════════════════════════════════════════════════════════════

function _updateErrorPanel(result) {
    devToolsState.allErrors = [];

    // Syntax errors from parser
    for (const err of (result.errors || [])) {
        devToolsState.allErrors.push({
            category: 'SYNTAX', stage: 'SYNTAX_ANALYSIS', line: err.line,
            message: err.message, suggestion: err.suggestion || ''
        });
    }

    // Semantic warnings
    for (const w of (result.warnings || [])) {
        devToolsState.allErrors.push({
            category: 'SEMANTIC', stage: 'SEMANTIC_ANALYSIS', line: w.line,
            message: w.message, suggestion: w.suggestion || ''
        });
    }

    _renderErrorTable();
}

function _renderErrorTable() {
    const filterVal = document.getElementById('devtools-error-filter').value;
    const tbody = document.getElementById('devtools-error-tbody');
    if (!tbody) return;

    let errors = devToolsState.allErrors;
    if (filterVal) errors = errors.filter(e => e.category === filterVal);

    document.getElementById('devtools-error-count').textContent = errors.length + ' issues';

    if (errors.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="devtools-empty">No issues found.</td></tr>';
        return;
    }

    tbody.innerHTML = errors.map(e => {
        const catClass = 'error-cat-' + e.category;
        return `<tr><td><span class="${catClass}">${e.category}</span></td><td>${e.stage}</td><td>${e.line}</td><td>${_esc(e.message)}</td><td>${_esc(e.suggestion)}</td></tr>`;
    }).join('');
}

function devToolsFilterErrors() {
    _renderErrorTable();
}

// ══════════════════════════════════════════════════════════════
// EVENT LOG — Real trace events with timestamps
// ══════════════════════════════════════════════════════════════

function _updateEventLog(events) {
    const container = document.getElementById('devtools-event-log');
    if (!container) return;

    if (!events.length) {
        container.innerHTML = '<div class="devtools-idle-message"><p>No events.</p></div>';
        return;
    }

    const html = events.map(ev => {
        const time = ev.timeISO ? ev.timeISO.split('T')[1].replace('Z', '') : '—';
        return `<div class="devtools-log-entry devtools-log-${ev.status}">
            <span class="devtools-log-time">${time}</span>
            <span class="devtools-log-type">${ev.type}</span>
            <span class="devtools-log-stage">${ev.stage}</span>
            <span class="devtools-log-status">${ev.status}</span>
        </div>`;
    }).join('');

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

// ══════════════════════════════════════════════════════════════
// METRICS & COMPLEXITY — From REAL compiler metrics
// ══════════════════════════════════════════════════════════════

function _updateMetrics(result, complexity) {
    const m = result.metrics || {};
    _setText('dm-lex-time', (m.lexTime || 0).toFixed(3) + ' ms');
    _setText('dm-parse-time', (m.parseTime || 0).toFixed(3) + ' ms');
    _setText('dm-semantic-time', (m.semanticTime || 0).toFixed(3) + ' ms');
    _setText('dm-codegen-time', (m.codeGenTime || 0).toFixed(3) + ' ms');
    _setText('dm-total-time', (m.totalTime || 0).toFixed(3) + ' ms');
    _setText('dm-token-count', String(m.tokenCount || 0));
    _setText('dm-ast-nodes', String(m.astNodeCount || 0));
    _setText('dm-complexity', complexity || '—');
    _setText('dm-attempt-num', String(devToolsState.attempts.length));
    _setText('dm-autofix-count', String((result.autoFixes || []).length));
}

// ══════════════════════════════════════════════════════════════
// ATTEMPT HISTORY
// ══════════════════════════════════════════════════════════════

function _updateAttemptHistory() {
    const container = document.getElementById('devtools-attempt-history');
    if (!container) return;

    if (devToolsState.attempts.length === 0) {
        container.innerHTML = '<div class="devtools-idle-message"><p>No attempts yet.</p></div>';
        return;
    }

    const html = devToolsState.attempts.map((a, i) => {
        let icon = '{{ui:CircleX}}';
        let statusClass = 'attempt-error';
        if (a.status === 'RUNTIME_SUCCESS') { icon = '{{ui:CircleCheck}}'; statusClass = 'attempt-success'; }
        else if (a.status === 'COMPILE_SUCCESS') { icon = '{{ui:TriangleAlert}}'; statusClass = 'attempt-warning'; }
        else if (a.status === 'RUNTIME_STOPPED') { icon = '{{ui:CircleX}}'; statusClass = 'attempt-warning'; }

        return `<div class="devtools-attempt-card ${statusClass}" onclick="devToolsLoadAttempt(${i})">
            <div class="attempt-num">${icon} Attempt #${a.attemptNumber}</div>
            <div class="attempt-status">${a.status.replace('_', ' ')}</div>
            <div class="attempt-time">${a.timestamp.split('T')[1].split('.')[0]}</div>
            <div class="attempt-meta">${a.errors.length} errors · ${a.warnings.length} warnings · ${a.autoFixes.length} fixes</div>
        </div>`;
    }).join('');

    container.innerHTML = html;
}

function devToolsLoadAttempt(index) {
    const attempt = devToolsState.attempts[index];
    if (!attempt) return;

    // Restore the attempt data into visualizations
    document.getElementById('devtools-pseudocode').value = attempt.sourceCode;
    _updatePythonOutput({ valid: attempt.status.includes('SUCCESS'), python: attempt.generatedPython, errors: attempt.errors });
    _updateTokenInspector(attempt.tokens);
    _updateASTInspector(attempt.ast);
    _updateSymbolTable(attempt.symbolTable);
    _updateErrorPanel({ errors: attempt.errors, warnings: attempt.warnings });
    _updateMetrics({ metrics: attempt.metrics, autoFixes: attempt.autoFixes }, attempt.complexity);
    _updateEventLog(attempt.traceEvents || []);
    devToolsState.stepEvents = attempt.traceEvents || [];
    devToolsState.simulationEvents = attempt.simulationEvents || [];
    devToolsState.simulationTrace = attempt.simulationTrace || null;
    devToolsState.simulationStepIndex = -1;
    if (typeof _updateSimulation === 'function') _updateSimulation({ ast: attempt.ast, symbolTable: attempt.symbolTable, mappedCode: attempt.mappedCode, metrics: attempt.metrics });

    if (typeof showToast === 'function') showToast(`Loaded Attempt #${attempt.attemptNumber}`, 'info');
}

// ══════════════════════════════════════════════════════════════
// AUTO-FIX PANEL
// ══════════════════════════════════════════════════════════════

function _updateAutoFixPanel(result) {
    const panel = document.getElementById('devtools-autofix-panel');
    const content = document.getElementById('devtools-autofix-content');
    if (!panel || !content) return;

    if (!result.autoFixes || result.autoFixes.length === 0) {
        panel.classList.add('hidden');
        return;
    }

    panel.classList.remove('hidden');
    let html = '';
    for (const fix of result.autoFixes) {
        html += `<div class="devtools-autofix-item">
            <div class="devtools-kv"><span class="devtools-kv-key">Detected:</span> ${_esc(fix.detected)}</div>
            <div class="devtools-kv"><span class="devtools-kv-key">Suggested:</span> <code>${_esc(fix.suggested)}</code></div>
            <div class="devtools-kv"><span class="devtools-kv-key">Action:</span> ${_esc(fix.action)}</div>
        </div>`;
    }
    content.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════
// ACTIVE STAGE DETAIL
// ══════════════════════════════════════════════════════════════

function _updateActiveStage(result) {
    const detail = document.getElementById('devtools-stage-detail');
    const badge = document.getElementById('devtools-active-stage-badge');
    if (!detail || !badge) return;

    const status = result.valid ? 'SUCCESS' : 'ERROR';
    badge.textContent = status;
    badge.className = 'devtools-stage-badge devtools-badge-' + status;

    const m = result.metrics || {};
    detail.innerHTML = `
        <div class="devtools-stage-summary">
            <div class="devtools-kv"><span class="devtools-kv-key">Pipeline Status:</span> <span class="devtools-status-${status}">${status}</span></div>
            <div class="devtools-kv"><span class="devtools-kv-key">Total Time:</span> ${(m.totalTime || 0).toFixed(3)} ms</div>
            <div class="devtools-kv"><span class="devtools-kv-key">Tokens:</span> ${m.tokenCount || 0}</div>
            <div class="devtools-kv"><span class="devtools-kv-key">AST Nodes:</span> ${m.astNodeCount || 0}</div>
            <div class="devtools-kv"><span class="devtools-kv-key">Errors:</span> ${(result.errors || []).length}</div>
            <div class="devtools-kv"><span class="devtools-kv-key">Warnings:</span> ${(result.warnings || []).length}</div>
            <div class="devtools-kv"><span class="devtools-kv-key">Auto-Fixes:</span> ${(result.autoFixes || []).length}</div>
            <p class="devtools-hint">Use <strong>Step Through</strong> to advance through individual trace events.</p>
        </div>`;
}

// ══════════════════════════════════════════════════════════════
// EXECUTION TRACE — Built from REAL AST + runtime output
// ══════════════════════════════════════════════════════════════

function _buildExecutionTrace(result, stdout) {
    const container = document.getElementById('devtools-exec-trace');
    if (!container || !result || !result.ast || !result.ast.body) return;

    const steps = [];
    let stepNum = 1;
    const outputLines = (stdout || '').split('\n').filter(l => l.length > 0);
    let outputIdx = 0;
    const varState = {};

    function traceNode(node) {
        if (!node) return;
        const step = { num: stepNum++, line: node.line, type: node.type, vars: { ...varState }, output: null, condition: null };

        switch (node.type) {
            case 'DeclareStatement':
                step.description = `DECLARE ${node.id} AS ${node.varType}`;
                varState[node.id] = node.varType === 'INTEGER' ? 0 : node.varType === 'STRING' ? '""' : node.varType === 'ARRAY' ? '[]' : 0;
                step.vars = { ...varState };
                break;
            case 'AssignmentStatement':
                step.description = `SET ${node.id} TO <expr>`;
                varState[node.id] = '<assigned>';
                step.vars = { ...varState };
                break;
            case 'PrintStatement':
                step.description = `DISPLAY <expr>`;
                if (outputIdx < outputLines.length) {
                    step.output = outputLines[outputIdx++];
                }
                break;
            case 'InputStatement':
                step.description = node.prompt && node.prompt.length
                    ? `INPUT WITH PROMPT "${node.prompt[0].value}", ${node.id}`
                    : `INPUT ${node.id}`;
                varState[node.id] = '<input>';
                step.vars = { ...varState };
                break;
            case 'IfStatement':
                step.description = `IF <condition> THEN`;
                step.condition = { expression: '<condition>', result: 'evaluated' };
                break;
            case 'WhileStatement':
                step.description = `WHILE <condition> DO`;
                step.condition = { expression: '<condition>', result: 'evaluated' };
                break;
            case 'ForStatement':
                step.description = `FOR ${node.iterator || 'i'} FROM <start> TO <end>`;
                varState[node.iterator || 'i'] = '<loop>';
                step.vars = { ...varState };
                break;
            default:
                step.description = node.type;
        }

        steps.push(step);

        // Recurse into body
        if (node.body) node.body.forEach(n => traceNode(n));
        if (node.elseBody) node.elseBody.forEach(n => traceNode(n));
    }

    for (const node of result.ast.body) {
        traceNode(node);
    }

    if (steps.length === 0) {
        container.innerHTML = '<div class="devtools-idle-message"><p>No traceable steps.</p></div>';
        return;
    }

    container.innerHTML = steps.map(s => {
        let html = `<div class="devtools-trace-step">
            <div class="trace-step-num">STEP ${String(s.num).padStart(2, '0')}</div>
            <div class="trace-step-line">Line: ${s.description}</div>`;
        if (s.condition) html += `<div class="trace-step-condition">Condition: ${s.condition.expression} → ${s.condition.result}</div>`;
        if (s.output !== null) html += `<div class="trace-step-output">Output: <code>${_esc(s.output)}</code></div>`;
        html += `<div class="trace-step-vars">Variables: ${Object.entries(s.vars).map(([k, v]) => `${k} = ${v}`).join(', ') || '(none)'}</div>`;
        html += '</div>';
        return html;
    }).join('');
}

// ══════════════════════════════════════════════════════════════
// RAW JSON — Unmodified internal data
// ══════════════════════════════════════════════════════════════

function _updateRawJSON(result, runtimeData) {
    const safeStringify = (obj) => {
        try { return JSON.stringify(obj, null, 2); }
        catch { return '(circular or too large)'; }
    };

    _setText('devtools-raw-tokens', safeStringify(result.tokens));
    _setText('devtools-raw-ast', safeStringify(result.ast));
    _setText('devtools-raw-symtable', safeStringify(result.symbolTable));

    // Remove very large fields for the result view
    const resultCopy = { ...result };
    delete resultCopy.tokens;
    delete resultCopy.ast;
    _setText('devtools-raw-result', safeStringify(resultCopy));

    _setText('devtools-raw-runtime', safeStringify(runtimeData || devToolsState.runtimeResult || '(not yet executed)'));
    _setText('devtools-raw-events', safeStringify(devToolsState.simulationEvents && devToolsState.simulationEvents.length
        ? devToolsState.simulationEvents
        : devToolsState.stepEvents));
    // The trace envelope carries the Python source map and the truncation budget.
    _setText('devtools-raw-metrics', safeStringify(result.metrics));
}

// ══════════════════════════════════════════════════════════════
// UTILITY
// ══════════════════════════════════════════════════════════════

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
/* ============================================================
   COMPILER PIPELINE SIMULATION (devtools Simulation tab)
   Admin-only views inside Developer Options built exclusively
   from REAL compiler data:
     - Control Flow Graph        derived from the parsed AST
     - SDT table                 AST node -> generated Python
     - NLP mapping diff          original vs real mappedCode
     - Event ledger              real simulation-trace events
     - Step controller           advances over real trace events
     - Grade verdict             real stdout vs admin expected output
     - Stage duration bars       real compiler metrics
   No values are fabricated and no compiler logic is duplicated.
   ============================================================ */

const DEV_SIM_STAGES = [
    'PREPROCESSING', 'NLP_MAPPING', 'LEXICAL_ANALYSIS', 'SYNTAX_ANALYSIS',
    'SEMANTIC_ANALYSIS', 'CODE_GENERATION', 'EXECUTION', 'VALIDATION_REFINEMENT'
];

// ══════════════════════════════════════════════════════════════
// SIMULATION TRACE ADAPTER
// The Simulation tab predates src/compiler/simulation-tracer.js and
// was written against the older CompilerTrace event shape
// ({type, stage, status, data, timeISO}). The tracer emits
// {seq, stage, type, ts, line, column, payload, snapshot?} instead,
// so its events are translated here once, at the boundary. Nothing
// below this adapter knows which producer it is reading.
// ══════════════════════════════════════════════════════════════

// Ledger vocabulary is fixed by the #sim-ledger-status filter options.
const SIM_STATUS_OK = 'SUCCESS';
const SIM_STATUS_RUNNING = 'RUNNING';
const SIM_STATUS_WARNING = 'WARNING';
const SIM_STATUS_ERROR = 'ERROR';

// Tracer event types that are not ordinary progress.
const SIM_ERROR_TYPES = {
    TOKEN_REJECTED: true,
    BLOCK_MISMATCH: true,
    DIAGNOSTIC_EMITTED: true
};
const SIM_WARNING_TYPES = {
    TYPE_WARNING: true,
    TRACE_TRUNCATED: true
};

function _simEventStatus(type, payload) {
    if (type === 'STAGE_START') return SIM_STATUS_RUNNING;
    if (type === 'STAGE_END') return SIM_STATUS_OK;
    if (SIM_WARNING_TYPES[type]) return SIM_STATUS_WARNING;
    if (SIM_ERROR_TYPES[type]) {
        // A diagnostic only fails the run when the compiler called it an error.
        if (type === 'DIAGNOSTIC_EMITTED' && payload && payload.severity) {
            return String(payload.severity).toLowerCase() === 'error' ? SIM_STATUS_ERROR : SIM_STATUS_WARNING;
        }
        return SIM_STATUS_ERROR;
    }
    return SIM_STATUS_OK;
}

function _normalizeSimulationEvent(ev) {
    const payload = (ev && typeof ev.payload === 'object' && ev.payload !== null) ? ev.payload : {};
    const status = _simEventStatus(ev.type, payload);
    // `data` keeps the historical field name: _simApplyStep reads data.line and
    // data.nodeType, and the ledger filter searches JSON.stringify(data).
    const data = Object.assign({}, payload);
    data.line = (typeof ev.line === 'number') ? ev.line : null;
    if (payload.nodeType == null && ev.type === 'NODE_CREATED' && payload.kind) data.nodeType = payload.kind;
    return {
        seq: ev.seq,
        stage: ev.stage,
        type: ev.type,
        status: status,
        line: data.line,
        column: (typeof ev.column === 'number') ? ev.column : null,
        // Tracer timestamps are monotonic ms, not wall-clock. timeISO is derived
        // for display only; the raw ts is preserved alongside it.
        timestamp: ev.ts,
        timeISO: new Date().toISOString(),
        data: data,
        payload: payload,
        snapshot: ev.snapshot || null
    };
}

function _normalizeSimulationEvents(events) {
    return (events || []).map(_normalizeSimulationEvent);
}

function _normalizeSimulationTrace(envelope) {
    if (!envelope || !Array.isArray(envelope.events)) return [];
    return _normalizeSimulationEvents(envelope.events);
}

// Prefers the genuine simulation trace; falls back to the legacy CompilerTrace
// stream so the tab still renders when tracing produced no events.
function _simEvents(state) {
    if (!state) return [];
    if (state.simulationEvents && state.simulationEvents.length) return state.simulationEvents;
    return state.stepEvents || [];
}

// ══════════════════════════════════════════════════════════════
// CONTROL FLOW GRAPH — derived node-for-node from the real AST
// ══════════════════════════════════════════════════════════════

function _buildCfgFromAst(ast) {
    const nodes = [{ id: 'n0', kind: 'entry', type: 'Entry', label: 'Entry', line: (ast && ast.line) || 1 }];
    const edges = [];
    let counter = 1;

    const nextId = function () { return 'n' + (counter++); };
    const push = function (from, to, label) { edges.push({ from: from, to: to, label: label || null }); };

    function newNode(kind, type, label, line) {
        const id = nextId();
        nodes.push({ id: id, kind: kind, type: type, label: label, line: line });
        return id;
    }

    function buildList(list) {
        if (!list || list.length === 0) return null;
        let first = null;
        let prevExit = null;
        for (const node of list) {
            const block = buildNode(node);
            if (!first) first = block;
            if (prevExit) push(prevExit, block.entry);
            prevExit = block.exit;
        }
        return { entry: first.entry, exit: prevExit };
    }

    function buildNode(node) {
        switch (node.type) {
            case 'IfStatement': {
                const decision = newNode('decision', 'IfStatement', 'IF ' + (node.line ? 'L' + node.line : ''), node.line);
                const merge = newNode('join', 'IfStatement', 'END IF', node.line);
                const thenBody = buildList(node.body);
                push(decision, thenBody ? thenBody.entry : merge, 'true');
                if (thenBody && thenBody.exit) push(thenBody.exit, merge);

                let elseIfHead = decision;
                for (const eif of node.elseIfs || []) {
                    const d2 = newNode('decision', 'IfStatement', 'ELSE IF', eif.line);
                    push(elseIfHead, d2, 'false');
                    const body = buildList(eif.body);
                    push(d2, body ? body.entry : merge, 'true');
                    if (body && body.exit) push(body.exit, merge);
                    elseIfHead = d2;
                }

                const elseBody = buildList(node.elseBody);
                if (elseBody && elseBody.entry) push(elseIfHead, elseBody.entry, 'false');
                else push(elseIfHead, merge, 'false');
                if (elseBody && elseBody.exit) push(elseBody.exit, merge);
                return { entry: decision, exit: merge };
            }
            case 'WhileStatement': {
                const decision = newNode('decision', 'WhileStatement', 'WHILE', node.line);
                const merge = newNode('join', 'WhileStatement', 'END WHILE', node.line);
                const body = buildList(node.body);
                push(decision, body ? body.entry : merge, 'true');
                if (body && body.exit) push(body.exit, decision);
                push(decision, merge, 'false');
                return { entry: decision, exit: merge };
            }
            case 'ForStatement':
            case 'ForEachStatement': {
                const decision = newNode('decision', node.type, 'FOR', node.line);
                const merge = newNode('join', node.type, 'END FOR', node.line);
                const body = buildList(node.body);
                push(decision, body ? body.entry : merge, 'true');
                if (body && body.exit) push(body.exit, decision);
                push(decision, merge, 'false');
                return { entry: decision, exit: merge };
            }
            case 'FunctionDef': {
                const fn = newNode('statement', 'FunctionDef', 'FUNCTION ' + node.name, node.line);
                const body = buildList(node.body);
                if (body && body.entry) push(fn, body.entry);
                return { entry: fn, exit: (body && body.exit) || fn };
            }
            default: {
                const s = newNode('statement', node.type, node.type, node.line);
                return { entry: s, exit: s };
            }
        }
    }

    const top = buildList(ast && ast.body);
    if (top) push('n0', top.entry);
    const exitId = newNode('exit', 'Exit', 'Exit', ast && ast.line);
    if (top && top.exit) push(top.exit, exitId);
    else push('n0', exitId);

    return { nodes: nodes, edges: edges };
}

// ══════════════════════════════════════════════════════════════
// NLP MAPPING DIFF — original pseudocode vs real mappedCode
// ══════════════════════════════════════════════════════════════

function _diffTokens(a, b) {
    const n = a.length;
    const m = b.length;
    const dp = Array.from({ length: n + 1 }, function () { return new Array(m + 1).fill(0); });
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const spans = [];
    let i = 0, j = 0;
    const flush = function (type, text) {
        const last = spans[spans.length - 1];
        if (last && last.type === type) last.text += text;
        else spans.push({ type: type, text: text });
    };
    while (i < n && j < m) {
        if (a[i] === b[j]) { flush('same', a[i] + ' '); i++; j++; }
        else if (dp[i + 1][j] >= dp[i][j + 1]) { flush('del', a[i] + ' '); i++; }
        else { flush('ins', b[j] + ' '); j++; }
    }
    while (i < n) { flush('del', a[i] + ' '); i++; }
    while (j < m) { flush('ins', b[j] + ' '); j++; }
    return spans;
}

function _buildNlpDiff(original, mapped) {
    const originalTokens = String(original || '').match(/\S+|\s+/g) || [];
    const mappedTokens = String(mapped || '').match(/\S+|\s+/g) || [];
    const spans = _diffTokens(originalTokens, mappedTokens);

    const originalLines = String(original || '').split('\n');
    const mappedLines = String(mapped || '').split('\n');
    const changedLines = [];
    for (let k = 0; k < mappedLines.length; k++) {
        const left = (originalLines[k] || '').trim();
        const right = (mappedLines[k] || '').trim();
        if (left !== right) changedLines.push({ line: k + 1, original: left, mapped: right });
    }

    return {
        changed: String(original) !== String(mapped),
        spans: spans,
        changedLines: changedLines,
        original: String(original || ''),
        mapped: String(mapped || '')
    };
}

// ══════════════════════════════════════════════════════════════
// SDT TABLE — each row pairs a real AST node with the real
// generated Python produced for it by CodeGenerator.
// ══════════════════════════════════════════════════════════════

const DEV_SIM_SDT_ACTIONS = {
    DeclareStatement: 'emit a pseudocode comment then "id = <default>" initialized by the declared type',
    AssignmentStatement: 'translate the expression tokens to Python and emit "id = <expr>"',
    ArrayAssignStatement: 'translate index and value, emit "id[<index>] = <expr>"',
    PrintStatement: 'smart-print the parsed expression and emit "print(<expr>)"',
    InputStatement: 'emit input(<prompt>); wrap with int()/float() when explicitly numeric, otherwise _pseudopy_input_cast()',
    IfStatement: 'emit "if <condition>:" and visit the THEN body at +1 indent; ELSE IF maps to "elif", ELSE maps to "else"',
    ElseIfHead: 'emit "elif <condition>:" then visit the branch body at +1 indent',
    WhileStatement: 'emit "while <condition>:" and visit the body at +1 indent',
    ForStatement: 'bind inclusive FOR bounds once through _pseudopy_range() and emit "for <iterator> in _pseudopy_range(...):"',
    ForEachStatement: 'emit "for <iterator> in <iterable>:" then visit the body at +1 indent',
    FunctionDef: 'emit "def <name>(<params>):" then visit the body at +1 indent',
    CallStatement: 'emit "<name>(<args parsed as a call>)"',
    ReturnStatement: 'emit "return <expr>"',
    IncDecStatement: 'emit "id += 1" for INCREMENT or "id -= 1" for DECREMENT',
    AppendStatement: 'emit "<target>.append(<value>)"',
    ArrayDeclareStatement: 'emit <default> array initialization from the declared type'
};

function _sdtPseudoLabel(node) {
    switch (node.type) {
        case 'DeclareStatement': return 'DECLARE ' + node.id + ' AS ' + node.varType;
        case 'AssignmentStatement': return 'SET ' + node.id + ' TO <expr>';
        case 'ArrayAssignStatement': return 'SET ' + node.id + '[<index>] TO <expr>';
        case 'PrintStatement': return 'DISPLAY <expr>';
        case 'InputStatement': return 'INPUT ' + node.id;
        case 'IfStatement': return 'IF <condition> THEN';
        case 'WhileStatement': return 'WHILE <condition> DO';
        case 'ForStatement': return 'FOR ' + node.iterator + ' FROM <start> TO <end>';
        case 'ForEachStatement': return 'FOR EACH ' + node.iterator + ' IN <list>';
        case 'FunctionDef': return 'FUNCTION ' + node.name + '(<params>)';
        case 'CallStatement': return 'CALL ' + node.name + '(<args>)';
        case 'ReturnStatement': return 'RETURN <expr>';
        case 'IncDecStatement': return node.id + (node.direction > 0 ? ' INCREMENT' : ' DECREMENT');
        case 'AppendStatement': return 'APPEND <value> TO ' + node.target;
        default: return node.type;
    }
}

function _sdtNodeAction(node) {
    if (node.type === 'IfStatement' || node.type === 'WhileStatement' || node.type === 'ForStatement' ||
        node.type === 'ForEachStatement' || node.type === 'FunctionDef') {
        return DEV_SIM_SDT_ACTIONS[node.type];
    }
    return DEV_SIM_SDT_ACTIONS[node.type] || 'visit the AST node and emit its Python translation';
}

function _buildSdtRows(ast, symbolTable) {
    const rows = [];
    let num = 1;
    const gen = new CodeGenerator(new Map(Object.entries(symbolTable || {})));

    const visit = function (nodes, inFunction) {
        if (!nodes) return;
        for (const node of nodes) {
            gen.lines = [];
            gen.indentLevel = 0;
            gen.visitNode(node);
            rows.push({
                num: num++,
                line: node.line,
                nodeType: node.type,
                pseudo: _sdtPseudoLabel(node),
                action: _sdtNodeAction(node),
                python: gen.lines.join('\n')
            });
            if (node.body) visit(node.body, inFunction || node.type === 'FunctionDef');
            for (const branch of node.elseIfs || []) {
                gen.lines = [];
                gen.indentLevel = 0;
                gen.visitNode({ type: 'IfStatement', condition: branch.condition, body: branch.body });
                rows.push({
                    num: num++,
                    line: branch.line,
                    nodeType: 'ElseIfHead',
                    pseudo: 'ELSE IF <condition> THEN',
                    action: DEV_SIM_SDT_ACTIONS.ElseIfHead,
                    python: gen.lines.join('\n')
                });
                visit(branch.body, inFunction);
            }
            if (node.elseBody) visit(node.elseBody, inFunction);
        }
    };

    visit(ast && ast.body, false);
    return rows;
}

// ══════════════════════════════════════════════════════════════
// EVENT LEDGER FILTERS — real CompilerTrace events
// ══════════════════════════════════════════════════════════════

function _filterSimEvents(events, filters) {
    filters = filters || {};
    const stage = String(filters.stage || '');
    const status = String(filters.status || '');
    const type = String(filters.type || '');
    const search = String(filters.search || '').toLowerCase();

    return (events || []).filter(function (ev) {
        if (stage && ev.stage !== stage) return false;
        if (status && ev.status !== status) return false;
        if (type && ev.type !== type) return false;
        if (search) {
            const haystack = (ev.type + ' ' + ev.stage + ' ' + ev.status + ' ' + JSON.stringify(ev.data || {})).toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        return true;
    });
}

// ══════════════════════════════════════════════════════════════
// STEP CONTROLLER — advances over the real trace events
// ══════════════════════════════════════════════════════════════

function _simCurrentEvent(state) {
    return _simEvents(state)[state.simulationStepIndex] || null;
}

function _simStepForward(state) {
    const events = _simEvents(state);
    if (events.length === 0) return null;
    state.simulationStepIndex = Math.min((state.simulationStepIndex == null ? -1 : state.simulationStepIndex) + 1, events.length - 1);
    return events[state.simulationStepIndex];
}

function _simStepBack(state) {
    const events = _simEvents(state);
    if (events.length === 0) return null;
    state.simulationStepIndex = Math.max((state.simulationStepIndex == null ? 0 : state.simulationStepIndex) - 1, 0);
    return events[state.simulationStepIndex];
}

function _simStepBegin(state) {
    const events = _simEvents(state);
    if (events.length === 0) return null;
    state.simulationStepIndex = 0;
    return events[0];
}

function _simStepEnd(state) {
    const events = _simEvents(state);
    if (events.length === 0) return null;
    state.simulationStepIndex = events.length - 1;
    return events[state.simulationStepIndex];
}

// ══════════════════════════════════════════════════════════════
// GRADE VERDICT — real stdout vs the admin-provided expected output
// ══════════════════════════════════════════════════════════════

function _simGradeVerdict(transcript, expectedOutput) {
    if (!expectedOutput || !String(expectedOutput).trim()) {
        return { verdict: 'undetermined', expected: '', actual: '', reason: 'No expected output set.' };
    }
    const stdout = (transcript || [])
        .filter(function (e) { return e.kind === 'stdout'; })
        .map(function (e) { return String(e.text); })
        .join('');
    const actual = stdout.trim();
    const expected = String(expectedOutput).trim();
    const matched = actual === expected;
    return {
        verdict: matched ? 'PASS' : 'FAIL',
        expected: expected,
        actual: actual,
        reason: matched ? 'stdout matches the expected output.' : 'stdout differs from the expected output.'
    };
}

// Display-only two-decimal formatting of a real numeric grade. Returns the
// input unchanged when it is not a finite number, so values are never altered.
function _simFormatGrade(value) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric.toFixed(2);
    return String(value);
}

// ══════════════════════════════════════════════════════════════
// METRICS CHART — real stage durations
// ══════════════════════════════════════════════════════════════

function _simMetricsChart(result) {
    const m = (result && result.metrics) || {};
    const stages = [
        { key: 'lexTime', label: 'Lexical' },
        { key: 'parseTime', label: 'Syntax' },
        { key: 'semanticTime', label: 'Semantic' },
        { key: 'codeGenTime', label: 'Code Gen' }
    ];
    const total = Number(m.totalTime);
    const safeTotal = Number.isFinite(total) && total > 0 ? total : 1;
    return stages.map(function (s) {
        const ms = Number(m[s.key]);
        const value = Number.isFinite(ms) ? ms : 0;
        return { key: s.key, label: s.label, ms: value, total: value, pct: Math.max(1, Math.round((value / safeTotal) * 100)) };
    });
}

function _simStageStatuses(events) {
    const byStage = {};
    for (const ev of events || []) {
        byStage[ev.stage] = ev.status;
    }
    return DEV_SIM_STAGES.map(function (stage) {
        return { stage: stage, status: byStage[stage] || 'IDLE' };
    });
}

// ══════════════════════════════════════════════════════════════
// DOM RENDERERS
// ══════════════════════════════════════════════════════════════

let _simPlayTimer = null;

function _simEventKey(ev) {
    return ev.type + ':' + ev.stage + ':' + ev.status + ':' + (ev.timestamp || ev.timeISO || ev.time || '');
}

function _renderSimCfg(ast) {
    const container = document.getElementById('sim-cfg');
    if (!container) return;
    if (!ast || !ast.body || ast.body.length === 0) {
        container.innerHTML = '<div class="devtools-idle-message"><p>Run the pipeline to build the control flow graph from the real AST.</p></div>';
        return;
    }
    const graph = _buildCfgFromAst(ast);
    const box = function (node) {
        const cls = 'sim-cfg-node sim-cfg-' + node.kind;
        return '<div class="' + cls + '" data-cfg-id="' + node.id + '" data-cfg-type="' + node.type + '" data-cfg-line="' + (node.line || '') + '"><span class="sim-cfg-label">' + _esc(node.label) + '</span></div>';
    };
    let html = '<div class="sim-cfg-graph">';
    html += box(graph.nodes[0]);
    for (const edge of graph.edges) {
        const url = 'url(#simArrow)';
        html += '<svg class="sim-cfg-edge" viewBox="0 0 100 24" aria-hidden="true"><defs><marker id="simArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" class="sim-cfg-arrowhead" /></marker></defs><line x1="4" y1="12" x2="90" y2="12" stroke="currentColor" marker-end="' + url + '" /></svg>';
        const target = graph.nodes.find(function (n) { return n.id === edge.to; });
        html += '<div class="sim-cfg-edge-wrap" data-edge-from="' + edge.from + '" data-edge-to="' + edge.to + '" data-edge-label="' + (edge.label || '') + '">' + box(target) + (edge.label ? '<span class="sim-cfg-edge-label">' + edge.label + '</span>' : '') + '</div>';
    }
    const exit = graph.nodes[graph.nodes.length - 1];
    if (exit.kind === 'exit') html += box(exit);
    html += '</div>';
    container.innerHTML = html;
}

function _renderSimSdt(ast, symbolTable) {
    const tbody = document.getElementById('sim-sdt-tbody');
    if (!tbody) return;
    const rows = _buildSdtRows(ast, symbolTable);
    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="devtools-empty">Run the pipeline to build the SDT table from the real AST.</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(function (r) {
        return '<tr class="sim-sdt-row" data-sdt-num="' + r.num + '" data-sdt-type="' + r.nodeType + '" data-sdt-line="' + (r.line || '') + '">' +
            '<td>' + r.num + '</td>' +
            '<td>' + (r.line || '—') + '</td>' +
            '<td><span class="ast-type">' + r.nodeType + '</span></td>' +
            '<td><code>' + _esc(r.pseudo) + '</code></td>' +
            '<td>' + _esc(r.action) + '</td>' +
            '<td><pre class="devtools-trans-python">' + _esc(r.python) + '</pre></td>' +
            '</tr>';
    }).join('');
}

function _renderSimNlp(original, mapped) {
    const metaEl = document.getElementById('sim-nlp-meta');
    const diffEl = document.getElementById('sim-nlp-diff');
    const originalEl = document.getElementById('sim-nlp-original');
    const mappedEl = document.getElementById('sim-nlp-mapped');
    if (!metaEl || !diffEl) return;
    if (!original || !mapped) {
        metaEl.textContent = 'Run the pipeline to compare the original pseudocode with the NLP-mapped source.';
        diffEl.innerHTML = '';
        return;
    }
    if (originalEl) originalEl.textContent = original;
    if (mappedEl) mappedEl.textContent = mapped;

    const diff = _buildNlpDiff(original, mapped);
    const renderSpan = function (span) {
        if (span.type === 'same') return '<span class="sim-nlp-same">' + _esc(span.text) + '</span>';
        if (span.type === 'del') return '<span class="sim-nlp-del">' + _esc(span.text) + '</span>';
        return '<span class="sim-nlp-ins">' + _esc(span.text) + '</span>';
    };
    diffEl.innerHTML = diff.changedLines.length > 0
        ? '<details open><summary>' + diff.changedLines.length + ' normalized line(s); ' + diff.changedLines.length + ' of ' + String(mapped).split('\n').length + ' changed</summary><div class="sim-nlp-word-diff">' +
          diff.spans.map(renderSpan).join('') +
          '</div><ul class="sim-nlp-linelist">' +
          diff.changedLines.map(function (c) {
              return '<li><span class="sim-nlp-lineno">L' + c.line + '</span><code>' + _esc(c.original) + '</code> → <code>' + _esc(c.mapped) + '</code></li>';
          }).join('') + '</ul></details>'
        : '<div class="sim-nlp-word-diff">' + diff.spans.map(renderSpan).join('') + '</div>';
    metaEl.textContent = diff.changed
        ? 'NLP normalized the source (' + diff.changedLines.length + ' line(s) affected).'
        : 'NLP mapping produced no changes for this program.';
}

// ══════════════════════════════════════════════════════════════
// CFG → AST → SDT WALKTHROUGH (dedicated DevTools "CFG → AST → SDT" tab)
//
// One ordered step list, derived entirely from the real AST and the real
// Python source map. Each step carries the grammar production that
// recognized the construct, the AST node that recognition produced, and the
// Python line(s) the SDT emitted for that node. Because every step carries
// the same key (nodeType + line) in all three columns, the transport moves
// them in lockstep. Nothing is fabricated: a node with no attributed Python
// line shows none rather than a guess, and synthetic helper lines are never
// attributed to a user construct.
// ══════════════════════════════════════════════════════════════

// Productions mirror the recursive-descent parseX() methods in parser.js and
// the grammar documented in the manuscript. Derived at read time from the real
// node type; the parser is never re-run and no production is invented.
const DEV_WALK_PRODUCTIONS = {
    Program: 'Program → BEGIN StatementList END',
    DeclareStatement: 'Statement → DECLARE id AS Type',
    AssignmentStatement: 'Statement → SET id TO Expression',
    ArrayAssignStatement: 'Statement → SET id [ Expression ] TO Expression',
    PrintStatement: 'Statement → DISPLAY Expression',
    InputStatement: 'Statement → INPUT id [ WITH PROMPT "text" ]',
    IfStatement: 'Statement → IF Expression THEN Block { ELSE IF Expression THEN Block } [ ELSE Block ] END IF',
    ElseIfHead: 'Statement → ELSE IF Expression THEN Block',
    WhileStatement: 'Statement → WHILE Expression DO Block END WHILE',
    ForStatement: 'Statement → FOR id FROM Expression TO Expression [ STEP Expression ] DO Block END FOR',
    ForEachStatement: 'Statement → FOR EACH id IN Expression DO Block END FOR',
    FunctionDef: 'Statement → FUNCTION id ( Params ) Block END FUNCTION',
    ReturnStatement: 'Statement → RETURN Expression',
    CallStatement: 'Statement → CALL id ( Arguments )',
    IncDecStatement: 'Statement → INCREMENT id | DECREMENT id',
    AppendStatement: 'Statement → APPEND Expression TO id'
};

function _walkProduction(nodeType) {
    return DEV_WALK_PRODUCTIONS[nodeType] || ('Statement → ' + nodeType);
}

// Attribute real emitted Python lines to the node that owns them. The synthetic
// helper preambles are excluded. An `elif` line is emitted with its branch
// object (which has no `.type`), so a null nodeType is accepted when the source
// line matches — this keeps ELSE IF in lockstep without altering the generator.
function _walkPythonText(sourceMap, nodeType, line) {
    if (!sourceMap || line == null) return [];
    return sourceMap.filter(function (entry) {
        return !entry.synthetic && entry.sourceLine === line &&
            (entry.nodeType === nodeType || entry.nodeType == null);
    }).map(function (entry) { return entry.text; });
}

function _buildWalkSteps(ast, sourceMap) {
    const steps = [];
    if (!ast) return steps;
    let num = 1;
    const map = sourceMap || [];

    const push = function (nodeType, line, depth, pseudo) {
        steps.push({
            num: num++,
            line: (line == null ? null : line),
            nodeType: nodeType,
            depth: depth,
            production: _walkProduction(nodeType),
            pseudo: pseudo || '',
            python: _walkPythonText(map, nodeType, line)
        });
    };

    push('Program', ast.line || null, 0, 'BEGIN … END');

    const visit = function (nodes, depth) {
        if (!nodes) return;
        for (const node of nodes) {
            push(node.type, node.line, depth, _sdtPseudoLabel(node));
            if (node.body) visit(node.body, depth + 1);
            for (const branch of node.elseIfs || []) {
                push('ElseIfHead', branch.line, depth, 'ELSE IF <condition> THEN');
                visit(branch.body, depth + 1);
            }
            if (node.elseBody) visit(node.elseBody, depth + 1);
        }
    };
    visit(ast.body, 1);
    return steps;
}

let _walkPlayTimer = null;

function _renderSimWalk(steps, original, state) {
    const cfgEl = document.getElementById('sim-walk-cfg');
    const astEl = document.getElementById('sim-walk-ast');
    const sdtEl = document.getElementById('sim-walk-sdt');
    const cursorEl = document.getElementById('sim-walk-cursor');
    const countEl = document.getElementById('sim-walk-count');

    if (state) {
        state.walkSteps = steps || [];
        state.walkStepIndex = -1;
    }
    // A new run supersedes any autoplay loop still advancing the old steps.
    if (_walkPlayTimer) {
        clearInterval(_walkPlayTimer);
        _walkPlayTimer = null;
    }
    if (!cfgEl && !astEl && !sdtEl) return;

    const idle = '<div class="devtools-idle-message"><p>Run the pipeline to move one program through grammar recognition, the AST, and SDT code generation.</p></div>';

    if (!steps || steps.length === 0) {
        if (cfgEl) cfgEl.innerHTML = idle;
        if (astEl) astEl.innerHTML = idle;
        if (sdtEl) sdtEl.innerHTML = idle;
        if (cursorEl) cursorEl.innerHTML = idle;
        if (countEl) countEl.textContent = 'no steps';
        _simUpdateWalkTransport(false);
        return;
    }

    const indent = function (depth) { return 'style="padding-left:' + (depth * 14) + 'px"'; };
    // A real <button> rather than a div imitating one: focusability,
    // Enter/Space activation and the non-selectable chrome rules then come
    // from the platform instead of inline key handlers.
    const row = function (step, inner) {
        return '<button type="button" class="sim-walk-row"' +
            ' data-walk-num="' + step.num + '"' +
            ' data-walk-line="' + (step.line == null ? '' : step.line) + '"' +
            ' onclick="devToolsWalkGoto(' + step.num + ')"' +
            ' aria-label="Step ' + step.num + ': ' + _esc(step.nodeType) + '" ' +
            indent(step.depth) + '>' + inner + '</button>';
    };

    if (cfgEl) {
        cfgEl.innerHTML = steps.map(function (s) {
            return row(s, '<code class="sim-walk-prod">' + _esc(s.production) + '</code>');
        }).join('');
    }
    if (astEl) {
        astEl.innerHTML = steps.map(function (s) {
            return row(s,
                '<span class="sim-walk-lineno">' + (s.line == null ? '—' : 'L' + s.line) + '</span>' +
                '<span class="ast-type">' + _esc(s.nodeType) + '</span>' +
                (s.pseudo ? '<span class="sim-walk-pseudo">' + _esc(s.pseudo) + '</span>' : ''));
        }).join('');
    }
    if (sdtEl) {
        sdtEl.innerHTML = steps.map(function (s) {
            const body = s.python.length
                ? '<pre class="sim-walk-python">' + _esc(s.python.join('\n')) + '</pre>'
                : '<span class="sim-walk-none">— no Python attributed to this node —</span>';
            return row(s, body);
        }).join('');
    }
    if (cursorEl) {
        const lines = String(original || '').split('\n');
        cursorEl.innerHTML = lines.map(function (text, i) {
            return '<div class="sim-walk-source-line" data-walk-line="' + (i + 1) + '">' +
                '<span class="sim-walk-source-no">' + (i + 1) + '</span><code>' + _esc(text) + '</code></div>';
        }).join('');
    }
    if (countEl) countEl.textContent = steps.length + ' step(s)';
    _simUpdateWalkTransport(true);
}

function _simClearWalkHighlights() {
    document.querySelectorAll('.sim-walk-row.sim-walk-current').forEach(function (n) { n.classList.remove('sim-walk-current'); });
    document.querySelectorAll('.sim-walk-source-line.sim-walk-current').forEach(function (n) { n.classList.remove('sim-walk-current'); });
}

function _simApplyWalkStep(step) {
    _simClearWalkHighlights();
    if (!step) return;
    document.querySelectorAll('.sim-walk-row[data-walk-num="' + step.num + '"]').forEach(function (n) {
        n.classList.add('sim-walk-current');
        if (typeof n.scrollIntoView === 'function') n.scrollIntoView({ block: 'nearest' });
    });
    if (step.line != null) {
        document.querySelectorAll('.sim-walk-source-line[data-walk-line="' + step.line + '"]').forEach(function (n) {
            n.classList.add('sim-walk-current');
        });
    }
}

function _simUpdateWalkTransport(enabled) {
    ['sim-walk-begin', 'sim-walk-back', 'sim-walk-play', 'sim-walk-fwd', 'sim-walk-end'].forEach(function (id) {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = !enabled;
    });
    const pause = document.getElementById('sim-walk-pause');
    if (pause) pause.disabled = true;
}

function devToolsWalkStepFwd() {
    devToolsWalkPause();
    const state = typeof devToolsState !== 'undefined' ? devToolsState : null;
    if (!state || !state.walkSteps || state.walkSteps.length === 0) return;
    state.walkStepIndex = Math.min((state.walkStepIndex == null ? -1 : state.walkStepIndex) + 1, state.walkSteps.length - 1);
    _simApplyWalkStep(state.walkSteps[state.walkStepIndex]);
}

function devToolsWalkStepBack() {
    devToolsWalkPause();
    const state = typeof devToolsState !== 'undefined' ? devToolsState : null;
    if (!state || !state.walkSteps || state.walkSteps.length === 0) return;
    state.walkStepIndex = Math.max((state.walkStepIndex == null ? 0 : state.walkStepIndex) - 1, 0);
    _simApplyWalkStep(state.walkSteps[state.walkStepIndex]);
}

function devToolsWalkStepBegin() {
    devToolsWalkPause();
    const state = typeof devToolsState !== 'undefined' ? devToolsState : null;
    if (!state || !state.walkSteps || state.walkSteps.length === 0) return;
    state.walkStepIndex = 0;
    _simApplyWalkStep(state.walkSteps[0]);
}

function devToolsWalkStepEnd() {
    devToolsWalkPause();
    const state = typeof devToolsState !== 'undefined' ? devToolsState : null;
    if (!state || !state.walkSteps || state.walkSteps.length === 0) return;
    state.walkStepIndex = state.walkSteps.length - 1;
    _simApplyWalkStep(state.walkSteps[state.walkStepIndex]);
}

function devToolsWalkGoto(num) {
    devToolsWalkPause();
    const state = typeof devToolsState !== 'undefined' ? devToolsState : null;
    if (!state || !state.walkSteps) return;
    const step = state.walkSteps.find(function (s) { return s.num === num; });
    if (!step) return;
    state.walkStepIndex = state.walkSteps.indexOf(step);
    _simApplyWalkStep(step);
}

function devToolsWalkPlay() {
    if (_walkPlayTimer) return;
    const state = typeof devToolsState !== 'undefined' ? devToolsState : null;
    if (!state || !state.walkSteps || state.walkSteps.length === 0) return;
    _walkPlayTimer = setInterval(function () {
        if (state.walkStepIndex >= state.walkSteps.length - 1) {
            devToolsWalkPause();
            return;
        }
        devToolsWalkStepFwd();
    }, 700);
    const playBtn = document.getElementById('sim-walk-play');
    if (playBtn) playBtn.disabled = true;
    const pauseBtn = document.getElementById('sim-walk-pause');
    if (pauseBtn) pauseBtn.disabled = false;
}

function devToolsWalkPause() {
    if (_walkPlayTimer) {
        clearInterval(_walkPlayTimer);
        _walkPlayTimer = null;
    }
    const playBtn = document.getElementById('sim-walk-play');
    if (playBtn) playBtn.disabled = false;
    const pauseBtn = document.getElementById('sim-walk-pause');
    if (pauseBtn) pauseBtn.disabled = true;
}

function devToolsWalkReset() {
    devToolsWalkPause();
    _simClearWalkHighlights();
    if (typeof devToolsState !== 'undefined') devToolsState.walkStepIndex = -1;
}

function devToolsSimPopulateFilters() {
    const events = _simEvents(typeof devToolsState !== 'undefined' ? devToolsState : null);
    const stageSel = document.getElementById('sim-ledger-stage');
    if (stageSel) {
        const stages = [];
        for (const ev of events) if (!stages.includes(ev.stage)) stages.push(ev.stage);
        stageSel.innerHTML = '<option value="">All Stages</option>' + stages.map(function (s) {
            return '<option value="' + s + '">' + s + '</option>';
        }).join('');
    }
    const typeSel = document.getElementById('sim-ledger-type');
    if (typeSel) {
        const types = [];
        for (const ev of events) if (!types.includes(ev.type)) types.push(ev.type);
        typeSel.innerHTML = '<option value="">All Types</option>' + types.map(function (t) {
            return '<option value="' + t + '">' + t + '</option>';
        }).join('');
    }
    devToolsSimFilterLedger();
}

function _renderSimLedger(events) {
    const container = document.getElementById('sim-ledger');
    if (!container) return;
    const filters = {
        stage: document.getElementById('sim-ledger-stage') ? document.getElementById('sim-ledger-stage').value : '',
        status: document.getElementById('sim-ledger-status') ? document.getElementById('sim-ledger-status').value : '',
        type: document.getElementById('sim-ledger-type') ? document.getElementById('sim-ledger-type').value : '',
        search: document.getElementById('sim-ledger-search') ? document.getElementById('sim-ledger-search').value : ''
    };
    const filtered = _filterSimEvents(events, filters);
    if (filtered.length === 0) {
        container.innerHTML = '<div class="devtools-idle-message"><p>' + (events.length ? 'No events match the current filters.' : 'No events recorded.') + '</p></div>';
        _simLedgerIndex = -1;
        return;
    }
    const html = filtered.map(function (ev, index) {
        const time = ev.timeISO ? ev.timeISO.split('T')[1].replace('Z', '') : '—';
        return '<div class="devtools-log-entry devtools-log-' + ev.status + '" data-ledger-key="' + _simEventKey(ev) + '">' +
            '<span class="devtools-log-time">' + time + '</span>' +
            '<span class="devtools-log-type">' + _esc(ev.type) + '</span>' +
            '<span class="devtools-log-stage">' + _esc(ev.stage) + '</span>' +
            '<span class="devtools-log-status">' + _esc(ev.status) + '</span>' +
            '</div>';
    }).join('');
    container.innerHTML = html;
}

function devToolsSimFilterLedger() {
    _renderSimLedger(_simEvents(typeof devToolsState !== 'undefined' ? devToolsState : null));
}

function _renderSimMetrics(result) {
    const container = document.getElementById('sim-metric-bars');
    if (!container) return;
    const chart = _simMetricsChart(result);
    if (chart.every(function (c) { return c.ms === 0; })) {
        container.innerHTML = '<div class="devtools-idle-message"><p>Run the pipeline to chart real compiler stage timings.</p></div>';
        return;
    }
    container.innerHTML = chart.map(function (c) {
        return '<div class="sim-bar-row" data-sim-bar="' + c.key + '">' +
            '<span class="sim-bar-label">' + c.label + '</span>' +
            '<span class="sim-bar-track"><span class="sim-bar-fill" style="width:' + c.pct + '%"></span></span>' +
            '<span class="sim-bar-value">' + c.ms.toFixed(3) + ' ms</span>' +
            '</div>';
    }).join('');
    const stagesEl = document.getElementById('sim-stage-statuses');
    if (stagesEl) {
        const events = _simEvents(typeof devToolsState !== 'undefined' ? devToolsState : null);
        stagesEl.innerHTML = _simStageStatuses(events)
            .map(function (s) { return '<span class="sim-stage-chip sim-stage-' + s.status.toLowerCase() + '">' + s.stage + ' · ' + s.status + '</span>'; })
            .join('');
    }
}

function _renderSimVerdict() {
    const chip = document.getElementById('sim-grade-chip');
    const detail = document.getElementById('sim-grade-detail');
    const expectedEl = document.getElementById('sim-expected-output');
    if (!chip || !detail) return;

    const expected = (typeof devToolsState !== 'undefined' && devToolsState.expectedOutput) ||
        (expectedEl ? expectedEl.value : '');
    if (expectedEl && !expectedEl.value) expectedEl.value = expected;
    const transcript = (typeof runtimeConsole !== 'undefined') ? runtimeConsole.transcript : [];
    const verdict = _simGradeVerdict(transcript, expected);
    const grade = (typeof runtimeConsole !== 'undefined' && runtimeConsole.gradeSummary)
        ? runtimeConsole.gradeSummary()
        : null;

    chip.textContent = verdict.verdict === 'undetermined' ? 'Not checked' : verdict.verdict;
    chip.className = 'sim-grade-chip sim-grade-' + verdict.verdict.toLowerCase();
    if (verdict.verdict === 'undetermined') {
        detail.textContent = 'Run the pipeline, then set an expected output to compare real stdout against it.';
    } else {
        detail.innerHTML = '<div class="devtools-kv"><span class="devtools-kv-key">Expected:</span> <code>' + _esc(verdict.expected) + '</code></div>' +
            '<div class="devtools-kv"><span class="devtools-kv-key">Actual:</span> <code>' + _esc(verdict.actual === '' ? '(no stdout)' : verdict.actual) + '</code></div>' +
            '<div class="devtools-kv"><span class="devtools-kv-key">Result:</span> ' + verdict.reason + '</div>' +
            (grade ? '<div class="devtools-kv"><span class="devtools-kv-key">Grade (formatted):</span> <code>' + _simFormatGrade(grade.value) + '</code></div>' : '');
    }
}

function devToolsSimSaveExpectedOutput() {
    const expectedEl = document.getElementById('sim-expected-output');
    if (expectedEl && typeof devToolsState !== 'undefined') {
        devToolsState.expectedOutput = expectedEl.value;
    }
    _renderSimVerdict();
    if (typeof showToast === 'function') showToast('Expected output saved for the verdict check.', 'success');
}

// STEP CONTROLLER DOM
function _simClearHighlights() {
    document.querySelectorAll('.sim-cfg-node').forEach(function (n) { n.classList.remove('sim-cfg-active'); });
    document.querySelectorAll('.sim-sdt-row').forEach(function (r) { r.classList.remove('sim-sdt-active'); });
    document.querySelectorAll('#sim-ledger .devtools-log-entry').forEach(function (r) { r.classList.remove('devtools-log-active'); });
}

function _simApplyStep(event) {
    _simClearHighlights();
    if (!event) return;

    const nodes = document.querySelectorAll('.sim-cfg-node');
    if (event.stage && nodes.length) {
        const stageNodes = Array.from(nodes).filter(function (n) {
            const type = n.getAttribute('data-cfg-type');
            const line = n.getAttribute('data-cfg-line');
            return (type === event.data.nodeType || type === event.type) &&
                (!line || String(line) === String(event.data.line));
        });
        if (stageNodes.length === 0 && event.data.nodeType) {
            Array.from(nodes).forEach(function (n) {
                if (n.getAttribute('data-cfg-type') === event.data.nodeType) n.classList.add('sim-cfg-active');
            });
        } else {
            stageNodes.forEach(function (n) { n.classList.add('sim-cfg-active'); });
        }
    }

    const sdtRows = document.querySelectorAll('.sim-sdt-row');
    if (event.data.nodeType) {
        Array.from(sdtRows).forEach(function (r) {
            const type = r.getAttribute('data-sdt-type');
            const line = r.getAttribute('data-sdt-line');
            if (type === event.data.nodeType && line === String(event.data.line)) r.classList.add('sim-sdt-active');
        });
    }

    const key = _simEventKey(event);
    const entries = document.querySelectorAll('#sim-ledger .devtools-log-entry');
    Array.from(entries).forEach(function (entry) {
        const matched = entry.getAttribute('data-ledger-key') === key;
        entry.classList.toggle('devtools-log-active', matched);
        if (matched) entry.scrollIntoView({ block: 'nearest' });
    });
}

function devToolsSimPlay() {
    if (_simPlayTimer) return;
    const step = (typeof devToolsState !== 'undefined') ? devToolsState : null;
    if (!step) return;
    if (typeof runtimeConsole !== 'undefined' && runtimeConsole.state === 'waiting-input') {
        if (typeof showToast === 'function') showToast('Waiting for input in the Runtime Console.', 'info');
        return;
    }
    _simPlayTimer = setInterval(function () {
        const events = _simEvents(devToolsState);
        const current = _simCurrentEvent(devToolsState);
        if (current && devToolsState.simulationStepIndex >= events.length - 1) {
            devToolsSimPause();
            if (typeof showToast === 'function') showToast('End of trace events.', 'info');
            return;
        }
        _simApplyStep(_simStepForward(devToolsState));
    }, 450);
    const playBtn = document.getElementById('sim-step-play');
    if (playBtn) playBtn.disabled = true;
    const pauseBtn = document.getElementById('sim-step-pause');
    if (pauseBtn) pauseBtn.disabled = false;
}

function devToolsSimPause() {
    if (_simPlayTimer) {
        clearInterval(_simPlayTimer);
        _simPlayTimer = null;
    }
    const playBtn = document.getElementById('sim-step-play');
    if (playBtn) playBtn.disabled = false;
    const pauseBtn = document.getElementById('sim-step-pause');
    if (pauseBtn) pauseBtn.disabled = true;
}

function devToolsSimStepFwd() {
    devToolsSimPause();
    _simApplyStep(_simStepForward(devToolsState));
}

function devToolsSimStepBack() {
    devToolsSimPause();
    _simApplyStep(_simStepBack(devToolsState));
}

function devToolsSimStepBegin() {
    devToolsSimPause();
    _simApplyStep(_simStepBegin(devToolsState));
}

function devToolsSimStepEnd() {
    devToolsSimPause();
    _simApplyStep(_simStepEnd(devToolsState));
}

function devToolsSimReset() {
    devToolsSimPause();
    _simClearHighlights();
    if (typeof devToolsState !== 'undefined') devToolsState.simulationStepIndex = -1;
    devToolsSimFilterLedger();
}

function _updateSimulation(result) {
    const ast = result && result.ast ? result.ast : null;
    _renderSimCfg(ast);
    _renderSimSdt(ast, (result && result.symbolTable) || {});
    const originalEl = document.getElementById('devtools-pseudocode');
    const original = originalEl ? originalEl.value : '';
    _renderSimNlp(original, (result && result.mappedCode) || '');
    _renderSimWalk(
        _buildWalkSteps(ast, (result && result.simulation && result.simulation.sourceMap) || []),
        original,
        (typeof devToolsState !== 'undefined') ? devToolsState : null
    );
    _renderSimMetrics(result);
    _renderSimVerdict();

    const events = _simEvents(typeof devToolsState !== 'undefined' ? devToolsState : null);
    devToolsSimPopulateFilters();
    _renderSimLedger(events);

    const hasEvents = events.length > 0;
    ['sim-step-play', 'sim-step-begin', 'sim-step-fwd', 'sim-step-back', 'sim-step-end'].forEach(function (id) {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = !hasEvents;
    });
}
// ============================================================
// DATABASE HEALTH PANEL — PseudoPy Developer Options
//
// Reports the live state of the pieces that are otherwise
// invisible: which project the browser is actually talking to,
// whether Firestore persistence engaged, whether Auth is
// attached, whether the offline queue is draining, and whether the
// server-side delete function is reachable.
//
// Read-only. It calls getters that already exist as shared globals
// (firestoreReady, firestoreInit, cloudAuthStatus, getSyncState,
// isFirestoreReachable, deletionServerAvailable) and never performs
// a write, a retry, or a re-auth.
// ============================================================

const DEVTOOLS_HEALTH_GROUPS = [
    {
        id: 'identity',
        title: 'Firebase Identity',
        rows: [
            {
                label: 'Active project',
                read: () => (typeof firebaseConfig !== 'undefined' && firebaseConfig.projectId) || '(not configured)',
                expect: () => (typeof firebaseConfig !== 'undefined' && firebaseConfig.projectId) || '(none)',
                check: () => !!(typeof firebaseConfig !== 'undefined' && firebaseConfig.projectId)
            },
            {
                label: 'Config source',
                read: () => (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__)
                    ? 'window.__FIREBASE_CONFIG__ override'
                    : 'bundled default (src/database/firebase.js)',
                check: () => true
            },
            {
                label: 'Initialized apps',
                read: () => (typeof firebase !== 'undefined' && firebase.apps) ? String(firebase.apps.length) : 'SDK unavailable',
                check: () => !!(typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length === 1)
            },
            {
                label: 'SDK modules loaded',
                read: () => ['app', 'firestore', 'auth', 'functions', 'app-check']
                    .filter(m => typeof firebase !== 'undefined' && firebase && firebase[m]).join(', ') || 'none',
                check: () => !!(typeof firebase !== 'undefined' && firebase && firebase.app && firebase.firestore && firebase.auth)
            }
        ]
    },
    {
        id: 'firestore',
        title: 'Firestore',
        rows: [
            {
                label: 'Instance ready',
                read: () => (typeof firestoreReady === 'function' && firestoreReady()) ? 'yes' : 'no',
                check: () => typeof firestoreReady === 'function' && firestoreReady()
            },
            {
                label: 'Firestore client cache',
                // The Firestore client cache is in-memory by design here; the
                // durable offline copy is the app's own IndexedDB store, shown
                // on the next row. So this is never a failure condition.
                read: () => {
                    if (typeof firestoreInit === 'undefined') return 'unknown';
                    return firestoreInit.localCache
                        + (firestoreInit.localCacheNote ? ' — ' + firestoreInit.localCacheNote : '');
                },
                check: () => typeof firestoreInit !== 'undefined' && firestoreInit.localCache !== 'unknown',
                warn: () => typeof firestoreInit === 'undefined'
                    || !firestoreInit.localCacheEngineConfigurable
            },
            {
                label: 'Cache engine configurable',
                // compat 10.12.0 exposes no cache configuration API, so this
                // reporting "no" is correct rather than a defect.
                read: () => (typeof firestoreInit !== 'undefined' && firestoreInit.localCacheEngineConfigurable)
                    ? 'yes (modular initializeFirestore detected)'
                    : 'no (compat SDK; only the deprecated db.enablePersistence() exists)',
                check: () => true
            },
            {
                label: 'Durable offline store',
                // This is the layer that actually survives a reload, so it is
                // the one that matters for the offline guarantees.
                read: () => {
                    if (typeof offlineIdbAvailable !== 'function') return 'unknown';
                    if (!offlineIdbAvailable()) return 'IndexedDB unavailable in this browser';
                    return typeof offlineDb !== 'undefined' && offlineDb
                        ? 'open'
                        : 'available, not yet opened';
                },
                check: () => typeof offlineIdbAvailable !== 'function' || offlineIdbAvailable(),
                warn: () => typeof offlineDb === 'undefined' || !offlineDb
            },
            {
                label: 'App Check',
                read: () => {
                    if (typeof firestoreInit === 'undefined') return 'unknown';
                    return firestoreInit.appCheck + (firestoreInit.appCheckReason ? ' — ' + firestoreInit.appCheckReason : '');
                },
                // Informational, not a failure: App Check stays off until a
                // reCAPTCHA v3 site key is registered in the console.
                warn: () => typeof firestoreInit !== 'undefined' && firestoreInit.appCheck !== 'active'
            }
        ]
    },
    {
        id: 'auth',
        title: 'Authentication',
        rows: [
            {
                label: 'Auth bridge',
                read: () => {
                    if (typeof cloudAuthStatus !== 'function') return 'unavailable';
                    const s = cloudAuthStatus();
                    return s.available ? s.state : 'unavailable';
                },
                check: () => typeof cloudAuthStatus === 'function' && cloudAuthStatus().available
            },
            {
                label: 'Session resolved',
                read: () => (typeof cloudAuthStatus === 'function' && cloudAuthStatus().resolved) ? 'yes' : 'no',
                check: () => typeof cloudAuthStatus === 'function' && cloudAuthStatus().resolved
            },
            {
                label: 'Signed-in uid',
                read: () => (typeof cloudAuthStatus === 'function' && cloudAuthStatus().uid) || '(anonymous)',
                // Anonymous is normal for this app: it authenticates in-app
                // against pseudopy_users, and the Auth bridge is best-effort.
                check: () => true
            },
            {
                label: 'Auth persistence',
                read: () => (typeof cloudAuthStatus === 'function' && cloudAuthStatus().persistence) || 'unknown',
                check: () => true
            }
        ]
    },
    {
        id: 'sync',
        title: 'Offline Queue & Sync',
        rows: [
            {
                label: 'Firestore reachable',
                read: () => (typeof isFirestoreReachable === 'function' ? (isFirestoreReachable() ? 'yes' : 'no') : 'unknown'),
                check: () => typeof isFirestoreReachable !== 'function' || isFirestoreReachable()
            },
            {
                label: 'Browser online',
                read: () => (typeof navigator !== 'undefined' && navigator.onLine) ? 'yes' : 'no',
                // navigator.onLine is famously unreliable; a mismatch here is
                // information, not a verdict.
                warn: () => typeof navigator !== 'undefined' && navigator.onLine === false
            },
            {
                label: 'Sync in progress',
                read: ctx => (ctx.queue && ctx.queue.syncInProgress) ? 'yes' : 'no',
                check: ctx => !!(ctx.queue && ctx.queue.syncInProgress)
            },
            {
                label: 'Pending mutations',
                read: ctx => (ctx.queue ? String(ctx.queue.pending) : 'unknown'),
                // Backlog is informational: a queued write is the app working
                // as designed while offline, not a fault.
                warn: ctx => !!(ctx.queue && ctx.queue.pending > 0)
            },
            {
                label: 'Failed mutations',
                read: ctx => (ctx.queue ? String(ctx.queue.failed) : 'unknown'),
                // A failed mutation will never drain on its own, so unlike the
                // pending backlog this is a real fault.
                check: ctx => !(ctx.queue && ctx.queue.failed > 0)
            },
            {
                label: 'Cloud circuit',
                read: () => {
                    if (typeof cloudRequestsAllowed === 'function' && !cloudRequestsAllowed()) {
                        return (typeof cloudCircuitError !== 'undefined' && cloudCircuitError)
                            ? 'open — ' + ((cloudCircuitError && cloudCircuitError.code) || 'reason unknown')
                            : 'open';
                    }
                    return 'closed';
                },
                check: () => !(typeof cloudRequestsAllowed === 'function' && !cloudRequestsAllowed())
            }
        ]
    },
    {
        id: 'server',
        title: 'Server Functions',
        rows: [
            {
                label: 'Functions SDK',
                read: () => (typeof firebase !== 'undefined' && firebase && typeof firebase.functions === 'function') ? 'loaded' : 'not loaded',
                check: () => typeof firebase !== 'undefined' && firebase && typeof firebase.functions === 'function'
            },
            {
                label: 'deleteStudentAccount callable',
                read: () => (typeof deletionServerAvailable === 'function' && deletionServerAvailable())
                    ? 'reachable'
                    : 'unavailable (client falls back to local-only deletion)',
                check: () => typeof deletionServerAvailable !== 'function' || deletionServerAvailable()
            },
            {
                label: 'Audit endpoint',
                read: () => 'see /api/health (server-side; not probed from the browser)',
                check: () => true
            }
        ]
    }
];

let devToolsHealthLastReport = null;

/**
 * Some sources are synchronous and some are not. getSyncState() is async
 * because it reads the mutation queue out of IndexedDB, so calling it here and
 * stringifying the result would render the literal text "[object Promise]"
 * and every comparison against it would be false. Each read is therefore
 * resolved before it is formatted.
 */
async function _devToolsHealthResolve(value) {
    if (typeof value !== 'function') return 'n/a';
    let out;
    try {
        out = value();
    } catch (e) {
        return 'error: ' + ((e && e.message) || e);
    }
    try {
        if (out && typeof out.then === 'function') out = await out;
    } catch (e) {
        return 'error: ' + ((e && e.message) || e);
    }
    return out === undefined || out === null || out === '' ? 'n/a' : String(out);
}

async function _devToolsHealthFlag(fn) {
    if (typeof fn !== 'function') return false;
    try {
        const out = fn();
        if (out && typeof out.then === 'function') return !!(await out);
        return !!out;
    } catch (e) {
        return false;
    }
}

/**
 * Read the whole sync queue once. The three queue rows below would otherwise
 * each open their own transaction, and they must agree with each other.
 */
async function _devToolsHealthQueueState() {
    if (typeof getSyncState !== 'function') return null;
    try {
        return await Promise.resolve(getSyncState());
    } catch (e) {
        return null;
    }
}

/** Collect every row once. Safe to call outside the DOM. */
async function collectDevToolsHealth() {
    const groups = [];
    let problems = 0;
    let advisories = 0;
    const queue = await _devToolsHealthQueueState();

    for (const group of DEVTOOLS_HEALTH_GROUPS) {
        const rows = [];
        for (const row of group.rows) {
            const context = { queue };
            const value = await _devToolsHealthResolve(() => row.read(context));
            const failed = row.check ? !(await _devToolsHealthFlag(() => row.check(context))) : false;
            const advisory = !failed && row.warn ? await _devToolsHealthFlag(() => row.warn(context)) : false;
            if (failed) problems++;
            if (advisory) advisories++;
            rows.push({
                label: row.label,
                value,
                status: failed ? 'fail' : advisory ? 'warn' : 'ok'
            });
        }
        groups.push({ id: group.id, title: group.title, rows });
    }

    return { groups, problems, advisories, at: new Date().toISOString() };
}

function devToolsHealthRender(report) {
    devToolsHealthLastReport = report;

    const summary = $id('devtools-health-summary');
    if (summary) {
        summary.textContent = report.problems === 0
            ? (report.advisories > 0
                ? report.advisories + ' advisory note(s), no failures'
                : 'All checks passed')
            : report.problems + ' check(s) need attention';
    }

    const grid = $id('devtools-health-grid');
    if (grid) {
        if (!report.groups.length) {
            grid.innerHTML = '<p class="devtools-health-empty">No checks registered.</p>';
        } else {
            grid.innerHTML = report.groups.map(group => (
                '<section class="devtools-health-group">'
                + '<h4>' + _devToolsHealthEscape(group.title) + '</h4>'
                + '<dl class="devtools-health-list">'
                + group.rows.map(row => (
                    '<div class="devtools-health-row is-' + row.status + '">'
                    + '<dt>' + _devToolsHealthEscape(row.label) + '</dt>'
                    + '<dd>' + _devToolsHealthEscape(row.value) + '</dd>'
                    + '</div>'
                )).join('')
                + '</dl></section>'
            )).join('');
        }
    }

    const json = $id('devtools-health-json');
    if (json) {
        json.textContent = JSON.stringify({
            generatedAt: report.at,
            problems: report.problems,
            advisories: report.advisories,
            groups: report.groups
        }, null, 2);
    }
}

function _devToolsHealthEscape(text) {
    return String(text === undefined || text === null ? '' : text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function devToolsHealthRefresh() {
    // Collection reads the mutation queue, so it resolves asynchronously. The
    // report is returned as a promise and callers that need the value must
    // await it.
    return collectDevToolsHealth().then(function (report) {
        devToolsHealthRender(report);
        return report;
    });
}

function devToolsHealthCopyReport() {
    if (devToolsHealthLastReport) {
        _devToolsHealthCopyPayload(JSON.stringify(devToolsHealthLastReport, null, 2));
        return;
    }
    // No report yet: take one first rather than copying an empty payload.
    devToolsHealthRefresh().then(function (report) {
        _devToolsHealthCopyPayload(JSON.stringify(report, null, 2));
    });
}

function _devToolsHealthCopyPayload(payload) {
    const fallback = () => {
        if (typeof showToast === 'function') showToast('Copy failed — the report is in the JSON panel below.', 'warning');
    };

    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(payload).then(
            () => { if (typeof showToast === 'function') showToast('Health report copied.', 'success'); },
            fallback
        );
        return;
    }
    fallback();
}

/**
 * Run the checks when the tab is first opened so the panel is never blank.
 * devToolsSwitchTab is convention-driven, so this only has to notice its own
 * tab id.
 */
function _devToolsHealthWatchTab() {
    if (_devToolsHealthWatchTab.__bound) return;
    _devToolsHealthWatchTab.__bound = true;
    document.addEventListener('click', function (event) {
        const btn = event.target && event.target.closest
            ? event.target.closest('#devtools-tab-bar .devtools-tab')
            : null;
        if (!btn || btn.getAttribute('data-tab') !== 'health') return;
        devToolsHealthRefresh();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _devToolsHealthWatchTab);
} else {
    _devToolsHealthWatchTab();
}
﻿const MetricsCore = {
  normalizeCode(code) {
    if (!code) return '';
    return code
      .split('\n')
      .map(line => line.replace(/\t/g, '    '))
      .map(line => {
        let stripped = line.replace(/#.*$/, '').trimEnd();
        const match = stripped.match(/^(\s*)(.*)/);
        if (!match) return stripped;
        const [, leading, rest] = match;
        const spaces = leading.length;
        const normalSpaces = Math.round(spaces / 4) * 4;
        return ' '.repeat(normalSpaces) + rest;
      })
      .filter(line => line.trim().length > 0)
      .join('\n')
      .trimEnd();
  },

  lineMetrics(gen, exp) {
    const normGen = this.normalizeCode(gen || '');
    const normExp = this.normalizeCode(exp || '');
    const g = normGen ? normGen.split('\n') : [];
    const e = normExp ? normExp.split('\n') : [];
    if (g.length === 0 && e.length === 0) {
      return { precision: 1, recall: 1, f1: 1, matched: 0, genLines: 0, expLines: 0 };
    }
    if (g.length === 0 || e.length === 0) {
      return { precision: 0, recall: 0, f1: 0, matched: 0, genLines: g.length, expLines: e.length };
    }
    const ef = {};
    const gf = {};
    for (const x of e) ef[x] = (ef[x] || 0) + 1;
    for (const x of g) gf[x] = (gf[x] || 0) + 1;
    let matched = 0;
    for (const k in gf) {
      if (ef[k]) matched += Math.min(gf[k], ef[k]);
    }
    const precision = matched / g.length;
    const recall = matched / e.length;
    const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    return { precision, recall, f1, matched, genLines: g.length, expLines: e.length };
  }
};
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MetricsCore;
}
if (typeof window !== 'undefined') {
  window.MetricsCore = MetricsCore;
}
/* ============================================================
   SOP 2 — statistics (pure, dependency-free, deterministic)

   Implements exactly what the SOP 2 report needs and nothing more:
   • wilson()        — Wilson score interval for a binomial proportion
   • mcnemarExact()  — exact (binomial) two-sided McNemar test for
                       paired pass/fail outcomes
   • wilcoxon()      — Wilcoxon signed-rank test for paired times
                       (exact for small n, normal approximation beyond)
   • median / quantile / iqr — order statistics for the timing report

   Usable from Node (`module.exports`) and the browser (`window.Sop2Stats`)
   exactly like src/research/line-metrics.js. No randomness, no I/O, no
   third-party code, so the numbers are reproducible across machines.
   ============================================================ */
(function (root) {
  'use strict';

  var Z_95 = 1.959963984540054;
  var SQRT2 = Math.sqrt(2);

  /* ---------- binomial helpers ---------- */

  function logChoose(n, k) {
    if (k < 0 || k > n) return -Infinity;
    if (k > n - k) k = n - k;
    var r = 0;
    for (var i = 1; i <= k; i++) r += Math.log(n - k + i) - Math.log(i);
    return r;
  }

  function binomPmf(k, n, p) {
    if (k < 0 || k > n) return 0;
    if (p === 0) return k === 0 ? 1 : 0;
    if (p === 1) return k === n ? 1 : 0;
    return Math.exp(logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
  }

  /* ---------- normal CDF (Zelen & Severo approximation, ~1e-7) ---------- */

  function erf(z) {
    var sign = z < 0 ? -1 : 1;
    var x = Math.abs(z);
    var p = 0.3275911;
    var a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
      a4 = -1.453152027, a5 = 1.061405429;
    var t = 1 / (1 + p * x);
    var y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
  }

  function normalCdf(z) {
    return 0.5 * (1 + erf(z / SQRT2));
  }

  /* ---------- Wilson score interval ---------- */

  /**
   * Wilson score interval for `successes` out of `n`.
   * @returns {{p:number, low:number, high:number, n:number, successes:number, z:number}}
   */
  function wilson(successes, n, z) {
    z = z || Z_95;
    n = n || 0;
    successes = successes || 0;
    if (n <= 0) return { p: 0, low: 0, high: 0, n: 0, successes: 0, z: z };
    var p = successes / n;
    var z2 = z * z;
    var denom = 1 + z2 / n;
    var centre = (p + z2 / (2 * n)) / denom;
    var margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denom;
    return {
      p: p,
      low: Math.max(0, centre - margin),
      high: Math.min(1, centre + margin),
      n: n,
      successes: successes,
      z: z
    };
  }

  /* ---------- McNemar exact test ---------- */

  /**
   * Exact two-sided McNemar test on the discordant pair counts.
   * `b` = cases where side A passed and side B failed;
   * `c` = cases where side A failed and side B passed.
   * p = 2 * P(X <= min(b,c)) with X ~ Binomial(b+c, 0.5), capped at 1.
   */
  function mcnemarExact(b, c) {
    b = b || 0;
    c = c || 0;
    var n = b + c;
    if (n === 0) return { b: b, c: c, n: 0, p: 1 };
    var k = Math.min(b, c);
    var tail = 0;
    for (var i = 0; i <= k; i++) tail += binomPmf(i, n, 0.5);
    return { b: b, c: c, n: n, p: Math.min(1, 2 * tail) };
  }

  /* ---------- order statistics ---------- */

  /** Sorted copy. */
  function sorted(values) {
    return values.slice().sort(function (a, b) { return a - b; });
  }

  /**
   * Linear-interpolation percentile (R type 7), 0 <= q <= 1.
   */
  function quantile(values, q) {
    var v = sorted(values);
    if (!v.length) return 0;
    if (v.length === 1) return v[0];
    var pos = (v.length - 1) * q;
    var lo = Math.floor(pos);
    var hi = Math.ceil(pos);
    if (lo === hi) return v[lo];
    return v[lo] + (v[hi] - v[lo]) * (pos - lo);
  }

  function median(values) { return quantile(values, 0.5); }

  /** Interquartile range = Q3 - Q1. */
  function iqr(values) { return quantile(values, 0.75) - quantile(values, 0.25); }

  function mean(values) {
    if (!values.length) return 0;
    var t = 0;
    for (var i = 0; i < values.length; i++) t += values[i];
    return t / values.length;
  }

  /** Descriptive timing summary used by timing.js. */
  function describe(values) {
    return {
      n: values.length,
      median: median(values),
      q1: quantile(values, 0.25),
      q3: quantile(values, 0.75),
      iqr: iqr(values),
      mean: mean(values),
      min: values.length ? sorted(values)[0] : 0,
      max: values.length ? sorted(values)[values.length - 1] : 0
    };
  }

  /* ---------- Wilcoxon signed-rank ---------- */

  /** Midranks (average ranks for ties) for an array of values. */
  function midranks(values) {
    var n = values.length;
    var order = values.map(function (v, i) { return { v: v, i: i }; });
    order.sort(function (a, b) { return a.v - b.v; });
    var ranks = new Array(n);
    var i = 0;
    while (i < n) {
      var j = i;
      while (j + 1 < n && order[j + 1].v === order[i].v) j++;
      var avg = (i + j + 2) / 2; // ranks are 1..n
      for (var k = i; k <= j; k++) ranks[order[k].i] = avg;
      i = j + 1;
    }
    return ranks;
  }

  /** Exact null distribution of W+ via subset-sum DP over the given ranks. */
  function exactWPlusDistribution(ranks) {
    var total = ranks.reduce(function (a, b) { return a + b; }, 0);
    var counts = new Array(total + 1);
    for (var i = 0; i <= total; i++) counts[i] = 0;
    counts[0] = 1;
    for (var r = 0; r < ranks.length; r++) {
      var w = ranks[r];
      for (var s = total - w; s >= 0; s--) {
        if (counts[s] !== 0) counts[s + w] += counts[s];
      }
    }
    return { counts: counts, total: total };
  }

  /**
   * Wilcoxon signed-rank test on paired differences.
   *
   * @param {number[]} diffs paired differences (A - B); zeros are dropped
   * @returns {{n:number, wPlus:number, wMinus:number, statistic:number,
   *            p:number, method:string, hasTies:boolean}}
   */
  function wilcoxon(diffs) {
    var d = diffs.filter(function (x) { return x !== 0 && isFinite(x); });
    var n = d.length;
    if (n === 0) {
      return { n: 0, wPlus: 0, wMinus: 0, statistic: 0, p: 1, method: 'none', hasTies: false };
    }
    var abs = d.map(Math.abs);
    var ranks = midranks(abs);
    var hasTies = ranks.some(function (r) { return r !== Math.round(r); });
    var wPlus = 0, wMinus = 0;
    for (var i = 0; i < n; i++) {
      if (d[i] > 0) wPlus += ranks[i]; else wMinus += ranks[i];
    }
    var statistic = Math.min(wPlus, wMinus);

    // Exact when there are no ties and n is small enough for the DP to be cheap.
    if (!hasTies && n <= 25) {
      var dist = exactWPlusDistribution(ranks);
      var denom = Math.pow(2, n);
      var tail = 0;
      for (var s = 0; s <= statistic; s++) tail += dist.counts[s];
      var p = Math.min(1, 2 * (tail / denom));
      return { n: n, wPlus: wPlus, wMinus: wMinus, statistic: statistic, p: p, method: 'exact', hasTies: false };
    }

    // Normal approximation with tie correction.
    var total = ranks.reduce(function (a, b) { return a + b; }, 0);
    var mean = total / 2;
    var tieSum = 0;
    rankTieGroups(abs).forEach(function (g) {
      if (g > 1) tieSum += g * g * g - g;
    });
    var variance = (n * (n + 1) * (2 * n + 1)) / 24 - tieSum / 48;
    if (variance <= 0) return { n: n, wPlus: wPlus, wMinus: wMinus, statistic: statistic, p: 1, method: 'normal', hasTies: hasTies };
    var z = (wPlus - mean) / Math.sqrt(variance);
    var zc = Math.abs(z) - 0.5 / Math.sqrt(variance); // continuity correction
    var p2 = 2 * (1 - normalCdf(Math.max(0, zc)));
    return { n: n, wPlus: wPlus, wMinus: wMinus, statistic: statistic, p: Math.min(1, p2), method: 'normal', hasTies: hasTies };
  }

  function rankTieGroups(values) {
    var s = sorted(values);
    var groups = [];
    var i = 0;
    while (i < s.length) {
      var j = i;
      while (j + 1 < s.length && s[j + 1] === s[i]) j++;
      groups.push(j - i + 1);
      i = j + 1;
    }
    return groups;
  }

  var Sop2Stats = {
    Z_95: Z_95,
    wilson: wilson,
    mcnemarExact: mcnemarExact,
    wilcoxon: wilcoxon,
    median: median,
    quantile: quantile,
    iqr: iqr,
    mean: mean,
    describe: describe,
    normalCdf: normalCdf,
    binomPmf: binomPmf
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Sop2Stats;
  if (root) root.Sop2Stats = Sop2Stats;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
/* ============================================================
   SOP 2 — functional correctness + text similarity (pure)

   Two clearly separated notions, because conflating them is the
   methodological flaw this module exists to remove:

   1) FUNCTIONAL CORRECTNESS (the real SOP 2a measure)
      A translation is correct only when the generated program runs
      in the shared runtime AND prints exactly what the reference
      program prints for the same input. stdout equality is the
      criterion; nothing here inspects the generated source.

   2) TEXT SIMILARITY (secondary, explicitly NOT correctness)
      Frequency-based line precision/recall/F1. Reported twice:
        • raw        — the original line-metrics output, unchanged
        • normalized — comments, blank lines, indentation-only
                       differences, and compiler-generated declaration
                       initializers removed, so a translator is no
                       longer penalised for harmless structural lines.

   Usable from Node (`module.exports`) and the browser (`window.Sop2Functional`).
   ============================================================ */
(function (root) {
  'use strict';

  function metricsCore() {
    if (root && root.MetricsCore) return root.MetricsCore;
    if (typeof require === 'function') {
      try { return require('./line-metrics'); } catch (e) { /* browser */ }
    }
    return null;
  }

  /* ---------- stdout normalisation ---------- */

  /** Canonical stdout: CRLF -> LF, strip trailing spaces, trim ends. */
  function normalizeOutput(text) {
    if (text == null) return '';
    return String(text)
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(function (line) { return line.replace(/[ \t]+$/, ''); })
      .join('\n')
      .replace(/^\n+/, '')
      .replace(/\n+$/, '');
  }

  /**
   * Do two programs print the same thing?
   * @returns {boolean}
   */
  function outputsMatch(a, b) {
    return normalizeOutput(a) === normalizeOutput(b);
  }

  /* ---------- text similarity normalisation ---------- */

  var DECL_INIT = /^(?:0|0\.0|""|''|\[\]|False|None)$/;

  /**
   * Remove non-semantic lines and canonicalise the rest:
   *   • strip `# …` comments (outside the line-metrics normaliser)
   *   • drop `# DECLARE name …` preludes together with the single
   *     `name = <default>` initializer the code generator emits for them
   *   • drop blank lines
   *   • collapse whitespace runs and strip spaces around punctuation
   */
  function normalizeSemantic(code) {
    var lines = String(code == null ? '' : code).replace(/\r\n?/g, '\n').split('\n');
    var drop = new Array(lines.length).fill(false);

    // Pass 1: pair `# DECLARE name` with the following default initializer.
    for (var i = 0; i < lines.length; i++) {
      var m = /^\s*#\s*DECLARE\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(lines[i]);
      if (!m) continue;
      var name = m[1];
      for (var j = i + 1; j < lines.length; j++) {
        var t = lines[j].trim();
        if (t === '') continue;
        var init = new RegExp('^' + name + '\\s*=\\s*(.+)$');
        var im = init.exec(t);
        if (im && DECL_INIT.test(im[1].trim())) { drop[j] = true; }
        break;
      }
      drop[i] = true;
    }

    var out = [];
    for (var k = 0; k < lines.length; k++) {
      if (drop[k]) continue;
      var line = lines[k];
      // Remove inline/whole-line comments () unless the # is inside a string.
      line = stripComment(line);
      if (line.trim() === '') continue;
      out.push(canonicalizeLine(line));
    }
    return out.join('\n');
  }

  function stripComment(line) {
    var inSingle = false, inDouble = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '\\') { i++; continue; }
      if (ch === "'" && !inDouble) inSingle = !inSingle;
      else if (ch === '"' && !inSingle) inDouble = !inDouble;
      else if (ch === '#' && !inSingle && !inDouble) return line.slice(0, i);
    }
    return line;
  }

  /** Normalise a line's whitespace/indentation without changing its tokens. */
  function canonicalizeLine(line) {
    var leading = (line.match(/^\s*/) || [''])[0].length;
    var body = line.trim();
    body = body
      .replace(/\s+/g, ' ')
      .replace(/\s*([=+\-*/%<>!&|^]+)\s*/g, ' $1 ')
      .replace(/\s*([(),:\[\]])\s*/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
    var indentLevels = Math.round(leading / 4);
    return '    '.repeat(Math.max(0, indentLevels)) + body;
  }

  /**
   * Text similarity for one generated/expected pair.
   * @returns {{raw:object, normalized:object}} line-metric objects
   */
  function textSimilarity(gen, exp) {
    var core = metricsCore();
    if (!core || typeof core.lineMetrics !== 'function') {
      throw new Error('MetricsCore unavailable for textSimilarity');
    }
    return {
      raw: core.lineMetrics(gen || '', exp || ''),
      normalized: core.lineMetrics(normalizeSemantic(gen), normalizeSemantic(exp))
    };
  }

  /* ---------- functional verdict ---------- */

  /**
   * Functional outcome for one side of one case.
   * @param {{rejected?:boolean, emitted?:boolean, syntaxOk:boolean|null,
   *          runtimeOk:boolean|null, stdout?:string}} side
   * @param {string} referenceStdout
   */
  function functionalOutcome(side, referenceStdout) {
    var ran = side.runtimeOk === true;
    var matches = ran && outputsMatch(side.stdout, referenceStdout);
    return {
      ran: ran,
      outputMatches: matches,
      correct: matches
    };
  }

  var Sop2Functional = {
    normalizeOutput: normalizeOutput,
    outputsMatch: outputsMatch,
    normalizeSemantic: normalizeSemantic,
    canonicalizeLine: canonicalizeLine,
    stripComment: stripComment,
    textSimilarity: textSimilarity,
    functionalOutcome: functionalOutcome
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Sop2Functional;
  if (root) root.Sop2Functional = Sop2Functional;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
/* ============================================================
   SOP 2 — error taxonomy (pure)

   Every (case, translator) pair lands in exactly one class so the
   SOP 2b answers can be stated per failure mode instead of as a
   single blended "error rate":

     rejected      — the translator declined the input and said so
                     (PseudoPy's validation mechanism). A handled,
                     WARNED outcome — not a silent failure.
     syntax_error  — the translator emitted Python that does not
                     compile.
     runtime_error — emitted Python compiles but raises when run.
     wrong_output  — emitted Python runs but prints something other
                     than the reference output.
     correct       — runs and prints exactly the reference output.
     unverified    — the shared interpreter was unavailable, so no
                     verdict could be reached (never counted as a
                     failure).

   "Silent failure" = syntax_error | runtime_error | wrong_output on a
   side that issued NO warning. This is where a validation mechanism is
   supposed to matter, so it is reported separately from raw errors.

   Usable from Node (`module.exports`) and the browser (`window.Sop2Taxonomy`).
   ============================================================ */
(function (root) {
  'use strict';

  var CLASSES = ['correct', 'wrong_output', 'runtime_error', 'syntax_error', 'rejected', 'unverified'];
  var FAILURE_CLASSES = { syntax_error: true, runtime_error: true, wrong_output: true };

  /**
   * @param {{rejected?:boolean, hasWarning?:boolean, syntaxOk:boolean|null,
   *          runtimeOk:boolean|null, outputMatches?:boolean}} side
   * @returns {string} one of CLASSES
   */
  function classify(side) {
    side = side || {};
    if (side.rejected === true) return 'rejected';
    if (side.syntaxOk === null || side.syntaxOk === undefined) return 'unverified';
    if (side.syntaxOk === false) return 'syntax_error';
    if (side.runtimeOk === null || side.runtimeOk === undefined) return 'unverified';
    if (side.runtimeOk === false) return 'runtime_error';
    if (side.outputMatches === true) return 'correct';
    return 'wrong_output';
  }

  function isFailure(cls) { return FAILURE_CLASSES[cls] === true; }

  /** A failure the translator did not warn about. */
  function isSilentFailure(cls, hasWarning) {
    return isFailure(cls) && hasWarning !== true;
  }

  /** Percentage reduction from `from` to `to` (null when `from` is 0). */
  function reductionPct(from, to) {
    if (!from) return null;
    return ((from - to) / from) * 100;
  }

  function emptyCounts() {
    var c = {};
    CLASSES.forEach(function (k) { c[k] = 0; });
    return c;
  }

  /**
   * Aggregate a list of side verdicts.
   * @param {Array<{class:string, hasWarning:boolean}>} sides
   * @returns {object} counts + derived rates
   */
  function summarize(sides) {
    var counts = emptyCounts();
    var silent = 0;
    var cases = sides.length;
    sides.forEach(function (s) {
      var cls = s.class;
      if (counts[cls] === undefined) counts[cls] = 0;
      counts[cls]++;
      if (isSilentFailure(cls, s.hasWarning)) silent++;
    });
    var evaluated = cases - counts.unverified;
    return {
      cases: cases,
      counts: counts,
      evaluated: evaluated,
      correct: counts.correct,
      wrongOutput: counts.wrong_output,
      runtimeErrors: counts.runtime_error,
      syntaxErrors: counts.syntax_error,
      rejected: counts.rejected,
      unverified: counts.unverified,
      failures: counts.wrong_output + counts.runtime_error + counts.syntax_error,
      silentFailures: silent,
      // denominators are the evaluable cases, never the raw case count
      correctnessRate: evaluated ? counts.correct / evaluated : 0,
      syntaxErrorRate: evaluated ? counts.syntax_error / evaluated : 0,
      runtimeErrorRate: evaluated ? counts.runtime_error / evaluated : 0,
      wrongOutputRate: evaluated ? counts.wrong_output / evaluated : 0,
      rejectedRate: evaluated ? counts.rejected / evaluated : 0,
      silentFailureRate: evaluated ? silent / evaluated : 0
    };
  }

  var Sop2Taxonomy = {
    CLASSES: CLASSES,
    classify: classify,
    isFailure: isFailure,
    isSilentFailure: isSilentFailure,
    reductionPct: reductionPct,
    summarize: summarize,
    emptyCounts: emptyCounts
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Sop2Taxonomy;
  if (root) root.Sop2Taxonomy = Sop2Taxonomy;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
/* ============================================================
   SOP 2 — error injection (pure)

   Builds deliberately broken variants of a pseudocode case so the
   comparison can measure ERROR DETECTION — the one thing a validation
   mechanism is supposed to add. Each injector is deterministic and
   self-guarding: it returns null when the target construct is absent,
   and the skipped count is reported rather than hidden.

   Injection types:
     keyword_typo          misspell a statement keyword
     missing_end_if        remove one END IF / ENDIF sentinel
     undefined_variable    use an identifier that is never declared
     wrong_argument_count  give a call one more argument than it takes
     return_outside_function  put RETURN at the top level
   ============================================================ */
(function (root) {
  'use strict';

  var INJECTION_TYPES = [
    'keyword_typo',
    'missing_end_if',
    'undefined_variable',
    'wrong_argument_count',
    'return_outside_function'
  ];

  var KEYWORD_TYPOS = {
    DISPLAY: 'DISPLAI',
    PRINT: 'PRNT',
    OUTPUT: 'OUTPU',
    WHILE: 'WHLE',
    DECLARE: 'DECALRE',
    SET: 'SETT',
    CALL: 'CALLL'
  };

  function splitLines(source) { return String(source == null ? '' : source).replace(/\r\n?/g, '\n').split('\n'); }
  function joinLines(lines) { return lines.join('\n'); }

  function isComment(line) { var t = line.trim(); return t.startsWith('#') || t.startsWith('//'); }

  function findEndIndex(lines) {
    for (var i = lines.length - 1; i >= 0; i--) {
      if (/^\s*END\s*\.?\s*$/i.test(lines[i])) return i;
    }
    return lines.length;
  }

  /* ---------- keyword typo ---------- */

  function injectKeywordTypo(source) {
    var lines = splitLines(source);
    for (var i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      var m = /^(\s*)([A-Za-z]+)\b/.exec(lines[i]);
      if (!m) continue;
      var word = m[2].toUpperCase();
      if (KEYWORD_TYPOS[word]) {
        lines[i] = m[1] + KEYWORD_TYPOS[word] + lines[i].slice(m[1].length + m[2].length);
        return { source: joinLines(lines), detail: word + ' -> ' + KEYWORD_TYPOS[word] };
      }
    }
    return null;
  }

  /* ---------- missing END IF ---------- */

  function injectMissingEndIf(source) {
    var lines = splitLines(source);
    var hasIf = false, lastEndIf = -1;
    for (var i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      if (/^\s*IF\b.*\bTHEN\b/i.test(lines[i])) hasIf = true;
      if (/^\s*END\s*IF\s*$/i.test(lines[i]) || /^\s*ENDIF\s*$/i.test(lines[i])) lastEndIf = i;
    }
    if (!hasIf || lastEndIf < 0) return null;
    var detail = lines[lastEndIf].trim();
    lines.splice(lastEndIf, 1);
    return { source: joinLines(lines), detail: 'removed ' + detail + ' on line ' + (lastEndIf + 1) };
  }

  /* ---------- undefined variable ---------- */

  function declaredNames(lines) {
    var names = {};
    lines.forEach(function (line) {
      var m = /^\s*DECLARE\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(line);
      if (m) names[m[1]] = true;
    });
    return names;
  }

  function injectUndefinedVariable(source) {
    var lines = splitLines(source);
    var declared = declaredNames(lines);
    // Find the first assignment and reference an undeclared name in it.
    for (var i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      var m = /^(\s*)(?:SET\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|TO|\u2190|<-|:=)\s*(.+?)\s*$/i.exec(lines[i]);
      if (!m) continue;
      var indent = m[1];
      var target = m[2];
      var rhs = m[3];
      if (!declared[target] && !/^\s*$/.test(target)) {
        // still fine: the target itself may be undeclared, but prefer a clean
        // injected name so the intent is unambiguous
      }
      lines[i] = indent + (/\bTO\b/i.test(lines[i]) ? 'SET ' + target + ' TO ' : target + ' = ') +
        'ghost_value_1 + (' + rhs + ')';
      return { source: joinLines(lines), detail: 'referenced undeclared ghost_value_1 in assignment to ' + target };
    }
    return null;
  }

  /* ---------- wrong argument count ---------- */

  function injectWrongArgumentCount(source) {
    var lines = splitLines(source);
    // Perhaps a CALL from the docs.
    for (var i = 0; i < lines.length; i++) {
      if (isComment(lines[i])) continue;
      var c = /^(\s*)CALL\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*$/i.exec(lines[i]);
      if (c) {
        var args = c[3].trim();
        lines[i] = c[1] + 'CALL ' + c[2] + '(' + (args ? args + ', 0' : '0') + ')';
        return { source: joinLines(lines), detail: 'added an extra argument to CALL ' + c[2] };
      }
    }
    // Fall back to a function definition's call site in an expression.
    var defined = null;
    for (var d = 0; d < lines.length; d++) {
      var f = /^\s*(?:FUNCTION|PROCEDURE)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/i.exec(lines[d]);
      if (f) { defined = f[1]; break; }
    }
    if (defined) {
      for (var k = 0; k < lines.length; k++) {
        if (isComment(lines[k])) continue;
        var call = new RegExp('\\b' + defined + '\\s*\\(([^)]*)\\)');
        var m = call.exec(lines[k]);
        if (m && k !== 0) {
          var inner = m[1].trim();
          lines[k] = lines[k].replace(call, defined + '(' + (inner ? inner + ', 0' : '0') + ')');
          return { source: joinLines(lines), detail: 'added an extra argument to ' + defined + '()' };
        }
      }
    }
    return null;
  }

  /* ---------- RETURN outside function ---------- */

  function injectReturnOutsideFunction(source) {
    var lines = splitLines(source);
    var at = findEndIndex(lines);
    lines.splice(at, 0, '  RETURN 0');
    return { source: joinLines(lines), detail: 'inserted RETURN 0 at the top level' };
  }

  var INJECTORS = {
    keyword_typo: injectKeywordTypo,
    missing_end_if: injectMissingEndIf,
    undefined_variable: injectUndefinedVariable,
    wrong_argument_count: injectWrongArgumentCount,
    return_outside_function: injectReturnOutsideFunction
  };

  /**
   * Inject one error type into a source.
   * @returns {{source:string, detail:string}|null} null when not applicable
   */
  function inject(source, type) {
    var fn = INJECTORS[type];
    if (!fn) throw new Error('unknown injection type: ' + type);
    return fn(source);
  }

  /**
   * All applicable injections for a source.
   * @returns {{applicable:Array<{type:string,source:string,detail:string}>, skipped:string[]}}
   */
  function injectAll(source, types) {
    var list = types || INJECTION_TYPES;
    var applicable = [];
    var skipped = [];
    list.forEach(function (type) {
      var r;
      try { r = inject(source, type); } catch (e) { r = null; }
      if (r && r.source !== source) applicable.push({ type: type, source: r.source, detail: r.detail });
      else skipped.push(type);
    });
    return { applicable: applicable, skipped: skipped };
  }

  var Sop2Injection = {
    INJECTION_TYPES: INJECTION_TYPES,
    INJECTORS: INJECTORS,
    inject: inject,
    injectAll: injectAll
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Sop2Injection;
  if (root) root.Sop2Injection = Sop2Injection;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
/* ============================================================
   SOP 2 — holdout dataset (30 independently written cases)
   ------------------------------------------------------------
   Provenance and rules (see docs/SOP2_DATASET_AUDIT.md):

   • Written independently of src/database/seed-data.js. The seed set
     was used while designing the compiler; this set is not, so it is
     the generalisation check.
   • Every case uses only constructs documented in
     docs/compiler-language.md. No case relies on unsupported syntax.
   • Deliberately varied style: different keyword spellings
     (SET/…TO, `<-`, `:=`, `=`), sentinel spellings (END IF / ENDIF,
     END FOR / ENDFOR, END WHILE / END WHILE), OUTPUT/PRINT/DISPLAY,
     numbered lines, comments, and different naming conventions.
   • No student names, no classroom identifiers.
   • python_code is the independent reference solution, written from
     the same task, not copied from PseudoPy output.

   Each reference prints a deterministic value and uses no stdin.
   ============================================================ */
(function (root) {
  'use strict';

  var CASES = [
    {
      id: 'holdout_1',
      title: 'Accumulate Integers Up To Twenty',
      concept: 'Iteration',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DECLARE total AS INTEGER',
        '  total = 0',
        '  DECLARE k AS INTEGER',
        '  k = 1',
        '  WHILE k <= 20 DO',
        '    total = total + k',
        '    k = k + 1',
        '  END WHILE',
        '  PRINT total',
        'END'
      ].join('\n'),
      python_code: 'total = 0\nk = 1\nwhile k <= 20:\n    total = total + k\n    k = k + 1\nprint(total)'
    },
    {
      id: 'holdout_2',
      title: 'Count Down From Five',
      concept: 'Reverse iteration',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  FOR i FROM 5 TO 1 STEP -1 DO',
        '    DISPLAY i',
        '  END FOR',
        'END'
      ].join('\n'),
      python_code: 'for i in range(5, 1 - 1, -1):\n    print(i)'
    },
    {
      id: 'holdout_3',
      title: 'Report Even Values In A Range',
      concept: 'Modulo branching',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DECLARE n AS INTEGER',
        '  n = 0',
        '  WHILE n <= 10 DO',
        '    IF n MOD 2 == 0 THEN',
        '      DISPLAY n',
        '    END IF',
        '    n = n + 1',
        '  END WHILE',
        'END'
      ].join('\n'),
      python_code: 'n = 0\nwhile n <= 10:\n    if n % 2 == 0:\n        print(n)\n    n = n + 1'
    },
    {
      id: 'holdout_4',
      title: 'Largest Value In A Collection',
      concept: 'Reduction',
      difficulty: 'medium',
      pseudocode: [
        'BEGIN',
        '  DECLARE values AS ARRAY',
        '  values = [3, 41, 7, 19, 12]',
        '  DECLARE top AS INTEGER',
        '  top = 0',
        '  FOR EACH v IN values DO',
        '    IF v > top THEN',
        '      top = v',
        '    END IF',
        '  END FOR',
        '  OUTPUT top',
        'END'
      ].join('\n'),
      python_code: 'values = [3, 41, 7, 19, 12]\ntop = 0\nfor v in values:\n    if v > top:\n        top = v\nprint(top)'
    },
    {
      id: 'holdout_5',
      title: 'Factorial By Multiplication Loop',
      concept: 'Accumulator',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DECLARE p AS INTEGER',
        '  DECLARE i AS INTEGER',
        '  SET p TO 1',
        '  FOR i FROM 1 TO 5 DO',
        '    p = p * i',
        '  END FOR',
        '  PRINT p',
        'END'
      ].join('\n'),
      python_code: 'p = 1\nfor i in range(1, 5 + 1):\n    p = p * i\nprint(p)'
    },
    {
      id: 'holdout_6',
      title: 'Mean Of A List Using Integer Division',
      concept: 'Aggregation',
      difficulty: 'medium',
      pseudocode: [
        'BEGIN',
        '  DECLARE nums AS ARRAY',
        '  DECLARE total AS INTEGER',
        '  DECLARE n AS INTEGER',
        '  nums = [10, 20, 30, 40]',
        '  total = 0',
        '  n = 0',
        '  FOR EACH x IN nums DO',
        '    total = total + x',
        '    n = n + 1',
        '  END FOR',
        '  PRINT total DIV n',
        'END'
      ].join('\n'),
      python_code: 'nums = [10, 20, 30, 40]\ntotal = 0\nn = 0\nfor x in nums:\n    total = total + x\n    n = n + 1\nprint(total // n)'
    },
    {
      id: 'holdout_7',
      title: 'First Ten Fibonacci Terms',
      concept: 'Sequence',
      difficulty: 'medium',
      pseudocode: [
        'BEGIN',
        '  DECLARE a AS INTEGER',
        '  DECLARE b AS INTEGER',
        '  DECLARE nxt AS INTEGER',
        '  DECLARE i AS INTEGER',
        '  a = 0',
        '  b = 1',
        '  FOR i FROM 1 TO 10 DO',
        '    DISPLAY a',
        '    nxt = a + b',
        '    a = b',
        '    b = nxt',
        '  ENDFOR',
        'END'
      ].join('\n'),
      python_code: 'a = 0\nb = 1\nfor i in range(1, 10 + 1):\n    print(a)\n    nxt = a + b\n    a = b\n    b = nxt'
    },
    {
      id: 'holdout_8',
      title: 'Greatest Common Divisor',
      concept: 'Euclidean algorithm',
      difficulty: 'medium',
      pseudocode: [
        'BEGIN',
        '  DECLARE a AS INTEGER',
        '  DECLARE b AS INTEGER',
        '  DECLARE r AS INTEGER',
        '  a = 48',
        '  b = 18',
        '  WHILE b != 0 DO',
        '    r = a MOD b',
        '    a = b',
        '    b = r',
        '  END WHILE',
        '  DISPLAY a',
        'END'
      ].join('\n'),
      python_code: 'a = 48\nb = 18\nwhile b != 0:\n    r = a % b\n    a = b\n    b = r\nprint(a)'
    },
    {
      id: 'holdout_9',
      title: 'Count Vowels In A Word',
      concept: 'String iteration and membership',
      difficulty: 'medium',
      pseudocode: [
        'BEGIN',
        '  DECLARE word AS STRING',
        '  DECLARE count AS INTEGER',
        '  DECLARE ch AS CHARACTER',
        '  word = "pseudocode"',
        '  count = 0',
        '  FOR EACH ch IN word DO',
        '    IF ch IN "aeiou" THEN',
        '      count = count + 1',
        '    END IF',
        '  END FOR',
        '  PRINT count',
        'END'
      ].join('\n'),
      python_code: 'word = "pseudocode"\ncount = 0\nfor ch in word:\n    if ch in "aeiou":\n        count = count + 1\nprint(count)'
    },
    {
      id: 'holdout_10',
      title: 'Reverse A List In Place',
      concept: 'Two-pointer swap',
      difficulty: 'medium',
      pseudocode: [
        'BEGIN',
        '  DECLARE arr AS ARRAY',
        '  DECLARE left AS INTEGER',
        '  DECLARE right AS INTEGER',
        '  DECLARE temp AS INTEGER',
        '  arr = [1, 2, 3, 4, 5]',
        '  left = 0',
        '  right = 4',
        '  WHILE left < right DO',
        '    temp = arr[left]',
        '    arr[left] = arr[right]',
        '    arr[right] = temp',
        '    left = left + 1',
        '    right = right - 1',
        '  END WHILE',
        '  PRINT arr',
        'END'
      ].join('\n'),
      python_code: 'arr = [1, 2, 3, 4, 5]\nleft = 0\nright = 4\nwhile left < right:\n    temp = arr[left]\n    arr[left] = arr[right]\n    arr[right] = temp\n    left = left + 1\n    right = right - 1\nprint(arr)'
    },
    {
      id: 'holdout_11',
      title: 'Sum Of Squares One To Five',
      concept: 'Accumulation',
      difficulty: 'easy',
      pseudocode: [
        '1 BEGIN',
        '2   DECLARE s AS INTEGER',
        '3   DECLARE i AS INTEGER',
        '4   s = 0',
        '5   FOR i FROM 1 TO 5 DO',
        '6     s = s + i * i',
        '7   END FOR',
        '8   DISPLAY s',
        '9 END'
      ].join('\n'),
      python_code: 's = 0\nfor i in range(1, 5 + 1):\n    s = s + i * i\nprint(s)'
    },
    {
      id: 'holdout_12',
      title: 'Multiples Of Three',
      concept: 'Stepped iteration',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DECLARE i AS INTEGER',
        '  FOR i FROM 3 TO 12 STEP 3 DO',
        '    DISPLAY i',
        '  END FOR   # inclusive bounds',
        'END'
      ].join('\n'),
      python_code: 'for i in range(3, 12 + 1, 3):\n    print(i)'
    },
    {
      id: 'holdout_13',
      title: 'Sum Of Even Numbers To Twenty',
      concept: 'Stepped accumulation',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DECLARE s AS INTEGER',
        '  DECLARE k AS INTEGER',
        '  s = 0',
        '  FOR k FROM 2 TO 20 STEP 2 DO',
        '    s = s + k',
        '  END FOR',
        '  OUTPUT s',
        'END'
      ].join('\n'),
      python_code: 's = 0\nfor k in range(2, 20 + 1, 2):\n    s = s + k\nprint(s)'
    },
    {
      id: 'holdout_14',
      title: 'Smallest Value In A Collection',
      concept: 'Reduction',
      difficulty: 'medium',
      pseudocode: [
        'BEGIN',
        '  DECLARE vals AS ARRAY',
        '  DECLARE low AS INTEGER',
        '  DECLARE v AS INTEGER',
        '  vals = [8, -4, 15, 0, 7]',
        '  low = vals[0]',
        '  FOR EACH v IN vals DO',
        '    IF v < low THEN',
        '      low = v',
        '    END IF',
        '  END FOR',
        '  PRINT low',
        'END'
      ].join('\n'),
      python_code: 'vals = [8, -4, 15, 0, 7]\nlow = vals[0]\nfor v in vals:\n    if v < low:\n        low = v\nprint(low)'
    },
    {
      id: 'holdout_15',
      title: 'Factorial By Recursion',
      concept: 'Recursion',
      difficulty: 'hard',
      pseudocode: [
        'BEGIN',
        '  FUNCTION factorial(n)',
        '    IF n <= 1 THEN',
        '      RETURN 1',
        '    END IF',
        '    RETURN n * factorial(n - 1)',
        '  END FUNCTION',
        '  DISPLAY factorial(5)',
        'END'
      ].join('\n'),
      python_code: 'def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n - 1)\nprint(factorial(5))'
    },
    {
      id: 'holdout_16',
      title: 'Greeting Procedure',
      concept: 'Procedure and call',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  PROCEDURE greet(name)',
        '    DISPLAY "Hello", name',
        '  END PROCEDURE',
        '  CALL greet("World")',
        'END'
      ].join('\n'),
      python_code: 'def greet(name):\n    print("Hello", name)\ngreet("World")'
    },
    {
      id: 'holdout_17',
      title: 'Nested Loop Accumulation',
      concept: 'Nested iteration',
      difficulty: 'medium',
      pseudocode: [
        'BEGIN',
        '  DECLARE total AS INTEGER',
        '  DECLARE i AS INTEGER',
        '  DECLARE j AS INTEGER',
        '  total = 0',
        '  FOR i FROM 1 TO 3 DO',
        '    FOR j FROM 1 TO 3 DO',
        '      total = total + i * j',
        '    END FOR',
        '  END FOR',
        '  PRINT total',
        'END'
      ].join('\n'),
      python_code: 'total = 0\nfor i in range(1, 3 + 1):\n    for j in range(1, 3 + 1):\n        total = total + i * j\nprint(total)'
    },
    {
      id: 'holdout_18',
      title: 'Linear Search For A Value',
      concept: 'Search',
      difficulty: 'medium',
      pseudocode: [
        'BEGIN',
        '  DECLARE items AS ARRAY',
        '  DECLARE target AS INTEGER',
        '  DECLARE found AS INTEGER',
        '  DECLARE i AS INTEGER',
        '  items = [4, 9, 15, 22, 31]',
        '  target = 22',
        '  found = -1',
        '  FOR i FROM 0 TO 4 DO',
        '    IF items[i] == target THEN',
        '      found = i',
        '    END IF',
        '  END FOR',
        '  DISPLAY found',
        'END'
      ].join('\n'),
      python_code: 'items = [4, 9, 15, 22, 31]\ntarget = 22\nfound = -1\nfor i in range(0, 4 + 1):\n    if items[i] == target:\n        found = i\nprint(found)'
    },
    {
      id: 'holdout_19',
      title: 'Sort A Small List',
      concept: 'Sorting',
      difficulty: 'hard',
      pseudocode: [
        'BEGIN',
        '  DECLARE data AS ARRAY',
        '  DECLARE i AS INTEGER',
        '  DECLARE j AS INTEGER',
        '  DECLARE tmp AS INTEGER',
        '  data = [5, 2, 8, 3]',
        '  FOR i FROM 0 TO 3 DO',
        '    FOR j FROM 0 TO 2 DO',
        '      IF data[j] > data[j + 1] THEN',
        '        tmp = data[j]',
        '        data[j] = data[j + 1]',
        '        data[j + 1] = tmp',
        '      END IF',
        '    END FOR',
        '  END FOR',
        '  PRINT data',
        'END'
      ].join('\n'),
      python_code: 'data = [5, 2, 8, 3]\nfor i in range(0, 3 + 1):\n    for j in range(0, 2 + 1):\n        if data[j] > data[j + 1]:\n            tmp = data[j]\n            data[j] = data[j + 1]\n            data[j + 1] = tmp\nprint(data)'
    },
    {
      id: 'holdout_20',
      title: 'Length Of A Word',
      concept: 'Built-in expression',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DECLARE word AS STRING',
        '  word = "pseudopy"',
        '  DISPLAY len(word)',
        'END'
      ].join('\n'),
      python_code: 'word = "pseudopy"\nprint(len(word))'
    },
    {
      id: 'holdout_21',
      title: 'Digit Sum Of A Number',
      concept: 'Modulo and division',
      difficulty: 'hard',
      pseudocode: [
        'BEGIN',
        '  DECLARE n AS INTEGER',
        '  DECLARE total AS INTEGER',
        '  n = 1234',
        '  total = 0',
        '  WHILE n > 0 DO',
        '    total = total + (n MOD 10)',
        '    n = n DIV 10',
        '  END WHILE',
        '  DISPLAY total',
        'END'
      ].join('\n'),
      python_code: 'n = 1234\ntotal = 0\nwhile n > 0:\n    total = total + (n % 10)\n    n = n // 10\nprint(total)'
    },
    {
      id: 'holdout_22',
      title: 'Powers Of Two',
      concept: 'Exponentiation',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DECLARE e AS INTEGER',
        '  FOR e FROM 1 TO 5 DO',
        '    DISPLAY 2 ** e',
        '  END FOR',
        'END'
      ].join('\n'),
      python_code: 'for e in range(1, 5 + 1):\n    print(2 ** e)'
    },
    {
      id: 'holdout_23',
      title: 'Leap Year Test',
      concept: 'Boolean logic',
      difficulty: 'hard',
      pseudocode: [
        'BEGIN',
        '  DECLARE year AS INTEGER',
        '  year = 2024',
        '  IF (year MOD 4 == 0 AND year MOD 100 != 0) OR year MOD 400 == 0 THEN',
        '    DISPLAY "Leap"',
        '  ELSE',
        '    DISPLAY "Not leap"',
        '  END IF',
        'END'
      ].join('\n'),
      python_code: 'year = 2024\nif (year % 4 == 0 and year % 100 != 0) or year % 400 == 0:\n    print("Leap")\nelse:\n    print("Not leap")'
    },
    {
      id: 'holdout_24',
      title: 'Repeat A String',
      concept: 'String repetition',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DISPLAY "ab" * 3',
        'END'
      ].join('\n'),
      python_code: 'print("ab" * 3)'
    },
    {
      id: 'holdout_25',
      title: 'Occurrences Of A Character',
      concept: 'Counting',
      difficulty: 'medium',
      pseudocode: [
        'BEGIN',
        '  DECLARE text AS STRING',
        '  DECLARE ch AS CHARACTER',
        '  DECLARE hits AS INTEGER',
        '  DECLARE c AS CHARACTER',
        '  text = "banana"',
        '  ch = "a"',
        '  hits = 0',
        '  FOR EACH c IN text DO',
        '    IF c == ch THEN',
        '      hits = hits + 1',
        '    END IF',
        '  END FOR',
        '  DISPLAY hits',
        'END'
      ].join('\n'),
      python_code: 'text = "banana"\nch = "a"\nhits = 0\nfor c in text:\n    if c == ch:\n        hits = hits + 1\nprint(hits)'
    },
    {
      id: 'holdout_26',
      title: 'Sum Of Odd Numbers To Nineteen',
      concept: 'Stepped accumulation',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DECLARE s AS INTEGER',
        '  DECLARE k AS INTEGER',
        '  s = 0',
        '  FOR k FROM 1 TO 19 STEP 2 DO',
        '    s = s + k',
        '  END FOR',
        '  DISPLAY s',
        'END'
      ].join('\n'),
      python_code: 's = 0\nfor k in range(1, 19 + 1, 2):\n    s = s + k\nprint(s)'
    },
    {
      id: 'holdout_27',
      title: 'Swap Two Values',
      concept: 'Assignment',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DECLARE a AS INTEGER',
        '  DECLARE b AS INTEGER',
        '  DECLARE t AS INTEGER',
        '  a = 3',
        '  b = 9',
        '  t <- a',
        '  a <- b',
        '  b <- t',
        '  DISPLAY a',
        '  DISPLAY b',
        'END'
      ].join('\n'),
      python_code: 'a = 3\nb = 9\nt = a\na = b\nb = t\nprint(a)\nprint(b)'
    },
    {
      id: 'holdout_28',
      title: 'Factorial By Countdown Loop',
      concept: 'Accumulator',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DECLARE n AS INTEGER',
        '  DECLARE f AS INTEGER',
        '  n = 6',
        '  f = 1',
        '  WHILE n > 1 DO',
        '    f = f * n',
        '    n = n - 1',
        '  END WHILE',
        '  PRINT f',
        'END'
      ].join('\n'),
      python_code: 'n = 6\nf = 1\nwhile n > 1:\n    f = f * n\n    n = n - 1\nprint(f)'
    },
    {
      id: 'holdout_29',
      title: 'Palindrome Check',
      concept: 'String comparison',
      difficulty: 'medium',
      pseudocode: [
        'BEGIN',
        '  DECLARE word AS STRING',
        '  word = "level"',
        '  IF word == word[::-1] THEN',
        '    DISPLAY "yes"',
        '  ELSE',
        '    DISPLAY "no"',
        '  END IF',
        'END'
      ].join('\n'),
      python_code: 'word = "level"\nif word == word[::-1]:\n    print("yes")\nelse:\n    print("no")'
    },
    {
      id: 'holdout_30',
      title: 'Integer Quotient',
      concept: 'Floor division',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DISPLAY 30 DIV 4',
        'END'
      ].join('\n'),
      python_code: 'print(30 // 4)'
    }
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = CASES;
  if (root) root.SOP2_HOLDOUT_CASES = CASES;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
/* ============================================================
   SOP 2 — dataset assembly (pure)

   Produces a single tagged row list from three clearly labelled
   groups so the report never blends them into one number:

     seed     — the 30 built-in exercises the compiler was designed
                against (src/database/seed-data.js)
     holdout  — independently written cases, different phrasing and
                style, used only for evaluation
     injected — programmatically broken variants of seed/holdout rows,
                used to measure error DETECTION

   Usable from Node (`module.exports`) and the browser (`window.Sop2Dataset`).
   ============================================================ */
(function (root) {
  'use strict';

  function injectionModule() {
    if (root && root.Sop2Injection) return root.Sop2Injection;
    if (typeof require === 'function') {
      try { return require('./error-injection'); } catch (e) { /* browser */ }
    }
    return null;
  }

  function pick(obj, keys) {
    for (var i = 0; i < keys.length; i++) {
      if (obj && obj[keys[i]] != null && obj[keys[i]] !== '') return obj[keys[i]];
    }
    return '';
  }

  /** Normalise a seed exercise (database.js shape). */
  function normalizeSeed(row, index) {
    return {
      id: String(pick(row, ['id', '_docId']) || ('seed_' + (index + 1))),
      title: pick(row, ['title']) || null,
      concept: pick(row, ['concept']) || null,
      difficulty: pick(row, ['difficulty']) || null,
      source: String(pick(row, ['pseudocode', 'code'])),
      referencePython: String(pick(row, ['python_code', 'solution', 'pythonCode'])),
      group: 'seed',
      baseId: null,
      injectionType: null,
      injectionDetail: null
    };
  }

  /** Normalise a holdout case (holdout-cases.js shape). */
  function normalizeHoldout(row, index) {
    return {
      id: String(pick(row, ['id']) || ('holdout_' + (index + 1))),
      title: pick(row, ['title']) || null,
      concept: pick(row, ['concept']) || null,
      difficulty: pick(row, ['difficulty']) || null,
      source: String(pick(row, ['pseudocode', 'code'])),
      referencePython: String(pick(row, ['python_code', 'solution'])),
      group: 'holdout',
      baseId: null,
      injectionType: null,
      injectionDetail: null
    };
  }

  function isUsable(row) {
    return !!(row.source && row.source.trim() && row.referencePython && row.referencePython.trim());
  }

  /**
   * Build the tagged dataset.
   * @param {Array} seedRows raw database.js seed objects
   * @param {Array} holdoutRows raw holdout objects
   * @param {{includeInjected?:boolean, injectionTypes?:string[],
   *          includeHoldout?:boolean, includeSeed?:boolean}} [opts]
   * @returns {{rows:Array, injections:{applicable:number, skipped:Array}}}
   */
  function buildDataset(seedRows, holdoutRows, opts) {
    opts = opts || {};
    var includeSeed = opts.includeSeed !== false;
    var includeHoldout = opts.includeHoldout !== false;
    var includeInjected = opts.includeInjected !== false;
    var injection = injectionModule();

    var base = [];
    if (includeSeed) {
      (seedRows || []).forEach(function (r, i) { var n = normalizeSeed(r, i); if (isUsable(n)) base.push(n); });
    }
    if (includeHoldout) {
      (holdoutRows || []).forEach(function (r, i) { var n = normalizeHoldout(r, i); if (isUsable(n)) base.push(n); });
    }

    var rows = base.slice();
    var skipped = [];

    if (includeInjected && injection) {
      base.forEach(function (row) {
        var result = injection.injectAll(row.source, opts.injectionTypes);
        result.skipped.forEach(function (type) { skipped.push(row.id + ':' + type); });
        result.applicable.forEach(function (inj) {
          rows.push({
            id: row.id + '__inj_' + inj.type,
            title: (row.title || row.id) + ' [' + inj.type + ']',
            concept: row.concept,
            difficulty: row.difficulty,
            source: inj.source,
            referencePython: row.referencePython,
            group: 'injected',
            baseId: row.id,
            injectionType: inj.type,
            injectionDetail: inj.detail
          });
        });
      });
    }

    return {
      rows: rows,
      injections: { applicable: rows.filter(function (r) { return r.group === 'injected'; }).length, skipped: skipped }
    };
  }

  function groupRows(rows, group) {
    return rows.filter(function (r) { return r.group === group; });
  }

  var Sop2Dataset = {
    normalizeSeed: normalizeSeed,
    normalizeHoldout: normalizeHoldout,
    buildDataset: buildDataset,
    groupRows: groupRows
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Sop2Dataset;
  if (root) root.Sop2Dataset = Sop2Dataset;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
/* ============================================================
   SOP 2 — timing harness (pure)

   Generation time is measured around TRANSLATION ONLY: raw text ->
   Python. Bundle loading, VM creation, validation and execution are
   never inside the timer. Browser clocks are coarse, so a single
   measurement is meaningless; each case is warmed up and then run in
   a batch, and the batch divided by the iteration count. Across cases
   the report uses the median and IQR, never the mean of single shots.
   ============================================================ */
(function (root) {
  'use strict';

  function defaultNow() {
    if (root && root.performance && typeof root.performance.now === 'function') return root.performance.now();
    return Date.now();
  }

  /**
   * @param {Function} fn the translation callable (already bound to its input)
   * @param {{warmup?:number, iters?:number, now?:Function}} [opts]
   * @returns {{warmup:number, iterations:number, totalMs:number, perIterationMs:number}}
   */
  function measure(fn, opts) {
    opts = opts || {};
    var warmup = opts.warmup == null ? 5 : opts.warmup;
    var iters = opts.iters == null ? 200 : opts.iters;
    var clock = opts.now || defaultNow;
    var i;
    for (i = 0; i < warmup; i++) fn();
    var t0 = clock();
    for (i = 0; i < iters; i++) fn();
    var t1 = clock();
    var totalMs = t1 - t0;
    return {
      warmup: warmup,
      iterations: iters,
      totalMs: totalMs,
      perIterationMs: iters ? totalMs / iters : 0
    };
  }

  /**
   * Time a one-off setup cost (bundle load + VM + engine construction).
   * @returns {{setupMs:number, value:*}}
   */
  function measureSetup(fn, opts) {
    var clock = (opts && opts.now) || defaultNow;
    var t0 = clock();
    var value = fn();
    var t1 = clock();
    return { setupMs: t1 - t0, value: value };
  }

  var Sop2Timing = { measure: measure, measureSetup: measureSetup, now: defaultNow };

  if (typeof module !== 'undefined' && module.exports) module.exports = Sop2Timing;
  if (root) root.Sop2Timing = Sop2Timing;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
/* ============================================================
   SOP 2 — report rendering (CSV + Markdown), shared

   One implementation used by both the Node harness
   (src/research/sop2-comparison.js) and the DevTools panel
   (src/devtools/research-ui.js), so an exported file and the
   on-screen report can never drift apart.

   Usable from Node (`module.exports = Sop2Report`) and the browser
   (`window.Sop2Report`).
   ============================================================ */
(function (root) {
  'use strict';

  // Resolve dependencies from the browser globals or Node's require.
  function tryRequire(m) { try { return require(m); } catch (e) { return null; } }
  function resolve(globalName, modulePath) {
    if (root && root[globalName]) return root[globalName];
    if (typeof require === 'function') return tryRequire(modulePath);
    return null;
  }
  var Stats = resolve('Sop2Stats', './stats');
  var Taxonomy = resolve('Sop2Taxonomy', './error-taxonomy');

  var SIDE_KEYS = ['pseudopy', 'baseline', 'baselineB2'];
  var SIDE_LABELS = {
    pseudopy: 'PseudoPy',
    baseline: 'Baseline B1 (naive)',
    baselineB2: 'Baseline B2 (rule-based)'
  };

  var CSV_COLUMNS = [
    'caseId', 'title',
    'pp_compile', 'pp_syntax', 'pp_runtime', 'pp_p', 'pp_r', 'pp_f1', 'pp_time_ms',
    'bl_compile', 'bl_syntax', 'bl_runtime', 'bl_p', 'bl_r', 'bl_f1', 'bl_time_ms',
    'group', 'injection_type',
    'pp_class', 'pp_rejected', 'pp_outmatch', 'pp_correct', 'pp_silent', 'pp_f1_norm',
    'bl2_compile', 'bl2_class', 'bl2_rejected', 'bl2_outmatch', 'bl2_silent', 'bl2_time_ms'
  ];

  function flag(v) { return v === true ? '1' : v === false ? '0' : ''; }

  function csvCell(v) {
    let s = v == null ? '' : String(v);
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return s;
  }

  function isSilent(side) {
    if (!side) return false;
    if (Taxonomy && Taxonomy.isSilentFailure) return Taxonomy.isSilentFailure(side.class, side.hasWarning);
    return false;
  }

  function toCSV(doc) {
    const results = Array.isArray(doc) ? doc : (doc && doc.results) || [];
    const lines = [CSV_COLUMNS.join(',')];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const pp = r.pseudopy || {};
      const bl = r.baseline || {};
      const b2 = r.baselineB2 || {};
      const ppM = (r.metrics && r.metrics.pseudopy) || {};
      const blM = (r.metrics && r.metrics.baseline) || {};
      const ppN = ppM.normalized || {};
      lines.push([
        r.caseId, r.title,
        flag(pp.compileSuccess), flag(pp.syntaxSuccess), flag(pp.runtimeSuccess),
        ppM.precision, ppM.recall, ppM.f1, pp.generationTimeMs,
        flag(bl.compileSuccess), flag(bl.syntaxSuccess), flag(bl.runtimeSuccess),
        blM.precision, blM.recall, blM.f1, bl.generationTimeMs,
        r.group, r.injectionType,
        pp.class, flag(pp.rejected), flag(pp.outputMatches), flag(pp.correct),
        flag(isSilent(pp)), ppN.f1,
        flag(b2.compileSuccess), b2.class, flag(b2.rejected),
        flag(b2.outputMatches), flag(isSilent(b2)),
        b2.generationTimeMs
      ].map(csvCell).join(','));
    }
    return lines.join('\n') + '\n';
  }

  function toJSON(doc) {
    return JSON.stringify(doc, null, 2) + '\n';
  }

  function round3(n) { return Math.round(n * 1000) / 1000; }
  function pct(x) { return x == null ? 'n/a' : (x * 100).toFixed(1) + '%'; }
  function f3(x) { return typeof x === 'number' ? x.toFixed(3) : 'n/a'; }

  function medianOf(rows, key) {
    return Stats ? Stats.median(rows.map(function (r) { return r[key].generationTimeMs; })) : 0;
  }
  function iqrOf(rows, key) {
    return Stats ? Stats.iqr(rows.map(function (r) { return r[key].generationTimeMs; })) : 0;
  }

  function verdictText(doc) {
    const rows = doc.results.filter(function (r) { return r.group === 'seed' || r.group === 'holdout'; });
    const n = rows.length;
    const pp = rows.filter(function (r) { return r.pseudopy.correct; }).length;
    const b1 = rows.filter(function (r) { return r.baseline.correct; }).length;
    const b2 = rows.filter(function (r) { return r.baselineB2.correct; }).length;
    const ppTime = medianOf(rows, 'pseudopy');
    const b1Time = medianOf(rows, 'baseline');
    const overhead = ppTime - b1Time;
    const inj = doc.groups && doc.groups.injected;
    const injDetected = inj ? inj.pseudopy.rejected : 0;
    const injN = inj ? inj.cases : 0;

    const out = [];
    out.push('On well-formed input (' + n + ' cases) PseudoPy produced the reference output in ' + pp +
      ' cases, B1 in ' + b1 + ', and B2 in ' + b2 + '.');
    if (inj) {
      out.push('On ' + injN + ' deliberately broken cases PseudoPy warned (rejected) in ' + injDetected +
        '; B2 warned in 0 because it has no validation.');
    }
    if (n && ppTime > b1Time) {
      out.push('PseudoPy is slower than the naive baseline: it adds about ' + round3(overhead) +
        ' ms of analysis+validation overhead per translation (median ' + round3(ppTime) + ' ms vs ' +
        round3(b1Time) + ' ms). SOP 2c as originally worded is not supported by this data; the honest ' +
        'statement is a small absolute cost per translation.');
    } else if (n) {
      out.push('PseudoPy was not slower than the naive baseline on this machine (median ' +
        round3(ppTime) + ' ms vs ' + round3(b1Time) + ' ms).');
    }
    if (n && b2 >= pp) {
      out.push('A careful rule-based baseline (B2) matches or exceeds PseudoPy on well-formed input, so ' +
        'the correctness advantage on well-formed input is not established by this dataset; the ' +
        'difference that does survive is error detection on malformed input.');
    }
    return out.join(' ');
  }

  function toMarkdown(doc) {
    const L = [];
    L.push('# SOP 2 — Traditional Baseline vs PseudoPy');
    L.push('');
    L.push('Generated ' + doc.metadata.timestamp + ' · ' + doc.metadata.cases + ' cases · ' +
      'correctness = stdout equality against the reference program (shared ' + doc.metadata.runtime + ' runtime).');
    L.push('');
    L.push('Baselines: **B1** naive keyword substitution · **B2** reasonable rule-based (no CFG/AST/semantic validation).');
    L.push('');
    if (doc.metadata.setup) {
      L.push('One-time setup (bundle load + VM + compiler construction): ' +
        round3(doc.metadata.setup.setupMs) + ' ms — excluded from per-case timing.');
      L.push('');
    }
    L.push('## SOP 2a — Functional correctness');
    L.push('');
    L.push('| Group | Cases | PseudoPy | Baseline B1 | Baseline B2 | Δ pp (PP−B1) | Relative (PP vs B1) |');
    L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    ['seed', 'holdout', 'injected'].forEach(function (g) {
      const s = doc.groups && doc.groups[g];
      if (!s) return;
      const pp = s.pseudopy.correctnessRate, b1 = s.baseline.correctnessRate;
      const rel = b1 > 0 ? ((pp - b1) / b1) * 100 : null;
      L.push('| ' + g + ' | ' + s.cases + ' | ' + pct(pp) + ' | ' + pct(b1) + ' | ' +
        pct(s.baselineB2.correctnessRate) + ' | ' + ((pp - b1) * 100).toFixed(1) + ' | ' +
        (rel == null ? 'n/a' : rel.toFixed(1) + '%') + ' |');
    });
    L.push('');
    L.push('## SOP 2b — Error taxonomy');
    L.push('');
    ['seed', 'holdout', 'injected'].forEach(function (g) {
      const s = doc.groups && doc.groups[g];
      if (!s) return;
      L.push('### ' + g + ' (' + s.cases + ' cases)');
      L.push('');
      L.push('| Translator | Correct | Rejected (warned) | Syntax err | Runtime err | Wrong output | Silent failures |');
      L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
      SIDE_KEYS.forEach(function (k) {
        const x = s[k];
        L.push('| ' + SIDE_LABELS[k] + ' | ' + x.correct + ' | ' + x.rejected + ' | ' +
          x.counts.syntax_error + ' | ' + x.counts.runtime_error + ' | ' + x.counts.wrong_output + ' | ' +
          x.silentFailures + ' (' + pct(x.silentFailureRate) + ') |');
      });
      L.push('');
    });
    L.push('## SOP 2c — Generation time (translation only)');
    L.push('');
    L.push('| Group | PseudoPy median (IQR) | B1 median (IQR) | B2 median (IQR) | Overhead vs B1 |');
    L.push('| --- | ---: | ---: | ---: | ---: |');
    ['seed', 'holdout', 'injected'].forEach(function (g) {
      const rows = doc.results.filter(function (r) { return r.group === g; });
      if (!rows.length) return;
      function cell(key) { return round3(medianOf(rows, key)) + ' (' + round3(iqrOf(rows, key)) + ')'; }
      L.push('| ' + g + ' | ' + cell('pseudopy') + ' | ' + cell('baseline') + ' | ' + cell('baselineB2') + ' | ' +
        round3(medianOf(rows, 'pseudopy') - medianOf(rows, 'baseline')) + ' ms |');
    });
    L.push('');
    L.push('## Statistics');
    L.push('');
    ['seed', 'holdout', 'injected'].forEach(function (g) {
      const st = doc.stats && doc.stats[g];
      if (!st) return;
      L.push('### ' + g);
      L.push('');
      SIDE_KEYS.forEach(function (k) {
        const w = st[k].wilson;
        L.push('- ' + SIDE_LABELS[k] + ' correctness: ' + pct(w.p) + ' (95% CI ' + pct(w.low) + '–' +
          pct(w.high) + ', n=' + w.n + ')');
      });
      L.push('- McNemar (correct) PseudoPy vs B1: b=' + st.mcnemar.vsB1.b + ', c=' + st.mcnemar.vsB1.c +
        ', p=' + f3(st.mcnemar.vsB1.p));
      L.push('- McNemar (correct) PseudoPy vs B2: b=' + st.mcnemar.vsB2.b + ', c=' + st.mcnemar.vsB2.c +
        ', p=' + f3(st.mcnemar.vsB2.p));
      L.push('- Wilcoxon (time) PseudoPy − B1: n=' + st.wilcoxonTime.vsB1.n + ', p=' +
        f3(st.wilcoxonTime.vsB1.p) + ' (' + st.wilcoxonTime.vsB1.method + ')');
      L.push('- Wilcoxon (time) PseudoPy − B2: n=' + st.wilcoxonTime.vsB2.n + ', p=' +
        f3(st.wilcoxonTime.vsB2.p) + ' (' + st.wilcoxonTime.vsB2.method + ')');
      L.push('');
    });
    L.push('## Verdict');
    L.push('');
    L.push(verdictText(doc));
    L.push('');
    if (doc.dataset && doc.dataset.skippedInjections && doc.dataset.skippedInjections.length) {
      L.push('Injection variants skipped (target construct absent): ' + doc.dataset.skippedInjections.length + '.');
      L.push('');
    }
    return L.join('\n');
  }

  function round6(n) { return Math.round(n * 1e6) / 1e6; }

  function average(values) {
    if (!values.length) return 0;
    let total = 0;
    for (let i = 0; i < values.length; i++) total += values[i];
    return total / values.length;
  }

  function sideSummary(results, key) {
    const rows = results.map(function (r) { return r[key]; });
    const mets = results.map(function (r) { return r.metrics[key]; });
    const classes = rows.map(function (r) { return { class: r.class, hasWarning: r.hasWarning }; });
    const tax = (Taxonomy && Taxonomy.summarize)
      ? Taxonomy.summarize(classes)
      : { correct: 0, rejected: 0, silentFailures: 0, correctnessRate: 0, silentFailureRate: 0, syntaxErrorRate: 0, runtimeErrorRate: 0, wrongOutputRate: 0, counts: {} };
    return {
      cases: rows.length,
      compileSuccess: rows.filter(function (r) { return r.compileSuccess; }).length,
      syntaxSuccess: rows.filter(function (r) { return r.syntaxSuccess === true; }).length,
      runtimeSuccess: rows.filter(function (r) { return r.runtimeSuccess === true; }).length,
      correct: tax.correct,
      rejected: tax.rejected,
      silentFailures: tax.silentFailures,
      correctnessRate: round6(tax.correctnessRate),
      silentFailureRate: round6(tax.silentFailureRate),
      syntaxErrorRate: round6(tax.syntaxErrorRate),
      runtimeErrorRate: round6(tax.runtimeErrorRate),
      wrongOutputRate: round6(tax.wrongOutputRate),
      counts: tax.counts,
      avgPrecision: round6(average(mets.map(function (m) { return m.precision; }))),
      avgRecall: round6(average(mets.map(function (m) { return m.recall; }))),
      avgF1: round6(average(mets.map(function (m) { return m.f1; }))),
      avgF1Normalized: round6(average(mets.map(function (m) { return m.normalized ? m.normalized.f1 : m.f1; }))),
      avgGenerationTimeMs: Math.round(average(rows.map(function (r) { return r.generationTimeMs; })) * 1000) / 1000
    };
  }

  function summarize(results) {
    const out = { cases: results.length };
    SIDE_KEYS.forEach(function (key) { out[key] = sideSummary(results, key); });
    return out;
  }

  function summarizeGroups(results) {
    const groups = {};
    ['seed', 'holdout', 'injected'].forEach(function (g) {
      const rows = results.filter(function (r) { return r.group === g; });
      groups[g] = rows.length ? summarize(rows) : null;
    });
    return groups;
  }

  function computeStats(results) {
    const out = {};
    if (!Stats) return out;
    ['seed', 'holdout', 'injected'].forEach(function (g) {
      const rows = results.filter(function (r) { return r.group === g; });
      if (!rows.length) return;
      const stats = {};
      SIDE_KEYS.forEach(function (key) {
        const successes = rows.filter(function (r) { return r[key].correct; }).length;
        stats[key] = { wilson: Stats.wilson(successes, rows.length) };
      });
      function mcnemar(baseKey) {
        let b = 0, c = 0;
        rows.forEach(function (r) {
          const pp = r.pseudopy.correct, bl = r[baseKey].correct;
          if (pp && !bl) b++;
          else if (!pp && bl) c++;
        });
        return Stats.mcnemarExact(b, c);
      }
      stats.mcnemar = { vsB1: mcnemar('baseline'), vsB2: mcnemar('baselineB2') };
      stats.wilcoxonTime = {
        vsB1: Stats.wilcoxon(rows.map(function (r) { return r.pseudopy.generationTimeMs - r.baseline.generationTimeMs; })),
        vsB2: Stats.wilcoxon(rows.map(function (r) { return r.pseudopy.generationTimeMs - r.baselineB2.generationTimeMs; }))
      };
      out[g] = stats;
    });
    return out;
  }

  var Sop2Report = {
    SIDE_KEYS: SIDE_KEYS,
    SIDE_LABELS: SIDE_LABELS,
    CSV_COLUMNS: CSV_COLUMNS,
    flag: flag,
    csvCell: csvCell,
    toCSV: toCSV,
    toJSON: toJSON,
    toMarkdown: toMarkdown,
    verdictText: verdictText,
    pct: pct,
    medianOf: medianOf,
    iqrOf: iqrOf,
    sideSummary: sideSummary,
    summarize: summarize,
    summarizeGroups: summarizeGroups,
    computeStats: computeStats
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Sop2Report;
  if (root) root.Sop2Report = Sop2Report;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
﻿/**
 * Resolve the syntax checker used to validate generated Python.
 *
 * - A caller-supplied function wins (used by the Node runner, which shells out
 *   to CPython, and by the browser UI, which uses Skulpt).
 * - `null`/`false` explicitly skips validation (timing-sensitive callers).
 * - Otherwise Skulpt is used when it happens to be present in the page.
 *
 * Returns `null` when none is available; the caller then reports
 * `syntaxSuccess: null` instead of claiming success it did not verify.
 */
function baselineResolveSyntaxCheck(option) {
  if (typeof option === 'function') return option;
  if (option === false || option === null) return null;
  if (typeof Sk !== 'undefined' && Sk && typeof Sk.parse === 'function') {
    return function (python) {
      // Sk.parse is (filename, code), and Skulpt needs the python3 future flag
      // configured before it can tokenize.
      if (typeof Sk.configure === 'function' && !Sk.__future__) {
        Sk.configure({ __future__: Sk.python3 });
      }
      Sk.parse('<baseline-translator>', python);
      return true;
    };
  }
  return null;
}

/**
 * Pure rule-based translation. No validation, no I/O: callers that need to
 * time generation in isolation (the SOP 2 comparison) use this directly so
 * a syntax check can never leak into the measurement.
 */
function baselineTranslateRaw(source) {
  if (source == null) source = '';
  let s = String(source);
  const lines = s.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let indent = 0;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    line = line.replace(/^\s*(\d+(?:\.\d*)?(?:[):])?)\s+(?=[A-Za-z_])/, '');
    line = line.replace(/^\s*(\d+)\s*$/, '');
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#') || t.startsWith('//')) {
      out.push('    '.repeat(indent) + t);
      continue;
    }
    const up = t.toUpperCase();
    if (up === 'BEGIN' || up === 'START') { continue; }
    if (up === 'END' || up === 'END.') {
      if (indent > 0) indent--;
      continue;
    }
    if (up.startsWith('END IF') || up === 'ENDIF') { if (indent > 0) indent--; continue; }
    if (up.startsWith('END WHILE') || up === 'ENDWHILE') { if (indent > 0) indent--; continue; }
    if (up.startsWith('END FOR') || up === 'ENDFOR') { if (indent > 0) indent--; continue; }
    if (up.startsWith('END FUNCTION') || up.startsWith('END PROCEDURE') || up === 'ENDFUNCTION' || up === 'ENDPROCEDURE') { if (indent > 0) indent--; continue; }
    if (up.startsWith('ELSE IF')) { out.push('    '.repeat(Math.max(0, indent - 1)) + 'elif ' + t.slice(7).replace(/\bTHEN\b/i, '') + ':'); continue; }
    if (up.startsWith('ELSE')) { out.push('    '.repeat(Math.max(0, indent - 1)) + 'else:'); continue; }
    if (up.startsWith('IF ')) {
      let cond = t.slice(2);
      cond = cond.replace(/\bTHEN\b/i, '');
      out.push('    '.repeat(indent) + 'if ' + cond.trim() + ':');
      indent++;
      continue;
    }
    if (up.startsWith('WHILE ')) {
      let cond = t.slice(6);
      cond = cond.replace(/\bDO\b/i, '');
      out.push('    '.repeat(indent) + 'while ' + cond.trim() + ':');
      indent++;
      continue;
    }
    if (up.startsWith('FOR EACH ')) {
      const m = t.match(/FOR\s+EACH\s+([A-Za-z_][A-Za-z0-9_]*)\s+IN\s+(.+?)\s+DO\b/i);
      if (m) { out.push('    '.repeat(indent) + 'for ' + m[1] + ' in ' + m[2] + ':'); indent++; continue; }
    }
    if (up.startsWith('FOR ')) {
      const m = t.match(/FOR\s+([A-Za-z_][A-Za-z0-9_]*)\s+FROM\s+(.+?)\s+TO\s+(.+?)(?:\s+STEP\s+(.+?))?\s+DO\b/i);
      if (m) {
        const start = (m[2] || '').trim();
        const end = (m[3] || '').trim();
        const step = (m[4] || '').trim();
        let startv = start, stopv = end, stepv = step || '1';
        try {
          const sv = parseFloat(start), ev = parseFloat(end), stv = step ? parseFloat(step) : 1;
          if (!isNaN(sv) && !isNaN(ev)) {
            if (stv <= 0) { stepv = '1'; }
            if (stv > 0) {
              if (sv <= ev) stopv = String(Math.floor(ev - sv) / stv >= 0 ? ev + 1 : ev);
              else stopv = String(ev);
            } else {
              if (sv >= ev) stopv = String(ev - 1);
              else stopv = String(ev);
            }
          }
        } catch (e) {}
        const rangeArgs = (stepv && stepv !== '1' && stepv !== '1.0') ? (startv + ',' + stopv + ',' + stepv) : (startv + ',' + stopv);
        out.push('    '.repeat(indent) + 'for ' + m[1] + ' in range(' + rangeArgs + '):');
        indent++;
        continue;
      }
    }
    if (up.startsWith('FUNCTION ') || up.startsWith('PROCEDURE ')) {
      const m = t.match(/(FUNCTION|PROCEDURE)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/i);
      if (m) { out.push('    '.repeat(indent) + 'def ' + m[2] + '(' + m[3].replace(/\s+/g, '') + '):'); indent++; continue; }
      const m2 = t.match(/(FUNCTION|PROCEDURE)\s+([A-Za-z_][A-Za-z0-9_]+)/i);
      if (m2) { out.push('    '.repeat(indent) + 'def ' + m2[2] + '():'); indent++; continue; }
    }
    if (up.startsWith('RETURN')) { out.push('    '.repeat(indent) + t.replace(/\bRETURN\b/i, 'return')); continue; }
    if (up.startsWith('CALL ')) { out.push('    '.repeat(indent) + t.replace(/\bCALL\b/i, '').trim()); continue; }
    if (up.startsWith('DISPLAY') || up.startsWith('PRINT') || up.startsWith('OUTPUT')) { out.push('    '.repeat(indent) + 'print(' + t.replace(/^(DISPLAY|PRINT|OUTPUT)\s*/i, '') + ')'); continue; }
    if (up.startsWith('INPUT') || up.startsWith('READ')) {
      const m = t.match(/(INPUT|READ)(?:\s+WITH\s+PROMPT\s+(.+?))?\s+([A-Za-z_][A-Za-z0-9_]*)/i);
      if (m) { out.push('    '.repeat(indent) + m[3] + ' = input(' + (m[2] || '') + ')'); continue; }
    }
    if (up.startsWith('DECLARE ')) { out.push('    '.repeat(indent) + '# ' + t); continue; }
    if (up.startsWith('SET ')) { out.push('    '.repeat(indent) + t.replace(/\bSET\b/i, '').replace(/\bTO\b/i, '=').trim()); continue; }
    if (up.startsWith('END ')) { if (indent > 0) indent--; continue; }
    out.push('    '.repeat(indent) + t);
  }
  const generatedPython = out.join('\n');
  return { generatedPython, translatorId: 'baseline-direct', translatorVersion: '0.1.3' };
}

/**
 * Translate and — when a checker is available — verify that the generated
 * Python actually parses. `success` is derived from that check; it is never
 * reported true for output that was not validated.
 */
function baselineTranslate(source, options) {
  const raw = baselineTranslateRaw(source);
  const check = baselineResolveSyntaxCheck(options && options.syntaxCheck);
  let syntaxSuccess = null;
  let syntaxError = null;
  if (check) {
    try {
      const r = check(raw.generatedPython);
      if (r && typeof r === 'object' && typeof r.ok === 'boolean') {
        syntaxSuccess = r.ok;
        syntaxError = r.ok ? null : (r.error || r.msg || null);
      } else {
        syntaxSuccess = r === undefined ? true : !!r;
      }
    } catch (e) {
      syntaxSuccess = false;
      syntaxError = (e && e.message) || String(e);
    }
  }
  return Object.assign({}, raw, {
    success: syntaxSuccess === true,
    syntaxSuccess,
    syntaxError,
    runtimeSuccess: null,
    runtimeError: null
  });
}

/* ============================================================
   B2 — "reasonable rule-based" baseline tier
   ------------------------------------------------------------
   Same contract as B1 (pure text -> Python, no I/O, no validation)
   but written the way a competent engineer would from the PUBLIC
   language spec in docs/compiler-language.md:

     • word operators rewritten (MOD, DIV, AND, OR, NOT, IN, IS,
       TRUE/FALSE/NULL) outside string literals
     • inclusive FOR ranges (FOR i FROM a TO b -> range(a, b + 1)),
       negative steps counted down
     • INCREMENT / DECREMENT / APPEND
     • assignment spellings <- and := normalised
     • tidy indentation driven by block sentinels

   It still has NO CFG, NO AST and NO semantic validation: it emits
   Python for whatever text it is given, so broken input is translated
   into broken Python silently. That is exactly the property SOP 2b
   needs to contrast against PseudoPy's validation mechanism.
   ============================================================ */

function _b2Indent(level) { return '    '.repeat(Math.max(0, level)); }

/** Apply a transform only to the parts of `text` outside string literals. */
function _b2OutsideStrings(text, fn) {
  let out = '';
  let seg = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      out += fn(seg);
      seg = '';
      const quote = ch;
      let str = ch;
      i++;
      while (i < text.length) {
        str += text[i];
        if (text[i] === '\\') { i++; if (i < text.length) { str += text[i]; i++; } continue; }
        if (text[i] === quote) { i++; break; }
        i++;
      }
      out += str;
      continue;
    }
    seg += ch;
    i++;
  }
  out += fn(seg);
  return out;
}

const _B2_OPS = [
  [/\bMOD\b/g, '%'],
  [/\bDIV\b/g, '//'],
  [/\bAND\b/g, 'and'],
  [/\bOR\b/g, 'or'],
  [/\bNOT\b/g, 'not'],
  [/\bIN\b/g, 'in'],
  [/\bIS\b/g, 'is'],
  [/\bTRUE\b/g, 'True'],
  [/\bFALSE\b/g, 'False'],
  [/\bNULL\b/g, 'None'],
  [/\bNONE\b/g, 'None'],
  [/<>/g, '!='],
  [/\u2190/g, '='],
  [/<-/g, '='],
  [/:=/g, '=']
];

function _b2Expr(text) {
  return _b2OutsideStrings(String(text), function (plain) {
    let s = plain;
    for (let k = 0; k < _B2_OPS.length; k++) s = s.replace(_B2_OPS[k][0], _B2_OPS[k][1]);
    return s;
  });
}

/** Turn a single `=` comparison into `==` inside a condition. */
function _b2Condition(text) {
  return _b2Expr(text).replace(/([^=!<>])=([^=])/g, '$1==$2');
}

function baselineTranslateRawB2(source) {
  if (source == null) source = '';
  const lines = String(source).replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let indent = 0;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    line = line.replace(/^\s*(\d+(?:\.\d*)?(?:[):])?)\s+(?=[A-Za-z_#])/, '');
    line = line.replace(/^\s*(\d+)\s*$/, '');
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#')) { out.push(_b2Indent(indent) + t); continue; }
    if (t.startsWith('//')) { out.push(_b2Indent(indent) + '# ' + t.slice(2).trim()); continue; }
    const up = t.toUpperCase();

    if (up === 'BEGIN' || up === 'START') continue;
    if (up === 'END' || up === 'END.') { if (indent > 0) indent--; continue; }
    if (/^END\s*IF$/.test(up) || up === 'ENDIF') { if (indent > 0) indent--; continue; }
    if (/^END\s*WHILE$/.test(up) || up === 'ENDWHILE') { if (indent > 0) indent--; continue; }
    if (/^END\s*FOR$/.test(up) || up === 'ENDFOR') { if (indent > 0) indent--; continue; }
    if (/^END\s*FUNCTION$/.test(up) || up === 'ENDFUNCTION') { if (indent > 0) indent--; continue; }
    if (/^END\s*PROCEDURE$/.test(up) || up === 'ENDPROCEDURE') { if (indent > 0) indent--; continue; }

    // DECLARE carries no Python meaning; dropping it keeps the output clean.
    if (up.startsWith('DECLARE ')) continue;

    let m = t.match(/^IF\b(.*)$/i);
    if (m && /\bTHEN\b/i.test(t)) {
      const cond = m[1].replace(/\bTHEN\b/i, '').trim();
      out.push(_b2Indent(indent) + 'if ' + _b2Condition(cond) + ':');
      indent++;
      continue;
    }
    m = t.match(/^ELSE\s*IF\b(.*)$/i);
    if (m) {
      const cond = m[1].replace(/\bTHEN\b/i, '').trim();
      out.push(_b2Indent(indent - 1) + 'elif ' + _b2Condition(cond) + ':');
      continue;
    }
    if (up === 'ELSE') { out.push(_b2Indent(indent - 1) + 'else:'); continue; }

    m = t.match(/^WHILE\b(.*)$/i);
    if (m) {
      const cond = m[1].replace(/\bDO\b/i, '').trim();
      out.push(_b2Indent(indent) + 'while ' + _b2Condition(cond) + ':');
      indent++;
      continue;
    }

    m = t.match(/^FOR\s+EACH\s+([A-Za-z_]\w*)\s+IN\s+(.+?)\s+DO\s*$/i);
    if (m) {
      out.push(_b2Indent(indent) + 'for ' + m[1] + ' in ' + _b2Expr(m[2]) + ':');
      indent++;
      continue;
    }
    m = t.match(/^FOR\s+([A-Za-z_]\w*)\s+FROM\s+(.+?)\s+TO\s+(.+?)(?:\s+STEP\s+(.+?))?\s+DO\s*$/i);
    if (m) {
      const start = _b2Expr(m[2]), stop = _b2Expr(m[3]);
      const step = m[4] ? _b2Expr(m[4]) : '';
      const stopAdj = /^\s*-\s*\d/.test(step) ? '(' + stop + ' - 1)' : '(' + stop + ' + 1)';
      const args = step && step !== '1' ? start + ', ' + stopAdj + ', ' + step : start + ', ' + stopAdj;
      out.push(_b2Indent(indent) + 'for ' + m[1] + ' in range(' + args + '):');
      indent++;
      continue;
    }

    m = t.match(/^(FUNCTION|PROCEDURE)\s+([A-Za-z_]\w*)\s*(?:\(([^)]*)\))?/i);
    if (m) {
      const params = (m[3] || '').replace(/\s+/g, ' ').trim();
      out.push(_b2Indent(indent) + 'def ' + m[2] + '(' + params + '):');
      indent++;
      continue;
    }

    m = t.match(/^(INCREMENT|DECREMENT)\s+([A-Za-z_]\w*)\s*$/i);
    if (m) {
      out.push(_b2Indent(indent) + m[2] + (m[1].toUpperCase() === 'INCREMENT' ? ' += 1' : ' -= 1'));
      continue;
    }

    m = t.match(/^APPEND\s+(.+?)\s+TO\s+(.+?)\s*$/i);
    if (m) {
      out.push(_b2Indent(indent) + _b2Expr(m[2]) + '.append(' + _b2Expr(m[1]) + ')');
      continue;
    }

    m = t.match(/^RETURN\b(.*)$/i);
    if (m) {
      out.push(_b2Indent(indent) + 'return' + (m[1].trim() ? ' ' + _b2Expr(m[1]) : ''));
      continue;
    }

    m = t.match(/^CALL\s+(.+)$/i);
    if (m) { out.push(_b2Indent(indent) + _b2Expr(m[1])); continue; }

    m = t.match(/^(DISPLAY|PRINT|OUTPUT)\s*(.*)$/i);
    if (m) { out.push(_b2Indent(indent) + 'print(' + _b2Expr(m[2]) + ')'); continue; }

    m = t.match(/^(INPUT|READ)\b(?:\s+WITH\s+PROMPT\s+(.+?))?\s+([A-Za-z_]\w*)\s*$/i);
    if (m) { out.push(_b2Indent(indent) + m[3] + ' = input(' + (m[2] ? _b2Expr(m[2]) : '') + ')'); continue; }

    m = t.match(/^SET\s+(.+?)\s+TO\s+(.+)$/i);
    if (m) { out.push(_b2Indent(indent) + _b2Expr(m[1]) + ' = ' + _b2Expr(m[2])); continue; }

    out.push(_b2Indent(indent) + _b2Expr(t));
  }
  const generatedPython = out.join('\n');
  return { generatedPython, translatorId: 'baseline-b2', translatorVersion: '0.1.0' };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { baselineTranslate, baselineTranslateRaw, baselineTranslateRawB2 };
}
if (typeof window !== 'undefined') {
  window.baselineTranslate = baselineTranslate;
  window.baselineTranslateRaw = baselineTranslateRaw;
  window.baselineTranslateRawB2 = baselineTranslateRawB2;
}
﻿/* ============================================================
   SOP 2 — Traditional baseline vs PseudoPy (DevTools panel)

   An honest experiment surface, not a demo:

   • 2a Functional correctness is stdout equality against the reference
     program, executed in Skulpt — the same criterion the Node harness
     uses. Text similarity is shown but labelled as secondary.
   • 2b Error taxonomy classifies every case and reports silent
     failures separately from detected ones.
   • 2c Translation time measures raw text -> Python only (warm-ups +
     batched loop); bundle load and execution are excluded.
   • Two baselines (B1 naive, B2 reasonable rule-based) and three
     dataset groups (seed / holdout / injected), never blended.

   All statistics, summaries, CSV and Markdown come from the shared
   modules in src/research/ (Sop2Functional, Sop2Taxonomy, Sop2Stats,
   Sop2Report, Sop2Dataset, Sop2Timing) so the panel and the Node
   harness cannot drift apart. Browser code only — no module loader here.
   ============================================================ */
(function () {
  'use strict';

  var METRICS_VERSION = '2.0.0';
  // Benchmark timing is a smaller batch than the Node harness because the
  // browser clock is coarser and Skulpt execution dominates wall time.
  var BENCH_TIMING_ITERS = 5;
  var BENCH_TIMING_WARMUP = 1;
  var PAGE_SIZE = 20;

  var engineRef = null;
  var lastDoc = null;
  var isStale = false;
  var benchCancelled = false;
  var pageState = { filter: 'all', page: 0 };

  function $(id) { return document.getElementById(id); }
  function setStatus(msg) { var el = $('sop2-status'); if (el) el.textContent = msg || ''; }
  function round3(n) { return Math.round(n * 1000) / 1000; }
  function round4(n) { return Math.round(n * 10000) / 10000; }

  function esc(s) {
    return (s == null ? '' : String(s))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function download(name, content, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  }

  // ── shared research modules (browser globals) ───────────────
  function Functional() { return window.Sop2Functional; }
  function Taxonomy() { return window.Sop2Taxonomy; }
  function Stats() { return window.Sop2Stats; }
  function Report() { return window.Sop2Report; }
  function Dataset() { return window.Sop2Dataset; }

  function similarity(gen, exp) {
    var F = Functional();
    if (!F) throw new Error('Sop2Functional not loaded (rebuild devtools bundle)');
    return F.textSimilarity(gen, exp);
  }
  function outputsMatch(a, b) { var F = Functional(); return F ? F.outputsMatch(a, b) : (a === b); }
  function classifySide(side) {
    var T = Taxonomy();
    return T ? T.classify(side) : (side.outputMatches ? 'correct' : 'wrong_output');
  }
  function isSilent(side) {
    var T = Taxonomy();
    return T ? T.isSilentFailure(side.class, side.hasWarning) : false;
  }
  function norm(src) {
    var s = src == null ? '' : String(src);
    if (typeof normalizeUnicodeOperators === 'function') s = normalizeUnicodeOperators(s);
    if (typeof normalizeLineNumbers === 'function') s = normalizeLineNumbers(s);
    return s;
  }

  function getEngine() {
    if (engineRef) return engineRef;
    if (typeof PseudocodeCompiler === 'undefined') throw new Error('Compiler not loaded');
    engineRef = new PseudocodeCompiler();
    return engineRef;
  }

  function readSource() {
    var a = $('sop2-src');
    if (a && a.value) return a.value;
    var b = $('devtools-pseudocode');
    return (b && b.value) || '';
  }
  function readRef() { var r = $('sop2-ref'); return (r && r.value) || ''; }
  function selectedTier() { var t = $('sop2-tier'); return (t && t.value) || 'baselineB2'; }
  function tierLabel(key) {
    var R = Report();
    if (R && R.SIDE_LABELS && R.SIDE_LABELS[key]) return R.SIDE_LABELS[key];
    return key === 'pseudopy' ? 'PseudoPy' : (key === 'baselineB2' ? 'Baseline B2' : 'Baseline B1');
  }

  // ── Skulpt: one runtime for every translator and the reference ──
  function ensureSk() {
    return new Promise(function (resolve) {
      if (typeof Sk !== 'undefined') { resolve(true); return; }
      if (typeof ensureSkulptLoaded !== 'function') { resolve(false); return; }
      ensureSkulptLoaded(function () { resolve(true); }, function () { resolve(false); });
    });
  }

  function skSyntax(py) {
    if (typeof Sk === 'undefined' || typeof Sk.parse !== 'function') {
      return { ok: null, error: 'Skulpt runtime unavailable' };
    }
    try {
      if (typeof Sk.configure === 'function' && !Sk.__future__) Sk.configure({ __future__: Sk.python3 });
      Sk.parse('<sop2-syntax>', py);
      return { ok: true, error: null };
    } catch (e) {
      return { ok: false, error: (e && e.toString) ? e.toString() : String(e) };
    }
  }

  function skRun(py) {
    if (typeof Sk === 'undefined') {
      return Promise.resolve({ ok: null, error: 'Skulpt runtime unavailable', stdout: '' });
    }
    var out = [];
    var limitOpts = (typeof skulptExecLimitOptions === 'function')
      ? skulptExecLimitOptions()
      : { execLimit: 15000 };
    Sk.configure(Object.assign({
      output: function (text) { out.push(text); },
      read: function (x) {
        if (Sk.builtinFiles === undefined || Sk.builtinFiles['files'][x] === undefined) {
          throw "File not found: '" + x + "'";
        }
        return Sk.builtinFiles['files'][x];
      },
      inputfun: function () { return ''; },
      inputfunTakesPrompt: true,
      __future__: Sk.python3
    }, limitOpts));
    return Sk.misceval.asyncToPromise(function () {
      return Sk.importMainWithBody('<stdin>', false, py, true);
    }).then(function () {
      return { ok: true, error: null, stdout: out.join('') };
    }, function (e) {
      return { ok: false, error: (e && e.toString) ? e.toString() : String(e), stdout: out.join('') };
    });
  }

  // ── measure one translator (translation only, timed) ────────
  function measureSide(key, ctx) {
    var T = window.Sop2Timing;
    var out = {
      side: key, generatedPython: '', rejected: false, emitted: false, hasWarning: false,
      compileSuccess: false, syntaxSuccess: null, syntaxError: null,
      runtimeSuccess: null, runtimeError: null, stdout: '',
      outputMatches: false, correct: false, class: 'unverified',
      generationTimeMs: 0, errors: []
    };
    var iters = ctx.timingIters == null ? BENCH_TIMING_ITERS : ctx.timingIters;
    var warmup = ctx.timingWarmup == null ? BENCH_TIMING_WARMUP : ctx.timingWarmup;
    var measured = (T ? T.measure : fallbackMeasure)(function () {
      if (key === 'pseudopy') {
        var res = { valid: false, python: '', errors: [] };
        try { res = ctx.engine.compile(ctx.source); } catch (e) { res = { valid: false, python: '', errors: [e.message || String(e)] }; }
        out.generatedPython = res.python || '';
        out.rejected = res.valid === false || !out.generatedPython;
        out.errors = (res.errors || []).map(function (x) { return typeof x === 'string' ? x : (x.message || String(x)); });
      } else if (key === 'baseline') {
        out.generatedPython = (window.baselineTranslateRaw ? window.baselineTranslateRaw(ctx.source) : {}).generatedPython || '';
      } else {
        out.generatedPython = (window.baselineTranslateRawB2 ? window.baselineTranslateRawB2(ctx.source) : {}).generatedPython || '';
      }
      return out.generatedPython;
    }, { warmup: warmup, iters: iters });
    out.generationTimeMs = round4(measured.perIterationMs);
    out.timing = { iterations: measured.iterations, warmup: measured.warmup, totalMs: round4(measured.totalMs) };
    out.emitted = !!out.generatedPython && out.generatedPython.trim() !== '';
    out.hasWarning = key === 'pseudopy' && out.rejected;
    return out;
  }

  function fallbackMeasure(fn, opts) {
    opts = opts || {};
    var warmup = opts.warmup == null ? 5 : opts.warmup;
    var iters = opts.iters == null ? 200 : opts.iters;
    var now = function () { return (window.performance && performance.now) ? performance.now() : Date.now(); };
    for (var w = 0; w < warmup; w++) fn();
    var t0 = now();
    for (var i = 0; i < iters; i++) fn();
    var t1 = now();
    var totalMs = t1 - t0;
    return { warmup: warmup, iterations: iters, totalMs: totalMs, perIterationMs: iters ? totalMs / iters : 0 };
  }

  // ── one comparable row (mirrors the Node harness shape) ─────
  function buildRow(src, ref, opts) {
    opts = opts || {};
    var ctx = {
      source: src,
      engine: opts.engine || getEngine(),
      timingIters: opts.timingIters,
      timingWarmup: opts.timingWarmup
    };
    var sides = {
      pseudopy: measureSide('pseudopy', ctx),
      baseline: measureSide('baseline', ctx),
      baselineB2: measureSide('baselineB2', ctx)
    };

    var keys = ['pseudopy', 'baseline', 'baselineB2'];
    var syntax = {};
    keys.forEach(function (k) {
      var s = sides[k];
      syntax[k] = s.emitted ? skSyntax(s.generatedPython) : { ok: null, error: null };
    });

    var refRunP = opts.withRuntime ? skRun(ref) : Promise.resolve({ ok: null, error: null, stdout: '' });
    var runPs = {};
    if (opts.withRuntime) {
      keys.forEach(function (k) {
        var s = sides[k];
        runPs[k] = (s.emitted && syntax[k].ok === true)
          ? skRun(s.generatedPython)
          : Promise.resolve({ ok: null, error: null, stdout: '' });
      });
    }

    return refRunP.then(function (reference) {
      return Promise.all(keys.map(function (k) { return runPs[k] || Promise.resolve(null); }))
        .then(function (runs) {
          keys.forEach(function (k, i) {
            var s = sides[k];
            var run = runs[i] || { ok: null, error: null, stdout: '' };
            s.syntaxSuccess = syntax[k].ok;
            s.syntaxError = syntax[k].error;
            s.compileSuccess = syntax[k].ok === true;
            s.runtimeSuccess = opts.withRuntime ? run.ok : null;
            s.runtimeError = run.error;
            s.stdout = run.stdout || '';
            s.outputMatches = syntax[k].ok === true && run.ok === true && outputsMatch(s.stdout, reference.stdout);
            s.class = classifySide({
              rejected: s.rejected,
              hasWarning: s.hasWarning,
              syntaxOk: s.emitted ? syntax[k].ok : (s.rejected ? null : false),
              runtimeOk: opts.withRuntime && s.emitted ? run.ok : null,
              outputMatches: s.outputMatches
            });
            s.correct = s.class === 'correct';
          });

          var metrics = {};
          keys.forEach(function (k) {
            var sim = similarity(sides[k].generatedPython, ref);
            metrics[k] = Object.assign({}, sim.raw, { raw: sim.raw, normalized: sim.normalized });
          });

          return {
            caseId: opts.caseId || 'ui',
            title: opts.title || null,
            group: opts.group || 'single',
            injectionType: opts.injectionType || null,
            baseId: opts.baseId || null,
            injectionDetail: opts.injectionDetail || null,
            input: src,
            expectedPython: ref,
            reference: { ok: reference.ok, stdout: reference.stdout, error: reference.error },
            pseudopy: sides.pseudopy,
            baseline: sides.baseline,
            baselineB2: sides.baselineB2,
            metrics: metrics
          };
        });
    });
  }

  // ── documents / aggregation (shared with the Node harness) ──
  function buildDoc(results, kind, opts) {
    opts = opts || {};
    var R = Report();
    var groups = (R && R.summarizeGroups) ? R.summarizeGroups(results) : null;
    return {
      metadata: {
        timestamp: new Date().toISOString(),
        schemaVersion: 2,
        cases: results.length,
        kind: kind,
        compiler: 'PseudoPy',
        baselines: { B1: 'naive keyword substitution', B2: 'reasonable rule-based (no validation)' },
        runtime: (typeof Sk !== 'undefined') ? 'skulpt' : 'unavailable',
        metricsVersion: METRICS_VERSION,
        correctnessDefinition: 'generated program runs and stdout equals the reference program stdout',
        timingMethod: 'translation only; warm-ups then batched iterations; median/IQR across cases',
        setup: opts.setup || null,
        scope: opts.scope || null
      },
      dataset: opts.dataset || null,
      summary: (R && R.summarize) ? R.summarize(results) : null,
      groups: groups,
      stats: (R && R.computeStats) ? R.computeStats(results) : null,
      results: results
    };
  }

  // ── rendering helpers ───────────────────────────────────────
  function badge(cls) {
    var labels = {
      correct: ['Correct', 'ok'], rejected: ['Rejected', 'warn'], syntax_error: ['Syntax error', 'bad'],
      runtime_error: ['Runtime error', 'bad'], wrong_output: ['Wrong output', 'bad'], unverified: ['Unverified', 'na']
    };
    var l = labels[cls] || [cls, 'na'];
    return '<span class="sop2-badge sop2-badge-' + l[1] + '">' + esc(l[1] === 'na' ? l[0] : l[0]) + '</span>';
  }

  function friendlyError(side) {
    if (side.class === 'correct') return 'Runs and prints exactly the reference output.';
    if (side.class === 'rejected') return 'Declined the input before generating Python (validation mechanism).';
    if (side.class === 'syntax_error') return 'Generated Python does not compile.';
    if (side.class === 'runtime_error') return 'Generated Python raised an error when run.';
    if (side.class === 'wrong_output') return 'Ran, but printed different output than the reference.';
    return 'Could not be verified in this runtime.';
  }

  function diffLines(generated, reference) {
    var F = Functional();
    var refSet = {};
    String(reference || '').replace(/\r\n?/g, '\n').split('\n').forEach(function (line) {
      var key = line.trim();
      if (key) refSet[key] = true;
    });
    var normalFn = (F && F.normalizeSemantic) ? F.normalizeSemantic : function (x) { return x; };
    var refNorm = {};
    normalFn(reference).split('\n').forEach(function (line) { if (line.trim()) refNorm[line.trim()] = true; });
    return String(generated || '').replace(/\r\n?/g, '\n').split('\n').map(function (line) {
      var t = line.trim();
      var match = !t || refSet[t] || refNorm[normalFn(line).trim()];
      return { text: line, match: !!match };
    });
  }

  function codeBlock(id, generated, reference, label) {
    var lines = diffLines(generated, reference);
    var rows = lines.map(function (l, i) {
      var cls = l.match ? 'sop2-line sop2-line-match' : 'sop2-line sop2-line-extra';
      if (!l.text.trim()) cls = 'sop2-line sop2-line-empty';
      return '<span class="' + cls + '"><span class="sop2-ln" aria-hidden="true">' + (i + 1) + '</span>' +
        '<span class="sop2-lc">' + (l.text ? esc(l.text) : '&nbsp;') + '</span></span>';
    }).join('');
    return '<div class="sop2-code" role="group" aria-label="' + esc(label) + '">' +
      (rows || '<span class="sop2-line sop2-line-empty"><span class="sop2-lc">(no output)</span></span>') + '</div>';
  }

  function metricRow(label, value) {
    return '<div class="sop2-kv-row"><dt>' + esc(label) + '</dt><dd>' + value + '</dd></div>';
  }

  function renderSideCard(key, row, tierKey) {
    var side = row[key];
    var isPP = key === 'pseudopy';
    var metrics = row.metrics[key];
    var cls = side.class;
    var errText = side.syntaxError || side.runtimeError || '';
    var rejected = isPP && side.rejected;
    var why = friendlyError(side);
    if (rejected && side.errors && side.errors.length) why += ' ' + side.errors.join(' ');
    return '<article class="sop2-card' + (isPP ? ' sop2-card-pseudopy' : '') + '">' +
      '<header class="sop2-card-head"><h4>' + esc(tierLabel(key)) + '</h4>' + badge(cls) + '</header>' +
      '<dl class="sop2-kv">' +
        metricRow('Outcome', esc(why)) +
        metricRow('Translation time', round3(side.generationTimeMs) + ' ms' +
          (side.timing ? ' <span class="sop2-sub">(' + side.timing.iterations + ' iterations)</span>' : '')) +
        metricRow('Functional correctness', side.correct
          ? '<span class="sop2-ok">matches reference output</span>'
          : (side.outputMatches ? 'n/a' : '<span class="sop2-bad">does not match</span>')) +
        metricRow('Line similarity (secondary)', 'P ' + round3(metrics.precision) + ' &middot; R ' + round3(metrics.recall) +
          ' &middot; F1 ' + round3(metrics.f1) + ' <span class="sop2-sub">(normalized F1 ' +
          round3(metrics.normalized ? metrics.normalized.f1 : metrics.f1) + ')</span>') +
      '</dl>' +
      '<div class="sop2-code-head">Generated Python' +
        '<span class="sop2-legend"><span class="sop2-swatch sop2-line-match"></span> also in reference' +
        '<span class="sop2-swatch sop2-line-extra"></span> different</span></div>' +
      codeBlock('sop2-code-' + key, side.generatedPython, row.expectedPython, tierLabel(key) + ' generated Python') +
      (errText ? '<details class="sop2-details"><summary>Error details</summary><pre class="sop2-errors">' +
        esc(errText) + '</pre></details>' : '') +
      '</article>';
  }

  function renderCase(row) {
    var tier = selectedTier();
    return '<div class="sop2-cards">' + renderSideCard(tier, row, tier) +
      renderSideCard('pseudopy', row, tier) + '</div>' +
      '<p class="sop2-footnote">Correctness = the generated program runs and its printed output equals the ' +
      'reference program. Similarity is frequency-based and shown only as context.</p>';
  }

  // ── charts (shared .an-chart-card styling, 250px plot) ──────
  var CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

  function svgBars(chart) {
    var W = 640, H = 250, padL = 46, padR = 12, padT = 14, padB = 52;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var max = chart.max || 100;
    var cats = chart.categories || [];
    var series = chart.series || [];
    var groupW = cats.length ? plotW / cats.length : plotW;
    var barW = Math.min(38, (groupW * 0.7) / Math.max(1, series.length));
    var svg = ['<svg class="an-svg sop2-chart-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(chart.title) + '">'];
    for (var t = 0; t <= 4; t++) {
      var y = padT + plotH - (plotH * t / 4);
      var val = (max * t / 4);
      svg.push('<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" class="an-grid-line"/>');
      svg.push('<text x="' + (padL - 6) + '" y="' + (y + 3) + '" text-anchor="end" class="an-axis-label">' +
        Math.round(val) + (chart.suffix || '') + '</text>');
    }
    cats.forEach(function (cat, ci) {
      var gx = padL + groupW * ci + groupW / 2;
      var totalW = barW * series.length + 4 * (series.length - 1);
      var startX = gx - totalW / 2;
      series.forEach(function (s, si) {
        var v = Math.max(0, Math.min(max, cat.values[si] || 0));
        var h = plotH * (v / max);
        var x = startX + si * (barW + 4);
        var y = padT + plotH - h;
        svg.push('<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + Math.max(0.5, h) +
          '" rx="3" fill="' + (s.color || CHART_COLORS[si % CHART_COLORS.length]) + '"><title>' +
          esc(cat.label + ' — ' + s.name + ': ' + v + (chart.suffix || '')) + '</title></rect>');
      });
      svg.push('<text x="' + gx + '" y="' + (padT + plotH + 18) + '" text-anchor="middle" class="an-axis-label">' +
        esc(cat.label) + '</text>');
    });
    svg.push('</svg>');
    var legend = series.map(function (s, si) {
      return '<span class="an-legend-chip"><span class="an-legend-dot" style="background:' +
        (s.color || CHART_COLORS[si % CHART_COLORS.length]) + '"></span>' + esc(s.name) + '</span>';
    }).join('');
    return '<figure class="an-chart-card an-grow">' +
      '<figcaption class="an-chart-header"><div><span class="an-chart-title">' + esc(chart.title) + '</span>' +
      (chart.note ? '<p class="sop2-chart-note">' + esc(chart.note) + '</p>' : '') + '</div></figcaption>' +
      '<div class="sop2-chart-legend">' + legend + '</div>' + svg.join('') + '</figure>';
  }

  function correctnessChart(doc) {
    var groups = ['seed', 'holdout', 'injected'].filter(function (g) { return doc.groups && doc.groups[g]; });
    var cats = groups.map(function (g) {
      return {
        label: g,
        values: [
          Math.round(doc.groups[g].pseudopy.correctnessRate * 100),
          Math.round(doc.groups[g].baseline.correctnessRate * 100),
          Math.round(doc.groups[g].baselineB2.correctnessRate * 100)
        ]
      };
    });
    return svgBars({
      title: 'SOP 2a — Functional correctness by group', suffix: '%', max: 100, categories: cats,
      series: [
        { name: 'PseudoPy', color: 'var(--chart-1)' },
        { name: 'Baseline B1', color: 'var(--chart-2)' },
        { name: 'Baseline B2', color: 'var(--chart-3)' }
      ],
      note: 'stdout equality vs reference; groups never blended'
    });
  }

  function outcomeChart(doc) {
    var keys = ['pseudopy', 'baseline', 'baselineB2'];
    var total = doc.results.filter(function (r) { return r.group !== 'injected'; }).length || 1;
    var categories = [
      { label: 'PseudoPy', values: [] }, { label: 'B1', values: [] }, { label: 'B2', values: [] }
    ];
    categories.forEach(function (cat, i) {
      var key = ['pseudopy', 'baseline', 'baselineB2'][i];
      var s = doc.summary[key];
      cat.values = [s.correct, s.rejected, s.silentFailures];
    });
    return svgBars({
      title: 'Outcome mix by translator (well-formed cases)',
      note: 'rejected = validation caught it; silent = ran or failed with no warning',
      max: total,
      suffix: '',
      categories: categories,
      series: [
        { name: 'Correct', color: CHART_COLORS[0] },
        { name: 'Rejected (warned)', color: 'var(--chart-4)' },
        { name: 'Silent failures', color: 'var(--chart-5)' }
      ]
    });
  }

  // ── benchmark report ────────────────────────────────────────
  function pctOf(x) { return Math.round(x * 1000) / 10 + '%'; }

  function statCards(doc) {
    var tier = selectedTier();
    var seed = doc.groups.seed, hold = doc.groups.holdout, inj = doc.groups.injected;
    var cards = [];

    function aaRow(label, s) {
      if (!s) return '';
      var pp = s.pseudopy.correctnessRate, bl = s[tier].correctnessRate;
      var rel = bl > 0 ? ((pp - bl) / bl) * 100 : null;
      return '<tr><th scope="row">' + esc(label) + '</th><td>' + pctOf(pp) + '</td><td>' + pctOf(bl) +
        '</td><td>' + (rel == null ? (pp > 0 ? 'n/a' : '0%') : (rel >= 0 ? '+' : '') + Math.round(rel * 10) / 10 + '%') + '</td></tr>';
    }
    cards.push('<section class="sop2-statcard"><h4>2a &middot; Functional correctness</h4>' +
      '<p class="sop2-statq">Do the generated programs print the reference output?</p>' +
      '<table class="sop2-mini"><thead><tr><th scope="col">Group</th><th scope="col">PseudoPy</th><th scope="col">' +
      esc(tierLabel(tier)) + '</th><th scope="col">Relative</th></tr></thead><tbody>' +
      aaRow('Seed', seed) + aaRow('Holdout', hold) + aaRow('Injected', inj) + '</tbody></table></section>');

    var rows = doc.results.filter(function (r) { return r.group !== 'injected'; });
    var detected = inj ? inj.pseudopy.rejected + '/' + inj.cases : 'n/a';
    cards.push('<section class="sop2-statcard"><h4>2b &middot; Error detection</h4>' +
      '<p class="sop2-statq">Are malformed inputs caught before they fail silently?</p>' +
      '<table class="sop2-mini"><thead><tr><th scope="col">Translator</th><th scope="col">Rejected (warned)</th>' +
      '<th scope="col">Silent failures</th></tr></thead><tbody>' +
      ['pseudopy', 'baseline', 'baselineB2'].map(function (k) {
        var injS = inj ? inj[k] : null; var wfS = doc.summary[k];
        return '<tr><th scope="row">' + esc(tierLabel(k)) + '</th><td>' +
          (injS ? injS.rejected + '/' + injS.cases : '0') + '</td><td>' +
          (injS ? injS.silentFailures : 0) + ' (injected) &middot; ' + wfS.silentFailures + ' (well-formed)</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="sop2-sub">Injected set: ' + (inj ? inj.cases + ' deliberately broken cases' : 'not run') + '.</p></section>');

    var R = Report();
    var mPP = R.medianOf(doc.results, 'pseudopy'), mB1 = R.medianOf(doc.results, 'baseline'), mB2 = R.medianOf(doc.results, 'baselineB2');
    cards.push('<section class="sop2-statcard"><h4>2c &middot; Translation time</h4>' +
      '<p class="sop2-statq">How long does raw text &rarr; Python take (translation only)?</p>' +
      '<table class="sop2-mini"><thead><tr><th scope="col">Translator</th><th scope="col">Median</th>' +
      '<th scope="col">IQR</th></tr></thead><tbody>' +
      [['pseudopy', mPP], ['baseline', mB1], ['baselineB2', mB2]].map(function (pair) {
        return '<tr><th scope="row">' + esc(tierLabel(pair[0])) + '</th><td>' + round3(pair[1]) + ' ms</td><td>' +
          round3(R.iqrOf(doc.results, pair[0])) + ' ms</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="sop2-sub">Validation adds about ' + round3(mPP - mB1) + ' ms per translation vs B1.</p></section>');

    return '<div class="sop2-statcards">' + cards.join('') + '</div>';
  }

  function filterRow(r, filter) {
    if (filter === 'all') return true;
    if (filter === 'injected') return r.group === 'injected';
    if (r.group === 'injected') return false;
    if (filter === 'differ') return r.pseudopy.class !== r.baselineB2.class || !r.pseudopy.correct;
    if (filter === 'pp-fail') return !r.pseudopy.correct;
    if (filter === 'bl-fail') return !r[selectedTier()].correct;
    return true;
  }

  function renderTable(doc) {
    var rows = doc.results.filter(function (r) { return filterRow(r, pageState.filter); });
    var pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (pageState.page >= pages) pageState.page = pages - 1;
    var slice = rows.slice(pageState.page * PAGE_SIZE, pageState.page * PAGE_SIZE + PAGE_SIZE);
    var tier = selectedTier();
    var filters = [['all', 'All'], ['differ', 'Differences'], ['pp-fail', 'PseudoPy failures'],
      ['bl-fail', tierLabel(tier) + ' failures'], ['injected', 'Injected']];
    var head = '<div class="sop2-table-tools">' +
      '<label class="sop2-field" for="sop2-filter"><span>Filter</span><select id="sop2-filter">' +
      filters.map(function (f) {
        return '<option value="' + f[0] + '"' + (pageState.filter === f[0] ? ' selected' : '') + '>' + esc(f[1]) + '</option>';
      }).join('') + '</select></label>' +
      '<span class="sop2-count">' + rows.length + ' of ' + doc.results.length + ' cases</span></div>';

    var body = slice.map(function (r) {
      var bl = r[tier];
      return '<tr class="' + (r.pseudopy.correct ? 'sop2-tr-ok' : 'sop2-tr-diff') + '">' +
        '<td class="sop2-col-case"><span class="sop2-caseid">' + esc(r.caseId) + '</span>' +
          (r.group ? '<span class="sop2-groupchip">' + esc(r.group) + '</span>' : '') +
          (r.injectionType ? '<span class="sop2-injchip">' + esc(r.injectionType) + '</span>' : '') + '</td>' +
        '<td>' + badge(r.pseudopy.class) + '<span class="sop2-time">' + round3(r.pseudopy.generationTimeMs) + 'ms</span></td>' +
        '<td>' + badge(bl.class) + '<span class="sop2-time">' + round3(bl.generationTimeMs) + 'ms</span></td>' +
        '<td class="sop2-col-sim">F1 ' + round3(r.metrics.pseudopy.normalized ? r.metrics.pseudopy.normalized.f1 : r.metrics.pseudopy.f1) + '</td>' +
        '<td class="sop2-col-note">' + esc(r.injectionDetail || (r.pseudopy.correct ? '' : friendlyError(r.pseudopy))) + '</td>' +
      '</tr>';
    }).join('');

    var pager = '<div class="sop2-pager">' +
      '<button class="btn btn-ghost" id="sop2-page-prev"' + (pageState.page === 0 ? ' disabled' : '') + '>&larr; Prev</button>' +
      '<span>Page ' + (pageState.page + 1) + ' of ' + pages + '</span>' +
      '<button class="btn btn-ghost" id="sop2-page-next"' + (pageState.page >= pages - 1 ? ' disabled' : '') + '>Next &rarr;</button>' +
      '</div>';

    return head +
      '<div class="sop2-tablewrap"><table class="sop2-table sop2-results"><thead><tr>' +
      '<th scope="col">Case</th><th scope="col">PseudoPy</th><th scope="col">' + esc(tierLabel(tier)) +
      '</th><th scope="col">Similarity</th><th scope="col">Note</th></tr></thead><tbody>' +
      (body || '<tr><td colspan="5" class="sop2-empty">No cases match this filter.</td></tr>') +
      '</tbody></table></div>' + pager;
  }

  function renderBenchmark(doc) {
    var R = Report();
    return statCards(doc) +
      '<p class="sop2-verdict">' + esc(R.verdictText(doc)) + '</p>' +
      '<div class="sop2-charts">' + correctnessChart(doc) + outcomeChart(doc) + '</div>' +
      renderTable(doc);
  }

  function renderEmpty() {
    return '<div class="devtools-idle-message"><p>Load an example or paste pseudocode, then press ' +
      '<strong>Compare</strong>. Benchmark runs the whole labelled dataset (seed + holdout) and reports ' +
      'correctness, error detection and translation time per group.</p></div>';
  }

  function renderDoc(doc) {
    lastDoc = doc;
    isStale = false;
    var host = $('sop2-result');
    if (host) {
      if (host.setAttribute) host.setAttribute('aria-busy', 'false');
      host.innerHTML = doc.results.length === 1 ? renderCase(doc.results[0]) : renderBenchmark(doc);
      wireResultControls(doc);
    }
    updateExportState();
  }

  function wireResultControls(doc) {
    var host = $('sop2-result');
    if (!host || !host.querySelector) return;
    var filter = host.querySelector('#sop2-filter');
    if (filter) filter.addEventListener('change', function () { pageState.filter = filter.value; pageState.page = 0; renderDoc(doc); });
    var prev = host.querySelector('#sop2-page-prev');
    if (prev) prev.addEventListener('click', function () { if (pageState.page > 0) { pageState.page--; renderDoc(doc); } });
    var next = host.querySelector('#sop2-page-next');
    if (next) next.addEventListener('click', function () { pageState.page++; renderDoc(doc); });
  }

  function updateExportState() {
    var enabled = !!lastDoc && !isStale;
    ['sop2-export-json', 'sop2-export-csv', 'sop2-export-md'].forEach(function (id) {
      var el = $(id);
      if (el) el.disabled = !enabled;
    });
  }

  function setBusy(busy) {
    ['sop2-compare', 'sop2-run', 'sop2-bench', 'sop2-export-json', 'sop2-export-csv', 'sop2-export-md'].forEach(function (id) {
      var el = $(id);
      if (el) el.disabled = busy;
    });
    if (!busy) updateExportState();
  }

  function markStale() {
    isStale = true;
    updateExportState();
  }

  // ── progress ────────────────────────────────────────────────
  function showProgress(done, total, label) {
    var wrap = $('sop2-progress'), fill = $('sop2-progress-fill'), text = $('sop2-progress-text');
    if (!wrap) return;
    wrap.classList.remove('hidden');
    var pct = total ? Math.round((done / total) * 100) : 0;
    wrap.setAttribute('aria-valuenow', String(pct));
    if (fill) fill.style.width = pct + '%';
    if (text) text.textContent = label || (done + ' / ' + total);
  }
  function hideProgress() {
    var wrap = $('sop2-progress');
    if (wrap) wrap.classList.add('hidden');
  }

  // ── handlers ────────────────────────────────────────────────
  function runCompare(withRuntime) {
    var src = norm(readSource());
    var ref = readRef();
    if (!src.trim()) { setStatus('Enter pseudocode'); return Promise.resolve(null); }
    if (!ref.trim()) { setStatus('Enter reference Python'); return Promise.resolve(null); }
    setBusy(true);
    setStatus(withRuntime ? 'Translating and running in Skulpt…' : 'Translating…');
    return ensureSk().then(function () {
      return buildRow(src, ref, { withRuntime: withRuntime, caseId: 'ui', title: null, group: 'single', timingIters: 8, timingWarmup: 2 });
    }).then(function (row) {
      var doc = buildDoc([row], withRuntime ? 'run' : 'compare', { scope: 'single case' });
      pageState = { filter: 'all', page: 0 };
      renderDoc(doc);
      setStatus(withRuntime ? 'Ran both translators in the shared Skulpt runtime' : 'Compared');
      return doc;
    }).catch(function (e) {
      setStatus('Error: ' + ((e && e.message) || e));
      return null;
    }).then(function (doc) { setBusy(false); return doc; });
  }

  function benchmark() {
    var includeInjectedEl = $('sop2-scope-injected');
    var includeInjected = !!(includeInjectedEl && includeInjectedEl.checked);
    if (typeof SEED_EXERCISES_LIST === 'undefined' || !SEED_EXERCISES_LIST.length) {
      setStatus('Seed exercises unavailable');
      return Promise.resolve(null);
    }
    var D = Dataset();
    if (!D) { setStatus('Dataset module unavailable'); return Promise.resolve(null); }
    var holdout = (typeof SOP2_HOLDOUT_CASES !== 'undefined') ? SOP2_HOLDOUT_CASES : [];
    var built = D.buildDataset(SEED_EXERCISES_LIST, holdout, { includeInjected: includeInjected, includeHoldout: true });
    var rows = built.rows;
    benchCancelled = false;
    setBusy(true);
    var cancel = $('sop2-bench-cancel');
    if (cancel) { cancel.hidden = false; cancel.disabled = false; }
    setStatus('Benchmarking ' + rows.length + ' cases…');
    showProgress(0, rows.length, '0 / ' + rows.length);

    var results = [];
    var setupMs = 0;
    return ensureSk().then(function () {
      var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
      getEngine();
      setupMs = ((window.performance && performance.now) ? performance.now() : Date.now()) - t0;

      function step(i) {
        if (benchCancelled || i >= rows.length) return Promise.resolve(results);
        var row = rows[i];
        showProgress(i, rows.length, (i + 1) + ' / ' + rows.length + ' · ' + (row.title || row.id));
        return new Promise(function (resolve) { setTimeout(resolve, 0); }).then(function () {
          return buildRow(row.source, row.referencePython, {
            withRuntime: true, caseId: row.id, title: row.title, group: row.group,
            injectionType: row.injectionType, baseId: row.baseId, injectionDetail: row.injectionDetail,
            timingIters: row.group === 'injected' ? 1 : BENCH_TIMING_ITERS,
            timingWarmup: row.group === 'injected' ? 0 : BENCH_TIMING_WARMUP
          });
        }).then(function (r) { results.push(r); return step(i + 1); });
      }
      return step(0);
    }).then(function (results) {
      if (benchCancelled) {
        setStatus('Benchmark cancelled after ' + results.length + ' cases');
        return null;
      }
      var doc = buildDoc(results, 'benchmark', {
        setup: { setupMs: round3(setupMs) },
        scope: includeInjected ? 'seed + holdout + injected' : 'seed + holdout',
        dataset: { composition: built.rows.reduce(function (acc, r) { acc[r.group] = (acc[r.group] || 0) + 1; return acc; }, {}), skippedInjections: built.injections.skipped }
      });
      pageState = { filter: 'all', page: 0 };
      renderDoc(doc);
      setStatus('Benchmark complete: ' + results.length + ' cases');
      return doc;
    }).catch(function (e) {
      setStatus('Error: ' + ((e && e.message) || e));
      return null;
    }).then(function (doc) {
      setBusy(false);
      if (cancel) cancel.hidden = true;
      hideProgress();
      return doc;
    });
  }

  function exportJSON() {
    if (!lastDoc || isStale) return;
    download('sop2-comparison-results.json', Report().toJSON(lastDoc), 'application/json');
    setStatus('Exported JSON');
  }
  function exportCSV() {
    if (!lastDoc || isStale) return;
    download('sop2-comparison-results.csv', Report().toCSV(lastDoc), 'text/csv');
    setStatus('Exported CSV');
  }
  function exportMD() {
    if (!lastDoc || isStale) return;
    download('sop2-comparison-results.md', Report().toMarkdown(lastDoc), 'text/markdown');
    setStatus('Exported Markdown report');
  }

  function bind(id, handler) {
    var el = $(id);
    if (el) el.addEventListener('click', function () { handler(); });
  }

  function populateExamples() {
    var sel = $('sop2-load-example');
    if (!sel) return;
    var seeds = (typeof SEED_EXERCISES_LIST !== 'undefined') ? SEED_EXERCISES_LIST : [];
    var holdout = (typeof SOP2_HOLDOUT_CASES !== 'undefined') ? SOP2_HOLDOUT_CASES : [];
    function add(label, rows, group) {
      if (!rows.length) return;
      var og = document.createElement('optgroup');
      og.label = label;
      rows.forEach(function (r, i) {
        var opt = document.createElement('option');
        opt.value = group + ':' + i;
        opt.textContent = (r.title || r.id || (group + ' ' + (i + 1)));
        og.appendChild(opt);
      });
      sel.appendChild(og);
    }
    add('Seed (built-in)', seeds, 'seed');
    add('Holdout (independent)', holdout, 'holdout');
  }

  function onExampleChange() {
    var sel = $('sop2-load-example');
    if (!sel || !sel.value) return;
    var parts = sel.value.split(':');
    var group = parts[0], idx = parseInt(parts[1], 10);
    var rows = group === 'seed'
      ? ((typeof SEED_EXERCISES_LIST !== 'undefined') ? SEED_EXERCISES_LIST : [])
      : ((typeof SOP2_HOLDOUT_CASES !== 'undefined') ? SOP2_HOLDOUT_CASES : []);
    var row = rows[idx];
    if (!row) return;
    var src = $('sop2-src'), ref = $('sop2-ref');
    if (src) src.value = norm(row.pseudocode || row.code || '');
    if (ref) ref.value = row.python_code || row.solution || '';
    markStale();
    setStatus('Loaded ' + (row.title || row.id || '') + ' (' + group + ')');
  }

  function wireInfo() {
    var btn = $('sop2-info-btn'), pop = $('sop2-info'), close = $('sop2-info-close');
    if (!btn || !pop) return;
    function setOpen(open) {
      pop.classList.toggle('hidden', !open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && pop.focus) pop.focus();
    }
    btn.addEventListener('click', function () { setOpen(pop.classList.contains('hidden')); });
    if (close) close.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e && e.key === 'Escape') setOpen(false);
    });
  }

  function wire() {
    bind('sop2-compare', function () { runCompare(false); });
    bind('sop2-run', function () { runCompare(true); });
    bind('sop2-bench', benchmark);
    bind('sop2-bench-cancel', function () { benchCancelled = true; setStatus('Cancelling…'); });
    bind('sop2-export-json', exportJSON);
    bind('sop2-export-csv', exportCSV);
    bind('sop2-export-md', exportMD);
    var s = $('sop2-src'), r = $('sop2-ref');
    if (s) s.addEventListener('input', markStale);
    if (r) r.addEventListener('input', markStale);
    var tier = $('sop2-tier');
    if (tier) tier.addEventListener('change', function () { if (lastDoc && !isStale) renderDoc(lastDoc); });
    var sel = $('sop2-load-example');
    if (sel) sel.addEventListener('change', onExampleChange);
    populateExamples();
    wireInfo();
    var host = $('sop2-result');
    if (host) host.innerHTML = renderEmpty();
    setBusy(false);
    updateExportState();
  }

  // The SOP2 charts and diff cards embed var(--chart-N) colours; re-render
  // the current results on 'themechange' so nothing keeps stale paints.
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('themechange', function () {
      if (lastDoc) renderDoc(lastDoc);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  // Debug/testing surface.
  window.__sop2ui = {
    compare: function () { return runCompare(false); },
    runBoth: function () { return runCompare(true); },
    benchmark: benchmark,
    lastDoc: function () { return lastDoc; },
    buildRow: buildRow,
    buildDoc: buildDoc
  };
})();
function _esc(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

function _setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}
