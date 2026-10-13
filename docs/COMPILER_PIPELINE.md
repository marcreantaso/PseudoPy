# Compiler Pipeline

Raw Input -> Normalize -> Lexer -> Parser/CFG -> AST -> Stack Validation -> Semantic Analysis -> Symbol Table -> SDT -> Python -> Skulpt -> Metrics

Traces: compiler trace (opt-in), simulation envelope (opt-in). Execution trace shown is static AST walkthrough when no runtime instrumentation is active.

Developer Options -> "CFG → AST → SDT" tab: one program shown as three synchronized columns — the matched grammar production (CFG), the recognized AST node, and the Python line(s) emitted for that node (SDT). Steps are derived from the real AST and the opt-in simulation source map, so the three stages advance together (`_buildWalkSteps` / `_renderSimWalk` in `src/devtools/simulation.js`). No compiler logic is duplicated and no production is invented.
