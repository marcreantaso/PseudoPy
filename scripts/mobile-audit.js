#!/usr/bin/env node
'use strict';
/* ============================================================
   MOBILE AUDIT (Phase 0 harness)
   Boots the app on a local port, walks every screen for each
   role across a device matrix (Playwright Chromium + WebKit),
   and records layout defects: horizontal overflow, off-screen
   elements, stray scroll containers, touch-target sizes and
   font sizes. Emits JSON findings + screenshots; the curated
   report lives in docs/mobile-audit.md.
   Not part of `npm test` (browsers are a dev-only install).
   Usage:
     node scripts/mobile-audit.js                     # full matrix
     node scripts/mobile-audit.js --quick             # 390x844 chromium, dark
     node scripts/mobile-audit.js --engine webkit --sizes 360,390 --themes dark,light
   ============================================================ */

const { chromium, webkit } = require('@playwright/test');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.AUDIT_PORT || 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT_DIR = path.join(ROOT, 'reports', 'mobile-audit');
const SHOT_DIR = path.join(OUT_DIR, 'screenshots');

// ---------------------------------------------------------------- args
function parseArgs(argv) {
    const args = { engine: 'all', sizes: null, themes: null, quick: false, noServer: false };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--quick') args.quick = true;
        else if (a === '--no-server') args.noServer = true;
        else if (a === '--engine') args.engine = argv[++i];
        else if (a === '--sizes') args.sizes = argv[++i].split(',').map(Number);
        else if (a === '--themes') args.themes = argv[++i].split(',');
    }
    return args;
}

// Device matrix: label -> { w, h, mobile } (phone/tablet form factors).
const SIZES = {
    '320x568': { w: 320, h: 568, mobile: true },
    '375x667': { w: 375, h: 667, mobile: true },
    '390x844': { w: 390, h: 844, mobile: true },
    '430x932': { w: 430, h: 932, mobile: true },
    '360x800': { w: 360, h: 800, mobile: true },
    '412x915': { w: 412, h: 915, mobile: true },
    '768x1024': { w: 768, h: 1024, mobile: false },
    '820x1180': { w: 820, h: 1180, mobile: false },
    '1024x768': { w: 1024, h: 768, mobile: false },
    // Landscape probes (chromium only in practice; script honors both engines).
    '667x375': { w: 667, h: 375, mobile: true },
    '844x390': { w: 844, h: 390, mobile: true }
};

const SESSIONS = {
    student: {
        _docId: 'u_stu_emirandilla', id: 'u_stu_emirandilla',
        fullName: 'Eduard John Mirandilla', username: 'emirandilla_student',
        email: 'mirandilla@gmail.com', role: 'student', status: 'active', instructorId: 'u2'
    },
    instructor: {
        _docId: 'u2', id: 'u2', fullName: 'Marc Reantaso',
        username: 'mreantaso_instructor', email: 'reantaso@university.edu.ph',
        role: 'instructor', status: 'active'
    },
    admin: {
        _docId: 'u1', id: 'u1', fullName: 'Admin Bautista', username: 'Admin',
        email: 'bautista@university.edu.ph', role: 'admin', status: 'active'
    }
};

// Mirrors PAGES_BY_ROLE in src/app/constants.js.
const SCREENS_BY_ROLE = {
    student: ['write-pseudocode', 'translate', 'execute', 'feedback', 'exercises-student', 'student-settings', 'change-password'],
    instructor: ['analytics', 'manage-students', 'manage-exercises', 'generate-code', 'compiler-metrics', 'password-recovery'],
    admin: ['manage-users', 'system-analytics', 'password-requests', 'admin-execute', 'developer-options']
};

const DEVTOOLS_TABS = ['tokens', 'ast', 'symboltable', 'parser', 'semantic', 'translation', 'errors',
    'runtime', 'trace', 'attempts', 'eventlog', 'metrics', 'simulation', 'grammar', 'rawjson',
    'health', 'langguide', 'normalize', 'sop2', 'impl'];
// Panels worth a screenshot per combo (defect evidence).
const DEVTOOLS_SHOT_TABS = new Set(['tokens', 'metrics', 'runtime', 'sop2']);

// Baseline screenshot combos: every screen gets a full-page shot here.
// (engine, size, theme)
function isBaselineCombo(engine, sizeLabel, theme, landscapeLabels) {
    if (landscapeLabels.has(sizeLabel)) return false;
    return (engine === 'chromium' && sizeLabel === '390x844' && theme === 'dark')
        || (engine === 'chromium' && sizeLabel === '360x800' && theme === 'light')
        || (engine === 'webkit' && sizeLabel === '390x844' && theme === 'dark')
        || (engine === 'webkit' && sizeLabel === '360x800' && theme === 'light');
}

// ---------------------------------------------------------------- checks
// Runs inside the page. Returns structured findings for the current view.
const RUN_CHECKS = `(() => {
    const vw = window.innerWidth;
    const visible = el => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
    };
    const label = el => {
        let s = el.tagName.toLowerCase();
        if (el.id) s += '#' + el.id;
        if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.');
        return s;
    };

    // 1. Elements extending beyond the viewport (the overflow finder), with
    //    ancestor classification so a scroller's children don't read as page
    //    overflow. 'page' = pushes document scroll; 'clipped' = cut off by an
    //    overflow:hidden ancestor (the shifted-card symptom); 'scrollable' =
    //    sits in a horizontal scroller (no visual hint, but reachable).
    const SVG_INTERNAL = /^(svg|path|rect|circle|line|polyline|polygon|ellipse|use|g|text)$/;
    // Chart popovers live inside closed <details>; students meet them OPEN,
    // so the scan runs with those open (state restored below, before any
    // screenshot) — otherwise the clipped-when-open defect is invisible.
    const popoverDetails = [...document.querySelectorAll('details')]
        .filter(d => d.querySelector('.an-popover'))
        .map(d => { const wasOpen = d.open; d.open = true; return { d, wasOpen }; });
    const overflowSet = new Set();
    for (const el of document.querySelectorAll('body *')) {
        if (!visible(el) || SVG_INTERNAL.test(el.tagName)) continue;
        if (el.closest('.tour-overlay, .tour-spotlight')) continue;
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1) overflowSet.add(el);
    }
    const classifyOverflow = el => {
        let scrollable = null, clipped = null;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const ox = getComputedStyle(p).overflowX;
            if ((ox === 'auto' || ox === 'scroll') && !scrollable) scrollable = p;
            if (ox === 'hidden' && !clipped) clipped = p;
            if (scrollable) break;
        }
        return scrollable ? { kind: 'scrollable', via: label(scrollable) }
            : clipped ? { kind: 'clipped', via: label(clipped) } : { kind: 'page', via: null };
    };
    const overflowList = [];
    for (const el of overflowSet) {
        // Keep only the outermost element of each overflowing subtree.
        let hasOverflowingAncestor = false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            if (overflowSet.has(p)) { hasOverflowingAncestor = true; break; }
        }
        if (hasOverflowingAncestor) continue;
        const r = el.getBoundingClientRect();
        const cls = classifyOverflow(el);
        overflowList.push({ el: label(el), right: Math.round(r.right), over: Math.round(r.right - vw), kind: cls.kind, via: cls.via });
    }
    overflowList.sort((a, b) => (a.kind === 'page' ? 0 : a.kind === 'clipped' ? 1 : 2) - (b.kind === 'page' ? 0 : b.kind === 'clipped' ? 1 : 2) || b.over - a.over);
    popoverDetails.forEach(({ d, wasOpen }) => { d.open = wasOpen; });
    const overflow = overflowList.slice(0, 14);

    // 2. Document-level horizontal scroll.
    const se = document.scrollingElement || document.documentElement;
    const docOverflow = { scrollWidth: se.scrollWidth, innerWidth: vw, over: se.scrollWidth - vw };

    // 3. Containers scrolled away from their left edge (explains shifted cards).
    const scrolled = [];
    for (const el of document.querySelectorAll('body *')) {
        if (el.scrollLeft > 1 && visible(el)) scrolled.push({ el: label(el), scrollLeft: Math.round(el.scrollLeft) });
    }

    // 4. Touch targets below 44x44. Visually-hidden skip links are a11y
    //    affordances, and raw SVG chart shapes are data points, not app-sized
    //    tap targets — neither belongs in the touch-target statistics.
    const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, [role=tab], [role=menuitem], [role=button], summary';
    const touch = [];
    let touchTotal = 0;
    for (const el of document.querySelectorAll(SEL)) {
        if (!visible(el)) continue;
        if (el.closest('a.skip-link, .sr-only') || el.closest('svg')) continue;
        touchTotal++;
        const r = el.getBoundingClientRect();
        if (r.width < 44 || r.height < 44) {
            touch.push({ el: label(el), w: Math.round(r.width), h: Math.round(r.height),
                text: (el.textContent || '').trim().slice(0, 24) });
        }
    }

    // 5. Visible text below 12px.
    const smallText = [];
    for (const el of document.querySelectorAll('body *')) {
        if (!visible(el)) continue;
        let hasOwnText = false;
        for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { hasOwnText = true; break; }
        if (!hasOwnText) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 12) smallText.push({ el: label(el), fontSize: fs, text: (el.textContent || '').trim().slice(0, 30) });
    }
    const smallTextByEl = {};
    for (const s of smallText) if (!smallTextByEl[s.el + '@' + s.fontSize]) smallTextByEl[s.el + '@' + s.fontSize] = s;
    const smallTextList = Object.values(smallTextByEl).slice(0, 10);

    // 6. Form inputs below 16px (iOS focus zoom).
    const smallInputs = [];
    for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) {
        if (!visible(el)) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 16) smallInputs.push({ el: label(el), fontSize: fs });
    }

    // 7. Editor gutter vs textarea height (Android defect #6).
    const editor = document.getElementById('pseudocode-editor');
    const gutter = document.getElementById('editor-gutter');
    let editorHeights = null;
    if (editor && gutter && visible(editor)) {
        const er = editor.getBoundingClientRect(), gr = gutter.getBoundingClientRect();
        editorHeights = { textarea: Math.round(er.height), gutter: Math.round(gr.height),
            textareaTop: Math.round(er.top), gutterTop: Math.round(gr.top),
            lines: (editor.value || '').split('\\n').length,
            gutterLines: gutter.querySelectorAll('.gutter-num').length };
    }

    // 8. Action bar vs content clearance (Android defect #7). The page is
    //    scrolled to the end first, per the sticky-bar clearance rule.
    let actionBar = null;
    const bar = document.getElementById('exercise-action-bar');
    if (bar && visible(bar)) {
        const sc = document.querySelector('.main-content') || document.scrollingElement;
        const prevTop = sc.scrollTop;
        sc.scrollTop = sc.scrollHeight;
        const atEnd = true;
        const br = bar.getBoundingClientRect();
        const footerBtns = [...document.querySelectorAll('#page-write-pseudocode .panel-footer .btn')].filter(visible);
        const hidden = footerBtns.filter(b => b.getBoundingClientRect().bottom > br.top + 1).map(label);
        actionBar = { top: Math.round(br.top), height: Math.round(br.height),
            viewportShare: +(br.height / window.innerHeight).toFixed(3),
            hiddenBehindWhenScrolledToEnd: hidden };
        sc.scrollTop = prevTop;
    }

    // 9. DevTools tab strip height (must be <= 56px).
    let tabBar = null;
    const tb = document.getElementById('devtools-tab-bar');
    if (tb && visible(tb)) {
        const tr = tb.getBoundingClientRect();
        tabBar = { height: Math.round(tr.height), rows: Math.round(tr.height / Math.max(1, tb.querySelector('.devtools-tab')?.getBoundingClientRect().height || 1)) };
    }

    return {
        innerWidth: vw, innerHeight: window.innerHeight,
        themeMeta: document.querySelector('meta[name=theme-color]')?.getAttribute('content') || null,
        htmlTheme: document.documentElement.getAttribute('data-theme'),
        htmlFontSize: getComputedStyle(document.documentElement).fontSize,
        overflow, overflowCount: overflowList.length,
        docOverflow, scrolled, touch, touchTotal, smallText: smallTextList,
        smallInputs: smallInputs.slice(0, 10), editorHeights, actionBar, tabBar
    };
})()`;

// ---------------------------------------------------------------- server
async function startServer() {
    const proc = spawn(process.execPath, ['server.js'], {
        cwd: ROOT,
        env: { ...process.env, PORT: String(PORT) },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    proc.stderr.on('data', d => process.stderr.write(`[server] ${d}`));
    for (let i = 0; i < 60; i++) {
        try {
            const res = await fetch(BASE + '/index.html');
            if (res.ok) return proc;
        } catch (e) { /* not up yet */ }
        await new Promise(r => setTimeout(r, 500));
    }
    proc.kill();
    throw new Error('server did not become ready');
}

// ---------------------------------------------------------------- helpers
async function prepareContext(browser, engine, size, theme, role) {
    const context = await browser.newContext({
        viewport: { width: size.w, height: size.h },
        deviceScaleFactor: 1,
        isMobile: size.mobile,
        hasTouch: size.mobile,
        colorScheme: theme
    });
    await context.addInitScript(({ theme, user }) => {
        try {
            localStorage.setItem('pseudopy_theme', theme);
            // The tour gate is keyed per user id (onboarding.js), not the bare key.
            localStorage.setItem('pseudopy_tutorial_completed', 'true');
            if (user) localStorage.setItem('pseudopy_tutorial_completed_' + (user.id || user._docId), 'true');
            localStorage.setItem('pseudopy_update_dismissed', 'true');
            if (user) localStorage.setItem('pseudopy_session_user', JSON.stringify(user));
        } catch (e) { }
    }, { theme, user: role ? SESSIONS[role] : null });
    return context;
}

function shotName(engine, sizeLabel, theme, screen) {
    return `${engine}-${sizeLabel}-${theme}-${screen}.png`;
}

// init() binds editor input and loads the data caches only AFTER its awaits
// (session restore + IndexedDB) resolve — measured at ~7s on a
// Firestore-connected boot. Checks must run against a fully-initialized
// page, otherwise gutter/line-count findings describe boot latency, not the
// app. Sentinel: the functional property we depend on — the editor input
// binding answers — probed by dispatching a transient input and restoring
// value/selection/line-count immediately (no lasting side effects).
async function waitForInit(page, timeoutMs = 45000) {
    const t0 = Date.now();
    try {
        await page.waitForFunction(() => {
            const el = document.getElementById('pseudocode-editor');
            const lc = document.getElementById('line-count');
            if (!el || !lc) return false;
            const prevValue = el.value;
            const prevSel = [el.selectionStart, el.selectionEnd];
            const prevCount = lc.textContent;
            el.value = prevValue + '\n__init_probe__';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            const bound = lc.textContent !== prevCount;
            el.value = prevValue;
            el.selectionStart = prevSel[0];
            el.selectionEnd = prevSel[1];
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return bound;
        }, { timeout: timeoutMs, polling: 250 });
        return Date.now() - t0;
    } catch (e) {
        process.stdout.write(`  ! editor input binding never responded within ${timeoutMs}ms; checks will run unbound\n`);
        return null;
    }
}

async function shoot(page, engine, sizeLabel, theme, screen) {
    const file = path.join(SHOT_DIR, shotName(engine, sizeLabel, theme, screen));
    try {
        await page.screenshot({ path: file, fullPage: false });
        return shotName(engine, sizeLabel, theme, screen);
    } catch (e) { return null; }
}

function hasDefects(c) {
    return (c.overflow && c.overflow.some(o => o.kind === 'page' || o.kind === 'clipped'))
        || (c.docOverflow && c.docOverflow.over > 1)
        || (c.scrolled && c.scrolled.length > 0)
        || (c.editorHeights && Math.abs(c.editorHeights.textarea - c.editorHeights.gutter) > 2)
        || (c.actionBar && c.actionBar.hiddenBehindWhenScrolledToEnd.length > 0);
}

// ---------------------------------------------------------------- main
async function main() {
    const args = parseArgs(process.argv);
    fs.mkdirSync(SHOT_DIR, { recursive: true });

    const engines = args.engine === 'webkit' ? [webkit]
        : args.engine === 'chromium' ? [chromium]
            : [chromium, webkit];
    const engineNames = args.engine === 'webkit' ? ['webkit']
        : args.engine === 'chromium' ? ['chromium'] : ['chromium', 'webkit'];

    let sizeEntries = Object.entries(SIZES);
    if (args.sizes) sizeEntries = sizeEntries.filter(([l]) => args.sizes.includes(Number(l.split('x')[0])));
    if (args.quick) sizeEntries = sizeEntries.filter(([l]) => l === '390x844');
    const themes = args.themes || (args.quick ? ['dark'] : ['dark', 'light']);
    const landscapeLabels = new Set(['667x375', '844x390', '1024x768']);

    let server = null;
    if (!args.noServer) server = await startServer();

    const findings = [];
    const summary = [];
    try {
        for (let e = 0; e < engines.length; e++) {
            const engineName = engineNames[e];
            const browser = await engines[e].launch();
            for (const [sizeLabel, size] of sizeEntries) {
                // Landscape probes run in dark only to bound runtime.
                const sizeThemes = landscapeLabels.has(sizeLabel) ? themes.slice(0, 1) : themes;
                for (const theme of sizeThemes) {
                    const t0 = Date.now();
                    const combo = `${engineName} ${sizeLabel} ${theme}`;
                    process.stdout.write(`\n=== ${combo} ===\n`);

                    // --- Login screen (public, no session) ---
                    {
                        const ctx = await prepareContext(browser, engineName, size, theme, null);
                        const page = await ctx.newPage();
                        try {
                            await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
                            await page.waitForSelector('#login-page', { state: 'visible', timeout: 20000 });
                            await page.waitForTimeout(600);
                            const c = await page.evaluate(RUN_CHECKS);
                            const shot = isBaselineCombo(engineName, sizeLabel, theme, landscapeLabels)
                                ? await shoot(page, engineName, sizeLabel, theme, 'login') : null;
                            const rec = { combo, engine: engineName, size: sizeLabel, theme, role: 'public', screen: 'login', checks: c, shot };
                            findings.push(rec);
                            if (hasDefects(c)) summary.push(rec);
                            process.stdout.write(`  login: ${c.overflow.length} overflow, doc+${c.docOverflow.over}, ${c.touch.length}/${c.touchTotal} touch, ${c.smallText.length} smallText\n`);
                        } catch (err) {
                            process.stdout.write(`  login FAILED: ${err.message}\n`);
                        }
                        await ctx.close();
                    }

                    // --- Role screens ---
                    for (const role of ['student', 'instructor', 'admin']) {
                        const ctx = await prepareContext(browser, engineName, size, theme, role);
                        const page = await ctx.newPage();
                        page.on('pageerror', () => { });
                        try {
                            await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
                            await page.waitForSelector('#app-layout:not(.hidden)', { timeout: 25000 });
                            await page.waitForTimeout(800);
                            const initMs = await waitForInit(page);

                            for (const screen of SCREENS_BY_ROLE[role]) {
                                try {
                                    await page.evaluate(id => navigateTo(id), screen);
                                    await page.waitForTimeout(screen === 'developer-options' ? 2500 : 900);
                                    // Reproduce the Android gutter defect: fill the editor
                                    // with 32 lines so the gutter outgrows the fixed-height
                                    // textarea, exactly like a student's real draft.
                                    if (screen === 'write-pseudocode') {
                                        await page.evaluate(() => {
                                            const ed = document.getElementById('pseudocode-editor');
                                            if (!ed) return;
                                            ed.value = Array.from({ length: 32 }, (_, i) => 'SET line' + (i + 1) + ' TO ' + (i + 1)).join('\n');
                                            ed.dispatchEvent(new Event('input', { bubbles: true }));
                                        });
                                        await page.waitForTimeout(400);
                                    }
                                    const c = await page.evaluate(RUN_CHECKS);
                                    const shot = isBaselineCombo(engineName, sizeLabel, theme, landscapeLabels)
                                        ? await shoot(page, engineName, sizeLabel, theme, `${role}-${screen}`) : null;
                                    const rec = { combo, engine: engineName, size: sizeLabel, theme, role, screen, checks: c, shot, initWaitMs: initMs };
                                    findings.push(rec);
                                    if (hasDefects(c)) summary.push(rec);
                                    process.stdout.write(`  ${role}/${screen}: ${c.overflow.length} overflow, doc+${c.docOverflow.over}, ${c.touch.length}/${c.touchTotal} touch, ${c.smallText.length} smallText${c.tabBar ? `, tabbar ${c.tabBar.height}px/${c.tabBar.rows}rows` : ''}${c.actionBar ? `, bar ${c.actionBar.height}px (${Math.round(c.actionBar.viewportShare * 100)}%)` : ''}\n`);

                                    // DevTools: walk every tab panel.
                                    if (screen === 'developer-options') {
                                        const hasTabs = await page.evaluate(() => typeof devToolsSwitchTab === 'function' && !!document.querySelector('#devtools-tab-bar .devtools-tab'));
                                        if (hasTabs) {
                                            // Synthesize populated pipeline stages so overflow reflects real content.
                                            await page.evaluate(() => {
                                                const labels = ['Done', 'Done', 'Done', 'Done', 'Done', 'Done', 'Running'];
                                                document.querySelectorAll('.pipeline-stage').forEach((el, i) => {
                                                    el.className = 'pipeline-stage status-' + (i < 6 ? 'success' : 'running');
                                                    el.setAttribute('data-status-label', labels[i] || 'Done');
                                                });
                                            });
                                            const pipe = await page.evaluate(RUN_CHECKS);
                                            const pipeRec = { combo, engine: engineName, size: sizeLabel, theme, role, screen: 'developer-options#pipeline', checks: pipe, shot: null };
                                            findings.push(pipeRec);
                                            if (hasDefects(pipe)) summary.push(pipeRec);

                                            for (const tab of DEVTOOLS_TABS) {
                                                await page.evaluate(t => devToolsSwitchTab(t), tab);
                                                await page.waitForTimeout(tab === 'sop2' ? 400 : 200);
                                                if (tab === 'sop2') {
                                                    try {
                                                        await page.click('#sop2-run', { timeout: 3000 });
                                                        await page.waitForFunction(() => {
                                                            const r = document.getElementById('sop2-result');
                                                            return r && r.children.length > 0;
                                                        }, { timeout: 30000 });
                                                        await page.waitForTimeout(400);
                                                    } catch (err) {
                                                        process.stdout.write(`    sop2 run skipped: ${err.message.split('\n')[0]}\n`);
                                                    }
                                                }
                                                const c2 = await page.evaluate(RUN_CHECKS);
                                                const shot = DEVTOOLS_SHOT_TABS.has(tab)
                                                    ? await shoot(page, engineName, sizeLabel, theme, `devtools-${tab}`) : null;
                                                const rec2 = { combo, engine: engineName, size: sizeLabel, theme, role, screen: `developer-options#${tab}`, checks: c2, shot };
                                                findings.push(rec2);
                                                if (hasDefects(c2)) summary.push(rec2);
                                                process.stdout.write(`    tab ${tab}: ${c2.overflow.length} overflow, doc+${c2.docOverflow.over}${c2.scrolled.length ? `, scrolled: ${c2.scrolled.map(s => s.el).join(' ')}` : ''}\n`);
                                            }
                                        }
                                    }

                                    // Overlays: drawer (phones), notifications, theme menu.
                                    if (screen === SCREENS_BY_ROLE[role][0]) {
                                        const overlayChecks = [
                                            { name: 'drawer', open: async () => {
                                                const ok = await page.evaluate(() => {
                                                    const b = document.getElementById('hamburger-btn');
                                                    if (!b || getComputedStyle(b).display === 'none') return false;
                                                    b.click(); return true;
                                                });
                                                return ok ? page.waitForTimeout(500) : null;
                                            }, close: () => page.evaluate(() => closeMobileSidebar()) },
                                            { name: 'notifications', open: async () => {
                                                await page.evaluate(() => document.getElementById('notif-bell-btn')?.click());
                                                await page.waitForTimeout(400);
                                            }, close: () => page.keyboard.press('Escape') },
                                            { name: 'theme-menu', open: async () => {
                                                await page.evaluate(() => document.getElementById('theme-toggle-btn')?.click());
                                                await page.waitForTimeout(300);
                                            }, close: () => page.keyboard.press('Escape') }
                                        ];
                                        for (const ov of overlayChecks) {
                                            try {
                                                const started = await ov.open();
                                                if (started === null) continue;
                                                const c3 = await page.evaluate(RUN_CHECKS);
                                                const shot = isBaselineCombo(engineName, sizeLabel, theme, landscapeLabels)
                                                    ? await shoot(page, engineName, sizeLabel, theme, `overlay-${ov.name}`) : null;
                                                const rec3 = { combo, engine: engineName, size: sizeLabel, theme, role, screen: `overlay:${ov.name}`, checks: c3, shot };
                                                findings.push(rec3);
                                                if (hasDefects(c3)) summary.push(rec3);
                                                process.stdout.write(`  overlay ${ov.name}: ${c3.overflow.length} overflow, ${c3.touch.length}/${c3.touchTotal} touch\n`);
                                            } catch (err) {
                                                process.stdout.write(`  overlay ${ov.name} FAILED: ${err.message.split('\n')[0]}\n`);
                                            }
                                            try { await ov.close(); await page.waitForTimeout(200); } catch (e) { }
                                        }
                                    }
                                } catch (err) {
                                    process.stdout.write(`  ${role}/${screen} FAILED: ${err.message.split('\n')[0]}\n`);
                                }
                            }
                        } catch (err) {
                            process.stdout.write(`  ${role} boot FAILED: ${err.message.split('\n')[0]}\n`);
                        }
                        await ctx.close();
                    }
                    process.stdout.write(`--- ${combo} done in ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
                }
            }
            await browser.close();
        }
    } finally {
        if (server) server.kill();
    }

    const outFile = path.join(OUT_DIR, `findings-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), findings, summary }, null, 1));
    process.stdout.write(`\nFindings: ${findings.length} screen visits, ${summary.length} with layout defects.\nWritten: ${outFile}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
