const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const BrowserWorker=require('./browser-worker.cjs');
const context=vm.createContext({Worker:BrowserWorker,setTimeout,clearTimeout,performance,console});
vm.runInContext(fs.readFileSync(path.join(root,'runtime.js'),'utf8'),context);
const run=(code,options)=>context.PythonRuntime.run(code,options);
test('actual Skulpt worker resumes multiple INPUTs and separates prompts from stdout',async()=>{
 const values=['4','7'],prompts=[];
 const result=await run('a=int(input("First: "))\nb=int(input("Second: "))\nprint(a+b)',{onInput:prompt=>{prompts.push(prompt);return values.shift()}}).done;
 assert.equal(result.stdout.trim(),'11');assert.deepEqual(prompts,['First: ','Second: ']);assert.equal(result.inputs.length,2);
});
test('actual runtime rejects invalid numeric input',async()=>{
 await assert.rejects(run('int(input())',{onInput:()=> 'hello'}).done,/ValueError/);
});
test('infinite loop terminates without blocking the main thread',async()=>{
 await assert.rejects(run('while True:\n    pass',{limitMs:500}).done,error=>error.code==='timeout');
});
test('waiting for input can be cancelled',async()=>{
 let ready;
 const waiting=new Promise(resolve=>ready=resolve);
 const execution=run('input()',{onInput:()=>{ready();return new Promise(()=>{})}});
 await waiting;execution.cancel();await assert.rejects(execution.done,error=>error.code==='cancelled');
});
test('parallel reference and learner executions retain independent state',async()=>{
 const [a,b]=await Promise.all([run('print("learner")').done,run('print("reference")').done]);
 assert.equal(a.stdout.trim(),'learner');assert.equal(b.stdout.trim(),'reference');
});
