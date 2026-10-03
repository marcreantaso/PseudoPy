const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const css = read('style.css');
const html = read('index.html');

/** Every `transition:`/`animation:` declaration body in a stylesheet. */
function motionDeclarations(source) {
    const out = [];
    source.split(/\r?\n/).forEach((line, i) => {
        for (const prop of ['transition', 'animation']) {
            const m = line.match(new RegExp(`(?:^|[;{])\\s*${prop}:\\s*([^;]+);`));
            if (m) out.push({ prop, value: m[1], line: i + 1, text: line.trim() });
        }
    });
    return out;
}

/** Duration tokens in seconds -> ms. */
function durations(value) {
    return [...value.matchAll(/([\d.]+)(ms|s)\b/g)]
        .map(m => parseFloat(m[1]) * (m[2] === 's' ? 1000 : 1));
}

// ── Motion budget ──────────────────────────────────────────────

test('no transition exceeds the 500ms budget', () => {
    const offenders = motionDeclarations(css)
        .filter(d => d.prop === 'transition')
        .flatMap(d => durations(d.value)
            .filter(ms => ms > 500)
            .map(ms => `style.css:${d.line} ${ms}ms -> ${d.text}`));
    assert.deepEqual(offenders, [], 'transitions over budget: ' + offenders.join('; '));
});

test('no transition animates every property with `all`', () => {
    // `transition: all` silently animates layout properties (width, height, top,
    // margin) and any property added later, which is the main source of jank.
    const all = css.split(/\r?\n/)
        .map((l, i) => ({ l, i: i + 1 }))
        .filter(x => /transition:\s*all\b/.test(x.l));
    assert.deepEqual(all.map(x => `style.css:${x.i} ${x.l.trim()}`), [],
        'use an explicit property list so layout properties are not animated by accident');
});

test('ambient loop animations honour reduced motion', () => {
    // The global clamp sets animation-duration to .01ms, but an `infinite`
    // iteration count would keep those animations repainting forever.
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    assert.match(reduced, /animation-iteration-count:\s*1\s*!important/,
        'infinite animations are never stopped, so reduced motion does not reduce CPU work');
    assert.match(reduced, /\.hero-shape[\s\S]{0,80}animation:\s*none\s*!important/,
        'the decorative hero shapes keep floating under reduced motion');
});

test('the motion clamp is generic enough to cover animations added later', () => {
    const blocks = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g) || [];
    const universal = blocks.find(b => /\*::before/.test(b) && /transition-duration/.test(b));
    assert.ok(universal, 'no global reduced-motion clamp');
    assert.match(universal, /transition-duration/);
    assert.match(universal, /animation-duration/);
});

// ── Hero art layer ─────────────────────────────────────────────

test('hero art is native CSS/SVG with no image request', () => {
    assert.match(html, /class="hero-art"/, 'the hero art layer is missing');
    assert.match(html, /<svg class="hero-art-svg"[\s\S]*?<\/svg>/, 'hero art is not inline SVG');

    const layer = html.slice(html.indexOf('class="hero-art"'), html.indexOf('</svg>'));
    assert.doesNotMatch(layer, /<img|url\(/i,
        'hero art must be inline SVG/CSS, not a fetched asset');
});

test('hero art is decorative and cannot intercept clicks', () => {
    assert.match(html, /class="hero-art" aria-hidden="true"/,
        'decorative SVG must be hidden from assistive tech');
    const block = css.slice(css.indexOf('.hero-art {'));
    assert.match(block.slice(0, 200), /pointer-events:\s*none/);
});

test('hero art sits before the blurred shapes so the blur does not smear it', () => {
    const art = html.indexOf('class="hero-art"');
    const shapes = html.indexOf('class="hero-bg-shapes"');
    const content = html.indexOf('class="hero-content"');
    assert.ok(art > -1 && shapes > -1, 'missing hero layers');
    assert.ok(art < shapes,
        'hero art must precede .hero-bg-shapes; those shapes use filter: blur(80px)');
    assert.ok(shapes < content, 'the blurred shapes must stay behind .hero-content');

    // The shapes really are blurred, which is why the order matters.
    assert.match(css, /\.hero-shape \{[\s\S]{0,160}?filter:\s*blur\(/);
});

test('hero art is painted behind the content and cannot cover the login form', () => {
    // .hero-content is position:relative with z-index:1, and neither decorative
    // layer claims a higher stacking context, so both stay behind the copy.
    assert.match(css, /\.hero-content \{[\s\S]{0,120}?z-index:\s*1;/);
    assert.doesNotMatch(css.slice(css.indexOf('.hero-art {'), css.indexOf('.hero-art-svg')),
        /z-index/,
        'the art layer must not raise itself above the hero copy');
});

// ── Login help removal ─────────────────────────────────────────

test('the login credentials hint and its handlers are gone', () => {
    // The removed hint let anyone click a real instructor/student username to
    // have it typed into the login form. Scope this to the login card: the
    // forgot-password modal legitimately shows the same names as *placeholder*
    // format examples, and the instructor manager displays its own handle.
    // Scope to the login card itself: it ends where the forgot-password panel
    // begins, and that panel legitimately shows the same names as *placeholder*
    // format examples rather than clickable autofills.
    const start = html.indexOf('id="login-form-section-inner"');
    const end = html.indexOf('forgot-password-panel', start);
    const card = html.slice(start, end);
    assert.doesNotMatch(card, /mreantaso_instructor|mdaet_student/,
        'the login card still exposes real usernames');
    assert.doesNotMatch(card, /login-hint|fillLoginUser|toggleLoginHint/);
    assert.doesNotMatch(read('src/app/authentication.js'), /function fillLoginUser|function toggleLoginHint/);
});

test('the hint CSS was removed rather than left dead', () => {
    for (const sel of ['.login-hint-box', '.login-hint-header', '.hint-username', '.hint-badge', 'hintFadeIn']) {
        assert.doesNotMatch(css, new RegExp(sel.replace('.', '\\.')),
            `dead CSS for ${sel} remains`);
    }
});

test('the login form section survived the removal intact', () => {
    const inner = html.indexOf('id="login-form-section-inner"');
    assert.ok(inner > -1, '#login-form-section-inner was removed');
    // The header and the form must both still be inside the inner wrapper.
    const tail = html.slice(inner);
    const header = tail.indexOf('login-card-header');
    const form = tail.indexOf('id="login-form"');
    assert.ok(header > -1 && header < form, 'the card header must precede the form');
    assert.match(html, /<form id="login-form">[\s\S]*id="login-username"[\s\S]*id="login-password"/);
});

test('the login form still submits and keeps its autofill hints', () => {
    assert.match(html, /id="login-username"[^>]*autocomplete="username"/);
    assert.match(html, /id="login-password"[^>]*autocomplete="current-password"/);
    assert.match(html, /id="login-submit"/);
});