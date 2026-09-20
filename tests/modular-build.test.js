const test = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('../scripts/build');

test('deployable browser bundles match the validated feature sources', () => {
    assert.deepEqual(build({ check: true }), ['app.js', 'compiler.js', 'database.js', 'devtools.js']);
});
