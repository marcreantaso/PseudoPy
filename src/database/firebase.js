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

