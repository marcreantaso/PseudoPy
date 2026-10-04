/* Local-only visual harness. Node 22+, installed Chrome; no browser dependency.
   Uses real markup/styles/renderers with synthetic records, never Firebase. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const phase = process.argv[2] || 'after';
const out = path.join(root, 'artifacts', 'charts', phase);
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const html = read('index.html');
function between(start, end) { return html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start))); }
const instructorCards = html.slice(html.indexOf('<!-- Charts Row -->'), html.indexOf('</div>', html.indexOf('Click any slice or legend row')) + 6) + '</div></div>';
const adminCards = between('<!-- Translations & Executions chart -->', '<div id="system-error-state"');
const boot = `
var $id=id=>document.getElementById(id), $qs=s=>document.querySelector(s), $qsa=s=>document.querySelectorAll(s);
var setText=(id,v)=>{if($id(id))$id(id).textContent=v}, currentUser={id:'fixture',role:'admin'}, cachedUsers=[], currentPage='system-analytics';
var init=()=>{}, refreshIcons=()=>{}, renderIcons=()=>{}, icon=()=>'';
var currentFilteredActivity=[];
const names=['Alex Rivera','Bea Santos','Camille Dela Cruz — Long Display Name','Dev Patel','Emilia Tan'];
names.forEach((student,s)=>{for(let a=0;a<8;a++)currentFilteredActivity.push({id:'fixture-'+s+'-'+a,student,studentId:'fixture-'+s,type:'submission',exercise:'Loops',time:new Date(Date.UTC(2026,9,a+1,12)).toISOString(),score:a===7&&s<3?'Pending':'100%',pseudocode:'DISPLAY 1',pythonCode:'print(1)',status:'Completed'});});
currentFilteredActivity.push(...['Syntax Error','Type Error','Runtime Error'].flatMap((errorType,i)=>Array.from({length:4-i},(_,n)=>({id:'error-'+i+'-'+n,type:'translate_attempt',errorType,time:'2026-10-08T12:00:00Z'}))));
function applyAnalyticsFilters(){renderAnalyticsCharts(currentFilteredActivity)}
function loadAnalytics(){applyAnalyticsFilters()}
function formatMetricValue(v){return v} function formatPercent(v){return v+'%'}
`;
function page() {
    let student = read('src/student/workspace.js').replace('return { activate, reset,', `return { captureChart(card) { attempts = Array.from({length:8},(_,i)=>({id:String(i), compilation:i<2?0:100, validation:70+i*4, errors:i<2?2:0, warnings:0, suggestions:0, valid:i>=2})); renderChart(card); }, activate, reset,`);
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/student-workspace.css"><style>body{display:block!important;overflow:auto!important;height:auto!important;padding:16px;margin:0}main{max-width:1280px;margin:auto}h1{font-size:20px;margin:16px 0}section{margin-bottom:32px;min-width:0}.capture-label{font-size:13px}</style></head><body><main><p class="capture-label">PseudoPy · synthetic local chart fixtures</p><section id="page-analytics"><h1>Instructor Analytics</h1>' + instructorCards + '</section><section id="page-system-analytics"><h1>System Analytics</h1>' + adminCards + '</section><section><h1>Student Learning Progress</h1><div id="capture-student" class="an-chart-card sw-chart-card"></div></section><section><h1>Compiler Timing</h1><div class="chart-container"><div class="panel-header"><h3>Pipeline Timing</h3></div><div id="chart-pipeline-timing"></div></div></section></main><script>' + boot + '</script>' + ['src/analytics/aggregation.js','src/analytics/geometry.js','src/app/analytics-charts.js','src/app/admin-analytics.js','src/student/learning-model.js'].map(p=>'<script>'+read(p)+'</script>').join('') + '<script>'+student+'</script><script>' + read('src/app/compiler-dashboard.js').replace(/if \(document.readyState === 'loading'\)[\s\S]*$/, '') + '</script><script>renderAnalyticsCharts(currentFilteredActivity);renderSystemActivityChart(currentFilteredActivity);renderSystemErrorChart(currentFilteredActivity);StudentWorkspace.captureChart($id("capture-student"));renderPipelineTimingChart({count:8,avgLexTime:1.2,avgParseTime:2.4,avgSemanticTime:0.8,avgCodeGenTime:0.5,avgTotalTime:4.9});window.captureReady=true;</script></body></html>';
}
async function main() {
    fs.mkdirSync(out,{recursive:true});
    const server=http.createServer((req,res)=>{try{const p=new URL(req.url,'http://local').pathname;if(p==='/'){res.setHeader('Content-Type','text/html');res.end(page());}else{res.setHeader('Content-Type',p.endsWith('.css')?'text/css':'text/plain');res.end(read(p.slice(1)));}}catch(e){res.statusCode=404;res.end(String(e));}});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const profile=fs.mkdtempSync(path.join(os.tmpdir(),'pseudopy-charts-'));
    const chrome=spawn(process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--no-first-run','--disable-gpu','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank']);
    try {
        let endpoint='';
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Chrome startup timeout')),20000);chrome.stderr.on('data',b=>{const m=String(b).match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){endpoint=m[1];clearTimeout(timer);resolve();}});chrome.on('error',reject);});
        const targets=await (await fetch(endpoint.replace('ws:','http:').replace(/\/devtools\/browser\/.*/, '/json'))).json();
        const ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
        await new Promise(r=>ws.addEventListener('open',r,{once:true}));
        let seq=0;const pending=new Map();const errors=[];
        ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
        const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
        await call('Runtime.enable');await call('Page.enable');
        const measurements=[];
        for(const width of [320,375,768,1440])for(const theme of ['light','dark']){
            await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
            await call('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});
            await new Promise(r=>setTimeout(r,1800));
            await call('Runtime.evaluate',{expression:`document.documentElement.setAttribute('data-theme','${theme}');document.body.setAttribute('data-theme','${theme}');document.documentElement.classList.toggle('dark','${theme}'==='dark')`});
            await new Promise(r=>setTimeout(r,300));
            const measure=await call('Runtime.evaluate',{expression:`JSON.stringify({ready:window.captureReady,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,plots:[...document.querySelectorAll('.an-chart-plot,.an-pie-plot')].map(p=>({id:p.id,height:p.getBoundingClientRect().height})),smallText:[...document.querySelectorAll('.an-chart-card text')].filter(e=>parseFloat(getComputedStyle(e).fontSize)<11).length})`,returnByValue:true});
            measurements.push({width,theme,...JSON.parse(measure.result.value)});
            const metrics=await call('Page.getLayoutMetrics');
            const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:Math.ceil(metrics.cssContentSize.height),scale:1}});
            fs.writeFileSync(path.join(out,`${width}-${theme}.png`),Buffer.from(shot.data,'base64'));
        }
        fs.writeFileSync(path.join(out,'measurements.json'),JSON.stringify({measurements,errors},null,2));
        console.log(JSON.stringify({out,errors:errors.map(e=>e.exception?.description||e.text),measurements},null,2));
        ws.close();
    } finally {chrome.kill();server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
