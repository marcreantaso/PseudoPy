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
    allErrors: [],         // classified errors across all stages
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
        output: function (text) { stdoutBuffer.push(text); },
        read: function (x) {
            if (Sk.builtinFiles === undefined || Sk.builtinFiles["files"][x] === undefined)
                throw "File not found: '" + x + "'";
            return Sk.builtinFiles["files"][x];
        },
        inputfun: function (promptText) {
            return new Promise(function (resolve) {
                const value = prompt(promptText || 'Input required:');
                resolve(value || '');
            });
        },
        inputfunTakesPrompt: true,
        __future__: Sk.python3
    });

    Sk.misceval.asyncToPromise(function () {
        return Sk.importMainWithBody("<stdin>", false, pythonCode, true);
    }).then(function () {
        const execTime = performance.now() - execStart;
        const stdout = stdoutBuffer.join('');

        if (statusEl) statusEl.textContent = '{{ui:CircleCheck}} Success';
        if (stdoutEl) stdoutEl.textContent = stdout || '(no output)';
        if (timeEl) timeEl.textContent = execTime.toFixed(3) + ' ms';
        if (pipeRuntime) {
            pipeRuntime.className = 'pipeline-stage status-SUCCESS';
            const pt = pipeRuntime.querySelector('.pipe-time');
            if (pt) pt.textContent = execTime.toFixed(2) + ' ms';
        }

        const dm = document.getElementById('dm-exec-time');
        if (dm) dm.textContent = execTime.toFixed(3) + ' ms';

        attempt.runtimeOutput = stdout;
        attempt.status = 'RUNTIME_SUCCESS';

        compilerTrace.emit({ type: 'EXECUTION_COMPLETE', stage: 'EXECUTION', status: 'SUCCESS', data: { stdout, executionTime: execTime } });
        compilerTrace.disable();
        devToolsState.stepEvents = compilerTrace.getEvents();
        _updateEventLog(devToolsState.stepEvents);
        _updateRawJSON(devToolsState.currentResult, { stdout, stderr: '', executionTime: execTime });

        // Build execution trace from AST
        _buildExecutionTrace(devToolsState.currentResult, stdout);

    }).catch(function (err) {
        const execTime = performance.now() - execStart;
        const errStr = err.toString();

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

    const afp = document.getElementById('devtools-autofix-panel');
    if (afp) afp.classList.add('hidden');
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
    const el = document.getElementById('devtools-python-output');
    if (!el) return;
    navigator.clipboard.writeText(el.textContent).then(() => {
        if (typeof showToast === 'function') showToast('Python code copied!', 'success');
    });
}

// ══════════════════════════════════════════════════════════════
// PIPELINE VISUALIZER — Updates from REAL trace events
// ══════════════════════════════════════════════════════════════

