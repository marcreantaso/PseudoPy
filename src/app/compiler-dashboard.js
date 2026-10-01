/* ============================================================
   COMPILER METRICS DASHBOARD (Panel 1 — Evaluation)
   Benchmark runner, session metrics, and improvement tracking
   ============================================================ */

/**
 * Load all exercises from IndexedDB pseudopy_exercises store.
 * Falls back to fetching dataset.json if the store is empty.
 */
async function loadExercisesFromDB() {
    try {
        const exercises = await dbGetAll(exercisesRef);
        if (exercises && exercises.length > 0) {
            console.log(`[Benchmark] Loaded ${exercises.length} exercises from IndexedDB.`);
            return { dataset: exercises, source: 'stored exercises (' + exercises.length + ')' };
        }
    } catch (e) {
        console.warn('[Benchmark] IndexedDB read failed, falling back to dataset.json:', e);
    }
    // Fallback
    console.log('[Benchmark] Fetching dataset.json as fallback...');
    const res = await fetch('dataset.json');
    if (!res.ok) throw new Error('Failed to fetch dataset.json: ' + res.status);
    const raw = await res.json();
    const fallback = Array.isArray(raw) ? raw : (raw.dataset || []);
    return { dataset: fallback, source: 'dataset.json fallback (' + fallback.length + ')' };
}

/**
 * Load and render the Compiler Metrics page.
 * Displays: Session Metrics, Benchmark Results, Pipeline Timing.
 */
function loadCompilerMetrics() {
    if (typeof metricsEngine === 'undefined') return;

    // Session metric cards are optional: the Instructor page is benchmark-first,
    // so these elements may be absent — write them only when they exist.
    const session = metricsEngine.getSessionMetrics();

    const translationsEl = $id('metric-total-translations');
    if (translationsEl) translationsEl.textContent = formatMetricValue(session.totalTranslations);
    const compRateEl = $id('metric-compilation-rate');
    if (compRateEl) compRateEl.textContent = formatPercent(session.compilationSuccessRate);
    const runtimeRateEl = $id('metric-runtime-error-rate');
    if (runtimeRateEl) runtimeRateEl.textContent = formatPercent(session.runtimeErrorRate);
    const avgGenEl = $id('metric-avg-gen-time');
    if (avgGenEl) avgGenEl.textContent = formatDuration(session.avgGenerationTime);
    const totalErrorsEl = $id('metric-total-errors');
    if (totalErrorsEl) totalErrorsEl.textContent = formatMetricValue(session.totalErrors);
    const totalExecEl = $id('metric-total-executions');
    if (totalExecEl) totalExecEl.textContent = formatMetricValue(session.totalExecutions);

    // Error trend badge (optional)
    const trendEl = $id('metric-error-trend');
    const trendIcons = { improving: '↑ Improving', declining: '↓ Declining', stable: '— Stable' };
    const trendClasses = { improving: 'positive', declining: 'negative', stable: '' };
    if (trendEl) {
        trendEl.textContent = trendIcons[session.errorTrend] || '— Stable';
        trendEl.className = 'stat-change ' + (trendClasses[session.errorTrend] || '');
    }

    // ── Pipeline Timing Chart ──
    const timing = metricsEngine.getAveragePipelineTiming();
    renderPipelineTimingChart(timing);

    // ── Restore previous benchmark results if available ──
    if (metricsEngine.benchmarkResults) {
        renderBenchmarkResults(metricsEngine.benchmarkResults);
    } else {
        renderBenchmarkEmpty();
    }
}

/** Guards against overlapping benchmark runs. */
let benchmarkRunning = false;

/**
 * Show the "not run yet" panel and neutralise the summary cards.
 */
function renderBenchmarkEmpty() {
    _showState('benchmark-empty-state');
    ['benchmark-accuracy', 'benchmark-precision', 'benchmark-recall', 'benchmark-f1',
        'benchmark-compile-rate', 'benchmark-avg-time'].forEach(id => {
            const el = $id(id);
            if (el) el.textContent = formatMetricValue(null);
        });
    const wrapper = $id('benchmark-detail-wrapper');
    if (wrapper) wrapper.style.display = 'none';
}

/**
 * Show the loading panel while a benchmark is being computed.
 */
function renderBenchmarkLoading() {
    _showState('benchmark-loading-state');
}

/**
 * Show an error panel with the failure reason and a Retry action.
 */
function renderBenchmarkError(message) {
    const errorEl = $id('benchmark-error-state');
    _showState('benchmark-error-state');
    if (errorEl) {
        const msg = $id('benchmark-error-message');
        if (msg) msg.textContent = message ? String(message) : 'Unexpected failure.';
    }
}

/** Toggle one state panel (empty/loading/error) and hide the others. */
function _showState(id) {
    ['benchmark-empty-state', 'benchmark-loading-state', 'benchmark-error-state'].forEach(name => {
        const el = $id(name);
        if (el) el.classList.toggle('hidden', name !== id);
    });
}

/**
 * Run the automated benchmark.
 * Data source  : pseudopy_exercises IndexedDB store (seeded from dataset.json).
 * Computation  : MetricsEngine.runBenchmark() — strict mathematical formulas.
 * Deliverable  : Populates all dashboard cards, per-test table, concept mastery.
 */
async function runBenchmarkTest() {
    if (benchmarkRunning) return;
    const btn = $id('run-benchmark-btn');
    benchmarkRunning = true;
    if (btn) { btn.disabled = true; btn.textContent = '{{ui:Hourglass}} Running...'; }
    renderBenchmarkLoading();
    showToast('Running benchmark... loading exercises from database.', 'info');

    try {
        // Load from IndexedDB — no fetch/CORS errors
        const { dataset, source } = await loadExercisesFromDB();

        if (!dataset || dataset.length === 0) {
            renderBenchmarkError('No test cases found. Please reload the app to seed the database.');
            showToast('No test cases found. Please reload the app to seed the database.', 'error');
            return;
        }

        showToast(`Running ${dataset.length} test cases through the compiler\u2026`, 'info');

        // Yield to browser so toast renders before heavy synchronous computation
        await new Promise(r => setTimeout(r, 80));

        // Run benchmark pipeline with mathematical metrics engine
        const results = metricsEngine.runBenchmark(dataset, compilerEngine, { dataset: { name: source } });

        // Render all sections
        renderBenchmarkResults(results);

        showToast(
            `{{ui:CircleCheck}} Benchmark complete! Accuracy: ${formatPercent(results.accuracy)} \u00b7 F1: ${formatPercent(results.f1Score)} \u00b7 ${results.totalTestCases} test cases.`,
            'success'
        );
    } catch (err) {
        console.error('[Benchmark] Error:', err);
        renderBenchmarkError(err && err.message ? err.message : 'Unexpected failure.');
        showToast('Benchmark failed: ' + (err && err.message ? err.message : err), 'error');
    } finally {
        benchmarkRunning = false;
        if (btn) { btn.disabled = false; btn.textContent = '{{ui:FlaskConical}} Run Benchmark'; }
    }
}

/**
 * Render all benchmark results into the dashboard.
 * Populates: B. summary cards, per-test table, E. concept mastery table.
 */
function renderBenchmarkResults(results) {
    // ── Summary Cards ──
    setText('benchmark-accuracy', formatPercent(results.accuracy));
    setText('benchmark-precision', formatPercent(results.avgPrecision));
    setText('benchmark-recall', formatPercent(results.avgRecall));
    setText('benchmark-f1', formatPercent(results.f1Score));
    setText('benchmark-compile-rate', formatPercent(results.compilationSuccessRate));
    setText('benchmark-avg-time', formatDuration(results.avgTimeMs));

    // Benchmark has produced results — hide the empty/loading/error panels.
    _showState('');

    // Per-Test-Case Detail Table
    const wrapper = $id('benchmark-detail-wrapper');
    const totalLabel = $id('benchmark-total-label');
    if (wrapper) wrapper.style.display = 'block';
    if (totalLabel) {
        let metaLabel = `${results.totalTestCases} test cases`;
        if (results.dataset && results.dataset.name) metaLabel += ' · ' + results.dataset.name;
        if (results.runAt || results.timestamp) {
            const d = new Date(results.timestamp || results.runAt);
            metaLabel += ' · ' + d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
        }
        if (results.compilerVersion) metaLabel += ' · v' + results.compilerVersion;
        totalLabel.textContent = metaLabel;
    }

    // ── Detailed Results Table ──
    const tbody = $id('benchmark-results-body');
    if (tbody) {
        tbody.innerHTML = results.results.map(r => `
        <tr>
          <td style="font-weight:600;color:var(--text-primary)">${r.id}</td>
          <td>${r.concept}</td>
          <td><span class="badge ${r.compiled ? 'badge-active' : 'badge-inactive'}">${r.compiled ? '{{ui:CircleCheck}} Pass' : '{{ui:CircleX}} Fail'}</span></td>
          <td><span class="badge ${r.exactMatch ? 'badge-active' : 'badge-student'}">${r.exactMatch ? '{{ui:CircleCheck}} Match' : '{{ui:TriangleAlert}} Diff'}</span></td>
          <td style="font-weight:500">${formatPercent(r.precision * 100)}</td>
          <td style="font-weight:500">${formatPercent(r.recall * 100)}</td>
          <td style="color:var(--text-muted)">${formatDuration(r.timeMs)}</td>
        </tr>`).join('');
    }

    // ── Concept Mastery Table ──
    const masteryBody = $id('concept-mastery-body');
    if (masteryBody) {
        const conceptData = metricsEngine.getConceptMastery();
        if (conceptData.length === 0) {
            masteryBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:1rem;color:var(--text-muted)">No concept data available.</td></tr>';
        } else {
            masteryBody.innerHTML = conceptData.map(c => {
                const level = masteryInfo(c.accuracy);
                const label = c.mastery || level.label;
                const color = level.color;

                return `<tr>
                  <td style="font-weight:600;color:var(--text-primary)">${c.concept}</td>
                  <td style="color:var(--text-secondary)">${formatMetricValue(c.total)}</td>
                  <td><span style="font-weight:600;color:${c.successRate >= 80 ? 'var(--icon-success)' : 'var(--icon-warning)'}">${formatPercent(c.successRate)}</span></td>
                  <td><span style="font-weight:600;color:${color}">${formatPercent(c.accuracy)}</span></td>
                  <td>${formatPercent(c.avgPrecision)}</td>
                  <td><span style="color:${color};font-weight:700">{{ui:Circle}} ${label}</span></td>
                </tr>`;
            }).join('');
        }
    }
}

/**
 * Render pipeline timing bar chart.
 */
function renderPipelineTimingChart(timing) {
    const container = $id('chart-pipeline-timing');
    if (!container) return;

    if (timing.count === 0) {
        container.innerHTML = '<div class="an-chart-empty">' +
            '<p class="an-chart-empty-title">No timing data yet</p>' +
            '<p class="an-chart-empty-hint">Translate some pseudocode to see average milliseconds spent in each compiler stage.</p>' +
            '</div>';
        return;
    }

    const stages = [
        { name: 'Lexer', value: timing.avgLexTime, color: 'var(--chart-1)' },
        { name: 'Parser', value: timing.avgParseTime, color: 'var(--chart-2)' },
        { name: 'Semantic', value: timing.avgSemanticTime, color: 'var(--chart-3)' },
        { name: 'CodeGen', value: timing.avgCodeGenTime, color: 'var(--chart-4)' }
    ];

    const max = Math.max(...stages.map(s => s.value), 0.001);
    const slowest = stages.reduce((a, b) => (b.value > a.value ? b : a));

    // Headline: the end-to-end total that was measured but previously never shown.
    const headline = timing.count > 1
        ? 'Averaged over ' + timing.count + ' translations'
        : 'From 1 translation';

    container.innerHTML =
        '<div class="pipeline-timing-summary">' +
        '<span class="pipeline-timing-total"><strong>' + timing.avgTotalTime + 'ms</strong> average total pipeline time</span>' +
        '<span class="pipeline-timing-meta">' + headline + ' &middot; slowest stage: ' +
        '<strong style="color:' + slowest.color + '">' + slowest.name + '</strong> (' + slowest.value + 'ms)</span>' +
        '</div>' +
        '<div class="chart-bars-wrap">' + stages.map(s =>
        '<div class="chart-bar" tabindex="0" aria-label="' + s.name + ': ' + s.value + 'ms average" title="' + s.name + ' average: ' + s.value + 'ms" style="height:' + Math.max((s.value / max) * 180, 20) + 'px;background:' + s.color + '">' +
        '<span class="bar-value">' + s.value + 'ms</span>' +
        '<span class="bar-label">' + s.name + '</span>' +
        '</div>'
    ).join('') + '</div>';

    // Styled tooltip, consistent with the analytics SVG charts.
    const tip = document.createElement('div');
    tip.className = 'an-svg-tooltip hidden';
    container.appendChild(tip);
    const total = stages.reduce((sum, s) => sum + s.value, 0) || 1;
    container.querySelectorAll('.chart-bar').forEach((bar, i) => {
        const s = stages[i];
        const share = Math.round((s.value / total) * 100);
        const show = evt => anShowTooltip(tip, evt, `
            <div class="an-tt-header"><span class="an-tt-dot" style="background:${s.color}"></span>${s.name}</div>
            <div class="an-tt-row"><strong>${s.value}ms</strong> average</div>
            <div class="an-tt-row an-tt-muted">${share}% of pipeline time</div>
        `, container);
        bar.addEventListener('mouseenter', show);
        bar.addEventListener('mousemove', e => anShowTooltip(tip, e, tip.innerHTML, container));
        bar.addEventListener('mouseleave', () => anHideTooltip(tip));
        bar.addEventListener('focus', () => bar.dispatchEvent(new MouseEvent('mouseenter', { clientX: bar.getBoundingClientRect().left, clientY: bar.getBoundingClientRect().top })));
        bar.addEventListener('blur', () => anHideTooltip(tip));
    });

    // Accessible text equivalent for the bar chart.
    container.setAttribute('role', 'img');
    container.setAttribute('aria-label',
        'Pipeline timing: ' + stages.map(s => `${s.name} ${s.value}ms`).join(', '));
    const descEl = $id('pipeline-chart-text-summary');
    if (descEl) descEl.remove();
    const desc = document.createElement('p');
    desc.className = 'sr-only';
    desc.id = 'pipeline-chart-text-summary';
    desc.textContent = 'Average stage timings: ' + stages.map(s => `${s.name} ${s.value}ms`).join(', ');
    container.setAttribute('aria-describedby', 'pipeline-chart-text-summary');
    container.appendChild(desc);
}


if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}


