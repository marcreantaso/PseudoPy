/* ============================================================
   PSEUDOPY — METRICS ENGINE  (metrics.js)
   ────────────────────────────────────────────────────────────
   Formal Evaluation Module — Mathematical Metrics Pipeline

   Formulas implemented (as specified):

   A. CODE NORMALIZATION (pre-processing)
      • Strip trailing whitespace from each line
      • Unify indentation to 4 spaces (expand tabs, normalise leading spaces)
      • Remove empty lines
      (Applied to both generated_python and expected_python before any comparison)

   B. EXACT-MATCH ACCURACY
      Accuracy = (Total Exact Code Matches / Total Test Submissions) × 100%

   C. LINE-LEVEL PRECISION, RECALL, F1
      Precision = Matching Lines / Total Lines in Generated Code
      Recall    = Matching Lines / Total Lines in Ground Truth
      F1 Score  = 2 × (Precision × Recall) / (Precision + Recall)
      Edge-case: if Precision + Recall = 0  →  F1 = 0.0  (no division-by-zero)

   D. COMPILATION & RUNTIME SUCCESS RATES
      Compile Rate      = % of translations that pass AST/Syntax parsing without errors
      Runtime Error Rate = % of compiled scripts that crash during execution

   E. CONCEPT MASTERY ANALYTICS (Constructivism Model)
      Group by programming concept, assign Mastery Level by accuracy:
        Expert      : Accuracy ≥ 80%
        Proficient  : 65% ≤ Accuracy < 80%
        Developing  : 40% ≤ Accuracy < 65%
        Beginner    : Accuracy < 40%

   Constraint: Fully offline. localStorage for persistence.
   ============================================================ */

class MetricsEngine {
    constructor() {
        this.sessionId         = 'session_' + Date.now();
        this.translations      = [];     // per-translation records (live session)
        this.executions        = [];     // per-execution records   (live session)
        this.benchmarkResults  = null;   // latest benchmark run

        // Load persisted history
        this.history = this._loadHistory();
    }

    // ══════════════════════════════════════════════════════════════
    // PERSISTENCE
    // ══════════════════════════════════════════════════════════════

    _loadHistory() {
        try {
            const raw = localStorage.getItem('pseudopy_metrics_history');
            return raw ? JSON.parse(raw) : { sessions: [], benchmarks: [] };
        } catch {
            return { sessions: [], benchmarks: [] };
        }
    }

    _saveHistory() {
        try {
            localStorage.setItem('pseudopy_metrics_history', JSON.stringify(this.history));
        } catch (e) {
            console.warn('[Metrics] Failed to save history:', e);
        }
    }

    // ══════════════════════════════════════════════════════════════
    // TRANSLATION RECORDING  (called after every compile())
    // ══════════════════════════════════════════════════════════════

    recordTranslation(compileResult, inputCode) {
        const record = {
            timestamp:     Date.now(),
            sessionId:     this.sessionId,
            inputLength:   inputCode.length,
            inputLines:    inputCode.split('\n').length,
            valid:         compileResult.valid,
            errorCount:    compileResult.errors.length,
            warningCount:  compileResult.warnings.length,
            outputLength:  compileResult.python ? compileResult.python.length : 0,
            outputLines:   compileResult.python ? compileResult.python.split('\n').length : 0,
            timing:        compileResult.metrics || null,
            errors:        compileResult.errors.map(e => ({ line: e.line, message: e.message }))
        };
        this.translations.push(record);
        this._saveHistory();
        return record;
    }

    // ══════════════════════════════════════════════════════════════
    // EXECUTION RECORDING  (called after every Skulpt execution)
    // ══════════════════════════════════════════════════════════════

    recordExecution(success, errorMessage = null) {
        const record = {
            timestamp: Date.now(),
            sessionId: this.sessionId,
            success,
            error: errorMessage
        };
        this.executions.push(record);
        this._saveHistory();
        return record;
    }

    // ══════════════════════════════════════════════════════════════
    // SESSION METRICS  (live, current session)
    // ══════════════════════════════════════════════════════════════

    getSessionMetrics() {
        const totalTranslations       = this.translations.length;
        const successfulTranslations  = this.translations.filter(t => t.valid).length;
        const compilationSuccessRate  = totalTranslations > 0
            ? ((successfulTranslations / totalTranslations) * 100).toFixed(1)
            : '0.0';

        const totalExecutions    = this.executions.length;
        const failedExecutions   = this.executions.filter(e => !e.success).length;
        // D. Runtime Error Rate = compiled scripts that crash during execution / total executions
        const runtimeErrorRate   = totalExecutions > 0
            ? ((failedExecutions / totalExecutions) * 100).toFixed(1)
            : '0.0';

        const timedTranslations  = this.translations.filter(t => t.timing && t.timing.totalTime);
        const avgGenerationTime  = timedTranslations.length > 0
            ? (timedTranslations.reduce((s, t) => s + t.timing.totalTime, 0) / timedTranslations.length).toFixed(2)
            : '0.00';

        const totalErrors        = this.translations.reduce((s, t) => s + t.errorCount, 0);

        // Error trend: compare first half vs second half
        let errorTrend = 'stable';
        if (totalTranslations >= 4) {
            const mid             = Math.floor(totalTranslations / 2);
            const firstHalfErrors = this.translations.slice(0, mid).reduce((s, t) => s + t.errorCount, 0);
            const secondHalfErrors = this.translations.slice(mid).reduce((s, t) => s + t.errorCount, 0);
            if (secondHalfErrors < firstHalfErrors) errorTrend = 'improving';
            else if (secondHalfErrors > firstHalfErrors) errorTrend = 'declining';
        }

        return {
            sessionId: this.sessionId,
            totalTranslations,
            successfulTranslations,
            failedTranslations: totalTranslations - successfulTranslations,
            compilationSuccessRate: parseFloat(compilationSuccessRate),
            totalExecutions,
            successfulExecutions: totalExecutions - failedExecutions,
            failedExecutions,
            runtimeErrorRate: parseFloat(runtimeErrorRate),
            avgGenerationTime: parseFloat(avgGenerationTime),
            totalErrors,
            totalWarnings: this.translations.reduce((s, t) => s + t.warningCount, 0),
            errorTrend
        };
    }

    // ══════════════════════════════════════════════════════════════
    // IMPROVEMENT TRACKING
    // ══════════════════════════════════════════════════════════════

    getImprovementMetrics() {
        if (this.translations.length < 2) {
            return { hasData: false, message: 'Need at least 2 translations to calculate improvement.' };
        }

        const first  = this.translations[0];
        const latest = this.translations[this.translations.length - 1];

        let correctnessImprovement = 0;
        if (first.errorCount > 0) {
            correctnessImprovement = ((first.errorCount - latest.errorCount) / first.errorCount * 100).toFixed(1);
        } else if (latest.errorCount === 0) {
            correctnessImprovement = 100;
        }

        let speedImprovement = 0;
        if (first.timing && latest.timing && first.timing.totalTime > 0) {
            speedImprovement = ((first.timing.totalTime - latest.timing.totalTime) / first.timing.totalTime * 100).toFixed(1);
        }

        const successfulTranslations = this.translations.filter(t => t.valid).length;
        const overallSuccessRate = ((successfulTranslations / this.translations.length) * 100).toFixed(1);

        return {
            hasData: true,
            firstErrors:              first.errorCount,
            latestErrors:             latest.errorCount,
            correctnessImprovement:   parseFloat(correctnessImprovement),
            speedImprovement:         parseFloat(speedImprovement),
            overallSuccessRate:       parseFloat(overallSuccessRate),
            translationCount:         this.translations.length
        };
    }

    // ══════════════════════════════════════════════════════════════
    // BENCHMARK RUNNER
    // Runs automated tests against an array of ground-truth test cases.
    // Each test case must have: { id, concept, pseudocode, python_code }
    // ══════════════════════════════════════════════════════════════

    runBenchmark(dataset, compiler) {
        const results          = [];
        let exactMatches       = 0;
        let totalPrecision     = 0;
        let totalRecall        = 0;
        let compilationSuccesses = 0;
        let totalTimingMs      = 0;
        let n                  = 0;

        for (const testCase of dataset) {
            // Skip records without usable ground truth
            const expected = testCase.python_code || testCase.pythonCode || '';
            const pseudocode = testCase.pseudocode || '';
            if (!pseudocode || !expected) continue;

            n++;

            const t0            = performance.now();
            const compileResult = compiler.compile(pseudocode);
            const elapsed       = performance.now() - t0;
            totalTimingMs      += elapsed;

            const generated = compileResult.python || '';

            // D. Compilation success = passed AST/Syntax parsing without errors
            const compiled = compileResult.valid;
            if (compiled) compilationSuccesses++;

            // A → B. Normalize both sides, then exact-match
            const normGenerated = this._normalizeCode(generated);
            const normExpected  = this._normalizeCode(expected);
            const exactMatch    = (normGenerated === normExpected);
            if (exactMatch) exactMatches++;

            // C. Line-level Precision, Recall, F1
            const { precision, recall, f1 } = this._calculatePRF(normGenerated, normExpected);
            totalPrecision += precision;
            totalRecall    += recall;

            results.push({
                id:         testCase.id || testCase._docId || `test_${n}`,
                concept:    testCase.concept || 'General',
                difficulty: testCase.difficulty || 'medium',
                compiled,
                exactMatch,
                precision:  parseFloat(precision.toFixed(4)),
                recall:     parseFloat(recall.toFixed(4)),
                f1:         parseFloat(f1.toFixed(4)),
                timeMs:     parseFloat(elapsed.toFixed(2)),
                errorCount: compileResult.errors.length,
                generated,
                expected
            });
        }

        if (n === 0) {
            return {
                totalTestCases: 0, accuracy: 0, compilationSuccessRate: 0,
                avgPrecision: 0, avgRecall: 0, f1Score: 0, avgTimeMs: 0, results: []
            };
        }

        // B. Accuracy = (exact matches / total) × 100
        const accuracy               = parseFloat(((exactMatches / n) * 100).toFixed(1));
        // D. Compile Rate = % passing AST/Syntax
        const compilationSuccessRate = parseFloat(((compilationSuccesses / n) * 100).toFixed(1));

        const avgPrecision = parseFloat(((totalPrecision / n) * 100).toFixed(1));
        const avgRecall    = parseFloat(((totalRecall    / n) * 100).toFixed(1));
        const avgTimeMs    = parseFloat((totalTimingMs   / n).toFixed(2));

        // C. Overall F1 using averaged P & R (with edge-case guard)
        let f1Score = 0.0;
        if (avgPrecision + avgRecall > 0) {
            f1Score = parseFloat(
                ((2 * avgPrecision * avgRecall) / (avgPrecision + avgRecall)).toFixed(1)
            );
        }

        const benchmarkData = {
            timestamp:            Date.now(),
            dateString:           new Date().toISOString().split('T')[0],
            totalTestCases:       n,
            accuracy,
            compilationSuccessRate,
            avgPrecision,
            avgRecall,
            f1Score,
            avgTimeMs,
            totalTimeMs:          parseFloat(totalTimingMs.toFixed(2)),
            results
        };

        this.benchmarkResults = benchmarkData;

        // Persist summary to history
        this.history.benchmarks.push({
            timestamp:            benchmarkData.timestamp,
            accuracy:             benchmarkData.accuracy,
            compilationSuccessRate: benchmarkData.compilationSuccessRate,
            avgPrecision:         benchmarkData.avgPrecision,
            avgRecall:            benchmarkData.avgRecall,
            f1Score:              benchmarkData.f1Score,
            avgTimeMs:            benchmarkData.avgTimeMs
        });
        this._saveHistory();

        return benchmarkData;
    }

    // ══════════════════════════════════════════════════════════════
    // A. CODE NORMALIZATION  (pre-processing)
    //   • Strip trailing whitespace from every line
    //   • Unify indentation to 4 spaces (expand tabs, normalise leading spaces)
    //   • Remove empty lines
    // ══════════════════════════════════════════════════════════════

    _normalizeCode(code) {
        if (!code) return '';
        return code
            .split('\n')
            .map(line => line.replace(/\t/g, '    '))  // expand tabs → 4 spaces
            .map(line => {
                // Preserve leading spaces (indentation) but strip trailing whitespace
                const stripped = line.trimEnd();
                // Normalise indentation: round to nearest 4-space boundary
                const match = stripped.match(/^(\s*)(.*)/);
                if (!match) return stripped;
                const [, leading, rest] = match;
                const spaces = leading.length;
                const normalSpaces = Math.round(spaces / 4) * 4;
                return ' '.repeat(normalSpaces) + rest;
            })
            .filter(line => line.trim().length > 0)  // remove empty / whitespace-only lines
            .join('\n')
            .trimEnd();
    }

    // ══════════════════════════════════════════════════════════════
    // C. LINE-LEVEL PRECISION, RECALL, F1
    // Uses the normalised code from _normalizeCode().
    // ══════════════════════════════════════════════════════════════

    _calculatePRF(normGenerated, normExpected) {
        const genLines = normGenerated.split('\n').filter(l => l.trim().length > 0);
        const expLines = normExpected.split('\n').filter(l => l.trim().length > 0);

        if (genLines.length === 0 && expLines.length === 0) return { precision: 1, recall: 1, f1: 1 };
        if (genLines.length === 0 || expLines.length === 0) return { precision: 0, recall: 0, f1: 0 };

        const expSet = new Set(expLines);
        const genSet = new Set(genLines);

        // Matching lines in generated that exist in expected
        let matchingInGen = 0;
        for (const line of genLines) {
            if (expSet.has(line)) matchingInGen++;
        }

        // Matching lines in expected that exist in generated
        let matchingInExp = 0;
        for (const line of expLines) {
            if (genSet.has(line)) matchingInExp++;
        }

        // Precision = Matching Lines / Total Lines in Generated Code
        const precision = matchingInGen / genLines.length;

        // Recall = Matching Lines / Total Lines in Ground Truth
        const recall = matchingInExp / expLines.length;

        // F1 Score = 2 × (Precision × Recall) / (Precision + Recall)
        // Edge-case: if Precision + Recall = 0, return F1 = 0.0
        const f1 = (precision + recall > 0)
            ? (2 * precision * recall) / (precision + recall)
            : 0.0;

        return { precision, recall, f1 };
    }

    // (Legacy alias for existing callers)
    _calculatePrecisionRecall(generated, expected) {
        const normG = this._normalizeCode(generated);
        const normE = this._normalizeCode(expected);
        const { precision, recall } = this._calculatePRF(normG, normE);
        return { precision, recall };
    }

    // ══════════════════════════════════════════════════════════════
    // PIPELINE TIMING SUMMARY
    // ══════════════════════════════════════════════════════════════

    getAveragePipelineTiming() {
        const timed = this.translations.filter(t => t.timing);
        if (timed.length === 0) {
            return { count: 0, avgLexTime: 0, avgParseTime: 0, avgSemanticTime: 0, avgCodeGenTime: 0, avgTotalTime: 0 };
        }
        const n = timed.length;
        return {
            count:           n,
            avgLexTime:      parseFloat((timed.reduce((s, t) => s + (t.timing.lexTime      || 0), 0) / n).toFixed(3)),
            avgParseTime:    parseFloat((timed.reduce((s, t) => s + (t.timing.parseTime    || 0), 0) / n).toFixed(3)),
            avgSemanticTime: parseFloat((timed.reduce((s, t) => s + (t.timing.semanticTime || 0), 0) / n).toFixed(3)),
            avgCodeGenTime:  parseFloat((timed.reduce((s, t) => s + (t.timing.codeGenTime  || 0), 0) / n).toFixed(3)),
            avgTotalTime:    parseFloat((timed.reduce((s, t) => s + (t.timing.totalTime    || 0), 0) / n).toFixed(3))
        };
    }

    // ══════════════════════════════════════════════════════════════
    // E. CONCEPT MASTERY ANALYTICS (Constructivism Model)
    //    Group by concept, assign mastery level by exact-match accuracy.
    //
    //    Thresholds (as specified):
    //      Expert      : Accuracy ≥ 80%
    //      Proficient  : 65% ≤ Accuracy < 80%
    //      Developing  : 40% ≤ Accuracy < 65%
    //      Beginner    : Accuracy < 40%
    // ══════════════════════════════════════════════════════════════

    getConceptMastery() {
        if (!this.benchmarkResults || !this.benchmarkResults.results) return [];

        const conceptMap = {};
        for (const r of this.benchmarkResults.results) {
            const key = r.concept || 'General';
            if (!conceptMap[key]) {
                conceptMap[key] = { concept: key, total: 0, compiled: 0, exact: 0, totalPrecision: 0, totalRecall: 0 };
            }
            const c = conceptMap[key];
            c.total++;
            if (r.compiled)   c.compiled++;
            if (r.exactMatch) c.exact++;
            c.totalPrecision += r.precision;
            c.totalRecall    += r.recall;
        }

        return Object.values(conceptMap).map(c => {
            const accuracy    = parseFloat(((c.exact    / c.total) * 100).toFixed(1));
            const successRate = parseFloat(((c.compiled / c.total) * 100).toFixed(1));
            const avgPrecision = parseFloat(((c.totalPrecision / c.total) * 100).toFixed(1));
            const avgRecall    = parseFloat(((c.totalRecall    / c.total) * 100).toFixed(1));

            // C. F1 per concept (edge-case guard)
            let f1 = 0;
            if (avgPrecision + avgRecall > 0) {
                f1 = parseFloat(((2 * avgPrecision * avgRecall) / (avgPrecision + avgRecall)).toFixed(1));
            }

            // E. Mastery Level by exact-match accuracy thresholds
            let mastery;
            if      (accuracy >= 80) mastery = 'Expert';
            else if (accuracy >= 65) mastery = 'Proficient';
            else if (accuracy >= 40) mastery = 'Developing';
            else                     mastery = 'Beginner';

            return { concept: c.concept, total: c.total, compiled: c.compiled, exact: c.exact, successRate, accuracy, avgPrecision, avgRecall, f1, mastery };
        }).sort((a, b) => b.accuracy - a.accuracy);
    }

    // ══════════════════════════════════════════════════════════════
    // LOGIC GAP ANALYSIS  (student vs instructor solution)
    // ══════════════════════════════════════════════════════════════

    analyzeLogicGap(studentCode, solutionCode) {
        if (!solutionCode) return { match: true, reason: 'No ground truth provided for this exercise.' };

        const studentTokens  = this._tokenize(studentCode);
        const solutionTokens = this._tokenize(solutionCode);
        const studentKeywords  = this._getKeywordCounts(studentTokens);
        const solutionKeywords = this._getKeywordCounts(solutionTokens);

        const gaps = [];
        const importantKeywords = ['IF', 'WHILE', 'FOR', 'BEGIN', 'END'];
        for (const kw of importantKeywords) {
            const sc = studentKeywords[kw]  || 0;
            const ex = solutionKeywords[kw] || 0;
            const diff = sc - ex;
            if (diff < 0) {
                gaps.push({ type: 'Missing Structure', concept: kw, message: `Missing ${Math.abs(diff)} '${kw}' block(s).`, rootCause: `Instructor's solution uses ${ex} ${kw} structure(s); yours uses ${sc}.` });
            } else if (diff > 0) {
                gaps.push({ type: 'Extra Complexity', concept: kw, message: `Redundant '${kw}' block(s) detected.`, rootCause: `Problem needs only ${ex} ${kw} structure(s). You added ${diff} extra.` });
            }
        }

        return { match: gaps.length === 0, gaps, summary: gaps.length === 0 ? 'Logical alignment: Excellent' : 'Logic Analysis Required' };
    }

    // ── Internal Helpers ──

    _tokenize(code) {
        return code.match(/\b[A-Z]+\b|\w+|[^\s\w]/g) || [];
    }

    _getKeywordCounts(tokens) {
        const counts   = {};
        const keywords = ['BEGIN', 'END', 'IF', 'THEN', 'ELSE', 'WHILE', 'DO', 'FOR', 'SET', 'INPUT', 'DISPLAY', 'PRINT'];
        for (const token of tokens) {
            const upper = token.toUpperCase();
            if (keywords.includes(upper)) counts[upper] = (counts[upper] || 0) + 1;
        }
        return counts;
    }

    // Legacy line extractor (kept for compatibility)
    _getCodeLines(code) {
        return this._normalizeCode(code).split('\n').filter(l => l.trim().length > 0);
    }

    clearHistory() {
        this.history = { sessions: [], benchmarks: [] };
        this._saveHistory();
    }
}

// ── Global Instance ──
const metricsEngine = new MetricsEngine();
console.log('[Metrics] MetricsEngine v2 initialized. Session:', metricsEngine.sessionId);
