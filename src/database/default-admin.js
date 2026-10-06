// The legacy administrator bootstrap.
//
// HISTORY / WHY THIS NO LONGER RESETS CREDENTIALS
// ----------------------------------------------
// This file used to ship a password hash + salt and a migration that rewrote
// the administrator's profile on every local read. That could silently replace
// a password the owner had changed, restoring default credentials, and it put a
// credential in every browser bundle.
//
// The migration is now a NON-DESTRUCTIVE profile normalizer:
//   * it never writes `password`, `passwordHash` or `passwordSalt`
//   * it never overwrites `fullName` on an existing, renamed account
//   * it never touches any account other than the legacy administrator (u1)
//   * it is idempotent, so repeated reads cannot keep rewriting state
//
// Provisioning the first administrator is now an OWNER action performed in the
// Firebase console (email/password Auth provider + a `pseudopy_users/u1`
// record), documented in docs/OWNER-ACTIONS.md. No credential is bundled.

/** Identity fields for the legacy administrator record. Not credentials. */
function getDefaultAdminProfile() {
    return {
        fullName: 'Admin',
        username: 'Admin'
    };
}

/**
 * Normalize the legacy administrator record WITHOUT touching credentials.
 *
 * The migration previously rewrote the administrator's profile on every local
 * read, which could restore a default password after the owner changed it. With
 * the bundled credential gone there is nothing left to migrate, so this is now
 * deliberately a pure no-op: it returns the record exactly as stored and is
 * trivially idempotent. `getLocalCollection()` still calls it on every read, so
 * keeping it a no-op guarantees a changed password can never drift back.
 *
 * Provisioning the first administrator is an OWNER action performed in the
 * Firebase console; see docs/OWNER-ACTIONS.md.
 */
function upgradeDefaultAdminAccount(user) {
    return user;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getDefaultAdminProfile, upgradeDefaultAdminAccount };
}
