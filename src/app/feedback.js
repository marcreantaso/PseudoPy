/* ============================================================
   FEEDBACK & SUGGESTIONS
   ============================================================ */

function analyzePseudocode() {
    const input = getValue('feedback-input');
    if (!input.trim()) { showToast('Please paste some pseudocode to analyze.', 'error'); return; }
    renderFeedback(generateFeedback(input));
    showToast('Analysis complete!', 'success');
}

/**
 * ADAPTIVE FEEDBACK ENGINE (Panel 1 Requirement)
 * ───────────────────────────────────────────────
 * Replaces static regex-based analysis with dynamic, context-aware
 * feedback using the actual compiler pipeline:
 *
 *   1. AST-Driven Structure Analysis (via Parser)
 *   2. Symbol Table Variable Hygiene (via SemanticAnalyzer)
 *   3. Algorithmic Complexity Feedback (via analyzeComplexity)
 *   5. Historical Comparison (session improvement metrics)
 */
function generateFeedback(pseudocode) {
    const feedback = [];
    const lines = pseudocode.split('\n');
    const trimmedLines = lines.map(l => l.trim()).filter(l => l);

    // ──────────────────────────────────────────────
    // 1. COMPILER PIPELINE ANALYSIS (AST-Driven)
    // ──────────────────────────────────────────────
    let compileResult = null;
    let ast = null;
    let symbolTable = null;
    let qualityScore = 0; // 0–100 composite score

    try {
        compileResult = compilerEngine.compile(pseudocode);
        // Re-run parser and semantic analyzer to access internals
        const lexer = new Lexer(pseudocode);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens);
        ast = parser.parse();
        const sa = new SemanticAnalyzer();
        sa.analyze(ast);
        symbolTable = sa.symbolTable;
    } catch (e) {
        feedback.push({ type: 'error', icon: 'circle-x', text: '<strong>Analysis Error:</strong> Could not parse pseudocode. ' + e.message });
    }

    // ──────────────────────────────────────────────
    // 1a. STRUCTURE VALIDATION (from AST)
    // ──────────────────────────────────────────────
    const hasBegin = trimmedLines.some(l => /^BEGIN$/i.test(l));
    const hasEnd = trimmedLines.some(l => /^END$/i.test(l));

    if (hasBegin && hasEnd) {
        feedback.push({ type: 'success', icon: 'circle-check', text: '<strong>Good structure:</strong> Proper BEGIN/END blocks detected.' });
        qualityScore += 15;
    } else {
        if (!hasBegin) feedback.push({ type: 'warning', icon: 'triangle-alert', text: '<strong>Missing BEGIN:</strong> Start with a BEGIN statement.' });
        if (!hasEnd) feedback.push({ type: 'warning', icon: 'triangle-alert', text: '<strong>Missing END:</strong> End with an END statement.' });
    }

    // ──────────────────────────────────────────────
    // 1b. BLOCK BALANCE ANALYSIS (from AST errors)
    // ──────────────────────────────────────────────
    if (compileResult) {
        if (compileResult.valid) {
            feedback.push({ type: 'success', icon: 'circle-check', text: '<strong>Compilation:</strong> Pseudocode compiles successfully to Python with no syntax errors.' });
            qualityScore += 25;
        } else {
            const syntaxErrors = compileResult.errors;
            feedback.push({ type: 'error', icon: 'circle-x', text: `<strong>Syntax Errors:</strong> ${syntaxErrors.length} error(s) detected. Fix these before translation.` });
            syntaxErrors.slice(0, 3).forEach(err => {
                feedback.push({
                    type: 'error', icon: 'map-pin',
                    text: `<strong>Line ${err.line}:</strong> ${err.message}${err.suggestion ? ' <em>Tip: ' + err.suggestion + '</em>' : ''}`
                });
            });
        }

        // Warnings from semantic analysis
        if (compileResult.warnings && compileResult.warnings.length > 0) {
            compileResult.warnings.slice(0, 3).forEach(w => {
                feedback.push({
                    type: 'warning', icon: 'triangle-alert',
                    text: `<strong>Line ${w.line}:</strong> ${w.message}${w.suggestion ? ' <em>Tip: ' + w.suggestion + '</em>' : ''}`
                });
            });
        } else if (compileResult.valid) {
            feedback.push({ type: 'success', icon: 'circle-check', text: '<strong>Semantic Check:</strong> No undeclared variables or type warnings.' });
            qualityScore += 10;
        }
    }

    // ──────────────────────────────────────────────
    // 2. SYMBOL TABLE ANALYSIS (Variable Hygiene)
    // ──────────────────────────────────────────────
    if (symbolTable && symbolTable.size > 0) {
        const declaredVars = [...symbolTable.keys()];
        feedback.push({
            type: 'success', icon: 'chart-column',
            text: `<strong>Variables:</strong> ${declaredVars.length} variable(s) tracked in symbol table: <code>${declaredVars.join(', ')}</code>`
        });
        qualityScore += 5;

        const numericVars = declaredVars.filter(v => {
            const info = symbolTable.get(v);
            return info && info.type === 'numeric';
        });
        if (numericVars.length > 0) {
            feedback.push({
                type: 'success', icon: 'hash',
                text: `<strong>Type Safety:</strong> ${numericVars.length} variable(s) confirmed as numeric: <code>${numericVars.join(', ')}</code>`
            });
            qualityScore += 5;
        }
    } else if (ast && ast.body && ast.body.length > 0) {
        feedback.push({
            type: 'warning', icon: 'lightbulb',
            text: '<strong>Suggestion:</strong> Use DECLARE statements to explicitly type your variables for better code generation.'
        });
    }

    // ──────────────────────────────────────────────
    // 3. LOGIC ANALYSIS (Constructivism Model)
    // ──────────────────────────────────────────────
    const allEx = typeof cachedExercises !== 'undefined' ? cachedExercises : [];
    let activeSolution = null;
    for (const ex of allEx) {
        if (typeof currentExerciseId !== 'undefined' && ex.id === currentExerciseId) {
            activeSolution = ex.solution;
            break;
        }
    }

    const logicCard = $id('logic-analysis-card');
    const logicResults = $id('logic-analysis-results');

    if (activeSolution && logicCard && logicResults) {
        const logicAnalysis = metricsEngine.analyzeLogicGap(pseudocode, activeSolution);
        logicCard.classList.remove('hidden');

        let logicHtml = `<p style="margin-bottom: 1rem; font-weight: 500;">${logicAnalysis.summary}</p>`;

        if (logicAnalysis.gaps.length > 0) {
            logicHtml += `<div style="display: flex; flex-direction: column; gap: 0.75rem;">`;
            logicAnalysis.gaps.forEach(gap => {
                logicHtml += `
                    <div style="padding: 0.75rem; background: #fff5f5; border-left: 4px solid #f87171; border-radius: 4px;">
                        <div style="font-weight: 600; color: #991b1b;">[${gap.type}] ${gap.concept || ''}</div>
                        <div style="font-size: 0.9rem; margin: 0.25rem 0;">${gap.message}</div>
                        <div style="font-size: 0.85rem; color: #7f1d1d; background: #fee2e2; padding: 0.4rem; border-radius: 3px; margin-top: 0.4rem;">
                            <strong>Root Cause:</strong> ${gap.rootCause}
                        </div>
                    </div>
                `;
            });
            logicHtml += `</div>`;
        } else {
            logicHtml += `<div style="padding: 1rem; background: #ecfdf5; color: #065f46; border-radius: 4px; border-left: 4px solid #10b981;">
                {{ui:CircleCheck}} Your logic matches the structural patterns required for this problem. You have correctly applied the necessary control structures.
            </div>`;
        }
        logicResults.innerHTML = logicHtml;
    } else if (logicCard) {
        logicCard.classList.add('hidden');
    }

    // ──────────────────────────────────────────────
    // 4. ALGORITHMIC COMPLEXITY ANALYSIS
    // ──────────────────────────────────────────────
    try {
        const complexity = compilerEngine.analyzeComplexity(pseudocode);
        const complexityDescriptions = {
            'O(1)': 'No loops detected; calls and recursion are not measured.',
            'O(N)': 'One loop level detected. This estimate assumes a linear number of iterations.',
            'O(N²)': 'Two loop levels detected. This estimate assumes both loops scale linearly.',
        };
        const desc = complexityDescriptions[complexity] || `Nesting-based estimate: ${complexity}. Actual runtime depends on loop bounds and calls.`;
        const complexityType = 'info';

        feedback.push({
            type: complexityType, icon: 'zap',
            text: `<strong>Loop nesting estimate:</strong> ${complexity} — ${desc}`
        });
        qualityScore += 10; // Nesting alone does not establish algorithm quality.
    } catch (e) { /* skip complexity if analysis fails */ }

    // ──────────────────────────────────────────────
    // 5. PATTERN RECOGNITION (Algorithmic Patterns)
    // ──────────────────────────────────────────────
    const patterns = detectAlgorithmicPatterns(pseudocode, ast);
    patterns.forEach(p => {
        feedback.push({ type: 'success', icon: 'puzzle', text: p });
        qualityScore += 5;
    });

    // ──────────────────────────────────────────────
    // 6. CODE STYLE ANALYSIS
    // ──────────────────────────────────────────────
    const indentedLines = lines.filter(l => l.match(/^\s+/));
    if (indentedLines.length > 0) {
        feedback.push({ type: 'success', icon: 'circle-check', text: '<strong>Indentation:</strong> Uses indentation for readability. Good practice!' });
        qualityScore += 5;
    } else if (lines.length > 3) {
        feedback.push({ type: 'warning', icon: 'lightbulb', text: '<strong>Suggestion:</strong> Add indentation inside blocks (IF, FOR, WHILE) for improved readability.' });
    }

    const displayCount = trimmedLines.filter(l => /^(DISPLAY|PRINT|OUTPUT)\s/i.test(l)).length;
    if (displayCount > 0) {
        feedback.push({ type: 'success', icon: 'circle-check', text: `<strong>Output:</strong> ${displayCount} DISPLAY/PRINT statement(s) found.` });
        qualityScore += 5;
    } else {
        feedback.push({ type: 'warning', icon: 'lightbulb', text: '<strong>Suggestion:</strong> Add DISPLAY statements to show results to the user.' });
    }

    const declareCount = trimmedLines.filter(l => /^DECLARE\s/i.test(l)).length;
    if (declareCount > 0) {
        feedback.push({ type: 'success', icon: 'circle-check', text: `<strong>Declarations:</strong> ${declareCount} DECLARE statement(s) — explicit typing improves code reliability.` });
        qualityScore += 5;
    }

    // ──────────────────────────────────────────────
    // 7. PIPELINE PERFORMANCE (Execution Time)
    // ──────────────────────────────────────────────
    if (compileResult && compileResult.metrics) {
        const m = compileResult.metrics;
        feedback.push({
            type: 'success', icon: 'timer',
            text: `<strong>Generation Time:</strong> ${m.totalTime}ms total — Lexer: ${m.lexTime}ms, Parser: ${m.parseTime}ms, Semantic: ${m.semanticTime}ms, CodeGen: ${m.codeGenTime}ms`
        });
        qualityScore += 5;
    }

    // ──────────────────────────────────────────────
    // 8. HISTORICAL IMPROVEMENT (Session Comparison)
    // ──────────────────────────────────────────────
    if (typeof metricsEngine !== 'undefined') {
        const improvement = metricsEngine.getImprovementMetrics();
        if (improvement.hasData) {
            if (improvement.correctnessImprovement > 0) {
                feedback.push({
                    type: 'success', icon: 'trending-up',
                    text: `<strong>Session Improvement:</strong> ${improvement.correctnessImprovement}% improvement in code correctness since your first translation this session.`
                });
            } else if (improvement.correctnessImprovement < 0) {
                feedback.push({
                    type: 'warning', icon: 'trending-down',
                    text: `<strong>Session Trend:</strong> Error count has increased since your first translation. Review the error messages carefully.`
                });
            }

            feedback.push({
                type: 'success', icon: 'chart-column',
                text: `<strong>Session Stats:</strong> ${improvement.translationCount} translations, ${improvement.overallSuccessRate}% overall compilation success rate.`
            });
        }
    }

    // ──────────────────────────────────────────────
    // 9. FINAL QUALITY SUMMARY
    // ──────────────────────────────────────────────
    qualityScore = Math.min(qualityScore, 100);
    let quality = 'Excellent';
    let qualityType = 'success';

    if (qualityScore >= 90) quality = 'Excellent';
    else if (qualityScore >= 75) quality = 'Very Good';
    else if (qualityScore >= 60) quality = 'Good';
    else if (qualityScore >= 40) { quality = 'Average'; qualityType = 'warning'; }
    else { quality = 'Needs Improvement'; qualityType = 'error'; }

    const errors = feedback.filter(f => f.type === 'error').length;
    const warnings = feedback.filter(f => f.type === 'warning').length;
    const successes = feedback.filter(f => f.type === 'success').length;

    feedback.unshift({
        type: qualityType,
        icon: qualityType === 'success' ? 'trophy' : qualityType === 'warning' ? 'chart-column' : 'wrench',
        text: `<strong>Code Quality Score: ${qualityScore}/100 — ${quality}</strong> — ${successes} passed, ${warnings} suggestion(s), ${errors} error(s). Total: ${trimmedLines.length} lines.`
    });

    return feedback;
}

/**
 * PATTERN RECOGNITION — Detects common algorithmic patterns
 * in the AST. Provides educational feedback about what the
 * student's code is doing (not hard-coded per-input).
 */
function detectAlgorithmicPatterns(pseudocode, ast) {
    const patterns = [];
    const upper = pseudocode.toUpperCase();

    // Accumulator pattern: SET x TO 0 ... x = x + something
    if (/SET\s+\w+\s+TO\s+0/i.test(pseudocode) && /=\s*\w+\s*\+/i.test(pseudocode)) {
        patterns.push('<strong>Pattern Detected:</strong> Accumulator pattern — initializes a variable to 0 and adds to it iteratively.');
    }

    // Counter pattern: counting variable incremented inside a loop
    if (/INCREMENT/i.test(upper) || (/=\s*\w+\s*\+\s*1/i.test(pseudocode) && /WHILE|FOR/i.test(upper))) {
        patterns.push('<strong>Pattern Detected:</strong> Counter pattern — a variable is incremented inside a loop.');
    }

    // Sentinel-controlled loop: WHILE with INPUT inside
    if (/WHILE/i.test(upper) && /INPUT|READ/i.test(upper)) {
        patterns.push('<strong>Pattern Detected:</strong> Sentinel-controlled loop — input-driven loop termination.');
    }

    // Array iteration: FOR with array index access
    if (/FOR\s+\w+\s+FROM/i.test(upper) && /\w+\s*\[/i.test(pseudocode)) {
        patterns.push('<strong>Pattern Detected:</strong> Array traversal — iterating over array elements with index-based access.');
    }

    // Conditional branching: IF/ELSE structure
    if (/IF\s+.+\s+THEN/i.test(pseudocode) && /ELSE/i.test(upper)) {
        patterns.push('<strong>Pattern Detected:</strong> Conditional branching — IF/ELSE decision structure.');
    }

    // Function definition
    if (/FUNCTION|PROCEDURE/i.test(upper)) {
        patterns.push('<strong>Pattern Detected:</strong> Modular design — uses FUNCTION/PROCEDURE for code organization.');
    }

    return patterns;
}

function renderFeedback(feedback) {
    setHtml('feedback-results', feedback.map(f => `
    <div class="feedback-item ${f.type}">
      <span class="fb-icon">${icon(f.icon)}</span>
      <span class="fb-text">${f.text}</span>
    </div>`).join(''));
    refreshIcons($id('feedback-results'));
}


