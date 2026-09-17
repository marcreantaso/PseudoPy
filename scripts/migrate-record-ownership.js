/* Dry-run by default. Backfills only unambiguous stable identifiers; never names. */
const {store}=require('../backend/service');
(async()=>{
 const apply=process.argv.includes('--apply');
 const database=store();
 const users=(await database.collection('pseudopy_users').get()).docs.map(d=>({...d.data(),_docId:d.id}));
 const snapshot=await database.collection('pseudopy_activity').get();
 let updated=0,unresolved=0,demo=0;
 for(const doc of snapshot.docs){
  const row=doc.data();
  if(doc.id.startsWith('act_sp_')){demo++;continue;}
  if(row.userId)continue;
  const matches=users.filter(u=>u.role==='student'&&[u._docId,u.id,u.studentId,u.username].filter(Boolean).some(id=>id===row.studentId || id===row.username));
  if(matches.length!==1){unresolved++;continue;}
  const user=matches[0];
  if(apply)await doc.ref.update({userId:user._docId,instructorId:user.instructorId || null});
  updated++;
 }
 console.log(JSON.stringify({mode:apply?'applied':'dry-run',ownershipRecords:updated,unresolved,excludedDemoRecords:demo}));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
