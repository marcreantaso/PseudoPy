/* ============================================================
   PERSISTED SESSION RESTORE
   Browser-local Firebase-session persistence for the PseudoPy
   Firestore-backed identity model. A page refresh, CRUD write or
   PWA update must never behave like an implicit logout.
   ============================================================ */

const SESSION_KEY = STORAGE_KEYS.SESSION_USER;
const ROUTE_KEY = STORAGE_KEYS.ROUTE;

const BOOT_LOADING = 'AUTH_LOADING';
const BOOT_PROFILE_LOADING = 'PROFILE_LOADING';
const BOOT_AUTHENTICATED = 'AUTHENTICATED';
const BOOT_AUTHENTICATED_DEGRADED = 'AUTHENTICATED_DEGRADED';
const BOOT_UNAUTHENTICATED = 'UNAUTHENTICATED';

let bootState = BOOT_LOADING;
let profileRefreshAttempts = 0;

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
    try { sessionStorage.removeItem(STORAGE_KEYS.SESSION_USER); } catch (e) { }
    try { sessionStorage.removeItem(STORAGE_KEYS.UPDATE_DISMISSED); } catch (e) { }
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

function showConnectionBanner() {
    const banner = $id('connection-status-banner');
    if (banner) banner.hidden = false;
}

function hideConnectionBanner() {
    const banner = $id('connection-status-banner');
    if (banner) banner.hidden = true;
}

function makeGoneError() {
    const gone = new Error('Session account no longer exists.');
    gone.name = 'SessionAccountGone';
    return gone;
}

/**
 * Best-known cached profile for an account id (from the IndexedDB-backed local
 * collection). Only accepts roles/status the app can boot; never credentials.
 */
function loadCachedProfileFor(snapshot) {
    const id = snapshot && (snapshot._docId || snapshot.id);
    if (!id || typeof getLocalCollection !== 'function' || typeof usersRef === 'undefined') return null;
    try {
        const rows = getLocalCollection(usersRef);
        const found = (rows && rows.find ? rows.find(item => item._docId === id || item.id === id) : null);
        if (!found) return null;
        const role = String(found.role || '').toLowerCase();
        const status = String(found.status || 'active').toLowerCase();
        if (['student', 'instructor', 'admin'].includes(role) && status !== 'archived' && status !== 'inactive') return sanitizeUser(found);
    } catch (e) { /* fall through to the persisted snapshot */ }
    return null;
}

/**
 * Bounded background re-sync after a degraded boot. Refetches the profile from
 * Firestore (with a few attempts), then restores authority by refreshing the
 * cached collections and re-rendering. Never loops forever (max 3 retries).
 */
function scheduleProfileRefresh(docId, fallbackRoute) {
    if (typeof dbGet !== 'function' || typeof checkAccess !== 'function') return;
    if (profileRefreshAttempts >= 3) return;
    profileRefreshAttempts++;
    const backoffMs = [1500, 3000, 6000][profileRefreshAttempts - 1] || 6000;
    setTimeout(async () => {
        try {
            const fresh = await dbGet(usersRef, docId, { strict: true });
            if (!fresh) { profileRefreshAttempts = 3; return; }
            currentUser = fresh;
            profileRefreshAttempts = 0;
            hideConnectionBanner();
            if (typeof refreshAuthoritativeCaches === 'function') refreshAuthoritativeCaches();
            const route = getPersistedRoute();
            const targetPage = (route && checkAccess(fresh.role, route)) ? route : (fallbackRoute || '');
            renderSessionState({ state: BOOT_AUTHENTICATED, user: fresh, route: targetPage });
            console.log('[Session] Background re-sync completed; Firestore is authoritative again.');
        } catch (e) {
            console.info('[Session] Background re-sync still unavailable:', e && e.message);
        }
    }, backoffMs);
}

/**
 * UI-rendering half of the boot. Session state is computed separately; this
 * only materializes the result once the DOM containers exist. A renderer
 * failure here is logged and never flips the authentication state.
 */
function renderSessionState(result) {
    if (!result || (result.state !== BOOT_AUTHENTICATED && result.state !== BOOT_AUTHENTICATED_DEGRADED)) {
        hideBootSplash();
        return;
    }
    const targetPage = result.route || '';
    if (typeof showApp === 'function') {
        try { showApp(targetPage); } catch (e) { console.warn('[Session] App render failed, session kept:', e && e.message); }
    }
    if (result.state === BOOT_AUTHENTICATED_DEGRADED) showConnectionBanner();
    hideBootSplash();
}

/**
 * Boot-time auth restore. Runs once on startup:
 *   1. If no persisted session -> UNAUTHENTICATED (login screen).
 *   2. Otherwise show the boot splash, re-fetch the user record from
 *      Firestore as the authoritative source of profile/role/status, and
 *      restore the previously persisted route (access-checked).
 *   3. Rendering is separated into renderSessionState() so a UI error can
 *      never sign the user out.
 * A missing/invalid record clears the session; a temporary Firestore delay
 * must never sign anyone out — it boots from the best-known cached profile in
 * AUTHENTICATED_DEGRADED and re-syncs in the background.
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
        return { state: BOOT_UNAUTHENTICATED, user: null, route: '' };
    }

    showBootSplash();
    bootState = BOOT_PROFILE_LOADING;

    const docId = snapshot._docId || snapshot.id;

    try {
        const fresh = await dbGet(usersRef, docId, { strict: true });

        if (!fresh) {
            // Firestore is authoritative and confirms the account is gone.
            throw makeGoneError();
        }

        const status = (fresh.status || 'active').toLowerCase();
        if (status === 'archived' || status === 'inactive') {
            clearSession();
            bootState = BOOT_UNAUTHENTICATED;
            hideBootSplash();
            showToast('Your session ended. This account is no longer active.', 'info');
            return { state: BOOT_UNAUTHENTICATED, user: null, route: '' };
        }

        currentUser = fresh;

        const route = getPersistedRoute();
        const targetPage = (route && checkAccess(fresh.role, route)) ? route : '';

        bootState = BOOT_AUTHENTICATED;
        renderSessionState({ state: BOOT_AUTHENTICATED, user: fresh, route: targetPage });
        console.log('[Session] Restored:', fresh.username, 'role:', fresh.role, 'page:', targetPage || '(default)');
        return { state: BOOT_AUTHENTICATED, user: fresh, route: targetPage };
    } catch (err) {
        if (err && err.name === 'SessionAccountGone') {
            // The account was explicitly deleted: purge stored credentials-free
            // profile so stale sessions never resurrect.
            console.warn('[Session] Account no longer exists; clearing stored session.');
            clearSession();
            bootState = BOOT_UNAUTHENTICATED;
            hideBootSplash();
            return { state: BOOT_UNAUTHENTICATED, user: null, route: '' };
        }
        // Transient Firestore/network failure: the persisted session is
        // kept so a later boot can retry. A temporary outage must never
        // behave like a (silent) logout.
        console.warn('[Session] Restore temporarily unavailable; kept session for retry:', err && err.message);
        const cached = loadCachedProfileFor(snapshot);
        if (cached || (snapshot && (snapshot._docId || snapshot.id))) {
            currentUser = cached || sanitizeUser(snapshot);
            bootState = BOOT_AUTHENTICATED_DEGRADED;
            const route = getPersistedRoute();
            const targetPage = (route && checkAccess(currentUser.role, route)) ? route : '';
            renderSessionState({ state: BOOT_AUTHENTICATED_DEGRADED, user: currentUser, route: targetPage });
            scheduleProfileRefresh(docId, targetPage);
            return { state: BOOT_AUTHENTICATED_DEGRADED, user: currentUser, route: targetPage };
        }
        bootState = BOOT_UNAUTHENTICATED;
        hideBootSplash();
        return { state: BOOT_UNAUTHENTICATED, user: null, route: '' };
    }
}