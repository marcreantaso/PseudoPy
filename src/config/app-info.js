/* ============================================================
   APP / SYSTEM IDENTITY — single source of truth
   Used by the Privacy, Terms and About surfaces. Do not put
   secrets or confidential material here; it ships to browsers.

   Version is substituted at build time from package.json.
   Organization and team were prefilled from the project's
   thesis manuscript (see PSEUDO_MANUSCRIPT (1).md). Fields that
   the system owner must still provide are empty and render as
   clearly marked placeholders in the UI:
   - contactEmail
   - privacyEffectiveDate
   - termsEffectiveDate
   ============================================================ */

const APP_INFO = {
    name: 'PseudoPy',
    shortName: 'PseudoPy',
    version: '__PSEUDOPY_VERSION__',
    description: 'An educational pseudocode-to-Python translator with role-based '
        + 'dashboards, exercises, learning analytics and authorized-device security.',
    organization: 'Pamantasan ng Cabuyao - College of Computing Studies',
    developmentTeam: [
        'Bautista, Mark Andrew S.',
        'Daet, Mikaella C.',
        'Mirandilla, Eduard John',
        'Reantaso, Marc Gian R.'
    ],
    contactEmail: '',
    privacyEffectiveDate: '',
    termsEffectiveDate: '',
    // Grow this list as data practices change so Privacy shows real behavior.
    collections: [
        'pseudopy_users',
        'pseudopy_exercises',
        'pseudopy_activity',
        'pseudopy_passwordRequests',
        'pseudopy_auditLog',
        'pseudopy_notifications',
        'pseudopy_devices',
        'pseudopy_evidence',
        'pseudopy_tutorialProgress'
    ]
};

window.APP_INFO = APP_INFO;

/** Renders a value or a clearly marked placeholder when the owner has not
 *  supplied the real configuration item yet. */
function appInfoField(value) {
    if (value && String(value).trim() !== '') return String(value);
    return '[pending owner configuration]';
}

/** True while any owner-facing configuration is still missing. */
function appInfoPending() {
    return !APP_INFO.contactEmail
        || !APP_INFO.privacyEffectiveDate
        || !APP_INFO.termsEffectiveDate;
}