/* ============================================================
   INITIALIZATION
   ============================================================ */

async function init() {
    console.log('[App] init() called');
    try {

        // Restore the persisted session FIRST so a refresh never flashes
        // login and never behaves like a logout.
        await restoreSession();

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
        const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);

        // Show the app version (login footer / settings About).
        renderAppVersion();
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
        if (typeof dbGet === 'function' && typeof exercisesRef !== 'undefined') {
            dbGet(exercisesRef, activeExId).then(ex => {
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


