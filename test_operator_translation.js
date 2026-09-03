const assert = require('assert');
const { PseudocodeCompiler } = require('./compiler.js');

const source = `BEGIN
DECLARE score AS INTEGER
SET score TO 95
IF score \u2265 90 THEN
PRINT "A"
ELSE IF score \u2264 80 THEN
PRINT "B"
ELSE IF score \u2260 0 THEN
PRINT "C"
ENDIF
END`;

const result = new PseudocodeCompiler().compile(source);

assert.strictEqual(result.valid, true, JSON.stringify(result.errors));
assert.match(result.python, /if score >= 90:/);
assert.match(result.python, /elif score <= 80:/);
assert.match(result.python, /elif score != 0:/);
assert.doesNotMatch(result.python, /[\u2265\u2264\u2260]/);

console.log('Unicode operator translation passed.');