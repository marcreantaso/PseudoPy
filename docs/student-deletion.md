# Student account deletion

How a student is removed from PseudoPy, why there are two modes, and what an
operator has to deploy before the permanent path works.

## Why this document exists

The previous flow rendered a per-row `onclick="deleteUser('<id>')"` that called
`dbDelete(usersRef, user._docId)` and then reported "User deleted" regardless
of what happened. `dbDelete()` could skip the Firestore delete entirely
(permission error, offline, cloud write unconfirmed), swallowed the error, and
returned a failure the caller ignored. The local copy of the profile was never
removed either, so the row came back on the next refresh, and an offline queue
holding the student's last write could recreate the document on the server.

Nothing in this flow reports a deletion it cannot confirm.

## The two modes

| Mode | What happens | Trigger |
| --- | --- | --- |
| **Hard** | Cloud Function `deleteStudentAccount` deletes related records, the Firebase Auth account bound to the profile, the profile document, writes a server audit entry and a tombstone | A Firebase Auth session with a resolvable staff profile |
| **Soft** | Nothing is erased. The profile is marked `status: 'deleted'` with a `deletionMode`, so login, lists, analytics and notifications stop treating it as live, and the change is undoable for 8 seconds | No callable, no Auth session, or the callable is unavailable |

The soft path is a **degradation, not a substitute**. Its toast says the
sign-in account was *not* revoked, because it was not. Related submissions are
left in place on purpose so nothing is destroyed by a path that cannot prove
who is asking.

## Ownership: what may be deleted automatically

A related record is deleted only when it points at the target through
`studentAccountId`, `userId`, `accountId` or `studentId` whose value is one of
the target's canonical ids (document id, app account id, auth uid).

`username`, `email`, `studentNumber` and `student` are **review-only**. They
are shared, changeable and human-readable, so a match on one of them is counted
as ambiguous, shown in the confirmation modal, and left alone.

A Firebase Auth account is deleted only by a uid stored on the profile
document. An email is never used to identify an account to revoke.

## Preventing a deleted student from coming back

Three independent layers, because any one of them can be bypassed on its own:

1. **Local tombstone** (`localStorage`, `src/database/student-deletion.js`) —
   the local roster and the IndexedDB mirror drop the profile, and queued
   writes for that document are retired rather than replayed.
2. **Server tombstone** (`pseudopy_deletedProfiles`) — written by the callable
   after the profile is gone. Both rulesets refuse a client `create` whose
   `_docId` has a tombstone, so a device with a stale offline queue cannot
   recreate the account document.
3. **Session guards** — `src/app/authentication.js` and `src/app/session.js`
   refuse a deleted account on login and on a restored session.

Student numbers are **not** released. `src/database/student-number.js` still
counts deleted students when allocating, so a number is never handed to a
different person.

## Authorization

- Client (`src/database/student-deletion.js`) and server
  (`functions/lib/deletion.js`) evaluate the same rules and are compared
  against each other in `tests/student-deletion.test.js`. The client copy only
  avoids pointless round trips; the Admin SDK bypasses Firestore rules, so the
  server copy is the boundary.
- Instructors may delete only students whose `instructorId` is their own
  account id. Admins may delete any student. Staff accounts and self-deletion
  are refused in both copies.
- `instructorId` is an app account id (`u2`), **not** an auth uid. The callable
  resolves the caller's own profile from `request.auth.uid` (direct document,
  then a `uid` field lookup) and compares account ids on both sides.

## The callable's durability contract

`functions/index.js` journals `pseudopy_deletionOps/del_<studentDocId>_<requestId>`
as `in-progress` **before** anything is erased, together with the full list of
documents to remove. A retry replays that plan; individual deletes are
idempotent, so a crash mid-cascade cannot double-delete or leave records
behind. Failures are reported accurately:

- an unreadable collection fails before any erase ("nothing was deleted")
- an Auth revoke failure after the cascade says the submissions are already
  gone and asks for a retry, rather than claiming nothing happened
- a completed operation replays its recorded result

## Deployment

Nothing below has been run against the live project.

```bash
# 1. Firebase Auth must be enabled for Email/Password, and every staff
#    account must have a Firebase Auth user whose uid is on their profile
#    document as `uid`.
# 2. Node 22 for the runtime.
cd functions && npm install && cd ..

# 3. Deploy the callable (needs the Blaze plan).
firebase deploy --only functions

# 4. Rules. firestore.json currently points at firestore.interim.rules —
#    deploy that, NOT firestore.rules.
firebase deploy --only firestore:rules
```

### Role claims

`firestore.rules` contains claim-aware helpers (`isStaffByClaim()`), but the
callable resolves the caller's role from **their own account document**, not
from a custom claim, because no claim is provisioned in this project yet. The
claim path in the rules is dormant until one is set through the Admin SDK.

Until an instructor has a Firebase Auth user, the callable refuses them
(`failed-precondition`) and the client falls back to the soft delete. That is
the expected, safe behaviour — verify the mode shown in the toast.

## Auditing existing data

```bash
# 1. Report. Scans collections and Firebase Auth, deletes nothing.
node scripts/audit-student-orphans.js --out reports/orphans.json

# 2. Review reports/orphans.json by hand, then record the ids you approve.
#    A bare JSON array works, or { "ids": [...] }.
echo '["act_123", "act_456"]' > reports/approved-ids.json

# 3. Plan. Only ids the audit classified as ORPHANED become actions;
#    anything approved that was not orphaned lands in rejectedIds.
node scripts/audit-student-orphans.js \
  --plan reports/approved-plan.json \
  --report reports/orphans.json \
  --ids reports/approved-ids.json

# 4. Backup. Reads the live documents the plan would delete, full contents,
#    so a mistake can be undone by writing them back.
node scripts/audit-student-orphans.js \
  --backup reports/plan-backup.json \
  --plan-file reports/approved-plan.json \
  --report reports/orphans.json
```

`--apply` is intentionally **not implemented**: it exits 1 with an explanation.
A human review gate has to come before destructive code ships, and the report,
plan and backup above are the reviewable artifacts it would require. Steps 1–4
read Firestore and write JSON files only; none of them modifies a document.

`buildApplyPlan()` and `selectSnapshotIds()` are unit-tested: an ambiguous
record can never enter a plan, and a backup contains each planned document
exactly once.

## Rules Playground cases to run before deploying

1. Staff (instructor, enrolled) → `delete` student: allow.
2. Instructor, student of another instructor → deny.
3. Admin → `delete` any student: allow.
4. Instructor → `delete` own instructor account: deny (`role != 'student'`).
5. Student → `delete` own profile: deny.
6. Any client → `create` `pseudopy_deletionOps/…`: deny.
7. Any client → `create` `pseudopy_deletedProfiles/…`: deny.
8. Any client → `create` a `pseudopy_users/{id}` that has a tombstone: deny.
9. Any client → `create` an audit entry with `action == 'student.delete'`: deny.
10. Any client → `update` or `delete` an audit entry: deny.

## Tests

`tests/student-deletion.test.js` covers the authorization parity, typed
confirmation, ownership vs. ambiguity, chunking, hard/soft selection, refusal
handling, local purge and tombstone behaviour, undo semantics, the rules
clauses and the callable's journaling order.