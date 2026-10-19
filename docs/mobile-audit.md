# Mobile / PWA comfort audit — Phase 0

**Date:** 2026-10-19 · **Branch:** `sop2-measurement-v2` · **Harness:** `scripts/mobile-audit.js` (`npm run audit:mobile`)

This report fixes the scope of the mobile/PWA comfort program (Phases 1–4). Every
defect below was root-caused in source before it was listed, and the listed root
causes were re-verified with targeted live probes (see [Method](#method)).

## Matrix

* **Engines:** Playwright Chromium + WebKit (closest local proxies for Chrome and Safari)
* **Viewports:** 320×568, 375×667, 390×844, 430×932, 360×800, 412×915 (phones), 768×1024, 820×1180 (tablets), 1024×768, 667×375, 844×390 (landscape)
* **Themes:** dark + light (landscape dark only)
* **Roles:** anonymous login screen + seeded student / instructor / admin sessions
* **Screens:** every page per role (`src/app/constants.js` `PAGES_BY_ROLE`), all 20 DevTools tabs including a **real SOP2 comparison run** (`#sop2-run`), and the drawer / notifications / theme-menu overlays
* **Per visit:** horizontal-overflow scan (classified *page* / *clipped* / *scrollable*), document scroll width, stray `scrollLeft`, touch targets < 44 px, text < 12 px, inputs < 16 px, editor-gutter vs textarea heights with a 32-line draft, fixed action-bar clearance, DevTools tab-strip height, theme-color meta, root font size
* **Init gate:** checks run only after the editor input pipeline responds (measured across 684 role-page visits: **1.5–11.8 s, median 5.1 s**, 0 timeouts — see finding #10)
* **Result:** **1,856 screen visits, 297 with layout defects** — canonical JSON
  `reports/mobile-audit/findings-2026-10-19T12-47-12-792Z.json`

## Findings

Legend for **Devices**: S = phone (≤430 px wide), T = tablet, L = landscape phone/tablet, D = all sizes.
Evidence: `reports/mobile-audit/findings-2026-10-19T12-47-12-792Z.json` and
`reports/mobile-audit/screenshots/` (baseline combos: chromium + webkit @ 390×844 dark, @ 360×800 light).

| # | Screen(s) | Device(s) | Defect | Root cause (verified in source) | Fix phase | Evidence |
|---|-----------|-----------|--------|--------------------------------|-----------|----------|
| 1 | Write Pseudocode (both editors) | S, T | Right ~27 px of **both** editors permanently clipped; the wand button area and right padding are cut off (36 of 38 write-pseudocode visits — every viewport except desktop 1024×768) | `#page-write-pseudocode .code-editor { flex: none }` (style.css:10790) makes width fall back to base `.code-editor { width: 100% }` (style.css:2238) = 100 % of the host **plus** the 40 px gutter; `.editor-with-gutter { overflow: hidden }` clips the 40 px overflow. Live probe: textarea 364 px inside a 364 px host with a 40 px sibling | 2 | `*-chromium-390x844-dark-student-write-pseudocode.png`, findings JSON `overflow` entries `textarea#pseudocode-editor … clipped` |
| 2 | Write Pseudocode | S, T | With a long draft the line-number gutter runs ~370 px **below** the 338 px textarea — an empty striped strip; panel-footer pushed down | Textarea height fixed at `40dvh` (style.css:10791–10795) while the gutter grows with content (32 lines → 707 px) and, as the tallest flex item, stretches the shared line; the container grows to the gutter, not the textarea. Harness now records it: `gutter: 707, textarea: 338` | 2 | findings JSON `editorHeights` on `write-pseudocode` |
| 3 | Write Pseudocode (every screen inherits the bar's viewport budget) | S, L | Fixed bottom action bar consumes **12–25 %** of the viewport (141–143 px portrait, worst 25 % on 320×568; 93–94 px = 24–25 % on landscape phones) | `#exercise-action-bar` (style.css:10742, fixed at ≤1023 px) is sized by its 3-button + 2-row content; the page reserves a hard-coded `--exercise-actions-height: 220px` padding (style.css:10787) that doesn't match the real 141 px bar | 2 | findings JSON `actionBar` (`height`, `viewportShare`), landscape baseline screenshots |
| 4 | Developer Options | S | DevTools tab strip wraps to **4–6 rows, 125–197 px** (35 % of a 320×568 viewport) vs a 40 px single row at ≥667 px | `flex-wrap: wrap` for the tab bar in the ≤639 px media block (style.css:10205) with 20 tabs | 2 | `*-devtools-tokens.png`, findings JSON `tabBar` |
| 5 | Analytics (chart popovers) | S | Open "Select students" / info popovers extend up to **168 px past the viewport** (167 clipped entries); the right part (checkbox labels!) is clipped with no way to scroll | `.an-popover` is absolutely positioned (`left: 0`, width `min(260px, 70vw)`, style.css:10847) from chart headers near the right edge; `main-content`/`app-layout` `overflow-x: hidden` cuts it. Harness now measures popovers **open** (that's how students meet them) | 2 | findings JSON `overflow` entries `div.an-popover … clipped` |
| 6 | All interactive screens | S, T | **49,446 of 63,186 measured elements (78 %) are < 44×44 px** (e.g. Manage Students 95/96, theme toggle 38×36 on every screen, `.btn-sm` 28×36, DevTools tabs) | Small-by-default component CSS: `.btn-sm`, `.btn-icon`, `.sg-chip`, `.devtools-tab` have no 44 px minimum; root `font-size: 14px` (13 px ≤480 px) compounds `rem`-sized paddings. *(Stats exclude visually-hidden skip links and SVG chart data points — a11y affordances and data, not app-sized tap targets.)* | 1–2 | findings JSON `touch` arrays |
| 7 | Nearly every screen | S, T | Visible text down to **8.06 px** (`#notif-badge`), 8.4 px `.pipe-func`, 8.45 px `.nav-section-label` / `.user-role`, 8.58 px `.pipe-time` | Explicit px/`rem` sizes below the 12 px floor, amplified by the 14 px/13 px root font | 1–2 | findings JSON `smallText` |
| 8 | DevTools editor, filters, selects | S, T | Inputs render at **10.14–14 px** (`#sim-expected-output` 10.14 px, DevTools filter selects 10.4 px) → iOS focus zoom on every field focus | Same root-font issue + explicit px sizes on `input`/`select`/devtools textarea (13 px, 12 px, 11.2 px) | 1–2 | findings JSON `smallInputs` |
| 9 | System-wide (browser chrome / PWA system bars) | D | `<meta theme-color>` (`#0f172a` / `#f8fafc`) doesn't match the actual header (`#0d0d14`); `manifest.json` `theme_color` is `#3b82f6` (blue) → wrong-colored status bar + splash | Static metas never updated on theme switch (`src/app/appearance.js` has `themeColorFor()` but only the dark value is wired); manifest copied from an older design | 1 | findings JSON `themeMeta` (all 1 856 visits) |
| 10 | Boot (all roles) | D | Editor input (line count, gutter, error-clear) is **unresponsive for 1.5–11.8 s (median 5.1 s)** after app-layout visible; typing during that window silently does nothing | `init()` (`src/app/initialization.js`) binds the editor `input` listener only **after** `await restoreSession()` + IndexedDB cache loads; on a Firestore-connected boot that's seconds. Live probe: input worked immediately once `init()` completed at 7.2 s | 1 | findings JSON `initWaitMs` (684 visits, 0 timeouts) |

### Informational (not defects, tracked for completeness)

* **No document-level horizontal overflow anywhere** (every visit's scroll width
  ≤ viewport; a single −6 px scrollbar artifact at webkit 1024×768). The
  `overflow-x: hidden` crutches on `.main-content`/`.app-layout` prevent page
  scroll but *hide* real clipping (findings #1, #5) — Phase 2 replaces them with
  proper `min-width: 0` and removes the crutches where safe.
* Login hero shapes (`div.hero-shape`) register as clipped; they are decorative
  background art intentionally cut by their container on all viewports.
* `.sg-chip` chips inside `.sg-cats` are *scrollable*-classified (reachable via
  swipe, no visible affordance) — Phase 2 adds a scroll hint.
* The action bar does **not** permanently cover the panel-footer buttons when
  scrolled to the end (verified: empty `hiddenBehindWhenScrolledToEnd` across all
  visits + probe) — its defect is size only (#3).

### Corrections to preliminary observations

Recorded so the audit trail stays honest:

1. *Preliminary claim: "line numbers don't update while typing" (gutter defect).* **Not
   reproducible after init completes** — the audit's early runs measured at ~2.4 s,
   before `init()` finished binding the editor at ~7 s. The input pipeline works
   (probe: 32/32 numbers). The real gutter defect is the **height model** (#2).
   Root cause of the confusion: the harness now waits for the input binding (#10).
2. *Preliminary claim: "all four panel-footer buttons are hidden behind the action
   bar".* **Disproved**: when scrolled to the end, every footer button clears the
   bar in all measured combos. The bar's defect is that it eats 12–25 % of the
   viewport (#3).
3. *Preliminary claim: "editor text clipped vertically at the bottom".* **Refined**:
   the measured clip is **horizontal** (right edge, #1); the vertical symptom at
   long drafts is the gutter strip (#2).

## Phase mapping

| Phase | Scope | Fixes |
|-------|-------|-------|
| 1 — Foundation | Viewport/meta/manifest, root font, dvh, min-width, touch baseline, editor binding order, overlay back-button, draft autosave | #6 (baseline), #7 (root font), #8 (root font), #9, #10 |
| 2 — Components | Editor host sizing, action-bar compaction, DevTools tab strip, popovers, hit targets, font floors, crutch removal | #1, #2, #3, #4, #5, #6 (targets), #7 (floors), #8 (floors) |
| 3 — Checks | `npm run test:mobile` Playwright regression assertions (`npm test` stays green without browsers) | locks all of the above |
| 4 — Devices | Owner-executed iOS Safari/PWA + Android Chrome/Samsung/PWA checklist | real-device confirmation |

## Reproducing

```
npm ci                      # installs @playwright/test (dev-only)
npx playwright install      # chromium + webkit browsers
npm run audit:mobile        # full matrix (~1 h); --quick, --engine, --sizes, --themes to narrow
```

The harness boots `server.js` on port 3999 (`AUDIT_PORT` to override), injects
seeded sessions, and writes `reports/mobile-audit/findings-*.json` plus baseline
screenshots. It is **not** part of `npm test`.
