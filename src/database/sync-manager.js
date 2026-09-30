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
// Capped exponential backoff: base * 2^(attempt-1), clamped to SYNC_BACKOFF_MAX_MS.
// A flat lookup table left dead entries behind once the attempt cap was reached,
// and could not express "keep backing off" for a long outage.
const SYNC_BACKOFF_BASE_MS = 1500;
const SYNC_BACKOFF_MAX_MS = 60000;
const ONLINE_REQUIRED_MESSAGE = 'This action requires an internet connection.';

/**
 * Categories that can never succeed on retry. Retrying them loops forever and
 * presents a permanent policy failure (bad Firestore rules, missing auth) as a
 * transient connectivity problem, which is what made the "Reconnecting" banner
 * un-dismissable.
 */
const PERMANENT_DB_CATEGORIES = ['PERMISSION_DENIED', 'INVALID_DATA', 'CONFLICT', 'QUOTA', 'PERMANENT'];

let syncInProgress = false;
// Optimistic at boot; only corrected by real Firestore operations (or an
// explicit navigator.onLine === false hint). Never treated as proof of
// connectivity on its own.
let firestoreReachable = true;

/** Error text markers that mean "the server answered, and the answer is no". */
const PERMISSION_DENIED_PATTERN = /permission[-_]denied|permission[-_]not[-_]granted|missing or insufficient permissions|unauthenticated|not authorized|unauthorized|insufficient permission/;
const INVALID_DATA_PATTERN = /invalid[-_]argument|invalid[-_]data|not[-_]found|failed[-_]precondition/;
const CONFLICT_PATTERN = /aborted|conflict/;
const QUOTA_PATTERN = /quota|resource[-_]exhausted/;
const TRANSIENT_PATTERN = /timed out after|deadline[-_]exceeded|timeout|unavailable|offline|cannot reach|networkerror|network[-_]error|failed to fetch|load failed/;

/**
 * Walk an error's cause chain. Retry wrappers (FirestoreUnavailableError) hide
 * the real cause in `.cause`; classifying only the wrapper turned every
 * permission-denied into a transient failure.
 */
function dbErrorChain(err, depth) {
    const chain = [];
    const seen = [];
    let current = err;
    while (current && chain.length < 8) {
        if (seen.indexOf(current) !== -1) break; // cycle guard
        seen.push(current);
        chain.push(current);
        current = current.cause || current.originalError || current.error || null;
        if (depth !== undefined && chain.length >= depth) break;
    }
    return chain;
}

function dbErrorText(err) {
    const message = err && err.message ? String(err.message) : String(err);
    const code = String((err && (err.code || err.name)) || '').toLowerCase();
    return code + ' ' + message;
}

/** Normalize errors into a stable taxonomy (never thrown). */
function classifyDbError(err) {
    if (!err) return { category: 'UNKNOWN', transient: false, message: 'Unknown database error' };

    const chain = dbErrorChain(err);
    const texts = chain.map(dbErrorText);
    const haystack = texts.join(' | ');
    const message = err && err.message ? String(err.message) : String(err);

    // Permanent verdicts win over the wrapper they arrived in. Firestore's
    // permission errors are always permanent for this app: no amount of
    // retrying changes a ruleset or a missing session.
    if (PERMISSION_DENIED_PATTERN.test(haystack)) return { category: 'PERMISSION_DENIED', transient: false, message };
    if (QUOTA_PATTERN.test(haystack)) return { category: 'QUOTA', transient: false, message };
    if (INVALID_DATA_PATTERN.test(haystack)) return { category: 'INVALID_DATA', transient: false, message };
    if (CONFLICT_PATTERN.test(haystack)) return { category: 'CONFLICT', transient: false, message };

    // Only now consider the wrapper and the transient markers.
    const outerCode = String((err && (err.code || err.name)) || '').toLowerCase();
    const outerText = dbErrorText(err);
    if (err.name === 'FirestoreUnavailable' || /unavailable/.test(outerCode)) {
        return { category: 'FIRESTORE_UNAVAILABLE', transient: true, message };
    }
    if (TRANSIENT_PATTERN.test(haystack)) return { category: 'TIMEOUT', transient: true, message };
    if (/offline|cannot reach|network[-_]?error|failed to fetch|typeerror/i.test(haystack)) return { category: 'OFFLINE', transient: true, message };
    return { category: 'UNKNOWN', transient: false, message };
}

function isTransientDbError(err) {
    return classifyDbError(err).transient;
}

/** True when retrying can never help (rules/auth/data problems). */
function isPermanentDbError(err) {
    return PERMANENT_DB_CATEGORIES.indexOf(classifyDbError(err).category) !== -1;
}

function markFirestoreReachable(reachable) {
    firestoreReachable = Boolean(reachable);
}

function isFirestoreReachable() {
    return firestoreReachable;
}

/**
 * Announce a permanent cloud-write failure to the UI layer exactly once per
 * occurrence, instead of every caller logging its own warning. The UI module
 * owns the once-per-session latch; this is only the transport.
 */
function notifyCloudSaveDenied(context, classification) {
    const hook = (typeof window !== 'undefined' && typeof window.reportCloudSaveDenied === 'function')
        ? window.reportCloudSaveDenied
        : (typeof reportCloudSaveDenied === 'function' ? reportCloudSaveDenied : null);
    if (!hook) return;
    try {
        hook(context || {}, classification || { category: 'PERMISSION_DENIED', message: '' });
    } catch (e) {
        console.warn('[Sync] Cloud-denial reporter threw:', e && e.message);
    }
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

/**
 * Capped exponential backoff with jitter. Bounded above by
 * SYNC_BACKOFF_MAX_MS so a long outage never parks a mutation behind an
 * unbounded timer.
 */
function syncBackoffDelay(attempt, randomFn) {
    const n = Math.max(1, attempt | 0);
    const raw = SYNC_BACKOFF_BASE_MS * Math.pow(2, n - 1);
    const capped = Math.min(raw, SYNC_BACKOFF_MAX_MS);
    const rand = typeof randomFn === 'function' ? randomFn() : Math.random();
    // Full jitter over the lower half keeps concurrent clients from
    // re-attempting in lockstep after a shared outage.
    return Math.max(250, Math.round(capped * (0.5 + 0.5 * Math.abs(rand % 1))));
}

function scheduleSyncRetry(mutationId, attempt) {
    if (typeof setTimeout !== 'function') return;
    setTimeout(function () {
        syncOneMutation(mutationId).catch(function () { /* bounded retry, never throws */ });
    }, syncBackoffDelay(attempt));
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
    const ref = mutation.collection;
    const docId = mutation.documentId;
    await updateMutationStatus(mutation.mutationId, MUTATION_STATUS.SYNCING, null, attempt);
    try {
        if (mutation.operation === MUTATION_OP_DELETE) {
            if (firestoreReady()) await withFirestoreTimeout(firestore.collection(ref).doc(docId).delete());
        } else {
            // Stamp ownership at REPLAY time, not enqueue time: a mutation that
            // was deferred while signed out only learns its uid later, and the
            // rules require `uid == request.auth.uid`.
            const payload = typeof withCloudOwnership === 'function'
                ? withCloudOwnership(mutation.payload)
                : (mutation.payload || {});
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
            // A denying Firestore IS reachable — the request completed and was
            // refused. Reporting it as an outage is what drove the endless
            // "Reconnecting" banner.
            //
            // Exception: an anonymous request against an auth-required ruleset.
            // That is not a lost write, it is a write waiting for a session, so
            // it goes back to PENDING and is drained on sign-in. No backoff
            // timer is scheduled, which is what keeps this from looping.
            const pendingSignIn = classification.category === 'PERMISSION_DENIED'
                && typeof cloudAuthPendingSignIn === 'function'
                && cloudAuthPendingSignIn();
            console.warn(
                `[Sync] Firestore refused ${mutation.operation} ${ref}/${docId}`
                + ` (code=${(err && err.code) || 'unknown'}, category=${classification.category})`
                + (pendingSignIn ? ' — deferred until cloud sign-in.' : `: ${classification.message}`)
            );
            if (pendingSignIn) {
                await updateMutationStatus(mutation.mutationId, MUTATION_STATUS.PENDING, classification.message, attempt);
                markFirestoreReachable(true);
                notifyCloudSaveDenied({ ref, docId, operation: mutation.operation, pendingSignIn: true }, classification);
                return false;
            }
            await updateMutationStatus(mutation.mutationId, MUTATION_STATUS.FAILED, classification.message, attempt);
            markFirestoreReachable(true);
            notifyCloudSaveDenied({ ref, docId, operation: mutation.operation }, classification);
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
    // A new cloud session is the one event that can turn previously deferred
    // (not failed) writes into successes, so drain immediately on sign-in.
    if (typeof onCloudAuthChanged === 'function' && !initSyncCoordinator.__authBound) {
        initSyncCoordinator.__authBound = true;
        onCloudAuthChanged(function (user) {
            if (!user) return;
            console.info('[Sync] Cloud session established; draining queued writes.');
            syncNow('auth');
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