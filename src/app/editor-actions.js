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

const EDITOR_DRAFT_KEY = 'pseudopy_editor_draft';

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
        localStorage.setItem(EDITOR_DRAFT_KEY, JSON.stringify({
            exerciseId: activeId,
            text: editor.value,
            savedAt: new Date().toISOString()
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
        const active = exerciseState && exerciseState.activeExercise;
        const activeId = active ? (active._docId || active.id || '') : '';
        if (draft.exerciseId && activeId && draft.exerciseId !== activeId) return;
        if (editor.value.trim()) return;
        editor.value = draft.text;
        updateGutter();
        setText('line-count', editor.value.split('\n').length + ' lines');
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


