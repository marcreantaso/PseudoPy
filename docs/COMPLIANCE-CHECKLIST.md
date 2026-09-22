# Compliance checklist (P0–P6 trust / privacy / accessibility / legal audit)

This document is the owner-facing completion surface for the P2–P6 audit
remediation. Everything in **Automated gates** is enforced by the test suite;
everything in **Manual verification** must be performed by the owner/QA on a
real build and live account before release.

## Scope

- Privacy Policy, Terms of Use and About pages render in-app (no external
  host needed) from `src/config/app-info.js`.
- Passwords are hashed (salt + SHA-256) on account creation; no plaintext
  password is persisted or shown in the edit modal.
- The dormant `measurementId` and raw device `userAgent` persistence were
  removed.
- WCAG 2.2 AA token contrast is enforced programmatically for the CSS color
  tokens in `tests/contrast.test.js`.
- Keyboard + screen-reader structure is enforced in `tests/a11y-structure.test.js`.

## Automated gates (CI / `npm test`)

Run:

```sh
npm run build
npm run build:check
node --test tests/*.test.js
node test_operator_translation.js
node verify_app_refactor.js
```

Known baseline: `compiler.test.js` Python-9009 cases do not run in this
environment (no Python interpreter) and are not a regression. `npm test`
must report **0 non-Python failures** and 137+ passes.

## Manual verification

### Privacy / Terms / About (P1)

- [ ] Logged out: click Privacy / Terms / About in the login footer — each
      opens the in-app legal view and the Back button restores the login page
      and focus.
- [ ] Logged in: the sidebar footer links open the same views; Settings >
      About shows Version, Organization, Contact and the Documents row.
- [ ] `[pending owner configuration]` markers appear only where `app-info.js`
      leaves a field blank (contact email). Replace them with real values
      before public release.
- [ ] Year in the login footer updates to the current year.

### Passwords & accounts (C1)

- [ ] Create an instructor via Settings > Manage Instructors → the new account
      logs in with the set password (hash stored, not plaintext).
- [ ] Edit-modal opens for an existing user does NOT pre-fill the password.
- [ ] Change Password and "Forgot Password" reset still work end-to-end.
- [ ] `seed_firebase.html` builds users whose `passwordHash` matches the
      deterministic `SEED_SALT`, so `Admin`/`pass123` still signs in.

### Accessibility (P4)

- [ ] Tab through the app: the skip link appears on focus; manage reverse tab
      from every modal using Shift+Tab — focus should not escape the dialog
      and should return to the opener on close.
- [ ] Enable a screen reader (NVDA/VoiceOver): the submissions bar chart reads
      its aria-label summary; the error-distribution donut and pipeline-timing
      chart read text values; table headers announce columns; toasts announce
      via aria-live.
- [ ] Password eye toggles announce "Show/Hide password" and swap states.
- [ ] Click audit for touch targets: nav items, icon buttons, pagination
      buttons and analytics eye buttons are >= 36 px; nothing should feel
      cramped on a phone.
- [ ] Color-blind spot-check: status colors in exercises, request cards,
      notifications and the concept-mastery table are paired with text labels
      (never color alone).

### Security / privacy (P2, C1, H3)

- [ ] `measurementId` absent from `window.__FIREBASE_CONFIG__` and the
      Firebase config in `src/database/firebase.js` (now optional).
- [ ] No raw `userAgent` string is persisted in Firestore device records;
      the attacker-behavior fingerprint remains (UA is not stored).
- [ ] Devices now appear as "Unknown device/browser" in the devices list;
      approve that text is friendlier than the raw string.
- [ ] `.form-privacy-note` privacy text is visible under the account-modals and
      the Forgot Password flow.
- [ ] Deployment of `firestore.rules` (proposed, baseline-open) — see the
      REST API note below — must be reviewed first; the app does not use
      Firebase Auth, so locked-down rules would break the app.

### REST API / backend (P2, document-only)

- [ ] The REST API (`server/**`, `api/**`) is unchanged and documented in this
      audit. It is a shared-codebase endpoint for the research/student tool
      and is **not** yet suitable for production hosting as-is.
- [ ] Before public hosting: add authentication, rate limiting and
      least-privilege Firestore rules (or move data behind the API only).

### Lighthouse / runtime

- [ ] Run Lighthouse in Chrome (DevTools → Lighthouse) after the next build;
      pass Accessibility >= 92 and Best Practices >= 92.
- [ ] Contrast: verify both light and dark themes, on real buttons/badges,
      against the AA pairs already pinned in `tests/contrast.test.js`.

## Final audit matrix (fill before release)

| Phase | Scope | Status | Evidence |
| --- | --- | --- | --- |
| P0 | APP_INFO config + legal views | Done | `src/config/app-info.js`, legal HTML |
| P1 | Entry points (login, sidebar, settings) | Done | footer/sidebar/settings wiring |
| P2 | Privacy/security (hash, UA, measurementId, notices) | Done | `users.js`, `authentication.js`, `firebase.js`, notices |
| P3 | WCAG AA contrast tokens | Done | `tests/contrast.test.js` (4/4) |
| P4 | Structure/screen-reader/touch | Done | `tests/a11y-structure.test.js` (9/9) |
| P5 | Governance + a11y gate | Done | this checklist + a11y test |
| P6 | Full validation gate | Done | build, build:check, npm test (151 pass / 84 Python-baseline / 0 non-Python), operator, verify_app_refactor (32/0) |

<!-- Kept in docs/ so this file ships with the repository and survives rebuilds
     of the browser bundles. -->