const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
test('metrics persist across reload and remain isolated between accounts',()=>{
 const storage = new Map();
 const context=vm.createContext({console:{log(){}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});
 vm.runInContext(read('metrics.js')+'\nglobalThis.metrics=metricsEngine;',context);
 context.metrics.setUser('s1');context.metrics.recordExecution(true);
 context.metrics.setUser('s2');assert.equal(context.metrics.executions.length,0);
 context.metrics.setUser('s1');assert.equal(context.metrics.executions.length,1);
 context.metrics.setUser(null);assert.equal(context.metrics.executions.length,0);
});
test('tutorial examples compile and execute with their advertised output',()=>{
 const context=vm.createContext({performance,console});
 vm.runInContext(read('mapper.js')+read('compiler.js')+read('learning.js')+'\nglobalThis.samples=beginnerExamples;globalThis.compiler=new PseudocodeCompiler();',context);
 for(const sample of context.samples){
  const compiled=context.compiler.compile(sample.pseudocode);assert.equal(compiled.valid,true,JSON.stringify(compiled.errors));
  const run=spawnSync('python3',['-I','-c','import builtins\n_read = builtins.input\nbuiltins.input = lambda prompt="": _read()\n'+compiled.python],{input:sample.input.join('\n')+'\n',encoding:'utf8',timeout:3000});
  assert.equal(run.status,0,run.stderr);assert.equal(run.stdout.trim(),sample.expected);
 }
});
