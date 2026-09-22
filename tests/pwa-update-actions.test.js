const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../pwa-updates.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
function events(base = {}) {
    const listeners = new Map();
    return Object.assign(base, {
        addEventListener(type, fn) { const list = listeners.get(type) || []; list.push(fn); listeners.set(type, list); },
        emit(type) { for (const fn of listeners.get(type) || []) fn(); }
    });
}
function harness({ waiting = true, controller = true, dismissed = false, registerPending = false } = {}) {
    const nodes = new Map();
    for (const id of ['pwa-update-banner', 'pwa-update-btn', 'pwa-later-btn', 'pwa-update-msg']) {
        const classes = new Set();
        nodes.set(id, events({ hidden: true, disabled: false, textContent: '', attributes: {},
            classList: { toggle: (name, value) => value ? classes.add(name) : classes.delete(name), contains: name => classes.has(name) },
            setAttribute(name, value) { this.attributes[name] = value; },
            querySelector() { return this.label ||= { textContent: 'Update Now' }; }
        }));
    }
    const sent = [];
    const worker = { postMessage(message) { sent.push(message); } };
    const reg = events({ waiting: waiting ? worker : null, installing: null, update: async () => {} });
    const sw = events({ controller: controller ? {} : null,
        register: async () => registerPending ? new Promise(() => {}) : reg,
        getRegistration: async () => reg });
    const stored = new Map(dismissed ? [['pseudopy_update_dismissed', '1']] : []);
    const timers = new Map();
    let reloads = 0, saves = 0, timerId = 0;
    const window = events({ location: { reload() { reloads++; } }, maybeSaveEditorDraft() { saves++; } });
    vm.runInNewContext(source, { window, navigator: { serviceWorker: sw }, location: { hostname: 'pseudopy.test' },
        document: { readyState: 'complete', getElementById: id => nodes.get(id) }, console,
        sessionStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) },
        setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } });
    return { window, reg, sw, worker, nodes, sent, stored, timers, reloads: () => reloads, saves: () => saves };
}

test('no waiting worker means no visible update banner or first-install reload', async () => {
    const h = harness({ waiting: false, controller: false }); await flush();
    assert.equal(h.nodes.get('pwa-update-banner').hidden, true);
    h.sw.emit('controllerchange');
    assert.equal(h.reloads(), 0);
});

test('Later actually hides the banner and keeps it dismissed on focus and reload', async () => {
    const h = harness(); await flush();
    assert.equal(h.nodes.get('pwa-update-banner').hidden, false);
    h.nodes.get('pwa-later-btn').emit('click');
    assert.equal(h.nodes.get('pwa-update-banner').hidden, true);
    assert.equal(h.sent.length, 0);
    h.window.emit('focus'); await flush();
    assert.equal(h.nodes.get('pwa-update-banner').hidden, true);
    assert.equal(h.stored.get('pseudopy_update_dismissed'), '1');
    const next = harness({ dismissed: true }); await flush();
    assert.equal(next.nodes.get('pwa-update-banner').hidden, true);
});

test('Update Now saves the draft, activates the waiting worker once and reloads once', async () => {
    const h = harness(); await flush();
    h.nodes.get('pwa-update-btn').emit('click');
    h.nodes.get('pwa-update-btn').emit('click');
    assert.equal(h.saves(), 1);
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0].type, 'SKIP_WAITING');
    assert.equal(h.nodes.get('pwa-update-btn').disabled, true);
    assert.equal(h.nodes.get('pwa-later-btn').disabled, true);
    h.sw.emit('controllerchange'); h.sw.emit('controllerchange');
    assert.equal(h.reloads(), 1);
    assert.equal(h.timers.size, 0);
});

test('activation failure resets both buttons and supports retry or Later', async () => {
    const h = harness(); await flush();
    h.worker.postMessage = () => { throw new Error('worker gone'); };
    await h.window.applyPWAUpdate();
    assert.equal(h.nodes.get('pwa-update-btn').disabled, false);
    assert.equal(h.nodes.get('pwa-later-btn').disabled, false);
    assert.equal(h.timers.size, 0);
    assert.match(h.nodes.get('pwa-update-btn').label.textContent, /Try/);
    h.window.dismissPWAUpdate();
    assert.equal(h.nodes.get('pwa-update-banner').hidden, true);
});

test('hung registration lookup times out instead of leaving a dead button', async () => {
    const h = harness({ registerPending: true });
    h.sw.getRegistration = () => new Promise(() => {});
    h.window.applyPWAUpdate();
    assert.equal(h.timers.size, 1);
    [...h.timers.values()][0]();
    assert.equal(h.nodes.get('pwa-update-btn').disabled, false);
    assert.equal(h.nodes.get('pwa-later-btn').disabled, false);
});

test('a stale banner hides without reloading when the worker is no longer waiting', async () => {
    const h = harness(); await flush(); h.reg.waiting = null;
    await h.window.applyPWAUpdate();
    assert.equal(h.nodes.get('pwa-update-banner').hidden, true);
    assert.equal(h.nodes.get('pwa-update-btn').disabled, false);
    assert.equal(h.reloads(), 0);
    assert.equal(h.timers.size, 0);
});

test('a controller change from another tab does not reload an unsaved page', async () => {
    const h = harness(); await flush(); h.sw.emit('controllerchange');
    assert.equal(h.reloads(), 0);
});
