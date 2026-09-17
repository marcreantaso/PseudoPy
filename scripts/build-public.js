const fs = require('node:fs');
const path = require('node:path');
const output = path.join(__dirname,'..','public');
fs.mkdirSync(output,{recursive:true});
const files = ['index.html','style.css','app.js','database.js','compiler.js','mapper.js','metrics.js','devtools.js','runtime.js','runtime-worker.js','learning.js','manifest.json','sw.js'];
for(const file of files) fs.copyFileSync(path.join(__dirname,'..',file),path.join(output,file));
for(const dir of ['icons','vendor']) fs.cpSync(path.join(__dirname,'..',dir),path.join(output,dir),{recursive:true});
