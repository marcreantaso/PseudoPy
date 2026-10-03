const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ── The structural gate ────────────────────────────────────────

test('the boot gate is applied before anything is parsed', () => {
    const html = read('index.html');
    const gate = html.indexOf("classList.add('booting')");
    assert.ok(gate > -1, 'no boot gate in the document');

    // It must be in <head>, and before the login page markup, or the first
    // paint can still show login.
    const headEnd = html.indexOf('</head>');
    const loginPage = html.indexOf('id="login-page"');
    assert.ok(gate < headEnd, 'the gate script must live in <head>');
    assert.ok(gate < loginPage, 'the gate must be set before #login-page exists');

    // It must not be deferred: deferring puts it after parsing.
    const gateScript = html.slice(gate - 400, gate);
    assert.doesNotMatch(gateScript, /\bdefer\b/, 'a deferred gate runs after first paint');
});

test('the gate has an independent failsafe so a broken bundle cannot blank the app', () => {
    const html = read('index.html');
    // Self-contained: removes the class directly rather than calling into app.js,
    // which is precisely what may be the thing that failed to load.
    assert.match(html, /window\.setTimeout\(function \(\) \{[\s\S]{0,160}classList\.remove\('booting'\)/);
    assert.doesNotMatch(html, /classList\.remove\('booting'\);[\s\S]{0,80}settleBoot/,
        'the failsafe must not depend on bundled code');
});

test('the splash is off by default and gated by CSS, not by an inline hidden class', () => {
    const html = read('index.html');
    const splash = html.match(/<div id="boot-splash"[^>]*>/)[0];
    assert.doesNotMatch(splash, /\shidden\b/, 'the splash must not ship hidden; CSS controls it');

    const css = read('style.css');
    const block = css.slice(css.indexOf('.boot-splash {'));
    assert.match(block.slice(0, 200), /display: none;/);
    assert.match(css, /html\.booting \.boot-splash,\s*\n\s*\.boot-splash\.is-visible \{\s*\n\s*display: flex;/);
});

test('the login page is hidden with visibility so revealing cannot shift layout', () => {
    const css = read('style.css');
    // `display: none` here would collapse the grid and cause a reflow when the
    // gate lifts; visibility keeps the layout and costs no paint.
    const block = css.slice(css.indexOf('html.booting #login-page'));
    assert.match(block, /visibility: hidden;/);
    assert.doesNotMatch(block.slice(0, 80), /display: none/);
    // The app shell is guarded too, so an early un-hide cannot paint over it.
    assert.match(css, /html\.booting #app-layout \{\s*\n\s*visibility: hidden;/);
});

// ── Behaviour: drive the real restoreSession() ─────────────────

/**
 * Load src/app/session.js into a VM with a minimal DOM so the boot sequence can
 * be observed. This exercises the actual control flow, not a description of it.
 */
function bootHarness({ session, dbGet, localProfile = null }) {
    const classes = new Set();
    const events = [];
    const splash = { classList: { add: c => classes.add('is-visible'), remove: c => classes.delete('is-visible') } };
    const appLayout = { classList: { add: c => classes.add('app-hidden'), remove: c => classes.delete('app-hidden') } };
    const store = {};
    if (session) store.pseudopy_session_user = JSON.stringify(session);

    const sandbox = {
        console,
        setTimeout: () => 0,
        clearTimeout: () => { },
        Promise,
        JSON,
        STORAGE_KEYS: { SESSION_USER: 'pseudopy_session_user', ROUTE: 'pseudopy_route' },
        usersRef: 'pseudopy_users',
        currentUser: null,
        getLocalCollection: () => (localProfile ? [localProfile] : []),
        dbGet,
        checkAccess: () => true,
        getLocalCollectionRef: () => null,
        saveSession: () => { },
        clearSession: () => { delete store.pseudopy_session_user; },
        showToast: m => events.push('toast:' + m),
        showApp: p => events.push('showApp:' + (p || '')),
        document: {
            documentElement: {
                classList: {
                    add: c => { classes.add(c); events.push('gate:add:' + c); },
                    remove: c => { classes.delete(c); events.push('gate:remove:' + c); }
                }
            }
        },
        localStorage: {
            getItem: k => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: k => { delete store[k]; }
        },
        $id: id => (id === 'boot-splash' ? splash : id === 'app-layout' ? appLayout : null)
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(read(path.join('src', 'app', 'session.js')), sandbox, { filename: 'session.js' });
    return { sandbox, classes, events };
}

test('a first-time visitor is never shown the splash', async () => {
    const h = bootHarness({ session: null, dbGet: async () => { throw new Error('must not be called'); } });
    const result = await h.sandbox.restoreSession();

    assert.equal(result.state, 'UNAUTHENTICATED');
    // The whole point: no session means no network wait and no splash, and the
    // gate is lifted immediately so login is reachable.
    assert.equal(h.events.includes('showApp:'), false);
    assert.ok(h.events.indexOf('gate:remove:booting') > -1, 'the gate must be lifted for a new visitor');
    assert.equal(h.classes.has('is-visible'), false, 'the splash must not be shown to a new visitor');
});

test('a returning user sees the splash, never the login page', async () => {
    const h = bootHarness({
        session: { _docId: 'u1', username: 'sam', role: 'instructor' },
        dbGet: async () => ({ _docId: 'u1', username: 'sam', role: 'instructor', status: 'active' })
    });
    const result = await h.sandbox.restoreSession();

    assert.equal(result.state, 'AUTHENTICATED');
    assert.ok(h.events.some(e => e.startsWith('showApp:')), 'the app must be shown');
    // The gate is lifted only after the app is ready, so login never appears.
    const showAt = h.events.findIndex(e => e.startsWith('showApp:'));
    const liftAt = h.events.indexOf('gate:remove:booting');
    assert.ok(showAt > -1 && liftAt > -1);
    assert.ok(showAt < liftAt, 'the app must be rendered before the gate is lifted');
    assert.equal(h.classes.has('is-visible'), false, 'the splash must be hidden once the app is up');
});

test('every boot path lifts the gate', async () => {
    const cases = [
        {
            name: 'account gone',
            session: { _docId: 'u1', username: 'sam', role: 'student' },
            dbGet: async () => null,
            expect: 'UNAUTHENTICATED'
        },
        {
            name: 'deactivated account',
            session: { _docId: 'u1', username: 'sam', role: 'student' },
            dbGet: async () => ({ _docId: 'u1', username: 'sam', role: 'student', status: 'archived' }),
            expect: 'UNAUTHENTICATED'
        },
        {
            name: 'offline with a cached profile',
            session: { _docId: 'u1', username: 'sam', role: 'student' },
            dbGet: async () => { throw new Error('unavailable'); },
            localProfile: { _docId: 'u1', username: 'sam', role: 'student', status: 'active' },
            expect: 'AUTHENTICATED_DEGRADED'
        },
        {
            name: 'offline with only the snapshot',
            session: { _docId: 'u1', username: 'sam', role: 'instructor' },
            dbGet: async () => { throw new Error('unavailable'); },
            expect: 'AUTHENTICATED_DEGRADED'
        }
    ];

    for (const c of cases) {
        const h = bootHarness({ session: c.session, dbGet: c.dbGet, localProfile: c.localProfile || null });
        const result = await h.sandbox.restoreSession();
        assert.equal(result.state, c.expect, c.name + ': wrong state');
        assert.ok(
            h.events.includes('gate:remove:booting'),
            c.name + ': the boot gate was left closed, which blanks the app forever'
        );
    }
});

test('a returning user whose read fails never sees the login page', async () => {
    const h = bootHarness({
        session: { _docId: 'u1', username: 'sam', role: 'instructor' },
        dbGet: async () => { throw new Error('network down'); }
    });
    await h.sandbox.restoreSession();
    // Degraded boot must still go to the app, never to login: a temporary
    // outage is not a logout.
    assert.ok(
        h.events.some(e => e.startsWith('showApp:')),
        'a transient read failure must not drop the user to the login screen'
    );
});

test('the splash is never left visible after boot settles', async () => {
    const h = bootHarness({
        session: { _docId: 'u1', username: 'sam', role: 'instructor' },
        dbGet: async () => ({ _docId: 'u1', username: 'sam', role: 'instructor', status: 'active' })
    });
    await h.sandbox.restoreSession();
    assert.equal(h.classes.has('is-visible'), false);
    assert.equal(h.classes.has('booting'), false);
});