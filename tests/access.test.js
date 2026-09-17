const test = require('node:test');
const assert = require('node:assert/strict');
const {canRead,canWrite,publicRecord} = require('../backend/access');
const student={_docId:'s1',role:'student',studentId:'2026-001',instructorId:'i1'};
const instructor={_docId:'i1',role:'instructor'};
test('students cannot read another student or their activity',()=>{
 assert.equal(canRead(student,'pseudopy_users',{_docId:'s2',role:'student'}),false);
 assert.equal(canRead(student,'pseudopy_activity',{userId:'s2',instructorId:'i1'}),false);
 assert.equal(canRead(student,'pseudopy_activity',{userId:'s1',instructorId:'i1'}),true);
});
test('instructors can only read their assigned students and activity',()=>{
 assert.equal(canRead(instructor,'pseudopy_users',{_docId:'s2',role:'student',instructorId:'i2'}),false);
 assert.equal(canRead(instructor,'pseudopy_users',{_docId:'s1',role:'student',instructorId:'i1'}),true);
 assert.equal(canRead(instructor,'pseudopy_activity',{userId:'s2',instructorId:'i2'}),false);
});
test('self profile writes cannot escalate role or reassign a student',()=>{
 assert.equal(canWrite(student,'pseudopy_users',student,{...student,role:'admin'},'PATCH'),false);
 assert.equal(canWrite(student,'pseudopy_users',student,{...student,instructorId:'i2'},'PATCH'),false);
 assert.equal(canWrite(student,'pseudopy_users',student,{...student,fullName:'New Name'},'PATCH'),true);
});
test('student cannot write records for another user or instructor',()=>{
 assert.equal(canWrite(student,'pseudopy_activity',null,{userId:'s2',instructorId:'i1'},'PUT'),false);
 assert.equal(canWrite(student,'pseudopy_activity',null,{userId:'s1',instructorId:'i2'},'PUT'),false);
 assert.equal(canWrite(student,'pseudopy_activity',null,{userId:'s1',instructorId:'i1'},'PUT'),true);
});
test('instructor cannot approve a device or another instructor recovery',()=>{
 assert.equal(canWrite(instructor,'pseudopy_devices',{userId:'i1',status:'pending'},{userId:'i1',status:'approved'},'PATCH'),false);
 assert.equal(canWrite(instructor,'pseudopy_passwordRequests',{instructorId:'i2',status:'pending'},{instructorId:'i2',status:'approved'},'PATCH'),false);
});
test('credentials and recovery proof never appear in API records',()=>{
 assert.deepEqual(publicRecord({_docId:'s1',password:'secret',passwordHash:'hash',passwordSalt:'salt',passwordScrypt:'x',proofHash:'proof',resetToken:'token'}),{_docId:'s1'});
});

test('canonical ownership cannot be bypassed using a duplicated enrolled ID',()=>{
 assert.equal(canRead(student,'pseudopy_activity',{userId:'s2',studentId:'2026-001'}),false);
 assert.equal(canRead({_docId:'s3',role:'student'},'pseudopy_exercises',{}),false);
});
