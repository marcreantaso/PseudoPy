/* ============================================================
   SHARED APPLICATION CONSTANTS
   Single source of truth for page ids, role navigation, labels
   and browser-storage keys. Kept byte-identical to the original
   inline strings so the refactor stays behavior-neutral.
   ============================================================ */

// Every top-level (protected) page id in the app shell.
const PAGES = [
    'write-pseudocode',
    'translate',
    'execute',
    'feedback',
    'exercises-student',
    'student-settings',
    'change-password',
    'analytics',
    'manage-students',
    'manage-exercises',
    'generate-code',
    'compiler-metrics',
    'password-recovery',
    'manage-users',
    'system-analytics',
    'password-requests',
    'admin-execute',
    'developer-options'
];

// Access-control lists (role -> allowed page ids). Order mirrors the
// historical checkAccess() layout; do not change without a test change.
const PAGES_BY_ROLE = {
    admin: ['manage-users', 'system-analytics', 'password-requests', 'admin-execute', 'developer-options'],
    instructor: ['analytics', 'manage-exercises', 'generate-code', 'compiler-metrics', 'manage-students', 'password-recovery'],
    student: ['write-pseudocode', 'translate', 'execute', 'feedback', 'exercises-student', 'student-settings', 'change-password']
};

// Landing page shown after login when no route is being restored.
const DEFAULT_PAGE_BY_ROLE = {
    student: 'write-pseudocode',
    instructor: 'analytics',
    admin: 'manage-users'
};

// Topbar title per page (fallback 'Dashboard' in navigateTo).
const PAGE_TITLES = {
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
    'system-analytics': 'System Analytics',
    'admin-execute': 'Execute Code',
    'change-password': 'Change Password',
    'student-settings': 'Settings',
    'password-requests': 'Security Audit Log',
    'password-recovery': 'Password Recovery',
    'compiler-metrics': 'Compiler Metrics & Evaluation',
    'developer-options': 'Developer Options'
};

// Role display labels and sidebar badge classes.
const ROLE_LABELS = { student: 'Student', instructor: 'Instructor', admin: 'Administrator' };
const ROLE_BADGES = { student: 'badge-student', instructor: 'badge-instructor', admin: 'badge-admin' };

// Browser-storage keys (localStorage unless suffixed with SESSION).
const STORAGE_KEYS = {
    SESSION_USER: 'pseudopy_session_user',
    ROUTE: 'pseudopy_route',
    THEME: 'pseudopy_theme',
    ACTIVE_EXERCISE: 'pseudopy_active_exercise',
    DEVICE_ID: 'pseudopy_device_id',
    EDITOR_DRAFT: 'pseudopy_editor_draft',
    TUTORIAL_COMPLETED: 'pseudopy_tutorial_completed',
    UPDATE_DISMISSED: 'pseudopy_update_dismissed',
    GUIDE_MODE: 'pseudopy_guide_mode',
    LOCAL_PREFIX: 'pseudopy_local_'
};﻿/* ============================================================
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
   APP VERSION — injected at build time from package.json
   The build substitutes 1.0.0 with the package
   version so the version is never hardcoded in this repo.
   ============================================================ */

const APP_VERSION = '1.0.0';
window.APP_VERSION = APP_VERSION;

/**
 * Renders the app version into the login footer and Settings About row.
 */
function renderAppVersion() {
    if (!window.APP_VERSION) return;
    const loginEl = $id('login-version');
    if (loginEl) loginEl.textContent = 'Version ' + window.APP_VERSION;
    const settingsEl = $id('settings-version');
    if (settingsEl) settingsEl.textContent = 'Version ' + window.APP_VERSION;
}

/**
 * Renders APP_INFO-driven system details (copyright, organization, contact)
 * into the login footer and Settings About section. Called on boot and when
 * the Settings page is shown.
 */
function renderSystemInfo() {
    const copyright = $id('login-copyright');
    if (copyright) {
        const year = new Date().getFullYear();
        copyright.textContent = window.APP_INFO.name + ' \u00a9 ' + year;
    }
    const org = $id('settings-org');
    if (org) org.textContent = window.APP_INFO.organization;
    const contact = $id('settings-contact');
    if (contact) {
        const value = appInfoField(window.APP_INFO.contactEmail, 'contactEmail');
        contact.textContent = value || '—';
    }
}/* ============================================================
   APP / SYSTEM IDENTITY — single source of truth
   Used by the Privacy, Terms and About surfaces. Do not put
   secrets or confidential material here; it ships to browsers.

   Version is substituted at build time from package.json.
   Organization and team were prefilled from the project's
   thesis manuscript (see PSEUDO_MANUSCRIPT (1).md). Fields that
   the system owner still must provide are empty:
   - contactEmail
   - privacyEffectiveDate
   - termsEffectiveDate

   Missing fields are surfaced only in development (localhost /
   explicit window.APP_CONFIG.development); production never
   exposes "[pending owner configuration]" to ordinary users.
   ============================================================ */

const APP_INFO = {
    name: 'PseudoPy',
    shortName: 'PseudoPy',
    version: '1.0.0',
    description: 'An educational pseudocode-to-Python translator with role-based '
        + 'dashboards, exercises, learning analytics and authorized-device security.',
    organization: 'Pamantasan ng Cabuyao - College of Computing Studies',
    // Ownership confirmed by the project lead.
    founder: 'Mikaella C. Daet',
    coFounder: 'Marc Gian R. Reantaso',
    technicalTeam: [
        'Eduard Mirandilla',
        'Mark Bautista'
    ],
    // Backward-compatible full list for legacy UI paths.
    developmentTeam: [
        'Mikaella C. Daet',
        'Marc Gian R. Reantaso',
        'Eduard Mirandilla',
        'Mark Bautista'
    ],
    contactEmail: '',
    privacyEffectiveDate: '',
    termsEffectiveDate: '',
    // Grow this list as data practices change so Privacy shows real behavior.
    collections: [
        'pseudopy_users',
        'pseudopy_exercises',
        'pseudopy_activity',
        'pseudopy_passwordRequests',
        'pseudopy_auditLog',
        'pseudopy_notifications',
        'pseudopy_devices',
        'pseudopy_evidence',
        'pseudopy_tutorialProgress'
    ]
};

window.APP_INFO = APP_INFO;

/** Machine + human labels for the fields the owner may leave empty. */
const APP_INFO_FIELD_LABELS = {
    contactEmail: 'official contact address',
    privacyEffectiveDate: 'privacy policy effective date',
    termsEffectiveDate: 'terms of use effective date'
};

/** True on local/preview hosts. Tests may pass an explicit hostname, or flip
 *  window.APP_CONFIG.development to force dev mode without host sniffing. */
function appIsDevelopment(hostname) {
    if (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.development === true) return true;
    const h = String(hostname || (typeof window !== 'undefined' && window.location ? window.location.hostname : '')).toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local');
}

/** Lists only the owner configuration keys that are genuinely missing. */
function appInfoMissingFields() {
    return Object.keys(APP_INFO_FIELD_LABELS).filter(key => {
        const v = APP_INFO[key];
        return !(v && String(v).trim() !== '');
    }).map(key => ({ key, label: APP_INFO_FIELD_LABELS[key] }));
}

/** Renders a configured value, or, when missing, a development-only marker.
 *  Production callers treat an empty string as "omit this row entirely". */
function appInfoField(value, key) {
    if (value && String(value).trim() !== '') return String(value);
    if (!appIsDevelopment()) return '';
    const label = (key && APP_INFO_FIELD_LABELS[key]) || 'configuration';
    return '[development: ' + label + ' not yet configured]';
}

/** True while any owner-facing configuration is still missing. */
function appInfoPending() {
    return appInfoMissingFields().length > 0;
}/* ============================================================
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

/* ============================================================
   ON-DEMAND THIRD-PARTY LIBRARY LOADING
   Heavy libraries (Skulpt, PDF.js, lucide) are not loaded at
   page start. They download on first use so the app shell, login
   and navigation render without waiting. Skulpt and PDF.js are
   now served from local vendor/ assets so they work fully offline
   once the service worker has installed them.
   ============================================================ */

const CDN_BASE_URLS = {
    lucide: 'https://cdn.jsdelivr.net/npm/lucide@0.468.0/dist/umd/lucide.js',
    skulpt: ['./vendor/skulpt/skulpt.min.js', './vendor/skulpt/skulpt-stdlib.js'],
    pdfjs: ['./vendor/pdfjs/pdf.min.js'],
    pdfWorker: './vendor/pdfjs/pdf.worker.min.js',
    anime: 'https://cdn.jsdelivr.net/npm/animejs@4.5.0/dist/bundles/anime.umd.min.js'
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
        // No cache-busting query string: the service worker precaches these
        // exact URLs, so a query suffix would break the offline cache match.
        s.src = srcList[index++];
        s.async = true;
        s.onload = next;
        s.onerror = function () {
            if (onError) onError(new Error('Failed to load script: ' + s.src));
        };
        document.head.appendChild(s);
    }
    next();
}

/**
 * Wall-clock budget for a single student program run.
 *
 * Skulpt enforces this through `Sk.execLimit`, which its compiler bakes into
 * the generated code as an interrupt test. Two consequences matter:
 *   1. `execLimit` is read from the `Sk.configure()` options, so it MUST be
 *      supplied before `Sk.importMainWithBody` compiles the program. Setting
 *      `Sk.execLimit` afterwards has no effect.
 *   2. This build of Skulpt has no `Sk.misceval.timeout`, so a guard written
 *      against that API silently does nothing and a tight `while True:`
 *      loop freezes the tab forever.
 */
const SKULPT_EXEC_LIMIT_MS = 15000;

/**
 * Build the Sk.configure() options fragment that arms the run budget.
 * Returns `{ execLimit }`, or an empty object when the caller has explicitly
 * opted out (used by long-running simulations).
 */
function skulptExecLimitOptions(limitMs) {
    const ms = (limitMs === undefined || limitMs === null) ? SKULPT_EXEC_LIMIT_MS : limitMs;
    if (ms === Infinity) return {};
    return { execLimit: ms };
}

/** True when a Skulpt build can actually enforce a wall-clock budget. */
function skulptSupportsExecLimit() {
    return typeof Sk !== 'undefined' && Sk !== null;
}

// ── Memoized lazy loaders ────────────────────────────────────
// A single shared promise per library prevents concurrent call sites
// (execution, exercises, devtools) from injecting duplicate scripts.

const ensureLoadedPromises = {};

/**
 * Ensure the Skulpt runtime (window.Sk) is available, then call onSuccess.
 * Returns immediately when Sk is already present or when the load fails
 * (onError). Never injects the runtime more than once.
 */
function ensureSkulptLoaded(onSuccess, onError) {
    onSuccess = onSuccess || function () {};
    onError = onError || function () {};
    if (typeof Sk !== 'undefined') { onSuccess(); return; }

    let pending = ensureLoadedPromises.skulpt;
    if (pending) {
        pending.then(onSuccess).catch(onError);
        return;
    }

    pending = new Promise(function (resolve, reject) {
        const ok = function () { if (typeof Sk !== 'undefined') resolve(); else reject(new Error('Skulpt did not initialize')); };
        const fail = function (err) { reject(err || new Error('Skulpt failed to load')); };
        loadScripts(CDN_BASE_URLS.skulpt, ok, fail);
    });
    ensureLoadedPromises.skulpt = pending;
    pending.then(onSuccess).catch(onError);
}

/**
 * Ensure the PDF.js library (window.pdfjsLib) is available, then resolve.
 * The worker is configured against the locally vendored worker file so PDF
 * text extraction also works offline.
 */
function ensurePdfJsLoaded() {
    if (typeof pdfjsLib !== 'undefined') return Promise.resolve();
    if (ensureLoadedPromises.pdfjs) return ensureLoadedPromises.pdfjs;

    ensureLoadedPromises.pdfjs = new Promise(function (resolve, reject) {
        loadScripts(CDN_BASE_URLS.pdfjs, function () {
            if (typeof pdfjsLib !== 'undefined') {
                try {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = CDN_BASE_URLS.pdfWorker;
                } catch (e) { /* non-critical */ }
                resolve();
            } else {
                reject(new Error('PDF library could not be loaded.'));
            }
        }, reject);
    });
    return ensureLoadedPromises.pdfjs;
}/* ============================================================
   INITIALIZATION
   ============================================================ */

/**
 * A rejected cloud write is a status, not a modal emergency. Routing it through
 * the connection-status layer keeps ONE dismissible, once-per-session notice
 * (with a Retry action) instead of an un-dismissable red box that reappeared on
 * every keystroke-triggered save.
 *
 * A transient failure is not announced at all: the durable queue already holds
 * the work and the permanent pill reports that it lives on the device. Only a
 * permanent refusal earns a notice.
 */
window.addEventListener('pseudopy:sync-error', event => {
    const detail = event.detail || {};
    hideLegacyCloudSaveNotice();
    const classification = typeof classifyDbError === 'function' ? classifyDbError(detail) : null;
    if (classification && classification.transient) {
        // The queue keeps the work and the pill reports it; nothing to announce.
        if (typeof renderSyncIndicator === 'function') renderSyncIndicator();
        return;
    }
    if (detail.code === 'queue-storage' && typeof showSyncNotice === 'function') {
        // Storage failure is actionable even if a prior permission notice was dismissed.
        if (!showSyncNotice(detail.message) && typeof showToast === 'function') showToast(detail.message, 'error');
        return;
    }
    if (typeof reportCloudSaveDenied === 'function') {
        reportCloudSaveDenied(
            { ref: detail.ref, docId: detail.docId, operation: 'WRITE' },
            typeof classifyDbError === 'function' ? classifyDbError({code:detail.code,message:detail.message}) : {category:'CLOUD_SAVE_FAILED',transient:false,message:detail.message}
        );
    }
});
window.addEventListener('pseudopy:sync-saved', event => {
    hideLegacyCloudSaveNotice();
    if (typeof listAllMutations === 'function') {
        listAllMutations().then(records => {
            if (!records.length && typeof resolveSyncNotice === 'function') resolveSyncNotice();
        }).catch(() => {});
    } else if (typeof resolveSyncNotice === 'function') resolveSyncNotice();
    if (typeof cloudAuthReady === 'function' && cloudAuthReady() && typeof cloudUid === 'function') {
        console.info(`[App] Cloud save confirmed for ${event.detail.ref}/${event.detail.docId} (uid ${cloudUid()}).`);
    }
});

/** Removes any notice left behind by an earlier session of this page. */
function hideLegacyCloudSaveNotice() {
    const notice = document.getElementById('cloud-save-status');
    if (notice) notice.remove();
}

const SEED_DONE_KEY = 'pseudopy_seeded';

/**
 * Seeding must not run on every normal boot. It runs once per browser (flag),
 * only when Firestore is reachable, and only writes collections that are
 * empty (seedDatabase's per-collection checks keep it duplicate-safe).
 *
 * It is also restricted to staff. The seed set spans every user's accounts and
 * activity, so under least-privilege rules a student cannot write it — and
 * letting an arbitrary client publish the catalog and other students' records
 * is a hole in its own right. A student still gets the full local seed data
 * through the offline fallback, so nothing is lost visually.
 */
function canSeedFirestore() {
    if (typeof currentUser === 'undefined' || !currentUser) return false;
    return currentUser.role === 'admin' || currentUser.role === 'instructor';
}

async function ensureSeedDatabase() {
    try {
        if (localStorage.getItem(SEED_DONE_KEY) !== null) return;
    } catch (e) { return; }
    if (typeof firestoreReady !== 'function' || !firestoreReady()) return;
    if (typeof seedDatabase !== 'function') return;
    if (!canSeedFirestore()) {
        console.info('[App] Skipping Firestore seeding: restricted to admin/instructor sessions.');
        return;
    }
    await seedDatabase();
    try { localStorage.setItem(SEED_DONE_KEY, '1'); } catch (e) { /* private browsing */ }
}

/**
 * Re-fetch authoritative collections from Firestore after a degraded boot so
 * the IndexedDB cache is reconciled and Firestore stays the source of truth.
 */
async function refreshAuthoritativeCaches() {
    try {
        cachedUsers = await dbGetAll(usersRef);
        cachedExercises = await dbGetAll(exercisesRef, EX_PAGE_LIMIT, 0);
        cachedActivity = await dbGetAll(activityRef);
        console.log('[App] Re-fetched authoritative data from Firestore.');
    } catch (e) {
        console.info('[App] Re-sync fetch skipped:', e && e.message);
    }
}

async function init() {
    console.log('[App] init() called');
    try {

        // Bind the real login form once (Enter / GO / RETURN submit path).
        if (typeof setupLoginForm === 'function') setupLoginForm();

        // Restore the persisted session FIRST so a refresh never flashes
        // login and never behaves like a logout.
        await restoreSession();

        // Non-destructively migrate legacy localStorage collections into the
        // IndexedDB offline store (idempotent, never deletes localStorage).
        if (typeof ensureOfflineDataMigration === 'function') {
            try { await ensureOfflineDataMigration(); } catch (e) { /* non-fatal */ }
        }

        // Seed at most once per browser (never on every startup), then
        // pre-load data from Offline Database into cache.
        await ensureSeedDatabase();
        cachedUsers = await dbGetAll(usersRef);
        cachedExercises = await dbGetAll(exercisesRef, EX_PAGE_LIMIT, 0);
        cachedActivity = await dbGetAll(activityRef);

        console.log(`[App] Loaded users, max ${EX_PAGE_LIMIT} exercises, and activity records from IndexedDB.`);

        // Initialize Theme from Storage
        const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);

        // Show the app version (login footer / settings About).
        renderAppVersion();
        if (typeof renderSystemInfo === 'function') renderSystemInfo();
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
            if (currentErrorLineNumbers.length) {
                currentErrorLineNumbers = [];
                clearEditorErrors('pseudocode-editor');
                setText('console-output', 'Source changed — translate again to refresh diagnostics.');
            }
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

        // Safety net: any page unload (refresh, tab close, PWA update) persists
        // unsaved pseudocode to the draft slot so student work survives.
        window.addEventListener('beforeunload', function () {
            try { if (typeof maybeSaveEditorDraft === 'function') maybeSaveEditorDraft(); } catch (e) { }
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
    const activeExId = localStorage.getItem(STORAGE_KEYS.ACTIVE_EXERCISE);
    if (activeExId) {
        const restoreUser = currentUser;
        const restoreRequest = exerciseOpenRequest;
        if (typeof dbGet === 'function' && typeof exercisesRef !== 'undefined') {
            dbGet(exercisesRef, activeExId).then(ex => {
                if (restoreUser !== currentUser || restoreRequest !== exerciseOpenRequest ||
                    localStorage.getItem(STORAGE_KEYS.ACTIVE_EXERCISE) !== activeExId) return;
                if (ex) renderActiveExercise(ex);
                // Restore any matching unsaved draft once the exercise has loaded.
                try { if (typeof maybeRestoreEditorDraft === 'function') maybeRestoreEditorDraft(); } catch (e) { }
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
    if (!container) return;
    const layout = $id('app-layout');
    const region = $id('app-status-region');
    if (region && layout && !layout.classList.contains('hidden')) region.appendChild(container);
    else if (container.parentNode !== document.body) document.body.appendChild(container);
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



// Public sync-notice API reuses the singleton status region.
function showSyncNotice(message) {
    return showOfflineSaveStatus(message);
}
function resolveSyncNotice() {
    hideOfflineSaveStatus();
}
/* ============================================================
   SKELETON PLACEHOLDERS (UX Rule 1)
   One reusable component: a skeleton must mirror the final
   layout (same heights, gaps, aspect ratio) so replacing it
   with real content causes zero layout shift. Containers set
   aria-busy="true" while a skeleton is visible; the shimmer is
   disabled by prefers-reduced-motion in style.css.
   ============================================================ */

const SKELETON_ROW_WIDTHS = [35, 50, 25, 45, 65, 40, 55, 30];

/** One shimmering bar, optionally width-limited. */
function skeletonBar(widthClass) {
    return '<div class="skeleton skeleton-line' + (widthClass ? ' ' + widthClass : '') + '"></div>';
}

/**
 * Skeleton rows for a table body: one shimmering cell per column, with
 * row-to-row width variation so it reads as data, not a gray slab.
 * The caller sets tbody.setAttribute('aria-busy', 'true').
 */
function skeletonTableRows(columnCount, rowCount) {
    const cols = Math.max(1, columnCount | 0);
    const rows = Math.max(1, rowCount || 4);
    let html = '';
    for (let r = 0; r < rows; r++) {
        let cells = '';
        for (let c = 0; c < cols; c++) {
            const w = SKELETON_ROW_WIDTHS[(r * 3 + c * 5) % SKELETON_ROW_WIDTHS.length];
            cells += '<td aria-hidden="true">' + skeletonBar('skeleton-w-' + w) + '</td>';
        }
        html += '<tr class="skeleton-tr">' + cells + '</tr>';
    }
    return html;
}

/**
 * Fill a table body with skeleton rows and mark it busy.
 * `label` is announced to screen readers while loading.
 */
function showTableSkeleton(tbodyId, columnCount, rowCount, label) {
    const tbody = typeof $id === 'function' ? $id(tbodyId) : null;
    if (!tbody) return;
    tbody.innerHTML =
        '<tr aria-hidden="true"><td colspan="' + Math.max(1, columnCount | 0) + '" style="padding:0.35rem 0.75rem">' +
        '<span class="sr-only" role="status">' + (label || 'Loading…') + '</span>' +
        '</td></tr>' + skeletonTableRows(columnCount, rowCount);
    tbody.setAttribute('aria-busy', 'true');
}

/** Clear the busy flag once real rows replace the skeleton. */
function clearTableSkeleton(tbodyId) {
    const tbody = typeof $id === 'function' ? $id(tbodyId) : null;
    if (tbody) tbody.setAttribute('aria-busy', 'false');
}

/**
 * Skeleton items for vertical lists (notifications, cards):
 * title bar + message bars, matching the real item padding.
 */
function skeletonListItems(count, itemClass) {
    const n = Math.max(1, count | 0);
    const cls = itemClass ? ' ' + itemClass : '';
    let html = '';
    for (let i = 0; i < n; i++) {
        html += '<div class="skeleton-notif' + cls + '" aria-hidden="true">' +
            skeletonBar('skeleton-title skeleton-w-' + SKELETON_ROW_WIDTHS[i % SKELETON_ROW_WIDTHS.length]) +
            skeletonBar('skeleton-w-100') +
            skeletonBar('skeleton-w-' + SKELETON_ROW_WIDTHS[(i + 3) % SKELETON_ROW_WIDTHS.length]) +
            '</div>';
    }
    return html;
}

/**
 * Running placeholder for a console/output area (UX Rule 1 + 3):
 * shown the instant Run is pressed so the tap always answers.
 * Remove with clearRunSkeleton as soon as the first output lands.
 */
function showRunSkeleton(outputEl) {
    if (!outputEl) return;
    outputEl.innerHTML =
        '<div class="console-running" data-run-skeleton="true" aria-hidden="true">' +
        skeletonBar('skeleton-w-65') + skeletonBar('skeleton-w-50') + skeletonBar('skeleton-w-35') +
        '</div><span class="sr-only" role="status">Running…</span>';
    outputEl.setAttribute('aria-busy', 'true');
}

function clearRunSkeleton(outputEl) {
    if (!outputEl) return;
    const skeleton = outputEl.querySelector ? outputEl.querySelector('[data-run-skeleton]') : null;
    if (skeleton) skeleton.remove();
    const status = outputEl.querySelector ? outputEl.querySelector('.sr-only[role="status"]') : null;
    if (status && status.textContent === 'Running…') status.remove();
    outputEl.removeAttribute('aria-busy');
}
/* ============================================================
   DEVICE FINGERPRINTING & AUTHORIZATION
   ============================================================ */

/**
 * Generates and retrieves device details for the current client.
 */
function getDeviceFingerprint() {
let devId = localStorage.getItem(STORAGE_KEYS.DEVICE_ID);
    if (!devId) {
        devId = 'dev_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(STORAGE_KEYS.DEVICE_ID, devId);
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
        saveSession(currentUser);
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

        // Step 4.5: Establish the Firebase Auth session for this account.
        // Firestore rules see `request.auth`, so without this every write is
        // anonymous and is refused. Best-effort and non-blocking: an account
        // with no cloud counterpart yet keeps working exactly as before.
        if (typeof signInToCloud === 'function') {
            try {
                const cloud = await signInToCloud(userByUsername.email, password);
                if (cloud && cloud.ok) {
                    console.info(`[Login] Cloud session established for ${userByUsername.username}.`);
                }
            } catch (e) {
                console.warn('[Login] Cloud sign-in attempt failed:', e && e.message);
            }
        }

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


/* ============================================================
   CLOUD CONNECTIVITY STATUS

   There is no "Reconnecting to the server…" state. Being offline is
   a normal, expected condition for this PWA: the student stays
   signed in, keeps working, and every change is already saved on the
   device. Telling them the app is "reconnecting" was wrong twice over
   - it implied an outage they should wait out, and it animated
   forever because a browser offline is not a server fault.

   The UI now has exactly three calm shapes:
     - a permanent pill reporting the current sync state, and
     - a dismissible notice for a real cloud refusal, and
     - nothing else.
   ============================================================ */

const OFFLINE_SAVE_STATUS_ID = 'offline-save-status';
const OFFLINE_SAVE_DISMISS_ID = 'offline-save-dismiss';
const OFFLINE_SAVE_RETRY_ID = 'offline-save-retry';
const OFFLINE_SAVE_SHOWN_KEY = 'pseudopy.offlineSaveShown';
const OFFLINE_SAVE_DISMISSED_KEY = 'pseudopy.offlineSaveDismissed';

let offlineSaveStatusShown = false;

/** True when the browser itself knows it has no network. */
function isBrowserOffline() {
    return typeof navigator !== 'undefined' && navigator && navigator.onLine === false;
}

function readOfflineSaveDismissed() {
    try { return sessionStorage.getItem(OFFLINE_SAVE_DISMISSED_KEY) === '1'; } catch (e) { return false; }
}

function writeOfflineSaveDismissed(value) {
    try { sessionStorage.setItem(OFFLINE_SAVE_DISMISSED_KEY, value ? '1' : '0'); } catch (e) { }
}

/**
 * Test seam: resets the once-per-session latch. Never called in app code.
 */
function resetOfflineSaveStatusForTests() {
    offlineSaveStatusShown = false;
    writeOfflineSaveDismissed(false);
    try { sessionStorage.setItem(OFFLINE_SAVE_SHOWN_KEY, '0'); } catch (e) {}
}

/**
 * The retired reconnect banner. Kept as a no-op seam because the
 * authentication, session and sync layers still call these names; they
 * now resolve to the permanent pill instead of an alarming banner.
 */
function showReconnectingStatus() {
    if (typeof renderSyncIndicator === 'function') renderSyncIndicator();
}

function hideReconnectingStatus() {
    if (typeof renderSyncIndicator === 'function') renderSyncIndicator();
}

/**
 * Offline is not an error, so it is never announced as a notice that
 * needs dismissing: the always-visible pill already says where the work
 * lives. Only a genuine cloud refusal earns a banner.
 */
function showOfflineSaveStatus(reason) {
    let previouslyShown = false;
    try { previouslyShown = sessionStorage.getItem(OFFLINE_SAVE_SHOWN_KEY) === '1'; } catch (e) {}
    if (offlineSaveStatusShown || readOfflineSaveDismissed() || previouslyShown) return false;
    offlineSaveStatusShown = true;
    const banner = typeof $id === 'function' ? $id(OFFLINE_SAVE_STATUS_ID) : null;
    if (!banner) return false;
    const detail = typeof $id === 'function' ? $id('offline-save-status-detail') : null;
    if (detail) {
        detail.textContent = reason || 'Changes are saved on this device and will sync when the server allows it.';
    }
    banner.hidden = false;
    try { sessionStorage.setItem(OFFLINE_SAVE_SHOWN_KEY, '1'); } catch (e) {}
    return true;
}

function hideOfflineSaveStatus() {
    const banner = typeof $id === 'function' ? $id(OFFLINE_SAVE_STATUS_ID) : null;
    if (banner) banner.hidden = true;
}

/**
 * User-initiated dismissal. Persisted for the session so a permanent refusal
 * is announced exactly once, and never returns until the page is reloaded.
 */
function dismissOfflineSaveStatus() {
    writeOfflineSaveDismissed(true);
    offlineSaveStatusShown = true;
    hideOfflineSaveStatus();
}

function isOfflineSaveStatusVisible() {
    const banner = typeof $id === 'function' ? $id(OFFLINE_SAVE_STATUS_ID) : null;
    return !!(banner && !banner.hidden);
}

/**
 * Transport hook invoked by the database layer on a permanent cloud-write
 * refusal. Shows the dismissible status at most once per session. A browser
 * offline is a connectivity state, not a policy refusal, so it stays on the
 * permanent pill and starts no retry work.
 */
function reportCloudSaveDenied(context, classification) {
    if (!classification || classification.transient) return false;
    if (isBrowserOffline()) {
        // Genuinely offline: the pill already reports it and the durable queue
        // keeps the work. A dismissible banner here would add noise, not clarity.
        renderSyncIndicator();
        return false;
    }
    let reason;
    if (context && context.pendingSignIn) {
        // Not a misconfiguration: the write is queued and will be replayed as
        // soon as this browser has a Firebase Auth session.
        reason = 'Saved on this device. This browser is not signed in to the cloud, so your changes are waiting to sync.';
    } else if (classification.category === 'PERMISSION_DENIED') {
        reason = 'Working offline - saved on this device. This account is not permitted to sync yet.';
    } else {
        reason = 'Your changes are saved on this device, but the server rejected them (' + (classification.category || 'unknown') + ').';
    }
    if (typeof renderSyncIndicator === 'function') renderSyncIndicator();
    return showOfflineSaveStatus(reason);
}

/** Retry the queue on demand. Bounded by the same sync lock as every other trigger. */
function retryCloudSyncNow() {
    if (typeof syncNow !== 'function') return Promise.resolve(null);
    // `syncNow` is async in the app, but resolve defensively so this also
    // works with a synchronous stub.
    return Promise.resolve(syncNow('manual-retry')).then(async function (summary) {
        const remaining = typeof listAllMutations === 'function' ? await listAllMutations() : [];
        if (summary && summary.synced > 0 && remaining.length === 0) {
            hideOfflineSaveStatus();
            // A successful drain earns a fresh announcement for any later,
            // genuinely new failure.
            // Keep the once-per-session announcement latch after successful recovery.
            if (typeof showToast === 'function') showToast('Synced ' + summary.synced + ' pending change(s) to the cloud.', 'success');
        } else if (typeof showToast === 'function') {
            showToast('Could not sync yet. Your changes are safe on this device.', 'info');
        }
        return summary;
    });
}

/* ============================================================
   PERSISTENT CONNECTION INDICATOR

   The always-visible pill. It holds NO state of its own: every value
   is derived from the sync manager's existing synchronous variables
   and the same events the queue already dispatches, so the pill can
   never disagree with the rest of the connectivity UI.

   Offline is reported as a calm, terminal-sounding state with no
   animation. Only an actual upload animates.
   ============================================================ */

const SYNC_INDICATOR_ID = 'sync-state-indicator';
const SYNC_INDICATOR_COUNT_ID = 'sync-state-pending-count';

let syncIndicatorPendingCount = null;   // null until the queue is read once
let syncIndicatorBound = false;
let syncIndicatorCountTimer = null;

/**
 * Derive the current state. Order matters: a permission refusal outranks an
 * outage because the server answered, and the browser's own offline flag is
 * the weakest signal of all (navigator.onLine reports "online" on a captive
 * portal and "offline" on some working wifi).
 *
 * "Syncing" is reserved for a queue that is actively uploading. Everything
 * that cannot currently reach Firestore reports where the work actually
 * lives - on the device - instead of implying a retry is under way.
 */
function readSyncIndicatorState() {
    const localDetail = 'Your work is saved on this device and will sync when you are back online.';
    if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
        return { key: 'offline', label: 'Offline', detail: 'No network connection. ' + localDetail };
    }
    if (typeof syncPermissionBlocked !== 'undefined' && syncPermissionBlocked) {
        return { key: 'denied', label: 'Synced locally', detail: 'This account cannot sync to the cloud yet. ' + localDetail };
    }
    if (typeof firestoreReady === 'function' && !firestoreReady()) {
        return { key: 'local', label: 'Synced locally', detail: 'Firestore is unavailable. ' + localDetail };
    }
    if (typeof isFirestoreReachable === 'function' && !isFirestoreReachable()) {
        return { key: 'local', label: 'Synced locally', detail: 'The cloud is not reachable yet. ' + localDetail };
    }
    if (typeof syncInProgress !== 'undefined' && syncInProgress) {
        return { key: 'syncing', label: 'Syncing', detail: 'Uploading saved changes to the cloud.' };
    }
    if (syncIndicatorPendingCount > 0) {
        return { key: 'queued', label: 'Saved on this device', detail: syncIndicatorPendingCount + ' change(s) waiting to upload.' };
    }
    return { key: 'synced', label: 'Synced', detail: 'All changes are saved to the cloud.' };
}

function renderSyncIndicator() {
    if (typeof $id !== 'function') return null;
    const pill = $id(SYNC_INDICATOR_ID);
    if (!pill) return null;

    const state = readSyncIndicatorState();
    pill.dataset.state = state.key;
    pill.title = state.detail;
    pill.setAttribute('aria-label', 'Cloud sync status: ' + state.label + '. ' + state.detail);

    const label = pill.querySelector('.sync-state-label');
    if (label) label.textContent = state.label;

    const count = $id(SYNC_INDICATOR_COUNT_ID);
    if (count) {
        if (state.key === 'queued' && syncIndicatorPendingCount > 0) {
            count.textContent = String(syncIndicatorPendingCount);
            count.hidden = false;
        } else {
            count.hidden = true;
        }
    }
    return state;
}

/**
 * Refresh the queued-change count. getSyncState() is async because it reads
 * IndexedDB, so the pill renders its synchronous state immediately and
 * upgrades it when the count lands.
 */
function refreshSyncIndicatorCounts() {
    if (typeof getSyncState !== 'function') return Promise.resolve(null);
    return Promise.resolve(getSyncState()).then(function (state) {
        if (!state) return null;
        // Blocked-permission records are still unsynced work, so they belong
        // in the count even though they will never retry on their own.
        syncIndicatorPendingCount = (state.pending || 0) + (state.failed || 0) + (state.blocked || 0);
        renderSyncIndicator();
        return state;
    }, function () { return null; });
}

function initSyncIndicator() {
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    if (!syncIndicatorBound) {
        syncIndicatorBound = true;
        // Reuse the listeners already wired above rather than adding a second
        // set, so the pill and the banners can never drift apart.
        window.addEventListener('online', refreshSyncIndicatorCounts);
        window.addEventListener('offline', renderSyncIndicator);
        window.addEventListener('pseudopy:connection-state', function () {
            renderSyncIndicator();
            scheduleSyncIndicatorCountRefresh();
        });
        // Sync lifecycle (upload start/finish/failure) is what turns the pill
        // into Syncing -> Synced; reachability alone cannot tell that apart
        // from "nothing to do".
        window.addEventListener('pseudopy:sync-progress', renderSyncIndicator);
        window.addEventListener('pseudopy:sync-error', function () {
            renderSyncIndicator();
            scheduleSyncIndicatorCountRefresh();
        });
        window.addEventListener('pseudopy:sync-saved', function () {
            scheduleSyncIndicatorCountRefresh();
        });
    }
    renderSyncIndicator();
    refreshSyncIndicatorCounts();
}

/**
 * markFirestoreReachable fires on every completed Firestore attempt, which can
 * be frequent. Coalesce the IndexedDB read so a sync burst costs one query.
 */
function scheduleSyncIndicatorCountRefresh() {
    if (syncIndicatorCountTimer) return;
    syncIndicatorCountTimer = setTimeout(function () {
        syncIndicatorCountTimer = null;
        refreshSyncIndicatorCounts();
    }, 750);
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSyncIndicator);
    } else {
        initSyncIndicator();
    }
}

function initConnectionStatus() {
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    const dismiss = typeof $id === 'function' ? $id(OFFLINE_SAVE_DISMISS_ID) : null;
    if (dismiss && !dismiss.__pseudopyBound) {
        dismiss.__pseudopyBound = true;
        dismiss.addEventListener('click', function () {
            dismissOfflineSaveStatus();
        });
    }
    const retry = typeof $id === 'function' ? $id(OFFLINE_SAVE_RETRY_ID) : null;
    if (retry && !retry.__pseudopyBound) {
        retry.__pseudopyBound = true;
        retry.addEventListener('click', function () {
            retry.disabled = true;
            Promise.resolve(retryCloudSyncNow()).then(function () {
                retry.disabled = false;
            }, function () {
                retry.disabled = false;
            });
        });
    }
    if (!initConnectionStatus.__bound) {
        initConnectionStatus.__bound = true;
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && isOfflineSaveStatusVisible()) dismissOfflineSaveStatus();
        });
        // Coming back online is a hint, not proof: the queue has to actually
        // upload before the pill may say Synced. The sync manager owns that.
        window.addEventListener('online', function () {
            if (typeof resetCloudCircuit === 'function') resetCloudCircuit();
            renderSyncIndicator();
        });
        window.addEventListener('offline', renderSyncIndicator);
    }
    // Starting offline is not a fault to announce: the permanent pill already
    // states that work is saved on the device.
    renderSyncIndicator();
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initConnectionStatus);
    } else {
        initConnectionStatus();
    }
}
/* ============================================================
   PERSISTED SESSION RESTORE
   Browser-local Firebase-session persistence for the PseudoPy
   Firestore-backed identity model. A page refresh, CRUD write or
   PWA update must never behave like an implicit logout.
   ============================================================ */

const SESSION_KEY = STORAGE_KEYS.SESSION_USER;
const ROUTE_KEY = STORAGE_KEYS.ROUTE;

const BOOT_LOADING = 'AUTH_LOADING';
const BOOT_PROFILE_LOADING = 'PROFILE_LOADING';
const BOOT_AUTHENTICATED = 'AUTHENTICATED';
const BOOT_AUTHENTICATED_DEGRADED = 'AUTHENTICATED_DEGRADED';
const BOOT_UNAUTHENTICATED = 'UNAUTHENTICATED';

let bootState = BOOT_LOADING;
let profileRefreshAttempts = 0;

/**
 * Returns a persistable copy of a user record with credential fields
 * stripped. Password material must never be written to frontend storage.
 */
function sanitizeUser(user) {
    if (!user) return null;
    const copy = {};
    for (const key of Object.keys(user)) {
        if (key === 'password' || key === 'passwordHash' || key === 'passwordSalt') continue;
        copy[key] = user[key];
    }
    return copy;
}

/**
 * Persist the authenticated user's sanitized profile using browser-local
 * persistence so the session survives refresh, reopened tabs and PWA updates.
 */
function saveSession(user) {
    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(sanitizeUser(user)));
    } catch (e) {
        console.warn('[Session] Failed to persist session:', e);
    }
}

/**
 * Clear the persisted session and related transient markers.
 */
function clearSession() {
    if (typeof resolveSyncNotice === 'function') resolveSyncNotice();
    if (typeof hideConnectionBanner === 'function') hideConnectionBanner();
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { }
    try { sessionStorage.removeItem(STORAGE_KEYS.SESSION_USER); } catch (e) { }
    try { sessionStorage.removeItem(STORAGE_KEYS.UPDATE_DISMISSED); } catch (e) { }
}

/**
 * Persist the current protected page so a refresh restores the same route.
 */
function persistRoute(pageId) {
    try { localStorage.setItem(ROUTE_KEY, pageId); } catch (e) { }
}

function getPersistedRoute() {
    try { return localStorage.getItem(ROUTE_KEY) || ''; } catch (e) { return ''; }
}

function clearPersistedRoute() {
    try { localStorage.removeItem(ROUTE_KEY); } catch (e) { }
}

/**
 * Boot gate. The `booting` class is added by an inline script in <head> before
 * anything is parsed, so the first paint cannot reveal the login page.
 * settleBoot() is the single place that lifts it, and every terminal path of
 * restoreSession() must call it or the app is left behind the splash.
 *
 * The inline script also arms an independent 8s failsafe, so a bundle that never
 * loads cannot leave a blank page.
 */
function showBootSplash() {
    const splash = $id('boot-splash');
    if (splash) splash.classList.add('is-visible');
}

function hideBootSplash() {
    const splash = $id('boot-splash');
    if (splash) splash.classList.remove('is-visible');
}

/** Lift the boot gate: reveal whichever surface the session resolved to. */
function settleBoot() {
    hideBootSplash();
    if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.classList.remove('booting');
    }
}

// Session-level names kept for the existing callers (authentication logout,
// renderSessionState). The behaviour lives in connection-status.js, which no
// longer has a reconnect banner: a degraded boot reports itself through the
// permanent sync pill and nothing else, so a student offline is never told
// the app is "reconnecting".
function showConnectionBanner() {
    if (typeof showReconnectingStatus === 'function') showReconnectingStatus();
    else if (typeof renderSyncIndicator === 'function') renderSyncIndicator();
}

function hideConnectionBanner() {
    if (typeof hideReconnectingStatus === 'function') hideReconnectingStatus();
    else if (typeof renderSyncIndicator === 'function') renderSyncIndicator();
}

function makeGoneError() {
    const gone = new Error('Session account no longer exists.');
    gone.name = 'SessionAccountGone';
    return gone;
}

/**
 * Best-known cached profile for an account id (from the IndexedDB-backed local
 * collection). Only accepts roles/status the app can boot; never credentials.
 */
function loadCachedProfileFor(snapshot) {
    const id = snapshot && (snapshot._docId || snapshot.id);
    if (!id || typeof getLocalCollection !== 'function' || typeof usersRef === 'undefined') return null;
    try {
        const rows = getLocalCollection(usersRef);
        const found = (rows && rows.find ? rows.find(item => item._docId === id || item.id === id) : null);
        if (!found) return null;
        const role = String(found.role || '').toLowerCase();
        const status = String(found.status || 'active').toLowerCase();
        if (['student', 'instructor', 'admin'].includes(role)
            && status !== 'archived' && status !== 'inactive' && status !== 'deleted') return sanitizeUser(found);
    } catch (e) { /* fall through to the persisted snapshot */ }
    return null;
}

/**
 * Bounded background re-sync after a degraded boot. Refetches the profile from
 * Firestore (with a few attempts), then restores authority by refreshing the
 * cached collections and re-rendering. Never loops forever (max 3 retries).
 *
 * A *permanent* refusal (rules/permissions) is not a connectivity problem, so
 * it switches to the dismissible "saved on this device" status and stops
 * probing. A browser that is offline schedules nothing at all: the queue and
 * the local profile are durable, and `online` already triggers a drain.
 */
function scheduleProfileRefresh(docId, fallbackRoute) {
    if (typeof dbGet !== 'function' || typeof checkAccess !== 'function') return;
    if (profileRefreshAttempts >= 3 || (typeof cloudRequestsAllowed === 'function' && !cloudRequestsAllowed())) return;
    // Never poll a network the platform reports as down.
    if (typeof isBrowserOffline === 'function' && isBrowserOffline()) return;
    profileRefreshAttempts++;
    const backoffMs = [1500, 3000, 6000][profileRefreshAttempts - 1] || 6000;
    setTimeout(async () => {
        if (typeof cloudRequestsAllowed === 'function' && !cloudRequestsAllowed()) return;
        if (typeof isBrowserOffline === 'function' && isBrowserOffline()) return;
        try {
            const fresh = await dbGet(usersRef, docId, { strict: true });
            if (!fresh) { profileRefreshAttempts = 3; return; }
            currentUser = fresh;
            profileRefreshAttempts = 0;
            if (typeof hideConnectionBanner === 'function') hideConnectionBanner();
            if (typeof refreshAuthoritativeCaches === 'function') refreshAuthoritativeCaches();
            // Connectivity is back: replay any offline mutations queued while
            // the app was degraded.
            if (typeof syncNow === 'function') syncNow('recovered');
            const route = getPersistedRoute();
            const targetPage = (route && checkAccess(fresh.role, route)) ? route : (fallbackRoute || '');
            renderSessionState({ state: BOOT_AUTHENTICATED, user: fresh, route: targetPage });
            console.log('[Session] Background re-sync completed; Firestore is authoritative again.');
        } catch (e) {
            if (typeof isPermanentDbError === 'function' && isPermanentDbError(e)) {
                // Stop probing: no retry can change a ruleset.
                profileRefreshAttempts = 3;
                if (typeof hideConnectionBanner === 'function') hideConnectionBanner();
                if (typeof reportCloudSaveDenied === 'function') {
                    reportCloudSaveDenied({ ref: 'pseudopy_users', docId, operation: 'READ' }, classifyDbError(e));
                }
                console.info('[Session] Firestore refused the profile read permanently; staying on local data.');
                return;
            }
            console.info('[Session] Background re-sync still unavailable:', e && e.message);
        }
    }, backoffMs);
}

/**
 * UI-rendering half of the boot. Session state is computed separately; this
 * only materializes the result once the DOM containers exist. A renderer
 * failure here is logged and never flips the authentication state.
 */
function renderSessionState(result) {
    if (!result || (result.state !== BOOT_AUTHENTICATED && result.state !== BOOT_AUTHENTICATED_DEGRADED)) {
        settleBoot();
        return;
    }
    const targetPage = result.route || '';
    if (typeof showApp === 'function') {
        try { showApp(targetPage); } catch (e) { console.warn('[Session] App render failed, session kept:', e && e.message); }
    }
    if (result.state === BOOT_AUTHENTICATED_DEGRADED && !result.permanentFailure) showConnectionBanner();
    settleBoot();
}

/**
 * Boot-time auth restore. Runs once on startup:
 *   1. If no persisted session -> UNAUTHENTICATED (login screen).
 *   2. Otherwise show the boot splash, re-fetch the user record from
 *      Firestore as the authoritative source of profile/role/status, and
 *      restore the previously persisted route (access-checked).
 *   3. Rendering is separated into renderSessionState() so a UI error can
 *      never sign the user out.
 * A missing/invalid record clears the session; a temporary Firestore delay
 * must never sign anyone out — it boots from the best-known cached profile in
 * AUTHENTICATED_DEGRADED and re-syncs in the background.
 */
async function restoreSession() {
    bootState = BOOT_LOADING;

    let snapshot = null;
    try {
        snapshot = JSON.parse(localStorage.getItem(SESSION_KEY));
    } catch (e) {
        snapshot = null;
    }

    if (!snapshot || !((snapshot._docId || snapshot.id))) {
        // No session, and localStorage answers that synchronously, so there is
        // no reason to keep the gate closed for even one frame. Reveal the login
        // page directly: a first-time visitor now goes straight to it instead of
        // paying for a splash they did not need.
        bootState = BOOT_UNAUTHENTICATED;
        settleBoot();
        return { state: BOOT_UNAUTHENTICATED, user: null, route: '' };
    }

    // A session exists, so the strict profile read is worth waiting behind.
    showBootSplash();
    bootState = BOOT_PROFILE_LOADING;

    const docId = snapshot._docId || snapshot.id;

    try {
        const fresh = await dbGet(usersRef, docId, { strict: true });

        if (!fresh) {
            // Firestore is authoritative and confirms the account is gone.
            throw makeGoneError();
        }

        const status = (fresh.status || 'active').toLowerCase();
        if (status === 'archived' || status === 'inactive' || status === 'deleted') {
            clearSession();
            bootState = BOOT_UNAUTHENTICATED;
            settleBoot();
            showToast('Your session ended. This account is no longer active.', 'info');
            return { state: BOOT_UNAUTHENTICATED, user: null, route: '' };
        }

        currentUser = fresh;

        const route = getPersistedRoute();
        const targetPage = (route && checkAccess(fresh.role, route)) ? route : '';

        bootState = BOOT_AUTHENTICATED;
        renderSessionState({ state: BOOT_AUTHENTICATED, user: fresh, route: targetPage });
        console.log('[Session] Restored:', fresh.username, 'role:', fresh.role, 'page:', targetPage || '(default)');
        return { state: BOOT_AUTHENTICATED, user: fresh, route: targetPage };
    } catch (err) {
        if (err && err.name === 'SessionAccountGone') {
            // The account was explicitly deleted: purge stored credentials-free
            // profile so stale sessions never resurrect.
            console.warn('[Session] Account no longer exists; clearing stored session.');
            clearSession();
            bootState = BOOT_UNAUTHENTICATED;
            settleBoot();
            return { state: BOOT_UNAUTHENTICATED, user: null, route: '' };
        }
        // Transient Firestore/network failure: the persisted session is
        // kept so a later boot can retry. A temporary outage must never
        // behave like a (silent) logout.
        console.warn('[Session] Restore temporarily unavailable; kept session for retry:', err && err.message);
        const permanent = typeof isPermanentDbError === 'function' && isPermanentDbError(err);
        const cached = loadCachedProfileFor(snapshot);
        if (cached || (snapshot && (snapshot._docId || snapshot.id))) {
            currentUser = cached || sanitizeUser(snapshot);
            bootState = BOOT_AUTHENTICATED_DEGRADED;
            const route = getPersistedRoute();
            const targetPage = (route && checkAccess(currentUser.role, route)) ? route : '';
            renderSessionState({ state: BOOT_AUTHENTICATED_DEGRADED, user: currentUser, route: targetPage, permanentFailure: permanent });
            if (permanent) {
                // A refusal is not an outage: dismissible status, no retry loop.
                hideConnectionBanner();
                if (typeof reportCloudSaveDenied === 'function') {
                    reportCloudSaveDenied({ ref: 'pseudopy_users', docId, operation: 'READ' }, classifyDbError(err));
                }
            } else {
                scheduleProfileRefresh(docId, targetPage);
            }
            return { state: BOOT_AUTHENTICATED_DEGRADED, user: currentUser, route: targetPage };
        }
        bootState = BOOT_UNAUTHENTICATED;
        settleBoot();
        return { state: BOOT_UNAUTHENTICATED, user: null, route: '' };
    }
}/* ============================================================
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
    if (pageId === 'system-analytics') {
        guarded(loadSystemAnalytics);
    } else if (typeof stopSystemAnalyticsRealtime === 'function') {
        stopSystemAnalyticsRealtime();
    }
    if (pageId === 'compiler-metrics') guarded(loadCompilerMetrics);
    if (pageId === 'developer-options') {
        // DevTools is a dev-only surface; its bundle (devtools.js) is fetched
        // lazily on first entry instead of paying for it on every page load.
        if (typeof initDevTools === 'function') {
            initDevTools();
        } else {
            loadScripts(['devtools.js'], function () { if (typeof initDevTools === 'function') initDevTools(); });
        }
    } else if (typeof devToolsAbortRun === 'function') {
        // Leaving the DevTools page must stop any in-flight Skulpt run so a
        // pending input can never resolve into a hidden page.
        devToolsAbortRun();
    }
    // Refresh student progress pill whenever the Write Pseudocode page is shown
    if (pageId === 'write-pseudocode' && currentUser && currentUser.role === 'student') {
        updateExerciseStatus();
        loadStudentProgress();
        if (typeof maybeAutoStartTutorial === 'function') {
            try { maybeAutoStartTutorial(); } catch (e) { /* tour must never block navigation */ }
        }
        if (typeof maybeRestoreEditorDraft === 'function') {
            try { maybeRestoreEditorDraft(); } catch (e) { /* draft restore must never block navigation */ }
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
    if (typeof Event === 'function') document.dispatchEvent(new Event('layoutchange'));
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


/* Student-initiated translations are learning attempts, not graded submissions. */
let lastTranslationActivity = null;

function recordStudentTranslation(source, result, inputId) {
    if (!currentUser || currentUser.role !== 'student' ||
        !['pseudocode-editor', 'translate-input'].includes(inputId)) return Promise.resolve(null);
    const user = currentUser;
    const exercise = inputId === 'pseudocode-editor' ? exerciseState.activeExercise : null;
    const accountId = user._docId || user.id;
    const exerciseId = exercise ? exercise._docId || exercise.id : null;
    const now = Date.now();
    const key = JSON.stringify([accountId, exerciseId, inputId, source]);
    // Coalesce accidental double clicks, but allow deliberate later retries.
    if (lastTranslationActivity && lastTranslationActivity.key === key && now - lastTranslationActivity.time < 800) {
        return lastTranslationActivity.promise;
    }
    const id = 'translate_' + (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID() : now + '_' + Math.random().toString(36).slice(2));
    const errors = (Array.isArray(result.errors) ? result.errors : []).filter(Boolean).map(error => ({
        line: Number.isInteger(error.line) ? error.line : null,
        column: Number.isInteger(error.column) ? error.column : null,
        errorType: classifyActivityError(error),
        message: String(error.message || 'Compilation failed.'),
        suggestion: String(error.suggestion || '')
    }));
    const record = {
        _docId: id, id, type: 'translate_attempt',
        uid: typeof cloudUid === 'function' ? cloudUid() : null,
        studentAccountId: accountId, studentId: user.studentId || accountId,
        studentNumber: user.studentNumber || user.studentId || '',
        student: user.fullName || user.username || '', username: user.username || '',
        instructorId: (exercise && (exercise.instructorId || exercise.createdBy)) || user.instructorId || 'u2',
        section: user.section || '', exerciseId,
        exercise: exercise ? exercise.title || exercise.concept || 'Exercise' : 'Free practice',
        difficulty: exercise ? exercise.difficulty || 'moderate' : null,
        status: result.valid ? 'ungraded' : 'compile_error', compileSuccess: !!result.valid,
        score: null, pseudocode: source, generatedPython: result.python || '',
        python_code: result.python || '', errors, errorType: errors.length ? errors[0].errorType : null,
        result: result.valid ? 'Translation successful' : (errors[0] ? errors[0].errorType : 'Compiler Error'),
        output: errors.map(error => (error.line ? 'Line ' + error.line + ': ' : '') + error.message).join('\n'),
        processingTime: ((result.metrics && result.metrics.totalTime || 0) / 1000).toFixed(3) + 's',
        timestamp: now, time: new Date(now).toISOString(), createdAt: new Date(now).toISOString()
    };
    const promise = (async () => {
        try {
            // dbSet persists locally first and queues the same document ID for replay.
            await dbSet(activityRef, id, record);
            return record;
        } catch (error) {
            if (currentUser === user) {
                showToast(error.localOnly
                    ? 'Translation attempt saved on this device. Sync will retry when connected or signed in.'
                    : 'Could not record this translation attempt. Your code is still in the editor.',
                error.localOnly ? 'info' : 'error');
            }
            console.warn('[Translation activity] Save not confirmed:', error);
            return error.localOnly ? record : null;
        }
    })();
    lastTranslationActivity = { key, time: now, promise };
    return promise;
}
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

        let result;
        try {
            result = pseudocodeToPython(input);
        } catch (error) {
            result = { valid: false, python: '', warnings: [], errors: [{
                errorType: 'Compiler Error', message: error.message || String(error)
            }] };
        }
        if (typeof recordStudentTranslation === 'function') {
            recordStudentTranslation(input, result, inputId).catch(error => console.warn('[Translation activity]', error));
        }
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
        if (typeof StudentWorkspace !== 'undefined') {
            try { StudentWorkspace.translated(inputId, input, result, PseudoPyLearning.lastTranslation && PseudoPyLearning.lastTranslation.compile === result ? PseudoPyLearning.lastTranslation : null); }
            catch (e) { console.error('Student workspace update failed:', e); }
        }
        const consoleEl = consoleId ? $id(consoleId) : null;
        const runBtn = runBtnSelector ? $qs(runBtnSelector) : null;

        if (!validation.valid) {
            setPythonOutput(outputId, '# Translation failed due to errors in your pseudocode.\n# Please check the console below for details.');
            if (consoleEl) {
                consoleEl.innerHTML = renderHtmlErrors(validation.errors);
                consoleEl.className = 'output-content error';
            }
            if (runBtn) runBtn.disabled = true;
            showToast(`${validation.errors.length} error(s) found. Check the console output.`, 'error');
            if (outputId === 'python-output') {
                currentErrorLineNumbers = validation.errors.map(err => err.line);
                currentConsoleErrors = validation.errors;
                updateGutter();
            }
            maybeRenderLearningPanel(outputId);
            return;
        }

        if (outputId === 'python-output') {
            currentErrorLineNumbers = [];
            currentConsoleErrors = [];
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
        '#btn-run-code',
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
                try {
                    await ensurePdfJsLoaded();
                } catch (e) {
                    showToast(e && e.message ? e.message : 'PDF library could not be loaded.', 'error');
                    return;
                }
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
   UX Rule 3: every Run tap answers within one frame — the button
   goes busy immediately, the console area shows a skeleton, and
   program output is batched into one layout per animation frame
   with a 2,000-node cap so long runs never freeze the page.
   ============================================================ */

// Rendered-output cap for the student/instructor/admin consoles. The full
// transcript is retained in memory for submissions; only the DOM is capped
// (same policy as the DevTools console, DEV_CONSOLE_MAX_ROWS).
const RUN_OUTPUT_NODE_CAP = 2000;

const RUN_BUTTON_BY_OUTPUT = {
    'python-output': 'btn-run-code',
    'translate-output': 'btn-run-translate',
    'execute-editor': 'btn-run-execpage',
    'instructor-python-output': 'btn-run-instructor',
    'admin-execute-editor': 'btn-run-admin'
};

/**
 * Busy state for the Run button that started this run: disabled, aria-busy
 * and a visible "Running…" label with an inline spinner (.is-loading-text).
 * The label swap is reverted on completion so the resting label never moves.
 */
function setRunButtonBusy(outputId, busy) {
    const btnId = RUN_BUTTON_BY_OUTPUT[outputId];
    if (!btnId) return;
    const btn = $id(btnId);
    if (!btn) return;
    if (busy) {
        // Preserve the rendered markup (icons included) and restore it after
        // the run so the resting button is byte-identical to before.
        if (!btn.dataset.runHtml) btn.dataset.runHtml = btn.innerHTML;
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
        btn.classList.add('is-loading-text');
        btn.textContent = 'Running…';
    } else {
        btn.disabled = false;
        btn.setAttribute('aria-busy', 'false');
        btn.classList.remove('is-loading-text');
        if (btn.dataset.runHtml) btn.innerHTML = btn.dataset.runHtml;
    }
}

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
    setRunButtonBusy(outputId, true);
    try {
        runPythonCode(code, outputId);
    } catch (e) {
        setRunButtonBusy(outputId, false);
        throw e;
    }
}

function runPythonCode(code, outputElementId) {
    const outputEl = $id(outputElementId);
    if (!outputEl) return;
    outputEl.innerHTML = '';
    outputEl.className = 'output-content';
    // UX Rule 1 + 3: the tap must answer immediately. A layout-matched
    // skeleton appears the moment Run is pressed and is removed as soon as
    // the first real output lands (clearRunSkeleton in appendOutput).
    if (typeof showRunSkeleton === 'function') showRunSkeleton(outputEl);

    if (typeof Sk === 'undefined') {
        outputEl.textContent = 'Loading Python runtime...';
        ensureSkulptLoaded(function () {
            if (typeof Sk !== 'undefined') {
                runPythonCode(code, outputElementId);
            } else {
                outputEl.textContent = 'Skulpt library not loaded.\n\nFalling back to static analysis...\n\n';
                outputEl.textContent += simulateExecution(code);
            }
        }, function () {
            outputEl.textContent = 'Skulpt library not loaded.\n\nFalling back to static analysis...\n\n';
            outputEl.textContent += simulateExecution(code);
        });
        return;
    }

    // The compiler now handles str() wrapping correctly in smartPrintExpr(),
    // so no runtime code fixup is needed. Use code as-is.
    const cleanCode = code;
    const runExercise = exerciseState.activeExercise;
    const runSource = outputElementId === 'console-output' ? getValue('pseudocode-editor') : null;
    const runUser = currentUser;
    const sameExerciseRun = () => runExercise === exerciseState.activeExercise && runUser === currentUser &&
        (outputElementId !== 'console-output' || runSource === getValue('pseudocode-editor'));
    const studentRun = typeof StudentWorkspace !== 'undefined' ? StudentWorkspace.beginRun(outputElementId, code) : null;

    // UX Rule 3: batch Skulpt output into a single layout pass per animation
    // frame (one span per frame, not one per output chunk) and cap the
    // rendered nodes. The full transcript stays in `outputTranscript` so
    // submissions and exercise matching never lose content to the cap.
    let pendingOutputText = '';
    let outputFlushHandle = null;
    let outputTranscript = '';
    const renderedSpans = [];
    let droppedSpans = 0;

    function flushOutput() {
        outputFlushHandle = null;
        if (!pendingOutputText) return;
        if (typeof clearRunSkeleton === 'function') clearRunSkeleton(outputEl);
        const chunk = pendingOutputText;
        pendingOutputText = '';
        const span = document.createElement('span');
        span.textContent = chunk;
        renderedSpans.push(span);
        outputEl.appendChild(span);
        while (renderedSpans.length > RUN_OUTPUT_NODE_CAP) {
            const dropped = renderedSpans.shift();
            if (dropped.parentNode === outputEl) dropped.remove();
            droppedSpans++;
        }
        if (droppedSpans > 0) {
            let notice = outputEl.querySelector('.console-cap-notice');
            if (!notice) {
                notice = document.createElement('div');
                notice.className = 'console-cap-notice';
                notice.setAttribute('role', 'status');
            } else if (notice.parentNode === outputEl) {
                notice.remove();
            }
            notice.textContent = 'Older output trimmed to the most recent ' + RUN_OUTPUT_NODE_CAP + ' chunks — the full transcript is kept for your submission.';
            outputEl.appendChild(notice);
        }
    }

    function scheduleOutputFlush() {
        if (typeof requestAnimationFrame === 'function') {
            if (outputFlushHandle === null) outputFlushHandle = requestAnimationFrame(flushOutput);
        } else {
            flushOutput();
        }
    }

    function flushNow() {
        if (outputFlushHandle !== null && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(outputFlushHandle);
            outputFlushHandle = null;
        }
        flushOutput();
    }

    // Helper: append text to the console output (HTML-safe, frame-batched)
    function appendOutput(text) {
        outputTranscript += text;
        pendingOutputText += text;
        scheduleOutputFlush();
    }

    // execLimit must be part of the Sk.configure() payload: Skulpt's compiler
    // bakes the interrupt test into the generated code from this option, so a
    // later `Sk.execLimit = ...` assignment would be ignored and a runaway
    // loop would freeze the tab.
    const execLimitOptions = (typeof skulptExecLimitOptions === 'function')
        ? skulptExecLimitOptions(SKULPT_EXEC_LIMIT_MS)
        : { execLimit: 15000 };

    Sk.configure(Object.assign({
        output: function (text) { appendOutput(text); },
        read: function (x) {
            if (Sk.builtinFiles === undefined || Sk.builtinFiles["files"][x] === undefined) throw "File not found: '" + x + "'";
            return Sk.builtinFiles["files"][x];
        },
        inputfun: function (promptText) {
            return new Promise(function (resolve) {
                flushNow();
                if (typeof clearRunSkeleton === 'function') clearRunSkeleton(outputEl);
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
    }, execLimitOptions));

    Sk.misceval.asyncToPromise(function () {
        return Sk.importMainWithBody("<stdin>", false, cleanCode, true);
    }).then(function () {
        flushNow();
        setRunButtonBusy(outputElementId, false);
        if (typeof clearRunSkeleton === 'function') clearRunSkeleton(outputEl);
        if (!outputTranscript.trim()) outputEl.textContent = 'Code executed successfully (no output).';
        showToast('Code executed successfully!', 'success');
        if (typeof StudentWorkspace !== 'undefined') StudentWorkspace.endRun(studentRun, true, outputTranscript);

        // ── Panel 1: Record successful execution ──
        if (typeof metricsEngine !== 'undefined') {
            metricsEngine.recordExecution(true);
        }

        if (outputElementId === 'console-output' && exerciseState.activeExercise && sameExerciseRun()) {
            exerciseState.isExecuted = true;
            exerciseState.outputMatched = false;
            if (exerciseState.expectedOutputResolved && exerciseState.expectedOutput) {
                const actualOut = outputTranscript.trim();
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
        flushNow();
        setRunButtonBusy(outputElementId, false);
        const errText = String(err && err.toString ? err.toString() : err);
        // A tripped run budget is a stop condition, not a program bug. Say so
        // plainly so the student does not hunt for a syntax error that is not
        // there.
        const timedOut = /exceeded run time limit|TimeoutError/i.test(errText);
        appendOutput('\nError: ' + errText);
        if (timedOut) {
            appendOutput('\n\nStopped after ' + Math.round((typeof SKULPT_EXEC_LIMIT_MS === 'number' ? SKULPT_EXEC_LIMIT_MS : 15000) / 1000) + ' seconds. Check for a loop that never ends.');
        }
        flushNow();
        outputEl.className = 'output-content error';
        showToast(timedOut ? 'Execution stopped: time limit reached.' : 'Runtime error occurred.', 'error');
        if (typeof StudentWorkspace !== 'undefined') StudentWorkspace.endRun(studentRun, false, outputTranscript);

        // ── Panel 1: Record failed execution ──
        if (typeof metricsEngine !== 'undefined') {
            metricsEngine.recordExecution(false, errText);
        }

        if (outputElementId === 'console-output' && exerciseState.activeExercise && sameExerciseRun()) {
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

// ── Difficulty normalization (single source of truth) ────────
function normDiff(d) {
    const v = (d || 'moderate').toLowerCase();
    return v === 'medium' ? 'moderate' : v;
}
function dispDiff(d) {
    const v = normDiff(d);
    return v.charAt(0).toUpperCase() + v.slice(1);
}

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
    const easyCount = instructorExercises.filter(e => normDiff(e.difficulty) === 'easy').length;
    const modCount = instructorExercises.filter(e => normDiff(e.difficulty) === 'moderate').length;
    const hardCount = instructorExercises.filter(e => normDiff(e.difficulty) === 'hard').length;

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

    const rows = exercises.map(ex => {
        const title = ex.title || ex.concept || 'Untitled Exercise';
        const desc = ex.description || 'No description.';
        const diff = normDiff(ex.difficulty);
        const date = ex.createdAt || '—';
        return `
        <tr>
          <td style="font-weight:600;color:var(--text-primary)">${title}</td>
          <td style="color:var(--text-secondary);max-width:280px">
            <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px" title="${desc}">${desc}</div>
          </td>
          <td><span class="ex-difficulty ${diff}">${dispDiff(ex.difficulty)}</span></td>
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
                ? `<button class="ex-start-btn" onclick="attemptExercise('${ex._docId}')">View submission</button>`
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
        const topbarTrack = $id('topbar-progress-track');
        if (topbarTrack) {
            topbarTrack.setAttribute('aria-valuenow', pct);
            topbarTrack.setAttribute('aria-valuetext', completedCount + ' of ' + totalExercises + ' exercises completed');
        }
        const studentTrack = $id('student-progress-track');
        if (studentTrack) {
            studentTrack.setAttribute('aria-valuenow', pct);
            studentTrack.setAttribute('aria-valuetext', completedCount + ' of ' + totalExercises + ' exercises completed');
        }

        console.log(`[Progress] ${completedCount} / ${totalExercises} exercises completed (${pct}%)`);
    } catch (err) {
        console.error('[Progress] Failed to load student progress:', err);
    }
}

let exerciseOpenRequest = 0;
async function attemptExercise(id, resubmissionOf = null) {
    const request = ++exerciseOpenRequest;
    const user = currentUser;
    exerciseSubmissionLoading = true;
    exerciseSubmissionMessage = '';
    updateExerciseStatus();
    let ex;
    try { ex = await dbGet(exercisesRef, id); }
    catch (error) {
        if (request !== exerciseOpenRequest || user !== currentUser) return;
        exerciseSubmissionLoading = false;
        showToast('Unable to load this exercise. Please retry.', 'error');
        updateExerciseStatus();
        return;
    }
    if (request !== exerciseOpenRequest || user !== currentUser) return;
    if (!ex) {
        exerciseSubmissionLoading = false;
        showToast('Exercise not found. Refresh the exercise list.', 'error');
        updateExerciseStatus();
        return;
    }

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

    localStorage.setItem(STORAGE_KEYS.ACTIVE_EXERCISE, id);
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
    loadExerciseSubmissionState(ex);

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
    updateExerciseStatus();
}

function computeExpectedOutput(code) {
    const exercise = exerciseState.activeExercise;
    const generation = exerciseSubmissionGeneration;
    if (typeof Sk === 'undefined') {
        exerciseState.expectedOutputResolved = true;
        return;
    }
    let outText = '';
    // Same run budget as every other execution path: a malformed solution key
    // must not be able to freeze the tab while expected output is computed.
    Sk.configure(Object.assign({
        output: function (text) { outText += text; },
        read: function (x) {
            if (Sk.builtinFiles === undefined || Sk.builtinFiles["files"][x] === undefined) throw "File not found: '" + x + "'";
            return Sk.builtinFiles["files"][x];
        },
        inputfun: function () { return ''; },
        inputfunTakesPrompt: true,
        __future__: Sk.python3
    }, (typeof skulptExecLimitOptions === 'function') ? skulptExecLimitOptions(SKULPT_EXEC_LIMIT_MS) : { execLimit: 15000 }));
    Sk.misceval.asyncToPromise(function () {
        return Sk.importMainWithBody("<stdin>", false, code, true);
    }).then(() => {
        if (exercise !== exerciseState.activeExercise || generation !== exerciseSubmissionGeneration) return;
        exerciseState.expectedOutput = outText;
        exerciseState.expectedOutputResolved = true;
        updateExerciseStatus();
        console.log('[Completion] Expected output computed dynamically.');
    }).catch(err => {
        if (exercise !== exerciseState.activeExercise || generation !== exerciseSubmissionGeneration) return;
        exerciseState.expectedOutputResolved = true;
        updateExerciseStatus();
        console.warn('[Completion] Failed to compute expected output:', err);
    });
}

function updateExerciseStatus() {
    renderExerciseSubmissionState();
}

async function submitExercise() {
    return saveExerciseSubmission();
}

function changeExercise() {
    ++exerciseOpenRequest;
    ++exerciseSubmissionGeneration;
    exerciseSubmissionReceipt = null;
    exerciseSubmissionLoading = false;
    exerciseSubmissionMessage = '';
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_EXERCISE);
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
    exerciseState.resubmissionOf = null;
    updateExerciseStatus();

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

    // Exercise deletion is archive-only: the catalog is shared learning
    // content, so a removed exercise is flagged instead of erased.
    dbUpdate(exercisesRef, id, { status: 'archived', archivedAt: new Date().toISOString() })
        .then(() => showToast('Exercise archived.', 'info'))
        .catch(err => {
            console.error('[Offline Database] Archive exercise error:', err);
            showToast('Failed to archive exercise. Please refresh.', 'error');
            loadExercises();
        });
}


/* Persistent exercise actions. Correctness affects grading, never visibility. */
let exerciseSubmissionBusy = false;
let exerciseSubmissionReceipt = null;
let exerciseSubmissionLoading = false;
let exerciseSubmissionGeneration = 0;
let exerciseSubmissionMessage = '';

function exerciseSubmissionKey(ex, user) {
    return 'pseudopy_submission_' + JSON.stringify([user && (user._docId || user.id), ex && (ex._docId || ex.id)]);
}

function exerciseSubmissionAllowed(ex, receipt) {
    // Resubmission stays available unless an exercise explicitly forbids it.
    // Correctness decides the recorded score, never the right to submit again.
    return ex.allowResubmission !== false && ex.allowResubmissions !== false;
}

function exerciseSubmissionRestriction() {
    const ex = exerciseState.activeExercise;
    if (!currentUser) return 'Sign in to submit your answer.';
    if (exerciseSubmissionLoading) return 'Loading exercise and submission status…';
    if (!ex) return 'Open an exercise to submit an answer.';
    if (!(ex._docId || ex.id) || !(currentUser._docId || currentUser.id)) return 'Account or exercise information is missing. Reopen the exercise or sign in again.';
    if (ex.locked === true || ['locked', 'archived'].includes(ex.status)) return 'This exercise is locked by your instructor.';
    const rawDeadline = ex.dueDate || ex.deadline;
    const deadline = rawDeadline && (typeof rawDeadline.toDate === 'function' ? rawDeadline.toDate() : new Date(rawDeadline));
    if (deadline && Number.isFinite(deadline.getTime()) && deadline.getTime() < Date.now()) return 'Deadline passed on ' + deadline.toLocaleString() + '.';
    if (exerciseSubmissionReceipt && exerciseSubmissionReceipt.phase === 'saved' && !exerciseSubmissionAllowed(ex, exerciseSubmissionReceipt)) {
        return 'Submitted. Your instructor must request a revision before you can resubmit.';
    }
    return '';
}

function exerciseSubmissionButtons() {
    const buttons = [];
    [$id('btn-submit-exercise'), $id('exercise-submit-fallback')].forEach(button => { if (button) buttons.push(button); });
    // Any additional delegated entry point shares this state.
    if (typeof $qsa === 'function') $qsa('[data-action="submit"]').forEach(button => { if (buttons.indexOf(button) === -1) buttons.push(button); });
    return buttons;
}

function renderExerciseSubmissionState() {
    if (exerciseSubmissionReceipt && (!currentUser || exerciseSubmissionReceipt.record.studentAccountId !== (currentUser._docId || currentUser.id))) {
        exerciseSubmissionReceipt = null;
        exerciseSubmissionMessage = '';
    }
    const restriction = exerciseSubmissionRestriction();
    const receipt = exerciseSubmissionReceipt;
    const busy = exerciseSubmissionBusy;
    const label = busy ? 'Submitting…' : receipt ? (receipt.phase === 'saved' ? 'Submitted ✓ (Resubmit)' : 'Retry sync') : 'Submit';
    const reason = busy ? 'Saving your answer…' : [exerciseSubmissionMessage, restriction].filter(Boolean).join(' ') ||
        (receipt ? (receipt.phase === 'saved' ? 'Submitted ' : 'Saved on this device; cloud confirmation pending. ') + new Date(receipt.record.time).toLocaleString() :
            'Submit your attempt even if it has errors. Correctness affects your score, not submission.');
    setText('btn-submit-exercise-label', label);
    setText('exercise-submit-state', receipt ? 'Submission status' : 'Exercise submission');
    setText('exercise-submit-reason', reason);
    setText('active-ex-status', receipt ? 'Status: Submitted' : 'Status: In Progress');
    exerciseSubmissionButtons().forEach(button => {
        button.classList.remove('hidden');
        button.disabled = busy || !!restriction;
        button.setAttribute('aria-busy', String(busy));
        if (!button.id) button.textContent = label;
    });
}

async function loadExerciseSubmissionState(ex) {
    const generation = ++exerciseSubmissionGeneration;
    const user = currentUser;
    exerciseSubmissionReceipt = null;
    exerciseSubmissionMessage = '';
    exerciseSubmissionLoading = true;
    updateExerciseStatus();
    const key = exerciseSubmissionKey(ex, user);
    try {
        const saved = JSON.parse(localStorage.getItem(key) || 'null');
        if (saved && saved.record && saved.record.studentAccountId === (user && (user._docId || user.id))) exerciseSubmissionReceipt = saved;
    } catch (_) { /* The database remains the source of truth if storage is unavailable. */ }
    try {
        const records = await dbGetAll(activityRef);
        if (generation !== exerciseSubmissionGeneration || user !== currentUser || ex !== exerciseState.activeExercise) return;
        const accountId = user && (user._docId || user.id);
        const latest = records.filter(record => record.type !== 'translate_attempt' &&
            record.exerciseId === (ex._docId || ex.id) &&
            (record.studentAccountId === accountId || (!record.studentAccountId && record.studentId === accountId)))
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
        if (latest) {
            if (!exerciseSubmissionReceipt || latest._docId !== exerciseSubmissionReceipt.record._docId) {
                exerciseSubmissionReceipt = { phase: 'saved', record: latest };
            } else {
                exerciseSubmissionReceipt.record = latest;
            }
        }
    } catch (error) {
        console.warn('[Exercise] Using locally available submission state:', error);
    } finally {
        if (generation === exerciseSubmissionGeneration && user === currentUser && ex === exerciseState.activeExercise) {
            exerciseSubmissionLoading = false;
            const editor = $id('pseudocode-editor');
            if (editor && !editor.value && exerciseSubmissionReceipt) {
                editor.value = exerciseSubmissionReceipt.record.pseudocode || '';
                editor.dispatchEvent(new Event('input'));
            }
            updateExerciseStatus();
        }
    }
}

function persistExerciseReceipt(key, receipt) {
    try { localStorage.setItem(key, JSON.stringify(receipt)); } catch (_) { /* dbSet owns durable persistence. */ }
}

async function saveExerciseSubmission() {
    if (exerciseSubmissionBusy) return;
    const restriction = exerciseSubmissionRestriction();
    if (restriction) { showToast(restriction, 'info'); return; }
    const ex = exerciseState.activeExercise;
    const user = currentUser;
    const generation = exerciseSubmissionGeneration;
    const key = exerciseSubmissionKey(ex, user);
    const pseudo = getValue('pseudocode-editor');
    if (!pseudo.trim()) { showToast('Write your answer first.', 'info'); return; }
    let receipt = exerciseSubmissionReceipt;
    // A retry reuses the original snapshot and document ID, even if the editor changed.
    if (!receipt || receipt.phase === 'saved') {
        if (receipt && receipt.record.pseudocode === pseudo && !exerciseState.resubmissionOf) {
            showToast('This answer is already submitted. Edit it before resubmitting.', 'info');
            return;
        }
        let result;
        try { result = compilerEngine.compile(pseudo); }
        catch (error) { result = { valid: false, errors: [{ message: error.message, errorType: 'Compiler Error' }], python: '' }; }
        const errors = (result.errors || []).map(error => ({
            line: error.line || null, message: error.message || 'Compilation failed.',
            errorType: typeof classifyActivityError === 'function' ? classifyActivityError(error) : 'Compiler Error'
        }));
        const prompt = errors.length ? 'Your code has ' + errors.length + ' error' + (errors.length === 1 ? '' : 's') +
            (errors[0].line ? ' (line ' + errors[0].line + ')' : '') + '. Submit anyway?' : 'Submit this answer?';
        if (!confirm(prompt)) return;
        const now = new Date();
        const id = 'act_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : now.getTime() + '_' + Math.random().toString(36).slice(2));
        const completed = result.valid && result.python === getPythonCode('python-output') && exerciseState.isTranslated && exerciseState.isExecuted &&
            exerciseState.expectedOutputResolved && (!exerciseState.expectedOutput || exerciseState.outputMatched);
        const accountId = user._docId || user.id;
        receipt = { phase: 'retry', record: {
            _docId: id, id, type: 'exercise_submission', exerciseId: ex._docId || ex.id,
            revisionOf: exerciseState.resubmissionOf || (receipt && receipt.record._docId) || null,
            attemptNumber: receipt ? (Number(receipt.record.attemptNumber) || 1) + 1 : exerciseState.resubmissionOf ? 2 : 1,
            student: user.fullName || user.username || '', studentId: user.studentId || user.username || accountId,
            studentAccountId: accountId, studentNumber: user.studentNumber || user.studentId || '',
            section: user.section || '', instructorId: ex.instructorId || ex.createdBy || user.instructorId || 'u2',
            exercise: ex.title || ex.concept || 'Untitled Exercise', difficulty: ex.difficulty || 'moderate',
            status: completed ? 'Completed' : result.valid ? 'In Progress' : 'compile_error',
            reviewStatus: 'submitted', score: completed ? '100%' : null,
            time: now.toISOString(), timestamp: now.getTime(), pseudocode: pseudo, python_code: result.python || '',
            compileSuccess: !!result.valid, errors, errorType: errors.length ? errors[0].errorType : null,
            result: completed ? 'Success' : errors.length ? 'Compilation failed' : 'Awaiting review',
            processingTime: ((result.metrics && result.metrics.totalTime || 0) / 1000).toFixed(3) + 's',
            output: exerciseState.isExecuted ? ($id('console-output').textContent || '') : ''
        } };
    }
    exerciseSubmissionBusy = true;
    exerciseSubmissionReceipt = receipt;
    persistExerciseReceipt(key, receipt);
    updateExerciseStatus();
    let message;
    try {
        await dbSet(activityRef, receipt.record._docId, receipt.record);
        receipt.phase = 'saved';
        message = 'Submitted successfully at ' + new Date(receipt.record.time).toLocaleString() + '.';
    } catch (error) {
        receipt.phase = error.localOnly ? 'pending' : 'retry';
        message = /permission-denied|unauthenticated/.test(String(error.code))
            ? 'Firebase denied cloud submission. Your answer is saved on this device. Ask your instructor to check permissions, then retry sync.'
            : error.localOnly ? 'Saved on this device. Submission is queued and will sync when connected. Your instructor cannot see it yet.'
                : 'Unable to save submission. Your answer remains in the editor. Retry to save the same attempt.';
    } finally {
        persistExerciseReceipt(key, receipt);
        exerciseSubmissionBusy = false;
        if (currentUser === user && exerciseState.activeExercise === ex && generation === exerciseSubmissionGeneration) {
            exerciseSubmissionMessage = message;
            if (receipt.phase !== 'retry' && typeof cachedActivity !== 'undefined') {
                const index = cachedActivity.findIndex(record => record._docId === receipt.record._docId);
                if (index >= 0) cachedActivity[index] = receipt.record;
                else cachedActivity.unshift(receipt.record);
            }
            if (receipt.phase === 'saved') exerciseState.resubmissionOf = null;
            showToast(message, receipt.phase === 'saved' ? 'success' : 'info');
            updateExerciseStatus();
            if (receipt.phase === 'saved') loadStudentProgress().catch(error => console.warn('[Exercise] Progress refresh:', error));
        } else updateExerciseStatus();
    }
}

function initializeExerciseActions() {
    const page = $id('page-write-pseudocode');
    if (!page || page.dataset.exerciseActionsReady) return;
    page.dataset.exerciseActionsReady = 'true';
    page.addEventListener('click', event => {
        const button = event.target.closest('[data-action="submit"]');
        if (button && page.contains(button) && !button.disabled) submitExercise();
    });
    const updateViewport = () => {
        const viewport = window.visualViewport;
        document.documentElement.style.setProperty('--exercise-keyboard-inset', Math.max(0, window.innerHeight -
            (viewport ? viewport.height + viewport.offsetTop : window.innerHeight)) + 'px');
    };
    window.addEventListener('resize', updateViewport);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateViewport);
        window.visualViewport.addEventListener('scroll', updateViewport);
    }
    const bar = $id('exercise-action-bar');
    const trackBarHeight = () => {
        if (!bar) return;
        document.documentElement.style.setProperty('--exercise-actions-height', bar.getBoundingClientRect().height + 'px');
        // Backstop: only reveal the in-flow Submit when the action bar cannot render.
        const usable = bar.getClientRects().length > 0 && bar.getBoundingClientRect().height > 0;
        const fallback = $id('exercise-submit-fallback');
        if (fallback) fallback.classList.toggle('exercise-fallback-active', !usable);
    };
    if (typeof ResizeObserver !== 'undefined' && bar) new ResizeObserver(trackBarHeight).observe(bar);
    window.addEventListener('resize', trackBarHeight);
    window.addEventListener('orientationchange', trackBarHeight);
    window.addEventListener('pseudopy:sync-saved', event => {
        const receipt = exerciseSubmissionReceipt;
        if (!receipt || !event.detail || event.detail.ref !== activityRef || event.detail.docId !== receipt.record._docId) return;
        receipt.phase = 'saved';
        persistExerciseReceipt(exerciseSubmissionKey(exerciseState.activeExercise, currentUser), receipt);
        exerciseSubmissionMessage = 'Submission synced successfully.';
        updateExerciseStatus();
    });
    if (typeof onCloudAuthChanged === 'function') onCloudAuthChanged(() => updateExerciseStatus());
    updateViewport();
    trackBarHeight();
    updateExerciseStatus();
    if (window.__PSEUDOPY_DEBUG__) {
        const button = $id('btn-submit-exercise');
        if (!button) console.warn('[Exercise] Submit button missing from mounted view.');
        else if (typeof IntersectionObserver !== 'undefined') new IntersectionObserver(entries => {
            if (!page.classList.contains('hidden') && entries.some(entry => !entry.isIntersecting)) console.warn('[Exercise] Submit is outside the visible viewport.');
        }).observe(button);
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeExerciseActions);
else initializeExerciseActions();
/* ============================================================
   STUDENT DELETION — Manage Students
   Delegated row actions, typed-username confirmation, pending
   state, error mapping and the soft-delete undo window.

   The click handler is bound ONCE to the table body. Every
   loadStudents() re-render replaces the rows, so a handler bound
   to the rows themselves would be lost on every refresh; delegation
   from the stable container is what keeps the button working.
   ============================================================ */

let pendingDeleteStudentId = null;
let pendingDeleteStudentProfile = null;
let studentDeletionBusy = false;
let studentDeletionPending = false;
let studentDeletionUndoTimer = null;
let studentDeletionUndoDeadline = 0;

/** Resolve the stable container that survives every table re-render. */
function studentsTableBody() {
    return $id('students-table-body');
}

function closeStudentDeletionModal() {
    const modal = $id('delete-student-modal');
    if (modal) modal.classList.add('hidden');
    const input = $id('delete-student-confirm-input');
    if (input) input.value = '';
    setStudentDeletionError('');
    pendingDeleteStudentId = null;
    pendingDeleteStudentProfile = null;
}

/** Inline, non-blocking error text inside the modal. */
function setStudentDeletionError(message) {
    const el = $id('delete-student-error');
    if (!el) return;
    el.textContent = message || '';
    // The element starts with `display:none` in the markup, so the message is
    // announced without depending on a utility class that also sets display.
    el.style.display = message ? 'block' : 'none';
}

/**
 * Open the confirmation modal for one student.
 * `targetId` may be the profile document id or the app account id; both are
 * resolved against the cached profiles so the wrong row can never be targeted.
 */
async function openDeleteStudentModal(targetId) {
    if (studentDeletionBusy) return;
    const id = String(targetId || '');
    if (!id) {
        showToast('That student row is missing its account id. Refresh and try again.', 'error');
        return;
    }
    const users = (typeof cachedUsers !== 'undefined' && cachedUsers.length) ? cachedUsers : await refreshUsers();
    const profile = (users || []).find(u => String(u._docId || u.id) === id || String(u.id) === id) || null;

    const verdict = typeof authorizeStudentDeletion === 'function'
        ? authorizeStudentDeletion({
            callerRole: currentUser && currentUser.role,
            callerDocId: (currentUser && (currentUser._docId || currentUser.id)) || '',
            target: profile,
            targetDocId: (profile && (profile._docId || profile.id)) || id
        })
        : { ok: false, code: 'not-found', message: 'Student not found. Refresh the list and try again.' };

    if (!verdict.ok) {
        showToast(verdict.message, 'error');
        console.warn('[Deletion] modal refused:', verdict.code);
        return;
    }

    pendingDeleteStudentId = profile._docId || profile.id;
    pendingDeleteStudentProfile = profile;

    setText('delete-student-name', profile.fullName || 'this student');
    setText('delete-student-username', '@' + (profile.username || '—'));
    setText('delete-student-number', (typeof readStudentNumber === 'function' ? readStudentNumber(profile) : profile.studentNumber) || '—');

    const modal = $id('delete-student-modal');
    if (modal) modal.classList.remove('hidden');
    setStudentDeletionError('');
    // The undo bar must name this exact profile before the window starts.
    pendingUndoDocId = pendingDeleteStudentId;
    await renderStudentDeletionImpact(profile);
}

/** Show how many related records a permanent deletion would remove. */
async function renderStudentDeletionImpact(profile) {
    const el = $id('delete-student-related');
    if (!el) return;
    if (typeof collectStudentRelatedRecords !== 'function') return;
    el.textContent = 'Checking related records…';
    try {
        const summary = await collectStudentRelatedRecords(profile);
        const parts = [];
        if (summary.ownedTotal > 0) {
            parts.push(`${summary.ownedTotal} record${summary.ownedTotal === 1 ? '' : 's'} owned by this student will also be erased.`);
        } else {
            parts.push('No related submissions or requests were found for this student.');
        }
        if (summary.ambiguousTotal > 0) {
            parts.push(`${summary.ambiguousTotal} record${summary.ambiguousTotal === 1 ? '' : 's'} match this student only by name or number and will be kept for manual review.`);
        }
        el.textContent = parts.join(' ');
    } catch (e) {
        console.info('[Deletion] impact summary unavailable:', e && e.message);
        el.textContent = 'Related records could not be counted. Deletion will still verify ownership on the server.';
    }
}

/** Disable the confirm button and show a spinner for the duration of the call. */
function setStudentDeletionBusy(busy, pending) {
    studentDeletionBusy = !!busy;
    const btn = $id('btn-confirm-delete-student');
    if (!btn) return;
    btn.disabled = !!busy;
    if (typeof btn.setAttribute === 'function') btn.setAttribute('aria-busy', busy ? 'true' : 'false');
    if (btn.classList && typeof btn.classList.toggle === 'function') btn.classList.toggle('is-loading-text', !!busy);
    const label = $id('delete-student-confirm-label');
    if (label) label.textContent = busy ? 'Deleting…' : 'Delete student';
    if (!busy) studentDeletionPending = false;
}

/** Run the deletion, then refresh every list the student appeared in. */
async function executeDeleteStudent() {
    if (studentDeletionBusy || studentDeletionPending) return;
    if (!pendingDeleteStudentId || !pendingDeleteStudentProfile) {
        closeStudentDeletionModal();
        return;
    }
    const typed = getValue('delete-student-confirm-input').trim();
    const profile = pendingDeleteStudentProfile;
    const docId = pendingDeleteStudentId;

    if (!typed) {
        setStudentDeletionError('Type the username to confirm.');
        return;
    }
    if (typed !== String(profile.username || '')) {
        setStudentDeletionError('That username does not match. Type it exactly as shown.');
        return;
    }

    studentDeletionPending = true;
    setStudentDeletionBusy(true);
    setStudentDeletionError('');

    let result;
    try {
        result = await deleteStudentProfile(docId, { confirmUsername: typed });
    } catch (err) {
        console.error('[Deletion] unexpected failure:', err);
        const described = describeDeletionError(err);
        result = { ok: false, code: described.code, message: described.message };
    }

    setStudentDeletionBusy(false);

    if (!result || result.ok !== true) {
        const message = (result && result.message) || 'The student could not be deleted.';
        console.warn('[Deletion] failed', { docId, code: result && result.code });
        setStudentDeletionError(message);
        showToast(message, 'error');
        return;
    }

    animateStudentRowRemoval(docId);
    closeStudentDeletionModal();

    if (result.mode === 'soft') {
        showToast(`${profile.fullName} was deactivated. The sign-in account was not revoked.`, 'info');
        openStudentDeletionUndo(docId, profile);
    } else {
        showToast(`${profile.fullName} and all related records were permanently deleted.`, 'success');
        clearStudentDeletionUndo();
    }

    await refreshAfterStudentDeletion();
}

/** Fade the row out before the table is re-rendered. */
function animateStudentRowRemoval(docId) {
    const tbody = studentsTableBody();
    if (!tbody || !tbody.querySelector) return;
    const row = tbody.querySelector('tr[data-doc-id="' + String(docId).replace(/"/g, '\\"') + '"]');
    if (!row) return;
    row.classList.add('row-removing');
    if (typeof refreshIcons === 'function') refreshIcons(row);
}

/** Refresh the student list plus the analytics/instructor aggregates. */
async function refreshAfterStudentDeletion() {
    try {
        if (currentUser && currentUser.role === 'admin' && typeof loadUsers === 'function') await loadUsers();
        if (typeof loadStudents === 'function') await loadStudents();
    } catch (e) {
        console.warn('[Deletion] list refresh failed:', e && e.message);
    }
    try {
        cachedActivity = await dbGetAll(activityRef);
    } catch (e) {
        console.info('[Deletion] activity refresh skipped:', e && e.message);
    }
    try {
        if (currentUser && currentUser.role === 'admin' && typeof loadAdminAnalytics === 'function') await loadAdminAnalytics();
        else if (typeof loadAnalytics === 'function' && currentUser && currentUser.role === 'instructor') await loadAnalytics();
    } catch (e) {
        console.info('[Deletion] analytics refresh skipped:', e && e.message);
    }
}

// ── Undo window (soft delete only) ───────────────────────────────

function openStudentDeletionUndo(docId, profile) {
    const bar = $id('student-deletion-undo');
    if (!bar) return;
    pendingUndoDocId = docId;
    setText('student-deletion-undo-message', `${profile.fullName} · @${profile.username} is deactivated.`);
    bar.classList.remove('hidden');
    studentDeletionUndoDeadline = Date.now() + STUDENT_DELETION.UNDO_WINDOW_MS;
    if (studentDeletionUndoTimer) clearInterval(studentDeletionUndoTimer);
    const tick = () => {
        const left = Math.max(0, studentDeletionUndoDeadline - Date.now());
        const seconds = Math.ceil(left / 1000);
        setText('student-deletion-undo-countdown', `${seconds}s`);
        if (left <= 0) clearStudentDeletionUndo();
    };
    tick();
    studentDeletionUndoTimer = setInterval(tick, 250);
}

function clearStudentDeletionUndo() {
    if (studentDeletionUndoTimer) {
        clearInterval(studentDeletionUndoTimer);
        studentDeletionUndoTimer = null;
    }
    const bar = $id('student-deletion-undo');
    if (bar) bar.classList.add('hidden');
}

async function undoStudentDeletionFromUi() {
    if (!pendingUndoDocId) return;
    const docId = pendingUndoDocId;
    clearStudentDeletionUndo();
    pendingUndoDocId = null;
    const result = await undoStudentDeletion(docId);
    showToast(result.message, result.ok ? 'success' : 'error');
    if (result.ok) await refreshAfterStudentDeletion();
}

let pendingUndoDocId = null;

// ── Wiring ────────────────────────────────────────────────────────

function initStudentDeletionUi() {
    const tbody = studentsTableBody();
    if (!tbody || tbody.dataset.deletionBound === 'true') return;
    tbody.dataset.deletionBound = 'true';

    tbody.addEventListener('click', (event) => {
        const trigger = event.target.closest ? event.target.closest('[data-action="delete-student"]') : null;
        if (!trigger || !tbody.contains(trigger)) return;
        event.preventDefault();
        openDeleteStudentModal(trigger.getAttribute('data-id'));
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        const modal = $id('delete-student-modal');
        if (modal && !modal.classList.contains('hidden') && !studentDeletionBusy) closeStudentDeletionModal();
    });

    const undoBtn = $id('btn-undo-delete-student');
    if (undoBtn && undoBtn.dataset.bound !== 'true') {
        undoBtn.dataset.bound = 'true';
        undoBtn.addEventListener('click', () => { undoStudentDeletionFromUi(); });
    }
}

/**
 * Legacy entry point kept so any older inline handler still opens the modal
 * instead of deleting immediately.
 */
function deleteUser(id) {
    return openDeleteStudentModal(id);
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initStudentDeletionUi);
    } else {
        initStudentDeletionUi();
    }
}/* ============================================================
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
    // UX Rule 1: skeleton rows that mirror the final table layout.
    showTableSkeleton('users-table-body', 7, 4, 'Loading instructors…');

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
        clearTableSkeleton('users-table-body');
    } catch (err) {
        console.error('[App] Failed to load instructors:', err);
        clearTableSkeleton('users-table-body');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center;padding:3rem;color:var(--danger)">
                        <div style="font-size:2rem;margin-bottom:0.5rem">{{ui:TriangleAlert}}</div>
                        <div style="font-weight:600;font-size:1rem;margin-bottom:0.4rem">Unable to load instructors. Please try again.</div>
                        <div style="font-size:0.83rem;color:var(--text-muted);margin-bottom:1rem">${typeof describeUserFacingError === 'function' ? describeUserFacingError(err) : 'Check your connection and try again.'}</div>
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

    // UX Rule 1: skeleton rows while the device list resolves.
    showTableSkeleton('device-modal-table-body', 5, 3, 'Loading devices…');

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
    if (typeof requireOnline === 'function') {
        const gate = requireOnline();
        if (!gate.ok) { showToast(gate.message, 'error'); return; }
    }
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
    if (typeof requireOnline === 'function') {
        const gate = requireOnline();
        if (!gate.ok) { showToast(gate.message, 'error'); return; }
    }
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
        await dbRemoveLocalRecord(devicesRef, deviceDocId);
        showToast('Device record removed.', 'info');
        await renderDeviceModalTable();
        await loadUsers();
    });
}

let _approveAllDevicesBusy = false;

async function approveAllPendingDevices() {
    if (_approveAllDevicesBusy) return;
    if (!activeDeviceInstructorId) return;
    if (typeof requireOnline === 'function') {
        const gate = requireOnline();
        if (!gate.ok) { showToast(gate.message, 'error'); return; }
    }
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

    if (typeof requireOnline === 'function') {
        const gate = requireOnline();
        if (!gate.ok) { _showInstAlert(gate.message); return; }
    }

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
            const salt = generateSalt();
            const passwordHash = await hashPassword(password, salt);
            await dbSet(usersRef, newId, {
                _docId: newId,
                id: newId,
                fullName,
                username,
                email,
                passwordHash,
                passwordSalt: salt,
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
    const students = (cachedUsers.length ? cachedUsers : await refreshUsers()).filter(u => u.role === 'student' && !isDeletedProfile(u) && u.instructorId === id);
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
    if (typeof requireOnline === 'function') {
        const gate = requireOnline();
        if (!gate.ok) { showToast(gate.message, 'error'); return; }
    }
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
    if (typeof requireOnline === 'function') {
        const gate = requireOnline();
        if (!gate.ok) {
            showToast(gate.message, 'error');
            closeArchiveInstructorModal();
            return;
        }
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
    if (typeof requireOnline === 'function') {
        const gate = requireOnline();
        if (!gate.ok) {
            showToast(gate.message, 'error');
            closeRestoreInstructorModal();
            return;
        }
    }
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
    // Soft-deleted accounts stay in Firestore for the undo window, so they
    // must be filtered out here or they keep showing up as live students.
    const students = users.filter(u => u.role === 'student' && !isDeletedProfile(u) && (
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
    <tr data-doc-id="${u._docId || u.id}">
      <td><div class="user-cell"><div class="avatar-sm">{{ui:UserRound}}</div><div><div style="font-weight:600;color:var(--text-primary)">${u.fullName}</div><div style="font-size:0.75rem;color:var(--text-muted)">@${u.username}</div></div></div></td>
      <td>${readStudentNumber(u)}</td>
      <td><span class="badge ${u.status === 'active' ? 'badge-active' : 'badge-inactive'}">${u.status}</span></td>
      <td><div style="display:flex;gap:0.5rem">
        <button class="btn btn-ghost btn-sm" onclick="editUser('${u.id}')" title="Edit" aria-label="Edit user">{{ui:Pencil}}</button>
<button class="btn btn-ghost btn-sm" onclick="toggleUserStatus('${u.id}')" title="${u.status === 'active' ? 'Deactivate' : 'Activate'}" aria-label="${u.status === 'active' ? 'Deactivate user' : 'Activate user'}">${u.status === 'active' ? '{{ui:LockKeyhole}}' : '{{ui:LockKeyholeOpen}}'}</button>
      <button class="btn btn-ghost btn-sm" data-action="delete-student" data-id="${u._docId || u.id}" title="Delete" aria-label="Delete ${u.fullName}">{{ui:Trash2}}</button>
      </div></td>
    </tr>`).join('');
}

// resetStudentPassword() was removed for security.
// Instructors must use the Password Recovery workflow instead:
// navigateTo('password-recovery') → Approve Request → Student resets own password.


async function toggleUserStatus(id) {
    if (typeof requireOnline === 'function') {
        const gate = requireOnline();
        if (!gate.ok) { showToast(gate.message, 'error'); return; }
    }
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
            setValue('user-password', '');
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
        // One key per opened form. Retrying a failed submit reuses it; opening
        // the modal again mints a new one so two different students never share
        // an idempotency key.
        userCreateRequestId = _newUserCreateRequestId();
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
    setSaveUserBusy(false);
    _bindUserModalEnterSubmit(modal);
}

/**
 * The modal is a <div>, not a <form>, so pressing Enter in any field did
 * nothing at all. Bind it once per modal element so keyboard submission
 * matches the visible Save button.
 */
function _bindUserModalEnterSubmit(modal) {
    if (!modal || modal.__pseudopyEnterBound) return;
    modal.__pseudopyEnterBound = true;
    modal.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter') return;
        // A multi-line-capable control owns its own Enter.
        const target = event.target;
        if (target && target.tagName === 'TEXTAREA') return;
        event.preventDefault();
        saveUser();
    });
}

function closeUserModal() {
    const modal = $id('user-modal');
    if (modal) modal.classList.add('hidden');
    editingUserId = null;
    userCreateRequestId = null;
    // Clear the fields, including the password. Leaving them in the DOM kept a
    // completed submission live on the page for the next open() to race.
    ['user-fullname', 'user-username', 'user-email', 'user-password'].forEach(function (field) {
        setValue(field, '');
    });
    setSaveUserBusy(false);
}

// ── Add/Edit user: in-flight guard + idempotent submission ──
//
// The reported duplicate (one person holding 2300003 and 2300004) came from
// three compounding gaps:
//   1. saveUser had no in-flight guard, so a double click ran it twice.
//   2. The duplicate check read cachedUsers, which dbSet never updates, so the
//      second run saw a stale list and passed the check.
//   3. The document id was 'u' + Date.now(), recomputed per invocation, so a
//      retry could never converge on the record the first run already wrote.
// Fixing the number allocator alone is not enough: it makes the second run
// reuse 2300003, but it would still overwrite a different document.
let saveUserBusy = false;
// Minted when the modal opens, so every retry of the SAME submission shares it
// while a genuinely new account gets a fresh key.
let userCreateRequestId = null;

function _newUserCreateRequestId() {
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
        return 'req_' + crypto.randomUUID();
    }
    return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
}

function setSaveUserBusy(busy) {
    saveUserBusy = !!busy;
    const btn = $id('user-save-btn');
    if (!btn) return;
    btn.disabled = saveUserBusy;
    btn.setAttribute('aria-busy', saveUserBusy ? 'true' : 'false');
}

/** Normalized username key: uniqueness must not depend on letter case. */
function normalizedUsernameKey(value) {
    return String(value || '').trim().toLowerCase();
}

async function saveUser() {
    if (saveUserBusy) return;
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

    if (typeof requireOnline === 'function') {
        const gate = requireOnline();
        if (!gate.ok) { showToast(gate.message, 'error'); return; }
    }

    const requestId = userCreateRequestId || _newUserCreateRequestId();
    userCreateRequestId = requestId;
    setSaveUserBusy(true);

    try {
        const users = cachedUsers.length ? cachedUsers : await refreshUsers();
        const usernameKey = normalizedUsernameKey(username);
        const emailKey = String(email).toLowerCase();

        const dup = users.find(u =>
            u.id !== editingUserId && normalizedUsernameKey(u.username) === usernameKey);
        if (dup) {
            showToast('Username already exists!', 'error');
            return;
        }
        // Email was previously unchecked, so one person could be registered
        // twice under the same address.
        const dupEmail = users.find(u =>
            u.id !== editingUserId && String(u.email || '').toLowerCase() === emailKey);
        if (dupEmail) {
            showToast('That email is already used by another account.', 'error');
            return;
        }

        if (editingUserId) {
            const user = users.find(u => u.id === editingUserId);
            if (user) {
                const updateData = { fullName, username, email, role };
                await dbUpdate(usersRef, user._docId, updateData);
            }
            showToast('User updated successfully!', 'success');
        } else {
            // Idempotent replay: if this submission already landed, return the
            // existing record instead of allocating another number and writing
            // a second profile.
            const already = users.find(u => u.creationRequestId === requestId);
            if (already) {
                showToast(already.studentNumber
                    ? `${already.fullName} · Student No. ${already.studentNumber} · @${already.username} was already created.`
                    : 'This account was already created.', 'info');
                closeUserModal();
                if (currentUser.role === 'admin') {
                    await loadUsers();
                } else if (currentUser.role === 'instructor') {
                    await loadStudents();
                }
                return;
            }

            // Deterministic from the request id, NOT 'u' + Date.now().
//
// The cached-user replay check above is best-effort: it only sees writes that
// already landed in this tab's cache. The reported duplicate happened because
// the server accepted the write while the client was still deciding it had
// failed, so on retry the cache was stale, the replay check missed, and a
// second profile was written for the same person. Deriving the document id
// from the request id means a retry addresses the SAME document: the write
// becomes an overwrite and a second profile is impossible regardless of what
// the cache happens to contain.
const newId = 'u' + requestId.replace(/^req_/, '');
            const salt = generateSalt();
            const userHash = await hashPassword(password, salt);

            // Claim the username before the profile write. The cached
            // uniqueness check above cannot see another tab's write; this
            // transaction can, because the claim document's path is known from
            // the username alone.
            let claim = null;
            if (typeof claimUsername === 'function') {
                try {
                    claim = await claimUsername(username, newId);
                } catch (claimErr) {
                    showToast((claimErr && claimErr.message) || 'That username is unavailable.', 'error');
                    return;
                }
            }

            const userData = {
                id: newId,
                fullName,
                username,
                email,
                passwordHash: userHash,
                passwordSalt: salt,
                role,
                status: 'active',
                createdBy: currentUser.id,
                creationRequestId: requestId
            };
            if (currentUser.role === 'instructor') {
                userData.instructorId = currentUser.id;
            }
            try {
                if (role === 'student') {
                    // Keyed by requestId: a retry of this submission reuses the
                    // number it already owns rather than consuming a new one.
                    userData.studentNumber = await allocateStudentNumber(requestId);
                }
                await dbSet(usersRef, newId, userData);
            } catch (writeErr) {
                console.error('[User] Create failed after claiming username:', writeErr);
                // The profile never landed, so the claim must not survive it. A
                // username reserved for an account that does not exist is
                // unusable, and the instructor would have no way to recover it.
                if (claim && claim.claimed && typeof releaseUsernameClaim === 'function') {
                    await releaseUsernameClaim(username, newId);
                }
                showToast((writeErr && writeErr.message) || 'Failed to save user.', 'error');
                return;
            }
            showToast(role === 'student' && userData.studentNumber
                ? `${userData.fullName} · Student No. ${userData.studentNumber} · @${userData.username} created successfully!`
                : 'User created successfully!', 'success');
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
    } finally {
        setSaveUserBusy(false);
    }
}

function editUser(id) { openUserModal(id); }

// Deletion lives in src/app/student-deletion-ui.js. It is delegated, confirmed
// by typed username and routed through deleteStudentProfile(), which refuses to
// report success for a deletion it could not confirm.


/* ============================================================
   STUDENT NUMBER MIGRATION (Admin only)
   Assigns 230-series student numbers to student accounts that
   still carry legacy 'studentId' (2024-xxx) placeholders or none.
   The preview is side-effect-free; only the confirm step writes
   user records, and it touches ONLY the document's
   'studentNumber' field.
   ============================================================ */

let _snMigrationRunning = false;

async function obtainAllStudentsCached() {
    let users = cachedUsers;
    if (!users || users.length === 0) {
        users = await refreshUsers();
    }
    return users;
}

/** Highest ''230'' sequence currently in use by ANY user document. */
function _max230Sequence(users) {
    let max = 0;
    (Array.isArray(users) ? users : []).forEach((u) => {
        const sn = u && u.studentNumber;
        if (isValidStudentNumber(sn)) {
            const n = parseInt(sn.slice(3), 10);
            if (n > max) max = n;
        }
    });
    return max;
}

/**
 * Preview migration plan. Never mutates the counter or users.
 * Returns a list of { user, current, proposed } sorted by
 * current legacy id then account id, plus the base sequence used.
 */
async function buildStudentNumberMigrationPlan() {
    const users = await obtainAllStudentsCached();
    const targets = (users || []).filter(
        (u) => u && u.role === 'student' && !isDeletedProfile(u) && !isValidStudentNumber(u.studentNumber)
    );
    targets.sort((a, b) => String(a.id || a._docId || '').localeCompare(String(b.id || b._docId || '')));

    let baseSeq = _max230Sequence(users);
    const rows = targets.map((u) => {
        baseSeq += 1;
        return {
            user: u,
            current: readStudentNumber(u),
            proposed: formatStudentNumber(baseSeq)
        };
    });

    // Duplicate detection within the proposed plan + against live users.
    let duplicateConflict = null;
    const proposedSeen = new Set();
    for (const row of rows) {
        if (proposedSeen.has(row.proposed) || (users || []).some(
            (u) => u && u.studentNumber === row.proposed && u !== row.user)
        ) {
            duplicateConflict = row.proposed;
            break;
        }
        proposedSeen.add(row.proposed);
    }

    return { rows, duplicateConflict };
}

/**
 * Render the preview modal (side-effect-free) with an admin guard.
 */
async function openStudentNumberMigration() {
    if (!currentUser || currentUser.role !== 'admin') {
        showToast('Only administrators can manage student numbers.', 'error');
        return;
    }
    const modal = $id('sn-migration-modal');
    if (!modal) return;

    $id('sn-migration-body').innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--text-muted)">Preparing preview...</td></tr>';
    $id('sn-migration-total').textContent = '…';
    modal.classList.remove('hidden');

    try {
        const { rows, duplicateConflict } = await buildStudentNumberMigrationPlan();
        const tbody = $id('sn-migration-body');
        if (duplicateConflict) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--danger)">Duplicate proposed number detected (${duplicateConflict}). Aborting — contact your developer.</td></tr>`;
            $id('sn-migration-total').textContent = 'ERROR';
            const runBtn = $id('sn-migration-run-btn');
            if (runBtn) runBtn.disabled = true;
            return;
        }
        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--text-muted)">All student accounts already have 230-series numbers. Nothing to migrate.</td></tr>';
            $id('sn-migration-total').textContent = '0';
            const runBtn = $id('sn-migration-run-btn');
            if (runBtn) runBtn.disabled = true;
            return;
        }
        tbody.innerHTML = rows.map((row) => `
            <tr>
              <td>
                <div class="user-cell">
                  <div class="avatar-sm">{{ui:UserRound}}</div>
                  <div>
                    <div style="font-weight:600;color:var(--text-primary)">${row.user.fullName || ''}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted);font-family:monospace">@${row.user.username || ''}</div>
                  </div>
                </div>
              </td>
              <td style="font-family:monospace;font-size:0.85rem;color:var(--text-muted)">${row.current}</td>
              <td style="font-family:monospace;font-size:0.85rem;color:var(--text-accent)">${row.proposed}</td>
              <td><span class="badge badge-active">READY</span></td>
            </tr>`).join('');
        $id('sn-migration-total').textContent = String(rows.length) + ' student(s)';
        const runBtn = $id('sn-migration-run-btn');
        if (runBtn) {
            runBtn.disabled = false;
            runBtn.dataset.count = String(rows.length);
        }
    } catch (err) {
        console.error('[StudentMigration] Preview error:', err);
        $id('sn-migration-body').innerHTML = `<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--danger)">${err && err.message ? err.message : 'Failed to prepare migration preview.'}</td></tr>`;
        $id('sn-migration-total').textContent = 'ERROR';
    }
}

function closeStudentNumberMigration() {
    const modal = $id('sn-migration-modal');
    if (modal) modal.classList.add('hidden');
}

/**
 * Confirmed migration: allocate + patch 'studentNumber' only.
 * Re-snapshots users so we never double-write an account that was
 * allocated in the meantime.
 */
async function runStudentNumberMigration() {
    if (!currentUser || currentUser.role !== 'admin') {
        showToast('Only administrators can manage student numbers.', 'error');
        return;
    }
    if (_snMigrationRunning) return;
    const runBtn = $id('sn-migration-run-btn');
    if (runBtn) {
        runBtn.disabled = true;
        runBtn.innerHTML = '{{ui:Loader}} Migrating…';
    }
    _snMigrationRunning = true;

    try {
        let users = await refreshUsers();
        let targets = (users || []).filter(
            (u) => u && u.role === 'student' && !isDeletedProfile(u) && !isValidStudentNumber(u.studentNumber)
        );
        targets.sort((a, b) => String(a.id || a._docId || '').localeCompare(String(b.id || b._docId || '')));

        if (targets.length === 0) {
            showToast('All student accounts already have 230-series numbers.', 'info');
            closeStudentNumberMigration();
            return;
        }

        let assigned = 0;
        let failed = 0;
        for (const u of targets) {
            try {
                const number = await allocateStudentNumber();
                await dbUpdate(usersRef, u._docId || u.id, { studentNumber: number });
                assigned++;
            } catch (rowErr) {
                failed++;
                console.error(`[StudentMigration] Failed for ${u.username}:`, rowErr);
            }
        }

        await refreshUsers();
        let toastTxt;
        if (failed === 0) {
            toastTxt = `Assigned 230-series numbers to ${assigned} student(s).`;
        } else if (assigned === 0) {
            toastTxt = `Migration failed for all ${failed} student(s).`;
        } else {
            toastTxt = `Assigned numbers to ${assigned} student(s); ${failed} failed.`;
        }
        showToast(toastTxt, failed === 0 ? 'success' : 'warning');
        closeStudentNumberMigration();
    } catch (err) {
        console.error('[StudentMigration] Migration error:', err);
        showToast(err && err.message ? err.message : 'Migration failed.', 'error');
        closeStudentNumberMigration();
    } finally {
        _snMigrationRunning = false;
        if (runBtn) {
            runBtn.disabled = false;
            runBtn.innerHTML = '{{ui:CheckCheck}} Migrate Now';
        }
    }
}/* ============================================================
   ANALYTICS AGGREGATION — pure data builders
   No DOM access. Suite-testable in Node and shared by the
   browser chart renderer (analytics-charts.js).
   ============================================================ */

const AN_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const AN_DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const KNOWN_ERROR_TYPES = ['Syntax Error', 'Type Error', 'Logic Error', 'Runtime Error', 'Missing Terminator', 'Indentation Error', 'Undefined Variable', 'Compiler Error'];

function classifyActivityError(error) {
    const explicit = String(error.errorType || error.type || '').trim();
    if (explicit === 'Missing END') return 'Missing Terminator';
    const detail = String(error.code || '') + ' ' + String(error.message || '');
    if (/UNDECLARED_VARIABLE|undefined variable|undeclared variable/i.test(detail)) return 'Undefined Variable';
    if (/\bmissing\b.*\bEND\b|\bexpected\b.*\bEND\b|unclosed|unterminated.*block/i.test(detail)) return 'Missing Terminator';
    if (explicit) return KNOWN_ERROR_TYPES.includes(explicit) ? explicit : 'Other';
    if (/TYPE_MISMATCH/i.test(detail)) return 'Type Error';
    return 'Syntax Error';
}

function realAnalyticsRecords(records) {
    const seen = new Set();
    return (records || []).filter(record => {
        if (!record) return false;
        const id = record._docId || record.id;
        // Reserved IDs used by getInitialSeedActivity, including older cloud seeds.
        if (record.isDemo === true || /^act_sp_(?:\d+|em\d+|md\d+)$/.test(id || '')) return false;
        if (id && seen.has(id)) return false;
        if (id) seen.add(id);
        return true;
    });
}

function isSubmissionActivity(record) {
    return !record.type || record.type === 'submission';
}

function recordDate(record) {
    const raw = record && (record.timestamp || record.time);
    if (raw == null || raw === '') return null;
    const d = typeof raw.toDate === 'function' ? raw.toDate()
        : typeof raw.seconds === 'number' ? new Date(raw.seconds * 1000)
        : new Date(raw);
    return isNaN(d.getTime()) ? null : d;
}

function maxRecordDate(records) {
    let max = null;
    (records || []).forEach(record => {
        const d = recordDate(record);
        if (d && (!max || d.getTime() > max.getTime())) max = d;
    });
    return max;
}

function dayKey(date) {
    if (!date || isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function scoreAsNumber(record) {
    const raw = String(record && record.score != null ? record.score : '').replace(/\s+/g, '');
    if (raw === '' || raw === '—' || raw === '-' || raw === 'Pending') return null;
    const value = parseFloat(raw);
    if (isNaN(value)) return null;
    return Math.max(0, Math.min(100, Math.round(value)));
}

function monthWeekForDay(dayNum) {
    if (dayNum <= 3) return 1;
    if (dayNum <= 10) return 2;
    if (dayNum <= 17) return 3;
    if (dayNum <= 24) return 4;
    return 5;
}

const WEEK_RANGES = [
    { w: 1, start: 1, end: 3 },
    { w: 2, start: 4, end: 10 },
    { w: 3, start: 11, end: 17 },
    { w: 4, start: 18, end: 24 },
    { w: 5, start: 25, end: 31 }
];

/**
 * Builds the per-period submission counts backing the Submission Activity
 * area chart. Mirrors the analytics filter semantics:
 *   - month view (or month selected without a week) → 5 weekly buckets
 *   - week selected               → 7 daily buckets for that week
 *   - date selected               → 7 daily buckets for that date's week
 *   - otherwise                   → last 7 days ending at the newest record
 * Returns an array of { label, sub, dateKey, count, active }.
 */
function buildSubmissionSeries(records, filters = {}, opts = {}) {
    const monthVal = filters.monthVal ?? '';
    const weekVal = filters.weekVal || '';
    const dateVal = filters.dateVal || '';
    const viewMode = filters.viewMode || 'day';
    const counts = countByDayKey(records);

    const latest = opts.latestDate && !isNaN(new Date(opts.latestDate).getTime())
        ? new Date(opts.latestDate)
        : maxRecordDate(records);
    const fallbackYear = new Date().getFullYear();
    let year = latest ? latest.getFullYear() : fallbackYear;

    // Mirror the legacy rule: month buckets unless the user narrowed to a week.
    const useMonthly = viewMode === 'month' || (monthVal !== '' && !weekVal);

    if (useMonthly) {
        const mIdx = monthVal !== '' ? parseInt(monthVal, 10) : (latest ? latest.getMonth() : new Date().getMonth());
        const mName = AN_MONTHS_SHORT[mIdx] || 'Jan';
        return WEEK_RANGES.map(r => {
            let count = 0;
            for (let day = r.start; day <= r.end; day++) {
                const key = `${year}-${String(mIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                count += counts[key] || 0;
            }
            return {
                label: 'Wk ' + r.w,
                sub: `${mName} ${r.start}–${r.end}`,
                dateKey: null,
                weekRange: r,
                count,
                active: weekVal === String(r.w)
            };
        });
    }

    let startDay = 4;
    let mIdx = latest ? latest.getMonth() : new Date().getMonth();
    const dayNames = AN_DAYS_SHORT;
    const monNames = AN_MONTHS_SHORT;

    if (weekVal) {
        const range = WEEK_RANGES.find(r => String(r.w) === weekVal);
        if (range) startDay = range.start;
        if (monthVal !== '') mIdx = parseInt(monthVal, 10);
    } else if (dateVal) {
        const dateRef = new Date(dateVal + 'T00:00:00');
        if (!isNaN(dateRef.getTime())) {
            const week = monthWeekForDay(dateRef.getDate());
            const range = WEEK_RANGES.find(r => r.w === week);
            startDay = range ? range.start : 1;
            mIdx = dateRef.getMonth();
            year = dateRef.getFullYear();
        }
    } else if (latest) {
        // Last 7 contiguous days ending at the newest record.
        const buckets = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(latest.getTime());
            d.setDate(latest.getDate() - i);
            const key = dayKey(d);
            buckets.push({
                label: dayNames[d.getDay()],
                sub: `${monNames[d.getMonth()]} ${d.getDate()}`,
                dateKey: key,
                count: counts[key] || 0,
                active: false
            });
        }
        return buckets;
    }

    // Daily buckets for a selected week (explicit or date-derived).
    const buckets = [];
    const lastDay = new Date(year, mIdx + 1, 0).getDate();
    const rangeEnd = startDay === 1 ? 3 : Math.min(startDay + 6, lastDay);
    for (let i = 0; startDay + i <= rangeEnd; i++) {
        const day = startDay + i;
        const d = new Date(year, mIdx, day);
        if (isNaN(d.getTime())) continue;
        const key = dayKey(d);
        buckets.push({
            label: dayNames[d.getDay()],
            sub: `${monNames[mIdx]} ${day}`,
            dateKey: key,
            count: counts[key] || 0,
            active: dateVal === key
        });
    }
    return buckets;
}

function countByDayKey(records) {
    const counts = {};
    (records || []).forEach(record => {
        const d = recordDate(record);
        if (!d) return;
        const key = dayKey(d);
        counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
}

/**
 * Builds the Student Improvement Trajectory series: one line per top
 * student (by volume) plus a dashed class-average line. Points carry
 * { x: attempt index, y: score|null, date, name }.
 */
function buildTrajectorySeries(records, opts = {}) {
    const studentKey = opts.studentKey || 'student';
    const maxStudents = opts.maxStudents || 6;
    const maxSessions = opts.maxSessions || 8;

    const grouped = Object.create(null);
    (records || []).forEach(record => {
        const name = String(record[studentKey] || '')
            || String(record.username || '')
            || String(record.studentId || '');
        if (!name.trim()) return;
        if (!grouped[name]) grouped[name] = [];
        grouped[name].push(record);
    });

    const byAttempt = Object.create(null);
    const classPoints = [];
    let maxAttempts = 0;

    Object.keys(grouped).forEach(name => {
        const attempts = grouped[name]
            .map(record => ({ record, date: recordDate(record) }))
            .filter(a => a.date)
            .sort((a, b) => a.date.getTime() - b.date.getTime())
            .slice(-maxSessions);
        if (attempts.length === 0) return;
        byAttempt[name] = attempts;
        maxAttempts = Math.max(maxAttempts, attempts.length);
    });

    for (let x = 0; x < maxAttempts; x++) {
        let sum = 0, n = 0;
        Object.keys(byAttempt).forEach(name => {
            const attempt = byAttempt[name][x];
            if (!attempt) return;
            const score = scoreAsNumber(attempt.record);
            if (score == null) return;
            sum += score;
            n++;
        });
        classPoints.push({ x, y: n > 0 ? Math.round(sum / n) : null });
    }

    const ranked = Object.keys(byAttempt)
        .map(name => ({ name, n: byAttempt[name].length }))
        .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
        .slice(0, maxStudents);

    const series = ranked.map(({ name }, rank) => ({
        name,
        rank,
        points: byAttempt[name].map((attempt, x) => ({
            x,
            y: scoreAsNumber(attempt.record),
            date: dayKey(attempt.date),
            score: attempt.record.score != null ? String(attempt.record.score) : null
        }))
    }));

    return { series, classAverage: classPoints, maxAttempts };
}

/**
 * Counts error types from real records. Unknown types fold into 'Other'.
 * Percentages are rounded so they sum to 100.
 */
function buildErrorDistribution(records) {
    const counts = {};
    KNOWN_ERROR_TYPES.concat(['Other']).forEach(t => (counts[t] = 0));

    realAnalyticsRecords(records).forEach(record => {
        const errors = Array.isArray(record.errors) ? record.errors
            : record.errorType ? [{ errorType: record.errorType }] : [];
        errors.filter(error => error && error.severity !== 'warning').forEach(error => {
            counts[classifyActivityError(error)]++;
        });
    });

    const total = KNOWN_ERROR_TYPES.concat(['Other']).reduce((sum, t) => sum + counts[t], 0);
    if (total === 0) return { total: 0, categories: [] };

    const categories = KNOWN_ERROR_TYPES.concat(['Other'])
        .filter(t => counts[t] > 0)
        .map((name, i) => ({
            name,
            count: counts[name],
            pct: Math.round((counts[name] / total) * 100)
        }));

    const pctSum = categories.reduce((s, c) => s + c.pct, 0);
    if (pctSum !== 100 && categories.length > 0) {
        const largest = categories.reduce((a, b) => (a.count >= b.count ? a : b));
        largest.pct += 100 - pctSum;
    }
    return { total, categories };
}

/* ============================================================
   CommonJS export guard — allows the Node suite to require()
   the same source the browser bundles.
   ============================================================ */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        classifyActivityError,
        realAnalyticsRecords,
        isSubmissionActivity,
        recordDate,
        maxRecordDate,
        dayKey,
        scoreAsNumber,
        monthWeekForDay,
        buildSubmissionSeries,
        countByDayKey,
        buildTrajectorySeries,
        buildErrorDistribution,
        KNOWN_ERROR_TYPES,
        AN_MONTHS_SHORT,
        AN_DAYS_SHORT
    };
}
/* ============================================================
   ANALYTICS GEOMETRY — pure SVG math
   Scales, smooth paths, area paths and donut-slice arcs used by
   the hand-rolled Recharts-style SVG renderers. No DOM access.
   ============================================================ */

/* Select ticks by their actual label extents, leaving minGap clear pixels.
   Unlike forcing the final tick, this cannot collide at narrow widths. */
function chartTicks(labels, positions, minGap = 32) {
    const result = [];
    let edge = -Infinity;
    labels.forEach((label, i) => {
        const half = String(label).length * 3.6;
        if (positions[i] - half >= edge + minGap) {
            result.push(i);
            edge = positions[i] + half;
        }
    });
    return result;
}

function groupedBarGeometry(series, attempts, width, options = {}) {
    if (!series.length || attempts <= 0) return [];
    const left = options.left ?? 48, right = options.right ?? 16;
    const baseline = options.baseline ?? 216;
    const y = linearScale(options.domain || [0, 100], [baseline, 16]);
    const slot = Math.max(1, (width - left - right) / attempts);
    const gap = 2, groupWidth = slot * 0.78;
    const barWidth = Math.max(1, (groupWidth - gap * (series.length - 1)) / series.length);
    return series.flatMap((s, student) => s.points.map(point => {
        const ungraded = point.y == null;
        const height = ungraded ? 10 : Math.max(2, baseline - y(point.y));
        return {student, point, ungraded, x:left + slot * point.x + (slot-groupWidth)/2 + student*(barWidth+gap),
            y:baseline-height, width:barWidth, height};
    }));
}

function roundedBarPath(b, radius = 3) {
    const r = Math.min(radius, b.width / 2, b.height);
    return `M ${b.x} ${b.y+b.height} V ${b.y+r} Q ${b.x} ${b.y} ${b.x+r} ${b.y} H ${b.x+b.width-r} Q ${b.x+b.width} ${b.y} ${b.x+b.width} ${b.y+r} V ${b.y+b.height} Z`;
}

function linearScale(domain, range) {
    const [d0, d1] = domain;
    const [r0, r1] = range;
    const span = d1 - d0 || 1;
    return value => r0 + ((value - d0) / span) * (r1 - r0);
}

/**
 * Rounds a data max up to a tidy axis ceiling using the legacy
 * bar-chart rule so area charts keep friendly gridlines.
 */
function niceCeil(max, factor = 1.2) {
    if (max <= 0) return 0;
    if (max <= 5) return 6;
    if (max <= 10) return 12;
    return Math.ceil(max * factor);
}

/**
 * Monotone-ish smooth path from Catmull-Rom control points.
 * Handles 0, 1 and 2+ points without emitting invalid commands.
 */
function smoothPath(points, xFor, yFor) {
    if (!points || points.length === 0) return '';
    if (points.length === 1) {
        return `M ${round(xFor(points[0].x))} ${round(yFor(points[0].y))}`;
    }
    let d = `M ${round(xFor(points[0].x))} ${round(yFor(points[0].y))}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] || points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] || p2;
        const c1x = xFor(p1.x) + (xFor(p2.x) - xFor(p0.x)) / 6;
        const c2x = xFor(p2.x) - (xFor(p3.x) - xFor(p1.x)) / 6;
        const c1y = yFor(p1.y) + (yFor(p2.y) - yFor(p0.y)) / 6;
        const c2y = yFor(p2.y) - (yFor(p3.y) - yFor(p1.y)) / 6;
        d += ` C ${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(xFor(p2.x))} ${round(yFor(p2.y))}`;
    }
    return d;
}

/**
 * Area chart fill: smooth top edge closed down to a baseline.
 * Numbers are plain X values (indices); y values are pixels.
 */
function areaPath(points, xFor, yFor, baselineY) {
    if (!points || points.length === 0) return '';
    const line = smoothPath(points, xFor, yFor);
    if (!line) return '';
    const last = points[points.length - 1];
    const first = points[0];
    return `${line} L ${round(xFor(last.x))} ${round(baselineY)} L ${round(xFor(first.x))} ${round(baselineY)} Z`;
}

const TAU = Math.PI * 2;
const START_ANGLE = -Math.PI / 2; // 12 o'clock, like Recharts pies

function polarPoint(cx, cy, radius, angle) {
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

/**
 * Donut-slice path (outer arc → inner arc) for an angular span.
 * Angles are radians, 0 = 12 o'clock, sweeping clockwise.
 */
function arcPath(cx, cy, outerR, innerR, startAngle, endAngle) {
    const sweep = endAngle - startAngle;
    // A single SVG arc cannot draw a complete circle (identical endpoints).
    if (sweep >= TAU - 1e-9) {
        const o = polarPoint(cx, cy, outerR, startAngle);
        const opposite = polarPoint(cx, cy, outerR, startAngle + Math.PI);
        const i = polarPoint(cx, cy, innerR, startAngle);
        const innerOpposite = polarPoint(cx, cy, innerR, startAngle + Math.PI);
        return `M ${round(o.x)} ${round(o.y)} A ${outerR} ${outerR} 0 1 1 ${round(opposite.x)} ${round(opposite.y)} A ${outerR} ${outerR} 0 1 1 ${round(o.x)} ${round(o.y)} L ${round(i.x)} ${round(i.y)} A ${innerR} ${innerR} 0 1 0 ${round(innerOpposite.x)} ${round(innerOpposite.y)} A ${innerR} ${innerR} 0 1 0 ${round(i.x)} ${round(i.y)} Z`;
    }
    const largeArc = sweep > Math.PI ? 1 : 0;
    const outer0 = polarPoint(cx, cy, outerR, startAngle);
    const outer1 = polarPoint(cx, cy, outerR, endAngle);
    const inner1 = polarPoint(cx, cy, innerR, endAngle);
    const inner0 = polarPoint(cx, cy, innerR, startAngle);
    return [
        `M ${round(outer0.x)} ${round(outer0.y)}`,
        `A ${round(outerR)} ${round(outerR)} 0 ${largeArc} 1 ${round(outer1.x)} ${round(outer1.y)}`,
        `L ${round(inner1.x)} ${round(inner1.y)}`,
        `A ${round(innerR)} ${round(innerR)} 0 ${largeArc} 0 ${round(inner0.x)} ${round(inner0.y)}`,
        'Z'
    ].join(' ');
}

/** Label/pointer centroid mid-way between inner and outer radii. */
function sliceCentroid(cx, cy, outerR, innerR, startAngle, endAngle) {
    const mid = startAngle + (endAngle - startAngle) / 2;
    const midR = (outerR + innerR) / 2;
    return {
        x: cx + midR * Math.cos(mid),
        y: cy + midR * Math.sin(mid),
        midAngle: mid
    };
}

function round(value, precision) {
    const p = precision == null ? 1 : precision;
    return Math.round(value * Math.pow(10, p)) / Math.pow(10, p);
}

/* Responsive layout bins for the student Learning Progress chart. The
   480px threshold is reported with a 40px deadband: while the measured
   width sits inside the deadband the previous bin is kept, so viewport
   flicker (mobile toolbar, rotation) cannot flap the chart aspect and
   re-trigger full re-renders mid-scroll. */
const CHART_LAYOUT_WIDE_MIN = 520;
const CHART_LAYOUT_TALL_MAX = 460;

/**
 * Chooses the chart layout bin for a measured card width.
 * @param {number} width - measured card width in px (0 when hidden)
 * @param {'tall'|'wide'} [prevBin='tall'] - last committed bin
 * @returns {{bin: 'tall'|'wide', h: number}} viewBox height (470 tall / 320 wide)
 */
function chartLayout(width, prevBin) {
    const prev = prevBin === 'wide' ? 'wide' : 'tall';
    if (!(width > 0)) return { bin: prev, h: prev === 'wide' ? 320 : 470 };
    if (width >= CHART_LAYOUT_WIDE_MIN) return { bin: 'wide', h: 320 };
    if (width <= CHART_LAYOUT_TALL_MAX) return { bin: 'tall', h: 470 };
    return prev === 'wide'
        ? { bin: 'wide', h: 320 }
        : { bin: 'tall', h: 470 };
}

/**
 * Chooses the 0-based attempt indices to label on the Learning Progress
 * x-axis so labels never crowd on narrow cards (the vanilla equivalent of
 * a charting library's `minTickGap`). Always keeps the first and last
 * attempt and never emits more than 6 ticks, evenly spread.
 * @param {number} count - number of data points (0 → empty, 1 → [0])
 * @param {number} plotWidth - plot width in px (0 falls back to 2 ticks)
 * @param {number} [minPx=44] - minimum pixel gap between neighbouring ticks
 * @returns {number[]} ascending 0-based indices to label
 */
function progressXTicks(count, plotWidth, minPx) {
    const gap = Math.max(minPx === undefined ? 44 : Number(minPx) || 0, 1);
    const n = Math.max(0, Math.floor(Number(count) || 0));
    if (n === 0) return [];
    if (n === 1) return [0];
    const width = Math.max(0, Number(plotWidth) || 0);
    const target = Math.max(2, Math.min(6, Math.floor(width / gap)));
    if (n <= target) return Array.from({ length: n }, (_, i) => i);
    const ticks = [0];
    for (let t = 1; t < target; t++) ticks.push(Math.round((t * (n - 1)) / (target - 1)));
    ticks.push(n - 1);
    return [...new Set(ticks)].sort((a, b) => a - b);
}

/* ============================================================
   Chart size system (Part H items 59-68): a single purpose → size
   map shared by every chart. Mirrors the CSS tokens
   --chart-h-{sm,md,lg,xl} in style.css so pure geometry and the DOM
   agree on one source of truth.
   ============================================================ */
const CHART_SIZES = { sm: 240, md: 300, lg: 360, xl: 420 };

/* Item 61 purpose ranges: [min, max] px. The clamp() low term is the
   mobile-readable minimum, the vw term is fluid, and the high term is
   the controlled desktop maximum (item 66). The nominal CHART_SIZES
   tokens stay the spec's example values. */
const CHART_RANGES = { sm: { min: 200, max: 260 }, md: { min: 240, max: 320 }, lg: { min: 260, max: 380 }, xl: { min: 300, max: 420 } };
const CHART_VW = { sm: 26, md: 30, lg: 32, xl: 36 };

/**
 * Resolves a chart-size name into the responsive height contract.
 * @param {'sm'|'md'|'lg'|'xl'|null} [size='md'] size token name
 * @returns {{name:string, token:number, min:number, max:number, vw:number, toCss:()=>string}}
 *   min/max/vw are the three clamp() terms the stylesheet uses (so
 *   pure geometry and CSS agree on exactly one source of truth).
 */
function chartBox(size) {
    const key = CHART_RANGES[size] ? size : 'md';
    const r = CHART_RANGES[key];
    return {
        name: key,
        token: CHART_SIZES[key],
        min: r.min,
        max: r.max,
        vw: CHART_VW[key],
        toCss() { return 'clamp(' + r.min + 'px, ' + CHART_VW[key] + 'vw, ' + r.max + 'px)'; }
    };
}

/* ============================================================
   CommonJS export guard — allows the Node suite to require()
   the same source the browser bundles.
   ============================================================ */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        chartTicks,
        groupedBarGeometry,
        roundedBarPath,
        linearScale,
        niceCeil,
        smoothPath,
        areaPath,
        arcPath,
        sliceCentroid,
        polarPoint,
        chartLayout,
        progressXTicks,
        CHART_LAYOUT_WIDE_MIN,
        CHART_LAYOUT_TALL_MAX,
        START_ANGLE,
        TAU,
        round,
        CHART_SIZES,
        chartBox
    };
}
/* ============================================================
   ANALYTICS (Instructor)
   ============================================================ */

let cachedInstructorActivity = [];
let currentFilteredActivity = [];
let analyticsCurrentPage = 1;
const analyticsPageSize = 5;

var analyticsUnsubscribe = null; // realtime subscription handle, also read by navigation.js
let analyticsLoadGeneration = 0;

function startAnalyticsRealtime() {
    if (analyticsUnsubscribe || currentUser?.role !== 'instructor') return;
    const owner = currentUser;
    const subscriptions = [];
    analyticsUnsubscribe = () => subscriptions.forEach(unsubscribe => unsubscribe());
    const changed = () => {
        if (currentUser !== owner || currentPage !== 'analytics') return;
        rebuildAnalyticsScope();
        applyAnalyticsFilters();
    };
    const failed = error => {
        console.error('[Analytics] Realtime subscription error:', error);
        setText('an-live-status', 'Live updates unavailable. Reopen Analytics to retry.');
    };
    subscriptions.push(subscribeCollection(activityRef, records => {
        if (currentUser !== owner || currentPage !== 'analytics') return;
        cachedActivity = records;
        changed();
    }, failed));
    subscriptions.push(subscribeCollection(usersRef, records => {
        if (currentUser !== owner || currentPage !== 'analytics') return;
        cachedUsers = records;
        changed();
    }, failed));
}

function stopAnalyticsRealtime() {
    analyticsLoadGeneration++;
    if (analyticsUnsubscribe) {
        analyticsUnsubscribe();
        analyticsUnsubscribe = null;
    }
}

function rebuildAnalyticsScope() {
    if (!currentUser || currentUser.role !== 'instructor') {
        cachedInstructorActivity = [];
        currentFilteredActivity = [];
        return;
    }
    const ownerIds = new Set([currentUser.id, currentUser._docId].filter(Boolean));
    const isDefaultInst = ownerIds.has('u2');
    const myStudents = cachedUsers.filter(u => u.role === 'student' && !isDeletedProfile(u) && (
        ownerIds.has(u.instructorId) ||
        (isDefaultInst && (!u.instructorId || u.instructorId === 'u2'))
    ));
    const myStudentIds = new Set(myStudents.flatMap(s => [s.id, s._docId]).filter(Boolean));
    const myStudentEnrolledIds = new Set(myStudents.flatMap(s => [s.studentNumber, s.studentId]).filter(Boolean));
    const myStudentUsernames = new Set(myStudents.map(s => s.username).filter(Boolean));
    const myStudentNames = new Set(myStudents.map(s => s.fullName).filter(Boolean));

    cachedInstructorActivity = realAnalyticsRecords(cachedActivity).filter(a => {
        if (a.instructorId) return ownerIds.has(a.instructorId);
        if (a.studentAccountId) return myStudentIds.has(a.studentAccountId);
        if (a.studentId) return myStudentIds.has(a.studentId) || myStudentEnrolledIds.has(a.studentId);
        if (a.username && myStudentUsernames.has(a.username)) return true;
        if (a.student && myStudentNames.has(a.student)) return true;
        return false;
    });

    currentFilteredActivity = [...cachedInstructorActivity];
}

async function loadAnalytics() {
    stopAnalyticsRealtime();
    const generation = analyticsLoadGeneration;
    const owner = currentUser;
    if (!owner || owner.role !== 'instructor') return;
    showAnalyticsLoading();
    try {
    const [activity, users] = await Promise.all([dbGetAll(activityRef), dbGetAll(usersRef)]);
    if (generation !== analyticsLoadGeneration || currentUser !== owner || currentPage !== 'analytics') return;
    cachedActivity = activity;
    cachedUsers = users;

    rebuildAnalyticsScope();

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
    startAnalyticsRealtime();
    } catch (error) {
        if (generation !== analyticsLoadGeneration || currentUser !== owner) return;
        console.error('[Analytics] Loading failed:', error);
        cachedInstructorActivity = [];
        currentFilteredActivity = [];
        updateAnalyticsUI();
        ['an-trajectory-svg', 'an-submissions-svg', 'an-error-svg'].forEach(id =>
            showChartError(id, 'Unable to load analytics. Reopen this page to retry.'));
    }
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

    const sourceActivity = cachedInstructorActivity;

    currentFilteredActivity = sourceActivity.filter(a => {
        const submissionDate = recordDate(a) || new Date(NaN);

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
            if (isNaN(submissionDate.getTime())) return false;
            const y = submissionDate.getFullYear();
            const m = String(submissionDate.getMonth() + 1).padStart(2, '0');
            const d = String(submissionDate.getDate()).padStart(2, '0');
            const localDateStr = `${y}-${m}-${d}`;
            if (localDateStr !== dateVal) return false;
        }

        // 3. Month (0-indexed)
        if (monthVal !== '') {
            if (isNaN(submissionDate.getTime())) return false;
            if (submissionDate.getMonth() !== parseInt(monthVal)) return false;
        }

        // 4. Week within month
        if (weekVal !== '') {
            if (isNaN(submissionDate.getTime())) return false;
            const dayNum = submissionDate.getDate();
            let week = 1;
            if (dayNum >= 4 && dayNum <= 10) week = 2;
            else if (dayNum >= 11 && dayNum <= 17) week = 3;
            else if (dayNum >= 18 && dayNum <= 24) week = 4;
            else if (dayNum > 24) week = 5;

            if (week !== parseInt(weekVal)) return false;
        }

        // 5. Submission status
        if (submissionVal) {
            const normStatus = a.status === 'compile_error' ? 'Failed' :
                a.status === 'ungraded' || a.status === 'In Progress' ? 'Pending' : a.status;
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
    const submissions = currentFilteredActivity.filter(isSubmissionActivity);
    const total = submissions.length;

    // Stat Cards
    const ownerIds = new Set([currentUser?.id, currentUser?._docId].filter(Boolean));
    const isDefaultInst = ownerIds.has('u2');
    const myStudents = (cachedUsers || []).filter(u => u.role === 'student' && !isDeletedProfile(u) && (
        ownerIds.has(u.instructorId) ||
        (isDefaultInst && (!u.instructorId || u.instructorId === 'u2'))
    ));
    const activeStudents = myStudents.filter(u => u.status === 'active');

    setText('stat-students', String(activeStudents.length));
    setText('stat-submissions', String(total));

    const completed = submissions.filter(a => a.status === 'Completed').length;
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    setText('stat-success-rate', successRate + '%');

    const errCount = buildErrorDistribution(currentFilteredActivity).total;
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
    const recordCount = currentFilteredActivity.length;
    if (countLabel) countLabel.textContent = recordCount === 0 ? 'No records' : `${recordCount} record${recordCount !== 1 ? 's' : ''}`;

    // Render Charts
    if (typeof renderAnalyticsCharts === 'function') renderAnalyticsCharts(currentFilteredActivity);

    // Render Paginated Table
    renderFilteredActivityTable(currentFilteredActivity);
    animateAnalyticsCards();
}

function analyticsPageNav(dir) {
    analyticsCurrentPage += dir;
    renderFilteredActivityTable(currentFilteredActivity);
}

function analyticsStudentNumber(record) {
    // A deleted student is not resolved to a live profile; the record falls
    // back to its own stored fields rather than showing a roster entry that
    // no longer exists.
    const student = (cachedUsers || []).find(user => user.role === 'student' && !isDeletedProfile(user) && (
        [user.id, user._docId].filter(Boolean).includes(record.studentAccountId || record.studentId) ||
        (record.studentId && [user.studentNumber, user.studentId].includes(record.studentId)) ||
        (record.username && user.username === record.username)
    ));
    return student ? readStudentNumber(student) : readStudentNumber(record);
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
            No matching student activity found for the selected filters.
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
        if (norm === 'compile_error') return `<span class="badge-status badge-failed">Compile error</span>`;
        if (norm === 'ungraded') return `<span class="badge-status badge-pending">Ungraded</span>`;
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
          <td class="an-cell-muted an-cell-mono">${anEsc(analyticsStudentNumber(a))}</td>
          <td class="an-cell-secondary">${anEsc(a.exercise || '—')}${a.type === 'translate_attempt' ? '<br><small>Translation attempt</small>' : ''}</td>
          <td>${diffBadge(a.difficulty)}</td>
          <td>${anStatusBadge(a.status)}</td>
          <td class="an-cell-score" style="color:${scoreColor(a)}">${a.score || '—'}</td>
          <td class="an-cell-muted">${dateStr}</td>
          <td class="an-cell-muted">${a.processingTime || '—'}</td>
          <td>${resultBadge(a)}</td>
          <td>
                        <button class="an-eye-btn" title="View Details" aria-label="View details for ${docId}" onclick="viewSubmissionDetail('${docId}')">
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
    setText('sdm-student-id', analyticsStudentNumber(a));
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
        const ownsSubmission = isSubmissionActivity(a) && currentUser?.role === 'instructor' &&
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


/* Shared, dependency-free chart primitives inspired by ui.shadcn.com/charts.
   Classic script: all seven chart views use the same layout and interactions. */
const AN_PLOT_HEIGHT = 250;
const anChartJobs = new Map();
let anSystemObserver;
let anSystemResizeTimer;

function anChartHeader(title, description, stats) {
    return `<div class="an-chart-heading"><h3 class="an-chart-title">${anEsc(title)}</h3><p class="an-chart-subtitle">${anEsc(description)}</p></div>` +
        `<div class="an-stat-tabs" aria-label="Chart metrics">${(stats || []).map(s =>
            `<button type="button" class="an-stat-tab" data-metric="${anAttr(s.key || '')}" ${s.active == null ? 'disabled' : `aria-pressed="${s.active}"`}><span>${anEsc(s.label)}</span><strong>${anEsc(s.value)}</strong></button>`).join('')}</div>`;
}

function anMountChart(id, config) {
    let plot = $id(id);
    if (!plot) return null;
    const card = plot.closest('.an-chart-card, .chart-container');
    if (!card) return null;
    if (!card.dataset.chartMounted) {
        card.classList.add('an-chart-system');
        card.dataset.chartMounted = 'true';
        card.innerHTML = `<div class="an-chart-header"></div><div class="an-chart-controls"></div><p class="an-chart-insight" aria-live="polite"></p><div class="an-chart-plot" id="${anAttr(id)}"></div><div class="an-svg-legend"></div><div class="an-chart-footer"></div><div class="an-chart-data"></div>`;
        plot = $id(id);
    }
    const header = card.querySelector('.an-chart-header');
    header.innerHTML = anChartHeader(config.title, config.description, config.stats);
    header.querySelectorAll('[data-metric]').forEach(b => b.onclick = () => {
        if (config.onMetric) config.onMetric(b.dataset.metric);
        card.querySelector(`[data-metric="${b.dataset.metric}"]`)?.focus();
    });
    const controls = card.querySelector('.an-chart-controls');
    controls.innerHTML = config.controls || '';
    controls.hidden = !config.controls;
    card.querySelector('.an-chart-insight').textContent = config.insight || '';
    card.querySelector('.an-chart-footer').textContent = config.caption || '';
    plot.setAttribute('role', 'group');
    plot.setAttribute('aria-label', config.title);
    plot.setAttribute('aria-busy', 'false');
    anHideTooltip(card.querySelector('.an-svg-tooltip'));
    return { card, plot, controls, legend: card.querySelector('.an-svg-legend'), data: card.querySelector('.an-chart-data') };
}

function anChartDraw(view, render) {
    if (!view) return;
    const {plot} = view;
    // A re-render may have replaced this plot element; release the old node so
    // the observer does not keep detached elements alive.
    anChartJobs.forEach((job, el) => {
        if (!el.isConnected) { if (anSystemObserver) anSystemObserver.unobserve(el); anChartJobs.delete(el); }
    });
    const run = () => {
        const width = Math.floor(plot.clientWidth);
        if (width <= 0 || !plot.isConnected) return;
        const job = anChartJobs.get(plot);
        if (job) job.width = width;
        try { render(width); }
        catch (e) { console.error('[Chart] render failed', e); anChartState(plot, 'error', '', run); }
    };
    anChartJobs.set(plot, {width: 0, run});
    if (typeof ResizeObserver === 'function') {
        if (!anSystemObserver) anSystemObserver = new ResizeObserver(entries => {
            const changed = entries.some(e => {
                const job = anChartJobs.get(e.target);
                return job && e.target.clientWidth > 0 && Math.floor(e.target.clientWidth) !== job.width;
            });
            if (!changed) return;
            clearTimeout(anSystemResizeTimer);
            anSystemResizeTimer = setTimeout(() => {
                anChartJobs.forEach((job, el) => {
                    if (!el.isConnected) { anSystemObserver.unobserve(el); anChartJobs.delete(el); }
                    else if (el.clientWidth > 0 && Math.floor(el.clientWidth) !== job.width) job.run();
                });
            }, 150);
        });
        anSystemObserver.observe(plot);
    }
    run();
}

/**
 * Re-run a chart's last render pass on demand.
 *
 * A plot inside a hidden tab measures 0 x 0, so anChartDraw skips it; when the
 * tab becomes visible the ResizeObserver usually catches up, but a panel that
 * was hidden for the whole session may never have been observed at a real size.
 * This gives the tab code a deterministic way to draw once layout is known.
 * Returns true when a redraw actually ran.
 */
function anChartRedraw(plot) {
    if (!plot) return false;
    const job = anChartJobs.get(plot);
    if (!job) return false;
    const width = Math.floor(plot.clientWidth);
    if (width <= 0 || !plot.isConnected) return false;
    job.width = width;
    try { job.run(); }
    catch (e) { console.error('[Chart] redraw failed', e); return false; }
    return true;
}

function anChartState(plot, state, message, retry) {
    if (!plot) return;
    plot.setAttribute('aria-busy', String(state === 'loading'));
    plot.innerHTML = state === 'loading'
        ? '<div class="an-chart-skeleton" role="status"><span class="sr-only">Loading chart data…</span></div>'
        : `<div class="an-chart-empty" role="status"><p class="an-chart-empty-title">${state === 'error' ? 'This chart is unavailable right now.' : anEsc(message || 'No data for this selection.')}</p><p class="an-chart-empty-hint">${state === 'error' ? 'Please try loading it again.' : 'Adjust your filters or check back after more activity.'}</p>${retry ? '<button type="button" class="an-chart-retry">Try again</button>' : ''}</div>`;
    if (retry) plot.querySelector('.an-chart-retry')?.addEventListener('click', retry);
}

function anTooltipContent(label, rows) {
    return `<div class="an-tt-header">${anEsc(label)}</div>` + rows.map(r =>
        `<div class="an-tt-row"><span class="an-tt-dot" style="background:${r.color}"></span><span>${anEsc(r.name)}</span><strong>${anEsc(r.value)}</strong></div>`).join('');
}

function anBindMarks(plot, card, items, select) {
    const tip = anEnsureTooltip(card);
    const marks = Array.from(plot.querySelectorAll('[data-mark]'));
    marks.forEach((mark, index) => {
        mark.setAttribute('tabindex', index === 0 ? '0' : '-1');
        const item = items[Number(mark.getAttribute('data-mark'))];
        const show = e => anShowTooltip(tip, e, anTooltipContent(item.label, item.rows), card);
        mark.addEventListener('mouseenter', show);
        mark.addEventListener('mousemove', show);
        mark.addEventListener('mouseleave', () => anHideTooltip(tip));
        mark.addEventListener('focus', e => { marks.forEach(m=>m.setAttribute('tabindex',m===mark?'0':'-1')); show(e); });
        mark.addEventListener('blur', () => anHideTooltip(tip));
        mark.addEventListener('click', e => { show(e); if (select) select(item, mark); });
        mark.addEventListener('keydown', e => {
            const next = anChartKeyIndex(e.key, index, marks.length);
            if (next != null) { e.preventDefault(); marks[next].focus(); }
            else if (e.key === 'Escape') { e.preventDefault(); anHideTooltip(tip); }
            else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(e); if (select) select(item, mark); }
        });
    });
}

function anChartKeyIndex(key, index, count) {
    if (!count) return null;
    if (key === 'Home') return 0;
    if (key === 'End') return count - 1;
    if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % count;
    if (key === 'ArrowLeft' || key === 'ArrowUp') return (index + count - 1) % count;
    return null;
}

function anLegendChip(name, value, color) {
    return `<span class="an-legend-chip-static"><span class="an-legend-dot" style="background:${color}"></span><span class="an-legend-name" title="${anAttr(name)}">${anEsc(name)}</span><span class="an-legend-val">${anEsc(value)}</span></span>`;
}

function anChartGrid(width, ticks, y, suffix) {
    return ticks.map(n=>`<line x1="48" x2="${width-16}" y1="${y(n)}" y2="${y(n)}" class="an-grid-line"/><text x="40" y="${y(n)+4}" text-anchor="end" class="an-axis-label">${n}${suffix || ''}</text>`).join('');
}

function anChartSvg(width, label, content) {
    return `<svg class="an-svg" width="${width}" height="250" viewBox="0 0 ${width} 250" role="group" aria-label="${anAttr(label)}">${content}</svg>`;
}
/* Instructor analytics. Shared chart layout and interactions: chart-system.js. */
var analyticsPieActiveName = null;
function anChartPalette() { return [1,2,3,4,5].map(n=>'var(--chart-'+n+')'); }
function anAttr(value) { return String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
function anEsc(value) { return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function renderAnalyticsCharts(records) {
    const submissions=(records || []).filter(isSubmissionActivity);
    setText('an-live-status','Showing recorded submissions and translation attempts for the selected filters.');
    [[renderTrajectoryChart,'an-trajectory-svg',submissions],[renderSubmissionActivityChart,'an-submissions-svg',submissions],[renderErrorDistributionChart,'an-error-svg',records]].forEach(([render,id,data])=>{
        try { render(data); } catch(e) { console.error('[Analytics] chart failed',e); showChartError(id); }
    });
}
function showChartError(id) { anChartState($id(id),'error','',()=>loadAnalytics()); }
function showAnalyticsLoading() {
    setText('an-live-status','Loading analytics…');
    ['an-trajectory-svg','an-submissions-svg','an-error-svg'].forEach(id=>anChartState($id(id),'loading'));
}
function anEnsureTooltip(card) {
    if(!card)return null;
    let tip=card.querySelector('.an-svg-tooltip');
    if(!tip){tip=document.createElement('div');tip.className='an-svg-tooltip hidden';tip.setAttribute('role','tooltip');card.appendChild(tip);}
    return tip;
}
function anShowTooltip(tip,event,html,card) {
    if(!tip)return;
    // Save the target now: currentTarget is null after dispatch returns.
    tip._pending={event,html,target:event.currentTarget || event.target};
    if(tip._frame)return;
    tip._frame=requestAnimationFrame(()=>{
        tip._frame=0;
        const next=tip._pending;if(!next)return;
        tip.innerHTML=next.html;tip.classList.remove('hidden');
        const base=card.getBoundingClientRect();
        const rect=next.target?.getBoundingClientRect() || base;
        const x=next.event.clientX || rect.left+rect.width/2;
        const y=next.event.clientY || rect.top;
        const left=Math.max(8,Math.min(x+12,window.innerWidth-tip.offsetWidth-8));
        const top=Math.max(8,Math.min(y-tip.offsetHeight-12,window.innerHeight-tip.offsetHeight-8));
        tip.style.left=(left-base.left)+'px';tip.style.top=(top-base.top)+'px';
    });
}
function anHideTooltip(tip) { if(tip){tip._pending=null;tip.classList.add('hidden');} }
function renderTrajectoryChart(records) { anRenderTrajectory(records || []); }
function anSplitSegments(points) {
    const result=[];let current=[];
    points.forEach(p=>{if(p.y==null){if(current.length)result.push(current);current=[];}else current.push(p);});
    if(current.length)result.push(current);return result;
}

function renderSubmissionActivityChart(records) {
    const mode=$id('chart-view-mode')?.value || 'day';
    const series=buildSubmissionSeries(records || [],{monthVal:$id('filter-month')?.value ?? '',weekVal:$id('filter-week')?.value || '',dateVal:$id('filter-date')?.value || '',viewMode:mode});
    const total=series.reduce((sum,b)=>sum+b.count,0),peak=Math.max(0,...series.map(b=>b.count));
    const view=anMountChart('an-submissions-svg',{title:'Student Submission Activity',description:'Submissions over the selected period.',
        stats:[{label:'Submissions',value:total},{label:'Peak period',value:peak}],
        controls:`<label>View by <select id="chart-view-mode"><option value="day" ${mode==='day'?'selected':''}>Day</option><option value="month" ${mode==='month'?'selected':''}>Month</option></select></label>`,
        caption:'Select a point to view submissions for that period.'});
    if(!view)return;
    view.controls.querySelector('select').onchange=()=>{renderSubmissionActivityChart(records);view.controls.querySelector('select').focus();};
    view.legend.innerHTML=anLegendChip('Submissions',String(total),'var(--chart-1)');
    anChartDraw(view,width=>{
        if(!total){anChartState(view.plot,'empty','No submissions match this period.');return;}
        const yMax=niceCeil(peak),y=linearScale([0,yMax],[216,16]);
        const x=i=>48+(series.length===1?(width-80)/2:i*(width-80)/(series.length-1));
        const points=series.map((b,i)=>({x:i,y:b.count})),ticks=[0,Math.ceil(yMax/2),yMax];
        const items=series.map(b=>({label:b.sub+' · '+b.label,rows:[{name:'Submissions',value:b.count,color:'var(--chart-1)'}],bucket:b}));
        // Straight segments avoid smoothing below zero between sparse counts.
        const line=points.map((p,i)=>`${i?'L':'M'} ${x(p.x)} ${y(p.y)}`).join(' ');
        let content='<defs><linearGradient id="an-submission-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--chart-1)" stop-opacity=".3"/><stop offset="1" stop-color="var(--chart-1)" stop-opacity=".03"/></linearGradient></defs>';
        content+=anChartGrid(width,ticks,y,'')+`<path d="${line} L ${x(points.length-1)} 216 L ${x(0)} 216 Z" fill="url(#an-submission-fill)"/><path d="${line}" fill="none" stroke="var(--chart-1)" stroke-width="2"/>`;
        content+=points.map((p,i)=>`<circle data-mark="${i}" tabindex="-1" role="button" aria-label="${anAttr(items[i].label+': '+p.y+' submissions; filter this period')}" cx="${x(i)}" cy="${y(p.y)}" r="5" fill="var(--chart-1)"/>`).join('');
        content+=chartTicks(series.map(b=>b.sub),series.map((_,i)=>x(i))).map(i=>`<text class="an-axis-label" x="${x(i)}" y="236" text-anchor="middle">${anEsc(series[i].sub)}</text>`).join('');
        view.plot.innerHTML=anChartSvg(width,'Submission activity by period',content);
        anBindMarks(view.plot,view.card,items,item=>{
            const b=item.bucket;
            if(b.dateKey&&$id('filter-date'))$id('filter-date').value=b.dateKey;
            else if(b.weekRange&&$id('filter-week'))$id('filter-week').value=String(b.weekRange.w);
            else return;
            applyAnalyticsFilters();
        });
    });
}

function renderErrorDistributionChart(records) {
    anRenderDonut('an-error-svg',records || [],{title:'Error Distribution',description:'Translation errors by type, including free practice.',
        active:analyticsPieActiveName,onSelect:name=>{analyticsPieActiveName=name;renderErrorDistributionChart(records);}});
}
function toggleErrorSlice(name) {
    analyticsPieActiveName=analyticsPieActiveName===name?null:name;
    renderErrorDistributionChart(typeof currentFilteredActivity==='undefined'?[]:currentFilteredActivity);
}

/* Same renderer for instructor and system donuts; state remains caller-owned. */
function anRenderDonut(id,records,config) {
    const dist=buildErrorDistribution(records);
    const active=dist.categories.some(c=>c.name===config.active)?config.active:null;
    const view=anMountChart(id,{title:config.title,description:config.description,
        stats:[{label:'Errors',value:dist.total},{label:'Types',value:dist.categories.length}],
        controls:`<label>Error type <select aria-label="Highlight error type"><option value="">All error types</option>${dist.categories.map(c=>`<option value="${anAttr(c.name)}" ${c.name===active?'selected':''}>${anEsc(c.name)}</option>`).join('')}</select></label>`,
        caption:'Select a slice or legend chip to highlight an error type.'});
    if(!view)return;
    const select=name=>config.onSelect(name===active?null:name);
    view.controls.querySelector('select').onchange=e=>{config.onSelect(e.target.value || null);view.controls.querySelector('select').focus();};
    view.legend.innerHTML=dist.categories.map((c,i)=>`<button class="an-legend-chip" data-category="${i}" aria-pressed="${c.name===active}"><span class="an-legend-dot" style="background:${anChartPalette()[i%5]}"></span><span class="an-legend-name" title="${anAttr(c.name)}">${anEsc(c.name)}</span><span class="an-legend-val">${c.pct}% · ${c.count}</span></button>`).join('');
    view.legend.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{const index=b.dataset.category;select(dist.categories[index].name);view.legend.querySelector(`[data-category="${index}"]`)?.focus();});
    anChartDraw(view,width=>{
        if(!dist.total){anChartState(view.plot,'empty','No errors in this period.');return;}
        const cx=width/2,cy=125,r=Math.min(96,cx-12),inner=r*.65;
        let angle=-Math.PI/2;
        const items=dist.categories.map((c,i)=>({label:'Recorded errors',name:c.name,rows:[{name:c.name,value:`${c.count} · ${c.pct}%`,color:anChartPalette()[i%5]}]}));
        const slices=dist.categories.map((c,i)=>{
            const end=angle+c.count/dist.total*Math.PI*2;
            const d=arcPath(cx,cy,r,inner,angle,end);angle=end;
            return `<path data-mark="${i}" tabindex="-1" role="button" aria-pressed="${c.name===active}" aria-label="${anAttr(c.name+': '+c.count+' errors, '+c.pct+' percent')}" d="${d}" fill="${anChartPalette()[i%5]}" opacity="${active && c.name!==active ? .25 : 1}" stroke="var(--card)" stroke-width="3"/>`;
        }).join('');
        view.plot.innerHTML=anChartSvg(width,config.title,slices+`<text x="${cx}" y="124" text-anchor="middle" class="an-donut-total">${dist.total}</text><text x="${cx}" y="145" text-anchor="middle" class="an-axis-label">errors</text>`);
        anBindMarks(view.plot,view.card,items,(item,mark)=>{const index=mark.dataset.mark;select(item.name);view.plot.querySelector(`[data-mark="${index}"]`)?.focus();});
    });
}
/* Trajectory presentation. The aggregation's score and average semantics stay intact. */
const anTrajectoryView = {metric:'score', mode:'bars', exercise:'', students:null, axis:'attempt', full:true, owner:null};

function anTrajectoryNames(records) {
    const users = typeof cachedUsers === 'undefined' ? [] : cachedUsers;
    const labels = new Map();
    records.forEach(r => {
        const key = String(r.student || r.username || r.studentId || '');
        if (!key || labels.has(key)) return;
        const user = users.find(u => [u.id,u._docId,u.studentId,u.studentNumber,u.username].filter(Boolean)
            .some(id => [r.studentAccountId,r.studentId,r.username].filter(Boolean).includes(id)));
        const name = user?.fullName || user?.displayName || r.student || r.username;
        labels.set(key, name && !/^u\d{6,}|^[a-z\d_-]{20,}$/i.test(name) ? name : 'Student ' + (labels.size+1));
    });
    return labels;
}

function anRenderTrajectory(records) {
    const state = anTrajectoryView;
    const owner = typeof currentUser === 'undefined' ? null : currentUser;
    if (state.owner !== owner) { Object.assign(state,{owner,students:null,exercise:'',metric:'score',mode:'bars',axis:'attempt',full:true}); }
    const names = anTrajectoryNames(records);
    const exercises = [...new Set(records.map(r=>String(r.exercise || r.exerciseId || 'Unspecified')))].sort();
    if (state.exercise && !exercises.includes(state.exercise)) state.exercise = '';
    const filtered = records.filter(r=>!state.exercise || String(r.exercise || r.exerciseId || 'Unspecified')===state.exercise);
    const all = buildTrajectorySeries(filtered,{maxStudents:Math.max(5,names.size),maxSessions:8});
    const selected = state.students == null ? all.series.slice(0,5) : all.series.filter(s=>state.students.includes(s.name)).slice(0,5);
    const result = {...all, series:selected};
    const points=selected.flatMap(s=>s.points), scores=points.filter(p=>p.y!=null);
    const average=all.classAverage.filter(p=>p.y!=null).at(-1)?.y;
    const flat=scores.length && scores.every(p=>p.y===scores[0].y);
    const stats=[{key:'score',label:'Class average',value:average == null ? '—' : average+'%',active:state.metric==='score'},
        {key:'scored',label:'Scored',value:scores.length,active:state.metric==='scored'},
        {key:'ungraded',label:'Ungraded',value:points.length-scores.length,active:state.metric==='ungraded'}];
    const option=(v,label,current)=>`<option value="${anAttr(v)}" ${v===current?'selected':''}>${anEsc(label)}</option>`;
    const controls=`<label>Exercise <select data-control="exercise">${option('','All exercises',state.exercise)}${exercises.map(e=>option(e,e,state.exercise)).join('')}</select></label>
        <label>Students <select data-control="students"><option value="auto" ${state.students==null?'selected':''}>Most active 5</option><option value="custom" ${state.students!=null?'selected':''}>Selected students</option></select></label>
        <label>Horizontal axis <select data-control="axis">${option('attempt','Attempt',state.axis)}${option('date','Date',state.axis)}</select></label>
        <label class="an-check"><input type="checkbox" data-control="full" ${state.full?'checked':''} ${state.metric!=='score'?'disabled':''}>Full scale 0–100</label>
        <details data-student-picker><summary>Select students</summary><div class="an-popover">Choose up to five.${all.series.map(s=>`<label><input type="checkbox" data-student="${anAttr(s.name)}" ${selected.includes(s)?'checked':''}>${anEsc(names.get(s.name) || 'Student')}</label>`).join('')}</div></details>
        <div class="seg" role="group" aria-label="Chart style"><button data-mode="bars" aria-pressed="${state.mode==='bars'}">Bars</button><button data-mode="lines" aria-pressed="${state.mode==='lines'}">Lines</button></div>
        <details data-chart-info><summary aria-label="About this chart">ⓘ</summary><div class="an-popover">Latest eight attempts per student. Class average uses available scores across the class at the latest attempt index. Scored and Ungraded count selected students’ attempts. Date view aligns actual submission days. Ungraded attempts are not zero.</div></details>`;
    const rerender=()=>anRenderTrajectory(records);
    const view=anMountChart('an-trajectory-svg',{title:'Student Improvement Trajectory',description:'Compare scores across each student’s latest eight attempts.',stats,controls,
        insight:flat?`All ${selected.length} student${selected.length===1?'':'s'} scored ${scores[0].y}% on every graded attempt`:'',
        caption:'Auto-checker scores are binary checks, not instructor grades.',onMetric:key=>{state.metric=key;rerender();}});
    if(!view)return;
    view.controls.querySelectorAll('[data-control]').forEach(el=>el.onchange=()=>{
        const key=el.dataset.control;
        state[key]=key==='full'?el.checked:key==='students'?(el.value==='auto'?null:selected.map(s=>s.name)):el.value;
        rerender();view.controls.querySelector(`[data-control="${key}"]`)?.focus();
    });
    view.controls.querySelectorAll('[data-mode]').forEach(el=>el.onclick=()=>{state.mode=el.dataset.mode;rerender();view.controls.querySelector(`[data-mode="${state.mode}"]`)?.focus();});
    view.controls.querySelectorAll('[data-student]').forEach(el=>{
        el.disabled=!el.checked && selected.length>=5;
        el.onchange=()=>{state.students=Array.from(view.controls.querySelectorAll('[data-student]:checked')).map(e=>e.dataset.student);const key=el.dataset.student;rerender();view.controls.querySelector('[data-student-picker]').open=true;Array.from(view.controls.querySelectorAll('[data-student]')).find(e=>e.dataset.student===key)?.focus();};
    });
    view.controls.querySelectorAll('details').forEach(el=>el.onkeydown=e=>{if(e.key==='Escape'){el.open=false;el.querySelector('summary').focus();}});
    const palette=anChartPalette();
    view.legend.innerHTML=selected.map((s,i)=>{
        const scored=s.points.filter(p=>p.y!=null),last=scored.at(-1)?.y,delta=last-scored[0]?.y;
        return anLegendChip(names.get(s.name)||'Student',last==null?'Ungraded':`${last}% · ${delta===0?'No change':`${delta>0?'+':''}${delta} pp`}`,palette[i]);
    }).join('')+'<span class="an-legend-chip-static"><span class="an-legend-dot an-ungraded-dot"></span>Not graded yet</span>';
    view.data.innerHTML=`<details><summary>View score data table</summary><div class="an-table-scroll"><table><caption class="sr-only">Scores for selected students. Ungraded is not zero.</caption><thead><tr><th>Student</th><th>Attempt</th><th>Date</th><th>Score</th></tr></thead><tbody>${selected.flatMap(s=>s.points.map(p=>`<tr><td>${anEsc(names.get(s.name)||'Student')}</td><td>${p.x+1}</td><td>${anEsc(p.date)}</td><td>${p.y==null?'Not graded yet':p.y+'%'}</td></tr>`)).join('')}</tbody></table></div></details>`;
    view.plot.setAttribute('aria-description','Use arrow keys to move between values. Ungraded stubs are not zero. Full values are available in the score data table.');
    anChartDraw(view,width=>anDrawTrajectory(view,result,names,state,width,palette));
}

function anDrawTrajectory(view,result,names,state,width,palette) {
    if(!result.series.length){anChartState(view.plot,'empty','No students selected for this period.');return;}
    const dates=[...new Set(result.series.flatMap(s=>s.points.map(p=>p.date)))].sort();
    let series=result.series.map(s=>({...s,points:s.points.map(p=>({...p,attempt:p.x+1,x:state.axis==='date'?dates.indexOf(p.date):p.x}))}));
    const count=state.axis==='date'?dates.length:Math.max(...series.map(s=>s.points.length));
    const labels=Array.from({length:count},(_,i)=>state.axis==='date'?dates[i].slice(5):'Attempt '+(i+1));
    const scoreMode=state.metric==='score';
    if(!scoreMode)series=[{name:state.metric==='scored'?'Scored':'Ungraded',points:Array.from({length:count},(_,x)=>({x,y:series.reduce((n,s)=>n+s.points.filter(p=>p.x===x&&(state.metric==='scored'?p.y!=null:p.y==null)).length,0),date:state.axis==='date'?dates[x]:''}))}];
    // Date view can contain multiple attempts by one student in a day: give each
    // its own slot rather than silently painting over another bar.
    const maxPerDay=scoreMode?Math.max(1,...series.flatMap(s=>dates.map(d=>s.points.filter(p=>p.date===d).length))):1;
    const lanes=state.axis==='date'?maxPerDay:1;
    const barSeries=series.flatMap(s=>Array.from({length:lanes},(_,lane)=>({...s,points:s.points.filter((p,i)=>s.points.slice(0,i).filter(q=>q.x===p.x).length===lane)})));
    const w=Math.max(width,64+count*Math.max(28,barSeries.length*9));
    const values=series.flatMap(s=>s.points.filter(p=>p.y!=null).map(p=>p.y));
    const min=scoreMode&&!state.full?Math.max(0,Math.floor((Math.min(...values,100)-10)/25)*25):0;
    const max=scoreMode?100:Math.max(1,...values);
    const y=linearScale([min,max],[216,16]);
    const ticks=scoreMode?[0,25,50,75,100].filter(n=>n>=min):Array.from(new Set([0,Math.ceil(max/2),max]));
    const slot=(w-64)/Math.max(count,1),x=i=>48+slot*(i+.5);
    const items=[];
    const itemFor=(s,p,color)=>({label:(p.attempt?'Attempt '+p.attempt:'Count')+(p.date?' · '+p.date:''),rows:[{name:names.get(s.name)||s.name,color,value:p.y==null?'Not graded yet (not a zero)':p.y+(scoreMode?'%':' attempts')}]});
    let content=`<defs><pattern id="an-ungraded-stripe" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--muted)"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--muted-foreground)" stroke-width="2"/></pattern></defs>`+anChartGrid(w,ticks,y,scoreMode?'%':'');
    const bars=groupedBarGeometry(barSeries,count,w,{domain:[min,max]});
    const lines=state.mode==='lines' && scoreMode && state.axis==='attempt';
    if(lines){
        series.forEach((s,i)=>{
            const color=palette[i];
            content+=`<path d="${anSplitSegments(s.points).map(seg=>smoothPath(seg,x,y)).join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="${i?`${8-i} ${i+2}`:'none'}"/>`;
            const last=s.points.filter(p=>p.y!=null).at(-1);
            if(last){const ly=24+i*19;content+=`<path d="M ${x(last.x)} ${y(last.y)} L ${w-100} ${ly}" fill="none" stroke="${color}" opacity=".6"/><text x="${w-96}" y="${ly+4}">${i+1}. ${anEsc((names.get(s.name)||s.name).split(' ')[0].slice(0,9))}</text>`;}
        });
    }
    bars.forEach(b=>{
        const s=barSeries[b.student],color=palette[Math.floor(b.student/lanes)%5],p=b.point;
        const item=itemFor(s,p,color),index=items.push(item)-1;
        const attrs=`data-mark="${index}" tabindex="-1" aria-label="${anAttr(item.label+', '+item.rows[0].name+', '+item.rows[0].value)}"`;
        content+=lines&&!b.ungraded?`<circle ${attrs} cx="${x(p.x)}" cy="${y(p.y)}" r="${4+Math.floor(b.student/lanes)}" fill="${color}" fill-opacity=".25" stroke="${color}"/>`:`<path ${attrs} d="${roundedBarPath(b)}" fill="${b.ungraded?'url(#an-ungraded-stripe)':color}"/>`;
    });
    content+=chartTicks(labels,labels.map((_,i)=>x(i))).map(i=>`<text x="${x(i)}" y="236" text-anchor="middle" class="an-axis-label">${anEsc(labels[i])}</text>`).join('');
    view.plot.innerHTML=anChartSvg(w,scoreMode?'Student scores in percent':'Number of '+state.metric+' attempts',content);
    anBindMarks(view.plot,view.card,items);
}
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
                submitBtn.dataset.cooldownSet = '1';
                submitBtn.textContent = '{{ui:Hourglass}} Cooldown Active (' + remainingDays + ' days remaining)';
            }
        }
    }

    if (!cooldownActive) {
        if (cooldownWarning) cooldownWarning.classList.add('hidden');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.dataset.cooldownSet = '1';
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

    // UX Rule 3: hashing + a cloud write take real time — the button must go
    // busy immediately so the tap is answered and cannot be double-submitted.
    const submitBtn = $id('submit-password-request-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.setAttribute('aria-busy', 'true');
        submitBtn.classList.add('is-loading-text');
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
    } finally {
        if (submitBtn) {
            submitBtn.setAttribute('aria-busy', 'false');
            submitBtn.classList.remove('is-loading-text');
            // loadStudentSettings (when reached) already applied the correct
            // cooldown/enabled state; only re-enable if it did not run.
            if (!submitBtn.dataset.cooldownSet) submitBtn.disabled = false;
            delete submitBtn.dataset.cooldownSet;
        }
    }
}


/* ============================================================
   ADMIN: PASSWORD CHANGE HISTORY (Read-Only)
   The read-only history table is rendered by the live
   loadPasswordRequests() in admin-security.js; this module only
   owns the pending recovery-request badge.
   ============================================================ */

// Update pending recovery requests badge on instructor nav
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
        showToast('Please enter your username, email, Student ID, or Student Number.', 'error');
        return;
    }

    await refreshUsers();
    const targetUser = cachedUsers.find(u =>
        (u.username === usernameOrId || u.username === rawInput || u.studentId === rawInput || u.studentNumber === rawInput || u.email === rawInput) &&
        (u.role === 'student' || u.role === 'instructor')
    );

    if (!targetUser) {
        showToast('Account not found. Check your username, email, Student ID, or Student Number.', 'error');
        return;
    }

    if (isDeletedProfile(targetUser)) {
        showToast('That account has been deleted. Contact an administrator if this is unexpected.', 'error');
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
        showToast('Please enter your username, email, Student ID, or Student Number.', 'error');
        return;
    }

    await refreshUsers();
    const targetUser = cachedUsers.find(u =>
        (u.username === lookupVal || u.username === rawLookup || u.studentId === rawLookup || u.studentNumber === rawLookup || u.email === rawLookup) &&
        (u.role === 'student' || u.role === 'instructor')
    );

    if (!targetUser) {
        showToast('Account not found.', 'error');
        return;
    }

    if (isDeletedProfile(targetUser)) {
        showToast('That account has been deleted. Contact an administrator if this is unexpected.', 'error');
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

    if (typeof requireOnline === 'function') {
        const gate = requireOnline();
        if (!gate.ok) { showToast(gate.message, 'error'); return; }
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

    // A student deleted since the request was filed must not be revivable
    // through the recovery flow.
    if (student && isDeletedProfile(student)) {
        showToast('This student account has been deleted. The request can be rejected but not approved.', 'error');
        return;
    }

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
    if (typeof requireOnline === 'function') {
        const gate = requireOnline();
        if (!gate.ok) { showToast(gate.message, 'error'); return; }
    }

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
    if (typeof requireOnline === 'function') {
        const gate = requireOnline();
        if (!gate.ok) { showToast(gate.message, 'error'); return; }
    }

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
        const students = users.filter(u => u.role === 'student' && !isDeletedProfile(u) && (
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
        listEl.setAttribute('aria-busy', 'false');

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
        const listEl = $id('notif-list');
        if (listEl && listEl.getAttribute('aria-busy') === 'true') {
            listEl.setAttribute('aria-busy', 'false');
            listEl.innerHTML = `
                <div class="notif-empty">
                    <div style="font-weight:600; color:var(--text-secondary); margin-bottom:0.25rem;">Notifications are unavailable right now.</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">Your notifications are saved with your account. Try again in a moment.</div>
                </div>`;
        }
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
        // UX Rule 1: the tap must answer immediately with the final layout's
        // shape while the list resolves. Only skeleton an empty list so a
        // refresh never flashes.
        const listEl = $id('notif-list');
        if (listEl && !listEl.childElementCount) {
            listEl.innerHTML = skeletonListItems(3);
            listEl.setAttribute('aria-busy', 'true');
        }
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
    if (typeof requireOnline === 'function') {
        const gate = requireOnline();
        if (!gate.ok) { showToast(gate.message, 'error'); return; }
    }

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
    if (typeof requireOnline === 'function') {
        const gate = requireOnline();
        if (!gate.ok) { showToast(gate.message, 'error'); return; }
    }

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

/* ============================================================
   UNSAVED EDITOR DRAFT — preserved across refresh / PWA update
   ============================================================ */

const EDITOR_DRAFT_KEY = STORAGE_KEYS.EDITOR_DRAFT;

/**
 * Persist unsaved pseudocode editor content to browser-local draft storage.
 * Called before any planned reload (e.g. PWA Update Now) so student work is
 * never silently destroyed. Returns true when a draft was saved.
 */
function maybeSaveEditorDraft() {
    try {
        const editor = $id('pseudocode-editor');
        if (!editor || !editor.value || !editor.value.trim()) return false;
        const active = exerciseState && exerciseState.activeExercise;
        const activeId = active ? (active._docId || active.id || '') : '';
        // The translated Python is derived from this pseudocode but is not
        // re-derived on load, so it travels with the draft. Without it an
        // offline reload would restore the editor and drop the output the
        // student was reading.
        const output = $id('python-output');
        localStorage.setItem(EDITOR_DRAFT_KEY, JSON.stringify({
            exerciseId: activeId,
            text: editor.value,
            python: (output && output.value) ? output.value : '',
            savedAt: new Date().toISOString(),
            // UX Rule 2: the draft belongs to its author. Tagging it keeps
            // sign-out non-destructive (the draft survives) while the restore
            // below still refuses to show one account's work to another.
            user: (typeof currentUser !== 'undefined' && currentUser) ? String(currentUser.username || currentUser.id || '') : ''
        }));
        return true;
    } catch (e) {
        return false;
    }
}

function clearEditorDraft() {
    try { localStorage.removeItem(EDITOR_DRAFT_KEY); } catch (e) { }
}

/**
 * Restore a saved draft if it belongs to the currently active exercise (or to
 * free typing with no active exercise). Restored drafts survive both refreshes
 * and PWA updates.
 */
function maybeRestoreEditorDraft() {
    try {
        const raw = localStorage.getItem(EDITOR_DRAFT_KEY);
        if (!raw) return;
        const draft = JSON.parse(raw);
        const editor = $id('pseudocode-editor');
        if (!editor) return;
        // A draft saved by a named account is only restored for that account:
        // sign-out keeps the draft so unsaved work is never destroyed, but the
        // next person on this device must not see it. Untagged (legacy)
        // drafts keep the old behavior.
        const draftUser = draft.user || '';
        if (draftUser) {
            const sessionUser = (typeof currentUser !== 'undefined' && currentUser) ? String(currentUser.username || currentUser.id || '') : '';
            if (draftUser !== sessionUser) return;
        }
        const active = exerciseState && exerciseState.activeExercise;
        const activeId = active ? (active._docId || active.id || '') : '';
        if (draft.exerciseId && activeId && draft.exerciseId !== activeId) return;
        if (editor.value.trim()) return;
        editor.value = draft.text;
        updateGutter();
        setText('line-count', editor.value.split('\n').length + ' lines');
        // Restore the translated output too, but only when nothing has been
        // generated since load; it is derived from the pseudocode above.
        const output = $id('python-output');
        if (output && draft.python && !output.value.trim()) {
            output.value = draft.python;
        }
        showToast('Unsaved draft restored.', 'info');
    } catch (e) { /* non-critical */ }
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

let currentConsoleErrors = [];

function _consoleEscape(str) {
    const value = String(str == null ? '' : str);
    if (typeof document !== 'undefined' && document.createElement) {
        const div = document.createElement('div');
        div.textContent = value;
        return div.innerHTML;
    }
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    const list = Array.isArray(errors) ? errors : [];
    const hasSemantic = list.some(e => e && e.stage === 'Semantic Analysis');
    const header = hasSemantic
        ? '# {{ui:CircleX}} Compilation Errors Found:'
        : '# {{ui:CircleX}} Syntax Errors Found:';
    let output = '<div style="margin-bottom: 0.5rem; font-family: \'JetBrains Mono\', monospace;"><span class="error-text">' + header + '</span></div>';

    for (const err of list) {
        const lineLabel = (err && err.line) != null ? 'Line ' + err.line + ': ' : '';
        const icon = err && err.severity === 'warning' ? '{{ui:TriangleAlert}}' : '{{ui:CircleX}}';
        let suggestionHtml = '';
        if (err && err.suggestion) {
            suggestionHtml = '<div><span class="suggestion-text">#   {{ui:Lightbulb}} Suggestion: ' + _consoleEscape(err.suggestion) + '</span></div>';
        }
        let detailsHtml = '';
        if (err) {
            const bits = [];
            if (err.stage) bits.push('Stage: ' + _consoleEscape(err.stage));
            if (err.code) bits.push('Code: ' + _consoleEscape(err.code));
            if (err.received) bits.push('Received: ' + _consoleEscape(err.received));
            if (err.expected) bits.push('Expected: ' + _consoleEscape(err.expected));
            if (err.type) bits.push('Type: ' + _consoleEscape(err.type));
            if (bits.length) {
                detailsHtml = '<details class="console-details" style="margin-top:0.25rem"><summary><span class="suggestion-text"># {{ui:Info}} Technical Details</span></summary>' +
                    bits.map(b => '<div style="color: var(--text-muted);"># &nbsp; ' + b + '</div>').join('') + '</details>';
            }
        }
        output += '<div style="margin-bottom: 0.5rem; font-family: \'JetBrains Mono\', monospace;">' +
            '<div><span class="error-text"># ' + icon + ' ' + _consoleEscape(lineLabel + (err ? err.message : '')) + '</span></div>' +
            suggestionHtml + detailsHtml +
            '<div><span style="color: var(--text-muted);">#</span></div></div>';
    }
    output += '<div style="margin-top: 0.5rem; font-family: \'JetBrains Mono\', monospace;"><span class="error-text"># Fix the errors in your pseudocode before translation.</span></div>';
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
        const consoleErrors = typeof currentConsoleErrors === 'undefined' ? [] : currentConsoleErrors;
        const lineNotes = consoleErrors.filter(e => e && e.line === lineNumber).map(e => String(e.message || ''));
        const titleAttr = lineNotes.length ? ' title="' + _consoleEscape(lineNotes.join(' | ')) + '"' : '';
        return `<div class="highlight-line${errorClass}"${titleAttr}>${displayContainer}</div>`;
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
    TYPE: 'type',
    RUNTIME: 'runtime',
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
        case PseudoPyLearning.RESULT_TYPE.TYPE:
        case PseudoPyLearning.RESULT_TYPE.RUNTIME:
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
        case PseudoPyLearning.RESULT_TYPE.TYPE:
            return 'Every value in pseudocode has a data type: INTEGER/REAL numbers, STRING text or BOOLEAN TRUE/FALSE. When an operator or store mixes incompatible types, the program cannot translate into sensible Python. Use DECLARE to fix the type, or convert the value first.';
        case PseudoPyLearning.RESULT_TYPE.RUNTIME:
            return 'The program translated, but failed while running — for example an unhandled input or an operation Python could not do. Runtime problems usually come from values the program received, not from the syntax.';
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
        case PseudoPyLearning.RESULT_TYPE.TYPE: return 'Fix the declared type with DECLARE <name> AS <type>, or convert the value (INT(), FLOAT(), STRING(), BOOL()) before using it.';
        case PseudoPyLearning.RESULT_TYPE.RUNTIME: return 'Trace the program with different inputs and guard operations that could fail.';
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
        case PseudoPyLearning.RESULT_TYPE.TYPE: return 'DECLARE score AS INTEGER\nscore = INT(input)';
        case PseudoPyLearning.RESULT_TYPE.RUNTIME: return 'INPUT n AS INTEGER\nFOR i FROM 1 TO n DO';
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
    const code = String((issue && issue.code) || '');
    let type;
    if (code === 'SEM_TYPE_MISMATCH' || code === 'SEM_INVALID_OPERANDS' || code === 'SEM_CONDITION_NOT_BOOLEAN') {
        type = PseudoPyLearning.RESULT_TYPE.TYPE;
    } else {
        type = classifyCompilerIssue(message);
    }
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
        case PseudoPyLearning.RESULT_TYPE.VARIABLE:
        case PseudoPyLearning.RESULT_TYPE.TYPE:
        case PseudoPyLearning.RESULT_TYPE.RUNTIME: return PseudoPyLearning.GAP_CATEGORY.VARIABLE;
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
   TOUR STEP DEFINITIONS — data only (no DOM, no state, no I/O)
   Each step may declare a `page` (navigation route) containing its
   target, so the tutorial controller can navigate students there
   at runtime. Steps without a page live in the persistent topbar.
   ============================================================ */

const TOUR_STEPS = [
    {
        targetId: 'pseudocode-editor',
        page: 'write-pseudocode',
        icon: 'square-pen',
        title: 'Start in the Editor',
        text: 'Write your pseudocode here in plain English. You can use BEGIN/END, DECLARE, INPUT, SET, IF/ELSE, FOR and WHILE.',
        placement: 'below'
    },
    {
        targetId: 'btn-translate-pseudocode',
        page: 'write-pseudocode',
        icon: 'refresh-cw',
        title: 'Translate to Python',
        text: 'Click this button to convert your pseudocode into real Python code using the built-in translator.',
        placement: 'below'
    },
    {
        targetId: 'python-output',
        page: 'write-pseudocode',
        icon: 'code-2',
        title: 'Read the Python Output',
        text: 'The translated Python appears here. Use the Learning Feedback panel below it to review what you did well and what to improve.',
        placement: 'above'
    },
    {
        targetId: 'btn-run-code',
        page: 'write-pseudocode',
        icon: 'play',
        title: 'Run Your Code',
        text: 'Run the translated Python locally to check that it behaves as you expected.',
        placement: 'above'
    },
    {
        targetId: 'console-output',
        page: 'write-pseudocode',
        icon: 'terminal',
        title: 'See Your Results',
        text: 'Program output, errors and runtime messages appear here — just like a real console.',
        placement: 'above'
    },
    {
        targetId: 'topbar-progress-pill',
        page: '',
        icon: 'trophy',
        title: 'Track Your Progress',
        text: 'Your skill progress and improvement summary live in Settings. From there you can replay this tutorial any time.',
        placement: 'left'
    }
];

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TOUR_STEPS };
}/* ============================================================
   TOUR MODEL — pure step progression (no DOM, no state, no I/O)
   The controller keeps one model instance per tutorial run so all
   boundary/skip logic is testable under Node.
   ============================================================ */

function createTourModel(steps) {
    const list = Array.isArray(steps) ? steps : [];
    let index = 0;

    return {
        get steps() { return list; },
        getIndex() { return index; },
        current() { return list[index] || null; },
        prev() { index = Math.max(0, index - 1); return this.current(); },
        next() { index = Math.min(list.length - 1, index + 1); return this.current(); },
        go(i) {
            const n = Number(i);
            if (Number.isFinite(n) && n >= 0 && n < list.length) index = n;
            return this.current();
        },
        reset() { index = 0; return this.current(); },
        isFirst() { return index === 0; },
        isLast() { return index === list.length - 1; },
        length() { return list.length; }
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createTourModel };
}/* ============================================================
   PSEUDOPY LEARNING LAYER — Beginner Tutorial (Onboarding)
   ------------------------------------------------------------
   A step-by-step guided tour of the Write Pseudocode page for
   students. State is stored under STORAGE_KEYS.TUTORIAL_COMPLETED
   behind a small adapter so a future upgrade can back it with a
   DB ref without changing the UI code.
   ============================================================ */

const ONBOARDING = {
    storageKey: STORAGE_KEYS.TUTORIAL_COMPLETED,
    steps: TOUR_STEPS
};

const tourModel = createTourModel(TOUR_STEPS);

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
    try {
        const key = ONBOARDING.storageKey;
        const userId = (typeof currentUser !== 'undefined' && currentUser) ? (currentUser._docId || currentUser.id) : 'anonymous';
        return onbStorageGet(key + '_' + userId) === 'true';
    } catch (e) { return false; }
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
    overlay.querySelector('.tour-prev').addEventListener('click', () => onbGo(tourModel.getIndex() - 1));
    overlay.querySelector('.tour-next').addEventListener('click', () => {
        if (tourModel.isLast()) onbFinish();
        else onbGo(tourModel.getIndex() + 1);
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
    // Layout can shift if the sidebar/panels collapse mid-tour; reposition when announced.
    document.addEventListener('layoutchange', () => onbReposition());
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

    const step = tourModel.current() || ONBOARDING.steps[onboardingState.current];
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
    const step = tourModel.current() || ONBOARDING.steps[onboardingState.current];
    const target = document.getElementById(step.targetId);
    if (target) onbPositionFor(target);
}

/**
 * Resolve the current step's target element.
 * Policy: (1) immediate hit; (2) navigate to the step's page when a
 * step lives there and the element is not in the DOM yet; (3) bounded
 * retries after the navigation settles.
 */
async function onbResolveTarget(step) {
    let target = document.getElementById(step.targetId);
    if (target) return target;

    if (step.page && (typeof currentPage === 'undefined' || currentPage !== step.page)) {
        try { navigateTo(step.page); } catch (e) { /* navigation must never throw */ }
        await new Promise((r) => {
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => requestAnimationFrame(r));
            } else {
                setTimeout(r, 50);
            }
        });
        target = document.getElementById(step.targetId);
        if (target) return target;
    }

    // Bounded retry — pages render their targets asynchronously (data loads).
    for (let i = 0; i < 4 && !target; i++) {
        await new Promise((r) => setTimeout(r, 250));
        target = document.getElementById(step.targetId);
    }
    return target;
}

async function onbRender() {
    const step = tourModel.current();
    if (!step) { onbStop(); return; }

    const target = await onbResolveTarget(step);
    if (!target) {
        // Missing target policy: skip forward; never block the student.
        console.warn(`[Tour] Step target #${step.targetId} not found; skipping step.`);
        showToast('One of the tutorial steps could not be found and was skipped.', 'info');
        if (!tourModel.isLast()) onbGo(tourModel.getIndex() + 1);
        else onbFinish();
        return;
    }

    const bubble = bubbleEl();

    const iconEl = bubble.querySelector('.tour-bubble-icon');
    iconEl.innerHTML = '';
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', step.icon);
    icon.setAttribute('aria-hidden', 'true');
    iconEl.appendChild(icon);

    bubble.querySelector('.tour-bubble-step').textContent = (tourModel.getIndex() + 1) + ' / ' + ONBOARDING.steps.length;
    bubble.querySelector('.tour-bubble-title').textContent = step.title;
    bubble.querySelector('.tour-bubble-text').textContent = step.text;
    bubble.querySelector('.tour-prev').disabled = tourModel.isFirst();
    const nextBtn = bubble.querySelector('.tour-next');
    nextBtn.textContent = tourModel.isLast() ? 'Finish' : 'Next';

    const dots = bubble.querySelector('.tour-bubble-dots');
    dots.setAttribute('aria-label', 'Step ' + (tourModel.getIndex() + 1) + ' of ' + ONBOARDING.steps.length);
    dots.innerHTML = '';
    ONBOARDING.steps.forEach((_, i) => {
        const dot = document.createElement('span');
        dot.className = 'tour-dot' + (i === tourModel.getIndex() ? ' active' : '');
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
    if (!tourModel.go(index)) onbStop();
    else onbRender();
}

function startBeginnerTutorial() {
    if (onboardingState.active && !overlayEl().classList.contains('hidden')) return;
    onbEnsureOverlay();
    onboardingState.active = true;
    tourModel.reset();
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

function replayBeginnerTutorial() {
    startBeginnerTutorial();
}

function onbStop() {
    const wasActive = onboardingState.active;
    onboardingState.active = false;
    if (wasActive) onbSetCompleted(true);
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
    replay: replayBeginnerTutorial,
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
    try { return currentUser ? (currentUser.instructorId || null) : null; } catch (e) { return null; }
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
        evidenceOrigin: 'student-translation',
        validationIndicator: Math.max(0, 100 - 15 * (t.error || 0) - 5 * (t.warning || 0) - 2 * (t.suggestion || 0)),
        indicatorVersion: 1,
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
    if (typeof currentUser === 'undefined' || !currentUser || currentUser.role !== 'student') return null;
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
    'Type Error': ['logic', 'translation'],
    'Runtime Error': ['logic', 'translation'],
    'Missing Terminator': ['syntax', 'structure']
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
};
/* Student presentation adapter. No compiler execution or database access. */
const StudentLearningModel = (() => {
    function scores(tallies, valid, patterns) {
        const t = tallies || {};
        return {
            compilation: valid ? 100 : 0,
            validation: Math.max(0, 100 - 15 * (t.error || 0) - 5 * (t.warning || 0) - 2 * (t.suggestion || 0)),
            // Pattern detection currently runs only on valid programs. There is no
            // per-construct error attribution, so mastery cannot honestly be scored.
            mastery: null
        };
    }
    function attempt(id, source, result, learning) {
        const tallies = learning && learning.tallies || { error: (result.errors || []).length, warning: (result.warnings || []).length };
        const patterns = learning && learning.patternTypes || [];
        return { id, timestamp: new Date().toISOString(), valid: result.valid, errors: (result.errors || []).length,
            timing: result.metrics && result.metrics.totalTime, tallies, patterns,
            categories: learning && learning.errorCategories || [], ...scores(tallies, result.valid, patterns) };
    }
    function feedback(issue) {
        const message = issue.message || '';
        let category = 'Basics', fix = issue.suggestion || 'Check the highlighted line and compare it with an example.';
        let explanation = message;
        if (/IF|THEN/.test(message)) category = 'Conditions';
        if (/WHILE|FOR|\bDO\b/.test(message)) category = 'Loops';
        if (/variable|DECLARE|identifier/i.test(message)) category = 'Variables';
        if (/INPUT/.test(message)) category = 'Input & Output';
        if (/Unclosed IF/.test(message)) { explanation = 'Your IF block is not closed.'; fix = 'Add END IF after the final statement in this block.'; }
        if (/missing sentinel keyword THEN/.test(message)) { explanation = 'Your IF condition needs THEN.'; fix = 'Write IF condition THEN, then place the instructions on the next line.'; }
        return { line: issue.line, explanation, fix, category };
    }
    function flow(source, result) {
        const lines = source.split('\n'), steps = [];
        function walk(nodes, depth, branch) {
            (nodes || []).forEach(node => {
                if (!node || !node.type) return;
                steps.push({ line: node.line, depth, type: node.type, variable: node.id || node.iterator, label: (branch || '') + (lines[node.line - 1] || node.type).trim() });
                walk(node.body, depth + 1);
                (node.elseIfs || []).forEach(b => { steps.push({ line: b.line, depth: depth + 1, label: 'ELSE IF (alternative branch)' }); walk(b.body, depth + 2); });
                if (node.elseBody) { steps.push({ depth: depth + 1, label: 'ELSE (alternative branch)' }); walk(node.elseBody, depth + 2); }
            });
        }
        walk(result.ast && result.ast.body, 0);
        // Conservative alignment: only show an inferred mapping when both the AST
        // statement and generated Python candidate are unique. Never guess among
        // repeated branches, loop bodies or injected helper statements.
        const pythonLines = (result.python || '').split('\n');
        let helper = false;
        const candidates = pythonLines.map((text, index) => {
            if (/^def _pseudopy_/.test(text)) helper = true;
            else if (helper && text && !/^\s/.test(text)) helper = false;
            return { text: text.trim(), line: index + 1, helper };
        });
        const prefixes = { PrintStatement: 'print(', IfStatement: 'if ', WhileStatement: 'while ', ForStatement: 'for ', ForEachStatement: 'for ', InputStatement: null, AssignmentStatement: null };
        steps.forEach(s => {
            if (!Object.prototype.hasOwnProperty.call(prefixes, s.type)) return;
            const prefix = prefixes[s.type] || (s.variable + ' = ');
            const siblings = steps.filter(other => other.type === s.type && (prefixes[s.type] || other.variable === s.variable));
            const matches = candidates.filter(c => !c.helper && c.text.startsWith(prefix));
            if (siblings.length === 1 && matches.length === 1) { s.pythonLine = matches[0].line; s.python = matches[0].text; }
        });
        const errors = result.errors || [];
        const lexical = errors.some(e => /Unterminated string|Unsupported character/.test(e.message));
        const stages = [ ['source', 'Your pseudocode', 'Input'], ['tokens', 'Identify words & symbols', 'Lexical Analysis'],
            ['structure', 'Program structure', 'AST / Parsing'], ['meaning', 'Check meaning', 'Semantic Analysis'],
            ['validation', 'Check the rules', 'Validation'], ['python', 'Generate Python', 'Code Generation'],
            ['execution', 'Run Python', 'Execution'], ['output', 'Produce output', 'Output'] ];
        return { source, result, steps, tokens: (result.tokens || []).filter(t => !['NEWLINE', 'EOF'].includes(t.type)),
            stages: stages.map(([id, label, technical], i) => ({ id, label, technical,
                status: i >= 6 ? (result.valid ? 'Ready' : 'Not reached') : i === 5 && !result.valid ? 'Not reached' :
                    i === 1 && lexical ? 'Needs Attention' : i === 2 && errors.length ? 'Needs Attention' :
                    i === 4 && !result.valid ? 'Needs Attention' : i === 3 && (result.warnings || []).length ? 'Needs Attention' : 'Completed' })),
            feedback: errors.map(feedback) };
    }
    function kpis(attempts, executions) {
        const timed = attempts.filter(a => Number.isFinite(a.timing));
        return { translations: attempts.length, success: attempts.length ? 100 * attempts.filter(a => a.valid).length / attempts.length : 0,
            runtime: executions.length ? 100 * executions.filter(e => !e.success).length / executions.length : 0,
            average: timed.length ? timed.reduce((n, a) => n + a.timing, 0) / timed.length : 0,
            errors: attempts.reduce((n, a) => n + a.errors, 0), executions: executions.length };
    }
    function history(records, userId) {
        return records.filter(r => r.studentId === userId && !r.seededFrom && !String(r._docId || '').startsWith('ev_seed_') && Number.isFinite(Date.parse(r.timestamp)))
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
            .map(r => ({ id: r._docId, timestamp: r.timestamp, errors: (r.tallies || {}).error || 0, ...scores(r.tallies, r.valid, r.patternTypes) }));
    }
    function trajectory(records) {
        let successes = 0;
        return records.map((r, index) => { if (r.compilation === 100) successes++; return { ...r, cumulative: 100 * successes / (index + 1) }; });
    }
    /* Real-data trend over the most recent few validation scores. Never
       fabricated: fewer than three points reports insufficient history. */
    function trend(points) {
        const values = (points || []).map(p => Number(p.validation)).filter(Number.isFinite);
        if (values.length < 3) return { tone: 'insufficient', attempts: values.length };
        const window = values.slice(-5);
        const mid = Math.floor(window.length / 2);
        const earlier = window.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
        const later = window.slice(mid).reduce((a, b) => a + b, 0) / (window.length - mid);
        const diff = later - earlier;
        return { tone: diff > 4 ? 'improved' : diff < -4 ? 'dipped' : 'stable', attempts: window.length,
            earlier: Math.round(earlier), later: Math.round(later) };
    }
    return { scores, attempt, feedback, flow, kpis, history, trajectory, trend };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = StudentLearningModel;
const StudentGuide = (() => {
    const entries = {
        'Basics': [
            'Wrap your program in BEGIN and END. Instructions go between them.',
            'BEGIN\n    DISPLAY "Hello!"\nEND',
            'print("Hello!")',
            { intro: 'Every program starts with BEGIN, has its instructions in the middle, and ends with END. The translator requires these markers and ignores blank lines.', bullets: ['Keywords are not case-sensitive, but DISPLAY expects a value or text after it.', 'There is no automatic END: blocks only close when you explicitly close them.', 'DECLARE must appear before you SET or use a variable.'] }
        ],
        'Variables': [
            'A variable is a name for a value. DECLARE chooses its type; SET stores a value.',
            'BEGIN\n    DECLARE total AS INTEGER\n    SET total TO 10\n    DISPLAY total\nEND',
            'total = 0\ntotal = 10\nprint(total)',
            { intro: 'Think of DECLARE as reserving a named slot of a fixed type, and SET as storing a value into that slot.', bullets: ['INTEGER fits whole numbers, REAL fits decimals, STRING fits text, BOOLEAN fits TRUE/FALSE.', 'Re-declaring a variable is an error; declare each variable once.', 'A variable must be declared before it is read.'] }
        ],
        'Data Types': [
            'Every value has a type: INTEGER, REAL, STRING or BOOLEAN. Declare the type and the translator checks your values.',
            'BEGIN\n    DECLARE count AS INTEGER\n    DECLARE price AS REAL\n    DECLARE name AS STRING\n    DECLARE passed AS BOOLEAN\n    SET count TO 3\n    SET price TO 9.99\n    SET name TO "Ada"\n    SET passed TO TRUE\n    DISPLAY "Count:", count, " Price:", price\n    DISPLAY "Name:", name, " Passed:", passed\nEND',
            'count = 3\nprice = 9.99\nname = "Ada"\npassed = True\nprint("Count:", count, " Price:", price)\nprint("Name:", name, " Passed:", passed)',
            { intro: 'Declaring a type means the translator can catch mismatches BEFORE the program runs — for example storing text in an INTEGER slot.', bullets: ['INTEGER holds whole numbers (3), REAL holds decimals (9.99), STRING holds text ("Ada"), BOOLEAN holds TRUE or FALSE.', 'Matching every DECLARE to its value is the first thing the translator checks.', 'Convert between types on purpose: INT(), FLOAT(), STR(), BOOL() — do not mix types with +.', 'Because types are checked, an INTEGER variable stays a whole number even after INPUT.'] }
        ],
        'Input & Output': [
            'INPUT asks for a value. DISPLAY shows a result. Declare numeric inputs before reading them.',
            'BEGIN\n    DECLARE age AS INTEGER\n    INPUT age\n    DISPLAY "Age:", age\nEND',
            'age = int(input())\nprint("Age:", age)',
            { intro: 'INPUT reads one value and stores it in the named variable; DISPLAY prints text or a value to the screen.', bullets: ['Declare numeric variables AS INTEGER or AS REAL before INPUT — a later INPUT does not change the type.', 'Separate multiple DISPLAY items with a comma: DISPLAY "Score:", grade', 'Print any text first when combining text and a value: DISPLAY "Age:", age'] }
        ],
        'Conditions': [
            'Start with IF condition THEN. Finish the block with END IF.',
            'BEGIN\n    DECLARE grade AS INTEGER\n    SET grade TO 80\n    IF grade >= 75 THEN\n        DISPLAY "Passed"\n    END IF\nEND',
            'grade = 80\nif grade >= 75:\n    print("Passed")',
            { intro: 'An IF statement chooses between blocks based on a condition. Conditions compare values using comparison operators.', bullets: ['Write IF condition THEN ... END IF. ELSE IF and ELSE are optional but must belong to the matching block.', 'The condition must be a comparison or a boolean (TRUE/FALSE), never an assignment.', 'Nested IFs close innermost-first: each END IF closes the most recent open IF.'] }
        ],
        'Loops': [
            'FOR repeats for a range, including the end value. WHILE repeats while its condition is true. Both need DO and a matching END.',
            'BEGIN\n    FOR i FROM 1 TO 5 DO\n        DISPLAY i\n    END FOR\nEND',
            'for i in range(1, 6):\n    print(i)',
            { intro: 'FOR counts over a range and stops when the counter passes the end value; WHILE repeats while a condition stays true.', bullets: ['FOR i FROM 1 TO n DO ... END FOR includes both 1 and n.', 'Set the step with BY: FOR i FROM 2 TO 10 BY 2 DO', 'Do not rely on the loop variable after the loop; declare your own when you need the final value.'] }
        ],
        'While Loops': [
            'Change the condition inside a WHILE loop so it can eventually stop.',
            'BEGIN\n    DECLARE count AS INTEGER\n    SET count TO 1\n    WHILE count <= 3 DO\n        DISPLAY count\n        SET count TO count + 1\n    END WHILE\nEND',
            'count = 1\nwhile count <= 3:\n    print(count)\n    count = count + 1',
            { intro: 'A WHILE loop checks its condition before each iteration, so the body must change the condition to eventually reach false.', bullets: ['Write WHILE condition DO ... END WHILE.', 'If the condition never changes, the loop runs forever — update your counter inside the body.', 'Check the initial value too: the body may never run at all if the condition starts false.'] }
        ],
        'Comments': [
            'Use # to leave a note. The translator ignores comments. // is a comment only at the beginning of a line.',
            'BEGIN\n    # Explain your next instruction\n    DISPLAY "Hello" # A greeting\nEND',
            '# Explain your next instruction\nprint("Hello") # A greeting',
            { intro: 'Comments explain your code to people. The translator ignores them, so they never affect what runs.', bullets: ['# comments out the rest of the line.', '// is only a comment when the line starts with it (then it works the same as #).', 'Keep comments on their own line or after the instruction; do not split an instruction with a comment.'] }
        ],
        'Common Mistakes': [
            'Match each opening block with its closing instruction. Use THEN after IF and DO after a loop condition.',
            'BEGIN\n    IF 2 > 1 THEN\n        DISPLAY "True"\n    END IF\nEND',
            'if 2 > 1:\n    print("True")',
            { intro: 'Most beginners trip on block structure and ordering. Check these before asking for help.', bullets: ['Every IF needs THEN; every FOR/WHILE needs DO; every opened block needs its matching END.', 'Declare variables near the top, before they are used.', 'The first statement after BEGIN should be an instruction, not another BEGIN.'] }
        ]
    };
    const operators = [ ['+', 'Addition', '2 + 3'], ['-', 'Subtraction', '5 - 2'], ['*', 'Multiplication', '3 * 4'], ['/', 'Division', '7 / 2'], ['//', 'Floor division (DIV)', '7 // 2'], ['%', 'Remainder (MOD)', '7 % 2'], ['**', 'Exponent', '2 ** 3'], ['==', 'Equal to', '2 == 2'], ['!=', 'Not equal to', '2 != 3'], ['<', 'Less than', '2 < 3'], ['<=', 'Less than or equal', '2 <= 3'], ['>', 'Greater than', '3 > 2'], ['>=', 'Greater than or equal', '3 >= 2'], ['AND', 'Both conditions', '2 < 3 AND 3 < 4'], ['OR', 'At least one condition', '2 > 3 OR 3 < 4'], ['NOT', 'Reverse a condition', 'NOT (2 > 3)'] ];
    function tip(text, cursor) {
        const line = text.slice(0, cursor).split('\n').pop().trim();
        if (/^(ELSE\s+)?IF\b/i.test(line) && !/\bTHEN\b/i.test(line)) return 'IF conditions need THEN: IF grade >= 75 THEN';
        if (/^(WHILE|FOR)\b/i.test(line) && !/\bDO\b/i.test(line)) return 'Loops need DO after the condition or range, and a matching END WHILE or END FOR.';
        if (/^INPUT\b/i.test(line)) return 'Reading a number? Declare the variable AS INTEGER or REAL before INPUT.';
        if (/^DISPLAY\b/i.test(line)) return 'Use a comma to display text and a value: DISPLAY "Total:", total';
        return '';
    }
    function insert(text, cursor, example) {
        return text.slice(0, cursor) + (cursor && text[cursor - 1] !== '\n' ? '\n' : '') + example + '\n' + text.slice(cursor);
    }
    return { entries, operators, tip, insert };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = StudentGuide;/* Student-only workspace. Consumes cached compiler results; never invokes devtools.

   The dashboard is a three-tab surface. Workspace holds everything the
   student already had (editor, Python output, console, Translate/Run/Submit),
   and the two learning surfaces that used to sit far below the fold are now
   reachable in one tap: "How Your Algorithm Works" and "Session Insights".

   The tab shell is built ONCE per route and then left alone. Only the panel
   contents are re-rendered, so the selection, the scroll position and the
   editor nodes all survive a component update. */
const StudentWorkspace = (() => {
    let owner = '', generation = 0, unsubscribe = null, attempts = [], executions = [], latest = null;
    let history = [], historyStatus = '', historyMode = false, selected = 'source', step = -1;
    let activePage = '', serial = 0, sessionEpoch = 0;
    const visible = new Set(['compilation', 'validation', 'cumulative']);
    const guideState = { mode: 'beginner', category: 'Basics' };
    const TABS = [
        { id: 'workspace', label: 'Workspace' },
        { id: 'flow', label: 'How Your Algorithm Works' },
        { id: 'insights', label: 'Session Insights' },
    ];
    const TAB_STORAGE_PREFIX = 'pseudopy.studentTab.';
    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const userId = () => typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'student' ? String(currentUser._docId || currentUser.id || '') : '';
    const element = id => document.getElementById(id);

    /** Selection is per student and per route, and survives reloads. */
    function tabStorageKey() { return TAB_STORAGE_PREFIX + (owner || 'anon') + '.' + (activePage || 'preview'); }
    function readStoredTab() {
        try {
            const value = sessionStorage.getItem(tabStorageKey());
            return TABS.some(t => t.id === value) ? value : null;
        } catch (e) { return null; }
    }
    function storeTab(id) {
        try { sessionStorage.setItem(tabStorageKey(), id); } catch (e) { /* private browsing */ }
    }

    function reset() {
        sessionEpoch++;
        generation++; if (unsubscribe) unsubscribe(); unsubscribe = null;
        owner = ''; attempts = []; executions = []; latest = null; history = []; historyStatus = ''; activePage = ''; step = -1; historyMode = false;
        // Panels are torn down with their route, never detached from it: the
        // workspace panel owns the live editor, so removing it would take the
        // student's text with it.
        document.querySelectorAll('.sw-tabs, .student-workspace').forEach(el => el.remove());
        document.querySelectorAll('[data-student-guide]').forEach(el => { el.dataset.owner = ''; });
        document.querySelectorAll('.sg-context').forEach(el => { el.hidden = true; });
    }

    /**
     * Build the tab shell for a route and move the page's existing content
     * into the Workspace panel. Moving real nodes (rather than re-creating
     * them) is what keeps every inline HTML handler, the draft restore and the
     * console wired up exactly as before.
     */
    function buildShell(root) {
        if (root.querySelector(':scope > .student-workspace')) return root.querySelector(':scope > .student-workspace');
        const shell = document.createElement('div');
        shell.className = 'student-workspace';
        shell.dataset.swShell = 'true';

        const tablist = document.createElement('div');
        tablist.className = 'sw-tabs';
        tablist.setAttribute('role', 'tablist');
        tablist.setAttribute('aria-label', 'Student dashboard sections');
        TABS.forEach(t => {
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.className = 'sw-tab';
            tab.id = 'sw-tab-' + t.id;
            tab.textContent = t.label;
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-controls', 'sw-panel-' + t.id);
            tab.tabIndex = -1;
            tablist.appendChild(tab);
        });

        const panels = document.createElement('div');
        panels.className = 'sw-panels';
        TABS.forEach(t => {
            const panel = document.createElement('div');
            panel.className = 'sw-panel sw-panel-' + t.id;
            panel.id = 'sw-panel-' + t.id;
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-labelledby', 'sw-tab-' + t.id);
            panel.tabIndex = 0;
            panel.hidden = true;
            panels.appendChild(panel);
        });

        // Everything already rendered into this page becomes the Workspace
        // panel's content; the learning panels start empty and are filled by
        // render().
        const workspacePanel = panels.querySelector('#sw-panel-workspace');
        Array.from(root.children).forEach(child => {
            if (child !== shell) workspacePanel.appendChild(child);
        });

        shell.appendChild(tablist);
        shell.appendChild(panels);
        root.insertBefore(shell, root.firstChild);

        bindTabs(shell);
        return shell;
    }

    /**
     * Roving-tabindex keyboard support. Arrow keys and Home/End move between
     * tabs; selection follows focus, so a keyboard user never has to reach for
     * a second key press to see the panel they navigated to.
     */
    function bindTabs(shell) {
        const tablist = shell.querySelector('.sw-tabs');
        if (!tablist || tablist.dataset.swBound === 'true') return;
        tablist.dataset.swBound = 'true';
        const select = (id, focus) => selectTab(shell, id, { focus: focus });
        tablist.addEventListener('click', event => {
            const tab = event.target.closest('[role="tab"]');
            if (tab && tab.parentNode === tablist) select(tab.id.replace('sw-tab-', ''), true);
        });
        tablist.addEventListener('keydown', event => {
            const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
            const current = tabs.indexOf(document.activeElement);
            if (current === -1) return;
            let next = -1;
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % tabs.length;
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + tabs.length) % tabs.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = tabs.length - 1;
            if (next === -1) return;
            event.preventDefault();
            select(tabs[next].id.replace('sw-tab-', ''), true);
        });
    }

    /**
     * Switch panels. Returns the id that is now visible. Charts measure
     * themselves lazily, so an Insights panel that was hidden has a zero-width
     * plot: it must be redrawn once it is actually on screen.
     */
    function selectTab(shell, id, options) {
        const target = TABS.some(t => t.id === id) ? id : 'workspace';
        shell.querySelectorAll('[role="tab"]').forEach(tab => {
            const active = tab.id === 'sw-tab-' + target;
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
            if (active && options && options.focus) tab.focus();
        });
        shell.querySelectorAll('[role="tabpanel"]').forEach(panel => {
            panel.hidden = panel.id !== 'sw-panel-' + target;
        });
        storeTab(target);
        if (target === 'insights') scheduleChartRedraw(shell);
        if (typeof refreshIcons === 'function') refreshIcons(shell);
        return target;
    }

    /** Redraw after layout has settled, so no chart is measured at zero width. */
    function scheduleChartRedraw(shell) {
        const plot = shell.querySelector('#sw-panel-insights .an-chart-plot') || shell.querySelector('#sw-panel-insights [id^="student-progress"]');
        if (!plot) return;
        const draw = () => {
            if (plot.isConnected && plot.clientWidth > 0 && typeof anChartRedraw === 'function') anChartRedraw(plot);
        };
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => requestAnimationFrame(draw));
        } else {
            setTimeout(draw, 0);
        }
    }

    function activate(page) {
        const id = userId();
        if (id !== owner) { reset(); owner = id; }
        generation++; if (unsubscribe) unsubscribe(); unsubscribe = null;
        activePage = page;
        if (!id || !['write-pseudocode', 'translate'].includes(page)) return;
        const root = element('page-' + page); if (!root) return;
        const editorId = page === 'translate' ? 'translate-input' : 'pseudocode-editor';
        setupGuide(root, editorId);
        const workspace = buildShell(root);
        if (workspace) {
            const restored = readStoredTab() || 'workspace';
            selectTab(workspace, restored, { focus: false });
        }
        render(); loadHistory();
    }
    function setupGuide(root, editorId) {
        const guide = root.querySelector('.operator-guide'), editor = element(editorId);
        if (!guide || !editor) return;
        if (guide.dataset.owner === owner) return;
        guide.dataset.studentGuide = 'true'; guide.dataset.owner = owner;
        const key = 'pseudopy_quick_guide_' + owner;
        const modeKey = (typeof STORAGE_KEYS !== 'undefined' && STORAGE_KEYS.GUIDE_MODE) || 'pseudopy_guide_mode';
        let open = true;
        try { open = localStorage.getItem(key) !== 'closed'; } catch (_) { /* private browsing */ }
        guideState.mode = 'beginner';
        try { const m = localStorage.getItem(modeKey); if (m === 'beginner' || m === 'advanced') guideState.mode = m; } catch (_) { /* private browsing */ }
        guideState.category = 'Basics';
        guide.open = open;
        guide.innerHTML = '<summary>Pseudocode Quick Guide</summary><div class="sg-toolbar"><p class="sg-intro">Need help? Explore the syntax and examples while you write.</p><div class="seg" role="group" aria-label="Presentation mode"><button type="button" data-mode="beginner" aria-pressed="' + (guideState.mode === 'beginner') + '">Beginner</button><button type="button" data-mode="advanced" aria-pressed="' + (guideState.mode === 'advanced') + '">Advanced</button></div></div><div class="sg-cats" aria-label="Guide categories"></div><div class="sg-content"></div><p class="sg-tip" aria-live="polite"></p>';
        guide.ontoggle = () => { try { localStorage.setItem(key, guide.open ? 'open' : 'closed'); } catch (_) {} };
        const cats = guide.querySelector('.sg-cats'), content = guide.querySelector('.sg-content');
        let contextTip = root.querySelector('.sg-context');
        if (!contextTip) {
            contextTip = document.createElement('div'); contextTip.className = 'sg-context'; contextTip.hidden = true;
            contextTip.innerHTML = '<span aria-live="polite"></span><button type="button" aria-label="Dismiss contextual tip">Dismiss</button>';
            editor.parentElement.insertAdjacentElement('afterend', contextTip);
            contextTip.querySelector('button').onclick = () => { contextTip.hidden = true; };
        }
        function modeDetails(adv) {
            if (!adv) return '';
            return '<details class="sg-advanced" open><summary>Advanced: exact rules the compiler applies</summary><p class="sg-expl">' + esc(adv.intro) + '</p>' + (adv.bullets && adv.bullets.length ? '<ul class="sg-adv-list">' + adv.bullets.map(b => '<li>' + esc(b) + '</li>').join('') + '</ul>' : '') + '</details>';
        }
        function show(name) {
            guideState.category = name;
            cats.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.textContent === name)));
            if (name === 'Operators') {
                let html = '<p class="sg-expl">Select an operator for a working example. Python uses lowercase and, or, not.</p><div class="sg-operators">' + StudentGuide.operators.map((o, i) => '<button type="button" data-op="' + i + '"><strong>' + esc(o[0]) + '</strong> ' + esc(o[1]) + '<code>' + esc(o[2]) + '</code></button>').join('') + '</div>';
                if (guideState.mode === 'advanced') html += '<details class="sg-advanced" open><summary>Advanced: operator precedence and mapping</summary><p class="sg-expl">Precedence mirrors Python: ** first, then * / // %, then + -, then comparisons, then NOT, then AND, then OR.</p><ul class="sg-adv-list"><li>** binds tightest. ^ is bitwise XOR at + precedence, not exponentiation.</li><li>// is floor division (DIV) and % is remainder (MOD) on integers.</li><li>AND / OR short-circuit exactly like Python and, or.</li></ul></details>';
                content.innerHTML = html + '<div class="sg-op-example"></div>';
                content.querySelectorAll('[data-op]').forEach(b => b.onclick = () => {
                    const o = StudentGuide.operators[Number(b.dataset.op)];
                    const target = content.querySelector('.sg-op-example');
                    target.innerHTML = '<figure class="sg-code"><figcaption><h4>Pseudocode</h4></figcaption><pre>' + esc('DISPLAY ' + o[2]) + '</pre></figure><figure class="sg-code"><figcaption><h4>Python equivalent</h4></figcaption><pre>' + esc('print(' + o[2].replace(/AND|OR|NOT/g, s => s.toLowerCase()) + ')') + '</pre></figure><button type="button" class="sg-insert"><i data-lucide="code-2" aria-hidden="true"></i> Insert Example</button>';
                    const insert = target.querySelector('.sg-insert');
                    if (insert) insert.onclick = () => insertExample('BEGIN\n    DISPLAY ' + o[2] + '\nEND');
                    refreshIcons(target);
                });
                return;
            }
            const item = StudentGuide.entries[name];
            const adv = item && item[3];
            content.innerHTML = '<h3>' + esc(name) + '</h3><p class="sg-expl">' + esc(item[0]) + '</p><div class="sg-comparison"><figure class="sg-code"><figcaption><h4>Pseudocode</h4><button type="button" class="sg-insert"><i data-lucide="code-2" aria-hidden="true"></i> Insert Example</button></figcaption><pre>' + esc(item[1]) + '</pre></figure><figure class="sg-code"><figcaption><h4>Python equivalent (simplified)</h4></figcaption><pre>' + esc(item[2]) + '</pre></figure></div>' + (guideState.mode === 'advanced' ? modeDetails(adv) : '');
            const insert = content.querySelector('.sg-insert');
            if (insert) insert.onclick = () => insertExample(item[1]);
            refreshIcons(content);
        }
        function insertExample(example) {
            // Insert only; never replace the selection or the rest of the student's work.
            const cursor = editor.selectionStart || 0;
            const snippet = editor.value.trim() ? example.split('\n').slice(1, -1).join('\n').replace(/^    /gm, '') : example;
            const next = StudentGuide.insert(editor.value, cursor, snippet);
            const inserted = next.slice(cursor, next.length - (editor.value.length - cursor));
            editor.setRangeText(inserted, cursor, cursor, 'end');
            editor.focus();
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        }
        [...Object.keys(StudentGuide.entries), 'Operators'].forEach(name => {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'sg-chip'; b.textContent = name; b.setAttribute('aria-pressed', String(name === guideState.category)); b.onclick = () => show(name); cats.appendChild(b);
        });
        const modeButtons = guide.querySelectorAll('.seg [data-mode]');
        modeButtons.forEach(b => b.onclick = () => {
            guideState.mode = (b.dataset.mode === 'advanced') ? 'advanced' : 'beginner';
            modeButtons.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
            try { localStorage.setItem(modeKey, guideState.mode); } catch (_) { /* private browsing */ }
            show(guideState.category);
        });
        guide.showCategory = name => { guide.open = true; show(StudentGuide.entries[name] ? name : 'Basics'); guide.scrollIntoView({ block: 'nearest' }); };
        if (!editor.dataset.studentInputBound) {
            editor.dataset.studentInputBound = 'true';
            let timer;
            editor.addEventListener('input', () => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    const target = root.querySelector('.sg-context');
                    if (target && userId()) { const tip = StudentGuide.tip(editor.value, editor.selectionStart); target.querySelector('span').textContent = tip; target.hidden = !tip; }
                    if (latest && latest.editorId === editorId && latest.source !== editor.value) { latest.stale = true; render(); }
                }, 450);
            });
        }
        show(guideState.category);
    }
    function translated(editorId, source, result, learning) {
        if (!userId() || !['pseudocode-editor', 'translate-input'].includes(editorId)) return;
        if (owner !== userId()) { reset(); owner = userId(); }
        const point = StudentLearningModel.attempt(owner + ':' + (++serial), source, result, learning);
        attempts.push(point);
        latest = { ...StudentLearningModel.flow(source, result), editorId, id: point.id, stale: false, runtime: null };
        step = -1; selected = result.valid ? 'structure' : 'validation'; render();
        if (!result.valid) {
            // Surface the problems rather than leaving them on a hidden tab.
            const root = element('page-' + activePage);
            const shell = root && root.querySelector(':scope > .student-workspace');
            if (shell) selectTab(shell, 'flow', { focus: false });
        }
    }
    function beginRun(outputId, code) {
        if (!userId() || !['console-output', 'translate-console', 'execute-console'].includes(outputId)) return null;
        const token = { owner: userId(), epoch: sessionEpoch, id: ++serial, attemptId: latest && latest.result.valid && latest.result.python === code && !latest.stale ? latest.id : null, done: false };
        if (latest && token.attemptId === latest.id) latest.runtime = { status: 'Processing', output: '' };
        render(); return token;
    }
    function endRun(token, success, output) {
        if (!token || token.done || token.epoch !== sessionEpoch || token.owner !== userId() || token.owner !== owner) return;
        token.done = true; executions.push({ success, id: token.id });
        if (latest && token.attemptId === latest.id) latest.runtime = { status: success ? 'Completed' : 'Error', output };
        render();
    }
    function elementFocusKey(root) {
        const el = typeof document !== 'undefined' ? document.activeElement : null;
        if (!el || !el.getAttribute || !root.contains(el)) return null;
        for (const attr of ['data-stage', 'data-step', 'data-history', 'data-info', 'data-point', 'data-series', 'data-legend']) {
            const value = el.getAttribute(attr);
            if (value != null) return attr + '=' + value;
        }
        if (el.tagName === 'SUMMARY') return 'summary=' + el.textContent.trim();
        return null;
    }
    function restoreFocus(root, key) {
        if (!key) return;
        const split = key.indexOf('=');
        const attr = key.slice(0, split), value = key.slice(split + 1);
        if (attr === 'summary') {
            root.querySelectorAll('details summary').forEach(s => { if (s.textContent.trim() === value) s.focus(); });
            return;
        }
        const el = root.querySelector('[' + attr + '="' + value + '"]');
        if (el) el.focus();
    }
    /**
     * Refresh the two learning panels. The shell, the tab state and the
     * workspace panel (which owns the live editor) are never touched here, so
     * an update cannot move the student out of the tab they are reading.
     */
    function render() {
        if (!owner || owner !== userId()) return;
        const root = element('page-' + activePage), target = root && root.querySelector(':scope > .student-workspace'); if (!target) return;
        const scrollY = (typeof window !== 'undefined' && window.scrollY) || 0;
        const focusKey = elementFocusKey(target);

        const flowPanel = target.querySelector('#sw-panel-flow');
        const insightsPanel = target.querySelector('#sw-panel-insights');
        if (!flowPanel || !insightsPanel) return;

        const openSummaries = new Set();
        [flowPanel, insightsPanel].forEach(panel => {
            panel.querySelectorAll('details[open]').forEach(d => { const s = d.querySelector('summary'); if (s) openSummaries.add(s.textContent.trim()); });
        });

        // The flow panel keeps the same structure the accordion had, so no
        // content is duplicated and nothing is lost by the move into a tab.
        flowPanel.innerHTML = '<div class="sw-flow-body"></div>';
        insightsPanel.innerHTML = '<p>Live session: this signed-in browser session only. Metrics update after translating or running code.</p><div class="sw-kpis"></div><details class="sw-glossary"><summary>What do these numbers mean?</summary><p class="sw-learning"></p></details><div class="sw-chart an-chart-card"></div>';

        renderFlow(flowPanel.querySelector('.sw-flow-body'), root);
        const k = StudentLearningModel.kpis(attempts, executions);
        insightsPanel.querySelector('.sw-kpis').innerHTML = [ ['Total Translations', k.translations], ['Compilation Success Rate', k.success.toFixed(1) + '%'], ['Runtime Error Rate', k.runtime.toFixed(1) + '%'], ['Average Generation Time', k.average.toFixed(2) + ' ms'], ['Total Errors', k.errors], ['Total Executions', k.executions] ].map(([label, value]) => '<div><strong>' + value + '</strong><span>' + label + '</span></div>').join('');
        const patterns = [...new Set(attempts.flatMap(a => a.patterns))];
        insightsPanel.querySelector('.sw-learning').textContent = 'Successful attempts: ' + attempts.filter(a => a.valid).length + '. Attempts with syntax/structure issues: ' + attempts.filter(a => a.categories.some(c => /syntax|structure/i.test(c))).length + '. Attempts with detected logic issues: ' + attempts.filter(a => a.categories.some(c => /logic/i.test(c))).length + '. Distinct patterns practiced: ' + patterns.length + ' (' + (patterns.join(', ') || 'none yet') + '). Generation time includes the complete translation pipeline. Total Errors counts compilation issues; runtime failures are shown separately.';
        renderChart(insightsPanel.querySelector('.sw-chart'));
        [flowPanel, insightsPanel].forEach(panel => {
            panel.querySelectorAll('details').forEach(d => { const s = d.querySelector('summary'); if (s && openSummaries.has(s.textContent.trim())) d.open = true; });
        });
        restoreFocus(target, focusKey);
        if ((typeof window !== 'undefined' && window.scrollTo) && ((window.scrollY || 0) !== scrollY)) window.scrollTo(window.scrollX || 0, scrollY);
        // A chart rendered into a hidden panel has no width yet.
        if (!insightsPanel.hidden) scheduleChartRedraw(target);
    }
    function renderFlow(container, root) {
        if (!latest) { container.textContent = 'Translate your pseudocode to explore what PseudoPy understood.'; return; }
        container.innerHTML = (latest.stale ? '<p role="status">Editor changed. This is the previous translation; translate again to refresh it.</p>' : '') + '<div class="sw-stages">' + latest.stages.map(s => {
            const status = ['execution', 'output'].includes(s.id) && latest.runtime ? latest.runtime.status : s.status;
            return '<button type="button" data-stage="' + s.id + '" aria-pressed="' + (selected === s.id) + '"><strong>' + esc(s.label) + '</strong><small>' + esc(s.technical) + '</small><span>' + (status === 'Completed' ? '✓ ' : status === 'Needs Attention' || status === 'Error' ? '! ' : '— ') + status + '</span></button>';
        }).join('') + '</div><div class="sw-stage-content"></div><div class="sg-tabs"><button type="button" data-step="start">Step Through Algorithm</button><button type="button" data-step="previous">Previous</button><button type="button" data-step="next">Next</button></div><p class="sw-step" aria-live="polite"></p><details><summary>View technical details</summary><p>Only compiler results from your current algorithm are included.</p><pre>' + esc(JSON.stringify({ tokens: latest.result.tokens, ast: latest.result.ast, semanticWarnings: latest.result.warnings }, null, 2)) + '</pre></details>';
        const body = container.querySelector('.sw-stage-content');
        if (selected === 'tokens') body.innerHTML = '<p title="Keywords are reserved instructions. Identifiers are variable names.">Keyword: a reserved instruction. Identifier: a variable name.</p><div class="sw-tokens">' + latest.tokens.map(t => '<span>Line ' + t.line + ': <code>' + esc(t.value) + '</code> <small>' + esc(t.type) + '</small></span>').join('') + '</div>';
        else if (selected === 'structure') body.innerHTML = '<p>Program Structure (AST): indentation shows nesting and alternative branches.</p><ul class="sw-tree">' + latest.steps.map(s => '<li style="margin-inline-start:' + Math.min(s.depth, 12) + 'em">' + esc(s.label) + '</li>').join('') + '</ul>';
        else if (selected === 'validation' || selected === 'meaning') {
            const issues = selected === 'meaning' ? (latest.result.warnings || []).map(StudentLearningModel.feedback) : latest.feedback;
            body.innerHTML = issues.length ? issues.map(i => '<div class="sw-issue"><strong>Line ' + i.line + ': ' + esc(i.explanation) + '</strong><p>Fix: ' + esc(i.fix) + '</p><button type="button" data-example="' + esc(i.category) + '">Show Example</button></div>').join('') : '<p>No issues reported at this stage. This does not prove the algorithm solves the intended problem.</p>';
            body.querySelectorAll('[data-example]').forEach(b => b.onclick = () => {
                // The example lives in the Workspace tab's quick guide, so the
                // student is taken there instead of being sent to a hidden one.
                const root = element('page-' + activePage);
                const shell = root && root.querySelector(':scope > .student-workspace');
                if (shell) selectTab(shell, 'workspace', { focus: false });
                root.querySelector('.operator-guide').showCategory(b.dataset.example);
            });
        } else body.innerHTML = '<pre>' + esc(selected === 'python' ? latest.result.python || 'Python generation was not reached.' : ['execution', 'output'].includes(selected) ? latest.runtime?.output || 'Run the generated Python to see actual output. The structural preview does not execute code.' : latest.source) + '</pre>';
        if (selected === 'python') {
            body.innerHTML += '<h4>Pseudocode to Python mapping</h4><p>Unique statement matches from this translation. Ambiguous line matches are omitted.</p>' + latest.steps.filter(s => s.pythonLine).map(s => '<div class="sg-comparison"><pre>Line ' + s.line + ': ' + esc(s.label) + '</pre><pre>Python line ' + s.pythonLine + ': ' + esc(s.python) + '</pre></div>').join('');
        }
        container.querySelectorAll('[data-stage]').forEach(b => b.onclick = () => { selected = b.dataset.stage; render(); root.querySelector('[data-stage="' + selected + '"]')?.focus(); });
        container.querySelectorAll('[data-step]').forEach(b => b.onclick = () => {
            if (latest.stale || !latest.result.valid || !latest.steps.length || element(latest.editorId)?.value !== latest.source) return;
            step = b.dataset.step === 'start' ? 0 : Math.max(0, Math.min(latest.steps.length - 1, step + (b.dataset.step === 'next' ? 1 : -1)));
            const s = latest.steps[step];
            container.querySelector('.sw-step').textContent = 'Structure preview ' + (step + 1) + '/' + latest.steps.length + ': ' + s.label + (s.pythonLine ? ' → Python line ' + s.pythonLine + ': ' + s.python : '') + '. Both branches are shown; this is not a runtime execution trace.';
            const editor = element(latest.editorId);
            if (s.line && editor) {
                const start = latest.source.split('\n').slice(0, s.line - 1).join('\n').length + (s.line > 1 ? 1 : 0);
                editor.setSelectionRange(start, start + (latest.source.split('\n')[s.line - 1] || '').length);
                editor.scrollTop = Math.max(0, (s.line - 3) * (parseFloat(getComputedStyle(editor).lineHeight) || 22));
            }
            const python = element(latest.editorId === 'pseudocode-editor' ? 'python-output' : 'translate-output');
            if (s.pythonLine && python && python.value === latest.result.python && typeof python.setSelectionRange === 'function') {
                const lines = python.value.split('\n');
                const start = lines.slice(0, s.pythonLine - 1).join('\n').length + (s.pythonLine > 1 ? 1 : 0);
                python.setSelectionRange(start, start + lines[s.pythonLine - 1].length);
                python.scrollTop = Math.max(0, (s.pythonLine - 3) * (parseFloat(getComputedStyle(python).lineHeight) || 22));
            }
        });
    }
    function trendSummary(data) {
        const t = StudentLearningModel.trend(data);
        return t.tone === 'insufficient' ? 'Complete more translations to see your progress trend.'
            : t.tone === 'improved' ? 'Your validation score improved across your last ' + t.attempts + ' attempts.'
            : t.tone === 'dipped' ? 'Your validation score dipped across your last ' + t.attempts + ' attempts.'
            : 'Your performance is currently stable.';
    }
    function bindHistoryMode(card) {
        card.querySelectorAll('[data-history]').forEach(b => b.onclick = () => { historyMode = b.dataset.history === 'true'; render(); });
    }
    function renderChart(card) {
        const all=StudentLearningModel.trajectory(historyMode?history:attempts);
        // Compute cumulative success before trimming; the displayed history cap
        // must never change the denominator of the student's cumulative score.
        const offset=Math.max(0,all.length-60),data=all.slice(offset);
        const series=[['compilation','Compilation Success','var(--chart-1)'],['validation','Validation Indicator','var(--chart-5)'],['cumulative','Cumulative Success Rate','var(--chart-2)']];
        const units=n=>Math.round(Number(n)*10)/10;
        const focusKey=elementFocusKey(card);
        const id='student-progress-'+(activePage || 'preview');
        if(!card.querySelector('.an-chart-plot')){delete card.dataset.chartMounted;card.innerHTML='<div id="'+id+'"></div>';}
        const controls='<div class="seg" role="group" aria-label="Source of chart data"><button data-history="false" aria-pressed="'+!historyMode+'">Live Session</button><button data-history="true" aria-pressed="'+historyMode+'">Learning History</button></div>'+
            '<details data-chart-info><summary aria-label="How is this calculated?">ⓘ</summary><div class="an-popover">Validation indicator = max(0, 100 − 15 × errors − 5 × warnings − 2 × suggestions). A heuristic for feedback, not a grade. Cumulative success includes all attempts. Complete more exercises to unlock concept mastery insights.</div></details>';
        const view=anMountChart(id,{title:'Your Learning Progress',description:historyMode?'Saved translation evidence from your account.':'Based on your latest translation attempts.',
            stats:[{label:'Attempts',value:all.length},{label:'Latest success',value:all.length?units(all.at(-1).cumulative)+'%':'—'}],controls,
            insight:historyMode?historyStatus:offset?'Showing the latest 60 attempts.':'',caption:trendSummary(data)+' Indicators are not instructor grades.'});
        if(!view)return;
        view.legend.innerHTML=series.map(([key,label,color])=>'<button class="an-legend-chip" data-series="'+key+'" aria-pressed="'+visible.has(key)+'"><span class="an-legend-dot" style="background:'+color+'"></span>'+label+'</button>').join('');
        view.legend.querySelectorAll('[data-series]').forEach(b=>b.onclick=()=>{const key=b.dataset.series;if(visible.has(key)&&visible.size===1)return;visible.has(key)?visible.delete(key):visible.add(key);renderChart(card);card.querySelector('[data-series="'+key+'"]').focus();});
        bindHistoryMode(card);
        const info=card.querySelector('[data-chart-info]');info.onkeydown=e=>{if(e.key==='Escape'){info.open=false;info.querySelector('summary').focus();}};
        view.data.innerHTML='<details><summary>View chart data as a table</summary><div class="an-table-scroll"><table><thead><tr><th scope="col">Attempt</th><th scope="col">Compilation %</th><th scope="col">Validation %</th><th scope="col">Cumulative %</th><th scope="col">Errors</th></tr></thead><tbody>'+data.map((p,i)=>'<tr><td>'+(offset+i+1)+'</td><td>'+p.compilation+'</td><td>'+p.validation+'</td><td>'+units(p.cumulative)+'</td><td>'+p.errors+'</td></tr>').join('')+'</tbody></table></div></details>';
        anChartDraw(view,width=>{
            if(!data.length){anChartState(view.plot,historyMode&&/Loading/.test(historyStatus)?'loading':'empty',historyMode?'No saved translation evidence yet.':'Complete your first translation to begin.');return;}
            const x=i=>48+(data.length===1?(width-80)/2:i*(width-80)/(data.length-1)),y=linearScale([0,100],[216,16]);
            const labels=data.map((_,i)=>String(offset+i+1));
            let content=anChartGrid(width,[0,25,50,75,100],y,'%');
            content+=chartTicks(labels,data.map((_,i)=>x(i))).map(i=>'<text class="an-axis-label" x="'+x(i)+'" y="236" text-anchor="middle">'+labels[i]+'</text>').join('');
            const items=[];
            series.forEach(([key,label,color],rank)=>{
                if(!visible.has(key))return;
                const line=data.map((p,i)=>(i?'L':'M')+' '+x(i)+' '+y(p[key])).join(' ');
                content+='<path d="'+line+'" fill="none" stroke="'+color+'" stroke-width="2" stroke-dasharray="'+(rank?'5 4':'none')+'"/>';
                data.forEach((p,i)=>{const n=items.push({label:'Attempt '+(offset+i+1),rows:series.filter(([k])=>visible.has(k)).map(([k,name,c])=>({name,color:c,value:units(p[k])+'%'}))})-1;
                    content+='<circle data-mark="'+n+'" tabindex="-1" aria-label="Attempt '+(offset+i+1)+', '+label+': '+units(p[key])+' percent" cx="'+x(i)+'" cy="'+y(p[key])+'" r="4" fill="'+color+'"/>';});
            });
            view.plot.innerHTML=anChartSvg(width,'Learning progress by translation attempt',content);anBindMarks(view.plot,card,items);
        });
        restoreFocus(card,focusKey);
    }
    function loadHistory() {
        const id = owner, ticket = generation;
        const accept = records => { if (ticket !== generation || id !== userId()) return; history = StudentLearningModel.history(records, id); historyStatus = ''; render(); };
        historyStatus = 'Loading saved evidence…';
        // Query on the existing centralized Firebase instance, never all students.
        try { if (typeof firestoreReady === 'function' && firestoreReady()) {
            unsubscribe = firestore.collection(evidenceRef).where('studentId', '==', id).onSnapshot(snapshot => accept(snapshot.docs.map(d => ({ ...d.data(), _docId: d.id }))), () => { if (ticket === generation) { historyStatus = 'Saved history is unavailable. Live session tracking still works.'; render(); } });
        } else { historyStatus = 'Offline: saved history is unavailable. Live session tracking still works.'; render(); }
        } catch (_) { historyStatus = 'Saved history is unavailable. Live session tracking still works.'; render(); }
    }
    function sessionMetrics() { return owner && owner === userId() ? StudentLearningModel.kpis(attempts, executions) : StudentLearningModel.kpis([], []); }
    return { activate, reset, translated, beginRun, endRun, sessionMetrics };
})();
/* ============================================================
   METRICS FORMATTERS
   Pure, Node-testable helpers used by the Compiler Metrics page.
   Any invalid / missing value renders as an em dash so the UI
   never shows fake zeros or "NaN".
   ============================================================ */

function _isFiniteNumber(value) {
    return value !== null && value !== undefined && Number.isFinite(Number(value));
}

/** Round to at most one decimal and drop a trailing ".0". */
function _trim(n) {
    const rounded = Math.round(n * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/**
 * Format a percentage value.
 * Values are assumed to already be on a 0-100 scale (the engine's
 * convention). Pass { fromRatio: true } for 0-1 fractions.
 * Returns "—" for null / undefined / NaN / Infinity.
 */
function formatPercent(value, options) {
    if (!_isFiniteNumber(value)) return '\u2014';
    let n = Number(value);
    const opts = options || {};
    if (opts.fromRatio && n >= 0 && n <= 1) n = n * 100;
    return _trim(n) + '%';
}

/**
 * Format a duration. Milliseconds < 1000 are shown as "ms";
 * durations >= 1 second are converted to seconds ("1.24 s").
 * Returns "—" for missing values.
 */
function formatDuration(value) {
    if (!_isFiniteNumber(value)) return '\u2014';
    const v = Number(value);
    if (v >= 1000) {
        const secs = Math.round((v / 1000) * 100) / 100;
        return _trim(secs) + ' s';
    }
    return _trim(v) + ' ms';
}

/**
 * Format a plain metric (counts, raw numbers).
 * Returns "—" for missing values and a readable number otherwise.
 */
function formatMetricValue(value) {
    if (!_isFiniteNumber(value)) return '\u2014';
    return _trim(Number(value));
}

/**
 * Single source of truth for mastery thresholds, kept in sync with
 * the MetricsEngine taxonomy (Expert >= 80, Proficient >= 65,
 * Developing >= 40, Beginner < 40).
 */
const MASTERY_LEVELS = [
    { min: 80, label: 'Expert', color: 'var(--icon-success)' },
    { min: 65, label: 'Proficient', color: 'var(--text-accent)' },
    { min: 40, label: 'Developing', color: 'var(--icon-warning)' },
    { min: 0, label: 'Beginner', color: 'var(--icon-danger)' }
];

/** Resolve the mastery label (+ color) for an exact-match accuracy (0-100). */
function masteryInfo(accuracy) {
    if (!_isFiniteNumber(accuracy)) return MASTERY_LEVELS[MASTERY_LEVELS.length - 1];
    const a = Number(accuracy);
    for (let i = 0; i < MASTERY_LEVELS.length; i++) {
        if (a >= MASTERY_LEVELS[i].min) return MASTERY_LEVELS[i];
    }
    return MASTERY_LEVELS[MASTERY_LEVELS.length - 1];
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { formatPercent, formatDuration, formatMetricValue, MASTERY_LEVELS, masteryInfo };
}/* ============================================================
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
            return { dataset: exercises, source: 'stored exercises (' + exercises.length + ')' };
        }
    } catch (e) {
        console.warn('[Benchmark] IndexedDB read failed, falling back to dataset.json:', e);
    }
    // Fallback
    console.log('[Benchmark] Fetching dataset.json as fallback...');
    const res = await fetch('dataset.json');
    if (!res.ok) throw new Error('Failed to fetch dataset.json: ' + res.status);
    const raw = await res.json();
    const fallback = Array.isArray(raw) ? raw : (raw.dataset || []);
    return { dataset: fallback, source: 'dataset.json fallback (' + fallback.length + ')' };
}

/**
 * Load and render the Compiler Metrics page.
 * Displays: Session Metrics, Benchmark Results, Pipeline Timing.
 */
function loadCompilerMetrics() {
    if (typeof metricsEngine === 'undefined') return;

    // Session metric cards are optional: the Instructor page is benchmark-first,
    // so these elements may be absent — write them only when they exist.
    const session = metricsEngine.getSessionMetrics();

    const translationsEl = $id('metric-total-translations');
    if (translationsEl) translationsEl.textContent = formatMetricValue(session.totalTranslations);
    const compRateEl = $id('metric-compilation-rate');
    if (compRateEl) compRateEl.textContent = formatPercent(session.compilationSuccessRate);
    const runtimeRateEl = $id('metric-runtime-error-rate');
    if (runtimeRateEl) runtimeRateEl.textContent = formatPercent(session.runtimeErrorRate);
    const avgGenEl = $id('metric-avg-gen-time');
    if (avgGenEl) avgGenEl.textContent = formatDuration(session.avgGenerationTime);
    const totalErrorsEl = $id('metric-total-errors');
    if (totalErrorsEl) totalErrorsEl.textContent = formatMetricValue(session.totalErrors);
    const totalExecEl = $id('metric-total-executions');
    if (totalExecEl) totalExecEl.textContent = formatMetricValue(session.totalExecutions);

    // Error trend badge (optional)
    const trendEl = $id('metric-error-trend');
    const trendIcons = { improving: '↑ Improving', declining: '↓ Declining', stable: '— Stable' };
    const trendClasses = { improving: 'positive', declining: 'negative', stable: '' };
    if (trendEl) {
        trendEl.textContent = trendIcons[session.errorTrend] || '— Stable';
        trendEl.className = 'stat-change ' + (trendClasses[session.errorTrend] || '');
    }

    // ── Pipeline Timing Chart ──
    const timing = metricsEngine.getAveragePipelineTiming();
    renderPipelineTimingChart(timing);

    // ── Restore previous benchmark results if available ──
    if (metricsEngine.benchmarkResults) {
        renderBenchmarkResults(metricsEngine.benchmarkResults);
    } else {
        renderBenchmarkEmpty();
    }
}

/** Guards against overlapping benchmark runs. */
let benchmarkRunning = false;

/**
 * Show the "not run yet" panel and neutralise the summary cards.
 */
function renderBenchmarkEmpty() {
    _showState('benchmark-empty-state');
    ['benchmark-accuracy', 'benchmark-precision', 'benchmark-recall', 'benchmark-f1',
        'benchmark-compile-rate', 'benchmark-avg-time'].forEach(id => {
            const el = $id(id);
            if (el) el.textContent = formatMetricValue(null);
        });
    const wrapper = $id('benchmark-detail-wrapper');
    if (wrapper) wrapper.style.display = 'none';
}

/**
 * Show the loading panel while a benchmark is being computed.
 */
function renderBenchmarkLoading() {
    _showState('benchmark-loading-state');
}

/**
 * Show an error panel with the failure reason and a Retry action.
 */
function renderBenchmarkError(message) {
    const errorEl = $id('benchmark-error-state');
    _showState('benchmark-error-state');
    if (errorEl) {
        const msg = $id('benchmark-error-message');
        if (msg) msg.textContent = message ? String(message) : 'Unexpected failure.';
    }
}

/** Toggle one state panel (empty/loading/error) and hide the others. */
function _showState(id) {
    ['benchmark-empty-state', 'benchmark-loading-state', 'benchmark-error-state'].forEach(name => {
        const el = $id(name);
        if (el) el.classList.toggle('hidden', name !== id);
    });
}

/**
 * Run the automated benchmark.
 * Data source  : pseudopy_exercises IndexedDB store (seeded from dataset.json).
 * Computation  : MetricsEngine.runBenchmark() — strict mathematical formulas.
 * Deliverable  : Populates all dashboard cards, per-test table, concept mastery.
 */
async function runBenchmarkTest() {
    if (benchmarkRunning) return;
    const btn = $id('run-benchmark-btn');
    benchmarkRunning = true;
    if (btn) { btn.disabled = true; btn.textContent = '{{ui:Hourglass}} Running...'; }
    renderBenchmarkLoading();
    showToast('Running benchmark... loading exercises from database.', 'info');

    try {
        // Load from IndexedDB — no fetch/CORS errors
        const { dataset, source } = await loadExercisesFromDB();

        if (!dataset || dataset.length === 0) {
            renderBenchmarkError('No test cases found. Please reload the app to seed the database.');
            showToast('No test cases found. Please reload the app to seed the database.', 'error');
            return;
        }

        showToast(`Running ${dataset.length} test cases through the compiler\u2026`, 'info');

        // Yield to browser so toast renders before heavy synchronous computation
        await new Promise(r => setTimeout(r, 80));

        // Run benchmark pipeline with mathematical metrics engine
        const results = metricsEngine.runBenchmark(dataset, compilerEngine, { dataset: { name: source } });

        // Render all sections
        renderBenchmarkResults(results);

        showToast(
            `{{ui:CircleCheck}} Benchmark complete! Accuracy: ${formatPercent(results.accuracy)} \u00b7 F1: ${formatPercent(results.f1Score)} \u00b7 ${results.totalTestCases} test cases.`,
            'success'
        );
    } catch (err) {
        console.error('[Benchmark] Error:', err);
        renderBenchmarkError(err && err.message ? err.message : 'Unexpected failure.');
        showToast('Benchmark failed: ' + (err && err.message ? err.message : err), 'error');
    } finally {
        benchmarkRunning = false;
        if (btn) { btn.disabled = false; btn.textContent = '{{ui:FlaskConical}} Run Benchmark'; }
    }
}

/**
 * Render all benchmark results into the dashboard.
 * Populates: B. summary cards, per-test table, E. concept mastery table.
 */
function renderBenchmarkResults(results) {
    // ── Summary Cards ──
    setText('benchmark-accuracy', formatPercent(results.accuracy));
    setText('benchmark-precision', formatPercent(results.avgPrecision));
    setText('benchmark-recall', formatPercent(results.avgRecall));
    setText('benchmark-f1', formatPercent(results.f1Score));
    setText('benchmark-compile-rate', formatPercent(results.compilationSuccessRate));
    setText('benchmark-avg-time', formatDuration(results.avgTimeMs));

    // Benchmark has produced results — hide the empty/loading/error panels.
    _showState('');

    // Per-Test-Case Detail Table
    const wrapper = $id('benchmark-detail-wrapper');
    const totalLabel = $id('benchmark-total-label');
    if (wrapper) wrapper.style.display = 'block';
    if (totalLabel) {
        let metaLabel = `${results.totalTestCases} test cases`;
        if (results.dataset && results.dataset.name) metaLabel += ' · ' + results.dataset.name;
        if (results.runAt || results.timestamp) {
            const d = new Date(results.timestamp || results.runAt);
            metaLabel += ' · ' + d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
        }
        if (results.compilerVersion) metaLabel += ' · v' + results.compilerVersion;
        totalLabel.textContent = metaLabel;
    }

    // ── Detailed Results Table ──
    const tbody = $id('benchmark-results-body');
    if (tbody) {
        tbody.innerHTML = results.results.map(r => `
        <tr>
          <td style="font-weight:600;color:var(--text-primary)">${r.id}</td>
          <td>${r.concept}</td>
          <td><span class="badge ${r.compiled ? 'badge-active' : 'badge-inactive'}">${r.compiled ? '{{ui:CircleCheck}} Pass' : '{{ui:CircleX}} Fail'}</span></td>
          <td><span class="badge ${r.exactMatch ? 'badge-active' : 'badge-student'}">${r.exactMatch ? '{{ui:CircleCheck}} Match' : '{{ui:TriangleAlert}} Diff'}</span></td>
          <td style="font-weight:500">${formatPercent(r.precision * 100)}</td>
          <td style="font-weight:500">${formatPercent(r.recall * 100)}</td>
          <td style="color:var(--text-muted)">${formatDuration(r.timeMs)}</td>
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
                const level = masteryInfo(c.accuracy);
                const label = c.mastery || level.label;
                const color = level.color;

                return `<tr>
                  <td style="font-weight:600;color:var(--text-primary)">${c.concept}</td>
                  <td style="color:var(--text-secondary)">${formatMetricValue(c.total)}</td>
                  <td><span style="font-weight:600;color:${c.successRate >= 80 ? 'var(--icon-success)' : 'var(--icon-warning)'}">${formatPercent(c.successRate)}</span></td>
                  <td><span style="font-weight:600;color:${color}">${formatPercent(c.accuracy)}</span></td>
                  <td>${formatPercent(c.avgPrecision)}</td>
                  <td><span style="color:${color};font-weight:700">{{ui:Circle}} ${label}</span></td>
                </tr>`;
            }).join('');
        }
    }
}

/**
 * Render pipeline timing bar chart.
 */
function renderPipelineTimingChart(timing) {
    const stages = [
        { name: 'Lexer', value: timing.avgLexTime, color: 'var(--chart-1)' },
        { name: 'Parser', value: timing.avgParseTime, color: 'var(--chart-2)' },
        { name: 'Semantic', value: timing.avgSemanticTime, color: 'var(--chart-3)' },
        { name: 'CodeGen', value: timing.avgCodeGenTime, color: 'var(--chart-4)' }
    ];
    const slowest=stages.reduce((a,b)=>b.value>a.value?b:a);
    const view=anMountChart('chart-pipeline-timing',{title:'Compiler Pipeline Timing',description:'Average time spent in each compiler stage.',
        stats:[{label:'Average total',value:timing.count?timing.avgTotalTime+' ms':'—'},{label:'Translations',value:timing.count}],
        insight:timing.count?'Slowest stage: '+slowest.name+' · '+slowest.value+' ms':'',caption:'Measured locally, in milliseconds. Shorter bars indicate faster stages.'});
    if(!view)return;
    view.legend.innerHTML=stages.map(s=>anLegendChip(s.name,timing.count?s.value+' ms':'—',s.color)).join('');
    anChartDraw(view,width=>{
        if(!timing.count){anChartState(view.plot,'empty','Translate pseudocode to see stage timings.');return;}
        const max=Math.max(...stages.map(s=>s.value),.001),left=76,right=60;
        const span=Math.max(1,width-left-right),items=[];
        let content='';
        stages.forEach((s,i)=>{
            const y=26+i*48,w=Math.max(2,s.value/max*span);
            items.push({label:'Average stage time',rows:[{name:s.name,value:s.value+' ms',color:s.color}]});
            content+=`<line x1="${left}" x2="${width-right}" y1="${y+30}" y2="${y+30}" class="an-grid-line"/><text x="${left-8}" y="${y+20}" text-anchor="end" class="an-axis-label">${s.name}</text><rect data-mark="${i}" tabindex="-1" aria-label="${s.name}: ${s.value} milliseconds average" x="${left}" y="${y}" width="${w}" height="30" rx="4" fill="${s.color}"/><text x="${left+w+6}" y="${y+20}" class="an-axis-label">${s.value} ms</text>`;
        });
        view.plot.innerHTML=anChartSvg(width,'Average compiler stage times in milliseconds',content);anBindMarks(view.plot,view.card,items);
    });
}


if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}


/* ============================================================
   SYSTEM ANALYTICS (Admin)
   Live aggregate of the ENTIRE stored activity log
   (pseudopy_activity) — every instructor and every student.
   Single realtime subscription with proper cleanup on leave.
   ============================================================ */

const SystemAnalyticsTime = {
    RANGES: { '24h': 1, '7d': 7, '30d': 30, '90d': 90, 'all': null }
};

function systemRecordTime(record) {
    if (record && typeof record.timestamp === 'number' && isFinite(record.timestamp)) return record.timestamp;
    if (record && typeof record.time === 'string') {
        const parsed = Date.parse(record.time);
        if (!isNaN(parsed)) return parsed;
    }
    return null;
}

function systemFilterByRange(records, range) {
    const days = SystemAnalyticsTime.RANGES[range];
    if (days == null) return Array.isArray(records) ? records.slice() : [];
    const cutoff = Date.now() - days * 864e5;
    return (Array.isArray(records) ? records : []).filter(record => {
        const t = systemRecordTime(record);
        return t != null && t >= cutoff;
    });
}

function systemHasPseudocode(record) {
    return !!(record && (record.pseudocode || record.submittedCode));
}

function systemHasExecution(record) {
    if (record && record.type === 'translate_attempt') return false;
    return !!(record && (record.python_code || record.pythonCode || record.output || record.status === 'Completed'));
}

function systemComputeOverview(records) {
    const list = Array.isArray(records) ? records : [];
    let totalTranslations = 0;
    let totalExecutions = 0;
    let errorCount = 0;
    const students = new Set();
    const exercises = new Set();
    for (const record of list) {
        if (systemHasPseudocode(record)) totalTranslations++;
        if (systemHasExecution(record)) totalExecutions++;
        const errorText = (record && record.errorType) || '';
        const resultText = String((record && record.result) || '');
        const isError = errorText.trim() !== '' ||
            /error|failed/i.test(resultText) ||
            (record && record.status === 'Failed');
        if (isError) errorCount++;
        const studentKey = record && (record.studentAccountId || record.studentId || record.username || record.student);
        if (studentKey) students.add(String(studentKey));
        const exerciseKey = record && (record.exerciseId || record.exercise || record.title);
        if (exerciseKey) exercises.add(String(exerciseKey));
    }
    const compilationSuccessRate = totalTranslations > 0
        ? parseFloat(((1 - errorCount / totalTranslations) * 100).toFixed(1))
        : null;
    return {
        totalRecords: list.length,
        totalTranslations,
        totalExecutions,
        errorCount,
        compilationSuccessRate,
        activeStudents: students.size,
        uniqueExercises: exercises.size
    };
}

function systemBuildActivitySeries(records, range) {
    const days = SystemAnalyticsTime.RANGES[range] || 30;
    const buckets = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
        const day = new Date(today.getTime() - i * 864e5);
        buckets.push({
            key: day.toDateString(),
            label: (day.getMonth() + 1) + '/' + day.getDate(),
            translations: 0,
            executions: 0
        });
    }
    const byKey = {};
    buckets.forEach(bucket => { byKey[bucket.key] = bucket; });
    (Array.isArray(records) ? records : []).forEach(record => {
        const t = systemRecordTime(record);
        if (t == null) return;
        const bucket = byKey[new Date(t).toDateString()];
        if (!bucket) return;
        if (systemHasPseudocode(record)) bucket.translations++;
        if (systemHasExecution(record)) bucket.executions++;
    });
    return buckets;
}

/* ════════════════════════════════════════════════════════════
   DOM / REALTIME LAYER
   ════════════════════════════════════════════════════════════ */

let cachedSystemActivity = [];
let systemTimeRange = 'all';
let systemAnalyticsLoadGeneration = 0;

var systemAnalyticsUnsubscribe = null;

function startSystemAnalyticsRealtime() {
    if (systemAnalyticsUnsubscribe || !currentUser || currentUser.role !== 'admin') return;
    const owner = currentUser;
    const subscriptions = [];
    systemAnalyticsUnsubscribe = () => subscriptions.forEach(unsubscribe => unsubscribe());
    const refresh = () => {
        if (currentUser !== owner || currentPage !== 'system-analytics') return;
        renderSystemAnalytics();
    };
    subscriptions.push(subscribeCollection(activityRef, records => {
        if (currentUser !== owner || currentPage !== 'system-analytics') return;
        cachedSystemActivity = Array.isArray(records) ? records : [];
        refresh();
    }, error => {
        console.error('[SystemAnalytics] Realtime subscription error:', error);
        setText('system-live-status', 'Live updates unavailable. Reopen System Analytics to retry.');
    }));
}

function stopSystemAnalyticsRealtime() {
    systemAnalyticsLoadGeneration++;
    if (systemAnalyticsUnsubscribe) {
        systemAnalyticsUnsubscribe();
        systemAnalyticsUnsubscribe = null;
    }
}

async function loadSystemAnalytics() {
    stopSystemAnalyticsRealtime();
    const generation = systemAnalyticsLoadGeneration;
    const owner = currentUser;
    if (!owner || owner.role !== 'admin') return;
    setText('system-live-status', 'Loading system analytics…');
    renderSystemActivityChart([]);
    renderSystemErrorChart([]);
    ['system-activity-svg','system-errors-svg'].forEach(id=>anChartState($id(id),'loading'));
    try {
        const records = await dbGetAll(activityRef);
        if (generation !== systemAnalyticsLoadGeneration || currentUser !== owner || currentPage !== 'system-analytics') return;
        cachedSystemActivity = Array.isArray(records) ? records : [];
        renderSystemAnalytics();
        startSystemAnalyticsRealtime();
    } catch (error) {
        if (generation !== systemAnalyticsLoadGeneration || currentUser !== owner) return;
        console.error('[SystemAnalytics] Loading failed:', error);
        cachedSystemActivity = [];
        renderSystemAnalyticsError('Unable to load system analytics. Reopen this page to retry.');
    }
}

function setSystemTimeRange(range, button) {
    if (SystemAnalyticsTime.RANGES[range] === undefined) return;
    systemTimeRange = range;
    const buttons = typeof $qsa === 'function' ? $qsa('.sys-range-btn') : [];
    buttons.forEach(btn => btn.classList.toggle('active', btn === button || btn.getAttribute('data-range') === range));
    renderSystemAnalytics();
}

function systemRenderErrorState(message) {
    const messageElement = $id('system-error-message');
    if (messageElement) messageElement.textContent = message;
    const state = $id('system-error-state');
    if (state) state.classList.remove('hidden');
}

function renderSystemAnalyticsError(message) {
    systemRenderErrorState('Unable to load system analytics. Please try again.');
    ['system-activity-svg', 'system-errors-svg'].forEach(id => anChartState($id(id),'error','',()=>loadSystemAnalytics()));
    setText('system-live-status', 'System analytics unavailable.');
}

function renderSystemAnalytics() {
    if (!currentUser || currentUser.role !== 'admin') return;
    const filtered = systemFilterByRange(cachedSystemActivity, systemTimeRange);
    const overview = systemComputeOverview(filtered);
    $id('system-error-state')?.classList.add('hidden');

    // ── System Overview KPIs ──
    setText('adv-total-translations', formatMetricValue(overview.totalTranslations));
    setText('adv-total-executions', formatMetricValue(overview.totalExecutions));
    setText('adv-compile-rate', formatPercent(overview.compilationSuccessRate));
    setText('adv-error-count', formatMetricValue(overview.errorCount));
    setText('adv-active-students', formatMetricValue(overview.activeStudents));
    setText('adv-unique-exercises', formatMetricValue(overview.uniqueExercises));

    const scopeLabel = $id('system-scope-label');
    if (scopeLabel) {
        const rangeNames = { '24h': 'last 24 hours', '7d': 'last 7 days', '30d': 'last 30 days', '90d': 'last 90 days', all: 'all time' };
        scopeLabel.textContent = `${overview.totalRecords} activity record(s) across ${rangeNames[systemTimeRange] || 'all time'}.`;
    }
    setText('system-live-status', 'Live system analytics — every stored activity record is included.');

    // ── Charts ──
    try { renderSystemActivityChart(filtered); }
    catch (e) { console.error('[SystemAnalytics] activity chart failed:', e); anChartState($id('system-activity-svg'),'error','',()=>renderSystemAnalytics()); }
    try { renderSystemErrorChart(filtered); }
    catch (e) { console.error('[SystemAnalytics] error chart failed:', e); anChartState($id('system-errors-svg'),'error','',()=>renderSystemAnalytics()); }
}

let systemActivityMetric = 'all';
function renderSystemActivityChart(records) {
    const daily=systemBuildActivitySeries(records,systemTimeRange);
    // Combine contiguous days for a bounded plot; retain every event in totals.
    const stride=Math.max(1,Math.ceil(daily.length/30));
    const series=[];
    for(let i=0;i<daily.length;i+=stride){
        const chunk=daily.slice(i,i+stride);
        series.push({label:chunk[0].label+(chunk.length>1?'–'+chunk.at(-1).label:''),
            translations:chunk.reduce((n,b)=>n+b.translations,0),executions:chunk.reduce((n,b)=>n+b.executions,0)});
    }
    const translations=series.reduce((n,b)=>n+b.translations,0),executions=series.reduce((n,b)=>n+b.executions,0);
    const view=anMountChart('system-activity-svg',{title:'Translations & Executions',description:'Recorded compiler activity over the charted period.',
        stats:[{key:'all',label:'All events',value:translations+executions,active:systemActivityMetric==='all'},
            {key:'translations',label:'Translations',value:translations,active:systemActivityMetric==='translations'},
            {key:'executions',label:'Executions',value:executions,active:systemActivityMetric==='executions'}],
        caption:stride>1?'Contiguous days are grouped to keep the chart readable.':'Daily translations and executions.',
        onMetric:key=>{systemActivityMetric=key;renderSystemActivityChart(records);}});
    if(!view)return;
    const keys=(systemActivityMetric==='all'?['translations','executions']:[systemActivityMetric]);
    const color=key=>key==='translations'?'var(--chart-1)':'var(--chart-2)';
    const name=key=>key==='translations'?'Translations':'Executions';
    view.legend.innerHTML=keys.map(key=>anLegendChip(name(key),String(key==='translations'?translations:executions),color(key))).join('');
    anChartDraw(view,width=>{
        if(!translations&&!executions){anChartState(view.plot,'empty','No activity in this period.');return;}
        const w=Math.max(width,64+series.length*18),max=niceCeil(Math.max(1,...series.flatMap(b=>keys.map(k=>b[k]))));
        const y=linearScale([0,max],[216,16]),slot=(w-64)/series.length;
        const groups=keys.map(key=>({points:series.map((b,x)=>({x,y:b[key]}))}));
        const bars=groupedBarGeometry(groups,series.length,w,{domain:[0,max]});
        const items=bars.map(b=>({label:series[b.point.x].label,rows:[{name:name(keys[b.student]),value:b.point.y,color:color(keys[b.student])}]}));
        let content=anChartGrid(w,[0,Math.ceil(max/2),max],y,'');
        content+=bars.map((b,i)=>`<path data-mark="${i}" tabindex="-1" aria-label="${anAttr(items[i].label+', '+items[i].rows[0].name+': '+b.point.y)}" d="${roundedBarPath(b)}" fill="${color(keys[b.student])}"/>`).join('');
        content+=chartTicks(series.map(b=>b.label),series.map((_,i)=>48+slot*(i+.5))).map(i=>`<text x="${48+slot*(i+.5)}" y="236" text-anchor="middle" class="an-axis-label">${anEsc(series[i].label)}</text>`).join('');
        view.plot.innerHTML=anChartSvg(w,'System activity counts',content);anBindMarks(view.plot,view.card,items);
    });
}

let systemErrorActiveName = null;
function renderSystemErrorChart(records) {
    anRenderDonut('system-errors-svg',records || [],{title:'System Error Distribution',description:'Recorded translation errors across the system.',
        active:systemErrorActiveName,onSelect:name=>{systemErrorActiveName=name;renderSystemErrorChart(records);}});
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SystemAnalyticsTime: { RANGES: SystemAnalyticsTime.RANGES },
        systemRecordTime,
        systemFilterByRange,
        systemComputeOverview,
        systemBuildActivitySeries
    };
}
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

    if (typeof requireOnline === 'function') {
        const gate = requireOnline();
        if (!gate.ok) { showToast(gate.message, 'error'); return; }
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
    localStorage.setItem(STORAGE_KEYS.THEME, newTheme);

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
/* ============================================================
   ACCESSIBILITY — shared a11y behaviors
   - togglePasswordVisibility (L1 fix: was referenced but never defined)
   - Global focus trap + initial-focus lift for modal/drawer overlays
   - Keyboard-driven skip link handling
   ============================================================ */

/**
 * Toggles the visibility of a password field between hidden and plain text.
 * Keeps the toggle button labelled and swaps the eye icon so the state is
 * announced independently of the (non-aria) text.
 */
function togglePasswordVisibility(inputId, btn) {
    const input = $id(inputId);
    if (!input) return;

    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');

    const icon = btn.querySelector('[data-lucide]');
    if (icon) {
        icon.setAttribute('data-lucide', show ? 'eye-off' : 'eye');
        refreshIcons(btn);
    }
}

const A11Y_FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const A11Y_OVERLAYS = '.modal-overlay, .drawer-overlay';

function a11yVisible(el) {
    return el && !el.classList.contains('hidden') && el.getClientRects().length > 0;
}

function a11yFocusables(container) {
    return Array.from(container.querySelectorAll(A11Y_FOCUSABLE))
        .filter(el => el.getClientRects().length > 0);
}

/**
 * Traps Tab/Shift+Tab within the currently visible overlay. Handles every
 * modal and drawer uniformly instead of per-modal wiring.
 */
function a11yTrapKeydown(e) {
    if (e.key !== 'Tab') return;
    const overlay = Array.from(document.querySelectorAll(A11Y_OVERLAYS))
        .find(o => a11yVisible(o) && o.contains(document.activeElement));
    if (!overlay) return;

    const focusables = a11yFocusables(overlay);
    if (!focusables.length) { e.preventDefault(); return; }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
}

let a11yLastFocus = null;

/**
 * Observes overlay visibility so that when a modal/drawer opens, focus moves
 * into it, and when it closes, focus returns to the triggering element.
 * resubmission-request-modal already manages its own focus lifecycle and is
 * excluded to avoid fighting its internal logic.
 */
function a11yWatchOverlays() {
    const overlays = Array.from(document.querySelectorAll(A11Y_OVERLAYS));
    const prevVisible = new WeakMap(overlays.map(o => [o, a11yVisible(o)]));

    const observer = new MutationObserver((muts) => {
        const touched = new Set(muts.map(m => m.target));
        touched.forEach((overlay) => {
            if (!overlay.matches(A11Y_OVERLAYS)) return;
            const nowVisible = a11yVisible(overlay);
            const wasVisible = prevVisible.get(overlay) || false;
            prevVisible.set(overlay, nowVisible);

            if (nowVisible && !wasVisible && overlay.id !== 'resubmission-request-modal') {
                a11yLastFocus = document.activeElement;
                const target = a11yFocusables(overlay)[0];
                if (target) setTimeout(() => target.focus(), 0);
            } else if (!nowVisible && wasVisible) {
                if (a11yLastFocus && a11yLastFocus.isConnected) {
                    setTimeout(() => a11yLastFocus.focus(), 0);
                }
                a11yLastFocus = null;
            }
        });
    });

    overlays.forEach((overlay) => observer.observe(overlay, { attributes: true, attributeFilter: ['class'] }));
}

/**
 * Adds scope="col" to header cells of any table (static or JS-rendered) so
 * screen readers can announce column headers reliably.
 */
function a11yUpgradeTableHeaders(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.matches('thead th')) {
        if (!root.hasAttribute('scope')) root.setAttribute('scope', 'col');
        return;
    }
    root.querySelectorAll('thead th').forEach(th => {
        if (!th.hasAttribute('scope')) th.setAttribute('scope', 'col');
    });
}

function initA11y() {
    document.addEventListener('keydown', a11yTrapKeydown);
    a11yWatchOverlays();

    const main = $id('main-content') || document.body;
    a11yUpgradeTableHeaders(main);
    const observer = new MutationObserver((muts) => {
        muts.forEach((m) => {
            if (!m.addedNodes) return;
            m.addedNodes.forEach((node) => {
                if (node.nodeType !== 1) return;
                if (node.matches && node.matches('thead, thead th')) a11yUpgradeTableHeaders(node);
                else if (node.querySelector) a11yUpgradeTableHeaders(node);
            });
        });
    });
    observer.observe(main, { childList: true, subtree: true });
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initA11y);
    } else {
        initA11y();
    }
}/* ============================================================
   LEGAL / ABOUT PAGES (Privacy Policy, Terms of Use)
   In-app document views reachable before and after sign-in.
   Content lives in the index.html #legal-pages sections and
   reflects the application's actual data practices. Values come
   from APP_INFO (single source). Missing owner values are shown
   to developers only; production omits unfinished rows.
   ============================================================ */

let legalReturnState = null;
let legalReturnFocus = null;

function showLegalPage(kind) {
    const inApp = !!currentUser;
    legalReturnState = { inApp: inApp, page: currentUser ? currentPage : null };
    legalReturnFocus = document.activeElement;

    hide('app-layout');
    hide('login-page');
    show('legal-pages');
    hide('legal-section-privacy');
    hide('legal-section-terms');
    hide('legal-section-about');

    const sectionId = kind === 'terms' ? 'legal-section-terms'
        : kind === 'about' ? 'legal-section-about'
        : 'legal-section-privacy';
    const shown = $id(sectionId);
    if (shown) {
        shown.classList.remove('hidden');
        shown.setAttribute('tabindex', '-1');
        shown.focus();
    }
    renderLegalPlaceholders();
}

function closeLegalPage() {
    hide('legal-pages');
    if (legalReturnState && legalReturnState.inApp) {
        show('app-layout');
        navigateTo(legalReturnState.page || 'write-pseudocode');
    } else {
        show('login-page');
    }
    if (legalReturnFocus && legalReturnFocus.isConnected) {
        try { legalReturnFocus.focus(); } catch (e) { /* best effort focus restore */ }
    }
}

/** Fill APP_INFO-driven values. Configured fields always render; missing
 *  fields render a development marker on localhost and are hidden in
 *  production so the public never sees "[pending owner configuration]". */
function renderLegalPlaceholders() {
    const set = (id, value, key) => {
        const el = $id(id);
        if (el) el.textContent = appInfoField(value, key);
    };
    set('legal-app-name', APP_INFO.name);
    set('legal-app-name-2', APP_INFO.name);
    set('legal-org', APP_INFO.organization);
    set('legal-org-2', APP_INFO.organization);
    const team = (APP_INFO.developmentTeam || []).join(', ');
    set('legal-team', team);
    set('legal-version', APP_INFO.version ? 'v' + APP_INFO.version : '');
    set('legal-collections', (APP_INFO.collections || []).join(', '));
    set('legal-contact', APP_INFO.contactEmail, 'contactEmail');
    set('legal-contact-2', APP_INFO.contactEmail, 'contactEmail');
    set('legal-contact-3', APP_INFO.contactEmail, 'contactEmail');
    set('legal-contact-4', APP_INFO.contactEmail, 'contactEmail');
    set('legal-privacy-date', APP_INFO.privacyEffectiveDate, 'privacyEffectiveDate');
    set('legal-terms-date', APP_INFO.termsEffectiveDate, 'termsEffectiveDate');

    // Hide the whole wrapping line when a required owner value is missing in
    // production (appInfoField returned an empty string).
    const rowPairs = [
        ['legal-privacy-date-row', 'legal-privacy-date'],
        ['legal-terms-date-row', 'legal-terms-date'],
        ['legal-contact-row-1', 'legal-contact'],
        ['legal-contact-row-2', 'legal-contact-2'],
        ['legal-contact-row-3', 'legal-contact-3'],
        ['legal-contact-row-4', 'legal-contact-4']
    ];
    rowPairs.forEach(pair => {
        const row = $id(pair[0]);
        const span = $id(pair[1]);
        if (row && span) {
            row.classList.toggle('hidden', String(span.textContent).trim() === '');
        }
    });

    set('about-app-name', APP_INFO.name);
    set('about-app-version', APP_INFO.version ? 'v' + APP_INFO.version : '');
    set('about-app-description', APP_INFO.description);
    set('about-org', APP_INFO.organization);
    set('about-founder', APP_INFO.founder || '—');
    set('about-cofounder', APP_INFO.coFounder || '—');
    set('about-tech', (APP_INFO.technicalTeam || []).map(n => n || '').filter(Boolean).join(', ') || '—');
    set('about-contact', APP_INFO.contactEmail, 'contactEmail');
    const aboutContactRow = $id('about-contact-row');
    if (aboutContactRow) {
        aboutContactRow.classList.toggle('hidden', !appInfoField(APP_INFO.contactEmail, 'contactEmail'));
    }

    // Development-only warning: list the exact fields still missing. Hidden in
    // production and hidden entirely once configuration is complete.
    const missing = appInfoMissingFields();
    const pending = $id('legal-pending-notice');
    if (pending) {
        pending.classList.toggle('hidden', !(missing.length > 0 && appIsDevelopment()));
        const intro = $id('legal-pending-text');
        if (intro) {
            intro.textContent = missing.length > 0
                ? 'Before public launch, complete: ' + missing.map(m => m.label).join(', ') + '. Hidden from public visitors until provided.'
                : '';
        }
    }
}

/** Renders the login-footer legal link bar (used by inline HTML handlers). */
function openLegalFromFooter(kind) { showLegalPage(kind); }