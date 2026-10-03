// ══════════════════════════════════════════════════════════════
//  STUDENT ACCOUNT DELETION
//
//  One entry point for removing a student profile: `deleteStudentProfile`.
//
//  Two modes, chosen automatically and reported back to the caller:
//
//    HARD — a trusted server performs the deletion (callable
//           `deleteStudentAccount`, Admin SDK). The Firebase Auth
//           account, the profile document and every related record
//           with a *verified* owner reference are removed, and the
//           server writes the audit entry. Requires a Firebase Auth
//           session carrying a trusted `role` claim.
//
//    SOFT — the fallback used while that server path is not
//           available (no Cloud Functions deployment, or nobody
//           signed in to the cloud). Nothing is destroyed: the
//           profile is marked `status: 'deleted'` so login, lists and
//           analytics stop treating it as a live account, and the
//           profile can be restored within the undo window.
//
//  The previous flow called `dbDelete()` and then reported success
//  regardless of the outcome, so a skipped or refused Firestore delete
//  looked identical to a successful one and the local copy of the
//  profile was never removed. This module never reports a deletion it
//  cannot confirm, and it always reconciles the local caches.
// ══════════════════════════════════════════════════════════════

const STUDENT_DELETION = {
    HARD: 'hard',
    SOFT: 'soft',
    /** Profile status that marks a soft-deleted account. */
    STATUS: 'deleted',
    /** Local tombstone store (survives a reload, unlike in-memory state). */
    TOMBSTONE_KEY: 'pseudopy_deleted_profiles',
    /** Callable implemented in functions/index.js. */
    CALLABLE: 'deleteStudentAccount',
    UNDO_WINDOW_MS: 8000
};

/**
 * Owner-reference fields that identify a record unambiguously.
 *
 * A record is only auto-deleted when it points at the target through one
 * of these. `username`, `email` and `studentNumber` are deliberately NOT
 * here: they are shared, changeable and human-readable, so a match on one
 * of them is a review item rather than proof of ownership.
 */
const STUDENT_OWNER_FIELDS = ['studentAccountId', 'userId', 'accountId', 'studentId'];

/** Fields that suggest ownership but cannot prove it. Reported, never deleted. */
const STUDENT_AMBIGUOUS_FIELDS = ['username', 'email', 'studentNumber', 'student'];

// ── Pure helpers (unit-tested without a browser) ───────────────────

/**
 * Confirmation is an exact, case-sensitive match against the profile's
 * username, trimmed. Shared or similar usernames are why the modal shows the
 * student's full name and student number next to this field.
 */
function confirmUsernameMatches(profile, typed) {
    const value = String(typed || '').trim();
    if (!value || !profile) return false;
    return value === String(profile.username || '');
}

/** True when a profile has been soft-deleted (or tombstoned as hard-deleted). */
function isDeletedProfile(profile) {
    if (!profile || typeof profile !== 'object') return false;
    if (String(profile.status || '').toLowerCase() === STUDENT_DELETION.STATUS) return true;
    return !!(profile.deletedAt && profile.deletionMode);
}

/** Split an array into fixed-size batches. Firestore caps a batch at 500 ops. */
function chunkDeletionRefs(items, size = 400) {
    const list = Array.isArray(items) ? items : [];
    const width = Math.max(1, parseInt(size, 10) || 400);
    const chunks = [];
    for (let i = 0; i < list.length; i += width) chunks.push(list.slice(i, i + width));
    return chunks;
}

/**
 * Every identifier that provably refers to one profile.
 * `studentId` is included because the app writes it as the account id in
 * several collections; the ambiguous human-readable fields never are.
 */
function canonicalProfileIdentifiers(profile) {
    if (!profile) return [];
    const docId = profile._docId || profile.docId || null;
    return [docId, profile.id, profile.uid, profile.studentId]
        .map(v => (v === undefined || v === null ? '' : String(v)))
        .filter(Boolean);
}

/** True when `record` provably belongs to the target profile. */
function recordOwnedByProfile(record, profile) {
    if (!record || typeof record !== 'object') return false;
    const ids = new Set(canonicalProfileIdentifiers(profile));
    if (ids.size === 0) return false;
    for (const field of STUDENT_OWNER_FIELDS) {
        const value = record[field];
        if (value === undefined || value === null || value === '') continue;
        if (ids.has(String(value))) return true;
    }
    return false;
}

/**
 * Every human-readable value that could plausibly name this profile. These
 * are shared and changeable, so a match is a review item, never proof.
 */
function displayIdentifiers(profile) {
    if (!profile) return [];
    return [profile.fullName, profile.username, profile.email, profile.studentNumber, profile.studentId, profile.id]
        .map(v => (v === undefined || v === null ? '' : String(v)))
        .filter(Boolean);
}

/** Records that only *look* like they belong to the target. Review-only. */
function recordAmbiguousForProfile(record, profile) {
    if (!record || typeof record !== 'object') return false;
    if (recordOwnedByProfile(record, profile)) return false;
    const values = new Set(displayIdentifiers(profile));
    if (values.size === 0) return false;
    for (const field of STUDENT_AMBIGUOUS_FIELDS) {
        const value = record[field];
        if (value === undefined || value === null || value === '') continue;
        if (values.has(String(value))) return true;
    }
    return false;
}

/**
 * Authorisation for a deletion, evaluated from the caller's role and the
 * target profile. Deliberately independent of Firestore: the same decision
 * is re-made by the Cloud Function, and this copy only stops a doomed or
 * dangerous attempt from reaching the network.
 *
 * Returns `{ ok: true }` or `{ ok: false, code, message }`.
 */
function authorizeStudentDeletion({ callerRole, callerDocId, target, targetDocId } = {}) {
    const role = String(callerRole || '').toLowerCase();
    if (role !== 'instructor' && role !== 'admin') {
        return { ok: false, code: 'not-authorized', message: 'Only instructors and administrators can delete student accounts.' };
    }
    const docId = String(targetDocId || (target && (target._docId || target.id)) || '');
    if (!docId) {
        return { ok: false, code: 'invalid-target', message: 'This student record has no document id, so it cannot be deleted safely.' };
    }
    if (!target) {
        return { ok: false, code: 'not-found', message: 'Student not found. Refresh the list and try again.' };
    }
    if (isDeletedProfile(target)) {
        return { ok: false, code: 'already-deleted', message: 'This student account is already deleted.' };
    }
    const targetRole = String(target.role || '').toLowerCase();
    if (targetRole !== 'student') {
        return { ok: false, code: 'invalid-target', message: 'Only student accounts can be deleted from Manage Students.' };
    }
    const callerId = String(callerDocId || '');
    const targetIds = canonicalProfileIdentifiers(target);
    if (callerId && targetIds.indexOf(callerId) !== -1) {
        return { ok: false, code: 'self-delete', message: 'You cannot delete your own account.' };
    }
    if (role === 'instructor') {
        const owner = String(target.instructorId || '');
        const callerIds = [callerDocId].filter(Boolean).map(String);
        // An instructor may only delete a student enrolled under them.
        if (!owner || callerIds.indexOf(owner) === -1) {
            return { ok: false, code: 'not-owner', message: 'This student is not enrolled in your class.' };
        }
    }
    return { ok: true };
}

/**
 * Map a deletion failure onto one actionable sentence. Codes come from the
 * callable (`functions/lib/authorization.js`) or from Firestore/Auth.
 */
function describeDeletionError(error) {
    const code = String((error && (error.code || error.deletionCode)) || 'unknown').replace(/^functions\//, '');
    const known = {
        'not-authorized': 'Your account is not allowed to delete student accounts.',
        'self-delete': 'You cannot delete your own account.',
        'invalid-target': 'Only student accounts can be deleted from Manage Students.',
        'not-owner': 'This student is not enrolled in your class.',
        'not-found': 'Student not found. Refresh the list and try again.',
        'already-deleted': 'This student account is already deleted.',
        'mfa-required': 'This student has multi-factor authentication enabled. Delete the sign-in provider first.',
        'unauthenticated': 'Your session is not verified with Firebase, so deletion is not permitted. Sign in again or ask an administrator.',
        'failed-precondition': 'The deletion service is not available yet, so the account was deactivated instead of erased.',
        'unavailable': 'Firestore is unreachable. The student was not deleted; reconnect and try again.',
        'deadline-exceeded': 'The deletion service timed out. Nothing was removed; try again.',
        'permission-denied': 'Firebase refused the deletion. Check that the security rules and your staff role claim are deployed.',
        'invalid-argument': 'The deletion request was malformed and was rejected. Nothing was removed.'
    };
    return {
        code,
        message: known[code] || (error && error.message) || 'The student could not be deleted.'
    };
}

// ── Local tombstones ──────────────────────────────────────────────

function readDeletionTombstones() {
    try {
        const raw = localStorage.getItem(STUDENT_DELETION.TOMBSTONE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (e) {
        return {};
    }
}

function writeDeletionTombstones(map) {
    try {
        localStorage.setItem(STUDENT_DELETION.TOMBSTONE_KEY, JSON.stringify(map || {}));
    } catch (e) { /* storage full or blocked: the profile is still gone upstream */ }
}

/**
 * Remember a confirmed deletion so the local fallback and the seed data can
 * never put the account back on this device.
 */
function markDeletionTombstone(docId, meta = {}) {
    if (!docId) return null;
    const map = readDeletionTombstones();
    const record = {
        docId: String(docId),
        mode: meta.mode === STUDENT_DELETION.HARD ? STUDENT_DELETION.HARD : STUDENT_DELETION.SOFT,
        at: new Date().toISOString(),
        operationId: meta.operationId || null,
        fullName: meta.fullName || null,
        username: meta.username || null,
        studentNumber: meta.studentNumber || null
    };
    map[record.docId] = record;
    writeDeletionTombstones(map);
    return record;
}

function clearDeletionTombstone(docId) {
    const map = readDeletionTombstones();
    if (map[docId]) {
        delete map[docId];
        writeDeletionTombstones(map);
    }
}

function deletionTombstone(docId) {
    return readDeletionTombstones()[docId] || null;
}

/**
 * A hard-deleted profile must disappear from the local fallback even when
 * Firestore is unreachable; a soft-deleted profile is kept so login can show
 * the real reason instead of "user not found".
 */
function dropHardDeletedProfiles(list) {
    const map = readDeletionTombstones();
    const hardIds = Object.keys(map).filter(id => map[id].mode === STUDENT_DELETION.HARD);
    if (hardIds.length === 0 || !Array.isArray(list)) return list;
    return list.filter(item => hardIds.indexOf(String(item._docId || item.id)) === -1);
}

// ── Local reconciliation ──────────────────────────────────────────

/** Remove a profile from the localStorage cache and the IndexedDB mirror. */
async function purgeLocalProfile(docId) {
    if (!docId) return false;
    let removed = false;
    try {
        const local = getLocalCollection(usersRef);
        const next = local.filter(item => String(item._docId || item.id) !== String(docId));
        if (next.length !== local.length) {
            removed = true;
            setLocalCollection(usersRef, next);
        }
    } catch (e) {
        console.warn('[Deletion] local profile purge failed:', e && e.message);
    }
    try {
        if (typeof offlineStore !== 'undefined' && offlineStore && offlineStore.deleteDocument) {
            await offlineStore.deleteDocument(usersRef, docId);
        }
    } catch (e) { /* best-effort mirror */ }
    return removed;
}

/**
 * Retire queued writes for a profile so a stale offline edit cannot recreate
 * it after a confirmed deletion. Related collections are handled by the
 * server-side cascade (hard) or left untouched for the undo window (soft).
 */
async function retirePendingProfileWrites(docId) {
    if (!docId || typeof clearPendingForDocument !== 'function') return 0;
    try {
        const removed = await clearPendingForDocument(usersRef, docId);
        return Number.isInteger(removed) ? removed : 0;
    } catch (e) {
        console.warn('[Deletion] pending-write cleanup failed:', e && e.message);
        return 0;
    }
}

/**
 * Count the related records a hard deletion would remove, split into
 * provably-owned records and records that only look related. The modal shows
 * these numbers so the operator knows the blast radius before confirming.
 */
async function collectStudentRelatedRecords(profile) {
    const summary = { owned: {}, ambiguous: {}, ownedTotal: 0, ambiguousTotal: 0 };
    const refs = [
        activityRef, notificationsRef, passwordRequestsRef, evidenceRef, tutorialProgressRef
    ];
    for (const ref of refs) {
        if (typeof ref === 'undefined') continue;
        try {
            const rows = await dbGetAll(ref);
            if (!Array.isArray(rows) || rows.length === 0) continue;
            const owned = rows.filter(row => recordOwnedByProfile(row, profile)).length;
            const ambiguous = rows.filter(row => recordAmbiguousForProfile(row, profile)).length;
            if (owned) { summary.owned[ref] = owned; summary.ownedTotal += owned; }
            if (ambiguous) { summary.ambiguous[ref] = ambiguous; summary.ambiguousTotal += ambiguous; }
        } catch (e) {
            console.info('[Deletion] related-record scan skipped for', ref, e && e.message);
        }
    }
    return summary;
}

// ── Server path ───────────────────────────────────────────────────

/** True when a callable function could answer right now. */
function deletionServerAvailable() {
    const hasFunctions = typeof firebase !== 'undefined' && firebase && typeof firebase.functions === 'function';
    const hasSession = typeof cloudUid === 'function' && !!cloudUid();
    return hasFunctions && hasSession;
}

async function invokeDeleteStudentCallable(payload) {
    if (typeof firebase === 'undefined' || !firebase || typeof firebase.functions !== 'function') {
        throw Object.assign(new Error('Cloud Functions SDK is unavailable'), { code: 'unavailable' });
    }
    // The compat SDK returns a callable *function*, not an object with an
    // `invoke` method. Anything else means the SDK shape changed or the
    // callable is not wired up, which is the documented fallback case.
    const callable = firebase.functions().httpsCallable(STUDENT_DELETION.CALLABLE);
    if (typeof callable !== 'function') {
        throw Object.assign(new Error('Callable is not available'), { code: 'failed-precondition' });
    }
    const response = await callable(payload);
    const data = (response && response.data) || {};
    if (data.ok !== true) {
        throw Object.assign(new Error(data.message || 'The deletion service refused the request.'), {
            code: data.code || 'failed-precondition',
            deletionCode: data.code || 'failed-precondition'
        });
    }
    return data;
}

// ── Entry point ───────────────────────────────────────────────────

/**
 * Delete one student account.
 *
 * @param {string} targetDocId  Firestore document id of the profile.
 * @param {object} [options]
 * @param {string} [options.confirmUsername]  Username the operator retyped.
 * @param {object} [options.caller]           Defaults to the signed-in profile.
 * @returns {Promise<{ok: boolean, mode?: string, code?: string, message?: string}>}
 *   Never resolves `ok: true` for work that was not confirmed.
 */
async function deleteStudentProfile(targetDocId, options = {}) {
    const docId = String(targetDocId || '').trim();
    if (!docId) {
        return { ok: false, code: 'invalid-target', message: 'This student record has no document id, so it cannot be deleted safely.' };
    }
    const caller = options.caller || (typeof currentUser !== 'undefined' ? currentUser : null);
    const callerDocId = (caller && (caller._docId || caller.id)) || '';
    const step = (name, extra) => console.info('[Deletion]', name, Object.assign({ docId }, extra || {}));

    let profile = null;
    try {
        const users = (typeof cachedUsers !== 'undefined' && cachedUsers.length)
            ? cachedUsers
            : await dbGetAll(usersRef);
        profile = (users || []).find(u => String(u._docId || u.id) === docId) || null;
        if (!profile) profile = await dbGet(usersRef, docId);
    } catch (e) {
        console.warn('[Deletion] profile lookup failed:', e && e.message);
    }

    const verdict = authorizeStudentDeletion({ callerRole: caller && caller.role, callerDocId, target: profile, targetDocId: docId });
    if (!verdict.ok) {
        step('rejected', { code: verdict.code });
        return { ok: false, code: verdict.code, message: verdict.message };
    }

    const confirmUsername = String(options.confirmUsername || '').trim();
    if (!confirmUsername) {
        return { ok: false, code: 'confirmation-missing', message: 'Type the student username to confirm the deletion.' };
    }
    if (!confirmUsernameMatches(profile, confirmUsername)) {
        return { ok: false, code: 'confirmation-mismatch', message: 'The username does not match. Type it exactly as shown.' };
    }

    // Deletion is a destructive, non-idempotent request: never queue it.
    if (typeof requireOnline === 'function') {
        const gate = requireOnline();
        if (!gate.ok) return { ok: false, code: 'unavailable', message: gate.message };
    }

    const related = await collectStudentRelatedRecords(profile);
    const requestId = 'del_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

    if (deletionServerAvailable()) {
        step('server-delete', { related: related.ownedTotal });
        try {
            const data = await invokeDeleteStudentCallable({
                studentDocId: docId,
                confirmUsername,
                requestId
            });
            await reconcileDeletedProfile(docId, profile, {
                mode: STUDENT_DELETION.HARD,
                operationId: data.operationId || requestId
            });
            step('confirmed', { operationId: data.operationId });
            return {
                ok: true,
                mode: STUDENT_DELETION.HARD,
                operationId: data.operationId || requestId,
                profile,
                related,
                removed: data.removed || {},
                message: `${profile.fullName} and all of their records were permanently deleted.`
            };
        } catch (err) {
            const described = describeDeletionError(err);
            // A refused/unavailable server path is the documented signal to
            // fall back, not a reason to claim success.
            if (described.code === 'failed-precondition' || described.code === 'unauthenticated' || described.code === 'unavailable') {
                console.warn('[Deletion] server path unavailable, using soft delete:', described.code);
            } else {
                step('failed', described);
                return { ok: false, code: described.code, message: described.message };
            }
        }
    } else {
        step('soft-delete', { reason: deletionServerAvailable() ? 'no-session' : 'no-functions-sdk' });
    }

    // ── Soft delete ───────────────────────────────────────────────
    // Nothing is erased. The profile is deactivated in place so the account
    // stops working immediately and the change can be undone.
    try {
        await dbUpdate(usersRef, docId, {
            // Preserved so `undoStudentDeletion` restores the exact prior state
            // instead of assuming every account was active.
            statusBeforeDeletion: (profile && profile.status) || 'active',
            status: STUDENT_DELETION.STATUS,
            deletionMode: STUDENT_DELETION.SOFT,
            deletedAt: new Date().toISOString(),
            deletedBy: callerDocId || null,
            deletedByName: (caller && caller.fullName) || null,
            deletionRequestId: requestId
        });
    } catch (err) {
        const described = describeDeletionError(err);
        step('failed', described);
        return { ok: false, code: described.code, message: described.message };
    }

    markDeletionTombstone(docId, {
        mode: STUDENT_DELETION.SOFT,
        operationId: requestId,
        fullName: profile.fullName,
        username: profile.username,
        studentNumber: profile.studentNumber
    });
    if (typeof logAuditAction === 'function') {
        await logAuditAction({
            action: 'student.soft-delete',
            studentId: docId,
            studentName: profile.fullName,
            username: profile.username,
            instructorId: callerDocId,
            instructorName: (caller && caller.fullName) || null,
            requestId
        });
    }
    step('confirmed-soft', { requestId });

    // Release the username claim. The account still exists but is deactivated,
    // so the name must not stay reserved; undoStudentDeletion re-takes it. A
    // stale claim would otherwise block that username for every future account
    // while no profile exists to explain why.
    if (profile && profile.username && typeof releaseUsernameClaim === 'function') {
        try {
            const released = await releaseUsernameClaim(profile.username, docId);
            step('username-claim-released', { released });
        } catch (e) {
            step('username-claim-release-failed', { error: (e && e.message) || String(e) });
        }
    }

    return {
        ok: true,
        mode: STUDENT_DELETION.SOFT,
        operationId: requestId,
        profile,
        related,
        authRevoked: false,
        message: `${profile.fullName} was deactivated. Their sign-in account was NOT revoked.`
    };
}

/**
 * Undo a soft delete inside the confirmation window. A hard deletion is
 * irreversible by design and is refused here.
 */
async function undoStudentDeletion(targetDocId) {
    const docId = String(targetDocId || '');
    const tombstone = deletionTombstone(docId);
    if (!tombstone) {
        return { ok: false, code: 'not-found', message: 'There is nothing to undo for this student.' };
    }
    if (tombstone.mode === STUDENT_DELETION.HARD) {
        return { ok: false, code: 'irreversible', message: 'A permanent deletion cannot be undone from here.' };
    }
    if (typeof requireOnline === 'function') {
        const gate = requireOnline();
        if (!gate.ok) return { ok: false, code: 'unavailable', message: gate.message };
    }
    try {
        const profile = await dbGet(usersRef, docId);
        // Re-take the username claim released by the soft delete. Without this
        // the restored account and any new account could hold the same username.
        if (profile && profile.username && typeof claimUsername === 'function') {
            try {
                await claimUsername(profile.username, docId);
            } catch (claimErr) {
                return {
                    ok: false,
                    code: (claimErr && claimErr.code) || 'username-claim-conflict',
                    message: 'Restored, but this username is now held by another account: '
                        + ((claimErr && claimErr.message) || 'rename the account before it is used again.')
                };
            }
        }
        await dbUpdate(usersRef, docId, {
            status: (profile && profile.statusBeforeDeletion) || 'active',
            statusBeforeDeletion: null,
            deletionMode: null,
            deletedAt: null,
            deletedBy: null,
            deletedByName: null,
            deletionRequestId: null
        });
        clearDeletionTombstone(docId);
        return { ok: true, message: 'The student account was restored.' };
    } catch (err) {
        const described = describeDeletionError(err);
        return { ok: false, code: described.code, message: described.message };
    }
}

/** Shared post-deletion bookkeeping for both modes. */
async function reconcileDeletedProfile(docId, profile, meta) {
    markDeletionTombstone(docId, {
        mode: meta.mode,
        operationId: meta.operationId,
        fullName: profile && profile.fullName,
        username: profile && profile.username,
        studentNumber: profile && profile.studentNumber
    });
    if (meta.mode === STUDENT_DELETION.HARD) {
        await retirePendingProfileWrites(docId);
        await purgeLocalProfile(docId);
    }
}

// Loaded as a classic script in the browser, so every function above is also a
// global. Node tests require() this file directly to get the same helpers.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        STUDENT_DELETION,
        confirmUsernameMatches,
        isDeletedProfile,
        canonicalProfileIdentifiers,
        recordOwnedByProfile,
        recordAmbiguousForProfile,
        authorizeStudentDeletion,
        describeDeletionError,
        deleteStudentProfile,
        undoStudentDeletion
    };
}