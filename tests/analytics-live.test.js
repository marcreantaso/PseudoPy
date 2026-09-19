const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

test('an empty server activity snapshot clears stale local rows without adding demo records', async () => {
    const source = fs.readFileSync(require.resolve('../database.js'), 'utf8');
    const start = source.indexOf('async function dbGetAll(');
    const end = source.indexOf('async function dbGet(', start);
    let stored;
    const context = vm.createContext({
        firestoreReady: () => true,
        firestore: { collection: () => ({ get: async () => ({ docs: [] }) }) },
        withFirestoreTimeout: promise => promise,
        setLocalCollection: (ref, rows) => { stored = rows; },
        getLocalCollection: () => { throw new Error('Must not restore stale data'); },
        usersRef: 'users', console
    });
    vm.runInContext(source.slice(start, end), context);
    assert.equal((await context.dbGetAll('activity')).length, 0);
    assert.equal(stored.length, 0);
});

function setup() {
    const timers = new Map(), listeners = new Map(), subscriptions = new Map();
    let timerId = 0, stopped = 0;
    const renders = [], statuses = [];
    const saved = { activity: [{ id: 'saved' }], users: [] };
    const events = {
        addEventListener: (type, fn) => listeners.set(type, fn),
        removeEventListener: type => listeners.delete(type)
    };
    const context = vm.createContext({
        setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
        clearTimeout: id => timers.delete(id)
    });
    vm.runInContext(fs.readFileSync(require.resolve('../analytics-live.js'), 'utf8'), context);
    const stop = context.createAnalyticsFeed({
        refs: ['activity', 'users'], events,
        read: ref => saved[ref],
        listen: (ref, next, error) => { subscriptions.set(ref, { next, error }); return () => stopped++; },
        render: records => renders.push(JSON.parse(JSON.stringify(records))),
        status: (message, live) => statuses.push(live)
    });
    const flush = () => { const tasks = [...timers.values()]; timers.clear(); tasks.forEach(fn => fn()); };
    return { saved, stop, flush, subscriptions, renders, statuses, listeners, stopped: () => stopped };
}

test('server snapshots replace saved rows, including empty collections, and batch updates', () => {
    const h = setup();
    assert.equal(h.statuses.at(-1), false);
    h.subscriptions.get('activity').next([], false);
    h.subscriptions.get('users').next([{ id: 'u1' }], false);
    h.flush();
    assert.deepEqual(h.renders.at(-1).activity, []);
    assert.equal(h.statuses.at(-1), true);
    assert.equal(h.renders.length, 2);
});

test('cached snapshots, errors and offline events never claim live status', () => {
    const h = setup();
    h.subscriptions.get('activity').next([], false);
    h.subscriptions.get('users').next([], true);
    h.flush();
    assert.equal(h.statuses.at(-1), false);
    h.subscriptions.get('users').next([], false);
    h.flush();
    assert.equal(h.statuses.at(-1), true);
    h.listeners.get('offline')(); h.flush();
    assert.equal(h.statuses.at(-1), false);
    h.subscriptions.get('activity').error(new Error('unavailable')); h.flush();
    assert.equal(h.statuses.at(-1), false);
});

test('local changes update data and leaving the page disposes subscriptions and queued work', () => {
    const h = setup();
    h.saved.activity = [{ id: 'new' }];
    h.listeners.get('pseudopy:collection-change')({ detail: { ref: 'activity' } }); h.flush();
    assert.equal(h.renders.at(-1).activity[0].id, 'new');
    h.subscriptions.get('activity').next([{ id: 'pending' }], false);
    const count = h.renders.length;
    h.stop(); h.flush();
    h.subscriptions.get('activity').next([], false); h.flush();
    assert.equal(h.renders.length, count);
    assert.equal(h.stopped(), 2);
    assert.equal(h.listeners.size, 0);
});
