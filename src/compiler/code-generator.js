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


