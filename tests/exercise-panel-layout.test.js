const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('exercise instruction panel remains in document flow', () => {
  const index = read('index.html');
  const style = read('style.css');
  const marker = index.indexOf('id="active-exercise-panel"');
  assert.notEqual(marker, -1);
  const panel = index.slice(marker, marker + 500);
  assert.match(panel, /position: relative/);
  assert.doesNotMatch(panel, /position: sticky/);
  assert.match(style, /#active-exercise-panel\s*\{[\s\S]*position: relative !important/);
  assert.match(style, /@media \(max-width: 700px\)/);
});
