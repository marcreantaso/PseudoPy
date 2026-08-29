// ============================================================
// CENTRAL DATABASE CLIENT — PseudoPy
// Firebase Firestore — Persistent Cross-Device Storage
// ============================================================

console.log('[Database] Initializing Firebase Firestore Client...');

// ── Firebase Configuration ─────────────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyAkm5sWJpcF05QCDDSa8VciUTh3LOc5BU",
    authDomain: "pseudopy-e7e74.firebaseapp.com",
    projectId: "pseudopy-e7e74",
    storageBucket: "pseudopy-e7e74.firebasestorage.app",
    messagingSenderId: "442671972919",
    appId: "1:442671972919:web:53fc4b941b37c484247ab2",
    measurementId: "G-K0HKBVFEKD"
};

// Initialize Firebase (safe to call multiple times)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

console.log('[Database] Firebase Firestore initialized. Project:', firebaseConfig.projectId);

// ── Collection References ──────────────────────────────────
const usersRef             = "pseudopy_users";
const exercisesRef         = "pseudopy_exercises";
const activityRef          = "pseudopy_activity";
const passwordRequestsRef  = "pseudopy_passwordRequests";
const auditLogRef          = "pseudopy_auditLog";
const notificationsRef     = "pseudopy_notifications";
const devicesRef           = "pseudopy_devices";

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
//  CORE FIRESTORE CRUD FUNCTIONS
// ══════════════════════════════════════════════════════════════

/**
 * Get all documents from a collection.
 * @param {string} ref - Collection name
 * @param {number|null} limitCount - Max records to return
 * @param {number} offsetCount - Number of records to skip (client-side)
 * @returns {Promise<Array>}
 */
async function dbGetAll(ref, limitCount = null, offsetCount = 0) {
    try {
        const snapshot = await firestore.collection(ref).get();
        let results = snapshot.docs.map(doc => ({ _docId: doc.id, ...doc.data() }));

        // Client-side sorting (mirrors original server-side logic)
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

        // Pagination (client-side)
        if (limitCount !== null && limitCount !== undefined) {
            const l = parseInt(limitCount, 10);
            const o = parseInt(offsetCount, 10) || 0;
            results = results.slice(o, o + l);
        }

        return results;
    } catch (err) {
        console.error(`[Database] Error getting all from ${ref}:`, err);
        return [];
    }
}

/**
 * Get a single document by ID.
 * @param {string} ref - Collection name
 * @param {string} docId - Document ID
 * @returns {Promise<Object|null>}
 */
async function dbGet(ref, docId) {
    try {
        const doc = await firestore.collection(ref).doc(docId).get();
        if (!doc.exists) return null;
        return { _docId: doc.id, ...doc.data() };
    } catch (err) {
        console.error(`[Database] Error getting ${ref}/${docId}:`, err);
        return null;
    }
}

/**
 * Add a new document (auto-generates ID if none provided).
 * @param {string} ref - Collection name
 * @param {Object} data - Document data
 * @returns {Promise<string>} The document ID
 */
async function dbAdd(ref, data) {
    try {
        const docId = data._docId || null;
        if (docId) {
            await firestore.collection(ref).doc(docId).set({ ...data, _docId: docId });
            return docId;
        } else {
            const docRef = await firestore.collection(ref).add({ ...data });
            await docRef.update({ _docId: docRef.id });
            return docRef.id;
        }
    } catch (err) {
        console.error(`[Database] Error adding to ${ref}:`, err);
        throw err;
    }
}

/**
 * Set (create or overwrite) a document with a specific ID.
 * @param {string} ref - Collection name
 * @param {string} docId - Document ID
 * @param {Object} data - Document data
 * @returns {Promise<Object>}
 */
async function dbSet(ref, docId, data) {
    try {
        const docData = { ...data, _docId: docId };
        await firestore.collection(ref).doc(docId).set(docData);
        return docData;
    } catch (err) {
        console.error(`[Database] Error setting ${ref}/${docId}:`, err);
        throw err;
    }
}

/**
 * Partially update (merge) a document's fields.
 * @param {string} ref - Collection name
 * @param {string} docId - Document ID
 * @param {Object} data - Fields to update
 * @returns {Promise<Object>}
 */
async function dbUpdate(ref, docId, data) {
    try {
        const docRef = firestore.collection(ref).doc(docId);
        const existing = await docRef.get();
        if (!existing.exists) {
            // Create if not exists
            await docRef.set({ ...data, _docId: docId });
            return { ...data, _docId: docId };
        }
        await docRef.update(data);
        const updated = await docRef.get();
        return { _docId: docId, ...updated.data() };
    } catch (err) {
        console.error(`[Database] Error updating ${ref}/${docId}:`, err);
        throw err;
    }
}

/**
 * Delete a document by ID.
 * @param {string} ref - Collection name
 * @param {string} docId - Document ID
 * @returns {Promise<{success: boolean}>}
 */
async function dbDelete(ref, docId) {
    try {
        await firestore.collection(ref).doc(docId).delete();
        return { success: true };
    } catch (err) {
        console.error(`[Database] Error deleting ${ref}/${docId}:`, err);
        throw err;
    }
}

/**
 * Count all documents in a collection.
 * @param {string} ref - Collection name
 * @returns {Promise<number>}
 */
async function dbCount(ref) {
    try {
        const snapshot = await firestore.collection(ref).get();
        return snapshot.size;
    } catch (err) {
        console.error(`[Database] Error counting ${ref}:`, err);
        return 0;
    }
}

// ══════════════════════════════════════════════════════════════
//  APP-LEVEL HELPERS
// ══════════════════════════════════════════════════════════════

async function initDB() {
    return true;
}

async function refreshPasswordHistory() {
    return await dbGetAll(passwordRequestsRef);
}

async function refreshAuditLog() {
    return await dbGetAll(auditLogRef);
}

async function seedDatabase() {
    console.log('[Database] Connected to Firebase Firestore.');
    return true;
}

// ══════════════════════════════════════════════════════════════
//  DATABASE INTERFACE CLASS (Compatibility Layer)
// ══════════════════════════════════════════════════════════════

class Database {
    constructor() { this.ready = true; }
    async getUsers() { return await dbGetAll(usersRef); }
    async getUserByUsername(username) {
        const users = await dbGetAll(usersRef);
        return users.find(u => u.username === username) || null;
    }
    async addUser(user) { return await dbAdd(usersRef, user); }
    async updateUser(userId, updates) { return await dbUpdate(usersRef, userId, updates); }
    async deleteUser(userId) { return await dbDelete(usersRef, userId); }
    async getExercises() { return await dbGetAll(exercisesRef); }
    async getExerciseById(id) { return await dbGet(exercisesRef, id); }
    async addExercise(exercise) { return await dbAdd(exercisesRef, exercise); }
    async updateExercise(exerciseId, updates) { return await dbUpdate(exercisesRef, exerciseId, updates); }
    async deleteExercise(exerciseId) { return await dbDelete(exercisesRef, exerciseId); }
    async getSubmissions() { return await dbGetAll(activityRef); }
    async addSubmission(submission) { return await dbAdd(activityRef, submission); }
    async getPasswordChangeHistory() { return await dbGetAll(passwordRequestsRef); }
    async addPasswordChangeRequest(request) { return await dbAdd(passwordRequestsRef, request); }
}

const db = new Database();

console.log('[Database] Firebase Firestore client ready ✅');
