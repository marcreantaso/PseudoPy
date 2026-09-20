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
