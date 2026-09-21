/* ============================================================
   PSEUDOPY LEARNING LAYER — Learning UI
   ------------------------------------------------------------
   Renders the post-translation Learning Panel on the Write
   Pseudocode page using the clustered TranslationResult produced
   by the pipeline. Reuses the shared cluster-card styles defined
   in style.css. Non-destructive: every render is defensive.
   ============================================================ */

const LU_ESC = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function luTry(fn, fallback) { try { const v = fn(); return v === undefined ? fallback : v; } catch (e) { return fallback; } }

function luSeverityLabel(sev) {
    return luTry(() => PseudoPyLearning.LABELS.severity[sev], { label: sev, icon: 'info' });
}

function luCategoryMeta(cat) {
    return luTry(() => PseudoPyLearning.LABELS.category[cat], { label: cat, icon: 'circle-check', description: '' });
}

/** Build one expandable cluster card. */
function buildClusterCard(c) {
    const meta = luCategoryMeta(c.category);
    const state = luTry(() => PseudoPyLearning.register.feedbackClusterer.clusterState(c), 'success');
    const stateIcon = luSeverityLabel(state).icon || 'circle-check';
    const counts = [
        c.errorCount ? 'error ' + c.errorCount : '',
        c.warningCount ? 'warning ' + c.warningCount : '',
        c.suggestionCount ? 'suggestion ' + c.suggestionCount : '',
        c.successCount ? 'success ' + c.successCount : ''
    ].filter(Boolean).join(' &middot; ');
    const items = c.items.map(it => {
        const sev = luSeverityLabel(it.severity);
        const la = (it.line != null) ? `<div class="lc-line">Line ${LU_ESC(String(it.line))}</div>` : '';
        return `
            <li class="lc-item lc-item-${it.severity}">
              <strong>${icon(sev.icon)} ${LU_ESC(it.message)}</strong>
              <div class="lc-expl">${LU_ESC(it.explanation)}</div>
              ${it.suggestion && it.suggestion !== 'Nothing to change here — keep using this approach.' ? `<div class="lc-sugg"><em>Suggestion:</em> ${LU_ESC(it.suggestion)}</div>` : ''}
              ${la}
            </li>`;
    }).join('');
    return `
        <div class="learning-cluster-card lc-state-${state}">
          <div class="lc-head">
            <span class="lc-icon">${icon(meta.icon)}</span>
            <span class="lc-title">${LU_ESC(meta.label)}</span>
            <span class="lc-counts">${counts}</span>
            <span class="lc-state-icon">${icon(stateIcon)}</span>
          </div>
          <div class="lc-desc">${LU_ESC(meta.description || '')}</div>
          <details class="lc-details">
            <summary>View details</summary>
            <ul class="lc-list">${items}</ul>
          </details>
        </div>`;
}

/**
 * Recommend the single most useful next step to the student:
 * the first category that has something more than a success.
 */
function suggestNextStep(clusters) {
    if (!clusters || !clusters.length) return null;
    const actionable = clusters.find(c => c.errorCount > 0 || c.warningCount > 0 || c.suggestionCount > 0);
    if (!actionable) return { cluster: null, message: 'Every area looks great — continue to the next task.' };
    const item = actionable.items.find(i => i.severity === PseudoPyLearning.SEVERITY.ERROR)
        || actionable.items.find(i => i.severity === PseudoPyLearning.SEVERITY.WARNING)
        || actionable.items.find(i => i.severity === PseudoPyLearning.SEVERITY.SUGGESTION);
    return { cluster: actionable, item: item };
}

/**
 * Render (or hide) the post-translation learning panel.
 * @param {TranslationResult|null} pipelineResult
 */
function renderLearningPanel(pipelineResult) {
    const panel = document.getElementById('learning-feedback-panel');
    const body = document.getElementById('learning-feedback-panel-body');
    if (!panel || !body) return;
    if (!pipelineResult || !pipelineResult.clusters || !pipelineResult.clusters.length) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');

    const verdictState = pipelineResult.summary.error > 0 ? 'error'
        : (pipelineResult.summary.warning > 0 ? 'warning'
            : (pipelineResult.summary.suggestion > 0 ? 'suggestion' : 'success'));
    const verdictMeta = luSeverityLabel(verdictState);
    const next = suggestNextStep(pipelineResult.clusters);

    const nextHtml = next
        ? `<div class="lc-next">
             <strong>Next step:</strong>
             ${next.cluster ? `<span class="lc-next-cat">${LU_ESC(luCategoryMeta(next.cluster.category).label)}</span>` : ''}
             <span class="lc-next-msg">${LU_ESC(next.item ? next.item.message : next.message)}</span>
             ${next.item && next.item.suggestion ? ` <span class="lc-next-sugg">${LU_ESC(next.item.suggestion)}</span>` : ''}
           </div>`
        : '';

    body.innerHTML = `
        <div class="learning-summary-verdict lc-state-${verdictState}">
          ${icon(verdictMeta.icon)} <strong>${LU_ESC(verdictMeta.label)}:</strong> ${LU_ESC(pipelineResult.verdict)}
        </div>
        ${nextHtml}
        <div class="learning-cluster-grid">
          ${pipelineResult.clusters.map(buildClusterCard).join('')}
        </div>`;
    refreshIcons(body);
}

/** Hide the panel (e.g. when the editor is cleared). */
function clearLearningPanel() {
    const panel = document.getElementById('learning-feedback-panel');
    if (panel) panel.classList.add('hidden');
}

PseudoPyLearning.register.learningUi = {
    renderLearningPanel: renderLearningPanel,
    clearLearningPanel: clearLearningPanel,
    buildClusterCard: buildClusterCard,
    suggestNextStep: suggestNextStep
};