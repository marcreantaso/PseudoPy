const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { getDefaultAdminProfile, upgradeDefaultAdminAccount } = require('../src/database/default-admin');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function databaseContext() {
    const storage = new Map();
    const localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
    const context = vm.createContext({ localStorage, window: {}, crypto: webcrypto, TextEncoder, setTimeout, clearTimeout,
        console: { log() {}, warn() {}, info() {} } });
    vm.runInContext(source('database.js'), context);
    return { context, storage };
}

// The bundled admin profile carries identity fields ONLY. It must never ship a
// password, hash or salt, because app.js/database.js are public static files.
test('no credential material is bundled for the administrator', async () => {
    const { context } = databaseContext();
    const frontend = context.getInitialSeedUsers().find(user => user.id === 'u1');
    const backend = require('../server/seed-data').buildSeedUsers().find(user => user.id === 'u1');
    for (const user of [frontend, backend]) {
        assert.equal(user.role, 'admin');
        assert.equal(user.username, 'Admin');
        assert.equal(user.fullName, 'Admin');
        for (const field of ['password', 'passwordHash', 'passwordSalt']) {
            assert.equal(user[field], undefined,
                field + ' must not be bundled for u1 (found ' + JSON.stringify(user[field]) + ')');
        }
    }
    // The source must not contain a literal hash or salt either.
    const admin = source('src/database/default-admin.js');
    assert.equal(/passwordHash\s*:\s*["'][0-9a-f]{32,}/i.test(admin), false, 'default-admin.js still embeds a hash');
    assert.equal(/passwordSalt\s*:\s*["'][0-9a-f]{16,}/i.test(admin), false, 'default-admin.js still embeds a salt');
});

// The migration may fill a MISSING display name, but must never touch
// credentials, an existing name, or any other account.
test('cached legacy admin keeps its password, name and links; only a missing name is filled', () => {
    const { context, storage } = databaseContext();
    const legacy = { _docId: 'u1', id: 'u1', username: 'mbautista_admin', fullName: 'Mark Bautista', role: 'admin',
        password: null, passwordHash: 'owner-changed-hash', passwordSalt: 'owner-changed-salt', status: 'inactive', email: 'existing@example.test' };
    const instructor = { _docId: 'u2', username: 'mreantaso_instructor', role: 'instructor', createdBy: 'u1' };
    storage.set('pseudopy_local_pseudopy_users', JSON.stringify([legacy, instructor]));
    const users = context.getLocalCollection('pseudopy_users');
    assert.equal(users[0]._docId, 'u1');
    assert.equal(users[0].username, 'mbautista_admin', 'a renamed account must not be renamed back');
    assert.equal(users[0].fullName, 'Mark Bautista', 'an existing display name must not be overwritten');
    assert.equal(users[0].passwordHash, 'owner-changed-hash', 'the owner password hash was reset');
    assert.equal(users[0].passwordSalt, 'owner-changed-salt', 'the owner password salt was reset');
    assert.equal(users[0].status, 'inactive');
    assert.equal(users[0].email, legacy.email);
    assert.equal(JSON.stringify(users[1]), JSON.stringify(instructor), 'another account was modified');
});

test('a legacy admin record is returned exactly as stored, with no fields added', () => {
    const { context, storage } = databaseContext();
    storage.set('pseudopy_local_pseudopy_users', JSON.stringify([
        { _docId: 'u1', role: 'admin', username: 'mbautista_admin', passwordHash: 'kept-hash', passwordSalt: 'kept-salt' }
    ]));
    const users = context.getLocalCollection('pseudopy_users');
    assert.deepEqual(JSON.parse(JSON.stringify(users[0])),
        { _docId: 'u1', role: 'admin', username: 'mbautista_admin', passwordHash: 'kept-hash', passwordSalt: 'kept-salt' },
        'the migration must not add, rename or reset any field');
    assert.equal(users[0].password, undefined, 'no default password may be introduced');
    assert.equal(users[0].fullName, undefined, 'no display name may be invented');
});

// Repeated reads (getLocalCollection persists what it returns) must be a no-op,
// so a changed password can never drift back to a default.
test('the migration is idempotent and cannot reset a later password change', () => {
    const changed = { _docId: 'u1', role: 'admin', username: 'Admin', fullName: 'Owner Name',
        passwordHash: 'later-change', passwordSalt: 'later-salt' };
    const once = upgradeDefaultAdminAccount(changed);
    const twice = upgradeDefaultAdminAccount(once);
    assert.equal(once, changed, 'the stored record must be returned as-is');
    assert.equal(once.passwordHash, 'later-change');
    assert.equal(once.passwordSalt, 'later-salt');
    assert.equal(twice, once, 'migration is not idempotent');
    assert.equal(twice.fullName, 'Owner Name', 'display name was overwritten');
});

test('every other account and role is returned untouched', () => {
    for (const user of [
        { _docId: 'other', role: 'admin', username: 'mbautista_admin' },
        { _docId: 'u1', role: 'student', username: 'mbautista_admin' },
        { _docId: 'u1', role: 'admin', username: 'renamed-later' }
    ]) assert.equal(upgradeDefaultAdminAccount(user), user);
    assert.equal(upgradeDefaultAdminAccount(null), null);
    assert.equal(upgradeDefaultAdminAccount(undefined), undefined);
});

test('Admin username accepts capitalization without changing student aliases', () => {
    const { context } = databaseContext();
    for (const input of ['Admin', 'admin', ' ADMIN ']) assert.equal(context.normalizeUsername(input), 'Admin');
    assert.equal(context.normalizeUsername('mdaet_stude'), 'mdaet_student');
});

// The seed administrator has no bundled credential, so no default password can
// authenticate. Signing in must fail cleanly and grant nothing.
test('the seeded administrator cannot be signed in with any bundled password', async () => {
    for (const password of ['pass123', 'admin123', '']) {
        const { context } = databaseContext();
        const admin = context.getInitialSeedUsers().find(user => user.id === 'u1');
        let opened = false;
        let message = null;
        Object.assign(context, { currentUser: null, cachedUsers: [admin],
            getValue: id => id === 'login-username' ? 'Admin' : password,
            refreshUsers: async () => {}, dbUpdate: async () => {}, saveSession() {},
            showToast: (m) => { message = m; }, showApp: () => { opened = true; } });
        vm.runInContext(source('src/app/authentication.js'), context);
        await context.handleLogin();
        assert.equal(opened, false, 'a bundled password must never grant access for ' + JSON.stringify(password));
        assert.ok(message, 'the student must be told why the attempt failed');
    }
});
