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

test('database writes propagate failed saves without local success fallback', async () => {
    const vm = require('node:vm');
    const context = vm.createContext({fetch:async()=>({ok:false,status:503,json:async()=>({error:'Unavailable'})}),console});
    vm.runInContext(read('database.js'),context);
    await assert.rejects(context.dbSet('pseudopy_activity','a',{output:'hello'}),/Unavailable/);
    await assert.rejects(context.dbDelete('pseudopy_activity','a'),/Unavailable/);
});

test('audit records use a canonical actor and target schema', () => {
    const source = read('app.js');
    assert.match(source, /actorId: resolvedActorId/);
    assert.match(source, /actorName: resolvedActorName/);
    assert.match(source, /actorUsername: resolvedUsername/);
    assert.match(source, /targetType:/);
    assert.match(source, /metadata: metadata \|\| \{\}/);
});

