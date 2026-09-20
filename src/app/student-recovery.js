/* ============================================================
   FORGOT PASSWORD — STUDENT FLOW
   ============================================================ */

/**
 * Shows the forgot-password panel on the login page.
 */
function showForgotPassword() {
    hide('login-form-section-inner');
    show('forgot-password-panel');
    setValue('fp-username-input', '');
    hide('fp-step-2');
    show('fp-step-1');
}

/**
 * Returns to the normal login form from the forgot-password panel.
 */
function cancelForgotPassword() {
    show('login-form-section-inner');
    hide('forgot-password-panel');
}

/**
 * Submits a password recovery request for student (instructor approval) or instructor (admin approval).
 */
async function submitRecoveryRequest() {
    const rawInput = getValue('fp-username-input').trim();
    const usernameOrId = typeof normalizeUsername === 'function' ? normalizeUsername(rawInput) : rawInput;
    if (!usernameOrId) {
        showToast('Please enter your username, email, or Student ID.', 'error');
        return;
    }

    await refreshUsers();
    const targetUser = cachedUsers.find(u =>
        (u.username === usernameOrId || u.username === rawInput || u.studentId === rawInput || u.email === rawInput) &&
        (u.role === 'student' || u.role === 'instructor')
    );

    if (!targetUser) {
        showToast('Account not found. Check your username, email, or Student ID.', 'error');
        return;
    }

    if (targetUser.status === 'inactive' || targetUser.status === 'archived') {
        const contactRole = targetUser.role === 'instructor' ? 'administrator' : 'instructor';
        showToast(`Your account is ${targetUser.status}. Please contact your ${contactRole}.`, 'error');
        return;
    }

    const isInstructor = targetUser.role === 'instructor';
    const approver = isInstructor ? 'administrator' : 'instructor';

    // Check for existing pending request to avoid duplicates
    const existing = await dbGetAll(passwordRequestsRef);
    const alreadyPending = existing.find(r =>
        r.type === 'recovery' && (r.studentId === targetUser._docId || r.userId === targetUser._docId) && r.status === 'pending'
    );

    if (alreadyPending) {
        setText('fp-submitted-name', targetUser.fullName);
        hide('fp-step-1');
        show('fp-step-2');
        showToast(`You already have a pending recovery request. Ask your ${approver} to approve it.`, 'info');
        return;
    }

    // Create a new recovery request
    const reqId = 'pr_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    await dbSet(passwordRequestsRef, reqId, {
        _docId: reqId,
        type: 'recovery',
        userRole: targetUser.role,
        targetRole: targetUser.role,
        userId: targetUser._docId,
        studentId: targetUser._docId, // for backward compatibility
        studentName: targetUser.fullName,
        studentUsername: targetUser.username,
        studentEnrolledId: targetUser.studentId || (isInstructor ? 'INSTRUCTOR' : '—'),
        email: targetUser.email || null,
        instructorId: targetUser.instructorId || null,
        status: 'pending',
        requestedAt: new Date().toISOString(),
        reviewedAt: null,
        reviewedBy: null,
        reviewedByName: null,
        resetToken: null,
        tokenExpiresAt: null,
        tokenUsed: false
    });

    await logAuditAction({
        action: 'password_reset_requested',
        studentId: targetUser._docId,
        studentName: targetUser.fullName,
        username: targetUser.username,
        userRole: targetUser.role,
        requestId: reqId
    });

    setText('fp-submitted-name', targetUser.fullName);
    hide('fp-step-1');
    show('fp-step-2');
    showToast(`Recovery request submitted! Ask your ${approver} to approve it.`, 'success');

    // Update badges
    if (isInstructor) {
        updateAdminPendingRequestsBadge();
    } else {
        updatePendingRequestsBadge();
    }
}

/**
 * Checks if recovery request has been approved, then shows the reset password form if a valid token exists.
 */
async function checkRecoveryStatus() {
    const usernameOrId = getValue('fp-username-input').trim() ||
        (getValue('fp-check-username') || '').trim();
    const checkInput = getValue('fp-check-username').trim();
    const rawLookup = checkInput || usernameOrId;
    const lookupVal = typeof normalizeUsername === 'function' ? normalizeUsername(rawLookup) : rawLookup;

    if (!lookupVal) {
        showToast('Please enter your username, email, or Student ID.', 'error');
        return;
    }

    await refreshUsers();
    const targetUser = cachedUsers.find(u =>
        (u.username === lookupVal || u.username === rawLookup || u.studentId === rawLookup || u.email === rawLookup) &&
        (u.role === 'student' || u.role === 'instructor')
    );

    if (!targetUser) {
        showToast('Account not found.', 'error');
        return;
    }

    const isInstructor = targetUser.role === 'instructor';
    const approver = isInstructor ? 'administrator' : 'instructor';

    // Find the most recent approved (unused, non-expired) recovery request
    const requests = await dbGetAll(passwordRequestsRef);
    const now = Date.now();

    const approvedReq = requests
        .filter(r =>
            r.type === 'recovery' &&
            (r.studentId === targetUser._docId || r.userId === targetUser._docId) &&
            r.status === 'approved' &&
            !r.tokenUsed &&
            r.tokenExpiresAt && r.tokenExpiresAt > now
        )
        .sort((a, b) => b.tokenExpiresAt - a.tokenExpiresAt)[0];

    if (!approvedReq) {
        // Check if there's an expired one
        const expiredReq = requests.find(r =>
            r.type === 'recovery' &&
            (r.studentId === targetUser._docId || r.userId === targetUser._docId) &&
            r.status === 'approved' &&
            (!r.tokenExpiresAt || r.tokenExpiresAt <= now)
        );
        if (expiredReq) {
            // Auto-mark as expired
            await dbUpdate(passwordRequestsRef, expiredReq._docId, { status: 'expired' });
            showToast('Your recovery authorization has expired. Please submit a new request.', 'error');
        } else {
            showToast(`No approved recovery request found. Please ask your ${approver} to approve it.`, 'info');
        }
        return;
    }

    // Show reset password form
    // Store the request ID in a hidden field on the form
    setValue('fp-reset-request-id', approvedReq._docId);
    setValue('fp-reset-student-id', targetUser._docId);
    setValue('fp-reset-new-password', '');
    setValue('fp-reset-confirm-password', '');

    // Show expiry countdown
    const minsLeft = Math.max(0, Math.floor((approvedReq.tokenExpiresAt - now) / 60000));
    setText('fp-token-expiry', `Authorization expires in ~${minsLeft} minute${minsLeft !== 1 ? 's' : ''}`);

    hide('fp-step-2');
    show('fp-step-3');
}

/**
 * Student submits their new password after instructor approval.
 */
async function submitPasswordReset() {
    const requestId = getValue('fp-reset-request-id').trim();
    const studentDocId = getValue('fp-reset-student-id').trim();
    const newPwd = getValue('fp-reset-new-password').trim();
    const confirmPwd = getValue('fp-reset-confirm-password').trim();

    if (!newPwd || !confirmPwd) {
        showToast('Please fill in both password fields.', 'error');
        return;
    }

    if (newPwd !== confirmPwd) {
        showToast('Passwords do not match.', 'error');
        return;
    }

    // Re-validate token is still valid
    const req = await dbGet(passwordRequestsRef, requestId);
    if (!req || req.status !== 'approved' || req.tokenUsed || req.tokenExpiresAt <= Date.now()) {
        showToast('Recovery authorization is invalid or expired. Please request a new one.', 'error');
        return;
    }

    try {
        // Hash the new password
        const salt = generateSalt();
        const hash = await hashPassword(newPwd, salt);

        // Update the student's credentials
        const storedUser = await dbGet(usersRef, studentDocId);
        if (storedUser) {
            delete storedUser.password;
            storedUser.passwordHash = hash;
            storedUser.passwordSalt = salt;
            storedUser.lastPasswordChange = new Date().toISOString().split('T')[0];
            await dbSet(usersRef, storedUser._docId, storedUser);
        }

        // Invalidate the token (one-time use)
        await dbUpdate(passwordRequestsRef, requestId, {
            status: 'completed',
            tokenUsed: true,
            completedAt: new Date().toISOString()
        });

        // Log to audit trail — NEVER log the password
        await logAuditAction({
            action: 'password_reset_completed',
            studentId: studentDocId,
            studentName: req.studentName,
            username: req.studentUsername,
            instructorId: req.reviewedBy,
            instructorName: req.reviewedByName,
            requestId: requestId
        });

        // Show success state
        hide('fp-step-3');
        show('fp-step-success');
        showToast('Password reset successfully! You can now log in.', 'success');

        // Refresh caches
        await refreshUsers();
    } catch (err) {
        console.error('[PasswordReset] Error:', err);
        showToast('Failed to reset password. Please try again.', 'error');
    }
}

/**
 * Returns to login after successful reset.
 */
function backToLoginAfterReset() {
    hide('forgot-password-panel');
    show('login-form-section-inner');
    hide('fp-step-success');
    show('fp-step-1');
    setValue('fp-username-input', '');
    setValue('fp-check-username', '');
}


