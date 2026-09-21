// Local Storage Fallback Map
function getLocalCollection(ref) {
    let list = null;
    try {
        const raw = localStorage.getItem(`pseudopy_local_${ref}`);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
                list = parsed;
            }
        }
    } catch (e) { }

    if (!list) {
        if (ref === usersRef) list = getInitialSeedUsers();
        else if (ref === exercisesRef) list = SEED_EXERCISES_LIST;
        else if (ref === activityRef) list = getInitialSeedActivity();
        else if (ref === evidenceRef && PseudoPyLearning && PseudoPyLearning.register) list = PseudoPyLearning.register.evidenceStore.getSeedEvidence();
        else list = [];
    }

    // Guarantee that standard seed instructor exists in user list
    if (ref === usersRef && Array.isArray(list)) {
        const hasMarc = list.some(u => u.username === 'mreantaso_instructor' || u.id === 'u2' || u._docId === 'u2');
        if (!hasMarc) {
            const marc = getInitialSeedUsers().find(u => u.username === 'mreantaso_instructor');
            if (marc) list.splice(1, 0, marc);
        }
    }

    // Guarantee that activity list always has the full rich demo dataset merged in
    if (ref === activityRef && Array.isArray(list)) {
        if (list.length < 15) {
            list = getInitialSeedActivity();
        } else {
            // Merge missing seed records so chart always has all demo bars
            const seedRecords = getInitialSeedActivity();
            const existingIds = new Set(list.map(a => a._docId));
            const missingSeeds = seedRecords.filter(s => !existingIds.has(s._docId));
            if (missingSeeds.length > 0) list = [...list, ...missingSeeds];
        }
    }

    setLocalCollection(ref, list);
    return list;
}

function setLocalCollection(ref, data) {
    try {
        localStorage.setItem(`pseudopy_local_${ref}`, JSON.stringify(data));
    } catch (e) { }
}

