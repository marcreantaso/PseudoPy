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

