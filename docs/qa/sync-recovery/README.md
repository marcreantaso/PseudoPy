# Sync recovery QA — baseline eae428d

## Defect 1: durable permission-denied writes

Reproduced before modification: `before-queue.txt` records failures for reload/replay, concurrent autosaves and stale-snapshot protection. Baseline master passed its 493 tests because they explicitly expected denied writes to be discarded.

Changes: persist before transmission; retain permission failures as `blocked-permission`; serialize enqueue and transport (Web Locks across supporting browser tabs); recover on startup/auth/online/manual retry; preserve document order; emit `pseudopy:sync-saved` after replay. IndexedDB mutations now report errors and use a durable localStorage fallback. A 500-record cap and storage exhaustion produce explicit user-visible errors. Blocked mutations overlay remote snapshots.

Tests: `sync-recovery.test.js`, `offline-queue.test.js`, updated denial expectations in `cloud-save-failure.test.js`, `cloud-auth.test.js`, and `offline-sync.test.js`. The deny → reload → allow test asserts one successful remote write and one saved event. Tests use mocked Firestore, not the live database.

Remaining risk: Firestore and browser storage cannot provide transactional exactly-once delivery across a crash between remote acknowledgment and local queue removal. Fixed document IDs and SET/merge make replay idempotent; delivery is at least once in that crash window. Browser storage eviction, private browsing limits, and user-cleared storage cannot be prevented. Web Locks are needed to serialize simultaneous tabs; the fallback only serializes one page. No authentication policy changes were made.
