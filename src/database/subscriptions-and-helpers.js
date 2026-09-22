// ══════════════════════════════════════════════════════════════
//  APP-LEVEL HELPERS & INTERFACE
// ══════════════════════════════════════════════════════════════

async function initDB() {
    return true;
}

async function refreshPasswordHistory() {
    return await dbGetAll(passwordRequestsRef);
}

function normalizeAuditRecord(record) {
    const action = record.action || (record.eventType ? record.eventType.toLowerCase() : 'unknown');
    return {
        ...record, action,
        actorId: record.actorId || record.instructorId || record.studentId || null,
        actorName: record.actorName || record.instructorName || record.studentName || record.actor || null,
        actorUsername: record.actorUsername || record.username || record.actor || null,
        actorRole: record.actorRole || (record.instructorId ? 'instructor' : record.studentId ? 'student' : null),
        targetType: record.targetType || (record.requestId ? 'password_request' : null),
        targetId: record.targetId || record.requestId || null,
        targetName: record.targetName || record.target || null,
        metadata: record.metadata || (record.details ? { details: record.details } : {})
    };
}

async function refreshAuditLog() {
    const records = await dbGetAll(auditLogRef);
    return records.map(normalizeAuditRecord)
        // Legacy partial writes must never appear as a fake Unknown event.
        .filter(record => record.action && record.action !== 'unknown' && record.actorId && record.actorName);
}

function subscribeCollection(ref, onChange, onError) {
    if (!firestoreReady() || typeof firestore.collection(ref).onSnapshot !== 'function') return () => {};
    let active = true;
    const unsubscribe = firestore.collection(ref).onSnapshot(snapshot => {
        if (!active) return;
        const records = snapshot.docs.map(doc => ({ _docId: doc.id, ...doc.data() }));
        setLocalCollection(ref, records);
        onChange(records);
    }, error => { if (active && typeof onError === 'function') onError(error); });
    return () => { active = false; if (typeof unsubscribe === 'function') unsubscribe(); };
}

function normalizeUsername(username) {
    if (!username) return '';
    const u = username.trim();
    if (u.toLowerCase() === 'admin') return 'Admin';
    if (u === 'emirandila_student') return 'emirandilla_student';
    if (u === 'mdaet_stude') return 'mdaet_student';
    return u;
}

// Ensure all seed exercises have instructor and creator assigned
SEED_EXERCISES_LIST.forEach(e => {
    if (!e.createdBy) e.createdBy = 'u2';
    if (!e.instructorId) e.instructorId = 'u2';
    if (!e.difficulty) e.difficulty = 'moderate';
});

