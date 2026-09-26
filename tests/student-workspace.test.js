const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const model = require('../src/student/learning-model');
const guide = require('../src/student/quick-guide');
const root = path.join(__dirname, '..');
const context = vm.createContext({ console, performance });
vm.runInContext(fs.readFileSync(path.join(root, 'mapper.js'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'compiler.js'), 'utf8') + '\nthis.compiler = new PseudocodeCompiler();', context);

test('all guide programs and operator examples compile with the production compiler', () => {
    for (const [category, item] of Object.entries(guide.entries)) {
        const result = context.compiler.compile(item[1]);
        assert.equal(result.valid, true, category + ': ' + JSON.stringify(result.errors));
    }
    for (const [op, , expression] of guide.operators) {
        const result = context.compiler.compile('BEGIN\nDISPLAY ' + expression + '\nEND');
        assert.equal(result.valid, true, op + ': ' + JSON.stringify(result.errors));
    }
});
test('cursor insertion preserves both sides of existing work', () => {
    assert.equal(guide.insert('alpha\nomega', 6, 'DISPLAY 1'), 'alpha\nDISPLAY 1\nomega');
    assert.equal(guide.insert('', 0, 'BEGIN\nEND'), 'BEGIN\nEND\n');
});
test('contextual tips are local to the current line and recognize complete sentinels', () => {
    assert.match(guide.tip('IF grade > 75', 13), /THEN/);
    assert.equal(guide.tip('IF grade > 75 THEN', 18), '');
    assert.match(guide.tip('WHILE x > 0', 11), /DO/);
    assert.equal(guide.tip('# IF grade', 10), '');
    assert.equal(guide.tip('DISPLAY "hello"\nSET x TO 2', 26), '');
});
test('flow adapts actual tokens, AST and Python without recompiling', () => {
    const source = guide.entries.Conditions[1], result = context.compiler.compile(source);
    const flow = model.flow(source, result);
    assert.equal(flow.result, result);
    assert.ok(flow.tokens.some(t => t.value === 'IF'));
    assert.ok(flow.steps.some(s => s.type === 'IfStatement' && s.line === 4));
    assert.ok(flow.steps.some(s => s.type === 'PrintStatement' && s.depth === 1));
    assert.equal(flow.stages.find(s => s.id === 'python').status, 'Completed');
    assert.equal(flow.stages.find(s => s.id === 'execution').status, 'Ready');
    const mapping = flow.steps.find(s => s.type === 'PrintStatement');
    assert.equal(result.python.split('\n')[mapping.pythonLine - 1].trim(), mapping.python);
});
test('failed compiler result never reports generation or execution complete', () => {
    const source = 'BEGIN\nIF x > 2\nDISPLAY x\nEND';
    const flow = model.flow(source, context.compiler.compile(source));
    assert.equal(flow.stages.find(s => s.id === 'python').status, 'Not reached');
    assert.equal(flow.stages.find(s => s.id === 'execution').status, 'Not reached');
    assert.ok(flow.feedback.some(f => /THEN/.test(f.explanation)));
});
test('session metrics use measured zero timing, failed runs and actual counts', () => {
    const a = { valid: true, errors: 0, timing: 0 }, b = { valid: false, errors: 2, timing: 10 };
    assert.deepEqual(model.kpis([], []), { translations: 0, success: 0, runtime: 0, average: 0, errors: 0, executions: 0 });
    assert.deepEqual(model.kpis([a, b], [{ success: true }, { success: false }]), { translations: 2, success: 50, runtime: 50, average: 5, errors: 2, executions: 2 });
});
test('trajectory refresh is pure, cumulative rates are measured, mastery stays unknown', () => {
    const records = [{ compilation: 0 }, { compilation: 100 }, { compilation: 100 }];
    assert.deepEqual(model.trajectory(records).map(p => p.cumulative), [0, 50, 200 / 3]);
    assert.equal(model.trajectory(records).length, 3);
    assert.equal(model.trajectory(records).length, 3);
    assert.equal(records[0].cumulative, undefined);
    assert.equal(model.scores({}, true, ['selection']).mastery, null);
    assert.equal(model.scores({ error: 20 }, false, []).validation, 0);
});
test('history excludes other students, seeded evidence and invalid timestamps', () => {
    const sample = { studentId: 's1', valid: true, timestamp: '2026-01-01T00:00:00Z', tallies: {} };
    const data = model.history([{ ...sample, _docId: 'real' }, { ...sample, studentId: 's2' }, { ...sample, seededFrom: 'activity:x' }, { ...sample, _docId: 'ev_seed_x' }, { ...sample, timestamp: 'invalid' }], 's1');
    assert.equal(data.length, 1);
    assert.equal(data[0].id, 'real');
});

test('trend summary stays honest: insufficient, improved, dipped and stable tones', () => {
    assert.equal(model.trend([]).tone, 'insufficient');
    assert.equal(model.trend([{ validation: 100 }, { validation: 0 }]).tone, 'insufficient');
    assert.equal(model.trend([{ validation: 40 }, { validation: 40 }, { validation: 90 }, { validation: 90 }, { validation: 90 }]).tone, 'improved');
    assert.equal(model.trend([{ validation: 90 }, { validation: 90 }, { validation: 40 }, { validation: 40 }, { validation: 40 }]).tone, 'dipped');
    assert.equal(model.trend([{ validation: 40 }, { validation: 42 }, { validation: 40 }, { validation: 41 }, { validation: 40 }]).tone, 'stable');
});

const workspaceSource = fs.readFileSync(path.join(root, 'src/student/workspace.js'), 'utf8');
test('quick guide uses a segmented presentation control, not a native select', () => {
    assert.ok(!/select class="sg-mode"/.test(workspaceSource), 'native select removed');
    assert.match(workspaceSource, /class="seg"[^>]*aria-label="Presentation mode"/);
    assert.match(workspaceSource, /data-mode="beginner"/);
    assert.match(workspaceSource, /data-mode="advanced"/);
    assert.match(workspaceSource, /aria-pressed="' \+ \(guideState\.mode === 'beginner'\) \+ '">Beginner<\/button>/, 'Beginner chip no longer pressed by default');
});
test('learning progress hides formulas and mastery-unavailable jargon behind friendly copy', () => {
    assert.ok(!/Construct Mastery: unavailable/.test(workspaceSource), 'raw unavailable text removed');
    assert.match(workspaceSource, /Complete more exercises to unlock concept mastery insights/);
    assert.match(workspaceSource, /Your Learning Progress/);
    assert.match(workspaceSource, /Complete more translations to see your progress trend/);
    assert.match(workspaceSource, /How is this calculated\?/);
});
test('chart data points expose keyboard and labelled tooltip hooks', () => {
    assert.match(workspaceSource, /role="button" class="an-series-dot/);
    assert.match(workspaceSource, /dot\.onkeydown = e => \{ if \(e\.key === 'Enter' \|\| e\.key === ' '\) \{/);
});
test('chart layout never falls back to window width and only re-renders on bin flips', () => {
    assert.ok(!/Math\.min\(window\.innerWidth/.test(workspaceSource), 'window.innerWidth fallback removed');
    assert.match(workspaceSource, /chartLayout\(card\.clientWidth, chartLayoutBin\)\.bin !== chartLayoutBin/, 'resize re-render guarded by layout bin');
});
test('chart data table covers every series including cumulative success', () => {
    assert.match(workspaceSource, /<th scope="col">Cumulative %<\/th>/);
    assert.match(workspaceSource, /units\(p\.cumulative\)/);
});

function workspaceHarness() {
    const sandbox = vm.createContext({ console, StudentLearningModel: model, StudentGuide: guide,
        currentUser: { role: 'student', id: 's1' }, document: { querySelectorAll: () => [], getElementById: () => null } });
    vm.runInContext(fs.readFileSync(path.join(root, 'src/student/workspace.js'), 'utf8') + '\nthis.workspace = StudentWorkspace;', sandbox);
    return sandbox;
}
test('workspace records each translation once and rejects duplicate run completion', () => {
    const s = workspaceHarness(); s.workspace.activate('write-pseudocode');
    const source = guide.entries.Basics[1], result = context.compiler.compile(source);
    s.workspace.translated('pseudocode-editor', source, result, null);
    s.workspace.activate('translate');
    assert.equal(s.workspace.sessionMetrics().translations, 1);
    const run = s.workspace.beginRun('console-output', result.python);
    s.workspace.endRun(run, false, 'Runtime error');
    s.workspace.endRun(run, false, 'Duplicate callback');
    assert.equal(s.workspace.sessionMetrics().executions, 1);
    assert.equal(s.workspace.sessionMetrics().runtime, 100);
    assert.equal(s.workspace.sessionMetrics().translations, 1);
});
test('logout and account changes isolate session data and pending runtime callbacks', () => {
    const s = workspaceHarness(); s.workspace.activate('write-pseudocode');
    const old = s.workspace.beginRun('console-output', 'print(1)');
    s.workspace.reset(); s.workspace.activate('write-pseudocode');
    s.workspace.endRun(old, true, '1');
    assert.equal(s.workspace.sessionMetrics().executions, 0);
    const run = s.workspace.beginRun('console-output', 'print(1)');
    s.currentUser = { role: 'student', id: 's2' }; s.workspace.activate('write-pseudocode');
    s.workspace.endRun(run, true, '1');
    assert.equal(s.workspace.sessionMetrics().executions, 0);
    s.currentUser = { role: 'admin', id: 'admin' }; s.workspace.activate('developer-options');
    assert.equal(s.workspace.beginRun('admin-console', 'print(1)'), null);
});

test('quick guide carries advanced-mode content for every category', () => {
    for (const [name, item] of Object.entries(guide.entries)) {
        assert.equal(item.length, 4, name + ': advanced payload missing');
        assert.equal(typeof item[3].intro, 'string', name + ': advanced intro missing');
        assert.ok(Array.isArray(item[3].bullets) && item[3].bullets.length >= 3, name + ': advanced bullets missing');
    }
    assert.ok(guide.entries.Conditions[3].bullets.some(b => /END IF/.test(b)), 'Conditions advanced copy missing block-close rule');
});

test('quick guide state machine persists mode, keeps the category, and never duplicates chips', () => {
    const persisted = new Map();
    function makeButton() {
        const pressed = {};
        return { dataset: {}, setAttribute(k, v) { pressed[k] = v; }, aria: pressed, onclick: null, textContent: '' };
    }
    function guideHarness(startMode) {
        const chips = [];
        const cats = { chips, appendChild(c) { chips.push(c); }, querySelectorAll() { return chips; }, setAttribute() {} };
        const content = { innerHTML: '', querySelector() { return null; }, querySelectorAll() { return []; }, setAttribute() {} };
        const guideEl = { dataset: {}, open: true, innerHTML: '', ontoggle: null,
            querySelector(sel) { return sel === '.sg-cats' ? cats : sel === '.sg-content' ? content : null; },
            querySelectorAll(sel) { return sel.includes('data-mode') ? modeButtons : []; },
            scrollIntoView() {} };
        const beginner = makeButton(), advanced = makeButton();
        beginner.dataset.mode = 'beginner'; advanced.dataset.mode = 'advanced';
        beginner.aria['aria-pressed'] = String(startMode !== 'advanced');
        advanced.aria['aria-pressed'] = String(startMode === 'advanced');
        const modeButtons = [beginner, advanced];
        const editor = { value: '', dataset: {}, selectionStart: 0, selectionEnd: 0, parentElement: { insertAdjacentElement() {} },
            setRangeText() {}, focus() {}, dispatchEvent() {}, addEventListener() {}, setSelectionRange() {}, scrollTop: 0 };
        const pageRoot = { querySelector(sel) { return sel === '.operator-guide' ? guideEl : null; }, appendChild() {}, insertAdjacentElement() {} };
        const byId = { 'page-write-pseudocode': pageRoot, 'pseudocode-editor': editor };
        const sandbox = vm.createContext({
            console, StudentLearningModel: model, StudentGuide: guide, StudentWorkspace: undefined,
            currentUser: { role: 'student', id: 's1' },
            STORAGE_KEYS: { GUIDE_MODE: 'pseudopy_guide_mode' },
            localStorage: { getItem: k => (startMode && k === 'pseudopy_guide_mode') ? startMode : (persisted.get(k) || null), setItem: (k, v) => persisted.set(k, v), removeItem: k => persisted.delete(k) },
            document: { getElementById: id => byId[id] || null, querySelectorAll: () => [], createElement: () => ({
                dataset: {}, classList: { add() {}, remove() {} }, setAttribute() {}, innerHTML: '', textContent: '',
                hidden: false, className: '', onclick: null, querySelector: () => ({ onclick: null }),
                querySelectorAll: () => [], appendChild() {}, addEventListener() {}, focus() {}, scrollIntoView() {}
            }),
                getComputedStyle: () => ({ lineHeight: '22px' }) },
            refreshIcons() {}, Event: class { constructor() {} }
        });
        vm.runInContext(fs.readFileSync(path.join(root, 'src/student/workspace.js'), 'utf8') + '\nthis.workspace = StudentWorkspace;', sandbox);
        return { sandbox, guideEl, cats, content, beginner, advanced, editor };
    }

    const h = guideHarness(null);
    h.sandbox.workspace.activate('write-pseudocode');
    assert.equal(h.cats.chips.length, 9, 'one chip per guide category plus Operators');
    assert.equal(h.beginner.aria['aria-pressed'], 'true', 'Beginner pressed by default');
    assert.equal(h.advanced.aria['aria-pressed'], 'false', 'Advanced not pressed by default');

    h.advanced.onclick();
    assert.equal(h.beginner.aria['aria-pressed'], 'false', 'Beginner unpressed after switching');
    assert.equal(h.advanced.aria['aria-pressed'], 'true', 'Advanced pressed after switching');
    assert.equal(persisted.get('pseudopy_guide_mode'), 'advanced', 'mode not persisted');
    assert.match(h.content.innerHTML, /Basic/, 'category was not preserved when re-rendering');
    assert.match(h.content.innerHTML, /sg-advanced/, 'advanced block not rendered in advanced mode');

    const chipCount = h.cats.chips.length;
    h.sandbox.workspace.activate('write-pseudocode');
    assert.equal(h.cats.chips.length, chipCount, 're-activation duplicated guide chips');

    const h2 = guideHarness('advanced');
    h2.sandbox.workspace.activate('write-pseudocode');
    assert.equal(h2.beginner.aria['aria-pressed'], 'false', 'persisted Beginner state not restored');
    assert.equal(h2.advanced.aria['aria-pressed'], 'true', 'persisted Advanced state not restored');
});
