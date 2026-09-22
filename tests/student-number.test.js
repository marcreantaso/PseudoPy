const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const mod = require(path.join(__dirname, '..', 'src', 'database', 'student-number.js'));

const {
    isValidStudentNumber,
    formatStudentNumber,
    readStudentNumber,
    allocateStudentNumber
} = mod;

test('isValidStudentNumber accepts 230-series numbers only', () => {
    assert.equal(isValidStudentNumber('2300001'), true);
    assert.equal(isValidStudentNumber('2302510'), true);
    assert.equal(isValidStudentNumber('2309999'), true);
    assert.equal(isValidStudentNumber('23000000'), false);
    assert.equal(isValidStudentNumber('23025'), false);
    assert.equal(isValidStudentNumber('1234567'), false);
    assert.equal(isValidStudentNumber('2024-001'), false);
    assert.equal(isValidStudentNumber(null), false);
    assert.equal(isValidStudentNumber(''), false);
});

test('formatStudentNumber zero-pads the sequence to 4 digits', () => {
    assert.equal(formatStudentNumber(1), '2300001');
    assert.equal(formatStudentNumber(42), '2300042');
    assert.equal(formatStudentNumber(2510), '2302510');
    assert.equal(formatStudentNumber(9999), '2309999');
});

test('formatStudentNumber rejects invalid and exhausted ranges', () => {
    assert.throws(() => formatStudentNumber(0), /Invalid student number sequence/);
    assert.throws(() => formatStudentNumber(-5), /Invalid student number sequence/);
    assert.throws(() => formatStudentNumber('abc'), /Invalid student number sequence/);
    assert.throws(() => formatStudentNumber(10000), /Student number range exhausted \(2309999\)/);
});

test('readStudentNumber prefers studentNumber, then studentId, then em dash', () => {
    assert.equal(readStudentNumber({ studentNumber: '2302510', studentId: '2024-001' }), '2302510');
    assert.equal(readStudentNumber({ studentId: '2024-001' }), '2024-001');
    assert.equal(readStudentNumber({ studentNumber: 'nope', studentId: '' }), '\u2014');
    assert.equal(readStudentNumber({}), '\u2014');
    assert.equal(readStudentNumber(null), '\u2014');
});

test('allocateStudentNumber falls back to a deterministic local sequence', async () => {
    const store = {};
    global.usersRef = 'pseudopy_users';
    global.getLocalCollection = () => [
        { id: 'x1', studentNumber: '2302510' },
        { id: 'x2' }
    ];
    global.firestoreReady = () => false;
    global.localStorage = {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); }
    };
    try {
        const first = await allocateStudentNumber();
        const second = await allocateStudentNumber();
        assert.equal(first, '2302511');
        assert.equal(second, '2302512');
    } finally {
        delete global.usersRef;
        delete global.getLocalCollection;
        delete global.firestoreReady;
        delete global.localStorage;
    }
});