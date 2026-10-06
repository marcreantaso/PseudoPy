# Source editor assistance

The student exercise editor, free-translation editor and developer source editor
offer a floating Review pseudocode wand. Review compiles locally without running
Python and without adding events to an existing debugger trace. Compiler errors
and warnings retain their line numbers and suggestions; Go to line selects the
affected source for manual correction.

## Reviewed Quick Fixes

The compiler never repairs source. All Quick Fix candidates are generated in
`src/app/editor-assistance.js` from the compiler's structured diagnostics
(`code`, `fixKind`, `detail`). Only `qualified: true` candidates are ever
applied; everything else is educational guidance that needs the student's
decision (for example an undeclared variable, where type and insertion point
are the student's to choose).

| `fixKind` | What it rewrites | Constraints |
| --- | --- | --- |
| `insert-sentinel` | Appends the missing `THEN` / `DO` to the IF / loop header on that line | Never re-inserted when the next non-blank line already carries the sentinel; preserves trailing CRLF |
| `rewrite-closing-keyword` | Rewrites a mismatched `END X` to the closer the parser expected | Requires a matching original closing line and one unambiguous program `END` |
| `close-block` | One bundled edit inserting the missing `END <Type>` closures, innermost first (LIFO), immediately before the program's final bare `END` | Requires exactly one bare `END` and no code-after-END diagnostic; duplicate reports collapse to one fix; a block handled by a closing-keyword rewrite is excluded to avoid a double closure |
| `keyword` | Misspelled statement keyword from the known dictionary, or a conservative Levenshtein hit | Never a known keyword, never an assignment left-hand side; one candidate per line |

## Transactional application

Applying a fix (or "Apply all safe fixes") validates every fix against the exact
source revision the user is looking at: any stale line or overlapping edit
aborts the whole batch with no partial changes. Undo restores only when the
source has not subsequently changed. Corrections preserve blank lines,
indentation, quoted strings, assignment identifiers and CRLF line endings.

## After applying

The translated Python, console area and run button are refreshed without
executing anything and without touching the debugger trace or DevTools run
state. The console notes that the program must be run to produce output; the
exercise is marked as not yet translated/executed. Syntax acceptance does not
establish that an algorithm produces the intended answer.

## Review dialog

The dialog is a native `<dialog>` opened with `showModal()`. Desktop centers it
(layout overrides the global reset's `margin: 0`); below 40rem it becomes a
bottom sheet bounded by `90dvh` with safe-area padding. Status announcements
use `role="status"` / `aria-live="polite"`; the close controls are 44px targets.
Error lines are surfaced in the editor gutter while the dialog is open and
restored on close.

## Real-time validation

`src/app/realtime-validation.js` debounces a silent, trace-free compile while
typing (1s) and skips during IME composition. `setRealtimeValidationHandler`
registers a consumer for the latest `{ source, result }`; `editor-assistance.js`
keeps it as advisory snapshot only — the review dialog always revalidates on
open.

## Summary

Developer source line numbers include blank lines, stay outside the actual code,
and follow scrolling. Long source lines scroll horizontally rather than wrapping
into additional apparent numbered lines. Existing programmatic imports and
attempt restoration refresh the gutter while it is visible.

## Verification (2026-10-06)

- `npm run build` and `npm run build:check`: generated bundles are current.
- `npm test`: 797 tests pass on Node 22.23.3 with Python 3.12.10, including
  20 editor-assistance tests; the operator-translation smoke check also passes.
- `node verify_app_refactor.js`: 32 checks pass.
- `node scripts/qa/editor-assistance-browser.cjs`: headless Chromium checks
  pass at 320, 375, 768 and 1440px in both themes. Coverage includes separate
  error/warning cards, viewport bounds, mobile bottom-sheet positioning,
  Apply/Undo, Python refresh, preserved active traces, Escape and restored
  focus. Free translation and DevTools editor application also pass.
- Before/after screenshots are written to `%TEMP%/opencode/pseudopy-assistance`
  (override with `QA_OUT`). Mobile light and desktop dark screenshots were
  visually inspected. No new browser console errors occurred in these checks.

Mobile checks use Chromium emulation; physical touch devices and iOS WebKit
were not tested.
