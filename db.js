// ============================================================
// CENTRAL BACKEND DATABASE (SQLite) — PseudoPy
// Persistent, multi-client, cross-device database layer
// ============================================================

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'pseudopy.sqlite');
const db = new sqlite3.Database(DB_PATH);

const COLLECTIONS = [
    'pseudopy_users',
    'pseudopy_exercises',
    'pseudopy_activity',
    'pseudopy_passwordRequests',
    'pseudopy_auditLog',
    'pseudopy_notifications',
    'pseudopy_devices'
];

function sanitizeCollection(collection) {
    if (!collection || !/^[a-zA-Z0-9_]+$/.test(collection)) {
        throw new Error('Invalid collection name: ' + collection);
    }
    return collection;
}

// Helper to run query with Promise
function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

async function ensureTable(collection) {
    const col = sanitizeCollection(collection);
    await run(`
        CREATE TABLE IF NOT EXISTS ${col} (
            doc_id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

// ══════════════════════════════════════════════════════════════
//  INITIALIZATION & SCHEMA SETUP
// ══════════════════════════════════════════════════════════════

async function initDatabase() {
    // Enable WAL mode for high concurrency
    await run('PRAGMA journal_mode = WAL;');

    for (const col of COLLECTIONS) {
        await ensureTable(col);
    }

    console.log('[Backend DB] SQLite tables verified.');
    await seedDatabaseIfNeeded();
}

// ══════════════════════════════════════════════════════════════
//  CRUD OPERATIONS
// ══════════════════════════════════════════════════════════════

async function getAll(collection, limit = null, offset = 0) {
    const col = sanitizeCollection(collection);
    await ensureTable(col);
    
    let rows = await all(`SELECT data FROM ${col}`);
    let results = rows.map(r => JSON.parse(r.data));

    if (collection === 'pseudopy_exercises') {
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

    if (collection === 'pseudopy_activity') {
        results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }

    if (collection === 'pseudopy_auditLog') {
        results.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    }

    if (collection === 'pseudopy_notifications') {
        results.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    if (limit !== null && limit !== undefined && limit !== '') {
        const l = parseInt(limit, 10);
        const o = parseInt(offset, 10) || 0;
        results = results.slice(o, o + l);
    }

    return results;
}

async function getById(collection, docId) {
    const col = sanitizeCollection(collection);
    await ensureTable(col);
    const row = await get(`SELECT data FROM ${col} WHERE doc_id = ?`, [docId]);
    return row ? JSON.parse(row.data) : null;
}

async function setById(collection, docId, data) {
    const col = sanitizeCollection(collection);
    await ensureTable(col);
    const docData = { ...data, _docId: docId };
    const jsonStr = JSON.stringify(docData);

    await run(`
        INSERT INTO ${col} (doc_id, data, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(doc_id) DO UPDATE SET
            data = excluded.data,
            updated_at = CURRENT_TIMESTAMP
    `, [docId, jsonStr]);

    return docData;
}

async function add(collection, data) {
    const col = sanitizeCollection(collection);
    await ensureTable(col);
    const docId = data._docId || ('doc_' + Date.now() + '_' + Math.floor(Math.random() * 1000));
    return await setById(col, docId, data);
}

async function updateById(collection, docId, updates) {
    const col = sanitizeCollection(collection);
    await ensureTable(col);
    const existing = await getById(col, docId);
    if (!existing) {
        return await setById(col, docId, updates);
    }
    const merged = { ...existing, ...updates, _docId: docId };
    return await setById(col, docId, merged);
}

async function deleteById(collection, docId) {
    const col = sanitizeCollection(collection);
    await ensureTable(col);
    await run(`DELETE FROM ${col} WHERE doc_id = ?`, [docId]);
    return { success: true };
}

async function count(collection) {
    const col = sanitizeCollection(collection);
    await ensureTable(col);
    const row = await get(`SELECT COUNT(*) as count FROM ${col}`);
    return row ? row.count : 0;
}

// ══════════════════════════════════════════════════════════════
//  SEED DATA & LOGIC
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
    { _docId: 'u1', id: 'u1', fullName: 'Mark Bautista', username: 'mbautista_admin', email: 'bautista@university.edu.ph', password: 'admin123', role: 'admin', status: 'active', createdAt: '2025-07-01T08:00:00.000Z' },
    { _docId: 'u2', id: 'u2', fullName: 'Marc Reantaso', username: 'mreantaso_instructor', email: 'reantaso@university.edu.ph', password: 'pass123', role: 'instructor', status: 'active', createdBy: 'u1', createdAt: '2025-08-10T14:15:00.000Z' },
    { _docId: 'u_stu_emirandilla', id: 'u_stu_emirandilla', studentId: '2024-031', fullName: 'Eduard John Mirandilla', username: 'emirandilla_student', email: 'mirandilla@gmail.com', password: 'pass123', role: 'student', status: 'active', instructorId: 'u2', createdBy: 'u2', section: 'BSCS-3A', createdAt: '2025-08-10T14:30:00.000Z' },
    { _docId: 'u_stu_mdaet', id: 'u_stu_mdaet', studentId: '2024-032', fullName: 'Mikaella Daet', username: 'mdaet_student', email: 'daet@gmail.com', password: 'pass123', role: 'student', status: 'active', instructorId: 'u2', createdBy: 'u2', section: 'BSCS-3A', createdAt: '2025-08-10T14:35:00.000Z' },
];

FILIPINO_NAMES.forEach((name, index) => {
    const idNum = String(index + 1).padStart(3, '0');
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

const SEED_EXERCISES = [
    {
        _docId: 'seed_easy_1',
        id: 'seed_easy_1',
        title: 'Multiply Array Elements',
        description: 'Multiply every element in an array by 4 and output the transformed list.',
        difficulty: 'easy',
        python_code: 'values = [8, 4, 1, 6, 4, 13, 6]\nfor i in range(len(values)):\n    values[i] = values[i] * 4\nprint(values)',
        createdAt: '2025-08-08'
    },
    {
        _docId: 'seed_medium_1',
        id: 'seed_medium_1',
        title: 'Sum Odd Numbers',
        description: 'Calculate the sum of odd numbers less than 100 and print the result.',
        difficulty: 'moderate',
        python_code: 'total = 0\ni = 1\nwhile i < 100:\n    total += i\n    i += 2\nprint(total)',
        createdAt: '2025-08-08'
    },
    {
        _docId: 'seed_medium_2',
        id: 'seed_medium_2',
        title: 'Count Multiples of 4 and 7',
        description: 'Count numbers between 1 and 20 that are multiples of 4 or 7.',
        difficulty: 'moderate',
        python_code: 'count = 0\nfor i in range(1, 21):\n    if i % 4 == 0 or i % 7 == 0:\n        count += 1\nprint(count)',
        createdAt: '2025-08-08'
    },
    {
        _docId: 'seed_hard_1',
        id: 'seed_hard_1',
        title: 'Factorial Computation',
        description: 'Compute the factorial of 6 using a loop and print the final result.',
        difficulty: 'hard',
        python_code: 'result = 1\nfor i in range(1, 7):\n    result *= i\nprint(result)',
        createdAt: '2025-08-08'
    }
];

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

const SEED_ACTIVITY = [
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

let seed = 12345;
const week2Days = [
    { day: 4, count: 4 },
    { day: 5, count: 6 },
    { day: 6, count: 8 },
    { day: 7, count: 5 },
    { day: 8, count: 5 },
    { day: 9, count: 2 },
    { day: 10, count: 3 }
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

async function seedDatabaseIfNeeded() {
    try {
        const userCount = await count('pseudopy_users');
        if (userCount === 0) {
            console.log('[Backend DB] Seeding users into SQLite...');
            for (const u of SEED_USERS) {
                await setById('pseudopy_users', u._docId || u.id, u);
            }
            console.log('[Backend DB] Users seeded.');
        }

        const actCount = await count('pseudopy_activity');
        if (actCount === 0) {
            console.log('[Backend DB] Seeding activity into SQLite...');
            for (const a of SEED_ACTIVITY) {
                await setById('pseudopy_activity', a._docId, a);
            }

            // Specific records for Eduard John Mirandilla and Mikaella Daet
            await setById('pseudopy_activity', 'act_sp_em1', act('act_sp_em1', 'Eduard John Mirandilla', '2024-031', 'Sum of Even Numbers', 'moderate', 'Completed', '100%', '2025-08-08T14:20:00', null, '0.78s', 
                'BEGIN\n  DECLARE sum AS INTEGER\n  sum = 0\n  FOR i FROM 1 TO 10 DO\n    IF i MOD 2 == 0 THEN\n      sum = sum + i\n    END IF\n  END FOR\n  PRINT sum\nEND', 'Success'));
            await setById('pseudopy_activity', 'act_sp_em2', act('act_sp_em2', 'Eduard John Mirandilla', '2024-031', 'Factorial Calculation', 'hard', 'Completed', '95%', '2025-08-07T16:10:00', null, '1.10s', 
                'BEGIN\n  INPUT n\n  DECLARE f AS INTEGER\n  f = 1\n  FOR i FROM 1 TO n DO\n    f = f * i\n  END FOR\n  PRINT f\nEND', 'Success'));
            await setById('pseudopy_activity', 'act_sp_md1', act('act_sp_md1', 'Mikaella Daet', '2024-032', 'Array Sum', 'easy', 'Completed', '90%', '2025-08-08T15:00:00', null, '0.52s', 
                'BEGIN\n  DECLARE arr AS ARRAY\n  arr = [5, 10, 15]\n  DECLARE sum AS INTEGER\n  sum = 0\n  FOR i FROM 0 TO 2 DO\n    sum = sum + arr[i]\n  END FOR\n  PRINT sum\nEND', 'Success'));
            await setById('pseudopy_activity', 'act_sp_md2', act('act_sp_md2', 'Mikaella Daet', '2024-032', 'Prime Number Checker', 'moderate', 'Completed', '100%', '2025-08-06T11:30:00', null, '0.89s', 
                'BEGIN\n  INPUT n\n  DECLARE isPrime AS BOOLEAN\n  isPrime = TRUE\n  FOR i FROM 2 TO n-1 DO\n    IF n MOD i == 0 THEN\n      isPrime = FALSE\n    END IF\n  END FOR\n  PRINT isPrime\nEND', 'Success'));
            
            console.log('[Backend DB] Activities seeded.');
        }

        const exCount = await count('pseudopy_exercises');
        if (exCount === 0) {
            console.log('[Backend DB] Seeding sample exercises...');
            for (const ex of SEED_EXERCISES) {
                await setById('pseudopy_exercises', ex._docId || ex.id, ex);
            }

            // Seed dataset.json if present
            const datasetPath = path.join(__dirname, 'dataset.json');
            if (fs.existsSync(datasetPath)) {
                try {
                    const raw = fs.readFileSync(datasetPath, 'utf8');
                    const dataset = JSON.parse(raw);
                    const first30 = dataset.slice(0, 30);
                    for (const item of first30) {
                        await setById('pseudopy_exercises', item.id, { _docId: item.id, ...item });
                    }
                    console.log('[Backend DB] 30 exercises from dataset.json seeded.');
                } catch (e) {
                    console.warn('[Backend DB] Failed reading dataset.json:', e);
                }
            }
        }

    } catch (err) {
        console.error('[Backend DB] Seeding error:', err);
    }
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
