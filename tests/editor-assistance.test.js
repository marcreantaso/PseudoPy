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
