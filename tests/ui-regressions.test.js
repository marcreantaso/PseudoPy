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