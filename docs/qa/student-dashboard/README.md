# Student dashboard: tabs and offline status QA

Evidence for the two changes to the Student translation dashboard:

1. Offline no longer shows a "Reconnecting to the server…" banner or an animated
   spinner; it shows a calm local-save status instead.
2. "How Your Algorithm Works" and "Session Insights" moved from accordions far
   below the fold into three reachable, accessible tabs.

## How this was produced

- `scripts/qa/cdp.cjs` — dependency-free Chrome DevTools Protocol helper.
- `scripts/qa/serve.cjs` — local static server.
- `scripts/qa/repro-student-dashboard.cjs` — baseline capture (run against
  `git worktree` of `HEAD` so `before-*` reflects the shipped build).
- `scripts/qa/student-tabs-browser.cjs` — after capture and assertions.
- `scripts/qa/offline-reload-browser.cjs` — offline reload durability.

```
node scripts/qa/repro-student-dashboard.cjs   # in a HEAD worktree -> before-*
node scripts/qa/student-tabs-browser.cjs      # in the working tree -> after-*
node scripts/qa/offline-reload-browser.cjs    # offline reload durability
```

Real Chrome, real Skulpt, a real translation was executed before measuring, and
offline was driven through CDP's network emulation rather than by stubbing
`navigator.onLine`.

## Offline status

| Signal | Before | After |
| --- | --- | --- |
| Reconnect banner present | yes | **no** |
| Page copy mentions "Reconnecting" | yes (after network loss) | **no** |
| Pill animated while offline | yes | **no** |
| Dismissible notice while offline | no | no |
| Student stays signed in | yes | yes |
| Editor + Python output still populated | yes | yes |

Queue lifecycle with real work in flight, observed by polling the pill:

```
offline + queued mutation -> state "offline",   no animation, title says saved on this device
network restored          -> state "syncing",  dot animation "syncStatePulse"
queue drained             -> state "synced",   no animation, pending badge hidden
```

`Syncing` is only reachable during an actual upload. It never appears merely
because the browser came online with nothing to send.

### What the offline check does and does not prove

`student-tabs-browser.cjs` drives `restoreSession()` on an already-loaded page, so
it proves the *status UI* is correct while offline. Durability across a real
reload is covered separately by `offline-reload-browser.cjs` below.

## Offline reload durability

`scripts/qa/offline-reload-browser.cjs` registers the service worker, reloads once
online so the worker actually controls the page, signs in, translates real code,
then cuts the network and performs a genuine `Page.reload` — all inside **one**
storage context, so what it measures is real.

| Signal | Before reload | After offline reload |
| --- | --- | --- |
| App booted | yes | yes |
| Signed in | yes | yes |
| Session in storage | yes | yes |
| Editor draft | 44 chars | 44 chars |
| Translated Python | 24 chars | 24 chars |
| Tabs present | 3 | 3 |
| Sync pill | — | `offline` / "Offline", not animated |
| Page mentions "Reconnecting" | — | no |

This run exposed a real pre-existing defect, present identically on the
pre-change baseline `cca1adc`: with the browser offline, `dbGet(..., { strict:
true })` skipped the Firestore branch entirely and fell through to the local
cache, returning a **miss** that `restoreSession` could not distinguish from a
deleted account. The result was `clearSession()` — a silent logout on every
offline reload, with the session erased from storage. `src/database/collections.js`
now surfaces the outage to strict readers instead of substituting a cache miss,
so the degraded path that `session.js` already implemented (keep the session,
retry in the background) is what actually runs.

The translated Python is persisted alongside the editor draft in
`src/app/editor-actions.js`. It is derived from the pseudocode but is not
re-derived on load, so without this the editor came back and the output did not.

## Learning sections reachability

Vertical offset of the two learning sections from the top of the page, in CSS
pixels. Before, they were collapsed accordions appended after the whole
workspace; now they are one tap away at every width.

| Viewport | Before (How Your Algorithm Works) | Before (Session Insights) | Before overflow-x |
| --- | --- | --- | --- |
| 320 x 720 | y=2710 (3.8 screens down) | y=2769 | 0 |
| 375 x 812 | y=2688 | y=2748 | 0 |
| 768 x 1024 | y=2343 | y=2410 | 0 |
| 1440 x 900 | y=1798 | y=1865 | 0 |

After: both sections are tabs in the first screen at every width.

## After measurements

Measured after translating code, so the chart has data.

| Width | overflow-x | Tab heights | Chart plot width | Chart svg width | KPIs |
| --- | --- | --- | --- | --- | --- |
| 320 | 0 | 45/45/44 | 247 | 247 | 6 |
| 375 | 0 | 44/44/44 | 302 | 302 | 6 |
| 768 | 0 | 44/44/44 | 688 | 688 | 6 |
| 1440 | 0 | 44/44/44 | 1088 | 1088 | 6 |

- Zero horizontal overflow at all four widths, on every tab.
- Every tab target is at least 44px tall (WCAG 2.5.5 / iOS HIG).
- `svg width == plot clientWidth` at every width: the chart re-measured itself
  after its tab became visible instead of rendering at the hidden 0-width size.

## Accessibility

Real key events dispatched through CDP (`Input.dispatchKeyEvent`), not synthetic
`click()` calls:

| Key | Focused tab | Selected | Panels visible |
| --- | --- | --- | --- |
| ArrowRight | `sw-tab-flow` | flow | flow |
| ArrowRight | `sw-tab-insights` | insights | insights |
| ArrowLeft from first | `sw-tab-insights` | insights | insights |
| End | `sw-tab-insights` | insights | insights |
| Home | `sw-tab-workspace` | workspace | workspace |

Selection follows focus, so keyboard users see the panel they navigated to
without a second key press.

Structure asserted in `index.html` and `tests/student-dashboard-tabs.test.js`:
`role="tablist"`, three `role="tab"` with `aria-controls`, three
`role="tabpanel"` with `aria-labelledby`, `aria-selected` on the active tab,
roving `tabindex`, and `hidden` on inactive panels.

## Persistence and idempotence

- The selected tab is stored in `sessionStorage`, scoped per student and per
  route, and restored when the student returns.
- `StudentWorkspace.activate()` is safe to call repeatedly: re-activating, or
  switching routes and back, never duplicates the editor, the panels or the
  flow/KPI sections (regression-tested).
- The Workspace panel keeps the live editor, Python output, console and the
  Translate/Run/Submit bar by moving the existing DOM nodes, so inline handlers,
  draft restore and console wiring are unchanged.

## Known limitations

- Geometry is measured in emulated Chrome, not on physical iOS or Android
  hardware. Chrome's mobile emulation does not reproduce iOS Safari's rubber-band
  or dynamic-toolbar behaviour.
- The pre-existing `scripts/qa/sync-notice-browser.cjs` and
  `scripts/qa/offline-scope-browser.cjs` require Playwright, which is not
  installed in this environment, so they could not be run here. They are not part
  of `npm test`.
- Offline reload durability is covered by `offline-reload-browser.cjs`, but only
  against emulated offline in Chrome. Browser back/forward cache and hard
  process kills were not exercised.
- `tests/compiler.test.js` needs CPython on `PATH`, which is unavailable in this
  environment, so those 85 cases were not run here. They are unaffected by these
  changes (no compiler source was touched).