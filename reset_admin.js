const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./pseudopy.sqlite');

db.serialize(() => {
  db.get("SELECT data FROM pseudopy_users WHERE doc_id = 'u1'", (err, row) => {
    if (err) throw err;
    let data = JSON.parse(row.data);
    data.password = 'admin123';
    data.passwordHash = '0eeff70aacc1bee0bdb6c1feac723aa03b5bec429f115d8eaadafc379d435cc7'; // just in case
    db.run("UPDATE pseudopy_users SET data = ? WHERE doc_id = 'u1'", [JSON.stringify(data)], (err) => {
      if (err) throw err;
      console.log('Updated admin user');
      db.close();
    });
  });
});
