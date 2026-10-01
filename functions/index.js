/* ============================================================
   PSEUDOPY — STUDENT DELETION (Cloud Function)

   Authoritative, authorized, audited deletion of one student.

   Requires a Firebase Auth session. The Admin SDK bypasses Firestore
   security rules, which is exactly why the checks in lib/deletion.js
   are the real security boundary for this operation — the client-side
   copy of these rules only avoids pointless round trips.

   Design notes that are not obvious from the code below:

   • The caller's own profile is RESOLVED from `request.auth.uid`,
     never assumed to be the uid. Legacy account documents are keyed by
     app-generated ids (`u2`), so `pseudopy_users/{uid}` usually does
     not exist.

   • The operation is journaled as `in-progress` BEFORE anything is
     erased, with the full list of documents to remove. A retry reads
     that journal and resumes, so a mid-flight crash cannot double
     delete or leave related records behind. Individual deletes are
     idempotent, so replaying the plan is safe.

   • A tombstone in `pseudopy_deletedProfiles` is written last and is
     what actually prevents resurrection: a stale client write can no
     longer recreate the account document, because `firestore.rules`
     refuses a create whose `_docId` has a tombstone.
   ============================================================ */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const {
    authorizeDeletion,
    chunkRefs,
    relatedRefsFor,
    confirmUsernameMatches,
    ownershipOf,
    canonicalIds
} = require('./lib/deletion');

initializeApp();

const USERS = 'pseudopy_users';
const AUDIT = 'pseudopy_auditLog';
const DELETION_OPS = 'pseudopy_deletionOps';
const TOMBSTONES = 'pseudopy_deletedProfiles';

/** Firestore caps a batch at 500 operations; stay well below it. */
const BATCH_LIMIT = 400;

/** How long a partially-applied operation stays resumable. */
const OP_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Resolve the signed-in principal's own account document.
 *
 * New accounts may be keyed by uid directly; every existing account is keyed
 * by an app-generated id and carries the auth uid in its `uid` field. Both
 * shapes are accepted, and a caller with no profile document at all is
 * refused rather than trusted.
 */
async function resolveCaller(db, auth) {
    const direct = await db.collection(USERS).doc(auth.uid).get();
    if (direct.exists) return { docId: direct.id, data: direct.data() || {} };

    const byUid = await db.collection(USERS).where('uid', '==', auth.uid).limit(1).get();
    if (!byUid.empty) return { docId: byUid.docs[0].id, data: byUid.docs[0].data() || {} };

    return null;
}

/** Serialize a batch plan so a retry can replay exactly the same deletes. */
function serializePlan(plan) {
    return (plan || []).map(entry => `${entry.ref}:${entry.id}`);
}

function deserializePlan(serialized) {
    return (Array.isArray(serialized) ? serialized : []).map(line => {
        const idx = String(line).indexOf(':');
        return { ref: line.slice(0, idx), id: line.slice(idx + 1) };
    }).filter(entry => entry.ref && entry.id);
}

/**
 * Delete every related document in the plan. Each batch is independent and
 * every delete is idempotent, so a retry simply re-applies what is left.
 */
async function applyPlan(db, plan, { skip = new Set() } = {}) {
    const byRef = new Map();
    for (const entry of plan) {
        if (skip.has(`${entry.ref}:${entry.id}`)) continue;
        if (!byRef.has(entry.ref)) byRef.set(entry.ref, []);
        byRef.get(entry.ref).push(entry);
    }

    const removed = {};
    for (const [refName, entries] of byRef) {
        const refs = entries.map(e => db.collection(refName).doc(e.id));
        for (const batch of chunkRefs(refs, BATCH_LIMIT)) {
            const batchRef = db.batch();
            for (const docRef of batch) batchRef.delete(docRef);
            await batchRef.commit();
        }
        if (refs.length) {
            removed[refName] = refs.length;
            logger.info('cascade removed', { refName, count: refs.length });
        }
    }
    return removed;
}

exports.deleteStudentAccount = onCall(async (request) => {
    // ── 1. Identity ────────────────────────────────────────────
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Sign in to Firebase before deleting a student account.');
    }
    const claims = request.auth.token || {};

    const data = request.data || {};
    const studentDocId = String(data.studentDocId || '').trim();
    const confirmUsername = String(data.confirmUsername || '').trim();
    const requestId = String(data.requestId || '').trim() || `req_${Date.now()}`;

    if (!studentDocId) {
        throw new HttpsError('invalid-argument', 'A student document id is required.');
    }
    if (!confirmUsername) {
        throw new HttpsError('invalid-argument', 'Type the student username to confirm the deletion.');
    }

    const db = getFirestore();

    const caller = await resolveCaller(db, request.auth);
    if (!caller) {
        throw new HttpsError('failed-precondition', 'Your instructor account could not be verified. Sign in again.');
    }

    const targetRef = db.collection(USERS).doc(studentDocId);
    const targetSnap = await targetRef.get();
    const targetDoc = targetSnap.exists ? Object.assign({ _docId: targetSnap.id }, targetSnap.data()) : null;

    // A previous run may have completed the profile delete and then failed
    // before journaling. Replaying is safe and must stay possible, so the
    // not-found check is skipped when this exact request already has a journal.
    const opId = `del_${studentDocId}_${requestId}`;
    const opRef = db.collection(DELETION_OPS).doc(opId);
    const opSnap = await opRef.get();
    const op = opSnap.exists ? (opSnap.data() || {}) : null;

    if (op && op.status === 'completed') {
        return Object.assign({ ok: true, mode: 'hard', replayed: true }, op);
    }

    if (!targetDoc) {
        if (op && op.status === 'in-progress') {
            logger.warn('student.delete resumed after target disappeared', { requestId, opId });
        } else {
            throw new HttpsError('not-found', 'Student not found. Refresh the list and try again.');
        }
    }

    // ── 2. Authorization ───────────────────────────────────────
    if (targetDoc) {
        const verdict = authorizeDeletion({
            callerClaimRole: claims.role,
            callerDoc: caller.data,
            callerDocId: caller.docId,
            targetDoc,
            targetDocId: studentDocId
        });
        if (!verdict.ok) {
            logger.warn('student.delete refused', { requestId, code: verdict.code, caller: caller.docId });
            throw new HttpsError(
                verdict.code === 'not-authorized' ? 'permission-denied' : 'failed-precondition',
                verdict.message
            );
        }

        if (!confirmUsernameMatches(targetDoc, confirmUsername)) {
            throw new HttpsError('invalid-argument', 'The username does not match. Type it exactly as shown.');
        }
    }

    logger.info('student.delete start', { requestId, opId, target: studentDocId });

    // ── 3. Journal the intent before erasing anything ──────────
    // `in-progress` is written first so a crash mid-cascade is resumable, and
    // it fences client writes for the duration of the cascade.
    if (!op || op.status !== 'in-progress') {
        await targetRef.set({
            deletionState: 'in-progress',
            deletionRequestId: requestId,
            deletionStartedAt: new Date().toISOString(),
            deletionByUid: String(request.auth.uid)
        }, { merge: true });
    }

    const resumedPlan = op ? deserializePlan(op.plan) : null;

    // ── 4. Cascade ─────────────────────────────────────────────
    let plan = resumedPlan;
    let ambiguous = 0;

    if (!plan) {
        plan = [];
        for (const refName of relatedRefsFor()) {
            let snap;
            try {
                snap = await db.collection(refName).get();
            } catch (err) {
                logger.error('cascade read failed', { refName, error: String(err && err.message) });
                // Nothing has been erased yet, so this is a clean failure and
                // the journal is left resumable.
                await opRef.set({
                    status: 'blocked', requestId, opId,
                    blockedReason: `unreadable:${refName}`,
                    studentId: studentDocId,
                    at: FieldValue.serverTimestamp()
                }, { merge: true });
                throw new HttpsError('internal', `Could not read ${refName}; nothing was deleted.`);
            }
            for (const doc of snap.docs) {
                const verdict = ownershipOf(doc.data() || {}, targetDoc || { _docId: studentDocId }, { candidateId: studentDocId });
                if (verdict.owned) plan.push({ ref: refName, id: doc.id });
                else if (verdict.ambiguous) ambiguous += 1;
            }
        }
        ambiguous += Number((op && op.ambiguousRecordsFlagged) || 0);
        await opRef.set({
            status: 'in-progress',
            requestId,
            opId,
            studentId: studentDocId,
            studentName: (targetDoc && targetDoc.fullName) || null,
            username: (targetDoc && targetDoc.username) || null,
            deletedByUid: String(request.auth.uid),
            instructorId: caller.docId,
            plan: serializePlan(plan),
            ambiguousRecordsFlagged: ambiguous,
            startedAt: FieldValue.serverTimestamp(),
            expiresAt: new Date(Date.now() + OP_TTL_MS).toISOString()
        }, { merge: true });
    } else {
        logger.info('student.delete resuming', { requestId, opId, planned: plan.length });
    }

    const removed = await applyPlan(db, plan);

    // ── 5. Auth account ────────────────────────────────────────
    // Only a uid bound by the profile document is deleted. Never trust an
    // email: a shared address must not revoke somebody else's account.
    const targetAuthUid = String((targetDoc && targetDoc.uid) || '').trim();
    let authDeleted = Boolean(op && op.authAccountDeleted);
    if (targetAuthUid && !authDeleted) {
        try {
            await getAuth().deleteUser(targetAuthUid);
            authDeleted = true;
            logger.info('auth.delete', { target: studentDocId });
        } catch (err) {
            if (err && err.code === 'auth/user-not-found') {
                authDeleted = false;
            } else {
                logger.error('auth.delete failed', { target: studentDocId, error: String(err && err.message) });
                // The cascade already ran. Say so plainly and leave the
                // operation resumable instead of implying nothing happened.
                await opRef.set({
                    status: 'auth-failed',
                    authError: String(err && err.message || err),
                    at: FieldValue.serverTimestamp()
                }, { merge: true });
                throw new HttpsError('internal',
                    'The sign-in account could not be revoked, so the deletion was NOT completed. '
                    + 'The student\'s submissions have already been removed; retry to finish removing the login.');
            }
        }
    }

    // ── 6. Profile ─────────────────────────────────────────────
    await targetRef.delete();

    // ── 7. Tombstone ───────────────────────────────────────────
    // Written last: it is the guard that stops a stale offline queue from
    // recreating the account document. `firestore.rules` denies any client
    // create whose `_docId` matches a tombstone.
    await db.collection(TOMBSTONES).doc(studentDocId).set({
        _docId: studentDocId,
        studentDocId,
        canonicalIds: canonicalIds(targetDoc || { _docId: studentDocId }),
        authUid: targetAuthUid || null,
        authAccountDeleted: authDeleted,
        deletedByUid: String(request.auth.uid),
        instructorId: caller.docId,
        operationId: opId,
        requestId,
        deletedAt: FieldValue.serverTimestamp()
    });

    // ── 8. Audit (server-written, cannot be edited by a client) ─
    const auditId = `al_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    await db.collection(AUDIT).doc(auditId).set({
        _docId: auditId,
        action: 'student.delete',
        mode: 'hard',
        studentId: studentDocId,
        studentName: (targetDoc && targetDoc.fullName) || null,
        username: (targetDoc && targetDoc.username) || null,
        studentNumber: (targetDoc && targetDoc.studentNumber) || null,
        instructorId: caller.docId,
        instructorName: caller.data.fullName || null,
        deletedByUid: String(request.auth.uid),
        requestId,
        operationId: opId,
        removed,
        authAccountDeleted: authDeleted,
        ambiguousRecordsFlagged: ambiguous,
        ip: request.rawRequest ? String(request.rawRequest.ip || '') : '',
        userAgent: request.rawRequest ? String(request.rawRequest.headers['user-agent'] || '') : '',
        at: FieldValue.serverTimestamp()
    });

    const result = {
        ok: true,
        mode: 'hard',
        operationId: opId,
        auditId,
        removed,
        authAccountDeleted: authDeleted,
        ambiguousRecordsFlagged: ambiguous,
        status: 'completed'
    };
    await opRef.set(Object.assign({}, result, { completedAt: FieldValue.serverTimestamp() }));

    logger.info('student.delete completed', { requestId, opId, removed });
    return result;
});