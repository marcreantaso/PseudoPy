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
        const row = document.createElement('div');
        row.className = 'devtools-console-row ' + _consoleRowClass(entry.kind);
        const text = document.createElement('span');
        text.className = 'devtools-console-row-text';
        text.textContent = entry.text;
        row.appendChild(text);
        container.appendChild(row);
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
}/* ============================================================
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
}

// ══════════════════════════════════════════════════════════════
// TAB SWITCHING
// ══════════════════════════════════════════════════════════════

function devToolsSwitchTab(tabId) {
    document.querySelectorAll('#devtools-tab-bar .devtools-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.devtools-tab-panel').forEach(p => p.classList.remove('active'));
    const btn = document.querySelector(`#devtools-tab-bar .devtools-tab[data-tab="${tabId}"]`);
    if (btn) btn.classList.add('active');
    const panel = document.getElementById('devtools-panel-' + tabId);
    if (panel) panel.classList.add('active');
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
    const result = compilerEngine.compile(pseudocode);

    // Disable tracing (avoid noise from student-facing compilations)
    compilerTrace.disable();

    devToolsState.currentResult = result;
    devToolsState.stepEvents = compilerTrace.getEvents();
    devToolsState.stepIndex = -1;

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
        loadScripts(CDN_BASE_URLS.skulpt, function () {
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

    Sk.configure({
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
    });

    const execFn = function () {
        return Sk.importMainWithBody("<stdin>", false, pythonCode, true);
    };
    // Best-effort execution budget for Skulpt builds that expose
    // Sk.misceval.timeout; tight synchronous loops cannot be preempted.
    const guardedExec = (typeof Sk.misceval.timeout === 'function') ? Sk.misceval.timeout(execFn, 15000) : execFn;

    Sk.misceval.asyncToPromise(guardedExec).then(function () {
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
        if (typeof runtimeConsole !== 'undefined') runtimeConsole.fail(err);
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
            message: errStr, suggestion: 'Check the generated Python code for runtime issues.'
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
    devToolsState.allErrors = [];
    compilerTrace.reset();
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
    _setText('devtools-raw-events', safeStringify(devToolsState.stepEvents));
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
}/* ============================================================
   COMPILER PIPELINE SIMULATION (devtools Simulation tab)
   Admin-only views inside Developer Options built exclusively
   from REAL compiler data:
     - Control Flow Graph        derived from the parsed AST
     - SDT table                 AST node -> generated Python
     - NLP mapping diff          original vs real mappedCode
     - Event ledger              real CompilerTrace events
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
    return (state.stepEvents || [])[state.stepIndex] || null;
}

function _simStepForward(state) {
    const events = state.stepEvents || [];
    if (events.length === 0) return null;
    state.stepIndex = Math.min((state.stepIndex == null ? -1 : state.stepIndex) + 1, events.length - 1);
    return events[state.stepIndex];
}

function _simStepBack(state) {
    const events = state.stepEvents || [];
    if (events.length === 0) return null;
    state.stepIndex = Math.max((state.stepIndex == null ? 0 : state.stepIndex) - 1, 0);
    return events[state.stepIndex];
}

function _simStepBegin(state) {
    const events = state.stepEvents || [];
    if (events.length === 0) return null;
    state.stepIndex = 0;
    return events[0];
}

function _simStepEnd(state) {
    const events = state.stepEvents || [];
    if (events.length === 0) return null;
    state.stepIndex = events.length - 1;
    return events[state.stepIndex];
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

function devToolsSimPopulateFilters() {
    const events = (typeof devToolsState !== 'undefined') ? devToolsState.stepEvents : [];
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
    const events = (typeof devToolsState !== 'undefined') ? devToolsState.stepEvents : [];
    _renderSimLedger(events);
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
        const events = (typeof devToolsState !== 'undefined') ? devToolsState.stepEvents : [];
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
        const current = _simCurrentEvent(devToolsState);
        if (current && devToolsState.stepIndex >= devToolsState.stepEvents.length - 1) {
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
    devToolsSimFilterLedger();
}

function _updateSimulation(result) {
    const ast = result && result.ast ? result.ast : null;
    _renderSimCfg(ast);
    _renderSimSdt(ast, (result && result.symbolTable) || {});
    const originalEl = document.getElementById('devtools-pseudocode');
    const original = originalEl ? originalEl.value : '';
    _renderSimNlp(original, (result && result.mappedCode) || '');
    _renderSimMetrics(result);
    _renderSimVerdict();

    const events = (typeof devToolsState !== 'undefined') ? devToolsState.stepEvents : [];
    devToolsSimPopulateFilters();
    _renderSimLedger(events);

    const hasEvents = events.length > 0;
    ['sim-step-play', 'sim-step-begin', 'sim-step-fwd', 'sim-step-back', 'sim-step-end'].forEach(function (id) {
        const btn = document.getElementById(id);
        if (btn) btn.disabled = !hasEvents;
    });
}function _esc(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

function _setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}
