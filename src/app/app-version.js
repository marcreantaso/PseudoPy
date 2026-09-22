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
}