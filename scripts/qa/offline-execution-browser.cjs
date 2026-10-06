// Offline translation/execution and single-request dependency loading.
//
//   node scripts/qa/offline-execution-browser.cjs
//
// Verifies, in a real browser against the working tree:
//   1. A string dependency becomes ONE script request, never per-character.
//   2. After the service worker has cached assets, translation AND Python
//      execution still work with the network cut.
//   3. Cache recovery destroys nothing durable: the editor draft and queued
//      mutations survive an offline reload alongside the caches.
//   4. A missing script URL returns 404 rather than the SPA HTML shell, so a
//      failed dependency reports as a load failure instead of a syntax error.
const path = require('node:path');
const assert = require('node:assert/strict');
const { launchChrome, newPage, closePage, reload, sleep, waitFor } = require('./cdp.cjs');
const { start } = require('./serve.cjs');

const PORT = Number(process.env.QA_PORT || 8796);
const OUT = path.resolve('docs/qa/student-dashboard');
const TARGET = './sw.js';

const FIXTURE = `
    onbShouldAutoStart = () => false;
    try { onbStop(); } catch (e) { }
    hideBootSplash();
    currentUser = { _docId: 'qa_offline_runner', id: 'qa_offline_runner', username: 'qarunner', fullName: 'QA Runner', role: 'student', status: 'active' };
    showApp('write-pseudocode');
`;

(async () => {
    const server = await start(PORT);
    const base = 'http://127.0.0.1:' + PORT;
    const chrome = await launchChrome();
    const report = {};
    try {
        const page = await newPage(chrome.wsUrl, base + '/index.html');
        await page.setViewport(1280, 900);
        await waitFor(page, 'typeof loadScripts === "function"', { timeout: 30000 });
        await sleep(600);

        // ── 1. A bare string dependency is one request, not one per char ────
        const seen = [];
        page.on('Network.requestWillBeSent', params => { seen.push(params.request.url); });
        seen.length = 0;
        const loaded = await page.run(`
            await new Promise((resolve, reject) => loadScripts(${JSON.stringify(TARGET)}, resolve, reject));
            return document.querySelectorAll('script[src="${TARGET}"], script[src$="/sw.js"]').length;
        `);
        const svcs = seen.filter(u => u.endsWith('/sw.js'));
        report.stringDependency = { requests: svcs.length, scriptTags: loaded, distinct: [...new Set(svcs)] };
        assert.equal(svcs.length, 1,
            'a string dependency must produce exactly one request, got ' + svcs.length + ': ' + JSON.stringify(svcs));
        assert.equal(loaded, 1, 'exactly one <script> element for the dependency');
        assert.ok(svcs[0].endsWith('/sw.js'), 'the one request targets the real URL: ' + svcs[0]);
        // A regression to per-character indexing would emit single-character
        // paths, each answered by the SPA shell.
        const perChar = seen.filter(u => new URL(u).pathname.length <= 3 && u !== base + '/');
        assert.equal(perChar.length, 0, 'no per-character requests were issued: ' + JSON.stringify(perChar));

        // ── 4. A missing script is a 404, never the HTML shell ─────────────
        report.missing = await page.run(`
            const r = await fetch('./this-asset-does-not-exist-' + Math.random().toString(36).slice(2) + '.js');
            return { status: r.status, type: r.headers.get('content-type') || '', body: (await r.text()).trim() };
        `);
        assert.equal(report.missing.status, 404, 'a missing asset returns 404');
        assert.equal(report.missing.body.startsWith('<'), false,
            'a missing asset must not be answered with the SPA HTML shell');

        // ── install and control the service worker before cutting the network
        report.sw = await page.run(`
            await navigator.serviceWorker.register('./sw.js');
            await navigator.serviceWorker.ready;
            return { keys: await caches.keys() };
        `);
        for (let i = 0; i < 6; i++) {
            await reload(page);
            await waitFor(page, 'typeof showApp === "function"', { timeout: 30000 }).catch(() => { });
            if (await page.run('return !!navigator.serviceWorker.controller;')) break;
            await sleep(700);
        }
        report.controlled = await page.run('return !!navigator.serviceWorker.controller;');
        assert.ok(report.controlled, 'the service worker controls the page before going offline');

        report.cache = await page.run(`
            return {
                names: await caches.keys(),
                skulpt: !!(await caches.match('./vendor/skulpt/skulpt.min.js')),
                stdlib: !!(await caches.match('./vendor/skulpt/skulpt-stdlib.js')),
                app: !!(await caches.match('./app.js'))
            };
        `);
        assert.ok(report.cache.skulpt && report.cache.stdlib && report.cache.app,
            'the assets the offline shell needs are cached: ' + JSON.stringify(report.cache));

        await page.run(FIXTURE);
        await page.run(`
            const e = document.getElementById('pseudocode-editor');
            e.value = 'BEGIN\\n  SET x TO 6 * 7\\n  DISPLAY x\\nEND';
            translatePseudocode();
            return true;
        `);
        await waitFor(page, `document.getElementById('python-output').value.length > 0`, { timeout: 20000 });
        // Written while online, so it must land without leaving a queued write.
        await page.run('saveSession(currentUser); return true;');
        await sleep(700);
        report.before = await page.run(`
            return {
                editor: document.getElementById('pseudocode-editor').value.length,
                python: document.getElementById('python-output').value.length
            };
        `);
        assert.ok(report.before.python > 0, 'the program translates while online');

        // ── 2. translate + execute with no network at all ───────────────────
        await page.setOffline(true);
        await sleep(500);
        await reload(page);
        await sleep(3500);
        await waitFor(page, 'typeof showApp === "function"', { timeout: 30000 }).catch(() => { });
        await sleep(1200);
        await page.run(FIXTURE);

        await page.run(`
            const e = document.getElementById('pseudocode-editor');
            e.value = 'BEGIN\\n  SET x TO 6 * 7\\n  DISPLAY x\\nEND';
            e.dispatchEvent(new Event('input', { bubbles: true }));
            translatePseudocode();
            return true;
        `);
        await waitFor(page, `document.getElementById('python-output').value.length > 0`, { timeout: 20000 });
        report.offlineTranslate = await page.run(`
            return { offline: !navigator.onLine, python: document.getElementById('python-output').value };
        `);
        assert.equal(report.offlineTranslate.offline, true, 'the network really is cut');

        await page.run('executePython(); return true;');
        await waitFor(page, `document.getElementById('console-output').textContent.includes('42')`,
            { timeout: 30000 });
        report.offlineRun = await page.run(`
            return {
                console: document.getElementById('console-output').textContent.trim(),
                realSkulpt: typeof Sk !== 'undefined'
            };
        `);
        assert.equal(report.offlineRun.realSkulpt, true, 'real Skulpt (not a stub) executed the program');
        assert.match(report.offlineRun.console, /42/, 'the program output reached the console offline');

        // A write attempted with no network is saved locally and queued for
        // later sync rather than being dropped.
        report.offlineWrite = await page.run(`
            let rejection = null;
            try { await dbSet('qa_offline_work', 'draft', { answer: 42 }); } catch (e) { rejection = { localOnly: e.localOnly === true }; }
            return { rejection, queued: (await listAllMutations()).filter(r => r.collection === 'qa_offline_work').length };
        `);
        assert.equal(report.offlineWrite.rejection && report.offlineWrite.rejection.localOnly, true,
            'the unconfirmed cloud write is flagged local-only: ' + JSON.stringify(report.offlineWrite));
        assert.ok(report.offlineWrite.queued >= 1,
            'the offline write is queued for sync: ' + JSON.stringify(report.offlineWrite));

        // ── 3. cache recovery kept every durable local artefact ─────────────
        await reload(page);
        await sleep(3000);
        await waitFor(page, 'typeof showApp === "function"', { timeout: 30000 }).catch(() => { });
        await sleep(800);
        report.retained = await page.run(`
            return {
                editor: document.getElementById('pseudocode-editor').value,
                local: (getLocalCollection('qa_offline_work') || [])[0],
                queued: (await listAllMutations()).filter(r => r.collection === 'qa_offline_work').length,
                session: !!localStorage.getItem(STORAGE_KEYS.SESSION_USER),
                caches: await caches.keys()
            };
        `);
        assert.match(report.retained.editor, /6 \* 7/, 'the draft survives offline');
        assert.equal(report.retained.local && report.retained.local.answer, 42, 'the local record survives');
        assert.ok(report.retained.queued >= 1, 'the queued mutation survives: ' + report.retained.queued);
        assert.equal(report.retained.session, true, 'the session survives offline');
        assert.ok(report.retained.caches.length > 0, 'the caches are still present');
        report.offline = true;
        await page.screenshot(path.join(OUT, 'offline-execution.png'), { fullPage: false });
        report.environment = {
            network: 'CDP Network.emulateNetworkConditions(offline=true)',
            hosting: 'scripts/qa/serve.cjs static server (404 on missing files)',
            auth: 'synthetic local profile; Firebase not contacted'
        };
        require('node:fs').mkdirSync(OUT, { recursive: true });
        require('node:fs').writeFileSync(path.join(OUT, 'offline-execution.json'), JSON.stringify(report, null, 2));
        console.log('OFFLINE EXECUTION PASSED', JSON.stringify(report, null, 2));
        await closePage(page);
    } finally {
        chrome.child.kill();
        server.close();
    }
})().catch(err => {
    console.error('OFFLINE EXECUTION FAILED:', err && err.stack || err);
    process.exit(1);
});
