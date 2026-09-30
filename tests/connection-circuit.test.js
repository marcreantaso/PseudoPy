const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function harness(code='permission-denied') {
    let calls=0;
    const elements={'connection-status-banner':{hidden:true},'offline-save-status':{hidden:true},'offline-save-status-detail':{textContent:''}};
    const listeners={}; const store=new Map();
    const ctx=vm.createContext({console:{info(){},warn(){},log(){}},navigator:{onLine:true},
        setTimeout,clearTimeout, getLocalCollection:()=>[{_docId:'a',value:7}],setLocalCollection(){},
        listAllMutations:async()=>[], sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
        $id:id=>elements[id], document:{readyState:'loading',addEventListener(){}},
        window:{addEventListener:(key,fn)=>{(listeners[key] ||= []).push(fn);},dispatchEvent:e=>(listeners[e.type]||[]).forEach(fn=>fn(e))},
        CustomEvent:class {constructor(type,init){this.type=type;this.detail=init.detail;}},
        fake:{collection:()=>({get:async()=>{calls++;if(code)throw Object.assign(new Error(code),{code});return {empty:true};}})}
    });
    for(const name of ['database/firebase.js','database/sync-manager.js','database/collections.js','app/connection-status.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',name),'utf8'),ctx);
    vm.runInContext('firestore = fake;',ctx);ctx.initConnectionStatus();
    return {ctx,elements,calls:()=>calls,allow:()=>{code=null;},event:name=>(listeners[name]||[]).forEach(fn=>fn())};
}
test('denied collection refresh opens circuit and never shows Reconnecting',async()=>{
    const h=harness();
    for(let i=0;i<8;i++)assert.equal((await h.ctx.dbGetAll('work'))[0].value,7);
    assert.equal(h.calls(),1);
    assert.equal(h.elements['connection-status-banner'].hidden,true);
    assert.equal(h.elements['offline-save-status'].hidden,false);
    h.allow();await h.ctx.syncNow('manual-retry');await h.ctx.dbGetAll('work');assert.equal(h.calls(),2);
});
test('network failure shows Reconnecting; online recovery clears it',async()=>{
    const h=harness('unavailable');await h.ctx.dbGetAll('work');
    assert.equal(h.elements['connection-status-banner'].hidden,false);
    h.ctx.navigator.onLine=false;h.event('offline');
    h.ctx.navigator.onLine=true;h.allow();h.event('online');
    assert.equal(h.elements['connection-status-banner'].hidden,true);
});
test('unauthenticated reads stop until an explicit sign-in reset',async()=>{
    const h=harness('unauthenticated');
    await h.ctx.dbGetAll('work');await h.ctx.dbGetAll('work');
    assert.equal(h.calls(),1);assert.equal(h.elements['connection-status-banner'].hidden,true);
    h.allow();await h.ctx.syncNow('sign-in');await h.ctx.dbGetAll('work');assert.equal(h.calls(),2);
});
