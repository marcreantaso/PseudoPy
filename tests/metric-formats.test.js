const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { formatPercent, formatDuration, formatMetricValue, masteryInfo } = require(
    path.join(__dirname, '..', 'src', 'app', 'metric-formats.js')
);

const EM_DASH = '\u2014';

test('formatPercent renders 0-100 values with a % suffix', () => {
    assert.equal(formatPercent(87.5), '87.5%');
    assert.equal(formatPercent(100), '100%');
    assert.equal(formatPercent(0), '0%');
    assert.equal(formatPercent(83.3333), '83.3%');
});

test('formatPercent fromRatio converts 0-1 fractions', () => {
    assert.equal(formatPercent(0.45, { fromRatio: true }), '45%');
    assert.equal(formatPercent(1, { fromRatio: true }), '100%');
});

test('formatPercent renders an em dash for missing or invalid values', () => {
    assert.equal(formatPercent(null), EM_DASH);
    assert.equal(formatPercent(undefined), EM_DASH);
    assert.equal(formatPercent(NaN), EM_DASH);
    assert.equal(formatPercent(Infinity), EM_DASH);
});

test('formatDuration switches to seconds at 1s and renders ms otherwise', () => {
    assert.equal(formatDuration(12.7), '12.7 ms');
    assert.equal(formatDuration(999), '999 ms');
    assert.equal(formatDuration(1240), '1.2 s');
    assert.equal(formatDuration(60000), '60 s');
    assert.equal(formatDuration(null), EM_DASH);
});

test('formatMetricValue renders counts and an em dash for no data', () => {
    assert.equal(formatMetricValue(42), '42');
    assert.equal(formatMetricValue(0.5), '0.5');
    assert.equal(formatMetricValue(null), EM_DASH);
    assert.equal(formatMetricValue(NaN), EM_DASH);
});

test('masteryInfo maps accuracy to the shared ladder', () => {
    assert.equal(masteryInfo(80).label, 'Expert');
    assert.equal(masteryInfo(65).label, 'Proficient');
    assert.equal(masteryInfo(40).label, 'Developing');
    assert.equal(masteryInfo(39.9).label, 'Beginner');
    assert.equal(masteryInfo(0).label, 'Beginner');
    assert.equal(masteryInfo(null).label, 'Beginner');
    assert.equal(masteryInfo(90).color, 'var(--icon-success)');
});