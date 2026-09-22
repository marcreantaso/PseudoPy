/* ============================================================
   ENCODING REGRESSION GATE (mojibake)
   Guards against the CP1252 double-encoding bug that corrupted
   box-drawing characters and punctuation. Flag characters are the
   codepoints whose presence indicates bytes were decoded with the
   wrong charset. index.html and style.css are now clean; this test
   keeps it that way and verifies the fixed characters remain.
   ============================================================ */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FILES = ['index.html', 'style.css', 'dataset.json'];
// Decoded bytes from a CP1252 double-encode: these must never appear.
const FLAGS = new Set([0x00E2, 0x00C3, 0x00C2, 0x00A0, 0x0090, 0xFFFD]);

test('no mojibake flag characters anywhere in the static assets', () => {
    for (const file of FILES) {
        const txt = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
        const hits = [];
        let offset = 0;
        for (const ch of Array.from(txt)) {
            const cp = ch.codePointAt(0);
            if (FLAGS.has(cp)) hits.push(`U+${cp.toString(16).toUpperCase().padStart(4, '0')} at offset ${offset} (${JSON.stringify(ch)})`);
            offset += ch.length;
        }
        assert.deepEqual(hits, [], `${file} contains mojibake residues:\n${hits.join('\n')}`);
    }
});

test('fixed box-drawing and punctuation characters are present', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(html.includes('\u2550'), 'index.html must still use ═ banner rules');
    assert.ok(html.includes('\u2500'), 'index.html must still use ─ separators');
    assert.ok(html.includes('\u2014'), 'index.html em dashes must remain as real U+2014');
    const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
    assert.ok(css.includes('\u2550'), 'style.css ═ comments must remain real');
    assert.ok(!html.includes('mojibake-fix'), 'no dev artifacts in index.html');
});