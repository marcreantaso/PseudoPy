/* ============================================================
   SELECTION & CARET POLICY GATE (index.html + style.css + src)

   Browser caret browsing (Chrome/Edge F7 — "Navigate pages with a
   text cursor") plants a blinking caret in interface chrome even
   though nothing there is editable. A page cannot switch caret
   browsing off, so the app must make chrome non-selectable, hide
   the caret there, and keep the content users copy selectable.

   These are static contract checks: they pin the CSS layering, the
   ARIA markup, and the "no global printable-key handler" invariant.
   The paired runtime proof lives in scripts/qa/selection-caret.cjs.
   ============================================================ */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');

// ── Helpers ──────────────────────────────────────────────────

/** The declaration block (including braces) of a rule, located by a marker
 *  comment or selector fragment that must appear in its preceding text. */
function ruleBlock(source, marker) {
    const at = source.indexOf(marker);
    assert.notEqual(at, -1, `style.css is missing the "${marker}" rule`);
    const start = source.indexOf('{', at);
    assert.notEqual(start, -1, `the "${marker}" rule has no declaration block`);
    let depth = 0;
    for (let i = start; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
            depth--;
            if (depth === 0) return source.slice(at, i + 1);
        }
    }
    throw new Error(`unbalanced braces after "${marker}"`);
}

function declarations(block) {
    const body = block.slice(block.indexOf('{') + 1, block.lastIndexOf('}'));
    const out = {};
    body.split(';').forEach(part => {
        const i = part.indexOf(':');
        if (i === -1) return;
        out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
    });
    return out;
}

function srgbToLinear(channel) {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
    return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

function openTags(source, tag) {
    return source.match(new RegExp(`<${tag}\\b[^>]*>`, 'g')) || [];
}

function srcFiles() {
    const out = [];
    (function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.js')) out.push(full);
        }
    })(path.join(ROOT, 'src'));
    return out;
}

/** Balanced-brace slice starting at the first '{' at or after `from`. */
function bracedBody(source, from) {
    const start = source.indexOf('{', from);
    if (start === -1) return '';
    let depth = 0;
    for (let i = start; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
            depth--;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    return source.slice(start);
}

/** Bodies of every global (document/window) keydown handler in a file. */
function globalKeyHandlers(source) {
    const reg = /(?:document|window)\.addEventListener\(\s*['"]keydown['"]\s*,\s*/g;
    const bodies = [];
    let m;
    while ((m = reg.exec(source))) {
        const rest = source.slice(reg.lastIndex).replace(/^\s*/, '');
        const braced = /^(?:async\s+)?function\b/.test(rest)
            || /^(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{/.test(rest);
        if (braced) {
            bodies.push(bracedBody(source, reg.lastIndex));
            continue;
        }
        const named = /^([A-Za-z_$][\w$]*)\s*[,)]/.exec(rest);
        if (named) {
            const fnRe = new RegExp(`function\\s+${named[1]}\\s*\\(`);
            const fm = fnRe.exec(source);
            bodies.push(fm ? bracedBody(source, fm.index) : '');
            continue;
        }
        const end = source.indexOf(');', reg.lastIndex);
        bodies.push(end === -1 ? rest : source.slice(reg.lastIndex, end));
    }
    return bodies;
}

// ── CSS: chrome is not selectable and shows no caret ─────────

const chromeBlock = ruleBlock(css, 'Interface chrome: not selectable, no blinking caret');
const allowBlock = ruleBlock(css, 'Content users copy: explicitly selectable');
const escapeBlock = ruleBlock(css, 'Escape hatch: editable controls always keep a caret');

test('interface chrome disables selection and hides the text caret', () => {
    const decl = declarations(chromeBlock);
    assert.equal(decl['user-select'], 'none');
    assert.equal(decl['-webkit-user-select'], 'none', 'Safari/iOS need the prefixed property');
    assert.equal(decl['caret-color'], 'transparent',
        'user-select alone does not always stop the caret-browsing caret');

    const required = [
        '.sidebar', '.topbar', '.sidebar-footer', '.user-info',
        '.nav-section-label', '.nav-item',
        '.page-header', '.panel-header', '.card-header', '.modal-header', '.modal-footer',
        '.devtools-tab-bar', '.devtools-tab',
        '.badge', '.toast-container', '.toast',
        '.pagination-controls', '.pagination-info', '.sync-state-indicator', '.sync-notice',
        '.skip-link', 'th', 'button', '.btn', 'label',
    ];
    const selectors = chromeBlock.slice(0, chromeBlock.indexOf('{'));
    required.forEach(sel => {
        assert.match(selectors, new RegExp(`(^|[,\\s])${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[,\\s])`),
            `chrome rule should cover ${sel}`);
    });
});

test('copyable content opts back into selection', () => {
    const decl = declarations(allowBlock);
    assert.equal(decl['user-select'], 'text');
    assert.equal(decl['-webkit-user-select'], 'text');

    const selectors = allowBlock.slice(0, allowBlock.indexOf('{'));
    const required = [
        '.selectable', '.code-editor', '.output-content',
        '.feedback-list', '.feedback-container',
        '.devtools-raw-pre', '.devtools-panel-body', '.devtools-table td',
        'td', 'pre', 'code', '#console-output', '#python-output',
    ];
    required.forEach(sel => {
        assert.match(selectors, new RegExp(`(^|[,\\s])${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[,\\s])`),
            `allowlist should cover ${sel}`);
    });

    // The opt-in rule must come after the chrome rule so a deliberate
    // allowlist entry wins any specificity tie.
    assert.ok(css.indexOf(allowBlock) > css.indexOf(chromeBlock),
        'the selectable allowlist must be declared after the chrome rule');
});

test('editable controls keep a normal caret, whatever chrome they sit in', () => {
    const decl = declarations(escapeBlock);
    assert.equal(decl['user-select'], 'text');
    assert.equal(decl['caret-color'], 'auto');

    const selectors = escapeBlock.slice(0, escapeBlock.indexOf('{'));
    ['input', 'textarea', 'select', '[contenteditable]', '[role=\'textbox\']'].forEach(sel => {
        assert.ok(selectors.includes(sel), `escape hatch should cover ${sel}`);
    });

    // ...and it is the last of the three layers.
    assert.ok(css.indexOf(escapeBlock) > css.indexOf(allowBlock));
});

test('selection colours are deliberate and readable in both themes', () => {
    const light = /:root\s*\{([^}]*--selection-bg[^}]*)\}/.exec(css);
    const dark = /\[data-theme=['"]dark['"]\]\s*\{([^}]*--selection-bg[^}]*)\}/.exec(css);
    assert.ok(light, 'light-theme selection colours are missing');
    assert.ok(dark, 'dark-theme selection colours are missing');

    const read = (block, prop) => new RegExp(`${prop}:\\s*(#[0-9a-fA-F]{3,6})`).exec(block)[1];

    for (const [name, block] of [['light', light[1]], ['dark', dark[1]]]) {
        const bg = read(block, '--selection-bg');
        const fg = read(block, '--selection-fg');
        assert.notEqual(bg.toLowerCase(), fg.toLowerCase(), `${name}: selection fg and bg must differ`);
        const ratio = contrast(bg, fg);
        assert.ok(ratio >= 4.5,
            `${name}: ::selection contrast ${ratio.toFixed(2)}:1 is below the 4.5:1 minimum`);
    }

    assert.match(css, /::selection\s*\{[^}]*var\(--selection-bg\)[^}]*var\(--selection-fg\)/s,
        'a single ::selection rule should apply the theme tokens');
});

test('nav and tab controls carry drag/callout guards and honest cursors', () => {
    const rules = css.match(/[^{}]*\{[^}]*\}/g) || [];
    const withDecl = (re) => rules.filter(r => re.test(r));

    const dragRule = withDecl(/webkit-user-drag:\s*none/).find(r => /\.nav-item/.test(r) && /\.devtools-tab/.test(r));
    assert.ok(dragRule, '.nav-item/.devtools-tab need -webkit-user-drag: none');
    assert.match(dragRule, /-webkit-touch-callout:\s*none/);

    const labelRule = withDecl(/cursor:\s*default/).find(r => /\.nav-section-label/.test(r));
    assert.ok(labelRule, '.nav-section-label should read as a label, not a link');

    const navItem = ruleBlock(css, '\n.nav-item {');
    assert.equal(declarations(navItem)['cursor'], 'pointer', 'nav items are actionable');
});

// ── Markup: real controls, real ARIA ─────────────────────────

test('every sidebar nav item is a real button with an accessible active state', () => {
    const navTags = openTags(html, 'button').filter(t => /\bclass="[^"]*\bnav-item\b/.test(t));
    assert.ok(navTags.length >= 15, `expected the full nav, found ${navTags.length} items`);
    navTags.forEach(tag => {
        assert.match(tag, /\btype="button"/, `nav item is not an explicit button: ${tag.slice(0, 70)}`);
    });

    // No div/span/anchor is pretending to be a nav item.
    const impostors = html.match(/<(?!button\b)[a-z]+[^>]*class="[^"]*\bnav-item\b[^"]*"/g) || [];
    assert.deepEqual(impostors, [], 'nav items must be <button> elements');

    // Exactly one active item per role group, always mirrored by aria-current.
    const current = html.match(/aria-current="page"/g) || [];
    assert.equal(current.length, 3, 'one aria-current="page" per nav group (student/instructor/admin)');
    const activeNav = navTags.filter(t => /\bnav-item active\b/.test(t));
    assert.equal(activeNav.length, 3, 'one .nav-item.active per nav group');
    activeNav.forEach(tag => assert.match(tag, /aria-current="page"/));

    // The runtime keeps them in step.
    const nav = fs.readFileSync(path.join(ROOT, 'src', 'app', 'navigation.js'), 'utf8');
    assert.match(nav, /item\.setAttribute\('aria-current', 'page'\)/);
    assert.match(nav, /item\.removeAttribute\('aria-current'\)/);
    assert.match(nav, /classList\.toggle\('active', isActive\)/,
        'the active class and aria-current must be driven by the same predicate');
});

test('the Developer Options strip is a real ARIA tablist', () => {
    assert.match(html, /id="devtools-tab-bar"[^>]*role="tablist"/,
        'the tab bar needs role="tablist"');
    assert.match(html, /id="devtools-tab-bar"[^>]*aria-label="[^"]+"/,
        'the tablist needs an accessible name');

    const tabs = openTags(html, 'button').filter(t => /\bclass="[^"]*\bdevtools-tab\b/.test(t));
    assert.equal(tabs.length, 20, `expected 20 devtools tabs, found ${tabs.length}`);

    const tabIds = new Set();
    tabs.forEach(tag => {
        assert.match(tag, /\btype="button"/, 'tabs must be explicit buttons');
        assert.match(tag, /\brole="tab"/, 'tabs need role="tab"');
        assert.match(tag, /\baria-selected="(true|false)"/, 'tabs need aria-selected');
        assert.match(tag, /\btabindex="(-1|0)"/, 'tabs need a roving tabindex');
        assert.match(tag, /\bdata-tab="([a-z0-9]+)"/, 'tabs need a data-tab id');
        tabIds.add(/\bdata-tab="([a-z0-9]+)"/.exec(tag)[1]);
    });

    const selected = tabs.filter(t => /aria-selected="true"/.test(t));
    assert.equal(selected.length, 1, 'exactly one tab is selected');
    assert.match(selected[0], /\btabindex="0"/, 'the selected tab owns the single tab stop');
    tabs.filter(t => !/aria-selected="true"/.test(t))
        .forEach(tag => assert.match(tag, /tabindex="-1"/, 'unselected tabs are out of the tab order'));

    // Every tab points at a panel that exists.
    const panels = new Set((html.match(/id="devtools-panel-([a-z0-9]+)"/g) || [])
        .map(s => /id="devtools-panel-([a-z0-9]+)"/.exec(s)[1]));
    tabIds.forEach(id => assert.ok(panels.has(id), `no panel for tab "${id}"`));
});

test('tab switching keeps ARIA state, roving tabindex and keyboard nav in step', () => {
    const js = fs.readFileSync(path.join(ROOT, 'src', 'devtools', 'pipeline-controls.js'), 'utf8');
    const switchFn = bracedBody(js, js.indexOf('function devToolsSwitchTab'));
    assert.match(switchFn, /setAttribute\('aria-selected', String\(active\)\)/);
    assert.match(switchFn, /tabIndex = active \? 0 : -1/);

    const initFn = bracedBody(js, js.indexOf('function devToolsInitTabs'));
    assert.match(initFn, /setAttribute\('role', 'tabpanel'\)/);
    assert.match(initFn, /setAttribute\('aria-controls'/);
    assert.match(initFn, /setAttribute\('aria-labelledby'/);
    ['ArrowRight', 'ArrowLeft', 'Home', 'End'].forEach(key => {
        assert.ok(initFn.includes(key), `tablist keyboard support should handle ${key}`);
    });

    assert.match(js, /devToolsInitTabs\(\)/, 'initDevTools must wire the tablist');
});

test('the walkthrough step list uses real buttons, not div role=button', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src', 'devtools', 'simulation.js'), 'utf8');
    assert.ok(src.includes('<button type="button" class="sim-walk-row"'),
        'walkthrough rows must be real buttons');
    assert.ok(!src.includes('role="button"'), 'no div should imitate a button any more');
    assert.ok(!/onkeydown="if\(event\.key===/.test(src),
        'native button activation replaces the inline Enter/Space handler');

    // The shipped bundle must match the source.
    const bundle = fs.readFileSync(path.join(ROOT, 'devtools.js'), 'utf8');
    assert.ok(bundle.includes('<button type="button" class="sim-walk-row"'), 'devtools.js is stale — run npm run build');
});

test('generated app bundle carries the nav aria-current wiring', () => {
    const bundle = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    assert.ok(bundle.includes("item.setAttribute('aria-current', 'page')"),
        'app.js is stale — run npm run build');
});

test('a caret-browsing note reaches both developers and students', () => {
    const langGuide = /id="devtools-panel-langguide"[\s\S]*?<\/div>\s*<\/div>/.exec(html);
    assert.ok(langGuide, 'Language Guide panel not found');
    assert.match(langGuide[0], /F7/, 'Language Guide should mention F7');
    assert.match(langGuide[0], /caret browsing/i);

    const settings = /id="page-student-settings"[\s\S]*?Display &amp; Accessibility[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/.exec(html);
    assert.ok(settings, 'a Display & Accessibility block should exist in Settings');
    assert.match(settings[0], /F7/, 'Settings should mention F7');

    assert.match(html, /Navigate pages with a text cursor/,
        'the note should name the browser setting users must switch off');
});

test('the shipped shell exposes no page-level editing surface', () => {
    assert.ok(!/contenteditable/i.test(html), 'index.html must not ship contenteditable');
    assert.ok(!/document\.designMode\s*=/.test(html), 'index.html must not enable designMode');
    const chrome = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    assert.ok(!/document\.designMode\s*=\s*['"]?on/.test(chrome), 'the app must never switch designMode on');
});

// ── Global keyboard handling ─────────────────────────────────

test('no global key handler reacts to printable keys', () => {
    const files = srcFiles();
    const seen = [];

    for (const file of files) {
        const source = fs.readFileSync(file, 'utf8');
        const rel = path.relative(ROOT, file).replace(/\\/g, '/');

        assert.ok(!/\.keyCode\b/.test(source), `${rel} uses legacy keyCode`);
        assert.ok(!/\.key\.length\s*===\s*1/.test(source),
            `${rel} detects printable keys via key.length`);

        for (const body of globalKeyHandlers(source)) {
            seen.push(rel);
            const re = /\.key\s*===\s*'([^']*)'/g;
            let m;
            while ((m = re.exec(body))) {
                const key = m[1];
                assert.ok(key.length !== 1,
                    `${rel}: a global keydown handler reacts to the printable key ${JSON.stringify(key)}; `
                    + 'it must ignore input/textarea/select/[contenteditable] targets and stay quiet while a modal is open');
            }
        }
    }

    assert.ok(seen.length >= 4,
        `expected to find the global key handlers, found ${seen.length} in ${files.length} files`);
});

test('modal-scoped key handling stays scoped', () => {
    // Enter-to-submit lives on the modal that owns it, and exempts textareas,
    // so a global printable-key listener can never be needed for it.
    const users = fs.readFileSync(path.join(ROOT, 'src', 'app', 'users.js'), 'utf8');
    const at = users.indexOf("modal.addEventListener('keydown'");
    assert.notEqual(at, -1, 'the user modal should own its Enter handling');
    const body = bracedBody(users, at);
    assert.match(body, /tagName === 'TEXTAREA'/,
        'the modal Enter handler must let textareas keep their newline');
});
