/* All persistent records are served by authenticated, role-scoped Firestore APIs. */
const usersRef = 'pseudopy_users';
const exercisesRef = 'pseudopy_exercises';
const activityRef = 'pseudopy_activity';
const passwordRequestsRef = 'pseudopy_passwordRequests';
const auditLogRef = 'pseudopy_auditLog';
const notificationsRef = 'pseudopy_notifications';
const devicesRef = 'pseudopy_devices';
let databaseStatus = { state: 'disconnected', lastSync: null };
function generateSalt() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), b=>b.toString(16).padStart(2,'0')).join('');
}
async function hashPassword(password,salt) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(password+salt))), b=>b.toString(16).padStart(2,'0')).join('');
}
async function apiRequest(path, method='GET', body) {
    const response = await fetch('/api/' + path, { method, credentials:'same-origin', cache:'no-store', headers:{'Content-Type':'application/json','X-PseudoPy-Request':'1'}, ...(body === undefined ? {} : {body:JSON.stringify(body)}) });
    let data;
    try { data = await response.json(); } catch { throw new Error('Server returned an invalid response. Start PseudoPy with npm start.'); }
    if (!response.ok) { const error = new Error(data.error || 'Request failed'); error.status=response.status; throw error; }
    return data;
}
async function initDB() { return apiRequest('health'); }
async function dbGetAll(ref, limit=null, offset=0) {
    try {
        const rows = await apiRequest(encodeURIComponent(ref));
        if (ref === activityRef) rows.sort((a,b)=>new Date(b.timestamp || b.time || 0)-new Date(a.timestamp || a.time || 0));
        if (ref === exercisesRef) rows.sort((a,b)=>String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        databaseStatus = {state:'synchronized',lastSync:new Date().toISOString()};
        return limit == null ? rows : rows.slice(offset,offset+limit);
    } catch (error) { databaseStatus.state='unavailable'; throw error; }
}
async function dbGet(ref,id) { try { return await apiRequest(encodeURIComponent(ref)+'/'+encodeURIComponent(id)); } catch(error) { if(error.status===404)return null; throw error; } }
async function dbSet(ref,id,data) { return apiRequest(encodeURIComponent(ref)+'/'+encodeURIComponent(id),'PUT',data); }
async function dbUpdate(ref,id,data) { return apiRequest(encodeURIComponent(ref)+'/'+encodeURIComponent(id),'PATCH',data); }
async function dbAdd(ref,data) { const id=data._docId || crypto.randomUUID(); await dbSet(ref,id,data); return id; }
async function dbDelete(ref,id) { return apiRequest(encodeURIComponent(ref)+'/'+encodeURIComponent(id),'DELETE'); }
async function dbCount(ref) { return (await apiRequest(encodeURIComponent(ref)+'/count')).count; }
async function dbClearCollection(ref) { for(const row of await dbGetAll(ref)) await dbDelete(ref,row._docId); }
async function refreshPasswordHistory() { return dbGetAll(passwordRequestsRef); }
function normalizeAuditRecord(record) {
    const action = record.action || (record.eventType ? record.eventType.toLowerCase() : 'unknown');
    return {
        ...record,
        action,
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
    return records.map(normalizeAuditRecord);
}

function normalizeUsername(username) {
    if (!username) return '';
    const u = username.trim();
    if (u === 'admin') return 'mbautista_admin';
    if (u === 'emirandila_student') return 'emirandilla_student';
    if (u === 'mdaet_stude') return 'mdaet_student';
    return u;
}

class Database {
    async getUsers() { return dbGetAll(usersRef); }
    async getUserByUsername(username) { return (await this.getUsers()).find(u=>u.username===normalizeUsername(username)) || null; }
    async addUser(user) { return dbAdd(usersRef,user); }
    async updateUser(id,data) { return dbUpdate(usersRef,id,data); }
    async deleteUser(id) { return dbDelete(usersRef,id); }
    async getExercises() { return dbGetAll(exercisesRef); }
    async getExerciseById(id) { return dbGet(exercisesRef,id); }
    async addExercise(data) { return dbAdd(exercisesRef,data); }
    async updateExercise(id,data) { return dbUpdate(exercisesRef,id,data); }
    async deleteExercise(id) { return dbDelete(exercisesRef,id); }
    async getSubmissions() { return dbGetAll(activityRef); }
    async addSubmission(data) { return dbAdd(activityRef,data); }
    async getPasswordChangeHistory() { return dbGetAll(passwordRequestsRef); }
    async addPasswordChangeRequest(data) { return dbAdd(passwordRequestsRef,data); }
}
const db = new Database();
