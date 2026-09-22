const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r/g, '');
const seedSrc = read('src/database/seed-data.js');
const indexHtml = read('index.html');

const pattern = /^230\d{4}$/;

test('all demo seed students carry a valid canonical 230 number', () => {
    const context = vm.createContext({
        window: {},
        getDefaultAdminProfile: () => ({}),
        SEED_ACTIVITY_LIST: [],
        console
    });
    // seed-data.js needs a few browser-side helpers; only getInitialSeedUsers matters.
    vm.runInContext(
        seedSrc.slice(seedSrc.indexOf('const FILIPINO_NAMES'), seedSrc.indexOf('const SEED_EXERCISES_LIST')),
        context
    );
    const users = context.getInitialSeedUsers();
    const students = users.filter(u => u.role === 'student');
    assert.ok(students.length >= 32, 'at least 32 demo students');
    for (const s of students) {
        assert.match(s.studentNumber, pattern, `${s.fullName} has 230-number`);
    }
    const numbers = students.map(s => s.studentNumber);
    assert.strictEqual(new Set(numbers).size, numbers.length, 'seed numbers unique');
    assert.strictEqual(numbers[0], '2300001');
    assert.strictEqual(numbers[1], '2300002');
});

test('student list header reads Student Number and rows render readStudentNumber', () => {
    // Header on the Instructor student page.
    assert.match(indexHtml, /<th scope="col">Student Number<\/th>/);
    // loadStudents template uses the canonical read helper.
    const usersSrc = read('src/app/users.js');
    assert.match(usersSrc, /readStudentNumber\(u\)/);
});

test('server seed mirrors the 230-series student numbers', () => {
    const { buildSeedUsers } = require(path.join(root, 'server', 'seed-data.js'));
    const students = buildSeedUsers().filter(u => u.role === 'student');
    for (const s of students) {
        assert.match(s.studentNumber, pattern, `${s.fullName} has 230-number`);
    }
    assert.strictEqual(new Set(students.map(s => s.studentNumber)).size, students.length, 'server seed numbers unique');
});