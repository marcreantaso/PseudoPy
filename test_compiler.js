const { PseudocodeCompiler } = require('./compiler.js');
const compiler = new PseudocodeCompiler();
const code = `BEGIN
  // Outer loop for the 'x' axis
  FOR x FROM 1 TO 3 DO

    // Inner loop for the 'y' axis
    FOR y FROM 1 TO 2 DO

      PRINT "x is " + x + ", y is " + y

    END FOR

  END FOR
END`;
const result = compiler.compile(code);
console.log(JSON.stringify(result, null, 2));
