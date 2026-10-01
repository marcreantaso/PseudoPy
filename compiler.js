/* ============================================================
   ALGORITHM SIMULATION TRACE — SINGLE SOURCE OF TRUTH
   ────────────────────────────────────────────────────────────
   One ordered event log for the Developer Options simulator.

   Design constraints:
     • The real compiler stages are the only producers. Nothing
       here re-implements compiler behaviour.
     • Disabled by default. Every call site guards on
       `simulationTracer.enabled`, so no payload object, snapshot
       or timestamp is allocated while the simulator is off.
     • Events never retain live compiler objects. Payloads and
       snapshots are detached copies, so replaying an old event
       cannot show mutated state.
     • Missing positions are reported as null. A coordinate is
       never invented.
     • Storage is bounded. Overflow is reported, not hidden.

   Event schema (the contract every consumer relies on):
     {
       seq,        // monotonic, gap-free within one trace
       stage,      // PREPROCESSING | NLP_MAPPING | LEXICAL_ANALYSIS |
                   // SYNTAX_ANALYSIS | SEMANTIC_ANALYSIS |
                   // CODE_GENERATION | PIPELINE | EXECUTION
       type,       // one of SIMULATION_TRACE_TYPES
       ts,         // monotonic milliseconds
       line,       // 1-based, or null when unavailable
       column,     // 1-based, or null when unavailable
       payload,    // detached plain data
       snapshot?   // present only on SIMULATION_TRACE_TYPES.SNAPSHOT
     }
   ============================================================ */

const SIMULATION_TRACE_TYPES = {
    STAGE_START: 'STAGE_START',
    STAGE_END: 'STAGE_END',
    PREPROCESS_APPLIED: 'PREPROCESS_APPLIED',
    NLP_MAPPING_APPLIED: 'NLP_MAPPING_APPLIED',
    TOKEN_EMITTED: 'TOKEN_EMITTED',
    TOKEN_REJECTED: 'TOKEN_REJECTED',
    BLOCK_PUSH: 'BLOCK_PUSH',
    BLOCK_POP: 'BLOCK_POP',
    BLOCK_MISMATCH: 'BLOCK_MISMATCH',
    NODE_CREATED: 'NODE_CREATED',
    SYMBOL_DECLARED: 'SYMBOL_DECLARED',
    SYMBOL_LOOKUP: 'SYMBOL_LOOKUP',
    SYMBOL_UPDATED: 'SYMBOL_UPDATED',
    TYPE_WARNING: 'TYPE_WARNING',
    DIAGNOSTIC_EMITTED: 'DIAGNOSTIC_EMITTED',
    CODE_EMITTED: 'CODE_EMITTED',
    SOURCE_MAPPED: 'SOURCE_MAPPED',
    SNAPSHOT: 'SNAPSHOT',
    TRACE_TRUNCATED: 'TRACE_TRUNCATED'
};

const SIMULATION_TRACE_LIMITS = {
    maxEvents: 50000,
    snapshotEvery: 50
};

// performance.now() is absent in some bare harnesses.
function simulationNow() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
    return Date.now();
}

// Detach from live compiler state. JSON cloning is deliberate: it drops
// prototypes, cycles and non-JSON Skulpt handles, which is exactly what a
// recorded event must not retain.
function simulationDetach(value) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'object') return value;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (e) {
        return null;
    }
}

class SimulationTracer {
    constructor(limits) {
        const merged = Object.assign({}, SIMULATION_TRACE_LIMITS, limits || {});
        this.maxEvents = merged.maxEvents;
        this.snapshotEvery = merged.snapshotEvery;
        this.reset();
    }

    reset() {
        this.enabled = false;
        this.events = [];
        this.seq = 0;
        this.truncated = false;
        this.snapshotProvider = null;
        this.sinceSnapshot = 0;
    }

    enable() {
        this.enabled = true;
        return this;
    }

    disable() {
        this.enabled = false;
        return this;
    }

    isEnabled() {
        return this.enabled === true;
    }

    // The compiler registers one reader for the live state that is not owned
    // by the tracer (block stack, symbol table, counters).
    setSnapshotProvider(fn) {
        this.snapshotProvider = typeof fn === 'function' ? fn : null;
        return this;
    }

    emit(type, opts) {
        if (!this.enabled) return null;
        if (this.events.length >= this.maxEvents) {
            if (!this.truncated) {
                this.truncated = true;
                this.events.push({
                    seq: this.seq++,
                    stage: 'PIPELINE',
                    type: SIMULATION_TRACE_TYPES.TRACE_TRUNCATED,
                    ts: simulationNow(),
                    line: null,
                    column: null,
                    payload: { maxEvents: this.maxEvents }
                });
            }
            return null;
        }

        const options = opts || {};
        const event = {
            seq: this.seq++,
            stage: options.stage || 'PIPELINE',
            type: type,
            ts: simulationNow(),
            line: typeof options.line === 'number' && isFinite(options.line) ? options.line : null,
            column: typeof options.column === 'number' && isFinite(options.column) ? options.column : null,
            // Detached so a later compiler mutation cannot rewrite history.
            payload: options.payload === undefined ? null : simulationDetach(options.payload)
        };
        // Only checkpoints carry state. The key is omitted entirely otherwise,
        // so consumers can test for `snapshot` rather than for a null.
        if (options.snapshot !== undefined) event.snapshot = simulationDetach(options.snapshot);
        this.events.push(event);

        if (++this.sinceSnapshot >= this.snapshotEvery) {
            this.sinceSnapshot = 0;
            this.captureSnapshot();
        }
        return event;
    }

    // A checkpoint holds the full compiler state at that point in the log.
    // Only periodic full snapshots are stored; the simulator reconstructs
    // intermediate state by replaying deltas forward from the checkpoint.
    captureSnapshot() {
        if (!this.enabled || !this.snapshotProvider) return null;
        let state;
        try {
            state = this.snapshotProvider();
        } catch (e) {
            state = null;
        }
        if (!state) return null;
        return this.emit(SIMULATION_TRACE_TYPES.SNAPSHOT, {
            stage: state.stage || 'PIPELINE',
            line: null,
            column: null,
            payload: { reason: 'interval' },
            snapshot: state
        });
    }

    // Finish a trace and return the envelope the simulator consumes.
    finalize(extra) {
        this.enabled = false;
        const envelope = {
            events: this.events.slice(),
            truncated: this.truncated,
            maxEvents: this.maxEvents,
            snapshotEvery: this.snapshotEvery
        };
        if (extra) {
            for (const key of Object.keys(extra)) envelope[key] = extra[key];
        }
        return envelope;
    }

    getEvents() {
        return this.events.slice();
    }
}

// Global singleton — shared across compiler stages exactly like compilerTrace.
const simulationTracer = new SimulationTracer();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SimulationTracer, simulationTracer, SIMULATION_TRACE_TYPES, SIMULATION_TRACE_LIMITS, simulationDetach };
}/* ============================================================
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
        this.column = 1;
        this.tokens = [];
        this.errors = [];
    }

    // Central token sink: keeps the emitted token and, when the simulator is
    // running, records it. One place to instrument so token positions cannot
    // drift apart from the token objects the parser consumes.
    push(type, value, line, column) {
        const token = { type: type, value: value, line: line, column: column };
        this.tokens.push(token);
        if (simulationTracer.enabled) {
            simulationTracer.emit(SIMULATION_TRACE_TYPES.TOKEN_EMITTED, {
                stage: 'LEXICAL_ANALYSIS',
                line: line,
                column: column,
                payload: { tokenType: type, value: value, index: this.tokens.length - 1 }
            });
        }
        return token;
    }

    // Errors share one shape so the trace and the UI agree on line/column.
    fail(message, suggestion, line, column) {
        const entry = { line: line === undefined ? this.line : line, column: column === undefined ? this.column : column, message: message, suggestion: suggestion };
        this.errors.push(entry);
        if (simulationTracer.enabled) {
            simulationTracer.emit(SIMULATION_TRACE_TYPES.TOKEN_REJECTED, {
                stage: 'LEXICAL_ANALYSIS',
                line: entry.line,
                column: entry.column,
                payload: { message: message, suggestion: suggestion || null }
            });
        }
        return entry;
    }

    advance() {
        const ch = this.input[this.pos++];
        if (ch === '\n') {
            this.line++;
            this.column = 1;
        } else {
            this.column++;
        }
        return ch;
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

    tokenize() {
        compilerTrace.emit({ type: 'LEXER_START', stage: 'LEXICAL_ANALYSIS', status: 'RUNNING', data: { inputLength: this.input.length } });
        if (simulationTracer.enabled) {
            simulationTracer.emit(SIMULATION_TRACE_TYPES.STAGE_START, { stage: 'LEXICAL_ANALYSIS', line: null, column: null, payload: { inputLength: this.input.length } });
        }
        while (this.pos < this.input.length) {
            const ch = this.peek();

            // ── Newlines ──
            if (ch === '\n') {
                this.push(TOKEN_TYPES.NEWLINE, '\n', this.line, this.column);
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
                const startColumn = this.column;
                while (this.pos < this.input.length && /[a-zA-Z0-9_]/.test(this.input[this.pos])) {
                    word += this.advance();
                }
                const upper = word.toUpperCase();
                if (COMPILER_KEYWORDS.has(upper)) {
                    this.push(TOKEN_TYPES.KEYWORD, upper, startLine, startColumn);
                } else {
                    this.push(TOKEN_TYPES.IDENTIFIER, word, startLine, startColumn);
                }
                continue;
            }

            // Decimal/scientific literals; malformed numbers are rejected by expression parsing.
            if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(this.input[this.pos + 1] || ''))) {
                const match = this.input.slice(this.pos).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
                const startLine = this.line;
                const startColumn = this.column;
                this.push(TOKEN_TYPES.NUMBER, match[0], startLine, startColumn);
                this.pos += match[0].length;
                this.column += match[0].length;
                continue;
            }

            // Preserve quotes and escapes exactly. Never rewrite the contents of a literal.
            if (ch === '"' || ch === "'") {
                const startLine = this.line;
                const startColumn = this.column;
                const quote = this.advance();
                let value = quote;
                let closed = false;
                while (this.pos < this.input.length && this.peek() !== '\n') {
                    const c = this.advance();
                    value += c;
                    if (c === quote) { closed = true; break; }
                    if (c === '\\' && this.pos < this.input.length && this.peek() !== '\n') value += this.advance();
                }
                if (!closed) this.fail('Unterminated string literal.', 'Close the string with a matching quote on the same line.', startLine, startColumn);
                this.push(TOKEN_TYPES.STRING, value, startLine, startColumn);
                continue;
            }

            // Longest match keeps **, // and shifts atomic.
            const pair = this.input.slice(this.pos, this.pos + 2);
            if (['**', '//', '<<', '>>', '==', '!=', '<=', '>=', '<>', ':=', '<-'].includes(pair)) {
                this.push(TOKEN_TYPES.OPERATOR, [':=', '<-'].includes(pair) ? '=' : pair, this.line, this.column);
                this.pos += 2;
                this.column += 2;
                continue;
            }
            if ('+-*/%,()[]:.<>=&|^~'.includes(ch)) {
                this.push(TOKEN_TYPES.OPERATOR, this.advance(), this.line, this.column - 1);
                continue;
            }

            // ── Unicode Operator Normalization ──
            // Intercept Unicode math symbols BEFORE the unknown-char fallthrough.
            // The normalized ASCII value is emitted so the parser/code generator
            // never encounters raw Unicode operators.
            if (Lexer.UNICODE_OPERATOR_MAP[ch]) {
                const normalized = Lexer.UNICODE_OPERATOR_MAP[ch];
                this.push(TOKEN_TYPES.OPERATOR, normalized, this.line, this.column);
                this.advance();
                continue;
            }

            this.fail('Unsupported character: ' + ch, 'Use a supported Python operator; exponentiation is ** and XOR is ^.');
            this.advance();
        }

        this.push(TOKEN_TYPES.EOF, '', this.line, this.column);
        compilerTrace.emit({ type: 'LEXER_COMPLETE', stage: 'LEXICAL_ANALYSIS', status: this.errors.length ? 'ERROR' : 'SUCCESS', data: { tokenCount: this.tokens.length, tokens: this.tokens, errors: this.errors } });
        if (simulationTracer.enabled) {
            simulationTracer.emit(SIMULATION_TRACE_TYPES.STAGE_END, {
                stage: 'LEXICAL_ANALYSIS',
                line: null,
                column: null,
                payload: { tokenCount: this.tokens.length, errorCount: this.errors.length }
            });
        }
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

// Parser diagnostics are collected through this array so that every error the
// parser reports is also visible to the simulator, without duplicating each
// push site.
//
// The wrapper is a non-enumerable own property on a real Array rather than an
// Array subclass: subclassing would make `errors.map(...)` re-enter this
// method (Array species), and would break structural comparisons between a
// traced and an untraced compile.
function instrumentErrorList(list) {
    if (!Array.isArray(list)) return list;
    const originalPush = Array.prototype.push;
    Object.defineProperty(list, 'push', {
        value: function (...entries) {
            if (simulationTracer.enabled) {
                for (const entry of entries) {
                    if (entry && typeof entry === 'object') {
                        simulationTracer.emit(SIMULATION_TRACE_TYPES.DIAGNOSTIC_EMITTED, {
                            stage: 'SYNTAX_ANALYSIS',
                            line: typeof entry.line === 'number' ? entry.line : null,
                            column: typeof entry.column === 'number' ? entry.column : null,
                            payload: {
                                message: entry.message,
                                suggestion: entry.suggestion || null,
                                severity: entry.severity || 'error',
                                code: entry.code || null
                            }
                        });
                    }
                }
            }
            return originalPush.apply(this, entries);
        },
        enumerable: false,
        writable: true,
        configurable: true
    });
    return list;
}

class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.pos = 0;
        this.errors = instrumentErrorList([]);
        this.blockStack = [];  // LIFO stack for block validation
        this.tracedLines = 0;
    }

    // ── Simulation instrumentation ─────────────────────────────
    // Every helper below is guarded on simulationTracer.enabled so that an
    // untraced compile allocates nothing beyond the AST itself.

    emit(type, line, column, payload) {
        simulationTracer.emit(type, {
            stage: 'SYNTAX_ANALYSIS',
            line: line,
            column: column,
            payload: payload
        });
    }

    // Statement nodes are recorded exactly once, where they are built.
    traced(node) {
        if (simulationTracer.enabled && node) {
            this.emit(SIMULATION_TRACE_TYPES.NODE_CREATED, node.line, node.column === undefined ? null : node.column, {
                nodeType: node.type,
                line: node.line,
                bodySize: node.body ? node.body.length : undefined,
                depth: this.blockStack.length
            });
        }
        return node;
    }

    openBlock(type, line, column) {
        const frame = { type: type, line: line, column: column === undefined ? null : column };
        this.blockStack.push(frame);
        if (simulationTracer.enabled) {
            this.emit(SIMULATION_TRACE_TYPES.BLOCK_PUSH, line, frame.column, { blockType: type, depth: this.blockStack.length });
        }
        return frame;
    }

    peek(offset) {
        const idx = this.pos + (offset || 0);
        return idx < this.tokens.length ? this.tokens[idx] : { type: TOKEN_TYPES.EOF, value: '', line: -1, column: null };
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
        if (simulationTracer.enabled) {
            simulationTracer.emit(SIMULATION_TRACE_TYPES.STAGE_START, { stage: 'SYNTAX_ANALYSIS', line: null, column: null, payload: { tokenCount: this.tokens.length } });
        }
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
            this.errors.push({ line: firstNonNewline.line || 1, column: firstNonNewline.column === undefined ? null : firstNonNewline.column, message: 'Missing BEGIN statement.', suggestion: suggestion });
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
                this.traced(stmt);
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
            this.errors.push({ line: this.peek().line, column: this.peek().column, message: 'Unexpected code after END.', suggestion: 'END must be the last statement.' });
        }

        // ▸ MANDATORY BOOKEND: Reject if END is missing
        if (!foundEnd) {
            const lastLine = this.tokens.length > 0 ? this.tokens[this.tokens.length - 1].line : 1;
            this.errors.push({ line: lastLine, message: 'Missing END statement.', suggestion: 'Your pseudocode must end with END on the last line.' });
        }

        // ▸ LIFO STACK VALIDATION: Report any unclosed blocks
        while (this.blockStack.length > 0) {
            const unclosed = this.blockStack.pop();
            if (simulationTracer.enabled) {
                this.emit(SIMULATION_TRACE_TYPES.BLOCK_MISMATCH, unclosed.line, unclosed.column, {
                    blockType: unclosed.type,
                    reason: 'unclosed',
                    depth: this.blockStack.length
                });
            }
            this.errors.push({
                line: unclosed.line,
                column: unclosed.column,
                message: 'Unclosed ' + unclosed.type + ' block (opened on line ' + unclosed.line + ').',
                suggestion: 'Add END ' + unclosed.type + ' to close this block.'
            });
        }

        const astResult = { type: 'Program', body: body, errors: this.errors };
        validateExpressionTree(astResult);
        compilerTrace.emit({ type: 'AST_CREATED', stage: 'SYNTAX_ANALYSIS', status: this.errors.length > 0 ? 'ERROR' : 'SUCCESS', data: { nodeCount: countAstNodes(astResult), errorCount: this.errors.length, errors: this.errors, blockStack: this.blockStack.slice() } });
        if (simulationTracer.enabled) {
            simulationTracer.emit(SIMULATION_TRACE_TYPES.STAGE_END, {
                stage: 'SYNTAX_ANALYSIS',
                line: null,
                column: null,
                payload: { nodeCount: countAstNodes(astResult), errorCount: this.errors.length, depth: this.blockStack.length }
            });
        }
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
            this.errors.push({ line: t.line, column: t.column, message: 'Unrecognized statement: ' + t.value, suggestion: 'Use a supported statement such as SET, DISPLAY, IF, FOR or WHILE.' });
            // Recover at the statement boundary instead of reporting every token.
            while (this.peek().type !== TOKEN_TYPES.NEWLINE && this.peek().type !== TOKEN_TYPES.EOF) this.consume();
        }
        return null;
    }

    // ── DECLARE x AS INTEGER ──
    parseDeclare() {
        const kw = this.consume();
        const id = this.match(TOKEN_TYPES.IDENTIFIER);
        if (!id) {
            this.errors.push({ line: kw.line, column: kw.column, message: 'Expected variable name after DECLARE.', suggestion: 'Example: DECLARE x AS INTEGER' });
            return null;
        }
        if (!this.match(TOKEN_TYPES.KEYWORD, 'AS')) {
            this.errors.push({ line: kw.line, column: kw.column, message: 'Expected AS after variable name in DECLARE.', suggestion: 'Example: DECLARE ' + id.value + ' AS INTEGER' });
        }
        const typeToken = this.peek();
        if (['INTEGER', 'FLOAT', 'REAL', 'STRING', 'CHAR', 'CHARACTER', 'BOOLEAN', 'BOOL', 'ARRAY'].includes(typeToken.value)) this.consume();
        else this.errors.push({ line: kw.line, column: kw.column, message: 'Unsupported or missing declaration type.', suggestion: 'Use INTEGER, FLOAT, REAL, STRING, BOOLEAN or ARRAY.' });
        return { type: 'DeclareStatement', id: id.value, varType: typeToken ? typeToken.value : 'UNKNOWN', line: kw.line };
    }

    // ── SET x TO expr  →  x = expr ──
    // Modified to detect array assignments (e.g. SET Numbers[j] = Numbers[j + 1])
    parseSet() {
        const kw = this.consume();
        const id = this.match(TOKEN_TYPES.IDENTIFIER);
        if (!id) {
            this.errors.push({ line: kw.line, column: kw.column, message: 'Expected variable name after SET.', suggestion: 'Example: SET x TO 5' });
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
                    this.errors.push({ line: kw.line, column: kw.column, message: 'Expected TO or = after variable name.' });
                }
                if (nextTok.type === TOKEN_TYPES.KEYWORD || nextTok.type === TOKEN_TYPES.IDENTIFIER) {
                    const hint = suggestSentinel(nextTok.value, ['TO']);
                    if (hint) {
                        this.errors.push({ line: kw.line, column: kw.column, message: 'Expected TO in SET assignment.', suggestion: 'Did you mean "' + hint + '"? Use: SET ' + id.value + ' TO value' });
                        this.consume(); // skip the misspelled word
                    } else {
                        this.errors.push({ line: kw.line, column: kw.column, message: 'Expected TO after variable name.', suggestion: 'Use: SET ' + id.value + ' TO value' });
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
        else this.errors.push({ line: id.line, column: id.column, message: 'Missing closing ] in assignment.' });

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
            this.errors.push({ line: kw.line, column: kw.column, message: 'Expected variable name after INPUT.', suggestion: 'Example: INPUT x' });
            return null;
        }
        return { type: 'InputStatement', id: id.value, prompt: null, line: kw.line };
    }

    // ── CFG Rule: IfStmt → IF Expression THEN Block [ELSE Block] END IF ──
    // Sentinel enforcement: THEN is mandatory.
    parseIf() {
        const kw = this.consume(); // IF
        this.openBlock('IF', kw.line, kw.column); // LIFO push

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
            this.errors.push({ line: kw.line, column: kw.column, message: 'IF statement missing sentinel keyword THEN.', suggestion: suggestion });
        }
        this.skipNewlines();

        const body = this.parseBlock(['ELSE', 'ENDIF', 'END']);

        const elseIfs = [];
        while (this.peek().value === 'ELSE' && this.peek(1).value === 'IF') {
            this.consume(); // ELSE
            const kwIf = this.consume(); // IF
            const cond = this.collectLineTokens(['THEN']);
            if (!this.match(TOKEN_TYPES.KEYWORD, 'THEN')) {
                this.errors.push({ line: kwIf.line, column: kwIf.column, message: 'ELSE IF statement missing sentinel keyword THEN.', suggestion: 'Use: ELSE IF condition THEN' });
            }
            this.skipNewlines();
            const elifBody = this.parseBlock(['ELSE', 'ENDIF', 'END']);
            elseIfs.push({ condition: cond, body: elifBody, line: kwIf.line, column: kwIf.column === undefined ? null : kwIf.column });
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
                this.errors.push({ line: kw.line, column: kw.column, message: 'Unclosed IF block (opened on line ' + kw.line + ').', suggestion: 'Add END IF to close this block.' });
            }
        } else {
            this.errors.push({ line: kw.line, column: kw.column, message: 'Unclosed IF block (opened on line ' + kw.line + ').', suggestion: 'Add END IF to close this block.' });
        }

        return { type: 'IfStatement', condition: cond, body: body, elseIfs: elseIfs, elseBody: elseBody, line: kw.line };
    }

    // ── CFG Rule: WhileStmt → WHILE Expression DO Block END WHILE ──
    // Sentinel enforcement: DO is mandatory.
    parseWhile() {
        const kw = this.consume(); // WHILE
        this.openBlock('WHILE', kw.line, kw.column); // LIFO push

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
            this.errors.push({ line: kw.line, column: kw.column, message: 'WHILE statement missing sentinel keyword DO.', suggestion: suggestion });
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
                this.errors.push({ line: kw.line, column: kw.column, message: 'Unclosed WHILE block (opened on line ' + kw.line + ').', suggestion: 'Add END WHILE to close this block.' });
            }
        } else {
            this.errors.push({ line: kw.line, column: kw.column, message: 'Unclosed WHILE block (opened on line ' + kw.line + ').', suggestion: 'Add END WHILE to close this block.' });
        }

        return { type: 'WhileStatement', condition: cond, body: body, line: kw.line };
    }

    // ── CFG Rule: ForStmt → FOR id FROM expr TO expr DO Block END FOR ──
    parseFor() {
        const kw = this.consume(); // FOR
        this.openBlock('FOR', kw.line, kw.column); // LIFO push

        if (this.peek().value === 'EACH') {
            this.consume();
            const id = this.match(TOKEN_TYPES.IDENTIFIER);
            if (!id) this.errors.push({ line: kw.line, column: kw.column, message: 'FOR EACH requires an iterator name.' });
            if (!this.match(TOKEN_TYPES.KEYWORD, 'IN')) this.errors.push({ line: kw.line, column: kw.column, message: 'FOR EACH requires IN.' });
            const iterable = this.collectLineTokens(['DO']);
            if (!this.match(TOKEN_TYPES.KEYWORD, 'DO')) {
                this.errors.push({ line: kw.line, column: kw.column, message: 'FOR EACH missing sentinel keyword DO.', suggestion: 'Use: FOR EACH item IN list DO' });
            }
            this.skipNewlines();
            const body = this.parseBlock(['ENDFOR', 'END']);
            this.consumeEndBlock('FOR', kw.line, kw.column);
            return { type: 'ForEachStatement', iterator: id ? id.value : '_', iterable: iterable, body: body, line: kw.line };
        }

        // FOR i FROM start TO end DO
        const id = this.match(TOKEN_TYPES.IDENTIFIER);
        if (!id) this.errors.push({ line: kw.line, column: kw.column, message: 'FOR requires an iterator name.' });
        if (!this.match(TOKEN_TYPES.KEYWORD, 'FROM')) {
            this.errors.push({ line: kw.line, column: kw.column, message: 'Invalid FOR header: expected FROM after the iterator.', suggestion: 'Use FOR x FROM 1 TO 10 DO, or WHILE x <= 10 DO with END WHILE for a condition.' });
            this.collectLineTokens();
            this.skipNewlines();
            this.parseBlock(['ENDFOR', 'END']);
            this.consumeEndBlock('FOR', kw.line, kw.column);
            return null;
        }
        const startExpr = this.collectLineTokens(['TO']);
        if (!this.match(TOKEN_TYPES.KEYWORD, 'TO')) this.errors.push({ line: kw.line, column: kw.column, message: 'FOR requires TO.' });
        const endExpr = this.collectLineTokens(['STEP', 'DO']);
        const stepExpr = this.match(TOKEN_TYPES.KEYWORD, 'STEP') ? this.collectLineTokens(['DO']) : null;
        if (!this.match(TOKEN_TYPES.KEYWORD, 'DO')) {
            this.errors.push({ line: kw.line, column: kw.column, message: 'FOR statement missing sentinel keyword DO.', suggestion: 'Use: FOR i FROM 1 TO 10 DO' });
        }
        this.skipNewlines();
        const body = this.parseBlock(['ENDFOR', 'END']);
        this.consumeEndBlock('FOR', kw.line, kw.column);

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
        this.openBlock(kw.value, kw.line, kw.column);
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
        this.consumeEndBlock(kw.value, kw.line, kw.column);
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
                this.traced(stmt);
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
    consumeEndBlock(type, openLine, openColumn) {
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
                this.errors.push({ line: openLine, column: openColumn === undefined ? null : openColumn, message: 'Unclosed ' + type + ' block (opened on line ' + openLine + ').', suggestion: 'Add END ' + type + ' to close this block.' });
            }
        } else {
            this.errors.push({ line: openLine, column: openColumn === undefined ? null : openColumn, message: 'Unclosed ' + type + ' block (opened on line ' + openLine + ').', suggestion: 'Add END ' + type + ' to close this block.' });
        }
    }

    // ── LIFO stack pop with mismatch detection ──
    popBlock(expectedType, openLine, openColumn) {
        if (this.blockStack.length === 0) {
            const line = openLine === undefined ? 1 : openLine;
            const column = openColumn === undefined ? null : openColumn;
            if (simulationTracer.enabled) {
                this.emit(SIMULATION_TRACE_TYPES.BLOCK_MISMATCH, line, column, { blockType: expectedType, reason: 'orphan_end' });
            }
            this.errors.push({ line: line, column: column, message: 'Unexpected END ' + expectedType + '. No matching ' + expectedType + ' block to close.' });
            return;
        }
        const top = this.blockStack[this.blockStack.length - 1];
        if (top.type === expectedType) {
            const popped = this.blockStack.pop();
            if (simulationTracer.enabled) {
                this.emit(SIMULATION_TRACE_TYPES.BLOCK_POP, popped.line, popped.column, { blockType: popped.type, depth: this.blockStack.length });
            }
        } else {
            // Mismatch: e.g., opened FOR but closing IF
            const line = openLine === undefined ? 1 : openLine;
            const column = openColumn === undefined ? null : openColumn;
            if (simulationTracer.enabled) {
                this.emit(SIMULATION_TRACE_TYPES.BLOCK_MISMATCH, line, column, { blockType: expectedType, expected: top.type, openedLine: top.line, reason: 'type_mismatch' });
            }
            this.errors.push({
                line: line,
                column: column,
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

const SEM__NUMBER_KINDS = new Set(['INTEGER', 'INT', 'FLOAT', 'REAL', 'NUMERIC', 'NUMBER', 'DOUBLE']);
const SEM__STRING_KINDS = new Set(['STRING', 'CHAR', 'CHARACTER', 'TEXT']);
const SEM__BOOLEAN_KINDS = new Set(['BOOLEAN', 'BOOL', 'LOGICAL']);
const SEM__ERROR_CODES = {
    mismatch: 'SEM_TYPE_MISMATCH',
    operands: 'SEM_INVALID_OPERANDS',
    condition: 'SEM_CONDITION_NOT_BOOLEAN',
    undeclared: 'SEM_UNDECLARED_VARIABLE'
};
const SEM__BUILTIN_RETURNS = {
    int: 'numeric', float: 'numeric', ord: 'numeric', len: 'numeric', abs: 'numeric',
    round: 'numeric', min: 'numeric', max: 'numeric', sum: 'numeric', pow: 'numeric',
    str: 'string', chr: 'string', input: 'string',
    bool: 'boolean', all: 'boolean', any: 'boolean', isinstance: 'boolean',
    range: 'array', list: 'array', sorted: 'array', reversed: 'array', enumerate: 'array',
    zip: 'array', tuple: 'array', set: 'array', dict: 'array'
};

function semanticKindOf(raw) {
    const t = String(raw || '').toUpperCase().trim();
    if (t.startsWith('ARRAY')) return 'array';
    if (SEM__NUMBER_KINDS.has(t)) return 'numeric';
    if (SEM__STRING_KINDS.has(t)) return 'string';
    if (SEM__BOOLEAN_KINDS.has(t)) return 'boolean';
    return 'unknown';
}

function semanticDisplayKind(kind) {
    const labels = { numeric: 'a number', string: 'text', boolean: 'a boolean (TRUE/FALSE)', array: 'an array', none: 'NULL' };
    return labels[kind] || 'an unknown value';
}

function semanticIsRealLiteral(value) {
    return /^-?\d*\.\d+/.test(String(value));
}

function semanticBuiltinKind(name) {
    return SEM__BUILTIN_RETURNS[String(name).toLowerCase()] || 'unknown';
}

class SemanticAnalyzer {
    constructor() {
        this.symbolTable = new Map(); // id -> { type, declaredType?, declaredKind?, elementType?, inferredType?, assigned, strict, implicit? }
        this.warnings = [];
        this.scopeDepth = 0;
    }

    // ── Simulation instrumentation ─────────────────────────────
    // All four helpers are no-ops unless the simulator is running.

    emit(type, line, payload) {
        simulationTracer.emit(type, {
            stage: 'SEMANTIC_ANALYSIS',
            line: line === undefined ? null : line,
            column: null,
            payload: payload
        });
    }

    // Symbol writes go through one sink so declared/implicit/parameter and
    // inferred entries are all visible to the simulator with a reason.
    declare(id, entry, reason, line) {
        this.symbolTable.set(id, entry);
        if (simulationTracer.enabled) {
            this.emit(SIMULATION_TRACE_TYPES.SYMBOL_DECLARED, line, {
                name: id,
                reason: reason,
                symbolType: entry.type,
                declaredType: entry.declaredType === undefined ? null : entry.declaredType,
                inferredType: entry.inferredType === undefined ? null : entry.inferredType,
                assigned: entry.assigned === true,
                implicit: entry.implicit === true,
                scopeDepth: this.scopeDepth
            });
        }
        return entry;
    }

    // Every read is recorded with whether it resolved, which is what makes
    // "used before it exists" visible rather than merely warned about.
    lookup(id, line) {
        const entry = this.symbolTable.get(id);
        if (simulationTracer.enabled) {
            this.emit(SIMULATION_TRACE_TYPES.SYMBOL_LOOKUP, line, {
                name: id,
                found: entry !== undefined,
                symbolType: entry ? entry.type : null,
                scopeDepth: this.scopeDepth
            });
        }
        return entry;
    }

    // Assignment updates the existing entry in place; record the change
    // rather than re-emitting a declaration.
    assign(id, mutate, line) {
        const entry = this.symbolTable.get(id);
        if (!entry) return undefined;
        const before = { type: entry.type, inferredType: entry.inferredType, assigned: entry.assigned };
        mutate(entry);
        if (simulationTracer.enabled) {
            this.emit(SIMULATION_TRACE_TYPES.SYMBOL_UPDATED, line, {
                name: id,
                before: before,
                after: { type: entry.type, inferredType: entry.inferredType, assigned: entry.assigned },
                scopeDepth: this.scopeDepth
            });
        }
        return entry;
    }

    // Detached symbol view for periodic checkpoints and for the inspector.
    symbolSnapshot() {
        return Object.fromEntries(this.symbolTable);
    }

analyze(ast) {
        this.ast = ast;
        this.warnings = [];
        this.semanticErrorCount = 0;
        compilerTrace.emit({ type: 'SEMANTIC_START', stage: 'SEMANTIC_ANALYSIS', status: 'RUNNING', data: {} });
        if (simulationTracer.enabled) {
            simulationTracer.emit(SIMULATION_TRACE_TYPES.STAGE_START, { stage: 'SEMANTIC_ANALYSIS', line: null, column: null, payload: { nodeCount: 0 } });
        }
        this.visitNode(ast);
        const status = this.semanticErrorCount > 0 ? 'ERROR' : (this.warnings.length > 0 ? 'WARNING' : 'SUCCESS');
        compilerTrace.emit({ type: 'SEMANTIC_COMPLETE', stage: 'SEMANTIC_ANALYSIS', status: status, data: { errorCount: this.semanticErrorCount, warningCount: this.warnings.length, warnings: this.warnings, symbolTable: Object.fromEntries(this.symbolTable) } });
        if (simulationTracer.enabled) {
            simulationTracer.emit(SIMULATION_TRACE_TYPES.STAGE_END, {
                stage: 'SEMANTIC_ANALYSIS',
                line: null,
                column: null,
                payload: { errorCount: this.semanticErrorCount, warningCount: this.warnings.length, symbolCount: this.symbolTable.size }
            });
        }
        return this.warnings;
    }

    // ── Structured issue helpers ──────────────────────────────
    typeError(node, code, problem, received, expected, suggestion) {
        const line = (node && node.line) || 1;
        this.semanticErrorCount++;
        this.ast.errors.push({
            line,
            code,
            severity: 'error',
            stage: 'Semantic Analysis',
            type: code === 'SEM_TYPE_MISMATCH' ? 'Type Error' : 'Logic Error',
            message: problem,
            problem,
            expected,
            received,
            suggestion
        });
    }

    typeWarn(node, code, problem, suggestion) {
        const line = (node && node.line) || 1;
        this.warnings.push({ line, code, severity: 'warning', stage: 'Semantic Analysis', message: problem, problem, suggestion });
        if (simulationTracer.enabled) {
            this.emit(SIMULATION_TRACE_TYPES.TYPE_WARNING, line, { code: code, message: problem, suggestion: suggestion || null, symbol: node && node.id ? node.id : null });
        }
    }

    sym(id, line) {
        return this.lookup(id, line === undefined ? null : line);
    }

    // ── Static type inference (strict only for DECLAREd symbols) ──
    typeOf(node) {
        if (!node || typeof node !== 'object') return { kind: 'unknown', literal: false };
        switch (node.type) {
            case 'Literal': {
                if (node.kind === 'NUMBER') return { kind: 'numeric', literal: true, real: semanticIsRealLiteral(node.value) };
                if (node.kind === 'STRING') return { kind: 'string', literal: true };
                const up = String(node.value).toUpperCase();
                if (up === 'TRUE' || up === 'FALSE') return { kind: 'boolean', literal: true };
                if (up === 'NULL' || up === 'NONE') return { kind: 'none', literal: true };
                return { kind: 'unknown', literal: true };
            }
            case 'Identifier': {
                const name = String(node.name);
                if (name === 'True' || name === 'False') return { kind: 'boolean', literal: true };
                if (name === 'None') return { kind: 'none', literal: true };
                const entry = this.sym(name);
                if (!entry || entry.type === 'unknown' || entry.type === 'function') return { kind: 'unknown' };
                return { kind: entry.type };
            }
            case 'GroupExpression': return this.typeOf(node.expression);
            case 'TupleExpression': return { kind: 'unknown' };
            case 'ListExpression': {
                let element = 'unknown';
                if (node.items && node.items.length) {
                    const seen = [];
                    for (const item of node.items) {
                        const k = this.typeOf(item).kind;
                        if (k !== 'unknown' && k !== 'none') seen.push(k);
                    }
                    const unique = new Set(seen);
                    element = unique.size === 1 ? [...unique][0] : (seen.length ? 'mixed' : 'unknown');
                }
                return { kind: 'array', element };
            }
            case 'UnaryExpression': {
                if (String(node.operator) === 'not') return { kind: 'boolean' };
                const inner = this.typeOf(node.argument);
                if (inner.kind === 'string' || inner.kind === 'boolean' || inner.kind === 'array') return { kind: 'numeric' };
                return { kind: 'numeric' };
            }
            case 'BinaryExpression': {
                const op = String(node.operator).toLowerCase();
                if (['==', '!=', '<', '<=', '>', '>=', 'is', 'is not', 'in', 'not in', 'and', 'or'].includes(op)) return { kind: 'boolean' };
                const L = this.typeOf(node.left);
                const R = this.typeOf(node.right);
                if (op === '+') {
                    if (L.kind === 'string' || R.kind === 'string') return { kind: 'string' };
                    if (L.kind === 'numeric' || R.kind === 'numeric') return { kind: 'numeric' };
                    return { kind: 'unknown' };
                }
                if (op === '*') {
                    if (L.kind === 'string' || R.kind === 'string') return { kind: 'string' };
                    return { kind: 'numeric' };
                }
                if (['-', '/', '//', '%', '**', '|', '&', '^'].includes(op)) return { kind: 'numeric' };
                return { kind: 'unknown' };
            }
            case 'CompareExpression':
                return { kind: 'boolean' };
            case 'CallExpression': {
                const callee = node.callee && node.callee.type === 'Identifier' ? node.callee.name : null;
                if (callee) {
                    const builtin = semanticBuiltinKind(callee);
                    if (builtin !== 'unknown') return { kind: builtin };
                    // Cast-like user identity functions mirror their single argument when it is known.
                    const args = node.arguments || [];
                    if (args.length === 1) {
                        const arg = this.typeOf(args[0]);
                        if (arg.kind !== 'unknown' && arg.kind !== 'none') return { kind: arg.kind };
                    }
                }
                return { kind: 'unknown' };
            }
            case 'SubscriptExpression': {
                const base = this.typeOf(node.object);
                if (base.kind === 'string') return { kind: 'string' };
                if (base.kind === 'array') return { kind: base.element === 'mixed' || base.element === 'unknown' ? 'unknown' : base.element };
                if (node.object && node.object.type === 'Identifier') {
                    const entry = this.sym(node.object.name);
                    if (entry && entry.elementType) return { kind: entry.elementType };
                }
                if (base.kind === 'numeric') return { kind: 'unknown' };
                return { kind: 'unknown' };
            }
            case 'NumericPredicate':
                return { kind: 'boolean' };
            case 'AttributeExpression':
            case 'SliceExpression':
            default:
                return { kind: 'unknown' };
        }
    }

    isKnownKind(kind) { return kind !== 'unknown' && kind !== 'none'; }

    // ── Assignment compatibility (strict for DECLAREd targets) ──
    checkAssignment(node, entry, inferred) {
        const expected = entry.declaredKind || 'unknown';
        if (expected === 'unknown') return;
        const received = inferred.kind;
        if (!this.isKnownKind(received)) return;

        if (received === expected) {
            if (expected === 'numeric' && inferred.literal && node.expr && node.expr.ast && node.expr.ast.type === 'Literal') {
                const declIsInt = String(entry.declaredType || '').toUpperCase().includes('INTEGER');
                const realValue = inferred.real === true;
                if (declIsInt && realValue) {
                    this.typeWarn(node, SEM__ERROR_CODES.mismatch, "REAL value " + node.expr.ast.value + " assigned to INTEGER variable '" + node.id + "' loses its fractional part.", 'Assign a whole number (no decimal point) to INTEGER variables.');
                } else if (!declIsInt && !realValue) {
                    this.typeWarn(node, SEM__ERROR_CODES.mismatch, 'INTEGER value ' + node.expr.ast.value + ' assigned to REAL variable ' + node.id + ', which is quoted for a decimal value.', 'Use a decimal form (for example ' + node.expr.ast.value + '.0) or keep the variable AS INTEGER.');
                }
            }
            if (expected === 'array' && node.expr && node.expr.ast && node.expr.ast.type === 'ListExpression') {
                const seen = new Set(node.expr.ast.items.map(it => this.typeOf(it).kind).filter(k => this.isKnownKind(k)));
                if (seen.size > 1) this.typeWarn(node, SEM__ERROR_CODES.mismatch, "Array '" + node.id + "' is assigned elements of mixed types (" + [...seen].map(semanticDisplayKind).join(' and ') + ').', 'Keep every element in one array the same type.');
            }
            return;
        }

        this.typeError(node, SEM__ERROR_CODES.mismatch,
            "Type mismatch: cannot assign " + semanticDisplayKind(received) + " to variable '" + node.id + "', which is DECLAREd " + semanticDisplayKind(expected) + ".",
            semanticDisplayKind(received),
            semanticDisplayKind(expected),
            'DECLARE ' + node.id + ' AS ' + (expected === 'numeric' ? 'INTEGER or REAL' : expected === 'string' ? 'STRING' : expected === 'boolean' ? 'BOOLEAN' : expected === 'array' ? 'ARRAY' : 'UNKNOWN') + ' instead, or convert the value first (INT(), FLOAT(), STRING() or BOOL()).'
        );
    }

    // ── Operator use (only when both operands have a known type) ──
    checkBinaryNode(n) {
        if (!n || n.type !== 'BinaryExpression') return;
        const L = this.typeOf(n.left);
        const R = this.typeOf(n.right);
        const op = String(n.operator).toLowerCase();
        if (!['+', '-', '*', '/', '//', '%', '**'].includes(op)) return;
        if (!this.isKnownKind(L.kind) || !this.isKnownKind(R.kind)) return;

        if (L.kind === 'boolean' || R.kind === 'boolean') {
            this.typeError(n, SEM__ERROR_CODES.operands,
                "Operator '" + op + "' cannot be used with a boolean value.",
                'a boolean (TRUE/FALSE)', 'numbers or text',
                'Test the boolean separately: IF flag THEN ... END IF (booleans are not arithmetic values).'
            );
            return;
        }
        const bothString = L.kind === 'string' && R.kind === 'string';
        const oneString = (L.kind === 'string') !== (R.kind === 'string');
        if (op === '+') {
            if (oneString) {
                this.typeError(n, SEM__ERROR_CODES.operands,
                    "Cannot combine text and a number with '+'. Use a comma to print each item, or convert with STR().",
                    'text + number', 'a single type',
                    'DISPLAY "Age:", age — or — DISPLAY "Age: " + STR(age)'
                );
            }
            return;
        }
        if (bothString) {
            this.typeError(n, SEM__ERROR_CODES.operands,
                "Operator '" + op + "' cannot be applied to two text values; only '+' joins text.",
                'text ' + op + ' text', 'converted numbers (INT()/FLOAT()) or STR() first'
            );
            return;
        }
        if (oneString && op !== '*') {
            this.typeError(n, SEM__ERROR_CODES.operands,
                "Operator '" + op + "' cannot mix text and numbers. Convert the text with INT()/FLOAT() or turn numbers into text with STR().",
                'text ' + op + ' number', 'the same type on both sides'
            );
        }
    }

    validateExpressionTypes(exprNode) {
        if (!exprNode || !exprNode.ast) return;
        this.walkExpressionTree(exprNode.ast);
    }

    walkExpressionTree(n) {
        if (!n || typeof n !== 'object') return;
        if (n.type === 'BinaryExpression') this.checkBinaryNode(n);
        if (Array.isArray(n.items)) n.items.forEach(i => this.walkExpressionTree(i));
        for (const key of ['left', 'right', 'argument', 'object', 'callee', 'expression', 'index']) {
            if (n[key]) this.walkExpressionTree(n[key]);
        }
        if (Array.isArray(n.arguments)) n.arguments.forEach(a => this.walkExpressionTree(a));
        if (Array.isArray(n.comparators)) n.comparators.forEach(c => this.walkExpressionTree(c));
        if (n.slice) {
            this.walkExpressionTree(n.slice.start);
            this.walkExpressionTree(n.slice.stop);
            this.walkExpressionTree(n.slice.step);
        }
    }

    checkCondition(condNode, node) {
        if (!condNode || !condNode.ast) return;
        const cond = this.typeOf(condNode.ast);
        if (cond.kind === 'numeric' || cond.kind === 'string' || cond.kind === 'array') {
            this.typeError(node, SEM__ERROR_CODES.condition,
                "The condition is " + semanticDisplayKind(cond.kind) + " but a condition must be a comparison or a boolean value.",
                semanticDisplayKind(cond.kind), 'a comparison (relational operator) or TRUE/FALSE',
                'Add a comparison, for example IF ' + String(condNode.ast.type === 'Literal' ? condNode.ast.value : 'x') + ' > 0 THEN, or use a BOOLEAN variable.'
            );
        }
    }

    // ── AST traversal ─────────────────────────────────────────
    visitNode(node) {
        if (!node) return;
        switch (node.type) {
            case 'Program':
                node.body.forEach(n => this.visitNode(n));
                break;

            case 'DeclareStatement': {
                const declaredKind = semanticKindOf(node.varType);
                this.declare(node.id, {
                    name: node.id,
                    type: declaredKind,
                    declaredType: node.varType,
                    declaredKind,
                    elementType: null,
                    inferredType: 'unknown',
                    assigned: false,
                    strict: true
                }, 'declare', node.line);
                break;
            }

            case 'AssignmentStatement': {
                const entry = this.sym(node.id, node.line);
                const inferred = this.typeOf(node.expr && node.expr.ast);
                if (!entry) {
                    this.typeWarn(node, SEM__ERROR_CODES.undeclared,
                        "Variable '" + node.id + "' used without DECLARE.",
                        'Add: DECLARE ' + node.id + ' AS INTEGER (or appropriate type)'
                    );
                    this.declare(node.id, {
                        name: node.id,
                        type: inferred.kind === 'none' ? 'unknown' : inferred.kind,
                        inferredType: inferred.kind,
                        assigned: true,
                        strict: false
                    }, 'implicit_from_assignment', node.line);
                } else {
                    this.assign(node.id, target => {
                        this.checkAssignment(node, target, inferred);
                        target.inferredType = inferred.kind;
                        target.assigned = true;
                        if (target.type === 'unknown' && inferred.kind !== 'none' && inferred.kind !== 'unknown') target.type = inferred.kind;
                    }, node.line);
                }
                this.checkExpr(node.expr);
                this.validateExpressionTypes(node.expr);
                break;
            }

            case 'ArrayAssignStatement': {
                this.checkExpr(node.index);
                this.checkExpr(node.expr);
                this.validateExpressionTypes(node.index);
                this.validateExpressionTypes(node.expr);
                const entry = this.sym(node.id, node.line);
                if (!entry) {
                    this.typeWarn(node, SEM__ERROR_CODES.undeclared,
                        "Array '" + node.id + "' not declared.",
                        'Add: DECLARE ' + node.id + ' AS ARRAY'
                    );
                    this.declare(node.id, { name: node.id, type: 'array', inferredType: 'array', assigned: true, strict: false }, 'implicit_from_index_assignment', node.line);
                    break;
                }
                if (entry.declaredKind && entry.declaredKind !== 'unknown' && entry.declaredKind !== 'array') {
                    const val = this.typeOf(node.expr && node.expr.ast);
                    if (this.isKnownKind(val.kind)) {
                        this.typeError(node, SEM__ERROR_CODES.mismatch,
                            "Cannot index '" + node.id + "' with [ ] because it was DECLAREd " + semanticDisplayKind(entry.declaredKind) + ", not an array.",
                            semanticDisplayKind(entry.declaredKind), 'an array', 'DECLARE ' + node.id + ' AS ARRAY'
                        );
                    }
                }
                break;
            }

            case 'PrintStatement':
                this.checkExpr(node.expr);
                this.validateExpressionTypes(node.expr);
                break;

            case 'InputStatement': {
                const entry = this.sym(node.id, node.line);
                if (entry) {
                    node.inputType = entry.declaredType || '';
                } else {
                    node.inputType = '';
                    this.declare(node.id, { name: node.id, type: 'string', inferredType: 'string', assigned: true, strict: false }, 'implicit_from_input', node.line);
                }
                break;
            }

            case 'IfStatement': {
                this.checkCondition(node.condition, node);
                this.checkExpr(node.condition);
                this.validateExpressionTypes(node.condition);
                node.body.forEach(n => this.visitNode(n));
                if (node.elseIfs) {
                    node.elseIfs.forEach(eif => {
                        this.checkCondition(eif.condition, eif);
                        this.checkExpr(eif.condition);
                        this.validateExpressionTypes(eif.condition);
                        eif.body.forEach(n => this.visitNode(n));
                    });
                }
                if (node.elseBody) node.elseBody.forEach(n => this.visitNode(n));
                break;
            }

            case 'WhileStatement':
                this.checkCondition(node.condition, node);
                this.checkExpr(node.condition);
                this.validateExpressionTypes(node.condition);
                node.body.forEach(n => this.visitNode(n));
                break;

            case 'ForStatement':
                this.declare(node.iterator, { name: node.iterator, type: 'numeric', inferredType: 'numeric', assigned: true, strict: false, implicit: true }, 'loop_iterator', node.line);
                this.checkExpr(node.startExpr);
                this.checkExpr(node.endExpr);
                this.checkExpr(node.stepExpr);
                this.validateExpressionTypes(node.startExpr);
                this.validateExpressionTypes(node.endExpr);
                this.validateExpressionTypes(node.stepExpr);
                node.body.forEach(n => this.visitNode(n));
                break;

            case 'ForEachStatement': {
                this.checkExpr(node.iterable);
                this.validateExpressionTypes(node.iterable);
                const iterKind = this.typeOf(node.iterable && node.iterable.ast);
                const elementKind = iterKind.kind === 'array' && iterKind.element !== 'mixed' && iterKind.element !== 'unknown' ? iterKind.element : 'unknown';
                this.declare(node.iterator, { name: node.iterator, type: elementKind === 'unknown' ? 'unknown' : elementKind, inferredType: elementKind, assigned: true, strict: false, implicit: true }, 'for_each_iterator', node.line);
                node.body.forEach(n => this.visitNode(n));
                break;
            }

            case 'FunctionDef': {
                this.declare(node.name, { name: node.name, type: 'function', strict: false }, 'function', node.line);
                const outerScope = this.symbolTable;
                this.symbolTable = new Map(outerScope);
                this.scopeDepth++;
                for (const token of node.params.tokens) {
                    if (token.type === TOKEN_TYPES.IDENTIFIER) this.declare(token.value, { name: token.value, type: 'unknown', strict: false }, 'parameter', node.line);
                }
                node.body.forEach(n => this.visitNode(n));
                this.scopeDepth--;
                this.symbolTable = outerScope;
                break;
            }

            case 'ReturnStatement':
                this.checkExpr(node.expr);
                this.validateExpressionTypes(node.expr);
                break;

            case 'CallStatement': {
                this.checkExpr(node.args);
                if (node.arguments) node.arguments.forEach(a => this.validateExpressionTypes({ ast: a }));
                break;
            }

            case 'IncDecStatement':
                if (!this.sym(node.id, node.line)) {
                    this.typeWarn(node, SEM__ERROR_CODES.undeclared,
                        "Variable '" + node.id + "' not declared before increment/decrement.",
                        'Add: DECLARE ' + node.id + ' AS INTEGER'
                    );
                }
                break;

            case 'AppendStatement':
                this.checkExpr(node.value);
                this.validateExpressionTypes(node.value);
                if (!this.sym(node.target, node.line)) {
                    this.typeWarn(node, SEM__ERROR_CODES.undeclared,
                        "Array '" + node.target + "' not declared.",
                        'Add: DECLARE ' + node.target + ' AS ARRAY'
                    );
                }
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
            if (!this.sym(t.value, exprNode.line)) this.typeWarn({ line: exprNode.line },
                SEM__ERROR_CODES.undeclared,
                "Undeclared variable '" + t.value + "' in expression.",
                'Assign or declare ' + t.value + ' before using it.'
            );
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
        // Python line number -> { nodeType, sourceLine, synthetic }.
        // Populated only while the simulator is enabled.
        this.sourceMap = null;
        this.currentNode = null;
    }

    ind() {
        return '    '.repeat(this.indentLevel);
    }

    // ── Source mapping ────────────────────────────────────────
    // Every emitted line is attributed to the AST node responsible for it, so
    // a runtime step on Python line N can name the pseudocode statement it came
    // from. Synthetic lines (helper preambles, empty-block `pass`) are marked
    // as such and are never attributed to a user statement.
    emit(text, node, synthetic) {
        this.lines.push(text);
        if (!this.sourceMap) return text;
        const owner = node === undefined ? this.currentNode : node;
        this.sourceMap.push({
            pythonLine: this.lines.length,
            nodeType: owner ? owner.type : null,
            sourceLine: owner && owner.line !== undefined ? owner.line : null,
            indent: this.indentLevel,
            synthetic: synthetic === true,
            text: text
        });
        return text;
    }

    // Preamble lines are compiler helpers, not translations of any statement.
    emitHelper(lines) {
        for (const line of lines) this.emit(line, null, true);
    }

    // Push helper lines to the front, then shift every recorded mapping so it
    // still matches its final line number.
    prependHelpers(lines) {
        if (!lines.length) return;
        this.lines.unshift.apply(this.lines, lines);
        if (!this.sourceMap) return;
        const offset = lines.length;
        for (const entry of this.sourceMap) entry.pythonLine += offset;
        this.sourceMap.unshift.apply(this.sourceMap, lines.map((text, index) => ({
            pythonLine: index + 1,
            nodeType: null,
            sourceLine: null,
            indent: 0,
            synthetic: true,
            text: text
        })));
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
        this.currentNode = null;
        this.sourceMap = simulationTracer.enabled ? [] : null;
        if (simulationTracer.enabled) {
            simulationTracer.emit(SIMULATION_TRACE_TYPES.STAGE_START, { stage: 'CODE_GENERATION', line: null, column: null, payload: { nodeCount: ast.body ? ast.body.length : 0 } });
        }
        for (const node of ast.body) {
            compilerTrace.emit({ type: 'CODEGEN_VISIT', stage: 'CODE_GENERATION', status: 'RUNNING', data: { nodeType: node.type, line: node.line } });
            if (simulationTracer.enabled) {
                simulationTracer.emit(SIMULATION_TRACE_TYPES.CODE_EMITTED, {
                    stage: 'CODE_GENERATION',
                    line: node.line,
                    column: node.column === undefined ? null : node.column,
                    payload: { nodeType: node.type, phase: 'visit' }
                });
            }
            this.visitNode(node);
        }
        if (this.lines.some(line => line.includes(' in _pseudopy_range('))) {
            this.prependHelpers(['def _pseudopy_range(start, stop, step):',
                '    if not all(isinstance(value, int) for value in (start, stop, step)):',
                '        raise TypeError("FOR bounds and STEP must be integers")',
                '    if step == 0:', '        raise ValueError("FOR STEP must not be zero")',
                '    return range(start, stop + (1 if step > 0 else -1), step)', '']);
        }
        if (this.lines.some(line => line.includes('_pseudopy_input_cast(') || line.includes('_pseudopy_input_int(') || line.includes('_pseudopy_input_float('))) {
            this.prependHelpers(['def _pseudopy_input_cast(prompt):',
                '    val = input(prompt)',
                '    try:',
                '        return int(val)',
                '    except ValueError:',
                '        try:',
                '            return float(val)',
                '        except ValueError:',
                '            return val',
                '',
                'def _pseudopy_input_int(prompt):',
                '    while True:',
                '        try:',
                '            return int(input(prompt))',
                '        except ValueError:',
                "            print('Please enter a whole number (INTEGER).')",
                '',
                'def _pseudopy_input_float(prompt):',
                '    while True:',
                '        try:',
                '            return float(input(prompt))',
                '        except ValueError:',
                "            print('Please enter a number (REAL).')", '']);
        }
        const result = this.lines.join('\n');
        compilerTrace.emit({ type: 'CODEGEN_COMPLETE', stage: 'CODE_GENERATION', status: 'SUCCESS', data: { lineCount: this.lines.length, python: result } });
        if (simulationTracer.enabled) {
            simulationTracer.emit(SIMULATION_TRACE_TYPES.STAGE_END, {
                stage: 'CODE_GENERATION',
                line: null,
                column: null,
                payload: { lineCount: this.lines.length, syntheticCount: this.sourceMap ? this.sourceMap.filter(e => e.synthetic).length : 0 }
            });
        }
        return result;
    }

    visitNode(node) {
        if (!node) return;
        const previousNode = this.currentNode;
        this.currentNode = node;
        try {
            this.visitNodeInner(node);
        } finally {
            this.currentNode = previousNode;
        }
    }

    visitNodeInner(node) {
        switch (node.type) {
            case 'DeclareStatement': {
                // Emit a comment + a real Python initializer so the variable exists in scope
                const typeUpper = (node.varType || '').toUpperCase();
                let initVal = '0';  // default: INTEGER / FLOAT / REAL / NUMERIC
                if (['STRING', 'CHAR', 'CHARACTER'].includes(typeUpper)) initVal = '""';
                else if (['BOOLEAN', 'BOOL'].includes(typeUpper)) initVal = 'False';
                else if (['ARRAY'].includes(typeUpper)) initVal = '[]';
                this.emit(this.ind() + '# DECLARE ' + node.id + ' AS ' + node.varType);
                this.emit(this.ind() + node.id + ' = ' + initVal);
                break;
            }

            case 'AssignmentStatement':
                this.emit(this.ind() + node.id + ' = ' + this.exprToStr(node.expr.tokens));
                break;

            case 'ArrayAssignStatement':
                this.emit(this.ind() + node.id + '[' + this.exprToStr(node.index.tokens) + '] = ' + this.exprToStr(node.expr.tokens));
                break;

            case 'PrintStatement': {
                const s = this.smartPrintExpr(node.expr.tokens);
                this.emit(this.ind() + 'print(' + s + ')');
                break;
            }


            case 'InputStatement': {
                const inputType = (node.inputType || '').toUpperCase();
                const isStringNode = inputType === 'STRING';
                const isExplicitNumeric = ['INTEGER', 'FLOAT', 'REAL'].includes(inputType);
                
                let promptStr;
                if (node.prompt && node.prompt.length > 0) {
                    promptStr = node.prompt[0].value;
                } else {
                    promptStr = '"Please enter ' + node.id + ': "';
                }

                if (isExplicitNumeric) {
                    // Strict INPUT: keep asking until the user types a valid number.
                    this.emit(this.ind() + node.id + ' = ' + (inputType === 'INTEGER' ? '_pseudopy_input_int' : '_pseudopy_input_float') + '(' + promptStr + ')');
                } else if (isStringNode) {
                    this.emit(this.ind() + node.id + ' = input(' + promptStr + ')');
                } else {
                    // Undeclared type: attempt to cast to int/float if possible, otherwise string
                    this.emit(this.ind() + node.id + ' = _pseudopy_input_cast(' + promptStr + ')');
                }
                break;
            }



            case 'IfStatement':
                // indent_level increases after THEN
                this.emit(this.ind() + 'if ' + this.exprToStr(node.condition.tokens) + ':');
                this.indentLevel++;
                if (this.isBodyEffectivelyEmpty(node.body)) this.emit(this.ind() + 'pass', null, true);
                else node.body.forEach(n => this.visitNode(n));
                this.indentLevel--;

                if (node.elseIfs) {
                    node.elseIfs.forEach(eif => {
                        this.emit(this.ind() + 'elif ' + this.exprToStr(eif.condition.tokens) + ':', eif);
                        this.indentLevel++;
                        if (this.isBodyEffectivelyEmpty(eif.body)) this.emit(this.ind() + 'pass', null, true);
                        else eif.body.forEach(n => this.visitNode(n));
                        this.indentLevel--;
                    });
                }

                if (node.elseBody) {
                    this.emit(this.ind() + 'else:');
                    this.indentLevel++;
                    if (node.elseBody.length === 0) this.emit(this.ind() + 'pass', null, true);
                    else node.elseBody.forEach(n => this.visitNode(n));
                    this.indentLevel--;
                }
                break;

            case 'WhileStatement':
                // indent_level increases after DO
                this.emit(this.ind() + 'while ' + this.exprToStr(node.condition.tokens) + ':');
                this.indentLevel++;
                if (this.isBodyEffectivelyEmpty(node.body)) this.emit(this.ind() + 'pass', null, true);
                else node.body.forEach(n => this.visitNode(n));

                this.indentLevel--;  // indent_level decreases after END WHILE
                break;

            case 'ForStatement': {
                const sStr = this.exprToStr(node.startExpr.tokens);
                const eStr = this.exprToStr(node.endExpr.tokens);
                const step = node.stepExpr ? this.exprToStr(node.stepExpr.tokens) : '1';
                // Bind bounds once: inclusive stop for either direction, without truncating floats.
                this.emit(this.ind() + `for ${node.iterator} in _pseudopy_range(${sStr}, ${eStr}, ${step}):`);
                this.indentLevel++;
                if (this.isBodyEffectivelyEmpty(node.body)) this.emit(this.ind() + 'pass', null, true);
                else node.body.forEach(n => this.visitNode(n));

                this.indentLevel--;
                break;
            }

            case 'ForEachStatement':
                this.emit(this.ind() + 'for ' + node.iterator + ' in ' + this.exprToStr(node.iterable.tokens) + ':');
                this.indentLevel++;
                if (this.isBodyEffectivelyEmpty(node.body)) this.emit(this.ind() + 'pass', null, true);
                else node.body.forEach(n => this.visitNode(n));

                this.indentLevel--;
                break;

            case 'ReturnStatement':
                this.emit(this.ind() + 'return ' + this.exprToStr(node.expr.tokens));
                break;

            case 'CallStatement':
                this.emit(this.ind() + node.name + '(' + node.arguments.map(arg => emitExpression(arg, false)).join(', ') + ')');
                break;

            case 'IncDecStatement':
                this.emit(this.ind() + node.id + (node.direction > 0 ? ' += 1' : ' -= 1'));
                break;

            case 'AppendStatement':
                this.emit(this.ind() + node.target + '.append(' + this.exprToStr(node.value.tokens) + ')');
                break;

            case 'FunctionDef': {
                // Build param list: identifiers joined by ', ' (commas from tokens are preserved by exprToStr)
                const paramStr = node.params.tokens.map(t => t.value).join(' ');
                this.emit(this.ind() + 'def ' + node.name + '(' + paramStr + '):');
                this.indentLevel++;
                if (this.isBodyEffectivelyEmpty(node.body)) this.emit(this.ind() + 'pass', null, true);
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
        // Live references used only for periodic trace checkpoints. These are
        // filled in as the pipeline advances and stay null for ordinary
        // student-facing translations.
        const traceRefs = { parser: null, semantic: null, tokenCount: 0 };

        compilerTrace.emit({ type: 'COMPILER_START', stage: 'PIPELINE', status: 'RUNNING', data: { rawCodeLength: rawCode.length } });

        // ── Algorithm Simulation ──
        // Opt-in only. When the caller did not enable the tracer, nothing below
        // allocates a payload, snapshot or mapping entry.
        const traceEnv = this.beginSimulationTrace(traceRefs);
        if (traceEnv) {
            simulationTracer.emit(SIMULATION_TRACE_TYPES.STAGE_START, {
                stage: 'PIPELINE',
                line: null,
                column: null,
                payload: { rawCodeLength: rawCode.length }
            });
        }

        // Preprocess to strip leading line numbers
        compilerTrace.emit({ type: 'PREPROCESS_START', stage: 'PREPROCESSING', status: 'RUNNING', data: {} });
        const cleanRawCode = preprocessPseudocode(rawCode);
        compilerTrace.emit({ type: 'PREPROCESS_COMPLETE', stage: 'PREPROCESSING', status: 'SUCCESS', data: { input: rawCode, output: cleanRawCode } });
        if (traceEnv && cleanRawCode !== rawCode) {
            simulationTracer.emit(SIMULATION_TRACE_TYPES.PREPROCESS_APPLIED, {
                stage: 'PREPROCESSING',
                line: null,
                column: null,
                payload: { input: rawCode, output: cleanRawCode, strippedLineNumbers: true }
            });
        }

        // ── Stage 0: Natural Language Mapping ──
        let code = cleanRawCode;
        if (typeof nlpMapper !== 'undefined') {
            compilerTrace.emit({ type: 'NLP_MAP_START', stage: 'NLP_MAPPING', status: 'RUNNING', data: {} });
            code = nlpMapper.map(cleanRawCode);
            compilerTrace.emit({ type: 'NLP_MAP_COMPLETE', stage: 'NLP_MAPPING', status: 'SUCCESS', data: { input: cleanRawCode, output: code, changed: code !== cleanRawCode } });
            if (traceEnv && code !== cleanRawCode) {
                simulationTracer.emit(SIMULATION_TRACE_TYPES.NLP_MAPPING_APPLIED, {
                    stage: 'NLP_MAPPING',
                    line: null,
                    column: null,
                    payload: { input: cleanRawCode, output: code }
                });
            }
        } else {
            compilerTrace.emit({ type: 'NLP_MAP_SKIPPED', stage: 'NLP_MAPPING', status: 'SKIPPED', data: { reason: 'nlpMapper not available' } });
        }

        // ── Stage 1: Lexical Analysis ──
        const t1 = performance.now();
        const lexer = new Lexer(code);
        const tokens = lexer.tokenize();
        traceRefs.tokenCount = tokens.length;
        const lexTime = performance.now() - t1;

        // ── Stage 2: Syntax Analysis (CFG + LIFO stack validation) ──
        const t2 = performance.now();
        const parser = new Parser(tokens);
        traceRefs.parser = parser;
        parser.errors.push(...lexer.errors);
        let ast = parser.parse();
        const parseTime = performance.now() - t2;

        // ── Stage 3: Semantic Analysis (pre-execution variable check) ──
        const t3 = performance.now();
        let semanticAnalyzer = new SemanticAnalyzer();
        traceRefs.semantic = semanticAnalyzer;
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
            return this.finishSimulationTrace(traceEnv, {
                valid: false, python: '', errors: ast.errors, warnings: warnings, metrics: metrics, mappedCode: code, tokens: tokens, ast: ast, symbolTable: Object.fromEntries(semanticAnalyzer.symbolTable), autoFixes: autoFixes
            });
        }

        // ── Stage 4: Code Generation (SDT tree-walk) ──
        const t4 = performance.now();
        const generator = new CodeGenerator(semanticAnalyzer.symbolTable);
        const pythonCode = generator.generate(ast);
        metrics.codeGenTime = parseFloat((performance.now() - t4).toFixed(3));

        metrics.totalTime = parseFloat((performance.now() - pipelineStart).toFixed(3));

        compilerTrace.emit({ type: 'COMPILATION_SUCCESS', stage: 'PIPELINE', status: 'SUCCESS', data: { totalTime: metrics.totalTime } });

        return this.finishSimulationTrace(traceEnv, {
            valid: true, python: pythonCode, errors: [], warnings: warnings, metrics: metrics, mappedCode: code, tokens: tokens, ast: ast, symbolTable: Object.fromEntries(semanticAnalyzer.symbolTable), autoFixes: autoFixes
        }, generator.sourceMap);
    }

    // ── Algorithm Simulation plumbing ───────────────────────────
    // Both helpers are inert unless a caller explicitly enabled the tracer, so
    // ordinary translations keep their existing shape and cost.

    beginSimulationTrace(traceRefs) {
        // Inert unless a caller opted in. Ordinary translations never reach
        // the tracer, so no event, snapshot or source map is produced.
        if (!simulationTracer.enabled) return null;
        simulationTracer.reset();
        simulationTracer.enable();
        // Read live compiler state only while a checkpoint is being taken.
        simulationTracer.setSnapshotProvider(() => ({
            stage: 'PIPELINE',
            tokenCount: traceRefs.tokenCount,
            blockStack: traceRefs.parser && traceRefs.parser.blockStack ? traceRefs.parser.blockStack.slice() : [],
            symbolTable: traceRefs.semantic ? traceRefs.semantic.symbolSnapshot() : {}
        }));
        return { startedAt: performance.now() };
    }

    finishSimulationTrace(traceEnv, result, sourceMap) {
        if (!traceEnv) return result;

        simulationTracer.captureSnapshot();
        simulationTracer.emit(SIMULATION_TRACE_TYPES.STAGE_END, {
            stage: 'PIPELINE',
            line: null,
            column: null,
            payload: { valid: result.valid === true, errorCount: result.errors.length, warningCount: result.warnings.length, totalTime: result.metrics.totalTime }
        });
        simulationTracer.setSnapshotProvider(null);

        const envelope = simulationTracer.finalize({
            sourceMap: sourceMap || [],
            valid: result.valid === true,
            metrics: result.metrics
        });
        result.simulation = envelope;
        return result;
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

