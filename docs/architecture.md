# Code organization

Edit the feature sources in `src/`, then run `npm run build`. The root browser files are checked-in build outputs so the existing static hosting, inline HTML handlers and PWA cache continue working. The build uses Node's standard library and introduces no browser dependency.

| Location | Responsibility |
| --- | --- |
| `src/app/` | Role workflows, navigation, editor, exercises, analytics and account recovery |
| `src/compiler/` | Tokens/trace, lexer, expression AST, statement parser, semantic analysis, generation and compiler facade |
| `src/database/` | Firebase setup, password hashing, seeds, local storage, CRUD, seeding and the legacy `Database` facade (kept because `verify_app_refactor.js` exercises `db`; new code calls the `dbGet*/dbAdd*/dbUpdate*/dbDelete*` helpers directly) |
| `src/devtools/` | Pipeline controls, views, inspectors, diagnostics and execution trace |
| `src/bundles.json` | Explicit, ordered list of source files for each browser entry point |
| `server/create-app.js` | Express middleware and application construction |
| `server/routes.js` | HTTP endpoints and consistent response/error handling |
| `server/collection-store.js` | In-memory collection repository shared by Express and serverless handlers |
| `server/seed-data.js` | Existing backend seed generation |
| `api/_db.js` | Compatibility export for existing serverless imports |
| `server.js` | Database initialization and server startup |

`mapper.js`, `metrics.js`, `ui-icons.js`, and `sw.js` retain their existing focused responsibilities. UI markup, styles, assets, seed records and storage schema are unchanged.

## Python execution (Skulpt)

All three execution paths — `src/app/execution.js` (`runPythonCode`),
`src/app/exercises.js` (`computeExpectedOutput`) and
`src/devtools/pipeline-controls.js` (`_devToolsExecutePython`) — run student
code through the vendored Skulpt in `vendor/skulpt/`.

Two properties of that build govern how a run must be configured:

1. **The run budget is `Sk.execLimit`, and it is compile-time.** Skulpt's
   compiler bakes an interrupt test into the generated code from the
   `Sk.configure()` options. `execLimit` must therefore be part of the
   `Sk.configure()` payload, *before* `Sk.importMainWithBody` runs. Assigning
   `Sk.execLimit` afterwards has no effect.
2. **There is no `Sk.misceval.timeout`.** A guard written against that API is
   a silent no-op, and a tight `while True:` loop then freezes the tab forever.

`src/app/on-demand.js` owns the policy: `SKULPT_EXEC_LIMIT_MS` (15 s) and
`skulptExecLimitOptions(limitMs)`, which returns `{ execLimit }` and an empty
object for an explicit `Infinity`. A tripped budget surfaces as a stop with an
actionable message ("check for a loop that never ends"), never as a generic
runtime error, so a student is not sent hunting a syntax error that is not
there.

The DevTools console (`src/devtools/runtime-console.js`) batches transcript
rows into a single `DocumentFragment` per animation frame instead of writing
and measuring per line, and caps the rendered rows at `DEV_CONSOLE_MAX_ROWS`
(2000). Rows dropped by the cap are announced in a sticky notice rather than
silently discarded; the full transcript is always retained in memory and in
`transcriptText()`.

## Compatibility boundaries

Browser feature sources are ordered **classic-script source modules**, not isolated ES modules. They deliberately retain existing shared lexical state, function hoisting, and global HTML event handlers. Concatenation reproduces the previous browser bundles byte for byte. Do not load these feature sources individually or change their order casually: some existing declarations override earlier ones. This separation makes ownership and editing clearer; it does not claim to eliminate all global coupling. Future state encapsulation should be a separate behavior-tested change.

Backend modules use CommonJS. The app factory and route registration accept a database dependency so API behavior can be tested without opening a production database or starting the production server. API paths, status codes, payloads, middleware order and repository semantics are preserved. Central error handling removes repeated route boilerplate.

The existing storage fallback and demo-data behavior are retained. This refactor does not change persistence guarantees or authentication policy.

## Development workflow

1. Find the feature in the table and edit its source file.
2. Run `npm run build` to validate syntax and regenerate browser bundles.
3. Run `npm test` to check bundle freshness, compiler behavior, role workflows and backend contracts.
4. Commit both source changes and any regenerated browser files.

`npm start` and `npm run dev` build first. Static hosting uses the committed outputs directly. `npm run build:check` fails when outputs drift from their sources; `npm test` runs that check automatically. CI also rejects stale outputs.

`devtools.js` is listed in `LOCAL_ASSETS` in `sw.js`, so it is precached with the rest of the shell even though it is only rendered inside the DevTools surface. Browser bundles are eager with no runtime loader. The service-worker cache is versioned (`CACHE_NAME` and `VENDOR_CACHE_NAME` in `sw.js`); bump both whenever the precached asset list or any precached file changes.

## Verification limits

Automated tests cover Python translation/execution comparisons, role-navigation behavior, regressions represented in the existing suite, backend CRUD compatibility, HTTP errors, and Express static/JSON serving. Browser output, HTML and CSS equality provide strong evidence that this structural change preserves rendering, but are not a substitute for a live authenticated end-to-end check. No live Firebase writes or production deployment are performed by these tests.
