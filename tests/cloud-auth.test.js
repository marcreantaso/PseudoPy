const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const read = p => fs.readFileSync(p, 'utf8');
const readSrc = p => read(path.join(SRC, p));

// ─────────────────────────────────────────────────────────────
// 1. The Auth SDK must actually be loaded. Its absence is what
//    left every request anonymous (`request.auth == null`).
// ─────────────────────────────────────────────────────────────
test('index.html loads the Firebase Auth SDK, not just App and Firestore', () => {
    const html = read(path.join(ROOT, 'index.html'));
    assert.match(html, /firebase-app-compat\.js/, 'app SDK missing');
    assert.match(html, /firebase-firestore-compat\.js/, 'firestore SDK missing');
    assert.match(html, /firebase-auth-compat\.js/, 'auth SDK missing: request.auth would always be null');
    // Auth must load before the database bundle that reads firebase.auth().
    const authAt = html.indexOf('firebase-auth-compat.js');
    const dbAt = html.indexOf('src="database.js"');
    assert.ok(authAt !== -1 && dbAt !== -1, 'scripts must both be present');
    assert.ok(authAt < dbAt, 'the Auth SDK must be loaded before database.js initialises it');
});

test('the cloud-auth module is registered in the database bundle', () => {
    const bundles = JSON.parse(readSrc('bundles.json'));
    const list = bundles['database.js'];
    const at = list.indexOf('src/database/cloud-auth.js');
    assert.ok(at !== -1, 'src/database/cloud-auth.js is not in the database bundle');
    assert.ok(
        list.indexOf('src/database/firebase.js') < at,
        'cloud-auth must load after firebase.js so firebase.apps is populated'
    );
    assert.ok(
        at < list.indexOf('src/database/collections.js'),
        'cloud-auth must load before collections.js stamps the owner uid'
    );
});

// ─────────────────────────────────────────────────────────────
// 2. cloud-auth: additive, non-throwing, and honest about state.
// ─────────────────────────────────────────────────────────────
function authHarness({ hasAuth = true, initialUser = null, signInError = null } = {}) {
    const listeners = { auth: [] };
    const fakeAuth = {
        currentUser: initialUser,
        onAuthStateChanged(next, onError) {
            listeners.auth.push(next);
            // Synchronous: this object is a host-realm function, so it would
            // otherwise capture Node's real setTimeout instead of the sandbox's.
            next(initialUser);
            return () => { };
        },
        async signInWithEmailAndPassword(email, password) {
            if (signInError) throw signInError;
            fakeAuth.currentUser = { uid: 'uid_' + email, email };
            return { user: fakeAuth.currentUser };
        },
        async signOut() { fakeAuth.currentUser = null; }
    };
    const ctx = {
        console: { log() {}, info() {}, warn() {}, error() {} },
        setTimeout: (fn) => fn(),
        firebase: hasAuth ? { apps: [{}], auth: () => fakeAuth } : undefined
    };
    vm.createContext(ctx);
    vm.runInContext(readSrc('database/cloud-auth.js'), ctx);
    return { ctx, fakeAuth, listeners };
}

test('without the Auth SDK the app reports unavailable and keeps old behaviour', () => {
    const h = authHarness({ hasAuth: false });
    assert.equal(h.ctx.cloudAuthAvailable(), false);
    assert.equal(h.ctx.cloudAuthReady(), false);
    assert.equal(h.ctx.cloudUid(), null);
    // The deferral guard must be false, so a permission-denied keeps its
    // pre-existing permanent-failure semantics rather than looping.
    assert.equal(h.ctx.cloudAuthPendingSignIn(), false);
});

test('a resolved but signed-out session is the only case that defers a denial', () => {
    const h = authHarness({ initialUser: null });
    assert.equal(h.ctx.cloudAuthAvailable(), true);
    assert.equal(h.ctx.cloudAuthReady(), true);
    assert.equal(h.ctx.cloudUid(), null);
    assert.equal(h.ctx.cloudAuthPendingSignIn(), true, 'a signed-out browser must defer, not fail');
});

test('a signed-in session exposes the uid and does not defer', () => {
    const h = authHarness({ initialUser: { uid: 'uid_student', email: 'mikaella@example.test' } });
    assert.equal(h.ctx.cloudUid(), 'uid_student');
    assert.equal(h.ctx.cloudAuthPendingSignIn(), false);
    assert.equal(h.ctx.cloudAuthStatus().state, 'signed-in');
});

test('signInToCloud never throws and reports a missing account cleanly', async () => {
    const missing = Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
    const h = authHarness({ signInError: missing });
    const result = await h.ctx.signInToCloud('nobody@example.test', 'secret');
    assert.equal(result.ok, false, 'a missing cloud account must not break the in-app login');
    assert.equal(result.reason, 'auth/user-not-found');
});

test('signInToCloud skips the call entirely without an Auth SDK', async () => {
    const h = authHarness({ hasAuth: false });
    const result = await h.ctx.signInToCloud('a@b.test', 'x');
    // Cross-realm object: compare fields, not identity.
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unavailable');
});

test('session changes notify listeners so the queue can be drained', () => {
    const h = authHarness({ initialUser: null });
    const seen = [];
    const stop = h.ctx.onCloudAuthChanged(user => seen.push(user));
    h.listeners.auth.forEach(fn => fn({ uid: 'uid_x' }));
    assert.equal(seen.length, 1, 'a new session must reach the sync coordinator');
    stop();
    h.listeners.auth.forEach(fn => fn({ uid: 'uid_y' }));
    assert.equal(seen.length, 1, 'unsubscribe must actually detach');
});

// ─────────────────────────────────────────────────────────────
// 3. Writes carry the ownership fields the rules require.
// ─────────────────────────────────────────────────────────────
function collectionsHarness({ uid = 'uid_student', signInPending = false, mode = 'success' } = {}) {
    let local = [];
    const queued = [];
    const logged = [];
    const ctx = vm.createContext({
        console: { info() { }, warn(...a) { logged.push(a.join(' ')); }, error() { } },
        getLocalCollection: () => local,
        setLocalCollection: (_, data) => { local = data; },
        firestoreReady: () => mode !== 'offline',
        withFirestoreTimeout: p => p,
        cloudUid: () => (signInPending ? null : uid),
        cloudAuthPendingSignIn: () => signInPending,
        classifyDbError: error => ({ category: 'permission-denied', transient: false, message: error.message }),
        enqueueMutation: async (...args) => { queued.push(args); return {mutationId:'m1'}; },
        listAllMutations: async () => mode === 'success' ? [] : [{mutationId:'m1',status:'blocked-permission'}],
        markFirestoreReachable: () => { },
        clearPendingForDocument: async () => { },
        syncNow: async () => { if(mode !== 'offline') { const a=queued.at(-1); try { await ctx.firestore.collection(a[1]).doc(a[2]).set(a[3]); } catch(e) {} } },
        firestore: { collection: () => ({ doc: () => ({ set: async () => {
            if (mode === 'denied') throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
        } }) }) }
    });
    vm.runInContext(readSrc('database/collections.js'), ctx);
    return { ctx, local: () => local, queued, logged };
}

test('a write is stamped with the auth uid and updatedAt', async () => {
    const h = collectionsHarness({ uid: 'uid_student' });
    const written = [];
    h.ctx.firestore.collection = () => ({ doc: () => ({ set: async payload => written.push(payload) }) });
    await h.ctx.dbSet('pseudopy_activity', 'act_1', { studentAccountId: 'u_stu_mdaet', value: 1 });
    assert.equal(written[0].uid, 'uid_student', 'the rules require uid == request.auth.uid');
    assert.ok(written[0].updatedAt, 'every write must carry updatedAt');
    assert.equal(written[0].studentAccountId, 'u_stu_mdaet', 'existing fields must survive');
});

test('no uid is invented when there is no cloud session', async () => {
    const h = collectionsHarness({ signInPending: true });
    const written = [];
    h.ctx.firestore.collection = () => ({ doc: () => ({ set: async payload => written.push(payload) }) });
    await h.ctx.dbSet('pseudopy_activity', 'act_1', { value: 1 });
    assert.ok(!('uid' in written[0]), 'must never fabricate an owner id');
    assert.ok(written[0].updatedAt, 'updatedAt is still stamped');
});

test('a denial while signed out is queued for replay, not lost', async () => {
    const h = collectionsHarness({ mode: 'denied', signInPending: true });
    await assert.rejects(h.ctx.dbSet('pseudopy_activity', 'act_1', { value: 1 }), e => e.localOnly === true);
    assert.equal(h.queued.length, 1, 'the write must be replayed after sign-in, not stranded as FAILED');
    assert.equal(h.queued[0][1], 'pseudopy_activity');
    assert.equal(h.queued[0][2], 'act_1');
});

test('a denial while signed in remains durably queued', async () => {
    const h = collectionsHarness({ mode: 'denied', signInPending: false });
    await assert.rejects(h.ctx.dbSet('pseudopy_activity', 'act_1', { value: 1 }), e => e.localOnly === true);
    assert.equal(h.queued.length, 1, 'a refusal must remain replayable');
});

test('the local draft is retained whatever the cloud does', async () => {
    const h = collectionsHarness({ mode: 'denied', signInPending: true });
    await assert.rejects(h.ctx.dbSet('pseudopy_activity', 'act_1', { value: 42 }), e => e.localOnly === true);
    assert.equal(h.local()[0].value, 42, 'the offline fallback must keep the user work');
});

// ─────────────────────────────────────────────────────────────
// 4. The sync engine defers a denial only while signed out.
// ─────────────────────────────────────────────────────────────
function syncHarness({ deny = true, signInPending = false } = {}) {
    const src = readSrc('database/sync-manager.js');
    const records = [];
    const timers = [];
    const logged = [];
    const reports = [];
    const ctx = {
        console: { info() { }, warn(...a) { logged.push(a.join(' ')); }, error() { } },
        navigator: { onLine: true },
        firestoreReady: () => true,
        firestore: {
            collection: () => ({ doc: () => ({
                async set() { if (deny) throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }); },
                async delete() { }
            }) })
        },
        withFirestoreTimeout: op => op,
        withCloudOwnership: p => Object.assign({}, p || {}),
        cloudAuthPendingSignIn: () => signInPending,
        listAllMutations: async () => records.slice(),
        updateMutationStatus: async (id, status, lastError, attempts) => {
            const r = records.find(x => x.mutationId === id);
            if (r) { if (status) r.status = status; if (attempts !== undefined) r.attempts = attempts; }
            return r;
        },
        removeSyncedMutation: async id => {
            const i = records.findIndex(x => x.mutationId === id);
            if (i !== -1) records.splice(i, 1);
        },
        MUTATION_STATUS: { PENDING: 'PENDING', SYNCING: 'SYNCING', SYNCED: 'SYNCED', FAILED: 'FAILED' },
        MUTATION_OP_ADD: 'ADD', MUTATION_OP_SET: 'SET', MUTATION_OP_UPDATE: 'UPDATE', MUTATION_OP_DELETE: 'DELETE',
        reportCloudSaveDenied: (c, cls) => reports.push({ c, cls }),
        onCloudAuthChanged: () => () => { },
        setTimeout: fn => { timers.push(fn); return timers.length; }
    };
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    const enqueue = (ref, id) => {
        const rec = { mutationId: 'm1', operation: 'UPDATE', collection: ref, documentId: id, payload: { a: 1 }, createdAt: 1, attempts: 0, status: 'PENDING' };
        records.push(rec);
        return rec;
    };
    return { ctx, records, timers, logged, reports, enqueue };
}

test('a queued write denied while signed out is blocked-permission with no retry timer', async () => {
    const h = syncHarness({ signInPending: true });
    const rec = h.enqueue('pseudopy_activity', 'act_1');
    const result = await h.ctx.trySyncMutation(rec);
    assert.equal(result, false, 'not synced yet');
    assert.equal(rec.status, 'blocked-permission', 'must stay queued for the next sign-in');
    assert.equal(h.timers.length, 0, 'no backoff timer: this must not become a retry loop');
    assert.equal(h.reports.length, 1, 'the UI is still told once');

});

test('a queued write denied while signed in remains blocked', async () => {
    const h = syncHarness({ signInPending: false });
    const rec = h.enqueue('pseudopy_activity', 'act_1');
    await h.ctx.trySyncMutation(rec);
    assert.equal(rec.status, 'blocked-permission', 'a signed-in refusal remains replayable');
    assert.equal(h.timers.length, 0, 'a permanent failure is never retried');
    assert.equal(h.reports.length, 1);
});

test('a new cloud session drains the queue', async () => {
    const src = readSrc('database/sync-manager.js');
    const records = [];
    const writes = [];
    let authListener = null;
    records.push({
        mutationId: 'm1', operation: 'UPDATE', collection: 'pseudopy_activity',
        documentId: 'act_1', payload: { a: 1 }, createdAt: 1, attempts: 0, status: 'PENDING'
    });
    const ctx = vm.createContext({
        console: { info() { }, warn() { }, error() { } },
        navigator: { onLine: true },
        window: { addEventListener: () => { } },
        document: { addEventListener: () => { } },
        firestoreReady: () => true,
        firestore: { collection: () => ({ doc: () => ({ set: async (p, o) => { writes.push({ p, o }); }, delete: async () => { } }) }) },
        withFirestoreTimeout: op => op,
        withCloudOwnership: p => Object.assign({}, p || {}),
        listAllMutations: async () => records.slice(),
        updateMutationStatus: async (id, status) => { const r = records.find(x => x.mutationId === id); if (r) r.status = status; },
        removeSyncedMutation: async id => { const i = records.findIndex(x => x.mutationId === id); if (i !== -1) records.splice(i, 1); },
        MUTATION_STATUS: { PENDING: 'PENDING', SYNCING: 'SYNCING', SYNCED: 'SYNCED', FAILED: 'FAILED' },
        MUTATION_OP_ADD: 'ADD', MUTATION_OP_SET: 'SET', MUTATION_OP_UPDATE: 'UPDATE', MUTATION_OP_DELETE: 'DELETE',
        onCloudAuthChanged: fn => { authListener = fn; return () => { }; },
        reportCloudSaveDenied: () => { }
    });
    vm.runInContext(src, ctx);

    ctx.initSyncCoordinator();
    assert.ok(authListener, 'the coordinator must observe the cloud session');

    // Signing out must not replay anything.
    authListener(null);
    assert.equal(writes.length, 0, 'sign-out is not a sync trigger');

    // Signing in must drain the deferred write.
    authListener({ uid: 'uid_student' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(writes.length, 1, 'a new session must drain the deferred writes');
    assert.equal(writes[0].p.a, 1, 'the queued payload must reach Firestore');
    assert.equal(records.length, 0, 'a synced mutation must leave the queue');
});

test('the cloud-auth hook is registered only once per page', () => {
    const src = readSrc('database/sync-manager.js');
    let registrations = 0;
    const ctx = vm.createContext({
        console: { info() { }, warn() { }, error() { } },
        navigator: { onLine: true },
        window: { addEventListener: () => { } },
        document: { addEventListener: () => { } },
        firestoreReady: () => true,
        listAllMutations: async () => [],
        onCloudAuthChanged: () => { registrations++; return () => { }; },
        reportCloudSaveDenied: () => { }
    });
    vm.runInContext(src, ctx);
    ctx.initSyncCoordinator();
    ctx.initSyncCoordinator();
    ctx.initSyncCoordinator();
    assert.equal(registrations, 1, 'a second listener would double-drain the queue');
});

// ─────────────────────────────────────────────────────────────
// 5. UI: one dismissible notice, with a Retry action, and the
//    "waiting for sign-in" wording must not blame the user.
// ─────────────────────────────────────────────────────────────
function uiHarness({ onLine = true } = {}) {
    const src = readSrc('app/connection-status.js');
    const storage = {};
    const elements = {};
    const listeners = {};
    const toasts = [];
    const makeEl = id => {
        elements[id] = { id, hidden: true, textContent: '', __bound: false, addEventListener(ev, fn) { this.__bound = true; (this.handlers = this.handlers || {})[ev] = fn; } };
        return elements[id];
    };
    const ctx = {
        console: { info() { }, warn() { }, error() { } },
        navigator: { onLine },
        sessionStorage: { getItem: k => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = v; } },
        window: { addEventListener: (ev, fn) => { listeners[ev] = fn; } },
        document: { readyState: 'complete', addEventListener: () => { } },
        $id: id => elements[id],
        syncNow: () => ({ started: true, synced: 2, failed: 0, skipped: 0, reason: 'manual-retry' }),
        getSyncState: () => ({ pending: 2 }),
        showToast: (m, t) => toasts.push({ m, t })
    };
    makeEl('connection-status-banner');
    makeEl('offline-save-status');
    makeEl('offline-save-status-detail');
    makeEl('offline-save-retry');
    makeEl('offline-save-dismiss');
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    return { ctx, elements, storage, listeners, toasts };
}

test('a deferred write does not tell the user to contact an administrator', () => {
    const h = uiHarness();
    const cls = { category: 'PERMISSION_DENIED', transient: false };
    assert.equal(h.ctx.reportCloudSaveDenied({ ref: 'r', pendingSignIn: true }, cls), true);
    const text = h.elements['offline-save-status-detail'].textContent;
    assert.match(text, /not signed in to the cloud/i, 'must explain the real cause: ' + text);
    assert.doesNotMatch(text, /not permitted to sync/, 'must not blame the account: ' + text);
});

test('a genuine refusal still keeps the permission wording', () => {
    const h = uiHarness();
    h.ctx.reportCloudSaveDenied({ ref: 'r' }, { category: 'PERMISSION_DENIED', transient: false });
    assert.match(h.elements['offline-save-status-detail'].textContent, /not permitted to sync/);
});

test('Retry drains the queue, reports success and re-arms the notice', async () => {
    const h = uiHarness();
    h.ctx.reportCloudSaveDenied({ ref: 'r', pendingSignIn: true }, { category: 'PERMISSION_DENIED', transient: false });
    assert.equal(h.ctx.isOfflineSaveStatusVisible(), true);

    const summary = await h.ctx.retryCloudSyncNow();

    assert.equal(summary.synced, 2);
    assert.equal(h.ctx.isOfflineSaveStatusVisible(), false, 'a successful sync clears the notice');
    assert.equal(h.toasts.length, 1);
    assert.match(h.toasts[0].m, /Synced 2 pending change/);
    // Re-armed: a later genuine failure may be announced again.
    assert.equal(h.ctx.reportCloudSaveDenied({ ref: 'r' }, { category: 'PERMISSION_DENIED', transient: false }), true);
});

test('Retry says so plainly when nothing could be synced', async () => {
    const h = uiHarness();
    h.ctx.syncNow = () => ({ started: true, synced: 0, failed: 3, skipped: 0, reason: 'manual-retry' });
    await h.ctx.retryCloudSyncNow();
    assert.equal(h.toasts.length, 1);
    assert.match(h.toasts[0].m, /safe on this device/i);
    assert.equal(h.toasts[0].t, 'info', 'a failed retry is not an error state');
});

test('the Retry control is wired and present in the markup', () => {
    const h = uiHarness();
    h.ctx.initConnectionStatus();
    assert.equal(h.elements['offline-save-retry'].__bound, true, 'Retry must be bound');
    const html = read(path.join(ROOT, 'index.html'));
    assert.match(html, /id="offline-save-retry"/, 'Retry control missing from the notice');
    assert.match(html, /<button[^>]*id="offline-save-retry"/, 'Retry must be a real button');
});

// ─────────────────────────────────────────────────────────────
// 6. No more un-dismissable red box on every failed write.
// ─────────────────────────────────────────────────────────────
test('a rejected write routes through the once-per-session notice', () => {
    const init = readSrc('app/initialization.js');
    assert.match(init, /reportCloudSaveDenied\(/, 'writes must use the shared notice');
    assert.doesNotMatch(init, /var\(--danger\)/, 'the ad-hoc red box must be gone');
    assert.doesNotMatch(init, /createElement\('div'\)[\s\S]{0,120}cloud-save-status/, 'the second notice element must not be created');
    // The id survives only to clean up an element left by an older release.
    assert.match(init, /function hideLegacyCloudSaveNotice\(\)/);
});

test('seeding is restricted to staff sessions', () => {
    const init = readSrc('app/initialization.js');
    assert.match(init, /function canSeedFirestore\(\)/, 'seed gate missing');
    assert.match(init, /if \(!canSeedFirestore\(\)\)/, 'init must consult the seed gate');
    // The seed set spans other users' accounts and activity, which least-
    // privilege rules correctly refuse for a student.
    assert.match(init, /currentUser\.role === 'admin' \|\| currentUser\.role === 'instructor'/);
});

// ─────────────────────────────────────────────────────────────
// 7. The rulesets are present and mutually exclusive.
// ─────────────────────────────────────────────────────────────
test('firestore.rules is the least-privilege end state, not the permissive one', () => {
    const rules = read(path.join(ROOT, 'firestore.rules'));
    assert.match(rules, /function signedIn\(\)/);
    assert.match(rules, /function isAdmin\(\)/);
    assert.match(rules, /function isInstructor\(\)/);
    assert.match(rules, /function ownsAccount\(/);
    assert.match(rules, /request\.resource\.data\.uid == request\.auth\.uid/, 'owners must bind their own uid');
    assert.match(rules, /function roleUnchanged\(\)/, 'owners must not be able to change their own role');
    assert.match(rules, /match \/\{document=\*\*\}/, 'a default-deny rule is required');
    assert.match(rules, /allow read, write: if false;/, 'the default must be deny');
    assert.doesNotMatch(rules, /allow read, write: if true;/, 'the permissive block must be gone');
    assert.match(rules, /function keepsOwnership\(\)/);
});

test('passwordRequests is never client-readable', () => {
    const rules = read(path.join(ROOT, 'firestore.rules'));
    const block = rules.split('match /pseudopy_passwordRequests/{doc}')[1].split('match /')[0];
    assert.match(block, /allow get: if isStaff\(\)/, 'only staff may read a request directly');
    assert.doesNotMatch(block, /allow list: if true/);
    assert.doesNotMatch(block, /allow read/);
});

test('the interim bridge ruleset exists and is clearly labelled as temporary', () => {
    const interim = read(path.join(ROOT, 'firestore.interim.rules'));
    assert.match(interim, /allow read, write: if true;/, 'the bridge must stay permissive to unblock sign-in');
    assert.match(interim, /NOT a security boundary/i);
    assert.match(interim, /pseudopy_passwordRequests/, 'every collection the app uses must be covered');
    assert.match(interim, /pseudopy_counters/);
});
