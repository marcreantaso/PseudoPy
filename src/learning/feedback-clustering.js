/* ============================================================
   PSEUDOPY LEARNING LAYER — Feedback Clustering
   ------------------------------------------------------------
   Groups the structured ValidationResults and DetectedPatterns
   into the high-level FEEDBACK_CATEGORY clusters shown to the
   student with progressive disclosure. Pure functions — no DOM,
   no storage — so they are unit-testable and reusable by the
   analytics layer.
   ============================================================ */

/** Preferred display order for the categories. */
const LEARNING_CATEGORY_ORDER = [
    PseudoPyLearning.FEEDBACK_CATEGORY.SYNTAX,
    PseudoPyLearning.FEEDBACK_CATEGORY.STRUCTURE,
    PseudoPyLearning.FEEDBACK_CATEGORY.LOGIC,
    PseudoPyLearning.FEEDBACK_CATEGORY.PROGRAMMING_PATTERN,
    PseudoPyLearning.FEEDBACK_CATEGORY.READABILITY,
    PseudoPyLearning.FEEDBACK_CATEGORY.TRANSLATION,
    PseudoPyLearning.FEEDBACK_CATEGORY.BEST_PRACTICES
];

/**
 * Fold one ValidationResult into its cluster, updating counts.
 * @param {Object} clusters category → FeedbackCluster
 * @param {ValidationResult} item
 */
function foldResultIntoCluster(clusters, item) {
    const cat = item.category;
    if (!clusters[cat]) clusters[cat] = makeFeedbackCluster(cat);
    const cluster = clusters[cat];
    cluster.items.push(item);
    if (item.severity === PseudoPyLearning.SEVERITY.ERROR) cluster.errorCount++;
    else if (item.severity === PseudoPyLearning.SEVERITY.WARNING) cluster.warningCount++;
    else if (item.severity === PseudoPyLearning.SEVERITY.SUGGESTION) cluster.suggestionCount++;
    else cluster.successCount++;
}

/**
 * Add one recognised programming pattern as a positive item
 * inside the "Programming Pattern" cluster.
 * @param {Object} clusters
 * @param {DetectedPattern} pattern
 */
function foldPatternIntoCluster(clusters, pattern) {
    const meta = (PseudoPyLearning.LABELS.pattern[pattern.type] || {});
    const label = meta.label || pattern.name;
    const cat = PseudoPyLearning.FEEDBACK_CATEGORY.PROGRAMMING_PATTERN;
    if (!clusters[cat]) clusters[cat] = makeFeedbackCluster(cat);
    const cluster = clusters[cat];
    cluster.items.push(makeValidationResult({
        type: PseudoPyLearning.RESULT_TYPE.PATTERN,
        severity: PseudoPyLearning.SEVERITY.SUCCESS,
        category: cat,
        message: 'Pattern detected: ' + label,
        explanation: pattern.explanation,
        line: pattern.startLine,
        suggestion: 'Return to this area of the code and check you understand why this pattern solves the problem.'
    }));
    cluster.successCount++;
}

/**
 * Determine the headline visual state of a cluster.
 * @param {FeedbackCluster} cluster
 * @returns {string} One of PseudoPyLearning.SEVERITY.
 */
function clusterState(cluster) {
    if (!cluster) return PseudoPyLearning.SEVERITY.SUCCESS;
    if (cluster.errorCount > 0) return PseudoPyLearning.SEVERITY.ERROR;
    if (cluster.warningCount > 0) return PseudoPyLearning.SEVERITY.WARNING;
    if (cluster.suggestionCount > 0) return PseudoPyLearning.SEVERITY.SUGGESTION;
    return PseudoPyLearning.SEVERITY.SUCCESS;
}

/**
 * Cluster validation items + recognised patterns into FeedbackCluster[],
 * ordered by LEARNING_CATEGORY_ORDER. Empty clusters are omitted.
 * @param {ValidationResult[]} validationItems
 * @param {DetectedPattern[]} patterns
 * @returns {FeedbackCluster[]}
 */
function clusterFeedback(validationItems, patterns) {
    const clusters = {};
    (validationItems || []).forEach(item => foldResultIntoCluster(clusters, item));
    (patterns || []).forEach(p => foldPatternIntoCluster(clusters, p));
    return LEARNING_CATEGORY_ORDER.filter(cat => clusters[cat]).map(cat => clusters[cat]);
}

/**
 * Compact whole-result stats across clusters.
 * @param {FeedbackCluster[]} clusters
 * @returns {{error:number, warning:number, suggestion:number, success:number, total:number}}
 */
function summarizeClusters(clusters) {
    const sums = { error: 0, warning: 0, suggestion: 0, success: 0, total: 0 };
    (clusters || []).forEach(c => {
        sums.error += c.errorCount;
        sums.warning += c.warningCount;
        sums.suggestion += c.suggestionCount;
        sums.success += c.successCount;
    });
    sums.total = sums.error + sums.warning + sums.suggestion + sums.success;
    return sums;
}

/**
 * A short one-line verdict used by lists and headers.
 * @param {ValidationResult[]} items
 * @returns {string}
 */
function overallVerdict(items) {
    const by = summarizeValidation(items).bySeverity;
    const errors = by.error || 0;
    const warnings = by.warning || 0;
    if (errors > 0) return errors + ' issue(s) to fix before your pseudocode can be translated.';
    if (warnings > 0) return 'Your pseudocode is valid, with ' + warnings + ' point(s) worth reviewing.';
    return 'Your pseudocode translated cleanly. Review the suggestions to polish it further.';
}

PseudoPyLearning.register.feedbackClusterer = {
    clusterFeedback: clusterFeedback,
    summarizeClusters: summarizeClusters,
    clusterState: clusterState,
    overallVerdict: overallVerdict,
    LEARNING_CATEGORY_ORDER: LEARNING_CATEGORY_ORDER
};