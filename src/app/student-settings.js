/* ============================================================
   STUDENT SETTINGS & PASSWORD CHANGE
   ============================================================ */

// Cache for password change history
let cachedPasswordHistory = [];

async function refreshPasswordHistory() {
    cachedPasswordHistory = await dbGetAll(passwordRequestsRef);
    return cachedPasswordHistory;
}

/**
 * Load student settings page: profile info, cooldown check, change history
 */
async function loadStudentSettings() {
    if (!currentUser) return;

    // Populate profile info
    setText('settings-avatar', currentUser.fullName.charAt(0).toUpperCase());
    setText('settings-fullname', currentUser.fullName);
    setText('settings-username', '@' + currentUser.username);
    setText('settings-email', currentUser.email);
    setText('settings-role', currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1));
        const status = (currentUser.status || 'active').toLowerCase();
        const statusEl = $id('settings-status');
        if (statusEl) {
            statusEl.className = `detail-value account-status ${status === 'active' ? 'is-active' : 'is-inactive'}`;
            statusEl.innerHTML = `<i data-lucide="circle" aria-hidden="true"></i> ${status.charAt(0).toUpperCase() + status.slice(1)}`;
            refreshIcons(statusEl);
        }

    const roleBadge = $id('settings-role-badge');
    if (roleBadge) {
        roleBadge.className = 'badge ' + (ROLE_BADGES[currentUser.role] || 'badge-student');
        roleBadge.textContent = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
    }

    // Check 30-day cooldown
    const history = await refreshPasswordHistory();
    const myHistory = history
        .filter(r => r.userId === currentUser.id)
        .sort((a, b) => (b.changedAt || '').localeCompare(a.changedAt || ''));

    const lastChange = myHistory[0];
    const cooldownWarning = $id('password-cooldown-warning');
    const submitBtn = $id('submit-password-request-btn');

    let cooldownActive = false;

    if (lastChange && lastChange.changedAt) {
        const changeDate = new Date(lastChange.changedAt);
        const now = new Date();
        const diffDays = Math.floor((now - changeDate) / (1000 * 60 * 60 * 24));
        const remainingDays = 30 - diffDays;

        if (remainingDays > 0) {
            cooldownActive = true;
            if (cooldownWarning) cooldownWarning.classList.remove('hidden');
            setText('cooldown-message', `Your last password change was ${diffDays} day(s) ago. You can change your password again in ${remainingDays} day(s).`);
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = '{{ui:Hourglass}} Cooldown Active (' + remainingDays + ' days remaining)';
            }
        }
    }

    if (!cooldownActive) {
        if (cooldownWarning) cooldownWarning.classList.add('hidden');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '{{ui:KeyRound}} Change Password';
        }
    }

    // Render change history
    renderPasswordChangeHistory(myHistory);
}

function renderPasswordChangeHistory(history) {
    const container = $id('password-request-history');
    if (!container) return;

    if (history.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">{{ui:FileText}}</div><h3>No Changes Yet</h3><p>You haven\'t changed your password yet.</p></div>';
        return;
    }

    container.innerHTML = history.map(r => `
    <div class="request-card approved">
      <div class="request-card-header">
        <span class="badge badge-approved">{{ui:CircleCheck}} Changed</span>
        <span class="request-date">{{ui:Calendar}} ${r.changedAt || 'Unknown'}</span>
      </div>
      <div class="request-card-body">
        <span class="request-info">Password was changed successfully</span>
      </div>
    </div>`).join('');
}

/**
 * Change the student's password securely (hash-based).
 */
async function submitPasswordChangeRequest() {
    const newPassword = getValue('new-password').trim();
    const confirmPassword = getValue('confirm-new-password').trim();

    if (!newPassword || !confirmPassword) {
        showToast('Please fill in both password fields.', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showToast('Passwords do not match.', 'error');
        return;
    }

    try {
        // Hash the new password before storing
        const salt = generateSalt();
        const hash = await hashPassword(newPassword, salt);

        // Update the hashed password in Offline Database
        const users = cachedUsers.length ? cachedUsers : await refreshUsers();
        const user = users.find(u => u.id === currentUser.id);
        if (user) {
            const updatedData = await dbGet(usersRef, user._docId);
            if (updatedData) {
                delete updatedData.password; // remove any plaintext residue
                updatedData.passwordHash = hash;
                updatedData.passwordSalt = salt;
                updatedData.lastPasswordChange = new Date().toISOString().split('T')[0];
                await dbSet(usersRef, user._docId, updatedData);
            }
        }

        // Update current session (remove plaintext, store hash info)
        delete currentUser.password;
        currentUser.passwordHash = hash;
        currentUser.passwordSalt = salt;

        // Log the password change to audit log
        const logId = 'al_pc_' + Date.now();
        await dbSet(auditLogRef, logId, {
            _docId: logId,
            action: 'password_changed',
            studentId: currentUser.id,
            studentName: currentUser.fullName,
            username: currentUser.username,
            instructorId: null,
            instructorName: null,
            timestamp: new Date().toISOString(),
            requestId: null
            // NEVER log the password or hash
        });

        setValue('new-password', '');
        setValue('confirm-new-password', '');

        await refreshUsers();
        showToast('Password changed successfully! Use your new password next time you log in.', 'success');
        await loadStudentSettings();
    } catch (err) {
        console.error('[Offline Database] Change password error:', err);
        showToast('Failed to change password. Please try again.', 'error');
    }
}


