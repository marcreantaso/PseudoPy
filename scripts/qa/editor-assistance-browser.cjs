// Real Chromium regression checks. Screenshots default to the OS temporary directory.
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { start } = require('./serve.cjs');
const { launchChrome, newPage, closePage, waitFor, sleep } = require('./cdp.cjs');

const OUT = process.env.QA_OUT || path.join(os.tmpdir(), 'opencode', 'pseudopy-assistance');
const SOURCE = 'BEGIN\nIF x = 1\nDISPLAY 1\nEND IF\nEND';

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
                    return { source: document.getElementById('pseudocode-editor').value,
                        python: document.getElementById('python-output').value,
                        console: document.getElementById('console-output').textContent,
                        traceUnchanged: window.__qaTraceBefore === JSON.stringify([compilerTrace.events, simulationTracer.events]),
                        tracing: compilerTrace.enabled && simulationTracer.enabled,
                        valid: pseudopyReviewSource(document.getElementById('pseudocode-editor').value).valid };
                `);
                assert.equal(applied.source, SOURCE.replace('IF x = 1', 'IF x = 1 THEN'));
                assert.ok(applied.valid && applied.python.includes('print('));
                assert.match(applied.console, /Run the updated program/);
                assert.ok(applied.traceUnchanged && applied.tracing, 'refresh preserves active debugger traces');
                await page.screenshot(path.join(OUT, `${theme}-${width}-after.png`));
                const undone = await page.run(`
                    document.querySelector('.source-assistance-footer .btn-ghost').click();
                    return document.getElementById('pseudocode-editor').value;
                `);
                assert.equal(undone, SOURCE);
                await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
                await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
                await waitFor(page, '!document.querySelector(".source-assistance-dialog")');
                assert.equal(await page.run('return document.activeElement.classList.contains("source-assistance-wand");'), true);
                console.log(`${theme} ${width}: layout, separate warning, Apply, Undo, trace preservation, Escape/focus passed`);
            }
        }
        // Other editor targets, including DevTools: refresh must never invoke execution.
        for (const id of ['translate-input', 'devtools-pseudocode']) {
            const result = await page.run(`
                const editor = document.getElementById(${JSON.stringify(id)});
                editor.value = ${JSON.stringify(SOURCE)};
                editor.parentElement.querySelector('.source-assistance-wand').click();
                document.querySelector('.source-assistance-footer .btn-primary').click();
                const valid = pseudopyReviewSource(editor.value).valid;
                document.querySelector('.source-assistance-close').click();
                return valid;
            `);
            assert.equal(result, true, id);
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
