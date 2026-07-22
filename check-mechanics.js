require('dotenv').config();
const db = require('./src/config/db');
db.query("SELECT id, name, email, role, is_active FROM users ORDER BY id DESC LIMIT 20")
  .then(([rows]) => {
    console.log('All users:');
    rows.forEach(r => console.log(`  id=${r.id} name="${r.name}" role="${r.role}" active=${r.is_active}`));
    process.exit(0);
  })
  .catch(e => { console.error(e.message); process.exit(1); });
