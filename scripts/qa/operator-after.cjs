// Step 1 verification: after the operator/font fix, does the console render
// operators as separate characters, in the bundled no-ligature font, at both
// widths, in light and dark themes?
//
//   node scripts/qa/operator-after.cjs
//
// Reuses the same harness as operator-diagnosis.cjs. Writes:
//   artifacts/operator-after/after-console-<width>-<theme>.png
//   artifacts/operator-after/after.json
//
// The check that matters: the console element's RENDERED font must be
// "JetBrains Mono NL" (the bundled no-ligature face), and ASCII ">=" typed in
// a string literal must still reach the console as two characters.
const path = require('node:path');
const fs = require('node:fs');
const { launchChrome, newPage, closePage, sleep, waitFor } = require('./cdp.cjs');
const { start } = require('./serve.cjs');

const PORT = Number(process.env.QA_PORT || 8798);
const OUT = path.resolve('artifacts/operator-after');

const FIXTURE = `
    onbShouldAutoStart = () => false;
    try { onbStop(); } catch (e) { }
    hideBootSplash();
    currentUser = { _docId: 'qa_operator_after', id: 'qa_operator_after', username: 'qaafter', fullName: 'QA After', role: 'student', status: 'active' };
    showApp('write-pseudocode');
`;

function gradesProgram(op) {
    return [
        'BEGIN',
        '  SET sum TO 80 + 90',
        '  SET average TO sum / 2',
        `  IF average ${op} 75 THEN`,
        '    SET remarks TO "PASSED"',
        '  ELSE',
        '    SET remarks TO "FAILED"',
        '  END IF',
        '  DISPLAY "Remarks: ", remarks',
        'END',
    ].join('\n');
}

async function setTheme(page, mode) {
    await page.run(`
        if (typeof setThemeMode === 'function') setThemeMode(${JSON.stringify(mode)});
        else document.documentElement.setAttribute('data-theme', ${JSON.stringify(mode)});
        return true;
    `);
    await sleep(300);
}

async function inspect(page, label, source) {
    await page.run(`
        const e = document.getElementById('pseudocode-editor');
        e.value = ${JSON.stringify(source)};
        e.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('console-output').textContent = '';
        translatePseudocode();
        return true;
    `);
    await sleep(400);
    await page.run('executePython(); return true;');
    await sleep(1500);

    await page.send('DOM.enable').catch(() => {});
    await page.send('CSS.enable').catch(() => {});
    let renderedFonts = [];
    try {
        const docNode = await page.send('DOM.getDocument', { depth: 0 });
        const node = await page.send('DOM.querySelector', { nodeId: docNode.root.nodeId, selector: '#console-output' });
        const fonts = await page.send('CSS.getPlatformFontsForNode', { nodeId: node.nodeId });
        renderedFonts = fonts.fonts.map(f => ({ family: f.familyName, glyphCount: f.glyphCount }));
    } catch (e) {
        renderedFonts = [{ error: String(e && e.message || e) }];
    }

    const result = await page.run(`
        const out = document.getElementById('console-output');
        return {
            text: out.textContent,
            computedFamily: getComputedStyle(out).fontFamily,
            ligatureVariant: getComputedStyle(out).fontVariantLigatures,
            featureSettings: getComputedStyle(out).fontFeatureSettings
        };
    `);
    return {
        label,
        consoleText: result.text,
        computedFamily: result.computedFamily,
        ligatureVariant: result.ligatureVariant,
        featureSettings: result.featureSettings,
        renderedFonts
    };
}

(async () => {
    const server = await start(PORT);
    const base = 'http://127.0.0.1:' + PORT;
    const chrome = await launchChrome();
    const report = { environment: { node: process.version, port: PORT } };
    try {
        const page = await newPage(chrome.wsUrl, base + '/index.html');
        await page.setViewport(1440, 900);
        await waitFor(page, 'typeof showApp === "function"', { timeout: 30000 });
        await sleep(600);
        await page.run(FIXTURE);

        // Confirm the bundled no-ligature font actually loaded.
        report.fonts = await page.run(`
            await (document.fonts ? document.fonts.ready : Promise.resolve());
            return {
                nlLoaded: document.fonts ? document.fonts.check('12px "JetBrains Mono NL"') : null,
                faces: document.fonts ? Array.from(document.fonts).map(f => f.family + ' ' + f.weight + ' ' + f.status) : []
            };
        `);

        report.cases = [];
        report.cases.push(await inspect(page, 'grades-ascii', gradesProgram('>=')));
        report.cases.push(await inspect(page, 'grades-slanted', gradesProgram('\u2A7E')));
        report.cases.push(await inspect(page, 'string-literal-ascii', 'BEGIN\n  DISPLAY "Score >= 75 ok"\nEND'));
        report.cases.push(await inspect(page, 'string-literal-unicode', 'BEGIN\n  DISPLAY "Score \u2A7E 75 ok"\nEND'));

        // The slanted operator must compile to ASCII >= and print PASSED.
        const slanted = report.cases.find(c => c.label === 'grades-slanted');
        report.verdict = {
            noLigatureFontInUse: (slanted.renderedFonts || []).some(f => /JetBrains Mono NL/i.test(f.family || '')),
            slantedCompiled: /PASSED/.test(slanted.consoleText),
            ligatureDisabled: slanted.ligatureVariant === 'none',
            featureSettingsOff: /liga["']?\s*0/.test(slanted.featureSettings || '')
        };

        fs.mkdirSync(OUT, { recursive: true });
        for (const theme of ['light', 'dark']) {
            await setTheme(page, theme);
            for (const [w, h, tag] of [[375, 812, '375'], [1440, 900, '1440']]) {
                await page.setViewport(w, h, 1, w < 500);
                await sleep(400);
                await page.screenshot(path.join(OUT, `after-console-${tag}-${theme}.png`), { fullPage: false });
            }
        }

        fs.writeFileSync(path.join(OUT, 'after.json'), JSON.stringify(report, null, 2));
        console.log('OPERATOR AFTER CHECK COMPLETE');
        console.log(JSON.stringify(report.verdict, null, 2));
        await closePage(page);
    } finally {
        chrome.child.kill();
        server.close();
    }
})().catch(err => {
    console.error('OPERATOR AFTER CHECK FAILED:', err && err.stack || err);
    process.exit(1);
});
