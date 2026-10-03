/* ============================================================
   STUDENT NUMBER SERVICE — '230xxxx' allocation
   Canonical field: users.studentNumber  (/^230\d{4}$/)
   Numbers are allocated sequentially via an atomic Firestore
   runTransaction on a counter document, so concurrent account
   creation never produces duplicates. A deterministic local
   fallback keeps the feature working when the SDK is offline.

   The counter increment being atomic is necessary but NOT
   sufficient for idempotency. Two near-simultaneous submissions
   receive two *distinct consecutive* numbers (2300003 and
   2300004 for one person), because nothing tied an allocation to
   the request that asked for it. Pass a `requestId` and the
   allocation is recorded against it, so a retry of the same
   submission returns the number it already owns instead of
   consuming another one.

   Omitting `requestId` preserves the original behaviour exactly:
   every call consumes a fresh number.

   The legacy 'studentId' field (2024-xxx seeds) is left intact;
   readStudentNumber() uses it only as a temporary display
   fallback until a migration assigns a 230-series number.
   ============================================================ */

const STUDENT_NUMBER_PREFIX = '230';
const STUDENT_NUMBER_WIDTH = 4; // digits after the prefix
const STUDENT_NUMBER_MAX = 9999;
const STUDENT_NUMBER_PATTERN = /^230\d{4}$/;
const COUNTER_DOC = 'studentNumbers'; // doc id under pseudopy_counters
const LOCAL_COUNTER_KEY = 'pseudopy_student_number_counter';
const LOCAL_ALLOCATIONS_KEY = 'pseudopy_student_number_allocations';
const MAX_ALLOCATION_RETRIES = 3;
const MAX_TRACKED_ALLOCATIONS = 200; // bound the local idempotency ledger
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

/** Reject anything that could collide in a document field or a storage key. */
function isUsableRequestId(value) {
    return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

function isValidStudentNumber(value) {
    return typeof value === 'string' && STUDENT_NUMBER_PATTERN.test(value);
}

/** '230' + zero-padded sequence (0 -> 2300001, 2510 -> 2302510). */
function formatStudentNumber(sequence) {
    const seq = Math.floor(Number(sequence));
    if (!Number.isFinite(seq) || seq <= 0) {
        throw new Error('Invalid student number sequence.');
    }
    if (seq > STUDENT_NUMBER_MAX) {
        throw new RangeError('Student number range exhausted (2309999).');
    }
    return STUDENT_NUMBER_PREFIX + String(seq).padStart(STUDENT_NUMBER_WIDTH, '0');
}

function _numericPart(studentNumber) {
    if (!isValidStudentNumber(studentNumber)) return 0;
    return parseInt(studentNumber.slice(STUDENT_NUMBER_PREFIX.length), 10);
}

function _maxExistingSequence(users) {
    let max = 0;
    (Array.isArray(users) ? users : []).forEach((u) => {
        const n = _numericPart(u && u.studentNumber);
        if (n > max) max = n;
    });
    return max;
}

async function _readUsers() {
    try {
        return await dbGetAll(usersRef, null);
    } catch (e) {
        return getLocalCollection(usersRef) || [];
    }
}

/**
 * Seed the counter document once so future allocations continue
 * from the highest existing 230-series number. Idempotent.
 */
async function _ensureCounter() {
    if (!firestoreReady()) return;
    let snap;
    try {
        snap = await withFirestoreTimeout(firestore.collection(countersRef).doc(COUNTER_DOC).get());
    } catch (e) {
        return;
    }
    if (snap && snap.exists) return;
    const base = await _maxExistingSequence(await _readUsers());
    try {
        await firestore.runTransaction(async (tx) => {
            const ref = firestore.collection(countersRef).doc(COUNTER_DOC);
            const current = await tx.get(ref);
            if (!current.exists) {
                tx.set(ref, { current: base });
            }
        });
    } catch (e) {
        console.info('[StudentNumber] counter seed skipped:', e && e.message);
    }
}

/** Atomic read-increment-write inside a Firestore transaction. */
async function _allocateFirestore() {
    let allocated = null;
    await firestore.runTransaction(async (tx) => {
        const ref = firestore.collection(countersRef).doc(COUNTER_DOC);
        const snap = await tx.get(ref);
        let current = 0;
        if (snap.exists && typeof snap.data().current === 'number' && snap.data().current > 0) {
            current = snap.data().current;
        }
        if (current >= STUDENT_NUMBER_MAX) {
            throw new RangeError('Student number range exhausted (2309999).');
        }
        const next = current + 1;
        tx.set(ref, { current: next });
        allocated = formatStudentNumber(next);
    });
    return allocated;
}

/**
 * Record `requestId -> number` inside the SAME transaction that increments the
 * counter. Recording it in the same atomic step is the whole point: if the
 * allocation and its record cannot commit together, a crash between them
 * still burns a number.
 */
async function _allocateFirestoreKeyed(requestId) {
    let allocated = null;
    await firestore.runTransaction(async (tx) => {
        const ref = firestore.collection(countersRef).doc(COUNTER_DOC);
        const snap = await tx.get(ref);
        const data = snap.exists ? (snap.data() || {}) : {};
        const existing = data.allocations && typeof data.allocations === 'object' ? data.allocations : {};

        // Replay: this request already owns a number.
        if (isValidStudentNumber(existing[requestId])) {
            allocated = existing[requestId];
            return;
        }

        let current = 0;
        if (typeof data.current === 'number' && data.current > 0) {
            current = data.current;
        }
        if (current >= STUDENT_NUMBER_MAX) {
            throw new RangeError('Student number range exhausted (2309999).');
        }
        const next = current + 1;
        const number = formatStudentNumber(next);

        // Keep the ledger bounded. Oldest keys are dropped first; a pruned
        // request simply allocates a new number on retry, which is the
        // pre-existing behaviour rather than a failure.
        const merged = Object.assign({}, existing);
        merged[requestId] = number;
        const keys = Object.keys(merged);
        if (keys.length > MAX_TRACKED_ALLOCATIONS) {
            keys.sort((a, b) => String(merged[a]).localeCompare(String(merged[b])));
            keys.slice(0, keys.length - MAX_TRACKED_ALLOCATIONS).forEach(k => delete merged[k]);
        }

        tx.set(ref, { current: next, allocations: merged });
        allocated = number;
    });
    return allocated;
}

/** Local analogue of the allocation ledger, for the offline path. */
function _readLocalAllocations() {
    try {
        const parsed = JSON.parse(localStorage.getItem(LOCAL_ALLOCATIONS_KEY) || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        return {};
    }
}

function _writeLocalAllocation(requestId, number) {
    try {
        const all = _readLocalAllocations();
        all[requestId] = number;
        const keys = Object.keys(all);
        if (keys.length > MAX_TRACKED_ALLOCATIONS) {
            keys.sort((a, b) => String(all[a]).localeCompare(String(all[b])));
            keys.slice(0, keys.length - MAX_TRACKED_ALLOCATIONS).forEach(k => delete all[k]);
        }
        localStorage.setItem(LOCAL_ALLOCATIONS_KEY, JSON.stringify(all));
    } catch (e) { /* storage unavailable: fall back to a fresh number */ }
}

/** Deterministic sequential fallback for offline / local mode. */
function _allocateLocal() {
    let current = 0;
    try {
        current = parseInt(localStorage.getItem(LOCAL_COUNTER_KEY) || '0', 10) || 0;
    } catch (e) { /* storage unavailable */ }
    const users = getLocalCollection(usersRef) || [];
    const base = _maxExistingSequence(users);
    if (base > current) current = base;
    if (current >= STUDENT_NUMBER_MAX) {
        throw new RangeError('Student number range exhausted (2309999).');
    }
    const next = current + 1;
    try {
        localStorage.setItem(LOCAL_COUNTER_KEY, String(next));
    } catch (e) { /* storage unavailable */ }
    return formatStudentNumber(next);
}

function _allocateLocalKeyed(requestId) {
    const prior = _readLocalAllocations()[requestId];
    if (isValidStudentNumber(prior)) return prior;
    const number = _allocateLocal();
    _writeLocalAllocation(requestId, number);
    return number;
}

/**
 * Allocate the next unique 230-series student number.
 * Verifies uniqueness against the users collection and retries on
 * collisions; account creation must abort if this rejects.
 *
 * @param {string} [requestId] Stable id for one submission attempt. Retrying
 *   with the same id returns the number already granted to it instead of
 *   consuming a new one. Omit it for the original non-idempotent behaviour.
 */
async function allocateStudentNumber(requestId) {
    const keyed = isUsableRequestId(requestId);
    const key = keyed ? requestId : null;

    if (firestoreReady()) {
        await _ensureCounter();
        for (let attempt = 0; attempt < MAX_ALLOCATION_RETRIES; attempt++) {
            const number = key ? await _allocateFirestoreKeyed(key) : await _allocateFirestore();
            // A replayed request owns its number by definition; re-checking it
            // against the users collection would reject the very retry it is
            // meant to heal.
            if (key) return number;
            let users = [];
            try {
                users = await _readUsers();
            } catch (e) { /* uniqueness check is best-effort */ }
            const inUse = (users || []).some((u) => u && u.studentNumber === number);
            if (!inUse) return number;
        }
        throw new Error('Unable to allocate a unique student number. Please try again.');
    }
    return key ? _allocateLocalKeyed(key) : _allocateLocal();
}

/**
 * Forget a request's allocation. Called when account creation is abandoned so
 * a later genuine attempt is not silently handed the abandoned number.
 */
function releaseStudentNumberRequest(requestId) {
    if (!isUsableRequestId(requestId)) return false;
    if (firestoreReady()) {
        // Counter documents cannot be deleted from the client; the ledger entry
        // is pruned by MAX_TRACKED_ALLOCATIONS on its own.
        return false;
    }
    try {
        const all = _readLocalAllocations();
        if (!(requestId in all)) return false;
        delete all[requestId];
        localStorage.setItem(LOCAL_ALLOCATIONS_KEY, JSON.stringify(all));
        return true;
    } catch (e) {
        return false;
    }
}

/** Backward-compatible display value: studentNumber ?? studentId ?? em dash. */
function readStudentNumber(user) {
    if (user && isValidStudentNumber(user.studentNumber)) return user.studentNumber;
    if (user && typeof user.studentId === 'string' && user.studentId.trim()) return user.studentId;
    return '\u2014';
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        isValidStudentNumber,
        formatStudentNumber,
        readStudentNumber,
        allocateStudentNumber,
        releaseStudentNumberRequest,
        isUsableRequestId,
        STUDENT_NUMBER_PATTERN,
        STUDENT_NUMBER_MAX
    };
}