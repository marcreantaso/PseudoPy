const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../sw.js'), 'utf8');
function harness(addAll, seedEntries = []) {
    const handlers = {};
    const deleted = [];
    let claimed = false;
    // entries: url -> { contentType, body }
    const entries = new Map(Object.entries(seedEntries));
    const cache = {
        addAll, add: async () => {}, put: async () => {},
        keys: async () => Array.from(entries.keys()).map(url => ({ url, mode: 'no-cors' })),
        match: async request => {
            const found = entries.get(request.url);
            if (!found) return undefined;
            return { headers: { get: name => (name === 'content-type' ? found.contentType : null) } };
        },
        delete: async request => { entries.delete(request.url); return true; }
    };
    vm.runInNewContext(source, { self: { location: { origin: 'https://pseudopy.test' },
        addEventListener: (name, fn) => { handlers[name] = fn; },
        clients: { claim: async () => { claimed = true; } } },
        caches: { open: async () => cache,
            keys: async () => ['pseudopy-shell-old', 'unrelated-cache'], delete: async key => deleted.push(key) },
        fetch: async () => ({}), Request: class {}, URL, console });
    return { handlers, deleted, entries, claimed: () => claimed };
}

test('install waits for local precaching before it can complete', async () => {
    let resolveCache;
    const h = harness(() => new Promise(resolve => { resolveCache = resolve; }));
    let done = false, lifetime;
    h.handlers.install({ waitUntil: promise => { lifetime = promise.then(() => { done = true; }); } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(done, false);
    resolveCache(); await lifetime;
    assert.equal(done, true);
});

test('failed local precaching fails installation, keeping the old worker available', async () => {
    const h = harness(async () => { throw new Error('asset missing'); });
    let lifetime;
    h.handlers.install({ waitUntil: promise => { lifetime = promise; } });
    await assert.rejects(lifetime, /asset missing/);
});

test('activation waits for claiming clients and preserves unrelated caches', async () => {
    const h = harness(async () => {});
    let lifetime;
    h.handlers.activate({ waitUntil: promise => { lifetime = promise; } });
    await lifetime;
    assert.equal(h.claimed(), true);
    assert.deepEqual(h.deleted, ['pseudopy-shell-old']);
});

// An earlier build answered every unmatched path with index.html and cached
// that 200 for whatever script had been requested, so the browser executed HTML
// ("Unexpected token '<'"). Activation must evict only those mislabelled
// entries and leave real cached assets alone.
test('activation evicts HTML cached for a script request but keeps real assets', async () => {
    const h = harness(async () => {}, {
        'https://pseudopy.test/vendor/skulpt/skulpt.min.js': { contentType: 'text/html; charset=utf-8' },
        'https://pseudopy.test/app.js': { contentType: 'text/javascript' },
        'https://pseudopy.test/style.css': { contentType: 'text/css' }
    });
    let lifetime;
    h.handlers.activate({ waitUntil: promise => { lifetime = promise; } });
    await lifetime;
    assert.equal(h.entries.has('https://pseudopy.test/vendor/skulpt/skulpt.min.js'), false,
        'HTML stored for a script must be evicted');
    assert.equal(h.entries.has('https://pseudopy.test/app.js'), true, 'a real script cache entry was dropped');
    assert.equal(h.entries.has('https://pseudopy.test/style.css'), true, 'a real stylesheet cache entry was dropped');
});

test('activation does not evict a real HTML navigation response', async () => {
    const h = harness(async () => {}, {
        'https://pseudopy.test/index.html': { contentType: 'text/html; charset=utf-8' }
    });
    let lifetime;
    h.handlers.activate({ waitUntil: promise => { lifetime = promise; } });
    await lifetime;
    assert.equal(h.entries.has('https://pseudopy.test/index.html'), true,
        'the cached SPA shell must survive so offline navigation still works');
});

// Cache recovery must be scoped to the CACHE API. Deleting durable storage
// would destroy sessions, editor drafts, queued mutations and user data.
test('cache recovery never touches IndexedDB, localStorage or sessions', () => {
    assert.equal(/indexedDB\s*\.\s*open|deleteDatabase/.test(source), false,
        'the service worker must not open IndexedDB (the durable app store)');
    assert.equal(/localStorage\s*\.\s*(getItem|setItem|removeItem|clear)/.test(source), false,
        'the service worker must not touch localStorage (drafts and sessions)');
    assert.equal(/sessionStorage\s*\.\s*(getItem|setItem|removeItem)/.test(source), false,
        'the service worker must not touch session storage (tab selection)');
});

test('service worker bypasses API data and non-GET requests', () => {
    const h = harness(async () => {});
    for (const [url, method] of [['https://pseudopy.test/api/users', 'GET'], ['https://pseudopy.test/api/users', 'POST']]) {
        h.handlers.fetch({ request: { url, method }, respondWith() { assert.fail('API request should go directly to network'); } });
    }
});
