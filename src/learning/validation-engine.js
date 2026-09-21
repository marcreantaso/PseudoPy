/* ============================================================
   PSEUDOPY LEARNING LAYER — Validation Engine
   ------------------------------------------------------------
   Converts the compiler pipeline output (errors + warnings + AST
   + tokens) into a deterministic, structured list of ValidationResult
   objects. Every item carries severity, category, a plain-language
   explanation, a concrete suggestion and an example, so feedback
   can be rendered AND persisted as learning evidence.

   The existing parser / semantic analyzer are NOT modified: we
   classify their output and add educator checks on top.
   ============================================================ */

/**
 * Map a raw compiler error/warning message to a fine-grained RESULT_TYPE.
 * Ordered rule list — the first matching rule wins.
 * @param {string} message
 * @returns {string} A PseudoPyLearning.RESULT_TYPE value.
 */
function classifyCompilerIssue(message) {
    const m = String(message || '').toUpperCase();

    // 1. Block / structure problems (BEGIN/END, IF..ENDIF, loops).
    if (
        m.includes('UNCLOSED') ||
        m.includes('BLOCK MISMATCH') ||
        m.includes('MISSING BEGIN') ||
        m.includes('MISSING END') ||
        m.includes('UNEXPECTED END') ||
        m.includes('END STATEMENT') ||
        m.includes('SENTINEL') ||
        m.includes('REQUIRES IN') ||
        m.includes('REQUIRES FROM') ||
        m.includes('REQUIRES TO') ||
        /STATEMENT MISSING/.test(m)
    ) {
        return PseudoPyLearning.RESULT_TYPE.STRUCTURE;
    }

    // 2. Variable declaration / usage problems.
    if (
        m.includes('DECLARE') ||
        m.includes('UNDECLARED') ||
        m.includes('NOT DECLARED') ||
        m.includes('INCREMENT') ||
        m.includes('DECREMENT')
    ) {
        return PseudoPyLearning.RESULT_TYPE.VARIABLE;
    }

    // 3. Input / output statement problems.
    if (
        m.includes('INPUT') ||
        m.includes('PROMPT') ||
        m.includes(' AFTER READ')
    ) {
        return PseudoPyLearning.RESULT_TYPE.IO;
    }

    // 4. Plain syntax / lexical problems.
    if (
        m.includes('UNRECOGNIZED') ||
        m.includes('UNTERMINATED') ||
        m.includes('UNSUPPORTED CHARACTER') ||
        m.includes('UNEXPECTED TOKEN') ||
        m.includes('MISSING OPERAND') ||
        m.includes('LEADING ZERO') ||
        m.includes('MISSING CLOSING') ||
        m.includes('EXPECTED')
    ) {
        return PseudoPyLearning.RESULT_TYPE.SYNTAX;
    }

    // 5. Leftover textual hints default to syntax.
    return PseudoPyLearning.RESULT_TYPE.SYNTAX;
}

/**
 * Explanations are written to teach, not just restate the problem.
 * @param {string} type RESULT_TYPE value.
 * @param {string} message Original compiler message.
 * @returns {string} Plain-language reason this matters.
 */
function explainIssue(type, message) {
    const m = String(message || '').toUpperCase();
    switch (type) {
        case PseudoPyLearning.RESULT_TYPE.STRUCTURE:
            if (m.includes('BEGIN')) {
                return 'Every pseudocode program opens with a BEGIN statement so the translator knows where the code starts. Without it the compiler cannot build the program structure.';
            }
            if (m.includes('END')) {
                return 'Every block you open (IF, FOR, WHILE, FUNCTION) must be closed. The translator uses these closing lines to understand which statements belong inside the block.';
            }
            if (m.includes('THEN')) {
                return 'An IF statement always needs the sentinel keyword THEN after its condition. It signals that the following indented lines are the true-branch.';
            }
            return 'The structure of the program (how blocks are opened and closed) is not valid. Fix the blocks in the order the error messages describe.';
        case PseudoPyLearning.RESULT_TYPE.VARIABLE:
            if (m.includes('DECLARE') || m.includes('NOT DECLARED')) {
                return 'Declaring variables with DECLARE keeps the translator aware of their type, which produces safer Python code and prevents accidental typos from silently creating new variables.';
            }
            return 'Variables in pseudocode should be declared with DECLARE name AS type before first use so the program behaves predictably.';
        case PseudoPyLearning.RESULT_TYPE.IO:
            return 'INPUT statements read a value, and DISPLAY/PRINT/OUTPUT statements write one. The compiler needs a valid variable name (for INPUT) or expression (for DISPLAY) on these lines.';
        case PseudoPyLearning.RESULT_TYPE.LOGIC:
            return 'The logic of an expression or condition does not describe the intended behaviour. Check the numbers, operators and comparisons on the reported line.';
        case PseudoPyLearning.RESULT_TYPE.TRANSLATION:
            return 'This constructs behaviour in a way that is not reliably preserved when the pseudocode becomes Python. Consider restructuring it.';
        case PseudoPyLearning.RESULT_TYPE.READABILITY:
            return 'Readable pseudocode is reviewed and debugged faster. Small, clear lines beat long, dense ones.';
        case PseudoPyLearning.RESULT_TYPE.SYNTAX:
        default:
            return 'Pseudocode must follow the sentence forms the translator understands. The reported line does not fit any known statement form.';
    }
}

/**
 * Default constructive suggestion for a category.
 * @param {string} type
 * @returns {string}
 */
function suggestionForType(type) {
    switch (type) {
        case PseudoPyLearning.RESULT_TYPE.STRUCTURE: return 'Match every opening block with the correct closing keyword (END IF, END FOR, END WHILE).';
        case PseudoPyLearning.RESULT_TYPE.VARIABLE: return 'Add DECLARE <name> AS <type> before using the variable.';
        case PseudoPyLearning.RESULT_TYPE.IO: return 'Write INPUT <variable> to read, or DISPLAY <expression> to show a result.';
        case PseudoPyLearning.RESULT_TYPE.LOGIC: return 'Re-check the operators, values and conditions on the reported line.';
        case PseudoPyLearning.RESULT_TYPE.TRANSLATION: return 'Rewrite the statement using supported pseudocode forms.';
        case PseudoPyLearning.RESULT_TYPE.READABILITY: return 'Split long lines and use meaningful, short names.';
        case PseudoPyLearning.RESULT_TYPE.SYNTAX:
        default: return 'Consult the syntax guide and correct the reported line.';
    }
}

/**
 * Small illustrative snippet shown with the feedback item.
 * @param {string} type
 * @returns {string}
 */
function exampleForType(type) {
    switch (type) {
        case PseudoPyLearning.RESULT_TYPE.STRUCTURE: return 'END IF, END FOR, END WHILE';
        case PseudoPyLearning.RESULT_TYPE.VARIABLE: return 'DECLARE total AS INTEGER';
        case PseudoPyLearning.RESULT_TYPE.IO: return 'INPUT name\nDISPLAY "Hello", name';
        case PseudoPyLearning.RESULT_TYPE.LOGIC: return 'IF score >= 50 THEN';
        case PseudoPyLearning.RESULT_TYPE.TRANSLATION: return 'Use SET x TO <expression>';
        case PseudoPyLearning.RESULT_TYPE.READABILITY: return 'total = total + item\n(one idea per line)';
        case PseudoPyLearning.RESULT_TYPE.SYNTAX:
        default: return 'SET variable TO value';
    }
}

/**
 * Build a ValidationResult from a single compiler error/warning.
 * @param {Object} issue { line, message, suggestion }
 * @param {boolean} isWarning
 * @returns {ValidationResult}
 */
function resultFromCompilerIssue(issue, isWarning) {
    const message = String((issue && issue.message) || 'An issue was detected in the pseudocode.');
    const type = classifyCompilerIssue(message);
    return makeValidationResult({
        type: type,
        severity: isWarning ? PseudoPyLearning.SEVERITY.WARNING : PseudoPyLearning.SEVERITY.ERROR,
        message: message,
        explanation: explainIssue(type, message),
        line: typeof issue.line === 'number' ? issue.line : null,
        suggestion: (issue && issue.suggestion) || suggestionForType(type),
        example: exampleForType(type)
    });
}

/* ── AST helpers ───────────────────────────────────────────── */

/**
 * Walk the AST to find the maximum block nesting depth.
 * Blocks: IfStatement (elseIfs/elseBody), loops, FunctionDef.
 * @param {Object} ast
 * @returns {number}
 */
function computeAstMaxNesting(ast) {
    let maxDepth = 0;
    function walk(node, depth) {
        if (!node) return;
        if (depth > maxDepth) maxDepth = depth;

        const body = [];
        switch (node.type) {
            case 'Program': node.body.forEach(n => body.push(n)); break;
            case 'IfStatement':
                node.body && node.body.forEach(n => body.push(n));
                if (node.elseIfs) node.elseIfs.forEach(e => e.body && e.body.forEach(n => body.push(n)));
                if (node.elseBody) node.elseBody.forEach(n => body.push(n));
                walkChildren(body, depth + 1);
                return;
            case 'WhileStatement':
            case 'ForStatement':
            case 'ForEachStatement':
                node.body && node.body.forEach(n => body.push(n));
                walkChildren(body, depth + 1);
                return;
            case 'FunctionDef':
                node.body && node.body.forEach(n => body.push(n));
                walkChildren(body, depth + 1);
                return;
            default:
                walkChildren(node.body, depth);
                return;
        }
    }
    function walkChildren(list, depth) {
        (list || []).forEach(n => walk(n, depth));
    }
    walk(ast, 0);
    return maxDepth;
}

/**
 * Count AST nodes and factual composition for positive feedback.
 * @param {Object} ast
 * @returns {{statements:number, declared:number, outputs:number, loops:number, conditionals:number}}
 */
function summarizeAst(ast) {
    const summary = { statements: 0, declared: 0, outputs: 0, loops: 0, conditionals: 0, assigned: 0, inputs: 0, functions: 0 };
    function walk(node) {
        if (!node) return;
        if (Array.isArray(node)) { node.forEach(walk); return; }
        summary.statements++;
        switch (node.type) {
            case 'DeclareStatement': summary.declared++; break;
            case 'AssignmentStatement': summary.assigned++; break;
            case 'PrintStatement': summary.outputs++; break;
            case 'InputStatement': summary.inputs++; break;
            case 'WhileStatement':
            case 'ForStatement':
            case 'ForEachStatement': summary.loops++; break;
            case 'IfStatement': summary.conditionals++; break;
            case 'FunctionDef': summary.functions++; break;
        }
        node.body && walk(node.body);
        if (node.elseIfs) node.elseIfs.forEach(walk);
        if (node.elseBody) walk(node.elseBody);
    }
    if (ast && ast.body) ast.body.forEach(walk);
    return summary;
}

/* ── Educator checks (valid programs only) ─────────────────── */

/**
 * Additional encouraging / advisory results produced for valid code.
 * These reuse the same AST already compiled, so they stay cheap and
 * fully deterministic. Original compiler warnings are NOT repeated.
 * @param {Object} ctx { source, ast, tokens, hasVariableWarnings }
 * @returns {ValidationResult[]}
 */
function runEducationalChecks(ctx) {
    const items = [];
    const source = String(ctx.source || '');
    const lines = source.split('\n');
    const trimmedLines = lines.map(l => l.trim()).filter(l => l.length > 0);
    const summary = summarizeAst(ctx.ast);

    const kwTokens = (ctx.tokens || []).filter(t => (t.type === 'KEYWORD' || t.type === 'keyword')).map(t => String(t.value || '').toUpperCase());

    // 1. Translation success stays encouraging.
    items.push(makeValidationResult({
        type: PseudoPyLearning.RESULT_TYPE.BEST_PRACTICE,
        severity: PseudoPyLearning.SEVERITY.SUCCESS,
        message: 'Your pseudocode is valid and was translated into Python with no syntax errors.',
        explanation: 'The translator successfully understood every statement. Review the generated Python to confirm the behaviour matches your intent.',
        line: null
    }));

    // 2. Explicit typing recommendation (only when not already warned).
    if (!ctx.hasVariableWarnings && summary.statements > 0 && summary.declared === 0 && summary.assigned > 0) {
        items.push(makeValidationResult({
            type: PseudoPyLearning.RESULT_TYPE.BEST_PRACTICE,
            severity: PseudoPyLearning.SEVERITY.SUGGESTION,
            message: 'Consider declaring your variables with DECLARE statements.',
            explanation: 'DECLARE x AS INTEGER records the type of each variable, which lets the translator generate safer Python and helps readers understand the data.',
            suggestion: 'Add DECLARE lines before the variables are first assigned.',
            example: 'DECLARE total AS INTEGER'
        }));
    }

    // 3. Output visibility.
    if (summary.outputs > 0) {
        items.push(makeValidationResult({
            type: PseudoPyLearning.RESULT_TYPE.BEST_PRACTICE,
            severity: PseudoPyLearning.SEVERITY.SUCCESS,
            message: 'The program displays its results with DISPLAY/PRINT statements.',
            explanation: 'Showing the outcome (or at least progress) is what makes an algorithm useful to a user.',
            line: null
        }));
    } else if (summary.statements > 0) {
        items.push(makeValidationResult({
            type: PseudoPyLearning.RESULT_TYPE.BEST_PRACTICE,
            severity: PseudoPyLearning.SEVERITY.SUGGESTION,
            message: 'Add DISPLAY statements to show the result of the computation.',
            explanation: 'A program that computes but never shows a result cannot be verified or used by anyone.',
            suggestion: 'Add DISPLAY followed by the variable or expression you want to show.',
            example: 'DISPLAY total'
        }));
    }

    // 4. Indentation / readability.
    const indentedLines = lines.filter(l => l.match(/^\s+/));
    if (indentedLines.length > 0) {
        items.push(makeValidationResult({
            type: PseudoPyLearning.RESULT_TYPE.READABILITY,
            severity: PseudoPyLearning.SEVERITY.SUCCESS,
            message: 'You indented the body of your blocks.',
            explanation: 'Consistent indentation mirrors the Python output and makes the control flow visible at a glance.',
            line: null
        }));
    } else if (lines.length > 3) {
        items.push(makeValidationResult({
            type: PseudoPyLearning.RESULT_TYPE.READABILITY,
            severity: PseudoPyLearning.SEVERITY.SUGGESTION,
            message: 'Indent the statements inside IF/FOR/WHILE blocks.',
            explanation: 'Indentation shows which statements belong to each block — the same indentation that the generated Python will use.',
            suggestion: 'Press Tab or space once inside each block.',
            example: 'WHILE x < n DO\n  x = x + 1\nENDWHILE'
        }));
    }

    // 5. Long lines.
    lines.forEach((raw, idx) => {
        if (raw.length > 72) {
            items.push(makeValidationResult({
                type: PseudoPyLearning.RESULT_TYPE.READABILITY,
                severity: PseudoPyLearning.SEVERITY.SUGGESTION,
                message: 'Line ' + (idx + 1) + ' is ' + raw.length + ' characters long.',
                explanation: 'Long lines are hard to read in an editor and hide their true structure. One idea per line is the pseudocode ideal.',
                suggestion: 'Split the line into smaller steps.',
                line: idx + 1
            }));
        }
    });

    // 6. Nesting depth.
    const maxDepth = computeAstMaxNesting(ctx.ast);
    if (maxDepth > 3) {
        items.push(makeValidationResult({
            type: PseudoPyLearning.RESULT_TYPE.STRUCTURE,
            severity: PseudoPyLearning.SEVERITY.WARNING,
            message: 'Your program nests control blocks ' + maxDepth + ' levels deep.',
            explanation: 'Deeply nested structures are harder to read and debug. Consider extracting a function or simplifying the conditions.',
            suggestion: 'Extract repeated inner logic into a FUNCTION or flatten conditions with AND/OR.',
            line: null
        }));
    } else if (maxDepth > 0) {
        items.push(makeValidationResult({
            type: PseudoPyLearning.RESULT_TYPE.STRUCTURE,
            severity: PseudoPyLearning.SEVERITY.SUCCESS,
            message: 'Nesting depth is ' + maxDepth + ' level(s).',
            explanation: 'Shallow nesting keeps each block easy to follow.',
            line: null
        }));
    }

    // 7. Control flow recognition (positive boosts for later analytics).
    if (summary.loops > 0 && summary.conditionals > 0) {
        items.push(makeValidationResult({
            type: PseudoPyLearning.RESULT_TYPE.LOGIC,
            severity: PseudoPyLearning.SEVERITY.SUCCESS,
            message: 'The program combines loops and conditional branching.',
            explanation: 'Combining repetition with decisions is a core building block of most algorithms.',
            line: null
        }));
    } else if (summary.loops > 0) {
        items.push(makeValidationResult({
            type: PseudoPyLearning.RESULT_TYPE.LOGIC,
            severity: PseudoPyLearning.SEVERITY.SUCCESS,
            message: 'The program repeats work with a loop.',
            explanation: 'A single pass of the block is written once, and the loop controls how many times it runs.',
            line: null
        }));
    }

    return items;
}

/* ── Public API ────────────────────────────────────────────── */

/**
 * Run the full deterministic validation over a compile() result.
 * @param {Object} compileResult Output of PseudocodeCompiler.compile().
 * @param {string} source The original pseudocode text.
 * @returns {{valid:boolean, items:ValidationResult[]}}
 */
function runValidation(compileResult, source) {
    const result = compileResult || {};
    const valid = !!result.valid;
    const items = [];

    const errors = Array.isArray(result.errors) ? result.errors : [];
    const warnings = Array.isArray(result.warnings) ? result.warnings : [];

    errors.forEach(err => items.push(resultFromCompilerIssue(err, false)));
    warnings.forEach(warn => items.push(resultFromCompilerIssue(warn, true)));

    if (valid && errors.length === 0) {
        const hasVariableWarnings = warnings.some(w => {
            const m = String(w.message || '').toUpperCase();
            return m.includes('DECLARE') || m.includes('UNDECLARED') || m.includes('NOT DECLARED');
        });
        items.push(...runEducationalChecks({
            source: source,
            ast: result.ast || null,
            tokens: result.tokens || [],
            hasVariableWarnings: hasVariableWarnings
        }));
    }

    items.sort(compareValidationResults);
    return { valid: valid, items: items };
}

/**
 * Ordering: ERRORs first, then WARNING, SUGGESTION, SUCCESS; by line.
 * @param {ValidationResult} a
 * @param {ValidationResult} b
 * @returns {number}
 */
function compareValidationResults(a, b) {
    const rank = PseudoPyLearning.SEVERITY_ORDER.indexOf(a.severity) - PseudoPyLearning.SEVERITY_ORDER.indexOf(b.severity);
    if (rank !== 0) return rank;
    if (a.line === null && b.line === null) return 0;
    if (a.line === null) return 1;
    if (b.line === null) return -1;
    return a.line - b.line;
}

/**
 * Reduce a ValidationResult[] into compact counts.
 * Used by the evidence store and analytics (Phases 6-9).
 * @param {ValidationResult[]} items
 * @returns {{bySeverity:Object, byCategory:Object, byType:Object}}
 */
function summarizeValidation(items) {
    const bySeverity = {};
    const byCategory = {};
    const byType = {};
    (items || []).forEach(item => {
        bySeverity[item.severity] = (bySeverity[item.severity] || 0) + 1;
        byCategory[item.category] = (byCategory[item.category] || 0) + 1;
        byType[item.type] = (byType[item.type] || 0) + 1;
    });
    return { bySeverity: bySeverity, byCategory: byCategory, byType: byType };
}

/**
 * Map a RESULT_TYPE to the instructor-facing GAP_CATEGORY.
 * @param {string} resultType
 * @returns {string}
 */
function gapCategoryForResultType(resultType) {
    switch (resultType) {
        case PseudoPyLearning.RESULT_TYPE.STRUCTURE: return PseudoPyLearning.GAP_CATEGORY.STRUCTURE;
        case PseudoPyLearning.RESULT_TYPE.VARIABLE: return PseudoPyLearning.GAP_CATEGORY.VARIABLE;
        case PseudoPyLearning.RESULT_TYPE.LOGIC: return PseudoPyLearning.GAP_CATEGORY.LOGIC;
        case PseudoPyLearning.RESULT_TYPE.IO: return PseudoPyLearning.GAP_CATEGORY.IO;
        case PseudoPyLearning.RESULT_TYPE.PATTERN: return PseudoPyLearning.GAP_CATEGORY.PATTERN;
        case PseudoPyLearning.RESULT_TYPE.TRANSLATION: return PseudoPyLearning.GAP_CATEGORY.TRANSLATION;
        case PseudoPyLearning.RESULT_TYPE.READABILITY: return PseudoPyLearning.GAP_CATEGORY.READABILITY;
        case PseudoPyLearning.RESULT_TYPE.SYNTAX:
        default: return PseudoPyLearning.GAP_CATEGORY.SYNTAX;
    }
}

PseudoPyLearning.register.validationEngine = {
    runValidation: runValidation,
    classifyCompilerIssue: classifyCompilerIssue,
    summarizeValidation: summarizeValidation,
    gapCategoryForResultType: gapCategoryForResultType,
    computeAstMaxNesting: computeAstMaxNesting
};