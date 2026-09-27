const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

function extractFunction(src, fnName) {
    const re = new RegExp('(async )?function ' + fnName + '\\(');
    const start = src.search(re);
    if (start < 0) return null;
    const open = src.indexOf('{', start);
    if (open < 0) return null;
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
    }
    return null;
}

test('built database.js bundles idb-store, mutation-queue and sync-manager', () => {
    const db = read('database.js');
    assert.match(db, /OFFLINE_DB_NAME = 'pseudopy-offline'/, 'idb-store not bundled');
    assert.match(db, /ensureOfflineDataMigration/, 'migration not bundled');
    assert.match(db, /enqueueMutation/, 'mutation queue not bundled');
    assert.match(db, /pseudopy_offline_queue/, 'fallback queue key not bundled');
    assert.match(db, /classifyDbError/, 'sync-manager not bundled');
    assert.match(db, /SYNC_MAX_ATTEMPTS = 3/, 'retry cap not bundled');
    assert.match(db, /requireOnline/, 'online gate not bundled');
    assert.match(db, /mergePendingMutationsOverSnapshot/, 'clobber protection not bundled');
});

test('bundle load order keeps dependencies ahead of consumers', () => {
    const bundles = read('src/bundles.json');
    const idx = name => bundles.indexOf(name);
    assert.ok(idx('"src/database/local-storage.js"') < idx('"src/database/idb-store.js"'));
    assert.ok(idx('"src/database/idb-store.js"') < idx('"src/database/mutation-queue.js"'));
    assert.ok(idx('"src/database/mutation-queue.js"') < idx('"src/database/sync-manager.js"'));
    assert.ok(idx('"src/database/sync-manager.js"') < idx('"src/database/collections.js"'));
});

test('all writes through dbAdd/dbSet/dbUpdate route via the durable queue', () => {
    const src = read('src/database/collections.js');
    assert.ok(extractFunction(src, 'upsertLocalCache'), 'local mirror helper missing');
    assert.match(src, /async function queueFirestoreWrite/, 'queue-aware write path missing');
    for (const [fn, op] of [['dbAdd', 'ADD'], ['dbSet', 'SET'], ['dbUpdate', 'UPDATE']]) {
        const block = extractFunction(src, fn);
        assert.ok(block, fn + ' not found');
        assert.ok(block.includes("queueFirestoreWrite({ operation: '" + op + "'"), fn + ' bypasses the queue');
    }
});

test('snapshots and subscriptions never clobber locally pending writes', () => {
    const col = read('src/database/collections.js');
    assert.match(col, /results = await mergePendingMutationsOverSnapshot\(ref, results\);/, 'dbGetAll does not overlay pending writes');
    assert.match(col, /offlineStore\.setDocument\(ref, docData\)/, 'local mirror not populated alongside the cache');

    const subs = read('src/database/subscriptions-and-helpers.js');
    assert.match(subs, /onSnapshot\(async snapshot =>/, 'onSnapshot callback is not async');
    assert.match(subs, /mergePendingMutationsOverSnapshot\(ref, records\)/, 'subscribeCollection does not overlay pending writes');
});

test('init migrates to OfflineStore and inline gates security-sensitive writes', () => {
    const init = read('src/app/initialization.js');
    assert.match(init, /ensureOfflineDataMigration\(\)/, 'init does not run the OfflineStore migration');

    const session = read('src/app/session.js');
    assert.match(session, /syncNow\('recovered'\)/, 'degraded-boot recovery does not drain the queue');

    const gates = [
        ['src/app/users.js', ['approveDevice', 'revokeDevice', 'approveAllPendingDevices', 'saveInstructor', 'confirmToggleInstructorStatus', 'executeArchiveInstructor', 'executeRestoreInstructor', 'toggleUserStatus', 'saveUser']],
        ['src/app/instructor-recovery.js', ['approveRecoveryRequest', 'rejectRecoveryRequest']],
        ['src/app/admin-security.js', ['approveAdminRecoveryRequest', 'rejectAdminRecoveryRequest']],
        ['src/app/password-management.js', ['handleChangePassword']],
        ['src/app/student-settings.js', ['submitPasswordChangeRequest']],
        ['src/app/student-recovery.js', ['submitPasswordReset']]
    ];
    for (const [file, fns] of gates) {
        const content = read(file);
        for (const fn of fns) {
            const block = extractFunction(content, fn);
            assert.ok(block, file + ' missing function ' + fn);
            assert.ok(block.includes('requireOnline'), file + ' does not gate ' + fn + ' with requireOnline()');
        }
    }
});

test('sw.js keeps the locally bundled Skulpt and never reaches for remote Skulpt', () => {
    const sw = read('sw.js');
    assert.doesNotMatch(sw, /skulpt\.org|cdnjs.*skulpt/i, 'remote Skulpt URL reappeared in the service worker');
    assert.match(sw, /\.\/vendor\/skulpt\/skulpt\.min\.js/, 'local Skulpt not precached');
});