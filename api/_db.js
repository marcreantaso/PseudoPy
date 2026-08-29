// ============================================================
// VERCEL SERVERLESS — Shared In-Memory Store
// PseudoPy API Data Layer
// ============================================================

const FILIPINO_NAMES = [
    "John Cruz", "Maria Santos", "Kevin Ramos", "Anna Reyes", "Joshua Garcia",
    "Carlo Mendoza", "Patricia Flores", "Mark Bautista", "Nicole Dela Cruz", "Michael Reyes",
    "Christian Alde", "Jessica Pascual", "Aldrin Castro", "Kenneth Santos", "Jasmine Aquino",
    "Justin Ferrer", "Bianca De Leon", "Aaron Dizon", "Camille Valenzuela", "Dominic Ramos",
    "Ella Salvador", "Adrian Tolentino", "Sofia Corpuz", "Patrick Hernandez", "Hazel Gonzales",
    "Gabriel Santiago", "Abigail Ramos", "Ryan Ocampo", "Megan Custodio", "Kyle Dela Rosa"
];

const SEED_USERS_BASE = [
    { _docId: 'u1', id: 'u1', fullName: 'Mark Bautista', username: 'mbautista_admin', email: 'bautista@university.edu.ph', password: 'admin123', role: 'admin', status: 'active', createdAt: '2025-07-01T08:00:00.000Z' },
    { _docId: 'u2', id: 'u2', fullName: 'Marc Reantaso', username: 'mreantaso_instructor', email: 'reantaso@university.edu.ph', password: 'pass123', role: 'instructor', status: 'active', createdBy: 'u1', createdAt: '2025-08-10T14:15:00.000Z' },
    { _docId: 'u_stu_emirandilla', id: 'u_stu_emirandilla', studentId: '2024-031', fullName: 'Eduard John Mirandilla', username: 'emirandilla_student', email: 'mirandilla@gmail.com', password: 'pass123', role: 'student', status: 'active', instructorId: 'u2', createdBy: 'u2', section: 'BSCS-3A', createdAt: '2025-08-10T14:30:00.000Z' },
    { _docId: 'u_stu_mdaet', id: 'u_stu_mdaet', studentId: '2024-032', fullName: 'Mikaella Daet', username: 'mdaet_student', email: 'daet@gmail.com', password: 'pass123', role: 'student', status: 'active', instructorId: 'u2', createdBy: 'u2', section: 'BSCS-3A', createdAt: '2025-08-10T14:35:00.000Z' },
];

function buildSeedUsers() {
    const users = [...SEED_USERS_BASE];
    FILIPINO_NAMES.forEach((name, index) => {
        const idNum = String(index + 1).padStart(3, '0');
        const cleanName = name.toLowerCase().replace(/\s+/g, '');
        users.push({
            _docId: `u_stu_${index + 3}`, id: `u_stu_${index + 3}`,
            studentId: `2024-${idNum}`, fullName: name,
            username: `${cleanName}_student`,
            email: `${cleanName.split(' ')[0]}@student.edu.ph`,
            password: 'pass123', role: 'student', status: 'active',
            instructorId: 'u2', createdBy: 'u2',
            section: ['BSCS-3A', 'BSCS-3B', 'BSIT-3A', 'BSIT-3B'][index % 4]
        });
    });
    return users;
}

const SEED_EXERCISES = [
    { _docId: 'seed_easy_1', id: 'seed_easy_1', title: 'Multiply Array Elements', description: 'Multiply every element in an array by 4 and output the transformed list.', difficulty: 'easy', python_code: 'values = [8, 4, 1, 6, 4, 13, 6]\nfor i in range(len(values)):\n    values[i] = values[i] * 4\nprint(values)', createdAt: '2025-08-08' },
    { _docId: 'seed_medium_1', id: 'seed_medium_1', title: 'Sum Odd Numbers', description: 'Calculate the sum of odd numbers less than 100 and print the result.', difficulty: 'moderate', python_code: 'total = 0\ni = 1\nwhile i < 100:\n    total += i\n    i += 2\nprint(total)', createdAt: '2025-08-08' },
    { _docId: 'seed_medium_2', id: 'seed_medium_2', title: 'Count Multiples of 4 and 7', description: 'Count numbers between 1 and 20 that are multiples of 4 or 7.', difficulty: 'moderate', python_code: 'count = 0\nfor i in range(1, 21):\n    if i % 4 == 0 or i % 7 == 0:\n        count += 1\nprint(count)', createdAt: '2025-08-08' },
    { _docId: 'seed_hard_1', id: 'seed_hard_1', title: 'Factorial Computation', description: 'Compute the factorial of 6 using a loop and print the final result.', difficulty: 'hard', python_code: 'result = 1\nfor i in range(1, 7):\n    result *= i\nprint(result)', createdAt: '2025-08-08' }
];

function makeAct(id, student, studentId, exercise, difficulty, status, score, dateStr, errorType, processingTime, submittedCode, result) {
    const ts = new Date(dateStr).getTime();
    return {
        _docId: id, student, studentId, exercise,
        difficulty: difficulty || 'moderate', status, score,
        time: dateStr, timestamp: ts,
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

function buildSeedActivity() {
    const acts = [
        makeAct('act_sp_1', 'John Cruz', '2024-001', 'Sum of Even Numbers', 'moderate', 'Completed', '100%', '2025-08-08T10:15:00', null, '0.85s', 'BEGIN\n  PRINT "Hello"\nEND', 'Success'),
        makeAct('act_sp_2', 'Maria Santos', '2024-002', 'Factorial Calculation', 'hard', 'Completed', '85%', '2025-08-08T10:32:00', null, '1.21s', 'BEGIN\n  PRINT "Hello"\nEND', 'Success'),
        makeAct('act_sp_3', 'Kevin Ramos', '2024-003', 'Array Sum', 'easy', 'Failed', '0%', '2025-08-08T11:05:00', 'Syntax Error', '0.65s', 'BEGIN\n  PRINT "Hello"\nEND', 'Syntax Error'),
        makeAct('act_sp_4', 'Anna Reyes', '2024-004', 'Prime Number Checker', 'moderate', 'Pending', '-', '2025-08-08T11:20:00', null, '-', 'BEGIN\n  PRINT "Hello"\nEND', 'Pending'),
        makeAct('act_sp_5', 'Joshua Garcia', '2024-005', 'String Reversal', 'easy', 'Completed', '90%', '2025-08-08T11:45:00', null, '0.42s', 'BEGIN\n  PRINT "Hello"\nEND', 'Success'),
        makeAct('act_sp_em1', 'Eduard John Mirandilla', '2024-031', 'Sum of Even Numbers', 'moderate', 'Completed', '100%', '2025-08-08T14:20:00', null, '0.78s', 'BEGIN\n  PRINT "Hello"\nEND', 'Success'),
        makeAct('act_sp_em2', 'Eduard John Mirandilla', '2024-031', 'Factorial Calculation', 'hard', 'Completed', '95%', '2025-08-07T16:10:00', null, '1.10s', 'BEGIN\n  PRINT "Hello"\nEND', 'Success'),
        makeAct('act_sp_md1', 'Mikaella Daet', '2024-032', 'Array Sum', 'easy', 'Completed', '90%', '2025-08-08T15:00:00', null, '0.52s', 'BEGIN\n  PRINT "Hello"\nEND', 'Success'),
        makeAct('act_sp_md2', 'Mikaella Daet', '2024-032', 'Prime Number Checker', 'moderate', 'Completed', '100%', '2025-08-06T11:30:00', null, '0.89s', 'BEGIN\n  PRINT "Hello"\nEND', 'Success'),
    ];
    let s = 12345;
    const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280.0; };
    const week2 = [{day:4,count:4},{day:5,count:6},{day:6,count:8},{day:7,count:5},{day:8,count:5},{day:9,count:2},{day:10,count:3}];
    let idx = 6;
    week2.forEach(w => {
        for (let c = 0; c < w.count; c++) {
            const si = Math.floor(r() * 10);
            const ex = EXERCISES_POOL[Math.floor(r() * EXERCISES_POOL.length)];
            const h = 8 + Math.floor(r() * 9), m = Math.floor(r() * 60);
            const dateStr = `2025-08-${String(w.day).padStart(2,'0')}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
            const sr = r(); let status='Completed', score='85%', et=null, res='Success';
            if (sr < 0.65) { score = `${Math.floor(r()*21)+80}%`; }
            else if (sr < 0.85) { status='Failed'; score='0%'; et=ERROR_TYPES[Math.floor(r()*ERROR_TYPES.length)]; res=et; }
            else { status='Pending'; score='-'; res='Pending'; }
            acts.push(makeAct(`act_gen_${idx++}`, FILIPINO_NAMES[si], `2024-${String(si+1).padStart(3,'0')}`, ex.title, ex.difficulty, status, score, dateStr, et, status==='Pending'?'-':`${(r()*1.5+0.3).toFixed(2)}s`, `BEGIN\n  PRINT "Hello"\nEND`, res));
        }
    });
    while (acts.length < 100) {
        const si = Math.floor(r() * 30);
        const ex = EXERCISES_POOL[Math.floor(r() * EXERCISES_POOL.length)];
        const mo = [6,7,8][Math.floor(r()*3)], dy = Math.floor(r()*28)+1;
        const h = 8 + Math.floor(r()*10), m = Math.floor(r()*60);
        const dateStr = `2025-${String(mo).padStart(2,'0')}-${String(dy).padStart(2,'0')}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
        const sr = r(); let status='Completed', score='90%', et=null, res='Success';
        if (sr < 0.7) { score = `${Math.floor(r()*21)+80}%`; }
        else if (sr < 0.88) { status='Failed'; score='0%'; et=ERROR_TYPES[Math.floor(r()*ERROR_TYPES.length)]; res=et; }
        else { status='Pending'; score='-'; res='Pending'; }
        acts.push(makeAct(`act_gen_${idx++}`, FILIPINO_NAMES[si], `2024-${String(si+1).padStart(3,'0')}`, ex.title, ex.difficulty, status, score, dateStr, et, status==='Pending'?'-':`${(r()*1.5+0.3).toFixed(2)}s`, `BEGIN\n  PRINT "Hello"\nEND`, res));
    }
    return acts;
}

// Module-level store — persists for the lifetime of this serverless instance
const store = new Map();

function getCollection(name) {
    if (!store.has(name)) {
        const map = new Map();
        if (name === 'pseudopy_users') buildSeedUsers().forEach(u => map.set(u._docId, u));
        else if (name === 'pseudopy_exercises') SEED_EXERCISES.forEach(e => map.set(e._docId, e));
        else if (name === 'pseudopy_activity') buildSeedActivity().forEach(a => map.set(a._docId, a));
        store.set(name, map);
    }
    return store.get(name);
}

function sanitize(name) {
    if (!name || !/^[a-zA-Z0-9_]+$/.test(name)) throw new Error('Invalid collection name: ' + name);
    return name;
}

function storeGetAll(collection, limit, offset) {
    const col = sanitize(collection);
    const map = getCollection(col);
    let results = Array.from(map.values());
    if (col === 'pseudopy_exercises') {
        results.sort((a, b) => {
            const an = (a._docId||'').startsWith('ex'), bn = (b._docId||'').startsWith('ex');
            if (an && !bn) return -1; if (!an && bn) return 1;
            if (an && bn) return (b._docId||'').localeCompare(a._docId||'');
            return (parseInt((a._docId||'').replace('algo_',''))||0) - (parseInt((b._docId||'').replace('algo_',''))||0);
        });
    }
    if (col === 'pseudopy_activity') results.sort((a,b) => (b.timestamp||0)-(a.timestamp||0));
    if (col === 'pseudopy_auditLog') results.sort((a,b) => (b.timestamp||'').localeCompare(a.timestamp||''));
    if (col === 'pseudopy_notifications') results.sort((a,b) => new Date(b.createdAt||0)-new Date(a.createdAt||0));
    if (limit !== null && limit !== undefined && limit !== '') {
        const l = parseInt(limit, 10), o = parseInt(offset, 10) || 0;
        results = results.slice(o, o + l);
    }
    return results;
}

function storeGetById(collection, docId) {
    return getCollection(sanitize(collection)).get(docId) || null;
}

function storeSetById(collection, docId, data) {
    const doc = { ...data, _docId: docId };
    getCollection(sanitize(collection)).set(docId, doc);
    return doc;
}

function storeAdd(collection, data) {
    const docId = data._docId || ('doc_' + Date.now() + '_' + Math.floor(Math.random() * 1000));
    return storeSetById(collection, docId, data);
}

function storeUpdateById(collection, docId, updates) {
    const existing = storeGetById(collection, docId);
    return storeSetById(collection, docId, existing ? { ...existing, ...updates } : updates);
}

function storeDeleteById(collection, docId) {
    getCollection(sanitize(collection)).delete(docId);
    return { success: true };
}

function storeCount(collection) {
    return getCollection(sanitize(collection)).size;
}

module.exports = { storeGetAll, storeGetById, storeSetById, storeAdd, storeUpdateById, storeDeleteById, storeCount };
