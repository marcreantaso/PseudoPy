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
        if (this.lines.some(line => line.includes('_pseudopy_input_cast('))) {
            this.lines.unshift('def _pseudopy_input_cast(prompt):',
                '    val = input(prompt)',
                '    try:',
                '        return int(val)',
                '    except ValueError:',
                '        try:',
                '            return float(val)',
                '        except ValueError:',
                '            return val', '');
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
                const isStringNode = inputType === 'STRING';
                const isExplicitNumeric = ['INTEGER', 'FLOAT', 'REAL'].includes(inputType);
                const converter = inputType === 'INTEGER' ? 'int' : 'float';
                
                let promptStr;
                if (node.prompt && node.prompt.length > 0) {
                    promptStr = node.prompt[0].value;
                } else {
                    promptStr = '"Please enter ' + node.id + ': "';
                }

                if (isExplicitNumeric) {
                    this.lines.push(this.ind() + node.id + ' = ' + converter + '(input(' + promptStr + '))');
                } else if (isStringNode) {
                    this.lines.push(this.ind() + node.id + ' = input(' + promptStr + ')');
                } else {
                    // Undeclared type: attempt to cast to int/float if possible, otherwise string
                    this.lines.push(this.ind() + node.id + ' = _pseudopy_input_cast(' + promptStr + ')');
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


