/* ============================================================
   APP VERSION — injected at build time from package.json
   The build substitutes __PSEUDOPY_VERSION__ with the package
   version so the version is never hardcoded in this repo.
   ============================================================ */

const APP_VERSION = '__PSEUDOPY_VERSION__';
window.APP_VERSION = APP_VERSION;

/**
 * Renders the app version into the login footer and Settings About row.
 */
function renderAppVersion() {
    if (!window.APP_VERSION) return;
    const loginEl = $id('login-version');
    if (loginEl) loginEl.textContent = 'PseudoPy v' + window.APP_VERSION;
    const settingsEl = $id('settings-version');
    if (settingsEl) settingsEl.textContent = 'Version ' + window.APP_VERSION;
}