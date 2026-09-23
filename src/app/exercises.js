/* ============================================================
   EXERCISES MANAGEMENT — Offline Database CRUD
   ============================================================ */

// ── Difficulty normalization (single source of truth) ────────
function normDiff(d) {
    const v = (d || 'moderate').toLowerCase();
    return v === 'medium' ? 'moderate' : v;
}
function dispDiff(d) {
    const v = normDiff(d);
    return v.charAt(0).toUpperCase() + v.slice(1);
}

async function loadExercises(append = false) {
    if (!append) instructorExOffset = 0;
    const allExercises = await refreshExercises();
    const isDefaultInst = !currentUser || currentUser.id === 'u2' || currentUser._docId === 'u2';
    const instructorExercises = allExercises.filter(e =>
        e.createdBy === currentUser?.id ||
        e.createdBy === currentUser?._docId ||
        e.instructorId === currentUser?.id ||
        e.instructorId === currentUser?._docId ||
        (isDefaultInst && (e._docId || '').startsWith('algo_'))
    );
    const totalCount = instructorExercises.length;
    const easyCount = instructorExercises.filter(e => normDiff(e.difficulty) === 'easy').length;
    const modCount = instructorExercises.filter(e => normDiff(e.difficulty) === 'moderate').length;
    const hardCount = instructorExercises.filter(e => normDiff(e.difficulty) === 'hard').length;

    setText('stat-exercise-total', String(totalCount));
    setText('stat-exercise-easy', String(easyCount));
    setText('stat-exercise-moderate', String(modCount));
    setText('stat-exercise-hard', String(hardCount));
    setText('stat-exercise-count-label', totalCount === 0 ? 'No exercises' : `${totalCount} exercise${totalCount !== 1 ? 's' : ''}`);
    refreshIcons($id('page-manage-exercises'));

    const tbody = $id('exercises-table-body');
    if (!tbody) return;

    const exercises = append
        ? instructorExercises.slice(instructorExOffset, instructorExOffset + EX_PAGE_LIMIT)
        : instructorExercises.slice(0, EX_PAGE_LIMIT);

    if (exercises.length === 0 && !append) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2.5rem;color:var(--text-muted)"><div style="font-size:2rem">{{ui:ClipboardList}}</div><div style="margin-top:0.5rem;font-weight:600">No Exercises Yet</div><div style="font-size:0.85rem">Click <strong>Add Exercise</strong> to get started.</div></td></tr>`;
        return;
    }

    const rows = exercises.map(ex => {
        const title = ex.title || ex.concept || 'Untitled Exercise';
        const desc = ex.description || 'No description.';
        const diff = normDiff(ex.difficulty);
        const date = ex.createdAt || '—';
        return `
        <tr>
          <td style="font-weight:600;color:var(--text-primary)">${title}</td>
          <td style="color:var(--text-secondary);max-width:280px">
            <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px" title="${desc}">${desc}</div>
          </td>
          <td><span class="ex-difficulty ${diff}">${dispDiff(ex.difficulty)}</span></td>
          <td style="color:var(--text-muted);font-size:0.83rem">${date}</td>
          <td>
            <div style="display:flex;gap:0.5rem">
              <button class="btn btn-ghost btn-sm" onclick="editExercise('${ex._docId}')" title="Edit">{{ui:Pencil}} Edit</button>
              <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteExercise('${ex._docId}')" title="Delete">{{ui:Trash2}} Delete</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    if (append) {
        const loadRow = $id('exercises-load-more-row');
        if (loadRow) loadRow.remove();
        tbody.insertAdjacentHTML('beforeend', rows);
    } else {
        tbody.innerHTML = rows;
    }

    if (instructorExercises.length > instructorExOffset + EX_PAGE_LIMIT) {
        instructorExOffset += EX_PAGE_LIMIT;
        tbody.insertAdjacentHTML('beforeend',
            `<tr id="exercises-load-more-row"><td colspan="5" style="text-align:center;padding:1rem">
              <button class="btn btn-secondary" onclick="loadExercises(true)">Load More</button>
             </td></tr>`);
    }
}

let studentExCurrentPage = 1;
const STUDENT_EX_PER_PAGE = 8;

/**
 * getExerciseIconInfo(ex)
 * Automatically determines appropriate icon SVG & background color based on title/category/concept/desc keywords.
 */
function getExerciseIconInfo(ex) {
    const title = ex.title || ex.concept || '';
    const desc = ex.description || '';
    const cat = ex.category || '';
    const text = (title + ' ' + cat + ' ' + desc).toLowerCase();

    // 1. Array / List / Elements
    if (text.includes('array') || text.includes('element') || text.includes('list') || text.includes('vector')) {
        return {
            bgColor: '#16a34a',
            svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`
        };
    }
    // 2. Factorial
    if (text.includes('factorial')) {
        return {
            bgColor: '#ea580c',
            svg: `<span style="font-family:system-ui,-apple-system,sans-serif;font-weight:900;font-size:1.15rem;letter-spacing:-0.5px">n!</span>`
        };
    }
    // 3. Sum / Addition / Accumulate / Odd / Even
    if (text.includes('sum') || text.includes('addition') || text.includes('add') || text.includes('odd') || text.includes('even')) {
        return {
            bgColor: '#9333ea',
            svg: `<span style="font-family:Georgia,serif;font-weight:900;font-size:1.4rem;line-height:1">Σ</span>`
        };
    }
    // 4. Average / Mean / Statistics
    if (text.includes('average') || text.includes('mean') || text.includes('stat') || text.includes('chart')) {
        return {
            bgColor: '#2563eb',
            svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="15" y="5" width="5" height="15" rx="1"/><rect x="9" y="10" width="5" height="10" rx="1"/><rect x="3" y="15" width="5" height="5" rx="1"/></svg>`
        };
    }
    // 5. Sort / Sorting / Order / Ascending / Descending
    if (text.includes('sort') || text.includes('order') || text.includes('ascending') || text.includes('descending')) {
        return {
            bgColor: '#d97706',
            svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 4v16"/></svg>`
        };
    }
    // 6. Palindrome / String / Text / Character / Word
    if (text.includes('palindrome') || text.includes('string') || text.includes('text') || text.includes('char') || text.includes('word')) {
        return {
            bgColor: '#0891b2',
            svg: `<span style="font-family:system-ui,-apple-system,sans-serif;font-weight:900;font-size:1.25rem">P</span>`
        };
    }
    // 7. Count / Counter / Positive / Negative
    if (text.includes('count') || text.includes('counter') || text.includes('positive') || text.includes('negative') || text.includes('how many')) {
        return {
            bgColor: '#0d9488',
            svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
        };
    }
    // 8. Largest / Maximum / Smallest / Minimum / Find / Peak
    if (text.includes('largest') || text.includes('maximum') || text.includes('max') || text.includes('smallest') || text.includes('minimum') || text.includes('min') || text.includes('peak') || text.includes('find')) {
        return {
            bgColor: '#e11d48',
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`
        };
    }
    // 9. Loop / Iteration / Repeat / Cycle
    if (text.includes('loop') || text.includes('iteration') || text.includes('repeat') || text.includes('cycle') || text.includes('while') || text.includes('for')) {
        return {
            bgColor: '#4f46e5',
            svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>`
        };
    }
    // 10. Matrix / 2D Grid
    if (text.includes('matrix') || text.includes('grid') || text.includes('2d')) {
        return {
            bgColor: '#059669',
            svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>`
        };
    }
    // 11. Number / Math / Compute / Multiply / Divide
    if (text.includes('number') || text.includes('math') || text.includes('multiply') || text.includes('divide') || text.includes('product') || text.includes('compute') || text.includes('calculator')) {
        return {
            bgColor: '#ea580c',
            svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01"/></svg>`
        };
    }
    // 12. Default Fallback
    return {
        bgColor: '#475569',
        svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`
    };
}

function toggleStudentGuidelines() {
    const body = $id('student-guidelines-body');
    const icon = $id('guidelines-toggle-icon');
    if (!body) return;
    const isCollapsed = body.classList.toggle('collapsed');
    if (icon) {
        icon.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
    }
}

async function changeStudentPage(targetPage) {
    await loadStudentExercises(targetPage);
    const el = $id('page-exercises-student');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function renderStudentPaginationControls(totalExercises, currentPage) {
    const totalPages = Math.max(1, Math.ceil(totalExercises / STUDENT_EX_PER_PAGE));
    const controlsEl = $id('student-pagination-controls');
    const infoEl = $id('student-pagination-info');

    if (infoEl) {
        if (totalExercises === 0) {
            infoEl.textContent = 'Showing 0 to 0 of 0 exercises';
        } else {
            const start = (currentPage - 1) * STUDENT_EX_PER_PAGE + 1;
            const end = Math.min(currentPage * STUDENT_EX_PER_PAGE, totalExercises);
            infoEl.textContent = `Showing ${start} to ${end} of ${totalExercises} exercises`;
        }
    }

    if (!controlsEl) return;
    if (totalPages <= 1) {
        controlsEl.innerHTML = '';
        return;
    }

    let buttonsHtml = '';

    // Previous Button
    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    buttonsHtml += `<button class="page-btn" ${prevDisabled} onclick="changeStudentPage(${currentPage - 1})">‹</button>`;

    // Page Numbers logic
    const pages = [];
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
        pages.push(1);
        if (currentPage > 3) pages.push('...');

        const start = Math.max(2, currentPage - 1);
        const end = Math.min(totalPages - 1, currentPage + 1);
        for (let i = start; i <= end; i++) {
            if (!pages.includes(i)) pages.push(i);
        }

        if (currentPage < totalPages - 2) pages.push('...');
        pages.push(totalPages);
    }

    pages.forEach(p => {
        if (p === '...') {
            buttonsHtml += `<span class="page-ellipsis">…</span>`;
        } else {
            const isActive = p === currentPage ? 'active' : '';
            buttonsHtml += `<button class="page-btn ${isActive}" onclick="changeStudentPage(${p})">${p}</button>`;
        }
    });

    // Next Button
    const nextDisabled = currentPage === totalPages ? 'disabled' : '';
    buttonsHtml += `<button class="page-btn" ${nextDisabled} onclick="changeStudentPage(${currentPage + 1})">›</button>`;

    controlsEl.innerHTML = buttonsHtml;
}

async function loadStudentExercises(page = 1) {
    if (typeof page === 'boolean') {
        page = 1;
    }
    studentExCurrentPage = Math.max(1, page);
    const offset = (studentExCurrentPage - 1) * STUDENT_EX_PER_PAGE;

    const allExercises = await refreshExercises();
    const isDefaultStu = !currentUser || !currentUser.instructorId || currentUser.instructorId === 'u2';
    const studentExercises = allExercises.filter(e =>
        e.instructorId === currentUser?.instructorId ||
        e.createdBy === currentUser?.instructorId ||
        (isDefaultStu && (e._docId || '').startsWith('algo_'))
    );
    const totalExercises = studentExercises.length;
    const exercises = studentExercises.slice(offset, offset + STUDENT_EX_PER_PAGE);
    const container = $id('student-exercises-list');

    if (!container) return;

    // Progress tracking update
    await loadStudentProgress();

    if (exercises.length === 0) {
        container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">{{ui:NotebookPen}}</div><h3>No Exercises Available</h3><p>Your instructor hasn't created any exercises yet.</p></div>`;
        renderStudentPaginationControls(totalExercises, studentExCurrentPage);
        return;
    }

    // Fetch completed exercise titles for current student
    const allActivity = await dbGetAll(activityRef);
    const studentName = currentUser ? currentUser.fullName : '';
    const studentIdVal = currentUser ? (currentUser.id || currentUser._docId) : '';
    const completedIds = new Set(
        allActivity
            .filter(a => (a.student === studentName || a.studentId === studentIdVal) && a.status === 'Completed')
            .map(a => a.exercise)
    );

    const html = exercises.map(ex => {
        const exTitle = ex.title || ex.concept || 'Untitled Exercise';
        const exDesc = ex.description || 'No description provided.';
        const exDiff = normDiff(ex.difficulty);
        const isCompleted = completedIds.has(exTitle);
        const iconInfo = getExerciseIconInfo(ex);
        const exDate = ex.createdAt || '2026-08-12';

        return `
    <div class="exercise-card">
      <div class="ex-card-top">
        <div class="ex-icon-box" style="background: ${iconInfo.bgColor};">
          ${iconInfo.svg}
        </div>
        <div class="ex-header-text">
          <div class="ex-header-row">
            <h4 class="ex-title">${exTitle}</h4>
            <span class="ex-difficulty ${exDiff}">${dispDiff(ex.difficulty)}</span>
          </div>
        </div>
      </div>
      <p class="ex-desc">${exDesc}</p>
      <div class="ex-date-row">
        <i data-lucide="calendar" aria-hidden="true"></i>
        <span>${exDate}</span>
      </div>
      <hr class="ex-divider" />
      <div class="ex-card-footer">
        ${isCompleted
                ? `<span class="ex-completed-badge active"><i data-lucide="circle-check" aria-hidden="true"></i> Completed</span>`
                : `<button class="ex-start-btn inactive" onclick="attemptExercise('${ex._docId}')"><i data-lucide="play" aria-hidden="true"></i> Start Exercise</button>`
            }
      </div>
    </div>`;
    }).join('');

    container.innerHTML = html;
    refreshIcons(container);
    renderStudentPaginationControls(totalExercises, studentExCurrentPage);
}


/**
 * loadStudentProgress()
 * ─────────────────────────────────────────────────────────────────────
 * Fetches the REAL progress counters from the database:
 *   • totalExercises  — dynamic count of exercises assigned to student
 *   • completedCount  — unique exercises completed by current student
 * ─────────────────────────────────────────────────────────────────────
 */
async function loadStudentProgress() {
    if (!currentUser || currentUser.role !== 'student') return;

    try {
        const allExercises = await refreshExercises();
        const isDefaultStu = !currentUser || !currentUser.instructorId || currentUser.instructorId === 'u2';
        const studentExercises = allExercises.filter(e =>
            e.instructorId === currentUser?.instructorId ||
            e.createdBy === currentUser?.instructorId ||
            (isDefaultStu && (e._docId || '').startsWith('algo_'))
        );
        const totalExercises = studentExercises.length;

        // 2. Fetch all activity for this student, collect unique completed exercise titles
        const allActivity = await dbGetAll(activityRef);
        const studentName = currentUser.fullName;
        const studentIdVal = currentUser.id || currentUser._docId;
        const completedTitles = new Set(
            allActivity
                .filter(a => (a.student === studentName || a.studentId === studentIdVal) && a.status === 'Completed')
                .map(a => a.exercise)
        );
        const completedCount = completedTitles.size;

        // 3. Calculate progress percentage
        const pct = totalExercises > 0 ? Math.round((completedCount / totalExercises) * 100) : 0;

        // 4. Update Exercises & Tasks page counters
        const totalEl = $id('student-total-count');
        const compEl = $id('student-completed-count');
        const fillEl = $id('student-progress-fill');
        const pctEl = $id('student-progress-pct');
        if (totalEl) totalEl.textContent = totalExercises;
        if (compEl) compEl.textContent = completedCount;
        if (fillEl) fillEl.style.width = pct + '%';
        if (pctEl) pctEl.textContent = pct + '%';

        // 5. Update Write Pseudocode topbar progress pill + mini bar
        const pill = $id('topbar-progress-pill');
        if (pill) {
            pill.innerHTML = `<i data-lucide="circle-check" aria-hidden="true"></i> ${completedCount} / ${totalExercises} Completed`;
            refreshIcons(pill);
        }
        const topbarFill = $id('topbar-progress-fill');
        if (topbarFill) {
            topbarFill.style.width = pct + '%';
        }
        const topbarTrack = $id('topbar-progress-track');
        if (topbarTrack) {
            topbarTrack.setAttribute('aria-valuenow', pct);
            topbarTrack.setAttribute('aria-valuetext', completedCount + ' of ' + totalExercises + ' exercises completed');
        }
        const studentTrack = $id('student-progress-track');
        if (studentTrack) {
            studentTrack.setAttribute('aria-valuenow', pct);
            studentTrack.setAttribute('aria-valuetext', completedCount + ' of ' + totalExercises + ' exercises completed');
        }

        console.log(`[Progress] ${completedCount} / ${totalExercises} exercises completed (${pct}%)`);
    } catch (err) {
        console.error('[Progress] Failed to load student progress:', err);
    }
}

async function attemptExercise(id, resubmissionOf = null) {
    const ex = await dbGet(exercisesRef, id);
    if (!ex) return;

    const pseudoEditor = $id('pseudocode-editor');
    if (pseudoEditor) {
        pseudoEditor.value = '';
        pseudoEditor.dispatchEvent(new Event('input'));
    }

    const pyOut = $id('python-output');
    if (pyOut) {
        pyOut.value = '';
        pyOut.dispatchEvent(new Event('input'));
    }

    localStorage.setItem(STORAGE_KEYS.ACTIVE_EXERCISE, id);
    exerciseState.resubmissionOf = resubmissionOf || null;
    if (pseudoEditor) pseudoEditor.readOnly = false;
    if (pyOut) pyOut.readOnly = false;
    renderActiveExercise(ex);

    navigateTo('write-pseudocode');
    showToast(`Exercise loaded: ${ex.title || ex.concept || 'Exercise'}. Write your pseudocode!`, 'info');
}

function renderActiveExercise(ex) {
    const panel = $id('active-exercise-panel');
    if (!panel) return;

    const exTitle = ex.title || ex.concept || 'Untitled Exercise';
    const exDesc = ex.description || 'No description provided.';
    const rawDiff = (ex.difficulty || 'moderate').toLowerCase();
    const exDiff = rawDiff === 'medium' ? 'moderate' : rawDiff;
    const exDiffDisplay = exDiff.charAt(0).toUpperCase() + exDiff.slice(1);

    setText('active-ex-title', exTitle);
    setText('active-ex-desc', exDesc);

    const diffBadge = $id('active-ex-difficulty');
    if (diffBadge) {
        diffBadge.textContent = exDiffDisplay;
        diffBadge.className = 'badge';
        if (exDiff === 'easy') diffBadge.classList.add('badge-success');
        else if (exDiff === 'hard') diffBadge.classList.add('badge-danger');
        else diffBadge.classList.add('badge-warning');
    }

    panel.classList.remove('hidden');

    const content = $id('active-ex-content');
    if (content) content.classList.remove('hidden');
    setText('btn-toggle-instructions', 'Hide Instructions');

    // Set active state
    exerciseState.activeExercise = ex;
    exerciseState.isTranslated = false;
    exerciseState.isExecuted = false;
    exerciseState.outputMatched = false;
    exerciseState.expectedOutput = '';
    exerciseState.expectedOutputResolved = false;
    updateExerciseStatus();

    // Determine expected output:
    // 1. Prefer the instructor's stored expected output on the exercise record.
    // 2. Otherwise compute it dynamically by running the solution code (legacy seeds).
    const storedOutput = ex.expectedOutput || ex.expected_output || '';
    if (storedOutput) {
        exerciseState.expectedOutput = storedOutput;
        exerciseState.expectedOutputResolved = true;
    } else {
        // solution key: user-created use 'solution', seeded may have 'python_code'
        const solutionCode = ex.solution || ex.python_code || '';
        if (solutionCode) computeExpectedOutput(solutionCode);
        else exerciseState.expectedOutputResolved = true;
    }
}

function computeExpectedOutput(code) {
    if (typeof Sk === 'undefined') {
        exerciseState.expectedOutputResolved = true;
        return;
    }
    let outText = '';
    Sk.configure({
        output: function (text) { outText += text; },
        read: function (x) {
            if (Sk.builtinFiles === undefined || Sk.builtinFiles["files"][x] === undefined) throw "File not found: '" + x + "'";
            return Sk.builtinFiles["files"][x];
        },
        inputfun: function () { return ''; },
        inputfunTakesPrompt: true,
        __future__: Sk.python3
    });
    Sk.misceval.asyncToPromise(function () {
        return Sk.importMainWithBody("<stdin>", false, code, true);
    }).then(() => {
        exerciseState.expectedOutput = outText;
        exerciseState.expectedOutputResolved = true;
        console.log('[Completion] Expected output computed dynamically.');
    }).catch(err => {
        exerciseState.expectedOutputResolved = true;
        console.warn('[Completion] Failed to compute expected output:', err);
    });
}

function updateExerciseStatus() {
    const statusEl = $id('active-ex-status');
    const submitBtn = $id('btn-submit-exercise');
    if (!statusEl || !submitBtn || !exerciseState.activeExercise) return;

    // Exact output matching is only required when a reliable expected output
    // could be established. If not (e.g. interactive INPUT-based programs such
    // as the Calculator activity), successful translate + run counts as complete.
    const hasExpectedOutput = exerciseState.expectedOutputResolved && !!exerciseState.expectedOutput;
    const isCompleted = exerciseState.isTranslated && exerciseState.isExecuted &&
        (!hasExpectedOutput || exerciseState.outputMatched);

    if (isCompleted) {
        statusEl.textContent = '{{ui:Circle}} Status: Completed';
        statusEl.className = 'badge badge-success';
        statusEl.style.marginLeft = '0.5rem';
        submitBtn.classList.remove('hidden');
    } else {
        statusEl.textContent = '{{ui:Circle}} Status: In Progress';
        statusEl.className = 'badge badge-warning';
        statusEl.style.marginLeft = '0.5rem';
        submitBtn.classList.add('hidden');
    }
}

async function submitExercise() {
    const ex = exerciseState.activeExercise;
    if (!ex || !currentUser) return;
    if (!confirm('Are you sure you want to submit this exercise?')) return;
    const pseudo = getValue('pseudocode-editor');
    const py = getPythonCode('python-output');
    const outTextEl = $id('console-output');
    const outText = outTextEl ? outTextEl.textContent || '' : '';
    const now = new Date();
    const docId = 'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const studentAccountId = currentUser._docId || currentUser.id;
    const actRecord = {
        _docId: docId, id: docId, exerciseId: ex._docId || ex.id,
        revisionOf: exerciseState.resubmissionOf || null,
        attemptNumber: exerciseState.resubmissionOf ? 2 : 1,
        student: currentUser.fullName,
        studentId: currentUser.studentId || currentUser.username || studentAccountId,
        studentAccountId, section: currentUser.section || 'BSCS-3A',
        instructorId: ex.instructorId || ex.createdBy || currentUser.instructorId || 'u2',
        exercise: ex.title || ex.concept || 'Untitled Exercise',
        difficulty: ex.difficulty || 'moderate', status: 'Completed',
        reviewStatus: 'submitted', score: '100%', time: now.toISOString(),
        timestamp: now.getTime(), pseudocode: pseudo, python_code: py,
        result: 'Success', errorType: null, processingTime: '0.45s', output: outText
    };
    const saveBtn = $id('btn-submit-exercise');
    if (saveBtn) saveBtn.disabled = true;
    try {
        await dbSet(activityRef, docId, actRecord);
        if (typeof cachedActivity !== 'undefined') cachedActivity.unshift(actRecord);
        if (typeof currentFilteredActivity !== 'undefined') currentFilteredActivity.unshift(actRecord);
        if (typeof updateAnalyticsUI === 'function') { try { updateAnalyticsUI(); } catch (e) {} }
        const overlay = $id('submission-success-overlay');
        const timeDisplay = $id('submission-time-display');
        if (overlay && timeDisplay) {
            timeDisplay.innerHTML = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + '<br>' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            overlay.classList.remove('hidden');
            const returnBtn = $id('btn-return-to-exercises');
            if (returnBtn) returnBtn.disabled = false;
        }
        const pseudoEditor = $id('pseudocode-editor');
        if (pseudoEditor) pseudoEditor.readOnly = true;
        const pyOutput = $id('python-output');
        if (pyOutput) pyOutput.readOnly = true;
        const translateBtn = $id('btn-translate-pseudocode');
        if (translateBtn) translateBtn.disabled = true;
        const runBtn = $id('btn-run-code');
        if (runBtn) runBtn.disabled = true;
        await loadStudentProgress();
        showToast(exerciseState.resubmissionOf ? 'Resubmission submitted successfully.' : 'Exercise submitted successfully.', 'success');
        exerciseState.resubmissionOf = null;
    } catch (error) {
        console.error('[Exercise] Submission failed:', error);
        showToast('Unable to save submission. Please try again.', 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

function changeExercise() {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_EXERCISE);
    const panel = $id('active-exercise-panel');
    if (panel) panel.classList.add('hidden');

    const overlay = $id('submission-success-overlay');
    if (overlay) overlay.classList.add('hidden');

    exerciseState.activeExercise = null;
    exerciseState.isTranslated = false;
    exerciseState.isExecuted = false;
    exerciseState.outputMatched = false;
    exerciseState.expectedOutputResolved = false;
    exerciseState.expectedOutput = '';

    const pseudoEditor = $id('pseudocode-editor');
    if (pseudoEditor) pseudoEditor.readOnly = false;
    const pyOut = $id('python-output');
    if (pyOut) pyOut.readOnly = false;

    const translateBtn = $id('btn-translate-pseudocode');
    if (translateBtn) translateBtn.disabled = false;
    const runBtn = $id('btn-run-code');
    if (runBtn) runBtn.disabled = false;
    const returnBtn = $id('btn-return-to-exercises');
    if (returnBtn) returnBtn.disabled = false;

    navigateTo('exercises-student');
}

function toggleExerciseInstructions() {
    const content = $id('active-ex-content');
    const btn = $id('btn-toggle-instructions');
    if (!content || !btn) return;
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        btn.textContent = 'Hide Instructions';
    } else {
        content.classList.add('hidden');
        btn.textContent = 'Show Instructions';
    }
}

function _clearExerciseErrors() {
    ['ex-title-error', 'ex-desc-error', 'ex-difficulty-error', 'ex-solution-error', 'ex-expected-output-error'].forEach(id => {
        const el = $id(id);
        if (el) el.style.display = 'none';
    });
}

async function openExerciseModal(id = null) {
    editingExerciseId = id;
    _clearExerciseErrors();
    const modal = $id('exercise-modal');
    const title = $id('exercise-modal-title');
    if (!modal || !title) return;

    if (id) {
        const ex = await dbGet(exercisesRef, id);
        if (ex) {
            title.textContent = 'Edit Exercise';
            const rawDiff = (ex.difficulty || 'moderate').toLowerCase();
            setValue('ex-title', ex.title || ex.concept || '');
            setValue('ex-desc', ex.description || '');
            setValue('ex-difficulty', rawDiff === 'medium' ? 'moderate' : rawDiff);
            setValue('ex-solution', ex.solution || ex.pseudocode || '');
            setValue('ex-expected-output', ex.expectedOutput || ex.expected_output || '');
            const saveBtn = $id('exercise-save-btn');
            if (saveBtn) saveBtn.textContent = '{{ui:Save}} Save Changes';
        }
    } else {
        title.textContent = 'Add Exercise';
        setValue('ex-title', '');
        setValue('ex-desc', '');
        setValue('ex-difficulty', 'moderate');
        setValue('ex-solution', '');
        setValue('ex-expected-output', '');
        const saveBtn = $id('exercise-save-btn');
        if (saveBtn) saveBtn.textContent = '{{ui:Plus}} Add Exercise';
    }
    modal.classList.remove('hidden');
}

function closeExerciseModal() {
    const modal = $id('exercise-modal');
    if (modal) modal.classList.add('hidden');
    editingExerciseId = null;
}

async function saveExercise() {
    _clearExerciseErrors();

    const titleVal = getValue('ex-title').trim();
    const descVal = getValue('ex-desc').trim();
    const diffVal = getValue('ex-difficulty');
    const solutionVal = getValue('ex-solution').trim();
    const expectedOutputVal = getValue('ex-expected-output').trim();

    // Per-field validation
    let hasError = false;
    if (!titleVal) {
        const el = $id('ex-title-error');
        if (el) el.style.display = 'block';
        hasError = true;
    }
    if (!descVal) {
        const el = $id('ex-desc-error');
        if (el) el.style.display = 'block';
        hasError = true;
    }
    if (!diffVal) {
        const el = $id('ex-difficulty-error');
        if (el) el.style.display = 'block';
        hasError = true;
    }
    if (!solutionVal) {
        const el = $id('ex-solution-error');
        if (el) el.style.display = 'block';
        hasError = true;
    }
    if (!expectedOutputVal) {
        const el = $id('ex-expected-output-error');
        if (el) el.style.display = 'block';
        hasError = true;
    }
    if (hasError) return;

    const saveBtn = $id('exercise-save-btn');
    if (saveBtn) saveBtn.disabled = true;
    try {
        const instId = currentUser?.id || currentUser?._docId || 'u2';
        if (editingExerciseId) {
            await dbUpdate(exercisesRef, editingExerciseId, {
                title: titleVal,
                description: descVal,
                difficulty: diffVal,
                solution: solutionVal,
                expectedOutput: expectedOutputVal,
                instructorId: instId
            });
            createExerciseNotifications(editingExerciseId, titleVal, 'updated').catch(error => console.error('[Notifications] Background update failed:', error));
            showToast('Exercise updated successfully!', 'success');
        } else {
            const newId = 'ex' + Date.now();
            await dbSet(exercisesRef, newId, {
                id: newId,
                _docId: newId,
                title: titleVal,
                description: descVal,
                difficulty: diffVal,
                solution: solutionVal,
                expectedOutput: expectedOutputVal,
                createdBy: instId,
                instructorId: instId,
                createdAt: new Date().toISOString().split('T')[0]
            });
            createExerciseNotifications(newId, titleVal, 'added').catch(error => console.error('[Notifications] Background create failed:', error));
            showToast('Exercise added successfully!', 'success');
        }
        closeExerciseModal();
        await loadExercises();
    } catch (err) {
        console.error('[Exercise] Save error:', err);
        showToast('Failed to save exercise. Please check your connection and try again.', 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

function editExercise(id) { openExerciseModal(id); }

async function deleteExercise(id) {
    if (!confirm('Delete this exercise?')) return;

    const tbody = $id('exercises-table-body');
    if (tbody) {
        const btn = tbody.querySelector(`[onclick="deleteExercise('${id}')"]`);
        if (btn) {
            const row = btn.closest('tr');
            if (row) {
                row.style.transition = 'opacity 0.15s';
                row.style.opacity = '0';
                setTimeout(() => row.remove(), 150);
            }
        }
    }

    dbDelete(exercisesRef, id)
        .then(() => showToast('Exercise deleted.', 'info'))
        .catch(err => {
            console.error('[Offline Database] Delete exercise error:', err);
            showToast('Failed to delete exercise. Please refresh.', 'error');
            loadExercises();
        });
}


