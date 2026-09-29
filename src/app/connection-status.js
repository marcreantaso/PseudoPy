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
}

function showReconnectingStatus() {
    const banner = typeof $id === 'function' ? $id('connection-status-banner') : null;
    if (banner) banner.hidden = false;
}

function hideReconnectingStatus() {
    const banner = typeof $id === 'function' ? $id('connection-status-banner') : null;
    if (banner) banner.hidden = true;
    hideOfflineSaveStatus();
}

function showOfflineSaveStatus(reason) {
    if (offlineSaveStatusShown || readOfflineSaveDismissed()) return false;
    offlineSaveStatusShown = true;
    const banner = typeof $id === 'function' ? $id(OFFLINE_SAVE_STATUS_ID) : null;
    if (!banner) return false;
    const detail = typeof $id === 'function' ? $id('offline-save-status-detail') : null;
    if (detail) {
        detail.textContent = reason || 'Changes are saved on this device and will sync when the server allows it.';
    }
    banner.hidden = false;
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
    const reason = classification.category === 'PERMISSION_DENIED'
        ? 'Your changes are saved on this device, but this account is not permitted to sync them to the server.'
        : 'Your changes are saved on this device, but the server rejected them (' + (classification.category || 'unknown') + ').';
    return showOfflineSaveStatus(reason);
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
    if (!initConnectionStatus.__bound) {
        initConnectionStatus.__bound = true;
        window.addEventListener('online', function () {
            hideReconnectingStatus();
            if (typeof syncNow === 'function') syncNow('online');
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
