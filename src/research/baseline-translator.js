function baselineTranslate(source) {
  if (source == null) source = '';
  let s = String(source);
  const lines = s.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let indent = 0;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    line = line.replace(/^\s*(\d+(?:\.\d*)?(?:[):])?)\s+(?=[A-Za-z_])/, '');
    line = line.replace(/^\s*(\d+)\s*$/, '');
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#') || t.startsWith('//')) {
      out.push('    '.repeat(indent) + t);
      continue;
    }
    const up = t.toUpperCase();
    if (up === 'BEGIN' || up === 'START') { continue; }
    if (up === 'END' || up === 'END.') {
      if (indent > 0) indent--;
      continue;
    }
    if (up.startsWith('END IF') || up === 'ENDIF') { if (indent > 0) indent--; continue; }
    if (up.startsWith('END WHILE') || up === 'ENDWHILE') { if (indent > 0) indent--; continue; }
    if (up.startsWith('END FOR') || up === 'ENDFOR') { if (indent > 0) indent--; continue; }
    if (up.startsWith('END FUNCTION') || up.startsWith('END PROCEDURE') || up === 'ENDFUNCTION' || up === 'ENDPROCEDURE') { if (indent > 0) indent--; continue; }
    if (up.startsWith('ELSE IF')) { out.push('    '.repeat(Math.max(0, indent - 1)) + 'elif ' + t.slice(7).replace(/\bTHEN\b/i, '') + ':'); continue; }
    if (up.startsWith('ELSE')) { out.push('    '.repeat(Math.max(0, indent - 1)) + 'else:'); continue; }
    if (up.startsWith('IF ')) {
      let cond = t.slice(2);
      cond = cond.replace(/\bTHEN\b/i, '');
      out.push('    '.repeat(indent) + 'if ' + cond.trim() + ':');
      indent++;
      continue;
    }
    if (up.startsWith('WHILE ')) {
      let cond = t.slice(6);
      cond = cond.replace(/\bDO\b/i, '');
      out.push('    '.repeat(indent) + 'while ' + cond.trim() + ':');
      indent++;
      continue;
    }
    if (up.startsWith('FOR EACH ')) {
      const m = t.match(/FOR\s+EACH\s+([A-Za-z_][A-Za-z0-9_]*)\s+IN\s+(.+?)\s+DO\b/i);
      if (m) { out.push('    '.repeat(indent) + 'for ' + m[1] + ' in ' + m[2] + ':'); indent++; continue; }
    }
    if (up.startsWith('FOR ')) {
      const m = t.match(/FOR\s+([A-Za-z_][A-Za-z0-9_]*)\s+FROM\s+(.+?)\s+TO\s+(.+?)(?:\s+STEP\s+(.+?))?\s+DO\b/i);
      if (m) {
        const start = (m[2] || '').trim();
        const end = (m[3] || '').trim();
        const step = (m[4] || '').trim();
        let startv = start, stopv = end, stepv = step || '1';
        try {
          const sv = parseFloat(start), ev = parseFloat(end), stv = step ? parseFloat(step) : 1;
          if (!isNaN(sv) && !isNaN(ev)) {
            if (stv <= 0) { stepv = '1'; }
            if (stv > 0) {
              if (sv <= ev) stopv = String(Math.floor(ev - sv) / stv >= 0 ? ev + 1 : ev);
              else stopv = String(ev);
            } else {
              if (sv >= ev) stopv = String(ev - 1);
              else stopv = String(ev);
            }
          }
        } catch (e) {}
        const rangeArgs = (stepv && stepv !== '1' && stepv !== '1.0') ? (startv + ',' + stopv + ',' + stepv) : (startv + ',' + stopv);
        out.push('    '.repeat(indent) + 'for ' + m[1] + ' in range(' + rangeArgs + '):');
        indent++;
        continue;
      }
    }
    if (up.startsWith('FUNCTION ') || up.startsWith('PROCEDURE ')) {
      const m = t.match(/(FUNCTION|PROCEDURE)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/i);
      if (m) { out.push('    '.repeat(indent) + 'def ' + m[2] + '(' + m[3].replace(/\s+/g, '') + '):'); indent++; continue; }
      const m2 = t.match(/(FUNCTION|PROCEDURE)\s+([A-Za-z_][A-Za-z0-9_]+)/i);
      if (m2) { out.push('    '.repeat(indent) + 'def ' + m2[2] + '():'); indent++; continue; }
    }
    if (up.startsWith('RETURN')) { out.push('    '.repeat(indent) + t.replace(/\bRETURN\b/i, 'return')); continue; }
    if (up.startsWith('CALL ')) { out.push('    '.repeat(indent) + t.replace(/\bCALL\b/i, '')); continue; }
    if (up.startsWith('DISPLAY') || up.startsWith('PRINT') || up.startsWith('OUTPUT')) { out.push('    '.repeat(indent) + 'print(' + t.replace(/^(DISPLAY|PRINT|OUTPUT)\s*/i, '') + ')'); continue; }
    if (up.startsWith('INPUT') || up.startsWith('READ')) {
      const m = t.match(/(INPUT|READ)(?:\s+WITH\s+PROMPT\s+(.+?))?\s+([A-Za-z_][A-Za-z0-9_]*)/i);
      if (m) { out.push('    '.repeat(indent) + m[3] + ' = input(' + (m[2] || '') + ')'); continue; }
    }
    if (up.startsWith('DECLARE ')) { out.push('    '.repeat(indent) + '# ' + t); continue; }
    if (up.startsWith('SET ')) { out.push('    '.repeat(indent) + t.replace(/\bSET\b/i, '').replace(/\bTO\b/i, '=')); continue; }
    if (up.startsWith('END ')) { if (indent > 0) indent--; continue; }
    out.push('    '.repeat(indent) + t);
  }
  const generatedPython = out.join('\n');
  return { generatedPython, success: true, syntaxSuccess: null, runtimeSuccess: null, translatorId: 'baseline-direct', translatorVersion: '0.1.1' };
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { baselineTranslate }; }
if (typeof window !== 'undefined') { window.baselineTranslate = baselineTranslate; }