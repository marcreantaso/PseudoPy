/* Student presentation adapter. No compiler execution or database access. */
const StudentLearningModel = (() => {
    function scores(tallies, valid, patterns) {
        const t = tallies || {};
        return {
            compilation: valid ? 100 : 0,
            validation: Math.max(0, 100 - 15 * (t.error || 0) - 5 * (t.warning || 0) - 2 * (t.suggestion || 0)),
            // Pattern detection currently runs only on valid programs. There is no
            // per-construct error attribution, so mastery cannot honestly be scored.
            mastery: null
        };
    }
    function attempt(id, source, result, learning) {
        const tallies = learning && learning.tallies || { error: (result.errors || []).length, warning: (result.warnings || []).length };
        const patterns = learning && learning.patternTypes || [];
        return { id, timestamp: new Date().toISOString(), valid: result.valid, errors: (result.errors || []).length,
            timing: result.metrics && result.metrics.totalTime, tallies, patterns,
            categories: learning && learning.errorCategories || [], ...scores(tallies, result.valid, patterns) };
    }
    function feedback(issue) {
        const message = issue.message || '';
        let category = 'Basics', fix = issue.suggestion || 'Check the highlighted line and compare it with an example.';
        let explanation = message;
        if (/IF|THEN/.test(message)) category = 'Conditions';
        if (/WHILE|FOR|\bDO\b/.test(message)) category = 'Loops';
        if (/variable|DECLARE|identifier/i.test(message)) category = 'Variables';
        if (/INPUT/.test(message)) category = 'Input & Output';
        if (/Unclosed IF/.test(message)) { explanation = 'Your IF block is not closed.'; fix = 'Add END IF after the final statement in this block.'; }
        if (/missing sentinel keyword THEN/.test(message)) { explanation = 'Your IF condition needs THEN.'; fix = 'Write IF condition THEN, then place the instructions on the next line.'; }
        return { line: issue.line, explanation, fix, category };
    }
    function flow(source, result) {
        const lines = source.split('\n'), steps = [];
        function walk(nodes, depth, branch) {
            (nodes || []).forEach(node => {
                if (!node || !node.type) return;
                steps.push({ line: node.line, depth, type: node.type, variable: node.id || node.iterator, label: (branch || '') + (lines[node.line - 1] || node.type).trim() });
                walk(node.body, depth + 1);
                (node.elseIfs || []).forEach(b => { steps.push({ line: b.line, depth: depth + 1, label: 'ELSE IF (alternative branch)' }); walk(b.body, depth + 2); });
                if (node.elseBody) { steps.push({ depth: depth + 1, label: 'ELSE (alternative branch)' }); walk(node.elseBody, depth + 2); }
            });
        }
        walk(result.ast && result.ast.body, 0);
        // Conservative alignment: only show an inferred mapping when both the AST
        // statement and generated Python candidate are unique. Never guess among
        // repeated branches, loop bodies or injected helper statements.
        const pythonLines = (result.python || '').split('\n');
        let helper = false;
        const candidates = pythonLines.map((text, index) => {
            if (/^def _pseudopy_/.test(text)) helper = true;
            else if (helper && text && !/^\s/.test(text)) helper = false;
            return { text: text.trim(), line: index + 1, helper };
        });
        const prefixes = { PrintStatement: 'print(', IfStatement: 'if ', WhileStatement: 'while ', ForStatement: 'for ', ForEachStatement: 'for ', InputStatement: null, AssignmentStatement: null };
        steps.forEach(s => {
            if (!Object.prototype.hasOwnProperty.call(prefixes, s.type)) return;
            const prefix = prefixes[s.type] || (s.variable + ' = ');
            const siblings = steps.filter(other => other.type === s.type && (prefixes[s.type] || other.variable === s.variable));
            const matches = candidates.filter(c => !c.helper && c.text.startsWith(prefix));
            if (siblings.length === 1 && matches.length === 1) { s.pythonLine = matches[0].line; s.python = matches[0].text; }
        });
        const errors = result.errors || [];
        const lexical = errors.some(e => /Unterminated string|Unsupported character/.test(e.message));
        const stages = [ ['source', 'Your pseudocode', 'Input'], ['tokens', 'Identify words & symbols', 'Lexical Analysis'],
            ['structure', 'Program structure', 'AST / Parsing'], ['meaning', 'Check meaning', 'Semantic Analysis'],
            ['validation', 'Check the rules', 'Validation'], ['python', 'Generate Python', 'Code Generation'],
            ['execution', 'Run Python', 'Execution'], ['output', 'Produce output', 'Output'] ];
        return { source, result, steps, tokens: (result.tokens || []).filter(t => !['NEWLINE', 'EOF'].includes(t.type)),
            stages: stages.map(([id, label, technical], i) => ({ id, label, technical,
                status: i >= 6 ? (result.valid ? 'Ready' : 'Not reached') : i === 5 && !result.valid ? 'Not reached' :
                    i === 1 && lexical ? 'Needs Attention' : i === 2 && errors.length ? 'Needs Attention' :
                    i === 4 && !result.valid ? 'Needs Attention' : i === 3 && (result.warnings || []).length ? 'Needs Attention' : 'Completed' })),
            feedback: errors.map(feedback) };
    }
    function kpis(attempts, executions) {
        const timed = attempts.filter(a => Number.isFinite(a.timing));
        return { translations: attempts.length, success: attempts.length ? 100 * attempts.filter(a => a.valid).length / attempts.length : 0,
            runtime: executions.length ? 100 * executions.filter(e => !e.success).length / executions.length : 0,
            average: timed.length ? timed.reduce((n, a) => n + a.timing, 0) / timed.length : 0,
            errors: attempts.reduce((n, a) => n + a.errors, 0), executions: executions.length };
    }
    function history(records, userId) {
        return records.filter(r => r.studentId === userId && !r.seededFrom && !String(r._docId || '').startsWith('ev_seed_') && Number.isFinite(Date.parse(r.timestamp)))
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
            .map(r => ({ id: r._docId, timestamp: r.timestamp, errors: (r.tallies || {}).error || 0, ...scores(r.tallies, r.valid, r.patternTypes) }));
    }
    function trajectory(records) {
        let successes = 0;
        return records.map((r, index) => { if (r.compilation === 100) successes++; return { ...r, cumulative: 100 * successes / (index + 1) }; });
    }
    return { scores, attempt, feedback, flow, kpis, history, trajectory };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = StudentLearningModel;
