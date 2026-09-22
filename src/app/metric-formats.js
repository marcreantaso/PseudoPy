/* ============================================================
   METRICS FORMATTERS
   Pure, Node-testable helpers used by the Compiler Metrics page.
   Any invalid / missing value renders as an em dash so the UI
   never shows fake zeros or "NaN".
   ============================================================ */

function _isFiniteNumber(value) {
    return value !== null && value !== undefined && Number.isFinite(Number(value));
}

/** Round to at most one decimal and drop a trailing ".0". */
function _trim(n) {
    const rounded = Math.round(n * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/**
 * Format a percentage value.
 * Values are assumed to already be on a 0-100 scale (the engine's
 * convention). Pass { fromRatio: true } for 0-1 fractions.
 * Returns "—" for null / undefined / NaN / Infinity.
 */
function formatPercent(value, options) {
    if (!_isFiniteNumber(value)) return '\u2014';
    let n = Number(value);
    const opts = options || {};
    if (opts.fromRatio && n >= 0 && n <= 1) n = n * 100;
    return _trim(n) + '%';
}

/**
 * Format a duration. Milliseconds < 1000 are shown as "ms";
 * durations >= 1 second are converted to seconds ("1.24 s").
 * Returns "—" for missing values.
 */
function formatDuration(value) {
    if (!_isFiniteNumber(value)) return '\u2014';
    const v = Number(value);
    if (v >= 1000) {
        const secs = Math.round((v / 1000) * 100) / 100;
        return _trim(secs) + ' s';
    }
    return _trim(v) + ' ms';
}

/**
 * Format a plain metric (counts, raw numbers).
 * Returns "—" for missing values and a readable number otherwise.
 */
function formatMetricValue(value) {
    if (!_isFiniteNumber(value)) return '\u2014';
    return _trim(Number(value));
}

/**
 * Single source of truth for mastery thresholds, kept in sync with
 * the MetricsEngine taxonomy (Expert >= 80, Proficient >= 65,
 * Developing >= 40, Beginner < 40).
 */
const MASTERY_LEVELS = [
    { min: 80, label: 'Expert', color: 'var(--icon-success)' },
    { min: 65, label: 'Proficient', color: 'var(--text-accent)' },
    { min: 40, label: 'Developing', color: 'var(--icon-warning)' },
    { min: 0, label: 'Beginner', color: 'var(--icon-danger)' }
];

/** Resolve the mastery label (+ color) for an exact-match accuracy (0-100). */
function masteryInfo(accuracy) {
    if (!_isFiniteNumber(accuracy)) return MASTERY_LEVELS[MASTERY_LEVELS.length - 1];
    const a = Number(accuracy);
    for (let i = 0; i < MASTERY_LEVELS.length; i++) {
        if (a >= MASTERY_LEVELS[i].min) return MASTERY_LEVELS[i];
    }
    return MASTERY_LEVELS[MASTERY_LEVELS.length - 1];
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { formatPercent, formatDuration, formatMetricValue, MASTERY_LEVELS, masteryInfo };
}