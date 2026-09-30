// Run against a local static server. PLAYWRIGHT_MODULE and CHROMIUM_PATH can select installed tooling.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const before = process.argv.includes('--before');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:8765';
const output = path.resolve('docs/qa/sync-recovery');
const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
 const results=[];
 try {
 for(const width of [320,375,768])for(const theme of ['light','dark']) {
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'});
  const page=await context.newPage();
  await page.route('https://**/*',r=>r.abort());
  if(before)await page.route(base+'/**',route=>{
   const u=new URL(route.request().url()); const name=u.pathname==='/'?'index.html':u.pathname.slice(1);
   if(['index.html','style.css','app.js'].includes(name))return route.fulfill({body:execFileSync('git',['show','eae428d:'+name]),contentType:name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':'text/html'});
   return route.continue();
  });
  await page.goto(base);await page.waitForFunction(()=>typeof showApp==='function');
  await page.evaluate(theme=>{
   onbShouldAutoStart=()=>false;onbStop();hideBootSplash();
   currentUser={_docId:'qa_student',id:'qa_student',fullName:'QA Student',role:'student',status:'active'};
   showApp('write-pseudocode');document.documentElement.dataset.theme=theme;
   showOfflineSaveStatus('Working offline - saved on this device. Your changes will sync after access is restored.');
   showToast('Draft saved on this device.','info');
  },theme);
  await page.screenshot({animations:'disabled',path:path.join(output,`${before?'before':'after'}-${width}-${theme}.png`)});
  const notice=await page.locator('#offline-save-status').boundingBox();
  const toast=await page.locator('#toast-container').boundingBox();
  const dismiss=await page.locator('#offline-save-dismiss').boundingBox();
  const row={width,theme,noticeToastOverlap:overlap(notice,toast),dismissWidth:dismiss.width,dismissHeight:dismiss.height};
  if(!before){
   assert.equal(row.noticeToastOverlap,false);assert.ok(dismiss.width>=44&&dismiss.height>=44);
   await page.locator('#offline-save-retry').focus();await page.keyboard.press('Tab');
   assert.equal(await page.evaluate(()=>document.activeElement.id),'offline-save-dismiss');
   await page.keyboard.press('Escape');assert.equal(await page.locator('#offline-save-status').isVisible(),false);
   await page.evaluate(()=>{resetOfflineSaveStatusForTests();document.getElementById('app-status-region').dir='rtl';showSyncNotice('رسالة محفوظة على هذا الجهاز '+ 'LongUnbrokenMessage'.repeat(30));showReconnectingStatus();});
   const banner=await page.locator('#connection-status-banner').boundingBox();
   const longNotice=await page.locator('#offline-save-status').boundingBox();
   const longToast=await page.locator('#toast-container').boundingBox();
   assert.equal(overlap(banner,longNotice),false);assert.equal(overlap(banner,longToast),false);assert.equal(overlap(longNotice,longToast),false);
   assert.ok(longNotice.x>=0&&longNotice.x+longNotice.width<=width+1);

   assert.equal(await page.evaluate(()=>document.getElementById('offline-save-status').scrollWidth<=document.getElementById('offline-save-status').clientWidth+1),true);
   await page.screenshot({animations:'disabled',path:path.join(output,`after-${width}-${theme}-rtl.png`)});
   await page.evaluate(()=>{navigateTo('student-settings');navigateTo('write-pseudocode');});
   assert.equal(await page.locator('#offline-save-status').count(),1);
   await page.evaluate(()=>{currentUser={_docId:'qa_admin',role:'admin',fullName:'QA Admin'};showApp();});
   assert.equal(await page.locator('#offline-save-status').isVisible(),false);
   row.keyboardEscape=true;row.longRTL=true;row.roleSwitch=true;
  }
  results.push(row);await context.close();
 }
 fs.writeFileSync(path.join(output,`${before?'before':'after'}-layout.json`),JSON.stringify(results,null,2));console.log(results);
 }finally{await browser.close();}
})();
