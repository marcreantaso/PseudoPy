const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { verifyAppJs } = require('./verify_app_refactor');

const appPath = path.resolve(__dirname, 'app.js');
const tempPath = path.resolve(__dirname, 'verify_app_refactor.temp.js');

function testAppJsPasses() {
  const result = verifyAppJs(appPath);
  assert.strictEqual(result.status, 'PASS', `Expected PASS for app.js, got ${JSON.stringify(result, null, 2)}`);
  console.log('✅ app.js verification passed.');
}

function testViolationDetection() {
  const tempCode = `function $id(id) { return document.getElementById(id); }
function $qs(selector) { return document.querySelector(selector); }
function $qsa(selector) { return Array.from(document.querySelectorAll(selector)); }
function bad() { document.getElementById('x'); document.querySelector('.foo'); }
`;
  fs.writeFileSync(tempPath, tempCode, 'utf8');

  try {
    const result = verifyAppJs(tempPath);
    assert.strictEqual(result.status, 'FAIL', 'Expected FAIL for synthetically invalid refactor file.');
    assert.ok(Array.isArray(result.violations) && result.violations.length >= 2, `Expected at least 2 violations, got ${JSON.stringify(result.violations, null, 2)}`);
    console.log('✅ Violation detection passed.');
  } finally {
    fs.unlinkSync(tempPath);
  }
}

function testDeleteDoesNotRemovePersistedData() {
  const window = {
    localStorage: {
      store: {},
      getItem(k) { return this.store[k] || null; },
      setItem(k, v) { this.store[k] = String(v); },
      removeItem(k) { delete this.store[k]; }
    }
  };

  const localStorage = window.localStorage;
  const dbCode = fs.readFileSync(path.resolve(__dirname, 'database.js'), 'utf8');
  const dbFunc = new Function('window', 'localStorage', 'console', `${dbCode}; return { dbDelete, dbSet, getLocalCollection, usersRef };`);
  const dbModule = dbFunc(window, localStorage, console);

  const ref = dbModule.usersRef;
  const record = { _docId: 'u_temp_no_delete', id: 'u_temp_no_delete', username: 'no_delete_student', role: 'student', status: 'active' };

  dbModule.dbSet(ref, record._docId, record);
  const beforeList = dbModule.getLocalCollection(ref);
  const beforeExists = beforeList.some(item => item._docId === record._docId);
  const result = dbModule.dbDelete(ref, record._docId);
  const afterList = dbModule.getLocalCollection(ref);
  const afterExists = afterList.some(item => item._docId === record._docId);

  assert.strictEqual(beforeExists, true, 'Record should be persisted before any delete attempt.');
  assert.strictEqual(result.success, false, 'Delete requests must be blocked so persisted data stays safe.');
  assert.strictEqual(afterExists, true, 'Delete requests must not remove persisted Firestore-backed data.');
  console.log('✅ Delete protection passed.');
}

function runTests() {
  testAppJsPasses();
  testViolationDetection();
  testDeleteDoesNotRemovePersistedData();
  console.log('All verification tests passed.');
}

runTests();
