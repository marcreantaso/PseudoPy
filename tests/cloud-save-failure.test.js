const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const read = p => fs.readFileSync(path.join(SRC, p), 'utf8');

// ─────────────────────────────────────────────────────────────
// 1. Cause preservation: the retry wrapper must not launder a
//    permission denial into a transient "FirestoreUnavailable".
// ─────────────────────────────────────────────────────────────
function firebaseHarness() {
    const src = read('database/firebase.js') + '\n' + read('database/sync-manager.js');
    const ctx = { console, setTimeout: (fn) => fn, clearTimeout: () => { }, navigator: { onLine: true } };
    vm.createContext(ctx);
    // Lexical `const`s are not global properties, so the tuning constants have
    // to be read back out of the same script scope.
    vm.runInContext(src + '\n;globalThis.__tuning = { SYNC_BACKOFF_MAX_MS, SYNC_BACKOFF_BASE_MS, SYNC_MAX_ATTEMPTS };', ctx);
    return ctx;
}

test('FirestoreUnavailableError preserves the underlying cause', () => {
    const ctx = firebaseHarness();
    const cause = new Error('Missing or insufficient permissions.');
    const wrapped = ctx.FirestoreUnavailableError('Firestore operation failed after 1 attempt(s)', cause);
    assert.equal(wrapped.name, 'FirestoreUnavailable');
    assert.equal(wrapped.cause, cause, 'cause must survive the retry wrapper');
});

test('firestoreRetry does not retry a permission denial and stays permanent', async () => {
    const ctx = firebaseHarness();
    let calls = 0;
    const denial = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    let thrown = null;
    try {
        await ctx.firestoreRetry(async () => { calls++; throw denial; }, { attempts: 3, backoffMs: 0 });
    } catch (e) { thrown = e; }
    assert.ok(thrown, 'firestoreRetry must reject');
    assert.equal(thrown.name, 'FirestoreUnavailable');
    assert.equal(thrown.cause, denial);
    assert.equal(calls, 1, 'a permanent refusal must not be retried');
    assert.equal(ctx.isPermanentDbError(thrown), true);
    assert.equal(ctx.isTransientDbError(thrown), false);
});

test('classifyDbError sees through the retry wrapper for permission denials', () => {
    const ctx = firebaseHarness();
    const denial = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    const wrapped = ctx.FirestoreUnavailableError('failed after 1 attempt(s)', denial);
    const cls = ctx.classifyDbError(wrapped);
    assert.equal(cls.category, 'PERMISSION_DENIED', 'wrapper hid the real cause');
    assert.equal(cls.transient, false, 'a rules denial is not an outage');
    assert.equal(ctx.isPermanentDbError(wrapped), true);
    assert.equal(ctx.isTransientDbError(wrapped), false);
});

test('classifyDbError still reports genuine outages as transient', () => {
    const ctx = firebaseHarness();
    for (const err of [
        { name: 'FirestoreUnavailable', message: 'Firestore operation failed after 2 attempt(s): dead' },
        new Error('Firestore operation timed out after 4000ms'),
        Object.assign(new Error('backend unavailable'), { code: 'unavailable' }),
        new Error('Failed to fetch')
    ]) {
        const cls = ctx.classifyDbError(err);
        assert.equal(cls.transient, true, 'must stay transient: ' + cls.category + ' / ' + cls.message);
        assert.equal(ctx.isPermanentDbError(err), false);
    }
});

test('classifyDbError tolerates a cyclic cause chain', () => {
    const ctx = firebaseHarness();
    const a = new Error('a');
    const b = new Error('b');
    a.cause = b;
    b.cause = a;
    assert.doesNotThrow(() => ctx.classifyDbError(a));
});

// ─────────────────────────────────────────────────────────────
// 2. Bounded, capped backoff.
// ─────────────────────────────────────────────────────────────
test('syncBackoffDelay grows exponentially and is capped', () => {
    const ctx = firebaseHarness();
    const noJitter = () => 0; // jitter factor 0.5 -> half the capped value
    const cap = ctx.__tuning.SYNC_BACKOFF_MAX_MS;
    const d1 = ctx.syncBackoffDelay(1, noJitter);
    const d2 = ctx.syncBackoffDelay(2, noJitter);
    const d3 = ctx.syncBackoffDelay(3, noJitter);
    const d10 = ctx.syncBackoffDelay(10, noJitter);
    const d100 = ctx.syncBackoffDelay(100, noJitter);
    assert.ok(d2 > d1, 'backoff must grow: ' + d1 + ' -> ' + d2);
    assert.ok(d3 > d2, 'backoff must keep growing: ' + d2 + ' -> ' + d3);
    assert.ok(d10 <= cap, 'backoff must be capped, got ' + d10 + ' cap ' + cap);
    assert.equal(d100, d10, 'a long outage must not grow the delay without bound');
    assert.ok(d1 >= 250, 'backoff must never collapse to zero');
});

test('syncBackoffDelay jitter stays inside the capped window', () => {
    const ctx = firebaseHarness();
    const cap = ctx.__tuning.SYNC_BACKOFF_MAX_MS;
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
        const d = ctx.syncBackoffDelay(5, () => r);
        assert.ok(d > 0 && d <= cap, 'out of window: ' + d + ' cap ' + cap);
    }
});

// ─────────────────────────────────────────────────────────────
// 3. A denying Firestore is REACHABLE. Treating it as an outage
//    is what produced the un-dismissable "Reconnecting" banner.
// ─────────────────────────────────────────────────────────────
function syncHarness({ fail, onLine = true, report } = {}) {
    const src = read('database/sync-manager.js');
    const records = [];
    const calls = [];
    const timers = [];
    const ctx = {
        console,
        crypto,
        navigator: { onLine },
        firestoreReady: () => true,
        firestore: {
            collection(ref) {
                return {
                    doc(id) {
                        return {
                            async set(payload, opts) {
                                calls.push({ op: 'set', ref, id, merge: !!(opts && opts.merge) });
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
        },
        withFirestoreTimeout: op => op,
        listAllMutations: async () => records.slice(),
        updateMutationStatus: async (id, status, lastError, attempts) => {
            const r = records.find(x => x.mutationId === id);
            if (!r) return null;
            if (status) r.status = status;
            if (lastError !== undefined && lastError !== null) r.lastError = lastError;
            if (typeof attempts === 'number') r.attempts = attempts;
            return r;
        },
        removeSyncedMutation: async id => {
            const i = records.findIndex(x => x.mutationId === id);
            if (i >= 0) records.splice(i, 1);
        },
        MUTATION_STATUS: { PENDING: 'PENDING', SYNCING: 'SYNCING', SYNCED: 'SYNCED', FAILED: 'FAILED', BLOCKED_PERMISSION: 'blocked-permission' },
        MUTATION_OP_ADD: 'ADD', MUTATION_OP_SET: 'SET', MUTATION_OP_UPDATE: 'UPDATE', MUTATION_OP_DELETE: 'DELETE',
        reportCloudSaveDenied: report,
        setTimeout: fn => { timers.push(fn); return timers.length; }
    };
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    const enqueue = (ref, id) => {
        const rec = {
            mutationId: 'm1', operation: 'UPDATE', collection: ref, documentId: id,
            payload: { a: 1 }, createdAt: Date.now(), attempts: 0, status: 'PENDING', lastError: null
        };
        records.push(rec);
        return rec;
    };
    return { ctx, records, calls, timers, enqueue };
}

test('a permission-denied sync is blocked immediately, not retried, and reported', async () => {
    const reports = [];
    const denial = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    const h = syncHarness({ fail: () => denial, report: (ctx, cls) => reports.push({ ctx, cls }) });
    const rec = h.enqueue('pseudopy_users', 'u1');

    const result = await h.ctx.trySyncMutation(rec);

    assert.equal(result, false);
    assert.equal(h.calls.length, 1, 'must not retry a permanent refusal');
    assert.equal(rec.status, 'blocked-permission');
    assert.equal(h.timers.length, 0, 'no retry timer may be scheduled for a permanent failure');
    assert.equal(h.ctx.isFirestoreReachable(), true, 'a denying Firestore IS reachable');
    assert.equal(reports.length, 1, 'the UI must be told once');
    assert.equal(reports[0].cls.category, 'PERMISSION_DENIED');
    assert.equal(reports[0].ctx.ref, 'pseudopy_users');
});

test('a transient sync failure stays retryable and marks the network unreachable', async () => {
    const reports = [];
    const h = syncHarness({
        fail: () => Object.assign(new Error('backend unavailable'), { code: 'unavailable' }),
        report: (ctx, cls) => reports.push({ ctx, cls })
    });
    const rec = h.enqueue('pseudopy_exercises', 'ex1');

    await h.ctx.trySyncMutation(rec);

    assert.equal(rec.status, 'PENDING', 'transient failures must stay queued');
    assert.ok(h.timers.length > 0, 'transient failures must schedule a retry');
    assert.equal(h.ctx.isFirestoreReachable(), false);
    assert.equal(reports.length, 0, 'an outage is not a policy refusal');
});

// ─────────────────────────────────────────────────────────────
// 4. UI: transient reconnecting vs permanent dismissible status.
// ─────────────────────────────────────────────────────────────
function uiHarness({ onLine = true } = {}) {
    const src = read('app/connection-status.js');
    const storage = {};
    const elements = {};
    const listeners = {};
    const makeEl = id => {
        elements[id] = { id, hidden: true, textContent: '', __bound: false, addEventListener(ev, fn) { this.__bound = true; (this.handlers = this.handlers || {})[ev] = fn; } };
        return elements[id];
    };
    const ctx = {
        console,
        navigator: { onLine },
        sessionStorage: { getItem: k => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = v; } },
        window: { addEventListener: (ev, fn) => { listeners[ev] = fn; } },
        document: { readyState: 'complete', addEventListener: () => { } },
        $id: id => elements[id],
        syncNow: () => { },
        classifyDbError: e => e.classification
    };
    makeEl('connection-status-banner');
    makeEl('offline-save-status');
    makeEl('offline-save-status-detail');
    makeEl('offline-save-dismiss');
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    return { ctx, elements, storage, listeners };
}

test('offline-save status is shown once per session for a permanent refusal', () => {
    const h = uiHarness();
    const cls = { category: 'PERMISSION_DENIED', transient: false };

    assert.equal(h.ctx.reportCloudSaveDenied({ ref: 'r' }, cls), true);
    assert.equal(h.ctx.isOfflineSaveStatusVisible(), true, 'the dismissible status must appear');
    assert.match(h.elements['offline-save-status-detail'].textContent, /not permitted to sync/);

    h.ctx.hideOfflineSaveStatus();
    assert.equal(h.ctx.reportCloudSaveDenied({ ref: 'r' }, cls), false, 'must not re-announce in the same session');
});

test('dismissing the offline-save status is permanent for the session', () => {
    const h = uiHarness();
    const cls = { category: 'PERMISSION_DENIED', transient: false };
    h.ctx.reportCloudSaveDenied({ ref: 'r' }, cls);
    assert.equal(h.ctx.isOfflineSaveStatusVisible(), true);

    h.elements['offline-save-dismiss'].handlers.click();
    assert.equal(h.ctx.isOfflineSaveStatusVisible(), false, 'dismiss must hide the status');
    assert.equal(h.storage['pseudopy.offlineSaveDismissed'], '1');

    // Dismissal is sticky: a later refusal must not reopen it.
    assert.equal(h.ctx.reportCloudSaveDenied({ ref: 'r' }, cls), false);
    assert.equal(h.ctx.isOfflineSaveStatusVisible(), false);
});

test('resetOfflineSaveStatusForTests re-arms the session latch', () => {
    const h = uiHarness();
    const cls = { category: 'PERMISSION_DENIED', transient: false };
    h.ctx.reportCloudSaveDenied({ ref: 'r' }, cls);
    h.ctx.dismissOfflineSaveStatus();
    h.ctx.resetOfflineSaveStatusForTests();
    assert.equal(h.ctx.reportCloudSaveDenied({ ref: 'r' }, cls), true);
    assert.equal(h.ctx.isOfflineSaveStatusVisible(), true);
});

test('a transient outage is never reported as a policy refusal', () => {
    const h = uiHarness();
    assert.equal(h.ctx.reportCloudSaveDenied({ ref: 'r' }, { category: 'FIRESTORE_UNAVAILABLE', transient: true }), false);
    assert.equal(h.ctx.isOfflineSaveStatusVisible(), false, 'an outage is not a policy refusal');
    // The reconnecting banner is owned by the sync/session layer, not here.
    h.ctx.showReconnectingStatus();
    assert.equal(h.elements['connection-status-banner'].hidden, false, 'a transient outage still uses the reconnecting banner');
    assert.equal(h.ctx.isOfflineSaveStatusVisible(), false);
});

test('a genuinely offline browser shows reconnecting, not a refusal', () => {
    const h = uiHarness({ onLine: false });
    assert.equal(h.ctx.reportCloudSaveDenied({ ref: 'r' }, { category: 'PERMISSION_DENIED', transient: false }), false);
    assert.equal(h.ctx.isOfflineSaveStatusVisible(), false);
    assert.equal(h.elements['connection-status-banner'].hidden, false);
});

test('recovery hides the reconnecting banner', () => {
    const h = uiHarness();
    h.ctx.showReconnectingStatus();
    assert.equal(h.elements['connection-status-banner'].hidden, false);
    h.listeners.online();
    assert.equal(h.elements['connection-status-banner'].hidden, true);
});

test('initConnectionStatus wires the dismiss button and the online listener', () => {
    const h = uiHarness();
    h.ctx.initConnectionStatus();
    assert.equal(h.elements['offline-save-dismiss'].__bound, true);
    assert.equal(typeof h.listeners.online, 'function', 'recovery must be driven by the online event');
    assert.equal(typeof h.listeners.offline, 'function');
});

// ─────────────────────────────────────────────────────────────
// 5. Markup: the dismiss control must exist and be reachable.
// ─────────────────────────────────────────────────────────────
test('index.html ships a dismissible offline-save status region', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /id="offline-save-status"/, 'offline save status region missing');
    assert.match(html, /id="offline-save-dismiss"/, 'dismiss control missing');
    assert.match(html, /<button[^>]*id="offline-save-dismiss"[^>]*>/, 'dismiss control must be a button');
    assert.match(html, /id="offline-save-status"[^>]*role="status"|role="status"[^>]*id="offline-save-status"/, 'status region needs a live role');
});

test('the reconnecting banner and the refusal status are never both visible', () => {
    const h = uiHarness();
    h.ctx.showReconnectingStatus();
    h.ctx.reportCloudSaveDenied({ ref: 'r' }, { category: 'PERMISSION_DENIED', transient: false });
    assert.equal(h.elements['connection-status-banner'].hidden, true, 'a refusal must retire the reconnecting banner');
    assert.equal(h.ctx.isOfflineSaveStatusVisible(), true);
});
// CRUD persistence is exercised with the real queue/coordinator in sync-recovery.test.js.
