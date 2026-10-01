/* ============================================================
   STUDENT DELETION — Manage Students
   Delegated row actions, typed-username confirmation, pending
   state, error mapping and the soft-delete undo window.

   The click handler is bound ONCE to the table body. Every
   loadStudents() re-render replaces the rows, so a handler bound
   to the rows themselves would be lost on every refresh; delegation
   from the stable container is what keeps the button working.
   ============================================================ */

let pendingDeleteStudentId = null;
let pendingDeleteStudentProfile = null;
let studentDeletionBusy = false;
let studentDeletionPending = false;
let studentDeletionUndoTimer = null;
let studentDeletionUndoDeadline = 0;

/** Resolve the stable container that survives every table re-render. */
function studentsTableBody() {
    return $id('students-table-body');
}

function closeStudentDeletionModal() {
    const modal = $id('delete-student-modal');
    if (modal) modal.classList.add('hidden');
    const input = $id('delete-student-confirm-input');
    if (input) input.value = '';
    setStudentDeletionError('');
    pendingDeleteStudentId = null;
    pendingDeleteStudentProfile = null;
}

/** Inline, non-blocking error text inside the modal. */
function setStudentDeletionError(message) {
    const el = $id('delete-student-error');
    if (!el) return;
    el.textContent = message || '';
    // The element starts with `display:none` in the markup, so the message is
    // announced without depending on a utility class that also sets display.
    el.style.display = message ? 'block' : 'none';
}

/**
 * Open the confirmation modal for one student.
 * `targetId` may be the profile document id or the app account id; both are
 * resolved against the cached profiles so the wrong row can never be targeted.
 */
async function openDeleteStudentModal(targetId) {
    if (studentDeletionBusy) return;
    const id = String(targetId || '');
    if (!id) {
        showToast('That student row is missing its account id. Refresh and try again.', 'error');
        return;
    }
    const users = (typeof cachedUsers !== 'undefined' && cachedUsers.length) ? cachedUsers : await refreshUsers();
    const profile = (users || []).find(u => String(u._docId || u.id) === id || String(u.id) === id) || null;

    const verdict = typeof authorizeStudentDeletion === 'function'
        ? authorizeStudentDeletion({
            callerRole: currentUser && currentUser.role,
            callerDocId: (currentUser && (currentUser._docId || currentUser.id)) || '',
            target: profile,
            targetDocId: (profile && (profile._docId || profile.id)) || id
        })
        : { ok: false, code: 'not-found', message: 'Student not found. Refresh the list and try again.' };

    if (!verdict.ok) {
        showToast(verdict.message, 'error');
        console.warn('[Deletion] modal refused:', verdict.code);
        return;
    }

    pendingDeleteStudentId = profile._docId || profile.id;
    pendingDeleteStudentProfile = profile;

    setText('delete-student-name', profile.fullName || 'this student');
    setText('delete-student-username', '@' + (profile.username || '—'));
    setText('delete-student-number', (typeof readStudentNumber === 'function' ? readStudentNumber(profile) : profile.studentNumber) || '—');

    const modal = $id('delete-student-modal');
    if (modal) modal.classList.remove('hidden');
    setStudentDeletionError('');
    // The undo bar must name this exact profile before the window starts.
    pendingUndoDocId = pendingDeleteStudentId;
    await renderStudentDeletionImpact(profile);
}

/** Show how many related records a permanent deletion would remove. */
async function renderStudentDeletionImpact(profile) {
    const el = $id('delete-student-related');
    if (!el) return;
    if (typeof collectStudentRelatedRecords !== 'function') return;
    el.textContent = 'Checking related records…';
    try {
        const summary = await collectStudentRelatedRecords(profile);
        const parts = [];
        if (summary.ownedTotal > 0) {
            parts.push(`${summary.ownedTotal} record${summary.ownedTotal === 1 ? '' : 's'} owned by this student will also be erased.`);
        } else {
            parts.push('No related submissions or requests were found for this student.');
        }
        if (summary.ambiguousTotal > 0) {
            parts.push(`${summary.ambiguousTotal} record${summary.ambiguousTotal === 1 ? '' : 's'} match this student only by name or number and will be kept for manual review.`);
        }
        el.textContent = parts.join(' ');
    } catch (e) {
        console.info('[Deletion] impact summary unavailable:', e && e.message);
        el.textContent = 'Related records could not be counted. Deletion will still verify ownership on the server.';
    }
}

/** Disable the confirm button and show a spinner for the duration of the call. */
function setStudentDeletionBusy(busy, pending) {
    studentDeletionBusy = !!busy;
    const btn = $id('btn-confirm-delete-student');
    if (!btn) return;
    btn.disabled = !!busy;
    if (typeof btn.setAttribute === 'function') btn.setAttribute('aria-busy', busy ? 'true' : 'false');
    if (btn.classList && typeof btn.classList.toggle === 'function') btn.classList.toggle('is-loading-text', !!busy);
    const label = $id('delete-student-confirm-label');
    if (label) label.textContent = busy ? 'Deleting…' : 'Delete student';
    if (!busy) studentDeletionPending = false;
}

/** Run the deletion, then refresh every list the student appeared in. */
async function executeDeleteStudent() {
    if (studentDeletionBusy || studentDeletionPending) return;
    if (!pendingDeleteStudentId || !pendingDeleteStudentProfile) {
        closeStudentDeletionModal();
        return;
    }
    const typed = getValue('delete-student-confirm-input').trim();
    const profile = pendingDeleteStudentProfile;
    const docId = pendingDeleteStudentId;

    if (!typed) {
        setStudentDeletionError('Type the username to confirm.');
        return;
    }
    if (typed !== String(profile.username || '')) {
        setStudentDeletionError('That username does not match. Type it exactly as shown.');
        return;
    }

    studentDeletionPending = true;
    setStudentDeletionBusy(true);
    setStudentDeletionError('');

    let result;
    try {
        result = await deleteStudentProfile(docId, { confirmUsername: typed });
    } catch (err) {
        console.error('[Deletion] unexpected failure:', err);
        const described = describeDeletionError(err);
        result = { ok: false, code: described.code, message: described.message };
    }

    setStudentDeletionBusy(false);

    if (!result || result.ok !== true) {
        const message = (result && result.message) || 'The student could not be deleted.';
        console.warn('[Deletion] failed', { docId, code: result && result.code });
        setStudentDeletionError(message);
        showToast(message, 'error');
        return;
    }

    animateStudentRowRemoval(docId);
    closeStudentDeletionModal();

    if (result.mode === 'soft') {
        showToast(`${profile.fullName} was deactivated. The sign-in account was not revoked.`, 'info');
        openStudentDeletionUndo(docId, profile);
    } else {
        showToast(`${profile.fullName} and all related records were permanently deleted.`, 'success');
        clearStudentDeletionUndo();
    }

    await refreshAfterStudentDeletion();
}

/** Fade the row out before the table is re-rendered. */
function animateStudentRowRemoval(docId) {
    const tbody = studentsTableBody();
    if (!tbody || !tbody.querySelector) return;
    const row = tbody.querySelector('tr[data-doc-id="' + String(docId).replace(/"/g, '\\"') + '"]');
    if (!row) return;
    row.classList.add('row-removing');
    if (typeof refreshIcons === 'function') refreshIcons(row);
}

/** Refresh the student list plus the analytics/instructor aggregates. */
async function refreshAfterStudentDeletion() {
    try {
        if (currentUser && currentUser.role === 'admin' && typeof loadUsers === 'function') await loadUsers();
        if (typeof loadStudents === 'function') await loadStudents();
    } catch (e) {
        console.warn('[Deletion] list refresh failed:', e && e.message);
    }
    try {
        cachedActivity = await dbGetAll(activityRef);
    } catch (e) {
        console.info('[Deletion] activity refresh skipped:', e && e.message);
    }
    try {
        if (currentUser && currentUser.role === 'admin' && typeof loadAdminAnalytics === 'function') await loadAdminAnalytics();
        else if (typeof loadAnalytics === 'function' && currentUser && currentUser.role === 'instructor') await loadAnalytics();
    } catch (e) {
        console.info('[Deletion] analytics refresh skipped:', e && e.message);
    }
}

// ── Undo window (soft delete only) ───────────────────────────────

function openStudentDeletionUndo(docId, profile) {
    const bar = $id('student-deletion-undo');
    if (!bar) return;
    pendingUndoDocId = docId;
    setText('student-deletion-undo-message', `${profile.fullName} · @${profile.username} is deactivated.`);
    bar.classList.remove('hidden');
    studentDeletionUndoDeadline = Date.now() + STUDENT_DELETION.UNDO_WINDOW_MS;
    if (studentDeletionUndoTimer) clearInterval(studentDeletionUndoTimer);
    const tick = () => {
        const left = Math.max(0, studentDeletionUndoDeadline - Date.now());
        const seconds = Math.ceil(left / 1000);
        setText('student-deletion-undo-countdown', `${seconds}s`);
        if (left <= 0) clearStudentDeletionUndo();
    };
    tick();
    studentDeletionUndoTimer = setInterval(tick, 250);
}

function clearStudentDeletionUndo() {
    if (studentDeletionUndoTimer) {
        clearInterval(studentDeletionUndoTimer);
        studentDeletionUndoTimer = null;
    }
    const bar = $id('student-deletion-undo');
    if (bar) bar.classList.add('hidden');
}

async function undoStudentDeletionFromUi() {
    if (!pendingUndoDocId) return;
    const docId = pendingUndoDocId;
    clearStudentDeletionUndo();
    pendingUndoDocId = null;
    const result = await undoStudentDeletion(docId);
    showToast(result.message, result.ok ? 'success' : 'error');
    if (result.ok) await refreshAfterStudentDeletion();
}

let pendingUndoDocId = null;

// ── Wiring ────────────────────────────────────────────────────────

function initStudentDeletionUi() {
    const tbody = studentsTableBody();
    if (!tbody || tbody.dataset.deletionBound === 'true') return;
    tbody.dataset.deletionBound = 'true';

    tbody.addEventListener('click', (event) => {
        const trigger = event.target.closest ? event.target.closest('[data-action="delete-student"]') : null;
        if (!trigger || !tbody.contains(trigger)) return;
        event.preventDefault();
        openDeleteStudentModal(trigger.getAttribute('data-id'));
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        const modal = $id('delete-student-modal');
        if (modal && !modal.classList.contains('hidden') && !studentDeletionBusy) closeStudentDeletionModal();
    });

    const undoBtn = $id('btn-undo-delete-student');
    if (undoBtn && undoBtn.dataset.bound !== 'true') {
        undoBtn.dataset.bound = 'true';
        undoBtn.addEventListener('click', () => { undoStudentDeletionFromUi(); });
    }
}

/**
 * Legacy entry point kept so any older inline handler still opens the modal
 * instead of deleting immediately.
 */
function deleteUser(id) {
    return openDeleteStudentModal(id);
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initStudentDeletionUi);
    } else {
        initStudentDeletionUi();
    }
}