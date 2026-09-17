const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.join(__dirname,'..');
async function application(role='student'){
 const errors=[];
 const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>errors.push(e.message));
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 const dom=new JSDOM(html,{url:'http://localhost:3000',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
 const win=dom.window;
 win.Worker=require('./browser-worker.cjs');
 win.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 win.confirm=()=>true;win.scrollTo=()=>{};win.HTMLElement.prototype.scrollIntoView=()=>{};
 const records=[];
 const user={_docId:'s1',id:'s1',fullName:'Test Student',username:'student',studentId:'2026-001',section:'CS',role,status:'active',instructorId:'i1'};
 win.fetch=async(url,options={})=>{
  if(url==='/api/auth/session')return {ok:false,status:401,json:async()=>({error:'Please sign in.'})};
  if(url==='/api/health')return {ok:true,json:async()=>({status:'ok'})};
  if(url==='/api/auth/login')return {ok:true,json:async()=>user};
  if(options.method==='PUT'){records.push(JSON.parse(options.body));return {ok:true,json:async()=>records.at(-1)};}
  return {ok:true,json:async()=>url==='/api/pseudopy_users'?[user]:[]};
 };
 for(const file of ['database.js','mapper.js','compiler.js','metrics.js','runtime.js','learning.js','app.js','devtools.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),dom.getInternalVMContext(),{filename:file});
 await new Promise(resolve=>setTimeout(resolve,30));
 const evaluate=code=>vm.runInContext(code,dom.getInternalVMContext());
 evaluate(`setValue('login-username','student');setValue('login-password','password');`);
 await evaluate('handleLogin()');
 await new Promise(resolve=>setTimeout(resolve,30));
 return {dom,win,evaluate,errors,records};
}
test('full application student sign-in and tutorial preserve editor content; errors are visible',async()=>{
 const app=await application();
 try{
  assert.equal(app.win.document.getElementById('app-layout').classList.contains('hidden'),false);
  app.evaluate(`setValue('translate-input','BEGIN\\nDISPLAY 2 <= 3\\nEND');translateFromPage();`);
  assert.match(app.win.document.getElementById('translate-output').value,/2 <= 3/);
  assert.equal(app.evaluate('getPythonCode("translate-output")'),app.win.document.getElementById('translate-output').value);
  assert.ok(app.win.document.querySelectorAll('.operator-guide details').length>=4);
  app.evaluate(`setValue('translate-input','BEGIN\\nBOGUS x\\nEND');translateFromPage();`);
  assert.equal(app.win.document.getElementById('translate-output').dataset.translationValid,'false');
  assert.match(app.win.document.getElementById('translate-console').textContent,/Line|line/);
  assert.deepEqual(app.errors,[]);
 }finally{app.evaluate('stopLearningSync();SessionTimeout.stop();');await new Promise(resolve=>setTimeout(resolve,20));app.dom.window.close();}
});
test('console input resolves once when Enter and click occur together',async()=>{
 const app=await application();
 try{
  const promise=app.evaluate('requestConsoleInput($id("translate-console"),"Number: ")');
  const input=app.win.document.querySelector('.skulpt-input-field');
  const button=app.win.document.querySelector('.skulpt-input-btn');
  input.value='17';input.dispatchEvent(new app.win.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));button.click();
  assert.equal(await promise,'17');assert.equal(app.win.document.querySelectorAll('.skulpt-input-echo').length,1);
 }finally{app.evaluate('stopLearningSync();SessionTimeout.stop();');await new Promise(resolve=>setTimeout(resolve,20));app.dom.window.close();}
});
test('empty error distribution stays empty and success records are not failures',async()=>{
 const app=await application();
 try{
  app.evaluate(`renderErrorDistributionChart([{status:'Completed',result:'Success',errorType:'Syntax Error'}]);`);
  assert.equal(app.win.document.getElementById('an-donut-total').textContent,'0');
  assert.match(app.win.document.getElementById('an-donut-legend').textContent,/No errors/);
  app.evaluate(`renderErrorDistributionChart([{status:'Failed',errorType:'Syntax Error'},{status:'Failed',errorType:'Runtime Error'}]);`);
  assert.equal(app.win.document.getElementById('an-donut-total').textContent,'2');
 }finally{app.evaluate('stopLearningSync();SessionTimeout.stop();');await new Promise(resolve=>setTimeout(resolve,20));app.dom.window.close();}
});
test('exercise execution matches only stdout, replays inputs, and saves measured submission',async()=>{
 const app=await application();
 try{
  app.evaluate(`exerciseState.activeExercise={_docId:'sum',id:'sum',title:'Sum',python_code:'a=int(input("A: "))\\nb=int(input("B: "))\\nprint(a+b)'};
    setValue('pseudocode-editor','BEGIN\\nDECLARE a AS INTEGER\\nDECLARE b AS INTEGER\\nINPUT a\\nINPUT b\\nDISPLAY a+b\\nEND');translatePseudocode();`);
  const execution=app.evaluate('runPythonCode(getPythonCode("python-output"),"console-output")');
  for(const value of ['4','7']){
   const deadline=Date.now()+4000;let field;
   while(!(field=app.win.document.querySelector('#console-output .skulpt-input-field'))){if(Date.now()>deadline)throw new Error('No input prompt');await new Promise(resolve=>setTimeout(resolve,10));}
   field.value=value;field.dispatchEvent(new app.win.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  }
  await execution;
  assert.equal(app.evaluate('exerciseState.outputMatched'),true);
  assert.equal(app.evaluate('lastExerciseRun.stdout').trim(),'11');
  await app.evaluate('submitExercise()');
  const saved=app.records.find(row=>row.kind==='submission');
  assert.equal(saved.output.trim(),'11');assert.equal(saved.userId,'s1');assert.equal(saved.exerciseId,'sum');
  assert.notEqual(saved.processingTime,'0.45s');
 }finally{app.evaluate('stopLearningSync();SessionTimeout.stop();activePythonRuns.forEach(run=>run.cancel());');await new Promise(resolve=>setTimeout(resolve,20));app.dom.window.close();}
});
