/* ============================================================
   PSEUDOPY LEARNING LAYER — Evidence Store
   ------------------------------------------------------------
   Persists one EvidenceRecord per translation attempt for
   students, seeds a rich deterministic demo dataset derived from
   SEED_ACTIVITY_LIST, and tracks tutorial progress. All DB
   access is defensive: the learning layer must never break the
   main translator or accounts.
   ============================================================ */

function evHash(text) {
    let h = 5381;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) | 0; }
    return 'h' + Math.abs(h).toString(16);
}

function evUserId() {
    try {
        if (typeof currentUser === 'undefined' || !currentUser) return null;
        return currentUser._docId || currentUser.id;
    } catch (e) { return null; }
}

function evUserName() {
    try { return currentUser ? currentUser.fullName : ''; } catch (e) { return ''; }
}

function evInstructorId() {
    try { return currentUser ? (currentUser.instructorId || null) : null; } catch (e) { return null; }
}

/**
 * Build an EvidenceRecord from a runLearningPipeline() result.
 * @param {TranslationResult} pipelineResult
 * @returns {EvidenceRecord|null}
 */
function buildEvidenceRecord(pipelineResult) {
    if (!pipelineResult || !pipelineResult.compile) return null;
    const userId = evUserId();
    const t = pipelineResult.tallies || {};
    const errorTypes = (pipelineResult.compile.errors || []).map(e => e.type || e.message || 'Error');
    const unique = arr => Array.from(new Set(arr.filter(Boolean)));
    return {
        studentId: userId,
        studentName: evUserName(),
        instructorId: evInstructorId(),
        valid: !!pipelineResult.valid,
        evidenceOrigin: 'student-translation',
        validationIndicator: Math.max(0, 100 - 15 * (t.error || 0) - 5 * (t.warning || 0) - 2 * (t.suggestion || 0)),
        indicatorVersion: 1,
        tallies: {
            error: t.error || 0,
            warning: t.warning || 0,
            suggestion: t.suggestion || 0,
            success: t.success || 0
        },
        errorCategories: unique(pipelineResult.errorCategories || []),
        gapCategories: unique(pipelineResult.gapCategories || []),
        patternTypes: unique(pipelineResult.patternTypes || []),
        compileMetadata: {
            errorTypes: unique(errorTypes),
            hasSource: !!pipelineResult.source,
            sourceHash: evHash(pipelineResult.source)
        },
        timestamp: new Date().toISOString()
    };
}

/** Persist one evidence record for the current logged-in student. */
async function captureEvidence(pipelineResult) {
    if (typeof currentUser === 'undefined' || !currentUser || currentUser.role !== 'student') return null;
    const userId = evUserId();
    if (!userId) return null;
    const record = buildEvidenceRecord(pipelineResult, { studentId: userId });
    if (!record) return null;
    record._docId = 'ev_' + userId + '_' + Date.now();
    try { return await dbAdd(evidenceRef, record); } catch (e) { return null; }
}

/* ── Seeded demo evidence (deterministic, from SEED_ACTIVITY_LIST) ── */

function evSeedDocIdFromStudent(student, studentId) {
    if (student === 'Eduard John Mirandilla') return 'u_stu_emirandilla';
    if (student === 'Mikaella Daet') return 'u_stu_mdaet';
    const match = String(studentId || '').match(/-(\d+)$/) || String(studentId || '').match(/(\d+)$/);
    const n = match ? parseInt(match[1], 10) : NaN;
    if (n >= 1 && n <= 30) return 'u_stu_' + (n + 2);
    return 'u_stu_' + (n || 99);
}

const EV_ERROR_TYPE_CATEGORIES = {
    'Syntax Error': ['syntax'],
    'Logic Error': ['logic'],
    'Missing END': ['structure'],
    'Indentation Error': ['structure', 'readability'],
    'Type Error': ['logic', 'translation']
};

const EV_EXERCISE_PATTERNS = [
    { match: /sum of odd|while loop|series/i, patterns: ['sentinel-controlled-loop', 'accumulator'] },
    { match: /factorial/i, patterns: ['counter-controlled-loop', 'accumulator'] },
    { match: /branching|multiples of/i, patterns: ['counter-controlled-loop', 'selection'] },
    { match: /multiply|array/i, patterns: ['counter-controlled-loop'] }
];

function evPatternsForExercise(exerciseTitle) {
    const hit = EV_EXERCISE_PATTERNS.find(p => p.match.test(exerciseTitle || ''));
    return hit ? hit.patterns : ['sequence'];
}

function evCategoriesForErrorType(errorType) {
    return EV_ERROR_TYPE_CATEGORIES[errorType] || ['syntax'];
}

function evGapForCategories(categories) {
    const map = { syntax: 'syntax', structure: 'structure', logic: 'logic', readability: 'readability', translation: 'translation' };
    return categories.map(c => map[c]).filter(Boolean);
}

/**
 * Deterministically derive an EvidenceRecord from one SEED_ACTIVITY_LIST row.
 * No random values — everything follows from the seed fields + index.
 */
function buildSeedEvidenceFromActivity(activity, index) {
    const completed = activity.status === 'Completed';
    const failed = activity.status === 'Failed';
    const score = parseInt(String(activity.score || '0').replace(/\D/g, ''), 10) || 0;

    const errorTypes = failed ? [activity.errorType || 'Syntax Error'] : [];
    const errorCategories = failed ? evCategoriesForErrorType(activity.errorType) : [];
    const gapCategories = failed ? evGapForCategories(errorCategories) : [];
    const patternTypes = completed ? evPatternsForExercise(activity.exercise) : [];

    const warningCount = completed ? (score < 100 ? 1 : 0) : 0;
    const suggestionCount = completed ? (activity.difficulty === 'hard' ? 1 : 0) : 0;
    const successCount = completed ? 1 : 0;

    return {
        _docId: 'ev_seed_' + activity._docId,
        studentId: evSeedDocIdFromStudent(activity.student, activity.studentId),
        studentName: activity.student,
        instructorId: activity.instructorId || 'u2',
        valid: completed,
        tallies: {
            error: failed ? errorCategories.length || 1 : 0,
            warning: warningCount,
            suggestion: suggestionCount,
            success: successCount
        },
        errorCategories: errorCategories,
        gapCategories: gapCategories,
        patternTypes: patternTypes,
        compileMetadata: {
            errorTypes: errorTypes,
            hasSource: true,
            sourceHash: evHash(activity.pseudocode || activity.submittedCode)
        },
        exerciseTitle: activity.exercise,
        difficulty: activity.difficulty,
        score: completed ? score : 0,
        seededFrom: 'activity:' + activity._docId,
        timestamp: new Date(activity.time || new Date().toISOString()).toISOString()
    };
}

/** Full deterministic demo evidence set derived from SEED_ACTIVITY_LIST. */
function getSeedEvidence() {
    return SEED_ACTIVITY_LIST
        .filter(a => a.status !== 'Pending')
        .map((a, i) => buildSeedEvidenceFromActivity(a, i));
}

/** Seed the evidence collection only when it is empty (mirrors seedDatabase). */
async function seedEvidenceIfEmpty() {
    try {
        const existing = await dbGetAll(evidenceRef);
        if (existing && existing.length >= 5) return true;
        const seeds = getSeedEvidence();
        for (const record of seeds) {
            try { await dbAdd(evidenceRef, record); } catch (e) { /* skip */ }
        }
        return true;
    } catch (e) {
        return false;
    }
}

/* ── Tutorial progress (per-student) ───────────────────────── */

async function getTutorialProgress(userId) {
    const id = userId || evUserId();
    if (!id) return null;
    try { return await dbGet(tutorialProgressRef, id); } catch (e) { return null; }
}

async function saveTutorialProgress(userId, data) {
    const id = userId || evUserId();
    if (!id) return null;
    const payload = Object.assign({
        updatedAt: new Date().toISOString(),
        completed: false,
        step: 0
    }, data || {});
    try { return await dbSet(tutorialProgressRef, id, payload); } catch (e) { return null; }
}

PseudoPyLearning.register.evidenceStore = {
    buildRecord: buildEvidenceRecord,
    capture: captureEvidence,
    getSeedEvidence: getSeedEvidence,
    seedEvidenceIfEmpty: seedEvidenceIfEmpty,
    seedFromActivity: buildSeedEvidenceFromActivity,
    getTutorialProgress: getTutorialProgress,
    saveTutorialProgress: saveTutorialProgress,
    hash: evHash
};
