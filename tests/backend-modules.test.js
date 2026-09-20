const test = require('node:test');
const assert = require('node:assert/strict');
const { registerRoutes } = require('../server/routes');
const store = require('../server/collection-store');

function harness(db) {
    const handlers = new Map();
    const app = Object.fromEntries(['get', 'post', 'put', 'patch', 'delete'].map(method => [method,
        (path, handler) => handlers.set(`${method} ${path}`, handler)]));
    registerRoutes(app, db);
    return async (method, path, overrides = {}) => {
        const req = { params: { collection: 'items', id: 'a' }, query: {}, body: {}, ...overrides };
        const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
        await handlers.get(`${method} ${path}`)(req, res);
        return res;
    };
}

test('collection routes preserve arguments, bodies and response codes', async () => {
    const calls = [];
    const result = { _docId: 'a', value: 1 };
    const db = Object.fromEntries(['getAll', 'getById', 'add', 'setById', 'updateById', 'deleteById'].map(method => [method,
        async (...args) => { calls.push([method, ...args]); return result; }]));
    db.count = async collection => { assert.equal(collection, 'items'); return 3; };
    const request = harness(db);
    assert.deepEqual((await request('get', '/api/:collection/count')).body, { count: 3 });
    await request('get', '/api/:collection', { query: { limit: '2', offset: '1' } });
    assert.deepEqual(calls.pop(), ['getAll', 'items', '2', '1']);
    for (const [method, path, operation, args] of [
        ['get', '/api/:collection/:id', 'getById', ['items', 'a']],
        ['post', '/api/:collection', 'add', ['items', { value: 2 }]],
        ['put', '/api/:collection/:id', 'setById', ['items', 'a', { value: 2 }]],
        ['patch', '/api/:collection/:id', 'updateById', ['items', 'a', { value: 2 }]],
        ['delete', '/api/:collection/:id', 'deleteById', ['items', 'a']]
    ]) {
        const response = await request(method, path, { body: { value: 2 } });
        assert.equal(response.statusCode, method === 'post' ? 201 : 200);
        assert.deepEqual(response.body, result);
        assert.deepEqual(calls.pop(), [operation, ...args]);
    }
    assert.equal((await request('get', '/api/health')).body.status, 'ok');
});

test('collection routes preserve not-found and database error responses', async t => {
    t.mock.method(console, 'error', () => {});
    const request = harness({ getById: async () => null, getAll: async () => { throw new Error('Unavailable'); } });
    const missing = await request('get', '/api/:collection/:id');
    assert.equal(missing.statusCode, 404);
    assert.deepEqual(missing.body, { error: 'Item not found' });
    const failure = await request('get', '/api/:collection');
    assert.equal(failure.statusCode, 500);
    assert.deepEqual(failure.body, { error: 'Unavailable' });
});

test('serverless compatibility facade shares the backend store', () => {
    assert.equal(require('../api/_db'), store);
    const collection = 'test_modular_store';
    assert.equal(store.storeCount(collection), 0);
    store.storeSetById(collection, 'a', { value: 1 });
    store.storeUpdateById(collection, 'a', { extra: 2 });
    assert.deepEqual(store.storeGetById(collection, 'a'), { _docId: 'a', value: 1, extra: 2 });
    store.storeAdd(collection, { _docId: 'b', value: 3 });
    assert.equal(store.storeCount(collection), 2);
    assert.deepEqual(store.storeGetAll(collection, '1', '1'), [{ _docId: 'b', value: 3 }]);
    assert.deepEqual(store.storeDeleteById(collection, 'a'), { success: true });
    assert.equal(store.storeGetById(collection, 'a'), null);
    store.storeDeleteById(collection, 'b');
    assert.throws(() => store.storeGetAll('../invalid'), /Invalid collection name/);
});

test('Express app serves the existing UI and accepts collection JSON requests', async t => {
    const { createApp } = require('../server/create-app');
    const app = createApp({ add: async (collection, body) => ({ ...body, _docId: 'created' }) });
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /PseudoPy/);
    const script = await fetch(`${base}/app.js?v=icons-2`);
    assert.equal(script.status, 200);
    assert.match(await script.text(), /function handleLogin/);
    const response = await fetch(`${base}/api/items`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 42 })
    });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { value: 42, _docId: 'created' });
});
