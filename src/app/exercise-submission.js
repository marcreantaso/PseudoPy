/* Persistent exercise actions. Correctness affects grading, never visibility. */
let exerciseSubmissionBusy = false;
let exerciseSubmissionReceipt = null;
let exerciseSubmissionLoading = false;
let exerciseSubmissionGeneration = 0;
let exerciseSubmissionMessage = '';

function exerciseSubmissionKey(ex, user) {
    return 'pseudopy_submission_' + JSON.stringify([user && (user._docId || user.id), ex && (ex._docId || ex.id)]);
}

function exerciseSubmissionAllowed(ex, receipt) {
    // Resubmission stays available unless an exercise explicitly forbids it.
    // Correctness decides the recorded score, never the right to submit again.
    return ex.allowResubmission !== false && ex.allowResubmissions !== false;
}

function exerciseSubmissionRestriction() {
    const ex = exerciseState.activeExercise;
    if (!currentUser) return 'Sign in to submit your answer.';
    if (exerciseSubmissionLoading) return 'Loading exercise and submission status…';
    if (!ex) return 'Open an exercise to submit an answer.';
    if (!(ex._docId || ex.id) || !(currentUser._docId || currentUser.id)) return 'Account or exercise information is missing. Reopen the exercise or sign in again.';
    if (ex.locked === true || ['locked', 'archived'].includes(ex.status)) return 'This exercise is locked by your instructor.';
    const rawDeadline = ex.dueDate || ex.deadline;
    const deadline = rawDeadline && (typeof rawDeadline.toDate === 'function' ? rawDeadline.toDate() : new Date(rawDeadline));
    if (deadline && Number.isFinite(deadline.getTime()) && deadline.getTime() < Date.now()) return 'Deadline passed on ' + deadline.toLocaleString() + '.';
    if (exerciseSubmissionReceipt && exerciseSubmissionReceipt.phase === 'saved' && !exerciseSubmissionAllowed(ex, exerciseSubmissionReceipt)) {
        return 'Submitted. Your instructor must request a revision before you can resubmit.';
    }
    return '';
}

function exerciseSubmissionButtons() {
    const buttons = [];
    [$id('btn-submit-exercise'), $id('exercise-submit-fallback')].forEach(button => { if (button) buttons.push(button); });
    // Any additional delegated entry point shares this state.
    if (typeof $qsa === 'function') $qsa('[data-action="submit"]').forEach(button => { if (buttons.indexOf(button) === -1) buttons.push(button); });
    return buttons;
}

function renderExerciseSubmissionState() {
    if (exerciseSubmissionReceipt && (!currentUser || exerciseSubmissionReceipt.record.studentAccountId !== (currentUser._docId || currentUser.id))) {
        exerciseSubmissionReceipt = null;
        exerciseSubmissionMessage = '';
    }
    const restriction = exerciseSubmissionRestriction();
    const receipt = exerciseSubmissionReceipt;
    const busy = exerciseSubmissionBusy;
    const label = busy ? 'Submitting…' : receipt ? (receipt.phase === 'saved' ? 'Submitted ✓ (Resubmit)' : 'Retry sync') : 'Submit';
    const reason = busy ? 'Saving your answer…' : [exerciseSubmissionMessage, restriction].filter(Boolean).join(' ') ||
        (receipt ? (receipt.phase === 'saved' ? 'Submitted ' : 'Saved on this device; cloud confirmation pending. ') + new Date(receipt.record.time).toLocaleString() :
            'Submit your attempt even if it has errors. Correctness affects your score, not submission.');
    setText('btn-submit-exercise-label', label);
    setText('exercise-submit-state', receipt ? 'Submission status' : 'Exercise submission');
    setText('exercise-submit-reason', reason);
    setText('active-ex-status', receipt ? 'Status: Submitted' : 'Status: In Progress');
    exerciseSubmissionButtons().forEach(button => {
        button.classList.remove('hidden');
        button.disabled = busy || !!restriction;
        button.setAttribute('aria-busy', String(busy));
        if (!button.id) button.textContent = label;
    });
}

async function loadExerciseSubmissionState(ex) {
    const generation = ++exerciseSubmissionGeneration;
    const user = currentUser;
    exerciseSubmissionReceipt = null;
    exerciseSubmissionMessage = '';
    exerciseSubmissionLoading = true;
    updateExerciseStatus();
    const key = exerciseSubmissionKey(ex, user);
    try {
        const saved = JSON.parse(localStorage.getItem(key) || 'null');
        if (saved && saved.record && saved.record.studentAccountId === (user && (user._docId || user.id))) exerciseSubmissionReceipt = saved;
    } catch (_) { /* The database remains the source of truth if storage is unavailable. */ }
    try {
        const records = await dbGetAll(activityRef);
        if (generation !== exerciseSubmissionGeneration || user !== currentUser || ex !== exerciseState.activeExercise) return;
        const accountId = user && (user._docId || user.id);
        const latest = records.filter(record => record.type !== 'translate_attempt' &&
            record.exerciseId === (ex._docId || ex.id) &&
            (record.studentAccountId === accountId || (!record.studentAccountId && record.studentId === accountId)))
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
        if (latest) {
            if (!exerciseSubmissionReceipt || latest._docId !== exerciseSubmissionReceipt.record._docId) {
                exerciseSubmissionReceipt = { phase: 'saved', record: latest };
            } else {
                exerciseSubmissionReceipt.record = latest;
            }
        }
    } catch (error) {
        console.warn('[Exercise] Using locally available submission state:', error);
    } finally {
        if (generation === exerciseSubmissionGeneration && user === currentUser && ex === exerciseState.activeExercise) {
            exerciseSubmissionLoading = false;
            const editor = $id('pseudocode-editor');
            if (editor && !editor.value && exerciseSubmissionReceipt) {
                editor.value = exerciseSubmissionReceipt.record.pseudocode || '';
                editor.dispatchEvent(new Event('input'));
            }
            updateExerciseStatus();
        }
    }
}

function persistExerciseReceipt(key, receipt) {
    try { localStorage.setItem(key, JSON.stringify(receipt)); } catch (_) { /* dbSet owns durable persistence. */ }
}

async function saveExerciseSubmission() {
    if (exerciseSubmissionBusy) return;
    const restriction = exerciseSubmissionRestriction();
    if (restriction) { showToast(restriction, 'info'); return; }
    const ex = exerciseState.activeExercise;
    const user = currentUser;
    const generation = exerciseSubmissionGeneration;
    const key = exerciseSubmissionKey(ex, user);
    const pseudo = getValue('pseudocode-editor');
    if (!pseudo.trim()) { showToast('Write your answer first.', 'info'); return; }
    let receipt = exerciseSubmissionReceipt;
    // A retry reuses the original snapshot and document ID, even if the editor changed.
    if (!receipt || receipt.phase === 'saved') {
        if (receipt && receipt.record.pseudocode === pseudo && !exerciseState.resubmissionOf) {
            showToast('This answer is already submitted. Edit it before resubmitting.', 'info');
            return;
        }
        let result;
        try { result = compilerEngine.compile(pseudo); }
        catch (error) { result = { valid: false, errors: [{ message: error.message, errorType: 'Compiler Error' }], python: '' }; }
        const errors = (result.errors || []).map(error => ({
            line: error.line || null, message: error.message || 'Compilation failed.',
            errorType: typeof classifyActivityError === 'function' ? classifyActivityError(error) : 'Compiler Error'
        }));
        const prompt = errors.length ? 'Your code has ' + errors.length + ' error' + (errors.length === 1 ? '' : 's') +
            (errors[0].line ? ' (line ' + errors[0].line + ')' : '') + '. Submit anyway?' : 'Submit this answer?';
        if (!confirm(prompt)) return;
        const now = new Date();
        const id = 'act_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : now.getTime() + '_' + Math.random().toString(36).slice(2));
        const completed = result.valid && result.python === getPythonCode('python-output') && exerciseState.isTranslated && exerciseState.isExecuted &&
            exerciseState.expectedOutputResolved && (!exerciseState.expectedOutput || exerciseState.outputMatched);
        const accountId = user._docId || user.id;
        receipt = { phase: 'retry', record: {
            _docId: id, id, type: 'exercise_submission', exerciseId: ex._docId || ex.id,
            revisionOf: exerciseState.resubmissionOf || (receipt && receipt.record._docId) || null,
            attemptNumber: receipt ? (Number(receipt.record.attemptNumber) || 1) + 1 : exerciseState.resubmissionOf ? 2 : 1,
            student: user.fullName || user.username || '', studentId: user.studentId || user.username || accountId,
            studentAccountId: accountId, studentNumber: user.studentNumber || user.studentId || '',
            section: user.section || '', instructorId: ex.instructorId || ex.createdBy || user.instructorId || 'u2',
            exercise: ex.title || ex.concept || 'Untitled Exercise', difficulty: ex.difficulty || 'moderate',
            status: completed ? 'Completed' : result.valid ? 'In Progress' : 'compile_error',
            reviewStatus: 'submitted', score: completed ? '100%' : null,
            time: now.toISOString(), timestamp: now.getTime(), pseudocode: pseudo, python_code: result.python || '',
            compileSuccess: !!result.valid, errors, errorType: errors.length ? errors[0].errorType : null,
            result: completed ? 'Success' : errors.length ? 'Compilation failed' : 'Awaiting review',
            processingTime: ((result.metrics && result.metrics.totalTime || 0) / 1000).toFixed(3) + 's',
            output: exerciseState.isExecuted ? ($id('console-output').textContent || '') : ''
        } };
    }
    exerciseSubmissionBusy = true;
    exerciseSubmissionReceipt = receipt;
    persistExerciseReceipt(key, receipt);
    updateExerciseStatus();
    let message;
    try {
        await dbSet(activityRef, receipt.record._docId, receipt.record);
        receipt.phase = 'saved';
        message = 'Submitted successfully at ' + new Date(receipt.record.time).toLocaleString() + '.';
    } catch (error) {
        receipt.phase = error.localOnly ? 'pending' : 'retry';
        message = /permission-denied|unauthenticated/.test(String(error.code))
            ? 'Firebase denied cloud submission. Your answer is saved on this device. Ask your instructor to check permissions, then retry sync.'
            : error.localOnly ? 'Saved on this device. Submission is queued and will sync when connected. Your instructor cannot see it yet.'
                : 'Unable to save submission. Your answer remains in the editor. Retry to save the same attempt.';
    } finally {
        persistExerciseReceipt(key, receipt);
        exerciseSubmissionBusy = false;
        if (currentUser === user && exerciseState.activeExercise === ex && generation === exerciseSubmissionGeneration) {
            exerciseSubmissionMessage = message;
            if (receipt.phase !== 'retry' && typeof cachedActivity !== 'undefined') {
                const index = cachedActivity.findIndex(record => record._docId === receipt.record._docId);
                if (index >= 0) cachedActivity[index] = receipt.record;
                else cachedActivity.unshift(receipt.record);
            }
            if (receipt.phase === 'saved') exerciseState.resubmissionOf = null;
            showToast(message, receipt.phase === 'saved' ? 'success' : 'info');
            updateExerciseStatus();
            if (receipt.phase === 'saved') loadStudentProgress().catch(error => console.warn('[Exercise] Progress refresh:', error));
        } else updateExerciseStatus();
    }
}

function initializeExerciseActions() {
    const page = $id('page-write-pseudocode');
    if (!page || page.dataset.exerciseActionsReady) return;
    page.dataset.exerciseActionsReady = 'true';
    page.addEventListener('click', event => {
        const button = event.target.closest('[data-action="submit"]');
        if (button && page.contains(button) && !button.disabled) submitExercise();
    });
    const updateViewport = () => {
        const viewport = window.visualViewport;
        document.documentElement.style.setProperty('--exercise-keyboard-inset', Math.max(0, window.innerHeight -
            (viewport ? viewport.height + viewport.offsetTop : window.innerHeight)) + 'px');
    };
    window.addEventListener('resize', updateViewport);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateViewport);
        window.visualViewport.addEventListener('scroll', updateViewport);
    }
    const bar = $id('exercise-action-bar');
    const trackBarHeight = () => {
        if (!bar) return;
        document.documentElement.style.setProperty('--exercise-actions-height', bar.getBoundingClientRect().height + 'px');
        // Backstop: only reveal the in-flow Submit when the action bar cannot render.
        const usable = bar.getClientRects().length > 0 && bar.getBoundingClientRect().height > 0;
        const fallback = $id('exercise-submit-fallback');
        if (fallback) fallback.classList.toggle('exercise-fallback-active', !usable);
    };
    if (typeof ResizeObserver !== 'undefined' && bar) new ResizeObserver(trackBarHeight).observe(bar);
    window.addEventListener('resize', trackBarHeight);
    window.addEventListener('orientationchange', trackBarHeight);
    window.addEventListener('pseudopy:sync-saved', event => {
        const receipt = exerciseSubmissionReceipt;
        if (!receipt || !event.detail || event.detail.ref !== activityRef || event.detail.docId !== receipt.record._docId) return;
        receipt.phase = 'saved';
        persistExerciseReceipt(exerciseSubmissionKey(exerciseState.activeExercise, currentUser), receipt);
        exerciseSubmissionMessage = 'Submission synced successfully.';
        updateExerciseStatus();
    });
    if (typeof onCloudAuthChanged === 'function') onCloudAuthChanged(() => updateExerciseStatus());
    updateViewport();
    trackBarHeight();
    updateExerciseStatus();
    if (window.__PSEUDOPY_DEBUG__) {
        const button = $id('btn-submit-exercise');
        if (!button) console.warn('[Exercise] Submit button missing from mounted view.');
        else if (typeof IntersectionObserver !== 'undefined') new IntersectionObserver(entries => {
            if (!page.classList.contains('hidden') && entries.some(entry => !entry.isIntersecting)) console.warn('[Exercise] Submit is outside the visible viewport.');
        }).observe(button);
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeExerciseActions);
else initializeExerciseActions();
