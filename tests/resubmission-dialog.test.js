const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('resubmission uses a native PseudoPy dialog instead of browser prompt', () => {
  const app = read('app.js');
  const index = read('index.html');
  const style = read('style.css');
  assert.doesNotMatch(app.slice(app.indexOf('function requestResubmission'), app.indexOf('function closeSubmissionDetail')), /window\\.prompt/);
  assert.match(app, /function closeResubmissionRequest/);
  assert.match(app, /async function confirmResubmissionRequest/);
  assert.match(index, /id="resubmission-request-modal"/);
  assert.match(index, /id="resubmission-feedback"/);
  assert.match(style, /\.resubmission-dialog/);
});
