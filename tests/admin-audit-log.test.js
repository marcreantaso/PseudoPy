/* ============================================================
   ADMIN SECURITY AUDIT LOG
   Guards the friendly-label registry, the table rendering (no raw
   codes, escaped dynamic strings, no bare "-"), the clear-history
   flow, and the static geometry that keeps mobile rows inside the
   viewport. Uses the fake-DOM harness style of sync-notice.test.js.
   ============================================================ */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const adminSrc = read('src/app/admin-security.js');
const indexHtml = read('index.html');
const css = read('style.css');

/* ── Fake DOM harness ───────────────────────────────────────── */

const ELEMENT_IDS = [
    'password-requests-body', 'audit-category-chips', 'audit-pagination',
    'audit-count-label', 'audit-detail-body', 'audit-detail-drawer',
    'audit-clear-modal', 'audit-clear-summary', 'audit-clear-confirm-input',
    'audit-clear-confirm-btn', 'audit-clear-history-btn', 'audit-export-csv-btn',
    'audit-search', 'audit-date-from', 'audit-date-to'
];

function makeAuditHarness(overrides = {}) {
    const elements = {};
    for (const id of ELEMENT_IDS) {
        elements[id] = {
            id,
            innerHTML: '',
            textContent: '',
            value: '',
            disabled: false,
            hidden: id.endsWith('drawer') || id.endsWith('modal'),
            dataset: {},
            classList: {
                _set: new Set(),
                add(c) { this._set.add(c); },
                remove(c) { this._set.delete(c); },
                contains(c) { return this._set.has(c); }
            },
            addEventListener() {},
            setAttribute() {},
            getAttribute() { return null; }
        };
    }
    elements['audit-clear-confirm-btn'].disabled = true;

    const calls = { clear: 0, auditWrites: [], toasts: [], subscriptions: 0 };
    const ctx = vm.createContext({
        console,
        currentUser: { _docId: 'admin1', id: 'admin1', fullName: 'Ada Admin' },
        currentPage: 'password-requests',
        auditLogRef: 'auditLog',
        passwordRequestsRef: 'passwordRequests',
        $id: (id) => elements[id] || null,
        setText: (id, v) => { if (elements[id]) elements[id].textContent = v; },
        setHtml: (id, v) => { if (elements[id]) elements[id].innerHTML = v; },
        show: (id) => { if (elements[id]) elements[id].hidden = false; },
        hide: (id) => { if (elements[id]) elements[id].hidden = true; },
        showToast: (message, type) => calls.toasts.push({ message, type }),
        // Mirrors the DOM textContent -> innerHTML escaping for &, < and >.
        escapeHtml: (value) => String(value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
        copyText: () => {},
        refreshAuditLog: async () => (overrides.records || []),
        dbGetAll: async () => [],
        dbClearCollection: async () => { calls.clear += 1; },
        logAuditAction: async (entry) => { calls.auditWrites.push(entry); },
        subscribeCollection: () => { calls.subscriptions += 1; return () => {}; },
        appIsDevelopment: () => false,
        Blob: function Blob() {},
        URL: { createObjectURL: () => 'blob:audit', revokeObjectURL() {} },
        setTimeout: () => 0,
        clearTimeout: () => {},
        document: {
            readyState: 'complete',
            addEventListener() {},
            querySelectorAll: () => [],
            createElement: () => ({ click() {}, style: {}, appendChild() {}, removeChild() {} }),
            body: { appendChild() {}, removeChild() {} }
        }
    });
    vm.runInContext(read('src/app/audit-actions.js'), ctx);
    vm.runInContext(adminSrc, ctx);
    // Keep the clear-history test focused: rendering the page after a wipe is
    // covered by the render tests, not here.
    vm.runInContext('loadPasswordRequests = async function () {};', ctx);
    return { ctx, elements, calls };
}

function withRecords(h, records) {
    vm.runInContext(
        'auditLogAllRecords = ' + JSON.stringify(records) + '; auditLogPage = 1; auditLogCategory = ""; renderAuditLogTable();',
        h.ctx
    );
    return h.elements['password-requests-body'].innerHTML;
}

function evaluate(ctx, expression) {
    return vm.runInContext(expression, ctx);
}

function rec(overrides = {}) {
    return Object.assign({
        _docId: 'al_base',
        action: 'password_changed',
        studentName: 'Test Student',
        actorName: 'Test Student',
        instructorName: null,
        username: 'tstudent',
        timestamp: '2026-05-01T10:00:00.000Z'
    }, overrides);
}

/* ── Registry: formatAuditAction ────────────────────────────── */

test('formatAuditAction maps known codes to friendly metadata', () => {
    const h = makeAuditHarness();
    const changed = evaluate(h.ctx, 'formatAuditAction("password_changed")');
    assert.equal(changed.known, true);
    assert.equal(changed.label, 'Password changed');
    assert.equal(changed.category, 'security');
    assert.match(changed.icon, /\{\{ui:[A-Za-z]+\}\}/);
    assert.match(changed.badgeClass, /audit-badge--/);
});

test('formatAuditAction covers student.soft-delete with a friendly label', () => {
    const h = makeAuditHarness();
    const meta = evaluate(h.ctx, 'formatAuditAction("student.soft-delete")');
    assert.equal(meta.known, true);
    assert.equal(meta.label, 'Student account removed');
    assert.equal(meta.category, 'account');
    assert.equal(meta.severity, 'warning');
    assert.notEqual(meta.label, 'student.soft-delete');
});

test('formatAuditAction humanizes unknown codes instead of showing the raw code', () => {
    const h = makeAuditHarness();
    const meta = evaluate(h.ctx, 'formatAuditAction("foo_bar.baz-qux")');
    assert.equal(meta.known, false);
    assert.equal(meta.label, 'Foo bar baz qux');
    assert.equal(meta.severity, 'info');
    assert.match(meta.badgeClass, /audit-badge--/);
});

test('formatAuditAction handles null, empty and mixed-case codes', () => {
    const h = makeAuditHarness();
    assert.equal(evaluate(h.ctx, 'formatAuditAction(null).label'), 'Unknown event');
    assert.equal(evaluate(h.ctx, 'formatAuditAction("").label'), 'Unknown event');
    assert.equal(evaluate(h.ctx, 'formatAuditAction(undefined).known'), false);
    const mixed = evaluate(h.ctx, 'formatAuditAction("Student.Soft-Delete")');
    assert.equal(mixed.known, true, 'casing should not lose the friendly label');
    assert.equal(mixed.label, 'Student account removed');
});

/* ── Table rendering ────────────────────────────────────────── */

test('the table shows friendly labels and never the raw action code', () => {
    const h = makeAuditHarness();
    const html = withRecords(h, [rec({ action: 'student.soft-delete', studentName: 'Jo Student' })]);
    assert.match(html, /Student account removed/);
    assert.doesNotMatch(html, /student\.soft-delete/, 'raw code must not appear in a table cell');
    assert.doesNotMatch(html, /password_changed/);
});

test('the raw action code is available in the event detail drawer', () => {
    const h = makeAuditHarness();
    withRecords(h, [rec({ _docId: 'al_1', action: 'student.soft-delete' })]);
    evaluate(h.ctx, 'openAuditDetail("al_1")');
    const body = h.elements['audit-detail-body'].innerHTML;
    assert.match(body, /student\.soft-delete/, 'drawer exposes the raw code');
    assert.match(body, /Student account removed/);
});

test('dynamic account strings are HTML-escaped (no injected markup)', () => {
    const h = makeAuditHarness();
    const html = withRecords(h, [rec({
        _docId: 'al_xss',
        studentName: '<img src=x onerror=alert(1)>',
        username: 'x"><script>bad()</script>'
    })]);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(html, /<img src=x/);
    assert.doesNotMatch(html, /<script>bad\(\)<\/script>/);
});

test('rows without a recorded account render as "Unknown account", never a bare dash', () => {
    const h = makeAuditHarness();
    const html = withRecords(h, [rec({
        studentName: null, actorName: null, instructorName: null, username: null
    })]);
    assert.match(html, /Unknown account/);
    // The table keeps its identifier targets even when names are missing.
    assert.doesNotMatch(html, /<td[^>]*>\s*-\s*<\/td>/);
});

/* ── Authorized by ──────────────────────────────────────────── */

test('resolveAuditAuthorizedBy prefers self-service, then the actor name, then System', () => {
    const h = makeAuditHarness();
    assert.equal(
        evaluate(h.ctx, 'resolveAuditAuthorizedBy({action:"password_changed",studentName:"A",actorName:"A"})'),
        'Self-service'
    );
    assert.equal(
        evaluate(h.ctx, 'resolveAuditAuthorizedBy({action:"student.soft-delete",studentName:"A",instructorName:"Mr Cruz",actorName:"Mr Cruz"})'),
        'Mr Cruz'
    );
    const noName = evaluate(h.ctx, 'resolveAuditAuthorizedBy({action:"password_reset_approved"})');
    assert.equal(noName, 'System');
    assert.notEqual(noName, '-');
});

/* ── Filters & pagination ───────────────────────────────────── */

test('pagination slices records and reports the visible range', () => {
    const h = makeAuditHarness();
    const records = Array.from({ length: 20 }, (_, i) => rec({
        _docId: 'al_' + i,
        timestamp: '2026-05-01T10:' + String(i).padStart(2, '0') + ':00.000Z'
    }));
    vm.runInContext('auditLogAllRecords = ' + JSON.stringify(records) + '; auditLogPage = 1; renderAuditLogTable();', h.ctx);

    assert.equal(h.elements['audit-count-label'].textContent, 'Showing 1\u20138 of 20');
    assert.match(h.elements['audit-pagination'].innerHTML, /data-audit-page="3"/);

    evaluate(h.ctx, 'auditGoPage(3)');
    assert.equal(h.elements['audit-count-label'].textContent, 'Showing 17\u201320 of 20');
    const rows = h.elements['password-requests-body'].innerHTML.split('<tr').length - 1;
    assert.equal(rows, 4);
});

test('category and date filters narrow the table without dropping rows unexpectedly', () => {
    const h = makeAuditHarness();
    const records = [
        rec({ _docId: 'a', action: 'student.soft-delete', timestamp: '2026-05-10T10:00:00.000Z' }),
        rec({ _docId: 'b', action: 'password_changed', timestamp: '2026-01-10T10:00:00.000Z' }),
        rec({ _docId: 'c', action: 'password_reset_approved', timestamp: '2026-05-12T10:00:00.000Z' })
    ];
    vm.runInContext('auditLogAllRecords = ' + JSON.stringify(records) + '; renderAuditLogTable();', h.ctx);

    evaluate(h.ctx, 'setAuditCategoryFilter("account")');
    assert.equal(h.elements['audit-count-label'].textContent, 'Showing 1\u20131 of 1');
    assert.match(h.elements['password-requests-body'].innerHTML, /Student account removed/);

    evaluate(h.ctx, 'setAuditCategoryFilter("")');
    h.elements['audit-date-from'].value = '2026-05-01';
    evaluate(h.ctx, 'applyAuditFilters()');
    assert.equal(h.elements['audit-count-label'].textContent, 'Showing 1\u20132 of 2');
});

/* ── Clear history flow ─────────────────────────────────────── */

test('clear history only fires with the exact confirmation word', async () => {
    const h = makeAuditHarness();
    withRecords(h, [rec({ _docId: 'al_1' })]);
    h.elements['audit-clear-confirm-input'].value = 'delete me';
    await evaluate(h.ctx, 'performClearAuditHistory()');
    assert.equal(h.calls.clear, 0, 'mismatched confirmation must not clear anything');
});

test('confirming clear history wipes once and writes exactly one audit record', async () => {
    const h = makeAuditHarness();
    withRecords(h, [rec({ _docId: 'al_1' }), rec({ _docId: 'al_2' })]);
    h.elements['audit-clear-confirm-input'].value = 'delete';
    await evaluate(h.ctx, 'performClearAuditHistory()');

    assert.equal(h.calls.clear, 1);
    assert.equal(h.calls.auditWrites.length, 1);
    assert.equal(h.calls.auditWrites[0].action, 'audit.history-cleared');
    assert.equal(h.calls.auditWrites[0].instructorName, 'Ada Admin');
    assert.match(h.calls.auditWrites[0].reason, /2 audit events/);
    assert.equal(h.elements['audit-clear-modal'].hidden, true, 'modal closes after clearing');
});

/* ── Registry coverage: a new action string must be labelled ── */

test('every audit action written in source has a registry label', () => {
    const h = makeAuditHarness();
    const registryKeys = evaluate(h.ctx, 'Object.keys(AUDIT_ACTIONS)');
    const writers = [
        'src/app/admin-security.js', 'src/app/audit.js', 'src/app/audit-actions.js',
        'src/app/password-management.js', 'src/app/student-settings.js',
        'src/app/student-recovery.js', 'src/app/instructor-recovery.js',
        'src/database/student-deletion.js'
    ];
    const found = new Set();
    for (const file of writers) {
        const text = read(file);
        for (const match of text.matchAll(/action:\s*['"]([A-Za-z][A-Za-z0-9._-]*)['"]/g)) {
            found.add(match[1]);
        }
    }
    assert.ok(found.size > 0, 'expected to discover audit action literals');
    for (const code of found) {
        assert.ok(registryKeys.includes(code), `action "${code}" has no friendly label in AUDIT_ACTIONS`);
    }
    assert.ok(registryKeys.includes('audit.history-cleared'));
});

/* ── Source-level safety & geometry ─────────────────────────── */

test('the clear-history control no longer relies on window.confirm', () => {
    assert.doesNotMatch(adminSrc, /window\.confirm/);
    const indexHtml = read('index.html');
    assert.doesNotMatch(indexHtml, /clearSecurityAuditHistory/);
});

test('the mobile layout turns rows into cards and cannot overflow 320px', () => {
    const fixed = css.match(/\.audit-log-table\s*\{[^}]*\}/);
    assert.ok(fixed && /table-layout:\s*fixed/.test(fixed[0]), 'table must use fixed layout');

    const widths = [...css.matchAll(/\.audit-log-table th:nth-child\(\d\)\s*\{\s*width:\s*(\d+)%/g)]
        .map(m => Number(m[1]));
    assert.equal(widths.length, 5, 'all five columns need an explicit width');
    assert.ok(widths.reduce((a, b) => a + b, 0) <= 100, 'column widths must not exceed 100%');

    const mobile = css.match(/@media \(max-width: 640px\)\s*\{[\s\S]*?\n\}/);
    assert.ok(mobile, 'a mobile breakpoint must exist');
    assert.match(mobile[0], /\.audit-log-table,\s*\n\s*\.audit-log-table tbody/);
    assert.match(mobile[0], /content:\s*attr\(data-label\)/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.drawer-panel/);
});

test('audit badges reuse the contrast-checked status tokens', () => {
    for (const variant of ['success', 'info', 'warning', 'danger', 'neutral']) {
        const block = css.match(new RegExp('\\.audit-badge--' + variant + '\\s*\\{[^}]*\\}'));
        assert.ok(block, `.audit-badge--${variant} must exist`);
        assert.match(block[0], new RegExp('--status-' + variant + '-bg'));
        assert.match(block[0], new RegExp('--status-' + variant + '-fg'));
    }
});
