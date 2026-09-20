let _allTokens = [];

function _updateTokenInspector(tokens) {
    _allTokens = tokens || [];
    document.getElementById('devtools-token-count').textContent = _allTokens.length + ' tokens';
    devToolsFilterTokens();
}

function devToolsFilterTokens() {
    const search = (document.getElementById('devtools-token-filter').value || '').toLowerCase();
    const typeFilter = document.getElementById('devtools-token-type-filter').value;
    const tbody = document.getElementById('devtools-token-tbody');
    if (!tbody) return;

    let filtered = _allTokens.filter(t => {
        if (typeFilter && t.type !== typeFilter) return false;
        if (search && !t.value.toLowerCase().includes(search) && !t.type.toLowerCase().includes(search)) return false;
        return true;
    });

    // Render (cap at 500 rows for performance)
    const maxRows = 500;
    const rows = filtered.slice(0, maxRows);
    tbody.innerHTML = rows.map(t => {
        const displayVal = t.type === 'NEWLINE' ? '↵' : _esc(t.value);
        return `<tr><td>${t.line}</td><td><code class="token-type-${t.type}">${t.type}</code></td><td><code>${displayVal}</code></td></tr>`;
    }).join('');

    document.getElementById('devtools-token-count').textContent =
        (filtered.length > maxRows ? maxRows + ' of ' : '') + filtered.length + ' tokens';
}

// ══════════════════════════════════════════════════════════════
// AST INSPECTOR — Reads REAL Parser output
// ══════════════════════════════════════════════════════════════

function _updateASTInspector(ast) {
    const container = document.getElementById('devtools-ast-tree');
    if (!container) return;
    if (!ast) { container.innerHTML = '<div class="devtools-idle-message"><p>No AST.</p></div>'; return; }
    container.innerHTML = '<div class="ast-node-root">' + _renderASTNode(ast, 0) + '</div>';
}

function _renderASTNode(node, depth) {
    if (!node || typeof node !== 'object') return '';
    const entries = Object.entries(node).filter(([key]) => !['tokens', 'errors'].includes(key));
    const props = entries.filter(([key, value]) => key !== 'type' && value !== null && typeof value !== 'object')
        .map(([key, value]) => `<span class="ast-prop">${_esc(key)}: <code>${_esc(String(value))}</code></span>`).join(' ');
    let html = `<details class="ast-node" ${depth < 4 ? 'open' : ''}><summary class="ast-node-summary"><span class="ast-type">${_esc(node.type || 'Branch')}</span> ${props}</summary><div class="ast-children">`;
    // Expression nodes retain both source tokens and an actual precedence tree.
    if (node.tokens) html += `<div class="ast-expr"><code>${_esc(node.tokens.map(t => t.value).join(' '))}</code></div>`;
    for (const [key, value] of entries) {
        if (!value || typeof value !== 'object') continue;
        html += `<div class="ast-child-label">${_esc(key)}:</div>`;
        if (Array.isArray(value)) {
            for (const child of value) html += typeof child === 'object' ? _renderASTNode(child, depth + 1) : `<code>${_esc(String(child))}</code> `;
        } else html += _renderASTNode(value, depth + 1);
    }
    return html + '</div></details>';
}

// ══════════════════════════════════════════════════════════════
// SYMBOL TABLE — Reads REAL SemanticAnalyzer symbolTable
// ══════════════════════════════════════════════════════════════

function _updateSymbolTable(symbolTable) {
    const tbody = document.getElementById('devtools-symbol-tbody');
    if (!tbody) return;
    if (!symbolTable || Object.keys(symbolTable).length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="devtools-empty">No symbols.</td></tr>';
        return;
    }
    tbody.innerHTML = Object.entries(symbolTable).map(([name, info]) => {
        return `<tr><td><code>${_esc(name)}</code></td><td>${info.type || 'unknown'}</td><td>declared</td></tr>`;
    }).join('');
}

// ══════════════════════════════════════════════════════════════
// PARSER STATE — Reads REAL Parser errors and block stack
// ══════════════════════════════════════════════════════════════

function _updateParserState(result) {
    const container = document.getElementById('devtools-parser-state');
    if (!container) return;

    const ast = result.ast;
    const parserErrors = (ast && ast.errors) ? ast.errors : [];

    // Find block stack from trace events
    const astEvent = devToolsState.stepEvents.find(e => e.type === 'AST_CREATED');
    const blockStack = astEvent && astEvent.data.blockStack ? astEvent.data.blockStack : [];

    let html = '<div class="devtools-parser-info">';
    html += `<div class="devtools-kv"><span class="devtools-kv-key">Parser Errors:</span> ${parserErrors.length}</div>`;
    html += `<div class="devtools-kv"><span class="devtools-kv-key">Block Stack (at end):</span> ${blockStack.length === 0 ? 'EMPTY {{ui:CircleCheck}}' : blockStack.map(b => b.type + ' (line ' + b.line + ')').join(' → ')}</div>`;

    if (parserErrors.length > 0) {
        html += '<h4 style="margin-top:1rem">Parser Errors:</h4>';
        html += '<div class="devtools-error-list">';
        for (const err of parserErrors) {
            html += `<div class="devtools-error-item"><strong>Line ${err.line}:</strong> ${_esc(err.message)}`;
            if (err.suggestion) html += `<div class="devtools-suggestion">{{ui:Lightbulb}} ${_esc(err.suggestion)}</div>`;
            html += '</div>';
        }
        html += '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════
// SEMANTIC VIEW — Reads REAL SemanticAnalyzer warnings
// ══════════════════════════════════════════════════════════════

function _updateSemanticView(result) {
    const container = document.getElementById('devtools-semantic-output');
    if (!container) return;

    const warnings = result.warnings || [];
    const symbolTable = result.symbolTable || {};

    let html = '<div class="devtools-semantic-info">';
    html += `<div class="devtools-kv"><span class="devtools-kv-key">Symbol Table Entries:</span> ${Object.keys(symbolTable).length}</div>`;
    html += `<div class="devtools-kv"><span class="devtools-kv-key">Warnings:</span> ${warnings.length}</div>`;

    if (warnings.length > 0) {
        html += '<h4 style="margin-top:1rem">Semantic Warnings:</h4>';
        html += '<div class="devtools-warning-list">';
        for (const w of warnings) {
            html += `<div class="devtools-warning-item"><strong>Line ${w.line}:</strong> ${_esc(w.message)}`;
            if (w.suggestion) html += `<div class="devtools-suggestion">{{ui:Lightbulb}} ${_esc(w.suggestion)}</div>`;
            html += '</div>';
        }
        html += '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════
// TRANSLATION VIEW — AST node → Python mapping
// ══════════════════════════════════════════════════════════════

function _updateTranslationView(result) {
    const container = document.getElementById('devtools-translation-view');
    if (!container) return;

    if (!result.ast || !result.ast.body || !result.valid) {
        container.innerHTML = '<div class="devtools-idle-message"><p>No successful compilation to show translation.</p></div>';
        return;
    }

    const pythonLines = (result.python || '').split('\n');
    let html = '<div class="devtools-translation-list">';

    // Map each AST node to its generated Python by re-generating per-node
    const gen = new CodeGenerator(new Map(Object.entries(result.symbolTable || {})));
    for (const node of result.ast.body) {
        gen.lines = [];
        gen.indentLevel = 0;
        gen.visitNode(node);
        const pyChunk = gen.lines.join('\n');

        // Find pseudocode representation
        let pseudoLabel = node.type;
        if (node.type === 'AssignmentStatement') pseudoLabel = `SET ${node.id} TO ...`;
        else if (node.type === 'DeclareStatement') pseudoLabel = `DECLARE ${node.id} AS ${node.varType}`;
        else if (node.type === 'PrintStatement') pseudoLabel = `DISPLAY ...`;
        else if (node.type === 'IfStatement') pseudoLabel = `IF ... THEN`;
        else if (node.type === 'WhileStatement') pseudoLabel = `WHILE ... DO`;
        else if (node.type === 'ForStatement') pseudoLabel = `FOR ${node.iterator || '...'} FROM ... TO ...`;
        else if (node.type === 'InputStatement') pseudoLabel = `INPUT ${node.id}`;
        else if (node.type === 'FunctionDef') pseudoLabel = `FUNCTION ${node.name}`;

        html += `<div class="devtools-translation-item">
            <div class="devtools-trans-pseudo"><code>${_esc(pseudoLabel)}</code><span class="devtools-trans-arrow">→</span><span class="ast-type">${node.type}</span><span class="devtools-trans-arrow">→</span></div>
            <pre class="devtools-trans-python">${_esc(pyChunk)}</pre>
        </div>`;
    }

    html += '</div>';
    container.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════
// ERROR PANEL — Classified from REAL compiler data
// ══════════════════════════════════════════════════════════════

