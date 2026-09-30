// ══════════════════════════════════════════════════════════════
//  FIREBASE AUTH BRIDGE
//  PseudoPy authenticates IN-APP against the `pseudopy_users`
//  collection (username + client-side salted hash). Firebase Auth
//  was never wired up, so Firestore sees every request as
//  anonymous (`request.auth == null`) and any deployed ruleset
//  that requires auth answers every read, write and listener with
//  `permission-denied`.
//
//  This module is deliberately ADDITIVE and non-breaking:
//    - Auth SDK missing / not initialised  -> `unavailable`
//    - Auth SDK present, nobody signed in   -> `signed-out`
//    - Auth SDK present, session active     -> `signed-in`
//  When there is no session the app keeps its current behaviour
//  (works against a permissive ruleset, stays local-only against a
//  strict one). Nothing here can break the offline fallback, and no
//  credential, key or admin secret is ever stored in the client.
// ══════════════════════════════════════════════════════════════

let cloudAuth = null;            // firebase.auth.Auth | null
let cloudAuthState = 'unknown';  // unknown | unavailable | signed-out | signed-in
let cloudAuthResolved = false;   // onAuthStateChanged has fired at least once
const cloudAuthListeners = [];

/**
 * Attach to the already-initialized Firebase app (see firebase.js) and start
 * observing the session. Must run after `firebase.initializeApp`, which the
 * bundle order guarantees. Safe to call more than once.
 */
function initCloudAuth() {
    if (cloudAuth) return cloudAuth;
    const hasAuth = typeof firebase !== 'undefined'
        && firebase
        && typeof firebase.auth === 'function'
        && firebase.apps
        && firebase.apps.length > 0;
    if (!hasAuth) {
        cloudAuthState = 'unavailable';
        return null;
    }
    try {
        cloudAuth = firebase.auth();
        cloudAuth.onAuthStateChanged(user => {
            cloudAuthResolved = true;
            cloudAuthState = user ? 'signed-in' : 'signed-out';
            for (const listener of cloudAuthListeners.slice()) {
                try {
                    listener(user);
                } catch (e) {
                    console.warn('[CloudAuth] session listener failed:', e && e.message);
                }
            }
        }, error => {
            cloudAuthResolved = true;
            cloudAuthState = 'unavailable';
            console.warn('[CloudAuth] onAuthStateChanged failed:', error && (error.code || error.message));
        });
    } catch (e) {
        cloudAuthState = 'unavailable';
        console.warn('[CloudAuth] init failed:', e && e.message);
    }
    return cloudAuth;
}

/** True when the Auth SDK is present and attached to the app. */
function cloudAuthAvailable() {
    return !!cloudAuth;
}

/** True once the initial session lookup has completed (never blocks on it). */
function cloudAuthReady() {
    return cloudAuthAvailable() && cloudAuthResolved;
}

/** The Firebase Auth uid, or null. This is the only trusted owner identity. */
function cloudUid() {
    return cloudAuth && cloudAuth.currentUser ? cloudAuth.currentUser.uid : null;
}

function cloudEmail() {
    return cloudAuth && cloudAuth.currentUser ? cloudAuth.currentUser.email : null;
}

/**
 * True only when we KNOW a strict ruleset is in force and the user simply has
 * not signed in to the cloud yet. This is the single condition under which a
 * `permission-denied` is treated as "retry after sign-in" rather than a final
 * failure. When the Auth SDK is unavailable the app cannot tell the difference,
 * so the pre-existing permanent-failure behaviour is preserved untouched.
 */
function cloudAuthPendingSignIn() {
    return cloudAuthReady() && !cloudUid();
}

function cloudAuthStatus() {
    return {
        available: cloudAuthAvailable(),
        resolved: cloudAuthResolved,
        state: cloudAuthState,
        uid: cloudUid(),
        email: cloudEmail()
    };
}

/** Subscribe to session changes. Returns an unsubscribe function. */
function onCloudAuthChanged(listener) {
    if (typeof listener !== 'function') return function () { };
    cloudAuthListeners.push(listener);
    return function () {
        const idx = cloudAuthListeners.indexOf(listener);
        if (idx !== -1) cloudAuthListeners.splice(idx, 1);
    };
}

/** Resolves as soon as the first session lookup has completed. */
function awaitCloudAuth() {
    if (cloudAuthReady()) return Promise.resolve(cloudUid());
    return new Promise(function (resolve) {
        const stop = onCloudAuthChanged(function () {
            stop();
            resolve(cloudUid());
        });
    });
}

/** Codes that mean "no cloud account / wrong password" rather than a real fault. */
const CLOUD_SIGNIN_SKIPPED_CODES = [
    'auth/invalid-credential',
    'auth/user-not-found',
    'auth/invalid-email',
    'auth/operation-not-allowed',
    'auth/network-request-failed',
    'auth/too-many-requests'
];

/**
 * Best-effort cloud session for an account that already passed the in-app
 * login. NEVER throws and never blocks the caller: if no matching Firebase
 * Auth account exists yet (the expected state during migration) the app keeps
 * working exactly as before.
 */
async function signInToCloud(email, password) {
    if (!cloudAuthAvailable()) return { ok: false, reason: 'unavailable' };
    if (!email || !password) return { ok: false, reason: 'missing-credentials' };
    try {
        const credential = await cloudAuth.signInWithEmailAndPassword(email, password);
        return { ok: !!credential && !!credential.user, uid: cloudUid() };
    } catch (error) {
        const code = (error && error.code) || 'auth/unknown';
        if (CLOUD_SIGNIN_SKIPPED_CODES.indexOf(code) === -1) {
            console.warn(`[CloudAuth] sign-in failed (${code}) for ${email}`);
        } else {
            console.info(`[CloudAuth] no cloud session for ${email} (${code}); continuing with the in-app account.`);
        }
        return { ok: false, reason: code };
    }
}

async function signOutOfCloud() {
    if (!cloudAuthAvailable()) return false;
    try {
        await cloudAuth.signOut();
        return true;
    } catch (error) {
        console.warn('[CloudAuth] sign-out failed:', error && (error.code || error.message));
        return false;
    }
}

initCloudAuth();
