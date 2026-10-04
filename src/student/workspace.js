/* Student-only workspace. Consumes cached compiler results; never invokes devtools. */
const StudentWorkspace = (() => {
    let owner = '', generation = 0, unsubscribe = null, attempts = [], executions = [], latest = null;
    let history = [], historyStatus = '', historyMode = false, selected = 'source', step = -1;
    let activePage = '', serial = 0, sessionEpoch = 0;
    const visible = new Set(['compilation', 'validation', 'cumulative']);
    const guideState = { mode: 'beginner', category: 'Basics' };
    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const userId = () => typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'student' ? String(currentUser._docId || currentUser.id || '') : '';
    const element = id => document.getElementById(id);
    function reset() {
        sessionEpoch++;
        generation++; if (unsubscribe) unsubscribe(); unsubscribe = null;
        owner = ''; attempts = []; executions = []; latest = null; history = []; historyStatus = ''; activePage = ''; step = -1; historyMode = false;
        document.querySelectorAll('.student-workspace').forEach(el => el.remove());
        document.querySelectorAll('[data-student-guide]').forEach(el => { el.dataset.owner = ''; });
        document.querySelectorAll('.sg-context').forEach(el => { el.hidden = true; });
    }
    function activate(page) {
        const id = userId();
        if (id !== owner) { reset(); owner = id; }
        generation++; if (unsubscribe) unsubscribe(); unsubscribe = null;
        activePage = page;
        if (!id || !['write-pseudocode', 'translate'].includes(page)) return;
        const root = element('page-' + page); if (!root) return;
        const editorId = page === 'translate' ? 'translate-input' : 'pseudocode-editor';
        setupGuide(root, editorId);
        let workspace = root.querySelector('.student-workspace');
        if (!workspace) {
            workspace = document.createElement('div'); workspace.className = 'student-workspace'; root.appendChild(workspace);
        }
        render(); loadHistory();
    }
    function setupGuide(root, editorId) {
        const guide = root.querySelector('.operator-guide'), editor = element(editorId);
        if (!guide || !editor) return;
        if (guide.dataset.owner === owner) return;
        guide.dataset.studentGuide = 'true'; guide.dataset.owner = owner;
        const key = 'pseudopy_quick_guide_' + owner;
        const modeKey = (typeof STORAGE_KEYS !== 'undefined' && STORAGE_KEYS.GUIDE_MODE) || 'pseudopy_guide_mode';
        let open = true;
        try { open = localStorage.getItem(key) !== 'closed'; } catch (_) { /* private browsing */ }
        guideState.mode = 'beginner';
        try { const m = localStorage.getItem(modeKey); if (m === 'beginner' || m === 'advanced') guideState.mode = m; } catch (_) { /* private browsing */ }
        guideState.category = 'Basics';
        guide.open = open;
        guide.innerHTML = '<summary>Pseudocode Quick Guide</summary><div class="sg-toolbar"><p class="sg-intro">Need help? Explore the syntax and examples while you write.</p><div class="seg" role="group" aria-label="Presentation mode"><button type="button" data-mode="beginner" aria-pressed="' + (guideState.mode === 'beginner') + '">Beginner</button><button type="button" data-mode="advanced" aria-pressed="' + (guideState.mode === 'advanced') + '">Advanced</button></div></div><div class="sg-cats" aria-label="Guide categories"></div><div class="sg-content"></div><p class="sg-tip" aria-live="polite"></p>';
        guide.ontoggle = () => { try { localStorage.setItem(key, guide.open ? 'open' : 'closed'); } catch (_) {} };
        const cats = guide.querySelector('.sg-cats'), content = guide.querySelector('.sg-content');
        let contextTip = root.querySelector('.sg-context');
        if (!contextTip) {
            contextTip = document.createElement('div'); contextTip.className = 'sg-context'; contextTip.hidden = true;
            contextTip.innerHTML = '<span aria-live="polite"></span><button type="button" aria-label="Dismiss contextual tip">Dismiss</button>';
            editor.parentElement.insertAdjacentElement('afterend', contextTip);
            contextTip.querySelector('button').onclick = () => { contextTip.hidden = true; };
        }
        function modeDetails(adv) {
            if (!adv) return '';
            return '<details class="sg-advanced" open><summary>Advanced: exact rules the compiler applies</summary><p class="sg-expl">' + esc(adv.intro) + '</p>' + (adv.bullets && adv.bullets.length ? '<ul class="sg-adv-list">' + adv.bullets.map(b => '<li>' + esc(b) + '</li>').join('') + '</ul>' : '') + '</details>';
        }
        function show(name) {
            guideState.category = name;
            cats.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.textContent === name)));
            if (name === 'Operators') {
                let html = '<p class="sg-expl">Select an operator for a working example. Python uses lowercase and, or, not.</p><div class="sg-operators">' + StudentGuide.operators.map((o, i) => '<button type="button" data-op="' + i + '"><strong>' + esc(o[0]) + '</strong> ' + esc(o[1]) + '<code>' + esc(o[2]) + '</code></button>').join('') + '</div>';
                if (guideState.mode === 'advanced') html += '<details class="sg-advanced" open><summary>Advanced: operator precedence and mapping</summary><p class="sg-expl">Precedence mirrors Python: ** first, then * / // %, then + -, then comparisons, then NOT, then AND, then OR.</p><ul class="sg-adv-list"><li>** binds tightest. ^ is bitwise XOR at + precedence, not exponentiation.</li><li>// is floor division (DIV) and % is remainder (MOD) on integers.</li><li>AND / OR short-circuit exactly like Python and, or.</li></ul></details>';
                content.innerHTML = html + '<div class="sg-op-example"></div>';
                content.querySelectorAll('[data-op]').forEach(b => b.onclick = () => {
                    const o = StudentGuide.operators[Number(b.dataset.op)];
                    const target = content.querySelector('.sg-op-example');
                    target.innerHTML = '<figure class="sg-code"><figcaption><h4>Pseudocode</h4></figcaption><pre>' + esc('DISPLAY ' + o[2]) + '</pre></figure><figure class="sg-code"><figcaption><h4>Python equivalent</h4></figcaption><pre>' + esc('print(' + o[2].replace(/AND|OR|NOT/g, s => s.toLowerCase()) + ')') + '</pre></figure><button type="button" class="sg-insert"><i data-lucide="code-2" aria-hidden="true"></i> Insert Example</button>';
                    const insert = target.querySelector('.sg-insert');
                    if (insert) insert.onclick = () => insertExample('BEGIN\n    DISPLAY ' + o[2] + '\nEND');
                    refreshIcons(target);
                });
                return;
            }
            const item = StudentGuide.entries[name];
            const adv = item && item[3];
            content.innerHTML = '<h3>' + esc(name) + '</h3><p class="sg-expl">' + esc(item[0]) + '</p><div class="sg-comparison"><figure class="sg-code"><figcaption><h4>Pseudocode</h4><button type="button" class="sg-insert"><i data-lucide="code-2" aria-hidden="true"></i> Insert Example</button></figcaption><pre>' + esc(item[1]) + '</pre></figure><figure class="sg-code"><figcaption><h4>Python equivalent (simplified)</h4></figcaption><pre>' + esc(item[2]) + '</pre></figure></div>' + (guideState.mode === 'advanced' ? modeDetails(adv) : '');
            const insert = content.querySelector('.sg-insert');
            if (insert) insert.onclick = () => insertExample(item[1]);
            refreshIcons(content);
        }
        function insertExample(example) {
            // Insert only; never replace the selection or the rest of the student's work.
            const cursor = editor.selectionStart || 0;
            const snippet = editor.value.trim() ? example.split('\n').slice(1, -1).join('\n').replace(/^    /gm, '') : example;
            const next = StudentGuide.insert(editor.value, cursor, snippet);
            const inserted = next.slice(cursor, next.length - (editor.value.length - cursor));
            editor.setRangeText(inserted, cursor, cursor, 'end');
            editor.focus();
            editor.dispatchEvent(new Event('input', { bubbles: true }));
        }
        [...Object.keys(StudentGuide.entries), 'Operators'].forEach(name => {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'sg-chip'; b.textContent = name; b.setAttribute('aria-pressed', String(name === guideState.category)); b.onclick = () => show(name); cats.appendChild(b);
        });
        const modeButtons = guide.querySelectorAll('.seg [data-mode]');
        modeButtons.forEach(b => b.onclick = () => {
            guideState.mode = (b.dataset.mode === 'advanced') ? 'advanced' : 'beginner';
            modeButtons.forEach(x => x.setAttribute('aria-pressed', String(x === b)));
            try { localStorage.setItem(modeKey, guideState.mode); } catch (_) { /* private browsing */ }
            show(guideState.category);
        });
        guide.showCategory = name => { guide.open = true; show(StudentGuide.entries[name] ? name : 'Basics'); guide.scrollIntoView({ block: 'nearest' }); };
        if (!editor.dataset.studentInputBound) {
            editor.dataset.studentInputBound = 'true';
            let timer;
            editor.addEventListener('input', () => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    const target = root.querySelector('.sg-context');
                    if (target && userId()) { const tip = StudentGuide.tip(editor.value, editor.selectionStart); target.querySelector('span').textContent = tip; target.hidden = !tip; }
                    if (latest && latest.editorId === editorId && latest.source !== editor.value) { latest.stale = true; render(); }
                }, 450);
            });
        }
        show(guideState.category);
    }
    function translated(editorId, source, result, learning) {
        if (!userId() || !['pseudocode-editor', 'translate-input'].includes(editorId)) return;
        if (owner !== userId()) { reset(); owner = userId(); }
        const point = StudentLearningModel.attempt(owner + ':' + (++serial), source, result, learning);
        attempts.push(point);
        latest = { ...StudentLearningModel.flow(source, result), editorId, id: point.id, stale: false, runtime: null };
        step = -1; selected = result.valid ? 'structure' : 'validation'; render();
        if (!result.valid) {
            const root = element('page-' + activePage);
            const panel = root && root.querySelector('.sw-flow'); if (panel) panel.open = true;
        }
    }
    function beginRun(outputId, code) {
        if (!userId() || !['console-output', 'translate-console', 'execute-console'].includes(outputId)) return null;
        const token = { owner: userId(), epoch: sessionEpoch, id: ++serial, attemptId: latest && latest.result.valid && latest.result.python === code && !latest.stale ? latest.id : null, done: false };
        if (latest && token.attemptId === latest.id) latest.runtime = { status: 'Processing', output: '' };
        render(); return token;
    }
    function endRun(token, success, output) {
        if (!token || token.done || token.epoch !== sessionEpoch || token.owner !== userId() || token.owner !== owner) return;
        token.done = true; executions.push({ success, id: token.id });
        if (latest && token.attemptId === latest.id) latest.runtime = { status: success ? 'Completed' : 'Error', output };
        render();
    }
    function elementFocusKey(root) {
        const el = typeof document !== 'undefined' ? document.activeElement : null;
        if (!el || !el.getAttribute || !root.contains(el)) return null;
        for (const attr of ['data-stage', 'data-step', 'data-history', 'data-info', 'data-point', 'data-series', 'data-legend']) {
            const value = el.getAttribute(attr);
            if (value != null) return attr + '=' + value;
        }
        if (el.tagName === 'SUMMARY') return 'summary=' + el.textContent.trim();
        return null;
    }
    function restoreFocus(root, key) {
        if (!key) return;
        const split = key.indexOf('=');
        const attr = key.slice(0, split), value = key.slice(split + 1);
        if (attr === 'summary') {
            root.querySelectorAll('details summary').forEach(s => { if (s.textContent.trim() === value) s.focus(); });
            return;
        }
        const el = root.querySelector('[' + attr + '="' + value + '"]');
        if (el) el.focus();
    }
    function render() {
        if (!owner || owner !== userId()) return;
        const root = element('page-' + activePage), target = root && root.querySelector('.student-workspace'); if (!target) return;
        const scrollY = (typeof window !== 'undefined' && window.scrollY) || 0;
        const openSummaries = new Set();
        target.querySelectorAll('details[open]').forEach(d => { const s = d.querySelector('summary'); if (s) openSummaries.add(s.textContent.trim()); });
        const focusKey = elementFocusKey(target);
        target.innerHTML = '<details class="sw-flow"><summary>How Your Algorithm Works</summary><div class="sw-flow-body"></div></details><details class="sw-insights"><summary>Session Insights</summary><p>Live session: this signed-in browser session only. Metrics update after translating or running code.</p><div class="sw-kpis"></div><details class="sw-glossary"><summary>What do these numbers mean?</summary><p class="sw-learning"></p></details><div class="sw-chart an-chart-card"></div></details>';
        renderFlow(target.querySelector('.sw-flow-body'), root);
        const k = StudentLearningModel.kpis(attempts, executions);
        target.querySelector('.sw-kpis').innerHTML = [ ['Total Translations', k.translations], ['Compilation Success Rate', k.success.toFixed(1) + '%'], ['Runtime Error Rate', k.runtime.toFixed(1) + '%'], ['Average Generation Time', k.average.toFixed(2) + ' ms'], ['Total Errors', k.errors], ['Total Executions', k.executions] ].map(([label, value]) => '<div><strong>' + value + '</strong><span>' + label + '</span></div>').join('');
        const patterns = [...new Set(attempts.flatMap(a => a.patterns))];
        target.querySelector('.sw-learning').textContent = 'Successful attempts: ' + attempts.filter(a => a.valid).length + '. Attempts with syntax/structure issues: ' + attempts.filter(a => a.categories.some(c => /syntax|structure/i.test(c))).length + '. Attempts with detected logic issues: ' + attempts.filter(a => a.categories.some(c => /logic/i.test(c))).length + '. Distinct patterns practiced: ' + patterns.length + ' (' + (patterns.join(', ') || 'none yet') + '). Generation time includes the complete translation pipeline. Total Errors counts compilation issues; runtime failures are shown separately.';
        renderChart(target.querySelector('.sw-chart'));
        target.querySelectorAll('details').forEach(d => { const s = d.querySelector('summary'); if (s && openSummaries.has(s.textContent.trim())) d.open = true; });
        restoreFocus(target, focusKey);
        if ((typeof window !== 'undefined' && window.scrollTo) && ((window.scrollY || 0) !== scrollY)) window.scrollTo(window.scrollX || 0, scrollY);
    }
    function renderFlow(container, root) {
        if (!latest) { container.textContent = 'Translate your pseudocode to explore what PseudoPy understood.'; return; }
        container.innerHTML = (latest.stale ? '<p role="status">Editor changed. This is the previous translation; translate again to refresh it.</p>' : '') + '<div class="sw-stages">' + latest.stages.map(s => {
            const status = ['execution', 'output'].includes(s.id) && latest.runtime ? latest.runtime.status : s.status;
            return '<button type="button" data-stage="' + s.id + '" aria-pressed="' + (selected === s.id) + '"><strong>' + esc(s.label) + '</strong><small>' + esc(s.technical) + '</small><span>' + (status === 'Completed' ? '✓ ' : status === 'Needs Attention' || status === 'Error' ? '! ' : '— ') + status + '</span></button>';
        }).join('') + '</div><div class="sw-stage-content"></div><div class="sg-tabs"><button type="button" data-step="start">Step Through Algorithm</button><button type="button" data-step="previous">Previous</button><button type="button" data-step="next">Next</button></div><p class="sw-step" aria-live="polite"></p><details><summary>View technical details</summary><p>Only compiler results from your current algorithm are included.</p><pre>' + esc(JSON.stringify({ tokens: latest.result.tokens, ast: latest.result.ast, semanticWarnings: latest.result.warnings }, null, 2)) + '</pre></details>';
        const body = container.querySelector('.sw-stage-content');
        if (selected === 'tokens') body.innerHTML = '<p title="Keywords are reserved instructions. Identifiers are variable names.">Keyword: a reserved instruction. Identifier: a variable name.</p><div class="sw-tokens">' + latest.tokens.map(t => '<span>Line ' + t.line + ': <code>' + esc(t.value) + '</code> <small>' + esc(t.type) + '</small></span>').join('') + '</div>';
        else if (selected === 'structure') body.innerHTML = '<p>Program Structure (AST): indentation shows nesting and alternative branches.</p><ul class="sw-tree">' + latest.steps.map(s => '<li style="margin-inline-start:' + Math.min(s.depth, 12) + 'em">' + esc(s.label) + '</li>').join('') + '</ul>';
        else if (selected === 'validation' || selected === 'meaning') {
            const issues = selected === 'meaning' ? (latest.result.warnings || []).map(StudentLearningModel.feedback) : latest.feedback;
            body.innerHTML = issues.length ? issues.map(i => '<div class="sw-issue"><strong>Line ' + i.line + ': ' + esc(i.explanation) + '</strong><p>Fix: ' + esc(i.fix) + '</p><button type="button" data-example="' + esc(i.category) + '">Show Example</button></div>').join('') : '<p>No issues reported at this stage. This does not prove the algorithm solves the intended problem.</p>';
            body.querySelectorAll('[data-example]').forEach(b => b.onclick = () => root.querySelector('.operator-guide').showCategory(b.dataset.example));
        } else body.innerHTML = '<pre>' + esc(selected === 'python' ? latest.result.python || 'Python generation was not reached.' : ['execution', 'output'].includes(selected) ? latest.runtime?.output || 'Run the generated Python to see actual output. The structural preview does not execute code.' : latest.source) + '</pre>';
        if (selected === 'python') {
            body.innerHTML += '<h4>Pseudocode to Python mapping</h4><p>Unique statement matches from this translation. Ambiguous line matches are omitted.</p>' + latest.steps.filter(s => s.pythonLine).map(s => '<div class="sg-comparison"><pre>Line ' + s.line + ': ' + esc(s.label) + '</pre><pre>Python line ' + s.pythonLine + ': ' + esc(s.python) + '</pre></div>').join('');
        }
        container.querySelectorAll('[data-stage]').forEach(b => b.onclick = () => { selected = b.dataset.stage; render(); root.querySelector('[data-stage="' + selected + '"]')?.focus(); });
        container.querySelectorAll('[data-step]').forEach(b => b.onclick = () => {
            if (latest.stale || !latest.result.valid || !latest.steps.length || element(latest.editorId)?.value !== latest.source) return;
            step = b.dataset.step === 'start' ? 0 : Math.max(0, Math.min(latest.steps.length - 1, step + (b.dataset.step === 'next' ? 1 : -1)));
            const s = latest.steps[step];
            container.querySelector('.sw-step').textContent = 'Structure preview ' + (step + 1) + '/' + latest.steps.length + ': ' + s.label + (s.pythonLine ? ' → Python line ' + s.pythonLine + ': ' + s.python : '') + '. Both branches are shown; this is not a runtime execution trace.';
            const editor = element(latest.editorId);
            if (s.line && editor) {
                const start = latest.source.split('\n').slice(0, s.line - 1).join('\n').length + (s.line > 1 ? 1 : 0);
                editor.setSelectionRange(start, start + (latest.source.split('\n')[s.line - 1] || '').length);
                editor.scrollTop = Math.max(0, (s.line - 3) * (parseFloat(getComputedStyle(editor).lineHeight) || 22));
            }
            const python = element(latest.editorId === 'pseudocode-editor' ? 'python-output' : 'translate-output');
            if (s.pythonLine && python && python.value === latest.result.python && typeof python.setSelectionRange === 'function') {
                const lines = python.value.split('\n');
                const start = lines.slice(0, s.pythonLine - 1).join('\n').length + (s.pythonLine > 1 ? 1 : 0);
                python.setSelectionRange(start, start + lines[s.pythonLine - 1].length);
                python.scrollTop = Math.max(0, (s.pythonLine - 3) * (parseFloat(getComputedStyle(python).lineHeight) || 22));
            }
        });
    }
    function trendSummary(data) {
        const t = StudentLearningModel.trend(data);
        return t.tone === 'insufficient' ? 'Complete more translations to see your progress trend.'
            : t.tone === 'improved' ? 'Your validation score improved across your last ' + t.attempts + ' attempts.'
            : t.tone === 'dipped' ? 'Your validation score dipped across your last ' + t.attempts + ' attempts.'
            : 'Your performance is currently stable.';
    }
    function bindHistoryMode(card) {
        card.querySelectorAll('[data-history]').forEach(b => b.onclick = () => { historyMode = b.dataset.history === 'true'; render(); });
    }
    function renderChart(card) {
        const all=StudentLearningModel.trajectory(historyMode?history:attempts);
        // Compute cumulative success before trimming; the displayed history cap
        // must never change the denominator of the student's cumulative score.
        const offset=Math.max(0,all.length-60),data=all.slice(offset);
        const series=[['compilation','Compilation Success','var(--chart-1)'],['validation','Validation Indicator','var(--chart-5)'],['cumulative','Cumulative Success Rate','var(--chart-2)']];
        const units=n=>Math.round(Number(n)*10)/10;
        const focusKey=elementFocusKey(card);
        const id='student-progress-'+(activePage || 'preview');
        if(!card.querySelector('.an-chart-plot')){delete card.dataset.chartMounted;card.innerHTML='<div id="'+id+'"></div>';}
        const controls='<div class="seg" role="group" aria-label="Source of chart data"><button data-history="false" aria-pressed="'+!historyMode+'">Live Session</button><button data-history="true" aria-pressed="'+historyMode+'">Learning History</button></div>'+
            '<details data-chart-info><summary aria-label="How is this calculated?">ⓘ</summary><div class="an-popover">Validation indicator = max(0, 100 − 15 × errors − 5 × warnings − 2 × suggestions). A heuristic for feedback, not a grade. Cumulative success includes all attempts. Complete more exercises to unlock concept mastery insights.</div></details>';
        const view=anMountChart(id,{title:'Your Learning Progress',description:historyMode?'Saved translation evidence from your account.':'Based on your latest translation attempts.',
            stats:[{label:'Attempts',value:all.length},{label:'Latest success',value:all.length?units(all.at(-1).cumulative)+'%':'—'}],controls,
            insight:historyMode?historyStatus:offset?'Showing the latest 60 attempts.':'',caption:trendSummary(data)+' Indicators are not instructor grades.'});
        if(!view)return;
        view.legend.innerHTML=series.map(([key,label,color])=>'<button class="an-legend-chip" data-series="'+key+'" aria-pressed="'+visible.has(key)+'"><span class="an-legend-dot" style="background:'+color+'"></span>'+label+'</button>').join('');
        view.legend.querySelectorAll('[data-series]').forEach(b=>b.onclick=()=>{const key=b.dataset.series;if(visible.has(key)&&visible.size===1)return;visible.has(key)?visible.delete(key):visible.add(key);renderChart(card);card.querySelector('[data-series="'+key+'"]').focus();});
        bindHistoryMode(card);
        const info=card.querySelector('[data-chart-info]');info.onkeydown=e=>{if(e.key==='Escape'){info.open=false;info.querySelector('summary').focus();}};
        view.data.innerHTML='<details><summary>View chart data as a table</summary><div class="an-table-scroll"><table><thead><tr><th scope="col">Attempt</th><th scope="col">Compilation %</th><th scope="col">Validation %</th><th scope="col">Cumulative %</th><th scope="col">Errors</th></tr></thead><tbody>'+data.map((p,i)=>'<tr><td>'+(offset+i+1)+'</td><td>'+p.compilation+'</td><td>'+p.validation+'</td><td>'+units(p.cumulative)+'</td><td>'+p.errors+'</td></tr>').join('')+'</tbody></table></div></details>';
        anChartDraw(view,width=>{
            if(!data.length){anChartState(view.plot,historyMode&&/Loading/.test(historyStatus)?'loading':'empty',historyMode?'No saved translation evidence yet.':'Complete your first translation to begin.');return;}
            const x=i=>48+(data.length===1?(width-80)/2:i*(width-80)/(data.length-1)),y=linearScale([0,100],[216,16]);
            const labels=data.map((_,i)=>String(offset+i+1));
            let content=anChartGrid(width,[0,25,50,75,100],y,'%');
            content+=chartTicks(labels,data.map((_,i)=>x(i))).map(i=>'<text class="an-axis-label" x="'+x(i)+'" y="236" text-anchor="middle">'+labels[i]+'</text>').join('');
            const items=[];
            series.forEach(([key,label,color],rank)=>{
                if(!visible.has(key))return;
                const line=data.map((p,i)=>(i?'L':'M')+' '+x(i)+' '+y(p[key])).join(' ');
                content+='<path d="'+line+'" fill="none" stroke="'+color+'" stroke-width="2" stroke-dasharray="'+(rank?'5 4':'none')+'"/>';
                data.forEach((p,i)=>{const n=items.push({label:'Attempt '+(offset+i+1),rows:series.filter(([k])=>visible.has(k)).map(([k,name,c])=>({name,color:c,value:units(p[k])+'%'}))})-1;
                    content+='<circle data-mark="'+n+'" tabindex="-1" aria-label="Attempt '+(offset+i+1)+', '+label+': '+units(p[key])+' percent" cx="'+x(i)+'" cy="'+y(p[key])+'" r="4" fill="'+color+'"/>';});
            });
            view.plot.innerHTML=anChartSvg(width,'Learning progress by translation attempt',content);anBindMarks(view.plot,card,items);
        });
        restoreFocus(card,focusKey);
    }
    function loadHistory() {
        const id = owner, ticket = generation;
        const accept = records => { if (ticket !== generation || id !== userId()) return; history = StudentLearningModel.history(records, id); historyStatus = ''; render(); };
        historyStatus = 'Loading saved evidence…';
        // Query on the existing centralized Firebase instance, never all students.
        try { if (typeof firestoreReady === 'function' && firestoreReady()) {
            unsubscribe = firestore.collection(evidenceRef).where('studentId', '==', id).onSnapshot(snapshot => accept(snapshot.docs.map(d => ({ ...d.data(), _docId: d.id }))), () => { if (ticket === generation) { historyStatus = 'Saved history is unavailable. Live session tracking still works.'; render(); } });
        } else { historyStatus = 'Offline: saved history is unavailable. Live session tracking still works.'; render(); }
        } catch (_) { historyStatus = 'Saved history is unavailable. Live session tracking still works.'; render(); }
    }
    function sessionMetrics() { return owner && owner === userId() ? StudentLearningModel.kpis(attempts, executions) : StudentLearningModel.kpis([], []); }
    return { activate, reset, translated, beginRun, endRun, sessionMetrics };
})();
