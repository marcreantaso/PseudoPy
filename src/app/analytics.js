/* ============================================================
   ANALYTICS (Instructor)
   ============================================================ */

let cachedInstructorActivity = [];
let currentFilteredActivity = [];
let analyticsCurrentPage = 1;
const analyticsPageSize = 5;

async function loadAnalytics() {
    cachedActivity = await refreshActivity();
    cachedUsers = await refreshUsers();
    cachedExercises = await refreshExercises();

    const isDefaultInst = !currentUser || currentUser.id === 'u2' || currentUser._docId === 'u2';
    const myStudents = cachedUsers.filter(u => u.role === 'student' && (
        u.instructorId === currentUser?.id ||
        u.instructorId === currentUser?._docId ||
        (isDefaultInst && (!u.instructorId || u.instructorId === 'u2'))
    ));
    const myExercises = cachedExercises.filter(e =>
        e.createdBy === currentUser?.id ||
        e.createdBy === currentUser?._docId ||
        e.instructorId === currentUser?.id ||
        e.instructorId === currentUser?._docId ||
        (isDefaultInst && (e._docId || '').startsWith('algo_'))
    );

    const myStudentIds = new Set(myStudents.map(s => s.id || s._docId));
    const myStudentEnrolledIds = new Set(myStudents.map(s => s.studentId).filter(Boolean));
    const myStudentUsernames = new Set(myStudents.map(s => s.username).filter(Boolean));
    const myStudentNames = new Set(myStudents.map(s => s.fullName).filter(Boolean));
    const myExerciseTitles = new Set(myExercises.map(e => e.title).filter(Boolean));

    cachedInstructorActivity = cachedActivity.filter(a => {
        if (a.instructorId && (a.instructorId === currentUser?.id || a.instructorId === currentUser?._docId)) return true;
        if (a.studentId && (myStudentIds.has(a.studentId) || myStudentEnrolledIds.has(a.studentId))) return true;
        if (a.username && myStudentUsernames.has(a.username)) return true;
        if (a.student && myStudentNames.has(a.student)) return true;
        if (a.exercise && myExerciseTitles.has(a.exercise)) return true;
        if (isDefaultInst && (a._docId || '').startsWith('act_sp_')) return true;
        return false;
    });

    if (!cachedInstructorActivity || cachedInstructorActivity.length === 0) {
        cachedInstructorActivity = typeof getInitialSeedActivity === 'function' ? getInitialSeedActivity() : [...cachedActivity];
    } else if (isDefaultInst && typeof getInitialSeedActivity === 'function') {
        // Always ensure the full rich demo activity is included for the default instructor
        const seedRecords = getInitialSeedActivity();
        const existingIds = new Set(cachedInstructorActivity.map(a => a._docId));
        const missingSeeds = seedRecords.filter(s => !existingIds.has(s._docId));
        if (missingSeeds.length > 0) {
            cachedInstructorActivity = [...cachedInstructorActivity, ...missingSeeds];
        }
    }

    currentFilteredActivity = [...cachedInstructorActivity];

    // Set default filter values
    const searchEl = $id('filter-search');
    const dateEl = $id('filter-date');
    const monthEl = $id('filter-month');
    const weekEl = $id('filter-week');
    const statusEl = $id('filter-submission');

    if (searchEl) searchEl.value = '';
    if (dateEl) dateEl.value = '';
    if (monthEl) monthEl.value = '';
    if (weekEl) weekEl.value = '';
    if (statusEl) statusEl.value = '';

    analyticsCurrentPage = 1;
    updateWeekDropdownLabels();
    applyAnalyticsFilters();
}

function analyticsGoToPage(pageNum) {
    analyticsCurrentPage = pageNum;
    renderFilteredActivityTable(currentFilteredActivity);
}

function updateWeekDropdownLabels() {
    const monthSelect = $id('filter-month');
    const weekSelect = $id('filter-week');
    if (!weekSelect) return;

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const selectedMonth = monthSelect && monthSelect.value !== '' ? parseInt(monthSelect.value) : new Date().getMonth();
    const mName = monthNames[selectedMonth] || 'Aug';

    const currentVal = weekSelect.value || '';
    weekSelect.innerHTML = `
        <option value="">All Weeks</option>
        <option value="1">Week 1 (${mName} 1 – ${mName} 3)</option>
        <option value="2">Week 2 (${mName} 4 – ${mName} 10)</option>
        <option value="3">Week 3 (${mName} 11 – ${mName} 17)</option>
        <option value="4">Week 4 (${mName} 18 – ${mName} 24)</option>
        <option value="5">Week 5 (${mName} 25 – ${mName} 31)</option>
    `;
    weekSelect.value = currentVal;
}

function applyAnalyticsFilters() {
    const searchVal = ($id('filter-search')?.value || '').toLowerCase().trim();
    const dateVal = $id('filter-date')?.value || '';
    const monthVal = $id('filter-month')?.value ?? '';
    const weekVal = $id('filter-week')?.value || '';
    const submissionVal = $id('filter-submission')?.value || '';

    updateWeekDropdownLabels();

    const sourceActivity = cachedInstructorActivity && cachedInstructorActivity.length ? cachedInstructorActivity : cachedActivity;

    currentFilteredActivity = sourceActivity.filter(a => {
        const recordDate = new Date(a.timestamp || a.time);

        // 1. Search — student name, exercise title, student ID, submission ID, username, email
        if (searchVal) {
            const haystack = [
                (a.student || '').toLowerCase(),
                (a.exercise || '').toLowerCase(),
                (a.studentId || '').toLowerCase(),
                (a._docId || '').toLowerCase(),
                (a.username || '').toLowerCase(),
                (a.email || '').toLowerCase()
            ].join(' ');
            if (!haystack.includes(searchVal)) return false;
        }

        // 2. Specific date (YYYY-MM-DD from input[type=date])
        if (dateVal) {
            if (isNaN(recordDate.getTime())) return false;
            const y = recordDate.getFullYear();
            const m = String(recordDate.getMonth() + 1).padStart(2, '0');
            const d = String(recordDate.getDate()).padStart(2, '0');
            const localDateStr = `${y}-${m}-${d}`;
            if (localDateStr !== dateVal) return false;
        }

        // 3. Month (0-indexed)
        if (monthVal !== '') {
            if (isNaN(recordDate.getTime())) return false;
            if (recordDate.getMonth() !== parseInt(monthVal)) return false;
        }

        // 4. Week within month
        if (weekVal !== '') {
            if (isNaN(recordDate.getTime())) return false;
            const dayNum = recordDate.getDate();
            let week = 1;
            if (dayNum >= 4 && dayNum <= 10) week = 2;
            else if (dayNum >= 11 && dayNum <= 17) week = 3;
            else if (dayNum >= 18 && dayNum <= 24) week = 4;
            else if (dayNum > 24) week = 5;

            if (week !== parseInt(weekVal)) return false;
        }

        // 5. Submission status
        if (submissionVal) {
            const normStatus = a.status === 'In Progress' ? 'Pending' : a.status;
            const targetStatus = submissionVal === 'In Progress' ? 'Pending' : submissionVal;
            if (normStatus !== targetStatus && a.status !== submissionVal) return false;
        }

        return true;
    });

    // Update activity chart subtitle label dynamically
    const subLabel = $id('an-chart-sub-label');
    if (subLabel) {
        const weekLabels = {
            '1': 'Week 1 (days 1–3)', '2': 'Week 2 (days 4–10)',
            '3': 'Week 3 (days 11–17)', '4': 'Week 4 (days 18–24)', '5': 'Week 5 (days 25–31)'
        };
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const mIdx = monthVal !== '' ? parseInt(monthVal) : -1;
        const mName = mIdx >= 0 ? monthNames[mIdx] : '';
        if (weekVal && mName) {
            subLabel.textContent = `Shows student submissions for ${mName} ${weekLabels[weekVal] || 'Week ' + weekVal}.`;
        } else if (weekVal) {
            subLabel.textContent = `Shows student submissions for ${weekLabels[weekVal] || 'Week ' + weekVal}.`;
        } else if (mName) {
            subLabel.textContent = `Shows student submissions for ${mName}.`;
        } else if (dateVal) {
            subLabel.textContent = `Shows student submissions for the selected date.`;
        } else {
            subLabel.textContent = 'Shows the number of student submissions based on selected filters.';
        }
    }

    analyticsCurrentPage = 1;
    updateAnalyticsUI();
}

function resetAnalyticsFilters() {
    ['filter-search', 'filter-date', 'filter-month', 'filter-week', 'filter-submission'].forEach(id => {
        const el = $id(id);
        if (el) el.value = '';
    });
    updateWeekDropdownLabels();
    currentFilteredActivity = [...cachedInstructorActivity];
    analyticsCurrentPage = 1;
    updateAnalyticsUI();
}

function updateAnalyticsUI() {
    const total = currentFilteredActivity.length;

    // Stat Cards
    const isDefaultInst = !currentUser || currentUser.id === 'u2' || currentUser._docId === 'u2';
    const myStudents = (cachedUsers || []).filter(u => u.role === 'student' && (
        u.instructorId === currentUser?.id ||
        u.instructorId === currentUser?._docId ||
        (isDefaultInst && (!u.instructorId || u.instructorId === 'u2'))
    ));
    const activeStudents = myStudents.filter(u => u.status === 'active');

    setText('stat-students', String(activeStudents.length));
    setText('stat-submissions', String(total));

    const completed = currentFilteredActivity.filter(a => a.status === 'Completed').length;
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    setText('stat-success-rate', successRate + '%');

    const errCount = currentFilteredActivity.filter(a => a.errorType && a.errorType.trim() !== '').length;
    setText('stat-common-errors', String(errCount));

    // Dynamic Trend Elements
    const stuTrend = $id('stat-students-trend');
    if (stuTrend) {
        stuTrend.innerHTML = activeStudents.length > 0
            ? `<span class="positive">${activeStudents.length} Active</span> <span style="opacity:0.5;font-size:0.65rem;color:var(--text-muted)">enrolled</span>`
            : `<span class="neutral">0 Active</span> <span style="opacity:0.5;font-size:0.65rem;color:var(--text-muted)">enrolled</span>`;
    }
    const subTrend = $id('stat-submissions-trend');
    if (subTrend) {
        subTrend.innerHTML = total > 0
            ? `<span class="positive">${total} total</span> <span style="opacity:0.5;font-size:0.65rem;color:var(--text-muted)">evaluated</span>`
            : `<span class="neutral">0</span> <span style="opacity:0.5;font-size:0.65rem;color:var(--text-muted)">submissions</span>`;
    }
    const succTrend = $id('stat-success-trend');
    if (succTrend) {
        succTrend.innerHTML = total > 0
            ? `<span class="positive">${completed} completed</span> <span style="opacity:0.5;font-size:0.65rem;color:var(--text-muted)">of ${total}</span>`
            : `<span class="neutral">—</span> <span style="opacity:0.5;font-size:0.65rem;color:var(--text-muted)">no submissions</span>`;
    }
    const errTrend = $id('stat-errors-trend');
    if (errTrend) {
        errTrend.innerHTML = errCount > 0
            ? `<span class="negative">${errCount} error${errCount !== 1 ? 's' : ''}</span> <span style="opacity:0.5;font-size:0.65rem;color:var(--text-muted)">recorded</span>`
            : `<span class="positive">0 errors</span> <span style="opacity:0.5;font-size:0.65rem;color:var(--text-muted)">clean code</span>`;
    }

    // Record count label
    const countLabel = $id('activity-count-label');
    if (countLabel) countLabel.textContent = total === 0 ? 'No records' : `${total} record${total !== 1 ? 's' : ''}`;

    // Render Charts
    renderSubmissionActivityChart(currentFilteredActivity);
    renderErrorDistributionChart(currentFilteredActivity);

    // Render Paginated Table
    renderFilteredActivityTable(currentFilteredActivity);
    animateAnalyticsCards();
}

function renderSubmissionActivityChart(filteredActivity) {
    const container = $id('chart-submissions');
    const yAxisContainer = $id('an-bar-y-axis');
    const tooltip = $id('an-bar-tooltip');
    if (!container) return;

    // --- Determine chart period dynamically from filters ---
    const monthVal = $id('filter-month')?.value ?? '';
    const weekVal = $id('filter-week')?.value || '';
    const dateVal = $id('filter-date')?.value || '';
    const viewMode = $id('chart-view-mode')?.value || 'day';

    // Group all filtered activity by date
    const dateMap = {};
    filteredActivity.forEach(a => {
        const d = new Date(a.timestamp || a.time);
        if (isNaN(d.getTime())) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!dateMap[key]) dateMap[key] = [];
        dateMap[key].push(a);
    });

    // Derive the chart year from the actual data so bar date keys always
    // line up with the stamped submission dates (not a hardcoded year).
    let chartYear = new Date().getFullYear();
    const chartYears = Object.keys(dateMap).map(k => parseInt(k.split('-')[0], 10)).filter(y => !isNaN(y));
    if (chartYears.length > 0) chartYear = Math.max(...chartYears);

    // Build chart columns based on selected filter context
    let weekDays = [];

    if (viewMode === 'month' || (monthVal !== '' && !weekVal)) {
        // Monthly view: show each week as a bar
        const mIdx = monthVal !== '' ? parseInt(monthVal) : new Date().getMonth();
        const year = chartYear;
        const mName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mIdx];
        const weekRanges = [
            { label: 'Wk 1', start: 1, end: 3, w: 1 },
            { label: 'Wk 2', start: 4, end: 10, w: 2 },
            { label: 'Wk 3', start: 11, end: 17, w: 3 },
            { label: 'Wk 4', start: 18, end: 24, w: 4 },
            { label: 'Wk 5', start: 25, end: 31, w: 5 }
        ];
        weekDays = weekRanges.map(r => {
            let count = 0;
            for (let d = r.start; d <= r.end; d++) {
                const key = `${year}-${String(mIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                count += (dateMap[key] || []).length;
            }
            return { label: r.label, sub: `${mName} ${r.start}–${r.end}`, dateKey: null, weekRange: r, count, active: weekVal === String(r.w) };
        });
    } else {
        // Default: daily view for selected week (or show last 7 unique days if no week)
        let startDay = 4, year = chartYear, mIdx = 7; // default Aug Week 2
        if (monthVal !== '') mIdx = parseInt(monthVal);
        if (weekVal === '1') startDay = 1;
        else if (weekVal === '2') startDay = 4;
        else if (weekVal === '3') startDay = 11;
        else if (weekVal === '4') startDay = 18;
        else if (weekVal === '5') startDay = 25;
        else if (!weekVal && monthVal === '') {
            // No filter: show the 7 contiguous days ending at the most recent date with data
            const allDates = Object.keys(dateMap).sort();
            if (allDates.length > 0) {
                // Find the most recent date, then show 7 days ending there
                const latestDate = new Date(allDates[allDates.length - 1]);
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const monNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                for (let i = 6; i >= 0; i--) {
                    const d = new Date(latestDate);
                    d.setDate(latestDate.getDate() - i);
                    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    weekDays.push({
                        label: dayNames[d.getDay()],
                        sub: `${monNames[d.getMonth()]} ${d.getDate()}`,
                        dateKey: key,
                        count: (dateMap[key] || []).length,
                        active: false
                    });
                }
            }
        }

        if (weekDays.length === 0) {
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const mName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mIdx];
            for (let i = 0; i < 7; i++) {
                const day = startDay + i;
                const key = `${year}-${String(mIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const d = new Date(key);
                weekDays.push({
                    label: dayNames[d.getDay()],
                    sub: `${mName} ${day}`,
                    dateKey: key,
                    count: (dateMap[key] || []).length,
                    active: dateVal === key
                });
            }
        }
    }

    const dayCounts = weekDays.map(w => w.count !== undefined ? w.count : (dateMap[w.dateKey] || []).length);
    const maxVal = Math.max(...dayCounts, 1);
    const yMax = maxVal <= 5 ? 6 : maxVal <= 10 ? 12 : Math.ceil(maxVal * 1.2);
    const yStep = yMax <= 6 ? 2 : yMax <= 12 ? 2 : Math.ceil(yMax / 6);
    const yLabels = [];
    for (let v = yMax; v >= 0; v -= yStep) yLabels.push(v);
    if (yLabels[yLabels.length - 1] !== 0) yLabels.push(0);

    if (yAxisContainer) {
        yAxisContainer.innerHTML = yLabels.map(v => `<span>${v}</span>`).join('');
    }

    container.innerHTML = weekDays.map((w, idx) => {
        const count = w.count !== undefined ? w.count : (dateMap[w.dateKey] || []).length;
        const heightPct = Math.max((count / yMax) * 100, 3);
        const isHighlighted = w.active;
        return `
            <div class="an-bar-col ${isHighlighted ? 'highlighted' : ''}" data-key="${w.dateKey || ''}" data-idx="${idx}">
                <span class="an-bar-val">${count}</span>
                <div class="an-bar-inner" style="height:${heightPct}%"></div>
                <span class="an-bar-lbl">${w.label}<br><span style="font-size:0.62rem;opacity:0.75">${w.sub}</span></span>
            </div>
        `;
    }).join('');

    animateAnalyticsCharts();

    // Attach Hover and Click Handlers
    container.querySelectorAll('.an-bar-col').forEach((col, idx) => {
        const key = col.getAttribute('data-key');
        const w = weekDays[idx];
        const items = key ? (dateMap[key] || []) : [];

        col.addEventListener('mouseenter', () => {
            if (!tooltip) return;
            const completedCount = items.filter(i => i.status === 'Completed').length;
            const pendingCount = items.filter(i => i.status === 'Pending').length;
            const failedCount = items.filter(i => i.status === 'Failed').length;
            const totalCount = w.count !== undefined ? w.count : items.length;
            const studentNames = Array.from(new Set(items.map(i => i.student))).slice(0, 3);

            const headerText = key
                ? new Date(key + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
                : (w.sub || w.label);

            tooltip.innerHTML = `
                <div class="an-tt-header">${headerText}</div>
                <div class="an-tt-row"><span style="color:#60a5fa;font-weight:700">${totalCount} Submission${totalCount !== 1 ? 's' : ''}</span></div>
                <div class="an-tt-row"><span>Completed:</span> <strong style="color:#34d399">${completedCount}</strong></div>
                <div class="an-tt-row"><span>Pending:</span> <strong style="color:#fbbf24">${pendingCount}</strong></div>
                <div class="an-tt-row"><span>Failed:</span> <strong style="color:#f87171">${failedCount}</strong></div>
                ${studentNames.length > 0 ? `<div class="an-tt-students"><div class="an-tt-st-head">Top Students:</div><div class="an-tt-st-list">• ${studentNames.join('<br>• ')}</div></div>` : ''}
                <div style="font-size:0.68rem;color:#94a3b8;margin-top:0.4rem;font-style:italic">Click to filter table by this period</div>
            `;
            tooltip.classList.remove('hidden');
        });

        col.addEventListener('mousemove', (e) => {
            if (!tooltip) return;
            const cardRect = container.closest('.an-chart-card').getBoundingClientRect();
            tooltip.style.left = `${Math.max(8, Math.min(e.clientX - cardRect.left + 10, cardRect.width - tooltip.offsetWidth - 8))}px`;
            tooltip.style.top = `${Math.max(e.clientY - cardRect.top - 130, 10)}px`;
        });

        col.addEventListener('mouseleave', () => { if (tooltip) tooltip.classList.add('hidden'); });

        col.addEventListener('click', () => {
            if (tooltip) tooltip.classList.add('hidden');
            if (key) {
                const dateInput = $id('filter-date');
                if (dateInput) { dateInput.value = key; applyAnalyticsFilters(); }
                $qs('.an-table-card')?.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}

function renderErrorDistributionChart(filteredActivity) {
    const chart = $id('an-donut-chart');
    const legend = $id('an-donut-legend');
    const totalEl = $id('an-donut-total');
    if (!chart || !legend) return;

    // Count actual error types from real filtered data
    const errorColorMap = {
        'Syntax Error': '#ef4444',
        'Logic Error': '#f59e0b',
        'Missing END': '#f97316',
        'Indentation Error': '#10b981',
        'Type Error': '#3b82f6',
        'Other': '#8b5cf6'
    };
    const knownTypes = Object.keys(errorColorMap);
    const counts = {};
    knownTypes.forEach(t => counts[t] = 0);

    filteredActivity.forEach(a => {
        if (!a.errorType || a.errorType.trim() === '') return;
        const t = a.errorType.trim();
        if (counts[t] !== undefined) counts[t]++;
        else counts['Other']++;
    });

    const totalErrors = Object.values(counts).reduce((s, v) => s + v, 0);

    // If no errors in filtered set, show a neutral grey ring
    if (totalErrors === 0) {
        if (totalEl) totalEl.textContent = '0';
        chart.style.background = '#1e1e2e';
        legend.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem;padding:0.5rem">No errors in selected period.</div>`;
        return;
    }

    if (totalEl) totalEl.textContent = totalErrors;

    const categories = knownTypes
        .filter(t => counts[t] > 0)
        .map(t => ({
            name: t,
            color: errorColorMap[t],
            count: counts[t],
            pct: Math.round((counts[t] / totalErrors) * 100)
        }));

    // Adjust rounding so percentages sum to 100
    const pctSum = categories.reduce((s, c) => s + c.pct, 0);
    if (pctSum !== 100 && categories.length > 0) {
        categories[0].pct += (100 - pctSum);
    }

    let currentDeg = 0;
    const gradientStops = [];
    const legendItemsHtml = [];

    categories.forEach(cat => {
        const deg = (cat.pct / 100) * 360;
        const nextDeg = currentDeg + deg;
        gradientStops.push(`${cat.color} ${currentDeg.toFixed(1)}deg ${nextDeg.toFixed(1)}deg`);
        currentDeg = nextDeg;
        legendItemsHtml.push(`
            <div class="an-donut-item">
                <div class="an-donut-dot-wrap">
                    <span class="an-donut-dot" style="background:${cat.color}"></span>
                    <span style="font-size:0.8rem;color:var(--text-secondary)">${cat.name}</span>
                </div>
                <span class="an-donut-val" style="font-size:0.8rem;font-weight:700;color:var(--text-primary)">${cat.pct}% <span style="font-weight:400;color:var(--text-muted)">(${cat.count})</span></span>
            </div>
        `);
    });

    chart.style.background = `conic-gradient(${gradientStops.join(', ')})`;
    legend.innerHTML = legendItemsHtml.join('');
}

function analyticsPageNav(dir) {
    analyticsCurrentPage += dir;
    renderFilteredActivityTable(currentFilteredActivity);
}

function renderFilteredActivityTable(activityList) {
    const tbody = $id('activity-table-body');
    const pageInfo = $id('an-page-info');
    const prevBtn = $id('an-prev-btn');
    const nextBtn = $id('an-next-btn');
    const pageNumbers = $id('an-page-numbers');
    if (!tbody) return;

    const totalRecords = activityList.length;

    if (totalRecords === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:2.5rem;color:var(--text-muted)">
            <div class="analytics-empty-icon"><i data-lucide="chart-column" aria-hidden="true"></i></div>
            No matching student submissions found for the selected filters.
        </td></tr>`;
        if (pageInfo) pageInfo.textContent = 'Showing 0 of 0 results';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        if (pageNumbers) pageNumbers.innerHTML = '';
        refreshIcons(tbody);
        return;
    }

    const totalPages = Math.ceil(totalRecords / analyticsPageSize);
    if (analyticsCurrentPage > totalPages) analyticsCurrentPage = totalPages;
    if (analyticsCurrentPage < 1) analyticsCurrentPage = 1;

    const startIndex = (analyticsCurrentPage - 1) * analyticsPageSize;
    const endIndex = Math.min(startIndex + analyticsPageSize, totalRecords);
    const pageRecords = activityList.slice(startIndex, endIndex);

    if (pageInfo) pageInfo.textContent = `Showing ${startIndex + 1} to ${endIndex} of ${totalRecords} results`;
    if (prevBtn) prevBtn.disabled = analyticsCurrentPage === 1;
    if (nextBtn) nextBtn.disabled = analyticsCurrentPage === totalPages;

    if (pageNumbers) {
        let numHtml = '';
        for (let i = 1; i <= Math.min(totalPages, 5); i++) {
            numHtml += `<button class="an-page-num-btn ${i === analyticsCurrentPage ? 'active' : ''}" onclick="analyticsGoToPage(${i})">${i}</button>`;
        }
        pageNumbers.innerHTML = numHtml;
    }

    const anStatusBadge = s => {
        const norm = (s || '').toLowerCase();
        if (norm === 'completed') return `<span class="badge-status badge-completed">Completed</span>`;
        if (norm === 'failed') return `<span class="badge-status badge-failed">Failed</span>`;
        if (norm === 'revision requested') return `<span class="badge-status badge-pending">Revision Requested</span>`;
        return `<span class="badge-status badge-pending">Pending</span>`;
    };

    const diffBadge = d => {
        const v = (d || 'moderate').toLowerCase();
        if (v === 'easy') return `<span class="badge-diff badge-easy">Easy</span>`;
        if (v === 'hard') return `<span class="badge-diff badge-hard">Hard</span>`;
        // 'medium' and 'moderate' both display as Moderate
        return `<span class="badge-diff badge-moderate">Moderate</span>`;
    };

    const resultBadge = a => {
        const res = a.result || (a.status === 'Completed' ? 'Success' : a.errorType || 'Pending');
        if (res === 'Success' || res === 'Pass') return `<span class="badge-result badge-result-success">Success</span>`;
        if (res.includes('Syntax')) return `<span class="badge-result badge-result-syntax">Syntax Error</span>`;
        if (res.includes('Logic')) return `<span class="badge-result badge-result-logic">Logic Error</span>`;
        if (res.includes('Runtime')) return `<span class="badge-result badge-result-runtime">Runtime Error</span>`;
        if (res === 'Pending') return `<span class="badge-result badge-result-pending">Pending</span>`;
        return `<span class="badge-result badge-result-syntax">${res}</span>`;
    };

    const scoreColor = a => {
        if (a.status === 'Completed') return 'var(--success)';
        if (a.status === 'Failed') return 'var(--danger)';
        return 'var(--text-muted)';
    };

    tbody.innerHTML = pageRecords.map(a => {
        const d = new Date(a.timestamp || a.time);
        const dateStr = !isNaN(d.getTime())
            ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
            '  ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
            : (a.time || '—');

        const docId = (a._docId || '').replace(/'/g, "\\'");

        return `
        <tr>
          <td>
            <div class="an-user-cell">
              <div class="an-avatar-sm">{{ui:UserRound}}</div>
              <span class="an-user-name">${a.student || '—'}</span>
            </div>
          </td>
          <td class="an-cell-muted an-cell-mono">${a.studentId || '—'}</td>
          <td class="an-cell-secondary">${a.exercise || '—'}</td>
          <td>${diffBadge(a.difficulty)}</td>
          <td>${anStatusBadge(a.status)}</td>
          <td class="an-cell-score" style="color:${scoreColor(a)}">${a.score || '—'}</td>
          <td class="an-cell-muted">${dateStr}</td>
          <td class="an-cell-muted">${a.processingTime || '—'}</td>
          <td>${resultBadge(a)}</td>
          <td>
                        <button class="an-eye-btn" title="View Details" onclick="viewSubmissionDetail('${docId}')">
                            <i data-lucide="eye" aria-hidden="true"></i>
            </button>
          </td>
        </tr>`;
    }).join('');
    refreshIcons(tbody);
}

let activeSubmissionDetailId = null;
let pendingResubmissionId = null;

function viewSubmissionDetail(docId) {
    activeSubmissionDetailId = docId;
    const a = cachedActivity.find(x => x._docId === docId);
    if (!a) { showToast('Record not found.', 'error'); return; }

    const d = new Date(a.timestamp || a.time);
    const dateStr = !isNaN(d.getTime())
        ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) +
        ' at ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : (a.time || '—');

    // Info fields
    setText('sdm-student', a.student || '—');
    setText('sdm-student-id', a.studentId || '—');
    setText('sdm-exercise', a.exercise || '—');
    setText('sdm-date', dateStr);
    setText('sdm-proc-time', a.processingTime || '—');
    setText('sdm-score', a.score || '—');

    // Difficulty badge
    const diff = (a.difficulty || 'moderate').toLowerCase();
    const dColor = diff === 'easy' ? 'var(--success)' : diff === 'hard' ? 'var(--danger)' : 'var(--warning)';
    setHtml('sdm-difficulty', `<span style="font-weight:600;color:${dColor};text-transform:capitalize">${diff.charAt(0).toUpperCase() + diff.slice(1)}</span>`);

    // Status badge
    const statusBadges = {
        'Completed': '<span class="badge badge-active">Completed</span>',
        'In Progress': '<span class="badge badge-student">In Progress</span>',
        'Failed': '<span class="badge badge-inactive">Failed</span>',
        'Revision Requested': '<span class="badge badge-warning">Revision Requested</span>',
    };
    setHtml('sdm-status', statusBadges[a.status] || `<span class="badge">${a.status}</span>`);

    // Score colour
    const scoreEl = $id('sdm-score');
    if (scoreEl) {
        if (a.status === 'Completed') scoreEl.style.color = 'var(--success)';
        else if (a.status === 'Failed') scoreEl.style.color = 'var(--danger)';
        else scoreEl.style.color = 'var(--text-muted)';
    }

    // Error row
    const errRow = $id('sdm-error-row');
    if (a.errorType) {
        setText('sdm-error-type', a.errorType);
        if (errRow) errRow.style.display = 'block';
    } else {
        if (errRow) errRow.style.display = 'none';
    }

    // Code panels
    setText('sdm-pseudo', a.submittedCode || a.pseudocode || '(No pseudocode recorded)');
    setText('sdm-python', a.pythonCode || a.python_code || '(No Python output recorded)');

    // Compiler output panel (if present)
    const outputEl = $id('sdm-output');
    if (outputEl) {
        outputEl.textContent = a.output || a.compilerOutput || (a.status === 'Completed' ? 'Execution successful.' : a.errorType ? `Error: ${a.errorType} during compilation.` : '(No output recorded)');
    }

    const requestButton = $id('sdm-request-resubmit');
    if (requestButton) {
        const ownsSubmission = currentUser?.role === 'instructor' &&
            (!a.instructorId || a.instructorId === currentUser.id || a.instructorId === currentUser._docId);
        requestButton.classList.toggle('hidden', !ownsSubmission || a.status === 'Revision Requested');
        requestButton.disabled = false;
    }

    // Modal title
    const title = $id('sdm-title');
    if (title) title.innerHTML = `${icon('file-text')} ${a.student} — ${a.exercise}`;

    const modal = $id('submission-detail-modal');
    if (modal) {
        modal.classList.remove('hidden');
        refreshIcons(modal);
    }
}

function requestResubmission(docId = activeSubmissionDetailId) {
    if (!docId || currentUser?.role !== 'instructor') return;
    const a = cachedActivity.find(x => x._docId === docId);
    if (!a) { showToast('Submission not found.', 'error'); return; }
    pendingResubmissionId = docId;
    const feedback = $id('resubmission-feedback');
    const error = $id('resubmission-feedback-error');
    if (feedback) feedback.value = '';
    setText('resubmission-feedback-count', '0');
    if (error) error.classList.add('hidden');
    const modal = $id('resubmission-request-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => feedback?.focus(), 0);
}

function closeResubmissionRequest() {
    const modal = $id('resubmission-request-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    }
    pendingResubmissionId = null;
}

async function confirmResubmissionRequest() {
    const docId = pendingResubmissionId;
    if (!docId || currentUser?.role !== 'instructor') return;
    const a = cachedActivity.find(x => x._docId === docId) || await dbGet(activityRef, docId);
    if (!a) { closeResubmissionRequest(); showToast('Submission not found.', 'error'); return; }

    const feedbackEl = $id('resubmission-feedback');
    const errorEl = $id('resubmission-feedback-error');
    const feedback = (feedbackEl?.value || '').trim();
    if (feedback.length > 1000) {
        if (errorEl) {
            errorEl.textContent = 'Feedback must be 1,000 characters or fewer.';
            errorEl.classList.remove('hidden');
        }
        feedbackEl?.focus();
        return;
    }

    const confirmButton = $id('confirm-resubmission-btn');
    if (confirmButton) {
        confirmButton.disabled = true;
        confirmButton.textContent = 'Sending…';
    }
    try {
        const now = new Date().toISOString();
        const instructorId = currentUser._docId || currentUser.id;
        await dbUpdate(activityRef, docId, {
            status: 'Revision Requested',
            reviewStatus: 'revision_requested',
            revisionRequestedAt: now,
            requestedBy: instructorId,
            requestedByName: currentUser.fullName,
            feedback
        });

        const notificationId = 'notif_revision_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        await dbSet(notificationsRef, notificationId, {
            _docId: notificationId,
            studentId: a.studentId || a.studentAccountId,
            accountId: a.studentAccountId || a.studentId,
            exerciseId: a.exerciseId || null,
            submissionId: a._docId,
            exerciseTitle: a.exercise || 'Exercise',
            title: 'Resubmission Requested',
            message: feedback || 'Your instructor requested that you revise and resubmit this activity.',
            type: 'resubmission_requested',
            isRead: false,
            createdAt: now
        });

        const cached = cachedActivity.find(x => x._docId === docId);
        if (cached) Object.assign(cached, {
            status: 'Revision Requested',
            reviewStatus: 'revision_requested',
            feedback,
            revisionRequestedAt: now
        });
        closeResubmissionRequest();
        closeSubmissionDetail();
        showToast('Resubmission requested. The student has been notified.', 'success');
        if (typeof loadAnalytics === 'function') await loadAnalytics();
    } catch (error) {
        console.error('[Review] Resubmission request failed:', error);
        showToast('Unable to request resubmission.', 'error');
    } finally {
        if (confirmButton) {
            confirmButton.disabled = false;
            confirmButton.textContent = 'Request Resubmission';
        }
    }
}

function closeSubmissionDetail() {
    hide('submission-detail-modal');
}

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$id('resubmission-request-modal')?.classList.contains('hidden')) {
        event.preventDefault();
        closeResubmissionRequest();
    }
});


