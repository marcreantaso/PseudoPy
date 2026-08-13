
    const KNOWN_KEYWORDS = ['START', 'BEGIN', 'END', 'IF', 'THEN', 'ELSE', 'FOR', 'WHILE', 'PRINT', 'INPUT'];
    const currentErrorLineNumbers = [];
    function preprocessPseudocode(code) {
    if (!code) return '';
    return code.split('\n').map(line => {
        // Strip leading line numbers: e.g. "1 BEGIN" -> "BEGIN", "2  PRINT" -> " PRINT"
        return line.replace(/^\s*\d+[.:)]?[ \t]?/, '');
    }).join('\n');
}

/**
 * Core validation function — strict compiler-like approach.
 * Validates BEFORE any translation occurs.
 * Returns { valid: boolean, errors: [{ line: number, message: string, suggestion?: string }] }
 */
function validatePseudocode(code) {
    code = preprocessPseudocode(code);
    const lines = code.split('\n');
    const errors = [];
    const blockStack = [];

    // --- PHASE 1: Find BEGIN and END positions ---
    const meaningfulLines = [];
    for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (t && !t.startsWith('//') && !t.startsWith('#')) {
            meaningfulLines.push({ index: i, lineNum: i + 1, text: t });
        }
    }

    if (meaningfulLines.length === 0) {
        errors.push({ line: 1, message: 'Empty pseudocode.', suggestion: 'Start with BEGIN and end with END.' });
        return { valid: false, errors };
    }

    const firstMeaningful = meaningfulLines[0];
    const lastMeaningful = meaningfulLines[meaningfulLines.length - 1];

    let hasBegin = false, beginLineNum = -1;
    let hasEnd = false, endLineNum = -1;

    for (const ml of meaningfulLines) {
        if (/^(BEGIN|START)$/i.test(ml.text)) {
            if (!hasBegin) { hasBegin = true; beginLineNum = ml.lineNum; }
            else { errors.push({ line: ml.lineNum, message: 'Duplicate BEGIN/START statement found. Only one BEGIN or START is allowed.' }); }
        }
        if (/^END$/i.test(ml.text)) { hasEnd = true; endLineNum = ml.lineNum; }
    }

    // Strict: BEGIN must be first meaningful line
    if (!hasBegin) {
        errors.push({ line: firstMeaningful.lineNum, message: 'Missing BEGIN or START statement.', suggestion: 'Your pseudocode must start with BEGIN or START on the first line.' });
    } else if (beginLineNum !== firstMeaningful.lineNum) {
        errors.push({ line: beginLineNum, message: 'BEGIN/START must be the first line of your pseudocode.', suggestion: 'Move BEGIN or START to the very first line.' });
    }

    // Strict: END must be last meaningful line
    if (!hasEnd) {
        errors.push({ line: lastMeaningful.lineNum, message: 'Missing END statement.', suggestion: 'Your pseudocode must end with END on the last line.' });
    } else if (endLineNum !== lastMeaningful.lineNum) {
        errors.push({ line: endLineNum, message: 'END must be the last line of your pseudocode.', suggestion: 'Move END to the very last line. No code should appear after END.' });
    }

    // Detect END before BEGIN
    if (hasBegin && hasEnd && endLineNum < beginLineNum) {
        errors.push({ line: endLineNum, message: 'END found before BEGIN — structure is inverted.', suggestion: 'BEGIN must come first, END must come last.' });
    }

    // Detect code outside BEGIN-END block
    if (hasBegin && hasEnd && beginLineNum < endLineNum) {
        for (const ml of meaningfulLines) {
            if (/^(BEGIN|START)$/i.test(ml.text) || /^END$/i.test(ml.text)) continue;
            if (ml.lineNum < beginLineNum || ml.lineNum > endLineNum) {
                errors.push({ line: ml.lineNum, message: 'Code found outside BEGIN-END block.', suggestion: 'All pseudocode must be written between BEGIN/START and END.' });
            }
        }
    } else if (!hasBegin && hasEnd) {
        for (const ml of meaningfulLines) {
            if (/^END$/i.test(ml.text)) continue;
            if (ml.lineNum < endLineNum) {
                errors.push({ line: ml.lineNum, message: 'Code found before BEGIN/START (which is missing).', suggestion: 'Add BEGIN or START as the first line.' });
            }
        }
    }

    // If BEGIN/END structure is completely broken, return early
    if (!hasBegin || !hasEnd) {
        errors.sort((a, b) => a.line - b.line);
        return { valid: false, errors };
    }

    // --- PHASE 2: Validate lines inside BEGIN-END ---
    for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1;
        const trimmed = lines[i].trim();

        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;
        if (/^(BEGIN|START)$/i.test(trimmed) || /^END$/i.test(trimmed)) continue;
        if (lineNum < beginLineNum || lineNum > endLineNum) continue;

        // Block closers
        const endBlockMatch = trimmed.match(/^END\s+(IF|FOR|WHILE|FUNCTION|PROCEDURE)$/i) || trimmed.match(/^(ENDIF|ENDFOR|ENDWHILE)$/i);
        if (endBlockMatch) {
            let rawCloser = (endBlockMatch[1] || endBlockMatch[0]).toUpperCase();
            let closer = rawCloser;
            if (rawCloser === 'ENDIF') closer = 'IF';
            else if (rawCloser === 'ENDFOR') closer = 'FOR';
            else if (rawCloser === 'ENDWHILE') closer = 'WHILE';

            if (blockStack.length === 0) {
                errors.push({ line: lineNum, message: `Unexpected ${rawCloser} — no matching opening block found.`, suggestion: `Remove this ${rawCloser} or add the matching block above.` });
            } else {
                const top = blockStack[blockStack.length - 1];
                if (top.type === closer) { blockStack.pop(); }
                else {
                    errors.push({ line: lineNum, message: `Mismatched block: Expected END ${top.type} (opened on line ${top.line}) but found ${rawCloser}.`, suggestion: `Close the ${top.type} block with END ${top.type} before ${rawCloser}.` });
                    const deeper = blockStack.findIndex(b => b.type === closer);
                    if (deeper !== -1) {
                        for (let k = blockStack.length - 1; k > deeper; k--) {
                            errors.push({ line: blockStack[k].line, message: `Unclosed ${blockStack[k].type} block (opened on line ${blockStack[k].line}).`, suggestion: `Add END ${blockStack[k].type} to close this block.` });
                        }
                        blockStack.splice(deeper);
                    }
                }
            }
            continue;
        }

        // Block openers
        if (/^IF\s+(.+)\s+THEN$/i.test(trimmed)) {
            blockStack.push({ type: 'IF', line: lineNum });
            const condMatch = trimmed.match(/^IF\s+(.+)\s+THEN$/i);
            if (condMatch && !condMatch[1].trim()) errors.push({ line: lineNum, message: 'IF statement has an empty condition.', suggestion: 'Add a condition, e.g. IF x > 5 THEN' });
            checkIncompleteExpression(trimmed, lineNum, errors);
            continue;
        }
        if (/^ELSE\s+IF\s+(.+)\s+THEN$/i.test(trimmed)) {
            if (blockStack.length === 0 || blockStack[blockStack.length - 1].type !== 'IF') {
                errors.push({ line: lineNum, message: 'ELSE IF without a matching IF block.', suggestion: 'Make sure ELSE IF is inside an IF...END IF block.' });
            }
            const condMatch = trimmed.match(/^ELSE\s+IF\s+(.+)\s+THEN$/i);
            if (condMatch && !condMatch[1].trim()) errors.push({ line: lineNum, message: 'ELSE IF statement has an empty condition.', suggestion: 'Add a condition, e.g. ELSE IF x > 5 THEN' });
            checkIncompleteExpression(trimmed, lineNum, errors);
            continue;
        }
        if (/^ELSE$/i.test(trimmed)) {
            if (blockStack.length === 0 || blockStack[blockStack.length - 1].type !== 'IF') errors.push({ line: lineNum, message: 'ELSE without a matching IF block.', suggestion: 'Make sure ELSE is inside an IF...END IF block.' });
            continue;
        }
        if (/^FOR\s+EACH\s+\w+\s+IN\s+.+\s+DO$/i.test(trimmed) || /^FOR\s+\w+\s+FROM\s+.+\s+TO\s+.+\s+DO$/i.test(trimmed)) { blockStack.push({ type: 'FOR', line: lineNum }); continue; }
        if (/^WHILE\s+(.+)\s+DO$/i.test(trimmed)) { blockStack.push({ type: 'WHILE', line: lineNum }); continue; }
        if (/^(FUNCTION|PROCEDURE)\s+\w+\s*\(.*\)$/i.test(trimmed)) { blockStack.push({ type: trimmed.match(/^(FUNCTION|PROCEDURE)/i)[1].toUpperCase(), line: lineNum }); continue; }

        // Known statements with expression validation
        if (/^SET\s+\w+\s+TO\s+/i.test(trimmed)) { const m = trimmed.match(/^SET\s+\w+\s+TO\s+(.+)$/i); if (m) checkIncompleteExpression(m[1], lineNum, errors); continue; }
        if (/^(DISPLAY|PRINT|OUTPUT)\s+/i.test(trimmed)) { const m = trimmed.match(/^(?:DISPLAY|PRINT|OUTPUT)\s+(.+)$/i); if (m) checkIncompleteExpression(m[1], lineNum, errors); continue; }
        if (/^(INPUT|READ)\s+/i.test(trimmed)) continue;
        if (/^RETURN\s+/i.test(trimmed)) { const m = trimmed.match(/^RETURN\s+(.+)$/i); if (m) checkIncompleteExpression(m[1], lineNum, errors); continue; }
        if (/^CALL\s+\w+\s*\(.*\)$/i.test(trimmed)) continue;
        if (/^(INCREMENT|DECREMENT)\s+\w+$/i.test(trimmed)) continue;
        if (/^APPEND\s+.+\s+TO\s+\w+$/i.test(trimmed)) continue;
        if (/^(NUMERIC|INTEGER|FLOAT|REAL|STRING|CHAR|CHARACTER|BOOLEAN|BOOL)\s+\w+/i.test(trimmed)) continue;
        if (/^\w+\s*=\s*.+$/.test(trimmed)) { const m = trimmed.match(/^\w+\s*=\s*(.+)$/); if (m) checkIncompleteExpression(m[1], lineNum, errors); continue; }

        // Incomplete block syntax
        if (/^FOR\s+/i.test(trimmed) && !/DO$/i.test(trimmed)) { errors.push({ line: lineNum, message: 'FOR statement is missing "DO" at the end.', suggestion: 'Use: FOR EACH item IN list DO  or  FOR i FROM 1 TO 10 DO' }); blockStack.push({ type: 'FOR', line: lineNum }); continue; }
        if (/^IF\s+/i.test(trimmed) && !/THEN$/i.test(trimmed)) { errors.push({ line: lineNum, message: 'IF statement is missing "THEN" at the end.', suggestion: 'Use: IF condition THEN' }); blockStack.push({ type: 'IF', line: lineNum }); continue; }
        if (/^WHILE\s+/i.test(trimmed) && !/DO$/i.test(trimmed)) { errors.push({ line: lineNum, message: 'WHILE statement is missing "DO" at the end.', suggestion: 'Use: WHILE condition DO' }); blockStack.push({ type: 'WHILE', line: lineNum }); continue; }

        // --- STRICT unknown keyword rejection ---
        const firstWord = trimmed.split(/\s+/)[0];
        const firstWordUpper = firstWord.toUpperCase();

        if (/^[A-Z]{2,}$/i.test(firstWord) && !KNOWN_KEYWORDS.includes(firstWordUpper)) {
            const suggestion = suggestKeyword(firstWord);
            errors.push({
                line: lineNum,
                message: `Unknown keyword "${firstWord}".`,
                suggestion: suggestion ? `Did you mean "${suggestion}"?` : 'Check spelling or use a valid keyword: SET, DISPLAY, IF, FOR, WHILE, etc.'
            });
            continue;
        }

        // If it doesn't match any known pattern, flag it
        if (!KNOWN_KEYWORDS.includes(firstWordUpper) && !/^\w+\s*=/.test(trimmed)) {
            errors.push({
                line: lineNum,
                message: `Unrecognized statement: "${trimmed}".`,
                suggestion: 'Use valid pseudocode keywords: SET, DISPLAY, IF, FOR, WHILE, CALL, RETURN, etc.'
            });
        }
    }

    // --- PHASE 3: Check unbalanced quotes ---
    for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1;
        const trimmed = lines[i].trim();
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;
        if (lineNum < beginLineNum || lineNum > endLineNum) continue;
        if (/^BEGIN$/i.test(trimmed) || /^END$/i.test(trimmed)) continue;

        const doubleQuotes = (trimmed.match(/"/g) || []).length;
        const singleQuotes = (trimmed.match(/'/g) || []).length;
        if (doubleQuotes % 2 !== 0) errors.push({ line: lineNum, message: 'Unbalanced double quotes — missing closing ".', suggestion: 'Make sure every opening " has a matching closing ".' });
        if (singleQuotes % 2 !== 0) errors.push({ line: lineNum, message: "Unbalanced single quotes — missing closing '.", suggestion: "Make sure every opening ' has a matching closing '." });
    }

    // --- PHASE 4: Unclosed blocks ---
    while (blockStack.length > 0) {
        const unclosed = blockStack.pop();
        errors.push({ line: unclosed.line, message: `Unclosed ${unclosed.type} block (opened on line ${unclosed.line}).`, suggestion: `Add END ${unclosed.type} to close this block.` });
    }

    errors.sort((a, b) => a.line - b.line);
    return { valid: errors.length === 0, errors };
}

/**
 * Check for incomplete expressions (trailing operators, empty operands).
 * Detects things like: "Hello" +   or   x *   or   y /
 */
function checkIncompleteExpression(expr, lineNum, errors) {
    const trimmed = expr.trim();
    if (/[+\-*\/]\s*$/.test(trimmed)) {
        const op = trimmed.match(/([+\-*\/])\s*$/)[1];
        errors.push({ line: lineNum, message: `Incomplete expression — missing value after '${op}' operator.`, suggestion: `Add a value or variable after '${op}'. Example: "Hello, " + name` });
    }
    if (/^[+*\/]/.test(trimmed)) {
        errors.push({ line: lineNum, message: `Incomplete expression — unexpected '${trimmed[0]}' at the start.`, suggestion: `Add a value before '${trimmed[0]}'.` });
    }
    if (/[+\-*\/]\s*[+*\/]/.test(trimmed)) {
        errors.push({ line: lineNum, message: 'Invalid expression — consecutive operators found.', suggestion: 'Check for extra operators and ensure proper syntax.' });
    }
}

/**
 * Format validation errors as Python comments for the output panel.
 */
/**
 * Render validation errors into HTML for terminal-like console window formatting.
 */

    
    module.exports = validatePseudocode;
