const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('system UI sources contain no emoji, including BMP symbols missed by range scans', () => {
    const emoji = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F]/u;
    for (const file of ['index.html', 'app.js', 'devtools.js', 'style.css', 'ui-icons.css']) {
        const lines = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r/g, '').split('\n');
        const matches = lines.flatMap((line, i) => emoji.test(line) ? [`${file}:${i + 1}`] : []);
        assert.deepEqual(matches, [], 'Replace system emoji with a local UI icon');
    }
});

test('every static and dynamic icon token has a bundled SVG definition', () => {
    const source = fs.readFileSync(path.join(root, 'ui-icons.js'), 'utf8').replace(/\r/g, '');
    const line = source.split('\n').find(line => line.startsWith('    const definitions = '));
    const definitions = JSON.parse(line.slice('    const definitions = '.length, -1));
    for (const file of ['index.html', 'app.js', 'devtools.js']) {
        const text = fs.readFileSync(path.join(root, file), 'utf8');
        for (const match of text.matchAll(/\{\{ui:([A-Za-z][A-Za-z0-9]*)\}\}/g)) {
            assert.equal(definitions[match[1]]?.[0], 'svg', `${file}: missing ${match[1]}`);
        }
    }
});
