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
    async deleteUser(userId) { return await dbDelete(usersRef, userId); }
    async getExercises() { return await dbGetAll(exercisesRef); }
    async getExerciseById(id) { return await dbGet(exercisesRef, id); }
    async addExercise(exercise) { return await dbAdd(exercisesRef, exercise); }
    async updateExercise(exerciseId, updates) { return await dbUpdate(exercisesRef, exerciseId, updates); }
    async deleteExercise(exerciseId) { return await dbDelete(exercisesRef, exerciseId); }
    async getSubmissions() { return await dbGetAll(activityRef); }
    async addSubmission(submission) { return await dbAdd(activityRef, submission); }
    async getPasswordChangeHistory() { return await dbGetAll(passwordRequestsRef); }
    async addPasswordChangeRequest(request) { return await dbAdd(passwordRequestsRef, request); }
}

const db = new Database();

console.log('[Database] PseudoPy Central Database client ready ✅');
