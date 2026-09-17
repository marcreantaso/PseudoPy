const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
function setup() {
 const records=new Map();
 function collection(name){
  function query(filters=[]){return {where:(key,op,value)=>query([...filters,[key,value]]),limit:()=>query(filters),get:async()=>{const docs=[...records].filter(([k,v])=>k.startsWith(name+'/')&&filters.every(([key,value])=>v[key]===value)).map(([k,v])=>snap(name,k.split('/')[1],v));return {docs,empty:docs.length===0};}};}
  return {...query(),doc:(id=crypto.randomUUID())=>({id,get:async()=>snap(name,id,records.get(name+'/'+id)),set:async row=>records.set(name+'/'+id,structuredClone(row)),update:async row=>records.set(name+'/'+id,{...records.get(name+'/'+id),...row}),delete:async()=>records.delete(name+'/'+id)})};
 }
 function snap(name,id,row){return {id,exists:!!row,data:()=>row&&structuredClone(row),ref:collection(name).doc(id)};}
 const database={collection,runTransaction:async fn=>fn({get:ref=>ref.get(),set:(ref,row)=>ref.set(row),update:(ref,row)=>ref.update(row),delete:ref=>ref.delete()})};
 const module={exports:{}};
 const ctx=vm.createContext({module,exports:module.exports,Buffer,console,process:{env:{SESSION_SECRET:'x'.repeat(48),FIREBASE_PROJECT_ID:'test'}},require:name=>name==='firebase-admin/app'?{initializeApp(){},getApps:()=>[{}],applicationDefault:()=>({})}:name==='firebase-admin/firestore'?{getFirestore:()=>database}:name==='./access'?require('../backend/access'):require(name)});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../backend/service.js'),'utf8'),ctx);
 const {handle}=module.exports;
 async function request(collection,id,method='GET',body={},cookie){
  const req={method,body,headers:{'x-pseudopy-request':'1',...(cookie?{cookie}: {})}};
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};
  await handle(req,res,collection,id);return res;
 }
 return {records,request};
}
test('server login, role scoping, persistent writes, sign-out and password invalidation',async()=>{
 const {records,request}=setup();
 records.set('pseudopy_users/s1',{id:'s1',username:'student',fullName:'Student',password:'old-pass',role:'student',status:'active',instructorId:'i1'});
 records.set('pseudopy_users/s2',{id:'s2',username:'other',password:'other-pass',role:'student',status:'active',instructorId:'i2'});
 let result=await request('pseudopy_users');assert.equal(result.statusCode,401);
 result=await request('auth','login','POST',{username:'student',password:'wrong'});assert.equal(result.statusCode,401);
 result=await request('auth','login','POST',{username:'student',password:'old-pass'});assert.equal(result.statusCode,200);
 const cookie=result.headers['Set-Cookie'].split(';')[0];assert.match(result.headers['Set-Cookie'],/HttpOnly/);assert.equal(result.body.password,undefined);
 assert.ok(records.get('pseudopy_users/s1').passwordScrypt);assert.equal(records.get('pseudopy_users/s1').password,undefined);
 result=await request('pseudopy_users',null,'GET',{},cookie);assert.equal(result.body.length,1);assert.equal(result.body[0]._docId,'s1');
 result=await request('pseudopy_users','s1','PATCH',{role:'admin'},cookie);assert.equal(result.statusCode,403);
 result=await request('pseudopy_activity','attempt1','PUT',{userId:'s1',instructorId:'i1',output:'3'},cookie);assert.equal(result.statusCode,200);
 result=await request('pseudopy_activity','attempt1','GET',{},cookie);assert.equal(result.body.output,'3');
 result=await request('pseudopy_activity','attempt2','PUT',{userId:'s2',instructorId:'i2'},cookie);assert.equal(result.statusCode,403);
 result=await request('auth','password','POST',{password:'new-password',currentPassword:'old-pass'},cookie);assert.equal(result.statusCode,200);
 result=await request('pseudopy_users',null,'GET',{},cookie);assert.equal(result.statusCode,401);
 result=await request('auth','logout','POST');assert.match(result.headers['Set-Cookie'],/Max-Age=0/);
});
test('instructor cannot approve their pending device',async()=>{
 const {records,request}=setup();
 records.set('pseudopy_users/i1',{id:'i1',username:'teacher',password:'teacher-pass',role:'instructor',status:'active'});
 const login=await request('auth','login','POST',{username:'teacher',password:'teacher-pass',device:{deviceId:'dev1'}});
 assert.equal(login.statusCode,200);
 const next=await request('auth','login','POST',{username:'teacher',password:'teacher-pass',device:{deviceId:'dev2'}});
 const cookie=next.headers['Set-Cookie'].split(';')[0];
 const list=await request('pseudopy_devices',null,'GET',{},cookie);
 const pending=list.body.find(row=>row.deviceId==='dev2');assert.equal(pending.status,'pending');
 assert.equal((await request('pseudopy_users',null,'GET',{},cookie)).statusCode,403);
 assert.equal((await request('pseudopy_devices',pending._docId,'PATCH',{status:'approved'},cookie)).statusCode,403);
});
test('password recovery needs requester proof and authorized approval; reset is single-use',async()=>{
 const {records,request}=setup();
 records.set('pseudopy_users/s1',{id:'s1',username:'student',password:'old-pass',role:'student',status:'active',instructorId:'i1',fullName:'Student'});
 const recovery=await request('auth','recover','POST',{lookup:'student'});assert.equal(recovery.statusCode,200);
 const proof=recovery.body;
 assert.equal((await request('auth','reset','POST',{...proof,password:'new-password'})).statusCode,403);
 assert.equal((await request('auth','recovery-status','POST',{requestId:proof.requestId,proof:'wrong'})).statusCode,403);
 const row=records.get('pseudopy_passwordRequests/'+proof.requestId);row.status='approved';row.tokenExpiresAt=Date.now()+100000;
 assert.equal((await request('auth','reset','POST',{...proof,password:'new-password'})).statusCode,200);
 assert.equal((await request('auth','reset','POST',{...proof,password:'new-password'})).statusCode,403);
});
