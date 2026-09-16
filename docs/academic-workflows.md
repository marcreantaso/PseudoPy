# Connected academic workflows

The updated study scope adds a separate backend-free `offline.html` lab. See [study scope](study-scope.md): the server requirements below apply to connected coursework, not local translation, execution, drafts, or benchmark evaluation.

This change replaces the mixed student task/translator view with role-specific routes while retaining vanilla JavaScript, Express, Firestore, the existing account collection, and the deterministic compiler. No production records were read, migrated, modified, or seeded during development.

## Root causes addressed

The old page reused exercise state for translation and coursework. Browser-side login downloaded credential-bearing user records; generic CRUD routes had no ownership enforcement. Local fallback seeded sample accounts and analytics. Serving the entire checkout also exposed non-public application files. These paths are retired from the production entry point and public build.

## Routes and records

Student: `/student/dashboard`, `/student/translator`, `/student/tasks`, `/student/tasks/:id`, `/student/submissions`, `/student/submissions/:id`, `/student/feedback`, `/student/settings`.

Instructor: `/instructor/dashboard`, `/instructor/classes`, `/instructor/classes/:id`, `/instructor/students`, `/instructor/exercises`, `/instructor/exercises/new`, `/instructor/exercises/:id/edit`, `/instructor/assignments`, `/instructor/assignments/new`, `/instructor/assignments/:id`, `/instructor/submissions`, `/instructor/submissions/:id`, `/instructor/analytics`, `/instructor/translator`, `/instructor/compiler-diagnostics`, `/instructor/settings`.

Admin: dashboard, accounts, device approvals, audit log, authorized academic views, translator, diagnostics, and settings under `/admin`.

`pseudopy_academic_` collections store classes, enrollments, reusable private exercises, assignments, task drafts, immutable attempts, review history, translator drafts, translations, notifications, request receipts, revision permissions, validation diagnostics, and execution telemetry separately. Credentials remain in `pseudopy_users`; existing device records remain in `pseudopy_devices`.

## Workflow guarantees

- Joining a class creates a pending request. Instructor approval activates enrollment and grants access to applicable published assignments. Removal blocks future task access but preserves the student's historical attempts and released reviews.
- Publication and recipient notifications share a Firestore transaction. Scheduled content becomes visible at availability time; reminders are computed when notifications are read. No external messages are sent.
- Each attempt preserves pseudocode, generated Python, validation, the original instructions, rubric, preview policy, deadline, version, timestamp, and attempt number. Assignment edits cannot rewrite these snapshots.
- Students receive neither instructor references nor private review drafts. Disabled translation and hint permissions also apply to historical attempt projections.
- Review drafts, released reviews, superseded releases, viewed timestamps, rubric scores, comments, revision decisions, and reopening are distinct from immutable answers. A released revision request grants an extra attempt if the normal allowance has been exhausted. Closed-class and deadline rules still apply.
- Mutation receipts deduplicate retries transactionally. Reusing a key with different content fails. Changing an account's role invalidates its old receipts. Draft revision checks prevent cross-tab overwrites.
- Translator drafts/history never become coursework automatically. “Use in Exercise Draft” requires an explicit destination and changes only the instructor's selected private draft.
- Analytics use stored records. Completion counts distinct student–assignment pairs, not attempts. Date boundaries include the entire selected final UTC day; display timestamps follow the user's preference. The selected roster supplies the denominator; date/status/search filters select observed activity. No causal learning-gain claim is made.

## Authentication and deployment prerequisites

**Do not merge/deploy as a drop-in static-only update. Configure and verify the server first.**

1. Keep the existing Firebase project (`pseudopy-e7e74` by default). Configure `FIREBASE_PROJECT_ID` and either Application Default Credentials (`GOOGLE_APPLICATION_CREDENTIALS` in a secure environment) or `FIREBASE_SERVICE_ACCOUNT` containing the service-account JSON as a server-only secret. Never place credentials in a browser file, repository, or public environment variable.
2. Deploy the Express server or the Vercel `api/handler.js` function together with the public build. `npm start` runs Express. `npm run build` copies only approved frontend assets. The Vercel rewrite retains the API and role SPA paths.
3. Deploy `firestore.rules` to deny direct browser collection access. If this Firebase project serves unrelated apps, merge the applicable rules with their existing rules deliberately. Never leave old permissive rules active: secure HTTP routes do not protect direct Firestore access on their own.
4. Verify an existing active administrator can sign in. Existing salted SHA-256 and plaintext credentials are checked on the server and upgraded to scrypt after successful login. Existing usernames and the previous three spelling aliases continue to work. Sessions use hashed opaque tokens, HttpOnly/SameSite cookies, an eight-hour expiry, active-account checks, and instructor device approval. Production cookies require HTTPS.
5. Verify an existing instructor's approved device. The original `pseudopy_device_id` is retained. The existing first-device auto-enrollment rule remains; additional devices require administrator approval.
6. Verify create-class → approve student → publish → submit → release feedback → revise in a non-production Firestore project before production rollout. No Firebase credentials were available in this development environment, so this gate has **not** been executed.

There is no demo-data fallback. An unavailable store produces an error and does not claim a save or submission succeeded. Legacy generic API endpoints return 404. Old `app.js`, `database.js`, and analysis utilities remain in source history/checkout for reference, but are not public assets or production scripts.

## Existing data and migration

Existing users, devices, exercises, activity, password requests, and audits are not deleted. Old activity is not reclassified as graded attempts: it lacks reliable assignment, rubric, and immutable-attempt provenance. Existing password-recovery request history is retained; new password resets are handled by the administrator's account form.

To bring instructor-owned legacy exercises into the new library, run the following from an authorized server environment:

```sh
node scripts/import-legacy-exercises.js --instructor ACCOUNT_ID
```

This is a dry run. After reviewing the counts and ownership, explicitly add `--apply`. Imports use deterministic IDs and `create` semantics, never overwrite a destination, and never modify a source. Imported exercises stay private drafts with empty rubric/output requirements until an instructor completes and validates them. Records with unclear ownership are skipped. Legacy sample exercises cannot be reliably distinguished from real records if an earlier app seeded them into Firestore; review imported content before publication.

## Study scope and runtime limits

The system implements researcher-defined structured pseudocode and console Python. It does not generate GUI, database, object-oriented, multi-language, or AI-generated programs. The grammar's existing documented functions, arrays, and operators remain available; “all algorithms” means algorithms expressible in that documented subset, not unrestricted Python.

The browser uses the existing Skulpt runtime in a dedicated worker with a five-second wall-clock limit, a four-second interpreter limit, and a 50,000-character output limit. Only Skulpt's internal `sys` module is readable; imports, filesystem access, and privileged reflection/evaluation identifiers are rejected or unavailable. No student Python runs on the server. Skulpt is not full CPython and has no hard per-worker memory quota. Downloads can be verified separately with CPython. Browser execution telemetry is self-reported and never used to assign grades.

The pilot Firestore adapter loads a bounded snapshot and commits changed documents in one transaction. It supports **at most 5,000 total records across its managed collections and 450 changed documents per operation**. This favors consistency for a small academic pilot, not large-scale analytics. It fails closed at the limit. Request receipts and historical attempts are not automatically deleted. Before sustained evaluation or larger cohorts, implement indexed, scoped queries and an approved retention/export plan; do not increase the cap blindly. API lists paginate, but the underlying adapter is not a large-dataset query engine.

Browser recovery drafts are separate per account and task, remain on that device until saved, and are never auto-submitted after reconnecting. A fully offline reload cannot authenticate or retrieve coursework. There is no silent replay of submissions. Local recovery content is not encrypted; use trusted devices for coursework.

## Verification

`npm test` runs compiler/operator/algorithm regression cases, the complete domain workflow and HTTP authorization tests, and browser-runtime parity/error tests. The role tests cover ownership, private references/draft feedback/hints, revision history, scheduling, late submission, archive/removal, concurrency, duplicate retries, invalid code, rubric limits, secure sessions, device approvals, and static-asset isolation.

Browser QA uses `tests/support/ui-fixture.js` with synthetic records and no Firebase connection. Its session response is a UI fixture, **not** a production authentication test. Start only with `NODE_ENV=test`; it is excluded from the public build. Browser checks confirmed explicit translation, recovery drafts, student submission, instructor queue visibility, a stepped-loop output of `25`, mobile navigation/Escape, and no page overflow for student/admin at 360px and instructor at 768px.

The automatic approval reviewer rejected clicking “Release Feedback” in the browser because it classified the action as changing a live academic grade. That click was not retried or bypassed. Release/revision behavior was verified through isolated domain/HTTP tests; a full live browser and Firebase end-to-end run remains a rollout gate. No real coursework or feedback was changed.
