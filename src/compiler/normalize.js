// Research/devtools normalizer. Reuses the single shared SYMBOL_MAP
// (LANGUAGE_SPEC.unicodeNormalizations) instead of carrying its own copy. This
// file is not part of any bundle; it is loaded directly by tests and any
// standalone research page.
function _symbolMap() {
  if (typeof LANGUAGE_SPEC !== 'undefined' && LANGUAGE_SPEC.unicodeNormalizations) return LANGUAGE_SPEC.unicodeNormalizations;
  if (typeof require === 'function') {
    try { return require('./language-spec.js').SYMBOL_MAP; } catch (e) { /* fall through */ }
  }
  return null;
}
function normalizeUnicodeOperators(source) {
  if (source == null) return source;
  let s = String(source);
  const map = _symbolMap();
  if (!map) return s;
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
  module.exports = { normalizeUnicodeOperators, normalizeLineNumbers, symbolMap: _symbolMap };
}
if (typeof window !== 'undefined') {
  window.normalizeUnicodeOperators = normalizeUnicodeOperators;
  window.normalizeLineNumbers = normalizeLineNumbers;
}
