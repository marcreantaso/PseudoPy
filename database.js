// ============================================================
// CENTRAL BACKEND CLIENT (REST API) — PseudoPy
// Cross-Device Real-Time Database Client
// ============================================================

console.log('[Database] Initializing Central Backend Client (Synchronized Mode)');

// ── Collection References (API Endpoints) ──
const usersRef             = "pseudopy_users";
const exercisesRef         = "pseudopy_exercises";
const activityRef          = "pseudopy_activity";
const passwordRequestsRef  = "pseudopy_passwordRequests";
const auditLogRef          = "pseudopy_auditLog";
const notificationsRef     = "pseudopy_notifications";
const devicesRef           = "pseudopy_devices";

const API_BASE = '/api';

// ══════════════════════════════════════════════════════════════
//  PASSWORD HASHING — Web Crypto API (SHA-256 + Salt)
//  NEVER store or compare plaintext passwords.
// ══════════════════════════════════════════════════════════════

/**
 * Generates a cryptographically random hex salt string.
 */
function generateSalt() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hashes a password with a salt using SHA-256 via Web Crypto API.
 * @param {string} password - The plaintext password
 * @param {string} salt - The hex salt string
 * @returns {Promise<string>} The hex-encoded hash
 */
async function hashPassword(password, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifies a plaintext password against a stored hash and salt.
 * @param {string} inputPassword - The password entered by the user
 * @param {string} storedHash - The stored SHA-256 hex hash
 * @param {string} storedSalt - The stored hex salt
 * @returns {Promise<boolean>}
 */
async function verifyPassword(inputPassword, storedHash, storedSalt) {
    const computedHash = await hashPassword(inputPassword, storedSalt);
    return computedHash === storedHash;
}

// ══════════════════════════════════════════════════════════════
//  CENTRAL DATABASE API CLIENT FUNCTIONS
// ══════════════════════════════════════════════════════════════

async function initDB() {
    return true;
}

async function dbGetAll(ref, limitCount = null, offsetCount = 0) {
    try {
        let url = `${API_BASE}/${ref}`;
        const params = [];
        if (limitCount !== null && limitCount !== undefined) params.push(`limit=${limitCount}`);
        if (offsetCount) params.push(`offset=${offsetCount}`);
        if (params.length > 0) url += `?${params.join('&')}`;

        const res = await fetch(url);
        if (!res.ok) {
            console.error(`[Database] Error fetching ${ref}:`, res.statusText);
            return [];
        }
        return await res.json();
    } catch (err) {
        console.error(`[Database] Network error fetching ${ref}:`, err);
        return [];
    }
}

async function dbGet(ref, docId) {
    try {
        const res = await fetch(`${API_BASE}/${ref}/${encodeURIComponent(docId)}`);
        if (res.status === 404) return null;
        if (!res.ok) {
            console.error(`[Database] Error getting ${ref}/${docId}:`, res.statusText);
            return null;
        }
        return await res.json();
    } catch (err) {
        console.error(`[Database] Network error getting ${ref}/${docId}:`, err);
        return null;
    }
}

async function dbAdd(ref, data) {
    try {
        const res = await fetch(`${API_BASE}/${ref}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error(`Failed to add record: ${res.statusText}`);
        const result = await res.json();
        return result._docId || result.id;
    } catch (err) {
        console.error(`[Database] Error adding to ${ref}:`, err);
        throw err;
    }
}

async function dbSet(ref, docId, data) {
    try {
        const res = await fetch(`${API_BASE}/${ref}/${encodeURIComponent(docId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error(`Failed to set record: ${res.statusText}`);
        return await res.json();
    } catch (err) {
        console.error(`[Database] Error setting ${ref}/${docId}:`, err);
        throw err;
    }
}

async function dbUpdate(ref, docId, data) {
    try {
        const res = await fetch(`${API_BASE}/${ref}/${encodeURIComponent(docId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error(`Failed to update record: ${res.statusText}`);
        return await res.json();
    } catch (err) {
        console.error(`[Database] Error updating ${ref}/${docId}:`, err);
        throw err;
    }
}

async function dbDelete(ref, docId) {
    try {
        const res = await fetch(`${API_BASE}/${ref}/${encodeURIComponent(docId)}`, {
            method: 'DELETE'
        });
        if (!res.ok) throw new Error(`Failed to delete record: ${res.statusText}`);
        return await res.json();
    } catch (err) {
        console.error(`[Database] Error deleting ${ref}/${docId}:`, err);
        throw err;
    }
}

/**
 * Counts all records in a collection from the central database.
 */
async function dbCount(ref) {
    try {
        const res = await fetch(`${API_BASE}/${ref}/count`);
        if (!res.ok) return 0;
        const data = await res.json();
        return data.count || 0;
    } catch (err) {
        console.error(`[Database] Error counting ${ref}:`, err);
        return 0;
    }
}

// ══════════════════════════════════════════════════════════════
//  APP-LEVEL REFRESH HELPERS (Called from app.js)
// ══════════════════════════════════════════════════════════════

async function refreshPasswordHistory() {
    return await dbGetAll(passwordRequestsRef);
}

async function refreshAuditLog() {
    return await dbGetAll(auditLogRef);
}

async function seedDatabase() {
    console.log('[Database] Connected to Central Backend.');
    return true;
}

// ══════════════════════════════════════════════════════════════
//  DATABASE INTERFACE CLASS (Compatibility Layer)
// ══════════════════════════════════════════════════════════════

class Database {
    constructor() {
        this.ready = true;
    }
    async getUsers() { return await dbGetAll(usersRef); }
    async getUserByUsername(username) {
        const users = await dbGetAll(usersRef);
        return users.find(u => u.username === username);
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
