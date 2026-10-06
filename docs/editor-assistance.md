# Source editor assistance

The student exercise editor, free-translation editor and developer source editor
offer a floating Review pseudocode wand. Review compiles locally without running
Python and without adding events to an existing debugger trace. Compiler errors
and warnings retain their line numbers and suggestions; Go to line selects the
affected source for manual correction.

Known statement-keyword typos can be previewed and applied individually. Undo
restores the most recent correction only if the source has not subsequently
changed. Strings, assignment identifiers and ambiguous algorithm changes are
not automatically rewritten. Translate and run again after corrections: syntax
acceptance does not establish that an algorithm produces the intended answer.

Developer source line numbers include blank lines, stay outside the actual code,
and follow scrolling. Long source lines scroll horizontally rather than wrapping
into additional apparent numbered lines. Existing programmatic imports and
attempt restoration refresh the gutter while it is visible.

Validation on 2026-10-06: build and build:check pass; five new assistance tests
pass; operator translation smoke test passes. Full suite: 754/755 pass under
Node 24 (Node 22 was not installed). The recovery-footer assertion in
primary-action-position.test.js also fails against unchanged master 82e67d1.
Browser visual, touch and focus verification remains outstanding; no browser
binary was available. No production deployment or Firebase change was made.
