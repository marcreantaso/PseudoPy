// Step 0 diagnosis: is the odd glyph in the console a font LIGATURE or a
// real Unicode character?
//
//   node scripts/qa/operator-diagnosis.cjs
//
// Runs the grades program (IF average >= 75 -> Remarks) through the real
// compiler + Skulpt in headless Chrome and reports, per console line:
//   - the codepoints of the rendered text (3e 3d = ASCII ">=" two chars,
//     2a7e/2265 = a real Unicode operator that survived into the output)
//   - the platform fonts Chrome actually used for the console element
//     (CSS.getPlatformFontsForNode, the DevTools "Rendered Fonts" view)
//   - whether the JetBrains Mono webfont was available at all
// Variants: ASCII >=, Unicode >= (U+2265), slanted >= (U+2A7E), and the
// operators inside string literals (the student's own output text).
const path = require('node:path');
const fs = require('node:fs');
const { launchChrome, newPage, closePage, sleep, waitFor } = require('./cdp.cjs');
const { start } = require('./serve.cjs');

const PORT = Number(process.env.QA_PORT || 8797);
const OUT = path.resolve('artifacts/operator-diagnosis');

const FIXTURE = `
    onbShouldAutoStart = () => false;
    try { onbStop(); } catch (e) { }
    hideBootSplash();
    currentUser = { _docId: 'qa_operator_diag', id: 'qa_operator_diag', username: 'qadiag', fullName: 'QA Diagnosis', role: 'student', status: 'active' };
    showApp('write-pseudocode');
`;

// Mirrors the screenshot scenario: compute an average and set remarks.
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

// The operator inside the student's STRING LITERAL: output text, not code.
function stringLiteralProgram(ch) {
    return [
        'BEGIN',
        `  DISPLAY "Score ${ch} 75 ok"`,
        'END',
    ].join('\n');
}

function codepoints(text) {
    return Array.from(text).map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
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

        // ── Font availability ────────────────────────────────────────────
        report.fonts = await page.run(`
            await (document.fonts ? document.fonts.ready : Promise.resolve());
            return {
                jetbrainsLoaded: document.fonts ? document.fonts.check('12px "JetBrains Mono"') : null,
                computedFamily: getComputedStyle(document.getElementById('console-output')).fontFamily,
                faces: document.fonts ? Array.from(document.fonts).map(f => f.family + ' ' + f.weight + ' ' + f.status) : []
            };
        `);

        async function runAndInspect(name, source) {
            await page.run(`
                const e = document.getElementById('pseudocode-editor');
                e.value = ${JSON.stringify(source)};
                e.dispatchEvent(new Event('input', { bubbles: true }));
                document.getElementById('console-output').textContent = '';
                translatePseudocode();
                return true;
            `);
            await sleep(400);
            const python = await page.run(`return document.getElementById('python-output').value;`);
            await page.run('executePython(); return true;');
            await sleep(1500);
            const result = await page.run(`
                const out = document.getElementById('console-output');
                return { text: out.textContent, error: out.className.includes('error') };
            `);
            // Platform fonts via CDP on the console element.
            await page.send('DOM.enable').catch(() => {});
            await page.send('CSS.enable').catch(() => {});
            let platformFonts = [];
            try {
                const docNode = await page.send('DOM.getDocument', { depth: 0 });
                const node = await page.send('DOM.querySelector', { nodeId: docNode.root.nodeId, selector: '#console-output' });
                const fonts = await page.send('CSS.getPlatformFontsForNode', { nodeId: node.nodeId });
                platformFonts = fonts.fonts.map(f => ({ family: f.familyName, glyphCount: f.glyphCount }));
            } catch (e) {
                platformFonts = [{ error: String(e && e.message || e) }];
            }
            return {
                name,
                sourceCodepoints: codepoints(source).filter(cp => parseInt(cp.slice(2), 16) > 127),
                consoleText: result.text,
                consoleCodepoints: codepoints(result.text),
                consoleContainsNonAscii: Array.from(result.text).some(c => c.codePointAt(0) > 127),
                consoleIsError: result.error,
                renderedFonts: platformFonts,
            };
        }

        report.cases = [];
        report.cases.push(await runAndInspect('grades-ascii->=', gradesProgram('>=')));
        report.cases.push(await runAndInspect('grades-unicode->= (U+2265)', gradesProgram('\u2265')));
        report.cases.push(await runAndInspect('grades-slanted->= (U+2A7E)', gradesProgram('\u2A7E')));
        report.cases.push(await runAndInspect('string-literal->=', stringLiteralProgram('>=')));
        report.cases.push(await runAndInspect('string-literal-\u2265', stringLiteralProgram('\u2265')));
        report.cases.push(await runAndInspect('string-literal-\u2A7E', stringLiteralProgram('\u2A7E')));

        // Verdict: for the string-literal cases the console MUST carry the
        // literal character (student text is preserved) — that is a real
        // Unicode character, not a ligature. The code cases tell us whether
        // the operator ever escapes the lexer into the output.
        const stringCase = report.cases.find(c => c.name === 'string-literal-\u2265');
        report.verdict = {
            ligatureRisk: report.fonts.jetbrainsLoaded
                ? 'JetBrains Mono (a ligature font) IS loaded; ASCII ">=" in any rendered text can be drawn as one slanted glyph'
                : 'JetBrains Mono NOT loaded in this headless profile; generic monospace has no ligatures here',
            realUnicodeInOutput: stringCase.consoleContainsNonAscii
                ? 'YES: a \u2265 typed inside a string literal reaches the console verbatim (student text, by design)'
                : 'no real Unicode operator observed in console text',
        };

        // Before screenshots of the console at both widths, light theme.
        for (const [w, h, tag] of [[375, 812, '375'], [1440, 900, '1440']]) {
            await page.setViewport(w, h, 1, w < 500);
            await sleep(400);
            await page.screenshot(path.join(OUT, `before-console-${tag}.png`), { fullPage: false });
        }

        fs.mkdirSync(OUT, { recursive: true });
        fs.writeFileSync(path.join(OUT, 'operator-diagnosis.json'), JSON.stringify(report, null, 2));
        console.log('OPERATOR DIAGNOSIS COMPLETE');
        console.log(JSON.stringify(report, null, 2));
        await closePage(page);
    } finally {
        chrome.child.kill();
        server.close();
    }
})().catch(err => {
    console.error('OPERATOR DIAGNOSIS FAILED:', err && err.stack || err);
    process.exit(1);
});
