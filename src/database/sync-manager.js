/* ============================================================
   SYNCHRONIZATION COORDINATOR
   Replays the durable offline mutation queue whenever connectivity
   returns, with a lock, bounded retries and deterministic order.

   Connectivity model:
   - Platform events (online/pageshow/visibilitychange) are hints only.
   - Real connectivity is proven by actual Firestore operations:
     a successful op marks Firestore reachable; a transient failure
     marks it unreachable. requireOnline() blocks security-sensitive
     writes until Firestore is genuinely reachable.
   ============================================================ */

const SYNC_MAX_ATTEMPTS = 3;
const SYNC_BACKOFF_MS = [1500, 4000, 10000];
const ONLINE_REQUIRED_MESSAGE = 'This action requires an internet connection.';

let syncInProgress = false;
// Optimistic at boot; only corrected by real Firestore operations (or an
// explicit navigator.onLine === false hint). Never treated as proof of
// connectivity on its own.
let firestoreReachable = true;

/** Normalize errors into a stable taxonomy (never thrown). */
function classifyDbError(err) {
    if (!err) return { category: 'UNKNOWN', transient: false, message: 'Unknown database error' };
    const message = err && err.message ? String(err.message) : String(err);
    const code = String((err && (err.code || err.name)) || '').toLowerCase();
    const haystack = code + ' ' + message;

    if (err.name === 'FirestoreUnavailable') return { category: 'FIRESTORE_UNAVAILABLE', transient: true, message };
    if (/timed out after|deadline-exceeded|deadline_exceeded|timeout/.test(haystack)) return { category: 'TIMEOUT', transient: true, message };
    if (/unavailable/.test(code)) return { category: 'FIRESTORE_UNAVAILABLE', transient: true, message };
    if (/offline|cannot reach|networkerror|failed to fetch|typeerror/i.test(haystack)) return { category: 'OFFLINE', transient: true, message };
    if (/quota|quotaexceeded|resource-exhausted|resource_exhausted/.test(haystack)) return { category: 'QUOTA', transient: false, message };
    if (/permission-denied|permission_denied|unauthenticated/.test(haystack)) return { category: 'PERMISSION_DENIED', transient: false, message };
    if (/invalid-argument|invalid_argument|not-found|not_found|failed-precondition|failed_precondition|invalid data/.test(haystack)) return { category: 'INVALID_DATA', transient: false, message };
    if (/aborted|conflict/.test(haystack)) return { category: 'CONFLICT', transient: false, message };
    return { category: 'UNKNOWN', transient: false, message };
}

function isTransientDbError(err) {
    return classifyDbError(err).transient;
}

function markFirestoreReachable(reachable) {
    firestoreReachable = Boolean(reachable);
}

function isFirestoreReachable() {
    return firestoreReachable;
}

/**
 * Gate for security-sensitive writes. Returns { ok: true } only when Firestore
 * is genuinely reachable; otherwise a blocked result so the caller can show
 * "This action requires an internet connection." instead of queuing the action.
 */
function requireOnline() {
    if (typeof firestoreReady !== 'function' || !firestoreReady()) {
        return { ok: false, blocked: true, reason: 'online', message: ONLINE_REQUIRED_MESSAGE };
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return { ok: false, blocked: true, reason: 'online', message: ONLINE_REQUIRED_MESSAGE };
    }
    if (firestoreReachable === false) {
        return { ok: false, blocked: true, reason: 'reachability', message: ONLINE_REQUIRED_MESSAGE };
    }
    return { ok: true };
}

function scheduleSyncRetry(mutationId, attempt) {
    if (typeof setTimeout !== 'function') return;
    const index = Math.min(Math.max(attempt - 1, 0), SYNC_BACKOFF_MS.length - 1);
    const delay = SYNC_BACKOFF_MS[index] || SYNC_BACKOFF_MS[SYNC_BACKOFF_MS.length - 1];
    setTimeout(function () {
        syncOneMutation(mutationId).catch(function () { /* bounded retry, never throws */ });
    }, delay);
}

/**
 * Replay a single queued mutation. idempotent (fixed documentId); bounded
 * retries (SYNC_MAX_ATTEMPTS) then FAILED. Transient failures re-queue with
 * backoff; permanent failures stay FAILED and are never silently discarded.
 * Returns true (synced), false (still pending / failed) or null (retired).
 */
async function trySyncMutation(mutation) {
    if (mutation.attempts >= SYNC_MAX_ATTEMPTS) return null;
    const attempt = (mutation.attempts || 0) + 1;
    await updateMutationStatus(mutation.mutationId, MUTATION_STATUS.SYNCING, null, attempt);
    try {
        const ref = mutation.collection;
        const docId = mutation.documentId;
        if (mutation.operation === MUTATION_OP_DELETE) {
            if (firestoreReady()) await withFirestoreTimeout(firestore.collection(ref).doc(docId).delete());
        } else {
            const payload = mutation.payload || {};
            if (mutation.operation === MUTATION_OP_UPDATE) {
                await withFirestoreTimeout(firestore.collection(ref).doc(docId).set(payload, { merge: true }));
            } else {
                await withFirestoreTimeout(firestore.collection(ref).doc(docId).set(payload));
            }
        }
        markFirestoreReachable(true);
        await removeSyncedMutation(mutation.mutationId);
        return true;
    } catch (err) {
        const classification = classifyDbError(err);
        if (!classification.transient) {
            await updateMutationStatus(mutation.mutationId, MUTATION_STATUS.FAILED, classification.message, attempt);
            markFirestoreReachable(firestoreReady());
            return false;
        }
        markFirestoreReachable(false);
        if (attempt >= SYNC_MAX_ATTEMPTS) {
            await updateMutationStatus(mutation.mutationId, MUTATION_STATUS.FAILED, 'Sync retry limit reached: ' + classification.message, attempt);
            return false;
        }
        await updateMutationStatus(mutation.mutationId, MUTATION_STATUS.PENDING, classification.message, attempt);
        scheduleSyncRetry(mutation.mutationId, attempt);
        return false;
    }
}

/** Single-mutation sync used by backoff timers; respects the global lock. */
async function syncOneMutation(mutationId) {
    if (!firestoreReady()) return false;
    if (syncInProgress) {
        if (typeof setTimeout === 'function') setTimeout(function () {
            syncOneMutation(mutationId).catch(function () {});
        }, 150);
        return false;
    }
    const records = await listAllMutations();
    const mutation = records.find(m => m.mutationId === mutationId);
    if (!mutation) return false;
    if (mutation.status !== MUTATION_STATUS.PENDING && mutation.status !== MUTATION_STATUS.SYNCING) return false;
    if (mutation.attempts >= SYNC_MAX_ATTEMPTS) return false;
    syncInProgress = true;
    try {
        return await trySyncMutation(mutation);
    } finally {
        syncInProgress = false;
    }
}

/**
 * Drain the queue. Application-driven (never depends on Background Sync):
 * returns immediately if a sync is already running (lock) or Firestore is not
 * ready; otherwise replays PENDING/SYNCING mutations in createdAt order.
 */
async function syncNow(reason) {
    if (syncInProgress) return { started: false, reason };
    if (typeof firestoreReady !== 'function' || !firestoreReady()) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) markFirestoreReachable(false);
        return { started: false, reason };
    }
    syncInProgress = true;
    let synced = 0, failed = 0, skipped = 0;
    try {
        const records = await listAllMutations();
        const queue = records.filter(m => m.status === MUTATION_STATUS.PENDING || m.status === MUTATION_STATUS.SYNCING);
        for (const mutation of queue) {
            const outcome = await trySyncMutation(mutation);
            if (outcome === true) synced++;
            else if (outcome === false) failed++;
            else skipped++;
        }
    } finally {
        syncInProgress = false;
    }
    if (synced > 0) console.info('[Sync] Processed ' + synced + ' queued mutation(s).');
    return { started: true, synced, failed, skipped, reason };
}

/** Register application-driven sync triggers (registered once at boot). */
function initSyncCoordinator() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) markFirestoreReachable(false);
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('online', function () {
            markFirestoreReachable(true);
            syncNow('online');
        });
        window.addEventListener('pageshow', function () {
            if (typeof navigator === 'undefined' || navigator.onLine !== false) syncNow('pageshow');
        });
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden && (typeof navigator === 'undefined' || navigator.onLine !== false)) syncNow('visibility');
        });
    }
    syncNow('startup');
}

/** Diagnostics surface for tests and developer tools. */
async function getSyncState() {
    const mutations = await listAllMutations();
    return {
        pending: mutations.filter(m => m.status === MUTATION_STATUS.PENDING).length,
        syncing: mutations.filter(m => m.status === MUTATION_STATUS.SYNCING).length,
        failed: mutations.filter(m => m.status === MUTATION_STATUS.FAILED).length,
        queue: mutations,
        reachable: firestoreReachable,
        syncInProgress
    };
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSyncCoordinator);
    else initSyncCoordinator();
} else if (typeof window !== 'undefined') {
    initSyncCoordinator();
}