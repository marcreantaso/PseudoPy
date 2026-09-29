// ══════════════════════════════════════════════════════════════
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
    if (firestoreReady()) {
        try {
            const snapshot = await withFirestoreTimeout(firestore.collection(ref).get());
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
            console.info(`[Database] Firestore fetch error on ${ref}, using local fallback:`, err.message);
        }
    }

    // 2. Fallback to Local/Seed data if empty.
    if (!results || results.length === 0) {
        results = getLocalCollection(ref);
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
    if (firestoreReady()) {
        try {
            const doc = await firestoreRetry(() => firestore.collection(ref).doc(docId).get(), { attempts: opts.attempts || 2, timeoutMs: opts.timeoutMs, backoffMs: opts.backoffMs });
            if (doc.exists) return { _docId: doc.id, ...doc.data() };
            return null;
        } catch (err) {
            if (opts.strict) {
                console.warn(`[Database] Firestore get error on ${ref}/${docId}:`, err.message);
                throw (err && err.name === 'FirestoreUnavailable') ? err : FirestoreUnavailableError(err.message);
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
            if (!mutation.documentId || mutation.operation === 'DELETE') continue;
            const payload = Object.assign({}, mutation.payload || {}, { _docId: mutation.documentId });
            const idx = list.findIndex(d => d._docId === mutation.documentId || d.id === mutation.documentId);
            if (idx >= 0) list[idx] = payload;
            else list.unshift(payload);
        }
        return list;
    } catch (e) {
        return results;
    }
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
    if (!firestoreReady()) {
        if (typeof markFirestoreReachable === 'function') markFirestoreReachable(false);
        if (typeof enqueueMutation === 'function') await enqueueMutation(operation, ref, docId, payload);
        if (typeof syncNow === 'function') syncNow('write');
        throw cloudSaveFailure(ref, docId);
    }
    try {
        if (operation === 'UPDATE') {
            await withFirestoreTimeout(firestore.collection(ref).doc(docId).set(payload, { merge: true }));
        } else {
            await withFirestoreTimeout(firestore.collection(ref).doc(docId).set(payload));
        }
        if (typeof markFirestoreReachable === 'function') markFirestoreReachable(true);
        if (typeof clearPendingForDocument === 'function') await clearPendingForDocument(ref, docId);
        if (typeof syncNow === 'function') syncNow('write');
        cloudSaveComplete(ref, docId);
    } catch (err) {
        const classification = (typeof classifyDbError === 'function' ? classifyDbError(err) : { transient: false, message: err.message });
        if (classification.transient) {
            if (typeof markFirestoreReachable === 'function') markFirestoreReachable(false);
            if (typeof enqueueMutation === 'function') await enqueueMutation(operation, ref, docId, payload);
            if (typeof syncNow === 'function') syncNow('write');
            console.info(`[Database] Firestore ${ref}/${docId} temporarily unavailable; write queued offline.`);
        } else {
            if (typeof markFirestoreReachable === 'function') markFirestoreReachable(true);
            console.warn(`[Database] Permanent Firestore failure on ${ref}/${docId}:`, classification.message);
        }
        throw cloudSaveFailure(ref, docId, err);
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
 * Intentionally disabled for Firestore-backed persistence to prevent data loss.
 */
async function dbDelete(ref, docId) {
    const local = getLocalCollection(ref);
    const exists = local.some(item => item._docId === docId || item.id === docId);

    if (firestoreReady()) {
        try {
            await firestore.collection(ref).doc(docId).delete();
        } catch (err) {
            console.error(`[Database] Error deleting Firestore ${ref}/${docId}:`, err);
        }
    }

    if (!exists) {
        return { success: false, deleted: false, message: 'Nothing to delete.' };
    }

    return { success: false, deleted: false, message: 'Deletion is disabled to protect persisted Firestore data.' };
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
