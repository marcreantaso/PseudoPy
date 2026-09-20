/* ============================================================
   EDITOR UTILITY FUNCTIONS
   New File, Save
   ============================================================ */

/**
 * New File — clears editor and inserts default template
 */
function newFile() {
    const editor = $id('pseudocode-editor');
    if (editor) editor.value = 'BEGIN\n    // Write your pseudocode here\nEND';
    const pyOutput = $id('python-output');
    if (pyOutput) pyOutput.innerHTML = '';
    const consoleOutput = $id('console-output');
    if (consoleOutput) {
        consoleOutput.textContent = 'New file created. Start writing your pseudocode.';
        consoleOutput.className = 'output-content';
    }
    setText('line-count', '3 lines');
    currentErrorLineNumbers = [];
    clearEditorErrors('pseudocode-editor');
    updateGutter();

    const runBtn = $qs('#page-write-pseudocode .btn-success');
    if (runBtn) runBtn.disabled = false;

    showToast('New file created with template.', 'info');
}

/**
 * Save pseudocode as a .txt file
 */
function savePseudocodeAsFile() {
    const code = getValue('pseudocode-editor');
    if (!code.trim()) { showToast('Nothing to save. Write some pseudocode first.', 'error'); return; }
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pseudocode.txt';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Pseudocode saved as file!', 'success');
}




