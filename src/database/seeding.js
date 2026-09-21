// ══════════════════════════════════════════════════════════════
//  AUTOMATIC SEEDING LOGIC
// ══════════════════════════════════════════════════════════════

async function batchSeed(collectionName, items) {
    if (!firestoreReady()) return;
    const batch = firestore.batch();
    items.forEach(item => {
        const ref = firestore.collection(collectionName).doc(item._docId || item.id);
        batch.set(ref, item);
    });
    await withFirestoreTimeout(batch.commit());
}

async function seedDatabase() {
    try {
        if (!firestoreReady()) return true;

        console.log('[Database] Checking Firestore collections...');
        const userSnap = await withFirestoreTimeout(firestore.collection(usersRef).get());
        if (userSnap.empty) {
            console.log('[Database] Seeding initial users into Firestore...');
            await batchSeed(usersRef, getInitialSeedUsers());
            console.log('[Database] Users seeded ✅');
        }

        const exSnap = await withFirestoreTimeout(firestore.collection(exercisesRef).get());
        if (exSnap.size < 30) {
            console.log('[Database] Seeding initial exercises into Firestore...');
            await batchSeed(exercisesRef, SEED_EXERCISES_LIST);
            console.log('[Database] Exercises seeded ✅');
        }

        const actSnap = await withFirestoreTimeout(firestore.collection(activityRef).get());
        if (actSnap.empty) {
            console.log('[Database] Seeding sample activity into Firestore...');
            await batchSeed(activityRef, SEED_ACTIVITY_LIST);
            console.log('[Database] Activity seeded ✅');
        }

        if (PseudoPyLearning && PseudoPyLearning.register && PseudoPyLearning.register.evidenceStore) {
            const evSnap = await withFirestoreTimeout(firestore.collection(evidenceRef).get());
            if (evSnap.empty) {
                console.log('[Database] Seeding learning evidence into Firestore...');
                const seeds = PseudoPyLearning.register.evidenceStore.getSeedEvidence();
                await batchSeed(evidenceRef, seeds);
                console.log('[Database] Learning evidence seeded ✅');
            }
        }
    } catch (err) {
        console.warn('[Database] Seeding notice (local fallback active):', err.message);
    }
    return true;
}

