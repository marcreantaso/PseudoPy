/* ============================================================
   PWA: CONTROLLED UPDATE FLOW
   Service Worker registration + controlled-update banner logic.
   Extracted from the inline script formerly in index.html so the
   update flow lives in the app layer (added last to the app bundle).
   Keyboard/nav caveats and the update banner DOM remain in index.html.
   ============================================================ */

(function () {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        // Dev mode: Disable caching and unregister Service Workers to prevent stale files on refresh
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                for (let registration of registrations) { registration.unregister(); }
            });
        }
        if ('caches' in window) {
            caches.keys().then(names => { for (let name of names) { caches.delete(name); } });
        }
        return;
    }
    if (!('serviceWorker' in navigator)) return;

    let refreshing = false;
    let bannerState = 'idle'; // idle | updating | failed

    function setUpdateMessage() {
        var msg = document.getElementById('pwa-update-msg');
        if (!msg) return;
        msg.textContent = window.APP_VERSION
            ? 'PseudoPy v' + window.APP_VERSION + ' — a new version is available.'
            : 'A new version of PseudoPy is available.';
    }

    function showUpdateAvailable(reg) {
        var banner = document.getElementById('pwa-update-banner');
        if (!banner || !navigator.serviceWorker.controller) return;
        if (!reg.waiting) return;
        // "Later" hides this update for the current tab session; it can still
        // be surfaced again on the next tab / app open while the worker waits.
        if (bannerState !== 'failed') {
            try { if (sessionStorage.getItem(STORAGE_KEYS.UPDATE_DISMISSED) === '1') return; } catch (e) {}
        }
        if (bannerState === 'updating') return;
        setUpdateMessage();
        banner.classList.add('show');
    }

    function applyPWAUpdate() {
        var banner = document.getElementById('pwa-update-banner');
        var updateBtn = document.getElementById('pwa-update-btn');
        var laterBtn = document.getElementById('pwa-later-btn');
        if (!banner || !updateBtn || bannerState === 'updating') return;

        navigator.serviceWorker.ready.then(function (reg) {
            var worker = reg.waiting;
            if (!worker || !navigator.serviceWorker.controller) {
                banner.classList.remove('show');
                return;
            }

            bannerState = 'updating';
            updateBtn.disabled = true;
            updateBtn.classList.add('updating');
            updateBtn.setAttribute('aria-busy', 'true');
            var label = updateBtn.querySelector('[data-update-label]');
            if (label) label.textContent = 'Updating...';
            if (laterBtn) laterBtn.disabled = true;

            // Preserve unsaved editor work before the update reload.
            try { if (window.maybeSaveEditorDraft) maybeSaveEditorDraft(); } catch (e) {}

            // If controllerchange never fires (e.g. platform edge case), reset to
            // a recoverable failure state rather than leaving a dead spinner.
            var watchdog = setTimeout(function () {
                if (bannerState === 'updating') {
                    bannerState = 'failed';
                    updateBtn.disabled = false;
                    updateBtn.classList.remove('updating');
                    updateBtn.setAttribute('aria-busy', 'false');
                    if (label) label.textContent = 'Update failed. Try again.';
                    if (laterBtn) laterBtn.disabled = false;
                    try { sessionStorage.removeItem(STORAGE_KEYS.UPDATE_DISMISSED); } catch (e) {}
                    showUpdateAvailable(reg);
                }
            }, 8000);

            navigator.serviceWorker.addEventListener('controllerchange', function onChanged() {
                clearTimeout(watchdog);
                navigator.serviceWorker.removeEventListener('controllerchange', onChanged);
            });

            worker.postMessage({ type: 'SKIP_WAITING' });
            // The top-level controllerchange handler below reloads once.
        }).catch(function () {
            bannerState = 'failed';
            updateBtn.disabled = false;
            updateBtn.classList.remove('updating');
            updateBtn.setAttribute('aria-busy', 'false');
            var label = updateBtn.querySelector('[data-update-label]');
            if (label) label.textContent = 'Update failed. Try again.';
            if (laterBtn) laterBtn.disabled = false;
        });
    }

    function dismissPWAUpdate() {
        var banner = document.getElementById('pwa-update-banner');
        if (banner) banner.classList.remove('show');
        bannerState = 'idle';
        try { sessionStorage.setItem(STORAGE_KEYS.UPDATE_DISMISSED, '1'); } catch (e) {}
    }

    window.applyPWAUpdate = applyPWAUpdate;
    window.dismissPWAUpdate = dismissPWAUpdate;

    // Platform caveat: on iOS 16.4+ Home-Screen PWAs, update detection is
    // only live while the app is running; after a release users may need to
    // close and relaunch the app (or open it from Safari once) to receive it.
    // The Update Now flow below requires an active service worker controller;
    // if none exists yet the banner stays hidden (first install auto-activates).
    function registerPWAUpdate() {
        navigator.serviceWorker.register('sw.js').then(function (reg) {
            console.log('[PWA] Service Worker registered:', reg.scope);

            // First-ever install: activate immediately (no prior version exists).
            if (!navigator.serviceWorker.controller && reg.waiting) {
                reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }

            // Already waiting when this tab opened.
            if (reg.waiting && navigator.serviceWorker.controller) {
                showUpdateAvailable(reg);
            }

            reg.onupdatefound = function () {
                var installingWorker = reg.installing;
                if (!installingWorker) return;
                installingWorker.onstatechange = function () {
                    if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // Real new worker sitting in "waiting" -> surface the banner.
                        showUpdateAvailable(reg);
                    }
                };
            };

            if (typeof reg.update === 'function') {
                reg.update().then(function () {
                    if (reg.waiting && navigator.serviceWorker.controller) showUpdateAvailable(reg);
                }).catch(function () {});
            }
        }).catch(function (err) {
            console.warn('[PWA] SW registration failed:', err);
        });

        // Reload ONCE when the newly activated worker takes control.
        navigator.serviceWorker.addEventListener('controllerchange', function () {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });

        // Re-surface a still-waiting update at an appropriate later time.
        ['pageshow', 'focus'].forEach(function (evt) {
            window.addEventListener(evt, function () {
                navigator.serviceWorker.ready.then(function (reg) {
                    if (reg.waiting && navigator.serviceWorker.controller) showUpdateAvailable(reg);
                }).catch(function () {});
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', registerPWAUpdate);
    } else {
        registerPWAUpdate();
    }
})();