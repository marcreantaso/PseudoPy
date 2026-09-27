const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/database/mutation-queue.js'), 'utf8');

function memStore() {
    const records = [];
    return {
        records,
        isAvailable: () => true,
        async getMutations() { return records.slice(); },
        async putMutation(r) {
            const idx = records.findIndex(x => x.mutationId === r.mutationId);
            if (idx >= 0) records[idx] = r; else records.push(r);
        },
        async removeMutation(id) {
            const idx = records.findIndex(x => x.mutationId === id);
            if (idx >= 0) records.splice(idx, 1);
        }
    };
}

function localStorageMock(seed = {}) {
    const map = new Map(Object.entries(seed));
    return {
        getItem: k => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, String(v)),
        removeItem: k => map.delete(k),
        key: i => Array.from(map.keys())[i] ?? null,
        length: () => map.size,
        get length() { return map.size; }
    };
}

function harness({ store, storeAvailable = true, ls } = {}) {
    const offlineStore = store || memStore();
    if (!storeAvailable) offlineStore.isAvailable = () => false;
    const ctx = {
        console,
        crypto,
        offlineStore,
        localStorage: ls || localStorageMock()
    };
    vm.createContext(ctx);
    vm.runInContext(source, ctx);
    return ctx;
}

test('ADD then UPDATE folds into a single pending payload (latest keys win)', async () => {
    const ctx = harness();
    const rec = await ctx.enqueueMutation('ADD', 'exercises', 'ex1', { title: 'Loop', status: 'active' });
    const folded = await ctx.enqueueMutation('UPDATE', 'exercises', 'ex1', { status: 'revised' });
    assert.equal(rec.mutationId, folded.mutationId, 'mutation was not folded');
    assert.equal(folded.operation, 'ADD');
    assert.equal(folded.status, 'PENDING');
    assert.equal(folded.payload.title, 'Loop');
    assert.equal(folded.payload.status, 'revised');
    assert.equal(ctx.offlineStore.records.length, 1);
});

test('SET then UPDATE folds; UPDATE then SET replaces the op', async () => {
    const ctx = harness();
    const a = await ctx.enqueueMutation('SET', 'users', 'u9', { role: 'instructor' });
    const b = await ctx.enqueueMutation('UPDATE', 'users', 'u9', { status: 'active' });
    assert.equal(a.mutationId, b.mutationId);
    assert.equal(b.operation, 'SET');
    assert.equal(b.payload.status, 'active');

    const ctx2 = harness();
    await ctx2.enqueueMutation('UPDATE', 'users', 'u9', { role: 'student' });
    const c = await ctx2.enqueueMutation('SET', 'users', 'u9', { role: 'instructor', status: 'inactive' });
    assert.equal(c.operation, 'SET');
    assert.equal(c.payload.role, 'instructor');
    assert.equal(c.payload.status, 'inactive');
    assert.equal(ctx2.offlineStore.records.length, 1);
});

test('DELETE cancels earlier pending ops for the same doc and records the delete', async () => {
    const ctx = harness();
    await ctx.enqueueMutation('ADD', 'activity', 'act1', { seconds: 42 });
    const del = await ctx.enqueueMutation('DELETE', 'activity', 'act1', null);
    assert.equal(del.operation, 'DELETE');
    assert.equal(ctx.offlineStore.records.length, 1, 'prior pending op was not collapsed');
    assert.equal(ctx.offlineStore.records[0].operation, 'DELETE');
    const pending = await ctx.listPendingMutations('activity', 'act1');
    assert.equal(pending.length, 1);
    assert.equal(pending[0].operation, 'DELETE');
});

test('UPDATE after a DELETE stays a separate ordered record (deterministic replay)', async () => {
    const ctx = harness();
    await ctx.enqueueMutation('DELETE', 'activity', 'act2', null);
    const upd = await ctx.enqueueMutation('UPDATE', 'activity', 'act2', { seconds: 5 });
    const all = await ctx.listAllMutations();
    assert.equal(all.length, 2);
    assert.equal(all[0].operation, 'DELETE');
    assert.equal(all[1].operation, 'UPDATE');
    assert.equal(upd.payload.seconds, 5);
});

test('listPendingMutations filters by ref/docId and includeFailed surfaces FAILED', async () => {
    const ctx = harness();
    await ctx.enqueueMutation('ADD', 'exercises', 'exA', { title: 'A' });
    await ctx.enqueueMutation('ADD', 'exercises', 'exB', { title: 'B' });
    await ctx.enqueueMutation('ADD', 'users', 'u1', { name: 'x' });
    await ctx.enqueueMutation('ADD', 'users', 'u2', { name: 'y' });

    const exOnly = await ctx.listPendingMutations('exercises');
    assert.equal(exOnly.length, 2);
    const exA = await ctx.listPendingMutations('exercises', 'exA');
    assert.equal(exA.length, 1);
    const none = await ctx.listPendingMutations('exercises', 'zzz');
    assert.equal(none.length, 0);

    const all = await ctx.listAllMutations();
    let failed = 0;
    for (const r of all) { if (r.status === 'PENDING') r.status = 'FAILED'; }
    const withFailed = await ctx.listPendingMutations('exercises', null, true);
    assert.equal(withFailed.length, 2, 'includeFailed must surface FAILED records for clobber protection');
});

test('updateMutationStatus / removeSyncedMutation / clearPendingForDocument mutate the store', async () => {
    const ctx = harness();
    const rec = await ctx.enqueueMutation('ADD', 'users', 'u7', { name: 'seven' });
    const updated = await ctx.updateMutationStatus(rec.mutationId, 'SYNCING', null, 2);
    assert.equal(updated.status, 'SYNCING');
    assert.equal(updated.attempts, 2);
    await ctx.removeSyncedMutation(rec.mutationId);
    assert.equal(ctx.offlineStore.records.length, 0);

    await ctx.enqueueMutation('ADD', 'users', 'u8', { name: 'eight' });
    const rec2 = await ctx.enqueueMutation('UPDATE', 'users', 'u8', { status: 'x' });
    await ctx.updateMutationStatus(rec2.mutationId, 'SYNCING', null, 1);
    await ctx.clearPendingForDocument('users', 'u8');
    assert.equal(ctx.offlineStore.records.length, 1, 'SYNCING record must survive clearPendingForDocument');
    assert.equal(ctx.offlineStore.records[0].status, 'SYNCING');
});

test('record shape carries idempotent replay fields + deterministic ordering', async () => {
    const ctx = harness();
    const rec = await ctx.enqueueMutation('SET', 'students', 's1', { name: 'one' });
    assert.ok(rec.mutationId, 'mutation id required for idempotent replay');
    assert.equal(rec.collection, 'students');
    assert.equal(rec.documentId, 's1');
    assert.equal(typeof rec.createdAt, 'number');
    assert.equal(rec.attempts, 0);
    assert.equal(rec.status, 'PENDING');
});

test('localStorage fallback queue keeps records when IndexedDB is unavailable', async () => {
    const ls = localStorageMock();
    const ctx = harness({ storeAvailable: false, ls });
    await ctx.enqueueMutation('ADD', 'exercises', 'exX', { title: 'Fallback' });
    const list = await ctx.listAllMutations();
    assert.equal(list.length, 1);
    assert.equal(list[0].documentId, 'exX');
    assert.ok(ls.getItem('pseudopy_offline_queue'), 'fallback queue not persisted to localStorage');
    const persisted = JSON.parse(ls.getItem('pseudopy_offline_queue'));
    assert.equal(persisted[0].payload.title, 'Fallback');
});