const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
function harness(storage=new Map()) {
    const listeners={},elements={};
    for(const id of ['connection-status-banner','offline-save-status','offline-save-status-detail','offline-save-dismiss','offline-save-retry'])elements[id]={hidden:true,textContent:'',addEventListener:(key,fn)=>{listeners[id+key]=fn;}};
    const ctx=vm.createContext({console,sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},navigator:{onLine:true},$id:id=>elements[id],
        window:{addEventListener:(key,fn)=>{listeners[key]=fn;}},document:{readyState:'loading',addEventListener:(key,fn)=>{listeners[key]=fn;},activeElement:null},syncNow:async()=>({synced:0})});
    for(const file of ['connection-status','toasts'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/app/'+file+'.js'),'utf8'),ctx);
    ctx.initConnectionStatus();return {ctx,listeners,elements,storage};
}
test('sync notice announces once across autosaves and reloads in the same session',()=>{
    const h=harness();h.ctx.showSyncNotice('First failure');
    for(let i=0;i<10;i++)h.ctx.showSyncNotice('Another failure');
    assert.equal(h.elements['offline-save-status-detail'].textContent,'First failure');
    const reload=harness(h.storage);reload.ctx.showSyncNotice('Again');assert.equal(reload.elements['offline-save-status'].hidden,true);
});
test('Escape dismisses visible notice; recovery resolves the existing singleton',()=>{
    const h=harness();h.ctx.showSyncNotice('Pending');
    h.listeners.keydown({key:'Escape'});assert.equal(h.elements['offline-save-status'].hidden,true);
    assert.equal(h.ctx.showSyncNotice('Autosave'),false);
    h.ctx.resolveSyncNotice();assert.equal(h.elements['offline-save-status'].hidden,true);
});
test('partial recovery keeps the notice while other durable writes remain',async()=>{
    const h=harness();h.ctx.showSyncNotice('Pending');
    h.ctx.syncNow=async()=>({synced:1});h.ctx.listAllMutations=async()=>[{status:'blocked-permission'}];
    await h.ctx.retryCloudSyncNow();assert.equal(h.elements['offline-save-status'].hidden,false);
});
