/* ============================================================
   ANALYTICS GEOMETRY — pure SVG math
   Scales, smooth paths, area paths and donut-slice arcs used by
   the hand-rolled Recharts-style SVG renderers. No DOM access.
   ============================================================ */

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

/* ============================================================
   CommonJS export guard — allows the Node suite to require()
   the same source the browser bundles.
   ============================================================ */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        linearScale,
        niceCeil,
        smoothPath,
        areaPath,
        arcPath,
        sliceCentroid,
        polarPoint,
        chartLayout,
        CHART_LAYOUT_WIDE_MIN,
        CHART_LAYOUT_TALL_MAX,
        START_ANGLE,
        TAU,
        round
    };
}
