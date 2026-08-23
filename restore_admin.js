const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./pseudopy.sqlite');

const originalData = '{"_docId":"u1","id":"u1","fullName":"Mark Bautista","username":"mbautista_admin","email":"bautista@university.edu.ph","role":"admin","status":"active","createdAt":"2025-07-01T08:00:00.000Z","passwordHash":"13175a7460b30b5127569efeafacf0b96c3e7099b41ad4edec392c62aa9ef5b7","passwordSalt":"feecc97df148ded39ec347c55938cbd1","lastLogin":"2026-08-23T17:37:12.085Z"}';

db.serialize(() => {
  db.run("UPDATE pseudopy_users SET data = ? WHERE doc_id = 'u1'", [originalData], (err) => {
    if (err) throw err;
    console.log('Restored original admin user data');
    db.close();
  });
});
