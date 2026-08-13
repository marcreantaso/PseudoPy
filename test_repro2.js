const fs = require('fs');
const appJsContent = fs.readFileSync('c:/Users/Mark Bautista/Pseudocode-to-Python/app.js', 'utf8');

// A crude way to extract validatePseudocode and KNOWN_KEYWORDS
// We'll wrap it in a function and run the code.
const env = {};
const script = `
    const KNOWN_KEYWORDS = ['START', 'BEGIN', 'END', 'IF', 'THEN', 'ELSE', 'FOR', 'WHILE', 'PRINT', 'INPUT'];
    const currentErrorLineNumbers = [];
    ${appJsContent.substring(appJsContent.indexOf('function preprocessPseudocode(code)'), appJsContent.indexOf('function renderHtmlErrors(errors)'))}
    
    module.exports = validatePseudocode;
`;
fs.writeFileSync('c:/Users/Mark Bautista/Pseudocode-to-Python/validate_test.js', script);
