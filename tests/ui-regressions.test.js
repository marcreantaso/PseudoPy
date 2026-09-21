const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

function read(rel) {
    return fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r/g, '');
}

test('device action cell reserves a non-clipping nowrap action column', () => {
    const css = read('style.css');
    const src = read('src/app/users.js');
    assert.match(src, /class="device-action-cell"/);
    assert.match(src, /data-device-action-label/);
    assert.match(src, /\$\{d\.status === 'revoked' \? 'Approve Again' : 'Approve'\}/);
    assert.match(css, /td\.device-action-cell/);
    assert.match(css, /\.device-action-group/);
    assert.match(css, /\.btn\.is-loading-text/);
});

test('device busy state swaps the button label to a progress verb', () => {
    const src = read('src/app/users.js');
    assert.match(src, /approveDevice/);
    assert.match(src, /is-loading-text/);
    assert.match(src, /aria-busy/);
});

test('no user-list renderer keeps initial-letter avatars', () => {
    const files = ['src/app/users.js', 'src/app/admin-security.js', 'src/app/instructor-recovery.js', 'src/app/password-history.js', 'src/app/analytics.js'];
    for (const file of files) {
        const src = read(file);
        assert.ok(!src.includes('avatar-sm">${'), `${file}: stale initial-letter avatar`);
        assert.ok(!src.includes('an-avatar-sm">${'), `${file}: stale analytics avatar`);
        assert.ok(!src.includes('background:hsl('), `${file}: stale hsl avatar background`);
    }
});

test('student list uses the monochrome UserRound avatar token', () => {
    const src = read('src/app/users.js');
    assert.ok(src.includes('avatar-sm">{{ui:UserRound}}'), 'expected UserRound tokens in list rows');
});

test('body no longer masks horizontal overflow with overflow-x:hidden', () => {
    const css = read('style.css');
    const bodyRule = css.match(/^body\s*\{[^{}]*\}/m);
    assert.ok(bodyRule, 'body rule missing');
    assert.ok(!/overflow-x/.test(bodyRule[0]), 'body still hides overflow-x');
    assert.match(css, /min-height:\s*100dvh/);
});

test('app shell uses dvh and resolves 100vw width traps', () => {
    const css = read('style.css');
    assert.match(css, /\.app-layout\s*\{[\s\S]*?height:\s*100vh;[\s\S]*?height:\s*100dvh;/);
    assert.match(css, /\.login-page\s*\{[\s\S]*?min-height:\s*100dvh;/);
    assert.ok(!/[^-]width:\s*100vw;/m.test(css), '100vw width causes horizontal overflow with a scrollbar');
});

test('main landmark replaces the main-content div', () => {
    const html = read('index.html');
    assert.match(html, /<main class="main-content" id="main-content">/);
    assert.match(html, /<\/main><!-- \/main-content -->/);
});

test('icon-only buttons carry accessible names', () => {
    const html = read('index.html');
    const iconOnly = html.match(/<button\b[^>]*>\s*(?:<i data-lucide="[^"]+" aria-hidden="true"><\/i>)?\{\{ui:X\}\}/g) || [];
    for (const btn of iconOnly) {
        assert.match(btn, /aria-label=/, `missing aria-label on: ${btn}`);
    }
    assert.match(html, /id="pwa-dismiss-btn"[^>]*aria-label="Dismiss update notification"/);
    assert.match(html, /onclick="togglePasswordVisibility\('inst-password'[^\n]*aria-label="Show password"/);
});

test('login footer text uses a contrast-safe secondary color', () => {
    const css = read('style.css');
    assert.match(css, /\.login-footer-text\s*\{[\s\S]*?color:\s*var\(--text-secondary\);/);
});

test('mobile touch targets meet the 44px guideline', () => {
    const css = read('style.css');
    assert.match(css, /min-height:\s*44px;/);
});

test('physical robots.txt exists so Vercel rewrites do not hijack it', () => {
    const robots = read('robots.txt');
    assert.match(robots, /User-agent:\s*\*/);
    assert.match(robots, /Allow:\s*\/\s*$/m);
});

test('head has no render-blocking CDN scripts', () => {
    const html = read('index.html');
    const head = html.match(/<head>[\s\S]*<\/head>/)[0];
    assert.ok(!head.includes('<script src="http'), 'render-blocking external script in head');
    assert.match(head, /rel="preconnect" href="https:\/\/fonts.googleapis.com"/);
    assert.match(head, /rel="dns-prefetch" href="https:\/\/cdn\.jsdelivr\.net"/);
});

test('heavy libraries are loaded on demand, not at page load', () => {
    const html = read('index.html');
    assert.ok(!html.includes('skulpt.min.js'), 'skulpt still statically loaded');
    assert.ok(!html.includes('pdf.min.js'), 'pdf.js still statically loaded');
    assert.ok(!html.includes('anime.umd'), 'anime still statically loaded');
    assert.match(html, /initLucideOnDemand/, 'lucide lazy-init missing');
    assert.match(html, /on-demand\.js/, 'on-demand loader comment missing');

    const app = read('app.js');
    assert.match(app, /function loadScripts/, 'loadScripts missing from bundle');
    assert.match(app, /CDN_BASE_URLS/, 'CDN_BASE_URLS missing from bundle');
    assert.match(app, /Loading Python runtime\.\.\./, 'skulpt lazy-load branch missing');
});

test('service worker no longer pre-caches lazy libraries', () => {
    const sw = read('sw.js');
    assert.ok(!sw.includes('skulpt.'), 'sw still pre-caches skulpt');
    assert.ok(!sw.includes('pdf.min.js'), 'sw still pre-caches pdf.js');
    assert.ok(sw.includes('./robots.txt'), 'sw does not cache robots.txt');
});