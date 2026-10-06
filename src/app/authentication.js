/* ============================================================
   AUTHENTICATION
   ============================================================ */

var loginInProgress = false;

function getLoginSubmitButton() {
    return typeof $id === 'function' ? $id('login-submit') : null;
}

function resetLoginBusy(submitBtn) {
    loginInProgress = false;
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('is-loading');
    }
}

/**
 * Real `<form id="login-form">` submission: the single Enter/GO/RETURN path.
 * Native submission (no synthetic keydown) is IME-safe, and the bound-once
 * guard keeps rapid DOM re-inits from stacking listeners.
 */
function setupLoginForm() {
    if (typeof $id !== 'function') return;
    const form = $id('login-form');
    if (!form || form.dataset.bound === 'true') return;
    form.dataset.bound = 'true';
    form.addEventListener('submit', function (event) {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        if (loginInProgress) return;
        handleLogin();
    });
}

async function handleLogin() {
    if (loginInProgress) return;
    loginInProgress = true;
    const submitBtn = getLoginSubmitButton();
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('is-loading');
    }

    const rawUsername = getValue('login-username').trim();
    const username = typeof normalizeUsername === 'function' ? normalizeUsername(rawUsername) : rawUsername;
    const password = getValue('login-password').trim();

    if (!username || !password) {
        showToast('Please enter your username and password.', 'error');
        if (typeof $id === 'function') {
            if (!username) {
                const userField = $id('login-username');
                if (userField) userField.focus();
            } else {
                const passField = $id('login-password');
                if (passField) passField.focus();
            }
        }
        resetLoginBusy(submitBtn);
        return;
    }

    try {
        // Refresh users from Offline Database
        await refreshUsers();

        // Step 1: Find user by username or alias
        const userByUsername = cachedUsers.find(u => u.username === username || u.username === rawUsername);

        if (!userByUsername) {
            showToast('User not found.', 'error');
            return;
        }

        // Step 2: Verify password — support both plaintext and hashed auth
        let passwordValid = false;

        if (userByUsername.password && userByUsername.password === password) {
            passwordValid = true;
        } else if (userByUsername.passwordHash && userByUsername.passwordSalt) {
            passwordValid = await verifyPassword(password, userByUsername.passwordHash, userByUsername.passwordSalt);
        } else {
            showToast('Account configuration error. Please contact your administrator.', 'error');
            return;
        }

        if (!passwordValid) {
            showToast('Incorrect password.', 'error');
            return;
        }

        // Step 3: Check account status
        if (typeof isDeletedProfile === 'function' && isDeletedProfile(userByUsername)) {
            showToast('This account has been deleted. Please contact your administrator.', 'error');
            return;
        }

        if (userByUsername.status === 'archived') {
            showToast('This account has been archived. Please contact your administrator.', 'error');
            return;
        }

        if (userByUsername.status === 'inactive') {
            showToast('Your account is inactive. Please contact your instructor.', 'error');
            return;
        }

        // Step 3.4: Establish the Firebase Auth session BEFORE any access is
        // granted. Firestore rules see `request.auth`, so without this every
        // write is anonymous and is refused.
        //
        // The outcome is acted on explicitly rather than ignored:
        //   - the server REJECTED the credentials -> no session, no access.
        //     This is a final answer, never a connectivity problem, so it must
        //     not start a reconnect loop or be reported as "check your
        //     connection".
        //   - no cloud account exists yet      -> the expected migration state.
        //   - provider not enabled / no network -> the pre-existing offline-first
        //     policy, surfaced honestly instead of silently.
        if (typeof signInToCloud === 'function') {
            let cloud = { ok: false, kind: 'unavailable' };
            try {
                cloud = await signInToCloud(userByUsername.email, password);
            } catch (e) {
                cloud = { ok: false, kind: 'unknown', code: 'auth/unknown' };
            }

            if (cloud && cloud.ok) {
                console.info(`[Login] Cloud session established for ${userByUsername.username}.`);
            } else if (cloud && cloud.kind === 'invalid') {
                // Rejected by the server. Granting access here would bypass
                // authentication, so the attempt ends here with no session.
                showToast(cloud.code === 'auth/user-disabled'
                    ? 'This account has been disabled. Please contact your administrator.'
                    : 'Incorrect password.', 'error');
                return;
            } else if (cloud && cloud.kind === 'transient' && !isPlatformOffline()) {
                // Online, but the server could not be reached. Reported as a
                // connection problem, distinct from rejected credentials.
                showToast('Could not reach the server. Check your connection and try again.', 'error');
                return;
            } else if (cloud && cloud.kind === 'config') {
                // Requires a Firebase project-owner change; see
                // docs/OWNER-ACTIONS.md. Sign-in continues locally so nobody is
                // locked out by a provider setting.
                console.warn(`[Login] Firebase sign-in unavailable for this project (${cloud.code}); continuing with the in-app account.`);
            } else if (cloud && cloud.kind === 'transient') {
                console.info('[Login] Offline: continuing with the in-app account.');
            }
        }

        // Step 3.5: Instructor Device Change Detection & Admin Approval
        if (userByUsername.role === 'instructor') {
            const currentDevice = getDeviceFingerprint();
            const allDevices = await dbGetAll(devicesRef);
            const instructorDevices = allDevices.filter(d =>
                d.userId === (userByUsername._docId || userByUsername.id) ||
                d.username === userByUsername.username
            );

            let matchedDevice = instructorDevices.find(d => d.deviceId === currentDevice.deviceId);

            // If instructor has no registered devices yet, enroll this initial device as Primary Approved
            if (instructorDevices.length === 0) {
                const firstDev = {
                    _docId: `dev_${Date.now()}_${userByUsername.username}`,
                    userId: userByUsername._docId || userByUsername.id,
                    username: userByUsername.username,
                    instructorName: userByUsername.fullName,
                    deviceId: currentDevice.deviceId,
                    deviceName: currentDevice.deviceName + ' (Primary)',
                    os: currentDevice.os,
                    browser: currentDevice.browser,
                    deviceType: currentDevice.deviceType,
                    screen: currentDevice.screen,
                    status: 'approved',
                    requestedAt: new Date().toISOString(),
                    approvedAt: new Date().toISOString(),
                    lastSeenAt: new Date().toISOString(),
                    approvedBy: 'System Auto-Enroll'
                };
                await dbSet(devicesRef, firstDev._docId, firstDev);
                matchedDevice = firstDev;
            }

            if (!matchedDevice) {
                // New / Changed device detected! Create pending authorization record
                const newDevDocId = `dev_${Date.now()}_${userByUsername.username}`;
                const newDev = {
                    _docId: newDevDocId,
                    userId: userByUsername._docId || userByUsername.id,
                    username: userByUsername.username,
                    instructorName: userByUsername.fullName,
                    deviceId: currentDevice.deviceId,
                    deviceName: currentDevice.deviceName,
                    os: currentDevice.os,
                    browser: currentDevice.browser,
                    deviceType: currentDevice.deviceType,
                    screen: currentDevice.screen,
                    status: 'pending',
                    requestedAt: new Date().toISOString(),
                    lastSeenAt: new Date().toISOString()
                };
                await dbSet(devicesRef, newDevDocId, newDev);

                try {
                    await dbAdd(auditLogRef, {
                        eventType: 'INSTRUCTOR_NEW_DEVICE_ATTEMPT',
                        actor: userByUsername.username,
                        target: currentDevice.deviceName,
                        details: `Instructor attempted sign-in from unapproved device (${currentDevice.os} - ${currentDevice.browser})`,
                        timestamp: new Date().toISOString()
                    });
                } catch (e) { }

                showPendingDeviceModal(newDev, userByUsername);
                return;
            } else if (matchedDevice.status === 'pending') {
                showPendingDeviceModal(matchedDevice, userByUsername);
                return;
            } else if (matchedDevice.status === 'revoked') {
                showToast('This device was revoked by Administrator. Access denied.', 'error');
                return;
            } else {
                // Device is approved — update activity timestamp
                try {
                    await dbUpdate(devicesRef, matchedDevice._docId, { lastSeenAt: new Date().toISOString() });
                } catch (e) { }
            }
        }

        // Step 4: Role is auto-detected from the database record
        currentUser = userByUsername;

        // Persist the session (browser-local) so refreshes never log the user
        // out. This happens only after the cloud gate above has allowed the
        // attempt through, so a rejected sign-in leaves no stored session.
        saveSession(currentUser);

        // Record last login timestamp
        try {
            await dbUpdate(usersRef, currentUser._docId || currentUser.id, { lastLogin: new Date().toISOString() });
            currentUser.lastLogin = new Date().toISOString();
        } catch (e) { /* non-critical */ }

        // Seed learning evidence once the collections are empty (non-blocking).
        try {
            if (PseudoPyLearning && PseudoPyLearning.register && PseudoPyLearning.register.evidenceStore) {
                PseudoPyLearning.register.evidenceStore.seedEvidenceIfEmpty();
            }
        } catch (e) { /* non-critical */ }

        showToast(`Welcome back, ${currentUser.fullName}!`, 'success');
        if (typeof syncNow === 'function') syncNow('sign-in');
        showApp();
    } catch (err) {
        console.error('[Login] Error:', err);
        showToast('Login failed. Check your connection.', 'error');
    } finally {
        resetLoginBusy(submitBtn);
    }
}

function handleLogout() {
    // UX Rule 2: sign-out must not destroy unsaved work. The draft is saved
    // first and stays on this device, tagged with this account, so the same
    // student finds it again after signing back in — and nobody else does.
    try { if (typeof maybeSaveEditorDraft === 'function') maybeSaveEditorDraft(); } catch (e) { }
    if (typeof StudentWorkspace !== 'undefined') StudentWorkspace.reset();
    if (typeof stopAnalyticsRealtime === 'function') stopAnalyticsRealtime();
    if (typeof hideConnectionBanner === 'function') hideConnectionBanner();
    if (typeof devToolsAbortRun === 'function') devToolsAbortRun();
    // Release the Firebase Auth session too, so the next account on this device
    // can never write under the previous user's uid.
    if (typeof signOutOfCloud === 'function') signOutOfCloud();
    // Invalidate session state
    currentUser = null;
    currentPage = '';
    editingExerciseId = null;
    editingUserId = null;

    // Explicit sign-out: clear the persisted session and last route so the
    // next account on this device starts fresh. The editor draft is kept
    // (account-tagged) rather than deleted: see the note above.
    clearSession();
    clearPersistedRoute();
    try { localStorage.removeItem(STORAGE_KEYS.ACTIVE_EXERCISE); } catch (e) { }
    bootState = BOOT_UNAUTHENTICATED;

    hide('app-layout');
    show('login-page');

    showToast('Signed out successfully.', 'info');
}

function checkAccess(role, pageId) {
    const allowed = PAGES_BY_ROLE[role] || [];
    return allowed.includes(pageId) || !PAGES.includes(pageId);
}

function showApp(restorePage) {
    if (showApp.noticeRole && showApp.noticeRole !== currentUser.role && typeof resolveSyncNotice === 'function') resolveSyncNotice();
    showApp.noticeRole = currentUser.role;
    hide('login-page');
    show('app-layout');

    // Update sidebar user info
    setText('sidebar-username', currentUser.fullName);
    setText('sidebar-role', ROLE_LABELS[currentUser.role]);

    // Update topbar welcome and role display
    setText('topbar-welcome', 'Welcome, ' + currentUser.fullName);
    setText('topbar-role', 'Role: ' + ROLE_LABELS[currentUser.role]);

    // Show correct nav
    $qsa('.sidebar-nav > div').forEach(el => el.classList.add('hidden'));
    const roleNav = $id('nav-' + currentUser.role);
    if (roleNav) roleNav.classList.remove('hidden');

    // Show/hide student progress pill based on role
    const progressPillWrap = $id('student-progress-pill-wrap');
    if (progressPillWrap) {
        progressPillWrap.style.display = currentUser.role === 'student' ? 'flex' : 'none';
    }

    // Handle student notifications display
    const notifWrap = $id('topbar-notifications');
    if (notifWrap) {
        if (currentUser.role === 'student') {
            notifWrap.style.display = 'inline-block';
            loadStudentNotifications();
        } else {
            notifWrap.style.display = 'none';
        }
    }

    // Navigate to the restored page (if valid for this role) or the role default
    const targetPage = (restorePage && checkAccess(currentUser.role, restorePage)) ? restorePage : DEFAULT_PAGE_BY_ROLE[currentUser.role];
    navigateTo(targetPage);

    renderAppVersion();

    if (currentUser.role === 'admin') {
        updateAdminPendingRequestsBadge();
    } else if (currentUser.role === 'instructor') {
        updatePendingRequestsBadge();
    }
}


