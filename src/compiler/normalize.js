function normalizeUnicodeOperators(source) {
  if (source == null) return source;
  let s = String(source);
  const map = {
    '\u2265': '>=',
    '\u2264': '<=',
    '\u2260': '!=',
    '\u2261': '==',
    '\u00D7': '*',
    '\u2715': '*',
    '\u22C5': '*',
    '\u00F7': '/',
    '\u2011': '-',
    '\u2212': '-',
    '\u2013': '-',
    '\u2014': '-',
    '\u2190': '=',
    '\u2254': '=',
    '\u2192': '->'
  };
  for (const k of Object.keys(map)) {
    if (s.indexOf(k) !== -1) s = s.split(k).join(map[k]);
  }
  return s;
}
function normalizeLineNumbers(source) {
  if (!source) return source;
  let out = '';
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const m = line.match(/^\s*(\d+(?:\.\d*)?(?:[):])?)\s+(?=[A-Za-z_])/);
    if (m) { line = line.slice(m[0].length); }
    else {
      const m2 = line.match(/^\s*(\d+)\s*$/);
      if (m2) line = line.slice(m2[0].length);
    }
    out += line;
    if (i < lines.length - 1) out += '\n';
  }
  return out;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeUnicodeOperators, normalizeLineNumbers };
}
if (typeof window !== 'undefined') {
  window.normalizeUnicodeOperators = normalizeUnicodeOperators;
  window.normalizeLineNumbers = normalizeLineNumbers;
}
