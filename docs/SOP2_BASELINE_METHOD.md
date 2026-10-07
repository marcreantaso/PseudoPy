# SOP 2 Baseline Method

## Baseline translator
- Independent direct rule-based mapper (src/research/baseline-translator.js)
- Does not call PseudocodeCompiler/parser/semantic analyzer/symbol table/CFG
- Minimal indentation, simple mappings for supported constructs
- Declared limitations

## Comparison
- Same raw input to both translators
- VM-loaded compiler for PseudoPy
- Translation-request-to-generated-Python timing
- Text metrics: frequency-based line matching (precision/recall/F1)

## Dataset
- Primary: 30 built-in seed exercises from database.js
- Reference Python from python_code/solution

## Exports
- sop2-comparison-results.json
- sop2-comparison-results.csv
