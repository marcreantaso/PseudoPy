# Implementation Plan

Status of the three-part work requested for the panel response. Each item names
the artefact that proves it, so the plan can be checked rather than trusted.

## Part 1 — Unicode operators and monospace rendering

| Item | Status | Evidence |
|---|---|---|
| One `--font-mono` token for every code surface | Complete | `style.css`, `student-workspace.css`; `tests/operators-fonts.test.js` |
| Ligatures disabled on every monospace surface | Complete | `font-variant-ligatures: none; font-feature-settings: "liga" 0, "calt" 0` asserted per rule |
| Bundled offline no-ligature font (JetBrains Mono NL, OFL 1.1) | Complete | `vendor/fonts/*.woff2`, `@font-face`, service-worker precache |
| One shared `SYMBOL_MAP` | Complete | `src/compiler/language-spec.js`; parity test forbids a second table |
| `⩾ ⩽ ∕ ∧ ∨ ¬` added | Complete | lexer normalization test |
| Friendly hints for `√ π ± ≈` | Complete | `LANGUAGE_SPEC.unicodeHints`; hint test |
| System-generated text uses Python operators | Complete | system-text symbol guard test; index.html mastery rubric fixed |
| "Use Python operators in output text" setting (default ON) | Complete | `src/app/appearance.js`, settings toggle, formatter test |
| Formatter with visible change list and undo | Complete | `src/compiler/formatter.js`, Format button, Normalize panel |
| Console polish (one line box, wrapping, distinct echo) | Complete | `style.css` console block |
| Unicode identifiers (NFC, homoglyph, zero-width) | Partial | see Owner actions |
| Before/after screenshots at 375/1440 px, light/dark | Complete | `artifacts/operator-diagnosis/` plus `artifacts/operator-after/` |

## Part 2 — Implementation panel and docs

| Item | Status | Evidence |
|---|---|---|
| `npm run docs:implementation` generator | Complete | `scripts/docs-implementation.js` |
| Generated `docs/IMPLEMENTATION_COMPONENTS.md` from the repo | Complete | generator read-through of `src/bundles.json`, `package.json`, `vendor/` |
| Panel renders generated JSON (offline, no fetch) | Complete | `src/devtools/implementation-data.js` in the devtools bundle |
| shadcn-style Card/Table/Badge, filter chips, expandable rows | Complete | `src/devtools/implementation-panel.js`, `tests/implementation-panel.test.js` |
| Attribution section with real links | Complete | panel renders `href` links to both docs |
| Truthfulness check on the "no backend" thesis claim | Complete | thesis-claim audit in the generated doc and panel |
| `docs/IMPLEMENTATION_PLAN.md` | Complete | this file |

## Part 3 — Compliance matrix

| Item | Status | Evidence |
|---|---|---|
| `docs/PANEL_COMPLIANCE.md` traceability matrix | Complete | C1–C5 with honest Complete/Partial/Missing |
| Panel "comments status" card generated from the matrix | Complete | `src/devtools/compliance-data.js` |
| Verified by running the system, not reading claims | Complete | each row cites a named passing test |
| Owner actions for every Partial/Missing item | Complete | Owner actions section |

## Owner actions (things the plan cannot close from code alone)

1. **Unicode identifiers** — the compiler accepts ASCII identifiers only.
   Normalising NFC, rejecting homoglyphs and zero-width characters needs a
   decision on policy (reject vs. fold) and a dataset of intended scripts.
2. **Stage-name unification** — surfaces still differ (pipeline strip,
   simulation ledger, metrics chart, `docs/COMPILER_PIPELINE.md`). The
   canonical list now exists in the generator; repointing every surface is a
   follow-up with its own visual check.
3. **Function arity and call stack** — `language-spec.js` still records that
   signature validation is incomplete, and Exec Trace has no call stack.
4. **Offline browser certification** — the real-browser offline script is
   checked in but its run remains blocked (see
   `docs/qa/sync-recovery/scope-alignment.md`).
