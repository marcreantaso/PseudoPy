/* ============================================================
   PSEUDOPY — SOP2 PANEL STATE CAPTURE
   ------------------------------------------------------------
   Phase 0/5 companion for the SOP2 + theme redesign. Captures
   the three deliverable states of the SOP2 comparison panel —
   idle, results (after Compare) and running (mid-Benchmark) —
   in light and dark at 1440 and 375 px: 12 shots per run.

   The wait conditions are written against BOTH markup generations
   (pre- and post-redesign): retired ids such as sop2-bench-cancel
   are tried as fallbacks, and the results/progress probes only use
   selectors that exist in each tree (`.sop2-card` result cards,
   `#sop2-progress-fill` inline width, `.pp-empty` only in the new
   markup).

   Like scripts/qa/devtools-audit.cjs this drives system Chrome over
   raw CDP with https blocked (so the CDN icon set is suppressed in
   both generations) and without --hide-scrollbars.

   Run:  node scripts/qa/sop2-states.cjs [before|after]
   Env:  CHROMIUM_PATH to override the Chrome binary.
   ============================================================ */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { start } = require('./serve.cjs');
const { findChrome, newPage, closePage, sleep, waitFor } = require('./cdp.cjs');

const phase = process.argv[2] === 'before' ? 'before' : 'after';
const SHOT_DIR = process.env.PSEUDOPY_AUDIT_DIR || path.join('artifacts', 'devtools-audit', phase + '-states');
const WIDTHS = [1440, 375];
const THEMES = ['light', 'dark'];

/** Launch headless Chrome with visible scrollbars (see header). */
async function launchVisibleChrome() {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pseudopy-states-'));
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

/** Fresh document + forged admin session on the Developer Options screen. */
async function bootDevtools(page) {
    // __qaGen only exists on the outgoing document, so the wait below
    // cannot be satisfied by the page we are reloading away from.
    await page.run('window.__qaGen = (window.__qaGen || 0) + 1; location.reload(); return true;');
    await waitFor(page,
        'typeof navigateTo === "function" && typeof showApp === "function" && typeof window.__qaGen === "undefined"',
        { timeout: 30000 });
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
    await page.run('devToolsSwitchTab("sop2"); return true;');
    await sleep(200);
}

async function main() {
    const out = path.join(process.cwd(), SHOT_DIR);
    fs.mkdirSync(out, { recursive: true });
    const server = await start(0);
    const origin = 'http://127.0.0.1:' + server.address().port;
    const chrome = await launchVisibleChrome();
    let page;
    const consoleErrors = [];
    const notes = [];
    const shots = [];
    try {
        page = await newPage(chrome.wsUrl, origin);
        page.on('Runtime.exceptionThrown', params => {
            consoleErrors.push(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'exception');
        });
        await page.send('Network.setBlockedURLs', { urls: ['https://*/*'] });
        await waitFor(page, 'typeof navigateTo === "function" && typeof showApp === "function"', { timeout: 30000 });

        for (const width of WIDTHS) {
            for (const theme of THEMES) {
                await page.setViewport(width, 900, 1, false);
                await bootDevtools(page);
                await page.run(`
                    document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)});
                    document.body.setAttribute('data-theme', ${JSON.stringify(theme)});
                    return true;
                `);
                await sleep(300);
                const tag = `${width}-${theme}`;

                const alignToState = async (targetId = 'sop2-actions') => {
                    await page.evaluate(`return (() => {
                        const target = document.getElementById(${JSON.stringify(targetId)});
                        if (!target) return { ok: false, msg: 'no target' };
                        const tabPanel = document.getElementById('devtools-panel-sop2');
                        // find inner scroller with overflow
                        let n = target.parentElement, inner = null;
                        while (n) {
                            const cs = getComputedStyle(n);
                            if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 5) { inner = n; break; }
                            n = n.parentElement;
                        }
                        if (inner) {
                            inner.scrollTop = target.getBoundingClientRect().top - inner.getBoundingClientRect().top + inner.scrollTop - 8;
                        }
                        const bar = document.getElementById('devtools-tab-bar');
                        if (bar) bar.scrollIntoView({ block: 'start', behavior: 'instant' });
                        return { ok: true };
                    })();`);
                    await sleep(150);
                    const verify = await page.evaluate(`return (() => {
                        const bar = document.getElementById('devtools-tab-bar');
                        const actions = document.getElementById('sop2-actions');
                        const result = document.getElementById('sop2-result');
                        const progress = document.getElementById('sop2-progress');
                        const fill = document.getElementById('sop2-progress-fill');
                        const br = bar.getBoundingClientRect();
                        const ar = actions.getBoundingClientRect();
                        const inView = (r, pad=2) => r.height > 0 && r.top >= -pad && r.bottom <= window.innerHeight + pad;
                        return {
                            tabBarVisible: br.height > 0 && br.top >= 0 && br.bottom <= window.innerHeight,
                            actionsVisible: ar.height > 0 && ar.top >= 0 && ar.bottom <= window.innerHeight,
                            targetInView: inView(ar),
                            resultCards: result ? document.querySelectorAll('#sop2-result .sop2-card').length : 0,
                            resultText: (result ? (result.innerText || '') : '').replace(/\\s+/g, ' ').trim().slice(0, 70),
                            progressShown: progress && progress.getBoundingClientRect().height > 0 && parseFloat(fill && fill.style.width || '0') > 0,
                        };
                    })();`);
                    return verify;
                };

                const shot = async (state, fileNote) => {
                    // Align on the actions toolbar for every state: it sits
                    // directly above progress/status/results, so one scroll
                    // shows the state markers AND the button row (Cancel is
                    // only visible while running) in the 400px panel body.
                    const v = await alignToState('sop2-actions');
                    const file = `sop2-${state}-${tag}.png`;
                    await page.screenshot(path.join(out, file), { fullPage: true });
                    shots.push({ width, theme, state, file, note: fileNote || null, verify: v });
                    if (!v.tabBarVisible) console.log(`  NOTE ${tag}/${state}: tab bar may be partially out of view`);
                    console.log(`captured ${state} ${tag}${fileNote ? ' (' + fileNote + ')' : ''}`);
                };

                // 1. Idle panel as first paint (new: pp-empty card, old: idle message).
                await shot('idle');

                // 2. Load the first example, Compare, wait for the result cards.
                //    (Top-level `return` keeps cdp.cjs's expression wrapper from
                //    turning these into statement bodies with no result.)
                const loadable = await page.evaluate(`return (() => {
                    const s = document.getElementById('sop2-load-example');
                    if (!s) return false;
                    // options[0] is the static "Choose a case…" placeholder
                    // (value="") in both markup generations; pick the first
                    // populated option instead.
                    const opt = Array.from(s.options).find(o => o.value);
                    if (!opt) return false;
                    s.value = opt.value;
                    s.dispatchEvent(new Event('change', { bubbles: true }));
                    return true;
                })();`);
                let loaded = false;
                if (!loadable) notes.push(`${tag}: example select had no options`);
                else {
                    try {
                        await waitFor(page, '(document.getElementById("sop2-src").value || "").length > 10', { timeout: 15000 });
                        loaded = true;
                    } catch (e) {
                        notes.push(`${tag}: example did not populate the editor (${e.message})`);
                    }
                }
                if (loaded) {
                    try {
                        await page.run('document.getElementById("sop2-compare").click(); return true;');
                        await waitFor(page,
                            'document.querySelectorAll("#sop2-result .sop2-card").length > 0 && !document.querySelector("#sop2-result .pp-empty")',
                            { timeout: 90000 });
                        await sleep(500);
                        await shot('results');
                    } catch (e) {
                        notes.push(`${tag}: compare did not render results (${e.message})`);
                        await shot('results', 'compare timed out; panel shows whatever state it reached');
                    }
                } else {
                    notes.push(`${tag}: skipped compare (no example loaded)`);
                    await shot('results', 'skipped compare; panel shows the state reached without an example');
                }

                // 3. Start the benchmark and shoot it mid-flight: the progress
                //    fill has an inline percentage that is > 0 and < 100 while
                //    running in both markup generations.
                try {
                    await page.run('document.getElementById("sop2-bench").click(); return true;');
                    await waitFor(page,
                        `return (() => {
                            const p = document.getElementById('sop2-progress');
                            const f = document.getElementById('sop2-progress-fill');
                            if (!p || !f || p.getBoundingClientRect().height <= 0) return false;
                            const w = parseFloat(f.style.width || '0');
                            return w > 0 && w < 100;
                        })();`,
                        { timeout: 90000 });
                    await sleep(250);
                    await shot('running');
                } catch (e) {
                    notes.push(`${tag}: benchmark progress window missed (${e.message})`);
                    await shot('running', 'progress window missed; panel shows the state reached');
                }

                // 4. Cancel (either id) and let the panel settle; the next
                //    combo reloads the document regardless.
                try {
                    await page.run(`var c = document.getElementById('sop2-cancel') || document.getElementById('sop2-bench-cancel');
                        if (c) c.click();
                        return true;`);
                    await waitFor(page,
                        `return (() => {
                            const p = document.getElementById('sop2-progress');
                            const f = document.getElementById('sop2-progress-fill');
                            return !p || p.getBoundingClientRect().height <= 0 || !f || parseFloat(f.style.width || '0') <= 1;
                        })();`,
                        { timeout: 20000 });
                } catch (e) {
                    notes.push(`${tag}: cancel settle timed out (${e.message})`);
                }
            }
        }
        fs.writeFileSync(path.join(out, 'results.json'),
            JSON.stringify({ phase, shots, notes, consoleErrors }, null, 2));
        console.log(JSON.stringify({ out, shots: shots.length, notes, consoleErrors }, null, 2));
        await closePage(page);
    } finally {
        try { chrome.child.kill(); } catch (e) { /* already gone */ }
        server.close();
    }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
