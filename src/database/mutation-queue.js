/* ============================================================
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
}