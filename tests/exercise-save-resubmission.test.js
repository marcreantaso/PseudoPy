const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('automatic inactivity sign-out has been completely removed', () => {
  const app = read('app.js');
  const index = read('index.html');
  assert.doesNotMatch(app, /SessionTimeout/);
  assert.doesNotMatch(app, /session-timeout-overlay/);
  assert.doesNotMatch(app, /handleLogout\('inactivity'\)/);
  assert.doesNotMatch(index, /session-timeout-overlay/);
  assert.doesNotMatch(index, /sto-stay-btn/);
  assert.doesNotMatch(app, /sto-ring-progress/);
});

test('instructor review can request a linked student resubmission', () => {
  const app = read('app.js');
  const index = read('index.html');
  assert.match(app, /function requestResubmission/);
  assert.match(app, /status: 'Revision Requested'/);
  assert.match(app, /type: 'resubmission_requested'/);
  assert.match(app, /revisionOf: exerciseState\.resubmissionOf/);
  assert.match(app, /studentAccountId/);
  assert.match(index, /id="sdm-request-resubmit"/);
});
