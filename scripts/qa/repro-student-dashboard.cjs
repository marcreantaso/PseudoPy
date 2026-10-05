// Reproduction harness: captures the pre-fix state.
//   * offline boot -> "Reconnecting to the server…" banner + spinner
//   * student dashboard: how far below the fold the two learning sections sit
// Run: node scripts/qa/repro-student-dashboard.cjs
const fs = require('node:fs');
const path = require('node:path');
const { launchChrome, connect, newPage, closePage, sleep, waitFor } = require('./cdp.cjs');
const { start } = require('./serve.cjs');

const OUT = path.resolve('docs/qa/student-dashboard');
const PORT = Number(process.env.QA_PORT || 8791);
const WIDTHS = [320, 375, 768, 1440];
const HEIGHTS = { 320: 720, 375: 812, 768: 1024, 1440: 900 };

// Page-side source strings (sent to the browser, never executed here).
const FIXTURE = `
    onbShouldAutoStart = () => false;
    try { onbStop(); } catch (e) { }
    hideBootSplash();
    currentUser = { _docId: 'qa_student', id: 'qa_student', username: 'qastudent', fullName: 'QA Student', role: 'student', status: 'active' };
    showApp('write-pseudocode');
`;

const TRANSLATED = `
    const editor = document.getElementById('pseudocode-editor');
    editor.value = 'BEGIN\\n  SET score TO 72\\n  IF score > 50 THEN\\n    DISPLAY "Pass"\\n  ELSE\\n    DISPLAY "Fail"\\n  END IF\\nEND';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    translatePseudocode();
`;

/** Wait for the app bundle to finish booting. */
async function waitForApp(page) {
    await waitFor(page, 'typeof showApp === "function"', { timeout: 30000 });
    await sleep(700);
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const server = await start(PORT);
    const base = 'http://127.0.0.1:' + PORT;
    const chrome = await launchChrome();
    const results = { offline: {}, layout: [] };

    try {
        for (const width of WIDTHS) {
            const page = await newPage(chrome.wsUrl, base + '/index.html');
            await page.send('Page.setLifecycleEventsEnabled', { enabled: true });
            await page.setViewport(width, HEIGHTS[width], width < 768 ? 2 : 1, width < 768);
            await waitForApp(page);
            await page.run(FIXTURE + '\n' + TRANSLATED);
            await sleep(1200);

            // Where do the two learning sections sit relative to the fold?
            const geometry = await page.evaluate(`
                const flow = document.querySelector('.sw-flow');
                const insights = document.querySelector('.sw-insights');
                const bar = document.getElementById('exercise-action-bar');
                const rect = el => el ? { top: Math.round(el.getBoundingClientRect().top + window.scrollY), height: Math.round(el.getBoundingClientRect().height) } : null;
                return {
                    viewport: window.innerHeight,
                    flow: rect(flow),
                    insights: rect(insights),
                    actionBar: rect(bar),
                    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
                };
            `);
            results.layout.push({ width, ...geometry });

            await page.screenshot(path.join(OUT, 'before-' + width + '-workspace.png'));
            // Full page so the below-the-fold sections are visible for comparison.
            await page.screenshot(path.join(OUT, 'before-' + width + '-fullpage.png'), { fullPage: true });
            await closePage(page);
        }

        // ── Offline behavior ──
        const page = await newPage(chrome.wsUrl, base + '/index.html');
        await page.setViewport(375, 812, 2, true);
        await waitForApp(page);
        await page.run(FIXTURE);
        await page.setOffline(true);
        // Let the app react to the network loss (listeners + banner).
        await sleep(2000);
        await page.evaluate("window.dispatchEvent(new Event('offline'))");
        await sleep(800);
        results.offline.afterLoss = await page.evaluate(`
    const pill = document.getElementById('sync-state-indicator');
    const dot = pill.querySelector('.sync-state-dot');
    const dotStyle = getComputedStyle(dot);
    return {
        reconnectBannerExists: !!document.getElementById('connection-status-banner'),
        bodyMentionsReconnecting: document.body.innerText.includes('Reconnecting'),
        pillState: pill.dataset.state,
        pillLabel: pill.querySelector('.sync-state-label').textContent.trim(),
        pillAnimated: dotStyle.animationName !== 'none' && dotStyle.animationDuration !== '0s',
        dismissibleNoticeVisible: !document.getElementById('offline-save-status').hidden,
        signedIn: !document.getElementById('app-layout').classList.contains('hidden')
    };
`);
        await page.screenshot(path.join(OUT, 'before-offline-loss-375.png'));

        // Cold boot while offline. A hard network block would also stop the page
        // itself from loading, so the network is cut AFTER load and the boot
        // sequence is re-run: that is exactly what startup does offline
        // (localStorage session + Firestore unavailable).
        await page.evaluate("saveSession(currentUser); return true;");
        await page.setOffline(true);
        await page.run("await restoreSession(); return true;");
        await sleep(1200);
        results.offline.coldBoot = await page.evaluate(`
    const pill = document.getElementById('sync-state-indicator');
    const dot = pill.querySelector('.sync-state-dot');
    const dotStyle = getComputedStyle(dot);
    return {
        reconnectBannerExists: !!document.getElementById('connection-status-banner'),
        bodyMentionsReconnecting: document.body.innerText.includes('Reconnecting'),
        pillState: pill.dataset.state,
        pillLabel: pill.querySelector('.sync-state-label').textContent.trim(),
        pillAnimated: dotStyle.animationName !== 'none' && dotStyle.animationDuration !== '0s',
        dismissibleNoticeVisible: !document.getElementById('offline-save-status').hidden,
        signedIn: !document.getElementById('app-layout').classList.contains('hidden')
    };
`);
        await page.screenshot(path.join(OUT, 'before-offline-coldboot-375.png'));
        await closePage(page);
    } finally {
        chrome.child.kill();
        server.close();
    }

    fs.writeFileSync(path.join(OUT, 'before-report.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
})().catch(err => { console.error(err); process.exit(1); });
