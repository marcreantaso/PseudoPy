/* Controlled service-worker updates, independent of login and role pages. */
(function () {
    const dismissedKey = 'pseudopy_update_dismissed';
    let registration = null;
    let updating = false;
    let refreshing = false;
    let watchdog = null;
    let attempt = 0;
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(dismissedKey) === '1'; } catch (_) {}

    const element = id => document.getElementById(id);
    function setVisible(visible) {
        const banner = element('pwa-update-banner');
        if (!banner) return;
        banner.hidden = !visible;
        banner.classList.toggle('show', visible);
    }
    function setBusy(busy, labelText = 'Update Now') {
        const button = element('pwa-update-btn');
        if (button) {
            button.disabled = busy;
            button.classList.toggle('updating', busy);
            button.setAttribute('aria-busy', String(busy));
            const label = button.querySelector('[data-update-label]');
            if (label) label.textContent = labelText;
        }
        const later = element('pwa-later-btn');
        if (later) later.disabled = busy;
    }
    function showUpdateAvailable() {
        if (updating) return;
        const available = registration && registration.waiting && navigator.serviceWorker.controller;
        setVisible(Boolean(available && !dismissed));
    }
    function failUpdate() {
        if (!updating) return;
        clearTimeout(watchdog);
        updating = false;
        attempt++;
        setBusy(false, 'Try Update Again');
        const message = element('pwa-update-msg');
        if (message) message.textContent = 'The update could not finish. Try again or choose Later.';
        setVisible(true);
    }
    async function applyPWAUpdate() {
        if (updating || refreshing) return;
        // Start the timeout before looking up the registration. `ready` can
        // remain pending forever when there is no active service worker.
        updating = true;
        const currentAttempt = ++attempt;
        setBusy(true, 'Updating...');
        watchdog = setTimeout(failUpdate, 8000);
        try {
            if (!registration) registration = await navigator.serviceWorker.getRegistration();
            if (currentAttempt !== attempt || !updating) return;
            const worker = registration && registration.waiting;
            if (!worker || !navigator.serviceWorker.controller) {
                clearTimeout(watchdog);
                updating = false;
                setBusy(false);
                setVisible(false);
                return;
            }
            // Keep unsaved work and the existing persisted login across reload.
            if (typeof window.maybeSaveEditorDraft === 'function') window.maybeSaveEditorDraft();
            worker.postMessage({ type: 'SKIP_WAITING' });
        } catch (_) {
            failUpdate();
        }
    }
    function dismissPWAUpdate() {
        if (updating) return;
        dismissed = true;
        setVisible(false);
        try { sessionStorage.setItem(dismissedKey, '1'); } catch (_) {}
    }
    window.applyPWAUpdate = applyPWAUpdate;
    window.dismissPWAUpdate = dismissPWAUpdate;

    function initialize() {
        setVisible(false);
        element('pwa-update-btn')?.addEventListener('click', applyPWAUpdate);
        element('pwa-later-btn')?.addEventListener('click', dismissPWAUpdate);
        if (!('serviceWorker' in navigator)) return;
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;

        navigator.serviceWorker.addEventListener('controllerchange', function () {
            // A first install or another tab's activation is not a request to
            // reload this page. Only the user-initiated update reloads once.
            if (!updating || refreshing) return;
            refreshing = true;
            clearTimeout(watchdog);
            try { sessionStorage.removeItem(dismissedKey); } catch (_) {}
            window.location.reload();
        });

        navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
            registration = reg;
            function watchInstalling() {
                const worker = reg.installing;
                if (!worker) return;
                worker.addEventListener('statechange', function () {
                    if (worker.state === 'installed') showUpdateAvailable();
                });
            }
            reg.addEventListener('updatefound', watchInstalling);
            watchInstalling();
            showUpdateAvailable();
            checkForUpdate();
        }).catch(error => console.warn('[PWA] Registration failed:', error));

        function checkForUpdate() {
            if (!registration || updating) return;
            showUpdateAvailable();
            registration.update().then(showUpdateAvailable).catch(() => {});
        }
        window.addEventListener('pageshow', checkForUpdate);
        window.addEventListener('focus', checkForUpdate);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
    else initialize();
})();
