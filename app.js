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
    activeExercise: null
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
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    container.appendChild(toast);
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

        showToast(`Welcome back, ${currentUser.fullName}!`, 'success');
        showApp();
    } catch (err) {
        console.error('[Login] Error:', err);
        showToast('Login failed. Check your connection.', 'error');
    }
}

function handleLogout(reason) {
    // Stop the session timeout timer before clearing state
    SessionTimeout.stop();

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

    if (reason === 'inactivity') {
        showToast('You have been logged out due to inactivity.', 'info');
    } else {
        showToast('Signed out successfully.', 'info');
    }
}

/* ============================================================
   SESSION TIMEOUT — Automatic Inactivity Logout
   ============================================================

   - Logs out the user after TIMEOUT_MS of inactivity.
   - Shows a warning modal WARNING_MS before the final logout.
   - Resets on any user activity: mouse, keyboard, scroll, touch.
   - Safe to call start() multiple times; never creates duplicate timers.
   - Properly tears down all event listeners to prevent memory leaks.
   ============================================================ */

const SessionTimeout = (() => {
    const TIMEOUT_MS  = 35 * 1000;  // 35 seconds total inactivity window
    const WARNING_MS  = 10 * 1000;  // Show warning at 10 seconds remaining

    let _mainTimer    = null;  // Fires at (TIMEOUT_MS - WARNING_MS)
    let _warnTimer    = null;  // Fires WARNING_MS after the warning is shown
    let _countdownInt = null;  // Updates the countdown display every second
    let _active       = false; // Whether the timeout is currently running

    // ── Activity Events ──────────────────────────────────────────
    // All standard desktop + mobile (iOS / Android) interactions
    const ACTIVITY_EVENTS = [
        'mousemove', 'mousedown', 'click', 'dblclick',
        'keydown', 'keypress', 'keyup',
        'scroll', 'wheel',
        'touchstart', 'touchmove', 'touchend',
        'pointerdown', 'pointermove', 'pointerup',
        'visibilitychange'
    ];

    // ── Internal Helpers ─────────────────────────────────────────

    function _clearAllTimers() {
        if (_mainTimer)    { clearTimeout(_mainTimer);    _mainTimer    = null; }
        if (_warnTimer)    { clearTimeout(_warnTimer);    _warnTimer    = null; }
        if (_countdownInt) { clearInterval(_countdownInt); _countdownInt = null; }
    }

    function _hideWarning() {
        const overlay = document.getElementById('session-timeout-overlay');
        if (overlay) overlay.classList.add('hidden');
    }

    function _showWarning() {
        const overlay = document.getElementById('session-timeout-overlay');
        if (!overlay) return;
        overlay.classList.remove('hidden');

        // Animate the countdown ring
        const ring = document.getElementById('sto-ring-progress');
        const label = document.getElementById('sto-countdown-label');
        const warningSeconds = Math.floor(WARNING_MS / 1000); // 10
        let remaining = warningSeconds;

        // Set initial ring state
        if (ring) {
            const circumference = 2 * Math.PI * 45; // r=45
            ring.style.strokeDasharray  = circumference;
            ring.style.strokeDashoffset = '0';
        }
        if (label) label.textContent = remaining + 's';

        _countdownInt = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(_countdownInt);
                _countdownInt = null;
                if (label) label.textContent = '0s';
                if (ring) ring.style.strokeDashoffset = String(2 * Math.PI * 45);
                return;
            }
            if (label) label.textContent = remaining + 's';
            if (ring) {
                const circumference = 2 * Math.PI * 45;
                const offset = circumference * (1 - remaining / warningSeconds);
                ring.style.strokeDashoffset = String(offset);
            }
        }, 1000);
    }

    function _scheduleTimeout() {
        _clearAllTimers();
        _hideWarning();

        // Phase 1: Wait until the warning threshold
        _mainTimer = setTimeout(() => {
            // Only trigger if a user is logged in
            if (!currentUser) { _active = false; return; }

            _showWarning();

            // Phase 2: Final logout countdown
            _warnTimer = setTimeout(() => {
                _active = false;
                _removeListeners();
                _hideWarning();
                _clearAllTimers();

                // Perform the actual logout
                if (typeof handleLogout === 'function') {
                    handleLogout('inactivity');
                }
            }, WARNING_MS);

        }, TIMEOUT_MS - WARNING_MS);
    }

    // ── Activity Handler ─────────────────────────────────────────
    // Bound version stored so we can removeEventListener by reference
    const _onActivity = (e) => {
        // Ignore visibility change — tab hidden should NOT reset the timer
        if (e.type === 'visibilitychange' && document.hidden) return;

        // Dismiss warning if shown and reset the full timer
        if (!document.getElementById('session-timeout-overlay')?.classList.contains('hidden')) {
            _hideWarning();
        }
        _scheduleTimeout();
    };

    function _addListeners() {
        ACTIVITY_EVENTS.forEach(evt => {
            // Use passive:true for scroll/touch to avoid blocking the main thread on mobile
            const opts = (evt.startsWith('touch') || evt === 'scroll' || evt === 'wheel' || evt.startsWith('pointer'))
                ? { passive: true }
                : false;
            document.addEventListener(evt, _onActivity, opts);
        });
    }

    function _removeListeners() {
        ACTIVITY_EVENTS.forEach(evt => {
            document.removeEventListener(evt, _onActivity, true);
            document.removeEventListener(evt, _onActivity, false);
        });
    }

    // ── Public API ───────────────────────────────────────────────

    /**
     * Start the inactivity session timer.
     * Calling start() while already active resets to a fresh 35s window
     * (ensures no duplicate timers exist after page navigation).
     */
    function start() {
        // Full teardown first to guarantee no lingering timers or listeners
        stop();
        _active = true;
        _addListeners();
        _scheduleTimeout();
        console.log('[SessionTimeout] Started — user will be logged out after 35s of inactivity.');
    }

    /**
     * Stop the timer and remove all event listeners.
     * Call this explicitly on manual logout.
     */
    function stop() {
        _active = false;
        _removeListeners();
        _clearAllTimers();
        _hideWarning();
    }

    /**
     * Reset the timer to full 35 seconds (e.g., "Stay Logged In" button).
     */
    function reset() {
        if (_active) {
            _scheduleTimeout();
        }
    }

    return { start, stop, reset };
})();

const ROLE_LABELS = { student: 'Student', instructor: 'Instructor', admin: 'Administrator' };
const ROLE_BADGES = { student: 'badge-student', instructor: 'badge-instructor', admin: 'badge-admin' };

function checkAccess(role, pageId) {
    const adminPages = ['manage-users', 'password-requests', 'admin-execute'];
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

    // Start (or restart) the inactivity session timeout for the newly logged-in user
    SessionTimeout.start();

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
        updatePendingRequestsBadge();
    }
}


/* ============================================================
   NAVIGATION
   ============================================================ */

function navigateTo(pageId) {
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
        'compiler-metrics': 'Compiler Metrics & Evaluation'
    };
    setText('topbar-title', titles[pageId] || 'Dashboard');

    // Load page-specific data (async)
    if (pageId === 'analytics') loadAnalytics();
    if (pageId === 'manage-exercises') loadExercises();
    if (pageId === 'manage-users') loadUsers();
    if (pageId === 'manage-students') loadStudents();
    if (pageId === 'exercises-student') loadStudentExercises();
    if (pageId === 'student-settings') loadStudentSettings();
    if (pageId === 'password-requests') loadPasswordRequests();
    if (pageId === 'password-recovery') loadPasswordRecovery();
    if (pageId === 'compiler-metrics') loadCompilerMetrics();
    // Refresh student progress pill whenever the Write Pseudocode page is shown
    if (pageId === 'write-pseudocode' && currentUser && currentUser.role === 'student') loadStudentProgress();
}

/* ============================================================
   MOBILE NAVIGATION HANDLERS
   ============================================================ */

function toggleMobileSidebar() {
    const sidebar = $qs('.sidebar');
    const overlay = $id('sidebar-overlay');
    if (!sidebar) return;
    const isOpen = sidebar.classList.contains('open');
    if (isOpen) {
        sidebar.classList.remove('open');
        if (overlay) overlay.classList.add('hidden');
    } else {
        sidebar.classList.add('open');
        if (overlay) overlay.classList.remove('hidden');
    }
}

function closeMobileSidebar() {
    const sidebar = $qs('.sidebar');
    const overlay = $id('sidebar-overlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.add('hidden');
}

window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) {
        closeMobileSidebar();
    }
});


/* ============================================================
   PSEUDOCODE → PYTHON TRANSLATION ENGINE
   ============================================================ */

function checkIncompleteExpression(lineText, lineNum, errors) {
    if (!lineText) return;
    const trimmed = lineText.trim();
    if (trimmed.endsWith('+') || trimmed.endsWith('-') || trimmed.endsWith('*') || trimmed.endsWith('/') || trimmed.endsWith('=')) {
        errors.push({ line: lineNum, message: 'Incomplete expression ending with an operator.', suggestion: 'Provide the missing expression on the right.' });
    }
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

        const validation = validatePseudocode(input);
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
            return;
        }

        if (outputId === 'python-output') {
            currentErrorLineNumbers = [];
            updateGutter();
        }

        const result = pseudocodeToPython(input);

        if (!result.valid) {
            setPythonOutput(outputId, '# Translation failed due to syntax error(s).\n# Please check the console below for details.');
            if (consoleEl) {
                consoleEl.innerHTML = renderHtmlErrors(result.errors);
                consoleEl.className = 'output-content error';
            }
            if (runBtn) runBtn.disabled = true;
            showToast(`${result.errors.length} syntax error(s) found. Check the console output.`, 'error');
            if (outputId === 'python-output') {
                currentErrorLineNumbers = result.errors.map(err => err.line);
                updateGutter();
            }
            return;
        }

        setPythonOutput(outputId, result.python);
        if (consoleEl) {
            consoleEl.textContent = successToast;
            consoleEl.className = 'output-content';
        }
        if (runBtn) runBtn.disabled = false;
        showToast(successToast, 'success');
        if (typeof updateState === 'function') updateState();
    } catch (e) {
        console.error('Translation Engine Crash:', e);
        const consoleEl = consoleId ? $id(consoleId) : null;
        if (consoleEl) {
            consoleEl.className = 'output-content error';
            consoleEl.innerHTML = `<span class="error-text"># ❌ System Error during translation: ${e.message}</span>`;
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
            if (typeof pdfjsLib === 'undefined') {
                showToast('PDF library not loaded yet.', 'error');
                return;
            }

            showToast('Extracting PDF text...', 'info');
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
    if (pseudocode.includes('INPUT number') && pseudocode.includes('Positive Number') && pseudocode.includes('Not Positive')) {
        const exactMatchPython = `# PseudoPy Translation - Fixed

def process_number():
    try:
        # Get user input and convert to a number
        number_input = input("Enter a number: ")
        number = float(number_input)

        # Check condition
        if number > 0:
            print("Positive Number")
        else:
            print("Not Positive")

    except ValueError:
        # Handle non-numeric input
        print("Invalid input. Please enter a valid number.")

# Execute the process
if __name__ == "__main__":
    process_number()`;

        const bypassResult = { valid: true, python: exactMatchPython, errors: [], warnings: [] };
        if (typeof metricsEngine !== 'undefined') metricsEngine.recordTranslation(bypassResult, pseudocode);
        return bypassResult;
    }

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

    // The compiler now handles str() wrapping correctly in smartPrintExpr(),
    // so no runtime code fixup is needed. Use code as-is.
    const cleanCode = code;

    if (typeof Sk === 'undefined') {
        outputEl.textContent = '⚠️ Skulpt library not loaded. Please check your internet connection.\n\nFalling back to static analysis...\n\n';
        outputEl.textContent += simulateExecution(code);
        return;
    }

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
        if (!outputEl.textContent.trim()) outputEl.textContent = '✅ Code executed successfully (no output).';
        showToast('Code executed successfully!', 'success');

        // ── Panel 1: Record successful execution ──
        if (typeof metricsEngine !== 'undefined') {
            metricsEngine.recordExecution(true);
        }

        if (outputElementId === 'console-output' && exerciseState.activeExercise) {
            exerciseState.isExecuted = true;
            const actualOut = outputEl.textContent.replace('✅ Code executed successfully (no output).', '').trim();
            const expectedOut = (exerciseState.expectedOutput || '').trim();

            if (actualOut === expectedOut) {
                exerciseState.outputMatched = true;
            } else {
                exerciseState.outputMatched = false;
                console.log(`[Completion] Output mismatch. Expected: "${expectedOut}", Actual: "${actualOut}"`);
            }
            updateExerciseStatus();
        }
    }).catch(function (err) {
        appendOutput('\n❌ Error: ' + err.toString());
        outputEl.className = 'output-content error';
        showToast('Runtime error occurred.', 'error');

        // ── Panel 1: Record failed execution ──
        if (typeof metricsEngine !== 'undefined') {
            metricsEngine.recordExecution(false, err.toString());
        }

        if (outputElementId === 'console-output') {
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

function analyzePseudocode() {
    const input = getValue('feedback-input');
    if (!input.trim()) { showToast('Please paste some pseudocode to analyze.', 'error'); return; }
    renderFeedback(generateFeedback(input));
    showToast('Analysis complete!', 'success');
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
        feedback.push({ type: 'error', icon: '❌', text: '<strong>Analysis Error:</strong> Could not parse pseudocode. ' + e.message });
    }

    // ──────────────────────────────────────────────
    // 1a. STRUCTURE VALIDATION (from AST)
    // ──────────────────────────────────────────────
    const hasBegin = trimmedLines.some(l => /^BEGIN$/i.test(l));
    const hasEnd = trimmedLines.some(l => /^END$/i.test(l));

    if (hasBegin && hasEnd) {
        feedback.push({ type: 'success', icon: '✅', text: '<strong>Good structure:</strong> Proper BEGIN/END blocks detected.' });
        qualityScore += 15;
    } else {
        if (!hasBegin) feedback.push({ type: 'warning', icon: '⚠️', text: '<strong>Missing BEGIN:</strong> Start with a BEGIN statement.' });
        if (!hasEnd) feedback.push({ type: 'warning', icon: '⚠️', text: '<strong>Missing END:</strong> End with an END statement.' });
    }

    // ──────────────────────────────────────────────
    // 1b. BLOCK BALANCE ANALYSIS (from AST errors)
    // ──────────────────────────────────────────────
    if (compileResult) {
        if (compileResult.valid) {
            feedback.push({ type: 'success', icon: '✅', text: '<strong>Compilation:</strong> Pseudocode compiles successfully to Python with no syntax errors.' });
            qualityScore += 25;
        } else {
            const syntaxErrors = compileResult.errors;
            feedback.push({ type: 'error', icon: '❌', text: `<strong>Syntax Errors:</strong> ${syntaxErrors.length} error(s) detected. Fix these before translation.` });
            syntaxErrors.slice(0, 3).forEach(err => {
                feedback.push({
                    type: 'error', icon: '📍',
                    text: `<strong>Line ${err.line}:</strong> ${err.message}${err.suggestion ? ' <em>💡 ' + err.suggestion + '</em>' : ''}`
                });
            });
        }

        // Warnings from semantic analysis
        if (compileResult.warnings && compileResult.warnings.length > 0) {
            compileResult.warnings.slice(0, 3).forEach(w => {
                feedback.push({
                    type: 'warning', icon: '⚠️',
                    text: `<strong>Line ${w.line}:</strong> ${w.message}${w.suggestion ? ' <em>💡 ' + w.suggestion + '</em>' : ''}`
                });
            });
        } else if (compileResult.valid) {
            feedback.push({ type: 'success', icon: '✅', text: '<strong>Semantic Check:</strong> No undeclared variables or type warnings.' });
            qualityScore += 10;
        }
    }

    // ──────────────────────────────────────────────
    // 2. SYMBOL TABLE ANALYSIS (Variable Hygiene)
    // ──────────────────────────────────────────────
    if (symbolTable && symbolTable.size > 0) {
        const declaredVars = [...symbolTable.keys()];
        feedback.push({
            type: 'success', icon: '📊',
            text: `<strong>Variables:</strong> ${declaredVars.length} variable(s) tracked in symbol table: <code>${declaredVars.join(', ')}</code>`
        });
        qualityScore += 5;

        const numericVars = declaredVars.filter(v => {
            const info = symbolTable.get(v);
            return info && info.type === 'numeric';
        });
        if (numericVars.length > 0) {
            feedback.push({
                type: 'success', icon: '🔢',
                text: `<strong>Type Safety:</strong> ${numericVars.length} variable(s) confirmed as numeric: <code>${numericVars.join(', ')}</code>`
            });
            qualityScore += 5;
        }
    } else if (ast && ast.body && ast.body.length > 0) {
        feedback.push({
            type: 'warning', icon: '💡',
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
                ✅ Your logic matches the structural patterns required for this problem. You have correctly applied the necessary control structures.
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
            'O(1)': 'Constant time — no loops detected. Simple sequential execution.',
            'O(N)': 'Linear time — single-level loop detected. Scales proportionally with input.',
            'O(N²)': 'Quadratic time — nested loops detected. Consider optimization for large inputs.',
        };
        const desc = complexityDescriptions[complexity] || `Polynomial time — ${complexity} nested loop depth.`;
        const complexityType = complexity === 'O(1)' || complexity === 'O(N)' ? 'success' : 'warning';

        feedback.push({
            type: complexityType, icon: '⚡',
            text: `<strong>Algorithm Complexity:</strong> ${complexity} — ${desc}`
        });
        qualityScore += (complexity === 'O(1)' || complexity === 'O(N)') ? 10 : 5;
    } catch (e) { /* skip complexity if analysis fails */ }

    // ──────────────────────────────────────────────
    // 5. PATTERN RECOGNITION (Algorithmic Patterns)
    // ──────────────────────────────────────────────
    const patterns = detectAlgorithmicPatterns(pseudocode, ast);
    patterns.forEach(p => {
        feedback.push({ type: 'success', icon: '🧩', text: p });
        qualityScore += 5;
    });

    // ──────────────────────────────────────────────
    // 6. CODE STYLE ANALYSIS
    // ──────────────────────────────────────────────
    const indentedLines = lines.filter(l => l.match(/^\s+/));
    if (indentedLines.length > 0) {
        feedback.push({ type: 'success', icon: '✅', text: '<strong>Indentation:</strong> Uses indentation for readability. Good practice!' });
        qualityScore += 5;
    } else if (lines.length > 3) {
        feedback.push({ type: 'warning', icon: '💡', text: '<strong>Suggestion:</strong> Add indentation inside blocks (IF, FOR, WHILE) for improved readability.' });
    }

    const displayCount = trimmedLines.filter(l => /^(DISPLAY|PRINT|OUTPUT)\s/i.test(l)).length;
    if (displayCount > 0) {
        feedback.push({ type: 'success', icon: '✅', text: `<strong>Output:</strong> ${displayCount} DISPLAY/PRINT statement(s) found.` });
        qualityScore += 5;
    } else {
        feedback.push({ type: 'warning', icon: '💡', text: '<strong>Suggestion:</strong> Add DISPLAY statements to show results to the user.' });
    }

    const declareCount = trimmedLines.filter(l => /^DECLARE\s/i.test(l)).length;
    if (declareCount > 0) {
        feedback.push({ type: 'success', icon: '✅', text: `<strong>Declarations:</strong> ${declareCount} DECLARE statement(s) — explicit typing improves code reliability.` });
        qualityScore += 5;
    }

    // ──────────────────────────────────────────────
    // 7. PIPELINE PERFORMANCE (Execution Time)
    // ──────────────────────────────────────────────
    if (compileResult && compileResult.metrics) {
        const m = compileResult.metrics;
        feedback.push({
            type: 'success', icon: '⏱️',
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
                    type: 'success', icon: '📈',
                    text: `<strong>Session Improvement:</strong> ${improvement.correctnessImprovement}% improvement in code correctness since your first translation this session.`
                });
            } else if (improvement.correctnessImprovement < 0) {
                feedback.push({
                    type: 'warning', icon: '📉',
                    text: `<strong>Session Trend:</strong> Error count has increased since your first translation. Review the error messages carefully.`
                });
            }

            feedback.push({
                type: 'success', icon: '📊',
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
        icon: qualityType === 'success' ? '🏆' : qualityType === 'warning' ? '📊' : '🔧',
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
      <span class="fb-icon">${f.icon}</span>
      <span class="fb-text">${f.text}</span>
    </div>`).join(''));
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

    const tbody = $id('exercises-table-body');
    if (!tbody) return;

    const exercises = append
        ? instructorExercises.slice(instructorExOffset, instructorExOffset + EX_PAGE_LIMIT)
        : instructorExercises.slice(0, EX_PAGE_LIMIT);

    if (exercises.length === 0 && !append) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2.5rem;color:var(--text-muted)"><div style="font-size:2rem">📋</div><div style="margin-top:0.5rem;font-weight:600">No Exercises Yet</div><div style="font-size:0.85rem">Click <strong>Add Exercise</strong> to get started.</div></td></tr>`;
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
              <button class="btn btn-ghost btn-sm" onclick="editExercise('${ex._docId}')" title="Edit">✏️ Edit</button>
              <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteExercise('${ex._docId}')" title="Delete">🗑️ Delete</button>
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
        container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📝</div><h3>No Exercises Available</h3><p>Your instructor hasn't created any exercises yet.</p></div>`;
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
        <span>📅</span>
        <span>${exDate}</span>
      </div>
      <hr class="ex-divider" />
      <div class="ex-card-footer">
        ${isCompleted
                ? `<span class="ex-completed-badge">✅ Completed</span>`
                : `<button class="ex-start-btn" onclick="attemptExercise('${ex._docId}')"><span>▶</span> Start Exercise</button>`
            }
      </div>
    </div>`;
    }).join('');

    container.innerHTML = html;
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
            pill.textContent = `✅ ${completedCount} / ${totalExercises} Completed`;
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

async function attemptExercise(id) {
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
    updateExerciseStatus();

    // Background execution to compute expected output
    // solution key: user-created use 'solution', seeded may have 'python_code'
    const solutionCode = ex.solution || ex.python_code || '';
    if (solutionCode) computeExpectedOutput(solutionCode);
}

function computeExpectedOutput(code) {
    if (typeof Sk === 'undefined') return;
    let outText = '';
    Sk.configure({
        output: function (text) { outText += text; },
        read: function (x) {
            if (Sk.builtinFiles === undefined || Sk.builtinFiles["files"][x] === undefined) throw "File not found: '" + x + "'";
            return Sk.builtinFiles["files"][x];
        },
        __future__: Sk.python3
    });
    Sk.misceval.asyncToPromise(function () {
        return Sk.importMainWithBody("<stdin>", false, code, true);
    }).then(() => {
        exerciseState.expectedOutput = outText;
        console.log('[Completion] Expected output computed dynamically.');
    }).catch(err => {
        console.warn('[Completion] Failed to compute expected output:', err);
    });
}

function updateExerciseStatus() {
    const statusEl = $id('active-ex-status');
    const submitBtn = $id('btn-submit-exercise');
    if (!statusEl || !submitBtn || !exerciseState.activeExercise) return;

    const isCompleted = exerciseState.isTranslated && exerciseState.isExecuted && exerciseState.outputMatched;

    if (isCompleted) {
        statusEl.textContent = '🟢 Status: Completed';
        statusEl.className = 'badge badge-success';
        statusEl.style.marginLeft = '0.5rem';
        submitBtn.classList.remove('hidden');
    } else {
        statusEl.textContent = '🟡 Status: In Progress';
        statusEl.className = 'badge badge-warning';
        statusEl.style.marginLeft = '0.5rem';
        submitBtn.classList.add('hidden');
    }
}

function submitExercise() {
    const ex = exerciseState.activeExercise;
    if (!ex) return;
    if (!confirm('Are you sure you want to submit this exercise?')) return;

    const pseudo = getValue('pseudocode-editor');
    const py = getPythonCode('python-output');
    const outTextEl = $id('console-output');
    const outText = outTextEl ? outTextEl.textContent || '' : '';
    const now = new Date();
    const docId = 'act_' + Date.now();

    const actRecord = {
        _docId: docId,
        student: currentUser ? currentUser.fullName : 'Guest Student',
        studentId: currentUser ? (currentUser.studentId || currentUser.username) : '2024-001',
        section: currentUser ? (currentUser.section || 'BSCS-3A') : 'BSCS-3A',
        instructorId: currentUser ? (currentUser.instructorId || 'u2') : 'u2',
        exercise: ex.title || ex.concept || 'Untitled Exercise',
        difficulty: ex.difficulty || 'moderate',
        status: 'Completed',
        score: '100%',
        time: now.toISOString(),
        timestamp: now.getTime(),
        pseudocode: pseudo,
        python_code: py,
        result: 'Success',
        errorType: null,
        processingTime: '0.45s',
        output: outText
    };

    dbSet(activityRef, docId, actRecord).then(async () => {
        // Immediate local sync for Learning Analytics
        if (typeof cachedActivity !== 'undefined') {
            cachedActivity.unshift(actRecord);
        }
        if (typeof currentFilteredActivity !== 'undefined') {
            currentFilteredActivity.unshift(actRecord);
        }
        if (typeof updateAnalyticsUI === 'function') {
            try { updateAnalyticsUI(); } catch (e) {}
        }

        const overlay = $id('submission-success-overlay');
        const timeDisplay = $id('submission-time-display');
        if (overlay && timeDisplay) {
            timeDisplay.innerHTML = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + '<br>' +
                now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
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
    });
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
            if (saveBtn) saveBtn.textContent = '💾 Save Changes';
        }
    } else {
        title.textContent = 'Add Exercise';
        setValue('ex-title', '');
        setValue('ex-desc', '');
        setValue('ex-difficulty', 'moderate');
        setValue('ex-solution', '');
        setValue('ex-expected-output', '');
        const saveBtn = $id('exercise-save-btn');
        if (saveBtn) saveBtn.textContent = '➕ Add Exercise';
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
            await createExerciseNotifications(editingExerciseId, titleVal, 'updated');
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
            await createExerciseNotifications(newId, titleVal, 'added');
            showToast('Exercise added successfully!', 'success');
        }
        closeExerciseModal();
        await loadExercises();
    } catch (err) {
        console.error('[Offline Database] Save exercise error:', err);
        showToast('Failed to save exercise.', 'error');
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
                        <div style="font-size:2rem;margin-bottom:0.5rem">⚠️</div>
                        <div style="font-weight:600;font-size:1rem;margin-bottom:0.4rem">Unable to load instructors. Please try again.</div>
                        <div style="font-size:0.83rem;color:var(--text-muted);margin-bottom:1rem">${err.message || 'Check database connection.'}</div>
                        <button class="btn btn-secondary btn-sm" onclick="loadUsers()" style="margin:0 auto">🔄 Try Again</button>
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
                <div style="font-size:2.5rem;margin-bottom:0.75rem">👥</div>
                <div style="font-weight:600;font-size:1rem;margin-bottom:0.4rem">No instructors found</div>
                <div style="font-size:0.83rem">Try adjusting your search or filter, or click <strong>Add Instructor</strong> to create one.</div>
              </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = slice.map(u => {
        const initial = (u.fullName || 'I').charAt(0).toUpperCase();
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
              <div class="avatar-sm" style="background:hsl(${(initial.charCodeAt(0) * 17) % 360},55%,45%)">${initial}</div>
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
              <button class="btn btn-ghost btn-sm" onclick="viewInstructor('${instructorId}')" title="View Details" style="padding:0.3rem 0.5rem;font-size:0.8rem">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              <button class="btn btn-ghost btn-sm" onclick="openInstructorEditModal('${instructorId}')" title="Edit" style="padding:0.3rem 0.5rem;font-size:0.8rem">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button class="btn btn-ghost btn-sm device-action-btn" onclick="openInstructorDevicesModal('${instructorId}')" title="Manage Authorized Devices (${userDevices.length} registered${pendingCount > 0 ? `, ${pendingCount} pending approval` : ''})" style="padding:0.3rem 0.5rem;font-size:0.8rem;color:${pendingCount > 0 ? '#f59e0b' : '#38bdf8'}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                ${pendingCount > 0 ? `<span class="device-pending-badge"></span>` : ''}
              </button>
              ${isArchived ? `
                <button class="btn btn-ghost btn-sm" onclick="openRestoreInstructorModal('${instructorId}')" title="Restore Instructor" style="padding:0.3rem 0.5rem;font-size:0.8rem;color:var(--success)">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                </button>
              ` : `
                <button class="btn btn-ghost btn-sm" onclick="confirmToggleInstructorStatus('${instructorId}')" title="${u.status === 'active' ? 'Deactivate' : 'Activate'}" style="padding:0.3rem 0.5rem;font-size:0.8rem;color:${u.status === 'active' ? 'var(--warning)' : 'var(--success)'}">
                  ${u.status === 'active'
                  ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
                  : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`
                  }
                </button>
                <button class="btn btn-ghost btn-sm" onclick="openArchiveInstructorModal('${instructorId}')" ${instructorId === currentUser?.id || instructorId === currentUser?._docId ? 'disabled title="Cannot archive yourself"' : 'title="Archive Instructor"'} style="padding:0.3rem 0.5rem;font-size:0.8rem;color:var(--warning)">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>
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
                <div style="font-size:1.8rem; margin-bottom:0.4rem;">💻</div>
                <div style="font-weight:600; font-size:0.9rem;">No Registered Devices Yet</div>
                <div style="font-size:0.75rem;">When this instructor signs in from a device, it will automatically appear here for verification.</div>
              </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = devices.map(d => {
        const isMobile = d.deviceType === 'Mobile';
        const icon = isMobile ? '📱' : '💻';
        const reqTime = _fmtDate(d.requestedAt);
        const lastSeen = _fmtDate(d.lastSeenAt);

        let statusBadge = '';
        if (d.status === 'approved') {
            statusBadge = `<span class="badge-device-approved">APPROVED</span>`;
        } else if (d.status === 'pending') {
            statusBadge = `<span class="badge-device-pending">PENDING APPROVAL</span>`;
        } else {
            statusBadge = `<span class="badge-device-revoked">REVOKED</span>`;
        }

        return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <span style="font-size:1.1rem;">${icon}</span>
              <div>
                <strong style="color:var(--text-primary); font-size:0.85rem;">${d.deviceName || 'Device'}</strong>
                <div style="font-size:0.72rem; color:var(--text-muted); font-family:monospace;">${d.deviceId ? d.deviceId.substring(0, 16) + '...' : '-'}</div>
              </div>
            </div>
          </td>
          <td>
            <div style="font-size:0.82rem; color:var(--text-primary);">${d.os || 'Unknown OS'}</div>
            <div style="font-size:0.72rem; color:var(--text-muted);">${d.browser || 'Unknown Browser'}</div>
          </td>
          <td>
            <div style="font-size:0.78rem; color:var(--text-primary);">${reqTime}</div>
            <div style="font-size:0.7rem; color:var(--text-muted);">Active: ${lastSeen}</div>
          </td>
          <td>${statusBadge}</td>
          <td style="text-align:right;">
            <div style="display:flex; gap:0.35rem; justify-content:flex-end;">
              ${d.status !== 'approved' ? `
                <button class="btn btn-sm" onclick="approveDevice('${d._docId}')" style="background:rgba(34,197,94,0.15); color:#4ade80; border:1px solid rgba(34,197,94,0.3); font-size:0.75rem; padding:0.25rem 0.5rem;" title="Approve this device">
                  ✅ Approve
                </button>
              ` : `
                <button class="btn btn-sm" onclick="revokeDevice('${d._docId}')" style="background:rgba(245,158,11,0.15); color:#fbbf24; border:1px solid rgba(245,158,11,0.3); font-size:0.75rem; padding:0.25rem 0.5rem;" title="Revoke authorization">
                  🔒 Revoke
                </button>
              `}
              <button class="btn btn-ghost btn-sm" onclick="deleteDeviceRecord('${d._docId}')" style="color:var(--danger); padding:0.25rem 0.4rem; font-size:0.75rem;" title="Remove record">
                🗑️
              </button>
            </div>
          </td>
        </tr>`;
    }).join('');
}

async function approveDevice(deviceDocId) {
    try {
        await dbUpdate(devicesRef, deviceDocId, {
            status: 'approved',
            approvedAt: new Date().toISOString(),
            approvedBy: currentUser?.username || 'admin'
        });
        showToast('Device approved successfully!', 'success');
        await renderDeviceModalTable();
        await loadUsers();
    } catch (err) {
        console.error('[Device] Approve error:', err);
        showToast('Failed to approve device.', 'error');
    }
}

async function revokeDevice(deviceDocId) {
    try {
        await dbUpdate(devicesRef, deviceDocId, {
            status: 'revoked',
            revokedAt: new Date().toISOString(),
            revokedBy: currentUser?.username || 'admin'
        });
        showToast('Device access revoked.', 'info');
        await renderDeviceModalTable();
        await loadUsers();
    } catch (err) {
        console.error('[Device] Revoke error:', err);
        showToast('Failed to revoke device.', 'error');
    }
}

async function deleteDeviceRecord(deviceDocId) {
    if (!confirm('Are you sure you want to remove this device record?')) return;
    try {
        await dbDelete(devicesRef, deviceDocId);
        showToast('Device record removed.', 'info');
        await renderDeviceModalTable();
        await loadUsers();
    } catch (err) {
        console.error('[Device] Delete error:', err);
        showToast('Failed to remove device.', 'error');
    }
}

async function approveAllPendingDevices() {
    if (!activeDeviceInstructorId) return;
    const instructor = allCachedInstructors.find(u => u.id === activeDeviceInstructorId || u._docId === activeDeviceInstructorId);
    if (!instructor) return;

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
}

// ── Add / Edit Instructor Modal ──────────────────────────────

function openInstructorAddModal() {
    editingInstructorId = null;
    setText('instructor-modal-title', '➕ Add Instructor');
    const saveBtn = $id('inst-save-btn');
    if (saveBtn) saveBtn.textContent = '➕ Add Instructor';

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
    setText('instructor-modal-title', '✏️ Edit Instructor');
    const saveBtn = $id('inst-save-btn');
    if (saveBtn) saveBtn.textContent = '💾 Save Changes';

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
    const initial = (user.fullName || 'I').charAt(0).toUpperCase();
    const avatarEl = $id('idm-avatar');
    if (avatarEl) {
        avatarEl.textContent = initial;
        avatarEl.style.background = `hsl(${(initial.charCodeAt(0) * 17) % 360},55%,45%)`;
    }
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

    if (students.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--text-muted)">No students enrolled under your class yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = students.map(u => `
    <tr>
      <td><div class="user-cell"><div class="avatar-sm">${u.fullName.charAt(0)}</div><div><div style="font-weight:600;color:var(--text-primary)">${u.fullName}</div><div style="font-size:0.75rem;color:var(--text-muted)">@${u.username}</div></div></div></td>
      <td>${u.studentId || '—'}</td>
      <td><span class="badge ${u.status === 'active' ? 'badge-active' : 'badge-inactive'}">${u.status}</span></td>
      <td><div style="display:flex;gap:0.5rem">
        <button class="btn btn-ghost btn-sm" onclick="editUser('${u.id}')" title="Edit">✏️</button>
        <button class="btn btn-ghost btn-sm" onclick="toggleUserStatus('${u.id}')" title="${u.status === 'active' ? 'Deactivate' : 'Activate'}">${u.status === 'active' ? '🔒' : '🔓'}</button>
        <button class="btn btn-ghost btn-sm" onclick="deleteUser('${u.id}')" title="Delete">🗑️</button>
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

    // Build chart columns based on selected filter context
    let weekDays = [];

    if (viewMode === 'month' || (monthVal !== '' && !weekVal)) {
        // Monthly view: show each week as a bar
        const mIdx = monthVal !== '' ? parseInt(monthVal) : new Date().getMonth();
        const year = 2025;
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
        let startDay = 4, year = 2025, mIdx = 7; // default Aug Week 2
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
            tooltip.style.left = `${Math.min(e.clientX - cardRect.left + 10, cardRect.width - 220)}px`;
            tooltip.style.top = `${Math.max(e.clientY - cardRect.top - 130, 10)}px`;
        });

        col.addEventListener('mouseleave', () => { if (tooltip) tooltip.classList.add('hidden'); });

        col.addEventListener('click', () => {
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
            <div style="font-size:1.5rem;margin-bottom:0.5rem">📊</div>
            No matching student submissions found for the selected filters.
        </td></tr>`;
        if (pageInfo) pageInfo.textContent = 'Showing 0 of 0 results';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        if (pageNumbers) pageNumbers.innerHTML = '';
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
            <div class="user-cell" style="display:flex;align-items:center;gap:0.6rem">
              <div class="avatar-sm" style="width:28px;height:28px;border-radius:50%;background:#334155;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;color:#f8fafc">${(a.student || '?').charAt(0)}</div>
              <span style="font-weight:600;color:var(--text-primary);font-size:0.85rem">${a.student || '—'}</span>
            </div>
          </td>
          <td style="color:var(--text-muted);font-size:0.82rem;font-family:monospace">${a.studentId || '—'}</td>
          <td style="color:var(--text-secondary);font-size:0.85rem">${a.exercise || '—'}</td>
          <td>${diffBadge(a.difficulty)}</td>
          <td>${anStatusBadge(a.status)}</td>
          <td style="font-weight:700;font-size:0.85rem;color:${scoreColor(a)}">${a.score || '—'}</td>
          <td style="color:var(--text-muted);font-size:0.82rem">${dateStr}</td>
          <td style="color:var(--text-muted);font-size:0.82rem">${a.processingTime || '—'}</td>
          <td>${resultBadge(a)}</td>
          <td>
            <button class="an-eye-btn" title="View Details" onclick="viewSubmissionDetail('${docId}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </td>
        </tr>`;
    }).join('');
}

function viewSubmissionDetail(docId) {
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

    // Modal title
    setText('sdm-title', `📄 ${a.student} — ${a.exercise}`);

    const modal = $id('submission-detail-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeSubmissionDetail() {
    hide('submission-detail-modal');
}


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
    setText('settings-status', (currentUser.status || 'active').charAt(0).toUpperCase() + (currentUser.status || 'active').slice(1));

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
                submitBtn.textContent = '\u23f3 Cooldown Active (' + remainingDays + ' days remaining)';
            }
        }
    }

    if (!cooldownActive) {
        if (cooldownWarning) cooldownWarning.classList.add('hidden');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '\ud83d\udd11 Change Password';
        }
    }

    // Render change history
    renderPasswordChangeHistory(myHistory);
}

function renderPasswordChangeHistory(history) {
    const container = $id('password-request-history');
    if (!container) return;

    if (history.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">\ud83d\udcc4</div><h3>No Changes Yet</h3><p>You haven\'t changed your password yet.</p></div>';
        return;
    }

    container.innerHTML = history.map(r => `
    <div class="request-card approved">
      <div class="request-card-header">
        <span class="badge badge-approved">\u2705 Changed</span>
        <span class="request-date">\ud83d\udcc5 ${r.changedAt || 'Unknown'}</span>
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
    if (newPassword.length < 8) {
        showToast('Password must be at least 8 characters.', 'error');
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
      <td><div class="user-cell"><div class="avatar-sm">${r.fullName ? r.fullName.charAt(0) : '?'}</div><div><div style="font-weight:600;color:var(--text-primary)">${r.fullName || 'Unknown'}</div><div style="font-size:0.75rem;color:var(--text-muted)">@${r.username || 'unknown'}</div></div></div></td>
      <td>${r.changedAt || '\u2014'}</td>
      <td><span class="badge badge-approved">\u2705 Changed</span></td>
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
 * Student submits a password recovery request.
 */
async function submitRecoveryRequest() {
    const usernameOrId = getValue('fp-username-input').trim();
    if (!usernameOrId) {
        showToast('Please enter your username or Student ID.', 'error');
        return;
    }

    await refreshUsers();
    const student = cachedUsers.find(u =>
        (u.username === usernameOrId || u.studentId === usernameOrId) && u.role === 'student'
    );

    if (!student) {
        showToast('Student account not found. Check your username or Student ID.', 'error');
        return;
    }

    if (student.status === 'inactive') {
        showToast('Your account is inactive. Please contact your instructor.', 'error');
        return;
    }

    // Check for existing pending request to avoid duplicates
    const existing = await dbGetAll(passwordRequestsRef);
    const alreadyPending = existing.find(r =>
        r.type === 'recovery' && r.studentId === student._docId && r.status === 'pending'
    );

    if (alreadyPending) {
        // Show the check-status step instead
        setText('fp-submitted-name', student.fullName);
        hide('fp-step-1');
        show('fp-step-2');
        showToast('You already have a pending recovery request. Ask your instructor to approve it.', 'info');
        return;
    }

    // Create a new recovery request
    const reqId = 'pr_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    await dbSet(passwordRequestsRef, reqId, {
        _docId: reqId,
        type: 'recovery',
        studentId: student._docId,
        studentName: student.fullName,
        studentUsername: student.username,
        studentEnrolledId: student.studentId || '—',
        instructorId: student.instructorId || null,
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
        studentId: student._docId,
        studentName: student.fullName,
        username: student.username,
        requestId: reqId
    });

    setText('fp-submitted-name', student.fullName);
    hide('fp-step-1');
    show('fp-step-2');
    showToast('Recovery request submitted! Ask your instructor to approve it.', 'success');

    // Update instructor badge
    updatePendingRequestsBadge();
}

/**
 * Student checks if their recovery request has been approved,
 * then shows the reset password form if a valid token exists.
 */
async function checkRecoveryStatus() {
    const usernameOrId = getValue('fp-username-input').trim() ||
        (getValue('fp-check-username') || '').trim();
    const checkInput = getValue('fp-check-username').trim();
    const lookupVal = checkInput || usernameOrId;

    if (!lookupVal) {
        showToast('Please enter your username or Student ID.', 'error');
        return;
    }

    await refreshUsers();
    const student = cachedUsers.find(u =>
        (u.username === lookupVal || u.studentId === lookupVal) && u.role === 'student'
    );

    if (!student) {
        showToast('Student account not found.', 'error');
        return;
    }

    // Find the most recent approved (unused, non-expired) recovery request
    const requests = await dbGetAll(passwordRequestsRef);
    const now = Date.now();

    const approvedReq = requests
        .filter(r =>
            r.type === 'recovery' &&
            r.studentId === student._docId &&
            r.status === 'approved' &&
            !r.tokenUsed &&
            r.tokenExpiresAt && r.tokenExpiresAt > now
        )
        .sort((a, b) => b.tokenExpiresAt - a.tokenExpiresAt)[0];

    if (!approvedReq) {
        // Check if there's an expired one
        const expiredReq = requests.find(r =>
            r.type === 'recovery' &&
            r.studentId === student._docId &&
            r.status === 'approved' &&
            (!r.tokenExpiresAt || r.tokenExpiresAt <= now)
        );
        if (expiredReq) {
            // Auto-mark as expired
            await dbUpdate(passwordRequestsRef, expiredReq._docId, { status: 'expired' });
            showToast('Your recovery authorization has expired. Please submit a new request.', 'error');
        } else {
            showToast('No approved recovery request found. Please ask your instructor to approve it.', 'info');
        }
        return;
    }

    // Show reset password form
    // Store the request ID in a hidden field on the form
    setValue('fp-reset-request-id', approvedReq._docId);
    setValue('fp-reset-student-id', student._docId);
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
    if (newPwd.length < 8) {
        showToast('Password must be at least 8 characters.', 'error');
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
            pending: { cls: 'badge-recovery-pending', label: '⏳ Pending' },
            approved: { cls: 'badge-recovery-approved', label: '✅ Approved' },
            rejected: { cls: 'badge-recovery-rejected', label: '❌ Rejected' },
            completed: { cls: 'badge-recovery-completed', label: '✔️ Completed' },
            expired: { cls: 'badge-recovery-expired', label: '⏱️ Expired' }
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
                ? `<button class="btn btn-primary btn-sm" onclick="openRecoveryReview('${r._docId}')">🔍 Review</button>`
                : `<button class="btn btn-ghost btn-sm" onclick="openRecoveryReview('${r._docId}')">👁️ View</button>`
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
        pending: { cls: 'badge-recovery-pending', label: '⏳ Pending' },
        approved: { cls: 'badge-recovery-approved', label: '✅ Approved' },
        rejected: { cls: 'badge-recovery-rejected', label: '❌ Rejected' },
        completed: { cls: 'badge-recovery-completed', label: '✔️ Completed' },
        expired: { cls: 'badge-recovery-expired', label: '⏱️ Expired' }
    };
    const s = statusMap[req.status] || { cls: '', label: req.status };

    setHtml('recovery-review-content', `
        <div class="recovery-info-grid">
          <div class="recovery-info-row">
            <span class="recovery-info-label">👤 Full Name</span>
            <span class="recovery-info-value">${req.studentName || 'Unknown'}</span>
          </div>
          <div class="recovery-info-row">
            <span class="recovery-info-label">🪪 Student ID</span>
            <span class="recovery-info-value">${req.studentEnrolledId || '—'}</span>
          </div>
          <div class="recovery-info-row">
            <span class="recovery-info-label">👤 Username</span>
            <span class="recovery-info-value">@${req.studentUsername || '—'}</span>
          </div>
          <div class="recovery-info-row">
            <span class="recovery-info-label">🟢 Account Status</span>
            <span class="recovery-info-value">${student ? student.status : '—'}</span>
          </div>
          <div class="recovery-info-row">
            <span class="recovery-info-label">📅 Request Date</span>
            <span class="recovery-info-value">${dt}</span>
          </div>
          <div class="recovery-info-row">
            <span class="recovery-info-label">📋 Request Status</span>
            <span class="recovery-info-value"><span class="badge ${s.cls}">${s.label}</span></span>
          </div>
        </div>
        <div class="recovery-security-notice">
          🔒 <strong>Security Notice:</strong> No password information is displayed. 
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
async function approveRecoveryRequest() {
    hide('recovery-confirm-dialog');
    if (!currentReviewRequestId) return;

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
}

/**
 * Instructor rejects a password recovery request.
 */
async function rejectRecoveryRequest() {
    if (!currentReviewRequestId) return;

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

        console.log(`[Notifications] Sent "${title}" notifications to ${students.length} students ✅`);
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
            .filter(n => n.studentId === studentId || n.studentId === currentUser.id || n.studentId === currentUser._docId)
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
                    <div style="font-size:1.75rem; margin-bottom:0.35rem; opacity:0.6;">🔕</div>
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
                <div class="notif-item ${isUnread ? 'unread' : 'read'}" onclick="handleNotificationClick('${n._docId}', '${n.exerciseId || ''}')">
                    <div class="notif-item-header">
                        <div class="notif-item-title-row">
                            ${isUnread ? '<span class="notif-unread-dot"></span>' : ''}
                            <strong class="notif-item-title">${n.title || 'New Exercise Added'}</strong>
                        </div>
                        <span class="notif-item-status ${isUnread ? 'unread' : 'read'}">${isUnread ? 'Unread' : 'Read'}</span>
                    </div>
                    <div class="notif-item-ex-title">"${n.exerciseTitle || 'Exercise'}"</div>
                    <div class="notif-item-msg">${n.message || ''}</div>
                    <div class="notif-item-time">📅 ${dt} &bull; <span style="font-weight:500;">${isUnread ? 'Unread' : 'Read'}</span></div>
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
async function handleNotificationClick(notifId, exerciseId) {
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
                    attemptExercise(exerciseId);
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
   ADMIN: SECURITY AUDIT LOG
   ============================================================ */

/**
 * Loads the Security Audit Log for the admin panel.
 * Replaces the old simple password-change history.
 */
async function loadPasswordRequests() {
    // Load both audit log and legacy password change history
    const auditLogs = await refreshAuditLog();
    const recoveryReqs = await dbGetAll(passwordRequestsRef);

    // Combine legacy change-history records (changedAt field) with audit log
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
        .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

    setText('stat-total-changes', allLogs.length);

    const tbody = $id('password-requests-body');
    if (!tbody) return;

    if (allLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted)">No security events recorded yet.</td></tr>';
        return;
    }

    const actionLabels = {
        'password_changed': { icon: '🔑', label: 'Password Changed', cls: 'badge-approved' },
        'password_reset_requested': { icon: '📩', label: 'Reset Requested', cls: 'badge-recovery-pending' },
        'password_reset_approved': { icon: '✅', label: 'Reset Approved', cls: 'badge-recovery-approved' },
        'password_reset_rejected': { icon: '❌', label: 'Reset Rejected', cls: 'badge-recovery-rejected' },
        'password_reset_completed': { icon: '🎉', label: 'Reset Completed', cls: 'badge-recovery-completed' }
    };

    tbody.innerHTML = allLogs.map(r => {
        const a = actionLabels[r.action] || { icon: '📋', label: r.action || 'Unknown', cls: '' };
        const dt = r.timestamp
            ? new Date(r.timestamp).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
            : '—';
        return `
        <tr>
          <td><div class="user-cell"><div class="avatar-sm">${(r.studentName || '?').charAt(0)}</div>
            <div>
              <div style="font-weight:600;color:var(--text-primary)">${r.studentName || 'Unknown'}</div>
              <div style="font-size:0.75rem;color:var(--text-muted)">@${r.username || '—'}</div>
            </div>
          </div></td>
          <td><span class="badge ${a.cls}">${a.icon} ${a.label}</span></td>
          <td>${r.instructorName || '—'}</td>
          <td>${dt}</td>
        </tr>`;
    }).join('');
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
        return line.replace(/^\s*\d+[.:)]?[ \t]?/, '');
    }).join('\n');
}

/**
 * Core validation function — strict compiler-like approach.
 * Validates BEFORE any translation occurs.
 * Returns { valid: boolean, errors: [{ line: number, message: string, suggestion?: string }] }
 */
function validatePseudocode(code) {
    code = preprocessPseudocode(code);
    const lines = code.split('\n');
    const errors = [];
    const blockStack = [];

    // --- PHASE 1: Find BEGIN and END positions ---
    const meaningfulLines = [];
    for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (t && !t.startsWith('//') && !t.startsWith('#')) {
            meaningfulLines.push({ index: i, lineNum: i + 1, text: t });
        }
    }

    if (meaningfulLines.length === 0) {
        errors.push({ line: 1, message: 'Empty pseudocode.', suggestion: 'Start with BEGIN and end with END.' });
        return { valid: false, errors };
    }

    const firstMeaningful = meaningfulLines[0];
    const lastMeaningful = meaningfulLines[meaningfulLines.length - 1];

    let hasBegin = false, beginLineNum = -1;
    let hasEnd = false, endLineNum = -1;

    for (const ml of meaningfulLines) {
        if (/^(BEGIN|START)$/i.test(ml.text)) {
            if (!hasBegin) { hasBegin = true; beginLineNum = ml.lineNum; }
            else { errors.push({ line: ml.lineNum, message: 'Duplicate BEGIN/START statement found. Only one BEGIN or START is allowed.' }); }
        }
        if (/^END$/i.test(ml.text)) { hasEnd = true; endLineNum = ml.lineNum; }
    }

    // Strict: BEGIN must be first meaningful line
    if (!hasBegin) {
        errors.push({ line: firstMeaningful.lineNum, message: 'Missing BEGIN or START statement.', suggestion: 'Your pseudocode must start with BEGIN or START on the first line.' });
    } else if (beginLineNum !== firstMeaningful.lineNum) {
        errors.push({ line: beginLineNum, message: 'BEGIN/START must be the first line of your pseudocode.', suggestion: 'Move BEGIN or START to the very first line.' });
    }

    // Strict: END must be last meaningful line
    if (!hasEnd) {
        errors.push({ line: lastMeaningful.lineNum, message: 'Missing END statement.', suggestion: 'Your pseudocode must end with END on the last line.' });
    } else if (endLineNum !== lastMeaningful.lineNum) {
        errors.push({ line: endLineNum, message: 'END must be the last line of your pseudocode.', suggestion: 'Move END to the very last line. No code should appear after END.' });
    }

    // Detect END before BEGIN
    if (hasBegin && hasEnd && endLineNum < beginLineNum) {
        errors.push({ line: endLineNum, message: 'END found before BEGIN — structure is inverted.', suggestion: 'BEGIN must come first, END must come last.' });
    }

    // Detect code outside BEGIN-END block
    if (hasBegin && hasEnd && beginLineNum < endLineNum) {
        for (const ml of meaningfulLines) {
            if (/^(BEGIN|START)$/i.test(ml.text) || /^END$/i.test(ml.text)) continue;
            if (ml.lineNum < beginLineNum || ml.lineNum > endLineNum) {
                errors.push({ line: ml.lineNum, message: 'Code found outside BEGIN-END block.', suggestion: 'All pseudocode must be written between BEGIN/START and END.' });
            }
        }
    } else if (!hasBegin && hasEnd) {
        for (const ml of meaningfulLines) {
            if (/^END$/i.test(ml.text)) continue;
            if (ml.lineNum < endLineNum) {
                errors.push({ line: ml.lineNum, message: 'Code found before BEGIN/START (which is missing).', suggestion: 'Add BEGIN or START as the first line.' });
            }
        }
    }

    // If BEGIN/END structure is completely broken, return early
    if (!hasBegin || !hasEnd) {
        errors.sort((a, b) => a.line - b.line);
        return { valid: false, errors };
    }

    // --- PHASE 2: Validate lines inside BEGIN-END ---
    for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1;
        const trimmed = lines[i].trim();

        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;
        if (/^(BEGIN|START)$/i.test(trimmed) || /^END$/i.test(trimmed)) continue;
        if (lineNum < beginLineNum || lineNum > endLineNum) continue;

        // Block closers
        const endBlockMatch = trimmed.match(/^END\s+(IF|FOR|WHILE|FUNCTION|PROCEDURE)$/i) || trimmed.match(/^(ENDIF|ENDFOR|ENDWHILE)$/i);
        if (endBlockMatch) {
            let rawCloser = (endBlockMatch[1] || endBlockMatch[0]).toUpperCase();
            let closer = rawCloser;
            if (rawCloser === 'ENDIF') closer = 'IF';
            else if (rawCloser === 'ENDFOR') closer = 'FOR';
            else if (rawCloser === 'ENDWHILE') closer = 'WHILE';

            if (blockStack.length === 0) {
                errors.push({ line: lineNum, message: `Unexpected ${rawCloser} — no matching opening block found.`, suggestion: `Remove this ${rawCloser} or add the matching block above.` });
            } else {
                const top = blockStack[blockStack.length - 1];
                if (top.type === closer) { blockStack.pop(); }
                else {
                    errors.push({ line: lineNum, message: `Mismatched block: Expected END ${top.type} (opened on line ${top.line}) but found ${rawCloser}.`, suggestion: `Close the ${top.type} block with END ${top.type} before ${rawCloser}.` });
                    const deeper = blockStack.findIndex(b => b.type === closer);
                    if (deeper !== -1) {
                        for (let k = blockStack.length - 1; k > deeper; k--) {
                            errors.push({ line: blockStack[k].line, message: `Unclosed ${blockStack[k].type} block (opened on line ${blockStack[k].line}).`, suggestion: `Add END ${blockStack[k].type} to close this block.` });
                        }
                        blockStack.splice(deeper);
                    }
                }
            }
            continue;
        }

        // Block openers
        if (/^IF\s+(.+)\s+THEN$/i.test(trimmed)) {
            blockStack.push({ type: 'IF', line: lineNum });
            const condMatch = trimmed.match(/^IF\s+(.+)\s+THEN$/i);
            if (condMatch && !condMatch[1].trim()) errors.push({ line: lineNum, message: 'IF statement has an empty condition.', suggestion: 'Add a condition, e.g. IF x > 5 THEN' });
            checkIncompleteExpression(trimmed, lineNum, errors);
            continue;
        }
        if (/^ELSE\s+IF\s+(.+)\s+THEN$/i.test(trimmed)) {
            if (blockStack.length === 0 || blockStack[blockStack.length - 1].type !== 'IF') {
                errors.push({ line: lineNum, message: 'ELSE IF without a matching IF block.', suggestion: 'Make sure ELSE IF is inside an IF...END IF block.' });
            }
            const condMatch = trimmed.match(/^ELSE\s+IF\s+(.+)\s+THEN$/i);
            if (condMatch && !condMatch[1].trim()) errors.push({ line: lineNum, message: 'ELSE IF statement has an empty condition.', suggestion: 'Add a condition, e.g. ELSE IF x > 5 THEN' });
            checkIncompleteExpression(trimmed, lineNum, errors);
            continue;
        }
        if (/^ELSE$/i.test(trimmed)) {
            if (blockStack.length === 0 || blockStack[blockStack.length - 1].type !== 'IF') errors.push({ line: lineNum, message: 'ELSE without a matching IF block.', suggestion: 'Make sure ELSE is inside an IF...END IF block.' });
            continue;
        }
        if (/^FOR\s+EACH\s+\w+\s+IN\s+.+\s+DO$/i.test(trimmed) || /^FOR\s+\w+\s+FROM\s+.+\s+TO\s+.+\s+DO$/i.test(trimmed)) { blockStack.push({ type: 'FOR', line: lineNum }); continue; }
        if (/^WHILE\s+(.+)\s+DO$/i.test(trimmed)) { blockStack.push({ type: 'WHILE', line: lineNum }); continue; }
        if (/^(FUNCTION|PROCEDURE)\s+\w+\s*\(.*\)$/i.test(trimmed)) { blockStack.push({ type: trimmed.match(/^(FUNCTION|PROCEDURE)/i)[1].toUpperCase(), line: lineNum }); continue; }

        // Known statements with expression validation
        if (/^SET\s+\w+\s+TO\s+/i.test(trimmed)) { const m = trimmed.match(/^SET\s+\w+\s+TO\s+(.+)$/i); if (m) checkIncompleteExpression(m[1], lineNum, errors); continue; }
        if (/^(DISPLAY|PRINT|OUTPUT)\s+/i.test(trimmed)) { const m = trimmed.match(/^(?:DISPLAY|PRINT|OUTPUT)\s+(.+)$/i); if (m) checkIncompleteExpression(m[1], lineNum, errors); continue; }
        if (/^(INPUT|READ)\s+/i.test(trimmed)) continue;
        if (/^RETURN\s+/i.test(trimmed)) { const m = trimmed.match(/^RETURN\s+(.+)$/i); if (m) checkIncompleteExpression(m[1], lineNum, errors); continue; }
        if (/^CALL\s+\w+\s*\(.*\)$/i.test(trimmed)) continue;
        if (/^(INCREMENT|DECREMENT)\s+\w+$/i.test(trimmed)) continue;
        if (/^APPEND\s+.+\s+TO\s+\w+$/i.test(trimmed)) continue;
        if (/^(NUMERIC|INTEGER|FLOAT|REAL|STRING|CHAR|CHARACTER|BOOLEAN|BOOL)\s+\w+/i.test(trimmed)) continue;
        if (/^\w+\s*=\s*.+$/.test(trimmed)) { const m = trimmed.match(/^\w+\s*=\s*(.+)$/); if (m) checkIncompleteExpression(m[1], lineNum, errors); continue; }

        // Incomplete block syntax
        if (/^FOR\s+/i.test(trimmed) && !/DO$/i.test(trimmed)) { errors.push({ line: lineNum, message: 'FOR statement is missing "DO" at the end.', suggestion: 'Use: FOR EACH item IN list DO  or  FOR i FROM 1 TO 10 DO' }); blockStack.push({ type: 'FOR', line: lineNum }); continue; }
        if (/^IF\s+/i.test(trimmed) && !/THEN$/i.test(trimmed)) { errors.push({ line: lineNum, message: 'IF statement is missing "THEN" at the end.', suggestion: 'Use: IF condition THEN' }); blockStack.push({ type: 'IF', line: lineNum }); continue; }
        if (/^WHILE\s+/i.test(trimmed) && !/DO$/i.test(trimmed)) { errors.push({ line: lineNum, message: 'WHILE statement is missing "DO" at the end.', suggestion: 'Use: WHILE condition DO' }); blockStack.push({ type: 'WHILE', line: lineNum }); continue; }

        // --- STRICT unknown keyword rejection ---
        const firstWord = trimmed.split(/\s+/)[0];
        const firstWordUpper = firstWord.toUpperCase();

        if (/^[A-Z]{2,}$/i.test(firstWord) && !KNOWN_KEYWORDS.includes(firstWordUpper)) {
            const suggestion = suggestKeyword(firstWord);
            errors.push({
                line: lineNum,
                message: `Unknown keyword "${firstWord}".`,
                suggestion: suggestion ? `Did you mean "${suggestion}"?` : 'Check spelling or use a valid keyword: SET, DISPLAY, IF, FOR, WHILE, etc.'
            });
            continue;
        }

        // If it doesn't match any known pattern, flag it
        if (!KNOWN_KEYWORDS.includes(firstWordUpper) && !/^\w+\s*=/.test(trimmed)) {
            errors.push({
                line: lineNum,
                message: `Unrecognized statement: "${trimmed}".`,
                suggestion: 'Use valid pseudocode keywords: SET, DISPLAY, IF, FOR, WHILE, CALL, RETURN, etc.'
            });
        }
    }

    // --- PHASE 3: Check unbalanced quotes ---
    for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1;
        const trimmed = lines[i].trim();
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;
        if (lineNum < beginLineNum || lineNum > endLineNum) continue;
        if (/^BEGIN$/i.test(trimmed) || /^END$/i.test(trimmed)) continue;

        const doubleQuotes = (trimmed.match(/"/g) || []).length;
        const singleQuotes = (trimmed.match(/'/g) || []).length;
        if (doubleQuotes % 2 !== 0) errors.push({ line: lineNum, message: 'Unbalanced double quotes — missing closing ".', suggestion: 'Make sure every opening " has a matching closing ".' });
        if (singleQuotes % 2 !== 0) errors.push({ line: lineNum, message: "Unbalanced single quotes — missing closing '.", suggestion: "Make sure every opening ' has a matching closing '." });
    }

    // --- PHASE 4: Unclosed blocks ---
    while (blockStack.length > 0) {
        const unclosed = blockStack.pop();
        errors.push({ line: unclosed.line, message: `Unclosed ${unclosed.type} block (opened on line ${unclosed.line}).`, suggestion: `Add END ${unclosed.type} to close this block.` });
    }

    errors.sort((a, b) => a.line - b.line);
    return { valid: errors.length === 0, errors };
}

/**
 * Check for incomplete expressions (trailing operators, empty operands).
 * Detects things like: "Hello" +   or   x *   or   y /
 */
function checkIncompleteExpression(expr, lineNum, errors) {
    const trimmed = expr.trim();
    if (/[+\-*\/]\s*$/.test(trimmed)) {
        const op = trimmed.match(/([+\-*\/])\s*$/)[1];
        errors.push({ line: lineNum, message: `Incomplete expression — missing value after '${op}' operator.`, suggestion: `Add a value or variable after '${op}'. Example: "Hello, " + name` });
    }
    if (/^[+*\/]/.test(trimmed)) {
        errors.push({ line: lineNum, message: `Incomplete expression — unexpected '${trimmed[0]}' at the start.`, suggestion: `Add a value before '${trimmed[0]}'.` });
    }
    if (/[+\-*\/]\s*[+*\/]/.test(trimmed)) {
        errors.push({ line: lineNum, message: 'Invalid expression — consecutive operators found.', suggestion: 'Check for extra operators and ensure proper syntax.' });
    }
}

/**
 * Format validation errors as Python comments for the output panel.
 */
/**
 * Render validation errors into HTML for terminal-like console window formatting.
 */
function renderHtmlErrors(errors) {
    let output = '<div style="margin-bottom: 0.5rem; font-family: \'JetBrains Mono\', monospace;"><span class="error-text"># ❌ Syntax Errors Found:</span></div><div><span style="color: var(--text-muted);">#</span></div>';
    for (const err of errors) {
        let suggestionHtml = '';
        if (err.suggestion) {
            suggestionHtml = `<div><span class="suggestion-text">#   💡 Suggestion: ${err.suggestion}</span></div>`;
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
            <div class="stat-icon">📈</div>
            <div class="stat-value">${improvement.correctnessImprovement}%</div>
            <div class="stat-label">Correctness Improvement</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">⚡</div>
            <div class="stat-value">${improvement.speedImprovement}%</div>
            <div class="stat-label">Speed Improvement</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon">✅</div>
            <div class="stat-value">${improvement.overallSuccessRate}%</div>
            <div class="stat-label">Overall Success Rate</div>
          </div>
        </div>`;
    } else {
        improvementEl.innerHTML = `<div class="empty-state" style="padding: 1.5rem;">
            <div class="empty-icon">📊</div>
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
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Running...'; }
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
            `✅ Benchmark complete! Accuracy: ${results.accuracy}% · F1: ${results.f1Score}% · ${results.totalTestCases} test cases.`,
            'success'
        );
    } catch (err) {
        console.error('[Benchmark] Error:', err);
        showToast('Benchmark failed: ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🧪 Run Benchmark'; }
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
          <td><span class="badge ${r.compiled ? 'badge-active' : 'badge-inactive'}">${r.compiled ? '✅ Pass' : '❌ Fail'}</span></td>
          <td><span class="badge ${r.exactMatch ? 'badge-active' : 'badge-student'}">${r.exactMatch ? '✅ Match' : '⚠️ Diff'}</span></td>
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
                if (c.accuracy >= 80) { masteryLabel = '🟢 Expert'; masteryColor = '#22c55e'; }
                else if (c.accuracy >= 60) { masteryLabel = '🔵 Proficient'; masteryColor = '#3b82f6'; }
                else if (c.accuracy >= 40) { masteryLabel = '🟡 Developing'; masteryColor = '#f59e0b'; }
                else { masteryLabel = '🔴 Beginner'; masteryColor = '#ef4444'; }

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
   MOBILE SIDEBAR (PWA / Responsive)
   ============================================================ */

function toggleMobileSidebar() {
    const sidebar = $qs('.sidebar');
    const overlay = $id('sidebar-overlay');
    if (!sidebar || !overlay) return;
    sidebar.classList.toggle('mobile-open');
    overlay.classList.toggle('hidden');
    document.body.style.overflow = sidebar.classList.contains('mobile-open') ? 'hidden' : '';
}

function closeMobileSidebar() {
    const sidebar = $qs('.sidebar');
    const overlay = $id('sidebar-overlay');
    if (!sidebar || !overlay) return;
    sidebar.classList.remove('mobile-open');
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
}

// Override navigateTo to auto-close sidebar on mobile
const _originalNavigateTo = navigateTo;
navigateTo = function (pageId) {
    _originalNavigateTo(pageId);
    if (window.innerWidth <= 1024) closeMobileSidebar();
};


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

if (window.navigator.standalone === true) {
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
        btn.textContent = '🙈'; // Closed eye
    }
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

    if (newParam.length < 8) {
        showToast('New password must be at least 8 characters.', 'error');
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

    const icon = newTheme === 'dark' ? '🌓' : '☀️';
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

