/* Trajectory presentation. The aggregation's score and average semantics stay intact. */
const anTrajectoryView = {metric:'score', mode:'bars', exercise:'', students:null, axis:'attempt', full:true, owner:null};

function anTrajectoryNames(records) {
    const users = typeof cachedUsers === 'undefined' ? [] : cachedUsers;
    const labels = new Map();
    records.forEach(r => {
        const key = String(r.student || r.username || r.studentId || '');
        if (!key || labels.has(key)) return;
        const user = users.find(u => [u.id,u._docId,u.studentId,u.studentNumber,u.username].filter(Boolean)
            .some(id => [r.studentAccountId,r.studentId,r.username].filter(Boolean).includes(id)));
        const name = user?.fullName || user?.displayName || r.student || r.username;
        labels.set(key, name && !/^u\d{6,}|^[a-z\d_-]{20,}$/i.test(name) ? name : 'Student ' + (labels.size+1));
    });
    return labels;
}

function anRenderTrajectory(records) {
    const state = anTrajectoryView;
    const owner = typeof currentUser === 'undefined' ? null : currentUser;
    if (state.owner !== owner) { Object.assign(state,{owner,students:null,exercise:'',metric:'score',mode:'bars',axis:'attempt',full:true}); }
    const names = anTrajectoryNames(records);
    const exercises = [...new Set(records.map(r=>String(r.exercise || r.exerciseId || 'Unspecified')))].sort();
    if (state.exercise && !exercises.includes(state.exercise)) state.exercise = '';
    const filtered = records.filter(r=>!state.exercise || String(r.exercise || r.exerciseId || 'Unspecified')===state.exercise);
    const all = buildTrajectorySeries(filtered,{maxStudents:Math.max(5,names.size),maxSessions:8});
    const selected = state.students == null ? all.series.slice(0,5) : all.series.filter(s=>state.students.includes(s.name)).slice(0,5);
    const result = {...all, series:selected};
    const points=selected.flatMap(s=>s.points), scores=points.filter(p=>p.y!=null);
    const average=all.classAverage.filter(p=>p.y!=null).at(-1)?.y;
    const flat=scores.length && scores.every(p=>p.y===scores[0].y);
    const stats=[{key:'score',label:'Class average',value:average == null ? '—' : average+'%',active:state.metric==='score'},
        {key:'scored',label:'Scored',value:scores.length,active:state.metric==='scored'},
        {key:'ungraded',label:'Ungraded',value:points.length-scores.length,active:state.metric==='ungraded'}];
    const option=(v,label,current)=>`<option value="${anAttr(v)}" ${v===current?'selected':''}>${anEsc(label)}</option>`;
    const controls=`<label>Exercise <select data-control="exercise">${option('','All exercises',state.exercise)}${exercises.map(e=>option(e,e,state.exercise)).join('')}</select></label>
        <label>Students <select data-control="students"><option value="auto" ${state.students==null?'selected':''}>Most active 5</option><option value="custom" ${state.students!=null?'selected':''}>Selected students</option></select></label>
        <label>Horizontal axis <select data-control="axis">${option('attempt','Attempt',state.axis)}${option('date','Date',state.axis)}</select></label>
        <label class="an-check"><input type="checkbox" data-control="full" ${state.full?'checked':''} ${state.metric!=='score'?'disabled':''}>Full scale 0–100</label>
        <details data-student-picker><summary>Select students</summary><div class="an-popover">Choose up to five.${all.series.map(s=>`<label><input type="checkbox" data-student="${anAttr(s.name)}" ${selected.includes(s)?'checked':''}>${anEsc(names.get(s.name) || 'Student')}</label>`).join('')}</div></details>
        <div class="seg" role="group" aria-label="Chart style"><button data-mode="bars" aria-pressed="${state.mode==='bars'}">Bars</button><button data-mode="lines" aria-pressed="${state.mode==='lines'}">Lines</button></div>
        <details data-chart-info><summary aria-label="About this chart">ⓘ</summary><div class="an-popover">Latest eight attempts per student. Class average uses available scores across the class at the latest attempt index. Scored and Ungraded count selected students’ attempts. Date view aligns actual submission days. Ungraded attempts are not zero.</div></details>`;
    const rerender=()=>anRenderTrajectory(records);
    const view=anMountChart('an-trajectory-svg',{title:'Student Improvement Trajectory',description:'Compare scores across each student’s latest eight attempts.',stats,controls,
        insight:flat?`All ${selected.length} student${selected.length===1?'':'s'} scored ${scores[0].y}% on every graded attempt`:'',
        caption:'Auto-checker scores are binary checks, not instructor grades.',onMetric:key=>{state.metric=key;rerender();}});
    if(!view)return;
    view.controls.querySelectorAll('[data-control]').forEach(el=>el.onchange=()=>{
        const key=el.dataset.control;
        state[key]=key==='full'?el.checked:key==='students'?(el.value==='auto'?null:selected.map(s=>s.name)):el.value;
        rerender();view.controls.querySelector(`[data-control="${key}"]`)?.focus();
    });
    view.controls.querySelectorAll('[data-mode]').forEach(el=>el.onclick=()=>{state.mode=el.dataset.mode;rerender();view.controls.querySelector(`[data-mode="${state.mode}"]`)?.focus();});
    view.controls.querySelectorAll('[data-student]').forEach(el=>{
        el.disabled=!el.checked && selected.length>=5;
        el.onchange=()=>{state.students=Array.from(view.controls.querySelectorAll('[data-student]:checked')).map(e=>e.dataset.student);const key=el.dataset.student;rerender();view.controls.querySelector('[data-student-picker]').open=true;Array.from(view.controls.querySelectorAll('[data-student]')).find(e=>e.dataset.student===key)?.focus();};
    });
    view.controls.querySelectorAll('details').forEach(el=>el.onkeydown=e=>{if(e.key==='Escape'){el.open=false;el.querySelector('summary').focus();}});
    const palette=anChartPalette();
    view.legend.innerHTML=selected.map((s,i)=>{
        const scored=s.points.filter(p=>p.y!=null),last=scored.at(-1)?.y,delta=last-scored[0]?.y;
        return anLegendChip(names.get(s.name)||'Student',last==null?'Ungraded':`${last}% · ${delta===0?'No change':`${delta>0?'+':''}${delta} pp`}`,palette[i]);
    }).join('')+'<span class="an-legend-chip-static"><span class="an-legend-dot an-ungraded-dot"></span>Not graded yet</span>';
    view.data.innerHTML=`<details><summary>View score data table</summary><div class="an-table-scroll"><table><caption class="sr-only">Scores for selected students. Ungraded is not zero.</caption><thead><tr><th>Student</th><th>Attempt</th><th>Date</th><th>Score</th></tr></thead><tbody>${selected.flatMap(s=>s.points.map(p=>`<tr><td>${anEsc(names.get(s.name)||'Student')}</td><td>${p.x+1}</td><td>${anEsc(p.date)}</td><td>${p.y==null?'Not graded yet':p.y+'%'}</td></tr>`)).join('')}</tbody></table></div></details>`;
    view.plot.setAttribute('aria-description','Use arrow keys to move between values. Ungraded stubs are not zero. Full values are available in the score data table.');
    anChartDraw(view,width=>anDrawTrajectory(view,result,names,state,width,palette));
}

function anDrawTrajectory(view,result,names,state,width,palette) {
    if(!result.series.length){anChartState(view.plot,'empty','No students selected for this period.');return;}
    const dates=[...new Set(result.series.flatMap(s=>s.points.map(p=>p.date)))].sort();
    let series=result.series.map(s=>({...s,points:s.points.map(p=>({...p,attempt:p.x+1,x:state.axis==='date'?dates.indexOf(p.date):p.x}))}));
    const count=state.axis==='date'?dates.length:Math.max(...series.map(s=>s.points.length));
    const labels=Array.from({length:count},(_,i)=>state.axis==='date'?dates[i].slice(5):'Attempt '+(i+1));
    const scoreMode=state.metric==='score';
    if(!scoreMode)series=[{name:state.metric==='scored'?'Scored':'Ungraded',points:Array.from({length:count},(_,x)=>({x,y:series.reduce((n,s)=>n+s.points.filter(p=>p.x===x&&(state.metric==='scored'?p.y!=null:p.y==null)).length,0),date:state.axis==='date'?dates[x]:''}))}];
    // Date view can contain multiple attempts by one student in a day: give each
    // its own slot rather than silently painting over another bar.
    const maxPerDay=scoreMode?Math.max(1,...series.flatMap(s=>dates.map(d=>s.points.filter(p=>p.date===d).length))):1;
    const lanes=state.axis==='date'?maxPerDay:1;
    const barSeries=series.flatMap(s=>Array.from({length:lanes},(_,lane)=>({...s,points:s.points.filter((p,i)=>s.points.slice(0,i).filter(q=>q.x===p.x).length===lane)})));
    const w=Math.max(width,64+count*Math.max(28,barSeries.length*9));
    const values=series.flatMap(s=>s.points.filter(p=>p.y!=null).map(p=>p.y));
    const min=scoreMode&&!state.full?Math.max(0,Math.floor((Math.min(...values,100)-10)/25)*25):0;
    const max=scoreMode?100:Math.max(1,...values);
    const y=linearScale([min,max],[216,16]);
    const ticks=scoreMode?[0,25,50,75,100].filter(n=>n>=min):Array.from(new Set([0,Math.ceil(max/2),max]));
    const slot=(w-64)/Math.max(count,1),x=i=>48+slot*(i+.5);
    const items=[];
    const itemFor=(s,p,color)=>({label:(p.attempt?'Attempt '+p.attempt:'Count')+(p.date?' · '+p.date:''),rows:[{name:names.get(s.name)||s.name,color,value:p.y==null?'Not graded yet (not a zero)':p.y+(scoreMode?'%':' attempts')}]});
    let content=`<defs><pattern id="an-ungraded-stripe" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--muted)"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--muted-foreground)" stroke-width="2"/></pattern></defs>`+anChartGrid(w,ticks,y,scoreMode?'%':'');
    const bars=groupedBarGeometry(barSeries,count,w,{domain:[min,max]});
    const lines=state.mode==='lines' && scoreMode && state.axis==='attempt';
    if(lines){
        series.forEach((s,i)=>{
            const color=palette[i];
            content+=`<path d="${anSplitSegments(s.points).map(seg=>smoothPath(seg,x,y)).join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="${i?`${8-i} ${i+2}`:'none'}"/>`;
            const last=s.points.filter(p=>p.y!=null).at(-1);
            if(last){const ly=24+i*19;content+=`<path d="M ${x(last.x)} ${y(last.y)} L ${w-100} ${ly}" fill="none" stroke="${color}" opacity=".6"/><text x="${w-96}" y="${ly+4}">${i+1}. ${anEsc((names.get(s.name)||s.name).split(' ')[0].slice(0,9))}</text>`;}
        });
    }
    bars.forEach(b=>{
        const s=barSeries[b.student],color=palette[Math.floor(b.student/lanes)%5],p=b.point;
        const item=itemFor(s,p,color),index=items.push(item)-1;
        const attrs=`data-mark="${index}" tabindex="-1" aria-label="${anAttr(item.label+', '+item.rows[0].name+', '+item.rows[0].value)}"`;
        content+=lines&&!b.ungraded?`<circle ${attrs} cx="${x(p.x)}" cy="${y(p.y)}" r="${4+Math.floor(b.student/lanes)}" fill="${color}" fill-opacity=".25" stroke="${color}"/>`:`<path ${attrs} d="${roundedBarPath(b)}" fill="${b.ungraded?'url(#an-ungraded-stripe)':color}"/>`;
    });
    content+=chartTicks(labels,labels.map((_,i)=>x(i))).map(i=>`<text x="${x(i)}" y="236" text-anchor="middle" class="an-axis-label">${anEsc(labels[i])}</text>`).join('');
    view.plot.innerHTML=anChartSvg(w,scoreMode?'Student scores in percent':'Number of '+state.metric+' attempts',content);
    anBindMarks(view.plot,view.card,items);
}
