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
    try { if (typeof StudentWorkspace !== 'undefined') StudentWorkspace.activate(pageId); }
    catch (err) { console.warn('[Nav] Student workspace render failed on', pageId, ':', err && err.message); }

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

// Load page-specific data (async). A renderer failure on one page must never
    // take the session or navigation down with it.
    const guarded = fn => { try { fn(); } catch (err) { console.warn('[Nav] Page loader failed on', pageId, ':', err && err.message); } };
    if (pageId === 'analytics') guarded(loadAnalytics);
    if (pageId === 'manage-exercises') guarded(loadExercises);
    if (pageId === 'manage-users') guarded(loadUsers);
    if (pageId === 'manage-students') guarded(loadStudents);
    if (pageId === 'exercises-student') guarded(loadStudentExercises);
    if (pageId === 'student-settings') guarded(loadStudentSettings);
    if (pageId === 'password-requests') {
        guarded(startAuditLogRealtime);
        guarded(loadPasswordRequests);
    } else if (typeof auditLogUnsubscribe !== 'undefined' && auditLogUnsubscribe) {
        stopAuditLogRealtime();
    }
    if (pageId !== 'analytics') {
        if (typeof stopAnalyticsRealtime === 'function') stopAnalyticsRealtime();
    }
    if (pageId === 'password-recovery') guarded(loadPasswordRecovery);
    if (pageId === 'compiler-metrics') guarded(loadCompilerMetrics);
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

