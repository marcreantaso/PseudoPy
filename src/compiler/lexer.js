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
