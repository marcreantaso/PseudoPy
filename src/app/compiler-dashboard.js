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
            return exercises;
        }
    } catch (e) {
        console.warn('[Benchmark] IndexedDB read failed, falling back to dataset.json:', e);
    }
    // Fallback
    console.log('[Benchmark] Fetching dataset.json as fallback...');
    const res = await fetch('dataset.json');
    if (!res.ok) throw new Error('Failed to fetch dataset.json: ' + res.status);
    const raw = await res.json();
    return Array.isArray(raw) ? raw : (raw.dataset || []);
}

/**
 * Load and render the Compiler Metrics page.
 * Displays: Session Metrics, Benchmark Results, Pipeline Timing.
 */
function loadCompilerMetrics() {
    if (typeof metricsEngine === 'undefined') return;

    // ── Session Metrics Cards ──
    const session = metricsEngine.getSessionMetrics();
    const improvement = metricsEngine.getImprovementMetrics();

    setText('metric-total-translations', formatMetricValue(session.totalTranslations));
    setText('metric-compilation-rate', formatPercent(session.compilationSuccessRate));
    setText('metric-runtime-error-rate', formatPercent(session.runtimeErrorRate));
    setText('metric-avg-gen-time', formatDuration(session.avgGenerationTime));
    setText('metric-total-errors', formatMetricValue(session.totalErrors));
    setText('metric-total-executions', formatMetricValue(session.totalExecutions));

    // Error trend badge
    const trendEl = $id('metric-error-trend');
    const trendIcons = { improving: '↑ Improving', declining: '↓ Declining', stable: '— Stable' };
    const trendClasses = { improving: 'positive', declining: 'negative', stable: '' };
    if (trendEl) {
        trendEl.textContent = trendIcons[session.errorTrend] || '— Stable';
        trendEl.className = 'stat-change ' + (trendClasses[session.errorTrend] || '');
    }

    // ── Improvement Section ──
    const improvementEl = $id('metrics-improvement-section');
    if (improvement.hasData) {
        improvementEl.innerHTML = `
        <div class="stats-grid" style="margin-bottom: 1rem;">
          <div class="stat-card">
            <div class="stat-icon">{{ui:ChartNoAxesCombined}}</div>
            <div class="stat-value">${formatPercent(improvement.correctnessImprovement)}</div>
            <div class="stat-label">Correctness Improvement</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">{{ui:Zap}}</div>
            <div class="stat-value">${formatPercent(improvement.speedImprovement)}</div>
            <div class="stat-label">Speed Improvement</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">{{ui:CircleCheck}}</div>
            <div class="stat-value">${formatPercent(improvement.overallSuccessRate)}</div>
            <div class="stat-label">Overall Success Rate</div>
          </div>
        </div>`;
    } else {
        improvementEl.innerHTML = `<div class="empty-state" style="padding: 1.5rem;">
            <div class="empty-icon">{{ui:ChartColumn}}</div>
            <h3>No Improvement Data Yet</h3>
            <p>${improvement.message}</p>
        </div>`;
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
        const dataset = await loadExercisesFromDB();

        if (!dataset || dataset.length === 0) {
            renderBenchmarkError('No test cases found. Please reload the app to seed the database.');
            showToast('No test cases found. Please reload the app to seed the database.', 'error');
            return;
        }

        showToast(`Running ${dataset.length} test cases through the compiler\u2026`, 'info');

        // Yield to browser so toast renders before heavy synchronous computation
        await new Promise(r => setTimeout(r, 80));

        // Run benchmark pipeline with mathematical metrics engine
        const results = metricsEngine.runBenchmark(dataset, compilerEngine);

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
    if (totalLabel) totalLabel.textContent = `${results.totalTestCases} test cases`;

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
        container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:2rem;">No timing data yet. Translate some pseudocode first.</div>';
        return;
    }

    const stages = [
        { name: 'Lexer', value: timing.avgLexTime, color: 'var(--chart-1)' },
        { name: 'Parser', value: timing.avgParseTime, color: 'var(--chart-2)' },
        { name: 'Semantic', value: timing.avgSemanticTime, color: 'var(--chart-3)' },
        { name: 'CodeGen', value: timing.avgCodeGenTime, color: 'var(--chart-4)' }
    ];

    const max = Math.max(...stages.map(s => s.value), 0.001);
    container.innerHTML = '<div class="chart-bars-wrap">' + stages.map(s =>
        '<div class="chart-bar" tabindex="0" aria-label="' + s.name + ': ' + s.value + 'ms average" title="' + s.name + ' average: ' + s.value + 'ms" style="height:' + Math.max((s.value / max) * 180, 20) + 'px;background:' + s.color + '">' +
        '<span class="bar-value">' + s.value + 'ms</span>' +
        '<span class="bar-label">' + s.name + '</span>' +
        '</div>'
    ).join('') + '</div>';

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


