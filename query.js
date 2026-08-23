const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./pseudopy.sqlite');

db.serialize(() => {
  db.all("SELECT id, username, role FROM pseudopy_users", (err, rows) => {
    if (err) {
      console.error(err);
    } else {
      console.log(rows);
    }
    db.close();
  });
});
