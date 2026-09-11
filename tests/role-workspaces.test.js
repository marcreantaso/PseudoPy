const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const app = source('app.js');
function classList() {
    const values = new Set();
    return { add: value => values.add(value), remove: value => values.delete(value), contains: value => values.has(value),
        toggle(value, force) { if (force === undefined) force = !values.has(value); force ? values.add(value) : values.delete(value); return force; } };
}
function translationContext() {
    const elements = new Map();
    const get = id => {
        if (!elements.has(id)) elements.set(id, { value: '', textContent: '', innerHTML: '', classList: classList() });
        return elements.get(id);
    };
    const context = vm.createContext({ performance, console, $id: get, $qs: get,
        setPythonOutput: (id, code) => { get(id).value = code; }, showToast() {}, updateGutter() {}, updateExerciseStatus() {},
        exerciseState: {}, currentErrorLineNumbers: [], renderHtmlErrors: errors => JSON.stringify(errors), elements });
    vm.runInContext(source('mapper.js') + '\n' + source('compiler.js'), context);
    vm.runInContext(app.slice(app.indexOf('function translatePseudocodeGeneric('), app.indexOf('/* ============================================================\n   FILE UPLOAD')), context);
    vm.runInContext(app.slice(app.indexOf('function pseudocodeToPython('), app.indexOf('/* ============================================================\n   CODE EXECUTION')), context);
    vm.runInContext(app.slice(app.indexOf('function validatePseudocode('), app.indexOf('function renderHtmlErrors(', app.indexOf('function validatePseudocode('))), context);
    return { context, get };
}
test('student, translation page and instructor produce identical Python', () => {
    const { context, get } = translationContext();
    const program = 'BEGIN\nSET x TO -7 // 3\nDISPLAY x, 2 ** 3 ** 2\nEND';
    for (const id of ['pseudocode-editor', 'translate-input', 'instructor-pseudo-input']) get(id).value = program;
    context.translatePseudocode(); context.translateFromPage(); context.instructorTranslate();
    assert.match(get('python-output').value, /print/);
    assert.equal(get('python-output').value, get('translate-output').value);
    assert.equal(get('python-output').value, get('instructor-python-output').value);
});
test('student and instructor reject the same malformed operators', () => {
    const { context, get } = translationContext();
    for (const id of ['pseudocode-editor', 'instructor-pseudo-input']) get(id).value = 'BEGIN\nDISPLAY 2 *** 3\nEND';
    context.translatePseudocode(); context.instructorTranslate();
    assert.match(get('python-output').value, /Translation failed/);
    assert.equal(get('python-output').value, get('instructor-python-output').value);
    assert.equal(context.validatePseudocode('BEGIN\nDISPLAY 2 *** 3\nEND').valid, false);
});
test('positive-number text never substitutes a fixed program', () => {
    const { context } = translationContext();
    const result = context.pseudocodeToPython('BEGIN\nDECLARE number AS INTEGER\nINPUT number\nIF number > 100 THEN\nDISPLAY "Positive Number"\nELSE\nDISPLAY "Not Positive"\nEND IF\nEND');
    assert.match(result.python, /number > 100/);
    assert.doesNotMatch(result.python, /def process_number/);
});

function navigationContext(width, role) {
    const listeners = {};
    let document;
    function element(name) { return { name, classList: classList(), attributes: {}, inert: false,
        setAttribute(key, value) { this.attributes[key] = value; }, removeAttribute(key) { delete this.attributes[key]; },
        focus() { document.activeElement = this; }, getClientRects() { return [1]; } }; }
    const close = element('close'), route = element(role + '-route'), signout = element('signout');
    const sidebar = element('sidebar'), overlay = element('overlay'), button = element('hamburger');
    const main = element('main'), topbar = element('topbar');
    sidebar.querySelector = () => close;
    sidebar.querySelectorAll = () => [close, route, signout];
    sidebar.contains = el => [close, route, signout].includes(el);
    document = { activeElement: button, readyState: 'complete', body: element('body'), addEventListener: (name, cb) => { listeners[name] = cb; } };
    const window = { innerWidth: width, addEventListener: (name, cb) => { listeners[name] = cb; } };
    const context = vm.createContext({ document, window,
        $id: id => id === 'sidebar-overlay' ? overlay : button,
        $qs: selector => ({ '.sidebar': sidebar, '.sidebar.open': sidebar.classList.contains('open') ? sidebar : null, '.main-content': main, '.topbar': topbar })[selector] });
    const start = app.indexOf('let sidebarPreviousFocus = null;');
    const end = app.indexOf("});", app.indexOf("window.addEventListener('resize'", start)) + 3;
    vm.runInContext(app.slice(start, end), context);
    return { context, document, window, sidebar, overlay, button, main, topbar, close, signout, listeners };
}
for (const role of ['student', 'instructor', 'admin']) for (const width of [320, 768, 1023, 1024, 1440]) {
    test(role + ' menu behavior at ' + width + 'px', () => {
        const { context, sidebar, button, main, overlay } = navigationContext(width, role);
        assert.equal(sidebar.inert, width < 1024);
        context.toggleMobileSidebar();
        assert.equal(sidebar.classList.contains('open'), width < 1024);
        assert.equal(main.inert, width < 1024);
        assert.equal(button.attributes['aria-expanded'], String(width < 1024));
        assert.equal(overlay.classList.contains('hidden'), width >= 1024);
        context.closeMobileSidebar();
        assert.equal(sidebar.classList.contains('open'), false);
        assert.equal(main.inert, false);
    });
}
test('Escape restores focus and Tab remains in the mobile drawer', () => {
    const nav = navigationContext(768, 'student'); nav.context.toggleMobileSidebar();
    assert.equal(nav.document.activeElement, nav.close);
    nav.listeners.keydown({ key: 'Tab', shiftKey: true, preventDefault() {} });
    assert.equal(nav.document.activeElement, nav.signout);
    nav.listeners.keydown({ key: 'Tab', shiftKey: false, preventDefault() {} });
    assert.equal(nav.document.activeElement, nav.close);
    nav.listeners.keydown({ key: 'Escape', preventDefault() {} });
    assert.equal(nav.document.activeElement, nav.button);
    assert.equal(nav.document.body.classList.contains('navigation-open'), false);
});
test('resizing to desktop clears drawer state and restores access', () => {
    const nav = navigationContext(768, 'instructor'); nav.context.toggleMobileSidebar();
    nav.window.innerWidth = 1440; nav.listeners.resize();
    assert.equal(nav.sidebar.inert, false);
    assert.equal(nav.sidebar.attributes['aria-hidden'], undefined);
    assert.equal(nav.main.inert, false);
    assert.equal(nav.topbar.inert, false);
});
