# PseudoPy language and verification

Student translation, instructor code generation, live validation and the admin inspector use the shared `PseudocodeCompiler`. Translation does not substitute sample programs or automatically repair missing block closures.

## Supported statements

- `BEGIN … END` surrounds a program. Numbered input lines are accepted. No statements may follow the final `END`.
- `DECLARE name AS INTEGER | FLOAT | REAL | STRING | CHAR | CHARACTER | BOOLEAN | BOOL | ARRAY` initializes a variable. `SET name TO expression`, `SET name = expression`, and `name = expression` assign values. `←`, `<-`, and `:=` are accepted assignment spellings.
- `SET array[index] TO expression` and `array[index] = expression` update an element, including nested index expressions.
- `DISPLAY`, `PRINT` and `OUTPUT` evaluate Python expressions. Use commas for separate output arguments: `DISPLAY "Total:", total`. String-plus-number is a Python type error; explicitly convert with `str(total)` when concatenating.
- `INPUT name` / `READ name` reads text unless the variable was declared `INTEGER`, `FLOAT` or `REAL`, in which case it uses the corresponding numeric conversion. `INPUT WITH PROMPT "Prompt" name` accepts a prompt.
- `IF expression THEN … [ELSE IF expression THEN …] [ELSE …] END IF`, `ENDIF`.
- `WHILE expression DO … END WHILE`, `ENDWHILE`.
- `FOR name FROM start TO stop [STEP step] DO … END FOR`, `ENDFOR`: both endpoints are inclusive; the default step is 1. Negative steps count down. Bounds and step must be integers; step must not be zero. Bounds and step evaluate once. Incorrect runtime types raise an error rather than being silently truncated.
- `FOR EACH name IN expression DO … END FOR` iterates over a Python iterable.
- `FUNCTION name(parameters) … END FUNCTION` and `PROCEDURE … END PROCEDURE`. Parameters are unique names separated by commas. `RETURN [expression]` is valid only inside a function/procedure. `CALL name(arguments)` passes individual arguments; functions may also occur in expressions. Recursion is supported by the generated Python.
- `INCREMENT name`, `DECREMENT name`, and `APPEND expression TO array`.

Structured `IF`, `FOR` and `WHILE` statements require their sentinels. Natural-language mapping retains its explicit phrase aliases, such as `show`, `start`, and `loop from`, but does not add missing sentinels to structured statements. Strings and `#` comments are protected from phrase substitution.

## Operators and expression AST

The precedence parser constructs literal, identifier, binary, unary, comparison-chain, group, list, tuple, call, attribute, index and slice nodes. Source tokens remain attached for diagnostics. The admin AST inspector renders the nested expression nodes.

| Category | Syntax / meaning |
| --- | --- |
| Arithmetic | `+`, `-`, `*`, `/`, `//`, `%`, `**` |
| Word aliases | `DIV` → `//`; `MOD` → `%` |
| Bitwise | `&`, `|`, `^` (XOR), `~`, `<<`, `>>` |
| Comparisons | `==`, `!=`, `<`, `<=`, `>`, `>=`; expression `=` → `==`; `<>` → `!=` |
| Boolean | `AND`, `OR`, `NOT` (case insensitive); preserves Python short-circuit and operand-return behavior |
| Membership / identity | `IN`, `NOT IN`, `IS`, `IS NOT` |
| Constants | `TRUE`, `FALSE`, `NULL` / `NONE` |
| Unicode aliases | `≥`, `≤`, `≠`, `≡`, `×`, `✕`, `⋅`, `÷`, and common Unicode minus signs |
| Comments | `#` anywhere outside strings; `//` only as the first token on a line. In an expression, `//` is floor division. |

Precedence follows the [Python expression reference](https://docs.python.org/3/reference/expressions.html#operator-precedence). Exponentiation is right-associative: `2 ** 3 ** 2` is 512. `-2 ** 2` is -4. Negative division and remainder follow Python (`-7 // 3` is -3; `-7 % 3` is 2). Comparisons retain chaining rather than becoming Boolean-valued binary operations. Approximate equality `≈` is rejected rather than silently treated as exact equality.

This is a documented pseudocode subset, not a complete Python parser. Dictionary/set literals, comprehensions, imports, classes, exception statements, augmented assignments and assignment expressions are not supported. Unsupported syntax reports an error. The retained `IS A NUMBER` / `IS NUMERIC` predicate tests a decimal string using the legacy digit check; it is not Python's complete numeric-literal grammar. `_pseudopy_` names are reserved for generated helpers.

## Validation limits

Syntax failures stop generation and include source line numbers. Semantic checks provide advisory undefined-variable diagnostics and isolate function-local names. They are not complete static typing or control-flow proof. Runtime errors, user-defined function behavior, data-dependent loops and termination must still be checked during execution.

The complexity display is a loop-nesting heuristic, not an asymptotic-complexity proof. It assumes each counted loop scales linearly and does not model bounds, recursion, function calls or logarithmic iteration. Nesting is not used to penalize the quality score.

## Reproducible verification

Run `npm test` with Node.js 20+ and Python 3 (`python3` on PATH, or set `PYTHON`). No third-party test dependencies are required.

The suite checks operator results against CPython, malformed input rejection, nested AST shape, function scope, typed input, and student/instructor consistency. It executes all 30 built-in exercises from `database.js` against their reference Python and covers factorial, Fibonacci, Euclidean GCD, linear/binary search, bubble/insertion/selection sort, and recursion. The 10,000-record `dataset.json` corpus was not retrieved or independently verified in this change.

Navigation behavior is tested using a DOM test harness for each role at 320, 768, 1023, 1024 and 1440 pixels, including Escape, focus trapping and resize cleanup. These are behavioral tests, not rendered browser screenshots. Browser layout, actual Skulpt execution, live authentication/database operations and PWA cache migration still require an integrated browser check before merging.

The existing `node verify_app_refactor.js` suite passes 32 instructor-isolation and data checks. The existing `test_instructor_password_admin_approval.js` fails during setup with `ReferenceError: Node is not defined`, reproduced against the unchanged base `app.js`; its DOM harness needs a separate repair.
