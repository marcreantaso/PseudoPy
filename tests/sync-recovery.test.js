const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = name => fs.readFileSync(require('node:path').join(__dirname, '../src/database', name), 'utf8');
function harness(storage = new Map(), mode = 'denied', indexedDB) {
    let local = [];
    let denied = true;
    const calls = [], events = [], timers = [];
    const ctx = vm.createContext({
        console: { info() {}, warn() {} }, crypto, indexedDB, navigator: { onLine: true },
        localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v) },
        offlineStore: { isAvailable: () => false },
        getLocalCollection: () => local, setLocalCollection: (_, data) => { local = data; },
        firestoreReady: () => mode !== 'offline',
        firestore: { collection: ref => ({ doc: id => ({ set: async data => {
            calls.push({ ref, id, data, denied });
            if (mode === 'transient') throw Object.assign(new Error('unavailable'), {code:'unavailable'});
            if (denied && mode !== 'success') throw Object.assign(new Error('Missing or insufficient permissions'), { code: 'permission-denied' });
        } }) }) },
        withFirestoreTimeout: p => p,
        setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
        window: { dispatchEvent: e => events.push(e) },
        document: { readyState: 'loading', addEventListener() {} }
    });
    vm.runInContext((indexedDB ? read('idb-store.js') + '\n' : '') + read('mutation-queue.js') + '\n' + read('sync-manager.js') + '\n' + read('collections.js'), ctx);
    return { ctx, calls, events, timers, storage, local: () => local, allow: () => { denied = false; } };
}
test('denied write survives reload, retries once on explicit recovery and emits saved', async () => {
    const first = harness();
    await assert.rejects(first.ctx.queueFirestoreWrite({ operation: 'SET', ref: 'work', docId: 'a', payload: { value: 1 } }));
    assert.equal((await first.ctx.listAllMutations())[0]?.status, 'blocked-permission');
    for (let n=0; n<5; n++) await first.ctx.syncNow('visibility');
    assert.equal(first.calls.length, 1);
    const second = harness(first.storage); second.allow();
    await second.ctx.syncNow('startup'); await second.ctx.syncNow('online');
    assert.equal(second.calls.length, 1);
    assert.equal(second.calls[0].data.value, 1);
    assert.equal((await second.ctx.listAllMutations()).length, 0);
    assert.equal(second.events.filter(e => e.type === 'pseudopy:sync-saved').length, 1);
});
test('concurrent autosaves retain the latest value without duplicate queued records', async () => {
    const h = harness();
    await Promise.allSettled([1,2,3].map(value => h.ctx.queueFirestoreWrite({ operation:'SET', ref:'work', docId:'a', payload:{value} })));
    h.allow(); await h.ctx.syncNow('manual-retry');
    assert.equal(h.calls.filter(c => !c.denied).at(-1).data.value, 3);
    assert.equal((await h.ctx.listAllMutations()).length, 0);
});
test('permission-blocked records are protected from stale cloud snapshots', async () => {
    const h = harness();
    await assert.rejects(h.ctx.queueFirestoreWrite({operation:'UPDATE', ref:'work', docId:'a', payload:{value:9}}));
    const merged = await h.ctx.mergePendingMutationsOverSnapshot('work', [{_docId:'a',value:0,keep:true}]);
    assert.equal(merged[0].value, 9);
    assert.equal(merged[0].keep, true);
});

for (const mode of ['denied', 'offline', 'transient', 'success']) {
    for (const operation of ['dbAdd', 'dbSet', 'dbUpdate']) {
        test(`${operation}: ${mode} retains data and reports actual cloud persistence`, async () => {
            const h = harness(new Map(), mode);
            const args = operation === 'dbAdd' ? ['work', {_docId:'a',value:1}] : ['work','a',{value:1}];
            if(mode === 'success') await h.ctx[operation](...args);
            else await assert.rejects(h.ctx[operation](...args), e => e.localOnly === true);
            assert.equal(h.local()[0].value,1);
            const queue = await h.ctx.listAllMutations();
            assert.equal(queue.length, mode === 'success' ? 0 : 1);
            if(mode === 'denied') assert.equal(queue[0].status,'blocked-permission');
        });
    }
}

test('IndexedDB-backed denial survives a fresh application context and is delivered once', async () => {
    const idb = require('./helpers/fake-idb').createFakeIndexedDB();
    const h=harness(new Map(),'denied',idb);
    await assert.rejects(h.ctx.queueFirestoreWrite({operation:'SET',ref:'work',docId:'idb',payload:{value:42}}));
    assert.equal((await h.ctx.listAllMutations())[0].status,'blocked-permission');
    const reload=harness(new Map(),'success',idb);
    await reload.ctx.syncNow('startup');await reload.ctx.syncNow('manual-retry');
    assert.equal(reload.calls.length,1);assert.equal(reload.calls[0].data.value,42);
    assert.equal((await reload.ctx.listAllMutations()).length,0);
});
test('sign-in arriving during an in-flight denial gets one recovery attempt after it settles',async()=>{
    const h=harness();let release;let calls=0;
    h.ctx.firestore.collection=()=>({doc:()=>({set:async()=>{
        calls++;if(calls===1){await new Promise(resolve=>{release=resolve;});throw Object.assign(new Error('Denied'),{code:'permission-denied'});}
    }})});
    const first=h.ctx.queueFirestoreWrite({operation:'SET',ref:'work',docId:'race',payload:{value:1}}).catch(()=>{});
    while(!release)await new Promise(resolve=>setImmediate(resolve));
    const recovery=h.ctx.syncNow('sign-in');release();await first;await recovery;
    assert.equal(calls,2);assert.equal((await h.ctx.listAllMutations()).length,0);
});
test('a failed predecessor prevents a later operation on the same document overtaking it',async()=>{
    const h=harness();const order=[];let unavailable=true;
    h.ctx.firestore.collection=()=>({doc:()=>({delete:async()=>{order.push('DELETE');if(unavailable)throw Object.assign(new Error('unavailable'),{code:'unavailable'});},set:async()=>{order.push('UPDATE');}})});
    await h.ctx.enqueueMutation('DELETE','work','ordered',null);
    await h.ctx.enqueueMutation('UPDATE','work','ordered',{value:2});
    await h.ctx.syncNow('startup');assert.deepEqual(order,['DELETE']);
    unavailable=false;await h.ctx.syncNow('manual-retry');
    assert.deepEqual(order,['DELETE','DELETE','UPDATE']);assert.equal((await h.ctx.listAllMutations()).length,0);
});
