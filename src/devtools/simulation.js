/* ============================================================
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
}