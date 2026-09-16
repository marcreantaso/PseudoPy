"use strict";
const { COLLECTIONS, blankState, DomainError } = require("./academic-service");
const TABLES = {
  users: "pseudopy_users",
  devices: "pseudopy_devices",
  sessions: "pseudopy_sessions",
  audit: "pseudopy_auditLog",
  limits: "pseudopy_loginLimits",
  ...Object.fromEntries(COLLECTIONS.map((c) => [c, "pseudopy_academic_" + c])),
};
function firestoreStore() {
  const {
    initializeApp,
    getApps,
    cert,
    applicationDefault,
  } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");
  const options = process.env.FIREBASE_SERVICE_ACCOUNT
    ? { credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) }
    : {
        credential: applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID || "pseudopy-e7e74",
      };
  const app = getApps()[0] || initializeApp(options);
  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  return {
    async transact(fn) {
      return db.runTransaction(async (tx) => {
        const reads = await Promise.all(
          Object.entries(TABLES).map(async ([key, name]) => [
            key,
            await tx.get(db.collection(name).limit(5001)),
          ]),
        );
        const state = {};
        let count = 0;
        for (const [key, snap] of reads) {
          count += snap.size;
          state[key] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
        }
        if (count > 5000)
          throw new DomainError(
            503,
            "Academic pilot storage limit reached. Contact the administrator to archive or scale the store.",
          );
        const before = structuredClone(state);
        const result = await fn(state);
        let writes = 0;
        for (const [key, name] of Object.entries(TABLES)) {
          const old = new Map(before[key].map((r) => [r.id, r]));
          for (const row of state[key]) {
            if (JSON.stringify(row) !== JSON.stringify(old.get(row.id))) {
              if (++writes > 450)
                throw new DomainError(
                  413,
                  "This operation affects too many records. Use smaller classes.",
                );
              tx.set(
                db.collection(name).doc(row.id),
                JSON.parse(JSON.stringify(row)),
              );
            }
            old.delete(row.id);
          }
          for (const rid of old.keys()) {
            if (++writes > 450) throw new DomainError(413, "Too many records.");
            tx.delete(db.collection(name).doc(rid));
          }
        }
        return result;
      });
    },
  };
}
module.exports = { firestoreStore, TABLES };
