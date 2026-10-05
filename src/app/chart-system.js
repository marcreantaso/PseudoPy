/* Shared, dependency-free chart primitives inspired by ui.shadcn.com/charts.
   Classic script: all seven chart views use the same layout and interactions. */
const AN_PLOT_HEIGHT = 250;
const anChartJobs = new Map();
let anSystemObserver;
let anSystemResizeTimer;

function anChartHeader(title, description, stats) {
    return `<div class="an-chart-heading"><h3 class="an-chart-title">${anEsc(title)}</h3><p class="an-chart-subtitle">${anEsc(description)}</p></div>` +
        `<div class="an-stat-tabs" aria-label="Chart metrics">${(stats || []).map(s =>
            `<button type="button" class="an-stat-tab" data-metric="${anAttr(s.key || '')}" ${s.active == null ? 'disabled' : `aria-pressed="${s.active}"`}><span>${anEsc(s.label)}</span><strong>${anEsc(s.value)}</strong></button>`).join('')}</div>`;
}

function anMountChart(id, config) {
    let plot = $id(id);
    if (!plot) return null;
    const card = plot.closest('.an-chart-card, .chart-container');
    if (!card) return null;
    if (!card.dataset.chartMounted) {
        card.classList.add('an-chart-system');
        card.dataset.chartMounted = 'true';
        card.innerHTML = `<div class="an-chart-header"></div><div class="an-chart-controls"></div><p class="an-chart-insight" aria-live="polite"></p><div class="an-chart-plot" id="${anAttr(id)}"></div><div class="an-svg-legend"></div><div class="an-chart-footer"></div><div class="an-chart-data"></div>`;
        plot = $id(id);
    }
    const header = card.querySelector('.an-chart-header');
    header.innerHTML = anChartHeader(config.title, config.description, config.stats);
    header.querySelectorAll('[data-metric]').forEach(b => b.onclick = () => {
        if (config.onMetric) config.onMetric(b.dataset.metric);
        card.querySelector(`[data-metric="${b.dataset.metric}"]`)?.focus();
    });
    const controls = card.querySelector('.an-chart-controls');
    controls.innerHTML = config.controls || '';
    controls.hidden = !config.controls;
    card.querySelector('.an-chart-insight').textContent = config.insight || '';
    card.querySelector('.an-chart-footer').textContent = config.caption || '';
    plot.setAttribute('role', 'group');
    plot.setAttribute('aria-label', config.title);
    plot.setAttribute('aria-busy', 'false');
    anHideTooltip(card.querySelector('.an-svg-tooltip'));
    return { card, plot, controls, legend: card.querySelector('.an-svg-legend'), data: card.querySelector('.an-chart-data') };
}

function anChartDraw(view, render) {
    if (!view) return;
    const {plot} = view;
    // A re-render may have replaced this plot element; release the old node so
    // the observer does not keep detached elements alive.
    anChartJobs.forEach((job, el) => {
        if (!el.isConnected) { if (anSystemObserver) anSystemObserver.unobserve(el); anChartJobs.delete(el); }
    });
    const run = () => {
        const width = Math.floor(plot.clientWidth);
        if (width <= 0 || !plot.isConnected) return;
        const job = anChartJobs.get(plot);
        if (job) job.width = width;
        try { render(width); }
        catch (e) { console.error('[Chart] render failed', e); anChartState(plot, 'error', '', run); }
    };
    anChartJobs.set(plot, {width: 0, run});
    if (typeof ResizeObserver === 'function') {
        if (!anSystemObserver) anSystemObserver = new ResizeObserver(entries => {
            const changed = entries.some(e => {
                const job = anChartJobs.get(e.target);
                return job && e.target.clientWidth > 0 && Math.floor(e.target.clientWidth) !== job.width;
            });
            if (!changed) return;
            clearTimeout(anSystemResizeTimer);
            anSystemResizeTimer = setTimeout(() => {
                anChartJobs.forEach((job, el) => {
                    if (!el.isConnected) { anSystemObserver.unobserve(el); anChartJobs.delete(el); }
                    else if (el.clientWidth > 0 && Math.floor(el.clientWidth) !== job.width) job.run();
                });
            }, 150);
        });
        anSystemObserver.observe(plot);
    }
    run();
}

/**
 * Re-run a chart's last render pass on demand.
 *
 * A plot inside a hidden tab measures 0 x 0, so anChartDraw skips it; when the
 * tab becomes visible the ResizeObserver usually catches up, but a panel that
 * was hidden for the whole session may never have been observed at a real size.
 * This gives the tab code a deterministic way to draw once layout is known.
 * Returns true when a redraw actually ran.
 */
function anChartRedraw(plot) {
    if (!plot) return false;
    const job = anChartJobs.get(plot);
    if (!job) return false;
    const width = Math.floor(plot.clientWidth);
    if (width <= 0 || !plot.isConnected) return false;
    job.width = width;
    try { job.run(); }
    catch (e) { console.error('[Chart] redraw failed', e); return false; }
    return true;
}

function anChartState(plot, state, message, retry) {
    if (!plot) return;
    plot.setAttribute('aria-busy', String(state === 'loading'));
    plot.innerHTML = state === 'loading'
        ? '<div class="an-chart-skeleton" role="status"><span class="sr-only">Loading chart data…</span></div>'
        : `<div class="an-chart-empty" role="status"><p class="an-chart-empty-title">${state === 'error' ? 'This chart is unavailable right now.' : anEsc(message || 'No data for this selection.')}</p><p class="an-chart-empty-hint">${state === 'error' ? 'Please try loading it again.' : 'Adjust your filters or check back after more activity.'}</p>${retry ? '<button type="button" class="an-chart-retry">Try again</button>' : ''}</div>`;
    if (retry) plot.querySelector('.an-chart-retry')?.addEventListener('click', retry);
}

function anTooltipContent(label, rows) {
    return `<div class="an-tt-header">${anEsc(label)}</div>` + rows.map(r =>
        `<div class="an-tt-row"><span class="an-tt-dot" style="background:${r.color}"></span><span>${anEsc(r.name)}</span><strong>${anEsc(r.value)}</strong></div>`).join('');
}

function anBindMarks(plot, card, items, select) {
    const tip = anEnsureTooltip(card);
    const marks = Array.from(plot.querySelectorAll('[data-mark]'));
    marks.forEach((mark, index) => {
        mark.setAttribute('tabindex', index === 0 ? '0' : '-1');
        const item = items[Number(mark.getAttribute('data-mark'))];
        const show = e => anShowTooltip(tip, e, anTooltipContent(item.label, item.rows), card);
        mark.addEventListener('mouseenter', show);
        mark.addEventListener('mousemove', show);
        mark.addEventListener('mouseleave', () => anHideTooltip(tip));
        mark.addEventListener('focus', e => { marks.forEach(m=>m.setAttribute('tabindex',m===mark?'0':'-1')); show(e); });
        mark.addEventListener('blur', () => anHideTooltip(tip));
        mark.addEventListener('click', e => { show(e); if (select) select(item, mark); });
        mark.addEventListener('keydown', e => {
            const next = anChartKeyIndex(e.key, index, marks.length);
            if (next != null) { e.preventDefault(); marks[next].focus(); }
            else if (e.key === 'Escape') { e.preventDefault(); anHideTooltip(tip); }
            else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(e); if (select) select(item, mark); }
        });
    });
}

function anChartKeyIndex(key, index, count) {
    if (!count) return null;
    if (key === 'Home') return 0;
    if (key === 'End') return count - 1;
    if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % count;
    if (key === 'ArrowLeft' || key === 'ArrowUp') return (index + count - 1) % count;
    return null;
}

function anLegendChip(name, value, color) {
    return `<span class="an-legend-chip-static"><span class="an-legend-dot" style="background:${color}"></span><span class="an-legend-name" title="${anAttr(name)}">${anEsc(name)}</span><span class="an-legend-val">${anEsc(value)}</span></span>`;
}

function anChartGrid(width, ticks, y, suffix) {
    return ticks.map(n=>`<line x1="48" x2="${width-16}" y1="${y(n)}" y2="${y(n)}" class="an-grid-line"/><text x="40" y="${y(n)+4}" text-anchor="end" class="an-axis-label">${n}${suffix || ''}</text>`).join('');
}

function anChartSvg(width, label, content) {
    return `<svg class="an-svg" width="${width}" height="250" viewBox="0 0 ${width} 250" role="group" aria-label="${anAttr(label)}">${content}</svg>`;
}
