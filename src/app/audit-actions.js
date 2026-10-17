/* ============================================================
   AUDIT ACTION REGISTRY
   ------------------------------------------------------------
   Single source of truth for how a stored audit action code is
   presented. Records are NEVER rewritten or migrated: a friendly
   label, category and icon are computed at render time, so old
   logs and legacy rows keep working and a future code change
   cannot retroactively corrupt history.

   Raw codes must never reach a table cell. They are shown only in
   the event detail drawer.
   ============================================================ */

const AUDIT_ACTION_CATEGORIES = {
    account: { label: 'Account', icon: '{{ui:UserRound}}' },
    security: { label: 'Security', icon: '{{ui:ShieldCheck}}' }
};

/**
 * Applied to any code that is not in AUDIT_ACTIONS. The label is
 * humanized from the code; the raw code survives only in the drawer.
 * `known: false` lets the UI (and tests) tell the difference.
 */
const AUDIT_ACTION_FALLBACK = {
    icon: '{{ui:ClipboardList}}',
    category: 'security',
    badgeClass: 'audit-badge--neutral',
    severity: 'info',
    authorizedBy: 'actor'
};

/**
 * action code -> presentation metadata.
 *   label            friendly, sentence-case, shown in the table
 *   shortDescription one-line explanation shown in the detail drawer
 *   category         key into AUDIT_ACTION_CATEGORIES (filter chips)
 *   icon             offline UI token (ui-icons.js) rendered per row
 *   badgeClass       badge modifier class (see style.css)
 *   severity         info | success | warning | danger (never color-only)
 *   authorizedBy     'self' | 'actor' | 'system'
 */
const AUDIT_ACTIONS = {
    'password_changed': {
        label: 'Password changed',
        shortDescription: 'The account owner changed their own password. No password value is ever stored in the log.',
        category: 'security',
        icon: '{{ui:KeyRound}}',
        badgeClass: 'audit-badge--success',
        severity: 'success',
        authorizedBy: 'self'
    },
    'password_reset_requested': {
        label: 'Password reset requested',
        shortDescription: 'A recovery request was submitted for this account and is waiting for approval.',
        category: 'security',
        icon: '{{ui:Mail}}',
        badgeClass: 'audit-badge--info',
        severity: 'info',
        authorizedBy: 'self'
    },
    'password_reset_approved': {
        label: 'Password reset approved',
        shortDescription: 'An administrator authorized a one-time password reset for this account.',
        category: 'security',
        icon: '{{ui:CircleCheck}}',
        badgeClass: 'audit-badge--success',
        severity: 'success',
        authorizedBy: 'actor'
    },
    'password_reset_rejected': {
        label: 'Password reset rejected',
        shortDescription: 'An administrator declined the password recovery request for this account.',
        category: 'security',
        icon: '{{ui:CircleX}}',
        badgeClass: 'audit-badge--danger',
        severity: 'danger',
        authorizedBy: 'actor'
    },
    'password_reset_completed': {
        label: 'Password reset completed',
        shortDescription: 'The account owner finished the approved password reset and set a new password.',
        category: 'security',
        icon: '{{ui:CheckCheck}}',
        badgeClass: 'audit-badge--success',
        severity: 'success',
        authorizedBy: 'actor'
    },
    'student.soft-delete': {
        label: 'Student account removed',
        shortDescription: 'The student account was deactivated (soft-deleted) and can be restored within the undo window.',
        category: 'account',
        icon: '{{ui:UserMinus}}',
        badgeClass: 'audit-badge--warning',
        severity: 'warning',
        authorizedBy: 'actor'
    },
    'audit.history-cleared': {
        label: 'Audit history cleared',
        shortDescription: 'The security audit history was cleared from this device and the cloud.',
        category: 'security',
        icon: '{{ui:Trash2}}',
        badgeClass: 'audit-badge--neutral',
        severity: 'info',
        authorizedBy: 'actor'
    },
    // Reserved: not written yet, but registered so the codes are never raw
    // if a restore or permanent-delete audit write is added later.
    'student.restore': {
        label: 'Student account restored',
        shortDescription: 'A soft-deleted student account was reactivated.',
        category: 'account',
        icon: '{{ui:UserRound}}',
        badgeClass: 'audit-badge--success',
        severity: 'success',
        authorizedBy: 'actor'
    },
    'student.hard-delete': {
        label: 'Student account permanently deleted',
        shortDescription: 'The student account was permanently removed. This cannot be undone.',
        category: 'account',
        icon: '{{ui:Trash2}}',
        badgeClass: 'audit-badge--danger',
        severity: 'danger',
        authorizedBy: 'actor'
    }
};

// Dev-only guard so an unmapped code warns exactly once instead of on
// every re-render (the realtime subscription re-renders on every change).
const _auditActionWarned = new Set();

/** "report.exported" -> "Report exported"; null/empty -> "Unknown event". */
function humanizeAuditAction(code) {
    const raw = String(code == null ? '' : code).trim();
    if (!raw) return 'Unknown event';
    const words = raw.split(/[._\-\s]+/).filter(Boolean);
    if (!words.length) return 'Unknown event';
    const text = words.join(' ').toLowerCase();
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Resolve an action code to display metadata. Always returns a complete
 * object, so callers never need their own fallback branch.
 * @param {string} code stored audit action code
 * @returns {{label:string,shortDescription:string,category:string,icon:string,
 *            badgeClass:string,severity:string,authorizedBy:string,
 *            code:string,known:boolean}}
 */
function formatAuditAction(code) {
    const raw = String(code == null ? '' : code).trim();
    const has = key => Object.prototype.hasOwnProperty.call(AUDIT_ACTIONS, key);
    // Match exactly first, then case-insensitively so a legacy record with
    // different casing still gets its friendly label instead of a raw code.
    const key = has(raw) ? raw : (has(raw.toLowerCase()) ? raw.toLowerCase() : raw);
    if (has(key)) {
        return Object.assign({ code: raw, known: true }, AUDIT_ACTIONS[key]);
    }
    if (raw && raw !== 'unknown' && !_auditActionWarned.has(raw)) {
        _auditActionWarned.add(raw);
        if (typeof appIsDevelopment === 'function' && appIsDevelopment()) {
            console.warn('[Audit] Unmapped audit action code "' + raw
                + '". Add it to AUDIT_ACTIONS in src/app/audit-actions.js.');
        }
    }
    return Object.assign({}, AUDIT_ACTION_FALLBACK, {
        label: humanizeAuditAction(raw),
        shortDescription: 'No description is available for this event yet.',
        code: raw,
        known: false
    });
}

/** Category list for the filter chips, in registry order. */
function auditCategories() {
    return Object.keys(AUDIT_ACTION_CATEGORIES).map(key => ({
        key,
        label: AUDIT_ACTION_CATEGORIES[key].label,
        icon: AUDIT_ACTION_CATEGORIES[key].icon
    }));
}

/**
 * Who authorized the event, in friendly words. Never returns a bare "-".
 *  - 'self'   the account owner acted (e.g. changed their own password)
 *  - named    an instructor/admin name is recorded
 *  - 'System' otherwise (automatic or unattributed event)
 */
function resolveAuditAuthorizedBy(record, meta) {
    const m = meta || formatAuditAction(record && record.action);
    if (m.authorizedBy === 'self') return 'Self-service';
    const actorName = record && (record.actorName || record.instructorName);
    if (actorName) return actorName;
    return 'System';
}

/** Friendly absolute timestamp; falls back to an em dash for missing values. */
function formatAuditTimestamp(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Rough relative time used only as a tooltip, never as the sole label. */
function formatAuditRelativeTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    const seconds = Math.round((Date.now() - date.getTime()) / 1000);
    const abs = Math.abs(seconds);
    if (abs < 45) return 'just now';
    const units = [
        ['year', 31536000], ['month', 2592000], ['week', 604800],
        ['day', 86400], ['hour', 3600], ['minute', 60]
    ];
    for (const [unit, size] of units) {
        if (abs >= size) {
            const n = Math.round(abs / size);
            const plural = n === 1 ? '' : 's';
            return seconds >= 0 ? n + ' ' + unit + plural + ' ago' : 'in ' + n + ' ' + unit + plural;
        }
    }
    return 'just now';
}

// Loaded as a classic script in the browser, so these are globals too.
// Exported for the Node source harness used by the regression tests.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        AUDIT_ACTIONS,
        AUDIT_ACTION_CATEGORIES,
        humanizeAuditAction,
        formatAuditAction,
        auditCategories,
        resolveAuditAuthorizedBy,
        formatAuditTimestamp,
        formatAuditRelativeTime
    };
}
