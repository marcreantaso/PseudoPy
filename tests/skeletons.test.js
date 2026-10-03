/* UX Rule 1 — skeletons, not spinners.
   Verifies the reusable skeleton component, the containers that use it
   (users tables, exercises table, notifications, console output, charts),
   and the no-layout-shift / reduced-motion CSS contract. */
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');

const ROOT=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');

function harness() {
    const elements={};
    const ctx=vm.createContext({
        console,
        $id:id=>elements[id]||null,
        document:undefined
    });
    vm.runInContext(read('src/app/skeletons.js'),ctx);
    return {ctx,elements,
        el(id){if(!elements[id])elements[id]={innerHTML:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k];},removeAttribute(k){delete this.attrs[k];}};return elements[id];}
    };
}

test('skeleton rows mirror the final table shape: one shimmering cell per column',()=>{
    const {ctx}=harness();
    const html=ctx.skeletonTableRows(5,4);
    const rows=html.split('<tr class="skeleton-tr">').length-1;
    assert.equal(rows,4,'one row per requested row');
    const firstRow=html.split('<tr class="skeleton-tr">')[1];
    const cells=(firstRow.match(/<td aria-hidden="true">/g)||[]).length;
    assert.equal(cells,5,'one cell per column');
    assert.ok(html.includes('skeleton skeleton-line'),'cells contain the shared .skeleton base');
});

test('showTableSkeleton marks the body busy and announces loading; clearTableSkeleton retires it',()=>{
    const h=harness();
    h.el('users-table-body');
    h.ctx.showTableSkeleton('users-table-body',7,4,'Loading instructors…');
    const tbody=h.el('users-table-body');
    assert.equal(tbody.attrs['aria-busy'],'true');
    assert.ok(tbody.innerHTML.includes('Loading instructors…'),'screen-reader status present');
    assert.ok(tbody.innerHTML.includes('skeleton-tr'),'skeleton rows rendered');
    h.ctx.clearTableSkeleton('users-table-body');
    assert.equal(tbody.attrs['aria-busy'],'false');
});

test('skeletonListItems match the notification item shape',()=>{
    const {ctx}=harness();
    const html=ctx.skeletonListItems(3);
    assert.equal(html.split('skeleton-notif').length-1,3,'one item per requested item');
});

test('run skeleton appears instantly and is removed by the first output write',()=>{
    const h=harness();
    let removed=0;
    const skeletonNode={remove:()=>{removed++;}};
    const statusNode={remove:()=>{removed++;},textContent:'Running…'};
    const out={
        innerHTML:'',attrs:{},
        setAttribute(k,v){this.attrs[k]=v;},
        getAttribute(k){return this.attrs[k];},
        removeAttribute(k){delete this.attrs[k];},
        querySelector(sel){return sel==='[data-run-skeleton]'?skeletonNode:statusNode;}
    };
    h.ctx.showRunSkeleton(out);
    assert.equal(out.attrs['aria-busy'],'true');
    assert.ok(out.innerHTML.includes('console-running'));
    h.ctx.clearRunSkeleton(out);
    assert.equal(removed,2,'skeleton box and running status both removed');
    assert.equal(out.attrs['aria-busy'],undefined,'busy flag cleared');
});

test('style.css ships the shared component: shimmer, busy cursor, reduced-motion opt-out',()=>{
    const css=read('style.css');
    assert.match(css,/\.skeleton \{/);
    assert.match(css,/skeleton-shimmer/);
    assert.match(css,/--skeleton-sheen/);
    assert.match(css,/\[data-theme="dark"\] \{\s*\n\s*--skeleton-sheen/,'dark theme gets its own sheen');
    const reduce=css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)')-1);
    assert.ok(/\.skeleton::after \{[\s\S]*animation: none/.test(css),'shimmer disabled for reduced motion');
});

test('containers use skeletons instead of Loading… text rows',()=>{
    const users=read('src/app/users.js');
    assert.match(users,/showTableSkeleton\('users-table-body', 7/);
    assert.match(users,/showTableSkeleton\('device-modal-table-body', 5/);
    assert.ok(!/Loading instructors\.\.\./.test(users),'text row replaced');
    assert.ok(!/Loading devices\.\.\./.test(users),'text row replaced');
    const index=read('index.html');
    assert.match(index,/id="exercises-table-body" aria-busy="true"/);
    assert.match(index,/skeleton-tr/,'exercises table ships static skeleton rows');
    const notif=read('src/app/notifications.js');
    assert.match(notif,/skeletonListItems\(3\)/);
    const exec=read('src/app/execution.js');
    assert.match(exec,/showRunSkeleton\(outputEl\)/);
});

test('charts re-render on resize, debounced, only for the visible page',()=>{
    const charts=read('src/app/analytics-charts.js');
    assert.match(charts,/ResizeObserver/);
    assert.match(charts,/150/,'debounce window');
    assert.match(charts,/page-analytics/);
    assert.match(charts,/page-system-analytics/);
});

test('the skeleton module is part of the app bundle',()=>{
    const bundles=JSON.parse(read('src/bundles.json'));
    assert.ok(bundles['app.js'].includes('src/app/skeletons.js'));
});
