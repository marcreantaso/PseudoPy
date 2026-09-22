const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r/g, '');

const appInfoSrc = read('src/config/app-info.js');
const legalPagesSrc = read('src/app/legal-pages.js');
const indexHtml = read('index.html');

function allLegalIds() {
    return [
        'legal-pending-notice', 'legal-pending-text',
        'legal-app-name', 'legal-app-name-2', 'legal-org', 'legal-org-2',
        'legal-team', 'legal-version', 'legal-collections',
        'legal-contact', 'legal-contact-2', 'legal-contact-3', 'legal-contact-4',
        'legal-privacy-date', 'legal-terms-date',
        'legal-privacy-date-row', 'legal-terms-date-row',
        'legal-contact-row-1', 'legal-contact-row-2', 'legal-contact-row-3', 'legal-contact-row-4',
        'about-app-name', 'about-app-version', 'about-app-description', 'about-org',
        'about-founder', 'about-cofounder', 'about-tech', 'about-contact', 'about-contact-row'
    ];
}

function boot(context, els) {
    context.$id = id => els[id] || null;
    context.$qs = () => null;
    context.hide = () => {};
    context.show = () => {};
    context.navigateTo = () => {};
    context.currentUser = null;
    context.currentPage = 'write-pseudocode';
    vm.runInContext(appInfoSrc, context);
    vm.runInContext(legalPagesSrc, context);
}

function makeEls() {
    const els = {};
    allLegalIds().forEach(id => {
        els[id] = {
            textContent: '',
            hidden: false,
            classList: { toggle(cls, force) { els[id].hidden = force === undefined ? !els[id].hidden : force; } },
            setAttribute() {}, focus() {}
        };
    });
    return els;
}

test('config centralizes confirmed team/organization', () => {
    assert.match(appInfoSrc, /founder:\s*'Mikaella C\. Daet'/);
    assert.match(appInfoSrc, /coFounder:\s*'Marc Gian R\. Reantaso'/);
    assert.match(appInfoSrc, /'Eduard Mirandilla'/);
    assert.match(appInfoSrc, /'Mark Bautista'/);
    assert.match(appInfoSrc, /organization:\s*'Pamantasan ng Cabuyao[^']*'/);
});

test('version comes from build token, not a hardcoded literal', () => {
    assert.match(appInfoSrc, /__PSEUDOPY_VERSION__/);
    assert.match(appInfoSrc, /version:\s*'__PSEUDOPY_VERSION__'/);
    assert.ok(!/version:\s*'1\.0\.0'/.test(appInfoSrc), 'no hardcoded 1.0.0 in config');
});

test('stale generic owner-placeholder language is gone', () => {
    assert.ok(!legalPagesSrc.includes('Project ownership is confirmed'), 'stale banner sentence removed');
    assert.ok(!legalPagesSrc.includes('must still be review'), 'stale banner removed');
    assert.ok(!indexHtml.includes('[pending owner configuration]'), 'placeholder literal not in html');
    assert.ok(!indexHtml.includes('must be confirmed by the system owner before public launch'), 'dev-preview wall removed');
    assert.ok(!indexHtml.includes('If the contact value above reads'), 'stale About hint removed');
});

test('About page ships founder / co-founder / technical-team rows, not one crammed cell', () => {
    assert.match(indexHtml, /id="about-founder"/);
    assert.match(indexHtml, /id="about-cofounder"/);
    assert.match(indexHtml, /id="about-tech"/);
    assert.ok(!/id="about-team"/.test(indexHtml), 'cramped about-team cell removed');
    assert.match(legalPagesSrc, /set\('about-founder'/);
    assert.match(legalPagesSrc, /set\('about-cofounder'/);
    assert.match(legalPagesSrc, /set\('about-tech'/);
});

test('field-specific missing-field list works in dev mode and hides in production', () => {
    const context = vm.createContext({
        window: { APP_CONFIG: { development: true }, APP_INFO: null, location: { hostname: '' } },
        console
    });
    const els = makeEls();
    boot(context, els);
    assert.deepEqual(context.appInfoMissingFields().map(m => m.key).sort(),
        ['contactEmail', 'privacyEffectiveDate', 'termsEffectiveDate']);
    context.renderLegalPlaceholders();
    // dev: banner visible and lists the three exact labels; rows carry dev markers
    assert.strictEqual(els['legal-pending-notice'].hidden, false);
    const bannerText = els['legal-pending-text'].textContent;
    assert.match(bannerText, /official contact address/);
    assert.match(bannerText, /privacy policy effective date/);
    assert.match(bannerText, /terms of use effective date/);
    assert.strictEqual(els['legal-privacy-date'].textContent, '[development: privacy policy effective date not yet configured]');
    assert.strictEqual(els['legal-contact'].textContent, '[development: official contact address not yet configured]');
    assert.ok(!els['legal-privacy-date'].textContent.includes('pending owner configuration'));
    assert.strictEqual(els['about-founder'].textContent, 'Mikaella C. Daet');
    assert.strictEqual(els['about-cofounder'].textContent, 'Marc Gian R. Reantaso');
    assert.strictEqual(els['about-tech'].textContent, 'Eduard Mirandilla, Mark Bautista');

    // production with all fields configured: banner hidden, real values render, no markers
    const ctx2 = vm.createContext({ window: { APP_CONFIG: {}, APP_INFO: null, location: { hostname: 'pseudopy.vercel.app' } }, console });
    const els2 = makeEls();
    boot(ctx2, els2);
    const appInfo2 = ctx2.window.APP_INFO;
    ctx2.window.APP_INFO = appInfo2;
    appInfo2.contactEmail = 'team@pseudopy.edu.ph';
    appInfo2.privacyEffectiveDate = 'September 22, 2026';
    appInfo2.termsEffectiveDate = 'September 22, 2026';
    ctx2.renderLegalPlaceholders();
    assert.strictEqual(els2['legal-pending-notice'].hidden, true);
    assert.strictEqual(els2['legal-contact'].textContent, 'team@pseudopy.edu.ph');
    assert.strictEqual(els2['legal-privacy-date'].textContent, 'September 22, 2026');
    assert.ok(![...allLegalIds()].some(id => (els2[id].textContent || '').includes('not yet configured')));

    // production with fields still missing: rows omitted, banner hidden, no marker text
    const ctx3 = vm.createContext({ window: { APP_CONFIG: {}, APP_INFO: null, location: { hostname: 'pseudopy.vercel.app' } }, console });
    const els3 = makeEls();
    boot(ctx3, els3);
    ctx3.renderLegalPlaceholders();
    assert.strictEqual(els3['legal-pending-notice'].hidden, true);
    assert.strictEqual(els3['legal-privacy-date-row'].hidden, true);
    assert.strictEqual(els3['legal-contact-row-1'].hidden, true);
    assert.strictEqual(els3['about-contact-row'].hidden, true);
    assert.strictEqual(els3['legal-privacy-date'].textContent, '');
    assert.ok(![...allLegalIds()].some(id => (els3[id].textContent || '').includes('pending owner configuration')));
});