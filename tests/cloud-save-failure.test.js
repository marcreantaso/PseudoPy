const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

for (const mode of ['denied', 'offline', 'transient', 'success']) {
    for (const operation of ['dbAdd', 'dbSet', 'dbUpdate']) {
        test(`${operation}: ${mode} reports actual cloud persistence`, async () => {
            let local = [];
            const queued = [];
            const context = vm.createContext({
                console: { info() {}, warn() {} },
                getLocalCollection: () => local,
                setLocalCollection: (_, data) => { local = data; },
                firestoreReady: () => mode !== 'offline',
                withFirestoreTimeout: promise => promise,
                classifyDbError: error => ({ transient: error.code === 'unavailable', message: error.message }),
                enqueueMutation: async (...args) => queued.push(args),
                firestore: { collection: () => ({ doc: () => ({ set: async () => {
                    if (mode === 'transient') throw Object.assign(new Error('Offline'), { code: 'unavailable' });
                    if (mode === 'denied') throw Object.assign(new Error('Denied'), { code: 'permission-denied' });
                } }) }) }
            });
            vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/database/collections.js'), 'utf8'), context);
            const args = operation === 'dbAdd' ? ['records', { _docId: 'a', value: 1 }] : ['records', 'a', { value: 1 }];
            if (mode === 'success') await context[operation](...args);
            else await assert.rejects(context[operation](...args), error => error.localOnly === true);
            assert.equal(local[0].value, 1, 'local draft is retained');
            assert.equal(queued.length, mode === 'offline' || mode === 'transient' ? 1 : 0);
        });
    }
}
