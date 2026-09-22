/* ============================================================
   APP / SYSTEM IDENTITY — single source of truth
   Used by the Privacy, Terms and About surfaces. Do not put
   secrets or confidential material here; it ships to browsers.

   Version is substituted at build time from package.json.
   Organization and team were prefilled from the project's
   thesis manuscript (see PSEUDO_MANUSCRIPT (1).md). Fields that
   the system owner still must provide are empty:
   - contactEmail
   - privacyEffectiveDate
   - termsEffectiveDate

   Missing fields are surfaced only in development (localhost /
   explicit window.APP_CONFIG.development); production never
   exposes "[pending owner configuration]" to ordinary users.
   ============================================================ */

const APP_INFO = {
    name: 'PseudoPy',
    shortName: 'PseudoPy',
    version: '__PSEUDOPY_VERSION__',
    description: 'An educational pseudocode-to-Python translator with role-based '
        + 'dashboards, exercises, learning analytics and authorized-device security.',
    organization: 'Pamantasan ng Cabuyao - College of Computing Studies',
    // Ownership confirmed by the project lead.
    founder: 'Mikaella C. Daet',
    coFounder: 'Marc Gian R. Reantaso',
    technicalTeam: [
        'Eduard Mirandilla',
        'Mark Bautista'
    ],
    // Backward-compatible full list for legacy UI paths.
    developmentTeam: [
        'Mikaella C. Daet',
        'Marc Gian R. Reantaso',
        'Eduard Mirandilla',
        'Mark Bautista'
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

/** Machine + human labels for the fields the owner may leave empty. */
const APP_INFO_FIELD_LABELS = {
    contactEmail: 'official contact address',
    privacyEffectiveDate: 'privacy policy effective date',
    termsEffectiveDate: 'terms of use effective date'
};

/** True on local/preview hosts. Tests may pass an explicit hostname, or flip
 *  window.APP_CONFIG.development to force dev mode without host sniffing. */
function appIsDevelopment(hostname) {
    if (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.development === true) return true;
    const h = String(hostname || (typeof window !== 'undefined' && window.location ? window.location.hostname : '')).toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local');
}

/** Lists only the owner configuration keys that are genuinely missing. */
function appInfoMissingFields() {
    return Object.keys(APP_INFO_FIELD_LABELS).filter(key => {
        const v = APP_INFO[key];
        return !(v && String(v).trim() !== '');
    }).map(key => ({ key, label: APP_INFO_FIELD_LABELS[key] }));
}

/** Renders a configured value, or, when missing, a development-only marker.
 *  Production callers treat an empty string as "omit this row entirely". */
function appInfoField(value, key) {
    if (value && String(value).trim() !== '') return String(value);
    if (!appIsDevelopment()) return '';
    const label = (key && APP_INFO_FIELD_LABELS[key]) || 'configuration';
    return '[development: ' + label + ' not yet configured]';
}

/** True while any owner-facing configuration is still missing. */
function appInfoPending() {
    return appInfoMissingFields().length > 0;
}