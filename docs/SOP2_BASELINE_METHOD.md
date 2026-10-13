# SOP 2 Baseline Method

## Baseline translator
- Independent direct rule-based mapper (src/research/baseline-translator.js)
- Does not call PseudocodeCompiler/parser/semantic analyzer/symbol table/CFG
- Minimal indentation, simple mappings for supported constructs
- Declared limitations (e.g. operators such as MOD/AND are not rewritten to Python)

## Comparison
- Same raw input to both translators
- VM-loaded compiler for PseudoPy (loaded once, outside the timed region)
- Translation-request-to-generated-Python timing only: bundle load, VM
  creation and syntax/runtime validation are excluded from generation time
- Text metrics: frequency-based line matching (precision/recall/F1).
  Precision = matched / generated lines, recall = matched / expected lines
  (src/research/line-metrics.js is the single source of truth)
- Both translators are validated and executed through the **same** runtime:
  CPython in the Node harness (syntax via `ast.parse`, then execution), Skulpt
  in the DevTools panel

## Dataset
- Primary: 30 built-in seed exercises from database.js
- Reference Python from python_code/solution

## Exports
- sop2-comparison-results.json
- sop2-comparison-results.csv
- Regenerate with: `npm run sop2`

