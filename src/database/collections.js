// ══════════════════════════════════════════════════════════════
//  CORE CRUD FUNCTIONS (Firestore + Local Sync)
// ══════════════════════════════════════════════════════════════

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
                setLocalCollection(ref, results);
            }
        } catch (err) {
            console.info(`[Database] Firestore fetch error on ${ref}, using local fallback:`, err.message);
        }
    }

    // 2. Fallback to Local/Seed data if empty.
    if (!results || results.length === 0) {
        results = getLocalCollection(ref);
        // If Firestore is connected, seed it in the background.
        if (firestoreReady() && results.length > 0) {
            seedDatabase().catch(e => console.info('[Database] Background seed attempt:', e));
        }
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
 */
async function dbGet(ref, docId) {
    if (firestoreReady()) {
        try {
            const doc = await withFirestoreTimeout(firestore.collection(ref).doc(docId).get());
            if (doc.exists) {
                return { _docId: doc.id, ...doc.data() };
            }
        } catch (err) {
            console.info(`[Database] Firestore get error on ${ref}/${docId}:`, err.message);
        }
    }

    // Local fallback
    const local = getLocalCollection(ref);
    return local.find(item => item._docId === docId || item.id === docId) || null;
}

/**
 * Add a new document.
 */
async function dbAdd(ref, data) {
    const docId = data._docId || ('doc_' + Date.now() + '_' + Math.floor(Math.random() * 1000));
    const docData = { ...data, _docId: docId };

    // Update local cache immediately
    const local = getLocalCollection(ref);
    const existingIdx = local.findIndex(item => item._docId === docId);
    if (existingIdx >= 0) local[existingIdx] = docData;
    else local.unshift(docData);
    setLocalCollection(ref, local);

    // Save to Firestore if available
    if (firestoreReady()) {
        try {
            await withFirestoreTimeout(firestore.collection(ref).doc(docId).set(docData));
        } catch (err) {
            console.info(`[Database] Error saving to Firestore ${ref} (local cache updated):`, err.message);
        }
    }

    return docId;
}

/**
 * Set (create or overwrite) a document with specific ID.
 */
async function dbSet(ref, docId, data) {
    const docData = { ...data, _docId: docId };

    // Update local cache immediately
    const local = getLocalCollection(ref);
    const existingIdx = local.findIndex(item => item._docId === docId);
    if (existingIdx >= 0) local[existingIdx] = docData;
    else local.push(docData);
    setLocalCollection(ref, local);

    // Save to Firestore if available
    if (firestoreReady()) {
        try {
            await withFirestoreTimeout(firestore.collection(ref).doc(docId).set(docData));
        } catch (err) {
            console.info(`[Database] Error setting to Firestore ${ref}/${docId} (local cache updated):`, err.message);
        }
    }

    return docData;
}

/**
 * Partially update a document.
 */
async function dbUpdate(ref, docId, data) {
    const local = getLocalCollection(ref);
    const existing = local.find(item => item._docId === docId || item.id === docId);
    const merged = existing ? { ...existing, ...data, _docId: docId } : { ...data, _docId: docId };

    // Update local cache immediately
    const existingIdx = local.findIndex(item => item._docId === docId || item.id === docId);
    if (existingIdx >= 0) local[existingIdx] = merged;
    else local.push(merged);
    setLocalCollection(ref, local);

    // Save to Firestore if available
    if (firestoreReady()) {
        try {
            const docRef = firestore.collection(ref).doc(docId);
            await withFirestoreTimeout(docRef.set(merged, { merge: true }));
        } catch (err) {
            console.info(`[Database] Error updating Firestore ${ref}/${docId} (local cache updated):`, err.message);
        }
    }

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

