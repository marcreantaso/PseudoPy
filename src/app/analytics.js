/* ============================================================
   ANALYTICS (Instructor)
   ============================================================ */

let cachedInstructorActivity = [];
let currentFilteredActivity = [];
let analyticsCurrentPage = 1;
const analyticsPageSize = 5;

var analyticsUnsubscribe = null; // realtime subscription handle, also read by navigation.js
let analyticsLoadGeneration = 0;

function startAnalyticsRealtime() {
    if (analyticsUnsubscribe || currentUser?.role !== 'instructor') return;
    const owner = currentUser;
    const subscriptions = [];
    analyticsUnsubscribe = () => subscriptions.forEach(unsubscribe => unsubscribe());
    const changed = () => {
        if (currentUser !== owner || currentPage !== 'analytics') return;
        rebuildAnalyticsScope();
        applyAnalyticsFilters();
    };
    const failed = error => {
        console.error('[Analytics] Realtime subscription error:', error);
        setText('an-live-status', 'Live updates unavailable. Reopen Analytics to retry.');
    };
    subscriptions.push(subscribeCollection(activityRef, records => {
        if (currentUser !== owner || currentPage !== 'analytics') return;
        cachedActivity = records;
        changed();
    }, failed));
    subscriptions.push(subscribeCollection(usersRef, records => {
        if (currentUser !== owner || currentPage !== 'analytics') return;
        cachedUsers = records;
        changed();
    }, failed));
}

function stopAnalyticsRealtime() {
    analyticsLoadGeneration++;
    if (analyticsUnsubscribe) {
        analyticsUnsubscribe();
        analyticsUnsubscribe = null;
    }
}

function rebuildAnalyticsScope() {
    if (!currentUser || currentUser.role !== 'instructor') {
        cachedInstructorActivity = [];
        currentFilteredActivity = [];
        return;
    }
    const ownerIds = new Set([currentUser.id, currentUser._docId].filter(Boolean));
    const isDefaultInst = ownerIds.has('u2');
    const myStudents = cachedUsers.filter(u => u.role === 'student' && (
        ownerIds.has(u.instructorId) ||
        (isDefaultInst && (!u.instructorId || u.instructorId === 'u2'))
    ));
    const myStudentIds = new Set(myStudents.flatMap(s => [s.id, s._docId]).filter(Boolean));
    const myStudentEnrolledIds = new Set(myStudents.flatMap(s => [s.studentNumber, s.studentId]).filter(Boolean));
    const myStudentUsernames = new Set(myStudents.map(s => s.username).filter(Boolean));
    const myStudentNames = new Set(myStudents.map(s => s.fullName).filter(Boolean));

    cachedInstructorActivity = cachedActivity.filter(a => {
        if (a.instructorId) return ownerIds.has(a.instructorId);
        if (a.studentAccountId) return myStudentIds.has(a.studentAccountId);
        if (a.studentId) return myStudentIds.has(a.studentId) || myStudentEnrolledIds.has(a.studentId);
        if (a.username && myStudentUsernames.has(a.username)) return true;
        if (a.student && myStudentNames.has(a.student)) return true;
        return false;
    });

    currentFilteredActivity = [...cachedInstructorActivity];
}

async function loadAnalytics() {
    stopAnalyticsRealtime();
    const generation = analyticsLoadGeneration;
    const owner = currentUser;
    if (!owner || owner.role !== 'instructor') return;
    showAnalyticsLoading();
    try {
    const [activity, users] = await Promise.all([dbGetAll(activityRef), dbGetAll(usersRef)]);
    if (generation !== analyticsLoadGeneration || currentUser !== owner || currentPage !== 'analytics') return;
    cachedActivity = activity;
    cachedUsers = users;

    rebuildAnalyticsScope();

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
    startAnalyticsRealtime();
    } catch (error) {
        if (generation !== analyticsLoadGeneration || currentUser !== owner) return;
        console.error('[Analytics] Loading failed:', error);
        cachedInstructorActivity = [];
        currentFilteredActivity = [];
        updateAnalyticsUI();
        ['an-trajectory-svg', 'an-submissions-svg', 'an-error-svg'].forEach(id =>
            showChartError(id, 'Unable to load analytics. Reopen this page to retry.'));
    }
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

    const sourceActivity = cachedInstructorActivity;

    currentFilteredActivity = sourceActivity.filter(a => {
        const submissionDate = recordDate(a) || new Date(NaN);

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
            if (isNaN(submissionDate.getTime())) return false;
            const y = submissionDate.getFullYear();
            const m = String(submissionDate.getMonth() + 1).padStart(2, '0');
            const d = String(submissionDate.getDate()).padStart(2, '0');
            const localDateStr = `${y}-${m}-${d}`;
            if (localDateStr !== dateVal) return false;
        }

        // 3. Month (0-indexed)
        if (monthVal !== '') {
            if (isNaN(submissionDate.getTime())) return false;
            if (submissionDate.getMonth() !== parseInt(monthVal)) return false;
        }

        // 4. Week within month
        if (weekVal !== '') {
            if (isNaN(submissionDate.getTime())) return false;
            const dayNum = submissionDate.getDate();
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
    const ownerIds = new Set([currentUser?.id, currentUser?._docId].filter(Boolean));
    const isDefaultInst = ownerIds.has('u2');
    const myStudents = (cachedUsers || []).filter(u => u.role === 'student' && (
        ownerIds.has(u.instructorId) ||
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
    if (typeof renderAnalyticsCharts === 'function') renderAnalyticsCharts(currentFilteredActivity);

    // Render Paginated Table
    renderFilteredActivityTable(currentFilteredActivity);
    animateAnalyticsCards();
}

function analyticsPageNav(dir) {
    analyticsCurrentPage += dir;
    renderFilteredActivityTable(currentFilteredActivity);
}

function analyticsStudentNumber(record) {
    const student = (cachedUsers || []).find(user => user.role === 'student' && (
        [user.id, user._docId].filter(Boolean).includes(record.studentAccountId || record.studentId) ||
        (record.studentId && [user.studentNumber, user.studentId].includes(record.studentId)) ||
        (record.username && user.username === record.username)
    ));
    return student ? readStudentNumber(student) : readStudentNumber(record);
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
          <td class="an-cell-muted an-cell-mono">${anEsc(analyticsStudentNumber(a))}</td>
          <td class="an-cell-secondary">${a.exercise || '—'}</td>
          <td>${diffBadge(a.difficulty)}</td>
          <td>${anStatusBadge(a.status)}</td>
          <td class="an-cell-score" style="color:${scoreColor(a)}">${a.score || '—'}</td>
          <td class="an-cell-muted">${dateStr}</td>
          <td class="an-cell-muted">${a.processingTime || '—'}</td>
          <td>${resultBadge(a)}</td>
          <td>
                        <button class="an-eye-btn" title="View Details" aria-label="View details for ${docId}" onclick="viewSubmissionDetail('${docId}')">
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
    setText('sdm-student-id', analyticsStudentNumber(a));
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


