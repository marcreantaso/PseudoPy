const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const aggregation = require('../src/analytics/aggregation');
const geometry = require('../src/analytics/geometry');

function harness() {
    const subscriptions = [];
    const context = vm.createContext({
        currentUser: { id: 'teacher', role: 'instructor' }, currentPage: 'analytics',
        cachedActivity: [], cachedUsers: [], activityRef: 'activity', usersRef: 'users',
        document: { addEventListener() {} }, console,
        $id: () => null, setText() {}, animateAnalyticsCards() {},
        subscribeCollection(ref, changed) {
            const entry = { ref, changed, stopped: false };
            subscriptions.push(entry);
            return () => { entry.stopped = true; };
        },
        ...aggregation
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/app/analytics.js'), 'utf8'), context);
    return { context, subscriptions, rows: () => vm.runInContext('currentFilteredActivity', context) };
}

test('empty instructors never receive global activity or fabricated seeds', () => {
    const h = harness();
    h.context.cachedActivity = [{ instructorId: 'someone-else', student: 'Alex' }];
    h.context.rebuildAnalyticsScope();
    h.context.applyAnalyticsFilters();
    assert.equal(h.rows().length, 0);
});

test('explicit ownership wins over matching names and legacy student aliases', () => {
    const h = harness();
    h.context.cachedUsers = [{ id: 's', role: 'student', instructorId: 'teacher', studentNumber: '2300001', fullName: 'Alex' }];
    h.context.cachedActivity = [
        { instructorId: 'other', studentId: 's', student: 'Alex' },
        { studentId: '2300001' }, { studentAccountId: 's' },
        { instructorId: 'teacher' }, { studentId: 'unrelated', student: 'Alex' }
    ];
    h.context.rebuildAnalyticsScope();
    assert.equal(h.rows().length, 3);
});

test('realtime subscriptions are single-instance and unsubscribe on exit', () => {
    const h = harness();
    h.context.startAnalyticsRealtime();
    h.context.startAnalyticsRealtime();
    assert.equal(h.subscriptions.length, 2);
    h.subscriptions[0].changed([{ instructorId: 'teacher' }]);
    assert.equal(h.rows().length, 1);
    h.context.stopAnalyticsRealtime();
    assert.ok(h.subscriptions.every(s => s.stopped));
    h.context.currentUser = null;
    h.subscriptions[0].changed([{ instructorId: 'teacher' }, { instructorId: 'teacher' }]);
    assert.equal(h.rows().length, 1, 'late callbacks cannot update another session');
});

test('invalid dates are ignored and Firestore timestamps are supported', () => {
    assert.equal(aggregation.recordDate({ timestamp: { seconds: 1 } }).getTime(), 1000);
    assert.equal(aggregation.recordDate({ timestamp: { toDate: () => new Date(1000) } }).getTime(), 1000);
    const series = aggregation.buildSubmissionSeries([{ time: 'bad' }, { time: '2026-02-28T12:00:00' }], { monthVal: '1', weekVal: '5' });
    assert.equal(series.length, 4);
    assert.equal(series.reduce((sum, b) => sum + b.count, 0), 1);
});

test('a single error category draws a complete ring with four arcs', () => {
    const ring = geometry.arcPath(120, 120, 96, 58, -Math.PI / 2, 3 * Math.PI / 2);
    assert.equal((ring.match(/ A /g) || []).length, 4);
    assert.ok(!/NaN|Infinity/.test(ring));
});
