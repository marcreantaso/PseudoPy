/* ============================================================
   STUDENT SETTINGS & PASSWORD CHANGE
   ============================================================ */

/**
 * UX Rule 2 — clear the offline copies this browser holds.
 * Plain wording up front (what is removed, what is untouched, that it
 * cannot be undone), one confirm, then an immediate busy state. Local
 * only: the cloud account and everything already synced stays intact.
 * The device identifier is deliberately kept so removing data does not
 * silently turn the device into an unauthorized one.
 */
async function clearOfflineDataFromSettings() {
    const confirmed = window.confirm(
        'Clear offline data on this device?\n\n' +
        'This removes the offline copies of exercises, activity and notifications, your unsaved editor draft and cached lists from this browser.\n\n' +
        'Your account and everything already synced to the cloud are not affected. This cannot be undone.'
    );
    if (!confirmed) return;
    const btn = $id('clear-local-data-btn');
    if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
    try {
        // 1. The offline IndexedDB store (cached collections + mutation queue).
        if (typeof indexedDB !== 'undefined' && indexedDB.deleteDatabase) {
            await new Promise((resolve) => {
                let settled = false;
                const done = () => { if (!settled) { settled = true; resolve(); } };
                try {
                    const req = indexedDB.deleteDatabase('pseudopy-offline');
                    req.onsuccess = req.onerror = req.onblocked = done;
                } catch (e) { done(); }
                setTimeout(done, 3000); // never hang the settings page
            });
        }
        // 2. Device-local keys: draft, active exercise, route. Theme and the
        //    device identifier stay (a preference is not data loss).
        try {
            localStorage.removeItem(STORAGE_KEYS.EDITOR_DRAFT);
            localStorage.removeItem(STORAGE_KEYS.ACTIVE_EXERCISE);
        } catch (e) { /* private browsing */ }
        showToast('Offline data cleared. Reloading…', 'success');
        setTimeout(() => window.location.reload(), 600);
    } catch (e) {
        console.warn('[Settings] Clear offline data failed:', e);
        if (btn) { btn.disabled = false; btn.setAttribute('aria-busy', 'false'); }
        showToast('Could not clear offline data. Try again.', 'error');
    }
}

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
    if (typeof renderSystemInfo === 'function') renderSystemInfo();
    if (!currentUser) return;

    // Populate profile info
    setHtml('settings-avatar', '{{ui:UserRound}}');
    setText('settings-fullname', currentUser.fullName);
    setText('settings-username', '@' + currentUser.username);
    setText('settings-email', currentUser.email);
    const studentNumberEl = $id('settings-student-number');
    if (studentNumberEl) {
        const sn = readStudentNumber(currentUser);
        studentNumberEl.textContent = sn === '\u2014' ? 'Not yet assigned' : sn;
    }
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

    if (typeof requireOnline === 'function') {
        const gate = requireOnline();
        if (!gate.ok) { showToast(gate.message, 'error'); return; }
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


