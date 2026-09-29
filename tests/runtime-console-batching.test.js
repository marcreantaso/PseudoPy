const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const consoleSrc = read('src/devtools/runtime-console.js');
const controlsSrc = read('src/devtools/pipeline-controls.js');
const executionSrc = read('src/app/execution.js');
const exercisesSrc = read('src/app/exercises.js');
const onDemandSrc = read('src/app/on-demand.js');

// Comments explain the absence of APIs; they must not count as usage of them.
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ─────────────────────────────────────────────────────────────
// A minimal DOM good enough to count the work the renderer does.
// The point of the test is to observe HOW MUCH work happens per
// output line, so every mutation and every layout read is counted.
// ─────────────────────────────────────────────────────────────
function makeDom() {
    const stats = { createElement: 0, appendChild: 0, layoutReads: 0, insertBefore: 0, removeChild: 0, replaceChildren: 0, querySelector: 0 };

    function makeClassList(node) {
        return {
            _set: new Set(),
            add(c) { this._set.add(c); node.className = [...this._set].join(' '); },
            remove(c) { this._set.delete(c); node.className = [...this._set].join(' '); },
            contains(c) { return this._set.has(c); },
            toggle(c, on) { if (on) this.add(c); else this.remove(c); }
        };
    }

    function makeNode(tag) {
        const node = {
            tagName: String(tag).toUpperCase(),
            _children: [],
            className: '',
            textContent: '',
            childNodes: [],
            // Only mutations of the LIVE container count. Building detached
            // nodes (rows, their text spans, a fragment) is cheap; attaching
            // to the document is what forces style and layout work.
            isLive: false,
            get childElementCount() { return this._children.length; },
            get firstElementChild() { return this._children[0] || null; },
            appendChild(child) { if (this.isLive) stats.appendChild++; this._children.push(child); child.parentNode = this; return child; },
            insertBefore(child, ref) { if (this.isLive) stats.insertBefore++; const i = this._children.indexOf(ref); this._children.splice(i < 0 ? this._children.length : i, 0, child); child.parentNode = this; return child; },
            removeChild(child) { if (this.isLive) stats.removeChild++; const i = this._children.indexOf(child); if (i >= 0) this._children.splice(i, 1); return child; },
            remove() { if (this.parentNode) this.parentNode.removeChild(this); },
            replaceChildren() { if (this.isLive) stats.replaceChildren++; this._children = []; },
            querySelector(sel) {
                if (this.isLive) stats.querySelector++;
                const cls = sel.replace(/^\./, '');
                return this._children.find(c => (c.className || '').split(/\s+/).includes(cls)) || null;
            },
            matches() { return false; },
            focus() { }, setAttribute() { }, getAttribute() { return null; }, addEventListener() { },
            // Layout properties: reading any of these forces a reflow in a
            // real browser, so the test counts each read.
            get scrollHeight() { if (this.isLive) stats.layoutReads++; return this._children.length * 20; },
            get clientHeight() { if (this.isLive) stats.layoutReads++; return 400; },
            get scrollTop() { this._s = this._s || 0; return this._s; },
            set scrollTop(v) { this._s = v; },
            // Convenience for assertions: the concatenated text of this subtree.
            get deepText() { return this.textContent + this._children.map(c => c.deepText).join(''); }
        };
        node.classList = makeClassList(node);
        node.childNodes = node._children;
        return node;
    }

    const output = makeNode('div');
    output.id = 'devtools-console-output';
    output.isLive = true;

    // A DocumentFragment's children are MOVED into the parent on append, and
    // the fragment itself never becomes a child. Modelling that matters: it is
    // the whole reason a batch is one live-DOM write instead of N. The move is
    // a single tree mutation, so it is counted once, not once per row.
    const baseAppendChild = output.appendChild;
    output.appendChild = function (child) {
        if (child.isFragment) {
            stats.appendChild++;
            for (const grandchild of child._children) { this._children.push(grandchild); grandchild.parentNode = this; }
            child._children = [];
            return child;
        }
        return baseAppendChild.call(this, child);
    };

    const registry = { 'devtools-console-output': output };
    const document = {
        readyState: 'complete',
        getElementById: id => registry[id] || null,
        createElement: tag => { stats.createElement++; return makeNode(tag); },
        createDocumentFragment: () => {
            stats.createElement++;
            const frag = makeNode('#fragment');
            frag.isFragment = true;
            // Appending into a detached fragment is not a live-DOM mutation:
            // nothing is attached to the document yet, so it must not be
            // counted against the one-append-per-batch budget.
            frag.appendChild = function (child) { this._children.push(child); return child; };
            return frag;
        },
        addEventListener() { }, head: makeNode('head')
    };

    return { document, output, stats, registry, makeNode };
}

function loadConsole(dom) {
    const frames = [];
    const timers = [];
    const sandbox = vm.createContext({
        console: { log() { }, warn() { }, info() { }, error() { } },
        document: dom.document,
        navigator: { clipboard: { writeText: () => Promise.resolve() } },
        requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
        cancelAnimationFrame: h => { frames[h - 1] = null; },
        setTimeout: (fn) => { timers.push(fn); return timers.length; },
        clearTimeout: h => { timers[h - 1] = null; },
        showToast() { }
    });
    vm.runInContext(consoleSrc + '\nthis.makeConsole = createRuntimeConsole;\nthis.MAX = DEV_CONSOLE_MAX_ROWS;', sandbox);
    return { sandbox, frames, timers };
}

// ─────────────────────────────────────────────────────────────
// 2a. Console batching and the rendered-row cap.
// ─────────────────────────────────────────────────────────────
test('many output lines are flushed in ONE batch, not one DOM write per line', () => {
    const dom = makeDom();
    const { sandbox, frames } = loadConsole(dom);
    const rc = sandbox.makeConsole();
    rc.beginRun();

    const LINE_COUNT = 5000;
    const before = { ...dom.stats };
    for (let i = 0; i < LINE_COUNT; i++) rc.append('line ' + i + '\n', 'stdout');

    // Nothing may touch the DOM until the frame runs.
    assert.equal(dom.stats.appendChild - before.appendChild, 0, 'DOM must not be written during append');
    assert.equal(dom.stats.layoutReads - before.layoutReads, 0, 'no layout may be read during append');
    assert.equal(frames.length, 1, 'exactly one animation frame must be requested for the whole batch');
    assert.equal(rc.pendingRenderCount, LINE_COUNT, 'all rows are queued');

    frames[0]();
    assert.equal(rc.pendingRenderCount, 0, 'the batch is drained by the frame');

    // One DocumentFragment append + a constant number of layout reads for the
    // whole batch. The old renderer did one forced reflow per line, so this is
    // the assertion that actually distinguishes the two.
    const appends = dom.stats.appendChild - before.appendChild;
    assert.ok(appends <= 2, 'a batch must not append per row, saw ' + appends + ' appends for ' + LINE_COUNT + ' lines');
    const layoutReads = dom.stats.layoutReads - before.layoutReads;
    assert.ok(layoutReads <= 4, 'layout reads must be O(1) per batch, not per row; saw ' + layoutReads + ' for ' + LINE_COUNT + ' lines');
});

test('the rendered row count is capped and the drop is announced', () => {
    const dom = makeDom();
    const { sandbox, frames } = loadConsole(dom);
    const rc = sandbox.makeConsole();
    rc.beginRun();

    const cap = rc.maxRows;
    assert.ok(cap > 0 && cap <= 5000, 'the cap must be a real bound, got ' + cap);

    const total = cap + 500;
    for (let i = 0; i < total; i++) rc.append('line ' + i + '\n', 'stdout');
    frames[0]();

    assert.ok(dom.output.childElementCount <= cap, 'DOM rows must stay capped, got ' + dom.output.childElementCount);

    const notice = dom.output.querySelector('.devtools-console-row-truncated');
    assert.ok(notice, 'trimmed output must be announced, not silently dropped');
    assert.match(notice.textContent, /501 earlier output lines were trimmed/);

    // The notice occupies one slot, so the accounting must reconcile exactly:
    // emitted = kept + dropped, and kept + notice = DOM children.
    const dataRows = dom.output.childElementCount - 1;
    assert.equal(dataRows + rc.droppedRowCount, total, 'every emitted line is either rendered or accounted as dropped');
    assert.equal(rc.droppedRowCount, total - (cap - 1), 'the cap reserves one row for the notice');

    // The newest output must survive the trim.
    const last = dom.output._children[dom.output.childElementCount - 1];
    assert.match(last.deepText, new RegExp('line ' + (total - 1) + '\\s*$'), 'the newest line must remain visible');
});

test('the truncation notice is removed again when a new run starts', () => {
    const dom = makeDom();
    const { sandbox, frames } = loadConsole(dom);
    const rc = sandbox.makeConsole();
    rc.beginRun();
    for (let i = 0; i < rc.maxRows + 10; i++) rc.append('x' + i + '\n', 'stdout');
    frames[0]();
    assert.ok(dom.output.querySelector('.devtools-console-row-truncated'));

    rc.beginRun();
    assert.equal(dom.output.querySelector('.devtools-console-row-truncated'), null);
    assert.equal(rc.droppedRowCount, 0, 'a new run starts with a clean cap counter');
});

test('a stale batch from a previous run is never spliced into the next run', () => {
    const dom = makeDom();
    const { sandbox, frames } = loadConsole(dom);
    const rc = sandbox.makeConsole();

    rc.beginRun();
    rc.append('OLD RUN\n', 'stdout');
    // New run starts before the queued frame ever fires.
    rc.beginRun();
    rc.append('NEW RUN\n', 'stdout');
    frames.forEach(f => f && f());

    const text = dom.output.deepText;
    assert.doesNotMatch(text, /OLD RUN/, 'stale output must be dropped with the old run');
    assert.match(text, /NEW RUN/);
});

test('the grade summary flushes pending rows so it lands after the real output', () => {
    const dom = makeDom();
    const { sandbox, frames } = loadConsole(dom);
    const rc = sandbox.makeConsole();
    rc.beginRun();
    rc.append('42\n', 'stdout');
    assert.equal(dom.output.querySelector('.devtools-console-row-grade'), null, 'nothing rendered yet');
    rc.finish(); // -> setStateUI -> grade summary, which must flush first
    const rows = dom.output._children;
    const gradeIdx = rows.findIndex(r => (r.className || '').includes('devtools-console-row-grade'));
    const lastTextIdx = rows.map(r => (r.className || '').includes('devtools-console-row-grade') ? -1 : 0).lastIndexOf(0);
    assert.ok(gradeIdx > lastTextIdx, 'the grade footer must come after the program output');
    assert.equal(rc.gradeSummary().value, 42);
});

test('the console still renders when requestAnimationFrame is unavailable', () => {
    const dom = makeDom();
    const timers = [];
    const sandbox = vm.createContext({
        console: { log() { }, warn() { }, info() { }, error() { } },
        document: dom.document,
        navigator: {},
        setTimeout: fn => { timers.push(fn); return timers.length; },
        clearTimeout: () => { },
        showToast() { }
    });
    vm.runInContext(consoleSrc + '\nthis.makeConsole = createRuntimeConsole;', sandbox);
    const rc = sandbox.makeConsole();
    rc.beginRun();
    rc.append('fallback\n', 'stdout');
    assert.equal(timers.length, 1, 'a macrotask fallback must still batch');
    assert.equal(dom.output.childElementCount, 1, 'still deferred; only the placeholder is present');
    timers[0]();
    assert.match(dom.output.deepText, /fallback/);
});

test('with no scheduler at all, output renders immediately instead of being lost', () => {
    const dom = makeDom();
    const sandbox = vm.createContext({
        console: { log() { }, warn() { }, info() { }, error() { } },
        document: dom.document,
        navigator: {},
        showToast() { }
    });
    vm.runInContext(consoleSrc + '\nthis.makeConsole = createRuntimeConsole;', sandbox);
    const rc = sandbox.makeConsole();
    rc.beginRun();
    rc.append('synchronous\n', 'stdout');
    assert.match(dom.output.deepText, /synchronous/, 'output must never be dropped for lack of a scheduler');
    assert.equal(rc.pendingRenderCount, 0);
});

// ─────────────────────────────────────────────────────────────
// 2b. The run budget.
// ─────────────────────────────────────────────────────────────
test('SKULPT_EXEC_LIMIT_MS is a finite, sane wall-clock budget', () => {
    const sandbox = vm.createContext({ console, document: {}, window: {}, setTimeout, clearTimeout, Promise });
    vm.runInContext(onDemandSrc + '\nthis.limit = SKULPT_EXEC_LIMIT_MS;this.opts = skulptExecLimitOptions;', sandbox);
    assert.equal(typeof sandbox.limit, 'number');
    assert.ok(Number.isFinite(sandbox.limit), 'an infinite budget would not stop anything');
    assert.ok(sandbox.limit >= 1000 && sandbox.limit <= 60000, 'budget out of range: ' + sandbox.limit);
    assert.equal(sandbox.opts().execLimit, sandbox.limit, 'the default must be the shared budget');
    assert.equal(sandbox.opts(500).execLimit, 500, 'a caller may override');
    assert.deepEqual(Object.keys(sandbox.opts(Infinity)), [], 'Infinity must mean "explicitly uncapped"');
});

test('every execution path arms the budget through Sk.configure, before compiling', () => {
    for (const [name, source] of [
        ['app/execution.js', executionSrc],
        ['app/exercises.js', exercisesSrc],
        ['devtools/pipeline-controls.js', controlsSrc]
    ]) {
        const code = stripComments(source);
        const configure = code.indexOf('Sk.configure(');
        const compiles = code.indexOf('importMainWithBody');
        assert.ok(configure !== -1, name + ': no Sk.configure call found');
        assert.ok(compiles !== -1, name + ': no importMainWithBody call found');
        assert.ok(configure < compiles, name + ': Sk.configure must precede compilation');
        const between = code.slice(configure, compiles);
        assert.match(between, /execLimit/, name + ': the Sk.configure payload carries no execLimit');
    }
});

test('no path relies on Sk.misceval.timeout, which this Skulpt build lacks', () => {
    for (const [name, source] of [
        ['app/execution.js', executionSrc],
        ['app/exercises.js', exercisesSrc],
        ['devtools/pipeline-controls.js', controlsSrc]
    ]) {
        assert.doesNotMatch(stripComments(source), /misceval\.timeout/, name + ': still guards against a non-existent API');
    }
    // And the vendored build really does lack it, so this is not a false alarm.
    const skulpt = fs.readFileSync(path.join(root, 'vendor/skulpt/skulpt.min.js'), 'utf8');
    assert.equal(skulpt.includes('misceval.timeout'), false, 'misceval.timeout appeared upstream; revisit the guard');
    assert.match(skulpt, /execLimit/, 'execLimit must exist for the budget to work');
});

test('a tripped budget is reported as a stop, not as a program error', () => {
    for (const [name, source] of [
        ['app/execution.js', executionSrc],
        ['devtools/pipeline-controls.js', controlsSrc]
    ]) {
        assert.match(source, /exceeded run time limit|TimeoutError/i, name + ': no timeout detection');
        assert.match(source, /never ends/, name + ': no actionable hint for the student');
    }
});

// ─────────────────────────────────────────────────────────────
// The real thing: does the vendored runtime actually stop a runaway loop?
// ─────────────────────────────────────────────────────────────
function loadSkulpt() {
    const src = fs.readFileSync(path.join(root, 'vendor/skulpt/skulpt.min.js'), 'utf8')
        + '\n' + fs.readFileSync(path.join(root, 'vendor/skulpt/skulpt-stdlib.js'), 'utf8');
    const ctx = vm.createContext({
        console: { log() { }, warn() { }, error() { }, info() { } },
        Date, Math, JSON, setTimeout, clearTimeout
    });
    vm.runInContext(src, ctx);
    return ctx;
}

test('the vendored Skulpt has no misceval.timeout but does honour execLimit', () => {
    const ctx = loadSkulpt();
    assert.equal(typeof ctx.Sk.misceval.timeout, 'undefined', 'this is why the old guard was a no-op');
    assert.ok('execLimit' in ctx.Sk, 'execLimit is the only working budget mechanism');
});

test('a tight infinite loop is stopped when execLimit is configured', async () => {
    const ctx = loadSkulpt();
    let out = '';
    ctx.Sk.configure({
        output: t => { out += t; },
        read: x => {
            if (!ctx.Sk.builtinFiles || !ctx.Sk.builtinFiles.files[x]) throw new Error('missing ' + x);
            return ctx.Sk.builtinFiles.files[x];
        },
        inputfun: () => '',
        inputfunTakesPrompt: true,
        __future__: ctx.Sk.python3,
        execLimit: 1500 // exactly how the app configures it
    });
    const started = Date.now();
    let caught = null;
    try {
        await ctx.Sk.misceval.asyncToPromise(() =>
            ctx.Sk.importMainWithBody('<stdin>', false, 'i = 0\nwhile True:\n    i = i + 1\nprint("never")', true));
    } catch (e) { caught = e; }
    const elapsed = Date.now() - started;
    assert.ok(caught, 'the runaway loop must be stopped, not left to hang');
    assert.match(String(caught), /exceeded run time limit/, 'got: ' + caught);
    assert.equal(out, '', 'the program never reaches its print');
    assert.ok(elapsed < 15000, 'it must stop near the budget, took ' + elapsed + 'ms');
});

test('a normal program is unaffected by the budget', async () => {
    const ctx = loadSkulpt();
    let out = '';
    ctx.Sk.configure({
        output: t => { out += t; },
        read: x => ctx.Sk.builtinFiles.files[x],
        inputfun: () => '',
        inputfunTakesPrompt: true,
        __future__: ctx.Sk.python3,
        execLimit: 15000
    });
    await ctx.Sk.misceval.asyncToPromise(() =>
        ctx.Sk.importMainWithBody('<stdin>', false, 'total = 0\nfor i in range(1, 6):\n    total = total + i\nprint(total)', true));
    assert.equal(out.trim(), '15', 'a normal loop must still run to completion');
});
