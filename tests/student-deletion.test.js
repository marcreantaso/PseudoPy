/* ============================================================
   STUDENT DELETION — regression suite

   Covers the original defect (a skipped or refused delete reported
   as success), the authorization matrix, tombstoning, chunking, the
   delegated UI wiring, the rules posture and the orphan audit.
   ============================================================ */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r/g, '');
const readSrc = p => read(path.join('src', p));

const dbModule = readSrc('database/student-deletion.js');
const uiModule = readSrc('app/student-deletion-ui.js');
const fnLogic = require(path.join(ROOT, 'functions', 'lib', 'deletion.js'));
const audit = require(path.join(ROOT, 'scripts', 'audit-student-orphans.js'));

// ── Harness for the browser module ───────────────────────────────

function deletionHarness(opts = {}) {
    const storage = new Map();
    let localUsers = (opts.users || []).slice();
    const pending = [];
    const purged = [];
    const logged = [];
    const ctx = vm.createContext({
        console: { info: (...a) => logged.push(['info', ...a]), warn: (...a) => logged.push(['warn', ...a]), error: (...a) => logged.push(['error', ...a]) },
        localStorage: {
            getItem: k => (storage.has(k) ? storage.get(k) : null),
            setItem: (k, v) => storage.set(k, v),
            removeItem: k => storage.delete(k)
        },
        usersRef: 'pseudopy_users',
        activityRef: 'pseudopy_activity',
        notificationsRef: 'pseudopy_notifications',
        passwordRequestsRef: 'pseudopy_passwordRequests',
        evidenceRef: 'pseudopy_evidence',
        tutorialProgressRef: 'pseudopy_tutorialProgress',
        cachedUsers: localUsers.slice(),
        currentUser: opts.currentUser || null,
        firestoreReady: () => opts.firestoreReady !== false,
        cloudUid: () => (opts.cloudUid === undefined ? 'uid_inst' : opts.cloudUid),
        firebase: opts.firebase,
        dbGetAll: async ref => (opts.related && opts.related[ref]) || [],
        dbGet: async (ref, id) => localUsers.find(u => String(u._docId || u.id) === String(id)) || null,
        dbUpdate: async (ref, id, patch) => {
            if (opts.dbUpdateFails) throw Object.assign(new Error('permission'), { code: 'permission-denied' });
            const idx = localUsers.findIndex(u => String(u._docId || u.id) === String(id));
            if (idx >= 0) localUsers[idx] = Object.assign({}, localUsers[idx], patch);
            return localUsers[idx];
        },
        getLocalCollection: () => localUsers,
        setLocalCollection: (ref, data) => { if (ref === 'pseudopy_users') localUsers = data; },
        clearPendingForDocument: async (ref, id) => { pending.push({ ref, id }); return 1; },
        offlineStore: { deleteDocument: async (ref, id) => purged.push({ ref, id }) },
        requireOnline: () => (opts.online === false ? { ok: false, message: 'This action requires an internet connection.' } : { ok: true }),
        logAuditAction: async entry => { pending.push({ audit: entry }); },
        describe: null
    });
    ctx.firebase = opts.firebase;
    vm.runInContext(dbModule, ctx);
    return {
        ctx,
        users: () => localUsers,
        storage,
        pending,
        purged,
        logged,
        setUsers(rows) { localUsers = rows.slice(); ctx.cachedUsers = rows.slice(); }
    };
}

const student = {
    _docId: 'u_stu_1', id: 'u_stu_1', fullName: 'Mikaella Dela Cruz', username: 'mikaella',
    role: 'student', status: 'active', studentNumber: '2300001', instructorId: 'u2'
};
const instructor = { _docId: 'u2', id: 'u2', fullName: 'Marc Enearn R. Antaso', username: 'mreantaso_instructor', role: 'instructor' };

// ── 1. The original defect: a failed delete must never look successful ──

test('dbDelete no longer deletes from Firestore and says so', () => {
    const src = readSrc('database/collections.js');
    const body = src.slice(src.indexOf('async function dbDelete'));
    assert.doesNotMatch(body.slice(0, body.indexOf('async function dbRemoveLocalRecord')),
        /firestore\.collection\(ref\)\.doc\(docId\)\.delete\(\)/,
        'dbDelete must not attempt a Firestore delete');
    assert.match(src, /deletion-disabled/);
});

test('dbDelete returns an explicit failure result instead of a bare refusal', () => {
    const src = readSrc('database/collections.js');
    assert.match(src, /code: 'deletion-disabled'/);
    assert.match(src, /exists,/);
});

test('no client code path announces a deletion it did not confirm', () => {
    const app = read('app.js');
    // The old flow was: dbDelete(...) then an unconditional success toast.
    assert.doesNotMatch(app, /dbDelete\(usersRef/, 'student deletion must not call dbDelete');
    assert.match(app, /deleteStudentProfile\(/, 'the authorized entry point must be used');
    assert.match(app, /result\.ok !== true/, 'the result must be checked before reporting success');
});

// ── 2. Authorization matrix ─────────────────────────────────────

test('a student caller is refused', () => {
    const h = deletionHarness({ users: [student], currentUser: { _docId: 'u_stu_1', role: 'student' } });
    const verdict = h.ctx.authorizeStudentDeletion({
        callerRole: 'student', callerDocId: 'u_stu_1', target: student, targetDocId: 'u_stu_1'
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.code, 'not-authorized');
});

test('an instructor may delete their own student but not another class', () => {
    const h = deletionHarness();
    assert.equal(h.ctx.authorizeStudentDeletion({
        callerRole: 'instructor', callerDocId: 'u2', target: student, targetDocId: 'u_stu_1'
    }).ok, true);
    const other = Object.assign({}, student, { _docId: 'u_stu_2', id: 'u_stu_2', instructorId: 'u9' });
    const verdict = h.ctx.authorizeStudentDeletion({
        callerRole: 'instructor', callerDocId: 'u2', target: other, targetDocId: 'u_stu_2'
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.code, 'not-owner');
});

test('an admin may delete any student', () => {
    const h = deletionHarness();
    const other = Object.assign({}, student, { _docId: 'u_stu_2', id: 'u_stu_2', instructorId: 'u9' });
    assert.equal(h.ctx.authorizeStudentDeletion({
        callerRole: 'admin', callerDocId: 'u_admin', target: other, targetDocId: 'u_stu_2'
    }).ok, true);
});

test('staff accounts and self-deletion are refused', () => {
    const h = deletionHarness();
    const staffTarget = Object.assign({}, instructor, { _docId: 'u3', id: 'u3', role: 'instructor' });
    assert.equal(h.ctx.authorizeStudentDeletion({
        callerRole: 'admin', callerDocId: 'u_admin', target: staffTarget, targetDocId: 'u3'
    }).code, 'invalid-target');
    assert.equal(h.ctx.authorizeStudentDeletion({
        callerRole: 'instructor', callerDocId: 'u_stu_1', target: student, targetDocId: 'u_stu_1'
    }).code, 'self-delete');
});

test('an already-deleted account and a missing doc id are refused', () => {
    const h = deletionHarness();
    const dead = Object.assign({}, student, { status: 'deleted', deletedAt: new Date().toISOString() });
    assert.equal(h.ctx.authorizeStudentDeletion({
        callerRole: 'instructor', callerDocId: 'u2', target: dead, targetDocId: 'u_stu_1'
    }).code, 'already-deleted');
    const idless = { role: 'student', username: 'mikaella', fullName: 'Mikaella Dela Cruz', instructorId: 'u2' };
    assert.equal(h.ctx.authorizeStudentDeletion({
        callerRole: 'instructor', callerDocId: 'u2', target: idless, targetDocId: ''
    }).code, 'invalid-target', 'a profile with no document id must be refused');
    assert.equal(h.ctx.authorizeStudentDeletion({
        callerRole: 'instructor', callerDocId: 'u2', target: null, targetDocId: 'u_missing'
    }).code, 'not-found');
});

test('the server copy of the rules agrees with the client copy', () => {
    const cases = [
        { callerClaimRole: 'student', callerDoc: { role: 'student' }, callerDocId: 'u_stu_1', targetDoc: student, targetDocId: 'u_stu_1' },
        { callerClaimRole: 'instructor', callerDoc: instructor, callerDocId: 'u2', targetDoc: student, targetDocId: 'u_stu_1' },
        { callerClaimRole: 'instructor', callerDoc: instructor, callerDocId: 'u2', targetDoc: Object.assign({}, student, { instructorId: 'u9' }), targetDocId: 'u_stu_2' },
        { callerClaimRole: 'admin', callerDoc: { role: 'admin' }, callerDocId: 'u_admin', targetDoc: student, targetDocId: 'u_stu_1' }
    ];
    const h = deletionHarness();
    for (const c of cases) {
        const server = fnLogic.authorizeDeletion(c);
        const client = h.ctx.authorizeStudentDeletion({
            callerRole: (c.callerDoc && c.callerDoc.role) || c.callerClaimRole,
            callerDocId: c.callerDocId, target: c.targetDoc, targetDocId: c.targetDocId
        });
        assert.equal(server.ok, client.ok, 'server and client must agree');
        assert.equal(server.code, client.code);
    }
});

// ── 3. Confirmation, chunking, related records ──────────────────

test('the typed username must match exactly', () => {
    const h = deletionHarness();
    assert.equal(h.ctx.confirmUsernameMatches(student, ' mikaella '), true, 'surrounding whitespace is trimmed');
    assert.equal(h.ctx.confirmUsernameMatches(student, 'Mikaella'), false, 'the match is exact and case-sensitive');
    assert.equal(h.ctx.confirmUsernameMatches(student, ''), false);
});

test('a wrong confirmation never reaches the database', async () => {
    const h = deletionHarness({ users: [student], currentUser: instructor });
    const result = await h.ctx.deleteStudentProfile('u_stu_1', { confirmUsername: 'wrongname' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'confirmation-mismatch');
    assert.equal(h.pending.filter(p => !p.audit).length, 0, 'no write and no pending mutation');
});

test('batches stay under the Firestore 500-operation limit', () => {
    const h = deletionHarness();
    const refs = Array.from({ length: 1200 }, (_, i) => ({ id: 'r' + i }));
    const chunks = h.ctx.chunkDeletionRefs(refs, 400);
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].length, 400);
    assert.equal(chunks[1].length, 400);
    assert.equal(chunks[2].length, 400);
    assert.ok(chunks.every(c => c.length <= 500));
    assert.equal([].concat(...chunks).length, 1200);
});

test('ownership requires a strict owner field, never a shared name', () => {
    const h = deletionHarness();
    assert.equal(h.ctx.recordOwnedByProfile({ studentAccountId: 'u_stu_1' }, student), true);
    assert.equal(h.ctx.recordOwnedByProfile({ userId: 'u_stu_1' }, student), true);
    assert.equal(h.ctx.recordOwnedByProfile({ accountId: 'u_stu_1' }, student), true);
    // A display-name / username match is NOT proof of ownership.
    assert.equal(h.ctx.recordOwnedByProfile({ student: 'Mikaella Dela Cruz' }, student), false);
    assert.equal(h.ctx.recordOwnedByProfile({ email: 'mikaella@example.test' }, student), false);
    assert.equal(h.ctx.recordAmbiguousForProfile({ student: 'Mikaella Dela Cruz' }, student), true);
});

test('a record owned by a live account is never counted as orphaned', () => {
    const result = audit.classifyRecords(['u_stu_1'], [
        { id: 'a1', data: { studentAccountId: 'u_stu_1' } },
        { id: 'a2', data: { studentAccountId: 'u_gone' } },
        { id: 'a3', data: { student: 'Mikaella Dela Cruz' } }
    ]);
    assert.deepEqual(result.orphaned.map(o => o.id), ['a2']);
    assert.deepEqual(result.ambiguous.map(a => a.id), ['a3']);
});

// ── 4. Soft delete behaviour ────────────────────────────────────

test('without a server path the account is deactivated, not erased', async () => {
    const h = deletionHarness({ users: [student], currentUser: instructor, firebase: undefined });
    const result = await h.ctx.deleteStudentProfile('u_stu_1', { confirmUsername: 'mikaella' });
    assert.equal(result.ok, true);
    assert.equal(result.mode, 'soft');
    assert.equal(result.authRevoked, false, 'a soft delete must not claim the auth account was removed');
    assert.equal(h.users()[0].status, 'deleted');
    assert.ok(h.users()[0].deletedAt);
    assert.equal(h.purged.length, 0, 'a soft delete keeps the profile for the undo window');
    const auditEntry = h.pending.find(p => p.audit);
    assert.ok(auditEntry, 'a deletion must always be audited');
    assert.equal(auditEntry.audit.action, 'student.soft-delete');
});

test('a soft-deleted profile is recognised by isDeletedProfile', () => {
    const h = deletionHarness();
    assert.equal(h.ctx.isDeletedProfile({ status: 'deleted' }), true);
    assert.equal(h.ctx.isDeletedProfile({ status: 'active', deletedAt: 'x', deletionMode: 'soft' }), true);
    assert.equal(h.ctx.isDeletedProfile({ status: 'active' }), false);
    assert.equal(h.ctx.isDeletedProfile(null), false);
});

test('undo restores a soft deletion but refuses a permanent one', async () => {
    const h = deletionHarness({ users: [student], currentUser: instructor });
    await h.ctx.deleteStudentProfile('u_stu_1', { confirmUsername: 'mikaella' });
    assert.ok(h.ctx.deletionTombstone('u_stu_1'));
    const undone = await h.ctx.undoStudentDeletion('u_stu_1');
    assert.equal(undone.ok, true);
    assert.equal(h.users()[0].status, 'active');
    assert.equal(h.ctx.deletionTombstone('u_stu_1'), null);

    h.ctx.markDeletionTombstone('u_stu_2', { mode: 'hard' });
    const refused = await h.ctx.undoStudentDeletion('u_stu_2');
    assert.equal(refused.ok, false);
    assert.equal(refused.code, 'irreversible');
});

test('a permanently deleted profile cannot return from the local fallback or seed', () => {
    const h = deletionHarness();
    const stale = [student, { _docId: 'u_other', id: 'u_other', role: 'student' }];
    h.ctx.markDeletionTombstone('u_stu_1', { mode: 'hard' });
    const filtered = h.ctx.dropHardDeletedProfiles(stale);
    assert.deepEqual(filtered.map(u => u._docId), ['u_other']);
    // A soft deletion must stay visible so login can explain why.
    h.ctx.clearDeletionTombstone('u_stu_1');
    h.ctx.markDeletionTombstone('u_stu_3', { mode: 'soft' });
    assert.equal(h.ctx.dropHardDeletedProfiles([{ _docId: 'u_stu_3' }]).length, 1);
});

test('the offline branch of dbGetAll drops tombstoned profiles', () => {
    const src = readSrc('database/collections.js');
    assert.match(src, /if \(ref === usersRef && typeof dropHardDeletedProfiles === 'function'\) \{\s*results = dropHardDeletedProfiles\(results\);/,
        'the local fallback must not resurrect a deleted profile');
});

test('an offline deletion attempt is refused rather than queued', async () => {
    const h = deletionHarness({ users: [student], currentUser: instructor, online: false });
    const result = await h.ctx.deleteStudentProfile('u_stu_1', { confirmUsername: 'mikaella' });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'unavailable');
    assert.equal(h.users()[0].status, 'active', 'nothing was changed while offline');
});

// ── 5. Server path ─────────────────────────────────────────────

test('a confirmed hard delete purges the local profile and retires queued writes', async () => {
    const calls = [];
    // The compat SDK returns a callable function, so the harness mirrors that.
    const firebase = {
        functions: () => ({
            httpsCallable: name => async (payload) => {
                calls.push({ name, payload });
                return { data: { ok: true, mode: 'hard', operationId: 'del_1', removed: { related: { pseudopy_activity: 3 } } } };
            }
        })
    };
    const h = deletionHarness({ users: [student], currentUser: instructor, firebase, cloudUid: 'uid_inst' });
    const result = await h.ctx.deleteStudentProfile('u_stu_1', { confirmUsername: 'mikaella' });
    assert.equal(result.ok, true);
    assert.equal(result.mode, 'hard');
    assert.equal(calls[0].name, 'deleteStudentAccount');
    assert.equal(calls[0].payload.studentDocId, 'u_stu_1', 'the canonical document id must be sent');
    assert.equal(h.users().some(u => u._docId === 'u_stu_1'), false, 'the local profile must be purged');
    assert.ok(h.pending.some(p => p.ref === 'pseudopy_users' && p.id === 'u_stu_1'), 'queued writes must be retired');
    assert.ok(h.purged.some(p => p.id === 'u_stu_1'), 'the IndexedDB mirror must be purged');
});

test('a refused server delete is reported, never retried as a soft delete', async () => {
    const firebase = {
        functions: () => ({
            httpsCallable: () => async () => { throw Object.assign(new Error('no'), { code: 'functions/permission-denied' }); }
        })
    };
    const h = deletionHarness({ users: [student], currentUser: instructor, firebase, cloudUid: 'uid_inst' });
    const result = await h.ctx.deleteStudentProfile('u_stu_1', { confirmUsername: 'mikaella' });
    assert.equal(result.ok, false, 'a permission refusal must not be reported as success');
    assert.equal(result.code, 'permission-denied');
    assert.equal(h.users()[0].status, 'active', 'nothing was changed');
});

test('an unavailable server path falls back to the documented soft delete', async () => {
    const firebase = {
        functions: () => ({
            httpsCallable: () => async () => { throw Object.assign(new Error('nope'), { code: 'functions/unavailable' }); }
        })
    };
    const h = deletionHarness({ users: [student], currentUser: instructor, firebase, cloudUid: 'uid_inst' });
    const result = await h.ctx.deleteStudentProfile('u_stu_1', { confirmUsername: 'mikaella' });
    assert.equal(result.ok, true);
    assert.equal(result.mode, 'soft');
    assert.match(result.message, /NOT revoked/);
    assert.equal(h.users()[0].statusBeforeDeletion, 'active', 'the prior status is preserved for undo');

    const undone = await h.ctx.undoStudentDeletion('u_stu_1');
    assert.equal(undone.ok, true);
    assert.equal(h.users()[0].status, 'active', 'undo restores the previous status');
    assert.equal(h.users()[0].statusBeforeDeletion, null);
    assert.equal(h.users()[0].deletedAt, null);
});

test('undo restores an archived account to archived, not to active', async () => {
    const archived = Object.assign({}, student, { status: 'archived' });
    const h = deletionHarness({ users: [archived], currentUser: instructor });
    await h.ctx.deleteStudentProfile('u_stu_1', { confirmUsername: 'mikaella' });
    assert.equal(h.users()[0].status, 'deleted');
    await h.ctx.undoStudentDeletion('u_stu_1');
    assert.equal(h.users()[0].status, 'archived', 'undo must not silently reactivate an archived account');
});

test('a permanent deletion cannot be undone from the browser', async () => {
    const firebase = {
        functions: () => ({
            httpsCallable: () => async () => ({ data: { ok: true, mode: 'hard', operationId: 'del_1' } })
        })
    };
    const h = deletionHarness({ users: [student], currentUser: instructor, firebase, cloudUid: 'uid_inst' });
    const deleted = await h.ctx.deleteStudentProfile('u_stu_1', { confirmUsername: 'mikaella' });
    assert.equal(deleted.mode, 'hard');
    const undone = await h.ctx.undoStudentDeletion('u_stu_1');
    assert.equal(undone.ok, false);
    assert.equal(undone.code, 'irreversible');
});

test('error messages map to one actionable sentence each', () => {
    const h = deletionHarness();
    assert.match(h.ctx.describeDeletionError({ code: 'functions/permission-denied' }).message, /security rules/i);
    assert.match(h.ctx.describeDeletionError({ code: 'unauthenticated' }).message, /Sign in again/);
    assert.match(h.ctx.describeDeletionError({ code: 'unavailable' }).message, /not deleted/);
    assert.equal(h.ctx.describeDeletionError({ code: 'not-owner' }).code, 'not-owner');
});

test('the function refuses to delete an auth account it cannot verify', () => {
    const src = read('functions/index.js');
    assert.match(src, /const targetAuthUid = String\(\(targetDoc && targetDoc\.uid\) \|\| ''\)\.trim\(\)/,
        'only a uid bound by the profile may be deleted');
    assert.doesNotMatch(src, /getAuth\(\)\.getUserByEmail/, 'an email must never identify the account to delete');
    assert.match(src, /deleteUser\(targetAuthUid\)/);
    assert.match(src, /if \(targetAuthUid && !authDeleted\)/, 'an unbound or already-revoked uid is skipped');
});

test('the function blocks concurrent writes and is idempotent', () => {
    const src = read('functions/index.js');
    assert.match(src, /deletionState: 'in-progress'/, 'the profile must be fenced before the cascade');
    assert.match(src, /replayed: true/, 'a retried call must be idempotent');
    assert.match(src, /status === 'completed'/);
});

test('the function audit entry records who, what and where', () => {
    const src = read('functions/index.js');
    for (const field of ['deletedByUid', 'instructorId', 'studentId', 'studentName', 'requestId', 'ip', 'userAgent']) {
        assert.ok(src.includes(field), `audit entry must record ${field}`);
    }
});

// ── 6. Related-record scan ─────────────────────────────────────

test('the impact summary separates provable from merely-matching records', async () => {
    const h = deletionHarness({
        users: [student],
        currentUser: instructor,
        related: {
            pseudopy_activity: [
                { _docId: 'act_1', studentAccountId: 'u_stu_1' },
                { _docId: 'act_2', studentId: 'u_stu_1' },
                { _docId: 'act_3', student: 'Mikaella Dela Cruz' }
            ],
            pseudopy_notifications: [{ _docId: 'n1', studentId: 'u_stu_1' }]
        }
    });
    const summary = await h.ctx.collectStudentRelatedRecords(student);
    assert.equal(summary.owned.pseudopy_activity, 2);
    assert.equal(summary.owned.pseudopy_notifications, 1);
    assert.equal(summary.ownedTotal, 3);
    assert.equal(summary.ambiguous.pseudopy_activity, 1);
    assert.equal(summary.ambiguousTotal, 1);
});

// ── 7. UI wiring ───────────────────────────────────────────────

test('the delete button is delegated, not bound per row', () => {
    const users = read('src/app/users.js');
    assert.match(users, /data-action="delete-student"/);
    assert.match(users, /data-id="\$\{u\._docId \|\| u\.id\}"/, 'the canonical document id must be sent');
    assert.doesNotMatch(users, /onclick="deleteUser\(/, 'the inline handler must be gone');
    assert.match(users, /<tr data-doc-id=/, 'rows carry the document id for animation and lookup');
    assert.match(uiModule, /closest\('\[data-action="delete-student"\]'\)/);
    assert.match(uiModule, /students-table-body/, 'the listener is bound to the stable container');
});

test('the button is labelled with the specific student', () => {
    const users = read('src/app/users.js');
    assert.match(users, /aria-label="Delete \$\{u\.fullName\}"/);
    assert.doesNotMatch(users, /aria-label="Delete user"/, 'a generic label does not identify the row');
});

test('the confirmation modal is a real dialog with a typed-username field', () => {
    const html = read('index.html');
    assert.match(html, /id="delete-student-modal"/);
    assert.match(html, /id="delete-student-confirm-input"/);
    assert.match(html, /id="delete-student-error" role="alert"/);
    assert.match(html, /id="btn-confirm-delete-student"/);
    assert.match(html, /id="student-deletion-undo"/);
    // The old native confirm() is gone from the flow.
    assert.doesNotMatch(read('src/app/users.js'), /confirm\('Delete this user\?'\)/);
});

test('duplicate clicks cannot start a second deletion', () => {
    assert.match(uiModule, /if \(studentDeletionBusy \|\| studentDeletionPending\) return;/);
    assert.match(uiModule, /btn\.disabled = !!busy;/);
    assert.match(uiModule, /setAttribute\('aria-busy'/);
});

test('a failure is surfaced in the modal and keeps the student listed', async () => {
    const toasts = [];
    const set = new Map();
    const el = id => {
        if (!set.has(id)) {
            set.set(id, {
                id, value: '', textContent: '', style: {}, dataset: {},
                classList: { add() { }, remove() { }, toggle() { }, contains: () => false },
                addEventListener() { }, querySelector: () => null
            });
        }
        return set.get(id);
    };
    const ctx = vm.createContext({
        console: { info() { }, warn() { }, error() { } },
        document: { readyState: 'complete', addEventListener() { }, contains: () => false },
        $id: el,
        getValue: id => el(id).value,
        setText: (id, v) => { el(id).textContent = v; },
        showToast: (m, t) => toasts.push({ m, t }),
        refreshIcons() { },
        readStudentNumber: () => '2300001',
        refreshUsers: async () => [student],
        cachedUsers: [student],
        currentUser: instructor,
        STUDENT_DELETION: { UNDO_WINDOW_MS: 8000, HARD: 'hard', SOFT: 'soft' },
        authorizeStudentDeletion: () => ({ ok: true }),
        collectStudentRelatedRecords: async () => ({ owned: {}, ambiguous: {}, ownedTotal: 0, ambiguousTotal: 0 }),
        deleteStudentProfile: async () => ({ ok: false, code: 'permission-denied', message: 'Firebase refused the deletion.' }),
        describeDeletionError: e => ({ code: e.code, message: e.message }),
        loadStudents: async () => { ctx.loaded = true; },
        dbGetAll: async () => [],
        activityRef: 'pseudopy_activity'
    });
    vm.runInContext(uiModule, ctx);
    // Drive the public entry point: module-level `let` state is not reachable
    // from the context object, so the modal must be opened the real way.
    await ctx.openDeleteStudentModal('u_stu_1');
    el('delete-student-confirm-input').value = 'mikaella';
    await ctx.executeDeleteStudent();
    assert.equal(el('delete-student-error').textContent, 'Firebase refused the deletion.');
    assert.equal(ctx.loaded, undefined, 'the list must not be reloaded as if it succeeded');
    assert.ok(toasts.some(t => t.t === 'error'));
});

// ── 8. Session and login guards ────────────────────────────────

test('a deleted account cannot log in', () => {
    const auth = read('src/app/authentication.js');
    assert.match(auth, /isDeletedProfile\(userByUsername\)/);
    assert.match(auth, /has been deleted/i);
});

test('a deleted account cannot be restored from a persisted session', () => {
    const session = read('src/app/session.js');
    assert.match(session, /status !== 'deleted'/, 'the cached-profile boot path must refuse it');
    assert.match(session, /status === 'deleted'/, 'the authoritative Firestore path must refuse it');
});

// ── 9. Rules ───────────────────────────────────────────────────

test('a staff member may delete a student through the strict rules', () => {
    const rules = read('firestore.rules');
    assert.match(rules, /function staffDeletesStudent\(targetId\)/);
    assert.match(rules, /resource\.data\.role == 'student'/, 'staff accounts must never be deletable');
    assert.match(rules, /targetId != request\.auth\.uid/, 'self-deletion must be refused');
    assert.match(rules, /ownsAccount\(resource\.data\.instructorId\)/,
        'instructorId is an app account id, so it must be resolved, not compared to the auth uid');
    assert.match(rules, /allow delete: if staffDeletesStudent\(userId\);/);
});

test('a tombstoned account cannot be recreated by a stale offline write', () => {
    const strict = read('firestore.rules');
    assert.match(strict, /function hasTombstone\(accountId\)/);
    assert.match(strict, /exists\(\/databases\/\$\(database\)\/documents\/pseudopy_deletedProfiles\/\$\(accountId\)\)/);
    const users = strict.split('match /pseudopy_users/{userId}')[1].split('function staffDeletesStudent')[0];
    assert.match(users, /allow create:[\s\S]*!hasTombstone\(createdAccountId\(\)\)/);

    // The interim ruleset is permissive but must keep this one guard, because
    // it is the ruleset that is actually deployed today.
    const interim = read('firestore.interim.rules');
    const block = interim.split('match /pseudopy_users/{doc}')[1].split('match /')[0];
    assert.match(block, /allow create: if !exists\(/, 'the deployed rules must fence tombstoned ids');
    assert.match(block, /allow read: if true;/);
});

test('the tombstone collection itself is server-owned', () => {
    for (const file of ['firestore.rules', 'firestore.interim.rules']) {
        const rules = read(file);
        const block = rules.split('match /pseudopy_deletedProfiles/{doc}')[1].split('match /')[0];
        assert.match(block, /allow write: if false;/, `${file}: tombstones must be immutable to clients`);
    }
});

// ── 11. Callable durability ─────────────────────────────────────

test('an instructor is recognized through their account document, not the uid', () => {
    // Legacy account ids are app-generated: the student's `instructorId` is
    // `u2` while the caller's auth uid is something else entirely.
    const verdict = fnLogic.authorizeDeletion({
        callerClaimRole: 'instructor',
        callerDoc: { role: 'instructor', uid: 'uid_inst' },
        callerDocId: 'u2',
        targetDoc: student,
        targetDocId: 'u_stu_1'
    });
    assert.equal(verdict.ok, true);
    assert.equal(fnLogic.authorizeDeletion({
        callerClaimRole: 'instructor',
        callerDoc: { role: 'instructor', uid: 'uid_other' },
        callerDocId: 'u2',
        targetDoc: student,
        targetDocId: 'u_stu_1'
    }).ok, true, 'the caller document resolves the owner regardless of uid');
});

test('a stale uid binding cannot be used to delete the operator themselves', () => {
    // The student's document carries the operator's uid because a binding
    // went stale, while the operator's own profile is the one being resolved.
    const verdict = fnLogic.authorizeDeletion({
        callerClaimRole: 'admin',
        callerDoc: { role: 'admin', uid: 'uid_stale', _docId: 'u_admin' },
        callerDocId: 'u_admin',
        targetDoc: Object.assign({}, student, { uid: 'uid_stale' }),
        targetDocId: 'u_stu_1'
    });
    assert.equal(verdict.code, 'self-delete');
});

test('related ownership counts ambiguous references instead of deleting them', () => {
    const profile = { _docId: 'u_stu_1', username: 'mikaella', fullName: 'Mikaella Daet', studentNumber: '2300001' };
    assert.deepEqual(fnLogic.ownershipOf({ studentAccountId: 'u_stu_1' }, profile),
        { owned: true, ambiguous: false });
    assert.deepEqual(fnLogic.ownershipOf({ userId: 'u_stu_1' }, profile, { candidateId: 'u_stu_1' }),
        { owned: true, ambiguous: false });
    assert.deepEqual(fnLogic.ownershipOf({ studentId: 'u_stu_1' }, profile, { candidateId: 'u_stu_1' }),
        { owned: true, ambiguous: false });
    assert.deepEqual(fnLogic.ownershipOf({ studentId: 'somebody_else' }, profile, { candidateId: 'u_stu_1' }),
        { owned: false, ambiguous: true }, 'a non-matching owner field is flagged, never erased');
    assert.deepEqual(fnLogic.ownershipOf({ student: 'Mikaella Daet' }, profile),
        { owned: false, ambiguous: false }, 'a name-only record is not even counted as ambiguous');
    assert.equal(fnLogic.isOwnedBy({ accountId: 'u_stu_1' }, profile), true);
});

test('the callable journals its intent before erasing and resumes from the plan', () => {
    const src = read('functions/index.js');
    const journalAt = src.indexOf("status: 'in-progress'");
    const cascadeAt = src.indexOf('await applyPlan(db, plan)');
    assert.ok(journalAt > -1, 'the operation must be journaled as in-progress');
    assert.ok(cascadeAt > journalAt, 'the journal must be written before anything is erased');
    assert.match(src, /deserializePlan\(op\.plan\)/, 'a retry must resume from the recorded plan');
    assert.match(src, /resolveCaller\(db, request\.auth\)/, 'the caller must be resolved from the auth uid');
    assert.doesNotMatch(src, /db\.collection\(USERS\)\.doc\(String\(request\.auth\.uid\)\)/,
        'the legacy profile id is not the auth uid');
    assert.match(src, /pseudopy_deletedProfiles/, 'a tombstone must fence resurrection');
});

test('the deletion journal is never client-writable', () => {
    for (const file of ['firestore.rules', 'firestore.interim.rules']) {
        const rules = read(file);
        const block = rules.split('match /pseudopy_deletionOps/{doc}')[1].split('match /')[0];
        assert.match(block, /allow read, write: if false;/, `${file}: the journal must be server-only`);
    }
});

test('a client cannot author its own deletion audit entry', () => {
    const rules = read('firestore.rules');
    const block = rules.split('match /pseudopy_auditLog/{doc}')[1].split('match /')[0];
    assert.match(block, /action != 'student\.delete'/);
    assert.match(block, /action != 'student\.soft-delete'/);
    assert.match(block, /allow update, delete: if false;/);
});

// ── 10. Orphan audit script ───────────────────────────────────

test('the audit script is report-only by default', () => {
    const src = read('scripts/audit-student-orphans.js');
    assert.match(src, /--dry-run/, 'a dry run must be available');
    assert.match(src, /This report deletes nothing\./);
    assert.match(src, /firebase-admin/, 'it must use the Admin SDK like the function does');
    assert.doesNotMatch(src, /\.batch\(\)[\s\S]{0,80}?\.delete\(/, 'the audit must not build delete batches');
    assert.match(src, /--apply is intentionally not implemented/);
});

test('Auth users without a verified profile binding are reported, not deleted', () => {
    const profilesByUid = new Set(['uid_live']);
    const result = audit.classifyAuthUsers([{ uid: 'uid_live' }, { uid: 'uid_ghost', email: 'x@y.z' }], profilesByUid);
    assert.equal(result.length, 1);
    assert.equal(result[0].uid, 'uid_ghost');
});

test('dead profiles are classified with a reason', () => {
    const result = audit.classifyProfiles([
        { id: 'u1', data: { role: 'student', status: 'active' } },
        { id: 'u2', data: { role: 'student', status: 'deleted' } },
        { id: 'u3', data: { role: 'student', status: 'archived' } },
        { id: 'u4', data: { role: 'instructor', status: 'active' } }
    ]);
    assert.deepEqual(result.map(p => p.id), ['u2', 'u3']);
    assert.deepEqual(result.map(p => p.reason), ['soft-deleted', 'archived']);
});

test('an apply plan can only target ids the audit actually flagged', () => {
    const report = { collections: [{ name: 'pseudopy_activity', orphaned: [{ id: 'act_1' }], ambiguous: [{ id: 'act_2' }] }] };
    const plan = audit.buildApplyPlan(report, ['act_1', 'act_2']);
    assert.deepEqual(plan.actions, [{ collection: 'pseudopy_activity', id: 'act_1', operation: 'delete' }]);
    assert.ok(!plan.actions.some(a => a.id === 'act_2'), 'an ambiguous record must never be auto-deleted');
});

test('the CLI parses dry-run, plan, backup and apply options', () => {
    const args = audit.parseArgs(['--dry-run', '--out', 'r.json', '--backup', 'b.json', '--plan-file', 'p.json']);
    assert.equal(args.dryRun, true);
    assert.equal(args.out, 'r.json');
    assert.equal(args.backup, 'b.json');
    assert.equal(args.planFile, 'p.json');
    const apply = audit.parseArgs(['--apply', 'plan.json']);
    assert.equal(apply.apply, true);
    assert.equal(apply.applyFile, 'plan.json', 'the plan path must be consumed, not rejected as an unknown flag');
    assert.throws(() => audit.parseArgs(['--nope']), /Unknown option/);
});

test('a backup covers exactly the documents a plan would delete', () => {
    const plan = {
        actions: [
            { collection: 'pseudopy_activity', id: 'act_1', operation: 'delete' },
            { collection: 'pseudopy_activity', id: 'act_1', operation: 'delete' },
            { collection: 'pseudopy_evidence', id: 'ev_1', operation: 'delete' },
            { collection: 'pseudopy_activity', id: 'act_9', operation: 'update' }
        ]
    };
    const snapshot = audit.selectSnapshotIds(plan);
    assert.deepEqual(snapshot, [
        { collection: 'pseudopy_activity', id: 'act_1' },
        { collection: 'pseudopy_evidence', id: 'ev_1' }
    ], 'each document once, deletes only');
});

test('an approved-id list accepts both shapes and rejects anything else', () => {
    assert.deepEqual(audit.parseApprovedIds(['act_1', 'act_2']), ['act_1', 'act_2']);
    assert.deepEqual(audit.parseApprovedIds({ ids: ['act_1'] }), ['act_1']);
    assert.throws(() => audit.parseApprovedIds({ nope: 1 }), /JSON array/);
});

test('the backup path reads live documents and never writes them back', () => {
    const src = read('scripts/audit-student-orphans.js');
    const body = src.slice(src.indexOf('async function runBackup'));
    assert.match(body, /\.doc\(target\.id\)\.get\(\)/, 'the backup must read each document');
    assert.doesNotMatch(body, /\.set\(|\.update\(|\.delete\(|\.add\(/,
        'the backup must not write anything back to Firestore');
    assert.match(src, /--backup requires --plan-file/);
});