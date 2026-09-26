const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
    SystemAnalyticsTime,
    systemRecordTime,
    systemFilterByRange,
    systemComputeOverview,
    systemBuildActivitySeries
} = require(path.join(root, 'src', 'app', 'admin-analytics.js'));

const now = Date.now();
const DAY = 864e5;
const NOW = now;
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

function seedRecord(id, fields) {
    return {
        _docId: id,
        status: 'Pending',
        score: '100%',
        errorType: null,
        ...fields
    };
}

test('record time resolves from timestamp number or time string', () => {
    assert.strictEqual(systemRecordTime({ timestamp: 123456 }), 123456);
    assert.strictEqual(systemRecordTime({ time: '2025-08-08T10:15:00' }), Date.parse('2025-08-08T10:15:00'));
    assert.strictEqual(systemRecordTime({ time: 'not-a-date' }), null);
    assert.strictEqual(systemRecordTime(null), null);
    assert.strictEqual(systemRecordTime({}), null);
});

test('all-time range keeps every record; day ranges apply a cutoff', () => {
    const records = [
        seedRecord('old', { pseudocode: 'x', timestamp: now - 20 * DAY }),
        seedRecord('recent', { pseudocode: 'x', timestamp: now - 2 * DAY }),
        seedRecord('stringy', { pseudocode: 'x', time: new Date(now - 3 * DAY).toISOString() }),
        seedRecord('no-date', { pseudocode: 'x', timestamp: null })
    ];
    assert.strictEqual(systemFilterByRange(records, 'all').length, 4);
    assert.strictEqual(systemFilterByRange(records, '7d').length, 2);
    assert.strictEqual(systemFilterByRange(records, '30d').length, 3);
    assert.strictEqual(systemFilterByRange(records, '90d').length, 3);
    assert.strictEqual(systemFilterByRange(null, 'all').length, 0);
});

test('overview computes translations, executions, errors and distinct students/exercises', () => {
    const records = [
        seedRecord('a', { studentAccountId: 's1', exercise: 'Loop', pseudocode: 'a', python_code: 'py', errorType: 'Syntax Error', result: 'Error' }),
        seedRecord('b', { studentId: 's1', student: 'Student One', exercise: 'Loop', pseudocode: 'b', python_code: 'py', status: 'Failed', errorType: 'Missing END' }),
        seedRecord('c', { studentId: 's2', exercise: 'Sum', pseudocode: 'c', status: 'Completed' }),
        seedRecord('d', { studentAccountId: 's3', exercise: 'Sum', pseudocode: 'd', python_code: 'py', errorType: 'Logic Error' }),
        seedRecord('e', { pseudocode: '', python_code: 'py', status: 'Completed' })
    ];
    const overview = systemComputeOverview(records);
    assert.strictEqual(overview.totalRecords, 5);
    assert.strictEqual(overview.totalTranslations, 4);
    assert.strictEqual(overview.totalExecutions, 5);
    assert.strictEqual(overview.errorCount, 3);
    assert.strictEqual(overview.compilationSuccessRate, 25.0);
    assert.strictEqual(overview.activeStudents, 3);
    assert.strictEqual(overview.uniqueExercises, 2);

    const empty = systemComputeOverview([]);
    assert.strictEqual(empty.totalTranslations, 0);
    assert.strictEqual(empty.compilationSuccessRate, null, 'no translations means an em-dash source, never fake 100%');
    assert.strictEqual(empty.activeStudents, 0);
});

test('activity series buckets a single 7-day window with correct counts and labels', () => {
    const records = [
        seedRecord('t2', { pseudocode: 'x', timestamp: now }),
        seedRecord('e2', { python_code: 'py', status: 'Completed', timestamp: NOW + 1 }),
        seedRecord('t7', { pseudocode: 'x', status: 'Completed', timestamp: TODAY.getTime() - 6 * DAY + 1 }),
        seedRecord('out', { pseudocode: 'x', timestamp: now - 8 * DAY })
    ];
    const series = systemBuildActivitySeries(records, '7d');
    assert.strictEqual(series.length, 7);
    const totalTranslations = series.reduce((sum, b) => sum + b.translations, 0);
    const totalExecutions = series.reduce((sum, b) => sum + b.executions, 0);
    assert.strictEqual(totalTranslations, 2, 'buckets cover exactly 7 days');
    assert.strictEqual(totalExecutions, 2);
    for (const bucket of series) {
        assert.match(bucket.label, /^\d{1,2}\/\d{1,2}$/);
        assert.ok(bucket.key.length > 0);
    }
    assert.strictEqual(systemBuildActivitySeries([], '30d').length, 30);
    assert.strictEqual(systemBuildActivitySeries([], 'all').length, 30, 'all-time falls back to 30 daily buckets');
});

test('recent activity falls inside the current day bucket', () => {
    const series = systemBuildActivitySeries([seedRecord('now', { pseudocode: 'x', timestamp: now })], '24h');
    assert.strictEqual(series.length, 1);
    assert.strictEqual(series[0].translations, 1);
});

test('time ranges, page routing and realtime guards are wired in constants + navigation', () => {
    const ranges = new Set(Object.keys(SystemAnalyticsTime.RANGES));
    assert.deepEqual([...ranges].sort(), ['24h', '30d', '7d', '90d', 'all']);

    const constants = fs.readFileSync(path.join(root, 'src/app/constants.js'), 'utf8');
    assert.ok(constants.includes("admin: ['manage-users', 'system-analytics', 'password-requests', 'admin-execute', 'developer-options']"));
    assert.ok(constants.includes("'system-analytics': 'System Analytics'"));

    const nav = fs.readFileSync(path.join(root, 'src/app/navigation.js'), 'utf8');
    assert.ok(nav.includes("pageId === 'system-analytics'"), 'system-analytics loader wired into navigation');
    assert.ok(nav.includes('stopSystemAnalyticsRealtime'), 'realtime cleanup wired into navigation');

    const bundles = JSON.parse(fs.readFileSync(path.join(root, 'src/bundles.json'), 'utf8'));
    assert.ok(bundles['app.js'].includes('src/app/admin-analytics.js'));
    const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.ok(index.includes('id="page-system-analytics"'));
    assert.ok(index.includes("onclick=\"navigateTo('system-analytics')\""));
    assert.ok(index.includes('adv-total-translations'));
    assert.ok(index.includes('system-activity-svg'));
    assert.ok(index.includes('system-errors-svg'));
});