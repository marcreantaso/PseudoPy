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
  unicodeNormalizations: Object.freeze({
    "\u2265": ">=",
    "\u2264": "<=",
    "\u2260": "!=",
    "\u2261": "==",
    "\u00D7": "*",
    "\u2715": "*",
    "\u22C5": "*",
    "\u00F7": "/",
    "\u2011": "-",
    "\u2212": "-",
    "\u2013": "-",
    "\u2014": "-",
    "\u2190": "=",
    "\u2254": "=",
    "\u2192": "->"
  }),
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
if (typeof module !== "undefined" && module.exports) { module.exports = { LANGUAGE_SPEC }; }
if (typeof window !== "undefined") { window.LANGUAGE_SPEC = LANGUAGE_SPEC; }
