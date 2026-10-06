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

    typeWarn(node, code, problem, suggestion, opts) {
        const line = (node && node.line) || 1;
        this.warnings.push({ line, code, severity: 'warning', stage: 'Semantic Analysis', message: problem, problem, suggestion, ...(opts || {}) });
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
                        'Add: DECLARE ' + node.id + ' AS INTEGER (or appropriate type)',
                        { fixKind: 'declare', detail: { variable: node.id } }
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
                        'Add: DECLARE ' + node.id + ' AS ARRAY',
                        { fixKind: 'declare', detail: { variable: node.id, kind: 'array' } }
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
                        'Add: DECLARE ' + node.id + ' AS INTEGER',
                        { fixKind: 'declare', detail: { variable: node.id, kind: 'integer' } }
                    );
                }
                break;

            case 'AppendStatement':
                this.checkExpr(node.value);
                this.validateExpressionTypes(node.value);
                if (!this.sym(node.target, node.line)) {
                    this.typeWarn(node, SEM__ERROR_CODES.undeclared,
                        "Array '" + node.target + "' not declared.",
                        'Add: DECLARE ' + node.target + ' AS ARRAY',
                        { fixKind: 'declare', detail: { variable: node.target, kind: 'array' } }
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
                'Assign or declare ' + t.value + ' before using it.',
                { fixKind: 'declare', detail: { variable: t.value } }
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
