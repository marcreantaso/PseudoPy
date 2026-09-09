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

function _devToolsExecutePython(pythonCode, attempt) {
    const statusEl = document.getElementById('devtools-runtime-status');
    const timeEl = document.getElementById('devtools-runtime-time');
    const stdoutEl = document.getElementById('devtools-runtime-stdout');
    const stderrEl = document.getElementById('devtools-runtime-stderr');
    const pipeRuntime = document.getElementById('pipe-runtime');

    if (pipeRuntime) {
        pipeRuntime.className = 'pipeline-stage status-RUNNING';
        pipeRuntime.querySelector('.pipe-status-dot').title = 'RUNNING';
    }
    if (statusEl) statusEl.textContent = 'Running...';
    if (stdoutEl) stdoutEl.textContent = '';
    if (stderrEl) stderrEl.textContent = '';

    compilerTrace.enable();
    compilerTrace.emit({ type: 'EXECUTION_START', stage: 'EXECUTION', status: 'RUNNING', data: { pythonLength: pythonCode.length } });

    if (typeof Sk === 'undefined') {
        if (statusEl) statusEl.textContent = '⚠️ Skulpt not loaded';
        if (stderrEl) stderrEl.textContent = 'Skulpt library not available.';
        if (pipeRuntime) pipeRuntime.className = 'pipeline-stage status-ERROR';
        compilerTrace.emit({ type: 'EXECUTION_COMPLETE', stage: 'EXECUTION', status: 'ERROR', data: { error: 'Skulpt not loaded' } });
        compilerTrace.disable();
        _updateEventLog(compilerTrace.getEvents());
        return;
    }

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

        if (statusEl) statusEl.textContent = '✅ Success';
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

        if (statusEl) statusEl.textContent = '❌ Error';
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
    document.getElementById('devtools-stage-detail').innerHTML = '<div class="devtools-idle-message"><div style="font-size:2rem;margin-bottom:0.5rem">🔬</div><p>Enter pseudocode and click <strong>Run Pipeline</strong> to begin compiler analysis.</p></div>';
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

function _resetPipelineVis() {
    document.querySelectorAll('.pipeline-stage').forEach(s => {
        s.className = 'pipeline-stage';
        const dot = s.querySelector('.pipe-status-dot');
        if (dot) dot.title = 'IDLE';
        const time = s.querySelector('.pipe-time');
        if (time) time.textContent = '—';
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
    if (!container || !ast) { container.innerHTML = '<div class="devtools-idle-message"><p>No AST.</p></div>'; return; }
    container.innerHTML = '<div class="ast-node-root">' + _renderASTNode(ast, 0) + '</div>';
}

function _renderASTNode(node, depth) {
    if (!node || typeof node !== 'object') return '';
    const indent = '  '.repeat(depth);
    let html = '';

    if (node.type) {
        const props = Object.entries(node)
            .filter(([k]) => !['type', 'body', 'elseBody', 'elseIfs', 'condition', 'expr', 'startExpr', 'endExpr', 'iterable', 'params', 'value', 'index', 'args', 'tokens', 'errors'].includes(k))
            .map(([k, v]) => `<span class="ast-prop">${k}: <code>${_esc(String(v))}</code></span>`)
            .join(' ');

        html += `<details class="ast-node" open>
            <summary class="ast-node-summary">
                <span class="ast-type">${node.type}</span> ${props}
            </summary>
            <div class="ast-children">`;

        // Render child arrays
        const childArrays = ['body', 'elseBody', 'elseIfs'];
        for (const key of childArrays) {
            if (Array.isArray(node[key]) && node[key].length > 0) {
                html += `<div class="ast-child-label">${key}:</div>`;
                for (const child of node[key]) {
                    html += _renderASTNode(child, depth + 1);
                }
            }
        }

        // Render expressions
        const exprKeys = ['condition', 'expr', 'startExpr', 'endExpr', 'iterable', 'value', 'index', 'args', 'params'];
        for (const key of exprKeys) {
            if (node[key] && node[key].tokens) {
                const tokStr = node[key].tokens.map(t => t.value).join(' ');
                html += `<div class="ast-expr"><span class="ast-prop">${key}:</span> <code>${_esc(tokStr)}</code></div>`;
            }
        }

        html += '</div></details>';
    }

    return html;
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
    html += `<div class="devtools-kv"><span class="devtools-kv-key">Block Stack (at end):</span> ${blockStack.length === 0 ? 'EMPTY ✅' : blockStack.map(b => b.type + ' (line ' + b.line + ')').join(' → ')}</div>`;

    if (parserErrors.length > 0) {
        html += '<h4 style="margin-top:1rem">Parser Errors:</h4>';
        html += '<div class="devtools-error-list">';
        for (const err of parserErrors) {
            html += `<div class="devtools-error-item"><strong>Line ${err.line}:</strong> ${_esc(err.message)}`;
            if (err.suggestion) html += `<div class="devtools-suggestion">💡 ${_esc(err.suggestion)}</div>`;
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
            if (w.suggestion) html += `<div class="devtools-suggestion">💡 ${_esc(w.suggestion)}</div>`;
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
        let icon = '❌';
        let statusClass = 'attempt-error';
        if (a.status === 'RUNTIME_SUCCESS') { icon = '✅'; statusClass = 'attempt-success'; }
        else if (a.status === 'COMPILE_SUCCESS') { icon = '⚠️'; statusClass = 'attempt-warning'; }

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
            <p style="margin-top:0.75rem;opacity:0.7;font-size:0.85rem">Use <strong>Step Through</strong> to advance through individual trace events.</p>
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
