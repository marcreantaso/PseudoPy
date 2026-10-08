// Research UI for Developer Options
function setupResearchUI() {
  const normIn=document.getElementById('norm-input');
  const normOut=document.getElementById('norm-output');
  const normPrev=document.getElementById('norm-preview');
  const normApply=document.getElementById('norm-apply');
  const normCopy=document.getElementById('norm-copy');
  const normDiff=document.getElementById('norm-diff');
  if(normPrev){ normPrev.addEventListener('click',function(){
    if(!normIn) return;
    let s=normIn.value||'';
    if(typeof normalizeUnicodeOperators==='function') s=normalizeUnicodeOperators(s);
    if(typeof normalizeLineNumbers==='function') s=normalizeLineNumbers(s);
    if(normOut) normOut.value=s;
    if(normDiff) normDiff.textContent=(normIn.value===s)?'No changes.':'Normalized.';
  });}
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',setupResearchUI); else setupResearchUI();
