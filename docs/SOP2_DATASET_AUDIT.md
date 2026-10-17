# SOP 2 Dataset Audit

Composition, provenance and integrity of the dataset used by
`npm run sop2`. Numeric results below are from the 2026-10-17 full run
(`sop2-comparison-results.md`, 253 cases).

## Composition

| Group | Cases | Source |
| --- | ---: | --- |
| seed | 30 | `src/database/seed-data.js` (built-in exercises) |
| holdout | 30 | `src/research/holdout-cases.js` (independently written) |
| injected | 193 | `src/research/error-injection.js` applied to the 60 base cases |
| **total** | **253** | |

107 injection variants were **skipped** because the target construct was
absent from the base case; the skipped list is carried in the results
`dataset.skippedInjections` and is never hidden:

| Injection type | Applied | Skipped | Why skipped |
| --- | ---: | ---: | --- |
| `keyword_typo` | 59 | 1 | no recognisable statement keyword |
| `missing_end_if` | 20 | 40 | no `IF … THEN` / `END IF` |
| `undefined_variable` | 52 | 8 | no assignment to rewrite |
| `wrong_argument_count` | 2 | 58 | no `CALL`/function call to extend |
| `return_outside_function` | 60 | 0 | always applicable |

## Seed set (30 cases)

Built-in exercises from `database.js` (`python_code` is the reference).
These were available while the compiler was designed, so they measure
"does the product handle the material it was built for", not
generalisation. They are **not** a held-out test set.

## Holdout set (30 cases)

Written independently of the seed set, with the following rules (also
stated in the file header):

- Uses only constructs documented in `docs/compiler-language.md`.
- Deliberately varied style: `SET … TO` / `<-` / `:=` / `=`,
  `END IF`/`ENDIF`, `END FOR`/`ENDFOR`, `OUTPUT`/`PRINT`/`DISPLAY`,
  numbered lines, comments, varied naming.
- `python_code` is an independently written solution to the same task,
  not copied from PseudoPy output.
- No student names or classroom identifiers.

Integrity guarantees enforced by `tests/research-modules.test.js`:
30 unique ids; every case has non-empty `pseudocode` and `python_code`;
every case starts with `BEGIN` and ends with `END`; no out-of-spec
`PROGRAM` sentinel. (A `PROGRAM` sentinel once slipped into one case and
was removed in this revision — the test now prevents a recurrence.)

### Known false-positive rejections (published, not hidden)

Four holdout cases are **rejected by PseudoPy** even though the
pseudocode is within the documented language:

| Case | Variable | Diagnostic |
| --- | --- | --- |
| `holdout_4` | `top` | cannot assign an unknown value to a variable `DECLARE`d a number |
| `holdout_10` | `temp` | (same) |
| `holdout_14` | `low` | (same) |
| `holdout_19` | `tmp` | (same) |

All four follow the pattern `DECLARE x AS INTEGER` then `x = arr[i]`
(assigning an *array element* to a declared numeric variable). PseudoPy's
symbol table cannot prove the element's type and rejects the assignment
fatalistically; `x = arr[0] + 0` is accepted. This is a real false
positive in the product, exposed — not caused — by the holdout set, and
it is counted against PseudoPy in every reported rate. It is recorded
here so the numbers can be read correctly and the limitation can be
fixed.

## Injected set (193 cases)

Each injection is applied to a base case; the injected row keeps the base
case's reference Python, so "correct" on an injected row would mean the
broken program coincidentally printed the right answer (it is not the
point of this group). Per-type results from the last run:

| Injection type | Cases | PseudoPy rejected | PseudoPy silent failures | B2 rejected | B2 silent failures |
| --- | ---: | ---: | ---: | ---: | ---: |
| `keyword_typo` | 59 | 59 | 0 | 0 | 59 |
| `return_outside_function` | 60 | 60 | 0 | 0 | 60 |
| `missing_end_if` | 20 | 20 | 0 | 0 | 20 |
| `undefined_variable` | 52 | 8 | 44 | 0 | 52 |
| `wrong_argument_count` | 2 | 1 | 1 | 0 | 2 |

Honest caveat: PseudoPy's undefined-variable check is **advisory only**.
It catches 8/52 injected undefined variables; the other 44 become runtime
`NameError`s in the generated Python. The taxonomy records these as
silent failures, so the weakness is visible in the headline number
rather than hidden inside an aggregate.

## Reference correctness and runtime

- Every reference program prints a deterministic value and reads no
  stdin.
- All rows were executed under one CPython (`metadata.runtime`). The
  comparison never mixes runtimes.
- `metadata.schemaVersion` = 2, `metadata.metricsVersion` = 2.0.0.

## Known threat: baseline strength

B2 was written by the same project. It is deliberately broad, and on the
holdout set it is slightly *more* correct than PseudoPy (96.7% vs 86.7%,
one PseudoPy win vs four B2 wins, McNemar p = 0.375). That result is
reported as measured; it means the well-formed-input correctness
advantage is not established by this dataset.
