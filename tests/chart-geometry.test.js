const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const geo = require(path.join(__dirname, '..', 'src', 'analytics', 'geometry.js'));

test('linearScale maps domain onto range linearly', () => {
    const f = geo.linearScale([0, 10], [20, 40]);
    assert.equal(f(0), 20);
    assert.equal(f(10), 40);
    assert.equal(f(5), 30);
});

test('linearScale guards zero-width domains', () => {
    const f = geo.linearScale([5, 5], [0, 100]);
    assert.equal(f(5), 0, 'collapsed domain maps the point to the range start');
});

test('niceCeil follows the tidy-axis rule', () => {
    assert.equal(geo.niceCeil(0), 0);
    assert.equal(geo.niceCeil(3), 6);
    assert.equal(geo.niceCeil(8), 12);
    assert.equal(geo.niceCeil(23), Math.ceil(23 * 1.2));
});

test('smoothPath handles 0, 1 and 2+ points', () => {
    const x = v => v * 10, y = v => 100 - v;
    assert.equal(geo.smoothPath([], x, y), '');
    assert.match(geo.smoothPath([{ x: 1, y: 1 }], x, y), /^M \d+(\.\d+)? \d+(\.\d+)?$/);
    const two = geo.smoothPath([{ x: 0, y: 0 }, { x: 1, y: 1 }], x, y);
    assert.ok(two.startsWith('M '), 'starts with a moveto');
    assert.match(two, / C /, 'emits a cubic Bézier segment');
});

test('areaPath closes down to the baseline and back to the first point', () => {
    const x = v => v * 10, y = v => 100 - v;
    const p = geo.areaPath([{ x: 0, y: 40 }, { x: 1, y: 30 }, { x: 2, y: 60 }], x, y, 200);
    assert.ok(p.startsWith('M '), 'starts with moveto');
    assert.ok(p.includes(' L '), 'has at least one line command');
    assert.ok(p.endsWith(' Z'), 'closed path');
    const lineCount = (p.match(/ L /g) || []).length;
    assert.equal(lineCount, 2, 'down to baseline then back to first x');
});

test('arcPath draws a full circle from four quadrants (donut sectors)', () => {
    // Two half-circle slices must tile a complete ring.
    const slices = [
        geo.arcPath(100, 100, 80, 40, -Math.PI / 2, Math.PI / 2),
        geo.arcPath(100, 100, 80, 40, Math.PI / 2, (3 * Math.PI) / 2)
    ];
    slices.forEach(slice => {
        assert.ok(slice.startsWith('M '));
        assert.ok(slice.includes(' A '), 'outer arc present');
        assert.ok(slice.includes(' L '), 'connects outer to inner');
        assert.ok(slice.endsWith('Z'), 'renders a closed slice');
    });
    // A 220° slice must use the large-arc flag.
    const big = geo.arcPath(100, 100, 80, 40, -Math.PI / 2, -Math.PI / 2 + (220 * Math.PI) / 180);
    const outerArc = big.match(/ A ([\d.]+) ([\d.]+) 0 (\d) 1 /);
    assert.equal(outerArc[3], '1', 'slice >180° uses large-arc flag');
});

test('sliceCentroid stays within the donut ring at the mid angle', () => {
    const c = geo.sliceCentroid(100, 100, 80, 40, -Math.PI / 2, 0);
    const dist = Math.hypot(c.x - 100, c.y - 100);
    assert.ok(dist >= 40 && dist <= 80, `mid angle keeps ${dist} inside the ring`);
});

test('polarPoint places a point at the given angle/radius', () => {
    const p = geo.polarPoint(100, 100, 50, 0);
    assert.ok(Math.abs(p.x - 150) < 1e-9, 'angle 0 → +x');
    assert.ok(Math.abs(p.y - 100) < 1e-9, 'angle 0 → same y');
});

test('chartLayout picks the tall bin below the deadband and wide above it', () => {
    assert.deepEqual(geo.chartLayout(340, 'tall'), { bin: 'tall', h: 470 });
    assert.deepEqual(geo.chartLayout(460, 'tall'), { bin: 'tall', h: 470 });
    assert.deepEqual(geo.chartLayout(520, 'tall'), { bin: 'wide', h: 320 });
    assert.deepEqual(geo.chartLayout(869, 'wide'), { bin: 'wide', h: 320 });
});

test('chartLayout deadband keeps the previous bin so widths near 480 cannot flap', () => {
    assert.deepEqual(geo.chartLayout(470, 'tall'), { bin: 'tall', h: 470 }, '470 stays tall after tall');
    assert.deepEqual(geo.chartLayout(510, 'wide'), { bin: 'wide', h: 320 }, '510 stays wide after wide');
    assert.deepEqual(geo.chartLayout(500, 'tall'), { bin: 'tall', h: 470 }, '500 keeps tall until 520');
    assert.deepEqual(geo.chartLayout(480, 'wide'), { bin: 'wide', h: 320 }, '480 keeps wide until 460');
});

test('chartLayout treats a hidden card (width 0) as unchanged', () => {
    assert.deepEqual(geo.chartLayout(0, 'wide'), { bin: 'wide', h: 320 });
    assert.deepEqual(geo.chartLayout(0, 'tall'), { bin: 'tall', h: 470 });
    assert.deepEqual(geo.chartLayout(0), { bin: 'tall', h: 470 }, 'defaults to tall');
});

test('progressXTicks keeps every attempt while the plot fits the minimum gap', () => {
    assert.deepEqual(geo.progressXTicks(0, 524), []);
    assert.deepEqual(geo.progressXTicks(1, 524), [0]);
    assert.deepEqual(geo.progressXTicks(6, 524), [0, 1, 2, 3, 4, 5], '6 attempts all fit on a wide plot');
});

test('progressXTicks thins long runs to at most six evenly spread ticks', () => {
    const ticks = geo.progressXTicks(12, 524);
    assert.deepEqual(ticks, [0, 2, 4, 7, 9, 11], '12 attempts produce 6 evenly spread labels');
    assert.equal(ticks[0], 0, 'always starts at the first attempt');
    assert.equal(ticks[ticks.length - 1], 11, 'always ends at the last attempt');
    assert.ok(ticks.every((t, i) => i === 0 || t > ticks[i - 1]), 'no duplicates, ascending order');
});

test('progressXTicks honors the plot width (minTickGap shrink), falling back to 2 ticks', () => {
    assert.deepEqual(geo.progressXTicks(12, 88), [0, 11], 'a narrow plot keeps only first/last');
    assert.deepEqual(geo.progressXTicks(12, 0), [0, 11], 'hidden card falls back to first/last');
    assert.deepEqual(geo.progressXTicks(12, -5), [0, 11], 'negative width is clamped');
    assert.deepEqual(geo.progressXTicks(12, 524, 150), [0, 6, 11], 'a larger min gap reduces tick count');
});