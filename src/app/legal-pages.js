/* ============================================================
   LEGAL / ABOUT PAGES (Privacy Policy, Terms of Use)
   In-app document views reachable before and after sign-in.
   Content lives in the index.html #legal-pages sections and
   reflects the application's actual data practices. Values come
   from APP_INFO (single source). Missing owner values are shown
   to developers only; production omits unfinished rows.
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

/** Fill APP_INFO-driven values. Configured fields always render; missing
 *  fields render a development marker on localhost and are hidden in
 *  production so the public never sees "[pending owner configuration]". */
function renderLegalPlaceholders() {
    const set = (id, value, key) => {
        const el = $id(id);
        if (el) el.textContent = appInfoField(value, key);
    };
    set('legal-app-name', APP_INFO.name);
    set('legal-app-name-2', APP_INFO.name);
    set('legal-org', APP_INFO.organization);
    set('legal-org-2', APP_INFO.organization);
    const team = (APP_INFO.developmentTeam || []).join(', ');
    set('legal-team', team);
    set('legal-version', APP_INFO.version ? 'v' + APP_INFO.version : '');
    set('legal-collections', (APP_INFO.collections || []).join(', '));
    set('legal-contact', APP_INFO.contactEmail, 'contactEmail');
    set('legal-contact-2', APP_INFO.contactEmail, 'contactEmail');
    set('legal-contact-3', APP_INFO.contactEmail, 'contactEmail');
    set('legal-contact-4', APP_INFO.contactEmail, 'contactEmail');
    set('legal-privacy-date', APP_INFO.privacyEffectiveDate, 'privacyEffectiveDate');
    set('legal-terms-date', APP_INFO.termsEffectiveDate, 'termsEffectiveDate');

    // Hide the whole wrapping line when a required owner value is missing in
    // production (appInfoField returned an empty string).
    const rowPairs = [
        ['legal-privacy-date-row', 'legal-privacy-date'],
        ['legal-terms-date-row', 'legal-terms-date'],
        ['legal-contact-row-1', 'legal-contact'],
        ['legal-contact-row-2', 'legal-contact-2'],
        ['legal-contact-row-3', 'legal-contact-3'],
        ['legal-contact-row-4', 'legal-contact-4']
    ];
    rowPairs.forEach(pair => {
        const row = $id(pair[0]);
        const span = $id(pair[1]);
        if (row && span) {
            row.classList.toggle('hidden', String(span.textContent).trim() === '');
        }
    });

    set('about-app-name', APP_INFO.name);
    set('about-app-version', APP_INFO.version ? 'v' + APP_INFO.version : '');
    set('about-app-description', APP_INFO.description);
    set('about-org', APP_INFO.organization);
    set('about-founder', APP_INFO.founder || '—');
    set('about-cofounder', APP_INFO.coFounder || '—');
    set('about-tech', (APP_INFO.technicalTeam || []).map(n => n || '').filter(Boolean).join(', ') || '—');
    set('about-contact', APP_INFO.contactEmail, 'contactEmail');
    const aboutContactRow = $id('about-contact-row');
    if (aboutContactRow) {
        aboutContactRow.classList.toggle('hidden', !appInfoField(APP_INFO.contactEmail, 'contactEmail'));
    }

    // Development-only warning: list the exact fields still missing. Hidden in
    // production and hidden entirely once configuration is complete.
    const missing = appInfoMissingFields();
    const pending = $id('legal-pending-notice');
    if (pending) {
        pending.classList.toggle('hidden', !(missing.length > 0 && appIsDevelopment()));
        const intro = $id('legal-pending-text');
        if (intro) {
            intro.textContent = missing.length > 0
                ? 'Before public launch, complete: ' + missing.map(m => m.label).join(', ') + '. Hidden from public visitors until provided.'
                : '';
        }
    }
}

/** Renders the login-footer legal link bar (used by inline HTML handlers). */
function openLegalFromFooter(kind) { showLegalPage(kind); }