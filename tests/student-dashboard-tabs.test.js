const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');

// A DOM small enough to run the real tab shell: elements, a scoped tree, and
// the subset of the API the workspace code touches. Anything the code needs
// that is missing here fails loudly rather than silently passing.
class El {
    constructor(tag){this.tagName=(tag||'div').toUpperCase();this.children=[];this.parentNode=null;
        this.attributes=new Map();this.dataset={};this.style={};this._text='';this._listeners=new Map();
        this.classList={ _el:this,
            add:(...c)=>c.forEach(x=>this.attributes.set('class',((this.attributes.get('class')||'')+' '+x).trim())),
            contains:c=>(this.attributes.get('class')||'').split(/\s+/).includes(c) };
        this.hidden=false;this.tabIndex=-1;this.isConnected=true;}
    set className(v){this.attributes.set('class',v);} get className(){return this.attributes.get('class')||'';}
    set textContent(v){this._text=v;this.children.forEach(c=>c.parentNode=null);this.children=[];}
    get textContent(){return this._text;}
    set innerHTML(v){
        this.children.forEach(c=>c.parentNode=null);this.children=[];this._text='';
        this._html=v;if(v)this.children=parseHTML(v);
        this.children.forEach(c=>c.parentNode=this);
    }
    get innerHTML(){return this._html||'';}
    // Real DOM appendChild/insertBefore MOVE a node: it is detached from any
    // previous parent first. Without this, moving the page children into the
    // Workspace panel would leave them in both places.
    _detach(c){if(c.parentNode){const i=c.parentNode.children.indexOf(c);if(i>=0)c.parentNode.children.splice(i,1);}}
    appendChild(c){this._detach(c);c.parentNode=this;this.children.push(c);return c;}
    insertBefore(c,ref){this._detach(c);c.parentNode=this;const i=this.children.indexOf(ref);this.children.splice(i<0?this.children.length:i,0,c);return c;}
    removeChild(c){const i=this.children.indexOf(c);if(i>=0)this.children.splice(i,1);c.parentNode=null;return c;}
    remove(){if(this.parentNode)this.parentNode.removeChild(this);}
    setAttribute(k,v){
        this.attributes.set(k,String(v));
        // Mirror the reflected properties the code and the chart stub read.
        if(k==='id')this.id=String(v);
        if(k==='hidden')this.hidden=true;
    }
    getAttribute(k){
        if(k==='id')return this.id==null?null:String(this.id);
        return this.attributes.has(k)?this.attributes.get(k):null;
    }
    focus(){DOC.activeElement=this;}
    click(){
        DOC.activeElement=this;
        // Real clicks bubble, and the tab rail relies on delegation.
        let n=this;
        while(n){
            (n._listeners.get('click')||[]).forEach(h=>h({target:this,preventDefault(){}}));
            n=n.parentNode;
        }
    }
    addEventListener(type,fn){if(!this._listeners.has(type))this._listeners.set(type,[]);this._listeners.get(type).push(fn);}
    dispatch(type,event){(this._listeners.get(type)||[]).forEach(h=>h(Object.assign({target:this,preventDefault(){}},event)));}
    descendants(){const out=[];const walk=n=>n.children.forEach(c=>{out.push(c);walk(c);});walk(this);return out;}
    matches(sel){
        sel=sel.trim();
        if(sel.startsWith(':scope >'))return this.children.some(c=>c.matches(sel.slice(8).trim()));
        // Compound selectors used by the workspace: tag.class, .class[attr="v"],
        // [attr="v"], and plain tags. Split into parts and require every match.
        const attr=sel.match(/\[([\w-]+)(?:="([^"]*)")?\]/);
        if(attr){
            const actual=this.getAttribute(attr[1]);
            if(actual===null)return false;
            if(attr[2]!==undefined&&actual!==attr[2])return false;
            sel=sel.replace(attr[0],'').trim();
            if(!sel)return true;
        }
        if(sel.startsWith('#'))return this.id===sel.slice(1);
        if(sel.startsWith('.'))return this.classList.contains(sel.slice(1));
        return this.tagName===sel.toUpperCase();
    }
    get firstChild(){return this.children[0]||null;}
    contains(n){let c=n;while(c){if(c===this)return true;c=c.parentNode;}return false;}
    querySelectorAll(sel){
        const parts=sel.split(',').map(s=>s.trim()).filter(Boolean);
        return parts.flatMap(part=>{
            if(part.startsWith(':scope >'))return this.children.filter(c=>c.matches(part.slice(8).trim()));
            // Descendant combinator: match the rightmost simple selector, then
            // require an ancestor matching the left-hand side.
            const pieces=part.split(/\s+/).filter(Boolean);
            const last=pieces[pieces.length-1],left=pieces.slice(0,-1);
            return this.descendants().filter(n=>{
                if(!n.matches(last))return false;
                if(!left.length)return true;
                let a=n.parentNode;
                while(a){if(left.every(p=>a.matches(p)))return true;a=a.parentNode;}
                return false;
            });
        });
    }
    querySelector(sel){const r=this.querySelectorAll(sel);return r.length?r[0]:null;}
    closest(sel){
        const parts=sel.split(',').map(s=>s.trim());
        let n=this;
        while(n){if(parts.some(p=>n.matches(p)))return n;n=n.parentNode;}
        return null;
    }
    get all(){return this.descendants();}
}
function make(tag){return new El(tag);}

const VOID=new Set(['br','hr','img','input','meta','link','source','path','circle','line','rect','text','use','area','col','embed','track','wbr']);
/**
 * Minimal HTML tree builder. The workspace only emits well-formed,
 * non-self-closing markup, so a tag-stack walk is enough to give the tab code
 * a real element tree to query. Void/SVG children keep their attributes on the
 * element itself, which is all the assertions need.
 */
function parseHTML(html){
    const rootNode=new El('div'),stack=[rootNode];
    const re=/<\/?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>|([^<]+)/g;
    let m;
    while((m=re.exec(html))){
        const top=stack[stack.length-1];
        if(m[4]!==undefined){
            const text=m[4];
            if(text.trim())top.appendChild(Object.assign(new El('#text'),{tagName:'#TEXT',_text:text,isText:true}));
            continue;
        }
        const tag=m[1].toLowerCase(),closing=m[0][1]==='/',selfClose=m[3]==='/';
        if(closing){
            for(let i=stack.length-1;i>0;i--)if(stack[i].tagName===tag.toUpperCase()){stack.length=i;break;}
            continue;
        }
        const el=new El(tag);
        const attrRe=/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;let a;
        while((a=attrRe.exec(m[2]||''))){
            if(!/^[a-zA-Z-]/.test(a[1]))continue;// part of another attribute name
            const val=a[2]!==undefined?a[2]:a[3]!==undefined?a[3]:a[4]!==undefined?a[4]:'';
            el.setAttribute(a[1],val);
        }
        top.appendChild(el);
        if(!selfClose&&!VOID.has(tag))stack.push(el);
    }
    return rootNode.children.slice();
}

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/student/workspace.js'),'utf8');

/** Build a page whose children are the real Student workspace controls. */
function buildPage(){
    const page=new El('div');
    const editor=make('textarea'); editor.id='pseudocode-editor';
    const python=make('textarea'); python.id='python-output';
    const console_=make('pre'); console_.id='console-output';
    const bar=make('div'); bar.id='exercise-action-bar';
    ['btn-translate-pseudocode','btn-run-code','btn-submit-exercise'].forEach(id=>{const b=make('button');b.id=id;bar.appendChild(b);});
    [editor,python,console_,bar].forEach(n=>page.appendChild(n));
    const ids={}; [editor,python,console_,bar].forEach(n=>ids[n.id]=n);
    return {page,ids};
}

/** Registry-backed document: getElementById resolves anything ever attached. */
const DOC={activeElement:null,_roots:[],_byId:{},
    createElement:tag=>new El(tag),
    getElementById(id){
        for(const r of DOC._roots){const n=r.descendants().find(x=>x.id===id);if(n)return n;}
        return DOC._byId[id]||null;
    },
    querySelectorAll(sel){
        const out=[];DOC._roots.forEach(r=>out.push(...r.querySelectorAll(sel)));
        return out;
    }};
function load(){
    const {page,ids}=buildPage();
    DOC._roots=[page];DOC._byId=Object.assign({},ids,{'page-write-pseudocode':page});
    const ctx=vm.createContext({
        console,performance,document:DOC,StudentLearningModel:require('../src/student/learning-model'),sessionStorage:(()=>{const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear()};})(),
        currentUser:{_docId:'stu_1',role:'student'},
        requestAnimationFrame:fn=>fn(),setTimeout,clearTimeout,
        window:{scrollY:0,scrollX:0,scrollTo(){}},
        // Chart host stub: the real chart system needs a measuring engine that a
        // shim DOM cannot provide. These tests assert tab wiring, so a plot
        // element with a recorded width is enough.
        anMountChart(id,config){
            // Mirrors the real mount's contract: find the plot by id, adopt the
            // closest chart card, and build the card skeleton only once.
            const plot=DOC.getElementById(id);
            if(!plot)return null;
            const card=plot.closest('.an-chart-card, .chart-container');
            if(!card)return null;
            if(!card.dataset.chartMounted){
                card.classList.add('an-chart-system');
                card.dataset.chartMounted='true';
                card.innerHTML='<div class="an-chart-header"></div><div class="an-chart-controls"></div><p class="an-chart-insight" aria-live="polite"></p><div class="an-chart-plot" id="'+id+'"></div><div class="an-svg-legend"></div><div class="an-chart-footer"></div><div class="an-chart-data"></div>';
            }
            const header=card.querySelector('.an-chart-header');
            header.innerHTML='<div class="an-chart-title"></div>';
            const controls=card.querySelector('.an-chart-controls');
            controls.innerHTML=(config&&config.controls)||'';
            card.querySelector('.an-chart-insight').textContent=(config&&config.insight)||'';
            card.querySelector('.an-chart-footer').textContent=(config&&config.caption)||'';
            const livePlot=card.querySelector('.an-chart-plot');
            livePlot.clientWidth=livePlot.clientWidth||0;
            return{card,plot:livePlot,controls,legend:card.querySelector('.an-svg-legend'),data:card.querySelector('.an-chart-data')};
        },
        anChartDraw(){},anChartRedraw(){return true;},anHideTooltip(){},anChartDataTable(){return make('div');},
        anShowTooltip(){},anPositionTooltip(){},localStorage:(()=>{const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};})(),
        dbList:async()=>[],loadSessionHistory:async()=>[],listSessionHistory:async()=>[],
        StudentWorkspaceLog:{},
    });
    ctx.currentUser=ctx.currentUser;
    vm.runInContext(source+'\n;this.W=StudentWorkspace;',ctx);
    return {page,ids,W:ctx.W,ctx};
}

test('the shell builds three tabs wired to three panels and moves the live editor in',()=>{
    const {page,W}=load();
    W.activate('write-pseudocode');
    const shell=page.children[0];
    assert.equal(shell.classList.contains('student-workspace'),true,'shell is built');
    const tabs=shell.querySelectorAll('[role="tab"]');
    assert.equal(tabs.length,3,'three tabs');
    assert.deepEqual(tabs.map(t=>t.textContent),['Workspace','How Your Algorithm Works','Session Insights']);
    assert.deepEqual(tabs.map(t=>t.getAttribute('aria-controls')),['sw-panel-workspace','sw-panel-flow','sw-panel-insights']);
    assert.deepEqual(tabs.map(t=>t.id),['sw-tab-workspace','sw-tab-flow','sw-tab-insights']);
    const panels=shell.querySelectorAll('[role="tabpanel"]');
    assert.deepEqual(panels.map(p=>p.getAttribute('aria-labelledby')),['sw-tab-workspace','sw-tab-flow','sw-tab-insights']);
    assert.deepEqual(panels.map(p=>p.hidden),[false,true,true],'only Workspace is visible');
    const wp=shell.querySelector('#sw-panel-workspace');
    assert.ok(wp.querySelector('#pseudocode-editor'),'editor moved into the Workspace panel');
    assert.ok(wp.querySelector('#python-output')&&wp.querySelector('#console-output'),'output and console moved too');
    assert.ok(wp.querySelector('#btn-translate-pseudocode')&&wp.querySelector('#btn-run-code')&&wp.querySelector('#btn-submit-exercise'),'actions moved too');
});

test('selection toggles aria-selected, roving tabindex and panel visibility',()=>{
    const {page,W}=load();
    W.activate('write-pseudocode');
    const shell=page.children[0];
    shell.querySelector('#sw-tab-insights').click();
    assert.deepEqual(shell.querySelectorAll('[role="tab"]').map(t=>t.getAttribute('aria-selected')),['false','false','true']);
    assert.deepEqual(shell.querySelectorAll('[role="tab"]').map(t=>t.tabIndex),[-1,-1,0],'roving tabindex');
    assert.deepEqual(shell.querySelectorAll('[role="tabpanel"]').map(p=>p.hidden),[true,true,false]);
});

test('arrow keys, Home and End move between tabs and follow with selection',()=>{
    const {page,W}=load();
    W.activate('write-pseudocode');
    const shell=page.children[0],list=shell.querySelector('.sw-tabs');
    const at=()=>DOC.activeElement.id;
    shell.querySelector('#sw-tab-workspace').focus();
    list.dispatch('keydown',{key:'ArrowRight'}); assert.equal(at(),'sw-tab-flow','ArrowRight');
    list.dispatch('keydown',{key:'ArrowRight'}); assert.equal(at(),'sw-tab-insights','ArrowRight twice');
    list.dispatch('keydown',{key:'ArrowRight'}); assert.equal(at(),'sw-tab-workspace','wraps forward');
    list.dispatch('keydown',{key:'ArrowLeft'}); assert.equal(at(),'sw-tab-insights','wraps backward');
    list.dispatch('keydown',{key:'Home'}); assert.equal(at(),'sw-tab-workspace','Home');
    list.dispatch('keydown',{key:'End'}); assert.equal(at(),'sw-tab-insights','End');
    assert.deepEqual(shell.querySelectorAll('[role="tabpanel"]').map(p=>p.hidden),[true,true,false],'selection follows focus');
});

test('activation is idempotent: rebuilding never duplicates the editor or panels',()=>{
    const {page,W,ids}=load();
    W.activate('write-pseudocode');
    W.activate('write-pseudocode');
    W.activate('translate');
    const pageEl=page;
    assert.equal(pageEl.querySelectorAll('#sw-panel-workspace').length,1,'one workspace panel');
    assert.equal(pageEl.querySelectorAll('#pseudocode-editor').length,1,'editor not duplicated');
    assert.equal(pageEl.querySelectorAll('[role="tab"]').length,3,'still three tabs');
});

test('the selected tab is remembered per student and restored on return',()=>{
    const {page,W}=load();
    W.activate('write-pseudocode');
    page.children[0].querySelector('#sw-tab-insights').click();
    // Route away and back: the shell is rebuilt, the choice is restored.
    W.activate('student-settings');
    W.activate('write-pseudocode');
    assert.deepEqual(page.children[0].querySelectorAll('[role="tab"]').map(t=>t.getAttribute('aria-selected')),['false','false','true']);
});

test('the flow panel is reachable by tab, not duplicated below the workspace',()=>{
    const {page,W}=load();
    W.activate('write-pseudocode');
    const shell=page.children[0];
    assert.equal(page.querySelectorAll('.sw-flow-body').length,1,'exactly one flow body');
    assert.equal(page.querySelectorAll('.sw-kpis').length,1,'exactly one KPI grid');
    assert.ok(!page.innerHTML.includes('<details class="sw-flow">'),'the long accordion is gone');
    const flow=shell.querySelector('#sw-panel-flow');
    assert.equal(flow.getAttribute('role'),'tabpanel');
});

test('the chart is redrawn when the insights panel becomes visible',()=>{
    const {page,W,ctx}=load();
    let redraws=0;
    // Hidden plots measure zero, which is exactly why an explicit redraw is
    // needed once the panel is on screen.
    ctx.anChartRedraw=plot=>{redraws++;return true;};
    W.activate('write-pseudocode');
    const shell=page.children[0];
    const plot=shell.querySelector('#sw-panel-insights .an-chart-plot');
    assert.ok(plot,'insights plot exists');
    assert.equal(plot.clientWidth,0,'the plot starts unmeasured while its tab is hidden');
    const before=redraws;
    shell.querySelector('#sw-tab-insights').click();
    plot.clientWidth=600;// now visible and laid out
    shell.querySelector('#sw-tab-insights').click();
    assert.ok(redraws>before,'showing the insights tab triggers an explicit redraw');
});

test('chart-system exposes anChartRedraw for on-demand repaint',()=>{
    const chart=fs.readFileSync(path.join(root,'src/app/chart-system.js'),'utf8');
    assert.match(chart,/function anChartRedraw\(/);
    assert.match(chart,/job\.run\(\)/,'the stored render pass is re-run');
});

test('tab CSS avoids a nested scroll container and meets touch targets',()=>{
    const css=fs.readFileSync(path.join(root,'student-workspace.css'),'utf8');
    const tabRule=css.match(/\.sw-tab \{[^}]*\}/);
    assert.ok(tabRule,'tab base rule exists');
    assert.match(tabRule[0],/min-height: 44px/,'tab is at least 44px tall');
    assert.match(css,/\.sw-tabs \{[^}]*flex-wrap: wrap/,'the tab rail wraps instead of scrolling');
    const mobile=css.match(/@media \(max-width: 767px\) \{[\s\S]*?\n\}/);
    assert.ok(mobile,'mobile block exists');
    assert.match(mobile[0],/flex: 1 1 calc\(50%/,'narrow screens use two rows, not a rail');
    // Scoped per rule block: an unanchored search would match the pre-existing
    // .sg-cats category rail, which is a different component on purpose.
    ['.sw-tab','.sw-tabs','.sw-panels','.sw-panel'].forEach(sel=>{
        const pattern=new RegExp('(?:^|[,}\\s])'+sel.replace('.','\\.')+'(?![\\w-])[^{]*\\{[^}]*\\}','g');
        (css.match(pattern)||[]).forEach(rule=>assert.doesNotMatch(rule,/overflow(-x|-y)?: ?(auto|scroll)/,
            sel+' must not create its own scroll container: '+rule.replace(/\s+/g,' ').trim()));
    });
});