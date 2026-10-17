/* ============================================================
   AUDIT LOG HELPER
   ============================================================ */

/**
 * Records an audit action. NEVER logs passwords or hashes.
 * `reason` is optional; when present it is stored verbatim so the event
 * detail view can explain why the action happened.
 */
async function logAuditAction({ action, studentId, studentName, username, instructorId, instructorName, requestId, reason }) {
    try {
        const logId = 'al_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        await dbSet(auditLogRef, logId, {
            _docId: logId,
            action,
            studentId: studentId || null,
            studentName: studentName || null,
            username: username || null,
            instructorId: instructorId || null,
            instructorName: instructorName || null,
            requestId: requestId || null,
            reason: reason || null,
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        console.warn('[Audit] Failed to write audit log:', e);
    }
}


