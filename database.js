// ============================================================
// INDEXEDDB DATABASE — PseudoPy
// Highly scalable offline persistence layer (10k+ Support)
// ============================================================

console.log('[Database] Initializing IndexedDB (Offline Mode)');

// ── Collection References (Keys) ──
const usersRef = "pseudopy_users";
const exercisesRef = "pseudopy_exercises";
const activityRef = "pseudopy_activity";
const passwordRequestsRef = "pseudopy_passwordRequests";

let dbInstance = null;

function initDB() {
    return new Promise((resolve, reject) => {
        if (dbInstance) return resolve(dbInstance);
        
        const request = indexedDB.open('pseudopy_db', 2);
        
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            const oldVersion = e.oldVersion;

            // v1 → v2: clear users store so new usernames are re-seeded
            if (oldVersion < 2 && db.objectStoreNames.contains(usersRef)) {
                db.deleteObjectStore(usersRef);
            }

            if (!db.objectStoreNames.contains(usersRef)) {
                db.createObjectStore(usersRef, { keyPath: '_docId' });
            }
            if (!db.objectStoreNames.contains(exercisesRef)) {
                db.createObjectStore(exercisesRef, { keyPath: '_docId' });
            }
            if (!db.objectStoreNames.contains(activityRef)) {
                db.createObjectStore(activityRef, { keyPath: '_docId' });
            }
            if (!db.objectStoreNames.contains(passwordRequestsRef)) {
                db.createObjectStore(passwordRequestsRef, { keyPath: '_docId' });
            }
        };

        request.onsuccess = (e) => {
            dbInstance = e.target.result;
            resolve(dbInstance);
        };

        request.onerror = (e) => {
            console.error('[Database] IndexedDB init error:', e.target.error);
            reject(e.target.error);
        };
    });
}

// ══════════════════════════════════════════════════════════════
//  INDEXEDDB HELPER FUNCTIONS (API matches old Firestore API)
// ══════════════════════════════════════════════════════════════

async function dbGetAll(ref, limitCount = null, offsetCount = 0) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(ref, 'readonly');
        const store = transaction.objectStore(ref);
        const request = store.getAll();

        request.onsuccess = () => {
            let results = request.result;
            
            if (limitCount !== null) {
                results = results.slice(offsetCount, offsetCount + limitCount);
            }
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
        request.onerror = () => reject(request.error);
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
        request.onerror = () => reject(request.error);
    });
}

async function dbSet(ref, docId, data) {
    const db = await initDB();
    const finalData = { _docId: docId, ...data };
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(ref, 'readwrite');
        const store = transaction.objectStore(ref);
        const request = store.put(finalData);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
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
            putReq.onsuccess = () => resolve();
            putReq.onerror = () => reject(putReq.error);
        };
        getReq.onerror = () => reject(getReq.error);
    });
}

async function dbDelete(ref, docId) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(ref, 'readwrite');
        const store = transaction.objectStore(ref);
        const request = store.delete(docId);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ══════════════════════════════════════════════════════════════
//  SEED DATABASE (Runs on initialization)
// ══════════════════════════════════════════════════════════════

const SEED_USERS = [
    { _docId: 'u1', id: 'u1', fullName: 'Mark Bautista', username: 'mbautista_admin', email: 'bautista@university.edu.ph', password: 'admin123', role: 'admin', status: 'active' },
    { _docId: 'u2', id: 'u2', fullName: 'Marc Reantaso', username: 'mreantaso_instructor', email: 'reantaso@university.edu.ph', password: 'pass123', role: 'instructor', status: 'active' },
    { _docId: 'u3', id: 'u3', fullName: 'Eduard Mirandilla', username: 'emirandilla_student', email: 'mirandilla@student.edu.ph', password: 'pass123', role: 'student', status: 'active' },
    { _docId: 'u4', id: 'u4', fullName: 'Mikaella Daet', username: 'mdaet_student', email: 'daet@student.edu.ph', password: 'pass123', role: 'student', status: 'active' },
];

const SEED_ACTIVITY = [
    { _docId: 'act1', student: 'Eduard Mirandilla', exercise: 'algo_1', status: 'Completed', score: '95%', time: '5 min ago' },
    { _docId: 'act2', student: 'Mikaella Daet', exercise: 'algo_2', status: 'In Progress', score: '—', time: '12 min ago' },
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
        difficulty: 'medium',
        python_code: 'total = 0\ni = 1\nwhile i < 100:\n    total += i\n    i += 2\nprint(total)',
        createdAt: new Date().toISOString().split('T')[0]
    },
    {
        _docId: 'seed_medium_2',
        id: 'seed_medium_2',
        title: 'Count Multiples of 4 and 7',
        description: 'Count numbers between 1 and 20 that are multiples of 4 or 7.',
        difficulty: 'medium',
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

async function seedDatabase() {
    try {
        const db = await initDB();
        
        // Seed Users
        const users = await dbGetAll(usersRef);
        if (users.length === 0) {
            console.log('[Database] Seeding users...');
            for (const u of SEED_USERS) await dbSet(usersRef, u.id, u);
        }

        // Seed Activity
        const acts = await dbGetAll(activityRef);
        if (acts.length === 0) {
            console.log('[Database] Seeding activity...');
            for (const act of SEED_ACTIVITY) await dbSet(activityRef, act._docId, act);
        }

        // ── Seed 10,000 Exercises from dataset.json ──
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
                console.log('[Database] Fetching 10,000 exercises from dataset.json...');
                try {
                    const res = await fetch('dataset.json');
                    const allData = await res.json();
                    
                    console.log(`[Database] Bulk inserting ${allData.length} exercises into IndexedDB...`);
                    
                    const writeTx = db.transaction(exercisesRef, 'readwrite');
                    const store = writeTx.objectStore(exercisesRef);
                    
                    // Bulk insert 10k items
                    allData.forEach(item => store.put({ _docId: item.id, ...item }));
                    
                    writeTx.oncomplete = () => console.log('[Database] Exercises seeded ✅');
                    writeTx.onerror = (e) => console.error('[Database] Sync error:', e.target.error);
                } catch (fetchErr) {
                    console.warn('[Database] Failed to load dataset.json. Ensure it exists or you are online.', fetchErr);
                }
            } else {
                console.log(`[Database] Found ${countReq.result} exercises. Ready ✅`);
            }
        };

    } catch (err) {
        console.error('[Database] Seed error:', err);
    }
}
