/* ============================================================
   SOP 2 — dataset assembly (pure)

   Produces a single tagged row list from three clearly labelled
   groups so the report never blends them into one number:

     seed     — the 30 built-in exercises the compiler was designed
                against (src/database/seed-data.js)
     holdout  — independently written cases, different phrasing and
                style, used only for evaluation
     injected — programmatically broken variants of seed/holdout rows,
                used to measure error DETECTION

   Usable from Node (`module.exports`) and the browser (`window.Sop2Dataset`).
   ============================================================ */
(function (root) {
  'use strict';

  function injectionModule() {
    if (root && root.Sop2Injection) return root.Sop2Injection;
    if (typeof require === 'function') {
      try { return require('./error-injection'); } catch (e) { /* browser */ }
    }
    return null;
  }

  function pick(obj, keys) {
    for (var i = 0; i < keys.length; i++) {
      if (obj && obj[keys[i]] != null && obj[keys[i]] !== '') return obj[keys[i]];
    }
    return '';
  }

  /** Normalise a seed exercise (database.js shape). */
  function normalizeSeed(row, index) {
    return {
      id: String(pick(row, ['id', '_docId']) || ('seed_' + (index + 1))),
      title: pick(row, ['title']) || null,
      concept: pick(row, ['concept']) || null,
      difficulty: pick(row, ['difficulty']) || null,
      source: String(pick(row, ['pseudocode', 'code'])),
      referencePython: String(pick(row, ['python_code', 'solution', 'pythonCode'])),
      group: 'seed',
      baseId: null,
      injectionType: null,
      injectionDetail: null
    };
  }

  /** Normalise a holdout case (holdout-cases.js shape). */
  function normalizeHoldout(row, index) {
    return {
      id: String(pick(row, ['id']) || ('holdout_' + (index + 1))),
      title: pick(row, ['title']) || null,
      concept: pick(row, ['concept']) || null,
      difficulty: pick(row, ['difficulty']) || null,
      source: String(pick(row, ['pseudocode', 'code'])),
      referencePython: String(pick(row, ['python_code', 'solution'])),
      group: 'holdout',
      baseId: null,
      injectionType: null,
      injectionDetail: null
    };
  }

  function isUsable(row) {
    return !!(row.source && row.source.trim() && row.referencePython && row.referencePython.trim());
  }

  /**
   * Build the tagged dataset.
   * @param {Array} seedRows raw database.js seed objects
   * @param {Array} holdoutRows raw holdout objects
   * @param {{includeInjected?:boolean, injectionTypes?:string[],
   *          includeHoldout?:boolean, includeSeed?:boolean}} [opts]
   * @returns {{rows:Array, injections:{applicable:number, skipped:Array}}}
   */
  function buildDataset(seedRows, holdoutRows, opts) {
    opts = opts || {};
    var includeSeed = opts.includeSeed !== false;
    var includeHoldout = opts.includeHoldout !== false;
    var includeInjected = opts.includeInjected !== false;
    var injection = injectionModule();

    var base = [];
    if (includeSeed) {
      (seedRows || []).forEach(function (r, i) { var n = normalizeSeed(r, i); if (isUsable(n)) base.push(n); });
    }
    if (includeHoldout) {
      (holdoutRows || []).forEach(function (r, i) { var n = normalizeHoldout(r, i); if (isUsable(n)) base.push(n); });
    }

    var rows = base.slice();
    var skipped = [];

    if (includeInjected && injection) {
      base.forEach(function (row) {
        var result = injection.injectAll(row.source, opts.injectionTypes);
        result.skipped.forEach(function (type) { skipped.push(row.id + ':' + type); });
        result.applicable.forEach(function (inj) {
          rows.push({
            id: row.id + '__inj_' + inj.type,
            title: (row.title || row.id) + ' [' + inj.type + ']',
            concept: row.concept,
            difficulty: row.difficulty,
            source: inj.source,
            referencePython: row.referencePython,
            group: 'injected',
            baseId: row.id,
            injectionType: inj.type,
            injectionDetail: inj.detail
          });
        });
      });
    }

    return {
      rows: rows,
      injections: { applicable: rows.filter(function (r) { return r.group === 'injected'; }).length, skipped: skipped }
    };
  }

  function groupRows(rows, group) {
    return rows.filter(function (r) { return r.group === group; });
  }

  var Sop2Dataset = {
    normalizeSeed: normalizeSeed,
    normalizeHoldout: normalizeHoldout,
    buildDataset: buildDataset,
    groupRows: groupRows
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Sop2Dataset;
  if (root) root.Sop2Dataset = Sop2Dataset;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
