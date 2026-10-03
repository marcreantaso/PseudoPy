// ============================================================
// USERNAME CLAIMS
//
// Why this exists
// ---------------
// saveUser checks uniqueness against `cachedUsers`, which is a snapshot this tab
// already had. Two tabs (or two instructors on two devices) can read the same
// snapshot, both conclude the username is free, and both write a profile.
// Firestore cannot enforce uniqueness on a field: a transaction cannot ask "does
// any profile already use this username", only read documents whose paths it
// already knows.
//
// So uniqueness is claimed at a path that IS known in advance — one document per
// normalized username — using the same transaction shape already used for
// student numbers. The winner writes the profile; the loser is told the name is
// taken instead of silently creating a second account.
//
// The claim id is derived from the normalized username, never from raw user
// input, so nothing reaches a document path before it has been normalized.
// ============================================================

const CLAIMS_COLLECTION = 'pseudopy_usernameClaims';
// 'u:' prefix, then the encoded username. % is permitted because unsafe
// characters are percent-encoded below.
const CLAIM_KEY_PATTERN = /^u:[a-z0-9._%\-]{1,96}$/;
const SAFE_USERNAME_CHAR = /^[a-z0-9._\-]$/;

class UsernameClaimError extends Error {
    constructor(message, claimedBy) {
        super(message);
        this.name = 'UsernameClaimError';
        this.code = 'username-claim-conflict';
        this.claimedBy = claimedBy || null;
    }
}

/**
 * Build the claim document id for a username.
 *
 * Normalizes to lower case and trims, because two usernames differing only by
 * case or surrounding whitespace are the same account as far as login is
 * concerned. Every character outside the safe set is percent-encoded and the
 * encoding is lower-cased, so the result is always a single Firestore document
 * id whose alphabet is entirely lower case: a username containing '/' can never
 * introduce a path separator, and 'a/b' and 'a%2Fb' cannot collide because the
 * literal '%' encodes to '%25'.
 *
 * No username is rejected here. Imposing a charset would be a product change,
 * and existing accounts may already use characters this encodes instead.
 */
function usernameClaimKey(username) {
    const normalized = String(username === undefined || username === null ? '' : username)
        .trim()
        .toLowerCase();
    if (!normalized) return '';

    let key = 'u:';
    for (const ch of normalized) {
        key += SAFE_USERNAME_CHAR.test(ch) ? ch : encodeURIComponent(ch).toLowerCase();
    }
    return key;
}

function isUsableClaimKey(key) {
    return CLAIM_KEY_PATTERN.test(String(key || ''));
}

/**
 * Claim a username for `ownerId`.
 *
 * Resolves `{ claimed: true, replayed }`. `replayed` is true when this owner
 * already holds the claim, which is what makes a retried submit safe: a request
 * addressing its own claim is not in conflict with itself.
 *
 * Throws UsernameClaimError when a different account holds the name, or when the
 * claim could not be verified at all. Callers must treat both as a refusal —
 * "could not verify" must never be treated as "free".
 */
async function claimUsername(username, ownerId) {
    const key = usernameClaimKey(username);
    if (!isUsableClaimKey(key)) {
        throw new UsernameClaimError('That username cannot be stored.', null);
    }
    if (!firestoreReady()) {
        // Offline: the local store is the only authority available, and the
        // cached uniqueness check in saveUser already ran against it.
        return { claimed: false, offline: true, replayed: false, key };
    }

    let outcome = null;
    try {
        await firestore.runTransaction(async (tx) => {
            const ref = firestore.collection(CLAIMS_COLLECTION).doc(key);
            const snap = await tx.get(ref);
            const data = snap.exists ? (snap.data() || {}) : {};
            const holder = data.ownerId ? String(data.ownerId) : '';

            if (holder && holder !== String(ownerId)) {
                outcome = { conflict: true, claimedBy: holder };
                return;
            }

            outcome = { conflict: false, replayed: !!holder };
            if (!holder) {
                tx.set(ref, {
                    ownerId: String(ownerId),
                    claimedAt: new Date().toISOString()
                });
            }
        });
    } catch (e) {
        if (e instanceof UsernameClaimError) throw e;
        // Could not establish the claim. Refusing is the safe direction: the
        // alternative is creating an account that cannot be logged into.
        throw new UsernameClaimError(
            'Could not verify that this username is available. Check your connection and try again.',
            null
        );
    }

    if (outcome && outcome.conflict) {
        throw new UsernameClaimError('That username is already taken.', outcome.claimedBy);
    }
    return {
        claimed: true,
        offline: false,
        replayed: !!(outcome && outcome.replayed),
        key
    };
}

/**
 * Release a claim. Only the holder may release it, so a writer that lost the
 * race cannot free a username the winner legitimately owns.
 */
async function releaseUsernameClaim(username, ownerId) {
    const key = usernameClaimKey(username);
    if (!isUsableClaimKey(key) || !firestoreReady()) return false;
    let released = false;
    try {
        await firestore.runTransaction(async (tx) => {
            const ref = firestore.collection(CLAIMS_COLLECTION).doc(key);
            const snap = await tx.get(ref);
            if (!snap.exists) return;
            const data = snap.data() || {};
            if (!data.ownerId || String(data.ownerId) !== String(ownerId)) return;
            tx.delete(ref);
            released = true;
        });
    } catch (e) {
        // A stale claim is not worth failing a save over. Worst case the name
        // stays reserved until the account is deleted, which is recoverable.
        return false;
    }
    return released;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        claimUsername,
        releaseUsernameClaim,
        usernameClaimKey,
        isUsableClaimKey,
        UsernameClaimError,
        CLAIMS_COLLECTION
    };
}