/* ============================================================
   ANALYTICS GEOMETRY — pure SVG math
   Scales, smooth paths, area paths and donut-slice arcs used by
   the hand-rolled Recharts-style SVG renderers. No DOM access.
   ============================================================ */

/* Select ticks by their actual label extents, leaving minGap clear pixels.
   Unlike forcing the final tick, this cannot collide at narrow widths. */
function chartTicks(labels, positions, minGap = 32) {
    const result = [];
    let edge = -Infinity;
    labels.forEach((label, i) => {
        const half = String(label).length * 3.6;
        if (positions[i] - half >= edge + minGap) {
            result.push(i);
            edge = positions[i] + half;
        }
    });
    return result;
}

function groupedBarGeometry(series, attempts, width, options = {}) {
    if (!series.length || attempts <= 0) return [];
    const left = options.left ?? 48, right = options.right ?? 16;
    const baseline = options.baseline ?? 216;
    const y = linearScale(options.domain || [0, 100], [baseline, 16]);
    const slot = Math.max(1, (width - left - right) / attempts);
    const gap = 2, groupWidth = slot * 0.78;
    const barWidth = Math.max(1, (groupWidth - gap * (series.length - 1)) / series.length);
    return series.flatMap((s, student) => s.points.map(point => {
        const ungraded = point.y == null;
        const height = ungraded ? 10 : Math.max(2, baseline - y(point.y));
        return {student, point, ungraded, x:left + slot * point.x + (slot-groupWidth)/2 + student*(barWidth+gap),
            y:baseline-height, width:barWidth, height};
    }));
}

function roundedBarPath(b, radius = 3) {
    const r = Math.min(radius, b.width / 2, b.height);
    return `M ${b.x} ${b.y+b.height} V ${b.y+r} Q ${b.x} ${b.y} ${b.x+r} ${b.y} H ${b.x+b.width-r} Q ${b.x+b.width} ${b.y} ${b.x+b.width} ${b.y+r} V ${b.y+b.height} Z`;
}

function linearScale(domain, range) {
    const [d0, d1] = domain;
    const [r0, r1] = range;
    const span = d1 - d0 || 1;
    return value => r0 + ((value - d0) / span) * (r1 - r0);
}

/**
 * Rounds a data max up to a tidy axis ceiling using the legacy
 * bar-chart rule so area charts keep friendly gridlines.
 */
function niceCeil(max, factor = 1.2) {
    if (max <= 0) return 0;
    if (max <= 5) return 6;
    if (max <= 10) return 12;
    return Math.ceil(max * factor);
}

/**
 * Monotone-ish smooth path from Catmull-Rom control points.
 * Handles 0, 1 and 2+ points without emitting invalid commands.
 */
function smoothPath(points, xFor, yFor) {
    if (!points || points.length === 0) return '';
    if (points.length === 1) {
        return `M ${round(xFor(points[0].x))} ${round(yFor(points[0].y))}`;
    }
    let d = `M ${round(xFor(points[0].x))} ${round(yFor(points[0].y))}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] || points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] || p2;
        const c1x = xFor(p1.x) + (xFor(p2.x) - xFor(p0.x)) / 6;
        const c2x = xFor(p2.x) - (xFor(p3.x) - xFor(p1.x)) / 6;
        const c1y = yFor(p1.y) + (yFor(p2.y) - yFor(p0.y)) / 6;
        const c2y = yFor(p2.y) - (yFor(p3.y) - yFor(p1.y)) / 6;
        d += ` C ${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(xFor(p2.x))} ${round(yFor(p2.y))}`;
    }
    return d;
}

/**
 * Area chart fill: smooth top edge closed down to a baseline.
 * Numbers are plain X values (indices); y values are pixels.
 */
function areaPath(points, xFor, yFor, baselineY) {
    if (!points || points.length === 0) return '';
    const line = smoothPath(points, xFor, yFor);
    if (!line) return '';
    const last = points[points.length - 1];
    const first = points[0];
    return `${line} L ${round(xFor(last.x))} ${round(baselineY)} L ${round(xFor(first.x))} ${round(baselineY)} Z`;
}

const TAU = Math.PI * 2;
const START_ANGLE = -Math.PI / 2; // 12 o'clock, like Recharts pies

function polarPoint(cx, cy, radius, angle) {
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

/**
 * Donut-slice path (outer arc → inner arc) for an angular span.
 * Angles are radians, 0 = 12 o'clock, sweeping clockwise.
 */
function arcPath(cx, cy, outerR, innerR, startAngle, endAngle) {
    const sweep = endAngle - startAngle;
    // A single SVG arc cannot draw a complete circle (identical endpoints).
    if (sweep >= TAU - 1e-9) {
        const o = polarPoint(cx, cy, outerR, startAngle);
        const opposite = polarPoint(cx, cy, outerR, startAngle + Math.PI);
        const i = polarPoint(cx, cy, innerR, startAngle);
        const innerOpposite = polarPoint(cx, cy, innerR, startAngle + Math.PI);
        return `M ${round(o.x)} ${round(o.y)} A ${outerR} ${outerR} 0 1 1 ${round(opposite.x)} ${round(opposite.y)} A ${outerR} ${outerR} 0 1 1 ${round(o.x)} ${round(o.y)} L ${round(i.x)} ${round(i.y)} A ${innerR} ${innerR} 0 1 0 ${round(innerOpposite.x)} ${round(innerOpposite.y)} A ${innerR} ${innerR} 0 1 0 ${round(i.x)} ${round(i.y)} Z`;
    }
    const largeArc = sweep > Math.PI ? 1 : 0;
    const outer0 = polarPoint(cx, cy, outerR, startAngle);
    const outer1 = polarPoint(cx, cy, outerR, endAngle);
    const inner1 = polarPoint(cx, cy, innerR, endAngle);
    const inner0 = polarPoint(cx, cy, innerR, startAngle);
    return [
        `M ${round(outer0.x)} ${round(outer0.y)}`,
        `A ${round(outerR)} ${round(outerR)} 0 ${largeArc} 1 ${round(outer1.x)} ${round(outer1.y)}`,
        `L ${round(inner1.x)} ${round(inner1.y)}`,
        `A ${round(innerR)} ${round(innerR)} 0 ${largeArc} 0 ${round(inner0.x)} ${round(inner0.y)}`,
        'Z'
    ].join(' ');
}

/** Label/pointer centroid mid-way between inner and outer radii. */
function sliceCentroid(cx, cy, outerR, innerR, startAngle, endAngle) {
    const mid = startAngle + (endAngle - startAngle) / 2;
    const midR = (outerR + innerR) / 2;
    return {
        x: cx + midR * Math.cos(mid),
        y: cy + midR * Math.sin(mid),
        midAngle: mid
    };
}

function round(value, precision) {
    const p = precision == null ? 1 : precision;
    return Math.round(value * Math.pow(10, p)) / Math.pow(10, p);
}

/* Responsive layout bins for the student Learning Progress chart. The
   480px threshold is reported with a 40px deadband: while the measured
   width sits inside the deadband the previous bin is kept, so viewport
   flicker (mobile toolbar, rotation) cannot flap the chart aspect and
   re-trigger full re-renders mid-scroll. */
const CHART_LAYOUT_WIDE_MIN = 520;
const CHART_LAYOUT_TALL_MAX = 460;

/**
 * Chooses the chart layout bin for a measured card width.
 * @param {number} width - measured card width in px (0 when hidden)
 * @param {'tall'|'wide'} [prevBin='tall'] - last committed bin
 * @returns {{bin: 'tall'|'wide', h: number}} viewBox height (470 tall / 320 wide)
 */
function chartLayout(width, prevBin) {
    const prev = prevBin === 'wide' ? 'wide' : 'tall';
    if (!(width > 0)) return { bin: prev, h: prev === 'wide' ? 320 : 470 };
    if (width >= CHART_LAYOUT_WIDE_MIN) return { bin: 'wide', h: 320 };
    if (width <= CHART_LAYOUT_TALL_MAX) return { bin: 'tall', h: 470 };
    return prev === 'wide'
        ? { bin: 'wide', h: 320 }
        : { bin: 'tall', h: 470 };
}

/**
 * Chooses the 0-based attempt indices to label on the Learning Progress
 * x-axis so labels never crowd on narrow cards (the vanilla equivalent of
 * a charting library's `minTickGap`). Always keeps the first and last
 * attempt and never emits more than 6 ticks, evenly spread.
 * @param {number} count - number of data points (0 → empty, 1 → [0])
 * @param {number} plotWidth - plot width in px (0 falls back to 2 ticks)
 * @param {number} [minPx=44] - minimum pixel gap between neighbouring ticks
 * @returns {number[]} ascending 0-based indices to label
 */
function progressXTicks(count, plotWidth, minPx) {
    const gap = Math.max(minPx === undefined ? 44 : Number(minPx) || 0, 1);
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (n === 0) return [];
    if (n === 1) return [0];
    const width = Math.max(0, Number(plotWidth) || 0);
    const target = Math.max(2, Math.min(6, Math.floor(width / gap)));
    if (n <= target) return Array.from({ length: n }, (_, i) => i);
    const ticks = [0];
    for (let t = 1; t < target; t++) ticks.push(Math.round((t * (n - 1)) / (target - 1)));
    ticks.push(n - 1);
    return [...new Set(ticks)].sort((a, b) => a - b);
}

/* ============================================================
   Chart size system (Part H items 59-68): a single purpose → size
   map shared by every chart. Mirrors the CSS tokens
   --chart-h-{sm,md,lg,xl} in style.css so pure geometry and the DOM
   agree on one source of truth.
   ============================================================ */
const CHART_SIZES = { sm: 240, md: 300, lg: 360, xl: 420 };

/* Item 61 purpose ranges: [min, max] px. The clamp() low term is the
   mobile-readable minimum, the vw term is fluid, and the high term is
   the controlled desktop maximum (item 66). The nominal CHART_SIZES
   tokens stay the spec's example values. */
const CHART_RANGES = { sm: { min: 200, max: 260 }, md: { min: 240, max: 320 }, lg: { min: 260, max: 380 }, xl: { min: 300, max: 420 } };
const CHART_VW = { sm: 26, md: 30, lg: 32, xl: 36 };

/**
 * Resolves a chart-size name into the responsive height contract.
 * @param {'sm'|'md'|'lg'|'xl'|null} [size='md'] size token name
 * @returns {{name:string, token:number, min:number, max:number, vw:number, toCss:()=>string}}
 *   min/max/vw are the three clamp() terms the stylesheet uses (so
 *   pure geometry and CSS agree on exactly one source of truth).
 */
function chartBox(size) {
    const key = CHART_RANGES[size] ? size : 'md';
    const r = CHART_RANGES[key];
    return {
        name: key,
        token: CHART_SIZES[key],
        min: r.min,
        max: r.max,
        vw: CHART_VW[key],
        toCss() { return 'clamp(' + r.min + 'px, ' + CHART_VW[key] + 'vw, ' + r.max + 'px)'; }
    };
}

/* ============================================================
   CommonJS export guard — allows the Node suite to require()
   the same source the browser bundles.
   ============================================================ */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        chartTicks,
        groupedBarGeometry,
        roundedBarPath,
        linearScale,
        niceCeil,
        smoothPath,
        areaPath,
        arcPath,
        sliceCentroid,
        polarPoint,
        chartLayout,
        progressXTicks,
        CHART_LAYOUT_WIDE_MIN,
        CHART_LAYOUT_TALL_MAX,
        START_ANGLE,
        TAU,
        round,
        CHART_SIZES,
        chartBox
    };
}
