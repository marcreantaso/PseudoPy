const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

function extractFunction(src, fnName) {
    const re = new RegExp('(async )?function ' + fnName + '\\(');
    const start = src.search(re);
    if (start < 0) return null;
    const open = src.indexOf('{', start);
    if (open < 0) return null;
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
    }
    return null;
}

function loadLoginModule() {
    const form = { dataset: {}, listeners: {} };
    form.addEventListener = (type, fn) => { form.listeners[type] = fn; };
    const toasts = [];
    const context = vm.createContext({
        console: { log() {}, warn() {}, info() {}, error() {} },
        getValue: () => '',
        setValue() {},
        $qs: () => null,
        $qsa: () => [],
        $id: id => (id === 'login-form' ? form : null),
        showToast: message => toasts.push(message),
        refreshUsers: async () => {},
        normalizeUsername: u => u,
        cachedUsers: []
    });
    vm.runInContext(read('src/app/authentication.js'), context);
    return { context, form, toasts };
}

test('login form wraps only username, password and the submit button', () => {
    const html = read('index.html');
    const formStart = html.indexOf('<form id="login-form">');
    assert.ok(formStart >= 0, 'missing <form id="login-form">');
    const formEnd = html.indexOf('</form>', formStart);
    const form = html.slice(formStart, formEnd);
    assert.ok(form.includes('id="login-username"'), 'username input outside the form');
    assert.ok(form.includes('id="login-password"'), 'password input outside the form');
    assert.ok(form.includes('id="login-submit"'), 'submit button outside the form');
    const inner = form.slice('<form id="login-form">'.length);
    assert.ok(!/<form/i.test(inner), 'nested form inside the login form');
    assert.ok(html.indexOf('id="forgot-password-panel"') > formEnd, 'forgot-password panel conflicts with the form');
});

test('no inline Enter or click hooks remain on the login inputs and button', () => {
    const html = read('index.html');
    const username = html.match(/<input[^>]*id="login-username"[^>]*>/)[0];
    const password = html.match(/<input[^>]*id="login-password"[^>]*>/)[0];
    const submit = html.match(/<button[^>]*id="login-submit"[^>]*>/)[0];
    assert.ok(!/onkeypress/i.test(username), 'username still has an inline Enter handler');
    assert.ok(!/onkeypress/i.test(password), 'password still has an inline Enter handler');
    assert.ok(!/onclick\s*=\s*["']handleLogin/i.test(submit), 'submit button still calls handleLogin inline');
});

test('login inputs carry autocomplete and mobile-keyboard hints', () => {
    const html = read('index.html');
    const username = html.match(/<input[^>]*id="login-username"[^>]*>/)[0];
    const password = html.match(/<input[^>]*id="login-password"[^>]*>/)[0];
    assert.match(username, /autocomplete="username"/);
    assert.match(username, /autocapitalize="none"/);
    assert.match(username, /spellcheck="false"/);
    assert.match(username, /enterkeyhint="next"/);
    assert.match(password, /autocomplete="current-password"/);
    assert.match(password, /enterkeyhint="go"/);
});

test('submit and helper controls use correct button types with associated labels', () => {
    const html = read('index.html');
    const submit = html.match(/<button[^>]*id="login-submit"[^>]*>/)[0];
    assert.match(submit, /type="submit"/, 'Sign In is not a submit button');
    assert.match(html, /<label for="login-username">Username<\/label>/);
    assert.match(html, /<label for="login-password">Password<\/label>/);
    assert.match(html, /<button type="button" class="btn btn-ghost btn-icon"/, 'password eye is not type=button');
    assert.match(html, /<button type="button" class="btn btn-ghost btn-sm" onclick="showForgotPassword\(\)"/, 'Forgot your password? is not type=button');
    assert.match(html, /type="button" onclick="showLegalPage\('privacy'\)"/, 'Privacy link is not type=button');
    assert.match(html, /type="button" onclick="showLegalPage\('terms'\)"/, 'Terms link is not type=button');
    assert.match(html, /type="button" onclick="showLegalPage\('about'\)"/, 'About link is not type=button');
});

test('authentication.js supplies the single guarded submit binding', () => {
    const src = read('src/app/authentication.js');
    const setup = extractFunction(src, 'setupLoginForm');
    assert.ok(setup, 'setupLoginForm missing');
    assert.match(setup, /form\.dataset\.bound === 'true'/, 'bound-once guard missing');
    assert.match(setup, /preventDefault/, 'native submit is not prevented');
    assert.match(setup, /if \(loginInProgress\) return;/, 'submit does not respect the in-flight guard');
    assert.equal(src.indexOf("addEventListener('submit'"), src.lastIndexOf("addEventListener('submit'"), 'more than one submit binding');
});

test('handleLogin guards concurrent attempts, restores busy state and focuses the empty field', () => {
    const src = read('src/app/authentication.js');
    const fn = extractFunction(src, 'handleLogin');
    assert.ok(fn, 'handleLogin missing');
    assert.match(fn, /if \(loginInProgress\) return;/, 'no re-entry guard');
    assert.match(fn, /loginInProgress = true;/, 'attempt not marked in-flight');
    assert.match(fn, /'Please enter your username and password\.'/, 'validation message changed');
    assert.match(fn, /focus/, 'missing empty-field focus behavior');
    assert.match(fn, /finally\s*\{[\s\S]*?resetLoginBusy\(submitBtn\);[\s\S]*?\}/, 'busy state not restored on every exit');
});

test('app boot wires the login form', () => {
    const src = read('src/app/initialization.js');
    assert.match(src, /setupLoginForm\(\)/, 'init() does not call setupLoginForm()');
});

test('mobile login page keeps a single scroll owner with touch-safe sizing', () => {
    const css = read('style.css');
    const mobile = css.slice(css.indexOf('@media (max-width: 768px) {'));
    const loginPageRule = mobile.match(/\.login-page\s*\{[^{}]*\}/)[0];
    assert.match(loginPageRule, /overflow:\s*visible;/, 'login-page is still an internal scroll container');
    assert.doesNotMatch(loginPageRule, /overflow-y/, 'login-page still owns vertical scroll on mobile');
    assert.match(loginPageRule, /min-height:\s*100svh;/, 'missing 100svh fallback for the keyboard');
    assert.match(mobile.match(/\.login-form-section\s*\{[^{}]*\}/)[0], /env\(safe-area-inset-bottom/, 'form section lacks safe-area bottom padding');
    const coarse = css.slice(css.indexOf('@media (hover: none) and (pointer: coarse)'));
    assert.match(coarse, /\.login-page \.form-input\s*\{[^{}]*font-size:\s*16px;/, 'login inputs still trigger iOS focus-zoom below 16px');
    assert.match(coarse, /\.login-page \.btn\s*\{[^{}]*min-height:\s*44px;/, 'login buttons lack 44px touch targets');
});

test('setupLoginForm binds once and submit does not fire while an attempt is in flight', () => {
    const { context, form } = loadLoginModule();
    context.setupLoginForm();
    context.setupLoginForm();
    assert.equal(Object.keys(form.listeners).filter(k => k === 'submit').length, 1, 'form bound more than once');
    assert.equal(form.dataset.bound, 'true', 'bound marker not set');

    let loginCalls = 0;
    let prevented = 0;
    context.handleLogin = () => { loginCalls++; };
    form.listeners.submit({ preventDefault() { prevented++; } });
    assert.equal(prevented, 1, 'native submit not prevented');
    assert.equal(loginCalls, 1, 'submit did not invoke handleLogin');

    context.loginInProgress = true;
    form.listeners.submit({ preventDefault() { prevented++; } });
    assert.equal(loginCalls, 1, 'submit fired while an attempt was already in flight');
});

test('handleLogin coalesces duplicate attempts and releases the lock afterwards', async () => {
    const { context } = loadLoginModule();
    let attempts = 0;
    let release;
    const gate = new Promise(r => { release = r; });
    context.refreshUsers = async () => { attempts++; await gate; };
    context.getValue = id => (id === 'login-username' ? 'Admin' : 'pass123');
    context.cachedUsers = [];

    const first = context.handleLogin();
    const second = context.handleLogin();
    await Promise.resolve();
    assert.equal(attempts, 1, 'a duplicate attempt started while the first was in flight');

    release();
    await Promise.all([first, second]);
    assert.equal(context.loginInProgress, false, 'login lock was not released');

    release();
    const third = context.handleLogin();
    await Promise.resolve();
    assert.equal(attempts, 2, 'lock was never released for the next attempt');
    await third;
});

test('empty login submit keeps the validation message and focuses the missing field', async () => {
    for (const [username, password, expectedFocus] of [['', '', 'login-username'], ['Admin', '', 'login-password']]) {
        const { context, toasts } = loadLoginModule();
        const focused = [];
        context.getValue = id => (id === 'login-username' ? username : password);
        context.$id = id => {
            if (id === 'login-username' || id === 'login-password') return { focus() { focused.push(id); } };
            return null;
        };
        await context.handleLogin();
        assert.deepEqual(toasts, ['Please enter your username and password.'], 'validation message changed or duplicated');
        assert.deepEqual(focused, [expectedFocus], `empty ${expectedFocus === 'login-username' ? 'username' : 'password'} not focused`);
        assert.equal(context.loginInProgress, false, 'lock leaked on the validation path');
    }
});