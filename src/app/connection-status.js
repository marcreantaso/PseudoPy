/* ============================================================
   CLOUD CONNECTIVITY STATUS

   There is no "Reconnecting to the server…" state. Being offline is
   a normal, expected condition for this PWA: the student stays
   signed in, keeps working, and every change is already saved on the
   device. Telling them the app is "reconnecting" was wrong twice over
   - it implied an outage they should wait out, and it animated
   forever because a browser offline is not a server fault.

   The UI now has exactly three calm shapes:
     - a permanent pill reporting the current sync state, and
     - a dismissible notice for a real cloud refusal, and
     - nothing else.
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

/**
 * The retired reconnect banner. Kept as a no-op seam because the
 * authentication, session and sync layers still call these names; they
 * now resolve to the permanent pill instead of an alarming banner.
 */
function showReconnectingStatus() {
    if (typeof renderSyncIndicator === 'function') renderSyncIndicator();
}

function hideReconnectingStatus() {
    if (typeof renderSyncIndicator === 'function') renderSyncIndicator();
}

/**
 * Offline is not an error, so it is never announced as a notice that
 * needs dismissing: the always-visible pill already says where the work
 * lives. Only a genuine cloud refusal earns a banner.
 */
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
 * refusal. Shows the dismissible status at most once per session. A browser
 * offline is a connectivity state, not a policy refusal, so it stays on the
 * permanent pill and starts no retry work.
 */
function reportCloudSaveDenied(context, classification) {
    if (!classification || classification.transient) return false;
    if (isBrowserOffline()) {
        // Genuinely offline: the pill already reports it and the durable queue
        // keeps the work. A dismissible banner here would add noise, not clarity.
        renderSyncIndicator();
        return false;
    }
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

   The always-visible pill. It holds NO state of its own: every value
   is derived from the sync manager's existing synchronous variables
   and the same events the queue already dispatches, so the pill can
   never disagree with the rest of the connectivity UI.

   Offline is reported as a calm, terminal-sounding state with no
   animation. Only an actual upload animates.
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
 *
 * "Syncing" is reserved for a queue that is actively uploading. Everything
 * that cannot currently reach Firestore reports where the work actually
 * lives - on the device - instead of implying a retry is under way.
 */
function readSyncIndicatorState() {
    const localDetail = 'Your work is saved on this device and will sync when you are back online.';
    if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
        return { key: 'offline', label: 'Offline', detail: 'No network connection. ' + localDetail };
    }
    if (typeof syncPermissionBlocked !== 'undefined' && syncPermissionBlocked) {
        return { key: 'denied', label: 'Synced locally', detail: 'This account cannot sync to the cloud yet. ' + localDetail };
    }
    if (typeof firestoreReady === 'function' && !firestoreReady()) {
        return { key: 'local', label: 'Synced locally', detail: 'Firestore is unavailable. ' + localDetail };
    }
    if (typeof isFirestoreReachable === 'function' && !isFirestoreReachable()) {
        return { key: 'local', label: 'Synced locally', detail: 'The cloud is not reachable yet. ' + localDetail };
    }
    if (typeof syncInProgress !== 'undefined' && syncInProgress) {
        return { key: 'syncing', label: 'Syncing', detail: 'Uploading saved changes to the cloud.' };
    }
    if (syncIndicatorPendingCount > 0) {
        return { key: 'queued', label: 'Saved on this device', detail: syncIndicatorPendingCount + ' change(s) waiting to upload.' };
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
        // Blocked-permission records are still unsynced work, so they belong
        // in the count even though they will never retry on their own.
        syncIndicatorPendingCount = (state.pending || 0) + (state.failed || 0) + (state.blocked || 0);
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
        // Sync lifecycle (upload start/finish/failure) is what turns the pill
        // into Syncing -> Synced; reachability alone cannot tell that apart
        // from "nothing to do".
        window.addEventListener('pseudopy:sync-progress', renderSyncIndicator);
        window.addEventListener('pseudopy:sync-error', function () {
            renderSyncIndicator();
            scheduleSyncIndicatorCountRefresh();
        });
        window.addEventListener('pseudopy:sync-saved', function () {
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
        // Coming back online is a hint, not proof: the queue has to actually
        // upload before the pill may say Synced. The sync manager owns that.
        window.addEventListener('online', function () {
            if (typeof resetCloudCircuit === 'function') resetCloudCircuit();
            renderSyncIndicator();
        });
        window.addEventListener('offline', renderSyncIndicator);
    }
    // Starting offline is not a fault to announce: the permanent pill already
    // states that work is saved on the device.
    renderSyncIndicator();
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initConnectionStatus);
    } else {
        initConnectionStatus();
    }
}
