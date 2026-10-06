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
    // A dependency LIST. Every loader input is a list, so a bare URL can never
    // be indexed as a sequence of characters. (It was a bare string here, and
    // loadScripts indexed it per character: one request each for "h", "t", "t",
    // "p", "s", ":", "/" -- every one answered by the SPA HTML shell, so each
    // produced "Uncaught SyntaxError: Unexpected token '<'".)
    anime: ['https://cdn.jsdelivr.net/npm/animejs@4.5.0/dist/bundles/anime.umd.min.js']
};

/**
 * Coerce a loader argument into a validated, de-duplicated list of complete URLs.
 *
 * Accepts a single URL string or an array of them. A string is treated as ONE
 * dependency -- never as something to iterate character by character. Entries
 * that are not usable URLs are dropped with a warning instead of producing
 * hundreds of nonsense requests.
 */
function normalizeScriptList(srcList) {
    let raw;
    if (typeof srcList === 'string') {
        raw = [srcList];
    } else if (Array.isArray(srcList)) {
        raw = srcList;
    } else if (srcList && typeof srcList[Symbol.iterator] === 'function') {
        raw = Array.from(srcList);
    } else {
        return [];
    }

    const urls = [];
    for (let i = 0; i < raw.length; i++) {
        const entry = raw[i];
        if (typeof entry !== 'string') {
            console.warn('[OnDemand] Ignoring non-string dependency at index ' + i + '.');
            continue;
        }
        const url = entry.trim();
        if (!url) continue;
        // A real URL never contains raw whitespace or a newline. Anything that
        // does is a malformed dependency list, not a URL to request.
        if (/\s/.test(url)) {
            console.warn('[OnDemand] Ignoring malformed dependency (contains whitespace) at index ' + i + '.');
            continue;
        }
        if (urls.indexOf(url) === -1) urls.push(url);
    }
    return urls;
}

// One in-flight promise per URL. Concurrent callers share a single script
// element instead of each injecting their own copy.
const scriptLoadPromises = {};

/**
 * Load one script URL at most once per page. A settled promise is cached so a
 * second call for the same URL does not re-request it. A FAILED load is evicted
 * so an explicit later call can try once more -- a deliberate retry by a caller,
 * never an automatic loop.
 */
function loadScriptOnce(url) {
    const existing = scriptLoadPromises[url];
    if (existing) return existing;

    const pending = new Promise(function (resolve, reject) {
        const s = document.createElement('script');
        // No cache-busting query string: the service worker precaches these
        // exact URLs, so a query suffix would break the offline cache match.
        s.src = url;
        // Classic scripts must execute in dependency order, so this is never
        // async; loadScripts also awaits each URL before starting the next.
        s.async = false;
        s.onload = function () { resolve(url); };
        s.onerror = function () {
            reject(new Error('Failed to load script: ' + url));
        };
        document.head.appendChild(s);
    });

    pending.catch(function () { delete scriptLoadPromises[url]; });
    scriptLoadPromises[url] = pending;
    return pending;
}

/**
 * Load a dependency list in order, calling onSuccess once every script has
 * executed, or onError exactly once if any of them fails. Never throws, never
 * retries on its own, and reports success only when the list really loaded.
 */
async function loadScripts(srcList, onSuccess, onError) {
    const urls = normalizeScriptList(srcList);
    if (!urls.length) {
        console.warn('[OnDemand] No usable script dependencies to load.');
        if (onSuccess) onSuccess();
        return;
    }
    try {
        for (let i = 0; i < urls.length; i++) {
            await loadScriptOnce(urls[i]);
        }
        if (onSuccess) onSuccess();
    } catch (err) {
        if (onError) onError(err);
    }
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