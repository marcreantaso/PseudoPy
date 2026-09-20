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
