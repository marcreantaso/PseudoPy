const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

const read = (p) => fs.readFileSync(p, 'utf8');

test('session persistence module is bundled and boot-gated', () => {
    const app = read('app.js');
    assert.match(app, /function restoreSession/, 'restoreSession missing from bundle');
    assert.match(app, /function sanitizeUser/, 'sanitizeUser missing from bundle');
    assert.match(app, /function saveSession/, 'saveSession missing from bundle');
    assert.match(app, /function clearSession/, 'clearSession missing from bundle');
    assert.match(app, /const SESSION_KEY = STORAGE_KEYS\.SESSION_USER;/, 'session key no longer centralized');
    assert.match(app, /const ROUTE_KEY = STORAGE_KEYS\.ROUTE;/, 'route key no longer centralized');
    assert.match(app, /pseudopy_session_user/, 'session key string value missing from constants');
    assert.match(app, /BOOT_LOADING = 'AUTH_LOADING'/, 'AUTH_LOADING state missing');
    assert.match(app, /BOOT_AUTHENTICATED = 'AUTHENTICATED'/, 'AUTHENTICATED state missing');
    assert.match(app, /BOOT_UNAUTHENTICATED = 'UNAUTHENTICATED'/, 'UNAUTHENTICATED state missing');
    assert.match(app, /let bootState = BOOT_LOADING/, 'initial boot state must be loading');
});

test('credential fields are never persisted to frontend storage', () => {
    const session = read('src/app/session.js');
    const sanitize = session.match(/function sanitizeUser[\s\S]*?\n}/)[0];
    assert.ok(sanitize.includes("key === 'password'"), 'password not excluded by sanitizeUser');
    assert.ok(sanitize.includes("key === 'passwordHash'"), 'passwordHash not excluded by sanitizeUser');
    assert.ok(sanitize.includes("key === 'passwordSalt'"), 'passwordSalt not excluded by sanitizeUser');

    const app = read('app.js');
    const save = app.match(/function saveSession[\s\S]*?\n}/)[0];
    assert.ok(save.includes('sanitizeUser(user)'), 'saveSession does not sanitize');
});

test('login persists the session and explicit logout clears it', () => {
    const auth = read('src/app/authentication.js');
    assert.match(auth, /saveSession\(currentUser\);/, 'handleLogin does not persist the session');
    assert.match(auth, /clearSession\(\);\s+clearPersistedRoute\(\);/, 'logout does not clear the persisted session');
    assert.match(auth, /bootState = BOOT_UNAUTHENTICATED;/, 'logout does not mark state unauthenticated');
    assert.ok(!auth.includes("currentUser.fullName.charAt(0)"), 'sidebar avatar initials logic remained');
    assert.match(auth, /clearEditorDraft\(\);/, 'logout does not clear the previous user editor draft');
    assert.match(auth, /STORAGE_KEYS\.ACTIVE_EXERCISE/, 'logout does not clear the active exercise key');
});

test('current route is persisted and the boot restore re-fetches from Firestore', () => {
    const nav = read('src/app/navigation.js');
    assert.match(nav, /if \(currentUser\) persistRoute\(pageId\);/, 'navigateTo does not persist the route');

    const session = read('src/app/session.js');
    assert.match(session, /await dbGet\(usersRef, docId\);/, 'restore does not use Firestore as the authoritative source');
    assert.match(session, /checkAccess\(fresh\.role, route\)/, 'restored route is not access-checked');
    assert.match(session, /showApp\(targetPage\)/, 'restored app does not navigate back to the saved page');
    assert.match(session, /status === 'archived'/, 'archived accounts not rejected on restore');

    const init = read('src/app/initialization.js');
    assert.match(init, /await restoreSession\(\);/, 'init does not restore the session before rendering');
});

test('instructor device-approval path also persists the session', () => {
    const dev = read('src/app/device-authorization.js');
    assert.match(dev, /saveSession\(currentUser\);/, 'approved-device sign in does not persist the session');
});

test('boot splash and version surfaces exist in markup', () => {
    const html = read('index.html');
    assert.match(html, /id="boot-splash"/, 'boot splash missing');
    assert.ok(html.includes('Restoring your session...'), 'boot splash copy missing');
    assert.match(html, /id="login-version"/, 'login version footer missing');
    assert.match(html, /id="settings-version"/, 'settings version row missing');
});

test('app version is injected at build from package.json only', () => {
    const versionSource = read('src/app/app-version.js');
    assert.match(versionSource, /__PSEUDOPY_VERSION__/, 'version token not used as the build-time placeholder');
    const app = read('app.js');
    assert.match(app, /const APP_VERSION = '1\.0\.0';/, 'build did not inject package.json version');
    assert.match(app, /function renderAppVersion/, 'renderAppVersion missing');
    const build = read('scripts/build.js');
    assert.match(build, /__PSEUDOPY_VERSION__/, 'build.js does not substitute the version token');
});

test('service worker uses controlled updates (no unconditional skipWaiting)', () => {
    const sw = read('sw.js');
    const skipWaitingCount = sw.split('self.skipWaiting()').length - 1;
    assert.equal(skipWaitingCount, 1, 'skipWaiting must only appear inside the SKIP_WAITING message handler');
    const installBlock = sw.match(/addEventListener\('install',[\s\S]*?\n\}\)/)[0];
    assert.ok(!installBlock.includes('skipWaiting'), 'install still auto-skips waiting');
    assert.match(sw, /event\.data\.type === 'SKIP_WAITING'/, 'SKIP_WAITING message handler missing');
});

test('service worker only runtime-caches same-origin GET responses', () => {
    const sw = read('sw.js');
    const fetchBlock = sw.match(/addEventListener\('fetch',[\s\S]*?\n\}\)/)[0];
    assert.match(fetchBlock, /isSameOrigin/, 'fetch handler missing same-origin gating');
    assert.ok(!fetchBlock.includes('networkResponse.status === 0'), 'opaque cross-origin responses are still cached');
    assert.match(fetchBlock, /event\.request\.mode === 'navigate' && isSameOrigin/, 'offline navigation fallback not restricted to same-origin');
});

test('PWA update banner is driven by the real service worker lifecycle', () => {
const html = read('index.html') + read('pwa-updates.js');
    assert.match(html, /function applyPWAUpdate/, 'Update Now handler missing');
    assert.match(html, /SKIP_WAITING/, 'waiting worker activation missing');
    assert.match(html, /window\.applyPWAUpdate = applyPWAUpdate/, 'Update Now not exposed to the banner button');
    assert.match(html, /window\.dismissPWAUpdate = dismissPWAUpdate/, 'Later not exposed to the banner button');
    assert.match(html, /pseudopy_update_dismissed/, 'Later dismissal persistence missing');
    assert.match(html, /setTimeout\(failUpdate, 8000\)/, 'update failure watchdog missing');
    assert.match(html, /registration\.waiting/, 'banner does not key off a real waiting worker');
    assert.match(html, /navigator\.serviceWorker\.controller\)/, 'banner does not require an existing controller');
    assert.match(html, /maybeSaveEditorDraft/, 'update flow does not preserve unsaved editor content');
    assert.match(html, /refreshing = false/, 'reload-loop guard missing');
    assert.ok(!html.includes('registerPWAUpdate'), 'SW registration logic still inlined in index.html instead of app.js');
    assert.match(html, /id="pwa-update-btn"/, 'Update Now button missing');
    assert.match(html, /id="pwa-later-btn"/, 'Later button missing');
    assert.match(html, /data-update-label>Update Now</, 'default Update Now label missing');
    assert.match(html, /pwa-spinner/, 'Updating spinner missing');
    assert.match(html, /id="pwa-update-msg"/, 'update message element missing');
});

test('transient restore failures keep the session; gone accounts purge it', () => {
    const session = read('src/app/session.js');
    assert.match(session, /gone\.name = 'SessionAccountGone';/, 'gone-account sentinel missing');
    assert.match(session, /err\.name === 'SessionAccountGone'/, 'gone-account path not branched by the sentinel');
    const catchBlock = session.match(/catch \(err\) \{[\s\S]*?\n    \}/)[0];
    assert.ok(catchBlock.includes('clearSession()'), 'gone-account branch does not clear the session');
    assert.match(catchBlock, /SessionAccountGone/, 'gone branch must be the only clear-path');
    const keptNote = session.match(/\[Session\] Restore temporarily unavailable[\s\S]*?kept session for retry/);
    assert.ok(keptNote, 'transient-failure branch does not retain the session for a later retry');
});

test('unsaved editor drafts are saved and restored around reloads', () => {
    const editor = read('src/app/editor-actions.js');
    assert.match(editor, /function maybeSaveEditorDraft/, 'draft saver missing');
    assert.match(editor, /function maybeRestoreEditorDraft/, 'draft restorer missing');
    assert.match(editor, /localStorage\.setItem\(EDITOR_DRAFT_KEY,/, 'draft not persisted to browser-local storage');
    const nav = read('src/app/navigation.js');
    assert.match(nav, /maybeRestoreEditorDraft\(\)/, 'draft not restored on the editor page');
    const init = read('src/app/initialization.js');
    assert.match(init, /beforeunload[\s\S]{0,200}maybeSaveEditorDraft/, 'drafts are not saved on unload');
});

test('build registers new source modules in the app bundle', () => {
    const bundles = JSON.parse(read('src/bundles.json'));
    assert.ok(bundles['app.js'].includes('src/app/session.js'), 'session.js not in the app bundle');
    assert.ok(bundles['app.js'].includes('src/app/app-version.js'), 'app-version.js not in the app bundle');
});
test('refresh restores student, instructor and admin sessions with their saved page', async () => {
    const vm = require('node:vm');
    for (const [role, route] of [['student', 'student-settings'], ['instructor', 'analytics'], ['admin', 'manage-users']]) {
        const saved = { _docId: 'account', role, username: 'test', status: 'active' };
        const storage = new Map([['pseudopy_session_user', JSON.stringify(saved)], ['pseudopy_route', route]]);
        let opened;
        const context = vm.createContext({
            STORAGE_KEYS: { SESSION_USER: 'pseudopy_session_user', ROUTE: 'pseudopy_route' },
            currentUser: null, usersRef: 'users',
            localStorage: { getItem: key => storage.get(key), removeItem: key => storage.delete(key) },
            sessionStorage: { removeItem() {} },
            dbGet: async (collection, id) => { assert.equal(id, 'account'); return saved; },
            checkAccess: (actualRole, page) => actualRole === role && page === route,
            showApp: page => { opened = page; }, $id: () => null,
            showToast() { assert.fail('Valid refresh should not show a sign-out message'); }, console: { log() {}, warn() {} }
        });
        vm.runInContext(read('src/app/session.js'), context);
        assert.equal(await context.restoreSession(), true);
        assert.equal(context.currentUser.role, role);
        assert.equal(opened, route);
        assert.ok(storage.has('pseudopy_session_user'));
    }
});
