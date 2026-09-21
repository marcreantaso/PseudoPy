/* ============================================================
   PERSISTED SESSION RESTORE
   Browser-local Firebase-session persistence for the PseudoPy
   Firestore-backed identity model. A page refresh, CRUD write or
   PWA update must never behave like an implicit logout.
   ============================================================ */

const SESSION_KEY = 'pseudopy_session_user';
const ROUTE_KEY = 'pseudopy_route';

const BOOT_LOADING = 'AUTH_LOADING';
const BOOT_AUTHENTICATED = 'AUTHENTICATED';
const BOOT_UNAUTHENTICATED = 'UNAUTHENTICATED';

let bootState = BOOT_LOADING;

/**
 * Returns a persistable copy of a user record with credential fields
 * stripped. Password material must never be written to frontend storage.
 */
function sanitizeUser(user) {
    if (!user) return null;
    const copy = {};
    for (const key of Object.keys(user)) {
        if (key === 'password' || key === 'passwordHash' || key === 'passwordSalt') continue;
        copy[key] = user[key];
    }
    return copy;
}

/**
 * Persist the authenticated user's sanitized profile using browser-local
 * persistence so the session survives refresh, reopened tabs and PWA updates.
 */
function saveSession(user) {
    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(sanitizeUser(user)));
    } catch (e) {
        console.warn('[Session] Failed to persist session:', e);
    }
}

/**
 * Clear the persisted session and related transient markers.
 */
function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { }
    try { sessionStorage.removeItem('pseudopy_session_user'); } catch (e) { }
    try { sessionStorage.removeItem('pseudopy_update_dismissed'); } catch (e) { }
}

/**
 * Persist the current protected page so a refresh restores the same route.
 */
function persistRoute(pageId) {
    try { localStorage.setItem(ROUTE_KEY, pageId); } catch (e) { }
}

function getPersistedRoute() {
    try { return localStorage.getItem(ROUTE_KEY) || ''; } catch (e) { return ''; }
}

function clearPersistedRoute() {
    try { localStorage.removeItem(ROUTE_KEY); } catch (e) { }
}

function showBootSplash() {
    const splash = $id('boot-splash');
    if (splash) splash.classList.remove('hidden');
}

function hideBootSplash() {
    const splash = $id('boot-splash');
    if (splash) splash.classList.add('hidden');
}

/**
 * Boot-time auth restore. Runs once on startup:
 *   1. If no persisted session -> UNAUTHENTICATED (login screen).
 *   2. Otherwise show the boot splash, re-fetch the user record from
 *      Firestore as the authoritative source of profile/role/status, and
 *      restore the previously persisted route (access-checked).
 * A missing/invalid record clears the session; a temporary Firestore delay
 * must never sign anyone out.
 */
async function restoreSession() {
    bootState = BOOT_LOADING;

    let snapshot = null;
    try {
        snapshot = JSON.parse(localStorage.getItem(SESSION_KEY));
    } catch (e) {
        snapshot = null;
    }

    if (!snapshot || !((snapshot._docId || snapshot.id))) {
        bootState = BOOT_UNAUTHENTICATED;
        return false;
    }

    showBootSplash();

    try {
        const docId = snapshot._docId || snapshot.id;
        const fresh = await dbGet(usersRef, docId);

        if (!fresh) {
            const gone = new Error('Session account no longer exists.');
            gone.name = 'SessionAccountGone';
            throw gone;
        }

        const status = (fresh.status || 'active').toLowerCase();
        if (status === 'archived' || status === 'inactive') {
            clearSession();
            bootState = BOOT_UNAUTHENTICATED;
            hideBootSplash();
            showToast('Your session ended. This account is no longer active.', 'info');
            return false;
        }

        currentUser = fresh;

        const route = getPersistedRoute();
        const targetPage = (route && checkAccess(fresh.role, route)) ? route : '';
        showApp(targetPage);

        bootState = BOOT_AUTHENTICATED;
        hideBootSplash();
        console.log('[Session] Restored:', fresh.username, 'role:', fresh.role, 'page:', targetPage || '(default)');
        return true;
    } catch (err) {
        if (err && err.name === 'SessionAccountGone') {
            // The account was explicitly deleted: purge stored credentials-free
            // profile so stale sessions never resurrect.
            console.warn('[Session] Account no longer exists; clearing stored session.');
            clearSession();
        } else {
            // Transient Firestore/network failure: the persisted session is
            // kept so a later boot can retry. A temporary outage must never
            // behave like a (silent) logout.
            console.warn('[Session] Restore temporarily unavailable; kept session for retry:', err && err.message);
        }
        bootState = BOOT_UNAUTHENTICATED;
        hideBootSplash();
        return false;
    }
}