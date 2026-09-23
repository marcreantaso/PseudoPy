/* ============================================================
   PSEUDOCODE → PYTHON TRANSLATION ENGINE
   ============================================================ */

function icon(name, label) {
    const aria = label ? ` aria-label="${label}"` : ' aria-hidden="true"';
    return `<i data-lucide="${name}"${aria}></i>`;
}

function maybeRenderLearningPanel(outputId) {
    if (outputId !== 'python-output') return;
    if (!PseudoPyLearning || !PseudoPyLearning.register || !PseudoPyLearning.register.learningUi) return;
    try {
        PseudoPyLearning.register.learningUi.renderLearningPanel(PseudoPyLearning.lastTranslation);
    } catch (e) {
        /* UI must never break translation */
    }
}

function refreshIcons(root) {
    if (typeof lucide === 'undefined') return;
    lucide.createIcons({ root: root || document, icons: lucide.icons });
}

function runWithAnime(cb) {
    if (typeof anime !== 'undefined' && typeof anime.animate === 'function') { cb(); return; }
    loadScripts(CDN_BASE_URLS.anime, function () {
        if (typeof anime !== 'undefined' && typeof anime.animate === 'function') cb();
    }, function () {});
}

function animateAnalyticsCards() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const analyticsPage = $id('page-analytics');
    if (!analyticsPage || analyticsPage.classList.contains('hidden')) return;
    runWithAnime(function () {
        anime.animate('.an-kpi-card', {
            opacity: [0, 1],
            translateY: [14, 0],
            delay: anime.stagger(70),
            duration: 500,
            ease: 'outCubic'
        });
    });
}

function animateAnalyticsCharts() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const analyticsPage = $id('page-analytics');
    if (!analyticsPage || analyticsPage.classList.contains('hidden')) return;
    runWithAnime(function () {
        const bars = document.querySelectorAll('#chart-submissions .an-bar-inner');
        if (bars.length) {
            anime.animate(bars, {
                scaleY: [0, 1],
                opacity: [0, 1],
                delay: anime.stagger(55),
                duration: 550,
                ease: 'outCubic'
            });
        }
        const donut = $id('an-donut-chart');
        const legend = $id('an-donut-legend');
        if (donut) anime.animate(donut, { scale: [0.8, 1], opacity: [0, 1], duration: 600, ease: 'outBack' });
        if (legend) anime.animate(legend, { opacity: [0, 1], translateX: [12, 0], duration: 450, delay: 180, ease: 'outCubic' });
    });
}

function initializeLucideIcons() {
    refreshIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeLucideIcons);
} else {
    initializeLucideIcons();
}

function translatePseudocodeGeneric(inputId, outputId, consoleId, runBtnSelector, successToast, updateState) {
    try {
        const inputEl = $id(inputId);
        if (!inputEl) return;

        let input = inputEl.value;
        if (!input.trim()) {
            showToast('Please write some pseudocode first.', 'error');
            return;
        }

        const cleanedInput = preprocessPseudocode(input);
        if (cleanedInput !== input) {
            inputEl.value = cleanedInput;
            input = cleanedInput;
        }

        const result = pseudocodeToPython(input);
        const validation = result;

        // Learning layer hook (non-destructive): run the feedback pipeline so
        // the post-translation Learning Panel and evidence store have data.
        // The learning layer must never break translation.
        if (PseudoPyLearning && PseudoPyLearning.register && PseudoPyLearning.register.pipeline) {
            try {
                PseudoPyLearning.lastTranslation = PseudoPyLearning.register.pipeline.run(input, result);
                if (PseudoPyLearning.register.evidenceStore && PseudoPyLearning.register.evidenceStore.capture) {
                    PseudoPyLearning.register.evidenceStore.capture(PseudoPyLearning.lastTranslation);
                }
            } catch (e) {
                console.error('Learning pipeline error:', e);
            }
        } else if (typeof runValidation === 'function' && PseudoPyLearning) {
            try {
                PseudoPyLearning.lastTranslation = {
                    source: input,
                    compile: result,
                    validation: runValidation(result, input)
                };
            } catch (e) {
                /* learning layer must never break translation */
            }
        }
        if (typeof StudentWorkspace !== 'undefined') {
            try { StudentWorkspace.translated(inputId, input, result, PseudoPyLearning.lastTranslation && PseudoPyLearning.lastTranslation.compile === result ? PseudoPyLearning.lastTranslation : null); }
            catch (e) { console.error('Student workspace update failed:', e); }
        }
        const consoleEl = consoleId ? $id(consoleId) : null;
        const runBtn = runBtnSelector ? $qs(runBtnSelector) : null;

        if (!validation.valid) {
            setPythonOutput(outputId, '# Translation failed due to syntax error(s).\n# Please check the console below for details.');
            if (consoleEl) {
                consoleEl.innerHTML = renderHtmlErrors(validation.errors);
                consoleEl.className = 'output-content error';
            }
            if (runBtn) runBtn.disabled = true;
            showToast(`${validation.errors.length} syntax error(s) found. Check the console output.`, 'error');
            if (outputId === 'python-output') {
                currentErrorLineNumbers = validation.errors.map(err => err.line);
                updateGutter();
            }
            maybeRenderLearningPanel(outputId);
            return;
        }

        if (outputId === 'python-output') {
            currentErrorLineNumbers = [];
            updateGutter();
        }

        setPythonOutput(outputId, result.python);
        if (consoleEl) {
            consoleEl.textContent = successToast + (result.warnings.length ? '\n' + result.warnings.map(w => 'Line ' + w.line + ': ' + w.message).join('\n') : '');
            consoleEl.className = 'output-content';
        }
        if (runBtn) runBtn.disabled = false;
        showToast(successToast, 'success');
        maybeRenderLearningPanel(outputId);
        if (typeof updateState === 'function') updateState();
    } catch (e) {
        console.error('Translation Engine Crash:', e);
        const consoleEl = consoleId ? $id(consoleId) : null;
        if (consoleEl) {
            consoleEl.className = 'output-content error';
            consoleEl.textContent = 'System Error during translation: ' + e.message;
        }
        const outputEl = $id(outputId);
        if (outputEl) {
            if (outputEl.tagName === 'TEXTAREA' || outputEl.tagName === 'INPUT') {
                outputEl.value = `# System Error\n# ${e.message}`;
            } else {
                outputEl.textContent = `# System Error\n# ${e.message}`;
            }
        }
        showToast('System Error. Check the output area.', 'error');
    }
}

function translatePseudocode() {
    translatePseudocodeGeneric(
        'pseudocode-editor',
        'python-output',
        'console-output',
        '#page-write-pseudocode .btn-success',
        'Pseudocode translated to Python successfully!',
        () => {
            exerciseState.isTranslated = true;
            updateExerciseStatus();
        }
    );
}

function translateFromPage() {
    translatePseudocodeGeneric(
        'translate-input',
        'translate-output',
        'translate-console',
        null,
        'Translation complete!'
    );
}

function instructorTranslate() {
    translatePseudocodeGeneric(
        'instructor-pseudo-input',
        'instructor-python-output',
        'instructor-console',
        null,
        'Python code generated!'
    );
}

const compilerEngine = new PseudocodeCompiler();


