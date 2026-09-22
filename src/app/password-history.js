/* ============================================================
   ADMIN: PASSWORD CHANGE HISTORY (Read-Only)
   The read-only history table is rendered by the live
   loadPasswordRequests() in admin-security.js; this module only
   owns the pending recovery-request badge.
   ============================================================ */

// Update pending recovery requests badge on instructor nav
async function updatePendingRequestsBadge() {
    // Update pending recovery requests badge on instructor nav
    try {
        const requests = await dbGetAll(passwordRequestsRef);
        const pending = requests.filter(r => r.type === 'recovery' && r.status === 'pending');
        const badge = $id('nav-recovery-badge');
        if (badge) {
            badge.textContent = pending.length > 0 ? String(pending.length) : '';
            badge.style.display = pending.length > 0 ? 'inline-flex' : 'none';
        }
    } catch (e) { /* non-critical */ }
}


