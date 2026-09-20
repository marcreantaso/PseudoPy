/* ============================================================
   FIRESTORE DATA REFRESH HELPERS
   ============================================================ */

async function refreshUsers() {
    cachedUsers = await dbGetAll(usersRef);
    return cachedUsers;
}

async function refreshExercises() {
    cachedExercises = await dbGetAll(exercisesRef);
    return cachedExercises;
}

async function refreshActivity() {
    cachedActivity = await dbGetAll(activityRef);
    return cachedActivity;
}


