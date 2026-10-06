// Offline reload durability: keep ONE storage context and make sure the service
// worker actually controls the page before cutting the network.
//
//   node scripts/qa/offline-reload-browser.cjs
//
// Checks that the session, the editor draft and the translated Python survive a
// genuine Page.reload with no network.
const path = require('node:path');
const assert = require('node:assert/strict');
const { launchChrome, newPage, reload, sleep, waitFor } = require('./cdp.cjs');
const { start } = require('./serve.cjs');

const OUT = path.resolve('docs/qa/student-dashboard');
const PORT = Number(process.env.QA_PORT || 8794);

const FIXTURE = `
    onbShouldAutoStart = () => false;
    try { onbStop(); } catch (e) { }
    hideBootSplash();
    currentUser = { _docId: 'qa_student', id: 'qa_student', username: 'qastudent', fullName: 'QA Student', role: 'student', status: 'active' };
    showApp('write-pseudocode');
`;

(async () => {
    const server = await start(PORT);
    const base = 'http://127.0.0.1:' + PORT;
    const chrome = await launchChrome();
    const report = {};
    try {
        const page = await newPage(chrome.wsUrl, base + '/index.html');
        await page.setViewport(375, 812, 2, true);
        await waitFor(page, 'typeof showApp === "function"', { timeout: 30000 });
        await sleep(800);

        // The offline shell only works if the worker controls this page, so
        // register it, wait for activation, then reload once online so the
        // controller is attached before the network is cut.
        report.sw = await page.run(`
            try {
                await navigator.serviceWorker.register('./sw.js');
                await navigator.serviceWorker.ready;
                return { registered: true, keys: await caches.keys() };
            } catch (e) { return { error: e.message }; }
        `);
        assert.ok(report.sw.registered, 'service worker registers: ' + JSON.stringify(report.sw));
        await reload(page);
        await waitFor(page, 'typeof showApp === "function"', { timeout: 30000 });
        // Reload again only if the worker has not attached to the page yet.
        for (let i = 0; i < 5; i++) {
            const controlled = await page.run('return !!navigator.serviceWorker.controller;');
            if (controlled) break;
            await sleep(700);
            await reload(page);
            await waitFor(page, 'typeof showApp === "function"', { timeout: 30000 }).catch(() => { });
            await sleep(700);
        }
        report.controlled = await page.run('return !!navigator.serviceWorker.controller;');
        assert.ok(report.controlled, 'service worker controls the page');

        // Sign in, translate, and let the draft slot fill.
        await page.run(FIXTURE);
        await page.run(`
            const e = document.getElementById('pseudocode-editor');
            e.value = 'BEGIN\\n  SET score TO 72\\n  DISPLAY "Pass"\\nEND';
            e.dispatchEvent(new Event('input', { bubbles: true }));
            translatePseudocode();
            return true;
        `);
        await waitFor(page, `document.getElementById('python-output').value.length > 0`, { timeout: 20000, label: 'python produced' });
        await page.run('saveSession(currentUser); return true;');
        await sleep(600);
        report.before = await page.run(`
            return {
                editor: document.getElementById('pseudocode-editor').value.length,
                python: document.getElementById('python-output').value.length,
                session: !!localStorage.getItem(STORAGE_KEYS.SESSION_USER),
                draft: (localStorage.getItem('pseudopy_editor_draft') || '').length
            };
        `);
        console.log('BEFORE offline reload:', JSON.stringify(report.before));
        assert.ok(report.before.session, 'a session was stored');

        // Cut the network and genuinely reload the same document.
        await page.setOffline(true);
        await sleep(600);
        await reload(page);
        await sleep(3500);
        await waitFor(page, 'typeof showApp === "function"', { timeout: 30000 }).catch(() => { });
        await sleep(1500);

        report.after = await page.run(`
            const e = document.getElementById('pseudocode-editor');
            const p = document.getElementById('python-output');
            const layout = document.getElementById('app-layout');
            const pill = document.getElementById('sync-state-indicator');
            return {
                booted: !!layout,
                signedIn: layout ? !layout.classList.contains('hidden') : false,
                editor: e ? e.value.length : -1,
                python: p ? p.value.length : -1,
                session: !!localStorage.getItem(STORAGE_KEYS.SESSION_USER),
                tabs: document.querySelectorAll('.sw-tabs [role="tab"]').length,
                pill: pill ? { state: pill.dataset.state, label: pill.querySelector('.sync-state-label').textContent.trim() } : null,
                reconnectCopy: document.body.innerText.includes('Reconnecting')
            };
        `);
        console.log('AFTER offline reload:', JSON.stringify(report.after));

        assert.ok(report.after.booted, 'the app still boots from the service worker cache');
        assert.equal(report.after.session, true, 'the session survives offline');
        assert.equal(report.after.signedIn, true, 'the student stays signed in offline');
        assert.equal(report.after.editor, report.before.editor, 'the editor draft survives offline');
        assert.ok(report.after.python > 0, 'translated Python survives offline: ' + report.after.python);
        assert.equal(report.after.tabs, 3, 'the tab shell is present offline');
        assert.equal(report.after.reconnectCopy, false, 'no reconnecting copy offline');
        console.log('offline reload durability passed');
    } finally {
        chrome.child.kill();
        server.close();
    }
})().catch(err => { console.error('OFFLINE RELOAD FAILED:', err && err.message); process.exit(1); });