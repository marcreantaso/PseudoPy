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

try {
    if (hasFirebaseSDK) {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        firestore = firebase.firestore();
        console.log('[Database] Firebase Firestore connected ✅ Project:', firebaseConfig.projectId);
    } else if (typeof window !== 'undefined' && window.firebase) {
        window.firebase.initializeApp(firebaseConfig);
        firestore = window.firebase.firestore();
        console.log('[Database] Firebase Firestore connected ✅ Project:', firebaseConfig.projectId);
    } else {
        console.log('[Database] Firebase SDK not loaded yet — using local fallback data until Firestore is available.');
    }
} catch (e) {
    console.warn('[Database] Firebase init warning:', e);
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
 */
function FirestoreUnavailableError(message) {
    const err = new Error(message);
    err.name = 'FirestoreUnavailable';
    return err;
}

async function firestoreRetry(fetchFn, options = {}) {
    const attempts = Math.max(1, options.attempts || 2);
    const timeoutMs = options.timeoutMs || 4000;
    const backoffMs = options.backoffMs === undefined ? 600 : Math.max(0, options.backoffMs || 0);
    let lastErr = null;
    for (let i = 0; i < attempts; i++) {
        if (i > 0 && backoffMs > 0) await new Promise(r => setTimeout(r, backoffMs));
        try {
            return await withFirestoreTimeout(fetchFn(), timeoutMs);
        } catch (err) {
            lastErr = err;
        }
    }
    throw FirestoreUnavailableError('Firestore operation failed after ' + attempts + ' attempt(s): ' + (lastErr && lastErr.message));
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

