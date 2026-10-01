/* ============================================================
   SYSTEM ANALYTICS (Admin)
   Live aggregate of the ENTIRE stored activity log
   (pseudopy_activity) — every instructor and every student.
   Single realtime subscription with proper cleanup on leave.
   ============================================================ */

const SystemAnalyticsTime = {
    RANGES: { '24h': 1, '7d': 7, '30d': 30, '90d': 90, 'all': null }
};

function systemRecordTime(record) {
    if (record && typeof record.timestamp === 'number' && isFinite(record.timestamp)) return record.timestamp;
    if (record && typeof record.time === 'string') {
        const parsed = Date.parse(record.time);
        if (!isNaN(parsed)) return parsed;
    }
    return null;
}

function systemFilterByRange(records, range) {
    const days = SystemAnalyticsTime.RANGES[range];
    if (days == null) return Array.isArray(records) ? records.slice() : [];
    const cutoff = Date.now() - days * 864e5;
    return (Array.isArray(records) ? records : []).filter(record => {
        const t = systemRecordTime(record);
        return t != null && t >= cutoff;
    });
}

function systemHasPseudocode(record) {
    return !!(record && (record.pseudocode || record.submittedCode));
}

function systemHasExecution(record) {
    if (record && record.type === 'translate_attempt') return false;
    return !!(record && (record.python_code || record.pythonCode || record.output || record.status === 'Completed'));
}

function systemComputeOverview(records) {
    const list = Array.isArray(records) ? records : [];
    let totalTranslations = 0;
    let totalExecutions = 0;
    let errorCount = 0;
    const students = new Set();
    const exercises = new Set();
    for (const record of list) {
        if (systemHasPseudocode(record)) totalTranslations++;
        if (systemHasExecution(record)) totalExecutions++;
        const errorText = (record && record.errorType) || '';
        const resultText = String((record && record.result) || '');
        const isError = errorText.trim() !== '' ||
            /error|failed/i.test(resultText) ||
            (record && record.status === 'Failed');
        if (isError) errorCount++;
        const studentKey = record && (record.studentAccountId || record.studentId || record.username || record.student);
        if (studentKey) students.add(String(studentKey));
        const exerciseKey = record && (record.exerciseId || record.exercise || record.title);
        if (exerciseKey) exercises.add(String(exerciseKey));
    }
    const compilationSuccessRate = totalTranslations > 0
        ? parseFloat(((1 - errorCount / totalTranslations) * 100).toFixed(1))
        : null;
    return {
        totalRecords: list.length,
        totalTranslations,
        totalExecutions,
        errorCount,
        compilationSuccessRate,
        activeStudents: students.size,
        uniqueExercises: exercises.size
    };
}

function systemBuildActivitySeries(records, range) {
    const days = SystemAnalyticsTime.RANGES[range] || 30;
    const buckets = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
        const day = new Date(today.getTime() - i * 864e5);
        buckets.push({
            key: day.toDateString(),
            label: (day.getMonth() + 1) + '/' + day.getDate(),
            translations: 0,
            executions: 0
        });
    }
    const byKey = {};
    buckets.forEach(bucket => { byKey[bucket.key] = bucket; });
    (Array.isArray(records) ? records : []).forEach(record => {
        const t = systemRecordTime(record);
        if (t == null) return;
        const bucket = byKey[new Date(t).toDateString()];
        if (!bucket) return;
        if (systemHasPseudocode(record)) bucket.translations++;
        if (systemHasExecution(record)) bucket.executions++;
    });
    return buckets;
}

/* ════════════════════════════════════════════════════════════
   DOM / REALTIME LAYER
   ════════════════════════════════════════════════════════════ */

let cachedSystemActivity = [];
let systemTimeRange = 'all';
let systemAnalyticsLoadGeneration = 0;

var systemAnalyticsUnsubscribe = null;

function startSystemAnalyticsRealtime() {
    if (systemAnalyticsUnsubscribe || !currentUser || currentUser.role !== 'admin') return;
    const owner = currentUser;
    const subscriptions = [];
    systemAnalyticsUnsubscribe = () => subscriptions.forEach(unsubscribe => unsubscribe());
    const refresh = () => {
        if (currentUser !== owner || currentPage !== 'system-analytics') return;
        renderSystemAnalytics();
    };
    subscriptions.push(subscribeCollection(activityRef, records => {
        if (currentUser !== owner || currentPage !== 'system-analytics') return;
        cachedSystemActivity = Array.isArray(records) ? records : [];
        refresh();
    }, error => {
        console.error('[SystemAnalytics] Realtime subscription error:', error);
        setText('system-live-status', 'Live updates unavailable. Reopen System Analytics to retry.');
    }));
}

function stopSystemAnalyticsRealtime() {
    systemAnalyticsLoadGeneration++;
    if (systemAnalyticsUnsubscribe) {
        systemAnalyticsUnsubscribe();
        systemAnalyticsUnsubscribe = null;
    }
}

async function loadSystemAnalytics() {
    stopSystemAnalyticsRealtime();
    const generation = systemAnalyticsLoadGeneration;
    const owner = currentUser;
    if (!owner || owner.role !== 'admin') return;
    setText('system-live-status', 'Loading system analytics…');
    try {
        const records = await dbGetAll(activityRef);
        if (generation !== systemAnalyticsLoadGeneration || currentUser !== owner || currentPage !== 'system-analytics') return;
        cachedSystemActivity = Array.isArray(records) ? records : [];
        renderSystemAnalytics();
        startSystemAnalyticsRealtime();
    } catch (error) {
        if (generation !== systemAnalyticsLoadGeneration || currentUser !== owner) return;
        console.error('[SystemAnalytics] Loading failed:', error);
        cachedSystemActivity = [];
        renderSystemAnalyticsError('Unable to load system analytics. Reopen this page to retry.');
    }
}

function setSystemTimeRange(range, button) {
    if (SystemAnalyticsTime.RANGES[range] === undefined) return;
    systemTimeRange = range;
    const buttons = typeof $qsa === 'function' ? $qsa('.sys-range-btn') : [];
    buttons.forEach(btn => btn.classList.toggle('active', btn === button || btn.getAttribute('data-range') === range));
    renderSystemAnalytics();
}

function systemRenderErrorState(message) {
    const messageElement = $id('system-error-message');
    if (messageElement) messageElement.textContent = message;
    const state = $id('system-error-state');
    if (state) state.classList.remove('hidden');
}

function renderSystemAnalyticsError(message) {
    systemRenderErrorState(message);
    ['chart-system-activity', 'chart-system-errors'].forEach(id => {
        const container = $id(id);
        if (container) container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:2rem;">' + message + '</div>';
    });
    setText('system-live-status', 'System analytics unavailable.');
}

function renderSystemAnalytics() {
    if (!currentUser || currentUser.role !== 'admin') return;
    const filtered = systemFilterByRange(cachedSystemActivity, systemTimeRange);
    const overview = systemComputeOverview(filtered);

    // ── System Overview KPIs ──
    setText('adv-total-translations', formatMetricValue(overview.totalTranslations));
    setText('adv-total-executions', formatMetricValue(overview.totalExecutions));
    setText('adv-compile-rate', formatPercent(overview.compilationSuccessRate));
    setText('adv-error-count', formatMetricValue(overview.errorCount));
    setText('adv-active-students', formatMetricValue(overview.activeStudents));
    setText('adv-unique-exercises', formatMetricValue(overview.uniqueExercises));

    const scopeLabel = $id('system-scope-label');
    if (scopeLabel) {
        const rangeNames = { '24h': 'last 24 hours', '7d': 'last 7 days', '30d': 'last 30 days', '90d': 'last 90 days', all: 'all time' };
        scopeLabel.textContent = `${overview.totalRecords} activity record(s) across ${rangeNames[systemTimeRange] || 'all time'}.`;
    }
    setText('system-live-status', 'Live system analytics — every stored activity record is included.');

    // ── Charts ──
    try { renderSystemActivityChart(filtered); }
    catch (e) { console.error('[SystemAnalytics] activity chart failed:', e); }
    try { renderSystemErrorChart(filtered); }
    catch (e) { console.error('[SystemAnalytics] error chart failed:', e); }
}

function renderSystemActivityChart(records) {
    const plot = $id('system-activity-svg');
    if (!plot) return;
    const series = systemBuildActivitySeries(records, systemTimeRange);
    const total = series.reduce((sum, bucket) => sum + bucket.translations + bucket.executions, 0);
    const totalElement = $id('system-activity-total');
    if (totalElement) totalElement.textContent = total + ' activity events in the charted period';

    if (total === 0) {
        plot.innerHTML = `
            <div class="an-chart-empty">
                <i data-lucide="chart-column" style="width:48px;height:48px;opacity:0.3;margin-bottom:0.75rem;"></i>
                <p class="an-chart-empty-title">No activity in this period</p>
                <p class="an-chart-empty-hint">Activity appears once students translate or execute pseudocode.</p>
            </div>`;
        return;
    }

    const viewW = 560, viewH = 240;
    const margin = { left: 40, right: 16, top: 18, bottom: 30 };
    const plotW = viewW - margin.left - margin.right;
    const plotH = viewH - margin.top - margin.bottom;
    const baseline = margin.top + plotH;

    const maxCount = series.reduce((max, bucket) => Math.max(max, bucket.translations, bucket.executions), 1);
    const yMax = niceCeil(maxCount);
    const yStep = yMax <= 6 ? 2 : yMax <= 12 ? 2 : Math.ceil(yMax / 6);
    const yTicks = [];
    for (let v = yMax; v >= 0; v -= yStep) yTicks.push(v);
    if (yTicks[yTicks.length - 1] !== 0) yTicks.push(0);

    const yFor = linearScale([0, yMax], [baseline, margin.top]);
    const barSlot = plotW / series.length;
    const barW = Math.min(11, Math.max(3, barSlot * 0.34));

    const grid = yTicks.map(v =>
        `<line x1="${margin.left}" y1="${yFor(v)}" x2="${margin.left + plotW}" y2="${yFor(v)}" class="an-grid-line"/>` +
        `<text x="${margin.left - 6}" y="${yFor(v) + 3}" text-anchor="end" class="an-axis-label">${v}</text>`
    ).join('');

    const labelEvery = Math.max(1, Math.ceil(series.length / 12));
    const xLabels = series.map((bucket, i) =>
        (i % labelEvery === 0)
            ? `<text x="${margin.left + barSlot * i + barSlot / 2}" y="${baseline + 16}" text-anchor="middle" class="an-axis-label an-axis-label-x">${anEsc(bucket.label)}</text>`
            : ''
    ).join('');

    const bars = series.map((bucket, i) => {
        const centerX = margin.left + barSlot * i + barSlot / 2;
        const transY = bucket.translations > 0 ? yFor(bucket.translations) : baseline - 1;
        const execY = bucket.executions > 0 ? yFor(bucket.executions) : baseline - 1;
        const transH = baseline - transY;
        const execH = baseline - execY;
        return `<g role="img" aria-label="${anAttr(bucket.label + ': ' + bucket.translations + ' translations, ' + bucket.executions + ' executions')}">
            ${bucket.translations > 0 ? `<rect x="${centerX - barW - 1}" y="${transY}" width="${barW}" height="${transH}" rx="2" fill="var(--chart-1)"/>` : ''}
            ${bucket.executions > 0 ? `<rect x="${centerX + 1}" y="${execY}" width="${barW}" height="${execH}" rx="2" fill="var(--chart-2)"/>` : ''}
        </g>`;
    }).join('');

    const aria = series.map(bucket => `${bucket.label}: ${bucket.translations} translations, ${bucket.executions} executions`).join('; ');
    plot.innerHTML = `
        <svg class="an-svg an-area-svg" viewBox="0 0 ${viewW} ${viewH}" role="img"
             aria-label="${anAttr('Translations and executions per day: ' + aria)}"
             preserveAspectRatio="xMidYMid meet">
            ${grid}
            ${bars}
            ${xLabels}
        </svg>`;
}

function renderSystemErrorChart(records) {
    const plot = $id('system-errors-svg');
    if (!plot) return;
    const distribution = buildErrorDistribution(records || []);
    const totalElement = $id('system-error-total');
    if (totalElement) totalElement.textContent = String(distribution.total) + ' recorded error(s)';

    if (distribution.total === 0) {
        plot.innerHTML = `
            <div class="an-chart-empty">
                <i data-lucide="pie-chart" style="width:48px;height:48px;opacity:0.3;margin-bottom:0.75rem;"></i>
                <p class="an-chart-empty-title">No errors in this period</p>
                <p class="an-chart-empty-hint">Recorded error types appear once activity contains failures.</p>
            </div>`;
        const legend = $id('system-error-legend');
        if (legend) legend.innerHTML = '<div class="an-legend-note">Clean code — no errors recorded.</div>';
        return;
    }

    const size = 220;
    const cx = size / 2, cy = size / 2;
    const outerR = 90, innerR = 54;
    const palette = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

    let cursor = 0;
    const slices = distribution.categories.map((cat, i) => {
        const sweep = (cat.count / distribution.total) * Math.PI * 2;
        const start = -Math.PI / 2 + cursor;
        const end = start + sweep;
        cursor += sweep;
        const color = palette[i % palette.length];
        return {
            cat,
            path: arcPath(cx, cy, outerR, innerR, start, end),
            color
        };
    });

    const sliceMarkup = slices.map(slice =>
        `<path d="${slice.path}" class="an-pie-slice" style="--slice-color:${slice.color}"/>`
    ).join('');

    plot.innerHTML = `
        <svg class="an-svg an-pie-svg" viewBox="0 0 ${size} ${size}" role="img"
             aria-label="${anAttr('Error distribution: ' + distribution.categories.map(c => c.name + ' ' + c.pct + '% (' + c.count + ')').join(', '))}"
             preserveAspectRatio="xMidYMid meet">
            ${sliceMarkup}
            <text x="${cx}" y="${cy - 4}" text-anchor="middle" class="an-pie-center-num">${distribution.total}</text>
            <text x="${cx}" y="${cy + 14}" text-anchor="middle" class="an-pie-center-label">errors</text>
        </svg>`;

    const legend = $id('system-error-legend');
    if (legend) {
        legend.innerHTML = distribution.categories.map((cat, i) => {
            const color = palette[i % palette.length];
            return `<div class="an-legend-chip-static">
                <span class="an-legend-dot" style="background:${color}"></span>
                <span class="an-legend-name">${anEsc(cat.name)}</span>
                <span class="an-legend-val">${cat.pct}% (${cat.count})</span>
            </div>`;
        }).join('');
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SystemAnalyticsTime: { RANGES: SystemAnalyticsTime.RANGES },
        systemRecordTime,
        systemFilterByRange,
        systemComputeOverview,
        systemBuildActivitySeries
    };
}
