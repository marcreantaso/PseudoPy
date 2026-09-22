/* ============================================================
   AUTHENTICATION
   ============================================================ */

function toggleLoginHint(header) {
    const box = header.closest('.login-hint-box');
    box.classList.toggle('open');
}

function fillLoginUser(username) {
    setValue('login-username', username);
    setValue('login-password', '');
    const box = $qs('.login-hint-box');
    if (box) box.classList.remove('open');
    const passwordField = $id('login-password');
    if (passwordField) passwordField.focus();
}

async function handleLogin() {
    const rawUsername = getValue('login-username').trim();
    const username = typeof normalizeUsername === 'function' ? normalizeUsername(rawUsername) : rawUsername;
    const password = getValue('login-password').trim();

    if (!username || !password) {
        showToast('Please enter your username and password.', 'error');
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
        if (userByUsername.status === 'archived') {
            showToast('This account has been archived. Please contact your administrator.', 'error');
            return;
        }

        if (userByUsername.status === 'inactive') {
            showToast('Your account is inactive. Please contact your instructor.', 'error');
            return;
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

        // Persist the session (browser-local) so refreshes never log the user out.
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
        showApp();
    } catch (err) {
        console.error('[Login] Error:', err);
        showToast('Login failed. Check your connection.', 'error');
    }
}

function handleLogout() {
    if (typeof stopAnalyticsRealtime === 'function') stopAnalyticsRealtime();
    // Invalidate session state
    currentUser = null;
    currentPage = '';
    editingExerciseId = null;
    editingUserId = null;

    // Explicit sign-out: clear the persisted session, last route and any
    // per-user editor state so the next account on this device starts fresh.
    clearSession();
    clearPersistedRoute();
    if (typeof clearEditorDraft === 'function') clearEditorDraft();
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


