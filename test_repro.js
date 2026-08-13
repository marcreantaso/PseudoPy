const { PseudocodeCompiler } = require('./compiler.js');

const compiler = new PseudocodeCompiler();
const pseudocode = `BEGIN
INPUT number
IF number > 0 THEN
    PRINT "Positive Number"
ELSE IF number < 0 THEN
    PRINT "Negative Number"
ELSE
    PRINT "Zero"
ENDIF
END`;

try {
    const result = compiler.compile(pseudocode);
    console.log(JSON.stringify(result, null, 2));
} catch (e) {
    console.error("Crash:", e);
}
