/* ============================================================
   PSEUDOPY — DEVTOOLS VISUAL AUDIT HARNESS
   ------------------------------------------------------------
   Phase 0/5 companion for the SOP2 + theme redesign. Captures
   every Developer Options tab (which includes the top bar,
   sidebar, tab bar and the Runtime Console below the panel) in
   light and dark at 1440 / 1024 / 768 / 375 px.

   Like scripts/capture-charts.cjs this drives system Chrome over
   raw CDP; no browser dependency. The session is forged the same
   way scripts/qa/selection-caret.cjs does it, so no credentials
   and no Firebase are involved. Cross-origin requests are
   blocked so fonts/SDK fetches cannot affect the render.

   NOTE: unlike scripts/qa/cdp.cjs's launchChrome(), Chrome is
   spawned WITHOUT --hide-scrollbars here on purpose: the audit
   exists to document the native scroll strip under the devtools
   tab bar in dark mode before the fix.

   Run:  node scripts/qa/devtools-audit.cjs [before|after]
   Env:  CHROMIUM_PATH to override the Chrome binary.
   ============================================================ */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { start } = require('./serve.cjs');
const { findChrome, connect, newPage, closePage, sleep, waitFor } = require('./cdp.cjs');

const phase = process.argv[2] === 'after' ? 'after' : 'before';
const SHOT_DIR = process.env.PSEUDOPY_AUDIT_DIR || path.join('artifacts', 'devtools-audit', phase);
const WIDTHS = [1440, 1024, 768, 375];
const THEMES = ['light', 'dark'];

/** Launch headless Chrome without --hide-scrollbars (see header). */
async function launchVisibleChrome() {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pseudopy-audit-'));
    const child = spawn(findChrome(), [
        '--headless=new',
        '--remote-debugging-port=0',
        '--user-data-dir=' + userDataDir,
        '--no-sandbox',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    const wsUrl = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Chrome startup timeout')), 30000);
        child.stderr.on('data', chunk => {
            const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/);
            if (match) { clearTimeout(timer); resolve(match[1]); }
        });
        child.on('error', reject);
    });
    return { child, wsUrl };
}

async function main() {
    const out = path.join(process.cwd(), SHOT_DIR);
    fs.mkdirSync(out, { recursive: true });
    const server = await start(0);
    const origin = 'http://127.0.0.1:' + server.address().port;
    const chrome = await launchVisibleChrome();
    let page;
    const consoleErrors = [];
    try {
        page = await newPage(chrome.wsUrl, origin);
        page.on('Runtime.exceptionThrown', params => {
            consoleErrors.push(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'exception');
        });
        await page.send('Network.setBlockedURLs', { urls: ['https://*/*'] });
        await waitFor(page, 'typeof navigateTo === "function" && typeof showApp === "function"', { timeout: 30000 });
        await page.run(`
            onbShouldAutoStart = () => false;
            try { onbStop(); } catch (_) {}
            if (typeof hideBootSplash === 'function') hideBootSplash();
            currentUser = { id: 'qa_audit', _docId: 'qa_audit', username: 'qa', fullName: 'QA Audit', role: 'admin', status: 'active' };
            showApp('developer-options');
            navigateTo('developer-options');
            return true;
        `);
        await waitFor(page, 'document.querySelectorAll("#devtools-tab-bar .devtools-tab").length === 20', { timeout: 30000 });
        await waitFor(page, 'typeof devToolsInitTabs === "function" && !!document.getElementById("devtools-tab-sop2")', { timeout: 30000 });

        const tabs = await page.evaluate(`Array.from(document.querySelectorAll("#devtools-tab-bar .devtools-tab")).map(t => t.getAttribute("data-tab"))`);
        const measurements = [];

        for (const width of WIDTHS) {
            for (const theme of THEMES) {
                await page.setViewport(width, 900, 1, false);
                await page.run(`
                    document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)});
                    document.body.setAttribute('data-theme', ${JSON.stringify(theme)});
                    return true;
                `);
                await sleep(250);
                const dir = path.join(out, `${width}-${theme}`);
                fs.mkdirSync(dir, { recursive: true });
                for (const tab of tabs) {
                    await page.run(`devToolsSwitchTab(${JSON.stringify(tab)}); return true;`);
                    await sleep(120);
                    await page.screenshot(path.join(dir, `${tab}.png`), { fullPage: true });
                }
                // Structural notes recorded beside the images.
                const state = await page.evaluate(`
                    return (() => {
                        const bar = document.querySelector('.devtools-tab-bar');
                        const cs = getComputedStyle(bar);
                        return {
                            tabOverflowX: bar ? (bar.scrollWidth - bar.clientWidth) : null,
                            tabScrollbarHeight: bar ? (bar.offsetHeight - bar.clientHeight) : null,
                            colorScheme: getComputedStyle(document.documentElement).colorScheme,
                            theme: document.documentElement.getAttribute('data-theme'),
                            activePanel: (document.querySelector('.devtools-tab-panel.active') || {}).id || null,
                            sop2InlineStyles: document.querySelectorAll('#devtools-panel-sop2 [style]').length,
                        };
                    })()
                `);
                measurements.push({ width, theme, ...state });
                console.log(`captured ${width}-${theme} (${tabs.length} tabs)`);
            }
        }
        fs.writeFileSync(path.join(out, 'measurements.json'), JSON.stringify({ measurements, consoleErrors }, null, 2));
        console.log(JSON.stringify({ out, tabCount: tabs.length, consoleErrors }, null, 2));
        await closePage(page);
    } finally {
        try { chrome.child.kill(); } catch (e) { /* already gone */ }
        server.close();
    }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
