/* UX Rule 2 — no dark patterns.
   Sign-out must not destroy unsaved work (draft survives, account-tagged),
   and "clear offline data" must be reachable in ≤2 taps from Settings with
   plain wording, a single confirm, and no effect on cloud data. */
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');

const ROOT=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');

function editorHarness({storage=new Map(),user=null}={}) {
    const toasts=[];
    const ctx=vm.createContext({
        console,
        currentUser:user,
        exerciseState:{activeExercise:null},
        STORAGE_KEYS:{EDITOR_DRAFT:'pseudopy_editor_draft',ACTIVE_EXERCISE:'pseudopy_active_exercise',THEME:'pseudopy_theme'},
        localStorage:{
            getItem:k=>storage.has(k)?storage.get(k):null,
            setItem:(k,v)=>storage.set(k,v),
            removeItem:k=>storage.delete(k)
        },
        $id:id=>id==='pseudocode-editor'?{value:''}:null,
        setText:()=>{},updateGutter:()=>{},refreshIcons:()=>{},
        showToast:(m,t)=>toasts.push({m,t}),
        PseudoPyLearning:null,
        escapeHtml:s=>String(s),
        getPythonCode:()=>null,copyText:()=>{},
        URL:{createObjectURL:()=>'',revokeObjectURL:()=>{}},Blob:function(){},
        navigator:{clipboard:{writeText:()=>Promise.resolve()}},
        document:{createElement:()=>({})},
        metricsEngine:undefined,exerciseOpenRequest:null
    });
    vm.runInContext(read('src/app/editor-actions.js'),ctx);
    return {ctx,storage,toasts};
}

test('sign-out does not delete the editor draft: it is saved with an account tag',()=>{
    const h=editorHarness({user:{username:'alice',id:'u1'}});
    h.ctx.$id=()=>({value:'IF x > 1 THEN\n  PRINT "hi"'});
    assert.equal(h.ctx.maybeSaveEditorDraft(),true);
    const draft=JSON.parse(h.storage.get('pseudopy_editor_draft'));
    assert.equal(draft.user,'alice','draft tagged with its author');
    assert.ok(draft.text.includes('PRINT'),'draft content kept');
});

// The translated Python is derived from the pseudocode but is not re-derived on
// load, so an offline reload used to restore the editor and drop the output.
test('the draft carries the translated Python so a reload does not lose it',()=>{
    const h=editorHarness({user:{username:'alice',id:'u1'}});
    h.ctx.$id=id=>id==='pseudocode-editor'?{value:'BEGIN\nEND'}:id==='python-output'?{value:'score = 72\n'}:null;
    assert.equal(h.ctx.maybeSaveEditorDraft(),true);
    const draft=JSON.parse(h.storage.get('pseudopy_editor_draft'));
    assert.equal(draft.python,'score = 72\n','draft does not carry the translated output');
});

test('restoring a draft also restores its translated Python',()=>{
    const {ctx}=editorHarness({
        storage:new Map([['pseudopy_editor_draft',JSON.stringify({exerciseId:'',text:'BEGIN\nEND',python:'score = 72\n',user:'alice',savedAt:'2026-01-01'})]]),
        user:{username:'alice',id:'u1'}
    });
    const editor={value:''};
    const output={value:''};
    ctx.$id=id=>id==='pseudocode-editor'?editor:id==='python-output'?output:null;
    ctx.maybeRestoreEditorDraft();
    assert.equal(editor.value,'BEGIN\nEND','pseudocode restored');
    assert.equal(output.value,'score = 72\n','translated python restored with the draft');
});

test('a draft never overwrites Python that already exists in this session',()=>{
    const {ctx}=editorHarness({
        storage:new Map([['pseudopy_editor_draft',JSON.stringify({exerciseId:'',text:'BEGIN\nEND',python:'stale = 1\n',user:'alice',savedAt:'2026-01-01'})]]),
        user:{username:'alice',id:'u1'}
    });
    const editor={value:''};
    const output={value:'fresh = 2\n'};
    ctx.$id=id=>id==='pseudocode-editor'?editor:id==='python-output'?output:null;
    ctx.maybeRestoreEditorDraft();
    assert.equal(output.value,'fresh = 2\n','stale draft output overwrote current output');
});

test('another account on the same device never sees the previous account draft',()=>{
    const {ctx}=editorHarness({
        storage:new Map([['pseudopy_editor_draft',JSON.stringify({exerciseId:'',text:'alice work',user:'alice',savedAt:'2026-01-01'})]]),
        user:{username:'bob',id:'u2'}
    });
    let restored=false;
    ctx.$id=()=>{const e={value:''};Object.defineProperty(e,'value',{get:()=>e._v||'',set:v=>{restored=true;e._v=v;}});return e;};
    ctx.maybeRestoreEditorDraft();
    assert.equal(restored,false,'restore refused for a different user');
});

test('the same account gets their draft back after signing out and in',()=>{
    const {ctx}=editorHarness({
        storage:new Map([['pseudopy_editor_draft',JSON.stringify({exerciseId:'',text:'alice work',user:'alice',savedAt:'2026-01-01'})]]),
        user:{username:'alice',id:'u1'}
    });
    const editor={value:''};
    ctx.$id=()=>editor;
    ctx.updateGutter=()=>{};
    ctx.maybeRestoreEditorDraft();
    assert.equal(editor.value,'alice work','draft restored for its author');
});

test('legacy untagged drafts keep restoring (backwards compatible)',()=>{
    const {ctx}=editorHarness({
        storage:new Map([['pseudopy_editor_draft',JSON.stringify({exerciseId:'',text:'old draft',savedAt:'2026-01-01'})]]),
        user:{username:'carol',id:'u3'}
    });
    const editor={value:''};
    ctx.$id=()=>editor;
    ctx.updateGutter=()=>{};
    ctx.maybeRestoreEditorDraft();
    assert.equal(editor.value,'old draft');
});

test('clear offline data: declining the confirm removes nothing',async()=>{
    const deletions=[];
    const ctx=vm.createContext({
        console,window:{confirm:()=>false},
        indexedDB:{deleteDatabase:n=>{deletions.push(n);return{};}},
        localStorage:{_s:new Map([['pseudopy_editor_draft','x'],['pseudopy_active_exercise','y']]),
            getItem(k){return this._s.get(k)||null;},setItem(k,v){this._s.set(k,v);},removeItem(k){this._s.delete(k);}},
        STORAGE_KEYS:{EDITOR_DRAFT:'pseudopy_editor_draft',ACTIVE_EXERCISE:'pseudopy_active_exercise'},
        $id:id=>id==='clear-local-data-btn'?{disabled:false,setAttribute(){},removeAttribute(){}}:null,
        showToast:()=>{},
        setTimeout:()=>0,
        location:{reload:()=>{throw new Error('must not reload when declined');}}
    });
    vm.runInContext(read('src/app/student-settings.js'),ctx);
    await ctx.clearOfflineDataFromSettings();
    assert.deepEqual(deletions,[],'no database deletion after decline');
    assert.equal(ctx.localStorage.getItem('pseudopy_editor_draft'),'x','draft untouched');
});

test('clear offline data: confirming wipes the local store only',async()=>{
    const deletions=[];let reloaded=false;
    const ctx=vm.createContext({
        console,
        window:{confirm:()=>true,location:{reload:()=>{reloaded=true;}}},
        indexedDB:{deleteDatabase:n=>{deletions.push(n);return{onsuccess:null,onerror:null,onblocked:null};}},
        localStorage:{_s:new Map([['pseudopy_editor_draft','x'],['pseudopy_active_exercise','y'],['pseudopy_theme','dark']]),
            getItem(k){return this._s.get(k)||null;},setItem(k,v){this._s.set(k,v);},removeItem(k){this._s.delete(k);}},
        STORAGE_KEYS:{EDITOR_DRAFT:'pseudopy_editor_draft',ACTIVE_EXERCISE:'pseudopy_active_exercise'},
        $id:()=>null,showToast:()=>{},setTimeout:fn=>{fn();return 0;}
    });
    // Resolve the deleteDatabase promise immediately via onsuccess.
    ctx.indexedDB.deleteDatabase=n=>{deletions.push(n);const req={onsuccess:null,onerror:null,onblocked:null};Promise.resolve().then(()=>req.onsuccess&&req.onsuccess());return req;};
    vm.runInContext(read('src/app/student-settings.js'),ctx);
    await ctx.clearOfflineDataFromSettings();
    assert.deepEqual(deletions,['pseudopy-offline'],'the offline store is deleted by name');
    assert.equal(ctx.localStorage.getItem('pseudopy_editor_draft'),null,'draft removed');
    assert.equal(ctx.localStorage.getItem('pseudopy_active_exercise'),null,'active exercise pointer removed');
    assert.equal(ctx.localStorage.getItem('pseudopy_theme'),'dark','theme preference kept');
    assert.equal(reloaded,true,'page reloads to rebuild the local cache');
});

test('the Settings section discloses local vs cloud in plain words and keeps the device id',()=>{
    const html=read('index.html');
    assert.match(html,/Data on this device/);
    assert.match(html,/Clear offline data on this device/);
    assert.match(html,/Your account and cloud data are untouched/);
    assert.match(html,/This cannot be undone/);
    const settings=read('src/app/student-settings.js');
    assert.ok(!/DEVICE_ID/.test(settings),'device identifier is not wiped by clear-data');
});

test('handleLogout saves the draft first and no longer calls clearEditorDraft',()=>{
    const auth=read('src/app/authentication.js');
    const body=auth.slice(auth.indexOf('function handleLogout()'),auth.indexOf('function checkAccess'));
    assert.match(body,/maybeSaveEditorDraft\(\)/,'draft preserved on sign-out');
    assert.ok(!/clearEditorDraft\(\)/.test(body),'draft is not destroyed on sign-out');
});
