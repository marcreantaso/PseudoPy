// ============================================================
// DATABASE HEALTH PANEL — PseudoPy Developer Options
//
// Reports the live state of the pieces that are otherwise
// invisible: which project the browser is actually talking to,
// whether Firestore persistence engaged, whether Auth is
// attached, whether the offline queue is draining, and whether the
// server-side delete function is reachable.
//
// Read-only. It calls getters that already exist as shared globals
// (firestoreReady, firestoreInit, cloudAuthStatus, getSyncState,
// isFirestoreReachable, deletionServerAvailable) and never performs
// a write, a retry, or a re-auth.
// ============================================================

const DEVTOOLS_HEALTH_GROUPS = [
    {
        id: 'identity',
        title: 'Firebase Identity',
        rows: [
            {
                label: 'Active project',
                read: () => (typeof firebaseConfig !== 'undefined' && firebaseConfig.projectId) || '(not configured)',
                expect: () => (typeof firebaseConfig !== 'undefined' && firebaseConfig.projectId) || '(none)',
                check: () => !!(typeof firebaseConfig !== 'undefined' && firebaseConfig.projectId)
            },
            {
                label: 'Config source',
                read: () => (typeof window !== 'undefined' && window.__FIREBASE_CONFIG__)
                    ? 'window.__FIREBASE_CONFIG__ override'
                    : 'bundled default (src/database/firebase.js)',
                check: () => true
            },
            {
                label: 'Initialized apps',
                read: () => (typeof firebase !== 'undefined' && firebase.apps) ? String(firebase.apps.length) : 'SDK unavailable',
                check: () => !!(typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length === 1)
            },
            {
                label: 'SDK modules loaded',
                read: () => ['app', 'firestore', 'auth', 'functions', 'app-check']
                    .filter(m => typeof firebase !== 'undefined' && firebase && firebase[m]).join(', ') || 'none',
                check: () => !!(typeof firebase !== 'undefined' && firebase && firebase.app && firebase.firestore && firebase.auth)
            }
        ]
    },
    {
        id: 'firestore',
        title: 'Firestore',
        rows: [
            {
                label: 'Instance ready',
                read: () => (typeof firestoreReady === 'function' && firestoreReady()) ? 'yes' : 'no',
                check: () => typeof firestoreReady === 'function' && firestoreReady()
            },
            {
                label: 'Firestore client cache',
                // The Firestore client cache is in-memory by design here; the
                // durable offline copy is the app's own IndexedDB store, shown
                // on the next row. So this is never a failure condition.
                read: () => {
                    if (typeof firestoreInit === 'undefined') return 'unknown';
                    return firestoreInit.localCache
                        + (firestoreInit.localCacheNote ? ' — ' + firestoreInit.localCacheNote : '');
                },
                check: () => typeof firestoreInit !== 'undefined' && firestoreInit.localCache !== 'unknown',
                warn: () => typeof firestoreInit === 'undefined'
                    || !firestoreInit.localCacheEngineConfigurable
            },
            {
                label: 'Cache engine configurable',
                // compat 10.12.0 exposes no cache configuration API, so this
                // reporting "no" is correct rather than a defect.
                read: () => (typeof firestoreInit !== 'undefined' && firestoreInit.localCacheEngineConfigurable)
                    ? 'yes (modular initializeFirestore detected)'
                    : 'no (compat SDK; only the deprecated db.enablePersistence() exists)',
                check: () => true
            },
            {
                label: 'Durable offline store',
                // This is the layer that actually survives a reload, so it is
                // the one that matters for the offline guarantees.
                read: () => {
                    if (typeof offlineIdbAvailable !== 'function') return 'unknown';
                    if (!offlineIdbAvailable()) return 'IndexedDB unavailable in this browser';
                    return typeof offlineDb !== 'undefined' && offlineDb
                        ? 'open'
                        : 'available, not yet opened';
                },
                check: () => typeof offlineIdbAvailable !== 'function' || offlineIdbAvailable(),
                warn: () => typeof offlineDb === 'undefined' || !offlineDb
            },
            {
                label: 'App Check',
                read: () => {
                    if (typeof firestoreInit === 'undefined') return 'unknown';
                    return firestoreInit.appCheck + (firestoreInit.appCheckReason ? ' — ' + firestoreInit.appCheckReason : '');
                },
                // Informational, not a failure: App Check stays off until a
                // reCAPTCHA v3 site key is registered in the console.
                warn: () => typeof firestoreInit !== 'undefined' && firestoreInit.appCheck !== 'active'
            }
        ]
    },
    {
        id: 'auth',
        title: 'Authentication',
        rows: [
            {
                label: 'Auth bridge',
                read: () => {
                    if (typeof cloudAuthStatus !== 'function') return 'unavailable';
                    const s = cloudAuthStatus();
                    return s.available ? s.state : 'unavailable';
                },
                check: () => typeof cloudAuthStatus === 'function' && cloudAuthStatus().available
            },
            {
                label: 'Session resolved',
                read: () => (typeof cloudAuthStatus === 'function' && cloudAuthStatus().resolved) ? 'yes' : 'no',
                check: () => typeof cloudAuthStatus === 'function' && cloudAuthStatus().resolved
            },
            {
                label: 'Signed-in uid',
                read: () => (typeof cloudAuthStatus === 'function' && cloudAuthStatus().uid) || '(anonymous)',
                // Anonymous is normal for this app: it authenticates in-app
                // against pseudopy_users, and the Auth bridge is best-effort.
                check: () => true
            },
            {
                label: 'Auth persistence',
                read: () => (typeof cloudAuthStatus === 'function' && cloudAuthStatus().persistence) || 'unknown',
                check: () => true
            }
        ]
    },
    {
        id: 'sync',
        title: 'Offline Queue & Sync',
        rows: [
            {
                label: 'Firestore reachable',
                read: () => (typeof isFirestoreReachable === 'function' ? (isFirestoreReachable() ? 'yes' : 'no') : 'unknown'),
                check: () => typeof isFirestoreReachable !== 'function' || isFirestoreReachable()
            },
            {
                label: 'Browser online',
                read: () => (typeof navigator !== 'undefined' && navigator.onLine) ? 'yes' : 'no',
                // navigator.onLine is famously unreliable; a mismatch here is
                // information, not a verdict.
                warn: () => typeof navigator !== 'undefined' && navigator.onLine === false
            },
            {
                label: 'Sync in progress',
                read: ctx => (ctx.queue && ctx.queue.syncInProgress) ? 'yes' : 'no',
                check: ctx => !!(ctx.queue && ctx.queue.syncInProgress)
            },
            {
                label: 'Pending mutations',
                read: ctx => (ctx.queue ? String(ctx.queue.pending) : 'unknown'),
                // Backlog is informational: a queued write is the app working
                // as designed while offline, not a fault.
                warn: ctx => !!(ctx.queue && ctx.queue.pending > 0)
            },
            {
                label: 'Failed mutations',
                read: ctx => (ctx.queue ? String(ctx.queue.failed) : 'unknown'),
                // A failed mutation will never drain on its own, so unlike the
                // pending backlog this is a real fault.
                check: ctx => !(ctx.queue && ctx.queue.failed > 0)
            },
            {
                label: 'Cloud circuit',
                read: () => {
                    if (typeof cloudRequestsAllowed === 'function' && !cloudRequestsAllowed()) {
                        return (typeof cloudCircuitError !== 'undefined' && cloudCircuitError)
                            ? 'open — ' + ((cloudCircuitError && cloudCircuitError.code) || 'reason unknown')
                            : 'open';
                    }
                    return 'closed';
                },
                check: () => !(typeof cloudRequestsAllowed === 'function' && !cloudRequestsAllowed())
            }
        ]
    },
    {
        id: 'server',
        title: 'Server Functions',
        rows: [
            {
                label: 'Functions SDK',
                read: () => (typeof firebase !== 'undefined' && firebase && typeof firebase.functions === 'function') ? 'loaded' : 'not loaded',
                check: () => typeof firebase !== 'undefined' && firebase && typeof firebase.functions === 'function'
            },
            {
                label: 'deleteStudentAccount callable',
                read: () => (typeof deletionServerAvailable === 'function' && deletionServerAvailable())
                    ? 'reachable'
                    : 'unavailable (client falls back to local-only deletion)',
                check: () => typeof deletionServerAvailable !== 'function' || deletionServerAvailable()
            },
            {
                label: 'Audit endpoint',
                read: () => 'see /api/health (server-side; not probed from the browser)',
                check: () => true
            }
        ]
    }
];

let devToolsHealthLastReport = null;

/**
 * Some sources are synchronous and some are not. getSyncState() is async
 * because it reads the mutation queue out of IndexedDB, so calling it here and
 * stringifying the result would render the literal text "[object Promise]"
 * and every comparison against it would be false. Each read is therefore
 * resolved before it is formatted.
 */
async function _devToolsHealthResolve(value) {
    if (typeof value !== 'function') return 'n/a';
    let out;
    try {
        out = value();
    } catch (e) {
        return 'error: ' + ((e && e.message) || e);
    }
    try {
        if (out && typeof out.then === 'function') out = await out;
    } catch (e) {
        return 'error: ' + ((e && e.message) || e);
    }
    return out === undefined || out === null || out === '' ? 'n/a' : String(out);
}

async function _devToolsHealthFlag(fn) {
    if (typeof fn !== 'function') return false;
    try {
        const out = fn();
        if (out && typeof out.then === 'function') return !!(await out);
        return !!out;
    } catch (e) {
        return false;
    }
}

/**
 * Read the whole sync queue once. The three queue rows below would otherwise
 * each open their own transaction, and they must agree with each other.
 */
async function _devToolsHealthQueueState() {
    if (typeof getSyncState !== 'function') return null;
    try {
        return await Promise.resolve(getSyncState());
    } catch (e) {
        return null;
    }
}

/** Collect every row once. Safe to call outside the DOM. */
async function collectDevToolsHealth() {
    const groups = [];
    let problems = 0;
    let advisories = 0;
    const queue = await _devToolsHealthQueueState();

    for (const group of DEVTOOLS_HEALTH_GROUPS) {
        const rows = [];
        for (const row of group.rows) {
            const context = { queue };
            const value = await _devToolsHealthResolve(() => row.read(context));
            const failed = row.check ? !(await _devToolsHealthFlag(() => row.check(context))) : false;
            const advisory = !failed && row.warn ? await _devToolsHealthFlag(() => row.warn(context)) : false;
            if (failed) problems++;
            if (advisory) advisories++;
            rows.push({
                label: row.label,
                value,
                status: failed ? 'fail' : advisory ? 'warn' : 'ok'
            });
        }
        groups.push({ id: group.id, title: group.title, rows });
    }

    return { groups, problems, advisories, at: new Date().toISOString() };
}

function devToolsHealthRender(report) {
    devToolsHealthLastReport = report;

    const summary = $id('devtools-health-summary');
    if (summary) {
        summary.textContent = report.problems === 0
            ? (report.advisories > 0
                ? report.advisories + ' advisory note(s), no failures'
                : 'All checks passed')
            : report.problems + ' check(s) need attention';
    }

    const grid = $id('devtools-health-grid');
    if (grid) {
        if (!report.groups.length) {
            grid.innerHTML = '<p class="devtools-health-empty">No checks registered.</p>';
        } else {
            grid.innerHTML = report.groups.map(group => (
                '<section class="devtools-health-group">'
                + '<h4>' + _devToolsHealthEscape(group.title) + '</h4>'
                + '<dl class="devtools-health-list">'
                + group.rows.map(row => (
                    '<div class="devtools-health-row is-' + row.status + '">'
                    + '<dt>' + _devToolsHealthEscape(row.label) + '</dt>'
                    + '<dd>' + _devToolsHealthEscape(row.value) + '</dd>'
                    + '</div>'
                )).join('')
                + '</dl></section>'
            )).join('');
        }
    }

    const json = $id('devtools-health-json');
    if (json) {
        json.textContent = JSON.stringify({
            generatedAt: report.at,
            problems: report.problems,
            advisories: report.advisories,
            groups: report.groups
        }, null, 2);
    }
}

function _devToolsHealthEscape(text) {
    return String(text === undefined || text === null ? '' : text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function devToolsHealthRefresh() {
    // Collection reads the mutation queue, so it resolves asynchronously. The
    // report is returned as a promise and callers that need the value must
    // await it.
    return collectDevToolsHealth().then(function (report) {
        devToolsHealthRender(report);
        return report;
    });
}

function devToolsHealthCopyReport() {
    if (devToolsHealthLastReport) {
        _devToolsHealthCopyPayload(JSON.stringify(devToolsHealthLastReport, null, 2));
        return;
    }
    // No report yet: take one first rather than copying an empty payload.
    devToolsHealthRefresh().then(function (report) {
        _devToolsHealthCopyPayload(JSON.stringify(report, null, 2));
    });
}

function _devToolsHealthCopyPayload(payload) {
    const fallback = () => {
        if (typeof showToast === 'function') showToast('Copy failed — the report is in the JSON panel below.', 'warning');
    };

    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(payload).then(
            () => { if (typeof showToast === 'function') showToast('Health report copied.', 'success'); },
            fallback
        );
        return;
    }
    fallback();
}

/**
 * Run the checks when the tab is first opened so the panel is never blank.
 * devToolsSwitchTab is convention-driven, so this only has to notice its own
 * tab id.
 */
function _devToolsHealthWatchTab() {
    if (_devToolsHealthWatchTab.__bound) return;
    _devToolsHealthWatchTab.__bound = true;
    document.addEventListener('click', function (event) {
        const btn = event.target && event.target.closest
            ? event.target.closest('#devtools-tab-bar .devtools-tab')
            : null;
        if (!btn || btn.getAttribute('data-tab') !== 'health') return;
        devToolsHealthRefresh();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _devToolsHealthWatchTab);
} else {
    _devToolsHealthWatchTab();
}