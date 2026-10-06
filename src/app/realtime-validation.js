/* ============================================================
   REAL-TIME VALIDATION (Bonus)
   Debounced silent validation while typing.
   Runs the REAL compiler with debugger tracing off, so editors
   and the Review wand share one quiet, low-cost validation path.
   IME composition is excluded until the composition ends.
   ============================================================ */

let validationTimer = null;
let realtimeValidationHandler = null;

function setRealtimeValidationHandler(fn) {
    realtimeValidationHandler = typeof fn === 'function' ? fn : null;
}

function setupRealtimeValidation() {
    const editor = $id('pseudocode-editor');
    if (!editor) return;

    const run = () => {
        clearTimeout(validationTimer);
        validationTimer = setTimeout(() => {
            if (editor.dataset.composing === 'true') return;
            const code = editor.value;
            if (!code.trim()) {
                if (realtimeValidationHandler) realtimeValidationHandler(null);
                return;
            }
            let result;
            try {
                const tracing = typeof compilerTrace !== 'undefined' ? compilerTrace.enabled : false;
                const simulation = typeof simulationTracer !== 'undefined' ? simulationTracer.enabled : false;
                if (typeof compilerTrace !== 'undefined') compilerTrace.enabled = false;
                if (typeof simulationTracer !== 'undefined') simulationTracer.enabled = false;
                try {
                    result = compilerEngine.compile(code);
                } finally {
                    if (typeof compilerTrace !== 'undefined') compilerTrace.enabled = tracing;
                    if (typeof simulationTracer !== 'undefined') simulationTracer.enabled = simulation;
                }
            } catch (error) {
                result = { valid: false, python: '', warnings: [], errors: [{ line: 1, message: error && error.message || String(error) }] };
            }
            if (realtimeValidationHandler) realtimeValidationHandler({ source: code, result: result });
        }, 1000);
    };

    editor.addEventListener('input', run);
    editor.addEventListener('compositionstart', () => { editor.dataset.composing = 'true'; });
    editor.addEventListener('compositionend', () => { editor.dataset.composing = 'false'; run(); });
}