const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Load the real bundle the way the compiler tests do: mapper first so
// natural-language mapping is present, then the generated compiler.
function loadEngine() {
    const context = vm.createContext({ performance, console: { log() {} } });
    const src =
        fs.readFileSync(path.join(__dirname, '../mapper.js'), 'utf8') +
        '\n' +
        fs.readFileSync(path.join(__dirname, '../compiler.js'), 'utf8') +
        '\nglobalThis.engine = new PseudocodeCompiler();' +
        '\nglobalThis.tracer = simulationTracer;' +
        '\nglobalThis.types = SIMULATION_TRACE_TYPES;' +
        '\nglobalThis.Parser = Parser;';
    vm.runInContext(src, context);
    return context;
}

// The bundle runs in a vm context, so its arrays carry that realm's Array
// prototype and fail deepStrictEqual against host-realm literals. Compare
// through JSON so the assertions are about structure, not realm.
const plain = value => JSON.parse(JSON.stringify(value));

const PROGRAM = [
    'BEGIN',
    'DECLARE total AS INTEGER',
    'FOR i FROM 1 TO 3 DO',
    'SET total TO total + i',
    'END FOR',
    'DISPLAY total',
    'END'
].join('\n');

test('simulation is off by default and adds nothing to the result', () => {
    const ctx = loadEngine();
    assert.equal(ctx.tracer.enabled, false);
    const result = ctx.engine.compile(PROGRAM);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.equal(result.simulation, undefined, 'untraced compile must not carry a simulation envelope');
    assert.equal(ctx.tracer.events.length, 0, 'no events may be recorded while disabled');
});

test('traced compile returns a gap-free ordered event log', () => {
    const ctx = loadEngine();
    ctx.tracer.enable();
    const result = ctx.engine.compile(PROGRAM);
    assert.equal(result.valid, true, JSON.stringify(result.errors));

    const events = result.simulation.events;
    assert.ok(events.length > 0, 'traced compile must produce events');
    assert.deepEqual(events.map(e => e.seq), events.map((_, i) => i), 'seq must be monotonic and gap-free');

    for (const event of events) {
        assert.ok(event.type, 'every event carries a type');
        assert.ok(event.stage, 'every event carries a stage');
        assert.equal(typeof event.ts, 'number');
        assert.ok(event.line === null || typeof event.line === 'number');
        assert.ok(event.column === null || typeof event.column === 'number');
    }
});

test('traced compile leaves generated python and diagnostics identical', () => {
    const quiet = loadEngine();
    const traced = loadEngine();

    const plainResult = quiet.engine.compile(PROGRAM);
    traced.tracer.enable();
    const tracedResult = traced.engine.compile(PROGRAM);

    assert.equal(tracedResult.python, plainResult.python, 'tracing must not alter generated Python');
    assert.deepEqual(plain(tracedResult.errors.map(e => e.message)), plain(plainResult.errors.map(e => e.message)), 'tracing must not alter diagnostics');
    assert.deepEqual(plain(tracedResult.symbolTable), plain(plainResult.symbolTable), 'tracing must not alter the symbol table');
    assert.deepEqual(
        plain(tracedResult.tokens.map(t => [t.type, t.value, t.line])),
        plain(plainResult.tokens.map(t => [t.type, t.value, t.line])),
        'tracing must not alter token identity or line numbers'
    );
    assert.equal(tracedResult.metrics.tokenCount, plainResult.metrics.tokenCount);
});

test('tokens carry real 1-based columns that match the source', () => {
    const ctx = loadEngine();
    ctx.tracer.enable();
    const result = ctx.engine.compile(PROGRAM);
    const source = result.mappedCode.split('\n');
    const byValue = t => result.tokens.find(x => x.value === t);

    const begin = byValue('BEGIN');
    assert.equal(begin.line, 1);
    assert.equal(begin.column, 1);
    assert.equal(source[begin.line - 1][begin.column - 1], 'B');

    const display = byValue('DISPLAY');
    const line = source[display.line - 1];
    assert.equal(line.slice(display.column - 1, display.column - 1 + 'DISPLAY'.length), 'DISPLAY');
});

test('unavailable positions are null rather than invented', () => {
    const ctx = loadEngine();
    ctx.tracer.enable();
    const result = ctx.engine.compile('BEGIN\nDISPLAY 1\nEND');
    const stageStarts = result.simulation.events.filter(e => e.type === 'STAGE_START');
    assert.ok(stageStarts.length > 0);
    for (const event of stageStarts) {
        assert.equal(event.line, null, 'a stage boundary has no source position');
        assert.equal(event.column, null);
    }
});

test('token emission events follow real lexing order', () => {
    const ctx = loadEngine();
    ctx.tracer.enable();
    const result = ctx.engine.compile('BEGIN\nDECLARE x AS INTEGER\nEND');
    const emitted = result.simulation.events.filter(e => e.type === 'TOKEN_EMITTED');

    const significant = emitted.filter(e => e.payload.tokenType !== 'NEWLINE');
    assert.deepEqual(plain(significant.slice(0, 3).map(e => e.payload.value)), ['BEGIN', 'DECLARE', 'x'], 'first tokens are recorded in source order');
    assert.equal(emitted[emitted.length - 1].payload.tokenType, 'EOF', 'EOF is the final token');
    // Lexical order means non-decreasing line numbers.
    const lines = plain(emitted.map(e => e.line));
    assert.deepEqual(lines, lines.slice().sort((a, b) => a - b), 'token events must not go backwards through the source');
});

test('block stack mutations are recorded as push, pop, and depth', () => {
    const ctx = loadEngine();
    ctx.tracer.enable();
    const result = ctx.engine.compile(PROGRAM);

    const pushes = result.simulation.events.filter(e => e.type === 'BLOCK_PUSH');
    const pops = result.simulation.events.filter(e => e.type === 'BLOCK_POP');

    assert.equal(pushes.length, 1, 'one FOR block is opened');
    assert.equal(pushes[0].payload.blockType, 'FOR');
    assert.equal(pushes[0].payload.depth, 1);
    assert.equal(pushes[0].line, 3, 'FOR opens on its own line');

    assert.equal(pops.length, 1, 'the FOR block is closed');
    assert.equal(pops[0].payload.blockType, 'FOR');
    assert.equal(pops[0].payload.depth, 0, 'stack is empty after the pop');
});

test('nested blocks unwind innermost first', () => {
    const ctx = loadEngine();
    ctx.tracer.enable();
    const nested = [
        'BEGIN',
        'WHILE x > 0 DO',
        'IF y THEN',
        'SET x TO x - 1',
        'END IF',
        'END WHILE',
        'END'
    ].join('\n');
    const result = ctx.engine.compile(nested);
    const events = result.simulation.events.filter(e => e.type === 'BLOCK_PUSH' || e.type === 'BLOCK_POP');

    assert.deepEqual(plain(events.map(e => [e.type, e.payload.blockType])), [
        ['BLOCK_PUSH', 'WHILE'],
        ['BLOCK_PUSH', 'IF'],
        ['BLOCK_POP', 'IF'],
        ['BLOCK_POP', 'WHILE']
    ]);
});

test('unclosed block is reported as a mismatch, not a clean pop', () => {
    const ctx = loadEngine();
    ctx.tracer.enable();
    const result = ctx.engine.compile('BEGIN\nFOR i FROM 1 TO 3 DO\nDISPLAY i\nEND');
    assert.equal(result.valid, false);

    const events = result.simulation.events;
    assert.ok(events.some(e => e.type === 'BLOCK_PUSH'));
    assert.ok(!events.some(e => e.type === 'BLOCK_POP'), 'an unclosed block must never emit a pop');

    const mismatch = events.find(e => e.type === 'BLOCK_MISMATCH');
    assert.ok(mismatch, 'unclosed block reports BLOCK_MISMATCH');
    assert.equal(mismatch.payload.reason, 'unclosed');
    assert.equal(mismatch.payload.blockType, 'FOR');
});

test('a crossed terminator leaves the block open and reports it as unclosed', () => {
    const ctx = loadEngine();
    ctx.tracer.enable();
    const result = ctx.engine.compile('BEGIN\nFOR i FROM 1 TO 2 DO\nEND IF\nEND');
    assert.equal(result.valid, false);

    const mismatch = result.simulation.events.find(e => e.type === 'BLOCK_MISMATCH');
    assert.ok(mismatch, 'the crossed terminator is reported');
    assert.equal(mismatch.payload.blockType, 'FOR');
    assert.equal(mismatch.payload.reason, 'unclosed');
    assert.ok(!result.simulation.events.some(e => e.type === 'BLOCK_POP'), 'a block that was never closed reports no pop');
});

test('popBlock detects a genuine type mismatch', () => {
    // The recursive-descent rules always close the innermost block first, so
    // the mismatch branch is only reachable through the helper itself. Assert
    // it directly rather than pretending a nested source triggers it.
    const ctx = loadEngine();
    const parser = new ctx.Parser([]);
    parser.openBlock('FOR', 2, 1);
    ctx.tracer.enable();
    parser.popBlock('WHILE', 5, 1);
    ctx.tracer.disable();

    const mismatch = ctx.tracer.events.find(e => e.type === 'BLOCK_MISMATCH');
    assert.ok(mismatch, 'a mismatched closer is recorded');
    assert.equal(mismatch.payload.reason, 'type_mismatch');
    assert.equal(mismatch.payload.expected, 'FOR', 'the innermost open block is named');
    assert.equal(mismatch.payload.openedLine, 2, 'the report names the line the block opened on');
    assert.equal(mismatch.payload.blockType, 'WHILE', 'the report names what was actually found');
});

test('symbol declaration, lookup, and update are separately visible', () => {
    const ctx = loadEngine();
    ctx.tracer.enable();
    // `seed` is used before it is DECLAREd, which is the case where "read
    // before it exists" has to be visible rather than merely warned about.
    const result = ctx.engine.compile([
        'BEGIN',
        'DECLARE total AS INTEGER',
        'SET total TO 1 + 2',
        'DISPLAY total',
        'END'
    ].join('\n'));

    const events = result.simulation.events;
    assert.ok(events.some(e => e.type === 'SYMBOL_DECLARED' && e.payload.name === 'total' && e.payload.reason === 'declare'));

    const lookups = events.filter(e => e.type === 'SYMBOL_LOOKUP' && e.payload.name === 'total');
    assert.ok(lookups.length > 0, 'reading a declared variable is recorded');
    assert.ok(lookups.every(e => e.payload.found === true), 'a declared name resolves on every lookup');

    const updates = events.filter(e => e.type === 'SYMBOL_UPDATED' && e.payload.name === 'total');
    assert.ok(updates.length > 0, 'assignment updates the existing entry rather than redeclaring');
    assert.equal(updates[0].payload.before.assigned, false, 'the declared symbol starts unassigned');
    assert.equal(updates[0].payload.after.assigned, true, 'assignment marks it assigned');
    assert.equal(updates[0].payload.before.type, updates[0].payload.after.type, 'an INTEGER stays INTEGER');
});

test('an unresolved lookup is recorded as not found', () => {
    const ctx = loadEngine();
    ctx.tracer.enable();
    // `missing` is never DECLAREd, so the lookup must resolve to false.
    const result = ctx.engine.compile('BEGIN\nDISPLAY missing\nEND');
    const lookup = result.simulation.events.find(e => e.type === 'SYMBOL_LOOKUP' && e.payload.name === 'missing');
    assert.ok(lookup, 'the lookup is recorded');
    assert.equal(lookup.payload.found, false, 'an undeclared name does not resolve');
    assert.equal(lookup.payload.symbolType, null);
});

test('loop iterator is recorded as an implicit symbol at its own depth', () => {
    const ctx = loadEngine();
    ctx.tracer.enable();
    const result = ctx.engine.compile(PROGRAM);
    const iterator = result.simulation.events.find(
        e => e.type === 'SYMBOL_DECLARED' && e.payload.name === 'i'
    );
    assert.ok(iterator, 'the FOR iterator becomes a symbol');
    assert.equal(iterator.payload.implicit, true);
    assert.equal(iterator.payload.reason, 'loop_iterator');
});

test('semantic warnings are recorded as type warnings', () => {
    const ctx = loadEngine();
    ctx.tracer.enable();
    const result = ctx.engine.compile('BEGIN\nDECLARE n AS INTEGER\nSET n TO 1.5\nEND');
    const warning = result.simulation.events.find(e => e.type === 'TYPE_WARNING');
    assert.ok(warning, 'a REAL into INTEGER assignment warns');
    assert.equal(warning.payload.code, 'SEM_TYPE_MISMATCH');
    assert.equal(warning.line, 3, 'the warning points at the offending statement');
});

test('recorded events never alias live compiler state', () => {
    const ctx = loadEngine();
    ctx.tracer.enable();
    const result = ctx.engine.compile(PROGRAM);

    // Mutating the live result must not change anything already recorded.
    const before = JSON.stringify(result.simulation.events);
    result.symbolTable.total = { type: 'tampered' };
    result.tokens.length = 0;
    result.ast.body.length = 0;
    assert.equal(JSON.stringify(result.simulation.events), before, 'events must be detached copies');
});

test('source map attributes python lines to pseudocode statements', () => {
    const ctx = loadEngine();
    ctx.tracer.enable();
    const result = ctx.engine.compile(PROGRAM);
    const pythonLines = result.python.split('\n');
    const map = result.simulation.sourceMap;

    assert.equal(map.length, pythonLines.length, 'every emitted line is mapped');

    for (const entry of map) {
        assert.equal(map.filter(e => e.pythonLine === entry.pythonLine).length, 1, 'line numbers are unique');
    }

    const assigned = map.find(e => e.text.includes('total = total + i'));
    assert.ok(assigned, 'the SET statement is present in the generated Python');
    assert.equal(assigned.nodeType, 'AssignmentStatement');
    assert.equal(assigned.sourceLine, 4, 'SET total TO total + i is on line 4');
    assert.equal(assigned.synthetic, false);
    assert.equal(pythonLines[assigned.pythonLine - 1], assigned.text, 'the mapping points at the real line');
});

test('helper preambles are marked synthetic and do not claim a statement', () => {
    const ctx = loadEngine();
    ctx.tracer.enable();
    const result = ctx.engine.compile(PROGRAM);
    const map = result.simulation.sourceMap;

    // The preamble is every line up to the first statement-mapped line.
    const firstStatement = map.findIndex(e => !e.synthetic);
    assert.ok(firstStatement > 0, 'helper lines are emitted before the program body');
    for (const entry of map.slice(0, firstStatement)) {
        assert.equal(entry.synthetic, true, 'preamble line is synthetic: ' + JSON.stringify(entry.text));
        assert.equal(entry.nodeType, null, 'a helper line belongs to no user statement');
        assert.equal(entry.sourceLine, null);
    }
    assert.ok(
        map.slice(0, firstStatement).some(e => e.text.includes('_pseudopy_range')),
        'the FOR helper preamble is present'
    );

    // After prepending helpers, statement mappings must still be accurate.
    const assigned = map.find(e => e.text.includes('total = total + i'));
    assert.equal(result.python.split('\n')[assigned.pythonLine - 1], '    total = total + i');
});

test('empty block bodies emit a synthetic pass rather than a fake statement', () => {
    const ctx = loadEngine();
    ctx.tracer.enable();
    const result = ctx.engine.compile('BEGIN\nIF x THEN\nEND IF\nEND');
    const pass = result.simulation.sourceMap.find(e => e.text.trim() === 'pass');
    assert.ok(pass, 'an empty body emits pass');
    assert.equal(pass.synthetic, true);
});

test('event storage is bounded and truncation is reported', () => {
    const ctx = loadEngine();
    ctx.tracer.reset();
    ctx.tracer.maxEvents = 25;
    ctx.tracer.enable();
    const result = ctx.engine.compile(PROGRAM);

    const events = result.simulation.events;
    assert.ok(events.length <= 27, 'storage stays bounded: ' + events.length);
    assert.equal(result.simulation.truncated, true, 'truncation is reported, not hidden');

    const marker = events.find(e => e.type === 'TRACE_TRUNCATED');
    assert.ok(marker, 'a truncation marker is recorded');
    assert.equal(events[events.length - 1].type, 'TRACE_TRUNCATED', 'the marker is last');
});

test('failed compilation still returns a trace with no generated python', () => {
    const ctx = loadEngine();
    ctx.tracer.enable();
    const result = ctx.engine.compile('BEGIN\nIF x THEN\nEND');

    assert.equal(result.valid, false);
    assert.equal(result.python, '');
    assert.ok(result.simulation.events.length > 0, 'a failed compile is still walkable');
    assert.ok(result.simulation.events.some(e => e.type === 'DIAGNOSTIC_EMITTED'));
    assert.deepEqual(plain(result.simulation.sourceMap), [], 'nothing was emitted, so nothing is mapped');
});

test('diagnostics carry a column when the source position is known', () => {
    const ctx = loadEngine();
    ctx.tracer.enable();
    const result = ctx.engine.compile('BEGIN\nDECLARE 9bad AS INTEGER\nEND');
    const diagnostic = result.simulation.events.find(e => e.type === 'DIAGNOSTIC_EMITTED');
    assert.ok(diagnostic, 'the malformed declaration is reported');
    assert.equal(diagnostic.line, 2);
    assert.equal(typeof diagnostic.column, 'number');
    assert.ok(diagnostic.column >= 1);
});

test('snapshot checkpoints exist and carry block and symbol state', () => {
    const ctx = loadEngine();
    ctx.tracer.reset();
    ctx.tracer.snapshotEvery = 5;
    ctx.tracer.enable();
    const result = ctx.engine.compile(PROGRAM);

    const snapshots = result.simulation.events.filter(e => e.type === 'SNAPSHOT');
    assert.ok(snapshots.length > 0, 'checkpoints are recorded while tracing');

    const last = snapshots[snapshots.length - 1];
    assert.ok(last.snapshot, 'a checkpoint holds detached state');
    assert.ok(last.snapshot.blockStack, 'block stack is captured');
    assert.ok(last.snapshot.symbolTable, 'symbol table is captured');
    assert.ok(last.snapshot.symbolTable.total, 'final checkpoint sees the declared symbol');
});

test('the tracer is disabled again once a traced compile finishes', () => {
    const ctx = loadEngine();
    ctx.tracer.enable();
    ctx.engine.compile(PROGRAM);
    assert.equal(ctx.tracer.enabled, false, 'tracing must not leak into later compiles');

    const eventsBefore = ctx.tracer.events.length;
    const result = ctx.engine.compile(PROGRAM);
    assert.equal(ctx.tracer.events.length, eventsBefore, 'a later untraced compile records nothing');
    assert.equal(result.simulation, undefined);
});