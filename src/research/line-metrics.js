const MetricsCore = {
  normalizeCode(code) {
    if (!code) return '';
    return code
      .split('\n')
      .map(line => line.replace(/\t/g, '    '))
      .map(line => {
        let stripped = line.replace(/#.*$/, '').trimEnd();
        const match = stripped.match(/^(\s*)(.*)/);
        if (!match) return stripped;
        const [, leading, rest] = match;
        const spaces = leading.length;
        const normalSpaces = Math.round(spaces / 4) * 4;
        return ' '.repeat(normalSpaces) + rest;
      })
      .filter(line => line.trim().length > 0)
      .join('\n')
      .trimEnd();
  },

  lineMetrics(gen, exp) {
    const normGen = this.normalizeCode(gen || '');
    const normExp = this.normalizeCode(exp || '');
    const g = normGen ? normGen.split('\n') : [];
    const e = normExp ? normExp.split('\n') : [];
    if (g.length === 0 && e.length === 0) {
      return { precision: 1, recall: 1, f1: 1, matched: 0, genLines: 0, expLines: 0 };
    }
    if (g.length === 0 || e.length === 0) {
      return { precision: 0, recall: 0, f1: 0, matched: 0, genLines: g.length, expLines: e.length };
    }
    const ef = {};
    const gf = {};
    for (const x of e) ef[x] = (ef[x] || 0) + 1;
    for (const x of g) gf[x] = (gf[x] || 0) + 1;
    let matched = 0;
    for (const k in gf) {
      if (ef[k]) matched += Math.min(gf[k], ef[k]);
    }
    const precision = matched / g.length;
    const recall = matched / e.length;
    const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    return { precision, recall, f1, matched, genLines: g.length, expLines: e.length };
  }
};
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MetricsCore;
}
if (typeof window !== 'undefined') {
  window.MetricsCore = MetricsCore;
}