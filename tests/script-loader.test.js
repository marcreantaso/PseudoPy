const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

/**
 * Run src/app/on-demand.js in a fake DOM that records every injected script.
 * `autoLoad` resolves each element's onload on a macrotask; when false the test
 * drives them with `settle()`, which is what makes sequencing observable.
 */
function harness({ autoLoad = true, failFor = [] } = {}) {
    const scripts = [];
    const warnings = [];
    const pending = [];
    const deliver = (el, kind) => {
        if (kind === 'error' && el.onerror) el.onerror(new Error('boom'));
        if (kind === 'load' && el.onload) el.onload();
    };
    const context = vm.createContext({
        console: { log() {}, info() {}, warn: (...a) => warnings.push(a.join(' ')) },
        document: {
            createElement: () => ({ set src(v) { this._src = v; }, get src() { return this._src; } }),
            head: {
                appendChild(el) {
                    scripts.push(el);
                    const kind = failFor.some(f => el.src.indexOf(f) !== -1) ? 'error' : 'load';
                    if (autoLoad) setTimeout(() => deliver(el, kind), 0);
                    else pending.push(() => deliver(el, kind));
                }
            }
        },
        setTimeout, clearTimeout, Promise, Symbol
    });
    vm.runInContext(source('src/app/on-demand.js'), context);
    context.eval = expr => vm.runInContext(expr, context);
    const tick = () => new Promise(r => setTimeout(r, 5));
    const settle = () => { const fn = pending.shift(); if (fn) fn(); };
    return { context, scripts, warnings, tick, settle };
}

const animeUrl = 'https://cdn.jsdelivr.net/npm/animejs@4.5.0/dist/bundles/anime.umd.min.js';

// THE core regression. A bare string was indexed per character, producing one
// request each for "h", "t", "t", "p", "s", ":", "/" -- each answered by the SPA
// HTML shell, so each threw "Uncaught SyntaxError: Unexpected token '<'".
test('a string dependency URL is requested once as a complete URL', async () => {
    const h = harness();
    let ok = false;
    h.context.eval('loadScripts')(animeUrl, () => { ok = true; }, () => {});
    await new Promise(r => setTimeout(r, 40));
    assert.deepEqual(h.scripts.map(s => s.src), [animeUrl]);
    assert.equal(ok, true, 'success must be reported only when the script really loaded');
});

test('the shipped anime dependency is a list, not a bare string', () => {
    const h = harness();
    assert.ok(Array.isArray(h.context.eval('CDN_BASE_URLS.anime')),
        'CDN_BASE_URLS.anime must be a list so it can never be indexed per character');
});

// Defense in depth: even if a caller passes a string, the loader treats it as
// one dependency.
test('the loader normalizes a bare string argument', () => {
    const h = harness();
    const list = [...h.context.eval('normalizeScriptList')(animeUrl)];
    assert.deepEqual(list, [animeUrl]);
});

// Concurrent callers must share one script element per URL.
test('concurrent dependency requests do not create duplicate script elements', async () => {
    const h = harness();
    const load = h.context.eval('loadScriptOnce');
    const first = load('./vendor/skulpt/skulpt.min.js');
    const second = load('./vendor/skulpt/skulpt.min.js');
    assert.equal(first, second, 'the same URL must resolve to one shared promise');
    const third = load('./vendor/skulpt/skulpt-stdlib.js');
    assert.notEqual(third, first);
    await Promise.all([first, second, third]);
    assert.deepEqual(h.scripts.map(s => s.src),
        ['./vendor/skulpt/skulpt.min.js', './vendor/skulpt/skulpt-stdlib.js']);
});

test('a URL already loaded is not requested again', async () => {
    const h = harness();
    const load = h.context.eval('loadScriptOnce');
    await load('./vendor/skulpt/skulpt.min.js');
    await load('./vendor/skulpt/skulpt.min.js');
    assert.equal(h.scripts.length, 1);
});

// Classic scripts must execute in dependency order.
test('dependencies load sequentially, never concurrently', async () => {
    const h = harness({ autoLoad: false });
    let finished = false;
    const p = h.context.eval('loadScripts')(['./a.js', './b.js'], () => { finished = true; }, () => {});
    await h.tick();
    assert.deepEqual(h.scripts.map(s => s.src), ['./a.js'],
        'the second dependency started before the first finished');
    assert.equal(finished, false);

    h.settle(); await h.tick();
    assert.deepEqual(h.scripts.map(s => s.src), ['./a.js', './b.js'],
        'the next dependency did not start after the first resolved');

    h.settle(); await p;
    assert.equal(finished, true);
    assert.equal(h.scripts.every(s => s.async === false), true,
        'classic script ordering must not be left to the async attribute');
});

test('a failing script reports one failure and does not retry', async () => {
    const h = harness({ failFor: ['./b.js'] });
    const errors = [];
    let ok = false;
    await h.context.eval('loadScripts')(['./a.js', './b.js', './c.js'],
        () => { ok = true; }, err => errors.push(err));
    assert.equal(ok, false, 'a partial load must not report success');
    assert.equal(errors.length, 1, 'onError must fire exactly once');
    assert.match(errors[0].message, /Failed to load script: \.\/b\.js/);
    assert.equal(h.scripts.filter(s => s.src === './b.js').length, 1, 'the failure was retried');
    assert.equal(h.scripts.some(s => s.src === './c.js'), false, 'loading continued past the failure');
});

test('a failed load never rejects unhandled', async () => {
    const h = harness({ failFor: ['./x.js'] });
    const seen = [];
    const onUnhandled = err => seen.push(err);
    process.on('unhandledRejection', onUnhandled);
    try {
        await h.context.eval('loadScripts')(['./x.js'], () => {}, () => {});
        await new Promise(r => setTimeout(r, 30));
    } finally {
        process.off('unhandledRejection', onUnhandled);
    }
    assert.deepEqual(seen, [], 'a handled script failure must not escape as an unhandled rejection');
});

test('malformed and non-string dependencies are dropped, not requested', async () => {
    const h = harness();
    const list = [...h.context.eval('normalizeScriptList')([
        './ok.js',
        './ok.js',
        null,
        42,
        {},
        '   ',
        'has space.js',
        'line\nbreak.js'
    ])];
    assert.deepEqual(list, ['./ok.js'], 'only the usable, de-duplicated URL survives');
});

test('an empty dependency list resolves without injecting anything', async () => {
    const h = harness();
    let ok = false;
    await h.context.eval('loadScripts')([], () => { ok = true; }, () => {});
    assert.equal(h.scripts.length, 0);
    assert.equal(ok, true);
    assert.equal(h.warnings.some(w => /No usable script dependencies/.test(w)), true,
        'an empty list should be reported, not silently ignored');
});

// A missing JavaScript asset must never be answered with the SPA HTML shell,
// because the browser would execute HTML ("Unexpected token '<'").
test('the deployment does not rewrite arbitrary paths to the SPA shell', () => {
    const config = JSON.parse(source('vercel.json'));
    const fallback = config.rewrites.find(r => r.destination === '/index.html');
    assert.ok(fallback, 'the root still needs to serve index.html');
    assert.equal(fallback.source, '/',
        'only the root may fall back to index.html; a catch-all rewrite returns HTML ' +
        'with a 200 for missing .js assets, which browsers execute as JavaScript');
});