const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

/**
 * Load src/app/authentication.js against a stubbed world.
 * `signInToCloud` is injected so each Firebase outcome can be exercised.
 */
function harness({ cloudResult, platformOffline = false, user } = {}) {
    const toasts = [];
    const events = [];
    const submitButton = { disabled: false, classList: { add() {}, remove() {} } };
    const account = user || {
        _docId: 'u1', id: 'u1', username: 'Admin', fullName: 'Admin', role: 'admin',
        status: 'active', email: 'admin@example.test',
        passwordHash: 'hash', passwordSalt: 'salt'
    };
    let submitCount = 0;

    const context = vm.createContext({
        console: { log() {}, info() {}, warn() {}, error() {} },
        document: {
            createElement: () => ({ classList: { add() {}, remove() {} }, dataset: {} }),
            addEventListener() {}
        },
        currentUser: null, usersRef: 'pseudopy_users',
        cachedUsers: [account],
        // Referenced by handleLogin; undefined would throw a ReferenceError.
        PseudoPyLearning: null,
        getValue: id => id === 'login-username' ? 'Admin' : 'correct-password',
        normalizeUsername: v => v,
        verifyPassword: async () => true,
        refreshUsers: async () => {},
        dbUpdate: async () => { events.push('dbUpdate'); },
        saveSession: () => { events.push('saveSession'); },
        clearSession: () => { events.push('clearSession'); },
        signInToCloud: async () => {
            events.push('signInToCloud');
            if (cloudResult instanceof Error) throw cloudResult;
            return cloudResult || { ok: true, uid: 'uid_x' };
        },
        isPlatformOffline: () => platformOffline,
        showToast: (message, tone) => { toasts.push({ message, tone }); },
        showApp: () => { events.push('showApp'); },
        syncNow: () => {},
        isDeletedProfile: () => false,
        $id: id => id === 'login-submit' ? submitButton : null,
        getDeviceFingerprint: () => ({ deviceId: 'd1', deviceName: 'D', os: 'o', browser: 'b', type: 't', screen: 's' }),
        setTimeout, clearTimeout, Promise, Date
    });
    vm.runInContext(source('src/app/authentication.js'), context);
    // The source declares its own `showApp`, which replaces the stub above, so
    // the spy is installed after evaluation. The real one needs a DOM (hide,
    // show, setText, $qsa, navigateTo...) that this harness does not model.
    context.showApp = () => { events.push('showApp'); };
    return {
        context, toasts, events, submitButton,
        // Counting submit dispatches mirrors the real bound-once form listener.
        submit: async () => {
            submitCount++;
            await context.handleLogin();
            return submitCount;
        }
    };
}

const REJECTED = { ok: false, kind: 'invalid', code: 'auth/invalid-credential' };
const NO_ACCOUNT = { ok: false, kind: 'unprovisioned', code: 'auth/user-not-found' };

// The core authentication fix: a rejected online sign-in must not create a
// session, must not open the app, and must not be reported as a network fault.
test('a rejected cloud credential grants no access and stores no session', async () => {
    const h = harness({ cloudResult: REJECTED });
    await h.context.handleLogin();
    assert.equal(h.events.includes('showApp'), false, 'the app opened after a rejected sign-in');
    assert.equal(h.events.includes('saveSession'), false, 'a session was persisted after a rejected sign-in');
    assert.ok(h.toasts.some(t => /Incorrect password/.test(t.message)),
        'the user must be told the password was rejected');
    for (const t of h.toasts) {
        assert.equal(/connection/i.test(t.message), false,
            'a rejected credential must not be reported as a connectivity problem: ' + t.message);
    }
});

// A rejected credential is a final answer and must not drive a retry loop.
test('one rejected attempt produces exactly one handled failure', async () => {
    const h = harness({ cloudResult: REJECTED });
    await h.context.handleLogin();
    assert.equal(h.events.filter(e => e === 'signInToCloud').length, 1,
        'the cloud sign-in was attempted more than once');
    assert.equal(h.toasts.filter(t => /Incorrect password/.test(t.message)).length, 1);
});

// Rapid duplicate submissions must be collapsed while one is pending.
test('duplicate submissions while sign-in is pending are ignored', async () => {
    let release;
    const gate = new Promise(r => { release = r; });
    const h = harness({});
    h.context.signInToCloud = () => { h.events.push('signInToCloud'); return gate.then(() => ({ ok: true, uid: 'u' })); };
    const first = h.context.handleLogin();
    const second = h.context.handleLogin();
    const third = h.context.handleLogin();
    release();
    await Promise.all([first, second, third]);
    assert.equal(h.events.filter(e => e === 'signInToCloud').length, 1,
        'three rapid submissions produced multiple sign-in attempts');
    assert.equal(h.submitButton.disabled, false, 'the button stayed disabled after the attempt finished');
});

// The migration state must keep working, otherwise nobody could sign in.
test('an account with no cloud counterpart still signs in', async () => {
    const h = harness({ cloudResult: NO_ACCOUNT });
    await h.context.handleLogin();
    assert.equal(h.events.includes('showApp'), true, 'an unprovisioned account was locked out');
    assert.equal(h.events.includes('saveSession'), true);
});

// Being online and unable to reach the server is NOT the same as a bad
// password, and must be reported differently.
test('an online but unreachable server is reported as a connection problem', async () => {
    const h = harness({ cloudResult: { ok: false, kind: 'transient', code: 'auth/network-request-failed' } });
    await h.context.handleLogin();
    assert.equal(h.events.includes('showApp'), false, 'the app opened despite an unreachable server');
    assert.ok(h.toasts.some(t => /Could not reach the server/i.test(t.message)),
        'a network failure must be reported as a connection problem');
});

// Offline is the established policy for an already-authenticated user.
test('offline sign-in continues with the in-app account', async () => {
    const h = harness({ cloudResult: { ok: false, kind: 'transient', code: 'auth/network-request-failed' }, platformOffline: true });
    await h.context.handleLogin();
    assert.equal(h.events.includes('showApp'), true, 'offline-first sign-in was broken');
    assert.equal(h.events.includes('saveSession'), true);
});

// A provider setting must not lock every user out of the app.
test('a provider configuration problem does not block sign-in', async () => {
    const h = harness({ cloudResult: { ok: false, kind: 'config', code: 'auth/operation-not-allowed' } });
    await h.context.handleLogin();
    assert.equal(h.events.includes('showApp'), true,
        'an owner-side provider setting locked every user out');
});

// Credentials must never reach the log.
test('no password or token is written to the console during sign-in', async () => {
    const lines = [];
    const h = harness({ cloudResult: REJECTED });
    h.context.console = { log: (...a) => lines.push(a.join(' ')), info: (...a) => lines.push(a.join(' ')),
        warn: (...a) => lines.push(a.join(' ')), error: (...a) => lines.push(a.join(' ')) };
    await h.context.handleLogin();
    const joined = lines.join('\n');
    for (const secret of ['correct-password', 'hash', 'salt']) {
        assert.equal(joined.includes(secret), false, 'the console leaked ' + secret);
    }
});

test('the cloud gate runs before the session is stored', async () => {
    const h = harness({ cloudResult: REJECTED });
    await h.context.handleLogin();
    const cloudAt = h.events.indexOf('signInToCloud');
    const saveAt = h.events.indexOf('saveSession');
    assert.equal(cloudAt > -1, true);
    assert.equal(saveAt, -1, 'no session may be written when the cloud rejects the sign-in');
});