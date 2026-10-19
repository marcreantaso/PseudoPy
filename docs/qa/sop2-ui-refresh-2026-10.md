# SOP2 panel + theme refresh — October 2026

Scope: restyle Developer Options → **SOP2 Comparison** in shadcn/ui style and fix
light/dark theming across the app, using vanilla CSS/JS only (no React, Tailwind,
Radix, CDNs, or new dependencies). Comparison logic, metrics, and export content are
unchanged; only markup, styling, ARIA, and the harness used to photograph them moved.

Branch `sop2-measurement-v2`, one commit per phase:

| Phase | Commit | Contents |
| --- | --- | --- |
| 0 Audit | `33ad4a9` | `scripts/qa/devtools-audit.cjs`, 160 before shots + `measurements.json` in `artifacts/devtools-audit/before/` |
| 1 Theme | `44cc37f` | head theme bootstrap, `color-scheme` per theme, shadcn token aliases, `.theme-menu`, `src/app/appearance.js`, `initTheme()` |
| 2 Components | `5d68100` | full `.pp-*` primitive section in `style.css`, devtools tab bar pill-track, Runtime Console header |
| 3 SOP2 panel | `d11f1e9` | SOP2 markup rebuilt as two `pp-card` sections, example optgroups (Seed / Holdout / Injected), export menu button, progress semantics; `tests/research-ui.test.js` bind list updated |
| 4 Contrast + tests | `118f07c` | dark AA contrast fixes in `style.css`, +2 tests in `tests/contrast.test.js`, new `tests/ui-refresh.test.js` (11 tests), cache pins bumped |
| 5 Evidence | this commit | 12 before + 12 after state shots, 160 after audit shots, harness fixes, this report |

## Design changes

**Theme (P1).** One theme control: a shadcn-style popover menu on `#theme-toggle-btn`
with three `role="menuitemradio"` items (light / dark / system), storage key
`pseudopy_theme`, default `dark`, exactly one `themechange` event per switch
(`announce:false` on boot). `color-scheme: light` / `dark` is declared in the first
`:root` / `[data-theme='dark']` block so form controls, scrollbars, and caret follow
the theme. shadcn token *names* (`--background`, `--foreground`, `--ring`,
`--radius`) are `var()` aliases of the existing `-tok` tokens — no new hex values
were introduced in component rules.

**Components (P2).** `style.css` gained a single `.pp-*` section (button, input,
select, checkbox, card, badge, tabs, table, empty state, skeleton, dialog/popover
surfaces) implemented from the same tokens. The devtools tab bar became a
pill-track (`.devtools-tab-bar`) with the active tab as a filled pill; the Runtime
Console got a proper header.

**SOP2 panel (P3).** The panel is now two `pp-card`s — *Inputs* and *Run settings* —
with the example picker as three optgroups (Seed / Holdout / *Injected (deliberately
broken)*, fed by `Sop2Injection.injectAll` so selector and dataset cannot drift).
The export action is a menu button (`#sop2-export-btn` + `#sop2-export-menu`, three
export item IDs preserved, roving focus, Escape/outside-click). Progress is
rAF-throttled: bar = completed count, label = current 1-based case, plus
`aria-valuetext` and a `title` tooltip. Two IDs were renamed —
`#sop2-bench-cancel` → `#sop2-cancel`, `#sop2-export-md` → `#sop2-export-report` —
with `tests/research-ui.test.js` updated in the same commit.

**Contrast (P4).** Dark `--primary-foreground` now resolves to `var(--bg-primary)`
(6.35:1 on `--primary`), `.skip-link` uses `--primary-foreground`, `--border-input`
is `#64748b` (4.76:1 on white) / `#7c7c90` (4.71:1 on `#0e0e16)`, and the tab-bar
`scrollbar-color` uses `--border-input`. Interpretation used throughout: **3:1 is
required of control-identifying borders** (`--border-input` on inputs, selects,
outline buttons, checkboxes); purely structural borders (`--border-strong`,
`--border-divider`) remain opacity-based, matching the pre-existing test contract.

## Evidence

Screenshots (all PNG, viewport-sized, no CDN icons in any shot — see Risks):

| Set | Path | Count | Notes |
| --- | --- | --- | --- |
| Audit before | `artifacts/devtools-audit/before/` | 160 | 20 tabs × 4 widths × 2 themes (Phase 0) |
| Audit after | `artifacts/devtools-audit/after/` | 160 | identical methodology, zero console errors |
| State before | `artifacts/devtools-audit/before-states/` | 12 | idle/results/running × 1440/375 × light/dark, captured from commit `33ad4a9` in a throwaway worktree |
| State after | `artifacts/devtools-audit/after-states/` | 12 | same matrix on this branch, zero notes, zero console errors |

Each state set ships a `results.json` whose per-shot `verify` object records the
evidence the capture itself cannot: `tabBarVisible`, `actionsVisible`,
`resultCards`, `progressShown`, and the visible `resultText` excerpt. Verified
values: idle → `cards=0`, text starts `No comparison yet…` (after) /
`Load an example or paste pseudocode…` (before); results → `cards=2`,
`Baseline B2 (rule-based)…`; running → `progressShown=true` with fill width in
(0, 100). `tabBarVisible=true` and `actionsVisible=true` on all 24 shots, and all
24 PNG MD5s are unique (the first capture attempt produced byte-identical
idle/results pairs because the tab bar sits below the fold at default scroll —
fixed in `scripts/qa/sop2-states.cjs`, see below).

Audit `measurements.json`, before → after (8 combos, both files at
`artifacts/devtools-audit/`):

| Metric | Before | After | Meaning |
| --- | --- | --- | --- |
| `tabScrollbarHeight` | 1 | 0 | pill-track replaced the raw horizontal scrollbar |
| `tabOverflowX` (1440/1024/768/375) | 580/925/692/0 | 598/943/700/0 | tab row still scrolls horizontally by design, no visible scrollbar |
| `colorScheme` | `normal` | `light` / `dark` | theme now drives the UA stylesheet |
| `activePanel` | `devtools-panel-impl` | unchanged | navigation path identical |
| `sop2InlineStyles` | 0 | 0 | no inline styles reintroduced |
| `consoleErrors` | `[]` | `[]` | clean in both runs |

## Tests

`$env:PYTHON='python'; npm test` — build freshness, `node --test tests/*.test.js`
(**932 tests**), then `node test_operator_translation.js`. Phase 4 added:

- `tests/contrast.test.js` +2: 18 refresh token pairs resolved through `var()`
  chains (`resolveVar()` against a merged dark cascade) at 4.5:1 text / 3:1
  control-border in both themes, plus existence of the shadcn aliases.
- `tests/ui-refresh.test.js` (11): theme menu markup + bootstrap order +
  `appearance.js` contract, `color-scheme` placement, hex-free chrome section,
  `.pp-*` primitive set + a11y attributes, pill-track, preserved/renamed SOP2 IDs
  and no inline styles, ARIA contracts (menu button, `aria-valuetext`,
  `role="menuitemradio"`), research-ui source contracts, and page/sw `?v` pin
  agreement.

Focused runs: `node --test tests/ui-refresh.test.js`,
`node --test tests/contrast.test.js` (rebuild first after `src/` edits).

## Harness work (Phase 5)

- **`scripts/qa/cdp.cjs` — `newPage` now creates tabs over the browser WebSocket**
  (`Target.createTarget` + direct page-WS connect) instead of the legacy HTTP
  `PUT /json/new`. On Chrome 155 the HTTP endpoint accepts the connection but never
  answers, and one wedged request blocks *every* later connection to the DevTools
  server — including WebSocket fallbacks — so the HTTP route was abandoned entirely.
  This is QA tooling only; no app code is affected.
- **`scripts/qa/sop2-states.cjs`** (new) captures the 12 state shots per tree. It
  navigates by forging a session (`showApp('developer-options')` →
  `navigateTo` → `devToolsSwitchTab('sop2')`), loads the first *populated* example
  option (the static `Choose a case…` placeholder has `value=""`), drives Compare /
  Benchmark, and waits on both markup generations' markers. Because `#main-content`
  and `#devtools-panel-sop2` are the real scrollers and the tab bar sits below the
  fold at default scroll (y = 934/1511/1497/1649 at 1440/1024/768/375), every shot
  first aligns `#sop2-actions` to the top of the 400 px panel body, then scrolls the
  tab bar into view, then asserts visibility into `results.json`.
- Before-shots are taken from a detached worktree at `33ad4a9` so old and new
  renderings come from the exact commits being compared.

Reproduce:

```
node scripts/qa/sop2-states.cjs after        # 12 state shots
node scripts/qa/devtools-audit.cjs after     # 160 audit shots + measurements.json
```

## Risks and caveats

1. **CDN icons are absent from every screenshot** (before *and* after): the harness
   blocks `https://` so Lucide never loads in either tree. Pixel comparisons are
   therefore consistent, but shots do not show the icon glyphs the browser build
   renders. Nothing in the app depends on the CDN for layout.
2. **Border contrast is asserted only for control-identifying borders.**
   Structural dividers stay opacity-based by design (pre-existing test contract);
   if a reviewer expects literal 3:1 on every 1 px rule, that is a spec decision to
   revisit, not a missed test.
3. **Audit shots capture the default scroll position** (identical methodology on
   both trees), so the tab bar/panel are below the fold at all four widths in the
   160-shot sets; those sets compare the header/toolbar region. The 12-shot state
   sets are the scrolled, state-specific evidence.
4. **Visible behavior difference during a benchmark run:** the old panel kept the
   previous `.sop2-card` results on screen while running; the new panel clears them
   and shows an `aria-hidden` `.sop2-skeleton` block. Metrics and exports are
   unaffected.
5. **Pre-existing bug fixed:** the old cancel button rendered even when `hidden`
   (no `display: none` for hidden `.pp-btn`s) — `.pp-btn[hidden] { display: none }`
   corrects it; the old ID `#sop2-bench-cancel` still exists in old markup and the
   harness accepts either ID.
6. **No cache pin bump was needed for Phase 5** — no precached asset changed
   (`sw.js`, `style.css`, `index.html` untouched in this commit). Phases 1–4 ship
   `style.css?v=ux-20261019-11` with `pseudopy-*-20261018-v36` cache names, and
   `tests/ui-refresh.test.js` fails if page and service-worker pins ever disagree.
7. **Harness fragility:** the run depends on headless Chrome plus
   `window.__qaGen`-guarded reloads; a Chrome startup stall fails fast with a note
   in `results.json` rather than a silent bad shot. Each state step is non-fatal —
   a failed compare/benchmark records a note and still captures whatever state the
   panel reached.
