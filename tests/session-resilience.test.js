const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

function databaseSandbox(overrides = {}) {
    const scheduled = [];
    const sandbox = vm.createContext({
        console: { log() {}, warn() {}, info() {}, error() {} },
        setTimeout: (fn, ms) => { scheduled.push({ fn, ms }); return scheduled.length; },
        clearTimeout() {},
        ...overrides
    });
    return { sandbox, scheduled };
}

test('firestoreRetry bounds attempts and throws a typed transient error once exhausted', async () => {
    const { sandbox } = databaseSandbox();
    vm.runInContext(read('src/database/firebase.js'), sandbox);
    let calls = 0;
    const fail = () => { calls++; throw new Error('connection reset'); };
    await assert.rejects(
        () => sandbox.firestoreRetry(fail, { attempts: 3, timeoutMs: 50, backoffMs: 0 }),
        err => err.name === 'FirestoreUnavailable' && /3 attempt/.test(err.message),
        'firestoreRetry must throw FirestoreUnavailable after bounded retries'
    );
    assert.equal(calls, 3, 'firestoreRetry did not stop after the configured attempts');
    calls = 0;
    assert.equal(await sandbox.firestoreRetry(() => { calls++; return 'ok'; }, { attempts: 4, timeoutMs: 50, backoffMs: 0 }), 'ok');
    assert.equal(calls, 1, 'firestoreRetry retried after success');
});

test('strict dbGet rethrows the typed failure; non-strict returns the local fallback', async () => {
    const { sandbox } = databaseSandbox();
    sandbox.firebase = {
        apps: [],
        initializeApp() {},
        firestore() {
            return { collection() { return { doc() { return { get: () => Promise.reject(new Error('offline')) }; } }; } };
        }
    };
    vm.runInContext(read('src/database/firebase.js'), sandbox);
    sandbox.getLocalCollection = () => [];
    sandbox.setLocalCollection = () => {};
    sandbox.seedDatabase = async () => {};
    sandbox.getInitialSeedActivity = () => [];
    sandbox.getInitialSeedUsers = () => [];
    vm.runInContext(read('src/database/collections.js'), sandbox);

    await assert.rejects(
        () => sandbox.dbGet('pseudopy_users', 'u1', { strict: true, attempts: 2, timeoutMs: 50, backoffMs: 0 }),
        err => err.name === 'FirestoreUnavailable',
        'strict dbGet must not lose the typed transient error'
    );

    sandbox.getLocalCollection = () => [{ _docId: 'u1', id: 'u1', role: 'student', status: 'active' }];
    await assert.rejects(
        () => sandbox.dbGet('pseudopy_users', 'u1', { strict: true, attempts: 2, timeoutMs: 50, backoffMs: 0 }),
        err => err.name === 'FirestoreUnavailable',
        'strict dbGet must never silently substitute a cached copy for Firestore authority'
    );

    sandbox.getLocalCollection = () => [];
    assert.equal(await sandbox.dbGet('pseudopy_users', 'u1', { attempts: 2, timeoutMs: 50, backoffMs: 0 }), null, 'non-strict dbGet keeps the silent fallback');
    sandbox.getLocalCollection = () => [{ _docId: 'u1', id: 'u1', role: 'instructor', status: 'active' }];
    const fallback = await sandbox.dbGet('pseudopy_users', 'u1', { attempts: 2, timeoutMs: 50, backoffMs: 0 });
    assert.equal(fallback && fallback.role, 'instructor', 'non-strict dbGet should fall back to the cache');
});

// Regression: an offline boot used to be read as "Firestore confirms the account
// is gone". With the browser offline the cloud branch was skipped entirely, so a
// strict read fell through to the local cache and returned a miss that
// restoreSession could not distinguish from a deletion -- silently clearing the
// stored session and logging the student out on every offline reload.
test('strict dbGet reports unavailability instead of a cache miss when the cloud read is skipped', async () => {
    const { sandbox } = databaseSandbox({
        navigator: { onLine: false },
        fetch: () => Promise.reject(new Error('offline'))
    });
    sandbox.firebase = {
        apps: [],
        initializeApp() {},
        firestore() {
            return { collection() { return { doc() { return { get: () => Promise.reject(new Error('offline')) }; } }; } };
        }
    };
    vm.runInContext(read('src/database/firebase.js'), sandbox);
    vm.runInContext(read('src/database/sync-manager.js'), sandbox);
    // An empty local cache is the common case: the profile was never cached.
    sandbox.getLocalCollection = () => [];
    sandbox.setLocalCollection = () => {};
    sandbox.seedDatabase = async () => {};
    sandbox.getInitialSeedActivity = () => [];
    sandbox.getInitialSeedUsers = () => [];
    vm.runInContext(read('src/database/collections.js'), sandbox);

    assert.equal(sandbox.cloudRequestsAllowed(), false, 'the cloud must be unreachable while offline');
    await assert.rejects(
        () => sandbox.dbGet('pseudopy_users', 'u1', { strict: true, attempts: 1, timeoutMs: 50, backoffMs: 0 }),
        err => err.name === 'FirestoreUnavailable' || err.code === 'unavailable',
        'a strict read must surface the outage, never a cache miss that reads as a deletion'
    );

    // A permanent circuit error must still reach the caller as permanent so a
    // ruleset refusal is not retried as if it were a flaky network.
    const denied = Object.assign(new Error('Missing or insufficient permissions'), { name: 'FirestoreUnavailable' });
    sandbox.recordCloudFailure(denied, { ref: 'pseudopy_users' });
    await assert.rejects(
        () => sandbox.dbGet('pseudopy_users', 'u1', { strict: true, attempts: 1, timeoutMs: 50, backoffMs: 0 }),
        err => /insufficient permissions/.test(err.message),
        'the underlying permanent refusal must stay reachable'
    );

    // Non-strict reads keep their documented silent cache fallback.
    sandbox.resetCloudCircuit();
    sandbox.getLocalCollection = () => [{ _docId: 'u1', id: 'u1', role: 'student', status: 'active' }];
    const fallback = await sandbox.dbGet('pseudopy_users', 'u1', { attempts: 1, timeoutMs: 50, backoffMs: 0 });
    assert.equal(fallback && fallback.role, 'student', 'non-strict dbGet must still serve from the cache while offline');
});

function sessionHarness({ dbGet, session = null, cached = null, schedule = true }) {
    const storage = new Map(session ? [['pseudopy_session_user', JSON.stringify(session)]] : []);
    const scheduled = [];
    const sandbox = vm.createContext({
        console: { log() {}, warn() {}, info() {} },
        STORAGE_KEYS: { SESSION_USER: 'pseudopy_session_user', ROUTE: 'pseudopy_route' },
        currentUser: null, usersRef: 'pseudopy_users',
        localStorage: { getItem: k => storage.get(k) || null, removeItem: k => storage.delete(k) },
        sessionStorage: { removeItem() {} },
        dbGet,
        checkAccess: () => true,
        showApp() {}, showToast() {}, $id: () => null,
        getLocalCollection: cached ? () => cached : undefined,
        setTimeout: (fn, ms) => { if (schedule) { scheduled.push(fn); return scheduled.length; } return 0; },
        clearTimeout() {}
    });
    vm.runInContext(read('src/app/session.js'), sandbox);
    return { sandbox, storage, scheduled };
}

test('temporary Firestore outage boots AUTHENTICATED_DEGRADED, keeps the session and retries in the background', async () => {
    const session = { _docId: 'account', id: 'account', role: 'student', username: 'test', status: 'active' };
    const h = sessionHarness({ session, dbGet: async () => { const e = new Error('offline'); e.name = 'FirestoreUnavailable'; throw e; } });
    const result = await h.sandbox.restoreSession();
    assert.equal(result.state, 'AUTHENTICATED_DEGRADED', 'temporary outage must never behave like a logout');
    assert.ok(h.storage.has('pseudopy_session_user'), 'session was dropped during a temporary outage');
    assert.ok(h.scheduled.length >= 1, 'no bounded background re-sync scheduled after a degraded boot');
    await Promise.all(h.scheduled.map(fn => fn().catch(() => {})));
    assert.ok(h.storage.has('pseudopy_session_user'), 'background retry must never purge the session');
});

test('a confirmed-missing account clears the stored session', async () => {
    const session = { _docId: 'gone', id: 'gone', role: 'student', username: 'test', status: 'active' };
    const h = sessionHarness({ session, dbGet: async () => null });
    const result = await h.sandbox.restoreSession();
    assert.equal(result.state, 'UNAUTHENTICATED');
    assert.ok(!h.storage.has('pseudopy_session_user'), 'gone account did not clear the session');
});

test('a cached profile boots degraded even when the network and Firestore are both down', async () => {
    const session = { _docId: 'account', id: 'account', role: 'student', username: 'test', status: 'active' };
    const cached = [{ _docId: 'account', role: 'student', username: 'cached', status: 'active' }];
    const h = sessionHarness({
        session, cached,
        dbGet: async () => { const e = new Error('timeout after 4000ms'); e.name = 'FirestoreUnavailable'; throw e; }
    });
    const result = await h.sandbox.restoreSession();
    assert.equal(result.state, 'AUTHENTICATED_DEGRADED');
    assert.equal(h.sandbox.currentUser.username, 'cached', 'degraded boot should prefer the cached profile over the snapshot');
});

test('init no longer seeds unconditionally and gates seeding behind the done flag', () => {
    const init = read('src/app/initialization.js');
    assert.match(init, /SEED_DONE_KEY = 'pseudopy_seeded'/, 'seed-done flag missing');
    assert.match(init, /await ensureSeedDatabase\(\);/, 'init does not use the gated seeder');
    assert.ok(!init.includes("[App] Calling seedDatabase()..."), 'unconditional seed log still in init');
    assert.match(init, /localStorage\.getItem\(SEED_DONE_KEY\)/, 'seed gate does not read the done flag');
    assert.match(init, /async function refreshAuthoritativeCaches/, 'degraded-boot re-sync helper missing');
});

// A degraded boot reports through the permanent sync pill. There is no
// reconnect banner to mount or retire, and the student stays signed in.
test('degraded boot reports local status without any connection banner', () => {
    const session = read('src/app/session.js');
    assert.ok(session.includes('showConnectionBanner'), 'degraded boot does not surface the sync status');
    assert.ok(session.includes('hideConnectionBanner'), 'status cannot be cleared on recovery');
    assert.ok(!session.includes("'connection-status-banner'"), 'session must not reference a reconnect banner');
    assert.ok(!/Reconnecting to the server/.test(session), 'session must not use reconnect copy');
    // Offline boots must not schedule background profile probes.
    assert.match(session, /isBrowserOffline\(\)\)\s*return;/, 'offline boot still schedules a Firestore probe');
    const auth = read('src/app/authentication.js');
    assert.match(auth, /hideConnectionBanner/, 'logout does not clear the sync status');
});