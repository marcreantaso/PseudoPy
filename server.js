const express = require('express');
const path = require('node:path');
const { handle } = require('./backend/service');
const app = express();
app.use(express.json({limit:'1mb'}));
app.get('/api/health', (req,res)=>res.json({status:'ok',storage:'Firestore',authenticationConfigured:!!process.env.SESSION_SECRET}));
app.all('/api/:collection/:id?', (req,res)=>handle(req,res,req.params.collection,req.params.id));
// Serve only public assets, never server code, credentials, seeds or datasets.
app.get(['/', '/index.html'], (req,res)=>res.sendFile(path.join(__dirname,'index.html')));
const files = new Set(['style.css','app.js','database.js','compiler.js','mapper.js','metrics.js','devtools.js','runtime.js','runtime-worker.js','learning.js','manifest.json','sw.js']);
app.get('/:file', (req,res,next)=>files.has(req.params.file) ? res.sendFile(path.join(__dirname,req.params.file)) : next());
app.use('/vendor', express.static(path.join(__dirname,'vendor')));
app.use('/icons', express.static(path.join(__dirname,'icons')));
if (require.main === module) app.listen(process.env.PORT || 3000,()=>console.log('PseudoPy: http://localhost:'+(process.env.PORT || 3000)));
module.exports = app;
