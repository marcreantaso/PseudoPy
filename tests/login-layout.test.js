/* ============================================================
   LOGIN LAYOUT GATE
   The auth screen must read as ONE continuous deep-navy canvas with a
   single elevated card, in both themes. These checks pin the structure
   that removed the old two-half seam and the floating, unstyled form.
   ============================================================ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const css = read('style.css');
const html = read('index.html');

// ── Token parsing (same shape as tests/contrast.test.js) ──────
function parseVars(block) {
    const vars = {};
    const re = /--([a-zA-Z0-9-]+):\s*([^;]+);/g;
    let m;
    while ((m = re.exec(block))) vars['--' + m[1].trim()] = m[2].trim();
    return vars;
}

function extractBlock(source, startIndex) {
    const start = source.indexOf('{', startIndex);
    let depth = 0;
    let i = start;
    for (; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) break; }
    }
    return { selector: source.slice(startIndex, start).trim(), body: source.slice(start + 1, i), end: i + 1 };
}

function extractAllBlocks(source, needle) {
    const out = [];
    let idx = source.indexOf(needle);
    while (idx !== -1) {
        const block = extractBlock(source, idx);
        if (/^\s*:root/.test(block.selector) || block.selector.includes(needle)) out.push(block);
        idx = source.indexOf(needle, block.end);
    }
    return out;
}

const L = Object.assign({}, ...extractAllBlocks(css, ':root').map((b) => parseVars(b.body)));
const D = Object.assign({}, ...extractAllBlocks(css, "[data-theme='dark']").map((b) => parseVars(b.body)));

// ── Contrast helpers ──────────────────────────────────────────
function hexToRgb(hex) {
    let h = hex.replace('#', '').trim();
    if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

function toRgb(value) {
    if (/^#/.test(value)) {
        const rgb = hexToRgb(value);
        return rgb ? { rgb, a: 1 } : null;
    }
    const m = value.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
    return { rgb: parts.slice(0, 3).map((c) => c / 255), a: parts.length > 3 ? parts[3] : 1 };
}

function lin(c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lum(rgb) { return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]); }
function contrast(rgbA, rgbB) {
    const a = lum(rgbA);
    const b = lum(rgbB);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
/** Composite a possibly-translucent foreground over an opaque backdrop. */
function over(fg, backdrop) {
    return fg.rgb.map((c, i) => c * fg.a + backdrop[i] * (1 - fg.a));
}

// ── Tokens ────────────────────────────────────────────────────
const AUTH_TOKENS = [
    '--auth-bg-start', '--auth-bg-end', '--auth-surface',
    '--auth-border', '--auth-text', '--auth-muted', '--auth-accent'
];

test('the auth token family is defined in both themes', () => {
    for (const key of AUTH_TOKENS) {
        assert.ok(L[key], `light theme missing ${key}`);
        assert.ok(D[key], `dark theme missing ${key}`);
    }
});

test('the auth canvas is the same deep navy in both themes', () => {
    assert.equal(L['--auth-bg-start'], D['--auth-bg-start'], 'canvas start must be theme-independent');
    assert.equal(L['--auth-bg-end'], D['--auth-bg-end'], 'canvas end must be theme-independent');
    // The canvas must actually be dark in light mode too, or the white card
    // would sit on a pale band and the seam would just move.
    assert.ok(lum(hexToRgb(L['--auth-bg-start'])) < 0.05, 'canvas start is not dark');
});

test('the elevated card is themed, not the hero', () => {
    assert.notEqual(L['--auth-surface'], D['--auth-surface'], 'card surface must change with the theme');
    assert.notEqual(L['--auth-text'], D['--auth-text'], 'card text must change with the theme');
});

// ── Login rules are token-driven ──────────────────────────────
const loginStart = css.indexOf('LOGIN PAGE — Split Layout');
const loginSection = css.slice(css.lastIndexOf('/*', loginStart), css.indexOf('/* ── Buttons ── */'));

test('login rules carry no hard-coded colours', () => {
    // A mask uses a colour purely as an alpha channel, so those lines are not
    // theme colours and are excluded.
    const paint = loginSection
        .split(/\r?\n/)
        .filter((line) => !/mask-image/.test(line))
        .join('\n');
    const hexes = [...paint.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    assert.deepEqual(hexes, [], 'hard-coded hex in login rules: ' + hexes.join(', '));
    const rgbas = [...paint.matchAll(/\brgba?\([^)]*\)/g)].map((m) => m[0]);
    assert.deepEqual(rgbas, [], 'hard-coded rgb()/rgba() in login rules: ' + rgbas.join(', '));
});

// ── One full-bleed canvas ─────────────────────────────────────
test('the auth page is one full-bleed canvas', () => {
    const rule = css.match(/\.login-page\s*\{[^{}]*\}/)[0];
    assert.match(rule, /min-height:\s*100dvh/, 'page must fill the viewport height');
    assert.match(rule, /background:\s*linear-gradient\(/);
    assert.match(rule, /var\(--auth-bg-start\)/, 'page background must use the canvas token');
    assert.doesNotMatch(rule, /overflow:\s*hidden/, 'page must not clip into two painted halves');

    // The canvas also has to sit on html/body so overscroll never flashes
    // the app background (--bg-primary) behind the login screen.
    assert.match(css, /html:has\(#login-page:not\(\.hidden\)\)/, 'html canvas missing');
    assert.match(css, /body:has\(#login-page:not\(\.hidden\)\)/, 'body canvas missing');
});

test('the old seam and page-level padding bands are gone', () => {
    assert.doesNotMatch(css, /\.login-form-section::before\s*\{[^}]*width:\s*1px/,
        'the 1px seam between the halves is still painted');
    const supports = css.slice(css.indexOf('@supports (padding: env(safe-area-inset-top))'));
    const beforeToast = supports.slice(0, supports.indexOf('.toast-container'));
    assert.doesNotMatch(beforeToast, /\.login-page\s*\{/,
        'the @supports block is padding .login-page again, which re-creates the band');
});

// ── Split proportions ─────────────────────────────────────────
test('desktop is 55/45 and 768-1023px narrows the hero', () => {
    const rule = css.match(/\.login-page\s*\{[^{}]*\}/)[0];
    assert.match(rule, /grid-template-columns:\s*55fr\s+45fr/);
    const tablet = css.slice(css.indexOf('@media (max-width: 1023px)'), css.indexOf('@media (max-width: 767.98px) {'));
    assert.match(tablet, /grid-template-columns:\s*45fr\s+55fr/,
        'the hero should be narrower than the form between 768 and 1023px');
    // The phone query must start strictly below 768px or a 768px tablet is
    // swallowed by the single-column layout and loses the two-column view.
    assert.ok(loginSection.includes('@media (max-width: 767.98px) {'),
        'the phone layout must begin below 768px');
    assert.doesNotMatch(loginSection, /@media \(max-width: 768px\)/,
        'a max-width:768px query swallows the 768px tablet breakpoint');
});

test('the form is an elevated card bounded to 400-440px', () => {
    const rule = css.match(/\.auth-card\s*\{[^{}]*\}/)[0];
    assert.match(rule, /background:\s*var\(--auth-surface\)/);
    assert.match(rule, /border:\s*1px solid var\(--auth-border\)/);
    assert.match(rule, /color:\s*var\(--auth-text\)/);
    assert.match(rule, /box-shadow:\s*var\(--auth-shadow\)/);
    const width = rule.match(/inline-size:\s*min\(100%,\s*(\d+)px\)/);
    assert.ok(width, 'card width must be a bounded px value');
    const px = Number(width[1]);
    assert.ok(px >= 400 && px <= 440, `card width ${px}px is outside 400-440px`);
});

// ── Form-control sizing ───────────────────────────────────────
test('login controls use the 44-48px input height and a focus-visible ring', () => {
    const rule = css.match(/\.login-page \.form-input\s*\{[^{}]*\}/)[0];
    const h = Number(rule.match(/min-height:\s*(\d+)px/)[1]);
    assert.ok(h >= 44 && h <= 48, `input min-height ${h}px is outside 44-48px`);
    assert.match(css, /\.login-page \.form-input:focus-visible\s*\{[^{}]*outline:/);
    assert.match(css, /\.auth-card \.btn-primary\s*\{[^{}]*min-height:\s*4[4-8]px/);
});

test('no auth text drops below 12px', () => {
    assert.match(css.match(/\.login-footer-text\s*\{[^{}]*\}/)[0], /font-size:\s*max\(12px/);
    assert.match(css.match(/#login-version\s*\{[^{}]*\}/)[0], /font-size:\s*max\(12px/);
    assert.match(css.match(/\.login-page \.form-group label\s*\{[^{}]*\}/)[0], /font-size:\s*max\(13px/);
    assert.match(css.match(/\.login-error\s*\{[^{}]*\}/)[0], /font-size:\s*max\(1[23]px/);
    // The decorative hero code card is still text, so it must clear 12px too.
    assert.match(css.match(/\.code-card-title\s*\{[^{}]*\}/)[0], /font-size:\s*max\(12px/);
    assert.match(css.match(/\.code-card-body\s*\{[^{}]*\}/)[0], /font-size:\s*max\(12px/);
});

// ── Decorative art stays out of the way ───────────────────────
test('hero art is low-opacity and masked clear of the copy', () => {
    const block = css.slice(css.indexOf('.hero-art {'), css.indexOf('.hero-art-svg'));
    const opacity = block.match(/opacity:\s*([\d.]+)/);
    assert.ok(opacity, 'hero art opacity missing');
    assert.ok(Number(opacity[1]) <= 0.4, `hero art opacity ${opacity[1]} is too strong`);
    assert.match(block, /mask-image:\s*radial-gradient\([^;]*transparent/,
        'the copy centre must be masked out of the decorative art');
});

// ── Phone layout ──────────────────────────────────────────────
test('phones get one column, a compact hero and a full-width card', () => {
    const mobile = css.slice(css.indexOf('@media (max-width: 767.98px) {'));
    assert.match(mobile, /\.login-page\s*\{[^{}]*flex-direction:\s*column/);
    assert.match(mobile, /\.hero-code-card\s*\{[^{}]*display:\s*none/, 'the code card should be dropped on phones');
    assert.match(mobile, /\.auth-card\s*\{[^{}]*inline-size:\s*100%/);
});

// ── Markup ────────────────────────────────────────────────────
test('both the sign-in form and recovery panel render as cards', () => {
    assert.match(html, /id="login-form-section-inner" class="auth-card"/);
    assert.match(html, /id="forgot-password-panel" class="auth-card hidden"/);
});

test('the inline error slot is announced and sits under the submit button', () => {
    assert.match(html, /id="login-error"[^>]*role="alert"[^>]*aria-live="polite"/);
    const form = html.slice(html.indexOf('<form id="login-form">'), html.indexOf('</form>'));
    assert.ok(form.indexOf('id="login-submit"') < form.indexOf('id="login-error"'),
        'the error slot must follow the button so a message cannot shift it');
});

// ── Contrast of the new tokens ────────────────────────────────
test('auth card text meets WCAG 2.2 AA in both themes', () => {
    const canvas = hexToRgb(D['--auth-bg-end']);
    const lightSurface = toRgb(L['--auth-surface']).rgb;
    const darkSurface = over(toRgb(D['--auth-surface']), canvas);

    const pairs = [
        ['light text', toRgb(L['--auth-text']).rgb, lightSurface],
        ['light muted', toRgb(L['--auth-muted']).rgb, lightSurface],
        ['light accent', toRgb(L['--auth-accent']).rgb, lightSurface],
        ['dark text', toRgb(D['--auth-text']).rgb, darkSurface],
        ['dark muted', toRgb(D['--auth-muted']).rgb, darkSurface],
        ['dark accent', toRgb(D['--auth-accent']).rgb, darkSurface],
    ];

    const failures = [];
    for (const [label, fg, bg] of pairs) {
        const r = contrast(fg, bg);
        if (r < 4.5) failures.push(`${label}: ${r.toFixed(2)} (need 4.5)`);
    }
    assert.deepEqual(failures, [], failures.join('\n'));
});
