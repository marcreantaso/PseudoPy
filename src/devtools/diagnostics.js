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

