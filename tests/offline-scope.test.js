const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('client compiler and vendored Skulpt translate and run with no network APIs',async()=>{
 const ctx=vm.createContext({console,performance,Date,Math,JSON,setTimeout,clearTimeout});
 for(const file of ['mapper.js','compiler.js','vendor/skulpt/skulpt.min.js','vendor/skulpt/skulpt-stdlib.js'])vm.runInContext(read(file),ctx);
 const result=vm.runInContext('new PseudocodeCompiler().compile("BEGIN\\nSET x TO 6 * 7\\nDISPLAY x\\nEND")',ctx);
 assert.equal(result.valid,true);let output='';
 ctx.Sk.configure({output:t=>{output+=t;},read:p=>ctx.Sk.builtinFiles.files[p],__future__:ctx.Sk.python3,execLimit:15000});
 await ctx.Sk.misceval.asyncToPromise(()=>ctx.Sk.importMainWithBody('<stdin>',false,result.python,true));
 assert.equal(output.trim(),'42');assert.equal(ctx.fetch,undefined);
});
test('every blocking service-worker cache asset exists in the checkout',()=>{
 const ctx=vm.createContext({self:{addEventListener(){}}});vm.runInContext(read('sw.js'),ctx);
 const assets=vm.runInContext('LOCAL_ASSETS',ctx);
 for(const asset of assets){const name=asset.split('?')[0];assert.ok(fs.existsSync(path.join(__dirname,'..',name==='./'?'index.html':name)),asset);}
 assert.ok(assets.includes('./vendor/skulpt/skulpt.min.js'));assert.ok(assets.includes('./vendor/skulpt/skulpt-stdlib.js'));
});
function importer(){
 const editor={value:''},messages=[];
 const ctx=vm.createContext({console,$id:()=>editor,showToast:message=>messages.push(message),pdfjsLib:{getDocument:()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({getTextContent:async()=>({items:[{str:'BEGIN',transform:[0,0,0,0,0,100]},{str:'DISPLAY 42',transform:[0,0,0,0,0,90]},{str:'END',transform:[0,0,0,0,0,80]}]})})})})}});
 vm.runInContext(read('src/app/file-import.js'),ctx);return{ctx,editor,messages};
}
test('TXT import reads the supplied file and PDF import invokes the extraction path',async()=>{
 const h=importer();await h.ctx.handleFileUpload({target:{files:[{name:'work.txt',type:'text/plain',text:async()=> 'BEGIN\nDISPLAY 42\nEND'}]}},'editor');assert.match(h.editor.value,/DISPLAY 42/);
 h.editor.value='';await h.ctx.handleFileUpload({target:{files:[{name:'work.pdf',type:'application/pdf',arrayBuffer:async()=>new ArrayBuffer(0)}]}},'editor');assert.equal(h.editor.value,'BEGIN\nDISPLAY 42\nEND');
});
test('DOCX promise is an explicit scope gap: unsupported input preserves the current editor',async()=>{
 const h=importer();h.editor.value='existing draft';await h.ctx.handleFileUpload({target:{files:[{name:'work.docx',type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}]}},'editor');
 assert.equal(h.editor.value,'existing draft');assert.match(h.messages[0],/Unsupported file type/);
});
