/* ============================================================
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

