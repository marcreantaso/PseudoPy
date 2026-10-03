/* UX Rule 3 — instant response.
   Run answers within one frame (busy button + skeleton), console output is
   batched per animation frame, capped at 2,000 rendered nodes with the full
   transcript retained, and long-running buttons cannot be double-submitted. */
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');

const ROOT=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');

function makeEl(tag) {
    const el={
        tagName:(tag||'DIV').toUpperCase(),className:'',dataset:{},attrs:{},parentNode:null,style:{},
        _children:[],_text:'',_html:'',
        appendChild(c){c.parentNode=el;el._children.push(c);return c;},
        remove(){if(el.parentNode){const i=el.parentNode._children.indexOf(el);if(i>=0)el.parentNode._children.splice(i,1);el.parentNode=null;}},
        setAttribute(k,v){el.attrs[k]=String(v);},
        getAttribute(k){return el.attrs[k];},
        removeAttribute(k){delete el.attrs[k];},
        querySelector(sel){return el._children.find(c=>sel==='.console-cap-notice'?c.className==='console-cap-notice':false)||null;},
        get children(){return el._children;},
        get childElementCount(){return el._children.length;},
        get textContent(){return el._text;},
        set textContent(v){el._text=String(v);},
        get innerHTML(){return el._html;},
        set innerHTML(v){el._html=String(v);el._text='';},
        scrollTop:0,scrollHeight:0,
        classList:{_s:new Set(),add(c){this._s.add(c);},remove(c){this._s.delete(c);},contains(c){return this._s.has(c);}}
    };
    return el;
}

function harness() {
    const outputEl=makeEl('DIV');
    const editorEl=makeEl('TEXTAREA');
    editorEl.value='print("hi")';
    const buttons={};
    const toasts=[];const endRuns=[];
    let configureOptions=null;
    const rafQueue=[];
    const ctx=vm.createContext({
        console,
        requestAnimationFrame:fn=>{rafQueue.push(fn);return rafQueue.length;},
        cancelAnimationFrame:()=>{},
        $id:id=>{
            if(id==='python-output')return outputEl;
            if(id==='pseudocode-editor')return editorEl;
            if(!buttons[id])buttons[id]=makeEl('BUTTON');
            return buttons[id];
        },
        getValue:()=>'',setValue:()=>{},setHtml:()=>{},setText:()=>{},
        showToast:(m,t)=>toasts.push({m,t}),
        refreshIcons:()=>{},
        document:{createElement:t=>makeEl(t),querySelectorAll:()=>[]},
        escapeHtml:s=>String(s),
        exerciseState:{activeExercise:null,expectedOutputResolved:false},
        currentUser:null,
        exerciseOpenRequest:null,
        metricsEngine:undefined,
        StudentWorkspace:{beginRun:()=>null,endRun:(run,ok,text)=>endRuns.push({ok,text})},
        skulptExecLimitOptions:ms=>({execLimit:ms}),
        SKULPT_EXEC_LIMIT_MS:15000,
        Sk:{
            python3:{},builtinFiles:undefined,
            configure(opts){configureOptions=opts;},
            misceval:{asyncToPromise:fn=>{fn();return Promise.resolve();}},
            importMainWithBody(){}
        }
    });
    ctx.__emit=text=>{if(!configureOptions)throw new Error('Sk.configure not called yet');configureOptions.output(text);};
    vm.runInContext(read('src/app/skeletons.js'),ctx);
    vm.runInContext(read('src/app/execution.js'),ctx);
    return {ctx,outputEl,editorEl,buttons,toasts,endRuns,rafQueue,
        drain(){while(rafQueue.length)rafQueue.shift()();}};
}

test('run output batches into one DOM write per animation frame',async()=>{
    const h=harness();
    h.ctx.Sk.importMainWithBody=function(){for(let i=0;i<50;i++)h.ctx.__emit('line'+i+'\n');};
    h.ctx.runPythonCode('print(1)','python-output');
    assert.equal(h.outputEl.children.length,0,'nothing written before the frame');
    h.drain();
    const spans=h.outputEl.children.filter(c=>c.tagName==='SPAN');
    assert.equal(spans.length,1,'50 output chunks land in one batched span');
    assert.equal(spans[0].textContent.split('line').length-1,50,'no output lost in batching');
    await Promise.resolve();
    assert.equal(h.endRuns.length,1,'run recorded once');
});

test('the Run button answers instantly: busy label, disabled, restored after',async()=>{
    const h=harness();
    const btn=h.ctx.$id('btn-run-code');
    btn.innerHTML='Run';
    h.ctx.executeCode('pseudocode-editor','python-output','empty');
    assert.equal(btn.disabled,true,'disabled within the same tick as the tap');
    assert.equal(btn.attrs['aria-busy'],'true');
    assert.equal(btn.textContent,'Running…','visible busy label');
    assert.equal(btn.classList.contains('is-loading-text'),true,'busy styling applied');
    await Promise.resolve();
    assert.equal(btn.disabled,false,'restored after the run resolves');
    assert.equal(btn.attrs['aria-busy'],'false');
    assert.equal(btn.innerHTML,'Run','resting markup back exactly as before');
});

test('empty editor never disables the Run button',()=>{
    const h=harness();
    h.editorEl.value='   ';
    h.ctx.executeCode('pseudocode-editor','python-output','No code');
    assert.ok(h.toasts.some(t=>t.t==='error'),'user told why nothing ran');
    const btn=h.buttons['btn-run-code'];
    assert.equal(btn?btn.disabled:false,false,'no busy state for an empty run');
});

test('2,000+ output chunks stay smooth: DOM capped, transcript complete',async()=>{
    const h=harness();
    h.ctx.runPythonCode('loop','python-output');
    for(let i=0;i<2500;i++){h.ctx.__emit('line'+i+'\n');h.drain();}
    await Promise.resolve();
    const spans=h.outputEl.children.filter(c=>c.tagName==='SPAN');
    assert.ok(spans.length<=2000,'rendered output capped at 2000 nodes (got '+spans.length+')');
    assert.ok(h.outputEl.querySelector('.console-cap-notice'),'cap notice shown once the cap engages');
    assert.equal(h.endRuns[0].text.split('line').length-1,2500,'full transcript retained for submission');
});

test('error runs flush output and restore the button state',async()=>{
    const h=harness();
    h.ctx.Sk.misceval.asyncToPromise=()=>Promise.reject(new Error('TimeoutError: budget'));
    h.ctx.runPythonCode('bad','python-output');
    await new Promise(r=>setTimeout(r,0)); // let the rejection chain settle
    assert.equal(h.buttons['btn-run-code'].disabled,false,'button restored on failure');
    assert.ok(h.outputEl._text.includes('Error')||h.outputEl.children.some(c=>String(c.textContent).includes('Error')),'error text flushed to the console');
});

test('the cap and batching policy mirrors the repo constants',()=>{
    const exec=read('src/app/execution.js');
    assert.match(exec,/RUN_OUTPUT_NODE_CAP = 2000/);
    assert.match(exec,/requestAnimationFrame/);
    assert.match(exec,/setRunButtonBusy/);
    const css=read('style.css');
    assert.match(css,/console-cap-notice/);
    assert.match(css,/\.btn:active:not\(:disabled\)/,'global pressed state for every tap');
    const touchBlock=css.slice(css.indexOf('@media (hover: none)'));
    assert.ok(touchBlock.includes('.btn:active'),'touch pressed state kept');
    const settings=read('src/app/student-settings.js');
    assert.match(settings,/is-loading-text/,'password change button goes busy');
});
