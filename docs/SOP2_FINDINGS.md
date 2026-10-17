# SOP 2 — Rebuild findings, threats and owner actions

Companion to `docs/SOP2_BASELINE_METHOD.md`, `docs/SOP2_DATASET_AUDIT.md`
and the regenerated `sop2-comparison-results.md`. Everything here is
measured, not estimated; see those files for method and provenance.

Branch: `sop2-measurement-v2` (four commits: measurement engine, panel
UI, docs/thesis, module tests).

## What changed and why

The original comparison scored **line-text similarity** and presented it
as code-generation correctness, and compared PseudoPy against **literature
midpoints** rather than a tested baseline. The rebuild replaces both with
something falsifiable and reports results exactly as measured.

- 2a is now **stdout equality** against the reference program, executed
  in the same runtime for every translator.
- Two independently written baselines: **B1** naive keyword
  substitution, **B2** reasonable rule-based (no validation).
- 2b adds an **error taxonomy** and an **error-injection** experiment.
- 2c times **translation only** (warm-ups + 200 iterations, median/IQR).
- Results are grouped (seed / holdout / injected) and **never blended**;
  Wilson CI, exact McNemar and Wilcoxon are reported per group.
- JSON/CSV/Markdown come from one shared module (`src/research/report.js`)
  that the browser panel also uses, so the panel and the files cannot
  disagree.

## Measured results (2026-10-17 full run, 253 cases)

2a — functional correctness (stdout equality):

| Group | Cases | PseudoPy | B1 | B2 |
| --- | ---: | ---: | ---: | ---: |
| seed | 30 | 100.0% | 60.0% | 100.0% |
| holdout | 30 | 86.7% | 70.0% | 96.7% |
| injected | 193 | 0.0% | 1.6% | 3.1% |

2b — error detection on the 193 deliberately broken variants:

- PseudoPy rejected 148 (76.7%), with **45 silent failures**.
- By type: `keyword_typo` 59/59, `return_outside_function` 60/60,
  `missing_end_if` 20/20 rejected; `wrong_argument_count` 1/2;
  `undefined_variable` only 8/52 rejected → **44 silent runtime errors**.
- B1 silent failures 190/193; B2 186/193.

2c — translation-only time (median ms per case):

| Group | PseudoPy | B1 | B2 |
| --- | ---: | ---: | ---: |
| seed | 0.646 | 0.016 | 0.052 |
| holdout | 0.512 | 0.017 | 0.057 |

### Headline (honest)

- Against **naive** substitution, PseudoPy is clearly ahead on the seed
  set (100% vs 60%) and ahead but **not significantly** on the holdout
  set (86.7% vs 70.0%, exact McNemar p = 0.267).
- Against the stronger **B2** baseline, PseudoPy shows **no correctness
  advantage** (holdout 86.7% vs 96.7%, p = 0.375 in B2's favour; both
  100% on seed). The "validation improves correctness" thesis is **not
  supported by this dataset** against a reasonable rule-based translator.
- PseudoPy is the **slowest** of the three translators, because it
  performs mapping and validation before generation.
- Error detection is strong for structural errors and **weak for
  undeclared variables** (`undefined_variable`: 44/52 silent failures).

## Conflicting thesis sentences and what happened to them

Line numbers refer to `PseudoPyCSC10.md` **before** this revision.

| Line(s) | Original claim | Status |
| --- | --- | --- |
| 1739 | "this study did not involve building or testing a separate baseline system" | **Reworded** — a tested baseline was added; literature kept as context. |
| 1756 | 54.9% F1 presented as "code generation correctness" | **Contextualised** — F1 is text similarity, not correctness; measured separately. |
| 1772–1774 | "18.1% higher" correctness vs literature midpoint | **Reworded** — literature-context only; no advantage over B2. |
| 1789, 1802, 1807, 1809 | "0% error rate … 100% reduction" | **Reworded** — self-selected dataset; injected results reported. |
| 1824 | "1,600 to 4,667 times faster than cloud-based approaches" | **Reworded** — comparison was vs cloud latency; PseudoPy is slower than both local baselines. |
| 1828 | "18.1% correctness improvement, 100% error rate reduction, and substantially faster generation time" | **Reworded** — replaced with the measured advantages and the two limitations. |
| 1841, 1843 (Table 7) | "±18.1% higher", "±1,600–4,667x faster" | **Retained as literature context**, note added under the table (1849). |
| 2933 | conclusion repeats 18.1% / 100% / faster | **Reworded** — qualified with the tested-baseline result. |
| 3002 | "no recorded syntax or runtime errors … and fast generation time" | **Retained, non-comparative** — true of the self-selected seed set only. |
| 2946, 3015 | "0.17 ms … completed rapidly / operates efficiently" | **Retained, absolute-only** — not a comparison; local baselines are faster. |
| 1988–1998 | Metrics-engine table: 0% runtime error rate, 0.17 ms | **Retained** — self-referential metrics-engine output; unchanged. |

Unedited-but-related: the abstract/objective statements that repeat
"improved code-generation correctness" depend on the objective-2 section
and should be re-read after this revision; they were left untouched to
avoid over-reaching edits.

## Threats to validity

- **Seed is not a test set.** The 30 seed exercises were available while
  the compiler was designed; only the 30 holdout cases are independent.
- **B2 is ours.** It is the strongest rule-based translator we could
  write and it is reported everywhere; its holdout win is the most
  important caveat in this report.
- **Runtime mismatch.** Tests compare under CPython; the product runs
  Skulpt. Rates are within-runtime comparisons.
- **Harness screenshots** are a panel render in headless Chrome with a
  reduced dataset (6 seed + 4 holdout), not a signed-in app session.
- **Timing is machine-specific** and measured on this workstation.
- **Known product false positives.** Four holdout cases are rejected
  because PseudoPy cannot assign an array element to a `DECLARE`d numeric
  variable (`docs/SOP2_DATASET_AUDIT.md`). They are counted against
  PseudoPy in every rate above.

## Owner actions

1. **Decide the objective-2 framing.** Against B2 the correctness claim
   does not hold. Either state it as "better than naive substitution,
   comparable to a good rule-based translator", or scope it to error
   detection, or drop the comparative claim.
2. **Fix the array-element false positive** (`DECLARE x AS INTEGER` then
   `x = arr[i]`), or document it as a known limitation in
   `docs/compiler-language.md`.
3. **Make the undefined-variable check blocking**, or label it advisory
   in the UI; it currently allows 44/52 silent runtime failures.
4. **Separate text-similarity F1 from functional correctness** throughout
   the thesis (they are different measures of different things).
5. **Re-run and archive** `npm run sop2` on the target machine; timings
   are machine-specific. Set `PYTHON` if `python3` is not on PATH.
6. **Approve the reworded thesis passages** (section 2.0 and the four
   reworded claims) before the document is finalised.

## Screenshots

`docs/sop2-screenshots/` — empty / single / benchmark panels at 375 px
and 1440 px, light and dark (12 images). Each is a labelled harness
render (real panel markup, `style.css`, Skulpt and the browser modules in
headless Chrome, no sign-in), not an application screenshot.
