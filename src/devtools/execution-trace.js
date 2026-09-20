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

