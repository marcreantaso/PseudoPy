const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('exercise creation protects long Firestore writes from inactivity logout', () => {
  const source = read('app.js');
  assert.match(source, /const TIMEOUT_MS\s+=\s+15 \* 60 \* 1000/);
  assert.match(source, /'input', 'beforeinput', 'change', 'focusin', 'submit'/);
  assert.match(source, /SessionTimeout\.pause\(\);/);
  assert.match(source, /SessionTimeout\.resume\(\);/);
});

test('instructor review can request a linked student resubmission', () => {
  const app = read('app.js');
  const index = read('index.html');
  assert.match(app, /async function requestResubmission/);
  assert.match(app, /status: 'Revision Requested'/);
  assert.match(app, /type: 'resubmission_requested'/);
  assert.match(app, /revisionOf: exerciseState\.resubmissionOf/);
  assert.match(app, /studentAccountId/);
  assert.match(index, /id="sdm-request-resubmit"/);
});
