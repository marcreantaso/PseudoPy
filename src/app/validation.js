/* ============================================================
   PSEUDOCODE SYNTAX VALIDATION ENGINE
   Stack-based strict validation with educational error messages
   ============================================================ */

let currentConsoleErrors = [];

function _consoleEscape(str) {
    const value = String(str == null ? '' : str);
    if (typeof document !== 'undefined' && document.createElement) {
        const div = document.createElement('div');
        div.textContent = value;
        return div.innerHTML;
    }
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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
    const list = Array.isArray(errors) ? errors : [];
    const hasSemantic = list.some(e => e && e.stage === 'Semantic Analysis');
    const header = hasSemantic
        ? '# {{ui:CircleX}} Compilation Errors Found:'
        : '# {{ui:CircleX}} Syntax Errors Found:';
    let output = '<div style="margin-bottom: 0.5rem; font-family: \'JetBrains Mono\', monospace;"><span class="error-text">' + header + '</span></div>';

    for (const err of list) {
        const lineLabel = (err && err.line) != null ? 'Line ' + err.line + ': ' : '';
        const icon = err && err.severity === 'warning' ? '{{ui:TriangleAlert}}' : '{{ui:CircleX}}';
        let suggestionHtml = '';
        if (err && err.suggestion) {
            suggestionHtml = '<div><span class="suggestion-text">#   {{ui:Lightbulb}} Suggestion: ' + _consoleEscape(err.suggestion) + '</span></div>';
        }
        let detailsHtml = '';
        if (err) {
            const bits = [];
            if (err.stage) bits.push('Stage: ' + _consoleEscape(err.stage));
            if (err.code) bits.push('Code: ' + _consoleEscape(err.code));
            if (err.received) bits.push('Received: ' + _consoleEscape(err.received));
            if (err.expected) bits.push('Expected: ' + _consoleEscape(err.expected));
            if (err.type) bits.push('Type: ' + _consoleEscape(err.type));
            if (bits.length) {
                detailsHtml = '<details class="console-details" style="margin-top:0.25rem"><summary><span class="suggestion-text"># {{ui:Info}} Technical Details</span></summary>' +
                    bits.map(b => '<div style="color: var(--text-muted);"># &nbsp; ' + b + '</div>').join('') + '</details>';
            }
        }
        output += '<div style="margin-bottom: 0.5rem; font-family: \'JetBrains Mono\', monospace;">' +
            '<div><span class="error-text"># ' + icon + ' ' + _consoleEscape(lineLabel + (err ? err.message : '')) + '</span></div>' +
            suggestionHtml + detailsHtml +
            '<div><span style="color: var(--text-muted);">#</span></div></div>';
    }
    output += '<div style="margin-top: 0.5rem; font-family: \'JetBrains Mono\', monospace;"><span class="error-text"># Fix the errors in your pseudocode before translation.</span></div>';
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
        const consoleErrors = typeof currentConsoleErrors === 'undefined' ? [] : currentConsoleErrors;
        const lineNotes = consoleErrors.filter(e => e && e.line === lineNumber).map(e => String(e.message || ''));
        const titleAttr = lineNotes.length ? ' title="' + _consoleEscape(lineNotes.join(' | ')) + '"' : '';
        return `<div class="highlight-line${errorClass}"${titleAttr}>${displayContainer}</div>`;
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


