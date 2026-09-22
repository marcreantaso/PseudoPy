/* ============================================================
   PSEUDOCODE SYNTAX VALIDATION ENGINE
   Stack-based strict validation with educational error messages
   ============================================================ */

/**
 * Core validation function — strict compiler-like approach.
 * Validates BEFORE any translation occurs.
 * Returns { valid: boolean, errors: [{ line: number, message: string, suggestion?: string }] }
 */
function validatePseudocode(code) {
    const result = compilerEngine.compile(code);
    return { valid: result.valid, errors: result.errors, warnings: result.warnings };
}

function renderHtmlErrors(errors) {
    let output = '<div style="margin-bottom: 0.5rem; font-family: \'JetBrains Mono\', monospace;"><span class="error-text"># {{ui:CircleX}} Syntax Errors Found:</span></div><div><span style="color: var(--text-muted);">#</span></div>';
    for (const err of errors) {
        let suggestionHtml = '';
        if (err.suggestion) {
            suggestionHtml = `<div><span class="suggestion-text">#   {{ui:Lightbulb}} Suggestion: ${err.suggestion}</span></div>`;
        }
        output += `<div style="margin-bottom: 0.5rem; font-family: 'JetBrains Mono', monospace;"><div><span class="error-text"># Line ${err.line}: ${err.message}</span></div>${suggestionHtml}<div><span style="color: var(--text-muted);">#</span></div></div>`;
    }
    output += '<div style="margin-top: 0.5rem; font-family: \'JetBrains Mono\', monospace;"><span class="error-text"># Fix the pseudocode before translation.</span></div>';
    return output;
}

/**
 * Handle updating the visual editor gutter line numbers dynamically.
 */
function updateGutter() {
    const editor = $id('pseudocode-editor');
    const gutter = $id('editor-gutter');
    if (!editor || !gutter) return;

    const linesCount = Math.max(editor.value.split('\n').length, 1);
    gutter.innerHTML = Array.from({ length: linesCount }, (_, index) => {
        const lineNumber = index + 1;
        const errorClass = currentErrorLineNumbers.includes(lineNumber) ? ' error-line' : '';
        return `<div class="gutter-num${errorClass}">${lineNumber}</div>`;
    }).join('');

    // Refresh highlights layer
    updateHighlights();
}

/**
 * Handle updating the visual editor code highlights overlay dynamically.
 */
function updateHighlights() {
    const editor = $id('pseudocode-editor');
    const highlights = $id('editor-highlights');
    if (!editor || !highlights) return;

    highlights.innerHTML = editor.value.split('\n').map((lineText, index) => {
        const displayContainer = lineText === '' ? '&nbsp;' : escapeHtml(lineText);
        const lineNumber = index + 1;
        const errorClass = currentErrorLineNumbers.includes(lineNumber) ? ' error-highlight-line' : '';
        return `<div class="highlight-line${errorClass}">${displayContainer}</div>`;
    }).join('');

    highlights.scrollTop = editor.scrollTop;
    highlights.scrollLeft = editor.scrollLeft;
}

/**
 * Handle updating the visual Python editor gutter line numbers dynamically.
 */
function updatePythonGutter() {
    const editor = $id('python-output');
    const gutter = $id('python-gutter');
    if (!editor || !gutter) return;

    const linesCount = Math.max(editor.value.split('\n').length, 1);
    gutter.innerHTML = Array.from({ length: linesCount }, (_, index) => `<div class="gutter-num">${index + 1}</div>`).join('');

    updatePythonHighlights();
}

/**
 * Handle updating the visual Python editor code highlights overlay dynamically.
 */
function updatePythonHighlights() {
    const editor = $id('python-output');
    const highlights = $id('python-highlights');
    if (!editor || !highlights) return;

    highlights.innerHTML = editor.value.split('\n').map(lineText => {
        const displayContainer = lineText === '' ? '&nbsp;' : escapeHtml(lineText);
        return `<div class="highlight-line">${displayContainer}</div>`;
    }).join('');

    highlights.scrollTop = editor.scrollTop;
    highlights.scrollLeft = editor.scrollLeft;
}

/**
 * Highlight error lines in the editor with a visual indicator.
 * Uses an overlay div to show error markers.
 */
/**
 * Clear error highlighting from the editor.
 */
function clearEditorErrors(editorId) {
    const editor = $id(editorId);
    if (!editor) return;
    editor.classList.remove('has-errors');

    const panel = editor.closest('.editor-panel');
    if (panel) {
        const errorPanel = panel.querySelector('.validation-error-panel');
        if (errorPanel) errorPanel.remove();
    }
}


