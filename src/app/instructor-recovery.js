/* ============================================================
   INSTRUCTOR: PASSWORD RECOVERY REQUESTS
   ============================================================ */

let currentReviewRequestId = null;

/**
 * Loads the instructor's Password Recovery page.
 */
async function loadPasswordRecovery() {
    const requests = await dbGetAll(passwordRequestsRef);
    const recoveryRequests = requests
        .filter(r => r.type === 'recovery')
        .sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''));

    // Auto-expire old approved tokens
    const now = Date.now();
    for (const r of recoveryRequests) {
        if (r.status === 'approved' && r.tokenExpiresAt && r.tokenExpiresAt <= now && !r.tokenUsed) {
            await dbUpdate(passwordRequestsRef, r._docId, { status: 'expired' });
            r.status = 'expired';
        }
    }

    const pending = recoveryRequests.filter(r => r.status === 'pending');
    setText('stat-recovery-pending', String(pending.length));
    setText('stat-recovery-total', String(recoveryRequests.length));

    const tbody = $id('recovery-requests-body');
    if (!tbody) return;

    if (recoveryRequests.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted)">No password recovery requests yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = recoveryRequests.map(r => {
        const statusMap = {
            pending: { cls: 'badge-recovery-pending', label: '{{ui:Hourglass}} Pending' },
            approved: { cls: 'badge-recovery-approved', label: '{{ui:CircleCheck}} Approved' },
            rejected: { cls: 'badge-recovery-rejected', label: '{{ui:CircleX}} Rejected' },
            completed: { cls: 'badge-recovery-completed', label: '{{ui:Check}} Completed' },
            expired: { cls: 'badge-recovery-expired', label: '{{ui:Timer}} Expired' }
        };
        const s = statusMap[r.status] || { cls: '', label: r.status };
        const dt = r.requestedAt ? new Date(r.requestedAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
        const canReview = r.status === 'pending';
        return `
        <tr>
          <td><div class="user-cell"><div class="avatar-sm">${(r.studentName || '?').charAt(0)}</div><div>
            <div style="font-weight:600;color:var(--text-primary)">${r.studentName || 'Unknown'}</div>
            <div style="font-size:0.75rem;color:var(--text-muted)">@${r.studentUsername || '—'}</div>
          </div></div></td>
          <td>${r.studentEnrolledId || '—'}</td>
          <td>${dt}</td>
          <td><span class="badge ${s.cls}">${s.label}</span></td>
          <td>
            ${canReview
                ? `<button class="btn btn-primary btn-sm" onclick="openRecoveryReview('${r._docId}')">{{ui:Search}} Review</button>`
                : `<button class="btn btn-ghost btn-sm" onclick="openRecoveryReview('${r._docId}')">{{ui:Eye}} View</button>`
            }
          </td>
        </tr>`;
    }).join('');

    // Update nav badge
    updatePendingRequestsBadge();
}

/**
 * Opens the review modal for a recovery request.
 * Shows ONLY safe account info — no password, hash, or token.
 */
async function openRecoveryReview(requestId) {
    const req = await dbGet(passwordRequestsRef, requestId);
    if (!req) { showToast('Request not found.', 'error'); return; }

    currentReviewRequestId = requestId;

    // Fetch student safe info
    const student = cachedUsers.find(u => u._docId === req.studentId) ||
        (await refreshUsers()).find(u => u._docId === req.studentId);

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

    setHtml('recovery-review-content', `
        <div class="recovery-info-grid">
          <div class="recovery-info-row">
            <span class="recovery-info-label">{{ui:UserRound}} Full Name</span>
            <span class="recovery-info-value">${req.studentName || 'Unknown'}</span>
          </div>
          <div class="recovery-info-row">
            <span class="recovery-info-label">{{ui:IdCard}} Student ID</span>
            <span class="recovery-info-value">${req.studentEnrolledId || '—'}</span>
          </div>
          <div class="recovery-info-row">
            <span class="recovery-info-label">{{ui:UserRound}} Username</span>
            <span class="recovery-info-value">@${req.studentUsername || '—'}</span>
          </div>
          <div class="recovery-info-row">
            <span class="recovery-info-label">{{ui:Circle}} Account Status</span>
            <span class="recovery-info-value">${student ? student.status : '—'}</span>
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
          The instructor only authorizes the student to create a new password.
        </div>
    `);

    const approveBtn = $id('recovery-approve-btn');
    const rejectBtn = $id('recovery-reject-btn');
    if (approveBtn) approveBtn.style.display = req.status === 'pending' ? 'inline-flex' : 'none';
    if (rejectBtn) rejectBtn.style.display = req.status === 'pending' ? 'inline-flex' : 'none';

    show('recovery-review-modal');
}

function closeRecoveryReview() {
    hide('recovery-review-modal');
    currentReviewRequestId = null;
}

/**
 * Shows confirmation dialog before approving a reset request.
 */
function confirmApproveRecovery() {
    if (!currentReviewRequestId) return;
    const req = cachedUsers; // we'll look it up in approveRecoveryRequest
    const modal = $id('recovery-review-modal');
    // Read the name from the info grid
    const nameEl = modal ? modal.querySelector('.recovery-info-value') : null;
    const studentName = nameEl ? nameEl.textContent : 'this student';

    setText('recovery-confirm-name', studentName);
    show('recovery-confirm-dialog');
}

function closeRecoveryConfirm() {
    hide('recovery-confirm-dialog');
}

/**
 * Instructor approves the password reset — generates one-time token.
 * Does NOT set or reveal any password.
 */
let _recoveryApproveBusy = false;
let _recoveryRejectBusy = false;

async function approveRecoveryRequest() {
    if (_recoveryApproveBusy) return;
    hide('recovery-confirm-dialog');
    if (!currentReviewRequestId) return;

    const approveBtn = $id('recovery-confirm-approve-btn');
    _recoveryApproveBusy = true;
    if (approveBtn) {
        approveBtn.classList.add('is-loading');
        approveBtn.disabled = true;
    }

    try {
        const req = await dbGet(passwordRequestsRef, currentReviewRequestId);
        if (!req || req.status !== 'pending') {
            showToast('This request is no longer pending.', 'error');
            closeRecoveryReview();
            return;
        }

        // Generate a cryptographically random one-time token
        const tokenBytes = new Uint8Array(32);
        crypto.getRandomValues(tokenBytes);
        const resetToken = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');

        // 30-minute expiry
        const tokenExpiresAt = Date.now() + (30 * 60 * 1000);

        await dbUpdate(passwordRequestsRef, req._docId, {
            status: 'approved',
            resetToken: resetToken,
            tokenExpiresAt: tokenExpiresAt,
            tokenUsed: false,
            reviewedAt: new Date().toISOString(),
            reviewedBy: currentUser._docId || currentUser.id,
            reviewedByName: currentUser.fullName
        });

        await logAuditAction({
            action: 'password_reset_approved',
            studentId: req.studentId,
            studentName: req.studentName,
            username: req.studentUsername,
            instructorId: currentUser._docId || currentUser.id,
            instructorName: currentUser.fullName,
            requestId: req._docId
        });

        closeRecoveryReview();
        showToast(`Password reset approved for ${req.studentName}. Token valid for 30 minutes.`, 'success');
        await loadPasswordRecovery();
    } catch (err) {
        console.error('[Recovery] approve error:', err);
        showToast('Failed to approve recovery request. Please try again.', 'error');
    } finally {
        _recoveryApproveBusy = false;
        if (approveBtn) {
            approveBtn.classList.remove('is-loading');
            approveBtn.disabled = false;
        }
    }
}

/**
 * Instructor rejects a password recovery request.
 */
async function rejectRecoveryRequest() {
    if (_recoveryRejectBusy) return;
    if (!currentReviewRequestId) return;

    const rejectBtn = $id('recovery-reject-btn');
    _recoveryRejectBusy = true;
    if (rejectBtn) {
        rejectBtn.classList.add('is-loading');
        rejectBtn.disabled = true;
    }

    try {
        const req = await dbGet(passwordRequestsRef, currentReviewRequestId);
        if (!req) return;

        await dbUpdate(passwordRequestsRef, req._docId, {
            status: 'rejected',
            reviewedAt: new Date().toISOString(),
            reviewedBy: currentUser._docId || currentUser.id,
            reviewedByName: currentUser.fullName
        });

        await logAuditAction({
            action: 'password_reset_rejected',
            studentId: req.studentId,
            studentName: req.studentName,
            username: req.studentUsername,
            instructorId: currentUser._docId || currentUser.id,
            instructorName: currentUser.fullName,
            requestId: req._docId
        });

        closeRecoveryReview();
        showToast(`Recovery request for ${req.studentName} has been rejected.`, 'info');
        await loadPasswordRecovery();
    } catch (err) {
        console.error('[Recovery] reject error:', err);
        showToast('Failed to reject recovery request. Please try again.', 'error');
    } finally {
        _recoveryRejectBusy = false;
        if (rejectBtn) {
            rejectBtn.classList.remove('is-loading');
            rejectBtn.disabled = false;
        }
    }
}


