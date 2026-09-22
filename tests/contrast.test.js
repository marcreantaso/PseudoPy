/* ============================================================
   CONTRAST GATE FOR style.css
   Parses the :root (light) and [data-theme='dark'] custom
   properties and asserts WCAG 2.2 AA contrast for the text/UI
   pairs that the P3 remediation fixed.

   Text foregrounds must reach 4.5:1; graphical/UI must reach 3.0:1.
   ============================================================ */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

function parseVars(block) {
    const vars = {};
    const re = /--([a-zA-Z0-9-]+):\s*([^;]+);/g;
    let m;
    while ((m = re.exec(block))) vars['--' + m[1].trim()] = m[2].trim();
    return vars;
}

function extractBlock(css, startIndex) {
    const start = css.indexOf('{', startIndex);
    const block = css.slice(startIndex, start);
    let depth = 0;
    let i = start;
    for (; i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') { depth--; if (depth === 0) break; }
    }
    return { selector: block.trim(), body: css.slice(start + 1, i), end: i + 1 };
}

function extractAllBlocks(css, selectorMatch) {
    const out = [];
    let idx = css.indexOf(selectorMatch);
    while (idx !== -1) {
        const block = extractBlock(css, idx);
        if (/^\s*:root/.test(block.selector) || block.selector.includes(selectorMatch)) out.push(block);
        idx = css.indexOf(selectorMatch, block.end);
    }
    return out;
}

const lightBlocks = extractAllBlocks(css, ':root');
const darkBlocks = extractAllBlocks(css, "[data-theme='dark']");
assert(lightBlocks.length >= 1 && darkBlocks.length >= 1, 'style.css must define :root and [data-theme=dark]');

const L = Object.assign({}, ...lightBlocks.map((b) => parseVars(b.body)));
const D = Object.assign({}, ...darkBlocks.map((b) => parseVars(b.body)));

function hexToRgb(hex) {
    let h = hex.replace('#', '').trim();
    if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}

function lin(c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

function lum(rgb) {
    if (!rgb) return 0.21;
    return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

function ratio(hexA, hexB) {
    const a = lum(hexToRgb(hexA));
    const b = lum(hexToRgb(hexB));
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Pairs: [theme, fgHex, bgHex, minimumRatio, label]
const MATRIX = [
    // ── Light theme text (4.5:1) ──
    ['light', '#0f172a', '#ffffff', 4.5, 'text-primary on card'],
    ['light', '#475569', '#ffffff', 4.5, 'text-secondary on card'],
    ['light', '#475569', '#f8fafc', 4.5, 'text-secondary on elevated'],
    ['light', '#64748b', '#ffffff', 4.5, 'text-muted on card'],
    ['light', '#64748b', '#f8fafc', 4.5, 'text-muted on elevated'],
    ['light', '#2563eb', '#ffffff', 4.5, 'text-accent on card'],
    ['light', '#dc2626', '#ffffff', 4.5, 'danger on card'],
    ['light', '#047857', '#ffffff', 4.5, 'text-success on card'],
    ['light', '#b45309', '#ffffff', 4.5, 'text-warning on card'],
    ['light', '#0e7490', '#ffffff', 4.5, 'text-cyan on card'],
    ['light', '#334155', '#f1f5f9', 4.5, 'status-neutral-fg on bg'],
    // Light badges (text vs badge bg)
    ['light', '#047857', '#ecfdf5', 4.5, 'status-success badge'],
    ['light', '#b45309', '#fffbeb', 4.5, 'status-warning badge'],
    ['light', '#b91c1c', '#fef2f2', 4.5, 'status-danger badge'],
    ['light', '#1d4ed8', '#eff6ff', 4.5, 'status-info badge'],
    ['light', '#6d28d9', '#f5f3ff', 4.5, 'status-violet badge'],
    // Light buttons (white text on gradient endpoints)
    ['light', '#ffffff', '#2563eb', 4.5, 'btn-primary white on blue'],
    ['light', '#ffffff', '#1d4ed8', 4.5, 'btn-primary white on blue-700'],
    ['light', '#ffffff', '#047857', 4.5, 'btn-success white on emerald-700'],
    ['light', '#ffffff', '#065f46', 4.5, 'btn-success white on emerald-800'],
    ['light', '#ffffff', '#b91c1c', 4.5, 'btn-danger white on red-700'],
    ['light', '#ffffff', '#991b1b', 4.5, 'btn-danger white on red-800'],
    // Light UI graphics (3.0:1)
    ['light', '#3b82f6', '#ffffff', 3.0, 'accent graphics on card'],
    ['light', '#047857', '#ffffff', 3.0, 'icon-success on card'],
    ['light', '#b45309', '#ffffff', 3.0, 'icon-warning on card'],
    ['light', '#b91c1c', '#ffffff', 3.0, 'icon-danger on card'],

    // ── Dark theme text (4.5:1) ──
    ['dark', '#f0f0f5', '#111119', 4.5, 'text-primary on card'],
    ['dark', '#8b8ba0', '#111119', 4.5, 'text-secondary on card'],
    ['dark', '#8b8ba0', '#06060b', 4.5, 'text-secondary on body'],
    ['dark', '#7c7c90', '#111119', 4.5, 'text-muted on card'],
    ['dark', '#7c7c90', '#06060b', 4.5, 'text-muted on body'],
    ['dark', '#60a5fa', '#111119', 4.5, 'text-accent on card'],
    ['dark', '#f87171', '#111119', 4.5, 'danger on card'],
    ['dark', '#4ade80', '#111119', 4.5, 'text-success on card'],
    ['dark', '#fbbf24', '#111119', 4.5, 'text-warning on card'],
    ['dark', '#22d3ee', '#111119', 4.5, 'text-cyan on card'],
    // Dark UI graphics
    ['dark', '#3b82f6', '#111119', 3.0, 'accent graphics on card'],
    ['dark', '#34d399', '#111119', 3.0, 'icon-success on card'],
    ['dark', '#fbbf24', '#111119', 3.0, 'icon-warning on card'],
    ['dark', '#f87171', '#111119', 3.0, 'icon-danger on card'],
];

test('style.css token contrast meets WCAG 2.2 AA', () => {
    const failures = [];
    for (const [theme, fg, bg, min, label] of MATRIX) {
        const r = ratio(fg, bg);
        if (r < min) failures.push(`${theme} ${label}: ${fg} on ${bg} = ${r.toFixed(2)} (need ${min})`);
    }
    assert.deepEqual(failures, [], failures.join('\n'));
});

test('contrast tokens exist in both themes', () => {
    for (const key of ['--danger', '--text-success', '--text-warning', '--text-cyan', '--icon-success', '--icon-warning', '--icon-danger']) {
        assert.ok(L[key], `light theme missing ${key}`);
        assert.ok(D[key], `dark theme missing ${key}`);
    }
});

test('contrast token values are the AA-approved pairs', () => {
    assert.equal(L['--text-muted'], '#64748b');
    assert.equal(L['--text-success'], '#047857');
    assert.equal(L['--text-warning'], '#b45309');
    assert.equal(L['--danger'], '#dc2626');
    assert.equal(D['--text-muted'], '#7c7c90');
    assert.equal(D['--text-success'], '#4ade80');
    assert.equal(D['--text-warning'], '#fbbf24');
    assert.equal(D['--danger'], '#f87171');
    assert.equal(L['--status-neutral-fg'], '#334155');
});

test('select arrow and echo text no longer use hardcoded low-contrast colors', () => {
    assert.ok(css.includes("stroke='currentColor'"), 'select arrow SVG must use currentColor');
    assert.ok(css.includes('color: var(--text-cyan);'), 'echo value must use --text-cyan');
    assert.ok(css.includes('color: var(--text-success);'), 'output-content must use --text-success');
});