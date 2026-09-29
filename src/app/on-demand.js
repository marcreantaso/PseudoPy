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
}