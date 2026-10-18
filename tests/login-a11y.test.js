/* ============================================================
   LOGIN ACCESSIBILITY GATE
   The sign-in form must expose real, labelled controls with an
   announced password toggle and no reliance on raw backend text.
   ============================================================ */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const html = read('index.html');
const form = html.slice(html.indexOf('<form id="login-form">'), html.indexOf('</form>'));

test('the password eye is a real button with a static pressed state', () => {
    const btn = form.match(/<button type="button" class="btn btn-ghost btn-icon"[\s\S]*?<\/button>/);
    assert.ok(btn, 'password toggle is not a button');
    assert.match(btn[0], /aria-label="Show password"/, 'toggle has no accessible name');
    assert.match(btn[0], /aria-pressed="false"/, 'toggle must expose its pressed state');
});

test('login labels are tied to their inputs', () => {
    assert.match(html, /<label for="login-username">Username<\/label>/);
    assert.match(html, /<label for="login-password">Password<\/label>/);
    assert.match(html, /<input[^>]*id="login-username"[^>]*autocomplete="username"/);
    assert.match(html, /<input[^>]*id="login-password"[^>]*autocomplete="current-password"/);
});

test('the toggle is layered in CSS, not by brittle inline styles', () => {
    assert.match(html, /class="login-password-field"/, 'password field wrapper missing');
    const toggle = form.match(/<button type="button" class="btn btn-ghost btn-icon"[\s\S]*?<\/button>/)[0];
    assert.doesNotMatch(toggle, /style=/, 'toggle still carries inline styles');
    assert.doesNotMatch(form, /style="position:\s*relative/, 'password field still uses inline layout');
});

test('every login button is a real button element', () => {
    const buttons = form.match(/<button[^>]*>/g) || [];
    assert.ok(buttons.length >= 1, 'no buttons found in the login form');
    for (const b of buttons) {
        assert.match(b, /type="(button|submit)"/, `button without an explicit type: ${b}`);
    }
});

test('the inline error region is a live region and never raw backend text', () => {
    const slot = html.match(/<div id="login-error"[^>]*>/);
    assert.ok(slot, 'missing #login-error slot');
    assert.match(slot[0], /role="alert"/);
    assert.match(slot[0], /aria-live="polite"/);
    // The slot ships empty; login failures are still surfaced through toasts.
    assert.match(html, /id="login-error"[^>]*><\/div>/, 'error slot must be empty at rest');
});

test('toggling the password flips type, label and aria-pressed together', () => {
    const attrs = {};
    const input = { type: 'password' };
    const iconAttrs = {};
    const btn = {
        setAttribute: (k, v) => { attrs[k] = v; },
        getAttribute: (k) => attrs[k],
        querySelector: () => ({ setAttribute: (k, v) => { iconAttrs[k] = v; } })
    };
    const ctx = vm.createContext({
        $id: (id) => (id === 'login-password' ? input : null),
        refreshIcons: () => {}
    });
    vm.runInContext(read('src/app/a11y.js'), ctx);

    ctx.togglePasswordVisibility('login-password', btn);
    assert.equal(input.type, 'text', 'password was not revealed');
    assert.equal(attrs['aria-label'], 'Hide password');
    assert.equal(attrs['aria-pressed'], 'true');

    ctx.togglePasswordVisibility('login-password', btn);
    assert.equal(input.type, 'password', 'password was not hidden again');
    assert.equal(attrs['aria-label'], 'Show password');
    assert.equal(attrs['aria-pressed'], 'false');
});

test('the toggle stays bound to the shared helper everywhere', () => {
    assert.equal((html.match(/togglePasswordVisibility\(/g) || []).length, 10,
        'a password field lost its visibility toggle');
});
