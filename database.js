// ============================================================
// CENTRAL DATABASE CLIENT — PseudoPy
// Firebase Firestore — Persistent Cross-Device Storage
// ============================================================

console.log('[Database] Initializing Firebase Firestore Client...');

// ── Firebase Configuration ─────────────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyAkm5sWvJpcF05QCDDSa8VcUIhh3L0c58U",
    authDomain: "pseudopy-e7e74.firebaseapp.com",
    projectId: "pseudopy-e7e74",
    storageBucket: "pseudopy-e7e74.firebasestorage.app",
    messagingSenderId: "442571972919",
    appId: "1:442571972919:web:53fc4b941b37c484247ab2",
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
//  AUTOMATIC SEEDING LOGIC
// ══════════════════════════════════════════════════════════════

const FILIPINO_NAMES = [
    "John Cruz", "Maria Santos", "Kevin Ramos", "Anna Reyes", "Joshua Garcia",
    "Carlo Mendoza", "Patricia Flores", "Mark Bautista", "Nicole Dela Cruz", "Michael Reyes",
    "Christian Alde", "Jessica Pascual", "Aldrin Castro", "Kenneth Santos", "Jasmine Aquino",
    "Justin Ferrer", "Bianca De Leon", "Aaron Dizon", "Camille Valenzuela", "Dominic Ramos",
    "Ella Salvador", "Adrian Tolentino", "Sofia Corpuz", "Patrick Hernandez", "Hazel Gonzales",
    "Gabriel Santiago", "Abigail Ramos", "Ryan Ocampo", "Megan Custodio", "Kyle Dela Rosa"
];

function buildSeedUsers() {
    const users = [
        { _docId: 'u1', id: 'u1', fullName: 'Mark Bautista', username: 'mbautista_admin', email: 'bautista@university.edu.ph', password: 'admin123', role: 'admin', status: 'active', createdAt: '2025-07-01T08:00:00.000Z' },
        { _docId: 'u2', id: 'u2', fullName: 'Marc Reantaso', username: 'mreantaso_instructor', email: 'reantaso@university.edu.ph', password: 'pass123', role: 'instructor', status: 'active', createdBy: 'u1', createdAt: '2025-08-10T14:15:00.000Z' },
        { _docId: 'u_stu_emirandilla', id: 'u_stu_emirandilla', studentId: '2024-031', fullName: 'Eduard John Mirandilla', username: 'emirandilla_student', email: 'mirandilla@gmail.com', password: 'pass123', role: 'student', status: 'active', instructorId: 'u2', createdBy: 'u2', section: 'BSCS-3A', createdAt: '2025-08-10T14:30:00.000Z' },
        { _docId: 'u_stu_mdaet', id: 'u_stu_mdaet', studentId: '2024-032', fullName: 'Mikaella Daet', username: 'mdaet_student', email: 'daet@gmail.com', password: 'pass123', role: 'student', status: 'active', instructorId: 'u2', createdBy: 'u2', section: 'BSCS-3A', createdAt: '2025-08-10T14:35:00.000Z' },
    ];
    FILIPINO_NAMES.forEach((name, i) => {
        const clean = name.toLowerCase().replace(/\s+/g, '');
        users.push({
            _docId: `u_stu_${i + 3}`,
            id: `u_stu_${i + 3}`,
            studentId: `2024-${String(i + 1).padStart(3, '0')}`,
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
    { _docId: 'seed_easy_1', id: 'seed_easy_1', title: 'Multiply Array Elements', description: 'Multiply every element in an array by 4 and output the transformed list.', difficulty: 'easy', python_code: 'values = [8, 4, 1, 6, 4, 13, 6]\nfor i in range(len(values)):\n    values[i] = values[i] * 4\nprint(values)', createdAt: '2025-08-08' },
    { _docId: 'seed_medium_1', id: 'seed_medium_1', title: 'Sum Odd Numbers', description: 'Calculate the sum of odd numbers less than 100 and print the result.', difficulty: 'moderate', python_code: 'total = 0\ni = 1\nwhile i < 100:\n    total += i\n    i += 2\nprint(total)', createdAt: '2025-08-08' },
    { _docId: 'seed_medium_2', id: 'seed_medium_2', title: 'Count Multiples of 4 and 7', description: 'Count numbers between 1 and 20 that are multiples of 4 or 7.', difficulty: 'moderate', python_code: 'count = 0\nfor i in range(1, 21):\n    if i % 4 == 0 or i % 7 == 0:\n        count += 1\nprint(count)', createdAt: '2025-08-08' },
    { _docId: 'seed_hard_1', id: 'seed_hard_1', title: 'Factorial Computation', description: 'Compute the factorial of 6 using a loop and print the final result.', difficulty: 'hard', python_code: 'result = 1\nfor i in range(1, 7):\n    result *= i\nprint(result)', createdAt: '2025-08-08' }
];

function makeSeedAct(id, student, studentId, exercise, difficulty, status, score, dateStr, errorType, procTime) {
    return {
        _docId: id, student, studentId, exercise,
        difficulty: difficulty || 'moderate', status, score,
        time: dateStr, timestamp: new Date(dateStr).getTime(),
        errorType: errorType || null,
        processingTime: procTime || '0.0s',
        submittedCode: 'BEGIN\n  PRINT "Hello World"\nEND',
        pseudocode: 'BEGIN\n  PRINT "Hello World"\nEND',
        pythonCode: 'print("Hello World")',
        python_code: 'print("Hello World")',
        result: status === 'Completed' ? 'Success' : (status === 'Failed' ? (errorType || 'Syntax Error') : 'Pending'),
        output: status === 'Failed' ? `Error: ${errorType} during compilation` : 'Execution successful.\n'
    };
}

async function batchSeed(collectionName, items) {
    const batch = firestore.batch();
    items.forEach(item => {
        const ref = firestore.collection(collectionName).doc(item._docId);
        batch.set(ref, item);
    });
    await batch.commit();
}

async function seedDatabase() {
    try {
        console.log('[Database] Checking if Firebase Firestore requires initial seed...');
        const userCount = await dbCount(usersRef);
        if (userCount === 0) {
            console.log('[Database] Seeding initial users into Firestore...');
            await batchSeed(usersRef, buildSeedUsers());
            console.log('[Database] Users seeded ✅');
        }

        const exCount = await dbCount(exercisesRef);
        if (exCount === 0) {
            console.log('[Database] Seeding initial exercises into Firestore...');
            await batchSeed(exercisesRef, SEED_EXERCISES_LIST);
            console.log('[Database] Exercises seeded ✅');
        }

        const actCount = await dbCount(activityRef);
        if (actCount === 0) {
            console.log('[Database] Seeding sample activity into Firestore...');
            const seedActs = [
                makeSeedAct('act_sp_1', 'John Cruz', '2024-001', 'Sum of Even Numbers', 'moderate', 'Completed', '100%', '2025-08-08T10:15:00', null, '0.85s'),
                makeSeedAct('act_sp_2', 'Maria Santos', '2024-002', 'Factorial Calculation', 'hard', 'Completed', '85%', '2025-08-08T10:32:00', null, '1.21s'),
                makeSeedAct('act_sp_3', 'Kevin Ramos', '2024-003', 'Array Sum', 'easy', 'Failed', '0%', '2025-08-08T11:05:00', 'Syntax Error', '0.65s'),
                makeSeedAct('act_sp_4', 'Anna Reyes', '2024-004', 'Prime Number Checker', 'moderate', 'Pending', '—', '2025-08-08T11:20:00', null, '—'),
                makeSeedAct('act_sp_5', 'Joshua Garcia', '2024-005', 'String Reversal', 'easy', 'Completed', '90%', '2025-08-08T11:45:00', null, '0.42s'),
                makeSeedAct('act_sp_em1', 'Eduard John Mirandilla', '2024-031', 'Sum of Even Numbers', 'moderate', 'Completed', '100%', '2025-08-08T14:20:00', null, '0.78s'),
                makeSeedAct('act_sp_em2', 'Eduard John Mirandilla', '2024-031', 'Factorial Calculation', 'hard', 'Completed', '95%', '2025-08-07T16:10:00', null, '1.10s'),
                makeSeedAct('act_sp_md1', 'Mikaella Daet', '2024-032', 'Array Sum', 'easy', 'Completed', '90%', '2025-08-08T15:00:00', null, '0.52s'),
                makeSeedAct('act_sp_md2', 'Mikaella Daet', '2024-032', 'Prime Number Checker', 'moderate', 'Completed', '100%', '2025-08-06T11:30:00', null, '0.89s'),
            ];
            await batchSeed(activityRef, seedActs);
            console.log('[Database] Activity seeded ✅');
        }
    } catch (err) {
        console.warn('[Database] Seeding error (non-fatal):', err);
    }
    return true;
}

// ══════════════════════════════════════════════════════════════
//  APP-LEVEL HELPERS & INTERFACE
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
