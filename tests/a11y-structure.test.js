/* ============================================================
   A11Y STRUCTURE GATE FOR index.html + src/app/a11y.js
   Verifies the static skeleton that the runtime accessibility
   helpers (skip link, focus management, aria-live regions,
   table header scoping) depend on.

   NOTE: PseudoPy templates render `{{ui:...}}` placeholders and
   inline lucide <i> icons; the name checks account for those.
   ============================================================ */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function stripTemplates(s) {
    // `{{ui:Name}}` placeholders render to icons; drop them so they
    // do not count as visible text.
    return s.replace(/\{\{ui:[^}]*\}\}/g, ' ').trim();
}

// Text that a sighted user would actually read (templates and icon
// elements removed from the static inner HTML).
function visibleText(inner) {
    return stripTemplates(inner)
        .replace(/<i\b[^>]*><\/i>/g, ' ')
        .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function idCandidates() {
    const ids = [];
    const re = /\sid="([^"]+)"/g;
    let m;
    while ((m = re.exec(html))) ids.push(m[1]);
    return ids;
}

function buttons() {
    const out = [];
    // Multi-line <button ...>...</button>
    const re = /<button\b([^>]*)>([\s\S]*?)<\/button>/g;
    let m;
    while ((m = re.exec(html))) out.push({ attrs: m[1], inner: m[2] });
    return out;
}

function attr(attrs, name) {
    const m = new RegExp(name + '="([^"]*)"').exec(attrs);
    return m ? m[1] : '';
}

test('skip link targets the main landmark', () => {
    assert.match(html, /<a\s+class="skip-link"\s+href="#main-content"[^>]*>Skip to main content<\/a>/);
});

test('exactly one <main> landmark with tabindex="-1" (focusable target)', () => {
    const mains = html.match(/<main\b/g) || [];
    assert.equal(mains.length, 1, 'exactly one <main> element expected');
    assert.match(html, /<main\b[^>]*id="main-content"[^>]*tabindex="-1"[^>]*>/);
});

test('aria-live liveregions exist for toasts and status updates', () => {
    assert.match(html, /id="toast-container"[^>]*aria-live="polite"/);
    assert.match(html, /id="boot-splash"[^>]*aria-live="polite"/);
    assert.match(html, /id="pwa-update-banner"[^>]*aria-live="polite"/);
});

test('no duplicate ids in index.html', () => {
    const ids = idCandidates();
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    assert.deepEqual([...new Set(dupes)], [], 'duplicate ids found');
});

test('every thead <th> has scope="col"', () => {
    const rows = [];
    const re = /<thead\b[^>]*>([\s\S]*?)<\/thead>/g;
    let m;
    while ((m = re.exec(html))) {
        const thead = m[1];
        const ths = thead.match(/<th[^>]*>/g) || [];
        ths.forEach((th) => {
            if (!/scope="col"/.test(th)) rows.push(th);
        });
    }
    assert.deepEqual(rows, [], 'thead th without scope="col"');
});

test('every button has an accessible name', () => {
    const missing = [];
    buttons().forEach((b) => {
        const label = attr(b.attrs, 'aria-label');
        const labelledby = attr(b.attrs, 'aria-labelledby');
        const title = attr(b.attrs, 'title');
        const text = visibleText(b.inner);
        if (!label && !labelledby && !title && !text) missing.push(b.inner.slice(0, 60));
    });
    assert.deepEqual(missing, [], 'buttons without an accessible name');
});

test('password toggles and analytics eye buttons are wired', () => {
    // Password visibility toggles bound to the shared a11y helper.
    assert.equal((html.match(/togglePasswordVisibility\(/g) || []).length, 10,
        'each password field has a visibility toggle bound to togglePasswordVisibility');
    assert.ok(html.includes('data-lucide="eye"'), 'toggle buttons render the eye icon');
    const analyticsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'analytics.js'), 'utf8');
    assert.match(analyticsSrc, /class="an-eye-btn"/, 'analytics row-actions eye button exists in analytics.js');
    assert.match(analyticsSrc, /aria-label=.*docId/, 'analytics eye button is labelled with the row id');
});

test('legal documents each expose a single h1 document heading', () => {
    const legalSections = ['privacy-h1', 'terms-h1', 'about-h1'];
    legalSections.forEach((id) => {
        assert.ok(new RegExp(`<h1[^>]*id="${id}"[^>]*>`).test(html), `missing <h1 id="${id}">`);
    });
    const h1InsideLegal = (html.match(/<h1[^>]*id="(privacy|terms|about)-h1"/g) || []).length;
    assert.equal(h1InsideLegal, 3);
});

test('runtime table-header scoping is implemented in src/app/a11y.js', () => {
    const a11yFile = path.join(__dirname, '..', 'src', 'app', 'a11y.js');
    assert.ok(fs.existsSync(a11yFile), 'src/app/a11y.js must exist');
    const src = fs.readFileSync(a11yFile, 'utf8');
    assert.match(src, /setAttribute\('scope', 'col'\)/, 'a11y.js must scope table headers dynamically');
    assert.match(src, /\.modal-overlay/, 'a11y.js must manage modal/drawer overlays');
    assert.match(src, /togglePasswordVisibility/, 'a11y.js must define the password toggle');
});