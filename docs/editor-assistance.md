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
| `insert-keyword` | Inserts a missing header keyword immediately before the token that follows the name: `FOR i 1 TO 10 DO` → `FOR i FROM 1 TO 10 DO`, `DECLARE x INTEGER` → `DECLARE x AS INTEGER`, `SET x 5` → `SET x TO 5` | Only when the parser classified the header (`detail.expected`, `detail.foundType`); preserves indentation, trailing `#` comments and CRLF |
| `rewrite-header` | Replaces the wrong header token with the expected keyword: `FOR i IN 1 TO 10 DO` → `FOR i FROM 1 TO 10 DO`, `SET x t0 5` → `SET x TO 5` | Same classification gate; the leading token of the line body must match `detail.found` |

### Header repairs are verified, never guessed

A header edit is only offered as `qualified: true` when re-compiling the
rewritten line both clears the diagnostic it came from and leaves that line free
of errors (`pseudopyHeaderFixResolves` in `src/app/editor-assistance.js`). This
runs the local compiler read-only — no student code is executed — and is what
lets "Apply all safe fixes" stay honest: a repair that would merely trade one
error for another is downgraded to guidance instead of being applied.

Shapes that must stay manual, and are shown as guidance cards explaining why:

- `FOR i TO 10 DO` and `FOR i 1 2 TO 10 DO` — no start value can be chosen for
  the student, and inserting `FROM` would not repair the line on its own.
- `FOR i <= 10 DO`, `FOR i < n DO` — this is a condition, which belongs in a
  `WHILE` loop; converting it would also require rewriting the body and closer.
- `DECLARE x`, `DECLARE x foo` — no recognised type to place after `AS`.
- `SET x < 5`, `SET x total 5` — the right-hand side does not read as one value.

## Transactional application

Applying a fix (or "Apply all safe fixes") validates every fix against the exact
source revision the user is looking at: any stale line or overlapping edit
aborts the whole batch with no partial changes. Corrections preserve blank lines,
indentation, quoted strings, assignment identifiers and CRLF line endings.

## After applying

The translated Python, console area and run button are refreshed without
executing anything and without touching the debugger trace or DevTools run
state. The console notes that the program must be run to produce output; the
exercise is marked as not yet translated/executed. Syntax acceptance does not
establish that an algorithm produces the intended answer.

## Applying a fix: close, jump, undo

An apply does not stay in the dialog. `commit()` closes it, focuses the editor,
selects the repaired line and scrolls it into view (`goToLine`), so the student
sees the change in place. Because the dialog is gone by then, Undo cannot live in
the dialog footer: a single pending-correction record per editor drives a
host-level **Undo fix** button next to the wand (`.source-assistance-undo`),
shown only while the last correction is still the editor's current content. Any
edit after the correction makes Undo lapse rather than discard that edit.
Programmatic `.value` writes are not browser-undoable, so this button is the
only undo path for an applied correction.

## Reaching the review from the console

When translation fails, `renderHtmlErrors(errors, editorId)` appends a
**Fix pseudocode** button to the console error block. It calls the global
`pseudopyOpenAssistanceFor(editorId)`, which looks the editor up in
`window.__pseudopyAssistanceStates` and opens the same review dialog — the wand
is no longer the only entry point.

## Wand badge

The main editor's wand carries a count badge (`.source-assistance-badge`) driven
by the debounced real-time snapshot: it shows how many `qualified` fixes the
current source has, and hides at zero. The badge only consults a snapshot whose
`source` still matches the editor, and skips the count entirely when the snapshot
reports no errors.

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

## Verification (2026-10-13)

- `npm run build`; `npm test` runs `npm run build:check` first, so generated
  bundles are current.
- `npm test`: 843 tests pass, including the new statement-header cases in
  `tests/editor-assistance.test.js` (repair compiles for each shape, guidance is
  offered for the shapes that must stay manual, CRLF/indent/comment
  preservation, changed-line reporting), three compiler-level cases in
  `tests/compiler.test.js` (structured classification; a header missing `TO` no
  longer also reports the `DO` sentinel) and two regression cases in
  `tests/editor-assistance-regression.test.js` (a repair that does not verify
  degrades to guidance). The Unicode operator translation smoke check also
  passes.
- `node verify_app_refactor.js`: 32 checks pass.
- `node scripts/qa/editor-assistance-browser.cjs` was rewritten for the new flow
  (apply → dialog closes → repaired line selected → host Undo → console
  "Fix pseudocode" button → wand badge → condition-style guidance). It was **not**
  executed as part of this change: no headless Chromium run, screenshots or
  visual inspection were performed here, so the previous entry's screenshot
  claims still refer to the pre-2026-10-13 interaction.

Manual shapes worth checking in a browser: `FOR i 1 TO 10 DO`,
`FOR i i TO 10 DO`, `FOR i <= 10 DO`, `SET x 5`, `SET x t0 5`,
`DECLARE x INTEGER`.
