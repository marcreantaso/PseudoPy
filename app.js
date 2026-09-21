/* ============================================================
   PSEUDOPY — APP.JS
   Automated Code Generation System
   Powered by Offline LocalStorage Database
   ============================================================ */

console.log('[App] app.js script is parsing and executing top-level');

// ── State ──
let currentUser = null;
let currentPage = '';
let editingExerciseId = null;
let editingUserId = null;
let currentErrorLineNumbers = [];
let exerciseState = {
    isTranslated: false,
    isExecuted: false,
    outputMatched: false,
    expectedOutput: null,
    expectedOutputResolved: false,
    activeExercise: null,
    resubmissionOf: null
};

// ── Cached data (loaded from Offline Database) ──
let cachedUsers = [];
let cachedExercises = [];
let cachedActivity = [];
let cachedDevices = [];
let activeDeviceInstructorId = null;
let pendingDeviceAuthData = null;
let instructorExOffset = 0;
let studentExOffset = 0;
const EX_PAGE_LIMIT = 20;

// ── Instructor Management State ──
let allCachedInstructors = [];
let filteredInstructors = [];
let instructorPage = 1;
const INSTR_PAGE_SIZE = 10;
let pendingArchiveInstructorId = null;
let pendingRestoreInstructorId = null;
let editingInstructorId = null;


/* ============================================================
   PYTHON OUTPUT — LINE NUMBER RENDERER
   Renders Python code with a styled line-number gutter.
   Used by all translation output panels.
   ============================================================ */

/**
 * Sets the Python output panel code and triggers line number update.
 */
function setPythonOutput(elementId, code) {
    const el = $id(elementId);
    if (!el) return;

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        el.value = code;
        el.dispatchEvent(new Event('input'));
    } else {
        el.textContent = code;
    }
}

/**
 * Retrieves the Python code from a panel.
 */
function getPythonCode(elementId) {
    const el = $id(elementId);
    if (!el) return '';

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        return el.value;
    }
    return el.textContent || '';
}

function $id(id) {
    return document.getElementById(id);
}

function setText(id, value) {
    const el = $id(id);
    if (!el) return;
    el.textContent = value;
}

function setHtml(id, html) {
    const el = $id(id);
    if (!el) return;
    el.innerHTML = html;
}

function getValue(id) {
    const el = $id(id);
    if (!el || !('value' in el)) return '';
    return el.value;
}

function setValue(id, value) {
    const el = $id(id);
    if (!el || !('value' in el)) return;
    el.value = value;
}

function hide(id) {
    const el = $id(id);
    if (!el) return;
    el.classList.add('hidden');
}

function show(id) {
    const el = $id(id);
    if (!el) return;
    el.classList.remove('hidden');
}

function $qs(selector) {
    return document.querySelector(selector);
}

function $qsa(selector) {
    return Array.from(document.querySelectorAll(selector));
}

function toggleHidden(id, hidden) {
    const el = $id(id);
    if (!el) return;
    el.classList.toggle('hidden', hidden);
}

/* ============================================================
   ON-DEMAND THIRD-PARTY LIBRARY LOADING
   Heavy libraries (Skulpt, PDF.js, anime, lucide) are no longer
   loaded at page start. They download on first use so the app
   shell, login and navigation render without waiting on CDNs.
   ============================================================ */

const CDN_BASE_URLS = {
    lucide: 'https://cdn.jsdelivr.net/npm/lucide@0.468.0/dist/umd/lucide.js',
    skulpt: ['https://skulpt.org/js/skulpt.min.js', 'https://skulpt.org/js/skulpt-stdlib.js'],
    pdfjs: ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'],
    anime: ['https://cdn.jsdelivr.net/npm/animejs@4.5.0/dist/bundles/anime.umd.min.js']
};

function loadScripts(srcList, onSuccess, onError) {
    if (!srcList || !srcList.length) { if (onSuccess) onSuccess(); return; }
    let index = 0;
    function next() {
        if (index >= srcList.length) {
            if (onSuccess) onSuccess();
            return;
        }
        const s = document.createElement('script');
        s.src = srcList[index++] + '?v=on-demand';
        s.async = true;
        s.onload = next;
        s.onerror = function () {
            if (onError) onError(new Error('Failed to load script: ' + s.src));
        };
        document.head.appendChild(s);
    }
    next();
}/* ============================================================
   INITIALIZATION
   ============================================================ */

async function init() {
    console.log('[App] init() called');
    try {


        console.log('[App] Calling seedDatabase()...');
        // Seed the database if collections are empty
        await seedDatabase();
        console.log('[App] seedDatabase() finished.');

        // Pre-load data from Offline Database into cache
        cachedUsers = await dbGetAll(usersRef);
        cachedExercises = await dbGetAll(exercisesRef, EX_PAGE_LIMIT, 0);
        cachedActivity = await dbGetAll(activityRef);

        console.log(`[App] Loaded users, max ${EX_PAGE_LIMIT} exercises, and activity records from IndexedDB.`);

        // Initialize Theme from Storage
        const savedTheme = localStorage.getItem('pseudopy_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
    } catch (err) {
        console.error('[App] Init error:', err);
        showToast('Database initialization failed. Check local storage availability.', 'error');
    }

    updateClock();
    setInterval(updateClock, 60000);

    // Update line count on editor input and sync gutter
    const editor = $id('pseudocode-editor');
    if (editor) {
        const syncEditorState = () => {
            setText('line-count', editor.value.split('\n').length + ' lines');
            updateGutter();

            exerciseState.isTranslated = false;
            exerciseState.isExecuted = false;
            exerciseState.outputMatched = false;
            updateExerciseStatus();
        };

        editor.addEventListener('input', syncEditorState);
        editor.addEventListener('scroll', () => {
            const gutter = $id('editor-gutter');
            const highlights = $id('editor-highlights');
            if (gutter) gutter.scrollTop = editor.scrollTop;
            if (highlights) {
                highlights.scrollTop = editor.scrollTop;
                highlights.scrollLeft = editor.scrollLeft;
            }
        });
    }

    // Sync scrolling and update gutter for Python Editor
    const pyEditor = $id('python-output');
    if (pyEditor) {
        const syncPythonState = () => {
            updatePythonGutter();

            exerciseState.isExecuted = false;
            exerciseState.outputMatched = false;
            updateExerciseStatus();
        };

        pyEditor.addEventListener('input', syncPythonState);
        pyEditor.addEventListener('scroll', () => {
            const gutter = $id('python-gutter');
            const highlights = $id('python-highlights');
            if (gutter) gutter.scrollTop = pyEditor.scrollTop;
            if (highlights) {
                highlights.scrollTop = pyEditor.scrollTop;
                highlights.scrollLeft = pyEditor.scrollLeft;
            }
        });

        updatePythonGutter();
    }

    // Setup real-time validation
    setupRealtimeValidation();

    // Close notification dropdown on outside click
    document.addEventListener('click', (e) => {
        const notifWrap = $id('topbar-notifications');
        const notifDropdown = $id('notif-dropdown');
        if (notifWrap && notifDropdown && !notifWrap.contains(e.target)) {
            notifDropdown.classList.add('hidden');
        }
    });

    // Restore active exercise if any
    const activeExId = localStorage.getItem('pseudopy_active_exercise');
    if (activeExId) {
        if (typeof dbGet === 'function' && typeof exercisesRef !== 'undefined') {
            dbGet(exercisesRef, activeExId).then(ex => {
                if (ex) renderActiveExercise(ex);
            }).catch(err => console.error('Failed to restore active exercise', err));
        }
    }
}

function updateClock() {
    const el = $id('topbar-time');
    if (el) {
        const now = new Date();
        el.textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' +
            now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
}


/* ============================================================
   FIRESTORE DATA REFRESH HELPERS
   ============================================================ */

async function refreshUsers() {
    cachedUsers = await dbGetAll(usersRef);
    return cachedUsers;
}

async function refreshExercises() {
    cachedExercises = await dbGetAll(exercisesRef);
    return cachedExercises;
}

async function refreshActivity() {
    cachedActivity = await dbGetAll(activityRef);
    return cachedActivity;
}


/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */

function showToast(message, type = 'info') {
    const container = $id('toast-container');
    const icons = { success: 'circle-check', error: 'circle-x', info: 'info' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icon(icons[type] || 'info')}</span><span>${message}</span>`;
    container.appendChild(toast);
    refreshIcons(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(30px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}


/* ============================================================
   DEVICE FINGERPRINTING & AUTHORIZATION
   ============================================================ */

/**
 * Generates and retrieves device details for the current client.
 */
function getDeviceFingerprint() {
    let devId = localStorage.getItem('pseudopy_device_id');
    if (!devId) {
        devId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
        localStorage.setItem('pseudopy_device_id', devId);
    }

    const ua = navigator.userAgent || '';
    let os = 'Unknown OS';
    if (ua.includes('Win')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    let browser = 'Unknown Browser';
    if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Edg')) browser = 'Microsoft Edge';
    else if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Safari')) browser = 'Safari';

    const deviceType = (/Mobi|Android|iPhone|iPad/i.test(ua)) ? 'Mobile' : 'Desktop';
    const deviceName = `${os} ${deviceType} (${browser})`;

    return {
        deviceId: devId,
        deviceName,
        os,
        browser,
        deviceType,
        screen: `${window.screen.width}x${window.screen.height}`,
        userAgent: ua
    };
}

function showPendingDeviceModal(deviceInfo, user) {
    pendingDeviceAuthData = { deviceInfo, user };
    setText('pending-device-info-name', deviceInfo.deviceName || 'Desktop/Browser');
    setText('pending-device-info-os', `${deviceInfo.os} — ${deviceInfo.browser}`);
    setText('pending-device-info-id', deviceInfo.deviceId || '-');
    show('new-device-pending-modal');
}

function closePendingDeviceModal() {
    hide('new-device-pending-modal');
    pendingDeviceAuthData = null;
}

async function checkCurrentDeviceApprovalStatus() {
    if (!pendingDeviceAuthData) {
        closePendingDeviceModal();
        return;
    }
    const { deviceInfo, user } = pendingDeviceAuthData;
    showToast('Checking device approval status with admin...', 'info');

    const devices = await dbGetAll(devicesRef);
    const matched = devices.find(d => d.deviceId === deviceInfo.deviceId && (d.userId === (user._docId || user.id) || d.username === user.username));

    if (matched && matched.status === 'approved') {
        closePendingDeviceModal();
        showToast('Device authorized by Administrator! Signing in...', 'success');
        currentUser = user;
        try {
            await dbUpdate(usersRef, currentUser._docId || currentUser.id, { lastLogin: new Date().toISOString() });
            currentUser.lastLogin = new Date().toISOString();
        } catch (e) { }
        showApp();
    } else if (matched && matched.status === 'revoked') {
        closePendingDeviceModal();
        showToast('This device was revoked by Administrator. Access denied.', 'error');
    } else {
        showToast('Device is still awaiting Administrator approval.', 'warning');
    }
}

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
                    userAgent: currentDevice.userAgent,
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
                    userAgent: currentDevice.userAgent,
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
    // Invalidate session state
    currentUser = null;
    currentPage = '';
    editingExerciseId = null;
    editingUserId = null;

    // Clear session token from storage (security: prevent stale session reuse)
    localStorage.removeItem('pseudopy_session_user');
    sessionStorage.removeItem('pseudopy_session_user');

    hide('app-layout');
    show('login-page');

    showToast('Signed out successfully.', 'info');
}

const ROLE_LABELS = { student: 'Student', instructor: 'Instructor', admin: 'Administrator' };
const ROLE_BADGES = { student: 'badge-student', instructor: 'badge-instructor', admin: 'badge-admin' };

function checkAccess(role, pageId) {
    const adminPages = ['manage-users', 'password-requests', 'admin-execute', 'developer-options'];
    const instructorPages = ['analytics', 'manage-exercises', 'generate-code', 'compiler-metrics', 'manage-students', 'password-recovery'];
    const studentPages = ['write-pseudocode', 'translate', 'execute', 'feedback', 'exercises-student', 'student-settings', 'change-password'];

    if (adminPages.includes(pageId)) return role === 'admin';
    if (instructorPages.includes(pageId)) return role === 'instructor';
    if (studentPages.includes(pageId)) return role === 'student';
    return true; // fallback for unclassified pages
}

function showApp() {
    hide('login-page');
    show('app-layout');

    // Update sidebar user info
    setText('sidebar-avatar', currentUser.fullName.charAt(0).toUpperCase());
    setText('sidebar-username', currentUser.fullName);
    setText('sidebar-role', ROLE_LABELS[currentUser.role]);

    // Update topbar welcome and role display
    setText('topbar-welcome', 'Welcome, ' + currentUser.fullName);
    const roleLabelsForDisplay = { student: 'Student', instructor: 'Instructor', admin: 'Administrator' };
    setText('topbar-role', 'Role: ' + roleLabelsForDisplay[currentUser.role]);

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

    // Navigate to default page
    const defaults = {
        student: 'write-pseudocode',
        instructor: 'analytics',
        admin: 'manage-users'
    };
    navigateTo(defaults[currentUser.role]);

    if (currentUser.role === 'admin') {
        updateAdminPendingRequestsBadge();
    } else if (currentUser.role === 'instructor') {
        updatePendingRequestsBadge();
    }
}


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

/* ============================================================
   MOBILE NAVIGATION HANDLERS
   ============================================================ */

let sidebarPreviousFocus = null;
function setMobileSidebar(open) {
    const sidebar = $qs('.sidebar');
    const overlay = $id('sidebar-overlay');
    const button = $id('hamburger-btn');
    if (!sidebar) return;
    open = !!open && window.innerWidth < 1024;
    if (open) sidebarPreviousFocus = document.activeElement;
    sidebar.classList.toggle('open', open);
    if (overlay) overlay.classList.toggle('hidden', !open);
    if (button) button.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('navigation-open', open);
    sidebar.inert = window.innerWidth < 1024 && !open;
    if (window.innerWidth < 1024) sidebar.setAttribute('aria-hidden', String(!open));
    else sidebar.removeAttribute('aria-hidden');
    // Keep keyboard navigation within the drawer while it is open.
    for (const el of [$qs('.main-content'), $qs('.topbar')]) if (el) el.inert = open;
    if (open) sidebar.querySelector('.sidebar-close')?.focus();
    else if (sidebarPreviousFocus && sidebar.contains(document.activeElement)) sidebarPreviousFocus.focus();
    if (!open) sidebarPreviousFocus = null;
}
function toggleMobileSidebar() { setMobileSidebar(!$qs('.sidebar')?.classList.contains('open')); }
function closeMobileSidebar() { setMobileSidebar(false); }

document.addEventListener('keydown', event => {
    const sidebar = $qs('.sidebar.open');
    if (!sidebar) return;
    if (event.key === 'Escape') { event.preventDefault(); closeMobileSidebar(); }
    if (event.key === 'Tab') {
        const items = Array.from(sidebar.querySelectorAll('button, a[href], [tabindex="0"]')).filter(el => !el.disabled && el.getClientRects().length);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', closeMobileSidebar);
else closeMobileSidebar();

window.addEventListener('resize', () => {
    closeMobileSidebar();
});


/* ============================================================
   PSEUDOCODE → PYTHON TRANSLATION ENGINE
   ============================================================ */

function icon(name, label) {
    const aria = label ? ` aria-label="${label}"` : ' aria-hidden="true"';
    return `<i data-lucide="${name}"${aria}></i>`;
}

function maybeRenderLearningPanel(outputId) {
    if (outputId !== 'python-output') return;
    if (!PseudoPyLearning || !PseudoPyLearning.register || !PseudoPyLearning.register.learningUi) return;
    try {
        PseudoPyLearning.register.learningUi.renderLearningPanel(PseudoPyLearning.lastTranslation);
    } catch (e) {
        /* UI must never break translation */
    }
}

function refreshIcons(root) {
    if (typeof lucide === 'undefined') return;
    lucide.createIcons({ root: root || document, icons: lucide.icons });
}

function runWithAnime(cb) {
    if (typeof anime !== 'undefined' && typeof anime.animate === 'function') { cb(); return; }
    loadScripts(CDN_BASE_URLS.anime, function () {
        if (typeof anime !== 'undefined' && typeof anime.animate === 'function') cb();
    }, function () {});
}

function animateAnalyticsCards() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const analyticsPage = $id('page-analytics');
    if (!analyticsPage || analyticsPage.classList.contains('hidden')) return;
    runWithAnime(function () {
        anime.animate('.an-kpi-card', {
            opacity: [0, 1],
            translateY: [14, 0],
            delay: anime.stagger(70),
            duration: 500,
            ease: 'outCubic'
        });
    });
}

function animateAnalyticsCharts() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const analyticsPage = $id('page-analytics');
    if (!analyticsPage || analyticsPage.classList.contains('hidden')) return;
    runWithAnime(function () {
        const bars = document.querySelectorAll('#chart-submissions .an-bar-inner');
        if (bars.length) {
            anime.animate(bars, {
                scaleY: [0, 1],
                opacity: [0, 1],
                delay: anime.stagger(55),
                duration: 550,
                ease: 'outCubic'
            });
        }
        const donut = $id('an-donut-chart');
        const legend = $id('an-donut-legend');
        if (donut) anime.animate(donut, { scale: [0.8, 1], opacity: [0, 1], duration: 600, ease: 'outBack' });
        if (legend) anime.animate(legend, { opacity: [0, 1], translateX: [12, 0], duration: 450, delay: 180, ease: 'outCubic' });
    });
}

function initializeLucideIcons() {
    refreshIcons();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeLucideIcons);
} else {
    initializeLucideIcons();
}

function translatePseudocodeGeneric(inputId, outputId, consoleId, runBtnSelector, successToast, updateState) {
    try {
        const inputEl = $id(inputId);
        if (!inputEl) return;

        let input = inputEl.value;
        if (!input.trim()) {
            showToast('Please write some pseudocode first.', 'error');
            return;
        }

        const cleanedInput = preprocessPseudocode(input);
        if (cleanedInput !== input) {
            inputEl.value = cleanedInput;
            input = cleanedInput;
        }

        const result = pseudocodeToPython(input);
        const validation = result;

        // Learning layer hook (non-destructive): run the feedback pipeline so
        // the post-translation Learning Panel and evidence store have data.
        // The learning layer must never break translation.
        if (PseudoPyLearning && PseudoPyLearning.register && PseudoPyLearning.register.pipeline) {
            try {
                PseudoPyLearning.lastTranslation = PseudoPyLearning.register.pipeline.run(input, result);
                if (PseudoPyLearning.register.evidenceStore && PseudoPyLearning.register.evidenceStore.capture) {
                    PseudoPyLearning.register.evidenceStore.capture(PseudoPyLearning.lastTranslation);
                }
            } catch (e) {
                console.error('Learning pipeline error:', e);
            }
        } else if (typeof runValidation === 'function' && PseudoPyLearning) {
            try {
                PseudoPyLearning.lastTranslation = {
                    source: input,
                    compile: result,
                    validation: runValidation(result, input)
                };
            } catch (e) {
                /* learning layer must never break translation */
            }
        }
        const consoleEl = consoleId ? $id(consoleId) : null;
        const runBtn = runBtnSelector ? $qs(runBtnSelector) : null;

        if (!validation.valid) {
            setPythonOutput(outputId, '# Translation failed due to syntax error(s).\n# Please check the console below for details.');
            if (consoleEl) {
                consoleEl.innerHTML = renderHtmlErrors(validation.errors);
                consoleEl.className = 'output-content error';
            }
            if (runBtn) runBtn.disabled = true;
            showToast(`${validation.errors.length} syntax error(s) found. Check the console output.`, 'error');
            if (outputId === 'python-output') {
                currentErrorLineNumbers = validation.errors.map(err => err.line);
                updateGutter();
            }
            maybeRenderLearningPanel(outputId);
            return;
        }

        if (outputId === 'python-output') {
            currentErrorLineNumbers = [];
            updateGutter();
        }

        setPythonOutput(outputId, result.python);
        if (consoleEl) {
            consoleEl.textContent = successToast + (result.warnings.length ? '\n' + result.warnings.map(w => 'Line ' + w.line + ': ' + w.message).join('\n') : '');
            consoleEl.className = 'output-content';
        }
        if (runBtn) runBtn.disabled = false;
        showToast(successToast, 'success');
        maybeRenderLearningPanel(outputId);
        if (typeof updateState === 'function') updateState();
    } catch (e) {
        console.error('Translation Engine Crash:', e);
        const consoleEl = consoleId ? $id(consoleId) : null;
        if (consoleEl) {
            consoleEl.className = 'output-content error';
            consoleEl.textContent = 'System Error during translation: ' + e.message;
        }
        const outputEl = $id(outputId);
        if (outputEl) {
            if (outputEl.tagName === 'TEXTAREA' || outputEl.tagName === 'INPUT') {
                outputEl.value = `# System Error\n# ${e.message}`;
            } else {
                outputEl.textContent = `# System Error\n# ${e.message}`;
            }
        }
        showToast('System Error. Check the output area.', 'error');
    }
}

function translatePseudocode() {
    translatePseudocodeGeneric(
        'pseudocode-editor',
        'python-output',
        'console-output',
        '#page-write-pseudocode .btn-success',
        'Pseudocode translated to Python successfully!',
        () => {
            exerciseState.isTranslated = true;
            updateExerciseStatus();
        }
    );
}

function translateFromPage() {
    translatePseudocodeGeneric(
        'translate-input',
        'translate-output',
        'translate-console',
        null,
        'Translation complete!'
    );
}

function instructorTranslate() {
    translatePseudocodeGeneric(
        'instructor-pseudo-input',
        'instructor-python-output',
        'instructor-console',
        null,
        'Python code generated!'
    );
}

const compilerEngine = new PseudocodeCompiler();


/* ============================================================
   FILE UPLOAD (TEXT AND PDF)
   ============================================================ */

async function handleFileUpload(event, targetEditorId) {
    const file = event.target.files[0];
    if (!file) return;

    const editor = $id(targetEditorId);

    try {
        if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.pseudo')) {
            const text = await file.text();
            if (editor) editor.value = text;
            showToast('Text file loaded successfully!', 'success');
        } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
            showToast('Extracting PDF text...', 'info');

            if (typeof pdfjsLib === 'undefined') {
                await new Promise(function (resolve, reject) {
                    loadScripts(CDN_BASE_URLS.pdfjs, function () {
                        if (typeof pdfjsLib !== 'undefined') {
                            try {
                                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                            } catch (e) { /* non-critical */ }
                            resolve();
                        } else {
                            reject(new Error('PDF library could not be loaded.'));
                        }
                    }, reject);
                });
            }

            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();

                // Keep some pseudo-formatting by roughly preserving Y-coordinates
                let lastY = -1;
                let pageText = '';
                textContent.items.forEach(item => {
                    if (lastY !== item.transform[5] && lastY !== -1) {
                        pageText += '\n'; // new line
                    }
                    pageText += item.str;
                    lastY = item.transform[5];
                });

                fullText += pageText + '\n';
            }

            editor.value = fullText.trim();
            showToast('PDF loaded successfully!', 'success');
        } else {
            showToast('Unsupported file type. Please upload .txt or .pdf files.', 'error');
        }
    } catch (err) {
        console.error('[FileUpload]', err);
        showToast('Failed to read file.', 'error');
    }

    // Reset file input so same file can be uploaded again
    event.target.value = '';
}


/**
 * Compiler Facade: Translation Engine
 * Converts structured pseudocode into valid Python via AST code generation.
 * Instrumented with MetricsEngine for Panel 1 evaluation metrics.
 */
function pseudocodeToPython(pseudocode) {
    const result = compilerEngine.compile(pseudocode);

    // ── Panel 1: Record translation metrics ──
    if (typeof metricsEngine !== 'undefined') {
        metricsEngine.recordTranslation(result, pseudocode);
    }

    return result;
}


/* ============================================================
   CODE EXECUTION (via Skulpt)
   ============================================================ */

function executePython() {
    executeCode('python-output', 'console-output', 'No Python code to execute. Translate first!');
}

function executeFromTranslate() {
    executeCode('translate-output', 'translate-console', 'No Python code to execute.');
}

function executeFromExecPage() {
    executeCode('execute-editor', 'execute-console', 'Please enter some Python code.');
}

function instructorExecute() {
    executeCode('instructor-python-output', 'instructor-console', 'No code to execute. Generate first!');
}

function adminExecute() {
    executeCode('admin-execute-editor', 'admin-console', 'Please enter Python code to execute.');
}

function executeCode(sourceId, outputId, emptyMessage) {
    const sourceEl = $id(sourceId);
    const code = sourceEl ? (sourceEl.tagName === 'TEXTAREA' || sourceEl.tagName === 'INPUT' ? sourceEl.value : sourceEl.textContent || '') : '';
    if (!code.trim()) { showToast(emptyMessage, 'error'); return; }
    runPythonCode(code, outputId);
}

function runPythonCode(code, outputElementId) {
    const outputEl = $id(outputElementId);
    if (!outputEl) return;
    outputEl.innerHTML = '';
    outputEl.className = 'output-content';

    if (typeof Sk === 'undefined') {
        outputEl.textContent = 'Loading Python runtime...';
        const fallback = function () {
            outputEl.textContent = 'Skulpt library not loaded. Please check your internet connection.\n\nFalling back to static analysis...\n\n';
            outputEl.textContent += simulateExecution(code);
        };
        loadScripts(CDN_BASE_URLS.skulpt, function () {
            if (typeof Sk !== 'undefined') {
                runPythonCode(code, outputElementId);
            } else {
                fallback();
            }
        }, fallback);
        return;
    }

    // The compiler now handles str() wrapping correctly in smartPrintExpr(),
    // so no runtime code fixup is needed. Use code as-is.
    const cleanCode = code;

    // Helper: append text to the console output (HTML-safe)
    function appendOutput(text) {
        const span = document.createElement('span');
        span.textContent = text;
        outputEl.appendChild(span);
    }

    Sk.configure({
        output: function (text) { appendOutput(text); },
        read: function (x) {
            if (Sk.builtinFiles === undefined || Sk.builtinFiles["files"][x] === undefined) throw "File not found: '" + x + "'";
            return Sk.builtinFiles["files"][x];
        },
        inputfun: function (promptText) {
            return new Promise(function (resolve) {
                // Create the inline input container
                const container = document.createElement('div');
                container.className = 'skulpt-input-container';

                // Prompt label
                if (promptText) {
                    const label = document.createElement('div');
                    label.className = 'skulpt-input-label';
                    label.textContent = promptText;
                    container.appendChild(label);
                }

                // Input row (input + button)
                const row = document.createElement('div');
                row.className = 'skulpt-input-row';

                const inputField = document.createElement('input');
                inputField.type = 'text';
                inputField.className = 'skulpt-input-field';
                inputField.placeholder = 'Type your answer here...';
                inputField.autocomplete = 'off';

                const submitBtn = document.createElement('button');
                submitBtn.className = 'skulpt-input-btn';
                submitBtn.textContent = 'Submit ↵';

                row.appendChild(inputField);
                row.appendChild(submitBtn);
                container.appendChild(row);
                outputEl.appendChild(container);

                // Scroll to make input visible
                outputEl.scrollTop = outputEl.scrollHeight;
                inputField.focus();

                function submitInput() {
                    const value = inputField.value;
                    // Replace input container with echoed value
                    const echo = document.createElement('div');
                    echo.className = 'skulpt-input-echo';
                    if (promptText) {
                        echo.innerHTML = '<span class="skulpt-echo-prompt">' + escapeHtml(promptText) + '</span> <span class="skulpt-echo-value">' + escapeHtml(value) + '</span>';
                    } else {
                        echo.innerHTML = '<span class="skulpt-echo-prompt">▸ Input:</span> <span class="skulpt-echo-value">' + escapeHtml(value) + '</span>';
                    }
                    container.replaceWith(echo);

                    // Skulpt's inputfun must ALWAYS return a string.
                    // The generated Python handles type conversion (e.g. float(input(...))).
                    resolve(value);

                }

                submitBtn.addEventListener('click', submitInput);
                inputField.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') { e.preventDefault(); submitInput(); }
                });
            });
        },
        inputfunTakesPrompt: true,
        __future__: Sk.python3
    });

    Sk.misceval.asyncToPromise(function () {
        return Sk.importMainWithBody("<stdin>", false, cleanCode, true);
    }).then(function () {
        if (!outputEl.textContent.trim()) outputEl.textContent = 'Code executed successfully (no output).';
        showToast('Code executed successfully!', 'success');

        // ── Panel 1: Record successful execution ──
        if (typeof metricsEngine !== 'undefined') {
            metricsEngine.recordExecution(true);
        }

        if (outputElementId === 'console-output' && exerciseState.activeExercise) {
            exerciseState.isExecuted = true;
            exerciseState.outputMatched = false;
            if (exerciseState.expectedOutputResolved && exerciseState.expectedOutput) {
                const actualOut = outputEl.textContent.replace('Code executed successfully (no output).', '').trim();
                const expectedOut = (exerciseState.expectedOutput || '').trim();

                if (actualOut === expectedOut) {
                    exerciseState.outputMatched = true;
                } else {
                    console.log(`[Completion] Output mismatch. Expected: "${expectedOut}", Actual: "${actualOut}"`);
                }
            }
            updateExerciseStatus();
        }
    }).catch(function (err) {
        appendOutput('\nError: ' + err.toString());
        outputEl.className = 'output-content error';
        showToast('Runtime error occurred.', 'error');

        // ── Panel 1: Record failed execution ──
        if (typeof metricsEngine !== 'undefined') {
            metricsEngine.recordExecution(false, err.toString());
        }

        if (outputElementId === 'console-output' && exerciseState.activeExercise) {
            exerciseState.isExecuted = false;
            exerciseState.outputMatched = false;
            updateExerciseStatus();
        }
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function simulateExecution(code) {
    const lines = code.split('\n');
    let output = '';
    for (const line of lines) {
        const match = line.match(/print\((.+)\)/);
        if (match) {
            let val = match[1].trim();
            if (val.startsWith('"') || val.startsWith("'")) {
                output += val.replace(/^["']|["']$/g, '') + '\n';
            } else {
                output += `[expression: ${val}]\n`;
            }
        }
    }
    return output || '(no print statements detected)';
}


/* ============================================================
   FEEDBACK & SUGGESTIONS
   ============================================================ */

const _fbEsc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const _fbTry = (fn, fallback) => { try { const v = fn(); return v === undefined ? fallback : v; } catch (e) { return fallback; } };

function analyzePseudocode() {
    const input = getValue('feedback-input');
    if (!input.trim()) { showToast('Please paste some pseudocode to analyze.', 'error'); return; }
    renderFeedback(generateFeedback(input));

    const clustering = _fbTry(() => PseudoPyLearning && PseudoPyLearning.register && PseudoPyLearning.register.feedbackClusterer);
    const moderation = _fbTry(() => PseudoPyLearning && PseudoPyLearning.register && PseudoPyLearning.register.validationEngine);
    let clusters = [];
    if (clustering && moderation) {
        try {
            const compileResult = compilerEngine.compile(input);
            const validation = moderation.runValidation(compileResult, input);
            const patterns = (compileResult && compileResult.valid)
                ? _fbTry(() => PseudoPyLearning.register.patternDetector.detectPatterns({
                    source: input,
                    ast: compileResult.ast,
                    symbolTable: compileResult.symbolTable
                  }), [])
                : [];
            clusters = clustering.clusterFeedback(validation.items, patterns);
        } catch (e) {
            clusters = [];
        }
    }
    renderFeedbackClusters(clusters);
    showToast('Analysis complete!', 'success');
}

/**
 * Renders the clustered Learning Summary (progressive disclosure):
 * the legacy flat feed keeps its contract; this panel adds the
 * category-level view with expandable items underneath.
 */
function renderFeedbackClusters(clusters) {
    const container = $id('feedback-summary-container');
    const results = $id('feedback-summary-results');
    if (!container || !results) return;
    if (!clusters || !clusters.length) { container.classList.add('hidden'); return; }
    container.classList.remove('hidden');

    const sums = _fbTry(() => PseudoPyLearning.register.feedbackClusterer.summarizeClusters(clusters), { error: 0, warning: 0, suggestion: 0, success: 0 });
    const state = sums.error > 0 ? 'error' : (sums.warning > 0 ? 'warning' : (sums.suggestion > 0 ? 'suggestion' : 'success'));
    const stateMeta = (PseudoPyLearning.LABELS.severity[state] || { label: '', icon: 'info' });

    const cardHtml = clusters.map(c => {
        const meta = PseudoPyLearning.LABELS.category[c.category] || { label: c.category, icon: 'circle-check', description: '' };
        const state = _fbTry(() => PseudoPyLearning.register.feedbackClusterer.clusterState(c), 'success');
        const stateIcon = (PseudoPyLearning.LABELS.severity[state] || {}).icon || 'circle-check';
        const counts = [
            c.errorCount ? 'error ' + c.errorCount : '',
            c.warningCount ? 'warning ' + c.warningCount : '',
            c.suggestionCount ? 'suggestion ' + c.suggestionCount : '',
            c.successCount ? 'success ' + c.successCount : ''
        ].filter(Boolean).join(' &middot; ');
        const items = c.items.map(it => {
            const sev = PseudoPyLearning.LABELS.severity[it.severity] || { label: it.severity, icon: 'info' };
            return `
            <li class="lc-item lc-item-${it.severity}">
              <strong>${icon(sev.icon)} ${_fbEsc(it.message)}</strong>
              <div class="lc-expl">${_fbEsc(it.explanation)}</div>
              ${it.suggestion && it.suggestion !== 'Nothing to change here — keep using this approach.' ? `<div class="lc-sugg"><em>Suggestion:</em> ${_fbEsc(it.suggestion)}</div>` : ''}
              ${it.line ? `<div class="lc-line">Line ${_fbEsc(String(it.line))}</div>` : ''}
            </li>`;
        }).join('');
        return `
        <div class="learning-cluster-card lc-state-${state}">
          <div class="lc-head">
            <span class="lc-icon">${icon(meta.icon)}</span>
            <span class="lc-title">${_fbEsc(meta.label)}</span>
            <span class="lc-counts">${counts}</span>
            <span class="lc-state-icon">${icon(stateIcon)}</span>
          </div>
          <div class="lc-desc">${_fbEsc(meta.description || '')}</div>
          <details class="lc-details">
            <summary>View details</summary>
            <ul class="lc-list">${items}</ul>
          </details>
        </div>`;
    }).join('');

    setHtml('feedback-summary-results', `
      <div class="learning-summary-verdict lc-state-${state}">
        ${icon(stateMeta.icon)} <strong>${_fbEsc(stateMeta.label)}:</strong> ${_fbEsc(_fbTry(() => PseudoPyLearning.register.feedbackClusterer.overallVerdict(clusters.flatMap(c => c.items))), '')}
      </div>
      <div class="learning-cluster-grid">${cardHtml}</div>
    `);
    refreshIcons(results);
}

/**
 * ADAPTIVE FEEDBACK ENGINE (Panel 1 Requirement)
 * ───────────────────────────────────────────────
 * Replaces static regex-based analysis with dynamic, context-aware
 * feedback using the actual compiler pipeline:
 *
 *   1. AST-Driven Structure Analysis (via Parser)
 *   2. Symbol Table Variable Hygiene (via SemanticAnalyzer)
 *   3. Algorithmic Complexity Feedback (via analyzeComplexity)
 *   5. Historical Comparison (session improvement metrics)
 */
function generateFeedback(pseudocode) {
    const feedback = [];
    const lines = pseudocode.split('\n');
    const trimmedLines = lines.map(l => l.trim()).filter(l => l);

    // ──────────────────────────────────────────────
    // 1. COMPILER PIPELINE ANALYSIS (AST-Driven)
    // ──────────────────────────────────────────────
    let compileResult = null;
    let ast = null;
    let symbolTable = null;
    let qualityScore = 0; // 0–100 composite score

    try {
        compileResult = compilerEngine.compile(pseudocode);
        // Re-run parser and semantic analyzer to access internals
        const lexer = new Lexer(pseudocode);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens);
        ast = parser.parse();
        const sa = new SemanticAnalyzer();
        sa.analyze(ast);
        symbolTable = sa.symbolTable;
    } catch (e) {
        feedback.push({ type: 'error', icon: 'circle-x', text: '<strong>Analysis Error:</strong> Could not parse pseudocode. ' + e.message });
    }

    // ──────────────────────────────────────────────
    // 1a. STRUCTURE VALIDATION (from AST)
    // ──────────────────────────────────────────────
    const hasBegin = trimmedLines.some(l => /^BEGIN$/i.test(l));
    const hasEnd = trimmedLines.some(l => /^END$/i.test(l));

    if (hasBegin && hasEnd) {
        feedback.push({ type: 'success', icon: 'circle-check', text: '<strong>Good structure:</strong> Proper BEGIN/END blocks detected.' });
        qualityScore += 15;
    } else {
        if (!hasBegin) feedback.push({ type: 'warning', icon: 'triangle-alert', text: '<strong>Missing BEGIN:</strong> Start with a BEGIN statement.' });
        if (!hasEnd) feedback.push({ type: 'warning', icon: 'triangle-alert', text: '<strong>Missing END:</strong> End with an END statement.' });
    }

    // ──────────────────────────────────────────────
    // 1b. BLOCK BALANCE ANALYSIS (from AST errors)
    // ──────────────────────────────────────────────
    if (compileResult) {
        if (compileResult.valid) {
            feedback.push({ type: 'success', icon: 'circle-check', text: '<strong>Compilation:</strong> Pseudocode compiles successfully to Python with no syntax errors.' });
            qualityScore += 25;
        } else {
            const syntaxErrors = compileResult.errors;
            feedback.push({ type: 'error', icon: 'circle-x', text: `<strong>Syntax Errors:</strong> ${syntaxErrors.length} error(s) detected. Fix these before translation.` });
            syntaxErrors.slice(0, 3).forEach(err => {
                feedback.push({
                    type: 'error', icon: 'map-pin',
                    text: `<strong>Line ${err.line}:</strong> ${err.message}${err.suggestion ? ' <em>Tip: ' + err.suggestion + '</em>' : ''}`
                });
            });
        }

        // Warnings from semantic analysis
        if (compileResult.warnings && compileResult.warnings.length > 0) {
            compileResult.warnings.slice(0, 3).forEach(w => {
                feedback.push({
                    type: 'warning', icon: 'triangle-alert',
                    text: `<strong>Line ${w.line}:</strong> ${w.message}${w.suggestion ? ' <em>Tip: ' + w.suggestion + '</em>' : ''}`
                });
            });
        } else if (compileResult.valid) {
            feedback.push({ type: 'success', icon: 'circle-check', text: '<strong>Semantic Check:</strong> No undeclared variables or type warnings.' });
            qualityScore += 10;
        }
    }

    // ──────────────────────────────────────────────
    // 2. SYMBOL TABLE ANALYSIS (Variable Hygiene)
    // ──────────────────────────────────────────────
    if (symbolTable && symbolTable.size > 0) {
        const declaredVars = [...symbolTable.keys()];
        feedback.push({
            type: 'success', icon: 'chart-column',
            text: `<strong>Variables:</strong> ${declaredVars.length} variable(s) tracked in symbol table: <code>${declaredVars.join(', ')}</code>`
        });
        qualityScore += 5;

        const numericVars = declaredVars.filter(v => {
            const info = symbolTable.get(v);
            return info && info.type === 'numeric';
        });
        if (numericVars.length > 0) {
            feedback.push({
                type: 'success', icon: 'hash',
                text: `<strong>Type Safety:</strong> ${numericVars.length} variable(s) confirmed as numeric: <code>${numericVars.join(', ')}</code>`
            });
            qualityScore += 5;
        }
    } else if (ast && ast.body && ast.body.length > 0) {
        feedback.push({
            type: 'warning', icon: 'lightbulb',
            text: '<strong>Suggestion:</strong> Use DECLARE statements to explicitly type your variables for better code generation.'
        });
    }

    // ──────────────────────────────────────────────
    // 3. LOGIC ANALYSIS (Constructivism Model)
    // ──────────────────────────────────────────────
    const allEx = typeof cachedExercises !== 'undefined' ? cachedExercises : [];
    let activeSolution = null;
    for (const ex of allEx) {
        if (typeof currentExerciseId !== 'undefined' && ex.id === currentExerciseId) {
            activeSolution = ex.solution;
            break;
        }
    }

    const logicCard = $id('logic-analysis-card');
    const logicResults = $id('logic-analysis-results');

    if (activeSolution && logicCard && logicResults) {
        const logicAnalysis = metricsEngine.analyzeLogicGap(pseudocode, activeSolution);
        logicCard.classList.remove('hidden');

        let logicHtml = `<p style="margin-bottom: 1rem; font-weight: 500;">${logicAnalysis.summary}</p>`;

        if (logicAnalysis.gaps.length > 0) {
            logicHtml += `<div style="display: flex; flex-direction: column; gap: 0.75rem;">`;
            logicAnalysis.gaps.forEach(gap => {
                logicHtml += `
                    <div style="padding: 0.75rem; background: #fff5f5; border-left: 4px solid #f87171; border-radius: 4px;">
                        <div style="font-weight: 600; color: #991b1b;">[${gap.type}] ${gap.concept || ''}</div>
                        <div style="font-size: 0.9rem; margin: 0.25rem 0;">${gap.message}</div>
                        <div style="font-size: 0.85rem; color: #7f1d1d; background: #fee2e2; padding: 0.4rem; border-radius: 3px; margin-top: 0.4rem;">
                            <strong>Root Cause:</strong> ${gap.rootCause}
                        </div>
                    </div>
                `;
            });
            logicHtml += `</div>`;
        } else {
            logicHtml += `<div style="padding: 1rem; background: #ecfdf5; color: #065f46; border-radius: 4px; border-left: 4px solid #10b981;">
                {{ui:CircleCheck}} Your logic matches the structural patterns required for this problem. You have correctly applied the necessary control structures.
            </div>`;
        }
        logicResults.innerHTML = logicHtml;
    } else if (logicCard) {
        logicCard.classList.add('hidden');
    }

    // ──────────────────────────────────────────────
    // 4. ALGORITHMIC COMPLEXITY ANALYSIS
    // ──────────────────────────────────────────────
    try {
        const complexity = compilerEngine.analyzeComplexity(pseudocode);
        const complexityDescriptions = {
            'O(1)': 'No loops detected; calls and recursion are not measured.',
            'O(N)': 'One loop level detected. This estimate assumes a linear number of iterations.',
            'O(N²)': 'Two loop levels detected. This estimate assumes both loops scale linearly.',
        };
        const desc = complexityDescriptions[complexity] || `Nesting-based estimate: ${complexity}. Actual runtime depends on loop bounds and calls.`;
        const complexityType = 'info';

        feedback.push({
            type: complexityType, icon: 'zap',
            text: `<strong>Loop nesting estimate:</strong> ${complexity} — ${desc}`
        });
        qualityScore += 10; // Nesting alone does not establish algorithm quality.
    } catch (e) { /* skip complexity if analysis fails */ }

    // ──────────────────────────────────────────────
    // 5. PATTERN RECOGNITION (Algorithmic Patterns)
    // ──────────────────────────────────────────────
    const patterns = detectAlgorithmicPatterns(pseudocode, ast);
    patterns.forEach(p => {
        feedback.push({ type: 'success', icon: 'puzzle', text: p });
        qualityScore += 5;
    });

    // ──────────────────────────────────────────────
    // 6. CODE STYLE ANALYSIS
    // ──────────────────────────────────────────────
    const indentedLines = lines.filter(l => l.match(/^\s+/));
    if (indentedLines.length > 0) {
        feedback.push({ type: 'success', icon: 'circle-check', text: '<strong>Indentation:</strong> Uses indentation for readability. Good practice!' });
        qualityScore += 5;
    } else if (lines.length > 3) {
        feedback.push({ type: 'warning', icon: 'lightbulb', text: '<strong>Suggestion:</strong> Add indentation inside blocks (IF, FOR, WHILE) for improved readability.' });
    }

    const displayCount = trimmedLines.filter(l => /^(DISPLAY|PRINT|OUTPUT)\s/i.test(l)).length;
    if (displayCount > 0) {
        feedback.push({ type: 'success', icon: 'circle-check', text: `<strong>Output:</strong> ${displayCount} DISPLAY/PRINT statement(s) found.` });
        qualityScore += 5;
    } else {
        feedback.push({ type: 'warning', icon: 'lightbulb', text: '<strong>Suggestion:</strong> Add DISPLAY statements to show results to the user.' });
    }

    const declareCount = trimmedLines.filter(l => /^DECLARE\s/i.test(l)).length;
    if (declareCount > 0) {
        feedback.push({ type: 'success', icon: 'circle-check', text: `<strong>Declarations:</strong> ${declareCount} DECLARE statement(s) — explicit typing improves code reliability.` });
        qualityScore += 5;
    }

    // ──────────────────────────────────────────────
    // 7. PIPELINE PERFORMANCE (Execution Time)
    // ──────────────────────────────────────────────
    if (compileResult && compileResult.metrics) {
        const m = compileResult.metrics;
        feedback.push({
            type: 'success', icon: 'timer',
            text: `<strong>Generation Time:</strong> ${m.totalTime}ms total — Lexer: ${m.lexTime}ms, Parser: ${m.parseTime}ms, Semantic: ${m.semanticTime}ms, CodeGen: ${m.codeGenTime}ms`
        });
        qualityScore += 5;
    }

    // ──────────────────────────────────────────────
    // 8. HISTORICAL IMPROVEMENT (Session Comparison)
    // ──────────────────────────────────────────────
    if (typeof metricsEngine !== 'undefined') {
        const improvement = metricsEngine.getImprovementMetrics();
        if (improvement.hasData) {
            if (improvement.correctnessImprovement > 0) {
                feedback.push({
                    type: 'success', icon: 'trending-up',
                    text: `<strong>Session Improvement:</strong> ${improvement.correctnessImprovement}% improvement in code correctness since your first translation this session.`
                });
            } else if (improvement.correctnessImprovement < 0) {
                feedback.push({
                    type: 'warning', icon: 'trending-down',
                    text: `<strong>Session Trend:</strong> Error count has increased since your first translation. Review the error messages carefully.`
                });
            }

            feedback.push({
                type: 'success', icon: 'chart-column',
                text: `<strong>Session Stats:</strong> ${improvement.translationCount} translations, ${improvement.overallSuccessRate}% overall compilation success rate.`
            });
        }
    }

    // ──────────────────────────────────────────────
    // 9. FINAL QUALITY SUMMARY
    // ──────────────────────────────────────────────
    qualityScore = Math.min(qualityScore, 100);
    let quality = 'Excellent';
    let qualityType = 'success';

    if (qualityScore >= 90) quality = 'Excellent';
    else if (qualityScore >= 75) quality = 'Very Good';
    else if (qualityScore >= 60) quality = 'Good';
    else if (qualityScore >= 40) { quality = 'Average'; qualityType = 'warning'; }
    else { quality = 'Needs Improvement'; qualityType = 'error'; }

    const errors = feedback.filter(f => f.type === 'error').length;
    const warnings = feedback.filter(f => f.type === 'warning').length;
    const successes = feedback.filter(f => f.type === 'success').length;

    feedback.unshift({
        type: qualityType,
        icon: qualityType === 'success' ? 'trophy' : qualityType === 'warning' ? 'chart-column' : 'wrench',
        text: `<strong>Code Quality Score: ${qualityScore}/100 — ${quality}</strong> — ${successes} passed, ${warnings} suggestion(s), ${errors} error(s). Total: ${trimmedLines.length} lines.`
    });

    return feedback;
}

/**
 * PATTERN RECOGNITION — Detects common algorithmic patterns
 * in the AST. Provides educational feedback about what the
 * student's code is doing (not hard-coded per-input).
 */
function detectAlgorithmicPatterns(pseudocode, ast) {
    const patterns = [];
    const upper = pseudocode.toUpperCase();

    // Accumulator pattern: SET x TO 0 ... x = x + something
    if (/SET\s+\w+\s+TO\s+0/i.test(pseudocode) && /=\s*\w+\s*\+/i.test(pseudocode)) {
        patterns.push('<strong>Pattern Detected:</strong> Accumulator pattern — initializes a variable to 0 and adds to it iteratively.');
    }

    // Counter pattern: counting variable incremented inside a loop
    if (/INCREMENT/i.test(upper) || (/=\s*\w+\s*\+\s*1/i.test(pseudocode) && /WHILE|FOR/i.test(upper))) {
        patterns.push('<strong>Pattern Detected:</strong> Counter pattern — a variable is incremented inside a loop.');
    }

    // Sentinel-controlled loop: WHILE with INPUT inside
    if (/WHILE/i.test(upper) && /INPUT|READ/i.test(upper)) {
        patterns.push('<strong>Pattern Detected:</strong> Sentinel-controlled loop — input-driven loop termination.');
    }

    // Array iteration: FOR with array index access
    if (/FOR\s+\w+\s+FROM/i.test(upper) && /\w+\s*\[/i.test(pseudocode)) {
        patterns.push('<strong>Pattern Detected:</strong> Array traversal — iterating over array elements with index-based access.');
    }

    // Conditional branching: IF/ELSE structure
    if (/IF\s+.+\s+THEN/i.test(pseudocode) && /ELSE/i.test(upper)) {
        patterns.push('<strong>Pattern Detected:</strong> Conditional branching — IF/ELSE decision structure.');
    }

    // Function definition
    if (/FUNCTION|PROCEDURE/i.test(upper)) {
        patterns.push('<strong>Pattern Detected:</strong> Modular design — uses FUNCTION/PROCEDURE for code organization.');
    }

    return patterns;
}

function renderFeedback(feedback) {
    setHtml('feedback-results', feedback.map(f => `
    <div class="feedback-item ${f.type}">
      <span class="fb-icon">${icon(f.icon)}</span>
      <span class="fb-text">${f.text}</span>
    </div>`).join(''));
    refreshIcons($id('feedback-results'));
}


/* ============================================================
   EXERCISES MANAGEMENT — Offline Database CRUD
   ============================================================ */

async function loadExercises(append = false) {
    if (!append) instructorExOffset = 0;
    const allExercises = await refreshExercises();
    const isDefaultInst = !currentUser || currentUser.id === 'u2' || currentUser._docId === 'u2';
    const instructorExercises = allExercises.filter(e =>
        e.createdBy === currentUser?.id ||
        e.createdBy === currentUser?._docId ||
        e.instructorId === currentUser?.id ||
        e.instructorId === currentUser?._docId ||
        (isDefaultInst && (e._docId || '').startsWith('algo_'))
    );
    const totalCount = instructorExercises.length;
    const easyCount = instructorExercises.filter(e => (e.difficulty || '').toLowerCase() === 'easy').length;
    const modCount = instructorExercises.filter(e => ['moderate', 'medium'].includes((e.difficulty || '').toLowerCase())).length;
    const hardCount = instructorExercises.filter(e => (e.difficulty || '').toLowerCase() === 'hard').length;

    setText('stat-exercise-total', String(totalCount));
    setText('stat-exercise-easy', String(easyCount));
    setText('stat-exercise-moderate', String(modCount));
    setText('stat-exercise-hard', String(hardCount));
    setText('stat-exercise-count-label', totalCount === 0 ? 'No exercises' : `${totalCount} exercise${totalCount !== 1 ? 's' : ''}`);
    refreshIcons($id('page-manage-exercises'));

    const tbody = $id('exercises-table-body');
    if (!tbody) return;

    const exercises = append
        ? instructorExercises.slice(instructorExOffset, instructorExOffset + EX_PAGE_LIMIT)
        : instructorExercises.slice(0, EX_PAGE_LIMIT);

    if (exercises.length === 0 && !append) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2.5rem;color:var(--text-muted)"><div style="font-size:2rem">{{ui:ClipboardList}}</div><div style="margin-top:0.5rem;font-weight:600">No Exercises Yet</div><div style="font-size:0.85rem">Click <strong>Add Exercise</strong> to get started.</div></td></tr>`;
        return;
    }

    const diffLabel = d => {
        const norm = (d || 'moderate').toLowerCase();
        if (norm === 'medium') return 'moderate';
        return norm;
    };
    const diffDisplay = d => {
        const l = diffLabel(d);
        return l.charAt(0).toUpperCase() + l.slice(1);
    };

    const rows = exercises.map(ex => {
        const title = ex.title || ex.concept || 'Untitled Exercise';
        const desc = ex.description || 'No description.';
        const diff = diffLabel(ex.difficulty);
        const date = ex.createdAt || '—';
        return `
        <tr>
          <td style="font-weight:600;color:var(--text-primary)">${title}</td>
          <td style="color:var(--text-secondary);max-width:280px">
            <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px" title="${desc}">${desc}</div>
          </td>
          <td><span class="ex-difficulty ${diff}">${diffDisplay(ex.difficulty)}</span></td>
          <td style="color:var(--text-muted);font-size:0.83rem">${date}</td>
          <td>
            <div style="display:flex;gap:0.5rem">
              <button class="btn btn-ghost btn-sm" onclick="editExercise('${ex._docId}')" title="Edit">{{ui:Pencil}} Edit</button>
              <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteExercise('${ex._docId}')" title="Delete">{{ui:Trash2}} Delete</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    if (append) {
        const loadRow = $id('exercises-load-more-row');
        if (loadRow) loadRow.remove();
        tbody.insertAdjacentHTML('beforeend', rows);
    } else {
        tbody.innerHTML = rows;
    }

    if (instructorExercises.length > instructorExOffset + EX_PAGE_LIMIT) {
        instructorExOffset += EX_PAGE_LIMIT;
        tbody.insertAdjacentHTML('beforeend',
            `<tr id="exercises-load-more-row"><td colspan="5" style="text-align:center;padding:1rem">
              <button class="btn btn-secondary" onclick="loadExercises(true)">Load More</button>
             </td></tr>`);
    }
}

let studentExCurrentPage = 1;
const STUDENT_EX_PER_PAGE = 8;

/**
 * getExerciseIconInfo(ex)
 * Automatically determines appropriate icon SVG & background color based on title/category/concept/desc keywords.
 */
function getExerciseIconInfo(ex) {
    const title = ex.title || ex.concept || '';
    const desc = ex.description || '';
    const cat = ex.category || '';
    const text = (title + ' ' + cat + ' ' + desc).toLowerCase();

    // 1. Array / List / Elements
    if (text.includes('array') || text.includes('element') || text.includes('list') || text.includes('vector')) {
        return {
            bgColor: '#16a34a',
            svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`
        };
    }
    // 2. Factorial
    if (text.includes('factorial')) {
        return {
            bgColor: '#ea580c',
            svg: `<span style="font-family:system-ui,-apple-system,sans-serif;font-weight:900;font-size:1.15rem;letter-spacing:-0.5px">n!</span>`
        };
    }
    // 3. Sum / Addition / Accumulate / Odd / Even
    if (text.includes('sum') || text.includes('addition') || text.includes('add') || text.includes('odd') || text.includes('even')) {
        return {
            bgColor: '#9333ea',
            svg: `<span style="font-family:Georgia,serif;font-weight:900;font-size:1.4rem;line-height:1">Σ</span>`
        };
    }
    // 4. Average / Mean / Statistics
    if (text.includes('average') || text.includes('mean') || text.includes('stat') || text.includes('chart')) {
        return {
            bgColor: '#2563eb',
            svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="15" y="5" width="5" height="15" rx="1"/><rect x="9" y="10" width="5" height="10" rx="1"/><rect x="3" y="15" width="5" height="5" rx="1"/></svg>`
        };
    }
    // 5. Sort / Sorting / Order / Ascending / Descending
    if (text.includes('sort') || text.includes('order') || text.includes('ascending') || text.includes('descending')) {
        return {
            bgColor: '#d97706',
            svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 4v16"/></svg>`
        };
    }
    // 6. Palindrome / String / Text / Character / Word
    if (text.includes('palindrome') || text.includes('string') || text.includes('text') || text.includes('char') || text.includes('word')) {
        return {
            bgColor: '#0891b2',
            svg: `<span style="font-family:system-ui,-apple-system,sans-serif;font-weight:900;font-size:1.25rem">P</span>`
        };
    }
    // 7. Count / Counter / Positive / Negative
    if (text.includes('count') || text.includes('counter') || text.includes('positive') || text.includes('negative') || text.includes('how many')) {
        return {
            bgColor: '#0d9488',
            svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
        };
    }
    // 8. Largest / Maximum / Smallest / Minimum / Find / Peak
    if (text.includes('largest') || text.includes('maximum') || text.includes('max') || text.includes('smallest') || text.includes('minimum') || text.includes('min') || text.includes('peak') || text.includes('find')) {
        return {
            bgColor: '#e11d48',
            svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`
        };
    }
    // 9. Loop / Iteration / Repeat / Cycle
    if (text.includes('loop') || text.includes('iteration') || text.includes('repeat') || text.includes('cycle') || text.includes('while') || text.includes('for')) {
        return {
            bgColor: '#4f46e5',
            svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>`
        };
    }
    // 10. Matrix / 2D Grid
    if (text.includes('matrix') || text.includes('grid') || text.includes('2d')) {
        return {
            bgColor: '#059669',
            svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>`
        };
    }
    // 11. Number / Math / Compute / Multiply / Divide
    if (text.includes('number') || text.includes('math') || text.includes('multiply') || text.includes('divide') || text.includes('product') || text.includes('compute') || text.includes('calculator')) {
        return {
            bgColor: '#ea580c',
            svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01"/></svg>`
        };
    }
    // 12. Default Fallback
    return {
        bgColor: '#475569',
        svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`
    };
}

function toggleStudentGuidelines() {
    const body = $id('student-guidelines-body');
    const icon = $id('guidelines-toggle-icon');
    if (!body) return;
    const isCollapsed = body.classList.toggle('collapsed');
    if (icon) {
        icon.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
    }
}

async function changeStudentPage(targetPage) {
    await loadStudentExercises(targetPage);
    const el = $id('page-exercises-student');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function renderStudentPaginationControls(totalExercises, currentPage) {
    const totalPages = Math.max(1, Math.ceil(totalExercises / STUDENT_EX_PER_PAGE));
    const controlsEl = $id('student-pagination-controls');
    const infoEl = $id('student-pagination-info');

    if (infoEl) {
        if (totalExercises === 0) {
            infoEl.textContent = 'Showing 0 to 0 of 0 exercises';
        } else {
            const start = (currentPage - 1) * STUDENT_EX_PER_PAGE + 1;
            const end = Math.min(currentPage * STUDENT_EX_PER_PAGE, totalExercises);
            infoEl.textContent = `Showing ${start} to ${end} of ${totalExercises} exercises`;
        }
    }

    if (!controlsEl) return;
    if (totalPages <= 1) {
        controlsEl.innerHTML = '';
        return;
    }

    let buttonsHtml = '';

    // Previous Button
    const prevDisabled = currentPage === 1 ? 'disabled' : '';
    buttonsHtml += `<button class="page-btn" ${prevDisabled} onclick="changeStudentPage(${currentPage - 1})">‹</button>`;

    // Page Numbers logic
    const pages = [];
    if (totalPages <= 7) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
        pages.push(1);
        if (currentPage > 3) pages.push('...');

        const start = Math.max(2, currentPage - 1);
        const end = Math.min(totalPages - 1, currentPage + 1);
        for (let i = start; i <= end; i++) {
            if (!pages.includes(i)) pages.push(i);
        }

        if (currentPage < totalPages - 2) pages.push('...');
        pages.push(totalPages);
    }

    pages.forEach(p => {
        if (p === '...') {
            buttonsHtml += `<span class="page-ellipsis">…</span>`;
        } else {
            const isActive = p === currentPage ? 'active' : '';
            buttonsHtml += `<button class="page-btn ${isActive}" onclick="changeStudentPage(${p})">${p}</button>`;
        }
    });

    // Next Button
    const nextDisabled = currentPage === totalPages ? 'disabled' : '';
    buttonsHtml += `<button class="page-btn" ${nextDisabled} onclick="changeStudentPage(${currentPage + 1})">›</button>`;

    controlsEl.innerHTML = buttonsHtml;
}

async function loadStudentExercises(page = 1) {
    if (typeof page === 'boolean') {
        page = 1;
    }
    studentExCurrentPage = Math.max(1, page);
    const offset = (studentExCurrentPage - 1) * STUDENT_EX_PER_PAGE;

    const allExercises = await refreshExercises();
    const isDefaultStu = !currentUser || !currentUser.instructorId || currentUser.instructorId === 'u2';
    const studentExercises = allExercises.filter(e =>
        e.instructorId === currentUser?.instructorId ||
        e.createdBy === currentUser?.instructorId ||
        (isDefaultStu && (e._docId || '').startsWith('algo_'))
    );
    const totalExercises = studentExercises.length;
    const exercises = studentExercises.slice(offset, offset + STUDENT_EX_PER_PAGE);
    const container = $id('student-exercises-list');

    if (!container) return;

    // Progress tracking update
    await loadStudentProgress();

    if (exercises.length === 0) {
        container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">{{ui:NotebookPen}}</div><h3>No Exercises Available</h3><p>Your instructor hasn't created any exercises yet.</p></div>`;
        renderStudentPaginationControls(totalExercises, studentExCurrentPage);
        return;
    }

    // Fetch completed exercise titles for current student
    const allActivity = await dbGetAll(activityRef);
    const studentName = currentUser ? currentUser.fullName : '';
    const studentIdVal = currentUser ? (currentUser.id || currentUser._docId) : '';
    const completedIds = new Set(
        allActivity
            .filter(a => (a.student === studentName || a.studentId === studentIdVal) && a.status === 'Completed')
            .map(a => a.exercise)
    );

    const normDiff = d => {
        const v = (d || 'moderate').toLowerCase();
        return v === 'medium' ? 'moderate' : v;
    };
    const dispDiff = d => { const v = normDiff(d); return v.charAt(0).toUpperCase() + v.slice(1); };

    const html = exercises.map(ex => {
        const exTitle = ex.title || ex.concept || 'Untitled Exercise';
        const exDesc = ex.description || 'No description provided.';
        const exDiff = normDiff(ex.difficulty);
        const isCompleted = completedIds.has(exTitle);
        const iconInfo = getExerciseIconInfo(ex);
        const exDate = ex.createdAt || '2026-08-12';

        return `
    <div class="exercise-card">
      <div class="ex-card-top">
        <div class="ex-icon-box" style="background: ${iconInfo.bgColor};">
          ${iconInfo.svg}
        </div>
        <div class="ex-header-text">
          <div class="ex-header-row">
            <h4 class="ex-title">${exTitle}</h4>
            <span class="ex-difficulty ${exDiff}">${dispDiff(ex.difficulty)}</span>
          </div>
        </div>
      </div>
      <p class="ex-desc">${exDesc}</p>
      <div class="ex-date-row">
        <i data-lucide="calendar" aria-hidden="true"></i>
        <span>${exDate}</span>
      </div>
      <hr class="ex-divider" />
      <div class="ex-card-footer">
        ${isCompleted
                ? `<span class="ex-completed-badge active"><i data-lucide="circle-check" aria-hidden="true"></i> Completed</span>`
                : `<button class="ex-start-btn inactive" onclick="attemptExercise('${ex._docId}')"><i data-lucide="play" aria-hidden="true"></i> Start Exercise</button>`
            }
      </div>
    </div>`;
    }).join('');

    container.innerHTML = html;
    refreshIcons(container);
    renderStudentPaginationControls(totalExercises, studentExCurrentPage);
}


/**
 * loadStudentProgress()
 * ─────────────────────────────────────────────────────────────────────
 * Fetches the REAL progress counters from the database:
 *   • totalExercises  — dynamic count of exercises assigned to student
 *   • completedCount  — unique exercises completed by current student
 * ─────────────────────────────────────────────────────────────────────
 */
async function loadStudentProgress() {
    if (!currentUser || currentUser.role !== 'student') return;

    try {
        const allExercises = await refreshExercises();
        const isDefaultStu = !currentUser || !currentUser.instructorId || currentUser.instructorId === 'u2';
        const studentExercises = allExercises.filter(e =>
            e.instructorId === currentUser?.instructorId ||
            e.createdBy === currentUser?.instructorId ||
            (isDefaultStu && (e._docId || '').startsWith('algo_'))
        );
        const totalExercises = studentExercises.length;

        // 2. Fetch all activity for this student, collect unique completed exercise titles
        const allActivity = await dbGetAll(activityRef);
        const studentName = currentUser.fullName;
        const studentIdVal = currentUser.id || currentUser._docId;
        const completedTitles = new Set(
            allActivity
                .filter(a => (a.student === studentName || a.studentId === studentIdVal) && a.status === 'Completed')
                .map(a => a.exercise)
        );
        const completedCount = completedTitles.size;

        // 3. Calculate progress percentage
        const pct = totalExercises > 0 ? Math.round((completedCount / totalExercises) * 100) : 0;

        // 4. Update Exercises & Tasks page counters
        const totalEl = $id('student-total-count');
        const compEl = $id('student-completed-count');
        const fillEl = $id('student-progress-fill');
        const pctEl = $id('student-progress-pct');
        if (totalEl) totalEl.textContent = totalExercises;
        if (compEl) compEl.textContent = completedCount;
        if (fillEl) fillEl.style.width = pct + '%';
        if (pctEl) pctEl.textContent = pct + '%';

        // 5. Update Write Pseudocode topbar progress pill + mini bar
        const pill = $id('topbar-progress-pill');
        if (pill) {
            pill.innerHTML = `<i data-lucide="circle-check" aria-hidden="true"></i> ${completedCount} / ${totalExercises} Completed`;
            refreshIcons(pill);
        }
        const topbarFill = $id('topbar-progress-fill');
        if (topbarFill) {
            topbarFill.style.width = pct + '%';
        }

        console.log(`[Progress] ${completedCount} / ${totalExercises} exercises completed (${pct}%)`);
    } catch (err) {
        console.error('[Progress] Failed to load student progress:', err);
    }
}

async function attemptExercise(id, resubmissionOf = null) {
    const ex = await dbGet(exercisesRef, id);
    if (!ex) return;

    const pseudoEditor = $id('pseudocode-editor');
    if (pseudoEditor) {
        pseudoEditor.value = '';
        pseudoEditor.dispatchEvent(new Event('input'));
    }

    const pyOut = $id('python-output');
    if (pyOut) {
        pyOut.value = '';
        pyOut.dispatchEvent(new Event('input'));
    }

    localStorage.setItem('pseudopy_active_exercise', id);
    exerciseState.resubmissionOf = resubmissionOf || null;
    if (pseudoEditor) pseudoEditor.readOnly = false;
    if (pyOut) pyOut.readOnly = false;
    renderActiveExercise(ex);

    navigateTo('write-pseudocode');
    showToast(`Exercise loaded: ${ex.title || ex.concept || 'Exercise'}. Write your pseudocode!`, 'info');
}

function renderActiveExercise(ex) {
    const panel = $id('active-exercise-panel');
    if (!panel) return;

    const exTitle = ex.title || ex.concept || 'Untitled Exercise';
    const exDesc = ex.description || 'No description provided.';
    const rawDiff = (ex.difficulty || 'moderate').toLowerCase();
    const exDiff = rawDiff === 'medium' ? 'moderate' : rawDiff;
    const exDiffDisplay = exDiff.charAt(0).toUpperCase() + exDiff.slice(1);

    setText('active-ex-title', exTitle);
    setText('active-ex-desc', exDesc);

    const diffBadge = $id('active-ex-difficulty');
    if (diffBadge) {
        diffBadge.textContent = exDiffDisplay;
        diffBadge.className = 'badge';
        if (exDiff === 'easy') diffBadge.classList.add('badge-success');
        else if (exDiff === 'hard') diffBadge.classList.add('badge-danger');
        else diffBadge.classList.add('badge-warning');
    }

    panel.classList.remove('hidden');

    const content = $id('active-ex-content');
    if (content) content.classList.remove('hidden');
    setText('btn-toggle-instructions', 'Hide Instructions');

    // Set active state
    exerciseState.activeExercise = ex;
    exerciseState.isTranslated = false;
    exerciseState.isExecuted = false;
    exerciseState.outputMatched = false;
    exerciseState.expectedOutput = '';
    exerciseState.expectedOutputResolved = false;
    updateExerciseStatus();

    // Determine expected output:
    // 1. Prefer the instructor's stored expected output on the exercise record.
    // 2. Otherwise compute it dynamically by running the solution code (legacy seeds).
    const storedOutput = ex.expectedOutput || ex.expected_output || '';
    if (storedOutput) {
        exerciseState.expectedOutput = storedOutput;
        exerciseState.expectedOutputResolved = true;
    } else {
        // solution key: user-created use 'solution', seeded may have 'python_code'
        const solutionCode = ex.solution || ex.python_code || '';
        if (solutionCode) computeExpectedOutput(solutionCode);
        else exerciseState.expectedOutputResolved = true;
    }
}

function computeExpectedOutput(code) {
    if (typeof Sk === 'undefined') {
        exerciseState.expectedOutputResolved = true;
        return;
    }
    let outText = '';
    Sk.configure({
        output: function (text) { outText += text; },
        read: function (x) {
            if (Sk.builtinFiles === undefined || Sk.builtinFiles["files"][x] === undefined) throw "File not found: '" + x + "'";
            return Sk.builtinFiles["files"][x];
        },
        inputfun: function () { return ''; },
        inputfunTakesPrompt: true,
        __future__: Sk.python3
    });
    Sk.misceval.asyncToPromise(function () {
        return Sk.importMainWithBody("<stdin>", false, code, true);
    }).then(() => {
        exerciseState.expectedOutput = outText;
        exerciseState.expectedOutputResolved = true;
        console.log('[Completion] Expected output computed dynamically.');
    }).catch(err => {
        exerciseState.expectedOutputResolved = true;
        console.warn('[Completion] Failed to compute expected output:', err);
    });
}

function updateExerciseStatus() {
    const statusEl = $id('active-ex-status');
    const submitBtn = $id('btn-submit-exercise');
    if (!statusEl || !submitBtn || !exerciseState.activeExercise) return;

    // Exact output matching is only required when a reliable expected output
    // could be established. If not (e.g. interactive INPUT-based programs such
    // as the Calculator activity), successful translate + run counts as complete.
    const hasExpectedOutput = exerciseState.expectedOutputResolved && !!exerciseState.expectedOutput;
    const isCompleted = exerciseState.isTranslated && exerciseState.isExecuted &&
        (!hasExpectedOutput || exerciseState.outputMatched);

    if (isCompleted) {
        statusEl.textContent = '{{ui:Circle}} Status: Completed';
        statusEl.className = 'badge badge-success';
        statusEl.style.marginLeft = '0.5rem';
        submitBtn.classList.remove('hidden');
    } else {
        statusEl.textContent = '{{ui:Circle}} Status: In Progress';
        statusEl.className = 'badge badge-warning';
        statusEl.style.marginLeft = '0.5rem';
        submitBtn.classList.add('hidden');
    }
}

async function submitExercise() {
    const ex = exerciseState.activeExercise;
    if (!ex || !currentUser) return;
    if (!confirm('Are you sure you want to submit this exercise?')) return;
    const pseudo = getValue('pseudocode-editor');
    const py = getPythonCode('python-output');
    const outTextEl = $id('console-output');
    const outText = outTextEl ? outTextEl.textContent || '' : '';
    const now = new Date();
    const docId = 'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const studentAccountId = currentUser._docId || currentUser.id;
    const actRecord = {
        _docId: docId, id: docId, exerciseId: ex._docId || ex.id,
        revisionOf: exerciseState.resubmissionOf || null,
        attemptNumber: exerciseState.resubmissionOf ? 2 : 1,
        student: currentUser.fullName,
        studentId: currentUser.studentId || currentUser.username || studentAccountId,
        studentAccountId, section: currentUser.section || 'BSCS-3A',
        instructorId: ex.instructorId || ex.createdBy || currentUser.instructorId || 'u2',
        exercise: ex.title || ex.concept || 'Untitled Exercise',
        difficulty: ex.difficulty || 'moderate', status: 'Completed',
        reviewStatus: 'submitted', score: '100%', time: now.toISOString(),
        timestamp: now.getTime(), pseudocode: pseudo, python_code: py,
        result: 'Success', errorType: null, processingTime: '0.45s', output: outText
    };
    const saveBtn = $id('btn-submit-exercise');
    if (saveBtn) saveBtn.disabled = true;
    try {
        await dbSet(activityRef, docId, actRecord);
        if (typeof cachedActivity !== 'undefined') cachedActivity.unshift(actRecord);
        if (typeof currentFilteredActivity !== 'undefined') currentFilteredActivity.unshift(actRecord);
        if (typeof updateAnalyticsUI === 'function') { try { updateAnalyticsUI(); } catch (e) {} }
        const overlay = $id('submission-success-overlay');
        const timeDisplay = $id('submission-time-display');
        if (overlay && timeDisplay) {
            timeDisplay.innerHTML = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + '<br>' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
            overlay.classList.remove('hidden');
            const returnBtn = $id('btn-return-to-exercises');
            if (returnBtn) returnBtn.disabled = false;
        }
        const pseudoEditor = $id('pseudocode-editor');
        if (pseudoEditor) pseudoEditor.readOnly = true;
        const pyOutput = $id('python-output');
        if (pyOutput) pyOutput.readOnly = true;
        const translateBtn = $id('btn-translate-pseudocode');
        if (translateBtn) translateBtn.disabled = true;
        const runBtn = $id('btn-run-code');
        if (runBtn) runBtn.disabled = true;
        await loadStudentProgress();
        showToast(exerciseState.resubmissionOf ? 'Resubmission submitted successfully.' : 'Exercise submitted successfully.', 'success');
        exerciseState.resubmissionOf = null;
    } catch (error) {
        console.error('[Exercise] Submission failed:', error);
        showToast('Unable to save submission. Please try again.', 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

function changeExercise() {
    localStorage.removeItem('pseudopy_active_exercise');
    const panel = $id('active-exercise-panel');
    if (panel) panel.classList.add('hidden');

    const overlay = $id('submission-success-overlay');
    if (overlay) overlay.classList.add('hidden');

    exerciseState.activeExercise = null;
    exerciseState.isTranslated = false;
    exerciseState.isExecuted = false;
    exerciseState.outputMatched = false;
    exerciseState.expectedOutputResolved = false;
    exerciseState.expectedOutput = '';

    const pseudoEditor = $id('pseudocode-editor');
    if (pseudoEditor) pseudoEditor.readOnly = false;
    const pyOut = $id('python-output');
    if (pyOut) pyOut.readOnly = false;

    const translateBtn = $id('btn-translate-pseudocode');
    if (translateBtn) translateBtn.disabled = false;
    const runBtn = $id('btn-run-code');
    if (runBtn) runBtn.disabled = false;
    const returnBtn = $id('btn-return-to-exercises');
    if (returnBtn) returnBtn.disabled = false;

    navigateTo('exercises-student');
}

function toggleExerciseInstructions() {
    const content = $id('active-ex-content');
    const btn = $id('btn-toggle-instructions');
    if (!content || !btn) return;
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        btn.textContent = 'Hide Instructions';
    } else {
        content.classList.add('hidden');
        btn.textContent = 'Show Instructions';
    }
}

function _clearExerciseErrors() {
    ['ex-title-error', 'ex-desc-error', 'ex-difficulty-error', 'ex-solution-error', 'ex-expected-output-error'].forEach(id => {
        const el = $id(id);
        if (el) el.style.display = 'none';
    });
}

async function openExerciseModal(id = null) {
    editingExerciseId = id;
    _clearExerciseErrors();
    const modal = $id('exercise-modal');
    const title = $id('exercise-modal-title');
    if (!modal || !title) return;

    if (id) {
        const ex = await dbGet(exercisesRef, id);
        if (ex) {
            title.textContent = 'Edit Exercise';
            const rawDiff = (ex.difficulty || 'moderate').toLowerCase();
            setValue('ex-title', ex.title || ex.concept || '');
            setValue('ex-desc', ex.description || '');
            setValue('ex-difficulty', rawDiff === 'medium' ? 'moderate' : rawDiff);
            setValue('ex-solution', ex.solution || ex.pseudocode || '');
            setValue('ex-expected-output', ex.expectedOutput || ex.expected_output || '');
            const saveBtn = $id('exercise-save-btn');
            if (saveBtn) saveBtn.textContent = '{{ui:Save}} Save Changes';
        }
    } else {
        title.textContent = 'Add Exercise';
        setValue('ex-title', '');
        setValue('ex-desc', '');
        setValue('ex-difficulty', 'moderate');
        setValue('ex-solution', '');
        setValue('ex-expected-output', '');
        const saveBtn = $id('exercise-save-btn');
        if (saveBtn) saveBtn.textContent = '{{ui:Plus}} Add Exercise';
    }
    modal.classList.remove('hidden');
}

function closeExerciseModal() {
    const modal = $id('exercise-modal');
    if (modal) modal.classList.add('hidden');
    editingExerciseId = null;
}

async function saveExercise() {
    _clearExerciseErrors();

    const titleVal = getValue('ex-title').trim();
    const descVal = getValue('ex-desc').trim();
    const diffVal = getValue('ex-difficulty');
    const solutionVal = getValue('ex-solution').trim();
    const expectedOutputVal = getValue('ex-expected-output').trim();

    // Per-field validation
    let hasError = false;
    if (!titleVal) {
        const el = $id('ex-title-error');
        if (el) el.style.display = 'block';
        hasError = true;
    }
    if (!descVal) {
        const el = $id('ex-desc-error');
        if (el) el.style.display = 'block';
        hasError = true;
    }
    if (!diffVal) {
        const el = $id('ex-difficulty-error');
        if (el) el.style.display = 'block';
        hasError = true;
    }
    if (!solutionVal) {
        const el = $id('ex-solution-error');
        if (el) el.style.display = 'block';
        hasError = true;
    }
    if (!expectedOutputVal) {
        const el = $id('ex-expected-output-error');
        if (el) el.style.display = 'block';
        hasError = true;
    }
    if (hasError) return;

    const saveBtn = $id('exercise-save-btn');
    if (saveBtn) saveBtn.disabled = true;
    try {
        const instId = currentUser?.id || currentUser?._docId || 'u2';
        if (editingExerciseId) {
            await dbUpdate(exercisesRef, editingExerciseId, {
                title: titleVal,
                description: descVal,
                difficulty: diffVal,
                solution: solutionVal,
                expectedOutput: expectedOutputVal,
                instructorId: instId
            });
            createExerciseNotifications(editingExerciseId, titleVal, 'updated').catch(error => console.error('[Notifications] Background update failed:', error));
            showToast('Exercise updated successfully!', 'success');
        } else {
            const newId = 'ex' + Date.now();
            await dbSet(exercisesRef, newId, {
                id: newId,
                _docId: newId,
                title: titleVal,
                description: descVal,
                difficulty: diffVal,
                solution: solutionVal,
                expectedOutput: expectedOutputVal,
                createdBy: instId,
                instructorId: instId,
                createdAt: new Date().toISOString().split('T')[0]
            });
            createExerciseNotifications(newId, titleVal, 'added').catch(error => console.error('[Notifications] Background create failed:', error));
            showToast('Exercise added successfully!', 'success');
        }
        closeExerciseModal();
        await loadExercises();
    } catch (err) {
        console.error('[Exercise] Save error:', err);
        showToast('Failed to save exercise. Please check your connection and try again.', 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

function editExercise(id) { openExerciseModal(id); }

async function deleteExercise(id) {
    if (!confirm('Delete this exercise?')) return;

    const tbody = $id('exercises-table-body');
    if (tbody) {
        const btn = tbody.querySelector(`[onclick="deleteExercise('${id}')"]`);
        if (btn) {
            const row = btn.closest('tr');
            if (row) {
                row.style.transition = 'opacity 0.15s';
                row.style.opacity = '0';
                setTimeout(() => row.remove(), 150);
            }
        }
    }

    dbDelete(exercisesRef, id)
        .then(() => showToast('Exercise deleted.', 'info'))
        .catch(err => {
            console.error('[Offline Database] Delete exercise error:', err);
            showToast('Failed to delete exercise. Please refresh.', 'error');
            loadExercises();
        });
}


/* ============================================================
   USER MANAGEMENT (Admin) — Manage Instructors
   ============================================================ */

function _fmtDate(dateStr, fallback = 'Never') {
    if (!dateStr) return fallback;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

async function loadUsers() {
    const tbody = $id('users-table-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted)">Loading instructors...</td></tr>`;

    try {
        const users = await refreshUsers();
        const instructors = (users || []).filter(u => u.role === 'instructor');

        // Load device records to track pending device approvals per instructor
        try {
            cachedDevices = await dbGetAll(devicesRef);
        } catch (e) {
            console.warn('[App] Device load warning:', e);
            cachedDevices = [];
        }

        allCachedInstructors = instructors;

        // KPI cards calculation
        const totalCount = instructors.filter(u => u.status !== 'archived').length;
        const activeCount = instructors.filter(u => u.status === 'active').length;
        const inactiveCount = instructors.filter(u => u.status === 'inactive').length;

        setText('stat-total-instructors', totalCount);
        setText('stat-active-instructors', activeCount);
        setText('stat-inactive-instructors', inactiveCount);

        // apply existing filter state
        applyInstructorFilters();
    } catch (err) {
        console.error('[App] Failed to load instructors:', err);
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center;padding:3rem;color:var(--danger)">
                        <div style="font-size:2rem;margin-bottom:0.5rem">{{ui:TriangleAlert}}</div>
                        <div style="font-weight:600;font-size:1rem;margin-bottom:0.4rem">Unable to load instructors. Please try again.</div>
                        <div style="font-size:0.83rem;color:var(--text-muted);margin-bottom:1rem">${err.message || 'Check database connection.'}</div>
                        <button class="btn btn-secondary btn-sm" onclick="loadUsers()" style="margin:0 auto">{{ui:RefreshCw}} Try Again</button>
                    </td>
                </tr>`;
        }
    }
}

function applyInstructorFilters() {
    const searchVal = ($id('instructor-search')?.value || '').toLowerCase().trim();
    const statusVal = $id('instructor-filter-status')?.value || '';
    const sortVal = $id('instructor-sort')?.value || 'newest';

    let list = allCachedInstructors.filter(u => {
        if (statusVal) {
            if (u.status !== statusVal) return false;
        } else {
            // Default "All Statuses": hide archived instructors from normal active list
            if (u.status === 'archived') return false;
        }
        if (searchVal) {
            const hay = [u.fullName || '', u.username || '', u.email || ''].join(' ').toLowerCase();
            if (!hay.includes(searchVal)) return false;
        }
        return true;
    });

    if (sortVal === 'name' || sortVal === 'name-asc') {
        list = list.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
    } else if (sortVal === 'name-desc') {
        list = list.sort((a, b) => (b.fullName || '').localeCompare(a.fullName || ''));
    } else if (sortVal === 'oldest') {
        list = list.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    } else if (sortVal === 'last-login') {
        list = list.sort((a, b) => new Date(b.lastLogin || 0) - new Date(a.lastLogin || 0));
    } else {
        // Default: newest
        list = list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    filteredInstructors = list;
    instructorPage = 1;
    renderInstructorTable();
}

function renderInstructorTable() {
    const tbody = $id('users-table-body');
    if (!tbody) return;

    const total = filteredInstructors.length;
    const pageCount = Math.max(1, Math.ceil(total / INSTR_PAGE_SIZE));
    instructorPage = Math.min(instructorPage, pageCount);
    const start = (instructorPage - 1) * INSTR_PAGE_SIZE;
    const slice = filteredInstructors.slice(start, start + INSTR_PAGE_SIZE);

    // count label
    setText('instructor-count-label', total === 0 ? 'No instructors found' : `${total} instructor${total !== 1 ? 's' : ''}`);

    // pagination info
    const showing = total === 0 ? 0 : start + 1;
    const showEnd = Math.min(start + INSTR_PAGE_SIZE, total);
    setText('instructor-page-info', `Showing ${showing} to ${showEnd} of ${total} results`);

    // page number buttons
    const pageNumbers = $id('instructor-page-numbers');
    if (pageNumbers) {
        let html = '';
        for (let p = 1; p <= pageCount; p++) {
            html += `<button class="an-page-btn ${p === instructorPage ? 'active' : ''}" onclick="instructorGoPage(${p})">${p}</button>`;
        }
        pageNumbers.innerHTML = html;
    }

    const prevBtn = $id('instructor-prev-btn');
    const nextBtn = $id('instructor-next-btn');
    if (prevBtn) prevBtn.disabled = instructorPage <= 1;
    if (nextBtn) nextBtn.disabled = instructorPage >= pageCount;

    if (total === 0) {
        tbody.innerHTML = `
            <tr>
              <td colspan="7" style="text-align:center;padding:3rem;color:var(--text-muted)">
                <div style="font-size:2.5rem;margin-bottom:0.75rem">{{ui:Users}}</div>
                <div style="font-weight:600;font-size:1rem;margin-bottom:0.4rem">No instructors found</div>
                <div style="font-size:0.83rem">Try adjusting your search or filter, or click <strong>Add Instructor</strong> to create one.</div>
              </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = slice.map(u => {
        const isArchived = u.status === 'archived';
        const statusBadge = u.status === 'active'
            ? `<span class="badge badge-active">ACTIVE</span>`
            : isArchived
            ? `<span class="badge badge-archived">ARCHIVED</span>`
            : `<span class="badge badge-inactive">INACTIVE</span>`;
        const dateAdded = _fmtDate(u.createdAt, 'N/A');
        const lastLogin = _fmtDate(u.lastLogin, 'Never');

        const userDevices = (cachedDevices || []).filter(d => d.userId === u.id || d.userId === u._docId || d.username === u.username);
        const pendingDevices = userDevices.filter(d => d.status === 'pending');
        const pendingCount = pendingDevices.length;
        const instructorId = u.id || u._docId;

        return `
        <tr>
          <td>
            <div class="user-cell">
              <div class="avatar-sm">{{ui:UserRound}}</div>
              <div>
                <div style="font-weight:600;color:var(--text-primary)">${u.fullName}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);font-family:monospace">@${u.username}</div>
              </div>
            </div>
          </td>
          <td style="color:var(--text-secondary);font-size:0.85rem">${u.email}</td>
          <td><span class="badge badge-instructor" style="font-size:0.7rem;padding:0.25rem 0.6rem;letter-spacing:0.05em">INSTRUCTOR</span></td>
          <td>${statusBadge}</td>
          <td style="font-size:0.8rem;color:var(--text-muted)">${dateAdded}</td>
          <td style="font-size:0.8rem;color:var(--text-muted)">${lastLogin}</td>
          <td>
            <div style="display:flex;gap:0.35rem;align-items:center">
              <button class="btn btn-ghost btn-sm" onclick="viewInstructor('${instructorId}')" title="View Details" aria-label="View instructor details" style="padding:0.3rem 0.5rem;font-size:0.8rem">
                {{ui:Eye}}
              </button>
              <button class="btn btn-ghost btn-sm" onclick="openInstructorEditModal('${instructorId}')" title="Edit" aria-label="Edit instructor" style="padding:0.3rem 0.5rem;font-size:0.8rem">
                {{ui:Pencil}}
              </button>
              <button class="btn btn-ghost btn-sm device-action-btn" onclick="openInstructorDevicesModal('${instructorId}')" title="Manage Authorized Devices (${userDevices.length} registered${pendingCount > 0 ? `, ${pendingCount} pending approval` : ''})" aria-label="Manage authorized devices (${userDevices.length} registered${pendingCount > 0 ? `, ${pendingCount} pending approval` : ''})" style="padding:0.3rem 0.5rem;font-size:0.8rem;color:${pendingCount > 0 ? '#f59e0b' : '#38bdf8'}">
                {{ui:Monitor}}
                ${pendingCount > 0 ? `<span class="device-pending-badge"></span>` : ''}
              </button>
              ${isArchived ? `
                <button class="btn btn-ghost btn-sm" onclick="openRestoreInstructorModal('${instructorId}')" title="Restore Instructor" aria-label="Restore instructor" style="padding:0.3rem 0.5rem;font-size:0.8rem;color:var(--success)">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                </button>
              ` : `
                <button class="btn btn-ghost btn-sm" onclick="confirmToggleInstructorStatus('${instructorId}')" title="${u.status === 'active' ? 'Deactivate' : 'Activate'}" aria-label="${u.status === 'active' ? 'Deactivate instructor' : 'Activate instructor'}" style="padding:0.3rem 0.5rem;font-size:0.8rem;color:${u.status === 'active' ? 'var(--warning)' : 'var(--success)'}">
                  ${u.status === 'active' ? '{{ui:LockKeyhole}}' : '{{ui:LockKeyholeOpen}}'}
                </button>
                <button class="btn btn-ghost btn-sm" onclick="openArchiveInstructorModal('${instructorId}')" ${instructorId === currentUser?.id || instructorId === currentUser?._docId ? 'disabled title="Cannot archive yourself"' : 'title="Archive Instructor" aria-label="Archive instructor"'} style="padding:0.3rem 0.5rem;font-size:0.8rem;color:var(--warning)">
                  {{ui:Archive}}
                </button>
              `}
            </div>
          </td>
        </tr>`;
    }).join('');
}

function instructorPageNav(dir) {
    const total = filteredInstructors.length;
    const pageCount = Math.max(1, Math.ceil(total / INSTR_PAGE_SIZE));
    instructorPage = Math.max(1, Math.min(instructorPage + dir, pageCount));
    renderInstructorTable();
}

function instructorGoPage(p) {
    instructorPage = p;
    renderInstructorTable();
}

// ── Instructor Device Management & Approvals ──────────────────

async function openInstructorDevicesModal(instructorId) {
    activeDeviceInstructorId = instructorId;
    const instructor = allCachedInstructors.find(u => u.id === instructorId || u._docId === instructorId);
    if (!instructor) {
        showToast('Instructor not found.', 'error');
        return;
    }

    setText('device-modal-instructor-name', instructor.fullName);
    setText('device-modal-instructor-handle', '@' + instructor.username);
    setText('device-modal-instructor-subtitle', `Authorized device access control for ${instructor.fullName}`);

    show('instructor-devices-modal');
    await renderDeviceModalTable();
}

function closeInstructorDevicesModal() {
    hide('instructor-devices-modal');
    activeDeviceInstructorId = null;
}

async function renderDeviceModalTable() {
    const tbody = $id('device-modal-table-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Loading devices...</td></tr>`;

    const allDevices = await dbGetAll(devicesRef);
    cachedDevices = allDevices;
    const instructor = allCachedInstructors.find(u => u.id === activeDeviceInstructorId || u._docId === activeDeviceInstructorId);
    if (!instructor) return;

    const devices = allDevices.filter(d =>
        d.userId === instructor.id ||
        d.userId === instructor._docId ||
        d.username === instructor.username
    );

    const total = devices.length;
    const approved = devices.filter(d => d.status === 'approved').length;
    const pending = devices.filter(d => d.status === 'pending').length;

    setText('device-modal-total-count', total);
    setText('device-modal-approved-count', approved);
    setText('device-modal-pending-count', pending);

    const approveAllBtn = $id('btn-approve-all-devices');
    if (approveAllBtn) {
        approveAllBtn.style.display = pending > 0 ? 'inline-flex' : 'none';
    }

    if (devices.length === 0) {
        tbody.innerHTML = `
            <tr>
              <td colspan="5" style="text-align:center; padding:2rem; color:var(--text-muted);">
                <div style="font-size:1.8rem; margin-bottom:0.4rem;">{{ui:Monitor}}</div>
                <div style="font-weight:600; font-size:0.9rem;">No Registered Devices Yet</div>
                <div style="font-size:0.75rem;">When this instructor signs in from a device, it will automatically appear here for verification.</div>
              </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = devices.map(d => {
        const isMobile = d.deviceType === 'Mobile';
        const icon = isMobile ? '{{ui:Smartphone}}' : '{{ui:Monitor}}';
        const reqTime = _fmtDate(d.requestedAt);
        const lastSeen = _fmtDate(d.lastSeenAt);

        let statusBadge = '';
        if (d.status === 'approved') {
            statusBadge = `<span class="badge-device-approved">{{ui:CircleCheck}} Approved</span>`;
        } else if (d.status === 'pending') {
            statusBadge = `<span class="badge-device-pending">{{ui:Clock}} Pending Approval</span>`;
        } else {
            statusBadge = `<span class="badge-device-revoked">{{ui:CircleX}} Revoked</span>`;
        }

        return `
        <tr>
          <td data-label="Device">
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <span style="font-size:1.1rem; flex-shrink:0;">${icon}</span>
              <div>
                <strong style="color:var(--text-primary); font-size:0.85rem;">${d.deviceName || 'Device'}</strong>
                <div style="font-size:0.72rem; color:var(--text-muted); font-family:monospace;">${d.deviceId ? d.deviceId.substring(0, 16) + '...' : '-'}</div>
              </div>
            </div>
          </td>
          <td data-label="OS & Browser">
            <div style="font-size:0.82rem; color:var(--text-primary);">${d.os || 'Unknown OS'}</div>
            <div style="font-size:0.72rem; color:var(--text-muted);">${d.browser || 'Unknown Browser'}</div>
          </td>
          <td data-label="Requested">
            <div style="font-size:0.78rem; color:var(--text-primary);">${reqTime}</div>
            <div style="font-size:0.7rem; color:var(--text-muted);">Active: ${lastSeen}</div>
          </td>
          <td data-label="Status">${statusBadge}</td>
          <td data-label="Action" class="device-action-cell" style="text-align:right;">
            <div class="device-action-group">
              ${d.status !== 'approved' ? `
                <button class="btn btn-sm device-action-approve" data-device-action="${d._docId}" data-device-action-label="${d.status === 'revoked' ? 'Approve Again' : 'Approve'}" onclick="approveDevice('${d._docId}')" title="${d.status === 'revoked' ? 'Approve this device again' : 'Approve this device'}">
                  {{ui:CircleCheck}} ${d.status === 'revoked' ? 'Approve Again' : 'Approve'}
                </button>
              ` : `
                <button class="btn btn-sm device-action-revoke" data-device-action="${d._docId}" data-device-action-label="Revoke" onclick="revokeDevice('${d._docId}')" title="Revoke authorization">
                  {{ui:LockKeyhole}} Revoke
                </button>
              `}
              <button class="btn btn-ghost btn-sm" data-device-action="${d._docId}" onclick="deleteDeviceRecord('${d._docId}')" style="color:var(--danger); padding:0.25rem 0.4rem; font-size:0.75rem;" title="Remove record" aria-label="Remove device record from instructor">
                {{ui:Trash2}}
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');
}

const _busyDevices = new Set();

function _deviceActionButtons(docId) {
    return document.querySelectorAll(`[data-device-action="${docId}"]`);
}

function _setDeviceButtonsBusy(docId, busy) {
    _deviceActionButtons(docId).forEach(b => {
        if (busy) {
            b.classList.add('is-loading-text');
            b.classList.remove('is-loading');
            b.disabled = true;
            b.setAttribute('aria-busy', 'true');
            const action = (b.dataset.deviceActionLabel || (
                b.classList.contains('device-action-approve') ? 'Approve' : 'Revoke'
            )).trim();
            const stem = action.toLowerCase().startsWith('approve') ? 'Approving' : 'Revoking';
            b.textContent = stem + '...';
        } else {
            b.classList.remove('is-loading-text', 'is-loading');
            b.disabled = false;
            b.removeAttribute('aria-busy');
        }
    });
}

async function _runDeviceAction(deviceDocId, action) {
    if (_busyDevices.has(deviceDocId)) return false;
    _busyDevices.add(deviceDocId);
    _setDeviceButtonsBusy(deviceDocId, true);
    try {
        await action();
        return true;
    } catch (err) {
        console.error('[Device] action error:', err);
        showToast('Device action failed. Please try again.', 'error');
        return false;
    } finally {
        _busyDevices.delete(deviceDocId);
        _setDeviceButtonsBusy(deviceDocId, false);
    }
}

async function approveDevice(deviceDocId) {
    await _runDeviceAction(deviceDocId, async () => {
        await dbUpdate(devicesRef, deviceDocId, {
            status: 'approved',
            approvedAt: new Date().toISOString(),
            approvedBy: currentUser?.username || 'admin'
        });
        showToast('Device approved successfully!', 'success');
        await renderDeviceModalTable();
        await loadUsers();
    });
}

async function revokeDevice(deviceDocId) {
    await _runDeviceAction(deviceDocId, async () => {
        await dbUpdate(devicesRef, deviceDocId, {
            status: 'revoked',
            revokedAt: new Date().toISOString(),
            revokedBy: currentUser?.username || 'admin'
        });
        showToast('Device access revoked.', 'info');
        await renderDeviceModalTable();
        await loadUsers();
    });
}

async function deleteDeviceRecord(deviceDocId) {
    if (!confirm('Are you sure you want to remove this device record?')) return;
    await _runDeviceAction(deviceDocId, async () => {
        await dbDelete(devicesRef, deviceDocId);
        showToast('Device record removed.', 'info');
        await renderDeviceModalTable();
        await loadUsers();
    });
}

let _approveAllDevicesBusy = false;

async function approveAllPendingDevices() {
    if (_approveAllDevicesBusy) return;
    if (!activeDeviceInstructorId) return;
    const instructor = allCachedInstructors.find(u => u.id === activeDeviceInstructorId || u._docId === activeDeviceInstructorId);
    if (!instructor) return;

    const approveAllBtn = $id('btn-approve-all-devices');
    _approveAllDevicesBusy = true;
    if (approveAllBtn) {
        approveAllBtn.classList.add('is-loading');
        approveAllBtn.disabled = true;
    }

    try {
        const allDevices = await dbGetAll(devicesRef);
        const pendingDevices = allDevices.filter(d =>
            (d.userId === instructor.id || d.userId === instructor._docId || d.username === instructor.username) &&
            d.status === 'pending'
        );

        for (const dev of pendingDevices) {
            await dbUpdate(devicesRef, dev._docId, {
                status: 'approved',
                approvedAt: new Date().toISOString(),
                approvedBy: currentUser?.username || 'admin'
            });
        }

        showToast(`Approved ${pendingDevices.length} pending device(s) for ${instructor.fullName}!`, 'success');
        await renderDeviceModalTable();
        await loadUsers();
    } catch (err) {
        console.error('[Device] Approve all error:', err);
        showToast('Failed to approve devices. Please try again.', 'error');
    } finally {
        _approveAllDevicesBusy = false;
        if (approveAllBtn) {
            approveAllBtn.classList.remove('is-loading');
            approveAllBtn.disabled = false;
        }
    }
}

// ── Add / Edit Instructor Modal ──────────────────────────────

function openInstructorAddModal() {
    editingInstructorId = null;
    setText('instructor-modal-title', '{{ui:Plus}} Add Instructor');
    const saveBtn = $id('inst-save-btn');
    if (saveBtn) saveBtn.textContent = '{{ui:Plus}} Add Instructor';

    setValue('inst-fullname', '');
    setValue('inst-username', '');
    setValue('inst-email', '');
    setValue('inst-password', '');
    setValue('inst-confirm-password', '');
    setValue('inst-status', 'active');

    const pwGroup = $id('inst-password-group');
    const cpGroup = $id('inst-confirm-password-group');
    if (pwGroup) pwGroup.classList.remove('hidden');
    if (cpGroup) cpGroup.classList.remove('hidden');

    const alert = $id('inst-form-alert');
    if (alert) { alert.textContent = ''; alert.classList.add('hidden'); }

    const modal = $id('instructor-modal');
    if (modal) modal.classList.remove('hidden');
}

async function openInstructorEditModal(id) {
    const users = allCachedInstructors.length ? allCachedInstructors : await refreshUsers().then(u => u.filter(x => x.role === 'instructor'));
    const user = users.find(u => u.id === id || u._docId === id);
    if (!user) return;

    editingInstructorId = id;
    setText('instructor-modal-title', '{{ui:Pencil}} Edit Instructor');
    const saveBtn = $id('inst-save-btn');
    if (saveBtn) saveBtn.textContent = '{{ui:Save}} Save Changes';

    setValue('inst-fullname', user.fullName || '');
    setValue('inst-username', user.username || '');
    setValue('inst-email', user.email || '');
    setValue('inst-password', '');
    setValue('inst-confirm-password', '');
    setValue('inst-status', user.status || 'active');

    // hide password fields during edit
    const pwGroup = $id('inst-password-group');
    const cpGroup = $id('inst-confirm-password-group');
    if (pwGroup) pwGroup.classList.add('hidden');
    if (cpGroup) cpGroup.classList.add('hidden');

    const alert = $id('inst-form-alert');
    if (alert) { alert.textContent = ''; alert.classList.add('hidden'); }

    const modal = $id('instructor-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeInstructorModal() {
    const modal = $id('instructor-modal');
    if (modal) modal.classList.add('hidden');
    editingInstructorId = null;
}

function _showInstAlert(msg) {
    const el = $id('inst-form-alert');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
}

async function saveInstructor() {
    const fullName = getValue('inst-fullname').trim();
    const username = getValue('inst-username').trim();
    const email = getValue('inst-email').trim();
    const password = getValue('inst-password').trim();
    const confirm = getValue('inst-confirm-password').trim();
    const status = getValue('inst-status') || 'active';

    const alertEl = $id('inst-form-alert');
    if (alertEl) { alertEl.textContent = ''; alertEl.classList.add('hidden'); }

    // Validate required fields
    if (!fullName) { _showInstAlert('Full Name is required.'); return; }
    if (!username) { _showInstAlert('Username is required.'); return; }
    if (!email) { _showInstAlert('Email is required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { _showInstAlert('Enter a valid email address.'); return; }

    const allUsers = cachedUsers.length ? cachedUsers : await refreshUsers();

    // Duplicate check
    const dupUser = allUsers.find(u => (u.username || '').toLowerCase() === username.toLowerCase() && u.id !== editingInstructorId && u._docId !== editingInstructorId);
    if (dupUser) { _showInstAlert('Username is already taken. Choose another.'); return; }

    const dupEmail = allUsers.find(u => (u.email || '').toLowerCase() === email.toLowerCase() && u.id !== editingInstructorId && u._docId !== editingInstructorId);
    if (dupEmail) { _showInstAlert('Email is already registered to another account.'); return; }

    try {
        if (editingInstructorId) {
            // Edit mode
            const user = allUsers.find(u => u.id === editingInstructorId || u._docId === editingInstructorId);
            if (!user) { _showInstAlert('Instructor not found.'); return; }
            await dbUpdate(usersRef, user._docId || user.id, { fullName, username, email, status, role: 'instructor' });
            showToast('Instructor updated successfully.', 'success');
        } else {
            // Add mode — password required
            if (!password) { _showInstAlert('Password is required.'); return; }
            if (password.length < 6) { _showInstAlert('Password must be at least 6 characters long.'); return; }
            if (password !== confirm) { _showInstAlert('Passwords do not match.'); return; }

            const newId = 'u_inst_' + Date.now();
            const creatorId = currentUser ? (currentUser.id || currentUser._docId || 'u1') : 'u1';
            await dbSet(usersRef, newId, {
                _docId: newId,
                id: newId,
                fullName,
                username,
                email,
                password,
                role: 'instructor',
                status,
                createdAt: new Date().toISOString(),
                lastLogin: null,
                createdBy: creatorId
            });
            showToast('Instructor account created successfully.', 'success');
        }
        closeInstructorModal();
        await loadUsers();
    } catch (err) {
        console.error('[Instructor] saveInstructor error:', err);
        _showInstAlert(editingInstructorId ? 'Unable to update Instructor.' : 'Unable to add Instructor.');
    }
}

// ── View Instructor Detail ───────────────────────────────────

async function viewInstructor(id) {
    const allUsers = cachedUsers.length ? cachedUsers : await refreshUsers();
    const user = allUsers.find(u => u.id === id);
    if (!user) return;

    // Update all fields in the detail modal
    setText('idm-name', user.fullName || 'N/A');
    setText('idm-username', '@' + (user.username || 'N/A'));
    setText('idm-email', user.email || 'N/A');

    const roleEl = $id('idm-role');
    if (roleEl) roleEl.innerHTML = `<span class="badge badge-instructor" style="font-size:0.75rem">INSTRUCTOR</span>`;

    const statusEl = $id('idm-status');
    if (statusEl) {
        if (user.status === 'active') {
            statusEl.innerHTML = `<span class="badge badge-active" style="font-size:0.75rem">ACTIVE</span>`;
        } else if (user.status === 'archived') {
            statusEl.innerHTML = `<span class="badge badge-archived" style="font-size:0.75rem">ARCHIVED</span>`;
        } else {
            statusEl.innerHTML = `<span class="badge badge-inactive" style="font-size:0.75rem">INACTIVE</span>`;
        }
    }

    setText('idm-date-added', user.createdAt ? _fmtDate(user.createdAt) : 'N/A');
    setText('idm-last-login', user.lastLogin ? _fmtDate(user.lastLogin) : 'N/A');

    // Compute totals from live data
    const students = (cachedUsers.length ? cachedUsers : await refreshUsers()).filter(u => u.role === 'student' && u.instructorId === id);
    const exercises = await refreshExercises();
    const activity = cachedActivity.length ? cachedActivity : await dbGetAll(activityRef);

    setText('idm-students', String(students.length));
    setText('idm-exercises', String(exercises.length));
    setText('idm-submissions', String(activity.filter(a => {
        const sid = students.map(s => s.id);
        return sid.some(sid => a.studentId === students.find(s => s.id === sid)?.studentId);
    }).length || activity.length));

    const modal = $id('instructor-detail-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeInstructorDetailModal() {
    const modal = $id('instructor-detail-modal');
    if (modal) modal.classList.add('hidden');
}

// ── Status Toggle with Confirmation ─────────────────────────

async function confirmToggleInstructorStatus(id) {
    const user = allCachedInstructors.find(u => u.id === id);
    if (!user) return;
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    const action = newStatus === 'inactive' ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} ${user.fullName}?\n\n${newStatus === 'inactive' ? 'They will not be able to log in.' : 'They will be able to log in again.'}`)) return;
    try {
        await dbUpdate(usersRef, user._docId, { status: newStatus });
        showToast(`Instructor status updated to ${newStatus} successfully.`, 'success');
        await loadUsers();
    } catch (err) {
        console.error('[Instructor] Toggle status error:', err);
        showToast('Unable to update instructor status.', 'error');
    }
}

// ── Archive & Restore Instructor (Soft-Delete) ───────────────

function openArchiveInstructorModal(id) {
    if (id === currentUser?.id) {
        showToast('You cannot archive your own account.', 'error');
        return;
    }
    pendingArchiveInstructorId = id;
    const user = allCachedInstructors.find(u => u.id === id || u._docId === id) || cachedUsers.find(u => u.id === id);
    setText('archive-instructor-name', user ? user.fullName : 'this instructor');
    const modal = $id('archive-instructor-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeArchiveInstructorModal() {
    const modal = $id('archive-instructor-modal');
    if (modal) modal.classList.add('hidden');
    pendingArchiveInstructorId = null;
}

async function executeArchiveInstructor() {
    if (!pendingArchiveInstructorId) {
        closeArchiveInstructorModal();
        return;
    }
    const id = pendingArchiveInstructorId;
    if (id === currentUser?.id) {
        showToast('You cannot archive your own account.', 'error');
        closeArchiveInstructorModal();
        return;
    }
    try {
        const allUsers = cachedUsers.length ? cachedUsers : await refreshUsers();
        const user = allUsers.find(u => u.id === id || u._docId === id);
        if (!user) {
            showToast('Instructor not found.', 'error');
            closeArchiveInstructorModal();
            return;
        }
        await dbUpdate(usersRef, user._docId || user.id, { status: 'archived' });
        showToast(`Instructor ${user.fullName} has been archived.`, 'info');
        closeArchiveInstructorModal();
        await loadUsers();
    } catch (err) {
        console.error('[Instructor] Archive error:', err);
        showToast('Failed to archive instructor.', 'error');
    }
}

function openRestoreInstructorModal(id) {
    pendingRestoreInstructorId = id;
    const user = allCachedInstructors.find(u => u.id === id || u._docId === id) || cachedUsers.find(u => u.id === id);
    setText('restore-instructor-name', user ? user.fullName : 'this instructor');
    const modal = $id('restore-instructor-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeRestoreInstructorModal() {
    const modal = $id('restore-instructor-modal');
    if (modal) modal.classList.add('hidden');
    pendingRestoreInstructorId = null;
}

async function executeRestoreInstructor() {
    if (!pendingRestoreInstructorId) {
        closeRestoreInstructorModal();
        return;
    }
    const id = pendingRestoreInstructorId;
    try {
        const allUsers = cachedUsers.length ? cachedUsers : await refreshUsers();
        const user = allUsers.find(u => u.id === id || u._docId === id);
        if (!user) {
            showToast('Instructor not found.', 'error');
            closeRestoreInstructorModal();
            return;
        }
        await dbUpdate(usersRef, user._docId || user.id, { status: 'active' });
        showToast(`Instructor ${user.fullName} has been restored to Active status.`, 'success');
        closeRestoreInstructorModal();
        await loadUsers();
    } catch (err) {
        console.error('[Instructor] Restore error:', err);
        showToast('Failed to restore instructor.', 'error');
    }
}

async function loadStudents() {
    const users = await refreshUsers();
    const isDefaultInst = !currentUser || currentUser.id === 'u2' || currentUser._docId === 'u2';
    const students = users.filter(u => u.role === 'student' && (
        u.instructorId === currentUser?.id ||
        u.instructorId === currentUser?._docId ||
        (isDefaultInst && (!u.instructorId || u.instructorId === 'u2'))
    ));
    const tbody = $id('students-table-body');

    setText('stat-student-total', String(students.length));
    setText('stat-student-active', String(students.filter(u => u.status === 'active').length));
    setText('stat-student-inactive', String(students.filter(u => u.status === 'inactive').length));
    refreshIcons($id('page-manage-students'));

    if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--text-muted)">No students enrolled under your class yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = students.map(u => `
    <tr>
      <td><div class="user-cell"><div class="avatar-sm">{{ui:UserRound}}</div><div><div style="font-weight:600;color:var(--text-primary)">${u.fullName}</div><div style="font-size:0.75rem;color:var(--text-muted)">@${u.username}</div></div></div></td>
      <td>${u.studentId || '—'}</td>
      <td><span class="badge ${u.status === 'active' ? 'badge-active' : 'badge-inactive'}">${u.status}</span></td>
      <td><div style="display:flex;gap:0.5rem">
        <button class="btn btn-ghost btn-sm" onclick="editUser('${u.id}')" title="Edit">{{ui:Pencil}}</button>
        <button class="btn btn-ghost btn-sm" onclick="toggleUserStatus('${u.id}')" title="${u.status === 'active' ? 'Deactivate' : 'Activate'}">${u.status === 'active' ? '{{ui:LockKeyhole}}' : '{{ui:LockKeyholeOpen}}'}</button>
        <button class="btn btn-ghost btn-sm" onclick="deleteUser('${u.id}')" title="Delete">{{ui:Trash2}}</button>
      </div></td>
    </tr>`).join('');
}

// resetStudentPassword() was removed for security.
// Instructors must use the Password Recovery workflow instead:
// navigateTo('password-recovery') → Approve Request → Student resets own password.


async function toggleUserStatus(id) {
    try {
        const user = cachedUsers.find(u => u.id === id);
        if (!user) return;
        const newStatus = user.status === 'active' ? 'inactive' : 'active';
        await dbUpdate(usersRef, user._docId, { status: newStatus });
        showToast(`Status for ${user.fullName} is now ${newStatus}.`, 'success');
        if (currentUser.role === 'admin') {
            await loadUsers();
        } else if (currentUser.role === 'instructor') {
            await loadStudents();
        }
    } catch (err) {
        console.error('[User Management] Toggle status error:', err);
        showToast('Failed to toggle user status.', 'error');
    }
}

async function openUserModal(id = null) {
    editingUserId = id;
    const modal = $id('user-modal');
    const title = $id('user-modal-title');
    const roleGroup = $id('user-role-group');
    if (!modal || !title) return;

    if (currentUser.role === 'admin') {
        setValue('user-role-select', 'instructor');
        if (roleGroup) roleGroup.classList.add('hidden');
    } else if (currentUser.role === 'instructor') {
        setValue('user-role-select', 'student');
        if (roleGroup) roleGroup.classList.add('hidden');
    } else {
        if (roleGroup) roleGroup.classList.remove('hidden');
    }

    if (id) {
        const users = cachedUsers.length ? cachedUsers : await refreshUsers();
        const user = users.find(u => u.id === id);
        if (user) {
            title.textContent = currentUser.role === 'admin' ? 'Edit Instructor' : (currentUser.role === 'instructor' ? 'Edit Student' : 'Edit User');
            setValue('user-fullname', user.fullName);
            setValue('user-username', user.username);
            setValue('user-email', user.email);
            setValue('user-password', user.password);
            setValue('user-role-select', user.role);
            const pwGroup = $id('user-password-group');
            if (pwGroup) pwGroup.classList.add('hidden');
        }
    } else {
        title.textContent = currentUser.role === 'admin' ? 'Add New Instructor' : (currentUser.role === 'instructor' ? 'Add New Student' : 'Add New User');
        setValue('user-fullname', '');
        setValue('user-username', '');
        setValue('user-email', '');
        setValue('user-password', '');
        if (currentUser.role === 'admin') {
            setValue('user-role-select', 'instructor');
        } else if (currentUser.role === 'instructor') {
            setValue('user-role-select', 'student');
        } else {
            setValue('user-role-select', 'student');
        }
        const pwGroup = $id('user-password-group');
        if (pwGroup) pwGroup.classList.remove('hidden');
    }
    modal.classList.remove('hidden');
}

function closeUserModal() {
    const modal = $id('user-modal');
    if (modal) modal.classList.add('hidden');
    editingUserId = null;
}

async function saveUser() {
    const fullName = getValue('user-fullname').trim();
    const username = getValue('user-username').trim();
    const email = getValue('user-email').trim();
    const password = getValue('user-password').trim();
    let role = getValue('user-role-select');

    if (currentUser.role === 'admin') {
        role = 'instructor';
    } else if (currentUser.role === 'instructor') {
        role = 'student';
    }

    if (!fullName || !username || !email || (!editingUserId && !password)) { showToast('Please fill in all required fields.', 'error'); return; }

    try {
        const users = cachedUsers.length ? cachedUsers : await refreshUsers();
        const dup = users.find(u => u.username === username && u.id !== editingUserId);
        if (dup) { showToast('Username already exists!', 'error'); return; }

        if (editingUserId) {
            const user = users.find(u => u.id === editingUserId);
            if (user) {
                const updateData = { fullName, username, email, role };
                await dbUpdate(usersRef, user._docId, updateData);
            }
            showToast('User updated successfully!', 'success');
        } else {
            const newId = 'u' + Date.now();
            const userData = {
                id: newId,
                fullName,
                username,
                email,
                password,
                role,
                status: 'active',
                createdBy: currentUser.id
            };
            if (currentUser.role === 'instructor') {
                userData.instructorId = currentUser.id;
            }
            await dbSet(usersRef, newId, userData);
            showToast('User created successfully!', 'success');
        }
        closeUserModal();
        if (currentUser.role === 'admin') {
            await loadUsers();
        } else if (currentUser.role === 'instructor') {
            await loadStudents();
        }
    } catch (err) {
        console.error('[Offline Database] Save user error:', err);
        showToast('Failed to save user.', 'error');
    }
}

function editUser(id) { openUserModal(id); }

async function deleteUser(id) {
    if (!confirm('Delete this user?')) return;
    if (id === currentUser?.id) { showToast('You cannot delete your own account!', 'error'); return; }
    try {
        const user = cachedUsers.find(u => u.id === id);
        if (user) await dbDelete(usersRef, user._docId);
        showToast('User deleted.', 'info');
        if (currentUser.role === 'admin') {
            await loadUsers();
        } else if (currentUser.role === 'instructor') {
            await loadStudents();
        }
    } catch (err) {
        console.error('[Offline Database] Delete user error:', err);
        showToast('Failed to delete user.', 'error');
    }
}


/* ============================================================
   ANALYTICS (Instructor)
   ============================================================ */

let cachedInstructorActivity = [];
let currentFilteredActivity = [];
let analyticsCurrentPage = 1;
const analyticsPageSize = 5;

async function loadAnalytics() {
    cachedActivity = await refreshActivity();
    cachedUsers = await refreshUsers();
    cachedExercises = await refreshExercises();

    const isDefaultInst = !currentUser || currentUser.id === 'u2' || currentUser._docId === 'u2';
    const myStudents = cachedUsers.filter(u => u.role === 'student' && (
        u.instructorId === currentUser?.id ||
        u.instructorId === currentUser?._docId ||
        (isDefaultInst && (!u.instructorId || u.instructorId === 'u2'))
    ));
    const myExercises = cachedExercises.filter(e =>
        e.createdBy === currentUser?.id ||
        e.createdBy === currentUser?._docId ||
        e.instructorId === currentUser?.id ||
        e.instructorId === currentUser?._docId ||
        (isDefaultInst && (e._docId || '').startsWith('algo_'))
    );

    const myStudentIds = new Set(myStudents.map(s => s.id || s._docId));
    const myStudentEnrolledIds = new Set(myStudents.map(s => s.studentId).filter(Boolean));
    const myStudentUsernames = new Set(myStudents.map(s => s.username).filter(Boolean));
    const myStudentNames = new Set(myStudents.map(s => s.fullName).filter(Boolean));
    const myExerciseTitles = new Set(myExercises.map(e => e.title).filter(Boolean));

    cachedInstructorActivity = cachedActivity.filter(a => {
        if (a.instructorId && (a.instructorId === currentUser?.id || a.instructorId === currentUser?._docId)) return true;
        if (a.studentId && (myStudentIds.has(a.studentId) || myStudentEnrolledIds.has(a.studentId))) return true;
        if (a.username && myStudentUsernames.has(a.username)) return true;
        if (a.student && myStudentNames.has(a.student)) return true;
        if (a.exercise && myExerciseTitles.has(a.exercise)) return true;
        if (isDefaultInst && (a._docId || '').startsWith('act_sp_')) return true;
        return false;
    });

    if (!cachedInstructorActivity || cachedInstructorActivity.length === 0) {
        cachedInstructorActivity = typeof getInitialSeedActivity === 'function' ? getInitialSeedActivity() : [...cachedActivity];
    } else if (isDefaultInst && typeof getInitialSeedActivity === 'function') {
        // Always ensure the full rich demo activity is included for the default instructor
        const seedRecords = getInitialSeedActivity();
        const existingIds = new Set(cachedInstructorActivity.map(a => a._docId));
        const missingSeeds = seedRecords.filter(s => !existingIds.has(s._docId));
        if (missingSeeds.length > 0) {
            cachedInstructorActivity = [...cachedInstructorActivity, ...missingSeeds];
        }
    }

    currentFilteredActivity = [...cachedInstructorActivity];

    // Set default filter values
    const searchEl = $id('filter-search');
    const dateEl = $id('filter-date');
    const monthEl = $id('filter-month');
    const weekEl = $id('filter-week');
    const statusEl = $id('filter-submission');

    if (searchEl) searchEl.value = '';
    if (dateEl) dateEl.value = '';
    if (monthEl) monthEl.value = '';
    if (weekEl) weekEl.value = '';
    if (statusEl) statusEl.value = '';

    analyticsCurrentPage = 1;
    updateWeekDropdownLabels();
    applyAnalyticsFilters();
}

function analyticsGoToPage(pageNum) {
    analyticsCurrentPage = pageNum;
    renderFilteredActivityTable(currentFilteredActivity);
}

function updateWeekDropdownLabels() {
    const monthSelect = $id('filter-month');
    const weekSelect = $id('filter-week');
    if (!weekSelect) return;

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const selectedMonth = monthSelect && monthSelect.value !== '' ? parseInt(monthSelect.value) : new Date().getMonth();
    const mName = monthNames[selectedMonth] || 'Aug';

    const currentVal = weekSelect.value || '';
    weekSelect.innerHTML = `
        <option value="">All Weeks</option>
        <option value="1">Week 1 (${mName} 1 – ${mName} 3)</option>
        <option value="2">Week 2 (${mName} 4 – ${mName} 10)</option>
        <option value="3">Week 3 (${mName} 11 – ${mName} 17)</option>
        <option value="4">Week 4 (${mName} 18 – ${mName} 24)</option>
        <option value="5">Week 5 (${mName} 25 – ${mName} 31)</option>
    `;
    weekSelect.value = currentVal;
}

function applyAnalyticsFilters() {
    const searchVal = ($id('filter-search')?.value || '').toLowerCase().trim();
    const dateVal = $id('filter-date')?.value || '';
    const monthVal = $id('filter-month')?.value ?? '';
    const weekVal = $id('filter-week')?.value || '';
    const submissionVal = $id('filter-submission')?.value || '';

    updateWeekDropdownLabels();

    const sourceActivity = cachedInstructorActivity && cachedInstructorActivity.length ? cachedInstructorActivity : cachedActivity;

    currentFilteredActivity = sourceActivity.filter(a => {
        const recordDate = new Date(a.timestamp || a.time);

        // 1. Search — student name, exercise title, student ID, submission ID, username, email
        if (searchVal) {
            const haystack = [
                (a.student || '').toLowerCase(),
                (a.exercise || '').toLowerCase(),
                (a.studentId || '').toLowerCase(),
                (a._docId || '').toLowerCase(),
                (a.username || '').toLowerCase(),
                (a.email || '').toLowerCase()
            ].join(' ');
            if (!haystack.includes(searchVal)) return false;
        }

        // 2. Specific date (YYYY-MM-DD from input[type=date])
        if (dateVal) {
            if (isNaN(recordDate.getTime())) return false;
            const y = recordDate.getFullYear();
            const m = String(recordDate.getMonth() + 1).padStart(2, '0');
            const d = String(recordDate.getDate()).padStart(2, '0');
            const localDateStr = `${y}-${m}-${d}`;
            if (localDateStr !== dateVal) return false;
        }

        // 3. Month (0-indexed)
        if (monthVal !== '') {
            if (isNaN(recordDate.getTime())) return false;
            if (recordDate.getMonth() !== parseInt(monthVal)) return false;
        }

        // 4. Week within month
        if (weekVal !== '') {
            if (isNaN(recordDate.getTime())) return false;
            const dayNum = recordDate.getDate();
            let week = 1;
            if (dayNum >= 4 && dayNum <= 10) week = 2;
            else if (dayNum >= 11 && dayNum <= 17) week = 3;
            else if (dayNum >= 18 && dayNum <= 24) week = 4;
            else if (dayNum > 24) week = 5;

            if (week !== parseInt(weekVal)) return false;
        }

        // 5. Submission status
        if (submissionVal) {
            const normStatus = a.status === 'In Progress' ? 'Pending' : a.status;
            const targetStatus = submissionVal === 'In Progress' ? 'Pending' : submissionVal;
            if (normStatus !== targetStatus && a.status !== submissionVal) return false;
        }

        return true;
    });

    // Update activity chart subtitle label dynamically
    const subLabel = $id('an-chart-sub-label');
    if (subLabel) {
        const weekLabels = {
            '1': 'Week 1 (days 1–3)', '2': 'Week 2 (days 4–10)',
            '3': 'Week 3 (days 11–17)', '4': 'Week 4 (days 18–24)', '5': 'Week 5 (days 25–31)'
        };
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const mIdx = monthVal !== '' ? parseInt(monthVal) : -1;
        const mName = mIdx >= 0 ? monthNames[mIdx] : '';
        if (weekVal && mName) {
            subLabel.textContent = `Shows student submissions for ${mName} ${weekLabels[weekVal] || 'Week ' + weekVal}.`;
        } else if (weekVal) {
            subLabel.textContent = `Shows student submissions for ${weekLabels[weekVal] || 'Week ' + weekVal}.`;
        } else if (mName) {
            subLabel.textContent = `Shows student submissions for ${mName}.`;
        } else if (dateVal) {
            subLabel.textContent = `Shows student submissions for the selected date.`;
        } else {
            subLabel.textContent = 'Shows the number of student submissions based on selected filters.';
        }
    }

    analyticsCurrentPage = 1;
    updateAnalyticsUI();
}

function resetAnalyticsFilters() {
    ['filter-search', 'filter-date', 'filter-month', 'filter-week', 'filter-submission'].forEach(id => {
        const el = $id(id);
        if (el) el.value = '';
    });
    updateWeekDropdownLabels();
    currentFilteredActivity = [...cachedInstructorActivity];
    analyticsCurrentPage = 1;
    updateAnalyticsUI();
}

function updateAnalyticsUI() {
    const total = currentFilteredActivity.length;

    // Stat Cards
    const isDefaultInst = !currentUser || currentUser.id === 'u2' || currentUser._docId === 'u2';
    const myStudents = (cachedUsers || []).filter(u => u.role === 'student' && (
        u.instructorId === currentUser?.id ||
        u.instructorId === currentUser?._docId ||
        (isDefaultInst && (!u.instructorId || u.instructorId === 'u2'))
    ));
    const activeStudents = myStudents.filter(u => u.status === 'active');

    setText('stat-students', String(activeStudents.length));
    setText('stat-submissions', String(total));

    const completed = currentFilteredActivity.filter(a => a.status === 'Completed').length;
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    setText('stat-success-rate', successRate + '%');

    const errCount = currentFilteredActivity.filter(a => a.errorType && a.errorType.trim() !== '').length;
    setText('stat-common-errors', String(errCount));

    // Dynamic Trend Elements
    const stuTrend = $id('stat-students-trend');
    if (stuTrend) {
        stuTrend.innerHTML = activeStudents.length > 0
            ? `<span class="positive">${activeStudents.length} Active</span> <span style="opacity:0.5;font-size:0.65rem;color:var(--text-muted)">enrolled</span>`
            : `<span class="neutral">0 Active</span> <span style="opacity:0.5;font-size:0.65rem;color:var(--text-muted)">enrolled</span>`;
    }
    const subTrend = $id('stat-submissions-trend');
    if (subTrend) {
        subTrend.innerHTML = total > 0
            ? `<span class="positive">${total} total</span> <span style="opacity:0.5;font-size:0.65rem;color:var(--text-muted)">evaluated</span>`
            : `<span class="neutral">0</span> <span style="opacity:0.5;font-size:0.65rem;color:var(--text-muted)">submissions</span>`;
    }
    const succTrend = $id('stat-success-trend');
    if (succTrend) {
        succTrend.innerHTML = total > 0
            ? `<span class="positive">${completed} completed</span> <span style="opacity:0.5;font-size:0.65rem;color:var(--text-muted)">of ${total}</span>`
            : `<span class="neutral">—</span> <span style="opacity:0.5;font-size:0.65rem;color:var(--text-muted)">no submissions</span>`;
    }
    const errTrend = $id('stat-errors-trend');
    if (errTrend) {
        errTrend.innerHTML = errCount > 0
            ? `<span class="negative">${errCount} error${errCount !== 1 ? 's' : ''}</span> <span style="opacity:0.5;font-size:0.65rem;color:var(--text-muted)">recorded</span>`
            : `<span class="positive">0 errors</span> <span style="opacity:0.5;font-size:0.65rem;color:var(--text-muted)">clean code</span>`;
    }

    // Record count label
    const countLabel = $id('activity-count-label');
    if (countLabel) countLabel.textContent = total === 0 ? 'No records' : `${total} record${total !== 1 ? 's' : ''}`;

    // Render Charts
    renderSubmissionActivityChart(currentFilteredActivity);
    renderErrorDistributionChart(currentFilteredActivity);

    // Render Paginated Table
    renderFilteredActivityTable(currentFilteredActivity);
    animateAnalyticsCards();
}

function renderSubmissionActivityChart(filteredActivity) {
    const container = $id('chart-submissions');
    const yAxisContainer = $id('an-bar-y-axis');
    const tooltip = $id('an-bar-tooltip');
    if (!container) return;

    // --- Determine chart period dynamically from filters ---
    const monthVal = $id('filter-month')?.value ?? '';
    const weekVal = $id('filter-week')?.value || '';
    const dateVal = $id('filter-date')?.value || '';
    const viewMode = $id('chart-view-mode')?.value || 'day';

    // Group all filtered activity by date
    const dateMap = {};
    filteredActivity.forEach(a => {
        const d = new Date(a.timestamp || a.time);
        if (isNaN(d.getTime())) return;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!dateMap[key]) dateMap[key] = [];
        dateMap[key].push(a);
    });

    // Derive the chart year from the actual data so bar date keys always
    // line up with the stamped submission dates (not a hardcoded year).
    let chartYear = new Date().getFullYear();
    const chartYears = Object.keys(dateMap).map(k => parseInt(k.split('-')[0], 10)).filter(y => !isNaN(y));
    if (chartYears.length > 0) chartYear = Math.max(...chartYears);

    // Build chart columns based on selected filter context
    let weekDays = [];

    if (viewMode === 'month' || (monthVal !== '' && !weekVal)) {
        // Monthly view: show each week as a bar
        const mIdx = monthVal !== '' ? parseInt(monthVal) : new Date().getMonth();
        const year = chartYear;
        const mName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mIdx];
        const weekRanges = [
            { label: 'Wk 1', start: 1, end: 3, w: 1 },
            { label: 'Wk 2', start: 4, end: 10, w: 2 },
            { label: 'Wk 3', start: 11, end: 17, w: 3 },
            { label: 'Wk 4', start: 18, end: 24, w: 4 },
            { label: 'Wk 5', start: 25, end: 31, w: 5 }
        ];
        weekDays = weekRanges.map(r => {
            let count = 0;
            for (let d = r.start; d <= r.end; d++) {
                const key = `${year}-${String(mIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                count += (dateMap[key] || []).length;
            }
            return { label: r.label, sub: `${mName} ${r.start}–${r.end}`, dateKey: null, weekRange: r, count, active: weekVal === String(r.w) };
        });
    } else {
        // Default: daily view for selected week (or show last 7 unique days if no week)
        let startDay = 4, year = chartYear, mIdx = 7; // default Aug Week 2
        if (monthVal !== '') mIdx = parseInt(monthVal);
        if (weekVal === '1') startDay = 1;
        else if (weekVal === '2') startDay = 4;
        else if (weekVal === '3') startDay = 11;
        else if (weekVal === '4') startDay = 18;
        else if (weekVal === '5') startDay = 25;
        else if (!weekVal && monthVal === '') {
            // No filter: show the 7 contiguous days ending at the most recent date with data
            const allDates = Object.keys(dateMap).sort();
            if (allDates.length > 0) {
                // Find the most recent date, then show 7 days ending there
                const latestDate = new Date(allDates[allDates.length - 1]);
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                const monNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                for (let i = 6; i >= 0; i--) {
                    const d = new Date(latestDate);
                    d.setDate(latestDate.getDate() - i);
                    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    weekDays.push({
                        label: dayNames[d.getDay()],
                        sub: `${monNames[d.getMonth()]} ${d.getDate()}`,
                        dateKey: key,
                        count: (dateMap[key] || []).length,
                        active: false
                    });
                }
            }
        }

        if (weekDays.length === 0) {
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const mName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mIdx];
            for (let i = 0; i < 7; i++) {
                const day = startDay + i;
                const key = `${year}-${String(mIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const d = new Date(key);
                weekDays.push({
                    label: dayNames[d.getDay()],
                    sub: `${mName} ${day}`,
                    dateKey: key,
                    count: (dateMap[key] || []).length,
                    active: dateVal === key
                });
            }
        }
    }

    const dayCounts = weekDays.map(w => w.count !== undefined ? w.count : (dateMap[w.dateKey] || []).length);
    const maxVal = Math.max(...dayCounts, 1);
    const yMax = maxVal <= 5 ? 6 : maxVal <= 10 ? 12 : Math.ceil(maxVal * 1.2);
    const yStep = yMax <= 6 ? 2 : yMax <= 12 ? 2 : Math.ceil(yMax / 6);
    const yLabels = [];
    for (let v = yMax; v >= 0; v -= yStep) yLabels.push(v);
    if (yLabels[yLabels.length - 1] !== 0) yLabels.push(0);

    if (yAxisContainer) {
        yAxisContainer.innerHTML = yLabels.map(v => `<span>${v}</span>`).join('');
    }

    container.innerHTML = weekDays.map((w, idx) => {
        const count = w.count !== undefined ? w.count : (dateMap[w.dateKey] || []).length;
        const heightPct = Math.max((count / yMax) * 100, 3);
        const isHighlighted = w.active;
        return `
            <div class="an-bar-col ${isHighlighted ? 'highlighted' : ''}" data-key="${w.dateKey || ''}" data-idx="${idx}">
                <span class="an-bar-val">${count}</span>
                <div class="an-bar-inner" style="height:${heightPct}%"></div>
                <span class="an-bar-lbl">${w.label}<br><span style="font-size:0.62rem;opacity:0.75">${w.sub}</span></span>
            </div>
        `;
    }).join('');

    animateAnalyticsCharts();

    // Attach Hover and Click Handlers
    container.querySelectorAll('.an-bar-col').forEach((col, idx) => {
        const key = col.getAttribute('data-key');
        const w = weekDays[idx];
        const items = key ? (dateMap[key] || []) : [];

        col.addEventListener('mouseenter', () => {
            if (!tooltip) return;
            const completedCount = items.filter(i => i.status === 'Completed').length;
            const pendingCount = items.filter(i => i.status === 'Pending').length;
            const failedCount = items.filter(i => i.status === 'Failed').length;
            const totalCount = w.count !== undefined ? w.count : items.length;
            const studentNames = Array.from(new Set(items.map(i => i.student))).slice(0, 3);

            const headerText = key
                ? new Date(key + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
                : (w.sub || w.label);

            tooltip.innerHTML = `
                <div class="an-tt-header">${headerText}</div>
                <div class="an-tt-row"><span style="color:#60a5fa;font-weight:700">${totalCount} Submission${totalCount !== 1 ? 's' : ''}</span></div>
                <div class="an-tt-row"><span>Completed:</span> <strong style="color:#34d399">${completedCount}</strong></div>
                <div class="an-tt-row"><span>Pending:</span> <strong style="color:#fbbf24">${pendingCount}</strong></div>
                <div class="an-tt-row"><span>Failed:</span> <strong style="color:#f87171">${failedCount}</strong></div>
                ${studentNames.length > 0 ? `<div class="an-tt-students"><div class="an-tt-st-head">Top Students:</div><div class="an-tt-st-list">• ${studentNames.join('<br>• ')}</div></div>` : ''}
                <div style="font-size:0.68rem;color:#94a3b8;margin-top:0.4rem;font-style:italic">Click to filter table by this period</div>
            `;
            tooltip.classList.remove('hidden');
        });

        col.addEventListener('mousemove', (e) => {
            if (!tooltip) return;
            const cardRect = container.closest('.an-chart-card').getBoundingClientRect();
            tooltip.style.left = `${Math.max(8, Math.min(e.clientX - cardRect.left + 10, cardRect.width - tooltip.offsetWidth - 8))}px`;
            tooltip.style.top = `${Math.max(e.clientY - cardRect.top - 130, 10)}px`;
        });

        col.addEventListener('mouseleave', () => { if (tooltip) tooltip.classList.add('hidden'); });

        col.addEventListener('click', () => {
            if (tooltip) tooltip.classList.add('hidden');
            if (key) {
                const dateInput = $id('filter-date');
                if (dateInput) { dateInput.value = key; applyAnalyticsFilters(); }
                $qs('.an-table-card')?.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
}

function renderErrorDistributionChart(filteredActivity) {
    const chart = $id('an-donut-chart');
    const legend = $id('an-donut-legend');
    const totalEl = $id('an-donut-total');
    if (!chart || !legend) return;

    // Count actual error types from real filtered data
    const errorColorMap = {
        'Syntax Error': '#ef4444',
        'Logic Error': '#f59e0b',
        'Missing END': '#f97316',
        'Indentation Error': '#10b981',
        'Type Error': '#3b82f6',
        'Other': '#8b5cf6'
    };
    const knownTypes = Object.keys(errorColorMap);
    const counts = {};
    knownTypes.forEach(t => counts[t] = 0);

    filteredActivity.forEach(a => {
        if (!a.errorType || a.errorType.trim() === '') return;
        const t = a.errorType.trim();
        if (counts[t] !== undefined) counts[t]++;
        else counts['Other']++;
    });

    const totalErrors = Object.values(counts).reduce((s, v) => s + v, 0);

    // If no errors in filtered set, show a neutral grey ring
    if (totalErrors === 0) {
        if (totalEl) totalEl.textContent = '0';
        chart.style.background = '#1e1e2e';
        legend.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem;padding:0.5rem">No errors in selected period.</div>`;
        return;
    }

    if (totalEl) totalEl.textContent = totalErrors;

    const categories = knownTypes
        .filter(t => counts[t] > 0)
        .map(t => ({
            name: t,
            color: errorColorMap[t],
            count: counts[t],
            pct: Math.round((counts[t] / totalErrors) * 100)
        }));

    // Adjust rounding so percentages sum to 100
    const pctSum = categories.reduce((s, c) => s + c.pct, 0);
    if (pctSum !== 100 && categories.length > 0) {
        categories[0].pct += (100 - pctSum);
    }

    let currentDeg = 0;
    const gradientStops = [];
    const legendItemsHtml = [];

    categories.forEach(cat => {
        const deg = (cat.pct / 100) * 360;
        const nextDeg = currentDeg + deg;
        gradientStops.push(`${cat.color} ${currentDeg.toFixed(1)}deg ${nextDeg.toFixed(1)}deg`);
        currentDeg = nextDeg;
        legendItemsHtml.push(`
            <div class="an-donut-item">
                <div class="an-donut-dot-wrap">
                    <span class="an-donut-dot" style="background:${cat.color}"></span>
                    <span style="font-size:0.8rem;color:var(--text-secondary)">${cat.name}</span>
                </div>
                <span class="an-donut-val" style="font-size:0.8rem;font-weight:700;color:var(--text-primary)">${cat.pct}% <span style="font-weight:400;color:var(--text-muted)">(${cat.count})</span></span>
            </div>
        `);
    });

    chart.style.background = `conic-gradient(${gradientStops.join(', ')})`;
    legend.innerHTML = legendItemsHtml.join('');
}

async function renderActivityTable() { await updateAnalyticsUI(); }

function analyticsPageNav(dir) {
    analyticsCurrentPage += dir;
    renderFilteredActivityTable(currentFilteredActivity);
}

function renderFilteredActivityTable(activityList) {
    const tbody = $id('activity-table-body');
    const pageInfo = $id('an-page-info');
    const prevBtn = $id('an-prev-btn');
    const nextBtn = $id('an-next-btn');
    const pageNumbers = $id('an-page-numbers');
    if (!tbody) return;

    const totalRecords = activityList.length;

    if (totalRecords === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:2.5rem;color:var(--text-muted)">
            <div class="analytics-empty-icon"><i data-lucide="chart-column" aria-hidden="true"></i></div>
            No matching student submissions found for the selected filters.
        </td></tr>`;
        if (pageInfo) pageInfo.textContent = 'Showing 0 of 0 results';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        if (pageNumbers) pageNumbers.innerHTML = '';
        refreshIcons(tbody);
        return;
    }

    const totalPages = Math.ceil(totalRecords / analyticsPageSize);
    if (analyticsCurrentPage > totalPages) analyticsCurrentPage = totalPages;
    if (analyticsCurrentPage < 1) analyticsCurrentPage = 1;

    const startIndex = (analyticsCurrentPage - 1) * analyticsPageSize;
    const endIndex = Math.min(startIndex + analyticsPageSize, totalRecords);
    const pageRecords = activityList.slice(startIndex, endIndex);

    if (pageInfo) pageInfo.textContent = `Showing ${startIndex + 1} to ${endIndex} of ${totalRecords} results`;
    if (prevBtn) prevBtn.disabled = analyticsCurrentPage === 1;
    if (nextBtn) nextBtn.disabled = analyticsCurrentPage === totalPages;

    if (pageNumbers) {
        let numHtml = '';
        for (let i = 1; i <= Math.min(totalPages, 5); i++) {
            numHtml += `<button class="an-page-num-btn ${i === analyticsCurrentPage ? 'active' : ''}" onclick="analyticsGoToPage(${i})">${i}</button>`;
        }
        pageNumbers.innerHTML = numHtml;
    }

    const anStatusBadge = s => {
        const norm = (s || '').toLowerCase();
        if (norm === 'completed') return `<span class="badge-status badge-completed">Completed</span>`;
        if (norm === 'failed') return `<span class="badge-status badge-failed">Failed</span>`;
        if (norm === 'revision requested') return `<span class="badge-status badge-pending">Revision Requested</span>`;
        return `<span class="badge-status badge-pending">Pending</span>`;
    };

    const diffBadge = d => {
        const v = (d || 'moderate').toLowerCase();
        if (v === 'easy') return `<span class="badge-diff badge-easy">Easy</span>`;
        if (v === 'hard') return `<span class="badge-diff badge-hard">Hard</span>`;
        // 'medium' and 'moderate' both display as Moderate
        return `<span class="badge-diff badge-moderate">Moderate</span>`;
    };

    const resultBadge = a => {
        const res = a.result || (a.status === 'Completed' ? 'Success' : a.errorType || 'Pending');
        if (res === 'Success' || res === 'Pass') return `<span class="badge-result badge-result-success">Success</span>`;
        if (res.includes('Syntax')) return `<span class="badge-result badge-result-syntax">Syntax Error</span>`;
        if (res.includes('Logic')) return `<span class="badge-result badge-result-logic">Logic Error</span>`;
        if (res.includes('Runtime')) return `<span class="badge-result badge-result-runtime">Runtime Error</span>`;
        if (res === 'Pending') return `<span class="badge-result badge-result-pending">Pending</span>`;
        return `<span class="badge-result badge-result-syntax">${res}</span>`;
    };

    const scoreColor = a => {
        if (a.status === 'Completed') return 'var(--success)';
        if (a.status === 'Failed') return 'var(--danger)';
        return 'var(--text-muted)';
    };

    tbody.innerHTML = pageRecords.map(a => {
        const d = new Date(a.timestamp || a.time);
        const dateStr = !isNaN(d.getTime())
            ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
            '  ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
            : (a.time || '—');

        const docId = (a._docId || '').replace(/'/g, "\\'");

        return `
        <tr>
          <td>
            <div class="an-user-cell">
              <div class="an-avatar-sm">{{ui:UserRound}}</div>
              <span class="an-user-name">${a.student || '—'}</span>
            </div>
          </td>
          <td class="an-cell-muted an-cell-mono">${a.studentId || '—'}</td>
          <td class="an-cell-secondary">${a.exercise || '—'}</td>
          <td>${diffBadge(a.difficulty)}</td>
          <td>${anStatusBadge(a.status)}</td>
          <td class="an-cell-score" style="color:${scoreColor(a)}">${a.score || '—'}</td>
          <td class="an-cell-muted">${dateStr}</td>
          <td class="an-cell-muted">${a.processingTime || '—'}</td>
          <td>${resultBadge(a)}</td>
          <td>
                        <button class="an-eye-btn" title="View Details" onclick="viewSubmissionDetail('${docId}')">
                            <i data-lucide="eye" aria-hidden="true"></i>
            </button>
          </td>
        </tr>`;
    }).join('');
    refreshIcons(tbody);
}

let activeSubmissionDetailId = null;
let pendingResubmissionId = null;

function viewSubmissionDetail(docId) {
    activeSubmissionDetailId = docId;
    const a = cachedActivity.find(x => x._docId === docId);
    if (!a) { showToast('Record not found.', 'error'); return; }

    const d = new Date(a.timestamp || a.time);
    const dateStr = !isNaN(d.getTime())
        ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) +
        ' at ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        : (a.time || '—');

    // Info fields
    setText('sdm-student', a.student || '—');
    setText('sdm-student-id', a.studentId || '—');
    setText('sdm-exercise', a.exercise || '—');
    setText('sdm-date', dateStr);
    setText('sdm-proc-time', a.processingTime || '—');
    setText('sdm-score', a.score || '—');

    // Difficulty badge
    const diff = (a.difficulty || 'moderate').toLowerCase();
    const dColor = diff === 'easy' ? 'var(--success)' : diff === 'hard' ? 'var(--danger)' : 'var(--warning)';
    setHtml('sdm-difficulty', `<span style="font-weight:600;color:${dColor};text-transform:capitalize">${diff.charAt(0).toUpperCase() + diff.slice(1)}</span>`);

    // Status badge
    const statusBadges = {
        'Completed': '<span class="badge badge-active">Completed</span>',
        'In Progress': '<span class="badge badge-student">In Progress</span>',
        'Failed': '<span class="badge badge-inactive">Failed</span>',
        'Revision Requested': '<span class="badge badge-warning">Revision Requested</span>',
    };
    setHtml('sdm-status', statusBadges[a.status] || `<span class="badge">${a.status}</span>`);

    // Score colour
    const scoreEl = $id('sdm-score');
    if (scoreEl) {
        if (a.status === 'Completed') scoreEl.style.color = 'var(--success)';
        else if (a.status === 'Failed') scoreEl.style.color = 'var(--danger)';
        else scoreEl.style.color = 'var(--text-muted)';
    }

    // Error row
    const errRow = $id('sdm-error-row');
    if (a.errorType) {
        setText('sdm-error-type', a.errorType);
        if (errRow) errRow.style.display = 'block';
    } else {
        if (errRow) errRow.style.display = 'none';
    }

    // Code panels
    setText('sdm-pseudo', a.submittedCode || a.pseudocode || '(No pseudocode recorded)');
    setText('sdm-python', a.pythonCode || a.python_code || '(No Python output recorded)');

    // Compiler output panel (if present)
    const outputEl = $id('sdm-output');
    if (outputEl) {
        outputEl.textContent = a.output || a.compilerOutput || (a.status === 'Completed' ? 'Execution successful.' : a.errorType ? `Error: ${a.errorType} during compilation.` : '(No output recorded)');
    }

    const requestButton = $id('sdm-request-resubmit');
    if (requestButton) {
        const ownsSubmission = currentUser?.role === 'instructor' &&
            (!a.instructorId || a.instructorId === currentUser.id || a.instructorId === currentUser._docId);
        requestButton.classList.toggle('hidden', !ownsSubmission || a.status === 'Revision Requested');
        requestButton.disabled = false;
    }

    // Modal title
    const title = $id('sdm-title');
    if (title) title.innerHTML = `${icon('file-text')} ${a.student} — ${a.exercise}`;

    const modal = $id('submission-detail-modal');
    if (modal) {
        modal.classList.remove('hidden');
        refreshIcons(modal);
    }
}

function requestResubmission(docId = activeSubmissionDetailId) {
    if (!docId || currentUser?.role !== 'instructor') return;
    const a = cachedActivity.find(x => x._docId === docId);
    if (!a) { showToast('Submission not found.', 'error'); return; }
    pendingResubmissionId = docId;
    const feedback = $id('resubmission-feedback');
    const error = $id('resubmission-feedback-error');
    if (feedback) feedback.value = '';
    setText('resubmission-feedback-count', '0');
    if (error) error.classList.add('hidden');
    const modal = $id('resubmission-request-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => feedback?.focus(), 0);
}

function closeResubmissionRequest() {
    const modal = $id('resubmission-request-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    }
    pendingResubmissionId = null;
}

async function confirmResubmissionRequest() {
    const docId = pendingResubmissionId;
    if (!docId || currentUser?.role !== 'instructor') return;
    const a = cachedActivity.find(x => x._docId === docId) || await dbGet(activityRef, docId);
    if (!a) { closeResubmissionRequest(); showToast('Submission not found.', 'error'); return; }

    const feedbackEl = $id('resubmission-feedback');
    const errorEl = $id('resubmission-feedback-error');
    const feedback = (feedbackEl?.value || '').trim();
    if (feedback.length > 1000) {
        if (errorEl) {
            errorEl.textContent = 'Feedback must be 1,000 characters or fewer.';
            errorEl.classList.remove('hidden');
        }
        feedbackEl?.focus();
        return;
    }

    const confirmButton = $id('confirm-resubmission-btn');
    if (confirmButton) {
        confirmButton.disabled = true;
        confirmButton.textContent = 'Sending…';
    }
    try {
        const now = new Date().toISOString();
        const instructorId = currentUser._docId || currentUser.id;
        await dbUpdate(activityRef, docId, {
            status: 'Revision Requested',
            reviewStatus: 'revision_requested',
            revisionRequestedAt: now,
            requestedBy: instructorId,
            requestedByName: currentUser.fullName,
            feedback
        });

        const notificationId = 'notif_revision_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        await dbSet(notificationsRef, notificationId, {
            _docId: notificationId,
            studentId: a.studentId || a.studentAccountId,
            accountId: a.studentAccountId || a.studentId,
            exerciseId: a.exerciseId || null,
            submissionId: a._docId,
            exerciseTitle: a.exercise || 'Exercise',
            title: 'Resubmission Requested',
            message: feedback || 'Your instructor requested that you revise and resubmit this activity.',
            type: 'resubmission_requested',
            isRead: false,
            createdAt: now
        });

        const cached = cachedActivity.find(x => x._docId === docId);
        if (cached) Object.assign(cached, {
            status: 'Revision Requested',
            reviewStatus: 'revision_requested',
            feedback,
            revisionRequestedAt: now
        });
        closeResubmissionRequest();
        closeSubmissionDetail();
        showToast('Resubmission requested. The student has been notified.', 'success');
        if (typeof loadAnalytics === 'function') await loadAnalytics();
    } catch (error) {
        console.error('[Review] Resubmission request failed:', error);
        showToast('Unable to request resubmission.', 'error');
    } finally {
        if (confirmButton) {
            confirmButton.disabled = false;
            confirmButton.textContent = 'Request Resubmission';
        }
    }
}

function closeSubmissionDetail() {
    hide('submission-detail-modal');
}

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$id('resubmission-request-modal')?.classList.contains('hidden')) {
        event.preventDefault();
        closeResubmissionRequest();
    }
});


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


/* ============================================================
   ADMIN: PASSWORD CHANGE HISTORY (Read-Only)
   ============================================================ */

async function loadPasswordRequests() {
    const history = await refreshPasswordHistory();

    // Sort by date descending (most recent first)
    const sorted = history.sort((a, b) => (b.changedAt || '').localeCompare(a.changedAt || ''));

    // Update stats
    setText('stat-total-changes', sorted.length);

    const tbody = $id('password-requests-body');

    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:2rem;color:var(--text-muted)">No password changes recorded yet.</td></tr>';
        return;
    }

    tbody.innerHTML = sorted.map(r => `
    <tr>
      <td><div class="user-cell"><div class="avatar-sm">{{ui:UserRound}}</div><div><div style="font-weight:600;color:var(--text-primary)">${r.fullName || 'Unknown'}</div><div style="font-size:0.75rem;color:var(--text-muted)">@${r.username || 'unknown'}</div></div></div></td>
      <td>${r.changedAt || '\u2014'}</td>
      <td><span class="badge badge-approved">{{ui:CircleCheck}} Changed</span></td>
    </tr>`).join('');
}

// No pending badge needed — admin just views history
async function updatePendingRequestsBadge() {
    // Update pending recovery requests badge on instructor nav
    try {
        const requests = await dbGetAll(passwordRequestsRef);
        const pending = requests.filter(r => r.type === 'recovery' && r.status === 'pending');
        const badge = $id('nav-recovery-badge');
        if (badge) {
            badge.textContent = pending.length > 0 ? String(pending.length) : '';
            badge.style.display = pending.length > 0 ? 'inline-flex' : 'none';
        }
    } catch (e) { /* non-critical */ }
}


/* ============================================================
   AUDIT LOG HELPER
   ============================================================ */

/**
 * Records an audit action. NEVER logs passwords or hashes.
 */
async function logAuditAction({ action, studentId, studentName, username, instructorId, instructorName, requestId }) {
    try {
        const logId = 'al_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        await dbSet(auditLogRef, logId, {
            _docId: logId,
            action,
            studentId: studentId || null,
            studentName: studentName || null,
            username: username || null,
            instructorId: instructorId || null,
            instructorName: instructorName || null,
            requestId: requestId || null,
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        console.warn('[Audit] Failed to write audit log:', e);
    }
}


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
          <td><div class="user-cell"><div class="avatar-sm">{{ui:UserRound}}</div><div>
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


/* ============================================================
   STUDENT NOTIFICATION SYSTEM
   ============================================================ */

/**
 * Creates notifications for all enrolled students when an exercise is added or updated.
 */
async function createExerciseNotifications(exerciseId, exerciseTitle, actionType = 'added') {
    try {
        const users = await refreshUsers();
        const isDefaultInst = !currentUser || currentUser.id === 'u2' || currentUser._docId === 'u2';
        const students = users.filter(u => u.role === 'student' && (
            u.instructorId === currentUser?.id ||
            u.instructorId === currentUser?._docId ||
            (isDefaultInst && (!u.instructorId || u.instructorId === 'u2'))
        ));
        if (students.length === 0) return;

        const isAdded = actionType === 'added';
        const title = isAdded ? 'New Exercise Added' : 'Exercise Updated';
        const message = isAdded
            ? `Your instructor added a new exercise: "${exerciseTitle}".`
            : `Your instructor updated this exercise.`;

        const now = new Date().toISOString();

        for (const s of students) {
            const notifId = 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '_' + (s._docId || s.id);
            await dbSet(notificationsRef, notifId, {
                _docId: notifId,
                studentId: s._docId || s.id,
                instructorId: currentUser?.id || currentUser?._docId || 'u2',
                exerciseId: exerciseId,
                exerciseTitle: exerciseTitle,
                title: title,
                message: message,
                type: isAdded ? 'exercise_added' : 'exercise_updated',
                isRead: false,
                createdAt: now
            });
        }

        console.log(`[Notifications] Sent "${title}" notifications to ${students.length} students `);
    } catch (err) {
        console.error('[Notifications] Failed to create notifications:', err);
    }
}

/**
 * Loads and renders notifications for the currently logged-in student.
 */
async function loadStudentNotifications() {
    if (!currentUser || currentUser.role !== 'student') return;

    try {
        const allNotifs = await dbGetAll(notificationsRef);
        const studentId = currentUser._docId || currentUser.id;
        const myNotifs = allNotifs
            .filter(n => n.studentId === studentId || n.studentId === currentUser.id || n.studentId === currentUser._docId || n.accountId === studentId || n.accountId === currentUser.id || n.accountId === currentUser._docId)
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

        const unreadCount = myNotifs.filter(n => !n.isRead).length;

        // Update badge
        const badge = $id('notif-badge');
        if (badge) {
            if (unreadCount > 0) {
                badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }

        // Update unread count in dropdown header
        const countEl = $id('notif-unread-count');
        if (countEl) {
            countEl.textContent = `${unreadCount} unread`;
        }

        // Render notifications list
        const listEl = $id('notif-list');
        if (!listEl) return;

        if (myNotifs.length === 0) {
            listEl.innerHTML = `
                <div class="notif-empty">
                    <div style="font-size:1.75rem; margin-bottom:0.35rem; opacity:0.6;">{{ui:BellOff}}</div>
                    <div style="font-weight:600; color:var(--text-secondary); margin-bottom:0.25rem;">No notifications yet</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">You will be notified when your instructor adds or updates exercises.</div>
                </div>`;
            return;
        }

        listEl.innerHTML = myNotifs.map(n => {
            const dt = n.createdAt
                ? new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : 'Recent';
            const isUnread = !n.isRead;
            return `
                <div class="notif-item ${isUnread ? 'unread' : 'read'}" onclick="handleNotificationClick('${n._docId}', '${n.exerciseId || ''}', '${n.submissionId || ''}')">
                    <div class="notif-item-header">
                        <div class="notif-item-title-row">
                            ${isUnread ? '<span class="notif-unread-dot"></span>' : ''}
                            <strong class="notif-item-title">${n.title || 'New Exercise Added'}</strong>
                        </div>
                        <span class="notif-item-status ${isUnread ? 'unread' : 'read'}">${isUnread ? 'Unread' : 'Read'}</span>
                    </div>
                    <div class="notif-item-ex-title">"${n.exerciseTitle || 'Exercise'}"</div>
                    <div class="notif-item-msg">${n.message || ''}</div>
                    <div class="notif-item-time">{{ui:Calendar}} ${dt} &bull; <span style="font-weight:500;">${isUnread ? 'Unread' : 'Read'}</span></div>
                </div>`;
        }).join('');
    } catch (err) {
        console.error('[Notifications] Failed to load student notifications:', err);
    }
}

/**
 * Toggles the notification dropdown panel.
 */
function toggleNotificationDropdown(event) {
    if (event) event.stopPropagation();
    const dropdown = $id('notif-dropdown');
    if (!dropdown) return;

    const isHidden = dropdown.classList.contains('hidden');
    if (isHidden) {
        dropdown.classList.remove('hidden');
        loadStudentNotifications();
    } else {
        dropdown.classList.add('hidden');
    }
}

/**
 * Handles clicking a notification item: marks as read and navigates to exercise.
 */
async function handleNotificationClick(notifId, exerciseId, submissionId = '') {
    try {
        if (notifId) {
            await dbUpdate(notificationsRef, notifId, { isRead: true });
        }

        // Close dropdown
        const dropdown = $id('notif-dropdown');
        if (dropdown) dropdown.classList.add('hidden');

        // Refresh badge
        await loadStudentNotifications();

        // Navigate to Exercises & Tasks
        navigateTo('exercises-student');

        // If specific exercise is provided, launch it directly for the student
        if (exerciseId) {
            setTimeout(async () => {
                const ex = await dbGet(exercisesRef, exerciseId);
                if (ex) {
                    attemptExercise(exerciseId, submissionId || null);
                }
            }, 200);
        }
    } catch (err) {
        console.error('[Notifications] Error handling notification click:', err);
    }
}

/**
 * Marks all notifications for the current student as read.
 */
async function markAllNotificationsAsRead(event) {
    if (event) event.stopPropagation();
    if (!currentUser || currentUser.role !== 'student') return;

    try {
        const allNotifs = await dbGetAll(notificationsRef);
        const studentId = currentUser._docId || currentUser.id;
        const unread = allNotifs.filter(n =>
            (n.studentId === studentId || n.studentId === currentUser.id || n.studentId === currentUser._docId) && !n.isRead
        );

        for (const n of unread) {
            await dbUpdate(notificationsRef, n._docId, { isRead: true });
        }

        await loadStudentNotifications();
        showToast('All notifications marked as read.', 'info');
    } catch (err) {
        console.error('[Notifications] Failed to mark all as read:', err);
        showToast('Failed to mark notifications as read.', 'error');
    }
}

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
                  <td><div class="user-cell"><div class="avatar-sm">{{ui:UserRound}}</div><div>
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
                  <td><div class="user-cell"><div class="avatar-sm">{{ui:UserRound}}</div>
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

let _adminRecoveryBusy = false;
let _adminRecoveryRejectBusy = false;

async function approveAdminRecoveryRequest() {
    if (_adminRecoveryBusy) return;
    hide('admin-recovery-confirm-dialog');
    if (!currentAdminReviewRequestId) return;

    const approveBtn = $id('admin-recovery-confirm-approve-btn');
    _adminRecoveryBusy = true;
    if (approveBtn) {
        approveBtn.classList.add('is-loading');
        approveBtn.disabled = true;
    }

    try {
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
    } catch (err) {
        console.error('[Recovery] approve error:', err);
        showToast('Failed to approve recovery request. Please try again.', 'error');
    } finally {
        _adminRecoveryBusy = false;
        if (approveBtn) {
            approveBtn.classList.remove('is-loading');
            approveBtn.disabled = false;
        }
    }
}

async function rejectAdminRecoveryRequest() {
    if (_adminRecoveryRejectBusy) return;
    if (!currentAdminReviewRequestId) return;

    const rejectBtn = $id('admin-recovery-reject-btn');
    _adminRecoveryRejectBusy = true;
    if (rejectBtn) {
        rejectBtn.classList.add('is-loading');
        rejectBtn.disabled = true;
    }

    try {
        const req = await dbGet(passwordRequestsRef, currentAdminReviewRequestId);
        if (!req || req.status !== 'pending') {
            showToast('This request is no longer pending.', 'error');
            closeAdminRecoveryReview();
            return;
        }

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
    } catch (err) {
        console.error('[Recovery] reject error:', err);
        showToast('Failed to reject recovery request. Please try again.', 'error');
    } finally {
        _adminRecoveryRejectBusy = false;
        if (rejectBtn) {
            rejectBtn.classList.remove('is-loading');
            rejectBtn.disabled = false;
        }
    }
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


/* ============================================================
   UTILITY FUNCTIONS
   ============================================================ */

function clearEditor() {
    setValue('pseudocode-editor', '');
    setHtml('python-output', '');
    setText('console-output', 'Editor cleared. Ready for new pseudocode.');
    const consoleOutput = $id('console-output');
    if (consoleOutput) consoleOutput.className = 'output-content';
    setText('line-count', '0 lines');
    currentErrorLineNumbers = [];
    updateGutter();
    if (PseudoPyLearning && PseudoPyLearning.register && PseudoPyLearning.register.learningUi) {
        try { PseudoPyLearning.register.learningUi.clearLearningPanel(); } catch (e) { /* non-critical */ }
    }
}

function clearOutput() {
    const consoleOutput = $id('console-output');
    if (consoleOutput) {
        consoleOutput.textContent = 'Output cleared.';
        consoleOutput.className = 'output-content';
    }
}

function copyPython() { copyEditorCode('python-output'); }
function copyTranslateOutput() { copyEditorCode('translate-output'); }
function copyInstructorOutput() { copyEditorCode('instructor-python-output'); }

function copyEditorCode(elementId) {
    const code = getPythonCode(elementId);
    if (!code) { showToast('No code to copy.', 'error'); return; }
    copyText(code);
}

function copyText(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!', 'success');
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Copied to clipboard!', 'success');
    });
}

function downloadPython() {
    const code = getPythonCode('python-output');
    if (!code) { showToast('No code to download.', 'error'); return; }
    const blob = new Blob([code], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pseudopy_output.py';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Python file downloaded!', 'success');
}


/* ============================================================
   PSEUDOCODE SYNTAX VALIDATION ENGINE
   Stack-based strict validation with educational error messages
   ============================================================ */

/**
 * Known pseudocode keywords whitelist.
 * Used to detect typos / unknown keywords.
 */
const KNOWN_KEYWORDS = [
    'BEGIN', 'END', 'SET', 'TO', 'DISPLAY', 'PRINT', 'OUTPUT',
    'IF', 'THEN', 'ELSE', 'END IF', 'ENDIF',
    'FOR', 'EACH', 'IN', 'DO', 'FROM', 'TO', 'END FOR', 'ENDFOR',
    'WHILE', 'END WHILE', 'ENDWHILE',
    'FUNCTION', 'PROCEDURE', 'RETURN', 'CALL', 'END FUNCTION', 'END PROCEDURE',
    'INPUT', 'READ', 'WITH', 'PROMPT',
    'INCREMENT', 'DECREMENT', 'APPEND',
    'AND', 'OR', 'NOT', 'MOD', 'TRUE', 'FALSE', 'NULL',
    'NUMERIC', 'INTEGER', 'FLOAT', 'REAL', 'STRING', 'CHAR', 'CHARACTER', 'BOOLEAN', 'BOOL', 'DECLARE', 'AS'
];

/**
 * Simple Levenshtein distance for typo suggestions
 */
function levenshtein(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b[i - 1] === a[j - 1]) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

/**
 * Suggest a keyword if a typo is detected
 */
function suggestKeyword(word) {
    const upper = word.toUpperCase();
    const displayKeywords = ['DISPLAY', 'PRINT', 'OUTPUT', 'SET', 'IF', 'ELSE', 'FOR', 'WHILE',
        'BEGIN', 'END', 'THEN', 'DO', 'EACH', 'FROM', 'RETURN', 'CALL',
        'FUNCTION', 'PROCEDURE', 'INPUT', 'READ', 'INCREMENT', 'DECREMENT', 'APPEND', 'DECLARE',
        'ENDIF', 'ENDFOR', 'ENDWHILE'];

    let bestMatch = null;
    let bestDist = Infinity;

    for (const kw of displayKeywords) {
        const dist = levenshtein(upper, kw);
        if (dist < bestDist && dist <= 2 && dist > 0) {
            bestDist = dist;
            bestMatch = kw;
        }
    }
    return bestMatch;
}

// ── Preprocessing: Strip Leading Line Numbers ─────────────────
function preprocessPseudocode(code) {
    if (!code) return '';
    return code.split('\n').map(line => {
        // Strip leading line numbers: e.g. "1 BEGIN" -> "BEGIN", "2  PRINT" -> " PRINT"
        return line.replace(/^\s*\d+(?:[.:)]\s*|[ \t]+)(?=[A-Za-z_])/, '');
    }).join('\n');
}

/**
 * Core validation function — strict compiler-like approach.
 * Validates BEFORE any translation occurs.
 * Returns { valid: boolean, errors: [{ line: number, message: string, suggestion?: string }] }
 */
function validatePseudocode(code) {
    const result = compilerEngine.compile(code);
    return { valid: result.valid, errors: result.errors, warnings: result.warnings };
}

function renderHtmlErrors(errors) {
    let output = '<div style="margin-bottom: 0.5rem; font-family: \'JetBrains Mono\', monospace;"><span class="error-text"># {{ui:CircleX}} Syntax Errors Found:</span></div><div><span style="color: var(--text-muted);">#</span></div>';
    for (const err of errors) {
        let suggestionHtml = '';
        if (err.suggestion) {
            suggestionHtml = `<div><span class="suggestion-text">#   {{ui:Lightbulb}} Suggestion: ${err.suggestion}</span></div>`;
        }
        output += `<div style="margin-bottom: 0.5rem; font-family: 'JetBrains Mono', monospace;"><div><span class="error-text"># Line ${err.line}: ${err.message}</span></div>${suggestionHtml}<div><span style="color: var(--text-muted);">#</span></div></div>`;
    }
    output += '<div style="margin-top: 0.5rem; font-family: \'JetBrains Mono\', monospace;"><span class="error-text"># Fix the pseudocode before translation.</span></div>';
    return output;
}

/**
 * Handle updating the visual editor gutter line numbers dynamically.
 */
function updateGutter() {
    const editor = $id('pseudocode-editor');
    const gutter = $id('editor-gutter');
    if (!editor || !gutter) return;

    const linesCount = Math.max(editor.value.split('\n').length, 1);
    gutter.innerHTML = Array.from({ length: linesCount }, (_, index) => {
        const lineNumber = index + 1;
        const errorClass = currentErrorLineNumbers.includes(lineNumber) ? ' error-line' : '';
        return `<div class="gutter-num${errorClass}">${lineNumber}</div>`;
    }).join('');

    // Refresh highlights layer
    updateHighlights();
}

/**
 * Handle updating the visual editor code highlights overlay dynamically.
 */
function updateHighlights() {
    const editor = $id('pseudocode-editor');
    const highlights = $id('editor-highlights');
    if (!editor || !highlights) return;

    highlights.innerHTML = editor.value.split('\n').map((lineText, index) => {
        const displayContainer = lineText === '' ? '&nbsp;' : escapeHtml(lineText);
        const lineNumber = index + 1;
        const errorClass = currentErrorLineNumbers.includes(lineNumber) ? ' error-highlight-line' : '';
        return `<div class="highlight-line${errorClass}">${displayContainer}</div>`;
    }).join('');

    highlights.scrollTop = editor.scrollTop;
    highlights.scrollLeft = editor.scrollLeft;
}

/**
 * Handle updating the visual Python editor gutter line numbers dynamically.
 */
function updatePythonGutter() {
    const editor = $id('python-output');
    const gutter = $id('python-gutter');
    if (!editor || !gutter) return;

    const linesCount = Math.max(editor.value.split('\n').length, 1);
    gutter.innerHTML = Array.from({ length: linesCount }, (_, index) => `<div class="gutter-num">${index + 1}</div>`).join('');

    updatePythonHighlights();
}

/**
 * Handle updating the visual Python editor code highlights overlay dynamically.
 */
function updatePythonHighlights() {
    const editor = $id('python-output');
    const highlights = $id('python-highlights');
    if (!editor || !highlights) return;

    highlights.innerHTML = editor.value.split('\n').map(lineText => {
        const displayContainer = lineText === '' ? '&nbsp;' : escapeHtml(lineText);
        return `<div class="highlight-line">${displayContainer}</div>`;
    }).join('');

    highlights.scrollTop = editor.scrollTop;
    highlights.scrollLeft = editor.scrollLeft;
}

/**
 * Highlight error lines in the editor with a visual indicator.
 * Uses an overlay div to show error markers.
 */
/**
 * Clear error highlighting from the editor.
 */
function clearEditorErrors(editorId) {
    const editor = $id(editorId);
    if (!editor) return;
    editor.classList.remove('has-errors');

    const panel = editor.closest('.editor-panel');
    if (panel) {
        const errorPanel = panel.querySelector('.validation-error-panel');
        if (errorPanel) errorPanel.remove();
    }
}


/* ============================================================
   EDITOR UTILITY FUNCTIONS
   New File, Save
   ============================================================ */

/**
 * New File — clears editor and inserts default template
 */
function newFile() {
    const editor = $id('pseudocode-editor');
    if (editor) editor.value = 'BEGIN\n    // Write your pseudocode here\nEND';
    const pyOutput = $id('python-output');
    if (pyOutput) pyOutput.innerHTML = '';
    const consoleOutput = $id('console-output');
    if (consoleOutput) {
        consoleOutput.textContent = 'New file created. Start writing your pseudocode.';
        consoleOutput.className = 'output-content';
    }
    setText('line-count', '3 lines');
    currentErrorLineNumbers = [];
    clearEditorErrors('pseudocode-editor');
    updateGutter();

    const runBtn = $qs('#page-write-pseudocode .btn-success');
    if (runBtn) runBtn.disabled = false;

    showToast('New file created with template.', 'info');
}

/**
 * Save pseudocode as a .txt file
 */
function savePseudocodeAsFile() {
    const code = getValue('pseudocode-editor');
    if (!code.trim()) { showToast('Nothing to save. Write some pseudocode first.', 'error'); return; }
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pseudocode.txt';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Pseudocode saved as file!', 'success');
}




/* ============================================================
   REAL-TIME VALIDATION (Bonus)
   Debounced validation while typing
   ============================================================ */

let validationTimer = null;

function setupRealtimeValidation() {
    const editor = $id('pseudocode-editor');
    if (!editor) return;

    // Real-time validation runs silently — errors only shown on Translate
    editor.addEventListener('input', () => {
        clearTimeout(validationTimer);
        validationTimer = setTimeout(() => {
            const code = editor.value.trim();
            if (!code) return;
            // Silent validation — no visual indicators in the editor
            // Errors are only shown in Python Output when user clicks Translate
        }, 1000);
    });
}


/* ============================================================
   PSEUDOPY LEARNING LAYER — Shared Types & Constants
   ------------------------------------------------------------
   Structured, deterministic model used by the validation engine,
   pattern detector, feedback clustering, evidence store and the
   instructor analytics. No AI / ML — every field is produced by
   rule-based analysis of the compiler's AST, tokens or messages.

   TypeScript is not used in this project, so the JSDoc typedefs
   below are the canonical shape contract. All objects produced
   by this layer are plain, serializable data (safe to store).
   ============================================================ */

/**
 * Namespace object for the PseudoPy learning layer.
 * All learning modules register factories and analysis functions
 * onto this object instead of polluting the global scope.
 */
const PseudoPyLearning = { version: '1.0.0' };

// Also expose on globalThis so tests, devtools and other classic-script
// files can reach the namespace without relying on lexical scoping rules.
if (typeof globalThis !== 'undefined') { globalThis.PseudoPyLearning = PseudoPyLearning; }

/**
 * Severity levels used across every learning result.
 * Ordered weakest → strongest for clustering/ordering.
 * @readonly @enum {string}
 */
PseudoPyLearning.SEVERITY = Object.freeze({
    SUCCESS: 'success',
    SUGGESTION: 'suggestion',
    WARNING: 'warning',
    ERROR: 'error'
});

PseudoPyLearning.SEVERITY_ORDER = Object.freeze([
    PseudoPyLearning.SEVERITY.SUCCESS,
    PseudoPyLearning.SEVERITY.SUGGESTION,
    PseudoPyLearning.SEVERITY.WARNING,
    PseudoPyLearning.SEVERITY.ERROR
]);

/**
 * Fine-grained kind of a result. Used for evidence + gap analytics.
 * @readonly @enum {string}
 */
PseudoPyLearning.RESULT_TYPE = Object.freeze({
    SYNTAX: 'syntax',
    STRUCTURE: 'structure',
    LOGIC: 'logic',
    VARIABLE: 'variable',
    IO: 'io',
    PATTERN: 'pattern',
    TRANSLATION: 'translation',
    READABILITY: 'readability',
    BEST_PRACTICE: 'best-practice'
});

/**
 * High-level feedback categories used to cluster results
 * into the collapsible summary shown to students.
 * @readonly @enum {string}
 */
PseudoPyLearning.FEEDBACK_CATEGORY = Object.freeze({
    SYNTAX: 'syntax',
    LOGIC: 'logic',
    STRUCTURE: 'structure',
    PROGRAMMING_PATTERN: 'programming-pattern',
    READABILITY: 'readability',
    TRANSLATION: 'translation',
    BEST_PRACTICES: 'best-practices'
});

/**
 * Programming patterns the pattern detector recognises.
 * @readonly @enum {string}
 */
PseudoPyLearning.PATTERN_TYPE = Object.freeze({
    SEQUENCE: 'sequence',
    SELECTION: 'selection',
    REPETITION: 'repetition',
    COUNTER_CONTROLLED_LOOP: 'counter-controlled-loop',
    SENTINEL_CONTROLLED_LOOP: 'sentinel-controlled-loop',
    ACCUMULATOR: 'accumulator',
    INPUT_PROCESS_OUTPUT: 'input-process-output',
    VALIDATION_LOOP: 'validation-loop',
    NESTED_SELECTION: 'nested-selection',
    NESTED_ITERATION: 'nested-iteration',
    FUNCTION: 'function'
});

/**
 * Learning-gap categories presented to instructors in Phase 8.
 * These are the curriculum dimensions a category level is measured on.
 * @readonly @enum {string}
 */
PseudoPyLearning.GAP_CATEGORY = Object.freeze({
    SYNTAX: 'syntax',
    STRUCTURE: 'structure',
    LOGIC: 'logic',
    LOOP: 'loop',
    CONDITIONAL: 'conditional',
    VARIABLE: 'variable',
    FUNCTION: 'function',
    IO: 'io',
    PATTERN: 'pattern',
    TRANSLATION: 'translation',
    READABILITY: 'readability'
});

/**
 * Human-readable labels + icons for the public enum values.
 * Icons are Lucide icon names (rendered with the icon() helper).
 */
PseudoPyLearning.LABELS = {
    severity: {
        [PseudoPyLearning.SEVERITY.ERROR]: { label: 'Error', icon: 'circle-x' },
        [PseudoPyLearning.SEVERITY.WARNING]: { label: 'Warning', icon: 'triangle-alert' },
        [PseudoPyLearning.SEVERITY.SUGGESTION]: { label: 'Suggestion', icon: 'lightbulb' },
        [PseudoPyLearning.SEVERITY.SUCCESS]: { label: 'Great work', icon: 'circle-check' }
    },
    category: {
        [PseudoPyLearning.FEEDBACK_CATEGORY.SYNTAX]: { label: 'Syntax', icon: 'braces', description: 'Pseudocode must follow the sentence forms the translator understands.' },
        [PseudoPyLearning.FEEDBACK_CATEGORY.LOGIC]: { label: 'Logic', icon: 'brain', description: 'Conditions, calculations and output should describe the intended behaviour.' },
        [PseudoPyLearning.FEEDBACK_CATEGORY.STRUCTURE]: { label: 'Structure', icon: 'layers', description: 'Program blocks (BEGIN/END, IF/ENDIF, loops) must open and close correctly.' },
        [PseudoPyLearning.FEEDBACK_CATEGORY.PROGRAMMING_PATTERN]: { label: 'Programming Pattern', icon: 'puzzle', description: 'Recognised algorithmic structures used to solve the problem.' },
        [PseudoPyLearning.FEEDBACK_CATEGORY.READABILITY]: { label: 'Readability', icon: 'align-left', description: 'Clear indentation, naming and line length make pseudocode easier to follow.' },
        [PseudoPyLearning.FEEDBACK_CATEGORY.TRANSLATION]: { label: 'Translation', icon: 'braces', description: 'Behavior preserved when pseudocode becomes Python code.' },
        [PseudoPyLearning.FEEDBACK_CATEGORY.BEST_PRACTICES]: { label: 'Best Practices', icon: 'award', description: 'Recommended habits that keep programs reliable and easy to maintain.' }
    }
};

/** @typedef {'error'|'warning'|'suggestion'|'success'} LearningSeverity */

/**
 * @typedef {Object} ValidationResult
 * A single structured finding about a pseudocode submission.
 * @property {string} id              Stable unique id.
 * @property {string} type            One of PseudoPyLearning.RESULT_TYPE.
 * @property {LearningSeverity} severity One of PseudoPyLearning.SEVERITY.
 * @property {string} category        One of PseudoPyLearning.FEEDBACK_CATEGORY.
 * @property {string} message         Short headline (one sentence, actionable).
 * @property {string} explanation     Why this matters for learning.
 * @property {number|null} line       Source line the finding refers to (1-based).
 * @property {string} suggestion      Concrete fix the student can apply.
 * @property {string} example         Optional short before/after snippet.
 */

/**
 * @typedef {Object} DetectedPattern
 * @property {string} id
 * @property {string} type            One of PseudoPyLearning.PATTERN_TYPE.
 * @property {string} name            Human-friendly name, e.g. "Accumulator".
 * @property {number} startLine       First line of the pattern block.
 * @property {number} endLine         Last line of the pattern block.
 * @property {string} explanation     What this pattern means / why it is useful.
 * @property {string} pseudocodeSlice Example sourcing lines (display).
 * @property {string} pythonSlice     Generated Python lines (display).
 * @property {number} confidence      1 (fully rule-derived; kept for API stability).
 */

/**
 * @typedef {Object} FeedbackCluster
 * A group of validation results under one category for display.
 * @property {string} category
 * @property {string} label
 * @property {string} icon
 * @property {string} description
 * @property {ValidationResult[]} items
 * @property {number} errorCount
 * @property {number} warningCount
 * @property {number} suggestionCount
 * @property {number} successCount
 */

/**
 * @typedef {Object} TranslationResult
 * Everything produced for a single translate/validate invocation.
 * @property {boolean} valid
 * @property {string} source
 * @property {string} python
 * @property {ValidationResult[]} validation
 * @property {DetectedPattern[]} patterns
 * @property {FeedbackCluster[]} clusters
 * @property {Object} compile            The raw compile() output.
 */

/**
 * @typedef {Object} EvidenceRecord
 * One persisted translation attempt (Phase 6). Derived, never fake.
 * @property {string} _docId
 * @property {string} studentId
 * @property {string} studentAccountId
 * @property {string} instructorId
 * @property {string} section
 * @property {string|null} exerciseId
 * @property {string|null} exercise
 * @property {string} timestamp ISO string.
 * @property {number} attemptNumber Per-student counter for the day.
 * @property {boolean} valid
 * @property {number} errorCount
 * @property {number} warningCount
 * @property {number} suggestionCount
 * @property {Object} errorCategories   category → count.
 * @property {Object} gapCategories     GAP_CATEGORY → error count (Phase 8).
 * @property {string[]} patterns        Detected pattern types.
 * @property {Object} compileMetadata   { complexity, tokenCount, totalTimeMs }
 */

/* ── Small helpers ─────────────────────────────────────────── */

function learningId(prefix) {
    const p = prefix || 'lv';
    return p + '_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
}

function isInEnum(value, enumObj) {
    return typeof value === 'string' && Object.values(enumObj).includes(value);
}

/* ── Factories ─────────────────────────────────────────────── */

function defaultSuggestionForSeverity(severity) {
    switch (severity) {
        case PseudoPyLearning.SEVERITY.SUCCESS: return 'Nothing to change here — keep using this approach.';
        case PseudoPyLearning.SEVERITY.SUGGESTION: return 'Consider applying the suggestion above.';
        case PseudoPyLearning.SEVERITY.WARNING: return 'Review and update the reported line.';
        case PseudoPyLearning.SEVERITY.ERROR:
        default: return 'Fix the reported line before translating again.';
    }
}

function defaultExplanationForCategory(category) {
    const meta = PseudoPyLearning.LABELS.category[category];
    return meta ? meta.description : 'This finding relates to the overall quality of the pseudocode.';
}

/**
 * Create a ValidationResult with validated enums + sane defaults.
 * Unknown enum values are coerced instead of silently accepted,
 * so downstream consumers can always trust the shape & vocabulary.
 * @param {Object} partial
 * @returns {ValidationResult}
 */
function makeValidationResult(partial) {
    const src = partial || {};
    const type = isInEnum(src.type, PseudoPyLearning.RESULT_TYPE) ? src.type : PseudoPyLearning.RESULT_TYPE.SYNTAX;
    const severity = isInEnum(src.severity, PseudoPyLearning.SEVERITY) ? src.severity : PseudoPyLearning.SEVERITY.WARNING;
    const category = isInEnum(src.category, PseudoPyLearning.FEEDBACK_CATEGORY) ? src.category : defaultCategoryForType(type);
    return {
        id: src.id || learningId('vr'),
        type: type,
        severity: severity,
        category: category,
        message: String(src.message || ''),
        explanation: String(src.explanation || defaultExplanationForCategory(category)),
        line: typeof src.line === 'number' ? src.line : null,
        suggestion: String(src.suggestion || defaultSuggestionForSeverity(severity)),
        example: String(src.example || '')
    };
}

/**
 * Map a fine-grained RESULT_TYPE to its FEEDBACK_CATEGORY.
 * @param {string} type
 * @returns {string}
 */
function defaultCategoryForType(type) {
    switch (type) {
        case PseudoPyLearning.RESULT_TYPE.SYNTAX: return PseudoPyLearning.FEEDBACK_CATEGORY.SYNTAX;
        case PseudoPyLearning.RESULT_TYPE.STRUCTURE: return PseudoPyLearning.FEEDBACK_CATEGORY.STRUCTURE;
        case PseudoPyLearning.RESULT_TYPE.LOGIC:
        case PseudoPyLearning.RESULT_TYPE.VARIABLE:
        case PseudoPyLearning.RESULT_TYPE.IO: return PseudoPyLearning.FEEDBACK_CATEGORY.LOGIC;
        case PseudoPyLearning.RESULT_TYPE.PATTERN: return PseudoPyLearning.FEEDBACK_CATEGORY.PROGRAMMING_PATTERN;
        case PseudoPyLearning.RESULT_TYPE.READABILITY: return PseudoPyLearning.FEEDBACK_CATEGORY.READABILITY;
        case PseudoPyLearning.RESULT_TYPE.TRANSLATION: return PseudoPyLearning.FEEDBACK_CATEGORY.TRANSLATION;
        case PseudoPyLearning.RESULT_TYPE.BEST_PRACTICE:
        default: return PseudoPyLearning.FEEDBACK_CATEGORY.BEST_PRACTICES;
    }
}

/**
 * Create a DetectedPattern backed by the AST walker data.
 * @param {Object} partial
 * @returns {DetectedPattern}
 */
function makeDetectedPattern(partial) {
    const src = partial || {};
    const type = isInEnum(src.type, PseudoPyLearning.PATTERN_TYPE) ? src.type : PseudoPyLearning.PATTERN_TYPE.SEQUENCE;
    return {
        id: src.id || learningId('pt'),
        type: type,
        name: String(src.name || src.type || type),
        startLine: typeof src.startLine === 'number' ? src.startLine : 1,
        endLine: typeof src.endLine === 'number' ? src.endLine : (typeof src.startLine === 'number' ? src.startLine : 1),
        explanation: String(src.explanation || ''),
        pseudocodeSlice: String(src.pseudocodeSlice || ''),
        pythonSlice: String(src.pythonSlice || ''),
        confidence: 1
    };
}

/**
 * Create a FeedbackCluster (initial counts are zero; use fold* helpers).
 * @param {string} category
 * @returns {FeedbackCluster}
 */
function makeFeedbackCluster(category) {
    const meta = (PseudoPyLearning.LABELS.category[category] || {});
    return {
        category: category in PseudoPyLearning.LABELS.category ? category : PseudoPyLearning.FEEDBACK_CATEGORY.BEST_PRACTICES,
        label: meta.label || category,
        icon: meta.icon || 'circle-check',
        description: meta.description || '',
        items: [],
        errorCount: 0,
        warningCount: 0,
        suggestionCount: 0,
        successCount: 0
    };
}

/**
 * Plugin registry — lets other modules contribute helpers without
 * depending on file ordering beyond types.js itself.
 */
PseudoPyLearning.register = {};
PseudoPyLearning.types = {
    learningId: learningId,
    isInEnum: isInEnum,
    makeValidationResult: makeValidationResult,
    makeDetectedPattern: makeDetectedPattern,
    makeFeedbackCluster: makeFeedbackCluster,
    defaultCategoryForType: defaultCategoryForType
};/* ============================================================
   PSEUDOPY LEARNING LAYER — Validation Engine
   ------------------------------------------------------------
   Converts the compiler pipeline output (errors + warnings + AST
   + tokens) into a deterministic, structured list of ValidationResult
   objects. Every item carries severity, category, a plain-language
   explanation, a concrete suggestion and an example, so feedback
   can be rendered AND persisted as learning evidence.

   The existing parser / semantic analyzer are NOT modified: we
   classify their output and add educator checks on top.
   ============================================================ */

/**
 * Map a raw compiler error/warning message to a fine-grained RESULT_TYPE.
 * Ordered rule list — the first matching rule wins.
 * @param {string} message
 * @returns {string} A PseudoPyLearning.RESULT_TYPE value.
 */
function classifyCompilerIssue(message) {
    const m = String(message || '').toUpperCase();

    // 1. Block / structure problems (BEGIN/END, IF..ENDIF, loops).
    if (
        m.includes('UNCLOSED') ||
        m.includes('BLOCK MISMATCH') ||
        m.includes('MISSING BEGIN') ||
        m.includes('MISSING END') ||
        m.includes('UNEXPECTED END') ||
        m.includes('END STATEMENT') ||
        m.includes('SENTINEL') ||
        m.includes('REQUIRES IN') ||
        m.includes('REQUIRES FROM') ||
        m.includes('REQUIRES TO') ||
        /STATEMENT MISSING/.test(m)
    ) {
        return PseudoPyLearning.RESULT_TYPE.STRUCTURE;
    }

    // 2. Variable declaration / usage problems.
    if (
        m.includes('DECLARE') ||
        m.includes('UNDECLARED') ||
        m.includes('NOT DECLARED') ||
        m.includes('INCREMENT') ||
        m.includes('DECREMENT')
    ) {
        return PseudoPyLearning.RESULT_TYPE.VARIABLE;
    }

    // 3. Input / output statement problems.
    if (
        m.includes('INPUT') ||
        m.includes('PROMPT') ||
        m.includes(' AFTER READ')
    ) {
        return PseudoPyLearning.RESULT_TYPE.IO;
    }

    // 4. Plain syntax / lexical problems.
    if (
        m.includes('UNRECOGNIZED') ||
        m.includes('UNTERMINATED') ||
        m.includes('UNSUPPORTED CHARACTER') ||
        m.includes('UNEXPECTED TOKEN') ||
        m.includes('MISSING OPERAND') ||
        m.includes('LEADING ZERO') ||
        m.includes('MISSING CLOSING') ||
        m.includes('EXPECTED')
    ) {
        return PseudoPyLearning.RESULT_TYPE.SYNTAX;
    }

    // 5. Leftover textual hints default to syntax.
    return PseudoPyLearning.RESULT_TYPE.SYNTAX;
}

/**
 * Explanations are written to teach, not just restate the problem.
 * @param {string} type RESULT_TYPE value.
 * @param {string} message Original compiler message.
 * @returns {string} Plain-language reason this matters.
 */
function explainIssue(type, message) {
    const m = String(message || '').toUpperCase();
    switch (type) {
        case PseudoPyLearning.RESULT_TYPE.STRUCTURE:
            if (m.includes('BEGIN')) {
                return 'Every pseudocode program opens with a BEGIN statement so the translator knows where the code starts. Without it the compiler cannot build the program structure.';
            }
            if (m.includes('END')) {
                return 'Every block you open (IF, FOR, WHILE, FUNCTION) must be closed. The translator uses these closing lines to understand which statements belong inside the block.';
            }
            if (m.includes('THEN')) {
                return 'An IF statement always needs the sentinel keyword THEN after its condition. It signals that the following indented lines are the true-branch.';
            }
            return 'The structure of the program (how blocks are opened and closed) is not valid. Fix the blocks in the order the error messages describe.';
        case PseudoPyLearning.RESULT_TYPE.VARIABLE:
            if (m.includes('DECLARE') || m.includes('NOT DECLARED')) {
                return 'Declaring variables with DECLARE keeps the translator aware of their type, which produces safer Python code and prevents accidental typos from silently creating new variables.';
            }
            return 'Variables in pseudocode should be declared with DECLARE name AS type before first use so the program behaves predictably.';
        case PseudoPyLearning.RESULT_TYPE.IO:
            return 'INPUT statements read a value, and DISPLAY/PRINT/OUTPUT statements write one. The compiler needs a valid variable name (for INPUT) or expression (for DISPLAY) on these lines.';
        case PseudoPyLearning.RESULT_TYPE.LOGIC:
            return 'The logic of an expression or condition does not describe the intended behaviour. Check the numbers, operators and comparisons on the reported line.';
        case PseudoPyLearning.RESULT_TYPE.TRANSLATION:
            return 'This constructs behaviour in a way that is not reliably preserved when the pseudocode becomes Python. Consider restructuring it.';
        case PseudoPyLearning.RESULT_TYPE.READABILITY:
            return 'Readable pseudocode is reviewed and debugged faster. Small, clear lines beat long, dense ones.';
        case PseudoPyLearning.RESULT_TYPE.SYNTAX:
        default:
            return 'Pseudocode must follow the sentence forms the translator understands. The reported line does not fit any known statement form.';
    }
}

/**
 * Default constructive suggestion for a category.
 * @param {string} type
 * @returns {string}
 */
function suggestionForType(type) {
    switch (type) {
        case PseudoPyLearning.RESULT_TYPE.STRUCTURE: return 'Match every opening block with the correct closing keyword (END IF, END FOR, END WHILE).';
        case PseudoPyLearning.RESULT_TYPE.VARIABLE: return 'Add DECLARE <name> AS <type> before using the variable.';
        case PseudoPyLearning.RESULT_TYPE.IO: return 'Write INPUT <variable> to read, or DISPLAY <expression> to show a result.';
        case PseudoPyLearning.RESULT_TYPE.LOGIC: return 'Re-check the operators, values and conditions on the reported line.';
        case PseudoPyLearning.RESULT_TYPE.TRANSLATION: return 'Rewrite the statement using supported pseudocode forms.';
        case PseudoPyLearning.RESULT_TYPE.READABILITY: return 'Split long lines and use meaningful, short names.';
        case PseudoPyLearning.RESULT_TYPE.SYNTAX:
        default: return 'Consult the syntax guide and correct the reported line.';
    }
}

/**
 * Small illustrative snippet shown with the feedback item.
 * @param {string} type
 * @returns {string}
 */
function exampleForType(type) {
    switch (type) {
        case PseudoPyLearning.RESULT_TYPE.STRUCTURE: return 'END IF, END FOR, END WHILE';
        case PseudoPyLearning.RESULT_TYPE.VARIABLE: return 'DECLARE total AS INTEGER';
        case PseudoPyLearning.RESULT_TYPE.IO: return 'INPUT name\nDISPLAY "Hello", name';
        case PseudoPyLearning.RESULT_TYPE.LOGIC: return 'IF score >= 50 THEN';
        case PseudoPyLearning.RESULT_TYPE.TRANSLATION: return 'Use SET x TO <expression>';
        case PseudoPyLearning.RESULT_TYPE.READABILITY: return 'total = total + item\n(one idea per line)';
        case PseudoPyLearning.RESULT_TYPE.SYNTAX:
        default: return 'SET variable TO value';
    }
}

/**
 * Build a ValidationResult from a single compiler error/warning.
 * @param {Object} issue { line, message, suggestion }
 * @param {boolean} isWarning
 * @returns {ValidationResult}
 */
function resultFromCompilerIssue(issue, isWarning) {
    const message = String((issue && issue.message) || 'An issue was detected in the pseudocode.');
    const type = classifyCompilerIssue(message);
    return makeValidationResult({
        type: type,
        severity: isWarning ? PseudoPyLearning.SEVERITY.WARNING : PseudoPyLearning.SEVERITY.ERROR,
        message: message,
        explanation: explainIssue(type, message),
        line: typeof issue.line === 'number' ? issue.line : null,
        suggestion: (issue && issue.suggestion) || suggestionForType(type),
        example: exampleForType(type)
    });
}

/* ── AST helpers ───────────────────────────────────────────── */

/**
 * Walk the AST to find the maximum block nesting depth.
 * Blocks: IfStatement (elseIfs/elseBody), loops, FunctionDef.
 * @param {Object} ast
 * @returns {number}
 */
function computeAstMaxNesting(ast) {
    let maxDepth = 0;
    function walk(node, depth) {
        if (!node) return;
        if (depth > maxDepth) maxDepth = depth;

        const body = [];
        switch (node.type) {
            case 'Program': node.body.forEach(n => body.push(n)); break;
            case 'IfStatement':
                node.body && node.body.forEach(n => body.push(n));
                if (node.elseIfs) node.elseIfs.forEach(e => e.body && e.body.forEach(n => body.push(n)));
                if (node.elseBody) node.elseBody.forEach(n => body.push(n));
                walkChildren(body, depth + 1);
                return;
            case 'WhileStatement':
            case 'ForStatement':
            case 'ForEachStatement':
                node.body && node.body.forEach(n => body.push(n));
                walkChildren(body, depth + 1);
                return;
            case 'FunctionDef':
                node.body && node.body.forEach(n => body.push(n));
                walkChildren(body, depth + 1);
                return;
            default:
                walkChildren(node.body, depth);
                return;
        }
    }
    function walkChildren(list, depth) {
        (list || []).forEach(n => walk(n, depth));
    }
    walk(ast, 0);
    return maxDepth;
}

/**
 * Count AST nodes and factual composition for positive feedback.
 * @param {Object} ast
 * @returns {{statements:number, declared:number, outputs:number, loops:number, conditionals:number}}
 */
function summarizeAst(ast) {
    const summary = { statements: 0, declared: 0, outputs: 0, loops: 0, conditionals: 0, assigned: 0, inputs: 0, functions: 0 };
    function walk(node) {
        if (!node) return;
        if (Array.isArray(node)) { node.forEach(walk); return; }
        summary.statements++;
        switch (node.type) {
            case 'DeclareStatement': summary.declared++; break;
            case 'AssignmentStatement': summary.assigned++; break;
            case 'PrintStatement': summary.outputs++; break;
            case 'InputStatement': summary.inputs++; break;
            case 'WhileStatement':
            case 'ForStatement':
            case 'ForEachStatement': summary.loops++; break;
            case 'IfStatement': summary.conditionals++; break;
            case 'FunctionDef': summary.functions++; break;
        }
        node.body && walk(node.body);
        if (node.elseIfs) node.elseIfs.forEach(walk);
        if (node.elseBody) walk(node.elseBody);
    }
    if (ast && ast.body) ast.body.forEach(walk);
    return summary;
}

/* ── Educator checks (valid programs only) ─────────────────── */

/**
 * Additional encouraging / advisory results produced for valid code.
 * These reuse the same AST already compiled, so they stay cheap and
 * fully deterministic. Original compiler warnings are NOT repeated.
 * @param {Object} ctx { source, ast, tokens, hasVariableWarnings }
 * @returns {ValidationResult[]}
 */
function runEducationalChecks(ctx) {
    const items = [];
    const source = String(ctx.source || '');
    const lines = source.split('\n');
    const trimmedLines = lines.map(l => l.trim()).filter(l => l.length > 0);
    const summary = summarizeAst(ctx.ast);

    const kwTokens = (ctx.tokens || []).filter(t => (t.type === 'KEYWORD' || t.type === 'keyword')).map(t => String(t.value || '').toUpperCase());

    // 1. Translation success stays encouraging.
    items.push(makeValidationResult({
        type: PseudoPyLearning.RESULT_TYPE.BEST_PRACTICE,
        severity: PseudoPyLearning.SEVERITY.SUCCESS,
        message: 'Your pseudocode is valid and was translated into Python with no syntax errors.',
        explanation: 'The translator successfully understood every statement. Review the generated Python to confirm the behaviour matches your intent.',
        line: null
    }));

    // 2. Explicit typing recommendation (only when not already warned).
    if (!ctx.hasVariableWarnings && summary.statements > 0 && summary.declared === 0 && summary.assigned > 0) {
        items.push(makeValidationResult({
            type: PseudoPyLearning.RESULT_TYPE.BEST_PRACTICE,
            severity: PseudoPyLearning.SEVERITY.SUGGESTION,
            message: 'Consider declaring your variables with DECLARE statements.',
            explanation: 'DECLARE x AS INTEGER records the type of each variable, which lets the translator generate safer Python and helps readers understand the data.',
            suggestion: 'Add DECLARE lines before the variables are first assigned.',
            example: 'DECLARE total AS INTEGER'
        }));
    }

    // 3. Output visibility.
    if (summary.outputs > 0) {
        items.push(makeValidationResult({
            type: PseudoPyLearning.RESULT_TYPE.BEST_PRACTICE,
            severity: PseudoPyLearning.SEVERITY.SUCCESS,
            message: 'The program displays its results with DISPLAY/PRINT statements.',
            explanation: 'Showing the outcome (or at least progress) is what makes an algorithm useful to a user.',
            line: null
        }));
    } else if (summary.statements > 0) {
        items.push(makeValidationResult({
            type: PseudoPyLearning.RESULT_TYPE.BEST_PRACTICE,
            severity: PseudoPyLearning.SEVERITY.SUGGESTION,
            message: 'Add DISPLAY statements to show the result of the computation.',
            explanation: 'A program that computes but never shows a result cannot be verified or used by anyone.',
            suggestion: 'Add DISPLAY followed by the variable or expression you want to show.',
            example: 'DISPLAY total'
        }));
    }

    // 4. Indentation / readability.
    const indentedLines = lines.filter(l => l.match(/^\s+/));
    if (indentedLines.length > 0) {
        items.push(makeValidationResult({
            type: PseudoPyLearning.RESULT_TYPE.READABILITY,
            severity: PseudoPyLearning.SEVERITY.SUCCESS,
            message: 'You indented the body of your blocks.',
            explanation: 'Consistent indentation mirrors the Python output and makes the control flow visible at a glance.',
            line: null
        }));
    } else if (lines.length > 3) {
        items.push(makeValidationResult({
            type: PseudoPyLearning.RESULT_TYPE.READABILITY,
            severity: PseudoPyLearning.SEVERITY.SUGGESTION,
            message: 'Indent the statements inside IF/FOR/WHILE blocks.',
            explanation: 'Indentation shows which statements belong to each block — the same indentation that the generated Python will use.',
            suggestion: 'Press Tab or space once inside each block.',
            example: 'WHILE x < n DO\n  x = x + 1\nENDWHILE'
        }));
    }

    // 5. Long lines.
    lines.forEach((raw, idx) => {
        if (raw.length > 72) {
            items.push(makeValidationResult({
                type: PseudoPyLearning.RESULT_TYPE.READABILITY,
                severity: PseudoPyLearning.SEVERITY.SUGGESTION,
                message: 'Line ' + (idx + 1) + ' is ' + raw.length + ' characters long.',
                explanation: 'Long lines are hard to read in an editor and hide their true structure. One idea per line is the pseudocode ideal.',
                suggestion: 'Split the line into smaller steps.',
                line: idx + 1
            }));
        }
    });

    // 6. Nesting depth.
    const maxDepth = computeAstMaxNesting(ctx.ast);
    if (maxDepth > 3) {
        items.push(makeValidationResult({
            type: PseudoPyLearning.RESULT_TYPE.STRUCTURE,
            severity: PseudoPyLearning.SEVERITY.WARNING,
            message: 'Your program nests control blocks ' + maxDepth + ' levels deep.',
            explanation: 'Deeply nested structures are harder to read and debug. Consider extracting a function or simplifying the conditions.',
            suggestion: 'Extract repeated inner logic into a FUNCTION or flatten conditions with AND/OR.',
            line: null
        }));
    } else if (maxDepth > 0) {
        items.push(makeValidationResult({
            type: PseudoPyLearning.RESULT_TYPE.STRUCTURE,
            severity: PseudoPyLearning.SEVERITY.SUCCESS,
            message: 'Nesting depth is ' + maxDepth + ' level(s).',
            explanation: 'Shallow nesting keeps each block easy to follow.',
            line: null
        }));
    }

    // 7. Control flow recognition (positive boosts for later analytics).
    if (summary.loops > 0 && summary.conditionals > 0) {
        items.push(makeValidationResult({
            type: PseudoPyLearning.RESULT_TYPE.LOGIC,
            severity: PseudoPyLearning.SEVERITY.SUCCESS,
            message: 'The program combines loops and conditional branching.',
            explanation: 'Combining repetition with decisions is a core building block of most algorithms.',
            line: null
        }));
    } else if (summary.loops > 0) {
        items.push(makeValidationResult({
            type: PseudoPyLearning.RESULT_TYPE.LOGIC,
            severity: PseudoPyLearning.SEVERITY.SUCCESS,
            message: 'The program repeats work with a loop.',
            explanation: 'A single pass of the block is written once, and the loop controls how many times it runs.',
            line: null
        }));
    }

    return items;
}

/* ── Public API ────────────────────────────────────────────── */

/**
 * Run the full deterministic validation over a compile() result.
 * @param {Object} compileResult Output of PseudocodeCompiler.compile().
 * @param {string} source The original pseudocode text.
 * @returns {{valid:boolean, items:ValidationResult[]}}
 */
function runValidation(compileResult, source) {
    const result = compileResult || {};
    const valid = !!result.valid;
    const items = [];

    const errors = Array.isArray(result.errors) ? result.errors : [];
    const warnings = Array.isArray(result.warnings) ? result.warnings : [];

    errors.forEach(err => items.push(resultFromCompilerIssue(err, false)));
    warnings.forEach(warn => items.push(resultFromCompilerIssue(warn, true)));

    if (valid && errors.length === 0) {
        const hasVariableWarnings = warnings.some(w => {
            const m = String(w.message || '').toUpperCase();
            return m.includes('DECLARE') || m.includes('UNDECLARED') || m.includes('NOT DECLARED');
        });
        items.push(...runEducationalChecks({
            source: source,
            ast: result.ast || null,
            tokens: result.tokens || [],
            hasVariableWarnings: hasVariableWarnings
        }));
    }

    items.sort(compareValidationResults);
    return { valid: valid, items: items };
}

/**
 * Ordering: ERRORs first, then WARNING, SUGGESTION, SUCCESS; by line.
 * @param {ValidationResult} a
 * @param {ValidationResult} b
 * @returns {number}
 */
function compareValidationResults(a, b) {
    const rank = PseudoPyLearning.SEVERITY_ORDER.indexOf(a.severity) - PseudoPyLearning.SEVERITY_ORDER.indexOf(b.severity);
    if (rank !== 0) return rank;
    if (a.line === null && b.line === null) return 0;
    if (a.line === null) return 1;
    if (b.line === null) return -1;
    return a.line - b.line;
}

/**
 * Reduce a ValidationResult[] into compact counts.
 * Used by the evidence store and analytics (Phases 6-9).
 * @param {ValidationResult[]} items
 * @returns {{bySeverity:Object, byCategory:Object, byType:Object}}
 */
function summarizeValidation(items) {
    const bySeverity = {};
    const byCategory = {};
    const byType = {};
    (items || []).forEach(item => {
        bySeverity[item.severity] = (bySeverity[item.severity] || 0) + 1;
        byCategory[item.category] = (byCategory[item.category] || 0) + 1;
        byType[item.type] = (byType[item.type] || 0) + 1;
    });
    return { bySeverity: bySeverity, byCategory: byCategory, byType: byType };
}

/**
 * Map a RESULT_TYPE to the instructor-facing GAP_CATEGORY.
 * @param {string} resultType
 * @returns {string}
 */
function gapCategoryForResultType(resultType) {
    switch (resultType) {
        case PseudoPyLearning.RESULT_TYPE.STRUCTURE: return PseudoPyLearning.GAP_CATEGORY.STRUCTURE;
        case PseudoPyLearning.RESULT_TYPE.VARIABLE: return PseudoPyLearning.GAP_CATEGORY.VARIABLE;
        case PseudoPyLearning.RESULT_TYPE.LOGIC: return PseudoPyLearning.GAP_CATEGORY.LOGIC;
        case PseudoPyLearning.RESULT_TYPE.IO: return PseudoPyLearning.GAP_CATEGORY.IO;
        case PseudoPyLearning.RESULT_TYPE.PATTERN: return PseudoPyLearning.GAP_CATEGORY.PATTERN;
        case PseudoPyLearning.RESULT_TYPE.TRANSLATION: return PseudoPyLearning.GAP_CATEGORY.TRANSLATION;
        case PseudoPyLearning.RESULT_TYPE.READABILITY: return PseudoPyLearning.GAP_CATEGORY.READABILITY;
        case PseudoPyLearning.RESULT_TYPE.SYNTAX:
        default: return PseudoPyLearning.GAP_CATEGORY.SYNTAX;
    }
}

PseudoPyLearning.register.validationEngine = {
    runValidation: runValidation,
    classifyCompilerIssue: classifyCompilerIssue,
    summarizeValidation: summarizeValidation,
    gapCategoryForResultType: gapCategoryForResultType,
    computeAstMaxNesting: computeAstMaxNesting
};/* ============================================================
   PSEUDOPY LEARNING LAYER — Pattern Detector
   ------------------------------------------------------------
   Walks the parser AST and recognises the common algorithmic
   patterns a beginner is expected to master. Fully deterministic:
   every detection decision comes from AST node types, expression
   tokens or source ranges. Output is a list of DetectedPattern
   objects that the feedback clustering (Phase 3) and the evidence
   store (Phase 6) can consume.
   ============================================================ */

/* Pattern display metadata (Lucide icons). */
Object.assign(PseudoPyLearning.LABELS.pattern || (PseudoPyLearning.LABELS.pattern = {}), {
    [PseudoPyLearning.PATTERN_TYPE.SEQUENCE]: { label: 'Sequence', icon: 'list', description: 'Statements run one after another, top to bottom.' },
    [PseudoPyLearning.PATTERN_TYPE.SELECTION]: { label: 'Selection', icon: 'git-branch', description: 'A decision chooses which block of statements runs.' },
    [PseudoPyLearning.PATTERN_TYPE.REPETITION]: { label: 'Repetition', icon: 'refresh-cw', description: 'A block of statements repeats under control of a loop.' },
    [PseudoPyLearning.PATTERN_TYPE.COUNTER_CONTROLLED_LOOP]: { label: 'Counter-Controlled Loop', icon: 'repeat', description: 'A FOR loop that repeats a fixed number of times using a counter.' },
    [PseudoPyLearning.PATTERN_TYPE.SENTINEL_CONTROLLED_LOOP]: { label: 'Sentinel-Controlled Loop', icon: 'flag', description: 'A loop that keeps reading input until a sentinel value ends it.' },
    [PseudoPyLearning.PATTERN_TYPE.ACCUMULATOR]: { label: 'Accumulator', icon: 'sigma', description: 'A total (or product) built up by adding to it during each iteration.' },
    [PseudoPyLearning.PATTERN_TYPE.INPUT_PROCESS_OUTPUT]: { label: 'Input-Process-Output', icon: 'wholefish', description: 'Read values, process them, then display the result.' },
    [PseudoPyLearning.PATTERN_TYPE.VALIDATION_LOOP]: { label: 'Validation Loop', icon: 'shield-check', description: 'A loop that re-reads input until the value satisfies a rule.' },
    [PseudoPyLearning.PATTERN_TYPE.NESTED_SELECTION]: { label: 'Nested Selection', icon: 'network', description: 'A decision placed inside another decision.' },
    [PseudoPyLearning.PATTERN_TYPE.NESTED_ITERATION]: { label: 'Nested Iteration', icon: 'container', description: 'A loop placed inside the body of another loop.' },
    [PseudoPyLearning.PATTERN_TYPE.FUNCTION]: { label: 'Function / Procedure', icon: 'puzzle', description: 'A named, reusable unit of behavior with parameters.' }
});

const PATTERN_SLICE_LIMIT = 8; // lines per slice shown to the student

/**
 * Collect the deepest line covered by an AST subtree.
 * @param {Object} node
 * @returns {number}
 */
function patternNodeEndLine(node) {
    if (!node) return 1;
    const list = [];
    if (node.body && Array.isArray(node.body)) list.push(...node.body);
    if (node.elseIfs && Array.isArray(node.elseIfs)) list.push(...node.elseIfs);
    const candidates = [node.line || 1];
    for (const child of list) candidates.push(patternNodeEndLine(child));
    if (node.elseBody && Array.isArray(node.elseBody)) {
        for (const child of node.elseBody) candidates.push(patternNodeEndLine(child));
    }
    return Math.max.apply(null, candidates);
}

/**
 * True when a statement appears somewhere inside another statement's body.
 * Used to distinguish "Nested Selection" / "Nested Iteration" from
 * top-level occurrences, without sacrificing the type-specific pattern.
 * @param {Object} outer
 * @param {Object} inner
 * @returns {boolean}
 */
function containsNode(outer, inner) {
    if (!outer || !inner) return false;
    const lists = [outer.body];
    if (outer.elseIfs) lists.push(...outer.elseIfs.map(e => e.body));
    if (outer.elseBody) lists.push(outer.elseBody);
    for (const list of lists) {
        if (!Array.isArray(list)) continue;
        for (const child of list) {
            if (child === inner) return true;
            if (containsNode(child, inner)) return true;
        }
    }
    return false;
}

/**
 * Slices source lines [startLine..endLine] into a compact display string.
 * @param {string} source
 * @param {number} startLine
 * @param {number} endLine
 * @returns {string}
 */
function sourceSlice(source, startLine, endLine) {
    const lines = String(source || '').split('\n');
    let out = [];
    for (let i = Math.max(0, startLine - 1); i < Math.min(lines.length, endLine); i++) {
        out.push(lines[i].trim());
        if (out.length >= PATTERN_SLICE_LIMIT) break;
    }
    return out.filter(Boolean).join('\n');
}

/**
 * Regenerates the Python projection of a single AST subtree by wrapping
 * it in a Program and reusing the existing CodeGenerator (Phase 10 keeps
 * shared logic in one place). Helper preludes are trimmed for readability.
 * @param {Object} node
 * @param {Object} symbolTable Plain { id: {} } object from compile().
 * @returns {string}
 */
function patternPythonSlice(node, symbolTable) {
    try {
        const symMap = symbolTable && typeof symbolTable.entries === 'function' ? symbolTable : (symbolTable ? new Map(Object.entries(symbolTable || {})) : new Map());
        const generator = new CodeGenerator(symMap);
        const program = node && node.type === 'Program' ? node : { type: 'Program', body: [node] };
        const generated = generator.generate(program) || '';
        let lines = generated.split('\n');
        // Trim reusable helper preludes (def _pseudopy_range/_pseudopy_input_cast).
        const blank = lines.lastIndexOf('');
        if (blank !== -1) lines = lines.slice(blank + 1);
        return lines.filter(Boolean).slice(0, PATTERN_SLICE_LIMIT).join('\n');
    } catch (e) {
        return '';
    }
}

/**
 * Expression token helper: the visible operand/operator values.
 * @param {Object} expr AST expression node with .tokens
 * @returns {string[]}
 */
function exprValues(expr) {
    if (!expr || !Array.isArray(expr.tokens)) return [];
    return expr.tokens.map(t => String(t.value || ''));
}

/**
 * True when the statement carries a declaration type hint (INTEGER...).
 * @param {Object} node
 * @returns {string}
 */
function declaredAssignments(ast) {
    const out = [];
    function walk(node) {
        if (!node) return;
        if (node.type === 'AssignmentStatement') out.push(node);
        walk(node.body);
        if (node.elseIfs) node.elseIfs.forEach(walk);
        if (node.elseBody) walk(node.elseBody);
    }
    walk(ast);
    return out;
}

/**
 * Detect the accumulator/counter variables initialised before each loop.
 * Returns Map id → initialisation line for simple constant assignments.
 * @param {Object} programBody
 * @returns {Map<string, number>}
 */
function collectInitializers(programBody) {
    const init = new Map();
    (programBody || []).forEach(node => {
        if (node.type === 'DeclareStatement') init.set(node.id, node.line || 1);
        else if (node.type === 'AssignmentStatement') {
            const vals = exprValues(node.expr);
            if (vals.length === 1 && /^\d+(\.\d+)?$/.test(vals[0])) init.set(node.id, node.line || 1);
        }
    });
    return init;
}

/**
 * True when an assignment inside a loop updates an already-initialised
 * variable with an arithmetic operation involving itself (the classic
 * accumulator `total = total + item` / counter `count = count + 1`).
 * @param {Object} assign AssignmentStatement
 * @param {Map<string, number>} initializers
 */
function isAccumulatorAssignment(assign, initializers) {
    if (!assign || !assign.expr) return false;
    if (!initializers.has(assign.id)) return false;
    const vals = exprValues(assign.expr);
    const hasSelf = vals.includes(assign.id);
    const hasOp = vals.some(v => ['+', '-', '*', '/', '//', '%', 'MOD', 'DIV'].includes(v));
    return hasSelf && hasOp;
}

/**
 * Whether the loop body reads input into the given variable set.
 * @param {Object[]} body
 * @returns {string[]} variable names read via INPUT/READ in the body
 */
function inputVarsInBody(body, acc) {
    acc = acc || [];
    (body || []).forEach(node => {
        if (node.type === 'InputStatement') acc.push(node.id);
        inputVarsInBody(node.body, acc);
        if (node.elseIfs) node.elseIfs.forEach(e => inputVarsInBody(e.body, acc));
        if (node.elseBody) inputVarsInBody(node.elseBody, acc);
    });
    return acc;
}

function containsKeyword(values, keywords) {
    return values.some(v => keywords.includes(v.toUpperCase()));
}

/**
 * Classify a WHILE loop into Sentinel / Validation / Repetition.
 * @param {Object} node WhileStatement
 * @param {string[]} bodyInputs
 * @returns {string} PATTERN_TYPE value
 */
function classifyWhile(node, bodyInputs) {
    const cond = exprValues(node.condition).map(v => v.toUpperCase());
    const condHasInputVar = bodyInputs.some(name => cond.includes(name.toUpperCase()));
    const hasString = containsKeyword(cond, []);
    const rawStrings = (node.condition.tokens || []).filter(t => t.type === 'STRING').length;
    const hasCompare = ['<', '>', '=', '==', '!=', '<>', 'MOD', 'DIV'].some(op => cond.includes(op));

    if (!condHasInputVar) return PseudoPyLearning.PATTERN_TYPE.REPETITION;
    if (rawStrings > 0 || hasString) return PseudoPyLearning.PATTERN_TYPE.SENTINEL_CONTROLLED_LOOP;
    if (hasCompare) return PseudoPyLearning.PATTERN_TYPE.VALIDATION_LOOP;
    return PseudoPyLearning.PATTERN_TYPE.SENTINEL_CONTROLLED_LOOP;
}

/* ── Per-construct detectors ───────────────────────────────── */

function detectSequences(ast, source) {
    const patterns = [];
    const body = (ast && ast.body) || [];
    const procedural = body.filter(n => !['DeclareStatement'].includes(n.type));
    if (procedural.length >= 2) {
        const start = Math.min.apply(null, procedural.map(n => n.line || 1));
        const end = Math.max.apply(null, procedural.map(n => patternNodeEndLine(n)));
        patterns.push(makeDetectedPattern({
            type: PseudoPyLearning.PATTERN_TYPE.SEQUENCE,
            name: 'Sequence',
            startLine: start,
            endLine: end,
            explanation: 'Statements are executed one after another from top to bottom. This is the default flow of every pseudocode program.',
            pseudocodeSlice: sourceSlice(source, start, end),
            pythonSlice: patternPythonSlice({ type: 'Program', body: procedural.slice(0, 2) }, {})
        }));
    }
    return patterns;
}

function detectSelection(ast, { source, symbolTable, inLoop }) {
    const patterns = [];
    const ifs = [];
    const walk = node => {
        if (!node) return;
        if (node.type === 'IfStatement') ifs.push(node);
        if (node.body) node.body.forEach(walk);
        if (node.elseIfs) node.elseIfs.forEach(e => e.body && e.body.forEach(walk));
        if (node.elseBody) node.elseBody.forEach(walk);
    };
    walk(ast);

    ifs.forEach(outer => {
        const hasNested = ifs.some(inner => inner !== outer && containsNode(outer, inner));
        const start = outer.line || 1;
        const end = patternNodeEndLine(outer);
        if (hasNested) {
            patterns.push(makeDetectedPattern({
                type: PseudoPyLearning.PATTERN_TYPE.NESTED_SELECTION,
                name: 'Nested Selection',
                startLine: start,
                endLine: end,
                explanation: 'A decision sits inside the true/false branch of an outer decision. The inner IF only runs when the outer condition is met.',
                pseudocodeSlice: sourceSlice(source, start, end),
                pythonSlice: patternPythonSlice(outer, symbolTable)
            }));
        } else {
            patterns.push(makeDetectedPattern({
                type: PseudoPyLearning.PATTERN_TYPE.SELECTION,
                name: 'Selection',
                startLine: start,
                endLine: end,
                explanation: 'The IF condition picks one of several branches. Only the matching branch executes.',
                pseudocodeSlice: sourceSlice(source, start, end),
                pythonSlice: patternPythonSlice(outer, symbolTable)
            }));
        }
    });
    return patterns;
}

function detectLoops(ast, { source, symbolTable }) {
    const patterns = [];
    const programBody = (ast && ast.body) || [];
    const initializers = collectInitializers(programBody);
    const loops = [];

    const walk = node => {
        if (!node) return;
        if (node.type === 'WhileStatement' || node.type === 'ForStatement' || node.type === 'ForEachStatement') loops.push(node);
        if (node.body) node.body.forEach(walk);
        if (node.elseIfs) node.elseIfs.forEach(e => e.body && e.body.forEach(walk));
        if (node.elseBody) node.elseBody.forEach(walk);
    };
    walk(ast);

    loops.forEach(loop => {
        const start = loop.line || 1;
        const end = patternNodeEndLine(loop);
        const bodyInputs = inputVarsInBody(loop.body, []);
        let type, name, explanation;
        const accordion = isAccumulatorLoop(loop, initializers);

        if (loop.type === 'ForStatement') {
            type = PseudoPyLearning.PATTERN_TYPE.COUNTER_CONTROLLED_LOOP;
            name = 'Counter-Controlled Loop';
            explanation = 'A FOR loop steps a counter through a fixed range, running the body once per value. The loop controls the count; you control the body.';
        } else if (loop.type === 'ForEachStatement') {
            type = PseudoPyLearning.PATTERN_TYPE.REPETITION;
            name = 'Repetition over a collection';
            explanation = 'A FOR EACH loop visits every element of an array or list once, binding each one to the iterator in turn.';
        } else {
            type = classifyWhile(loop, bodyInputs);
            name = type === PseudoPyLearning.PATTERN_TYPE.VALIDATION_LOOP ? 'Validation Loop'
                : type === PseudoPyLearning.PATTERN_TYPE.SENTINEL_CONTROLLED_LOOP ? 'Sentinel-Controlled Loop'
                    : 'Repetition (While loop)';
            explanation = type === PseudoPyLearning.PATTERN_TYPE.VALIDATION_LOOP
                ? 'The WHILE loop repeatedly asks for input until the value passes a validation rule, so bad input never escapes the loop.'
                : type === PseudoPyLearning.PATTERN_TYPE.SENTINEL_CONTROLLED_LOOP
                    ? 'The WHILE loop keeps reading values until a special sentinel value signals the end of the data.'
                    : 'A WHILE loop repeats as long as its condition stays true. The body must eventually make the condition false or the loop never ends.';
        }

        patterns.push(makeDetectedPattern({
            type: type,
            name: name,
            startLine: start,
            endLine: end,
            explanation: explanation,
            pseudocodeSlice: sourceSlice(source, start, end),
            pythonSlice: patternPythonSlice(loop, symbolTable)
        }));

        if (accordion.accumulated.length > 0) {
            patterns.push(makeDetectedPattern({
                type: PseudoPyLearning.PATTERN_TYPE.ACCUMULATOR,
                name: 'Accumulator',
                startLine: start,
                endLine: end,
                explanation: 'An accumulating variable (' + accordion.accumulated.join(', ') + ') is initialised before the loop and updated during every iteration. Each pass adds (or multiplies) its previous value with the new one.',
                pseudocodeSlice: sourceSlice(source, start, end),
                pythonSlice: patternPythonSlice(loop, symbolTable)
            }));
        }
    });

    // Nested iteration — any loop contained in another loop.
    loops.forEach(inner => {
        const wraps = loops.some(outer => outer !== inner && containsNode(outer, inner));
        if (!wraps) return;
        const start = inner.line || 1;
        const end = patternNodeEndLine(inner);
        patterns.push(makeDetectedPattern({
            type: PseudoPyLearning.PATTERN_TYPE.NESTED_ITERATION,
            name: 'Nested Iteration',
            startLine: start,
            endLine: end,
            explanation: 'One loop is placed inside another. The inner loop runs completely for every single pass of the outer loop.',
            pseudocodeSlice: sourceSlice(source, start, end),
            pythonSlice: patternPythonSlice(inner, symbolTable)
        }));
    });

    return patterns;
}

function isAccumulatorLoop(loop, initializers) {
    const accumulated = [];
    const walk = node => {
        if (!node) return;
        if (node.type === 'AssignmentStatement' && isAccumulatorAssignment(node, initializers) && !accumulated.includes(node.id)) accumulated.push(node.id);
        if (node.body) node.body.forEach(walk);
        if (node.elseIfs) node.elseIfs.forEach(e => e.body && e.body.forEach(walk));
        if (node.elseBody) node.elseBody.forEach(walk);
    };
    walk(loop);
    return { accumulated };
}

function detectFunctionsAndIPO(ast, { source, symbolTable }) {
    const patterns = [];
    const funcs = [];
    let hasInput = false, hasOutput = false;
    let firstInputLine = null, lastOutputLine = null;

    const walk = node => {
        if (!node) return;
        if (node.type === 'FunctionDef') funcs.push(node);
        if (node.type === 'InputStatement') {
            hasInput = true;
            if (firstInputLine === null) firstInputLine = node.line || 1;
        }
        if (node.type === 'PrintStatement') {
            hasOutput = true;
            lastOutputLine = Math.max(lastOutputLine || 0, node.line || 1);
        }
        if (node.body) node.body.forEach(walk);
        if (node.elseIfs) node.elseIfs.forEach(e => e.body && e.body.forEach(walk));
        if (node.elseBody) node.elseBody.forEach(walk);
    };
    walk(ast);

    funcs.forEach(fn => {
        const start = fn.line || 1;
        const end = patternNodeEndLine(fn);
        patterns.push(makeDetectedPattern({
            type: PseudoPyLearning.PATTERN_TYPE.FUNCTION,
            name: 'Function / Procedure',
            startLine: start,
            endLine: end,
            explanation: 'The code is organised into a named, reusable block. Parameters pass values in and RETURN sends a result back, keeping the main flow short.',
            pseudocodeSlice: sourceSlice(source, start, end),
            pythonSlice: patternPythonSlice(fn, symbolTable)
        }));
    });

    if (hasInput && hasOutput && firstInputLine !== null && lastOutputLine !== null && lastOutputLine > firstInputLine) {
        patterns.push(makeDetectedPattern({
            type: PseudoPyLearning.PATTERN_TYPE.INPUT_PROCESS_OUTPUT,
            name: 'Input-Process-Output',
            startLine: firstInputLine,
            endLine: lastOutputLine,
            explanation: 'Your program follows the classic Input → Process → Output shape: it reads a value, does some work, then shows a result.',
            pseudocodeSlice: sourceSlice(source, firstInputLine, lastOutputLine),
            pythonSlice: patternPythonSlice({ type: 'Program', body: ast.body || [] }, symbolTable)
        }));
    }

    return patterns;
}

/* ── Public API ────────────────────────────────────────────── */

/**
 * Detect all recognised algorithmic patterns in a compiled program.
 * @param {Object} ctx { ast, source, python, symbolTable }
 * @returns {DetectedPattern[]} Sorted by start line.
 */
function detectPatterns(ctx) {
    const ast = (ctx && ctx.ast) || { body: [] };
    const source = String((ctx && ctx.source) || '');
    const symbolTable = (ctx && ctx.symbolTable) || null;
    const scope = { source: source, symbolTable: symbolTable };

    let out = [];
    out.push(...detectSequences(ast, source));
    out.push(...detectSelection(ast, scope));
    out.push(...detectLoops(ast, scope));
    out.push(...detectFunctionsAndIPO(ast, scope));

    // De-duplicate identical (type, startLine) pairs and sort by line.
    const seen = new Set();
    out = out.filter(p => {
        const key = p.type + ':' + p.startLine;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).sort((a, b) => a.startLine - b.startLine || b.endLine - a.endLine);

    return out;
}

PseudoPyLearning.register.patternDetector = {
    detectPatterns: detectPatterns,
    classifyWhile: classifyWhile,
    computeAstMaxNesting: function (ast) {
        // aliased from the validation engine when present; fallback inline
        if (PseudoPyLearning.register.validationEngine && PseudoPyLearning.register.validationEngine.computeAstMaxNesting) {
            return PseudoPyLearning.register.validationEngine.computeAstMaxNesting(ast);
        }
        return 0;
    }
};/* ============================================================
   PSEUDOPY LEARNING LAYER — Feedback Clustering
   ------------------------------------------------------------
   Groups the structured ValidationResults and DetectedPatterns
   into the high-level FEEDBACK_CATEGORY clusters shown to the
   student with progressive disclosure. Pure functions — no DOM,
   no storage — so they are unit-testable and reusable by the
   analytics layer.
   ============================================================ */

/** Preferred display order for the categories. */
const LEARNING_CATEGORY_ORDER = [
    PseudoPyLearning.FEEDBACK_CATEGORY.SYNTAX,
    PseudoPyLearning.FEEDBACK_CATEGORY.STRUCTURE,
    PseudoPyLearning.FEEDBACK_CATEGORY.LOGIC,
    PseudoPyLearning.FEEDBACK_CATEGORY.PROGRAMMING_PATTERN,
    PseudoPyLearning.FEEDBACK_CATEGORY.READABILITY,
    PseudoPyLearning.FEEDBACK_CATEGORY.TRANSLATION,
    PseudoPyLearning.FEEDBACK_CATEGORY.BEST_PRACTICES
];

/**
 * Fold one ValidationResult into its cluster, updating counts.
 * @param {Object} clusters category → FeedbackCluster
 * @param {ValidationResult} item
 */
function foldResultIntoCluster(clusters, item) {
    const cat = item.category;
    if (!clusters[cat]) clusters[cat] = makeFeedbackCluster(cat);
    const cluster = clusters[cat];
    cluster.items.push(item);
    if (item.severity === PseudoPyLearning.SEVERITY.ERROR) cluster.errorCount++;
    else if (item.severity === PseudoPyLearning.SEVERITY.WARNING) cluster.warningCount++;
    else if (item.severity === PseudoPyLearning.SEVERITY.SUGGESTION) cluster.suggestionCount++;
    else cluster.successCount++;
}

/**
 * Add one recognised programming pattern as a positive item
 * inside the "Programming Pattern" cluster.
 * @param {Object} clusters
 * @param {DetectedPattern} pattern
 */
function foldPatternIntoCluster(clusters, pattern) {
    const meta = (PseudoPyLearning.LABELS.pattern[pattern.type] || {});
    const label = meta.label || pattern.name;
    const cat = PseudoPyLearning.FEEDBACK_CATEGORY.PROGRAMMING_PATTERN;
    if (!clusters[cat]) clusters[cat] = makeFeedbackCluster(cat);
    const cluster = clusters[cat];
    cluster.items.push(makeValidationResult({
        type: PseudoPyLearning.RESULT_TYPE.PATTERN,
        severity: PseudoPyLearning.SEVERITY.SUCCESS,
        category: cat,
        message: 'Pattern detected: ' + label,
        explanation: pattern.explanation,
        line: pattern.startLine,
        suggestion: 'Return to this area of the code and check you understand why this pattern solves the problem.'
    }));
    cluster.successCount++;
}

/**
 * Determine the headline visual state of a cluster.
 * @param {FeedbackCluster} cluster
 * @returns {string} One of PseudoPyLearning.SEVERITY.
 */
function clusterState(cluster) {
    if (!cluster) return PseudoPyLearning.SEVERITY.SUCCESS;
    if (cluster.errorCount > 0) return PseudoPyLearning.SEVERITY.ERROR;
    if (cluster.warningCount > 0) return PseudoPyLearning.SEVERITY.WARNING;
    if (cluster.suggestionCount > 0) return PseudoPyLearning.SEVERITY.SUGGESTION;
    return PseudoPyLearning.SEVERITY.SUCCESS;
}

/**
 * Cluster validation items + recognised patterns into FeedbackCluster[],
 * ordered by LEARNING_CATEGORY_ORDER. Empty clusters are omitted.
 * @param {ValidationResult[]} validationItems
 * @param {DetectedPattern[]} patterns
 * @returns {FeedbackCluster[]}
 */
function clusterFeedback(validationItems, patterns) {
    const clusters = {};
    (validationItems || []).forEach(item => foldResultIntoCluster(clusters, item));
    (patterns || []).forEach(p => foldPatternIntoCluster(clusters, p));
    return LEARNING_CATEGORY_ORDER.filter(cat => clusters[cat]).map(cat => clusters[cat]);
}

/**
 * Compact whole-result stats across clusters.
 * @param {FeedbackCluster[]} clusters
 * @returns {{error:number, warning:number, suggestion:number, success:number, total:number}}
 */
function summarizeClusters(clusters) {
    const sums = { error: 0, warning: 0, suggestion: 0, success: 0, total: 0 };
    (clusters || []).forEach(c => {
        sums.error += c.errorCount;
        sums.warning += c.warningCount;
        sums.suggestion += c.suggestionCount;
        sums.success += c.successCount;
    });
    sums.total = sums.error + sums.warning + sums.suggestion + sums.success;
    return sums;
}

/**
 * A short one-line verdict used by lists and headers.
 * @param {ValidationResult[]} items
 * @returns {string}
 */
function overallVerdict(items) {
    const by = summarizeValidation(items).bySeverity;
    const errors = by.error || 0;
    const warnings = by.warning || 0;
    if (errors > 0) return errors + ' issue(s) to fix before your pseudocode can be translated.';
    if (warnings > 0) return 'Your pseudocode is valid, with ' + warnings + ' point(s) worth reviewing.';
    return 'Your pseudocode translated cleanly. Review the suggestions to polish it further.';
}

PseudoPyLearning.register.feedbackClusterer = {
    clusterFeedback: clusterFeedback,
    summarizeClusters: summarizeClusters,
    clusterState: clusterState,
    overallVerdict: overallVerdict,
    LEARNING_CATEGORY_ORDER: LEARNING_CATEGORY_ORDER
};/* ============================================================
   PSEUDOPY LEARNING LAYER — Feedback Pipeline
   ------------------------------------------------------------
   Orchestrates validation → pattern detection → clustering into
   a single TranslationResult that the UI and the evidence store
   can both consume. Pure computation, no DOM, no storage.
   ============================================================ */

/**
 * Compose the final learning result for one translation.
 * @param {string} source Original pseudocode.
 * @param {object} compileResult Output of PseudocodeCompiler.compile().
 * @returns {TranslationResult}
 */
function runLearningPipeline(source, compileResult) {
    const validationEngine = PseudoPyLearning.register.validationEngine;
    const patternDetector = PseudoPyLearning.register.patternDetector;
    const clusterer = PseudoPyLearning.register.feedbackClusterer;

    const validation = validationEngine.runValidation(compileResult, source);
    const patterns = (compileResult && compileResult.valid)
        ? patternDetector.detectPatterns({ source: source, ast: compileResult.ast, symbolTable: compileResult.symbolTable })
        : [];

    const items = validation.items;
    const clusters = clusterer.clusterFeedback(items, patterns);

    const errors = items.filter(it => it.severity === PseudoPyLearning.SEVERITY.ERROR);
    const warnings = items.filter(it => it.severity === PseudoPyLearning.SEVERITY.WARNING);
    const suggestions = items.filter(it => it.severity === PseudoPyLearning.SEVERITY.SUGGESTION);
    const successes = items.filter(it => it.severity === PseudoPyLearning.SEVERITY.SUCCESS);

    const errorCategories = uniqueSorted(errors.map(it => it.category));
    const gapCategories = uniqueSorted(errors.map(it => gapCategoryForResultType(it.type)).filter(Boolean));
    const patternTypes = uniqueSorted(patterns.map(p => p.type));

    return {
        source: source,
        compile: compileResult,
        valid: validation.valid,
        validation: validation,
        items: items,
        patterns: patterns,
        clusters: clusters,
        summary: clusterer.summarizeClusters(clusters),
        verdict: clusterer.overallVerdict(items),
        tallies: { error: errors.length, warning: warnings.length, suggestion: suggestions.length, success: successes.length },
        errorCategories: errorCategories,
        gapCategories: gapCategories,
        patternTypes: patternTypes
    };
}

function uniqueSorted(arr) {
    return Array.from(new Set(arr.filter(Boolean))).sort();
}

PseudoPyLearning.register.pipeline = {
    run: runLearningPipeline,
    uniqueSorted: uniqueSorted
};/* ============================================================
   PSEUDOPY LEARNING LAYER — Learning UI
   ------------------------------------------------------------
   Renders the post-translation Learning Panel on the Write
   Pseudocode page using the clustered TranslationResult produced
   by the pipeline. Reuses the shared cluster-card styles defined
   in style.css. Non-destructive: every render is defensive.
   ============================================================ */

const LU_ESC = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function luTry(fn, fallback) { try { const v = fn(); return v === undefined ? fallback : v; } catch (e) { return fallback; } }

function luSeverityLabel(sev) {
    return luTry(() => PseudoPyLearning.LABELS.severity[sev], { label: sev, icon: 'info' });
}

function luCategoryMeta(cat) {
    return luTry(() => PseudoPyLearning.LABELS.category[cat], { label: cat, icon: 'circle-check', description: '' });
}

/** Build one expandable cluster card. */
function buildClusterCard(c) {
    const meta = luCategoryMeta(c.category);
    const state = luTry(() => PseudoPyLearning.register.feedbackClusterer.clusterState(c), 'success');
    const stateIcon = luSeverityLabel(state).icon || 'circle-check';
    const counts = [
        c.errorCount ? 'error ' + c.errorCount : '',
        c.warningCount ? 'warning ' + c.warningCount : '',
        c.suggestionCount ? 'suggestion ' + c.suggestionCount : '',
        c.successCount ? 'success ' + c.successCount : ''
    ].filter(Boolean).join(' &middot; ');
    const items = c.items.map(it => {
        const sev = luSeverityLabel(it.severity);
        const la = (it.line != null) ? `<div class="lc-line">Line ${LU_ESC(String(it.line))}</div>` : '';
        return `
            <li class="lc-item lc-item-${it.severity}">
              <strong>${icon(sev.icon)} ${LU_ESC(it.message)}</strong>
              <div class="lc-expl">${LU_ESC(it.explanation)}</div>
              ${it.suggestion && it.suggestion !== 'Nothing to change here — keep using this approach.' ? `<div class="lc-sugg"><em>Suggestion:</em> ${LU_ESC(it.suggestion)}</div>` : ''}
              ${la}
            </li>`;
    }).join('');
    return `
        <div class="learning-cluster-card lc-state-${state}">
          <div class="lc-head">
            <span class="lc-icon">${icon(meta.icon)}</span>
            <span class="lc-title">${LU_ESC(meta.label)}</span>
            <span class="lc-counts">${counts}</span>
            <span class="lc-state-icon">${icon(stateIcon)}</span>
          </div>
          <div class="lc-desc">${LU_ESC(meta.description || '')}</div>
          <details class="lc-details">
            <summary>View details</summary>
            <ul class="lc-list">${items}</ul>
          </details>
        </div>`;
}

/**
 * Recommend the single most useful next step to the student:
 * the first category that has something more than a success.
 */
function suggestNextStep(clusters) {
    if (!clusters || !clusters.length) return null;
    const actionable = clusters.find(c => c.errorCount > 0 || c.warningCount > 0 || c.suggestionCount > 0);
    if (!actionable) return { cluster: null, message: 'Every area looks great — continue to the next task.' };
    const item = actionable.items.find(i => i.severity === PseudoPyLearning.SEVERITY.ERROR)
        || actionable.items.find(i => i.severity === PseudoPyLearning.SEVERITY.WARNING)
        || actionable.items.find(i => i.severity === PseudoPyLearning.SEVERITY.SUGGESTION);
    return { cluster: actionable, item: item };
}

/**
 * Render (or hide) the post-translation learning panel.
 * @param {TranslationResult|null} pipelineResult
 */
function renderLearningPanel(pipelineResult) {
    const panel = document.getElementById('learning-feedback-panel');
    const body = document.getElementById('learning-feedback-panel-body');
    if (!panel || !body) return;
    if (!pipelineResult || !pipelineResult.clusters || !pipelineResult.clusters.length) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');

    const verdictState = pipelineResult.summary.error > 0 ? 'error'
        : (pipelineResult.summary.warning > 0 ? 'warning'
            : (pipelineResult.summary.suggestion > 0 ? 'suggestion' : 'success'));
    const verdictMeta = luSeverityLabel(verdictState);
    const next = suggestNextStep(pipelineResult.clusters);

    const nextHtml = next
        ? `<div class="lc-next">
             <strong>Next step:</strong>
             ${next.cluster ? `<span class="lc-next-cat">${LU_ESC(luCategoryMeta(next.cluster.category).label)}</span>` : ''}
             <span class="lc-next-msg">${LU_ESC(next.item ? next.item.message : next.message)}</span>
             ${next.item && next.item.suggestion ? ` <span class="lc-next-sugg">${LU_ESC(next.item.suggestion)}</span>` : ''}
           </div>`
        : '';

    body.innerHTML = `
        <div class="learning-summary-verdict lc-state-${verdictState}">
          ${icon(verdictMeta.icon)} <strong>${LU_ESC(verdictMeta.label)}:</strong> ${LU_ESC(pipelineResult.verdict)}
        </div>
        ${nextHtml}
        <div class="learning-cluster-grid">
          ${pipelineResult.clusters.map(buildClusterCard).join('')}
        </div>`;
    refreshIcons(body);
}

/** Hide the panel (e.g. when the editor is cleared). */
function clearLearningPanel() {
    const panel = document.getElementById('learning-feedback-panel');
    if (panel) panel.classList.add('hidden');
}

PseudoPyLearning.register.learningUi = {
    renderLearningPanel: renderLearningPanel,
    clearLearningPanel: clearLearningPanel,
    buildClusterCard: buildClusterCard,
    suggestNextStep: suggestNextStep
};/* ============================================================
   PSEUDOPY LEARNING LAYER — Beginner Tutorial (Onboarding)
   ------------------------------------------------------------
   A step-by-step guided tour of the Write Pseudocode page for
   students. State is stored under 'pseudopy_tutorial_completed'
   behind a small adapter so Phase 6 can back it with the
   pseudopy_tutorialProgress DB ref without changing the UI code.
   ============================================================ */

const ONBOARDING = {
    storageKey: 'pseudopy_tutorial_completed',
    steps: [
        {
            targetId: 'pseudocode-editor',
            icon: 'square-pen',
            title: 'Start in the Editor',
            text: 'Write your pseudocode here in plain English. You can use BEGIN/END, DECLARE, INPUT, SET, IF/ELSE, FOR and WHILE.',
            placement: 'below'
        },
        {
            targetId: 'btn-translate-pseudocode',
            icon: 'refresh-cw',
            title: 'Translate to Python',
            text: 'Click this button to convert your pseudocode into real Python code using the built-in translator.',
            placement: 'below'
        },
        {
            targetId: 'python-output',
            icon: 'code-2',
            title: 'Read the Python Output',
            text: 'The translated Python appears here. Use the Learning Feedback panel below it to review what you did well and what to improve.',
            placement: 'above'
        },
        {
            targetId: 'btn-run-code',
            icon: 'play',
            title: 'Run Your Code',
            text: 'Run the translated Python locally to check that it behaves as you expected.',
            placement: 'above'
        },
        {
            targetId: 'console-output',
            icon: 'terminal',
            title: 'See Your Results',
            text: 'Program output, errors and runtime messages appear here — just like a real console.',
            placement: 'above'
        },
        {
            targetId: 'topbar-progress-pill',
            icon: 'trophy',
            title: 'Track Your Progress',
            text: 'Your skill progress and improvement summary live in Settings. From there you can replay this tutorial any time.',
            placement: 'left'
        }
    ]
};

const onboardingState = {
    overlay: null,
    spotlight: null,
    bubble: null,
    current: 0,
    active: false,
    returnFocus: null,
    safeAreas: null
};

/* ── State adapter (localStorage now; DB-backed in Phase 6) ── */

function onbGetCompleted() {
    try { return onbStorageGet(ONBOARDING.storageKey) === 'true'; } catch (e) { return false; }
}

function onbSetCompleted(done) {
    try {
        const key = ONBOARDING.storageKey;
        const userId = (typeof currentUser !== 'undefined' && currentUser) ? (currentUser._docId || currentUser.id) : 'anonymous';
        onbStorageSet(key + '_' + userId, done ? 'true' : '');
        onbStorageSet(key + '_shown_' + userId, 'true');
    } catch (e) { /* non-critical */ }
}

function onbStorageGet(key) {
    return localStorage.getItem(key);
}

function onbStorageSet(key, value) {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
}

function onbShouldAutoStart() {
    if (typeof currentUser === 'undefined' || !currentUser) return false;
    if (currentUser.role !== 'student') return false;
    try {
        const userId = currentUser._docId || currentUser.id;
        return localStorage.getItem(ONBOARDING.storageKey + '_' + userId) !== 'true';
    } catch (e) { return false; }
}

/* ── Overlay construction ──────────────────────────────────── */

function onbEnsureOverlay() {
    if (onboardingState.overlay) return;
    const overlay = document.createElement('div');
    overlay.id = 'tour-overlay';
    overlay.className = 'tour-overlay hidden';
    overlay.innerHTML = `
      <div class="tour-spotlight"></div>
      <div class="tour-bubble" role="dialog" aria-modal="true" aria-label="Beginner tutorial" tabindex="-1">
        <div class="tour-bubble-head"><span class="tour-bubble-icon" aria-hidden="true"></span><span class="tour-bubble-step" aria-hidden="true"></span></div>
        <h4 class="tour-bubble-title"></h4>
        <p class="tour-bubble-text"></p>
        <div class="tour-bubble-meta">
          <div class="tour-bubble-dots" role="group" aria-label="Tour progress"></div>
          <button class="btn btn-ghost btn-sm tour-skip">Skip tour</button>
        </div>
        <div class="tour-bubble-actions">
          <button class="btn btn-secondary btn-sm tour-prev" disabled>Back</button>
          <button class="btn btn-primary btn-sm tour-next">Next</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    onboardingState.overlay = overlay;
    onboardingState.spotlight = overlay.querySelector('.tour-spotlight');
    onboardingState.bubble = overlay.querySelector('.tour-bubble');

    overlay.addEventListener('click', (ev) => {
        if (ev.target === overlay || ev.target.classList.contains('tour-overlay')) {
            onbStop();
        }
    });
    overlay.querySelector('.tour-skip').addEventListener('click', () => onbStop());
    overlay.querySelector('.tour-prev').addEventListener('click', () => onbGo(onboardingState.current - 1));
    overlay.querySelector('.tour-next').addEventListener('click', () => {
        if (onboardingState.current >= ONBOARDING.steps.length - 1) onbFinish();
        else onbGo(onboardingState.current + 1);
    });

    bubbleEl().addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') {
            ev.stopPropagation();
            onbStop();
            return;
        }
        if (ev.key === 'Tab') onbTrapFocus(ev);
    });
    document.addEventListener('keydown', (ev) => {
        if (onboardingState.active && ev.key === 'Escape') onbStop();
    });

    window.addEventListener('resize', () => { onboardingState.safeAreas = null; onbReposition(); });
    window.addEventListener('scroll', onbReposition, { passive: true });
    window.addEventListener('orientationchange', () => { onboardingState.safeAreas = null; onbReposition(); });
}

function bubbleEl() {
    return onboardingState.bubble;
}

function onbTrapFocus(ev) {
    const focusables = bubbleEl().querySelectorAll('button:not([disabled])');
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
    }
}

function onbSafeAreas() {
    if (onboardingState.safeAreas) return onboardingState.safeAreas;
    if (typeof CSS === 'undefined' || !CSS.supports('padding-bottom', 'env(safe-area-inset-bottom)')) {
        onboardingState.safeAreas = { safeTop: 0, safeLeft: 0, safeBottom: 0, safeRight: 0 };
        return onboardingState.safeAreas;
    }
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    probe.style.paddingTop = 'env(safe-area-inset-top)';
    probe.style.paddingBottom = 'env(safe-area-inset-bottom)';
    probe.style.paddingLeft = 'env(safe-area-inset-left)';
    probe.style.paddingRight = 'env(safe-area-inset-right)';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
    onboardingState.safeAreas = {
        safeTop: num(cs.paddingTop),
        safeBottom: num(cs.paddingBottom),
        safeLeft: num(cs.paddingLeft),
        safeRight: num(cs.paddingRight)
    };
    probe.remove();
    return onboardingState.safeAreas;
}

function onbPositionFor(target) {
    const rect = target.getBoundingClientRect();
    const overlay = onboardingState.overlay;
    const pad = 6;
    const top = Math.max(0, rect.top - pad);
    const left = Math.max(0, rect.left - pad);
    const width = rect.width + pad * 2;
    const height = rect.height + pad * 2;
    onboardingState.spotlight.style.top = top + 'px';
    onboardingState.spotlight.style.left = left + 'px';
    onboardingState.spotlight.style.width = width + 'px';
    onboardingState.spotlight.style.height = height + 'px';

    const step = ONBOARDING.steps[onboardingState.current];
    const bubble = bubbleEl();
    const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
        margin: 16,
        safeTop: onbSafeAreas().safeTop,
        safeLeft: onbSafeAreas().safeLeft,
        safeBottom: onbSafeAreas().safeBottom,
        safeRight: onbSafeAreas().safeRight
    };
    const targetRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    const size = { width: bubble.offsetWidth, height: bubble.offsetHeight };
    const pos = computeTourBubbleRect(viewport, targetRect, step.placement || 'below', size);
    bubble.style.left = pos.left + 'px';
    bubble.style.top = pos.top + 'px';
    bubble.style.right = 'auto';
    bubble.style.bottom = 'auto';
}

function onbReposition() {
    if (!onboardingState.active) return;
    const step = ONBOARDING.steps[onboardingState.current];
    const target = document.getElementById(step.targetId);
    if (target) onbPositionFor(target);
}

function onbRender() {
    const step = ONBOARDING.steps[onboardingState.current];
    const target = document.getElementById(step.targetId);
    if (!target) { onbStop(); return; }
    const bubble = bubbleEl();

    const iconEl = bubble.querySelector('.tour-bubble-icon');
    iconEl.innerHTML = '';
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', step.icon);
    icon.setAttribute('aria-hidden', 'true');
    iconEl.appendChild(icon);

    bubble.querySelector('.tour-bubble-step').textContent = (onboardingState.current + 1) + ' / ' + ONBOARDING.steps.length;
    bubble.querySelector('.tour-bubble-title').textContent = step.title;
    bubble.querySelector('.tour-bubble-text').textContent = step.text;
    bubble.querySelector('.tour-prev').disabled = onboardingState.current === 0;
    const nextBtn = bubble.querySelector('.tour-next');
    nextBtn.textContent = onboardingState.current >= ONBOARDING.steps.length - 1 ? 'Finish' : 'Next';

    const dots = bubble.querySelector('.tour-bubble-dots');
    dots.setAttribute('aria-label', 'Step ' + (onboardingState.current + 1) + ' of ' + ONBOARDING.steps.length);
    dots.innerHTML = '';
    ONBOARDING.steps.forEach((_, i) => {
        const dot = document.createElement('span');
        dot.className = 'tour-dot' + (i === onboardingState.current ? ' active' : '');
        dot.setAttribute('aria-hidden', 'true');
        dots.appendChild(dot);
    });

    onbPositionFor(target);
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        try { lucide.createIcons({ icons: lucide.icons }); } catch (e) { /* icon render must never break the tour */ }
    }
    bubble.focus({ preventScroll: true });
}

function onbGo(index) {
    if (index < 0 || index >= ONBOARDING.steps.length) return;
    onboardingState.current = index;
    onbRender();
}

function startBeginnerTutorial() {
    onbEnsureOverlay();
    onboardingState.active = true;
    onboardingState.current = 0;
    onboardingState.returnFocus = document.activeElement;
    overlayEl().classList.remove('hidden');
    onbRender();
}

function overlayEl() {
    return onboardingState.overlay;
}

function onbFinish() {
    onbSetCompleted(true);
    try {
        if (PseudoPyLearning && PseudoPyLearning.register && PseudoPyLearning.register.evidenceStore) {
            PseudoPyLearning.register.evidenceStore.saveTutorialProgress(evUserId(), { completed: true, step: ONBOARDING.steps.length, finishedAt: new Date().toISOString() });
        }
    } catch (e) { /* non-critical */ }
    onbStop();
    showToast('Tutorial completed. You can replay it from Settings.', 'success');
}

function restartBeginnerTutorial() {
    onbSetCompleted(false);
    startBeginnerTutorial();
}

function onbStop() {
    const wasActive = onboardingState.active;
    onboardingState.active = false;
    if (onboardingState.overlay) onboardingState.overlay.classList.add('hidden');
    if (wasActive && onboardingState.returnFocus && typeof onboardingState.returnFocus.focus === 'function' && document.contains(onboardingState.returnFocus)) {
        try { onboardingState.returnFocus.focus({ preventScroll: true }); } catch (e) { /* no-op */ }
    }
    onboardingState.returnFocus = null;
}

function maybeAutoStartTutorial() {
    if (!onbShouldAutoStart()) return;
    try { startBeginnerTutorial(); } catch (e) { /* never block navigation */ }
}

PseudoPyLearning.register.onboarding = {
    start: startBeginnerTutorial,
    restart: restartBeginnerTutorial,
    stop: onbStop,
    autoStart: maybeAutoStartTutorial,
    isCompleted: onbGetCompleted
};/* ============================================================
   PSEUDOPY TOUR POSITIONING — pure viewport-aware geometry
   ------------------------------------------------------------
   Kept free of DOM so it can be unit-tested under Node. The
   browser bundle registers the same function as a global.
   ============================================================ */

function computeTourBubbleRect(viewport, target, placement, bubbleSize) {
    const gap = 12;
    const margin = Number.isFinite(viewport.margin) ? viewport.margin : 16;
    const safeTop = Number.isFinite(viewport.safeTop) ? viewport.safeTop : 0;
    const safeLeft = Number.isFinite(viewport.safeLeft) ? viewport.safeLeft : 0;
    const safeBottom = Number.isFinite(viewport.safeBottom) ? viewport.safeBottom : 0;
    const safeRight = Number.isFinite(viewport.safeRight) ? viewport.safeRight : 0;

    const limitW = Math.max(0, viewport.width - safeLeft - safeRight - margin * 2);
    const limitH = Math.max(0, viewport.height - safeTop - safeBottom - margin * 2);
    const width = Math.min(bubbleSize.width, limitW);
    const height = Math.min(bubbleSize.height, limitH);

    const minLeft = safeLeft + margin;
    const minTop = safeTop + margin;
    const maxLeft = viewport.width - safeRight - margin - width;
    const maxTop = viewport.height - safeBottom - margin - height;

    const targetLeft = target.left;
    const targetTop = target.top;
    const targetRight = Number.isFinite(target.right) ? target.right : target.left + target.width;
    const targetBottom = Number.isFinite(target.bottom) ? target.bottom : target.top + target.height;
    const targetWidth = Number.isFinite(target.width) ? target.width : targetRight - targetLeft;
    const targetHeight = Number.isFinite(target.height) ? target.height : targetBottom - targetTop;

    const clampX = x => Math.max(minLeft, Math.min(maxLeft, x));
    const clampY = y => Math.max(minTop, Math.min(maxTop, y));

    function fits(left, top) {
        return left >= minLeft && left + width <= viewport.width - safeRight - margin &&
               top >= minTop && top + height <= viewport.height - safeBottom - margin;
    }

    function candidate(place) {
        switch (place) {
            case 'above':
                return {
                    left: targetLeft + targetWidth / 2 - width / 2,
                    top: targetTop - gap - height,
                    placement: 'above'
                };
            case 'below':
                return {
                    left: targetLeft + targetWidth / 2 - width / 2,
                    top: targetBottom + gap,
                    placement: 'below'
                };
            case 'left':
                return {
                    left: targetLeft - gap - width,
                    top: targetTop + targetHeight / 2 - height / 2,
                    placement: 'left'
                };
            default:
                return {
                    left: targetRight + gap,
                    top: targetTop + targetHeight / 2 - height / 2,
                    placement: 'right'
                };
        }
    }

    const requested = candidate(placement);
    if (fits(requested.left, requested.top)) return rectOf(requested, width, height);

    const opposite = { above: 'below', below: 'above', left: 'right', right: 'left' };
    const flipped = candidate(opposite[placement] || 'below');
    if (fits(flipped.left, flipped.top)) return rectOf(flipped, width, height);

    const order = ['below', 'above', 'right', 'left'];
    for (const place of order) {
        const c = candidate(place);
        if (fits(c.left, c.top)) return rectOf(c, width, height);
    }

    return rectOf({ left: clampX(requested.left), top: clampY(requested.top), placement: requested.placement }, width, height);
}

function rectOf(c, width, height) {
    return {
        left: c.left,
        top: c.top,
        right: c.left + width,
        bottom: c.top + height,
        width,
        height,
        placement: c.placement
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { computeTourBubbleRect };
}/* ============================================================
   PSEUDOPY LEARNING LAYER — Evidence Store
   ------------------------------------------------------------
   Persists one EvidenceRecord per translation attempt for
   students, seeds a rich deterministic demo dataset derived from
   SEED_ACTIVITY_LIST, and tracks tutorial progress. All DB
   access is defensive: the learning layer must never break the
   main translator or accounts.
   ============================================================ */

function evHash(text) {
    let h = 5381;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) | 0; }
    return 'h' + Math.abs(h).toString(16);
}

function evUserId() {
    try {
        if (typeof currentUser === 'undefined' || !currentUser) return null;
        return currentUser._docId || currentUser.id;
    } catch (e) { return null; }
}

function evUserName() {
    try { return currentUser ? currentUser.fullName : ''; } catch (e) { return ''; }
}

function evInstructorId() {
    try { return currentUser ? (currentUser.instructorId || 'u2') : 'u2'; } catch (e) { return 'u2'; }
}

/**
 * Build an EvidenceRecord from a runLearningPipeline() result.
 * @param {TranslationResult} pipelineResult
 * @returns {EvidenceRecord|null}
 */
function buildEvidenceRecord(pipelineResult) {
    if (!pipelineResult || !pipelineResult.compile) return null;
    const userId = evUserId();
    const t = pipelineResult.tallies || {};
    const errorTypes = (pipelineResult.compile.errors || []).map(e => e.type || e.message || 'Error');
    const unique = arr => Array.from(new Set(arr.filter(Boolean)));
    return {
        studentId: userId,
        studentName: evUserName(),
        instructorId: evInstructorId(),
        valid: !!pipelineResult.valid,
        tallies: {
            error: t.error || 0,
            warning: t.warning || 0,
            suggestion: t.suggestion || 0,
            success: t.success || 0
        },
        errorCategories: unique(pipelineResult.errorCategories || []),
        gapCategories: unique(pipelineResult.gapCategories || []),
        patternTypes: unique(pipelineResult.patternTypes || []),
        compileMetadata: {
            errorTypes: unique(errorTypes),
            hasSource: !!pipelineResult.source,
            sourceHash: evHash(pipelineResult.source)
        },
        timestamp: new Date().toISOString()
    };
}

/** Persist one evidence record for the current logged-in student. */
async function captureEvidence(pipelineResult) {
    const userId = evUserId();
    if (!userId) return null;
    const record = buildEvidenceRecord(pipelineResult, { studentId: userId });
    if (!record) return null;
    record._docId = 'ev_' + userId + '_' + Date.now();
    try { return await dbAdd(evidenceRef, record); } catch (e) { return null; }
}

/* ── Seeded demo evidence (deterministic, from SEED_ACTIVITY_LIST) ── */

function evSeedDocIdFromStudent(student, studentId) {
    if (student === 'Eduard John Mirandilla') return 'u_stu_emirandilla';
    if (student === 'Mikaella Daet') return 'u_stu_mdaet';
    const match = String(studentId || '').match(/-(\d+)$/) || String(studentId || '').match(/(\d+)$/);
    const n = match ? parseInt(match[1], 10) : NaN;
    if (n >= 1 && n <= 30) return 'u_stu_' + (n + 2);
    return 'u_stu_' + (n || 99);
}

const EV_ERROR_TYPE_CATEGORIES = {
    'Syntax Error': ['syntax'],
    'Logic Error': ['logic'],
    'Missing END': ['structure'],
    'Indentation Error': ['structure', 'readability'],
    'Type Error': ['logic', 'translation']
};

const EV_EXERCISE_PATTERNS = [
    { match: /sum of odd|while loop|series/i, patterns: ['sentinel-controlled-loop', 'accumulator'] },
    { match: /factorial/i, patterns: ['counter-controlled-loop', 'accumulator'] },
    { match: /branching|multiples of/i, patterns: ['counter-controlled-loop', 'selection'] },
    { match: /multiply|array/i, patterns: ['counter-controlled-loop'] }
];

function evPatternsForExercise(exerciseTitle) {
    const hit = EV_EXERCISE_PATTERNS.find(p => p.match.test(exerciseTitle || ''));
    return hit ? hit.patterns : ['sequence'];
}

function evCategoriesForErrorType(errorType) {
    return EV_ERROR_TYPE_CATEGORIES[errorType] || ['syntax'];
}

function evGapForCategories(categories) {
    const map = { syntax: 'syntax', structure: 'structure', logic: 'logic', readability: 'readability', translation: 'translation' };
    return categories.map(c => map[c]).filter(Boolean);
}

/**
 * Deterministically derive an EvidenceRecord from one SEED_ACTIVITY_LIST row.
 * No random values — everything follows from the seed fields + index.
 */
function buildSeedEvidenceFromActivity(activity, index) {
    const completed = activity.status === 'Completed';
    const failed = activity.status === 'Failed';
    const score = parseInt(String(activity.score || '0').replace(/\D/g, ''), 10) || 0;

    const errorTypes = failed ? [activity.errorType || 'Syntax Error'] : [];
    const errorCategories = failed ? evCategoriesForErrorType(activity.errorType) : [];
    const gapCategories = failed ? evGapForCategories(errorCategories) : [];
    const patternTypes = completed ? evPatternsForExercise(activity.exercise) : [];

    const warningCount = completed ? (score < 100 ? 1 : 0) : 0;
    const suggestionCount = completed ? (activity.difficulty === 'hard' ? 1 : 0) : 0;
    const successCount = completed ? 1 : 0;

    return {
        _docId: 'ev_seed_' + activity._docId,
        studentId: evSeedDocIdFromStudent(activity.student, activity.studentId),
        studentName: activity.student,
        instructorId: activity.instructorId || 'u2',
        valid: completed,
        tallies: {
            error: failed ? errorCategories.length || 1 : 0,
            warning: warningCount,
            suggestion: suggestionCount,
            success: successCount
        },
        errorCategories: errorCategories,
        gapCategories: gapCategories,
        patternTypes: patternTypes,
        compileMetadata: {
            errorTypes: errorTypes,
            hasSource: true,
            sourceHash: evHash(activity.pseudocode || activity.submittedCode)
        },
        exerciseTitle: activity.exercise,
        difficulty: activity.difficulty,
        score: completed ? score : 0,
        seededFrom: 'activity:' + activity._docId,
        timestamp: new Date(activity.time || new Date().toISOString()).toISOString()
    };
}

/** Full deterministic demo evidence set derived from SEED_ACTIVITY_LIST. */
function getSeedEvidence() {
    return SEED_ACTIVITY_LIST
        .filter(a => a.status !== 'Pending')
        .map((a, i) => buildSeedEvidenceFromActivity(a, i));
}

/** Seed the evidence collection only when it is empty (mirrors seedDatabase). */
async function seedEvidenceIfEmpty() {
    try {
        const existing = await dbGetAll(evidenceRef);
        if (existing && existing.length >= 5) return true;
        const seeds = getSeedEvidence();
        for (const record of seeds) {
            try { await dbAdd(evidenceRef, record); } catch (e) { /* skip */ }
        }
        return true;
    } catch (e) {
        return false;
    }
}

/* ── Tutorial progress (per-student) ───────────────────────── */

async function getTutorialProgress(userId) {
    const id = userId || evUserId();
    if (!id) return null;
    try { return await dbGet(tutorialProgressRef, id); } catch (e) { return null; }
}

async function saveTutorialProgress(userId, data) {
    const id = userId || evUserId();
    if (!id) return null;
    const payload = Object.assign({
        updatedAt: new Date().toISOString(),
        completed: false,
        step: 0
    }, data || {});
    try { return await dbSet(tutorialProgressRef, id, payload); } catch (e) { return null; }
}

PseudoPyLearning.register.evidenceStore = {
    buildRecord: buildEvidenceRecord,
    capture: captureEvidence,
    getSeedEvidence: getSeedEvidence,
    seedEvidenceIfEmpty: seedEvidenceIfEmpty,
    seedFromActivity: buildSeedEvidenceFromActivity,
    getTutorialProgress: getTutorialProgress,
    saveTutorialProgress: saveTutorialProgress,
    hash: evHash
};/* ============================================================
   COMPILER METRICS DASHBOARD (Panel 1 — Evaluation)
   Benchmark runner, session metrics, and improvement tracking
   ============================================================ */

/**
 * Load all exercises from IndexedDB pseudopy_exercises store.
 * Falls back to fetching dataset.json if the store is empty.
 */
async function loadExercisesFromDB() {
    try {
        const exercises = await dbGetAll(exercisesRef);
        if (exercises && exercises.length > 0) {
            console.log(`[Benchmark] Loaded ${exercises.length} exercises from IndexedDB.`);
            return exercises;
        }
    } catch (e) {
        console.warn('[Benchmark] IndexedDB read failed, falling back to dataset.json:', e);
    }
    // Fallback
    console.log('[Benchmark] Fetching dataset.json as fallback...');
    const res = await fetch('dataset.json');
    if (!res.ok) throw new Error('Failed to fetch dataset.json: ' + res.status);
    const raw = await res.json();
    return Array.isArray(raw) ? raw : (raw.dataset || []);
}

/**
 * Load and render the Compiler Metrics page.
 * Displays: Session Metrics, Benchmark Results, Pipeline Timing.
 */
function loadCompilerMetrics() {
    if (typeof metricsEngine === 'undefined') return;

    // ── Session Metrics Cards ──
    const session = metricsEngine.getSessionMetrics();
    const improvement = metricsEngine.getImprovementMetrics();

    setText('metric-total-translations', session.totalTranslations);
    setText('metric-compilation-rate', session.compilationSuccessRate + '%');
    setText('metric-runtime-error-rate', session.runtimeErrorRate + '%');
    setText('metric-avg-gen-time', session.avgGenerationTime + 'ms');
    setText('metric-total-errors', session.totalErrors);
    setText('metric-total-executions', session.totalExecutions);

    // Error trend badge
    const trendEl = $id('metric-error-trend');
    const trendIcons = { improving: '↑ Improving', declining: '↓ Declining', stable: '— Stable' };
    const trendClasses = { improving: 'positive', declining: 'negative', stable: '' };
    if (trendEl) {
        trendEl.textContent = trendIcons[session.errorTrend] || '— Stable';
        trendEl.className = 'stat-change ' + (trendClasses[session.errorTrend] || '');
    }

    // ── Improvement Section ──
    const improvementEl = $id('metrics-improvement-section');
    if (improvement.hasData) {
        improvementEl.innerHTML = `
        <div class="stats-grid" style="margin-bottom: 1rem;">
          <div class="stat-card">
            <div class="stat-icon">{{ui:ChartNoAxesCombined}}</div>
            <div class="stat-value">${improvement.correctnessImprovement}%</div>
            <div class="stat-label">Correctness Improvement</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">{{ui:Zap}}</div>
            <div class="stat-value">${improvement.speedImprovement}%</div>
            <div class="stat-label">Speed Improvement</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">{{ui:CircleCheck}}</div>
            <div class="stat-value">${improvement.overallSuccessRate}%</div>
            <div class="stat-label">Overall Success Rate</div>
          </div>
        </div>`;
    } else {
        improvementEl.innerHTML = `<div class="empty-state" style="padding: 1.5rem;">
            <div class="empty-icon">{{ui:ChartColumn}}</div>
            <h3>No Improvement Data Yet</h3>
            <p>${improvement.message}</p>
        </div>`;
    }

    // ── Pipeline Timing Chart ──
    const timing = metricsEngine.getAveragePipelineTiming();
    renderPipelineTimingChart(timing);

    // ── Restore previous benchmark results if available ──
    if (metricsEngine.benchmarkResults) {
        renderBenchmarkResults(metricsEngine.benchmarkResults);
    }
}

/**
 * Run the automated benchmark.
 * Data source  : pseudopy_exercises IndexedDB store (seeded from dataset.json).
 * Computation  : MetricsEngine.runBenchmark() — strict mathematical formulas.
 * Deliverable  : Populates all dashboard cards, per-test table, concept mastery.
 */
async function runBenchmarkTest() {
    const btn = $id('run-benchmark-btn');
    if (btn) { btn.disabled = true; btn.textContent = '{{ui:Hourglass}} Running...'; }
    showToast('Running benchmark... loading exercises from database.', 'info');

    try {
        // Load from IndexedDB — no fetch/CORS errors
        const dataset = await loadExercisesFromDB();

        if (!dataset || dataset.length === 0) {
            showToast('No test cases found. Please reload the app to seed the database.', 'error');
            return;
        }

        showToast(`Running ${dataset.length} test cases through the compiler…`, 'info');

        // Yield to browser so toast renders before heavy synchronous computation
        await new Promise(r => setTimeout(r, 80));

        // Run benchmark pipeline with mathematical metrics engine
        const results = metricsEngine.runBenchmark(dataset, compilerEngine);

        // Render all sections
        renderBenchmarkResults(results);

        showToast(
            `{{ui:CircleCheck}} Benchmark complete! Accuracy: ${results.accuracy}% · F1: ${results.f1Score}% · ${results.totalTestCases} test cases.`,
            'success'
        );
    } catch (err) {
        console.error('[Benchmark] Error:', err);
        showToast('Benchmark failed: ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '{{ui:FlaskConical}} Run Benchmark'; }
    }
}

/**
 * Render all benchmark results into the dashboard.
 * Populates: B. summary cards, per-test table, E. concept mastery table.
 */
function renderBenchmarkResults(results) {
    // ── Summary Cards ──
    setText('benchmark-accuracy', results.accuracy + '%');
    setText('benchmark-precision', results.avgPrecision + '%');
    setText('benchmark-recall', results.avgRecall + '%');
    setText('benchmark-f1', results.f1Score + '%');
    setText('benchmark-compile-rate', results.compilationSuccessRate + '%');
    setText('benchmark-avg-time', results.avgTimeMs + 'ms');

    // Per-Test-Case Detail Table
    const wrapper = $id('benchmark-detail-wrapper');
    const totalLabel = $id('benchmark-total-label');
    if (wrapper) wrapper.style.display = 'block';
    if (totalLabel) totalLabel.textContent = `${results.totalTestCases} test cases`;

    // ── Detailed Results Table ──
    const tbody = $id('benchmark-results-body');
    if (tbody) {
        tbody.innerHTML = results.results.map(r => `
        <tr>
          <td style="font-weight:600;color:var(--text-primary)">${r.id}</td>
          <td>${r.concept}</td>
          <td><span class="badge ${r.compiled ? 'badge-active' : 'badge-inactive'}">${r.compiled ? '{{ui:CircleCheck}} Pass' : '{{ui:CircleX}} Fail'}</span></td>
          <td><span class="badge ${r.exactMatch ? 'badge-active' : 'badge-student'}">${r.exactMatch ? '{{ui:CircleCheck}} Match' : '{{ui:TriangleAlert}} Diff'}</span></td>
          <td style="font-weight:500">${(r.precision * 100).toFixed(0)}%</td>
          <td style="font-weight:500">${(r.recall * 100).toFixed(0)}%</td>
          <td style="color:var(--text-muted)">${r.timeMs}ms</td>
        </tr>`).join('');
    }

    // ── Concept Mastery Table ──
    const masteryBody = $id('concept-mastery-body');
    if (masteryBody) {
        const conceptData = metricsEngine.getConceptMastery();
        if (conceptData.length === 0) {
            masteryBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:1rem;color:var(--text-muted)">No concept data available.</td></tr>';
        } else {
            masteryBody.innerHTML = conceptData.map(c => {
                let masteryLabel, masteryColor;
                if (c.accuracy >= 80) { masteryLabel = '{{ui:Circle}} Expert'; masteryColor = '#22c55e'; }
                else if (c.accuracy >= 60) { masteryLabel = '{{ui:Circle}} Proficient'; masteryColor = '#3b82f6'; }
                else if (c.accuracy >= 40) { masteryLabel = '{{ui:Circle}} Developing'; masteryColor = '#f59e0b'; }
                else { masteryLabel = '{{ui:Circle}} Beginner'; masteryColor = '#ef4444'; }

                return `<tr>
                  <td style="font-weight:600;color:var(--text-primary)">${c.concept}</td>
                  <td style="color:var(--text-muted)">${c.total}</td>
                  <td><span style="font-weight:600;color:${c.successRate >= 80 ? '#22c55e' : '#f59e0b'}">${c.successRate}%</span></td>
                  <td><span style="font-weight:600;color:${c.accuracy >= 60 ? '#22c55e' : '#ef4444'}">${c.accuracy}%</span></td>
                  <td>${c.precision}%</td>
                  <td><span style="color:${masteryColor};font-weight:700">${masteryLabel}</span></td>
                </tr>`;
            }).join('');
        }
    }
}

/**
 * Render pipeline timing bar chart.
 */
function renderPipelineTimingChart(timing) {
    const container = $id('chart-pipeline-timing');
    if (!container) return;

    if (timing.count === 0) {
        container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:2rem;">No timing data yet. Translate some pseudocode first.</div>';
        return;
    }

    const stages = [
        { name: 'Lexer', value: timing.avgLexTime, color: '#3b82f6' },
        { name: 'Parser', value: timing.avgParseTime, color: '#6366f1' },
        { name: 'Semantic', value: timing.avgSemanticTime, color: '#8b5cf6' },
        { name: 'CodeGen', value: timing.avgCodeGenTime, color: '#22c55e' }
    ];

    const max = Math.max(...stages.map(s => s.value), 0.001);
    container.innerHTML = stages.map(s =>
        '<div class="chart-bar" style="height:' + Math.max((s.value / max) * 180, 20) + 'px;background:' + s.color + '">' +
        '<span class="bar-value">' + s.value + 'ms</span>' +
        '<span class="bar-label">' + s.name + '</span>' +
        '</div>'
    ).join('');
}


if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}


/* ============================================================
   PWA INSTALL PROMPT
   ============================================================ */

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log('[PWA] Install prompt available');
});

function installPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((result) => {
            if (result.outcome === 'accepted') showToast('PseudoPy installed as an app!', 'success');
            deferredPrompt = null;
        });
    }
}

if (typeof window !== 'undefined' && window.navigator && window.navigator.standalone === true) {
    document.body.classList.add('ios-standalone');
}

/**
 * Toggles visibility of a password field.
 * @param {string} inputId The ID of the password input element
 * @param {HTMLElement} btn The button element to update the icon
 */
function togglePasswordVisibility(inputId, btn) {
    const input = $id(inputId);
    if (!input) return;

    if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = '<i data-lucide="eye-off" aria-hidden="true"></i>';
    } else {
        input.type = 'password';
        btn.innerHTML = '<i data-lucide="eye" aria-hidden="true"></i>';
    }
    refreshIcons(btn);
}
window.togglePasswordVisibility = togglePasswordVisibility;


/* ============================================================
   PASSWORD MANAGEMENT
   ============================================================ */

async function handleChangePassword() {
    const currentParam = getValue('cp-current-password');
    const newParam = getValue('cp-new-password');
    const confirmParam = getValue('cp-confirm-password');

    if (!currentParam || !newParam || !confirmParam) {
        showToast('Please fill in all fields.', 'error');
        return;
    }

    // Verify current password using hash-based check
    let currentValid = false;
    if (currentUser.passwordHash && currentUser.passwordSalt) {
        currentValid = await verifyPassword(currentParam, currentUser.passwordHash, currentUser.passwordSalt);
    } else if (currentUser.password) {
        // Legacy plaintext fallback
        currentValid = (currentParam === currentUser.password);
    }

    if (!currentValid) {
        showToast('Incorrect current password.', 'error');
        return;
    }



    if (newParam !== confirmParam) {
        showToast('New passwords do not match.', 'error');
        return;
    }

    try {
        const salt = generateSalt();
        const hash = await hashPassword(newParam, salt);

        const stored = await dbGet(usersRef, currentUser._docId);
        if (stored) {
            delete stored.password;
            stored.passwordHash = hash;
            stored.passwordSalt = salt;
            await dbSet(usersRef, stored._docId, stored);
        }

        // Update local state
        delete currentUser.password;
        currentUser.passwordHash = hash;
        currentUser.passwordSalt = salt;

        const uIndex = cachedUsers.findIndex(u => u.id === currentUser.id);
        if (uIndex !== -1) {
            delete cachedUsers[uIndex].password;
            cachedUsers[uIndex].passwordHash = hash;
            cachedUsers[uIndex].passwordSalt = salt;
        }

        await logAuditAction({
            action: 'password_changed',
            studentId: currentUser._docId || currentUser.id,
            studentName: currentUser.fullName,
            username: currentUser.username,
            instructorId: null,
            instructorName: null,
            requestId: null
        });

        showToast('Password updated successfully!', 'success');

        // Clear fields
        setValue('cp-current-password', '');
        setValue('cp-new-password', '');
        setValue('cp-confirm-password', '');
    } catch (err) {
        console.error('[Offline Database] Change password error:', err);
        showToast('Failed to update password.', 'error');
    }
}

// toggleUserPasswordVisibility() was removed for security.
// Instructor views of student accounts must NEVER display passwords.
// Use the Password Recovery workflow for access issues.

// ── Data Management ──
async function exportData(type) {
    try {
        let exportDataObj = null;
        let filename = 'pseudopy_export.json';

        if (type === 'users') {
            const users = await refreshUsers();
            const instructors = users.filter(u => u.role === 'instructor');
            if (!instructors || instructors.length === 0) {
                return showToast('No instructor data to export.', 'info');
            }
            exportDataObj = instructors.map(u => ({
                id: u.id || u._docId,
                fullName: u.fullName,
                username: u.username,
                email: u.email,
                role: u.role,
                status: u.status,
                createdBy: u.createdBy || 'u1'
            }));
            filename = `pseudopy_instructors_${new Date().toISOString().split('T')[0]}.json`;
        } else {
            const dataStr = localStorage.getItem('pseudopy_' + type);
            if (!dataStr) return showToast('No data to export.', 'info');
            exportDataObj = JSON.parse(dataStr);
            filename = `pseudopy_${type}_${new Date().toISOString().split('T')[0]}.json`;
        }

        const blob = new Blob([JSON.stringify(exportDataObj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Data exported successfully!', 'success');
    } catch (err) {
        console.error('[ExportData]', err);
        showToast('Failed to export data.', 'error');
    }
}

/* ============================================================
   UI ENHANCEMENTS: THEME & FORMATTER
   ============================================================ */

/**
 * Toggles between Light and Dark mode
 */
function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('pseudopy_theme', newTheme);

    const themeButton = $id('theme-toggle-btn');
    if (themeButton) {
        themeButton.innerHTML = `<i data-lucide="${newTheme === 'dark' ? 'sun-moon' : 'sun'}" aria-hidden="true"></i>`;
        refreshIcons(themeButton);
    }
    showToast(`Switched to ${newTheme} mode`, 'info');
}

/**
 * Automatically formats pseudocode with consistent indentation
 */
function autoFormatPseudocode() {
    const editor = $id('pseudocode-editor');
    if (!editor) return;

    const lines = editor.value.split('\n');
    let indentLevel = 0;
    const indentSize = 2; // Spaces per level

    const formattedLines = lines.map(line => {
        let trimmed = line.trim();
        if (!trimmed) return '';

        // Keywords that decrease indentation BEFORE the line
        if (trimmed.match(/^(END|ELSE|NEXT|UNTIL)/i)) {
            indentLevel = Math.max(0, indentLevel - 1);
        }

        const spaces = ' '.repeat(indentLevel * indentSize);
        const result = spaces + trimmed;

        // Keywords that increase indentation AFTER the line
        if (trimmed.match(/^(BEGIN|IF|WHILE|FOR|REPEAT|ELSE|FUNCTION|PROCEDURE|CASE)/i)) {
            // But don't increase if it's an inline IF or a single-line block
            if (!trimmed.match(/THEN.*END\s+IF/i) && !trimmed.match(/DO.*DONE/i)) {
                indentLevel++;
            }
        }

        return result;
    });

    editor.value = formattedLines.join('\n');
    updateGutter(); // Refresh line numbers
    showToast('Pseudocode formatted!', 'success');
}
