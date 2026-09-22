/* ============================================================
   NAVIGATION
   ============================================================ */

function navigateTo(pageId) {
    closeMobileSidebar();
    if (!currentUser) {
        hide('app-layout');
        show('login-page');
        return;
    }

    if (!checkAccess(currentUser.role, pageId)) {
        showToast('403 Unauthorized: Access Denied', 'error');
        const defaultPage = DEFAULT_PAGE_BY_ROLE[currentUser.role];
        if (pageId !== defaultPage) {
            navigateTo(defaultPage);
        }
        return;
    }

    currentPage = pageId;

    // Remember the route so a refresh/boot can restore the same page.
    if (currentUser) persistRoute(pageId);

    // Hide all pages
    $qsa('.page-view').forEach(el => el.classList.add('hidden'));

    const page = $id(`page-${pageId}`);
    if (page) page.classList.hidden = false;
    if (page) page.classList.remove('hidden');

    closeMobileSidebar();

    $qsa('.nav-item').forEach(el => el.classList.remove('active'));
    $qsa('.nav-item').forEach(item => {
        if (item.getAttribute('onclick')?.includes(pageId)) {
            item.classList.add('active');
        }
    });

    // Update topbar title
    setText('topbar-title', PAGE_TITLES[pageId] || 'Dashboard');

    // Load page-specific data (async)
    if (pageId === 'analytics') loadAnalytics();
    if (pageId === 'manage-exercises') loadExercises();
    if (pageId === 'manage-users') loadUsers();
    if (pageId === 'manage-students') loadStudents();
    if (pageId === 'exercises-student') loadStudentExercises();
    if (pageId === 'student-settings') loadStudentSettings();
    if (pageId === 'password-requests') {
        startAuditLogRealtime();
        loadPasswordRequests();
    } else if (auditLogUnsubscribe) {
        stopAuditLogRealtime();
    }
    if (pageId === 'password-recovery') loadPasswordRecovery();
    if (pageId === 'compiler-metrics') loadCompilerMetrics();
    if (pageId === 'developer-options') {
        // DevTools is a dev-only surface; its bundle (devtools.js) is fetched
        // lazily on first entry instead of paying for it on every page load.
        if (typeof initDevTools === 'function') {
            initDevTools();
        } else {
            loadScripts(['devtools.js'], function () { if (typeof initDevTools === 'function') initDevTools(); });
        }
    }
    // Refresh student progress pill whenever the Write Pseudocode page is shown
    if (pageId === 'write-pseudocode' && currentUser && currentUser.role === 'student') {
        loadStudentProgress();
        if (typeof maybeAutoStartTutorial === 'function') {
            try { maybeAutoStartTutorial(); } catch (e) { /* tour must never block navigation */ }
        }
        if (typeof maybeRestoreEditorDraft === 'function') {
            try { maybeRestoreEditorDraft(); } catch (e) { /* draft restore must never block navigation */ }
        }
    }
}

