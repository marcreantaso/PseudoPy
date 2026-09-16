'use strict';
const {createApp}=require('./server/http');
const {firestoreStore}=require('./server/store');
// Credentials belong on the server. There is deliberately no demo-data fallback.
let store;const durable={transact:fn=>(store||(store=firestoreStore())).transact(fn)};
const app=createApp(durable);
if(require.main===module)app.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('PseudoPy server ready'));
module.exports=app;
