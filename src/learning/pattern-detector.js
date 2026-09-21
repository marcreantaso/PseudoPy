/* ============================================================
   PSEUDOPY LEARNING LAYER — Pattern Detector
   ------------------------------------------------------------
   Walks the parser AST and recognises the common algorithmic
   patterns a beginner is expected to master. Fully deterministic:
   every detection decision comes from AST node types, expression
   tokens or source ranges. Output is a list of DetectedPattern
   objects that the feedback clustering (Phase 3) and the evidence
   store (Phase 6) can consume.
   ============================================================ */

/* Pattern display metadata (Lucide icons). */
Object.assign(PseudoPyLearning.LABELS.pattern || (PseudoPyLearning.LABELS.pattern = {}), {
    [PseudoPyLearning.PATTERN_TYPE.SEQUENCE]: { label: 'Sequence', icon: 'list', description: 'Statements run one after another, top to bottom.' },
    [PseudoPyLearning.PATTERN_TYPE.SELECTION]: { label: 'Selection', icon: 'git-branch', description: 'A decision chooses which block of statements runs.' },
    [PseudoPyLearning.PATTERN_TYPE.REPETITION]: { label: 'Repetition', icon: 'refresh-cw', description: 'A block of statements repeats under control of a loop.' },
    [PseudoPyLearning.PATTERN_TYPE.COUNTER_CONTROLLED_LOOP]: { label: 'Counter-Controlled Loop', icon: 'repeat', description: 'A FOR loop that repeats a fixed number of times using a counter.' },
    [PseudoPyLearning.PATTERN_TYPE.SENTINEL_CONTROLLED_LOOP]: { label: 'Sentinel-Controlled Loop', icon: 'flag', description: 'A loop that keeps reading input until a sentinel value ends it.' },
    [PseudoPyLearning.PATTERN_TYPE.ACCUMULATOR]: { label: 'Accumulator', icon: 'sigma', description: 'A total (or product) built up by adding to it during each iteration.' },
    [PseudoPyLearning.PATTERN_TYPE.INPUT_PROCESS_OUTPUT]: { label: 'Input-Process-Output', icon: 'wholefish', description: 'Read values, process them, then display the result.' },
    [PseudoPyLearning.PATTERN_TYPE.VALIDATION_LOOP]: { label: 'Validation Loop', icon: 'shield-check', description: 'A loop that re-reads input until the value satisfies a rule.' },
    [PseudoPyLearning.PATTERN_TYPE.NESTED_SELECTION]: { label: 'Nested Selection', icon: 'network', description: 'A decision placed inside another decision.' },
    [PseudoPyLearning.PATTERN_TYPE.NESTED_ITERATION]: { label: 'Nested Iteration', icon: 'container', description: 'A loop placed inside the body of another loop.' },
    [PseudoPyLearning.PATTERN_TYPE.FUNCTION]: { label: 'Function / Procedure', icon: 'puzzle', description: 'A named, reusable unit of behavior with parameters.' }
});

const PATTERN_SLICE_LIMIT = 8; // lines per slice shown to the student

/**
 * Collect the deepest line covered by an AST subtree.
 * @param {Object} node
 * @returns {number}
 */
function patternNodeEndLine(node) {
    if (!node) return 1;
    const list = [];
    if (node.body && Array.isArray(node.body)) list.push(...node.body);
    if (node.elseIfs && Array.isArray(node.elseIfs)) list.push(...node.elseIfs);
    const candidates = [node.line || 1];
    for (const child of list) candidates.push(patternNodeEndLine(child));
    if (node.elseBody && Array.isArray(node.elseBody)) {
        for (const child of node.elseBody) candidates.push(patternNodeEndLine(child));
    }
    return Math.max.apply(null, candidates);
}

/**
 * True when a statement appears somewhere inside another statement's body.
 * Used to distinguish "Nested Selection" / "Nested Iteration" from
 * top-level occurrences, without sacrificing the type-specific pattern.
 * @param {Object} outer
 * @param {Object} inner
 * @returns {boolean}
 */
function containsNode(outer, inner) {
    if (!outer || !inner) return false;
    const lists = [outer.body];
    if (outer.elseIfs) lists.push(...outer.elseIfs.map(e => e.body));
    if (outer.elseBody) lists.push(outer.elseBody);
    for (const list of lists) {
        if (!Array.isArray(list)) continue;
        for (const child of list) {
            if (child === inner) return true;
            if (containsNode(child, inner)) return true;
        }
    }
    return false;
}

/**
 * Slices source lines [startLine..endLine] into a compact display string.
 * @param {string} source
 * @param {number} startLine
 * @param {number} endLine
 * @returns {string}
 */
function sourceSlice(source, startLine, endLine) {
    const lines = String(source || '').split('\n');
    let out = [];
    for (let i = Math.max(0, startLine - 1); i < Math.min(lines.length, endLine); i++) {
        out.push(lines[i].trim());
        if (out.length >= PATTERN_SLICE_LIMIT) break;
    }
    return out.filter(Boolean).join('\n');
}

/**
 * Regenerates the Python projection of a single AST subtree by wrapping
 * it in a Program and reusing the existing CodeGenerator (Phase 10 keeps
 * shared logic in one place). Helper preludes are trimmed for readability.
 * @param {Object} node
 * @param {Object} symbolTable Plain { id: {} } object from compile().
 * @returns {string}
 */
function patternPythonSlice(node, symbolTable) {
    try {
        const symMap = symbolTable && typeof symbolTable.entries === 'function' ? symbolTable : (symbolTable ? new Map(Object.entries(symbolTable || {})) : new Map());
        const generator = new CodeGenerator(symMap);
        const program = node && node.type === 'Program' ? node : { type: 'Program', body: [node] };
        const generated = generator.generate(program) || '';
        let lines = generated.split('\n');
        // Trim reusable helper preludes (def _pseudopy_range/_pseudopy_input_cast).
        const blank = lines.lastIndexOf('');
        if (blank !== -1) lines = lines.slice(blank + 1);
        return lines.filter(Boolean).slice(0, PATTERN_SLICE_LIMIT).join('\n');
    } catch (e) {
        return '';
    }
}

/**
 * Expression token helper: the visible operand/operator values.
 * @param {Object} expr AST expression node with .tokens
 * @returns {string[]}
 */
function exprValues(expr) {
    if (!expr || !Array.isArray(expr.tokens)) return [];
    return expr.tokens.map(t => String(t.value || ''));
}

/**
 * True when the statement carries a declaration type hint (INTEGER...).
 * @param {Object} node
 * @returns {string}
 */
function declaredAssignments(ast) {
    const out = [];
    function walk(node) {
        if (!node) return;
        if (node.type === 'AssignmentStatement') out.push(node);
        walk(node.body);
        if (node.elseIfs) node.elseIfs.forEach(walk);
        if (node.elseBody) walk(node.elseBody);
    }
    walk(ast);
    return out;
}

/**
 * Detect the accumulator/counter variables initialised before each loop.
 * Returns Map id → initialisation line for simple constant assignments.
 * @param {Object} programBody
 * @returns {Map<string, number>}
 */
function collectInitializers(programBody) {
    const init = new Map();
    (programBody || []).forEach(node => {
        if (node.type === 'DeclareStatement') init.set(node.id, node.line || 1);
        else if (node.type === 'AssignmentStatement') {
            const vals = exprValues(node.expr);
            if (vals.length === 1 && /^\d+(\.\d+)?$/.test(vals[0])) init.set(node.id, node.line || 1);
        }
    });
    return init;
}

/**
 * True when an assignment inside a loop updates an already-initialised
 * variable with an arithmetic operation involving itself (the classic
 * accumulator `total = total + item` / counter `count = count + 1`).
 * @param {Object} assign AssignmentStatement
 * @param {Map<string, number>} initializers
 */
function isAccumulatorAssignment(assign, initializers) {
    if (!assign || !assign.expr) return false;
    if (!initializers.has(assign.id)) return false;
    const vals = exprValues(assign.expr);
    const hasSelf = vals.includes(assign.id);
    const hasOp = vals.some(v => ['+', '-', '*', '/', '//', '%', 'MOD', 'DIV'].includes(v));
    return hasSelf && hasOp;
}

/**
 * Whether the loop body reads input into the given variable set.
 * @param {Object[]} body
 * @returns {string[]} variable names read via INPUT/READ in the body
 */
function inputVarsInBody(body, acc) {
    acc = acc || [];
    (body || []).forEach(node => {
        if (node.type === 'InputStatement') acc.push(node.id);
        inputVarsInBody(node.body, acc);
        if (node.elseIfs) node.elseIfs.forEach(e => inputVarsInBody(e.body, acc));
        if (node.elseBody) inputVarsInBody(node.elseBody, acc);
    });
    return acc;
}

function containsKeyword(values, keywords) {
    return values.some(v => keywords.includes(v.toUpperCase()));
}

/**
 * Classify a WHILE loop into Sentinel / Validation / Repetition.
 * @param {Object} node WhileStatement
 * @param {string[]} bodyInputs
 * @returns {string} PATTERN_TYPE value
 */
function classifyWhile(node, bodyInputs) {
    const cond = exprValues(node.condition).map(v => v.toUpperCase());
    const condHasInputVar = bodyInputs.some(name => cond.includes(name.toUpperCase()));
    const hasString = containsKeyword(cond, []);
    const rawStrings = (node.condition.tokens || []).filter(t => t.type === 'STRING').length;
    const hasCompare = ['<', '>', '=', '==', '!=', '<>', 'MOD', 'DIV'].some(op => cond.includes(op));

    if (!condHasInputVar) return PseudoPyLearning.PATTERN_TYPE.REPETITION;
    if (rawStrings > 0 || hasString) return PseudoPyLearning.PATTERN_TYPE.SENTINEL_CONTROLLED_LOOP;
    if (hasCompare) return PseudoPyLearning.PATTERN_TYPE.VALIDATION_LOOP;
    return PseudoPyLearning.PATTERN_TYPE.SENTINEL_CONTROLLED_LOOP;
}

/* ── Per-construct detectors ───────────────────────────────── */

function detectSequences(ast, source) {
    const patterns = [];
    const body = (ast && ast.body) || [];
    const procedural = body.filter(n => !['DeclareStatement'].includes(n.type));
    if (procedural.length >= 2) {
        const start = Math.min.apply(null, procedural.map(n => n.line || 1));
        const end = Math.max.apply(null, procedural.map(n => patternNodeEndLine(n)));
        patterns.push(makeDetectedPattern({
            type: PseudoPyLearning.PATTERN_TYPE.SEQUENCE,
            name: 'Sequence',
            startLine: start,
            endLine: end,
            explanation: 'Statements are executed one after another from top to bottom. This is the default flow of every pseudocode program.',
            pseudocodeSlice: sourceSlice(source, start, end),
            pythonSlice: patternPythonSlice({ type: 'Program', body: procedural.slice(0, 2) }, {})
        }));
    }
    return patterns;
}

function detectSelection(ast, { source, symbolTable, inLoop }) {
    const patterns = [];
    const ifs = [];
    const walk = node => {
        if (!node) return;
        if (node.type === 'IfStatement') ifs.push(node);
        if (node.body) node.body.forEach(walk);
        if (node.elseIfs) node.elseIfs.forEach(e => e.body && e.body.forEach(walk));
        if (node.elseBody) node.elseBody.forEach(walk);
    };
    walk(ast);

    ifs.forEach(outer => {
        const hasNested = ifs.some(inner => inner !== outer && containsNode(outer, inner));
        const start = outer.line || 1;
        const end = patternNodeEndLine(outer);
        if (hasNested) {
            patterns.push(makeDetectedPattern({
                type: PseudoPyLearning.PATTERN_TYPE.NESTED_SELECTION,
                name: 'Nested Selection',
                startLine: start,
                endLine: end,
                explanation: 'A decision sits inside the true/false branch of an outer decision. The inner IF only runs when the outer condition is met.',
                pseudocodeSlice: sourceSlice(source, start, end),
                pythonSlice: patternPythonSlice(outer, symbolTable)
            }));
        } else {
            patterns.push(makeDetectedPattern({
                type: PseudoPyLearning.PATTERN_TYPE.SELECTION,
                name: 'Selection',
                startLine: start,
                endLine: end,
                explanation: 'The IF condition picks one of several branches. Only the matching branch executes.',
                pseudocodeSlice: sourceSlice(source, start, end),
                pythonSlice: patternPythonSlice(outer, symbolTable)
            }));
        }
    });
    return patterns;
}

function detectLoops(ast, { source, symbolTable }) {
    const patterns = [];
    const programBody = (ast && ast.body) || [];
    const initializers = collectInitializers(programBody);
    const loops = [];

    const walk = node => {
        if (!node) return;
        if (node.type === 'WhileStatement' || node.type === 'ForStatement' || node.type === 'ForEachStatement') loops.push(node);
        if (node.body) node.body.forEach(walk);
        if (node.elseIfs) node.elseIfs.forEach(e => e.body && e.body.forEach(walk));
        if (node.elseBody) node.elseBody.forEach(walk);
    };
    walk(ast);

    loops.forEach(loop => {
        const start = loop.line || 1;
        const end = patternNodeEndLine(loop);
        const bodyInputs = inputVarsInBody(loop.body, []);
        let type, name, explanation;
        const accordion = isAccumulatorLoop(loop, initializers);

        if (loop.type === 'ForStatement') {
            type = PseudoPyLearning.PATTERN_TYPE.COUNTER_CONTROLLED_LOOP;
            name = 'Counter-Controlled Loop';
            explanation = 'A FOR loop steps a counter through a fixed range, running the body once per value. The loop controls the count; you control the body.';
        } else if (loop.type === 'ForEachStatement') {
            type = PseudoPyLearning.PATTERN_TYPE.REPETITION;
            name = 'Repetition over a collection';
            explanation = 'A FOR EACH loop visits every element of an array or list once, binding each one to the iterator in turn.';
        } else {
            type = classifyWhile(loop, bodyInputs);
            name = type === PseudoPyLearning.PATTERN_TYPE.VALIDATION_LOOP ? 'Validation Loop'
                : type === PseudoPyLearning.PATTERN_TYPE.SENTINEL_CONTROLLED_LOOP ? 'Sentinel-Controlled Loop'
                    : 'Repetition (While loop)';
            explanation = type === PseudoPyLearning.PATTERN_TYPE.VALIDATION_LOOP
                ? 'The WHILE loop repeatedly asks for input until the value passes a validation rule, so bad input never escapes the loop.'
                : type === PseudoPyLearning.PATTERN_TYPE.SENTINEL_CONTROLLED_LOOP
                    ? 'The WHILE loop keeps reading values until a special sentinel value signals the end of the data.'
                    : 'A WHILE loop repeats as long as its condition stays true. The body must eventually make the condition false or the loop never ends.';
        }

        patterns.push(makeDetectedPattern({
            type: type,
            name: name,
            startLine: start,
            endLine: end,
            explanation: explanation,
            pseudocodeSlice: sourceSlice(source, start, end),
            pythonSlice: patternPythonSlice(loop, symbolTable)
        }));

        if (accordion.accumulated.length > 0) {
            patterns.push(makeDetectedPattern({
                type: PseudoPyLearning.PATTERN_TYPE.ACCUMULATOR,
                name: 'Accumulator',
                startLine: start,
                endLine: end,
                explanation: 'An accumulating variable (' + accordion.accumulated.join(', ') + ') is initialised before the loop and updated during every iteration. Each pass adds (or multiplies) its previous value with the new one.',
                pseudocodeSlice: sourceSlice(source, start, end),
                pythonSlice: patternPythonSlice(loop, symbolTable)
            }));
        }
    });

    // Nested iteration — any loop contained in another loop.
    loops.forEach(inner => {
        const wraps = loops.some(outer => outer !== inner && containsNode(outer, inner));
        if (!wraps) return;
        const start = inner.line || 1;
        const end = patternNodeEndLine(inner);
        patterns.push(makeDetectedPattern({
            type: PseudoPyLearning.PATTERN_TYPE.NESTED_ITERATION,
            name: 'Nested Iteration',
            startLine: start,
            endLine: end,
            explanation: 'One loop is placed inside another. The inner loop runs completely for every single pass of the outer loop.',
            pseudocodeSlice: sourceSlice(source, start, end),
            pythonSlice: patternPythonSlice(inner, symbolTable)
        }));
    });

    return patterns;
}

function isAccumulatorLoop(loop, initializers) {
    const accumulated = [];
    const walk = node => {
        if (!node) return;
        if (node.type === 'AssignmentStatement' && isAccumulatorAssignment(node, initializers) && !accumulated.includes(node.id)) accumulated.push(node.id);
        if (node.body) node.body.forEach(walk);
        if (node.elseIfs) node.elseIfs.forEach(e => e.body && e.body.forEach(walk));
        if (node.elseBody) node.elseBody.forEach(walk);
    };
    walk(loop);
    return { accumulated };
}

function detectFunctionsAndIPO(ast, { source, symbolTable }) {
    const patterns = [];
    const funcs = [];
    let hasInput = false, hasOutput = false;
    let firstInputLine = null, lastOutputLine = null;

    const walk = node => {
        if (!node) return;
        if (node.type === 'FunctionDef') funcs.push(node);
        if (node.type === 'InputStatement') {
            hasInput = true;
            if (firstInputLine === null) firstInputLine = node.line || 1;
        }
        if (node.type === 'PrintStatement') {
            hasOutput = true;
            lastOutputLine = Math.max(lastOutputLine || 0, node.line || 1);
        }
        if (node.body) node.body.forEach(walk);
        if (node.elseIfs) node.elseIfs.forEach(e => e.body && e.body.forEach(walk));
        if (node.elseBody) node.elseBody.forEach(walk);
    };
    walk(ast);

    funcs.forEach(fn => {
        const start = fn.line || 1;
        const end = patternNodeEndLine(fn);
        patterns.push(makeDetectedPattern({
            type: PseudoPyLearning.PATTERN_TYPE.FUNCTION,
            name: 'Function / Procedure',
            startLine: start,
            endLine: end,
            explanation: 'The code is organised into a named, reusable block. Parameters pass values in and RETURN sends a result back, keeping the main flow short.',
            pseudocodeSlice: sourceSlice(source, start, end),
            pythonSlice: patternPythonSlice(fn, symbolTable)
        }));
    });

    if (hasInput && hasOutput && firstInputLine !== null && lastOutputLine !== null && lastOutputLine > firstInputLine) {
        patterns.push(makeDetectedPattern({
            type: PseudoPyLearning.PATTERN_TYPE.INPUT_PROCESS_OUTPUT,
            name: 'Input-Process-Output',
            startLine: firstInputLine,
            endLine: lastOutputLine,
            explanation: 'Your program follows the classic Input → Process → Output shape: it reads a value, does some work, then shows a result.',
            pseudocodeSlice: sourceSlice(source, firstInputLine, lastOutputLine),
            pythonSlice: patternPythonSlice({ type: 'Program', body: ast.body || [] }, symbolTable)
        }));
    }

    return patterns;
}

/* ── Public API ────────────────────────────────────────────── */

/**
 * Detect all recognised algorithmic patterns in a compiled program.
 * @param {Object} ctx { ast, source, python, symbolTable }
 * @returns {DetectedPattern[]} Sorted by start line.
 */
function detectPatterns(ctx) {
    const ast = (ctx && ctx.ast) || { body: [] };
    const source = String((ctx && ctx.source) || '');
    const symbolTable = (ctx && ctx.symbolTable) || null;
    const scope = { source: source, symbolTable: symbolTable };

    let out = [];
    out.push(...detectSequences(ast, source));
    out.push(...detectSelection(ast, scope));
    out.push(...detectLoops(ast, scope));
    out.push(...detectFunctionsAndIPO(ast, scope));

    // De-duplicate identical (type, startLine) pairs and sort by line.
    const seen = new Set();
    out = out.filter(p => {
        const key = p.type + ':' + p.startLine;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).sort((a, b) => a.startLine - b.startLine || b.endLine - a.endLine);

    return out;
}

PseudoPyLearning.register.patternDetector = {
    detectPatterns: detectPatterns,
    classifyWhile: classifyWhile,
    computeAstMaxNesting: function (ast) {
        // aliased from the validation engine when present; fallback inline
        if (PseudoPyLearning.register.validationEngine && PseudoPyLearning.register.validationEngine.computeAstMaxNesting) {
            return PseudoPyLearning.register.validationEngine.computeAstMaxNesting(ast);
        }
        return 0;
    }
};