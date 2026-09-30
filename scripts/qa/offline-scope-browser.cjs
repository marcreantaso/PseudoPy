const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:8765';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 const page=await context.newPage();const result={};
 try{
  // No production Firebase/third-party requests are allowed from the page.
  await context.route('https://**/*',r=>r.abort());
  await page.goto(base);await page.waitForFunction(()=>typeof showApp==='function');
  await page.evaluate(()=>{onbShouldAutoStart=()=>false;onbStop();hideBootSplash();});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{},{timeout:60000});
  result.cache=await page.evaluate(async()=>({names:await caches.keys(),skulpt:!!(await caches.match('./vendor/skulpt/skulpt.min.js')),stdlib:!!(await caches.match('./vendor/skulpt/skulpt-stdlib.js'))}));
  assert.ok(result.cache.skulpt&&result.cache.stdlib);
  await page.evaluate(()=>{
   const user={_docId:'qa_offline_student',id:'qa_offline_student',username:'qa_student',role:'student',fullName:'QA Student',status:'active'};
   setLocalCollection(usersRef,[user]);currentUser=user;saveSession(user);showApp('write-pseudocode');
  });
  await context.setOffline(true);
  await page.reload();await page.waitForFunction(()=>typeof currentUser!=='undefined'&&currentUser&&currentUser.role==='student');
  result.offlineBoot=await page.evaluate(()=>!navigator.onLine&&!document.getElementById('app-layout').classList.contains('hidden'));
  assert.equal(result.offlineBoot,true);
  await page.evaluate(()=>{onbStop();onbShouldAutoStart=()=>false;document.getElementById('pseudocode-editor').value='BEGIN\nSET x TO 6 * 7\nDISPLAY x\nEND';translatePseudocode();executePython();});
  await page.waitForFunction(()=>document.getElementById('console-output').textContent.trim()==='42');
  result.offlineRun=await page.locator('#console-output').innerText();
  result.realSkulpt=await page.evaluate(()=>typeof Sk!=='undefined');assert.equal(result.realSkulpt,true);
  await page.evaluate(async()=>{try{await dbSet('qa_local_work','draft',{answer:42});}catch(e){if(!e.localOnly)throw e;}});
  await page.reload();await page.waitForFunction(()=>typeof currentUser!=='undefined'&&currentUser&&currentUser.role==='student');
  result.retained=await page.evaluate(async()=>({draft:document.getElementById('pseudocode-editor').value,local:getLocalCollection('qa_local_work')[0],queue:(await listAllMutations()).filter(r=>r.collection==='qa_local_work').length}));
  assert.match(result.retained.draft,/6 \* 7/);assert.equal(result.retained.local.answer,42);assert.equal(result.retained.queue,1);
  result.roles=[];
  for(const role of ['student','instructor','admin']){
   const evidence=await page.evaluate(role=>{
    onbStop();currentUser={_docId:'qa_'+role,role,fullName:'QA '+role,status:'active'};showApp();
    const defaultPage=currentPage;
    const forbidden=role==='admin'?'write-pseudocode':'developer-options';navigateTo(forbidden);
    return {role,defaultPage,currentPage,forbidden,visibleNav:[...document.querySelectorAll('.sidebar-nav > div')].filter(e=>!e.classList.contains('hidden')).map(e=>e.id),visiblePages:[...document.querySelectorAll('.page-view')].filter(e=>!e.classList.contains('hidden')).map(e=>e.id)};
   },role);
   assert.equal(evidence.currentPage,evidence.defaultPage);assert.equal(evidence.visibleNav.length,1);assert.equal(evidence.visibleNav[0],'nav-'+role);assert.equal(evidence.visiblePages.length,1);result.roles.push(evidence);
  }
  await page.evaluate(()=>{currentUser={_docId:'qa_offline_student',role:'student',fullName:'QA Student'};showApp('write-pseudocode');onbStop();});
  await page.screenshot({path:'docs/qa/sync-recovery/offline-student.png',animations:'disabled'});
  result.environment={browser:browser.version(),network:'Playwright context.setOffline(true)',hosting:'Python static HTTP server; no Express/API server',auth:'synthetic local profiles; authorization backend not exercised'};
  fs.writeFileSync(path.resolve('docs/qa/sync-recovery/offline-browser.json'),JSON.stringify(result,null,2));console.log(result);
 }finally{await browser.close();}
})();
