const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const agg = require(path.join(__dirname, '..', 'src', 'analytics', 'aggregation.js'));

const mk = (y, m, d, h = 12) => new Date(y, m - 1, d, h);

function rec(student, when, score, errorType) {
    const r = { student, username: student.toLowerCase().replace(/\s+/g, ''), _docId: 'x_' + student + '_' + when.getDate() };
    if (when) r.timestamp = when;
    if (score !== undefined) r.score = score;
    if (errorType !== undefined) r.errorType = errorType;
    if (student) r.studentId = 'S-' + student.split(' ')[0];
    return r;
}

test('recordDate normalizes timestamp or time, tolerating invalid values', () => {
    assert.ok(agg.recordDate({ timestamp: mk(2025, 8, 8, 10) }) instanceof Date);
    assert.ok(agg.recordDate({ time: '2025-08-08T12:00:00' }) instanceof Date);
    assert.equal(agg.recordDate({}), null);
    assert.equal(agg.recordDate({ timestamp: 'not-a-date' }), null);
});

test('scoreAsNumber parses percentages and treats placeholders as null', () => {
    assert.equal(agg.scoreAsNumber({ score: '100%' }), 100);
    assert.equal(agg.scoreAsNumber({ score: '85.5%' }), 86);
    assert.equal(agg.scoreAsNumber({ score: 0 }), 0);
    assert.equal(agg.scoreAsNumber({ score: '—' }), null);
    assert.equal(agg.scoreAsNumber({ score: 'Pending' }), null);
    assert.equal(agg.scoreAsNumber({}), null);
});

test('buildSubmissionSeries defaults to the last 7 days ending at the newest record', () => {
    const records = [
        rec('John', mk(2025, 8, 8, 9)),
        rec('John', mk(2025, 8, 8, 14)),
        rec('Maria', mk(2025, 8, 5, 10)),
        rec('Maria', mk(2025, 7, 30, 10))
    ];
    const series = agg.buildSubmissionSeries(records, { monthVal: '', weekVal: '', dateVal: '', viewMode: 'day' });
    assert.equal(series.length, 7);
    assert.equal(series[series.length - 1].dateKey, agg.dayKey(records[0].timestamp));
    assert.equal(series[series.length - 1].count, 2);
    assert.equal(series.find(b => b.dateKey == null), undefined, 'daily buckets always carry a dateKey');
});

test('buildSubmissionSeries honors week filters and highlights the active date', () => {
    const records = [
        rec('John', mk(2025, 8, 12, 9)),
        rec('John', mk(2025, 8, 15, 9)),
        rec('John', mk(2025, 8, 3, 9))
    ];
    const series = agg.buildSubmissionSeries(records, { monthVal: '7', weekVal: '3', dateVal: '', viewMode: 'day' });
    assert.equal(series.length, 7);
    // Week 3 = Aug 11–17; records on 12 and 15 must be counted.
    const counts = series.map(b => b.count).reduce((s, c) => s + c, 0);
    assert.equal(counts, 2);
    assert.equal(series[0].sub, 'Aug 11', 'week 3 starts on Aug 11');
});

test('buildSubmissionSeries month view produces five weekly buckets', () => {
    const records = [
        rec('John', mk(2025, 8, 1, 9)),
        rec('John', mk(2025, 8, 2, 9)),
        rec('John', mk(2025, 8, 6, 9)),
        rec('John', mk(2025, 8, 29, 9))
    ];
    const series = agg.buildSubmissionSeries(records, { monthVal: '7', weekVal: '', dateVal: '', viewMode: 'month' });
    assert.equal(series.length, 5);
    assert.deepEqual(series.map(b => b.label), ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'Wk 5']);
    assert.equal(series[0].count, 2);
    assert.equal(series[1].count, 1);
    assert.equal(series[4].count, 1);
    assert.equal(series[3].dateKey, null, 'weekly buckets carry no date key');
});

test('buildTrajectorySeries ranks by volume and trims to max sessions', () => {
    const records = [];
    for (let i = 1; i <= 10; i++) records.push(rec('John', mk(2025, 8, i, 9), (i * 10) + '%'));
    for (let i = 1; i <= 3; i++) records.push(rec('Maria', mk(2025, 8, i, 9), '90%'));
    const result = agg.buildTrajectorySeries(records, { maxStudents: 6, maxSessions: 8 });
    assert.equal(result.series[0].name, 'John');
    assert.equal(result.series[0].points.length, 8, 'trims to maxSessions');
    assert.equal(result.maxAttempts, 8);
    const john = result.series[0];
    assert.equal(john.points[0].y, 30, 'trims the oldest sessions away');
    assert.equal(john.points[john.points.length - 1].y, 100);
});

test('buildTrajectorySeries computes the class average from all students', () => {
    const records = [
        rec('John', mk(2025, 8, 1, 9), '100%'),
        rec('John', mk(2025, 8, 2, 9), '50%'),
        rec('Maria', mk(2025, 8, 1, 9), '0%'),
        rec('Maria', mk(2025, 8, 2, 9), '100%'),
        rec('Zoe', mk(2025, 8, 1, 9), 'Pending') // no numeric score on attempt 1
    ];
    const result = agg.buildTrajectorySeries(records, { maxStudents: 6, maxSessions: 8 });
    // Attempt 0: John 100 + Maria 0 = 50 (Zoe has a real attempt but no numeric score → null).
    assert.equal(result.classAverage[0].y, 50);
    // Attempt 1: John 50 + Maria 100 = 75.
    assert.equal(result.classAverage[1].y, 75);
    // Zoe has a dated attempt, so she is ranked, but only with a null gap point.
    const zoe = result.series.find(s => s.name === 'Zoe');
    assert.ok(zoe, 'Zoe has a dated attempt and is ranked');
    assert.equal(zoe.points[0].y, null, 'pending-only score is a gap, not a value');
});

test('buildTrajectorySeries leaves a null gap for placeholder scores', () => {
    const records = [
        rec('John', mk(2025, 8, 1, 9), '80%'),
        rec('John', mk(2025, 8, 2, 9), 'Pending'),
        rec('John', mk(2025, 8, 3, 9), '90%')
    ];
    const result = agg.buildTrajectorySeries(records);
    assert.equal(result.series[0].points[1].y, null, 'pending attempt breaks the line');
    assert.equal(result.series[0].points[2].y, 90);
});

test('buildErrorDistribution folds unknown types into Other and sums to 100%', () => {
    const records = [
        rec('John', mk(2025, 8, 1, 9), '0%', 'Syntax Error'),
        rec('John', mk(2025, 8, 2, 9), '0%', 'Syntax Error'),
        rec('Maria', mk(2025, 8, 1, 9), '0%', 'Logic Error'),
        rec('Maria', mk(2025, 8, 1, 9), '0%', 'Weird Runtime Crash'),
        rec('Zoe', mk(2025, 8, 1, 9), '0%') // no errorType
    ];
    const dist = agg.buildErrorDistribution(records);
    assert.equal(dist.total, 4);
    const syn = dist.categories.find(c => c.name === 'Syntax Error');
    const logi = dist.categories.find(c => c.name === 'Logic Error');
    const other = dist.categories.find(c => c.name === 'Other');
    assert.equal(syn.count, 2);
    assert.equal(syn.pct, 50);
    assert.equal(logi.count, 1);
    assert.equal(other.count, 1);
    assert.equal(dist.categories.reduce((s, c) => s + c.pct, 0), 100);
});

test('buildErrorDistribution is empty-safe', () => {
    assert.deepEqual(agg.buildErrorDistribution([]), { total: 0, categories: [] });
});