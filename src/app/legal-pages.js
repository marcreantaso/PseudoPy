/* ============================================================
   LEGAL / ABOUT PAGES (Privacy Policy, Terms of Use)
   In-app document views reachable before and after sign-in.
   Content lives in the index.html #legal-pages sections and
   reflects the application's actual data practices. Owner-
   provided organization / contact / effective-date values come
   from APP_INFO; missing values render as marked placeholders.
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

/** Fill APP_INFO-driven values and surface pending-owner markers. */
function renderLegalPlaceholders() {
    const set = (id, value) => {
        const el = $id(id);
        if (el) el.textContent = appInfoField(value);
    };
    set('legal-app-name', APP_INFO.name);
    set('legal-app-name-2', APP_INFO.name);
    set('legal-org', APP_INFO.organization);
    set('legal-org-2', APP_INFO.organization);
    const team = (APP_INFO.developmentTeam || []).join(', ');
    set('legal-team', team);
    set('legal-version', APP_INFO.version ? 'v' + APP_INFO.version : '');
    set('legal-collections', (APP_INFO.collections || []).join(', '));
    set('legal-contact', APP_INFO.contactEmail);
    set('legal-contact-2', APP_INFO.contactEmail);
    set('legal-contact-3', APP_INFO.contactEmail);
    set('legal-contact-4', APP_INFO.contactEmail);
    set('legal-privacy-date', APP_INFO.privacyEffectiveDate);
    set('legal-terms-date', APP_INFO.termsEffectiveDate);

    set('about-app-name', APP_INFO.name);
    set('about-app-version', APP_INFO.version ? 'v' + APP_INFO.version : '');
    set('about-app-description', APP_INFO.description);
    set('about-org', APP_INFO.organization);
    const founder = APP_INFO.founder || '';
    const coFounder = APP_INFO.coFounder || '';
    const tech = (APP_INFO.technicalTeam || []).join(', ');
    set('about-team', 'Founder: ' + founder + (coFounder ? ' \u00b7 Co-Founder: ' + coFounder : '') + (tech ? ' \u00b7 Technical Team: ' + tech : ''));
    set('about-contact', APP_INFO.contactEmail);

    const pending = $id('legal-pending-notice');
    if (pending) {
        pending.classList.toggle('hidden', !appInfoPending());
        const intro = $id('legal-pending-text');
        if (intro) {
            intro.textContent = 'Project ownership is confirmed. Organization details, '
                + 'official contact information, and effective dates must still be '
                + 'reviewed before public launch. Fields marked '
                + '\u201c[pending owner configuration]\u201d are not yet finalized.';
        }
    }
}

/** Renders the login-footer legal link bar (used by inline HTML handlers). */
function openLegalFromFooter(kind) { showLegalPage(kind); }