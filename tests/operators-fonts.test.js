/* ============================================================
   PART 1 — Unicode operators, monospace rendering, formatter

   These tests pin the behaviour the owner asked for:
     - one shared symbol table (no duplicate maps anywhere)
     - the new symbols ∧ ∨ ¬ ⩾ ⩽ ∕ normalize like the existing set
     - symbols with no Python equivalent get a friendly hint, not silence
     - every monospace surface disables ligatures and uses --font-mono
     - the bundled no-ligature font is precached
     - the formatter is idempotent and its output-symbol setting works
   ============================================================ */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

// ── 1. One symbol table ───────────────────────────────────────

test('the symbol map exists in exactly one source file', () => {
    const spec = read('src/compiler/language-spec.js');
    // The canonical table is declared here…
    assert.match(spec, /const SYMBOL_MAP = Object\.freeze\(\{/);

    // …and no other source file declares its own operator->ASCII table.
    const files = require('child_process')
        .execSync('git ls-files "src/**/*.js"', { cwd: root, encoding: 'utf8' })
        .split('\n').filter(Boolean)
        .filter(f => f !== 'src/compiler/language-spec.js');
    for (const f of files) {
        const body = read(f);
        const declaresTable = /(?:PYTHON_OPERATOR_MAP|UNICODE_OPERATOR_MAP|unicodeNormalizations)\s*[:=]\s*\{/.test(body);
        assert.equal(declaresTable, false, `${f} declares its own symbol table; use LANGUAGE_SPEC.unicodeNormalizations`);
    }
});

test('the lexer and code generator alias the shared map instead of copying it', () => {
    const spec = require(path.join(root, 'src/compiler/language-spec.js'));
    assert.ok(spec.SYMBOL_MAP, 'language-spec exports SYMBOL_MAP');

    const lexer = read('src/compiler/lexer.js');
    assert.match(lexer, /static UNICODE_OPERATOR_MAP = LANGUAGE_SPEC\.unicodeNormalizations/);
    const gen = read('src/compiler/code-generator.js');
    assert.match(gen, /const PYTHON_OPERATOR_MAP = LANGUAGE_SPEC\.unicodeNormalizations/);
});

test('every published symbol resolves to a Python-compatible operator or keyword', () => {
    const { SYMBOL_MAP } = require(path.join(root, 'src/compiler/language-spec.js'));
    const allowed = new Set(['>=', '<=', '!=', '==', '*', '/', '-', '=', '->', 'AND', 'OR', 'NOT']);
    for (const [symbol, target] of Object.entries(SYMBOL_MAP)) {
        assert.ok(allowed.has(target), `${symbol} maps to unsupported target ${target}`);
    }
    // The additions the owner asked for are present.
    for (const s of ['\u2A7E', '\u2A7D', '\u2215', '\u2227', '\u2228', '\u00AC']) {
        assert.ok(SYMBOL_MAP[s], `expected ${s} in the symbol map`);
    }
});

test('the lexer normalizes the new symbols exactly like the existing ones', () => {
    const context = vm.createContext({ performance, console: { log() {} } });
    vm.runInContext(
        read('mapper.js') + '\n' + read('compiler.js') +
        '\nglobalThis.engine = new PseudocodeCompiler();',
        context);
    const compile = source => context.engine.compile(source);

    const run = source => {
        const result = compile(source);
        return result.python || (result.errors || []).map(e => e.message).join(' | ');
    };

    // Comparison operators
    assert.match(run('BEGIN\nIF 5 \u2A7E 3 THEN\nDISPLAY "yes"\nEND IF\nEND'), />=/);
    assert.match(run('BEGIN\nIF 3 \u2A7D 5 THEN\nDISPLAY "yes"\nEND IF\nEND'), /<=/);
    // Division slash
    assert.match(run('BEGIN\nDISPLAY 10 \u2215 2\nEND'), /10 \/ 2/);
    // Logical operators become the keyword form Python understands
    assert.match(run('BEGIN\nIF TRUE \u2227 FALSE THEN\nDISPLAY "x"\nEND IF\nEND'), /and/);
    assert.match(run('BEGIN\nIF TRUE \u2228 FALSE THEN\nDISPLAY "x"\nEND IF\nEND'), /or/);
    assert.match(run('BEGIN\nIF \u00AC FALSE THEN\nDISPLAY "x"\nEND IF\nEND'), /not/);
});

test('symbols without a Python equivalent get a friendly hint, not silence', () => {
    const { UNICODE_HINTS } = require(path.join(root, 'src/compiler/language-spec.js'));
    for (const s of ['\u221A', '\u03C0', '\u00B1', '\u2248']) {
        assert.ok(UNICODE_HINTS[s], `expected a hint for ${s}`);
        assert.ok(UNICODE_HINTS[s].name && UNICODE_HINTS[s].help, `hint for ${s} needs name and help`);
    }

    const context = vm.createContext({ performance, console: { log() {} } });
    vm.runInContext(
        read('mapper.js') + '\n' + read('compiler.js') +
        '\nglobalThis.engine = new PseudocodeCompiler();',
        context);
    const result = context.engine.compile('BEGIN\nDISPLAY \u221A 4\nEND');
    const messages = (result.errors || []).map(e => e.message).join(' ');
    assert.match(messages, /square root/, 'the square-root symbol is explained, not silently dropped');
});

// ── 2. Monospace rendering ────────────────────────────────────

test('every monospace font-family in the stylesheets uses --font-mono', () => {
    for (const file of ['style.css', 'student-workspace.css']) {
        const css = read(file);
        // @font-face blocks declare the family itself; they are the definition,
        // not a consumer, and must name the font literally.
        const consumers = css.replace(/@font-face\s*\{[^}]*\}/g, '');
        const offenders = [];
        const re = /font-family\s*:\s*([^;}]+)[;}]/g;
        let m;
        while ((m = re.exec(consumers)) !== null) {
            const value = m[1];
            if (!/monospace|JetBrains Mono|Courier New/i.test(value)) continue;
            if (/var\(--font-mono\)/.test(value)) continue;
            offenders.push(value.trim());
        }
        assert.deepEqual(offenders, [], `${file} still has raw monospace stacks: ${offenders.join(' , ')}`);
    }
});

test('every monospace surface disables ligatures so >= never fuses into one glyph', () => {
    for (const file of ['style.css', 'student-workspace.css']) {
        const css = read(file);
        // For each rule body that sets the mono font, require both ligature
        // properties in that same body.
        const rules = css.matchAll(/([^{}]*)\{([^{}]*)\}/g);
        let checked = 0;
        for (const [, , body] of rules) {
            if (!/font-family\s*:\s*var\(--font-mono\)/.test(body)) continue;
            checked++;
            assert.match(body, /font-variant-ligatures:\s*none/, `${file}: a --font-mono rule lacks font-variant-ligatures: none`);
            assert.match(body, /font-feature-settings:\s*"liga"\s*0,\s*"calt"\s*0/, `${file}: a --font-mono rule lacks font-feature-settings`);
        }
        assert.ok(checked > 0, `${file}: expected at least one --font-mono rule`);
    }
});

test('the bundled no-ligature font is declared, licensed and precached', () => {
    const css = read('style.css');
    assert.match(css, /@font-face\s*\{[^}]*JetBrains Mono NL[^}]*vendor\/fonts\/jetbrains-mono-nl-400\.woff2[^}]*\}/);
    assert.match(css, /@font-face\s*\{[^}]*JetBrains Mono NL[^}]*vendor\/fonts\/jetbrains-mono-nl-700\.woff2[^}]*\}/);
    assert.match(css, /--font-mono:\s*'JetBrains Mono NL'/);
    assert.ok(fs.existsSync(path.join(root, 'vendor/fonts/LICENSE-OFL.txt')), 'OFL licence ships with the font');

    const sw = read('sw.js');
    for (const f of ['vendor/fonts/jetbrains-mono-nl-400.woff2', 'vendor/fonts/jetbrains-mono-nl-700.woff2']) {
        assert.match(sw, new RegExp(f.replace(/\./g, '\\.')), `service worker must precache ${f}`);
        assert.ok(fs.existsSync(path.join(root, f)), `${f} must exist in the checkout`);
    }
});

test('editors opt out of OS autocorrect so identifiers are not rewritten', () => {
    const html = read('index.html');
    for (const id of ['pseudocode-editor', 'translate-input', 'devtools-pseudocode']) {
        const re = new RegExp(`<textarea id="${id}"[^>]*>`);
        const tag = html.match(re);
        assert.ok(tag, `expected a textarea for ${id}`);
        assert.match(tag[0], /autocorrect="off"/, `${id} must set autocorrect="off"`);
        assert.match(tag[0], /autocapitalize="off"/, `${id} must set autocapitalize="off"`);
        assert.match(tag[0], /spellcheck="false"/, `${id} must keep spellcheck off`);
    }
});

// ── 3. Formatter ──────────────────────────────────────────────

const formatter = require(path.join(root, 'src/compiler/formatter.js'));

test('the formatter is idempotent', () => {
    const inputs = [
        'begin\nset x to 1\nif x>=1 then\ndisplay "hi"\nend if\nend',
        'BEGIN\r\n\tSET  a   TO  1\r\nEND',
        'BEGIN\n  DISPLAY "a \u2265 b"\nEND'
    ];
    for (const input of inputs) {
        const once = formatter.formatPseudocode(input).text;
        const twice = formatter.formatPseudocode(once).text;
        assert.equal(twice, once, `not idempotent for ${JSON.stringify(input)}`);
    }
});

test('the formatter never splits a multi-character operator', () => {
    const ge = formatter.formatPseudocode('BEGIN\nIF x >= 1 THEN\nDISPLAY x\nEND IF\nEND').text;
    assert.match(ge, /IF x >= 1 THEN/);
    assert.doesNotMatch(ge, /> =/, '">=" must not be split into "> ="');

    const ne = formatter.formatPseudocode('BEGIN\nIF x != 1 THEN\nDISPLAY x\nEND IF\nEND').text;
    assert.match(ne, /IF x != 1 THEN/);
    assert.doesNotMatch(ne, /! =/, '"!=" must not be split');

    const le = formatter.formatPseudocode('BEGIN\nIF x <= 1 THEN\nDISPLAY x\nEND IF\nEND').text;
    assert.match(le, /IF x <= 1 THEN/);
    assert.doesNotMatch(le, /< =/, '"<=" must not be split');
});

test('output-symbol conversion obeys the "use Python operators" setting', () => {
    const source = 'BEGIN\nDISPLAY "a \u2265 b"\nEND';
    const on = formatter.formatPseudocode(source, { pythonOperatorsInOutput: true });
    assert.match(on.text, /"a >= b"/, 'ON converts symbols typed in output text');
    assert.ok(on.changes.some(c => c.type === 'output-symbol'), 'ON reports a visible change');

    const off = formatter.formatPseudocode(source, { pythonOperatorsInOutput: false });
    assert.match(off.text, /"a \u2265 b"/, 'OFF leaves the symbol exactly as typed');
    assert.equal(off.changes.some(c => c.type === 'output-symbol'), false, 'OFF reports no symbol change');
});

test('the formatter leaves comments untouched but normalizes tabs, CRLF and NBSP', () => {
    const out = formatter.formatPseudocode('BEGIN\r\n\t# keep \u2265 here\r\n\tDISPLAY\u00A0"x"\r\nEND').text;
    assert.doesNotMatch(out, /\t/, 'tabs are expanded');
    assert.doesNotMatch(out, /\r/, 'CRLF is normalized to LF');
    assert.doesNotMatch(out, /\u00A0/, 'NBSP is normalized to a space');
    assert.match(out, /# keep \u2265 here/, 'comment text is preserved verbatim');
});

test('the settings toggle is wired and defaults to ON', () => {
    const appearance = read('src/app/appearance.js');
    assert.match(appearance, /function pythonOperatorsInOutputEnabled/);
    assert.match(appearance, /function handlePythonOutputSymbolsToggle/);
    assert.match(appearance, /!== 'off'/, 'the default is ON: only an explicit "off" disables it');
    const settings = read('src/app/student-settings.js');
    assert.match(settings, /settings-python-output-symbols/);
    const html = read('index.html');
    assert.match(html, /id="settings-python-output-symbols"/);
    assert.match(html, /onchange="handlePythonOutputSymbolsToggle/);
});

test('the Normalize/Format devtools panel is bound to the formatter', () => {
    const ui = read('src/devtools/research-ui.js');
    for (const id of ['norm-preview', 'norm-apply', 'norm-copy']) {
        const html = read('index.html');
        assert.match(html, new RegExp(`id="${id}"`), `expected #${id} in the panel`);
        assert.match(ui, new RegExp(`bind\\('${id}'`), `#${id} must be bound`);
    }
    assert.match(ui, /PseudocodeFormatter/);
});

// ── 4. System text never contains stray math symbols ──────────

test('system UI text uses Python operators, not Unicode math glyphs', () => {
    // Symbols that would confuse students if they leaked into labels, tooltips,
    // help text or generated output. The intended home for each is the symbol
    // map (an input aid), never rendered system text.
    const disallowed = /[\u2A7E\u2A7D\u2215\u2227\u2228\u00AC\u2265\u2264\u2260\u2261]/u;
    // Two places deliberately show a literal operator glyph: the accepted-format
    // panel (which documents INPUT symbols) and the output-text setting (which
    // names the exact symbol a student may have typed). Both carry an explicit
    // data-symbol-example marker so the exemption is auditable rather than
    // inferred from markup shape; the marked element's own line is skipped.
    const lines = read('index.html').replace(/\r/g, '').split('\n');
    const offenders = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/data-symbol-example/.test(line)) continue;
        if (disallowed.test(line)) offenders.push(`index.html:${i + 1}`);
    }
    assert.deepEqual(offenders, [], 'System text must show Python operators; Unicode math glyphs belong in the input aid only');
});

test('every intentional symbol demonstration is explicitly marked', () => {
    const html = read('index.html');
    const markers = html.match(/data-symbol-example(?![-\w])/g) || [];
    assert.ok(markers.length >= 2, 'both the accepted-format panel and the settings example must be marked');
    // Each marker states why the exemption exists.
    const reasons = html.match(/data-symbol-example-reason="[^"]+"/g) || [];
    assert.equal(reasons.length, markers.length, 'every symbol-example marker must explain itself');
});

test('the console renderer never emits a raw Unicode operator into output DOM', () => {
    // The console renders the generated program's stdout, which the code
    // generator produces with ASCII operators only. Guard that the generator
    // itself never emits a Uniode operator.
    const gen = read('src/compiler/code-generator.js');
    assert.doesNotMatch(gen, /['"][\u2265\u2264\u2260\u2227\u2228\u00AC][\u2265\u2264\u2260]{0,2}['"]/u,
        'the code generator must emit ASCII operators, never Unicode glyphs');
    // And a real compile of a program containing Unicode operators produces
    // pure-ASCII Python.
    const context = vm.createContext({ performance, console: { log() {} } });
    vm.runInContext(
        read('mapper.js') + '\n' + read('compiler.js') +
        '\nglobalThis.engine = new PseudocodeCompiler();',
        context);
    const python = context.engine.compile('BEGIN\nIF 5 \u2A7E 3 \u2227 TRUE THEN\nDISPLAY 10 \u2215 2\nEND IF\nEND').python || '';
    assert.doesNotMatch(python, /[\u2265\u2264\u2260\u2A7E\u2A7D\u2215\u2227\u2228\u00AC]/u,
        `generated Python must be ASCII-only, got: ${python}`);
    assert.match(python, />=/);
    assert.match(python, /and/);
    assert.match(python, /10 \/ 2/);
});
