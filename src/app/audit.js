/* ============================================================
   AUDIT LOG HELPER
   ============================================================ */

/**
 * Records an audit action. NEVER logs passwords or hashes.
 */
async function logAuditAction({ action, studentId, studentName, username, instructorId, instructorName, requestId }) {
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
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        console.warn('[Audit] Failed to write audit log:', e);
    }
}


