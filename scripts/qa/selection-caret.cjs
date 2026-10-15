/* ============================================================
   PSEUDOPY — SELECTION & CARET RUNTIME PROOF
   ------------------------------------------------------------
   Static contracts live in tests/selection-caret.test.js. This
   script proves the same behaviour in a real Chrome:

     1. chrome text cannot be selected with real mouse input
     2. chrome exposes no caret colour; content keeps one
     3. copyable content (console, editors, code, table cells)
        still selects normally
     4. the Developer Options strip behaves like a real ARIA tablist
     5. the focus ring is a 2px outline with >= 4.5:1 contrast

   It also writes light/dark screenshots at 375 and 1440 px.

   Run: node scripts/qa/selection-caret.cjs
   ============================================================ */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { start } = require('./serve.cjs');
const { launchChrome, newPage, closePage, waitFor, sleep } = require('./cdp.cjs');

const SHOT_DIR = process.env.PSEUDOPY_SHOT_DIR || path.join(os.tmpdir(), 'pseudopy-caret-shots');
const failures = [];
const results = [];

function check(name, ok, detail) {
    results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
    if (!ok) failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}

// ── Colour maths (mirrors the static test) ───────────────────
function srgbToLinear(channel) {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function luminance(rgb) {
    return 0.2126 * srgbToLinear(rgb[0]) + 0.7152 * srgbToLinear(rgb[1]) + 0.0722 * srgbToLinear(rgb[2]);
}
function parseRgb(value) {
    return (String(value).match(/[\d.]+/g) || []).slice(0, 3).map(Number);
}
function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

// ── Real-input helpers ───────────────────────────────────────
/** Move the mouse, then click twice at (x, y): Chrome treats the second
 *  press as a word-selection double-click and honours user-select. */
async function dblclick(page, x, y) {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 2, buttons: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 2, buttons: 0 });
}

async function drag(page, from, to) {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y, buttons: 0 });
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1, buttons: 1 });
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
        await page.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: from.x + ((to.x - from.x) * i) / steps,
            y: from.y + ((to.y - from.y) * i) / steps,
            button: 'left',
            buttons: 1,
        });
    }
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1, buttons: 0 });
}

async function pressKey(page, key, code, keyCode) {
    const base = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
    await page.send('Input.dispatchKeyEvent', Object.assign({ type: 'rawKeyDown' }, base));
    await page.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, base));
}

/** A point inside an element, relative to its top-left, after scrolling it in. */
async function pointIn(page, selector, dx, dy) {
    return page.evaluate(`
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', inline: 'nearest' });
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        return { x: r.left + ${dx}, y: r.top + ${dy}, w: r.width, h: r.height };
    `);
}

/** A point on real glyphs: the centre of the element's first few characters. */
async function pointOnText(page, selector, charOffset = 2) {
    return page.evaluate(`
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
        let node = null;
        while ((node = walker.nextNode())) {
            if (node.nodeValue && node.nodeValue.trim().length) break;
        }
        if (!node) return null;
        const first = node.nodeValue.indexOf(node.nodeValue.trim());
        const range = document.createRange();
        range.setStart(node, Math.min(first + ${charOffset}, node.nodeValue.length - 1));
        range.setEnd(node, Math.min(first + ${charOffset} + 3, node.nodeValue.length));
        if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', inline: 'nearest' });
        const r = range.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    `);
}

async function clearSelection(page) {
    await page.run('window.getSelection().removeAllRanges(); return true;');
}

/** What a double-click at `point` selected, with the anchor's location. */
async function doubleClickAndReport(page, point) {
    await clearSelection(page);
    await dblclick(page, point.x, point.y);
    return page.evaluate(`
        const sel = window.getSelection();
        const node = sel && sel.anchorNode;
        const anchor = node ? (node.nodeType === 3 ? node.parentElement : node) : null;
        return {
            text: sel ? sel.toString() : '',
            anchor: anchor ? anchor.tagName + '.' + (anchor.className || '') : null,
            insideChrome: anchor ? !!anchor.closest('.sidebar, .topbar, .devtools-tab-bar, .nav-item, .devtools-tab, button, th, .page-header, .panel-header, .modal-header, .toast-container') : false,
        };
    `);
}

/** Press Tab until a sidebar nav item owns focus, then measure its ring. */
async function focusRingOf(page) {
    await page.run('document.body.focus(); return true;');
    for (let i = 0; i < 30; i++) {
        await pressKey(page, 'Tab', 'Tab', 9);
        const state = await page.evaluate(`
            const el = document.activeElement;
            if (!el || el === document.body) return null;
            const isNav = typeof el.classList !== 'undefined' && el.classList.contains('nav-item');
            if (!isNav) return null;
            const cs = getComputedStyle(el);
            const behind = (function () {
                let n = el.parentElement;
                while (n) {
                    const c = getComputedStyle(n).backgroundColor;
                    if (c && !/^(transparent|rgba\\(0,\\s*0,\\s*0,\\s*0\\))$/.test(c)) return c;
                    n = n.parentElement;
                }
                return getComputedStyle(document.body).backgroundColor;
            })();
            return {
                label: (el.textContent || '').trim().slice(0, 24),
                focusVisible: !!el.matches(':focus-visible'),
                width: cs.outlineWidth,
                color: cs.outlineColor,
                style: cs.outlineStyle,
                behind,
            };
        `);
        if (state) return state;
    }
    return null;
}

async function main() {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const server = await start(0);
    const origin = 'http://127.0.0.1:' + server.address().port;
    const chrome = await launchChrome();
    let page;
    try {
        page = await newPage(chrome.wsUrl, origin);
        await waitFor(page, 'typeof navigateTo === "function" && typeof showApp === "function"');
        await page.setViewport(1440, 900, 1, false);
        await page.run(`
            onbShouldAutoStart = () => false;
            try { onbStop(); } catch (_) {}
            hideBootSplash();
            currentUser = { id: 'qa_caret', _docId: 'qa_caret', username: 'qa', fullName: 'QA User', role: 'admin', status: 'active' };
            showApp('developer-options');
            navigateTo('developer-options');
            return true;
        `);
        await waitFor(page, 'document.querySelectorAll("#devtools-tab-bar .devtools-tab").length === 20', { timeout: 30000 });
        await waitFor(page, 'typeof devToolsInitTabs === "function" && !!document.getElementById("devtools-tab-ast")', { timeout: 30000 });
        await waitFor(page, 'document.querySelector(".sidebar").getBoundingClientRect().width > 0', { timeout: 10000 });

        // ── 1. Computed style contract ────────────────────────
        const styles = await page.evaluate(`
            const pick = (el) => {
                if (!el) return null;
                const cs = getComputedStyle(el);
                return { tag: el.tagName, userSelect: cs.userSelect || cs.webkitUserSelect, caretColor: cs.caretColor, cursor: cs.cursor };
            };
            return {
                navItem: pick(document.querySelector('.nav-item')),
                navSectionLabel: pick(document.querySelector('.nav-section-label')),
                sidebar: pick(document.querySelector('.sidebar')),
                topbar: pick(document.querySelector('.topbar')),
                devtoolsTab: pick(document.querySelector('.devtools-tab')),
                devtoolsTabBar: pick(document.querySelector('.devtools-tab-bar')),
                tableHeader: pick(document.querySelector('.devtools-table th') || document.querySelector('th')),
                pageHeaderButton: pick(document.querySelector('.page-header button, .page-header .btn')),
                badge: pick(document.querySelector('.badge') || document.querySelector('.devtools-count')),
                consoleOutput: pick(document.getElementById('console-output')),
                codeEditor: pick(document.getElementById('pseudocode-editor')),
                pythonOutput: pick(document.getElementById('python-output')),
                rawPre: pick(document.querySelector('.devtools-raw-pre')),
                languageGuide: pick(document.querySelector('#devtools-panel-langguide .devtools-panel-body')),
            };
        `);

        const transparent = (v) => /^(transparent|rgba\(0,\s*0,\s*0,\s*0\))$/.test(String(v || '').trim());
        for (const [key, label] of [
            ['navItem', 'sidebar nav item'],
            ['navSectionLabel', 'nav section label'],
            ['sidebar', 'sidebar'],
            ['topbar', 'topbar'],
            ['devtoolsTab', 'Developer Options tab'],
            ['devtoolsTabBar', 'Developer Options tab bar'],
            ['tableHeader', 'table header cell'],
            ['pageHeaderButton', 'page-header button'],
            ['badge', 'badge/counter'],
        ]) {
            const s = styles[key];
            check(`chrome non-selectable: ${label}`, s && s.userSelect === 'none', s ? `user-select=${s.userSelect}` : 'element missing');
            check(`chrome caret hidden: ${label}`, s && transparent(s.caretColor), s ? `caret-color=${s.caretColor}` : 'element missing');
        }

        for (const [key, label] of [
            ['consoleOutput', 'console output'],
            ['codeEditor', 'pseudocode editor'],
            ['pythonOutput', 'python output'],
            ['rawPre', 'raw JSON pre'],
            ['languageGuide', 'Language Guide panel'],
        ]) {
            const s = styles[key];
            check(`content selectable: ${label}`, s && s.userSelect === 'text', s ? `user-select=${s.userSelect}` : 'element missing');
            check(`content keeps caret: ${label}`, s && !transparent(s.caretColor), s ? `caret-color=${s.caretColor}` : 'element missing');
        }

        // ── 2. Real mouse input cannot select chrome ──────────
        const navPoint = await pointIn(page, '.nav-item[onclick*="developer-options"]', 30, 15);
        check('nav item is measurable', !!navPoint, JSON.stringify(navPoint));
        let report = await doubleClickAndReport(page, navPoint);
        check('double-click on a nav item selects no chrome text',
            report.text === '' || !report.insideChrome, JSON.stringify(report.text) + ' from ' + report.anchor);

        const labelPoint = await pointIn(page, '.nav-section-label', 20, 10);
        if (labelPoint) {
            report = await doubleClickAndReport(page, labelPoint);
            check('double-click on a nav label selects no chrome text',
                report.text === '' || !report.insideChrome, JSON.stringify(report.text) + ' from ' + report.anchor);
        }

        const tabRect = await page.evaluate(`
            const r = document.querySelector('.devtools-tab[data-tab="langguide"]').getBoundingClientRect();
            return { left: r.left, top: r.top, w: r.width, h: r.height };
        `);
        report = await doubleClickAndReport(page, { x: tabRect.left + tabRect.w / 2, y: tabRect.top + tabRect.h / 2 });
        check('double-click on a DevTools tab selects no chrome text',
            report.text === '' || !report.insideChrome, JSON.stringify(report.text) + ' from ' + report.anchor);

        const sidebar = await page.evaluate(`
            const r = document.querySelector('.sidebar-nav').getBoundingClientRect();
            return { top: r.top + 30, bottom: r.bottom - 30, x: r.left + r.width / 2 };
        `);
        await clearSelection(page);
        await drag(page, { x: sidebar.x, y: sidebar.top }, { x: sidebar.x, y: sidebar.bottom });
        report = await page.evaluate(`
            const sel = window.getSelection();
            const node = sel && sel.anchorNode;
            const anchor = node ? (node.nodeType === 3 ? node.parentElement : node) : null;
            return { text: sel ? sel.toString() : '', anchor: anchor ? anchor.className : null };
        `);
        check('dragging across the sidebar selects nothing', report.text === '', JSON.stringify(report.text));

        // ── 3. Content still selects ──────────────────────────
        // The copyable surfaces live on pages an admin cannot open, so the
        // content half of the run uses a student session.
        await page.run(`
            currentUser = { id: 'qa_student', _docId: 'qa_student', username: 'qa', fullName: 'QA Student', role: 'student', status: 'active' };
            showApp('write-pseudocode');
            navigateTo('write-pseudocode');
            document.getElementById('pseudocode-editor').value = 'DECLARE total AS INTEGER' + String.fromCharCode(10) + 'SET total TO 5';
            document.getElementById('console-output').textContent = 'SAMPLE OUTPUT LINE FOR SELECTION';
            return true;
        `);
        await sleep(400);

        report = await doubleClickAndReport(page, await pointOnText(page, '#console-output', 3));
        check('console output still selects', report.text.trim().length > 0 && !report.insideChrome, JSON.stringify(report.text));

        const editorPoint = await pointIn(page, '#pseudocode-editor', 50, 20);
        report = await doubleClickAndReport(page, editorPoint);
        const editorState = await page.evaluate(`
            const ed = document.getElementById('pseudocode-editor');
            return { selection: [ed.selectionStart, ed.selectionEnd], value: ed.value.slice(0, 30) };
        `);
        check('pseudocode editor still selects text',
            editorState.selection[0] !== editorState.selection[1],
            `start=${editorState.selection[0]} end=${editorState.selection[1]} value=${JSON.stringify(editorState.value)}`);

        // Back to the admin session for the Developer Options surface.
        await page.run(`
            currentUser = { id: 'qa_caret', _docId: 'qa_caret', username: 'qa', fullName: 'QA User', role: 'admin', status: 'active' };
            showApp('developer-options');
            navigateTo('developer-options');
            return true;
        `);
        await sleep(300);

        // A real table row: the tokens table is the app's own markup and CSS.
        await page.run(`
            navigateTo('developer-options');
            devToolsSwitchTab('tokens');
            document.getElementById('devtools-token-tbody').innerHTML =
              '<tr><td>ALPHA_TOKEN</td><td>IDENTIFIER</td><td>LINE 1</td></tr>';
            return true;
        `);
        await sleep(200);
        report = await doubleClickAndReport(page, await pointIn(page, '#devtools-token-tbody td', 30, 8));
        check('table cell data still selects', report.text.trim().length > 0, JSON.stringify(report.text));

        await page.run('devToolsSwitchTab("langguide"); return true;');
        await sleep(150);
        const prePoint = await pointOnText(page, '#devtools-panel-langguide pre', 2);
        report = prePoint ? await doubleClickAndReport(page, prePoint) : { text: '', insideChrome: true };
        check('Language Guide pre still selects', !!prePoint && report.text.trim().length > 0, JSON.stringify(report.text));

        // ── 4. ARIA tablist behaviour ─────────────────────────
        const ariaState = await page.evaluate(`
            const tabs = Array.from(document.querySelectorAll('#devtools-tab-bar .devtools-tab'));
            return {
                role: document.getElementById('devtools-tab-bar').getAttribute('role'),
                selected: tabs.filter(t => t.getAttribute('aria-selected') === 'true').map(t => t.getAttribute('data-tab')),
                tabStop: tabs.filter(t => t.tabIndex === 0).map(t => t.getAttribute('data-tab')),
                missingControls: tabs.filter(t => t.getAttribute('aria-controls') !== 'devtools-panel-' + t.getAttribute('data-tab')).length,
                panelsWithoutRole: document.querySelectorAll('.devtools-tab-panel:not([role="tabpanel"])').length,
            };
        `);
        check('tab bar is a tablist', ariaState.role === 'tablist', `role=${ariaState.role}`);
        check('exactly one tab is selected', ariaState.selected.length === 1, JSON.stringify(ariaState.selected));
        check('exactly one tab stop', ariaState.tabStop.length === 1, JSON.stringify(ariaState.tabStop));
        check('every tab controls its panel', ariaState.missingControls === 0, `${ariaState.missingControls} missing`);
        check('every panel is a tabpanel', ariaState.panelsWithoutRole === 0, `${ariaState.panelsWithoutRole} missing`);

        const beforeKey = await page.evaluate(`
            const active = document.querySelector('#devtools-tab-bar .devtools-tab[tabindex="0"]');
            active.focus();
            return { focused: document.activeElement.getAttribute('data-tab'), tab: active.getAttribute('data-tab') };
        `);
        await pressKey(page, 'ArrowRight', 'ArrowRight', 39);
        const keyState = await page.evaluate(`
            const tabs = Array.from(document.querySelectorAll('#devtools-tab-bar .devtools-tab'));
            const focused = document.activeElement;
            return {
                selected: tabs.filter(t => t.getAttribute('aria-selected') === 'true').map(t => t.getAttribute('data-tab')),
                focused: focused && focused.getAttribute ? focused.getAttribute('data-tab') : null,
                visiblePanel: (document.querySelector('.devtools-tab-panel.active') || {}).id || null,
            };
        `);
        check('ArrowRight moves tab selection', keyState.selected.length === 1 && keyState.selected[0] !== beforeKey.tab,
            `${beforeKey.tab} -> ${JSON.stringify(keyState.selected)}`);
        check('ArrowRight keeps selection and focus together', keyState.focused === keyState.selected[0],
            `focused=${keyState.focused} selected=${keyState.selected[0]}`);
        check('ArrowRight shows the matching panel', keyState.visiblePanel === 'devtools-panel-' + keyState.selected[0],
            `panel=${keyState.visiblePanel}`);

        // ── 5. Focus ring: 2px and >= 4.5:1 in both themes ────
        for (const theme of ['light', 'dark']) {
            await page.run(`
                document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)});
                return true;
            `);
            await sleep(150);
            const ring = await focusRingOf(page);
            check(`focus ring present on a nav item (${theme})`, !!ring && ring.focusVisible, ring ? JSON.stringify(ring) : 'no nav item reached by Tab');
            if (ring) {
                check(`focus ring is 2px (${theme})`, ring.width === '2px', ring.width);
                const ratio = contrast(parseRgb(ring.color), parseRgb(ring.behind));
                check(`focus ring contrast (${theme}) >= 4.5:1`, ratio >= 4.5,
                    `${ratio.toFixed(2)}:1 (${ring.color} on ${ring.behind})`);
            }
        }
        await page.run('document.documentElement.setAttribute("data-theme", "light"); return true;');

        // ── 6. No page-level editing surface ──────────────────
        const editing = await page.evaluate(`
            return {
                contentEditable: document.querySelectorAll('[contenteditable],[contenteditable=""]').length,
                designMode: document.designMode,
            };
        `);
        check('no contenteditable in the page', editing.contentEditable === 0, String(editing.contentEditable));
        check('designMode is off', editing.designMode === 'off', editing.designMode);

        // ── 7. Screenshots ───────────────────────────────────
        const shots = [];
        for (const theme of ['light', 'dark']) {
            for (const width of [375, 1440]) {
                await page.setViewport(width, 900, 1, width < 768);
                await page.run(`
                    document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)});
                    showApp('developer-options');
                    navigateTo('developer-options');
                    return true;
                `);
                await sleep(350);
                const file = path.join(SHOT_DIR, `caret-${theme}-${width}.png`);
                await page.screenshot(file);
                shots.push(file);
            }
        }
        check('screenshots written', shots.every(f => fs.existsSync(f)), shots.join(', '));
        check('no console errors during the run', page.consoleErrors.length === 0, JSON.stringify(page.consoleErrors.slice(0, 3)));

        // ── Report ───────────────────────────────────────────
        console.log('\nSelection & caret runtime proof\n' + '='.repeat(62));
        results.forEach(r => console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}${!r.ok && r.detail ? '  [' + r.detail + ']' : ''}`));
        console.log('='.repeat(62));
        console.log(`  ${results.filter(r => r.ok).length}/${results.length} checks passed`);
        console.log('  screenshots: ' + shots.join('\n               '));
        if (failures.length) {
            console.error('\nFAILURES:\n - ' + failures.join('\n - '));
            process.exitCode = 1;
        } else {
            console.log('\nAll selection/caret checks passed.');
        }
    } finally {
        if (page) await closePage(page);
        try { chrome.child.kill(); } catch (e) { /* already gone */ }
        server.close();
    }
}

main().catch(err => {
    console.error('selection-caret QA crashed:', err);
    process.exit(1);
});
