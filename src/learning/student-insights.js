/* ============================================================
   PSEUDOPY LEARNING LAYER — Student Improvement Summary
   ------------------------------------------------------------
   Turns a student's pseudopy_evidence records into a plain-language
   progress summary: attempts, pass rate, trending gaps, patterns
   gained. Pure computation + one defensive renderer. No evidence
   is ever invented — if there are fewer than MIN_ATTEMPTS records
   the summary explains that more activities are needed.
   ============================================================ */

const STU_MIN_ATTEMPTS = 3;

/** Oldest-first evidence list for a single student. */
function stuOwnEvidence(allEvidence, userId) {
    if (!userId) return [];
    return (allEvidence || [])
        .filter(e => e.studentId === userId || e.studentId === (currentUser && (currentUser._docId || currentUser.id)))
        .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
}

function countBy(list, keyOf) {
    const out = {};
    (list || []).forEach(item => (keyOf(item) || []).forEach(k => { out[k] = (out[k] || 0) + 1; }));
    return out;
}

function topKeys(counts, n) {
    return Object.keys(counts)
        .sort((a, b) => (counts[b] - counts[a]) || a.localeCompare(b))
        .slice(0, n || 3);
}

/**
 * Compute the per-student insight object.
 * @param {EvidenceRecord[]} allEvidence
 * @param {string} userId
 * @returns {StudentInsights}
 */
function summarizeStudentEvidence(allEvidence, userId) {
    const own = stuOwnEvidence(allEvidence, userId);
    const attempts = own.length;
    if (attempts === 0) {
        return { ready: false, attempts: 0, reason: 'none' };
    }

    const validAttempts = own.filter(e => e.valid).length;
    const passRate = Math.round((validAttempts / attempts) * 100);

    const midpoint = Math.ceil(attempts / 2);
    const firstHalf = own.slice(0, midpoint);
    const secondHalf = own.slice(midpoint);

    const firstGaps = countBy(firstHalf, e => e.gapCategories || []);
    const secondGaps = countBy(secondHalf, e => e.gapCategories || []);
    const firstPatterns = countBy(firstHalf, e => e.patternTypes || []);
    const secondPatterns = countBy(secondHalf, e => e.patternTypes || []);

    const gapNames = Array.from(new Set([...Object.keys(firstGaps), ...Object.keys(secondGaps)]));
    const improvedGaps = gapNames.filter(g => (firstGaps[g] || 0) > (secondGaps[g] || 0) && (firstGaps[g] || 0) > 0);
    const regressedGaps = gapNames.filter(g => (secondGaps[g] || 0) > (firstGaps[g] || 0));

    const patternNames = Array.from(new Set([...Object.keys(firstPatterns), ...Object.keys(secondPatterns)]));
    const gainedPatterns = patternNames.filter(p => (secondPatterns[p] || 0) > (firstPatterns[p] || 0));

    const currentGaps = topKeys(secondGaps, 2);

    const latest = own[attempts - 1];
    const trend = attempts >= 2
        ? (validAttempts === attempts ? 'improving' : (passRate >= 60 ? 'steady' : 'needs-attention'))
        : 'starting';

    return {
        ready: attempts >= STU_MIN_ATTEMPTS,
        attempts: attempts,
        validAttempts: validAttempts,
        passRate: passRate,
        trend: trend,
        improvedGaps: improvedGaps,
        regressedGaps: regressedGaps,
        gainedPatterns: gainedPatterns,
        currentGaps: currentGaps,
        lastTimestamp: latest ? latest.timestamp : null
    };
}

/** Smallest-slice message builders (defensive labels from LABELS). */
function stuGapLabel(gap) {
    return (PseudoPyLearning.GAP_LABELS && PseudoPyLearning.GAP_LABELS[gap]) || (PseudoPyLearning.register.gapLabels || {})[gap] || gap;
}

/**
 * Render the improvement summary into #settings-improvement-summary
 * (and optionally a write-page mini panel).
 */
function renderImprovementSummary(containerId, insights) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!insights.attempts) {
        container.innerHTML = `<p class="details-note" style="font-size:0.82rem;color:var(--text-muted)">
          Complete the tutorial and translate your first pseudocode to start building your learning profile.</p>`;
        return;
    }

    if (!insights.ready) {
        container.innerHTML = `<p class="details-note" style="font-size:0.82rem;color:var(--text-muted)">
          Complete <strong>${STU_MIN_ATTEMPTS}</strong> activities to generate your learning progress analysis
          (you have <strong>${insights.attempts}</strong> so far).</p>`;
        return;
    }

    const cards = [];
    cards.push({ icon: 'target', label: 'Pass rate', value: insights.passRate + '%' });
    cards.push({ icon: 'mouse-pointer-click', label: 'Attempts', value: String(insights.attempts) });
    cards.push({ icon: 'trending-up', label: 'Trend', value: insights.trend.replace(/-/g, ' ') });
    cards.push({
        icon: 'circle-check',
        label: 'Improved on',
        value: insights.improvedGaps.length ? insights.improvedGaps.map(stuGapLabel).join(', ') : 'No regressions currently'
    });

    const trendLine = insights.trend === 'improving'
        ? 'Your recent translations show fewer errors — keep up the good work.'
        : (insights.trend === 'needs-attention'
            ? 'Some error types keep appearing. Focus on the highlighted areas below.'
            : 'You are building a steady routine of attempts.');

    container.innerHTML = `
      <div class="stu-insights">
        <p class="stu-insights-trend" style="font-size:0.85rem;color:var(--text-secondary)">${trendLine}</p>
        <div class="learning-cluster-grid">
          ${cards.map(c => `
            <div class="stu-insight-card">
              <span class="stu-insight-icon">${icon(c.icon)}</span>
              <div>
                <div class="stu-insight-label" style="font-size:0.75rem;color:var(--text-muted)">${LU_ESC(c.label)}</div>
                <div class="stu-insight-value" style="font-weight:700;color:var(--text-primary)">${LU_ESC(c.value)}</div>
              </div>
            </div>`).join('')}
        </div>
        ${insights.gainedPatterns.length ? `
        <p class="stu-insight-gains" style="font-size:0.82rem;color:var(--success);margin-top:0.6rem">
          ${icon('trophy')} Patterns you are now building: ${insights.gainedPatterns.join(', ')}.</p>` : ''}
        ${insights.currentGaps.length ? `
        <p class="stu-insight-next" style="font-size:0.82rem;color:var(--warning);margin-top:0.3rem">
          ${icon('triangle-alert')} Next focus: ${insights.currentGaps.map(stuGapLabel).join(', ')}.</p>` : ''}
      </div>`;
    refreshIcons(container);
}

PseudoPyLearning.register.studentInsights = {
    summarize: summarizeStudentEvidence,
    render: renderImprovementSummary,
    load: loadStudentInsights,
    MIN_ATTEMPTS: STU_MIN_ATTEMPTS
};

/** Compact write-page strip rendered under the Learning Feedback panel. */
function renderWritePageMini(insights) {
    const el = document.getElementById('learning-progress-mini');
    if (!el) return;
    if (!insights.attempts) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const summary = insights.ready
        ? `${insights.attempts} attempts · ${insights.passRate}% pass rate · trend: ${insights.trend.replace(/-/g, ' ')}`
        : `${insights.attempts} attempts so far — keep going to unlock your progress analysis`;
    el.innerHTML = `
      <div class="learning-summary-verdict lc-state-${insights.trend === 'needs-attention' ? 'warning' : 'success'}" style="margin-bottom:0">
        ${icon('trending-up')} <strong>Your progress:</strong> ${LU_ESC(summary)}
      </div>`;
    refreshIcons(el);
}

async function loadStudentInsights() {
    try {
        if (typeof currentUser === 'undefined' || !currentUser) return;
        const userId = currentUser._docId || currentUser.id;
        const allEvidence = await dbGetAll(evidenceRef);
        const insights = summarizeStudentEvidence(allEvidence, userId);
        renderImprovementSummary('settings-improvement-summary', insights);
        renderWritePageMini(insights);
    } catch (e) {
        /* non-critical */
    }
}

/* Add gap labels for instructor-facing names (kept beside the enum). */
PseudoPyLearning.GAP_LABELS = Object.freeze({
    syntax: 'Syntax',
    structure: 'Structure',
    logic: 'Logic',
    loop: 'Loops',
    conditional: 'Conditionals',
    variable: 'Variables',
    function: 'Functions',
    io: 'Input & Output',
    pattern: 'Pattern recognition',
    translation: 'Translation',
    readability: 'Readability'
});