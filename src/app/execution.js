/* ============================================================
   CODE EXECUTION (via Skulpt)
   ============================================================ */

function executePython() {
    executeCode('python-output', 'console-output', 'No Python code to execute. Translate first!');
}

function executeFromTranslate() {
    executeCode('translate-output', 'translate-console', 'No Python code to execute.');
}

function executeFromExecPage() {
    executeCode('execute-editor', 'execute-console', 'Please enter some Python code.');
}

function instructorExecute() {
    executeCode('instructor-python-output', 'instructor-console', 'No code to execute. Generate first!');
}

function adminExecute() {
    executeCode('admin-execute-editor', 'admin-console', 'Please enter Python code to execute.');
}

function executeCode(sourceId, outputId, emptyMessage) {
    const sourceEl = $id(sourceId);
    const code = sourceEl ? (sourceEl.tagName === 'TEXTAREA' || sourceEl.tagName === 'INPUT' ? sourceEl.value : sourceEl.textContent || '') : '';
    if (!code.trim()) { showToast(emptyMessage, 'error'); return; }
    runPythonCode(code, outputId);
}

function runPythonCode(code, outputElementId) {
    const outputEl = $id(outputElementId);
    if (!outputEl) return;
    outputEl.innerHTML = '';
    outputEl.className = 'output-content';

    if (typeof Sk === 'undefined') {
        outputEl.textContent = 'Loading Python runtime...';
        const fallback = function () {
            outputEl.textContent = 'Skulpt library not loaded. Please check your internet connection.\n\nFalling back to static analysis...\n\n';
            outputEl.textContent += simulateExecution(code);
        };
        loadScripts(CDN_BASE_URLS.skulpt, function () {
            if (typeof Sk !== 'undefined') {
                runPythonCode(code, outputElementId);
            } else {
                fallback();
            }
        }, fallback);
        return;
    }

    // The compiler now handles str() wrapping correctly in smartPrintExpr(),
    // so no runtime code fixup is needed. Use code as-is.
    const cleanCode = code;
    const studentRun = typeof StudentWorkspace !== 'undefined' ? StudentWorkspace.beginRun(outputElementId, code) : null;

    // Helper: append text to the console output (HTML-safe)
    function appendOutput(text) {
        const span = document.createElement('span');
        span.textContent = text;
        outputEl.appendChild(span);
    }

    Sk.configure({
        output: function (text) { appendOutput(text); },
        read: function (x) {
            if (Sk.builtinFiles === undefined || Sk.builtinFiles["files"][x] === undefined) throw "File not found: '" + x + "'";
            return Sk.builtinFiles["files"][x];
        },
        inputfun: function (promptText) {
            return new Promise(function (resolve) {
                // Create the inline input container
                const container = document.createElement('div');
                container.className = 'skulpt-input-container';

                // Prompt label
                if (promptText) {
                    const label = document.createElement('div');
                    label.className = 'skulpt-input-label';
                    label.textContent = promptText;
                    container.appendChild(label);
                }

                // Input row (input + button)
                const row = document.createElement('div');
                row.className = 'skulpt-input-row';

                const inputField = document.createElement('input');
                inputField.type = 'text';
                inputField.className = 'skulpt-input-field';
                inputField.placeholder = 'Type your answer here...';
                inputField.autocomplete = 'off';

                const submitBtn = document.createElement('button');
                submitBtn.className = 'skulpt-input-btn';
                submitBtn.textContent = 'Submit ↵';

                row.appendChild(inputField);
                row.appendChild(submitBtn);
                container.appendChild(row);
                outputEl.appendChild(container);

                // Scroll to make input visible
                outputEl.scrollTop = outputEl.scrollHeight;
                inputField.focus();

                function submitInput() {
                    const value = inputField.value;
                    // Replace input container with echoed value
                    const echo = document.createElement('div');
                    echo.className = 'skulpt-input-echo';
                    if (promptText) {
                        echo.innerHTML = '<span class="skulpt-echo-prompt">' + escapeHtml(promptText) + '</span> <span class="skulpt-echo-value">' + escapeHtml(value) + '</span>';
                    } else {
                        echo.innerHTML = '<span class="skulpt-echo-prompt">▸ Input:</span> <span class="skulpt-echo-value">' + escapeHtml(value) + '</span>';
                    }
                    container.replaceWith(echo);

                    // Skulpt's inputfun must ALWAYS return a string.
                    // The generated Python handles type conversion (e.g. float(input(...))).
                    resolve(value);

                }

                submitBtn.addEventListener('click', submitInput);
                inputField.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') { e.preventDefault(); submitInput(); }
                });
            });
        },
        inputfunTakesPrompt: true,
        __future__: Sk.python3
    });

    Sk.misceval.asyncToPromise(function () {
        return Sk.importMainWithBody("<stdin>", false, cleanCode, true);
    }).then(function () {
        if (!outputEl.textContent.trim()) outputEl.textContent = 'Code executed successfully (no output).';
        showToast('Code executed successfully!', 'success');
        if (typeof StudentWorkspace !== 'undefined') StudentWorkspace.endRun(studentRun, true, outputEl.textContent);

        // ── Panel 1: Record successful execution ──
        if (typeof metricsEngine !== 'undefined') {
            metricsEngine.recordExecution(true);
        }

        if (outputElementId === 'console-output' && exerciseState.activeExercise) {
            exerciseState.isExecuted = true;
            exerciseState.outputMatched = false;
            if (exerciseState.expectedOutputResolved && exerciseState.expectedOutput) {
                const actualOut = outputEl.textContent.replace('Code executed successfully (no output).', '').trim();
                const expectedOut = (exerciseState.expectedOutput || '').trim();

                if (actualOut === expectedOut) {
                    exerciseState.outputMatched = true;
                } else {
                    console.log(`[Completion] Output mismatch. Expected: "${expectedOut}", Actual: "${actualOut}"`);
                }
            }
            updateExerciseStatus();
        }
    }).catch(function (err) {
        appendOutput('\nError: ' + err.toString());
        outputEl.className = 'output-content error';
        showToast('Runtime error occurred.', 'error');
        if (typeof StudentWorkspace !== 'undefined') StudentWorkspace.endRun(studentRun, false, outputEl.textContent);

        // ── Panel 1: Record failed execution ──
        if (typeof metricsEngine !== 'undefined') {
            metricsEngine.recordExecution(false, err.toString());
        }

        if (outputElementId === 'console-output' && exerciseState.activeExercise) {
            exerciseState.isExecuted = false;
            exerciseState.outputMatched = false;
            updateExerciseStatus();
        }
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function simulateExecution(code) {
    const lines = code.split('\n');
    let output = '';
    for (const line of lines) {
        const match = line.match(/print\((.+)\)/);
        if (match) {
            let val = match[1].trim();
            if (val.startsWith('"') || val.startsWith("'")) {
                output += val.replace(/^["']|["']$/g, '') + '\n';
            } else {
                output += `[expression: ${val}]\n`;
            }
        }
    }
    return output || '(no print statements detected)';
}


