/* ============================================================
   PSEUDOPY — STUDENT DELETION (pure decision logic)
   No firebase-admin imports: unit-testable with plain node:test.
   Mirrors src/database/student-deletion.js; the server copy is
   authoritative because the Admin SDK bypasses Firestore rules.
   ============================================================ */

/** Related collections that can hold records for one student. */
const RELATED_REFS = [
    'pseudopy_activity',
    'pseudopy_notifications',
    'pseudopy_passwordRequests',
    'pseudopy_evidence',
    'pseudopy_tutorialProgress'
];

function relatedRefsFor() {
    return RELATED_REFS.slice();
}

/** Split refs into batches below the 500-operation Firestore limit. */
function chunkRefs(refs, size = 400) {
    const list = Array.isArray(refs) ? refs : [];
    const width = Math.max(1, parseInt(size, 10) || 400);
    const chunks = [];
    for (let i = 0; i < list.length; i += width) chunks.push(list.slice(i, i + width));
    return chunks;
}

function confirmUsernameMatches(targetDoc, typed) {
    const typedValue = String(typed || '').trim();
    if (!typedValue || !targetDoc) return false;
    return typedValue === String(targetDoc.username || '');
}

/**
 * Owner-reference fields that identify a record unambiguously.
 * `username`, `email`, `studentNumber` and `student` are deliberately absent:
 * they are shared and changeable, so a match is a review item, never proof.
 */
const OWNER_FIELDS = ['studentAccountId', 'userId', 'accountId', 'studentId'];

/** Every identifier that provably refers to one profile. */
function canonicalIds(profile) {
    if (!profile) return [];
    return [profile._docId, profile.docId, profile.id, profile.uid, profile.studentId]
        .map(v => (v === undefined || v === null ? '' : String(v)))
        .filter(Boolean);
}

/**
 * Ownership test for a related record.
 *
 * `strict` requires a field whose value is one of the target's canonical ids.
 * `loose` (used only for the ambiguous counter) additionally accepts a value
 * equal to `candidateId`, the target's app account id, because older
 * documents stored the account id in `studentId` and an exact match on that is
 * still a verified reference rather than a name collision.
 */
function ownershipOf(record, profile, { candidateId = '' } = {}) {
    if (!record || typeof record !== 'object' || !profile) return { owned: false, ambiguous: false };
    const ids = new Set(canonicalIds(profile));
    if (candidateId) ids.add(String(candidateId));
    if (ids.size === 0) return { owned: false, ambiguous: false };
    let ambiguous = false;
    for (const field of OWNER_FIELDS) {
        const value = record[field];
        if (value === undefined || value === null || value === '') continue;
        if (ids.has(String(value))) return { owned: true, ambiguous: false };
        ambiguous = true;
    }
    return { owned: false, ambiguous };
}

/** True when `record` provably belongs to the target profile. */
function isOwnedBy(record, profile, options) {
    return ownershipOf(record, profile, options).owned;
}

/**
 * Decide whether a caller may permanently delete a student profile.
 *
 * Instructors may delete only students enrolled under them; admins may delete
 * any student. Staff may never delete staff, and nobody may delete themselves.
 *
 * `callerDoc` is the caller's OWN account document. Because legacy account ids
 * are app-generated (`u2`), it is resolved from `request.auth.uid` by the
 * caller, never assumed to be the uid.
 */
function authorizeDeletion({ callerClaimRole, callerDoc, callerDocId, targetDoc, targetDocId } = {}) {
    const docRole = String((callerDoc && callerDoc.role) || '').toLowerCase();
    const claimRole = String(callerClaimRole || '').toLowerCase();
    const role = docRole || claimRole;

    if (role !== 'instructor' && role !== 'admin') {
        return { ok: false, code: 'not-authorized', message: 'Only instructors and administrators can delete student accounts.' };
    }
    const targetRole = String((targetDoc && targetDoc.role) || '').toLowerCase();
    if (targetRole !== 'student') {
        return { ok: false, code: 'invalid-target', message: 'Only student accounts can be deleted from Manage Students.' };
    }
    // Self-deletion is refused for every identifier on EITHER document, so a
    // stale or re-pointed uid binding cannot be used to delete the operator.
    const targetIds = canonicalIds(targetDoc);
    const callerIds = canonicalIds(Object.assign({ _docId: callerDocId }, callerDoc));
    const selfDelete = callerIds.some(id => targetIds.indexOf(id) !== -1)
        || (callerDocId && targetIds.indexOf(String(callerDocId)) !== -1);
    if (selfDelete) {
        return { ok: false, code: 'self-delete', message: 'You cannot delete your own account.' };
    }
    if (role === 'instructor') {
        const owner = String((targetDoc && targetDoc.instructorId) || '');
        // The student's `instructorId` is an app account id. Compare against
        // every canonical id of the caller's own document so an instructor
        // bound by uid is still recognised as the owner.
        if (!owner || callerIds.indexOf(owner) === -1) {
            return { ok: false, code: 'not-owner', message: 'This student is not enrolled in your class.' };
        }
    }
    return { ok: true };
}

module.exports = {
    RELATED_REFS,
    OWNER_FIELDS,
    relatedRefsFor,
    chunkRefs,
    confirmUsernameMatches,
    canonicalIds,
    ownershipOf,
    isOwnedBy,
    authorizeDeletion
};