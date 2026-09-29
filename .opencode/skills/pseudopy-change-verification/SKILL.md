---
name: pseudopy-change-verification
description: Use when fixing PseudoPy application or compiler behavior, changing bundled browser sources, or selecting build and regression checks. Covers source routing, runtime boundaries, and test prerequisites.
---

# PseudoPy change verification

## Locate the actual implementation
1. Read root `AGENTS.md` for source/build constraints. Resolve a bundled feature through `src/bundles.json`, not by editing the generated root file.
2. For language behavior, trace `mapper.js` into `src/compiler/compiler.js`: preprocessing/mapping, lexer, parser, semantic analysis, then code generation. Read `docs/compiler-language.md` for the intended contract.
3. For browser execution, inspect all affected callers: `src/app/execution.js`, `src/app/exercises.js` (reference output), and `src/devtools/pipeline-controls.js`. Shared loading/budget policy lives in `src/app/on-demand.js`.
4. For persistence, determine whether the issue is in browser `src/database/` or the separate Express/serverless store before changing database code. Use `docs/OFFLINE.md` for the browser queue and reachability model.

## Reproduce at the right boundary
- Compiler integration tests load `mapper.js` before generated `compiler.js` in a VM; requiring the compiler alone omits natural-language mapping. Follow `tests/compiler.test.js` for integration setup.
- Pseudocode spaces/tabs are skipped by the lexer, but newlines are tokens; emitted Python indentation follows AST nesting. Test nested blocks when changing editor indentation or code generation.
- For runtime budgets or console behavior, use the vendored runtime coverage in `tests/runtime-console-batching.test.js`; CPython success alone does not verify browser Skulpt behavior.
- DOM stubs do not establish browser layout, focus, or service-worker lifecycle correctness. Report which behavior was exercised in a real browser versus a harness.

## Verify the change
1. Rebuild with `npm run build` after bundled-source edits. This validates source and concatenated script syntax and regenerates the four outputs.
2. Run the relevant `node --test tests/<file>.test.js` tests. For a single named case, use `node --test --test-name-pattern="pattern" tests/<file>.test.js`.
3. Run `npm test` for the full gate. CI uses Node 22 and Python 3; `PYTHON` selects the compiler-test executable. If Python is unavailable, identify that blocker and report focused results separately rather than changing assertions to hide it.
4. When instructor/data compatibility is affected, run `node verify_app_refactor.js` as well. If the Node suite fails, the trailing operator smoke check is skipped by npm; it can be run independently with `node test_operator_translation.js`.
5. Check `git diff` for source/output consistency and `npm run build:check` for freshness. For PWA assets, verify cache versions and exact cached URLs in `sw.js`.

## Completion evidence
- Report the behavior fixed, exact checks run, and any unmet prerequisites. Do not reuse old suite counts as current evidence.
- Keep synthetic DOM timing results labelled as synthetic; validate fragment movement and row counts before interpreting performance numbers.
