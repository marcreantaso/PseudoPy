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
let cloudAuthPersistence = 'unknown'; // unknown | local | default
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
        // Persistence was previously left unset, silently inheriting LOCAL
        // (IndexedDB-backed) — which means a shared or lab machine retains the
        // signed-in identity across browser restarts. Stated explicitly here so
        // the choice is visible and so the health panel can report it.
        // Fire-and-forget: a rejection must not block session observation.
        try {
            const mode = firebase.auth.Auth.PERSISTENCE_LOCAL;
            cloudAuth.setPersistence(mode).then(
                () => { cloudAuthPersistence = 'local'; },
                (e) => {
                    cloudAuthPersistence = 'default';
                    console.warn('[CloudAuth] setPersistence rejected; using SDK default:', e && e.code);
                }
            );
        } catch (e) {
            cloudAuthPersistence = 'default';
        }
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
        email: cloudEmail(),
        persistence: cloudAuthPersistence
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

/**
 * Codes that mean "the server answered, and the answer is no". These are final:
 * retrying cannot change them, so the caller must NOT enter a reconnect loop and
 * must NOT present them as a connectivity problem.
 */
const CLOUD_SIGNIN_INVALID_CODES = [
    'auth/invalid-credential',
    'auth/wrong-password',
    'auth/user-not-found',
    'auth/invalid-email',
    'auth/user-disabled'
];

/**
 * Codes that mean "the provider is not configured for this project". Only the
 * Firebase project owner can fix these (see docs/OWNER-ACTIONS.md).
 */
const CLOUD_SIGNIN_CONFIG_CODES = [
    'auth/operation-not-allowed',
    'auth/unsupported-first-factor',
    'auth/unauthorized-domain'
];

/** Codes that are genuinely transient and may succeed on a later attempt. */
const CLOUD_SIGNIN_TRANSIENT_CODES = [
    'auth/network-request-failed',
    'auth/too-many-requests',
    'auth/internal-error'
];

/**
 * Interpret a sign-in failure.
 *
 * Returns `invalid` (rejected credentials or account), `config` (provider or
 * domain not enabled), `transient` (network or throttling) or `unknown`.
 * `code` is the Firebase error code, never a credential payload.
 */
function classifyCloudSignInError(error) {
    const code = (error && error.code) || 'auth/unknown';
    if (CLOUD_SIGNIN_INVALID_CODES.indexOf(code) !== -1) return { kind: 'invalid', code };
    if (CLOUD_SIGNIN_CONFIG_CODES.indexOf(code) !== -1) return { kind: 'config', code };
    if (CLOUD_SIGNIN_TRANSIENT_CODES.indexOf(code) !== -1) return { kind: 'transient', code };
    return { kind: 'unknown', code };
}

/**
 * Best-effort cloud session for an account that already passed the in-app
 * login. NEVER throws and never blocks the caller.
 *
 * The result is explicit so the caller can act on the difference:
 *   - `ok: true`                  the cloud session is established
 *   - `unprovisioned`             no Firebase Auth account exists for this user
 *                                 (the expected state during migration)
 *   - `invalid`                   the password was rejected by the server
 *   - `config`                    provider/domain not enabled (owner action)
 *   - `transient` / `unavailable` a network problem, retryable later
 */
async function signInToCloud(email, password) {
    if (!cloudAuthAvailable()) return { ok: false, kind: 'unavailable', code: 'auth/unavailable' };
    if (!email || !password) return { ok: false, kind: 'unprovisioned', code: 'auth/missing-credentials' };
    try {
        const credential = await cloudAuth.signInWithEmailAndPassword(email, password);
        return { ok: !!credential && !!credential.user, uid: cloudUid() };
    } catch (error) {
        const verdict = classifyCloudSignInError(error);
        // The address is not a credential, but it is account data; log the code
        // and the category only. No password, token or payload is ever logged.
        if (verdict.kind === 'transient' || verdict.kind === 'unknown') {
            console.warn(`[CloudAuth] sign-in failed (${verdict.code}) for ${email}`);
        } else {
            console.info(`[CloudAuth] no cloud session for ${email} (${verdict.code}); continuing with the in-app account.`);
        }
        return { ok: false, kind: verdict.kind, code: verdict.code };
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
