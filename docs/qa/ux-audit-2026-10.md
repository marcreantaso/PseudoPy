# PseudoPy UX audit — October 2026 (Step 0)

Scope: every screen at 320 / 375 / 768 / 1440 px, light and dark, against the five UX rules.
Evidence is code-level (`file:line` at commit `e96f578`) because this environment has no
browser screenshot tooling; each row was verified by reading the rendering path. The
Playwright pass (positions, CLS, INP) is listed under **Owner actions** — Playwright is
not a dependency of this repo and the repo rule forbids adding heavy libraries, so the
automated position checks are implemented as DOM-structure tests in `tests/` instead.

Screens audited: Login (+ login guide, password recovery, device authorization),
Student Write Pseudocode, Feedback & Suggestions (Learning Feedback panel),
Exercises & Tasks, Settings, notifications, Instructor dashboard (students, analytics,
password requests), Admin dashboard (users, devices, system analytics, compiler
dashboard, migration), PWA update, boot.

## Audit table

| Screen | Violates | Evidence | Fix |
| --- | --- | --- | --- |
| Boot splash | — (compliant) | `index.html:3157` box + spinner; layout unknown at boot, small inline spinner is the allowed form | none |
| Login | — | `#login-submit` has busy state (`src/app/authentication.js:42`), hint leak fixed in `e96f578` | none |
| Password recovery step 1→3 | R4 | `index.html:252-334`: primary button sits in a flex row that moves vertically with each step's content height; success step (`:326`) renders a full-width primary — bounding box differs from steps 1-3 | shared sticky `.auth-flow-footer` (Back left / primary right), reserved step min-height, safe-area padding |
| Device authorization modal | R4 | `index.html:2994-3000`: primary "Check Approval Status & Sign In" is stacked **above** the secondary "Back to Sign In" — inverted hierarchy and a different geometry from every other flow | same footer region: secondary left, primary right, 44px targets |
| Write Pseudocode — Run | R1, R3 | `src/app/execution.js:27-31` clears output and shows nothing while running; `appendOutput` (`:92`) appends one span per Skulpt output chunk — synchronous layout per line (console lag, repeated-line jank); no cap on student console (cap exists only in devtools, `src/devtools/runtime-console.js:16`) | running skeleton in the console area; rAF-batched writes with a 2000-row cap + dropped-rows notice; Run button busy state |
| Write Pseudocode — Translate | — | synchronous, instant; `:active` pressed state exists for touch (`style.css:3413`) | add global pressed state (was touch-only) |
| Write Pseudocode — Learning Feedback | — (compliant) | `src/learning/learning-ui.js` renders synchronously from the already-computed pipeline result; no async gap to skeleton | none |
| Python run errors | R5 | `src/app/execution.js:229-236`: raw `err.toString()` (traceback) appended straight into the console | friendly line/hint first, raw traceback behind a "Show details" toggle |
| Write Pseudocode system crash | R5 | `src/app/translation.js:190-211`: `"System Error during translation: " + e.message` written to output and console | route through error layer |
| Exercises & Tasks list | R1 | `index.html:1316`: static "Loading exercises…" text row; layout does not match the final 5-column table | skeleton rows matching column layout |
| Notifications | R1 | `src/app/notifications.js` `loadStudentNotifications`: dropdown opens blank while `dbGetAll` resolves | skeleton items on open |
| Settings — change password | R3 | `src/app/student-settings.js:110` `submitPasswordChangeRequest` awaits hashing + `dbSet` with no busy state → double submit | busy/disabled + label |
| Settings — sign out | R2 | `src/app/authentication.js:234-261` silently `clearEditorDraft()`s unsaved pseudocode on sign out — destructive with no warning and no undo | keep the draft (tagged by account) so sign out is non-destructive |
| Settings — clear local data | R2 | no control exists anywhere to clear the offline store | add "Data on this device" section with plain disclosure + confirmed clear |
| Users table (instructor/admin) | R1, R5 | `src/app/users.js:15` "Loading instructors..." text row; `:50` renders `err.message` into the table | skeleton rows; friendly error copy |
| Devices table | R1 | `src/app/users.js:240` "Loading devices..." text row | skeleton rows |
| Analytics charts | R1 (partial), R5 | `src/app/analytics-charts.js:57-64` already renders skeletons and `style.css:4275-4298` reserves `min-height` (design-jump fixed); **no** ResizeObserver/re-render on viewport change; `anErrMessage` (`:45`) leaks `e.message` | debounced ResizeObserver re-render of the visible charts; friendly chart error |
| Compiler dashboard | R5 | `src/app/compiler-dashboard.js:159-160` raw `err.message` into error panel + toast | error layer |
| Students migration | R5 | `src/app/students-migration.js:126,193` raw `err.message` into table + toast | error layer |
| Exercise submission | — (compliant) | `src/app/exercise-submission.js:49-61` busy label, `disabled`, `aria-busy`, reason text | none |
| PWA "Update now" | — (compliant) | `pwa-updates.js`: immediate busy state, progress label, failure message, single reload on `controllerchange`, no loops | none |
| Infinite loops | — (compliant) | `src/app/on-demand.js` bakes `execLimit` into `Sk.configure()` (15 s) | none |
| Sync/connection states | — (compliant) | `src/app/connection-status.js`: transient vs permanent split, banner in normal flow (never overlays the editor), dismissible once-per-session notice | none |
| 404 / offline navigation | — (compliant) | `sw.js` fetch handler falls back to the cached branded shell (`./index.html`) for navigations | none |
| Global JS errors | R5 | no `window` `error` / `unhandledrejection` handlers anywhere (`grep` over `src/` = 0 matches) | error layer + global handlers with dedupe |

## Rule 2 — flow checklist (tap counts)

Flow | Before | After | Notes
--- | --- | --- | ---
Sign out | 1 tap (sidebar) | 1 tap | non-destructive: editor draft now preserved per account
Delete/deactivate student (instructor/admin) | 2 taps (row button → typed confirm) | unchanged | modal states exactly what is removed, what is kept, soft mode has 8 s Undo bar (`index.html:3058`)
Password reset (student) | Settings → Change Password = 1 tap | unchanged | cooldown copy is plain, no guilt copy
Password recovery (locked out) | Login → Forgot → 2 steps | unchanged | approval status shown, no fake urgency (expiry countdown is real)
Revoke device | Devices table → Revoke (2 taps, confirm) | unchanged | instructor/admin; student self-revoke pending owner decision
Clear local data | did not exist | Settings → Clear (confirm) = 2 taps | new; states local-only, cloud untouched, irreversible
Notification opt-out | N/A | N/A | notifications are in-app only (no push/channel subscription exists to opt out of); disclosed in checklist
Guilt copy / fake urgency / pre-checked consent / hidden skip | none found (verified across modals, banners, toasts) | — | destructive confirms always place Cancel as a visible sibling button
Local vs cloud disclosure | Privacy §4 + §8 (legal pages) + sync pill states | added "Data on this device" section in Settings summarizing the same in plain words |

## Rule 4 — primary action geometry (before → after)

Flow | Before | After
--- | --- | ---
Login | submit at form end, static | unchanged
Recovery step 1 | Cancel left / primary right, vertical position varies with content | same geometry, sticky footer, reserved min-height
Recovery step 2 | Back to Login left / Check Status right, position varies | same as step 1
Recovery step 3 | Cancel left / Reset Password right, position varies | same as step 1
Recovery success | full-width primary (different box) | Back left / primary right, same box as steps
Device authorization | primary stacked on top of secondary, centered column | secondary left / primary right, same as recovery
Exercise action bar | fixed bar below editor (never re-rendered) | unchanged
Modals (user, instructor, delete, archive) | Cancel left / primary right in `modal-footer` | unchanged

## Owner actions

1. **Python on CI is fine, but local Windows verification needs a real CPython 3** — the
   Store alias is not an interpreter; 171 compiler tests fail with spawn exit 9009 on
   machines without it (CI runs Node 22 + Python 3 and passes).
2. **Playwright pass** (INP/CLS/position at 375/1440): not installed in this repo by
   design (no heavy dev deps). Run the documented manual device matrix or add
   Playwright in CI if the owner accepts the dependency.
3. **Student self-revoke of devices**: privacy policy says "Devices can be revoked by
   you or an administrator"; only staff UI exists. Either ship a student-side revoke or
   amend the privacy text. Requires product decision.
4. **Lighthouse before/after numbers** need a deployed HTTPS origin (PWA installability
   + service worker scoring is unreliable on `localhost` file serving); run
   `npx lighthouse https://<deployment> --preset=mobile` before merging to production.
5. No Firestore rule, auth policy or deployment changes were made or are required by
   this UX pass.
