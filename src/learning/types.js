/* ============================================================
   PSEUDOPY LEARNING LAYER — Shared Types & Constants
   ------------------------------------------------------------
   Structured, deterministic model used by the validation engine,
   pattern detector, feedback clustering, evidence store and the
   instructor analytics. No AI / ML — every field is produced by
   rule-based analysis of the compiler's AST, tokens or messages.

   TypeScript is not used in this project, so the JSDoc typedefs
   below are the canonical shape contract. All objects produced
   by this layer are plain, serializable data (safe to store).
   ============================================================ */

/**
 * Namespace object for the PseudoPy learning layer.
 * All learning modules register factories and analysis functions
 * onto this object instead of polluting the global scope.
 */
const PseudoPyLearning = { version: '1.0.0' };

// Also expose on globalThis so tests, devtools and other classic-script
// files can reach the namespace without relying on lexical scoping rules.
if (typeof globalThis !== 'undefined') { globalThis.PseudoPyLearning = PseudoPyLearning; }

/**
 * Severity levels used across every learning result.
 * Ordered weakest → strongest for clustering/ordering.
 * @readonly @enum {string}
 */
PseudoPyLearning.SEVERITY = Object.freeze({
    SUCCESS: 'success',
    SUGGESTION: 'suggestion',
    WARNING: 'warning',
    ERROR: 'error'
});

PseudoPyLearning.SEVERITY_ORDER = Object.freeze([
    PseudoPyLearning.SEVERITY.SUCCESS,
    PseudoPyLearning.SEVERITY.SUGGESTION,
    PseudoPyLearning.SEVERITY.WARNING,
    PseudoPyLearning.SEVERITY.ERROR
]);

/**
 * Fine-grained kind of a result. Used for evidence + gap analytics.
 * @readonly @enum {string}
 */
PseudoPyLearning.RESULT_TYPE = Object.freeze({
    SYNTAX: 'syntax',
    STRUCTURE: 'structure',
    LOGIC: 'logic',
    VARIABLE: 'variable',
    IO: 'io',
    PATTERN: 'pattern',
    TRANSLATION: 'translation',
    READABILITY: 'readability',
    BEST_PRACTICE: 'best-practice'
});

/**
 * High-level feedback categories used to cluster results
 * into the collapsible summary shown to students.
 * @readonly @enum {string}
 */
PseudoPyLearning.FEEDBACK_CATEGORY = Object.freeze({
    SYNTAX: 'syntax',
    LOGIC: 'logic',
    STRUCTURE: 'structure',
    PROGRAMMING_PATTERN: 'programming-pattern',
    READABILITY: 'readability',
    TRANSLATION: 'translation',
    BEST_PRACTICES: 'best-practices'
});

/**
 * Programming patterns the pattern detector recognises.
 * @readonly @enum {string}
 */
PseudoPyLearning.PATTERN_TYPE = Object.freeze({
    SEQUENCE: 'sequence',
    SELECTION: 'selection',
    REPETITION: 'repetition',
    COUNTER_CONTROLLED_LOOP: 'counter-controlled-loop',
    SENTINEL_CONTROLLED_LOOP: 'sentinel-controlled-loop',
    ACCUMULATOR: 'accumulator',
    INPUT_PROCESS_OUTPUT: 'input-process-output',
    VALIDATION_LOOP: 'validation-loop',
    NESTED_SELECTION: 'nested-selection',
    NESTED_ITERATION: 'nested-iteration',
    FUNCTION: 'function'
});

/**
 * Learning-gap categories presented to instructors in Phase 8.
 * These are the curriculum dimensions a category level is measured on.
 * @readonly @enum {string}
 */
PseudoPyLearning.GAP_CATEGORY = Object.freeze({
    SYNTAX: 'syntax',
    STRUCTURE: 'structure',
    LOGIC: 'logic',
    LOOP: 'loop',
    CONDITIONAL: 'conditional',
    VARIABLE: 'variable',
    FUNCTION: 'function',
    IO: 'io',
    PATTERN: 'pattern',
    TRANSLATION: 'translation',
    READABILITY: 'readability'
});

/**
 * Human-readable labels + icons for the public enum values.
 * Icons are Lucide icon names (rendered with the icon() helper).
 */
PseudoPyLearning.LABELS = {
    severity: {
        [PseudoPyLearning.SEVERITY.ERROR]: { label: 'Error', icon: 'circle-x' },
        [PseudoPyLearning.SEVERITY.WARNING]: { label: 'Warning', icon: 'triangle-alert' },
        [PseudoPyLearning.SEVERITY.SUGGESTION]: { label: 'Suggestion', icon: 'lightbulb' },
        [PseudoPyLearning.SEVERITY.SUCCESS]: { label: 'Great work', icon: 'circle-check' }
    },
    category: {
        [PseudoPyLearning.FEEDBACK_CATEGORY.SYNTAX]: { label: 'Syntax', icon: 'braces', description: 'Pseudocode must follow the sentence forms the translator understands.' },
        [PseudoPyLearning.FEEDBACK_CATEGORY.LOGIC]: { label: 'Logic', icon: 'brain', description: 'Conditions, calculations and output should describe the intended behaviour.' },
        [PseudoPyLearning.FEEDBACK_CATEGORY.STRUCTURE]: { label: 'Structure', icon: 'layers', description: 'Program blocks (BEGIN/END, IF/ENDIF, loops) must open and close correctly.' },
        [PseudoPyLearning.FEEDBACK_CATEGORY.PROGRAMMING_PATTERN]: { label: 'Programming Pattern', icon: 'puzzle', description: 'Recognised algorithmic structures used to solve the problem.' },
        [PseudoPyLearning.FEEDBACK_CATEGORY.READABILITY]: { label: 'Readability', icon: 'align-left', description: 'Clear indentation, naming and line length make pseudocode easier to follow.' },
        [PseudoPyLearning.FEEDBACK_CATEGORY.TRANSLATION]: { label: 'Translation', icon: 'braces', description: 'Behavior preserved when pseudocode becomes Python code.' },
        [PseudoPyLearning.FEEDBACK_CATEGORY.BEST_PRACTICES]: { label: 'Best Practices', icon: 'award', description: 'Recommended habits that keep programs reliable and easy to maintain.' }
    }
};

/** @typedef {'error'|'warning'|'suggestion'|'success'} LearningSeverity */

/**
 * @typedef {Object} ValidationResult
 * A single structured finding about a pseudocode submission.
 * @property {string} id              Stable unique id.
 * @property {string} type            One of PseudoPyLearning.RESULT_TYPE.
 * @property {LearningSeverity} severity One of PseudoPyLearning.SEVERITY.
 * @property {string} category        One of PseudoPyLearning.FEEDBACK_CATEGORY.
 * @property {string} message         Short headline (one sentence, actionable).
 * @property {string} explanation     Why this matters for learning.
 * @property {number|null} line       Source line the finding refers to (1-based).
 * @property {string} suggestion      Concrete fix the student can apply.
 * @property {string} example         Optional short before/after snippet.
 */

/**
 * @typedef {Object} DetectedPattern
 * @property {string} id
 * @property {string} type            One of PseudoPyLearning.PATTERN_TYPE.
 * @property {string} name            Human-friendly name, e.g. "Accumulator".
 * @property {number} startLine       First line of the pattern block.
 * @property {number} endLine         Last line of the pattern block.
 * @property {string} explanation     What this pattern means / why it is useful.
 * @property {string} pseudocodeSlice Example sourcing lines (display).
 * @property {string} pythonSlice     Generated Python lines (display).
 * @property {number} confidence      1 (fully rule-derived; kept for API stability).
 */

/**
 * @typedef {Object} FeedbackCluster
 * A group of validation results under one category for display.
 * @property {string} category
 * @property {string} label
 * @property {string} icon
 * @property {string} description
 * @property {ValidationResult[]} items
 * @property {number} errorCount
 * @property {number} warningCount
 * @property {number} suggestionCount
 * @property {number} successCount
 */

/**
 * @typedef {Object} TranslationResult
 * Everything produced for a single translate/validate invocation.
 * @property {boolean} valid
 * @property {string} source
 * @property {string} python
 * @property {ValidationResult[]} validation
 * @property {DetectedPattern[]} patterns
 * @property {FeedbackCluster[]} clusters
 * @property {Object} compile            The raw compile() output.
 */

/**
 * @typedef {Object} EvidenceRecord
 * One persisted translation attempt (Phase 6). Derived, never fake.
 * @property {string} _docId
 * @property {string} studentId
 * @property {string} studentAccountId
 * @property {string} instructorId
 * @property {string} section
 * @property {string|null} exerciseId
 * @property {string|null} exercise
 * @property {string} timestamp ISO string.
 * @property {number} attemptNumber Per-student counter for the day.
 * @property {boolean} valid
 * @property {number} errorCount
 * @property {number} warningCount
 * @property {number} suggestionCount
 * @property {Object} errorCategories   category → count.
 * @property {Object} gapCategories     GAP_CATEGORY → error count (Phase 8).
 * @property {string[]} patterns        Detected pattern types.
 * @property {Object} compileMetadata   { complexity, tokenCount, totalTimeMs }
 */

/* ── Small helpers ─────────────────────────────────────────── */

function learningId(prefix) {
    const p = prefix || 'lv';
    return p + '_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
}

function isInEnum(value, enumObj) {
    return typeof value === 'string' && Object.values(enumObj).includes(value);
}

/* ── Factories ─────────────────────────────────────────────── */

function defaultSuggestionForSeverity(severity) {
    switch (severity) {
        case PseudoPyLearning.SEVERITY.SUCCESS: return 'Nothing to change here — keep using this approach.';
        case PseudoPyLearning.SEVERITY.SUGGESTION: return 'Consider applying the suggestion above.';
        case PseudoPyLearning.SEVERITY.WARNING: return 'Review and update the reported line.';
        case PseudoPyLearning.SEVERITY.ERROR:
        default: return 'Fix the reported line before translating again.';
    }
}

function defaultExplanationForCategory(category) {
    const meta = PseudoPyLearning.LABELS.category[category];
    return meta ? meta.description : 'This finding relates to the overall quality of the pseudocode.';
}

/**
 * Create a ValidationResult with validated enums + sane defaults.
 * Unknown enum values are coerced instead of silently accepted,
 * so downstream consumers can always trust the shape & vocabulary.
 * @param {Object} partial
 * @returns {ValidationResult}
 */
function makeValidationResult(partial) {
    const src = partial || {};
    const type = isInEnum(src.type, PseudoPyLearning.RESULT_TYPE) ? src.type : PseudoPyLearning.RESULT_TYPE.SYNTAX;
    const severity = isInEnum(src.severity, PseudoPyLearning.SEVERITY) ? src.severity : PseudoPyLearning.SEVERITY.WARNING;
    const category = isInEnum(src.category, PseudoPyLearning.FEEDBACK_CATEGORY) ? src.category : defaultCategoryForType(type);
    return {
        id: src.id || learningId('vr'),
        type: type,
        severity: severity,
        category: category,
        message: String(src.message || ''),
        explanation: String(src.explanation || defaultExplanationForCategory(category)),
        line: typeof src.line === 'number' ? src.line : null,
        suggestion: String(src.suggestion || defaultSuggestionForSeverity(severity)),
        example: String(src.example || '')
    };
}

/**
 * Map a fine-grained RESULT_TYPE to its FEEDBACK_CATEGORY.
 * @param {string} type
 * @returns {string}
 */
function defaultCategoryForType(type) {
    switch (type) {
        case PseudoPyLearning.RESULT_TYPE.SYNTAX: return PseudoPyLearning.FEEDBACK_CATEGORY.SYNTAX;
        case PseudoPyLearning.RESULT_TYPE.STRUCTURE: return PseudoPyLearning.FEEDBACK_CATEGORY.STRUCTURE;
        case PseudoPyLearning.RESULT_TYPE.LOGIC:
        case PseudoPyLearning.RESULT_TYPE.VARIABLE:
        case PseudoPyLearning.RESULT_TYPE.IO: return PseudoPyLearning.FEEDBACK_CATEGORY.LOGIC;
        case PseudoPyLearning.RESULT_TYPE.PATTERN: return PseudoPyLearning.FEEDBACK_CATEGORY.PROGRAMMING_PATTERN;
        case PseudoPyLearning.RESULT_TYPE.READABILITY: return PseudoPyLearning.FEEDBACK_CATEGORY.READABILITY;
        case PseudoPyLearning.RESULT_TYPE.TRANSLATION: return PseudoPyLearning.FEEDBACK_CATEGORY.TRANSLATION;
        case PseudoPyLearning.RESULT_TYPE.BEST_PRACTICE:
        default: return PseudoPyLearning.FEEDBACK_CATEGORY.BEST_PRACTICES;
    }
}

/**
 * Create a DetectedPattern backed by the AST walker data.
 * @param {Object} partial
 * @returns {DetectedPattern}
 */
function makeDetectedPattern(partial) {
    const src = partial || {};
    const type = isInEnum(src.type, PseudoPyLearning.PATTERN_TYPE) ? src.type : PseudoPyLearning.PATTERN_TYPE.SEQUENCE;
    return {
        id: src.id || learningId('pt'),
        type: type,
        name: String(src.name || src.type || type),
        startLine: typeof src.startLine === 'number' ? src.startLine : 1,
        endLine: typeof src.endLine === 'number' ? src.endLine : (typeof src.startLine === 'number' ? src.startLine : 1),
        explanation: String(src.explanation || ''),
        pseudocodeSlice: String(src.pseudocodeSlice || ''),
        pythonSlice: String(src.pythonSlice || ''),
        confidence: 1
    };
}

/**
 * Create a FeedbackCluster (initial counts are zero; use fold* helpers).
 * @param {string} category
 * @returns {FeedbackCluster}
 */
function makeFeedbackCluster(category) {
    const meta = (PseudoPyLearning.LABELS.category[category] || {});
    return {
        category: category in PseudoPyLearning.LABELS.category ? category : PseudoPyLearning.FEEDBACK_CATEGORY.BEST_PRACTICES,
        label: meta.label || category,
        icon: meta.icon || 'circle-check',
        description: meta.description || '',
        items: [],
        errorCount: 0,
        warningCount: 0,
        suggestionCount: 0,
        successCount: 0
    };
}

/**
 * Plugin registry — lets other modules contribute helpers without
 * depending on file ordering beyond types.js itself.
 */
PseudoPyLearning.register = {};
PseudoPyLearning.types = {
    learningId: learningId,
    isInEnum: isInEnum,
    makeValidationResult: makeValidationResult,
    makeDetectedPattern: makeDetectedPattern,
    makeFeedbackCluster: makeFeedbackCluster,
    defaultCategoryForType: defaultCategoryForType
};