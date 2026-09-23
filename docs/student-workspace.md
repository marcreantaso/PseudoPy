# Student learning workspace

The student Write Pseudocode and Translate pages now enhance their guide and
append collapsible Algorithm Flow and Session Insights panels. The modules in
`src/student/` adapt the existing compiler and learning-pipeline results. They do
not load Developer Options or run another lexer/parser.

## Data definitions

- Live session data is memory-only, scoped to the signed-in student, and reset
  on logout/account change or page reload. Instructor/admin work is excluded.
- Translation count, compilation success, full-pipeline time, compiler errors,
  execution count and runtime failure rate use real translation/runtime results.
  Zero-denominator rates show 0 until activity occurs.
- A run updates execution KPIs without creating another translation point.
- Chart lines are compilation outcome (0/100), a validation **indicator**
  (`max(0, 100 - 15*errors - 5*warnings - 2*suggestions)`), and cumulative
  compilation success rate. The indicator is a transparent heuristic, not a
  grade or correctness measurement. Its definition is shown beside the chart.
- Numeric concept mastery is unavailable: pattern detection runs on valid
  programs and does not attribute errors to individual constructs. Detected
  patterns are listed as practice evidence instead.
- Learning History subscribes to `pseudopy_evidence` using a server-side
  `studentId == current student` query on the existing Firebase instance.
  Seeded records and malformed timestamps are excluded. Permissions/offline
  failures are visible; navigation/logout cancels the subscription.
- Evidence capture is student-only. New records include `evidenceOrigin`,
  `validationIndicator`, and `indicatorVersion`. No new Firebase app or
  collection is created, and raw ASTs/tokens are not persisted by this feature.

## Guide and flow

Example insertion uses the textarea cursor and preserves all existing content,
including selections. There is no replace-all operation. When inserting into an
existing program, the outer BEGIN/END wrapper is omitted.

Guide expansion is remembered per account/device. Context tips inspect only
the current line; they do not compile while typing. Actual translation issues
open the flow feedback, with Issue/Fix and Show Example actions.

Step Through is a **static structure preview**, not runtime debugging. Both
branches and function bodies may appear in this preview; no branch outcomes or
variable values are invented. Unique statement matches can highlight a Python
line. Ambiguous mappings are omitted. Edited source disables stepping until the
next translation. Actual runtime success/failure and output appear only after
Skulpt runs the matching generated code.

## Verification

Automated coverage: `tests/student-workspace.test.js` compiles every guide and
operator example using the production compiler, checks insertion/context tips,
adapts real AST/tokens/Python, verifies KPI calculations and pure trajectory
updates, filters historical records, and exercises account/runtime isolation.

Manual browser checks still required:

1. Student login: first-use guide expanded; collapse preference survives reload.
2. Insert examples into empty and populated editors; verify no text is lost.
3. Translate an unclosed IF: friendly fix opens, Show Example selects Conditions.
4. Inspect tokens/tree/Python, use keyboard-only preview controls, then edit
   source and verify stale-results messaging.
5. Translate several valid/invalid programs; run success and runtime-error
   cases; check all KPI and chart values against those attempts.
6. Toggle chart series; focus/tap points; inspect the accessible data table.
7. Use two student accounts: verify history isolation and logout cleanup,
   including while an INPUT prompt or Firestore request is pending.
8. Check Firestore permissions, live evidence updates and offline messaging.
9. Test light/dark, 320–430px, tablet/desktop, iOS Safari/PWA and Android
   Chrome/PWA for horizontal overflow, touch targets and focus visibility.
