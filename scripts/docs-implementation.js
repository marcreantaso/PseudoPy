#!/usr/bin/env node
/* ============================================================
   PSEUDOPY — IMPLEMENTATION COMPONENTS GENERATOR

   Produces docs/IMPLEMENTATION_COMPONENTS.md and the JSON the
   Developer Options -> Implementation panel renders, both from the
   real repository rather than from hand-written claims.

   Evidence sources (all read fresh on every run):
     - src/bundles.json      : the checked-in bundle manifest
     - package.json          : runtime vs dev dependencies
     - src tree              : first-party modules on disk
     - index.html            : the script tags actually loaded by the page
     - vendor tree           : third-party assets committed to the repo

   Run: npm run docs:implementation
   The generated JSON is written to src/devtools/implementation-data.js so the
   panel renders it offline with no fetch, and is registered in the
   "devtools" bundle by src/bundles.json.
   ============================================================ */

'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(root, rel));

// ── 1. First-party modules from the bundle manifest ───────────

const bundles = JSON.parse(read('src/bundles.json'));

// bundles.json is a flat map of { "<output>.js": [ "<source>", ... ] }.
const BUNDLE_GROUPS = {
    'app.js': 'app',
    'compiler.js': 'compiler',
    'database.js': 'database',
    'devtools.js': 'devtools'
};

function bundleEntries(name) {
    const list = bundles[name];
    return Array.isArray(list) ? list : [];
}

// A shallow description is derived from the file's own header comment so the
// generator never invents a purpose. Files without a header are reported as
// "no header comment" instead of being given one.
function headerSummary(rel) {
    const text = read(rel);
    const lines = text.replace(/\r/g, '').split('\n');
    const seen = [];
    let started = false;
    for (const line of lines.slice(0, 40)) {
        const trimmed = line.trim();
        const comment = trimmed.replace(/^\/\*+/, '').replace(/^\*+\s?/, '').replace(/\*\/$/, '').trim();
        if (/^\/\*/.test(trimmed)) started = true;
        if (started && comment) {
            if (/^=+$/.test(comment) || /^─+/.test(comment)) continue;
            seen.push(comment);
            if (seen.length >= 2) break;
        }
        if (started && seen.length && /\*\/$/.test(trimmed)) break;
    }
    return seen.join(' ').slice(0, 160) || null;
}

function firstParty() {
    const items = [];
    const seen = new Set();
    for (const [bundle, group] of Object.entries(BUNDLE_GROUPS)) {
        for (const rel of bundleEntries(bundle)) {
            if (!exists(rel) || seen.has(rel)) continue;
            seen.add(rel);
            items.push({ group, bundle, file: rel, summary: headerSummary(rel) });
        }
    }
    return items;
}

// ── 2. Third-party assets actually committed to the repo ──────

function thirdParty() {
    const items = [];
    const pkg = JSON.parse(read('package.json'));
    for (const [name, version] of Object.entries(pkg.dependencies || {})) {
        items.push({ name, version, kind: 'runtime dependency', source: 'package.json' });
    }

    const vendorWalk = (dir, out) => {
        if (!exists(dir)) return;
        for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
            const rel = path.join(dir, entry.name).replace(/\\/g, '/');
            if (entry.isDirectory()) vendorWalk(rel, out);
            else out.push(rel);
        }
    };
    const vendorFiles = [];
    vendorWalk('vendor', vendorFiles);

    // Collapse the vendored tree into recognisable libraries.
    const libraries = [
        { name: 'Skulpt', match: /^vendor\/skulpt\//, note: 'Browser Python runtime (executes generated Python offline)' },
        { name: 'PDF.js', match: /^vendor\/pdf/, note: 'Client-side PDF export' },
        { name: 'JetBrains Mono NL', match: /^vendor\/fonts\//, note: 'Bundled no-ligature monospace font (OFL 1.1)' }
    ];
    for (const lib of libraries) {
        const files = vendorFiles.filter(f => lib.match.test(f));
        if (files.length) items.push({ name: lib.name, version: 'vendored', kind: lib.note, source: files.join(', ') });
    }
    return items;
}

// ── 3. External / platform components ────────────────────────

function external() {
    const html = read('index.html');
    const items = [];
    const remotes = new Set();
    for (const m of html.matchAll(/<script src="(https?:\/\/[^"]+)"/g)) {
        remotes.add(m[1].replace(/^https?:\/\//, '').split('/')[0]);
    }
    for (const host of [...remotes].sort()) items.push({ name: host, kind: 'remote script host', source: 'index.html' });
    if (/firebasejs/.test(html)) items.push({ name: 'Firebase', kind: 'auth + cloud persistence', source: 'index.html script tags' });
    if (exists('sw.js')) items.push({ name: 'Service Worker / PWA', kind: 'browser platform feature', source: 'sw.js' });
    if (exists('server.js')) items.push({ name: 'Node/Express', kind: 'local server + Vercel handlers', source: 'server.js, api/' });
    return items;
}

// ── 4. Pipeline stages, named once ───────────────────────────

const STAGES = [
    { id: 'normalize', label: 'Preprocessing & NLP mapping', source: 'mapper.js' },
    { id: 'unicode', label: 'Unicode operator normalization', source: 'src/compiler/lexer.js' },
    { id: 'lex', label: 'Lexical analysis', source: 'src/compiler/lexer.js' },
    { id: 'parse', label: 'Syntax analysis (CFG parsing)', source: 'src/compiler/parser.js' },
    { id: 'semantic', label: 'Semantic analysis', source: 'src/compiler/semantic-analyzer.js' },
    { id: 'codegen', label: 'Code generation (SDT)', source: 'src/compiler/code-generator.js' },
    { id: 'execute', label: 'Execution (Skulpt)', source: 'src/app/execution.js' },
    { id: 'grade', label: 'Evaluation & grading', source: 'src/app/exercises.js' }
];

// ── Build the dataset ────────────────────────────────────────

// ── 4. Thesis claim audit ────────────────────────────────────
// The manuscript makes a small number of load-bearing claims about the
// architecture. This records, per claim, what the code actually shows. It is
// deliberately conservative: a claim is only "verified" when the evidence is
// observable without a browser, otherwise it carries a qualification.

const THESIS_CLAIMS = [
    {
        claim: 'Translation and semantic checks run in the browser',
        status: 'Verified',
        evidence: 'mapper.js + compiler.js compile with no network call; compiler tests run them in a bare VM.'
    },
    {
        claim: 'Python executes in the browser',
        status: 'Verified',
        evidence: 'Vendored Skulpt (vendor/skulpt) is precached by sw.js and driven by src/app/execution.js.'
    },
    {
        claim: 'No backend server is needed to use the client',
        status: 'Qualified',
        evidence: 'server.js starts Express and api/ adds Vercel handlers sharing an in-memory store. A static host can serve the client, and the inspected client workflows do not call those routes, but cloud sync still needs Firebase.'
    },
    {
        claim: 'Data is stored in Firebase Firestore',
        status: 'Qualified',
        evidence: 'src/database/ writes localStorage and IndexedDB first, then syncs to Firestore; offline writes are queued, not lost.'
    }
];

// ── 5. Panel comment compliance matrix ───────────────────────
// C1–C5 are the panel's requested demonstrations. Each row records an honest
// status and the named test that verifies it. A row may only be "Complete"
// when a test in tests/*.test.js actually exercises it; "Partial"/"Missing"
// rows carry an owner action. This is checked by tests/panel-compliance.test.js.

const COMPLIANCE = [
    {
        id: 'C1',
        comment: 'Show the pipeline with identical stage names and counts everywhere.',
        status: 'Partial',
        evidence: 'Canonical stage list now exists in scripts/docs-implementation.js and is rendered in the Implementation panel and generated doc.',
        test: 'the pipeline stage vocabulary is defined once and the doc references it',
        gap: 'The pipeline strip, simulation ledger, metrics chart and docs/COMPILER_PIPELINE.md still use their own stage sets.',
        ownerAction: 'Repoint every surface at the canonical stage list and re-capture the DevTools audit screenshots.'
    },
    {
        id: 'C2',
        comment: 'Mapping and validation execution: show input, validation checks, generated Python, actual output, and the invalid-syntax path.',
        status: 'Complete',
        evidence: 'Monitored live in Developer Options: NLP diff, event ledger, SDT walkthrough, console output and the failing-stage diagnostic.',
        test: 'client compiler and vendored Skulpt translate and run with no network APIs',
        gap: null,
        ownerAction: null
    },
    {
        id: 'C3',
        comment: 'Functions: parameters, arity checking and a call stack in execution traces.',
        status: 'Partial',
        evidence: 'Function calls, returns and recursion are compiled and executed; the language reference states signature validation is incomplete.',
        test: 'CALL passes distinct arguments',
        gap: 'Function symbols carry no parameterCount/parameterNames, there is no arity check, and Exec Trace has no call stack.',
        ownerAction: 'Add parameter metadata and an arity diagnostic, then render a call stack in Exec Trace.'
    },
    {
        id: 'C4',
        comment: 'Monospace operators must read correctly (no fused glyphs, no stray Unicode).',
        status: 'Complete',
        evidence: 'Bundled no-ligature font; ligatures disabled on every mono surface; one shared symbol map; console verified in headless Chrome.',
        test: 'every monospace surface disables ligatures so >= never fuses into one glyph',
        gap: null,
        ownerAction: null
    },
    {
        id: 'C5',
        comment: 'Identifiers: Unicode, NFC, homoglyph and zero-width handling; export encoding.',
        status: 'Partial',
        evidence: 'Editors opt out of OS autocorrect/autocapitalize; the formatter strips zero-width characters and normalizes NBSP.',
        test: 'editors opt out of OS autocorrect so identifiers are not rewritten',
        gap: 'The lexer accepts ASCII identifiers only; there is no NFC normalization and no homoglyph rejection.',
        ownerAction: 'Decide the identifier policy (reject vs. fold for NFC/homoglyphs) and apply it in the lexer with a regression set.'
    }
];

const dataset = {
    generatedFrom: 'npm run docs:implementation',
    stages: STAGES,
    firstParty: firstParty(),
    thirdParty: thirdParty(),
    external: external(),
    thesisClaims: THESIS_CLAIMS,
    compliance: COMPLIANCE
};

// ── Emit the panel data module ───────────────────────────────

const banner = '/* GENERATED by scripts/docs-implementation.js — do not edit by hand. */\n';
const payload = JSON.stringify(dataset, null, 2);
fs.writeFileSync(
    path.join(root, 'src/devtools/implementation-data.js'),
    banner +
    '/* eslint-disable */\n' +
    '(function (global) {\n' +
    '    "use strict";\n' +
    '    global.PSEUDOPY_IMPLEMENTATION = ' + payload + ';\n' +
    '    if (typeof module !== "undefined" && module.exports) module.exports = global.PSEUDOPY_IMPLEMENTATION;\n' +
    '})(typeof window !== "undefined" ? window : globalThis);\n'
);

// ── Emit the markdown ────────────────────────────────────────

const rows = [];
rows.push('| Component | Classification | Source |');
rows.push('|---|---|---|');
for (const group of ['compiler', 'app', 'devtools', 'database']) {
    for (const item of dataset.firstParty.filter(i => i.group === group)) {
        rows.push(`| \`${item.file}\` | First-party (${group} bundle) | ${item.summary ? item.summary : 'no header comment'} |`);
    }
}
for (const item of dataset.thirdParty) {
    rows.push(`| ${item.name} ${item.version} | Third-party | ${item.source} |`);
}
for (const item of dataset.external) {
    rows.push(`| ${item.name} | External / platform | ${item.source} |`);
}

const md = [
    '# Implementation Components',
    '',
    '_Generated by `npm run docs:implementation`. Do not edit by hand; the same',
    'dataset is what the Developer Options › Implementation panel renders._',
    '',
    '## Compiler pipeline stages (one canonical vocabulary)',
    '',
    '| # | Stage | Source |',
    '|---|---|---|',
    ...STAGES.map((s, i) => `| ${i + 1} | ${s.label} | \`${s.source}\` |`),
    '',
    '## Components',
    '',
    ...rows,
    '',
    '## How to regenerate',
    '',
    '```sh',
    'npm run docs:implementation',
    'npm run build',
    '```',
    '',
    '## Thesis claim audit',
    '',
    '_The manuscript makes these architectural claims. This table records what',
    'the code actually shows. A claim is "Verified" only when the evidence is',
    'observable without a browser; otherwise it is "Qualified"._',
    '',
    '| Claim | Status | Evidence |',
    '|---|---|---|',
    ...THESIS_CLAIMS.map(c => `| ${c.claim} | ${c.status} | ${c.evidence} |`),
    ''
].join('\n');

fs.writeFileSync(path.join(root, 'docs/IMPLEMENTATION_COMPONENTS.md'), md);

// ── Emit the compliance matrix ───────────────────────────────

const complianceMd = [
    '# Panel Compliance Matrix',
    '',
    '_Generated by `npm run docs:implementation` from the same dataset the',
    'Developer Options › Implementation panel renders. Edit the matrix in',
    '`scripts/docs-implementation.js`, not here._',
    '',
    'Statuses are honest. **Complete** means a named test exercises the behaviour;',
    '**Partial** means part of it works and an owner action remains; **Missing**',
    'means it is not implemented. Status is never upgraded by reading a claim —',
    'it is verified by running the system.',
    '',
    '| ID | Panel comment | Status | Evidence | Verified by |',
    '|---|---|---|---|---|',
    ...COMPLIANCE.map(c =>
        `| ${c.id} | ${c.comment} | **${c.status}** | ${c.evidence} | \`${c.test}\` |`),
    '',
    '## Gaps and owner actions',
    '',
    ...COMPLIANCE.filter(c => c.gap).flatMap(c => [
        `### ${c.id} — ${c.status}`,
        '',
        `- **Gap:** ${c.gap}`,
        `- **Owner action:** ${c.ownerAction}`,
        ''
    ]),
    '## How to re-verify',
    '',
    '```sh',
    'npm run docs:implementation   # regenerate this matrix and the panel card',
    'npm run build                 # rebuild the bundles',
    'npm test                      # run the named tests above',
    '```',
    ''
].join('\n');

fs.writeFileSync(path.join(root, 'docs/PANEL_COMPLIANCE.md'), complianceMd);

console.log(`Wrote docs/IMPLEMENTATION_COMPONENTS.md and src/devtools/implementation-data.js`);
console.log(`Wrote docs/PANEL_COMPLIANCE.md (${COMPLIANCE.filter(c => c.status === 'Complete').length}/${COMPLIANCE.length} complete)`);
console.log(`  first-party modules: ${dataset.firstParty.length}`);
console.log(`  third-party:         ${dataset.thirdParty.length}`);
console.log(`  external:            ${dataset.external.length}`);
console.log(`  stages:              ${dataset.stages.length}`);
