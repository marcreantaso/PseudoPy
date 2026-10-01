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
