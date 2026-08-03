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

function runTests() {
  testAppJsPasses();
  testViolationDetection();
  console.log('All verification tests passed.');
}

runTests();
