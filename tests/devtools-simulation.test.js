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

// ── Access control: the Simulation surface is admin-only ─────

test('Developer Options and its simulation page are admin-only', () => {
    const constants = fs.readFileSync(path.join(root, 'src/app/constants.js'), 'utf8');
    const pages = [...constants.match(/const PAGES = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
    const byRole = {};
    const block = constants.match(/const PAGES_BY_ROLE = \{([\s\S]*?)\n\};/)[1];
    for (const m of block.matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
        byRole[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1]);
    }

    assert.ok(pages.includes('developer-options'), 'developer-options is a real, routable page');
    assert.ok(byRole.admin.includes('developer-options'));
    assert.equal(byRole.student.includes('developer-options'), false, 'students must not reach the Simulation tab');
    assert.equal(byRole.instructor.includes('developer-options'), false, 'instructors must not reach the Simulation tab');
});

test('checkAccess denies the simulation page to every non-admin role', () => {
    // checkAccess is fail-open only for ids that are not routable pages, so the
    // page list must stay in step with the role lists.
    const constants = fs.readFileSync(path.join(root, 'src/app/constants.js'), 'utf8');
    const pages = [...constants.match(/const PAGES = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
    const block = constants.match(/const PAGES_BY_ROLE = \{([\s\S]*?)\n\};/)[1];
    const byRole = {};
    for (const m of block.matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
        byRole[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1]);
    }

    // Reproduce the documented semantics: allowed list, else fail open for
    // non-page ids. Any routable page no role claims would be open to everyone.
    const checkAccess = (role, pageId) => (byRole[role] || []).includes(pageId) || !pages.includes(pageId);

    assert.equal(checkAccess('admin', 'developer-options'), true);
    assert.equal(checkAccess('student', 'developer-options'), false);
    assert.equal(checkAccess('instructor', 'developer-options'), false);
    assert.equal(checkAccess('student', 'write-pseudocode'), true);
    assert.equal(checkAccess('student', 'manage-users'), false);

    const uncovered = pages.filter(page => !Object.values(byRole).some(list => list.includes(page)));
    assert.deepEqual(uncovered, [], 'every routable page must be claimed by a role, or checkAccess fails open');
});

// ── Pipeline wiring: Run Pipeline arms the tracer ────────────

// Loads the real devtools bundle prefix in bundle order. The pipeline view
// renderers live in pipeline-view.js and are stubbed here: this test is about
// the wiring in pipeline-controls.js, not about those renderers.
function loadPipelineRun(sourceText) {
    const src = [
        '../mapper.js',
        '../compiler.js',
        '../src/devtools/runtime-console.js',
        '../src/devtools/dom.js',
        '../src/devtools/simulation.js',
        '../src/devtools/pipeline-controls.js'
    ].map(f => fs.readFileSync(path.resolve(__dirname, f), 'utf8')).join('\n');

    const noop = () => {};
    const sandbox = vm.createContext({
        console: { log() {}, warn() {}, info() {}, error() {} },
        performance: { now: () => 0 },
        setInterval() { return 1; }, clearInterval() {}, setTimeout() { return 1; }, clearTimeout() {},
        showToast() {},
        document: {
            getElementById: () => ({
                value: sourceText, textContent: '', innerHTML: '', disabled: false,
                classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
                addEventListener: noop, removeEventListener: noop, setAttribute: noop,
                getAttribute: () => null, appendChild: noop, focus: noop, scrollIntoView: noop,
                querySelectorAll: () => [], closest: () => null, querySelector: () => null
            }),
            querySelectorAll: () => [],
            addEventListener() {},
            createElement: () => ({
                textContent: '', innerHTML: '', className: '', tagName: 'DIV',
                setAttribute: noop, getAttribute: () => null, appendChild: noop, style: {}
            })
        },
        // Stubs for the renderers owned by pipeline-view.js / inspectors.js.
        _resetPipelineVis: noop, _updatePipelineFromEvents: noop, _updatePythonOutput: noop,
        _updateTokenInspector: noop, _updateASTInspector: noop, _updateSymbolTable: noop,
        _updateParserState: noop, _updateSemanticView: noop, _updateTranslationView: noop,
        _updateErrorPanel: noop, _updateEventLog: noop, _updateMetrics: noop,
        _updateAttemptHistory: noop, _updateAutoFixPanel: noop, _updateRawJSON: noop,
        _updateActiveStage: noop, _highlightPipelineStage: noop, _renderErrorTable: noop,
        _updateSimulation: noop, devToolsSimReset: noop, ensureSkulptLoaded: async () => {},
        refreshIcons: noop, window: {}
    });
    vm.runInContext(src +
        '\nglobalThis.engine = new PseudocodeCompiler();' +
        '\nglobalThis.simulationTracer = simulationTracer;' +
        '\nglobalThis.compilerTrace = compilerTrace;' +
        '\nglobalThis.devToolsState = devToolsState;', sandbox);
    sandbox.compilerEngine = sandbox.engine;
    return sandbox;
}

test('Run Pipeline arms the tracer and stores normalized ledger events', () => {
    const program = [
        'BEGIN',
        'DECLARE total AS INTEGER',
        'FOR i FROM 1 TO 3 DO',
        'SET total TO total + i',
        'END FOR',
        'DISPLAY total',
        'END'
    ].join('\n');
    const sandbox = loadPipelineRun(program);

    assert.equal(sandbox.simulationTracer.enabled, false, 'tracing is off until the pipeline asks for it');
    sandbox.devToolsRunPipeline();

    const state = sandbox.devToolsState;
    assert.ok(state.simulationEvents.length > 10, 'the Simulation tab receives real trace events');
    assert.ok(state.simulationTrace, 'the raw envelope (source map) is retained');
    assert.ok(state.simulationTrace.sourceMap.length > 0);
    assert.equal(state.simulationStepIndex, -1, 'the ledger cursor starts before the first event');
    assert.equal(state.attempts.length, 1);
    assert.equal(state.attempts[0].simulationEvents.length, state.simulationEvents.length, 'the attempt keeps its trace');
    assert.equal(sandbox.simulationTracer.enabled, false, 'the tracer is disarmed again after the run');

    // The legacy CompilerTrace stream must survive untouched: inspectors.js and
    // pipeline-view.js still read it.
    assert.ok(Array.isArray(state.stepEvents));

    const allowed = ['RUNNING', 'SUCCESS', 'WARNING', 'ERROR'];
    state.simulationEvents.forEach(ev => assert.ok(allowed.includes(ev.status), `unexpected status ${ev.status}`));
});

test('the tracer is disarmed even when the compiler throws', () => {
    const sandbox = loadPipelineRun('BEGIN\nEND');
    sandbox.compilerEngine.compile = () => { throw new Error('compiler exploded'); };
    let disableCalls = 0;
    const realDisable = sandbox.simulationTracer.disable.bind(sandbox.simulationTracer);
    sandbox.simulationTracer.disable = () => { disableCalls++; realDisable(); };
    assert.throws(() => sandbox.devToolsRunPipeline(), /compiler exploded/);
    // The finally block must have disarmed the tracer despite the throw.
    assert.equal(disableCalls, 1, 'the tracer is disarmed on the failure path');
    assert.equal(sandbox.simulationTracer.enabled, false);
});

test('a student compile never records a simulation trace', () => {
    // Same compiler, but nothing armed the tracer: this is the student path.
    const sandbox = loadPipelineRun('BEGIN\nDISPLAY 1\nEND');
    sandbox.engine.compile('BEGIN\nDISPLAY 1\nEND');
    assert.equal(sandbox.simulationTracer.enabled, false);
    assert.equal(sandbox.simulationTracer.events.length, 0, 'no trace overhead for student compiles');
});

// ── End-to-end seam: real compiler -> real tracer -> ledger ──

// Loads the real compiler bundle (mapper first, so natural-language mapping is
// present) plus the Simulation tab adapter, mirroring the devtools bundle order.
function loadCompilerAndSimulation() {
    const files = [
        '../mapper.js',
        '../compiler.js',
        '../src/devtools/simulation.js'
    ];
    const src = files.map(f => fs.readFileSync(path.resolve(__dirname, f), 'utf8')).join('\n');
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
    vm.runInContext(src +
        '\nglobalThis.engine = new PseudocodeCompiler();' +
        '\nglobalThis.simulationTracer = simulationTracer;', sandbox);
    return sandbox;
}

test('a real traced compile fills the ledger with real events', () => {
    const sandbox = loadCompilerAndSimulation();
    sandbox.simulationTracer.enable();
    const result = sandbox.engine.compile([
        'BEGIN',
        'DECLARE total AS INTEGER',
        'FOR i FROM 1 TO 3 DO',
        'SET total TO total + i',
        'END FOR',
        'DISPLAY total',
        'END'
    ].join('\n'));
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.ok(result.simulation, 'a traced compile must return a simulation envelope');
    assert.ok(result.simulation.sourceMap.length > 0, 'the envelope carries the Python source map');

    const ledger = sandbox._normalizeSimulationTrace(result.simulation);
    assert.ok(ledger.length > 10, 'the ledger is populated from the real trace');

    // Every row is filterable and every status is one the UI can render.
    const allowed = ['RUNNING', 'SUCCESS', 'WARNING', 'ERROR'];
    ledger.forEach(ev => {
        assert.ok(allowed.includes(ev.status), `unexpected status ${ev.status}`);
        assert.equal(typeof ev.stage, 'string');
        assert.equal(typeof ev.type, 'string');
        assert.ok(ev.timeISO, 'rows render a timestamp');
    });

    // The loop body must be traceable back to real pseudocode lines.
    const declarations = ledger.filter(e => e.type === 'SYMBOL_DECLARED');
    assert.ok(declarations.length >= 2, 'total and the loop iterator are declared');
    assert.ok(declarations.some(e => e.line === 2), 'total maps to its real line');

    const stages = new Set(ledger.map(e => e.stage));
    ['LEXICAL_ANALYSIS', 'SYNTAX_ANALYSIS', 'SEMANTIC_ANALYSIS', 'CODE_GENERATION'].forEach(stage => {
        assert.ok(stages.has(stage), `${stage} must appear in the ledger`);
    });

    // Stepping the ledger walks the same events it renders.
    const state = { simulationStepIndex: -1, simulationEvents: ledger, stepEvents: [] };
    assert.equal(sandbox._simEvents(state).length, ledger.length, 'the adapter feed wins over the legacy stream');
    const first = sandbox._simStepForward(state);
    assert.equal(first.seq, ledger[0].seq);
    const last = sandbox._simStepEnd(state);
    assert.equal(last.seq, ledger[ledger.length - 1].seq);
});

test('an untraced compile leaves the adapter empty rather than inventing rows', () => {
    const sandbox = loadCompilerAndSimulation();
    const result = sandbox.engine.compile('BEGIN\nDISPLAY 1\nEND');
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.equal(result.simulation, undefined, 'tracing is opt-in');
    assert.equal(sandbox._normalizeSimulationTrace(result.simulation).length, 0);
});

test('a failed compile still yields real ledger rows and no success claim', () => {
    const sandbox = loadCompilerAndSimulation();
    sandbox.simulationTracer.enable();
    const result = sandbox.engine.compile('BEGIN\nIF x > 1 THEN\nDISPLAY 1\nEND');
    assert.equal(result.valid, false);
    assert.ok(result.simulation, 'a failed compile still returns the trace');
    assert.equal(result.python, '', 'no Python is invented for an invalid program');

    const ledger = sandbox._normalizeSimulationTrace(result.simulation);
    assert.ok(ledger.length > 0);
    const stages = new Set(ledger.map(e => e.stage));
    assert.ok(stages.has('LEXICAL_ANALYSIS'), 'lexing happened even though the program is invalid');
    assert.equal(ledger.some(e => e.status === 'ERROR' || e.status === 'WARNING'), true,
        'a broken program must be visible as such in the ledger');
});

// ── Simulation trace adapter ───────────────────────────────

test('tracer events are translated into the ledger contract', () => {
    const sandbox = loadSimulation();
    const normalized = sandbox._normalizeSimulationEvents([
        { seq: 0, stage: 'PIPELINE', type: 'STAGE_START', ts: 1, line: null, column: null, payload: { source: 'pseudocode' } },
        { seq: 1, stage: 'LEXICAL_ANALYSIS', type: 'TOKEN_EMITTED', ts: 2, line: 2, column: 5, payload: { lexeme: 'DECLARE' } },
        { seq: 2, stage: 'SEMANTIC_ANALYSIS', type: 'TYPE_WARNING', ts: 3, line: 4, column: 1, payload: { message: 'mismatch' } },
        { seq: 3, stage: 'SYNTAX_ANALYSIS', type: 'BLOCK_MISMATCH', ts: 4, line: 9, column: null, payload: { reason: 'unclosed' } }
    ]);
    assert.deepEqual(normalized.map(e => e.status), ['RUNNING', 'SUCCESS', 'WARNING', 'ERROR']);
    // _simApplyStep and the ledger filter both read these fields.
    assert.equal(normalized[1].data.line, 2, 'data.line carries the pseudocode line');
    assert.equal(normalized[1].data.lexeme, 'DECLARE', 'payload survives into data for search');
    assert.equal(normalized[3].payload.reason, 'unclosed');
    assert.equal(normalized[0].line, null, 'an absent line stays null rather than becoming 0');
    assert.equal(normalized[3].column, null);
});

test('only error-severity diagnostics are ERROR, warnings are WARNING', () => {
    const sandbox = loadSimulation();
    const [warn, err] = sandbox._normalizeSimulationEvents([
        { seq: 0, stage: 'SEMANTIC_ANALYSIS', type: 'DIAGNOSTIC_EMITTED', ts: 1, line: 3, payload: { severity: 'warning', message: 'x' } },
        { seq: 1, stage: 'SEMANTIC_ANALYSIS', type: 'DIAGNOSTIC_EMITTED', ts: 2, line: 4, payload: { severity: 'error', message: 'y' } }
    ]);
    assert.equal(warn.status, 'WARNING');
    assert.equal(err.status, 'ERROR');
});

test('every normalized status is in the #sim-ledger-status filter vocabulary', () => {
    const sandbox = loadSimulation();
    const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const options = index.match(/<select[^>]*id="sim-ledger-status"[\s\S]*?<\/select>/)[0];
    const allowed = [...options.matchAll(/value="([A-Z_]+)"/g)].map(m => m[1]);
    ['STAGE_START', 'STAGE_END', 'TOKEN_REJECTED', 'BLOCK_MISMATCH', 'TYPE_WARNING', 'DIAGNOSTIC_EMITTED', 'TRACE_TRUNCATED', 'SNAPSHOT', 'NODE_CREATED']
        .forEach(type => {
            const status = sandbox._simEventStatus(type, {});
            assert.ok(allowed.includes(status), `${type} -> ${status} must be selectable in the ledger filter`);
        });
});

test('a truncated trace is surfaced as a warning, not silently dropped', () => {
    const sandbox = loadSimulation();
    const normalized = sandbox._normalizeSimulationTrace({
        truncated: true,
        maxEvents: 50000,
        events: [{ seq: 0, stage: 'PIPELINE', type: 'TRACE_TRUNCATED', ts: 9, payload: { recorded: 50000 } }]
    });
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0].status, 'WARNING');
    assert.equal(normalized[0].data.recorded, 50000);
});

test('a missing or empty trace envelope yields no events instead of throwing', () => {
    const sandbox = loadSimulation();
    assert.equal(sandbox._normalizeSimulationTrace(null).length, 0);
    assert.equal(sandbox._normalizeSimulationTrace({ truncated: false }).length, 0);
});

test('snapshot checkpoints keep their block and symbol state', () => {
    const sandbox = loadSimulation();
    const snapshot = { stage: 'SEMANTIC_ANALYSIS', blockStack: ['IF'], tokenCount: 7, symbolTable: { x: 'INTEGER' } };
    const [ev] = sandbox._normalizeSimulationTrace({
        events: [{ seq: 0, stage: 'SEMANTIC_ANALYSIS', type: 'SNAPSHOT', ts: 4, payload: { reason: 'interval' }, snapshot }]
    });
    assert.deepEqual(ev.snapshot, snapshot);
    assert.equal(ev.snapshot.blockStack[0], 'IF');
});

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
    const state = { simulationStepIndex: -1, stepEvents: [{ type: 'A' }, { type: 'B' }, { type: 'C' }] };
    assert.equal(sandbox._simCurrentEvent(state), null, 'nothing selected before the first step');
    assert.equal(sandbox._simStepForward(state).type, 'A');
    assert.equal(state.simulationStepIndex, 0);
    assert.equal(sandbox._simStepForward(state).type, 'B');
    assert.equal(sandbox._simStepEnd(state).type, 'C');
    assert.equal(state.simulationStepIndex, 2);
    assert.equal(sandbox._simStepForward(state).type, 'C', 'forward stays clamped at the end');
    assert.equal(sandbox._simStepBack(state).type, 'B');
    assert.equal(sandbox._simStepBegin(state).type, 'A');

    const empty = { simulationStepIndex: -1, stepEvents: [] };
    assert.equal(sandbox._simStepForward(empty), null);
    assert.equal(sandbox._simStepBack(empty), null);
    assert.equal(sandbox._simStepBegin(empty), null);
    assert.equal(sandbox._simStepEnd(empty), null);
});

test('the Simulation cursor is independent of the pipeline stepper cursor', () => {
    const sandbox = loadSimulation();
    const state = { stepIndex: -1, simulationStepIndex: -1, stepEvents: [{ type: 'P1' }, { type: 'P2' }] };
    sandbox._simStepForward(state);
    assert.equal(state.simulationStepIndex, 0);
    assert.equal(state.stepIndex, -1, 'stepping the ledger must not move the pipeline stepper');
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