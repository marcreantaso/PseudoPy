/* ============================================================
   STUDENT NUMBER SERVICE — '230xxxx' allocation
   Canonical field: users.studentNumber  (/^230\d{4}$/)
   Numbers are allocated sequentially via an atomic Firestore
   runTransaction on a counter document, so concurrent account
   creation never produces duplicates. A deterministic local
   fallback keeps the feature working when the SDK is offline.

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
const MAX_ALLOCATION_RETRIES = 3;

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

/**
 * Allocate the next unique 230-series student number.
 * Verifies uniqueness against the users collection and retries on
 * collisions; account creation must abort if this rejects.
 */
async function allocateStudentNumber() {
    if (firestoreReady()) {
        await _ensureCounter();
        for (let attempt = 0; attempt < MAX_ALLOCATION_RETRIES; attempt++) {
            const number = await _allocateFirestore();
            let users = [];
            try {
                users = await _readUsers();
            } catch (e) { /* uniqueness check is best-effort */ }
            const inUse = (users || []).some((u) => u && u.studentNumber === number);
            if (!inUse) return number;
        }
        throw new Error('Unable to allocate a unique student number. Please try again.');
    }
    return _allocateLocal();
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
        STUDENT_NUMBER_PATTERN,
        STUDENT_NUMBER_MAX
    };
}