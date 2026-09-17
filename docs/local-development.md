# PseudoPy development and deployment

The existing visual design and role pages are retained. Firestore is the durable database. The browser now calls authenticated same-origin `/api` endpoints instead of downloading the users collection and verifying passwords itself. The previous in-memory API is no longer used.

## Required server configuration

Use Node.js 22+ and Python 3 for tests. Configure these variables in the server environment (and in Vercel for a hosted deployment):

- `SESSION_SECRET`: a random secret of at least 32 characters, generated for your deployment. Keep it stable across instances.
- `FIREBASE_PROJECT_ID`: your existing Firestore project ID (`pseudopy-e7e74` unless changed).
- `FIREBASE_SERVICE_ACCOUNT_JSON`: a service-account JSON credential with access to that project's Firestore database. Alternatively, on a trusted local machine use Google Application Default Credentials through `GOOGLE_APPLICATION_CREDENTIALS`.

Never put server credentials in browser scripts, commit them, or paste them into a public issue. No live credentials were supplied or configured as part of this change.

Run:

```sh
npm ci
npm start
```

Open `http://localhost:3000`. This local server connects to the configured Firestore project; localhost does not create an independent local database. If a separate test database is needed, use a separate Firebase project or the Firestore emulator and `FIRESTORE_EMULATOR_HOST`. The application does not seed real accounts or activity automatically.

For a local `.env` file, load it explicitly using `node --env-file=.env server.js`; `npm start` uses variables already exported by the environment.

## Deployment order

1. Configure the server credentials and session secret in a preview deployment.
2. Back up your database and review legacy record ownership. `node scripts/migrate-record-ownership.js` reports a dry run. `--apply` backfills only uniquely matched IDs/usernames; ambiguous records require manual review. Names are never used as identity. Existing `act_sp_` demo records are excluded from analytics without deletion.
3. Confirm existing users, instructors, and exercises have correct `instructorId` ownership. Accounts require existing usernames and a recognized credential format. Existing plaintext/salted-SHA credentials migrate to scrypt after a successful login.
4. Publish `firestore.rules` for the configured project alongside the server migration. These rules deny direct browser access; the Admin SDK server enforces access instead. Do not deploy these rules while the old browser-only version is still your active application.
5. Verify sign-in, authorized device approval, student/instructor isolation, password recovery, exercise submission and refresh against the preview database.
6. Deploy the application and accept the PWA update. The new worker cache is `pseudopy-learning-20260917`.

The Vercel build copies only public frontend assets. Backend files, fixtures, environment files and account seeds are excluded from the public directory. Neither a live deployment nor Firestore rule publication is performed by the implementation commit.

## Behavior and limits

- Python runs in a dedicated worker per execution. Run/reference/devtools executions do not share interpreter state. Input is submitted once; numeric conversion errors explain INTEGER versus FLOAT/REAL. Stop cancels a run; active computation is limited to 10 seconds, excluding input waiting, with a 100,000-character output cap.
- Python stdout excludes UI prompt/input echoes when comparing an exercise with its reference. Reference evaluation uses identical submitted inputs. A reference match checks those inputs, not every possible input or general program correctness. Student-submitted results remain learning feedback, not a tamper-proof grading service.
- Activity records include stage (`translation`, `execution`, `correctness`, `submission`), stable user/exercise IDs and measured duration. A syntax failure, runtime failure or proven output mismatch is recorded as such. Infrastructure failures and cancellations are not learner errors. The error donut counts records containing a recognized failure, not individual parser messages. Legacy unverified “Logic Error” labels are excluded from error totals.
- Dashboards refresh through role-scoped polling every 10 seconds while visible; they explicitly display synchronization failures. This is polling, not streaming realtime. Firestore is durable across server restarts.
- Editor drafts and recent personal metrics are stored per user on the current device. Runtime assets are bundled for offline use once the PWA is cached. Existing open work can translate and run offline; sign-in, cross-device data, and server saves require connectivity. Failed writes are never presented as synchronized. There is no automatic offline submission queue.
- The help guide is optional and replayable inside existing operator panels. It does not replace editor content.
- A 30-minute client inactivity timeout gives students time to read; signed server sessions expire after eight hours and are invalidated by password changes or account deactivation.
- The first instructor device is enrolled by the server. Subsequent devices remain pending until an administrator approves them. Password recovery retains instructor/admin approval, requires the requesting browser's random proof, and permits a single reset within the authorization window.

## Verification

```sh
npm test
node scripts/build-public.js
```

Tests cover CPython/compiler agreement, full student workflows in a DOM harness, role navigation, backend access policy and cookie authentication against a simulated Firestore interface, persistence failure reporting, metrics isolation, examples, and actual bundled Skulpt execution through isolated worker threads. The worker-thread tests shim browser messaging APIs; they do not constitute a rendered-browser test or a live Firestore test.
