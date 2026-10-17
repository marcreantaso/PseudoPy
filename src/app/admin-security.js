/* ============================================================
   ADMIN: INSTRUCTOR PASSWORD REQUESTS & SECURITY AUDIT LOG
   ============================================================ */

let currentAdminReviewRequestId = null;
let auditLogUnsubscribe = null;
let auditRealtimeTimer = null;

function startAuditLogRealtime() {
    if (auditLogUnsubscribe) return;
    auditLogUnsubscribe = subscribeCollection(auditLogRef, () => {
        if (currentPage !== 'password-requests') return;
        clearTimeout(auditRealtimeTimer);
        auditRealtimeTimer = setTimeout(() => loadPasswordRequests(), 80);
    }, error => console.warn('[Audit] Realtime subscription failed:', error.message));
}

function stopAuditLogRealtime() {
    if (auditLogUnsubscribe) auditLogUnsubscribe();
    auditLogUnsubscribe = null;
    clearTimeout(auditRealtimeTimer);
    auditRealtimeTimer = null;
}

/* ── Security Audit Log: state ─────────────────────────────────
   Records are held in memory and rendered on demand. Filters and
   pagination are view state only; stored audit records are never
   rewritten or migrated. */
let auditLogAllRecords = [];
let auditLogPage = 1;
let auditLogCategory = '';
let auditLogBusy = false;
const AUDIT_LOG_PAGE_SIZE = 8;
const AUDIT_CLEAR_CONFIRM_WORD = 'DELETE';

/** Escape a value for use inside a quoted HTML attribute. */
function auditEscapeAttribute(value) {
    return escapeHtml(String(value == null ? '' : value))
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** The account an event is about (the target), if any. */
function auditRecordAccountName(record) {
    return record.studentName || record.actorName || record.instructorName || '';
}

function auditRecordUsername(record) {
    return record.username || record.actorUsername || '';
}

/** A stored explanation, when the writer recorded one. */
function auditRecordReason(record) {
    if (!record) return '';
    if (record.reason) return String(record.reason);
    if (record.details) return String(record.details);
    if (record.metadata && record.metadata.details) return String(record.metadata.details);
    return '';
}

/* ── Filters & pagination ────────────────────────────────────── */

function setAuditCategoryFilter(key) {
    auditLogCategory = key || '';
    auditLogPage = 1;
    renderAuditCategoryChips();
    renderAuditLogTable();
}

function renderAuditCategoryChips() {
    const host = $id('audit-category-chips');
    if (!host) return;
    const chips = [{ key: '', label: 'All', icon: '{{ui:ClipboardList}}', count: auditLogAllRecords.length }]
        .concat(auditCategories().map(c => ({
            key: c.key,
            label: c.label,
            icon: c.icon,
            count: auditLogAllRecords.filter(r => formatAuditAction(r.action).category === c.key).length
        })));
    host.innerHTML = chips.map(c => `
        <button type="button" class="audit-chip${auditLogCategory === c.key ? ' is-active' : ''}"
                data-audit-category="${auditEscapeAttribute(c.key)}" aria-pressed="${auditLogCategory === c.key ? 'true' : 'false'}">
            ${c.icon}<span>${escapeHtml(c.label)}</span><span class="audit-chip-count">${c.count}</span>
        </button>`).join('');
}

function filteredAuditRecords() {
    const searchEl = $id('audit-search');
    const fromEl = $id('audit-date-from');
    const toEl = $id('audit-date-to');
    const search = (searchEl && searchEl.value ? searchEl.value : '').trim().toLowerCase();
    const from = fromEl && fromEl.value ? new Date(fromEl.value + 'T00:00:00').getTime() : null;
    const to = toEl && toEl.value ? new Date(toEl.value + 'T23:59:59.999').getTime() : null;

    return auditLogAllRecords.filter(r => {
        const meta = formatAuditAction(r.action);
        if (auditLogCategory && meta.category !== auditLogCategory) return false;
        if (search) {
            const hay = [meta.label, auditRecordAccountName(r), auditRecordUsername(r),
                resolveAuditAuthorizedBy(r, meta)].join(' ').toLowerCase();
            if (!hay.includes(search)) return false;
        }
        if (from != null || to != null) {
            const t = r.timestamp ? new Date(r.timestamp).getTime() : NaN;
            if (isNaN(t)) return false;
            if (from != null && t < from) return false;
            if (to != null && t > to) return false;
        }
        return true;
    });
}

function applyAuditFilters() {
    auditLogPage = 1;
    renderAuditLogTable();
}

function auditGoPage(page) {
    auditLogPage = page;
    renderAuditLogTable();
}

function renderAuditLogTable() {
    const tbody = $id('password-requests-body');
    if (!tbody) return;

    const records = filteredAuditRecords();
    const pageCount = Math.max(1, Math.ceil(records.length / AUDIT_LOG_PAGE_SIZE));
    auditLogPage = Math.min(Math.max(1, auditLogPage), pageCount);
    const start = (auditLogPage - 1) * AUDIT_LOG_PAGE_SIZE;
    const slice = records.slice(start, start + AUDIT_LOG_PAGE_SIZE);

    const countEl = $id('audit-count-label');
    if (countEl) {
        countEl.textContent = records.length === 0
            ? 'No events match the current filters'
            : `Showing ${start + 1}\u2013${Math.min(start + AUDIT_LOG_PAGE_SIZE, records.length)} of ${records.length}`;
    }

    if (records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="audit-empty">No security events match the current filters.</td></tr>';
    } else {
        tbody.innerHTML = slice.map(buildAuditRow).join('');
    }
    renderAuditPagination(pageCount);
}

function renderAuditPagination(pageCount) {
    const host = $id('audit-pagination');
    if (!host) return;
    if (pageCount <= 1) { host.innerHTML = ''; return; }
    let html = `<button type="button" class="an-page-btn" data-audit-page="${auditLogPage - 1}"${auditLogPage <= 1 ? ' disabled' : ''}>Previous</button>`;
    for (let p = 1; p <= pageCount; p++) {
        html += `<button type="button" class="an-page-btn${p === auditLogPage ? ' active' : ''}" data-audit-page="${p}"${p === auditLogPage ? ' aria-current="page"' : ''}>${p}</button>`;
    }
    html += `<button type="button" class="an-page-btn" data-audit-page="${auditLogPage + 1}"${auditLogPage >= pageCount ? ' disabled' : ''}>Next</button>`;
    host.innerHTML = html;
}

/* ── Row & detail rendering ──────────────────────────────────── */

function buildAuditRow(record) {
    const meta = formatAuditAction(record.action);
    const name = auditRecordAccountName(record);
    const username = auditRecordUsername(record);
    const authorizedBy = resolveAuditAuthorizedBy(record, meta);
    const id = record._docId || record.id || '';
    const nameCell = name
        ? `<div class="audit-account-name" title="${auditEscapeAttribute(name)}">${escapeHtml(name)}</div>`
        : '<div class="audit-account-name audit-account-unknown" title="No account details were recorded">Unknown account</div>';
    const usernameCell = username
        ? `<div class="audit-account-username">@${escapeHtml(username)}</div>`
        : '<div class="audit-account-username audit-account-unknown">&mdash;</div>';
    const relative = formatAuditRelativeTime(record.timestamp);
    return `
      <tr data-audit-id="${auditEscapeAttribute(id)}">
        <td data-label="Account">
          <div class="user-cell">
            <div class="avatar-sm">{{ui:UserRound}}</div>
            <div class="audit-account">${nameCell}${usernameCell}</div>
          </div>
        </td>
        <td data-label="Action">
          <span class="badge audit-badge ${escapeHtml(meta.badgeClass)}" data-severity="${escapeHtml(meta.severity)}">
            ${meta.icon}<span>${escapeHtml(meta.label)}</span>
          </span>
        </td>
        <td data-label="Authorized by" class="audit-authorized">${escapeHtml(authorizedBy)}</td>
        <td data-label="Date &amp; time" class="audit-when">
          <span title="${auditEscapeAttribute(relative)}">${escapeHtml(formatAuditTimestamp(record.timestamp))}</span>
        </td>
        <td data-label="Details" class="audit-details-cell">
          <button type="button" class="btn btn-ghost btn-sm audit-detail-btn" data-audit-open="${auditEscapeAttribute(id)}"
                  aria-label="View details for ${auditEscapeAttribute(meta.label)}">{{ui:Eye}}</button>
        </td>
      </tr>`;
}

function openAuditDetail(id) {
    if (!id) return;
    const record = auditLogAllRecords.find(r => (r._docId || r.id) === id);
    if (!record) { showToast('That audit event is no longer available.', 'error'); return; }

    const meta = formatAuditAction(record.action);
    const name = auditRecordAccountName(record) || 'Unknown account';
    const username = auditRecordUsername(record);
    const authorizedBy = resolveAuditAuthorizedBy(record, meta);
    const actor = record.actorName || record.instructorName || '';
    const reason = auditRecordReason(record);
    const rawCode = meta.code || record.action || 'unknown';
    const relative = formatAuditRelativeTime(record.timestamp) || 'unknown';
    const iso = record.timestamp ? String(record.timestamp) : '\u2014';

    setHtml('audit-detail-body', `
      <dl class="audit-detail-list">
        <div class="audit-detail-row"><dt>Action</dt><dd>
          <span class="badge audit-badge ${escapeHtml(meta.badgeClass)}">${meta.icon}<span>${escapeHtml(meta.label)}</span></span>
        </dd></div>
        <div class="audit-detail-row"><dt>Description</dt><dd>${escapeHtml(meta.shortDescription)}</dd></div>
        <div class="audit-detail-row"><dt>Account</dt><dd>${escapeHtml(name)}${username ? ` <span class="audit-muted">@${escapeHtml(username)}</span>` : ''}</dd></div>
        <div class="audit-detail-row"><dt>Authorized by</dt><dd>${escapeHtml(authorizedBy)}</dd></div>
        ${actor && actor !== authorizedBy ? `<div class="audit-detail-row"><dt>Recorded actor</dt><dd>${escapeHtml(actor)}</dd></div>` : ''}
        <div class="audit-detail-row"><dt>Reason</dt><dd>${reason ? escapeHtml(reason) : '<span class="audit-muted">Not recorded</span>'}</dd></div>
        <div class="audit-detail-row"><dt>Timestamp</dt><dd>
          ${escapeHtml(formatAuditTimestamp(record.timestamp))} <span class="audit-muted">(${escapeHtml(relative)})</span>
          <br><code class="audit-mono">${escapeHtml(iso)}</code>
        </dd></div>
        <div class="audit-detail-row"><dt>Record ID</dt><dd><code class="audit-mono">${escapeHtml(record._docId || record.id || '\u2014')}</code></dd></div>
        <div class="audit-detail-row"><dt>Action code</dt><dd class="audit-code-cell">
          <code class="audit-mono">${escapeHtml(rawCode)}</code>
          <button type="button" class="btn btn-ghost btn-sm audit-copy-btn" data-audit-copy="${auditEscapeAttribute(rawCode)}"
                  aria-label="Copy action code">{{ui:Files}}</button>
        </dd></div>
      </dl>`);
    show('audit-detail-drawer');
}

function closeAuditDetail() {
    hide('audit-detail-drawer');
}

/* ── Clear history (archive first, typed confirmation) ───────── */

function openAuditClearModal() {
    if (auditLogBusy) return;
    const count = auditLogAllRecords.length;
    const summary = $id('audit-clear-summary');
    if (summary) {
        summary.textContent = count === 0
            ? 'There are no security events to clear.'
            : `This permanently deletes ${count} security event${count === 1 ? '' : 's'} from this device and the cloud. Password recovery requests are not affected.`;
    }
    const input = $id('audit-clear-confirm-input');
    if (input) input.value = '';
    const confirmBtn = $id('audit-clear-confirm-btn');
    if (confirmBtn) confirmBtn.disabled = true;
    show('audit-clear-modal');
}

function closeAuditClearModal() {
    hide('audit-clear-modal');
}

function auditClearInputChanged() {
    const input = $id('audit-clear-confirm-input');
    const confirmBtn = $id('audit-clear-confirm-btn');
    if (confirmBtn) {
        confirmBtn.disabled = !(input && input.value.trim().toUpperCase() === AUDIT_CLEAR_CONFIRM_WORD);
    }
}

async function performClearAuditHistory() {
    if (auditLogBusy) return;
    const input = $id('audit-clear-confirm-input');
    if (!input || input.value.trim().toUpperCase() !== AUDIT_CLEAR_CONFIRM_WORD) return;

    auditLogBusy = true;
    const confirmBtn = $id('audit-clear-confirm-btn');
    if (confirmBtn) { confirmBtn.classList.add('is-loading'); confirmBtn.disabled = true; }

    const clearedCount = auditLogAllRecords.length;
    try {
        await dbClearCollection(auditLogRef);
        const actorId = currentUser ? (currentUser._docId || currentUser.id) : 'admin';
        const actorName = currentUser ? currentUser.fullName : 'Administrator';
        // One new record documents who cleared the history and when.
        await logAuditAction({
            action: 'audit.history-cleared',
            studentId: actorId,
            studentName: actorName,
            instructorId: actorId,
            instructorName: actorName,
            reason: clearedCount > 0
                ? `Cleared ${clearedCount} audit event${clearedCount === 1 ? '' : 's'}.`
                : 'No events were present.'
        });
        closeAuditClearModal();
        showToast('Security audit history cleared.', 'success');
        await loadPasswordRequests();
    } catch (error) {
        console.error('[Audit] Clear history failed:', error);
        showToast('Unable to clear security audit history.', 'error');
    } finally {
        auditLogBusy = false;
        if (confirmBtn) { confirmBtn.classList.remove('is-loading'); confirmBtn.disabled = false; }
    }
}

/* ── CSV archive ─────────────────────────────────────────────── */

function auditCsvCell(value) {
    const s = String(value == null ? '' : value);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function buildAuditCsv(records) {
    const headers = ['timestamp', 'action_code', 'action_label', 'category',
        'account', 'username', 'authorized_by', 'record_id'];
    const lines = [headers.join(',')];
    (records || []).forEach(r => {
        const meta = formatAuditAction(r.action);
        const category = AUDIT_ACTION_CATEGORIES[meta.category]
            ? AUDIT_ACTION_CATEGORIES[meta.category].label
            : meta.category;
        lines.push([
            r.timestamp || '',
            meta.code || r.action || '',
            meta.label,
            category,
            auditRecordAccountName(r),
            auditRecordUsername(r),
            resolveAuditAuthorizedBy(r, meta),
            r._docId || r.id || ''
        ].map(auditCsvCell).join(','));
    });
    return lines.join('\r\n');
}

function downloadAuditCsv() {
    const csv = buildAuditCsv(auditLogAllRecords);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pseudopy-security-audit-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Audit history exported as CSV.', 'success');
}

/* ── UI wiring ───────────────────────────────────────────────── */

function initAuditLogUi() {
    const clearBtn = $id('audit-clear-history-btn');
    if (clearBtn && !clearBtn.dataset.auditBound) {
        clearBtn.dataset.auditBound = '1';
        clearBtn.addEventListener('click', openAuditClearModal);
    }
    const confirmBtn = $id('audit-clear-confirm-btn');
    if (confirmBtn) confirmBtn.addEventListener('click', performClearAuditHistory);
    const exportBtn = $id('audit-export-csv-btn');
    if (exportBtn) exportBtn.addEventListener('click', downloadAuditCsv);
    const input = $id('audit-clear-confirm-input');
    if (input) input.addEventListener('input', auditClearInputChanged);

    ['audit-search', 'audit-date-from', 'audit-date-to'].forEach(id => {
        const el = $id(id);
        if (el) {
            el.addEventListener('input', applyAuditFilters);
            el.addEventListener('change', applyAuditFilters);
        }
    });

    if (typeof document.querySelectorAll === 'function') {
        document.querySelectorAll('[data-audit-clear-close]').forEach(el => el.addEventListener('click', closeAuditClearModal));
        document.querySelectorAll('[data-audit-close]').forEach(el => el.addEventListener('click', closeAuditDetail));
    }

    const chips = $id('audit-category-chips');
    if (chips) chips.addEventListener('click', event => {
        const chip = event.target.closest && event.target.closest('[data-audit-category]');
        if (chip) setAuditCategoryFilter(chip.getAttribute('data-audit-category'));
    });

    const pagination = $id('audit-pagination');
    if (pagination) pagination.addEventListener('click', event => {
        const pageBtn = event.target.closest && event.target.closest('[data-audit-page]');
        if (pageBtn && !pageBtn.disabled) auditGoPage(Number(pageBtn.getAttribute('data-audit-page')));
    });

    const tbody = $id('password-requests-body');
    if (tbody) tbody.addEventListener('click', event => {
        const detailBtn = event.target.closest && event.target.closest('[data-audit-open]');
        if (detailBtn) openAuditDetail(detailBtn.getAttribute('data-audit-open'));
    });

    const drawerBody = $id('audit-detail-body');
    if (drawerBody) drawerBody.addEventListener('click', event => {
        const copyBtn = event.target.closest && event.target.closest('[data-audit-copy]');
        if (copyBtn) copyText(copyBtn.getAttribute('data-audit-copy'));
    });

    if (typeof document.addEventListener === 'function') {
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            const modal = $id('audit-clear-modal');
            const drawer = $id('audit-detail-drawer');
            if (modal && !modal.classList.contains('hidden')) closeAuditClearModal();
            else if (drawer && !drawer.classList.contains('hidden')) closeAuditDetail();
        });
    }
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAuditLogUi);
    else initAuditLogUi();
}

async function updateAdminPendingRequestsBadge() {
    try {
        const requests = await dbGetAll(passwordRequestsRef);
        const pending = requests.filter(r => r.type === 'recovery' && (r.userRole === 'instructor' || r.targetRole === 'instructor') && r.status === 'pending');
        const badge = $id('nav-admin-recovery-badge');
        if (badge) {
            badge.textContent = pending.length > 0 ? String(pending.length) : '';
            badge.style.display = pending.length > 0 ? 'inline-flex' : 'none';
        }
    } catch (e) { /* non-critical */ }
}

/**
 * Loads both Instructor Password Requests (with Admin approval actions)
 * and the Security Audit Log for the admin panel.
 */
async function loadPasswordRequests() {
    // 1. Instructor Password Recovery Requests
    const allRequests = await dbGetAll(passwordRequestsRef);
    const now = Date.now();

    const instructorRecovery = allRequests
        .filter(r => r.type === 'recovery' && (r.userRole === 'instructor' || r.targetRole === 'instructor'))
        .sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''));

    // Auto-expire old approved tokens
    for (const r of instructorRecovery) {
        if (r.status === 'approved' && r.tokenExpiresAt && r.tokenExpiresAt <= now && !r.tokenUsed) {
            await dbUpdate(passwordRequestsRef, r._docId, { status: 'expired' });
            r.status = 'expired';
        }
    }

    const pendingInstructorReqs = instructorRecovery.filter(r => r.status === 'pending');
    setText('stat-admin-recovery-pending', String(pendingInstructorReqs.length));
    setText('stat-admin-recovery-total', String(instructorRecovery.length));

    const adminRecoveryTbody = $id('admin-recovery-requests-body');
    if (adminRecoveryTbody) {
        if (instructorRecovery.length === 0) {
            adminRecoveryTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted)">No instructor password recovery requests yet.</td></tr>';
        } else {
            const statusMap = {
                pending: { cls: 'badge-recovery-pending', label: '<i data-lucide="hourglass" aria-hidden="true"></i> Pending' },
                approved: { cls: 'badge-recovery-approved', label: '<i data-lucide="circle-check" aria-hidden="true"></i> Approved' },
                rejected: { cls: 'badge-recovery-rejected', label: '<i data-lucide="circle-x" aria-hidden="true"></i> Rejected' },
                completed: { cls: 'badge-recovery-completed', label: '<i data-lucide="check" aria-hidden="true"></i> Completed' },
                expired: { cls: 'badge-recovery-expired', label: '<i data-lucide="timer" aria-hidden="true"></i> Expired' }
            };
            adminRecoveryTbody.innerHTML = instructorRecovery.map(r => {
                const s = statusMap[r.status] || { cls: '', label: r.status };
                const dt = r.requestedAt ? new Date(r.requestedAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
                const canReview = r.status === 'pending';
                const name = r.studentName || r.instructorName || 'Unknown';
                const username = r.studentUsername || r.instructorUsername || '—';
                return `
                <tr>
                  <td><div class="user-cell"><div class="avatar-sm">{{ui:UserRound}}</div><div>
                    <div style="font-weight:600;color:var(--text-primary)">${name}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted)">${r.email || 'Instructor'}</div>
                  </div></div></td>
                  <td>@${username}</td>
                  <td>${dt}</td>
                  <td><span class="badge ${s.cls}">${s.label}</span></td>
                  <td>
                    ${canReview
                        ? `<button class="btn btn-primary btn-sm" onclick="openAdminRecoveryReview('${r._docId}')"><i data-lucide="search" aria-hidden="true"></i> Review</button>`
                        : `<button class="btn btn-ghost btn-sm" onclick="openAdminRecoveryReview('${r._docId}')"><i data-lucide="eye" aria-hidden="true"></i> View</button>`
                    }
                  </td>
                </tr>`;
            }).join('');
        }
    }

    // 2. Load Security Audit Log
    // Show every event, including legacy rows without a recorded account, so
    // nothing is silently dropped; unidentified rows render as "Unknown account".
    const auditLogs = await refreshAuditLog({ includeUnidentified: true });
    const legacyHistory = (await dbGetAll(passwordRequestsRef))
        .filter(r => r.changedAt && !r.type)
        .map(r => ({
            _docId: r._docId,
            action: 'password_changed',
            studentName: r.fullName,
            username: r.username,
            timestamp: r.changedAt,
            instructorName: null,
            status: 'completed'
        }));

    auditLogAllRecords = [...auditLogs, ...legacyHistory]
        .filter(record => record.action && record.action !== 'unknown')
        .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

    setText('stat-total-changes', auditLogAllRecords.length);
    renderAuditCategoryChips();
    renderAuditLogTable();

    updateAdminPendingRequestsBadge();
}

/**
 * Opens Admin review modal for an instructor's password recovery request.
 */
async function openAdminRecoveryReview(requestId) {
    const req = await dbGet(passwordRequestsRef, requestId);
    if (!req) { showToast('Request not found.', 'error'); return; }

    currentAdminReviewRequestId = requestId;

    const userDocId = req.studentId || req.userId;
    const instructor = cachedUsers.find(u => u._docId === userDocId) ||
        (await refreshUsers()).find(u => u._docId === userDocId);

    const dt = req.requestedAt
        ? new Date(req.requestedAt).toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })
        : '—';

    const statusMap = {
        pending: { cls: 'badge-recovery-pending', label: '{{ui:Hourglass}} Pending' },
        approved: { cls: 'badge-recovery-approved', label: '{{ui:CircleCheck}} Approved' },
        rejected: { cls: 'badge-recovery-rejected', label: '{{ui:CircleX}} Rejected' },
        completed: { cls: 'badge-recovery-completed', label: '{{ui:Check}} Completed' },
        expired: { cls: 'badge-recovery-expired', label: '{{ui:Timer}} Expired' }
    };
    const s = statusMap[req.status] || { cls: '', label: req.status };
    const instName = req.studentName || req.instructorName || 'Unknown';
    const instUsername = req.studentUsername || req.instructorUsername || '—';

    setHtml('admin-recovery-review-content', `
        <div class="recovery-info-grid">
          <div class="recovery-info-row">
            <span class="recovery-info-label">{{ui:UserRound}} Instructor Name</span>
            <span class="recovery-info-value">${instName}</span>
          </div>
          <div class="recovery-info-row">
            <span class="recovery-info-label">{{ui:Mail}} Email</span>
            <span class="recovery-info-value">${req.email || (instructor ? instructor.email : '—')}</span>
          </div>
          <div class="recovery-info-row">
            <span class="recovery-info-label">{{ui:UserRound}} Username</span>
            <span class="recovery-info-value">@${instUsername}</span>
          </div>
          <div class="recovery-info-row">
            <span class="recovery-info-label">{{ui:Circle}} Account Status</span>
            <span class="recovery-info-value">${instructor ? instructor.status : 'Active'}</span>
          </div>
          <div class="recovery-info-row">
            <span class="recovery-info-label">{{ui:Calendar}} Request Date</span>
            <span class="recovery-info-value">${dt}</span>
          </div>
          <div class="recovery-info-row">
            <span class="recovery-info-label">{{ui:ClipboardList}} Request Status</span>
            <span class="recovery-info-value"><span class="badge ${s.cls}">${s.label}</span></span>
          </div>
        </div>
        <div class="recovery-security-notice">
          {{ui:LockKeyhole}} <strong>Security Notice:</strong> No password information is displayed.
          The administrator only authorizes the instructor to create a new password.
        </div>
    `);

    const approveBtn = $id('admin-recovery-approve-btn');
    const rejectBtn = $id('admin-recovery-reject-btn');
    if (approveBtn) approveBtn.style.display = req.status === 'pending' ? 'inline-flex' : 'none';
    if (rejectBtn) rejectBtn.style.display = req.status === 'pending' ? 'inline-flex' : 'none';

    show('admin-recovery-review-modal');
}

function closeAdminRecoveryReview() {
    hide('admin-recovery-review-modal');
    currentAdminReviewRequestId = null;
}

function confirmApproveAdminRecovery() {
    if (!currentAdminReviewRequestId) return;
    const modal = $id('admin-recovery-review-modal');
    const nameEl = modal ? modal.querySelector('.recovery-info-value') : null;
    const instructorName = nameEl ? nameEl.textContent : 'this instructor';

    setText('admin-recovery-confirm-name', instructorName);
    show('admin-recovery-confirm-dialog');
}

function closeAdminRecoveryConfirm() {
    hide('admin-recovery-confirm-dialog');
}

let _adminRecoveryBusy = false;
let _adminRecoveryRejectBusy = false;

async function approveAdminRecoveryRequest() {
    if (_adminRecoveryBusy) return;
    hide('admin-recovery-confirm-dialog');
    if (!currentAdminReviewRequestId) return;
    if (typeof requireOnline === 'function') {
        const gate = requireOnline();
        if (!gate.ok) { showToast(gate.message, 'error'); return; }
    }

    const approveBtn = $id('admin-recovery-confirm-approve-btn');
    _adminRecoveryBusy = true;
    if (approveBtn) {
        approveBtn.classList.add('is-loading');
        approveBtn.disabled = true;
    }

    try {
        const req = await dbGet(passwordRequestsRef, currentAdminReviewRequestId);
        if (!req || req.status !== 'pending') {
            showToast('This request is no longer pending.', 'error');
            closeAdminRecoveryReview();
            return;
        }

        const tokenBytes = new Uint8Array(32);
        crypto.getRandomValues(tokenBytes);
        const resetToken = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');
        const tokenExpiresAt = Date.now() + (30 * 60 * 1000); // 30 minutes

        const adminId = currentUser ? (currentUser._docId || currentUser.id) : 'admin';
        const adminName = currentUser ? currentUser.fullName : 'Administrator';

        await dbUpdate(passwordRequestsRef, req._docId, {
            status: 'approved',
            resetToken: resetToken,
            tokenExpiresAt: tokenExpiresAt,
            tokenUsed: false,
            reviewedAt: new Date().toISOString(),
            reviewedBy: adminId,
            reviewedByName: adminName
        });

        await logAuditAction({
            action: 'password_reset_approved',
            studentId: req.studentId || req.userId,
            studentName: req.studentName || req.instructorName,
            username: req.studentUsername || req.instructorUsername,
            instructorId: adminId,
            instructorName: adminName,
            requestId: req._docId
        });

        const instName = req.studentName || req.instructorName || 'Instructor';
        closeAdminRecoveryReview();
        showToast(`Password reset approved for ${instName}. Token valid for 30 minutes.`, 'success');
        await loadPasswordRequests();
    } catch (err) {
        console.error('[Recovery] approve error:', err);
        showToast('Failed to approve recovery request. Please try again.', 'error');
    } finally {
        _adminRecoveryBusy = false;
        if (approveBtn) {
            approveBtn.classList.remove('is-loading');
            approveBtn.disabled = false;
        }
    }
}

async function rejectAdminRecoveryRequest() {
    if (_adminRecoveryRejectBusy) return;
    if (!currentAdminReviewRequestId) return;
    if (typeof requireOnline === 'function') {
        const gate = requireOnline();
        if (!gate.ok) { showToast(gate.message, 'error'); return; }
    }

    const rejectBtn = $id('admin-recovery-reject-btn');
    _adminRecoveryRejectBusy = true;
    if (rejectBtn) {
        rejectBtn.classList.add('is-loading');
        rejectBtn.disabled = true;
    }

    try {
        const req = await dbGet(passwordRequestsRef, currentAdminReviewRequestId);
        if (!req || req.status !== 'pending') {
            showToast('This request is no longer pending.', 'error');
            closeAdminRecoveryReview();
            return;
        }

        const adminId = currentUser ? (currentUser._docId || currentUser.id) : 'admin';
        const adminName = currentUser ? currentUser.fullName : 'Administrator';

        await dbUpdate(passwordRequestsRef, req._docId, {
            status: 'rejected',
            reviewedAt: new Date().toISOString(),
            reviewedBy: adminId,
            reviewedByName: adminName
        });

        await logAuditAction({
            action: 'password_reset_rejected',
            studentId: req.studentId || req.userId,
            studentName: req.studentName || req.instructorName,
            username: req.studentUsername || req.instructorUsername,
            instructorId: adminId,
            instructorName: adminName,
            requestId: req._docId
        });

        const instName = req.studentName || req.instructorName || 'Instructor';
        closeAdminRecoveryReview();
        showToast(`Recovery request for ${instName} has been rejected.`, 'info');
        await loadPasswordRequests();
    } catch (err) {
        console.error('[Recovery] reject error:', err);
        showToast('Failed to reject recovery request. Please try again.', 'error');
    } finally {
        _adminRecoveryRejectBusy = false;
        if (rejectBtn) {
            rejectBtn.classList.remove('is-loading');
            rejectBtn.disabled = false;
        }
    }
}



/**
 * Trigger the hidden file input to upload a pseudocode file
 */
function uploadPseudocode() {
    const fileInput = $id('pseudocode-file-input');
    if (fileInput) fileInput.click();
}

/**
 * Handle the uploaded file and load its content into the editor
 */
function handlePseudocodeUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        const content = e.target.result;
        const editor = $id('pseudocode-editor');
        if (editor) editor.value = content;

        // Update line count
        const lines = content.split('\n').length;
        setText('line-count', lines + ' lines');

        showToast(`File "${file.name}" loaded successfully!`, 'success');
    };
    reader.onerror = function () {
        showToast('Failed to read the file. Please try again.', 'error');
    };
    reader.readAsText(file);

    // Reset the input so the same file can be re-uploaded if needed
    event.target.value = '';
}


