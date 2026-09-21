const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../sw.js'), 'utf8');
function harness(addAll) {
    const handlers = {};
    const deleted = [];
    let claimed = false;
    vm.runInNewContext(source, { self: { location: { origin: 'https://pseudopy.test' },
        addEventListener: (name, fn) => { handlers[name] = fn; },
        clients: { claim: async () => { claimed = true; } } },
        caches: { open: async () => ({ addAll, put: async () => {} }),
            keys: async () => ['pseudopy-shell-old', 'unrelated-cache'], delete: async key => deleted.push(key) },
        fetch: async () => ({}), Request: class {}, URL, console });
    return { handlers, deleted, claimed: () => claimed };
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

test('service worker bypasses API data and non-GET requests', () => {
    const h = harness(async () => {});
    for (const [url, method] of [['https://pseudopy.test/api/users', 'GET'], ['https://pseudopy.test/api/users', 'POST']]) {
        h.handlers.fetch({ request: { url, method }, respondWith() { assert.fail('API request should go directly to network'); } });
    }
});
