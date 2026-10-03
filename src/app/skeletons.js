/* ============================================================
   SKELETON PLACEHOLDERS (UX Rule 1)
   One reusable component: a skeleton must mirror the final
   layout (same heights, gaps, aspect ratio) so replacing it
   with real content causes zero layout shift. Containers set
   aria-busy="true" while a skeleton is visible; the shimmer is
   disabled by prefers-reduced-motion in style.css.
   ============================================================ */

const SKELETON_ROW_WIDTHS = [35, 50, 25, 45, 65, 40, 55, 30];

/** One shimmering bar, optionally width-limited. */
function skeletonBar(widthClass) {
    return '<div class="skeleton skeleton-line' + (widthClass ? ' ' + widthClass : '') + '"></div>';
}

/**
 * Skeleton rows for a table body: one shimmering cell per column, with
 * row-to-row width variation so it reads as data, not a gray slab.
 * The caller sets tbody.setAttribute('aria-busy', 'true').
 */
function skeletonTableRows(columnCount, rowCount) {
    const cols = Math.max(1, columnCount | 0);
    const rows = Math.max(1, rowCount || 4);
    let html = '';
    for (let r = 0; r < rows; r++) {
        let cells = '';
        for (let c = 0; c < cols; c++) {
            const w = SKELETON_ROW_WIDTHS[(r * 3 + c * 5) % SKELETON_ROW_WIDTHS.length];
            cells += '<td aria-hidden="true">' + skeletonBar('skeleton-w-' + w) + '</td>';
        }
        html += '<tr class="skeleton-tr">' + cells + '</tr>';
    }
    return html;
}

/**
 * Fill a table body with skeleton rows and mark it busy.
 * `label` is announced to screen readers while loading.
 */
function showTableSkeleton(tbodyId, columnCount, rowCount, label) {
    const tbody = typeof $id === 'function' ? $id(tbodyId) : null;
    if (!tbody) return;
    tbody.innerHTML =
        '<tr aria-hidden="true"><td colspan="' + Math.max(1, columnCount | 0) + '" style="padding:0.35rem 0.75rem">' +
        '<span class="sr-only" role="status">' + (label || 'Loading…') + '</span>' +
        '</td></tr>' + skeletonTableRows(columnCount, rowCount);
    tbody.setAttribute('aria-busy', 'true');
}

/** Clear the busy flag once real rows replace the skeleton. */
function clearTableSkeleton(tbodyId) {
    const tbody = typeof $id === 'function' ? $id(tbodyId) : null;
    if (tbody) tbody.setAttribute('aria-busy', 'false');
}

/**
 * Skeleton items for vertical lists (notifications, cards):
 * title bar + message bars, matching the real item padding.
 */
function skeletonListItems(count, itemClass) {
    const n = Math.max(1, count | 0);
    const cls = itemClass ? ' ' + itemClass : '';
    let html = '';
    for (let i = 0; i < n; i++) {
        html += '<div class="skeleton-notif' + cls + '" aria-hidden="true">' +
            skeletonBar('skeleton-title skeleton-w-' + SKELETON_ROW_WIDTHS[i % SKELETON_ROW_WIDTHS.length]) +
            skeletonBar('skeleton-w-100') +
            skeletonBar('skeleton-w-' + SKELETON_ROW_WIDTHS[(i + 3) % SKELETON_ROW_WIDTHS.length]) +
            '</div>';
    }
    return html;
}

/**
 * Running placeholder for a console/output area (UX Rule 1 + 3):
 * shown the instant Run is pressed so the tap always answers.
 * Remove with clearRunSkeleton as soon as the first output lands.
 */
function showRunSkeleton(outputEl) {
    if (!outputEl) return;
    outputEl.innerHTML =
        '<div class="console-running" data-run-skeleton="true" aria-hidden="true">' +
        skeletonBar('skeleton-w-65') + skeletonBar('skeleton-w-50') + skeletonBar('skeleton-w-35') +
        '</div><span class="sr-only" role="status">Running…</span>';
    outputEl.setAttribute('aria-busy', 'true');
}

function clearRunSkeleton(outputEl) {
    if (!outputEl) return;
    const skeleton = outputEl.querySelector ? outputEl.querySelector('[data-run-skeleton]') : null;
    if (skeleton) skeleton.remove();
    const status = outputEl.querySelector ? outputEl.querySelector('.sr-only[role="status"]') : null;
    if (status && status.textContent === 'Running…') status.remove();
    outputEl.removeAttribute('aria-busy');
}
