const idOf = row => row && (row._docId || row.id);
const sameUser = (row, user) => !!row && (row.userId ? row.userId === idOf(user) : [row.studentId, row.actorId, row.recipientId, row.targetUserId].some(id => id && id === idOf(user)));
const collections = ['pseudopy_users', 'pseudopy_exercises', 'pseudopy_activity', 'pseudopy_passwordRequests', 'pseudopy_auditLog', 'pseudopy_notifications', 'pseudopy_devices'];
function canRead(user, collection, row) {
    if (!user || !row || !collections.includes(collection)) return false;
    if (user.role === 'admin') return true;
    const uid = idOf(user);
    if (collection === 'pseudopy_users') return idOf(row) === uid || (user.role === 'instructor' && row.role === 'student' && row.instructorId === uid);
    if (collection === 'pseudopy_exercises') {
        const owner = user.role === 'student' ? user.instructorId : uid;
        return !!owner && (row.instructorId === owner || row.createdBy === owner);
    }
    if (collection === 'pseudopy_devices') return row.userId === uid;
    if (collection === 'pseudopy_notifications') return sameUser(row, user) || row.instructorId === uid;
    return sameUser(row, user) || (user.role === 'instructor' && row.instructorId === uid);
}
function canWrite(user, collection, previous, next, method) {
    if (!user || !collections.includes(collection)) return false;
    if (user.role === 'admin') return true;
    const uid = idOf(user);
    if (method === 'DELETE') return user.role === 'instructor' && ['pseudopy_exercises','pseudopy_users'].includes(collection) && canRead(user, collection, previous) && idOf(previous) !== uid;
    if (!next) return false;
    if (previous && !canRead(user, collection, previous)) return false;
    if (collection === 'pseudopy_users') {
        if (idOf(next) === uid) {
            const allowed = new Set(['fullName','email','passwordHash','passwordSalt','lastPasswordChange','lastLogin']);
            return previous && Object.keys(next).every(k => JSON.stringify(previous[k]) === JSON.stringify(next[k]) || allowed.has(k));
        }
        const allowed = new Set(['fullName','username','email','status','section','studentId']);
        return user.role === 'instructor' && next.role === 'student' && next.instructorId === uid && (!previous || (previous.role === 'student' && Object.keys(next).every(k => JSON.stringify(previous[k]) === JSON.stringify(next[k]) || allowed.has(k))));
    }
    if (collection === 'pseudopy_exercises') return user.role === 'instructor' && next.instructorId === uid && next.createdBy === uid;
    if (collection === 'pseudopy_activity') return user.role === 'student' && next.userId === uid && next.instructorId === (user.instructorId || null);
    if (collection === 'pseudopy_auditLog') return !previous && next.actorId === uid;
    if (collection === 'pseudopy_passwordRequests') {
        const allowed = new Set(['status','reviewedAt','reviewedBy','reviewedByName','resetToken','tokenExpiresAt','tokenUsed']);
        return user.role === 'instructor' && previous && previous.instructorId === uid && previous.status === 'pending' && ['approved','rejected','expired'].includes(next.status) && Object.keys(next).every(k=>JSON.stringify(previous[k])===JSON.stringify(next[k]) || allowed.has(k));
    }
    if (collection === 'pseudopy_notifications') {
        if (!previous) return user.role === 'instructor' && next.instructorId === uid && !!next.studentId;
        return sameUser(previous,user) && Object.keys(next).every(k=>JSON.stringify(next[k])===JSON.stringify(previous[k]) || k==='isRead');
    }
    if (collection === 'pseudopy_devices') return previous && previous.userId === uid && Object.keys(next).every(k => JSON.stringify(next[k]) === JSON.stringify(previous[k]) || k === 'lastSeenAt');
    return false;
}
function publicRecord(row) {
    if (!row) return row;
    const { password, passwordHash, passwordSalt, passwordScrypt, proofHash, resetToken, ...safe } = row;
    return safe;
}
module.exports = { idOf, sameUser, collections, canRead, canWrite, publicRecord };
