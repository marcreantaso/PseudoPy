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

async function clearSecurityAuditHistory() {
    if (!window.confirm('Clear all security audit history? Password recovery requests will remain unchanged.')) return;
    const button = document.querySelector('[onclick="clearSecurityAuditHistory()"]');
    if (button) button.disabled = true;
    try {
        await dbClearCollection(auditLogRef);
        showToast('Security audit history cleared.', 'success');
        await loadPasswordRequests();
    } catch (error) {
        console.error('[Audit] Clear history failed:', error);
        showToast('Unable to clear security audit history.', 'error');
    } finally {
        if (button) button.disabled = false;
    }
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
                  <td><div class="user-cell"><div class="avatar-sm">${name.charAt(0)}</div><div>
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
    const auditLogs = await refreshAuditLog();
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

    const allLogs = [...auditLogs, ...legacyHistory]
        // Never render incomplete legacy audit rows as Unknown/UNKNOWN events.
        .filter(record => record.action && record.action !== 'unknown' &&
            (record.actorId || record.studentId || record.instructorId) &&
            (record.actorName || record.studentName || record.instructorName))
        .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

    setText('stat-total-changes', allLogs.length);

    const tbody = $id('password-requests-body');
    if (tbody) {
        if (allLogs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--text-muted)">No security events recorded yet.</td></tr>';
        } else {
            const actionLabels = {
                'password_changed': { icon: 'key-round', label: 'Password Changed', cls: 'badge-approved' },
                'password_reset_requested': { icon: 'mail', label: 'Reset Requested', cls: 'badge-recovery-pending' },
                'password_reset_approved': { icon: 'circle-check', label: 'Reset Approved', cls: 'badge-recovery-approved' },
                'password_reset_rejected': { icon: 'circle-x', label: 'Reset Rejected', cls: 'badge-recovery-rejected' },
                'password_reset_completed': { icon: 'party-popper', label: 'Reset Completed', cls: 'badge-recovery-completed' }
            };

            tbody.innerHTML = allLogs.map(r => {
                const a = actionLabels[r.action] || { icon: 'clipboard-list', label: r.action || 'Unknown', cls: '' };
                const dt = r.timestamp
                    ? new Date(r.timestamp).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
                    : '—';
                const name = r.studentName || r.instructorName || 'Unknown';
                const username = r.username || '—';
                return `
                <tr>
                  <td><div class="user-cell"><div class="avatar-sm">${name.charAt(0)}</div>
                    <div>
                      <div style="font-weight:600;color:var(--text-primary)">${name}</div>
                      <div style="font-size:0.75rem;color:var(--text-muted)">@${username}</div>
                    </div>
                  </div></td>
                  <td><span class="badge ${a.cls}"><i data-lucide="${a.icon}" aria-hidden="true"></i> ${a.label}</span></td>
                  <td>${r.instructorName || '—'}</td>
                  <td>${dt}</td>
                </tr>`;
            }).join('');
        }
    }

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

async function approveAdminRecoveryRequest() {
    hide('admin-recovery-confirm-dialog');
    if (!currentAdminReviewRequestId) return;

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
}

async function rejectAdminRecoveryRequest() {
    if (!currentAdminReviewRequestId) return;

    const req = await dbGet(passwordRequestsRef, currentAdminReviewRequestId);
    if (!req) return;

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


