/* ============================================================
   SOP 2 — report rendering (CSV + Markdown), shared

   One implementation used by both the Node harness
   (src/research/sop2-comparison.js) and the DevTools panel
   (src/devtools/research-ui.js), so an exported file and the
   on-screen report can never drift apart.

   Usable from Node (`module.exports = Sop2Report`) and the browser
   (`window.Sop2Report`).
   ============================================================ */
(function (root) {
  'use strict';

  // Resolve dependencies from the browser globals or Node's require.
  function tryRequire(m) { try { return require(m); } catch (e) { return null; } }
  function resolve(globalName, modulePath) {
    if (root && root[globalName]) return root[globalName];
    if (typeof require === 'function') return tryRequire(modulePath);
    return null;
  }
  var Stats = resolve('Sop2Stats', './stats');
  var Taxonomy = resolve('Sop2Taxonomy', './error-taxonomy');

  var SIDE_KEYS = ['pseudopy', 'baseline', 'baselineB2'];
  var SIDE_LABELS = {
    pseudopy: 'PseudoPy',
    baseline: 'Baseline B1 (naive)',
    baselineB2: 'Baseline B2 (rule-based)'
  };

  var CSV_COLUMNS = [
    'caseId', 'title',
    'pp_compile', 'pp_syntax', 'pp_runtime', 'pp_p', 'pp_r', 'pp_f1', 'pp_time_ms',
    'bl_compile', 'bl_syntax', 'bl_runtime', 'bl_p', 'bl_r', 'bl_f1', 'bl_time_ms',
    'group', 'injection_type',
    'pp_class', 'pp_rejected', 'pp_outmatch', 'pp_correct', 'pp_silent', 'pp_f1_norm',
    'bl2_compile', 'bl2_class', 'bl2_rejected', 'bl2_outmatch', 'bl2_silent', 'bl2_time_ms'
  ];

  function flag(v) { return v === true ? '1' : v === false ? '0' : ''; }

  function csvCell(v) {
    let s = v == null ? '' : String(v);
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return s;
  }

  function isSilent(side) {
    if (!side) return false;
    if (Taxonomy && Taxonomy.isSilentFailure) return Taxonomy.isSilentFailure(side.class, side.hasWarning);
    return false;
  }

  function toCSV(doc) {
    const results = Array.isArray(doc) ? doc : (doc && doc.results) || [];
    const lines = [CSV_COLUMNS.join(',')];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const pp = r.pseudopy || {};
      const bl = r.baseline || {};
      const b2 = r.baselineB2 || {};
      const ppM = (r.metrics && r.metrics.pseudopy) || {};
      const blM = (r.metrics && r.metrics.baseline) || {};
      const ppN = ppM.normalized || {};
      lines.push([
        r.caseId, r.title,
        flag(pp.compileSuccess), flag(pp.syntaxSuccess), flag(pp.runtimeSuccess),
        ppM.precision, ppM.recall, ppM.f1, pp.generationTimeMs,
        flag(bl.compileSuccess), flag(bl.syntaxSuccess), flag(bl.runtimeSuccess),
        blM.precision, blM.recall, blM.f1, bl.generationTimeMs,
        r.group, r.injectionType,
        pp.class, flag(pp.rejected), flag(pp.outputMatches), flag(pp.correct),
        flag(isSilent(pp)), ppN.f1,
        flag(b2.compileSuccess), b2.class, flag(b2.rejected),
        flag(b2.outputMatches), flag(isSilent(b2)),
        b2.generationTimeMs
      ].map(csvCell).join(','));
    }
    return lines.join('\n') + '\n';
  }

  function toJSON(doc) {
    return JSON.stringify(doc, null, 2) + '\n';
  }

  function round3(n) { return Math.round(n * 1000) / 1000; }
  function pct(x) { return x == null ? 'n/a' : (x * 100).toFixed(1) + '%'; }
  function f3(x) { return typeof x === 'number' ? x.toFixed(3) : 'n/a'; }

  function medianOf(rows, key) {
    return Stats ? Stats.median(rows.map(function (r) { return r[key].generationTimeMs; })) : 0;
  }
  function iqrOf(rows, key) {
    return Stats ? Stats.iqr(rows.map(function (r) { return r[key].generationTimeMs; })) : 0;
  }

  function verdictText(doc) {
    const rows = doc.results.filter(function (r) { return r.group === 'seed' || r.group === 'holdout'; });
    const n = rows.length;
    const pp = rows.filter(function (r) { return r.pseudopy.correct; }).length;
    const b1 = rows.filter(function (r) { return r.baseline.correct; }).length;
    const b2 = rows.filter(function (r) { return r.baselineB2.correct; }).length;
    const ppTime = medianOf(rows, 'pseudopy');
    const b1Time = medianOf(rows, 'baseline');
    const overhead = ppTime - b1Time;
    const inj = doc.groups && doc.groups.injected;
    const injDetected = inj ? inj.pseudopy.rejected : 0;
    const injN = inj ? inj.cases : 0;

    const out = [];
    out.push('On well-formed input (' + n + ' cases) PseudoPy produced the reference output in ' + pp +
      ' cases, B1 in ' + b1 + ', and B2 in ' + b2 + '.');
    if (inj) {
      out.push('On ' + injN + ' deliberately broken cases PseudoPy warned (rejected) in ' + injDetected +
        '; B2 warned in 0 because it has no validation.');
    }
    if (n && ppTime > b1Time) {
      out.push('PseudoPy is slower than the naive baseline: it adds about ' + round3(overhead) +
        ' ms of analysis+validation overhead per translation (median ' + round3(ppTime) + ' ms vs ' +
        round3(b1Time) + ' ms). SOP 2c as originally worded is not supported by this data; the honest ' +
        'statement is a small absolute cost per translation.');
    } else if (n) {
      out.push('PseudoPy was not slower than the naive baseline on this machine (median ' +
        round3(ppTime) + ' ms vs ' + round3(b1Time) + ' ms).');
    }
    if (n && b2 >= pp) {
      out.push('A careful rule-based baseline (B2) matches or exceeds PseudoPy on well-formed input, so ' +
        'the correctness advantage on well-formed input is not established by this dataset; the ' +
        'difference that does survive is error detection on malformed input.');
    }
    return out.join(' ');
  }

  function toMarkdown(doc) {
    const L = [];
    L.push('# SOP 2 — Traditional Baseline vs PseudoPy');
    L.push('');
    L.push('Generated ' + doc.metadata.timestamp + ' · ' + doc.metadata.cases + ' cases · ' +
      'correctness = stdout equality against the reference program (shared ' + doc.metadata.runtime + ' runtime).');
    L.push('');
    L.push('Baselines: **B1** naive keyword substitution · **B2** reasonable rule-based (no CFG/AST/semantic validation).');
    L.push('');
    if (doc.metadata.setup) {
      L.push('One-time setup (bundle load + VM + compiler construction): ' +
        round3(doc.metadata.setup.setupMs) + ' ms — excluded from per-case timing.');
      L.push('');
    }
    L.push('## SOP 2a — Functional correctness');
    L.push('');
    L.push('| Group | Cases | PseudoPy | Baseline B1 | Baseline B2 | Δ pp (PP−B1) | Relative (PP vs B1) |');
    L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    ['seed', 'holdout', 'injected'].forEach(function (g) {
      const s = doc.groups && doc.groups[g];
      if (!s) return;
      const pp = s.pseudopy.correctnessRate, b1 = s.baseline.correctnessRate;
      const rel = b1 > 0 ? ((pp - b1) / b1) * 100 : null;
      L.push('| ' + g + ' | ' + s.cases + ' | ' + pct(pp) + ' | ' + pct(b1) + ' | ' +
        pct(s.baselineB2.correctnessRate) + ' | ' + ((pp - b1) * 100).toFixed(1) + ' | ' +
        (rel == null ? 'n/a' : rel.toFixed(1) + '%') + ' |');
    });
    L.push('');
    L.push('## SOP 2b — Error taxonomy');
    L.push('');
    ['seed', 'holdout', 'injected'].forEach(function (g) {
      const s = doc.groups && doc.groups[g];
      if (!s) return;
      L.push('### ' + g + ' (' + s.cases + ' cases)');
      L.push('');
      L.push('| Translator | Correct | Rejected (warned) | Syntax err | Runtime err | Wrong output | Silent failures |');
      L.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
      SIDE_KEYS.forEach(function (k) {
        const x = s[k];
        L.push('| ' + SIDE_LABELS[k] + ' | ' + x.correct + ' | ' + x.rejected + ' | ' +
          x.counts.syntax_error + ' | ' + x.counts.runtime_error + ' | ' + x.counts.wrong_output + ' | ' +
          x.silentFailures + ' (' + pct(x.silentFailureRate) + ') |');
      });
      L.push('');
    });
    L.push('## SOP 2c — Generation time (translation only)');
    L.push('');
    L.push('| Group | PseudoPy median (IQR) | B1 median (IQR) | B2 median (IQR) | Overhead vs B1 |');
    L.push('| --- | ---: | ---: | ---: | ---: |');
    ['seed', 'holdout', 'injected'].forEach(function (g) {
      const rows = doc.results.filter(function (r) { return r.group === g; });
      if (!rows.length) return;
      function cell(key) { return round3(medianOf(rows, key)) + ' (' + round3(iqrOf(rows, key)) + ')'; }
      L.push('| ' + g + ' | ' + cell('pseudopy') + ' | ' + cell('baseline') + ' | ' + cell('baselineB2') + ' | ' +
        round3(medianOf(rows, 'pseudopy') - medianOf(rows, 'baseline')) + ' ms |');
    });
    L.push('');
    L.push('## Statistics');
    L.push('');
    ['seed', 'holdout', 'injected'].forEach(function (g) {
      const st = doc.stats && doc.stats[g];
      if (!st) return;
      L.push('### ' + g);
      L.push('');
      SIDE_KEYS.forEach(function (k) {
        const w = st[k].wilson;
        L.push('- ' + SIDE_LABELS[k] + ' correctness: ' + pct(w.p) + ' (95% CI ' + pct(w.low) + '–' +
          pct(w.high) + ', n=' + w.n + ')');
      });
      L.push('- McNemar (correct) PseudoPy vs B1: b=' + st.mcnemar.vsB1.b + ', c=' + st.mcnemar.vsB1.c +
        ', p=' + f3(st.mcnemar.vsB1.p));
      L.push('- McNemar (correct) PseudoPy vs B2: b=' + st.mcnemar.vsB2.b + ', c=' + st.mcnemar.vsB2.c +
        ', p=' + f3(st.mcnemar.vsB2.p));
      L.push('- Wilcoxon (time) PseudoPy − B1: n=' + st.wilcoxonTime.vsB1.n + ', p=' +
        f3(st.wilcoxonTime.vsB1.p) + ' (' + st.wilcoxonTime.vsB1.method + ')');
      L.push('- Wilcoxon (time) PseudoPy − B2: n=' + st.wilcoxonTime.vsB2.n + ', p=' +
        f3(st.wilcoxonTime.vsB2.p) + ' (' + st.wilcoxonTime.vsB2.method + ')');
      L.push('');
    });
    L.push('## Verdict');
    L.push('');
    L.push(verdictText(doc));
    L.push('');
    if (doc.dataset && doc.dataset.skippedInjections && doc.dataset.skippedInjections.length) {
      L.push('Injection variants skipped (target construct absent): ' + doc.dataset.skippedInjections.length + '.');
      L.push('');
    }
    return L.join('\n');
  }

  function round6(n) { return Math.round(n * 1e6) / 1e6; }

  function average(values) {
    if (!values.length) return 0;
    let total = 0;
    for (let i = 0; i < values.length; i++) total += values[i];
    return total / values.length;
  }

  function sideSummary(results, key) {
    const rows = results.map(function (r) { return r[key]; });
    const mets = results.map(function (r) { return r.metrics[key]; });
    const classes = rows.map(function (r) { return { class: r.class, hasWarning: r.hasWarning }; });
    const tax = (Taxonomy && Taxonomy.summarize)
      ? Taxonomy.summarize(classes)
      : { correct: 0, rejected: 0, silentFailures: 0, correctnessRate: 0, silentFailureRate: 0, syntaxErrorRate: 0, runtimeErrorRate: 0, wrongOutputRate: 0, counts: {} };
    return {
      cases: rows.length,
      compileSuccess: rows.filter(function (r) { return r.compileSuccess; }).length,
      syntaxSuccess: rows.filter(function (r) { return r.syntaxSuccess === true; }).length,
      runtimeSuccess: rows.filter(function (r) { return r.runtimeSuccess === true; }).length,
      correct: tax.correct,
      rejected: tax.rejected,
      silentFailures: tax.silentFailures,
      correctnessRate: round6(tax.correctnessRate),
      silentFailureRate: round6(tax.silentFailureRate),
      syntaxErrorRate: round6(tax.syntaxErrorRate),
      runtimeErrorRate: round6(tax.runtimeErrorRate),
      wrongOutputRate: round6(tax.wrongOutputRate),
      counts: tax.counts,
      avgPrecision: round6(average(mets.map(function (m) { return m.precision; }))),
      avgRecall: round6(average(mets.map(function (m) { return m.recall; }))),
      avgF1: round6(average(mets.map(function (m) { return m.f1; }))),
      avgF1Normalized: round6(average(mets.map(function (m) { return m.normalized ? m.normalized.f1 : m.f1; }))),
      avgGenerationTimeMs: Math.round(average(rows.map(function (r) { return r.generationTimeMs; })) * 1000) / 1000
    };
  }

  function summarize(results) {
    const out = { cases: results.length };
    SIDE_KEYS.forEach(function (key) { out[key] = sideSummary(results, key); });
    return out;
  }

  function summarizeGroups(results) {
    const groups = {};
    ['seed', 'holdout', 'injected'].forEach(function (g) {
      const rows = results.filter(function (r) { return r.group === g; });
      groups[g] = rows.length ? summarize(rows) : null;
    });
    return groups;
  }

  function computeStats(results) {
    const out = {};
    if (!Stats) return out;
    ['seed', 'holdout', 'injected'].forEach(function (g) {
      const rows = results.filter(function (r) { return r.group === g; });
      if (!rows.length) return;
      const stats = {};
      SIDE_KEYS.forEach(function (key) {
        const successes = rows.filter(function (r) { return r[key].correct; }).length;
        stats[key] = { wilson: Stats.wilson(successes, rows.length) };
      });
      function mcnemar(baseKey) {
        let b = 0, c = 0;
        rows.forEach(function (r) {
          const pp = r.pseudopy.correct, bl = r[baseKey].correct;
          if (pp && !bl) b++;
          else if (!pp && bl) c++;
        });
        return Stats.mcnemarExact(b, c);
      }
      stats.mcnemar = { vsB1: mcnemar('baseline'), vsB2: mcnemar('baselineB2') };
      stats.wilcoxonTime = {
        vsB1: Stats.wilcoxon(rows.map(function (r) { return r.pseudopy.generationTimeMs - r.baseline.generationTimeMs; })),
        vsB2: Stats.wilcoxon(rows.map(function (r) { return r.pseudopy.generationTimeMs - r.baselineB2.generationTimeMs; }))
      };
      out[g] = stats;
    });
    return out;
  }

  var Sop2Report = {
    SIDE_KEYS: SIDE_KEYS,
    SIDE_LABELS: SIDE_LABELS,
    CSV_COLUMNS: CSV_COLUMNS,
    flag: flag,
    csvCell: csvCell,
    toCSV: toCSV,
    toJSON: toJSON,
    toMarkdown: toMarkdown,
    verdictText: verdictText,
    pct: pct,
    medianOf: medianOf,
    iqrOf: iqrOf,
    sideSummary: sideSummary,
    summarize: summarize,
    summarizeGroups: summarizeGroups,
    computeStats: computeStats
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Sop2Report;
  if (root) root.Sop2Report = Sop2Report;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
