# SOP 2 Baseline Method

How the "Traditional baseline vs PseudoPy" comparison is measured.
This document describes the *method*; for the numbers produced by the
last full run see `sop2-comparison-results.md` (regenerate with
`npm run sop2`).

The experiment exists to answer three questions honestly, and to stay
falsifiable:

- **2a — Functional correctness.** Do the generated programs *run* and
  print what the reference program prints?
- **2b — Error detection.** When the input is malformed, is the failure
  *caught and reported*, or does it fail silently?
- **2c — Translation time.** How long does raw text → Python take, and
  what does validation cost?

The rule for the whole experiment: **nothing is tuned to favour
PseudoPy.** Unfavourable results are reported as measured.

## Translations compared

Every case is fed to the *same* raw input text and translated by:

| Key | Translator | What it is |
| --- | --- | --- |
| `pseudopy` | `PseudocodeCompiler` | The real product: lexer, parser, symbol table, semantic checks, code generation. |
| `baseline` (B1) | `baselineTranslateRaw` | Naive line-by-line keyword substitution. No parser, no validation, no operator rewriting (e.g. `MOD`, `AND` are emitted unchanged and fail in Python). |
| `baselineB2` (B2) | `baselineTranslateRawB2` | A *reasonable* rule-based translator: handles more of the documented surface (operators, sentinels, `FOR ... DO`, `CASE`, functions) but still has no CFG/AST and performs **no** semantic validation. |

B2 exists so the comparison is not a straw man: it is the strongest
purely rule-based translator we could write in a comparable amount of
effort, and it is reported alongside B1 everywhere.

Both baselines live in `src/research/baseline-translator.js` and never
call the PseudoPy parser, symbol table, semantic analyser or code
generator.

## 2a — Functional correctness

A translation is **correct** only when:

1. the generated Python parses, **and**
2. it runs to completion in the shared runtime, **and**
3. its `stdout` equals the reference program's `stdout` after
   normalisation (CRLF → LF, trailing spaces stripped, leading/trailing
   blank lines removed).

`stdout` equality is the measure. Nothing inspects the generated source
to decide correctness.

Text similarity (frequency-based line precision/recall/F1,
`src/research/line-metrics.js`) is still reported, but **demoted**: it is
context only and is never the correctness score. It is reported twice —
`raw` and `normalized` — where the normalised form removes comments,
blank lines, indentation-only differences and compiler-generated
`# DECLARE …` / default-initialiser pairs so a translator is not
penalised for harmless structural lines.

Runtime parity: the Node harness runs both translators' output through
**CPython** (`src/research/python-runtime.js`, syntax via `ast.parse`
then execution). The DevTools panel runs both through **Skulpt**. The
comparison is always within one runtime, never across two.

## 2b — Error taxonomy

Every (case, translator) pair gets exactly one class:

| Class | Meaning |
| --- | --- |
| `correct` | ran and matched the reference output |
| `rejected` | translation declined before emitting Python, with a message (only PseudoPy does this) |
| `syntax_error` | generated Python did not compile |
| `runtime_error` | generated Python raised when run |
| `wrong_output` | ran, printed something different |
| `unverified` | runtime unavailable — excluded from rate denominators, never counted as success |

A **silent failure** is a `syntax_error`, `runtime_error` or
`wrong_output` that the translator did **not** warn about. This is the
quantity a validation mechanism is supposed to move, so it is reported
separately from raw error counts. `rejected` is not a silent failure —
the failure was announced.

## 2c — Translation time

Generation time is measured around **translation only**: raw text →
Python. Bundle loading, VM creation and syntax/runtime execution are
outside the timer and reported separately as one-time setup cost.

Because browser clocks are coarse, a single measurement is meaningless.
Each non-injected case is warmed up (`warmup` iterations) and then run in
a batch (`iters` iterations, 200 in the full Node run), and the batch is
divided by the iteration count. Across cases the report uses the
**median and IQR**, never the mean of single shots. Timing for injected
rows is a single-shot figure, flagged in the JSON, and is never used for
the 2c claim.

## Dataset groups

Results are **never blended across groups**:

- **seed** — the 30 built-in exercises in `database.js`. These were
  available while the compiler was designed, so this is the
  "did we build what we aimed at" set, not a generalisation test.
- **holdout** — 30 independently written cases
  (`src/research/holdout-cases.js`), varied in style and spelling. See
  `docs/SOP2_DATASET_AUDIT.md` for provenance and the audit result.
- **injected** — deliberately broken variants of the above (keyword
  typos, missing `END IF`, undefined variables, wrong argument counts,
  top-level `RETURN`). Injected cases carry the *base* program's
  reference output, so a translator that happens to emit runnable code
  can only score `correct` by coincidence; the point of this group is
  2b, not 2a. Inapplicable variants are counted and reported, not hidden.

## Statistics

Computed by `src/research/stats.js`, per group, never blended:

- Wilson score 95% interval for each translator's correctness.
- Exact (binomial) two-sided **McNemar** test for paired PseudoPy vs B1 /
  vs B2 correctness, on the discordant cases.
- Wilcoxon signed-rank test on per-case translation-time differences
  (exact for small n, normal approximation beyond).
- Median / IQR for timing.

## Outputs

- `sop2-comparison-results.json` — full document (metadata, dataset
  composition, per-group summaries, statistics, every case row).
- `sop2-comparison-results.csv` — one row per case, legacy columns first.
- `sop2-comparison-results.md` — human-readable report with the verdict.
- Regenerate with `npm run sop2` (add `--quick` for a fast smoke run).

CSV/Markdown/JSON are produced by `src/research/report.js`, the single
implementation shared by the Node harness and the DevTools panel, so the
exported files and the on-screen panel cannot disagree.

## Threats to validity

- **Compiler-vs-compiler, not student-vs-student.** The dataset is
  curated; real beginner errors are broader than the five injected types.
- **The holdout set is still small (30)** and was written by the same
  project, so it is an independence check, not external validation.
- **B2 is the authors' own baseline.** It is reported in full so a reader
  can judge whether it is strong enough.
- **The harness runs under CPython for comparison tests but the shipped
  product executes Python in Skulpt.** Divergences between the two
  runtimes would affect absolute correctness rates.
- **Timing is machine-specific.** Only relative orderings and the
  presence/absence of overhead should be read from 2c.
- **PseudoPy validation is not uniformly strong.** See the injected
  `undefined_variable` results in the audit document: advisory checks do
  not prevent silent runtime failures.
