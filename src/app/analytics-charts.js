/* ============================================================
   ANALYTICS CHARTS — hand-rolled Recharts-style SVG renderers
   No React, no recharts, no external deps. Pure geometry from
   src/analytics/aggregation.js + src/analytics/geometry.js is
   applied to real (instructor-scoped) activity records.
   ============================================================ */

var analyticsPieActiveName = null;

function anChartPalette() {
    return ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];
}

function renderAnalyticsCharts(filteredActivity) {
    ['an-trajectory-svg', 'an-submissions-svg', 'an-error-svg'].forEach(id => {
        const plot = $id(id);
        if (plot) {
            plot.setAttribute('aria-busy', 'false');
            plot.removeAttribute('aria-describedby');
            anHideTooltip(plot.closest('.an-chart-card')?.querySelector('.an-svg-tooltip'));
        }
    });
    setText('an-live-status', 'Showing recorded submissions and translation attempts for the selected filters.');
    const submissions = filteredActivity.filter(isSubmissionActivity);
    try {
        renderTrajectoryChart(submissions);
    } catch (e) {
        console.error('[Analytics] trajectory render failed:', e);
        showChartError('an-trajectory-svg', anErrMessage(e));
    }
    try {
        renderSubmissionActivityChart(submissions);
    } catch (e) {
        console.error('[Analytics] submission activity render failed:', e);
        showChartError('an-submissions-svg', anErrMessage(e));
    }
    try {
        renderErrorDistributionChart(filteredActivity);
    } catch (e) {
        console.error('[Analytics] error distribution render failed:', e);
        showChartError('an-error-svg', anErrMessage(e));
    }
    if (typeof initChartResizeObserver === 'function') initChartResizeObserver();
}

/* ── Resize handling (UX Rule 1) ─────────────────────────────
   Chart boxes reserve their height with min-height tokens, so a
   viewport change never shifts layout; the debounced observer
   only re-renders the SVG of whichever analytics page is
   visible, after the resize settles (150 ms). Idempotent: the
   observer is created once and plots keep their reserved box.
   ============================================================ */
let anResizeDebounceTimer = null;
let anChartResizeObserver = null;

function anRerenderVisibleCharts() {
    if (typeof $id !== 'function') return;
    const analyticsPage = $id('page-analytics');
    if (analyticsPage && !analyticsPage.classList.contains('hidden') &&
        typeof currentFilteredActivity !== 'undefined') {
        try { renderAnalyticsCharts(currentFilteredActivity); } catch (e) { console.warn('[Analytics] resize re-render failed:', e); }
        return;
    }
    const systemPage = $id('page-system-analytics');
    if (systemPage && !systemPage.classList.contains('hidden') &&
        typeof cachedSystemActivity !== 'undefined' && typeof renderSystemAnalytics === 'function') {
        try { renderSystemAnalytics(); } catch (e) { console.warn('[SystemAnalytics] resize re-render failed:', e); }
    }
}

function scheduleChartRerender() {
    if (anResizeDebounceTimer) clearTimeout(anResizeDebounceTimer);
    anResizeDebounceTimer = setTimeout(function () {
        anResizeDebounceTimer = null;
        anRerenderVisibleCharts();
    }, 150);
}

function initChartResizeObserver() {
    if (anChartResizeObserver || typeof ResizeObserver !== 'function' || typeof $id !== 'function') return;
    anChartResizeObserver = new ResizeObserver(function () { scheduleChartRerender(); });
    ['an-trajectory-svg', 'an-submissions-svg', 'an-error-svg', 'system-activity-svg', 'system-errors-svg']
        .forEach(function (id) {
            const plot = $id(id);
            if (plot) anChartResizeObserver.observe(plot);
        });
}

function anErrMessage(e) {
    return (e && e.message) ? String(e.message) : 'Unable to render chart data.';
}

function showChartError(plotId, message) {
    const plot = $id(plotId);
    anChartState(plot, 'error', '', () => typeof loadAnalytics === 'function' && loadAnalytics());
}

function showAnalyticsLoading() {
    setText('an-live-status', 'Loading analytics…');
    ['an-trajectory-svg', 'an-submissions-svg', 'an-error-svg'].forEach(id => {
        const plot = $id(id);
        if (!plot) return;
        plot.setAttribute('aria-busy', 'true');
        plot.innerHTML = '<div class="an-chart-skeleton" role="status"><span class="sr-only">Loading chart data</span></div>';
    });
}

function anEmptyHtml(message, hint) {
    return `<div class="an-chart-empty"><p class="an-chart-empty-title">${message}</p>` +
        (hint ? `<p class="an-chart-empty-hint">${hint}</p>` : '') + '</div>';
}

function anEnsureTooltip(card) {
    if (!card) return null;
    let tip = card.querySelector('.an-svg-tooltip');
    if (!tip) {
        tip = document.createElement('div');
        tip.className = 'an-svg-tooltip hidden';
        tip.setAttribute('role', 'tooltip');
        card.appendChild(tip);
    }
    return tip;
}

function anShowTooltip(tip, event, html, card) {
    if (!tip) return;
    tip._pending = {event, html};
    if (tip._frame) return;
    tip._frame = requestAnimationFrame(() => {
        tip._frame = 0;
        const next = tip._pending;
        if (!next) return;
        tip.innerHTML = next.html;
        tip.classList.remove('hidden');
        const rect = (next.event.currentTarget || next.event.target)?.getBoundingClientRect() || card.getBoundingClientRect();
        const x = next.event.clientX || rect.left + rect.width / 2;
        const y = next.event.clientY || rect.top;
        const left = Math.max(8, Math.min(x + 12, window.innerWidth - tip.offsetWidth - 8));
        const top = Math.max(8, Math.min(y - tip.offsetHeight - 12, window.innerHeight - tip.offsetHeight - 8));
        const base = card.classList.contains('an-chart-system') ? {left:0,top:0} : card.getBoundingClientRect();
        tip.style.left = (left - base.left) + 'px';
        tip.style.top = (top - base.top) + 'px';
    });
}

function anHideTooltip(tip) {
    if (tip) { tip._pending = null; tip.classList.add('hidden'); }
}

/* ── Student Improvement Trajectory ───────────────────────── */

function renderTrajectoryChart(records) {
    anRenderTrajectory(records || []);
}

function anSplitSegments(points) {
    const segments = [];
    let current = [];
    points.forEach(p => {
        if (p.y == null) {
            if (current.length) { segments.push(current); current = []; }
        } else {
            current.push(p);
        }
    });
    if (current.length) segments.push(current);
    return segments;
}

function anTrajectoryAriaLabel(result, gridStops) {
    const desc = result.series.map(s => {
        const values = s.points.filter(p => p.y != null).map(p => p.y);
        const last = values.length ? values[values.length - 1] : '—';
        return `${s.name}: latest ${last}`;
    }).join('; ');
    return `Student improvement trajectory. ${desc}. Scores from 0 to ${gridStops[gridStops.length - 1]}.`;
}

function anTrajectoryAriaDescribe(result, card, gridStops) {
    if (!card) return;
    let desc = card.querySelector('#an-trajectory-summary');
    if (!desc) {
        desc = document.createElement('p');
        desc.className = 'sr-only';
        desc.id = 'an-trajectory-summary';
        card.appendChild(desc);
    }
    const attemptCounts = Object.create(null);
    result.series.forEach(s => s.points.forEach(p => {
        if (p.y == null) return;
        const key = '# ' + (p.x + 1);
        attemptCounts[key] = (attemptCounts[key] || []).concat(`${s.name} ${p.y}`);
    }));
    desc.textContent = 'Trajectory: ' + result.series.length + ' students, up to attempt ' + result.maxAttempts + '. ' +
        Object.keys(attemptCounts).sort().map(k => `${k}: ${attemptCounts[k].join(', ')}`).join('; ');
    const plot = card.querySelector('#an-trajectory-svg');
    if (plot) plot.setAttribute('aria-describedby', 'an-trajectory-summary');
}

function anBindTrajectoryInteractions(plot, card, result) {
    const tip = anEnsureTooltip(card);
    const dots = plot.querySelectorAll('.an-series-dot');
    const seriesByName = Object.create(null);
    result.series.forEach(s => (seriesByName[s.name] = s));
    dots.forEach(dot => {
        dot.addEventListener('mouseenter', (evt) => {
            const name = dot.getAttribute('data-name');
            const attempt = parseInt(dot.getAttribute('data-x'), 10) + 1;
            const score = dot.getAttribute('data-score') || dot.getAttribute('data-y') + '%';
            const date = dot.getAttribute('data-date');
            const s = seriesByName[name];
            const color = anChartPalette()[s.rank % anChartPalette().length];
            anShowTooltip(tip, evt, `
                <div class="an-tt-header"><span class="an-tt-dot" style="background:${color}"></span>${anEsc(name)}</div>
                <div class="an-tt-row">Attempt #${attempt}</div>
                <div class="an-tt-row"><strong>Score ${anEsc(score)}</strong></div>
                <div class="an-tt-row an-tt-muted">${anEsc(date || '')}</div>
            `, card);
        });
        dot.addEventListener('mousemove', e => anShowTooltip(tip, e, tip.innerHTML, card));
        dot.addEventListener('mouseleave', () => anHideTooltip(tip));
        dot.addEventListener('focus', () => dot.dispatchEvent(new MouseEvent('mouseenter', { clientX: dot.getBoundingClientRect().left, clientY: dot.getBoundingClientRect().top })));
        dot.addEventListener('blur', () => anHideTooltip(tip));
    });
    plot.querySelectorAll('.an-class-dot').forEach(dot => {
        const attempt = parseInt(dot.getAttribute('data-x'), 10) + 1;
        const score = dot.getAttribute('data-y');
        const show = evt => anShowTooltip(tip, evt, `
            <div class="an-tt-header"><span class="an-tt-dot" style="background:var(--muted-foreground)"></span>Class average</div>
            <div class="an-tt-row">Attempt #${attempt}</div>
            <div class="an-tt-row"><strong>Score ${score}%</strong></div>
        `, card);
        dot.addEventListener('mouseenter', show);
        dot.addEventListener('mousemove', e => anShowTooltip(tip, e, tip.innerHTML, card));
        dot.addEventListener('mouseleave', () => anHideTooltip(tip));
        dot.addEventListener('focus', () => dot.dispatchEvent(new MouseEvent('mouseenter', { clientX: dot.getBoundingClientRect().left, clientY: dot.getBoundingClientRect().top })));
        dot.addEventListener('blur', () => anHideTooltip(tip));
    });
}

function setTrajectoryHighlight(trigger) {
    const plot = $id('an-trajectory-svg');
    if (!plot) return;
    const name = trigger ? trigger.getAttribute('data-name') : null;
    plot.querySelectorAll('.an-series').forEach(group => {
        const matches = name && group.getAttribute('data-name') === name;
        group.classList.toggle('highlighted', !!matches);
        group.classList.toggle('dimmed', !!name && !matches);
    });
}

/* ── Submission Activity (area chart) ──────────────────────── */

function renderSubmissionActivityChart(records) {
    const mode = $id('chart-view-mode')?.value || 'day';
    const series = buildSubmissionSeries(records || [], {
        monthVal: $id('filter-month')?.value ?? '',
        weekVal: $id('filter-week')?.value || '',
        dateVal: $id('filter-date')?.value || '',
        viewMode: mode
    });
    const total = series.reduce((sum, b) => sum + b.count, 0);
    const peak = Math.max(0, ...series.map(b=>b.count));
    const view = anMountChart('an-submissions-svg', {title:'Student Submission Activity',description:'Submissions over the selected period.',
        stats:[{label:'Submissions',value:total},{label:'Peak period',value:peak}],
        controls:`<label>View by <select id="chart-view-mode"><option value="day" ${mode==='day'?'selected':''}>Day</option><option value="month" ${mode==='month'?'selected':''}>Month</option></select></label>`,
        caption:'Select a point to view submissions for that period.'});
    if(!view)return;
    view.controls.querySelector('select').onchange=()=>{renderSubmissionActivityChart(records);view.controls.querySelector('select').focus();};
    view.legend.innerHTML=anLegendChip('Submissions',String(total),'var(--chart-1)');
    anChartDraw(view,width=>{
        if(!total){anChartState(view.plot,'empty','No submissions match this period.');return;}
        const yMax=niceCeil(peak), y=linearScale([0,yMax],[216,16]);
        const x=i=>48+(series.length===1?(width-80)/2:i*(width-80)/(series.length-1));
        const points=series.map((b,i)=>({x:i,y:b.count}));
        const ticks=[0,Math.ceil(yMax/2),yMax];
        const items=series.map(b=>({label:b.sub+' · '+b.label,rows:[{name:'Submissions',value:b.count,color:'var(--chart-1)'}],bucket:b}));
        // Straight segments avoid smoothing below zero between sparse counts.
        const line=points.map((p,i)=>`${i?'L':'M'} ${x(p.x)} ${y(p.y)}`).join(' ');
        let content=`<defs><linearGradient id="an-submission-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--chart-1)" stop-opacity=".3"/><stop offset="1" stop-color="var(--chart-1)" stop-opacity=".03"/></linearGradient></defs>`;
        content+=anChartGrid(width,ticks,y,'')+`<path d="${line} L ${x(points.length-1)} 216 L ${x(0)} 216 Z" fill="url(#an-submission-fill)"/><path d="${line}" fill="none" stroke="var(--chart-1)" stroke-width="2"/>`;
        content+=points.map((p,i)=>`<circle data-mark="${i}" tabindex="-1" role="button" aria-label="${anAttr(items[i].label+': '+p.y+' submissions; filter this period')}" cx="${x(i)}" cy="${y(p.y)}" r="5" fill="var(--chart-1)"/>`).join('');
        content+=chartTicks(series.map(b=>b.sub),series.map((_,i)=>x(i))).map(i=>`<text class="an-axis-label" x="${x(i)}" y="236" text-anchor="middle">${anEsc(series[i].sub)}</text>`).join('');
        view.plot.innerHTML=anChartSvg(width,'Submission activity by period',content);
        anBindMarks(view.plot,view.card,items,item=>{
            const b=item.bucket;
            if(b.dateKey&&$id('filter-date'))$id('filter-date').value=b.dateKey;
            else if(b.weekRange&&$id('filter-week'))$id('filter-week').value=String(b.weekRange.w);
            else return;
            applyAnalyticsFilters();
        });
    });
}

function anAreaAriaDescribe(card, total) {
    if (!card) return;
    const plot = card.querySelector('#an-submissions-svg');
    if (!plot) return;
    let desc = card.querySelector('#an-area-summary');
    if (!desc) {
        desc = document.createElement('p');
        desc.className = 'sr-only';
        desc.id = 'an-area-summary';
        card.appendChild(desc);
    }
    desc.textContent = 'Total submissions this period: ' + total + '.';
    plot.setAttribute('aria-describedby', 'an-area-summary');
}

function anBindAreaInteractions(plot, card, series, points, xFor, yFor) {
    const tip = anEnsureTooltip(card);
    const dots = plot.querySelectorAll('.an-area-dot');
    dots.forEach((dot, i) => {
        const b = series[i];
        dot.addEventListener('mouseenter', (evt) => {
            anShowTooltip(tip, evt, `
                <div class="an-tt-header">${anEsc(b.label)} — ${anEsc(b.sub)}</div>
                <div class="an-tt-row"><strong>${b.count} submission${b.count !== 1 ? 's' : ''}</strong></div>
                ${b.dateKey ? '<div class="an-tt-row an-tt-muted">Click to filter table</div>' : ''}
            `, card);
        });
        dot.addEventListener('mousemove', e => anShowTooltip(tip, e, tip.innerHTML, card));
        dot.addEventListener('mouseleave', () => anHideTooltip(tip));
        dot.addEventListener('focus', () => dot.dispatchEvent(new MouseEvent('mouseenter', { clientX: dot.getBoundingClientRect().left, clientY: dot.getBoundingClientRect().top })));
        dot.addEventListener('blur', () => anHideTooltip(tip));
        dot.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dot.dispatchEvent(new MouseEvent('click')); }
        });
        dot.addEventListener('click', () => {
            if (!b.dateKey) {
                if (b.weekRange && $id('filter-week')) {
                    $id('filter-week').value = String(b.weekRange.w);
                    applyAnalyticsFilters();
                }
                return;
            }
            const dateInput = $id('filter-date');
            if (dateInput) {
                dateInput.value = b.dateKey;
                applyAnalyticsFilters();
                $qs('.an-table-card')?.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}

/* ── Error Distribution (inline-pie / donut) ───────────────── */

function renderErrorDistributionChart(records) {
    const plot = $id('an-error-svg');
    if (!plot) return;
    const card = plot.closest('.an-chart-card');
    const dist = buildErrorDistribution(records || []);
    if (!dist.categories.some(cat => cat.name === analyticsPieActiveName)) analyticsPieActiveName = null;
    const selector = $id('an-error-select');
    if (selector) {
        selector.innerHTML = '<option value="">All error types</option>' + dist.categories.map(cat => `<option value="${anAttr(cat.name)}">${anEsc(cat.name)}</option>`).join('');
        selector.value = analyticsPieActiveName || '';
        selector.disabled = dist.total === 0;
    }
    const totalEl = card ? card.querySelector('#an-error-total') : null;

    if (totalEl) totalEl.textContent = String(dist.total);

    if (dist.total === 0) {
        plot.innerHTML = anEmptyHtml('No errors in the selected period.',
            'Student translation errors appear here automatically, including free practice. No submission is required.');
        const legend = card ? card.querySelector('#an-error-legend') : null;
        if (legend) legend.innerHTML = '<div class="an-legend-note">No matching errors recorded yet.</div>';
        return;
    }

    const size = 240;
    const cx = size / 2, cy = size / 2;
    const outerR = 96, innerR = 58;
    const palette = anChartPalette();

    let cursor = 0;
    const slices = dist.categories.map((cat, i) => {
        const sweep = (cat.count / dist.total) * Math.PI * 2;
        const start = -Math.PI / 2 + cursor;
        const end = start + sweep;
        cursor += sweep;
        const color = palette[i % palette.length];
        const path = arcPath(cx, cy, outerR, innerR, start, end);
        const active = analyticsPieActiveName === cat.name;
        const dimmed = analyticsPieActiveName && !active;
        const explode = active ? 6 : 0;
        const tx = explode * Math.cos(start + sweep / 2);
        const ty = explode * Math.sin(start + sweep / 2);
        const c = sliceCentroid(cx, cy, outerR, innerR, start, end);
        return {
            cat,
            path,
            start,
            end,
            color,
            active,
            dimmed,
            tx,
            ty,
            c,
            labelX: c.x + (c.x > cx ? 12 : -12),
            labelAnchor: c.x >= cx ? 'start' : 'end'
        };
    });

    const sliceHtml = slices.map(s =>
        `<path data-name="${anAttr(s.cat.name)}" data-count="${s.cat.count}" data-pct="${s.cat.pct}"
               d="${s.path}" class="an-pie-slice ${s.active ? 'active' : ''} ${s.dimmed ? 'dimmed' : ''}"
               transform="translate(${s.tx} ${s.ty})" tabindex="0" role="button"
               aria-label="${anAttr(s.cat.name + ', ' + s.cat.pct + ' percent')}"
               style="--slice-color:${s.color}"/>`).join('');

    plot.innerHTML = `
        <svg class="an-svg an-pie-svg" viewBox="0 0 ${size} ${size}" role="img"
             aria-label="${anAttr('Error distribution: ' + dist.categories.map(c => c.name + ' ' + c.pct + '% (' + c.count + ')').join(', '))}"
             preserveAspectRatio="xMidYMid meet">
            ${sliceHtml}
            <text x="${cx}" y="${cy - 4}" text-anchor="middle" class="an-pie-center-num">${dist.total}</text>
            <text x="${cx}" y="${cy + 14}" text-anchor="middle" class="an-pie-center-label">errors</text>
        </svg>`;

    const legend = card ? card.querySelector('#an-error-legend') : null;
    if (legend) {
        legend.innerHTML = dist.categories.map((cat, i) => {
            const color = palette[i % palette.length];
            return `<button type="button" class="an-legend-chip" data-name="${anAttr(cat.name)}" onclick="toggleErrorSlice('${anAttr(cat.name)}')">
                <span class="an-legend-dot" style="background:${color}"></span>
                <span class="an-legend-name">${anEsc(cat.name)}</span>
                <span class="an-legend-val">${cat.pct}% (${cat.count})</span>
            </button>`;
        }).join('');
    }

    anBindPieInteractions(plot, card, slices);
}

function toggleErrorSlice(name) {
    analyticsPieActiveName = analyticsPieActiveName === name ? null : name;
    const records = typeof currentFilteredActivity !== 'undefined' ? currentFilteredActivity : [];
    renderErrorDistributionChart(records);
    const legend = $id('an-error-legend');
    if (legend) legend.querySelectorAll('.an-legend-chip').forEach(chip => {
        chip.classList.toggle('active', chip.getAttribute('data-name') === analyticsPieActiveName);
    });
}

function setPieHover(name) {
    const legend = $id('an-error-legend');
    if (!legend) return;
    legend.querySelectorAll('.an-legend-chip').forEach(chip => {
        chip.classList.toggle('hovered', chip.getAttribute('data-name') === name);
    });
}

function anBindPieInteractions(plot, card, slices) {
    const tip = anEnsureTooltip(card);
    const byName = {};
    slices.forEach(s => (byName[s.cat.name] = s));
    plot.querySelectorAll('.an-pie-slice').forEach(path => {
        path.addEventListener('click', () => toggleErrorSlice(path.getAttribute('data-name')));
        path.addEventListener('mouseenter', (evt) => {
            const name = path.getAttribute('data-name');
            const count = path.getAttribute('data-count');
            const pct = path.getAttribute('data-pct');
            setPieHover(name);
            anShowTooltip(tip, evt, `
                <div class="an-tt-header">${anEsc(name)}</div>
                <div class="an-tt-row"><strong>${count} error${count !== '1' ? 's' : ''}</strong></div>
                <div class="an-tt-row an-tt-muted">${pct}% of recorded errors</div>
            `, card);
        });
        path.addEventListener('mousemove', e => anShowTooltip(tip, e, tip.innerHTML, card));
        path.addEventListener('mouseleave', () => { anHideTooltip(tip); setPieHover(null); });
        path.addEventListener('focus', () => path.dispatchEvent(new MouseEvent('mouseenter', { clientX: path.getBoundingClientRect().left, clientY: path.getBoundingClientRect().top })));
        path.addEventListener('blur', () => { anHideTooltip(tip); setPieHover(null); });
        path.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleErrorSlice(path.getAttribute('data-name'));
            }
        });
    });
}

/* ── Shared SVG string helpers ────────────────────────────── */

function anAttr(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function anEsc(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
