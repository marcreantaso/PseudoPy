const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('service worker bypasses backend and non-GET requests', () => {
    const source = read('sw.js');
    assert.match(source, /event\.request\.method !== 'GET'/);
    assert.match(source, /isBackendRequest\(event\.request\)/);
    assert.match(source, /firestore\.googleapis\.com/);
    assert.match(source, /new Response\('Offline'/);
});

test('application startup does not automatically seed production data', () => {
    const source = read('app.js');
    const initBody = source.slice(source.indexOf('async function init()'), source.indexOf('function updateClock'));
    assert.doesNotMatch(initBody, /seedDatabase\(/);
    assert.match(initBody, /await initDB\(\)/);
});

test('database writes fail closed outside explicit demo mode', () => {
    const source = read('database.js');
    assert.match(source, /window\.__PSEUDOPY_DEMO_MODE__ === true/);
    assert.match(source, /throw databaseUnavailableError\('creating'/);
    assert.match(source, /throw databaseUnavailableError\('saving'/);
    assert.match(source, /throw databaseUnavailableError\('updating'/);
    assert.match(source, /throw databaseUnavailableError\('deleting'/);
});

test('audit records use a canonical actor and target schema', () => {
    const source = read('app.js');
    assert.match(source, /actorId: resolvedActorId/);
    assert.match(source, /actorName: resolvedActorName/);
    assert.match(source, /actorUsername: resolvedUsername/);
    assert.match(source, /targetType:/);
    assert.match(source, /metadata: metadata \|\| \{\}/);
});



test('audit log rejects unidentified legacy rows and subscribes to live changes', () => {
    const database = read('database.js');
    const app = read('app.js');
    assert.match(database, /filter\(record => record\.action && record\.action !== 'unknown'/);
    assert.match(database, /collection\(ref\)\.onSnapshot/);
    assert.match(database, /function subscribeCollection\(ref, onChange, onError\)/);
    assert.match(app, /function startAuditLogRealtime\(\)/);
    assert.match(app, /subscribeCollection\(auditLogRef/);
    assert.match(app, /Never render incomplete legacy audit rows/);
});
