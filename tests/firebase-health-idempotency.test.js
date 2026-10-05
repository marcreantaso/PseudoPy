const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── C1: the Functions SDK must be loaded ────────────────────────
// A missing firebase-functions-compat.js makes firebase.functions undefined,
// so deletionServerAvailable() reported false forever and the deployed
// deleteStudentAccount was never reached from the browser.

test('index.html loads the pinned Firebase compat modules', () => {
    const html = read('index.html');
    ['app', 'firestore', 'auth', 'functions'].forEach(mod => {
        assert.match(
            html,
            new RegExp('firebasejs/10\\.12\\.0/firebase-' + mod + '-compat\\.js'),
            'index.html must load firebase-' + mod + '-compat.js at 10.12.0'
        );
    });
});

test('the service worker precaches the same Firebase URLs as index.html', () => {
    const sw = read('sw.js');
    const html = read('index.html');
    ['app', 'firestore', 'auth', 'functions'].forEach(mod => {
        const url = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-' + mod + '-compat.js';
        assert.ok(html.includes(url), 'index.html missing ' + url);
        assert.ok(sw.includes(url), 'sw.js missing ' + url);
    });
});

test('no Firebase module is pinned to a version other than 10.12.0', () => {
    const versions = new Set();
    [read('index.html'), read('sw.js')].forEach(text => {
        const re = /firebasejs\/([\d.]+)\/firebase-[a-z-]+-compat\.js/g;
        let m;
        while ((m = re.exec(text))) versions.add(m[1]);
    });
    assert.deepEqual(Array.from(versions), ['10.12.0'], 'mixed SDK versions risk a skew');
});

// ── C4/C5/C6: firebase.js ───────────────────────────────────────

test('the unreachable unguarded initializeApp fallback is gone', () => {
    const src = read(path.join('src', 'database', 'firebase.js'));
    // The old `else if (typeof window !== 'undefined' && window.firebase)`
    // branch could never run, and it was the one initializeApp call without a
    // firebase.apps.length guard.
    assert.doesNotMatch(
        src,
        /window\.firebase\.initializeApp/,
        'the dead unguarded initializeApp branch must be removed'
    );
    assert.equal((src.match(/initializeApp\(/g) || []).length, 1, 'exactly one initializeApp call site');
    assert.match(src, /if \(!firebase\.apps\.length\)|firebase\.apps\.length \? firebase\.app\(\)/);
});

test('Firestore init uses only APIs the compat build actually has', () => {
    const src = read(path.join('src', 'database', 'firebase.js'));
    // Verified against firebase-firestore-compat 10.12.0: the compat namespace
    // has no initializeFirestore / getFirestore / persistentLocalCache /
    // memoryLocalCache / persistentMultipleTabManager. A version of this file
    // called firebase.initializeFirestore(app, { localCache }) unconditionally,
    // which threw on every launch and made the health panel report a
    // configuration failure for a setup that had always worked.
    assert.match(src, /function createFirestoreInstance\(app\)/);
    assert.match(src, /const instance = firebase\.firestore\(app\);/);
    // The modular entry point may only be used behind a capability check.
    const guarded = src.slice(src.indexOf('function createFirestoreInstance'));
    assert.match(guarded, /typeof firebase\.initializeFirestore === 'function'/);
    assert.match(guarded, /typeof firebase\.persistentLocalCache === 'function'/);
    assert.ok(
        guarded.indexOf("typeof firebase.initializeFirestore === 'function'")
            < guarded.indexOf('firebase.initializeFirestore(app, { localCache })'),
        'the modular call must be feature-detected before use'
    );
    // No bare call can survive as a hard dependency.
    assert.doesNotMatch(src, /^const instance = firebase\.initializeFirestore/m);
});

test('the local cache diagnostic tells the truth about the compat SDK', () => {
    const src = read(path.join('src', 'database', 'firebase.js'));
    // An in-memory Firestore client cache is this app's design, not a fault,
    // because durable offline data lives in its own IndexedDB store.
    assert.match(src, /localCache: 'memory'/);
    assert.match(src, /own IndexedDB store/);
    assert.match(src, /localCacheEngineConfigurable: false/);
    // enablePersistence exists but must not be called silently.
    const guarded = src.slice(src.indexOf('function createFirestoreInstance'));
    assert.match(guarded, /typeof instance\.enablePersistence === 'function'/);
    assert.doesNotMatch(guarded, /instance\.enablePersistence\(/,
        'Firestore cache behaviour must not change as a side effect of diagnostics');
});

test('the health panel does not fail the app for an in-memory Firestore cache', () => {
    const src = read(path.join('src', 'devtools', 'health-panel.js'));
    const group = src.slice(src.indexOf("id: 'firestore'"), src.indexOf("id: 'auth'"));
    assert.match(group, /firestoreInit\.localCache/);
    // A memory cache must never be the thing that reports a problem.
    assert.doesNotMatch(group, /=== 'indexeddb'/);
    // The durable layer is reported separately and is the one that can fail.
    assert.match(group, /offlineIdbAvailable/);
    assert.match(group, /offlineDb/);
    assert.doesNotMatch(src, /idbReady/, 'idbReady does not exist in this codebase');
});

test('App Check stays inactive until a site key is configured', () => {
    const src = read(path.join('src', 'database', 'firebase.js'));
    assert.match(src, /__APP_CHECK_SITE_KEY__|appCheckSiteKey/);
    // An early return before any SDK call is what prevents enabling App Check
    // with no key, which would refuse every Firestore read and write.
    assert.match(src, /if \(!siteKey\) \{[\s\S]{0,220}return;/);
    assert.match(src, /ReCaptchaV3Provider/);
});

test('auth persistence mode is stated rather than silently inherited', () => {
    const src = read(path.join('src', 'database', 'cloud-auth.js'));
    assert.match(src, /setPersistence\(/, 'LOCAL was being inherited implicitly');
    assert.match(src, /PERSISTENCE_LOCAL/);
    assert.match(src, /persistence: cloudAuthPersistence/, 'status() must report it for the health panel');
});

// ── C2: the health panel ────────────────────────────────────────

test('a DB Health tab exists and follows the tab convention', () => {
    const html = read('index.html');
    assert.match(html, /data-tab="health"/, 'missing the tab button');
    assert.match(html, /onclick="devToolsSwitchTab\('health'\)"/);
    assert.match(html, /id="devtools-panel-health"/, 'missing the panel');
});

test('the health panel is registered in the devtools bundle', () => {
    const bundles = JSON.parse(read(path.join('src', 'bundles.json')));
    assert.ok(
        bundles['devtools.js'].includes('src/devtools/health-panel.js'),
        'health-panel.js must be in the devtools bundle'
    );
});

test('the health panel reports the signals that were previously invisible', () => {
    const src = read(path.join('src', 'devtools', 'health-panel.js'));
    ['firestoreInit', 'cloudAuthStatus', 'isFirestoreReachable', 'deletionServerAvailable']
        .forEach(signal => {
            assert.ok(src.includes(signal), 'health panel must report ' + signal);
        });
    assert.match(src, /App Check/);
    assert.match(src, /Pending mutations/);
});

test('the health panel never writes to the database', () => {
    const src = read(path.join('src', 'devtools', 'health-panel.js'));
    ['dbSet', 'dbAdd', 'dbUpdate', 'dbDelete', '.set(', '.delete('].forEach(forbidden => {
        assert.ok(!src.includes(forbidden), 'health panel must not call ' + forbidden);
    });
});

test('the health panel escapes values before injecting markup', () => {
    const src = read(path.join('src', 'devtools', 'health-panel.js'));
    assert.match(src, /function _devToolsHealthEscape/);
    // Row values include Firestore error strings and uid values, which are not
    // trusted input for an innerHTML sink.
    const esc = src.slice(src.indexOf('function _devToolsHealthEscape'), src.indexOf('function devToolsHealthRefresh'));
    ['&', '<', '>', '"'].forEach(ch => {
        assert.ok(esc.includes('.replace(/' + ch.replace('&', '&') + '/g'), 'must escape ' + ch);
    });
    assert.match(src, /_devToolsHealthEscape\(row\.value\)/);
    assert.match(src, /_devToolsHealthEscape\(row\.label\)/);
});

// ── C3: the persistent sync indicator ───────────────────────────

test('a persistent sync indicator exists in the app status region', () => {
    const html = read('index.html');
    assert.match(html, /id="sync-state-indicator"/);
    assert.match(html, /id="sync-state-pending-count"/);
    // It must NOT start hidden: a persistent indicator that is hidden on load
    // is just another transient notice.
    const markup = html.match(/<div id="sync-state-indicator"[^>]*>/)[0];
    assert.doesNotMatch(markup, /\shidden/, 'the indicator must be visible from first paint');
});

test('the indicator derives its state instead of owning any', () => {
    const src = read(path.join('src', 'app', 'connection-status.js'));
    assert.match(src, /function readSyncIndicatorState\(\)/);
    // Every branch reads existing sync-manager state, never a private copy.
    ['syncPermissionBlocked', 'isFirestoreReachable', 'firestoreReady', 'syncInProgress']
        .forEach(source => {
            assert.ok(src.includes(source), 'indicator must read ' + source);
        });
});

test('the indicator ranks permission refusals above outages', () => {
    const src = read(path.join('src', 'app', 'connection-status.js'));
    const fn = src.slice(src.indexOf('function readSyncIndicatorState'));
    const deniedAt = fn.indexOf("key: 'denied'");
    // A Firestore outage is now reported as a calm local state rather than a
    // "reconnecting" state, and the refusal must still be checked first.
    const outageAt = fn.indexOf("key: 'local'");
    assert.ok(deniedAt > -1, 'the refusal state still exists');
    assert.ok(outageAt > -1, 'an outage maps to a calm local state');
    assert.ok(deniedAt < outageAt, 'a refusal outranks an outage: the server answered');
    // Being genuinely offline is a stronger fact than a refusal, so it wins.
    assert.ok(fn.indexOf("key: 'offline'") < deniedAt, 'no network outranks every cloud state');
    // No branch may reintroduce the removed reconnecting announcement.
    assert.doesNotMatch(src, /key: 'reconnecting'/);
});

test('the indicator animation uses transform/opacity only', () => {
    const css = read('style.css');
    const block = css.slice(css.indexOf('@keyframes syncStatePulse'));
    const body = block.slice(0, block.indexOf('}'));
    assert.match(body, /opacity/);
    assert.match(body, /transform/);
    // A layout property here would shift the status bar every state change.
    ['width', 'height', 'margin', 'padding', 'top', 'left', 'font-size']
        .forEach(prop => {
            assert.doesNotMatch(body, new RegExp('(^|[;{\\s])' + prop + ':'), prop + ' must not animate');
        });
});

test('the indicator honours prefers-reduced-motion', () => {
    const css = read('style.css');
    const at = css.indexOf('.sync-state-indicator[data-state] .sync-state-dot');
    assert.ok(at > -1, 'missing the reduced-motion override');
    assert.match(css.slice(at, at + 200), /animation:\s*none\s*!important/);
});

// ── B1/B2/B3: idempotent student creation ───────────────────────

test('saveUser refuses re-entrant calls', () => {
    const src = read(path.join('src', 'app', 'users.js'));
    const fn = src.slice(src.indexOf('async function saveUser()'));
    assert.match(fn.slice(0, 200), /if \(saveUserBusy\) return;/, 'a double click must be a no-op');
    assert.match(src, /function setSaveUserBusy\(busy\)/);
    assert.match(src, /btn\.disabled = saveUserBusy/);
    assert.match(src, /aria-busy/);
    // The guard must be released even when the write throws.
    assert.match(fn, /finally \{[\s\S]{0,80}setSaveUserBusy\(false\);/);
});

test('saveUser records and reuses a creation request id', () => {
    const src = read(path.join('src', 'app', 'users.js'));
    assert.match(src, /creationRequestId: requestId/, 'the id must be stored on the document');
    // Replay must be checked BEFORE a number is allocated, or the retry
    // allocates a second number on the way to discovering the first write.
    const fn = src.slice(src.indexOf('async function saveUser()'));
    assert.match(fn, /const already = users\.find\(u => u\.creationRequestId === requestId\)/);
    assert.ok(
        fn.indexOf('creationRequestId === requestId') < fn.indexOf('allocateStudentNumber(requestId)'),
        'the replay check must precede allocation'
    );
});

test('the request id is minted per opened form, not per submission', () => {
    const src = read(path.join('src', 'app', 'users.js'));
    assert.match(src, /userCreateRequestId = _newUserCreateRequestId\(\)/);
    const start = src.indexOf('async function openUserModal');
    const modal = src.slice(start, src.indexOf('function _bindUserModalEnterSubmit'));
    assert.match(modal, /userCreateRequestId = _newUserCreateRequestId\(\)/,
        'opening the modal must mint a fresh key');
    // Only the create branch mints. The edit branch must not, because a new
    // key there would be written onto an existing document.
    const editBranch = modal.slice(modal.indexOf('if (id)'), modal.indexOf('} else {'));
    assert.doesNotMatch(editBranch, /_newUserCreateRequestId/);
});

test('allocation is keyed so a retry reuses its number', () => {
    const src = read(path.join('src', 'database', 'student-number.js'));
    const mod = require(path.join(ROOT, 'src', 'database', 'student-number.js'));
    assert.match(src, /_allocateFirestoreKeyed/);
    // The allocation and its record must commit in one transaction, or a
    // crash between them still burns the number.
    const keyed = src.slice(src.indexOf('async function _allocateFirestoreKeyed'));
    const txBody = keyed.slice(0, keyed.indexOf('\n}'));
    assert.equal((txBody.match(/runTransaction/g) || []).length, 1, 'one transaction, not two');
    assert.match(txBody, /tx\.set\(ref, \{ current: next, allocations: merged \}\)/);
    assert.match(src, /isUsableRequestId/);
    assert.equal(typeof mod.releaseStudentNumberRequest, 'function');
});

test('omitting a request id preserves the original sequential behaviour', async () => {
    const mod = require(path.join(ROOT, 'src', 'database', 'student-number.js'));
    const store = {};
    global.usersRef = 'pseudopy_users';
    global.getLocalCollection = () => [{ id: 'x1', studentNumber: '2302510' }, { id: 'x2' }];
    global.firestoreReady = () => false;
    global.localStorage = {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); }
    };
    try {
        // The pre-existing contract: two unkeyed calls get two distinct numbers.
        assert.equal(await mod.allocateStudentNumber(), '2302511');
        assert.equal(await mod.allocateStudentNumber(), '2302512');
        // A keyed retry returns the number it already owns.
        const keyed1 = await mod.allocateStudentNumber('req_abcdefgh1234');
        const keyed2 = await mod.allocateStudentNumber('req_abcdefgh1234');
        assert.equal(keyed1, keyed2, 'the same request must not consume a second number');
        // A different request still gets its own number.
        const other = await mod.allocateStudentNumber('req_zzzzzzzz9999');
        assert.notEqual(other, keyed1);
    } finally {
        delete global.usersRef;
        delete global.getLocalCollection;
        delete global.firestoreReady;
        delete global.localStorage;
    }
});

test('the local allocation ledger survives a fresh module instance', async () => {
    const store = {};
    global.usersRef = 'pseudopy_users';
    global.getLocalCollection = () => [{ id: 'x1', studentNumber: '2303000' }];
    global.firestoreReady = () => false;
    global.localStorage = {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); }
    };
    try {
        delete require.cache[require.resolve(path.join(ROOT, 'src', 'database', 'student-number.js'))];
        const fresh = require(path.join(ROOT, 'src', 'database', 'student-number.js'));
        const first = await fresh.allocateStudentNumber('req_persist_test_1');
        delete require.cache[require.resolve(path.join(ROOT, 'src', 'database', 'student-number.js'))];
        const reloaded = require(path.join(ROOT, 'src', 'database', 'student-number.js'));
        const second = await reloaded.allocateStudentNumber('req_persist_test_1');
        assert.equal(first, second, 'the ledger must outlive the module instance');
        // Releasing lets a genuinely new attempt allocate afresh.
        assert.equal(reloaded.releaseStudentNumberRequest('req_persist_test_1'), true);
        const third = await reloaded.allocateStudentNumber('req_persist_test_1');
        assert.notEqual(third, first);
    } finally {
        delete global.usersRef;
        delete global.getLocalCollection;
        delete global.firestoreReady;
        delete global.localStorage;
    }
});

test('a malformed request id is ignored rather than trusted', () => {
    const mod = require(path.join(ROOT, 'src', 'database', 'student-number.js'));
    assert.equal(mod.isUsableRequestId('req_abcdefgh'), true);
    assert.equal(mod.isUsableRequestId('short'), false);
    assert.equal(mod.isUsableRequestId('has spaces here'), false);
    assert.equal(mod.isUsableRequestId('../../etc/passwd'), false);
    assert.equal(mod.isUsableRequestId(''), false);
    assert.equal(mod.isUsableRequestId(null), false);
    assert.equal(mod.isUsableRequestId(12345), false);
});

test('username and email uniqueness are case-insensitive', () => {
    const src = read(path.join('src', 'app', 'users.js'));
    assert.match(src, /function normalizedUsernameKey/);
    const fn = src.slice(src.indexOf('async function saveUser()'));
    assert.match(fn, /normalizedUsernameKey\(u\.username\) === usernameKey/);
    assert.match(fn, /dupEmail/, 'email uniqueness was previously unchecked');
    assert.match(fn, /toLowerCase\(\) === emailKey/);
});

test('a retry addresses the same document even when the cache is stale', () => {
    const src = read(path.join('src', 'app', 'users.js'));
    // The cached replay check cannot see a write whose response never arrived,
    // which is exactly how the duplicate was created. The document id must
    // therefore be derived from the request id so a retry overwrites.
    assert.match(src, /const newId = 'u' \+ requestId\.replace\(\/\^req_\/, ''\)/);
    assert.doesNotMatch(src, /const newId = 'u' \+ Date\.now\(\)/,
        'a per-call timestamp id cannot dedupe a retry');
    // And it must be written with an explicit id, not an auto-generated one.
    const fn = src.slice(src.indexOf('async function saveUser()'));
    assert.match(fn, /await dbSet\(usersRef, newId, userData\)/);
    assert.doesNotMatch(fn, /dbAdd\(usersRef, userData\)/);
});

test('the health panel resolves async sources instead of stringifying promises', () => {
    const src = read(path.join('src', 'devtools', 'health-panel.js'));
    // getSyncState() is async (it reads IndexedDB). Calling it synchronously
    // renders the literal text "[object Promise]" and every numeric comparison
    // against it is false.
    assert.match(src, /async function collectDevToolsHealth\(\)/);
    assert.match(src, /await _devToolsHealthResolve/);
    assert.doesNotMatch(src, /String\(getSyncState\(\)\./,
        'the queue state must be read once and awaited');
    assert.match(src, /async function _devToolsHealthQueueState\(\)/);
    // One shared read, so the three queue rows cannot disagree.
    assert.match(src, /const queue = await _devToolsHealthQueueState\(\)/);
    const code = src.split('\n').filter(l => !/^\s*(\*|\/\/)/.test(l)).join('\n');
    assert.equal((code.match(/getSyncState\(\)/g) || []).length, 1,
        'the queue must be read exactly once per collection');
    assert.match(code, /read: ctx => \(ctx\.queue \? String\(ctx\.queue\.pending\)/,
        'queue rows must read the shared state, not call getSyncState again');
    assert.doesNotMatch(src, /function _devToolsHealthRead\(/,
        'the synchronous-only reader would reintroduce the bug');
});

test('the health refresh resolves rather than rendering a pending promise', () => {
    const src = read(path.join('src', 'devtools', 'health-panel.js'));
    const fn = src.slice(src.indexOf('function devToolsHealthRefresh()'));
    assert.match(fn, /collectDevToolsHealth\(\)\.then/);
    assert.doesNotMatch(fn, /const report = collectDevToolsHealth\(\);\s*\n\s*devToolsHealthRender\(report\)/,
        'rendering before the promise resolves would emit [object Object]');
});

test('App Check is loaded but cannot activate without a site key', () => {
    const html = read('index.html');
    const sw = read('sw.js');
    const url = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-check-compat.js';
    assert.ok(html.includes(url), 'index.html must load the App Check module');
    assert.ok(sw.includes(url), 'sw.js must precache the App Check module');
    const src = read(path.join('src', 'database', 'firebase.js'));
    // Loading the module must not activate it: the interim ruleset is
    // world-writable and no site key is registered yet.
    assert.match(src, /appCheckSiteKey/);
    assert.match(src, /if \(!siteKey\)[\s\S]{0,200}return;/);
});

test('saveUser claims the username before writing and releases it on failure', () => {
    const src = read(path.join('src', 'app', 'users.js'));
    const fn = src.slice(src.indexOf('async function saveUser()'));
    // The cached uniqueness check is not a lock; the claim must come first.
    assert.match(fn, /claim = await claimUsername\(username, newId\)/);
    assert.ok(
        fn.indexOf('claimUsername(username, newId)') < fn.indexOf('await dbSet(usersRef, newId, userData)'),
        'the claim must be taken before the profile is written'
    );
    // A claim that outlives a failed write reserves a name no account backs.
    const write = fn.slice(fn.indexOf('try {', fn.indexOf('claimUsername')));
    assert.match(write, /await releaseUsernameClaim\(username, newId\)/);
    assert.ok(
        write.indexOf('releaseUsernameClaim') < write.indexOf("showToast((writeErr && writeErr.message)"),
        'the claim must be released before the failure is surfaced'
    );
    // The username-claim module must be in the database bundle.
    const bundles = JSON.parse(read(path.join('src', 'bundles.json')));
    assert.ok(bundles['database.js'].includes('src/database/username-claims.js'));
});

test('a username claim is exclusive, replayable, and self-conflict free', async () => {
    const store = new Map();
    const sandbox = {
        firestore: {
            collection: () => ({ doc: key => ({ id: key }) }),
            runTransaction: async fn => {
                // Serialised: each transaction sees all prior writes, which is
                // the guarantee Firestore gives for a contended document.
                const ref = { id: null };
                const tx = {
                    get: async r => {
                        ref.id = r.id;
                        return { exists: store.has(r.id), data: () => store.get(r.id) || undefined };
                    },
                    set: (r, data) => store.set(r.id, data),
                    delete: r => store.delete(r.id)
                };
                await fn(tx);
            }
        },
        firestoreReady: () => true
    };
    for (const k of Object.keys(sandbox)) global[k] = sandbox[k];
    delete require.cache[require.resolve(path.join(ROOT, 'src', 'database', 'username-claims.js'))];
    const { claimUsername, releaseUsernameClaim, usernameClaimKey } =
        require(path.join(ROOT, 'src', 'database', 'username-claims.js'));
    try {
        // First writer wins.
        const first = await claimUsername('karlfrancis', 'u_one');
        assert.equal(first.claimed, true);
        assert.equal(first.replayed, false);

        // A second, different account is refused — this is the race the cached
        // uniqueness check could not see.
        await assert.rejects(
            () => claimUsername('karlfrancis', 'u_two'),
            e => e.code === 'username-claim-conflict' && /already taken/.test(e.message)
        );

        // Case and surrounding whitespace are the same account.
        assert.equal(usernameClaimKey('  KarlFrancis '), 'u:karlfrancis');
        await assert.rejects(() => claimUsername('KARLFRANCIS', 'u_three'), /already taken/);

        // The holder retrying its own request is a replay, not a conflict.
        const replay = await claimUsername('karlfrancis', 'u_one');
        assert.equal(replay.replayed, true);

        // Only the holder may release, so a loser cannot free the name.
        assert.equal(await releaseUsernameClaim('karlfrancis', 'u_two'), false);
        assert.equal(store.has('u:karlfrancis'), true);
        assert.equal(await releaseUsernameClaim('karlfrancis', 'u_one'), true);
        assert.equal(store.has('u:karlfrancis'), false);
        // And once released it is genuinely available again.
        const afterRelease = await claimUsername('karlfrancis', 'u_two');
        assert.equal(afterRelease.claimed, true);
    } finally {
        delete global.firestore;
        delete global.firestoreReady;
    }
});

test('an unverifiable claim refuses rather than allowing a duplicate account', async () => {
    global.firestore = {
        collection: () => ({ doc: k => ({ id: k }) }),
        runTransaction: async () => { throw new Error('unavailable'); }
    };
    global.firestoreReady = () => true;
    delete require.cache[require.resolve(path.join(ROOT, 'src', 'database', 'username-claims.js'))];
    const { claimUsername } = require(path.join(ROOT, 'src', 'database', 'username-claims.js'));
    try {
        await assert.rejects(
            () => claimUsername('someone', 'u_one'),
            e => e.code === 'username-claim-conflict' && /Could not verify/.test(e.message),
            'treating a failed verification as "free" is how duplicates return'
        );
    } finally {
        delete global.firestore;
        delete global.firestoreReady;
    }
});

test('offline creation defers the claim instead of inventing one', async () => {
    global.firestore = {};
    global.firestoreReady = () => false;
    delete require.cache[require.resolve(path.join(ROOT, 'src', 'database', 'username-claims.js'))];
    const { claimUsername } = require(path.join(ROOT, 'src', 'database', 'username-claims.js'));
    try {
        const out = await claimUsername('someone', 'u_one');
        assert.equal(out.offline, true);
        assert.equal(out.claimed, false);
    } finally {
        delete global.firestore;
        delete global.firestoreReady;
    }
});

test('a claim key can never carry raw input into the document path', () => {
    const { usernameClaimKey, isUsableClaimKey } =
        require(path.join(ROOT, 'src', 'database', 'username-claims.js'));
    // Path separators must not survive into a document id.
    assert.equal(usernameClaimKey('../../etc/passwd'), 'u:..%2f..%2fetc%2fpasswd');
    assert.equal(usernameClaimKey('a/b'), 'u:a%2fb');
    assert.equal(usernameClaimKey('a\\b'), 'u:a%5cb');
    // No separator and no traversal survives.
    ['../../etc/passwd', 'a/b', 'a\\b', 'a b', 'a?b#c', ''].forEach(v => {
        const key = usernameClaimKey(v);
        assert.ok(!key.includes('/') && !key.includes('\\'), 'separator leaked from: ' + v);
        assert.ok(!key.includes(' '), 'whitespace leaked from: ' + v);
        if (key) assert.equal(isUsableClaimKey(key), true, 'a real username must stay usable: ' + v);
    });
    // Encoding is unambiguous, so two different usernames cannot collide.
    assert.notEqual(usernameClaimKey('a/b'), usernameClaimKey('a%2Fb'));
    // The whole key alphabet is lower case, so it can never surprise a
    // case-insensitive comparison elsewhere.
    assert.equal(usernameClaimKey('a/b'), usernameClaimKey('a/b').toLowerCase());
    // Case and padding are the same account.
    assert.equal(usernameClaimKey('  KarlFrancis '), 'u:karlfrancis');
    assert.equal(isUsableClaimKey('U:Bad'), false, 'the key must be lowercase-normalized first');
    assert.equal(isUsableClaimKey(''), false);
});

test('a username claim follows the account lifecycle', () => {
    const src = read(path.join('src', 'database', 'student-deletion.js'));
    // Soft delete releases the claim, otherwise the name stays reserved with no
    // account behind it.
    const del = src.slice(src.indexOf('step(\'confirmed-soft\''));
    assert.match(del.slice(0, 700), /await releaseUsernameClaim\(profile\.username, docId\)/);
    // Undo re-takes it, so a restored account cannot share a username with a
    // new one.
    const undo = src.slice(src.indexOf('async function undoStudentDeletion'));
    assert.match(undo, /await claimUsername\(profile\.username, docId\)/);
    assert.match(undo, /username is now held by another account/);
});

test('the claims collection is visible to the duplicate audit', () => {
    const audit = read(path.join('scripts', 'audit-duplicate-students.js'));
    // A claim outliving its account is invisible unless the audit looks there.
    assert.match(audit, /pseudopy_usernameClaims/);
    assert.match(audit, /ownerId/);
});

test('the user modal is hardened', () => {
    const html = read('index.html');
    const btn = html.match(/<button[^>]*id="user-save-btn"[^>]*>/);
    assert.ok(btn, 'the save button needs an id so it can be disabled');
    assert.match(btn[0], /type="button"/, 'must not become an implicit submit');
});

test('closing the user modal clears the password and the request id', () => {
    const src = read(path.join('src', 'app', 'users.js'));
    const fn = src.slice(src.indexOf('function closeUserModal()'));
    assert.match(fn, /user-password/, 'the password must not survive in the DOM');
    assert.match(fn, /userCreateRequestId = null/);
    assert.match(fn, /setSaveUserBusy\(false\)/);
});

test('Enter submits the user modal', () => {
    const src = read(path.join('src', 'app', 'users.js'));
    assert.match(src, /function _bindUserModalEnterSubmit/);
    const fn = src.slice(src.indexOf('function _bindUserModalEnterSubmit'));
    assert.match(fn, /event\.key !== 'Enter'/);
    assert.match(fn, /event\.preventDefault\(\)/);
    assert.match(fn, /saveUser\(\)/);
    // The modal is a div, so without this handler keyboard submission did
    // nothing at all. Guard against "solving" it by wrapping in a <form>,
    // which would submit on every field and double-fire.
    const userModal = read('index.html').slice(
        read('index.html').indexOf('<div id="user-modal"'),
        read('index.html').indexOf('id="user-modal-title"')
    );
    assert.doesNotMatch(userModal, /<form/i, 'the user modal must not become a form');
});

// ── B4: the duplicate-student audit ─────────────────────────────

test('the duplicate audit is report-only by default', () => {
    const src = read(path.join('scripts', 'audit-duplicate-students.js'));
    assert.match(src, /--dry-run/);
    assert.match(src, /This report deletes nothing\./);
    assert.match(src, /firebase-admin/);
    assert.doesNotMatch(src, /\.batch\(\)[\s\S]{0,80}?\.delete\(/, 'the audit must not build delete batches');
    assert.match(src, /--apply is intentionally not implemented/);
});

test('the duplicate audit has a backup stage that writes nothing back', () => {
    const src = read(path.join('scripts', 'audit-duplicate-students.js'));
    assert.match(src, /--backup/);
    assert.match(src, /--plan-file|Required with --backup/);
    const body = src.slice(src.indexOf('async function runBackup'));
    assert.doesNotMatch(body, /\.set\(|\.update\(|\.delete\(|\.add\(/,
        'backup must only read live documents');
    assert.match(src, /This backup writes to disk only\./);
});

test('the duplicate audit does not treat a shared full name as a duplicate', () => {
    const mod = require(path.join(ROOT, 'scripts', 'audit-duplicate-students.js'));
    const { classifyDuplicateStudents } = mod;
    const base = { role: 'student', status: 'active' };

    // The reported case: one person, two consecutive numbers.
    const dupes = classifyDuplicateStudents([
        { id: 'u1', data: Object.assign({}, base, { fullName: 'Karl Francis Calagos', username: 'karlfrancis', email: 'a@b.c', studentNumber: '2300003' }) },
        { id: 'u2', data: Object.assign({}, base, { fullName: 'Karl Francis Calagos', username: 'karlfrancis2', email: 'a2@b.c', studentNumber: '2300004' }) }
    ]);
    // Different student numbers => NOT a duplicate number; the shared username
    // is not shared, so only a real collision would appear.
    assert.equal(dupes.groups.filter(g => g.field === 'studentNumber').length, 0);
    assert.equal(dupes.groups.filter(g => g.field === 'username').length, 0);

    // A genuine number collision is detected.
    const real = classifyDuplicateStudents([
        { id: 'u1', data: Object.assign({}, base, { username: 'karlfrancis', studentNumber: '2300003' }) },
        { id: 'u2', data: Object.assign({}, base, { username: 'kfrancis', studentNumber: '2300003' }) }
    ]);
    const numbers = real.groups.filter(g => g.field === 'studentNumber');
    assert.equal(numbers.length, 1);
    assert.equal(numbers[0].value, '2300003');
    assert.deepEqual(numbers[0].memberIds.sort(), ['u1', 'u2']);
    assert.deepEqual(real.involvedIds.sort(), ['u1', 'u2']);
});

test('the duplicate audit ignores archived and non-student profiles', () => {
    const mod = require(path.join(ROOT, 'scripts', 'audit-duplicate-students.js'));
    const out = mod.classifyDuplicateStudents([
        { id: 'a', data: { role: 'student', status: 'active', username: 'same', studentNumber: '2300001' } },
        { id: 'b', data: { role: 'student', status: 'archived', username: 'same', studentNumber: '2300001' } },
        { id: 'c', data: { role: 'instructor', status: 'active', username: 'same', studentNumber: '2300001' } }
    ]);
    assert.equal(out.groups.length, 0, 'only live student profiles collide');
    assert.equal(out.liveStudentProfiles, 1);
});

test('the duplicate audit rejects unknown CLI flags', () => {
    const mod = require(path.join(ROOT, 'scripts', 'audit-duplicate-students.js'));
    assert.deepEqual(mod.parseArgs(['--dry-run', '--json', '--references']), {
        dryRun: true, apply: false, out: null, backup: null, json: true, reference: true
    });
    assert.throws(() => mod.parseArgs(['--nope']), /Unknown option: --nope/);
});