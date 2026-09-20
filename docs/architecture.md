# Code organization

Edit the feature sources in `src/`, then run `npm run build`. The root browser files are checked-in build outputs so the existing static hosting, inline HTML handlers and PWA cache continue working. The build uses Node's standard library and introduces no browser dependency.

| Location | Responsibility |
| --- | --- |
| `src/app/` | Role workflows, navigation, editor, exercises, analytics and account recovery |
| `src/compiler/` | Tokens/trace, lexer, expression AST, statement parser, semantic analysis, generation and compiler facade |
| `src/database/` | Firebase setup, password hashing, seeds, local storage, CRUD, seeding, subscriptions and facade |
| `src/devtools/` | Pipeline controls, views, inspectors, diagnostics and execution trace |
| `src/bundles.json` | Explicit, ordered list of source files for each browser entry point |
| `server/create-app.js` | Express middleware and application construction |
| `server/routes.js` | HTTP endpoints and consistent response/error handling |
| `server/collection-store.js` | In-memory collection repository shared by Express and serverless handlers |
| `server/seed-data.js` | Existing backend seed generation |
| `api/_db.js` | Compatibility export for existing serverless imports |
| `server.js` | Database initialization and server startup |

`mapper.js`, `metrics.js`, `ui-icons.js`, and `sw.js` retain their existing focused responsibilities. UI markup, styles, assets, seed records and storage schema are unchanged.

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

No extra network requests or runtime loader are introduced. Because this extraction produces identical browser bytes, the existing service-worker asset list and cache version remain valid. For future behavior changes, update service-worker cache/versioned assets as appropriate.

## Verification limits

Automated tests cover Python translation/execution comparisons, role-navigation behavior, regressions represented in the existing suite, backend CRUD compatibility, HTTP errors, and Express static/JSON serving. Browser output, HTML and CSS equality provide strong evidence that this structural change preserves rendering, but are not a substitute for a live authenticated end-to-end check. No live Firebase writes or production deployment are performed by these tests.
