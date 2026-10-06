/* Local, opt-in source assistance. Suggestions never execute student code.
 *
 * Quick Fixes are generated ONLY at this layer, never by the compiler. The
 * compiler stays free of any auto-repair (docs/compiler-language.md: "valid"
 * means syntax accepted, and missing closures are never silently rewritten).
 * Each candidate is derived from the original editor source and the compiler's
 * structured diagnostics (code + fixKind + detail), so an Apply or Apply-all
 * can be validated against the exact revision the user is looking at.
 */

function pseudopyCorrectionSuggestions(source) {
    const aliases = { BEIGN: 'BEGIN', DISPALY: 'DISPLAY', DIPSLAY: 'DISPLAY', INPT: 'INPUT', INTPUT: 'INPUT', WHLIE: 'WHILE', DECLRAE: 'DECLARE', ESLE: 'ELSE', RETRUN: 'RETURN' };
    return source.split('\n').flatMap((text, index) => {
        const match = /^(\s*)([A-Za-z]+)\b/.exec(text);
        if (match && /^\s*(?:=|:=|←|<-|\[)/.test(text.slice(match[0].length))) return [];
        const replacement = match && aliases[match[2].toUpperCase()];
        return replacement ? [{ line: index + 1, before: text, after: match[1] + replacement + text.slice(match[0].length), reason: 'Correct a misspelled statement keyword.' }] : [];
    });
}

function pseudopyReviewSource(source) {
    const tracing = compilerTrace.enabled;
    const simulation = simulationTracer.enabled;
    compilerTrace.enabled = false;
    simulationTracer.enabled = false;
    try { return new PseudocodeCompiler().compile(source); }
    finally { compilerTrace.enabled = tracing; simulationTracer.enabled = simulation; }
}

function pseudopyApplyCorrection(source, fix) {
    const lines = source.split('\n');
    if (lines[fix.line - 1] !== fix.before) throw new Error('Source changed. Review the suggestions again.');
    lines[fix.line - 1] = fix.after;
    return lines.join('\n');
}

// ── Structured diagnostics helpers ──────────────────────────────────────────

const PSEUDOPY_STATEMENT_KEYWORDS = ['PRINT', 'DISPLAY', 'OUTPUT', 'INPUT', 'READ', 'SET', 'DECLARE', 'IF', 'ELSE', 'WHILE', 'FOR', 'FROM', 'TO', 'DO', 'THEN', 'BEGIN', 'END', 'FUNCTION', 'PROCEDURE', 'RETURN', 'CALL', 'INCREMENT', 'DECREMENT', 'APPEND', 'STEP', 'EACH', 'IN'];

function pseudopyDiagnosticKey(issue) {
    return (issue && issue.line || '?') + ':' + (issue.code || issue.message || '') + ':' + (issue.detail && issue.detail.variable || '');
}

function pseudopyDedupeDiagnostics(issues) {
    if (!Array.isArray(issues)) return [];
    const seen = new Set();
    const out = [];
    for (const issue of issues) {
        if (!issue) continue;
        const key = pseudopyDiagnosticKey(issue);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(issue);
    }
    return out;
}

function pseudopyFixKey(fix) {
    return fix.kind + ':' + (fix.line || '') + ':' + (fix.insertBeforeLine || '') + ':' + fix.after;
}

function pseudopyEscapeRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pseudopyIsBareEndLine(text) {
    if (!text) return false;
    const trimmed = text.trim().replace(/(?:\/\/|#).*$/, '').trim();
    return trimmed.toUpperCase() === 'END';
}

function pseudopyLineIndent(text) {
    const m = /^\s*/.exec(text || '');
    return m ? m[0] : '';
}

function pseudopySentinelInsertFix(lines, line, sentinel, issue) {
    if (!line || line < 1 || line > lines.length) return null;
    const original = lines[line - 1];
    const eol = original.endsWith('\r') ? '\r' : '';
    const text = eol ? original.slice(0, -1) : original;
    let quote = null, commentAt = text.length;
    for (let i = 0; i < text.length; i++) {
        if (quote) {
            if (text[i] === '\\') i++;
            else if (text[i] === quote) quote = null;
        } else if (text[i] === '"' || text[i] === "'") quote = text[i];
        else if (text[i] === '#') { commentAt = i; break; }
    }
    if (quote) return null;
    const body = text.slice(0, commentAt).trimEnd();
    const comment = text.slice(commentAt);
    if (!body.trim()) return null;
    // If the very next non-blank line already carries the sentinel, inserting
    // one now would only duplicate it. Leave that shape to the user.
    for (let i = line; i < lines.length; i++) {
        const t = lines[i].trim();
        if (!t) continue;
        if (t.toUpperCase() === sentinel) return null;
        break;
    }
    const after = body + ' ' + sentinel + (comment ? ' ' + comment : '') + eol;
    if (after === original) return null;
    const isThen = sentinel === 'THEN';
    return {
        id: 'qf-sentinel-' + sentinel + '-' + line,
        kind: 'sentinel',
        code: isThen ? 'QF_INSERT_THEN' : 'QF_INSERT_DO',
        severity: 'error',
        qualified: true,
        line: line,
        before: original,
        after: after,
        reason: isThen ? 'Add the required THEN to end the IF condition.' : 'Add the required DO to end the loop header.',
        suggestion: (issue && issue.suggestion) || (isThen ? 'Every IF must end its condition with THEN.' : 'Every loop header must end with DO.'),
        detail: { sentinel: sentinel }
    };
}

function pseudopyMismatchFix(lines, issue) {
    const d = issue.detail || {};
    const line = d.closeLine || issue.line;
    if (!line || line < 1 || line > lines.length) return null;
    if (!d.expected || !d.found) return null;
    const original = lines[line - 1];
    const pattern = new RegExp('\\bEND[ \\t]+' + pseudopyEscapeRegExp(d.found) + '\\b', 'i');
    if (!pattern.test(original)) return null;
    const after = original.replace(pattern, 'END ' + d.expected);
    if (after === original) return null;
    return {
        id: 'qf-mismatch-' + line,
        kind: 'mismatch',
        code: 'QF_REWRITE_CLOSING',
        severity: 'error',
        qualified: true,
        line: line,
        before: original,
        after: after,
        reason: 'Replace END ' + d.found + ' with END ' + d.expected + ' to close the innermost block.',
        suggestion: issue.suggestion,
        detail: { expected: d.expected, found: d.found, openLine: d.openLine }
    };
}

function pseudopyTypoFixFromLegacy(legacy) {
    return {
        id: 'qf-keyword-' + legacy.line + '-' + legacy.after,
        kind: 'keyword',
        code: 'QF_MISSPELLED_KEYWORD',
        severity: 'error',
        qualified: true,
        line: legacy.line,
        before: legacy.before,
        after: legacy.after,
        reason: legacy.reason,
        suggestion: legacy.reason,
        detail: {}
    };
}

function pseudopyGenericTypoFix(lines, issue) {
    // 'Unrecognized statement: X' where X is a close misspelling of a
    // statement keyword AND is not an assignment left-hand side.
    const word = /Unrecognized statement:\s*([A-Za-z_]\w*)/.exec(issue.message || '');
    const line = issue.line;
    if (!word || !line || line < 1 || line > lines.length) return null;
    const original = lines[line - 1];
    const first = /^(\s*)([A-Za-z_]\w*)\b/.exec(original);
    if (!first) return null;
    if (/^\s*(?:=|:=|←|<-|\[)/.test(original.slice(first[0].length))) return null;
    const typed = first[2].toUpperCase();
    if ((typeof COMPILER_KEYWORDS !== 'undefined' && COMPILER_KEYWORDS.has(typed)) || typed === word[1].toUpperCase() && /^[A-Z]+$/.test(word[1] || '')) {
        // Never rewrite a known keyword or an already-uppercase unknown token
        // that the lexer already classified as a keyword.
        return null;
    }
    let best = null, bestDist = Infinity;
    for (const kw of PSEUDOPY_STATEMENT_KEYWORDS) {
        const d = compilerLevenshtein(typed, kw);
        if (d < bestDist && d <= 2 && d > 0) { bestDist = d; best = kw; }
    }
    if (!best) return null;
    const after = first[1] + best + original.slice(first[0].length);
    return {
        id: 'qf-keyword-' + line + '-' + best,
        kind: 'keyword',
        code: 'QF_MISSPELLED_KEYWORD',
        severity: 'error',
        qualified: true,
        line: line,
        before: original,
        after: after,
        reason: 'Correct a misspelled statement keyword (' + first[2] + ' → ' + best + ').',
        suggestion: issue.suggestion,
        detail: { expected: best, found: first[2] }
    };
}

/**
 * Turn a compile result and the ORIGINAL editor source into Quick Fix
 * candidates. Only `qualified: true` candidates are ever applied; the rest
 * are educational guidance that requires user input (e.g. DECLARE choices).
 */
function pseudopyQuickFixCandidates(source, result) {
    const lines = source.split('\n');
    const out = [];
    const seen = new Set();
    const pushFix = fix => {
        if (!fix) return;
        const key = pseudopyFixKey(fix);
        if (seen.has(key)) return;
        seen.add(key);
        if (fix.kind === 'keyword' && out.some(f => f.kind === 'keyword' && f.line === fix.line)) return;
        fix.sourceRevision = source;
        out.push(fix);
    };

    const errors = pseudopyDedupeDiagnostics(result && result.errors);

    // 1) Missing THEN / DO sentinels (line-level, unambiguous).
    for (const err of errors) {
        if (err && err.fixKind === 'insert-sentinel' && err.detail && err.detail.sentinel) {
            pushFix(pseudopySentinelInsertFix(lines, err.line, err.detail.sentinel, err));
        }
    }

    // 2) Mismatched closing keyword combined with 3) unclosed blocks.
    // When the parser sees END X while a different block is innermost open, the
    // cleanest single repair is: rewrite that END line to the expected closer
    // (which closes the innermost block) AND insert closures for whatever else
    // is still open before the final bare END. The rewrote-away block is
    // excluded from the insertion so the pair never double-closes.
    const mismatch = errors.find(err => err && err.fixKind === 'rewrite-closing-keyword');
    const mismatchFix = mismatch ? pseudopyMismatchFix(lines, mismatch) : null;

    const bareEndIndexes = lines.map((text, i) => pseudopyIsBareEndLine(text) ? i : -1).filter(i => i >= 0);
    if (bareEndIndexes.length === 1 && !errors.some(e => e.code === 'PARSE_CODE_AFTER_END')) {
        const endLine = bareEndIndexes[bareEndIndexes.length - 1] + 1; // 1-based, last END line
        const open = [];
        const seenOpen = new Set();
        for (const err of errors) {
            if (err && err.fixKind === 'close-block' && err.detail && err.detail.blockType && err.line >= 1 && err.line <= lines.length) {
                const key = err.line + ':' + err.detail.blockType;
                if (seenOpen.has(key)) continue;
                seenOpen.add(key);
                open.push({ line: err.line, blockType: err.detail.blockType });
            }
        }
        open.sort((a, b) => b.line - a.line);
        // The block the mismatch rewrite closes is the innermost still-open one
        // (deepest line); it must NOT also be inserted.
        let excluded = null;
        if (mismatchFix && open.length) {
            const deepest = open[0];
            if (deepest.blockType === mismatchFix.detail.expected) { excluded = deepest; }
        }
        const toClose = excluded ? open.filter(o => o !== excluded) : open.slice();
        if (toClose.length && !toClose.some(o => o.line === endLine)) {
            const eol = lines.some(l => /\r$/.test(l)) ? '\r' : '';
            const insertedLines = toClose.map(o => pseudopyLineIndent(lines[o.line - 1]) + 'END ' + o.blockType + eol);
            const names = toClose.slice().reverse().map(o => o.blockType).join(' and ');
            pushFix({
                id: 'qf-close-block-' + endLine,
                kind: 'close-block',
                code: 'QF_CLOSE_BLOCK',
                severity: 'error',
                qualified: true,
                line: toClose[0].line,
                insertBeforeLine: endLine,
                before: lines[endLine - 1],
                insertedLines: insertedLines,
                after: insertedLines.join('\n') + '\n' + lines[endLine - 1],
                reason: 'Close the unclosed ' + names + ' block(s) before the final END.',
                suggestion: 'Insert the matching END ' + names + ' to close the block(s).',
                detail: { blocks: toClose.map(o => o.blockType), openLines: toClose.map(o => o.line) }
            });
        }
        if (mismatchFix) pushFix(mismatchFix);
    }

    // 4) Misspelled statement keywords (known dictionary + conservative
    //    Levenshtein for otherwise-unrecognized first words).
    for (const legacy of pseudopyCorrectionSuggestions(source)) pushFix(pseudopyTypoFixFromLegacy(legacy));
    for (const err of errors) {
        if (err && /Unrecognized statement:/.test(err.message || '')) pushFix(pseudopyGenericTypoFix(lines, err));
    }

    // 5) Undeclared-variable guidance: surfaced, NEVER auto-applied (the type
    //    and insertion point are the user's decision).
    const warnings = pseudopyDedupeDiagnostics(result && result.warnings);
    for (const w of warnings) {
        if (w && w.fixKind === 'declare') {
            const key = 'undeclared:' + w.line + ':' + (w.detail && w.detail.variable || '');
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({
                id: 'qf-declare-' + w.line,
                kind: 'undeclared',
                code: 'QF_UNDECLARED_GUIDANCE',
                severity: 'warning',
                qualified: false,
                line: w.line,
                before: null,
                after: null,
                reason: "Variable '" + (w.detail && w.detail.variable || '?') + "' is used before it is declared.",
                suggestion: w.suggestion,
                detail: { variable: w.detail && w.detail.variable }
            });
        }
    }
    return out;
}

// ── Transactional edits ─────────────────────────────────────────────────────

function pseudopyFixSpan(fix) {
    return fix.insertBeforeLine ? { start: fix.insertBeforeLine, end: fix.insertBeforeLine }
        : { start: fix.line, end: fix.line };
}

function pseudopySpansOverlap(a, b) {
    return a.start <= b.end && b.start <= a.end;
}

function pseudopyValidateFixes(source, fixes) {
    const lines = source.split('\n');
    const seen = [];
    for (const fix of fixes) {
        if (!fix || !fix.qualified) throw new Error('This suggestion requires manual correction.');
        if (fix.sourceRevision !== source) throw new Error('Source changed. Review the suggestions again.');
        if (fix.insertBeforeLine) {
            const idx = fix.insertBeforeLine - 1;
            if (idx < 0 || idx >= lines.length) throw new Error('Fix no longer fits the current source. Review the suggestions again.');
            if (lines[idx] !== fix.before) throw new Error('Source changed. Review the suggestions again.');
        } else {
            const idx = fix.line - 1;
            if (idx < 0 || idx >= lines.length) throw new Error('Fix no longer fits the current source. Review the suggestions again.');
            if (lines[idx] !== fix.before) throw new Error('Source changed. Review the suggestions again.');
        }
        for (const other of seen) {
            if (pseudopySpansOverlap(pseudopyFixSpan(fix), pseudopyFixSpan(other))) {
                throw new Error('Suggested fixes overlap. Apply them one at a time.');
            }
        }
        seen.push(fix);
    }
    return lines;
}

/**
 * Apply a set of fixes atomically: every fix is validated first, and any stale
 * or overlapping fix aborts the whole batch so the editor is never left in a
 * half-edited state.
 */
function pseudopyApplyBatch(source, fixes) {
    const layout = pseudopyValidateFixes(source, fixes);
    const applied = [];
    const insertions = [];
    for (const fix of fixes) {
        if (fix.insertBeforeLine) {
            insertions.push({ index: fix.insertBeforeLine - 1, lines: (fix.insertedLines || []).slice(), fix: fix });
        } else {
            layout[fix.line - 1] = fix.after;
            applied.push(fix);
        }
    }
    if (insertions.length) {
        insertions.sort((a, b) => a.index - b.index);
        const next = [];
        let at = 0;
        for (const ins of insertions) {
            next.push(...layout.slice(at, ins.index));
            next.push(...ins.lines);
            at = ins.index;
            applied.push(ins.fix);
        }
        next.push(...layout.slice(at));
        return { source: next.join('\n'), applied: applied, rejected: [] };
    }
    return { source: layout.join('\n'), applied: applied, rejected: [] };
}

function pseudopyApplyQuickFix(source, fix) {
    return pseudopyApplyBatch(source, [fix]).source;
}

// ── Refresh of Python/console results (never executes) ─────────────────────

function pseudopyMarkStale(element) {
    if (!element) return;
    const text = (element.textContent || '').trim();
    if (!text) return;
    if (element.querySelector && element.querySelector('.assistance-stale-note')) return;
    const note = document.createElement('div');
    note.className = 'assistance-stale-note';
    note.textContent = 'This output belongs to an earlier version of your pseudocode. Run again to see the updated result.';
    if (element.prepend) element.prepend(note);
    element.classList.add('is-stale');
}

function pseudopyRefreshOutcome(source, target) {
    target = target || {};
    const outputId = target.outputId;
    const consoleId = target.consoleId;
    const runBtnSelector = target.runBtnSelector;
    let result;
    if (typeof pseudocodeToPython === 'function') {
        const tracing = compilerTrace.enabled;
        const simulation = simulationTracer.enabled;
        compilerTrace.enabled = false;
        simulationTracer.enabled = false;
        try { result = pseudocodeToPython(source); }
        catch (error) {
            result = { valid: false, python: '', warnings: [], errors: [{ line: 1, message: error && error.message || String(error) }] };
        }
        finally { compilerTrace.enabled = tracing; simulationTracer.enabled = simulation; }
    } else {
        try { result = pseudopyReviewSource(source); }
        catch (error) {
            result = { valid: false, python: '', warnings: [], errors: [{ line: 1, message: error && error.message || String(error) }] };
        }
    }
    const consoleEl = consoleId ? document.getElementById(consoleId) : null;
    const runBtn = runBtnSelector ? (typeof $qs === 'function' ? $qs(runBtnSelector) : document.querySelector(runBtnSelector)) : null;
    if (!result.valid) {
        if (outputId && typeof setPythonOutput === 'function') {
            setPythonOutput(outputId, '# Translation failed due to errors in your pseudocode.\n# Check the panel below for details.');
        }
        if (consoleEl) {
            consoleEl.innerHTML = typeof renderHtmlErrors === 'function' ? renderHtmlErrors(result.errors || []) : JSON.stringify(result.errors || []);
            consoleEl.className = 'output-content error';
        }
        if (runBtn) runBtn.disabled = true;
        if (outputId === 'python-output') {
            currentErrorLineNumbers = (result.errors || []).map(e => e.line);
            currentConsoleErrors = result.errors || [];
            if (typeof updateGutter === 'function') updateGutter();
        }
        return result;
    }
    if (outputId && typeof setPythonOutput === 'function') setPythonOutput(outputId, result.python);
    if (consoleEl) {
        const base = consoleEl.className || '';
        consoleEl.innerHTML = '';
        consoleEl.className = base.replace('error', '').trim() || 'output-content';
        consoleEl.textContent = 'Pseudocode refreshed. Run the updated program to see its output.' +
            (result.warnings && result.warnings.length ? '\n' + result.warnings.map(w => 'Line ' + w.line + ': ' + w.message).join('\n') : '');
    }
    if (runBtn) runBtn.disabled = false;
    if (outputId === 'python-output') {
        currentErrorLineNumbers = [];
        currentConsoleErrors = [];
        if (typeof updateGutter === 'function') updateGutter();
    }
    return result;
}

// ── DOM build helpers ───────────────────────────────────────────────────────

function pseudopyEl(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function pseudopyInsertSvgIcon(node, paths) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '20');
    svg.setAttribute('height', '20');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', paths);
    svg.appendChild(path);
    node.appendChild(svg);
}

// ── Managed review dialog ──────────────────────────────────────────────────

function pseudopyShowReview(editorState) {
    const editor = editorState.editor;
    const initialSource = editor.value;
    let returnFocusToEditor = false;
    if (editor.id === 'pseudocode-editor') editorState.priorErrorLines = currentErrorLineNumbers.slice();
    const dialog = document.createElement('dialog');
    dialog.className = 'source-assistance-dialog';
    dialog.setAttribute('aria-label', 'Fix pseudocode');

    const header = pseudopyEl('header', 'source-assistance-header');
    const titleRow = pseudopyEl('div', 'source-assistance-title');
    const mark = pseudopyEl('span', 'source-assistance-mark');
    pseudopyInsertSvgIcon(mark, 'M4 20l13-13 3 3L7 23zM14 10l3 3M5 3v6M2 6h6M19 1v4M17 3h4');
    const heading = pseudopyEl('h2', 'source-assistance-heading', 'Fix Pseudocode');
    const count = pseudopyEl('span', 'source-assistance-count');
    titleRow.append(mark, heading, count);
    const closeBtn = pseudopyEl('button', 'source-assistance-close');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.title = 'Close';
    pseudopyInsertSvgIcon(closeBtn, 'M6 6l12 12M18 6L6 18');
    closeBtn.addEventListener('click', () => dialog.close());
    header.append(titleRow, closeBtn);

    const body = pseudopyEl('div', 'source-assistance-body');
    const status = pseudopyEl('div', 'source-assistance-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const cards = pseudopyEl('div', 'source-assistance-cards');
    body.append(status, cards);

    const footer = pseudopyEl('footer', 'source-assistance-footer');
    const undoBtn = pseudopyEl('button', 'btn btn-ghost btn-sm', 'Undo');
    undoBtn.disabled = true;
    const applyAllBtn = pseudopyEl('button', 'btn btn-primary', 'Apply all safe fixes');
    applyAllBtn.disabled = true;
    const closeFooter = pseudopyEl('button', 'btn btn-secondary btn-sm', 'Close');
    closeFooter.addEventListener('click', () => dialog.close());
    footer.append(undoBtn, applyAllBtn, closeFooter);

    dialog.append(header, body, footer);

    const notice = text => { if (status) status.textContent = text; };

    const state = {
        editor: editor,
        undo: null,
        qualifiedFixes: [],
        target: editor.id === 'pseudocode-editor'
            ? { outputId: 'python-output', consoleId: 'console-output', runBtnSelector: '#btn-run-code' }
            : editor.id === 'translate-input'
                ? { outputId: 'translate-output', consoleId: 'translate-console', runBtnSelector: '#btn-run-translate' }
                : null
    };

    const commit = newSource => {
        const before = editor.value;
        editor.value = newSource;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        state.undo = { before: before, after: newSource };
        undoBtn.disabled = false;
        if (state.target && state.target.consoleId) {
            const c = document.getElementById(state.target.consoleId);
            if (c) pseudopyMarkStale(c);
        }
        pseudopyRefreshOutcome(newSource, state.target);
        notice('Corrections applied and revalidated. Python was refreshed without running it.');
        render();
    };

    const undo = () => {
        const u = state.undo;
        if (!u) { notice('Nothing to undo yet.'); return; }
        if (editor.value !== u.after) {
            notice('Source changed since the correction. Undo was skipped to preserve your edits.');
            return;
        }
        editor.value = u.before;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        state.undo = null;
        undoBtn.disabled = true;
        if (state.target && state.target.consoleId) {
            const c = document.getElementById(state.target.consoleId);
            if (c) pseudopyMarkStale(c);
        }
        pseudopyRefreshOutcome(u.before, state.target);
        notice('Previous source restored. Revalidated without running Python.');
        render();
    };
    undoBtn.addEventListener('click', undo);

    applyAllBtn.addEventListener('click', () => {
        const fixes = state.qualifiedFixes;
        if (!fixes.length) { notice('No safe fixes are available right now.'); return; }
        let next;
        try { next = pseudopyApplyBatch(editor.value, fixes); }
        catch (error) { notice(error.message); render(); return; }
        if (!next.applied.length) { notice('Nothing to apply — the suggestions no longer match the source.'); render(); return; }
        commit(next.source);
    });

    const applyOne = fix => {
        try {
            const next = pseudopyApplyBatch(editor.value, [fix]);
            commit(next.source);
        } catch (error) { notice(error.message); render(); }
    };

    const goToLine = line => {
        if (!line || line < 1) return;
        returnFocusToEditor = true;
        dialog.close();
        editor.focus();
        const lines = editor.value.split('\n');
        const start = lines.slice(0, line - 1).reduce((sum, l) => sum + l.length + 1, 0);
        editor.setSelectionRange(start, start + (lines[line - 1] || '').length);
        editor.scrollTop = (line - 1) * (parseFloat(getComputedStyle(editor).lineHeight) || 20);
        editor.dispatchEvent(new Event('scroll'));
    };

    const render = () => {
        const source = editor.value;
        let result;
        try { result = pseudopyReviewSource(source); }
        catch (error) {
            result = { valid: false, errors: [{ line: 1, message: 'Validation unavailable. Your source is unchanged; try again when the compiler is ready.' }], warnings: [] };
        }
        const diags = pseudopyDedupeDiagnostics([...(result.errors || []), ...(result.warnings || [])]);
        const fixes = pseudopyQuickFixCandidates(source, result);
        state.qualifiedFixes = fixes.filter(f => f.qualified);
        applyAllBtn.disabled = state.qualifiedFixes.length === 0;

        const issueCount = diags.length;
        count.textContent = issueCount + ' issue' + (issueCount === 1 ? '' : 's') + ' · ' + state.qualifiedFixes.length + ' safe fix' + (state.qualifiedFixes.length === 1 ? '' : 'es');

        cards.replaceChildren();
        let shown = 0;

        // Per-diagnostic cards.
        for (const diag of diags) {
            const line = diag.line;
            const isWarning = diag.severity === 'warning';
            const fixAtLine = !isWarning && fixes.find(f => f.qualified && f.kind !== 'close-block' && f.line === line) || null;
            if (fixAtLine) {
                const card = pseudopyBuildFixCard(fixAtLine, applyOne, goToLine);
                cards.append(card);
                shown++;
                continue;
            }
            const card = pseudopyEl('section', 'assistance-card ' + (isWarning ? 'assistance-card-warning' : 'assistance-card-error'));
            const head = pseudopyEl('div', 'assistance-card-head');
            head.append(
                pseudopyEl('span', 'assistance-badge ' + (isWarning ? 'assistance-badge-warning' : 'assistance-badge-error'), isWarning ? 'Warning' : 'Error'),
                pseudopyEl('span', 'assistance-loc', line ? 'Line ' + line : '')
            );
            card.append(head);
            card.append(pseudopyEl('p', 'assistance-message', diag.message || ''));
            if (diag.suggestion) card.append(pseudopyEl('p', 'assistance-suggestion', diag.suggestion));
            const guidance = fixes.find(f => !f.qualified && f.line === line);
            if (guidance) {
                const note = pseudopyEl('div', 'assistance-guidance');
                note.textContent = 'Guidance only — this needs your input.';
                card.append(note);
            }
            if (line > 0) {
                const go = pseudopyEl('button', 'btn btn-secondary btn-sm', 'Go to line ' + line);
                go.addEventListener('click', () => goToLine(line));
                card.append(go);
            }
            cards.append(card);
            shown++;
        }

        // Standalone auto-fix card for the bundled unclosed-block closure.
        for (const fix of fixes) {
            if (fix.kind === 'close-block') {
                cards.append(pseudopyBuildFixCard(fix, applyOne, goToLine));
                shown++;
            }
        }

        if (result.valid) {
            const success = pseudopyEl('section', 'assistance-card assistance-card-ok');
            success.append(pseudopyEl('p', 'assistance-message', 'Syntax accepted. Verify inputs, calculations, and expected output before submitting.'));
            cards.append(success);
            shown++;
        }
        if (!shown) {
            cards.append(pseudopyEl('p', 'assistance-empty', 'No corrections suggested.'));
        }

        pseudopyUpdateHighlights(editorState, (result.errors || []).map(e => e.line));
        pseudopyReviewRefreshGutter(editorState);
    };

    dialog.addEventListener('close', () => {
        if (editor.id === 'pseudocode-editor' && editor.value !== initialSource) {
            editorState.priorErrorLines = currentErrorLineNumbers.slice();
        }
        pseudopyRestoreHighlights(editorState);
        dialog.remove();
        (returnFocusToEditor ? editor : editorState.button).focus();
    });
    document.body.append(dialog);
    render();
    dialog.showModal();
    (applyAllBtn.disabled ? closeBtn : applyAllBtn).focus();
}

function pseudopyBuildFixCard(fix, applyOne, goToLine) {
    const card = pseudopyEl('section', 'assistance-card assistance-card-fix');
    const head = pseudopyEl('div', 'assistance-card-head');
    head.append(
        pseudopyEl('span', 'assistance-badge assistance-badge-fix', 'Fix'),
        pseudopyEl('span', 'assistance-loc', fix.line ? 'Line ' + fix.line : '')
    );
    card.append(head);
    card.append(pseudopyEl('p', 'assistance-message', fix.reason || ''));
    if (fix.suggestion) card.append(pseudopyEl('p', 'assistance-suggestion', fix.suggestion));
    const preview = pseudopyEl('pre', 'assistance-preview');
    if (fix.insertBeforeLine && fix.insertedLines && fix.insertedLines.length) {
        preview.textContent = 'Before:\n' + fix.before + '\nAfter:\n' + fix.insertedLines.join('\n') + '\n' + fix.before;
    } else if (fix.before !== undefined && fix.after !== undefined) {
        preview.textContent = 'Before: ' + fix.before + '\nAfter:  ' + fix.after;
    }
    card.append(preview);
    const actions = pseudopyEl('div', 'assistance-actions');
    if (fix.qualified) {
        const apply = pseudopyEl('button', 'btn btn-primary btn-sm', 'Apply this fix');
        apply.addEventListener('click', () => applyOne(fix));
        actions.append(apply);
    }
    if (fix.line > 0) {
        const go = pseudopyEl('button', 'btn btn-secondary btn-sm', 'Go to line ' + fix.line);
        go.addEventListener('click', () => goToLine(fix.line));
        actions.append(go);
    }
    card.append(actions);
    return card;
}

// ── Editor line markers ─────────────────────────────────────────────────────

function pseudopyUpdateHighlights(editorState, errorLines) {
    const editor = editorState.editor;
    const lines = [...new Set((errorLines || []).filter(n => n > 0))];
    if (typeof window !== 'undefined') {
        if (!window.__pseudopyActiveErrorLines) window.__pseudopyActiveErrorLines = {};
        window.__pseudopyActiveErrorLines[editor.id] = lines;
    }
    if (editor.id === 'pseudocode-editor' && typeof updateGutter === 'function') {
        currentErrorLineNumbers = lines;
        updateGutter();
    }
}

function pseudopyReviewRefreshGutter(editorState) {
    if (editorState.syncGutter && typeof window !== 'undefined' && window.__pseudopyActiveErrorLines) {
        editorState.syncGutter(window.__pseudopyActiveErrorLines[editorState.editor.id] || []);
    }
}

// Latest silent, trace-free result from realtime-validation (debounced typing).
// Kept as a fresh snapshot the wand can consult; the review dialog always
// revalidates on open so this is advisory, not authoritative.
let pseudopyLiveValidation = null;

function pseudopyRestoreHighlights(editorState) {
    const editor = editorState.editor;
    if (typeof window !== 'undefined' && window.__pseudopyActiveErrorLines) {
        window.__pseudopyActiveErrorLines[editor.id] = [];
    }
    if (editor.id === 'pseudocode-editor' && typeof updateGutter === 'function') {
        currentErrorLineNumbers = editorState.priorErrorLines || [];
        updateGutter();
    }
    if (editorState.syncGutter) editorState.syncGutter([]);
}

function setupPseudopyAssistance() {
    const ids = ['pseudocode-editor', 'translate-input', 'devtools-pseudocode'];
    ids.forEach(id => {
        const editor = document.getElementById(id);
        if (!editor || editor.dataset.assistance) return;
        editor.dataset.assistance = 'ready';
        const host = editor.parentElement;
        host.classList.add('source-assistance-host');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'source-assistance-wand';
        button.setAttribute('aria-label', 'Review pseudocode and suggested corrections');
        button.title = 'Review pseudocode';
        button.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="m4 20 13-13 3 3L7 23zM14 10l3 3M5 3v6M2 6h6M19 1v4M17 3h4"/></svg>';
        host.append(button);

        const editorState = { editor: editor, button: button, priorErrorLines: [], syncGutter: null };

        if (id === 'devtools-pseudocode') {
            const gutter = document.createElement('pre');
            gutter.className = 'source-assistance-gutter';
            gutter.setAttribute('aria-hidden', 'true');
            host.append(gutter);
            editor.classList.add('source-assistance-numbered');
            editor.wrap = 'off';
            let previous;
            const sync = lines => {
                const value = editor.value;
                if (previous !== value) previous = value;
                const mark = Array.isArray(lines) ? lines : [];
                let html = '';
                value.split('\n').forEach((_, i) => {
                    const n = i + 1;
                    html += '<div' + (mark.indexOf(n) >= 0 ? ' class="assistance-error-line"' : '') + '>' + n + '</div>';
                });
                gutter.innerHTML = html;
                gutter.scrollTop = editor.scrollTop;
            };
            const syncValues = () => {
                if (previous !== editor.value) {
                    previous = editor.value;
                    const active = window.__pseudopyActiveErrorLines && window.__pseudopyActiveErrorLines[editor.id];
                    sync(active || []);
                }
                gutter.scrollTop = editor.scrollTop;
            };
            editor.addEventListener('input', syncValues);
            editor.addEventListener('scroll', syncValues);
            // Existing imports and attempt restoration assign .value directly.
            setInterval(() => { if (editor.getClientRects().length) syncValues(); }, 300);
            syncValues();
            editorState.syncGutter = sync;
        }

        button.addEventListener('click', () => pseudopyShowReview(editorState));

        if (id === 'pseudocode-editor' && typeof setRealtimeValidationHandler === 'function') {
            setRealtimeValidationHandler(entry => { pseudopyLiveValidation = entry; });
        }
    });
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupPseudopyAssistance);
    else setupPseudopyAssistance();
}
