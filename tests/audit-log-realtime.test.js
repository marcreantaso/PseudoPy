const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('audit data rejects unidentified legacy rows', () => {
  const source = read('database.js');
  assert.match(source, /record\.action !== 'unknown'/);
  assert.match(source, /record\.actorId && record\.actorName/);
});

test('audit page subscribes to Firestore snapshots and detaches on navigation', () => {
  const database = read('database.js');
  const app = read('app.js');
  assert.match(database, /collection\(ref\)\.onSnapshot/);
  assert.match(database, /function subscribeCollection\(ref, onChange, onError\)/);
  assert.match(app, /subscribeCollection\(auditLogRef/);
  assert.match(app, /stopAuditLogRealtime\(\)/);
});
