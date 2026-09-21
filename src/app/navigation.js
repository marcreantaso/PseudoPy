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
        const defaults = {
            student: 'write-pseudocode',
            instructor: 'analytics',
            admin: 'manage-users'
        };
        const defaultPage = defaults[currentUser.role];
        if (pageId !== defaultPage) {
            navigateTo(defaultPage);
        }
        return;
    }

    currentPage = pageId;

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
    const titles = {
        'write-pseudocode': 'Write Pseudocode',
        'translate': 'Translate Pseudocode',
        'execute': 'Execute Code',
        'feedback': 'Feedback & Suggestions',
        'exercises-student': 'Exercises & Tasks',
        'analytics': 'Learning Analytics',
        'manage-students': 'Manage Students',
        'manage-exercises': 'Manage Exercises',
        'generate-code': 'Generate Python Code',
        'manage-users': 'Manage Instructors',
        'admin-execute': 'Execute Code',
        'change-password': 'Change Password',
        'student-settings': 'Settings',
        'password-requests': 'Security Audit Log',
        'password-recovery': 'Password Recovery',
        'compiler-metrics': 'Compiler Metrics & Evaluation',
        'developer-options': 'Developer Options'
    };
    setText('topbar-title', titles[pageId] || 'Dashboard');

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
    if (pageId === 'developer-options' && typeof initDevTools === 'function') initDevTools();
    // Refresh student progress pill whenever the Write Pseudocode page is shown
    if (pageId === 'write-pseudocode' && currentUser && currentUser.role === 'student') {
        loadStudentProgress();
        if (typeof maybeAutoStartTutorial === 'function') {
            try { maybeAutoStartTutorial(); } catch (e) { /* tour must never block navigation */ }
        }
    }
}

