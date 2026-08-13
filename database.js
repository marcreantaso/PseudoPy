// ============================================================
// INDEXEDDB DATABASE — PseudoPy
// Highly scalable offline persistence layer (10k+ Support)
// ============================================================

console.log('[Database] Initializing IndexedDB (Offline Mode)');

// ── Collection References (Keys) ──
const usersRef             = "pseudopy_users";
const exercisesRef         = "pseudopy_exercises";
const activityRef          = "pseudopy_activity";
const passwordRequestsRef  = "pseudopy_passwordRequests";

let dbInstance = null;

function initDB() {
    return new Promise((resolve, reject) => {
        if (dbInstance) return resolve(dbInstance);

        const request = indexedDB.open('pseudopy_db', 7);

        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            const oldVersion = e.oldVersion;

            // Upgrade to v6: clear users & activity to re-seed with 30 students and 100 submissions
            if (oldVersion < 6) {
                if (db.objectStoreNames.contains(usersRef))    db.deleteObjectStore(usersRef);
                if (db.objectStoreNames.contains(activityRef)) db.deleteObjectStore(activityRef);
            }

            // Upgrade to v7: clear exercises store to re-seed with only 30 exercises
            if (oldVersion < 7) {
                if (db.objectStoreNames.contains(exercisesRef)) db.deleteObjectStore(exercisesRef);
            }

            if (!db.objectStoreNames.contains(usersRef))            db.createObjectStore(usersRef,            { keyPath: '_docId' });
            if (!db.objectStoreNames.contains(exercisesRef))        db.createObjectStore(exercisesRef,        { keyPath: '_docId' });
            if (!db.objectStoreNames.contains(activityRef))         db.createObjectStore(activityRef,         { keyPath: '_docId' });
            if (!db.objectStoreNames.contains(passwordRequestsRef)) db.createObjectStore(passwordRequestsRef, { keyPath: '_docId' });
        };

        request.onsuccess = (e) => { dbInstance = e.target.result; resolve(dbInstance); };
        request.onerror   = (e) => { console.error('[Database] IndexedDB init error:', e.target.error); reject(e.target.error); };
    });
}

// ══════════════════════════════════════════════════════════════
//  INDEXEDDB HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════

async function dbGetAll(ref, limitCount = null, offsetCount = 0) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(ref, 'readonly');
        const store = transaction.objectStore(ref);
        const request = store.getAll();

        request.onsuccess = () => {
            let results = request.result;

            if (ref === "pseudopy_exercises") {
                results.sort((a, b) => {
                    const aIsNew = a._docId.startsWith('ex');
                    const bIsNew = b._docId.startsWith('ex');
                    if (aIsNew && !bIsNew) return -1;
                    if (!aIsNew && bIsNew) return 1;
                    if (aIsNew && bIsNew) return b._docId.localeCompare(a._docId);
                    const aNum = parseInt(a._docId.replace('algo_', '')) || 0;
                    const bNum = parseInt(b._docId.replace('algo_', '')) || 0;
                    return aNum - bNum;
                });
            }

            if (ref === "pseudopy_activity") {
                results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            }

            if (limitCount !== null) results = results.slice(offsetCount, offsetCount + limitCount);
            resolve(results);
        };
        request.onerror = () => reject(request.error);
    });
}

async function dbGet(ref, docId) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(ref, 'readonly');
        const store = transaction.objectStore(ref);
        const request = store.get(docId);
        request.onsuccess = () => resolve(request.result);
        request.onerror   = () => reject(request.error);
    });
}

async function dbAdd(ref, data) {
    const db = await initDB();
    const docId = 'doc_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const finalData = { _docId: docId, ...data };
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(ref, 'readwrite');
        const store = transaction.objectStore(ref);
        const request = store.add(finalData);
        request.onsuccess = () => resolve(docId);
        request.onerror   = () => reject(request.error);
    });
}

async function dbSet(ref, docId, data) {
    const db = await initDB();
    const finalData = { _docId: docId, ...data };
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(ref, 'readwrite');
        const store = transaction.objectStore(ref);
        const request = store.put(finalData);
        request.onerror       = () => reject(request.error);
        transaction.oncomplete = () => resolve();
        transaction.onerror    = () => reject(transaction.error);
        transaction.onabort    = () => reject(transaction.error || new Error('Transaction aborted'));
    });
}

async function dbUpdate(ref, docId, data) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(ref, 'readwrite');
        const store = transaction.objectStore(ref);
        const getReq = store.get(docId);
        getReq.onsuccess = () => {
            if (!getReq.result) return resolve();
            const updated = { ...getReq.result, ...data, _docId: docId };
            const putReq = store.put(updated);
            putReq.onerror = () => reject(putReq.error);
        };
        getReq.onerror = () => reject(getReq.error);
        transaction.oncomplete = () => resolve();
        transaction.onerror    = () => reject(transaction.error);
        transaction.onabort    = () => reject(transaction.error || new Error('Transaction aborted'));
    });
}

async function dbDelete(ref, docId) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(ref, 'readwrite');
        const store = transaction.objectStore(ref);
        const request = store.delete(docId);
        request.onerror       = () => reject(request.error);
        transaction.oncomplete = () => resolve();
        transaction.onerror    = () => reject(transaction.error);
        transaction.onabort    = () => reject(transaction.error || new Error('Transaction aborted'));
    });
}

/**
 * Efficiently counts all records in a store without loading them into memory.
 * Uses IndexedDB's native count() — O(1) operation.
 */
async function dbCount(ref) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(ref, 'readonly');
        const store = transaction.objectStore(ref);
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror   = () => reject(request.error);
    });
}

// ══════════════════════════════════════════════════════════════
//  SEED DATA
// ══════════════════════════════════════════════════════════════

  const FILIPINO_NAMES = [
    "John Cruz", "Maria Santos", "Kevin Ramos", "Anna Reyes", "Joshua Garcia",
    "Carlo Mendoza", "Patricia Flores", "Mark Bautista", "Nicole Dela Cruz", "Michael Reyes",
    "Christian Alde", "Jessica Pascual", "Aldrin Castro", "Kenneth Santos", "Jasmine Aquino",
    "Justin Ferrer", "Bianca De Leon", "Aaron Dizon", "Camille Valenzuela", "Dominic Ramos",
    "Ella Salvador", "Adrian Tolentino", "Sofia Corpuz", "Patrick Hernandez", "Hazel Gonzales",
    "Gabriel Santiago", "Abigail Ramos", "Ryan Ocampo", "Megan Custodio", "Kyle Dela Rosa"
];

const SEED_USERS = [
    { _docId: 'u1', id: 'u1', fullName: 'Mark Bautista',       username: 'mbautista_admin',       email: 'bautista@university.edu.ph',   password: 'admin123', role: 'admin',      status: 'active', createdAt: '2025-07-01T08:00:00.000Z' },
    { _docId: 'u2', id: 'u2', fullName: 'Marc Reantaso',        username: 'mreantaso_instructor',   email: 'reantaso@university.edu.ph',    password: 'pass123',  role: 'instructor', status: 'active', createdBy: 'u1', createdAt: '2025-08-10T14:15:00.000Z' },
    { _docId: 'u_stu_emirandilla', id: 'u_stu_emirandilla', studentId: '2024-031', fullName: 'Eduard John Mirandilla', username: 'emirandilla_student', email: 'mirandilla@gmail.com', password: 'pass123', role: 'student', status: 'active', instructorId: 'u2', createdBy: 'u2', section: 'BSCS-3A', createdAt: '2025-08-10T14:30:00.000Z' },
    { _docId: 'u_stu_mdaet', id: 'u_stu_mdaet', studentId: '2024-032', fullName: 'Mikaella Daet', username: 'mdaet_student', email: 'daet@gmail.com', password: 'pass123', role: 'student', status: 'active', instructorId: 'u2', createdBy: 'u2', section: 'BSCS-3A', createdAt: '2025-08-10T14:35:00.000Z' },
];

const SEED_EXERCISES = [
    {
        _docId: 'seed_easy_1',
        id: 'seed_easy_1',
        title: 'Multiply Array Elements',
        description: 'Multiply every element in an array by 4 and output the transformed list.',
        difficulty: 'easy',
        python_code: 'values = [8, 4, 1, 6, 4, 13, 6]\nfor i in range(len(values)):\n    values[i] = values[i] * 4\nprint(values)',
        createdAt: new Date().toISOString().split('T')[0]
    },
    {
        _docId: 'seed_medium_1',
        id: 'seed_medium_1',
        title: 'Sum Odd Numbers',
        description: 'Calculate the sum of odd numbers less than 100 and print the result.',
        difficulty: 'moderate',
        python_code: 'total = 0\ni = 1\nwhile i < 100:\n    total += i\n    i += 2\nprint(total)',
        createdAt: new Date().toISOString().split('T')[0]
    },
    {
        _docId: 'seed_medium_2',
        id: 'seed_medium_2',
        title: 'Count Multiples of 4 and 7',
        description: 'Count numbers between 1 and 20 that are multiples of 4 or 7.',
        difficulty: 'moderate',
        python_code: 'count = 0\nfor i in range(1, 21):\n    if i % 4 == 0 or i % 7 == 0:\n        count += 1\nprint(count)',
        createdAt: new Date().toISOString().split('T')[0]
    },
    {
        _docId: 'seed_hard_1',
        id: 'seed_hard_1',
        title: 'Factorial Computation',
        description: 'Compute the factorial of 6 using a loop and print the final result.',
        difficulty: 'hard',
        python_code: 'result = 1\nfor i in range(1, 7):\n    result *= i\nprint(result)',
        createdAt: new Date().toISOString().split('T')[0]
    }
];

// Generate 30 student accounts
FILIPINO_NAMES.forEach((name, index) => {
    const idNum = String(index + 1).padStart(3, '0');
    // Ensure John Cruz, Maria Santos, Kevin Ramos, Anna Reyes, Joshua Garcia get STU-2024-XXX or 2024-XXX IDs
    const studentId = `2024-${idNum}`;
    const cleanName = name.toLowerCase().replace(/\s+/g, '');
    const username = `${cleanName}_student`;
    const email = `${cleanName.split(' ')[0]}@student.edu.ph`;
    
    SEED_USERS.push({
        _docId: `u_stu_${index + 3}`,
        id: `u_stu_${index + 3}`,
        studentId: studentId,
        fullName: name,
        username: username,
        email: email,
        password: 'pass123',
        role: 'student',
        status: 'active',
        instructorId: 'u2',
        createdBy: 'u2',
        section: ['BSCS-3A', 'BSCS-3B', 'BSIT-3A', 'BSIT-3B'][index % 4]
    });
});

// Helper to build a rich activity record
function act(id, student, studentId, exercise, difficulty, status, score, dateStr, errorType, processingTime, submittedCode, result) {
    const ts = new Date(dateStr).getTime();
    return {
        _docId: id,
        student,
        studentId,
        exercise,
        difficulty: difficulty || 'moderate',
        status,
        score,
        time: dateStr,
        timestamp: ts,
        errorType: errorType || null,
        processingTime: processingTime || '0.0s',
        submittedCode: submittedCode || 'BEGIN\n  PRINT "Hello World"\nEND',
        pseudocode: submittedCode || 'BEGIN\n  PRINT "Hello World"\nEND',
        pythonCode: 'print("Hello World")',
        python_code: 'print("Hello World")',
        result: result || (status === 'Completed' ? 'Pass' : status === 'Failed' ? 'Fail' : 'Pending'),
        output: status === 'Failed' ? `Error: ${errorType} during compilation` : 'Execution successful.\n'
    };
}

// Deterministically generate 100 activity records matching August 2025 (Week 2: Aug 4 - Aug 10, 2025)
const SEED_ACTIVITY = [
    // Top records matching screenshot table exactly
    act('act_sp_1', 'John Cruz', '2024-001', 'Sum of Even Numbers', 'moderate', 'Completed', '100%', '2025-08-08T10:15:00', null, '0.85s', 
        'BEGIN\n  DECLARE sum AS INTEGER\n  sum = 0\n  FOR i FROM 1 TO 10 DO\n    IF i MOD 2 == 0 THEN\n      sum = sum + i\n    END IF\n  END FOR\n  PRINT sum\nEND', 'Success'),
    act('act_sp_2', 'Maria Santos', '2024-002', 'Factorial Calculation', 'hard', 'Completed', '85%', '2025-08-08T10:32:00', null, '1.21s', 
        'BEGIN\n  INPUT n\n  DECLARE f AS INTEGER\n  f = 1\n  FOR i FROM 1 TO n DO\n    f = f * i\n  END FOR\n  PRINT f\nEND', 'Success'),
    act('act_sp_3', 'Kevin Ramos', '2024-003', 'Array Sum', 'easy', 'Failed', '0%', '2025-08-08T11:05:00', 'Syntax Error', '0.65s', 
        'BEGIN\n  DECLARE arr AS ARRAY\n  arr = [1, 2, 3]\n  DECLARE sum AS INTEGER\n  sum = 0\n  FOR i FROM 0 TO 2 DO\n    sum = sum + arr[i]\n  END FOR\n  PRINT sum\nEND', 'Syntax Error'),
    act('act_sp_4', 'Anna Reyes', '2024-004', 'Prime Number Checker', 'moderate', 'Pending', '—', '2025-08-08T11:20:00', null, '—', 
        'BEGIN\n  INPUT n\n  DECLARE isPrime AS BOOLEAN\n  isPrime = TRUE\n  FOR i FROM 2 TO n-1 DO\n    IF n MOD i == 0 THEN\n      isPrime = FALSE\n    END IF\n  END FOR\n  PRINT isPrime\nEND', 'Pending'),
    act('act_sp_5', 'Joshua Garcia', '2024-005', 'String Reversal', 'easy', 'Completed', '90%', '2025-08-08T11:45:00', null, '0.42s', 
        'BEGIN\n  INPUT s\n  PRINT s\nEND', 'Success')
];

const EXERCISES_POOL = [
    { title: "Sum of Even Numbers", difficulty: "moderate" },
    { title: "Factorial Calculation", difficulty: "hard" },
    { title: "Array Sum", difficulty: "easy" },
    { title: "Prime Number Checker", difficulty: "moderate" },
    { title: "String Reversal", difficulty: "easy" },
    { title: "Odd or Even Checker", difficulty: "easy" },
    { title: "Fibonacci Sequence", difficulty: "moderate" },
    { title: "GCD Calculator", difficulty: "moderate" },
    { title: "Bubble Sort", difficulty: "hard" },
    { title: "Binary Search", difficulty: "hard" }
];

const ERROR_TYPES = ["Syntax Error", "Logic Error", "Missing END", "Indentation Error", "Type Error", "Other"];

// Deterministic generator for 95 additional items (total 100 items)
let seed = 12345;
const week2Days = [
    { day: 4, count: 4 },  // Mon Aug 4
    { day: 5, count: 6 },  // Tue Aug 5
    { day: 6, count: 8 },  // Wed Aug 6
    { day: 7, count: 5 },  // Thu Aug 7
    { day: 8, count: 5 },  // Fri Aug 8 (already 5 added above = 10 total)
    { day: 9, count: 2 },  // Sat Aug 9
    { day: 10, count: 3 }  // Sun Aug 10
];

let itemIndex = 6;
week2Days.forEach(w => {
    for (let c = 0; c < w.count; c++) {
        const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280.0; };
        const stuIdx = Math.floor(rand() * 10);
        const studentName = FILIPINO_NAMES[stuIdx];
        const studentId = `2024-${String(stuIdx + 1).padStart(3, '0')}`;
        const ex = EXERCISES_POOL[Math.floor(rand() * EXERCISES_POOL.length)];
        const hour = 8 + Math.floor(rand() * 9);
        const min = Math.floor(rand() * 60);
        const dateStr = `2025-08-${String(w.day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
        
        const statusRand = rand();
        let status = "Completed";
        let score = "85%";
        let errorType = null;
        let result = "Success";
        if (statusRand < 0.65) {
            status = "Completed";
            score = `${Math.floor(rand() * 21) + 80}%`;
            result = "Success";
        } else if (statusRand < 0.85) {
            status = "Failed";
            score = "0%";
            errorType = ERROR_TYPES[Math.floor(rand() * ERROR_TYPES.length)];
            result = errorType;
        } else {
            status = "Pending";
            score = "—";
            result = "Pending";
        }

        const procTime = status === "Pending" ? "—" : `${(rand() * 1.5 + 0.3).toFixed(2)}s`;
        const codeStr = `BEGIN\n  PRINT "Solution for ${ex.title}"\nEND`;

        SEED_ACTIVITY.push(act(`act_gen_${itemIndex++}`, studentName, studentId, ex.title, ex.difficulty, status, score, dateStr, errorType, procTime, codeStr, result));
    }
});

// Generate remaining items to reach exactly 100 items spread across June, July, August 2025
while (SEED_ACTIVITY.length < 100) {
    const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280.0; };
    const stuIdx = Math.floor(rand() * 30);
    const studentName = FILIPINO_NAMES[stuIdx];
    const studentId = `2024-${String(stuIdx + 1).padStart(3, '0')}`;
    const ex = EXERCISES_POOL[Math.floor(rand() * EXERCISES_POOL.length)];
    const month = [6, 7, 8][Math.floor(rand() * 3)];
    const day = Math.floor(rand() * 28) + 1;
    const hour = 8 + Math.floor(rand() * 10);
    const min = Math.floor(rand() * 60);
    const dateStr = `2025-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;

    const statusRand = rand();
    let status = "Completed";
    let score = "90%";
    let errorType = null;
    let result = "Success";
    if (statusRand < 0.7) {
        status = "Completed";
        score = `${Math.floor(rand() * 21) + 80}%`;
        result = "Success";
    } else if (statusRand < 0.88) {
        status = "Failed";
        score = "0%";
        errorType = ERROR_TYPES[Math.floor(rand() * ERROR_TYPES.length)];
        result = errorType;
    } else {
        status = "Pending";
        score = "—";
        result = "Pending";
    }

    const procTime = status === "Pending" ? "—" : `${(rand() * 1.5 + 0.3).toFixed(2)}s`;
    const codeStr = `BEGIN\n  PRINT "Solution for ${ex.title}"\nEND`;

    SEED_ACTIVITY.push(act(`act_gen_${itemIndex++}`, studentName, studentId, ex.title, ex.difficulty, status, score, dateStr, errorType, procTime, codeStr, result));
}
async function seedDatabase() {
    try {
        const db = await initDB();

        // Seed Users
        const users = await dbGetAll(usersRef);
        if (users.length === 0) {
            console.log('[Database] Seeding users...');
            for (const u of SEED_USERS) await dbSet(usersRef, u.id, u);
        }

        // Ensure specific student accounts requested exist
        const emUser = {
            _docId: 'u_stu_emirandilla', id: 'u_stu_emirandilla', studentId: '2024-031',
            fullName: 'Eduard John Mirandilla', username: 'emirandilla_student',
            email: 'mirandilla@gmail.com', password: 'pass123', role: 'student',
            status: 'active', instructorId: 'u2', createdBy: 'u2', section: 'BSCS-3A'
        };
        const mdUser = {
            _docId: 'u_stu_mdaet', id: 'u_stu_mdaet', studentId: '2024-032',
            fullName: 'Mikaella Daet', username: 'mdaet_student',
            email: 'daet@gmail.com', password: 'pass123', role: 'student',
            status: 'active', instructorId: 'u2', createdBy: 'u2', section: 'BSCS-3A'
        };
        await dbSet(usersRef, emUser._docId, emUser);
        await dbSet(usersRef, mdUser._docId, mdUser);

        // Seed Activity
        const acts = await dbGetAll(activityRef);
        if (acts.length === 0) {
            console.log('[Database] Seeding activity records...');
            for (const actItem of SEED_ACTIVITY) await dbSet(activityRef, actItem._docId, actItem);
            console.log(`[Database] ${SEED_ACTIVITY.length} activity records seeded ✅`);
        }

        // Ensure task submissions for Eduard John Mirandilla & Mikaella Daet exist
        const emActs = acts.filter(a => a.studentId === '2024-031' || (a.student && a.student.toLowerCase().includes('mirandilla')));
        if (emActs.length === 0) {
            await dbSet(activityRef, 'act_sp_em1', act('act_sp_em1', 'Eduard John Mirandilla', '2024-031', 'Sum of Even Numbers', 'moderate', 'Completed', '100%', '2025-08-08T14:20:00', null, '0.78s', 
                'BEGIN\n  DECLARE sum AS INTEGER\n  sum = 0\n  FOR i FROM 1 TO 10 DO\n    IF i MOD 2 == 0 THEN\n      sum = sum + i\n    END IF\n  END FOR\n  PRINT sum\nEND', 'Success'));
            await dbSet(activityRef, 'act_sp_em2', act('act_sp_em2', 'Eduard John Mirandilla', '2024-031', 'Factorial Calculation', 'hard', 'Completed', '95%', '2025-08-07T16:10:00', null, '1.10s', 
                'BEGIN\n  INPUT n\n  DECLARE f AS INTEGER\n  f = 1\n  FOR i FROM 1 TO n DO\n    f = f * i\n  END FOR\n  PRINT f\nEND', 'Success'));
        }

        const mdActs = acts.filter(a => a.studentId === '2024-032' || (a.student && a.student.toLowerCase().includes('daet')));
        if (mdActs.length === 0) {
            await dbSet(activityRef, 'act_sp_md1', act('act_sp_md1', 'Mikaella Daet', '2024-032', 'Array Sum', 'easy', 'Completed', '90%', '2025-08-08T15:00:00', null, '0.52s', 
                'BEGIN\n  DECLARE arr AS ARRAY\n  arr = [5, 10, 15]\n  DECLARE sum AS INTEGER\n  sum = 0\n  FOR i FROM 0 TO 2 DO\n    sum = sum + arr[i]\n  END FOR\n  PRINT sum\nEND', 'Success'));
            await dbSet(activityRef, 'act_sp_md2', act('act_sp_md2', 'Mikaella Daet', '2024-032', 'Prime Number Checker', 'moderate', 'Completed', '100%', '2025-08-06T11:30:00', null, '0.89s', 
                'BEGIN\n  INPUT n\n  DECLARE isPrime AS BOOLEAN\n  isPrime = TRUE\n  FOR i FROM 2 TO n-1 DO\n    IF n MOD i == 0 THEN\n      isPrime = FALSE\n    END IF\n  END FOR\n  PRINT isPrime\nEND', 'Success'));
        }

        // ── Seed 30 Exercises from dataset.json ──
        const tx = db.transaction(exercisesRef, 'readonly');
        const countReq = tx.objectStore(exercisesRef).count();

        countReq.onsuccess = async () => {
            const needsSampleSeed = countReq.result < 4;
            if (needsSampleSeed) {
                console.log('[Database] Seeding sample exercises...');
                const sampleTx = db.transaction(exercisesRef, 'readwrite');
                const sampleStore = sampleTx.objectStore(exercisesRef);
                SEED_EXERCISES.forEach(item => sampleStore.put(item));
                sampleTx.oncomplete = () => console.log('[Database] Sample exercises seeded ✅');
                sampleTx.onerror = (e) => console.error('[Database] Sample exercise seed failed:', e.target.error);
            }

            if (countReq.result === 0) {
                console.log('[Database] Fetching exercises from dataset.json (limit: 30)...');
                try {
                    const res = await fetch('dataset.json');
                    const allData = await res.json();
                    const first30 = allData.slice(0, 30); // Only insert 30 exercises
                    console.log(`[Database] Bulk inserting ${first30.length} exercises into IndexedDB...`);
                    const writeTx = db.transaction(exercisesRef, 'readwrite');
                    const store = writeTx.objectStore(exercisesRef);
                    first30.forEach(item => store.put({ _docId: item.id, ...item }));
                    writeTx.oncomplete = () => console.log('[Database] 30 exercises seeded ✅');
                    writeTx.onerror = (e) => console.error('[Database] Sync error:', e.target.error);
                } catch (fetchErr) {
                    console.warn('[Database] Failed to load dataset.json.', fetchErr);
                }
            } else {
                console.log(`[Database] Found ${countReq.result} exercises. Ready ✅`);
            }
        };

    } catch (err) {
        console.error('[Database] Seed error:', err);
    }
}

// ════════════════════════════════════════
// PSEUDOCODE-TO-PYTHON DATABASE
// LocalStorage-based data persistence
// ════════════════════════════════════════

class Database {
  constructor() {
    this.storageKey = 'pseudopy_db';
    this.initializeDatabase();
  }

  initializeDatabase() {
    if (!localStorage.getItem(this.storageKey)) {
      const defaultData = {
        users: [
          { id: 1, fullname: 'MB Autista', username: 'mbautista_admin', email: 'mbautista@university.edu.ph', password: 'admin123', role: 'admin', status: 'active' },
          { id: 2, fullname: 'MR Eantaso', username: 'mreantaso_instructor', email: 'mreantaso@university.edu.ph', password: 'instructor123', role: 'instructor', status: 'active' },
          { id: 3, fullname: 'Eduard John Mirandilla', username: 'emirandilla_student', email: 'mirandilla@gmail.com', password: 'pass123', role: 'student', status: 'active' },
          { id: 4, fullname: 'Mikaella Daet', username: 'mdaet_student', email: 'daet@gmail.com', password: 'pass123', role: 'student', status: 'active' }
        ],
        exercises: [
          {
            id: 1,
            title: 'Count Elements Greater Than Threshold',
            description: 'Counts the number of elements in an array that are strictly greater than 67.',
            difficulty: 'easy',
            solution: 'BEGIN\n  SET count TO 0\n  SET threshold TO 67\n  FOR EACH element IN array DO\n    IF element > threshold THEN\n      SET count TO count + 1\n    END IF\n  END FOR\n  DISPLAY count\nEND',
            createdAt: new Date().toISOString()
          },
          {
            id: 2,
            title: 'Sum of Odd Numbers Less Than Limit',
            description: 'Calculates the sum of odd numbers strictly less than 90.',
            difficulty: 'medium',
            solution: 'BEGIN\n  SET sum TO 0\n  SET limit TO 90\n  SET number TO 1\n  WHILE number < limit DO\n    IF number MOD 2 = 1 THEN\n      SET sum TO sum + number\n    END IF\n    SET number TO number + 1\n  END WHILE\n  DISPLAY sum\nEND',
            createdAt: new Date().toISOString()
          },
          {
            id: 3,
            title: 'Find Multiples of 4 and 5 Up to 15',
            description: 'Iterates to 15, identifying multiples of 4 and 5.',
            difficulty: 'medium',
            solution: 'BEGIN\n  SET limit TO 15\n  SET number TO 1\n  WHILE number <= limit DO\n    IF number MOD 4 = 0 OR number MOD 5 = 0 THEN\n      DISPLAY number\n    END IF\n    SET number TO number + 1\n  END WHILE\nEND',
            createdAt: new Date().toISOString()
          },
          {
            id: 4,
            title: 'Factorial Calculation',
            description: 'Computes the factorial value iteratively up to 4.',
            difficulty: 'hard',
            solution: 'BEGIN\n  SET number TO 4\n  SET factorial TO 1\n  SET i TO 1\n  WHILE i <= number DO\n    SET factorial TO factorial * i\n    SET i TO i + 1\n  END WHILE\n  DISPLAY factorial\nEND',
            createdAt: new Date().toISOString()
          }
        ],
        submissions: [],
        passwordChangeHistory: [],
        metrics: {
          totalTranslations: 0,
          successfulTranslations: 0,
          failedTranslations: 0,
          totalExecutions: 0,
          errorLog: []
        }
      };
      localStorage.setItem(this.storageKey, JSON.stringify(defaultData));
    }
  }

  // ── Users ──
  getUsers() {
    return this.getData().users;
  }

  getUserByUsername(username) {
    return this.getData().users.find(u => u.username === username);
  }

  addUser(user) {
    const data = this.getData();
    user.id = Math.max(...data.users.map(u => u.id), 0) + 1;
    data.users.push(user);
    this.saveData(data);
    return user;
  }

  updateUser(userId, updates) {
    const data = this.getData();
    const user = data.users.find(u => u.id === userId);
    if (user) {
      Object.assign(user, updates);
      this.saveData(data);
    }
    return user;
  }

  deleteUser(userId) {
    const data = this.getData();
    data.users = data.users.filter(u => u.id !== userId);
    this.saveData(data);
  }

  // ── Exercises ──
  getExercises() {
    return this.getData().exercises;
  }

  getExerciseById(id) {
    return this.getData().exercises.find(e => e.id === id);
  }

  addExercise(exercise) {
    const data = this.getData();
    exercise.id = Math.max(...data.exercises.map(e => e.id), 0) + 1;
    exercise.createdAt = new Date().toISOString();
    data.exercises.push(exercise);
    this.saveData(data);
    return exercise;
  }

  updateExercise(exerciseId, updates) {
    const data = this.getData();
    const exercise = data.exercises.find(e => e.id === exerciseId);
    if (exercise) {
      Object.assign(exercise, updates);
      this.saveData(data);
    }
    return exercise;
  }

  deleteExercise(exerciseId) {
    const data = this.getData();
    data.exercises = data.exercises.filter(e => e.id !== exerciseId);
    this.saveData(data);
  }

  // ── Submissions ──
  getSubmissions() {
    return this.getData().submissions;
  }

  addSubmission(submission) {
    const data = this.getData();
    submission.id = Math.max(...data.submissions.map(s => s.id), 0) + 1;
    submission.submittedAt = new Date().toISOString();
    data.submissions.push(submission);
    this.saveData(data);
    return submission;
  }

  getSubmissionsByStudent(studentId) {
    return this.getData().submissions.filter(s => s.studentId === studentId);
  }

  getSubmissionsByExercise(exerciseId) {
    return this.getData().submissions.filter(s => s.exerciseId === exerciseId);
  }

  // ── Password Change History ──
  getPasswordChangeHistory() {
    return this.getData().passwordChangeHistory;
  }

  addPasswordChangeRequest(request) {
    const data = this.getData();
    request.id = Math.max(...data.passwordChangeHistory.map(r => r.id), 0) + 1;
    request.requestedAt = new Date().toISOString();
    data.passwordChangeHistory.push(request);
    this.saveData(data);
    return request;
  }

  // ── Metrics ──
  getMetrics() {
    return this.getData().metrics;
  }

  updateMetrics(updates) {
    const data = this.getData();
    data.metrics = { ...data.metrics, ...updates };
    this.saveData(data);
  }

  addErrorToLog(error) {
    const data = this.getData();
    data.metrics.errorLog.push({
      timestamp: new Date().toISOString(),
      error: error
    });
    this.saveData(data);
  }

  // ── Generic Data Methods ──
  getData() {
    return JSON.parse(localStorage.getItem(this.storageKey) || '{}');
  }

  saveData(data) {
    localStorage.setItem(this.storageKey, JSON.stringify(data));
  }

  clearDatabase() {
    localStorage.removeItem(this.storageKey);
    this.initializeDatabase();
  }

  exportDatabase() {
    return JSON.stringify(this.getData(), null, 2);
  }

  importDatabase(jsonData) {
    try {
      const data = JSON.parse(jsonData);
      localStorage.setItem(this.storageKey, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('Import failed:', e);
      return false;
    }
  }
}

// ── Instantiate Global DB ──
const db = new Database();
