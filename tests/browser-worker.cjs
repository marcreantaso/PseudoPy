const path=require('node:path');
const {Worker}=require('node:worker_threads');
const root=path.join(__dirname,'..');
class BrowserWorker {
 constructor(file){
  this.worker=new Worker(`
   const {parentPort,workerData}=require('node:worker_threads');
   const fs=require('node:fs'), vm=require('node:vm'), path=require('node:path');
   const sandbox={console,setTimeout,clearTimeout,performance,TextEncoder,TextDecoder,atob,btoa};
   sandbox.self=sandbox; sandbox.postMessage=data=>parentPort.postMessage(data);
   const context=vm.createContext(sandbox);
   sandbox.importScripts=(...files)=>files.forEach(file=>vm.runInContext(fs.readFileSync(path.join(workerData.root,file),'utf8'),context));
   vm.runInContext(fs.readFileSync(path.join(workerData.root,workerData.file),'utf8'),context);
   parentPort.on('message',data=>sandbox.onmessage({data}));
  `,{eval:true,workerData:{root,file}});
  this.worker.on('message',data=>this.onmessage?.({data}));
  this.worker.on('error',error=>this.onerror?.(error));
 }
 postMessage(data){this.worker.postMessage(data)}
 terminate(){this.worker.terminate()}
}
module.exports=BrowserWorker;
