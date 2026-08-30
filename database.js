// ============================================================
// CENTRAL DATABASE CLIENT — PseudoPy
// Firebase Firestore + Resilient Local Fallback
// ============================================================

console.log('[Database] Initializing Central Database Client...');

function resolveFirebaseConfig() {
    const browserConfig = typeof window !== 'undefined' && window.__FIREBASE_CONFIG__ ? window.__FIREBASE_CONFIG__ : null;
    const defaultConfig = {
        apiKey: "AIzaSyAkm5sWvJpcF05QCDDSa8VcUIhh3L0c58U",
        authDomain: "pseudopy-e7e74.firebaseapp.com",
        projectId: "pseudopy-e7e74",
        storageBucket: "pseudopy-e7e74.firebasestorage.app",
        messagingSenderId: "442571972919",
        appId: "1:442571972919:web:53fc4b941b37c484247ab2",
        measurementId: "G-K0HKBVFEKD"
    };

    return browserConfig && browserConfig.projectId ? browserConfig : defaultConfig;
}

const firebaseConfig = resolveFirebaseConfig();

let firestore = null;
const hasFirebaseSDK = typeof firebase !== 'undefined' && firebase && typeof firebase.apps !== 'undefined';

try {
    if (hasFirebaseSDK) {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        firestore = firebase.firestore();
        console.log('[Database] Firebase Firestore connected ✅ Project:', firebaseConfig.projectId);
    } else if (typeof window !== 'undefined' && window.firebase) {
        window.firebase.initializeApp(firebaseConfig);
        firestore = window.firebase.firestore();
        console.log('[Database] Firebase Firestore connected ✅ Project:', firebaseConfig.projectId);
    } else {
        console.log('[Database] Firebase SDK not loaded yet — using local fallback data until Firestore is available.');
    }
} catch (e) {
    console.warn('[Database] Firebase init warning:', e);
}

const firestoreReady = () => !!(firestore && typeof firestore.collection === 'function');

// ── Collection References ──────────────────────────────────
const usersRef             = "pseudopy_users";
const exercisesRef         = "pseudopy_exercises";
const activityRef          = "pseudopy_activity";
const passwordRequestsRef  = "pseudopy_passwordRequests";
const auditLogRef          = "pseudopy_auditLog";
const notificationsRef     = "pseudopy_notifications";
const devicesRef           = "pseudopy_devices";

// ══════════════════════════════════════════════════════════════
//  PASSWORD HASHING — Web Crypto API (SHA-256 + Salt)
// ══════════════════════════════════════════════════════════════

function generateSalt() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(inputPassword, storedHash, storedSalt) {
    const computedHash = await hashPassword(inputPassword, storedSalt);
    return computedHash === storedHash;
}

// ══════════════════════════════════════════════════════════════
//  BUILT-IN SEED DATA (Guarantees immediate login access)
// ══════════════════════════════════════════════════════════════

const FILIPINO_NAMES = [
    "John Cruz", "Maria Santos", "Kevin Ramos", "Anna Reyes", "Joshua Garcia",
    "Carlo Mendoza", "Patricia Flores", "Mark Bautista", "Nicole Dela Cruz", "Michael Reyes",
    "Christian Alde", "Jessica Pascual", "Aldrin Castro", "Kenneth Santos", "Jasmine Aquino",
    "Justin Ferrer", "Bianca De Leon", "Aaron Dizon", "Camille Valenzuela", "Dominic Ramos",
    "Ella Salvador", "Adrian Tolentino", "Sofia Corpuz", "Patrick Hernandez", "Hazel Gonzales",
    "Gabriel Santiago", "Abigail Ramos", "Ryan Ocampo", "Megan Custodio", "Kyle Dela Rosa"
];

function getInitialSeedUsers() {
    const users = [
        { _docId: 'u1', id: 'u1', fullName: 'Mark Bautista', username: 'mbautista_admin', email: 'bautista@university.edu.ph', password: 'admin123', role: 'admin', status: 'active', createdAt: '2025-07-01T08:00:00.000Z' },
        { _docId: 'u2', id: 'u2', fullName: 'Marc Reantaso', username: 'mreantaso_instructor', email: 'reantaso@university.edu.ph', password: 'pass123', role: 'instructor', status: 'active', createdBy: 'u1', createdAt: '2025-08-10T14:15:00.000Z' },
        { _docId: 'u_inst_1787787083396', id: 'u_inst_1787787083396', fullName: 'john dave dela cruz', username: 'cruz_admin', email: 'delacruz@gmail.com', password: 'Admin123', role: 'instructor', status: 'active', createdAt: '2026-08-26T23:31:23.396Z', lastLogin: null, createdBy: 'u1' },
        { _docId: 'u_stu_emirandilla', id: 'u_stu_emirandilla', studentId: '2024-031', fullName: 'Eduard John Mirandilla', username: 'emirandilla_student', email: 'mirandilla@gmail.com', password: 'pass123', role: 'student', status: 'active', instructorId: 'u2', createdBy: 'u2', section: 'BSCS-3A', createdAt: '2025-08-10T14:30:00.000Z' },
        { _docId: 'u_stu_mdaet', id: 'u_stu_mdaet', studentId: '2024-032', fullName: 'Mikaella Daet', username: 'mdaet_student', email: 'daet@gmail.com', password: 'pass123', role: 'student', status: 'active', instructorId: 'u2', createdBy: 'u2', section: 'BSCS-3A', createdAt: '2025-08-10T14:35:00.000Z' },
    ];
    FILIPINO_NAMES.forEach((name, i) => {
        const clean = name.toLowerCase().replace(/\s+/g, '');
        users.push({
            _docId: `u_stu_${i + 3}`,
            id: `u_stu_${i + 3}`,
            studentId: `2024-${String(i + 1).padStart(3, '0')}`,
            fullName: name,
            username: `${clean}_student`,
            email: `${clean.split(' ')[0]}@student.edu.ph`,
            password: 'pass123',
            role: 'student',
            status: 'active',
            instructorId: 'u2',
            createdBy: 'u2',
            section: ['BSCS-3A', 'BSCS-3B', 'BSIT-3A', 'BSIT-3B'][i % 4]
        });
    });
    return users;
}

const SEED_EXERCISES_LIST = [
    {
        "_docId": "algo_1",
        "id": "algo_1",
        "title": "Sum of Odd Numbers Under 90",
        "concept": "While Loop Mathematical Series",
        "description": "Calculates the sum of odd numbers strictly less than 90.",
        "difficulty": "moderate",
        "pseudocode": "BEGIN\n  DECLARE maximum AS INTEGER\n  maximum = 0\n  DECLARE i AS INTEGER\n  i = 1\n  WHILE i < 90 DO\n    maximum = maximum + i\n    i = i + 2\n  ENDWHILE\n  PRINT maximum\nEND",
        "python_code": "maximum = 0\ni = 1\nwhile i < 90:\n    maximum = maximum + i\n    i = i + 2\nprint(maximum)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_2",
        "id": "algo_2",
        "title": "Count Multiples of 4 and 7 (Small Range)",
        "concept": "Modulo Branching Logic",
        "description": "Iterates to 16, identifying multiples of 4 and 7.",
        "difficulty": "moderate",
        "pseudocode": "BEGIN\n  DECLARE count AS INTEGER\n  count = 0\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO 16 DO\n    IF i MOD 4 == 0 THEN\n      count = count + 1\n    ELSE IF i MOD 7 == 0 THEN\n      count = count + 2\n    ELSE\n      count = count - 1\n    ENDIF\n  ENDFOR\n  PRINT count\nEND",
        "python_code": "count = 0\nfor i in range(1, 16 + 1):\n    if i % 4 == 0:\n        count = count + 1\n    elif i % 7 == 0:\n        count = count + 2\n    else:\n        count = count - 1\nprint(count)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_3",
        "id": "algo_3",
        "title": "Count Multiples of 4 and 7 (Wide Range)",
        "concept": "Modulo Branching Logic",
        "description": "Iterates to 45, identifying multiples of 4 and 7.",
        "difficulty": "moderate",
        "pseudocode": "BEGIN\n  DECLARE count AS INTEGER\n  count = 0\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO 45 DO\n    IF i MOD 4 == 0 THEN\n      count = count + 1\n    ELSE IF i MOD 7 == 0 THEN\n      count = count + 2\n    ELSE\n      count = count - 1\n    ENDIF\n  ENDFOR\n  PRINT count\nEND",
        "python_code": "count = 0\nfor i in range(1, 45 + 1):\n    if i % 4 == 0:\n        count = count + 1\n    elif i % 7 == 0:\n        count = count + 2\n    else:\n        count = count - 1\nprint(count)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_4",
        "id": "algo_4",
        "title": "Multiply Array Elements by 4",
        "concept": "In-Place Array Transformation",
        "description": "Multiplies every element in the array iteratively by 4.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE values AS ARRAY\n  values = [8, 4, 1, 6, 4, 13, 6]\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 6 DO\n    values[i] = values[i] * 4\n  ENDFOR\n  PRINT values\nEND",
        "python_code": "values = [8, 4, 1, 6, 4, 13, 6]\nfor i in range(0, 6 + 1):\n    values[i] = values[i] * 4\nprint(values)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_5",
        "id": "algo_5",
        "title": "Sum of Odd Numbers Under 95",
        "concept": "While Loop Mathematical Series",
        "description": "Calculates the sum of odd numbers strictly less than 95.",
        "difficulty": "moderate",
        "pseudocode": "BEGIN\n  DECLARE count AS INTEGER\n  count = 0\n  DECLARE i AS INTEGER\n  i = 1\n  WHILE i < 95 DO\n    count = count + i\n    i = i + 2\n  ENDWHILE\n  PRINT count\nEND",
        "python_code": "count = 0\ni = 1\nwhile i < 95:\n    count = count + i\n    i = i + 2\nprint(count)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_6",
        "id": "algo_6",
        "title": "Multiply Array Elements by 5",
        "concept": "In-Place Array Transformation",
        "description": "Multiplies every element in the array iteratively by 5.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE collection AS ARRAY\n  collection = [11, 19, 15, 12]\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 3 DO\n    collection[i] = collection[i] * 5\n  ENDFOR\n  PRINT collection\nEND",
        "python_code": "collection = [11, 19, 15, 12]\nfor i in range(0, 3 + 1):\n    collection[i] = collection[i] * 5\nprint(collection)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_7",
        "id": "algo_7",
        "title": "Factorial of 6 Computation",
        "concept": "Factorial Computation",
        "description": "Computes the factorial value iteratively up to 6.",
        "difficulty": "hard",
        "pseudocode": "BEGIN\n  DECLARE limit AS INTEGER\n  limit = 6\n  DECLARE factorial AS INTEGER\n  factorial = 1\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO limit DO\n    factorial = factorial * i\n  ENDFOR\n  PRINT factorial\nEND",
        "python_code": "limit = 6\nfactorial = 1\nfor i in range(1, limit + 1):\n    factorial = factorial * i\nprint(factorial)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_8",
        "id": "algo_8",
        "title": "Factorial of 8 Computation",
        "concept": "Factorial Computation",
        "description": "Computes the factorial value iteratively up to 6.",
        "difficulty": "hard",
        "pseudocode": "BEGIN\n  DECLARE limit AS INTEGER\n  limit = 6\n  DECLARE factorial AS INTEGER\n  factorial = 1\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO limit DO\n    factorial = factorial * i\n  ENDFOR\n  PRINT factorial\nEND",
        "python_code": "limit = 6\nfactorial = 1\nfor i in range(1, limit + 1):\n    factorial = factorial * i\nprint(factorial)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_9",
        "id": "algo_9",
        "title": "Sum of Odd Numbers Under 80",
        "concept": "While Loop Mathematical Series",
        "description": "Calculates the sum of odd numbers strictly less than 83.",
        "difficulty": "moderate",
        "pseudocode": "BEGIN\n  DECLARE target AS INTEGER\n  target = 0\n  DECLARE i AS INTEGER\n  i = 1\n  WHILE i < 83 DO\n    target = target + i\n    i = i + 2\n  ENDWHILE\n  PRINT target\nEND",
        "python_code": "target = 0\ni = 1\nwhile i < 83:\n    target = target + i\n    i = i + 2\nprint(target)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_10",
        "id": "algo_10",
        "title": "Multiply Array Elements by 3",
        "concept": "Array Filtering (Count)",
        "description": "Counts the number of elements in an array that are strictly greater than 67.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE values AS ARRAY\n  values = [1, 114, 145, 99, 105, 39, 136]\n  DECLARE threshold AS INTEGER\n  threshold = 67\n  DECLARE count AS INTEGER\n  count = 0\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 6 DO\n    IF values[i] > threshold THEN\n      count = count + 1\n    ENDIF\n  ENDFOR\n  PRINT count\nEND",
        "python_code": "values = [1, 114, 145, 99, 105, 39, 136]\nthreshold = 67\ncount = 0\nfor i in range(0, 6 + 1):\n    if values[i] > threshold:\n        count = count + 1\nprint(count)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_11",
        "id": "algo_11",
        "title": "Factorial of 5 Computation",
        "concept": "Factorial Computation",
        "description": "Computes the factorial value iteratively up to 9.",
        "difficulty": "hard",
        "pseudocode": "BEGIN\n  DECLARE limit AS INTEGER\n  limit = 9\n  DECLARE factorial AS INTEGER\n  factorial = 1\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO limit DO\n    factorial = factorial * i\n  ENDFOR\n  PRINT factorial\nEND",
        "python_code": "limit = 9\nfactorial = 1\nfor i in range(1, limit + 1):\n    factorial = factorial * i\nprint(factorial)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_12",
        "id": "algo_12",
        "title": "Sum of Odd Numbers Under 60",
        "concept": "Array Filtering (Count)",
        "description": "Counts the number of elements in an array that are strictly greater than 10.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE collection AS ARRAY\n  collection = [41, 99, 122, 48, 65, 26, 49, 116]\n  DECLARE threshold AS INTEGER\n  threshold = 10\n  DECLARE count AS INTEGER\n  count = 0\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 7 DO\n    IF collection[i] > threshold THEN\n      count = count + 1\n    ENDIF\n  ENDFOR\n  PRINT count\nEND",
        "python_code": "collection = [41, 99, 122, 48, 65, 26, 49, 116]\nthreshold = 10\ncount = 0\nfor i in range(0, 7 + 1):\n    if collection[i] > threshold:\n        count = count + 1\nprint(count)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_13",
        "id": "algo_13",
        "title": "Identify Multiples of 3 and 5",
        "concept": "Array Filtering (Count)",
        "description": "Counts the number of elements in an array that are strictly greater than 60.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE items AS ARRAY\n  items = [142, 132, 49, 117, 115, 110, 49, 138]\n  DECLARE threshold AS INTEGER\n  threshold = 60\n  DECLARE count AS INTEGER\n  count = 0\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 7 DO\n    IF items[i] > threshold THEN\n      count = count + 1\n    ENDIF\n  ENDFOR\n  PRINT count\nEND",
        "python_code": "items = [142, 132, 49, 117, 115, 110, 49, 138]\nthreshold = 60\ncount = 0\nfor i in range(0, 7 + 1):\n    if items[i] > threshold:\n        count = count + 1\nprint(count)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_14",
        "id": "algo_14",
        "title": "Multiply Array Elements by 6",
        "concept": "In-Place Array Transformation",
        "description": "Multiplies every element in the array iteratively by 3.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE items AS ARRAY\n  items = [8, 8, 7, 5, 5, 12]\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 5 DO\n    items[i] = items[i] * 3\n  ENDFOR\n  PRINT items\nEND",
        "python_code": "items = [8, 8, 7, 5, 5, 12]\nfor i in range(0, 5 + 1):\n    items[i] = items[i] * 3\nprint(items)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_15",
        "id": "algo_15",
        "title": "Factorial of 7 Computation",
        "concept": "Array Filtering (Count)",
        "description": "Counts the number of elements in an array that are strictly greater than 37.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE source AS ARRAY\n  source = [63, 71, 119, 44, 88, 37]\n  DECLARE threshold AS INTEGER\n  threshold = 37\n  DECLARE count AS INTEGER\n  count = 0\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 5 DO\n    IF source[i] > threshold THEN\n      count = count + 1\n    ENDIF\n  ENDFOR\n  PRINT count\nEND",
        "python_code": "source = [63, 71, 119, 44, 88, 37]\nthreshold = 37\ncount = 0\nfor i in range(0, 5 + 1):\n    if source[i] > threshold:\n        count = count + 1\nprint(count)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_16",
        "id": "algo_16",
        "title": "Sum of Odd Numbers Under 70",
        "concept": "Factorial Computation",
        "description": "Computes the factorial value iteratively up to 5.",
        "difficulty": "hard",
        "pseudocode": "BEGIN\n  DECLARE limit AS INTEGER\n  limit = 5\n  DECLARE factorial AS INTEGER\n  factorial = 1\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO limit DO\n    factorial = factorial * i\n  ENDFOR\n  PRINT factorial\nEND",
        "python_code": "limit = 5\nfactorial = 1\nfor i in range(1, limit + 1):\n    factorial = factorial * i\nprint(factorial)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_17",
        "id": "algo_17",
        "title": "Modulo Branching Logic (Range to 30)",
        "concept": "Modulo Branching Logic",
        "description": "Iterates to 21, identifying multiples of 2 and 7.",
        "difficulty": "moderate",
        "pseudocode": "BEGIN\n  DECLARE count AS INTEGER\n  count = 0\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO 21 DO\n    IF i MOD 2 == 0 THEN\n      count = count + 1\n    ELSE IF i MOD 7 == 0 THEN\n      count = count + 2\n    ELSE\n      count = count - 1\n    ENDIF\n  ENDFOR\n  PRINT count\nEND",
        "python_code": "count = 0\nfor i in range(1, 21 + 1):\n    if i % 2 == 0:\n        count = count + 1\n    elif i % 7 == 0:\n        count = count + 2\n    else:\n        count = count - 1\nprint(count)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_18",
        "id": "algo_18",
        "title": "Multiply Array Elements by 2",
        "concept": "While Loop Mathematical Series",
        "description": "Calculates the sum of odd numbers strictly less than 24.",
        "difficulty": "moderate",
        "pseudocode": "BEGIN\n  DECLARE val AS INTEGER\n  val = 0\n  DECLARE i AS INTEGER\n  i = 1\n  WHILE i < 24 DO\n    val = val + i\n    i = i + 2\n  ENDWHILE\n  PRINT val\nEND",
        "python_code": "val = 0\ni = 1\nwhile i < 24:\n    val = val + i\n    i = i + 2\nprint(val)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_19",
        "id": "algo_19",
        "title": "Factorial of 4 Computation",
        "concept": "Factorial Computation",
        "description": "Computes the factorial value iteratively up to 9.",
        "difficulty": "hard",
        "pseudocode": "BEGIN\n  DECLARE limit AS INTEGER\n  limit = 9\n  DECLARE factorial AS INTEGER\n  factorial = 1\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO limit DO\n    factorial = factorial * i\n  ENDFOR\n  PRINT factorial\nEND",
        "python_code": "limit = 9\nfactorial = 1\nfor i in range(1, limit + 1):\n    factorial = factorial * i\nprint(factorial)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_20",
        "id": "algo_20",
        "title": "Sum of Odd Numbers Under 50",
        "concept": "Modulo Branching Logic",
        "description": "Iterates to 49, identifying multiples of 4 and 6.",
        "difficulty": "moderate",
        "pseudocode": "BEGIN\n  DECLARE count AS INTEGER\n  count = 0\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO 49 DO\n    IF i MOD 4 == 0 THEN\n      count = count + 1\n    ELSE IF i MOD 6 == 0 THEN\n      count = count + 2\n    ELSE\n      count = count - 1\n    ENDIF\n  ENDFOR\n  PRINT count\nEND",
        "python_code": "count = 0\nfor i in range(1, 49 + 1):\n    if i % 4 == 0:\n        count = count + 1\n    elif i % 6 == 0:\n        count = count + 2\n    else:\n        count = count - 1\nprint(count)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_21",
        "id": "algo_21",
        "title": "Find Multiples of 4 and 6",
        "concept": "In-Place Array Transformation",
        "description": "Multiplies every element in the array iteratively by 3.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE collection AS ARRAY\n  collection = [3, 8, 2, 10, 3, 11, 9, 1]\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 7 DO\n    collection[i] = collection[i] * 3\n  ENDFOR\n  PRINT collection\nEND",
        "python_code": "collection = [3, 8, 2, 10, 3, 11, 9, 1]\nfor i in range(0, 7 + 1):\n    collection[i] = collection[i] * 3\nprint(collection)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_22",
        "id": "algo_22",
        "title": "Multiply Array Elements by 7",
        "concept": "Factorial Computation",
        "description": "Computes the factorial value iteratively up to 4.",
        "difficulty": "hard",
        "pseudocode": "BEGIN\n  DECLARE limit AS INTEGER\n  limit = 4\n  DECLARE factorial AS INTEGER\n  factorial = 1\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO limit DO\n    factorial = factorial * i\n  ENDFOR\n  PRINT factorial\nEND",
        "python_code": "limit = 4\nfactorial = 1\nfor i in range(1, limit + 1):\n    factorial = factorial * i\nprint(factorial)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_23",
        "id": "algo_23",
        "title": "Factorial of 9 Computation",
        "concept": "In-Place Array Transformation",
        "description": "Multiplies every element in the array iteratively by 5.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE list_vals AS ARRAY\n  list_vals = [2, 14, 20, 7, 7, 18]\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 5 DO\n    list_vals[i] = list_vals[i] * 5\n  ENDFOR\n  PRINT list_vals\nEND",
        "python_code": "list_vals = [2, 14, 20, 7, 7, 18]\nfor i in range(0, 5 + 1):\n    list_vals[i] = list_vals[i] * 5\nprint(list_vals)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_24",
        "id": "algo_24",
        "title": "Sum of Odd Numbers Under 40",
        "concept": "Array Filtering (Count)",
        "description": "Counts the number of elements in an array that are strictly greater than 34.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE items AS ARRAY\n  items = [115, 109, 138, 39, 121, 127, 146]\n  DECLARE threshold AS INTEGER\n  threshold = 34\n  DECLARE count AS INTEGER\n  count = 0\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 6 DO\n    IF items[i] > threshold THEN\n      count = count + 1\n    ENDIF\n  ENDFOR\n  PRINT count\nEND",
        "python_code": "items = [115, 109, 138, 39, 121, 127, 146]\nthreshold = 34\ncount = 0\nfor i in range(0, 6 + 1):\n    if items[i] > threshold:\n        count = count + 1\nprint(count)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_25",
        "id": "algo_25",
        "title": "Modulo Branching Logic (Range to 25)",
        "concept": "Modulo Branching Logic",
        "description": "Iterates to 45, identifying multiples of 2 and 6.",
        "difficulty": "moderate",
        "pseudocode": "BEGIN\n  DECLARE count AS INTEGER\n  count = 0\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO 45 DO\n    IF i MOD 2 == 0 THEN\n      count = count + 1\n    ELSE IF i MOD 6 == 0 THEN\n      count = count + 2\n    ELSE\n      count = count - 1\n    ENDIF\n  ENDFOR\n  PRINT count\nEND",
        "python_code": "count = 0\nfor i in range(1, 45 + 1):\n    if i % 2 == 0:\n        count = count + 1\n    elif i % 6 == 0:\n        count = count + 2\n    else:\n        count = count - 1\nprint(count)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_26",
        "id": "algo_26",
        "title": "Multiply Array Elements by 8",
        "concept": "While Loop Mathematical Series",
        "description": "Calculates the sum of odd numbers strictly less than 66.",
        "difficulty": "moderate",
        "pseudocode": "BEGIN\n  DECLARE maximum AS INTEGER\n  maximum = 0\n  DECLARE i AS INTEGER\n  i = 1\n  WHILE i < 66 DO\n    maximum = maximum + i\n    i = i + 2\n  ENDWHILE\n  PRINT maximum\nEND",
        "python_code": "maximum = 0\ni = 1\nwhile i < 66:\n    maximum = maximum + i\n    i = i + 2\nprint(maximum)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_27",
        "id": "algo_27",
        "title": "Factorial of 10 Computation",
        "concept": "In-Place Array Transformation",
        "description": "Multiplies every element in the array iteratively by 3.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE data AS ARRAY\n  data = [4, 6, 11, 8, 3, 20, 3, 16]\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 7 DO\n    data[i] = data[i] * 3\n  ENDFOR\n  PRINT data\nEND",
        "python_code": "data = [4, 6, 11, 8, 3, 20, 3, 16]\nfor i in range(0, 7 + 1):\n    data[i] = data[i] * 3\nprint(data)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_28",
        "id": "algo_28",
        "title": "Sum of Odd Numbers Under 30",
        "concept": "In-Place Array Transformation",
        "description": "Multiplies every element in the array iteratively by 5.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE data AS ARRAY\n  data = [1, 19, 12, 10, 13, 20, 18]\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 6 DO\n    data[i] = data[i] * 5\n  ENDFOR\n  PRINT data\nEND",
        "python_code": "data = [1, 19, 12, 10, 13, 20, 18]\nfor i in range(0, 6 + 1):\n    data[i] = data[i] * 5\nprint(data)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_29",
        "id": "algo_29",
        "title": "Modulo Branching Logic (Range to 50)",
        "concept": "In-Place Array Transformation",
        "description": "Multiplies every element in the array iteratively by 5.",
        "difficulty": "easy",
        "pseudocode": "BEGIN\n  DECLARE numbers AS ARRAY\n  numbers = [16, 7, 16, 9, 20, 12, 20]\n  DECLARE i AS INTEGER\n  FOR i FROM 0 TO 6 DO\n    numbers[i] = numbers[i] * 5\n  ENDFOR\n  PRINT numbers\nEND",
        "python_code": "numbers = [16, 7, 16, 9, 20, 12, 20]\nfor i in range(0, 6 + 1):\n    numbers[i] = numbers[i] * 5\nprint(numbers)",
        "createdAt": "2025-08-08"
    },
    {
        "_docId": "algo_30",
        "id": "algo_30",
        "title": "Multiply Array Elements by 9",
        "concept": "Factorial Computation",
        "description": "Computes the factorial value iteratively up to 5.",
        "difficulty": "hard",
        "pseudocode": "BEGIN\n  DECLARE limit AS INTEGER\n  limit = 5\n  DECLARE factorial AS INTEGER\n  factorial = 1\n  DECLARE i AS INTEGER\n  FOR i FROM 1 TO limit DO\n    factorial = factorial * i\n  ENDFOR\n  PRINT factorial\nEND",
        "python_code": "limit = 5\nfactorial = 1\nfor i in range(1, limit + 1):\n    factorial = factorial * i\nprint(factorial)",
        "createdAt": "2025-08-08"
    }
];

function makeSeedAct(id, student, studentId, exercise, difficulty, status, score, dateStr, errorType, procTime, instructorId = 'u2') {
    return {
        _docId: id, student, studentId, exercise,
        difficulty: difficulty || 'moderate', status, score,
        time: dateStr, timestamp: new Date(dateStr).getTime(),
        errorType: errorType || null,
        processingTime: procTime || '0.0s',
        instructorId: instructorId || 'u2',
        submittedCode: 'BEGIN\n  PRINT "Hello World"\nEND',
        pseudocode: 'BEGIN\n  PRINT "Hello World"\nEND',
        pythonCode: 'print("Hello World")',
        python_code: 'print("Hello World")',
        result: status === 'Completed' ? 'Success' : (status === 'Failed' ? (errorType || 'Syntax Error') : 'Pending'),
        output: status === 'Failed' ? `Error: ${errorType} during compilation` : 'Execution successful.\n'
    };
}

const SEED_ACTIVITY_LIST = [
    makeSeedAct('act_sp_1', 'John Cruz', '2024-001', 'Sum of Even Numbers', 'moderate', 'Completed', '100%', '2025-08-08T10:15:00', null, '0.85s', 'u2'),
    makeSeedAct('act_sp_2', 'Maria Santos', '2024-002', 'Factorial Calculation', 'hard', 'Completed', '85%', '2025-08-08T10:32:00', null, '1.21s', 'u2'),
    makeSeedAct('act_sp_3', 'Kevin Ramos', '2024-003', 'Array Sum', 'easy', 'Failed', '0%', '2025-08-08T11:05:00', 'Syntax Error', '0.65s', 'u2'),
    makeSeedAct('act_sp_4', 'Anna Reyes', '2024-004', 'Prime Number Checker', 'moderate', 'Pending', '—', '2025-08-08T11:20:00', null, '—', 'u2'),
    makeSeedAct('act_sp_5', 'Joshua Garcia', '2024-005', 'String Reversal', 'easy', 'Completed', '90%', '2025-08-08T11:45:00', null, '0.42s', 'u2'),
    makeSeedAct('act_sp_em1', 'Eduard John Mirandilla', '2024-031', 'Sum of Even Numbers', 'moderate', 'Completed', '100%', '2025-08-08T14:20:00', null, '0.78s', 'u2'),
    makeSeedAct('act_sp_em2', 'Eduard John Mirandilla', '2024-031', 'Factorial Calculation', 'hard', 'Completed', '95%', '2025-08-07T16:10:00', null, '1.10s', 'u2'),
    makeSeedAct('act_sp_md1', 'Mikaella Daet', '2024-032', 'Array Sum', 'easy', 'Completed', '90%', '2025-08-08T15:00:00', null, '0.52s', 'u2'),
    makeSeedAct('act_sp_md2', 'Mikaella Daet', '2024-032', 'Prime Number Checker', 'moderate', 'Completed', '100%', '2025-08-06T11:30:00', null, '0.89s', 'u2'),
];

// Local Storage Fallback Map
function getLocalCollection(ref) {
    try {
        const raw = localStorage.getItem(`pseudopy_local_${ref}`);
        if (raw) return JSON.parse(raw);
    } catch (e) {}
    
    if (ref === usersRef) return getInitialSeedUsers();
    if (ref === exercisesRef) return SEED_EXERCISES_LIST;
    if (ref === activityRef) return SEED_ACTIVITY_LIST;
    return [];
}

function setLocalCollection(ref, data) {
    try {
        localStorage.setItem(`pseudopy_local_${ref}`, JSON.stringify(data));
    } catch (e) {}
}

// ══════════════════════════════════════════════════════════════
//  CORE CRUD FUNCTIONS (Firestore + Local Sync)
// ══════════════════════════════════════════════════════════════

/**
 * Get all documents from a collection.
 */
async function dbGetAll(ref, limitCount = null, offsetCount = 0) {
    let results = [];

    // 1. Try Firestore when the SDK is ready and the current project is configured.
    if (firestoreReady()) {
        try {
            const snapshot = await firestore.collection(ref).get();
            if (snapshot && !snapshot.empty) {
                results = snapshot.docs.map(doc => ({ _docId: doc.id, ...doc.data() }));
                setLocalCollection(ref, results);
            }
        } catch (err) {
            console.warn(`[Database] Firestore fetch error on ${ref}, using local fallback:`, err.message);
        }
    }

    // 2. Fallback to Local/Seed data if empty.
    if (!results || results.length === 0) {
        results = getLocalCollection(ref);
        // If Firestore is connected, seed it in the background.
        if (firestoreReady() && results.length > 0) {
            seedDatabase().catch(e => console.warn('[Database] Background seed attempt:', e));
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
            const doc = await firestore.collection(ref).doc(docId).get();
            if (doc.exists) {
                return { _docId: doc.id, ...doc.data() };
            }
        } catch (err) {
            console.warn(`[Database] Firestore get error on ${ref}/${docId}:`, err.message);
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
            await firestore.collection(ref).doc(docId).set(docData);
        } catch (err) {
            console.error(`[Database] Error saving to Firestore ${ref}:`, err);
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
            await firestore.collection(ref).doc(docId).set(docData);
        } catch (err) {
            console.error(`[Database] Error setting to Firestore ${ref}/${docId}:`, err);
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
            await docRef.set(merged, { merge: true });
        } catch (err) {
            console.error(`[Database] Error updating Firestore ${ref}/${docId}:`, err);
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
            const doc = await firestore.collection(ref).doc(docId).get();
            if (doc.exists) {
                console.warn(`[Database] Delete blocked for ${ref}/${docId}: persisted Firestore data is protected.`);
            }
        } catch (err) {
            console.warn(`[Database] Delete check error for ${ref}/${docId}:`, err.message);
        }
    }

    if (!exists) {
        return { success: false, deleted: false, message: 'Nothing to delete.' };
    }

    return { success: false, deleted: false, message: 'Deletion is disabled to protect persisted Firestore data.' };
}

/**
 * Count documents.
 */
async function dbCount(ref) {
    if (firestoreReady()) {
        try {
            const snapshot = await firestore.collection(ref).get();
            if (snapshot) return snapshot.size;
        } catch (err) {}
    }
    return getLocalCollection(ref).length;
}

// ══════════════════════════════════════════════════════════════
//  AUTOMATIC SEEDING LOGIC
// ══════════════════════════════════════════════════════════════

async function batchSeed(collectionName, items) {
    if (!firestore) return;
    const batch = firestore.batch();
    items.forEach(item => {
        const ref = firestore.collection(collectionName).doc(item._docId || item.id);
        batch.set(ref, item);
    });
    await batch.commit();
}

async function seedDatabase() {
    try {
        if (!firestore) return true;
        
        console.log('[Database] Checking Firestore collections...');
        const userSnap = await firestore.collection(usersRef).get();
        if (userSnap.empty) {
            console.log('[Database] Seeding initial users into Firestore...');
            await batchSeed(usersRef, getInitialSeedUsers());
            console.log('[Database] Users seeded ✅');
        }

        const exSnap = await firestore.collection(exercisesRef).get();
        if (exSnap.size < 30) {
            console.log('[Database] Seeding initial exercises into Firestore...');
            await batchSeed(exercisesRef, SEED_EXERCISES_LIST);
            console.log('[Database] Exercises seeded ✅');
        }

        const actSnap = await firestore.collection(activityRef).get();
        if (actSnap.empty) {
            console.log('[Database] Seeding sample activity into Firestore...');
            await batchSeed(activityRef, SEED_ACTIVITY_LIST);
            console.log('[Database] Activity seeded ✅');
        }
    } catch (err) {
        console.warn('[Database] Seeding notice (local fallback active):', err.message);
    }
    return true;
}

// ══════════════════════════════════════════════════════════════
//  APP-LEVEL HELPERS & INTERFACE
// ══════════════════════════════════════════════════════════════

async function initDB() {
    return true;
}

async function refreshPasswordHistory() {
    return await dbGetAll(passwordRequestsRef);
}

async function refreshAuditLog() {
    return await dbGetAll(auditLogRef);
}

function normalizeUsername(username) {
    if (!username) return '';
    const u = username.trim();
    if (u === 'admin') return 'mbautista_admin';
    if (u === 'emirandila_student') return 'emirandilla_student';
    if (u === 'mdaet_stude') return 'mdaet_student';
    return u;
}

// Ensure all seed exercises have instructor and creator assigned
SEED_EXERCISES_LIST.forEach(e => {
    if (!e.createdBy) e.createdBy = 'u2';
    if (!e.instructorId) e.instructorId = 'u2';
    if (!e.difficulty) e.difficulty = 'moderate';
});

class Database {
    constructor() { this.ready = true; }
    async getUsers() { return await dbGetAll(usersRef); }
    async getUserByUsername(username) {
        const users = await dbGetAll(usersRef);
        const norm = normalizeUsername(username);
        return users.find(u => u.username === norm || u.username === username) || null;
    }
    async addUser(user) { return await dbAdd(usersRef, user); }
    async updateUser(userId, updates) { return await dbUpdate(usersRef, userId, updates); }
    async deleteUser(userId) { return await dbDelete(usersRef, userId); }
    async getExercises() { return await dbGetAll(exercisesRef); }
    async getExerciseById(id) { return await dbGet(exercisesRef, id); }
    async addExercise(exercise) { return await dbAdd(exercisesRef, exercise); }
    async updateExercise(exerciseId, updates) { return await dbUpdate(exercisesRef, exerciseId, updates); }
    async deleteExercise(exerciseId) { return await dbDelete(exercisesRef, exerciseId); }
    async getSubmissions() { return await dbGetAll(activityRef); }
    async addSubmission(submission) { return await dbAdd(activityRef, submission); }
    async getPasswordChangeHistory() { return await dbGetAll(passwordRequestsRef); }
    async addPasswordChangeRequest(request) { return await dbAdd(passwordRequestsRef, request); }
}

const db = new Database();

console.log('[Database] PseudoPy Central Database client ready ✅');
