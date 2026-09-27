const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createFakeIndexedDB } = require('./helpers/fake-idb');

const source = fs.readFileSync(path.join(__dirname, '../src/database/idb-store.js'), 'utf8');

function localStorageMock(seed = {}) {
    const map = new Map(Object.entries(seed));
    return {
        getItem: k => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: k => map.delete(k),
        key: i => Array.from(map.keys())[i] ?? null,
        get length() { return map.size; }
    };
}

function harness({ withIdb = true, ls } = {}) {
    const ctx = { console, crypto, localStorage: ls || localStorageMock() };
    if (withIdb) ctx.indexedDB = createFakeIndexedDB();
    vm.createContext(ctx);
    vm.runInContext(source, ctx);
    // offlineStore is a `const` binding (not a context property); read it back.
    return {
        ctx,
        offlineStore: vm.runInContext('offlineStore', ctx),
        offlineIdbAvailable: vm.runInContext('offlineIdbAvailable', ctx),
        ensureOfflineDataMigration: vm.runInContext('ensureOfflineDataMigration', ctx)
    };
}

test('OfflineStore round-trips a mirrored collection and finds docs by _docId or id', async () => {
    const { offlineStore, offlineIdbAvailable } = harness();
    assert.equal(offlineIdbAvailable(), true);
    const docs = [{ _docId: 'u1', name: 'One' }, { _docId: 'u2', name: 'Two' }];
    await offlineStore.setCollection('users', docs);

    const readBack = await offlineStore.getCollection('users');
    assert.equal(readBack.length, 2);
    const doc = await offlineStore.getDocument('users', 'u1');
    assert.equal(doc.name, 'One');
    assert.equal(await offlineStore.getDocument('users', 'missing'), null);
});

test('setDocument upserts a doc into the durable mirror; deleteDocument removes it', async () => {
    const { offlineStore } = harness();
    await offlineStore.setCollection('users', [{ _docId: 'u1', name: 'One' }]);
    await offlineStore.setDocument('users', { _docId: 'u1', name: 'One updated' });
    let docs = await offlineStore.getCollection('users');
    assert.equal(docs.length, 1);
    assert.equal(docs[0].name, 'One updated');

    await offlineStore.setDocument('users', { _docId: 'u3', name: 'Three' });
    docs = await offlineStore.getCollection('users');
    assert.equal(docs.length, 2);

    await offlineStore.deleteDocument('users', 'u3');
    docs = await offlineStore.getCollection('users');
    assert.equal(docs.length, 1);
});

test('meta store is durable within the same DB', async () => {
    const { offlineStore } = harness();
    await offlineStore.metaSet('migrations.test', { done: true, at: '2026-09-27' });
    const record = await offlineStore.metaGet('migrations.test');
    assert.equal(record.done, true);
    assert.equal(record.key, 'migrations.test');
});

test('ensureOfflineDataMigration mirrors legacy localStorage and never deletes it', async () => {
    const ls = localStorageMock({
        'pseudopy_local_users': JSON.stringify([{ _docId: 'u1', name: 'One' }]),
        'pseudopy_local_exercises': JSON.stringify([{ _docId: 'e1', title: 'Ex' }])
    });
    const { offlineStore, ensureOfflineDataMigration } = harness({ ls });
    await ensureOfflineDataMigration();

    const users = await offlineStore.getCollection('users');
    assert.equal(users.length, 1);
    const exercises = await offlineStore.getCollection('exercises');
    assert.equal(exercises.length, 1);

    const marker = await offlineStore.metaGet('migrations.local-collections');
    assert.equal(marker.done, true);

    // Non-destructive: localStorage still holds the original keys.
    assert.ok(ls.getItem('pseudopy_local_users'));
    assert.ok(ls.getItem('pseudopy_local_exercises'));

    // Idempotent: a second run does not overwrite an existing mirror or re-mark.
    await ensureOfflineDataMigration();
    assert.equal((await offlineStore.getCollection('users')).length, 1);
});

test('with no IndexedDB the store is a graceful no-op (returns null / [] semantics)', async () => {
    const { offlineStore, offlineIdbAvailable } = harness({ withIdb: false });
    assert.equal(offlineIdbAvailable(), false);
    assert.equal(await offlineStore.getCollection('users'), null);
    assert.equal(await offlineStore.getDocument('users', 'u1'), null);
    await offlineStore.setCollection('users', [{ _docId: 'u1' }]); // must not throw
    assert.equal(await offlineStore.metaGet('anything'), undefined);
});