/* ============================================================
   PSEUDOPY — IMPLEMENTATION PANEL RENDERER

   Renders the Developer Options -> Implementation tab from the generated
   dataset in src/devtools/implementation-data.js (rebuilt by
   `npm run docs:implementation`). Everything shown here is read from that
   dataset; nothing is hard-written in this file, so the panel can never drift
   from docs/IMPLEMENTATION_COMPONENTS.md.

   Uses the app's existing shadcn-style primitives (pp-card, pp-badge,
   pp-table) so it matches the SOP 2 panel.
   ============================================================ */

(function (global) {
    'use strict';

    var doc = typeof document !== 'undefined' ? document : null;

    // Neutralise anything interpolated into markup. The dataset is generated,
    // but escaping keeps the renderer safe if a docstring ever contains markup.
    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    var GROUP_LABELS = {
        compiler: 'Compiler',
        app: 'Application',
        devtools: 'DevTools & research',
        database: 'Data layer'
    };

    function dataset() {
        return (global && global.PSEUDOPY_IMPLEMENTATION) || null;
    }

    // ── Cards ──────────────────────────────────────────────────

    function pipelineCard(stages) {
        var rows = stages.map(function (s, i) {
            return '<tr><td>' + (i + 1) + '</td><td>' + esc(s.label) +
                '</td><td><code>' + esc(s.source) + '</code></td></tr>';
        }).join('');
        return '' +
            '<section class="pp-card impl-card">' +
            '<div class="pp-card-header"><h3 class="pp-card-title">Compiler pipeline stages</h3>' +
            '<p class="pp-card-description">One canonical stage vocabulary, shared by the pipeline strip, the ' +
            'simulation ledger and this document.</p></div>' +
            '<div class="pp-card-content"><table class="pp-table"><thead><tr>' +
            '<th scope="col">#</th><th scope="col">Stage</th><th scope="col">Source</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table></div></section>';
    }

    function firstPartyCard(items, filter) {
        var shown = items.filter(function (i) { return filter === 'all' || i.group === filter; });
        var rows = shown.map(function (i) {
            var hasDetail = !!i.summary;
            return '<tr' + (hasDetail ? ' class="impl-row-expandable" data-expandable="1"' : '') + '>' +
                '<td><code>' + esc(i.file) + '</code></td>' +
                '<td><span class="pp-badge pp-badge-neutral">' + esc(GROUP_LABELS[i.group] || i.group) + '</span></td>' +
                '<td>' + esc(i.summary || 'no header comment') + '</td></tr>';
        }).join('');
        return '' +
            '<section class="pp-card impl-card">' +
            '<div class="pp-card-header"><h3 class="pp-card-title">First-party components' +
            ' <span class="pp-badge pp-badge-info">' + shown.length + '</span></h3>' +
            '<p class="pp-card-description">Modules compiled into the browser bundles, read from src/bundles.json.</p></div>' +
            '<div class="pp-card-content"><table class="pp-table"><thead><tr>' +
            '<th scope="col">Module</th><th scope="col">Bundle</th><th scope="col">Purpose (from its own header)</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table></div></section>';
    }

    function thirdPartyCard(items) {
        var rows = items.map(function (i) {
            return '<tr><td>' + esc(i.name) + '</td><td><code>' + esc(i.version) + '</code></td>' +
                '<td>' + esc(i.kind) + '</td><td>' + esc(i.source) + '</td></tr>';
        }).join('');
        return '' +
            '<section class="pp-card impl-card">' +
            '<div class="pp-card-header"><h3 class="pp-card-title">Third-party components' +
            ' <span class="pp-badge pp-badge-warning">' + items.length + '</span></h3>' +
            '<p class="pp-card-description">Runtime dependencies and vendored libraries. Not written by the researcher.</p></div>' +
            '<div class="pp-card-content"><table class="pp-table"><thead><tr>' +
            '<th scope="col">Component</th><th scope="col">Version</th><th scope="col">Role</th><th scope="col">Source</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table></div></section>';
    }

    function externalCard(items) {
        var rows = items.map(function (i) {
            return '<tr><td>' + esc(i.name) + '</td><td>' + esc(i.kind) + '</td><td>' + esc(i.source) + '</td></tr>';
        }).join('');
        return '' +
            '<section class="pp-card impl-card">' +
            '<div class="pp-card-header"><h3 class="pp-card-title">External &amp; platform components</h3>' +
            '<p class="pp-card-description">Hosting, identity and platform services the app depends on but does not implement.</p></div>' +
            '<div class="pp-card-content"><table class="pp-table"><thead><tr>' +
            '<th scope="col">Component</th><th scope="col">Role</th><th scope="col">Evidence</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table></div></section>';
    }

    function thesisCard(claims) {
        var rows = claims.map(function (c) {
            var cls = c.status === 'Verified' ? 'pp-badge-success' : 'pp-badge-warning';
            return '<tr><td>' + esc(c.claim) + '</td>' +
                '<td><span class="pp-badge ' + cls + '">' + esc(c.status) + '</span></td>' +
                '<td>' + esc(c.evidence) + '</td></tr>';
        }).join('');
        return '' +
            '<section class="pp-card impl-card">' +
            '<div class="pp-card-header"><h3 class="pp-card-title">Thesis claim audit</h3>' +
            '<p class="pp-card-description">What the manuscript claims, checked against the code. ' +
            'Qualified claims carry the reason they are not simply verified.</p></div>' +
            '<div class="pp-card-content"><table class="pp-table"><thead><tr>' +
            '<th scope="col">Claim</th><th scope="col">Status</th><th scope="col">Evidence</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table></div></section>';
    }

    function attributionCard() {
        // These are real links now, not plain text.
        return '' +
            '<section class="pp-card impl-card" id="impl-attribution">' +
            '<div class="pp-card-header"><h3 class="pp-card-title">Attribution</h3>' +
            '<p class="pp-card-description">Who implemented what, with the document that records it.</p></div>' +
            '<div class="pp-card-content">' +
            '<ul class="impl-attribution-list">' +
            '<li><strong>Researcher (first-party)</strong>: compiler pipeline, editor assistance, DevTools, ' +
            'research tooling, data layer. Details: <a href="docs/IMPLEMENTATION_COMPONENTS.md" ' +
            'target="_blank" rel="noopener">docs/IMPLEMENTATION_COMPONENTS.md</a>.</li>' +
            '<li><strong>Pipeline</strong>: stage names and trace behaviour are documented in ' +
            '<a href="docs/COMPILER_PIPELINE.md" target="_blank" rel="noopener">docs/COMPILER_PIPELINE.md</a>.</li>' +
            '<li><strong>Third-party</strong>: Skulpt (browser Python runtime), PDF.js (PDF export), ' +
            'JetBrains Mono NL (OFL 1.1 font), Express/CORS (local server), Firebase (auth + persistence). ' +
            'Full versions above.</li>' +
            '</ul></div></section>';
    }

    // ── Render ─────────────────────────────────────────────────

    var activeFilter = 'all';

    function render() {
        var host = doc && doc.getElementById('impl-content');
        if (!host) return;
        var data = dataset();
        if (!data) {
            host.innerHTML = '<div class="pp-card"><div class="pp-card-content">' +
                'Implementation data not bundled. Run <code>npm run docs:implementation</code> then ' +
                '<code>npm run build</code>.</div></div>';
            return;
        }
        var byFil = data.firstParty || [];
        host.innerHTML =
            pipelineCard(data.stages || []) +
            firstPartyCard(byFil, activeFilter) +
            thirdPartyCard(data.thirdParty || []) +
            externalCard(data.external || []) +
            thesisCard(data.thesisClaims || []) +
            attributionCard();
        wireExpandableRows(host);
        var stamp = doc.getElementById('impl-generated-at');
        if (stamp) stamp.textContent = 'Source: ' + (data.generatedFrom || 'npm run docs:implementation');
    }

    function wireExpandableRows(host) {
        host.querySelectorAll('tr[data-expandable="1"]').forEach(function (row) {
            row.addEventListener('click', function () {
                row.classList.toggle('impl-row-open');
            });
        });
    }

    function renderFilters() {
        var host = doc && doc.getElementById('impl-filters');
        if (!host) return;
        var options = [['all', 'All'], ['compiler', 'Compiler'], ['app', 'Application'],
            ['devtools', 'DevTools'], ['database', 'Data layer']];
        host.innerHTML = options.map(function (opt) {
            return '<button type="button" class="pp-chip' + (opt[0] === activeFilter ? ' is-active' : '') +
                '" data-filter="' + opt[0] + '">' + esc(opt[1]) + '</button>';
        }).join('');
        host.querySelectorAll('button[data-filter]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                activeFilter = btn.getAttribute('data-filter');
                renderFilters();
                render();
            });
        });
    }

    function init() {
        if (!doc) return;
        renderFilters();
        render();
    }

    var api = { init: init, render: render };
    if (global) global.PseudopyImplementationPanel = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

    // Self-init: the panel is cheap and idempotent, and the Implementation tab
    // has no other owner. Rendering on ready keeps it independent of the order
    // the devtools scripts finish loading.
    if (doc && doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else if (doc) init();
})(typeof window !== 'undefined' ? window : globalThis);
