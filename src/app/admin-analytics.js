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
    renderSystemActivityChart([]);
    renderSystemErrorChart([]);
    ['system-activity-svg','system-errors-svg'].forEach(id=>anChartState($id(id),'loading'));
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
    systemRenderErrorState('Unable to load system analytics. Please try again.');
    ['system-activity-svg', 'system-errors-svg'].forEach(id => anChartState($id(id),'error','',()=>loadSystemAnalytics()));
    setText('system-live-status', 'System analytics unavailable.');
}

function renderSystemAnalytics() {
    if (!currentUser || currentUser.role !== 'admin') return;
    const filtered = systemFilterByRange(cachedSystemActivity, systemTimeRange);
    const overview = systemComputeOverview(filtered);
    $id('system-error-state')?.classList.add('hidden');

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
    catch (e) { console.error('[SystemAnalytics] activity chart failed:', e); anChartState($id('system-activity-svg'),'error','',()=>renderSystemAnalytics()); }
    try { renderSystemErrorChart(filtered); }
    catch (e) { console.error('[SystemAnalytics] error chart failed:', e); anChartState($id('system-errors-svg'),'error','',()=>renderSystemAnalytics()); }
}

let systemActivityMetric = 'all';
function renderSystemActivityChart(records) {
    const daily=systemBuildActivitySeries(records,systemTimeRange);
    // Combine contiguous days for a bounded plot; retain every event in totals.
    const stride=Math.max(1,Math.ceil(daily.length/30));
    const series=[];
    for(let i=0;i<daily.length;i+=stride){
        const chunk=daily.slice(i,i+stride);
        series.push({label:chunk[0].label+(chunk.length>1?'–'+chunk.at(-1).label:''),
            translations:chunk.reduce((n,b)=>n+b.translations,0),executions:chunk.reduce((n,b)=>n+b.executions,0)});
    }
    const translations=series.reduce((n,b)=>n+b.translations,0),executions=series.reduce((n,b)=>n+b.executions,0);
    const view=anMountChart('system-activity-svg',{title:'Translations & Executions',description:'Recorded compiler activity over the charted period.',
        stats:[{key:'all',label:'All events',value:translations+executions,active:systemActivityMetric==='all'},
            {key:'translations',label:'Translations',value:translations,active:systemActivityMetric==='translations'},
            {key:'executions',label:'Executions',value:executions,active:systemActivityMetric==='executions'}],
        caption:stride>1?'Contiguous days are grouped to keep the chart readable.':'Daily translations and executions.',
        onMetric:key=>{systemActivityMetric=key;renderSystemActivityChart(records);}});
    if(!view)return;
    const keys=(systemActivityMetric==='all'?['translations','executions']:[systemActivityMetric]);
    const color=key=>key==='translations'?'var(--chart-1)':'var(--chart-2)';
    const name=key=>key==='translations'?'Translations':'Executions';
    view.legend.innerHTML=keys.map(key=>anLegendChip(name(key),String(key==='translations'?translations:executions),color(key))).join('');
    anChartDraw(view,width=>{
        if(!translations&&!executions){anChartState(view.plot,'empty','No activity in this period.');return;}
        const w=Math.max(width,64+series.length*18),max=niceCeil(Math.max(1,...series.flatMap(b=>keys.map(k=>b[k]))));
        const y=linearScale([0,max],[216,16]),slot=(w-64)/series.length;
        const groups=keys.map(key=>({points:series.map((b,x)=>({x,y:b[key]}))}));
        const bars=groupedBarGeometry(groups,series.length,w,{domain:[0,max]});
        const items=bars.map(b=>({label:series[b.point.x].label,rows:[{name:name(keys[b.student]),value:b.point.y,color:color(keys[b.student])}]}));
        let content=anChartGrid(w,[0,Math.ceil(max/2),max],y,'');
        content+=bars.map((b,i)=>`<path data-mark="${i}" tabindex="-1" aria-label="${anAttr(items[i].label+', '+items[i].rows[0].name+': '+b.point.y)}" d="${roundedBarPath(b)}" fill="${color(keys[b.student])}"/>`).join('');
        content+=chartTicks(series.map(b=>b.label),series.map((_,i)=>48+slot*(i+.5))).map(i=>`<text x="${48+slot*(i+.5)}" y="236" text-anchor="middle" class="an-axis-label">${anEsc(series[i].label)}</text>`).join('');
        view.plot.innerHTML=anChartSvg(w,'System activity counts',content);anBindMarks(view.plot,view.card,items);
    });
}

let systemErrorActiveName = null;
function renderSystemErrorChart(records) {
    anRenderDonut('system-errors-svg',records || [],{title:'System Error Distribution',description:'Recorded translation errors across the system.',
        active:systemErrorActiveName,onSelect:name=>{systemErrorActiveName=name;renderSystemErrorChart(records);}});
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
