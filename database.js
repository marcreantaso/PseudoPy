// Shared default profile for the existing administrator account (u1).
// Credentials use the same salted hash format as the current password flow.
function getDefaultAdminProfile() {
    return {
        "fullName": "Admin",
        "username": "Admin",
        "password": null,
        "passwordHash": "804f4cba316ed81a095847efadc18b169d745f54ada7b651c85c4913439fbfe7",
        "passwordSalt": "9d9ad9d3642056bbff2c80d102f97610"
    };
}

// Only migrate the known legacy account. Renamed accounts (including later
// password changes) and all other roles/accounts are left untouched.
function upgradeDefaultAdminAccount(user) {
    if (!user || (user._docId || user.id) !== 'u1' || user.role !== 'admin' || user.username !== 'mbautista_admin') return user;
    return { ...user, ...getDefaultAdminProfile() };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getDefaultAdminProfile, upgradeDefaultAdminAccount };
}
// ============================================================
// CENTRAL DATABASE CLIENT — PseudoPy
// Firebase Firestore + Resilient Local Fallback
// ============================================================

console.log('[Database] Initializing Central Database Client...');

function resolveFirebaseConfig() {
    const browserConfig = typeof window !== 'undefined' && window.__FIREBASE_CONFIG__ ? window.__FIREBASE_CONFIG__ : null;
    const defaultConfig = {
        apiKey: "AIzaSyBWBtGTHxGSrsvKu-Q4CtFcTY7r--wnKgo",
        authDomain: "pseudopy-86149.firebaseapp.com",
        databaseURL: "https://pseudopy-86149-default-rtdb.firebaseio.com",
        projectId: "pseudopy-86149",
        storageBucket: "pseudopy-86149.firebasestorage.app",
        messagingSenderId: "1091297272681",
        appId: "1:1091297272681:web:fa674a7656d0e06326d3f8",
        measurementId: "G-QGVJ6471XS"
    };

    return browserConfig && browserConfig.projectId ? browserConfig : defaultConfig;
}

const firebaseConfig = resolveFirebaseConfig();

let firestore = null;
const hasFirebaseSDK = typeof firebase !== 'undefined' && firebase && typeof firebase.apps !== 'undefined';

// ── Local cache + App Check diagnostics ─────────────────────
// Recorded, never assumed. Verified against firebase-firestore-compat 10.12.0:
// that build exposes NO cache configuration API at all. `initializeFirestore`,
// `getFirestore`, `persistentLocalCache`, `memoryLocalCache` and
// `persistentMultipleTabManager` are all `undefined` on the compat namespace,
// and the `localCache` key is dropped before it reaches the client. Only the
// legacy `db.enablePersistence()` remains, and it is deprecated by the SDK.
//
// So this app does not ask for a Firestore cache and does not claim one. Its
// durable offline copy is its own IndexedDB store (src/database/idb-store.js)
// plus the mutation queue in src/database/sync-manager.js; Firestore itself runs
// with its default in-memory client cache. `localCache` therefore describes the
// Firestore client cache only, and is informational.
const firestoreInit = {
    localCache: 'memory',
    localCacheNote: 'Firestore client cache is in-memory. Durable offline data is held in the app\'s own IndexedDB store.',
    localCacheEngineConfigurable: false,
    appCheck: 'not-configured',
    appCheckReason: ''
};

try {
    if (hasFirebaseSDK) {
        const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
        firestore = createFirestoreInstance(app);
        console.log('[Database] Firebase Firestore connected ✅ Project:', firebaseConfig.projectId,
            '| client cache:', firestoreInit.localCache);
    } else {
        firestoreInit.localCache = 'unknown';
        firestoreInit.localCacheNote = 'SDK not loaded when this module ran.';
        console.log('[Database] Firebase SDK not loaded yet — using local fallback data until Firestore is available.');
    }
} catch (e) {
    firestoreInit.localCache = 'failed';
    firestoreInit.localCacheNote = (e && e.message) || String(e);
    console.warn('[Database] Firebase init warning:', e);
}

// App Check is the only control that distinguishes a real browser from a
// scripted client against the open interim ruleset. It stays OFF unless a
// reCAPTCHA v3 site key is configured, because activating App Check without a
// registered token refuses every Firestore read and write.
initAppCheckIfConfigured();

/**
 * Create the Firestore instance.
 *
 * firebase.firestore(app) is the only supported form in the compat build this
 * app loads, and it is synchronous. An earlier version of this function called
 * firebase.initializeFirestore(app, { localCache }) and then reported the
 * outcome, which looked more rigorous but was not: initializeFirestore and
 * persistentLocalCache do not exist on the compat namespace, so every launch
 * threw a TypeError, fell into the catch, and recorded 'memory' with an error
 * string. The health panel was reporting a configuration failure that the app
 * had been fine with all along, and it hid the fact that no cache had been
 * requested.
 *
 * If this app ever migrates to the modular SDK, initializeFirestore becomes the
 * correct entry point, so it is still detected and preferred here rather than
 * assumed. Local persistence remains OFF: the app's offline guarantee comes
 * from its own IndexedDB store and mutation queue, and enabling a second cache
 * would duplicate data without being asked for.
 */
function createFirestoreInstance(app) {
    const hasModularInit = typeof firebase.initializeFirestore === 'function';
    firestoreInit.localCacheEngineConfigurable = hasModularInit
        && typeof firebase.persistentLocalCache === 'function';

    if (firestoreInit.localCacheEngineConfigurable) {
        try {
            const localCache = firebase.persistentLocalCache(
                firebase.persistentMultipleTabManager
                    ? { tabManager: firebase.persistentMultipleTabManager() }
                    : undefined
            );
            const instance = firebase.initializeFirestore(app, { localCache });
            // Rejects only on failed-precondition/unimplemented (e.g. another
            // tab holds the cache). Never let that leave firestore null.
            Promise.resolve(instance).then(
                () => {
                    firestoreInit.localCache = 'indexeddb';
                    firestoreInit.localCacheNote = 'Firestore persistent cache engaged.';
                },
                (e) => {
                    firestoreInit.localCache = 'memory';
                    firestoreInit.localCacheNote = 'Firestore persistent cache unavailable: '
                        + ((e && e.message) || e) + ' Falling back to the in-memory client cache.';
                }
            );
            return instance;
        } catch (e) {
            firestoreInit.localCache = 'memory';
            firestoreInit.localCacheNote = 'Firestore cache could not be configured: '
                + ((e && e.message) || e);
        }
    }

    const instance = firebase.firestore(app);
    if (typeof instance.enablePersistence === 'function') {
        // Supported but deprecated in this SDK version, and deliberately not
        // called: the app's offline layer is its own IndexedDB store. Recorded
        // so the health panel can state that the lever exists rather than
        // implying persistence was attempted and failed.
        firestoreInit.localCacheNote += ' Firestore enablePersistence() is available but unused by design.';
    }
    return instance;
}

/**
 * Activate App Check only when a reCAPTCHA v3 site key has been registered.
 *
 * Deliberately opt-in: enabling App Check without a site key produces no
 * attestation token, and Firestore then rejects every read and write with
 * permission-denied. Register a reCAPTCHA v3 site key in the Firebase console,
 * then either add `appCheckSiteKey` to the config above or set
 * window.__APP_CHECK_SITE_KEY__ before database.js loads.
 */
function initAppCheckIfConfigured() {
    const browserKey = typeof window !== 'undefined' ? window.__APP_CHECK_SITE_KEY__ : null;
    const siteKey = (browserKey || firebaseConfig.appCheckSiteKey || '').trim();
    if (!siteKey) {
        firestoreInit.appCheckReason = 'No reCAPTCHA v3 site key configured; App Check is inactive.';
        return;
    }
    try {
        const app = firebase.apps.length ? firebase.app() : null;
        const provider = new firebase.appCheck.ReCaptchaV3Provider(siteKey);
        const check = firebase.appCheck();
        firestoreInit.appCheck = check && typeof check.initializeAppCheck === 'function' ? 'initializing' : 'unavailable';
        if (!check || typeof check.initializeAppCheck !== 'function') {
            firestoreInit.appCheckReason = 'firebase-app-check-compat.js is not loaded.';
            return;
        }
        check.initializeAppCheck({ provider, isTokenAutoRefreshEnabled: true });
        firestoreInit.appCheck = 'active';
        firestoreInit.appCheckReason = '';
        console.log('[Database] App Check active for app:', app ? app.name : '(unknown)');
    } catch (e) {
        firestoreInit.appCheck = 'failed';
        firestoreInit.appCheckReason = (e && e.message) || String(e);
        console.warn('[Database] App Check init failed:', e && e.message);
    }
}

const firestoreReady = () => !!(firestore && typeof firestore.collection === 'function');

function withFirestoreTimeout(promise, ms = 4000) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Firestore operation timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Bounded retry for transient Firestore failures (timeouts/network blips).
 * Runs `fetchFn` up to `attempts` times with `backoffMs` between tries, each
 * protected by withFirestoreTimeout. Never retries an infinite loop, and
 * throws a typed FirestoreUnavailableError once all attempts are exhausted so
 * callers can decide (e.g. fall back to cached profile instead of logging out).
 *
 * The original failure is preserved on `.cause` so downstream classification
 * can still see it. Without that, a permission-denied was laundered into
 * "FirestoreUnavailable" and re-read as a transient outage.
 */
function FirestoreUnavailableError(message, cause) {
    const err = new Error(message);
    err.name = 'FirestoreUnavailable';
    if (cause) {
        err.cause = cause;
        err.originalError = cause;
    }
    return err;
}

/** Permanent failures never benefit from another attempt. */
function isPermanentFirestoreFailure(err) {
    if (typeof isPermanentDbError === 'function') return isPermanentDbError(err);
    if (typeof classifyDbError === 'function') return !classifyDbError(err).transient;
    return false;
}

async function firestoreRetry(fetchFn, options = {}) {
    if (typeof cloudRequestsAllowed === 'function' && !cloudRequestsAllowed()) {
        throw cloudCircuitError || Object.assign(new Error('Browser offline'), {code:'unavailable'});
    }
    const requested = Math.max(1, options.attempts || 2);
    const timeoutMs = options.timeoutMs || 4000;
    const backoffMs = options.backoffMs === undefined ? 600 : Math.max(0, options.backoffMs || 0);
    let lastErr = null;
    let performed = 0;
    for (let i = 0; i < requested; i++) {
        if (i > 0 && backoffMs > 0) await new Promise(r => setTimeout(r, backoffMs));
        try {
            return await withFirestoreTimeout(fetchFn(), timeoutMs);
        } catch (err) {
            lastErr = err;
            if (typeof recordCloudFailure === 'function') recordCloudFailure(err);
            performed = i + 1;
            if (isPermanentFirestoreFailure(err)) break;
        }
    }
    const attempts = performed || requested;
    throw FirestoreUnavailableError(
        'Firestore operation failed after ' + attempts + ' attempt(s): ' + (lastErr && lastErr.message),
        lastErr
    );
}

// ── Collection References ──────────────────────────────────
const usersRef = "pseudopy_users";
const exercisesRef = "pseudopy_exercises";
const activityRef = "pseudopy_activity";
const passwordRequestsRef = "pseudopy_passwordRequests";
const auditLogRef = "pseudopy_auditLog";
const notificationsRef = "pseudopy_notifications";
const devicesRef = "pseudopy_devices";
const evidenceRef = "pseudopy_evidence";
const tutorialProgressRef = "pseudopy_tutorialProgress";
const countersRef = "pseudopy_counters";

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
// ══════════════════════════════════════════════════════════════
//  PASSWORD HASHING — Web Crypto API (SHA-256 + Salt)
// ══════════════════════════════════════════════════════════════

function generateSalt() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(inputPassword, storedHash, storedSalt) {
    const computedHash = await hashPassword(inputPassword, storedSalt);
    return computedHash === storedHash;
}

// ══════════════════════════════════════════════════════════════
//  BUILT-IN SEED DATA (Guarantees immediate login access)
// ══════════════════════════════════════════════════════════════

const FILIPINO_NAMES = [
    "John Cruz", "Maria Santos", "Kevin Ramos", "Anna Reyes", "Joshua Garcia",
    "Carlo Mendoza", "Patricia Flores", "Mark Bautista", "Nicole Dela Cruz", "Michael Reyes",
    "Christian Alde", "Jessica Pascual", "Aldrin Castro", "Kenneth Santos", "Jasmine Aquino",
    "Justin Ferrer", "Bianca De Leon", "Aaron Dizon", "Camille Valenzuela", "Dominic Ramos",
    "Ella Salvador", "Adrian Tolentino", "Sofia Corpuz", "Patrick Hernandez", "Hazel Gonzales",
    "Gabriel Santiago", "Abigail Ramos", "Ryan Ocampo", "Megan Custodio", "Kyle Dela Rosa"
];

/** Deterministic canonical student number for demo seeds: 230 + 4-digit sequence. */
function seedStudentNumber(seq) {
    return '230' + String(seq).padStart(4, '0');
}

function getInitialSeedUsers() {
    const users = [
        { _docId: 'u1', id: 'u1', ...getDefaultAdminProfile(), email: 'bautista@university.edu.ph', role: 'admin', status: 'active', createdAt: '2025-07-01T08:00:00.000Z' },
        { _docId: 'u2', id: 'u2', fullName: 'Marc Reantaso', username: 'mreantaso_instructor', email: 'reantaso@university.edu.ph', password: 'pass123', role: 'instructor', status: 'active', createdBy: 'u1', createdAt: '2025-08-10T14:15:00.000Z' },
        { _docId: 'u_inst_1787787083396', id: 'u_inst_1787787083396', fullName: 'john dave dela cruz', username: 'cruz_admin', email: 'delacruz@gmail.com', password: 'Admin123', role: 'instructor', status: 'active', createdAt: '2026-08-26T23:31:23.396Z', lastLogin: null, createdBy: 'u1' },
        { _docId: 'u_stu_emirandilla', id: 'u_stu_emirandilla', studentId: '2024-031', studentNumber: seedStudentNumber(1), fullName: 'Eduard John Mirandilla', username: 'emirandilla_student', email: 'mirandilla@gmail.com', password: 'pass123', role: 'student', status: 'active', instructorId: 'u2', createdBy: 'u2', section: 'BSCS-3A', createdAt: '2025-08-10T14:30:00.000Z' },
        { _docId: 'u_stu_mdaet', id: 'u_stu_mdaet', studentId: '2024-032', studentNumber: seedStudentNumber(2), fullName: 'Mikaella Daet', username: 'mdaet_student', email: 'daet@gmail.com', password: 'pass123', role: 'student', status: 'active', instructorId: 'u2', createdBy: 'u2', section: 'BSCS-3A', createdAt: '2025-08-10T14:35:00.000Z' },
    ];
    FILIPINO_NAMES.forEach((name, i) => {
        const clean = name.toLowerCase().replace(/\s+/g, '');
        users.push({
            _docId: `u_stu_${i + 3}`,
            id: `u_stu_${i + 3}`,
            studentId: `2024-${String(i + 1).padStart(3, '0')}`,
            studentNumber: seedStudentNumber(i + 3),
            fullName: name,
            username: `${clean}_student`,
            email: `${clean.split(' ')[0]}@student.edu.ph`,
            password: 'pass123',
            role: 'student',
            status: 'active',
            instructorId: 'u2',
            createdBy: 'u2',
            section: ['BSCS-3A', 'BSCS-3B', 'BSIT-3A', 'BSIT-3B'][i % 4]
        });
    });
    return users;
}

const SEED_EXERCISES_LIST = [
    {
        "_docId": "algo_1",
        "id": "algo_1",
        "title": "Sum of Odd Numbers Under 90",
        "concept": "While Loop Mathematical Series",
        "description": "Calculates the sum of odd numbers strictly less than 90.",
        "difficulty": "moderate",
        "pseudocode": "BEGIN\n  DECLARE maximum AS INTEGER\n  maximum = 0\n  DECLARE i AS INTEGER\n  i = 1\n  WHILE i < 90 DO\n    maximum = maximum + i\n    i = i + 2\n  ENDWHILE\n  PRINT maximum\nEND",
        "python_code": "maximum = 0\ni = 1\nwhile i < 90:\n    maximum = maximum + i\n    i = i + 2\nprint(maximum)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_2",
        "id": "algo_2",
        "title": "Count Multiples of 4 and 7 (Small Range)",
        "concept": "Modulo Branching Logic",
        "description": "Iterates to 16, identifying multiples of 4 and 7.",
        "difficulty": "moderate",
        "pseudocode": "BEGIN\n  DECLARE count AS INTEGER\n  count = 0\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO 16 DO\n    IF i MOD 4 == 0 THEN\n      count = count + 1\n    ELSE IF i MOD 7 == 0 THEN\n      count = count + 2\n    ELSE\n      count = count - 1\n    ENDIF\n  ENDFOR\n  PRINT count\nEND",
        "python_code": "count = 0\nfor i in range(1, 16 + 1):\n    if i % 4 == 0:\n        count = count + 1\n    elif i % 7 == 0:\n        count = count + 2\n    else:\n        count = count - 1\nprint(count)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_3",
        "id": "algo_3",
        "title": "Count Multiples of 4 and 7 (Wide Range)",
        "concept": "Modulo Branching Logic",
        "description": "Iterates to 45, identifying multiples of 4 and 7.",
        "difficulty": "moderate",
        "pseudocode": "BEGIN\n  DECLARE count AS INTEGER\n  count = 0\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO 45 DO\n    IF i MOD 4 == 0 THEN\n      count = count + 1\n    ELSE IF i MOD 7 == 0 THEN\n      count = count + 2\n    ELSE\n      count = count - 1\n    ENDIF\n  ENDFOR\n  PRINT count\nEND",
        "python_code": "count = 0\nfor i in range(1, 45 + 1):\n    if i % 4 == 0:\n        count = count + 1\n    elif i % 7 == 0:\n        count = count + 2\n    else:\n        count = count - 1\nprint(count)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_4",
        "id": "algo_4",
        "title": "Multiply Array Elements by 4",
        "concept": "In-Place Array Transformation",
        "description": "Multiplies every element in the array iteratively by 4.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE values AS ARRAY\n  values = [8, 4, 1, 6, 4, 13, 6]\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 6 DO\n    values[i] = values[i] * 4\n  ENDFOR\n  PRINT values\nEND",
        "python_code": "values = [8, 4, 1, 6, 4, 13, 6]\nfor i in range(0, 6 + 1):\n    values[i] = values[i] * 4\nprint(values)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_5",
        "id": "algo_5",
        "title": "Sum of Odd Numbers Under 95",
        "concept": "While Loop Mathematical Series",
        "description": "Calculates the sum of odd numbers strictly less than 95.",
        "difficulty": "moderate",
        "pseudocode": "BEGIN\n  DECLARE count AS INTEGER\n  count = 0\n  DECLARE i AS INTEGER\n  i = 1\n  WHILE i < 95 DO\n    count = count + i\n    i = i + 2\n  ENDWHILE\n  PRINT count\nEND",
        "python_code": "count = 0\ni = 1\nwhile i < 95:\n    count = count + i\n    i = i + 2\nprint(count)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_6",
        "id": "algo_6",
        "title": "Multiply Array Elements by 5",
        "concept": "In-Place Array Transformation",
        "description": "Multiplies every element in the array iteratively by 5.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE collection AS ARRAY\n  collection = [11, 19, 15, 12]\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 3 DO\n    collection[i] = collection[i] * 5\n  ENDFOR\n  PRINT collection\nEND",
        "python_code": "collection = [11, 19, 15, 12]\nfor i in range(0, 3 + 1):\n    collection[i] = collection[i] * 5\nprint(collection)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_7",
        "id": "algo_7",
        "title": "Factorial of 6 Computation",
        "concept": "Factorial Computation",
        "description": "Computes the factorial value iteratively up to 6.",
        "difficulty": "hard",
        "pseudocode": "BEGIN\n  DECLARE limit AS INTEGER\n  limit = 6\n  DECLARE factorial AS INTEGER\n  factorial = 1\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO limit DO\n    factorial = factorial * i\n  ENDFOR\n  PRINT factorial\nEND",
        "python_code": "limit = 6\nfactorial = 1\nfor i in range(1, limit + 1):\n    factorial = factorial * i\nprint(factorial)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_8",
        "id": "algo_8",
        "title": "Factorial of 8 Computation",
        "concept": "Factorial Computation",
        "description": "Computes the factorial value iteratively up to 6.",
        "difficulty": "hard",
        "pseudocode": "BEGIN\n  DECLARE limit AS INTEGER\n  limit = 6\n  DECLARE factorial AS INTEGER\n  factorial = 1\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO limit DO\n    factorial = factorial * i\n  ENDFOR\n  PRINT factorial\nEND",
        "python_code": "limit = 6\nfactorial = 1\nfor i in range(1, limit + 1):\n    factorial = factorial * i\nprint(factorial)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_9",
        "id": "algo_9",
        "title": "Sum of Odd Numbers Under 80",
        "concept": "While Loop Mathematical Series",
        "description": "Calculates the sum of odd numbers strictly less than 83.",
        "difficulty": "moderate",
        "pseudocode": "BEGIN\n  DECLARE target AS INTEGER\n  target = 0\n  DECLARE i AS INTEGER\n  i = 1\n  WHILE i < 83 DO\n    target = target + i\n    i = i + 2\n  ENDWHILE\n  PRINT target\nEND",
        "python_code": "target = 0\ni = 1\nwhile i < 83:\n    target = target + i\n    i = i + 2\nprint(target)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_10",
        "id": "algo_10",
        "title": "Multiply Array Elements by 3",
        "concept": "Array Filtering (Count)",
        "description": "Counts the number of elements in an array that are strictly greater than 67.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE values AS ARRAY\n  values = [1, 114, 145, 99, 105, 39, 136]\n  DECLARE threshold AS INTEGER\n  threshold = 67\n  DECLARE count AS INTEGER\n  count = 0\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 6 DO\n    IF values[i] > threshold THEN\n      count = count + 1\n    ENDIF\n  ENDFOR\n  PRINT count\nEND",
        "python_code": "values = [1, 114, 145, 99, 105, 39, 136]\nthreshold = 67\ncount = 0\nfor i in range(0, 6 + 1):\n    if values[i] > threshold:\n        count = count + 1\nprint(count)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_11",
        "id": "algo_11",
        "title": "Factorial of 5 Computation",
        "concept": "Factorial Computation",
        "description": "Computes the factorial value iteratively up to 9.",
        "difficulty": "hard",
        "pseudocode": "BEGIN\n  DECLARE limit AS INTEGER\n  limit = 9\n  DECLARE factorial AS INTEGER\n  factorial = 1\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO limit DO\n    factorial = factorial * i\n  ENDFOR\n  PRINT factorial\nEND",
        "python_code": "limit = 9\nfactorial = 1\nfor i in range(1, limit + 1):\n    factorial = factorial * i\nprint(factorial)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_12",
        "id": "algo_12",
        "title": "Sum of Odd Numbers Under 60",
        "concept": "Array Filtering (Count)",
        "description": "Counts the number of elements in an array that are strictly greater than 10.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE collection AS ARRAY\n  collection = [41, 99, 122, 48, 65, 26, 49, 116]\n  DECLARE threshold AS INTEGER\n  threshold = 10\n  DECLARE count AS INTEGER\n  count = 0\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 7 DO\n    IF collection[i] > threshold THEN\n      count = count + 1\n    ENDIF\n  ENDFOR\n  PRINT count\nEND",
        "python_code": "collection = [41, 99, 122, 48, 65, 26, 49, 116]\nthreshold = 10\ncount = 0\nfor i in range(0, 7 + 1):\n    if collection[i] > threshold:\n        count = count + 1\nprint(count)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_13",
        "id": "algo_13",
        "title": "Identify Multiples of 3 and 5",
        "concept": "Array Filtering (Count)",
        "description": "Counts the number of elements in an array that are strictly greater than 60.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE items AS ARRAY\n  items = [142, 132, 49, 117, 115, 110, 49, 138]\n  DECLARE threshold AS INTEGER\n  threshold = 60\n  DECLARE count AS INTEGER\n  count = 0\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 7 DO\n    IF items[i] > threshold THEN\n      count = count + 1\n    ENDIF\n  ENDFOR\n  PRINT count\nEND",
        "python_code": "items = [142, 132, 49, 117, 115, 110, 49, 138]\nthreshold = 60\ncount = 0\nfor i in range(0, 7 + 1):\n    if items[i] > threshold:\n        count = count + 1\nprint(count)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_14",
        "id": "algo_14",
        "title": "Multiply Array Elements by 6",
        "concept": "In-Place Array Transformation",
        "description": "Multiplies every element in the array iteratively by 3.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE items AS ARRAY\n  items = [8, 8, 7, 5, 5, 12]\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 5 DO\n    items[i] = items[i] * 3\n  ENDFOR\n  PRINT items\nEND",
        "python_code": "items = [8, 8, 7, 5, 5, 12]\nfor i in range(0, 5 + 1):\n    items[i] = items[i] * 3\nprint(items)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_15",
        "id": "algo_15",
        "title": "Factorial of 7 Computation",
        "concept": "Array Filtering (Count)",
        "description": "Counts the number of elements in an array that are strictly greater than 37.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE source AS ARRAY\n  source = [63, 71, 119, 44, 88, 37]\n  DECLARE threshold AS INTEGER\n  threshold = 37\n  DECLARE count AS INTEGER\n  count = 0\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 5 DO\n    IF source[i] > threshold THEN\n      count = count + 1\n    ENDIF\n  ENDFOR\n  PRINT count\nEND",
        "python_code": "source = [63, 71, 119, 44, 88, 37]\nthreshold = 37\ncount = 0\nfor i in range(0, 5 + 1):\n    if source[i] > threshold:\n        count = count + 1\nprint(count)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_16",
        "id": "algo_16",
        "title": "Sum of Odd Numbers Under 70",
        "concept": "Factorial Computation",
        "description": "Computes the factorial value iteratively up to 5.",
        "difficulty": "hard",
        "pseudocode": "BEGIN\n  DECLARE limit AS INTEGER\n  limit = 5\n  DECLARE factorial AS INTEGER\n  factorial = 1\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO limit DO\n    factorial = factorial * i\n  ENDFOR\n  PRINT factorial\nEND",
        "python_code": "limit = 5\nfactorial = 1\nfor i in range(1, limit + 1):\n    factorial = factorial * i\nprint(factorial)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_17",
        "id": "algo_17",
        "title": "Modulo Branching Logic (Range to 30)",
        "concept": "Modulo Branching Logic",
        "description": "Iterates to 21, identifying multiples of 2 and 7.",
        "difficulty": "moderate",
        "pseudocode": "BEGIN\n  DECLARE count AS INTEGER\n  count = 0\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO 21 DO\n    IF i MOD 2 == 0 THEN\n      count = count + 1\n    ELSE IF i MOD 7 == 0 THEN\n      count = count + 2\n    ELSE\n      count = count - 1\n    ENDIF\n  ENDFOR\n  PRINT count\nEND",
        "python_code": "count = 0\nfor i in range(1, 21 + 1):\n    if i % 2 == 0:\n        count = count + 1\n    elif i % 7 == 0:\n        count = count + 2\n    else:\n        count = count - 1\nprint(count)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_18",
        "id": "algo_18",
        "title": "Multiply Array Elements by 2",
        "concept": "While Loop Mathematical Series",
        "description": "Calculates the sum of odd numbers strictly less than 24.",
        "difficulty": "moderate",
        "pseudocode": "BEGIN\n  DECLARE val AS INTEGER\n  val = 0\n  DECLARE i AS INTEGER\n  i = 1\n  WHILE i < 24 DO\n    val = val + i\n    i = i + 2\n  ENDWHILE\n  PRINT val\nEND",
        "python_code": "val = 0\ni = 1\nwhile i < 24:\n    val = val + i\n    i = i + 2\nprint(val)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_19",
        "id": "algo_19",
        "title": "Factorial of 4 Computation",
        "concept": "Factorial Computation",
        "description": "Computes the factorial value iteratively up to 9.",
        "difficulty": "hard",
        "pseudocode": "BEGIN\n  DECLARE limit AS INTEGER\n  limit = 9\n  DECLARE factorial AS INTEGER\n  factorial = 1\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO limit DO\n    factorial = factorial * i\n  ENDFOR\n  PRINT factorial\nEND",
        "python_code": "limit = 9\nfactorial = 1\nfor i in range(1, limit + 1):\n    factorial = factorial * i\nprint(factorial)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_20",
        "id": "algo_20",
        "title": "Sum of Odd Numbers Under 50",
        "concept": "Modulo Branching Logic",
        "description": "Iterates to 49, identifying multiples of 4 and 6.",
        "difficulty": "moderate",
        "pseudocode": "BEGIN\n  DECLARE count AS INTEGER\n  count = 0\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO 49 DO\n    IF i MOD 4 == 0 THEN\n      count = count + 1\n    ELSE IF i MOD 6 == 0 THEN\n      count = count + 2\n    ELSE\n      count = count - 1\n    ENDIF\n  ENDFOR\n  PRINT count\nEND",
        "python_code": "count = 0\nfor i in range(1, 49 + 1):\n    if i % 4 == 0:\n        count = count + 1\n    elif i % 6 == 0:\n        count = count + 2\n    else:\n        count = count - 1\nprint(count)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_21",
        "id": "algo_21",
        "title": "Find Multiples of 4 and 6",
        "concept": "In-Place Array Transformation",
        "description": "Multiplies every element in the array iteratively by 3.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE collection AS ARRAY\n  collection = [3, 8, 2, 10, 3, 11, 9, 1]\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 7 DO\n    collection[i] = collection[i] * 3\n  ENDFOR\n  PRINT collection\nEND",
        "python_code": "collection = [3, 8, 2, 10, 3, 11, 9, 1]\nfor i in range(0, 7 + 1):\n    collection[i] = collection[i] * 3\nprint(collection)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_22",
        "id": "algo_22",
        "title": "Multiply Array Elements by 7",
        "concept": "Factorial Computation",
        "description": "Computes the factorial value iteratively up to 4.",
        "difficulty": "hard",
        "pseudocode": "BEGIN\n  DECLARE limit AS INTEGER\n  limit = 4\n  DECLARE factorial AS INTEGER\n  factorial = 1\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO limit DO\n    factorial = factorial * i\n  ENDFOR\n  PRINT factorial\nEND",
        "python_code": "limit = 4\nfactorial = 1\nfor i in range(1, limit + 1):\n    factorial = factorial * i\nprint(factorial)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_23",
        "id": "algo_23",
        "title": "Factorial of 9 Computation",
        "concept": "In-Place Array Transformation",
        "description": "Multiplies every element in the array iteratively by 5.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE list_vals AS ARRAY\n  list_vals = [2, 14, 20, 7, 7, 18]\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 5 DO\n    list_vals[i] = list_vals[i] * 5\n  ENDFOR\n  PRINT list_vals\nEND",
        "python_code": "list_vals = [2, 14, 20, 7, 7, 18]\nfor i in range(0, 5 + 1):\n    list_vals[i] = list_vals[i] * 5\nprint(list_vals)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_24",
        "id": "algo_24",
        "title": "Sum of Odd Numbers Under 40",
        "concept": "Array Filtering (Count)",
        "description": "Counts the number of elements in an array that are strictly greater than 34.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE items AS ARRAY\n  items = [115, 109, 138, 39, 121, 127, 146]\n  DECLARE threshold AS INTEGER\n  threshold = 34\n  DECLARE count AS INTEGER\n  count = 0\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 6 DO\n    IF items[i] > threshold THEN\n      count = count + 1\n    ENDIF\n  ENDFOR\n  PRINT count\nEND",
        "python_code": "items = [115, 109, 138, 39, 121, 127, 146]\nthreshold = 34\ncount = 0\nfor i in range(0, 6 + 1):\n    if items[i] > threshold:\n        count = count + 1\nprint(count)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_25",
        "id": "algo_25",
        "title": "Modulo Branching Logic (Range to 25)",
        "concept": "Modulo Branching Logic",
        "description": "Iterates to 45, identifying multiples of 2 and 6.",
        "difficulty": "moderate",
        "pseudocode": "BEGIN\n  DECLARE count AS INTEGER\n  count = 0\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO 45 DO\n    IF i MOD 2 == 0 THEN\n      count = count + 1\n    ELSE IF i MOD 6 == 0 THEN\n      count = count + 2\n    ELSE\n      count = count - 1\n    ENDIF\n  ENDFOR\n  PRINT count\nEND",
        "python_code": "count = 0\nfor i in range(1, 45 + 1):\n    if i % 2 == 0:\n        count = count + 1\n    elif i % 6 == 0:\n        count = count + 2\n    else:\n        count = count - 1\nprint(count)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_26",
        "id": "algo_26",
        "title": "Multiply Array Elements by 8",
        "concept": "While Loop Mathematical Series",
        "description": "Calculates the sum of odd numbers strictly less than 66.",
        "difficulty": "moderate",
        "pseudocode": "BEGIN\n  DECLARE maximum AS INTEGER\n  maximum = 0\n  DECLARE i AS INTEGER\n  i = 1\n  WHILE i < 66 DO\n    maximum = maximum + i\n    i = i + 2\n  ENDWHILE\n  PRINT maximum\nEND",
        "python_code": "maximum = 0\ni = 1\nwhile i < 66:\n    maximum = maximum + i\n    i = i + 2\nprint(maximum)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_27",
        "id": "algo_27",
        "title": "Factorial of 10 Computation",
        "concept": "In-Place Array Transformation",
        "description": "Multiplies every element in the array iteratively by 3.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE data AS ARRAY\n  data = [4, 6, 11, 8, 3, 20, 3, 16]\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 7 DO\n    data[i] = data[i] * 3\n  ENDFOR\n  PRINT data\nEND",
        "python_code": "data = [4, 6, 11, 8, 3, 20, 3, 16]\nfor i in range(0, 7 + 1):\n    data[i] = data[i] * 3\nprint(data)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_28",
        "id": "algo_28",
        "title": "Sum of Odd Numbers Under 30",
        "concept": "In-Place Array Transformation",
        "description": "Multiplies every element in the array iteratively by 5.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE data AS ARRAY\n  data = [1, 19, 12, 10, 13, 20, 18]\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 6 DO\n    data[i] = data[i] * 5\n  ENDFOR\n  PRINT data\nEND",
        "python_code": "data = [1, 19, 12, 10, 13, 20, 18]\nfor i in range(0, 6 + 1):\n    data[i] = data[i] * 5\nprint(data)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_29",
        "id": "algo_29",
        "title": "Modulo Branching Logic (Range to 50)",
        "concept": "In-Place Array Transformation",
        "description": "Multiplies every element in the array iteratively by 5.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE numbers AS ARRAY\n  numbers = [16, 7, 16, 9, 20, 12, 20]\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 6 DO\n    numbers[i] = numbers[i] * 5\n  ENDFOR\n  PRINT numbers\nEND",
        "python_code": "numbers = [16, 7, 16, 9, 20, 12, 20]\nfor i in range(0, 6 + 1):\n    numbers[i] = numbers[i] * 5\nprint(numbers)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_30",
        "id": "algo_30",
        "title": "Multiply Array Elements by 9",
        "concept": "Factorial Computation",
        "description": "Computes the factorial value iteratively up to 5.",
        "difficulty": "hard",
        "pseudocode": "BEGIN\n  DECLARE limit AS INTEGER\n  limit = 5\n  DECLARE factorial AS INTEGER\n  factorial = 1\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO limit DO\n    factorial = factorial * i\n  ENDFOR\n  PRINT factorial\nEND",
        "python_code": "limit = 5\nfactorial = 1\nfor i in range(1, limit + 1):\n    factorial = factorial * i\nprint(factorial)",
        "createdAt": "2025-08-08"
    }
];

function makeSeedAct(id, student, studentId, exercise, difficulty, status, score, dateStr, errorType, procTime, instructorId = 'u2') {
    return {
        _docId: id, student, studentId, exercise,
        difficulty: difficulty || 'moderate', status, score,
        time: dateStr, timestamp: new Date(dateStr).getTime(),
        errorType: errorType || null,
        processingTime: procTime || '0.0s',
        instructorId: instructorId || 'u2',
        submittedCode: 'BEGIN\n  PRINT "Hello World"\nEND',
        pseudocode: 'BEGIN\n  PRINT "Hello World"\nEND',
        pythonCode: 'print("Hello World")',
        python_code: 'print("Hello World")',
        result: status === 'Completed' ? 'Success' : (status === 'Failed' ? (errorType || 'Syntax Error') : 'Pending'),
        output: status === 'Failed' ? `Error: ${errorType} during compilation` : 'Execution successful.\n'
    };
}

function getInitialSeedActivity() {
    const list = [
        makeSeedAct('act_sp_1', 'John Cruz', '2024-001', 'Sum of Odd Numbers Under 90', 'moderate', 'Completed', '100%', '2025-08-08T10:15:00', null, '0.85s', 'u2'),
        makeSeedAct('act_sp_2', 'Maria Santos', '2024-002', 'Factorial of 6 Computation', 'hard', 'Completed', '85%', '2025-08-08T10:32:00', null, '1.21s', 'u2'),
        makeSeedAct('act_sp_3', 'Kevin Ramos', '2024-003', 'Multiply Array Elements by 4', 'easy', 'Failed', '0%', '2025-08-08T11:05:00', 'Syntax Error', '0.65s', 'u2'),
        makeSeedAct('act_sp_4', 'Anna Reyes', '2024-004', 'Count Multiples of 4 and 7', 'moderate', 'Pending', '—', '2025-08-08T11:20:00', null, '—', 'u2'),
        makeSeedAct('act_sp_5', 'Joshua Garcia', '2024-005', 'Multiply Array Elements by 5', 'easy', 'Completed', '90%', '2025-08-08T11:45:00', null, '0.42s', 'u2'),
        makeSeedAct('act_sp_6', 'Carlo Mendoza', '2024-006', 'Factorial of 8 Computation', 'hard', 'Failed', '0%', '2025-08-07T09:15:00', 'Missing END', '0.51s', 'u2'),
        makeSeedAct('act_sp_7', 'Patricia Flores', '2024-007', 'Sum of Odd Numbers Under 95', 'moderate', 'Completed', '100%', '2025-08-07T11:20:00', null, '0.74s', 'u2'),
        makeSeedAct('act_sp_8', 'Mark Bautista', '2024-008', 'Count Multiples of 4 and 7', 'moderate', 'Failed', '0%', '2025-08-07T14:40:00', 'Logic Error', '0.88s', 'u2'),
        makeSeedAct('act_sp_9', 'Nicole Dela Cruz', '2024-009', 'Factorial of 5 Computation', 'hard', 'Completed', '95%', '2025-08-07T15:10:00', null, '1.05s', 'u2'),
        makeSeedAct('act_sp_10', 'Michael Reyes', '2024-009', 'Multiply Array Elements by 3', 'easy', 'Failed', '0%', '2025-08-06T10:00:00', 'Indentation Error', '0.45s', 'u2'),
        makeSeedAct('act_sp_11', 'Christian Alde', '2024-010', 'Sum of Odd Numbers Under 60', 'easy', 'Completed', '100%', '2025-08-06T11:15:00', null, '0.62s', 'u2'),
        makeSeedAct('act_sp_12', 'Jessica Pascual', '2024-011', 'Identify Multiples of 3 and 5', 'easy', 'Failed', '0%', '2025-08-06T13:25:00', 'Type Error', '0.59s', 'u2'),
        makeSeedAct('act_sp_13', 'Aldrin Castro', '2024-012', 'Factorial of 7 Computation', 'hard', 'Completed', '90%', '2025-08-06T14:50:00', null, '1.15s', 'u2'),
        makeSeedAct('act_sp_14', 'Kenneth Santos', '2024-013', 'Multiply Array Elements by 6', 'easy', 'Completed', '100%', '2025-08-05T09:30:00', null, '0.38s', 'u2'),
        makeSeedAct('act_sp_15', 'Jasmine Aquino', '2024-014', 'Modulo Branching Logic', 'moderate', 'Failed', '0%', '2025-08-05T10:45:00', 'Syntax Error', '0.71s', 'u2'),
        makeSeedAct('act_sp_16', 'Justin Ferrer', '2024-015', 'Multiply Array Elements by 2', 'moderate', 'Completed', '85%', '2025-08-05T13:10:00', null, '0.82s', 'u2'),
        makeSeedAct('act_sp_17', 'Bianca De Leon', '2024-016', 'Sum of Odd Numbers Under 80', 'moderate', 'Failed', '0%', '2025-08-05T15:20:00', 'Missing END', '0.49s', 'u2'),
        makeSeedAct('act_sp_18', 'Aaron Dizon', '2024-017', 'Factorial of 4 Computation', 'hard', 'Completed', '100%', '2025-08-04T08:50:00', null, '0.95s', 'u2'),
        makeSeedAct('act_sp_19', 'Camille Valenzuela', '2024-018', 'Sum of Odd Numbers Under 50', 'moderate', 'Failed', '0%', '2025-08-04T10:15:00', 'Logic Error', '0.77s', 'u2'),
        makeSeedAct('act_sp_20', 'Dominic Ramos', '2024-019', 'Find Multiples of 4 and 6', 'easy', 'Completed', '90%', '2025-08-04T11:40:00', null, '0.41s', 'u2'),
        makeSeedAct('act_sp_21', 'Ella Salvador', '2024-020', 'Multiply Array Elements by 7', 'hard', 'Completed', '100%', '2025-08-04T14:05:00', null, '1.30s', 'u2'),
        makeSeedAct('act_sp_22', 'Adrian Tolentino', '2024-021', 'Factorial of 9 Computation', 'easy', 'Failed', '0%', '2025-08-04T15:30:00', 'Syntax Error', '0.66s', 'u2'),
        makeSeedAct('act_sp_23', 'Sofia Corpuz', '2024-022', 'Sum of Odd Numbers Under 40', 'easy', 'Completed', '100%', '2025-08-03T09:10:00', null, '0.55s', 'u2'),
        makeSeedAct('act_sp_24', 'Patrick Hernandez', '2024-023', 'Modulo Branching Logic', 'moderate', 'Failed', '0%', '2025-08-03T11:25:00', 'Indentation Error', '0.48s', 'u2'),
        makeSeedAct('act_sp_25', 'Hazel Gonzales', '2024-024', 'Multiply Array Elements by 8', 'moderate', 'Completed', '95%', '2025-08-03T13:40:00', null, '0.80s', 'u2'),
        makeSeedAct('act_sp_26', 'Gabriel Santiago', '2024-025', 'Factorial of 10 Computation', 'easy', 'Completed', '100%', '2025-08-02T10:00:00', null, '0.44s', 'u2'),
        makeSeedAct('act_sp_27', 'Abigail Ramos', '2024-026', 'Sum of Odd Numbers Under 30', 'easy', 'Failed', '0%', '2025-08-02T11:15:00', 'Logic Error', '0.69s', 'u2'),
        makeSeedAct('act_sp_28', 'Ryan Ocampo', '2024-027', 'Modulo Branching Logic', 'easy', 'Completed', '85%', '2025-08-02T14:30:00', null, '0.58s', 'u2'),
        makeSeedAct('act_sp_29', 'Megan Custodio', '2024-028', 'Multiply Array Elements by 9', 'hard', 'Failed', '0%', '2025-08-01T09:45:00', 'Syntax Error', '0.83s', 'u2'),
        makeSeedAct('act_sp_30', 'Kyle Dela Rosa', '2024-029', 'Sum of Odd Numbers Under 90', 'moderate', 'Completed', '100%', '2025-08-01T11:00:00', null, '0.72s', 'u2'),
        makeSeedAct('act_sp_em1', 'Eduard John Mirandilla', '2024-031', 'Sum of Odd Numbers Under 90', 'moderate', 'Completed', '100%', '2025-08-08T14:20:00', null, '0.78s', 'u2'),
        makeSeedAct('act_sp_em2', 'Eduard John Mirandilla', '2024-031', 'Factorial of 6 Computation', 'hard', 'Completed', '95%', '2025-08-07T16:10:00', null, '1.10s', 'u2'),
        makeSeedAct('act_sp_md1', 'Mikaella Daet', '2024-032', 'Multiply Array Elements by 4', 'easy', 'Completed', '90%', '2025-08-08T15:00:00', null, '0.52s', 'u2'),
        makeSeedAct('act_sp_md2', 'Mikaella Daet', '2024-032', 'Count Multiples of 4 and 7', 'moderate', 'Completed', '100%', '2025-08-06T11:30:00', null, '0.89s', 'u2'),
    ];
    return list;
}

const SEED_ACTIVITY_LIST = getInitialSeedActivity();

// Local Storage Fallback Map
function getLocalCollection(ref) {
    let list = null;
    try {
        const raw = localStorage.getItem(`pseudopy_local_${ref}`);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
                list = parsed;
            }
        }
    } catch (e) { }

    if (!list) {
        if (ref === usersRef) list = getInitialSeedUsers();
        else if (ref === exercisesRef) list = SEED_EXERCISES_LIST;
        else if (ref === activityRef) list = getInitialSeedActivity();
        else if (ref === evidenceRef && PseudoPyLearning && PseudoPyLearning.register) list = PseudoPyLearning.register.evidenceStore.getSeedEvidence();
        else list = [];
    }

    if (ref === usersRef && Array.isArray(list)) list = list.map(upgradeDefaultAdminAccount);

    // Guarantee that standard seed instructor exists in user list
    if (ref === usersRef && Array.isArray(list)) {
        const hasMarc = list.some(u => u.username === 'mreantaso_instructor' || u.id === 'u2' || u._docId === 'u2');
        if (!hasMarc) {
            const marc = getInitialSeedUsers().find(u => u.username === 'mreantaso_instructor');
            if (marc) list.splice(1, 0, marc);
        }
    }

    // Guarantee that activity list always has the full rich demo dataset merged in
    if (ref === activityRef && Array.isArray(list)) {
        if (list.length < 15) {
            list = getInitialSeedActivity();
        } else {
            // Merge missing seed records so chart always has all demo bars
            const seedRecords = getInitialSeedActivity();
            const existingIds = new Set(list.map(a => a._docId));
            const missingSeeds = seedRecords.filter(s => !existingIds.has(s._docId));
            if (missingSeeds.length > 0) list = [...list, ...missingSeeds];
        }
    }

    setLocalCollection(ref, list);
    return list;
}

function setLocalCollection(ref, data) {
    try {
        localStorage.setItem(`pseudopy_local_${ref}`, JSON.stringify(data));
    } catch (e) { }
}

/* ============================================================
   OFFLINE DATA STORE — IndexedDB (OfflineStore)
   Durable companion to the existing localStorage cache:
   - caches a mirrored copy of each local collection
   - hosts the offline mutation queue (durable, survives restarts)
   - stores sync/migration metadata

   Reads intentionally stay on the synchronous localStorage/memory
   path used across the app; these IndexedDB writes run in parallel
   and are best-effort. If IndexedDB is unavailable (private
   browsing, storage evicted, blocked upgrade, quota) the app is
   unaffected: every call falls back to today's localStorage
   behaviour, exactly as before.
   ============================================================ */

const OFFLINE_DB_NAME = 'pseudopy-offline';
const OFFLINE_DB_VERSION = 1;

const OFFLINE_STORES = {
    collections: 'collections',
    mutations: 'mutations',
    meta: 'meta'
};

const OFFLINE_MIGRATION_META = 'migrations.local-collections';
const OFFLINE_LOCAL_PREFIX = 'pseudopy_local_';

let offlineDb = null;
let offlineDbOpening = null;

/** True only when IndexedDB is actually available to open (safe to call anywhere). */
function offlineIdbAvailable() {
    try {
        return typeof indexedDB !== 'undefined' && typeof indexedDB.open === 'function';
    } catch (e) {
        return false;
    }
}

/** Create the request wrapper for an object-store transaction in the offline DB. */
function offlineTransaction(db, storeName, mode) {
    return db.transaction(storeName, mode);
}

/** Low-level promisified op; run(store, done) wires done() to the request onsuccess. */
function offlineOp(db, storeName, mode, run) {
    return new Promise(function (resolve, reject) {
        let transaction;
        try {
            transaction = offlineTransaction(db, storeName, mode);
        } catch (e) {
            reject(e);
            return;
        }
        let captured;
        let settled = false;
        const finish = function () {
            if (settled) return;
            settled = true;
            if (transaction.error) reject(transaction.error);
            else resolve(captured);
        };
        transaction.oncomplete = finish;
        transaction.onerror = function () {
            if (settled) return;
            settled = true;
            reject(transaction.error || new Error('IndexedDB transaction failed'));
        };
        transaction.onabort = function () {
            if (settled) return;
            settled = true;
            reject(transaction.error || new Error('IndexedDB transaction aborted'));
        };
        try {
            run(transaction.objectStore(storeName), function (value) { captured = value; });
        } catch (e) {
            if (!settled) { settled = true; reject(e); }
        }
    });
}

/**
 * Resolve the shared IndexedDB instance. Returns null (never throws) when
 * IndexedDB is unsupported, blocked or failed so callers keep the fallback.
 */
function openOfflineDb() {
    if (offlineDb) return Promise.resolve(offlineDb);
    if (offlineDbOpening) return offlineDbOpening;
    if (!offlineIdbAvailable()) return Promise.resolve(null);

    offlineDbOpening = new Promise(function (resolve) {
        let request;
        try {
            request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
        } catch (e) {
            offlineDbOpening = null;
            resolve(null);
            return;
        }
        request.onupgradeneeded = function () {
            const db = request.result;
            if (!db.objectStoreNames.contains(OFFLINE_STORES.collections)) {
                db.createObjectStore(OFFLINE_STORES.collections, { keyPath: 'ref' });
            }
            if (!db.objectStoreNames.contains(OFFLINE_STORES.mutations)) {
                const store = db.createObjectStore(OFFLINE_STORES.mutations, { keyPath: 'mutationId' });
                store.createIndex('byCreatedAt', 'createdAt', { unique: false });
            }
            if (!db.objectStoreNames.contains(OFFLINE_STORES.meta)) {
                db.createObjectStore(OFFLINE_STORES.meta, { keyPath: 'key' });
            }
        };
        request.onsuccess = function () {
            offlineDb = request.result;
            offlineDb.onversionchange = function () { try { offlineDb.close(); } catch (e) { /* other tab */ } offlineDb = null; };
            offlineDbOpening = null;
            resolve(offlineDb);
        };
        request.onerror = function () {
            offlineDbOpening = null;
            offlineDb = null;
            resolve(null);
        };
        request.onblocked = function () {
            offlineDbOpening = null;
            resolve(null);
        };
    });
    return offlineDbOpening;
}

/** Best-effort expiry-touch for the offline DB; never fails callers. */
async function offlineGet(db, storeName, key) {
    if (!db) return undefined;
    return await offlineOp(db, storeName, 'readonly', function (store, done) {
        const req = store.get(key);
        req.onsuccess = function () { done(req.result); };
    });
}

async function offlinePut(db, storeName, record) {
    if (!db) return;
    await offlineOp(db, storeName, 'readwrite', function (store, done) {
        const req = store.put(record);
        req.onsuccess = function () { done(req.result); };
    });
}

async function offlineDelete(db, storeName, key) {
    if (!db) return;
    await offlineOp(db, storeName, 'readwrite', function (store, done) {
        const req = store.delete(key);
        req.onsuccess = function () { done(req.result); };
    });
}

/** Read every record in a store (small stores only). */
async function offlineGetAll(db, storeName) {
    if (!db) return [];
    return await offlineOp(db, storeName, 'readonly', function (store, done) {
        const req = store.getAll();
        req.onsuccess = function () { done(req.result || []); };
    });
}

// ── OfflineStore adapter ─────────────────────────────────────
// Every method is async and best-effort. Returns null/[]/false on any
// failure so the app keeps behaving exactly as before when IDB is absent.

const offlineStore = {
    isAvailable: offlineIdbAvailable,

    open: openOfflineDb,

    async getCollection(ref) {
        try {
            const db = await openOfflineDb();
            if (!db) return null;
            const rec = await offlineGet(db, OFFLINE_STORES.collections, ref);
            return rec && Array.isArray(rec.docs) ? rec.docs : null;
        } catch (e) {
            return null;
        }
    },

    async setCollection(ref, docs) {
        try {
            const db = await openOfflineDb();
            if (!db) return;
            await offlinePut(db, OFFLINE_STORES.collections, { ref, docs: Array.isArray(docs) ? docs : [], updatedAt: Date.now() });
        } catch (e) { /* best-effort mirror */ }
    },

    async getDocument(ref, docId) {
        const docs = await this.getCollection(ref);
        if (!docs) return null;
        return docs.find(d => d._docId === docId || d.id === docId) || null;
    },

    async setDocument(ref, doc) {
        const docs = (await this.getCollection(ref)) || [];
        const targetId = doc && (doc._docId || doc.id);
        const idx = targetId ? docs.findIndex(d => d._docId === targetId || d.id === targetId) : -1;
        if (idx >= 0) docs[idx] = doc;
        else docs.unshift(doc);
        await this.setCollection(ref, docs);
    },

    async deleteDocument(ref, docId) {
        const docs = (await this.getCollection(ref)) || [];
        const next = docs.filter(d => d._docId !== docId && d.id !== docId);
        await this.setCollection(ref, next);
    },

    async clearCollection(ref) {
        await this.setCollection(ref, []);
    },

    async metaGet(key) {
        try {
            const db = await openOfflineDb();
            if (!db) return undefined;
            return await offlineGet(db, OFFLINE_STORES.meta, key);
        } catch (e) {
            return undefined;
        }
    },

    async metaSet(key, value) {
        try {
            const db = await openOfflineDb();
            if (!db) return;
            await offlinePut(db, OFFLINE_STORES.meta, { key, ...value });
        } catch (e) { /* best-effort */ }
    },

    // ── Mutation queue low-level records ──
    async getMutations() {
        try {
            const db = await openOfflineDb();
            if (!db) return null;
            return await offlineGetAll(db, OFFLINE_STORES.mutations);
        } catch (e) {
            return null;
        }
    },

    async putMutation(record) {
        const db = await openOfflineDb();
        if (!db) throw new Error('IndexedDB unavailable');
        await offlinePut(db, OFFLINE_STORES.mutations, record);
    },

    async removeMutation(mutationId) {
        const db = await openOfflineDb();
        if (!db) throw new Error('IndexedDB unavailable');
        await offlineDelete(db, OFFLINE_STORES.mutations, mutationId);
    }

};

/**
 * One-time, non-destructive migration: copy any existing
 * pseudopy_local_<ref> collections into the IndexedDB mirror. Runs at boot;
 * never deletes or rewrites localStorage (kept for backward compatibility).
 */
async function ensureOfflineDataMigration() {
    if (!offlineIdbAvailable()) return;
    if (typeof localStorage === 'undefined') return;
    try {
        const migrated = await offlineStore.metaGet(OFFLINE_MIGRATION_META);
        if (migrated && migrated.done) return;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || key.indexOf(OFFLINE_LOCAL_PREFIX) !== 0) continue;
            const ref = key.slice(OFFLINE_LOCAL_PREFIX.length);
            const existing = await offlineStore.getCollection(ref);
            if (existing && existing.length > 0) continue;
            let docs;
            try {
                docs = JSON.parse(localStorage.getItem(key));
            } catch (e) {
                continue;
            }
            if (!Array.isArray(docs)) continue;
            await offlineStore.setCollection(ref, docs);
        }
        await offlineStore.metaSet(OFFLINE_MIGRATION_META, { done: true, migratedAt: new Date().toISOString() });
    } catch (e) {
        console.info('[Offline] Migration skipped (best-effort):', e && e.message);
    }
}/* ============================================================
   OFFLINE MUTATION QUEUE
   Durable record of writes that could not reach Firestore, so a
   temporary outage never silently loses a local change and every
   queued write synchronizes once connectivity returns.

   Primary storage: IndexedDB (offlineStore). When IndexedDB is
   unavailable the queue degrades to a localStorage array so writes
   are still never silently discarded.

   Coalescing rules (keep the queue lean without changing semantic
   order):
   - ADD/SET then UPDATE    → folded into the ADD/SET payload
   - UPDATE then UPDATE     → merged, latest keys win
   - UPDATE then ADD/SET    → replaced by the ADD/SET payload
   - DELETE                 → cancels any earlier pending op for
                              the same document (net: delete wins)
   - ADD → DELETE ordering  → preserved / collapse to a delete
   ============================================================ */

const MUTATION_QUEUE_LIMIT = 500;
let mutationQueueLock = Promise.resolve();

// Serialize read/modify/write across callbacks and tabs where Web Locks is available.
function withMutationQueueLock(work) {
    const run = () => typeof navigator !== 'undefined' && navigator.locks
        ? navigator.locks.request('pseudopy-mutation-queue', work) : work();
    const task = mutationQueueLock.then(run, run);
    mutationQueueLock = task.catch(() => {});
    return task;
}

function queueStorageError(message, cause) {
    const error = new Error(message);
    error.code = 'queue-storage';
    error.localOnly = true;
    error.cause = cause;
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pseudopy:sync-error', { detail: { code: error.code, message } }));
    }
    return error;
}

const OFFLINE_QUEUE_FALLBACK_KEY = 'pseudopy_offline_queue';

const MUTATION_STATUS = {
    PENDING: 'PENDING',
    SYNCING: 'SYNCING',
    SYNCED: 'SYNCED',
    FAILED: 'FAILED',
    BLOCKED_PERMISSION: 'blocked-permission'
};

const MUTATION_OP_ADD = 'ADD';
const MUTATION_OP_SET = 'SET';
const MUTATION_OP_UPDATE = 'UPDATE';
const MUTATION_OP_DELETE = 'DELETE';

/** Stable unique id: crypto.randomUUID where available, safe fallback otherwise. */
function generateMutationId() {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    } catch (e) { /* fall through */ }
    return 'm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10) + '_' + Math.random().toString(36).slice(2, 6);
}

function mergeDoc(base, overlay) {
    const merged = Object.assign({}, base || {});
    if (overlay && typeof overlay === 'object') {
        for (const key of Object.keys(overlay)) {
            if (overlay[key] !== undefined) merged[key] = overlay[key];
        }
    }
    return merged;
}

// ── Storage backend: IDB first, localStorage fallback ────────

function queueFallbackList() {
    try {
        const raw = localStorage.getItem(OFFLINE_QUEUE_FALLBACK_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

function queueFallbackSave(list) {
    try {
        localStorage.setItem(OFFLINE_QUEUE_FALLBACK_KEY, JSON.stringify(list));
    } catch (e) {
        throw queueStorageError('Sync queue could not be saved. Keep this page open and export your work before closing it.', e);
    }
}

async function queueReadRecords() {
    const fallback = queueFallbackList();
    if (offlineStore && offlineStore.isAvailable && offlineStore.isAvailable()) {
        const records = await offlineStore.getMutations();
        if (records) {
            const merged = new Map(records.map(r => [r.mutationId, r]));
            for (const r of fallback) merged.set(r.mutationId, r);
            return [...merged.values()];
        }
    }
    return fallback;
}

async function queueWriteRecord(record) {
    if (offlineStore && offlineStore.isAvailable && offlineStore.isAvailable()) {
        try {
            await offlineStore.putMutation(record);
            const fallback = queueFallbackList();
            if (fallback.some(r => r.mutationId === record.mutationId)) {
                queueFallbackSave(fallback.filter(r => r.mutationId !== record.mutationId));
            }
            return;
        } catch (e) { /* durable fallback below */ }
    }
    const list = queueFallbackList();
    const idx = list.findIndex(r => r.mutationId === record.mutationId);
    if (idx >= 0) list[idx] = record;
    else list.push(record);
    queueFallbackSave(list);
}

async function queueRemoveRecord(mutationId) {
    if (offlineStore && offlineStore.isAvailable && offlineStore.isAvailable()) {
        await offlineStore.removeMutation(mutationId);
    }
    const list = queueFallbackList();
    if (list.some(r => r.mutationId === mutationId)) queueFallbackSave(list.filter(r => r.mutationId !== mutationId));
}

function makeMutationRecord(operation, ref, docId, payload) {
    return {
        mutationId: generateMutationId(),
        operation: String(operation).toUpperCase(),
        collection: ref,
        documentId: docId,
        payload: payload || null,
        createdAt: Date.now(),
        attempts: 0,
        status: MUTATION_STATUS.PENDING,
        lastError: null,
        updatedAt: Date.now()
    };
}

/**
 * Enqueue a write to be replayed once Firestore is reachable. Coalesces where
 * order-safe; returns the (possibly folded) mutation record.
 */
function enqueueMutation(operation, ref, docId, payload) {
    return withMutationQueueLock(() => enqueueMutationLocked(operation, ref, docId, payload));
}

async function enqueueMutationLocked(operation, ref, docId, payload) {
    const op = String(operation).toUpperCase();
    const prior = await listPendingMutations(ref, docId, true);

    // Fold order-safe consecutive operations for the same document.
    // Only fold into the tail: never move an update ahead of a DELETE or an in-flight write.
    const tail = prior[prior.length - 1];
    const pending = tail && [MUTATION_STATUS.PENDING, MUTATION_STATUS.BLOCKED_PERMISSION].includes(tail.status) && tail.operation !== MUTATION_OP_DELETE ? [tail] : [];
    if (pending.length === 1) {
        const existing = Object.assign({}, pending[0]);
        if (op === MUTATION_OP_DELETE) {
            existing.operation = MUTATION_OP_DELETE;
            existing.payload = null;
            existing.updatedAt = Date.now();
            await queueWriteRecord(existing);
            return existing;
        }
        if (existing.operation === MUTATION_OP_ADD || existing.operation === MUTATION_OP_SET) {
            existing.payload = (op === MUTATION_OP_UPDATE) ? mergeDoc(existing.payload, payload) : (payload || null);
        } else {
            // Prior UPDATE, now ADD/SET -> replace the final payload.
            existing.payload = (op === MUTATION_OP_UPDATE) ? mergeDoc(existing.payload, payload) : (payload || null);
            existing.operation = (op === MUTATION_OP_UPDATE) ? MUTATION_OP_UPDATE : op;
        }
        existing.updatedAt = Date.now();
        await queueWriteRecord(existing);
        return existing;
    }

    const records = await listAllMutations();
    if (records.length >= MUTATION_QUEUE_LIMIT) throw queueStorageError('Sync queue is full. Your draft is on this device; export it and retry sync before adding more queued changes.');
    const record = makeMutationRecord(op, ref, docId, payload);
    record.createdAt = Math.max(record.createdAt, ...records.map(r => (r.createdAt || 0) + 1));
    await queueWriteRecord(record);
    return record;
}

/**
 * Pending (not yet synced) mutations, in deterministic createdAt order.
 * Pass includeFailed=true (authoritative-local reads) to also surface FAILED
 * records so a snapshot never overwrites them either.
 */
async function listPendingMutations(ref, docId, includeFailed) {
    const records = await queueReadRecords();
    return records
        .filter(r => r.collection === (ref || r.collection) && r.documentId === (docId || r.documentId))
        .filter(r => r.status === MUTATION_STATUS.PENDING || r.status === MUTATION_STATUS.BLOCKED_PERMISSION || r.status === MUTATION_STATUS.SYNCING || (includeFailed && r.status === MUTATION_STATUS.FAILED))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

/** Every record still owned by the queue (for sync + diagnostics). */
async function listAllMutations() {
    const records = await queueReadRecords();
    return records.slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

async function updateMutationStatus(mutationId, status, lastError, attempts) {
    const records = await queueReadRecords();
    const record = records.find(r => r.mutationId === mutationId);
    if (!record) return null;
    record.status = status || record.status;
    if (lastError !== undefined && lastError !== null) record.lastError = lastError;
    if (typeof attempts === 'number') record.attempts = attempts;
    record.updatedAt = Date.now();
    await queueWriteRecord(record);
    return record;
}

async function removeSyncedMutation(mutationId) {
    await queueRemoveRecord(mutationId);
}

/** Drop PENDING (not SYNCING) mutations for a document after a confirmed remote write. */
async function clearPendingForDocument(ref, docId) {
    const current = await listPendingMutations(ref, docId);
    for (const record of current) {
        if (record.status !== MUTATION_STATUS.SYNCING) {
            await queueRemoveRecord(record.mutationId);
        }
    }
}

/** When a document is deleted locally the sync engine records a final DELETE. */
async function enqueueDocumentDelete(ref, docId) {
    return await enqueueMutation('DELETE', ref, docId, null);
}/* ============================================================
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
let activeSyncPromise = null;
let syncRetryTimer = null;
let syncPermissionBlocked = false;
const SYNC_RECOVERY_REASONS = ['startup', 'auth', 'sign-in', 'online', 'manual-retry'];
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

function scheduleSyncRetry(mutationId, attempt) {
    if (typeof setTimeout !== 'function' || syncRetryTimer !== null) return;
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
    if (recovery) resetCloudCircuit();
    if (syncPermissionBlocked || !firestoreReady() || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
        return { started: false, reason };
    }
    syncInProgress = true;
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
    } finally { syncInProgress = false; }
    return { started: true, synced, failed, skipped, reason };
}

/** Register application-driven sync triggers (registered once at boot). */
function initSyncCoordinator() {
    if (initSyncCoordinator.__bound) return;
    initSyncCoordinator.__bound = true;
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
}// ══════════════════════════════════════════════════════════════
//  CORE CRUD FUNCTIONS (Firestore + Local Sync)
// ══════════════════════════════════════════════════════════════

function cloudSaveFailure(ref, docId, cause) {
    const denied = /permission-denied|unauthenticated/.test(String(cause && cause.code));
    const error = new Error(denied
        ? 'Cloud save denied. Your change is only stored on this device. Ask your administrator to check Firebase authentication and permissions.'
        : 'Cloud save failed. Your change is only stored on this device. Check the connection and try saving again.');
    error.code = cause && cause.code || 'cloud-unavailable';
    error.localOnly = true;
    error.cause = cause;
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pseudopy:sync-error', { detail: { ref, docId, code: error.code, message: error.message } }));
    }
    return error;
}

function cloudSaveComplete(ref, docId) {
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pseudopy:sync-saved', { detail: { ref, docId } }));
    }
}

/**
 * Get all documents from a collection.
 */
async function dbGetAll(ref, limitCount = null, offsetCount = 0) {
    let results = [];

    // 1. Try Firestore
    if (firestoreReady() && (typeof cloudRequestsAllowed !== 'function' || cloudRequestsAllowed())) {
        try {
            const snapshot = await withFirestoreTimeout(firestore.collection(ref).get());
            if (typeof markFirestoreReachable === 'function') markFirestoreReachable(true);
            if (snapshot && !snapshot.empty) {
                results = snapshot.docs.map(doc => ({ _docId: doc.id, ...doc.data() }));
                // For activity, always merge with full seed demo data so charts are rich
                if (ref === activityRef) {
                    const seedRecords = getInitialSeedActivity();
                    const existingIds = new Set(results.map(r => r._docId));
                    const missingSeeds = seedRecords.filter(s => !existingIds.has(s._docId));
                    if (missingSeeds.length > 0) results = [...results, ...missingSeeds];
                }
                // Never let a cloud snapshot fully overwrite locally pending
                // (unsynced) writes: local data wins until the sync engine
                // reconciles the queue and confirms the remote write.
                results = await mergePendingMutationsOverSnapshot(ref, results);
                setLocalCollection(ref, results);
            }
        } catch (err) {
            if (typeof recordCloudFailure === 'function') recordCloudFailure(err);
            console.info(`[Database] Firestore fetch error on ${ref}, using local fallback:`, err.message);
        }
    }

    // 2. Fallback to Local/Seed data if empty.
    if (!results || results.length === 0) {
        results = getLocalCollection(ref);
        // A confirmed permanent deletion must not come back from the local
        // cache or the seed data when the cloud is unreachable.
        if (ref === usersRef && typeof dropHardDeletedProfiles === 'function') {
            results = dropHardDeletedProfiles(results);
        }
        // A fallback read must not trigger cloud writes or permission retry loops.
    }

    // Ensure instructor mreantaso_instructor is present in users
    if (ref === usersRef && Array.isArray(results)) {
        const hasMarc = results.some(u => u.username === 'mreantaso_instructor' || u.id === 'u2' || u._docId === 'u2');
        if (!hasMarc) {
            const marc = getInitialSeedUsers().find(u => u.username === 'mreantaso_instructor');
            if (marc) {
                results.splice(1, 0, marc);
                setLocalCollection(ref, results);
            }
        }
    }

    // Client-side sorting
    if (ref === 'pseudopy_exercises') {
        results.sort((a, b) => {
            const aIsNew = (a._docId || '').startsWith('ex');
            const bIsNew = (b._docId || '').startsWith('ex');
            if (aIsNew && !bIsNew) return -1;
            if (!aIsNew && bIsNew) return 1;
            if (aIsNew && bIsNew) return (b._docId || '').localeCompare(a._docId || '');
            const aNum = parseInt((a._docId || '').replace('algo_', '')) || 0;
            const bNum = parseInt((b._docId || '').replace('algo_', '')) || 0;
            return aNum - bNum;
        });
    }
    if (ref === 'pseudopy_activity') {
        results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }
    if (ref === 'pseudopy_auditLog') {
        results.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    }
    if (ref === 'pseudopy_notifications') {
        results.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    // Pagination
    if (limitCount !== null && limitCount !== undefined) {
        const l = parseInt(limitCount, 10);
        const o = parseInt(offsetCount, 10) || 0;
        results = results.slice(o, o + l);
    }

    return results;
}

/**
 * Get a single document by ID.
 * opts.strict (session/identity reads): when Firestore was reachable but the
 * read failed after retries, throw a typed FirestoreUnavailableError instead of
 * silently returning the local fallback, so callers can distinguish "account
 * really gone" from "temporarily offline". Other callers keep the fallback.
 */
async function dbGet(ref, docId, opts = {}) {
    if (firestoreReady() && (typeof cloudRequestsAllowed !== 'function' || cloudRequestsAllowed())) {
        try {
            const doc = await firestoreRetry(() => firestore.collection(ref).doc(docId).get(), { attempts: opts.attempts || 2, timeoutMs: opts.timeoutMs, backoffMs: opts.backoffMs });
            if (typeof markFirestoreReachable === 'function') markFirestoreReachable(true);
            if (doc.exists) return { _docId: doc.id, ...doc.data() };
            return null;
        } catch (err) {
            if (typeof recordCloudFailure === 'function') recordCloudFailure(err);
            if (opts.strict) {
                console.warn(`[Database] Firestore get error on ${ref}/${docId}:`, err.message);
                // Keep the original failure reachable: a permission denial
                // must stay a permanent error after the retry wrapper is
                // applied, or callers will treat it as an outage.
                throw (err && err.name === 'FirestoreUnavailable') ? err : FirestoreUnavailableError(err.message, err);
            }
            console.info(`[Database] Firestore get error on ${ref}/${docId}:`, err.message);
        }
    }

    // Local fallback / cache lookup (never used by strict identity reads)
    const local = getLocalCollection(ref);
    const found = local.find(item => item._docId === docId || item.id === docId) || null;
    return found;
}

/**
 * Optimistic local write: updates the synchronous localStorage cache and the
 * best-effort IndexedDB mirror. Never throws into callers.
 */
function upsertLocalCache(ref, docId, docData, prepend) {
    const local = getLocalCollection(ref);
    const idx = local.findIndex(item => item._docId === docId || item.id === docId);
    if (idx >= 0) local[idx] = docData;
    else if (prepend) local.unshift(docData);
    else local.push(docData);
    setLocalCollection(ref, local);
    if (typeof offlineStore !== 'undefined' && offlineStore && typeof offlineStore.setDocument === 'function') {
        offlineStore.setDocument(ref, docData).catch(function () { /* best-effort mirror */ });
    }
    return docData;
}

/**
 * Overlay locally pending (unsynced) write payloads over a cloud snapshot so a
 * reconnect never silently clobbers changes that have not reached Firestore.
 */
async function mergePendingMutationsOverSnapshot(ref, results) {
    if (typeof listPendingMutations !== 'function') return results;
    try {
        const pending = await listPendingMutations(ref, null, true);
        if (!pending || pending.length === 0) return results;
        const list = (Array.isArray(results) ? results : []).slice();
        for (const mutation of pending) {
            if (!mutation.documentId) continue;
            if (mutation.operation === 'DELETE') {
                const index = list.findIndex(d => d._docId === mutation.documentId || d.id === mutation.documentId);
                if (index >= 0) list.splice(index, 1);
                continue;
            }
            const payload = Object.assign({}, mutation.payload || {}, { _docId: mutation.documentId });
            const idx = list.findIndex(d => d._docId === mutation.documentId || d.id === mutation.documentId);
            if (idx >= 0) list[idx] = mutation.operation === 'UPDATE' ? Object.assign({}, list[idx], payload) : payload;
            else list.unshift(payload);
        }
        return list;
    } catch (e) {
        return results;
    }
}

/**
 * Stamp the ownership + freshness fields a least-privilege ruleset needs.
 *
 * `uid` is the Firebase Auth uid and is the ONLY trusted owner identity; it is
 * added only when a real cloud session exists, so nothing invents an owner.
 * `updatedAt` stays an ISO string to match every other timestamp in this app
 * and to stay JSON-serialisable for the localStorage/IndexedDB fallback — a
 * `serverTimestamp()` sentinel would leak a non-serialisable object into the
 * local cache and the UI.
 */
function withCloudOwnership(payload) {
    const next = Object.assign({}, payload || {});
    if (typeof cloudUid === 'function') {
        const uid = cloudUid();
        if (uid && !next.uid) next.uid = uid;
    }
    if (!next.updatedAt) next.updatedAt = new Date().toISOString();
    return next;
}

/**
 * Write to Firestore with a durable offline queue behind it:
 *  - success        → clear any stale pending mutation, then kick a sync
 *  - transient fail → persist a PENDING mutation (replayed on reconnection)
 *  - permanent fail → structured log only, never queued, never fabricated
 * Reject unconfirmed saves after retaining/queuing them so callers cannot
 * mistake a local write for confirmed cloud persistence.
 */
async function queueFirestoreWrite({ operation, ref, docId, payload }) {
    // Persist before contacting Firestore. A crash or refusal must leave a replayable record.
    const mutation = await enqueueMutation(operation, ref, docId, withCloudOwnership(payload));
    await syncNow('write');
    const remaining = (await listAllMutations()).find(r => r.mutationId === mutation.mutationId);
    if (remaining) {
        const cause = Object.assign(new Error(remaining.lastError || 'Cloud synchronization pending'), {
            code: remaining.status === 'blocked-permission' ? 'permission-denied' : 'unavailable'
        });
        throw cloudSaveFailure(ref, docId, cause);
    }
}

/**
 * Add a new document.
 */
async function dbAdd(ref, data) {
    const docId = data._docId || ('doc_' + Date.now() + '_' + Math.floor(Math.random() * 1000));
    const docData = { ...data, _docId: docId };

    // 1. Optimistic local write (localStorage + IndexedDB mirror)
    upsertLocalCache(ref, docId, docData, true);

    // 2. Firestore write with durable offline queue
    await queueFirestoreWrite({ operation: 'ADD', ref, docId, payload: docData });

    return docId;
}

/**
 * Set (create or overwrite) a document with specific ID.
 */
async function dbSet(ref, docId, data) {
    const docData = { ...data, _docId: docId };

    // Update local cache immediately (localStorage + IndexedDB mirror)
    upsertLocalCache(ref, docId, docData, false);

    // Save to Firestore with durable offline queue
    await queueFirestoreWrite({ operation: 'SET', ref, docId, payload: docData });

    return docData;
}

/**
 * Partially update a document.
 */
async function dbUpdate(ref, docId, data) {
    const local = getLocalCollection(ref);
    const existing = local.find(item => item._docId === docId || item.id === docId);
    const merged = existing ? { ...existing, ...data, _docId: docId } : { ...data, _docId: docId };

    // Update local cache immediately (localStorage + IndexedDB mirror)
    upsertLocalCache(ref, docId, merged, false);

    // Save to Firestore with durable offline queue
    await queueFirestoreWrite({ operation: 'UPDATE', ref, docId, payload: merged });

    return merged;
}

/**
 * Delete a document by ID.
 *
 * This helper NEVER deletes from Firestore. It used to attempt a raw
 * `doc().delete()` and then report `{ success: false }` regardless of the
 * outcome: an unauthorised or unreachable delete was indistinguishable from
 * a refused one, and the caller announced success anyway. Deletion is now
 * explicit and auditable:
 *
 *   - student profiles  → deleteStudentProfile() (student-deletion.js)
 *   - related records   → the `deleteStudentAccount` Cloud Function
 *   - device records    → dbRemoveLocalRecord() (local-only, non-persisted)
 *
 * Returns a result object describing what happened; it never throws and never
 * claims a Firestore deletion it did not perform.
 */
async function dbDelete(ref, docId) {
    const local = getLocalCollection(ref);
    const exists = local.some(item => item._docId === docId || item.id === docId);

    console.warn(`[Database] dbDelete(${ref}/${docId}) refused: persistent deletion requires an authorized path.`);
    return {
        success: false,
        deleted: false,
        code: 'deletion-disabled',
        exists,
        message: 'Persistent deletion is disabled for this collection. Use deleteStudentProfile() for student accounts.'
    };
}

/**
 * Remove a record from the local caches only (localStorage + IndexedDB mirror).
 * Used for records that are not persisted per-account, such as instructor
 * device authorizations. No cloud write is attempted.
 */
async function dbRemoveLocalRecord(ref, docId) {
    const local = getLocalCollection(ref);
    const next = local.filter(item => String(item._docId || item.id) !== String(docId));
    const removed = next.length !== local.length;
    if (removed) setLocalCollection(ref, next);
    try {
        if (typeof offlineStore !== 'undefined' && offlineStore && offlineStore.deleteDocument) {
            await offlineStore.deleteDocument(ref, docId);
        }
    } catch (e) { /* best-effort mirror */ }
    return { success: true, removed };
}

async function dbClearCollection(ref) {
    setLocalCollection(ref, []);
    if (!firestoreReady()) return;

    const snapshot = await withFirestoreTimeout(firestore.collection(ref).get());
    if (snapshot.empty) return;

    let batch = firestore.batch();
    let batchSize = 0;
    for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
        batchSize++;
        if (batchSize === 400) {
            await withFirestoreTimeout(batch.commit());
            batch = firestore.batch();
            batchSize = 0;
        }
    }
    if (batchSize > 0) await withFirestoreTimeout(batch.commit());
}
// ══════════════════════════════════════════════════════════════
//  STUDENT ACCOUNT DELETION
//
//  One entry point for removing a student profile: `deleteStudentProfile`.
//
//  Two modes, chosen automatically and reported back to the caller:
//
//    HARD — a trusted server performs the deletion (callable
//           `deleteStudentAccount`, Admin SDK). The Firebase Auth
//           account, the profile document and every related record
//           with a *verified* owner reference are removed, and the
//           server writes the audit entry. Requires a Firebase Auth
//           session carrying a trusted `role` claim.
//
//    SOFT — the fallback used while that server path is not
//           available (no Cloud Functions deployment, or nobody
//           signed in to the cloud). Nothing is destroyed: the
//           profile is marked `status: 'deleted'` so login, lists and
//           analytics stop treating it as a live account, and the
//           profile can be restored within the undo window.
//
//  The previous flow called `dbDelete()` and then reported success
//  regardless of the outcome, so a skipped or refused Firestore delete
//  looked identical to a successful one and the local copy of the
//  profile was never removed. This module never reports a deletion it
//  cannot confirm, and it always reconciles the local caches.
// ══════════════════════════════════════════════════════════════

const STUDENT_DELETION = {
    HARD: 'hard',
    SOFT: 'soft',
    /** Profile status that marks a soft-deleted account. */
    STATUS: 'deleted',
    /** Local tombstone store (survives a reload, unlike in-memory state). */
    TOMBSTONE_KEY: 'pseudopy_deleted_profiles',
    /** Callable implemented in functions/index.js. */
    CALLABLE: 'deleteStudentAccount',
    UNDO_WINDOW_MS: 8000
};

/**
 * Owner-reference fields that identify a record unambiguously.
 *
 * A record is only auto-deleted when it points at the target through one
 * of these. `username`, `email` and `studentNumber` are deliberately NOT
 * here: they are shared, changeable and human-readable, so a match on one
 * of them is a review item rather than proof of ownership.
 */
const STUDENT_OWNER_FIELDS = ['studentAccountId', 'userId', 'accountId', 'studentId'];

/** Fields that suggest ownership but cannot prove it. Reported, never deleted. */
const STUDENT_AMBIGUOUS_FIELDS = ['username', 'email', 'studentNumber', 'student'];

// ── Pure helpers (unit-tested without a browser) ───────────────────

/**
 * Confirmation is an exact, case-sensitive match against the profile's
 * username, trimmed. Shared or similar usernames are why the modal shows the
 * student's full name and student number next to this field.
 */
function confirmUsernameMatches(profile, typed) {
    const value = String(typed || '').trim();
    if (!value || !profile) return false;
    return value === String(profile.username || '');
}

/** True when a profile has been soft-deleted (or tombstoned as hard-deleted). */
function isDeletedProfile(profile) {
    if (!profile || typeof profile !== 'object') return false;
    if (String(profile.status || '').toLowerCase() === STUDENT_DELETION.STATUS) return true;
    return !!(profile.deletedAt && profile.deletionMode);
}

/** Split an array into fixed-size batches. Firestore caps a batch at 500 ops. */
function chunkDeletionRefs(items, size = 400) {
    const list = Array.isArray(items) ? items : [];
    const width = Math.max(1, parseInt(size, 10) || 400);
    const chunks = [];
    for (let i = 0; i < list.length; i += width) chunks.push(list.slice(i, i + width));
    return chunks;
}

/**
 * Every identifier that provably refers to one profile.
 * `studentId` is included because the app writes it as the account id in
 * several collections; the ambiguous human-readable fields never are.
 */
function canonicalProfileIdentifiers(profile) {
    if (!profile) return [];
    const docId = profile._docId || profile.docId || null;
    return [docId, profile.id, profile.uid, profile.studentId]
        .map(v => (v === undefined || v === null ? '' : String(v)))
        .filter(Boolean);
}

/** True when `record` provably belongs to the target profile. */
function recordOwnedByProfile(record, profile) {
    if (!record || typeof record !== 'object') return false;
    const ids = new Set(canonicalProfileIdentifiers(profile));
    if (ids.size === 0) return false;
    for (const field of STUDENT_OWNER_FIELDS) {
        const value = record[field];
        if (value === undefined || value === null || value === '') continue;
        if (ids.has(String(value))) return true;
    }
    return false;
}

/**
 * Every human-readable value that could plausibly name this profile. These
 * are shared and changeable, so a match is a review item, never proof.
 */
function displayIdentifiers(profile) {
    if (!profile) return [];
    return [profile.fullName, profile.username, profile.email, profile.studentNumber, profile.studentId, profile.id]
        .map(v => (v === undefined || v === null ? '' : String(v)))
        .filter(Boolean);
}

/** Records that only *look* like they belong to the target. Review-only. */
function recordAmbiguousForProfile(record, profile) {
    if (!record || typeof record !== 'object') return false;
    if (recordOwnedByProfile(record, profile)) return false;
    const values = new Set(displayIdentifiers(profile));
    if (values.size === 0) return false;
    for (const field of STUDENT_AMBIGUOUS_FIELDS) {
        const value = record[field];
        if (value === undefined || value === null || value === '') continue;
        if (values.has(String(value))) return true;
    }
    return false;
}

/**
 * Authorisation for a deletion, evaluated from the caller's role and the
 * target profile. Deliberately independent of Firestore: the same decision
 * is re-made by the Cloud Function, and this copy only stops a doomed or
 * dangerous attempt from reaching the network.
 *
 * Returns `{ ok: true }` or `{ ok: false, code, message }`.
 */
function authorizeStudentDeletion({ callerRole, callerDocId, target, targetDocId } = {}) {
    const role = String(callerRole || '').toLowerCase();
    if (role !== 'instructor' && role !== 'admin') {
        return { ok: false, code: 'not-authorized', message: 'Only instructors and administrators can delete student accounts.' };
    }
    const docId = String(targetDocId || (target && (target._docId || target.id)) || '');
    if (!docId) {
        return { ok: false, code: 'invalid-target', message: 'This student record has no document id, so it cannot be deleted safely.' };
    }
    if (!target) {
        return { ok: false, code: 'not-found', message: 'Student not found. Refresh the list and try again.' };
    }
    if (isDeletedProfile(target)) {
        return { ok: false, code: 'already-deleted', message: 'This student account is already deleted.' };
    }
    const targetRole = String(target.role || '').toLowerCase();
    if (targetRole !== 'student') {
        return { ok: false, code: 'invalid-target', message: 'Only student accounts can be deleted from Manage Students.' };
    }
    const callerId = String(callerDocId || '');
    const targetIds = canonicalProfileIdentifiers(target);
    if (callerId && targetIds.indexOf(callerId) !== -1) {
        return { ok: false, code: 'self-delete', message: 'You cannot delete your own account.' };
    }
    if (role === 'instructor') {
        const owner = String(target.instructorId || '');
        const callerIds = [callerDocId].filter(Boolean).map(String);
        // An instructor may only delete a student enrolled under them.
        if (!owner || callerIds.indexOf(owner) === -1) {
            return { ok: false, code: 'not-owner', message: 'This student is not enrolled in your class.' };
        }
    }
    return { ok: true };
}

/**
 * Map a deletion failure onto one actionable sentence. Codes come from the
 * callable (`functions/lib/authorization.js`) or from Firestore/Auth.
 */
function describeDeletionError(error) {
    const code = String((error && (error.code || error.deletionCode)) || 'unknown').replace(/^functions\//, '');
    const known = {
        'not-authorized': 'Your account is not allowed to delete student accounts.',
        'self-delete': 'You cannot delete your own account.',
        'invalid-target': 'Only student accounts can be deleted from Manage Students.',
        'not-owner': 'This student is not enrolled in your class.',
        'not-found': 'Student not found. Refresh the list and try again.',
        'already-deleted': 'This student account is already deleted.',
        'mfa-required': 'This student has multi-factor authentication enabled. Delete the sign-in provider first.',
        'unauthenticated': 'Your session is not verified with Firebase, so deletion is not permitted. Sign in again or ask an administrator.',
        'failed-precondition': 'The deletion service is not available yet, so the account was deactivated instead of erased.',
        'unavailable': 'Firestore is unreachable. The student was not deleted; reconnect and try again.',
        'deadline-exceeded': 'The deletion service timed out. Nothing was removed; try again.',
        'permission-denied': 'Firebase refused the deletion. Check that the security rules and your staff role claim are deployed.',
        'invalid-argument': 'The deletion request was malformed and was rejected. Nothing was removed.'
    };
    return {
        code,
        message: known[code] || (error && error.message) || 'The student could not be deleted.'
    };
}

// ── Local tombstones ──────────────────────────────────────────────

function readDeletionTombstones() {
    try {
        const raw = localStorage.getItem(STUDENT_DELETION.TOMBSTONE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (e) {
        return {};
    }
}

function writeDeletionTombstones(map) {
    try {
        localStorage.setItem(STUDENT_DELETION.TOMBSTONE_KEY, JSON.stringify(map || {}));
    } catch (e) { /* storage full or blocked: the profile is still gone upstream */ }
}

/**
 * Remember a confirmed deletion so the local fallback and the seed data can
 * never put the account back on this device.
 */
function markDeletionTombstone(docId, meta = {}) {
    if (!docId) return null;
    const map = readDeletionTombstones();
    const record = {
        docId: String(docId),
        mode: meta.mode === STUDENT_DELETION.HARD ? STUDENT_DELETION.HARD : STUDENT_DELETION.SOFT,
        at: new Date().toISOString(),
        operationId: meta.operationId || null,
        fullName: meta.fullName || null,
        username: meta.username || null,
        studentNumber: meta.studentNumber || null
    };
    map[record.docId] = record;
    writeDeletionTombstones(map);
    return record;
}

function clearDeletionTombstone(docId) {
    const map = readDeletionTombstones();
    if (map[docId]) {
        delete map[docId];
        writeDeletionTombstones(map);
    }
}

function deletionTombstone(docId) {
    return readDeletionTombstones()[docId] || null;
}

/**
 * A hard-deleted profile must disappear from the local fallback even when
 * Firestore is unreachable; a soft-deleted profile is kept so login can show
 * the real reason instead of "user not found".
 */
function dropHardDeletedProfiles(list) {
    const map = readDeletionTombstones();
    const hardIds = Object.keys(map).filter(id => map[id].mode === STUDENT_DELETION.HARD);
    if (hardIds.length === 0 || !Array.isArray(list)) return list;
    return list.filter(item => hardIds.indexOf(String(item._docId || item.id)) === -1);
}

// ── Local reconciliation ──────────────────────────────────────────

/** Remove a profile from the localStorage cache and the IndexedDB mirror. */
async function purgeLocalProfile(docId) {
    if (!docId) return false;
    let removed = false;
    try {
        const local = getLocalCollection(usersRef);
        const next = local.filter(item => String(item._docId || item.id) !== String(docId));
        if (next.length !== local.length) {
            removed = true;
            setLocalCollection(usersRef, next);
        }
    } catch (e) {
        console.warn('[Deletion] local profile purge failed:', e && e.message);
    }
    try {
        if (typeof offlineStore !== 'undefined' && offlineStore && offlineStore.deleteDocument) {
            await offlineStore.deleteDocument(usersRef, docId);
        }
    } catch (e) { /* best-effort mirror */ }
    return removed;
}

/**
 * Retire queued writes for a profile so a stale offline edit cannot recreate
 * it after a confirmed deletion. Related collections are handled by the
 * server-side cascade (hard) or left untouched for the undo window (soft).
 */
async function retirePendingProfileWrites(docId) {
    if (!docId || typeof clearPendingForDocument !== 'function') return 0;
    try {
        const removed = await clearPendingForDocument(usersRef, docId);
        return Number.isInteger(removed) ? removed : 0;
    } catch (e) {
        console.warn('[Deletion] pending-write cleanup failed:', e && e.message);
        return 0;
    }
}

/**
 * Count the related records a hard deletion would remove, split into
 * provably-owned records and records that only look related. The modal shows
 * these numbers so the operator knows the blast radius before confirming.
 */
async function collectStudentRelatedRecords(profile) {
    const summary = { owned: {}, ambiguous: {}, ownedTotal: 0, ambiguousTotal: 0 };
    const refs = [
        activityRef, notificationsRef, passwordRequestsRef, evidenceRef, tutorialProgressRef
    ];
    for (const ref of refs) {
        if (typeof ref === 'undefined') continue;
        try {
            const rows = await dbGetAll(ref);
            if (!Array.isArray(rows) || rows.length === 0) continue;
            const owned = rows.filter(row => recordOwnedByProfile(row, profile)).length;
            const ambiguous = rows.filter(row => recordAmbiguousForProfile(row, profile)).length;
            if (owned) { summary.owned[ref] = owned; summary.ownedTotal += owned; }
            if (ambiguous) { summary.ambiguous[ref] = ambiguous; summary.ambiguousTotal += ambiguous; }
        } catch (e) {
            console.info('[Deletion] related-record scan skipped for', ref, e && e.message);
        }
    }
    return summary;
}

// ── Server path ───────────────────────────────────────────────────

/** True when a callable function could answer right now. */
function deletionServerAvailable() {
    const hasFunctions = typeof firebase !== 'undefined' && firebase && typeof firebase.functions === 'function';
    const hasSession = typeof cloudUid === 'function' && !!cloudUid();
    return hasFunctions && hasSession;
}

async function invokeDeleteStudentCallable(payload) {
    if (typeof firebase === 'undefined' || !firebase || typeof firebase.functions !== 'function') {
        throw Object.assign(new Error('Cloud Functions SDK is unavailable'), { code: 'unavailable' });
    }
    // The compat SDK returns a callable *function*, not an object with an
    // `invoke` method. Anything else means the SDK shape changed or the
    // callable is not wired up, which is the documented fallback case.
    const callable = firebase.functions().httpsCallable(STUDENT_DELETION.CALLABLE);
    if (typeof callable !== 'function') {
        throw Object.assign(new Error('Callable is not available'), { code: 'failed-precondition' });
    }
    const response = await callable(payload);
    const data = (response && response.data) || {};
    if (data.ok !== true) {
        throw Object.assign(new Error(data.message || 'The deletion service refused the request.'), {
            code: data.code || 'failed-precondition',
            deletionCode: data.code || 'failed-precondition'
        });
    }
    return data;
}

// ── Entry point ───────────────────────────────────────────────────

/**
 * Delete one student account.
 *
 * @param {string} targetDocId  Firestore document id of the profile.
 * @param {object} [options]
 * @param {string} [options.confirmUsername]  Username the operator retyped.
 * @param {object} [options.caller]           Defaults to the signed-in profile.
 * @returns {Promise<{ok: boolean, mode?: string, code?: string, message?: string}>}
 *   Never resolves `ok: true` for work that was not confirmed.
 */
async function deleteStudentProfile(targetDocId, options = {}) {
    const docId = String(targetDocId || '').trim();
    if (!docId) {
        return { ok: false, code: 'invalid-target', message: 'This student record has no document id, so it cannot be deleted safely.' };
    }
    const caller = options.caller || (typeof currentUser !== 'undefined' ? currentUser : null);
    const callerDocId = (caller && (caller._docId || caller.id)) || '';
    const step = (name, extra) => console.info('[Deletion]', name, Object.assign({ docId }, extra || {}));

    let profile = null;
    try {
        const users = (typeof cachedUsers !== 'undefined' && cachedUsers.length)
            ? cachedUsers
            : await dbGetAll(usersRef);
        profile = (users || []).find(u => String(u._docId || u.id) === docId) || null;
        if (!profile) profile = await dbGet(usersRef, docId);
    } catch (e) {
        console.warn('[Deletion] profile lookup failed:', e && e.message);
    }

    const verdict = authorizeStudentDeletion({ callerRole: caller && caller.role, callerDocId, target: profile, targetDocId: docId });
    if (!verdict.ok) {
        step('rejected', { code: verdict.code });
        return { ok: false, code: verdict.code, message: verdict.message };
    }

    const confirmUsername = String(options.confirmUsername || '').trim();
    if (!confirmUsername) {
        return { ok: false, code: 'confirmation-missing', message: 'Type the student username to confirm the deletion.' };
    }
    if (!confirmUsernameMatches(profile, confirmUsername)) {
        return { ok: false, code: 'confirmation-mismatch', message: 'The username does not match. Type it exactly as shown.' };
    }

    // Deletion is a destructive, non-idempotent request: never queue it.
    if (typeof requireOnline === 'function') {
        const gate = requireOnline();
        if (!gate.ok) return { ok: false, code: 'unavailable', message: gate.message };
    }

    const related = await collectStudentRelatedRecords(profile);
    const requestId = 'del_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

    if (deletionServerAvailable()) {
        step('server-delete', { related: related.ownedTotal });
        try {
            const data = await invokeDeleteStudentCallable({
                studentDocId: docId,
                confirmUsername,
                requestId
            });
            await reconcileDeletedProfile(docId, profile, {
                mode: STUDENT_DELETION.HARD,
                operationId: data.operationId || requestId
            });
            step('confirmed', { operationId: data.operationId });
            return {
                ok: true,
                mode: STUDENT_DELETION.HARD,
                operationId: data.operationId || requestId,
                profile,
                related,
                removed: data.removed || {},
                message: `${profile.fullName} and all of their records were permanently deleted.`
            };
        } catch (err) {
            const described = describeDeletionError(err);
            // A refused/unavailable server path is the documented signal to
            // fall back, not a reason to claim success.
            if (described.code === 'failed-precondition' || described.code === 'unauthenticated' || described.code === 'unavailable') {
                console.warn('[Deletion] server path unavailable, using soft delete:', described.code);
            } else {
                step('failed', described);
                return { ok: false, code: described.code, message: described.message };
            }
        }
    } else {
        step('soft-delete', { reason: deletionServerAvailable() ? 'no-session' : 'no-functions-sdk' });
    }

    // ── Soft delete ───────────────────────────────────────────────
    // Nothing is erased. The profile is deactivated in place so the account
    // stops working immediately and the change can be undone.
    try {
        await dbUpdate(usersRef, docId, {
            // Preserved so `undoStudentDeletion` restores the exact prior state
            // instead of assuming every account was active.
            statusBeforeDeletion: (profile && profile.status) || 'active',
            status: STUDENT_DELETION.STATUS,
            deletionMode: STUDENT_DELETION.SOFT,
            deletedAt: new Date().toISOString(),
            deletedBy: callerDocId || null,
            deletedByName: (caller && caller.fullName) || null,
            deletionRequestId: requestId
        });
    } catch (err) {
        const described = describeDeletionError(err);
        step('failed', described);
        return { ok: false, code: described.code, message: described.message };
    }

    markDeletionTombstone(docId, {
        mode: STUDENT_DELETION.SOFT,
        operationId: requestId,
        fullName: profile.fullName,
        username: profile.username,
        studentNumber: profile.studentNumber
    });
    if (typeof logAuditAction === 'function') {
        await logAuditAction({
            action: 'student.soft-delete',
            studentId: docId,
            studentName: profile.fullName,
            username: profile.username,
            instructorId: callerDocId,
            instructorName: (caller && caller.fullName) || null,
            requestId
        });
    }
    step('confirmed-soft', { requestId });

    // Release the username claim. The account still exists but is deactivated,
    // so the name must not stay reserved; undoStudentDeletion re-takes it. A
    // stale claim would otherwise block that username for every future account
    // while no profile exists to explain why.
    if (profile && profile.username && typeof releaseUsernameClaim === 'function') {
        try {
            const released = await releaseUsernameClaim(profile.username, docId);
            step('username-claim-released', { released });
        } catch (e) {
            step('username-claim-release-failed', { error: (e && e.message) || String(e) });
        }
    }

    return {
        ok: true,
        mode: STUDENT_DELETION.SOFT,
        operationId: requestId,
        profile,
        related,
        authRevoked: false,
        message: `${profile.fullName} was deactivated. Their sign-in account was NOT revoked.`
    };
}

/**
 * Undo a soft delete inside the confirmation window. A hard deletion is
 * irreversible by design and is refused here.
 */
async function undoStudentDeletion(targetDocId) {
    const docId = String(targetDocId || '');
    const tombstone = deletionTombstone(docId);
    if (!tombstone) {
        return { ok: false, code: 'not-found', message: 'There is nothing to undo for this student.' };
    }
    if (tombstone.mode === STUDENT_DELETION.HARD) {
        return { ok: false, code: 'irreversible', message: 'A permanent deletion cannot be undone from here.' };
    }
    if (typeof requireOnline === 'function') {
        const gate = requireOnline();
        if (!gate.ok) return { ok: false, code: 'unavailable', message: gate.message };
    }
    try {
        const profile = await dbGet(usersRef, docId);
        // Re-take the username claim released by the soft delete. Without this
        // the restored account and any new account could hold the same username.
        if (profile && profile.username && typeof claimUsername === 'function') {
            try {
                await claimUsername(profile.username, docId);
            } catch (claimErr) {
                return {
                    ok: false,
                    code: (claimErr && claimErr.code) || 'username-claim-conflict',
                    message: 'Restored, but this username is now held by another account: '
                        + ((claimErr && claimErr.message) || 'rename the account before it is used again.')
                };
            }
        }
        await dbUpdate(usersRef, docId, {
            status: (profile && profile.statusBeforeDeletion) || 'active',
            statusBeforeDeletion: null,
            deletionMode: null,
            deletedAt: null,
            deletedBy: null,
            deletedByName: null,
            deletionRequestId: null
        });
        clearDeletionTombstone(docId);
        return { ok: true, message: 'The student account was restored.' };
    } catch (err) {
        const described = describeDeletionError(err);
        return { ok: false, code: described.code, message: described.message };
    }
}

/** Shared post-deletion bookkeeping for both modes. */
async function reconcileDeletedProfile(docId, profile, meta) {
    markDeletionTombstone(docId, {
        mode: meta.mode,
        operationId: meta.operationId,
        fullName: profile && profile.fullName,
        username: profile && profile.username,
        studentNumber: profile && profile.studentNumber
    });
    if (meta.mode === STUDENT_DELETION.HARD) {
        await retirePendingProfileWrites(docId);
        await purgeLocalProfile(docId);
    }
}

// Loaded as a classic script in the browser, so every function above is also a
// global. Node tests require() this file directly to get the same helpers.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        STUDENT_DELETION,
        confirmUsernameMatches,
        isDeletedProfile,
        canonicalProfileIdentifiers,
        recordOwnedByProfile,
        recordAmbiguousForProfile,
        authorizeStudentDeletion,
        describeDeletionError,
        deleteStudentProfile,
        undoStudentDeletion
    };
}/* ============================================================
   STUDENT NUMBER SERVICE — '230xxxx' allocation
   Canonical field: users.studentNumber  (/^230\d{4}$/)
   Numbers are allocated sequentially via an atomic Firestore
   runTransaction on a counter document, so concurrent account
   creation never produces duplicates. A deterministic local
   fallback keeps the feature working when the SDK is offline.

   The counter increment being atomic is necessary but NOT
   sufficient for idempotency. Two near-simultaneous submissions
   receive two *distinct consecutive* numbers (2300003 and
   2300004 for one person), because nothing tied an allocation to
   the request that asked for it. Pass a `requestId` and the
   allocation is recorded against it, so a retry of the same
   submission returns the number it already owns instead of
   consuming another one.

   Omitting `requestId` preserves the original behaviour exactly:
   every call consumes a fresh number.

   The legacy 'studentId' field (2024-xxx seeds) is left intact;
   readStudentNumber() uses it only as a temporary display
   fallback until a migration assigns a 230-series number.
   ============================================================ */

const STUDENT_NUMBER_PREFIX = '230';
const STUDENT_NUMBER_WIDTH = 4; // digits after the prefix
const STUDENT_NUMBER_MAX = 9999;
const STUDENT_NUMBER_PATTERN = /^230\d{4}$/;
const COUNTER_DOC = 'studentNumbers'; // doc id under pseudopy_counters
const LOCAL_COUNTER_KEY = 'pseudopy_student_number_counter';
const LOCAL_ALLOCATIONS_KEY = 'pseudopy_student_number_allocations';
const MAX_ALLOCATION_RETRIES = 3;
const MAX_TRACKED_ALLOCATIONS = 200; // bound the local idempotency ledger
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

/** Reject anything that could collide in a document field or a storage key. */
function isUsableRequestId(value) {
    return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

function isValidStudentNumber(value) {
    return typeof value === 'string' && STUDENT_NUMBER_PATTERN.test(value);
}

/** '230' + zero-padded sequence (0 -> 2300001, 2510 -> 2302510). */
function formatStudentNumber(sequence) {
    const seq = Math.floor(Number(sequence));
    if (!Number.isFinite(seq) || seq <= 0) {
        throw new Error('Invalid student number sequence.');
    }
    if (seq > STUDENT_NUMBER_MAX) {
        throw new RangeError('Student number range exhausted (2309999).');
    }
    return STUDENT_NUMBER_PREFIX + String(seq).padStart(STUDENT_NUMBER_WIDTH, '0');
}

function _numericPart(studentNumber) {
    if (!isValidStudentNumber(studentNumber)) return 0;
    return parseInt(studentNumber.slice(STUDENT_NUMBER_PREFIX.length), 10);
}

function _maxExistingSequence(users) {
    let max = 0;
    (Array.isArray(users) ? users : []).forEach((u) => {
        const n = _numericPart(u && u.studentNumber);
        if (n > max) max = n;
    });
    return max;
}

async function _readUsers() {
    try {
        return await dbGetAll(usersRef, null);
    } catch (e) {
        return getLocalCollection(usersRef) || [];
    }
}

/**
 * Seed the counter document once so future allocations continue
 * from the highest existing 230-series number. Idempotent.
 */
async function _ensureCounter() {
    if (!firestoreReady()) return;
    let snap;
    try {
        snap = await withFirestoreTimeout(firestore.collection(countersRef).doc(COUNTER_DOC).get());
    } catch (e) {
        return;
    }
    if (snap && snap.exists) return;
    const base = await _maxExistingSequence(await _readUsers());
    try {
        await firestore.runTransaction(async (tx) => {
            const ref = firestore.collection(countersRef).doc(COUNTER_DOC);
            const current = await tx.get(ref);
            if (!current.exists) {
                tx.set(ref, { current: base });
            }
        });
    } catch (e) {
        console.info('[StudentNumber] counter seed skipped:', e && e.message);
    }
}

/** Atomic read-increment-write inside a Firestore transaction. */
async function _allocateFirestore() {
    let allocated = null;
    await firestore.runTransaction(async (tx) => {
        const ref = firestore.collection(countersRef).doc(COUNTER_DOC);
        const snap = await tx.get(ref);
        let current = 0;
        if (snap.exists && typeof snap.data().current === 'number' && snap.data().current > 0) {
            current = snap.data().current;
        }
        if (current >= STUDENT_NUMBER_MAX) {
            throw new RangeError('Student number range exhausted (2309999).');
        }
        const next = current + 1;
        tx.set(ref, { current: next });
        allocated = formatStudentNumber(next);
    });
    return allocated;
}

/**
 * Record `requestId -> number` inside the SAME transaction that increments the
 * counter. Recording it in the same atomic step is the whole point: if the
 * allocation and its record cannot commit together, a crash between them
 * still burns a number.
 */
async function _allocateFirestoreKeyed(requestId) {
    let allocated = null;
    await firestore.runTransaction(async (tx) => {
        const ref = firestore.collection(countersRef).doc(COUNTER_DOC);
        const snap = await tx.get(ref);
        const data = snap.exists ? (snap.data() || {}) : {};
        const existing = data.allocations && typeof data.allocations === 'object' ? data.allocations : {};

        // Replay: this request already owns a number.
        if (isValidStudentNumber(existing[requestId])) {
            allocated = existing[requestId];
            return;
        }

        let current = 0;
        if (typeof data.current === 'number' && data.current > 0) {
            current = data.current;
        }
        if (current >= STUDENT_NUMBER_MAX) {
            throw new RangeError('Student number range exhausted (2309999).');
        }
        const next = current + 1;
        const number = formatStudentNumber(next);

        // Keep the ledger bounded. Oldest keys are dropped first; a pruned
        // request simply allocates a new number on retry, which is the
        // pre-existing behaviour rather than a failure.
        const merged = Object.assign({}, existing);
        merged[requestId] = number;
        const keys = Object.keys(merged);
        if (keys.length > MAX_TRACKED_ALLOCATIONS) {
            keys.sort((a, b) => String(merged[a]).localeCompare(String(merged[b])));
            keys.slice(0, keys.length - MAX_TRACKED_ALLOCATIONS).forEach(k => delete merged[k]);
        }

        tx.set(ref, { current: next, allocations: merged });
        allocated = number;
    });
    return allocated;
}

/** Local analogue of the allocation ledger, for the offline path. */
function _readLocalAllocations() {
    try {
        const parsed = JSON.parse(localStorage.getItem(LOCAL_ALLOCATIONS_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        return {};
    }
}

function _writeLocalAllocation(requestId, number) {
    try {
        const all = _readLocalAllocations();
        all[requestId] = number;
        const keys = Object.keys(all);
        if (keys.length > MAX_TRACKED_ALLOCATIONS) {
            keys.sort((a, b) => String(all[a]).localeCompare(String(all[b])));
            keys.slice(0, keys.length - MAX_TRACKED_ALLOCATIONS).forEach(k => delete all[k]);
        }
        localStorage.setItem(LOCAL_ALLOCATIONS_KEY, JSON.stringify(all));
    } catch (e) { /* storage unavailable: fall back to a fresh number */ }
}

/** Deterministic sequential fallback for offline / local mode. */
function _allocateLocal() {
    let current = 0;
    try {
        current = parseInt(localStorage.getItem(LOCAL_COUNTER_KEY) || '0', 10) || 0;
    } catch (e) { /* storage unavailable */ }
    const users = getLocalCollection(usersRef) || [];
    const base = _maxExistingSequence(users);
    if (base > current) current = base;
    if (current >= STUDENT_NUMBER_MAX) {
        throw new RangeError('Student number range exhausted (2309999).');
    }
    const next = current + 1;
    try {
        localStorage.setItem(LOCAL_COUNTER_KEY, String(next));
    } catch (e) { /* storage unavailable */ }
    return formatStudentNumber(next);
}

function _allocateLocalKeyed(requestId) {
    const prior = _readLocalAllocations()[requestId];
    if (isValidStudentNumber(prior)) return prior;
    const number = _allocateLocal();
    _writeLocalAllocation(requestId, number);
    return number;
}

/**
 * Allocate the next unique 230-series student number.
 * Verifies uniqueness against the users collection and retries on
 * collisions; account creation must abort if this rejects.
 *
 * @param {string} [requestId] Stable id for one submission attempt. Retrying
 *   with the same id returns the number already granted to it instead of
 *   consuming a new one. Omit it for the original non-idempotent behaviour.
 */
async function allocateStudentNumber(requestId) {
    const keyed = isUsableRequestId(requestId);
    const key = keyed ? requestId : null;

    if (firestoreReady()) {
        await _ensureCounter();
        for (let attempt = 0; attempt < MAX_ALLOCATION_RETRIES; attempt++) {
            const number = key ? await _allocateFirestoreKeyed(key) : await _allocateFirestore();
            // A replayed request owns its number by definition; re-checking it
            // against the users collection would reject the very retry it is
            // meant to heal.
            if (key) return number;
            let users = [];
            try {
                users = await _readUsers();
            } catch (e) { /* uniqueness check is best-effort */ }
            const inUse = (users || []).some((u) => u && u.studentNumber === number);
            if (!inUse) return number;
        }
        throw new Error('Unable to allocate a unique student number. Please try again.');
    }
    return key ? _allocateLocalKeyed(key) : _allocateLocal();
}

/**
 * Forget a request's allocation. Called when account creation is abandoned so
 * a later genuine attempt is not silently handed the abandoned number.
 */
function releaseStudentNumberRequest(requestId) {
    if (!isUsableRequestId(requestId)) return false;
    if (firestoreReady()) {
        // Counter documents cannot be deleted from the client; the ledger entry
        // is pruned by MAX_TRACKED_ALLOCATIONS on its own.
        return false;
    }
    try {
        const all = _readLocalAllocations();
        if (!(requestId in all)) return false;
        delete all[requestId];
        localStorage.setItem(LOCAL_ALLOCATIONS_KEY, JSON.stringify(all));
        return true;
    } catch (e) {
        return false;
    }
}

/** Backward-compatible display value: studentNumber ?? studentId ?? em dash. */
function readStudentNumber(user) {
    if (user && isValidStudentNumber(user.studentNumber)) return user.studentNumber;
    if (user && typeof user.studentId === 'string' && user.studentId.trim()) return user.studentId;
    return '\u2014';
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        isValidStudentNumber,
        formatStudentNumber,
        readStudentNumber,
        allocateStudentNumber,
        releaseStudentNumberRequest,
        isUsableRequestId,
        STUDENT_NUMBER_PATTERN,
        STUDENT_NUMBER_MAX
    };
}// ============================================================
// USERNAME CLAIMS
//
// Why this exists
// ---------------
// saveUser checks uniqueness against `cachedUsers`, which is a snapshot this tab
// already had. Two tabs (or two instructors on two devices) can read the same
// snapshot, both conclude the username is free, and both write a profile.
// Firestore cannot enforce uniqueness on a field: a transaction cannot ask "does
// any profile already use this username", only read documents whose paths it
// already knows.
//
// So uniqueness is claimed at a path that IS known in advance — one document per
// normalized username — using the same transaction shape already used for
// student numbers. The winner writes the profile; the loser is told the name is
// taken instead of silently creating a second account.
//
// The claim id is derived from the normalized username, never from raw user
// input, so nothing reaches a document path before it has been normalized.
// ============================================================

const CLAIMS_COLLECTION = 'pseudopy_usernameClaims';
// 'u:' prefix, then the encoded username. % is permitted because unsafe
// characters are percent-encoded below.
const CLAIM_KEY_PATTERN = /^u:[a-z0-9._%\-]{1,96}$/;
const SAFE_USERNAME_CHAR = /^[a-z0-9._\-]$/;

class UsernameClaimError extends Error {
    constructor(message, claimedBy) {
        super(message);
        this.name = 'UsernameClaimError';
        this.code = 'username-claim-conflict';
        this.claimedBy = claimedBy || null;
    }
}

/**
 * Build the claim document id for a username.
 *
 * Normalizes to lower case and trims, because two usernames differing only by
 * case or surrounding whitespace are the same account as far as login is
 * concerned. Every character outside the safe set is percent-encoded and the
 * encoding is lower-cased, so the result is always a single Firestore document
 * id whose alphabet is entirely lower case: a username containing '/' can never
 * introduce a path separator, and 'a/b' and 'a%2Fb' cannot collide because the
 * literal '%' encodes to '%25'.
 *
 * No username is rejected here. Imposing a charset would be a product change,
 * and existing accounts may already use characters this encodes instead.
 */
function usernameClaimKey(username) {
    const normalized = String(username === undefined || username === null ? '' : username)
        .trim()
        .toLowerCase();
    if (!normalized) return '';

    let key = 'u:';
    for (const ch of normalized) {
        key += SAFE_USERNAME_CHAR.test(ch) ? ch : encodeURIComponent(ch).toLowerCase();
    }
    return key;
}

function isUsableClaimKey(key) {
    return CLAIM_KEY_PATTERN.test(String(key || ''));
}

/**
 * Claim a username for `ownerId`.
 *
 * Resolves `{ claimed: true, replayed }`. `replayed` is true when this owner
 * already holds the claim, which is what makes a retried submit safe: a request
 * addressing its own claim is not in conflict with itself.
 *
 * Throws UsernameClaimError when a different account holds the name, or when the
 * claim could not be verified at all. Callers must treat both as a refusal —
 * "could not verify" must never be treated as "free".
 */
async function claimUsername(username, ownerId) {
    const key = usernameClaimKey(username);
    if (!isUsableClaimKey(key)) {
        throw new UsernameClaimError('That username cannot be stored.', null);
    }
    if (!firestoreReady()) {
        // Offline: the local store is the only authority available, and the
        // cached uniqueness check in saveUser already ran against it.
        return { claimed: false, offline: true, replayed: false, key };
    }

    let outcome = null;
    try {
        await firestore.runTransaction(async (tx) => {
            const ref = firestore.collection(CLAIMS_COLLECTION).doc(key);
            const snap = await tx.get(ref);
            const data = snap.exists ? (snap.data() || {}) : {};
            const holder = data.ownerId ? String(data.ownerId) : '';

            if (holder && holder !== String(ownerId)) {
                outcome = { conflict: true, claimedBy: holder };
                return;
            }

            outcome = { conflict: false, replayed: !!holder };
            if (!holder) {
                tx.set(ref, {
                    ownerId: String(ownerId),
                    claimedAt: new Date().toISOString()
                });
            }
        });
    } catch (e) {
        if (e instanceof UsernameClaimError) throw e;
        // Could not establish the claim. Refusing is the safe direction: the
        // alternative is creating an account that cannot be logged into.
        throw new UsernameClaimError(
            'Could not verify that this username is available. Check your connection and try again.',
            null
        );
    }

    if (outcome && outcome.conflict) {
        throw new UsernameClaimError('That username is already taken.', outcome.claimedBy);
    }
    return {
        claimed: true,
        offline: false,
        replayed: !!(outcome && outcome.replayed),
        key
    };
}

/**
 * Release a claim. Only the holder may release it, so a writer that lost the
 * race cannot free a username the winner legitimately owns.
 */
async function releaseUsernameClaim(username, ownerId) {
    const key = usernameClaimKey(username);
    if (!isUsableClaimKey(key) || !firestoreReady()) return false;
    let released = false;
    try {
        await firestore.runTransaction(async (tx) => {
            const ref = firestore.collection(CLAIMS_COLLECTION).doc(key);
            const snap = await tx.get(ref);
            if (!snap.exists) return;
            const data = snap.data() || {};
            if (!data.ownerId || String(data.ownerId) !== String(ownerId)) return;
            tx.delete(ref);
            released = true;
        });
    } catch (e) {
        // A stale claim is not worth failing a save over. Worst case the name
        // stays reserved until the account is deleted, which is recoverable.
        return false;
    }
    return released;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        claimUsername,
        releaseUsernameClaim,
        usernameClaimKey,
        isUsableClaimKey,
        UsernameClaimError,
        CLAIMS_COLLECTION
    };
}// ══════════════════════════════════════════════════════════════
//  AUTOMATIC SEEDING LOGIC
// ══════════════════════════════════════════════════════════════

async function batchSeed(collectionName, items) {
    if (!firestoreReady()) return;
    const batch = firestore.batch();
    items.forEach(item => {
        const ref = firestore.collection(collectionName).doc(item._docId || item.id);
        batch.set(ref, item);
    });
    await withFirestoreTimeout(batch.commit());
}

async function seedDatabase() {
    try {
        if (!firestoreReady()) return true;

        console.log('[Database] Checking Firestore collections...');
        const userSnap = await withFirestoreTimeout(firestore.collection(usersRef).get());
        if (userSnap.empty) {
            console.log('[Database] Seeding initial users into Firestore...');
            await batchSeed(usersRef, getInitialSeedUsers());
            console.log('[Database] Users seeded ✅');
        }

        const exSnap = await withFirestoreTimeout(firestore.collection(exercisesRef).get());
        if (exSnap.size < 30) {
            console.log('[Database] Seeding initial exercises into Firestore...');
            await batchSeed(exercisesRef, SEED_EXERCISES_LIST);
            console.log('[Database] Exercises seeded ✅');
        }

        const actSnap = await withFirestoreTimeout(firestore.collection(activityRef).get());
        if (actSnap.empty) {
            console.log('[Database] Seeding sample activity into Firestore...');
            await batchSeed(activityRef, SEED_ACTIVITY_LIST);
            console.log('[Database] Activity seeded ✅');
        }

        if (PseudoPyLearning && PseudoPyLearning.register && PseudoPyLearning.register.evidenceStore) {
            const evSnap = await withFirestoreTimeout(firestore.collection(evidenceRef).get());
            if (evSnap.empty) {
                console.log('[Database] Seeding learning evidence into Firestore...');
                const seeds = PseudoPyLearning.register.evidenceStore.getSeedEvidence();
                await batchSeed(evidenceRef, seeds);
                console.log('[Database] Learning evidence seeded ✅');
            }
        }
    } catch (err) {
        console.warn('[Database] Seeding notice (local fallback active):', err.message);
    }
    return true;
}

// ══════════════════════════════════════════════════════════════
//  APP-LEVEL HELPERS & INTERFACE
// ══════════════════════════════════════════════════════════════

async function refreshPasswordHistory() {
    return await dbGetAll(passwordRequestsRef);
}

function normalizeAuditRecord(record) {
    const action = record.action || (record.eventType ? record.eventType.toLowerCase() : 'unknown');
    return {
        ...record, action,
        actorId: record.actorId || record.instructorId || record.studentId || null,
        actorName: record.actorName || record.instructorName || record.studentName || record.actor || null,
        actorUsername: record.actorUsername || record.username || record.actor || null,
        actorRole: record.actorRole || (record.instructorId ? 'instructor' : record.studentId ? 'student' : null),
        targetType: record.targetType || (record.requestId ? 'password_request' : null),
        targetId: record.targetId || record.requestId || null,
        targetName: record.targetName || record.target || null,
        metadata: record.metadata || (record.details ? { details: record.details } : {})
    };
}

async function refreshAuditLog() {
    const records = await dbGetAll(auditLogRef);
    return records.map(normalizeAuditRecord)
        // Legacy partial writes must never appear as a fake Unknown event.
        .filter(record => record.action && record.action !== 'unknown' && record.actorId && record.actorName);
}

function subscribeCollection(ref, onChange, onError) {
    if ((typeof cloudRequestsAllowed === 'function' && !cloudRequestsAllowed()) || !firestoreReady() || typeof firestore.collection(ref).onSnapshot !== 'function') return () => {};
    let active = true;
    const unsubscribe = firestore.collection(ref).onSnapshot(async snapshot => {
        if (!active) return;
        const records = snapshot.docs.map(doc => ({ _docId: doc.id, ...doc.data() }));
        // Reconnect fire events: never let a snapshot clobber locally pending
        // (unsynced) writes. mergePendingMutationsOverSnapshot is defined in
        // collections.js (earlier in the bundle) and overlays them.
        const merged = typeof mergePendingMutationsOverSnapshot === 'function'
            ? await mergePendingMutationsOverSnapshot(ref, records)
            : records;
        setLocalCollection(ref, merged);
        onChange(merged);
    }, error => { if (typeof recordCloudFailure === 'function') recordCloudFailure(error); if (active && typeof onError === 'function') onError(error); });
    return () => { active = false; if (typeof unsubscribe === 'function') unsubscribe(); };
}

function normalizeUsername(username) {
    if (!username) return '';
    const u = username.trim();
    if (u.toLowerCase() === 'admin') return 'Admin';
    if (u === 'emirandila_student') return 'emirandilla_student';
    if (u === 'mdaet_stude') return 'mdaet_student';
    return u;
}

// Ensure all seed exercises have instructor and creator assigned
SEED_EXERCISES_LIST.forEach(e => {
    if (!e.createdBy) e.createdBy = 'u2';
    if (!e.instructorId) e.instructorId = 'u2';
    if (!e.difficulty) e.difficulty = 'moderate';
});

/* ============================================================
   LEGACY Database facade (kept for the verify_app_refactor.js
   suite contract). New code calls the low-level helper family
   (dbGetAll, dbAdd, dbUpdate) directly and must not rely on this
   class.

   NOTE: `dbDelete` no longer performs a Firestore delete. Profile
   deletion goes through deleteStudentProfile(); `deleteUser` below
   only forwards to it, and without a typed-username confirmation it
   refuses rather than deleting.
   ============================================================ */

class Database {
    constructor() { this.ready = true; }
    async getUsers() { return await dbGetAll(usersRef); }
    async getUserByUsername(username) {
        const users = await dbGetAll(usersRef);
        const norm = normalizeUsername(username);
        return users.find(u => u.username === norm || u.username === username) || null;
    }
    async addUser(user) { return await dbAdd(usersRef, user); }
    async updateUser(userId, updates) { return await dbUpdate(usersRef, userId, updates); }
    // Persistent profile deletion requires the authorized, audited path in
    // student-deletion.js; this method deliberately cannot perform it.
    async deleteUser(userId) {
        return await deleteStudentProfile(userId, { confirmUsername: '' });
    }
    async getExercises() { return await dbGetAll(exercisesRef); }
    async getExerciseById(id) { return await dbGet(exercisesRef, id); }
    async addExercise(exercise) { return await dbAdd(exercisesRef, exercise); }
    async updateExercise(exerciseId, updates) { return await dbUpdate(exercisesRef, exerciseId, updates); }
    async deleteExercise(exerciseId) {
        return await dbUpdate(exercisesRef, exerciseId, { status: 'archived', archivedAt: new Date().toISOString() });
    }
    async getSubmissions() { return await dbGetAll(activityRef); }
    async addSubmission(submission) { return await dbAdd(activityRef, submission); }
    async getPasswordChangeHistory() { return await dbGetAll(passwordRequestsRef); }
    async addPasswordChangeRequest(request) { return await dbAdd(passwordRequestsRef, request); }
}

const db = new Database();