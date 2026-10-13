const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const bundles = require('../src/bundles.json');

const TARGETS = ['app.js', 'compiler.js', 'database.js', 'devtools.js'];

test('bundle manifest declares exactly the deployable targets', () => {
    assert.deepEqual(Object.keys(bundles).sort(), [...TARGETS].sort());
});

test('every bundle source exists under src/ and is non-empty', () => {
    for (const [target, sources] of Object.entries(bundles)) {
        assert.ok(Array.isArray(sources) && sources.length > 0, `${target} has no sources`);
        for (const source of sources) {
            assert.ok(source.startsWith('src/'), `${target}: ${source} is outside src/`);
            assert.ok(fs.existsSync(path.join(root, source)), `${target}: missing source ${source}`);
            assert.ok(read(source).length > 0, `${target}: empty source ${source}`);
        }
    }
});

test('a source file belongs to exactly one bundle', () => {
    const owner = {};
    const duplicates = [];
    for (const [target, sources] of Object.entries(bundles)) {
        for (const source of sources) {
            if (owner[source]) duplicates.push(`${source} (${owner[source]} and ${target})`);
            owner[source] = target;
        }
    }
    assert.deepEqual(duplicates, [], `sources concatenated into multiple bundles:\n${duplicates.join('\n')}`);
});

test('browser sources stay classic scripts (no ES module syntax)', () => {
    // The bundler concatenates plain scripts sharing one lexical scope. An
    // import/export statement would fail at runtime once concatenated.
    const esm = /^\s*(?:import|export)\b/m;
    for (const [target, sources] of Object.entries(bundles)) {
        for (const source of sources) {
            assert.ok(!esm.test(read(source)), `${source} uses ES module syntax but is concatenated into ${target}`);
        }
    }
});

test('generated bundle outputs exist for every target', () => {
    for (const target of TARGETS) {
        assert.ok(fs.existsSync(path.join(root, target)), `missing generated bundle ${target}`);
    }
});
