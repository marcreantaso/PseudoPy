/* ============================================================
   PSEUDOPY LEARNING LAYER — Feedback Pipeline
   ------------------------------------------------------------
   Orchestrates validation → pattern detection → clustering into
   a single TranslationResult that the UI and the evidence store
   can both consume. Pure computation, no DOM, no storage.
   ============================================================ */

/**
 * Compose the final learning result for one translation.
 * @param {string} source Original pseudocode.
 * @param {object} compileResult Output of PseudocodeCompiler.compile().
 * @returns {TranslationResult}
 */
function runLearningPipeline(source, compileResult) {
    const validationEngine = PseudoPyLearning.register.validationEngine;
    const patternDetector = PseudoPyLearning.register.patternDetector;
    const clusterer = PseudoPyLearning.register.feedbackClusterer;

    const validation = validationEngine.runValidation(compileResult, source);
    const patterns = (compileResult && compileResult.valid)
        ? patternDetector.detectPatterns({ source: source, ast: compileResult.ast, symbolTable: compileResult.symbolTable })
        : [];

    const items = validation.items;
    const clusters = clusterer.clusterFeedback(items, patterns);

    const errors = items.filter(it => it.severity === PseudoPyLearning.SEVERITY.ERROR);
    const warnings = items.filter(it => it.severity === PseudoPyLearning.SEVERITY.WARNING);
    const suggestions = items.filter(it => it.severity === PseudoPyLearning.SEVERITY.SUGGESTION);
    const successes = items.filter(it => it.severity === PseudoPyLearning.SEVERITY.SUCCESS);

    const errorCategories = uniqueSorted(errors.map(it => it.category));
    const gapCategories = uniqueSorted(errors.map(it => gapCategoryForResultType(it.type)).filter(Boolean));
    const patternTypes = uniqueSorted(patterns.map(p => p.type));

    return {
        source: source,
        compile: compileResult,
        valid: validation.valid,
        validation: validation,
        items: items,
        patterns: patterns,
        clusters: clusters,
        summary: clusterer.summarizeClusters(clusters),
        verdict: clusterer.overallVerdict(items),
        tallies: { error: errors.length, warning: warnings.length, suggestion: suggestions.length, success: successes.length },
        errorCategories: errorCategories,
        gapCategories: gapCategories,
        patternTypes: patternTypes
    };
}

function uniqueSorted(arr) {
    return Array.from(new Set(arr.filter(Boolean))).sort();
}

PseudoPyLearning.register.pipeline = {
    run: runLearningPipeline,
    uniqueSorted: uniqueSorted
};