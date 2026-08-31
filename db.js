// ============================================================
// CENTRAL BACKEND STORE — PseudoPy
// Fast, lightweight in-memory data store for server.js
// ============================================================

const {
    storeGetAll,
    storeGetById,
    storeSetById,
    storeAdd,
    storeUpdateById,
    storeDeleteById,
    storeCount
} = require('./api/_db');

const COLLECTIONS = [
    'pseudopy_users',
    'pseudopy_exercises',
    'pseudopy_activity',
    'pseudopy_passwordRequests',
    'pseudopy_auditLog',
    'pseudopy_notifications',
    'pseudopy_devices'
];

async function initDatabase() {
    console.log('[Backend DB] In-memory store ready.');
    return true;
}

async function getAll(collection, limit = null, offset = 0) {
    return storeGetAll(collection, limit, offset);
}

async function getById(collection, docId) {
    return storeGetById(collection, docId);
}

async function setById(collection, docId, data) {
    return storeSetById(collection, docId, data);
}

async function add(collection, data) {
    return storeAdd(collection, data);
}

async function updateById(collection, docId, updates) {
    return storeUpdateById(collection, docId, updates);
}

async function deleteById(collection, docId) {
    return storeDeleteById(collection, docId);
}

async function count(collection) {
    return storeCount(collection);
}

module.exports = {
    initDatabase,
    getAll,
    getById,
    setById,
    add,
    updateById,
    deleteById,
    count,
    COLLECTIONS
};
