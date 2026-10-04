/* Instructor analytics. Shared chart layout and interactions: chart-system.js. */
var analyticsPieActiveName = null;
function anChartPalette() { return [1,2,3,4,5].map(n=>'var(--chart-'+n+')'); }
function anAttr(value) { return String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
function anEsc(value) { return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function renderAnalyticsCharts(records) {
    const submissions=(records || []).filter(isSubmissionActivity);
    setText('an-live-status','Showing recorded submissions and translation attempts for the selected filters.');
    [[renderTrajectoryChart,'an-trajectory-svg',submissions],[renderSubmissionActivityChart,'an-submissions-svg',submissions],[renderErrorDistributionChart,'an-error-svg',records]].forEach(([render,id,data])=>{
        try { render(data); } catch(e) { console.error('[Analytics] chart failed',e); showChartError(id); }
    });
}
function showChartError(id) { anChartState($id(id),'error','',()=>loadAnalytics()); }
function showAnalyticsLoading() {
    setText('an-live-status','Loading analytics…');
    ['an-trajectory-svg','an-submissions-svg','an-error-svg'].forEach(id=>anChartState($id(id),'loading'));
}
function anEnsureTooltip(card) {
    if(!card)return null;
    let tip=card.querySelector('.an-svg-tooltip');
    if(!tip){tip=document.createElement('div');tip.className='an-svg-tooltip hidden';tip.setAttribute('role','tooltip');card.appendChild(tip);}
    return tip;
}
function anShowTooltip(tip,event,html,card) {
    if(!tip)return;
    // Save the target now: currentTarget is null after dispatch returns.
    tip._pending={event,html,target:event.currentTarget || event.target};
    if(tip._frame)return;
    tip._frame=requestAnimationFrame(()=>{
        tip._frame=0;
        const next=tip._pending;if(!next)return;
        tip.innerHTML=next.html;tip.classList.remove('hidden');
        const base=card.getBoundingClientRect();
        const rect=next.target?.getBoundingClientRect() || base;
        const x=next.event.clientX || rect.left+rect.width/2;
        const y=next.event.clientY || rect.top;
        const left=Math.max(8,Math.min(x+12,window.innerWidth-tip.offsetWidth-8));
        const top=Math.max(8,Math.min(y-tip.offsetHeight-12,window.innerHeight-tip.offsetHeight-8));
        tip.style.left=(left-base.left)+'px';tip.style.top=(top-base.top)+'px';
    });
}
function anHideTooltip(tip) { if(tip){tip._pending=null;tip.classList.add('hidden');} }
function renderTrajectoryChart(records) { anRenderTrajectory(records || []); }
function anSplitSegments(points) {
    const result=[];let current=[];
    points.forEach(p=>{if(p.y==null){if(current.length)result.push(current);current=[];}else current.push(p);});
    if(current.length)result.push(current);return result;
}

function renderSubmissionActivityChart(records) {
    const mode=$id('chart-view-mode')?.value || 'day';
    const series=buildSubmissionSeries(records || [],{monthVal:$id('filter-month')?.value ?? '',weekVal:$id('filter-week')?.value || '',dateVal:$id('filter-date')?.value || '',viewMode:mode});
    const total=series.reduce((sum,b)=>sum+b.count,0),peak=Math.max(0,...series.map(b=>b.count));
    const view=anMountChart('an-submissions-svg',{title:'Student Submission Activity',description:'Submissions over the selected period.',
        stats:[{label:'Submissions',value:total},{label:'Peak period',value:peak}],
        controls:`<label>View by <select id="chart-view-mode"><option value="day" ${mode==='day'?'selected':''}>Day</option><option value="month" ${mode==='month'?'selected':''}>Month</option></select></label>`,
        caption:'Select a point to view submissions for that period.'});
    if(!view)return;
    view.controls.querySelector('select').onchange=()=>{renderSubmissionActivityChart(records);view.controls.querySelector('select').focus();};
    view.legend.innerHTML=anLegendChip('Submissions',String(total),'var(--chart-1)');
    anChartDraw(view,width=>{
        if(!total){anChartState(view.plot,'empty','No submissions match this period.');return;}
        const yMax=niceCeil(peak),y=linearScale([0,yMax],[216,16]);
        const x=i=>48+(series.length===1?(width-80)/2:i*(width-80)/(series.length-1));
        const points=series.map((b,i)=>({x:i,y:b.count})),ticks=[0,Math.ceil(yMax/2),yMax];
        const items=series.map(b=>({label:b.sub+' · '+b.label,rows:[{name:'Submissions',value:b.count,color:'var(--chart-1)'}],bucket:b}));
        // Straight segments avoid smoothing below zero between sparse counts.
        const line=points.map((p,i)=>`${i?'L':'M'} ${x(p.x)} ${y(p.y)}`).join(' ');
        let content='<defs><linearGradient id="an-submission-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--chart-1)" stop-opacity=".3"/><stop offset="1" stop-color="var(--chart-1)" stop-opacity=".03"/></linearGradient></defs>';
        content+=anChartGrid(width,ticks,y,'')+`<path d="${line} L ${x(points.length-1)} 216 L ${x(0)} 216 Z" fill="url(#an-submission-fill)"/><path d="${line}" fill="none" stroke="var(--chart-1)" stroke-width="2"/>`;
        content+=points.map((p,i)=>`<circle data-mark="${i}" tabindex="-1" role="button" aria-label="${anAttr(items[i].label+': '+p.y+' submissions; filter this period')}" cx="${x(i)}" cy="${y(p.y)}" r="5" fill="var(--chart-1)"/>`).join('');
        content+=chartTicks(series.map(b=>b.sub),series.map((_,i)=>x(i))).map(i=>`<text class="an-axis-label" x="${x(i)}" y="236" text-anchor="middle">${anEsc(series[i].sub)}</text>`).join('');
        view.plot.innerHTML=anChartSvg(width,'Submission activity by period',content);
        anBindMarks(view.plot,view.card,items,item=>{
            const b=item.bucket;
            if(b.dateKey&&$id('filter-date'))$id('filter-date').value=b.dateKey;
            else if(b.weekRange&&$id('filter-week'))$id('filter-week').value=String(b.weekRange.w);
            else return;
            applyAnalyticsFilters();
        });
    });
}

function renderErrorDistributionChart(records) {
    anRenderDonut('an-error-svg',records || [],{title:'Error Distribution',description:'Translation errors by type, including free practice.',
        active:analyticsPieActiveName,onSelect:name=>{analyticsPieActiveName=name;renderErrorDistributionChart(records);}});
}
function toggleErrorSlice(name) {
    analyticsPieActiveName=analyticsPieActiveName===name?null:name;
    renderErrorDistributionChart(typeof currentFilteredActivity==='undefined'?[]:currentFilteredActivity);
}

/* Same renderer for instructor and system donuts; state remains caller-owned. */
function anRenderDonut(id,records,config) {
    const dist=buildErrorDistribution(records);
    const active=dist.categories.some(c=>c.name===config.active)?config.active:null;
    const view=anMountChart(id,{title:config.title,description:config.description,
        stats:[{label:'Errors',value:dist.total},{label:'Types',value:dist.categories.length}],
        controls:`<label>Error type <select aria-label="Highlight error type"><option value="">All error types</option>${dist.categories.map(c=>`<option value="${anAttr(c.name)}" ${c.name===active?'selected':''}>${anEsc(c.name)}</option>`).join('')}</select></label>`,
        caption:'Select a slice or legend chip to highlight an error type.'});
    if(!view)return;
    const select=name=>config.onSelect(name===active?null:name);
    view.controls.querySelector('select').onchange=e=>{config.onSelect(e.target.value || null);view.controls.querySelector('select').focus();};
    view.legend.innerHTML=dist.categories.map((c,i)=>`<button class="an-legend-chip" data-category="${i}" aria-pressed="${c.name===active}"><span class="an-legend-dot" style="background:${anChartPalette()[i%5]}"></span><span class="an-legend-name" title="${anAttr(c.name)}">${anEsc(c.name)}</span><span class="an-legend-val">${c.pct}% · ${c.count}</span></button>`).join('');
    view.legend.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{const index=b.dataset.category;select(dist.categories[index].name);view.legend.querySelector(`[data-category="${index}"]`)?.focus();});
    anChartDraw(view,width=>{
        if(!dist.total){anChartState(view.plot,'empty','No errors in this period.');return;}
        const cx=width/2,cy=125,r=Math.min(96,cx-12),inner=r*.65;
        let angle=-Math.PI/2;
        const items=dist.categories.map((c,i)=>({label:'Recorded errors',name:c.name,rows:[{name:c.name,value:`${c.count} · ${c.pct}%`,color:anChartPalette()[i%5]}]}));
        const slices=dist.categories.map((c,i)=>{
            const end=angle+c.count/dist.total*Math.PI*2;
            const d=arcPath(cx,cy,r,inner,angle,end);angle=end;
            return `<path data-mark="${i}" tabindex="-1" role="button" aria-pressed="${c.name===active}" aria-label="${anAttr(c.name+': '+c.count+' errors, '+c.pct+' percent')}" d="${d}" fill="${anChartPalette()[i%5]}" opacity="${active && c.name!==active ? .25 : 1}" stroke="var(--card)" stroke-width="3"/>`;
        }).join('');
        view.plot.innerHTML=anChartSvg(width,config.title,slices+`<text x="${cx}" y="124" text-anchor="middle" class="an-donut-total">${dist.total}</text><text x="${cx}" y="145" text-anchor="middle" class="an-axis-label">errors</text>`);
        anBindMarks(view.plot,view.card,items,(item,mark)=>{const index=mark.dataset.mark;select(item.name);view.plot.querySelector(`[data-mark="${index}"]`)?.focus();});
    });
}
