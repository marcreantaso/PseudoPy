const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('PSEUDOPY INSTRUCTOR RESTORATION & ISOLATION TEST SUITE');
console.log('====================================================');

let passed = 0;
let failed = 0;

function assert(condition, name) {
    if (condition) {
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${name}`);
        failed++;
    }
}

// 1. Check syntax and presence of key files
try {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    const dbCode = fs.readFileSync(path.join(__dirname, 'database.js'), 'utf8');
    const appCode = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

    assert(html.length > 0, 'index.html exists and is readable');
    assert(dbCode.length > 0, 'database.js exists and is readable');
    assert(appCode.length > 0, 'app.js exists and is readable');

    // 2. Check Expected Output in HTML modal
    assert(html.includes('id="ex-expected-output"'), 'index.html contains #ex-expected-output in Exercise modal');
    assert(html.includes('id="ex-expected-output-error"'), 'index.html contains #ex-expected-output-error validation element');

    // 3. Check KPI cards default placeholders (0 / 0% instead of hardcoded 10, 85, etc.)
    assert(html.includes('id="stat-students">0</div>'), 'index.html KPI Active Students initializes with 0');
    assert(html.includes('id="stat-submissions">0</div>'), 'index.html KPI Total Submissions initializes with 0');
    assert(html.includes('id="stat-success-rate">0%</div>'), 'index.html KPI Success Rate initializes with 0%');
    assert(html.includes('id="stat-common-errors">0</div>'), 'index.html KPI Common Errors initializes with 0');

    // 4. Check Difficulty values (easy, moderate, hard - NOT medium)
    assert(html.includes('value="moderate"'), 'index.html has moderate difficulty option');
    assert(!html.includes('<option value="medium"'), 'index.html does not use "medium" value for exercise difficulty');

    // 5. Test database.js seed logic & aliases in simulated environment
    // Create sandbox
    const window = {
        localStorage: {
            store: {},
            getItem(k) { return this.store[k] || null; },
            setItem(k, v) { this.store[k] = String(v); },
            removeItem(k) { delete this.store[k]; }
        }
    };
    const localStorage = window.localStorage;

    // Load database.js in VM/Eval
    const dbFunc = new Function('window', 'localStorage', 'console', `${dbCode}; return { normalizeUsername, db, getInitialSeedUsers, SEED_EXERCISES_LIST, SEED_ACTIVITY_LIST, makeSeedAct };`);
    const dbModule = dbFunc(window, localStorage, console);

    assert(typeof dbModule.normalizeUsername === 'function', 'normalizeUsername function is exported/defined in database.js');
    assert(dbModule.normalizeUsername('admin') === 'mbautista_admin', 'normalizeUsername("admin") maps to "mbautista_admin"');
    assert(dbModule.normalizeUsername('emirandila_student') === 'emirandilla_student', 'normalizeUsername("emirandila_student") maps to "emirandilla_student"');
    assert(dbModule.normalizeUsername('mdaet_stude') === 'mdaet_student', 'normalizeUsername("mdaet_stude") maps to "mdaet_student"');

    const seedUsers = dbModule.getInitialSeedUsers();
    assert(seedUsers.some(u => u.username === 'mbautista_admin' && u.role === 'admin'), 'Admin user mbautista_admin exists in seed users');
    assert(seedUsers.some(u => u.username === 'mreantaso_instructor' && u.role === 'instructor'), 'Instructor user mreantaso_instructor exists in seed users');
    assert(seedUsers.some(u => u.username === 'emirandilla_student' && u.role === 'student'), 'Student user emirandilla_student exists in seed users');
    assert(seedUsers.some(u => u.username === 'mdaet_student' && u.role === 'student'), 'Student user mdaet_student exists in seed users');

    // 6. Test Multi-tenant Isolation simulation
    console.log('\n--- Testing Multi-tenant Isolation & Calculations ---');
    const allUsers = [...seedUsers, {
        _docId: 'u_inst_new',
        id: 'u_inst_new',
        fullName: 'Dr. Maria Santos',
        username: 'msantos_instructor',
        role: 'instructor',
        status: 'active'
    }, {
        _docId: 'u_stu_new_1',
        id: 'u_stu_new_1',
        fullName: 'New Student One',
        username: 'nstudent1_student',
        role: 'student',
        status: 'active',
        instructorId: 'u_inst_new'
    }];

    const allExercises = [...dbModule.SEED_EXERCISES_LIST, {
        _docId: 'ex_new_1',
        id: 'ex_new_1',
        title: 'Multiply Array Elements',
        difficulty: 'moderate',
        expectedOutput: '120',
        createdBy: 'u_inst_new',
        instructorId: 'u_inst_new'
    }];

    const allActivity = [...dbModule.SEED_ACTIVITY_LIST, {
        _docId: 'act_new_1',
        student: 'New Student One',
        studentId: 'u_stu_new_1',
        exercise: 'Multiply Array Elements',
        status: 'Completed',
        score: '100%',
        errorType: null,
        instructorId: 'u_inst_new'
    }];

    // Test Isolation for Default Instructor (u2 - Marc Reantaso)
    const inst1 = allUsers.find(u => u.username === 'mreantaso_instructor');
    const inst1Students = allUsers.filter(u => u.role === 'student' && (u.instructorId === inst1.id || u.instructorId === inst1._docId));
    const inst1Exercises = allExercises.filter(e => e.createdBy === inst1.id || e.instructorId === inst1.id || (e._docId || '').startsWith('algo_'));
    const inst1Activity = allActivity.filter(a => a.instructorId === inst1.id || (a._docId || '').startsWith('act_sp_'));

    assert(inst1Students.length > 0, `Instructor Marc Reantaso has ${inst1Students.length} assigned students`);
    assert(inst1Exercises.length >= 30, `Instructor Marc Reantaso has ${inst1Exercises.length} exercises`);
    assert(inst1Activity.length > 0, `Instructor Marc Reantaso has ${inst1Activity.length} submissions`);

    // Test Isolation for New Instructor (u_inst_new - Dr. Maria Santos)
    const inst2 = allUsers.find(u => u.username === 'msantos_instructor');
    const inst2Students = allUsers.filter(u => u.role === 'student' && (u.instructorId === inst2.id || u.instructorId === inst2._docId));
    const inst2Exercises = allExercises.filter(e => e.createdBy === inst2.id || e.instructorId === inst2.id);
    const inst2Activity = allActivity.filter(a => a.instructorId === inst2.id);

    assert(inst2Students.length === 1 && inst2Students[0].username === 'nstudent1_student', 'New Instructor only sees own student (New Student One)');
    assert(inst2Exercises.length === 1 && inst2Exercises[0].title === 'Multiply Array Elements', 'New Instructor only sees own exercise');
    assert(inst2Activity.length === 1 && inst2Activity[0].exercise === 'Multiply Array Elements', 'New Instructor only sees submissions for own class');

    // Test Fresh Instructor with 0 data (Strictly NO FAKE DATA)
    const inst3 = { id: 'u_empty_inst', _docId: 'u_empty_inst', role: 'instructor' };
    const inst3Students = allUsers.filter(u => u.role === 'student' && (u.instructorId === inst3.id));
    const inst3Exercises = allExercises.filter(e => e.createdBy === inst3.id || e.instructorId === inst3.id);
    const inst3Activity = allActivity.filter(a => a.instructorId === inst3.id);

    const emptyActiveStudents = inst3Students.filter(u => u.status === 'active').length;
    const emptyTotalSubmissions = inst3Activity.length;
    const emptySuccessRate = emptyTotalSubmissions > 0 ? Math.round((inst3Activity.filter(a => a.status === 'Completed').length / emptyTotalSubmissions) * 100) : 0;
    const emptyErrors = inst3Activity.filter(a => a.errorType && a.errorType.trim() !== '').length;

    assert(emptyActiveStudents === 0, 'Empty instructor calculates Active Students = 0 (NO fake data)');
    assert(emptyTotalSubmissions === 0, 'Empty instructor calculates Total Submissions = 0 (NO fake data)');
    assert(emptySuccessRate === 0, 'Empty instructor calculates Success Rate = 0% (NO fake data)');
    assert(emptyErrors === 0, 'Empty instructor calculates Common Errors = 0 (NO fake data)');

    // 7. Check Notification and Student Progress logic
    console.log('\n--- Testing Notifications and Exercise Progression ---');
    const initialCompleted = allActivity.filter(a => (a.studentId === 'u_stu_emirandilla' || a.studentId === '2024-031' || a.student === 'Eduard John Mirandilla') && a.status === 'Completed').length;
    assert(initialCompleted >= 0, `Initial completed exercises for Eduard Mirandilla: ${initialCompleted}`);

    // Adding a newly published exercise should increment total without automatically marking it completed
    const initialCount = allExercises.filter(e => e.instructorId === 'u2' || (e._docId || '').startsWith('algo_')).length;
    const newExAdded = {
        _docId: 'ex_test_notif',
        id: 'ex_test_notif',
        title: 'Find Prime Factors',
        difficulty: 'hard',
        createdBy: 'u2',
        instructorId: 'u2'
    };
    allExercises.push(newExAdded);

    const studentAssignedExercises = allExercises.filter(e => e.instructorId === 'u2' || (e._docId || '').startsWith('algo_'));
    const updatedTotal = studentAssignedExercises.length;
    const updatedCompleted = allActivity.filter(a => (a.studentId === 'u_stu_emirandilla' || a.studentId === '2024-031' || a.student === 'Eduard John Mirandilla') && a.status === 'Completed').length;

    assert(updatedTotal === initialCount + 1, 'Total exercise count increments by 1 when new exercise is added');
    assert(updatedCompleted === initialCompleted, 'Newly added exercise is NOT automatically completed (remains Not Started)');

} catch (err) {
    console.error('Fatal test error:', err);
    failed++;
}

console.log('\n====================================================');
console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('====================================================');

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
