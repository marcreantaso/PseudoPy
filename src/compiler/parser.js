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
