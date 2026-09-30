/* Student-initiated translations are learning attempts, not graded submissions. */
let lastTranslationActivity = null;

function recordStudentTranslation(source, result, inputId) {
    if (!currentUser || currentUser.role !== 'student' ||
        !['pseudocode-editor', 'translate-input'].includes(inputId)) return Promise.resolve(null);
    const user = currentUser;
    const exercise = inputId === 'pseudocode-editor' ? exerciseState.activeExercise : null;
    const accountId = user._docId || user.id;
    const exerciseId = exercise ? exercise._docId || exercise.id : null;
    const now = Date.now();
    const key = JSON.stringify([accountId, exerciseId, inputId, source]);
    // Coalesce accidental double clicks, but allow deliberate later retries.
    if (lastTranslationActivity && lastTranslationActivity.key === key && now - lastTranslationActivity.time < 800) {
        return lastTranslationActivity.promise;
    }
    const id = 'translate_' + (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID() : now + '_' + Math.random().toString(36).slice(2));
    const errors = (Array.isArray(result.errors) ? result.errors : []).filter(Boolean).map(error => ({
        line: Number.isInteger(error.line) ? error.line : null,
        column: Number.isInteger(error.column) ? error.column : null,
        errorType: classifyActivityError(error),
        message: String(error.message || 'Compilation failed.'),
        suggestion: String(error.suggestion || '')
    }));
    const record = {
        _docId: id, id, type: 'translate_attempt',
        uid: typeof cloudUid === 'function' ? cloudUid() : null,
        studentAccountId: accountId, studentId: user.studentId || accountId,
        studentNumber: user.studentNumber || user.studentId || '',
        student: user.fullName || user.username || '', username: user.username || '',
        instructorId: (exercise && (exercise.instructorId || exercise.createdBy)) || user.instructorId || 'u2',
        section: user.section || '', exerciseId,
        exercise: exercise ? exercise.title || exercise.concept || 'Exercise' : 'Free practice',
        difficulty: exercise ? exercise.difficulty || 'moderate' : null,
        status: result.valid ? 'ungraded' : 'compile_error', compileSuccess: !!result.valid,
        score: null, pseudocode: source, generatedPython: result.python || '',
        python_code: result.python || '', errors, errorType: errors.length ? errors[0].errorType : null,
        result: result.valid ? 'Translation successful' : (errors[0] ? errors[0].errorType : 'Compiler Error'),
        output: errors.map(error => (error.line ? 'Line ' + error.line + ': ' : '') + error.message).join('\n'),
        processingTime: ((result.metrics && result.metrics.totalTime || 0) / 1000).toFixed(3) + 's',
        timestamp: now, time: new Date(now).toISOString(), createdAt: new Date(now).toISOString()
    };
    const promise = (async () => {
        try {
            // dbSet persists locally first and queues the same document ID for replay.
            await dbSet(activityRef, id, record);
            return record;
        } catch (error) {
            if (currentUser === user) {
                showToast(error.localOnly
                    ? 'Translation attempt saved on this device. Sync will retry when connected or signed in.'
                    : 'Could not record this translation attempt. Your code is still in the editor.',
                error.localOnly ? 'info' : 'error');
            }
            console.warn('[Translation activity] Save not confirmed:', error);
            return error.localOnly ? record : null;
        }
    })();
    lastTranslationActivity = { key, time: now, promise };
    return promise;
}
