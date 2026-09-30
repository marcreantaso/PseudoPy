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
}