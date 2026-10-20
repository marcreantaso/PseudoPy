# Response to Panel Comment — Mapping & Validation Execution

**Panelist:** Dr. Angelica Aquino

> "Mapping & Validation execution: Show the input, the validation checks, the
> generated Python, its actual execution output, and what happens when invalid
> syntax is submitted."

This document explains how PseudoPy's **mapping model** and **evaluation model**
answer this comment, and where each of the five requested demonstrations lives
in the system.

---

## 1. The two models

### Mapping model — how pseudocode becomes Python

The mapping model is the compiler front end. It is deterministic, inspectable,
and every stage records structured events (stage, line, column, status) that the
Developer Options › Simulation panel displays live:

| # | Stage | Implementation | What it maps |
|---|-------|----------------|--------------|
| 1 | Preprocessing & NLP/keyword mapping | `mapper.js` | English phrases to operators (e.g. `IS GREATER THAN OR EQUAL TO` → `>=`); string literals and comments are protected |
| 2 | Unicode operator normalization | `src/compiler/lexer.js` | `≥ ≤ ≠ ≡ × ÷ − ←` and variants to strict Python ASCII operators |
| 3 | Lexical analysis | `src/compiler/lexer.js` | Characters → typed tokens with real 1-based line/column positions |
| 4 | Syntax analysis (CFG parsing) | `src/compiler/parser.js` | Tokens → abstract syntax tree; block-stack validation; sentinel suggestions for unclosed blocks |
| 5 | Semantic analysis | `src/compiler/semantic-analyzer.js` | Symbol table, strict typing for declared variables, invalid-operand checks |
| 6 | Code generation (SDT) | `src/compiler/code-generator.js` | AST → Python, with a source map pairing every Python line to its pseudocode statement |

### Evaluation model — how a submission is judged

The evaluation model wraps the mapping model with layered, structured checks:

1. **Static validation** (`src/app/validation.js`) — every diagnostic carries a
   category, severity and line number; the compiler never auto-repairs code.
2. **Execution** (`src/app/execution.js`) — the generated Python runs in the
   vendored Skulpt runtime *entirely in the browser* under a 15-second
   wall-clock budget; the console transcript is the real standard output.
3. **Grading** (`src/app/exercises.js`) — real stdout is compared against the
   exercise's expected output; failures are classified through an error
   taxonomy (rejected → syntax → runtime → wrong output → silent failure).
4. **Research stress-testing** (SOP2 tooling, `src/research/error-injection.js`)
   — deliberately injects invalid programs and measures how each translator
   handles them.

---

## 2. Traceability: the five requested demonstrations

| Dr. Aquino asks for | Where it is shown in PseudoPy | Verified by |
|---|---|---|
| **The input** | The source editor plus the *NLP Mapping* panel, which shows the mapped tokens against the original input as a real diff | `NLP diff reports no change for identical sources`; `NLP diff marks inserted and deleted tokens and affected lines` |
| **The validation checks** | The *Event Ledger* with per-stage RUNNING/ERROR status chips and stage/status/type filters; the Validation results with category, severity and line | `validation classifies syntax errors with category, severity and line`; `every normalized status is in the #sim-ledger-status filter vocabulary` |
| **The generated Python** | The Python output panel, and the *CFG → AST → SDT* walkthrough that pairs each AST node with its real emitted Python | `SDT rows pair each AST node with its real generated Python`; `the walkthrough renders three synchronized columns from a real compile` |
| **Its actual execution output** | The Console Output produced by running the generated Python in the vendored Skulpt runtime (no server, no network), plus the Grade Verdict comparing real stdout to the expected output | `client compiler and vendored Skulpt translate and run with no network APIs`; `grade verdict compares real stdout to the expected output` |
| **What happens when invalid syntax is submitted** | The failing stage stops with a line/column diagnostic and a suggested correction; the Event Ledger still shows the real trace up to the failure; the system never claims success for a failed compile; the SOP2 panel can submit invalid programs on demand | `compiler never auto-repairs (regression)`; `a failed compile still yields real ledger rows and no success claim`; `walk steps still show recognition up to the point a program fails` |

All automated tests named above are part of the project's regression suite
(`npm test`); re-run it before citing the current test count.

---

## 3. The invalid-syntax path in detail

When a student submits invalid syntax, four things happen — none of them silent:

1. **Rejection at the exact stage.** The lexer or parser rejects the token or
   statement and reports its position, e.g.
   `Line 3, Column 5: Expected keyword THEN after the IF condition.`
   Unclosed blocks are detected by the block stack and deduplicated into a
   single, human-readable diagnostic.
2. **A suggested correction.** Parser diagnostics carry a `suggestion` field
   (e.g. missing `THEN`, missing `DO`, wrong closing keyword, unclosed `END`).
   Reviewed quick fixes are offered in the editor — but the compiler itself
   **never modifies the student's code automatically** (regression-tested).
3. **An honest run result.** If compilation fails, the Run action reports the
   compile error instead of executing stale code, and the Event Ledger still
   contains the real events up to the failing stage — the panel never shows a
   success state for a failed compile.
4. **Research visibility.** The SOP2 research tab injects invalid programs
   (keyword typos, missing `END IF`, wrong operators) into a 30-case holdout
   set and classifies every outcome through the error taxonomy, so the
   behaviour under invalid input is not only demonstrated but *measured*.

---

## 4. Suggested reply to the panel

> Mapping & Validation execution is demonstrated live in Developer Options ›
> Simulation. For any submitted program the system shows: (1) the input
> pseudocode; (2) the validation checks as an event ledger with per-stage
> status from preprocessing through execution; (3) the generated Python, paired
> statement-by-statement with the abstract syntax tree; (4) the actual
> execution output produced by the vendored Skulpt runtime running entirely in
> the browser; and (5) the invalid-syntax path — a program with invalid syntax
> is rejected at the exact compiler stage with line/column diagnostics and a
> suggested correction, and the system never reports success for a failed
> compile. Each element is verified by automated regression tests, listed in
> docs/PANEL_COMPLIANCE.md.

---

## 5. Known gaps (honest status)

- **Partial**: there is no single one-click demonstration that walks the five
  items in order — an evaluator clicks through NLP Mapping → Event Ledger →
  SDT → Run. A live compiler-generated worked example (planned compliance
  work) would make this one action.
- Stage labels currently differ between surfaces (pipeline strip vs.
  simulation stages); normalizing them is part of the same compliance work.
