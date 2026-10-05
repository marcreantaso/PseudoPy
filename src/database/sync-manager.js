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
   - While the browser reports itself offline, no background retry is
     scheduled at all: the queue is durable, so there is nothing to
     gain from polling a network the platform already says is down.
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
let activeSyncPromise = null;
let syncRetryTimer = null;
let syncPermissionBlocked = false;
const SYNC_RECOVERY_REASONS = ['startup', 'auth', 'sign-in', 'online', 'manual-retry'];
// Optimistic at boot; only corrected by real Firestore operations (or an
// explicit navigator.onLine === false hint). Never treated as proof of
// connectivity on its own.
let firestoreReachable = true;

/**
 * Announce an upload lifecycle transition. The status pill needs to
 * distinguish "actively uploading" from "queued and waiting", which
 * reachability alone cannot express. No detail is attached, so nothing
 * sensitive travels through the DOM event.
 */
function notifySyncProgress(phase, summary) {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function' || typeof CustomEvent === 'undefined') return;
    try {
        window.dispatchEvent(new CustomEvent('pseudopy:sync-progress', { detail: { phase: phase, summary: summary || null } }));
    } catch (e) { /* a UI listener must never break the transport */ }
}

/**
 * True when the browser itself reports no network.
 * Defined once in connection-status.js (loaded first) and reused here so the
 * queue and the status pill cannot disagree about what "offline" means.
 */
function isPlatformOffline() {
    if (typeof isBrowserOffline === 'function') return isBrowserOffline();
    return typeof navigator !== 'undefined' && navigator && navigator.onLine === false;
}

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

let cloudCircuitError = null;
function cloudRequestsAllowed() {
    return !cloudCircuitError && !(typeof navigator !== 'undefined' && navigator.onLine === false);
}
function recordCloudFailure(error, context) {
    const classification = classifyDbError(error);
    if (isPermanentDbError(error)) {
        cloudCircuitError = error;
        syncPermissionBlocked = true;
        notifyCloudSaveDenied(context || {}, classification);
    }
    if (classification.transient) markFirestoreReachable(false);
}
function resetCloudCircuit() {
    cloudCircuitError = null;
    syncPermissionBlocked = false;
}
function markFirestoreReachable(reachable) {
    firestoreReachable = Boolean(reachable);
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pseudopy:connection-state', {detail:{reachable:firestoreReachable}}));
    }
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
    if (firestoreReachable === false || !cloudRequestsAllowed()) {
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

/**
 * Schedule one bounded retry. Nothing is scheduled while the browser is
 * offline: the queue is durable and the `online` event is the single
 * recovery trigger, so a timer would only burn battery re-failing.
 */
function scheduleSyncRetry(mutationId, attempt) {
    if (typeof setTimeout !== 'function' || syncRetryTimer !== null) return;
    if (isPlatformOffline() || !cloudRequestsAllowed()) return;
    syncRetryTimer = setTimeout(function () {
        syncRetryTimer = null;
        syncNow('backoff').catch(function () {});
    }, syncBackoffDelay(attempt));
}

/**
 * Replay a single queued mutation. idempotent (fixed documentId); bounded
 * retries (SYNC_MAX_ATTEMPTS) then FAILED. Transient failures re-queue with
 * backoff; permanent failures stay FAILED and are never silently discarded.
 * Returns true (synced), false (still pending / failed) or null (retired).
 */
async function trySyncMutation(mutation) {
    if (!firestoreReady() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return false;
    if (mutation.attempts >= SYNC_MAX_ATTEMPTS) return null;
    // Claim the latest payload under the same queue lock used by autosave.
    if (typeof withMutationQueueLock === 'function') {
        mutation = await withMutationQueueLock(async () => {
            const fresh = (await listAllMutations()).find(r => r.mutationId === mutation.mutationId);
            if (!fresh) return null;
            await updateMutationStatus(fresh.mutationId, MUTATION_STATUS.SYNCING, null, fresh.attempts || 0);
            return fresh;
        });
        if (!mutation) return null;
    }
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
        if (typeof cloudSaveComplete === 'function') cloudSaveComplete(ref, docId);
        return true;
    } catch (err) {
        const classification = classifyDbError(err);
        if (!classification.transient) {
            const permission = classification.category === 'PERMISSION_DENIED';
            if (permission) syncPermissionBlocked = true;
            recordCloudFailure(err, { ref, docId, operation: mutation.operation });
            await updateMutationStatus(mutation.mutationId, permission ? 'blocked-permission' : MUTATION_STATUS.FAILED, classification.message, attempt);
            markFirestoreReachable(true);

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
async function syncOneMutation() {
    // Timers drain from the head, never leapfrog an earlier write to the same document.
    return syncNow('backoff');
}

function syncNow(reason) {
    if (activeSyncPromise) return (reason === 'write' || SYNC_RECOVERY_REASONS.includes(reason))
        ? activeSyncPromise.then(() => syncNow(reason)) : activeSyncPromise;
    const run = () => drainSyncQueue(reason);
    activeSyncPromise = (typeof navigator !== 'undefined' && navigator.locks
        ? navigator.locks.request('pseudopy-sync-transport', run) : Promise.resolve().then(run))
        .finally(() => { activeSyncPromise = null; });
    return activeSyncPromise;
}

async function drainSyncQueue(reason) {
    const recovery = SYNC_RECOVERY_REASONS.includes(reason);
    if (isPlatformOffline()) {
        // No network: keep every record exactly as it is and do no work.
        return { started: false, reason, offline: true };
    }
    if (recovery) resetCloudCircuit();
    if (syncPermissionBlocked || !firestoreReady()) {
        return { started: false, reason };
    }
    syncInProgress = true;
    notifySyncProgress('start', { reason });
    let synced = 0, failed = 0, skipped = 0;
    try {
        const records = await listAllMutations();
        const blockedDocuments = new Set();
        for (const mutation of records) {
            const key = JSON.stringify([mutation.collection, mutation.documentId]);
            if (blockedDocuments.has(key)) { skipped++; continue; }
            if (recovery && (mutation.status === 'blocked-permission' || mutation.status === MUTATION_STATUS.SYNCING ||
                (mutation.status === MUTATION_STATUS.FAILED && (classifyDbError(new Error(mutation.lastError)).transient || classifyDbError(new Error(mutation.lastError)).category === 'PERMISSION_DENIED')))) {
                mutation.status = MUTATION_STATUS.PENDING;
                mutation.attempts = 0;
                await updateMutationStatus(mutation.mutationId, mutation.status, null, 0);
            }
            if (mutation.status !== MUTATION_STATUS.PENDING && mutation.status !== MUTATION_STATUS.SYNCING) {
                blockedDocuments.add(key); skipped++; continue;
            }
            const outcome = await trySyncMutation(mutation);
            if (outcome === true) synced++;
            else { failed++; blockedDocuments.add(key); }
            if (syncPermissionBlocked) break;
        }
    } finally {
        syncInProgress = false;
        // Report the finished state regardless of outcome: a failed upload
        // falls back to the local pill, and a clean drain reports Synced only
        // after the count is re-read.
        notifySyncProgress('finish', { reason, synced, failed, skipped });
    }
    return { started: true, synced, failed, skipped, reason };
}

/** Register application-driven sync triggers (registered once at boot). */
function initSyncCoordinator() {
    if (initSyncCoordinator.__bound) return;
    initSyncCoordinator.__bound = true;
    if (isPlatformOffline()) markFirestoreReachable(false);
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('online', function () {
            // An `online` event is only a hint that the network returned. The
            // queue still has to upload before anything reports Synced.
            markFirestoreReachable(true);
            syncNow('online');
        });
        window.addEventListener('pageshow', function () {
            if (!isPlatformOffline()) syncNow('pageshow');
        });
        window.addEventListener('offline', function () {
            // Stop retrying immediately: any in-flight backoff timer would
            // otherwise keep waking up against a dead network.
            if (syncRetryTimer !== null) { clearTimeout(syncRetryTimer); syncRetryTimer = null; }
            markFirestoreReachable(false);
        });
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden && !isPlatformOffline()) syncNow('visibility');
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
        // Denied writes are permanently unsynced, so they are surfaced as
        // their own bucket instead of being hidden or counted as failures.
        blocked: mutations.filter(m => m.status === 'blocked-permission').length,
        queue: mutations,
        reachable: firestoreReachable,
        syncInProgress,
        offline: isPlatformOffline(),
        permissionBlocked: syncPermissionBlocked
    };
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSyncCoordinator);
    else initSyncCoordinator();
} else if (typeof window !== 'undefined') {
    initSyncCoordinator();
}