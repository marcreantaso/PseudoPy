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