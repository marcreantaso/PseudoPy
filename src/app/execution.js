/* ============================================================
   CODE EXECUTION (via Skulpt)
   UX Rule 3: every Run tap answers within one frame — the button
   goes busy immediately, the console area shows a skeleton, and
   program output is batched into one layout per animation frame
   with a 2,000-node cap so long runs never freeze the page.
   ============================================================ */

// Rendered-output cap for the student/instructor/admin consoles. The full
// transcript is retained in memory for submissions; only the DOM is capped
// (same policy as the DevTools console, DEV_CONSOLE_MAX_ROWS).
const RUN_OUTPUT_NODE_CAP = 2000;

const RUN_BUTTON_BY_OUTPUT = {
    'python-output': 'btn-run-code',
    'translate-output': 'btn-run-translate',
    'execute-editor': 'btn-run-execpage',
    'instructor-python-output': 'btn-run-instructor',
    'admin-execute-editor': 'btn-run-admin'
};

/**
 * Busy state for the Run button that started this run: disabled, aria-busy
 * and a visible "Running…" label with an inline spinner (.is-loading-text).
 * The label swap is reverted on completion so the resting label never moves.
 */
function setRunButtonBusy(outputId, busy) {
    const btnId = RUN_BUTTON_BY_OUTPUT[outputId];
    if (!btnId) return;
    const btn = $id(btnId);
    if (!btn) return;
    if (busy) {
        // Preserve the rendered markup (icons included) and restore it after
        // the run so the resting button is byte-identical to before.
        if (!btn.dataset.runHtml) btn.dataset.runHtml = btn.innerHTML;
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
        btn.classList.add('is-loading-text');
        btn.textContent = 'Running…';
    } else {
        btn.disabled = false;
        btn.setAttribute('aria-busy', 'false');
        btn.classList.remove('is-loading-text');
        if (btn.dataset.runHtml) btn.innerHTML = btn.dataset.runHtml;
    }
}

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
    setRunButtonBusy(outputId, true);
    try {
        runPythonCode(code, outputId);
    } catch (e) {
        setRunButtonBusy(outputId, false);
        throw e;
    }
}

function runPythonCode(code, outputElementId) {
    const outputEl = $id(outputElementId);
    if (!outputEl) return;
    outputEl.innerHTML = '';
    outputEl.className = 'output-content';
    // UX Rule 1 + 3: the tap must answer immediately. A layout-matched
    // skeleton appears the moment Run is pressed and is removed as soon as
    // the first real output lands (clearRunSkeleton in appendOutput).
    if (typeof showRunSkeleton === 'function') showRunSkeleton(outputEl);

    if (typeof Sk === 'undefined') {
        outputEl.textContent = 'Loading Python runtime...';
        ensureSkulptLoaded(function () {
            if (typeof Sk !== 'undefined') {
                runPythonCode(code, outputElementId);
            } else {
                outputEl.textContent = 'Skulpt library not loaded.\n\nFalling back to static analysis...\n\n';
                outputEl.textContent += simulateExecution(code);
            }
        }, function () {
            outputEl.textContent = 'Skulpt library not loaded.\n\nFalling back to static analysis...\n\n';
            outputEl.textContent += simulateExecution(code);
        });
        return;
    }

    // The compiler now handles str() wrapping correctly in smartPrintExpr(),
    // so no runtime code fixup is needed. Use code as-is.
    const cleanCode = code;
    const runExercise = exerciseState.activeExercise;
    const runSource = outputElementId === 'console-output' ? getValue('pseudocode-editor') : null;
    const runUser = currentUser;
    const sameExerciseRun = () => runExercise === exerciseState.activeExercise && runUser === currentUser &&
        (outputElementId !== 'console-output' || runSource === getValue('pseudocode-editor'));
    const studentRun = typeof StudentWorkspace !== 'undefined' ? StudentWorkspace.beginRun(outputElementId, code) : null;

    // UX Rule 3: batch Skulpt output into a single layout pass per animation
    // frame (one span per frame, not one per output chunk) and cap the
    // rendered nodes. The full transcript stays in `outputTranscript` so
    // submissions and exercise matching never lose content to the cap.
    let pendingOutputText = '';
    let outputFlushHandle = null;
    let outputTranscript = '';
    const renderedSpans = [];
    let droppedSpans = 0;

    function flushOutput() {
        outputFlushHandle = null;
        if (!pendingOutputText) return;
        if (typeof clearRunSkeleton === 'function') clearRunSkeleton(outputEl);
        const chunk = pendingOutputText;
        pendingOutputText = '';
        const span = document.createElement('span');
        span.textContent = chunk;
        renderedSpans.push(span);
        outputEl.appendChild(span);
        while (renderedSpans.length > RUN_OUTPUT_NODE_CAP) {
            const dropped = renderedSpans.shift();
            if (dropped.parentNode === outputEl) dropped.remove();
            droppedSpans++;
        }
        if (droppedSpans > 0) {
            let notice = outputEl.querySelector('.console-cap-notice');
            if (!notice) {
                notice = document.createElement('div');
                notice.className = 'console-cap-notice';
                notice.setAttribute('role', 'status');
            } else if (notice.parentNode === outputEl) {
                notice.remove();
            }
            notice.textContent = 'Older output trimmed to the most recent ' + RUN_OUTPUT_NODE_CAP + ' chunks — the full transcript is kept for your submission.';
            outputEl.appendChild(notice);
        }
    }

    function scheduleOutputFlush() {
        if (typeof requestAnimationFrame === 'function') {
            if (outputFlushHandle === null) outputFlushHandle = requestAnimationFrame(flushOutput);
        } else {
            flushOutput();
        }
    }

    function flushNow() {
        if (outputFlushHandle !== null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(outputFlushHandle);
            outputFlushHandle = null;
        }
        flushOutput();
    }

    // Helper: append text to the console output (HTML-safe, frame-batched)
    function appendOutput(text) {
        outputTranscript += text;
        pendingOutputText += text;
        scheduleOutputFlush();
    }

    // execLimit must be part of the Sk.configure() payload: Skulpt's compiler
    // bakes the interrupt test into the generated code from this option, so a
    // later `Sk.execLimit = ...` assignment would be ignored and a runaway
    // loop would freeze the tab.
    const execLimitOptions = (typeof skulptExecLimitOptions === 'function')
        ? skulptExecLimitOptions(SKULPT_EXEC_LIMIT_MS)
        : { execLimit: 15000 };

    Sk.configure(Object.assign({
        output: function (text) { appendOutput(text); },
        read: function (x) {
            if (Sk.builtinFiles === undefined || Sk.builtinFiles["files"][x] === undefined) throw "File not found: '" + x + "'";
            return Sk.builtinFiles["files"][x];
        },
        inputfun: function (promptText) {
            return new Promise(function (resolve) {
                flushNow();
                if (typeof clearRunSkeleton === 'function') clearRunSkeleton(outputEl);
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
    }, execLimitOptions));

    Sk.misceval.asyncToPromise(function () {
        return Sk.importMainWithBody("<stdin>", false, cleanCode, true);
    }).then(function () {
        flushNow();
        setRunButtonBusy(outputElementId, false);
        if (typeof clearRunSkeleton === 'function') clearRunSkeleton(outputEl);
        if (!outputTranscript.trim()) outputEl.textContent = 'Code executed successfully (no output).';
        showToast('Code executed successfully!', 'success');
        if (typeof StudentWorkspace !== 'undefined') StudentWorkspace.endRun(studentRun, true, outputTranscript);

        // ── Panel 1: Record successful execution ──
        if (typeof metricsEngine !== 'undefined') {
            metricsEngine.recordExecution(true);
        }

        if (outputElementId === 'console-output' && exerciseState.activeExercise && sameExerciseRun()) {
            exerciseState.isExecuted = true;
            exerciseState.outputMatched = false;
            if (exerciseState.expectedOutputResolved && exerciseState.expectedOutput) {
                const actualOut = outputTranscript.trim();
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
        flushNow();
        setRunButtonBusy(outputElementId, false);
        const errText = String(err && err.toString ? err.toString() : err);
        // A tripped run budget is a stop condition, not a program bug. Say so
        // plainly so the student does not hunt for a syntax error that is not
        // there.
        const timedOut = /exceeded run time limit|TimeoutError/i.test(errText);
        appendOutput('\nError: ' + errText);
        if (timedOut) {
            appendOutput('\n\nStopped after ' + Math.round((typeof SKULPT_EXEC_LIMIT_MS === 'number' ? SKULPT_EXEC_LIMIT_MS : 15000) / 1000) + ' seconds. Check for a loop that never ends.');
        }
        flushNow();
        outputEl.className = 'output-content error';
        showToast(timedOut ? 'Execution stopped: time limit reached.' : 'Runtime error occurred.', 'error');
        if (typeof StudentWorkspace !== 'undefined') StudentWorkspace.endRun(studentRun, false, outputTranscript);

        // ── Panel 1: Record failed execution ──
        if (typeof metricsEngine !== 'undefined') {
            metricsEngine.recordExecution(false, errText);
        }

        if (outputElementId === 'console-output' && exerciseState.activeExercise && sameExerciseRun()) {
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


