/* ============================================================
   ANALYTICS AGGREGATION — pure data builders
   No DOM access. Suite-testable in Node and shared by the
   browser chart renderer (analytics-charts.js).
   ============================================================ */

const AN_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const AN_DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const KNOWN_ERROR_TYPES = ['Syntax Error', 'Logic Error', 'Missing END', 'Indentation Error', 'Type Error'];

function recordDate(record) {
    const raw = record && (record.timestamp || record.time);
    if (raw == null || raw === '') return null;
    const d = typeof raw.toDate === 'function' ? raw.toDate()
        : typeof raw.seconds === 'number' ? new Date(raw.seconds * 1000)
        : new Date(raw);
    return isNaN(d.getTime()) ? null : d;
}

function maxRecordDate(records) {
    let max = null;
    (records || []).forEach(record => {
        const d = recordDate(record);
        if (d && (!max || d.getTime() > max.getTime())) max = d;
    });
    return max;
}

function dayKey(date) {
    if (!date || isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function scoreAsNumber(record) {
    const raw = String(record && record.score != null ? record.score : '').replace(/\s+/g, '');
    if (raw === '' || raw === '—' || raw === '-' || raw === 'Pending') return null;
    const value = parseFloat(raw);
    if (isNaN(value)) return null;
    return Math.max(0, Math.min(100, Math.round(value)));
}

function monthWeekForDay(dayNum) {
    if (dayNum <= 3) return 1;
    if (dayNum <= 10) return 2;
    if (dayNum <= 17) return 3;
    if (dayNum <= 24) return 4;
    return 5;
}

const WEEK_RANGES = [
    { w: 1, start: 1, end: 3 },
    { w: 2, start: 4, end: 10 },
    { w: 3, start: 11, end: 17 },
    { w: 4, start: 18, end: 24 },
    { w: 5, start: 25, end: 31 }
];

/**
 * Builds the per-period submission counts backing the Submission Activity
 * area chart. Mirrors the analytics filter semantics:
 *   - month view (or month selected without a week) → 5 weekly buckets
 *   - week selected               → 7 daily buckets for that week
 *   - date selected               → 7 daily buckets for that date's week
 *   - otherwise                   → last 7 days ending at the newest record
 * Returns an array of { label, sub, dateKey, count, active }.
 */
function buildSubmissionSeries(records, filters = {}, opts = {}) {
    const monthVal = filters.monthVal ?? '';
    const weekVal = filters.weekVal || '';
    const dateVal = filters.dateVal || '';
    const viewMode = filters.viewMode || 'day';
    const counts = countByDayKey(records);

    const latest = opts.latestDate && !isNaN(new Date(opts.latestDate).getTime())
        ? new Date(opts.latestDate)
        : maxRecordDate(records);
    const fallbackYear = new Date().getFullYear();
    let year = latest ? latest.getFullYear() : fallbackYear;

    // Mirror the legacy rule: month buckets unless the user narrowed to a week.
    const useMonthly = viewMode === 'month' || (monthVal !== '' && !weekVal);

    if (useMonthly) {
        const mIdx = monthVal !== '' ? parseInt(monthVal, 10) : (latest ? latest.getMonth() : new Date().getMonth());
        const mName = AN_MONTHS_SHORT[mIdx] || 'Jan';
        return WEEK_RANGES.map(r => {
            let count = 0;
            for (let day = r.start; day <= r.end; day++) {
                const key = `${year}-${String(mIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                count += counts[key] || 0;
            }
            return {
                label: 'Wk ' + r.w,
                sub: `${mName} ${r.start}–${r.end}`,
                dateKey: null,
                weekRange: r,
                count,
                active: weekVal === String(r.w)
            };
        });
    }

    let startDay = 4;
    let mIdx = latest ? latest.getMonth() : new Date().getMonth();
    const dayNames = AN_DAYS_SHORT;
    const monNames = AN_MONTHS_SHORT;

    if (weekVal) {
        const range = WEEK_RANGES.find(r => String(r.w) === weekVal);
        if (range) startDay = range.start;
        if (monthVal !== '') mIdx = parseInt(monthVal, 10);
    } else if (dateVal) {
        const dateRef = new Date(dateVal + 'T00:00:00');
        if (!isNaN(dateRef.getTime())) {
            const week = monthWeekForDay(dateRef.getDate());
            const range = WEEK_RANGES.find(r => r.w === week);
            startDay = range ? range.start : 1;
            mIdx = dateRef.getMonth();
            year = dateRef.getFullYear();
        }
    } else if (latest) {
        // Last 7 contiguous days ending at the newest record.
        const buckets = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(latest.getTime());
            d.setDate(latest.getDate() - i);
            const key = dayKey(d);
            buckets.push({
                label: dayNames[d.getDay()],
                sub: `${monNames[d.getMonth()]} ${d.getDate()}`,
                dateKey: key,
                count: counts[key] || 0,
                active: false
            });
        }
        return buckets;
    }

    // Daily buckets for a selected week (explicit or date-derived).
    const buckets = [];
    const lastDay = new Date(year, mIdx + 1, 0).getDate();
    const rangeEnd = startDay === 1 ? 3 : Math.min(startDay + 6, lastDay);
    for (let i = 0; startDay + i <= rangeEnd; i++) {
        const day = startDay + i;
        const d = new Date(year, mIdx, day);
        if (isNaN(d.getTime())) continue;
        const key = dayKey(d);
        buckets.push({
            label: dayNames[d.getDay()],
            sub: `${monNames[mIdx]} ${day}`,
            dateKey: key,
            count: counts[key] || 0,
            active: dateVal === key
        });
    }
    return buckets;
}

function countByDayKey(records) {
    const counts = {};
    (records || []).forEach(record => {
        const d = recordDate(record);
        if (!d) return;
        const key = dayKey(d);
        counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
}

/**
 * Builds the Student Improvement Trajectory series: one line per top
 * student (by volume) plus a dashed class-average line. Points carry
 * { x: attempt index, y: score|null, date, name }.
 */
function buildTrajectorySeries(records, opts = {}) {
    const studentKey = opts.studentKey || 'student';
    const maxStudents = opts.maxStudents || 6;
    const maxSessions = opts.maxSessions || 8;

    const grouped = Object.create(null);
    (records || []).forEach(record => {
        const name = String(record[studentKey] || '')
            || String(record.username || '')
            || String(record.studentId || '');
        if (!name.trim()) return;
        if (!grouped[name]) grouped[name] = [];
        grouped[name].push(record);
    });

    const byAttempt = Object.create(null);
    const classPoints = [];
    let maxAttempts = 0;

    Object.keys(grouped).forEach(name => {
        const attempts = grouped[name]
            .map(record => ({ record, date: recordDate(record) }))
            .filter(a => a.date)
            .sort((a, b) => a.date.getTime() - b.date.getTime())
            .slice(-maxSessions);
        if (attempts.length === 0) return;
        byAttempt[name] = attempts;
        maxAttempts = Math.max(maxAttempts, attempts.length);
    });

    for (let x = 0; x < maxAttempts; x++) {
        let sum = 0, n = 0;
        Object.keys(byAttempt).forEach(name => {
            const attempt = byAttempt[name][x];
            if (!attempt) return;
            const score = scoreAsNumber(attempt.record);
            if (score == null) return;
            sum += score;
            n++;
        });
        classPoints.push({ x, y: n > 0 ? Math.round(sum / n) : null });
    }

    const ranked = Object.keys(byAttempt)
        .map(name => ({ name, n: byAttempt[name].length }))
        .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
        .slice(0, maxStudents);

    const series = ranked.map(({ name }, rank) => ({
        name,
        rank,
        points: byAttempt[name].map((attempt, x) => ({
            x,
            y: scoreAsNumber(attempt.record),
            date: dayKey(attempt.date),
            score: attempt.record.score != null ? String(attempt.record.score) : null
        }))
    }));

    return { series, classAverage: classPoints, maxAttempts };
}

/**
 * Counts error types from real records. Unknown types fold into 'Other'.
 * Percentages are rounded so they sum to 100.
 */
function buildErrorDistribution(records) {
    const counts = {};
    KNOWN_ERROR_TYPES.concat(['Other']).forEach(t => (counts[t] = 0));

    (records || []).forEach(record => {
        const type = String(record.errorType || '').trim();
        if (!type) return;
        if (counts[type] !== undefined) counts[type]++;
        else counts['Other']++;
    });

    const total = KNOWN_ERROR_TYPES.concat(['Other']).reduce((sum, t) => sum + counts[t], 0);
    if (total === 0) return { total: 0, categories: [] };

    const categories = KNOWN_ERROR_TYPES.concat(['Other'])
        .filter(t => counts[t] > 0)
        .map((name, i) => ({
            name,
            count: counts[name],
            pct: Math.round((counts[name] / total) * 100)
        }));

    const pctSum = categories.reduce((s, c) => s + c.pct, 0);
    if (pctSum !== 100 && categories.length > 0) {
        const largest = categories.reduce((a, b) => (a.count >= b.count ? a : b));
        largest.pct += 100 - pctSum;
    }
    return { total, categories };
}

/* ============================================================
   CommonJS export guard — allows the Node suite to require()
   the same source the browser bundles.
   ============================================================ */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        recordDate,
        maxRecordDate,
        dayKey,
        scoreAsNumber,
        monthWeekForDay,
        buildSubmissionSeries,
        countByDayKey,
        buildTrajectorySeries,
        buildErrorDistribution,
        KNOWN_ERROR_TYPES,
        AN_MONTHS_SHORT,
        AN_DAYS_SHORT
    };
}
