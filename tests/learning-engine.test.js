const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const context = vm.createContext({ performance, console: { log() {} } });

function loadLearningSources() {
    const files = [
        '../mapper.js',
        '../compiler.js',
        '../src/learning/types.js',
        '../src/learning/validation-engine.js',
        '../src/learning/pattern-detector.js',
        '../src/learning/feedback-clustering.js',
        '../src/learning/pipeline.js',
        '../src/learning/evidence-store.js'
    ];
    const src = files.map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
    context.SEED_ACTIVITY_LIST = [
        { _docId: 'act_a', student: 'Eduard John Mirandilla', studentId: '2024-031', exercise: 'Sum of Odd Numbers Under 90', difficulty: 'moderate', status: 'Completed', score: '100%', time: '2025-08-08T14:20:00' },
        { _docId: 'act_b', student: 'John Cruz', studentId: '2024-001', exercise: 'Factorial of 6 Computation', difficulty: 'hard', status: 'Failed', score: '0%', errorType: 'Syntax Error', time: '2025-08-08T10:15:00' },
        { _docId: 'act_c', student: 'Mikaella Daet', studentId: '2024-032', exercise: 'Multiply Array Elements by 4', difficulty: 'easy', status: 'Pending', score: '—', time: '2025-08-08T15:00:00' }
    ];
    context.currentUser = { id: 'u_stu_x', _docId: 'u_stu_x', fullName: 'Test Student', role: 'student', instructorId: 'u2' };
    context.evidenceRef = 'pseudopy_evidence';
    context.dbGet = async () => null;
    context.dbSet = async () => null;
    context.dbAdd = async () => 'ev_dummy';
    vm.runInContext(src + '\nglobalThis.engine = new PseudocodeCompiler();', context);
}
loadLearningSources();

const compile = code => context.engine.compile(code);
const runValidation = (code) => context.runValidation(compile(code), code);

test('validation of a valid program produces structured success + educational items', () => {
    const out = runValidation('BEGIN\n  DECLARE total AS INTEGER\n  total = 0\n  FOR i FROM 1 TO 5 DO\n    total = total + i\n  ENDFOR\n  DISPLAY total\nEND');
    assert.equal(out.valid, true);
    assert.ok(out.items.length >= 1);
    assert.ok(out.items.every(it => it.severity && it.message && it.explanation && it.suggestion));
    // All enums are controlled vocabulary.
    const severities = Object.values(PseudoPyLearning_SEVERITIES());
    for (const item of out.items) assert.ok(severities.includes(item.severity));
    const successes = out.items.filter(i => i.severity === 'success');
    assert.ok(successes.length >= 1);
});

function PseudoPyLearning_SEVERITIES() {
    const src = context.PseudoPyLearning;
    return [src.SEVERITY.SUCCESS, src.SEVERITY.SUGGESTION, src.SEVERITY.WARNING, src.SEVERITY.ERROR];
}

test('validation classifies syntax errors with category, severity and line', () => {
    const out = runValidation('BEGIN\n  DISPLAY 2 + 3 *\nEND');
    assert.equal(out.valid, false);
    const errors = out.items.filter(i => i.severity === 'error');
    assert.ok(errors.length >= 1);
    for (const e of errors) {
        assert.equal(e.severity, 'error');
        assert.ok(e.line >= 1, 'error should carry a source line');
        assert.ok(e.suggestion.length > 0);
        assert.ok(typeof e.explanation === 'string' && e.explanation.length > 0);
        assert.ok(typeof e.category === 'string');
    }
});

test('validation detects structure problems (unclosed block)', () => {
    const out = runValidation('BEGIN\n  IF TRUE THEN\n    DISPLAY 1\n  END');
    assert.equal(out.valid, false);
    assert.ok(out.items.some(i => i.type === 'structure' && i.severity === 'error'));
});

test('validation turns semantic warnings into structured warnings', () => {
    const out = runValidation('BEGIN\n  total = 5\n  DISPLAY total\nEND');
    assert.equal(out.valid, true);
    assert.ok(out.items.some(i => i.severity === 'warning' && i.type === 'variable'));
});

test('validation never emits vague or untyped results', () => {
    const samples = [
        'BEGIN\n  DISPLAY 1\nEND',
        'BEGIN\n  X\nEND',
        'BEGIN\n  FOR i FROM 1 TO 3 DO\n    DISPLAY i\n  ENDFOR\nEND'
    ];
    for (const s of samples) {
        const out = runValidation(s);
        for (const item of out.items) {
            assert.ok(item.message.length > 0);
            assert.ok(item.explanation.length > 0);
            assert.ok(item.suggestion.length > 0);
        }
    }
});

/* ── Phase 2: pattern detection ────────────────────────────── */

const detectPatterns = (code) => context.detectPatterns({
    source: code,
    ast: compile(code).ast,
    symbolTable: compile(code).symbolTable
});

test('pattern detector recognises a counter-controlled loop with accumulator', () => {
    const code = 'BEGIN\n  DECLARE total AS INTEGER\n  total = 0\n  FOR i FROM 1 TO 5 DO\n    total = total + i\n  ENDFOR\n  DISPLAY total\nEND';
    const patterns = detectPatterns(code);
    const types = patterns.map(p => p.type);
    assert.ok(types.includes('counter-controlled-loop'), types.join(','));
    assert.ok(types.includes('accumulator'), types.join(','));
    assert.ok(types.includes('sequence'), types.join(','));
    for (const p of patterns) {
        assert.ok(p.name);
        assert.ok(p.explanation.length > 0);
        assert.ok(p.pseudocodeSlice.length > 0);
        assert.ok(p.pythonSlice.length > 0);
    }
});

test('pattern detector recognises selection and nested iteration', () => {
    const code = 'BEGIN\n  DECLARE a AS ARRAY\n  a = [1, 2, 3]\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 2 DO\n    IF a[i] > 1 THEN\n      DISPLAY a[i]\n    ENDIF\n  ENDFOR\nEND';
    const patterns = detectPatterns(code);
    const types = patterns.map(p => p.type);
    assert.ok(types.includes('selection'), types.join(','));
    assert.ok(types.includes('counter-controlled-loop'), types.join(','));
});

test('pattern detector recognises input-process-output and function', () => {
    const code = 'BEGIN\n  INPUT x\n  SET y TO x * 2\n  DISPLAY y\n  FUNCTION square(n)\n    RETURN n * n\n  END FUNCTION\n  DISPLAY square(3)\nEND';
    const patterns = detectPatterns(code);
    const types = patterns.map(p => p.type);
    assert.ok(types.includes('input-process-output'), types.join(','));
    assert.ok(types.includes('function'), types.join(','));
});

test('pattern detector recognises sentinel and validation while-loops', () => {
    const sentinel = 'BEGIN\n  INPUT x\n  WHILE x != "STOP" DO\n    DISPLAY x\n    INPUT x\n  ENDWHILE\nEND';
    const validation = 'BEGIN\n  DECLARE score AS INTEGER\n  INPUT score\n  WHILE score < 0 OR score > 100 DO\n    DISPLAY "Invalid"\n    INPUT score\n  ENDWHILE\nEND';
    assert.ok(detectPatterns(sentinel).some(p => p.type === 'sentinel-controlled-loop'));
    assert.ok(detectPatterns(validation).some(p => p.type === 'validation-loop'));
});

/* ── Phase 3: feedback clustering ──────────────────────────── */

const clusterFor = (code, patterns) => context.clusterFeedback(runValidation(code).items, patterns);

test('clusterFeedback groups items into themed clusters with severity counts', () => {
    const out = runValidation('BEGIN\n  DISPLAY 1\n  PRINT 2\n  FOR i FROM 1 TO 3\n    PRINT i\n  ENDFOR\nEND');
    const clusters = context.clusterFeedback(out.items, []);
    assert.ok(clusters.length > 0);
    for (const c of clusters) {
        assert.ok(['syntax', 'structure', 'logic', 'programming-pattern', 'readability', 'translation', 'best-practices'].includes(c.category));
        assert.ok(c.items.length > 0);
        assert.equal(c.items.length, c.errorCount + c.warningCount + c.suggestionCount + c.successCount);
    }
});

test('patterns surface as positive items inside the programming-pattern cluster', () => {
    const code = 'BEGIN\n  DECLARE total AS INTEGER\n  total = 0\n  FOR i FROM 1 TO 5 DO\n    total = total + i\n  ENDFOR\n  DISPLAY total\nEND';
    const patterns = detectPatterns(code);
    const clusters = context.clusterFeedback(runValidation(code).items, patterns);
    const pp = clusters.find(c => c.category === 'programming-pattern');
    assert.ok(pp, 'programming-pattern cluster present');
    assert.ok(pp.successCount > 0);
    assert.ok(pp.items.every(it => it.severity === 'success'));
});

test('summarizeClusters aggregates severity counts across clusters', () => {
    const out = runValidation('BEGIN\n  total = 5\n  DISPLAY total\nEND');
    const clusters = context.clusterFeedback(out.items, []);
    const sums = context.summarizeClusters(clusters);
    assert.equal(sums.total, clusters.reduce((n, c) => n + c.items.length, 0));
    assert.ok(sums.warning > 0, 'undeclared-variable warning present');
    assert.ok(sums.success > 0, 'educational successes present');
});

test('clusterState reflects the strongest severity inside a cluster', () => {
    const withError = context.makeValidationResult({ type: 'generic', severity: 'error', category: 'syntax', message: 'm', explanation: 'e', line: 2 });
    const withWarning = context.makeValidationResult({ type: 'generic', severity: 'warning', category: 'structure', message: 'm', explanation: 'e', line: 2 });
    const clusters = context.clusterFeedback([withError, withWarning], []);
    assert.equal(context.clusterState(clusters.find(c => c.category === 'syntax')), 'error');
    assert.equal(context.clusterState(clusters.find(c => c.category === 'structure')), 'warning');
});

/* ── Phase 4: pipeline ─────────────────────────────────────── */

test('runLearningPipeline composes validation, patterns and summaries', () => {
    const code = 'BEGIN\n  DECLARE total AS INTEGER\n  total = 0\n  FOR i FROM 1 TO 5 DO\n    total = total + i\n  ENDFOR\n  DISPLAY total\nEND';
    const result = context.runLearningPipeline(code, compile(code));
    assert.equal(result.valid, true);
    assert.deepEqual(result.source, code);
    assert.ok(result.clusters.length > 0);
    assert.ok(result.patterns.some(p => p.type === 'counter-controlled-loop'));
    assert.ok(result.patterns.some(p => p.type === 'accumulator'));
    const tallies = result.tallies;
    assert.equal(tallies.error + tallies.warning + tallies.suggestion + tallies.success, result.items.length);
    assert.ok(Array.isArray(result.errorCategories));
    assert.ok(Array.isArray(result.gapCategories));
    assert.ok(Array.isArray(result.patternTypes));
    assert.equal(result.summary.total, result.items.length + result.patterns.length);
});

test('runLearningPipeline converts semantic warnings into gap categories', () => {
    const code = 'BEGIN\n  total = 5\n  DISPLAY total\nEND';
    const result = context.runLearningPipeline(code, compile(code));
    assert.equal(result.valid, true);
    assert.ok(result.summary.warning > 0);
    assert.ok(Array.isArray(result.gapCategories));
});

/* ── Phase 6: evidence store ───────────────────────────────── */

test('seeded evidence is deterministic and derived from seed activity', () => {
    const first = context.getSeedEvidence();
    const second = context.getSeedEvidence();
    assert.equal(first.length, second.length);
    assert.equal(first.length, 2, 'pending rows are excluded');
    assert.deepEqual(first, second);
    const emi = first.find(e => e.studentId === 'u_stu_emirandilla');
    assert.ok(emi, 'named seed student mapped by id');
    assert.equal(emi.valid, true);
    assert.equal(emi.tallies.error, 0);
    const jc = first.find(e => e.studentId === 'u_stu_3');
    assert.ok(jc, 'numbered seed student mapped to u_stu_3');
    assert.equal(jc.valid, false);
    assert.equal(jc.errorCategories.join(','), 'syntax');
    assert.equal(jc.gapCategories.join(','), 'syntax');
});

test('buildEvidenceRecord flattens pipeline result into a record', () => {
    const code = 'BEGIN\n  total = 5\n  DISPLAY total\nEND';
    const result = context.runLearningPipeline(code, compile(code));
    const record = context.buildEvidenceRecord(result);
    assert.equal(record.studentId, 'u_stu_x');
    assert.equal(record.valid, true);
    assert.ok(record.tallies.warning > 0);
    assert.ok(record.patternTypes.length > 0);
    assert.ok(record.compileMetadata.sourceHash.length > 0);
    assert.ok(record.timestamp.length > 0);
});