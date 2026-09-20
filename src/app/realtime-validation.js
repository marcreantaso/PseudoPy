/* ============================================================
   REAL-TIME VALIDATION (Bonus)
   Debounced validation while typing
   ============================================================ */

let validationTimer = null;

function setupRealtimeValidation() {
    const editor = $id('pseudocode-editor');
    if (!editor) return;

    // Real-time validation runs silently — errors only shown on Translate
    editor.addEventListener('input', () => {
        clearTimeout(validationTimer);
        validationTimer = setTimeout(() => {
            const code = editor.value.trim();
            if (!code) return;
            // Silent validation — no visual indicators in the editor
            // Errors are only shown in Python Output when user clicks Translate
        }, 1000);
    });
}


