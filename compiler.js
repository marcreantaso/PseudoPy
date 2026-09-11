/* ============================================================
   Pseudocode-to-Python Compiler Engine
   ────────────────────────────────────────────────────────────
   4-Stage Syntax-Directed Translation (SDT) Pipeline:
     Stage 1 — Lexical Analysis  (Tokenizer)
     Stage 2 — Syntax Analysis   (Recursive Descent Parser → AST)
     Stage 3 — Semantic Analysis  (Symbol Table + Scope Validation)
     Stage 4 — Code Generation    (AST Tree-Walker → Python)

   Formal Grammar Model:  G = (V, Σ, R, S)
     V  = { Program, Statement, Block, Expression }
     Σ  = { BEGIN, END, IF, THEN, ELSE, WHILE, DO, FOR, SET, TO, ... }
     R  = Production rules enforced by the Parser
     S  = Program (must open with BEGIN, close with END)

   Theoretical Foundations:
     • Constructivism         — iterative error refinement
     • Cognitive Load Theory  — minimizes extraneous syntax burden
     • Levenshtein Distance   — fuzzy keyword suggestion on typos
     • Stack-Based Validation — LIFO block matching (IF↔END IF, etc.)
     • Linear Time O(N)       — single-pass tokenization + tree walk

   Constraint: Purely rule-based. No ML / black-box AI.
   ============================================================ */

// ── Token Type Constants ─────────────────────────────────────
const TOKEN_TYPES = {
    KEYWORD: 'KEYWORD',
    IDENTIFIER: 'IDENTIFIER',
    NUMBER: 'NUMBER',
    STRING: 'STRING',
    OPERATOR: 'OPERATOR',
    NEWLINE: 'NEWLINE',
    EOF: 'EOF'
};

// ══════════════════════════════════════════════════════════════
// COMPILER TRACE — Non-Invasive Event Instrumentation
// Emits timestamped events during compilation for the Admin
// Developer Options debugger. Does NOT alter compiler behavior.
// ══════════════════════════════════════════════════════════════
class CompilerTrace {
    constructor() {
        this.events = [];
        this.listeners = [];
        this.enabled = false;
    }

    enable()  { this.enabled = true; }
    disable() { this.enabled = false; }

    reset() {
        this.events = [];
    }

    emit(event) {
        if (!this.enabled) return;
        const entry = {
            ...event,
            timestamp: performance.now(),
            timeISO: new Date().toISOString()
        };
        this.events.push(entry);
        for (const fn of this.listeners) {
            try { fn(entry); } catch (e) { /* listener error — ignore */ }
        }
    }

    onEvent(fn) {
        this.listeners.push(fn);
        return () => { this.listeners = this.listeners.filter(l => l !== fn); };
    }

    getEvents() {
        return this.events.slice();
    }
}

// Global singleton — shared across compiler stages
const compilerTrace = new CompilerTrace();

// ── Terminal Symbols (Σ) ─────────────────────────────────────
const COMPILER_KEYWORDS = new Set([
    'BEGIN', 'END', 'DECLARE', 'AS',
    'INTEGER', 'STRING', 'ARRAY', 'BOOLEAN', 'FLOAT', 'REAL',
    'CHAR', 'CHARACTER', 'BOOL',
    'IF', 'THEN', 'ELSE', 'ENDIF',
    'FOR', 'FROM', 'TO', 'EACH', 'IN', 'DO', 'ENDFOR',
    'WHILE', 'ENDWHILE',
    'SET', 'DISPLAY', 'PRINT', 'OUTPUT', 'INPUT', 'READ',
    'AND', 'OR', 'NOT', 'MOD', 'DIV', 'STEP',
    'TRUE', 'FALSE', 'NULL', 'NONE',
    'IS',
    'FUNCTION', 'PROCEDURE', 'RETURN', 'CALL',
    'INCREMENT', 'DECREMENT', 'APPEND',
    'WITH', 'PROMPT'
]);

// ── Sentinel Keywords (required block terminators) ───────────
const SENTINEL_KEYWORDS = ['THEN', 'DO', 'BEGIN', 'END'];

// ── Preprocessing: Strip Leading Line Numbers ─────────────────
function preprocessPseudocode(code) {
    if (!code) return '';
    return code.split('\n').map(line => {
        // Strip leading line numbers: e.g. "1 BEGIN" -> "BEGIN", "2  PRINT" -> " PRINT"
        return line.replace(/^\s*\d+(?:[.:)]\s*|[ \t]+)(?=[A-Za-z_])/, '');
    }).join('\n');
}

// ══════════════════════════════════════════════════════════════
// UTILITY: Levenshtein Distance Algorithm
// Used by the Parser for intelligent sentinel/keyword suggestion
// ══════════════════════════════════════════════════════════════
function compilerLevenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = [];
    for (let i = 0; i <= n; i++) dp[i] = [i];
    for (let j = 0; j <= m; j++) dp[0][j] = j;
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            if (b[i - 1] === a[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(
                    dp[i - 1][j - 1] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j] + 1
                );
            }
        }
    }
    return dp[n][m];
}

function suggestSentinel(givenWord, candidates) {
    const upper = givenWord.toUpperCase();
    let best = null, bestDist = Infinity;
    for (const kw of candidates) {
        const d = compilerLevenshtein(upper, kw);
        if (d < bestDist && d <= 2 && d > 0) {
            bestDist = d;
            best = kw;
        }
    }
    return best;
}

// ══════════════════════════════════════════════════════════════
// STAGE 1: LEXICAL ANALYSIS (Tokenizer)
// Scans raw pseudocode input character-by-character in O(N).
// Produces a flat array of typed tokens for the Parser.
// ══════════════════════════════════════════════════════════════
class Lexer {
    constructor(input) {
        this.input = input;
        this.pos = 0;
        this.line = 1;
        this.tokens = [];
        this.errors = [];
    }

    // ── Unicode → ASCII Operator Normalization Map ──
    // Maps common Unicode mathematical symbols to strict Python-compatible ASCII.
    // Applied at the lexer level so the parser and code generator only ever see
    // standard operators, preventing SyntaxErrors in Skulpt at runtime.
    static UNICODE_OPERATOR_MAP = {
        '\u2265': '>=',   // ≥  GREATER-THAN OR EQUAL TO
        '\u2264': '<=',   // ≤  LESS-THAN OR EQUAL TO
        '\u2260': '!=',   // ≠  NOT EQUAL TO
        '\u2254': '=',    // ≔  COLON EQUALS (assignment)
        '\u00D7': '*',    // ×  MULTIPLICATION SIGN
        '\u2715': '*',    // ✕  MULTIPLICATION X
        '\u22C5': '*',    // ⋅  DOT OPERATOR (scalar multiply)
        '\u00F7': '/',    // ÷  DIVISION SIGN
        '\u2190': '=',    // ←  LEFTWARDS ARROW (assignment)
        '\u2192': '->',   // →  RIGHTWARDS ARROW
        '\u2261': '==',   // ≡  IDENTICAL TO
        '\u2011': '-',    // ‑  NON-BREAKING HYPHEN
        '\u2212': '-',    // −  MINUS SIGN
        '\u2013': '-',    // –  EN DASH (often typed as minus)
        '\u2014': '-',    // —  EM DASH
    };

    peek() {
        return this.pos < this.input.length ? this.input[this.pos] : null;
    }

    advance() {
        return this.input[this.pos++];
    }

    tokenize() {
        compilerTrace.emit({ type: 'LEXER_START', stage: 'LEXICAL_ANALYSIS', status: 'RUNNING', data: { inputLength: this.input.length } });
        while (this.pos < this.input.length) {
            const ch = this.peek();

            // ── Newlines ──
            if (ch === '\n') {
                this.tokens.push({ type: TOKEN_TYPES.NEWLINE, value: '\n', line: this.line });
                this.line++;
                this.advance();
                continue;
            }
            if (ch === '\r') { this.advance(); continue; }

            // ── Whitespace ──
            if (ch === ' ' || ch === '\t') { this.advance(); continue; }

            // ── Comments: // or # ──
            if (ch === '/' && this.input[this.pos + 1] === '/' &&
                (!this.tokens.length || this.tokens[this.tokens.length - 1].type === TOKEN_TYPES.NEWLINE)) {
                while (this.pos < this.input.length && this.input[this.pos] !== '\n') this.advance();
                continue;
            }
            if (ch === '#') {
                while (this.pos < this.input.length && this.input[this.pos] !== '\n') this.advance();
                continue;
            }

            // ── Identifiers / Keywords ──
            if (/[a-zA-Z_]/.test(ch)) {
                let word = '';
                const startLine = this.line;
                while (this.pos < this.input.length && /[a-zA-Z0-9_]/.test(this.input[this.pos])) {
                    word += this.advance();
                }
                const upper = word.toUpperCase();
                if (COMPILER_KEYWORDS.has(upper)) {
                    this.tokens.push({ type: TOKEN_TYPES.KEYWORD, value: upper, line: startLine });
                } else {
                    this.tokens.push({ type: TOKEN_TYPES.IDENTIFIER, value: word, line: startLine });
                }
                continue;
            }

            // Decimal/scientific literals; malformed numbers are rejected by expression parsing.
            if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(this.input[this.pos + 1] || ''))) {
                const match = this.input.slice(this.pos).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
                this.tokens.push({ type: TOKEN_TYPES.NUMBER, value: match[0], line: this.line });
                this.pos += match[0].length;
                continue;
            }

            // Preserve quotes and escapes exactly. Never rewrite the contents of a literal.
            if (ch === '"' || ch === "'") {
                const quote = this.advance();
                let value = quote;
                const startLine = this.line;
                let closed = false;
                while (this.pos < this.input.length && this.peek() !== '\n') {
                    const c = this.advance();
                    value += c;
                    if (c === quote) { closed = true; break; }
                    if (c === '\\' && this.pos < this.input.length && this.peek() !== '\n') value += this.advance();
                }
                if (!closed) this.errors.push({ line: startLine, message: 'Unterminated string literal.', suggestion: 'Close the string with a matching quote on the same line.' });
                this.tokens.push({ type: TOKEN_TYPES.STRING, value, line: startLine });
                continue;
            }

            // Longest match keeps **, // and shifts atomic.
            const pair = this.input.slice(this.pos, this.pos + 2);
            if (['**', '//', '<<', '>>', '==', '!=', '<=', '>=', '<>', ':=', '<-'].includes(pair)) {
                this.tokens.push({ type: TOKEN_TYPES.OPERATOR, value: [':=', '<-'].includes(pair) ? '=' : pair, line: this.line });
                this.pos += 2;
                continue;
            }
            if ('+-*/%,()[]:.<>=&|^~'.includes(ch)) {
                this.tokens.push({ type: TOKEN_TYPES.OPERATOR, value: this.advance(), line: this.line });
                continue;
            }

            // ── Unicode Operator Normalization ──
            // Intercept Unicode math symbols BEFORE the unknown-char fallthrough.
            // The normalized ASCII value is emitted so the parser/code generator
            // never encounters raw Unicode operators.
            if (Lexer.UNICODE_OPERATOR_MAP[ch]) {
                const normalized = Lexer.UNICODE_OPERATOR_MAP[ch];
                this.tokens.push({ type: TOKEN_TYPES.OPERATOR, value: normalized, line: this.line });
                this.advance();
                continue;
            }

            this.errors.push({ line: this.line, message: 'Unsupported character: ' + ch, suggestion: 'Use a supported Python operator; exponentiation is ** and XOR is ^.' });
            this.advance();
        }

        this.tokens.push({ type: TOKEN_TYPES.EOF, value: '', line: this.line });
        compilerTrace.emit({ type: 'LEXER_COMPLETE', stage: 'LEXICAL_ANALYSIS', status: this.errors.length ? 'ERROR' : 'SUCCESS', data: { tokenCount: this.tokens.length, tokens: this.tokens, errors: this.errors } });
        return this.tokens;
    }
}


// ══════════════════════════════════════════════════════════════
// STAGE 2: SYNTAX ANALYSIS (Recursive Descent Parser → AST)
//
// Enforces the Context-Free Grammar (CFG):
//   Program     → BEGIN StatementList END
//   Statement   → DeclareStmt | SetStmt | PrintStmt | InputStmt
//                | IfStmt | WhileStmt | ForStmt | ...
//   IfStmt      → IF Expression THEN Block [ELSE Block] END IF
//   WhileStmt   → WHILE Expression DO Block END WHILE
//   ForStmt     → FOR id FROM expr TO expr DO Block END FOR
//
// Uses a LIFO blockStack to validate nested block closures.
// Integrates Levenshtein for sentinel keyword suggestions.
// ══════════════════════════════════════════════════════════════
// Python-compatible expression AST. Binding powers follow the Python language reference:
// https://docs.python.org/3/reference/expressions.html#operator-precedence
class ExpressionParser {
    constructor(tokens) { this.tokens = tokens; this.pos = 0; }
    peek(offset = 0) { return this.tokens[this.pos + offset]?.value; }
    take(value) { if (this.peek() === value) { this.pos++; return true; } return false; }
    expect(value) { if (!this.take(value)) throw new Error('Expected ' + value + ' in expression.'); }
    parse() {
        if (!this.tokens.length) throw new Error('Expected an expression.');
        const items = [this.expression(0)];
        let tuple = false;
        while (this.take(',')) {
            tuple = true;
            if (this.pos === this.tokens.length) break;
            items.push(this.expression(0));
        }
        if (this.pos !== this.tokens.length) throw new Error('Unexpected token in expression: ' + this.peek());
        return tuple ? { type: 'TupleExpression', items } : items[0];
    }
    operator() {
        const raw = this.peek();
        const aliases = { '=': '==', '<>': '!=', MOD: '%', DIV: '//', AND: 'and', OR: 'or', IS: 'is', IN: 'in' };
        let op = aliases[raw] || raw, count = 1;
        if (raw === 'NOT' && this.peek(1) === 'IN') { op = 'not in'; count = 2; }
        if (raw === 'IS' && this.peek(1) === 'NOT') { op = 'is not'; count = 2; }
        const precedence = { or: 10, and: 20, '==': 40, '!=': 40, '<': 40, '<=': 40, '>': 40, '>=': 40,
            is: 40, 'is not': 40, in: 40, 'not in': 40, '|': 50, '^': 60, '&': 70, '<<': 80, '>>': 80,
            '+': 90, '-': 90, '*': 100, '/': 100, '//': 100, '%': 100, '**': 120 };
        return { op, count, power: precedence[op] };
    }
    expression(minPower) {
        const token = this.tokens[this.pos++];
        if (!token) throw new Error('Missing operand.');
        let left;
        if (['+', '-', '~', 'NOT'].includes(token.value)) {
            if (token.value === 'NOT' && minPower > 30) throw new Error('NOT requires parentheses in an arithmetic expression.');
            const op = token.value === 'NOT' ? 'not' : token.value;
            left = { type: 'UnaryExpression', operator: op, argument: this.expression(op === 'not' ? 30 : 110) };
        } else if (token.value === '(' || token.value === '[') {
            const close = token.value === '(' ? ')' : ']';
            const items = [];
            let tuple = false;
            if (!this.take(close)) {
                items.push(this.expression(0));
                while (this.take(',')) { tuple = true; if (this.peek() === close) break; items.push(this.expression(0)); }
                this.expect(close);
            }
            left = token.value === '[' ? { type: 'ListExpression', items } :
                { type: 'GroupExpression', expression: items.length === 1 && !tuple ? items[0] : { type: 'TupleExpression', items } };
        } else if (token.type === TOKEN_TYPES.NUMBER || token.type === TOKEN_TYPES.STRING) {
            if (token.type === TOKEN_TYPES.NUMBER && /^0\d+$/.test(token.value) && /[1-9]/.test(token.value)) throw new Error('Leading zeros are not allowed in decimal integers.');
            left = { type: 'Literal', value: token.value, kind: token.type };
        } else if (['TRUE', 'FALSE', 'NULL', 'NONE'].includes(token.value)) {
            left = { type: 'Literal', value: { TRUE: 'True', FALSE: 'False', NULL: 'None', NONE: 'None' }[token.value], kind: 'CONSTANT' };
        } else if (token.type === TOKEN_TYPES.IDENTIFIER || ['STRING', 'INTEGER', 'FLOAT', 'BOOL'].includes(token.value)) {
            const value = { STRING: 'str', INTEGER: 'int', FLOAT: 'float', BOOL: 'bool' }[token.value] || token.value;
            left = { type: 'Identifier', name: value };
        } else throw new Error('Expected operand, found ' + token.value + '.');

        while (this.pos < this.tokens.length) {
            if (this.peek() === '(' && 130 >= minPower) {
                this.pos++;
                const args = [];
                if (!this.take(')')) {
                    args.push(this.expression(0));
                    while (this.take(',')) { if (this.peek() === ')') break; args.push(this.expression(0)); }
                    this.expect(')');
                }
                left = { type: 'CallExpression', callee: left, arguments: args };
                continue;
            }
            if (this.peek() === '[' && 130 >= minPower) {
                this.pos++;
                let index = this.peek() === ':' ? null : this.expression(0);
                if (this.take(':')) {
                    const stop = [':', ']'].includes(this.peek()) ? null : this.expression(0);
                    const step = this.take(':') ? (this.peek() === ']' ? null : this.expression(0)) : null;
                    index = { type: 'SliceExpression', start: index, stop, step };
                }
                this.expect(']');
                left = { type: 'SubscriptExpression', object: left, index };
                continue;
            }
            if (this.peek() === '.' && 130 >= minPower) {
                this.pos++;
                const attribute = this.tokens[this.pos++];
                if (!attribute || !/^[A-Za-z_]\w*$/.test(attribute.value)) throw new Error('Expected attribute name after dot.');
                left = { type: 'AttributeExpression', object: left, attribute: attribute.type === TOKEN_TYPES.KEYWORD ? attribute.value.toLowerCase() : attribute.value };
                continue;
            }
            // Retain the documented natural-language numeric predicate as an explicit node.
            if (this.peek() === 'IS' && 40 >= minPower) {
                const remaining = this.tokens.slice(this.pos + 1).map(t => t.value.toUpperCase());
                const negated = remaining[0] === 'NOT';
                const offset = negated ? 1 : 0;
                const length = remaining[offset] === 'NUMERIC' ? 1 : (remaining[offset] === 'A' && remaining[offset + 1] === 'NUMBER' ? 2 : 0);
                if (length) {
                    this.pos += 1 + offset + length;
                    left = { type: 'NumericPredicate', argument: left, negated };
                    continue;
                }
            }
            const { op, count, power } = this.operator();
            if (power === undefined || power < minPower) break;
            this.pos += count;
            const right = this.expression(op === '**' ? 110 : power + 1);
            if (power === 40) {
                if (left.type === 'CompareExpression') { left.operators.push(op); left.comparators.push(right); }
                else left = { type: 'CompareExpression', left, operators: [op], comparators: [right] };
            } else left = { type: 'BinaryExpression', operator: op, left, right };
        }
        return left;
    }
}

function emitExpression(node, nested = true) {
    const emit = n => emitExpression(n);
    const wrap = text => nested ? '(' + text + ')' : text;
    switch (node.type) {
        case 'Literal': return node.value;
        case 'Identifier': return node.name;
        case 'GroupExpression': return '(' + emitExpression(node.expression, false) + ')';
        case 'BinaryExpression': return wrap(emit(node.left) + ' ' + node.operator + ' ' + emit(node.right));
        case 'UnaryExpression': return wrap(node.operator + (node.operator === 'not' ? ' ' : '') + emit(node.argument));
        case 'CompareExpression': return wrap(emit(node.left) + node.operators.map((op, i) => ' ' + op + ' ' + emit(node.comparators[i])).join(''));
        case 'TupleExpression': return (nested ? '(' : '') + node.items.map(emit).join(', ') + (node.items.length === 1 ? ',' : '') + (nested ? ')' : '');
        case 'ListExpression': return '[' + node.items.map(emit).join(', ') + ']';
        case 'CallExpression': return emit(node.callee) + '(' + node.arguments.map(emit).join(', ') + ')';
        case 'AttributeExpression': return emit(node.object) + '.' + node.attribute;
        case 'SubscriptExpression': return emit(node.object) + '[' + emit(node.index) + ']';
        case 'SliceExpression': return (node.start ? emit(node.start) : '') + ':' + (node.stop ? emit(node.stop) : '') + (node.step ? ':' + emit(node.step) : '');
        case 'NumericPredicate': return (node.negated ? 'not ' : '') + 'str(' + emit(node.argument) + ').lstrip("-").replace(".", "", 1).isdigit()';
        default: throw new Error('Unsupported expression node: ' + node.type);
    }
}

// Validate every expression, including branches and function bodies; retain source tokens
// for the existing symbol-table, diagnostics and admin trace consumers.
function countAstNodes(node) {
    if (!node || typeof node !== 'object') return 0;
    if (Array.isArray(node)) return node.reduce((count, child) => count + countAstNodes(child), 0);
    return (node.type ? 1 : 0) + Object.entries(node).reduce((count, [key, child]) =>
        count + (['tokens', 'errors', 'arguments'].includes(key) ? 0 : countAstNodes(child)), 0);
}

function validateExpressionTree(ast) {
    const error = (node, message) => ast.errors.push({ line: node.line || 1, message, suggestion: 'Check the syntax guide and the reported line.' });
    const expression = (expr, allowEmpty = false) => {
        if (!expr) return;
        try { expr.ast = !expr.tokens.length && allowEmpty ? null : new ExpressionParser(expr.tokens).parse(); }
        catch (e) { error(expr, e.message); }
    };
    const walk = (nodes, inFunction = false) => {
        for (const node of nodes) {
            for (const key of ['id', 'name', 'iterator', 'target']) {
                if (key in node && (!/^[A-Za-z_]\w*$/.test(node[key]) || node[key].startsWith('_pseudopy_') ||
                    ['class', 'def', 'lambda', 'try', 'except', 'finally', 'raise', 'yield', 'import', 'del', 'with', 'assert', 'pass', 'break', 'continue', 'global', 'nonlocal', 'async', 'await'].includes(node[key]))) error(node, 'Invalid or reserved identifier: ' + node[key]);
            }
            if (node.type === 'ReturnStatement' && !inFunction) error(node, 'RETURN is only valid inside FUNCTION or PROCEDURE.');
            for (const key of ['expr', 'condition', 'index', 'value', 'startExpr', 'endExpr', 'stepExpr', 'iterable']) {
                expression(node[key], key === 'expr' && ['PrintStatement', 'ReturnStatement'].includes(node.type));
            }
            if (node.type === 'ForStatement' && node.stepExpr?.ast?.type === 'Literal' && Number(node.stepExpr.ast.value) === 0) error(node, 'FOR STEP must not be zero.');
            if (node.type === 'FunctionDef') {
                const params = node.params.tokens;
                const names = params.filter((_, i) => i % 2 === 0).map(t => t.value);
                if (params.some((t, i) => i % 2 ? t.value !== ',' : t.type !== TOKEN_TYPES.IDENTIFIER) || (params.length && params.length % 2 === 0) || new Set(names).size !== names.length) error(node, 'Function parameters must be unique names separated by commas.');
            }
            if (node.type === 'CallStatement') {
                let tokens = node.args.tokens;
                // Parse as an actual call to preserve multiple arguments and nested calls.
                if (!tokens.length || tokens[0].value !== '(') tokens = [{ type: TOKEN_TYPES.OPERATOR, value: '(' }, ...tokens, { type: TOKEN_TYPES.OPERATOR, value: ')' }];
                try {
                    const call = new ExpressionParser([{ type: TOKEN_TYPES.IDENTIFIER, value: node.name }, ...tokens]).parse();
                    if (call.type !== 'CallExpression') throw new Error('CALL requires a function and arguments.');
                    node.arguments = call.arguments;
                } catch (e) { error(node, e.message); }
            }
            if (node.body) walk(node.body, inFunction || node.type === 'FunctionDef');
            if (node.elseBody) walk(node.elseBody, inFunction);
            for (const branch of node.elseIfs || []) { expression(branch.condition); walk(branch.body, inFunction); }
        }
    };
    walk(ast.body);
}

class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.pos = 0;
        this.errors = [];
        this.blockStack = [];  // LIFO stack for block validation
    }

    peek(offset) {
        const idx = this.pos + (offset || 0);
        return idx < this.tokens.length ? this.tokens[idx] : { type: TOKEN_TYPES.EOF, value: '', line: -1 };
    }

    consume() {
        return this.tokens[this.pos++];
    }

    match(type, value) {
        const t = this.peek();
        if (t.type === type && (value === undefined || t.value === value)) {
            return this.consume();
        }
        return null;
    }

    skipNewlines() {
        while (this.peek().type === TOKEN_TYPES.NEWLINE) this.consume();
    }

    // Collect all tokens on the current line as an expression
    collectLineTokens(stopKeywords) {
        const line = this.peek().line;
        const collected = [];
        const stops = new Set((stopKeywords || []).map(function (k) { return k.toUpperCase(); }));

        let depth = 0;
        while (this.peek().type !== TOKEN_TYPES.EOF && this.peek().type !== TOKEN_TYPES.NEWLINE) {
            const token = this.peek();
            if (depth === 0 && token.type !== TOKEN_TYPES.STRING && stops.has(token.value.toUpperCase())) break;
            if (token.value === '(' || token.value === '[') depth++;
            if (token.value === ')' || token.value === ']') depth--;
            collected.push(this.consume());
        }
        return { type: 'Expression', tokens: collected, line: line };
    }

    // ── CFG Rule: Program → BEGIN StatementList END ──
    parse() {
        compilerTrace.emit({ type: 'PARSER_START', stage: 'SYNTAX_ANALYSIS', status: 'RUNNING', data: { tokenCount: this.tokens.length } });
        const body = [];
        this.skipNewlines();

        // ▸ MANDATORY BOOKEND: Reject if BEGIN is missing
        const firstNonNewline = this.peek();
        if (!this.match(TOKEN_TYPES.KEYWORD, 'BEGIN')) {
            // Use Levenshtein to check if they ALMOST typed BEGIN
            let suggestion = 'Your pseudocode must start with BEGIN on the first line.';
            if (firstNonNewline.type === TOKEN_TYPES.KEYWORD || firstNonNewline.type === TOKEN_TYPES.IDENTIFIER) {
                const hint = suggestSentinel(firstNonNewline.value, ['BEGIN']);
                if (hint) suggestion = 'Did you mean "' + hint + '"? ' + suggestion;
            }
            this.errors.push({ line: firstNonNewline.line || 1, message: 'Missing BEGIN statement.', suggestion: suggestion });
        }
        this.skipNewlines();

        // ▸ Parse statements until END or EOF
        let foundEnd = false;
        while (this.peek().type !== TOKEN_TYPES.EOF) {
            // Check for global END terminal
            if (this.peek().type === TOKEN_TYPES.KEYWORD && this.peek().value === 'END') {
                const next = this.peek(1);
                // Only treat as global END if next is EOF, NEWLINE-then-EOF, or bare NEWLINE
                if (next.type === TOKEN_TYPES.EOF || next.type === TOKEN_TYPES.NEWLINE) {
                    this.consume(); // consume END
                    foundEnd = true;
                    break;
                }
                // Otherwise it's END IF / END FOR / END WHILE — handled by block parsers
            }

            this.skipNewlines();
            if (this.peek().type === TOKEN_TYPES.EOF) break;

            const stmt = this.parseStatement();
            if (stmt) {
                body.push(stmt);
            } else {
                // Skip unrecognized token
                if (this.peek().type !== TOKEN_TYPES.EOF && this.peek().type !== TOKEN_TYPES.NEWLINE) {
                    this.consume();
                }
            }
            this.skipNewlines();
        }

        this.skipNewlines();
        if (foundEnd && this.peek().type !== TOKEN_TYPES.EOF) {
            this.errors.push({ line: this.peek().line, message: 'Unexpected code after END.', suggestion: 'END must be the last statement.' });
        }

        // ▸ MANDATORY BOOKEND: Reject if END is missing
        if (!foundEnd) {
            const lastLine = this.tokens.length > 0 ? this.tokens[this.tokens.length - 1].line : 1;
            this.errors.push({ line: lastLine, message: 'Missing END statement.', suggestion: 'Your pseudocode must end with END on the last line.' });
        }

        // ▸ LIFO STACK VALIDATION: Report any unclosed blocks
        while (this.blockStack.length > 0) {
            const unclosed = this.blockStack.pop();
            this.errors.push({
                line: unclosed.line,
                message: 'Unclosed ' + unclosed.type + ' block (opened on line ' + unclosed.line + ').',
                suggestion: 'Add END ' + unclosed.type + ' to close this block.'
            });
        }

        const astResult = { type: 'Program', body: body, errors: this.errors };
        validateExpressionTree(astResult);
        compilerTrace.emit({ type: 'AST_CREATED', stage: 'SYNTAX_ANALYSIS', status: this.errors.length > 0 ? 'ERROR' : 'SUCCESS', data: { nodeCount: countAstNodes(astResult), errorCount: this.errors.length, errors: this.errors, blockStack: this.blockStack.slice() } });
        return astResult;
    }

    parseStatement() {
        const t = this.peek();

        if (t.type === TOKEN_TYPES.KEYWORD) {
            switch (t.value) {
                case 'DECLARE': return this.parseDeclare();
                case 'SET': return this.parseSet();
                case 'PRINT':
                case 'DISPLAY':
                case 'OUTPUT': return this.parsePrint();
                case 'INPUT':
                case 'READ': return this.parseInput();
                case 'IF': return this.parseIf();
                case 'WHILE': return this.parseWhile();
                case 'FOR': return this.parseFor();
                case 'RETURN': return this.parseReturn();
                case 'CALL': return this.parseCall();
                case 'INCREMENT': return this.parseIncDec(1);
                case 'DECREMENT': return this.parseIncDec(-1);
                case 'APPEND': return this.parseAppend();
                case 'FUNCTION':
                case 'PROCEDURE': return this.parseFuncDef();
            }
        }

        // Bare assignment:  varName = expr
        if (t.type === TOKEN_TYPES.IDENTIFIER) {
            const next = this.peek(1);
            if (next.type === TOKEN_TYPES.OPERATOR && next.value === '=') {
                return this.parseBareAssignment();
            }
            // Array element assignment: arr[i] = expr
            if (next.type === TOKEN_TYPES.OPERATOR && next.value === '[') {
                return this.parseArrayAssignment();
            }
        }

        if (t.type !== TOKEN_TYPES.NEWLINE && t.type !== TOKEN_TYPES.EOF) {
            this.errors.push({ line: t.line, message: 'Unrecognized statement: ' + t.value, suggestion: 'Use a supported statement such as SET, DISPLAY, IF, FOR or WHILE.' });
        }
        return null;
    }

    // ── DECLARE x AS INTEGER ──
    parseDeclare() {
        const kw = this.consume();
        const id = this.match(TOKEN_TYPES.IDENTIFIER);
        if (!id) {
            this.errors.push({ line: kw.line, message: 'Expected variable name after DECLARE.', suggestion: 'Example: DECLARE x AS INTEGER' });
            return null;
        }
        if (!this.match(TOKEN_TYPES.KEYWORD, 'AS')) {
            this.errors.push({ line: kw.line, message: 'Expected AS after variable name in DECLARE.', suggestion: 'Example: DECLARE ' + id.value + ' AS INTEGER' });
        }
        const typeToken = this.peek();
        if (['INTEGER', 'FLOAT', 'REAL', 'STRING', 'CHAR', 'CHARACTER', 'BOOLEAN', 'BOOL', 'ARRAY'].includes(typeToken.value)) this.consume();
        else this.errors.push({ line: kw.line, message: 'Unsupported or missing declaration type.', suggestion: 'Use INTEGER, FLOAT, REAL, STRING, BOOLEAN or ARRAY.' });
        return { type: 'DeclareStatement', id: id.value, varType: typeToken ? typeToken.value : 'UNKNOWN', line: kw.line };
    }

    // ── SET x TO expr  →  x = expr ──
    // Modified to detect array assignments (e.g. SET Numbers[j] = Numbers[j + 1])
    parseSet() {
        const kw = this.consume();
        const id = this.match(TOKEN_TYPES.IDENTIFIER);
        if (!id) {
            this.errors.push({ line: kw.line, message: 'Expected variable name after SET.', suggestion: 'Example: SET x TO 5' });
            return null;
        }

        // Fix: Detect if the next token is an opening square bracket '[' indicating an array assignment.
        if (this.peek().type === TOKEN_TYPES.OPERATOR && this.peek().value === '[') {
            // Parse as an array assignment passing the pre-matched identifier token.
            return this.parseArrayAssignment(id);
        }

        if (!this.match(TOKEN_TYPES.KEYWORD, 'TO')) {
            if (!this.match(TOKEN_TYPES.OPERATOR, '=')) {
                // Levenshtein: did they misspell TO?
                const nextTok = this.peek();
                if (nextTok.type !== TOKEN_TYPES.KEYWORD && nextTok.type !== TOKEN_TYPES.IDENTIFIER) {
                    this.errors.push({ line: kw.line, message: 'Expected TO or = after variable name.' });
                }
                if (nextTok.type === TOKEN_TYPES.KEYWORD || nextTok.type === TOKEN_TYPES.IDENTIFIER) {
                    const hint = suggestSentinel(nextTok.value, ['TO']);
                    if (hint) {
                        this.errors.push({ line: kw.line, message: 'Expected TO in SET assignment.', suggestion: 'Did you mean "' + hint + '"? Use: SET ' + id.value + ' TO value' });
                        this.consume(); // skip the misspelled word
                    } else {
                        this.errors.push({ line: kw.line, message: 'Expected TO after variable name.', suggestion: 'Use: SET ' + id.value + ' TO value' });
                    }
                }
            }
        }
        const expr = this.collectLineTokens();
        return { type: 'AssignmentStatement', id: id.value, expr: expr, line: kw.line };
    }

    // ── x = expr ──
    parseBareAssignment() {
        const id = this.consume();
        this.consume(); // =
        const expr = this.collectLineTokens();
        return { type: 'AssignmentStatement', id: id.value, expr: expr, line: id.line };
    }

    // ── arr[i] = expr ──
    // Modified to support an optional pre-matched identifier (from SET array[index] = value)
    // and match either '=' or 'TO' as the assignment operator.
    parseArrayAssignment(preMatchedId) {
        const id = preMatchedId || this.consume();
        this.consume(); // [
        const indexExpr = this.collectLineTokens([']']);
        if (this.peek().value === ']') this.consume();
        else this.errors.push({ line: id.line, message: 'Missing closing ] in assignment.' });

        // Support either '=' or 'TO' as the assignment operator
        const assignOp = this.peek();
        if (assignOp.type === TOKEN_TYPES.OPERATOR && assignOp.value === '=') {
            this.consume(); // =
        } else if (assignOp.type === TOKEN_TYPES.KEYWORD && assignOp.value === 'TO') {
            this.consume(); // TO
        } else {
            this.errors.push({
                line: id.line,
                message: "Expected '=' or 'TO' after array index.",
                suggestion: "Example: " + id.value + "[index] = value"
            });
            if (assignOp.type === TOKEN_TYPES.OPERATOR || assignOp.type === TOKEN_TYPES.KEYWORD) {
                this.consume();
            }
        }
        const valueExpr = this.collectLineTokens();
        return { type: 'ArrayAssignStatement', id: id.value, index: indexExpr, expr: valueExpr, line: id.line };
    }

    // ── PRINT / DISPLAY / OUTPUT expr ──
    parsePrint() {
        const kw = this.consume();
        const expr = this.collectLineTokens();
        return { type: 'PrintStatement', expr: expr, line: kw.line };
    }

    // ── INPUT x ──
    parseInput() {
        const kw = this.consume();
        if (this.peek().type === TOKEN_TYPES.KEYWORD && this.peek().value === 'WITH') {
            this.consume(); // WITH
            this.match(TOKEN_TYPES.KEYWORD, 'PROMPT');
            const promptExpr = [];
            if (this.peek().type === TOKEN_TYPES.STRING) {
                promptExpr.push(this.consume());
            }
            const id = this.match(TOKEN_TYPES.IDENTIFIER);
            return { type: 'InputStatement', id: id ? id.value : '_', prompt: promptExpr, line: kw.line };
        }
        const id = this.match(TOKEN_TYPES.IDENTIFIER);
        if (!id) {
            this.errors.push({ line: kw.line, message: 'Expected variable name after INPUT.', suggestion: 'Example: INPUT x' });
            return null;
        }
        return { type: 'InputStatement', id: id.value, prompt: null, line: kw.line };
    }

    // ── CFG Rule: IfStmt → IF Expression THEN Block [ELSE Block] END IF ──
    // Sentinel enforcement: THEN is mandatory.
    parseIf() {
        const kw = this.consume(); // IF
        this.blockStack.push({ type: 'IF', line: kw.line }); // LIFO push

        const cond = this.collectLineTokens(['THEN']);

        // ▸ SENTINEL ENFORCEMENT: THEN is required
        if (!this.match(TOKEN_TYPES.KEYWORD, 'THEN')) {
            // Levenshtein: check if they typed something close to THEN
            let suggestion = 'Every IF must end its condition with THEN. Use: IF condition THEN';
            const nextTok = this.peek();
            if (nextTok.type === TOKEN_TYPES.KEYWORD || nextTok.type === TOKEN_TYPES.IDENTIFIER) {
                const hint = suggestSentinel(nextTok.value, ['THEN']);
                if (hint) {
                    suggestion = 'Did you mean "' + hint + '"? ' + suggestion;
                    this.consume(); // skip the misspelled sentinel
                }
            }
            this.errors.push({ line: kw.line, message: 'IF statement missing sentinel keyword THEN.', suggestion: suggestion });
        }
        this.skipNewlines();

        const body = this.parseBlock(['ELSE', 'ENDIF', 'END']);

        const elseIfs = [];
        while (this.peek().value === 'ELSE' && this.peek(1).value === 'IF') {
            this.consume(); // ELSE
            const kwIf = this.consume(); // IF
            const cond = this.collectLineTokens(['THEN']);
            if (!this.match(TOKEN_TYPES.KEYWORD, 'THEN')) {
                this.errors.push({ line: kwIf.line, message: 'ELSE IF statement missing sentinel keyword THEN.', suggestion: 'Use: ELSE IF condition THEN' });
            }
            this.skipNewlines();
            const elifBody = this.parseBlock(['ELSE', 'ENDIF', 'END']);
            elseIfs.push({ condition: cond, body: elifBody, line: kwIf.line });
        }

        let elseBody = null;

        if (this.peek().value === 'ELSE') {
            this.consume();
            this.skipNewlines();
            elseBody = this.parseBlock(['ENDIF', 'END']);
        }

        // ▸ BLOCK CLOSURE: END IF or ENDIF required (LIFO pop)
        if (this.peek().value === 'ENDIF') {
            this.consume();
            this.popBlock('IF', kw.line);
        } else if (this.peek().value === 'END') {
            const next = this.peek(1);
            if (next.type === TOKEN_TYPES.KEYWORD && next.value === 'IF') {
                this.consume(); this.consume();
                this.popBlock('IF', kw.line);
            } else {
                this.errors.push({ line: kw.line, message: 'Unclosed IF block (opened on line ' + kw.line + ').', suggestion: 'Add END IF to close this block.' });
            }
        } else {
            this.errors.push({ line: kw.line, message: 'Unclosed IF block (opened on line ' + kw.line + ').', suggestion: 'Add END IF to close this block.' });
        }

        return { type: 'IfStatement', condition: cond, body: body, elseIfs: elseIfs, elseBody: elseBody, line: kw.line };
    }

    // ── CFG Rule: WhileStmt → WHILE Expression DO Block END WHILE ──
    // Sentinel enforcement: DO is mandatory.
    parseWhile() {
        const kw = this.consume(); // WHILE
        this.blockStack.push({ type: 'WHILE', line: kw.line }); // LIFO push

        const cond = this.collectLineTokens(['DO']);

        // ▸ SENTINEL ENFORCEMENT: DO is required
        if (!this.match(TOKEN_TYPES.KEYWORD, 'DO')) {
            let suggestion = 'Every WHILE must end its condition with DO. Use: WHILE condition DO';
            const nextTok = this.peek();
            if (nextTok.type === TOKEN_TYPES.KEYWORD || nextTok.type === TOKEN_TYPES.IDENTIFIER) {
                const hint = suggestSentinel(nextTok.value, ['DO']);
                if (hint) {
                    suggestion = 'Did you mean "' + hint + '"? ' + suggestion;
                    this.consume();
                }
            }
            this.errors.push({ line: kw.line, message: 'WHILE statement missing sentinel keyword DO.', suggestion: suggestion });
        }
        this.skipNewlines();

        const body = this.parseBlock(['ENDWHILE', 'END']);

        // ▸ BLOCK CLOSURE: END WHILE or ENDWHILE required (LIFO pop)
        if (this.peek().value === 'ENDWHILE') {
            this.consume();
            this.popBlock('WHILE', kw.line);
        } else if (this.peek().value === 'END') {
            const next = this.peek(1);
            if (next.type === TOKEN_TYPES.KEYWORD && next.value === 'WHILE') {
                this.consume(); this.consume();
                this.popBlock('WHILE', kw.line);
            } else {
                this.errors.push({ line: kw.line, message: 'Unclosed WHILE block (opened on line ' + kw.line + ').', suggestion: 'Add END WHILE to close this block.' });
            }
        } else {
            this.errors.push({ line: kw.line, message: 'Unclosed WHILE block (opened on line ' + kw.line + ').', suggestion: 'Add END WHILE to close this block.' });
        }

        return { type: 'WhileStatement', condition: cond, body: body, line: kw.line };
    }

    // ── CFG Rule: ForStmt → FOR id FROM expr TO expr DO Block END FOR ──
    parseFor() {
        const kw = this.consume(); // FOR
        this.blockStack.push({ type: 'FOR', line: kw.line }); // LIFO push

        if (this.peek().value === 'EACH') {
            this.consume();
            const id = this.match(TOKEN_TYPES.IDENTIFIER);
            if (!id) this.errors.push({ line: kw.line, message: 'FOR EACH requires an iterator name.' });
            if (!this.match(TOKEN_TYPES.KEYWORD, 'IN')) this.errors.push({ line: kw.line, message: 'FOR EACH requires IN.' });
            const iterable = this.collectLineTokens(['DO']);
            if (!this.match(TOKEN_TYPES.KEYWORD, 'DO')) {
                this.errors.push({ line: kw.line, message: 'FOR EACH missing sentinel keyword DO.', suggestion: 'Use: FOR EACH item IN list DO' });
            }
            this.skipNewlines();
            const body = this.parseBlock(['ENDFOR', 'END']);
            this.consumeEndBlock('FOR', kw.line);
            return { type: 'ForEachStatement', iterator: id ? id.value : '_', iterable: iterable, body: body, line: kw.line };
        }

        // FOR i FROM start TO end DO
        const id = this.match(TOKEN_TYPES.IDENTIFIER);
        if (!id) this.errors.push({ line: kw.line, message: 'FOR requires an iterator name.' });
        if (!this.match(TOKEN_TYPES.KEYWORD, 'FROM')) this.errors.push({ line: kw.line, message: 'FOR requires FROM.' });
        const startExpr = this.collectLineTokens(['TO']);
        if (!this.match(TOKEN_TYPES.KEYWORD, 'TO')) this.errors.push({ line: kw.line, message: 'FOR requires TO.' });
        const endExpr = this.collectLineTokens(['STEP', 'DO']);
        const stepExpr = this.match(TOKEN_TYPES.KEYWORD, 'STEP') ? this.collectLineTokens(['DO']) : null;
        if (!this.match(TOKEN_TYPES.KEYWORD, 'DO')) {
            this.errors.push({ line: kw.line, message: 'FOR statement missing sentinel keyword DO.', suggestion: 'Use: FOR i FROM 1 TO 10 DO' });
        }
        this.skipNewlines();
        const body = this.parseBlock(['ENDFOR', 'END']);
        this.consumeEndBlock('FOR', kw.line);

        return { type: 'ForStatement', iterator: id ? id.value : '_', startExpr: startExpr, endExpr: endExpr, stepExpr: stepExpr, body: body, line: kw.line };
    }

    // ── RETURN expr ──
    parseReturn() {
        const kw = this.consume();
        const expr = this.collectLineTokens();
        return { type: 'ReturnStatement', expr: expr, line: kw.line };
    }

    // ── CALL funcName(args) ──
    parseCall() {
        const kw = this.consume();
        const name = this.match(TOKEN_TYPES.IDENTIFIER);
        const args = this.collectLineTokens();
        return { type: 'CallStatement', name: name ? name.value : '', args: args, line: kw.line };
    }

    // ── INCREMENT x / DECREMENT x ──
    parseIncDec(dir) {
        const kw = this.consume();
        const id = this.match(TOKEN_TYPES.IDENTIFIER);
        return { type: 'IncDecStatement', id: id ? id.value : '', direction: dir, line: kw.line };
    }

    // ── APPEND val TO arr ──
    parseAppend() {
        const kw = this.consume();
        const valExpr = this.collectLineTokens(['TO']);
        this.match(TOKEN_TYPES.KEYWORD, 'TO');
        const arrId = this.match(TOKEN_TYPES.IDENTIFIER);
        return { type: 'AppendStatement', value: valExpr, target: arrId ? arrId.value : '', line: kw.line };
    }

    // ── FUNCTION/PROCEDURE name(params) ... END FUNCTION ──
    parseFuncDef() {
        const kw = this.consume();
        this.blockStack.push({ type: kw.value, line: kw.line });
        const name = this.match(TOKEN_TYPES.IDENTIFIER);
        const params = this.collectLineTokens();

        // Strip outer parentheses from params tokens if present
        // e.g. FUNCTION add(a, b) → params tokens are ( a , b ) → strip to a , b
        if (params.tokens.length >= 2 &&
            params.tokens[0].type === TOKEN_TYPES.OPERATOR && params.tokens[0].value === '(' &&
            params.tokens[params.tokens.length - 1].type === TOKEN_TYPES.OPERATOR && params.tokens[params.tokens.length - 1].value === ')') {
            params.tokens = params.tokens.slice(1, -1);
        }

        this.skipNewlines();
        const body = this.parseBlock(['END']);
        this.consumeEndBlock(kw.value, kw.line);
        return { type: 'FunctionDef', name: name ? name.value : '', params: params, body: body, line: kw.line };
    }

    // ── Helper: parse statements until we hit a closing keyword ──
    parseBlock(endKeywords) {
        const body = [];
        const ends = new Set(endKeywords.map(function (k) { return k.toUpperCase(); }));

        while (this.peek().type !== TOKEN_TYPES.EOF) {
            this.skipNewlines();
            if (this.peek().type === TOKEN_TYPES.EOF) break;

            const val = this.peek().value;
            // Direct match: ENDIF, ENDFOR, ENDWHILE
            if (ends.has(val)) break;

            // Two-word match: END IF, END FOR, END WHILE
            if (val === 'END') {
                const next = this.peek(1);
                if (next.type === TOKEN_TYPES.KEYWORD) {
                    if (ends.has(val) || ends.has(next.value)) break;
                }
                if (next.type === TOKEN_TYPES.EOF || next.type === TOKEN_TYPES.NEWLINE) break;
            }

            // Break on ELSE for IF blocks
            if (val === 'ELSE' && ends.has('ELSE')) break;

            const stmt = this.parseStatement();
            if (stmt) {
                body.push(stmt);
            } else {
                if (this.peek().type !== TOKEN_TYPES.EOF && this.peek().type !== TOKEN_TYPES.NEWLINE) {
                    this.consume();
                }
            }
        }
        return body;
    }

    // ── Consume END FOR / END WHILE / ENDFOR / ENDWHILE + LIFO pop ──
    consumeEndBlock(type, openLine) {
        const endWord = 'END' + type;
        if (this.peek().value === endWord) {
            this.consume();
            this.popBlock(type, openLine);
        } else if (this.peek().value === 'END') {
            const next = this.peek(1);
            if (next.type === TOKEN_TYPES.KEYWORD && next.value === type) {
                this.consume(); this.consume();
                this.popBlock(type, openLine);
            } else {
                this.errors.push({ line: openLine, message: 'Unclosed ' + type + ' block (opened on line ' + openLine + ').', suggestion: 'Add END ' + type + ' to close this block.' });
            }
        } else {
            this.errors.push({ line: openLine, message: 'Unclosed ' + type + ' block (opened on line ' + openLine + ').', suggestion: 'Add END ' + type + ' to close this block.' });
        }
    }

    // ── LIFO stack pop with mismatch detection ──
    popBlock(expectedType, openLine) {
        if (this.blockStack.length === 0) {
            this.errors.push({ line: openLine, message: 'Unexpected END ' + expectedType + '. No matching ' + expectedType + ' block to close.' });
            return;
        }
        const top = this.blockStack[this.blockStack.length - 1];
        if (top.type === expectedType) {
            this.blockStack.pop();
        } else {
            // Mismatch: e.g., opened FOR but closing IF
            this.errors.push({
                line: openLine,
                message: 'Block mismatch: Expected END ' + top.type + ' (opened on line ' + top.line + ') but found END ' + expectedType + '.',
                suggestion: 'Close the innermost block first with END ' + top.type + '.'
            });
        }
    }
}


// ══════════════════════════════════════════════════════════════
// STAGE 3: SEMANTIC ANALYSIS (Symbol Table + Scope Validation)
//
// Pre-Execution Validation: Walks the AST to build a Symbol Table
// and flag undeclared variables BEFORE code generation occurs.
// This prevents silent execution failures in Skulpt.
// ══════════════════════════════════════════════════════════════
class SemanticAnalyzer {
    constructor() {
        this.symbolTable = new Map(); // id -> { type: 'numeric' | 'string' | 'unknown' }
        this.warnings = [];
    }


    analyze(ast) {
        compilerTrace.emit({ type: 'SEMANTIC_START', stage: 'SEMANTIC_ANALYSIS', status: 'RUNNING', data: {} });
        this.visitNode(ast);
        compilerTrace.emit({ type: 'SEMANTIC_COMPLETE', stage: 'SEMANTIC_ANALYSIS', status: this.warnings.length > 0 ? 'WARNING' : 'SUCCESS', data: { warningCount: this.warnings.length, warnings: this.warnings, symbolTable: Object.fromEntries(this.symbolTable) } });
        return this.warnings;
    }

    visitNode(node) {
        if (!node) return;
        switch (node.type) {
            case 'Program':
                node.body.forEach(n => this.visitNode(n));
                break;
            case 'DeclareStatement': {
                const typeUpper = node.varType.toUpperCase();
                let symType = 'unknown';
                if (['INTEGER', 'FLOAT', 'NUMERIC', 'REAL', 'NUMBER'].includes(typeUpper)) symType = 'numeric';
                else if (['STRING', 'CHAR', 'CHARACTER'].includes(typeUpper)) symType = 'string';
                else if (['ARRAY'].includes(typeUpper)) symType = 'array';
                this.symbolTable.set(node.id, { type: symType, declaredType: node.varType });
                break;
            }

            case 'AssignmentStatement':
                if (!this.symbolTable.has(node.id)) {
                    this.warnings.push({
                        line: node.line,
                        message: "Variable '" + node.id + "' used without DECLARE.",
                        suggestion: 'Add: DECLARE ' + node.id + ' AS INTEGER (or appropriate type)'
                    });
                }
                // Infer type from the assigned expression
                {
                    const exprToks = node.expr ? node.expr.tokens : [];
                    const hasStrTok = exprToks.some(t => t.type === TOKEN_TYPES.STRING);
                    const hasNumTok = exprToks.some(t => t.type === TOKEN_TYPES.NUMBER);
                    let inferredType = 'unknown';
                    if (hasStrTok) inferredType = 'string';
                    else if (hasNumTok) inferredType = 'numeric';
                    else {
                        // Propagate from referenced variable types
                        for (const et of exprToks) {
                            if (et.type === TOKEN_TYPES.IDENTIFIER) {
                                const info = this.symbolTable.get(et.value);
                                if (info && info.type === 'numeric') { inferredType = 'numeric'; break; }
                            }
                        }
                    }
                    this.symbolTable.set(node.id, { ...this.symbolTable.get(node.id), type: inferredType });
                }
                this.checkExpr(node.expr);
                break;

            case 'ArrayAssignStatement':
                this.checkExpr(node.index);
                this.checkExpr(node.expr);
                if (!this.symbolTable.has(node.id)) {
                    this.warnings.push({ line: node.line, message: "Array '" + node.id + "' not declared.", suggestion: 'Add: DECLARE ' + node.id + ' AS ARRAY' });
                }
                this.symbolTable.set(node.id, { type: 'unknown' });
                break;

            case 'PrintStatement':
                this.checkExpr(node.expr);
                break;
            case 'InputStatement':
                node.inputType = this.symbolTable.get(node.id)?.declaredType || '';
                if (!this.symbolTable.has(node.id)) this.symbolTable.set(node.id, { type: 'string' });
                break;

            case 'IfStatement':
                this.checkExpr(node.condition);
                node.body.forEach(n => this.visitNode(n));
                if (node.elseIfs) {
                    node.elseIfs.forEach(eif => {
                        this.checkExpr(eif.condition);
                        eif.body.forEach(n => this.visitNode(n));
                    });
                }
                if (node.elseBody) node.elseBody.forEach(n => this.visitNode(n));
                break;
            case 'WhileStatement':
                this.checkExpr(node.condition);
                node.body.forEach(n => this.visitNode(n));
                break;
            case 'ForStatement':
                this.symbolTable.set(node.iterator, { type: 'unknown' }); // loop var implicitly declared
                this.checkExpr(node.startExpr);
                this.checkExpr(node.endExpr);
                this.checkExpr(node.stepExpr);
                node.body.forEach(n => this.visitNode(n));
                break;
            case 'ForEachStatement':
                this.checkExpr(node.iterable);
                this.symbolTable.set(node.iterator, { type: 'unknown' });
                node.body.forEach(n => this.visitNode(n));
                break;
            case 'FunctionDef': {
                this.symbolTable.set(node.name, { type: 'function' });
                const outerScope = this.symbolTable;
                this.symbolTable = new Map(outerScope);
                for (const token of node.params.tokens) {
                    if (token.type === TOKEN_TYPES.IDENTIFIER) this.symbolTable.set(token.value, { type: 'unknown' });
                }
                node.body.forEach(n => this.visitNode(n));
                this.symbolTable = outerScope;
                break;
            }
            case 'ReturnStatement':
                this.checkExpr(node.expr);
                break;
            case 'CallStatement':
                this.checkExpr(node.args);
                break;
            case 'IncDecStatement':
                if (!this.symbolTable.has(node.id)) {
                    this.warnings.push({ line: node.line, message: "Variable '" + node.id + "' not declared before increment/decrement.", suggestion: 'Add: DECLARE ' + node.id + ' AS INTEGER' });
                }
                break;
            case 'AppendStatement':
                if (!this.symbolTable.has(node.target)) {
                    this.warnings.push({ line: node.line, message: "Array '" + node.target + "' not declared.", suggestion: 'Add: DECLARE ' + node.target + ' AS ARRAY' });
                }
                this.checkExpr(node.value);
                break;
        }
    }

    checkExpr(exprNode) {
        if (!exprNode || !exprNode.tokens) return;
        const tokens = exprNode.tokens;

        const builtins = new Set(['str', 'int', 'float', 'bool', 'len', 'range', 'abs', 'min', 'max', 'sum', 'round', 'sorted', 'list', 'tuple', 'set', 'dict', 'enumerate', 'zip', 'reversed', 'all', 'any', 'pow', 'chr', 'ord', 'isinstance', 'input', 'print']);
        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            if (t.type !== TOKEN_TYPES.IDENTIFIER || tokens[i - 1]?.value === '.' || builtins.has(t.value)) continue;
            // Natural-language predicate words are grammar, not variable references.
            if (['A', 'NUMBER', 'NUMERIC'].includes(t.value.toUpperCase()) && tokens.some(t => t.value === 'IS')) continue;
            if (!this.symbolTable.has(t.value)) this.warnings.push({
                line: exprNode.line,
                message: "Undeclared variable '" + t.value + "' in expression.",
                suggestion: 'Assign or declare ' + t.value + ' before using it.'
            });
        }
    }

}


// ══════════════════════════════════════════════════════════════
// STAGE 4: CODE GENERATION (AST Tree-Walker → Python)
//
// Syntax-Directed Translation (SDT):
//   Each AST node type has a corresponding Python emission rule.
//   Maintains a global indent_level variable:
//     • Increase after DO / THEN (entering a block)
//     • Decrease after END IF / END WHILE / END FOR (leaving a block)
//
// The generated code is compatible with Skulpt's print() capture.
// ══════════════════════════════════════════════════════════════
const PYTHON_OPERATOR_MAP = {
    '\u2265': '>=',
    '\u2264': '<=',
    '\u2260': '!=',
    '==': '==',
    '\u2261': '==',
    '\u00D7': '*',
    '\u2715': '*',
    '\u22C5': '*',
    '\u00F7': '/',
    '\u2011': '-',
    '\u2212': '-',
    '\u2013': '-',
    '\u2014': '-'
};

class CodeGenerator {
    constructor(symbolTable) {
        this.indentLevel = 0;   // Global indent_level
        this.lines = [];
        this.symbolTable = symbolTable || new Map();
    }

    ind() {
        return '    '.repeat(this.indentLevel);
    }

    normalizeOperator(rawOperator) {
        return PYTHON_OPERATOR_MAP[rawOperator] || rawOperator;
    }

    // Parse and emit the same expression grammar used by validation and the AST viewer.
    exprToStr(tokens) {
        if (!tokens || tokens.length === 0) return '';
        return emitExpression(new ExpressionParser(tokens).parse(), false);
    }

    smartPrintExpr(tokens) {
        if (!tokens || tokens.length === 0) return '';
        // DISPLAY follows Python expression semantics; use commas or str() for mixed types.
        return this.exprToStr(tokens);
    }

    generate(ast) {
        compilerTrace.emit({ type: 'CODEGEN_START', stage: 'CODE_GENERATION', status: 'RUNNING', data: { nodeCount: ast.body ? ast.body.length : 0 } });
        this.lines = [];
        this.indentLevel = 0;
        for (const node of ast.body) {
            compilerTrace.emit({ type: 'CODEGEN_VISIT', stage: 'CODE_GENERATION', status: 'RUNNING', data: { nodeType: node.type, line: node.line } });
            this.visitNode(node);
        }
        if (this.lines.some(line => line.includes(' in _pseudopy_range('))) {
            this.lines.unshift('def _pseudopy_range(start, stop, step):',
                '    if not all(isinstance(value, int) for value in (start, stop, step)):',
                '        raise TypeError("FOR bounds and STEP must be integers")',
                '    if step == 0:', '        raise ValueError("FOR STEP must not be zero")',
                '    return range(start, stop + (1 if step > 0 else -1), step)', '');
        }
        const result = this.lines.join('\n');
        compilerTrace.emit({ type: 'CODEGEN_COMPLETE', stage: 'CODE_GENERATION', status: 'SUCCESS', data: { lineCount: this.lines.length, python: result } });
        return result;
    }

    visitNode(node) {
        if (!node) return;
        switch (node.type) {
            case 'DeclareStatement': {
                // Emit a comment + a real Python initializer so the variable exists in scope
                const typeUpper = (node.varType || '').toUpperCase();
                let initVal = '0';  // default: INTEGER / FLOAT / REAL / NUMERIC
                if (['STRING', 'CHAR', 'CHARACTER'].includes(typeUpper)) initVal = '""';
                else if (['BOOLEAN', 'BOOL'].includes(typeUpper)) initVal = 'False';
                else if (['ARRAY'].includes(typeUpper)) initVal = '[]';
                this.lines.push(this.ind() + '# DECLARE ' + node.id + ' AS ' + node.varType);
                this.lines.push(this.ind() + node.id + ' = ' + initVal);
                break;
            }

            case 'AssignmentStatement':
                this.lines.push(this.ind() + node.id + ' = ' + this.exprToStr(node.expr.tokens));
                break;

            case 'ArrayAssignStatement':
                this.lines.push(this.ind() + node.id + '[' + this.exprToStr(node.index.tokens) + '] = ' + this.exprToStr(node.expr.tokens));
                break;

            case 'PrintStatement': {
                const s = this.smartPrintExpr(node.expr.tokens);
                this.lines.push(this.ind() + 'print(' + s + ')');
                break;
            }


            case 'InputStatement': {
                const inputType = (node.inputType || '').toUpperCase();
                const isStringNode = !['INTEGER', 'FLOAT', 'REAL'].includes(inputType);
                const converter = inputType === 'INTEGER' ? 'int' : 'float';
                if (isStringNode) {
                    if (node.prompt && node.prompt.length > 0) {
                        this.lines.push(this.ind() + node.id + ' = input(' + node.prompt[0].value + ')');
                    } else {
                        this.lines.push(this.ind() + node.id + ' = input("Please enter ' + node.id + ': ")');
                    }
                } else {
                    if (node.prompt && node.prompt.length > 0) {
                        this.lines.push(this.ind() + node.id + ' = ' + converter + '(input(' + node.prompt[0].value + '))');
                    } else {
                        this.lines.push(this.ind() + node.id + ' = ' + converter + '(input("Please enter ' + node.id + ': "))');
                    }
                }
                break;
            }



            case 'IfStatement':
                // indent_level increases after THEN
                this.lines.push(this.ind() + 'if ' + this.exprToStr(node.condition.tokens) + ':');
                this.indentLevel++;
                if (this.isBodyEffectivelyEmpty(node.body)) this.lines.push(this.ind() + 'pass');
                else node.body.forEach(n => this.visitNode(n));
                this.indentLevel--;

                if (node.elseIfs) {
                    node.elseIfs.forEach(eif => {
                        this.lines.push(this.ind() + 'elif ' + this.exprToStr(eif.condition.tokens) + ':');
                        this.indentLevel++;
                        if (this.isBodyEffectivelyEmpty(eif.body)) this.lines.push(this.ind() + 'pass');
                        else eif.body.forEach(n => this.visitNode(n));
                        this.indentLevel--;
                    });
                }

                if (node.elseBody) {
                    this.lines.push(this.ind() + 'else:');
                    this.indentLevel++;
                    if (node.elseBody.length === 0) this.lines.push(this.ind() + 'pass');
                    else node.elseBody.forEach(n => this.visitNode(n));
                    this.indentLevel--;
                }
                break;

            case 'WhileStatement':
                // indent_level increases after DO
                this.lines.push(this.ind() + 'while ' + this.exprToStr(node.condition.tokens) + ':');
                this.indentLevel++;
                if (this.isBodyEffectivelyEmpty(node.body)) this.lines.push(this.ind() + 'pass');
                else node.body.forEach(n => this.visitNode(n));

                this.indentLevel--;  // indent_level decreases after END WHILE
                break;

            case 'ForStatement': {
                const sStr = this.exprToStr(node.startExpr.tokens);
                const eStr = this.exprToStr(node.endExpr.tokens);
                const step = node.stepExpr ? this.exprToStr(node.stepExpr.tokens) : '1';
                // Bind bounds once: inclusive stop for either direction, without truncating floats.
                this.lines.push(this.ind() + `for ${node.iterator} in _pseudopy_range(${sStr}, ${eStr}, ${step}):`);
                this.indentLevel++;
                if (this.isBodyEffectivelyEmpty(node.body)) this.lines.push(this.ind() + 'pass');
                else node.body.forEach(n => this.visitNode(n));

                this.indentLevel--;
                break;
            }

            case 'ForEachStatement':
                this.lines.push(this.ind() + 'for ' + node.iterator + ' in ' + this.exprToStr(node.iterable.tokens) + ':');
                this.indentLevel++;
                if (this.isBodyEffectivelyEmpty(node.body)) this.lines.push(this.ind() + 'pass');
                else node.body.forEach(n => this.visitNode(n));

                this.indentLevel--;
                break;

            case 'ReturnStatement':
                this.lines.push(this.ind() + 'return ' + this.exprToStr(node.expr.tokens));
                break;

            case 'CallStatement':
                this.lines.push(this.ind() + node.name + '(' + node.arguments.map(arg => emitExpression(arg, false)).join(', ') + ')');
                break;

            case 'IncDecStatement':
                this.lines.push(this.ind() + node.id + (node.direction > 0 ? ' += 1' : ' -= 1'));
                break;

            case 'AppendStatement':
                this.lines.push(this.ind() + node.target + '.append(' + this.exprToStr(node.value.tokens) + ')');
                break;

            case 'FunctionDef': {
                // Build param list: identifiers joined by ', ' (commas from tokens are preserved by exprToStr)
                const paramStr = node.params.tokens.map(t => t.value).join(' ');
                this.lines.push(this.ind() + 'def ' + node.name + '(' + paramStr + '):');
                this.indentLevel++;
                if (this.isBodyEffectivelyEmpty(node.body)) this.lines.push(this.ind() + 'pass');
                else node.body.forEach(n => this.visitNode(n));
                this.indentLevel--;
                break;
            }
        }
    }

    isBodyEffectivelyEmpty(body) {
        if (!body || body.length === 0) return true;
        // Does it contain anything other than Comments?
        return !body.some(node => node.type !== 'Comment');
    }
}



// ══════════════════════════════════════════════════════════════
// STAGE 5: COMPILER FACADE + ITERATIVE REFINEMENT CACHE
//
// Orchestrates the full 4-stage pipeline.
// Caches successful translations for iterative refinement.
// Separates syntax errors (hard stops) from semantic warnings.
// ══════════════════════════════════════════════════════════════


class PseudocodeCompiler {
    /**
     * compile(code) → { valid, python, errors[], warnings[] }
     *
     * Pipeline:
     *   1. Lexer.tokenize()          — O(N) tokenization
     *   2. Parser.parse()            — CFG validation + AST construction
     *   3. SemanticAnalyzer.analyze() — symbol table + undeclared var checks
     *   4. CodeGenerator.generate()  — SDT tree-walk → Python emission
     */
    compile(rawCode) {
        const pipelineStart = performance.now();
        const autoFixes = [];

        compilerTrace.emit({ type: 'COMPILER_START', stage: 'PIPELINE', status: 'RUNNING', data: { rawCodeLength: rawCode.length } });

        // Preprocess to strip leading line numbers
        compilerTrace.emit({ type: 'PREPROCESS_START', stage: 'PREPROCESSING', status: 'RUNNING', data: {} });
        const cleanRawCode = preprocessPseudocode(rawCode);
        compilerTrace.emit({ type: 'PREPROCESS_COMPLETE', stage: 'PREPROCESSING', status: 'SUCCESS', data: { input: rawCode, output: cleanRawCode } });

        // ── Stage 0: Natural Language Mapping ──
        let code = cleanRawCode;
        if (typeof nlpMapper !== 'undefined') {
            compilerTrace.emit({ type: 'NLP_MAP_START', stage: 'NLP_MAPPING', status: 'RUNNING', data: {} });
            code = nlpMapper.map(cleanRawCode);
            compilerTrace.emit({ type: 'NLP_MAP_COMPLETE', stage: 'NLP_MAPPING', status: 'SUCCESS', data: { input: cleanRawCode, output: code, changed: code !== cleanRawCode } });
        } else {
            compilerTrace.emit({ type: 'NLP_MAP_SKIPPED', stage: 'NLP_MAPPING', status: 'SKIPPED', data: { reason: 'nlpMapper not available' } });
        }

        // ── Stage 1: Lexical Analysis ──
        const t1 = performance.now();
        const lexer = new Lexer(code);
        const tokens = lexer.tokenize();
        const lexTime = performance.now() - t1;

        // ── Stage 2: Syntax Analysis (CFG + LIFO stack validation) ──
        const t2 = performance.now();
        const parser = new Parser(tokens);
        parser.errors.push(...lexer.errors);
        let ast = parser.parse();
        const parseTime = performance.now() - t2;

        // ── Stage 3: Semantic Analysis (pre-execution variable check) ──
        const t3 = performance.now();
        let semanticAnalyzer = new SemanticAnalyzer();
        let warnings = semanticAnalyzer.analyze(ast);
        const semanticTime = performance.now() - t3;

        // Build pipeline metrics object
        const metrics = {
            lexTime: parseFloat(lexTime.toFixed(3)),
            parseTime: parseFloat(parseTime.toFixed(3)),
            semanticTime: parseFloat(semanticTime.toFixed(3)),
            codeGenTime: 0,
            totalTime: 0,
            tokenCount: tokens.length,
            astNodeCount: countAstNodes(ast)
        };

        // Syntax errors are hard stops — no code generation (if auto-fix failed)
        if (ast.errors.length > 0) {
            metrics.totalTime = parseFloat((performance.now() - pipelineStart).toFixed(3));
            compilerTrace.emit({ type: 'COMPILATION_FAILURE', stage: 'PIPELINE', status: 'ERROR', data: { errorCount: ast.errors.length, errors: ast.errors } });
            return { valid: false, python: '', errors: ast.errors, warnings: warnings, metrics: metrics, mappedCode: code, tokens: tokens, ast: ast, symbolTable: Object.fromEntries(semanticAnalyzer.symbolTable), autoFixes: autoFixes };
        }

        // ── Stage 4: Code Generation (SDT tree-walk) ──
        const t4 = performance.now();
        const generator = new CodeGenerator(semanticAnalyzer.symbolTable);
        const pythonCode = generator.generate(ast);
        metrics.codeGenTime = parseFloat((performance.now() - t4).toFixed(3));

        metrics.totalTime = parseFloat((performance.now() - pipelineStart).toFixed(3));

        compilerTrace.emit({ type: 'COMPILATION_SUCCESS', stage: 'PIPELINE', status: 'SUCCESS', data: { totalTime: metrics.totalTime } });

        return { valid: true, python: pythonCode, errors: [], warnings: warnings, metrics: metrics, mappedCode: code, tokens: tokens, ast: ast, symbolTable: Object.fromEntries(semanticAnalyzer.symbolTable), autoFixes: autoFixes };
    }

    /**
     * analyzeComplexity(code) → "O(1)" | "O(N)" | "O(N²)" | ...
     *
     * Counts max nesting depth of FOR/WHILE loops to estimate Big-O.
     */
    analyzeComplexity(code) {
        const lexer = new Lexer(code);
        const tokens = lexer.tokenize();
        let depth = 0, maxDepth = 0;
        let prevWasEnd = false;

        for (const t of tokens) {
            if (t.type === TOKEN_TYPES.KEYWORD) {
                if (prevWasEnd && (t.value === 'FOR' || t.value === 'WHILE')) {
                    depth = Math.max(0, depth - 1);
                    prevWasEnd = false;
                } else if (t.value === 'FOR' || t.value === 'WHILE') {
                    depth++;
                    if (depth > maxDepth) maxDepth = depth;
                    prevWasEnd = false;
                } else if (t.value === 'ENDFOR' || t.value === 'ENDWHILE') {
                    depth = Math.max(0, depth - 1);
                    prevWasEnd = false;
                } else if (t.value === 'END') {
                    prevWasEnd = true;
                } else if (prevWasEnd && (t.value === 'FOR' || t.value === 'WHILE')) {
                    depth = Math.max(0, depth - 1);
                    prevWasEnd = false;
                } else {
                    prevWasEnd = false;
                }
            } else {
                prevWasEnd = false;
            }
        }

        if (maxDepth === 0) return 'O(1)';
        if (maxDepth === 1) return 'O(N)';
        if (maxDepth === 2) return 'O(N\u00B2)';
        return 'O(N^' + maxDepth + ')';
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PseudocodeCompiler, preprocessPseudocode, CompilerTrace, compilerTrace };
}

