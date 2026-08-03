#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TARGET_FILE = path.resolve(__dirname, 'app.js');
const ALLOWED_HELPERS = ['$id', '$qs', '$qsa'];
const RAW_DOM_PATTERNS = [
  /document\.getElementById\b/g,
  /document\.querySelectorAll\b/g,
  /document\.querySelector\b/g,
];

function sanitizeCode(code) {
  let result = '';
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const next = code[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        result += ch;
      } else {
        result += ' ';
      }
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        result += '  ';
        inBlockComment = false;
        i += 1;
      } else {
        result += ' ';
      }
      continue;
    }

    if (inSingle) {
      if (escaped) {
        escaped = false;
        result += ' ';
      } else if (ch === '\\') {
        escaped = true;
        result += ' ';
      } else if (ch === "'") {
        inSingle = false;
        result += ' ';
      } else {
        result += ' ';
      }
      continue;
    }

    if (inDouble) {
      if (escaped) {
        escaped = false;
        result += ' ';
      } else if (ch === '\\') {
        escaped = true;
        result += ' ';
      } else if (ch === '"') {
        inDouble = false;
        result += ' ';
      } else {
        result += ' ';
      }
      continue;
    }

    if (inTemplate) {
      if (escaped) {
        escaped = false;
        result += ' ';
      } else if (ch === '\\') {
        escaped = true;
        result += ' ';
      } else if (ch === '`') {
        inTemplate = false;
        result += ' ';
      } else {
        result += ' ';
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      result += '  ';
      i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      result += '  ';
      i += 1;
      continue;
    }

    if (ch === "'") {
      inSingle = true;
      result += ' ';
      continue;
    }

    if (ch === '"') {
      inDouble = true;
      result += ' ';
      continue;
    }

    if (ch === '`') {
      inTemplate = true;
      result += ' ';
      continue;
    }

    result += ch;
  }

  return result;
}

function computeLineOffsets(code) {
  const offsets = [0];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '\n') offsets.push(i + 1);
  }
  return offsets;
}

function offsetToLine(offset, offsets) {
  let low = 0;
  let high = offsets.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (offset < offsets[mid]) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return Math.max(1, high + 1);
}

function findHelperRanges(code) {
  const sanitized = sanitizeCode(code);
  const helperRanges = [];
  const helperRegex = /function\s+\$(id|qs|qsa)\s*\([^)]*\)\s*\{/g;
  let match;

  while ((match = helperRegex.exec(sanitized)) !== null) {
    const startOffset = match.index;
    let braceCount = 0;
    let cursor = match.index;
    let foundStartBrace = false;

    while (cursor < sanitized.length) {
      const ch = sanitized[cursor];
      if (ch === '{') {
        braceCount += 1;
        foundStartBrace = true;
      }
      if (ch === '}') {
        braceCount -= 1;
      }
      cursor += 1;
      if (foundStartBrace && braceCount === 0) {
        helperRanges.push({ start: startOffset, end: cursor });
        break;
      }
    }
  }

  return helperRanges;
}

function isInAllowedHelper(lineNumber, helperRanges, lineOffsets) {
  const lineStart = lineOffsets[lineNumber - 1];
  const lineEnd = lineNumber < lineOffsets.length ? lineOffsets[lineNumber] - 1 : Infinity;

  return helperRanges.some(range => {
    const startLine = offsetToLine(range.start, lineOffsets);
    const endLine = offsetToLine(range.end, lineOffsets);
    return lineNumber >= startLine && lineNumber <= endLine;
  });
}

function findViolations(code) {
  const sanitized = sanitizeCode(code);
  const lines = sanitized.split(/\r?\n/);
  const lineOffsets = computeLineOffsets(code);
  const helperRanges = findHelperRanges(code);
  const violations = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    for (const pattern of RAW_DOM_PATTERNS) {
      let match;
      const clone = new RegExp(pattern.source, 'g');
      while ((match = clone.exec(line)) !== null) {
        const lineNumber = lineIndex + 1;
        if (!isInAllowedHelper(lineNumber, helperRanges, lineOffsets)) {
          violations.push({
            line: lineNumber,
            text: match[0],
          });
        }
      }
    }
  }

  return { violations, helperRanges, helperCount: helperRanges.length };
}

function checkSyntax(code) {
  try {
    new vm.Script(code);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: {
        message: error.message,
        line: error.lineNumber || null,
        column: error.columnNumber || null,
      },
    };
  }
}

function verifyAppJs(filePath = TARGET_FILE) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    return { status: 'FAIL', error: 'app.js not found', filePath: resolved };
  }

  let code;
  try {
    code = fs.readFileSync(resolved, 'utf8');
  } catch (err) {
    return { status: 'FAIL', error: 'Cannot read app.js', details: err.message, filePath: resolved };
  }

  const syntax = checkSyntax(code);
  if (!syntax.valid) {
    return { status: 'FAIL', error: 'Syntax error in app.js', diagnostics: syntax.error, filePath: resolved };
  }

  const { violations, helperRanges, helperCount } = findViolations(code);
  const helperNames = ALLOWED_HELPERS;

  if (helperCount < helperNames.length) {
    return {
      status: 'FAIL',
      error: 'Missing helper wrapper definitions',
      expectedHelpers: helperNames,
      foundHelperCount: helperCount,
      filePath: resolved,
    };
  }

  if (violations.length > 0) {
    return {
      status: 'FAIL',
      error: 'Direct DOM access violations found outside allowed helpers',
      violations,
      filePath: resolved,
    };
  }

  return {
    status: 'PASS',
    message: 'app.js refactor consistency verified. All direct DOM operations are delegated to helpers.',
    helperCount,
    filePath: resolved,
  };
}

function printReport(result) {
  console.log('=== app.js Refactor Verification ===');
  console.log(`File: ${result.filePath}`);
  console.log(`Status: ${result.status}`);

  if (result.status === 'PASS') {
    console.log(result.message);
    console.log(`Allowed helper wrappers found: ${result.helperCount}`);
    return;
  }

  if (result.error) {
    console.log(`Error: ${result.error}`);
  }

  if (result.diagnostics) {
    console.log('Syntax diagnostics:');
    console.log(`  ${result.diagnostics.message}`);
    if (result.diagnostics.line != null) {
      console.log(`  Line: ${result.diagnostics.line}, Column: ${result.diagnostics.column}`);
    }
  }

  if (result.expectedHelpers) {
    console.log(`Expected helpers: ${result.expectedHelpers.join(', ')}`);
    console.log(`Found helper count: ${result.foundHelperCount}`);
  }

  if (result.violations && result.violations.length > 0) {
    console.log('Violations:');
    for (const violation of result.violations) {
      console.log(`  Line ${violation.line}: ${violation.text}`);
    }
  }
}

if (require.main === module) {
  const target = process.argv[2] || TARGET_FILE;
  const result = verifyAppJs(target);
  printReport(result);
  process.exit(result.status === 'PASS' ? 0 : 1);
}

module.exports = {
  verifyAppJs,
  sanitizeCode,
  findHelperRanges,
  findViolations,
  checkSyntax,
};
