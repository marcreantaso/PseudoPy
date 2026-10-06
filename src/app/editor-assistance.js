/* Local, opt-in source assistance. Suggestions never execute student code. */
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

        if (id === 'devtools-pseudocode') {
            const gutter = document.createElement('pre');
            gutter.className = 'source-assistance-gutter';
            gutter.setAttribute('aria-hidden', 'true');
            host.append(gutter);
            editor.classList.add('source-assistance-numbered');
            editor.wrap = 'off';
            let previous;
            const sync = () => {
                if (previous !== editor.value) {
                    previous = editor.value;
                    gutter.textContent = editor.value.split('\n').map((_, i) => i + 1).join('\n');
                }
                gutter.scrollTop = editor.scrollTop;
            };
            editor.addEventListener('input', sync);
            editor.addEventListener('scroll', sync);
            // Existing imports and attempt restoration assign .value directly.
            setInterval(() => { if (editor.getClientRects().length) sync(); }, 300);
            sync();
        }

        button.addEventListener('click', () => {
            const dialog = document.createElement('dialog');
            dialog.className = 'source-assistance-dialog';
            dialog.setAttribute('aria-label', 'Review pseudocode');
            const heading = document.createElement('h2');
            heading.textContent = 'Review pseudocode';
            const help = document.createElement('p');
            help.textContent = 'Review each change before applying. Syntax checks cannot prove that your algorithm solves the intended problem. Translate and run again after editing.';
            const content = document.createElement('div');
            const notice = document.createElement('p');
            notice.setAttribute('role', 'status');
            const undo = document.createElement('button');
            undo.textContent = 'Undo correction';
            undo.disabled = true;
            let lastChange = null;
            const update = value => {
                editor.value = value;
                editor.dispatchEvent(new Event('input', { bubbles: true }));
            };
            const refresh = () => {
                content.replaceChildren();
                const fixes = pseudopyCorrectionSuggestions(editor.value);
                fixes.forEach(fix => {
                    const row = document.createElement('section');
                    const label = document.createElement('p');
                    label.textContent = 'Line ' + fix.line + ': ' + fix.reason;
                    const preview = document.createElement('pre');
                    preview.textContent = 'Before: ' + fix.before + '\nAfter:  ' + fix.after;
                    const apply = document.createElement('button');
                    apply.textContent = 'Apply this correction';
                    apply.onclick = () => {
                        try {
                            const before = editor.value;
                            const after = pseudopyApplyCorrection(before, fix);
                            update(after);
                            lastChange = { before, after };
                            undo.disabled = false;
                            notice.textContent = 'Correction applied. Translate again to update Python and console results.';
                            refresh();
                        } catch (error) { notice.textContent = error.message; refresh(); }
                    };
                    row.append(label, preview, apply);
                    content.append(row);
                });
                if (!fixes.length) {
                    const text = document.createElement('p');
                    text.textContent = 'No automatic keyword corrections available. Review the compiler guidance below.';
                    content.append(text);
                }
                // Compile only on explicit review/apply; never execute Python.
                try {
                    const result = pseudopyReviewSource(editor.value);
                    [...(result.errors || []), ...(result.warnings || [])].forEach(issue => {
                        const row = document.createElement('p');
                        row.textContent = 'Line ' + (issue.line || '?') + ': ' + issue.message + ' ' + (issue.suggestion || '');
                        if (issue.line > 0) {
                            const jump = document.createElement('button');
                            jump.textContent = 'Go to line ' + issue.line;
                            jump.onclick = () => {
                                dialog.close();
                                editor.focus();
                                const lines = editor.value.split('\n');
                                const start = lines.slice(0, issue.line - 1).reduce((sum, line) => sum + line.length + 1, 0);
                                editor.setSelectionRange(start, start + (lines[issue.line - 1] || '').length);
                                editor.scrollTop = (issue.line - 1) * (parseFloat(getComputedStyle(editor).lineHeight) || 20);
                                editor.dispatchEvent(new Event('scroll'));
                            };
                            row.append(jump);
                        }
                        content.append(row);
                    });
                    if (result.valid) {
                        const success = document.createElement('p');
                        success.textContent = 'Syntax accepted. Verify inputs, calculations, and expected output before submitting.';
                        content.append(success);
                    }
                } catch (_) { notice.textContent = 'Validation unavailable. Your source is unchanged; try again when the compiler is ready.'; }
            };
            undo.onclick = () => {
                if (!lastChange || editor.value !== lastChange.after) {
                    notice.textContent = 'Source changed since the correction. Undo was skipped to preserve your edits.';
                    return;
                }
                update(lastChange.before);
                undo.disabled = true;
                notice.textContent = 'Correction undone.';
                refresh();
            };
            const close = document.createElement('button');
            close.textContent = 'Close';
            close.onclick = () => dialog.close();
            dialog.append(heading, help, content, notice, undo, close);
            dialog.addEventListener('close', () => { dialog.remove(); button.focus(); });
            document.body.append(dialog);
            refresh();
            dialog.showModal();
        });
    });
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupPseudopyAssistance);
    else setupPseudopyAssistance();
}
