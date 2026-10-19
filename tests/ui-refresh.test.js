/* ============================================================
   SOP2 UI REFRESH CONTRACTS
   Three-mode theme menu, shadcn .pp-* component rules, the
   devtools tab bar, the rebuilt SOP2 panel markup, and the
   cache/version pins those changes ship with.
   ============================================================ */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const css = read('style.css');
const html = read('index.html');
const sw = read('sw.js');
const appearance = read('src/app/appearance.js');
const initialization = read('src/app/initialization.js');
const chartSystem = read('src/app/chart-system.js');
const researchUi = read('src/devtools/research-ui.js');

const count = (s, re) => (s.match(re) || []).length;
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const sop2Panel = html.slice(
    html.indexOf('id="devtools-panel-sop2"'),
    html.indexOf('id="devtools-panel-impl"')
);
// Shared chrome: the theme menu plus the whole .pp-* component section.
const chromeSection = css.slice(
    css.lastIndexOf('/*', css.indexOf('THEME SWITCHER MENU')),
    css.indexOf('SEMANTIC THEME EXTENSIONS')
);

// ── Theme control ─────────────────────────────────────────────

test('the top bar theme control is a three-mode ARIA radio menu', () => {
    assert.match(html, /aria-haspopup="menu" aria-expanded="false" aria-controls="theme-menu"/,
        'toggle advertises and controls the menu');
    assert.match(html, /id="theme-menu" role="menu" aria-label="Theme"/,
        'menu surface with role=menu');
    assert.equal(count(html, /role="menuitemradio"/g), 3, 'exactly three radio items');
    const modes = [...html.matchAll(/role="menuitemradio"[^>]*data-theme-mode="([a-z]+)"/g)]
        .map((m) => m[1]);
    assert.deepEqual(modes.sort(), ['dark', 'light', 'system'], 'light/dark/system modes');
    for (const label of ['>Light</span>', '>Dark</span>', '>System</span>']) {
        assert.ok(html.includes(label), 'missing label ' + label);
    }
});

test('the theme bootstrap runs before the stylesheet and defaults to dark', () => {
    const boot = html.indexOf("localStorage.getItem('pseudopy_theme')");
    const link = html.indexOf('style.css?v=');
    assert.ok(boot !== -1, 'bootstrap must read the stored preference');
    assert.ok(boot < link, 'bootstrap must run before the stylesheet paints');
    assert.match(html, /var MODES = \['light', 'dark', 'system'\]/);
    assert.match(html, /\? stored : 'dark'/, 'unset storage falls back to dark');
    assert.match(html, /matchMedia\('\(prefers-color-scheme: dark\)'\)/, 'system mode tracks the OS');
    assert.match(html, /documentElement\.setAttribute\('data-theme'/, 'first frame is themed');
    assert.match(html, /<meta name="color-scheme" content="light dark">/);
});

test('appearance.js owns the modes, storage and one themechange per switch', () => {
    assert.match(appearance, /const THEME_MODES = \['light', 'dark', 'system'\]/);
    assert.match(appearance, /\? stored : 'dark'/, 'unset storage falls back to dark');
    assert.equal(count(appearance, /new CustomEvent\('themechange'/g), 1,
        'exactly one themechange dispatch site');
    assert.match(appearance, /applyThemeMode\(getThemeMode\(\), \{ announce: false \}\)/,
        'boot applies silently');
    assert.match(appearance, /setAttribute\('aria-checked'/, 'menu items track the active mode');
    assert.match(appearance, /event\.key !== 'Escape'/, 'Escape closes the menu');
    assert.match(initialization, /initTheme\(\)/, 'menu wiring runs at boot');
    assert.match(chartSystem, /addEventListener\('themechange'/, 'charts repaint on switch');
    assert.match(researchUi, /addEventListener\('themechange'/, 'SOP2 results repaint on switch');
});

test('color-scheme flips with the theme at the top of the cascade', () => {
    const rootIdx = css.indexOf(':root {');
    assert.ok(rootIdx !== -1, 'a leading :root block must exist');
    assert.ok(css.slice(rootIdx, css.indexOf('}', rootIdx)).includes('color-scheme: light'),
        'first :root declares color-scheme: light');
    const darkIdx = css.indexOf("[data-theme='dark'] {");
    assert.ok(darkIdx !== -1, 'a leading dark block must exist');
    assert.ok(css.slice(darkIdx, css.indexOf('}', darkIdx)).includes('color-scheme: dark'),
        'first dark block declares color-scheme: dark');
});

// ── Shared chrome rules ───────────────────────────────────────

test('the theme menu and .pp-* component rules carry no hard-coded colours', () => {
    assert.ok(chromeSection.length > 4000, 'component section not found (slice too small)');
    const body = stripComments(chromeSection);
    const hexes = [...body.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    assert.deepEqual(hexes, [], 'hard-coded hex in theme/pp rules: ' + hexes.join(', '));
    const rgbs = [...body.matchAll(/\brgba?\([^)]*\)/g)].map((m) => m[0]);
    assert.deepEqual(rgbs, [], 'hard-coded rgb() in theme/pp rules: ' + rgbs.join(', '));
});

test('the .pp-* primitive set is complete and ships the a11y extras', () => {
    for (const sel of [
        '.pp-card {', '.pp-card-header {', '.pp-card-description {',
        '.pp-btn {', '.pp-btn:focus-visible {', '.pp-btn[hidden] {',
        '.pp-btn-default {', '.pp-btn-secondary {', '.pp-btn-outline {',
        '.pp-btn-ghost {', '.pp-btn-destructive {', '.pp-btn-destructive-outline {',
        '.pp-label {', '.pp-helper {', '.pp-select {', '.pp-select-wrap {',
        '.pp-checkbox {', '.pp-progress {', '.pp-menu {', '.pp-menu-item {',
        '.pp-badge {', '.pp-table {', '.pp-alert {', '.pp-empty {',
    ]) assert.ok(chromeSection.includes(sel), sel + ' missing from the component section');
    assert.match(chromeSection, /@media \(prefers-reduced-motion: reduce\)/,
        'reduced motion honoured in the component section');
    const coarse = chromeSection.match(/@media \(hover: none\) and \(pointer: coarse\) \{[^}]*\}/);
    assert.ok(coarse, 'coarse-pointer block present');
    assert.match(coarse[0], /min-height: 44px/, 'touch targets reach 44px');
});

test('the devtools tab bar is a pill track with a themed, visible scrollbar', () => {
    const i = css.indexOf('.devtools-tab-bar {');
    assert.ok(i !== -1, '.devtools-tab-bar rule missing');
    const block = css.slice(i, css.indexOf('}', i));
    assert.match(block, /background: var\(--muted\)/, 'pill track surface');
    assert.match(block, /border-radius: var\(--radius-shadcn-btn\)/, 'pill radius');
    assert.match(block, /overflow-x: auto/, 'tabs scroll horizontally');
    assert.match(block, /scrollbar-width: thin/);
    assert.match(block, /scrollbar-color: var\(--border-input\) transparent/,
        'scrollbar uses a control-grade border so the thumb is visible');
});

// ── SOP2 panel markup ─────────────────────────────────────────

test('the SOP2 panel keeps every spec id and drops the retired ones', () => {
    assert.ok(sop2Panel.length > 1000, 'SOP2 panel slice not found');
    for (const id of [
        'sop2-info-btn', 'sop2-info', 'sop2-info-title', 'sop2-info-close',
        'sop2-panel', 'sop2-inputs-title', 'sop2-src', 'sop2-ref',
        'sop2-settings-title', 'sop2-load-example', 'sop2-tier',
        'sop2-scope-injected', 'sop2-actions', 'sop2-compare', 'sop2-run',
        'sop2-bench', 'sop2-cancel', 'sop2-export-btn', 'sop2-export-menu',
        'sop2-export-json', 'sop2-export-csv', 'sop2-export-report',
        'sop2-progress', 'sop2-progress-fill', 'sop2-progress-text',
        'sop2-result', 'sop2-status',
    ]) assert.ok(sop2Panel.includes('id="' + id + '"'), id + ' missing from the panel');
    for (const dead of ['sop2-bench-cancel', 'sop2-export-md']) {
        assert.ok(!html.includes(dead), dead + ' must not reappear in index.html');
        assert.ok(!researchUi.includes(dead), dead + ' must not reappear in research-ui.js');
    }
    assert.ok(!sop2Panel.includes('style="'), 'no inline styles inside the SOP2 panel');
});

test('the SOP2 action bar follows the button/menu/progressbar contracts', () => {
    assert.match(sop2Panel, /class="pp-btn pp-btn-default pp-btn-md" id="sop2-compare"/);
    assert.match(sop2Panel, /class="pp-btn pp-btn-secondary pp-btn-md" id="sop2-run"/);
    assert.match(sop2Panel, /class="pp-btn pp-btn-outline pp-btn-md" id="sop2-bench"/);
    assert.match(sop2Panel, /class="pp-btn pp-btn-destructive-outline pp-btn-md" id="sop2-cancel" hidden/,
        'Cancel starts hidden (and the [hidden] rule must beat display)');
    assert.match(sop2Panel, /role="toolbar" aria-label="Comparison actions"/);
    assert.match(sop2Panel, /id="sop2-export-btn"\s+aria-haspopup="menu" aria-expanded="false" aria-controls="sop2-export-menu" disabled/,
        'export menu button state');
    assert.match(sop2Panel, /id="sop2-export-menu" role="menu" aria-label="Export results"/);
    assert.equal(count(sop2Panel, /role="menuitem"/g), 3, 'three export menu items');
    assert.match(sop2Panel, /id="sop2-progress" role="progressbar"/);
    assert.match(sop2Panel, /aria-label="Benchmark progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"/);
    assert.match(sop2Panel, /role="region" aria-label="Comparison results"\s+aria-live="polite" aria-busy="false"/);
    assert.match(sop2Panel, /role="status" aria-live="polite"/);
    assert.match(sop2Panel, /id="sop2-info-btn" aria-haspopup="dialog"/);
    assert.match(sop2Panel, /id="sop2-info" role="dialog"/);
    for (const id of ['sop2-src', 'sop2-ref', 'sop2-load-example', 'sop2-tier', 'sop2-scope-injected']) {
        assert.match(sop2Panel, new RegExp('for="' + id + '"'), 'label bound to ' + id);
    }
    assert.match(sop2Panel, /aria-labelledby="sop2-inputs-title"/);
    assert.match(sop2Panel, /aria-labelledby="sop2-settings-title"/);
});

// ── SOP2 behaviour (source contracts) ─────────────────────────

test('research-ui renders skeletons, live progress and a friendly empty state', () => {
    assert.match(researchUi, /setAttribute\('aria-busy', 'true'\)/, 'results announce busy');
    assert.match(researchUi, /setAttribute\('aria-busy', 'false'\)/, 'results announce done');
    assert.match(researchUi, /setAttribute\('aria-valuenow'/, 'progressbar value updates');
    assert.match(researchUi, /setAttribute\('aria-valuetext'/, 'human-readable progress text');
    assert.match(researchUi, /setAttribute\('title'/, 'full case title exposed as tooltip');
    assert.match(researchUi, /typeof requestAnimationFrame === 'function'/, 'rAF-throttled DOM flush');
    assert.match(researchUi, /pp-empty sop2-empty-state/, 'empty state is a pp-empty card');
    assert.match(researchUi, /id="sop2-empty-load"/, 'empty state offers Load example');
    assert.match(researchUi, /function renderSkeletons\(\)/, 'skeleton rows while computing');
    assert.equal(count(researchUi, /renderSkeletons\(\);/g), 2,
        'compare and benchmark both show skeletons');
    for (const label of ['Seed (built-in)', 'Holdout (independent)', 'Injected (deliberately broken)']) {
        assert.ok(researchUi.includes(label), label + ' optgroup missing');
    }
    assert.match(researchUi, /Sop2Injection/, 'injected cases reuse the benchmark injector');
    assert.match(researchUi, /setStatus\('Error: ' \+ \(\(e && e\.message\) \|\| e\)\)/,
        'friendly error text only');
    assert.doesNotMatch(researchUi, /\.stack/, 'no stack traces reach the UI');
    assert.match(researchUi, /e\.key === 'ArrowDown'/, 'export menu roving focus');
    assert.match(researchUi, /closeExportMenu\(\);\s+btn\.focus\(\)/,
        'Escape closes the menu and returns focus');
});

// ── Cache/version pins ────────────────────────────────────────

test('the shell precaches the stylesheet version the page requests', () => {
    const pageV = (html.match(/href="style\.css\?v=([^"]+)"/) || [])[1];
    const swV = (sw.match(/'\.\/style\.css\?v=([^']+)'/) || [])[1];
    assert.ok(pageV, 'index.html must pin style.css with a ?v');
    assert.equal(pageV, swV, 'sw.js precache must match the page link');
    const shell = (sw.match(/const CACHE_NAME = '([^']+)'/) || [])[1];
    const vendor = (sw.match(/const VENDOR_CACHE_NAME = '([^']+)'/) || [])[1];
    assert.ok(shell && vendor, 'both cache names must exist');
    assert.equal(shell.slice(shell.lastIndexOf('-v')), vendor.slice(vendor.lastIndexOf('-v')),
        'shell and vendor caches share a generation suffix');
    assert.ok(sw.includes("'./devtools.js'"), 'devtools bundle is precached (bare, so the cache name busts it)');
});
