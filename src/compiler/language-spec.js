// ── Unicode → Python operator SYMBOL_MAP (single source of truth) ──
// One table for the whole system: the lexer applies it to code outside string
// literals, the research normalizer applies it to whole sources, and the
// formatter consults it for output-text conversion. A regression test fails
// if a second copy of this mapping ever appears in another file.
// Word-valued targets (AND/OR/NOT) are emitted as keyword tokens by the lexer.
const SYMBOL_MAP = Object.freeze({
  "\u2265": ">=",  // ≥  GREATER-THAN OR EQUAL TO
  "\u2A7E": ">=",  // ⩾  SLANTED GREATER-THAN OR EQUAL TO
  "\u2264": "<=",  // ≤  LESS-THAN OR EQUAL TO
  "\u2A7D": "<=",  // ⩽  SLANTED LESS-THAN OR EQUAL TO
  "\u2260": "!=",  // ≠  NOT EQUAL TO
  "\u2261": "==",  // ≡  IDENTICAL TO
  "\u00D7": "*",   // ×  MULTIPLICATION SIGN
  "\u2715": "*",   // ✕  MULTIPLICATION X
  "\u22C5": "*",   // ⋅  DOT OPERATOR (scalar multiply)
  "\u00F7": "/",   // ÷  DIVISION SIGN
  "\u2215": "/",   // ∕  DIVISION SLASH
  "\u2011": "-",   // ‑  NON-BREAKING HYPHEN
  "\u2212": "-",   // −  MINUS SIGN
  "\u2013": "-",   // –  EN DASH (often typed as minus)
  "\u2014": "-",   // —  EM DASH
  "\u2190": "=",   // ←  LEFTWARDS ARROW (assignment)
  "\u2254": "=",   // ≔  COLON EQUALS (assignment)
  "\u2192": "->",  // →  RIGHTWARDS ARROW
  "\u2227": "AND", // ∧  LOGICAL AND
  "\u2228": "OR",  // ∨  LOGICAL OR
  "\u00AC": "NOT"  // ¬  NOT
});

// Math symbols with no direct Python operator equivalent. The lexer explains
// them with a friendly hint instead of a generic "unsupported character".
const UNICODE_HINTS = Object.freeze({
  "\u221A": { name: "square root", help: "There is no square-root operator; compute it as exponentiation, e.g. x ^ 0.5." },
  "\u03C0": { name: "pi", help: "Pi has no literal form; use a numeric value such as 3.14159." },
  "\u00B1": { name: "plus-minus", help: "Write the intended operation explicitly, e.g. + or -." },
  "\u2248": { name: "approximately equal", help: "Use == for an exact comparison, or a tolerance such as ABS(a - b) < 0.001." }
});

const LANGUAGE_SPEC = Object.freeze({
  name: "PseudoPy",
  description: "Pseudocode subset accepted by the current PseudoPy pipeline.",
  program: { syntax: "BEGIN ... END", required: true, notes: "Code after the final END is rejected." },
  lineHandling: { leadingNumbersStripped: true, spacesTabsSkipped: true, newlines: "preserve-as-tokens" },
  keywordsCaseInsensitive: true,
  comments: { hashOutsideStrings: true, doubleSlash: "before-token only (floor-division inside expressions)", notes: "Strings are protected from hash stripping." },
  types: Object.freeze(["INTEGER", "FLOAT", "REAL", "STRING", "CHAR", "CHARACTER", "BOOLEAN", "BOOL", "ARRAY"]),
  operators: Object.freeze([
    "+ - * / DIV MOD ^ ~ << >> & | ** //",
    "== != <> = > < >= <= IS NOT IN AND OR NOT"
  ]),
  unicodeNormalizations: SYMBOL_MAP,
  unicodeHints: UNICODE_HINTS,
  declarations: { forms: ["DECLARE name AS TYPE"] },
  assignment: { forms: [
    "SET name TO expression",
    "SET name = expression",
    "name = expression",
    "SET name[index...] TO expression",
    "name[index...] = expression"
  ] },
  io: {
    input: ["INPUT name", "READ name", "INPUT WITH PROMPT name"],
    output: ["DISPLAY expression", "PRINT expression", "OUTPUT expression"]
  },
  selection: { forms: ["IF condition THEN ... [ELSE IF condition THEN ...] [ELSE ...] END IF"] },
  loops: {
    while: ["WHILE condition DO ... END WHILE"],
    for: ["FOR name FROM start TO stop [STEP step] DO ... END FOR"],
    forEach: ["FOR EACH name IN expression DO ... END FOR EACH"]
  },
  functions: {
    forms: [
      "FUNCTION name([param[, param...]]) ... [RETURN expression] END FUNCTION",
      "PROCEDURE name([param[, param...]]) ... [RETURN [expression]] END PROCEDURE",
      "CALL name([arg[, arg...]])",
      "CALL name arg[, arg...]",
      "name(arg[, arg...])"
    ],
    notes: "Recursive calls are supported; arity/signature checks are incomplete."
  },
  arrays: { supported: true, notes: "Indexing supported; slices/indexing chains are subset of expression grammar." },
  expressionHighlights: Object.freeze(["lists/tuples", "membership/identity", "chained comparisons", "Boolean short-circuit"]),
  unsupported: Object.freeze(["dictionaries/sets/comprehensions", "keyword arguments/lambdas", "augmented assignment", "exceptions/imports", "arbitrary field access in all cases"]),
  limitations: Object.freeze([
    "Input conversion retries depend on declared type",
    "Function signature validation incomplete",
    "Expression column mapping not preserved to original source",
    "Runtime behavior limited to Skulpt environment"
  ])
});
if (typeof module !== "undefined" && module.exports) { module.exports = { LANGUAGE_SPEC, SYMBOL_MAP, UNICODE_HINTS }; }
if (typeof window !== "undefined") { window.LANGUAGE_SPEC = LANGUAGE_SPEC; window.SYMBOL_MAP = SYMBOL_MAP; window.UNICODE_HINTS = UNICODE_HINTS; }
