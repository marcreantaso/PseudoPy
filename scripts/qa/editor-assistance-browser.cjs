// Real Chromium regression checks. Screenshots default to the OS temporary directory.
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { start } = require('./serve.cjs');
const { launchChrome, newPage, closePage, waitFor, sleep } = require('./cdp.cjs');

const OUT = process.env.QA_OUT || path.join(os.tmpdir(), 'opencode', 'pseudopy-assistance');
const SOURCE = 'BEGIN\nIF x = 1\nDISPLAY 1\nEND IF\nEND';
const FOR_SOURCE = 'BEGIN\nFOR i 1 TO 10 DO\nDISPLAY i\nEND FOR\nEND';
const FOR_CONDITION = 'BEGIN\nFOR i <= 10 DO\nDISPLAY i\nEND FOR\nEND';

(async () => {
    const server = await start(0);
    const chrome = await launchChrome();
    let page;
    try {
        page = await newPage(chrome.wsUrl, 'http://127.0.0.1:' + server.address().port);
        await waitFor(page, 'typeof showApp === "function" && typeof pseudopyReviewSource === "function"');
        await page.run(`
            onbShouldAutoStart = () => false;
            try { onbStop(); } catch (_) {}
            hideBootSplash();
            currentUser = { id: 'qa_assistance', _docId: 'qa_assistance', username: 'qa', fullName: 'QA', role: 'student', status: 'active' };
            showApp('write-pseudocode');
            return true;
        `);
        const errorsBefore = page.consoleErrors.length;
        for (const theme of ['light', 'dark']) {
            for (const width of [320, 375, 768, 1440]) {
                await page.setViewport(width, 900, 1, width < 768);
                await page.run(`
                    document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)});
                    const editor = document.getElementById('pseudocode-editor');
                    editor.value = ${JSON.stringify(SOURCE)};
                    editor.dispatchEvent(new Event('input', { bubbles: true }));
                    compilerTrace.enable(); simulationTracer.enable();
                    compilerTrace.emit({type: 'ASSISTANCE_QA'});
                    window.__qaTraceBefore = JSON.stringify([compilerTrace.events, simulationTracer.events]);
                    editor.parentElement.querySelector('.source-assistance-wand').click();
                    return true;
                `);
                const state = await page.run(`
                    const d = document.querySelector('.source-assistance-dialog[open]');
                    const r = d.getBoundingClientRect();
                    return { left: r.left, right: r.right, bottom: r.bottom, width: r.width,
                        vw: innerWidth, vh: innerHeight, overflow: d.scrollWidth > d.clientWidth,
                        fixes: d.querySelectorAll('.assistance-card-fix').length,
                        warnings: d.querySelectorAll('.assistance-card-warning').length,
                        styled: getComputedStyle(d.querySelector('.assistance-card')).paddingLeft,
                        icon: !!d.querySelector('.source-assistance-close svg') };
                `);
                assert.equal(state.fixes, 1, 'one fix, even with a warning on the same line');
                assert.equal(state.warnings, 1, 'warning remains visible');
                assert.equal(state.styled, '14px');
                assert.ok(state.icon && !state.overflow);
                assert.ok(state.left >= -1 && state.right <= state.vw + 1);
                if (width < 640) assert.ok(Math.abs(state.bottom - state.vh) <= 1, 'bottom sheet');
                else assert.ok(Math.abs((state.left + state.right) / 2 - state.vw / 2) <= 1, 'centered');
                await page.screenshot(path.join(OUT, `${theme}-${width}-before.png`));
                const applied = await page.run(`
                    document.querySelector('.source-assistance-footer .btn-primary').click();
                    const editor = document.getElementById('pseudocode-editor');
                    return { source: editor.value,
                        python: document.getElementById('python-output').value,
                        console: document.getElementById('console-output').textContent,
                        traceUnchanged: window.__qaTraceBefore === JSON.stringify([compilerTrace.events, simulationTracer.events]),
                        tracing: compilerTrace.enabled && simulationTracer.enabled,
                        dialogClosed: !document.querySelector('.source-assistance-dialog'),
                        focused: document.activeElement === editor,
                        selected: editor.value.slice(editor.selectionStart, editor.selectionEnd),
                        undoVisible: !document.querySelector('.source-assistance-undo').classList.contains('hidden'),
                        valid: pseudopyReviewSource(editor.value).valid };
                `);
                assert.equal(applied.source, SOURCE.replace('IF x = 1', 'IF x = 1 THEN'));
                assert.ok(applied.valid && applied.python.includes('print('));
                assert.match(applied.console, /Run the updated program/);
                assert.ok(applied.traceUnchanged && applied.tracing, 'refresh preserves active debugger traces');
                assert.equal(applied.dialogClosed, true, 'applying closes the dialog');
                assert.equal(applied.focused, true, 'focus returns to the corrected editor');
                assert.equal(applied.selected, 'IF x = 1 THEN', 'the repaired line is selected');
                assert.equal(applied.undoVisible, true, 'host Undo is offered');
                await page.screenshot(path.join(OUT, `${theme}-${width}-after.png`));
                const undone = await page.run(`
                    const editor = document.getElementById('pseudocode-editor');
                    document.querySelector('.source-assistance-undo').click();
                    return { source: editor.value,
                        hidden: document.querySelector('.source-assistance-undo').classList.contains('hidden') };
                `);
                assert.equal(undone.source, SOURCE);
                assert.equal(undone.hidden, true, 'Undo lapses once used');
                await page.run(`document.querySelector('.source-assistance-wand').click(); return true;`);
                await waitFor(page, 'document.querySelector(".source-assistance-dialog[open]")');
                await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
                await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
                await waitFor(page, '!document.querySelector(".source-assistance-dialog")');
                assert.equal(await page.run('return document.activeElement.classList.contains("source-assistance-wand");'), true);
                console.log(`${theme} ${width}: layout, separate warning, Apply+close+jump, host Undo, Escape/focus passed`);
            }
        }
        // The console error card routes straight into the review dialog.
        await page.setViewport(1280, 900, 1);
        await page.run(`
            const editor = document.getElementById('pseudocode-editor');
            editor.value = ${JSON.stringify(SOURCE)};
            editor.dispatchEvent(new Event('input', { bubbles: true }));
            document.getElementById('btn-translate-pseudocode').click();
            return true;
        `);
        await waitFor(page, 'document.querySelector("#console-output .console-fix-btn")');
        await page.run('document.querySelector("#console-output .console-fix-btn").click(); return true;');
        await waitFor(page, 'document.querySelector(".source-assistance-dialog[open]")');
        assert.equal(await page.run('return document.querySelectorAll(".source-assistance-dialog[open] .assistance-card-fix").length;'), 1);
        await page.run('document.querySelector(".source-assistance-close").click(); return true;');
        await waitFor(page, '!document.querySelector(".source-assistance-dialog")');
        console.log('console error card opens the review dialog');
        // A broken FOR header is repaired in place and the editor jumps to it.
        const forRepair = await page.run(`
            const editor = document.getElementById('pseudocode-editor');
            editor.value = ${JSON.stringify(FOR_SOURCE)};
            editor.dispatchEvent(new Event('input', { bubbles: true }));
            editor.parentElement.querySelector('.source-assistance-wand').click();
            const card = document.querySelector('.source-assistance-dialog[open] .assistance-card-fix');
            const preview = card ? card.querySelector('.assistance-preview').textContent : '';
            document.querySelector('.source-assistance-footer .btn-primary').click();
            return { preview: preview,
                line: editor.value.split('\\n')[1],
                selected: editor.value.slice(editor.selectionStart, editor.selectionEnd),
                valid: pseudopyReviewSource(editor.value).valid };
        `);
        assert.match(forRepair.preview, /After: {2}FOR i FROM 1 TO 10 DO/);
        assert.equal(forRepair.line, 'FOR i FROM 1 TO 10 DO');
        assert.equal(forRepair.selected, 'FOR i FROM 1 TO 10 DO', 'editor selects the repaired header');
        assert.equal(forRepair.valid, true);
        // Condition-style FOR stays guidance: no Apply button, and a hint saying why.
        const guidance = await page.run(`
            const editor = document.getElementById('pseudocode-editor');
            editor.value = ${JSON.stringify(FOR_CONDITION)};
            editor.parentElement.querySelector('.source-assistance-wand').click();
            const dialog = document.querySelector('.source-assistance-dialog[open]');
            const hint = dialog.querySelector('.assistance-guidance');
            const result = { fixCards: dialog.querySelectorAll('.assistance-card-fix').length,
                hint: hint ? hint.textContent : '' };
            dialog.close();
            return result;
        `);
        assert.equal(guidance.fixCards, 0, 'condition-style FOR offers no safe fix');
        assert.match(guidance.hint, /WHILE/);
        console.log('FOR header repair jumps to the fixed line; condition-style FOR stays guidance');
        // The wand badge advertises the available safe fixes from live validation.
        await page.run(`
            const editor = document.getElementById('pseudocode-editor');
            editor.value = ${JSON.stringify(FOR_SOURCE)};
            editor.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
        `);
        await waitFor(page, '!document.querySelector(".source-assistance-badge").classList.contains("hidden")');
        assert.equal(await page.run('return document.querySelector(".source-assistance-badge").textContent;'), '1');
        console.log('wand badge reports the safe fix count');
        // Other editor targets, including DevTools: refresh must never invoke execution.
        for (const id of ['translate-input', 'devtools-pseudocode']) {
            const result = await page.run(`
                const editor = document.getElementById(${JSON.stringify(id)});
                editor.value = ${JSON.stringify(SOURCE)};
                editor.parentElement.querySelector('.source-assistance-wand').click();
                document.querySelector('.source-assistance-footer .btn-primary').click();
                return { valid: pseudopyReviewSource(editor.value).valid,
                    closed: !document.querySelector('.source-assistance-dialog') };
            `);
            assert.equal(result.valid, true, id);
            assert.equal(result.closed, true, id + ' closes after applying');
            await waitFor(page, '!document.querySelector(".source-assistance-dialog")');
        }
        await sleep(1100);
        assert.deepEqual(page.consoleErrors.slice(errorsBefore), []);
        console.log('Other editor targets passed; screenshots: ' + OUT);
    } finally {
        if (page) await closePage(page);
        chrome.child.kill();
        server.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
