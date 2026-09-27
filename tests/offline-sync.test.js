const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/database/sync-manager.js'), 'utf8');

function memQueue() {
    const records = [];
    return {
        records,
        async listAllMutations() { return records.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); },
        async updateMutationStatus(id, status, lastError, attempts) {
            const r = records.find(x => x.mutationId === id);
            if (!r) return null;
            if (status) r.status = status;
            if (lastError !== undefined && lastError !== null) r.lastError = lastError;
            if (typeof attempts === 'number') r.attempts = attempts;
            return r;
        },
        async removeSyncedMutation(id) {
            const i = records.findIndex(x => x.mutationId === id);
            if (i >= 0) records.splice(i, 1);
        }
    };
}

function fakeFirestore(calls, fail) {
    return {
        collection(ref) {
            return {
                doc(id) {
                    return {
                        async set(payload, opts) {
                            calls.push({ op: 'set', ref, id, payload, merge: !!(opts && opts.merge) });
                            const err = fail && fail(ref, id, 'set');
                            if (err) throw err;
                        },
                        async delete() {
                            calls.push({ op: 'delete', ref, id });
                            const err = fail && fail(ref, id, 'delete');
                            if (err) throw err;
                        }
                    };
                }
            };
        }
    };
}

function harness({ ready = true, onLine = true, fail, withTimers = true } = {}) {
    const calls = [];
    const queue = memQueue();
    const capturedTimers = [];
    const timerFn = fn => { capturedTimers.push(fn); return capturedTimers.length; };
    const ctx = {
        console,
        crypto,
        firestoreReady: () => ready,
        firestore: fakeFirestore(calls, fail),
        withFirestoreTimeout: op => op,
        listAllMutations: queue.listAllMutations,
        updateMutationStatus: queue.updateMutationStatus,
        removeSyncedMutation: queue.removeSyncedMutation,
        MUTATION_STATUS: { PENDING: 'PENDING', SYNCING: 'SYNCING', SYNCED: 'SYNCED', FAILED: 'FAILED' },
        MUTATION_OP_ADD: 'ADD',
        MUTATION_OP_SET: 'SET',
        MUTATION_OP_UPDATE: 'UPDATE',
        MUTATION_OP_DELETE: 'DELETE',
        navigator: { onLine },
        setTimeout: withTimers ? timerFn : undefined
    };
    vm.createContext(ctx);
    vm.runInContext(source, ctx);
    const enqueue = (operation, ref, id, payload, attempts = 0) => {
        const rec = {
            mutationId: 'm_' + ref + '_' + id + '_' + (queue.records.length + 1),
            operation: String(operation).toUpperCase(),
            collection: ref,
            documentId: id,
            payload: payload || null,
            createdAt: Date.now() + queue.records.length,
            attempts,
            status: 'PENDING',
            lastError: null
        };
        queue.records.push(rec);
        return rec;
    };
    return { ctx, queue, calls, capturedTimers, enqueue };
}

test('classifyDbError taxonomy and transient classification', () => {
    const { ctx } = harness();
    const e1 = { name: 'FirestoreUnavailable' };
    assert.equal(ctx.classifyDbError(e1).category, 'FIRESTORE_UNAVAILABLE');
    assert.equal(ctx.classifyDbError(e1).transient, true);

    const e2 = { message: 'Firestore operation timed out after 4000ms' };
    assert.equal(ctx.classifyDbError(e2).category, 'TIMEOUT');
    assert.equal(ctx.classifyDbError(e2).transient, true);

    const e3 = { code: 'firestore/permission-denied', message: 'permission denied' };
    assert.equal(ctx.classifyDbError(e3).category, 'PERMISSION_DENIED');
    assert.equal(ctx.classifyDbError(e3).transient, false);

    const e4 = { code: 'firestore/resource-exhausted' };
    assert.equal(ctx.classifyDbError(e4).category, 'QUOTA');

    const e5 = { code: 'firestore/invalid-argument' };
    assert.equal(ctx.classifyDbError(e5).category, 'INVALID_DATA');

    const e6 = { message: 'NetworkError when attempting to fetch resource' };
    assert.equal(ctx.classifyDbError(e6).category, 'OFFLINE');
    assert.equal(ctx.classifyDbError(e6).transient, true);

    assert.equal(ctx.isTransientDbError(e2), true);
    assert.equal(ctx.isTransientDbError(e3), false);
});

test('syncNow drains the queue in createdAt order and replays the exact Firestore ops', async () => {
    const { ctx, queue, calls, enqueue } = harness();
    const a = enqueue('ADD', 'exercises', 'ex1', { title: 'A' });
    const b = enqueue('UPDATE', 'users', 'u2', { status: 'active' }, 0);
    const d = enqueue('DELETE', 'activity', 'act9', null);
    assert.equal(a.createdAt <= b.createdAt && b.createdAt <= d.createdAt, true, 'queue must be ordered by createdAt');

    const result = await ctx.syncNow('test');
    assert.equal(result.started, true);
    assert.equal(result.synced, 3);
    assert.equal(result.failed, 0);
    assert.equal(queue.records.length, 0, 'synced records must be removed');

    assert.equal(calls.length, 3);
    assert.deepEqual(calls[0], { op: 'set', ref: 'exercises', id: 'ex1', payload: { title: 'A' }, merge: false });
    assert.deepEqual(calls[1], { op: 'set', ref: 'users', id: 'u2', payload: { status: 'active' }, merge: true });
    assert.deepEqual(calls[2], { op: 'delete', ref: 'activity', id: 'act9' });

    const state = await ctx.getSyncState();
    assert.equal(state.pending, 0);
    assert.equal(state.reachable, true);
});

test('transient failures stay PENDING with bounded backoff, then FAILED at the retry cap', async () => {
    const transient = (ref, id) => { const e = new Error('Firestore unavailable offline'); e.name = 'FirestoreUnavailable'; return e; };
    const { ctx, queue, capturedTimers, enqueue } = harness({ fail: transient });
    enqueue('ADD', 'users', 'u1', { name: 'x' });

    await ctx.syncNow('test');
    assert.equal(queue.records.length, 1);
    assert.equal(queue.records[0].status, 'PENDING');
    assert.equal(queue.records[0].attempts, 1);
    assert.equal(capturedTimers.length, 1, 'a backoff retry must be scheduled');
    let state = await ctx.getSyncState();
    assert.equal(state.reachable, false, 'transient failure must mark Firestore unreachable');

    await ctx.syncNow('test');
    assert.equal(queue.records[0].attempts, 2);
    assert.equal(capturedTimers.length, 2);

    await ctx.syncNow('test');
    assert.equal(queue.records[0].status, 'FAILED');
    assert.match(queue.records[0].lastError, /Sync retry limit reached/);
    assert.equal(capturedTimers.length, 2, 'no new retry once the cap is hit');

    // FAILED records are never replayed by a later sync.
    const after = await ctx.syncNow('test');
    assert.equal(after.started, true);
    assert.equal(after.synced, 0);
    assert.equal(queue.records[0].status, 'FAILED');
});

test('permanent failures go straight to FAILED and are never queued again', async () => {
    const denied = (ref, id) => { const e = new Error('permission denied'); e.code = 'firestore/permission-denied'; return e; };
    const { ctx, queue, capturedTimers, enqueue } = harness({ fail: denied });
    enqueue('SET', 'users', 'u9', { role: 'instructor' });

    await ctx.syncNow('test');
    assert.equal(queue.records.length, 1);
    assert.equal(queue.records[0].status, 'FAILED');
    assert.match(queue.records[0].lastError, /permission/i);
    assert.equal(capturedTimers.length, 0, 'permanent failures never schedule retries');
    const state = await ctx.getSyncState();
    assert.equal(state.reachable, true, 'a live-but-denying Firestore is still reachable');
});

test('the sync lock releases between runs; a successful op re-proves reachability', async () => {
    const { ctx, queue, enqueue } = harness();
    enqueue('SET', 'users', 'u1', { name: 'one' });

    const first = await ctx.syncNow('test');
    assert.equal(first.started, true);
    const second = await ctx.syncNow('test');
    assert.equal(second.started, true, 'lock must release after each run');

    await ctx.markFirestoreReachable(false);
    let state = await ctx.getSyncState();
    assert.equal(state.reachable, false);

    const blocked = ctx.requireOnline();
    assert.equal(blocked.ok, false);
    assert.equal(blocked.message, 'This action requires an internet connection.');

    enqueue('SET', 'users', 'u2', { name: 'two' });
    await ctx.syncNow('test');
    state = await ctx.getSyncState();
    assert.equal(state.reachable, true, 'a successful Firestore op proves reachability again');
    assert.equal(ctx.requireOnline().ok, true);
});

test('requireOnline gates: SDK missing, navigator offline, or Firestore unreachable', async () => {
    const { ctx } = harness({ ready: false });
    const noSdk = ctx.requireOnline();
    assert.equal(noSdk.ok, false);
    assert.equal(noSdk.reason, 'online');

    const { ctx: offlineCtx } = harness({ ready: true, onLine: false });
    assert.equal(offlineCtx.requireOnline().ok, false);

    const { ctx: normal } = harness({ ready: true, onLine: true });
    assert.equal(normal.requireOnline().ok, true);
});

test('initSyncCoordinator registers app triggers and honors navigator.onLine at boot', async () => {
    const listeners = new Map();
    const window = initStub => ({ addEventListener: (t, fn) => listeners.set(t, fn), initStub });
    const document = { addEventListener: (t, fn) => listeners.set('doc-' + t, fn), readyState: 'complete' };
    const { ctx } = harness({ ready: false, onLine: false });
    ctx.window = window();
    ctx.document = document;

    ctx.initSyncCoordinator();
    let state = await ctx.getSyncState();
    assert.equal(state.reachable, false, 'boot with navigator offline must mark Firestore unreachable');
    assert.ok(listeners.has('online'));
    assert.ok(listeners.has('pageshow'));
    assert.ok(listeners.has('doc-visibilitychange'));

    ctx.navigator.onLine = true;
    listeners.get('online')();
    state = await ctx.getSyncState();
    assert.equal(state.reachable, true, 'the online event is a hint that re-arms reachability');
});

test('syncNow refuses to start when Firestore is not ready', async () => {
    const { ctx, enqueue } = harness({ ready: false });
    enqueue('ADD', 'users', 'u1', { name: 'x' });
    const result = await ctx.syncNow('test');
    assert.equal(result.started, false);
    const state = await ctx.getSyncState();
    assert.equal(state.pending, 1, 'queue must remain untouched while Firestore is not ready');
});