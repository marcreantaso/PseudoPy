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
    setText('an-live-status', 'Showing recorded submissions for the selected filters.');
    try {
        renderTrajectoryChart(filteredActivity);
    } catch (e) {
        console.error('[Analytics] trajectory render failed:', e);
        showChartError('an-trajectory-svg', anErrMessage(e));
    }
    try {
        renderSubmissionActivityChart(filteredActivity);
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
}

function anErrMessage(e) {
    return (e && e.message) ? String(e.message) : 'Unable to render chart data.';
}

function showChartError(plotId, message) {
    const plot = $id(plotId);
    if (plot) {
        plot.setAttribute('aria-busy', 'false');
        plot.innerHTML = `<p class="an-chart-empty" role="status">${anEsc(message)}</p>`;
    }
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
        card.appendChild(tip);
    }
    return tip;
}

function anShowTooltip(tip, event, html, card) {
    if (!tip) return;
    tip.innerHTML = html;
    tip.classList.remove('hidden');
    const cardRect = card.getBoundingClientRect();
    const targetRect = event.target?.getBoundingClientRect();
    const left = (event.clientX ?? targetRect?.left ?? cardRect.left) - cardRect.left + 12;
    const top = (event.clientY ?? targetRect?.top ?? cardRect.top) - cardRect.top - 12;
    // Clamp in viewport coordinates (the card may be partially scrolled out of view),
    // then convert back to card-relative offsets for the absolutely positioned tooltip.
    const vpLeft = Math.max(8, Math.min(cardRect.left + left, window.innerWidth - tip.offsetWidth - 8));
    const vpTop = Math.max(8, Math.min(cardRect.top + top, window.innerHeight - tip.offsetHeight - 8));
    tip.style.left = (vpLeft - cardRect.left) + 'px';
    tip.style.top = (vpTop - cardRect.top) + 'px';
}

function anHideTooltip(tip) {
    if (tip) tip.classList.add('hidden');
}

/* ── Student Improvement Trajectory ───────────────────────── */

function renderTrajectoryChart(records) {
    const plot = $id('an-trajectory-svg');
    if (!plot) return;
    const card = plot.closest('.an-chart-card');

    const result = buildTrajectorySeries(records || [], { maxStudents: 5, maxSessions: 8 });
    const maxAttempts = result.maxAttempts;
    if (maxAttempts === 0 || !result.series.some(s => s.points.some(p => p.y != null))) {
        plot.innerHTML = anEmptyHtml('Not enough completed submissions yet.',
            'The improvement trajectory appears once students have graded attempts.');
        if (card) {
            const legend = card.querySelector('#an-trajectory-legend');
            if (legend) legend.innerHTML = '';
        }
        return;
    }

    const viewW = 560, viewH = 260;
    const margin = { left: 40, right: 18, top: 18, bottom: 30 };
    const plotW = viewW - margin.left - margin.right;
    const plotH = viewH - margin.top - margin.bottom;
    const xMax = Math.max(maxAttempts - 1, 1);
    const xFor = linearScale([0, xMax], [margin.left, margin.left + plotW]);
    const yFor = linearScale([0, 100], [margin.top + plotH, margin.top]);
    const baseline = margin.top + plotH;

    const gridStops = [0, 25, 50, 75, 100];
    const grid = gridStops.map(v =>
        `<line x1="${margin.left}" y1="${yFor(v)}" x2="${margin.left + plotW}" y2="${yFor(v)}" class="an-grid-line"/>` +
        `<text x="${margin.left - 6}" y="${yFor(v) + 3}" text-anchor="end" class="an-axis-label">${v}</text>`
    ).join('');

    const palette = anChartPalette();
    const seriesHtml = result.series.map((s, i) => {
        const color = palette[i % palette.length];
        const segments = anSplitSegments(s.points);
        const linePaths = segments.map(seg => smoothPath(seg, xFor, yFor)).filter(Boolean).join('');
        const dots = s.points.map(p => p.y == null ? '' :
            `<circle tabindex="0" aria-label="${anAttr(s.name + ', attempt ' + (p.x + 1) + ', score ' + p.y + ', ' + p.date)}" data-name="${anAttr(s.name)}" data-x="${p.x}" data-y="${p.y}" data-date="${p.date}" data-score="${anAttr(p.score || '')}" cx="${xFor(p.x)}" cy="${yFor(p.y)}" r="4" class="an-series-dot" fill="${color}"/>`).join('');
        return `<g class="an-series" data-name="${anAttr(s.name)}">
            <path d="${linePaths}" class="an-trajectory-line" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/>
            ${dots}
        </g>`;
    }).join('');

    const classLine = result.classAverage.filter(p => p.y != null);
    const classPath = anSplitSegments(result.classAverage).map(segment => smoothPath(segment, xFor, yFor)).join(' ');
    const classDots = classLine.map(p => p.y == null ? '' :
        `<circle tabindex="0" role="button" data-x="${p.x}" data-y="${p.y}" aria-label="Class average, attempt ${p.x + 1}: ${p.y} percent" cx="${xFor(p.x)}" cy="${yFor(p.y)}" r="3" class="an-class-dot"/>`).join('');

    const xLabels = [];
    for (let x = 0; x < Math.min(maxAttempts, 8); x++) {
        xLabels.push(`<text x="${xFor(x)}" y="${baseline + 16}" text-anchor="middle" class="an-axis-label">#${x + 1}</text>`);
    }

    plot.innerHTML = `
        <svg class="an-svg an-trajectory-svg" viewBox="0 0 ${viewW} ${viewH}" role="img"
             aria-label="${anAttr(anTrajectoryAriaLabel(result, gridStops))}"
             preserveAspectRatio="xMidYMid meet">
            ${grid}
            ${classPath ? `<g class="an-class-series">
                <path d="${classPath}" fill="none" class="an-class-line" vector-effect="non-scaling-stroke"/>
                ${classDots}
            </g>` : ''}
            ${seriesHtml}
            ${xLabels}
        </svg>`;

    const legend = card ? card.querySelector('#an-trajectory-legend') : null;
    if (legend) {
        legend.innerHTML = result.series.map((s, i) => {
            const color = palette[i % palette.length];
            const first = s.points.find(p => p.y != null);
            const last = s.points.reduce((acc, p) => (p.y != null ? p : acc), null);
            const delta = (first && last) ? (last.y - first.y) : 0;
            const trend = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
            return `<button type="button" class="an-legend-chip" data-name="${anAttr(s.name)}" onfocus="setTrajectoryHighlight(this)" onblur="setTrajectoryHighlight(null)" onmouseenter="setTrajectoryHighlight(this)" onmouseleave="setTrajectoryHighlight(null)">
                <span class="an-legend-dot" style="background:${color}"></span>
                <span class="an-legend-name">${anEsc(s.name)}</span>
                <span class="an-legend-trend an-trend-${delta >= 0 ? 'up' : 'down'}">${trend}${delta != null ? Math.abs(delta) : 0}</span>
            </button>`;
        }).join('') +
        '<div class="an-legend-note">Dashed grey line = class average.</div>';
    }

    anTrajectoryAriaDescribe(result, card, gridStops);
    anBindTrajectoryInteractions(plot, card, result);
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
    const plot = $id('an-submissions-svg');
    if (!plot) return;
    const card = plot.closest('.an-chart-card');

    const series = buildSubmissionSeries(records || [], {
        monthVal: $id('filter-month')?.value ?? '',
        weekVal: $id('filter-week')?.value || '',
        dateVal: $id('filter-date')?.value || '',
        viewMode: $id('chart-view-mode')?.value || 'day'
    });

    const total = series.reduce((sum, b) => sum + b.count, 0);
    const totalEl = card ? card.querySelector('#an-submissions-total') : null;
    if (totalEl) totalEl.textContent = total + ' submissions in the charted period';

    if (series.length === 0 || total === 0) {
        plot.innerHTML = anEmptyHtml('No submissions match the selected period.',
            'Adjust the filters or check back after students submit.');
        if (card) {
            const legend = card.querySelector('#an-submissions-total');
            if (legend) legend.textContent = '0 submissions in the charted period';
        }
        return;
    }

    const viewW = 560, viewH = 260;
    const margin = { left: 40, right: 18, top: 18, bottom: 34 };
    const plotW = viewW - margin.left - margin.right;
    const plotH = viewH - margin.top - margin.bottom;
    const baseline = margin.top + plotH;

    const maxCount = series.reduce((m, b) => Math.max(m, b.count), 0);
    const yMax = niceCeil(maxCount);
    const yStep = yMax <= 6 ? 2 : yMax <= 12 ? 2 : Math.ceil(yMax / 6);
    const yTicks = [];
    for (let v = yMax; v >= 0; v -= yStep) yTicks.push(v);
    if (yTicks[yTicks.length - 1] !== 0) yTicks.push(0);

    const yFor = linearScale([0, yMax], [baseline, margin.top]);
    const xMax = Math.max(series.length - 1, 1);
    const xFor = linearScale([0, xMax], [margin.left, margin.left + plotW]);

    const grid = yTicks.map(v =>
        `<line x1="${margin.left}" y1="${yFor(v)}" x2="${margin.left + plotW}" y2="${yFor(v)}" class="an-grid-line"/>` +
        `<text x="${margin.left - 6}" y="${yFor(v) + 3}" text-anchor="end" class="an-axis-label">${v}</text>`
    ).join('');

    const points = series.map((b, i) => ({ x: i, y: b.count }));
    const linePath = smoothPath(points, xFor, yFor);
    const fillPath = areaPath(points, xFor, yFor, baseline);

    const barsForAria = series.map(b => `${b.sub} (${b.label}): ${b.count}`).join('; ');
    const xLabels = series.map((b, i) =>
        `<text x="${xFor(i)}" y="${baseline + 16}" text-anchor="middle" class="an-axis-label an-axis-label-x">${anEsc(b.sub)}</text>`
    ).join('');

    const dots = series.map((b, i) =>
        `<circle tabindex="0" role="button" aria-label="${anAttr(b.sub + ': ' + b.count + ' submissions; filter this period')}" data-label="${anAttr(b.label)}" data-sub="${anAttr(b.sub)}" data-count="${b.count}" data-key="${b.dateKey || ''}"`
        + ` cx="${xFor(i)}" cy="${yFor(b.count)}" r="4" class="an-area-dot" fill="var(--chart-1)"/>`).join('');

    plot.innerHTML = `
        <svg class="an-svg an-area-svg" viewBox="0 0 ${viewW} ${viewH}" role="img"
             aria-label="${anAttr('Area chart of submissions per period: ' + barsForAria)}"
             preserveAspectRatio="xMidYMid meet">
            <defs>
                <linearGradient id="an-area-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--chart-1)" stop-opacity="0.28"/>
                    <stop offset="100%" stop-color="var(--chart-1)" stop-opacity="0.02"/>
                </linearGradient>
            </defs>
            ${grid}
            <path d="${fillPath}" fill="url(#an-area-grad)"/>
            <path d="${linePath}" fill="none" class="an-area-line" vector-effect="non-scaling-stroke"/>
            ${dots}
            ${xLabels}
        </svg>`;

    anAreaAriaDescribe(card, total);
    anBindAreaInteractions(plot, card, series, points, xFor, yFor);
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
            'Error distribution appears once failing submissions are recorded.');
        const legend = card ? card.querySelector('#an-error-legend') : null;
        if (legend) legend.innerHTML = '<div class="an-legend-note">Clean code — no errors recorded.</div>';
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
