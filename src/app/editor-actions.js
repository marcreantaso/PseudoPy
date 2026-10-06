/* ============================================================
   UTILITY FUNCTIONS
   ============================================================ */

function clearEditor() {
    setValue('pseudocode-editor', '');
    setHtml('python-output', '');
    setText('console-output', 'Editor cleared. Ready for new pseudocode.');
    const consoleOutput = $id('console-output');
    if (consoleOutput) consoleOutput.className = 'output-content';
    setText('line-count', '0 lines');
    currentErrorLineNumbers = [];
    updateGutter();
    if (PseudoPyLearning && PseudoPyLearning.register && PseudoPyLearning.register.learningUi) {
        try { PseudoPyLearning.register.learningUi.clearLearningPanel(); } catch (e) { /* non-critical */ }
    }
}

function clearOutput() {
    const consoleOutput = $id('console-output');
    if (consoleOutput) {
        consoleOutput.textContent = 'Output cleared.';
        consoleOutput.className = 'output-content';
    }
}

function copyPython() { copyEditorCode('python-output'); }
function copyTranslateOutput() { copyEditorCode('translate-output'); }
function copyInstructorOutput() { copyEditorCode('instructor-python-output'); }

function copyEditorCode(elementId) {
    const code = getPythonCode(elementId);
    if (!code) { showToast('No code to copy.', 'error'); return; }
    copyText(code);
}

function copyText(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!', 'success');
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Copied to clipboard!', 'success');
    });
}

/* ============================================================
   UNSAVED EDITOR DRAFT — preserved across refresh / PWA update
   ============================================================ */

const EDITOR_DRAFT_KEY = STORAGE_KEYS.EDITOR_DRAFT;

/**
 * Persist unsaved pseudocode editor content to browser-local draft storage.
 * Called before any planned reload (e.g. PWA Update Now) so student work is
 * never silently destroyed. Returns true when a draft was saved.
 */
function maybeSaveEditorDraft() {
    try {
        const editor = $id('pseudocode-editor');
        if (!editor || !editor.value || !editor.value.trim()) return false;
        const active = exerciseState && exerciseState.activeExercise;
        const activeId = active ? (active._docId || active.id || '') : '';
        // The translated Python is derived from this pseudocode but is not
        // re-derived on load, so it travels with the draft. Without it an
        // offline reload would restore the editor and drop the output the
        // student was reading.
        const output = $id('python-output');
        localStorage.setItem(EDITOR_DRAFT_KEY, JSON.stringify({
            exerciseId: activeId,
            text: editor.value,
            python: (output && output.value) ? output.value : '',
            savedAt: new Date().toISOString(),
            // UX Rule 2: the draft belongs to its author. Tagging it keeps
            // sign-out non-destructive (the draft survives) while the restore
            // below still refuses to show one account's work to another.
            user: (typeof currentUser !== 'undefined' && currentUser) ? String(currentUser.username || currentUser.id || '') : ''
        }));
        return true;
    } catch (e) {
        return false;
    }
}

function clearEditorDraft() {
    try { localStorage.removeItem(EDITOR_DRAFT_KEY); } catch (e) { }
}

/**
 * Restore a saved draft if it belongs to the currently active exercise (or to
 * free typing with no active exercise). Restored drafts survive both refreshes
 * and PWA updates.
 */
function maybeRestoreEditorDraft() {
    try {
        const raw = localStorage.getItem(EDITOR_DRAFT_KEY);
        if (!raw) return;
        const draft = JSON.parse(raw);
        const editor = $id('pseudocode-editor');
        if (!editor) return;
        // A draft saved by a named account is only restored for that account:
        // sign-out keeps the draft so unsaved work is never destroyed, but the
        // next person on this device must not see it. Untagged (legacy)
        // drafts keep the old behavior.
        const draftUser = draft.user || '';
        if (draftUser) {
            const sessionUser = (typeof currentUser !== 'undefined' && currentUser) ? String(currentUser.username || currentUser.id || '') : '';
            if (draftUser !== sessionUser) return;
        }
        const active = exerciseState && exerciseState.activeExercise;
        const activeId = active ? (active._docId || active.id || '') : '';
        if (draft.exerciseId && activeId && draft.exerciseId !== activeId) return;
        if (editor.value.trim()) return;
        editor.value = draft.text;
        updateGutter();
        setText('line-count', editor.value.split('\n').length + ' lines');
        // Restore the translated output too, but only when nothing has been
        // generated since load; it is derived from the pseudocode above.
        const output = $id('python-output');
        if (output && draft.python && !output.value.trim()) {
            output.value = draft.python;
        }
        showToast('Unsaved draft restored.', 'info');
    } catch (e) { /* non-critical */ }
}

function downloadPython() {
    const code = getPythonCode('python-output');
    if (!code) { showToast('No code to download.', 'error'); return; }
    const blob = new Blob([code], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pseudopy_output.py';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Python file downloaded!', 'success');
}


