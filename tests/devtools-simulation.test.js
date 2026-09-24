const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');

function loadSimulation() {
    const files = [
        'src/compiler/tokens-and-trace.js',
        'src/compiler/expressions.js',
        'src/compiler/code-generator.js',
        'src/devtools/simulation.js'
    ];
    const src = files.map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
    const sandbox = vm.createContext({
        console: { log() {}, warn() {}, info() {}, error() {} },
        performance: { now: () => 0 },
        document: {
            getElementById: () => null,
            querySelectorAll: () => ({ forEach() {}, length: 0 })
        },
        clearInterval() {},
        setInterval() { return 1; }
    });
    vm.runInContext(src + '\nthis.TOKEN_TYPES = TOKEN_TYPES;', sandbox);
    return sandbox;
}

// ── Control Flow Graph (derived from the real AST) ────────────

test('CFG covers a linear statement sequence from entry to exit', () => {
    const sandbox = loadSimulation();
    const ast = {
        line: 1,
        body: [
            { type: 'DeclareStatement', id: 'x', varType: 'INTEGER', line: 2 },
            { type: 'InputStatement', id: 'y', line: 3 }
        ]
    };
    const graph = sandbox._buildCfgFromAst(ast);
    assert.equal(graph.nodes.length, 4, 'entry + 2 statements + exit');
    assert.equal(graph.edges.length, 3, 'entry->s1, s1->s2, s2->exit');
});

test('CFG models IF/THEN/ELSE with true/false decision edges', () => {
    const sandbox = loadSimulation();
    const T = sandbox.TOKEN_TYPES;
    const ast = {
        line: 1,
        body: [
            { type: 'DeclareStatement', id: 'x', varType: 'INTEGER', line: 2 },
            {
                type: 'IfStatement', line: 3,
                condition: { tokens: [{ type: T.IDENTIFIER, value: 'x' }, { type: T.OPERATOR, value: '>' }, { type: T.NUMBER, value: '0' }] },
                body: [{ type: 'PrintStatement', line: 4, expr: { tokens: [{ type: T.NUMBER, value: '1' }] } }],
                elseIfs: [],
                elseBody: [{ type: 'PrintStatement', line: 6, expr: { tokens: [{ type: T.NUMBER, value: '0' }] } }]
            },
            { type: 'InputStatement', id: 'y', line: 8 }
        ]
    };
    const graph = sandbox._buildCfgFromAst(ast);
    const kinds = graph.nodes.map(n => n.kind);
    assert.equal(kinds.filter(k => k === 'entry').length, 1);
    assert.equal(kinds.filter(k => k === 'exit').length, 1);
    assert.equal(kinds.filter(k => k === 'decision').length, 1, 'one IF produces one decision node');
    assert.equal(kinds.filter(k => k === 'join').length, 1, 'one IF produces one merge node');

    const edges = graph.edges;
    const byPair = Object.fromEntries(edges.map(e => [`${e.from}->${e.to}`, e.label]));
    assert.equal(byPair['n0->n1'], null, 'entry flows into the first statement');
    assert.equal(byPair['n2->n4'], 'true', 'the IF decision true edge targets the THEN body first statement');
    assert.equal(byPair['n2->n5'], 'false', 'the IF decision false edge targets the ELSE body first statement');
    assert.equal(byPair['n4->n3'], null, 'the THEN body rejoins the merge node');
    assert.equal(byPair['n5->n3'], null, 'the ELSE body rejoins the merge node');
    assert.equal(byPair['n3->n6'], null, 'the merge node flows into the next statement');
    assert.equal(byPair['n6->n7'], null, 'the final statement reaches exit');
    for (const edge of edges) {
        assert.ok(graph.nodes.some(n => n.id === edge.from), `edge source ${edge.from} exists`);
        assert.ok(graph.nodes.some(n => n.id === edge.to), `edge target ${edge.to} exists`);
    }
});

test('CFG models WHILE and FOR loops with a back edge', () => {
    const sandbox = loadSimulation();
    const T = sandbox.TOKEN_TYPES;
    const loopBody = [{ type: 'PrintStatement', line: 5, expr: { tokens: [{ type: T.NUMBER, value: '1' }] } }];
    const ast = {
        line: 1,
        body: [
            {
                type: 'WhileStatement', line: 2,
                condition: { tokens: [{ type: T.NUMBER, value: '1' }, { type: T.OPERATOR, value: '<' }, { type: T.NUMBER, value: '10' }] },
                body: loopBody
            },
            {
                type: 'ForStatement', line: 6, iterator: 'i',
                startExpr: { tokens: [{ type: T.NUMBER, value: '1' }] },
                endExpr: { tokens: [{ type: T.NUMBER, value: '5' }] },
                body: loopBody
            }
        ]
    };
    const graph = sandbox._buildCfgFromAst(ast);
    assert.ok(graph.edges.some(e => e.from === 'n3' && e.to === 'n1'), 'WHILE body ends with a back edge to its decision node');
    assert.ok(graph.edges.some(e => e.from === 'n1' && e.to === 'n2' && e.label === 'false'), 'WHILE false edge leaves the loop');
    assert.ok(graph.edges.some(e => e.from === 'n6' && e.to === 'n4'), 'FOR body ends with a back edge to its decision node');
    assert.ok(graph.edges.some(e => e.from === 'n4' && e.to === 'n5' && e.label === 'false'), 'FOR false edge leaves the loop');
    assert.ok(graph.edges.some(e => e.from === 'n2' && e.to === 'n4'), 'the WHILE merge flows into the FOR decision');
});

// ── NLP mapping diff (real original vs mappedCode) ────────────

test('NLP diff reports no change for identical sources', () => {
    const sandbox = loadSimulation();
    const diff = sandbox._buildNlpDiff('BEGIN\nSET x TO 5\nEND', 'BEGIN\nSET x TO 5\nEND');
    assert.equal(diff.changed, false);
    assert.equal(diff.spans.filter(s => s.type === 'ins').length, 0);
    assert.equal(diff.spans.filter(s => s.type === 'del').length, 0);
    assert.equal(diff.changedLines.length, 0);
});

test('NLP diff marks inserted and deleted tokens and affected lines', () => {
    const sandbox = loadSimulation();
    const diff = sandbox._buildNlpDiff(
        'BEGIN\nIF x > 0 THEN\nDISPLAY "hi"\nEND',
        'BEGIN\nIF x is greater than 0 THEN\nDISPLAY "hi"\nEND'
    );
    assert.equal(diff.changed, true);
    assert.ok(diff.spans.some(s => s.type === 'ins'), 'inserted words appear as insertion spans');
    assert.ok(diff.spans.some(s => s.type === 'del'), 'rewritten words appear as deletion spans');
    assert.ok(diff.changedLines.some(c => c.line === 2), 'the rewritten line is reported');
    assert.equal(diff.changedLines.some(c => c.line === 3), false, 'unchanged lines are not reported');
});

// ── SDT table (real AST node → generated Python) ──────────────

test('SDT rows pair each AST node with its real generated Python', () => {
    const sandbox = loadSimulation();
    const T = sandbox.TOKEN_TYPES;
    const ast = {
        line: 1,
        body: [
            { type: 'DeclareStatement', id: 'x', varType: 'INTEGER', line: 2 },
            {
                type: 'IfStatement', line: 3,
                condition: { tokens: [{ type: T.IDENTIFIER, value: 'x' }, { type: T.OPERATOR, value: '>' }, { type: T.NUMBER, value: '0' }] },
                body: [{ type: 'PrintStatement', line: 4, expr: { tokens: [{ type: T.NUMBER, value: '1' }] } }],
                elseIfs: [],
                elseBody: []
            }
        ]
    };
    const rows = sandbox._buildSdtRows(ast, {});
    assert.equal(rows[0].nodeType, 'DeclareStatement');
    assert.equal(rows[0].python, '# DECLARE x AS INTEGER\nx = 0', 'declaration emits the real initializer');
    const ifRow = rows.find(r => r.nodeType === 'IfStatement');
    assert.equal(ifRow.python, 'if x > 0:\n    print(1)\nelse:\n    pass', 'condition and body generate the real Python block (empty ELSE emits pass)');
    assert.ok(ifRow.line === 3 && rows.some(r => r.nodeType === 'PrintStatement' && r.line === 4));
});

test('SDT produces no rows beyond an empty body', () => {
    const sandbox = loadSimulation();
    assert.equal(sandbox._buildSdtRows(null, {}).length, 0);
    assert.equal(sandbox._buildSdtRows({ body: [] }, {}).length, 0);
});

// ── Event ledger filters (real trace events) ──────────────────

test('ledger filters narrow real trace events by stage, status, type and search', () => {
    const sandbox = loadSimulation();
    const events = [
        { type: 'LEX_START', stage: 'LEXICAL_ANALYSIS', status: 'RUNNING', data: { a: 1 } },
        { type: 'LEX_COMPLETE', stage: 'LEXICAL_ANALYSIS', status: 'SUCCESS', data: { count: 7 } },
        { type: 'PARSE_START', stage: 'SYNTAX_ANALYSIS', status: 'RUNNING', data: {} },
        { type: 'CODEGEN_COMPLETE', stage: 'CODE_GENERATION', status: 'SUCCESS', data: { lineCount: 3 } }
    ];
    assert.equal(sandbox._filterSimEvents(events, {}).length, 4);
    assert.equal(sandbox._filterSimEvents(events, { stage: 'LEXICAL_ANALYSIS' }).length, 2);
    assert.equal(sandbox._filterSimEvents(events, { status: 'RUNNING' }).length, 2);
    assert.equal(sandbox._filterSimEvents(events, { type: 'CODEGEN_COMPLETE' }).length, 1);
    assert.equal(sandbox._filterSimEvents(events, { search: 'lineCount' }).length, 1, 'search covers event data');
    assert.equal(sandbox._filterSimEvents([], {}).length, 0);
});

// ── Step controller (advances over the real trace) ─────────────

test('step controller advances, wraps at bounds and handles empty traces', () => {
    const sandbox = loadSimulation();
    const state = { stepIndex: -1, stepEvents: [{ type: 'A' }, { type: 'B' }, { type: 'C' }] };
    assert.equal(sandbox._simCurrentEvent(state), null, 'nothing selected before the first step');
    assert.equal(sandbox._simStepForward(state).type, 'A');
    assert.equal(state.stepIndex, 0);
    assert.equal(sandbox._simStepForward(state).type, 'B');
    assert.equal(sandbox._simStepEnd(state).type, 'C');
    assert.equal(state.stepIndex, 2);
    assert.equal(sandbox._simStepForward(state).type, 'C', 'forward stays clamped at the end');
    assert.equal(sandbox._simStepBack(state).type, 'B');
    assert.equal(sandbox._simStepBegin(state).type, 'A');

    const empty = { stepIndex: -1, stepEvents: [] };
    assert.equal(sandbox._simStepForward(empty), null);
    assert.equal(sandbox._simStepBack(empty), null);
    assert.equal(sandbox._simStepBegin(empty), null);
    assert.equal(sandbox._simStepEnd(empty), null);
});

// ── Grade verdict (real stdout vs admin expected output) ───────

test('grade verdict compares real stdout to the expected output', () => {
    const sandbox = loadSimulation();
    const transcript = [{ kind: 'stdout', text: '68.4\n' }];
    const unset = sandbox._simGradeVerdict(transcript, '');
    assert.equal(unset.verdict, 'undetermined');
    assert.equal(sandbox._simGradeVerdict(transcript, '68.4').verdict, 'PASS');
    const fail = sandbox._simGradeVerdict(transcript, '90');
    assert.equal(fail.verdict, 'FAIL');
    assert.equal(fail.actual, '68.4');
    assert.equal(sandbox._simGradeVerdict([], '68.4').verdict, 'FAIL', 'empty stdout mismatches a non-empty expectation');
});

test('grade formatting is two-decimal display-only and never fabricates', () => {
    const sandbox = loadSimulation();
    assert.equal(sandbox._simFormatGrade(68.4), '68.40');
    assert.equal(sandbox._simFormatGrade(90), '90.00');
    assert.equal(sandbox._simFormatGrade('68.4'), '68.40');
    assert.equal(sandbox._simFormatGrade('n/a'), 'n/a', 'non-numeric values pass through untouched');
});

// ── Metrics chart (real compiler stage durations) ──────────────

test('metrics chart maps real stage durations into labels and widths', () => {
    const sandbox = loadSimulation();
    const chart = sandbox._simMetricsChart({ metrics: { lexTime: 1, parseTime: 2, semanticTime: 0.5, codeGenTime: 1.5, totalTime: 5 } });
    assert.equal(chart.length, 4);
    assert.equal(chart[0].label, 'Lexical');
    assert.equal(chart[0].pct, 20);
    assert.equal(chart[1].pct, 40);
    assert.equal(chart[3].pct, 30);
    const allPct = chart.reduce((sum, c) => sum + c.pct, 0);
    assert.equal(allPct, 100);
});

test('metrics chart and stage statuses degrade cleanly without metrics or events', () => {
    const sandbox = loadSimulation();
    const chart = sandbox._simMetricsChart({ metrics: {} });
    assert.ok(chart.every(c => c.ms === 0));
    const statuses = sandbox._simStageStatuses([]);
    assert.equal(statuses.length, 8);
    assert.ok(statuses.every(s => s.status === 'IDLE'));
    const after = sandbox._simStageStatuses([
        { stage: 'LEXICAL_ANALYSIS', status: 'SUCCESS' },
        { stage: 'EXECUTION', status: 'ERROR' }
    ]);
    assert.equal(after.find(s => s.stage === 'LEXICAL_ANALYSIS').status, 'SUCCESS');
    assert.equal(after.find(s => s.stage === 'EXECUTION').status, 'ERROR');
});