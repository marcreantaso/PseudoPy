/* ============================================================
   CLOUD CONNECTIVITY STATUS
   Distinguishes a *transient* outage ("Reconnecting…", with an
   automatic recovery probe) from a *permanent* refusal
   ("saved on this device", with a dismiss button).

   A Firestore rules denial is not an outage. The server answered.
   Presenting it as a permanent reconnect loop is what made the
   original banner impossible to dismiss.
   ============================================================ */

const OFFLINE_SAVE_STATUS_ID = 'offline-save-status';
const OFFLINE_SAVE_DISMISS_ID = 'offline-save-dismiss';
const OFFLINE_SAVE_RETRY_ID = 'offline-save-retry';
const OFFLINE_SAVE_SHOWN_KEY = 'pseudopy.offlineSaveShown';
const OFFLINE_SAVE_DISMISSED_KEY = 'pseudopy.offlineSaveDismissed';

let offlineSaveStatusShown = false;

/** True when the browser itself knows it has no network. */
function isBrowserOffline() {
    return typeof navigator !== 'undefined' && navigator && navigator.onLine === false;
}

function readOfflineSaveDismissed() {
    try { return sessionStorage.getItem(OFFLINE_SAVE_DISMISSED_KEY) === '1'; } catch (e) { return false; }
}

function writeOfflineSaveDismissed(value) {
    try { sessionStorage.setItem(OFFLINE_SAVE_DISMISSED_KEY, value ? '1' : '0'); } catch (e) { }
}

/**
 * Test seam: resets the once-per-session latch. Never called in app code.
 */
function resetOfflineSaveStatusForTests() {
    offlineSaveStatusShown = false;
    writeOfflineSaveDismissed(false);
    try { sessionStorage.setItem(OFFLINE_SAVE_SHOWN_KEY, '0'); } catch (e) {}
}

function showReconnectingStatus() {
    if (!isBrowserOffline() && typeof cloudRequestsAllowed === 'function' && !cloudRequestsAllowed()) return;
    const banner = typeof $id === 'function' ? $id('connection-status-banner') : null;
    if (banner) banner.hidden = false;
    if (typeof renderSyncIndicator === 'function') renderSyncIndicator();
}

function hideReconnectingStatus() {
    const banner = typeof $id === 'function' ? $id('connection-status-banner') : null;
    if (banner) banner.hidden = true;
    if (typeof renderSyncIndicator === 'function') renderSyncIndicator();
}

function showOfflineSaveStatus(reason) {
    let previouslyShown = false;
    try { previouslyShown = sessionStorage.getItem(OFFLINE_SAVE_SHOWN_KEY) === '1'; } catch (e) {}
    if (offlineSaveStatusShown || readOfflineSaveDismissed() || previouslyShown) return false;
    offlineSaveStatusShown = true;
    const banner = typeof $id === 'function' ? $id(OFFLINE_SAVE_STATUS_ID) : null;
    if (!banner) return false;
    const detail = typeof $id === 'function' ? $id('offline-save-status-detail') : null;
    if (detail) {
        detail.textContent = reason || 'Changes are saved on this device and will sync when the server allows it.';
    }
    banner.hidden = false;
    try { sessionStorage.setItem(OFFLINE_SAVE_SHOWN_KEY, '1'); } catch (e) {}
    return true;
}

function hideOfflineSaveStatus() {
    const banner = typeof $id === 'function' ? $id(OFFLINE_SAVE_STATUS_ID) : null;
    if (banner) banner.hidden = true;
}

/**
 * User-initiated dismissal. Persisted for the session so a permanent refusal
 * is announced exactly once, and never returns until the page is reloaded.
 */
function dismissOfflineSaveStatus() {
    writeOfflineSaveDismissed(true);
    offlineSaveStatusShown = true;
    hideOfflineSaveStatus();
}

function isOfflineSaveStatusVisible() {
    const banner = typeof $id === 'function' ? $id(OFFLINE_SAVE_STATUS_ID) : null;
    return !!(banner && !banner.hidden);
}

/**
 * Transport hook invoked by the database layer on a permanent cloud-write
 * refusal. Shows the dismissible status at most once per session; transient
 * failures are intentionally ignored here because they already own the
 * "Reconnecting" banner.
 */
function reportCloudSaveDenied(context, classification) {
    if (!classification || classification.transient) return false;
    if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
        // Genuinely offline is a connectivity problem, not a policy refusal.
        showReconnectingStatus();
        return false;
    }
    // The server answered, so retire any "Reconnecting…" state first: leaving
    // both on screen is what made the original notice look un-dismissable.
    hideReconnectingStatus();
    let reason;
    if (context && context.pendingSignIn) {
        // Not a misconfiguration: the write is queued and will be replayed as
        // soon as this browser has a Firebase Auth session.
        reason = 'Saved on this device. This browser is not signed in to the cloud, so your changes are waiting to sync.';
    } else if (classification.category === 'PERMISSION_DENIED') {
        reason = 'Working offline - saved on this device. This account is not permitted to sync yet.';
    } else {
        reason = 'Your changes are saved on this device, but the server rejected them (' + (classification.category || 'unknown') + ').';
    }
    if (typeof renderSyncIndicator === 'function') renderSyncIndicator();
    return showOfflineSaveStatus(reason);
}

/** Retry the queue on demand. Bounded by the same sync lock as every other trigger. */
function retryCloudSyncNow() {
    if (typeof syncNow !== 'function') return Promise.resolve(null);
    // `syncNow` is async in the app, but resolve defensively so this also
    // works with a synchronous stub.
    return Promise.resolve(syncNow('manual-retry')).then(async function (summary) {
        const remaining = typeof listAllMutations === 'function' ? await listAllMutations() : [];
        if (summary && summary.synced > 0 && remaining.length === 0) {
            hideOfflineSaveStatus();
            // A successful drain earns a fresh announcement for any later,
            // genuinely new failure.
            // Keep the once-per-session announcement latch after successful recovery.
            if (typeof showToast === 'function') showToast('Synced ' + summary.synced + ' pending change(s) to the cloud.', 'success');
        } else if (typeof showToast === 'function') {
            showToast('Could not sync yet. Your changes are safe on this device.', 'info');
        }
        return summary;
    });
}

/* ============================================================
   PERSISTENT CONNECTION INDICATOR

   The two notices above are transient and easy to miss: once
   dismissed, nothing tells you whether this browser is actually
   talking to Firestore. This is a small always-visible pill that
   reports the current state permanently.

   It holds NO state of its own. Every value is derived from the
   sync manager's existing synchronous variables and the same
   events the banners already listen to, so the pill can never
   disagree with the rest of the connectivity UI.
   ============================================================ */

const SYNC_INDICATOR_ID = 'sync-state-indicator';
const SYNC_INDICATOR_COUNT_ID = 'sync-state-pending-count';

let syncIndicatorPendingCount = null;   // null until the queue is read once
let syncIndicatorBound = false;
let syncIndicatorCountTimer = null;

/**
 * Derive the current state. Order matters: a permission refusal outranks an
 * outage because the server answered, and the browser's own offline flag is
 * the weakest signal of all (navigator.onLine reports "online" on a captive
 * portal and "offline" on some working wifi).
 */
function readSyncIndicatorState() {
    if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
        return { key: 'offline', label: 'Offline', detail: 'No network connection. Changes are saved on this device.' };
    }
    if (typeof syncPermissionBlocked !== 'undefined' && syncPermissionBlocked) {
        return { key: 'denied', label: 'Cloud denied', detail: 'Firestore refused a write. Changes are saved on this device.' };
    }
    if (typeof firestoreReady === 'function' && !firestoreReady()) {
        return { key: 'local', label: 'Local only', detail: 'Firestore is unavailable. Changes are saved on this device.' };
    }
    if (typeof isFirestoreReachable === 'function' && !isFirestoreReachable()) {
        return { key: 'reconnecting', label: 'Reconnecting', detail: 'Reaching Firestore. Changes are queued until it responds.' };
    }
    if (typeof syncInProgress !== 'undefined' && syncInProgress) {
        return { key: 'syncing', label: 'Syncing', detail: 'Uploading saved changes.' };
    }
    if (syncIndicatorPendingCount > 0) {
        return { key: 'queued', label: 'Queued', detail: syncIndicatorPendingCount + ' change(s) waiting to sync.' };
    }
    return { key: 'synced', label: 'Synced', detail: 'All changes are saved to the cloud.' };
}

function renderSyncIndicator() {
    if (typeof $id !== 'function') return null;
    const pill = $id(SYNC_INDICATOR_ID);
    if (!pill) return null;

    const state = readSyncIndicatorState();
    pill.dataset.state = state.key;
    pill.title = state.detail;
    pill.setAttribute('aria-label', 'Cloud sync status: ' + state.label + '. ' + state.detail);

    const label = pill.querySelector('.sync-state-label');
    if (label) label.textContent = state.label;

    const count = $id(SYNC_INDICATOR_COUNT_ID);
    if (count) {
        if (state.key === 'queued' && syncIndicatorPendingCount > 0) {
            count.textContent = String(syncIndicatorPendingCount);
            count.hidden = false;
        } else {
            count.hidden = true;
        }
    }
    return state;
}

/**
 * Refresh the queued-change count. getSyncState() is async because it reads
 * IndexedDB, so the pill renders its synchronous state immediately and
 * upgrades it when the count lands.
 */
function refreshSyncIndicatorCounts() {
    if (typeof getSyncState !== 'function') return Promise.resolve(null);
    return Promise.resolve(getSyncState()).then(function (state) {
        if (!state) return null;
        syncIndicatorPendingCount = (state.pending || 0) + (state.failed || 0);
        renderSyncIndicator();
        return state;
    }, function () { return null; });
}

function initSyncIndicator() {
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    if (!syncIndicatorBound) {
        syncIndicatorBound = true;
        // Reuse the listeners already wired above rather than adding a second
        // set, so the pill and the banners can never drift apart.
        window.addEventListener('online', refreshSyncIndicatorCounts);
        window.addEventListener('offline', renderSyncIndicator);
        window.addEventListener('pseudopy:connection-state', function () {
            renderSyncIndicator();
            scheduleSyncIndicatorCountRefresh();
        });
        window.addEventListener('pseudopy:sync-error', function () {
            renderSyncIndicator();
            scheduleSyncIndicatorCountRefresh();
        });
    }
    renderSyncIndicator();
    refreshSyncIndicatorCounts();
}

/**
 * markFirestoreReachable fires on every completed Firestore attempt, which can
 * be frequent. Coalesce the IndexedDB read so a sync burst costs one query.
 */
function scheduleSyncIndicatorCountRefresh() {
    if (syncIndicatorCountTimer) return;
    syncIndicatorCountTimer = setTimeout(function () {
        syncIndicatorCountTimer = null;
        refreshSyncIndicatorCounts();
    }, 750);
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSyncIndicator);
    } else {
        initSyncIndicator();
    }
}

function initConnectionStatus() {
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    const dismiss = typeof $id === 'function' ? $id(OFFLINE_SAVE_DISMISS_ID) : null;
    if (dismiss && !dismiss.__pseudopyBound) {
        dismiss.__pseudopyBound = true;
        dismiss.addEventListener('click', function () {
            dismissOfflineSaveStatus();
        });
    }
    const retry = typeof $id === 'function' ? $id(OFFLINE_SAVE_RETRY_ID) : null;
    if (retry && !retry.__pseudopyBound) {
        retry.__pseudopyBound = true;
        retry.addEventListener('click', function () {
            retry.disabled = true;
            Promise.resolve(retryCloudSyncNow()).then(function () {
                retry.disabled = false;
            }, function () {
                retry.disabled = false;
            });
        });
    }
    if (!initConnectionStatus.__bound) {
        initConnectionStatus.__bound = true;
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && isOfflineSaveStatusVisible()) dismissOfflineSaveStatus();
        });
        window.addEventListener('online', function () {
            hideReconnectingStatus();
            if (typeof resetCloudCircuit === 'function') resetCloudCircuit();
        });
        window.addEventListener('pseudopy:connection-state', function (event) {
            if (event.detail.reachable) hideReconnectingStatus();
            else showReconnectingStatus();
        });
        window.addEventListener('offline', function () {
            showReconnectingStatus();
        });
    }
    if (isBrowserOffline()) showReconnectingStatus();
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initConnectionStatus);
    } else {
        initConnectionStatus();
    }
}
