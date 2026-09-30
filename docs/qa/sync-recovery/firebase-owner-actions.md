# Defect 3 — Firebase configuration audit (report only)

At baseline master `eae428d`, the claimed active project/rules mismatch is **not reproduced**: the current configuration and both rule-file headers name `pseudopy-86149`. This agrees with the owner's supplied Firebase Console screenshot and web configuration. Live deployed rules, Vercel environment overrides, and project ownership were not accessed or independently verified.

## Every repository location containing a Firebase project ID

| File | Occurrence / purpose |
| --- | --- |
| `src/database/firebase.js` | `pseudopy-86149` default projectId, authDomain, databaseURL, storageBucket. Runtime override `window.__FIREBASE_CONFIG__` remains supported. |
| `database.js` | Generated copy of the same configuration. |
| `seed_firebase.html` | Independent seeding-tool configuration: projectId, authDomain, databaseURL, storageBucket also use `pseudopy-86149`. |
| `.firebaserc` | CLI default project `pseudopy-86149`. |
| `firestore.rules` | Header identifies `pseudopy-86149`; requires a migrated Firebase Auth identity model. |
| `firestore.interim.rules` | Header identifies `pseudopy-86149`; permits broad unauthenticated collection access. |
| `index.html` | Historical comments mention `pseudopy-86149` and the removed `pseudopy-e7e74` override; neither is an active inline configuration. |
| `AGENTS.md` | Documents the current project and historical `pseudopy-e7e74` mismatch. |

Search performed with `rg --hidden 'pseudopy-(86149|e7e74)|projectId'`, excluding git metadata, dependencies, vendor files, and this report. Generic `projectId` examples in imported skills are unrelated to Firebase. No additional literal Firebase project IDs were found. `firebase.json` contains no ID; it selects `firestore.interim.rules` for deployment.

## Owner actions

1. Verify the deployed Vercel app initializes `pseudopy-86149` and has no stale injected config or old service-worker asset. Compare Firebase Console Project Settings and the actual Firestore request project path before changing anything.
2. Review deployed rules against the actual login identity model and test them in the Firebase Emulator. Only the owner should deploy the reviewed rules to the confirmed project. Neither rule file nor `firebase.json` was modified or deployed in this work.
3. Decide on and plan Firebase Auth migration. Current app username/password login does not, by itself, establish a Firebase Auth UID. Do not deploy owner-scoped rules until account mapping and role authorization are verified. The interim rules explicitly allow broad reads/writes, including user records; they should not be treated as a secure production solution merely because synchronization works.
4. Review the existing browser API key's application/API restrictions and Firebase App Check compatibility. The committed Firebase web config and API key are public client identifiers, not service-account secrets. Data access must be protected by Security Rules and appropriate identity checks. API restrictions reduce abuse; they do not replace authorization. No keys were rotated or new credentials committed.
5. Update thesis wording after reviewing the offline scope report: distinguish client-side translation/runtime from optional cloud synchronization and optional Express/API hosting. Describe DOCX as unsupported unless implemented and tested.

Official reference: https://firebase.google.com/docs/projects/api-keys and https://firebase.google.com/support/guides/security-checklist .
