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


