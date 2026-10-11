(function(){
  const STATES={IDLE:'idle',VALIDATING:'validating',RUNNING:'running',COMPLETED:'completed',FAILED:'failed',CANCELLED:'cancelled'};
  let state=STATES.IDLE;
  let lastResult=null;
  let isStale=false;
  let currentOpId=0;
  let benchAbort=false;
  function $(id){ return document.getElementById(id); }
  function setStatus(msg){ const el=$('sop2-status'); if(el) el.textContent=msg||''; }
  function csvEscape(v){
    let s=v==null?'':String(v);
    if(/[",\n\r]/.test(s)){ s='"'+s.replace(/"/g,'""')+'"'; }
    if(/^[=+\-@]/.test(s)) s="'"+s;
    return s;
  }
  function markStale(){ isStale=true; if(lastResult&&$('sop2-result')) $('sop2-result').innerHTML='<div class="devtools-idle-message"><p>Results are stale. Re-run to refresh.</p></div>'; $('sop2-export-json').disabled=true; $('sop2-export-csv').disabled=true; }
  function lineFreq(s){ const m={}; String(s||'').split(/\r?\n/).forEach(x=>{const t=x.trim(); if(t)m[t]=(m[t]||0)+1;}); return m; }
  function lineMetrics(gen,exp){
    const g=lineFreq(gen), e=lineFreq(exp);
    let m=0; for(const k in g){ if(e[k]) m+=Math.min(g[k],e[k]); }
    const elines=Object.values(e).reduce((a,b)=>a+b,0)||0;
    const glines=Object.values(g).reduce((a,b)=>a+b,0)||0;
    const p=elines? m/elines:(glines?0:1);
    const r=glines? m/glines:(elines?0:1);
    const f1=(p+r)===0?0:(2*p*r)/(p+r);
    return {precision:p,recall:r,f1,matched:m,refLines:elines,genLines:glines, exactMatch: elines===glines && m===glines && glines>0 && elines>0 };
  }
  function pyCheck(py){
    if(!py) return {ok:false,msg:'Empty'};
    try{
      if(typeof Sk==='undefined') return {ok:true,msg:'Skulpt not loaded (syntax check skipped)'};
      Sk.parse(py,'<sop2-check>');
      return {ok:true,msg:'OK'};
    }catch(e){ return {ok:false,msg:e.toString()}; }
  }
  function norm(s){ let x=s||''; if(typeof normalizeUnicodeOperators==='function') x=normalizeUnicodeOperators(x); if(typeof normalizeLineNumbers==='function') x=normalizeLineNumbers(x); return x; }
  function setBusy(b){
    ['sop2-compare','sop2-run','sop2-bench','sop2-export-json','sop2-export-csv'].forEach(id=>{const el=$(id); if(el) el.disabled=b;});
  }
  function render(r){
    lastResult=r; isStale=false; $('sop2-export-json').disabled=false; $('sop2-export-csv').disabled=false;
    const pm=r.metrics.pseudopy,bm=r.metrics.baseline;
    let html='<table style="width:100%;border-collapse:collapse"><tr><th>Metric</th><th>Baseline</th><th>PseudoPy</th><th>Diff</th></tr>';
    html+='<tr><td>Precision</td><td>'+pm.precision.toFixed(3)+'</td><td>'+bm.precision.toFixed(3)+'</td><td>'+(pm.precision-bm.precision).toFixed(3)+'</td></tr>';
    html+='<tr><td>Recall</td><td>'+pm.recall.toFixed(3)+'</td><td>'+bm.recall.toFixed(3)+'</td><td>'+(pm.recall-bm.recall).toFixed(3)+'</td></tr>';
    html+='<tr><td>F1</td><td>'+pm.f1.toFixed(3)+'</td><td>'+bm.f1.toFixed(3)+'</td><td>'+(pm.f1-bm.f1).toFixed(3)+'</td></tr>';
    html+='</table>';
    $('sop2-result').innerHTML=html;
  }
  async function onCompare(){
    const src=norm(($('sop2-src')||{}).value||(($('devtools-pseudocode')||{}).value)||'');
    const ref=($('sop2-ref')||{}).value||'';
    if(!src){ setStatus('Enter pseudocode'); return; }
    if(!ref){ setStatus('Enter reference Python'); return; }
    setBusy(true); setStatus('Comparing...');
    try{
      let baseRes, pseudoRes;
      try{ const {baselineTranslate}=require('./src/research/baseline-translator'); baseRes=baselineTranslate(src); }catch(e){ baseRes={generatedPython:'',success:false}; }
      try{ const c=require('./compiler'); pseudoRes=new c.PseudocodeCompiler().compile(src); }catch(e){ pseudoRes={valid:false,python:'',errors:[e.message]}; }
      const m1=lineMetrics(pseudoRes.python||'',ref); const m2=lineMetrics(baseRes.generatedPython||'',ref);
      const res={caseId:'ui',input:src,expectedPython:ref,pseudopy:{generatedPython:pseudoRes.python||'',compileSuccess:!!pseudoRes.valid},baseline:{generatedPython:baseRes.generatedPython||'',compileSuccess:!!baseRes.success},metrics:{pseudopy:m1,baseline:m2}};
      render(res); setStatus('Done'); lastResult=res;
    }catch(e){ setStatus('Error'); }
    setBusy(false);
  }
  function wire(){
    const c=$('sop2-compare'); if(c) c.addEventListener('click',onCompare);
    const s=$('sop2-src'), r=$('sop2-ref');
    if(s) s.addEventListener('input',markStale);
    if(r) r.addEventListener('input',markStale);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',wire); else wire();
  window.__sop2ui={};
})();
// Research UI for Developer Options
(function(){
  const STATES = { IDLE:'idle', VALIDATING:'validating', RUNNING:'running', COMPLETED:'completed', FAILED:'failed', CANCELLED:'cancelled' };
  let state = STATES.IDLE;
  let lastResult = null;
  let isStale = false;
  let currentOpId = 0;
  let benchAbort = false;

  function $(id){ return document.getElementById(id); }
  function esc(s){ if(s==null) return ''; const d=document.createElement('div'); d.textContent=String(s); return d.innerHTML; }
  function setStatus(msg){ const el=$('sop2-status'); if(el) el.textContent = msg||''; }
  function csvEscape(v){
    let s = v==null?'':String(v);
    if(/[",\n\r]/.test(s)){ s = '"' + s.replace(/"/g,'""') + '"'; }
    if(/^[=+\-@]/.test(s)) s = "'" + s;
    return s;
  }
  function markStale(){ isStale=true; if(lastResult && $('sop2-result')) $('sop2-result').innerHTML = '<div class="devtools-idle-message"><p>Results are stale. Re-run to refresh.</p></div>'; }
  function lineFreq(s){ const map={}; (String(s||'').split(/\r?\n/)).forEach(x=>{const t=x.trim(); if(t) map[t]=(map[t]||0)+1;}); return map; }
  function lineMetrics(gen,exp){
    const g=lineFreq(gen), e=lineFreq(exp);
    let m=0; for(const k in g){ if(e[k]) m += Math.min(g[k],e[k]); }
    const elines = Object.values(e).reduce((a,b)=>a+b,0)||0;
    const glines = Object.values(g).reduce((a,b)=>a+b,0)||0;
    const p = elines? m/elines : (glines?0:1);
    const r = glines? m/glines : (elines?0:1);
    const f1 = (p+r)===0?0:(2*p*r)/(p+r);
    return {precision:p,recall:r,f1,matched:m,refLines:elines,genLines:glines};
  }
  function pySyntaxCheck(py){
    if(!py) return {ok:false,msg:'Empty Python'};
    try{
      if(typeof Sk==='undefined') return {ok:true,msg:'Skulpt not loaded (syntax check skipped)'};
      Sk.parse(py,'<sop2-check>');
      return {ok:true,msg:'OK'};
    }catch(e){ return {ok:false,msg:e.toString()}; }
  }
  function normalizeForCompare(src){ let s=src||''; if(typeof normalizeUnicodeOperators==='function') s=normalizeUnicodeOperators(s); if(typeof normalizeLineNumbers==='function') s=normalizeLineNumbers(s); return s; }
  function setBusy(busy){
    const ids=['sop2-compare','sop2-run','sop2-bench','sop2-export-json','sop2-export-csv','norm-preview','norm-apply','norm-copy'];
    ids.forEach(id=>{const el=$(id); if(el) el.disabled=busy;});
  }
  function wire(){
    const sSrc=$('sop2-src'), sRef=$('sop2-ref');
    if(sSrc) sSrc.addEventListener('input',markStale);
    if(sRef) sRef.addEventListener('input',markStale);
    setupNorm();
  }
  function setupNorm(){
    const normIn=$('norm-input'), normOut=$('norm-output'), normPrev=$('norm-preview'), normApply=$('norm-apply'), normCopy=$('norm-copy'), normDiff=$('norm-diff');
    if(normPrev){ normPrev.addEventListener('click',function(){ if(!normIn)return; let s=normIn.value||''; s=normalizeForCompare(s); if(normOut) normOut.value=s; if(normDiff) normDiff.textContent=(normIn.value===s)?'No changes.':'Normalized.'; }); }
    if(normApply){ normApply.addEventListener('click',function(){ const src=$('devtools-pseudocode'); if(src&&normOut&&normOut.value){ src.value=normOut.value; if(typeof showToast==='function') showToast('Applied normalized source to editor.','success'); markStale(); }}); }
    if(normCopy){ normCopy.addEventListener('click',async function(){ if(normOut&&normOut.value){ try{await navigator.clipboard.writeText(normOut.value); if(showToast) showToast('Copied.','success');}catch(e){} }}); }
    if(normIn) normIn.addEventListener('input',()=>{ if(normDiff) normDiff.textContent=''; });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',wire); else wire();
})();