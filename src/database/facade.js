/* ============================================================
   LEGACY Database facade (kept for the verify_app_refactor.js
   suite contract). New code calls the low-level helper family
   (dbGetAll, dbAdd, dbUpdate) directly and must not rely on this
   class.

   NOTE: `dbDelete` no longer performs a Firestore delete. Profile
   deletion goes through deleteStudentProfile(); `deleteUser` below
   only forwards to it, and without a typed-username confirmation it
   refuses rather than deleting.
   ============================================================ */

class Database {
    constructor() { this.ready = true; }
    async getUsers() { return await dbGetAll(usersRef); }
    async getUserByUsername(username) {
        const users = await dbGetAll(usersRef);
        const norm = normalizeUsername(username);
        return users.find(u => u.username === norm || u.username === username) || null;
    }
    async addUser(user) { return await dbAdd(usersRef, user); }
    async updateUser(userId, updates) { return await dbUpdate(usersRef, userId, updates); }
    // Persistent profile deletion requires the authorized, audited path in
    // student-deletion.js; this method deliberately cannot perform it.
    async deleteUser(userId) {
        return await deleteStudentProfile(userId, { confirmUsername: '' });
    }
    async getExercises() { return await dbGetAll(exercisesRef); }
    async getExerciseById(id) { return await dbGet(exercisesRef, id); }
    async addExercise(exercise) { return await dbAdd(exercisesRef, exercise); }
    async updateExercise(exerciseId, updates) { return await dbUpdate(exercisesRef, exerciseId, updates); }
    async deleteExercise(exerciseId) {
        return await dbUpdate(exercisesRef, exerciseId, { status: 'archived', archivedAt: new Date().toISOString() });
    }
    async getSubmissions() { return await dbGetAll(activityRef); }
    async addSubmission(submission) { return await dbAdd(activityRef, submission); }
    async getPasswordChangeHistory() { return await dbGetAll(passwordRequestsRef); }
    async addPasswordChangeRequest(request) { return await dbAdd(passwordRequestsRef, request); }
}

const db = new Database();