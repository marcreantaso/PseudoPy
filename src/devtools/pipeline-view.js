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

