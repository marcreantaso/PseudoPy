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

test('browser and backend seed the same Admin profile and new password hash', async () => {
    const { context } = databaseContext();
    const frontend = context.getInitialSeedUsers().find(user => user.id === 'u1');
    const backend = require('../server/seed-data').buildSeedUsers().find(user => user.id === 'u1');
    for (const user of [frontend, backend]) {
        assert.equal(user.username, 'Admin');
        assert.equal(user.fullName, 'Admin');
        assert.equal(user.role, 'admin');
        assert.equal(user.password, null);
        assert.equal(await context.verifyPassword('pass123', user.passwordHash, user.passwordSalt), true);
        assert.equal(await context.verifyPassword('admin123', user.passwordHash, user.passwordSalt), false);
    }
});

test('cached legacy admin migrates in place without changing other accounts or links', () => {
    const { context, storage } = databaseContext();
    const legacy = { _docId: 'u1', id: 'u1', username: 'mbautista_admin', fullName: 'Mark Bautista', role: 'admin',
        password: 'admin123', passwordHash: 'old-hash', passwordSalt: 'old-salt', status: 'inactive', email: 'existing@example.test' };
    const instructor = { _docId: 'u2', username: 'mreantaso_instructor', role: 'instructor', createdBy: 'u1' };
    storage.set('pseudopy_local_pseudopy_users', JSON.stringify([legacy, instructor]));
    const users = context.getLocalCollection('pseudopy_users');
    assert.equal(users[0]._docId, 'u1');
    assert.equal(users[0].username, 'Admin');
    assert.equal(users[0].status, 'inactive');
    assert.equal(users[0].email, legacy.email);
    assert.equal(JSON.stringify(users[1]), JSON.stringify(instructor));
    assert.equal(JSON.parse(storage.get('pseudopy_local_pseudopy_users'))[0].password, null);
});

test('migration does not reset subsequent passwords or alter unrelated accounts', () => {
    const migrated = { _docId: 'u1', role: 'admin', ...getDefaultAdminProfile(), passwordHash: 'later-change' };
    assert.equal(upgradeDefaultAdminAccount(migrated), migrated);
    for (const user of [
        { _docId: 'other', role: 'admin', username: 'mbautista_admin' },
        { _docId: 'u1', role: 'student', username: 'mbautista_admin' },
        { _docId: 'u1', role: 'admin', username: 'renamed-later' }
    ]) assert.equal(upgradeDefaultAdminAccount(user), user);
});

test('Admin username accepts capitalization without changing student aliases', () => {
    const { context } = databaseContext();
    for (const input of ['Admin', 'admin', ' ADMIN ']) assert.equal(context.normalizeUsername(input), 'Admin');
    assert.equal(context.normalizeUsername('mdaet_stude'), 'mdaet_student');
});

test('actual login accepts Admin/pass123 and rejects the previous password', async () => {
    for (const password of ['pass123', 'admin123']) {
        const { context } = databaseContext();
        const admin = context.getInitialSeedUsers().find(user => user.id === 'u1');
        let opened = false;
        Object.assign(context, { currentUser: null, cachedUsers: [admin], getValue: id => id === 'login-username' ? 'Admin' : password,
            refreshUsers: async () => {}, dbUpdate: async () => {}, saveSession() {}, showToast() {} });
        vm.runInContext(source('src/app/authentication.js'), context);
        context.showApp = () => { opened = true; };
        await context.handleLogin();
        assert.equal(opened, password === 'pass123');
    }
});
