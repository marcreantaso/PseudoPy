const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const geometry = require('../src/analytics/geometry');
function harness(extra = {}) {
    const ctx = vm.createContext({console, setTimeout, clearTimeout, ...geometry, ...extra});
    for (const name of ['chart-system', 'analytics-charts']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/app/'+name+'.js'), 'utf8'), ctx);
    return ctx;
}
test('shared tooltip escapes labels and values and retains dot/name/value structure', () => {
    const h=harness();
    const html=h.anTooltipContent('<attempt>',[{name:'A&B',value:'Not graded yet (not a zero)',color:'var(--chart-1)'}]);
    assert.match(html,/&lt;attempt&gt;/);assert.match(html,/A&amp;B/);
    assert.match(html,/an-tt-dot/);assert.match(html,/Not graded yet \(not a zero\)/);
});
test('chart navigation wraps and supports Home/End without consuming unrelated keys', () => {
    const h=harness();
    assert.equal(h.anChartKeyIndex('ArrowRight',4,5),0);
    assert.equal(h.anChartKeyIndex('ArrowLeft',0,5),4);
    assert.equal(h.anChartKeyIndex('Home',3,5),0);
    assert.equal(h.anChartKeyIndex('End',0,5),4);
    assert.equal(h.anChartKeyIndex('Tab',0,5),null);
    assert.equal(h.anChartKeyIndex('ArrowRight',0,0),null);
});
test('shared header exposes pressed metric state and a fixed 250px SVG contract', () => {
    const h=harness();
    assert.match(h.anChartHeader('Title','Description',[{key:'score',label:'Class average',value:'100%',active:true}]),/aria-pressed="true"/);
    assert.match(h.anChartSvg(300,'Chart',''),/height="250" viewBox="0 0 300 250"/);
});
test('chart system stylesheet has no declared font size below 11px',()=>{
    const css=fs.readFileSync(path.join(__dirname,'../style.css'),'utf8').split('/* Shared SVG chart system')[1].split('#app-status-region')[0];
    for(const match of css.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(match[1])>=11,match[0]);
});
