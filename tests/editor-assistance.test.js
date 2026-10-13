const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ performance });
for (const file of ['mapper.js', 'compiler.js', 'src/app/editor-assistance.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context);
}
test('review corrects a statement typo and resulting program compiles', () => {
    const source = 'BEGIN\nDISPALY "hello"\nEND';
    const fixes = context.pseudopyCorrectionSuggestions(source);
    assert.equal(fixes.length, 1);
    assert.equal(fixes[0].line, 2);
    context.source = context.pseudopyApplyCorrection(source, fixes[0]);
    assert.equal(vm.runInContext('new PseudocodeCompiler().compile(source).valid', context), true);
});
test('review preserves quoted strings, variable names and ambiguous logic', () => {
    const source = 'BEGIN\nDISPLAY "DISPALY"\nSET DISPALY TO 7\nDISPALY = 3\nFOR x <= 10 DO\nEND';
    assert.equal(context.pseudopyCorrectionSuggestions(source).length, 0);
});
test('review preserves active debugger traces and settings', () => {
    vm.runInContext('compilerTrace.enable(); simulationTracer.enable(); compilerTrace.emit({type:"EXISTING"});', context);
    context.pseudopyReviewSource('BEGIN\nDISPLAY 1\nEND');
    assert.equal(vm.runInContext('compilerTrace.events.length', context), 1);
    assert.equal(vm.runInContext('compilerTrace.enabled && simulationTracer.enabled', context), true);
});
test('stale corrections cannot overwrite subsequent edits', () => {
    const fix = context.pseudopyCorrectionSuggestions('DISPALY 1')[0];
    assert.throws(() => context.pseudopyApplyCorrection('DISPLAY 2', fix), /Source changed/);
});
test('correction keeps blank lines, indentation and CRLF', () => {
    const source = 'BEGIN\r\n\r\n  dispaly "ok"\r\nEND';
    const fix = context.pseudopyCorrectionSuggestions(source)[0];
    assert.equal(fix.line, 3);
    assert.equal(context.pseudopyApplyCorrection(source, fix), 'BEGIN\r\n\r\n  DISPLAY "ok"\r\nEND');
});

const compile = source => {
    context.source = source;
    return vm.runInContext('new PseudocodeCompiler().compile(source)', context);
};
const qualifiedFixes = (source, result) => context.pseudopyQuickFixCandidates(source, result).filter(f => f.qualified);

test('missing THEN gets a line-level sentinel fix that compiles', () => {
    const source = 'BEGIN\nIF x = 1\nDISPLAY 1\nEND IF\nEND';
    const result = compile(source);
    const sentinel = qualifiedFixes(source, result).find(f => f.kind === 'sentinel');
    assert.ok(sentinel, 'expected a sentinel fix');
    assert.equal(sentinel.qualified, true);
    assert.equal(sentinel.line, 2);
    assert.equal(sentinel.after, 'IF x = 1 THEN');
    assert.equal(compile(context.pseudopyApplyQuickFix(source, sentinel)).valid, true);
});

test('missing DO on WHILE gets a sentinel fix that compiles', () => {
    const source = 'BEGIN\nWHILE x > 0\nDISPLAY x\nEND WHILE\nEND';
    const result = compile(source);
    const sentinel = qualifiedFixes(source, result).find(f => f.kind === 'sentinel');
    assert.ok(sentinel, 'expected a sentinel fix');
    assert.equal(sentinel.after, 'WHILE x > 0 DO');
    assert.equal(compile(context.pseudopyApplyQuickFix(source, sentinel)).valid, true);
});

test('a sentinel already on the next line is never re-inserted', () => {
    const source = 'BEGIN\nIF x = 1\nTHEN\nDISPLAY 1\nEND IF\nEND';
    const result = compile(source);
    assert.equal(qualifiedFixes(source, result).some(f => f.kind === 'sentinel'), false);
});

test('unclosed blocks are bundled into one closure before the final END', () => {
    const source = 'BEGIN\nIF x THEN\nDISPLAY 1\nEND';
    const result = compile(source);
    const close = qualifiedFixes(source, result).find(f => f.kind === 'close-block');
    assert.ok(close, 'expected a close-block fix');
    assert.deepEqual(JSON.parse(JSON.stringify(close.insertedLines)), ['END IF']);
    assert.equal(close.insertBeforeLine, 4);
    assert.equal(compile(context.pseudopyApplyQuickFix(source, close)).valid, true);
});

test('duplicate parser unclosed diagnostics collapse into one fix', () => {
    const source = 'BEGIN\nIF x THEN\nDISPLAY 1\nEND';
    const result = compile(source);
    assert.ok(result.errors.length >= 2, 'parser reports the block twice');
    assert.equal(context.pseudopyQuickFixCandidates(source, result).filter(f => f.kind === 'close-block').length, 1);
});

test('nested unclosed blocks close innermost-first as one edit', () => {
    const source = 'BEGIN\nIF x THEN\nWHILE y DO\nSET n = 1\nEND';
    const result = compile(source);
    const fixes = qualifiedFixes(source, result);
    assert.equal(fixes.length, 1);
    assert.equal(fixes[0].insertedLines.join('\n'), 'END WHILE\nEND IF');
    const batch = context.pseudopyApplyBatch(source, fixes);
    assert.equal(batch.source.split('\n').filter(l => /^END /i.test(l)).length, 2);
    assert.equal(compile(batch.source).valid, true);
});

test('structural fixes reject a different source even when the END line is unchanged', () => {
    const source = 'BEGIN\nIF TRUE THEN\nDISPLAY 1\nEND';
    const fixes = qualifiedFixes(source, compile(source));
    assert.throws(() => context.pseudopyApplyBatch(source.replace('IF TRUE THEN', 'WHILE TRUE DO'), fixes), /Source changed/);
});

test('sentinel fixes preserve quoted hashes, floor division and comments', () => {
    for (const header of ['IF "#" = "#"', 'IF 7 // 2 = 3', 'IF TRUE # explanation']) {
        const source = 'BEGIN\n' + header + '\nDISPLAY 1\nEND IF\nEND';
        const fixes = qualifiedFixes(source, compile(source));
        assert.equal(fixes.length, 1);
        const updated = context.pseudopyApplyBatch(source, fixes).source;
        assert.equal(compile(updated).valid, true, updated);
    }
});

test('different undeclared variables on the same line retain their guidance', () => {
    const source = 'BEGIN\nDISPLAY first + second\nEND';
    const fixes = context.pseudopyQuickFixCandidates(source, compile(source));
    assert.equal(fixes.filter(f => f.kind === 'undeclared').length, 2);
    assert.throws(() => context.pseudopyApplyBatch(source, fixes), /manual correction/);
});

test('wrong closing keyword rewrites AND inserts only the missing closer', () => {
    const source = 'BEGIN\nIF x THEN\nWHILE y DO\nDISPLAY y\nEND IF\nEND';
    const result = compile(source);
    const fixAt = qualifiedFixes(source, result);
    const mismatch = fixAt.find(f => f.kind === 'mismatch');
    const batch = context.pseudopyApplyBatch(source, qualifiedFixes(source, result));
    assert.ok(mismatch, 'expected the mismatched closer to be rewritten');
    assert.equal(batch.source.includes('END WHILE'), true);
    assert.equal(batch.source.includes('END IF'), true);
    assert.equal(compile(batch.source).valid, true);
    assert.equal(batch.source.match(/END WHILE/g).length, 1, 'no double closure');
});

test('the compiler itself never auto-repairs or emits fixes', () => {
    const result = compile('BEGIN\nIF TRUE THEN\nDISPLAY 1\nEND');
    assert.equal(result.autoFixes.length, 0);
    assert.equal(result.valid, false);
});

test('base apply rejected when the source moved on', () => {
    const source = 'BEGIN\nIF x = 1\nDISPLAY 1\nEND IF\nEND';
    const fix = context.pseudopyQuickFixCandidates(source, compile(source)).find(f => f.kind === 'sentinel');
    assert.throws(() => context.pseudopyApplyQuickFix('BEGIN\nDISPLAY 2\nEND', fix), /Source changed/);
});

test('overlapping fixes are rejected as a batch', () => {
    const source = 'BEGIN\nIF x = 1\nDISPLAY 1\nEND IF\nEND';
    const sentinel = context.pseudopyQuickFixCandidates(source, compile(source)).find(f => f.kind === 'sentinel');
    assert.throws(() => context.pseudopyApplyBatch(source, [sentinel, sentinel]), /overlap/i);
});

test('undeclared variables stay guidance, never an auto-applied fix', () => {
    const source = 'BEGIN\nSET total = cost + 1\nEND';
    const result = compile(source);
    assert.equal(result.valid, true);
    const guidances = context.pseudopyQuickFixCandidates(source, result).filter(f => f.kind === 'undeclared');
    assert.ok(guidances.length >= 1);
    assert.equal(guidances.every(f => f.qualified === false && f.before === null && f.after === null), true);
});

test('quick fixes preserve CRLF line endings', () => {
    const source = 'BEGIN\r\nIF x = 1\r\nDISPLAY 1\r\nEND IF\r\nEND';
    const sentinel = context.pseudopyQuickFixCandidates(source, compile(source)).find(f => f.kind === 'sentinel');
    const sentinelApplied = context.pseudopyApplyQuickFix(source, sentinel);
    assert.equal(/[^\r]\n/.test(sentinelApplied), false);
    assert.equal(compile(sentinelApplied).valid, true);

    const unclosed = 'BEGIN\r\nIF x THEN\r\nDISPLAY 1\r\nEND';
    const close = context.pseudopyQuickFixCandidates(unclosed, compile(unclosed)).find(f => f.kind === 'close-block');
    const closed = context.pseudopyApplyQuickFix(unclosed, close);
    assert.equal(/[^\r]\n/.test(closed), false);
    assert.equal(compile(closed).valid, true);
});

// ── Statement-header keywords (FOR … FROM, DECLARE … AS, SET … TO) ──────────

test('a FOR header missing FROM is repaired to a compiling program', () => {
    const shapes = [
        ['BEGIN\nFOR i 1 TO 10 DO\nDISPLAY i\nEND FOR\nEND', 'FOR i FROM 1 TO 10 DO'],
        ['BEGIN\nFOR i IN 1 TO 10 DO\nDISPLAY i\nEND FOR\nEND', 'FOR i FROM 1 TO 10 DO'],
        ['BEGIN\nFOR i = 1 TO 10 DO\nDISPLAY i\nEND FOR\nEND', 'FOR i FROM 1 TO 10 DO'],
        ['BEGIN\nFOR i FRO 1 TO 10 DO\nDISPLAY i\nEND FOR\nEND', 'FOR i FROM 1 TO 10 DO']
    ];
    for (const [source, expected] of shapes) {
        const fix = qualifiedFixes(source, compile(source)).find(f => f.kind === 'header');
        assert.ok(fix, 'expected a header fix for ' + JSON.stringify(source));
        assert.equal(fix.line, 2);
        assert.equal(fix.after, expected);
        const applied = context.pseudopyApplyQuickFix(source, fix);
        assert.equal(applied.split('\n')[1], expected);
        assert.equal(compile(applied).valid, true);
    }
});

test('header repairs keep indentation, trailing comments and CRLF', () => {
    const indented = 'BEGIN\n  FOR i 1 TO 10 DO\n  DISPLAY i\n  END FOR\nEND';
    const indentFix = qualifiedFixes(indented, compile(indented)).find(f => f.kind === 'header');
    assert.equal(indentFix.after, '  FOR i FROM 1 TO 10 DO');

    const commented = 'BEGIN\nFOR i 1 TO 10 DO # loop\nDISPLAY i\nEND FOR\nEND';
    const commentFix = qualifiedFixes(commented, compile(commented)).find(f => f.kind === 'header');
    assert.equal(commentFix.after, 'FOR i FROM 1 TO 10 DO # loop');
    assert.equal(compile(context.pseudopyApplyQuickFix(commented, commentFix)).valid, true);

    const crlf = 'BEGIN\r\nFOR i 1 TO 10 DO\r\nDISPLAY i\r\nEND FOR\r\nEND';
    const crlfFix = qualifiedFixes(crlf, compile(crlf)).find(f => f.kind === 'header');
    const crlfApplied = context.pseudopyApplyQuickFix(crlf, crlfFix);
    assert.equal(/[^\r]\n/.test(crlfApplied), false);
    assert.equal(compile(crlfApplied).valid, true);
});

test('condition-style and start-less FOR headers stay guidance, never invented', () => {
    const shapes = [
        'BEGIN\nFOR i TO 10 DO\nDISPLAY i\nEND FOR\nEND',
        'BEGIN\nFOR i <= 10 DO\nDISPLAY i\nEND FOR\nEND',
        'BEGIN\nFOR i 1 2 TO 10 DO\nDISPLAY i\nEND FOR\nEND'
    ];
    for (const source of shapes) {
        const fixes = context.pseudopyQuickFixCandidates(source, compile(source));
        assert.equal(fixes.filter(f => f.qualified).length, 0, 'no safe fix for ' + JSON.stringify(source));
        const guidance = fixes.find(f => !f.qualified && f.kind === 'header-guidance');
        assert.ok(guidance, 'expected guidance for ' + JSON.stringify(source));
        assert.equal(typeof guidance.hint, 'string');
        assert.equal(guidance.after, null);
    }
});

test('a FOR header missing TO never produces a bogus DO sentinel fix', () => {
    const source = 'BEGIN\nFOR i FROM 1 DO\nDISPLAY i\nEND FOR\nEND';
    const fixes = context.pseudopyQuickFixCandidates(source, compile(source));
    assert.equal(fixes.filter(f => f.qualified).length, 0);
});

test('DECLARE without AS and SET without TO are repaired to compiling programs', () => {
    const declare = 'BEGIN\nDECLARE x INTEGER\nSET x TO 1\nEND';
    const declareFix = qualifiedFixes(declare, compile(declare)).find(f => f.kind === 'header');
    assert.equal(declareFix.after, 'DECLARE x AS INTEGER');
    assert.equal(compile(context.pseudopyApplyQuickFix(declare, declareFix)).valid, true);

    const setMissing = 'BEGIN\nDECLARE x AS INTEGER\nSET x 5\nEND';
    const setFix = qualifiedFixes(setMissing, compile(setMissing)).find(f => f.kind === 'header');
    assert.equal(setFix.after, 'SET x TO 5');
    assert.equal(compile(context.pseudopyApplyQuickFix(setMissing, setFix)).valid, true);

    const setTypo = 'BEGIN\nDECLARE x AS INTEGER\nSET x t0 5\nEND';
    const typoFix = qualifiedFixes(setTypo, compile(setTypo)).find(f => f.kind === 'header');
    assert.equal(typoFix.after, 'SET x TO 5');
    assert.equal(compile(context.pseudopyApplyQuickFix(setTypo, typoFix)).valid, true);
});

test('a header repair is withheld when it would not repair the line', () => {
    const cases = [
        'BEGIN\nDECLARE x AS INTEGER\nSET x total 5\nEND',
        'BEGIN\nDECLARE x AS INTEGER\nSET x < 5\nEND',
        'BEGIN\nDECLARE x\nEND',
        'BEGIN\nDECLARE x foo\nEND'
    ];
    for (const source of cases) {
        const fixes = context.pseudopyQuickFixCandidates(source, compile(source));
        assert.equal(fixes.filter(f => f.qualified && f.kind === 'header').length, 0, 'unexpected safe fix for ' + JSON.stringify(source));
    }
});

test('applied batches report the lines that changed', () => {
    const source = 'BEGIN\nFOR i 1 TO 10 DO\nDISPLAY i\nEND FOR\nEND';
    const fix = qualifiedFixes(source, compile(source)).find(f => f.kind === 'header');
    assert.equal(context.pseudopyChangedLines([fix]).join(','), '2');
    assert.equal(context.pseudopyChangedLines([fix]).length, 1);
});

